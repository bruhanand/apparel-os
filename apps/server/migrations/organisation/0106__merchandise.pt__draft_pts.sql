-- `merchandise` · PT, its first records: the draft PT a PT file makes for a GRN (goods-in 5.1, 5.5 to 5.8, 10.1, 10.3;
-- module-map section 5; PRD-REC-014, PRD-REC-016 to PRD-REC-018, PRD-MER-007, PRD-MER-013, PRD-IMP-006, PRD-PTW-008 to
-- PRD-PTW-012; DEC-134, DEC-135, DEC-137, DEC-138, DEC-140; S2-F04-T02). Runs as aos_migration, which owns everything
-- it creates (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2).
--
-- The PT of a GRN is an identity row, one per GRN for the first version (one PT per GRN, DEC-137; supplemental PTs are
-- after it, RR-546), written at its first submit and locked by every submit and withdrawal of it (code-house-rules 8.2).
-- Each file submitted for it is a revision, frozen as submitted (PRD-REC-017, PRD-REC-018): the import batch, document,
-- stored file and layout and mapping versions it came from, who uploaded it and every preparer, and its totals; its rows
-- with their values as supplied, their calculated NAG and MARGIN, the origin of each value (PRD-IMP-006), the product
-- found or proposed, whether the barcode is already mapped to it and whether it repeats on another product, and any
-- difference from the product (goods-in 5.5); the styles and sizes of the GRN it covers with their GRN lines (5.7); and
-- the new products its rows propose, one SKU per style, colour and size, which PT approval confirms (PRD-MER-013;
-- S2-F06-T01). A draft is never edited: a withdrawal is its own record (code-house-rules 7.1, 7.2). Its state is worked
-- out from these rows and its approval request, never stored apart. Amounts are integer paise (PRD-MOD-014); MARGIN a
-- numeric of two decimals (code-house-rules 3.3). No value is written here.
--
-- Every row belongs to the GRN's place, the legal entity of its unit's mapping and its brand, so every table is scoped
-- under `merchandise.pt` (code-house-rules 6.1, 6.2). References to other modules' records (the GRN, its lines, the
-- import batch, document and staged rows, the stored file, the layout and mapping versions, the users, the
-- assignments) keep their identifiers with no foreign key; every reference inside the schema has one, and every
-- foreign key and scope column an index (code-house-rules 3.2, 3.3).

-- The PT of a GRN.
create table merchandise.pt (
  id uuid primary key,
  grn_id uuid not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  created_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint pt_once unique (grn_id)
);
create index pt_site on merchandise.pt (site_id);
create index pt_store on merchandise.pt (store_id);
create index pt_unit on merchandise.pt (business_unit_id);
create index pt_legal_entity on merchandise.pt (legal_entity_id);
create index pt_brand on merchandise.pt (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt
  for each statement execute function kernel.refuse_change();

-- A revision: one PT file submitted for the PT's GRN, frozen as submitted.
create table merchandise.pt_revision (
  id uuid primary key,
  pt_id uuid not null references merchandise.pt (id),
  revision_number integer not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  import_batch_id uuid not null,
  import_batch_version_id uuid not null,
  import_document_id uuid not null,
  stored_file_id uuid not null,
  layout_version_id uuid not null,
  mapping_version_id uuid not null,
  pieces integer not null,
  cost_paise bigint not null,
  basic_paise bigint not null,
  mrp_paise bigint not null,
  uploaded_by_user_id uuid not null,
  role_assignment_id uuid not null,
  preparer_user_ids uuid[] not null,
  submitted_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  constraint pt_revision_number check (revision_number > 0),
  constraint pt_revision_once unique (pt_id, revision_number),
  constraint pt_revision_document_once unique (import_document_id),
  constraint pt_revision_totals check (pieces > 0 and cost_paise > 0 and basic_paise > 0 and mrp_paise > 0),
  constraint pt_revision_preparers check (cardinality(preparer_user_ids) > 0)
);
create index pt_revision_batch on merchandise.pt_revision (import_batch_id);
create index pt_revision_site on merchandise.pt_revision (site_id);
create index pt_revision_store on merchandise.pt_revision (store_id);
create index pt_revision_unit on merchandise.pt_revision (business_unit_id);
create index pt_revision_legal_entity on merchandise.pt_revision (legal_entity_id);
create index pt_revision_brand on merchandise.pt_revision (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt_revision
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt_revision
  for each statement execute function kernel.refuse_change();

-- A draft revision withdrawn, once, by whom and when (goods-in 5.7: a draft is withdrawn, never edited).
create table merchandise.pt_revision_withdrawal (
  id uuid primary key,
  pt_revision_id uuid not null references merchandise.pt_revision (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  withdrawn_by_user_id uuid not null,
  role_assignment_id uuid not null,
  occurred_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  constraint pt_revision_withdrawal_once unique (pt_revision_id)
);
create index pt_revision_withdrawal_site on merchandise.pt_revision_withdrawal (site_id);
create index pt_revision_withdrawal_store on merchandise.pt_revision_withdrawal (store_id);
create index pt_revision_withdrawal_unit on merchandise.pt_revision_withdrawal (business_unit_id);
create index pt_revision_withdrawal_legal_entity on merchandise.pt_revision_withdrawal (legal_entity_id);
create index pt_revision_withdrawal_brand on merchandise.pt_revision_withdrawal (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt_revision_withdrawal
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt_revision_withdrawal
  for each statement execute function kernel.refuse_change();

-- A style and size of the GRN the revision covers: the GRN's good pieces of it and its GRN lines (goods-in 5.4, 5.7).
create table merchandise.pt_coverage (
  id uuid primary key,
  pt_revision_id uuid not null references merchandise.pt_revision (id),
  line_number integer not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  style_code text not null,
  size_code text,
  quantity integer not null,
  grn_line_ids uuid[] not null,
  recorded_at timestamptz not null default now(),
  constraint pt_coverage_once unique (pt_revision_id, line_number),
  constraint pt_coverage_values check (line_number > 0 and quantity > 0 and cardinality(grn_line_ids) > 0
    and style_code <> '' and size_code <> '')
);
create index pt_coverage_site on merchandise.pt_coverage (site_id);
create index pt_coverage_store on merchandise.pt_coverage (store_id);
create index pt_coverage_unit on merchandise.pt_coverage (business_unit_id);
create index pt_coverage_legal_entity on merchandise.pt_coverage (legal_entity_id);
create index pt_coverage_brand on merchandise.pt_coverage (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt_coverage
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt_coverage
  for each statement execute function kernel.refuse_change();

-- A new product the revision's rows propose: one SKU of a style code, colour and size, of the brand's style of that
-- code when it has one, else of a new style (goods-in 5.5; PRD-MER-013).
create table merchandise.pt_proposed_sku (
  id uuid primary key,
  pt_revision_id uuid not null references merchandise.pt_revision (id),
  line_number integer not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  style_code text not null,
  existing_style_id uuid references merchandise.style (id),
  colour_value_id uuid not null references merchandise.vocabulary_value (id),
  size_value_id uuid not null references merchandise.vocabulary_value (id),
  recorded_at timestamptz not null default now(),
  constraint pt_proposed_sku_once unique (pt_revision_id, line_number),
  constraint pt_proposed_sku_values check (line_number > 0 and style_code <> '')
);
create index pt_proposed_sku_style on merchandise.pt_proposed_sku (existing_style_id);
create index pt_proposed_sku_colour on merchandise.pt_proposed_sku (colour_value_id);
create index pt_proposed_sku_size on merchandise.pt_proposed_sku (size_value_id);
create index pt_proposed_sku_site on merchandise.pt_proposed_sku (site_id);
create index pt_proposed_sku_store on merchandise.pt_proposed_sku (store_id);
create index pt_proposed_sku_unit on merchandise.pt_proposed_sku (business_unit_id);
create index pt_proposed_sku_legal_entity on merchandise.pt_proposed_sku (legal_entity_id);
create index pt_proposed_sku_brand on merchandise.pt_proposed_sku (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt_proposed_sku
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt_proposed_sku
  for each statement execute function kernel.refuse_change();

-- A row of the revision, in the file's order: the template's values as supplied, each list's approved value and its
-- code as given, the amounts in paise, NAG and MARGIN as calculated, the two hints never applied (PRD-PTW-012), its
-- product or proposal, its barcode's state, its coverage, and as a payload of the shape `pt-row-detail/1` the origin
-- of each value (PRD-IMP-006) and its differences from its product (goods-in 5.5).
create table merchandise.pt_row (
  id uuid primary key,
  pt_revision_id uuid not null references merchandise.pt_revision (id),
  line_number integer not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  staged_row_id uuid not null,
  sheet text not null,
  row_number integer not null,
  season_value_id uuid not null references merchandise.vocabulary_value (id),
  colour_value_id uuid not null references merchandise.vocabulary_value (id),
  gender_value_id uuid not null references merchandise.vocabulary_value (id),
  category_id uuid not null references merchandise.category (id),
  type_value_id uuid not null references merchandise.vocabulary_value (id),
  item_value_id uuid not null references merchandise.vocabulary_value (id),
  fit_value_id uuid not null references merchandise.vocabulary_value (id),
  size_value_id uuid not null references merchandise.vocabulary_value (id),
  input_tax_value_id uuid not null references merchandise.vocabulary_value (id),
  output_tax_value_id uuid not null references merchandise.vocabulary_value (id),
  season_code text not null,
  colour_code text not null,
  gender_code text not null,
  sub_category_code text not null,
  type_code text not null,
  item_code text not null,
  fit_code text not null,
  size_code text not null,
  input_tax_code text not null,
  output_tax_code text not null,
  style_code text not null,
  barcode text not null,
  hsn text not null,
  quantity integer not null,
  mrp_paise bigint not null,
  basic_paise bigint not null,
  p_rate_paise bigint not null,
  nag integer not null,
  margin numeric(9, 2) not null,
  suggested_sub_category text,
  suggested_type text,
  sku_id uuid references merchandise.sku (id),
  pt_proposed_sku_id uuid references merchandise.pt_proposed_sku (id),
  barcode_mapped boolean not null,
  barcode_repeated boolean not null,
  pt_coverage_id uuid not null references merchandise.pt_coverage (id),
  detail jsonb not null,
  recorded_at timestamptz not null default now(),
  constraint pt_row_once unique (pt_revision_id, line_number),
  constraint pt_row_product check (num_nonnulls(sku_id, pt_proposed_sku_id) = 1
    and (sku_id is not null or not barcode_mapped)),
  constraint pt_row_values check (line_number > 0 and row_number > 0 and quantity > 0 and nag = quantity
    and mrp_paise > 0 and basic_paise > 0 and p_rate_paise > 0 and p_rate_paise <= mrp_paise
    and style_code <> '' and barcode ~ '^[0-9]+$' and hsn ~ '^([0-9]{6}|[0-9]{8})$'),
  constraint pt_row_detail check (jsonb_typeof(detail) = 'object' and detail ->> 'shape' = 'pt-row-detail/1')
);
create index pt_row_season on merchandise.pt_row (season_value_id);
create index pt_row_colour on merchandise.pt_row (colour_value_id);
create index pt_row_gender on merchandise.pt_row (gender_value_id);
create index pt_row_category on merchandise.pt_row (category_id);
create index pt_row_type on merchandise.pt_row (type_value_id);
create index pt_row_item on merchandise.pt_row (item_value_id);
create index pt_row_fit on merchandise.pt_row (fit_value_id);
create index pt_row_size on merchandise.pt_row (size_value_id);
create index pt_row_input_tax on merchandise.pt_row (input_tax_value_id);
create index pt_row_output_tax on merchandise.pt_row (output_tax_value_id);
create index pt_row_sku on merchandise.pt_row (sku_id);
create index pt_row_proposed_sku on merchandise.pt_row (pt_proposed_sku_id);
create index pt_row_coverage on merchandise.pt_row (pt_coverage_id);
create index pt_row_site on merchandise.pt_row (site_id);
create index pt_row_store on merchandise.pt_row (store_id);
create index pt_row_unit on merchandise.pt_row (business_unit_id);
create index pt_row_legal_entity on merchandise.pt_row (legal_entity_id);
create index pt_row_brand on merchandise.pt_row (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt_row
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt_row
  for each statement execute function kernel.refuse_change();

-- Row-level security (code-house-rules 6.2): every table through `access.row_visible` with its scope facts, under the
-- PT's record type.
alter table merchandise.pt enable row level security;
create policy row_scope on merchandise.pt for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table merchandise.pt_revision enable row level security;
create policy row_scope on merchandise.pt_revision for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table merchandise.pt_revision_withdrawal enable row level security;
create policy row_scope on merchandise.pt_revision_withdrawal for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table merchandise.pt_coverage enable row level security;
create policy row_scope on merchandise.pt_coverage for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table merchandise.pt_proposed_sku enable row level security;
create policy row_scope on merchandise.pt_proposed_sku for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table merchandise.pt_row enable row level security;
create policy row_scope on merchandise.pt_row for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));

grant select, insert on merchandise.pt to aos_runtime;
grant update (id) on merchandise.pt to aos_runtime;
grant select, insert on merchandise.pt_revision to aos_runtime;
grant select, insert on merchandise.pt_revision_withdrawal to aos_runtime;
grant select, insert on merchandise.pt_coverage to aos_runtime;
grant select, insert on merchandise.pt_proposed_sku to aos_runtime;
grant select, insert on merchandise.pt_row to aos_runtime;
