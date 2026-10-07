import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandRunner,
  IdempotencyHelper,
  OrganisationRouter,
  OUTBOX_AUTHORITY,
  OUTBOX_PROCESSOR_IDENTITY,
  restrictedValueCipherNotConfigured,
  secretCheckNotImplemented,
  Worker,
  type JobRegistry,
} from '../src/kernel/index.js';
import { jobIdentities } from '../src/modules/access/commands/job-identities.js';
import { AUDIT_JOBS_IDENTITY, auditJobKinds } from '../src/modules/audit/index.js';
import { syntheticWorkerSettings } from './fixtures/worker-settings.js';
import { syntheticTimezone } from './support/access.js';
import { capturingLogger, eventually, writeSyntheticServiceIdentity } from './support/jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';
import { waitUntilAnyWaitingForLock } from './support/transactions.js';

// S1-F01-T24: the scheduled upkeep of the audit partitions between deploys (numbering-and-audit 4.4; code-house-rules
// 3.2, 5.2, 12.9; DEC-118, RR-240; PRD-SEC-007, PRD-SEC-013, PRD-MOD-011). The worker runs `audit.ensure-partitions`
// as the runtime role under `audit-jobs`; the function runs with the migration role's rights and only creates.
// Every value here is SYNTHETIC, the worker settings included (CH-10).

const UPKEEP = 'audit.ensure-partitions';
const [upkeep] = auditJobKinds.filter((kind) => kind.name === UPKEEP);
if (upkeep === undefined) throw new Error(`No job kind ${UPKEEP}`);
const registry: JobRegistry = { events: [], consumers: [], jobKinds: [upkeep] };

let world: SyntheticWorld;
let router: OrganisationRouter;
const workers: Worker[] = [];
const log = capturingLogger();

beforeAll(async () => {
  world = await createSyntheticOrganisations('upkeep');
  for (const organisation of world.organisations) {
    await writeSyntheticServiceIdentity(organisation.database, OUTBOX_PROCESSOR_IDENTITY, [OUTBOX_AUTHORITY]);
    await writeSyntheticServiceIdentity(organisation.database, AUDIT_JOBS_IDENTITY, [upkeep.authorises]);
  }
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    log.logger,
  );
});

afterEach(async () => {
  for (const worker of workers.splice(0)) await worker.stop();
});

afterAll(async () => {
  await (router as OrganisationRouter | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

function startWorker(): Promise<void> {
  const runner = new CommandRunner({
    clock: { now: () => new Date() },
    timezones: syntheticTimezone,
    logger: log.logger,
  });
  const worker = new Worker({
    router,
    runner,
    helper: new IdempotencyHelper({
      runner,
      logger: log.logger,
      secretCheck: secretCheckNotImplemented,
      cipher: restrictedValueCipherNotConfigured,
    }),
    identities: jobIdentities(),
    logger: log.logger,
    registry,
    settings: syntheticWorkerSettings(registry, { fast: true }),
  });
  workers.push(worker);
  return worker.start();
}

function database(): string {
  return world.organisations[0].database;
}

async function asOwner<T extends object>(text: string, values: unknown[] = []): Promise<T[]> {
  const owner = await connect(database(), 'migration');
  try {
    return (await owner.query<T>(text, values)).rows;
  } finally {
    await owner.end();
  }
}

/** The partitions of both audit tables, by name. */
async function partitions(): Promise<string[]> {
  const rows = await asOwner<{ name: string }>(
    `select c.relname as name from pg_catalog.pg_inherits i join pg_catalog.pg_class c on c.oid = i.inhrelid
     where i.inhparent in ('audit.audit_record'::regclass, 'audit.access_record'::regclass) order by 1`,
  );
  return rows.map((row) => row.name);
}

/** The name of a table's partition for the third month after this one, as audit.ensure_partitions names it (UTC). */
async function thirdMonthPartition(parent: 'audit_record' | 'access_record'): Promise<string> {
  const [row] = await asOwner<{ name: string }>(
    `select format('%s_y%sm%s', $1::text, to_char(m, 'YYYY'), to_char(m, 'MM')) as name
     from (select (date_trunc('month', now() at time zone 'UTC') + interval '3 months') as m) as month`,
    [parent],
  );
  return row?.name ?? '';
}

/** Removes the partition of the third month after this one, empty in this copy: test set-up as the owner only. */
async function dropThirdMonth(parent: 'audit_record' | 'access_record'): Promise<string> {
  const name = await thirdMonthPartition(parent);
  await asOwner(`alter table audit.${parent} detach partition audit.${name}`);
  await asOwner(`drop table audit.${name}`);
  return name;
}

async function upkeepJobs(state: string): Promise<{ retry_count: number; output: unknown }[]> {
  return asOwner(`select retry_count, output from pgboss.job where name = $1 and state = $2::pgboss.job_state`, [
    UPKEEP,
    state,
  ]);
}

async function rowCounts(): Promise<{ audit: string; access: string }> {
  const [row] = await asOwner<{ audit: string; access: string }>(
    `select (select count(*) from audit.audit_record)::text as audit,
            (select count(*) from audit.access_record)::text as access`,
  );
  return row ?? { audit: '', access: '' };
}

describe('the scheduled partition upkeep (numbering-and-audit 4.4; DEC-118)', () => {
  it('PRD-SEC-007 RR-240 run by the worker as the runtime role, creates the coming months’ missing partitions', async () => {
    const missing = [await dropThirdMonth('audit_record'), await dropThirdMonth('access_record')];
    expect(await partitions()).not.toContain(missing[0]);
    await startWorker();
    await eventually(async () => (await upkeepJobs('completed')).length > 0);
    const after = await partitions();
    for (const name of missing) expect(after).toContain(name);
    expect((await upkeepJobs('completed'))[0]?.output).toEqual({ outcome: 'done', replayed: false });
  });

  it('code-house-rules 5.2 the runtime role still cannot create, drop or detach a partition itself', async () => {
    const existing = await thirdMonthPartition('audit_record');
    const runtime = await connect(database(), 'runtime');
    try {
      for (const statement of [
        `create table audit.syn_upkeep_partition partition of audit.audit_record
           for values from ('2999-01-01') to ('2999-02-01')`,
        `alter table audit.audit_record detach partition audit.${existing}`,
        `drop table audit.${existing}`,
      ]) {
        await expect(runtime.query(statement), statement).rejects.toMatchObject({ code: '42501' });
      }
    } finally {
      await runtime.end();
    }
    expect(await partitions()).toContain(existing);
  });

  it('PRD-SEC-013 PRD-MOD-011 a failed run leaves its job failed and visible, logs its alert and deletes nothing', async () => {
    const missing = await dropThirdMonth('audit_record');
    // A partition in the way of the one the upkeep would create makes its run fail (SYNTHETIC set-up as the owner).
    await asOwner(
      `create table audit.syn_upkeep_in_the_way partition of audit.audit_record
         for values from ((date_trunc('month', now() at time zone 'UTC') + interval '3 months 1 day') at time zone 'UTC')
         to ((date_trunc('month', now() at time zone 'UTC') + interval '3 months 2 days') at time zone 'UTC')`,
    );
    const before = await partitions();
    const rows = await rowCounts();
    try {
      await startWorker();
      await eventually(async () => (await upkeepJobs('failed')).length > 0);
      // A defect, not a transient failure: failed at once, never retried, and kept (code-house-rules 12.9; CH-9).
      expect((await upkeepJobs('failed'))[0]).toMatchObject({ retry_count: 0, output: { outcome: 'defect' } });
      expect(log.lines.some((line) => line.alert === 'audit-partitions-upkeep-failed')).toBe(true);
      expect(await partitions()).toEqual(before);
      expect(await rowCounts()).toEqual(rows);
    } finally {
      for (const worker of workers.splice(0)) await worker.stop();
      await asOwner('alter table audit.audit_record detach partition audit.syn_upkeep_in_the_way');
      await asOwner('drop table audit.syn_upkeep_in_the_way');
      await asOwner('select audit.ensure_partitions()');
    }
    expect(await partitions()).toContain(missing);
  });

  it('code-house-rules 8.1 two runs at once never race to create a partition: the second waits, then finds it', async () => {
    const missing = await dropThirdMonth('access_record');
    const first = await connect(database(), 'runtime');
    const second = await connect(database(), 'runtime');
    try {
      await first.query('begin');
      await first.query('select audit.ensure_partitions()');
      const [pid] = (await first.query<{ pid: number }>('select pg_catalog.pg_backend_pid() as pid')).rows;
      const running = second.query('select audit.ensure_partitions()');
      await waitUntilAnyWaitingForLock(database(), [pid?.pid ?? 0]);
      await first.query('commit');
      await expect(running).resolves.toBeDefined();
    } finally {
      await first.end();
      await second.end();
    }
    expect(await partitions()).toContain(missing);
  });

  it('code-house-rules 5.2 runs with the owner’s rights under a search path of pg_catalog and pg_temp only', async () => {
    const [row] = await asOwner<{ definer: boolean; config: string[] }>(
      `select prosecdef as definer, proconfig as config from pg_catalog.pg_proc
       where oid = 'audit.ensure_partitions()'::regprocedure`,
    );
    expect(row?.definer).toBe(true);
    expect(row?.config).toContain('search_path=pg_catalog, pg_temp');
  });
});
