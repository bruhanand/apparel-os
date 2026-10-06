import { uuidv7 } from '@apparel-os/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CommandDefect,
  CommandRunner,
  CommandTimedOut,
  defineConsumer,
  defineEvent,
  IdempotencyHelper,
  newCorrelationId,
  OrganisationRouter,
  OUTBOX_PROCESSOR_IDENTITY,
  restrictedValueCipherNotConfigured,
  secretCheckNotImplemented,
  Worker,
  type ConsumerDefinition,
  type JobIdentities,
  type JobRegistry,
  type RoutedOrganisation,
  type WorkerSettings,
} from '../src/kernel/index.js';
import { Access } from '../src/modules/access/index.js';
import { syntheticTimezone } from './support/access.js';
import { capturingLogger, eventually, writeSyntheticServiceIdentity } from './support/jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';

// S1-F01-T06: the worker (code-house-rules 12.8, 12.9; module-map 4.1 "Outbox and jobs", section 10; PRD-MOD-006,
// PRD-INT-008, PRD-SEC-018). It dispatches each event to each consumer once, delivers it under the consumer's
// internal service identity, and a redelivered event has one effect. Every value here is SYNTHETIC, the worker
// settings included (CH-10).

const SYNTHETIC_POOL_MAX = 6;
const ACTOR = '01900000-0000-7000-8000-0000006c0001';
const CONSUMER_IDENTITY = 'synthetic-consumer';

const recordChanged = defineEvent({
  type: 'kernel.synthetic-record-changed',
  version: 1,
  payload: z.object({ recordId: z.uuid() }),
});
/** The consumer's effect: an event of its own, so its rows can be counted in the outbox. */
const recordEchoed = defineEvent({
  type: 'kernel.synthetic-record-echoed',
  version: 1,
  payload: z.object({ recordId: z.uuid() }),
});

/** What the synthetic consumer does with a record, by its identifier: echo it, or fail in a chosen way. */
const behaviour = new Map<string, 'echo' | 'refuse' | 'defect' | 'transient-once'>();
const failedOnce = new Set<string>();

const echo: ConsumerDefinition = defineConsumer({
  name: 'kernel.synthetic-echo',
  event: recordChanged,
  serviceIdentity: CONSUMER_IDENTITY,
  authoriseReplay: () => Promise.resolve({ kind: 'allowed' }),
  handle: async (context, event) => {
    const recordId = event.payload.recordId;
    const mode = behaviour.get(recordId) ?? 'echo';
    if (mode === 'refuse') {
      return { kind: 'refused', refusal: { kind: 'refused', code: 'kernel.synthetic-state-changed', missing: [] } };
    }
    if (mode === 'defect') throw new CommandDefect('SYNTHETIC defect in a consumer');
    if (mode === 'transient-once' && !failedOnce.has(recordId)) {
      failedOnce.add(recordId);
      throw new CommandTimedOut('statement', '57014', context.correlationId);
    }
    await context.publish(recordEchoed, {
      subject: { module: 'kernel', recordType: 'kernel.synthetic_record', recordId },
      payload: { recordId },
    });
    return { kind: 'done' };
  },
});

const registry: JobRegistry = { events: [recordChanged, recordEchoed], consumers: [echo], jobKinds: [] };
const echoRetry = { retries: 2, retryDelaySeconds: 0, retryBackoff: false, activeLimitSeconds: 60 };
const settings: WorkerSettings = {
  pollSeconds: 0.5,
  consumers: { 'kernel.synthetic-echo': echoRetry },
  jobKinds: {},
};

let world: SyntheticWorld;
let router: OrganisationRouter;
let organisation: RoutedOrganisation;
let consumerIdentityId: string;
const workers: Worker[] = [];
const log = capturingLogger();

const identities: JobIdentities = {
  authenticate: async (context, code) =>
    (await new Access().authenticateInternalIdentity(context, code))?.serviceIdentityId,
};

beforeAll(async () => {
  world = await createSyntheticOrganisations('worker');
  for (const each of world.organisations) {
    await writeSyntheticServiceIdentity(each.database, OUTBOX_PROCESSOR_IDENTITY);
  }
  consumerIdentityId = await writeSyntheticServiceIdentity(world.organisations[0].database, CONSUMER_IDENTITY);
  await writeSyntheticServiceIdentity(world.organisations[1].database, CONSUMER_IDENTITY);
  router = openRouter();
  const found = await router.resolveForSignIn(world.organisations[0].code);
  if (!found.routed) throw new Error('not routed');
  organisation = found.organisation;
});

afterEach(async () => {
  for (const worker of workers.splice(0)) await worker.stop();
});

afterAll(async () => {
  await (router as OrganisationRouter | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

function openRouter(): OrganisationRouter {
  return new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: SYNTHETIC_POOL_MAX },
    log.logger,
  );
}

function runner(): CommandRunner {
  return new CommandRunner({ clock: { now: () => new Date() }, timezones: syntheticTimezone, logger: log.logger });
}

function worker(from: OrganisationRouter = router, workerSettings: WorkerSettings = settings): Worker {
  const commandRunner = runner();
  const made = new Worker({
    router: from,
    runner: commandRunner,
    helper: new IdempotencyHelper({
      runner: commandRunner,
      logger: log.logger,
      secretCheck: secretCheckNotImplemented,
      cipher: restrictedValueCipherNotConfigured,
    }),
    identities,
    logger: log.logger,
    registry,
    settings: workerSettings,
  });
  workers.push(made);
  return made;
}

/** Publishes one recordChanged event for a new record, as a committed command of a synthetic user. */
async function publishChange(mode: 'echo' | 'refuse' | 'defect' | 'transient-once' = 'echo'): Promise<string> {
  const recordId = uuidv7();
  behaviour.set(recordId, mode);
  await runner().run(
    {
      commandName: 'kernel.synthetic-change-record',
      organisation,
      correlationId: newCorrelationId(),
      actor: { kind: 'actor', actorId: ACTOR },
    },
    (context) =>
      context.publish(recordChanged, {
        subject: { module: 'kernel', recordType: 'kernel.synthetic_record', recordId },
        payload: { recordId },
      }),
  );
  return recordId;
}

async function query<T extends object>(text: string, values: unknown[] = []): Promise<T[]> {
  const owner = await connect(world.organisations[0].database, 'migration');
  try {
    return (await owner.query<T>(text, values)).rows;
  } finally {
    await owner.end();
  }
}

async function echoes(recordId: string): Promise<{ actor_id: string }[]> {
  return query(
    `select actor_id from kernel.outbox_event where event_type = 'kernel.synthetic-record-echoed' and payload->>'recordId' = $1`,
    [recordId],
  );
}

async function dispatches(recordId: string): Promise<{ job_id: string }[]> {
  return query(
    `select d.job_id from kernel.outbox_dispatch d join kernel.outbox_event e on e.id = d.outbox_event_id
     where e.event_type = 'kernel.synthetic-record-changed' and e.payload->>'recordId' = $1`,
    [recordId],
  );
}

async function job(jobId: string): Promise<{ state: string; retry_count: number; output: unknown } | undefined> {
  const rows = await query<{ state: string; retry_count: number; output: unknown }>(
    'select state::text as state, retry_count, output from pgboss.job where id = $1',
    [jobId],
  );
  return rows[0];
}

describe('dispatch (code-house-rules 12.8 "Dispatch")', () => {
  it('PRD-INT-008 hands an event to its consumer once, with one job, however often and by however many workers', async () => {
    // Recorded before the consumer's first deploy: never handed to it (code-house-rules 12.8 "Consumers").
    const early = await publishChange();
    const first = worker();
    const second = worker(openRouter());
    await first.open();
    await second.open();
    const recordId = await publishChange();
    await Promise.all([first.dispatchAll(), second.dispatchAll(), first.dispatchAll()]);
    expect(await dispatches(early)).toEqual([]);
    const rows = await dispatches(recordId);
    expect(rows).toHaveLength(1);
    const jobId = rows[0]?.job_id ?? '';
    expect(await job(jobId)).toMatchObject({ state: 'created' });
    const [data] = await query<{ data: unknown }>('select data from pgboss.job where id = $1', [jobId]);
    expect(data?.data).toEqual({ eventId: expect.any(String) as unknown, consumer: 'kernel.synthetic-echo' });
  });
});

describe('delivery (code-house-rules 12.8 "One effect", 12.9)', () => {
  it('PRD-INT-008 PRD-SEC-018 delivers the event under the consumer’s service identity, and a redelivery has no second effect', async () => {
    const recordId = await publishChange();
    const running = worker();
    await running.start();
    await eventually(async () => (await echoes(recordId)).length === 1);
    const [dispatch] = await dispatches(recordId);
    await eventually(async () => (await job(dispatch?.job_id ?? ''))?.state === 'completed');
    expect(await echoes(recordId)).toEqual([{ actor_id: consumerIdentityId }]);

    // The worker crashed after the effect committed and before pg-boss recorded the job done: the same job runs again.
    const [event] = await query<{ id: string }>(
      `select id from kernel.outbox_event where event_type = 'kernel.synthetic-record-changed' and payload->>'recordId' = $1`,
      [recordId],
    );
    const again = await running.deliver(
      world.organisations[0].code,
      { eventId: event?.id ?? '', consumer: 'kernel.synthetic-echo' },
      dispatch?.job_id ?? '',
    );
    expect(again).toEqual({ status: 'completed', output: { outcome: 'done', replayed: true } });
    expect(await echoes(recordId)).toHaveLength(1);
  });

  it('PRD-INT-008 retries a transient failure and still has one effect', async () => {
    const recordId = await publishChange('transient-once');
    await worker().start();
    await eventually(async () => (await echoes(recordId)).length === 1);
    const [dispatch] = await dispatches(recordId);
    await eventually(async () => (await job(dispatch?.job_id ?? ''))?.state === 'completed');
    expect((await job(dispatch?.job_id ?? ''))?.retry_count).toBe(1);
    expect(await echoes(recordId)).toHaveLength(1);
  });

  it('code-house-rules 12.9 never retries a defect: the job fails at once and stays failed', async () => {
    const recordId = await publishChange('defect');
    await worker().start();
    await eventually(async () => (await dispatches(recordId)).length === 1);
    const [dispatch] = await dispatches(recordId);
    await eventually(async () => (await job(dispatch?.job_id ?? ''))?.state === 'failed');
    expect((await job(dispatch?.job_id ?? ''))?.retry_count).toBe(0);
    expect(await echoes(recordId)).toEqual([]);
    expect(log.lines.some((line) => line.jobKind === 'kernel.synthetic-echo' && line.outcome === 'defect')).toBe(true);
  });

  it('code-house-rules 12.9 keeps a refusal under the event’s key, completes the job and never retries it', async () => {
    const recordId = await publishChange('refuse');
    await worker().start();
    await eventually(async () => (await dispatches(recordId)).length === 1);
    const [dispatch] = await dispatches(recordId);
    await eventually(async () => (await job(dispatch?.job_id ?? ''))?.state === 'completed');
    expect(await job(dispatch?.job_id ?? '')).toMatchObject({
      retry_count: 0,
      output: { outcome: 'refused', code: 'kernel.synthetic-state-changed' },
    });
    expect(await echoes(recordId)).toEqual([]);
  });
});

describe('starting the worker (code-house-rules 12.8, 12.9)', () => {
  it('refuses to start with a consumer of an unknown event type', async () => {
    const stray = defineConsumer({ ...echo, name: 'kernel.synthetic-stray' });
    const bad = new Worker({
      router,
      runner: runner(),
      helper: new IdempotencyHelper({
        runner: runner(),
        logger: log.logger,
        secretCheck: secretCheckNotImplemented,
        cipher: restrictedValueCipherNotConfigured,
      }),
      identities,
      logger: log.logger,
      registry: { events: [], consumers: [stray], jobKinds: [] },
      settings: { ...settings, consumers: { 'kernel.synthetic-stray': echoRetry } },
    });
    await expect(bad.start()).rejects.toThrow(/no unit declares/);
  });

  it('PRD-MOD-001 serves every Organisation the directory lists, each in its own database', async () => {
    const running = worker();
    await running.start();
    const seen = await query<{ name: string }>('select name from kernel.outbox_consumer');
    expect(seen).toEqual([{ name: 'kernel.synthetic-echo' }]);
    const owner = await connect(world.organisations[1].database, 'migration');
    try {
      await eventually(async () => (await owner.query('select 1 from kernel.outbox_consumer')).rows.length === 1);
    } finally {
      await owner.end();
    }
  });
});
