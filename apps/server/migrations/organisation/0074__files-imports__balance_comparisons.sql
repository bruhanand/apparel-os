-- Runs of opening balances against the closed books (imports-and-opening-data 10.4, 14, 15.1; PRD-LIF-009,
-- PRD-LIF-011, POL-14.03, PRD-MOD-014, PRD-MOD-015; S1-F13-T02). Runs as aos_migration, which owns everything it
-- creates (code-house-rules 5.1). Compatible with the version running: the run kind's check only widens, and a table is
-- added (4.2). No row is written here.

-- A run may now be of the kind `balances-against-closed-books`: an opening batch of dues, advances or deposits (left)
-- against a closed-books balances batch (right), by party and account. Both sides are batches.
alter table files_imports.comparison_run drop constraint comparison_run_kind;
alter table files_imports.comparison_run add constraint comparison_run_kind check (
     (run_kind = 'manifest-against-soh' and comparison_key = 'barcode-then-sku'
      and left_set = 'manifest' and right_set = 'stock-on-hand')
  or (run_kind = 'count-against-manifest' and comparison_key = 'sku-and-location'
      and left_set = 'count' and right_set = 'manifest')
  or (run_kind = 'count-against-soh' and comparison_key = 'barcode-then-sku'
      and left_set = 'count' and right_set = 'stock-on-hand')
  or (run_kind = 'balances-against-closed-books' and comparison_key = 'party-and-account'
      and left_set = 'opening-balances' and right_set = 'closed-books'));

-- One line of such a run: a party of a book and account, or an account's total, with each side's total in integer
-- paise (listed, Unknown or not listed, never zero: class I-1; PRD-MOD-014, PRD-MOD-015), the result, and the rows each
-- side's total came from. A total is kept only where the side lists the key with a known amount. A party is the code
-- the rows give, never a customer's name (section 11).
create table files_imports.comparison_balance_line (
  id uuid primary key,
  run_id uuid not null references files_imports.comparison_run (id),
  line_number integer not null,
  keyed_by text not null,
  accounting_book_id uuid,
  account text,
  party text,
  left_state text not null,
  left_paise bigint,
  right_state text not null,
  right_paise bigint,
  result text not null,
  left_rows jsonb not null,
  right_rows jsonb not null,
  legal_entity_id uuid,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  recorded_at timestamptz not null default now(),
  constraint comparison_balance_line_number unique (run_id, line_number),
  constraint comparison_balance_line_keyed_by check (keyed_by in ('party', 'account', 'unresolved')),
  -- A party line names its book, account and party; an account line its book and account, no party.
  constraint comparison_balance_line_key check (case keyed_by
    when 'party' then accounting_book_id is not null and account is not null and party is not null
    when 'account' then accounting_book_id is not null and account is not null and party is null
    else result = 'unresolved' end),
  constraint comparison_balance_line_left check (left_state in ('listed', 'unknown', 'not-listed')
    and (left_state = 'listed') = (left_paise is not null)),
  constraint comparison_balance_line_right check (right_state in ('listed', 'unknown', 'not-listed')
    and (right_state = 'listed') = (right_paise is not null)),
  constraint comparison_balance_line_result check (result in ('same', 'different', 'not-listed-left',
    'not-listed-right', 'unknown', 'unresolved')),
  constraint comparison_balance_line_rows check (jsonb_typeof(left_rows) = 'array'
    and jsonb_typeof(right_rows) = 'array')
);
create trigger refuse_row_change before update or delete on files_imports.comparison_balance_line
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on files_imports.comparison_balance_line
  for each statement execute function kernel.refuse_change();
alter table files_imports.comparison_balance_line enable row level security;
create policy row_scope on files_imports.comparison_balance_line for all to aos_runtime
  using (access.row_visible('files_imports.comparison_run', site_id, store_id, business_unit_id, legal_entity_id, null, null))
  with check (access.row_visible('files_imports.comparison_run', site_id, store_id, business_unit_id, legal_entity_id, null, null));

grant select, insert on files_imports.comparison_balance_line to aos_runtime;
