import { paise } from '@apparel-os/domain';
import { PT_REVISION_ROWS_PAGE_CAP, type FieldClass, type PtRevisionRead } from '@apparel-os/schemas';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { LatestRequest } from '../../../access/index.js';
import { skuCodesOf } from '../../catalogue/index.js';
import type { ReceivingInterface } from '../../../receiving/index.js';
import { ptProduct, ptProposedSku, ptRow } from '../db/schema.js';
import { revisionStateOf } from '../domain/state.js';
import { reversalsOf, reversedBy } from './reversal.js';
import { revisionStanding } from './approval.js';
import { shownPaise } from './grn-pt.js';

// A PT revision as its approver reviews it in My work and its GRN's screen shows it (goods-in 6.2, 6.6, section 11;
// S2-F06-T01): read under the reader's actor, so row-level security keeps out a revision the reader may not see
// (code-house-rules 6.2). The GRN with its Arrival, whose invoices and photos the Arrival's own read shows; its state and
// number; the totals, BASIC and P RATE side by side (DEC-140); the new products, each with the SKU code its approval
// generated; the repeated barcodes and the differences; and the rows a page at a time by a cursor, at most
// PT_REVISION_ROWS_PAGE_CAP (code-house-rules 12.1). BASIC, P RATE and their totals are masked for a reader not granted
// cost, MARGIN for one not granted margin (access-and-approvals 6; PRD-ACS-008). Writes nothing.

export interface RevisionPage {
  /** The last row number of the page before. */
  readonly after?: number;
  readonly limit: number;
}

export async function revisionReview(
  context: TransactionContext,
  receiving: Pick<ReceivingInterface, 'grnForPt'>,
  revisionId: string,
  request: LatestRequest | undefined,
  page: RevisionPage,
  masked: ReadonlySet<FieldClass>,
): Promise<{ readonly view: Omit<PtRevisionRead, 'asOf' | 'people'>; readonly people: readonly string[] } | undefined> {
  const standing = await revisionStanding(context, revisionId);
  if (standing === undefined) return undefined;
  const grn = await receiving.grnForPt(context, standing.grnId);
  if (grn === undefined) return undefined;
  const { revision } = standing;
  const rows = await context.tx
    .select({
      rowNumber: ptRow.rowNumber,
      styleCode: ptRow.styleCode,
      sizeCode: ptRow.sizeCode,
      colourCode: ptRow.colourCode,
      barcode: ptRow.barcode,
      quantity: ptRow.quantity,
      mrpPaise: ptRow.mrpPaise,
      basicPaise: ptRow.basicPaise,
      pRatePaise: ptRow.pRatePaise,
      margin: ptRow.margin,
      skuId: ptRow.skuId,
      ptProposedSkuId: ptRow.ptProposedSkuId,
      barcodeRepeated: ptRow.barcodeRepeated,
    })
    .from(ptRow)
    .where(and(eq(ptRow.ptRevisionId, revisionId), gt(ptRow.rowNumber, page.after ?? 0)))
    .orderBy(asc(ptRow.rowNumber))
    .limit(Math.min(page.limit, PT_REVISION_ROWS_PAGE_CAP) + 1);
  const limit = Math.min(page.limit, PT_REVISION_ROWS_PAGE_CAP);
  const shown = rows.slice(0, limit);
  const [counted] = await context.tx
    .select({ count: sql<number>`count(*)::int` })
    .from(ptRow)
    .where(eq(ptRow.ptRevisionId, revisionId));
  // The rows that propose a product, repeat a barcode or differ from their product, whatever the page.
  const marked = await context.tx
    .select({
      rowNumber: ptRow.rowNumber,
      barcode: ptRow.barcode,
      barcodeRepeated: ptRow.barcodeRepeated,
      ptProposedSkuId: ptRow.ptProposedSkuId,
      sizeCode: ptRow.sizeCode,
      colourCode: ptRow.colourCode,
      detail: ptRow.detail,
    })
    .from(ptRow)
    .where(
      and(
        eq(ptRow.ptRevisionId, revisionId),
        sql`(${ptRow.ptProposedSkuId} is not null or ${ptRow.barcodeRepeated}
          or jsonb_array_length(${ptRow.detail} -> 'differences') > 0)`,
      ),
    )
    .orderBy(asc(ptRow.rowNumber));
  const proposals = await context.tx
    .select()
    .from(ptProposedSku)
    .where(eq(ptProposedSku.ptRevisionId, revisionId))
    .orderBy(asc(ptProposedSku.lineNumber));
  const confirmed =
    standing.approval === undefined
      ? []
      : await context.tx
          .select({ proposalId: ptProduct.ptProposedSkuId, skuId: ptProduct.skuId })
          .from(ptProduct)
          .where(eq(ptProduct.ptApprovalId, standing.approval.id));
  const codes = await skuCodesOf(
    context,
    confirmed.map((each) => each.skuId),
  );
  const repeated = new Map<string, number[]>();
  for (const row of marked) {
    if (row.barcodeRepeated) repeated.set(row.barcode, [...(repeated.get(row.barcode) ?? []), row.rowNumber]);
  }
  const people = [revision.uploadedByUserId];
  return {
    view: {
      ptId: revision.ptId,
      revisionId,
      revisionNumber: revision.revisionNumber,
      state: revisionStateOf({
        withdrawn: standing.withdrawn,
        approved: standing.approval !== undefined,
        rejected: standing.rejected,
        postRequested: standing.postRequest !== undefined,
        failed: standing.failure !== undefined,
        reversed: reversedBy((await reversalsOf(context, [revisionId])).get(revisionId)),
      }),
      number: standing.approval?.number ?? null,
      grn: { grnId: grn.grnId, number: grn.number, arrivalId: grn.arrivalId },
      uploadedBy: revision.uploadedByUserId,
      submittedAt: revision.submittedAt.toISOString(),
      ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
      ...(standing.failure === undefined || standing.approval !== undefined
        ? {}
        : {
            failure: {
              code: standing.failure.code,
              missing: standing.failure.missing.map((item) => ({ ...item })),
              at: standing.failure.failedAt.toISOString(),
            },
          }),
      totals: {
        rows: counted?.count ?? 0,
        pieces: revision.pieces,
        mrpPaise: paise(revision.mrpPaise),
        basicPaise: shownPaise(revision.basicPaise, 'cost', masked),
        costPaise: shownPaise(revision.costPaise, 'cost', masked),
      },
      newProducts: proposals.flatMap((proposal) => {
        const of = marked.filter((row) => row.ptProposedSkuId === proposal.id);
        const [first] = of;
        if (first === undefined) return [];
        const skuId = confirmed.find((each) => each.proposalId === proposal.id)?.skuId;
        const skuCode = skuId === undefined ? undefined : codes.get(skuId);
        return [
          {
            styleCode: proposal.styleCode,
            colour: first.colourCode,
            size: first.sizeCode,
            newStyle: proposal.existingStyleId === null,
            rowNumbers: of.map((row) => row.rowNumber),
            ...(skuCode === undefined ? {} : { skuCode }),
          },
        ];
      }),
      repeatedBarcodes: [...repeated].map(([barcode, rowNumbers]) => ({ barcode, rowNumbers })),
      differences: marked.flatMap((row) =>
        row.detail.differences.map((each) => ({
          rowNumber: row.rowNumber,
          field: each.field,
          file: each.file,
          product: each.product,
        })),
      ),
      rows: shown.map((row) => ({
        rowNumber: row.rowNumber,
        styleCode: row.styleCode,
        size: row.sizeCode,
        colour: row.colourCode,
        barcode: row.barcode,
        quantity: row.quantity,
        mrpPaise: paise(row.mrpPaise),
        basicPaise: shownPaise(row.basicPaise, 'cost', masked),
        pRatePaise: shownPaise(row.pRatePaise, 'cost', masked),
        margin: masked.has('margin') ? { kind: 'masked', fieldClass: 'margin' } : { kind: 'margin', value: row.margin },
        product: row.ptProposedSkuId === null ? 'existing' : 'proposed',
        repeated: row.barcodeRepeated,
      })),
      next: rows.length > limit ? (shown.at(-1)?.rowNumber ?? null) : null,
    },
    people,
  };
}
