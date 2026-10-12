-- The reference records of `ebo-imports` (module-map section 5, 11.1; imports-and-opening-data 4.1, 4.2, 7.1, 12;
-- PRD-LIF-013, PRD-LIF-014, PRD-LIF-016, PRD-IMP-010; DEC-116; S1-F13-T01). Runs as aos_migration, which owns
-- everything it creates (code-house-rules 5.1). Compatible with the version running: it only adds (4.2). No row is
-- written here.
--
-- In stage 1 the module holds only the historical-reference handler: the earlier POS's stock on hand and daily sales,
-- kept for checking and reports. A reference record never moves stock, makes a sale or issues a tax invoice
-- (PRD-LIF-014, PRD-LIF-016); nothing here is read by `stock` or `finance`. Another module's record (an import batch,
-- document or staged row, a user, a place) is kept by its identifier with no foreign key. Both tables are append-only
-- (PRD-MOD-011) and scoped by the batch's place under row-level security.

create schema ebo_imports;
grant usage on schema ebo_imports to aos_runtime;

-- One published document of a historical-reference batch: a report of one kind from the earlier POS for one Store and
-- one report date, its reference (7.1), with the batch, document and code it came from (section 5).
create table ebo_imports.reference_document (
  id uuid primary key,
  report_kind text not null,
  reference text not null,
  import_batch_id uuid not null,
  import_batch_code text not null,
  import_document_id uuid not null,
  published_by_user_id uuid not null,
  role_assignment_id uuid not null,
  published_at timestamptz not null,
  legal_entity_id uuid,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  recorded_at timestamptz not null default now(),
  constraint reference_document_kind check (report_kind in ('stock-on-hand', 'daily-sales')),
  constraint reference_document_import unique (import_document_id)
);
create trigger refuse_row_change before update or delete on ebo_imports.reference_document
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on ebo_imports.reference_document
  for each statement execute function kernel.refuse_change();
alter table ebo_imports.reference_document enable row level security;
create policy row_scope on ebo_imports.reference_document for all to aos_runtime
  using (access.row_visible('ebo_imports.reference_document', site_id, store_id, business_unit_id, legal_entity_id, null, null))
  with check (access.row_visible('ebo_imports.reference_document', site_id, store_id, business_unit_id, legal_entity_id, null, null));

-- One line of a reference document, as published: its staged row, its values by field (null where Unknown, never
-- zero; PRD-MOD-015), the SKU its barcode resolved to on the report date, where it resolved to one, and a daily-sales
-- line's amount in integer paise (PRD-MOD-014), null where Unknown or where the report holds no amount.
create table ebo_imports.reference_line (
  id uuid primary key,
  reference_document_id uuid not null references ebo_imports.reference_document (id),
  staged_row_id uuid not null,
  row_number integer not null,
  "values" jsonb not null,
  sku_id uuid,
  amount_paise bigint,
  legal_entity_id uuid,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  recorded_at timestamptz not null default now(),
  constraint reference_line_row unique (reference_document_id, staged_row_id),
  constraint reference_line_values check (jsonb_typeof("values") = 'object')
);
create trigger refuse_row_change before update or delete on ebo_imports.reference_line
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on ebo_imports.reference_line
  for each statement execute function kernel.refuse_change();
alter table ebo_imports.reference_line enable row level security;
create policy row_scope on ebo_imports.reference_line for all to aos_runtime
  using (access.row_visible('ebo_imports.reference_document', site_id, store_id, business_unit_id, legal_entity_id, null, null))
  with check (access.row_visible('ebo_imports.reference_document', site_id, store_id, business_unit_id, legal_entity_id, null, null));

grant select, insert on ebo_imports.reference_document to aos_runtime;
grant select, insert on ebo_imports.reference_line to aos_runtime;
