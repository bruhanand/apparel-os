import { uuidv7 } from '@apparel-os/domain';
import { taxRegistrationVersionDraftSchema, type SiteDraft, type StoreDraft } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PreparedVersion } from '../src/modules/organisation/index.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { syntheticKeysEnvironment } from './support/access.js';
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

// S1-F02-T01: legal entities, tax registrations, books, geography, Sites, Stores and groupings through the organisation
// module's interface and access's Decide, on real PostgreSQL (structure-and-masters 2, 3.1 to 3.3, 3.6 to 3.8, 9
// tests 4, 14 and 16, 19; code-house-rules 7.3). Every value here is SYNTHETIC.

let world: SyntheticWorld;
let setup: StructureSetup;
let other: StructureSetup;
let geography: Awaited<ReturnType<typeof approvedGeography>>;
let counter = 0;

/** A fresh synthetic code part. */
const next = (prefix: string) => `${prefix}-${String(++counter)}`;

beforeAll(async () => {
  world = await createSyntheticOrganisations('structure');
  const keysEnvironment = syntheticKeysEnvironment(world);
  const [orgA, orgB] = world.organisations;
  setup = await structureSetup({
    directory: world.directory,
    database: orgA.database,
    organisationCode: orgA.code,
    keysEnvironment,
    label: 'STRUCTURE-A',
  });
  other = await structureSetup({
    directory: world.directory,
    database: orgB.database,
    organisationCode: orgB.code,
    keysEnvironment,
    label: 'STRUCTURE-B',
  });
  geography = await approvedGeography(setup, 'GEO');
});

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (other as StructureSetup | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

function siteDraft(overrides: Partial<SiteDraft> = {}): SiteDraft {
  const code = next('SITE');
  return {
    code: syntheticCode(code),
    name: syntheticName(`Site ${code}`),
    physicalKind: 'retail-site',
    areaId: geography.area.recordId,
    addresses: [syntheticName(`Address of ${code}`)],
    aliases: [],
    validFrom: setup.today(),
    ...overrides,
  };
}

function storeDraft(siteId: string, overrides: Partial<StoreDraft> = {}): StoreDraft {
  const code = next('STORE');
  return {
    code: syntheticCode(code),
    name: syntheticName(`Store ${code}`),
    format: 'ebo',
    operatingModel: 'company-owned',
    siteId,
    aliases: [],
    validFrom: setup.today(),
    ...overrides,
  };
}

const approvedSite = (overrides: Partial<SiteDraft> = {}) =>
  approved(setup, (c, p) => setup.organisation.prepareSite(c, p, siteDraft(overrides)));

const approvedLegalEntity = () =>
  approved(setup, (c, p) =>
    setup.organisation.prepareLegalEntity(c, p, {
      code: syntheticCode(next('LE')),
      legalName: syntheticName('Legal entity'),
      validFrom: setup.today(),
    }),
  );

function structureOn(date: string, on: StructureSetup = setup) {
  return on.run(on.preparer.id, (c) => on.organisation.structureOn(c, on.today(), date));
}

function listOf<K extends Parameters<StructureSetup['organisation']['list']>[1]>(kind: K, on: StructureSetup = setup) {
  return on.run(on.preparer.id, (c) => on.organisation.list(c, kind, on.today()));
}

describe('a master is prepared and then approved by a different authorised person (structure-and-masters 2.3)', () => {
  it('PRD-ORG-003 PRD-ORG-008 a new Site starts Setting up and is in force once approved, with its history', async () => {
    const draft = siteDraft({ aliases: [syntheticName('Old site name')], openingDate: setup.day(10) });
    const site = prepared(await setup.prepare((c, p) => setup.organisation.prepareSite(c, p, draft)));
    let record = (await listOf('site')).records.find((each) => each.id === site.recordId);
    expect(record?.code).toBe(draft.code);
    expect(record?.versions).toEqual([
      expect.objectContaining({
        id: site.versionId,
        state: 'Awaiting approval',
        status: 'Setting up',
        validFrom: setup.today(),
        aliases: [syntheticName('Old site name')],
        openingDate: setup.day(10),
        request: { id: site.requestId, state: 'Awaiting approval' },
      }),
    ]);
    expect(record?.versions[0]?.closingDate).toBeUndefined();
    // Not yet in force: it awaits approval (2.2).
    expect((await structureOn(setup.today())).sites.map((each) => each.id)).not.toContain(site.recordId);
    // My work offers it to the approver, not to its preparer (access-and-approvals 11.2).
    expect(
      await setup.run(setup.approver.id, (c) => setup.access.eligibleRequests(c, setup.approver.id, [site.requestId])),
    ).toEqual([site.requestId]);
    decided(await setup.decide(site.requestId, site.versionId));
    record = (await listOf('site')).records.find((each) => each.id === site.recordId);
    expect(record?.versions[0]).toMatchObject({ state: 'In force', status: 'Setting up' });
    expect((await structureOn(setup.today())).sites).toContainEqual(
      expect.objectContaining({ id: site.recordId, versionId: site.versionId, name: draft.name, status: 'Setting up' }),
    );
    // The version takes effect with its audit record and organisation.structure-changed in the decision's transaction.
    const owner = await connect(world.organisations[0].database, 'migration');
    try {
      const events = await owner.query(
        `select count(*)::int as n from kernel.outbox_event
         where event_type = 'organisation.structure-changed' and subject_record_id = $1`,
        [site.recordId],
      );
      expect(events.rows).toEqual([{ n: 1 }]);
      const audits = await owner.query(
        `select operation from audit.audit_record where record_module = 'organisation' and record_id = $1
         order by recorded_at, id`,
        [site.recordId],
      );
      expect(audits.rows.map((row: { operation: string }) => row.operation)).toEqual([
        'prepare-site',
        'approve-site-version',
      ]);
    } finally {
      await owner.end();
    }
  });

  it('structure-and-masters 9 test 16 PRD-ACS-006 a change to any of these records approved by its preparer is refused', async () => {
    // The preparer holds approve too, through another assignment, so only independence refuses it (GC2-2, DEC-105).
    await grantSynthetic(
      world.organisations[0].database,
      { kind: 'user', id: setup.preparer.id },
      [
        'organisation.country',
        'organisation.state',
        'organisation.city',
        'organisation.area',
        'organisation.legal_entity',
        'organisation.tax_registration',
        'organisation.accounting_book',
        'organisation.site',
        'organisation.store',
        'organisation.grouping',
      ].map((recordType) => ({ recordType, action: 'approve' as const })),
    );
    const today = setup.today();
    const legalEntity = await approvedLegalEntity();
    const site = await approvedSite();
    const store = await approved(setup, (c, p) => setup.organisation.prepareStore(c, p, storeDraft(site.recordId)));
    const name = syntheticName('Changed');
    const changes: ((
      ...args: Parameters<Parameters<StructureSetup['prepare']>[0]>
    ) => ReturnType<Parameters<StructureSetup['prepare']>[0]>)[] = [
      (c, p) => setup.organisation.prepareCountry(c, p, { code: syntheticCode(next('C')), name, validFrom: today }),
      (c, p) =>
        setup.organisation.prepareState(c, p, {
          countryId: geography.country.recordId,
          code: syntheticCode(next('S')),
          name,
          validFrom: today,
        }),
      (c, p) =>
        setup.organisation.prepareCity(c, p, {
          stateId: geography.state.recordId,
          code: syntheticCode(next('CI')),
          name,
          validFrom: today,
        }),
      (c, p) =>
        setup.organisation.prepareArea(c, p, {
          cityId: geography.city.recordId,
          code: syntheticCode(next('AR')),
          name,
          validFrom: today,
        }),
      (c, p) =>
        setup.organisation.prepareLegalEntityVersion(c, p, legalEntity.recordId, {
          legalName: name,
          validFrom: setup.day(1),
        }),
      (c, p) =>
        setup.organisation.prepareTaxRegistration(c, p, {
          code: syntheticCode(next('GST')),
          legalEntityId: legalEntity.recordId,
          registrationNumber: '0012345',
          stateId: geography.state.recordId,
          validityFrom: today,
          validFrom: today,
        }),
      (c, p) =>
        setup.organisation.prepareAccountingBook(c, p, {
          code: syntheticCode(next('BOOK')),
          legalEntityId: legalEntity.recordId,
          name,
          validFrom: today,
        }),
      (c, p) => setup.organisation.prepareSiteVersion(c, p, site.recordId, { ...siteDraft(), validFrom: setup.day(1) }),
      (c, p) =>
        setup.organisation.prepareStoreVersion(c, p, store.recordId, {
          ...storeDraft(site.recordId),
          validFrom: setup.day(1),
        }),
      (c, p) =>
        setup.organisation.prepareGrouping(c, p, {
          code: syntheticCode(next('REGION')),
          kind: 'region',
          name,
          storeIds: [store.recordId],
          validFrom: today,
        }),
    ];
    for (const change of changes) {
      const answer = prepared(await setup.prepare(change));
      const outcome = await setup.decide(answer.requestId, answer.versionId, 'approve', setup.preparer);
      expect(outcome).toMatchObject({ kind: 'refusal', refusal: { code: 'access.self-preparation' } });
      // A different authorised person may approve it.
      decided(await setup.decide(answer.requestId, answer.versionId));
    }
  });

  it('a rejected version never takes effect', async () => {
    const site = prepared(await setup.prepare((c, p) => setup.organisation.prepareSite(c, p, siteDraft())));
    decided(await setup.decide(site.requestId, site.versionId, 'reject'));
    const record = (await listOf('site')).records.find((each) => each.id === site.recordId);
    expect(record?.versions[0]?.state).toBe('Rejected');
    expect((await structureOn(setup.today())).sites.map((each) => each.id)).not.toContain(site.recordId);
  });

  it('PRD-MOD-008 structure-and-masters 2.1 a code is unique in its scope, kept exactly, and never reused', async () => {
    const code = syntheticCode(next('LEAD'));
    const first = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareLegalEntity(c, p, {
          code,
          legalName: syntheticName('First'),
          validFrom: setup.today(),
        }),
      ),
    );
    // Even a rejected record keeps its code for good.
    decided(await setup.decide(first.requestId, first.versionId, 'reject'));
    expect(
      await setup.prepare((c, p) =>
        setup.organisation.prepareLegalEntity(c, p, {
          code,
          legalName: syntheticName('Second'),
          validFrom: setup.today(),
        }),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'organisation.code-taken' } });
    // A code with leading zeros is another code.
    const padded = `00${code}`;
    expect(
      await setup.prepare((c, p) =>
        setup.organisation.prepareLegalEntity(c, p, {
          code: padded,
          legalName: syntheticName('Padded'),
          validFrom: setup.today(),
        }),
      ),
    ).toMatchObject({ kind: 'success' });
    // A State's code is unique in its country only.
    const stateCode = syntheticCode(next('SAME'));
    const otherCountry = await approved(setup, (c, p) =>
      setup.organisation.prepareCountry(c, p, {
        code: syntheticCode(next('CO')),
        name: syntheticName('Other country'),
        validFrom: setup.today(),
      }),
    );
    for (const countryId of [geography.country.recordId, otherCountry.recordId]) {
      expect(
        await setup.prepare((c, p) =>
          setup.organisation.prepareState(c, p, {
            countryId,
            code: stateCode,
            name: syntheticName('S'),
            validFrom: setup.today(),
          }),
        ),
      ).toMatchObject({ kind: 'success' });
    }
  });
});

describe('effective-dated versions (structure-and-masters 2.2; code-house-rules 7.3)', () => {
  it('structure-and-masters 9 test 19 PRD-MOD-010 a version that starts on a past date is refused, when prepared and when approved', async () => {
    expect(
      await setup.prepare((c, p) => setup.organisation.prepareSite(c, p, siteDraft({ validFrom: setup.day(-1) }))),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'organisation.starts-in-past' } });
    const site = prepared(await setup.prepare((c, p) => setup.organisation.prepareSite(c, p, siteDraft())));
    // The draft's start passes before it is approved: it is prepared again from today or later (2.2).
    // The clock never goes back: a fresh authenticator code is always of a later step (access-and-approvals 3.3).
    setup.advanceDays(1);
    expect(await setup.decide(site.requestId, site.versionId)).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'organisation.starts-in-past' },
    });
  });

  it('PRD-MOD-010 a new version ends the one before it on its start; one overlapping an approved version, a Scheduled one included, is refused', async () => {
    const legalEntity = await approvedLegalEntity();
    const version = (validFrom: string) =>
      setup.prepare((c, p) =>
        setup.organisation.prepareLegalEntityVersion(c, p, legalEntity.recordId, {
          legalName: syntheticName(`From ${validFrom}`),
          validFrom,
        }),
      );
    const scheduled = prepared(await version(setup.day(5)));
    decided(await setup.decide(scheduled.requestId, scheduled.versionId));
    let versions = (await listOf('legal_entity')).records.find((each) => each.id === legalEntity.recordId)?.versions;
    expect(versions?.map((each) => [each.state, each.validFrom, each.validTo])).toEqual([
      ['Scheduled', setup.day(5), undefined],
      ['In force', setup.today(), setup.day(5)],
    ]);
    // Starting before the Scheduled version and open-ended, it would overlap it.
    const before = prepared(await version(setup.day(2)));
    expect(await setup.decide(before.requestId, before.versionId)).toMatchObject({
      kind: 'refusal',
      refusal: {
        code: 'organisation.version-overlaps',
        missing: [{ kind: 'version', recordId: legalEntity.recordId, versionId: scheduled.versionId }],
      },
    });
    const same = prepared(await version(setup.day(5)));
    expect(await setup.decide(same.requestId, same.versionId)).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'organisation.version-overlaps' },
    });
    // After the Scheduled one, it ends that one on its start.
    const later = prepared(await version(setup.day(8)));
    decided(await setup.decide(later.requestId, later.versionId));
    versions = (await listOf('legal_entity')).records.find((each) => each.id === legalEntity.recordId)?.versions;
    expect(versions?.find((each) => each.id === scheduled.versionId)?.validTo).toBe(setup.day(8));
    // The database refuses two approved versions that overlap, whatever the command does.
    const owner = await connect(world.organisations[0].database, 'migration');
    try {
      expect(
        await sqlState(
          owner.query(
            `insert into organisation.legal_entity_version
               (id, legal_entity_id, legal_name, valid_during, decision, prepared_by_user_id)
             values ($1, $2, 'SYNTHETIC overlap', daterange($3::date, null), 'Approved', $4)`,
            [uuidv7(), legalEntity.recordId, setup.day(6), setup.preparer.id],
          ),
        ),
      ).toBe('23P01');
      // A version in force is never edited (2.2).
      expect(
        await sqlState(
          owner.query(`update organisation.legal_entity_version set legal_name = 'SYNTHETIC edited' where id = $1`, [
            legalEntity.versionId,
          ]),
        ),
      ).toBe('AO003');
    } finally {
      await owner.end();
    }
  });

  it('a version is approved only while every record it names is in force on its start', async () => {
    const site = prepared(await setup.prepare((c, p) => setup.organisation.prepareSite(c, p, siteDraft())));
    const store = prepared(
      await setup.prepare((c, p) => setup.organisation.prepareStore(c, p, storeDraft(site.recordId))),
    );
    expect(await setup.decide(store.requestId, store.versionId)).toMatchObject({
      kind: 'refusal',
      refusal: {
        code: 'organisation.reference-not-in-force',
        missing: [{ kind: 'approval', recordType: 'organisation.site', recordId: site.recordId }],
      },
    });
    decided(await setup.decide(site.requestId, site.versionId));
    decided(await setup.decide(store.requestId, store.versionId));
  });

  it('a record named in a change must exist', async () => {
    const missing = uuidv7();
    expect(
      await setup.prepare((c, p) => setup.organisation.prepareSite(c, p, siteDraft({ areaId: missing }))),
    ).toMatchObject({
      kind: 'refusal',
      refusal: {
        code: 'organisation.record-not-found',
        missing: [{ kind: 'record', recordType: 'organisation.area', recordId: missing }],
      },
    });
    expect(
      await setup.prepare((c, p) =>
        setup.organisation.prepareNameVersion(c, p, 'country', missing, {
          name: syntheticName('X'),
          validFrom: setup.today(),
        }),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'organisation.record-not-found' } });
  });
});

describe('legal entities, registrations and books (structure-and-masters 3.2)', () => {
  it('PRD-ORG-020 POL-10.06 a registration and a book are fixed to their legal entity and never move to another', async () => {
    const legalEntity = await approvedLegalEntity();
    const registration = await approved(setup, (c, p) =>
      setup.organisation.prepareTaxRegistration(c, p, {
        code: syntheticCode(next('GSTIN')),
        legalEntityId: legalEntity.recordId,
        registrationNumber: '0007SYNTHETIC',
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
    const structure = await structureOn(setup.today());
    // The number is kept as text, leading zeros and all; the State and validity with it.
    expect(structure.taxRegistrations).toContainEqual(
      expect.objectContaining({
        id: registration.recordId,
        legalEntityId: legalEntity.recordId,
        registrationNumber: '0007SYNTHETIC',
        stateId: geography.state.recordId,
        validityFrom: setup.today(),
      }),
    );
    expect(structure.accountingBooks).toContainEqual(
      expect.objectContaining({ id: book.recordId, legalEntityId: legalEntity.recordId }),
    );
    // A later version cannot name another legal entity: the field is not in it (3.2).
    expect(
      taxRegistrationVersionDraftSchema.safeParse({
        legalEntityId: uuidv7(),
        registrationNumber: '1',
        stateId: geography.state.recordId,
        validityFrom: setup.today(),
        validFrom: setup.today(),
      }).success,
    ).toBe(false);
    // And the database refuses the change, the owner included.
    const owner = await connect(world.organisations[0].database, 'migration');
    try {
      const otherEntity = await approvedLegalEntity();
      for (const table of ['tax_registration', 'accounting_book']) {
        expect(
          await sqlState(
            owner.query(`update organisation.${table} set legal_entity_id = $1 where id = $2`, [
              otherEntity.recordId,
              table === 'tax_registration' ? registration.recordId : book.recordId,
            ]),
          ),
        ).toBe('AO001');
      }
    } finally {
      await owner.end();
    }
  });
});

describe('Stores at Sites (structure-and-masters 3.3, 3.8)', () => {
  it('structure-and-masters 9 test 4 PRD-ORG-021 two Stores at one Site; a Scheduled Site link reads before and after its date', async () => {
    const first = await approvedSite();
    const second = await approvedSite({ physicalKind: 'retail-site' });
    const storeA = await approved(setup, (c, p) => setup.organisation.prepareStore(c, p, storeDraft(first.recordId)));
    const draftB = storeDraft(first.recordId, { format: 'shop-in-shop', operatingModel: 'franchise-owned' });
    const storeB = await approved(setup, (c, p) => setup.organisation.prepareStore(c, p, draftB));
    // A later version of Store B links it to the second Site from a future date: Scheduled until then.
    const moveOn = setup.day(3);
    const link = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareStoreVersion(c, p, storeB.recordId, {
          ...draftB,
          siteId: second.recordId,
          validFrom: moveOn,
        }),
      ),
    );
    decided(await setup.decide(link.requestId, link.versionId));
    const versions = (await listOf('store')).records.find((each) => each.id === storeB.recordId)?.versions;
    expect(versions?.map((each) => [each.state, each.siteId])).toEqual([
      ['Scheduled', second.recordId],
      ['In force', first.recordId],
    ]);
    const siteOf = async (date: string, storeId: string) =>
      (await structureOn(date)).stores.find((each) => each.id === storeId)?.siteId;
    // Before its date both Stores are at the first Site; from it, Store B is at the second.
    expect(await siteOf(setup.today(), storeA.recordId)).toBe(first.recordId);
    expect(await siteOf(setup.today(), storeB.recordId)).toBe(first.recordId);
    expect(await siteOf(setup.day(2), storeB.recordId)).toBe(first.recordId);
    expect(await siteOf(moveOn, storeB.recordId)).toBe(second.recordId);
    expect(await siteOf(moveOn, storeA.recordId)).toBe(first.recordId);
    // The Store keeps its code, name and status across the link; it starts Setting up (3.7).
    expect((await structureOn(moveOn)).stores.find((each) => each.id === storeB.recordId)).toMatchObject({
      code: draftB.code,
      name: draftB.name,
      status: 'Setting up',
    });
  });

  it('PRD-ORG-007 a grouping lists Stores, dated by its versions', async () => {
    const site = await approvedSite();
    const store = await approved(setup, (c, p) => setup.organisation.prepareStore(c, p, storeDraft(site.recordId)));
    const region = await approved(setup, (c, p) =>
      setup.organisation.prepareGrouping(c, p, {
        code: syntheticCode(next('RG')),
        kind: 'region',
        name: syntheticName('Region'),
        storeIds: [],
        validFrom: setup.today(),
      }),
    );
    const joined = await approved(setup, (c, p) =>
      setup.organisation.prepareGroupingVersion(c, p, region.recordId, {
        name: syntheticName('Region'),
        storeIds: [store.recordId],
        validFrom: setup.day(4),
      }),
    );
    const membersOn = async (date: string) =>
      (await structureOn(date)).groupings.find((each) => each.id === region.recordId)?.storeIds;
    expect(await membersOn(setup.today())).toEqual([]);
    expect(await membersOn(setup.day(4))).toEqual([store.recordId]);
    expect(joined.recordId).toBe(region.recordId);
  });
});

describe('two Organisations (structure-and-masters 9 test 14)', () => {
  it('PRD-ORG-002 PRD-ACS-020 nothing of one Organisation is visible from the other', async () => {
    const site: PreparedVersion = await approvedSite();
    const otherSites = (await listOf('site', other)).records.map((each) => each.id);
    expect(otherSites).not.toContain(site.recordId);
    expect((await structureOn(other.today(), other)).sites).toEqual([]);
    expect((await listOf('area', other)).records).toEqual([]);
    // The other Organisation's own records stay its own.
    const otherGeography = await approvedGeography(other, 'GEO-B');
    expect((await listOf('area', other)).records.map((each) => each.id)).toEqual([otherGeography.area.recordId]);
    expect((await listOf('area')).records.map((each) => each.id)).not.toContain(otherGeography.area.recordId);
  });
});
