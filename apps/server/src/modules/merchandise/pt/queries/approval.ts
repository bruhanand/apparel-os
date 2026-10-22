import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import {
  pt,
  ptApproval,
  ptCoverage,
  ptPostingFailure,
  ptPostRequest,
  ptProposedSku,
  ptRejection,
  ptRevision,
  ptRevisionWithdrawal,
  ptRow,
} from '../db/schema.js';

// What a PT revision's approval reads of its own records (goods-in 6.3, 6.6; S2-F06-T01), under the reader's actor,
// so row-level security keeps out a revision the reader may not see (code-house-rules 6.2): the revision with its PT,
// whether it is the PT's newest and what ended it, if anything; its coverage, rows and proposed products; and the rows
// its decision locks at step 1 besides its own.

export type RevisionRow = typeof ptRevision.$inferSelect;
export type CoverageRow = typeof ptCoverage.$inferSelect;
export type ProposalRow = typeof ptProposedSku.$inferSelect;

/** A row of the revision as the approval reads it: its product, its values and its coverage (goods-in 5.7). */
export interface ApprovalRow {
  readonly id: string;
  readonly lineNumber: number;
  readonly rowNumber: number;
  readonly stagedRowId: string;
  readonly ptCoverageId: string;
  readonly skuId: string | null;
  readonly ptProposedSkuId: string | null;
  readonly barcode: string;
  readonly barcodeMapped: boolean;
  readonly quantity: number;
  readonly pRatePaise: number;
  readonly categoryId: string;
  readonly hsn: string;
  readonly seasonValueId: string;
  readonly genderValueId: string;
  readonly typeValueId: string;
  readonly itemValueId: string;
  readonly fitValueId: string;
  readonly colourValueId: string;
  readonly sizeCode: string;
}

/** A revision with its PT and how it stands: the PT's newest or not, withdrawn, rejected, posted, or waiting. */
export interface RevisionStanding {
  readonly revision: RevisionRow;
  readonly grnId: string;
  readonly newest: boolean;
  readonly withdrawn: boolean;
  readonly rejected: boolean;
  readonly approval: typeof ptApproval.$inferSelect | undefined;
  /** The latest request to post it through a queued job, and that request's failure, if any. */
  readonly postRequest: typeof ptPostRequest.$inferSelect | undefined;
  readonly failure: typeof ptPostingFailure.$inferSelect | undefined;
}

export async function revisionStanding(
  context: TransactionContext,
  revisionId: string,
): Promise<RevisionStanding | undefined> {
  const [revision] = await context.tx.select().from(ptRevision).where(eq(ptRevision.id, revisionId));
  if (revision === undefined) return undefined;
  const [owner] = await context.tx.select({ grnId: pt.grnId }).from(pt).where(eq(pt.id, revision.ptId));
  if (owner === undefined) return undefined;
  const [newest] = await context.tx
    .select({ id: ptRevision.id })
    .from(ptRevision)
    .where(eq(ptRevision.ptId, revision.ptId))
    .orderBy(desc(ptRevision.revisionNumber))
    .limit(1);
  const [withdrawn] = await context.tx
    .select({ id: ptRevisionWithdrawal.id })
    .from(ptRevisionWithdrawal)
    .where(eq(ptRevisionWithdrawal.ptRevisionId, revisionId));
  const [rejected] = await context.tx
    .select({ id: ptRejection.id })
    .from(ptRejection)
    .where(eq(ptRejection.ptRevisionId, revisionId));
  const [approval] = await context.tx.select().from(ptApproval).where(eq(ptApproval.ptRevisionId, revisionId));
  // By the time it was asked (code-house-rules 9), the identifier only breaking a tie.
  const [postRequest] = await context.tx
    .select()
    .from(ptPostRequest)
    .where(eq(ptPostRequest.ptRevisionId, revisionId))
    .orderBy(desc(ptPostRequest.requestedAt), desc(ptPostRequest.id))
    .limit(1);
  const [failure] =
    postRequest === undefined
      ? []
      : await context.tx.select().from(ptPostingFailure).where(eq(ptPostingFailure.ptPostRequestId, postRequest.id));
  return {
    revision,
    grnId: owner.grnId,
    newest: newest?.id === revisionId,
    withdrawn: withdrawn !== undefined,
    rejected: rejected !== undefined,
    approval,
    postRequest,
    failure,
  };
}

/** The revision's coverage, rows in the file's order and proposed products (goods-in 5.7). */
export async function revisionContent(
  context: TransactionContext,
  revisionId: string,
): Promise<{
  readonly coverage: readonly CoverageRow[];
  readonly rows: readonly ApprovalRow[];
  readonly proposals: readonly ProposalRow[];
}> {
  const coverage = await context.tx
    .select()
    .from(ptCoverage)
    .where(eq(ptCoverage.ptRevisionId, revisionId))
    .orderBy(asc(ptCoverage.lineNumber));
  const rows = await context.tx
    .select({
      id: ptRow.id,
      lineNumber: ptRow.lineNumber,
      rowNumber: ptRow.rowNumber,
      stagedRowId: ptRow.stagedRowId,
      ptCoverageId: ptRow.ptCoverageId,
      skuId: ptRow.skuId,
      ptProposedSkuId: ptRow.ptProposedSkuId,
      barcode: ptRow.barcode,
      barcodeMapped: ptRow.barcodeMapped,
      quantity: ptRow.quantity,
      pRatePaise: ptRow.pRatePaise,
      categoryId: ptRow.categoryId,
      hsn: ptRow.hsn,
      seasonValueId: ptRow.seasonValueId,
      genderValueId: ptRow.genderValueId,
      typeValueId: ptRow.typeValueId,
      itemValueId: ptRow.itemValueId,
      fitValueId: ptRow.fitValueId,
      colourValueId: ptRow.colourValueId,
      sizeCode: ptRow.sizeCode,
    })
    .from(ptRow)
    .where(eq(ptRow.ptRevisionId, revisionId))
    .orderBy(asc(ptRow.lineNumber));
  const proposals = await context.tx
    .select()
    .from(ptProposedSku)
    .where(eq(ptProposedSku.ptRevisionId, revisionId))
    .orderBy(asc(ptProposedSku.lineNumber));
  return { coverage, rows, proposals };
}

/** What decided each revision given, for the GRN's screen (goods-in 6.6): its rejection, approval and posting. */
export async function decidedOf(
  context: TransactionContext,
  revisionIds: readonly string[],
): Promise<
  ReadonlyMap<
    string,
    {
      readonly rejected: boolean;
      readonly number: string | undefined;
      readonly postRequested: boolean;
      readonly failed: boolean;
    }
  >
> {
  const decided = new Map<
    string,
    { rejected: boolean; number: string | undefined; postRequested: boolean; failed: boolean }
  >();
  if (revisionIds.length === 0) return decided;
  const ids = [...revisionIds];
  for (const id of ids) decided.set(id, { rejected: false, number: undefined, postRequested: false, failed: false });
  const rejections = await context.tx
    .select({ id: ptRejection.ptRevisionId })
    .from(ptRejection)
    .where(inArray(ptRejection.ptRevisionId, ids));
  for (const row of rejections) {
    const each = decided.get(row.id);
    if (each !== undefined) each.rejected = true;
  }
  const approvals = await context.tx
    .select({ id: ptApproval.ptRevisionId, number: ptApproval.number })
    .from(ptApproval)
    .where(inArray(ptApproval.ptRevisionId, ids));
  for (const row of approvals) {
    const each = decided.get(row.id);
    if (each !== undefined) each.number = row.number;
  }
  // The latest request of each, and whether it was refused.
  const requests = await context.tx
    .selectDistinctOn([ptPostRequest.ptRevisionId], {
      id: ptPostRequest.ptRevisionId,
      requestId: ptPostRequest.id,
    })
    .from(ptPostRequest)
    .where(inArray(ptPostRequest.ptRevisionId, ids))
    .orderBy(ptPostRequest.ptRevisionId, desc(ptPostRequest.requestedAt), desc(ptPostRequest.id));
  const failures =
    requests.length === 0
      ? []
      : await context.tx
          .select({ requestId: ptPostingFailure.ptPostRequestId })
          .from(ptPostingFailure)
          .where(
            inArray(
              ptPostingFailure.ptPostRequestId,
              requests.map((row) => row.requestId),
            ),
          );
  for (const row of requests) {
    const each = decided.get(row.id);
    if (each === undefined) continue;
    each.postRequested = true;
    each.failed = failures.some((failure) => failure.requestId === row.requestId);
  }
  return decided;
}

/** How many rows the revision has, which decides whether its approval posts with its decision (goods-in 6.6). */
export async function revisionRowCount(context: TransactionContext, revisionId: string): Promise<number> {
  const [row] = await context.tx
    .select({ count: sql<number>`count(*)::int` })
    .from(ptRow)
    .where(eq(ptRow.ptRevisionId, revisionId));
  return row?.count ?? 0;
}

/** What the decision locks at step 1 besides the PT's and the GRN's rows: the products' styles and the barcodes. */
export async function productTargetsOf(
  context: TransactionContext,
  revisionId: string,
): Promise<{ readonly existingStyleIds: readonly string[]; readonly barcodes: readonly string[] }> {
  const styles = await context.tx
    .selectDistinct({ id: ptProposedSku.existingStyleId })
    .from(ptProposedSku)
    .where(eq(ptProposedSku.ptRevisionId, revisionId));
  const barcodes = await context.tx
    .selectDistinct({ barcode: ptRow.barcode })
    .from(ptRow)
    .where(eq(ptRow.ptRevisionId, revisionId));
  return {
    existingStyleIds: styles.flatMap((row) => (row.id === null ? [] : [row.id])),
    barcodes: barcodes.map((row) => row.barcode),
  };
}
