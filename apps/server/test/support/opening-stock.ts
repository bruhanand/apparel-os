import {
  businessDateSchema,
  IMPORT_BATCH_APPROVAL,
  IMPORT_BATCH_TYPE,
  type DocumentPreview,
} from '@apparel-os/schemas';
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
} from '../../src/modules/files-imports/index.js';
import type { CatalogueInterface } from '../../src/modules/merchandise/catalogue/index.js';
import type { OrganisationInterface } from '../../src/modules/organisation/index.js';
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
//   counted row without evidence is held as excess at the switch, T03). What counts as evidence is GC6-9, RR-132;
// - the original receipt date only with the source document that backs it, else Unknown (PRD-LIF-030); a date with no
//   evidence is Blocking;
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
}

async function today(context: TransactionContext): Promise<string> {
  const date = await context.businessDate();
  if (date.kind !== 'set') throw new Error('The synthetic Organisation has no timezone');
  return date.date;
}

/** The SKU a barcode or supplier code names today, or undefined (Resolve a code; structure-and-masters 4.7). */
async function skuOf(
  context: TransactionContext,
  catalogue: OpeningStockDependencies['catalogue'],
  row: HandlerRow,
  date: string,
): Promise<string | undefined> {
  const barcode = knownValue(row.values.barcode);
  const supplierCode = knownValue(row.values.supplierCode);
  const tries = [
    ...(barcode === undefined
      ? []
      : (['supplier-barcode', 'internal'] as const).map((kind) => ({ code: barcode, kind }))),
    ...(supplierCode === undefined ? [] : [{ code: supplierCode, kind: 'supplier-style-code' as const }]),
  ];
  const found = new Set<string>();
  for (const each of tries) {
    const resolved = await catalogue.resolveCode(context, { ...each, date });
    if ('resolved' in resolved) found.add(resolved.resolved.skuId);
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
    const receiptDate = value('receiptDate');
    if (receiptDate !== undefined) {
      if (!businessDateSchema.safeParse(receiptDate).success) {
        issues.push({ code: CODE('receipt-date-not-accepted'), ...at('receiptDate') });
      } else if (value('receiptEvidence') === undefined) {
        issues.push({ code: CODE('receipt-date-without-evidence'), ...at('receiptEvidence') });
      }
    }
    const skuId = await skuOf(context, dependencies.catalogue, row, date);
    if (skuId === undefined) {
      issues.push({ code: CODE('identity-not-resolved'), ...at('barcode') });
      continue;
    }
    const read = await dependencies.catalogue.skuOn(context, skuId, document.place.siteId, date);
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

/** The test-only opening-stock handler (validating half). Publishing is S1-F13-T03's. */
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
      { field: 'unitCost', kind: 'value' },
    ],
    // An opening's source identity is the unit and the opening kind (7.1), with the manifest reference.
    sourceScope: (document) => `${OPENING_STOCK_TARGET}:stock:${document.place.businessUnitId ?? 'unit-unknown'}`,
    revisions: 'none',
    publishNeeds: (_context, document) =>
      Promise.resolve({ action: 'edit', recordType: IMPORT_BATCH_TYPE, facts: document.place }),
    lockTargets: () => Promise.resolve([]),
    // An approved opening batch is the unit's opening plan (DEC-117): an independent approval of the batch version.
    review: () => ({ kind: 'approval', actionType: IMPORT_BATCH_APPROVAL }),
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
    publish() {
      throw new Error('Publishing an opening batch is S1-F13-T03');
    },
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
