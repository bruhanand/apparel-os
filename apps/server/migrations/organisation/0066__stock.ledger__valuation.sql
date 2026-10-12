-- The stock ledger's valued operations (stock-ledger 7, 13.4, 13.6, 14.2; books-and-posting 8; PRD-LED-014,
-- PRD-LED-015, PRD-LED-017, PRD-MOD-011, PRD-MOD-012; S1-F10-T03). Runs as aos_migration, which owns everything it
-- creates (code-house-rules 5.1). Compatible with the version running: it adds a nullable column, whose check every
-- existing row meets since no customer return was posted before this version, and widens a read-only function
-- (code-house-rules 4.2).

-- A customer return names the sale movement it brings back, so it comes back at the cost that sale issued and never
-- returns more than the sale issued and was not yet returned (7.5; 13.4 "Customer return"; PRD-LED-017, PRD-INT-005).
alter table stock.movement add column returns_movement_id uuid references stock.movement (id);
alter table stock.movement add constraint movement_returns
  check ((kind = 'customer-return') = (returns_movement_id is not null));
create index movement_returns on stock.movement (returns_movement_id);

-- Rebuild and compare now reads the pools, layers, valuations and transit values too (13.6, 2.1, 11.7), so whether it
-- saw only part covers them (13.6 "says when it is partial"; DEC-117). Answers only that, never a row or a count.
create or replace function stock.rebuild_partial() returns boolean
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select exists (select 1 from stock.sku_balance t where not access.row_visible('stock.balance', t.site_id,
           t.store_id, t.business_unit_id, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.balance t where not access.row_visible('stock.balance', t.site_id, t.store_id,
           t.business_unit_id, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.movement_leg t where not access.row_visible('stock.movement', t.site_id,
           t.store_id, t.business_unit_id, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.acceptance t where not access.row_visible('stock.acceptance', t.site_id,
           t.store_id, t.business_unit_id, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.coverage t where not access.row_visible('stock.coverage', t.site_id,
           t.store_id, t.business_unit_id, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.receipt_origin_state t where not access.row_visible('stock.receipt_origin',
           t.site_id, t.store_id, t.business_unit_id, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.piece t where not access.row_visible('stock.piece', t.site_id, t.store_id,
           t.business_unit_id, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.hold_claim t where not access.row_visible('stock.hold', t.site_id, t.store_id,
           t.business_unit_id, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.hold_release t where not access.row_visible('stock.hold', t.site_id,
           t.store_id, t.business_unit_id, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.reservation_claim t where not access.row_visible('stock.reservation',
           t.site_id, t.store_id, t.business_unit_id, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.reservation_event t where not access.row_visible('stock.reservation',
           t.site_id, t.store_id, t.business_unit_id, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.cost_pool t where not access.row_visible('stock.cost_pool', t.site_id,
           null, null, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.cost_layer t where not access.row_visible('stock.cost_pool', t.site_id,
           null, null, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.valuation t where not access.row_visible('stock.valuation', t.site_id,
           t.store_id, t.business_unit_id, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.transit_value t where not access.row_visible('stock.transit_value', t.site_id,
           t.store_id, t.business_unit_id, t.legal_entity_id, t.brand_id, null))
      or exists (select 1 from stock.transit_value_layer t where not access.row_visible('stock.transit_value',
           t.site_id, t.store_id, t.business_unit_id, t.legal_entity_id, t.brand_id, null))
$$;
