-- The stock harness's requests to post (stock-ledger 10.6, 15.2; access-and-approvals 9.8; DEC-097; S1-F10-T07). The
-- approval click of a large document records the decision and, in the same transaction, a request to post naming the
-- decision and the approved version, and the outbox row for the queued posting job; it has no stock or money effect.
-- A retry is a further request naming the same decision. A test-only migration set, applied by test setup only; every
-- row is SYNTHETIC. Runs as aos_migration.
create table test_stock_harness.post_request (
  id uuid primary key,
  document_id uuid not null references test_stock_harness.document (id),
  version_id uuid not null,
  decision_id uuid not null,
  action_type text not null,
  book_id uuid not null,
  requested_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint post_request_action check (action_type <> '')
);
grant select, insert on test_stock_harness.post_request to aos_runtime;

create trigger refuse_row_change before update or delete on test_stock_harness.post_request
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on test_stock_harness.post_request
  for each statement execute function kernel.refuse_change();
