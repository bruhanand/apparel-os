import { paise, uuidv7 } from '@apparel-os/domain';
import {
  permissionRegistry,
  type AssignmentScope,
  type RecordTypeDeclaration,
  type StandInGrantDraft,
} from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandRunner,
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
  startAccessApp,
  SYNTHETIC_ORIGIN,
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
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';

// S1-F05-T02: stand-in grants and bulk approval (access-and-approvals 9.3, 9.5, 9.9, 10, 13.1, 15 tests 17, 18, 18a;
// PRD-ACS-011, PRD-ACS-018, PRD-ACS-019, POL-02.19, POL-02.20, PRD-MOD-015; GC3-7, DEC-105). Bookings arrive in stage 2,
// so a test-only action type stands for one: booking approval on its value at cost (DM-8, DEC-105), its documents in
// `test_bulk.document`, made by this file as the migration role (code-house-rules 11.4). Commands run as the runtime
// role through Organisation routing, on a clock that moves 30 seconds before each fresh code (3.3). Every stand-in,
// grant, limit, allowlist and value here is SYNTHETIC: the real ones are OPEN (B-9, RR-059, V-02; KDPS Owner, Admin).

const MODULE = syntheticIdentifier('bulk');
const BOOKING_TYPE = `${MODULE}.booking`;
const OFFER_TYPE = `${MODULE}.offer`;
/** Booking approval, on the booking's value at cost (DM-8, DEC-105). */
const BOOKING = `${MODULE}.approve-booking`;
/** Offer approval: no value limit (DM-8, DEC-105). Never on the allowlist here. */
const OFFER = `${MODULE}.approve-offer`;

const declared = (code: string): RecordTypeDeclaration => ({
  code,
  actions: ['view', 'create', 'approve'],
  scopeFacts: { legalEntity: false, place: false, brand: false },
  subject: false,
  fieldClasses: [],
  serviceOnly: false,
});
const REGISTRY = [...permissionRegistry, declared(BOOKING_TYPE), declared(OFFER_TYPE)];
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
const RULES = [rule(BOOKING, BOOKING_TYPE, 'cost'), rule(OFFER, OFFER_TYPE, 'none')];

const ALL_MEMBERS: AssignmentScope = {
  kind: 'dimensions',
  legalEntity: { kind: 'all' },
  place: { kind: 'all' },
  brand: { kind: 'all' },
};

let world: SyntheticWorld;
let api: AccessTestApp;
let database: string;
let router: OrganisationRouter;
let routed: RoutedOrganisation;
let access: Access;
let keysEnvironment: Record<string, string>;
const log = capturingLogger();
let offsetMs = 0;

/** The Admin who prepares limits, settings and grants; the person who approves them; the preparer of documents. */
let admin: SyntheticUser;
let adminPreparer: Preparer;
let changeApprover: SyntheticUser;
let clerk: SyntheticUser;
let clerkAssignment: string;
let approveReason: string;

interface Approver {
  readonly user: SyntheticUser;
  readonly roleId: string;
  readonly assignmentId: string;
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('bulk');
  database = world.organisations[0].database;
  await asOwner((client) =>
    client.query(`
      create schema test_bulk;
      grant usage on schema test_bulk to aos_runtime;
      create table test_bulk.document (id uuid primary key, kind text not null, version_id uuid not null);
      grant select, insert on test_bulk.document to aos_runtime;
    `),
  );
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
  admin = await enrolled('BULK-ADMIN');
  changeApprover = await enrolled('CHANGE-APPROVER');
  clerk = await enrolled('CLERK');
  const adminGrant = await grantSynthetic(
    database,
    { kind: 'user', id: admin.id },
    [
      { recordType: 'access.approval_limit', action: 'create' },
      { recordType: 'access.approval_rule_setting', action: 'create' },
      { recordType: 'access.stand_in_grant', action: 'view' },
      { recordType: 'access.stand_in_grant', action: 'create' },
      // The Admin may also approve grants, so the refusal of their own preparation is the rule's alone (GC3-7).
      { recordType: 'access.stand_in_grant', action: 'approve' },
    ],
    { registry: REGISTRY },
  );
  adminPreparer = { userId: admin.id, roleAssignmentId: adminGrant.assignmentId };
  await grantSynthetic(database, { kind: 'user', id: changeApprover.id }, [
    { recordType: 'access.approval_limit', action: 'approve' },
    { recordType: 'access.approval_rule_setting', action: 'approve' },
    { recordType: 'access.stand_in_grant', action: 'approve' },
  ]);
  clerkAssignment = (
    await grantSynthetic(
      database,
      { kind: 'user', id: clerk.id },
      [BOOKING_TYPE, OFFER_TYPE].map((recordType) => ({ recordType, action: 'create' as const })),
      { registry: REGISTRY },
    )
  ).assignmentId;
  approveReason = await writeSyntheticReason(database, 'approve');
  // The SYNTHETIC allowlist: booking approval allowed in bulk, prepared and approved like any rule setting (8, 9.11).
  const setting = await as(admin.id, (c) =>
    access.prepareApprovalRuleSetting(c, adminPreparer, {
      actionType: BOOKING,
      bulkAllowed: true,
      phoneAllowed: false,
      validFrom: today(),
    }),
  );
  if (setting.kind !== 'success') throw new Error(`setting not prepared: ${setting.refusal.code}`);
  const decided = await decide(changeApprover, {
    requestId: setting.answer.requestId,
    versionId: setting.answer.versionId,
    outcome: 'approve',
  });
  if (decided.kind !== 'success') throw new Error(`setting not approved: ${decided.refusal.code}`);
  // The whole application, for the bulk route (code-house-rules 12.1), on the same clock and SYNTHETIC settings.
  await writeSyntheticSetting(database, 'access.sign-in-throttling', { failureLimit: 50, windowSeconds: 600 });
  await writeSyntheticSetting(database, 'access.password-rules', { minimumLength: 12 });
  await writeSyntheticSetting(database, 'access.office-session-limits', {
    idleLockSeconds: 3600,
    absoluteSeconds: 7200,
  });
  api = await startAccessApp(world, keysEnvironment, {
    clock: { now },
    extraRecordTypes: [declared(BOOKING_TYPE), declared(OFFER_TYPE)],
    extraApprovalRules: RULES,
  });
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
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

function freshCode(user: SyntheticUser): string {
  offsetMs += 30_000;
  if (user.factorSecret === undefined) throw new Error('not enrolled');
  return codeFor(user.factorSecret, 0, now());
}

function decide(user: SyntheticUser, input: Omit<DecisionInput, 'totpCode' | 'reason'>) {
  const totpCode = freshCode(user);
  return as(user.id, (c) =>
    access.decide(
      c,
      { kind: 'user', id: user.id },
      { ...input, reason: { kind: 'listed', reasonId: approveReason }, totpCode },
    ),
  );
}

let approverCount = 0;
/** A new person holding approve on the test documents through a SYNTHETIC role of their own. */
async function approver(): Promise<Approver> {
  approverCount += 1;
  const user = await writeSyntheticUser(database, routed.organisationCode, keysEnvironment, {
    label: `BULK-APPROVER-${String(approverCount)}`,
    enrolled: true,
  });
  const granted = await grantSynthetic(
    database,
    { kind: 'user', id: user.id },
    [BOOKING_TYPE, OFFER_TYPE].map((recordType) => ({ recordType, action: 'approve' as const })),
    { registry: REGISTRY },
  );
  return { user, ...granted };
}

/** A person with no assignment at all: a stand-in decides only through a grant (7.1 step 3). */
async function bareUser(label: string): Promise<SyntheticUser> {
  return writeSyntheticUser(database, routed.organisationCode, keysEnvironment, { label, enrolled: true });
}

/** A SYNTHETIC role limit on booking approval, prepared by the Admin and approved by another person. */
async function bookingLimit(holder: Approver, rupees: number | 'unlimited', coversUnknown = false): Promise<void> {
  const prepared = await as(admin.id, (c) =>
    access.prepareApprovalLimit(c, adminPreparer, {
      actionType: BOOKING,
      holder: { kind: 'role', roleId: holder.roleId, scope: ALL_MEMBERS },
      limit: rupees === 'unlimited' ? { kind: 'unlimited' } : { kind: 'amount', amount: paise(rupees * 100) },
      coversUnknown,
      origin: 'synthetic',
      validFrom: today(),
    }),
  );
  if (prepared.kind !== 'success') throw new Error(`limit not prepared: ${prepared.refusal.code}`);
  const decided = await decide(changeApprover, {
    requestId: prepared.answer.requestId,
    versionId: prepared.answer.limitId,
    outcome: 'approve',
  });
  if (decided.kind !== 'success') throw new Error(`limit not approved: ${decided.refusal.code}`);
}

/** A SYNTHETIC document whose approval the preparer requests, with its value at cost in rupees. */
async function requested(
  actionType: string,
  recordType: string,
  value: { kind: 'none' } | { kind: 'unknown' } | { kind: 'known'; rupees: number },
  preparer: { user: SyntheticUser; assignmentId: string } = { user: clerk, assignmentId: clerkAssignment },
) {
  const document = { module: MODULE, recordType, recordId: uuidv7(), versionId: uuidv7() };
  const requestId = await as(preparer.user.id, async (c) => {
    await c.tx.execute(
      sql`insert into test_bulk.document (id, kind, version_id)
          values (${document.recordId}, ${recordType}, ${document.versionId})`,
    );
    return access.requestApproval(c, {
      actionType,
      document,
      value: value.kind === 'known' ? { kind: 'known', amountPaise: paise(value.rupees * 100) } : value,
      preparers: [preparer.user.id],
      requestedBy: { userId: preparer.user.id, roleAssignmentId: preparer.assignmentId },
    });
  });
  return { requestId, document };
}

const booking = (value: Parameters<typeof requested>[2]) => requested(BOOKING, BOOKING_TYPE, value);

async function offered(user: SyntheticUser, requestId: string): Promise<boolean> {
  return (await as(user.id, (c) => access.eligibleRequests(c, user.id, [requestId]))).includes(requestId);
}

/** Records a SYNTHETIC stand-in grant as the Admin. */
function grant(draft: Partial<StandInGrantDraft> & Pick<StandInGrantDraft, 'standInUserId' | 'forUserId'>) {
  return as(admin.id, (c) =>
    access.prepareStandInGrant(c, adminPreparer, {
      actions: [{ actionType: BOOKING, limit: { kind: 'amount', amount: paise(50_000) }, coversUnknown: false }],
      scope: ALL_MEMBERS,
      origin: 'synthetic',
      validFrom: today(),
      validTo: dayFrom(1),
      ...draft,
    }),
  );
}

/** A SYNTHETIC grant, recorded by the Admin and approved by a different person; answers its identifier. */
async function approvedGrant(draft: Parameters<typeof grant>[0]): Promise<string> {
  const prepared = await grant(draft);
  if (prepared.kind !== 'success') throw new Error(`grant not prepared: ${prepared.refusal.code}`);
  const decided = await decide(changeApprover, {
    requestId: prepared.answer.requestId,
    versionId: prepared.answer.grantId,
    outcome: 'approve',
  });
  if (decided.kind !== 'success') throw new Error(`grant not approved: ${decided.refusal.code}`);
  return prepared.answer.grantId;
}

/** Bulk approval as the route runs it: the batch with its fresh code, then each item in its own transaction (9.9). */
async function bulk(user: SyntheticUser, items: readonly { requestId: string; versionId: string }[]) {
  const totpCode = freshCode(user);
  const actor = { kind: 'user' as const, id: user.id };
  const batch = await as(user.id, (c) =>
    access.openBulkBatch(c, actor, { items, reason: { kind: 'listed', reasonId: approveReason }, totpCode }),
  );
  if (batch.kind !== 'success') return { batch, items: [] };
  const outcomes = [];
  for (const item of items) {
    outcomes.push(
      await as(user.id, (c) =>
        access.decideInBatch(c, actor, {
          batchId: batch.answer.batchId,
          ...item,
          reason: { kind: 'listed', reasonId: approveReason },
        }),
      ),
    );
  }
  return { batch, items: outcomes };
}

async function decisionOf(requestId: string) {
  const rows = await asOwner((c) =>
    c.query<{ stand_in_grant_id: string | null; bulk_decision_batch_id: string | null; approver_user_id: string }>(
      `select stand_in_grant_id, bulk_decision_batch_id, approver_user_id from access.approval_decision
       where approval_request_id = $1`,
      [requestId],
    ),
  );
  return rows.rows[0];
}

describe('stand-in grants (access-and-approvals 10; tests 18, 18a; PRD-ACS-018, POL-02.20)', () => {
  it('DEC-105 GC3-7 a grant approved by the person who recorded it is refused, and takes no effect until another approves it', async () => {
    const owner = await approver();
    await bookingLimit(owner, 1_000);
    const standIn = await bareUser('STAND-IN-A');
    const { requestId, document } = await booking({ kind: 'known', rupees: 100 });
    const prepared = await grant({ standInUserId: standIn.id, forUserId: owner.user.id });
    if (prepared.kind !== 'success') throw new Error(prepared.refusal.code);
    expect(
      await decide(admin, {
        requestId: prepared.answer.requestId,
        versionId: prepared.answer.grantId,
        outcome: 'approve',
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.self-preparation' } });
    // Not in force yet: the stand-in sees nothing and decides nothing.
    expect(await offered(standIn, requestId)).toBe(false);
    expect(await decide(standIn, { requestId, versionId: document.versionId, outcome: 'approve' })).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.not-eligible' },
    });
    expect(
      await decide(changeApprover, {
        requestId: prepared.answer.requestId,
        versionId: prepared.answer.grantId,
        outcome: 'approve',
      }),
    ).toMatchObject({ kind: 'success' });
    // In force: the stand-in sees the covered request in My work and decides it, and the decision keeps the grant.
    expect(await offered(standIn, requestId)).toBe(true);
    expect(await decide(standIn, { requestId, versionId: document.versionId, outcome: 'approve' })).toMatchObject({
      kind: 'success',
    });
    expect(await decisionOf(requestId)).toMatchObject({
      stand_in_grant_id: prepared.answer.grantId,
      approver_user_id: standIn.id,
    });
    const list = await as(admin.id, (c) => access.listStandInGrants(c));
    expect(list.grants.find((each) => each.id === prepared.answer.grantId)).toMatchObject({
      state: 'In force',
      standIn: { userId: standIn.id },
      forUser: { userId: owner.user.id },
      actions: [{ actionType: BOOKING, basis: 'cost', limit: { kind: 'amount', amount: 50_000 } }],
      origin: 'synthetic',
    });
  });

  it('PRD-ACS-018 a grant wider than the authority of the person stood in for is refused', async () => {
    const owner = await approver();
    await bookingLimit(owner, 1_000);
    const standIn = await bareUser('STAND-IN-B');
    const wider = (draft: Partial<StandInGrantDraft>) =>
      grant({ standInUserId: standIn.id, forUserId: owner.user.id, ...draft });
    // A limit above the giver's own.
    expect(
      await wider({
        actions: [{ actionType: BOOKING, limit: { kind: 'amount', amount: paise(100_001) }, coversUnknown: false }],
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.stand-in-wider-than-authority' } });
    // Authority over Unknown value the giver does not hold (PRD-ACS-016).
    expect(
      await wider({
        actions: [{ actionType: BOOKING, limit: { kind: 'amount', amount: paise(100) }, coversUnknown: true }],
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.stand-in-wider-than-authority' } });
    // An action the giver may not decide at all.
    const noLimit = await approver();
    expect(await grant({ standInUserId: standIn.id, forUserId: noLimit.user.id })).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.stand-in-wider-than-authority' },
    });
    // A scope wider than the giver's assignment.
    const atSite = await writeSyntheticUser(database, routed.organisationCode, keysEnvironment, {
      label: 'SITE-APPROVER',
      enrolled: true,
    });
    const site = uuidv7();
    await grantSynthetic(database, { kind: 'user', id: atSite.id }, [{ recordType: OFFER_TYPE, action: 'approve' }], {
      registry: REGISTRY,
      scope: { ...ALL_MEMBERS, place: { kind: 'selected', members: [{ type: 'site', id: site }] } },
    });
    expect(
      await grant({
        standInUserId: standIn.id,
        forUserId: atSite.id,
        actions: [{ actionType: OFFER, limit: { kind: 'none' }, coversUnknown: false }],
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.stand-in-wider-than-authority' } });
    // Within it, it is recorded.
    expect(await wider({})).toMatchObject({ kind: 'success' });
  });

  it('PRD-MOD-010 two approved grants of one stand-in, giver and scope never overlap in time', async () => {
    const owner = await approver();
    await bookingLimit(owner, 1_000);
    const standIn = await bareUser('STAND-IN-D');
    const first = await grant({ standInUserId: standIn.id, forUserId: owner.user.id, validTo: dayFrom(3) });
    const second = await grant({ standInUserId: standIn.id, forUserId: owner.user.id, validTo: dayFrom(2) });
    if (first.kind !== 'success' || second.kind !== 'success') throw new Error('grants not prepared');
    expect(
      await decide(changeApprover, {
        requestId: first.answer.requestId,
        versionId: first.answer.grantId,
        outcome: 'approve',
      }),
    ).toMatchObject({ kind: 'success' });
    expect(
      await decide(changeApprover, {
        requestId: second.answer.requestId,
        versionId: second.answer.grantId,
        outcome: 'approve',
      }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.stand-in-overlaps' } });
    expect(await grant({ standInUserId: standIn.id, forUserId: owner.user.id })).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.stand-in-overlaps' },
    });
  });

  it('PRD-ACS-006 a stand-in cannot approve work they prepared', async () => {
    const owner = await approver();
    await bookingLimit(owner, 1_000);
    const standIn = await approver();
    await approvedGrant({ standInUserId: standIn.user.id, forUserId: owner.user.id });
    const preparerOf = await grantSynthetic(
      database,
      { kind: 'user', id: standIn.user.id },
      [{ recordType: BOOKING_TYPE, action: 'create' }],
      { registry: REGISTRY },
    );
    const own = await requested(
      BOOKING,
      BOOKING_TYPE,
      { kind: 'known', rupees: 10 },
      { user: standIn.user, assignmentId: preparerOf.assignmentId },
    );
    expect(
      await decide(standIn.user, { requestId: own.requestId, versionId: own.document.versionId, outcome: 'approve' }),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.self-preparation' } });
  });

  it('PRD-ACS-018 a grant expires by itself: once ended, the stand-in no longer sees or decides the covered items', async () => {
    const owner = await approver();
    await bookingLimit(owner, 1_000);
    const standIn = await bareUser('STAND-IN-C');
    await approvedGrant({ standInUserId: standIn.id, forUserId: owner.user.id, validTo: dayFrom(1) });
    const { requestId, document } = await booking({ kind: 'known', rupees: 100 });
    expect(await offered(standIn, requestId)).toBe(true);
    // A value above the grant's own limit is not covered, even within the giver's (10).
    const above = await booking({ kind: 'known', rupees: 600 });
    expect(await offered(standIn, above.requestId)).toBe(false);
    offsetMs += 2 * 86_400_000;
    expect(await offered(standIn, requestId)).toBe(false);
    expect(await decide(standIn, { requestId, versionId: document.versionId, outcome: 'approve' })).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.not-eligible' },
    });
  });
});

describe('bulk approval (access-and-approvals 9.9; test 17; PRD-ACS-011, PRD-ACS-019, POL-02.19)', () => {
  it('POL-02.19 an action type not on the allowlist is refused, and nothing is decided', async () => {
    const holder = await approver();
    const offer = await requested(OFFER, OFFER_TYPE, { kind: 'none' });
    const result = await bulk(holder.user, [{ requestId: offer.requestId, versionId: offer.document.versionId }]);
    expect(result.batch).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.bulk-not-allowed', missing: [{ kind: 'bulk-allowlist', actionType: OFFER }] },
    });
    expect(await decisionOf(offer.requestId)).toBeUndefined();
  });

  it('PRD-ACS-019 PRD-MOD-015 each item is its own decision; a failing one goes to individual review; Unknown is never added as zero', async () => {
    const holder = await approver();
    await bookingLimit(holder, 1_000);
    const first = await booking({ kind: 'known', rupees: 100 });
    const second = await booking({ kind: 'known', rupees: 250 });
    const unknown = await booking({ kind: 'unknown' });
    const items = [first, unknown, second].map(({ requestId, document }) => ({
      requestId,
      versionId: document.versionId,
    }));
    const result = await bulk(holder.user, items);
    expect(result.batch).toMatchObject({
      kind: 'success',
      answer: {
        totals: [{ basis: 'cost', known: 35_000, knownCount: 2, unknownCount: 1 }],
        noValueCount: 0,
      },
    });
    expect(result.items[0]).toMatchObject({ kind: 'success', answer: { outcome: 'Approved' } });
    expect(result.items[1]).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.unknown-value-not-covered' },
    });
    expect(result.items[2]).toMatchObject({ kind: 'success', answer: { outcome: 'Approved' } });
    const batchId = result.batch.kind === 'success' ? result.batch.answer.batchId : '';
    expect(await decisionOf(first.requestId)).toMatchObject({ bulk_decision_batch_id: batchId });
    expect(await decisionOf(unknown.requestId)).toBeUndefined();
  });

  it('PRD-SEC-001 one fresh authenticator code for the batch; a wrong code decides nothing', async () => {
    const holder = await approver();
    await bookingLimit(holder, 1_000);
    const item = await booking({ kind: 'known', rupees: 1 });
    const refused = await as(holder.user.id, (c) =>
      access.openBulkBatch(
        c,
        { kind: 'user', id: holder.user.id },
        {
          items: [{ requestId: item.requestId, versionId: item.document.versionId }],
          reason: { kind: 'listed', reasonId: approveReason },
          totpCode: '000000',
        },
      ),
    );
    expect(refused).toMatchObject({ kind: 'refusal', refusal: { code: 'access.authenticator-code-refused' } });
    // A batch of another approver decides nothing for this one.
    const other = await approver();
    await bookingLimit(other, 1_000);
    const theirs = await bulk(other.user, [{ requestId: item.requestId, versionId: item.document.versionId }]);
    const batchId = theirs.batch.kind === 'success' ? theirs.batch.answer.batchId : '';
    const second = await booking({ kind: 'known', rupees: 2 });
    expect(
      await as(holder.user.id, (c) =>
        access.decideInBatch(
          c,
          { kind: 'user', id: holder.user.id },
          {
            batchId,
            requestId: second.requestId,
            versionId: second.document.versionId,
            reason: { kind: 'listed', reasonId: approveReason },
          },
        ),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'access.not-eligible' } });
  });
});

describe('the bulk route (code-house-rules 12.1, 12.4; access-and-approvals 9.9)', () => {
  it('PRD-INT-002 runs the batch and each item under the request key; a resent request decides nothing twice', async () => {
    const holder = await approver();
    await bookingLimit(holder, 1_000);
    const known = await booking({ kind: 'known', rupees: 10 });
    const unknown = await booking({ kind: 'unknown' });
    offsetMs += 30_000;
    const headers = { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.9' };
    const signedIn = await fetch(`${api.baseUrl}/api/access/sign-in`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        organisationCode: routed.organisationCode,
        login: holder.user.login,
        password: holder.user.password,
        totpCode: codeFor(holder.user.factorSecret ?? Buffer.alloc(0), 0, now()),
      }),
    });
    expect(signedIn.status).toBe(200);
    const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const key = uuidv7();
    const body = JSON.stringify({
      items: [known, unknown].map(({ requestId, document }) => ({ requestId, versionId: document.versionId })),
      reason: { kind: 'listed', reasonId: approveReason },
      totpCode: freshCode(holder.user),
    });
    const send = () =>
      fetch(`${api.baseUrl}/api/access/approval-requests/bulk-decision`, {
        method: 'POST',
        headers: { ...headers, cookie, 'idempotency-key': key },
        body,
      });
    const first = await send();
    const answer = (await first.json()) as Record<string, unknown>;
    expect(first.status, JSON.stringify(answer)).toBe(200);
    expect(answer).toMatchObject({
      totals: [{ basis: 'cost', known: 1_000, knownCount: 1, unknownCount: 1 }],
      items: [
        { requestId: known.requestId, outcome: 'Approved' },
        { requestId: unknown.requestId, outcome: 'individual-review', code: 'access.unknown-value-not-covered' },
      ],
    });
    const again = await send();
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(answer);
    const decisions = await asOwner((c) =>
      c.query('select id from access.approval_decision where approval_request_id = $1', [known.requestId]),
    );
    expect(decisions.rows).toHaveLength(1);
  });
});
