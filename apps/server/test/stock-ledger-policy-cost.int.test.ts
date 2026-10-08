import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYNTHETIC_MODULE } from './fixtures/stock-ledger.js';
import { connect } from './support/postgres.js';
import { StockWorld } from './support/stock-ledger.js';

// S1-F10 review (T3): the cost of the stock tables' row-level security policies on volume data (code-house-rules 6.2:
// "each scoped table's policy is checked with EXPLAIN on volume data before the table's first feature is accepted").
// The hot tables of the quantity operations, balance, sku_balance, movement_leg, hold_claim and reservation_claim, are
// filled as the owner with SYNTHETIC rows: 200 units at 50 Sites, 100 SKUs each, so 20,000 origins, SKU balances,
// balances, movements and legs, and 5,000 holds and 5,000 reservations with one claim each. A reader scoped to one Site
// then runs the queries the ledger runs, under EXPLAIN ANALYZE. The test asserts each plan reaches its rows by an index
// and checks the policy only on them; the times are recorded in the S1-F10-T01 ticket's Notes and are printed only when
// AOS_STOCK_POLICY_REPORT is 1.

const world = new StockWorld();
const UNITS = 200;
const SKUS = 100;

let site = '';
let unit = '';
let sku = '';
let balanceIds: string[] = [];

beforeAll(async () => {
  await world.start('stockpolicy');
  const owner = await connect(world.database, 'migration');
  try {
    await owner.query('begin');
    await owner.query(`
      create temp table syn_unit on commit drop as
        select n, pg_catalog.gen_random_uuid() as unit_id, ((n - 1) / 4) as site_n from generate_series(1, ${String(UNITS)}) n;
      create temp table syn_site on commit drop as
        select site_n, pg_catalog.gen_random_uuid() as site_id from (select distinct site_n from syn_unit) s;
      create temp table syn_sku on commit drop as
        select n, pg_catalog.gen_random_uuid() as sku_id from generate_series(1, ${String(SKUS)}) n;
      create temp table syn_row on commit drop as
        select row_number() over () as n, s.site_id, u.unit_id, k.sku_id,
               pg_catalog.gen_random_uuid() as origin_id, pg_catalog.gen_random_uuid() as total_id,
               pg_catalog.gen_random_uuid() as balance_id, pg_catalog.gen_random_uuid() as movement_id,
               pg_catalog.gen_random_uuid() as location_id
        from syn_unit u join syn_site s using (site_n) cross join syn_sku k;
      create temp table syn_const on commit drop as
        select pg_catalog.gen_random_uuid() as legal_entity_id, pg_catalog.gen_random_uuid() as brand_id,
               pg_catalog.gen_random_uuid() as book_id, pg_catalog.gen_random_uuid() as actor_id;`);
    await owner.query(`
      insert into stock.receipt_origin (id, origin_kind, source_module, source_record_type, source_record_id,
        source_version_id, source_line_id, source_import_kind, sku_id, sku_version_id, stock_unit, piece_tracked,
        batch_tracked, quantity, count_date, site_id, business_unit_id, legal_entity_id, brand_id, mapping_version_id,
        book_id, occurred_at)
      select r.origin_id, 'receipt', '${SYNTHETIC_MODULE}', 'document', r.origin_id, r.origin_id, r.origin_id, 'none',
             r.sku_id, r.sku_id, 'piece', false, false, 10, current_date, r.site_id, r.unit_id, c.legal_entity_id,
             c.brand_id, c.book_id, c.book_id, now()
      from syn_row r cross join syn_const c;
      insert into stock.sku_balance (id, site_id, business_unit_id, sku_id, stock_unit, quantity, legal_entity_id, brand_id)
      select r.total_id, r.site_id, r.unit_id, r.sku_id, 'piece', 10, c.legal_entity_id, c.brand_id
      from syn_row r cross join syn_const c;
      insert into stock.balance (id, sku_balance_id, site_id, business_unit_id, location_id, condition, held_as, sku_id,
        receipt_origin_id, count_date, quantity, accepted_quantity, legal_entity_id, brand_id)
      select r.balance_id, r.total_id, r.site_id, r.unit_id, r.location_id, 'good', 'custody', r.sku_id, r.origin_id,
             current_date, 10, 0, c.legal_entity_id, c.brand_id
      from syn_row r cross join syn_const c;
      insert into stock.movement (id, kind, source_module, source_record_type, source_record_id, source_version_id,
        source_line_id, source_import_kind, actor_user_id, role_assignment_id, business_date, occurred_at, site_id,
        business_unit_id, legal_entity_id, brand_ids)
      select r.movement_id, 'receipt-count', '${SYNTHETIC_MODULE}', 'document', r.origin_id, r.origin_id,
             r.origin_id, 'none', c.actor_id, c.actor_id, current_date, now(), r.site_id, r.unit_id,
             c.legal_entity_id, array[c.brand_id]
      from syn_row r cross join syn_const c;
      insert into stock.movement_leg (id, movement_id, direction, receipt_origin_id, sku_id, quantity,
        accepted_quantity, location_id, condition, held_as, book_id, site_id, business_unit_id, legal_entity_id,
        brand_id)
      select pg_catalog.gen_random_uuid(), r.movement_id, 'in', r.origin_id, r.sku_id, 10, 0, r.location_id, 'good',
             'custody', c.book_id, r.site_id, r.unit_id, c.legal_entity_id, c.brand_id
      from syn_row r cross join syn_const c;
      insert into stock.hold (id, kind, reason, source_module, source_record_type, source_record_id, source_version_id,
        source_line_id, source_import_kind, actor_user_id, role_assignment_id, business_date, occurred_at, site_id,
        business_unit_id, legal_entity_id, brand_ids)
      select r.movement_id, 'ordinary', 'SYNTHETIC volume', '${SYNTHETIC_MODULE}', 'document', r.origin_id,
             r.origin_id, r.origin_id, 'none', c.actor_id, c.actor_id, current_date, now(), r.site_id, r.unit_id,
             c.legal_entity_id, array[c.brand_id]
      from syn_row r cross join syn_const c where r.n % 4 = 0;
      insert into stock.hold_claim (id, hold_id, balance_id, quantity, claimed_quantity, site_id, business_unit_id,
        legal_entity_id, brand_id)
      select pg_catalog.gen_random_uuid(), r.movement_id, r.balance_id, 1, 1, r.site_id, r.unit_id, c.legal_entity_id,
             c.brand_id
      from syn_row r cross join syn_const c where r.n % 4 = 0;
      insert into stock.reservation (id, kind, source_module, source_record_type, source_record_id, source_version_id,
        source_line_id, source_import_kind, actor_user_id, role_assignment_id, business_date, occurred_at, site_id,
        business_unit_id, legal_entity_id, brand_ids)
      select r.movement_id, 'transfer', '${SYNTHETIC_MODULE}', 'document', r.origin_id, r.origin_id, r.origin_id,
             'none', c.actor_id, c.actor_id, current_date, now(), r.site_id, r.unit_id, c.legal_entity_id,
             array[c.brand_id]
      from syn_row r cross join syn_const c where r.n % 4 = 2;
      insert into stock.reservation_claim (id, reservation_id, balance_id, quantity, claimed_quantity, site_id,
        business_unit_id, legal_entity_id, brand_id)
      select pg_catalog.gen_random_uuid(), r.movement_id, r.balance_id, 2, 2, r.site_id, r.unit_id, c.legal_entity_id,
             c.brand_id
      from syn_row r cross join syn_const c where r.n % 4 = 2;`);
    const target = await owner.query<{ site_id: string; unit_id: string; sku_id: string }>(
      'select site_id, unit_id, sku_id from syn_row where n = 2',
    );
    const row = target.rows[0];
    if (row === undefined) throw new Error('no volume');
    site = row.site_id;
    unit = row.unit_id;
    sku = row.sku_id;
    const balances = await owner.query<{ balance_id: string }>(
      'select balance_id from syn_row where unit_id = $1 order by n limit 20',
      [unit],
    );
    balanceIds = balances.rows.map((each) => each.balance_id);
    await owner.query('commit');
    await owner.query(
      'analyze stock.balance, stock.sku_balance, stock.movement_leg, stock.hold_claim, stock.reservation_claim, stock.hold, stock.reservation',
    );
  } finally {
    await owner.end();
  }
}, 600_000);

afterAll(async () => {
  await world.stop();
});

interface PlanNode {
  readonly 'Node Type': string;
  readonly Filter?: string;
  readonly Plans?: PlanNode[];
}

function nodes(plan: PlanNode): PlanNode[] {
  return [plan, ...(plan.Plans ?? []).flatMap(nodes)];
}

describe('the stock policies on volume data (code-house-rules 6.2; stock-ledger 14.3)', () => {
  it('PRD-SEC-005 PRD-PRF-003 each hot query reaches its rows by an index and checks the policy only on them', async () => {
    const reader = await world.actor('POLICY-READER', {
      kind: 'dimensions',
      legalEntity: { kind: 'all' },
      place: { kind: 'selected', members: [{ type: 'site', id: site }] },
      brand: { kind: 'all' },
    });
    const ids = `{${balanceIds.join(',')}}`;
    const queries: { name: string; text: string; values: unknown[] }[] = [
      {
        name: 'sku_balance by Site, unit and SKU (Lock)',
        text: 'select id from stock.sku_balance where site_id = $1 and business_unit_id = $2 and sku_id = $3',
        values: [site, unit, sku],
      },
      {
        name: 'balance by SKU at a unit (Plan staleness)',
        text: 'select receipt_origin_id from stock.balance where site_id = $1 and business_unit_id = $2 and sku_id = $3 and quantity > 0',
        values: [site, unit, sku],
      },
      {
        name: 'balance by its SKU balances (Recheck)',
        text: 'select id from stock.balance where sku_balance_id = any (select id from stock.sku_balance where business_unit_id = $1)',
        values: [unit],
      },
      {
        name: 'hold_claim by balances (Recheck)',
        text: 'select c.id from stock.hold_claim c join stock.hold h on h.id = c.hold_id where c.quantity > 0 and c.balance_id = any ($1::uuid[])',
        values: [ids],
      },
      {
        name: 'reservation_claim by balances (Recheck)',
        text: 'select c.id from stock.reservation_claim c join stock.reservation r on r.id = c.reservation_id where c.quantity > 0 and c.balance_id = any ($1::uuid[])',
        values: [ids],
      },
      {
        name: 'movement_leg by unit and SKU (as-of reads)',
        text: 'select sum(quantity) from stock.movement_leg where business_unit_id = $1 and sku_id = $2',
        values: [unit, sku],
      },
    ];
    const runtime = await connect(world.database, 'runtime');
    const report: string[] = [];
    try {
      await runtime.query('begin');
      await runtime.query("select set_config('aos.actor_id', $1, true)", [reader.user.id]);
      await runtime.query("select set_config('aos.business_date', current_date::text, true)");
      for (const query of queries) {
        const explained = await runtime.query<{ 'QUERY PLAN': [{ Plan: PlanNode; 'Execution Time': number }] }>(
          `explain (analyze, format json) ${query.text}`,
          query.values,
        );
        const [top] = explained.rows[0]?.['QUERY PLAN'] ?? [];
        if (top === undefined) throw new Error('no plan');
        const all = nodes(top.Plan);
        expect(
          all.some((node) => node['Node Type'].includes('Index')),
          query.name,
        ).toBe(true);
        expect(
          all.some((node) => node['Node Type'] === 'Seq Scan' && node.Filter?.includes('row_visible') === true),
          query.name,
        ).toBe(false);
        report.push(
          `${query.name}: ${top['Execution Time'].toFixed(2)} ms, ${all.map((node) => node['Node Type']).join(' > ')}`,
        );
      }
      await runtime.query('rollback');
    } finally {
      await runtime.end();
    }
    if (process.env.AOS_STOCK_POLICY_REPORT === '1')
      console.log(`code-house-rules 6.2 policy cost\n${report.join('\n')}`);
  });
});
