import { sql } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../../kernel/index.js';
import type { Condition } from '../domain/request.js';

// The goods a PT revision covers (stock-ledger 13.6 "Coverage and acceptance", 13.20; goods-in 7.2, 7.3, 7.5;
// S2-F07-T01), for `receiving`'s scan-in: each origin the revision covers, its SKU and covered quantity, and each of its
// balances in custody with what is accepted and held there. Read through the narrowly authorised function
// `stock.pt_revision_goods` (migration 0111; DEC-117), so the answer does not depend on whether the reader may see the
// stock rows; it carries counts and identifiers only, never a cost, a value or an owner.

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
  /** The units the holds outside reservations claim on the balance, before they are counted once (6.2). */
  readonly held: number;
}

const CONDITIONS: readonly string[] = ['good', 'damaged', 'wrong', 'unidentified'];

export async function ptRevisionGoods(
  context: TransactionContext,
  ptRevisionIds: readonly string[],
): Promise<readonly PtRevisionGoods[]> {
  if (ptRevisionIds.length === 0) return [];
  // One bound parameter holding the array, as the damage reports' read passes its own (code-house-rules 3.4).
  const rows = await context.tx.execute<{
    pt_revision_id: string;
    receipt_origin_id: string;
    sku_id: string | null;
    covered: number;
    location_id: string | null;
    condition: string | null;
    quantity: number;
    accepted: number;
    held: number;
  }>(sql`select * from stock.pt_revision_goods(${sql.param([...new Set(ptRevisionIds)])}::uuid[])`);
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
      held: row.held,
    };
  });
}
