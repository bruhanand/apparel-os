import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import type { BusinessUnitKind, CatalogueChanged } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Preparer } from '../src/modules/access/index.js';
import type { PreparedVersion } from '../src/modules/organisation/index.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { syntheticKeysEnvironment, writeSyntheticUser } from './support/access.js';
import { grantSynthetic } from './support/grants.js';
import { approved, approvedGeography, decided, structureSetup, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';

// S1-F03-T01: brands, brand coverage, categories, size sets, attributes and vocabularies through the catalogue's
// interface and access's Decide, on real PostgreSQL (structure-and-masters 2.2, 3.3, 4.1, 4.2, 4.7, 9 tests 5, 11, 14
// and 19; access-and-approvals 5.1). Every value here is SYNTHETIC.

let world: SyntheticWorld;
let setup: StructureSetup;
let other: StructureSetup;
let geography: Awaited<ReturnType<typeof approvedGeography>>;
let admin: Preparer;
let counter = 0;
const next = (prefix: string) => `${prefix}-${String(++counter)}`;
const all = { kind: 'all' } as const;

beforeAll(async () => {
  world = await createSyntheticOrganisations('catalogue');
  const [orgA, orgB] = world.organisations;
  const keysEnvironment = syntheticKeysEnvironment(world);
  setup = await structureSetup({
    directory: world.directory,
    database: orgA.database,
    organisationCode: orgA.code,
    keysEnvironment,
    label: 'CATALOGUE-A',
  });
  other = await structureSetup({
    directory: world.directory,
    database: orgB.database,
    organisationCode: orgB.code,
    keysEnvironment,
    label: 'CATALOGUE-B',
  });
  geography = await approvedGeography(setup, 'CATALOGUE');
  const { assignmentId } = await grantSynthetic(orgA.database, { kind: 'user', id: setup.preparer.id }, [
    { recordType: 'access.role', action: 'create' },
    { recordType: 'access.role_assignment', action: 'create' },
  ]);
  admin = { userId: setup.preparer.id, roleAssignmentId: assignmentId };
  await grantSynthetic(orgA.database, { kind: 'user', id: setup.approver.id }, [
    { recordType: 'access.role', action: 'approve' },
  ]);
});

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (other as StructureSetup | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

type Outcome = { kind: 'success'; answer: CatalogueChanged } | { kind: 'refusal'; refusal: { code: string } };

function recorded(outcome: Outcome): CatalogueChanged {
  if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
  return outcome.answer;
}

const brand = async (on: StructureSetup = setup, parentBrandId?: string, aliases: string[] = []) =>
  recorded(
    await on.asPreparerDo((c, p) =>
      on.catalogue.prepareBrand(c, p, {
        code: syntheticCode(next('BRAND')),
        name: syntheticName(`Brand ${String(counter)}`),
        ...(parentBrandId === undefined ? {} : { parentBrandId }),
        aliases,
        validFrom: on.today(),
      }),
    ),
  );

const listAttribute = async (valueKind: 'list' | 'text' = 'list') =>
  recorded(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareAttribute(c, p, {
        code: syntheticCode(next('ATTR')),
        valueKind,
        name: syntheticName(`Attribute ${String(counter)}`),
        validFrom: setup.today(),
      }),
    ),
  );

const read = <K extends 'brand' | 'business_unit_brand' | 'category' | 'size_set' | 'vocabulary_value'>(
  kind: K,
  id: string,
  on: StructureSetup = setup,
) => on.run(on.preparer.id, (c) => on.catalogue.record(c, kind, id, on.today()));

describe('brands (structure-and-masters 4.1; PRD-MER-001, PRD-MER-020)', () => {
  it('PRD-MER-020 DEC-123 reads a parent brand apart from the brand’s aliases', async () => {
    const family = await brand();
    const child = await brand(setup, family.recordId, [syntheticName('Alias one'), syntheticName('Alias two')]);
    const record = await read('brand', child.recordId);
    expect(record?.versions).toEqual([
      expect.objectContaining({
        state: 'In force',
        parentBrandId: family.recordId,
        aliases: [syntheticName('Alias one'), syntheticName('Alias two')],
        retired: false,
      }),
    ]);
    // The parent is a brand of its own, never one of the aliases.
    expect(record?.versions[0]?.aliases).not.toContain(family.recordId);
  });

  it('PRD-MOD-010 GC2-7 refuses a master version that starts on a past date, with no exception (test 19)', async () => {
    expect(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareBrand(c, p, {
          code: syntheticCode(next('PAST')),
          name: syntheticName('Past brand'),
          aliases: [],
          validFrom: setup.day(-1),
        }),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'merchandise.starts-in-past' } });
    const known = await brand();
    const record = await read('brand', known.recordId);
    expect(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareBrandVersion(c, p, known.recordId, {
          name: syntheticName('Renamed'),
          aliases: [],
          retired: false,
          validFrom: setup.day(-1),
          versionToken: record?.versionToken,
        }),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'merchandise.starts-in-past' } });
    expect(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareAttribute(c, p, {
          code: syntheticCode(next('PASTATTR')),
          valueKind: 'list',
          name: syntheticName('Past attribute'),
          validFrom: setup.day(-1),
        }),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'merchandise.starts-in-past' } });
  });

  it('code-house-rules 12.7 refuses a version made from a stale screen, and keeps history as versions', async () => {
    const known = await brand();
    const before = await read('brand', known.recordId);
    const later = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareBrandVersion(c, p, known.recordId, {
          name: syntheticName('Later name'),
          aliases: [syntheticName('Earlier name')],
          retired: false,
          validFrom: setup.day(5),
          versionToken: before?.versionToken,
        }),
      ),
    );
    expect(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareBrandVersion(c, p, known.recordId, {
          name: syntheticName('Stale'),
          aliases: [],
          retired: false,
          validFrom: setup.day(6),
          versionToken: before?.versionToken,
        }),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'kernel.stale-version' } });
    const after = await read('brand', known.recordId);
    expect(after?.versionToken).toBe(later.versionId);
    expect(after?.versions.map((version) => version.state)).toEqual(['Scheduled', 'In force']);
    expect(after?.versions[1]?.validTo).toBe(setup.day(5));
  });

  it('PRD-MER-020 refuses a parent brand that would nest a brand under itself', async () => {
    const top = await brand();
    const below = await brand(setup, top.recordId);
    const record = await read('brand', top.recordId);
    expect(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareBrandVersion(c, p, top.recordId, {
          name: syntheticName('Top'),
          parentBrandId: below.recordId,
          aliases: [],
          retired: false,
          validFrom: setup.today(),
          versionToken: record?.versionToken,
        }),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'merchandise.parent-cycle' } });
  });
});

describe('categories and size sets (structure-and-masters 4.1; PRD-MER-002, POL-04.01)', () => {
  it('PRD-MER-002 keeps a category tree with its own size set, ordered sizes and identity attributes', async () => {
    const colour = await listAttribute();
    const top = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareCategory(c, p, {
          code: syntheticCode(next('CAT')),
          name: syntheticName('Top category'),
          identityAttributeIds: [],
          validFrom: setup.today(),
        }),
      ),
    );
    const sub = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareCategory(c, p, {
          code: syntheticCode(next('SUBCAT')),
          name: syntheticName('Sub category'),
          parentCategoryId: top.recordId,
          identityAttributeIds: [colour.recordId],
          validFrom: setup.today(),
        }),
      ),
    );
    const sizes = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareSizeSet(c, p, {
          code: syntheticCode(next('SIZES')),
          categoryId: sub.recordId,
          name: syntheticName('Sizes'),
          sizes: ['SYN-S', 'SYN-M', 'SYN-L'],
          validFrom: setup.today(),
        }),
      ),
    );
    const subRecord = await read('category', sub.recordId);
    const withSizes = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareCategoryVersion(c, p, sub.recordId, {
          name: syntheticName('Sub category'),
          parentCategoryId: top.recordId,
          sizeSetId: sizes.recordId,
          identityAttributeIds: [colour.recordId],
          validFrom: setup.day(1),
          versionToken: subRecord?.versionToken,
        }),
      ),
    );
    expect((await read('category', sub.recordId))?.versions[0]).toMatchObject({
      id: withSizes.versionId,
      state: 'Scheduled',
      parentCategoryId: top.recordId,
      sizeSetId: sizes.recordId,
      identityAttributeIds: [colour.recordId],
    });
    expect((await read('size_set', sizes.recordId))?.versions[0]).toMatchObject({
      sizes: ['SYN-S', 'SYN-M', 'SYN-L'],
    });
    // A size set is fixed to its category: another category never names it.
    const topRecord = await read('category', top.recordId);
    expect(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareCategoryVersion(c, p, top.recordId, {
          name: syntheticName('Top category'),
          sizeSetId: sizes.recordId,
          identityAttributeIds: [],
          validFrom: setup.today(),
          versionToken: topRecord?.versionToken,
        }),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'merchandise.size-set-of-another-category' } });
  });
});

describe('vocabulary proposals (structure-and-masters 4.2; PRD-IMP-008, POL-02.07)', () => {
  it('PRD-IMP-008 refuses a vocabulary value confirmed by its proposer (test 11); a different person confirms it', async () => {
    const colour = await listAttribute();
    const proposed = await setup.asPreparerDo((c, p) =>
      setup.catalogue.proposeVocabularyValue(c, p, {
        attributeId: colour.recordId,
        code: syntheticCode(next('COLOUR')),
        name: syntheticName('Teal'),
      }),
    );
    if (proposed.kind !== 'success') throw new Error(proposed.refusal.code);
    // An unconfirmed proposal changes no operational data: it is never offered as a value.
    const offered = () =>
      setup.run(setup.preparer.id, (c) => setup.catalogue.vocabularyOn(c, colour.recordId, setup.today()));
    expect(await offered()).toEqual([]);
    // Its proposer is refused, whatever approve they hold (PRD-ACS-006).
    await grantSynthetic(world.organisations[0].database, { kind: 'user', id: setup.preparer.id }, [
      { recordType: 'merchandise.vocabulary_proposal', action: 'approve' },
    ]);
    const own = await setup.decide(proposed.answer.requestId, proposed.answer.proposalId, 'approve', setup.preparer);
    expect(own).toMatchObject({ kind: 'refusal', refusal: { code: 'access.self-preparation' } });
    expect(await offered()).toEqual([]);
    decided(await setup.decide(proposed.answer.requestId, proposed.answer.proposalId));
    const values = await offered();
    expect(values).toEqual([expect.objectContaining({ name: syntheticName('Teal') })]);
    const proposal = await setup.run(setup.preparer.id, (c) => setup.catalogue.proposal(c, proposed.answer.proposalId));
    expect(proposal).toMatchObject({ state: 'Confirmed', valueId: values[0]?.id });
    const value = await read('vocabulary_value', values[0]?.id ?? '');
    expect(value).toMatchObject({ attributeId: colour.recordId, versions: [{ state: 'In force' }] });
  });

  it('PRD-IMP-008 a rejected proposal makes no value; a text attribute takes no proposal; a code is proposed once', async () => {
    const fit = await listAttribute();
    const code = syntheticCode(next('FIT'));
    const proposed = await setup.asPreparerDo((c, p) =>
      setup.catalogue.proposeVocabularyValue(c, p, { attributeId: fit.recordId, code, name: syntheticName('Slim') }),
    );
    if (proposed.kind !== 'success') throw new Error(proposed.refusal.code);
    expect(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.proposeVocabularyValue(c, p, { attributeId: fit.recordId, code, name: syntheticName('Again') }),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'merchandise.code-taken' } });
    decided(await setup.decide(proposed.answer.requestId, proposed.answer.proposalId, 'reject'));
    expect(
      await setup.run(setup.preparer.id, (c) => setup.catalogue.vocabularyOn(c, fit.recordId, setup.today())),
    ).toEqual([]);
    const text = await listAttribute('text');
    expect(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.proposeVocabularyValue(c, p, {
          attributeId: text.recordId,
          code: syntheticCode(next('TEXT')),
          name: syntheticName('Words'),
        }),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'merchandise.attribute-not-list' } });
  });
});

/** A legal entity with a registration in the State and a book, approved from today. */
async function mapping() {
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

/** One approved unit of each kind at one Site, the whole-store and brand-counter units of one Store there. */
async function unitsOfEachKind(): Promise<Record<BusinessUnitKind, string>> {
  const site = await approved(setup, (c, p) =>
    setup.organisation.prepareSite(c, p, {
      code: syntheticCode(next('SITE')),
      name: syntheticName('Site'),
      physicalKind: 'retail-site',
      areaId: geography.area.recordId,
      addresses: [syntheticName('Address')],
      aliases: [],
      validFrom: setup.today(),
    }),
  );
  const store = await approved(setup, (c, p) =>
    setup.organisation.prepareStore(c, p, {
      code: syntheticCode(next('STORE')),
      name: syntheticName('Store'),
      format: 'ebo',
      operatingModel: 'company-owned',
      siteId: site.recordId,
      aliases: [],
      validFrom: setup.today(),
    }),
  );
  const map = await mapping();
  const unit = async (kind: BusinessUnitKind): Promise<PreparedVersion> =>
    approved(setup, (c, p) =>
      setup.organisation.prepareBusinessUnit(c, p, {
        code: syntheticCode(next('BU')),
        siteId: site.recordId,
        kind,
        ...(kind === 'whole-store' || kind === 'brand-counter' ? { storeId: store.recordId } : {}),
        name: syntheticName(`Unit ${kind}`),
        ...map,
        validFrom: setup.today(),
      }),
    );
  return {
    'whole-store': (await unit('whole-store')).recordId,
    'brand-counter': (await unit('brand-counter')).recordId,
    warehouse: (await unit('warehouse')).recordId,
    office: (await unit('office')).recordId,
  };
}

const cover = (unitId: string, brandIds: string[], versionToken?: string) =>
  setup.asPreparerDo((c, p) =>
    setup.catalogue.prepareBusinessUnitBrandVersion(c, p, unitId, {
      brandIds,
      validFrom: setup.today(),
      ...(versionToken === undefined ? {} : { versionToken }),
    }),
  );

describe('brand coverage (structure-and-masters 3.3, 9 test 5; PRD-ORG-006)', () => {
  it('PRD-ORG-006 applies brand coverage by unit kind, each change approved by a different person (test 5)', async () => {
    const units = await unitsOfEachKind();
    const [one, two] = [await brand(), await brand()];
    // An office unit operates without a brand.
    expect(await cover(units.office, [one.recordId])).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'merchandise.office-unit-has-no-brand' },
    });
    // A brand-counter unit covers at most one brand (product owner, 10 Oct 2026).
    expect(await cover(units['brand-counter'], [one.recordId, two.recordId])).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'merchandise.brand-counter-one-brand' },
    });
    // Whole-store and warehouse units cover several brands.
    for (const [unitId, brandIds] of [
      [units['brand-counter'], [one.recordId]],
      [units['whole-store'], [one.recordId, two.recordId]],
      [units.warehouse, [one.recordId, two.recordId]],
    ] as const) {
      const answer = recorded(await cover(unitId, [...brandIds]));
      expect((await read('business_unit_brand', unitId))?.versions[0]).toMatchObject({ state: 'Awaiting approval' });
      // The preparer never approves it (GC2-2, DEC-105; PRD-ACS-006).
      expect(await setup.decide(answer.requestId ?? '', answer.versionId, 'approve', setup.preparer)).toMatchObject({
        kind: 'refusal',
      });
      decided(await setup.decide(answer.requestId ?? '', answer.versionId));
      expect(await read('business_unit_brand', unitId)).toMatchObject({
        versions: [{ state: 'In force', brandIds: [...brandIds].sort() }],
      });
    }
  });

  it('PRD-ORG-006 a brand-counter unit may cover no brand while it is set up; activation asks for one (product owner, 10 Oct 2026)', async () => {
    const units = await unitsOfEachKind();
    const answer = recorded(await cover(units['brand-counter'], []));
    decided(await setup.decide(answer.requestId ?? '', answer.versionId));
    expect(await read('business_unit_brand', units['brand-counter'])).toMatchObject({
      versions: [{ state: 'In force', brandIds: [] }],
    });
  });
});

describe('brand scope (access-and-approvals 5.1; module-map section 3, rule 6)', () => {
  it('PRD-ACS-001 validates an assignment selecting a brand through the scope contract: unknown or retired refused', async () => {
    const roleAnswer = await setup.run(admin.userId, (c) =>
      setup.access.prepareRole(c, admin, {
        code: syntheticCode(`ROLE-${String(randomInt(1_000_000_000))}`),
        name: syntheticName('Brand role'),
        permissions: [{ kind: 'action', recordType: 'merchandise.brand', action: 'view', selfService: false }],
        validFrom: setup.today(),
      }),
    );
    if (roleAnswer.kind !== 'success') throw new Error(roleAnswer.refusal.code);
    decided(await setup.decide(roleAnswer.answer.requestId, roleAnswer.answer.versionId));
    const user = await writeSyntheticUser(
      world.organisations[0].database,
      world.organisations[0].code,
      syntheticKeysEnvironment(world),
      { label: next('BRANDED') },
    );
    const assign = (members: string[], validFrom = setup.today()) =>
      setup.run(admin.userId, (c) =>
        setup.access.prepareAssignment(c, admin, {
          actor: { kind: 'user', userId: user.id },
          roleId: roleAnswer.answer.roleId,
          scope: { kind: 'dimensions', legalEntity: all, place: all, brand: { kind: 'selected', members } },
          validFrom,
        }),
      );
    const unknown = uuidv7();
    expect(await assign([unknown])).toMatchObject({
      kind: 'refusal',
      refusal: {
        code: 'access.scope-member-not-found',
        missing: [{ kind: 'scope-member', dimension: 'brand', memberType: 'brand', memberId: unknown }],
      },
    });
    const kept = await brand();
    expect(await assign([kept.recordId])).toMatchObject({ kind: 'success' });
    // A brand retired from tomorrow is in force on no day of an assignment from tomorrow.
    const retiring = await brand();
    const record = await read('brand', retiring.recordId);
    recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareBrandVersion(c, p, retiring.recordId, {
          name: syntheticName('Retired brand'),
          aliases: [],
          retired: true,
          validFrom: setup.day(1),
          versionToken: record?.versionToken,
        }),
      ),
    );
    expect(await assign([retiring.recordId], setup.day(1))).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.scope-member-not-found' },
    });
  });
});

describe('two Organisations (structure-and-masters 9 test 14; PRD-ORG-002, PRD-ACS-020)', () => {
  it('PRD-ACS-020 a second synthetic Organisation sees none of these records', async () => {
    const mine = await brand();
    const theirs = await other.run(other.preparer.id, (c) => other.catalogue.list(c, 'brand', other.today(), {}));
    expect(theirs.records.map((record) => record.id)).not.toContain(mine.recordId);
    expect(await read('brand', mine.recordId, other)).toBeUndefined();
    const proposals = await other.run(other.preparer.id, (c) => other.catalogue.listProposals(c, {}));
    expect(proposals.records).toEqual([]);
  });
});
