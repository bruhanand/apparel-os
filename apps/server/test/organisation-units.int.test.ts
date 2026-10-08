import { uuidv7 } from '@apparel-os/domain';
import {
  businessUnitDraftSchema,
  locationDraftSchema,
  type BusinessUnitDraft,
  type LocationDraft,
  type SiteDraft,
  type StoreDraft,
} from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LocationInUse, PreparedVersion } from '../src/modules/organisation/index.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { syntheticKeysEnvironment, writeSyntheticUser } from './support/access.js';
import { grantSynthetic } from './support/grants.js';
import {
  approved,
  approvedGeography,
  decided,
  prepared,
  structureSetup,
  type StructureSetup,
} from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, sqlState } from './support/postgres.js';

// S1-F02-T02: business units, their mappings, locations and default warehouses through the organisation module's
// interface and access's Decide, on real PostgreSQL (structure-and-masters 3.3 to 3.6, 3.8, 9 tests 1, 2, 3, 6, 14, 15
// and 16; code-house-rules 7.3, 11.4). The synthetic transaction of test 1 is the test-only
// `test_mapping.synthetic_transaction`, made by this file in its own database copy (code-house-rules 11.4, as built).
// Verification with its evidence files is proved through the routes (organisation-unit-routes.int.test.ts). Every value
// here is SYNTHETIC.

let world: SyntheticWorld;
let setup: StructureSetup;
let other: StructureSetup;
/** A setup whose location-in-use implementation answers from `stocked`, as `stock` would. */
let answered: StructureSetup;
const stocked = new Set<string>();
let home: Awaited<ReturnType<typeof approvedGeography>>;
let away: Awaited<ReturnType<typeof approvedGeography>>;
let counter = 0;
let keys: Record<string, string>;

const next = (prefix: string) => `${prefix}-${String(++counter)}`;

beforeAll(async () => {
  world = await createSyntheticOrganisations('units');
  const keysEnvironment = syntheticKeysEnvironment(world);
  keys = keysEnvironment;
  const [orgA, orgB] = world.organisations;
  const options = {
    directory: world.directory,
    database: orgA.database,
    organisationCode: orgA.code,
    keysEnvironment,
  };
  setup = await structureSetup({ ...options, label: 'UNITS-A' });
  const locationInUse: LocationInUse = { hasStock: (_context, id) => Promise.resolve(stocked.has(id)) };
  answered = await structureSetup({ ...options, label: 'UNITS-STOCK', locationInUse });
  other = await structureSetup({
    directory: world.directory,
    database: orgB.database,
    organisationCode: orgB.code,
    keysEnvironment,
    label: 'UNITS-B',
  });
  home = await approvedGeography(setup, 'HOME');
  away = await approvedGeography(setup, 'AWAY');
  // The test-only schema of test 1's synthetic transaction (code-house-rules 11.4), in this file's database copy only.
  const owner = await connect(orgA.database, 'migration');
  try {
    await owner.query(`
      create schema test_mapping;
      grant usage on schema test_mapping to aos_runtime;
      create table test_mapping.synthetic_transaction (
        id uuid primary key, business_unit_id uuid not null, mapping_version_id uuid not null);
      grant select, insert on test_mapping.synthetic_transaction to aos_runtime;`);
  } finally {
    await owner.end();
  }
});

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (answered as StructureSetup | undefined)?.close();
  await (other as StructureSetup | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

/** A legal entity with a registration in a State and a book, all approved from today. */
async function entity(stateId: string, on: StructureSetup = setup) {
  const legalEntity = await approved(on, (c, p) =>
    on.organisation.prepareLegalEntity(c, p, {
      code: syntheticCode(next('LE')),
      legalName: syntheticName('Legal entity'),
      validFrom: on.today(),
    }),
  );
  const registration = await approved(on, (c, p) =>
    on.organisation.prepareTaxRegistration(c, p, {
      code: syntheticCode(next('GSTIN')),
      legalEntityId: legalEntity.recordId,
      registrationNumber: `0${String(counter)}SYNTHETIC`,
      stateId,
      validityFrom: on.today(),
      validFrom: on.today(),
    }),
  );
  const book = await approved(on, (c, p) =>
    on.organisation.prepareAccountingBook(c, p, {
      code: syntheticCode(next('BK')),
      legalEntityId: legalEntity.recordId,
      name: syntheticName('Book'),
      validFrom: on.today(),
    }),
  );
  return {
    legalEntityId: legalEntity.recordId,
    taxRegistrationId: registration.recordId,
    accountingBookId: book.recordId,
  };
}

async function site(areaId: string = home.area.recordId, on: StructureSetup = setup): Promise<PreparedVersion> {
  const code = next('SITE');
  const draft: SiteDraft = {
    code: syntheticCode(code),
    name: syntheticName(`Site ${code}`),
    physicalKind: 'retail-site',
    areaId,
    addresses: [syntheticName(`Address ${code}`)],
    aliases: [],
    validFrom: on.today(),
  };
  return approved(on, (c, p) => on.organisation.prepareSite(c, p, draft));
}

async function store(siteId: string): Promise<PreparedVersion> {
  const code = next('STORE');
  const draft: StoreDraft = {
    code: syntheticCode(code),
    name: syntheticName(`Store ${code}`),
    format: 'ebo',
    operatingModel: 'company-owned',
    siteId,
    aliases: [],
    validFrom: setup.today(),
  };
  return approved(setup, (c, p) => setup.organisation.prepareStore(c, p, draft));
}

type Mapping = Awaited<ReturnType<typeof entity>>;

function unitDraft(siteId: string, mapping: Mapping, overrides: Partial<BusinessUnitDraft> = {}): BusinessUnitDraft {
  const code = next('BU');
  return {
    code: syntheticCode(code),
    siteId,
    kind: 'warehouse',
    name: syntheticName(`Unit ${code}`),
    ...mapping,
    validFrom: setup.today(),
    ...overrides,
  };
}

const prepareUnit = (draft: BusinessUnitDraft, on: StructureSetup = setup) =>
  on.prepare((c, p) => on.organisation.prepareBusinessUnit(c, p, draft));

const approvedUnit = async (draft: BusinessUnitDraft, on: StructureSetup = setup) => {
  const answer = prepared(await prepareUnit(draft, on));
  decided(await on.decide(answer.requestId, answer.versionId));
  return answer;
};

const structureOn = (date: string, on: StructureSetup = setup) =>
  on.run(on.preparer.id, (c) => on.organisation.structureOn(c, date));

const mappingOn = (unitId: string, date: string, on: StructureSetup = setup) =>
  on.run(on.preparer.id, (c) => on.organisation.mappingOn(c, unitId, date));

function refusedWith(outcome: { kind: string; refusal?: { code: string } }): string | undefined {
  return outcome.kind === 'refusal' ? outcome.refusal?.code : undefined;
}

function locationDraft(siteId: string, businessUnitId: string, overrides: Partial<LocationDraft> = {}): LocationDraft {
  const code = next('LOC');
  return {
    code: syntheticCode(code),
    siteId,
    businessUnitId,
    name: syntheticName(`Location ${code}`),
    kind: 'floor',
    validFrom: setup.today(),
    ...overrides,
  };
}

describe('business units and their mappings (structure-and-masters 3.3, 3.4)', () => {
  it('structure-and-masters 9 test 1 PRD-ORG-005 PRD-ACP-013 one Site, two units mapped to different books and registrations; each transaction keeps its own mapping version, unchanged by a later change', async () => {
    const shared = await site();
    const first = await entity(home.state.recordId);
    const second = await entity(home.state.recordId);
    const store1 = await store(shared.recordId);
    const wholeStore = await approvedUnit(
      unitDraft(shared.recordId, first, { kind: 'whole-store', storeId: store1.recordId }),
    );
    const warehouse = await approvedUnit(unitDraft(shared.recordId, second));
    // Both are in the structure as of today, each with its kind and its mapping version, starting Setting up (3.7).
    const today = await structureOn(setup.today());
    expect(today.businessUnits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: wholeStore.recordId,
          siteId: shared.recordId,
          kind: 'whole-store',
          storeId: store1.recordId,
          status: 'Setting up',
        }),
        expect.objectContaining({ id: warehouse.recordId, siteId: shared.recordId, kind: 'warehouse' }),
      ]),
    );
    // A unit's history shows the mapping its first version was prepared and approved with (PRD-ACS-007).
    const history = await setup.run(setup.preparer.id, (c) =>
      setup.organisation.list(c, 'business_unit', setup.today(), {}),
    );
    expect(history.records.find((each) => each.id === warehouse.recordId)?.versions).toEqual([
      expect.objectContaining({ state: 'In force', ...second }),
    ]);
    const mappingA = await mappingOn(wholeStore.recordId, setup.today());
    const mappingB = await mappingOn(warehouse.recordId, setup.today());
    if (mappingA.kind !== 'success' || mappingB.kind !== 'success') throw new Error('no mapping');
    expect(mappingA.answer).toMatchObject({ ...first, siteId: shared.recordId });
    expect(mappingB.answer).toMatchObject({ ...second, siteId: shared.recordId });
    expect(mappingA.answer.verification).toBeUndefined();
    expect(today.businessUnitMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: wholeStore.recordId, versionId: mappingA.answer.mappingVersionId, ...first }),
        expect.objectContaining({ id: warehouse.recordId, versionId: mappingB.answer.mappingVersionId, ...second }),
      ]),
    );
    // A synthetic transaction on each unit stores the mapping version it used (PRD-ACP-013).
    const record = (unitId: string, versionId: string) =>
      setup.run(setup.preparer.id, async (c) => {
        await c.tx.execute(
          sql`insert into test_mapping.synthetic_transaction (id, business_unit_id, mapping_version_id)
              values (${uuidv7()}::uuid, ${unitId}::uuid, ${versionId}::uuid)`,
        );
      });
    await record(wholeStore.recordId, mappingA.answer.mappingVersionId);
    await record(warehouse.recordId, mappingB.answer.mappingVersionId);
    // A later mapping change of the warehouse, from a later date, is a new version; the stored versions stay.
    const third = await entity(home.state.recordId);
    const change = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareBusinessUnitMappingVersion(c, p, warehouse.recordId, {
          ...third,
          validFrom: setup.day(2),
        }),
      ),
    );
    decided(await setup.decide(change.requestId, change.versionId));
    const later = await mappingOn(warehouse.recordId, setup.day(2));
    expect(later).toMatchObject({ kind: 'success', answer: { ...third, mappingVersionId: change.versionId } });
    expect(await mappingOn(warehouse.recordId, setup.today())).toMatchObject({
      kind: 'success',
      answer: { mappingVersionId: mappingB.answer.mappingVersionId },
    });
    const owner = await connect(world.organisations[0].database, 'migration');
    try {
      const stored = await owner.query<{ business_unit_id: string; mapping_version_id: string }>(
        `select business_unit_id, mapping_version_id from test_mapping.synthetic_transaction
         where business_unit_id = any($1::uuid[]) order by business_unit_id`,
        [[wholeStore.recordId, warehouse.recordId]],
      );
      expect(new Map(stored.rows.map((row) => [row.business_unit_id, row.mapping_version_id]))).toEqual(
        new Map([
          [wholeStore.recordId, mappingA.answer.mappingVersionId],
          [warehouse.recordId, mappingB.answer.mappingVersionId],
        ]),
      );
      // Each approved mapping, the first ones with their units, emitted organisation.mapping-changed.
      const events = await owner.query<{ n: number }>(
        `select count(*)::int as n from kernel.outbox_event
         where event_type = 'organisation.mapping-changed' and subject_record_id = $1`,
        [warehouse.recordId],
      );
      expect(events.rows).toEqual([{ n: 2 }]);
    } finally {
      await owner.end();
    }
  });

  it('structure-and-masters 9 test 2 PRD-ORG-020 a mapping whose registration or book belongs to another legal entity is refused', async () => {
    const at = await site();
    const mine = await entity(home.state.recordId);
    const theirs = await entity(home.state.recordId);
    for (const mixed of [
      { ...mine, taxRegistrationId: theirs.taxRegistrationId },
      { ...mine, accountingBookId: theirs.accountingBookId },
    ]) {
      expect(refusedWith(await prepareUnit(unitDraft(at.recordId, mixed)))).toBe(
        'organisation.mapping-legal-entity-mismatch',
      );
    }
    const unit = await approvedUnit(unitDraft(at.recordId, mine));
    expect(
      refusedWith(
        await setup.prepare((c, p) =>
          setup.organisation.prepareBusinessUnitMappingVersion(c, p, unit.recordId, {
            ...mine,
            accountingBookId: theirs.accountingBookId,
            validFrom: setup.day(1),
          }),
        ),
      ),
    ).toBe('organisation.mapping-legal-entity-mismatch');
    // The database refuses it too, the owner included.
    const owner = await connect(world.organisations[0].database, 'migration');
    try {
      expect(
        await sqlState(
          owner.query(
            `insert into organisation.business_unit_mapping (id, business_unit_id, legal_entity_id, tax_registration_id,
               accounting_book_id, valid_during, decision, prepared_by_user_id)
             values ($1, $2, $3, $4, $5, daterange(current_date + 5, null), 'Awaiting approval', $6)`,
            [
              uuidv7(),
              unit.recordId,
              mine.legalEntityId,
              theirs.taxRegistrationId,
              mine.accountingBookId,
              setup.preparer.id,
            ],
          ),
        ),
      ).toBe('AO006');
    } finally {
      await owner.end();
    }
  });

  it('structure-and-masters 9 test 3 PRD-MOD-010 PRD-ORG-005 overlapping approved mappings are refused, a Scheduled one included; a unit is never without a mapping', async () => {
    const at = await site();
    const mapping = await entity(home.state.recordId);
    const unit = await approvedUnit(unitDraft(at.recordId, mapping));
    const changeOn = async (validFrom: string) =>
      prepared(
        await setup.prepare((c, p) =>
          setup.organisation.prepareBusinessUnitMappingVersion(c, p, unit.recordId, { ...mapping, validFrom }),
        ),
      );
    const scheduled = await changeOn(setup.day(5));
    decided(await setup.decide(scheduled.requestId, scheduled.versionId));
    // Another starting on the Scheduled one's start is refused (2.2).
    const same = await changeOn(setup.day(5));
    expect(refusedWith(await setup.decide(same.requestId, same.versionId))).toBe('organisation.version-overlaps');
    // Every day from the unit's start reads a mapping: the first ends where the Scheduled one starts.
    for (const day of [0, 4, 5, 30]) {
      expect((await mappingOn(unit.recordId, setup.day(day))).kind).toBe('success');
    }
    expect(await mappingOn(unit.recordId, setup.day(-1))).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'organisation.no-mapping-in-force' },
    });
    // A new unit's draft re-dated without its mapping is never approved: a unit is never in force without one.
    const fresh = prepared(await prepareUnit(unitDraft(at.recordId, mapping)));
    const redated = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareBusinessUnitVersion(c, p, fresh.recordId, {
          name: syntheticName('Re-dated'),
          validFrom: setup.day(1),
        }),
      ),
    );
    expect(refusedWith(await setup.decide(redated.requestId, redated.versionId))).toBe(
      'organisation.unit-without-mapping',
    );
    // The database keeps the rule too: a mapping's end moved so a gap opens is refused at commit.
    const owner = await connect(world.organisations[0].database, 'migration');
    try {
      expect(
        await sqlState(
          owner.query(
            `update organisation.business_unit_mapping
             set valid_during = daterange(lower(valid_during), lower(valid_during) + 1)
             where business_unit_id = $1 and decision = 'Approved' and upper(valid_during) = $2::date`,
            [unit.recordId, setup.day(5)],
          ),
        ),
      ).toBe('AO006');
    } finally {
      await owner.end();
    }
  });

  it('structure-and-masters 9 test 15 GC2-1 a registration in another State than the unit’s Site is refused; one in the same State is accepted; a later Site or registration version out of step is refused', async () => {
    const at = await site();
    const local = await entity(home.state.recordId);
    const elsewhere = await entity(away.state.recordId);
    expect(refusedWith(await prepareUnit(unitDraft(at.recordId, elsewhere)))).toBe(
      'organisation.registration-in-another-state',
    );
    const unit = await approvedUnit(unitDraft(at.recordId, local));
    expect(
      refusedWith(
        await setup.prepare((c, p) =>
          setup.organisation.prepareBusinessUnitMappingVersion(c, p, unit.recordId, {
            ...elsewhere,
            validFrom: setup.day(1),
          }),
        ),
      ),
    ).toBe('organisation.registration-in-another-state');
    // A Site version moving the Site to an Area of another State would put the mapping out of step.
    const move = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareSiteVersion(c, p, at.recordId, {
          name: syntheticName('Moved site'),
          physicalKind: 'retail-site',
          areaId: away.area.recordId,
          addresses: [syntheticName('Moved address')],
          aliases: [],
          validFrom: setup.day(3),
        }),
      ),
    );
    expect(refusedWith(await setup.decide(move.requestId, move.versionId))).toBe('organisation.mapping-out-of-step');
    // So would a registration version moving it to another State; nothing of either decision stays.
    const moved = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareTaxRegistrationVersion(c, p, local.taxRegistrationId, {
          registrationNumber: '0SYNTHETIC-MOVED',
          stateId: away.state.recordId,
          validityFrom: setup.today(),
          validFrom: setup.day(3),
        }),
      ),
    );
    expect(refusedWith(await setup.decide(moved.requestId, moved.versionId))).toBe('organisation.mapping-out-of-step');
    expect(await mappingOn(unit.recordId, setup.day(10))).toMatchObject({ kind: 'success', answer: local });
  });

  it('structure-and-masters 3.3 PRD-ORG-004 a second whole-store unit for a Store and a Store’s unit at a Site its Store is not linked to are refused', async () => {
    const at = await site();
    const elsewhere = await site();
    const mapping = await entity(home.state.recordId);
    const shop = await store(at.recordId);
    await approvedUnit(unitDraft(at.recordId, mapping, { kind: 'whole-store', storeId: shop.recordId }));
    expect(
      refusedWith(await prepareUnit(unitDraft(at.recordId, mapping, { kind: 'whole-store', storeId: shop.recordId }))),
    ).toBe('organisation.whole-store-unit-exists');
    // Any number of brand-counter units of the Store at its Site.
    await approvedUnit(unitDraft(at.recordId, mapping, { kind: 'brand-counter', storeId: shop.recordId }));
    await approvedUnit(unitDraft(at.recordId, mapping, { kind: 'brand-counter', storeId: shop.recordId }));
    expect(
      refusedWith(
        await prepareUnit(unitDraft(elsewhere.recordId, mapping, { kind: 'brand-counter', storeId: shop.recordId })),
      ),
    ).toBe('organisation.store-at-another-site');
    // A warehouse or office unit names no Store; a Store's unit names one.
    expect(
      businessUnitDraftSchema.safeParse(unitDraft(at.recordId, mapping, { kind: 'warehouse', storeId: shop.recordId }))
        .success,
    ).toBe(false);
    expect(businessUnitDraftSchema.safeParse(unitDraft(at.recordId, mapping, { kind: 'whole-store' })).success).toBe(
      false,
    );
  });

  it('structure-and-masters 9 test 16 PRD-ACS-006 a change to a unit, a mapping, a location or a default warehouse approved by its preparer is refused', async () => {
    await grantSynthetic(
      world.organisations[0].database,
      { kind: 'user', id: setup.preparer.id },
      [
        'organisation.business_unit',
        'organisation.business_unit_mapping',
        'organisation.location',
        'organisation.store_default_warehouse',
      ].map((recordType) => ({ recordType, action: 'approve' as const })),
    );
    const at = await site();
    const mapping = await entity(home.state.recordId);
    const shop = await store(at.recordId);
    const unit = await approvedUnit(unitDraft(at.recordId, mapping));
    const location = await approved(setup, (c, p) =>
      setup.organisation.prepareLocation(c, p, locationDraft(at.recordId, unit.recordId)),
    );
    const changes = [
      await setup.prepare((c, p) => setup.organisation.prepareBusinessUnit(c, p, unitDraft(at.recordId, mapping))),
      await setup.prepare((c, p) =>
        setup.organisation.prepareBusinessUnitMappingVersion(c, p, unit.recordId, {
          ...mapping,
          validFrom: setup.day(1),
        }),
      ),
      await setup.prepare((c, p) =>
        setup.organisation.prepareLocationVersion(c, p, location.recordId, {
          name: syntheticName('Renamed'),
          kind: 'floor',
          retired: false,
          validFrom: setup.day(1),
        }),
      ),
      await setup.prepare((c, p) =>
        setup.organisation.prepareStoreDefaultWarehouseVersion(c, p, shop.recordId, {
          warehouseUnitId: unit.recordId,
          validFrom: setup.today(),
        }),
      ),
    ];
    for (const change of changes) {
      const answer = prepared(change);
      expect(refusedWith(await setup.decide(answer.requestId, answer.versionId, 'approve', setup.preparer))).toBe(
        'access.self-preparation',
      );
    }
  });
});

describe('locations and default warehouses (structure-and-masters 3.5, 3.6)', () => {
  it('structure-and-masters 9 test 6 PRD-ORG-012 a location whose unit is at another Site is refused; a zone, rack or bin nests in its own unit', async () => {
    const at = await site();
    const elsewhere = await site();
    const mapping = await entity(home.state.recordId);
    const unit = await approvedUnit(unitDraft(at.recordId, mapping));
    const otherUnit = await approvedUnit(unitDraft(at.recordId, mapping));
    expect(
      refusedWith(
        await setup.prepare((c, p) =>
          setup.organisation.prepareLocation(c, p, locationDraft(elsewhere.recordId, unit.recordId)),
        ),
      ),
    ).toBe('organisation.location-unit-at-another-site');
    const floor = await approved(setup, (c, p) =>
      setup.organisation.prepareLocation(c, p, locationDraft(at.recordId, unit.recordId)),
    );
    const zone = await approved(setup, (c, p) =>
      setup.organisation.prepareLocation(
        c,
        p,
        locationDraft(at.recordId, unit.recordId, { kind: 'zone', parentLocationId: floor.recordId }),
      ),
    );
    expect((await structureOn(setup.today())).locations).toContainEqual(
      expect.objectContaining({
        id: zone.recordId,
        siteId: at.recordId,
        businessUnitId: unit.recordId,
        kind: 'zone',
        parentLocationId: floor.recordId,
        retired: false,
      }),
    );
    // A parent of another unit is refused; only a zone, rack or bin nests.
    expect(
      refusedWith(
        await setup.prepare((c, p) =>
          setup.organisation.prepareLocation(
            c,
            p,
            locationDraft(at.recordId, otherUnit.recordId, { kind: 'bin', parentLocationId: floor.recordId }),
          ),
        ),
      ),
    ).toBe('organisation.location-unit-at-another-site');
    expect(
      locationDraftSchema.safeParse(
        locationDraft(at.recordId, unit.recordId, { kind: 'display', parentLocationId: floor.recordId }),
      ).success,
    ).toBe(false);
    // The database keeps the unit at the location's Site, the owner included.
    const owner = await connect(world.organisations[0].database, 'migration');
    try {
      expect(
        await sqlState(
          owner.query(
            `insert into organisation.location (id, code, site_id, business_unit_id) values ($1, $2, $3, $4)`,
            [uuidv7(), syntheticCode(next('LOC')), elsewhere.recordId, unit.recordId],
          ),
        ),
      ).toBe('23503');
    } finally {
      await owner.end();
    }
  });

  it('structure-and-masters 3.5 a location is retired only when stock answers that none is recorded there; never while no implementation answers', async () => {
    const at = await site(home.area.recordId, answered);
    const mapping = await entity(home.state.recordId, answered);
    const unit = await approvedUnit({ ...unitDraft(at.recordId, mapping), validFrom: answered.today() }, answered);
    const retire = (on: StructureSetup, locationId: string) =>
      on.prepare((c, p) =>
        on.organisation.prepareLocationVersion(c, p, locationId, {
          name: syntheticName('Retired'),
          kind: 'floor',
          retired: true,
          validFrom: on.day(1),
        }),
      );
    const location = await approved(answered, (c, p) =>
      answered.organisation.prepareLocation(c, p, { ...locationDraft(at.recordId, unit.recordId) }),
    );
    // With no implementation answering, the location cannot be retired.
    expect(refusedWith(await retire(setup, location.recordId))).toBe('organisation.location-in-use-unanswered');
    // While stock is recorded there, it is refused, when prepared and again when approved.
    stocked.add(location.recordId);
    expect(refusedWith(await retire(answered, location.recordId))).toBe('organisation.location-holds-stock');
    stocked.delete(location.recordId);
    const retirement = prepared(await retire(answered, location.recordId));
    stocked.add(location.recordId);
    expect(refusedWith(await answered.decide(retirement.requestId, retirement.versionId))).toBe(
      'organisation.location-holds-stock',
    );
    stocked.delete(location.recordId);
    decided(await answered.decide(retirement.requestId, retirement.versionId));
    const read = await answered.run(answered.preparer.id, (c) =>
      answered.organisation.record(c, 'location', location.recordId, answered.today()),
    );
    expect(read?.versions.map((each) => [each.state, each.retired])).toEqual([
      ['Scheduled', true],
      ['In force', false],
    ]);
  });

  it('structure-and-masters 3.6 PRD-ORG-013 a Store’s default warehouse is a warehouse unit, one in force on any date', async () => {
    const at = await site();
    const mapping = await entity(home.state.recordId);
    const shop = await store(at.recordId);
    const wholeStore = await approvedUnit(
      unitDraft(at.recordId, mapping, { kind: 'whole-store', storeId: shop.recordId }),
    );
    const first = await approvedUnit(unitDraft(at.recordId, mapping));
    const second = await approvedUnit(unitDraft(at.recordId, mapping, { kind: 'warehouse' }));
    const link = (warehouseUnitId: string, validFrom: string) =>
      setup.prepare((c, p) =>
        setup.organisation.prepareStoreDefaultWarehouseVersion(c, p, shop.recordId, { warehouseUnitId, validFrom }),
      );
    expect(refusedWith(await link(wholeStore.recordId, setup.today()))).toBe('organisation.not-a-warehouse');
    const now = prepared(await link(first.recordId, setup.today()));
    decided(await setup.decide(now.requestId, now.versionId));
    const later = prepared(await link(second.recordId, setup.day(7)));
    decided(await setup.decide(later.requestId, later.versionId));
    const warehouseOn = async (date: string) =>
      (await structureOn(date)).storeDefaultWarehouses.find((each) => each.id === shop.recordId)?.warehouseUnitId;
    expect(await warehouseOn(setup.today())).toBe(first.recordId);
    expect(await warehouseOn(setup.day(7))).toBe(second.recordId);
    // The database refuses a link to a unit that is not a warehouse, the owner included.
    const owner = await connect(world.organisations[0].database, 'migration');
    try {
      expect(
        await sqlState(
          owner.query(
            `insert into organisation.store_default_warehouse (id, store_id, warehouse_unit_id, valid_during, decision,
               prepared_by_user_id) values ($1, $2, $3, daterange(current_date + 9, null), 'Awaiting approval', $4)`,
            [uuidv7(), shop.recordId, wholeStore.recordId, setup.preparer.id],
          ),
        ),
      ).toBe('AO006');
    } finally {
      await owner.end();
    }
  });
});

describe('two Organisations (structure-and-masters 9 test 14)', () => {
  it('PRD-ORG-002 PRD-ACS-020 units, mappings, locations and default warehouses of one Organisation are not visible from the other', async () => {
    const at = await site();
    const mapping = await entity(home.state.recordId);
    const unit = await approvedUnit(unitDraft(at.recordId, mapping));
    await approved(setup, (c, p) =>
      setup.organisation.prepareLocation(c, p, locationDraft(at.recordId, unit.recordId)),
    );
    const seen = await structureOn(other.today(), other);
    expect(seen.businessUnits).toEqual([]);
    expect(seen.businessUnitMappings).toEqual([]);
    expect(seen.locations).toEqual([]);
    expect(seen.storeDefaultWarehouses).toEqual([]);
    expect(await mappingOn(unit.recordId, other.today(), other)).toMatchObject({ kind: 'refusal' });
    const read = await other.run(other.preparer.id, (c) =>
      other.organisation.record(c, 'business_unit', unit.recordId, other.today()),
    );
    expect(read).toBeUndefined();
  });
});

describe('review fixes (S1-F02-T02 review; product owner, 8 Oct 2026)', () => {
  /** An enrolled approver holding view and approve on the record types given only. */
  async function approverOf(label: string, recordTypes: readonly string[]) {
    const [orgA] = world.organisations;
    const user = await writeSyntheticUser(orgA.database, orgA.code, keys, { label: next(label), enrolled: true });
    await grantSynthetic(
      orgA.database,
      { kind: 'user', id: user.id },
      recordTypes.flatMap((recordType) => [
        { recordType, action: 'view' as const },
        { recordType, action: 'approve' as const },
      ]),
    );
    return user;
  }

  const unitVersion = (unitId: string, draft: Partial<Record<string, string>>) =>
    setup.prepare((c, p) =>
      setup.organisation.prepareBusinessUnitVersion(c, p, unitId, {
        name: syntheticName('Unit version'),
        validFrom: setup.day(1),
        ...draft,
      }),
    );

  it('structure-and-masters 3.4 PRD-ACS-006 approving a new unit with its first mapping needs approve on the unit and on the mapping', async () => {
    const at = await site();
    const mapping = await entity(home.state.recordId);
    const unitOnly = await approverOf('UNIT-ONLY', ['organisation.business_unit']);
    const answer = prepared(await prepareUnit(unitDraft(at.recordId, mapping)));
    expect(await setup.decide(answer.requestId, answer.versionId, 'approve', unitOnly)).toMatchObject({
      kind: 'refusal',
      refusal: {
        code: 'access.not-eligible',
        missing: [{ kind: 'permission', recordType: 'organisation.business_unit_mapping', action: 'approve' }],
      },
    });
    const both = await approverOf('BOTH', ['organisation.business_unit', 'organisation.business_unit_mapping']);
    decided(await setup.decide(answer.requestId, answer.versionId, 'approve', both));
    // A later unit version, which carries no mapping, needs only the unit's approve.
    const renamed = prepared(await unitVersion(answer.recordId, {}));
    decided(await setup.decide(renamed.requestId, renamed.versionId, 'approve', unitOnly));
  });

  it('structure-and-masters 3.4 a unit version never changes the mapping of a unit with approved versions; a partial mapping is refused', async () => {
    const at = await site();
    const mapping = await entity(home.state.recordId);
    const unit = await approvedUnit(unitDraft(at.recordId, mapping));
    expect(refusedWith(await unitVersion(unit.recordId, { ...mapping }))).toBe(
      'organisation.mapping-through-mapping-change',
    );
    expect(refusedWith(await unitVersion(unit.recordId, { legalEntityId: mapping.legalEntityId }))).toBe(
      'organisation.mapping-incomplete',
    );
    // A new unit's draft re-dated names all three or none, never some.
    const fresh = prepared(await prepareUnit(unitDraft(at.recordId, mapping)));
    expect(
      refusedWith(
        await unitVersion(fresh.recordId, {
          legalEntityId: mapping.legalEntityId,
          accountingBookId: mapping.accountingBookId,
        }),
      ),
    ).toBe('organisation.mapping-incomplete');
    decided(await setup.decide(fresh.requestId, fresh.versionId));
  });

  it('structure-and-masters 3.4 domain-model invariant 8 a unit version starting before the unit’s first mapping is refused', async () => {
    const at = await site();
    const mapping = await entity(home.state.recordId);
    const unit = await approvedUnit({ ...unitDraft(at.recordId, mapping), validFrom: setup.day(5) });
    const early = prepared(await unitVersion(unit.recordId, { validFrom: setup.day(2) }));
    expect(refusedWith(await setup.decide(early.requestId, early.versionId))).toBe('organisation.unit-without-mapping');
    // The database keeps it too, the owner included.
    const owner = await connect(world.organisations[0].database, 'migration');
    try {
      expect(
        await sqlState(
          owner.query(
            `insert into organisation.business_unit_version (id, business_unit_id, name, status, valid_during, decision,
               prepared_by_user_id) values ($1, $2, 'SYNTHETIC early', 'Setting up', daterange($3::date, $4::date),
               'Approved', $5)`,
            [uuidv7(), unit.recordId, setup.day(2), setup.day(5), setup.preparer.id],
          ),
        ),
      ).toBe('AO006');
    } finally {
      await owner.end();
    }
  });

  it('structure-and-masters 3.5 PRD-ORG-012 locations never nest in a cycle; one is not retired while a child is not', async () => {
    const at = await site(home.area.recordId, answered);
    const mapping = await entity(home.state.recordId, answered);
    const unit = await approvedUnit({ ...unitDraft(at.recordId, mapping), validFrom: answered.today() }, answered);
    const zone = (overrides: Partial<LocationDraft> = {}) =>
      approved(answered, (c, p) =>
        answered.organisation.prepareLocation(c, p, {
          ...locationDraft(at.recordId, unit.recordId, { kind: 'zone' }),
          validFrom: answered.today(),
          ...overrides,
        }),
      );
    const version = (locationId: string, draft: { parentLocationId?: string; retired?: boolean }) =>
      answered.prepare((c, p) =>
        answered.organisation.prepareLocationVersion(c, p, locationId, {
          name: syntheticName('Zone version'),
          kind: 'zone',
          retired: draft.retired ?? false,
          validFrom: answered.day(1),
          ...(draft.parentLocationId === undefined ? {} : { parentLocationId: draft.parentLocationId }),
        }),
      );
    const a = await zone();
    const b = await zone({ parentLocationId: a.recordId });
    const c = await zone({ parentLocationId: b.recordId });
    // A → B → A, and A → C → B → A, are refused when prepared.
    expect(refusedWith(await version(a.recordId, { parentLocationId: b.recordId }))).toBe(
      'organisation.location-nesting-cycle',
    );
    expect(refusedWith(await version(a.recordId, { parentLocationId: c.recordId }))).toBe(
      'organisation.location-nesting-cycle',
    );
    // Two drafts that close a cycle together: the second is refused when approved.
    const d = await zone();
    const e = await zone();
    const dUnderE = prepared(await version(d.recordId, { parentLocationId: e.recordId }));
    const eUnderD = prepared(await version(e.recordId, { parentLocationId: d.recordId }));
    decided(await answered.decide(dUnderE.requestId, dUnderE.versionId));
    expect(refusedWith(await answered.decide(eUnderD.requestId, eUnderD.versionId))).toBe(
      'organisation.location-nesting-cycle',
    );
    // A location with a child not retired is not retired, when prepared and when approved; once the child is, it is.
    expect(refusedWith(await version(b.recordId, { retired: true }))).toBe('organisation.location-has-children');
    const retireC = prepared(await version(c.recordId, { retired: true }));
    decided(await answered.decide(retireC.requestId, retireC.versionId));
    const retireB = prepared(await version(b.recordId, { retired: true }));
    const child = (parentLocationId: string) =>
      answered.prepare((cx, p) =>
        answered.organisation.prepareLocation(cx, p, {
          ...locationDraft(at.recordId, unit.recordId, { kind: 'bin', parentLocationId }),
          validFrom: answered.today(),
        }),
      );
    const lateChild = prepared(await child(b.recordId));
    decided(await answered.decide(lateChild.requestId, lateChild.versionId));
    expect(refusedWith(await answered.decide(retireB.requestId, retireB.versionId))).toBe(
      'organisation.location-has-children',
    );
    // A new child of a location retired on a day the child would be in force is refused, when prepared and approved.
    const f = await zone();
    const retireF = prepared(await version(f.recordId, { retired: true }));
    const orphan = prepared(await child(f.recordId));
    decided(await answered.decide(retireF.requestId, retireF.versionId));
    expect(refusedWith(await child(f.recordId))).toBe('organisation.location-parent-retired');
    expect(refusedWith(await answered.decide(orphan.requestId, orphan.versionId))).toBe(
      'organisation.location-parent-retired',
    );
    // The database refuses a cycle, the owner included.
    const owner = await connect(world.organisations[0].database, 'migration');
    try {
      await owner.query('begin');
      await owner.query(
        `update organisation.location_version set valid_during = daterange(lower(valid_during), $2::date)
         where location_id = $1 and decision = 'Approved'`,
        [e.recordId, answered.day(9)],
      );
      await owner.query(
        `insert into organisation.location_version (id, location_id, name, kind, parent_location_id, retired,
           valid_during, decision, prepared_by_user_id)
         values ($1, $2, 'SYNTHETIC cycle', 'zone', $3, false, daterange($4::date, null), 'Approved', $5)`,
        [uuidv7(), e.recordId, d.recordId, answered.day(9), answered.preparer.id],
      );
      expect(await sqlState(owner.query('commit'))).toBe('AO006');
    } finally {
      await owner.end();
    }
  });
});

describe('location codes (structure-and-masters 3.1, 6.1; domain-model)', () => {
  it('structure-and-masters 2.1 PRD-ORG-012 a location code is unique at its Site: taken at the same Site, free at another', async () => {
    const first = await site();
    const second = await site();
    const mapping = await entity(home.state.recordId);
    const here = await approvedUnit(unitDraft(first.recordId, mapping));
    const there = await approvedUnit(unitDraft(second.recordId, mapping));
    const code = syntheticCode(next('SHARED-LOC'));
    const at = (siteId: string, unitId: string) =>
      setup.prepare((c, p) => setup.organisation.prepareLocation(c, p, { ...locationDraft(siteId, unitId), code }));
    prepared(await at(first.recordId, here.recordId));
    expect(refusedWith(await at(first.recordId, here.recordId))).toBe('organisation.code-taken');
    prepared(await at(second.recordId, there.recordId));
  });
});
