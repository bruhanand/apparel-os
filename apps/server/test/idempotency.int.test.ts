import { Writable } from 'node:stream';
import { Secret } from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandOutcomeUnknown,
  CommandRunner,
  CommandTimedOut,
  IdempotencyConflict,
  IdempotencyHelper,
  newCorrelationId,
  OrganisationRouter,
  PinoLoggerService,
  timezoneNotConfigured,
  type CommandRequest,
  type IdempotentAnswer,
  type IdempotentCommand,
  type JsonValue,
  type ReplayAuthorisation,
  type ReplaySecretCheck,
  type RequestContent,
  type RestrictedValueCipher,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';
import { gate, interceptingCommit, terminateBackend, waitUntilAnyWaitingForLock } from './support/transactions.js';

// S1-F01-T04: the idempotency helper (code-house-rules 12.4 to 12.6; module-map 6.1 step 2; PRD-INT-002, PRD-INT-003,
// PRD-INT-004; DEC-113, DEC-114; CH-8, CH-14). Every command runs as the runtime role through Organisation routing,
// as the application does (code-house-rules 10.1). syn_idem.effect is a scratch table made by test setup as the
// migration role, only to count a command's effects (code-house-rules 11.1); it is no part of any migration set.

// SYNTHETIC identifiers of this file only.
const ACTOR_A = '01900000-0000-7000-8000-0000000fa001';
const ACTOR_B = '01900000-0000-7000-8000-0000000fa002';
const CREDENTIAL = '01900000-0000-7000-8000-0000000fc001';
const RECORD = '01900000-0000-7000-8000-0000000fd001';
/** A synthetic pool size for these tests; the real one is each environment's AOS_DATABASE_POOL_MAX. */
const SYNTHETIC_POOL_MAX = 6;
const OPERATION = 'kernel.synthetic-idempotent-command';

const SCRATCH = `
  create schema syn_idem;
  grant usage on schema syn_idem to aos_runtime;
  create table syn_idem.effect (id serial primary key, tag text not null);
  grant select, insert on syn_idem.effect to aos_runtime;
  grant usage on sequence syn_idem.effect_id_seq to aos_runtime;
  -- A deferred check that locks a row at COMMIT, so a test can make COMMIT itself wait for a lock.
  create table syn_idem.blocker (id int primary key);
  insert into syn_idem.blocker values (1);
  grant select, update on syn_idem.blocker to aos_runtime;
  create table syn_idem.at_commit (id serial primary key);
  grant insert on syn_idem.at_commit to aos_runtime;
  grant usage on sequence syn_idem.at_commit_id_seq to aos_runtime;
  create function syn_idem.lock_at_commit() returns trigger
    language plpgsql
    set search_path = pg_catalog
  as $$
  begin
    perform 1 from syn_idem.blocker where id = 1 for no key update;
    return null;
  end;
  $$;
  revoke execute on function syn_idem.lock_at_commit() from public;
  create constraint trigger lock_at_commit after insert on syn_idem.at_commit
    deferrable initially deferred for each row execute function syn_idem.lock_at_commit();
`;

let world: SyntheticWorld;
let databaseA: string;
let router: OrganisationRouter;
let routedA: RoutedOrganisation;
let routedB: RoutedOrganisation;
const logLines: string[] = [];

beforeAll(async () => {
  world = await createSyntheticOrganisations('idem');
  databaseA = world.organisations[0].database;
  for (const organisation of world.organisations) {
    const owner = await connect(organisation.database, 'migration');
    try {
      await owner.query(SCRATCH);
    } finally {
      await owner.end();
    }
  }
  router = openRouter(SYNTHETIC_POOL_MAX);
  routedA = await routed(router, world.organisations[0].code);
  routedB = await routed(router, world.organisations[1].code);
});

afterAll(async () => {
  await (router as OrganisationRouter | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

function openRouter(poolMax: number): OrganisationRouter {
  return new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax },
    logger(),
  );
}

async function routed(from: OrganisationRouter, code: string): Promise<RoutedOrganisation> {
  const result = await from.resolveForSignIn(code);
  if (!result.routed) throw new Error(`${code} was not routed`);
  return result.organisation;
}

function logger(): PinoLoggerService {
  return new PinoLoggerService(
    pino(
      new Writable({
        write(chunk: Buffer, _encoding, done) {
          logLines.push(
            ...chunk
              .toString('utf8')
              .split('\n')
              .filter((line) => line !== ''),
          );
          done();
        },
      }),
    ),
  );
}

/** A synthetic cipher: marks the value as encrypted without holding it, so a test can see it was never kept plain. */
const syntheticCipher: RestrictedValueCipher = {
  encrypt: (_organisationCode, fieldClass) =>
    Promise.resolve({ scheme: 'syn-test-1', ciphertext: `SYNTHETIC-ciphertext-of-${fieldClass}` }),
};

function helper(secretCheck: ReplaySecretCheck = { compare: () => Promise.resolve('not-comparable') }) {
  const runner = new CommandRunner({
    clock: { now: () => new Date('2026-10-06T10:00:00Z') },
    timezones: timezoneNotConfigured,
    logger: logger(),
  });
  return new IdempotencyHelper({ runner, logger: logger(), secretCheck, cipher: syntheticCipher });
}

function request(
  organisation: RoutedOrganisation = routedA,
  actorId = ACTOR_A,
  correlationId = newCorrelationId(),
): CommandRequest {
  return { commandName: OPERATION, organisation, correlationId, actor: { kind: 'actor', actorId } };
}

const allowReplay: ReplayAuthorisation = () => Promise.resolve({ kind: 'allowed' });

function content(body: unknown, extra: Partial<RequestContent> = {}): RequestContent {
  return { pathParameters: {}, body, secretFields: [], restrictedFields: [], ...extra };
}

async function writeEffect(context: TransactionContext, tag: string): Promise<void> {
  await context.tx.execute(sql`insert into syn_idem.effect (tag) values (${tag})`);
}

async function effects(tag: string, database = databaseA): Promise<number> {
  const client = await connect(database, 'migration');
  try {
    const result = await client.query('select 1 from syn_idem.effect where tag = $1', [tag]);
    return result.rows.length;
  } finally {
    await client.end();
  }
}

async function conflictsKept(key: string): Promise<{ reason: string; request_form: unknown }[]> {
  const client = await connect(databaseA, 'migration');
  try {
    const result = await client.query<{ reason: string; request_form: unknown }>(
      `select c.reason, c.request_form from kernel.idempotency_conflict c
       join kernel.idempotency_key k on k.id = c.idempotency_key_id
       where k.idempotency_key = $1 order by c.recorded_at`,
      [key],
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

/** A command that writes one effect tagged `tag` and answers the record it made. */
function effectCommand(
  key: string,
  tag: string,
  body: unknown = { note: 'SYNTHETIC' },
  extra: Partial<IdempotentCommand<JsonValue>> = {},
): IdempotentCommand<JsonValue> {
  return {
    key,
    content: content(body),
    authoriseReplay: allowReplay,
    work: async (context) => {
      await writeEffect(context, tag);
      return { kind: 'success', answer: { id: RECORD, state: 'Draft' }, shows: 'nothing' };
    },
    ...extra,
  };
}

const newKey = (): string => newCorrelationId();
const newTag = (): string => `SYNTHETIC ${newCorrelationId()}`;

async function failureOf(run: Promise<unknown>): Promise<unknown> {
  return run.then(
    () => {
      throw new Error('Expected the command to fail, and it succeeded');
    },
    (error: unknown) => error,
  );
}

describe('a replay (code-house-rules 12.4 "Replay")', () => {
  it('PRD-INT-002 the same key and content has one effect and gets the first answer, marked replayed', async () => {
    const key = newKey();
    const tag = newTag();
    const first = await helper().run(request(), effectCommand(key, tag));
    const second = await helper().run(request(), effectCommand(key, tag));
    expect(first).toEqual({ kind: 'success', answer: { id: RECORD, state: 'Draft' }, replayed: false });
    expect(second).toEqual({ kind: 'success', answer: { id: RECORD, state: 'Draft' }, replayed: true });
    expect(await effects(tag)).toBe(1);
  });

  it('PRD-INT-002 a key belongs to one actor and one Organisation: another actor or Organisation runs its own', async () => {
    const key = newKey();
    const tag = newTag();
    await helper().run(request(routedA, ACTOR_A), effectCommand(key, tag));
    const otherActor = await helper().run(request(routedA, ACTOR_B), effectCommand(key, tag));
    const otherOrganisation = await helper().run(request(routedB, ACTOR_A), effectCommand(key, tag));
    expect(otherActor).toMatchObject({ kind: 'success', replayed: false });
    expect(otherOrganisation).toMatchObject({ kind: 'success', replayed: false });
    expect(await effects(tag)).toBe(2);
    expect(await effects(tag, world.organisations[1].database)).toBe(1);
  });

  it('PRD-INT-001 CH-14 a replay is answered only after its access checks pass now, and never runs the command', async () => {
    const key = newKey();
    const tag = newTag();
    await helper().run(request(), effectCommand(key, tag));
    let seen: unknown;
    const refused = await helper().run(
      request(),
      effectCommand(key, tag, undefined, {
        authoriseReplay: (context, kept) => {
          seen = { readOnly: context.readOnly, kept };
          return Promise.resolve({
            kind: 'refused',
            refusal: { kind: 'not-authorised', code: 'access.not-granted', missing: [] },
          });
        },
      }),
    );
    expect(refused).toEqual({
      kind: 'refusal',
      refusal: { kind: 'not-authorised', code: 'access.not-granted', missing: [] },
      replayed: false,
      kept: false,
    });
    // Authorising a replay only reads, and is shown what the first request left.
    expect(seen).toEqual({
      readOnly: true,
      kept: { kind: 'success', answer: { kind: 'kept', value: { id: RECORD, state: 'Draft' } } },
    });
    expect(await effects(tag)).toBe(1);
    // The refusal was not kept: once authorised again, the replay gets the first answer.
    expect(await helper().run(request(), effectCommand(key, tag))).toMatchObject({ kind: 'success', replayed: true });
  });
});

describe('a refusal (code-house-rules 12.3, 12.4 "In the command\'s transaction")', () => {
  it('PRD-INT-002 a refusal the command decides is kept: its effects roll back and a replay gets the same refusal', async () => {
    const key = newKey();
    const tag = newTag();
    const refusing: IdempotentCommand<JsonValue> = {
      key,
      content: content({ note: 'SYNTHETIC' }),
      authoriseReplay: allowReplay,
      work: async (context) => {
        await writeEffect(context, tag);
        return {
          kind: 'refusal',
          refusal: { kind: 'refused', code: 'kernel.synthetic-rule', missing: [{ kind: 'setting', id: RECORD }] },
          causedBySecret: false,
        };
      },
    };
    const first = await helper().run(request(), refusing);
    const second = await helper().run(request(), { ...refusing, work: () => Promise.reject(new Error('never run')) });
    const refusal = { kind: 'refused', code: 'kernel.synthetic-rule', missing: [{ kind: 'setting', id: RECORD }] };
    expect(first).toEqual({ kind: 'refusal', refusal, replayed: false, kept: true });
    expect(second).toEqual({ kind: 'refusal', refusal, replayed: true, kept: true });
    expect(await effects(tag)).toBe(0);
  });

  it('code-house-rules 12.7 a stale version is kept like any refusal the command decides', async () => {
    const key = newKey();
    const stale: IdempotentCommand<JsonValue> = {
      key,
      content: content({ versionToken: RECORD }),
      authoriseReplay: allowReplay,
      work: () =>
        Promise.resolve({
          kind: 'refusal',
          refusal: { kind: 'conflict', code: 'kernel.stale-version', missing: [] },
          causedBySecret: false,
        }),
    };
    await helper().run(request(), stale);
    const again = await helper().run(request(), { ...stale, work: () => Promise.reject(new Error('never run')) });
    expect(again).toMatchObject({ kind: 'refusal', refusal: { code: 'kernel.stale-version' }, replayed: true });
  });

  it('code-house-rules 12.5 a refusal caused by a secret is not kept, so the corrected request runs under the same key', async () => {
    const key = newKey();
    const tag = newTag();
    const wrongCode = await helper().run(request(), {
      ...effectCommand(key, tag),
      work: async (context) => {
        await writeEffect(context, tag);
        return {
          kind: 'refusal',
          refusal: { kind: 'not-authorised', code: 'access.code-not-accepted', missing: [] },
          causedBySecret: true,
        };
      },
    });
    expect(wrongCode).toMatchObject({ kind: 'refusal', kept: false, replayed: false });
    expect(await effects(tag)).toBe(0);
    expect(await helper().run(request(), effectCommand(key, tag))).toMatchObject({ kind: 'success', replayed: false });
    expect(await effects(tag)).toBe(1);
  });

  it('PRD-INT-004 a command that fails leaves the key unused, so the same key runs once later', async () => {
    const key = newKey();
    const tag = newTag();
    await expect(
      helper().run(request(), {
        ...effectCommand(key, tag),
        work: async (context) => {
          await writeEffect(context, tag);
          throw new Error('SYNTHETIC failure');
        },
      }),
    ).rejects.toThrow('SYNTHETIC failure');
    expect(await helper().run(request(), effectCommand(key, tag))).toMatchObject({ replayed: false });
    expect(await effects(tag)).toBe(1);
  });

  it('a refusal after a database error the command caught keeps nothing and is reported as the defect it is', async () => {
    const key = newKey();
    const tag = newTag();
    const failure = await failureOf(
      helper().run(request(), {
        ...effectCommand(key, tag),
        work: async (context) => {
          await writeEffect(context, tag);
          await context.tx.execute(sql`select 1 / 0`).catch(() => undefined);
          return {
            kind: 'refusal',
            refusal: { kind: 'refused', code: 'kernel.synthetic-rule', missing: [] },
            causedBySecret: false,
          };
        },
      }),
    );
    expect(failure).toMatchObject({ name: 'CommandDefect' });
    expect(await helper().run(request(), effectCommand(key, tag))).toMatchObject({ replayed: false });
  });
});

describe('changed content (code-house-rules 12.4 "Changed content")', () => {
  it('PRD-INT-002 the same key with other content is refused and the refused request is kept', async () => {
    const key = newKey();
    const tag = newTag();
    await helper().run(request(), effectCommand(key, tag, { note: 'SYNTHETIC first' }));
    const failure = await failureOf(helper().run(request(), effectCommand(key, tag, { note: 'SYNTHETIC second' })));
    expect(failure).toBeInstanceOf(IdempotencyConflict);
    expect(failure).toMatchObject({ kind: 'conflict', code: 'kernel.idempotency-key-reused' });
    expect(await effects(tag)).toBe(1);
    expect(await conflictsKept(key)).toEqual([
      {
        reason: 'content-changed',
        request_form: {
          operation: OPERATION,
          pathParameters: {},
          body: { note: 'SYNTHETIC second' },
          secretFields: [],
        },
      },
    ]);
  });

  it('PRD-SEC-006 PRD-SEC-014 a kept refused request holds no secret and every restricted value only encrypted', async () => {
    const key = newKey();
    const tag = newTag();
    const fields: Partial<RequestContent> = {
      secretFields: [{ path: ['totpCode'], kind: 'authenticator-code' }],
      restrictedFields: [{ path: ['lines', '*', 'cost'], fieldClass: 'cost' }],
    };
    const command = (cost: number, code: string): IdempotentCommand<JsonValue> => ({
      ...effectCommand(key, tag),
      content: content({ lines: [{ sku: 'SYN-SKU-1', cost }], totpCode: code }, fields),
    });
    await helper().run(request(), command(1000, '111111'));
    await expect(helper().run(request(), command(2000, '222222'))).rejects.toBeInstanceOf(IdempotencyConflict);
    const kept = await conflictsKept(key);
    expect(kept).toEqual([
      {
        reason: 'content-changed',
        request_form: {
          operation: OPERATION,
          pathParameters: {},
          body: {
            lines: [
              {
                sku: 'SYN-SKU-1',
                cost: {
                  encrypted: { fieldClass: 'cost', scheme: 'syn-test-1', ciphertext: 'SYNTHETIC-ciphertext-of-cost' },
                },
              },
            ],
          },
          secretFields: ['totpCode'],
        },
      },
    ]);
    const text = JSON.stringify(kept);
    expect(text).not.toContain('2000');
    expect(text).not.toContain('222222');
  });
});

describe('requests that carry a secret (code-house-rules 12.5, 12.6)', () => {
  const codeFields: Partial<RequestContent> = { secretFields: [{ path: ['totpCode'], kind: 'authenticator-code' }] };
  const passwordFields: Partial<RequestContent> = { secretFields: [{ path: ['newPassword'], kind: 'new-secret' }] };

  it('CH-8 an authenticator code proves presence and is not compared: a replay with another code gets the first answer', async () => {
    const key = newKey();
    const tag = newTag();
    const command = (code: string): IdempotentCommand<JsonValue> => ({
      ...effectCommand(key, tag),
      content: content({ note: 'SYNTHETIC', totpCode: code }, codeFields),
    });
    await helper().run(request(), command('111111'));
    expect(await helper().run(request(), command('999999'))).toMatchObject({ kind: 'success', replayed: true });
    expect(await effects(tag)).toBe(1);
  });

  it('DEC-113 an answer that showed a secret is never repeated', async () => {
    const key = newKey();
    const showing: IdempotentCommand<JsonValue> = {
      ...effectCommand(key, newTag()),
      work: () => Promise.resolve({ kind: 'success', answer: { secret: 'SYNTHETIC-SHOWN-ONCE' }, shows: 'secret' }),
    };
    expect(await helper().run(request(), showing)).toMatchObject({
      kind: 'success',
      answer: { secret: 'SYNTHETIC-SHOWN-ONCE' },
    });
    const failure = await failureOf(helper().run(request(), showing));
    expect(failure).toMatchObject({ kind: 'conflict', code: 'kernel.answer-not-repeatable' });
    const client = await connect(databaseA, 'migration');
    try {
      const rows = await client.query<{ answer: unknown; shown: string }>(
        `select r.answer, r.shown from kernel.idempotency_result r
         join kernel.idempotency_key k on k.id = r.idempotency_key_id where k.idempotency_key = $1`,
        [key],
      );
      expect(rows.rows).toEqual([{ answer: null, shown: 'secret' }]);
    } finally {
      await client.end();
    }
  });

  it('DEC-114 an answer that showed a restricted value unmasked is never repeated', async () => {
    const key = newKey();
    const showing: IdempotentCommand<JsonValue> = {
      ...effectCommand(key, newTag()),
      work: () => Promise.resolve({ kind: 'success', answer: { value: 'SYNTHETIC' }, shows: 'restricted-value' }),
    };
    await helper().run(request(), showing);
    await expect(helper().run(request(), showing)).rejects.toMatchObject({ code: 'kernel.answer-not-repeatable' });
  });

  it('CH-8 a new password is compared with the credential the first run wrote while it is current', async () => {
    const answers: ('same' | 'differs' | 'not-comparable')[] = ['same', 'differs', 'not-comparable'];
    const results: unknown[] = [];
    for (const answer of answers) {
      const key = newKey();
      const tag = newTag();
      let checked: unknown;
      const check: ReplaySecretCheck = {
        compare: (_context, given) => {
          checked = { credentialIds: given.credentialIds, names: [...given.secrets.keys()] };
          return Promise.resolve(answer);
        },
      };
      const command: IdempotentCommand<JsonValue> = {
        ...effectCommand(key, tag),
        content: content({ newPassword: new Secret('SYNTHETIC-password') }, passwordFields),
        work: async (context) => {
          await writeEffect(context, tag);
          return { kind: 'success', answer: { id: RECORD }, shows: 'nothing', credentialIds: [CREDENTIAL] };
        },
      };
      await helper(check).run(request(), command);
      results.push(
        await helper(check)
          .run(request(), command)
          .then(
            (value) => value.replayed,
            (error: unknown) => (error as IdempotencyConflict).code,
          ),
      );
      expect(checked).toEqual({ credentialIds: [CREDENTIAL], names: ['newPassword'] });
      expect(await effects(tag)).toBe(1);
    }
    expect(results).toEqual([true, 'kernel.idempotency-key-reused', 'kernel.secret-not-comparable']);
  });

  it('CH-8 a new password under a kept refusal cannot be compared and is refused as changed content', async () => {
    const key = newKey();
    const command: IdempotentCommand<JsonValue> = {
      ...effectCommand(key, newTag()),
      content: content({ newPassword: new Secret('SYNTHETIC-password') }, passwordFields),
      work: () =>
        Promise.resolve({
          kind: 'refusal',
          refusal: { kind: 'unavailable', code: 'kernel.synthetic-unavailable', missing: [] },
          causedBySecret: false,
        }),
    };
    await helper({ compare: () => Promise.resolve('same') }).run(request(), command);
    await expect(helper({ compare: () => Promise.resolve('same') }).run(request(), command)).rejects.toMatchObject({
      code: 'kernel.secret-not-comparable',
    });
    expect(await conflictsKept(key)).toEqual([expect.objectContaining({ reason: 'secret-not-comparable' }) as unknown]);
    expect(JSON.stringify(await conflictsKept(key))).not.toContain('SYNTHETIC-password');
  });
});

describe('two requests at once (code-house-rules 12.4 "Two at once")', () => {
  it('PRD-INT-003 a second request with the same key waits for the first and replays its answer: one effect', async () => {
    const key = newKey();
    const tag = newTag();
    const firstStarted = gate();
    const releaseFirst = gate();
    let firstPid = 0;
    const first = helper().run(request(), {
      ...effectCommand(key, tag),
      work: async (context) => {
        firstPid = (await context.tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0]?.pid ?? 0;
        await writeEffect(context, tag);
        firstStarted.open();
        await releaseFirst.wait;
        return { kind: 'success', answer: { id: RECORD, state: 'Draft' }, shows: 'nothing' };
      },
    });
    await firstStarted.wait;
    const second = helper().run(request(), effectCommand(key, tag));
    await waitUntilAnyWaitingForLock(databaseA, [firstPid]);
    releaseFirst.open();
    const answers: IdempotentAnswer<JsonValue>[] = await Promise.all([first, second]);
    expect(answers.map((answer) => answer.replayed)).toEqual([false, true]);
    expect(await effects(tag)).toBe(1);
  });

  it('PRD-INT-003 when the first request rolls back, the waiting one runs itself: one effect', async () => {
    const key = newKey();
    const tag = newTag();
    const firstStarted = gate();
    const releaseFirst = gate();
    let firstPid = 0;
    const first = helper().run(request(), {
      ...effectCommand(key, tag),
      work: async (context) => {
        firstPid = (await context.tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0]?.pid ?? 0;
        await writeEffect(context, tag);
        firstStarted.open();
        await releaseFirst.wait;
        throw new Error('SYNTHETIC failure of the first request');
      },
    });
    await firstStarted.wait;
    const second = helper().run(request(), effectCommand(key, tag));
    await waitUntilAnyWaitingForLock(databaseA, [firstPid]);
    releaseFirst.open();
    await expect(first).rejects.toThrow('SYNTHETIC failure');
    expect(await second).toMatchObject({ kind: 'success', replayed: false });
    expect(await effects(tag)).toBe(1);
  });

  it('DEC-112 a wait that reaches the lock limit is answered request-in-progress, and the key is not taken', async () => {
    const key = newKey();
    const tag = newTag();
    const firstStarted = gate();
    const releaseFirst = gate();
    const first = helper().run(request(), {
      ...effectCommand(key, tag),
      work: async (context) => {
        await writeEffect(context, tag);
        firstStarted.open();
        await releaseFirst.wait;
        return { kind: 'success', answer: { id: RECORD, state: 'Draft' }, shows: 'nothing' };
      },
    });
    await firstStarted.wait;
    const failure = await failureOf(helper().run(request(), effectCommand(key, tag)));
    releaseFirst.open();
    await first;
    expect(failure).toBeInstanceOf(IdempotencyConflict);
    expect(failure).toMatchObject({ code: 'kernel.request-in-progress' });
    expect(await helper().run(request(), effectCommand(key, tag))).toMatchObject({ replayed: true });
    expect(await effects(tag)).toBe(1);
  });
});

describe('an uncertain commit keeps the key (code-house-rules 12.4)', () => {
  it('PRD-INT-002 a connection lost after COMMIT took effect: the same key sent again is a replay, one effect', async () => {
    const single = openRouter(1);
    try {
      const base = await routed(single, world.organisations[0].code);
      const losing = interceptingCommit(base, async (send, pid) => {
        await send();
        await terminateBackend(databaseA, pid);
        throw new Error('SYNTHETIC: connection terminated before the answer to COMMIT was read');
      });
      const key = newKey();
      const tag = newTag();
      const failure = await failureOf(helper().run(request(losing), effectCommand(key, tag)));
      expect(failure).toBeInstanceOf(CommandOutcomeUnknown);
      expect(await helper().run(request(base), effectCommand(key, tag))).toMatchObject({ replayed: true });
      expect(await effects(tag)).toBe(1);
    } finally {
      await single.close();
    }
  });

  it('PRD-INT-002 a connection lost before COMMIT took effect: the same key sent again runs once, one effect', async () => {
    const single = openRouter(1);
    try {
      const base = await routed(single, world.organisations[0].code);
      const losing = interceptingCommit(base, async (send, pid) => {
        await terminateBackend(databaseA, pid);
        return send();
      });
      const key = newKey();
      const tag = newTag();
      const failure = await failureOf(helper().run(request(losing), effectCommand(key, tag)));
      expect(failure).toBeInstanceOf(CommandOutcomeUnknown);
      expect(await effects(tag)).toBe(0);
      expect(await helper().run(request(base), effectCommand(key, tag))).toMatchObject({ replayed: false });
      expect(await effects(tag)).toBe(1);
    } finally {
      await single.close();
    }
  });

  it('DEC-112 a time limit reached during a COMMIT that did not take effect: the same key runs once, one effect', async () => {
    // Real: a deferred check locks a row at COMMIT that another session holds, so COMMIT waits until the runtime
    // role's lock limit (CH-3) ends it. PostgreSQL rolls back, but nothing confirms that to the runner.
    const holder = await connect(databaseA, 'superuser');
    const key = newKey();
    const tag = newTag();
    try {
      await holder.query('begin');
      await holder.query('select 1 from syn_idem.blocker where id = 1 for update');
      const failure = await failureOf(
        helper().run(request(), {
          ...effectCommand(key, tag),
          work: async (context) => {
            await writeEffect(context, tag);
            await context.tx.execute(sql`insert into syn_idem.at_commit default values`);
            return { kind: 'success', answer: { id: RECORD }, shows: 'nothing' };
          },
        }),
      );
      expect(failure).toBeInstanceOf(CommandOutcomeUnknown);
      expect(failure).not.toBeInstanceOf(CommandTimedOut);
    } finally {
      await holder.query('rollback');
      await holder.end();
    }
    expect(await effects(tag)).toBe(0);
    expect(await helper().run(request(), effectCommand(key, tag))).toMatchObject({ replayed: false });
    expect(await effects(tag)).toBe(1);
  });

  it('PRD-INT-002 a time limit reached during a COMMIT that took effect: the same key sent again is a replay', async () => {
    // Simulated, as in the runner's own test: COMMIT takes effect and the answer read is a statement timeout.
    const single = openRouter(1);
    try {
      const base = await routed(single, world.organisations[0].code);
      const timingOut = interceptingCommit(base, async (send) => {
        await send();
        throw Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
      });
      const key = newKey();
      const tag = newTag();
      expect(await failureOf(helper().run(request(timingOut), effectCommand(key, tag)))).toBeInstanceOf(
        CommandOutcomeUnknown,
      );
      expect(await helper().run(request(base), effectCommand(key, tag))).toMatchObject({ replayed: true });
      expect(await effects(tag)).toBe(1);
    } finally {
      await single.close();
    }
  });
});

describe('what the helper logs (code-house-rules 12.11)', () => {
  it('PRD-SEC-014 a conflict is logged with its code and identifiers only, never a field value', async () => {
    const key = newKey();
    const tag = newTag();
    const correlationId = newCorrelationId();
    await helper().run(request(), effectCommand(key, tag, { note: 'SYNTHETIC-MARKER-ONE' }));
    await expect(
      helper().run(request(routedA, ACTOR_A, correlationId), effectCommand(key, tag, { note: 'SYNTHETIC-MARKER-TWO' })),
    ).rejects.toBeInstanceOf(IdempotencyConflict);
    const lines = logLines.filter((line) => line.includes(correlationId));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ code: 'kernel.idempotency-key-reused', level: 40 });
    expect(logLines.join('\n')).not.toContain('SYNTHETIC-MARKER');
  });
});
