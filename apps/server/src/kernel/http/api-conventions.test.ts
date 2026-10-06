import { Writable } from 'node:stream';
import { defineRoute, errorEnvelopeSchema } from '@apparel-os/schemas';
import { Controller, type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CommandOutcomeUnknown, CommandTimedOut } from '../command-runner/command-errors.js';
import { CORRELATION_ID_HEADER } from '../command-runner/correlation.js';
import { IdempotencyConflict } from '../idempotency/idempotency-errors.js';
import { KernelModule } from '../kernel.module.js';
import { LOGGER } from '../logging/logging.module.js';
import { PinoLoggerService } from '../logging/pino-logger.service.js';
import { ApiRefusal } from './api-refusal.js';
import { ApiRoute, routeAnswer, RouteInput, type RouteInputOf } from './api-route.js';
import { configureApp } from './configure-app.js';

// S1-F01-T04: the API conventions in code (code-house-rules 12.1 to 12.3, 12.11), on a synthetic controller that
// reaches no database. Every value here is SYNTHETIC.

const ID = '01900000-0000-7000-8000-000000000a01';
const KEY = '01900000-0000-7000-8000-000000000a02';

const syntheticRoutes = {
  echo: defineRoute({
    method: 'POST',
    path: '/api/synthetic/{id}/echo',
    params: z.strictObject({ id: z.uuid() }),
    access: { kind: 'own' },
    command: true,
    body: z.strictObject({ note: z.string().min(3), lines: z.array(z.strictObject({ sku: z.string().min(1) })) }),
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: z.strictObject({ id: z.uuid(), note: z.string(), key: z.uuid() }),
    codes: [],
  }),
  behave: defineRoute({
    method: 'GET',
    path: '/api/synthetic/behave',
    query: z.strictObject({ as: z.string() }),
    access: { kind: 'own' },
    command: false,
    response: z.strictObject({ id: z.uuid() }),
    codes: [],
  }),
};

@Controller()
class SyntheticController {
  @ApiRoute(syntheticRoutes.echo)
  echo(@RouteInput() input: RouteInputOf<typeof syntheticRoutes.echo>) {
    return routeAnswer(
      { id: input.params.id, note: input.body.note, key: input.idempotencyKey },
      { replayed: input.body.note === 'replayed' },
    );
  }

  @ApiRoute(syntheticRoutes.behave)
  behave(@RouteInput() input: RouteInputOf<typeof syntheticRoutes.behave>): unknown {
    switch (input.query.as) {
      case 'refused':
        throw new ApiRefusal({
          kind: 'refused',
          code: 'kernel.synthetic-rule',
          missing: [{ kind: 'record', id: ID }],
          next: 'kernel.read-again',
        });
      case 'replayed-refusal':
        throw new ApiRefusal({ kind: 'refused', code: 'kernel.synthetic', missing: [], replayed: true });
      case 'timed-out':
        throw new CommandTimedOut('lock', '55P03', ID);
      case 'unknown':
        throw new CommandOutcomeUnknown(ID);
      case 'reused':
        throw new IdempotencyConflict('kernel.idempotency-key-reused', ID);
      case 'mismatch':
        return { id: ID, secretHolding: 'SYNTHETIC-LEAK' };
      case 'crash':
        throw new Error('SYNTHETIC database said something it should not');
      default:
        return { id: ID };
    }
  }
}

@Module({ imports: [KernelModule], controllers: [SyntheticController] })
class SyntheticModule {}

const logLines: Record<string, unknown>[] = [];
const logger = new PinoLoggerService(
  pino(
    new Writable({
      write(chunk: Buffer, _encoding, done) {
        for (const line of chunk.toString('utf8').split('\n')) {
          if (line !== '') logLines.push(JSON.parse(line) as Record<string, unknown>);
        }
        done();
      },
    }),
  ),
);

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [SyntheticModule] })
    .overrideProvider(LOGGER)
    .useValue(logger)
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

function echo(body: unknown, headers: Record<string, string> = { 'Idempotency-Key': KEY }, id = ID) {
  return fetch(`${baseUrl}/api/synthetic/${id}/echo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function envelope(response: Response): Promise<z.infer<typeof errorEnvelopeSchema>['error']> {
  const parsed = errorEnvelopeSchema.parse(await response.json());
  // code-house-rules 12.3: the reference is the request's correlation identifier.
  expect(parsed.error.reference).toBe(response.headers.get(CORRELATION_ID_HEADER));
  return parsed.error;
}

const behave = (as: string) => fetch(`${baseUrl}/api/synthetic/behave?as=${as}`);

describe('inputs (code-house-rules 12.2 "Every input parsed")', () => {
  it('parses the path parameters, the body and the key before the handler runs', async () => {
    const response = await echo({ note: 'SYNTHETIC', lines: [] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: ID, note: 'SYNTHETIC', key: KEY });
    expect(response.headers.get('Idempotent-Replayed')).toBeNull();
  });

  it('PRD-SEC-006 answers a body that fails its schema as invalid, with paths and issue codes and never the input', async () => {
    const response = await echo({ note: 'SY', lines: [{ sku: '' }] });
    expect(response.status).toBe(400);
    const error = await envelope(response);
    expect(error).toMatchObject({ kind: 'invalid', code: 'kernel.invalid-request' });
    expect(error.issues).toEqual([
      { path: ['body', 'note'], code: 'too_small' },
      { path: ['body', 'lines', 0, 'sku'], code: 'too_small' },
    ]);
    expect(JSON.stringify(error)).not.toContain('SY"');
  });

  it('refuses a field the schema does not name', async () => {
    const response = await echo({ note: 'SYNTHETIC', lines: [], extra: 'SYNTHETIC-EXTRA' });
    expect(response.status).toBe(400);
    const error = await envelope(response);
    expect(error.issues).toEqual([{ path: ['body'], code: 'unrecognized_keys' }]);
    expect(JSON.stringify(error)).not.toContain('SYNTHETIC-EXTRA');
  });

  it('refuses a path parameter and a query that fail their schemas', async () => {
    const badId = await echo({ note: 'SYNTHETIC', lines: [] }, undefined, 'not-a-uuid');
    expect(await envelope(badId)).toMatchObject({
      kind: 'invalid',
      issues: [{ path: ['params', 'id'], code: 'invalid_format' }],
    });
    const noQuery = await fetch(`${baseUrl}/api/synthetic/behave`);
    expect(await envelope(noQuery)).toMatchObject({
      kind: 'invalid',
      issues: [{ path: ['query', 'as'], code: 'invalid_type' }],
    });
  });

  it('answers a body that is not JSON as invalid, never with the parser message', async () => {
    const response = await echo('{"note": SYNTHETIC-BROKEN');
    expect(response.status).toBe(400);
    const error = await envelope(response);
    expect(error).toEqual({ kind: 'invalid', code: 'kernel.invalid-request', reference: error.reference });
  });

  it('PRD-INT-002 refuses a command without an Idempotency-Key, or with one that is not a UUID', async () => {
    for (const headers of [{}, { 'Idempotency-Key': 'SYNTHETIC-not-a-uuid' }]) {
      const response = await echo({ note: 'SYNTHETIC', lines: [] }, headers);
      expect(response.status).toBe(400);
      expect(await envelope(response)).toMatchObject({ kind: 'invalid', code: 'kernel.idempotency-key-required' });
    }
  });
});

describe('answers (code-house-rules 12.1, 12.2 "Every answer checked", 12.4)', () => {
  it('PRD-SEC-006 carries Cache-Control: no-store on every answer, success or not', async () => {
    expect((await behave('ok')).headers.get('Cache-Control')).toBe('no-store');
    expect((await behave('refused')).headers.get('Cache-Control')).toBe('no-store');
    expect((await fetch(`${baseUrl}/api/nothing-here`)).headers.get('Cache-Control')).toBe('no-store');
  });

  it('PRD-INT-002 marks a replayed answer with Idempotent-Replayed: true', async () => {
    const response = await echo({ note: 'replayed', lines: [] });
    expect(response.headers.get('Idempotent-Replayed')).toBe('true');
    const refusal = await behave('replayed-refusal');
    expect(refusal.headers.get('Idempotent-Replayed')).toBe('true');
  });

  it('PRD-SEC-006 fails an answer its schema does not match, sending nothing of it, and logs the path but no value', async () => {
    const response = await behave('mismatch');
    expect(response.status).toBe(500);
    const error = await envelope(response);
    expect(error).toEqual({ kind: 'failed', code: 'kernel.failed', reference: error.reference });
    const lines = logLines.filter((line) => line.correlationId === error.reference);
    expect(JSON.stringify(lines)).not.toContain('SYNTHETIC-LEAK');
    expect(lines).toContainEqual(
      expect.objectContaining({ route: '/api/synthetic/behave', issues: [{ path: [], code: 'unrecognized_keys' }] }),
    );
  });
});

describe('the error envelope (code-house-rules 12.3)', () => {
  it.each([
    [
      'refused',
      422,
      {
        kind: 'refused',
        code: 'kernel.synthetic-rule',
        missing: [{ kind: 'record', id: ID }],
        next: 'kernel.read-again',
      },
    ],
    ['timed-out', 503, { kind: 'timed-out', code: 'kernel.timed-out' }],
    ['unknown', 500, { kind: 'failed', code: 'kernel.outcome-unknown' }],
    ['reused', 409, { kind: 'conflict', code: 'kernel.idempotency-key-reused' }],
    ['crash', 500, { kind: 'failed', code: 'kernel.failed' }],
  ])('PRD-UXP-003 answers %s with status %i and the envelope', async (as, status, expected) => {
    const response = await behave(as);
    expect(response.status).toBe(status);
    const error = await envelope(response);
    expect(error).toEqual({ ...expected, reference: error.reference });
  });

  it('PRD-SEC-006 says nothing of the cause of an unexpected failure, in the answer or the log', async () => {
    const response = await behave('crash');
    const error = await envelope(response);
    expect(JSON.stringify(error)).not.toContain('database said');
    expect(JSON.stringify(logLines)).not.toContain('database said');
    expect(logLines).toContainEqual(
      expect.objectContaining({ correlationId: error.reference, level: 50, errorName: 'Error' }),
    );
  });

  it('answers a path no route has as not-found, in the envelope', async () => {
    const response = await fetch(`${baseUrl}/api/nothing-here`);
    expect(response.status).toBe(404);
    expect(await envelope(response)).toMatchObject({ kind: 'not-found', code: 'kernel.not-found' });
  });
});

describe('the request log (code-house-rules 12.11)', () => {
  it('PRD-SEC-014 writes one line when a request ends: method, route template, status, code, duration; no query or body', async () => {
    const response = await behave('refused');
    const reference = response.headers.get(CORRELATION_ID_HEADER);
    const ended = logLines.filter((line) => line.correlationId === reference && line.msg === 'Request ended');
    expect(ended).toEqual([
      expect.objectContaining({
        method: 'GET',
        route: '/api/synthetic/behave',
        status: 422,
        code: 'kernel.synthetic-rule',
        durationMs: expect.any(Number) as unknown,
        level: 30,
      }),
    ]);
    expect(JSON.stringify(ended)).not.toContain('as=refused');
  });
});

describe('every route declares its contract (code-house-rules 12.1 "Access on every route")', () => {
  it('PRD-SEC-005 refuses to start an application with a route the route table does not declare', async () => {
    const { Get } = await import('@nestjs/common');
    @Controller('undeclared')
    class UndeclaredController {
      @Get()
      get(): string {
        return 'SYNTHETIC';
      }
    }
    @Module({ imports: [KernelModule], controllers: [UndeclaredController] })
    class UndeclaredModule {}
    const moduleRef = await Test.createTestingModule({ imports: [UndeclaredModule] })
      .overrideProvider(LOGGER)
      .useValue(logger)
      .compile();
    const undeclared = moduleRef.createNestApplication({ logger: false });
    configureApp(undeclared);
    await expect(undeclared.init()).rejects.toThrow(/UndeclaredController\.get/);
    await undeclared.close();
  });
});
