-- The numbering module's schema: number formats with their versions, number series, allocations and series events
-- (numbering-and-audit 2, 3.1 to 3.3, 3.5, 3.7, 6.1; module-map 4.6; PRD-MOD-004, PRD-MOD-008, PRD-INT-004,
-- PRD-POS-020; S1-F08-T01). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1).
--
-- Every table is unscoped (numbering-and-audit 6.1): a series is named by an opaque scope key its owning module
-- supplies after validating the scope, and `numbering` calls no other module (module-map 4.6), so it holds no scope
-- fact a policy could check. Only `numbering` code reads these tables, inside the owning module's command, which has
-- authorised the action on its own document; people see a number through that document, which is scoped.
--
-- No business number comes from a PostgreSQL sequence (code-house-rules 3.2): Allocate takes the series' next number
-- under its row lock, in the owning command's transaction, so a rollback gives no number away (3.2).

create schema numbering;
grant usage on schema numbering to aos_runtime;

-- A format, named by its code (3.5). Its parts live in its versions.
create table numbering.number_format (
  id uuid primary key,
  code text not null,
  recorded_at timestamptz not null default now(),
  constraint number_format_code check (code <> ''),
  constraint number_format_code_unique unique (code)
);

-- A version of a format. A series keeps the version it was defined with for life; a new version applies only to
-- series defined after it (3.5). Versions are numbered from 1 in the order they were added.
create table numbering.number_format_version (
  id uuid primary key,
  number_format_id uuid not null references numbering.number_format (id),
  version integer not null,
  recorded_at timestamptz not null default now(),
  constraint number_format_version_positive check (version >= 1),
  constraint number_format_version_unique unique (number_format_id, version)
);

-- The parts of a format version, in order: fixed text, the scope part, the financial-year label, and the sequence at
-- its width (3.5). The domain check refuses a version without exactly one sequence part before it is written.
create table numbering.number_format_part (
  id uuid primary key,
  number_format_version_id uuid not null references numbering.number_format_version (id),
  position integer not null,
  kind text not null,
  text text,
  width integer,
  recorded_at timestamptz not null default now(),
  constraint number_format_part_kind check (kind in ('text', 'scope', 'year', 'sequence')),
  constraint number_format_part_values check (
    (kind = 'text' and text is not null and text <> '' and width is null)
    or (kind in ('scope', 'year') and text is null and width is null)
    or (kind = 'sequence' and text is null and width between 1 and 15)),
  constraint number_format_part_position unique (number_format_version_id, position)
);

-- A series gives numbers for one kind in one scope, and for a yearly kind one financial year (3.1, 3.3). The scope
-- key and the display scope key are opaque: the owning module supplies them after validating the scope. The display
-- year is the financial year where the kind's display scope is per year, such as a bill's tax registration and year
-- (3.5), and null otherwise. State and the next sequence number change, under the series' row lock; everything else
-- is fixed for life, and Closed is final (3.1; PRD-LIF-015, PRD-OFF-010).
create table numbering.series (
  id uuid primary key,
  kind text not null,
  scope_key text not null,
  financial_year text,
  display_scope_key text not null,
  display_year text not null,
  scope_text text,
  number_format_version_id uuid not null references numbering.number_format_version (id),
  state text not null,
  next_sequence bigint not null,
  recorded_at timestamptz not null default now(),
  constraint series_kind check (kind <> ''),
  constraint series_scope_key check (scope_key <> ''),
  constraint series_financial_year check (financial_year <> ''),
  constraint series_display_scope_key check (display_scope_key <> ''),
  constraint series_display_year check (display_year = '' or display_year = financial_year),
  constraint series_scope_text check (scope_text <> ''),
  constraint series_state check (state in ('Open', 'Paused', 'Closed')),
  constraint series_next_sequence check (next_sequence >= 1),
  -- The target of each allocation's reference, so an allocation carries its series' kind and display scope.
  constraint series_display unique (id, kind, display_scope_key, display_year)
);
-- One kind, scope and year has at most one live series (3.1, 3.7; PRD-POS-020, PRD-OFF-002).
create unique index series_live on numbering.series (kind, scope_key, financial_year) nulls not distinct
  where state in ('Open', 'Paused');
create index series_display_scope on numbering.series (kind, display_scope_key, display_year);
create index series_format_version on numbering.series (number_format_version_id);

create function numbering.guard_series_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if old.state = 'Closed' then
    raise exception 'a closed series is final' using errcode = 'AO003';
  end if;
  if (pg_catalog.to_jsonb(new) - 'state' - 'next_sequence') <> (pg_catalog.to_jsonb(old) - 'state' - 'next_sequence')
     or new.next_sequence < old.next_sequence then
    raise exception 'a series changes only in its state and by moving its next number on' using errcode = 'AO003';
  end if;
  return new;
end;
$$;
revoke execute on function numbering.guard_series_change() from public;
create trigger guard_series_change before update on numbering.series
  for each row execute function numbering.guard_series_change();

-- One number given: the series, the sequence number, the formatted text, the document kind and reference, and the
-- time (3.2). Unique in its series, once per document and kind, and as text within its display scope (2, 3.5).
create table numbering.allocation (
  id uuid primary key,
  series_id uuid not null,
  kind text not null,
  display_scope_key text not null,
  display_year text not null,
  sequence_number bigint not null,
  formatted_text text not null,
  document_type text not null,
  document_id uuid not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint allocation_sequence check (sequence_number >= 1),
  constraint allocation_text check (formatted_text <> ''),
  constraint allocation_document_type check (document_type <> ''),
  constraint allocation_series foreign key (series_id, kind, display_scope_key, display_year)
    references numbering.series (id, kind, display_scope_key, display_year),
  constraint allocation_number unique (series_id, sequence_number),
  constraint allocation_document unique (kind, document_type, document_id),
  constraint allocation_text_in_display_scope unique (kind, display_scope_key, display_year, formatted_text)
);
create index allocation_series on numbering.allocation (series_id, kind, display_scope_key, display_year);

-- What happened to a series: defined, paused, released, closed (3.7). Reconciled after a restore arrives with the
-- restore (3.6; S1-F14).
create table numbering.series_event (
  id uuid primary key,
  series_id uuid not null references numbering.series (id),
  event text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint series_event_event check (event in ('defined', 'paused', 'released', 'closed'))
);
create index series_event_series on numbering.series_event (series_id);

create trigger refuse_row_change before update or delete on numbering.number_format
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on numbering.number_format
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on numbering.number_format_version
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on numbering.number_format_version
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on numbering.number_format_part
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on numbering.number_format_part
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on numbering.allocation
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on numbering.allocation
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on numbering.series_event
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on numbering.series_event
  for each statement execute function kernel.refuse_change();

grant select, insert on numbering.number_format to aos_runtime;
grant select, insert on numbering.number_format_version to aos_runtime;
grant select, insert on numbering.number_format_part to aos_runtime;
grant select, insert, update on numbering.series to aos_runtime;
grant select, insert on numbering.allocation to aos_runtime;
grant select, insert on numbering.series_event to aos_runtime;
