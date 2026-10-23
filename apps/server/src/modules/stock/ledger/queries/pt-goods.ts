import {
  STOCK_BALANCE_TYPE,
  STOCK_HOLD_TYPE,
  STOCK_RECEIPT_ORIGIN_TYPE,
  stockConditionSchema,
} from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../../kernel/index.js';
import type { Condition } from '../domain/request.js';

// The goods a PT revision covers (stock-ledger 13.6 "Coverage and acceptance", 13.20; goods-in 6.7, 7.2, 7.3, 7.5;
// S2-F07-T01, S2-F09-T01; code review 8 of stage 2), for `receiving`'s scan-in and `merchandise` · PT's reversal: each
// origin the revision covers, its SKU and covered quantity, and each of its balances in custody with what is accepted
// and held there. Read in the caller's transaction under the reader's own actor, so row-level security keeps out the
// rows the reader may not see (code-house-rules 6.2; PRD-SEC-005): counts and identifiers only, never a cost, a value or
// an owner. A caller that shows them asks first whether the reader's grants of view on `PT_GOODS_READS` cover the
// goods' facts; a PT's reversal also asks `ptGoodsNotWaiting`, the one narrowly authorised recheck, which answers only
// whether goods the actor may not see block it (DEC-117).

/**
 * The stock record types the read draws from (stock-ledger 14.3): the origins and their state, the balances, and the
 * holds with their claims. A reader whose grants of view on each cover the goods' place and brand sees every row of
 * them, so its counts leave out nothing but a hold whose brand set holds a brand outside the reader's (14.1).
 */
export const PT_GOODS_READS = [STOCK_RECEIPT_ORIGIN_TYPE, STOCK_BALANCE_TYPE, STOCK_HOLD_TYPE] as const;

/** One balance in custody of an origin a revision covers, or the origin alone when none of it is in custody. */
export interface PtRevisionGoods {
  readonly ptRevisionId: string;
  readonly receiptOriginId: string;
  readonly skuId: string;
  /** The origin's covered quantity, repeated on each of its rows. */
  readonly covered: number;
  /** The balance's location and condition; none for an origin with no balance in custody. */
  readonly locationId: string | null;
  readonly condition: Condition | null;
  readonly quantity: number;
  readonly accepted: number;
  /**
   * The units the damage holds outside reservations claim on the balance (goods-in 8; stock-ledger 6.1), and those of
   * every other hold outside reservations, before they are counted once (6.2).
   */
  readonly damageHeld: number;
  readonly otherHeld: number;
}

const CONDITIONS: readonly string[] = stockConditionSchema.options;

export async function ptRevisionGoods(
  context: TransactionContext,
  ptRevisionIds: readonly string[],
): Promise<readonly PtRevisionGoods[]> {
  if (ptRevisionIds.length === 0) return [];
  // One bound parameter holding the array, as the damage reports' read passes its own (code-house-rules 3.4). Every
  // table read here is scoped, so the reader's actor decides each row (code-house-rules 6.2).
  const rows = await context.tx.execute<{
    pt_revision_id: string;
    receipt_origin_id: string;
    sku_id: string | null;
    covered: number;
    location_id: string | null;
    condition: string | null;
    quantity: number;
    accepted: number;
    damage_held: number;
    other_held: number;
  }>(sql`
    select s.pt_revision_id, s.receipt_origin_id, o.sku_id, s.covered_quantity as covered,
           b.location_id, b.condition, coalesce(b.quantity, 0) as quantity,
           coalesce(b.accepted_quantity, 0) as accepted,
           coalesce((select sum(c.quantity) from stock.hold_claim c join stock.hold h on h.id = c.hold_id
                      where c.balance_id = b.id and h.within_reservation_id is null and h.kind = 'damage'), 0)::integer
             as damage_held,
           coalesce((select sum(c.quantity) from stock.hold_claim c join stock.hold h on h.id = c.hold_id
                      where c.balance_id = b.id and h.within_reservation_id is null and h.kind <> 'damage'), 0)::integer
             as other_held
    from stock.receipt_origin_state s
    join stock.receipt_origin o on o.id = s.receipt_origin_id
    left join stock.balance b
      on b.receipt_origin_id = s.receipt_origin_id and b.held_as = 'custody' and b.quantity > 0
    where s.pt_revision_id = any (${sql.param([...new Set(ptRevisionIds)])}::uuid[]) and s.covered_quantity > 0
    order by s.receipt_origin_id, b.id`);
  return rows.rows.map((row) => {
    // Coverage is recorded on an origin of a known SKU only (13.14), in a known condition (14.2).
    if (row.sku_id === null) throw new CommandDefect(`A covered origin has no SKU: ${row.receipt_origin_id}`);
    if (row.condition !== null && !CONDITIONS.includes(row.condition)) {
      throw new CommandDefect(`A balance in no known condition: ${row.condition}`);
    }
    return {
      ptRevisionId: row.pt_revision_id,
      receiptOriginId: row.receipt_origin_id,
      skuId: row.sku_id,
      covered: row.covered,
      locationId: row.location_id,
      condition: row.condition as Condition | null,
      quantity: row.quantity,
      accepted: row.accepted,
      damageHeld: row.damage_held,
      otherHeld: row.other_held,
    };
  });
}

/**
 * Whether any piece the revision covers is no longer waiting where its approval left it, whatever the actor may see
 * (goods-in 6.7, 8.4; RR-614): the narrowly authorised `stock.pt_goods_not_waiting` (migration 0111; code-house-rules
 * 6.2; DEC-117), for a PT reversal's checks under its locks, after the actor's own rows found none. It answers only
 * that, so the caller refuses generically, naming nothing the actor may not see.
 */
export async function ptGoodsNotWaiting(context: TransactionContext, ptRevisionId: string): Promise<boolean> {
  const result = await context.tx.execute<{ blocked: boolean }>(
    sql`select stock.pt_goods_not_waiting(${ptRevisionId}::uuid) as blocked`,
  );
  return result.rows[0]?.blocked === true;
}
