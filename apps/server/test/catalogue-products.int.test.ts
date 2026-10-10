import { uuidv7 } from '@apparel-os/domain';
import type { CatalogueChanged, ProductProposalDraft, ProposedSku } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionContext } from '../src/kernel/index.js';
import type { StockPresence } from '../src/modules/merchandise/catalogue/index.js';
import { catalogueSkus } from '../src/modules/stock/ledger/index.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { syntheticKeysEnvironment } from './support/access.js';
import { grantSynthetic } from './support/grants.js';
import { approved, approvedGeography, decided, structureSetup, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F03-T02: styles, SKUs, product proposals, external codes, packs and tracking profiles through the catalogue's
// interface and access's Decide, on real PostgreSQL (structure-and-masters 4.1 to 4.7, 9 tests 7, 8, 9, 10, 18 and
// 20). The stock-presence contract is the seam to the stock ledger: here a SYNTHETIC stand-in answers it, built to the
// contract's shape; the ledger's own answer is proved in stock-ledger-tables.int.test.ts. Every value is SYNTHETIC.

/** The SYNTHETIC stand-in for the stock ledger's answer: the Sites holding stock of each SKU, as a test sets them. */
class SyntheticStock implements StockPresence {
  readonly held = new Map<string, string[]>();
  sitesHoldingStock(_context: TransactionContext, skuIds: readonly string[]): Promise<readonly string[]> {
    return Promise.resolve([...new Set(skuIds.flatMap((id) => this.held.get(id) ?? []))].sort());
  }
}

let world: SyntheticWorld;
let setup: StructureSetup;
let geography: Awaited<ReturnType<typeof approvedGeography>>;
const stock = new SyntheticStock();
let counter = 0;
const next = (prefix: string) => `${prefix}-${String(++counter)}`;

type Outcome<A> = { kind: 'success'; answer: A } | { kind: 'refusal'; refusal: { code: string } };
function ok<A>(outcome: Outcome<A>): A {
  if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
  return outcome.answer;
}
const recorded = (outcome: Outcome<CatalogueChanged>) => ok(outcome);

/** A SYNTHETIC catalogue to propose into: a brand, a category with a size set and a colour identity attribute. */
interface Catalogue {
  readonly brandId: string;
  readonly categoryId: string;
  readonly colourId: string;
  readonly redId: string;
  readonly fitId: string;
}
let catalogue: Catalogue;

async function confirmedValue(attributeId: string, label: string): Promise<string> {
  const proposed = ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.proposeVocabularyValue(c, p, {
        attributeId,
        code: syntheticCode(next(label)),
        name: syntheticName(label),
      }),
    ),
  );
  decided(await setup.decide(proposed.requestId, proposed.proposalId));
  const proposal = await setup.run(setup.preparer.id, (c) => setup.catalogue.proposal(c, proposed.proposalId));
  if (proposal?.valueId === undefined) throw new Error('no value');
  return proposal.valueId;
}

async function newCatalogue(): Promise<Catalogue> {
  const today = setup.today();
  const brandId = recorded(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareBrand(c, p, {
        code: syntheticCode(next('BRAND')),
        name: syntheticName('Brand'),
        aliases: [],
        validFrom: today,
      }),
    ),
  ).recordId;
  const attribute = async (valueKind: 'list' | 'text', label: string) =>
    recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareAttribute(c, p, {
          code: syntheticCode(next(label)),
          valueKind,
          name: syntheticName(label),
          validFrom: today,
        }),
      ),
    ).recordId;
  const colourId = await attribute('list', 'COLOUR');
  const fitId = await attribute('text', 'FIT');
  const redId = await confirmedValue(colourId, 'RED');
  const category = recorded(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareCategory(c, p, {
        code: syntheticCode(next('CAT')),
        name: syntheticName('Category'),
        identityAttributeIds: [colourId],
        validFrom: today,
      }),
    ),
  );
  const sizeSet = recorded(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareSizeSet(c, p, {
        code: syntheticCode(next('SIZES')),
        categoryId: category.recordId,
        name: syntheticName('Sizes'),
        sizes: ['SYN-S', 'SYN-M', 'SYN-FREE'],
        validFrom: today,
      }),
    ),
  );
  // The size set from tomorrow: a category's version shares no start with another (structure-and-masters 2.2).
  recorded(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareCategoryVersion(c, p, category.recordId, {
        name: syntheticName('Category'),
        sizeSetId: sizeSet.recordId,
        identityAttributeIds: [colourId],
        validFrom: setup.day(1),
        versionToken: category.versionId,
      }),
    ),
  );
  return { brandId, categoryId: category.recordId, colourId, redId, fitId };
}

const skuDraft = (overrides: Partial<ProposedSku> = {}): ProposedSku => ({
  code: syntheticCode(next('SKU')),
  identity: [{ attributeId: catalogue.colourId, valueId: catalogue.redId }],
  stockUnit: 'piece',
  purpose: 'merchandise',
  ...overrides,
});

const styleDraft = (skus: ProposedSku[]): ProductProposalDraft => ({
  style: {
    code: syntheticCode(next('STYLE')),
    brandId: catalogue.brandId,
    categoryId: catalogue.categoryId,
    attributes: [{ attributeId: catalogue.fitId, text: syntheticName('Slim') }],
  },
  skus,
  sourceWords: 'SYNTHETIC source words, as the file gave them',
});

/** Proposes and confirms a product, answering its SKUs in the order proposed. */
async function confirmedProduct(draft: ProductProposalDraft) {
  const proposed = ok(await setup.asPreparerDo((c, p) => setup.catalogue.proposeProduct(c, p, draft)));
  decided(await setup.decide(proposed.requestId, proposed.proposalId));
  const proposal = await setup.run(setup.preparer.id, (c) => setup.catalogue.productProposal(c, proposed.proposalId));
  if (proposal === undefined) throw new Error('no proposal');
  return proposal;
}

const read = <K extends 'style' | 'sku' | 'pack' | 'tracking_profile' | 'category_tracking_profile'>(
  kind: K,
  id: string,
) => setup.run(setup.preparer.id, (c) => setup.catalogue.record(c, kind, id, setup.today()));

beforeAll(async () => {
  world = await createSyntheticOrganisations('products');
  const [orgA] = world.organisations;
  setup = await structureSetup({
    directory: world.directory,
    database: orgA.database,
    organisationCode: orgA.code,
    keysEnvironment: syntheticKeysEnvironment(world),
    label: 'PRODUCTS',
    stockPresence: stock,
  });
  geography = await approvedGeography(setup, 'PRODUCTS');
  catalogue = await newCatalogue();
  // The size set is the category's from tomorrow (newCatalogue): the days these tests run on.
  setup.advanceDays(1);
});

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('product proposals (structure-and-masters 4.2, 9 test 20; PRD-MER-013, DM-5)', () => {
  it('PRD-MER-013 DM-5 refuses a product proposal confirmed by its proposer (test 20); a different person confirms it', async () => {
    const draft = styleDraft([skuDraft()]);
    const proposed = ok(await setup.asPreparerDo((c, p) => setup.catalogue.proposeProduct(c, p, draft)));
    // Unconfirmed, it is no SKU: nothing in the catalogue has its code (PRD-MER-013).
    const before = await setup.run(setup.preparer.id, (c) =>
      setup.catalogue.list(c, 'sku', setup.today(), { limit: 100 }),
    );
    expect(before.records.map((each) => each.code)).not.toContain(draft.skus[0]?.code);
    // Its proposer is refused, whatever approve they hold (PRD-ACS-006).
    await grantSynthetic(world.organisations[0].database, { kind: 'user', id: setup.preparer.id }, [
      { recordType: 'merchandise.product_proposal', action: 'approve' },
    ]);
    expect(await setup.decide(proposed.requestId, proposed.proposalId, 'approve', setup.preparer)).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.self-preparation' },
    });
    decided(await setup.decide(proposed.requestId, proposed.proposalId));
    const proposal = await setup.run(setup.preparer.id, (c) => setup.catalogue.productProposal(c, proposed.proposalId));
    expect(proposal).toMatchObject({ state: 'Confirmed', sourceWords: draft.sourceWords });
    expect(proposal?.skuIds).toHaveLength(1);
    const made = await read('sku', proposal?.skuIds[0] ?? '');
    expect(made).toMatchObject({ code: draft.skus[0]?.code, versions: [{ state: 'In force', stockUnit: 'piece' }] });
  });

  it('GC2-9 refuses a value of a list-type attribute that is not an approved vocabulary value (test 20)', async () => {
    // An open proposal's value is no value; nor is another attribute's value.
    const pending = ok(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.proposeVocabularyValue(c, p, {
          attributeId: catalogue.colourId,
          code: syntheticCode(next('BLUE')),
          name: syntheticName('Blue'),
        }),
      ),
    );
    const refusedWith = async (draft: ProductProposalDraft) =>
      setup.asPreparerDo((c, p) => setup.catalogue.proposeProduct(c, p, draft));
    expect(
      await refusedWith(
        styleDraft([skuDraft({ identity: [{ attributeId: catalogue.colourId, valueId: pending.proposalId }] })]),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'merchandise.value-not-in-vocabulary' } });
    expect(
      await refusedWith(
        styleDraft([skuDraft({ identity: [{ attributeId: catalogue.colourId, text: 'SYNTHETIC red' }] })]),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'merchandise.value-not-in-vocabulary' } });
    expect(
      await refusedWith(styleDraft([skuDraft({ identity: [{ attributeId: catalogue.fitId, text: 'SYNTHETIC' }] })])),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'merchandise.not-an-identity-attribute' } });
    expect(await refusedWith(styleDraft([skuDraft({ size: 'SYN-XXL' })]))).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'merchandise.size-not-in-size-set' },
    });
  });
});

describe('SKU identity (structure-and-masters 4.1, 9 test 8; PRD-MER-005)', () => {
  it('PRD-MER-005 a SKU with Unknown size and the Free Size SKU are different SKUs; a second Unknown-size SKU is refused (test 8)', async () => {
    const proposal = await confirmedProduct(styleDraft([skuDraft(), skuDraft({ size: 'SYN-FREE' })]));
    expect(proposal.skuIds).toHaveLength(2);
    const [unknown, free] = await Promise.all(proposal.skuIds.map((id) => read('sku', id)));
    expect(unknown).toMatchObject({ size: null });
    expect(free).toMatchObject({ size: 'SYN-FREE' });
    expect(unknown?.id).not.toBe(free?.id);
    // Unknown counts as one value: the same style, Unknown size and colour again is the same SKU.
    expect(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.proposeProduct(c, p, {
          styleId: proposal.skuIds[0] === undefined ? '' : (unknown?.styleId ?? ''),
          skus: [skuDraft()],
        }),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'merchandise.sku-exists' } });
    // An identity attribute not given is Unknown, a SKU of its own.
    const another = await confirmedProduct({ styleId: unknown?.styleId ?? '', skus: [skuDraft({ identity: [] })] });
    const unknownColour = await read('sku', another.skuIds[0] ?? '');
    expect(unknownColour?.identity).toEqual([{ attributeId: catalogue.colourId }]);
  });

  it('code-house-rules 3.3 the identity key a SKU keeps is always the key of its identity rows, held at commit', async () => {
    const proposal = await confirmedProduct(styleDraft([skuDraft({ size: 'SYN-S' })]));
    const client = await connect(world.organisations[0].database, 'migration');
    try {
      const made = await client.query<{ style_id: string; proposal_id: string }>(
        'select style_id, proposal_id from merchandise.sku where id = $1',
        [proposal.skuIds[0]],
      );
      const [row] = made.rows;
      await client.query('begin');
      // A key that is not its rows' key: the deferred check refuses the transaction at commit.
      await client.query(
        `insert into merchandise.sku (id, code, style_id, size, identity_key, proposal_id)
         values ($1, $2, $3, 'SYN-M', 'SYNTHETIC not a key', $4)`,
        [uuidv7(), syntheticCode(next('SKU')), row?.style_id, row?.proposal_id],
      );
      await expect(client.query('commit')).rejects.toMatchObject({ code: 'AO003' });
    } finally {
      await client.end();
    }
  });
});

describe('Read a SKU as of a date (structure-and-masters 4.7; PRD-MER-019)', () => {
  it('PRD-MER-019 DEC-123 reads a gift-with-purchase, promotional or packaging SKU with its purpose and stock unit, with the versions in force on a date', async () => {
    const proposal = await confirmedProduct(
      styleDraft([
        skuDraft({ purpose: 'gift-with-purchase', size: 'SYN-S' }),
        skuDraft({ purpose: 'promotional', size: 'SYN-M', stockUnit: 'pair' }),
        skuDraft({ purpose: 'packaging', size: 'SYN-FREE', stockUnit: 'pack' }),
      ]),
    );
    const siteId = uuidv7();
    const reads = await setup.run(setup.preparer.id, (c) =>
      Promise.all(proposal.skuIds.map((id) => setup.catalogue.skuOn(c, id, siteId, setup.today()))),
    );
    expect(reads.map((each) => ('sku' in each ? [each.sku.purpose, each.sku.stockUnit] : each))).toEqual([
      ['gift-with-purchase', 'piece'],
      ['promotional', 'pair'],
      ['packaging', 'pack'],
    ]);
    const [first] = reads;
    if (first === undefined || !('sku' in first)) throw new Error('not read');
    expect(first.sku).toMatchObject({
      brandId: catalogue.brandId,
      categoryId: catalogue.categoryId,
      attributes: [{ attributeId: catalogue.fitId, text: syntheticName('Slim') }],
      packs: [],
    });
    // Its category has no tracking profile: Unknown, never defaulted (PRD-MOD-015).
    expect(first.sku.tracking).toBeUndefined();
    // A later version: the read on each date names the version in force then.
    const skuId = proposal.skuIds[0] ?? '';
    const record = await read('sku', skuId);
    const later = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareSkuVersion(c, p, skuId, {
          stockUnit: 'piece',
          purpose: 'merchandise',
          validFrom: setup.day(3),
          versionToken: record?.versionToken,
        }),
      ),
    );
    const onDates = await setup.run(setup.preparer.id, async (c) => [
      await setup.catalogue.skuOn(c, skuId, siteId, setup.today()),
      await setup.catalogue.skuOn(c, skuId, siteId, setup.day(3)),
      await setup.catalogue.skuOn(c, skuId, siteId, setup.day(-30)),
    ]);
    expect(onDates[0]).toMatchObject({ sku: { versionId: first.sku.versionId, purpose: 'gift-with-purchase' } });
    expect(onDates[1]).toMatchObject({ sku: { versionId: later.versionId, purpose: 'merchandise' } });
    expect(onDates[2]).toMatchObject({ refusal: { code: 'merchandise.no-version-in-force' } });
    // An unconfirmed proposal is never read as a SKU (PRD-MER-013): only a confirmed SKU has an identifier to read.
    expect(
      await setup.run(setup.preparer.id, (c) => setup.catalogue.skuOn(c, uuidv7(), siteId, setup.today())),
    ).toMatchObject({
      refusal: { code: 'merchandise.record-not-found' },
    });
  });
});

describe('stock unit (structure-and-masters 4.4, 9 test 18; GC2-5)', () => {
  it('POL-04.03 POL-04.04 GC2-5 refuses a stock unit change while stock of the SKU is recorded, and accepts it as a new version when none is (test 18)', async () => {
    const proposal = await confirmedProduct(styleDraft([skuDraft()]));
    const skuId = proposal.skuIds[0] ?? '';
    const siteId = uuidv7();
    stock.held.set(skuId, [siteId]);
    const change = async () => {
      const record = await read('sku', skuId);
      return setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareSkuVersion(c, p, skuId, {
          stockUnit: 'pack',
          purpose: 'merchandise',
          validFrom: setup.day(1),
          versionToken: record?.versionToken,
        }),
      );
    };
    expect(await change()).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'merchandise.stock-recorded', missing: [{ recordType: 'organisation.site', recordId: siteId }] },
    });
    stock.held.delete(skuId);
    const accepted = recorded(await change());
    const record = await read('sku', skuId);
    expect(record?.versions.map((each) => [each.id, each.state, each.stockUnit])).toEqual([
      [accepted.versionId, 'Scheduled', 'pack'],
      [expect.any(String), 'In force', 'piece'],
    ]);
  });
});

describe('packs (structure-and-masters 4.4, 9 test 9; POL-04.04)', () => {
  it('POL-04.04 a pack conversion change leaves past quantities as they were (test 9)', async () => {
    const proposal = await confirmedProduct(styleDraft([skuDraft()]));
    const skuId = proposal.skuIds[0] ?? '';
    const pack = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.preparePack(c, p, {
          code: syntheticCode(next('PACK')),
          skuId,
          units: 6,
          mixed: false,
          forPurchasing: true,
          forSelling: false,
          contents: [],
          validFrom: setup.today(),
        }),
      ),
    );
    const changed = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.preparePackVersion(c, p, pack.recordId, {
          units: 12,
          mixed: false,
          forPurchasing: true,
          forSelling: false,
          contents: [],
          validFrom: setup.day(2),
          versionToken: pack.versionId,
        }),
      ),
    );
    const siteId = uuidv7();
    const [now, later] = await setup.run(setup.preparer.id, async (c) => [
      await setup.catalogue.skuOn(c, skuId, siteId, setup.today()),
      await setup.catalogue.skuOn(c, skuId, siteId, setup.day(2)),
    ]);
    // A quantity recorded today keeps the version it used, and that version still says 6 (POL-04.04).
    expect(now).toMatchObject({ sku: { packs: [{ packId: pack.recordId, versionId: pack.versionId, units: 6 }] } });
    expect(later).toMatchObject({
      sku: { packs: [{ packId: pack.recordId, versionId: changed.versionId, units: 12 }] },
    });
    const record = await read('pack', pack.recordId);
    expect(record?.versions.find((each) => each.id === pack.versionId)).toMatchObject({ units: 6 });
  });

  it('POL-04.03 itemises a mixed pack by its contents, SKU by SKU', async () => {
    const proposal = await confirmedProduct(styleDraft([skuDraft({ size: 'SYN-S' }), skuDraft({ size: 'SYN-M' })]));
    const [small, medium] = proposal.skuIds;
    const pack = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.preparePack(c, p, {
          code: syntheticCode(next('MIXED')),
          skuId: small ?? '',
          mixed: true,
          forPurchasing: true,
          forSelling: true,
          contents: [
            { skuId: small ?? '', quantity: 2 },
            { skuId: medium ?? '', quantity: 3 },
          ],
          validFrom: setup.today(),
        }),
      ),
    );
    const record = await read('pack', pack.recordId);
    expect(record?.versions[0]).toMatchObject({ mixed: true });
    expect(record?.versions[0]?.contents).toHaveLength(2);
    expect(record?.versions[0]?.units).toBeUndefined();
  });
});

describe('external codes (structure-and-masters 4.3, 9 test 7; PRD-MER-006, PRD-MER-007)', () => {
  it('PRD-MER-006 PRD-MER-007 keeps leading zeros, refuses a conflicting active mapping, lets identical pieces share one, and refuses an ambiguity across scopes (test 7)', async () => {
    const proposal = await confirmedProduct(styleDraft([skuDraft({ size: 'SYN-S' }), skuDraft({ size: 'SYN-M' })]));
    const [small, medium] = proposal.skuIds as [string, string];
    const supplier = ok(
      await setup.asPreparerDo((c, p) =>
        setup.parties.prepareParty(c, p, {
          code: syntheticCode(next('SUPPLIER')),
          legalName: syntheticName('Supplier'),
          taxIdentities: [],
          msmeClassification: null,
          contacts: [],
          roles: ['supplier'],
          validFrom: setup.today(),
        }),
      ),
    ).recordId;
    const code = `000${String(Date.now()).slice(-7)}${String(++counter)}`;
    const map = (draft: Partial<Parameters<typeof setup.catalogue.mapCode>[2]>) =>
      setup.asPreparerDo((c, p) =>
        setup.catalogue.mapCode(c, p, {
          code,
          kind: 'supplier-barcode',
          scope: { kind: 'supplier', partyId: supplier },
          skuId: small,
          alias: false,
          validFrom: setup.today(),
          ...draft,
        }),
      );
    ok(await map({}));
    // Identical pieces share the one code: it names the SKU, never a piece; mapping it again to the same SKU is no conflict.
    ok(await map({ validFrom: setup.day(1) }));
    // Another SKU in the same scope over overlapping dates: refused (the exclusion constraint behind the service).
    expect(await map({ skuId: medium })).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'merchandise.code-conflict' },
    });
    // The whole Organisation overlaps every scope: refused by the service under the code's lock.
    expect(await map({ skuId: medium, scope: { kind: 'organisation' } })).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'merchandise.code-conflict' },
    });
    const resolve = (query: { supplierId?: string; brandId?: string }) =>
      setup.run(setup.preparer.id, (c) =>
        setup.catalogue.resolveCode(c, { code, kind: 'supplier-barcode', date: setup.today(), ...query }),
      );
    // Leading zeros kept: the code as supplied resolves; without them it does not.
    expect(await resolve({ supplierId: supplier })).toMatchObject({ resolved: { skuId: small, alias: false } });
    expect(
      await setup.run(setup.preparer.id, (c) =>
        setup.catalogue.resolveCode(c, {
          code: code.replace(/^0+/, ''),
          kind: 'supplier-barcode',
          supplierId: supplier,
          date: setup.today(),
        }),
      ),
    ).toMatchObject({ refusal: { code: 'merchandise.code-not-found' } });
    // A brand scope is not compared with a supplier scope on saving; Resolve refuses a request matching both.
    ok(await map({ skuId: medium, scope: { kind: 'brand', brandId: catalogue.brandId } }));
    expect(await resolve({ supplierId: supplier, brandId: catalogue.brandId })).toMatchObject({
      refusal: { code: 'merchandise.code-ambiguous' },
    });
    expect(await resolve({ brandId: catalogue.brandId })).toMatchObject({ resolved: { skuId: medium } });
  });

  it('PRD-MER-007 keeps an earlier code as a historical alias, resolved only where no active mapping is', async () => {
    const proposal = await confirmedProduct(styleDraft([skuDraft()]));
    const skuId = proposal.skuIds[0] ?? '';
    const code = syntheticCode(next('OLD'));
    const mapped = ok(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.mapCode(c, p, {
          code,
          kind: 'other',
          scope: { kind: 'organisation' },
          skuId,
          alias: false,
          validFrom: setup.today(),
        }),
      ),
    );
    ok(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.endCodeMapping(c, p, mapped.mappingId, { validTo: setup.day(2) }),
      ),
    );
    ok(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.mapCode(c, p, {
          code,
          kind: 'other',
          scope: { kind: 'organisation' },
          skuId,
          alias: true,
          validFrom: setup.day(2),
        }),
      ),
    );
    const resolve = (date: string) =>
      setup.run(setup.preparer.id, (c) => setup.catalogue.resolveCode(c, { code, kind: 'other', date }));
    expect(await resolve(setup.today())).toMatchObject({ resolved: { skuId, alias: false } });
    expect(await resolve(setup.day(5))).toMatchObject({ resolved: { skuId, alias: true } });
  });
});

describe('tracking profiles (structure-and-masters 4.5, 4.6, 9 test 10; PRD-MER-018)', () => {
  it('PRD-MER-018 DEC-054 a change to piece-tracked takes effect only at a Site whose labelling count is complete (test 10)', async () => {
    const profile = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareTrackingProfile(c, p, {
          code: syntheticCode(next('PROFILE')),
          name: syntheticName('Quantity profile'),
          pieceTracked: false,
          batchExpiryRequired: false,
          requiredIdentifiers: [],
          validFrom: setup.today(),
        }),
      ),
    );
    const categoryRecord = await read('category_tracking_profile', catalogue.categoryId);
    recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareCategoryTrackingProfileVersion(c, p, catalogue.categoryId, {
          trackingProfileId: profile.recordId,
          validFrom: setup.today(),
          versionToken: categoryRecord?.versionToken,
        }),
      ),
    );
    const proposal = await confirmedProduct(styleDraft([skuDraft()]));
    const skuId = proposal.skuIds[0] ?? '';
    const site = await approved(setup, (c, p) =>
      setup.organisation.prepareSite(c, p, {
        code: syntheticCode(next('SITE')),
        name: syntheticName('Site'),
        physicalKind: 'retail-site',
        areaId: geography.area.recordId,
        addresses: [],
        aliases: [],
        validFrom: setup.today(),
      }),
    );
    const otherSite = await approved(setup, (c, p) =>
      setup.organisation.prepareSite(c, p, {
        code: syntheticCode(next('SITE')),
        name: syntheticName('Other site'),
        physicalKind: 'retail-site',
        areaId: geography.area.recordId,
        addresses: [],
        aliases: [],
        validFrom: setup.today(),
      }),
    );
    const toPieces = async (validFrom: string) => {
      const record = await read('tracking_profile', profile.recordId);
      return setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareTrackingProfileVersion(c, p, profile.recordId, {
          name: syntheticName('Piece profile'),
          pieceTracked: true,
          batchExpiryRequired: false,
          requiredIdentifiers: [],
          validFrom,
          versionToken: record?.versionToken,
        }),
      );
    };
    // Stock of the profile's goods at a Site with no labelling count planned: refused, naming the Site.
    stock.held.set(skuId, [site.recordId]);
    expect(await toPieces(setup.day(1))).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'merchandise.labelling-count-not-planned', missing: [{ recordId: site.recordId }] },
    });
    stock.held.delete(skuId);
    // Recorded as requested; piece rules wait for each Site's labelling count.
    const change = recorded(await toPieces(setup.day(1)));
    const tracked = async (siteId: string) => {
      const answer = await setup.run(setup.preparer.id, (c) => setup.catalogue.skuOn(c, skuId, siteId, setup.day(1)));
      if (!('sku' in answer)) throw new Error(answer.refusal.code);
      return answer.sku.tracking;
    };
    expect(await tracked(site.recordId)).toMatchObject({
      versionId: change.versionId,
      pieceTracked: false,
      pieceTrackingRequested: true,
    });
    ok(
      await setup.run(setup.preparer.id, (c) =>
        setup.catalogue.recordTrackingSiteChange(
          c,
          { kind: 'user', id: setup.preparer.id },
          { trackingProfileVersionId: change.versionId, siteId: site.recordId, labellingCountId: uuidv7() },
        ),
      ),
    );
    expect(await tracked(site.recordId)).toMatchObject({ pieceTracked: true });
    expect(await tracked(otherSite.recordId)).toMatchObject({ pieceTracked: false, pieceTrackingRequested: true });
    // The stock ledger's SKU read, wired to Read a SKU (stock-ledger 13.9; RR-436), answers the same at each Site.
    const facts = await setup.run(setup.preparer.id, async (c) => [
      await catalogueSkus.skuAt(c, skuId, site.recordId, setup.day(1)),
      await catalogueSkus.skuAt(c, skuId, otherSite.recordId, setup.day(1)),
    ]);
    expect(facts).toEqual([
      expect.objectContaining({ skuId, brandId: catalogue.brandId, stockUnit: 'piece', pieceTracked: true }),
      expect.objectContaining({ skuId, pieceTracked: false, batchTracked: false }),
    ]);
    // A link back to a quantity profile is refused while the labelled Site holds the category's pieces (4.6).
    stock.held.set(skuId, [site.recordId]);
    const quantity = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareTrackingProfile(c, p, {
          code: syntheticCode(next('PROFILE')),
          name: syntheticName('Another quantity profile'),
          pieceTracked: false,
          batchExpiryRequired: false,
          requiredIdentifiers: [],
          validFrom: setup.today(),
        }),
      ),
    );
    const linked = await read('category_tracking_profile', catalogue.categoryId);
    expect(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareCategoryTrackingProfileVersion(c, p, catalogue.categoryId, {
          trackingProfileId: quantity.recordId,
          validFrom: setup.day(2),
          versionToken: linked?.versionToken,
        }),
      ),
    ).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'merchandise.pieces-held', missing: [{ recordId: site.recordId }] },
    });
    stock.held.delete(skuId);
    // Only a change to piece-tracked waits for labelling counts: the first version is none.
    expect(
      await setup.run(setup.preparer.id, (c) =>
        setup.catalogue.recordTrackingSiteChange(
          c,
          { kind: 'user', id: setup.preparer.id },
          { trackingProfileVersionId: profile.versionId, siteId: site.recordId, labellingCountId: uuidv7() },
        ),
      ),
    ).toMatchObject({ kind: 'refusal', refusal: { code: 'merchandise.not-a-piece-tracking-change' } });
  });

  /** A SYNTHETIC tracking profile from today. */
  const newProfile = async (pieceTracked: boolean) =>
    recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareTrackingProfile(c, p, {
          code: syntheticCode(next('PROFILE')),
          name: syntheticName(pieceTracked ? 'Piece profile' : 'Quantity profile'),
          pieceTracked,
          batchExpiryRequired: false,
          requiredIdentifiers: [],
          validFrom: setup.today(),
        }),
      ),
    );
  /** A profile's next version from a date, piece-tracked or quantity. */
  const profileVersion = async (profileId: string, pieceTracked: boolean, validFrom: string) => {
    const record = await read('tracking_profile', profileId);
    return setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareTrackingProfileVersion(c, p, profileId, {
        name: syntheticName(pieceTracked ? 'Piece profile' : 'Quantity profile'),
        pieceTracked,
        batchExpiryRequired: false,
        requiredIdentifiers: [],
        validFrom,
        versionToken: record?.versionToken,
      }),
    );
  };
  /** Links a category to a profile from a date. */
  const link = async (categoryId: string, trackingProfileId: string, validFrom: string) => {
    const record = await read('category_tracking_profile', categoryId);
    return setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareCategoryTrackingProfileVersion(c, p, categoryId, {
        trackingProfileId,
        validFrom,
        versionToken: record?.versionToken,
      }),
    );
  };
  /** A SYNTHETIC category of its own, colour its identity, with one confirmed SKU of Unknown size. */
  const categoryWithSku = async () => {
    const categoryId = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareCategory(c, p, {
          code: syntheticCode(next('CAT')),
          name: syntheticName('Tracked category'),
          identityAttributeIds: [catalogue.colourId],
          validFrom: setup.today(),
        }),
      ),
    ).recordId;
    const draft = styleDraft([skuDraft()]);
    const proposal = await confirmedProduct({
      ...draft,
      style: { ...(draft.style ?? { code: '', brandId: '', attributes: [] }), categoryId },
    });
    return { categoryId, skuId: proposal.skuIds[0] ?? '' };
  };

  it('PRD-MER-018 a change from piece-tracked to quantity is refused while a Site holds pieces of the profile (product owner, 10 Oct 2026)', async () => {
    const profile = await newProfile(true);
    const { categoryId, skuId } = await categoryWithSku();
    recorded(await link(categoryId, profile.recordId, setup.today()));
    const siteId = uuidv7();
    // Piece-tracked from its first version, so its stock is pieces at every Site.
    stock.held.set(skuId, [siteId]);
    expect(await profileVersion(profile.recordId, false, setup.day(1))).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'merchandise.pieces-held', missing: [{ recordType: 'organisation.site', recordId: siteId }] },
    });
    stock.held.delete(skuId);
    recorded(await profileVersion(profile.recordId, false, setup.day(1)));
  });

  it('PRD-MER-018 pieces are held only where the change to piece-tracked is in force: stock at a Site still on quantity does not refuse the change back', async () => {
    const profile = await newProfile(false);
    const { categoryId, skuId } = await categoryWithSku();
    recorded(await link(categoryId, profile.recordId, setup.today()));
    const change = recorded(await profileVersion(profile.recordId, true, setup.day(1)));
    const labelled = await approved(setup, (c, p) =>
      setup.organisation.prepareSite(c, p, {
        code: syntheticCode(next('SITE')),
        name: syntheticName('Labelled site'),
        physicalKind: 'retail-site',
        areaId: geography.area.recordId,
        addresses: [],
        aliases: [],
        validFrom: setup.today(),
      }),
    );
    const unlabelled = uuidv7();
    // The labelled Site's change is in force; a Site with no labelling count still holds quantities.
    ok(
      await setup.run(setup.preparer.id, (c) =>
        setup.catalogue.recordTrackingSiteChange(
          c,
          { kind: 'user', id: setup.preparer.id },
          { trackingProfileVersionId: change.versionId, siteId: labelled.recordId, labellingCountId: uuidv7() },
        ),
      ),
    );
    stock.held.set(skuId, [labelled.recordId, unlabelled]);
    expect(await profileVersion(profile.recordId, false, setup.day(2))).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'merchandise.pieces-held', missing: [{ recordId: labelled.recordId }] },
    });
    stock.held.set(skuId, [unlabelled]);
    recorded(await profileVersion(profile.recordId, false, setup.day(2)));
    stock.held.delete(skuId);
  });

  it('PRD-MER-018 a change to piece-tracked counts every category linked to the profile on a day the change covers, and no other', async () => {
    const profile = await newProfile(false);
    // A quantity version from day 4 ends the change on day 4 (structure-and-masters 2.2).
    recorded(await profileVersion(profile.recordId, false, setup.day(4)));
    const within = await categoryWithSku();
    const after = await categoryWithSku();
    recorded(await link(within.categoryId, profile.recordId, setup.day(2)));
    recorded(await link(after.categoryId, profile.recordId, setup.day(5)));
    const siteId = uuidv7();
    // Stock of a category linked from day 5, after the change ends: no refusal.
    stock.held.set(after.skuId, [siteId]);
    const change = await profileVersion(profile.recordId, true, setup.day(1));
    expect(change).toMatchObject({ kind: 'success' });
    stock.held.delete(after.skuId);
    // Stock of a category linked from day 2, inside the change: refused.
    const again = await newProfile(false);
    recorded(await profileVersion(again.recordId, false, setup.day(4)));
    const linked = await categoryWithSku();
    recorded(await link(linked.categoryId, again.recordId, setup.day(2)));
    stock.held.set(linked.skuId, [siteId]);
    expect(await profileVersion(again.recordId, true, setup.day(1))).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'merchandise.labelling-count-not-planned' },
    });
    stock.held.delete(linked.skuId);
  });

  it('PRD-MER-018 a category linked from a quantity profile to a piece-tracked one is a change to piece-tracked, refused while its stock is held', async () => {
    const [quantity, pieces] = [await newProfile(false), await newProfile(true)];
    const { categoryId, skuId } = await categoryWithSku();
    recorded(await link(categoryId, quantity.recordId, setup.today()));
    const siteId = uuidv7();
    stock.held.set(skuId, [siteId]);
    expect(await link(categoryId, pieces.recordId, setup.day(1))).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'merchandise.labelling-count-not-planned', missing: [{ recordId: siteId }] },
    });
    stock.held.delete(skuId);
    recorded(await link(categoryId, pieces.recordId, setup.day(1)));
    // And back to quantity: refused while the category's pieces are held, accepted when none are.
    stock.held.set(skuId, [siteId]);
    expect(await link(categoryId, quantity.recordId, setup.day(2))).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'merchandise.pieces-held', missing: [{ recordId: siteId }] },
    });
    stock.held.delete(skuId);
    recorded(await link(categoryId, quantity.recordId, setup.day(2)));
  });

  it('POL-04.05 keeps each shelf life Unknown until given, none with a default', async () => {
    const profile = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareTrackingProfile(c, p, {
          code: syntheticCode(next('BATCH')),
          name: syntheticName('Batch profile'),
          pieceTracked: false,
          batchExpiryRequired: true,
          requiredIdentifiers: ['SYNTHETIC lot'],
          sellingShelfLifeDays: 7,
          validFrom: setup.today(),
        }),
      ),
    );
    const record = await read('tracking_profile', profile.recordId);
    expect(record?.versions[0]).toMatchObject({ batchExpiryRequired: true, sellingShelfLifeDays: 7 });
    expect(record?.versions[0]?.receivingShelfLifeDays).toBeUndefined();
  });
});

describe('two Organisations (structure-and-masters 9 test 14; PRD-ACS-020)', () => {
  it('PRD-ACS-020 a second synthetic Organisation sees no style, SKU or code of the first', async () => {
    const other = await connect(world.organisations[1].database, 'migration');
    try {
      const rows = await other.query<{ n: string }>(
        'select (select count(*) from merchandise.sku) + (select count(*) from merchandise.style) + (select count(*) from merchandise.external_code) as n',
      );
      expect(rows.rows[0]?.n).toBe('0');
    } finally {
      await other.end();
    }
  });
});
