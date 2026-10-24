-- `merchandise` · PT, the approval and rejection of a PT revision (goods-in 6.1 to 6.6, 10.1, 10.3; module-map 6.2 flows
-- C and E; stock-ledger 10.6, 13.14; access-and-approvals 9.8, 9.8b; PRD-REC-015, PRD-REC-017, PRD-REC-018,
-- PRD-MER-013, PRD-PTW-010, PRD-INT-004; DEC-097, DEC-135, DEC-140; S2-F06-T01). Runs as aos_migration, which owns
-- everything it creates (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2).
--
-- A revision's decision is `access`'s; what it makes is kept here, each an append-only record written once:
--   - its rejection, by whom and under which decision (the draft ends; goods-in 6.3);
--   - a request to post an approved large revision, which a queued job posts, one at a time per book, naming the
--     decision, its approver and the accounting book (stock-ledger 10.6; access-and-approvals 9.8 step 1), and the
--     failure of a job that was refused under its locks, its decision left unused (9.8 step 4); a failed revision is
--     posted again by a further request naming the same decision, by whoever asks it (9.8 step 5; books-and-posting 10
--     step 5);
--   - the approval once posted, the PT's number from its series, the decision and its use (PRD-REC-018; DEC-097);
--   - each new product the approval confirmed, by the proposal of the revision it confirms (PRD-MER-013);
--   - each new receipt origin the identity step made for the pieces the PT covers, of one SKU at one P RATE, with the
--     origin it came from, the GRN's style and size it covers and the pieces, which carry the coverage and cost
--     (goods-in 6.3 steps 4 and 5, 6.6; stock-ledger 13.14);
--   - each hold the PT route ended for goods Booking took in, with its event (goods-in 4.6; stock-ledger 6.1).
-- A revision's state is worked out from these rows, its withdrawal and its approval request, never stored apart.
-- Amounts are integer paise (PRD-MOD-014). No value is written here.
--
-- Every row belongs to the GRN's place, the legal entity of its unit's mapping and its brand, so every table is scoped
-- under `merchandise.pt` (code-house-rules 6.1, 6.2). References to other modules' records (the decision and its use,
-- the users and assignments, the service identity, the number allocation, the accounting book, the GRN line, the
-- ledger's origins and holds) keep their identifiers with no foreign key; every reference inside the schema has one,
-- and every foreign key and scope column an index (code-house-rules 3.2, 3.3).

-- A rejected revision: its decision, by whom and when (goods-in 6.3 "Reject").
create table merchandise.pt_rejection (
  id uuid primary key,
  pt_revision_id uuid not null references merchandise.pt_revision (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  approval_decision_id uuid not null,
  rejected_by_user_id uuid not null,
  role_assignment_id uuid not null,
  occurred_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  constraint pt_rejection_once unique (pt_revision_id),
  constraint pt_rejection_decision_once unique (approval_decision_id)
);
create index pt_rejection_site on merchandise.pt_rejection (site_id);
create index pt_rejection_store on merchandise.pt_rejection (store_id);
create index pt_rejection_unit on merchandise.pt_rejection (business_unit_id);
create index pt_rejection_legal_entity on merchandise.pt_rejection (legal_entity_id);
create index pt_rejection_brand on merchandise.pt_rejection (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt_rejection
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt_rejection
  for each statement execute function kernel.refuse_change();

-- A request to post an approved revision through a queued job, one at a time per accounting book (stock-ledger 10.6).
create table merchandise.pt_post_request (
  id uuid primary key,
  pt_revision_id uuid not null references merchandise.pt_revision (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  approval_decision_id uuid not null,
  approved_by_user_id uuid not null,
  accounting_book_id uuid not null,
  requested_by_user_id uuid not null,
  role_assignment_id uuid not null,
  requested_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
create index pt_post_request_revision on merchandise.pt_post_request (pt_revision_id);
create index pt_post_request_site on merchandise.pt_post_request (site_id);
create index pt_post_request_store on merchandise.pt_post_request (store_id);
create index pt_post_request_unit on merchandise.pt_post_request (business_unit_id);
create index pt_post_request_legal_entity on merchandise.pt_post_request (legal_entity_id);
create index pt_post_request_brand on merchandise.pt_post_request (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt_post_request
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt_post_request
  for each statement execute function kernel.refuse_change();

-- A queued posting refused under its locks: nothing posted, the decision unused, the PT showing why (9.8 step 4).
create table merchandise.pt_posting_failure (
  id uuid primary key,
  pt_post_request_id uuid not null references merchandise.pt_post_request (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  code text not null,
  missing jsonb not null,
  failed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint pt_posting_failure_once unique (pt_post_request_id),
  constraint pt_posting_failure_values check (code <> '' and jsonb_typeof(missing) = 'array')
);
create index pt_posting_failure_site on merchandise.pt_posting_failure (site_id);
create index pt_posting_failure_store on merchandise.pt_posting_failure (store_id);
create index pt_posting_failure_unit on merchandise.pt_posting_failure (business_unit_id);
create index pt_posting_failure_legal_entity on merchandise.pt_posting_failure (legal_entity_id);
create index pt_posting_failure_brand on merchandise.pt_posting_failure (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt_posting_failure
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt_posting_failure
  for each statement execute function kernel.refuse_change();

-- An approved revision once posted: Official, numbered from the PT series, with the decision and its use (goods-in 6.3).
create table merchandise.pt_approval (
  id uuid primary key,
  pt_revision_id uuid not null references merchandise.pt_revision (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  number text not null,
  number_allocation_id uuid not null,
  approval_decision_id uuid not null,
  approval_use_id uuid not null,
  approved_by_user_id uuid not null,
  pt_post_request_id uuid references merchandise.pt_post_request (id),
  posted_by_service_identity_id uuid,
  posted_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  constraint pt_approval_once unique (pt_revision_id),
  constraint pt_approval_decision_once unique (approval_decision_id),
  constraint pt_approval_number check (number <> ''),
  constraint pt_approval_job check ((pt_post_request_id is null) = (posted_by_service_identity_id is null))
);
create index pt_approval_post_request on merchandise.pt_approval (pt_post_request_id);
create index pt_approval_site on merchandise.pt_approval (site_id);
create index pt_approval_store on merchandise.pt_approval (store_id);
create index pt_approval_unit on merchandise.pt_approval (business_unit_id);
create index pt_approval_legal_entity on merchandise.pt_approval (legal_entity_id);
create index pt_approval_brand on merchandise.pt_approval (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt_approval
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt_approval
  for each statement execute function kernel.refuse_change();

-- A new product the approval confirmed: the revision's proposal and the SKU it made (goods-in 6.3 step 2; PRD-MER-013).
create table merchandise.pt_product (
  id uuid primary key,
  pt_approval_id uuid not null references merchandise.pt_approval (id),
  pt_proposed_sku_id uuid not null references merchandise.pt_proposed_sku (id),
  sku_id uuid not null references merchandise.sku (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  recorded_at timestamptz not null default now(),
  constraint pt_product_once unique (pt_proposed_sku_id)
);
create index pt_product_approval on merchandise.pt_product (pt_approval_id);
create index pt_product_sku on merchandise.pt_product (sku_id);
create index pt_product_site on merchandise.pt_product (site_id);
create index pt_product_store on merchandise.pt_product (store_id);
create index pt_product_unit on merchandise.pt_product (business_unit_id);
create index pt_product_legal_entity on merchandise.pt_product (legal_entity_id);
create index pt_product_brand on merchandise.pt_product (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt_product
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt_product
  for each statement execute function kernel.refuse_change();

-- The pieces a style and size of the PT covers, moved by the identity step to a new receipt origin of one SKU at one
-- P RATE, whose coverage and cost the approval records; its identifier is the coverage and cost items' ledger line.
create table merchandise.pt_origin (
  id uuid primary key,
  pt_approval_id uuid not null references merchandise.pt_approval (id),
  pt_coverage_id uuid not null references merchandise.pt_coverage (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  grn_line_id uuid not null,
  parent_receipt_origin_id uuid not null,
  receipt_origin_id uuid not null,
  sku_id uuid not null references merchandise.sku (id),
  quantity integer not null,
  p_rate_paise bigint not null,
  recorded_at timestamptz not null default now(),
  constraint pt_origin_once unique (receipt_origin_id),
  constraint pt_origin_values check (quantity > 0 and p_rate_paise > 0)
);
create index pt_origin_approval on merchandise.pt_origin (pt_approval_id);
create index pt_origin_coverage on merchandise.pt_origin (pt_coverage_id);
create index pt_origin_sku on merchandise.pt_origin (sku_id);
create index pt_origin_site on merchandise.pt_origin (site_id);
create index pt_origin_store on merchandise.pt_origin (store_id);
create index pt_origin_unit on merchandise.pt_origin (business_unit_id);
create index pt_origin_legal_entity on merchandise.pt_origin (legal_entity_id);
create index pt_origin_brand on merchandise.pt_origin (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt_origin
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt_origin
  for each statement execute function kernel.refuse_change();

-- A hold the PT route ended for goods Booking took in: an excess hold, or a quarantine with the identity step; its
-- identifier is the release item's ledger line (goods-in 4.6, 6.3 step 5; stock-ledger 6.1).
create table merchandise.pt_hold_release (
  id uuid primary key,
  pt_approval_id uuid not null references merchandise.pt_approval (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  grn_line_id uuid not null,
  hold_id uuid not null,
  event text not null,
  recorded_at timestamptz not null default now(),
  constraint pt_hold_release_once unique (hold_id),
  constraint pt_hold_release_event check (event in ('pt-route', 'approved-decision'))
);
create index pt_hold_release_approval on merchandise.pt_hold_release (pt_approval_id);
create index pt_hold_release_site on merchandise.pt_hold_release (site_id);
create index pt_hold_release_store on merchandise.pt_hold_release (store_id);
create index pt_hold_release_unit on merchandise.pt_hold_release (business_unit_id);
create index pt_hold_release_legal_entity on merchandise.pt_hold_release (legal_entity_id);
create index pt_hold_release_brand on merchandise.pt_hold_release (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt_hold_release
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt_hold_release
  for each statement execute function kernel.refuse_change();

-- Row-level security (code-house-rules 6.2): every table through `access.row_visible` with its scope facts, under the
-- PT's record type.
alter table merchandise.pt_rejection enable row level security;
create policy row_scope on merchandise.pt_rejection for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table merchandise.pt_post_request enable row level security;
create policy row_scope on merchandise.pt_post_request for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table merchandise.pt_posting_failure enable row level security;
create policy row_scope on merchandise.pt_posting_failure for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table merchandise.pt_approval enable row level security;
create policy row_scope on merchandise.pt_approval for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table merchandise.pt_product enable row level security;
create policy row_scope on merchandise.pt_product for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table merchandise.pt_origin enable row level security;
create policy row_scope on merchandise.pt_origin for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table merchandise.pt_hold_release enable row level security;
create policy row_scope on merchandise.pt_hold_release for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));

grant select, insert on merchandise.pt_rejection to aos_runtime;
grant select, insert on merchandise.pt_post_request to aos_runtime;
grant select, insert on merchandise.pt_posting_failure to aos_runtime;
grant select, insert on merchandise.pt_approval to aos_runtime;
grant select, insert on merchandise.pt_product to aos_runtime;
grant select, insert on merchandise.pt_origin to aos_runtime;
grant select, insert on merchandise.pt_hold_release to aos_runtime;
