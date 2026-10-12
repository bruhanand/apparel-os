-- Two Organisation settings `numbering` keeps for the series it serves (numbering-and-audit 3.3, 3.5; module-map 4.6,
-- section 10 "Statutory applicability"; offline-counter 4.1; PRD-POS-020, PRD-MOD-009; DEC-116, DEC-117; S1-F12-T01):
-- the financial years, by their dates, and the format each declared kind's new series take, such as the bill-number
-- format. Runs as aos_migration, which owns everything it creates (code-house-rules 5.1). It only adds (4.2).
--
-- Both have no default (code-house-rules 12.14): no row is written here. The financial year's dates are OPEN (GC5-1,
-- RR-060; Accounts, CA) and the bill-number format is OPEN (V-40, RR-101; POL-10.07; CA); tests use labelled
-- synthetic values. Each row records where its value came from: KDPS's answer, a setting of the test setup, or
-- synthetic (12.14). Unscoped, as every table of `numbering` (numbering-and-audit 6.1). Append-only.

-- A financial year: its label, which a yearly series names (3.3), and its first and last day, as a half-open range
-- of business dates. Two years never overlap and never share a label.
create table numbering.financial_year (
  id uuid primary key,
  label text not null,
  dates daterange not null,
  origin text not null,
  recorded_at timestamptz not null default now(),
  constraint financial_year_label check (label <> ''),
  constraint financial_year_label_unique unique (label),
  constraint financial_year_dates check (not pg_catalog.lower_inf(dates) and not pg_catalog.upper_inf(dates)
    and not pg_catalog.isempty(dates)),
  constraint financial_year_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint financial_year_no_overlap exclude using gist (dates with &&)
);
create trigger refuse_row_change before update or delete on numbering.financial_year
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on numbering.financial_year
  for each statement execute function kernel.refuse_change();

-- The format a declared kind's new series take (3.5): the latest row of a kind is in force, and a series keeps the
-- format version it was defined with for life, so a later row changes only series defined after it.
create table numbering.kind_format (
  id uuid primary key,
  kind text not null,
  number_format_id uuid not null references numbering.number_format (id),
  origin text not null,
  recorded_at timestamptz not null default now(),
  constraint kind_format_kind check (kind <> ''),
  constraint kind_format_origin check (origin in ('kdps', 'test-setup', 'synthetic'))
);
create index kind_format_kind on numbering.kind_format (kind, id);
create index kind_format_number_format on numbering.kind_format (number_format_id);
create trigger refuse_row_change before update or delete on numbering.kind_format
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on numbering.kind_format
  for each statement execute function kernel.refuse_change();

grant select, insert on numbering.financial_year to aos_runtime;
grant select, insert on numbering.kind_format to aos_runtime;
