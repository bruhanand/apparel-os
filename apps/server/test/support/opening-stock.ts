import {
  businessDateSchema,
  IMPORT_BATCH_TYPE,
  OPENING_STOCK_APPROVAL,
  OPENING_STOCK_TYPE,
  type DocumentPreview,
} from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TransactionContext } from '../../src/kernel/index.js';
import {
  knownValue,
  optionSuggestions,
  type ComparisonRow,
  type EffectiveValue,
  type HandlerDocument,
  type HandlerRow,
  type ImportField,
  type ImportHandler,
  type ImportPlace,
  type ImportPublisher,
  type ImportSource,
  type HandlerPublished,
  type OpeningSwitch,
} from '../../src/modules/files-imports/index.js';
import type { CatalogueInterface } from '../../src/modules/merchandise/catalogue/index.js';
import type { OrganisationInterface } from '../../src/modules/organisation/index.js';
import {
  organisationPlaces,
  type CallerRegistration,
  type Condition,
  type LedgerItem,
  type LedgerRequest,
  type Owner,
  type StockLedgerInterface,
} from '../../src/modules/stock/ledger/index.js';
import { syntheticIdentifier } from '../fixtures/synthetic.js';

// S1-F13-T01: the opening-balance test handler, its validating half (imports-and-opening-data 10.2, 12, 13.2; GC-6
// section 12; PRD-LIF-004 to PRD-LIF-006, PRD-LIF-025, PRD-LIF-028, PRD-LIF-030, PRD-MER-011, PRD-MER-013, PRD-ORG-012,
// PRD-ORG-014, POL-14.02 to POL-14.04, DEC-090). It is composed only into a test application (code-house-rules 11.4;
// harness decisions H2 and H5; GC6-18, DEC-116): no code under `src/` names it. It checks each manifest row's
// references through `organisation` and `merchandise` and previews each document; it posts nothing, since publishing an
// opening batch is S1-F13-T03's, behind policy 14. The stage 4 `site-lifecycle` handler replaces it.
//
// One document is one manifest of the batch's unit, its reference the manifest reference. One row is one SKU, or one
// source identity not yet resolved to a SKU, at one location of the unit (10.2):
// - the Site, unit and internal location by code, which confirmed mapping rules fill from the earlier POS's words
//   (`rules: true` in the mapping; PRD-ORG-012), each in force today, the unit at the Site and the batch's own unit;
// - identity by a barcode or supplier code through Resolve a code (PRD-MER-007); a row that resolves to no SKU is
//   Blocking until its product is proposed and confirmed (PRD-MER-013). Style, colour and size are kept as source
//   words: resolving a SKU from them is the stage 4 handler's;
// - a whole quantity in the SKU's stock unit; batch and expiry only where the SKU's tracking profile requires them, a
//   missing one Blocking (PRD-MER-011);
// - a condition as the stock ledger names them (stock-ledger 2.2);
// - the owner: the Organisation's legal entity by its code. A supplier or brand under its agreement (POL-14.02) is
//   Blocking here, since checking the agreement is the stage 4 handler's;
// - the season: an approved value of the season attribute the test names, or Unknown selected explicitly by a person,
//   which is a value entered as `Unknown` (its entry keeps who, when and why; PRD-LIF-006). A file's own `Unknown` is
//   a source word, not a person's choice, and is Blocking;
// - valuation: a cost per unit with the evidence it rests on, or Unknown; never zero, never Blocking (POL-14.03; a
//   counted row without evidence is held as excess at the switch, T03). A cost given without evidence is Unknown too:
//   the measure stands on the evidence, so it is never summed as known (10.2). What counts as evidence is GC6-9,
//   RR-132, and until Accounts and the CA answer no value in a KDPS file is evidence;
// - the original receipt date only with the source document that backs it, else Unknown (PRD-LIF-030): a date with no
//   evidence is no issue, and the row's original age is Unknown (product owner's review fix, 12 Oct 2026);
// - billed-retained items as their own section, each with its earlier-POS bill reference; they are not opening stock
//   and are not compared with the count or the SOH (PRD-LIF-028, POL-14.04, DEC-090). Piece IDs are never imported.
//
// Every value it is given is SYNTHETIC.

/** The handler's target, a test-only identifier (code-house-rules 11.1). */
export const OPENING_STOCK_TARGET = syntheticIdentifier('opening-stock');

/** A season Unknown selected explicitly by a person: the value entered (PRD-LIF-006). */
export const EXPLICIT_UNKNOWN = 'Unknown';

/** The manifest's sections (10.2): opening stock, and billed-retained items, which are not opening stock. */
export const SECTIONS = ['opening-stock', 'billed-retained'] as const;

const CONDITIONS = ['good', 'damaged', 'wrong', 'unidentified'] as const;

const FIELDS: readonly ImportField[] = [
  { name: 'manifestReference', required: true },
  { name: 'section', required: true },
  { name: 'siteCode', required: true },
  { name: 'unitCode', required: true },
  { name: 'locationCode', required: true },
  { name: 'barcode', required: false },
  { name: 'supplierCode', required: false },
  { name: 'styleWord', required: false },
  { name: 'colourWord', required: false },
  { name: 'sizeWord', required: false },
  { name: 'itemWord', required: false },
  { name: 'brandWord', required: false },
  { name: 'supplierWord', required: false },
  { name: 'designWord', required: false },
  { name: 'quantity', required: true },
  { name: 'batchCode', required: false },
  { name: 'expiryDate', required: false },
  { name: 'condition', required: true },
  { name: 'ownerCode', required: true },
  { name: 'season', required: false },
  { name: 'unitCost', required: false },
  { name: 'valuationEvidence', required: false },
  { name: 'receiptDate', required: false },
  { name: 'receiptEvidence', required: false },
  { name: 'billReference', required: false },
];

const CODE = (reason: string) => `${OPENING_STOCK_TARGET}.${reason}`;

type Issue = Extract<DocumentPreview, { kind: 'issues' }>['issues'][number];

const WHOLE = /^\d+$/;

export interface OpeningStockDependencies {
  readonly organisation: Pick<OrganisationInterface, 'structureOn'>;
  readonly catalogue: Pick<CatalogueInterface, 'resolveCode' | 'skuOn' | 'vocabularyOn'>;
  /** The season attribute the test configured (an Organisation's own attribute, GC2-9), SYNTHETIC. */
  readonly seasonAttributeId: string;
  /**
   * The stock ledger it posts opening counts through, composed with its synthetic registration (OPENING_STOCK_CALLER;
   * stock-ledger 13.2; S1-F13-T03). Without it the handler validates only, as in S1-F13-T01.
   */
  readonly ledger?: StockLedgerInterface;
  /** Where the posting's phases add their milliseconds, for the measurement (10.6; RR-189). */
  readonly timings?: Record<string, number>;
  /**
   * The book a document posts into, given the book of its unit's mapping: a test may name another, SYNTHETIC, to see a
   * batch whose documents post into several books refused (`files-imports.several-books`; 10.6).
   */
  readonly bookOf?: (document: HandlerDocument, unitBookId: string) => string;
}

/** The module the test handler posts as, a synthetic caller of the stock ledger (stock-ledger 13.2; H2, H5). */
export const OPENING_STOCK_MODULE = syntheticIdentifier('opening-stock-handler');
/** The record type its opening counts come from: one manifest document of an opening batch. */
export const OPENING_STOCK_RECORD_TYPE = 'opening-manifest';

/**
 * The handler's registration with the stock ledger (stock-ledger 13.2): synthetic, so only a test composition accepts
 * it; opening counts only, from an opening batch only (S1-F13-T03).
 */
export const OPENING_STOCK_CALLER: CallerRegistration = {
  module: OPENING_STOCK_MODULE,
  synthetic: true,
  recordTypes: [
    { recordType: OPENING_STOCK_RECORD_TYPE, itemKinds: ['opening-count'], importKinds: ['opening-balance'] },
  ],
};

/** A row's condition, as the stock ledger names conditions (stock-ledger 2.2), checked rather than assumed. */
const conditionSchema = z.enum(['good', 'damaged', 'wrong', 'unidentified']) satisfies z.ZodType<Condition>;

/** Why a counted row without valuation evidence is held (stock-ledger 9 step 3; PRD-STK-014; POL-14.03). */
export const NO_VALUATION_EVIDENCE = 'Counted at the opening without valuation evidence (POL-14.03)';

async function today(context: TransactionContext): Promise<string> {
  const date = await context.businessDate();
  if (date.kind !== 'set') throw new Error('The synthetic Organisation has no timezone');
  return date.date;
}

/**
 * The reads of one transaction, each code and SKU asked once: an opening of tens of thousands of rows names a few
 * thousand SKUs (imports-and-opening-data 10.6; S1-F13-T03). A read answers the same within one transaction.
 */
const asked = new WeakMap<TransactionContext, Map<string, Promise<unknown>>>();

function once<T>(context: TransactionContext, key: string, read: () => Promise<T>): Promise<T> {
  let reads = asked.get(context);
  if (reads === undefined) {
    reads = new Map();
    asked.set(context, reads);
  }
  let answer = reads.get(key) as Promise<T> | undefined;
  if (answer === undefined) {
    answer = read();
    reads.set(key, answer);
  }
  return answer;
}

/** Read a SKU at a Site on a date (structure-and-masters 4.4), once per transaction. */
function skuRead(
  context: TransactionContext,
  catalogue: OpeningStockDependencies['catalogue'],
  skuId: string,
  siteId: string,
  date: string,
): ReturnType<OpeningStockDependencies['catalogue']['skuOn']> {
  return once(context, JSON.stringify(['sku', skuId, siteId, date]), () =>
    catalogue.skuOn(context, skuId, siteId, date),
  );
}

/**
 * The SKU a barcode or supplier code names today, or undefined (Resolve a code; structure-and-masters 4.7): a code
 * that names more than one SKU is the person's choice, so the row stays unresolved. It names no brand, so every
 * brand's mappings answer it, and a barcode a brand repeats across products names several (PRD-MER-007, DEC-135;
 * RR-554).
 */
function skuOf(
  context: TransactionContext,
  catalogue: OpeningStockDependencies['catalogue'],
  row: HandlerRow,
  date: string,
): Promise<string | undefined> {
  const barcode = knownValue(row.values.barcode);
  const supplierCode = knownValue(row.values.supplierCode);
  return once(context, JSON.stringify(['code', barcode ?? null, supplierCode ?? null, date]), () =>
    resolvedSku(context, catalogue, barcode, supplierCode, date),
  );
}

async function resolvedSku(
  context: TransactionContext,
  catalogue: OpeningStockDependencies['catalogue'],
  barcode: string | undefined,
  supplierCode: string | undefined,
  date: string,
): Promise<string | undefined> {
  const tries = [
    ...(barcode === undefined
      ? []
      : (['supplier-barcode', 'internal'] as const).map((kind) => ({ code: barcode, kind }))),
    ...(supplierCode === undefined ? [] : [{ code: supplierCode, kind: 'supplier-style-code' as const }]),
  ];
  const found = new Set<string>();
  for (const each of tries) {
    const resolved = await catalogue.resolveCode(context, { ...each, date });
    if ('resolved' in resolved) for (const candidate of resolved.resolved.candidates) found.add(candidate.skuId);
  }
  const [only] = found;
  return found.size === 1 ? only : undefined;
}

/** Whether a season value was entered by a person as Unknown (PRD-LIF-006). */
const explicitUnknown = (value: EffectiveValue | undefined) =>
  value?.kind === 'entered' && value.value === EXPLICIT_UNKNOWN;

/** The issues of one manifest document, each with its row and field (13.2). */
async function issuesOf(
  context: TransactionContext,
  dependencies: OpeningStockDependencies,
  document: HandlerDocument,
): Promise<Issue[]> {
  const issues: Issue[] = [];
  if (document.place.siteId === undefined || document.place.businessUnitId === undefined) {
    issues.push({ code: CODE('unit-not-named') });
    return issues;
  }
  const date = await today(context);
  const structure = await dependencies.organisation.structureOn(context, date);
  const seasons = new Set(
    (await dependencies.catalogue.vocabularyOn(context, dependencies.seasonAttributeId, date)).map((each) => each.code),
  );
  for (const row of document.rows) {
    const at = (field: string) => ({ field, rowNumber: row.rowNumber });
    const value = (field: string) => knownValue(row.values[field]);
    const section = value('section');
    if (!(SECTIONS as readonly (string | undefined)[]).includes(section)) {
      issues.push({ code: CODE('section-not-accepted'), ...at('section') });
    }
    const site = structure.sites.find((each) => each.code === value('siteCode'));
    const unit = structure.businessUnits.find((each) => each.code === value('unitCode'));
    const location = structure.locations.find((each) => each.code === value('locationCode'));
    if (site?.id !== document.place.siteId) {
      issues.push({ code: CODE('site-not-the-batch-site'), ...at('siteCode') });
    }
    if (unit?.id !== document.place.businessUnitId) {
      issues.push({ code: CODE('unit-not-the-batch-unit'), ...at('unitCode') });
    }
    if (location?.businessUnitId !== document.place.businessUnitId) {
      issues.push({ code: CODE('location-not-of-unit'), ...at('locationCode') });
    }
    const quantity = value('quantity');
    if (quantity === undefined || !WHOLE.test(quantity) || Number(quantity) === 0) {
      issues.push({ code: CODE('quantity-not-whole'), ...at('quantity') });
    }
    if (!(CONDITIONS as readonly (string | undefined)[]).includes(value('condition'))) {
      issues.push({ code: CODE('condition-not-accepted'), ...at('condition') });
    }
    if (!structure.legalEntities.some((each) => each.code === value('ownerCode'))) {
      issues.push({ code: CODE('owner-not-verified'), ...at('ownerCode') });
    }
    if (section === 'billed-retained') {
      // A billed-retained item is not opening stock; it keeps its earlier-POS bill reference (PRD-LIF-028).
      if (value('billReference') === undefined)
        issues.push({ code: CODE('bill-reference-missing'), ...at('billReference') });
      continue;
    }
    const season = row.values.season;
    if (!explicitUnknown(season)) {
      const word = knownValue(season);
      if (word === undefined || !seasons.has(word)) issues.push({ code: CODE('season-not-chosen'), ...at('season') });
    }
    // A receipt date is read only with its evidence; without it the original age is Unknown, never Blocking
    // (PRD-LIF-030), and a date that is no date is still refused.
    const receiptDate = value('receiptDate');
    if (receiptDate !== undefined && !businessDateSchema.safeParse(receiptDate).success) {
      issues.push({ code: CODE('receipt-date-not-accepted'), ...at('receiptDate') });
    }
    const skuId = await skuOf(context, dependencies.catalogue, row, date);
    if (skuId === undefined) {
      issues.push({ code: CODE('identity-not-resolved'), ...at('barcode') });
      continue;
    }
    const read = await skuRead(context, dependencies.catalogue, skuId, document.place.siteId, date);
    if ('refusal' in read) {
      issues.push({ code: read.refusal.code, ...at('barcode') });
      continue;
    }
    if (read.sku.tracking?.batchExpiryRequired === true) {
      if (value('batchCode') === undefined) issues.push({ code: CODE('batch-required'), ...at('batchCode') });
      if (value('expiryDate') === undefined) issues.push({ code: CODE('expiry-required'), ...at('expiryDate') });
    }
  }
  return issues;
}

/**
 * The synthetic switch of a unit and its cutover, from the test-only stand-in `test_opening_stock` (migration 0005 of
 * the test set): the latest approved switch of the unit, its cutover complete once recorded (10.1; S1-F13-T03).
 */
async function switchOf(context: TransactionContext, place: ImportPlace): Promise<OpeningSwitch> {
  if (place.businessUnitId === undefined || place.siteId === undefined) return { kind: 'none' };
  const [row] = (
    await context.tx.execute<{ id: string; complete: boolean }>(sql`
      select s.id, exists (select 1 from test_opening_stock.cutover c where c.switch_id = s.id) as complete
        from test_opening_stock.switch s
       where s.business_unit_id = ${place.businessUnitId} and s.site_id = ${place.siteId}
       order by s.approved_at desc, s.id desc limit 1`)
  ).rows;
  if (row === undefined) return { kind: 'none' };
  return { kind: 'approved', switchId: row.id, cutover: row.complete ? 'complete' : 'open' };
}

/**
 * The posting half (10.5, 10.6; stock-ledger 9, 13.4; S1-F13-T03): each opening-stock row of the manifest becomes an
 * opening count at its location, through the ledger's four operations in the job's transaction, after files-imports
 * recorded the decision's use, which every movement keeps (13.3). Ownership and valuation are kept apart: the owner is
 * the legal entity Operations verified (POL-14.02); valuation evidence, Accounts' (POL-14.03), decides only whether a
 * row is opening stock. One without is a surplus with no known receipt origin, held as excess, owner Unknown
 * (PRD-STK-014).
 * Values stay Unknown until an opening PT is approved, so nothing posts to the books: no journal (PRD-LIF-008).
 * Billed-retained items are not opening stock and are not counted here: their recognition rule is OPEN (stock-ledger 9
 * step 4; V-35, SL-17). Piece IDs are labelled at the switch count, never imported (PRD-LIF-025), so a piece-tracked
 * row is refused here: labelling is the stage 4 switch count's.
 */
async function postOpening(
  context: TransactionContext,
  dependencies: OpeningStockDependencies,
  publisher: ImportPublisher,
  document: HandlerDocument,
  source: ImportSource,
): Promise<HandlerPublished> {
  const refused = (reason: string, rowNumber?: number): HandlerPublished => ({
    kind: 'refused',
    refusal: {
      kind: 'refused',
      code: CODE(reason),
      missing: rowNumber === undefined ? [] : [{ kind: 'row', row: String(rowNumber) }],
    },
  });
  const { ledger } = dependencies;
  if (ledger === undefined || publisher.serviceIdentityId === undefined) return refused('posts-through-its-job');
  const { siteId, businessUnitId } = document.place;
  if (siteId === undefined || businessUnitId === undefined) return refused('unit-not-named');
  const date = await today(context);
  const structure = await dependencies.organisation.structureOn(context, date);
  const items: LedgerItem[] = [];
  for (const row of document.rows) {
    const value = (field: string) => knownValue(row.values[field]);
    if (value('section') === 'billed-retained') continue;
    const skuId = await skuOf(context, dependencies.catalogue, row, date);
    const locationId = structure.locations.find((each) => each.code === value('locationCode'))?.id;
    const legalEntityId = structure.legalEntities.find((each) => each.code === value('ownerCode'))?.id;
    if (skuId === undefined || locationId === undefined || legalEntityId === undefined) {
      return refused('row-not-resolved', row.rowNumber);
    }
    const read = await skuRead(context, dependencies.catalogue, skuId, siteId, date);
    if ('refusal' in read) return refused('row-not-resolved', row.rowNumber);
    if (read.sku.tracking?.pieceTracked === true) return refused('pieces-labelled-at-the-count', row.rowNumber);
    const condition = conditionSchema.safeParse(value('condition'));
    if (!condition.success) return refused('row-not-resolved', row.rowNumber);
    const batchCode = value('batchCode');
    const expiryDate = value('expiryDate');
    // Ownership and valuation stay apart: the owner is the one Operations verified (POL-14.02), whatever the row's
    // valuation evidence, which is Accounts' (POL-14.03) and decides only whether the row is opening stock.
    const verifiedOwner: Owner = { kind: 'organisation', legalEntityId };
    const evidence = value('valuationEvidence') !== undefined;
    items.push({
      kind: 'opening-count',
      lineId: row.stagedRowId,
      skuId,
      quantity: Number(value('quantity')),
      to: { siteId, businessUnitId, locationId },
      condition: condition.data,
      // A row without valuation evidence is not opening stock but a count surplus with no known receipt origin, whose
      // owner stays Unknown until it is established (PRD-STK-014; stock-ledger 9 step 3): the owner verified above
      // stays on the staged row as the evidence for that.
      owner: evidence ? verifiedOwner : { kind: 'unknown' },
      ...(read.sku.tracking?.batchExpiryRequired === true && batchCode !== undefined && expiryDate !== undefined
        ? { batch: { code: batchCode, expiryDate } }
        : {}),
      ...(evidence ? {} : { withoutValuationEvidence: { reason: NO_VALUATION_EVIDENCE } }),
    });
  }
  const request: LedgerRequest = {
    source: {
      module: OPENING_STOCK_MODULE,
      recordType: OPENING_STOCK_RECORD_TYPE,
      recordId: source.documentId,
      versionId: source.batchVersionId,
      importKind: 'opening-balance',
    },
    actor: {
      kind: 'service-identity',
      serviceIdentityId: publisher.serviceIdentityId,
      onBehalfOfUserId: publisher.userId,
      roleAssignmentId: publisher.roleAssignmentId,
    },
    ...(publisher.approval === undefined ? {} : { approval: publisher.approval }),
    items,
  };
  const timings = dependencies.timings;
  const mark = phaseTimer(timings);
  const planned = await ledger.plan(context, request);
  mark('plan');
  if (planned.kind === 'refused') return planned;
  const locked = await ledger.lock(context, planned.value);
  mark('lock');
  const periods = await ledger.holdPeriods(context, planned.value);
  if (periods.kind === 'refused') return periods;
  // Opening counts have no value, so they hold no period or journal series (stock-ledger 13.4).
  if (periods.value.length > 0) return refused('values-an-opening-count');
  const checked = await ledger.recheck(context, locked);
  mark('recheck');
  if (checked.kind === 'refused') return checked;
  const written = await ledger.write(context, checked.value, { kind: 'import', reference: source.batchCode });
  mark('write');
  if (written.kind === 'refused') return written;
  return {
    kind: 'published',
    records: written.value.movementIds.map((recordId) => ({ recordType: 'stock.movement', recordId })),
  };
}

/** Records into `timings`, if given, the milliseconds since the last mark under each name (stock-ledger 10.6). */
function phaseTimer(timings: Record<string, number> | undefined): (name: string) => void {
  let last = performance.now();
  return (name) => {
    const now = performance.now();
    if (timings !== undefined) timings[name] = (timings[name] ?? 0) + now - last;
    last = now;
  };
}

/** The test-only opening-stock handler: the validating half (S1-F13-T01) and the posting half (S1-F13-T03). */
export function openingStockHandler(dependencies: OpeningStockDependencies): ImportHandler {
  return {
    target: OPENING_STOCK_TARGET,
    recordType: IMPORT_BATCH_TYPE,
    kinds: ['opening-balance'],
    effects: 'stock',
    openingKind: 'stock',
    fields: FIELDS,
    measures: [
      { field: 'quantity', kind: 'quantity' },
      // A cost stands only on its valuation evidence (10.2; POL-14.03).
      { field: 'unitCost', kind: 'value', evidence: 'valuationEvidence' },
    ],
    // An opening's source identity is the unit and the opening kind (7.1), with the manifest reference.
    sourceScope: (document) => JSON.stringify([OPENING_STOCK_TARGET, 'stock', document.place.businessUnitId ?? null]),
    revisions: 'none',
    publishNeeds: (_context, document) =>
      Promise.resolve({ action: 'edit', recordType: IMPORT_BATCH_TYPE, facts: document.place }),
    lockTargets: () => Promise.resolve([]),
    // An approved opening batch is the unit's opening plan (DEC-117): an independent approval of the batch version,
    // Operations' verification of opening stock (POL-14.02; product owner, 12 Oct 2026).
    review: () => ({ kind: 'approval', actionType: OPENING_STOCK_APPROVAL, recordType: OPENING_STOCK_TYPE }),
    suggestions(_context, field, value) {
      switch (field) {
        case 'section':
          return Promise.resolve(optionSuggestions(SECTIONS, value));
        case 'condition':
          return Promise.resolve(optionSuggestions(CONDITIONS, value));
        default:
          return Promise.resolve([]);
      }
    },
    async checkRuleTarget(context, field, target) {
      const structure = await dependencies.organisation.structureOn(context, await today(context));
      const known =
        (field === 'siteCode' && structure.sites.some((each) => each.code === target)) ||
        (field === 'unitCode' && structure.businessUnits.some((each) => each.code === target)) ||
        (field === 'locationCode' && structure.locations.some((each) => each.code === target));
      if (known) return undefined;
      return ['siteCode', 'unitCode', 'locationCode'].includes(field)
        ? { kind: 'refused', code: 'organisation.record-not-found', missing: [{ kind: 'rule-target', field, target }] }
        : {
            kind: 'refused',
            code: 'files-imports.rule-attribute-unknown',
            missing: [{ kind: 'rule-attribute', field }],
          };
    },
    async preview(context, document) {
      const issues = await issuesOf(context, dependencies, document);
      if (issues.length > 0) return { kind: 'issues', issues };
      return { kind: 'would-create', records: [{ recordType: CODE('opening-row'), codes: [document.reference] }] };
    },
    // The unit's switch, from the test-only stand-in (10.1); a large opening posts through a queued job, one at a time
    // per book (10.6): the book of the unit's mapping in force today.
    switchOf,
    queued: {
      async postingBook(context, document) {
        const { siteId, businessUnitId } = document.place;
        if (siteId === undefined || businessUnitId === undefined) throw new Error('An opening names no unit');
        const unit = await organisationPlaces.unitAt(context, { siteId, businessUnitId }, await today(context));
        if (unit === undefined) throw new Error('The opening unit has no mapping in force');
        return dependencies.bookOf?.(document, unit.bookId) ?? unit.bookId;
      },
    },
    publish: (context, publisher, document, source) => postOpening(context, dependencies, publisher, document, source),
    comparison: {
      set: 'manifest',
      fields: ['section', 'barcode', 'supplierCode', 'locationCode', 'quantity'],
      async rows(context, documents): Promise<ComparisonRow[]> {
        const date = await today(context);
        const structure = await dependencies.organisation.structureOn(context, date);
        const rows: ComparisonRow[] = [];
        for (const document of documents) {
          for (const row of document.rows) {
            // Billed-retained items are not opening stock (PRD-LIF-028).
            if (knownValue(row.values.section) === 'billed-retained') continue;
            const quantity = knownValue(row.values.quantity);
            const code = knownValue(row.values.locationCode);
            rows.push({
              rowId: row.stagedRowId,
              barcode: knownValue(row.values.barcode) ?? null,
              skuId: (await skuOf(context, dependencies.catalogue, row, date)) ?? null,
              locationId: structure.locations.find((each) => each.code === code)?.id ?? null,
              quantity: quantity !== undefined && WHOLE.test(quantity) ? Number(quantity) : null,
            });
          }
        }
        return rows;
      },
    },
  };
}
