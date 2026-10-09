import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidv7 } from '@apparel-os/domain';
import type { SiteDraft, StoreDraft } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDatabase, migrationSetFolder } from '../src/kernel/index.js';
import type { MasterKind } from '../src/modules/organisation/index.js';
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
import { connect, createEmptyDatabase, databaseUrl, dropDatabase } from './support/postgres.js';

// S1-F02-T04: classification kinds and values of Sites and Stores, and grouping kinds, as the Organisation's own
// records (RR-440, product owner 9 Oct 2026; structure-and-masters 3.1, 3.6, 6.1; PRD-ORG-007, PRD-ORG-008), each
// changed through flow A by a different authorised person (2.3; GC2-2, DEC-105). No kind or value is set in code, a
// migration or a seed: every kind, value and grouping here is SYNTHETIC.

let world: SyntheticWorld;
let setup: StructureSetup;
let fresh: StructureSetup;
let geography: Awaited<ReturnType<typeof approvedGeography>>;
let counter = 0;

const next = (prefix: string) => `${prefix}-${String(++counter)}`;

beforeAll(async () => {
  world = await createSyntheticOrganisations('classify');
  const keysEnvironment = syntheticKeysEnvironment(world);
  const [orgA, orgB] = world.organisations;
  setup = await structureSetup({
    directory: world.directory,
    database: orgA.database,
    organisationCode: orgA.code,
    keysEnvironment,
    label: 'CLASSIFY-A',
  });
  fresh = await structureSetup({
    directory: world.directory,
    database: orgB.database,
    organisationCode: orgB.code,
    keysEnvironment,
    label: 'CLASSIFY-B',
  });
  geography = await approvedGeography(setup, 'CLS');
});

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (fresh as StructureSetup | undefined)?.close();
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

const classificationKind = (appliesTo: 'site' | 'store', on: StructureSetup = setup) =>
  approved(on, (c, p) =>
    on.organisation.prepareClassificationKind(c, p, {
      code: syntheticCode(next('CK')),
      appliesTo,
      name: syntheticName(`Classification kind ${String(counter)}`),
      validFrom: on.today(),
    }),
  );

const classificationValue = (kindId: string) =>
  approved(setup, (c, p) =>
    setup.organisation.prepareClassificationValue(c, p, {
      classificationKindId: kindId,
      code: syntheticCode(next('CV')),
      name: syntheticName(`Classification value ${String(counter)}`),
      validFrom: setup.today(),
    }),
  );

function structureOn(date: string, on: StructureSetup = setup) {
  return on.run(on.preparer.id, (c) => on.organisation.structureOn(c, date));
}

function listOf<K extends MasterKind>(kind: K, on: StructureSetup = setup) {
  return on.run(on.preparer.id, (c) => on.organisation.list(c, kind, on.today(), {}));
}

describe('classification kinds and values, and grouping kinds, are the Organisation’s own (RR-440)', () => {
  it('PRD-ORG-008 PRD-ORG-007 a Site kind with two values and a new grouping kind, each approved by another person; a Site and a Store carry a classification and a Store joins a grouping of the new kind', async () => {
    // A Site classification kind with two values, each prepared and then approved by a different person (2.3).
    const siteKind = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareClassificationKind(c, p, {
          code: syntheticCode(next('SITE-LABEL')),
          appliesTo: 'site',
          name: syntheticName('Site label'),
          validFrom: setup.today(),
        }),
      ),
    );
    const selfApproved = await setup.decide(siteKind.requestId, siteKind.versionId, 'approve', setup.preparer);
    expect(selfApproved).toMatchObject({ kind: 'refusal' });
    decided(await setup.decide(siteKind.requestId, siteKind.versionId));
    const [first, second] = [
      await classificationValue(siteKind.recordId),
      await classificationValue(siteKind.recordId),
    ];
    const storeKind = await classificationKind('store');
    const storeValue = await classificationValue(storeKind.recordId);
    // A grouping kind other than region and cluster (PRD-ORG-007).
    const groupingKind = await approved(setup, (c, p) =>
      setup.organisation.prepareGroupingKind(c, p, {
        code: syntheticCode(next('FORMAT-GROUP')),
        name: syntheticName('Format group'),
        validFrom: setup.today(),
      }),
    );

    const site = await approved(setup, (c, p) =>
      setup.organisation.prepareSite(c, p, siteDraft({ classificationValueIds: [first.recordId] })),
    );
    const store = await approved(setup, (c, p) =>
      setup.organisation.prepareStore(
        c,
        p,
        storeDraft(site.recordId, { classificationValueIds: [storeValue.recordId] }),
      ),
    );
    const grouping = await approved(setup, (c, p) =>
      setup.organisation.prepareGrouping(c, p, {
        code: syntheticCode(next('GROUP')),
        groupingKindId: groupingKind.recordId,
        name: syntheticName('Grouping of the new kind'),
        storeIds: [store.recordId],
        validFrom: setup.today(),
      }),
    );
    // A later Site version from tomorrow takes the second value instead (2.2).
    await approved(setup, (c, p) =>
      setup.organisation.prepareSiteVersion(c, p, site.recordId, {
        ...siteDraft({ classificationValueIds: [second.recordId] }),
        validFrom: setup.day(1),
      }),
    );

    // The master lists show them as of a date (structure-and-masters 3.8, 8).
    const today = await structureOn(setup.today());
    expect(today.classificationKinds.map((each) => each.id)).toEqual(
      expect.arrayContaining([siteKind.recordId, storeKind.recordId]),
    );
    expect(today.classificationKinds.find((each) => each.id === siteKind.recordId)).toMatchObject({
      appliesTo: 'site',
      name: syntheticName('Site label'),
    });
    expect(today.classificationValues.filter((each) => each.classificationKindId === siteKind.recordId)).toHaveLength(
      2,
    );
    expect(today.sites.find((each) => each.id === site.recordId)?.classificationValueIds).toEqual([first.recordId]);
    expect(today.stores.find((each) => each.id === store.recordId)?.classificationValueIds).toEqual([
      storeValue.recordId,
    ]);
    expect(today.groupingKinds.map((each) => each.id)).toContain(groupingKind.recordId);
    expect(today.groupings.find((each) => each.id === grouping.recordId)).toMatchObject({
      groupingKindId: groupingKind.recordId,
      storeIds: [store.recordId],
    });
    const tomorrow = await structureOn(setup.day(1));
    expect(tomorrow.sites.find((each) => each.id === site.recordId)?.classificationValueIds).toEqual([second.recordId]);

    // Each list carries its versions (structure-and-masters 8).
    const values = await listOf('classification_value');
    expect(values.records.find((each) => each.id === first.recordId)).toMatchObject({
      classificationKindId: siteKind.recordId,
      appliesTo: 'site',
      versions: [expect.objectContaining({ state: 'In force' })],
    });
  });

  it('PRD-ORG-008 a value of a Store kind is refused on a Site, and a value of a kind not yet in force is refused when approved', async () => {
    const storeKind = await classificationKind('store');
    const storeValue = await classificationValue(storeKind.recordId);
    const refused = await setup.prepare((c, p) =>
      setup.organisation.prepareSite(c, p, siteDraft({ classificationValueIds: [storeValue.recordId] })),
    );
    expect(refused).toMatchObject({
      kind: 'refusal',
      refusal: {
        code: 'organisation.classification-of-another-kind',
        missing: [{ kind: 'record', recordType: 'organisation.classification_value', recordId: storeValue.recordId }],
      },
    });

    // A value whose kind awaits approval is refused when approved (6.1 "reference-not-in-force").
    const pendingKind = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareClassificationKind(c, p, {
          code: syntheticCode(next('PENDING')),
          appliesTo: 'site',
          name: syntheticName('Pending kind'),
          validFrom: setup.today(),
        }),
      ),
    );
    const value = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareClassificationValue(c, p, {
          classificationKindId: pendingKind.recordId,
          code: syntheticCode(next('CV')),
          name: syntheticName('Value of a pending kind'),
          validFrom: setup.today(),
        }),
      ),
    );
    expect(await setup.decide(value.requestId, value.versionId)).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'organisation.reference-not-in-force' },
    });
  });

  it('PRD-ORG-008 a Site or Store version holds at most one value of each kind, refused naming the kind, and the database holds it too (product owner, 9 Oct 2026)', async () => {
    const siteKind = await classificationKind('site');
    const [one, two] = [await classificationValue(siteKind.recordId), await classificationValue(siteKind.recordId)];
    const otherKind = await classificationKind('site');
    const other = await classificationValue(otherKind.recordId);
    const twice = {
      kind: 'refusal',
      refusal: {
        code: 'organisation.classification-kind-twice',
        missing: [{ kind: 'record', recordType: 'organisation.classification_kind', recordId: siteKind.recordId }],
      },
    };
    expect(
      await setup.prepare((c, p) =>
        setup.organisation.prepareSite(c, p, siteDraft({ classificationValueIds: [one.recordId, two.recordId] })),
      ),
    ).toMatchObject(twice);
    // One value of each of two kinds is a Site's classification.
    const site = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareSite(c, p, siteDraft({ classificationValueIds: [one.recordId, other.recordId] })),
      ),
    );
    const storeKind = await classificationKind('store');
    const [first, second] = [
      await classificationValue(storeKind.recordId),
      await classificationValue(storeKind.recordId),
    ];
    const storeSite = await approved(setup, (c, p) => setup.organisation.prepareSite(c, p, siteDraft()));
    expect(
      await setup.prepare((c, p) =>
        setup.organisation.prepareStore(
          c,
          p,
          storeDraft(storeSite.recordId, { classificationValueIds: [first.recordId, second.recordId] }),
        ),
      ),
    ).toMatchObject({
      kind: 'refusal',
      refusal: {
        code: 'organisation.classification-kind-twice',
        missing: [{ kind: 'record', recordType: 'organisation.classification_kind', recordId: storeKind.recordId }],
      },
    });

    // Behind the service, the database refuses a second value of one kind on a version (migration 0044).
    const owner = await connect(world.organisations[0].database, 'migration');
    try {
      await expect(
        owner.query(
          `insert into organisation.site_classification
             (id, site_version_id, classification_value_id, classification_kind_id, applies_to)
           values ($1, $2, $3, $4, 'site')`,
          [uuidv7(), site.versionId, two.recordId, siteKind.recordId],
        ),
      ).rejects.toThrow(/site_classification_one_per_kind/);
      // A value named with a kind it is not of is refused by the foreign key.
      await expect(
        owner.query(
          `insert into organisation.site_classification
             (id, site_version_id, classification_value_id, classification_kind_id, applies_to)
           values ($1, $2, $3, $4, 'site')`,
          [uuidv7(), site.versionId, two.recordId, storeKind.recordId],
        ),
      ).rejects.toThrow(/foreign key/);
    } finally {
      await owner.end();
    }
  });

  it('structure-and-masters 2.1 a value’s code is unique in its kind, and the same code may serve another kind', async () => {
    const [one, two] = [await classificationKind('site'), await classificationKind('site')];
    const code = syntheticCode(next('SHARED'));
    const draft = (kindId: string) => ({
      classificationKindId: kindId,
      code,
      name: syntheticName('Shared code'),
      validFrom: setup.today(),
    });
    prepared(await setup.prepare((c, p) => setup.organisation.prepareClassificationValue(c, p, draft(one.recordId))));
    prepared(await setup.prepare((c, p) => setup.organisation.prepareClassificationValue(c, p, draft(two.recordId))));
    expect(
      await setup.prepare((c, p) => setup.organisation.prepareClassificationValue(c, p, draft(one.recordId))),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'organisation.code-taken' } });
  });

  it('structure-and-masters 9 test 16 a kind, a value or a grouping kind approved by its preparer is refused', async () => {
    await grantSynthetic(
      world.organisations[0].database,
      { kind: 'user', id: setup.preparer.id },
      ['organisation.classification_kind', 'organisation.classification_value', 'organisation.grouping_kind'].map(
        (recordType) => ({ recordType, action: 'approve' as const }),
      ),
    );
    const kind = await classificationKind('store');
    const changes = [
      prepared(
        await setup.prepare((c, p) =>
          setup.organisation.prepareNameVersion(c, p, 'classification_kind', kind.recordId, {
            name: syntheticName('Renamed kind'),
            validFrom: setup.day(1),
          }),
        ),
      ),
      prepared(
        await setup.prepare((c, p) =>
          setup.organisation.prepareClassificationValue(c, p, {
            classificationKindId: kind.recordId,
            code: syntheticCode(next('CV')),
            name: syntheticName('Value'),
            validFrom: setup.today(),
          }),
        ),
      ),
      prepared(
        await setup.prepare((c, p) =>
          setup.organisation.prepareGroupingKind(c, p, {
            code: syntheticCode(next('GK')),
            name: syntheticName('Grouping kind'),
            validFrom: setup.today(),
          }),
        ),
      ),
    ];
    for (const change of changes) {
      expect(await setup.decide(change.requestId, change.versionId, 'approve', setup.preparer)).toMatchObject({
        kind: 'refusal',
        refusal: { code: 'access.self-preparation' },
      });
    }
  });

  it('RR-440 a grouping kind migration 0044 recorded with no version is listed so, given a first version through flow A, and its grouping awaiting approval is then approved', async () => {
    // As migration 0044 leaves an earlier kind on dev: an identity row with no version (SYNTHETIC code).
    const kindId = uuidv7();
    const owner = await connect(world.organisations[0].database, 'migration');
    try {
      await owner.query(`insert into organisation.grouping_kind (id, code) values ($1, $2)`, [
        kindId,
        syntheticCode(next('LEGACY-KIND')),
      ]);
    } finally {
      await owner.end();
    }
    const listed = await setup.run(setup.preparer.id, (c) =>
      setup.organisation.record(c, 'grouping_kind', kindId, setup.today()),
    );
    expect(listed).toMatchObject({ id: kindId, versions: [] });
    expect((await structureOn(setup.today())).groupingKinds.map((each) => each.id)).not.toContain(kindId);

    // A grouping of it, awaiting approval, is refused while the kind has no version in force, naming the kind.
    const grouping = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareGrouping(c, p, {
          code: syntheticCode(next('GROUP')),
          groupingKindId: kindId,
          name: syntheticName('Grouping of an earlier kind'),
          storeIds: [],
          validFrom: setup.today(),
        }),
      ),
    );
    expect(await setup.decide(grouping.requestId, grouping.versionId)).toMatchObject({
      kind: 'refusal',
      refusal: {
        code: 'organisation.reference-not-in-force',
        missing: [{ kind: 'approval', recordType: 'organisation.grouping_kind', recordId: kindId }],
      },
    });

    // The Admin prepares the kind's first version; a different person approves it, and it is in force.
    const first = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareNameVersion(c, p, 'grouping_kind', kindId, {
          name: syntheticName('Earlier kind named'),
          validFrom: setup.today(),
        }),
      ),
    );
    decided(await setup.decide(first.requestId, first.versionId));
    expect((await structureOn(setup.today())).groupingKinds).toContainEqual(
      expect.objectContaining({ id: kindId, name: syntheticName('Earlier kind named') }),
    );
    // The grouping that waited is approved now.
    decided(await setup.decide(grouping.requestId, grouping.versionId));
    expect((await structureOn(setup.today())).groupings).toContainEqual(
      expect.objectContaining({ id: grouping.recordId, groupingKindId: kindId }),
    );
  });

  it('RR-440 no classification kind, value or grouping kind exists in a fresh Organisation', async () => {
    const lists = await structureOn(fresh.today(), fresh);
    expect(lists.classificationKinds).toEqual([]);
    expect(lists.classificationValues).toEqual([]);
    expect(lists.groupingKinds).toEqual([]);
    for (const kind of ['classification_kind', 'classification_value', 'grouping_kind'] as const) {
      expect((await listOf(kind, fresh)).records).toEqual([]);
    }
    const owner = await connect(world.organisations[1].database, 'migration');
    try {
      for (const table of ['classification_kind', 'classification_value', 'grouping_kind']) {
        const rows = await owner.query(`select count(*)::int as n from organisation.${table}`);
        expect(rows.rows).toEqual([{ n: 0 }]);
      }
    } finally {
      await owner.end();
    }
  });
});

describe('groupings made before grouping kinds were records keep working (migration 0044)', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'aos-grouping-kinds-'));
  const databases: string[] = [];

  afterAll(async () => {
    for (const name of databases) await dropDatabase(name);
    rmSync(scratch, { recursive: true, force: true });
  });

  it('RR-440 an earlier region grouping keeps its kind, now a record with no version, and a kind not recorded is refused', async () => {
    const source = migrationSetFolder('organisation');
    const folder = join(scratch, 'organisation');
    mkdirSync(folder);
    const files = readdirSync(source);
    const isMigration = (name: string) => /^\d{4}__.+\.sql$/.test(name);
    for (const name of files) {
      if (!isMigration(name) || name < '0044') copyFileSync(join(source, name), join(folder, name));
    }
    const database = await createEmptyDatabase('grouping-kinds', 'migration');
    databases.push(database);
    const connectionString = databaseUrl(database, 'migration');
    await migrateDatabase({ connectionString, folder });

    // A SYNTHETIC grouping of the fixed kind of migration 0028, as the dev Organisations hold.
    const grouping = uuidv7();
    const owner = await connect(database, 'migration');
    try {
      await owner.query(`insert into organisation.grouping (id, code, kind) values ($1, $2, 'region')`, [
        grouping,
        syntheticCode('LEGACY-REGION'),
      ]);
      await owner.query(
        `insert into organisation.grouping_version (id, grouping_id, name, valid_during, decision, prepared_by_user_id)
         values ($1, $2, $3, '[2026-01-01,)', 'Approved', $4)`,
        [uuidv7(), grouping, syntheticName('Legacy region'), uuidv7()],
      );
    } finally {
      await owner.end();
    }

    for (const name of files)
      if (isMigration(name) && name >= '0044') copyFileSync(join(source, name), join(folder, name));
    await migrateDatabase({ connectionString, folder });

    const after = await connect(database, 'migration');
    try {
      const kinds = await after.query(
        `select k.code, (select count(*)::int from organisation.grouping_kind_version v where v.grouping_kind_id = k.id) as versions
         from organisation.grouping_kind k`,
      );
      expect(kinds.rows).toEqual([{ code: 'region', versions: 0 }]);
      // Its identifier is a UUIDv7, as every record's is (structure-and-masters 2.1).
      const [kindId] = (await after.query<{ id: string }>('select id from organisation.grouping_kind')).rows;
      expect(kindId?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      const joined = await after.query(
        `select g.id from organisation.grouping g join organisation.grouping_kind k on k.code = g.kind`,
      );
      expect(joined.rows).toEqual([{ id: grouping }]);
      await expect(
        after.query(`insert into organisation.grouping (id, code, kind) values ($1, $2, 'cluster')`, [
          uuidv7(),
          syntheticCode('NO-KIND'),
        ]),
      ).rejects.toThrow(/foreign key/);
    } finally {
      await after.end();
    }
  });
});
