-- Goods of a product not yet set up take the brand they are counted under (stock-ledger 13.14, 14.1, 14.2; goods-in
-- 4.8; RR-555, decided by the product owner on 21 Oct 2026; S2-F02-T02). Receiving counts them under its Arrival's
-- brand, so a person scoped to that brand sees them and may issue their GRN before PT approval names their SKU. Their
-- receipt origin, balances, legs and SKU balance carry that brand; the goods of Unknown SKU at a unit share one SKU
-- balance for each brand, so the SKU balance's key takes the brand too. A known SKU's goods are of its brand, so the
-- wider key changes nothing for them. Runs as aos_migration (code-house-rules 5.1). Compatible with the version
-- running: no environment holds goods of Unknown SKU (migration 0085 has run on none), so every existing row meets the
-- new checks and keys (code-house-rules 4.2).

alter table stock.sku_balance drop constraint sku_balance_once;
alter table stock.sku_balance add constraint sku_balance_once
  unique nulls not distinct (site_id, business_unit_id, sku_id, brand_id);

-- Goods of Unknown SKU are of a known brand: the one they were counted under (RR-555).
alter table stock.receipt_origin add constraint receipt_origin_unknown_sku_brand
  check (sku_id is not null or brand_id is not null);
alter table stock.sku_balance add constraint sku_balance_unknown_sku_brand
  check (sku_id is not null or brand_id is not null);
alter table stock.balance add constraint balance_unknown_sku_brand
  check (sku_id is not null or brand_id is not null);
alter table stock.movement_leg add constraint movement_leg_unknown_sku_brand
  check (sku_id is not null or brand_id is not null);
