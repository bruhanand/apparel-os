-- The changes that define a financial year and set the bill-number format (offline-counter 4.1, 4.3b; numbering-and-audit
-- 3.3, 3.5; module-map 4.17; PRD-ACS-006, PRD-POS-020, POL-10.07; DEC-116, DEC-117; S1-F12-T03). Runs as
-- aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible with the version running: it only
-- adds (4.2). No change is written here: the dates are OPEN (GC5-1, RR-060) and the format is OPEN (V-40, RR-101).
--
-- Each change is prepared by one person and decided by a different one through access's Request approval and Decide
-- (access-and-approvals 9.8b): it is its own version, frozen when prepared, so it is append-only (code-house-rules
-- 7.1); its decision is access's request and decision, and its effect the setting `numbering` keeps
-- (`numbering.financial_year`, `numbering.kind_format`, 0057) with the missing series of every Active billing device,
-- written in the decision's transaction. Decide locks the change at step 1, so the runtime role holds UPDATE (id).
--
-- Unscoped: the settings belong to the Organisation as a whole, so their record types carry no scope fact and the
-- permission on the type decides (access-and-approvals 5.3); only pos code reads them. A user or an assignment is kept
-- by its identifier with no foreign key (structure-and-masters 2.5).

-- A financial year as it is to be defined: its label, its first and last day and where they come from (12.14).
create table pos.financial_year_change (
  id uuid primary key,
  label text not null,
  first_day date not null,
  last_day date not null,
  origin text not null,
  prepared_by_user_id uuid not null,
  role_assignment_id uuid not null,
  prepared_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint financial_year_change_label check (label ~ '\S'),
  constraint financial_year_change_dates check (last_day >= first_day),
  constraint financial_year_change_origin check (origin in ('kdps', 'test-setup', 'synthetic'))
);
create index financial_year_change_prepared_by on pos.financial_year_change (prepared_by_user_id);
create trigger refuse_row_change before update or delete on pos.financial_year_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on pos.financial_year_change
  for each statement execute function kernel.refuse_change();

-- The bill-number format as it is to be set: its code, its parts in order (numbering-and-audit 3.5), and where it
-- comes from (12.14). The parts are checked when it is prepared and again by `numbering` when it is approved.
create table pos.bill_format_change (
  id uuid primary key,
  format_code text not null,
  parts jsonb not null,
  origin text not null,
  prepared_by_user_id uuid not null,
  role_assignment_id uuid not null,
  prepared_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint bill_format_change_code check (format_code ~ '\S'),
  constraint bill_format_change_parts check (jsonb_typeof(parts) = 'array' and jsonb_array_length(parts) > 0),
  constraint bill_format_change_origin check (origin in ('kdps', 'test-setup', 'synthetic'))
);
create index bill_format_change_prepared_by on pos.bill_format_change (prepared_by_user_id);
create trigger refuse_row_change before update or delete on pos.bill_format_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on pos.bill_format_change
  for each statement execute function kernel.refuse_change();

-- Runtime grants (code-house-rules 5.2): append-only rows, so insert and select only (7.1); Decide's lock of the change
-- takes update on its identifier only.
grant select, insert on pos.financial_year_change to aos_runtime;
grant update (id) on pos.financial_year_change to aos_runtime;
grant select, insert on pos.bill_format_change to aos_runtime;
grant update (id) on pos.bill_format_change to aos_runtime;
