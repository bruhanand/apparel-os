import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  myWorkSchema,
  permissionRegistry,
  workItemRoutingListSchema,
  type RecordTypeDeclaration,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandRunner,
  newCorrelationId,
  OrganisationRouter,
  type DeliveredEvent,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { Access, approvalRequested, type ApprovalRule } from '../src/modules/access/index.js';
import { Audit } from '../src/modules/audit/index.js';
import { Inbox, inboxConsumers, inboxJobKinds } from '../src/modules/inbox/index.js';
import { syntheticIdentifier } from './fixtures/synthetic.js';
import {
  codeFor,
  startAccessApp,
  SYNTHETIC_ORIGIN,
  SyntheticClock,
  syntheticKeysEnvironment,
  syntheticTimezone,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { TEST_COMPOSITION } from './support/composition.js';
import { grantSynthetic } from './support/grants.js';
import { capturingLogger } from './support/jobs.js';
import { writeSyntheticSites } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';

// S1-F05-T02: due times and escalation for approvals and tasks (access-and-approvals 9.4, 11.1, 11.3, 13.2, 15 test
// 20a; module-map 4.8; PRD-ACS-010; GC3-8, DEC-105). Routing is prepared and approved through the HTTP API; the inbox's
// consumer and its escalation job are run directly in commands of their own, as the worker runs them. A test-only
// action type stands for a booking at a Site (code-house-rules 11.4). Every routing, due time, recipient and value
// here is SYNTHETIC: the real ones are KDPS's (KDPS question 52, RR-058).

const SYNTHETIC_THROTTLING = { failureLimit: 50, windowSeconds: 600 };
const SYNTHETIC_PASSWORD_RULES = { minimumLength: 12 };
const SYNTHETIC_LIMITS = { idleLockSeconds: 3600, absoluteSeconds: 7200 };
/** SYNTHETIC due-time rule: due an hour after the item is requested. */
const SYNTHETIC_DUE = { format: 'elapsed-minutes-v1', minutes: 60 } as const;
const SITE = '01900000-0000-7000-8000-0000000f5001';
const OTHER_SITE = '01900000-0000-7000-8000-0000000f5002';

const MODULE = syntheticIdentifier('routing');
const BOOKING_TYPE = `${MODULE}.booking`;
const BOOKING = `${MODULE}.approve-booking`;
const bookingType: RecordTypeDeclaration = {
  code: BOOKING_TYPE,
  actions: ['view', 'approve'],
  scopeFacts: { legalEntity: false, place: true, brand: false },
  subject: false,
  fieldClasses: [],
  serviceOnly: false,
};
const bookingRule: ApprovalRule = {
  actionType: BOOKING,
  module: MODULE,
  recordType: BOOKING_TYPE,
  independent: true,
  value: 'none',
  freeTextReason: false,
  decisionEvidenceClasses: [],
  synthetic: true,
};

type Enrolled = SyntheticUser & { factorSecret: Buffer };

let world: SyntheticWorld;
let database: string;
let keys: Record<string, string>;
let api: AccessTestApp;
let clock: SyntheticClock;
let router: OrganisationRouter;
let routed: RoutedOrganisation;
const log = capturingLogger();
let admin: Enrolled;
let approver: Enrolled;
let bookingApprover: Enrolled;
let recipient: Enrolled;
let clerk: Enrolled;
let clerkAssignment: string;
let approveReasonId: string;
const cookies = new Map<string, string>();
let fixtureAccess: Access;

beforeAll(async () => {
  world = await createSyntheticOrganisations('routing');
  const organisation = world.organisations[0];
  database = organisation.database;
  keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
  await writeSyntheticSetting(database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
  await writeSyntheticSetting(database, 'access.office-session-limits', SYNTHETIC_LIMITS);
  const enrolled = async (label: string) =>
    (await writeSyntheticUser(database, organisation.code, keys, { label, enrolled: true })) as Enrolled;
  admin = await enrolled('ROUTING-ADMIN');
  approver = await enrolled('ROUTING-APPROVER');
  bookingApprover = await enrolled('BOOKING-APPROVER');
  recipient = await enrolled('ESCALATION');
  clerk = await enrolled('CLERK');
  await grantSynthetic(database, { kind: 'user', id: admin.id }, [
    { recordType: 'inbox.work_item_routing', action: 'view' },
    { recordType: 'inbox.work_item_routing', action: 'edit' },
  ]);
  await grantSynthetic(database, { kind: 'user', id: approver.id }, [
    { recordType: 'inbox.work_item_routing', action: 'view' },
    { recordType: 'inbox.work_item_routing', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
  ]);
  const registry = [...permissionRegistry, bookingType];
  await grantSynthetic(
    database,
    { kind: 'user', id: bookingApprover.id },
    [{ recordType: BOOKING_TYPE, action: 'approve' }],
    {
      registry,
    },
  );
  clerkAssignment = (
    await grantSynthetic(database, { kind: 'user', id: clerk.id }, [{ recordType: BOOKING_TYPE, action: 'view' }], {
      registry,
    })
  ).assignmentId;
  approveReasonId = await writeSyntheticReason(database, 'approve');
  await writeSyntheticSites(database, [SITE, OTHER_SITE]);
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, {
    clock,
    extraRecordTypes: [bookingType],
    extraApprovalRules: [bookingRule],
  });
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    log.logger,
  );
  const found = await router.resolveForSignIn(organisation.code);
  if (!found.routed) throw new Error('not routed');
  routed = found.organisation;
  fixtureAccess = new Access({
    audit: new Audit(log.logger),
    registry,
    approvalRules: [bookingRule],
    composition: TEST_COMPOSITION,
  });
});

afterAll(async () => {
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

function run<T>(work: (context: TransactionContext) => Promise<T>, at: Date = clock.now()): Promise<T> {
  return new CommandRunner({ clock: { now: () => at }, timezones: syntheticTimezone, logger: log.logger }).run(
    {
      commandName: 'test-syn-routing.command',
      organisation: routed,
      correlationId: newCorrelationId(),
      actor: { kind: 'actor', actorId: clerk.id },
    },
    work,
  );
}

interface Call {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
}

const address = () => `10.${String(randomInt(256))}.${String(randomInt(256))}.${String(randomInt(1, 255))}`;

async function post(path: string, body: unknown, options: { cookie?: string; key?: string | null } = {}) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': address(),
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

async function cookieOf(user: Enrolled): Promise<string> {
  const known = cookies.get(user.id);
  if (known !== undefined) return known;
  clock.advance(30);
  const call = await post(
    '/api/access/sign-in',
    {
      organisationCode: world.organisations[0].code,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret, 0, clock.now()),
    },
    { key: null },
  );
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  const cookie = (call.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  cookies.set(user.id, cookie);
  return cookie;
}

async function rows<T extends object>(text: string, values: unknown[] = []): Promise<T[]> {
  const client = await connect(database, 'migration');
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

const today = () => clock.now().toISOString().slice(0, 10);
const errorCode = (call: Call) => (call.body as { error: { code: string } }).error.code;

function prepare(body: Record<string, unknown>) {
  return async () =>
    post(
      '/api/inbox/routing',
      { dueRule: SYNTHETIC_DUE, validFrom: today(), origin: 'synthetic', ...body },
      { cookie: await cookieOf(admin) },
    );
}

async function decide(user: Enrolled, prepared: Call) {
  const { versionId, requestId } = prepared.body as { versionId: string; requestId: string };
  const cookie = await cookieOf(user);
  clock.advance(30);
  return post(
    `/api/access/approval-requests/${requestId}/decision`,
    {
      versionId,
      outcome: 'approve',
      reason: { kind: 'listed', reasonId: approveReasonId },
      totpCode: codeFor(user.factorSecret, 0, clock.now()),
    },
    { cookie },
  );
}

/** A SYNTHETIC booking at a Site whose approval the clerk requests; the published event, as the worker hands it on. */
async function bookingAt(siteId: string): Promise<DeliveredEvent<Record<string, unknown>>> {
  const document = { module: MODULE, recordType: BOOKING_TYPE, recordId: uuidv7(), versionId: uuidv7() };
  const requestId = await run((context) =>
    fixtureAccess.requestApproval(context, {
      actionType: BOOKING,
      document,
      value: { kind: 'none' },
      preparers: [clerk.id],
      requestedBy: { userId: clerk.id, roleAssignmentId: clerkAssignment },
      facts: { siteId },
    }),
  );
  const [event] = await rows<{
    id: string;
    event_time: Date;
    correlation_id: string;
    site_id: string | null;
    payload: Record<string, unknown>;
  }>(
    `select id, event_time, correlation_id, site_id, payload from kernel.outbox_event
     where event_type = 'access.approval-requested' and subject_record_id = $1`,
    [requestId],
  );
  if (event === undefined) throw new Error('no event');
  return {
    id: event.id,
    type: approvalRequested.type,
    payloadVersion: 1,
    eventTime: event.event_time,
    actorId: clerk.id,
    onBehalfOfUserId: null,
    correlationId: event.correlation_id,
    subject: {
      module: 'access',
      recordType: 'access.approval_request',
      recordId: requestId,
      versionId: document.versionId,
    },
    scope: event.site_id === null ? {} : { siteId: event.site_id },
    payload: event.payload,
  };
}

const publish = inboxConsumers.find((each) => each.name === 'inbox.publish-approval');
const escalate = inboxJobKinds.find((each) => each.name === 'inbox.escalate-overdue');

async function received(event: DeliveredEvent<Record<string, unknown>>) {
  if (publish === undefined) throw new Error('no consumer');
  await run((context) => publish.handle(context, event, { logger: log.logger }));
  const [item] = await rows<{ id: string; due_at: Date | null; site_id: string | null }>(
    'select id, due_at, site_id from inbox.work_item where owner_record_id = $1',
    [event.subject.recordId],
  );
  if (item === undefined) throw new Error('no item');
  return item;
}

async function escalated(at: Date): Promise<number> {
  if (escalate === undefined) throw new Error('no job kind');
  const answer = (await run((context) => escalate.run(context, { logger: log.logger }), at)) as { escalated: number };
  return answer.escalated;
}

async function myWork(user: Enrolled) {
  const call = await get('/api/inbox/my-work', await cookieOf(user));
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return myWorkSchema.parse(call.body).items;
}

describe('task and approval routing (access-and-approvals 9.4, 11.3; GC3-8, DEC-105)', () => {
  it('RR-058 with no routing in force, an approval item carries no due time and never escalates', async () => {
    const item = await received(await bookingAt(OTHER_SITE));
    expect(item.due_at).toBeNull();
    expect(item.site_id).toBe(OTHER_SITE);
    expect(await escalated(new Date(clock.now().getTime() + 10 * 86_400_000))).toBe(0);
  });

  it('PRD-MOD-010 routing is prepared per action type and Site, never in the past, for an action type with a rule', async () => {
    expect(
      errorCode(
        await prepare({
          actionType: BOOKING,
          siteId: SITE,
          escalation: { kind: 'user', userId: recipient.id },
          validFrom: '2000-01-01',
        })(),
      ),
    ).toBe('inbox.starts-in-past');
    expect(
      errorCode(
        await prepare({
          actionType: `${MODULE}.unknown`,
          siteId: SITE,
          escalation: { kind: 'user', userId: recipient.id },
        })(),
      ),
    ).toBe('inbox.action-type-not-routable');
    expect(
      errorCode(await prepare({ actionType: BOOKING, siteId: SITE, escalation: { kind: 'user', userId: uuidv7() } })()),
    ).toBe('inbox.party-not-found');
    expect(
      errorCode(
        await prepare({ actionType: BOOKING, siteId: uuidv7(), escalation: { kind: 'user', userId: recipient.id } })(),
      ),
    ).toBe('inbox.site-not-found');
  });

  it('POL-02.07 a routing takes effect only when a different authorised person approves it', async () => {
    const prepared = await prepare({
      actionType: BOOKING,
      siteId: SITE,
      escalation: { kind: 'user', userId: recipient.id },
    })();
    expect(prepared.status, JSON.stringify(prepared.body)).toBe(200);
    // Not yet approved: an item gets no due time from it.
    expect((await received(await bookingAt(SITE))).due_at).toBeNull();
    const decided = await decide(approver, prepared);
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    const list = workItemRoutingListSchema.parse((await get('/api/inbox/routing', await cookieOf(admin))).body);
    const routing = list.routings.find((each) => each.actionType === BOOKING && each.siteId === SITE);
    expect(routing?.versions).toMatchObject([
      {
        state: 'In force',
        dueRule: SYNTHETIC_DUE,
        escalation: { party: { kind: 'user', userId: recipient.id } },
        origin: 'synthetic',
      },
    ]);
    expect(list.actionTypes).toEqual(expect.arrayContaining([{ actionType: BOOKING, module: MODULE }]));
  });

  it('PRD-ACS-010 test 20a an approval past its due time escalates: the recipient is added, the owner kept, the escalation recorded', async () => {
    const event = await bookingAt(SITE);
    const item = await received(event);
    expect(item.due_at?.getTime()).toBe(event.eventTime.getTime() + 60 * 60_000);
    // Before its due time, nothing escalates; the eligible approver sees it, the recipient does not yet.
    expect(await escalated(new Date(event.eventTime.getTime() + 59 * 60_000))).toBe(0);
    expect((await myWork(bookingApprover)).map((each) => each.id)).toContain(item.id);
    expect((await myWork(recipient)).map((each) => each.id)).not.toContain(item.id);
    const after = new Date(event.eventTime.getTime() + 61 * 60_000);
    expect(await escalated(after)).toBeGreaterThanOrEqual(1);
    // Once only (PRD-INT-008).
    expect(await escalated(new Date(after.getTime() + 60_000))).toBe(0);
    expect(
      await rows('select recipient_user_id from inbox.work_item_escalation where work_item_id = $1', [item.id]),
    ).toEqual([{ recipient_user_id: recipient.id }]);
    expect((await myWork(recipient)).map((each) => each.id)).toContain(item.id);
    // The owner is kept: whoever may decide it still sees it.
    expect((await myWork(bookingApprover)).map((each) => each.id)).toContain(item.id);
  });

  it('PRD-ACS-010 test 20a a task past its due time escalates the same way', async () => {
    const owner = await writeSyntheticUser(database, world.organisations[0].code, keys, { label: 'TASK-OWNER' });
    const recordId = uuidv7();
    const started = clock.now();
    await run(
      (context) =>
        new Inbox().publish(context, {
          kind: 'task',
          actionType: BOOKING,
          owner: { module: MODULE, recordType: BOOKING_TYPE, recordId, versionId: uuidv7() },
          state: 'Rejected',
          exposure: { kind: 'unknown' },
          facts: { siteId: SITE, storeId: null, businessUnitId: null, brandId: null },
          actors: [{ userId: owner.id }],
        }),
      started,
    );
    const [task] = await rows<{ id: string; due_at: Date | null }>(
      'select id, due_at from inbox.work_item where owner_record_id = $1',
      [recordId],
    );
    expect(task?.due_at?.getTime()).toBe(started.getTime() + 60 * 60_000);
    expect(await escalated(new Date(started.getTime() + 61 * 60_000))).toBeGreaterThanOrEqual(1);
    expect(
      await rows('select user_id from inbox.work_item_actor where work_item_id = $1 order by recorded_at, id', [
        task?.id,
      ]),
    ).toEqual([{ user_id: owner.id }, { user_id: recipient.id }]);
  });
});
