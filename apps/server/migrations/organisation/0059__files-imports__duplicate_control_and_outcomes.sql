-- Duplicate control, governed revisions and the outcomes of publishing (imports-and-opening-data 7.1 to 7.4, 13.1, 14,
-- 15.1; domain-model invariant 20; PRD-IMP-011, PRD-IMP-012, PRD-IMP-013, PRD-INT-002, PRD-INT-005, PRD-ACP-012,
-- PRD-MOD-003, PRD-SEC-005; S1-F06-T04). Runs as aos_migration, which owns everything it creates (code-house-rules
-- 5.1). Compatible with the version running (code-house-rules 4.2): the new columns of a document are nullable, so a
-- document the running version writes is admitted, and the guards only admit more.

-- A document's source identity (7.1): the target, the scope key its handler names and the document reference. It is
-- the idempotency key of publishing (PRD-INT-002). The content hash is that of the document's values as published,
-- so a document with the same identity and content is a duplicate and one with other content a conflict (7.2). A
-- governed revision names the published document it revises, and that document then names the revision that replaced
-- it (7.3). A document published before this migration keeps no content hash: its content is Unknown, so another
-- document with its identity is a conflict, never a duplicate (PRD-MOD-015).
alter table files_imports.import_document disable trigger guard_document_change;
alter table files_imports.import_document
  add column target text,
  add column scope_key text,
  add column content_hash text,
  add column revises_document_id uuid references files_imports.import_document (id),
  add column replaced_by_document_id uuid references files_imports.import_document (id);
-- The scope keys the stage 1 handlers name: a master's record type (7.1 "Master create or update").
update files_imports.import_document d
  set target = b.target,
      scope_key = case b.target when 'merchandise' then 'merchandise.style' else b.target end
  from files_imports.import_batch b where b.id = d.batch_id;
alter table files_imports.import_document enable trigger guard_document_change;
alter table files_imports.import_document
  add constraint import_document_identity check ((target is null) = (scope_key is null)
    and (target is null or (target <> '' and scope_key <> ''))),
  add constraint import_document_content check (content_hash is null or state = 'Published'),
  add constraint import_document_revises check (revises_document_id is null or state = 'Published'),
  add constraint import_document_replaced check (replaced_by_document_id is null or state = 'Published'),
  add constraint import_document_not_itself check (revises_document_id is distinct from id
    and replaced_by_document_id is distinct from id);

-- The last guard (7.2; 15.1; domain-model invariant 20): one published document of each source identity that no
-- revision has replaced, so two publishes at once give one effect (PRD-INT-005).
create unique index import_document_published_identity on files_imports.import_document (target, scope_key, reference)
  where state = 'Published' and replaced_by_document_id is null;
create index import_document_revises on files_imports.import_document (revises_document_id);

-- A document changes only by being excluded or put back while Staged; by being published, once, never while excluded,
-- with its content hash and the document it revises; or, once published, by naming the revision that replaced it,
-- once.
create or replace function files_imports.guard_document_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  old_rest jsonb := pg_catalog.to_jsonb(old) - 'state' - 'published_at' - 'excluded' - 'content_hash'
    - 'revises_document_id' - 'replaced_by_document_id';
  new_rest jsonb := pg_catalog.to_jsonb(new) - 'state' - 'published_at' - 'excluded' - 'content_hash'
    - 'revises_document_id' - 'replaced_by_document_id';
begin
  if old_rest = new_rest and old.state = 'Staged' and new.replaced_by_document_id is null and (
       (new.state = 'Staged' and new.published_at is null and new.excluded <> old.excluded
        and new.content_hash is null and new.revises_document_id is null)
    or (new.state = 'Published' and not old.excluded and not new.excluded)) then
    return new;
  end if;
  if old_rest = new_rest and old.state = 'Published' and new.state = 'Published'
     and new.published_at = old.published_at and new.excluded = old.excluded
     and new.content_hash is not distinct from old.content_hash
     and new.revises_document_id is not distinct from old.revises_document_id
     and old.replaced_by_document_id is null and new.replaced_by_document_id is not null then
    return new;
  end if;
  raise exception 'an import document changes only by being excluded, put back, published or replaced, once'
    using errcode = 'AO003';
end;
$$;

-- The published document of a source identity that no revision has replaced, whatever the actor's scope sees, with
-- its identifier and content hash only, which is all its callers need (7.2: checked at the start, at validation and
-- under the lock at publishing; a narrowly authorised internal function, code-house-rules 5.2, 6.2). A document of another scope is a duplicate or a
-- conflict all the same, since an identity is one across the Organisation.
create function files_imports.published_document(target text, scope_key text, reference text)
  returns table (document_id uuid, content_hash text)
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select d.id, d.content_hash from files_imports.import_document d
  where d.target = published_document.target and d.scope_key = published_document.scope_key
    and d.reference = published_document.reference and d.state = 'Published' and d.replaced_by_document_id is null
$$;
revoke execute on function files_imports.published_document(text, text, text) from public;
grant execute on function files_imports.published_document(text, text, text) to aos_runtime;

-- Whether a stored file is read by a batch for the same target and layout that has not Failed, whatever the actor's
-- scope sees (7.2 "Same file"; 13.1). It answers yes or no only (code-house-rules 5.2, 6.2).
create function files_imports.file_in_open_batch(stored_file_id uuid, target text, layout_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from files_imports.import_batch b
    join files_imports.layout_version v on v.id = b.layout_version_id
    where b.stored_file_id = file_in_open_batch.stored_file_id and b.target = file_in_open_batch.target
      and v.layout_id = file_in_open_batch.layout_id and b.state <> 'Failed')
$$;
revoke execute on function files_imports.file_in_open_batch(uuid, text, uuid) from public;
grant execute on function files_imports.file_in_open_batch(uuid, text, uuid) to aos_runtime;

-- The classes of 7.2 the validation report names beside those of 8.3: a duplicate, a conflict and a governed
-- revision of a published document.
alter table files_imports.row_issue drop constraint row_issue_class;
alter table files_imports.row_issue add constraint row_issue_class
  check (class ~ '^([A-L]-[0-9]+|handler|required|rule|calculation|duplicate|conflict|revision)$');

-- An outcome (7.4): the batch version it was attempted at, the quantities and values of the measures the handler
-- names, and the control totals as reported, summed and accepted; and the batch's scope facts, so the import outcomes
-- report reads it under row-level security as the batch is (14; PRD-SEC-005).
alter table files_imports.import_outcome disable trigger refuse_row_change;
alter table files_imports.import_outcome
  add column batch_version_id uuid,
  add column measures jsonb not null default '[]',
  add column control_totals jsonb not null default '[]',
  add column legal_entity_id uuid,
  add column site_id uuid,
  add column store_id uuid,
  add column business_unit_id uuid;
update files_imports.import_outcome o
  set legal_entity_id = b.legal_entity_id, site_id = b.site_id, store_id = b.store_id,
      business_unit_id = b.business_unit_id
  from files_imports.import_batch b where b.id = o.batch_id;
alter table files_imports.import_outcome enable trigger refuse_row_change;
alter table files_imports.import_outcome
  add constraint import_outcome_measures check (jsonb_typeof(measures) = 'array'),
  add constraint import_outcome_control_totals check (jsonb_typeof(control_totals) = 'array');
alter table files_imports.import_outcome enable row level security;
create policy row_scope on files_imports.import_outcome for all to aos_runtime
  using (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null))
  with check (access.row_visible('files_imports.import_batch', site_id, store_id, business_unit_id, legal_entity_id, null, null));
create index import_batch_started_at on files_imports.import_batch (started_at);
