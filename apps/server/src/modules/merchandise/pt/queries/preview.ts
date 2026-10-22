import { paise } from '@apparel-os/domain';
import { PT_IMPORT_TARGET, PT_PREVIEW_PAGE_CAP, type FieldClass, type PtPreview } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { HandlerBatch } from '../../../files-imports/index.js';
import { shownPaise } from './grn-pt.js';
import { ptPlanOf, type PtReceiving } from './plan.js';

// The preview of an uploaded PT file (goods-in 5.6 steps 2 and 3; S2-F04-T02): the batch as it stands, its validation
// report's issues by row and column, every problem of the file at once (PRD-IMP-007); and, for a file that passes them
// all and is not yet published, what submitting it would make, worked out again now as the handler's preview does: the
// rows a page at a time, the totals, the GRN's styles and sizes it covers, the new products it proposes, the repeated
// barcodes and the differences from existing products (5.5). Writes nothing. BASIC, P RATE and their totals are
// masked for a reader not granted cost, and MARGIN for one not granted margin (access-and-approvals 6; PRD-ACS-008).

export interface PreviewPage {
  /** The last row number of the page before. */
  readonly after?: number;
  readonly limit: number;
}

export async function ptPreviewOf(
  context: TransactionContext,
  receiving: PtReceiving,
  batch: HandlerBatch,
  page: PreviewPage,
  masked: ReadonlySet<FieldClass>,
): Promise<Omit<PtPreview, 'asOf'> | undefined> {
  const grnId = batch.subject?.recordId;
  if (batch.target !== PT_IMPORT_TARGET || grnId === undefined) return undefined;
  const base = {
    batchId: batch.batchId,
    batchCode: batch.code,
    batchVersionId: batch.versionId,
    batchState: batch.state,
    submitted: batch.submitted,
    grnId,
    issues: batch.issues.map((issue) => ({
      issueId: issue.issueId,
      class: issue.class,
      code: issue.code,
      severity: issue.severity,
      ...(issue.sheet === undefined ? {} : { sheet: issue.sheet }),
      ...(issue.rowNumber === undefined ? {} : { rowNumber: issue.rowNumber }),
      ...(issue.column === undefined ? {} : { column: issue.column }),
      ...(issue.field === undefined ? {} : { field: issue.field }),
      missing: issue.missing.map((item) => ({ ...item })),
      ...(issue.seenBy === undefined ? {} : { seenBy: issue.seenBy }),
    })),
  };
  const blocking = batch.issues.some((issue) => issue.severity === 'Blocking');
  const [document] = batch.documents;
  if (blocking || document === undefined || (batch.state !== 'Staged' && batch.state !== 'Validated')) {
    return { ...base, draft: null };
  }
  const plan = await ptPlanOf(context, receiving, document);
  if (plan.kind === 'issues') return { ...base, draft: null };
  const { draft } = plan;
  const limit = Math.min(page.limit, PT_PREVIEW_PAGE_CAP);
  const after = page.after ?? 0;
  const following = draft.rows.filter((row) => row.checked.rowNumber > after);
  const shown = following.slice(0, limit);
  const repeated = new Map<string, number[]>();
  for (const row of draft.rows) {
    if (!row.finding.repeated) continue;
    repeated.set(row.checked.barcode, [...(repeated.get(row.checked.barcode) ?? []), row.checked.rowNumber]);
  }
  return {
    ...base,
    draft: {
      totals: {
        rows: draft.totals.rows,
        pieces: draft.totals.pieces,
        mrpPaise: paise(draft.totals.mrpPaise),
        basicPaise: shownPaise(draft.totals.basicPaise, 'cost', masked),
        costPaise: shownPaise(draft.totals.costPaise, 'cost', masked),
      },
      coverage: draft.coverage.map((each) => ({ styleCode: each.styleCode, size: each.size, quantity: each.quantity })),
      newProducts: draft.proposals.map((each) => ({
        styleCode: each.styleCode,
        colour: each.colour.code,
        size: each.sizeCode,
        newStyle: each.existingStyleId === null,
        rowNumbers: [...each.rowNumbers],
      })),
      repeatedBarcodes: [...repeated].map(([barcode, rowNumbers]) => ({ barcode, rowNumbers })),
      differences: draft.rows.flatMap((row) =>
        row.finding.differences.map((each) => ({ rowNumber: row.checked.rowNumber, ...each })),
      ),
      rows: shown.map(({ checked, finding }) => ({
        rowNumber: checked.rowNumber,
        styleCode: checked.styleCode,
        size: checked.sizeCode,
        colour: checked.colourCode,
        barcode: checked.barcode,
        quantity: checked.quantity,
        mrpPaise: paise(checked.mrpPaise),
        basicPaise: shownPaise(checked.basicPaise, 'cost', masked),
        pRatePaise: shownPaise(checked.pRatePaise, 'cost', masked),
        margin: masked.has('margin')
          ? { kind: 'masked', fieldClass: 'margin' }
          : { kind: 'margin', value: checked.margin },
        product: finding.product.kind,
        repeated: finding.repeated,
      })),
      next: following.length > limit ? (shown.at(-1)?.checked.rowNumber ?? null) : null,
    },
  };
}
