-- The stock harness's documents (stock-ledger 15.2; code-house-rules 11.4; DEC-112, H3; S1-F10-T04). A test-only
-- migration set: only test setup applies it, after the Organisation set, to a test database copy; the pre-deploy
-- runner never reads it. Every row is SYNTHETIC. Runs as aos_migration, which owns everything it creates.
create schema test_stock_harness;
grant usage on schema test_stock_harness to aos_runtime;

-- One synthetic document: its kind, its current version, its state, and the places it is at (and goes to). Locked at
-- stock-ledger 10.3 step 1; a change after approval makes a new version (15.2).
create table test_stock_harness.document (
  id uuid primary key,
  kind text not null,
  version_id uuid not null,
  version_no integer not null,
  state text not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  book_id uuid not null,
  to_site_id uuid,
  to_store_id uuid,
  to_business_unit_id uuid,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint document_kind check (kind in
    ('receipt', 'pt-approval', 'transfer', 'sale', 'customer-return', 'cost-change', 'supplier-return')),
  constraint document_version check (version_no > 0),
  constraint document_state check (state <> ''),
  constraint document_destination check ((to_site_id is null) = (to_business_unit_id is null)),
  constraint document_version_unique unique (version_id)
);
grant select, insert on test_stock_harness.document to aos_runtime;
grant update (id, state, version_id, version_no) on test_stock_harness.document to aos_runtime;

-- One line of one version, in typed columns: no amount or constraint column is held in jsonb (code-house-rules 3.3).
create table test_stock_harness.document_line (
  id uuid primary key,
  document_id uuid not null references test_stock_harness.document (id),
  version_id uuid not null,
  line_id uuid not null,
  sku_id uuid not null,
  quantity integer not null,
  location_id uuid,
  to_location_id uuid,
  receipt_origin_id uuid,
  movement_id uuid,
  amount_paise bigint,
  value_known boolean not null,
  recorded_at timestamptz not null default now(),
  constraint document_line_quantity check (quantity > 0),
  constraint document_line_amount check ((amount_paise is null) = (not value_known)),
  constraint document_line_unique unique (version_id, line_id)
);
grant select, insert on test_stock_harness.document_line to aos_runtime;

-- The piece codes a line names.
create table test_stock_harness.document_line_piece (
  id uuid primary key,
  document_line_id uuid not null references test_stock_harness.document_line (id),
  piece_code text not null,
  constraint document_line_piece_unique unique (document_line_id, piece_code)
);
grant select, insert on test_stock_harness.document_line_piece to aos_runtime;

-- Who recorded a change in which version and when, so a version can have several preparers (access-and-approvals 9.1).
create table test_stock_harness.document_change (
  id uuid primary key,
  document_id uuid not null references test_stock_harness.document (id),
  version_id uuid not null,
  recorded_by_user_id uuid not null,
  recorded_at timestamptz not null default now()
);
grant select, insert on test_stock_harness.document_change to aos_runtime;

-- Append-only guards (code-house-rules 7.1).
create trigger refuse_row_change before update or delete on test_stock_harness.document_line
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on test_stock_harness.document_line
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on test_stock_harness.document_line_piece
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on test_stock_harness.document_line_piece
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on test_stock_harness.document_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on test_stock_harness.document_change
  for each statement execute function kernel.refuse_change();
