import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  availabilitySchema,
  unitReadinessSchema,
  type Availability,
  type BusinessUnitDraft,
  type UnitReadiness,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GatedOperation } from '../src/modules/configuration/index.js';
import { syntheticCode, syntheticIdentifier, syntheticName } from './fixtures/synthetic.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  SyntheticClock,
  SYNTHETIC_ORIGIN,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { approved, approvedGeography, structureSetup, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F04-T02: readiness checks and unit activation through the whole application, on real PostgreSQL (module-map
// 4.16; domain-model 3.6, section 5, section 6 "Granting an activity", invariant 7; stage 1 exit check 6; PRD-LIF-001
// to PRD-LIF-003, PRD-ACS-006, PRD-ORG-006, POL-10.08; MM-8, DEC-105; DEC-116, DEC-117). A test-only module declares
// SYNTHETIC receiving and movement operations with the people they need (code-house-rules 11.4). The structure is made
// through organisation's real commands; a mapping's verification and a policy's Signed record and validation are
// written as fixtures, labelled synthetic, since their evidence files are proved elsewhere (S1-F02-T02, S1-F04-T01).
// Nothing here is KDPS's: every value, person and approval is SYNTHETIC.

const GATE = syntheticIdentifier('ready');
const RECEIVE = `${GATE}.receive-synthetic`;
const MOVE = `${GATE}.move-synthetic`;
/** The policies the synthetic operations name, chosen for the test only: 4 for receiving, 6 for movement. */
const RECEIVE_POLICY = 4;
const MOVE_POLICY = 6;

const operations: readonly GatedOperation[] = [
  {
    code: RECEIVE,
    policy: RECEIVE_POLICY,
    capability: `${GATE}.synthetic-receiving`,
    activity: 'receiving',
    checks: [],
    needs: {
      permissions: [{ action: 'create', recordType: 'organisation.location' }],
      approvals: [
        {
          actionType: `${GATE}.synthetic-receipt`,
          prepare: { action: 'create', recordType: 'organisation.location' },
          approveRecordType: 'organisation.location',
        },
      ],
    },
  },
  {
    code: MOVE,
    policy: MOVE_POLICY,
    capability: `${GATE}.synthetic-movement`,
    activity: 'movement',
    checks: [],
    needs: {
      permissions: [{ action: 'edit', recordType: 'configuration.capability' }],
      approvals: [
        {
          actionType: `${GATE}.synthetic-move`,
          prepare: { action: 'create', recordType: 'access.role' },
          approveRecordType: 'access.role',
        },
      ],
    },
  },
  {
    code: `${GATE}.sell-synthetic`,
    policy: RECEIVE_POLICY,
    capability: `${GATE}.synthetic-selling`,
    activity: 'selling',
    checks: [],
    // A permission on a type that carries every scope fact, held below only through an assignment of another Site.
    needs: { permissions: [{ action: 'view', recordType: 'stock.hold' }] },
  },
];

let world: SyntheticWorld;
let setup: StructureSetup;
let api: AccessTestApp;
let keys: Record<string, string>;
let clock: SyntheticClock;
const cookies = new Map<string, string>();
let operationsUser: SyntheticUser;
let approver: SyntheticUser;
let otherOperations: SyntheticUser;
let approveReason: string;
let counter = 0;
const next = (prefix: string) => `${prefix}-${String(++counter)}`;

interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const READINESS_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'site_lifecycle.readiness_record', action: 'view' },
  { recordType: 'site_lifecycle.readiness_record', action: 'create' },
  { recordType: 'site_lifecycle.zero_stock_declaration', action: 'view' },
  { recordType: 'site_lifecycle.zero_stock_declaration', action: 'create' },
  // The person who runs the checks holds approve too, so only the independence rule keeps them from approving.
  { recordType: 'site_lifecycle.readiness_record', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
];
const APPROVER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'site_lifecycle.readiness_record', action: 'view' },
  { recordType: 'site_lifecycle.readiness_record', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
];

async function signIn(organisationCode: string, user: SyntheticUser): Promise<void> {
  clock.advance(30);
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.71' },
    body: JSON.stringify({
      organisationCode,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now()),
    }),
  });
  expect(response.status).toBe(200);
  cookies.set(user.id, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
}

async function enrolled(
  database: string,
  organisationCode: string,
  label: string,
  authorities: readonly SyntheticAuthority[],
): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(database, organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
    personas: ['P-OPS'],
  });
  await grantSynthetic(database, { kind: 'user', id: user.id }, authorities);
  await signIn(organisationCode, user);
  return user;
}

async function post(user: SyntheticUser, path: string, body: unknown = {}): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: SYNTHETIC_ORIGIN,
      cookie: cookies.get(user.id) ?? '',
      'idempotency-key': uuidv7(),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function get(user: SyntheticUser, path: string): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie: cookies.get(user.id) ?? '' } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function readiness(user: SyntheticUser, unitId: string): Promise<UnitReadiness> {
  const read = await get(user, `/api/site-lifecycle/units/${unitId}/readiness`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return unitReadinessSchema.parse(read.body);
}

async function run(unitId: string, activity: string, by: SyntheticUser = operationsUser) {
  const ran = await post(by, `/api/site-lifecycle/units/${unitId}/readiness/${activity}/runs`);
  expect(ran.status, JSON.stringify(ran.body)).toBe(200);
  const read = await readiness(by, unitId);
  const latest = read.activities.find((each) => each.activity === activity)?.latest;
  if (latest === null || latest === undefined) throw new Error('no run');
  expect(latest.readinessRecordId).toBe(ran.body.readinessRecordId);
  return latest;
}

const stateOf = (latest: Awaited<ReturnType<typeof run>>, check: string) =>
  latest.checks.find((each) => each.check === check);

async function decide(user: SyntheticUser, requestId: string, versionId: string): Promise<Call> {
  clock.advance(30);
  return post(user, `/api/access/approval-requests/${requestId}/decision`, {
    versionId,
    outcome: 'approve',
    reason: { kind: 'listed', reasonId: approveReason },
    totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now()),
  });
}

async function availabilityOf(user: SyntheticUser, operation: string, unit: Unit): Promise<Availability> {
  const read = await get(
    user,
    `/api/access/availability?operation=${operation}&siteId=${unit.siteId}&businessUnitId=${unit.id}`,
  );
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return availabilitySchema.parse(read.body);
}

interface Unit {
  readonly id: string;
  readonly siteId: string;
}

/** Writes a SYNTHETIC verification of the unit's mapping in force, as a fixture (structure-and-masters 3.4). */
async function verifyFixture(database: string, unitId: string): Promise<void> {
  const owner = await connect(database, 'migration');
  try {
    await owner.query(
      `insert into organisation.business_unit_mapping_verification
         (id, business_unit_mapping_id, verified_by_user_id, verified_at, attachment_ids)
       select $1, id, $2, now(), array[$3::uuid] from organisation.business_unit_mapping
        where business_unit_id = $4 and decision = 'Approved'`,
      [uuidv7(), uuidv7(), uuidv7(), unitId],
    );
  } finally {
    await owner.end();
  }
}

/** Writes a SYNTHETIC Signed record and validation of a policy, as fixtures (module-map 4.4; DM-6). */
async function signedFixture(database: string, policy: number): Promise<void> {
  const owner = await connect(database, 'migration');
  try {
    await owner.query(
      `insert into configuration.policy_signature (id, policy_number, signatory, signed_on, origin,
         evidence_attachment_ids, recorded_by_user_id, role_assignment_id, recorded_at)
       values ($1, $2, 'SYNTHETIC signatory', current_date, 'synthetic', array[$3::uuid], $4, $5, now())`,
      [uuidv7(), policy, uuidv7(), uuidv7(), uuidv7()],
    );
    await owner.query(
      `insert into configuration.policy_validation (id, policy_number, origin, validated_values,
         evidence_attachment_ids, validated_by_user_id, role_assignment_id, validated_at)
       values ($1, $2, 'synthetic', '{}', array[$3::uuid], $4, $5, now())`,
      [uuidv7(), policy, uuidv7(), uuidv7(), uuidv7()],
    );
  } finally {
    await owner.end();
  }
}

let mapping: { legalEntityId: string; taxRegistrationId: string; accountingBookId: string };
let siteId: string;
let storeId: string;

async function unit(overrides: Partial<BusinessUnitDraft> & Pick<BusinessUnitDraft, 'kind'>): Promise<Unit> {
  const code = next('READY-BU');
  const answer = await approved(setup, (c, p) =>
    setup.organisation.prepareBusinessUnit(c, p, {
      code: syntheticCode(code),
      siteId,
      name: syntheticName(`Unit ${code}`),
      ...mapping,
      validFrom: setup.today(),
      ...overrides,
    }),
  );
  return { id: answer.recordId, siteId };
}

async function location(of: Unit): Promise<void> {
  const code = next('READY-LOC');
  await approved(setup, (c, p) =>
    setup.organisation.prepareLocation(c, p, {
      code: syntheticCode(code),
      siteId: of.siteId,
      businessUnitId: of.id,
      name: syntheticName(`Location ${code}`),
      kind: 'floor',
      validFrom: setup.today(),
    }),
  );
}

let ready: Unit;
let unverified: Unit;
let counterUnit: Unit;
let neighbour: Unit;

beforeAll(async () => {
  world = await createSyntheticOrganisations('readiness');
  keys = syntheticKeysEnvironment(world);
  const [a, b] = world.organisations;
  setup = await structureSetup({
    directory: world.directory,
    database: a.database,
    organisationCode: a.code,
    keysEnvironment: keys,
    label: 'READY',
  });
  const geography = await approvedGeography(setup, 'READY');
  const legalEntity = await approved(setup, (c, p) =>
    setup.organisation.prepareLegalEntity(c, p, {
      code: syntheticCode('READY-LE'),
      legalName: syntheticName('Ready entity'),
      validFrom: setup.today(),
    }),
  );
  const registration = await approved(setup, (c, p) =>
    setup.organisation.prepareTaxRegistration(c, p, {
      code: syntheticCode('READY-GSTIN'),
      legalEntityId: legalEntity.recordId,
      registrationNumber: 'SYNTHETIC-READY-GSTIN',
      stateId: geography.state.recordId,
      validityFrom: setup.today(),
      validFrom: setup.today(),
    }),
  );
  const book = await approved(setup, (c, p) =>
    setup.organisation.prepareAccountingBook(c, p, {
      code: syntheticCode('READY-BK'),
      legalEntityId: legalEntity.recordId,
      name: syntheticName('Ready book'),
      validFrom: setup.today(),
    }),
  );
  mapping = {
    legalEntityId: legalEntity.recordId,
    taxRegistrationId: registration.recordId,
    accountingBookId: book.recordId,
  };
  siteId = (
    await approved(setup, (c, p) =>
      setup.organisation.prepareSite(c, p, {
        code: syntheticCode('READY-SITE'),
        name: syntheticName('Ready site'),
        physicalKind: 'retail-site',
        areaId: geography.area.recordId,
        addresses: [syntheticName('1 Ready Road')],
        aliases: [],
        validFrom: setup.today(),
      }),
    )
  ).recordId;
  storeId = (
    await approved(setup, (c, p) =>
      setup.organisation.prepareStore(c, p, {
        code: syntheticCode('READY-STORE'),
        name: syntheticName('Ready store'),
        format: 'ebo',
        operatingModel: 'company-owned',
        siteId,
        aliases: [],
        validFrom: setup.today(),
      }),
    )
  ).recordId;
  ready = await unit({ kind: 'whole-store', storeId });
  await verifyFixture(a.database, ready.id);
  await location(ready);
  neighbour = await unit({ kind: 'warehouse' });
  await verifyFixture(a.database, neighbour.id);
  await location(neighbour);
  unverified = await unit({ kind: 'warehouse' });
  counterUnit = await unit({ kind: 'brand-counter', storeId });
  await verifyFixture(a.database, counterUnit.id);
  await location(counterUnit);
  await signedFixture(a.database, RECEIVE_POLICY);
  approveReason = await writeSyntheticReason(a.database, 'approve');
  // The SYNTHETIC essential security settings sign-in reads (access-and-approvals 3.3), in both Organisations.
  for (const organisation of world.organisations) {
    await writeSyntheticSetting(organisation.database, 'access.sign-in-throttling', {
      failureLimit: 50,
      windowSeconds: 600,
    });
    await writeSyntheticSetting(organisation.database, 'access.password-rules', { minimumLength: 12 });
    await writeSyntheticSetting(organisation.database, 'access.office-session-limits', {
      idleLockSeconds: 1800,
      absoluteSeconds: 28800,
    });
  }
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock, gatedOperations: operations });
  operationsUser = await enrolled(a.database, a.code, 'READY-OPS', READINESS_AUTHORITY);
  approver = await enrolled(a.database, a.code, 'READY-APPROVER', APPROVER_AUTHORITY);
  otherOperations = await enrolled(b.database, b.code, 'READY-OTHER', READINESS_AUTHORITY);
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (setup as StructureSetup | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('the checks (PRD-LIF-002; domain-model 3.6; DEC-116)', () => {
  it('POL-10.08 a unit whose mapping is not verified fails the mappings check; one with no location, the locations check', async () => {
    const latest = await run(unverified.id, 'receiving');
    expect(latest.passed).toBe(false);
    expect(stateOf(latest, 'mappings')).toEqual({
      check: 'mappings',
      state: 'failed',
      missing: [{ kind: 'mapping', businessUnitId: unverified.id, lacks: 'verification' }],
    });
    expect(stateOf(latest, 'locations')).toEqual({
      check: 'locations',
      state: 'failed',
      missing: [{ kind: 'location', businessUnitId: unverified.id }],
    });
    expect(latest.ranBy).toBe(operationsUser.displayName);
  });

  it('PRD-LIF-003 the stock plan fails with neither an approved plan nor a zero declaration, and passes with the declaration', async () => {
    const before = await run(ready.id, 'receiving');
    expect(stateOf(before, 'stock-plan')).toEqual({
      check: 'stock-plan',
      state: 'failed',
      missing: [{ kind: 'stock-plan', businessUnitId: ready.id }],
    });
    const declared = await post(operationsUser, `/api/site-lifecycle/units/${ready.id}/zero-stock-declaration`, {
      holdsNoStock: true,
    });
    expect(declared.status, JSON.stringify(declared.body)).toBe(200);
    const after = await run(ready.id, 'receiving');
    expect(stateOf(after, 'stock-plan')?.state).toBe('passed');
    expect((await readiness(operationsUser, ready.id)).zeroStockDeclaration).toMatchObject({
      declaredBy: operationsUser.displayName,
    });
  });

  it('PRD-ACS-006 users and access names a permission nobody at the unit holds, and an approval with fewer than two people', async () => {
    await post(operationsUser, `/api/site-lifecycle/units/${neighbour.id}/zero-stock-declaration`, {
      holdsNoStock: true,
    });
    const [a] = world.organisations;
    // One person alone can prepare and approve the synthetic move, and a holder of the permission is scoped elsewhere.
    const solo = await writeSyntheticUser(a.database, a.code, keys, { label: 'READY-SOLO' });
    await grantSynthetic(a.database, { kind: 'user', id: solo.id }, [
      { recordType: 'access.role', action: 'create' },
      { recordType: 'access.role', action: 'approve' },
    ]);
    const latest = await run(neighbour.id, 'movement');
    expect(stateOf(latest, 'users-and-access')).toEqual({
      check: 'users-and-access',
      state: 'failed',
      missing: [
        { kind: 'permission-holder', action: 'edit', recordType: 'configuration.capability' },
        { kind: 'approval-people', actionType: `${GATE}.synthetic-move` },
      ],
    });
    // A second person who can approve, and a holder of the permission over every place: the check passes.
    const second = await writeSyntheticUser(a.database, a.code, keys, { label: 'READY-SECOND' });
    await grantSynthetic(a.database, { kind: 'user', id: second.id }, [
      { recordType: 'access.role', action: 'approve' },
      { recordType: 'configuration.capability', action: 'edit' },
    ]);
    expect(stateOf(await run(neighbour.id, 'movement'), 'users-and-access')).toEqual({
      check: 'users-and-access',
      state: 'passed',
      missing: [],
    });
  });

  it('a holder whose assignment covers another Site does not count for the unit', async () => {
    const [a] = world.organisations;
    const scoped = await writeSyntheticUser(a.database, a.code, keys, { label: 'READY-SCOPED' });
    await grantSynthetic(a.database, { kind: 'user', id: scoped.id }, [{ recordType: 'stock.hold', action: 'view' }], {
      scope: {
        kind: 'dimensions',
        legalEntity: { kind: 'all' },
        place: { kind: 'selected', members: [{ type: 'site', id: uuidv7() }] },
        brand: { kind: 'all' },
      },
    });
    expect(stateOf(await run(ready.id, 'selling'), 'users-and-access')?.missing).toEqual([
      { kind: 'permission-holder', action: 'view', recordType: 'stock.hold' },
    ]);
  });

  it('the required-policies check fails, naming the policy, while the Available check fails for it', async () => {
    const latest = await run(neighbour.id, 'movement');
    expect(stateOf(latest, 'required-policies')).toEqual({
      check: 'required-policies',
      state: 'failed',
      missing: [
        { kind: 'policy', policy: String(MOVE_POLICY), lacks: 'signature' },
        { kind: 'policy', policy: String(MOVE_POLICY), lacks: 'validation' },
      ],
    });
    expect(stateOf(await run(ready.id, 'receiving'), 'required-policies')?.state).toBe('passed');
  });

  it('PRD-ORG-006 activating a brand counter with no brand in force is refused (product owner, 10 Oct 2026)', async () => {
    await post(operationsUser, `/api/site-lifecycle/units/${counterUnit.id}/zero-stock-declaration`, {
      holdsNoStock: true,
    });
    const latest = await run(counterUnit.id, 'receiving');
    expect(stateOf(latest, 'brand-coverage')).toEqual({
      check: 'brand-coverage',
      state: 'failed',
      missing: [{ kind: 'brand-coverage', businessUnitId: counterUnit.id }],
    });
    const refused = await post(
      operationsUser,
      `/api/site-lifecycle/readiness-records/${latest.readinessRecordId}/activation-request`,
    );
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({
      error: {
        code: 'site-lifecycle.check-failed',
        missing: [
          { kind: 'readiness-check', check: 'brand-coverage' },
          { kind: 'brand-coverage', businessUnitId: counterUnit.id },
        ],
      },
    });
    // With a brand in force, the counter passes.
    const catalogued = async (
      outcome: Awaited<ReturnType<typeof setup.catalogue.prepareBrand>>,
    ): Promise<{ recordId: string }> => {
      if (outcome.kind !== 'success') throw new Error(outcome.refusal.code);
      // A brand takes effect when recorded; a coverage change is approved by a different person (3.3).
      if (outcome.answer.requestId === undefined) return outcome.answer;
      const decision = await setup.decide(outcome.answer.requestId, outcome.answer.versionId);
      if (decision.kind !== 'success') throw new Error(decision.refusal.code);
      return outcome.answer;
    };
    const brand = await catalogued(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareBrand(c, p, {
          code: syntheticCode('READY-BRAND'),
          name: syntheticName('Ready brand'),
          aliases: [],
          validFrom: setup.today(),
        }),
      ),
    );
    await catalogued(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareBusinessUnitBrandVersion(c, p, counterUnit.id, {
          brandIds: [brand.recordId],
          validFrom: setup.today(),
        }),
      ),
    );
    expect(stateOf(await run(counterUnit.id, 'receiving'), 'brand-coverage')?.state).toBe('passed');
  });
});

describe('approving an activity (stage 1 exit check 6; PRD-LIF-001; MM-8, DEC-105)', () => {
  it('PRD-LIF-001 an activity stays unavailable until its checks pass and a different person approves it; the person who ran them cannot', async () => {
    // Before: unavailable at the unit, naming the activity and the place.
    const before = await availabilityOf(operationsUser, RECEIVE, ready);
    expect(before.missing).toContainEqual({
      kind: 'activity',
      activity: 'receiving',
      placeType: 'business-unit',
      placeId: ready.id,
    });
    // A failing run cannot be put forward, and the refusal names the failing check.
    const failing = await run(unverified.id, 'receiving');
    const refused = await post(
      operationsUser,
      `/api/site-lifecycle/readiness-records/${failing.readinessRecordId}/activation-request`,
    );
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ error: { code: 'site-lifecycle.check-failed' } });
    expect((refused.body.error as { missing: unknown[] }).missing).toContainEqual({
      kind: 'readiness-check',
      check: 'mappings',
    });
    // The passing run is put forward.
    const passing = await run(ready.id, 'receiving');
    expect(passing.passed).toBe(true);
    const requested = await post(
      operationsUser,
      `/api/site-lifecycle/readiness-records/${passing.readinessRecordId}/activation-request`,
    );
    expect(requested.status, JSON.stringify(requested.body)).toBe(200);
    const requestId = String(requested.body.requestId);
    // The person who ran the checks is refused, though they hold approve.
    const self = await decide(operationsUser, requestId, passing.readinessRecordId);
    expect(self.status).toBe(422);
    expect(self.body).toMatchObject({ error: { code: 'access.self-preparation' } });
    expect((await availabilityOf(operationsUser, RECEIVE, ready)).missing).toContainEqual(
      expect.objectContaining({ kind: 'activity' }),
    );
    // A different authorised person approves: the grant is written and the activity is available at the unit.
    const decided = await decide(approver, requestId, passing.readinessRecordId);
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    const after = await availabilityOf(operationsUser, RECEIVE, ready);
    expect(after.missing).not.toContainEqual(expect.objectContaining({ kind: 'activity' }));
    const read = await readiness(operationsUser, ready.id);
    expect(read).toMatchObject({ state: 'Active', siteState: 'Active' });
    expect(read.activities.find((each) => each.activity === 'receiving')).toMatchObject({
      granted: true,
      latest: { request: { requestId, state: 'Approved' } },
    });
    // Asking again for a unit that holds it is refused.
    const again = await run(ready.id, 'receiving');
    const twice = await post(
      operationsUser,
      `/api/site-lifecycle/readiness-records/${again.readinessRecordId}/activation-request`,
    );
    expect(twice.body).toMatchObject({ error: { code: 'site-lifecycle.activity-already-granted' } });
  });

  it('PRD-LIF-001 an activity granted at one unit leaves the other units at the Site unavailable', async () => {
    const other = await availabilityOf(operationsUser, RECEIVE, neighbour);
    expect(other.missing).toContainEqual({
      kind: 'activity',
      activity: 'receiving',
      placeType: 'business-unit',
      placeId: neighbour.id,
    });
    expect((await readiness(operationsUser, neighbour.id)).state).toBe('Setting up');
  });

  it('a later run replaces an earlier one, whose request can then no longer be approved', async () => {
    const first = await run(counterUnit.id, 'receiving');
    const requested = await post(
      operationsUser,
      `/api/site-lifecycle/readiness-records/${first.readinessRecordId}/activation-request`,
    );
    expect(requested.status, JSON.stringify(requested.body)).toBe(200);
    await run(counterUnit.id, 'receiving');
    const stale = await decide(approver, String(requested.body.requestId), first.readinessRecordId);
    expect(stale.status, JSON.stringify(stale.body)).toBe(409);
    expect(stale.body).toMatchObject({ error: { code: 'kernel.stale-version' } });
  });

  it('PRD-SEC-005 needs create on the readiness record, covering the unit, to run the checks', async () => {
    const [a] = world.organisations;
    const reader = await enrolled(a.database, a.code, 'READY-READER', [
      { recordType: 'site_lifecycle.readiness_record', action: 'view' },
    ]);
    const refused = await post(reader, `/api/site-lifecycle/units/${ready.id}/readiness/receiving/runs`);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ error: { code: 'access.not-authorised' } });
  });
});

describe('PRD-ACS-020 two synthetic Organisations', () => {
  it('readiness records and grants of one are invisible to the other', async () => {
    const read = await get(otherOperations, `/api/site-lifecycle/units/${ready.id}/readiness`);
    expect(read.status).toBe(404);
    expect(read.body).toMatchObject({ error: { code: 'site-lifecycle.unit-not-found' } });
    const answer = await availabilityOf(otherOperations, RECEIVE, ready);
    expect(answer.missing).toContainEqual(expect.objectContaining({ kind: 'activity', placeId: ready.id }));
  });
});
