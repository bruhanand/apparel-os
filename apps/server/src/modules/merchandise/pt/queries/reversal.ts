import type { PtReversalRead, PtReversalState, PtReversalSummary } from '@apparel-os/schemas';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { LatestRequest, RecordFacts } from '../../../access/index.js';
import type { ReceivingInterface } from '../../../receiving/index.js';
import { pt, ptApproval, ptOrigin, ptReversal, ptReversalDecision, ptRevision } from '../db/schema.js';
import type { ReversedOrigin } from '../domain/reversed.js';

// What a PT's reversal before the scan-in reads of its own records (goods-in 6.4, 6.7; S2-F09-T01), under the reader's
// actor, so row-level security keeps out a PT the reader may not see (code-house-rules 6.2): a reversal with its
// decision and the revision and PT it reverses; the reversals of revisions; and the new receipt origins of the
// reversed revisions, which a corrected PT's approval takes the pieces from (domain/reversed.ts).

export type ReversalRow = typeof ptReversal.$inferSelect;
export type ReversalDecisionRow = typeof ptReversalDecision.$inferSelect;

/** A reversal with its decision, once decided, and its state (design-language 7). */
export interface ReversalWithDecision {
  readonly reversal: ReversalRow;
  readonly decision: ReversalDecisionRow | undefined;
}

export const reversalStateOf = (decision: ReversalDecisionRow | undefined): PtReversalState =>
  decision === undefined ? 'Awaiting approval' : decision.outcome;

/** A reversal, its decision, and the PT and GRN of the revision it reverses, as the reader may see it; else undefined. */
export async function reversalOf(
  context: TransactionContext,
  reversalId: string,
): Promise<(ReversalWithDecision & { readonly ptId: string; readonly grnId: string }) | undefined> {
  const [reversal] = await context.tx.select().from(ptReversal).where(eq(ptReversal.id, reversalId));
  if (reversal === undefined) return undefined;
  const [owner] = await context.tx
    .select({ ptId: pt.id, grnId: pt.grnId })
    .from(ptRevision)
    .innerJoin(pt, eq(pt.id, ptRevision.ptId))
    .where(eq(ptRevision.id, reversal.ptRevisionId));
  if (owner === undefined) return undefined;
  const [decision] = await context.tx
    .select()
    .from(ptReversalDecision)
    .where(eq(ptReversalDecision.ptReversalId, reversalId));
  return { reversal, decision, ...owner };
}

/** The reversals of each revision given, newest first, each with its decision (goods-in 6.7). */
export async function reversalsOf(
  context: TransactionContext,
  revisionIds: readonly string[],
): Promise<ReadonlyMap<string, readonly ReversalWithDecision[]>> {
  const found = new Map<string, ReversalWithDecision[]>();
  if (revisionIds.length === 0) return found;
  const rows = await context.tx
    .select({ reversal: ptReversal, decision: ptReversalDecision })
    .from(ptReversal)
    .leftJoin(ptReversalDecision, eq(ptReversalDecision.ptReversalId, ptReversal.id))
    .where(inArray(ptReversal.ptRevisionId, [...revisionIds]))
    // By the time it was proposed (code-house-rules 9), the identifier only breaking a tie.
    .orderBy(desc(ptReversal.proposedAt), desc(ptReversal.id));
  for (const row of rows) {
    const of = found.get(row.reversal.ptRevisionId) ?? [];
    of.push({ reversal: row.reversal, decision: row.decision ?? undefined });
    found.set(row.reversal.ptRevisionId, of);
  }
  return found;
}

/** Whether a reversal of the revision was approved: the revision is then Reversed (goods-in 6.7). */
export const reversedBy = (reversals: readonly ReversalWithDecision[] | undefined): boolean =>
  (reversals ?? []).some((each) => each.decision?.outcome === 'Approved');

/** A reversal as its PT's screen and the approval panel show it, with its latest approval request (goods-in 6.7). */
export function reversalSummary(each: ReversalWithDecision, request: LatestRequest | undefined): PtReversalSummary {
  const { reversal, decision } = each;
  return {
    reversalId: reversal.id,
    state: reversalStateOf(decision),
    reason: reversal.reason,
    proposedBy: reversal.proposedByUserId,
    proposedAt: reversal.proposedAt.toISOString(),
    ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
    ...(decision === undefined
      ? {}
      : { decided: { by: decision.decidedByUserId, at: decision.decidedAt.toISOString() } }),
  };
}

/**
 * The new receipt origins the identity step of every reversed revision of the PT made, each with the origin it was
 * made from, its SKU and its pieces (goods-in 6.7; stock-ledger 13.19): where a corrected PT takes the pieces from.
 */
export async function reversedOriginsOf(context: TransactionContext, ptId: string): Promise<readonly ReversedOrigin[]> {
  return context.tx
    .select({
      parentReceiptOriginId: ptOrigin.parentReceiptOriginId,
      receiptOriginId: ptOrigin.receiptOriginId,
      skuId: ptOrigin.skuId,
      quantity: ptOrigin.quantity,
    })
    .from(ptOrigin)
    .innerJoin(ptApproval, eq(ptApproval.id, ptOrigin.ptApprovalId))
    .innerJoin(ptRevision, eq(ptRevision.id, ptApproval.ptRevisionId))
    .innerJoin(ptReversal, eq(ptReversal.ptApprovalId, ptApproval.id))
    .innerJoin(
      ptReversalDecision,
      and(eq(ptReversalDecision.ptReversalId, ptReversal.id), eq(ptReversalDecision.outcome, 'Approved')),
    )
    .where(eq(ptRevision.ptId, ptId))
    .orderBy(ptOrigin.id);
}

/** A reversal's scope facts, which its routes authorise with, as the reader may see it; else undefined. */
export async function reversalFacts(context: TransactionContext, reversalId: string): Promise<RecordFacts | undefined> {
  const [row] = await context.tx.select().from(ptReversal).where(eq(ptReversal.id, reversalId));
  if (row === undefined) return undefined;
  const { siteId, storeId, businessUnitId, legalEntityId, brandId } = row;
  return { siteId, businessUnitId, legalEntityId, brandId, ...(storeId === null ? {} : { storeId }) };
}

/**
 * A reversal as its approver reads it in My work (goods-in 6.7, section 11): the PT, the revision it reverses with the
 * PT's number, the GRN, and the reversal; undefined when the reader may not see it.
 */
export async function reversalView(
  context: TransactionContext,
  receiving: Pick<ReceivingInterface, 'grnForPt'>,
  reversalId: string,
  request: LatestRequest | undefined,
): Promise<{ readonly view: Omit<PtReversalRead, 'asOf' | 'people'>; readonly people: readonly string[] } | undefined> {
  const found = await reversalOf(context, reversalId);
  if (found === undefined) return undefined;
  const grn = await receiving.grnForPt(context, found.grnId);
  const [approval] = await context.tx
    .select({ number: ptApproval.number })
    .from(ptApproval)
    .where(eq(ptApproval.id, found.reversal.ptApprovalId));
  if (grn === undefined || approval === undefined) return undefined;
  return {
    view: {
      ptId: found.ptId,
      revisionId: found.reversal.ptRevisionId,
      number: approval.number,
      grn: { grnId: grn.grnId, number: grn.number },
      reversal: reversalSummary(found, request),
    },
    people: [
      found.reversal.proposedByUserId,
      ...(found.decision === undefined ? [] : [found.decision.decidedByUserId]),
    ],
  };
}

/** The new receipt origins a revision's approval made, by their identifier, the coverage and cost items' line. */
export async function originsOfApproval(context: TransactionContext, ptApprovalId: string) {
  return context.tx.select().from(ptOrigin).where(eq(ptOrigin.ptApprovalId, ptApprovalId)).orderBy(ptOrigin.id);
}
