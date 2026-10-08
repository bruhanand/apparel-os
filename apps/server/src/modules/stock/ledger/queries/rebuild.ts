import { sql, type SQL } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';

// Rebuild and compare (stock-ledger 13.6, 2.1, 11.7; S1-F10-T02): a read, in the reader's transaction and under its
// actor, that changes nothing.

/** One difference Rebuild and compare found: the projection row, what it holds and what the entries give. */
export interface RebuildDifference {
  readonly table: string;
  /** The projection row, or null where the entries give a row the projection lacks. */
  readonly id: string | null;
  readonly column: string;
  /** What the projection holds, or null where it lacks the row. */
  readonly stored: string | number | null;
  readonly rebuilt: string | number | null;
}

/** What Rebuild and compare answers (13.6): its as-of time, whether it saw only part, and the differences. */
export interface RebuildAnswer {
  readonly asOf: string;
  /** True when rows the reader cannot see were left out, so the answer covers only part (13.6; PRD-MOD-003). */
  readonly partial: boolean;
  readonly differences: RebuildDifference[];
}

/** A balance's key, as the legs carry it, matched null-safely to the balance `b` (14.2). */
const BALANCE_KEY = sql.raw(`k.site_id = b.site_id and k.business_unit_id = b.business_unit_id
  and k.location_id is not distinct from b.location_id and k.condition = b.condition and k.held_as = b.held_as
  and k.transit_kind is not distinct from b.transit_kind and k.transit_ref is not distinct from b.transit_ref
  and k.sku_id is not distinct from b.sku_id and k.batch_code is not distinct from b.batch_code
  and k.expiry_date is not distinct from b.expiry_date and k.receipt_origin_id = b.receipt_origin_id`);

/** The part of a balance's key acceptance carries, matched to the balance `b` (13.9). */
const ACCEPTED_KEY = sql.raw(`k.site_id = b.site_id and k.business_unit_id = b.business_unit_id
  and k.location_id is not distinct from b.location_id and k.condition = b.condition
  and k.receipt_origin_id = b.receipt_origin_id`);

const CHECKS: readonly { readonly table: string; readonly column: string; readonly query: SQL }[] = [
  {
    table: 'balance',
    column: 'quantity',
    query: sql`
      with k as (
        select l.site_id, l.business_unit_id, l.location_id, l.condition, l.held_as, l.transit_kind, l.transit_ref,
               l.sku_id, l.batch_code, l.expiry_date, l.receipt_origin_id,
               sum(case l.direction when 'in' then l.quantity else -l.quantity end)::integer as quantity
        from stock.movement_leg l
        group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)
      select t.id, t.stored, t.rebuilt from (
        select b.id, b.quantity as stored, coalesce((select k.quantity from k where ${BALANCE_KEY}), 0) as rebuilt
        from stock.balance b) t
      where t.stored <> t.rebuilt
      union all
      select null, null, k.quantity from k
      where k.quantity <> 0 and not exists (select 1 from stock.balance b where ${BALANCE_KEY})`,
  },
  {
    table: 'sku_balance',
    column: 'quantity',
    query: sql`
      with k as (
        select l.site_id, l.business_unit_id, l.sku_id,
               sum(case l.direction when 'in' then l.quantity else -l.quantity end)::integer as quantity
        from stock.movement_leg l group by 1, 2, 3)
      select s.id, s.quantity as stored, coalesce(k.quantity, 0) as rebuilt
      from stock.sku_balance s
      left join k on k.site_id = s.site_id and k.business_unit_id = s.business_unit_id
        and k.sku_id is not distinct from s.sku_id
      where s.quantity <> coalesce(k.quantity, 0)
      union all
      select null, null, k.quantity from k
      where k.quantity <> 0 and not exists (
        select 1 from stock.sku_balance s
        where s.site_id = k.site_id and s.business_unit_id = k.business_unit_id
          and s.sku_id is not distinct from k.sku_id)`,
  },
  {
    // Accepted units: what the acceptance records accepted at the balance's key, and what the legs carried in and out
    // of it with the goods (13.4 "Location move").
    table: 'balance',
    column: 'accepted_quantity',
    query: sql`
      with k as (
        select t.site_id, t.business_unit_id, t.location_id, t.condition, t.receipt_origin_id,
               sum(t.quantity)::integer as quantity
        from (
          select l.site_id, l.business_unit_id, l.location_id, l.condition, l.receipt_origin_id,
                 case l.direction when 'in' then l.accepted_quantity else -l.accepted_quantity end as quantity
          from stock.movement_leg l
          union all
          select a.site_id, a.business_unit_id, a.location_id, a.condition, a.receipt_origin_id, a.quantity
          from stock.acceptance a) t
        group by 1, 2, 3, 4, 5)
      select t.id, t.stored, t.rebuilt from (
        select b.id, b.accepted_quantity as stored,
               coalesce((select k.quantity from k where ${ACCEPTED_KEY}), 0) as rebuilt
        from stock.balance b) t
      where t.stored <> t.rebuilt
      union all
      select null, null, k.quantity from k
      where k.quantity <> 0 and not exists (select 1 from stock.balance b where ${ACCEPTED_KEY})`,
  },
  {
    table: 'receipt_origin_state',
    column: 'covered_quantity',
    query: sql`
      with k as (
        select c.receipt_origin_id,
               sum(case c.action when 'cover' then c.quantity else -c.quantity end)::integer as quantity
        from stock.coverage c group by 1)
      select s.id, s.covered_quantity as stored, coalesce(k.quantity, 0) as rebuilt
      from stock.receipt_origin_state s
      left join k on k.receipt_origin_id = s.receipt_origin_id
      where s.covered_quantity <> coalesce(k.quantity, 0)
      union all
      select null, null, k.quantity from k
      where k.quantity <> 0
        and not exists (select 1 from stock.receipt_origin_state s where s.receipt_origin_id = k.receipt_origin_id)`,
  },
  {
    table: 'hold_claim',
    column: 'quantity',
    query: sql`
      select t.id, t.stored, t.rebuilt from (
        select c.id, c.quantity as stored,
               c.claimed_quantity - coalesce((select sum(r.quantity) from stock.hold_release r
                                              where r.hold_claim_id = c.id), 0)::integer as rebuilt
        from stock.hold_claim c) t
      where t.stored <> t.rebuilt`,
  },
  {
    // What a reservation claim holds: what it claimed less its events, a move of its units included (13.9).
    table: 'reservation_claim',
    column: 'quantity',
    query: sql`
      select t.id, t.stored, t.rebuilt from (
        select c.id, c.quantity as stored,
               c.claimed_quantity - coalesce((select sum(e.quantity) from stock.reservation_event e
                                              where e.reservation_claim_id = c.id), 0)::integer as rebuilt
        from stock.reservation_claim c) t
      where t.stored <> t.rebuilt`,
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
      where (l.business_unit_id, l.location_id, l.condition)
        is distinct from (p.business_unit_id, p.location_id, p.condition)`,
  },
];

/**
 * Rebuild and compare (13.6, 2.1, 11.7; PRD-MOD-011, PRD-MOD-012): rebuilds the quantity projections from the entries
 * and compares both ways, changing nothing. Each SKU balance and balance is rebuilt from the movement legs, and a leg's
 * key with no projection row is a difference too; each balance's accepted quantity from the acceptance records and the
 * legs; each piece's place from its last movement; each origin's covered quantity from the coverage records, with
 * coverage of an origin that has no state row; and each claim from what it claimed less its releases and events. It
 * runs under its reader's actor and says when rows the reader cannot see were left out, through
 * `stock.rebuild_partial`, which answers only that (13.6; DEC-117). Run by tests and, later, a scheduled job.
 */
export async function rebuildAndCompare(context: TransactionContext): Promise<RebuildAnswer> {
  const differences: RebuildDifference[] = [];
  for (const check of CHECKS) {
    const result = await context.tx.execute<{
      id: string | null;
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
  const partial = await context.tx.execute<{ partial: boolean }>(sql`select stock.rebuild_partial() as partial`);
  return { asOf: context.startedAt.toISOString(), partial: partial.rows[0]?.partial ?? true, differences };
}
