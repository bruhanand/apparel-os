-- The scan-in at the Site (goods-in 7, 7.5, 10.1, 10.3; PRD-REC-021, PRD-REC-022, PRD-STK-003; DEC-135; S2-F07-T01).
-- Runs as aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible with the version running:
-- it only adds a table (code-house-rules 4.2). No value is written here: a scan, as a GRN, holds no price, tax or value.
--
-- Once the GRN's PT is approved, its pieces are scanned in where they are, one piece a scan. Each scan is a row of its
-- own, the scan-in's record (goods-in 7.2): accepted, with the product it is and the receipt origin its piece was
-- taken from, whose acceptance and location move the ledger records in the same transaction under the scan as its
-- source (the ledger's records, no foreign key: code-house-rules 3.2); or refused, with why, the barcode not on the
-- PT or the product with nothing left, and no stock change. Several people may scan one GRN; its scans are made under
-- the GRN's row lock, which migration 0105 grants, so a scan takes no lock of its own.
--
-- Every row belongs to the place where the goods are, the legal entity of the unit's mapping and the Arrival's brand,
-- under the Arrival's record type, as every row of `receiving` is (code-house-rules 6.1, 6.2): whoever sees an Arrival
-- sees its scans. Every reference inside the schema has a foreign key; every foreign key and scope column has an index
-- (code-house-rules 3.2, 3.3). Every row is append-only (7.1).

create table receiving.scan (
  id uuid primary key,
  grn_id uuid not null references receiving.grn (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  pt_revision_id uuid not null,
  barcode text not null,
  destination_location_id uuid not null,
  outcome text not null,
  reason text,
  sku_id uuid,
  receipt_origin_id uuid,
  scanned_by_user_id uuid not null,
  role_assignment_id uuid not null,
  scanned_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  -- The barcode as scanned or typed, within the cap of a code (`RECEIVING_CAPS.codeText`; goods-in 4.8 "Input caps").
  constraint scan_barcode check (barcode ~ '\S' and length(barcode) <= 60),
  -- Accepted: the product and the origin its piece came from; refused: why, and the product only where the barcode
  -- named one of the PT's, with nothing left of it.
  constraint scan_outcome check (
    (outcome = 'accepted' and reason is null and sku_id is not null and receipt_origin_id is not null)
    or (outcome = 'refused' and receipt_origin_id is null
      and ((reason = 'not-covered' and sku_id is null) or (reason = 'nothing-left' and sku_id is not null)))
  )
);
-- A GRN's scans are read newest first, a page at a time (goods-in 7.5; code-house-rules 12.1).
create index scan_grn on receiving.scan (grn_id, id);
create index scan_site on receiving.scan (site_id);
create index scan_store on receiving.scan (store_id);
create index scan_unit on receiving.scan (business_unit_id);
create index scan_legal_entity on receiving.scan (legal_entity_id);
create index scan_brand on receiving.scan (brand_id);

create trigger refuse_row_change before update or delete on receiving.scan
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.scan
  for each statement execute function kernel.refuse_change();

-- Row-level security (code-house-rules 6.2): under the Arrival's record type, with every scope fact.
alter table receiving.scan enable row level security;
create policy row_scope on receiving.scan for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));

grant select, insert on receiving.scan to aos_runtime;
