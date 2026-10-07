import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import { errorEnvelopeSchema, IDEMPOTENT_REPLAYED_HEADER, myWorkSchema } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { approvalDecided, approvalRequested } from '../src/modules/access/index.js';
// The access module's JobIdentities, as AccessJobIdentitiesModule provides it to the worker (RR-273).
import { jobIdentities } from '../src/modules/access/commands/job-identities.js';
import { INBOX_IDENTITY, inboxConsumers } from '../src/modules/inbox/index.js';
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
import { grantSynthetic } from './support/grants.js';
import { capturingLogger, eventually, writeSyntheticServiceIdentity } from './support/jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';
import { syntheticWorkerSettings } from './fixtures/worker-settings.js';

// S1-F01-T13: the approval journey through the API, with My work fed by the worker (access-and-approvals 9.1, 9.5,
// 11, 15 test 20; module-map 4.8, 6.2 flow A; PRD-ACS-009, PRD-INT-002, PRD-INT-008). The Admin prepares, the
// approver sees the request in My work and decides it with a fresh code; a replayed event makes no second item; an
// ineligible reader sees nothing. Every value is SYNTHETIC, the worker settings included (CH-10).

const SYNTHETIC_THROTTLING = { failureLimit: 50, windowSeconds: 600 };
const SYNTHETIC_PASSWORD_RULES = { minimumLength: 12 };
const SYNTHETIC_LIMITS = { idleLockSeconds: 3600, absoluteSeconds: 7200 };
/** The inbox's consumers, with SYNTHETIC worker settings (DEC-118, DEC-119; CH-10). */
const inboxRegistry: JobRegistry = {
  events: [approvalRequested, approvalDecided],
  consumers: inboxConsumers,
  jobKinds: [],
};

type Enrolled = SyntheticUser & { factorSecret: Buffer };

let world: SyntheticWorld;
let database: string;
let keys: Record<string, string>;
let api: AccessTestApp;
let clock: SyntheticClock;
let router: OrganisationRouter;
let worker: Worker;
const log = capturingLogger();
let admin: Enrolled;
let approver: Enrolled;
let outsider: Enrolled;
const cookies = new Map<string, string>();

beforeAll(async () => {
  world = await createSyntheticOrganisations('mywork');
  const organisation = world.organisations[0];
  database = organisation.database;
  keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
  await writeSyntheticSetting(database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
  await writeSyntheticSetting(database, 'access.office-session-limits', SYNTHETIC_LIMITS);
  await writeSyntheticServiceIdentity(database, OUTBOX_PROCESSOR_IDENTITY, [OUTBOX_AUTHORITY]);
  await writeSyntheticServiceIdentity(database, INBOX_IDENTITY, [{ action: 'edit', recordType: 'inbox.work_item' }]);
  const enrolled = async (label: string) =>
    (await writeSyntheticUser(database, organisation.code, keys, { label, enrolled: true })) as Enrolled;
  admin = await enrolled('ADMIN');
  approver = await enrolled('APPROVER');
  outsider = await enrolled('OUTSIDER');
  await grantSynthetic(database, { kind: 'user', id: admin.id }, [
    { recordType: 'access.role', action: 'create' },
    { recordType: 'access.approval_reason', action: 'create' },
    { recordType: 'access.approval_request', action: 'view' },
  ]);
  await grantSynthetic(database, { kind: 'user', id: approver.id }, [
    { recordType: 'access.role', action: 'approve' },
    { recordType: 'access.approval_reason', action: 'approve' },
    { recordType: 'access.approval_reason', action: 'view' },
    { recordType: 'access.approval_request', action: 'view' },
  ]);
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock });
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    log.logger,
  );
  const runner = new CommandRunner({
    clock: { now: () => new Date() },
    timezones: syntheticTimezone,
    logger: log.logger,
  });
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
    registry: inboxRegistry,
    settings: syntheticWorkerSettings(inboxRegistry, { fast: true }),
  });
  // A consumer receives only events recorded after it is first registered, so the worker starts first.
  await worker.start();
});

afterAll(async () => {
  await (worker as Worker | undefined)?.stop();
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

interface Call {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
}

function freshAddress(): string {
  return `10.${String(randomInt(256))}.${String(randomInt(256))}.${String(randomInt(1, 255))}`;
}

async function post(path: string, body: unknown, options: { cookie?: string; key?: string | null } = {}) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': freshAddress(),
    origin: SYNTHETIC_ORIGIN,
  };
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  if (options.key !== null) headers['idempotency-key'] = options.key ?? uuidv7();
  const response = await fetch(`${api.baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json(), headers: response.headers } as Call;
}

async function get(path: string, cookie: string): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie } });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

function freshCode(user: Enrolled): string {
  clock.advance(30);
  return codeFor(user.factorSecret, 0, clock.now());
}

async function cookieOf(user: Enrolled): Promise<string> {
  const known = cookies.get(user.id);
  if (known !== undefined) return known;
  const call = await post(
    '/api/access/sign-in',
    {
      organisationCode: world.organisations[0].code,
      login: user.login,
      password: user.password,
      totpCode: freshCode(user),
    },
    { key: null },
  );
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  const cookie = (call.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  cookies.set(user.id, cookie);
  return cookie;
}

async function myWork(user: Enrolled) {
  const call = await get('/api/inbox/my-work', await cookieOf(user));
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return myWorkSchema.parse(call.body).items;
}

async function owner<T extends object>(text: string, values: unknown[] = []): Promise<T[]> {
  const client = await connect(database, 'migration');
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

const today = () => clock.now().toISOString().slice(0, 10);

describe('the approval journey (access-and-approvals 9, 11; test 20; S1-F01-AT13, AT14)', () => {
  let reasonId = '';

  it('POL-02.23 DEC-104 the first reason is approved from My work with a free-text reason', async () => {
    const prepared = await post(
      '/api/access/approval-reasons',
      { code: 'SYN-APPROVE', kind: 'approve', text: 'SYNTHETIC approve', validFrom: today() },
      { cookie: await cookieOf(admin) },
    );
    expect(prepared.status).toBe(200);
    const answer = prepared.body as { reasonId: string; versionId: string; requestId: string };
    await eventually(async () => (await myWork(approver)).some((item) => item.owner.recordId === answer.requestId));
    const decided = await post(
      `/api/access/approval-requests/${answer.requestId}/decision`,
      {
        versionId: answer.versionId,
        outcome: 'approve',
        reason: { kind: 'free-text', text: 'SYNTHETIC first list' },
        totpCode: freshCode(approver),
      },
      { cookie: await cookieOf(approver) },
    );
    expect(decided.status).toBe(200);
    reasonId = answer.reasonId;
    const listed = await get('/api/access/approval-reasons', await cookieOf(approver));
    expect(listed.body).toMatchObject({ reasons: [{ id: reasonId, kind: 'approve', code: 'SYN-APPROVE' }] });
  });

  it('PRD-ACS-009 PRD-INT-008 shows the request to whoever may decide it, once, and to no one else', async () => {
    const prepared = await post(
      '/api/access/roles',
      {
        code: 'SYN-JOURNEY',
        name: 'SYNTHETIC journey role',
        permissions: [{ kind: 'action', recordType: 'access.role', action: 'view', selfService: false }],
        validFrom: today(),
      },
      { cookie: await cookieOf(admin) },
    );
    expect(prepared.status).toBe(200);
    const role = prepared.body as { roleId: string; versionId: string; requestId: string };
    await eventually(async () => (await myWork(approver)).some((item) => item.owner.recordId === role.requestId));
    const item = (await myWork(approver)).find((each) => each.owner.recordId === role.requestId);
    expect(item).toMatchObject({
      kind: 'approval',
      owner: { module: 'access', recordType: 'access.approval_request', versionId: role.versionId },
      due: { kind: 'none' },
      exposure: { kind: 'none' },
      state: 'Awaiting approval',
      nextAction: 'access.decide-approval',
    });
    // The preparer may not decide it, and the outsider holds no approve: neither sees it (PRD-ACS-006).
    expect((await myWork(admin)).map((each) => each.owner.recordId)).not.toContain(role.requestId);
    expect(await myWork(outsider)).toEqual([]);

    // The worker crashed after the effect and before acknowledging: the event is delivered again (PRD-INT-008).
    const [dispatch] = await owner<{ event_id: string; job_id: string }>(
      `select e.id as event_id, d.job_id from kernel.outbox_dispatch d join kernel.outbox_event e on e.id = d.outbox_event_id
       where e.event_type = 'access.approval-requested' and e.subject_record_id = $1`,
      [role.requestId],
    );
    await worker.deliver(
      world.organisations[0].code,
      { eventId: dispatch?.event_id ?? '', consumer: 'inbox.publish-approval' },
      dispatch?.job_id ?? '',
    );
    const items = await owner('select id from inbox.work_item where owner_record_id = $1', [role.requestId]);
    expect(items).toHaveLength(1);

    // The panel says the approver may decide it, with a listed reason (PRD-UXP-003).
    const panel = await get(`/api/access/approval-requests/${role.requestId}`, await cookieOf(approver));
    expect(panel.body).toMatchObject({
      id: role.requestId,
      preparers: [admin.id],
      state: 'Awaiting approval',
      decidable: { kind: 'available', reason: 'listed' },
    });
    const own = await get(`/api/access/approval-requests/${role.requestId}`, await cookieOf(admin));
    expect(own.body).toMatchObject({ decidable: { kind: 'unavailable', code: 'access.not-eligible' } });

    // The decision, sent twice with one key: one effect, the first answer again (PRD-INT-002).
    const key = uuidv7();
    const body = {
      versionId: role.versionId,
      outcome: 'approve',
      reason: { kind: 'listed', reasonId },
      totpCode: freshCode(approver),
    };
    const path = `/api/access/approval-requests/${role.requestId}/decision`;
    const first = await post(path, body, { cookie: await cookieOf(approver), key });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ requestId: role.requestId, outcome: 'Approved' });
    const again = await post(
      path,
      { ...body, totpCode: freshCode(approver) },
      { cookie: await cookieOf(approver), key },
    );
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(again.headers.get(IDEMPOTENT_REPLAYED_HEADER)).not.toBeNull();
    expect(
      await owner('select id from access.approval_decision where approval_request_id = $1', [role.requestId]),
    ).toHaveLength(1);

    // Decided: the item leaves My work at once, since eligibility is checked at read (11.2), and the worker closes it.
    expect((await myWork(approver)).map((each) => each.owner.recordId)).not.toContain(role.requestId);
    const closed = () =>
      owner<{ state: string; open: boolean }>('select state, open from inbox.work_item where owner_record_id = $1', [
        role.requestId,
      ]);
    await eventually(async () => (await closed())[0]?.open === false);
    expect(await closed()).toEqual([{ state: 'Approved', open: false }]);

    // A second decision with a new key is refused: the request is no longer open.
    const late = await post(path, { ...body, totpCode: freshCode(approver) }, { cookie: await cookieOf(approver) });
    expect(late.status).toBe(422);
    expect(errorEnvelopeSchema.parse(late.body).error.code).toBe('access.approval-not-open');
  });
});

describe('the order of My work (access-and-approvals 11.2; test 20; S1-F01-AT13)', () => {
  it('PRD-ACS-009 PRD-MOD-015 orders by due time, then exposure largest first, Unknown above known, through the API', async () => {
    const reader = (await writeSyntheticUser(database, world.organisations[0].code, keys, {
      label: 'ORDER',
      enrolled: true,
    })) as Enrolled;
    // SYNTHETIC tasks named to the reader, written as the owner, since no routing or valued document exists yet (RR-058).
    const soon = new Date(Date.now() + 3_600_000);
    const later = new Date(Date.now() + 7_200_000);
    const items: { label: string; dueAt: Date | null; exposure: 'none' | 'unknown' | number }[] = [
      { label: 'no-due-none', dueAt: null, exposure: 'none' },
      { label: 'later-known-500', dueAt: later, exposure: 50_000 },
      { label: 'no-due-known-100', dueAt: null, exposure: 10_000 },
      { label: 'later-unknown', dueAt: later, exposure: 'unknown' },
      { label: 'soon-none', dueAt: soon, exposure: 'none' },
      { label: 'no-due-unknown', dueAt: null, exposure: 'unknown' },
      { label: 'later-known-900', dueAt: later, exposure: 90_000 },
    ];
    const labels = new Map<string, string>();
    for (const item of items) {
      const id = uuidv7();
      labels.set(id, item.label);
      await owner(
        `insert into inbox.work_item (id, kind, owner_module, owner_record_type, owner_record_id, owner_version_id,
           state, open, due_at, exposure_kind, exposure_amount)
         values ($1, 'task', 'syn', 'syn.task', $2, $3, 'Open', true, $4, $5, $6)`,
        [
          id,
          uuidv7(),
          uuidv7(),
          item.dueAt,
          typeof item.exposure === 'number' ? 'known' : item.exposure,
          typeof item.exposure === 'number' ? item.exposure : null,
        ],
      );
      await owner('insert into inbox.work_item_actor (id, work_item_id, user_id) values ($1, $2, $3)', [
        uuidv7(),
        id,
        reader.id,
      ]);
    }
    const listed = await myWork(reader);
    expect(listed.map((item) => labels.get(item.id))).toEqual([
      'soon-none',
      'later-unknown',
      'later-known-900',
      'later-known-500',
      'no-due-unknown',
      'no-due-known-100',
      'no-due-none',
    ]);
    expect(listed[1]?.exposure).toEqual({ kind: 'unknown' });
  });
});
