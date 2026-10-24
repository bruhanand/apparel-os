import { desc, eq, inArray } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { RecordFacts } from '../../access/index.js';
import type { AuditScope } from '../../audit/index.js';
import { grnPtMark, type PtMarkReason } from '../db/schema.js';
import { factsOf } from '../domain/facts.js';
import { grnRow } from './grns.js';

// What other modules read of a GRN around its PT (goods-in 5.1, 5.8; S2-F04-T02): the GRN itself, its number and
// scope facts, which the PT carries; and its "PT attached" mark now, with when, why and by whom it was last changed.
// Read under the reader's actor, so row-level security keeps out a GRN the reader may not see (code-house-rules 6.2).

type MarkRow = typeof grnPtMark.$inferSelect;

/** The newest change of a GRN's mark, or undefined while it was never set. */
export async function currentPtMark(context: TransactionContext, grnId: string): Promise<MarkRow | undefined> {
  const [row] = await context.tx
    .select()
    .from(grnPtMark)
    .where(eq(grnPtMark.grnId, grnId))
    .orderBy(desc(grnPtMark.changeNumber))
    .limit(1);
  return row;
}

/**
 * The PT revision whose "PT attached" mark is set now on each of the GRNs given, by GRN (goods-in 4.1, 4.8, 5.8): a PT
 * file is submitted for each, waiting for approval or approved (RR-584, RR-606). A GRN whose mark is not set is left out.
 */
export async function setMarksOf(
  context: TransactionContext,
  grnIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (grnIds.length === 0) return new Map();
  const rows = await context.tx
    .select({
      grnId: grnPtMark.grnId,
      change: grnPtMark.change,
      changeNumber: grnPtMark.changeNumber,
      ptRevisionId: grnPtMark.ptRevisionId,
    })
    .from(grnPtMark)
    .where(inArray(grnPtMark.grnId, [...new Set(grnIds)]));
  const newest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const known = newest.get(row.grnId);
    if (known === undefined || row.changeNumber > known.changeNumber) newest.set(row.grnId, row);
  }
  return new Map(
    [...newest.values()].filter((row) => row.change === 'set').map((row) => [row.grnId, row.ptRevisionId]),
  );
}

/** A GRN's "PT attached" mark now (goods-in 5.8): set by a PT revision, or not set; with its latest change. */
export type PtMark =
  | { readonly kind: 'not-set'; readonly lastChange?: PtMarkChangeView }
  | { readonly kind: 'set'; readonly ptRevisionId: string; readonly lastChange: PtMarkChangeView };

export interface PtMarkChangeView {
  readonly ptRevisionId: string;
  readonly reason: PtMarkReason;
  readonly changedBy: string;
  readonly occurredAt: string;
  readonly businessDate: string;
}

export async function ptMarkOf(context: TransactionContext, grnId: string): Promise<PtMark> {
  const row = await currentPtMark(context, grnId);
  if (row === undefined) return { kind: 'not-set' };
  const lastChange: PtMarkChangeView = {
    ptRevisionId: row.ptRevisionId,
    reason: row.reason,
    changedBy: row.changedByUserId,
    occurredAt: row.occurredAt.toISOString(),
    businessDate: row.businessDate,
  };
  return row.change === 'set'
    ? { kind: 'set', ptRevisionId: row.ptRevisionId, lastChange }
    : { kind: 'not-set', lastChange };
}

/** A GRN as `merchandise` · PT names it: its number, Arrival and scope facts, its brand among them (goods-in 5.7). */
export interface GrnForPt {
  readonly grnId: string;
  readonly number: string;
  readonly arrivalId: string;
  readonly facts: RecordFacts &
    AuditScope & {
      readonly siteId: string;
      readonly businessUnitId: string;
      readonly legalEntityId: string;
      readonly brandId: string;
    };
}

/** The GRN, as the reader may see it, or undefined. */
export async function grnForPt(context: TransactionContext, grnId: string): Promise<GrnForPt | undefined> {
  const row = await grnRow(context, grnId);
  if (row === undefined) return undefined;
  return {
    grnId: row.id,
    number: row.number,
    arrivalId: row.arrivalId,
    facts: {
      ...factsOf(row),
      siteId: row.siteId,
      businessUnitId: row.businessUnitId,
      legalEntityId: row.legalEntityId,
      brandId: row.brandId,
    },
  };
}
