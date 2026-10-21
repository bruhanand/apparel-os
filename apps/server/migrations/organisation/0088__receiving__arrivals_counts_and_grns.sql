-- The receiving module's schema: the Arrival, its supplier invoices and photos, the count and the GRN (goods-in 4.1 to
-- 4.5, 10.1, 10.3; module-map section 5; PRD-REC-001 to PRD-REC-005, PRD-REC-007, PRD-REC-008, PRD-MOD-009,
-- PRD-MOD-011; DEC-133, DEC-138; S2-F02-T02). Runs as aos_migration, which owns everything it creates
-- (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2). No value is
-- written here: a GRN holds quantities, never a price, tax or value (goods-in 4.5).
--
-- Every row belongs to the place where the goods physically are, the legal entity of the unit's mapping and the
-- Arrival's brand, so every table is scoped (code-house-rules 6.1, 6.2), each under `receiving.arrival`: the GRN and its
-- lines are read with the Arrival they were issued from, so whoever sees an Arrival sees whether and how its GRN was
-- issued; create on `receiving.grn` is what issuing one needs. Every row is append-only (code-house-rules 7.1): a
-- count line changes by a new entry naming the one it replaces, and the GRN freezes the lines as they stood. The
-- Arrival's identity row is locked by every change of it (code-house-rules 8.2, step 1), so a GRN is issued from a
-- count no one is changing. References to other modules' records keep their identifiers with no foreign key; every
-- reference inside the schema has one, a count line's to its first entry and a GRN's to the Arrival version it froze
-- included (code-house-rules 3.2); every foreign key and every scope column has an index (3.3).

create schema receiving;
grant usage on schema receiving to aos_runtime;

-- An Arrival (goods-in 4.2): where the goods are (PRD-REC-004), with the Store and the legal entity of the unit's
-- mapping in force when it was recorded and that mapping version (PRD-MOD-010), the location the counts go into, the
-- supplier and brand, the transport details, and when the goods arrived, apart from when it was recorded (PRD-MOD-009);
-- the arrival date is that instant's business date, on which the brand's Agreement is read (goods-in 4.5).
create table receiving.arrival (
  id uuid primary key,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  mapping_version_id uuid not null,
  receiving_location_id uuid not null,
  brand_id uuid not null,
  supplier_party_id uuid not null,
  transporter text not null,
  lorry_receipt_number text not null,
  lorry_receipt_date date not null,
  vehicle_number text,
  eway_bill_number text,
  cartons integer not null,
  arrived_at timestamptz not null,
  arrival_date date not null,
  recorded_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint arrival_texts check (transporter <> '' and lorry_receipt_number <> '' and vehicle_number <> ''
    and eway_bill_number <> ''),
  constraint arrival_cartons check (cartons > 0)
);
create index arrival_site on receiving.arrival (site_id, arrived_at);
create index arrival_store on receiving.arrival (store_id);
create index arrival_unit on receiving.arrival (business_unit_id);
create index arrival_legal_entity on receiving.arrival (legal_entity_id);
create index arrival_brand on receiving.arrival (brand_id);
create trigger refuse_row_change before update or delete on receiving.arrival
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.arrival
  for each statement execute function kernel.refuse_change();

-- Each change of an Arrival before its GRN, numbered from one in the order made under the Arrival's lock: the
-- Arrival recorded, an invoice, photos, a count line saved or removed. The newest one's identifier is the Arrival's
-- version token, which issuing the GRN names (code-house-rules 12.7).
create table receiving.arrival_change (
  id uuid primary key,
  arrival_id uuid not null references receiving.arrival (id),
  change_number integer not null,
  change text not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  changed_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint arrival_change_number check (change_number > 0),
  constraint arrival_change_kind check (change in ('arrival', 'invoice', 'photos', 'count-line', 'count-line-removal')),
  constraint arrival_change_once unique (arrival_id, change_number)
);
create index arrival_change_site on receiving.arrival_change (site_id);
create index arrival_change_store on receiving.arrival_change (store_id);
create index arrival_change_unit on receiving.arrival_change (business_unit_id);
create index arrival_change_legal_entity on receiving.arrival_change (legal_entity_id);
create index arrival_change_brand on receiving.arrival_change (brand_id);
create trigger refuse_row_change before update or delete on receiving.arrival_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.arrival_change
  for each statement execute function kernel.refuse_change();

-- A supplier invoice of the Arrival, recorded before its count (DEC-133), with its uploaded file's attachment; the
-- number as written and its key, upper case without spaces at the ends, by which another Arrival of the same supplier
-- holding it is a possible duplicate the receiver confirmed (goods-in 4.2).
create table receiving.arrival_invoice (
  id uuid primary key,
  arrival_id uuid not null references receiving.arrival (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  supplier_party_id uuid not null,
  invoice_number text not null,
  number_key text not null,
  invoice_date date not null,
  stored_file_id uuid not null,
  attachment_id uuid not null,
  possible_duplicate_arrival_ids uuid[] not null,
  possible_duplicate_elsewhere boolean not null,
  recorded_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint arrival_invoice_number check (invoice_number <> '' and number_key = upper(btrim(invoice_number))),
  constraint arrival_invoice_once unique (arrival_id, number_key)
);
create index arrival_invoice_number_key on receiving.arrival_invoice (supplier_party_id, number_key);
create index arrival_invoice_site on receiving.arrival_invoice (site_id);
create index arrival_invoice_store on receiving.arrival_invoice (store_id);
create index arrival_invoice_unit on receiving.arrival_invoice (business_unit_id);
create index arrival_invoice_legal_entity on receiving.arrival_invoice (legal_entity_id);
create index arrival_invoice_brand on receiving.arrival_invoice (brand_id);
create trigger refuse_row_change before update or delete on receiving.arrival_invoice
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.arrival_invoice
  for each statement execute function kernel.refuse_change();

-- A photo of the cartons, seals or damage, as a stored file attached to the Arrival (PRD-REC-007).
create table receiving.arrival_photo (
  id uuid primary key,
  arrival_id uuid not null references receiving.arrival (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  stored_file_id uuid not null,
  attachment_id uuid not null,
  recorded_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint arrival_photo_once unique (arrival_id, stored_file_id)
);
create index arrival_photo_site on receiving.arrival_photo (site_id);
create index arrival_photo_store on receiving.arrival_photo (store_id);
create index arrival_photo_unit on receiving.arrival_photo (business_unit_id);
create index arrival_photo_legal_entity on receiving.arrival_photo (legal_entity_id);
create index arrival_photo_brand on receiving.arrival_photo (brand_id);
create trigger refuse_row_change before update or delete on receiving.arrival_photo
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.arrival_photo
  for each statement execute function kernel.refuse_change();

-- One saved version of a count line (goods-in 4.3): the line's first entry gives the line its identity; each later
-- entry names the one it replaces, once, so two people saving over the same version never both succeed (12.7); a
-- removal is an entry too. The style code as the invoice writes it, the colour as it names it (DEC-138), the size as a
-- value of a list attribute with its code then (GI-3), the product when one is named, the invoice and counted
-- quantities in whole pieces, a batch where the product's profile requires one (PRD-MER-011), and who saved it, from
-- their sign-in.
create table receiving.count_entry (
  id uuid primary key,
  arrival_id uuid not null references receiving.arrival (id),
  line_id uuid not null references receiving.count_entry (id),
  replaces_entry_id uuid references receiving.count_entry (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  removed boolean not null,
  style_code text not null,
  colour text,
  size_attribute_id uuid,
  size_value_id uuid,
  size_code text,
  sku_id uuid,
  invoice_quantity integer not null,
  counted_quantity integer not null,
  batch_code text,
  expiry_date date,
  entered_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint count_entry_replaces_once unique (replaces_entry_id),
  constraint count_entry_first check ((replaces_entry_id is null) = (line_id = id)),
  constraint count_entry_texts check (style_code <> '' and colour <> '' and size_code <> '' and batch_code <> ''),
  constraint count_entry_size check (num_nulls(size_attribute_id, size_value_id, size_code) in (0, 3)),
  constraint count_entry_batch check ((batch_code is null) = (expiry_date is null)),
  constraint count_entry_quantities check (invoice_quantity >= 0 and counted_quantity >= 0
    and (removed or invoice_quantity > 0 or counted_quantity > 0))
);
create index count_entry_arrival on receiving.count_entry (arrival_id);
create index count_entry_line on receiving.count_entry (line_id);
create index count_entry_site on receiving.count_entry (site_id);
create index count_entry_store on receiving.count_entry (store_id);
create index count_entry_unit on receiving.count_entry (business_unit_id);
create index count_entry_legal_entity on receiving.count_entry (legal_entity_id);
create index count_entry_brand on receiving.count_entry (brand_id);
create trigger refuse_row_change before update or delete on receiving.count_entry
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.count_entry
  for each statement execute function kernel.refuse_change();

-- The GRN (goods-in 4.5): one per Arrival, numbered from its series, issued with no approval by the person who
-- entered it; the Arrival's version it froze; the Agreement version in force on the arrival date and the owner it gave
-- the receipt counts, Unknown when none settles it (PRD-ORG-014; GI-4). Quantities only, never a value.
create table receiving.grn (
  id uuid primary key,
  arrival_id uuid not null references receiving.arrival (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  number text not null,
  number_allocation_id uuid not null,
  arrival_version_id uuid not null references receiving.arrival_change (id),
  agreement_version_id uuid,
  owner_kind text not null,
  owner_id uuid,
  counted_by_user_ids uuid[] not null,
  issued_by_user_id uuid not null,
  issued_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  constraint grn_once unique (arrival_id),
  constraint grn_number_once unique (number),
  constraint grn_owner check (owner_kind in ('organisation', 'supplier', 'brand', 'unknown')
    and (owner_kind = 'unknown') = (owner_id is null))
);
create index grn_arrival_version on receiving.grn (arrival_version_id);
create index grn_site on receiving.grn (site_id);
create index grn_store on receiving.grn (store_id);
create index grn_unit on receiving.grn (business_unit_id);
create index grn_legal_entity on receiving.grn (legal_entity_id);
create index grn_brand on receiving.grn (brand_id);
create trigger refuse_row_change before update or delete on receiving.grn
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.grn
  for each statement execute function kernel.refuse_change();

-- A GRN line, as its count line stood at issue (goods-in 4.3, 4.5), with the count entry it froze and who counted it.
create table receiving.grn_line (
  id uuid primary key,
  grn_id uuid not null references receiving.grn (id),
  line_number integer not null,
  count_entry_id uuid not null references receiving.count_entry (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  style_code text not null,
  colour text,
  size_code text,
  sku_id uuid,
  invoice_quantity integer not null,
  counted_quantity integer not null,
  batch_code text,
  expiry_date date,
  counted_by_user_ids uuid[] not null,
  recorded_at timestamptz not null default now(),
  constraint grn_line_number unique (grn_id, line_number),
  constraint grn_line_entry_once unique (count_entry_id),
  constraint grn_line_quantities check (invoice_quantity >= 0 and counted_quantity >= 0 and line_number > 0)
);
create index grn_line_site on receiving.grn_line (site_id);
create index grn_line_store on receiving.grn_line (store_id);
create index grn_line_unit on receiving.grn_line (business_unit_id);
create index grn_line_legal_entity on receiving.grn_line (legal_entity_id);
create index grn_line_brand on receiving.grn_line (brand_id);
create trigger refuse_row_change before update or delete on receiving.grn_line
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.grn_line
  for each statement execute function kernel.refuse_change();

-- Row-level security (code-house-rules 6.2): every table through `access.row_visible` with its scope facts, under the
-- Arrival's record type.
alter table receiving.arrival enable row level security;
create policy row_scope on receiving.arrival for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table receiving.arrival_change enable row level security;
create policy row_scope on receiving.arrival_change for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table receiving.arrival_invoice enable row level security;
create policy row_scope on receiving.arrival_invoice for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table receiving.arrival_photo enable row level security;
create policy row_scope on receiving.arrival_photo for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table receiving.count_entry enable row level security;
create policy row_scope on receiving.count_entry for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table receiving.grn enable row level security;
create policy row_scope on receiving.grn for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table receiving.grn_line enable row level security;
create policy row_scope on receiving.grn_line for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));

-- The narrowly authorised check of a possible duplicate invoice (goods-in 4.2; code-house-rules 6.2; DEC-117): the
-- other Arrivals of the same supplier holding the number, each with whether the actor may see it, so the command names
-- only those it may see and says only that others exist. It answers identifiers and a yes or no, never a row's detail.
create function receiving.invoice_number_used(supplier_party_id uuid, number_key text, except_arrival_id uuid)
  returns table (arrival_id uuid, visible boolean)
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select distinct i.arrival_id,
         access.row_visible('receiving.arrival', i.site_id, i.store_id, i.business_unit_id, i.legal_entity_id,
           i.brand_id, null) as visible
  from receiving.arrival_invoice i
  where i.supplier_party_id = invoice_number_used.supplier_party_id
    and i.number_key = invoice_number_used.number_key
    and i.arrival_id <> invoice_number_used.except_arrival_id
$$;
revoke execute on function receiving.invoice_number_used(uuid, text, uuid) from public;
grant execute on function receiving.invoice_number_used(uuid, text, uuid) to aos_runtime;

grant select, insert on receiving.arrival to aos_runtime;
grant update (id) on receiving.arrival to aos_runtime;
grant select, insert on receiving.arrival_change to aos_runtime;
grant select, insert on receiving.arrival_invoice to aos_runtime;
grant select, insert on receiving.arrival_photo to aos_runtime;
grant select, insert on receiving.count_entry to aos_runtime;
grant select, insert on receiving.grn to aos_runtime;
grant select, insert on receiving.grn_line to aos_runtime;
