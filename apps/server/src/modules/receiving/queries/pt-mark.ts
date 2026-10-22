import { desc, eq } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { RecordFacts } from '../../access/index.js';
import type { AuditScope } from '../../audit/index.js';
import { grn, grnPtMark, type PtMarkReason } from '../db/schema.js';
import { factsOf } from '../commands/common.js';

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
  return row.change === 'set' ? { kind: 'set', ptRevisionId: row.ptRevisionId, lastChange } : { kind: 'not-set', lastChange };
}

/** A GRN as `merchandise` · PT names it: its number, Arrival and scope facts (goods-in 5.7). */
export interface GrnForPt {
  readonly grnId: string;
  readonly number: string;
  readonly arrivalId: string;
  readonly brandId: string;
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
  const [row] = await context.tx.select().from(grn).where(eq(grn.id, grnId));
  if (row === undefined) return undefined;
  return {
    grnId: row.id,
    number: row.number,
    arrivalId: row.arrivalId,
    brandId: row.brandId,
    facts: { ...factsOf(row), siteId: row.siteId, businessUnitId: row.businessUnitId, legalEntityId: row.legalEntityId, brandId: row.brandId },
  };
}
