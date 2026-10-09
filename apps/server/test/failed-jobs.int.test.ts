import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import { failedJobListSchema, type FailedJob } from '@apparel-os/schemas';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CommandRunner,
  CommandTimedOut,
  defineConsumer,
  defineEvent,
  IdempotencyHelper,
  jobFailed,
  KEEP_EVERY_JOB,
  newCorrelationId,
  OrganisationRouter,
  OUTBOX_AUTHORITY,
  OUTBOX_PROCESSOR_IDENTITY,
  restrictedValueCipherNotConfigured,
  secretCheckNotImplemented,
  startJobQueue,
  Worker,
  type ConsumerDefinition,
  type JobRegistry,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
// The access module's JobIdentities, as AccessJobIdentitiesModule provides it to the worker (RR-273).
import { jobIdentities } from '../src/modules/access/commands/job-identities.js';
import { Audit } from '../src/modules/audit/index.js';
import {
  EXCEPTION_CODE_KIND,
  Exceptions,
  EXCEPTIONS_IDENTITY,
  exceptionsConsumers,
  unfinishedOperation,
} from '../src/modules/exceptions/index.js';
import { Inbox } from '../src/modules/inbox/index.js';
import { Numbering } from '../src/modules/numbering/index.js';
import { SYNTHETIC_RETRY, SYNTHETIC_TEST_SPEED } from './fixtures/worker-settings.js';
import {
  codeFor,
  startAccessApp,
  SYNTHETIC_ORIGIN,
  SyntheticClock,
  syntheticKeysEnvironment,
  syntheticTimezone,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { defineSyntheticCodeSeries } from './support/exceptions.js';
import { grantSynthetic } from './support/grants.js';
import { capturingLogger, eventually, writeSyntheticServiceIdentity } from './support/jobs.js';
import { openLiveStream } from './support/live.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';

// S1-F08-T04: failed jobs kept and the operations view (code-house-rules 12.9; access-and-approvals 9.8 step 4;
// module-map 4.1; PRD-SEC-013, PRD-SEC-014, PRD-ACS-020; DEC-116; RR-448). A SYNTHETIC consumer that always fails
// transiently exhausts its SYNTHETIC retry setting under a real worker; the operations view lists it, with its
// evidence, to a user holding view on `kernel.job` through a labelled SYNTHETIC role (who holds it is KDPS's: V-01,
// RR-064). Every retry, limit, format and routing here is SYNTHETIC (CH-10, V-03).

const SYNTHETIC_THROTTLING = { failureLimit: 50, windowSeconds: 600 };
const SYNTHETIC_PASSWORD_RULES = { minimumLength: 12 };
const SYNTHETIC_LIMITS = { idleLockSeconds: 3600, absoluteSeconds: 7200 };
const SYNTHETIC_LIVE = { heartbeatMs: 500, streamMs: 120_000 };
const JOB_SITE = '01900000-0000-7000-8000-0000000f5003';
/** A queue no worker of this test works: a job kind's, made by migration (code-house-rules 3.2). */
const IDLE_QUEUE = 'exceptions.escalate-overdue';

type Enrolled = SyntheticUser & { factorSecret: Buffer };

const failing = defineEvent({
  type: 'kernel.synthetic-work-requested',
  version: 1,
  payload: z.object({ recordId: z.uuid() }),
});
const alwaysFails: ConsumerDefinition = defineConsumer({
  name: 'kernel.synthetic-always-fails',
  event: failing,
  serviceIdentity: 'synthetic-failing-consumer',
  authorises: { action: 'view', recordType: 'kernel.outbox_event' },
  handle: (context) => Promise.reject(new CommandTimedOut('statement', '57014', context.correlationId)),
});

let world: SyntheticWorld;
let databaseA: string;
let api: AccessTestApp;
let clock: SyntheticClock;
let router: OrganisationRouter;
let routedA: RoutedOrganisation;
let runner: CommandRunner;
let worker: Worker;
let boss: PgBoss;
const log = capturingLogger();
let operator: Enrolled;
let someone: Enrolled;
let operatorB: Enrolled;
let admin: Enrolled;
const cookies = new Map<string, string>();

beforeAll(async () => {
  world = await createSyntheticOrganisations('failedjobs');
  const [a, b] = world.organisations;
  databaseA = a.database;
  const keys = syntheticKeysEnvironment(world);
  for (const database of [a.database, b.database]) {
    await writeSyntheticSetting(database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
    await writeSyntheticSetting(database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
    await writeSyntheticSetting(database, 'access.office-session-limits', SYNTHETIC_LIMITS);
  }
  const enrolled = async (label: string, database = a.database, code = a.code) =>
    (await writeSyntheticUser(database, code, keys, { label, enrolled: true })) as Enrolled;
  operator = await enrolled('OPERATOR');
  someone = await enrolled('SOMEONE');
  admin = await enrolled('ADMIN');
  operatorB = await enrolled('OPERATOR-B', b.database, b.code);
  // A SYNTHETIC operator role: view on `kernel.job` and on the exceptions it links to.
  const operatorAuthorities = [
    { recordType: 'kernel.job', action: 'view' as const },
    { recordType: 'exceptions.exception', action: 'view' as const },
  ];
  await grantSynthetic(a.database, { kind: 'user', id: operator.id }, operatorAuthorities);
  await grantSynthetic(b.database, { kind: 'user', id: operatorB.id }, operatorAuthorities);
  await grantSynthetic(a.database, { kind: 'user', id: someone.id }, [
    { recordType: 'exceptions.exception', action: 'view' },
  ]);
  await writeSyntheticServiceIdentity(a.database, OUTBOX_PROCESSOR_IDENTITY, [OUTBOX_AUTHORITY]);
  await writeSyntheticServiceIdentity(a.database, 'synthetic-failing-consumer', [alwaysFails.authorises]);
  await writeSyntheticServiceIdentity(a.database, EXCEPTIONS_IDENTITY, [
    { action: 'create', recordType: 'exceptions.exception' },
  ]);

  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock, liveSettings: SYNTHETIC_LIVE });
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    log.logger,
  );
  const found = await router.resolveForSignIn(a.code);
  if (!found.routed) throw new Error('not routed');
  routedA = found.organisation;
  runner = new CommandRunner({ clock: { now: () => new Date() }, timezones: syntheticTimezone, logger: log.logger });
  const registry: JobRegistry = {
    events: [failing, jobFailed],
    consumers: [alwaysFails, ...exceptionsConsumers],
    jobKinds: [],
  };
  // SYNTHETIC: five attempts in all with growing delays (DEC-118, DEC-119); only the first wait is shortened.
  const retry = { ...SYNTHETIC_RETRY, retryDelaySeconds: SYNTHETIC_TEST_SPEED.retryDelaySeconds };
  worker = new Worker({
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
    settings: {
      pollSeconds: SYNTHETIC_TEST_SPEED.pollSeconds,
      consumers: { [alwaysFails.name]: retry, 'exceptions.raise-unfinished-operation': retry },
      jobKinds: {},
    },
  });
  await worker.start();
  boss = await startJobQueue(routedA, log.logger, 'test');
}, 120_000);

afterAll(async () => {
  await (worker as Worker | undefined)?.stop();
  await (boss as PgBoss | undefined)?.stop({ graceful: false, close: false });
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

function run<T>(work: (context: TransactionContext) => Promise<T>, actorId = admin.id): Promise<T> {
  return runner.run(
    {
      commandName: 'test-syn-failed-jobs.fixture',
      organisation: routedA,
      correlationId: newCorrelationId(),
      actor: { kind: 'actor', actorId },
    },
    work,
  );
}

function freshAddress(): string {
  return `10.${String(randomInt(256))}.${String(randomInt(256))}.${String(randomInt(1, 255))}`;
}

async function cookieOf(user: Enrolled, organisationCode = world.organisations[0].code): Promise<string> {
  const known = cookies.get(user.id);
  if (known !== undefined) return known;
  clock.advance(30);
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshAddress(), origin: SYNTHETIC_ORIGIN },
    body: JSON.stringify({
      organisationCode,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret, 0, clock.now()),
    }),
  });
  expect(response.status).toBe(200);
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  cookies.set(user.id, cookie);
  return cookie;
}

async function failedJobs(user: Enrolled, organisationCode?: string) {
  const response = await fetch(`${api.baseUrl}/api/kernel/failed-jobs`, {
    headers: { cookie: await cookieOf(user, organisationCode) },
  });
  const text = await response.text();
  return { status: response.status, text, body: JSON.parse(text) as unknown };
}

async function listed(): Promise<FailedJob[]> {
  const call = await failedJobs(operator);
  expect(call.status, call.text).toBe(200);
  return failedJobListSchema.parse(call.body).jobs;
}

/** Publishes the SYNTHETIC work the failing consumer is handed, at JOB_SITE; answers the job that delivers it. */
async function failingWork(): Promise<string> {
  const recordId = uuidv7();
  const eventId = await run((context) =>
    context.publish(failing, {
      subject: { module: 'kernel', recordType: 'kernel.synthetic_record', recordId },
      scope: { siteId: JOB_SITE },
      payload: { recordId },
    }),
  );
  let jobId: string | undefined;
  await eventually(async () => {
    const client = await connect(databaseA, 'migration');
    try {
      const rows = await client.query<{ job_id: string }>(
        `select d.job_id from kernel.outbox_dispatch d join kernel.outbox_consumer c on c.id = d.outbox_consumer_id
          where d.outbox_event_id = $1 and c.name = $2`,
        [eventId, alwaysFails.name],
      );
      jobId = rows.rows[0]?.job_id;
      return jobId !== undefined;
    } finally {
      await client.end();
    }
  });
  return jobId ?? '';
}

describe('failed jobs kept and listed (code-house-rules 12.9; access-and-approvals 9.8 step 4)', () => {
  it('DEC-116 with no Open exception-code series, a job that exhausts its retries is kept and listed with its evidence', async () => {
    const stream = await openLiveStream(api.baseUrl, await cookieOf(operator));
    try {
      const jobId = await failingWork();
      await eventually(async () => (await listed()).some((job) => job.jobId === jobId), 120_000);
      const job = (await listed()).find((each) => each.jobId === jobId);
      expect(job).toMatchObject({
        queue: 'kernel.outbox-delivery',
        jobKind: alwaysFails.name,
        eventType: failing.type,
        attempts: SYNTHETIC_RETRY.retries + 1,
        attemptsAllowed: SYNTHETIC_RETRY.retries + 1,
        outcome: 'transient',
        errorName: 'CommandTimedOut',
        exception: null,
      });
      expect(job?.failedAt).not.toBeNull();
      // The failure reaches the operator's stream as the job's identity, so the view reads itself again (12.12).
      await stream.waitFor(
        (message) =>
          message.data.kind === 'event' &&
          message.data.type === jobFailed.type &&
          message.data.subject.recordId === jobId,
        30_000,
      );
    } finally {
      stream.close();
    }
  }, 180_000);

  it('PRD-EXC-001 once a series and routing exist, the failed job links to its unfinished-operation exception', async () => {
    await run((context) => defineSyntheticCodeSeries(context, new Numbering({ kinds: [EXCEPTION_CODE_KIND] })));
    const exceptions = new Exceptions({
      numbering: new Numbering({ kinds: [EXCEPTION_CODE_KIND] }),
      inbox: new Inbox(),
      audit: new Audit(log.logger),
      types: [],
    });
    const routing = await run((context) =>
      exceptions.prepareRouting(
        context,
        { userId: admin.id, roleAssignmentId: uuidv7() },
        {
          typeCode: unfinishedOperation.code,
          siteId: JOB_SITE,
          owner: { kind: 'user', userId: admin.id },
          dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
          escalation: { kind: 'user', userId: admin.id },
          validFrom: new Date().toISOString().slice(0, 10),
          origin: 'synthetic',
        },
      ),
    );
    if (routing.kind !== 'done') throw new Error(routing.refusal.code);
    const owner = await connect(databaseA, 'migration');
    try {
      await owner.query(`update exceptions.exception_routing_version set decision = 'Approved' where id = $1`, [
        routing.value.versionId,
      ]);
    } finally {
      await owner.end();
    }
    const jobId = await failingWork();
    await eventually(
      async () => (await listed()).some((job) => job.jobId === jobId && job.exception !== null),
      120_000,
    );
    const job = (await listed()).find((each) => each.jobId === jobId);
    expect(job?.exception?.code).toMatch(/^SYN-EX-/);
  }, 180_000);

  it('RR-448 a job pg-boss fails for passing its active limit is listed too', async () => {
    const id = (await boss.send(IDLE_QUEUE, {}, { ...KEEP_EVERY_JOB, retryLimit: 0, expireInSeconds: 1 })) ?? '';
    const [fetched] = await boss.fetch(IDLE_QUEUE);
    expect(fetched?.id).toBe(id);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await boss.supervise();
    const job = (await listed()).find((each) => each.jobId === id);
    expect(job).toMatchObject({
      queue: IDLE_QUEUE,
      jobKind: IDLE_QUEUE,
      eventId: null,
      eventType: null,
      outcome: 'active-limit-passed',
      errorName: null,
      exception: null,
    });
  });

  it('CH-9 the job queue’s own clean-up never removes a failed job, however long ago it failed', async () => {
    const before = await listed();
    expect(before.length).toBeGreaterThanOrEqual(3);
    const owner = await connect(databaseA, 'migration');
    try {
      await owner.query(
        `update pgboss.job set completed_on = completed_on - interval '3650 days' where state = 'failed'`,
      );
    } finally {
      await owner.end();
    }
    await boss.supervise();
    expect((await listed()).map((job) => job.jobId).sort()).toEqual(before.map((job) => job.jobId).sort());
  });

  it('PRD-SEC-014 the list holds no secret, restricted value or error message', async () => {
    const call = await failedJobs(operator);
    expect(call.text).not.toContain('job timed out');
    expect(call.text).not.toContain(operator.password);
    expect(call.text).not.toContain('57014');
  });

  it('PRD-SEC-013 a user without view on kernel.job is refused, naming the permission', async () => {
    const call = await failedJobs(someone);
    expect(call.status).toBe(403);
    expect(call.body).toMatchObject({
      error: {
        code: 'access.not-authorised',
        missing: [{ kind: 'permission', recordType: 'kernel.job', action: 'view' }],
      },
    });
  });

  it('PRD-ACS-020 a second Organisation sees none of these failed jobs', async () => {
    const call = await failedJobs(operatorB, world.organisations[1].code);
    expect(call.status, call.text).toBe(200);
    expect(failedJobListSchema.parse(call.body).jobs).toEqual([]);
  });
});
