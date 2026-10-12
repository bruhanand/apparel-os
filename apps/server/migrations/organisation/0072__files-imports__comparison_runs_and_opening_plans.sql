-- Comparison runs and the opening plan read (imports-and-opening-data 2, 10.1 to 10.3, 14, 15.1; module-map 4.16;
-- domain-model 3.6; PRD-LIF-003, PRD-LIF-004, PRD-LIF-027, POL-14.07, DEC-117; S1-F13-T01). Runs as aos_migration,
-- which owns everything it creates (code-house-rules 5.1). Compatible with the version running: it only adds (4.2).
-- No row is written here.

-- A comparison run (10.3): two sets compared by the key its kind names, with both sides as they were read and the
-- counts of its lines by result. A batch side keeps its batch and the batch version read; a count side keeps the unit,
-- its Site and the as-of time of the stock ledger's read model. Neither side is ever changed; the run is append-only.
-- Its scope facts are the places both sides hold, so a reader sees a run only where both sides' places are covered.
create table files_imports.comparison_run (
  id uuid primary key,
  run_kind text not null,
  comparison_key text not null,
  left_set text not null,
  left_batch_id uuid references files_imports.import_batch (id),
  left_batch_version_id uuid,
  left_site_id uuid,
  left_business_unit_id uuid,
  left_as_of timestamptz,
  right_set text not null,
  right_batch_id uuid not null references files_imports.import_batch (id),
  right_batch_version_id uuid not null,
  counts jsonb not null,
  run_by_user_id uuid not null,
  role_assignment_id uuid not null,
  run_at timestamptz not null,
  legal_entity_id uuid,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  recorded_at timestamptz not null default now(),
  constraint comparison_run_kind check (
       (run_kind = 'manifest-against-soh' and comparison_key = 'barcode-then-sku'
        and left_set = 'manifest' and right_set = 'stock-on-hand')
    or (run_kind = 'count-against-manifest' and comparison_key = 'sku-and-location'
        and left_set = 'count' and right_set = 'manifest')
    or (run_kind = 'count-against-soh' and comparison_key = 'barcode-then-sku'
        and left_set = 'count' and right_set = 'stock-on-hand')),
  -- A batch side names its batch and version and no count; a count side names its unit, Site and as-of time.
  constraint comparison_run_left check (case when left_set = 'count'
    then left_batch_id is null and left_batch_version_id is null and left_site_id is not null
      and left_business_unit_id is not null and left_as_of is not null
    else left_batch_id is not null and left_batch_version_id is not null and left_site_id is null
      and left_business_unit_id is null and left_as_of is null end),
  constraint comparison_run_counts check (jsonb_typeof(counts) = 'object')
);
create index comparison_run_run_at on files_imports.comparison_run (run_at, id);
create trigger refuse_row_change before update or delete on files_imports.comparison_run
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on files_imports.comparison_run
  for each statement execute function kernel.refuse_change();
alter table files_imports.comparison_run enable row level security;
create policy row_scope on files_imports.comparison_run for all to aos_runtime
  using (access.row_visible('files_imports.comparison_run', site_id, store_id, business_unit_id, legal_entity_id, null, null))
  with check (access.row_visible('files_imports.comparison_run', site_id, store_id, business_unit_id, legal_entity_id, null, null));

-- One line of a run: a key either side holds, with each side's quantity (listed, Unknown or not listed, never zero:
-- class I-1, GC6-16; PRD-MOD-015), the result, and the rows each side's quantity came from. A quantity is kept only
-- where the side lists the key with a known quantity.
create table files_imports.comparison_line (
  id uuid primary key,
  run_id uuid not null references files_imports.comparison_run (id),
  line_number integer not null,
  keyed_by text not null,
  barcode text,
  sku_id uuid,
  location_id uuid,
  left_state text not null,
  left_quantity bigint,
  right_state text not null,
  right_quantity bigint,
  result text not null,
  left_rows jsonb not null,
  right_rows jsonb not null,
  legal_entity_id uuid,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  recorded_at timestamptz not null default now(),
  constraint comparison_line_number unique (run_id, line_number),
  constraint comparison_line_keyed_by check (keyed_by in ('barcode', 'sku', 'sku-and-location', 'unresolved')),
  constraint comparison_line_left check (left_state in ('listed', 'unknown', 'not-listed')
    and (left_state = 'listed') = (left_quantity is not null)),
  constraint comparison_line_right check (right_state in ('listed', 'unknown', 'not-listed')
    and (right_state = 'listed') = (right_quantity is not null)),
  constraint comparison_line_result check (result in ('same', 'different', 'not-listed-left', 'not-listed-right',
    'unknown', 'unresolved')),
  constraint comparison_line_rows check (jsonb_typeof(left_rows) = 'array' and jsonb_typeof(right_rows) = 'array')
);
create trigger refuse_row_change before update or delete on files_imports.comparison_line
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on files_imports.comparison_line
  for each statement execute function kernel.refuse_change();
alter table files_imports.comparison_line enable row level security;
create policy row_scope on files_imports.comparison_line for all to aos_runtime
  using (access.row_visible('files_imports.comparison_run', site_id, store_id, business_unit_id, legal_entity_id, null, null))
  with check (access.row_visible('files_imports.comparison_run', site_id, store_id, business_unit_id, legal_entity_id, null, null));

grant select, insert on files_imports.comparison_run to aos_runtime;
grant select, insert on files_imports.comparison_line to aos_runtime;

-- The opening plan of a unit (module-map 4.16; domain-model 3.6; DEC-117): the identifier and current version of each
-- opening-stock batch of the unit at its Site, of the opening balance kind, for the targets whose handlers fill
-- opening stock, that is Validated and submitted at its current version, so not yet published. It answers those two
-- identifiers only; the caller asks `access` whether a version is approved, and the stock-plan check answers yes or no.
-- Read whatever the actor's scope sees, since that check reads the batch's approval and scope on their own,
-- independently of activation (code-house-rules 5.2, 6.2).
create function files_imports.opening_plan_versions(business_unit_id uuid, site_id uuid, targets text[])
  returns table (batch_id uuid, version_id uuid)
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select b.id, b.version_id from files_imports.import_batch b
  where b.kind = 'opening-balance' and b.target = any (opening_plan_versions.targets)
    and b.business_unit_id = opening_plan_versions.business_unit_id and b.site_id = opening_plan_versions.site_id
    and b.state = 'Validated' and b.submitted_version_id = b.version_id
$$;
revoke execute on function files_imports.opening_plan_versions(uuid, uuid, text[]) from public;
grant execute on function files_imports.opening_plan_versions(uuid, uuid, text[]) to aos_runtime;
