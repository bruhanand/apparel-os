-- The test-only stand-in for live open items (imports-and-opening-data 10.4; code-house-rules 11.4; PRD-LIF-011;
-- S1-F13-T02). No stage 1 module holds live dues, advances or deposits: payables and receivables are stage 5 (GC6-11).
-- The opening-balance test handlers ask this stand-in whether a row is also open as a live document, the double count
-- 10.4 blocks. A test-only migration set: only test setup applies it; the pre-deploy runner never reads it. Every row
-- is SYNTHETIC. Runs as aos_migration, which owns everything it creates.
create schema test_opening_balances;
grant usage on schema test_opening_balances to aos_runtime;

-- One live open item: its book, the account it is open in, its party and its reference (a document reference, or the
-- agreement or evidence reference of a deposit or an advance). Written by the test directly, as the live module
-- would; never changed.
create table test_opening_balances.live_open_item (
  id uuid primary key,
  accounting_book_id uuid not null,
  account text not null,
  party text not null,
  reference text not null,
  recorded_at timestamptz not null default now(),
  constraint live_open_item_unique unique (accounting_book_id, account, party, reference)
);
create trigger refuse_row_change before update or delete on test_opening_balances.live_open_item
  for each row execute function kernel.refuse_change();

grant select on test_opening_balances.live_open_item to aos_runtime;
