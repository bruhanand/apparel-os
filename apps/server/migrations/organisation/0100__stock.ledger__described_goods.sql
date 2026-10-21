-- Goods of a product not yet set up, and the identity step (stock-ledger 2.2, 2.3, 13.4, 13.14, 14.2; goods-in 4.5,
-- 6.3 step 4; GI-1; PRD-DMG-005, PRD-REC-008; S2-F02-T01). A receipt count may count goods whose SKU is Unknown with
-- their identity as described: the style code as the invoice writes it, the colour as it names it and the size from the
-- size list, a colour or size it does not state being Unknown (DEC-138, PRD-MER-005). Such an origin is not quarantined;
-- PT approval gives its units their SKUs through the identity step, as new receipt origins of the kind
-- identity-resolved that name it as their parent, keeping it as it was. Runs as aos_migration (code-house-rules 5.1).
-- Compatible with the version running: it only adds nullable columns and checks every existing row meets, since no
-- origin of Unknown SKU or of the kind identity-resolved was written before (code-house-rules 4.2).

alter table stock.receipt_origin
  add column described_style_code text,
  add column described_colour text,
  add column described_size text;

-- An identity as described belongs to goods whose SKU is Unknown; once a SKU names the goods, it is their identity.
alter table stock.receipt_origin add constraint receipt_origin_described
  check (sku_id is null or num_nonnulls(described_style_code, described_colour, described_size) = 0);
-- A colour or size is described only with the style code it belongs to; no text is empty (Unknown is null).
alter table stock.receipt_origin add constraint receipt_origin_described_style
  check (described_style_code is not null or (described_colour is null and described_size is null));
alter table stock.receipt_origin add constraint receipt_origin_described_form
  check (described_style_code <> '' and described_colour <> '' and described_size <> '');
-- The identity step gives each new origin its SKU (13.4 "Identity resolved").
alter table stock.receipt_origin add constraint receipt_origin_identity_sku
  check (origin_kind <> 'identity-resolved' or sku_id is not null);
