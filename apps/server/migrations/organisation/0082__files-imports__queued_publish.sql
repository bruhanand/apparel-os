-- A publish that posts through a queued job (imports-and-opening-data 3.2, 10.6, 13.1, 13.2, 15.1; stock-ledger 10.6;
-- access-and-approvals 9.8; PRD-INT-004, PRD-IMP-012, DEC-097; S1-F13-T03). Runs as aos_migration, which owns
-- everything it creates (code-house-rules 5.1). Compatible with the version running: a table is added and a nullable
-- column added to the outcomes (4.2). No row is written here.

-- A request to post a batch through a queued job: the batch version and the approval decision it names, the accounting
-- book whose queue it waits in, who asked and when. Append-only: the attempt its job comes to is an outcome naming it,
-- and Publish asked again is a new request, so a retry names the same decision while the version is unchanged
-- (access-and-approvals 9.8 step 5). It carries the batch's scope facts, so a reader sees it only where they see the
-- batch (PRD-SEC-005).
create table files_imports.publish_request (
  id uuid primary key,
  batch_id uuid not null references files_imports.import_batch (id),
  batch_version_id uuid not null,
  approval_decision_id uuid,
  accounting_book_id uuid not null,
  requested_by_user_id uuid not null,
  requested_at timestamptz not null,
  legal_entity_id uuid,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  recorded_at timestamptz not null default now()
);
create index publish_request_batch on files_imports.publish_request (batch_id);
create trigger refuse_row_change before update or delete on files_imports.publish_request
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on files_imports.publish_request
  for each statement execute function kernel.refuse_change();
alter table files_imports.publish_request enable row level security;
create policy row_scope on files_imports.publish_request for all to aos_runtime
  using (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null))
  with check (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null));
grant select, insert on files_imports.publish_request to aos_runtime;

-- The attempt of a queued publish names the request its job answered, so a request is answered once (10.6).
alter table files_imports.import_outcome
  add column publish_request_id uuid references files_imports.publish_request (id);
create unique index import_outcome_publish_request on files_imports.import_outcome (publish_request_id)
  where publish_request_id is not null;
