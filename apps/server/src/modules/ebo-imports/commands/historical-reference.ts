import { uuidv7 } from '@apparel-os/domain';
import {
  businessDateSchema,
  IMPORT_BATCH_APPROVAL,
  IMPORT_BATCH_TYPE,
  type DocumentPreview,
  type ExternalCodeKind,
} from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import {
  knownValue,
  type ComparisonRow,
  type HandlerDocument,
  type HandlerRow,
  type ImportField,
  type ImportHandler,
  type ImportMeasure,
} from '../../files-imports/index.js';
import type { CatalogueInterface } from '../../merchandise/catalogue/index.js';
import { referenceDocument, referenceLine } from '../db/schema.js';

// The historical-reference handler of `ebo-imports` (imports-and-opening-data 4.1, 4.2, 7.1, 10.3, 12, 13.2;
// module-map section 5, 11.1; PRD-LIF-013, PRD-LIF-014, PRD-LIF-016, PRD-IMP-010; DEC-116; S1-F13-T01). The earlier
// POS's stock on hand and its daily sales report, each a layout of its own, are kept as reference records with their
// source identities, for checking and reports only. Publishing one writes its reference document and lines, with the
// batch, document and staged rows it came from (section 5), and nothing else: it never moves stock (PRD-LIF-014),
// makes a sale or issues a tax invoice (PRD-LIF-016), and calls neither `stock` nor `finance`. A document is one
// report of one Store for one report date, its reference the report date; its source identity is the report's kind
// and the batch's Store (7.1). The stock on hand is also a set of a comparison run: each row's barcode, the SKU it
// resolves to on the report date, and its quantity (10.3).
//
// The review is a second person's: an independent approval of the batch version before it is kept (PRD-IMP-005;
// product owner, 12 Oct 2026), not the preparer's submission. Confirmed by the product owner, 12 Oct 2026: a barcode
// resolves through Resolve a code as a supplier barcode or an internal code, a code that names two SKUs staying
// unresolved; the earlier POS's item code is kept as its source word, since which code kind it is stays OPEN for KDPS.
// Design choices (S1-F13-T01): a quantity is a whole number, a negative one kept as given (a return line of the daily
// sales, H-5); a daily-sales amount is integer paise, staged by the `paise` transform (PRD-MOD-014), a finer one
// Unknown (GC6-13). No revision is supported: a changed report is a conflict. Codes resolve on the report date, the
// document's reference; a report with no date resolves none, so no date is ever taken from the server's clock
// (code-house-rules 9).

/** The record type of a reference document (permissions: `ebo_imports.reference_document`). */
export const REFERENCE_DOCUMENT_TYPE = 'ebo_imports.reference_document';

/** The report kinds of the stage 1 handler, each a target of its own. */
export type ReportKind = 'stock-on-hand' | 'daily-sales';

/** The target a batch names for each report kind. */
export const REPORT_TARGETS: Readonly<Record<ReportKind, string>> = {
  'stock-on-hand': 'ebo-imports.stock-on-hand',
  'daily-sales': 'ebo-imports.daily-sales',
};

const FIELDS: Readonly<Record<ReportKind, readonly ImportField[]>> = {
  'stock-on-hand': [
    { name: 'reportDate', required: true },
    { name: 'barcode', required: false },
    { name: 'itemCode', required: false },
    { name: 'quantity', required: true },
  ],
  'daily-sales': [
    { name: 'reportDate', required: true },
    { name: 'billNumber', required: false },
    { name: 'barcode', required: false },
    { name: 'itemCode', required: false },
    { name: 'quantity', required: true },
    { name: 'amount', required: false },
  ],
};

const MEASURES: Readonly<Record<ReportKind, readonly ImportMeasure[]>> = {
  'stock-on-hand': [{ field: 'quantity', kind: 'quantity' }],
  'daily-sales': [
    { field: 'quantity', kind: 'quantity' },
    { field: 'amount', kind: 'value' },
  ],
};

/** The code kinds a barcode of the earlier POS is resolved as (structure-and-masters 4.3, 4.7). */
const BARCODE_KINDS: readonly ExternalCodeKind[] = ['supplier-barcode', 'internal'];

type Issue = Extract<DocumentPreview, { kind: 'issues' }>['issues'][number];

const WHOLE = /^-?\d+$/;

/** An integer of paise as staged by the `paise` transform, signed for a return line (PRD-MOD-014). */
const PAISE = /^-?\d+$/;

/** A whole quantity, or null where it is Unknown or not whole (PRD-MOD-015). */
function wholeOf(row: HandlerRow): number | null {
  const text = knownValue(row.values.quantity);
  return text !== undefined && WHOLE.test(text) ? Number(text) : null;
}

/** The issues of a document (13.2): a Store named, a date, and each row's identity and whole quantity. */
function issuesOf(document: HandlerDocument): Issue[] {
  const issues: Issue[] = [];
  if (document.place.storeId === undefined) issues.push({ code: 'ebo-imports.store-not-named' });
  if (!businessDateSchema.safeParse(document.reference).success) {
    issues.push({ code: 'ebo-imports.date-not-accepted', field: 'reportDate' });
  }
  for (const row of document.rows) {
    if (knownValue(row.values.barcode) === undefined && knownValue(row.values.itemCode) === undefined) {
      issues.push({ code: 'ebo-imports.identity-missing', field: 'barcode', rowNumber: row.rowNumber });
    }
    const quantity = knownValue(row.values.quantity);
    if (quantity !== undefined && !WHOLE.test(quantity)) {
      issues.push({ code: 'ebo-imports.quantity-not-whole', field: 'quantity', rowNumber: row.rowNumber });
    }
    const amount = knownValue(row.values.amount);
    if (amount !== undefined && !PAISE.test(amount)) {
      issues.push({ code: 'ebo-imports.amount-not-paise', field: 'amount', rowNumber: row.rowNumber });
    }
  }
  return issues;
}

/** A line's amount in integer paise, or null where it is Unknown or not paise (PRD-MOD-014, PRD-MOD-015). */
function paiseOf(row: HandlerRow): number | null {
  const text = knownValue(row.values.amount);
  return text !== undefined && PAISE.test(text) ? Number(text) : null;
}

/**
 * The SKU a barcode names on a date, or null: not found, or two SKUs, a brand barcode repeated across products among
 * them, whose choice is the person's, never this handler's (structure-and-masters 4.7; PRD-MER-007, DEC-135).
 */
async function skuOfBarcode(
  context: TransactionContext,
  catalogue: Pick<CatalogueInterface, 'resolveCode'>,
  barcode: string | undefined,
  date: string | undefined,
): Promise<string | null> {
  if (barcode === undefined || date === undefined) return null;
  const found = new Set<string>();
  for (const kind of BARCODE_KINDS) {
    const resolved = await catalogue.resolveCode(context, { code: barcode, kind, date });
    if ('resolved' in resolved) for (const candidate of resolved.resolved.candidates) found.add(candidate.skuId);
  }
  const [only] = found;
  return found.size === 1 && only !== undefined ? only : null;
}

/**
 * The date a document's codes resolve on: its report date, or undefined where the report gives none, so its codes
 * resolve to no SKU. Never the server's date (code-house-rules 9; PRD-MOD-009).
 */
function reportDateOf(document: HandlerDocument): string | undefined {
  return businessDateSchema.safeParse(document.reference).success ? document.reference : undefined;
}

export interface HistoricalReferenceDependencies {
  readonly audit: AuditInterface;
  readonly catalogue: Pick<CatalogueInterface, 'resolveCode'>;
}

/** The handler `ebo-imports` registers with files-imports at start, for one report kind. */
export function historicalReferenceHandler(
  kind: ReportKind,
  dependencies: HistoricalReferenceDependencies,
): ImportHandler {
  const fields = FIELDS[kind];
  return {
    target: REPORT_TARGETS[kind],
    recordType: REFERENCE_DOCUMENT_TYPE,
    // Historical reference only (4.1; PRD-IMP-010): never live stock, a receivable or a tax document.
    kinds: ['historical-reference'],
    effects: 'reference-records',
    fields,
    measures: MEASURES[kind],
    // A report's source identity is its kind and its Store, with the report date as the reference (7.1). A batch that
    // names no Store keeps its Store Unknown in the key, and cannot publish (`ebo-imports.store-not-named`).
    sourceScope: (document) => JSON.stringify([REFERENCE_DOCUMENT_TYPE, kind, document.place.storeId ?? null]),
    revisions: 'none',
    publishNeeds: (_context, document) =>
      Promise.resolve({ action: 'create', recordType: REFERENCE_DOCUMENT_TYPE, facts: document.place }),
    lockTargets: () => Promise.resolve([]),
    // A second person reviews the batch version before it is kept (PRD-IMP-005; product owner, 12 Oct 2026).
    review: () => ({ kind: 'approval', actionType: IMPORT_BATCH_APPROVAL, recordType: IMPORT_BATCH_TYPE }),
    suggestions: () => Promise.resolve([]),
    checkRuleTarget: (_context, field) =>
      Promise.resolve({
        kind: 'refused',
        code: 'files-imports.rule-attribute-unknown',
        missing: [{ kind: 'rule-attribute', field }],
      }),
    preview(_context, document) {
      const issues = issuesOf(document);
      if (issues.length > 0) return Promise.resolve({ kind: 'issues', issues });
      return Promise.resolve({
        kind: 'would-create',
        records: [{ recordType: REFERENCE_DOCUMENT_TYPE, codes: [document.reference] }],
      });
    },
    async publish(context, publisher, document, source) {
      const issues = issuesOf(document);
      if (issues.length > 0) {
        const [first] = issues;
        return {
          kind: 'refused',
          refusal: { kind: 'refused', code: first?.code ?? 'ebo-imports.identity-missing', missing: [] },
        };
      }
      const scope = {
        legalEntityId: document.place.legalEntityId ?? null,
        siteId: document.place.siteId ?? null,
        storeId: document.place.storeId ?? null,
        businessUnitId: document.place.businessUnitId ?? null,
      };
      const id = uuidv7();
      await context.tx.insert(referenceDocument).values({
        id,
        reportKind: kind,
        reference: document.reference,
        importBatchId: source.batchId,
        importBatchCode: source.batchCode,
        importDocumentId: document.documentId,
        publishedByUserId: publisher.userId,
        roleAssignmentId: publisher.roleAssignmentId,
        publishedAt: context.startedAt,
        ...scope,
      });
      const date = reportDateOf(document);
      const lines = [];
      for (const row of document.rows) {
        // The source words as given, the amount apart in paise (PRD-MOD-014).
        const values: Record<string, string | null> = {};
        for (const field of fields) {
          if (field.name !== 'amount') values[field.name] = knownValue(row.values[field.name]) ?? null;
        }
        lines.push({
          id: uuidv7(),
          referenceDocumentId: id,
          stagedRowId: row.stagedRowId,
          rowNumber: row.rowNumber,
          values,
          skuId: await skuOfBarcode(context, dependencies.catalogue, knownValue(row.values.barcode), date),
          amountPaise: kind === 'daily-sales' ? paiseOf(row) : null,
          ...scope,
        });
      }
      if (lines.length > 0) await context.tx.insert(referenceLine).values(lines);
      await dependencies.audit.record(context, {
        actor: { kind: 'user', id: publisher.userId },
        roleAssignmentId: publisher.roleAssignmentId,
        scope: document.place,
        record: { module: 'ebo-imports', type: REFERENCE_DOCUMENT_TYPE, id },
        operation: 'publish-reference',
        changes: [
          { kind: 'value', field: 'reportKind', before: null, after: kind },
          { kind: 'value', field: 'lines', before: null, after: lines.length },
        ],
        source: { kind: 'import', reference: source.batchCode, row: source.firstRowNumber },
      });
      return { kind: 'published', records: [{ recordType: REFERENCE_DOCUMENT_TYPE, recordId: id }] };
    },
    ...(kind === 'stock-on-hand'
      ? {
          comparison: {
            set: 'stock-on-hand' as const,
            fields: ['barcode', 'quantity'],
            async rows(context: TransactionContext, documents: readonly HandlerDocument[]): Promise<ComparisonRow[]> {
              const rows: ComparisonRow[] = [];
              for (const document of documents) {
                const date = reportDateOf(document);
                for (const row of document.rows) {
                  const barcode = knownValue(row.values.barcode) ?? null;
                  rows.push({
                    rowId: row.stagedRowId,
                    barcode,
                    skuId: await skuOfBarcode(context, dependencies.catalogue, barcode ?? undefined, date),
                    locationId: null,
                    quantity: wholeOf(row),
                  });
                }
              }
              return rows;
            },
          },
        }
      : {}),
  };
}
