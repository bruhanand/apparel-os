import { and, asc, eq, gt, sql, type SQL } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import { balance, movement, movementLeg, movementPiece, piece } from '../db/schema.js';
import { uuidArray } from '../db/sql.js';

// The ledger's reads (stock-ledger 13.6; S1-F10-T02): Custody, Piece, Availability, and Rebuild and compare over the
// quantity projections (2.1). They take no lock and run in the reader's transaction, under the reader's actor, so
// row-level security filters what each reader sees (PRD-SEC-005; 14.3). Each answers the time it was read. Reads as of
// an earlier time, Coverage and acceptance, Sellable, Ownership, Value and Inventory reconciliation arrive with the
// features that use them (S1-F10-T03 and later).

/** Custody at one balance key (13.6; PRD-STK-001, PRD-STK-002, PRD-STK-004). */
export interface CustodyRow {
  readonly siteId: string;
  readonly businessUnitId: string;
  readonly locationId: string | null;
  readonly condition: string;
  readonly heldAs: string;
  readonly skuId: string | null;
  readonly receiptOriginId: string;
  readonly batchCode: string | null;
  readonly expiryDate: string | null;
  readonly quantity: number;
  readonly acceptedQuantity: number;
}

export interface CustodyQuery {
  readonly siteId?: string;
  readonly businessUnitId?: string;
  readonly skuId?: string;
  readonly locationId?: string;
}

/** Custody (13.6): quantity by place, location, condition, how held, SKU and receipt origin, now. */
export async function custody(
  context: TransactionContext,
  query: CustodyQuery,
): Promise<{ readonly asOf: string; readonly rows: CustodyRow[] }> {
  const filters: SQL[] = [gt(balance.quantity, 0)];
  if (query.siteId !== undefined) filters.push(eq(balance.siteId, query.siteId));
  if (query.businessUnitId !== undefined) filters.push(eq(balance.businessUnitId, query.businessUnitId));
  if (query.skuId !== undefined) filters.push(eq(balance.skuId, query.skuId));
  if (query.locationId !== undefined) filters.push(eq(balance.locationId, query.locationId));
  const rows = await context.tx
    .select({
      siteId: balance.siteId,
      businessUnitId: balance.businessUnitId,
      locationId: balance.locationId,
      condition: balance.condition,
      heldAs: balance.heldAs,
      skuId: balance.skuId,
      receiptOriginId: balance.receiptOriginId,
      batchCode: balance.batchCode,
      expiryDate: balance.expiryDate,
      quantity: balance.quantity,
      acceptedQuantity: balance.acceptedQuantity,
    })
    .from(balance)
    .where(and(...filters))
    .orderBy(asc(balance.countDate), asc(balance.id));
  return { asOf: context.startedAt.toISOString(), rows };
}

/** Piece (13.6; PRD-MER-003): where a piece is, how held, its origin, coverage and acceptance, and its movements. */
export async function pieceByCode(context: TransactionContext, code: string) {
  const [row] = await context.tx.select().from(piece).where(eq(piece.code, code));
  if (row === undefined) return undefined;
  const movements = await context.tx
    .select({ id: movement.id, kind: movement.kind, recordedAt: movement.recordedAt })
    .from(movementPiece)
    .innerJoin(movement, eq(movement.id, movementPiece.movementId))
    .where(eq(movementPiece.pieceId, row.id))
    .orderBy(asc(movement.recordedAt), asc(movement.id));
  return {
    asOf: context.startedAt.toISOString(),
    id: row.id,
    code: row.code,
    skuId: row.skuId,
    receiptOriginId: row.receiptOriginId,
    siteId: row.siteId,
    businessUnitId: row.businessUnitId,
    locationId: row.locationId,
    condition: row.condition,
    heldAs: row.heldAs,
    inCustody: row.inCustody,
    ptRevisionId: row.ptRevisionId,
    acceptedSiteId: row.acceptedSiteId,
    movements: movements.map((each) => ({ id: each.id, kind: each.kind })),
  };
}

/** Availability at one balance key (13.6, 6.2; PRD-TRF-006, PRD-INT-005). */
export interface AvailabilityRow {
  readonly balanceId: string;
  readonly locationId: string | null;
  readonly condition: string;
  readonly receiptOriginId: string;
  readonly quantity: number;
  readonly reserved: number;
  readonly heldOutsideReservations: number;
  /** A count freeze covers it, whether or not the reader may see the freeze (8.1; DEC-117). */
  readonly frozen: boolean;
  readonly available: number;
}

/**
 * Availability (13.6, 6.2): custody less reserved units and units held outside reservations, never below zero, and
 * nothing while a count freeze covers the units. Holds and reservations the reader cannot see are not counted here;
 * the command's recheck under the locks counts them (DEC-117).
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
    brand_id: string | null;
    reserved: string;
    held: string;
  }>(sql`
    select b.id, b.location_id, b.condition, b.receipt_origin_id, b.quantity, b.brand_id,
           coalesce((select sum(c.quantity) from stock.reservation_claim c
                     join stock.reservation r on r.id = c.reservation_id where c.balance_id = b.id), 0) as reserved,
           coalesce((select sum(c.quantity) from stock.hold_claim c
                     join stock.hold h on h.id = c.hold_id
                     where c.balance_id = b.id and h.within_reservation_id is null), 0) as held
    from stock.balance b
    where b.site_id = ${query.siteId}::uuid and b.business_unit_id = ${query.businessUnitId}::uuid
      and b.sku_id = ${query.skuId}::uuid and b.quantity > 0 and b.held_as = 'custody'
    order by b.expiry_date nulls last, b.count_date, b.id`);
  const rows: AvailabilityRow[] = [];
  for (const row of result.rows) {
    const frozen = await context.tx.execute<{ blocker: string }>(
      sql`select blocker from stock.recheck_hidden(${query.siteId}::uuid, ${query.businessUnitId}::uuid,
            ${uuidArray(row.location_id === null ? [] : [row.location_id])}, ${uuidArray([query.skuId])},
            ${uuidArray(row.brand_id === null ? [] : [row.brand_id])}, '{}'::uuid[], '{}'::integer[], '{}'::uuid[])`,
    );
    const reserved = Number(row.reserved);
    const held = Number(row.held);
    const isFrozen = frozen.rows.length > 0;
    rows.push({
      balanceId: row.id,
      locationId: row.location_id,
      condition: row.condition,
      receiptOriginId: row.receipt_origin_id,
      quantity: row.quantity,
      reserved,
      heldOutsideReservations: held,
      frozen: isFrozen,
      available: isFrozen || row.condition !== 'good' ? 0 : Math.max(0, row.quantity - reserved - held),
    });
  }
  return { asOf: context.startedAt.toISOString(), rows };
}

/** One difference Rebuild and compare found: the projection row, what it holds and what the entries give. */
export interface RebuildDifference {
  readonly table: string;
  readonly id: string;
  readonly column: string;
  readonly stored: string | number | null;
  readonly rebuilt: string | number | null;
}

/**
 * Rebuild and compare (13.6, 2.1, 11.7; PRD-MOD-011, PRD-MOD-012): rebuilds the quantity projections from the entries
 * and compares, changing nothing: each SKU balance and balance from the movement legs, each balance's accepted
 * quantity from the acceptance records and the legs, each piece's place from its last movement, each origin's covered
 * quantity from the coverage records, and each claim from what it claimed less its releases and events. Answers the
 * differences; none when the projections are true. Run by tests and, later, a scheduled job (13.6).
 */
export async function rebuildAndCompare(context: TransactionContext): Promise<RebuildDifference[]> {
  const checks: { table: string; column: string; query: SQL }[] = [
    {
      table: 'balance',
      column: 'quantity',
      query: sql`
        with legs as (
          select l.site_id, l.business_unit_id, l.location_id, l.condition, l.held_as, l.transit_kind, l.transit_ref,
                 l.sku_id, l.batch_code, l.expiry_date, l.receipt_origin_id,
                 sum(case l.direction when 'in' then l.quantity else -l.quantity end) as quantity
          from ${movementLeg} l
          group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)
        select b.id, b.quantity as stored, coalesce(l.quantity, 0) as rebuilt
        from stock.balance b
        left join legs l on l.site_id = b.site_id and l.business_unit_id = b.business_unit_id
          and l.location_id is not distinct from b.location_id and l.condition = b.condition and l.held_as = b.held_as
          and l.transit_kind is not distinct from b.transit_kind and l.transit_ref is not distinct from b.transit_ref
          and l.sku_id is not distinct from b.sku_id and l.batch_code is not distinct from b.batch_code
          and l.expiry_date is not distinct from b.expiry_date and l.receipt_origin_id = b.receipt_origin_id
        where b.quantity <> coalesce(l.quantity, 0)`,
    },
    {
      table: 'sku_balance',
      column: 'quantity',
      query: sql`
        select s.id, s.quantity as stored, coalesce(sum(case l.direction when 'in' then l.quantity else -l.quantity end), 0) as rebuilt
        from stock.sku_balance s
        left join stock.movement_leg l on l.site_id = s.site_id and l.business_unit_id = s.business_unit_id
          and l.sku_id is not distinct from s.sku_id
        group by s.id, s.quantity
        having s.quantity <> coalesce(sum(case l.direction when 'in' then l.quantity else -l.quantity end), 0)`,
    },
    {
      // Accepted units: what the acceptance records accepted at the balance's key, and what the legs carried in and
      // out of it with the goods (13.4 "Location move").
      table: 'balance',
      column: 'accepted_quantity',
      query: sql`
        select * from (
        select b.id, b.accepted_quantity as stored,
               coalesce((select sum(case l.direction when 'in' then l.accepted_quantity else -l.accepted_quantity end)
                         from stock.movement_leg l
                         where l.site_id = b.site_id and l.business_unit_id = b.business_unit_id
                           and l.location_id is not distinct from b.location_id and l.condition = b.condition
                           and l.receipt_origin_id = b.receipt_origin_id), 0)
             + coalesce((select sum(a.quantity) from stock.acceptance a
                         where a.receipt_origin_id = b.receipt_origin_id and a.site_id = b.site_id
                           and a.business_unit_id = b.business_unit_id
                           and a.location_id is not distinct from b.location_id and a.condition = b.condition), 0)
               as rebuilt
        from stock.balance b) t
        where t.stored <> t.rebuilt`,
    },
    {
      table: 'receipt_origin_state',
      column: 'covered_quantity',
      query: sql`
        select s.id, s.covered_quantity as stored,
               coalesce((select sum(case c.action when 'cover' then c.quantity else -c.quantity end)
                         from stock.coverage c where c.receipt_origin_id = s.receipt_origin_id), 0) as rebuilt
        from stock.receipt_origin_state s
        where s.covered_quantity <> coalesce((select sum(case c.action when 'cover' then c.quantity else -c.quantity end)
                                              from stock.coverage c where c.receipt_origin_id = s.receipt_origin_id), 0)`,
    },
    {
      table: 'hold_claim',
      column: 'quantity',
      query: sql`
        select c.id, c.quantity as stored,
               c.claimed_quantity - coalesce((select sum(r.quantity) from stock.hold_release r where r.hold_claim_id = c.id), 0) as rebuilt
        from stock.hold_claim c
        where c.quantity <> c.claimed_quantity - coalesce((select sum(r.quantity) from stock.hold_release r where r.hold_claim_id = c.id), 0)`,
    },
    {
      table: 'reservation_claim',
      column: 'quantity',
      query: sql`
        select c.id, c.quantity as stored,
               c.claimed_quantity - coalesce((select sum(e.quantity) from stock.reservation_event e where e.reservation_claim_id = c.id), 0) as rebuilt
        from stock.reservation_claim c
        where c.quantity <> c.claimed_quantity - coalesce((select sum(e.quantity) from stock.reservation_event e where e.reservation_claim_id = c.id), 0)`,
    },
    {
      // A piece is where the in leg of its last movement put it (11.7: every piece is in exactly one place).
      table: 'piece',
      column: 'place',
      query: sql`
        select p.id,
               concat_ws('|', p.business_unit_id, p.location_id, p.condition) as stored,
               concat_ws('|', l.business_unit_id, l.location_id, l.condition) as rebuilt
        from stock.piece p
        join stock.movement_leg l on l.movement_id = p.last_movement_id and l.direction = 'in'
          and l.receipt_origin_id = p.receipt_origin_id
        where (l.business_unit_id, l.location_id, l.condition) is distinct from (p.business_unit_id, p.location_id, p.condition)`,
    },
  ];
  const differences: RebuildDifference[] = [];
  for (const check of checks) {
    const result = await context.tx.execute<{
      id: string;
      stored: string | number | null;
      rebuilt: string | number | null;
    }>(check.query);
    for (const row of result.rows) {
      differences.push({
        table: check.table,
        id: row.id,
        column: check.column,
        stored: row.stored,
        rebuilt: row.rebuilt,
      });
    }
  }
  return differences;
}
