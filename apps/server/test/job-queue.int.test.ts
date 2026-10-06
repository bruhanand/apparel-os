import { Writable } from 'node:stream';
import { uuidv7 } from '@apparel-os/domain';
import type { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  KEEP_EVERY_JOB,
  OrganisationRouter,
  PinoLoggerService,
  startJobQueue,
  type RoutedOrganisation,
} from '../src/kernel/index.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';

// S1-F01-T06: pg-boss at the version the lockfile pins, as the runtime role, in an Organisation database
// (code-house-rules 3.2, 12.9). It runs with only the privileges its register entry grants; a posting job's
// singleton key holds a second job of the same book until the first ends and never drops it (stock-ledger 10.6);
// and no job is deleted while the retention periods are not set (CH-9).

const SYNTHETIC_POOL_MAX = 4;
/** A queue made by this test only, as the migration role, standing in for a posting queue (stage 1 has none). */
const SINGLETON_QUEUE = 'kernel.synthetic-posting';
const STANDARD_QUEUE = 'kernel.outbox-delivery';

let world: SyntheticWorld;
let router: OrganisationRouter;
let organisation: RoutedOrganisation;
let boss: PgBoss;

const logger = new PinoLoggerService(
  pino(
    new Writable({
      write(_chunk: Buffer, _encoding, done) {
        done();
      },
    }),
  ),
);

beforeAll(async () => {
  world = await createSyntheticOrganisations('jobqueue');
  const owner = await connect(world.organisations[0].database, 'migration');
  try {
    await owner.query(
      `select pgboss.create_queue($1, '{"policy": "singleton", "retryLimit": 0, "deleteAfterSeconds": 0, "retentionSeconds": 2147483647}')`,
      [SINGLETON_QUEUE],
    );
  } finally {
    await owner.end();
  }
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: SYNTHETIC_POOL_MAX },
    logger,
  );
  const found = await router.resolveForSignIn(world.organisations[0].code);
  if (!found.routed) throw new Error('not routed');
  organisation = found.organisation;
  boss = await startJobQueue(organisation, logger, 'worker');
});

afterAll(async () => {
  await (boss as PgBoss | undefined)?.stop({ graceful: false });
  await (router as OrganisationRouter | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

async function jobState(queue: string, id: string): Promise<{ state: string; deletion: number } | undefined> {
  const owner = await connect(world.organisations[0].database, 'migration');
  try {
    const result = await owner.query<{ state: string; deletion: number }>(
      'select state::text as state, deletion_seconds as deletion from pgboss.job where name = $1 and id = $2',
      [queue, id],
    );
    return result.rows[0];
  } finally {
    await owner.end();
  }
}

describe('pg-boss in an Organisation database (code-house-rules 12.9)', () => {
  it('PRD-SEC-005 sends, fetches and completes a job as the runtime role, and keeps the completed job', async () => {
    const id = await boss.send(STANDARD_QUEUE, { eventId: uuidv7() }, { ...KEEP_EVERY_JOB, retryLimit: 0 });
    expect(id).not.toBeNull();
    const [job] = await boss.fetch(STANDARD_QUEUE);
    expect(job?.id).toBe(id);
    await boss.complete(STANDARD_QUEUE, id ?? '');
    await boss.supervise();
    expect(await jobState(STANDARD_QUEUE, id ?? '')).toEqual({ state: 'completed', deletion: 0 });
  });

  it('CH-9 keeps a failed job after supervision', async () => {
    const id = (await boss.send(STANDARD_QUEUE, { eventId: uuidv7() }, { ...KEEP_EVERY_JOB, retryLimit: 0 })) ?? '';
    const [job] = await boss.fetch(STANDARD_QUEUE);
    expect(job?.id).toBe(id);
    await boss.fail(STANDARD_QUEUE, id, { reason: 'SYNTHETIC' });
    await boss.supervise();
    expect(await jobState(STANDARD_QUEUE, id)).toEqual({ state: 'failed', deletion: 0 });
  });

  it('stock-ledger 10.6 a second job of the same singleton key waits until the first ends, and is never dropped', async () => {
    const book = uuidv7();
    const first = (await boss.send(SINGLETON_QUEUE, {}, { ...KEEP_EVERY_JOB, singletonKey: book })) ?? '';
    const second = (await boss.send(SINGLETON_QUEUE, {}, { ...KEEP_EVERY_JOB, singletonKey: book })) ?? '';
    expect(first).not.toBe('');
    expect(second).not.toBe('');

    const fetched = await boss.fetch(SINGLETON_QUEUE, { batchSize: 2 });
    expect(fetched.map((job) => job.id)).toEqual([first]);
    expect(await boss.fetch(SINGLETON_QUEUE)).toEqual([]);
    expect(await jobState(SINGLETON_QUEUE, second)).toEqual({ state: 'created', deletion: 0 });

    // A failed first job ends it too, and frees the book for the next.
    await boss.fail(SINGLETON_QUEUE, first, { reason: 'SYNTHETIC' });
    const next = await boss.fetch(SINGLETON_QUEUE);
    expect(next.map((job) => job.id)).toEqual([second]);
  });
});
