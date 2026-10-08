import { sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import { integerArray, textArray, uuidArray } from './sql.js';

// The one call of `stock.recheck_hidden`, the narrowly authorised function of DEC-117 (stock-ledger 13.9, 14.1;
// code-house-rules 6.2), made once per request or per read. Every value is a bound parameter (code-house-rules 3.4).

/** One member a line touches at a unit, for the count-freeze check (8.1). */
export interface FreezeTouch {
  readonly line: number;
  readonly siteId: string;
  readonly businessUnitId: string;
  readonly kind: 'location' | 'sku' | 'brand';
  readonly id: string;
}

export interface HiddenQuestion {
  readonly touches?: readonly FreezeTouch[];
  readonly takes?: readonly { readonly line: number; readonly balanceId: string; readonly spare: number }[];
  readonly pieces?: readonly { readonly line: number; readonly pieceId: string }[];
  readonly origins?: readonly {
    readonly line: number;
    readonly originId: string;
    readonly balanceId: string | null;
    readonly spare: number;
  }[];
  /** The balances whose claims the command counted itself (13.9). */
  readonly countedBalances?: readonly string[];
}

/** One answer: a count freeze the actor can see over the line, or `hidden` for anything it cannot. */
export interface HiddenAnswer {
  readonly line: number;
  readonly blocker: 'count-freeze' | 'hidden';
  readonly holdId: string | null;
}

export async function recheckHidden(context: TransactionContext, question: HiddenQuestion): Promise<HiddenAnswer[]> {
  const touches = question.touches ?? [];
  const takes = question.takes ?? [];
  const pieces = question.pieces ?? [];
  const origins = question.origins ?? [];
  if (touches.length + takes.length + pieces.length + origins.length === 0) return [];
  const result = await context.tx.execute<{ line: number; blocker: 'count-freeze' | 'hidden'; hold_id: string | null }>(
    sql`select line, blocker, hold_id from stock.recheck_hidden(
          ${integerArray(touches.map((each) => each.line))}, ${uuidArray(touches.map((each) => each.siteId))},
          ${uuidArray(touches.map((each) => each.businessUnitId))}, ${textArray(touches.map((each) => each.kind))},
          ${uuidArray(touches.map((each) => each.id))},
          ${integerArray(takes.map((each) => each.line))}, ${uuidArray(takes.map((each) => each.balanceId))},
          ${integerArray(takes.map((each) => each.spare))},
          ${integerArray(pieces.map((each) => each.line))}, ${uuidArray(pieces.map((each) => each.pieceId))},
          ${integerArray(origins.map((each) => each.line))}, ${uuidArray(origins.map((each) => each.originId))},
          ${uuidArray(origins.map((each) => each.balanceId))}, ${integerArray(origins.map((each) => each.spare))},
          ${uuidArray(question.countedBalances ?? [])})`,
  );
  return result.rows.map((row) => ({ line: row.line, blocker: row.blocker, holdId: row.hold_id }));
}
