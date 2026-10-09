import { paise, uuidv7 } from '@apparel-os/domain';
import {
  permissionRegistry,
  type ApprovalLimitDraft,
  type AssignmentScope,
  type RecordTypeDeclaration,
} from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandRunner,
  LOCK_STEP,
  newCorrelationId,
  OrganisationRouter,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { Access, type ApprovalRule, type DecisionInput, type Preparer } from '../src/modules/access/index.js';
// The access module's own key reader, so the fresh-code check opens the synthetic factor secrets (11.2).
import { OrganisationKeys } from '../src/modules/access/domain/organisation-keys.js';
import { Audit } from '../src/modules/audit/index.js';
import { syntheticIdentifier } from './fixtures/synthetic.js';
import {
  codeFor,
  syntheticKeysEnvironment,
  syntheticTimezone,
  writeSyntheticReason,
  writeSyntheticUser,
  type SyntheticUser,
} from './support/access.js';
import { TEST_COMPOSITION } from './support/composition.js';
import { grantSynthetic } from './support/grants.js';
import { capturingLogger } from './support/jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';

// S1-F05-T01: approval limits and routing (access-and-approvals 9.2 to 9.5, 9.7, 13.1, 15 tests 13, 13a, 15;
// domain-model section 5; POL-02.07, POL-02.09, POL-02.15, PRD-ACS-015, PRD-ACS-016; DM-8, DEC-043, DEC-105, DEC-116).
// Bookings, day closes and offers arrive in later stages, so test-only action types stand for them: their documents
// live in `test_approvals.document`, made by this file as the migration role in its own database copies (code-house-
// rules 11.4, as built), and their rules carry the DEC-105 bases of test 13a. Commands run as the runtime role through
// Organisation routing, on a clock that moves 30 seconds before each decision, so each fresh authenticator code is of a
// later step (3.3). Every limit, holder, value and document here is SYNTHETIC: the real limits and their holders are
// OPEN (V-02, RR-065; KDPS Owner).

const MODULE = syntheticIdentifier('approvals');
const BOOKING_TYPE = `${MODULE}.booking`;
const DAY_CLOSE_TYPE = `${MODULE}.day_close`;
const OFFER_TYPE = `${MODULE}.offer`;
/** Booking approval, on the booking's value at cost (DM-8, DEC-105). */
const BOOKING = `${MODULE}.approve-booking`;
/** Day-close cash variance, on the difference (DM-8, DEC-105). */
const DAY_CLOSE = `${MODULE}.approve-day-close-variance`;
/** Offer approval: no value limit (DM-8, DEC-105). */
const OFFER = `${MODULE}.approve-offer`;

const declared = (code: string): RecordTypeDeclaration => ({
  code,
  actions: ['view', 'create', 'approve'],
  scopeFacts: { legalEntity: false, place: false, brand: false },
  subject: false,
  fieldClasses: [],
  serviceOnly: false,
});
const REGISTRY = [...permissionRegistry, declared(BOOKING_TYPE), declared(DAY_CLOSE_TYPE), declared(OFFER_TYPE)];
const rule = (actionType: string, recordType: string, value: ApprovalRule['value']): ApprovalRule => ({
  actionType,
  module: MODULE,
  recordType,
  independent: true,
  value,
  freeTextReason: false,
  decisionEvidenceClasses: [],
  synthetic: true,
});
const RULES = [
  rule(BOOKING, BOOKING_TYPE, 'cost'),
  rule(DAY_CLOSE, DAY_CLOSE_TYPE, 'cash-difference'),
  rule(OFFER, OFFER_TYPE, 'none'),
];

const TEST_SCHEMA = `
  create schema test_approvals;
  grant usage on schema test_approvals to aos_runtime;
  create table test_approvals.document (id uuid primary key, kind text not null, version_id uuid not null);
  grant select, insert on test_approvals.document to aos_runtime;
`;

const ALL_MEMBERS: AssignmentScope = {
  kind: 'dimensions',
  legalEntity: { kind: 'all' },
  place: { kind: 'all' },
  brand: { kind: 'all' },
};

let world: SyntheticWorld;
let database: string;
let router: OrganisationRouter;
let routed: RoutedOrganisation;
let access: Access;
let keysEnvironment: Record<string, string>;
const log = capturingLogger();
let offsetMs = 0;

/** The Admin who prepares limits, the person who approves them, and the preparer of the documents. */
let admin: SyntheticUser;
let adminPreparer: Preparer;
let limitApprover: SyntheticUser;
let clerk: SyntheticUser;
let clerkAssignment: string;
let approveReason: string;

/** A person holding approve on the test documents through a SYNTHETIC role of their own. */
interface Approver {
  readonly user: SyntheticUser;
  readonly roleId: string;
  readonly assignmentId: string;
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('limits');
  database = world.organisations[0].database;
  await asOwner((client) => client.query(TEST_SCHEMA));
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 6 },
    log.logger,
  );
  const found = await router.resolveForSignIn(world.organisations[0].code);
  if (!found.routed) throw new Error('not routed');
  routed = found.organisation;
  keysEnvironment = syntheticKeysEnvironment(world);
  access = new Access({
    audit: new Audit(log.logger),
    keys: OrganisationKeys.fromEnvironment(keysEnvironment),
    registry: REGISTRY,
    approvalRules: RULES,
    composition: TEST_COMPOSITION,
  });
  const enrolled = (label: string) =>
    writeSyntheticUser(database, routed.organisationCode, keysEnvironment, { label, enrolled: true });
  admin = await enrolled('LIMIT-ADMIN');
  limitApprover = await enrolled('LIMIT-APPROVER');
  clerk = await enrolled('CLERK');
  const adminGrant = await grantSynthetic(
    database,
    { kind: 'user', id: admin.id },
    [
      { recordType: 'access.approval_limit', action: 'view' },
      { recordType: 'access.approval_limit', action: 'create' },
      // The Admin may also approve limits, so the refusal of their own preparation is the rule's alone (POL-02.07).
      { recordType: 'access.approval_limit', action: 'approve' },
    ],
    { registry: REGISTRY },
  );
  adminPreparer = { userId: admin.id, roleAssignmentId: adminGrant.assignmentId };
  await grantSynthetic(database, { kind: 'user', id: limitApprover.id }, [
    { recordType: 'access.approval_limit', action: 'approve' },
  ]);
  clerkAssignment = (
    await grantSynthetic(
      database,
      { kind: 'user', id: clerk.id },
      [BOOKING_TYPE, DAY_CLOSE_TYPE, OFFER_TYPE].map((recordType) => ({ recordType, action: 'create' as const })),
      { registry: REGISTRY },
    )
  ).assignmentId;
  approveReason = await writeSyntheticReason(database, 'approve');
});

afterAll(async () => {
  await (router as OrganisationRouter | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

async function asOwner<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(database, 'migration');
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

function now(): Date {
  return new Date(Date.now() + offsetMs);
}

const today = () => now().toISOString().slice(0, 10);
const dayFrom = (days: number) => new Date(now().getTime() + days * 86_400_000).toISOString().slice(0, 10);

function as<T>(actorId: string, work: (context: TransactionContext) => Promise<T>): Promise<T> {
  const runner = new CommandRunner({ clock: { now }, timezones: syntheticTimezone, logger: log.logger });
  return runner.run(
    {
      commandName: 'access.synthetic-test',
      organisation: routed,
      correlationId: newCorrelationId(),
      actor: { kind: 'actor', actorId },
    },
    work,
  );
}

function decide(user: SyntheticUser, input: Omit<DecisionInput, 'totpCode' | 'reason'>) {
  offsetMs += 30_000;
  if (user.factorSecret === undefined) throw new Error('not enrolled');
  const totpCode = codeFor(user.factorSecret, 0, now());
  return as(user.id, (c) =>
    access.decide(
      c,
      { kind: 'user', id: user.id },
      { ...input, reason: { kind: 'listed', reasonId: approveReason }, totpCode },
    ),
  );
}

let approverCount = 0;
/** A new person holding approve on every test document type through a SYNTHETIC role of their own. */
async function approver(): Promise<Approver> {
  approverCount += 1;
  const user = await writeSyntheticUser(database, routed.organisationCode, keysEnvironment, {
    label: `APPROVER-${String(approverCount)}`,
    enrolled: true,
  });
  const granted = await grantSynthetic(
    database,
    { kind: 'user', id: user.id },
    [BOOKING_TYPE, DAY_CLOSE_TYPE, OFFER_TYPE].map((recordType) => ({ recordType, action: 'approve' as const })),
    { registry: REGISTRY },
  );
  return { user, ...granted };
}

/** Prepares a limit as the Admin. */
function prepare(draft: ApprovalLimitDraft) {
  return as(admin.id, (c) => access.prepareApprovalLimit(c, adminPreparer, draft));
}

/** A SYNTHETIC limit of a role, prepared by the Admin and approved by the limit approver; answers its identifier. */
async function roleLimit(
  holder: Approver,
  actionType: string,
  limit: ApprovalLimitDraft['limit'],
  coversUnknown = false,
): Promise<string> {
  const prepared = await prepare({
    actionType,
    holder: { kind: 'role', roleId: holder.roleId, scope: ALL_MEMBERS },
    limit,
    coversUnknown,
    origin: 'synthetic',
    validFrom: today(),
  });
  if (prepared.kind !== 'success') throw new Error(`limit not prepared: ${prepared.refusal.code}`);
  const decided = await decide(limitApprover, {
    requestId: prepared.answer.requestId,
    versionId: prepared.answer.limitId,
    outcome: 'approve',
  });
  if (decided.kind !== 'success') throw new Error(`limit not approved: ${decided.refusal.code}`);
  return prepared.answer.limitId;
}

const rupees = (amount: number) => ({ kind: 'amount' as const, amount: paise(amount * 100) });

/** A SYNTHETIC document of a test type, its approval requested by the clerk with the value given. */
async function requested(
  actionType: string,
  recordType: string,
  value: { kind: 'none' } | { kind: 'unknown' } | { kind: 'known'; rupees: number },
) {
  const document = { module: MODULE, recordType, recordId: uuidv7(), versionId: uuidv7() };
  const requestId = await as(clerk.id, async (c) => {
    await c.tx.execute(
      sql`insert into test_approvals.document (id, kind, version_id)
          values (${document.recordId}, ${recordType}, ${document.versionId})`,
    );
    return access.requestApproval(c, {
      actionType,
      document,
      value: value.kind === 'known' ? { kind: 'known', amountPaise: paise(value.rupees * 100) } : value,
      preparers: [clerk.id],
      requestedBy: { userId: clerk.id, roleAssignmentId: clerkAssignment },
    });
  });
  return { requestId, document };
}

const booking = (value: Parameters<typeof requested>[2]) => requested(BOOKING, BOOKING_TYPE, value);

/** Whether the request is in the user's My work: eligible and offered (access-and-approvals 9.4, 11.2). */
async function offered(user: SyntheticUser, requestId: string): Promise<boolean> {
  return (await as(user.id, (c) => access.eligibleRequests(c, user.id, [requestId]))).includes(requestId);
}

async function requestState(requestId: string): Promise<string | undefined> {
  const rows = await asOwner((c) =>
    c.query<{ state: string }>('select state from access.approval_request where id = $1', [requestId]),
  );
  return rows.rows[0]?.state;
}

function view(user: SyntheticUser, requestId: string) {
  return as(user.id, (c) => access.readApprovalRequest(c, { kind: 'user', id: user.id }, requestId));
}

describe('a limit change (access-and-approvals 9.2, 9.11; code-house-rules 7.3; POL-02.07)', () => {
  it('POL-02.07 a limit approved by its preparer is refused, and takes effect when a different person approves it', async () => {
    const holder = await approver();
    const prepared = await prepare({
      actionType: BOOKING,
      holder: { kind: 'role', roleId: holder.roleId, scope: ALL_MEMBERS },
      limit: rupees(1_000),
      coversUnknown: false,
      origin: 'synthetic',
      validFrom: today(),
    });
    if (prepared.kind !== 'success') throw new Error(prepared.refusal.code);
    const self = await decide(admin, {
      requestId: prepared.answer.requestId,
      versionId: prepared.answer.limitId,
      outcome: 'approve',
    });
    expect(self).toMatchObject({ kind: 'refusal', refusal: { code: 'access.self-preparation' } });
    const { requestId } = await booking({ kind: 'known', rupees: 10 });
    // A limit not yet approved grants nothing (POL-02.07, POL-02.09).
    expect((await view(holder.user, requestId))?.limit).toEqual({ kind: 'no-limit', next: null });
    expect((await view(holder.user, requestId))?.decidable).toMatchObject({ code: 'access.no-approval-limit' });
    const approved = await decide(limitApprover, {
      requestId: prepared.answer.requestId,
      versionId: prepared.answer.limitId,
      outcome: 'approve',
    });
    expect(approved).toMatchObject({ kind: 'success' });
    // It applies as soon as it is in force: the request reads it again (9.4).
    expect(await offered(holder.user, requestId)).toBe(true);
    expect((await view(holder.user, requestId))?.limit).toEqual({ kind: 'within', limit: 100_000 });
    const list = await as(admin.id, (c) => access.listApprovalLimits(c));
    const shown = list.limits.find((each) => each.id === prepared.answer.limitId);
    expect(shown).toMatchObject({
      actionType: BOOKING,
      basis: 'cost',
      state: 'In force',
      limit: { kind: 'amount', amount: 100_000 },
      coversUnknown: false,
      origin: 'synthetic',
      holder: { kind: 'role', role: { id: holder.roleId } },
    });
    expect(list.actionTypes).toEqual(
      expect.arrayContaining([
        { actionType: BOOKING, basis: 'cost' },
        { actionType: DAY_CLOSE, basis: 'cash-difference' },
      ]),
    );
    expect(list.actionTypes.map((each) => each.actionType)).not.toContain(OFFER);
  });

  it('GC2-7 DEC-105 a limit starting on a past date is refused', async () => {
    const holder = await approver();
    const refused = await prepare({
      actionType: BOOKING,
      holder: { kind: 'role', roleId: holder.roleId, scope: ALL_MEMBERS },
      limit: rupees(1),
      coversUnknown: false,
      origin: 'synthetic',
      validFrom: dayFrom(-1),
    });
    expect(refused).toMatchObject({ kind: 'refusal', refusal: { code: 'access.starts-in-past' } });
  });

  it('DM-8 an action whose rule has no value takes no limit, and an action with no rule is refused', async () => {
    const holder = await approver();
    const draft = (actionType: string): ApprovalLimitDraft => ({
      actionType,
      holder: { kind: 'role', roleId: holder.roleId, scope: ALL_MEMBERS },
      limit: rupees(1),
      coversUnknown: false,
      origin: 'synthetic',
      validFrom: today(),
    });
    expect(await prepare(draft(OFFER))).toMatchObject({ refusal: { code: 'access.action-type-not-limited' } });
    expect(await prepare(draft('access.role.change'))).toMatchObject({
      refusal: { code: 'access.action-type-not-limited' },
    });
    expect(await prepare(draft(`${MODULE}.unknown`))).toMatchObject({
      refusal: { code: 'access.action-type-not-declared' },
    });
  });

  it('PRD-MOD-010 two overlapping approved limits for one action and holder are refused; a later one replaces it', async () => {
    const holder = await approver();
    const holderOf = { kind: 'role' as const, roleId: holder.roleId, scope: ALL_MEMBERS };
    const later = await prepare({
      actionType: BOOKING,
      holder: holderOf,
      limit: rupees(500),
      coversUnknown: false,
      origin: 'synthetic',
      validFrom: dayFrom(5),
    });
    if (later.kind !== 'success') throw new Error(later.refusal.code);
    const earlier = await prepare({
      actionType: BOOKING,
      holder: holderOf,
      limit: rupees(100),
      coversUnknown: false,
      origin: 'synthetic',
      validFrom: dayFrom(2),
    });
    if (earlier.kind !== 'success') throw new Error(earlier.refusal.code);
    expect(
      await decide(limitApprover, {
        requestId: later.answer.requestId,
        versionId: later.answer.limitId,
        outcome: 'approve',
      }),
    ).toMatchObject({ kind: 'success' });
    // The earlier start would overlap the approved limit that starts after it, whatever its end.
    expect(
      await decide(limitApprover, {
        requestId: earlier.answer.requestId,
        versionId: earlier.answer.limitId,
        outcome: 'approve',
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.limit-overlaps' } });
    expect(
      await prepare({
        actionType: BOOKING,
        holder: holderOf,
        limit: rupees(1),
        coversUnknown: false,
        origin: 'synthetic',
        validFrom: dayFrom(3),
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.limit-overlaps' } });
    // A limit from a later start replaces it: the one it follows ends on its start (code-house-rules 7.3).
    const replacement = await prepare({
      actionType: BOOKING,
      holder: holderOf,
      limit: rupees(900),
      coversUnknown: false,
      origin: 'synthetic',
      validFrom: dayFrom(9),
    });
    if (replacement.kind !== 'success') throw new Error(replacement.refusal.code);
    expect(
      await decide(limitApprover, {
        requestId: replacement.answer.requestId,
        versionId: replacement.answer.limitId,
        outcome: 'approve',
      }),
    ).toMatchObject({ kind: 'success' });
    const list = await as(admin.id, (c) => access.listApprovalLimits(c));
    expect(list.limits.find((each) => each.id === later.answer.limitId)).toMatchObject({
      validFrom: dayFrom(5),
      validTo: dayFrom(9),
      state: 'Scheduled',
    });
    // The database refuses two overlapping Approved rows of one action and holder, whatever writes them.
    await expect(
      asOwner((c) =>
        c.query(`update access.approval_limit set decision = 'Approved' where id = $1`, [earlier.answer.limitId]),
      ),
    ).rejects.toThrow(/approval_limit_no_overlap/);
  });

  it('access-and-approvals 9.2 an individual limit names an assignment of the user it is for', async () => {
    const holder = await approver();
    const other = await approver();
    expect(
      await prepare({
        actionType: BOOKING,
        holder: { kind: 'individual', userId: holder.user.id, roleAssignmentId: other.assignmentId },
        limit: rupees(1),
        coversUnknown: false,
        origin: 'synthetic',
        validFrom: today(),
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.assignment-not-of-user' } });
  });
});

describe('who may decide a valued request (access-and-approvals 9.3; test 13; POL-02.09, PRD-ACS-016)', () => {
  it('POL-02.09 a missing limit grants nothing: approve alone does not decide a valued request', async () => {
    const holder = await approver();
    const { requestId, document } = await booking({ kind: 'known', rupees: 1 });
    expect(await decide(holder.user, { requestId, versionId: document.versionId, outcome: 'approve' })).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.no-approval-limit' },
    });
    expect(await offered(holder.user, requestId)).toBe(false);
  });

  it('PRD-ACS-016 an Unknown value needs explicit authority over Unknown, and unlimited authority is not that', async () => {
    const unlimited = await approver();
    await roleLimit(unlimited, BOOKING, { kind: 'unlimited' });
    const unknownAuthority = await approver();
    await roleLimit(unknownAuthority, BOOKING, { kind: 'none' }, true);
    const { requestId, document } = await booking({ kind: 'unknown' });
    expect(await offered(unlimited.user, requestId)).toBe(false);
    expect(await offered(unknownAuthority.user, requestId)).toBe(true);
    expect(
      await decide(unlimited.user, { requestId, versionId: document.versionId, outcome: 'approve' }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.unknown-value-not-covered' } });
    expect(
      await decide(unknownAuthority.user, { requestId, versionId: document.versionId, outcome: 'approve' }),
    ).toMatchObject({ kind: 'success' });
  });

  it('POL-02.09 DEC-043 a request above every limit stays Awaiting approval, with its approvers, decided by nobody', async () => {
    const holder = await approver();
    await roleLimit(holder, DAY_CLOSE, rupees(50));
    const { requestId, document } = await requested(DAY_CLOSE, DAY_CLOSE_TYPE, { kind: 'known', rupees: 5_000_000 });
    // It is not hidden: it stays in the My work of those who would decide it but for the limit (design-language
    // 10.14 "No approver set up"), and of nobody else.
    expect(await offered(holder.user, requestId)).toBe(true);
    expect(await offered(clerk, requestId)).toBe(false);
    expect(await offered(limitApprover, requestId)).toBe(false);
    expect(await decide(holder.user, { requestId, versionId: document.versionId, outcome: 'approve' })).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.above-approval-limit' },
    });
    expect(await requestState(requestId)).toBe('Awaiting approval');
    const shown = await view(holder.user, requestId);
    expect(shown?.value).toEqual({ kind: 'known', basis: 'cash-difference', amount: 500_000_000 });
    expect(shown?.limit).toEqual({ kind: 'above', limit: 5_000, next: null });
    expect(shown?.decidable).toMatchObject({ kind: 'unavailable', code: 'access.above-approval-limit' });
  });
});

describe('routing (access-and-approvals 9.4; DEC-043, DEC-116)', () => {
  it('DEC-043 of two eligible approvers whose limits cover a value, only the lower limit is offered the request', async () => {
    const low = await approver();
    const high = await approver();
    await roleLimit(low, BOOKING, rupees(2_000));
    await roleLimit(high, BOOKING, rupees(9_000));
    const { requestId, document } = await booking({ kind: 'known', rupees: 1_500 });
    expect(await offered(low.user, requestId)).toBe(true);
    expect(await offered(high.user, requestId)).toBe(false);
    expect((await view(low.user, requestId))?.limit).toEqual({ kind: 'within', limit: 200_000 });
    // Above the lower limit, the higher one is offered it, and the lower one's panel names the next approver.
    const above = await booking({ kind: 'known', rupees: 2_500 });
    expect(await offered(low.user, above.requestId)).toBe(false);
    expect(await offered(high.user, above.requestId)).toBe(true);
    expect((await view(low.user, above.requestId))?.limit).toEqual({
      kind: 'above',
      limit: 200_000,
      next: high.user.displayName,
    });
    // Offering decides nothing: the higher authority is still eligible (9.3), and the decision keeps the limit.
    const decided = await decide(high.user, { requestId, versionId: document.versionId, outcome: 'approve' });
    expect(decided).toMatchObject({ kind: 'success' });
    if (decided.kind !== 'success') throw new Error('not decided');
    const relied = await asOwner((c) =>
      c.query<{ role_assignment_id: string; approval_limit_id: string; value_amount: string }>(
        'select role_assignment_id, approval_limit_id, value_amount from access.approval_decision where id = $1',
        [decided.answer.decisionId],
      ),
    );
    const highLimit = (await as(admin.id, (c) => access.listApprovalLimits(c))).limits.find(
      (each) => each.holder.kind === 'role' && each.holder.role.id === high.roleId,
    );
    expect(relied.rows[0]).toEqual({
      role_assignment_id: high.assignmentId,
      approval_limit_id: highLimit?.id,
      value_amount: '150000',
    });
  });

  it('POL-02.09 explicit unlimited authority is offered a request only when no finite limit covers it', async () => {
    const finite = await approver();
    const unlimited = await approver();
    await roleLimit(finite, DAY_CLOSE, rupees(100));
    await roleLimit(unlimited, DAY_CLOSE, { kind: 'unlimited' });
    const within = await requested(DAY_CLOSE, DAY_CLOSE_TYPE, { kind: 'known', rupees: 99 });
    expect(await offered(finite.user, within.requestId)).toBe(true);
    expect(await offered(unlimited.user, within.requestId)).toBe(false);
    const beyond = await requested(DAY_CLOSE, DAY_CLOSE_TYPE, { kind: 'known', rupees: 101 });
    expect(await offered(finite.user, beyond.requestId)).toBe(false);
    expect(await offered(unlimited.user, beyond.requestId)).toBe(true);
    expect((await view(unlimited.user, beyond.requestId))?.limit).toEqual({ kind: 'unlimited' });
  });

  it('access-and-approvals 9.2 an individual limit replaces the role limit for that user and action', async () => {
    const holder = await approver();
    await roleLimit(holder, BOOKING, rupees(10_000));
    const prepared = await prepare({
      actionType: BOOKING,
      holder: { kind: 'individual', userId: holder.user.id, roleAssignmentId: holder.assignmentId },
      limit: rupees(10),
      coversUnknown: false,
      origin: 'synthetic',
      validFrom: today(),
    });
    if (prepared.kind !== 'success') throw new Error(prepared.refusal.code);
    expect(
      await decide(limitApprover, {
        requestId: prepared.answer.requestId,
        versionId: prepared.answer.limitId,
        outcome: 'approve',
      }),
    ).toMatchObject({ kind: 'success' });
    const { requestId, document } = await booking({ kind: 'known', rupees: 50 });
    expect(await decide(holder.user, { requestId, versionId: document.versionId, outcome: 'approve' })).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.above-approval-limit' },
    });
  });
});

describe('the DEC-105 bases (access-and-approvals 8, 9.3; test 13a; PRD-ACS-015, DM-8)', () => {
  it('DEC-105 a booking is limited on its value at cost and a day-close variance on the difference', async () => {
    const holder = await approver();
    await roleLimit(holder, BOOKING, rupees(300));
    // A limit on one action type gives nothing on another: the day-close difference needs its own.
    const variance = await requested(DAY_CLOSE, DAY_CLOSE_TYPE, { kind: 'known', rupees: 1 });
    expect(
      await decide(holder.user, {
        requestId: variance.requestId,
        versionId: variance.document.versionId,
        outcome: 'approve',
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.no-approval-limit' } });
    await roleLimit(holder, DAY_CLOSE, rupees(2));
    expect((await view(holder.user, variance.requestId))?.value).toEqual({
      kind: 'known',
      basis: 'cash-difference',
      amount: 100,
    });
    expect(
      await decide(holder.user, {
        requestId: variance.requestId,
        versionId: variance.document.versionId,
        outcome: 'approve',
      }),
    ).toMatchObject({ kind: 'success' });
    const order = await booking({ kind: 'known', rupees: 300 });
    expect((await view(holder.user, order.requestId))?.value).toEqual({ kind: 'known', basis: 'cost', amount: 30_000 });
    expect(
      await decide(holder.user, {
        requestId: order.requestId,
        versionId: order.document.versionId,
        outcome: 'approve',
      }),
    ).toMatchObject({ kind: 'success' });
  });

  it('DEC-105 an offer has no value limit and needs only the approve permission', async () => {
    const holder = await approver();
    const offer = await requested(OFFER, OFFER_TYPE, { kind: 'none' });
    expect(await offered(holder.user, offer.requestId)).toBe(true);
    const shown = await view(holder.user, offer.requestId);
    expect(shown?.value).toEqual({ kind: 'none' });
    expect(shown?.limit).toBeUndefined();
    expect(
      await decide(holder.user, {
        requestId: offer.requestId,
        versionId: offer.document.versionId,
        outcome: 'approve',
      }),
    ).toMatchObject({ kind: 'success' });
  });
});

describe('the recheck under the locks (access-and-approvals 9.7; test 15; DEC-066; RR-435)', () => {
  it('DEC-066 a value under the lock above the limit the decision relied on is refused for renewed approval', async () => {
    const holder = await approver();
    await roleLimit(holder, BOOKING, rupees(1_000));
    const { requestId, document } = await booking({ kind: 'known', rupees: 400 });
    const decided = await decide(holder.user, { requestId, versionId: document.versionId, outcome: 'approve' });
    if (decided.kind !== 'success') throw new Error(decided.refusal.code);
    const check = (amountPaise: number) =>
      as(clerk.id, async (c) => {
        await c.lock(LOCK_STEP.document, await access.approvalLockTargets(c, decided.answer.decisionId));
        return access.verifyUnderLock(c, {
          decisionId: decided.answer.decisionId,
          actionType: BOOKING,
          document,
          preparers: [clerk.id],
          value: { kind: 'known', amountPaise: paise(amountPaise) },
        });
      });
    expect(await check(40_000)).toBeUndefined();
    expect(await check(100_001)).toMatchObject({ code: 'access.approval-value-exceeded' });
  });
});
