import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import type { AssignmentScope, BusinessUnitDraft } from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Preparer } from '../src/modules/access/index.js';
import { organisationScopeMembers, type PreparedVersion } from '../src/modules/organisation/index.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { syntheticKeysEnvironment, writeSyntheticUser, type SyntheticUser } from './support/access.js';
import { grantSynthetic } from './support/grants.js';
import { approved, approvedGeography, decided, structureSetup, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F02-T03: scope by place (access-and-approvals 5, 7, 9.8a, 13.1, 15 tests 8, 9 and 11; structure-and-masters 3.8,
// 3.9, 6.1, 9 test 4; module-map section 3, rule 6; code-house-rules 6.2, 7.3). Role assignments select legal
// entities, Sites, Stores and business units through the scope contract `access` defines and `organisation`
// implements; Authorise and row-level security match each record's facts by equality, so a selected Site covers the
// Stores and units added at it later. Every value here is SYNTHETIC.

let world: SyntheticWorld;
let setup: StructureSetup;
let geography: Awaited<ReturnType<typeof approvedGeography>>;
let admin: Preparer;
let counter = 0;
const next = (prefix: string) => `${prefix}-${String(++counter)}`;

const all = { kind: 'all' } as const;

beforeAll(async () => {
  world = await createSyntheticOrganisations('scope');
  const [orgA] = world.organisations;
  setup = await structureSetup({
    directory: world.directory,
    database: orgA.database,
    organisationCode: orgA.code,
    keysEnvironment: syntheticKeysEnvironment(world),
    label: 'SCOPE',
  });
  geography = await approvedGeography(setup, 'SCOPE');
  // The admin prepares roles and assignments; the structure's approver also decides them (access-and-approvals 9.11).
  const { assignmentId } = await grantSynthetic(orgA.database, { kind: 'user', id: setup.preparer.id }, [
    { recordType: 'access.role', action: 'create' },
    { recordType: 'access.role_assignment', action: 'create' },
  ]);
  admin = { userId: setup.preparer.id, roleAssignmentId: assignmentId };
  await grantSynthetic(orgA.database, { kind: 'user', id: setup.approver.id }, [
    { recordType: 'access.role', action: 'approve' },
    { recordType: 'access.role_assignment', action: 'approve' },
  ]);
});

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

const database = () => world.organisations[0].database;

/** A legal entity with a registration in the scope's State and a book, approved from today. */
async function entity() {
  const legalEntity = await approved(setup, (c, p) =>
    setup.organisation.prepareLegalEntity(c, p, {
      code: syntheticCode(next('LE')),
      legalName: syntheticName('Legal entity'),
      validFrom: setup.today(),
    }),
  );
  const registration = await approved(setup, (c, p) =>
    setup.organisation.prepareTaxRegistration(c, p, {
      code: syntheticCode(next('GSTIN')),
      legalEntityId: legalEntity.recordId,
      registrationNumber: `0${String(counter)}SYNTHETIC`,
      stateId: geography.state.recordId,
      validityFrom: setup.today(),
      validFrom: setup.today(),
    }),
  );
  const book = await approved(setup, (c, p) =>
    setup.organisation.prepareAccountingBook(c, p, {
      code: syntheticCode(next('BK')),
      legalEntityId: legalEntity.recordId,
      name: syntheticName('Book'),
      validFrom: setup.today(),
    }),
  );
  return {
    legalEntityId: legalEntity.recordId,
    taxRegistrationId: registration.recordId,
    accountingBookId: book.recordId,
  };
}

async function site(): Promise<PreparedVersion> {
  const code = next('SITE');
  return approved(setup, (c, p) =>
    setup.organisation.prepareSite(c, p, {
      code: syntheticCode(code),
      name: syntheticName(`Site ${code}`),
      physicalKind: 'retail-site',
      areaId: geography.area.recordId,
      addresses: [syntheticName(`Address ${code}`)],
      aliases: [],
      validFrom: setup.today(),
    }),
  );
}

async function store(siteId: string, validFrom = setup.today()): Promise<PreparedVersion> {
  const code = next('STORE');
  return approved(setup, (c, p) =>
    setup.organisation.prepareStore(c, p, {
      code: syntheticCode(code),
      name: syntheticName(`Store ${code}`),
      format: 'ebo',
      operatingModel: 'company-owned',
      siteId,
      aliases: [],
      validFrom,
    }),
  );
}

type Mapping = Awaited<ReturnType<typeof entity>>;

async function unit(
  siteId: string,
  mapping: Mapping,
  overrides: Partial<BusinessUnitDraft> = {},
): Promise<PreparedVersion> {
  const code = next('BU');
  return approved(setup, (c, p) =>
    setup.organisation.prepareBusinessUnit(c, p, {
      code: syntheticCode(code),
      siteId,
      kind: 'warehouse',
      name: syntheticName(`Unit ${code}`),
      ...mapping,
      validFrom: setup.today(),
      ...overrides,
    }),
  );
}

/** An approved role holding the actions given, from today. */
async function role(actions: readonly { recordType: string; action: 'view' | 'create' | 'edit' | 'approve' }[]) {
  const answer = await setup.run(admin.userId, (c) =>
    setup.access.prepareRole(c, admin, {
      code: syntheticCode(`ROLE-${String(randomInt(1_000_000_000))}`),
      name: syntheticName('Role'),
      permissions: actions.map((each) => ({ kind: 'action', ...each, selfService: false })),
      validFrom: setup.today(),
    }),
  );
  if (answer.kind !== 'success') throw new Error(`role refused: ${answer.refusal.code}`);
  decided(await setup.decide(answer.answer.requestId, answer.answer.versionId));
  return answer.answer.roleId;
}

const prepareAssignment = (userId: string, roleId: string, scope: AssignmentScope) =>
  setup.run(admin.userId, (c) =>
    setup.access.prepareAssignment(c, admin, {
      actor: { kind: 'user', userId },
      roleId,
      scope,
      validFrom: setup.today(),
    }),
  );

/** A user with an approved assignment of the role over the scope; answers the user and the assignment. */
async function assigned(
  roleId: string,
  scope: AssignmentScope,
): Promise<{ user: SyntheticUser; assignmentId: string }> {
  const user = await writeSyntheticUser(database(), world.organisations[0].code, syntheticKeysEnvironment(world), {
    label: next('SCOPED'),
    enrolled: true,
  });
  const answer = await prepareAssignment(user.id, roleId, scope);
  if (answer.kind !== 'success') throw new Error(`assignment refused: ${answer.refusal.code}`);
  decided(await setup.decide(answer.answer.requestId, answer.answer.assignmentId));
  return { user, assignmentId: answer.answer.assignmentId };
}

const places = (...members: { type: 'site' | 'store' | 'business-unit'; id: string }[]): AssignmentScope => ({
  kind: 'dimensions',
  legalEntity: all,
  place: { kind: 'selected', members },
  brand: all,
});

describe('choosing places and legal entities (access-and-approvals 5.1; structure-and-masters 3.8)', () => {
  it('PRD-ACS-001 PRD-ACS-005 refuses an assignment selecting a place or legal entity that does not exist, or is not where it says', async () => {
    const roleId = await role([{ recordType: 'organisation.store', action: 'view' }]);
    const user = await writeSyntheticUser(database(), world.organisations[0].code, syntheticKeysEnvironment(world), {
      label: next('NOWHERE'),
    });
    const aSite = await site();
    const aStore = await store(aSite.recordId);
    const missing = uuidv7();
    expect(await prepareAssignment(user.id, roleId, places({ type: 'store', id: missing }))).toEqual({
      kind: 'refusal',
      refusal: {
        kind: 'refused',
        code: 'access.scope-member-not-found',
        missing: [{ kind: 'scope-member', dimension: 'place', memberType: 'store', memberId: missing }],
      },
    });
    // A Store named as a Site is not where the assignment says.
    expect(await prepareAssignment(user.id, roleId, places({ type: 'site', id: aStore.recordId }))).toMatchObject({
      kind: 'refusal',
      refusal: {
        code: 'access.scope-member-not-found',
        missing: [{ kind: 'scope-member', dimension: 'place', memberType: 'site', memberId: aStore.recordId }],
      },
    });
    // A Site named as a legal entity is not one either.
    expect(
      await prepareAssignment(user.id, roleId, {
        kind: 'dimensions',
        legalEntity: { kind: 'selected', members: [aSite.recordId] },
        place: all,
        brand: all,
      }),
    ).toMatchObject({
      kind: 'refusal',
      refusal: {
        code: 'access.scope-member-not-found',
        missing: [
          { kind: 'scope-member', dimension: 'legal-entity', memberType: 'legal-entity', memberId: aSite.recordId },
        ],
      },
    });
    // Brands are merchandise's side of the contract (S1-F03-T01): a brand that does not exist is refused.
    const noBrand = uuidv7();
    expect(
      await prepareAssignment(user.id, roleId, {
        kind: 'dimensions',
        legalEntity: all,
        place: all,
        brand: { kind: 'selected', members: [noBrand] },
      }),
    ).toMatchObject({
      kind: 'refusal',
      refusal: {
        code: 'access.scope-member-not-found',
        missing: [{ kind: 'scope-member', dimension: 'brand', memberType: 'brand', memberId: noBrand }],
      },
    });
  });

  it('CH-7 keeps the selected places and legal entities, in the scope key, and carries them in the effective grants', async () => {
    const roleId = await role([{ recordType: 'organisation.store', action: 'view' }]);
    const mapping = await entity();
    const aSite = await site();
    const aStore = await store(aSite.recordId);
    const aUnit = await unit(aSite.recordId, mapping);
    const scope: AssignmentScope = {
      kind: 'dimensions',
      legalEntity: { kind: 'selected', members: [mapping.legalEntityId] },
      place: {
        kind: 'selected',
        members: [
          { type: 'store', id: aStore.recordId },
          { type: 'site', id: aSite.recordId },
          { type: 'business-unit', id: aUnit.recordId },
        ],
      },
      brand: all,
    };
    const { user, assignmentId } = await assigned(roleId, scope);
    const owner = await connect(database(), 'migration');
    try {
      const key = await owner.query<{ scope_key: string }>(
        'select scope_key from access.role_assignment where id = $1',
        [assignmentId],
      );
      expect(key.rows[0]?.scope_key).toBe(
        `legal-entity=selected:${mapping.legalEntityId};place=selected:${[
          `business-unit:${aUnit.recordId}`,
          `site:${aSite.recordId}`,
          `store:${aStore.recordId}`,
        ]
          .sort()
          .join(',')};brand=all`,
      );
      const grants = await owner.query<{
        legal_entity_ids: string[];
        site_ids: string[];
        store_ids: string[];
        business_unit_ids: string[];
        place_all: boolean;
      }>(
        `select legal_entity_ids, site_ids, store_ids, business_unit_ids, place_all from access.effective_grant
         where actor_id = $1 and record_type = 'organisation.store'`,
        [user.id],
      );
      expect(grants.rows).toEqual([
        {
          legal_entity_ids: [mapping.legalEntityId],
          site_ids: [aSite.recordId],
          store_ids: [aStore.recordId],
          business_unit_ids: [aUnit.recordId],
          place_all: false,
        },
      ]);
    } finally {
      await owner.end();
    }
  });
});

/** Authorise for the user, on a record of an organisation kind, with the facts `organisation` gives it (5.3). */
async function authoriseOn(
  userId: string,
  action: 'view' | 'edit' | 'approve',
  kind: 'site' | 'store' | 'business_unit' | 'business_unit_mapping' | 'location',
  recordId: string,
) {
  return setup.run(userId, async (c) => {
    const facts = await setup.organisation.placeFacts(c, kind, recordId, setup.today());
    return setup.access.authorise(c, { actorId: userId, action, recordType: `organisation.${kind}`, facts });
  });
}

describe('the place tree (access-and-approvals 5.2; structure-and-masters 3.9; tests 8 and 9)', () => {
  it('access-and-approvals 15 test 8 PRD-ACS-021 a selected Site covers a new Store and unit; a selected Store a new brand counter; a selected unit not a new unit', async () => {
    const roleId = await role([
      { recordType: 'organisation.store', action: 'view' },
      { recordType: 'organisation.business_unit', action: 'view' },
    ]);
    const mapping = await entity();
    const aSite = await site();
    const aStore = await store(aSite.recordId);
    const firstUnit = await unit(aSite.recordId, mapping, { kind: 'whole-store', storeId: aStore.recordId });
    const bySite = await assigned(roleId, places({ type: 'site', id: aSite.recordId }));
    const byStore = await assigned(roleId, places({ type: 'store', id: aStore.recordId }));
    const byUnit = await assigned(roleId, places({ type: 'business-unit', id: firstUnit.recordId }));

    // Added after the assignments were approved.
    const newStore = await store(aSite.recordId);
    const newWarehouse = await unit(aSite.recordId, mapping);
    const newCounter = await unit(aSite.recordId, mapping, { kind: 'brand-counter', storeId: aStore.recordId });

    expect(await authoriseOn(bySite.user.id, 'view', 'store', newStore.recordId)).toEqual({
      kind: 'allowed',
      roleAssignmentId: bySite.assignmentId,
    });
    expect(await authoriseOn(bySite.user.id, 'view', 'business_unit', newWarehouse.recordId)).toMatchObject({
      kind: 'allowed',
    });
    expect(await authoriseOn(byStore.user.id, 'view', 'business_unit', newCounter.recordId)).toEqual({
      kind: 'allowed',
      roleAssignmentId: byStore.assignmentId,
    });
    expect(await authoriseOn(byStore.user.id, 'view', 'store', newStore.recordId)).toEqual({
      kind: 'refused',
      refusal: {
        kind: 'not-authorised',
        code: 'access.not-authorised',
        missing: [
          {
            kind: 'scope',
            dimension: 'place',
            roleAssignmentId: byStore.assignmentId,
            factType: 'store',
            factId: newStore.recordId,
          },
        ],
      },
    });
    expect(await authoriseOn(byUnit.user.id, 'view', 'business_unit', firstUnit.recordId)).toMatchObject({
      kind: 'allowed',
    });
    expect(await authoriseOn(byUnit.user.id, 'view', 'business_unit', newCounter.recordId)).toMatchObject({
      kind: 'refused',
      refusal: {
        missing: [{ kind: 'scope', dimension: 'place', factType: 'business-unit', factId: newCounter.recordId }],
      },
    });
  });

  it('access-and-approvals 15 test 9 PRD-ACS-005 all members covers a Site added later; an empty place grants nothing', async () => {
    const roleId = await role([{ recordType: 'organisation.site', action: 'view' }]);
    const everywhere = await assigned(roleId, { kind: 'dimensions', legalEntity: all, place: all, brand: all });
    const nowhere = await assigned(roleId, {
      kind: 'dimensions',
      legalEntity: all,
      place: { kind: 'empty' },
      brand: all,
    });
    const later = await site();
    expect(await authoriseOn(everywhere.user.id, 'view', 'site', later.recordId)).toEqual({
      kind: 'allowed',
      roleAssignmentId: everywhere.assignmentId,
    });
    expect(await authoriseOn(nowhere.user.id, 'view', 'site', later.recordId)).toMatchObject({
      kind: 'refused',
      refusal: { missing: [{ kind: 'scope', dimension: 'place' }] },
    });
  });
});

describe('expanding a place (structure-and-masters 3.9, 9 test 4)', () => {
  it('structure-and-masters 9 test 4 PRD-ACS-021 PRD-ORG-021 a Site covers the Stores linked to it on the date and the units at it; a Store its units; a unit itself', async () => {
    const mapping = await entity();
    const siteA = await site();
    const siteB = await site();
    const staying = await store(siteA.recordId);
    const moving = await store(siteA.recordId);
    // The moving Store's Scheduled link to Site B, from three days on (3.3; the relocation flow is stage 5).
    const later = setup.day(3);
    await approved(setup, (c, p) =>
      setup.organisation.prepareStoreVersion(c, p, moving.recordId, {
        name: syntheticName('Store at its new Site'),
        format: 'ebo',
        operatingModel: 'company-owned',
        siteId: siteB.recordId,
        aliases: [],
        validFrom: later,
      }),
    );
    const wholeStore = await unit(siteA.recordId, mapping, { kind: 'whole-store', storeId: staying.recordId });
    const counter = await unit(siteA.recordId, mapping, { kind: 'brand-counter', storeId: staying.recordId });
    const warehouse = await unit(siteA.recordId, mapping);
    const expand = (place: { type: 'site' | 'store' | 'business-unit'; id: string }, date: string) =>
      setup.run(setup.preparer.id, (c) => {
        if (organisationScopeMembers.expand === undefined) throw new Error('organisation expands places');
        return organisationScopeMembers.expand(c, place, date);
      });
    const sorted = (ids: readonly string[]) => [...ids].sort();

    expect(await expand({ type: 'site', id: siteA.recordId }, setup.today())).toEqual({
      storeIds: sorted([staying.recordId, moving.recordId]),
      businessUnitIds: sorted([wholeStore.recordId, counter.recordId, warehouse.recordId]),
    });
    expect(await expand({ type: 'site', id: siteA.recordId }, later)).toEqual({
      storeIds: [staying.recordId],
      businessUnitIds: sorted([wholeStore.recordId, counter.recordId, warehouse.recordId]),
    });
    expect(await expand({ type: 'site', id: siteB.recordId }, setup.today())).toEqual({
      storeIds: [],
      businessUnitIds: [],
    });
    expect(await expand({ type: 'site', id: siteB.recordId }, later)).toEqual({
      storeIds: [moving.recordId],
      businessUnitIds: [],
    });
    expect(await expand({ type: 'store', id: staying.recordId }, setup.today())).toEqual({
      storeIds: [],
      businessUnitIds: sorted([wholeStore.recordId, counter.recordId]),
    });
    expect(await expand({ type: 'business-unit', id: counter.recordId }, setup.today())).toEqual({
      storeIds: [],
      businessUnitIds: [counter.recordId],
    });
  });
});

describe('the facts a record carries on a date (structure-and-masters 6.1; access-and-approvals 5.3)', () => {
  const factsOn = (kind: 'store' | 'business_unit' | 'business_unit_mapping', recordId: string, date: string) =>
    setup.run(setup.preparer.id, (c) => setup.organisation.placeFacts(c, kind, recordId, date));

  it('PRD-ACS-021 PRD-ORG-021 a Store with no version in force on the date is at the Site of its version nearest the date: an ended or relocated Store at its last Site', async () => {
    const siteA = await site();
    const siteB = await site();
    const moved = await store(siteA.recordId);
    await approved(setup, (c, p) =>
      setup.organisation.prepareStoreVersion(c, p, moved.recordId, {
        name: syntheticName('Store at its new Site'),
        format: 'ebo',
        operatingModel: 'company-owned',
        siteId: siteB.recordId,
        aliases: [],
        validFrom: setup.day(2),
      }),
    );
    // Its last version ended on day 4: moving an approved version's end earlier is what the guard admits (6.1).
    const owner = await connect(database(), 'migration');
    try {
      await owner.query(
        `update organisation.store_version set valid_during = daterange(lower(valid_during), $3::date)
         where store_id = $1 and site_id = $2`,
        [moved.recordId, siteB.recordId, setup.day(4)],
      );
    } finally {
      await owner.end();
    }
    expect(await factsOn('store', moved.recordId, setup.day(6))).toEqual({
      siteId: siteB.recordId,
      storeId: moved.recordId,
    });
    expect(await factsOn('store', moved.recordId, setup.day(3))).toEqual({
      siteId: siteB.recordId,
      storeId: moved.recordId,
    });
    expect(await factsOn('store', moved.recordId, setup.day(-1))).toEqual({
      siteId: siteA.recordId,
      storeId: moved.recordId,
    });
  });

  it('POL-10.01 PRD-ACS-001 a unit and its mapping carry the legal entity of the mapping in force; a legal-entity-scoped person is covered only for units mapped to its legal entity', async () => {
    const mine = await entity();
    const theirs = await entity();
    const aSite = await site();
    const myUnit = await unit(aSite.recordId, mine);
    const theirUnit = await unit(aSite.recordId, theirs);
    // A later mapping of my unit to their legal entity, from day 3 (3.4): today it is still mine.
    await approved(setup, (c, p) =>
      setup.organisation.prepareBusinessUnitMappingVersion(c, p, myUnit.recordId, {
        ...theirs,
        validFrom: setup.day(3),
      }),
    );
    expect(await factsOn('business_unit', myUnit.recordId, setup.today())).toEqual({
      legalEntityId: mine.legalEntityId,
      siteId: aSite.recordId,
      businessUnitId: myUnit.recordId,
    });
    expect(await factsOn('business_unit_mapping', myUnit.recordId, setup.day(3))).toMatchObject({
      legalEntityId: theirs.legalEntityId,
    });
    const roleId = await role([
      { recordType: 'organisation.business_unit', action: 'view' },
      { recordType: 'organisation.business_unit_mapping', action: 'view' },
    ]);
    const byEntity = await assigned(roleId, {
      kind: 'dimensions',
      legalEntity: { kind: 'selected', members: [mine.legalEntityId] },
      place: all,
      brand: all,
    });
    expect(await authoriseOn(byEntity.user.id, 'view', 'business_unit', myUnit.recordId)).toEqual({
      kind: 'allowed',
      roleAssignmentId: byEntity.assignmentId,
    });
    expect(await authoriseOn(byEntity.user.id, 'view', 'business_unit_mapping', myUnit.recordId)).toMatchObject({
      kind: 'allowed',
    });
    expect(await authoriseOn(byEntity.user.id, 'view', 'business_unit', theirUnit.recordId)).toEqual({
      kind: 'refused',
      refusal: {
        kind: 'not-authorised',
        code: 'access.not-authorised',
        missing: [
          {
            kind: 'scope',
            dimension: 'legal-entity',
            roleAssignmentId: byEntity.assignmentId,
            factType: 'legal-entity',
            factId: theirs.legalEntityId,
          },
        ],
      },
    });
  });
});

describe('row-level security with place-scoped actors (access-and-approvals 7.2; code-house-rules 6.2; test 11)', () => {
  it('access-and-approvals 15 test 11 PRD-SEC-005 a place-scoped reader sees only the history rows of the places its grant covers, matched by equality, places added later included', async () => {
    const siteA = await site();
    const siteB = await site();
    const storeA = await store(siteA.recordId);
    const storeElsewhere = await store(siteB.recordId);
    const reading = [
      { recordType: 'audit.audit_record', action: 'view' as const },
      { recordType: 'organisation.store', action: 'view' as const },
    ];
    const grant = async (label: string, scope: AssignmentScope) => {
      const user = await writeSyntheticUser(database(), world.organisations[0].code, syntheticKeysEnvironment(world), {
        label: next(label),
      });
      await grantSynthetic(database(), { kind: 'user', id: user.id }, reading, { scope });
      return user;
    };
    const bySite = await grant('RLS-SITE', places({ type: 'site', id: siteA.recordId }));
    const byStore = await grant('RLS-STORE', places({ type: 'store', id: storeA.recordId }));
    // Added after the grants were written: no grant row changes, and the selected Site still covers it (7.2).
    const storeLater = await store(siteA.recordId);
    const storesSeen = (actorId: string) =>
      setup.run(actorId, async (c) => {
        const rows = await c.tx.execute<{ record_id: string }>(
          sql`select distinct record_id from audit.audit_record
              where record_module = 'organisation' and record_type = 'store' order by record_id`,
        );
        return rows.rows.map((row) => row.record_id);
      });
    expect(await storesSeen(bySite.id)).toEqual([storeA.recordId, storeLater.recordId].sort());
    expect(await storesSeen(byStore.id)).toEqual([storeA.recordId]);
    expect(await storesSeen(byStore.id)).not.toContain(storeElsewhere.recordId);
  });
});
