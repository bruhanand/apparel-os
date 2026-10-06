import { createApiClient, defineRoute, errorEnvelopeSchema } from '@apparel-os/schemas';
import { Controller, createParamDecorator, Inject, type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ApiRefusal,
  ApiRoute,
  COMMAND_RUNNER,
  CommandRunnerModule,
  commandAnswer,
  configureApp,
  correlationIdOf,
  IDEMPOTENCY_HELPER,
  IdempotencyModule,
  KernelModule,
  HTTP_ENVIRONMENT,
  ORGANISATION_ROUTER,
  OrganisationRoutingModule,
  requestContentOf,
  ROUTING_ENVIRONMENT,
  RouteInput,
  type HttpRequest,
  type IdempotencyHelper,
  type OrganisationRouter,
  type RouteInputOf,
} from '../src/kernel/index.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';

// S1-F01-T04: a command sent through the API under one idempotency key (code-house-rules 12.2 to 12.4; PRD-INT-002).
// The route below is a test-only harness route, composed only into this test application (code-house-rules 11.4):
// it takes its Organisation and actor from SYNTHETIC test headers, which no real
// route reads. syn_api.effect is a scratch table made by test setup only to count effects (code-house-rules 11.1).

const ACTOR = '01900000-0000-7000-8000-0000000ba001';
const RECORD = '01900000-0000-7000-8000-0000000bd001';
/** A synthetic pool size for these tests; the real one is each environment's AOS_DATABASE_POOL_MAX. */
const SYNTHETIC_POOL_MAX = '4';
/** The SYNTHETIC own origin of this test application (AOS_PUBLIC_ORIGIN; code-house-rules 12.1). */
const SYNTHETIC_ORIGIN = 'http://synthetic.localhost';

const harnessRoutes = {
  record: defineRoute({
    method: 'POST',
    path: '/api/synthetic/records/{id}/notes',
    params: z.strictObject({ id: z.uuid() }),
    access: { kind: 'own' },
    command: true,
    body: z.strictObject({ note: z.string().min(1) }),
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: z.strictObject({ id: z.uuid(), state: z.literal('Recorded') }),
    codes: [],
  }),
};

// The raw request, for the SYNTHETIC test headers.
const RequestOf = createParamDecorator((_data: unknown, context) => context.switchToHttp().getRequest<HttpRequest>());

@Controller()
class HarnessController {
  constructor(
    @Inject(ORGANISATION_ROUTER) private readonly router: OrganisationRouter,
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
  ) {}

  @ApiRoute(harnessRoutes.record)
  async record(@RouteInput() input: RouteInputOf<typeof harnessRoutes.record>, @RequestOf() request: HttpRequest) {
    const code = request.headers['x-syn-organisation'];
    const routed = typeof code === 'string' ? await this.router.resolveForSignIn(code) : undefined;
    if (routed?.routed !== true)
      throw new ApiRefusal({ kind: 'not-signed-in', code: 'kernel.synthetic-not-signed-in' });
    const answer = await this.helper.run(
      {
        commandName: 'kernel.synthetic-record-note',
        organisation: routed.organisation,
        correlationId: correlationIdOf(request) ?? '',
        actor: { kind: 'actor', actorId: ACTOR },
      },
      {
        key: input.idempotencyKey,
        content: requestContentOf(harnessRoutes.record, input),
        authoriseReplay: () => Promise.resolve({ kind: 'allowed' }),
        work: async (context) => {
          await context.tx.execute(sql`insert into syn_api.effect (note) values (${input.body.note})`);
          return { kind: 'success', answer: { id: input.params.id, state: 'Recorded' }, shows: 'nothing' };
        },
      },
    );
    return commandAnswer(answer);
  }
}

let world: SyntheticWorld;
let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  world = await createSyntheticOrganisations('api');
  for (const organisation of world.organisations) {
    const owner = await connect(organisation.database, 'migration');
    try {
      await owner.query(`
        create schema syn_api;
        grant usage on schema syn_api to aos_runtime;
        create table syn_api.effect (id serial primary key, note text not null);
        grant select, insert on syn_api.effect to aos_runtime;
        grant usage on sequence syn_api.effect_id_seq to aos_runtime;`);
    } finally {
      await owner.end();
    }
  }
  @Module({
    imports: [KernelModule, OrganisationRoutingModule, CommandRunnerModule, IdempotencyModule],
    controllers: [HarnessController],
  })
  class HarnessModule {}
  const moduleRef = await Test.createTestingModule({ imports: [HarnessModule] })
    .overrideProvider(ROUTING_ENVIRONMENT)
    .useValue({
      AOS_RUNTIME_DATABASE_URL: databaseUrl(world.directory, 'runtime'),
      AOS_DATABASE_POOL_MAX: SYNTHETIC_POOL_MAX,
    })
    .overrideProvider(HTTP_ENVIRONMENT)
    .useValue({ AOS_PUBLIC_ORIGIN: SYNTHETIC_ORIGIN, AOS_TRUSTED_PROXY_HOPS: '0' })
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
  expect(app.get(COMMAND_RUNNER)).toBeDefined();
});

afterAll(async () => {
  await (app as INestApplication | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

async function effects(note: string): Promise<number> {
  const client = await connect(world.organisations[0].database, 'migration');
  try {
    return (await client.query('select 1 from syn_api.effect where note = $1', [note])).rows.length;
  } finally {
    await client.end();
  }
}

function client() {
  return createApiClient(harnessRoutes, {
    baseUrl,
    fetch: (url, init) =>
      fetch(url, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          origin: SYNTHETIC_ORIGIN,
          'x-syn-organisation': world.organisations[0].code,
        },
      }),
  });
}

describe('a command through the API (code-house-rules 12.4)', () => {
  it('PRD-INT-002 the same command sent twice with one key has one effect, and the second answer is the replay', async () => {
    const note = `SYNTHETIC ${crypto.randomUUID()}`;
    const first = await client().call('record', { params: { id: RECORD }, body: { note } });
    const second = await client().call('record', {
      params: { id: RECORD },
      body: { note },
      idempotencyKey: first.idempotencyKey,
    });
    expect(first).toMatchObject({ ok: true, replayed: false, data: { id: RECORD, state: 'Recorded' } });
    expect(second).toMatchObject({ ok: true, replayed: true, data: { id: RECORD, state: 'Recorded' } });
    expect(await effects(note)).toBe(1);
  });

  it('PRD-INT-002 a write without a key is refused and has no effect', async () => {
    const note = `SYNTHETIC ${crypto.randomUUID()}`;
    const response = await fetch(`${baseUrl}/api/synthetic/records/${RECORD}/notes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: SYNTHETIC_ORIGIN,
        'x-syn-organisation': world.organisations[0].code,
      },
      body: JSON.stringify({ note }),
    });
    expect(response.status).toBe(400);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('kernel.idempotency-key-required');
    expect(await effects(note)).toBe(0);
  });

  it('PRD-INT-002 the same key with changed content is a conflict in the envelope, and has no second effect', async () => {
    const note = `SYNTHETIC ${crypto.randomUUID()}`;
    const first = await client().call('record', { params: { id: RECORD }, body: { note } });
    const changed = await client().call('record', {
      params: { id: RECORD },
      body: { note: `${note} changed` },
      idempotencyKey: first.idempotencyKey,
    });
    expect(changed).toMatchObject({
      ok: false,
      status: 409,
      error: { kind: 'conflict', code: 'kernel.idempotency-key-reused' },
    });
    expect(await effects(note)).toBe(1);
    expect(await effects(`${note} changed`)).toBe(0);
  });
});
