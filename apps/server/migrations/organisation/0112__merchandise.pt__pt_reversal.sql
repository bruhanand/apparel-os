-- `merchandise` · PT, the reversal of an Official PT before the scan-in (goods-in 6.4, 6.7, 10.1, 10.3; stock-ledger
-- 7.5, 13.21; DEC-137, PRD-REC-019, PRD-ACS-006, PRD-INT-004; S2-F09-T01). Runs as aos_migration, which owns everything
-- it creates (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2).
--
-- A reversal is proposed with a reason by whoever may change the PT, and approved by a different person through
-- `access`; each is an append-only record written once (code-house-rules 7.1, 7.2):
--   - the reversal: the Official revision and its approval it reverses, the reason in the proposer's words, who proposed
--     it and when; its approval request names it as the version decided;
--   - its decision: approved, with the use of the decision its stock and money effects carry (DEC-097), or rejected.
-- The PT and its reversal stay as linked records: the revision, its approval and its new receipt origins are never
-- changed; a revision is Reversed once a decision approves its reversal, worked out from these rows, never stored apart.
-- No value is written here.
--
-- Every row belongs to the GRN's place, the legal entity of its unit's mapping and its brand, so every table is scoped
-- under `merchandise.pt` (code-house-rules 6.1, 6.2). References to other modules' records (the decision and its use,
-- the users and assignments) keep their identifiers with no foreign key; every reference inside the schema has one,
-- and every foreign key and scope column an index (code-house-rules 3.2, 3.3).

-- A reversal of an Official revision, proposed with a reason (goods-in 6.4).
create table merchandise.pt_reversal (
  id uuid primary key,
  pt_revision_id uuid not null references merchandise.pt_revision (id),
  pt_approval_id uuid not null references merchandise.pt_approval (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  reason text not null,
  proposed_by_user_id uuid not null,
  role_assignment_id uuid not null,
  proposed_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  -- At least one character that is not a space, at most the technical cap (goods-in 6.7; PT_REVERSAL_REASON_CAP).
  constraint pt_reversal_reason check (reason ~ '\S' and char_length(reason) <= 500)
);
create index pt_reversal_revision on merchandise.pt_reversal (pt_revision_id);
create index pt_reversal_approval on merchandise.pt_reversal (pt_approval_id);
create index pt_reversal_site on merchandise.pt_reversal (site_id);
create index pt_reversal_store on merchandise.pt_reversal (store_id);
create index pt_reversal_unit on merchandise.pt_reversal (business_unit_id);
create index pt_reversal_legal_entity on merchandise.pt_reversal (legal_entity_id);
create index pt_reversal_brand on merchandise.pt_reversal (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt_reversal
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt_reversal
  for each statement execute function kernel.refuse_change();

-- A reversal's decision: approved, with the decision's use, or rejected (goods-in 6.7).
create table merchandise.pt_reversal_decision (
  id uuid primary key,
  pt_reversal_id uuid not null references merchandise.pt_reversal (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null references merchandise.brand (id),
  outcome text not null,
  approval_decision_id uuid not null,
  approval_use_id uuid,
  decided_by_user_id uuid not null,
  role_assignment_id uuid not null,
  decided_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  constraint pt_reversal_decision_once unique (pt_reversal_id),
  constraint pt_reversal_decision_decision_once unique (approval_decision_id),
  -- An approval carries the use of its decision; a rejection uses none (DEC-097).
  constraint pt_reversal_decision_outcome check (
    (outcome = 'Approved' and approval_use_id is not null) or (outcome = 'Rejected' and approval_use_id is null))
);
create index pt_reversal_decision_site on merchandise.pt_reversal_decision (site_id);
create index pt_reversal_decision_store on merchandise.pt_reversal_decision (store_id);
create index pt_reversal_decision_unit on merchandise.pt_reversal_decision (business_unit_id);
create index pt_reversal_decision_legal_entity on merchandise.pt_reversal_decision (legal_entity_id);
create index pt_reversal_decision_brand on merchandise.pt_reversal_decision (brand_id);
create trigger refuse_row_change before update or delete on merchandise.pt_reversal_decision
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pt_reversal_decision
  for each statement execute function kernel.refuse_change();

-- Row-level security (code-house-rules 6.2): every table through `access.row_visible` with its scope facts, under the
-- PT's record type.
alter table merchandise.pt_reversal enable row level security;
create policy row_scope on merchandise.pt_reversal for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table merchandise.pt_reversal_decision enable row level security;
create policy row_scope on merchandise.pt_reversal_decision for all to aos_runtime
  using (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('merchandise.pt', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));

grant select, insert on merchandise.pt_reversal to aos_runtime;
grant select, insert on merchandise.pt_reversal_decision to aos_runtime;
