import { sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import { recheckHidden, type FreezeTouch } from '../db/recheck-hidden.js';
import { heldOnce, reservableUnits } from '../domain/availability.js';

// The Availability read (stock-ledger 13.6, 6.2; S1-F10-T02): no lock, in the reader's transaction and under its
// actor, so row-level security filters what it counts (PRD-SEC-005; 14.3).

/** Availability at one balance key (13.6, 6.2; PRD-TRF-006, PRD-INT-005). */
export interface AvailabilityRow {
  readonly balanceId: string;
  readonly locationId: string | null;
  readonly condition: string;
  readonly receiptOriginId: string;
  readonly quantity: number;
  readonly acceptedQuantity: number;
  /** The covered quantity of the balance's receipt origin, wherever its units are (13.9). */
  readonly coveredQuantity: number;
  readonly reserved: number;
  /** Units held outside reservations, counted once (6.2). */
  readonly heldOutsideReservations: number;
  /** A count freeze covers it, whether or not the reader may see the freeze (8.1; DEC-117). */
  readonly frozen: boolean;
  /** What a transfer, supplier-return or offline reservation could take now (6.2, 6.3). */
  readonly available: number;
}

/**
 * Availability (13.6, 6.2): custody less reserved units and units held outside reservations, never below zero, given
 * coverage and acceptance: only good units, accepted at the Site and covered, the origin's covered quantity drawn on
 * once by every reservation of its units and by the rows before it here, and nothing while a count freeze covers the
 * units. So it is what a reservation could take (13.9). Holds and reservations the reader cannot see are not counted
 * here; the command's recheck under the locks counts them (DEC-117). Whatever freeze covers a balance marks it frozen,
 * through the narrowly authorised function, asked once for the whole read.
 */
export async function availability(
  context: TransactionContext,
  query: { readonly siteId: string; readonly businessUnitId: string; readonly skuId: string },
): Promise<{ readonly asOf: string; readonly rows: AvailabilityRow[] }> {
  const result = await context.tx.execute<{
    id: string;
    location_id: string | null;
    condition: string;
    receipt_origin_id: string;
    quantity: number;
    accepted_quantity: number;
    brand_id: string | null;
    reserved: number;
    held: number;
    covered: number;
    reserved_everywhere: number;
  }>(sql`
    select b.id, b.location_id, b.condition, b.receipt_origin_id, b.quantity, b.accepted_quantity, b.brand_id,
           coalesce((select sum(c.quantity) from stock.reservation_claim c
                     join stock.reservation r on r.id = c.reservation_id where c.balance_id = b.id), 0)::integer
             as reserved,
           coalesce((select sum(c.quantity) from stock.hold_claim c
                     join stock.hold h on h.id = c.hold_id
                     where c.balance_id = b.id and h.within_reservation_id is null), 0)::integer as held,
           coalesce((select s.covered_quantity from stock.receipt_origin_state s
                     where s.receipt_origin_id = b.receipt_origin_id), 0) as covered,
           coalesce((select sum(c.quantity) from stock.reservation_claim c
                     join stock.reservation r on r.id = c.reservation_id
                     join stock.balance o on o.id = c.balance_id
                     where o.receipt_origin_id = b.receipt_origin_id), 0)::integer as reserved_everywhere
    from stock.balance b
    where b.site_id = ${query.siteId}::uuid and b.business_unit_id = ${query.businessUnitId}::uuid
      and b.sku_id = ${query.skuId}::uuid and b.quantity > 0 and b.held_as = 'custody'
    order by b.expiry_date nulls last, b.count_date, b.id`);
  const touches = result.rows.flatMap((row, line) => {
    const at = { line, siteId: query.siteId, businessUnitId: query.businessUnitId };
    const members: FreezeTouch[] = [{ ...at, kind: 'sku', id: query.skuId }];
    if (row.location_id !== null) members.push({ ...at, kind: 'location', id: row.location_id });
    if (row.brand_id !== null) members.push({ ...at, kind: 'brand', id: row.brand_id });
    return members;
  });
  const frozen = new Set((await recheckHidden(context, { touches })).map((answer) => answer.line));
  // An origin's covered quantity is drawn on once: by its reservations everywhere, then by the rows before (13.9).
  const drawn = new Map<string, number>();
  const rows = result.rows.map((row, line): AvailabilityRow => {
    const claims = {
      quantity: row.quantity,
      accepted: row.accepted_quantity,
      reserved: row.reserved,
      holdClaims: row.held,
    };
    const before = drawn.get(row.receipt_origin_id) ?? 0;
    const isFrozen = frozen.has(line);
    const available =
      isFrozen || row.condition !== 'good'
        ? 0
        : reservableUnits(claims, { covered: row.covered, reservedEverywhere: row.reserved_everywhere + before });
    drawn.set(row.receipt_origin_id, before + available);
    return {
      balanceId: row.id,
      locationId: row.location_id,
      condition: row.condition,
      receiptOriginId: row.receipt_origin_id,
      quantity: row.quantity,
      acceptedQuantity: row.accepted_quantity,
      coveredQuantity: row.covered,
      reserved: row.reserved,
      heldOutsideReservations: heldOnce(claims),
      frozen: isFrozen,
      available,
    };
  });
  return { asOf: context.startedAt.toISOString(), rows };
}
