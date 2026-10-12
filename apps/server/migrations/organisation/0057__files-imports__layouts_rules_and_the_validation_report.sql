-- Layouts, mappings and mapping rules proposed and confirmed, batch versions with submission, documents excluded or
-- put back, values entered by a person, row issues and control totals of the validation report, and the scope columns
-- of a batch's documents and rows (imports-and-opening-data 3.2, 5, 6.1 to 6.4, 8.1, 8.2, 11, 13.1, 15.1;
-- access-and-approvals 7.2; PRD-IMP-003, PRD-IMP-005, PRD-IMP-006, PRD-IMP-007, PRD-IMP-008, PRD-ACS-007,
-- PRD-SEC-005; POL-02.07, POL-02.08; DEC-112 GC6-4; S1-F06-T03). Runs as aos_migration, which owns everything it
-- creates (code-house-rules 5.1). Compatible with the version running: it adds tables and columns, and a batch's or a
-- document's guard only admits more (code-house-rules 4.2). No layout, mapping, rule or value is written here.

-- A layout or mapping version is proposed by the runtime role now, and decided by a different person through
-- `access` (6.4); the decision guard of 0055 and its independence constraint stay as they were.
grant insert on files_imports.layout to aos_runtime;
grant insert, update on files_imports.layout_version to aos_runtime;
grant insert on files_imports.mapping to aos_runtime;
grant insert, update on files_imports.mapping_version to aos_runtime;

-- A mapping rule: one source word of one attribute, in one scope, with whether case matters (6.3). The identity is
-- fixed; its target lives in versions. The attribute names the target's field, `<target>.<field>`. The scope is the
-- layout, a supplier, a brand or the Organisation as a whole; a scope other than the Organisation names its record.
-- The word is kept trimmed with its spaces collapsed and its case as given, and normalised for matching (lower-cased
-- too where case does not matter).
create table files_imports.mapping_rule (
  id uuid primary key,
  attribute text not null,
  scope_kind text not null,
  scope_id uuid,
  word text not null,
  normalised_word text not null,
  case_sensitive boolean not null,
  recorded_at timestamptz not null default now(),
  constraint mapping_rule_attribute check (attribute ~ '^[a-z0-9.-]+\.[A-Za-z0-9]+$'),
  constraint mapping_rule_scope check (
    scope_kind in ('layout', 'supplier', 'brand', 'organisation')
    and (scope_kind = 'organisation') = (scope_id is null)),
  constraint mapping_rule_word check (word <> '' and normalised_word <> ''),
  constraint mapping_rule_once unique nulls not distinct (attribute, scope_kind, scope_id, normalised_word, case_sensitive)
);
create trigger refuse_row_change before update or delete on files_imports.mapping_rule
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on files_imports.mapping_rule
  for each statement execute function kernel.refuse_change();

-- A mapping rule's versions, effective-dated as code-house-rules 7.3 says: one target for its validity dates, Proposed,
-- Confirmed or Rejected (the states of a proposal, DM-4), confirmed by a different person from its proposer
-- (PRD-IMP-008, POL-02.07). Confirmed versions of one rule never overlap, whatever their targets, by the exclusion
-- constraint (15.1): a version confirmed from a date ends the one in force before it on that date. The target is the
-- value the attribute's field takes in the target module, which checks it through its handler (6.3, 13.2).
create table files_imports.mapping_rule_version (
  id uuid primary key,
  mapping_rule_id uuid not null references files_imports.mapping_rule (id),
  target text not null,
  valid_during daterange not null,
  state text not null,
  proposed_by_user_id uuid not null,
  decided_by_user_id uuid,
  decided_at timestamptz,
  recorded_at timestamptz not null default now(),
  constraint mapping_rule_version_target check (target <> ''),
  constraint mapping_rule_version_dates check (not isempty(valid_during) and not lower_inf(valid_during)),
  constraint mapping_rule_version_state check (state in ('Proposed', 'Confirmed', 'Rejected')),
  constraint mapping_rule_version_decided
    check ((state = 'Proposed') = (decided_by_user_id is null) and (decided_by_user_id is null) = (decided_at is null)),
  -- The confirmer, or the person rejecting it, is never its proposer (PRD-IMP-008; 15.1).
  constraint mapping_rule_version_independent check (decided_by_user_id is distinct from proposed_by_user_id),
  constraint mapping_rule_version_no_overlap exclude using gist (
    mapping_rule_id with =, valid_during with &&) where (state = 'Confirmed')
);
create index mapping_rule_version_rule on files_imports.mapping_rule_version (mapping_rule_id);

-- The guard of a rule version (code-house-rules 7.3, as for a version frozen when prepared): a Proposed version
-- changes only by its decision, once, which may give it an end where a Confirmed version of the rule starts after it;
-- a Confirmed version changes only by its end moving earlier, never to or before its start, when a version confirmed
-- after it follows it on its own start date. A Rejected version never changes. The command checks that the end moves
-- to today or later (section 9).
create function files_imports.guard_version_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  old_rest jsonb := pg_catalog.to_jsonb(old) - 'valid_during';
  new_rest jsonb := pg_catalog.to_jsonb(new) - 'valid_during';
  same_start boolean := pg_catalog.lower(new.valid_during) = pg_catalog.lower(old.valid_during);
  end_earlier boolean := pg_catalog.upper(new.valid_during) > pg_catalog.lower(new.valid_during)
    and (pg_catalog.upper_inf(old.valid_during) or pg_catalog.upper(new.valid_during) < pg_catalog.upper(old.valid_during));
begin
  if old.state = 'Proposed' and new.state in ('Confirmed', 'Rejected') and same_start
     and (new.valid_during = old.valid_during or (new.state = 'Confirmed' and end_earlier))
     and (new_rest - 'state' - 'decided_by_user_id' - 'decided_at')
       = (old_rest - 'state' - 'decided_by_user_id' - 'decided_at') then
    return new;
  end if;
  if old.state = 'Confirmed' and new_rest = old_rest and same_start and end_earlier then
    return new;
  end if;
  raise exception 'a mapping rule version changes only as code-house-rules 7.3 allows' using errcode = 'AO003';
end;
$$;
revoke execute on function files_imports.guard_version_change() from public;
create trigger guard_version_change before update on files_imports.mapping_rule_version
  for each row execute function files_imports.guard_version_change();

grant select, insert on files_imports.mapping_rule to aos_runtime;
-- Its identity row is locked when a version of it is confirmed, so two confirmations of one rule queue (8.2).
grant update (id) on files_imports.mapping_rule to aos_runtime;
grant select, insert, update on files_imports.mapping_rule_version to aos_runtime;

-- A batch's version: a new one each time a staged value is entered or a document is excluded or put back, which
-- returns a Validated batch to Staged (3.2; PRD-ACS-007). The version submitted for review, which Publish needs. The
-- sheets the reader found, with their state and row counts (8.1, A-7, A-8), and the supplier or brand the preparer
-- named as the file's source (6.3, 6.5), fixed at start.
alter table files_imports.import_batch disable trigger guard_batch_change;
alter table files_imports.import_batch
  add column version_id uuid,
  add column submitted_version_id uuid,
  add column sheets jsonb not null default '[]',
  add column source_supplier_id uuid,
  add column source_brand_id uuid;
update files_imports.import_batch set version_id = id;
alter table files_imports.import_batch
  alter column version_id set not null,
  add constraint import_batch_sheets check (jsonb_typeof(sheets) = 'array');
alter table files_imports.import_batch enable trigger guard_batch_change;

-- A batch changes only its state, its version and its submission, along 3.2: Validated when validation finds it
-- clear; a new version while Staged, or back to Staged from Validated, when a value is entered or a document excluded
-- or put back; submitted once at the version it is; Published only at the version submitted; Failed from Staged or
-- Validated. A Published or Failed batch is never edited.
create or replace function files_imports.guard_batch_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  old_rest jsonb := pg_catalog.to_jsonb(old) - 'state' - 'version_id' - 'submitted_version_id';
  new_rest jsonb := pg_catalog.to_jsonb(new) - 'state' - 'version_id' - 'submitted_version_id';
  same_version boolean := new.version_id = old.version_id;
begin
  if old_rest = new_rest and (
       (old.state = 'Staged' and new.state = 'Validated' and same_version and new.submitted_version_id is null)
    or (old.state in ('Staged', 'Validated') and new.state = 'Staged' and not same_version
        and new.submitted_version_id is null)
    or (old.state = 'Validated' and new.state = 'Validated' and same_version and old.submitted_version_id is null
        and new.submitted_version_id = old.version_id)
    or (old.state = 'Validated' and new.state = 'Published' and same_version
        and old.submitted_version_id = old.version_id and new.submitted_version_id = old.submitted_version_id)
    or (old.state in ('Staged', 'Validated') and new.state = 'Failed' and same_version
        and new.submitted_version_id is not distinct from old.submitted_version_id)) then
    return new;
  end if;
  raise exception 'an import batch changes only its state, version and submission, as imports-and-opening-data 3.2 allows'
    using errcode = 'AO003';
end;
$$;

-- The scope facts of a batch's documents and rows, copied from their batch, under row-level security as the batch is
-- (15.1; access-and-approvals 7.2). A document may be excluded from publishing and put back while it is Staged.
alter table files_imports.import_document disable trigger guard_document_change;
alter table files_imports.import_document
  add column excluded boolean not null default false,
  add column legal_entity_id uuid,
  add column site_id uuid,
  add column store_id uuid,
  add column business_unit_id uuid;
update files_imports.import_document d
  set legal_entity_id = b.legal_entity_id, site_id = b.site_id, store_id = b.store_id,
      business_unit_id = b.business_unit_id
  from files_imports.import_batch b where b.id = d.batch_id;
alter table files_imports.import_document enable trigger guard_document_change;

-- A document changes only by being excluded or put back while Staged, or by being published, once, never while
-- excluded.
create or replace function files_imports.guard_document_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  old_rest jsonb := pg_catalog.to_jsonb(old) - 'state' - 'published_at' - 'excluded';
  new_rest jsonb := pg_catalog.to_jsonb(new) - 'state' - 'published_at' - 'excluded';
begin
  if old_rest = new_rest and old.state = 'Staged' and (
       (new.state = 'Staged' and new.published_at is null and new.excluded <> old.excluded)
    or (new.state = 'Published' and not old.excluded and not new.excluded)) then
    return new;
  end if;
  raise exception 'an import document changes only by being excluded, put back or published, once'
    using errcode = 'AO003';
end;
$$;

alter table files_imports.import_document enable row level security;
create policy row_scope on files_imports.import_document for all to aos_runtime
  using (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null))
  with check (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null));
create index import_document_batch on files_imports.import_document (batch_id);

alter table files_imports.staged_row disable trigger refuse_row_change;
alter table files_imports.staged_row
  add column legal_entity_id uuid,
  add column site_id uuid,
  add column store_id uuid,
  add column business_unit_id uuid;
update files_imports.staged_row r
  set legal_entity_id = b.legal_entity_id, site_id = b.site_id, store_id = b.store_id,
      business_unit_id = b.business_unit_id
  from files_imports.import_batch b where b.id = r.batch_id;
alter table files_imports.staged_row enable trigger refuse_row_change;
alter table files_imports.staged_row enable row level security;
create policy row_scope on files_imports.staged_row for all to aos_runtime
  using (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null))
  with check (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null));

-- A value entered by a person in a staged row (section 5 "Entered by a person"; PRD-IMP-009): who, when, the reason
-- and the suggestion it came from, and the batch version it made. The original cell is never overwritten: the entry is
-- its own row, and the latest entry of a field is the row's value.
create table files_imports.staged_value_entry (
  id uuid primary key,
  batch_id uuid not null references files_imports.import_batch (id),
  staged_row_id uuid not null references files_imports.staged_row (id),
  field text not null,
  value text not null,
  reason text not null,
  suggestion jsonb,
  batch_version_id uuid not null,
  entered_by_user_id uuid not null,
  entered_at timestamptz not null,
  legal_entity_id uuid,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  recorded_at timestamptz not null default now(),
  constraint staged_value_entry_field check (field <> ''),
  constraint staged_value_entry_value check (value ~ '\S'),
  constraint staged_value_entry_reason check (reason ~ '\S'),
  constraint staged_value_entry_suggestion check (suggestion is null or jsonb_typeof(suggestion) = 'object')
);
create index staged_value_entry_row on files_imports.staged_value_entry (staged_row_id);
create index staged_value_entry_batch on files_imports.staged_value_entry (batch_id);
create trigger refuse_row_change before update or delete on files_imports.staged_value_entry
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on files_imports.staged_value_entry
  for each statement execute function kernel.refuse_change();
alter table files_imports.staged_value_entry enable row level security;
create policy row_scope on files_imports.staged_value_entry for all to aos_runtime
  using (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null))
  with check (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null));

-- A row issue of the validation report (8.2; PRD-IMP-007): its class, severity, place, original value, what is wrong,
-- the correction needed and the rule applied, found by one validation run of one batch version. A Warning is marked
-- seen by the person who submits the batch; a later mark by another person replaces an earlier one, and each mark is
-- audited (product owner, 11 Oct 2026). Nothing else of it changes.
create table files_imports.row_issue (
  id uuid primary key,
  batch_id uuid not null references files_imports.import_batch (id),
  batch_version_id uuid not null,
  run_at timestamptz not null,
  document_id uuid references files_imports.import_document (id),
  staged_row_id uuid references files_imports.staged_row (id),
  sheet text,
  row_number integer,
  column_letters text,
  field text,
  class text not null,
  severity text not null,
  code text not null,
  correction text not null,
  rule text not null,
  original text,
  restricted_class text,
  missing jsonb not null default '[]',
  seen_by_user_id uuid,
  seen_at timestamptz,
  legal_entity_id uuid,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  recorded_at timestamptz not null default now(),
  constraint row_issue_class check (class ~ '^([A-L]-[0-9]+|handler|required|rule|calculation)$'),
  constraint row_issue_severity check (severity in ('Blocking', 'Warning', 'Note')),
  constraint row_issue_code check (code <> '' and correction <> '' and rule <> ''),
  constraint row_issue_row check (row_number is null or row_number >= 1),
  constraint row_issue_missing check (jsonb_typeof(missing) = 'array'),
  constraint row_issue_seen check (
    (seen_by_user_id is null) = (seen_at is null) and (seen_by_user_id is null or severity = 'Warning')),
  constraint row_issue_class_held check (restricted_class is null or restricted_class in ('salary-and-payroll',
    'identity-documents', 'bank-details', 'customer-contact', 'cost', 'margin', 'employee-photos', 'location-evidence'))
);
create index row_issue_batch on files_imports.row_issue (batch_id, batch_version_id);

-- A Warning is marked seen, by a person who has not marked it before; nothing else of an issue ever changes.
create function files_imports.guard_issue_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if tg_op = 'UPDATE' and new.seen_by_user_id is not null
     and new.seen_by_user_id is distinct from old.seen_by_user_id
     and (pg_catalog.to_jsonb(new) - 'seen_by_user_id' - 'seen_at')
       = (pg_catalog.to_jsonb(old) - 'seen_by_user_id' - 'seen_at') then
    return new;
  end if;
  raise exception 'a row issue changes only by a Warning being marked seen' using errcode = 'AO003';
end;
$$;
revoke execute on function files_imports.guard_issue_change() from public;
create trigger guard_issue_change before update or delete on files_imports.row_issue
  for each row execute function files_imports.guard_issue_change();
create trigger refuse_truncate before truncate on files_imports.row_issue
  for each statement execute function kernel.refuse_change();
alter table files_imports.row_issue enable row level security;
create policy row_scope on files_imports.row_issue for all to aos_runtime
  using (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null))
  with check (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null));

-- A control total a file reports against the sum of its lines (6.6, 8.1; G-1, K-1; PRD-IMP-013), found by one
-- validation run of one batch version. The sum is Unknown (null) when any line's value is Unknown; never zero.
create table files_imports.control_total (
  id uuid primary key,
  batch_id uuid not null references files_imports.import_batch (id),
  batch_version_id uuid not null,
  run_at timestamptz not null,
  sheet text not null,
  row_number integer not null,
  column_name text not null,
  reported text,
  summed text,
  legal_entity_id uuid,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  recorded_at timestamptz not null default now(),
  constraint control_total_row check (row_number >= 1),
  constraint control_total_column check (column_name <> '')
);
create index control_total_batch on files_imports.control_total (batch_id, batch_version_id);
create trigger refuse_row_change before update or delete on files_imports.control_total
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on files_imports.control_total
  for each statement execute function kernel.refuse_change();
alter table files_imports.control_total enable row level security;
create policy row_scope on files_imports.control_total for all to aos_runtime
  using (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null))
  with check (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null));

grant select, insert on files_imports.staged_value_entry to aos_runtime;
grant select, insert, update on files_imports.row_issue to aos_runtime;
grant select, insert on files_imports.control_total to aos_runtime;
