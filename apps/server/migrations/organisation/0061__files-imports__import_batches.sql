-- The import part of `files-imports` for the synthetic XLSX tracer: XLSX stored files, layouts and mappings with their
-- versions, import batches, their documents and staged rows, and the outcome of each publish attempt
-- (imports-and-opening-data 3.1, 3.2, 5, 6.1, 6.2, 7.4, 11, 15.1; module-map 4.7; PRD-IMP-002, PRD-IMP-003,
-- PRD-IMP-006, PRD-IMP-010, PRD-IMP-012, PRD-IMP-013; GC9-9; S1-F06-T01). Runs as aos_migration, which owns
-- everything it creates (code-house-rules 5.1). Compatible with the version running: it only adds, and the stored
-- file's format check only widens (code-house-rules 4.2).
--
-- As built for the tracer: proposing and confirming layouts and mappings, mapping rules, row issues, control totals,
-- values entered by a person, and the scope columns of documents and rows are S1-F06-T03's; source identity and its
-- partial unique index S1-F06-T04's.

-- An import file is XLSX, found from its content (9.2).
alter table files_imports.stored_file drop constraint stored_file_format;
alter table files_imports.stored_file add constraint stored_file_format check (format in ('pdf', 'jpeg', 'png', 'xlsx'));

-- A layout: a recognised file structure for one source and document type, and the batch kinds it serves (6.1).
create table files_imports.layout (
  id uuid primary key,
  code text not null,
  source text not null,
  document_type text not null,
  kinds text[] not null,
  recorded_at timestamptz not null default now(),
  constraint layout_code unique (code),
  constraint layout_code_form check (code <> ''),
  constraint layout_source check (source <> ''),
  constraint layout_document_type check (document_type <> ''),
  constraint layout_kinds check (
    cardinality(kinds) > 0
    and kinds <@ array['create', 'update', 'opening-balance', 'historical-reference', 'transaction']::text[])
);

-- A layout's versions: the structure, never data (6.1). Proposed, Confirmed or Rejected; the confirmer differs from the
-- proposer (6.4; GC6-4, DEC-112). A version changes only by its decision, once (S1-F06-T03 decides them).
create table files_imports.layout_version (
  id uuid primary key,
  layout_id uuid not null references files_imports.layout (id),
  version integer not null,
  structure jsonb not null,
  state text not null,
  proposed_by_user_id uuid not null,
  decided_by_user_id uuid,
  decided_at timestamptz,
  recorded_at timestamptz not null default now(),
  constraint layout_version_once unique (layout_id, version),
  constraint layout_version_number check (version >= 1),
  constraint layout_version_shape check (structure ->> 'shape' = 'layout-version/1'),
  constraint layout_version_state check (state in ('Proposed', 'Confirmed', 'Rejected')),
  constraint layout_version_decided
    check ((state = 'Proposed') = (decided_by_user_id is null) and (decided_by_user_id is null) = (decided_at is null)),
  constraint layout_version_independent check (decided_by_user_id is distinct from proposed_by_user_id)
);

-- A mapping: how one layout version fills one target's fields; layout version and target fixed (6.2, 15.1).
create table files_imports.mapping (
  id uuid primary key,
  code text not null,
  layout_version_id uuid not null references files_imports.layout_version (id),
  target text not null,
  recorded_at timestamptz not null default now(),
  constraint mapping_code unique (code),
  constraint mapping_code_form check (code <> ''),
  constraint mapping_target check (target <> '')
);
create index mapping_layout_version on files_imports.mapping (layout_version_id);

-- A mapping's versions, with the same proposal states as a layout's (6.2, 6.4).
create table files_imports.mapping_version (
  id uuid primary key,
  mapping_id uuid not null references files_imports.mapping (id),
  version integer not null,
  fields jsonb not null,
  state text not null,
  proposed_by_user_id uuid not null,
  decided_by_user_id uuid,
  decided_at timestamptz,
  recorded_at timestamptz not null default now(),
  constraint mapping_version_once unique (mapping_id, version),
  constraint mapping_version_number check (version >= 1),
  constraint mapping_version_shape check (fields ->> 'shape' = 'mapping-version/1'),
  constraint mapping_version_state check (state in ('Proposed', 'Confirmed', 'Rejected')),
  constraint mapping_version_decided
    check ((state = 'Proposed') = (decided_by_user_id is null) and (decided_by_user_id is null) = (decided_at is null)),
  constraint mapping_version_independent check (decided_by_user_id is distinct from proposed_by_user_id)
);

-- A version changes only by its decision, once, nothing else changed (6.1: a version is never edited).
create function files_imports.guard_version_decision() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if old.state = 'Proposed' and new.state in ('Confirmed', 'Rejected')
     and (pg_catalog.to_jsonb(new) - 'state' - 'decided_by_user_id' - 'decided_at')
       = (pg_catalog.to_jsonb(old) - 'state' - 'decided_by_user_id' - 'decided_at') then
    return new;
  end if;
  raise exception 'a layout or mapping version changes only by its decision, once' using errcode = 'AO003';
end;
$$;
revoke execute on function files_imports.guard_version_decision() from public;
create trigger guard_version_decision before update on files_imports.layout_version
  for each row execute function files_imports.guard_version_decision();
create trigger guard_version_decision before update on files_imports.mapping_version
  for each row execute function files_imports.guard_version_decision();
create trigger refuse_row_change before update or delete on files_imports.layout
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on files_imports.layout
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on files_imports.mapping
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on files_imports.mapping
  for each statement execute function kernel.refuse_change();

-- An import batch: one stored file read with one layout version and one mapping version, of one kind, for one target
-- (2, 4.1). Its code comes from a `numbering` series (GC9-9). Kind, target, file and versions are fixed at start; the
-- state moves as 3.2 says. The restricted classes are those its file is held to carry: every class while its layout
-- version is not Confirmed (section 11). Scoped by its Site, Store, business unit and legal entity (15.1).
create table files_imports.import_batch (
  id uuid primary key,
  code text not null,
  kind text not null,
  target text not null,
  state text not null,
  stored_file_id uuid not null references files_imports.stored_file (id),
  file_receipt_id uuid not null,
  layout_version_id uuid not null references files_imports.layout_version (id),
  mapping_version_id uuid not null references files_imports.mapping_version (id),
  restricted_classes text[] not null,
  reader_notes jsonb not null,
  started_by_user_id uuid not null,
  started_at timestamptz not null,
  legal_entity_id uuid,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  recorded_at timestamptz not null default now(),
  constraint import_batch_code unique (code),
  constraint import_batch_code_form check (code <> ''),
  constraint import_batch_kind
    check (kind in ('create', 'update', 'opening-balance', 'historical-reference', 'transaction')),
  constraint import_batch_target check (target <> ''),
  constraint import_batch_state check (state in ('Staged', 'Validated', 'Published', 'Failed')),
  constraint import_batch_reader_notes check (jsonb_typeof(reader_notes) = 'array'),
  constraint import_batch_receipt_of_file foreign key (file_receipt_id, stored_file_id)
    references files_imports.file_receipt (id, stored_file_id),
  constraint import_batch_classes check (
    restricted_classes <@ array['salary-and-payroll', 'identity-documents', 'bank-details', 'customer-contact',
      'cost', 'margin', 'employee-photos', 'location-evidence']::text[])
);
create index import_batch_stored_file on files_imports.import_batch (stored_file_id);
create index import_batch_legal_entity on files_imports.import_batch (legal_entity_id);
create index import_batch_site on files_imports.import_batch (site_id);
create index import_batch_store on files_imports.import_batch (store_id);
create index import_batch_business_unit on files_imports.import_batch (business_unit_id);

-- A batch changes only its state, along 3.2: Staged to Validated and back, Validated to Published, Staged or Validated
-- to Failed. A Published or Failed batch is never edited.
create function files_imports.guard_batch_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if (pg_catalog.to_jsonb(new) - 'state') = (pg_catalog.to_jsonb(old) - 'state')
     and ((old.state = 'Staged' and new.state in ('Validated', 'Failed'))
       or (old.state = 'Validated' and new.state in ('Staged', 'Published', 'Failed'))) then
    return new;
  end if;
  raise exception 'an import batch changes only its state, as imports-and-opening-data 3.2 allows' using errcode = 'AO003';
end;
$$;
revoke execute on function files_imports.guard_batch_change() from public;
create trigger guard_batch_change before update on files_imports.import_batch
  for each row execute function files_imports.guard_batch_change();

alter table files_imports.import_batch enable row level security;
create policy row_scope on files_imports.import_batch for all to aos_runtime
  using (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null))
  with check (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null));

-- A document inside a batch, with its document reference: the unit of publishing (2). Staged until it is published,
-- once.
create table files_imports.import_document (
  id uuid primary key,
  batch_id uuid not null references files_imports.import_batch (id),
  reference text not null,
  state text not null,
  published_at timestamptz,
  recorded_at timestamptz not null default now(),
  constraint import_document_once unique (batch_id, reference),
  constraint import_document_reference check (reference <> ''),
  constraint import_document_state check (state in ('Staged', 'Published')),
  constraint import_document_published check ((state = 'Published') = (published_at is not null))
);

create function files_imports.guard_document_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if old.state = 'Staged' and new.state = 'Published'
     and (pg_catalog.to_jsonb(new) - 'state' - 'published_at') = (pg_catalog.to_jsonb(old) - 'state' - 'published_at') then
    return new;
  end if;
  raise exception 'an import document changes only by being published, once' using errcode = 'AO003';
end;
$$;
revoke execute on function files_imports.guard_document_change() from public;
create trigger guard_document_change before update on files_imports.import_document
  for each row execute function files_imports.guard_document_change();

-- One row of the file, with every original cell, its role, and its normalised values each with its origin (section 5).
-- The original cells never change (15.1); a data row belongs to one document, an ignored row to none.
create table files_imports.staged_row (
  id uuid primary key,
  batch_id uuid not null references files_imports.import_batch (id),
  document_id uuid references files_imports.import_document (id),
  sheet text not null,
  row_number integer not null,
  role text not null,
  hidden boolean not null,
  cells jsonb not null,
  "values" jsonb not null,
  recorded_at timestamptz not null default now(),
  constraint staged_row_once unique (batch_id, sheet, row_number),
  constraint staged_row_number check (row_number >= 1),
  constraint staged_row_role check (role in ('data', 'header', 'total', 'filler', 'note', 'ignored')),
  constraint staged_row_document check ((role = 'data') = (document_id is not null))
);
create index staged_row_document on files_imports.staged_row (document_id);
create trigger refuse_row_change before update or delete on files_imports.staged_row
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on files_imports.staged_row
  for each statement execute function kernel.refuse_change();

-- What happened to a batch and each of its documents at one publish attempt, kept for a failure as well as a success
-- (7.4; PRD-IMP-012, PRD-IMP-013). One per attempt, never changed.
create table files_imports.import_outcome (
  id uuid primary key,
  batch_id uuid not null references files_imports.import_batch (id),
  result text not null,
  refusal_code text,
  counts jsonb not null,
  documents jsonb not null,
  attempted_by_user_id uuid not null,
  attempted_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint import_outcome_result check (result in ('published', 'failed')),
  constraint import_outcome_refusal check ((result = 'failed') = (refusal_code is not null))
);
create index import_outcome_batch on files_imports.import_outcome (batch_id);
create trigger refuse_row_change before update or delete on files_imports.import_outcome
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on files_imports.import_outcome
  for each statement execute function kernel.refuse_change();

-- Layouts and mappings are written by their proposals with S1-F06-T03; until then only read here.
grant select on files_imports.layout to aos_runtime;
grant select on files_imports.layout_version to aos_runtime;
grant select on files_imports.mapping to aos_runtime;
grant select on files_imports.mapping_version to aos_runtime;
grant select, insert, update on files_imports.import_batch to aos_runtime;
grant select, insert, update on files_imports.import_document to aos_runtime;
grant select, insert on files_imports.staged_row to aos_runtime;
grant select, insert on files_imports.import_outcome to aos_runtime;
