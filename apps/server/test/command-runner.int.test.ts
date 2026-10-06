import { Writable } from 'node:stream';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandCancelled,
  CommandDefect,
  CommandOutcomeUnknown,
  CommandRunner,
  CommandTimedOut,
  LOCK_STEP,
  lockTable,
  newCorrelationId,
  OrganisationRouter,
  PinoLoggerService,
  refuseInsideCommand,
  timezoneNotConfigured,
  type ActorSetting,
  type Clock,
  type CommandRequest,
  type OrganisationTimezoneSource,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl, sqlState } from './support/postgres.js';
import {
  backendPid,
  gate,
  interceptingCommit,
  terminateBackend as terminateBackendIn,
  waitUntilWaitingForLock as waitUntilWaitingForLockIn,
} from './support/transactions.js';

// S1-F01-T03: the command context (code-house-rules 5.1, 6.2, 8.1 to 8.3, 9, 12.11; module-map 4.1; DEC-112, CH-3).
// Every command runs as the runtime role through Organisation routing, as the application does (code-house-rules
// 10.1). The tables under syn_command are scratch tables made by test setup as the migration role, in this file's own
// database copies, only to give the runner something to act on (code-house-rules 11.1). They are no part of any
// migration set and no business table. syn_command.row_visible stands in for access.row_visible, which `access`
// provides with its effective grants in S1-F01-T11 (code-house-rules 6.2): it reads the actor the same way.

// SYNTHETIC identifiers: actors, Sites and rows of this file only.
const ACTOR_A = '01900000-0000-7000-8000-00000000a001';
const ACTOR_B = '01900000-0000-7000-8000-00000000a002';
const SITE_1 = '01900000-0000-7000-8000-00000000b001';
const SITE_2 = '01900000-0000-7000-8000-00000000b002';
const ROW_X = '01900000-0000-7000-8000-00000000c001'; // X sorts before Y
const ROW_Y = '01900000-0000-7000-8000-00000000c002';
const ROW_Z = '01900000-0000-7000-8000-00000000c003';
const ROW_ABSENT = '01900000-0000-7000-8000-00000000c0ff';
/** A SYNTHETIC timezone setting, chosen for its offset (UTC+05:30); never an Organisation's value. */
const SYNTHETIC_TIMEZONE = 'Asia/Kolkata';
const SYNTHETIC_TIMEZONE_VERSION = '01900000-0000-7000-8000-00000000d001';
/** A synthetic pool size for these tests; the real one is each environment's AOS_DATABASE_POOL_MAX. */
const SYNTHETIC_POOL_MAX = 4;

const lockedRow = lockTable('syn_command', 'locked_row');
const lockedOther = lockTable('syn_command', 'locked_other');

let world: SyntheticWorld;
let organisationA: string;
const logLines: string[] = [];
let router: OrganisationRouter;
let routedA: RoutedOrganisation;
let routedB: RoutedOrganisation;

const SCRATCH = `
  create schema syn_command;
  grant usage on schema syn_command to aos_runtime;

  -- Rows that nested module calls write.
  create table syn_command.entry (id serial primary key, written_by text not null, txid bigint not null, pid int not null);
  grant select, insert on syn_command.entry to aos_runtime;
  grant usage on sequence syn_command.entry_id_seq to aos_runtime;

  -- A scoped table and its one policy (code-house-rules 6.2), with a stand-in for access.row_visible over a scratch
  -- grant table: an actor sees a row when a grant names it and the row's Site.
  create table syn_command.actor_site (actor_id uuid not null, site_id uuid not null, primary key (actor_id, site_id));
  grant select on syn_command.actor_site to aos_runtime;
  create function syn_command.row_visible(p_site_id uuid) returns boolean
    language sql stable
    set search_path = pg_catalog
  as $$
    select exists (
      select 1 from syn_command.actor_site g
      where g.actor_id = nullif(pg_catalog.current_setting('aos.actor_id', true), '')::uuid
        and g.site_id = p_site_id)
  $$;
  revoke execute on function syn_command.row_visible(uuid) from public;
  grant execute on function syn_command.row_visible(uuid) to aos_runtime;
  create table syn_command.scoped_row (id uuid primary key, site_id uuid not null, note text not null);
  alter table syn_command.scoped_row enable row level security;
  create policy row_scope on syn_command.scoped_row for all to aos_runtime
    using (syn_command.row_visible(site_id))
    with check (syn_command.row_visible(site_id));
  grant select, insert on syn_command.scoped_row to aos_runtime;

  -- A locked table: the runtime role holds UPDATE, which every row lock needs (code-house-rules 5.2).
  create table syn_command.locked_row (id uuid primary key, state text not null);
  grant select, update on syn_command.locked_row to aos_runtime;
  create table syn_command.locked_other (id uuid primary key, state text not null);
  grant select, update on syn_command.locked_other to aos_runtime;

  -- A deferred check that runs at COMMIT, so a test can make COMMIT itself wait for a lock or fail.
  create table syn_command.deferred_check (
    id serial primary key, written_by text not null, action text not null, target uuid);
  grant select, insert on syn_command.deferred_check to aos_runtime;
  grant usage on sequence syn_command.deferred_check_id_seq to aos_runtime;
  create function syn_command.at_commit() returns trigger
    language plpgsql
    set search_path = pg_catalog
  as $$
  begin
    if new.action = 'lock' then
      perform 1 from syn_command.locked_row where id = new.target for no key update;
    end if;
    if new.action = 'violate' then
      raise exception 'SYNTHETIC deferred check failed' using errcode = '23514';
    end if;
    return null;
  end;
  $$;
  revoke execute on function syn_command.at_commit() from public;
  create constraint trigger at_commit after insert on syn_command.deferred_check
    deferrable initially deferred for each row execute function syn_command.at_commit();
`;

beforeAll(async () => {
  world = await createSyntheticOrganisations('command');
  organisationA = world.organisations[0].database;
  for (const organisation of world.organisations) {
    const owner = await connect(organisation.database, 'migration');
    try {
      await owner.query(SCRATCH);
    } finally {
      await owner.end();
    }
  }
  await asOwner(organisationA, async (owner) => {
    await owner.query('insert into syn_command.actor_site values ($1, $2), ($3, $4)', [
      ACTOR_A,
      SITE_1,
      ACTOR_B,
      SITE_2,
    ]);
    await owner.query(
      `insert into syn_command.scoped_row values
         ('01900000-0000-7000-8000-00000000e001', $1, 'SYNTHETIC row of Site 1'),
         ('01900000-0000-7000-8000-00000000e002', $1, 'SYNTHETIC row of Site 1'),
         ('01900000-0000-7000-8000-00000000e003', $2, 'SYNTHETIC row of Site 2')`,
      [SITE_1, SITE_2],
    );
  });
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
    new PinoLoggerService(pino(sink())),
  );
}

async function routed(from: OrganisationRouter, code: string): Promise<RoutedOrganisation> {
  const result = await from.resolveForSignIn(code);
  if (!result.routed) throw new Error(`${code} was not routed`);
  return result.organisation;
}

function sink(): Writable {
  return new Writable({
    write(chunk: Buffer, _encoding, done) {
      logLines.push(
        ...chunk
          .toString('utf8')
          .split('\n')
          .filter((line) => line !== ''),
      );
      done();
    },
  });
}

/** A fixed clock, as tests set it (code-house-rules 9). */
function fixedClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}

function runner(options: { clock?: Clock; timezones?: OrganisationTimezoneSource } = {}): CommandRunner {
  return new CommandRunner({
    clock: options.clock ?? fixedClock('2026-10-05T19:00:00Z'),
    timezones: options.timezones ?? timezoneNotConfigured,
    logger: new PinoLoggerService(pino(sink())),
  });
}

const asActor = (actorId: string): ActorSetting => ({ kind: 'actor', actorId });
const NO_ACTOR: ActorSetting = { kind: 'no-actor', path: 'authenticate' };

function request(
  organisation: RoutedOrganisation,
  actor: ActorSetting = asActor(ACTOR_A),
  correlationId = newCorrelationId(),
): CommandRequest {
  return { commandName: 'kernel.synthetic-command', organisation, correlationId, actor };
}

async function asOwner<T>(database: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(database, 'migration');
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function entriesWrittenBy(writtenBy: string): Promise<{ txid: string; pid: number }[]> {
  return asOwner(organisationA, async (client) => {
    const result = await client.query<{ txid: string; pid: number }>(
      'select txid::text, pid from syn_command.entry where written_by = $1 order by id',
      [writtenBy],
    );
    return result.rows;
  });
}

async function setLockedRows(states: Readonly<Record<string, string>>): Promise<void> {
  await asOwner(organisationA, async (client) => {
    await client.query('delete from syn_command.locked_row');
    await client.query('delete from syn_command.locked_other');
    for (const [id, state] of Object.entries(states)) {
      await client.query('insert into syn_command.locked_row (id, state) values ($1, $2)', [id, state]);
    }
  });
}

function waitUntilWaitingForLock(pid: number): Promise<void> {
  return waitUntilWaitingForLockIn(organisationA, pid);
}

/** Whether another transaction holds a lock on the row that conflicts with FOR NO KEY UPDATE, without waiting. */
async function isRowLocked(id: string, table = 'locked_row'): Promise<boolean> {
  const probe = await connect(organisationA, 'superuser');
  try {
    await probe.query('begin');
    try {
      await probe.query(
        `select id from syn_command.${probe.escapeIdentifier(table)} where id = $1 for no key update nowait`,
        [id],
      );
      return false;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === '55P03') return true;
      throw error;
    } finally {
      await probe.query('rollback');
    }
  } finally {
    await probe.end();
  }
}

async function transactionId(context: TransactionContext): Promise<string | undefined> {
  const result = await context.tx.execute<{ txid: string }>(sql`select pg_catalog.txid_current()::text as txid`);
  return result.rows[0]?.txid;
}

/**
 * Raises this transaction's own lock wait limit, for a test that holds a command waiting while it inspects
 * PostgreSQL, so that the 1 s limit of CH-3 cannot end the wait first. Test-only; the time-limit tests below use the
 * role's own limits.
 */
async function waitLongerForLocks(context: TransactionContext): Promise<void> {
  await context.tx.execute(sql`set local lock_timeout = '60s'`);
}

class SyntheticRefusal extends Error {}

function terminateBackend(pid: number): Promise<void> {
  return terminateBackendIn(organisationA, pid);
}

/** The runner's JSON log lines that carry a correlation identifier as their own field (code-house-rules 12.11). */
function loggedFor(correlationId: string): Record<string, unknown>[] {
  return logLines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((line) => line.correlationId === correlationId);
}

/**
 * The error a refused use gave, unwrapped from the error Drizzle wraps a refused query in (its cause), or fails the
 * test when the use succeeded.
 */
async function refusal(use: Promise<unknown> | undefined): Promise<unknown> {
  const error = await failureOf(use ?? Promise.resolve());
  return error instanceof Error && error.cause instanceof Error ? error.cause : error;
}

/** Runs a command and gives back what it failed with, or fails the test when it succeeded. */
async function failureOf(run: Promise<unknown>): Promise<unknown> {
  return run.then(
    () => {
      throw new Error('Expected the command to fail, and it succeeded');
    },
    (error: unknown) => error,
  );
}

describe('one transaction per command (code-house-rules 8.1; module-map section 3, rule 3)', () => {
  // Two "modules": each interface operation takes the command's context as its first argument.
  async function moduleB(context: TransactionContext, writtenBy: string): Promise<void> {
    await context.tx.execute(
      sql`insert into syn_command.entry (written_by, txid, pid) values (${`${writtenBy} B`}, pg_catalog.txid_current(), pg_catalog.pg_backend_pid())`,
    );
  }
  async function moduleA(context: TransactionContext, writtenBy: string): Promise<void> {
    await context.tx.execute(
      sql`insert into syn_command.entry (written_by, txid, pid) values (${`${writtenBy} A`}, pg_catalog.txid_current(), pg_catalog.pg_backend_pid())`,
    );
    await moduleB(context, writtenBy);
  }

  it('PRD-MOD-006 nested module calls share the one transaction, and their writes commit together', async () => {
    const writtenBy = `commit ${newCorrelationId()}`;
    await runner().run(request(routedA), (context) => moduleA(context, writtenBy));
    const a = await entriesWrittenBy(`${writtenBy} A`);
    const b = await entriesWrittenBy(`${writtenBy} B`);
    expect(a).toHaveLength(1);
    expect(b).toEqual(a);
  });

  it('PRD-INT-004 a failure after nested module calls rolls back every one of their writes', async () => {
    const writtenBy = `rollback ${newCorrelationId()}`;
    await expect(
      runner().run(request(routedA), async (context) => {
        await moduleA(context, writtenBy);
        throw new SyntheticRefusal('refused after both modules wrote');
      }),
    ).rejects.toBeInstanceOf(SyntheticRefusal);
    expect(await entriesWrittenBy(`${writtenBy} A`)).toEqual([]);
    expect(await entriesWrittenBy(`${writtenBy} B`)).toEqual([]);
  });

  it('PRD-MOD-006 a called module cannot open a transaction of its own inside a command', async () => {
    const writtenBy = `nested ${newCorrelationId()}`;
    const run = runner();
    await expect(
      run.run(request(routedA), async (context) => {
        await moduleA(context, writtenBy);
        await run.run(request(routedA), (inner) => moduleB(inner, writtenBy));
      }),
    ).rejects.toBeInstanceOf(CommandDefect);
    expect(await entriesWrittenBy(`${writtenBy} A`)).toEqual([]);
  });

  it('runs a command READ COMMITTED and READ WRITE, and a read READ ONLY (code-house-rules 8.1)', async () => {
    const settings = sql`select pg_catalog.current_setting('transaction_isolation') as isolation,
      pg_catalog.current_setting('transaction_read_only') as read_only`;
    const command = await runner().run(request(routedA), (context) => context.tx.execute(settings));
    expect(command.rows).toEqual([{ isolation: 'read committed', read_only: 'off' }]);
    const read = await runner().read(request(routedA), (context) => context.tx.execute(settings));
    expect(read.rows).toEqual([{ isolation: 'read committed', read_only: 'on' }]);
    expect(
      await sqlState(
        runner().read(request(routedA), (context) =>
          context.tx.execute(sql`insert into syn_command.entry (written_by, txid, pid) values ('read', 0, 0)`),
        ),
      ),
    ).toBe('25006');
  });

  it('refuses a context used after its command ended, so no write can escape the transaction', async () => {
    const kept = await runner().run(request(routedA), (context) => Promise.resolve(context));
    expect(() => kept.tx).toThrow(CommandDefect);
    await expect(kept.lock(LOCK_STEP.document, [])).rejects.toBeInstanceOf(CommandDefect);
    await expect(kept.businessDate()).rejects.toBeInstanceOf(CommandDefect);
  });

  it('refuses every use of a kept transaction handle after the command ended, on a connection back in the pool', async () => {
    // One connection in the pool, so the kept handle's connection is the one the next command gets.
    const single = openRouter(1);
    try {
      const organisation = await routed(single, world.organisations[0].code);
      const writtenBy = `kept ${newCorrelationId()}`;
      const keptHandle = await runner().run(request(organisation), (context) => Promise.resolve(context.tx));
      expect(
        await refusal(
          keptHandle.execute(sql`insert into syn_command.entry (written_by, txid, pid) values (${writtenBy}, 0, 0)`),
        ),
      ).toBeInstanceOf(CommandDefect);
      expect(await refusal(keptHandle.execute(sql`select 1`))).toBeInstanceOf(CommandDefect);
      expect(await refusal(keptHandle.transaction(() => Promise.resolve()))).toBeInstanceOf(CommandDefect);
      // A handle kept from a command that failed is refused too.
      let keptFromFailure: typeof keptHandle | undefined;
      await expect(
        runner().run(request(organisation), (context) => {
          keptFromFailure = context.tx;
          return Promise.reject(new SyntheticRefusal('refused'));
        }),
      ).rejects.toBeInstanceOf(SyntheticRefusal);
      expect(await refusal(keptFromFailure?.execute(sql`select 1`))).toBeInstanceOf(CommandDefect);
      // The connection itself is sound and serves the next command.
      const next = await runner().run(
        request(organisation),
        async (context) => (await context.tx.execute<{ one: number }>(sql`select 1 as one`)).rows,
      );
      expect(next).toEqual([{ one: 1 }]);
      expect(await entriesWrittenBy(writtenBy)).toEqual([]);
    } finally {
      await single.close();
    }
  });

  it('PRD-INT-004 a database error the command caught and went on from rolls everything back and is reported', async () => {
    const writtenBy = `caught ${newCorrelationId()}`;
    const correlationId = newCorrelationId();
    const failure = await failureOf(
      runner().run(request(routedA, asActor(ACTOR_A), correlationId), async (context) => {
        await context.tx.execute(
          sql`insert into syn_command.entry (written_by, txid, pid) values (${writtenBy}, 0, 0)`,
        );
        // 22012 division_by_zero, caught by the command's own code.
        await context.tx.execute(sql`select 1 / 0`).catch(() => undefined);
        // Every later statement is refused with 25P02; caught again, it must not hide the first error.
        await context.tx.execute(sql`select 1`).catch(() => undefined);
        return 'the command believes it succeeded';
      }),
    );
    expect(failure).toBeInstanceOf(CommandDefect);
    expect(failure).toMatchObject({ sqlState: '22012' });
    expect(await entriesWrittenBy(writtenBy)).toEqual([]);
    expect(loggedFor(correlationId)).toEqual([
      expect.objectContaining({ level: 50, sqlState: '22012', caughtByCommand: true }),
    ]);
  });

  it.each([
    'commit',
    'COMMIT',
    '/* hidden */ commit',
    '-- hidden\ncommit',
    'rollback',
    'begin',
    'start transaction',
    'end',
    'abort',
    "prepare transaction 'SYNTHETIC'",
    "commit prepared 'SYNTHETIC'",
    'set transaction read only',
    'set session characteristics as transaction read only',
    'select 1; commit',
  ])('PRD-MOD-006 refuses %j sent by a module, and rolls the whole command back', async (statement) => {
    for (const caught of [false, true]) {
      const writtenBy = `control ${newCorrelationId()}`;
      const failure = await failureOf(
        runner().run(request(routedA), async (context) => {
          await context.tx.execute(
            sql`insert into syn_command.entry (written_by, txid, pid) values (${writtenBy}, 0, 0)`,
          );
          const sent = context.tx.execute(sql.raw(statement));
          if (caught) await sent.catch(() => undefined);
          else await sent;
          await context.tx.execute(
            sql`insert into syn_command.entry (written_by, txid, pid) values (${`${writtenBy} after`}, 0, 0)`,
          );
        }),
      );
      expect(failure instanceof CommandDefect || (failure as Error).cause instanceof CommandDefect).toBe(true);
      expect(await entriesWrittenBy(writtenBy)).toEqual([]);
      expect(await entriesWrittenBy(`${writtenBy} after`)).toEqual([]);
    }
  });

  it('PRD-MOD-006 lets a module use the savepoints of a nested transaction', async () => {
    const writtenBy = `nested savepoint ${newCorrelationId()}`;
    await runner().run(request(routedA), (context) =>
      context.tx.transaction(async (inner) => {
        await inner.execute(sql`insert into syn_command.entry (written_by, txid, pid) values (${writtenBy}, 0, 0)`);
        await inner.transaction(async (deeper) => {
          await deeper.execute(sql`select 1`);
        });
      }),
    );
    expect(await entriesWrittenBy(writtenBy)).toHaveLength(1);
  });

  it("reports the work's own failure, with the failed ROLLBACK beside it, when ROLLBACK fails too", async () => {
    const single = openRouter(1);
    try {
      const organisation = await routed(single, world.organisations[0].code);
      const writtenBy = `rollback lost ${newCorrelationId()}`;
      const correlationId = newCorrelationId();
      const failure = await failureOf(
        runner().run(request(organisation, asActor(ACTOR_A), correlationId), async (context) => {
          await context.tx.execute(
            sql`insert into syn_command.entry (written_by, txid, pid) values (${writtenBy}, 0, 0)`,
          );
          // The connection is lost, then the work fails, so the ROLLBACK that follows cannot be sent.
          await terminateBackend(await backendPid(context));
          throw new SyntheticRefusal('the work failed');
        }),
      );
      expect(failure).toBeInstanceOf(SyntheticRefusal);
      expect((failure as { rollbackError?: unknown }).rollbackError).toBeInstanceOf(Error);
      expect(loggedFor(correlationId)).toEqual([
        expect.objectContaining({ level: 50, msg: expect.stringContaining('ROLLBACK failed') as unknown }),
      ]);
      expect(await entriesWrittenBy(writtenBy)).toEqual([]);
      // The broken connection was destroyed; the next command gets a sound one.
      const next = await runner().run(request(organisation), (context) => backendPid(context));
      expect(next).toBeGreaterThan(0);
    } finally {
      await single.close();
    }
  });

  it('PRD-INT-004 commits when a database error was caught inside a savepoint that rolled back', async () => {
    const writtenBy = `savepoint ${newCorrelationId()}`;
    const result = await runner().run(request(routedA), async (context) => {
      await context.tx
        .transaction(async (savepoint) => {
          await savepoint.execute(sql`select 1 / 0`);
        })
        .catch(() => undefined);
      await context.tx.execute(sql`insert into syn_command.entry (written_by, txid, pid) values (${writtenBy}, 0, 0)`);
      return 'committed';
    });
    expect(result).toBe('committed');
    expect(await entriesWrittenBy(writtenBy)).toHaveLength(1);
  });

  it('PRD-INT-006 refuses an outside call inside the transaction and allows it outside (code-house-rules 8.3)', async () => {
    expect(() => {
      refuseInsideCommand('SYNTHETIC file storage');
    }).not.toThrow();
    await expect(
      runner().run(request(routedA), () => {
        refuseInsideCommand('SYNTHETIC file storage');
        return Promise.resolve();
      }),
    ).rejects.toThrow(/called inside the transaction of command kernel\.synthetic-command/);
    await runner().run(request(routedA), () => Promise.resolve());
    expect(() => {
      refuseInsideCommand('SYNTHETIC file storage');
    }).not.toThrow();
  });

  it('PRD-MOD-001 a command reaches only its own Organisation database', async () => {
    const writtenBy = `organisation ${newCorrelationId()}`;
    await runner().run(request(routedA), (context) => moduleA(context, writtenBy));
    const inB = await runner().read(request(routedB), (context) =>
      context.tx.execute<{ count: string }>(
        sql`select count(*)::text as count from syn_command.entry where written_by like ${`${writtenBy}%`}`,
      ),
    );
    expect(inB.rows).toEqual([{ count: '0' }]);
    expect(await entriesWrittenBy(`${writtenBy} A`)).toHaveLength(1);
  });

  it('refuses a request without a server-made correlation identifier or with an actor that is not a UUIDv7', async () => {
    await expect(
      runner().run(request(routedA, asActor(ACTOR_A), 'not-an-identifier'), () => Promise.resolve()),
    ).rejects.toBeInstanceOf(CommandDefect);
    await expect(
      runner().run(request(routedA, asActor('not-an-actor')), () => Promise.resolve()),
    ).rejects.toBeInstanceOf(CommandDefect);
  });
});

describe('the actor and row-level security (code-house-rules 6.2; access-and-approvals 7.2)', () => {
  const visible = (actor: ActorSetting): Promise<string[]> =>
    runner().read(request(routedA, actor), async (context) => {
      const result = await context.tx.execute<{ note: string; site_id: string }>(
        sql`select site_id, note from syn_command.scoped_row order by id`,
      );
      return result.rows.map((row) => row.site_id);
    });

  it('PRD-SEC-005 with no actor set a scoped table shows no row (access-and-approvals 15 test 11)', async () => {
    expect(await visible(NO_ACTOR)).toEqual([]);
    expect(await visible({ kind: 'no-actor', path: 'sign-in' })).toEqual([]);
  });

  it('PRD-SEC-005 with an actor set a scoped table shows only the rows its grants cover', async () => {
    expect(await visible(asActor(ACTOR_A))).toEqual([SITE_1, SITE_1]);
    expect(await visible(asActor(ACTOR_B))).toEqual([SITE_2]);
    // An actor with no grant sees nothing.
    expect(await visible(asActor('01900000-0000-7000-8000-00000000a0ff'))).toEqual([]);
  });

  it('PRD-SEC-005 a command cannot write a row its actor could not read', async () => {
    const insert = (actor: ActorSetting, site: string): Promise<unknown> =>
      runner().run(request(routedA, actor), (context) =>
        context.tx.execute(
          sql`insert into syn_command.scoped_row (id, site_id, note) values (${'01900000-0000-7000-8000-00000000e0ff'}, ${site}, 'SYNTHETIC')`,
        ),
      );
    expect(await sqlState(insert(asActor(ACTOR_A), SITE_2))).toBe('42501');
    expect(await sqlState(insert(NO_ACTOR, SITE_1))).toBe('42501');
  });

  it('PRD-SEC-005 sets the actor for the transaction only, so a pooled connection never carries it into the next', async () => {
    // One connection in the pool, so the second transaction runs on the connection the first used.
    const single = openRouter(1);
    try {
      const organisation = await routed(single, world.organisations[0].code);
      const first = await runner().run(request(organisation, asActor(ACTOR_A)), async (context) => ({
        pid: await backendPid(context),
        rows: (await context.tx.execute(sql`select id from syn_command.scoped_row`)).rows.length,
      }));
      const second = await runner().read(request(organisation, NO_ACTOR), async (context) => ({
        pid: await backendPid(context),
        rows: (await context.tx.execute(sql`select id from syn_command.scoped_row`)).rows.length,
        actor: (
          await context.tx.execute<{ actor: string | null }>(
            sql`select pg_catalog.current_setting('aos.actor_id', true) as actor`,
          )
        ).rows[0]?.actor,
      }));
      expect(first.rows).toBe(2);
      expect(second.pid).toBe(first.pid);
      expect(second.rows).toBe(0);
      // The setting reads as an empty string once its transaction ended, which counts as no actor (6.2).
      expect(second.actor).toBe('');
      // Nothing set it for the session either.
      const session = await organisation.db.execute<{ actor: string | null }>(
        sql`select pg_catalog.current_setting('aos.actor_id', true) as actor`,
      );
      expect(session.rows[0]?.actor ?? '').toBe('');
    } finally {
      await single.close();
    }
  });
});

describe('the lock helper (code-house-rules 8.2, 10.3; stock-ledger 10.3, 10.4)', () => {
  it("PRD-INT-003 takes one step's rows in ascending identifier order, whatever order they are given in", async () => {
    await setLockedRows({ [ROW_X]: 'open', [ROW_Y]: 'open' });
    const holderLocked = gate();
    const releaseHolder = gate();
    // The holder takes Y only, and keeps it.
    const holder = runner().run(request(routedA), async (context) => {
      await context.lock(LOCK_STEP.document, [{ table: lockedRow, id: ROW_Y, mode: 'exclusive' }]);
      holderLocked.open();
      await releaseHolder.wait;
    });
    try {
      await holderLocked.wait;
      expect(await isRowLocked(ROW_X)).toBe(false);
      // The second command names Y before X. In ascending order it takes X first, then waits for Y while holding X.
      const waiterPid = gate();
      let pid = 0;
      const waiter = runner().run(request(routedA), async (context) => {
        await waitLongerForLocks(context);
        pid = await backendPid(context);
        waiterPid.open();
        return context.lock(LOCK_STEP.document, [
          { table: lockedRow, id: ROW_Y, mode: 'exclusive' },
          { table: lockedRow, id: ROW_X, mode: 'exclusive' },
        ]);
      });
      await waiterPid.wait;
      await waitUntilWaitingForLock(pid);
      expect(await isRowLocked(ROW_X)).toBe(true);
      releaseHolder.open();
      const result = await waiter;
      expect(result.locked.map((target) => target.id)).toEqual([ROW_X, ROW_Y]);
      expect(result.missing).toEqual([]);
    } finally {
      releaseHolder.open();
      await holder;
    }
  });

  it('PRD-INT-003 orders one step across two tables by identifier, not table by table', async () => {
    // X (first table) < Y (second table) < Z (first table).
    await setLockedRows({ [ROW_X]: 'open', [ROW_Z]: 'open' });
    await asOwner(organisationA, (client) =>
      client.query("insert into syn_command.locked_other (id, state) values ($1, 'open')", [ROW_Y]),
    );
    const holderLocked = gate();
    const releaseHolder = gate();
    // The holder takes Y of the second table only, and keeps it.
    const holder = runner().run(request(routedA), async (context) => {
      await context.lock(LOCK_STEP.document, [{ table: lockedOther, id: ROW_Y, mode: 'exclusive' }]);
      holderLocked.open();
      await releaseHolder.wait;
    });
    try {
      await holderLocked.wait;
      const waiterPid = gate();
      let pid = 0;
      const waiter = runner().run(request(routedA), async (context) => {
        await waitLongerForLocks(context);
        pid = await backendPid(context);
        waiterPid.open();
        return context.lock(LOCK_STEP.document, [
          { table: lockedRow, id: ROW_Z, mode: 'exclusive' },
          { table: lockedOther, id: ROW_Y, mode: 'exclusive' },
          { table: lockedRow, id: ROW_X, mode: 'exclusive' },
        ]);
      });
      await waiterPid.wait;
      await waitUntilWaitingForLock(pid);
      // It holds X and waits for Y. Z, which sorts after Y, is not taken yet, as it would be table by table.
      expect(await isRowLocked(ROW_X)).toBe(true);
      expect(await isRowLocked(ROW_Z)).toBe(false);
      releaseHolder.open();
      const result = await waiter;
      expect(result.locked.map((target) => [target.table.table, target.id])).toEqual([
        ['locked_row', ROW_X],
        ['locked_other', ROW_Y],
        ['locked_row', ROW_Z],
      ]);
    } finally {
      releaseHolder.open();
      await holder;
    }
  });

  it('PRD-INT-003 rechecks under the lock, and sees the change the holder committed before it was granted', async () => {
    await setLockedRows({ [ROW_X]: 'open' });
    const holderChanged = gate();
    const releaseHolder = gate();
    // The holder locks X, changes its state and keeps the lock.
    const holder = runner().run(request(routedA), async (context) => {
      await context.lock(LOCK_STEP.document, [{ table: lockedRow, id: ROW_X, mode: 'exclusive' }]);
      await context.tx.execute(sql`update syn_command.locked_row set state = 'closed' where id = ${ROW_X}`);
      holderChanged.open();
      await releaseHolder.wait;
    });
    try {
      await holderChanged.wait;
      const waiterPid = gate();
      let pid = 0;
      let seenBeforeLock = '';
      const waiter = runner().run(request(routedA), async (context) => {
        const readState = async (): Promise<string | undefined> =>
          (
            await context.tx.execute<{ state: string }>(
              sql`select state from syn_command.locked_row where id = ${ROW_X}`,
            )
          ).rows[0]?.state;
        seenBeforeLock = (await readState()) ?? '';
        await waitLongerForLocks(context);
        pid = await backendPid(context);
        waiterPid.open();
        await context.lock(LOCK_STEP.document, [{ table: lockedRow, id: ROW_X, mode: 'exclusive' }]);
        // The recheck reads after the lock is held (code-house-rules 8.1; stock-ledger 10.4).
        const state = await readState();
        if (state !== 'open') throw new SyntheticRefusal(`refused under the lock: the row is ${String(state)}`);
        await context.tx.execute(sql`update syn_command.locked_row set state = 'used' where id = ${ROW_X}`);
      });
      await waiterPid.wait;
      await waitUntilWaitingForLock(pid);
      releaseHolder.open();
      await expect(waiter).rejects.toThrow(/refused under the lock: the row is closed/);
      // Read before the lock, the row was still open: only the recheck under the lock sees the committed change.
      expect(seenBeforeLock).toBe('open');
    } finally {
      releaseHolder.open();
      await holder;
    }
    const final = await asOwner(organisationA, (client) =>
      client.query<{ state: string }>('select state from syn_command.locked_row where id = $1', [ROW_X]),
    );
    expect(final.rows).toEqual([{ state: 'closed' }]);
  });

  it('PRD-INT-003 lets commands that take a row in shared mode go on together', async () => {
    await setLockedRows({ [ROW_X]: 'open' });
    const holderLocked = gate();
    const releaseHolder = gate();
    const holder = runner().run(request(routedA), async (context) => {
      await context.lock(LOCK_STEP.authority, [{ table: lockedRow, id: ROW_X, mode: 'shared' }]);
      holderLocked.open();
      await releaseHolder.wait;
    });
    try {
      await holderLocked.wait;
      const result = await runner().run(request(routedA), (context) =>
        context.lock(LOCK_STEP.authority, [{ table: lockedRow, id: ROW_X, mode: 'shared' }]),
      );
      expect(result.locked).toEqual([{ table: lockedRow, id: ROW_X, mode: 'shared' }]);
    } finally {
      releaseHolder.open();
      await holder;
    }
  });

  it('PRD-INT-003 refuses a step no higher than one already locked in the transaction', async () => {
    await setLockedRows({ [ROW_X]: 'open', [ROW_Y]: 'open' });
    const x = { table: lockedRow, id: ROW_X, mode: 'exclusive' } as const;
    const y = { table: lockedRow, id: ROW_Y, mode: 'exclusive' } as const;
    await expect(
      runner().run(request(routedA), async (context) => {
        await context.lock(LOCK_STEP.document, [x]);
        await context.lock(LOCK_STEP.document, [y]);
      }),
    ).rejects.toBeInstanceOf(CommandDefect);
    await expect(
      runner().run(request(routedA), async (context) => {
        await context.lock(LOCK_STEP.receiptOrigin, [x]);
        await context.lock(LOCK_STEP.authority, [y]);
      }),
    ).rejects.toBeInstanceOf(CommandDefect);
    // Ascending steps are allowed.
    await runner().run(request(routedA), async (context) => {
      await context.lock(LOCK_STEP.authority, [{ ...x, mode: 'shared' }]);
      await context.lock(LOCK_STEP.document, [y]);
    });
  });

  it('names the rows it could not find, for the command to decide', async () => {
    await setLockedRows({ [ROW_X]: 'open', [ROW_Z]: 'open' });
    const result = await runner().run(request(routedA), (context) =>
      context.lock(LOCK_STEP.document, [
        { table: lockedRow, id: ROW_ABSENT, mode: 'exclusive' },
        { table: lockedRow, id: ROW_Z, mode: 'exclusive' },
        { table: lockedRow, id: ROW_X, mode: 'exclusive' },
      ]),
    );
    expect(result.locked.map((target) => target.id)).toEqual([ROW_X, ROW_Z]);
    expect(result.missing.map((target) => target.id)).toEqual([ROW_ABSENT]);
  });

  it('takes no lock in a read', async () => {
    await expect(
      runner().read(request(routedA), (context) =>
        context.lock(LOCK_STEP.document, [{ table: lockedRow, id: ROW_X, mode: 'shared' }]),
      ),
    ).rejects.toBeInstanceOf(CommandDefect);
  });
});

describe('time limits (code-house-rules 5.1; DEC-112, CH-3, RR-200)', () => {
  it('DEC-112 sets lock_timeout 1 s and statement_timeout 5 s on the runtime role, not on a database', async () => {
    const runtime = await connect(organisationA, 'runtime');
    try {
      const limits = await runtime.query<{ lock: string; statement: string }>(
        `select pg_catalog.current_setting('lock_timeout') as lock,
                pg_catalog.current_setting('statement_timeout') as statement`,
      );
      expect(limits.rows).toEqual([{ lock: '1s', statement: '5s' }]);
    } finally {
      await runtime.end();
    }
    const superuser = await connect(organisationA, 'superuser');
    try {
      const settings = await superuser.query<{ role: string; database: string | null; config: string[] }>(
        `select r.rolname as role, d.datname as database, s.setconfig as config
         from pg_catalog.pg_db_role_setting s
         join pg_catalog.pg_roles r on r.oid = s.setrole
         left join pg_catalog.pg_database d on d.oid = s.setdatabase
         where (r.rolname in ('aos_runtime', 'aos_migration') or s.setrole = 0)
           and (s.setdatabase = 0 or d.datname = current_database())
         order by 1, 2`,
      );
      expect(settings.rows).toEqual([
        {
          role: 'aos_runtime',
          database: null,
          config: ['search_path=public', 'lock_timeout=1s', 'statement_timeout=5s'],
        },
      ]);
    } finally {
      await superuser.end();
    }
    // The migration role has no limit of its own: longer limits for migration are OPEN (CH-3).
    const migration = await connect(organisationA, 'migration');
    try {
      const limits = await migration.query<{ lock: string; statement: string }>(
        `select pg_catalog.current_setting('lock_timeout') as lock,
                pg_catalog.current_setting('statement_timeout') as statement`,
      );
      expect(limits.rows).toEqual([{ lock: '0', statement: '0' }]);
    } finally {
      await migration.end();
    }
  });

  it('DEC-112 a command that reaches lock_timeout rolls back and reports timed-out', async () => {
    await setLockedRows({ [ROW_X]: 'open' });
    const holderLocked = gate();
    const releaseHolder = gate();
    const holder = runner().run(request(routedA), async (context) => {
      await context.lock(LOCK_STEP.document, [{ table: lockedRow, id: ROW_X, mode: 'exclusive' }]);
      holderLocked.open();
      await releaseHolder.wait;
    });
    try {
      await holderLocked.wait;
      const writtenBy = `lock timeout ${newCorrelationId()}`;
      const correlationId = newCorrelationId();
      const failure = await runner()
        .run(request(routedA, asActor(ACTOR_A), correlationId), async (context) => {
          await context.tx.execute(
            sql`insert into syn_command.entry (written_by, txid, pid) values (${writtenBy}, 0, 0)`,
          );
          await context.lock(LOCK_STEP.document, [{ table: lockedRow, id: ROW_X, mode: 'exclusive' }]);
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      expect(failure).toBeInstanceOf(CommandTimedOut);
      expect(failure).toMatchObject({
        kind: 'timed-out',
        code: 'kernel.timed-out',
        limit: 'lock',
        sqlState: '55P03',
        correlationId,
      });
      expect(await entriesWrittenBy(writtenBy)).toEqual([]);
      // One line, with the correlation identifier and the Organisation code as fields of their own (12.11).
      expect(loggedFor(correlationId)).toEqual([
        expect.objectContaining({
          level: 40,
          correlationId,
          organisationCode: world.organisations[0].code,
          command: 'kernel.synthetic-command',
          sqlState: '55P03',
          limit: 'lock',
          caughtByCommand: false,
          msg: 'The command reached the lock time limit and rolled back',
        }),
      ]);
    } finally {
      releaseHolder.open();
      await holder;
    }
  });

  it('DEC-112 a command that reaches statement_timeout rolls back and reports timed-out', async () => {
    const writtenBy = `statement timeout ${newCorrelationId()}`;
    const correlationId = newCorrelationId();
    const started = Date.now();
    const failure = await runner()
      .run(request(routedA, asActor(ACTOR_A), correlationId), async (context) => {
        await context.tx.execute(
          sql`insert into syn_command.entry (written_by, txid, pid) values (${writtenBy}, 0, 0)`,
        );
        await context.tx.execute(sql`select pg_catalog.pg_sleep(30)`);
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(CommandTimedOut);
    expect(failure).toMatchObject({ kind: 'timed-out', limit: 'statement', sqlState: '57014', correlationId });
    // The limit stopped it, not the 30 s sleep.
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(await entriesWrittenBy(writtenBy)).toEqual([]);
  });

  it('DEC-112 a statement timeout the command caught still rolls back and reports timed-out', async () => {
    const writtenBy = `caught statement timeout ${newCorrelationId()}`;
    const correlationId = newCorrelationId();
    const failure = await failureOf(
      runner().run(request(routedA, asActor(ACTOR_A), correlationId), async (context) => {
        await context.tx.execute(
          sql`insert into syn_command.entry (written_by, txid, pid) values (${writtenBy}, 0, 0)`,
        );
        await context.tx.execute(sql`select pg_catalog.pg_sleep(30)`).catch(() => undefined);
        return 'the command believes it succeeded';
      }),
    );
    expect(failure).toBeInstanceOf(CommandTimedOut);
    expect(failure).toMatchObject({ kind: 'timed-out', limit: 'statement', sqlState: '57014', correlationId });
    expect(await entriesWrittenBy(writtenBy)).toEqual([]);
    expect(loggedFor(correlationId)).toEqual([
      expect.objectContaining({ level: 40, limit: 'statement', sqlState: '57014', caughtByCommand: true }),
    ]);
  });

  it('DEC-112 a lock timeout the command caught still rolls back and reports timed-out', async () => {
    await setLockedRows({ [ROW_X]: 'open' });
    const holderLocked = gate();
    const releaseHolder = gate();
    const holder = runner().run(request(routedA), async (context) => {
      await context.lock(LOCK_STEP.document, [{ table: lockedRow, id: ROW_X, mode: 'exclusive' }]);
      holderLocked.open();
      await releaseHolder.wait;
    });
    try {
      await holderLocked.wait;
      const writtenBy = `caught lock timeout ${newCorrelationId()}`;
      const failure = await failureOf(
        runner().run(request(routedA), async (context) => {
          await context.tx.execute(
            sql`insert into syn_command.entry (written_by, txid, pid) values (${writtenBy}, 0, 0)`,
          );
          await context
            .lock(LOCK_STEP.document, [{ table: lockedRow, id: ROW_X, mode: 'exclusive' }])
            .catch(() => undefined);
        }),
      );
      expect(failure).toBeInstanceOf(CommandTimedOut);
      expect(failure).toMatchObject({ limit: 'lock', sqlState: '55P03' });
      expect(await entriesWrittenBy(writtenBy)).toEqual([]);
    } finally {
      releaseHolder.open();
      await holder;
    }
  });

  it('reports a statement an operator cancelled as cancelled, not as timed-out', async () => {
    const writtenBy = `cancelled ${newCorrelationId()}`;
    const correlationId = newCorrelationId();
    const started = gate();
    let pid = 0;
    const cancelled = failureOf(
      runner().run(request(routedA, asActor(ACTOR_A), correlationId), async (context) => {
        await context.tx.execute(
          sql`insert into syn_command.entry (written_by, txid, pid) values (${writtenBy}, 0, 0)`,
        );
        pid = await backendPid(context);
        started.open();
        await context.tx.execute(sql`select pg_catalog.pg_sleep(4)`);
      }),
    );
    await started.wait;
    const operator = await connect(organisationA, 'superuser');
    try {
      // Waits until PostgreSQL shows the sleep running, then cancels it, as an operator would.
      const deadline = Date.now() + 3_000;
      for (;;) {
        const activity = await operator.query<{ wait_event: string | null }>(
          'select wait_event from pg_catalog.pg_stat_activity where pid = $1',
          [pid],
        );
        if (activity.rows[0]?.wait_event === 'PgSleep') break;
        if (Date.now() > deadline) throw new Error('The sleep never started');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await operator.query('select pg_catalog.pg_cancel_backend($1)', [pid]);
    } finally {
      await operator.end();
    }
    const failure = await cancelled;
    expect(failure).toBeInstanceOf(CommandCancelled);
    expect(failure).not.toBeInstanceOf(CommandTimedOut);
    expect(failure).toMatchObject({ kind: 'failed', code: 'kernel.failed', correlationId });
    expect(await entriesWrittenBy(writtenBy)).toEqual([]);
  });
});

describe('an uncertain commit (code-house-rules 12.3, 12.4)', () => {
  const terminate = terminateBackend;

  const insertEntry = (context: TransactionContext, writtenBy: string): Promise<unknown> =>
    context.tx.execute(sql`insert into syn_command.entry (written_by, txid, pid) values (${writtenBy}, 0, 0)`);

  it('PRD-INT-004 reports the outcome unknown when the connection is lost after COMMIT took effect', async () => {
    const single = openRouter(1);
    try {
      const base = await routed(single, world.organisations[0].code);
      // COMMIT reaches PostgreSQL and commits; then the connection is lost before its answer is read (simulated:
      // the backend is terminated and the answer is dropped).
      const organisation = interceptingCommit(base, async (send, pid) => {
        await send();
        await terminate(pid);
        throw new Error('SYNTHETIC: connection terminated before the answer to COMMIT was read');
      });
      const writtenBy = `committed then lost ${newCorrelationId()}`;
      const correlationId = newCorrelationId();
      const failure = await failureOf(
        runner().run(request(organisation, asActor(ACTOR_A), correlationId), (context) =>
          insertEntry(context, writtenBy),
        ),
      );
      expect(failure).toBeInstanceOf(CommandOutcomeUnknown);
      expect(failure).not.toBeInstanceOf(CommandTimedOut);
      expect(failure).toMatchObject({ kind: 'failed', code: 'kernel.outcome-unknown', correlationId });
      // The truth: it committed.
      expect(await entriesWrittenBy(writtenBy)).toHaveLength(1);
      expect(loggedFor(correlationId)).toEqual([expect.objectContaining({ level: 50, correlationId })]);
      // The connection was destroyed, not pooled: the next command gets a new one and runs.
      const next = await runner().run(request(base), (context) => backendPid(context));
      expect(next).toBeGreaterThan(0);
    } finally {
      await single.close();
    }
  });

  it('PRD-INT-004 reports the outcome unknown when the connection is lost as COMMIT is sent, and nothing committed', async () => {
    const single = openRouter(1);
    try {
      const base = await routed(single, world.organisations[0].code);
      // The connection is lost just before COMMIT goes out: PostgreSQL never commits.
      const organisation = interceptingCommit(base, async (send, pid) => {
        await terminate(pid);
        return send();
      });
      const writtenBy = `lost before commit ${newCorrelationId()}`;
      const correlationId = newCorrelationId();
      const failure = await failureOf(
        runner().run(request(organisation, asActor(ACTOR_A), correlationId), (context) =>
          insertEntry(context, writtenBy),
        ),
      );
      expect(failure).toBeInstanceOf(CommandOutcomeUnknown);
      expect(failure).toMatchObject({ code: 'kernel.outcome-unknown', correlationId });
      // The truth: it did not commit.
      expect(await entriesWrittenBy(writtenBy)).toEqual([]);
      const next = await runner().run(request(base), (context) => backendPid(context));
      expect(next).toBeGreaterThan(0);
    } finally {
      await single.close();
    }
  });

  it('DEC-112 reports the outcome unknown when the lock limit is reached during COMMIT, and nothing committed', async () => {
    // Real: a deferred check locks a row at COMMIT that another command holds, so COMMIT waits and the runtime
    // role's 1 s lock limit (CH-3) ends it with 55P03. PostgreSQL rolls back, but no answer to COMMIT confirms a
    // rollback by the runner's rule, so it must not report timed-out (code-house-rules 12.4).
    await setLockedRows({ [ROW_X]: 'open' });
    const holderLocked = gate();
    const releaseHolder = gate();
    const holder = runner().run(request(routedA), async (context) => {
      await context.lock(LOCK_STEP.document, [{ table: lockedRow, id: ROW_X, mode: 'exclusive' }]);
      holderLocked.open();
      await releaseHolder.wait;
    });
    const single = openRouter(1);
    try {
      await holderLocked.wait;
      const organisation = await routed(single, world.organisations[0].code);
      const writtenBy = `lock limit in commit ${newCorrelationId()}`;
      const correlationId = newCorrelationId();
      let pid = 0;
      const failure = await failureOf(
        runner().run(request(organisation, asActor(ACTOR_A), correlationId), async (context) => {
          pid = await backendPid(context);
          await insertEntry(context, writtenBy);
          await context.tx.execute(
            sql`insert into syn_command.deferred_check (written_by, action, target) values (${writtenBy}, 'lock', ${ROW_X})`,
          );
        }),
      );
      expect(failure).toBeInstanceOf(CommandOutcomeUnknown);
      expect(failure).not.toBeInstanceOf(CommandTimedOut);
      expect(loggedFor(correlationId)).toEqual([expect.objectContaining({ level: 50, sqlState: '55P03' })]);
      // The truth: nothing committed.
      expect(await entriesWrittenBy(writtenBy)).toEqual([]);
      const rows = await asOwner(organisationA, (client) =>
        client.query('select 1 from syn_command.deferred_check where written_by = $1', [writtenBy]),
      );
      expect(rows.rows).toEqual([]);
      // The connection was destroyed rather than pooled.
      const next = await runner().run(request(organisation), (context) => backendPid(context));
      expect(next).not.toBe(pid);
    } finally {
      releaseHolder.open();
      await holder;
      await single.close();
    }
  });

  it("applies the runner's rule to a 57014 answer to a COMMIT that took effect: outcome unknown (simulated)", async () => {
    // Simulated, a state PostgreSQL itself does not produce here: COMMIT takes effect, and the answer the runner reads
    // is a 57014 statement timeout. This checks the runner's rule only: a time-limit or cancel answer to COMMIT
    // confirms no rollback, so it is never reported as timed-out. The real time limit during COMMIT is the test above.
    const single = openRouter(1);
    try {
      const base = await routed(single, world.organisations[0].code);
      const organisation = interceptingCommit(base, async (send) => {
        await send();
        throw Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
      });
      const writtenBy = `time limit at commit ${newCorrelationId()}`;
      const correlationId = newCorrelationId();
      let pid = 0;
      const failure = await failureOf(
        runner().run(request(organisation, asActor(ACTOR_A), correlationId), async (context) => {
          pid = await backendPid(context);
          await insertEntry(context, writtenBy);
        }),
      );
      expect(failure).toBeInstanceOf(CommandOutcomeUnknown);
      expect(failure).not.toBeInstanceOf(CommandTimedOut);
      // The truth: it committed.
      expect(await entriesWrittenBy(writtenBy)).toHaveLength(1);
      // The connection, sound as it may be, was destroyed rather than pooled.
      const next = await runner().run(request(base), (context) => backendPid(context));
      expect(next).not.toBe(pid);
    } finally {
      await single.close();
    }
  });

  it('reports a COMMIT that PostgreSQL refused with a rollback as that refusal, not as an unknown outcome', async () => {
    const writtenBy = `refused at commit ${newCorrelationId()}`;
    const failure = await failureOf(
      runner().run(request(routedA), (context) =>
        context.tx.execute(
          sql`insert into syn_command.deferred_check (written_by, action) values (${writtenBy}, 'violate')`,
        ),
      ),
    );
    expect(failure).not.toBeInstanceOf(CommandOutcomeUnknown);
    expect(await sqlState(Promise.reject(failure as Error))).toBe('23514');
    const rows = await asOwner(organisationA, (client) =>
      client.query('select 1 from syn_command.deferred_check where written_by = $1', [writtenBy]),
    );
    expect(rows.rows).toEqual([]);
  });
});

describe('the correlation identifier (code-house-rules 12.11)', () => {
  it("keeps each request's own correlation identifier in its command's context", async () => {
    const first = newCorrelationId();
    const second = newCorrelationId();
    const seen = await Promise.all([
      runner().run(request(routedA, asActor(ACTOR_A), first), (context) => Promise.resolve(context.correlationId)),
      runner().read(request(routedA, asActor(ACTOR_B), second), (context) => Promise.resolve(context.correlationId)),
    ]);
    expect(seen).toEqual([first, second]);
    expect(first).not.toBe(second);
  });
});

describe('the business date (code-house-rules 9)', () => {
  it("PRD-MOD-009 works out the business date under the Organisation's timezone, read in the command's transaction", async () => {
    const reads: { txid: string | undefined; at: string }[] = [];
    const synthetic: OrganisationTimezoneSource = {
      read: async (context, at) => {
        // The source reads through the command's own transaction, as `configuration` will.
        reads.push({ txid: await transactionId(context), at: at.toISOString() });
        return { kind: 'set', timezone: SYNTHETIC_TIMEZONE, versionId: SYNTHETIC_TIMEZONE_VERSION };
      },
    };
    // 19:00 UTC on 5 Oct is 00:30 on 6 Oct at UTC+05:30.
    const run = runner({ clock: fixedClock('2026-10-05T19:00:00Z'), timezones: synthetic });
    const dates = await run.run(request(routedA), async (context) => ({
      txid: await transactionId(context),
      startedAt: context.startedAt.toISOString(),
      today: await context.businessDate(),
      earlier: await context.businessDate(new Date('2026-10-05T18:29:59Z')),
    }));
    expect(dates.startedAt).toBe('2026-10-05T19:00:00.000Z');
    expect(dates.today).toEqual({
      kind: 'set',
      date: '2026-10-06',
      timezone: SYNTHETIC_TIMEZONE,
      timezoneVersionId: SYNTHETIC_TIMEZONE_VERSION,
    });
    expect(dates.earlier).toMatchObject({ kind: 'set', date: '2026-10-05' });
    expect(reads).toEqual([
      { txid: dates.txid, at: '2026-10-05T19:00:00.000Z' },
      { txid: dates.txid, at: '2026-10-05T18:29:59.000Z' },
    ]);
  });

  it('PRD-SEC-017 answers "not set" while the Organisation has no timezone, and invents none', async () => {
    const date = await runner({ timezones: timezoneNotConfigured }).read(request(routedA), (context) =>
      context.businessDate(),
    );
    expect(date).toEqual({ kind: 'not-set' });
  });

  it('refuses a timezone setting it cannot read, rather than guess a date', async () => {
    const broken: OrganisationTimezoneSource = {
      read: () =>
        Promise.resolve({ kind: 'set', timezone: 'Nowhere/Synthetic', versionId: SYNTHETIC_TIMEZONE_VERSION }),
    };
    await expect(
      runner({ timezones: broken }).read(request(routedA), (context) => context.businessDate()),
    ).rejects.toBeInstanceOf(CommandDefect);
  });
});
