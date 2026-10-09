-- Who may read an attached record's files, as its owning module answers (imports-and-opening-data 11 "As built for
-- the owning module's readers"; module-map section 3, rule 6; product owner, 9 Oct 2026, RR-452; S1-F08 review). Runs
-- as aos_migration (code-house-rules 5.1). Compatible with the version running: the policy only admits more, and only
-- inside a transaction that names one record (code-house-rules 4.2).
--
-- A record whose owning module admits people without any grant on its type, such as an exception's owner, holder of
-- its owning role or escalation recipient (access-and-approvals 12.4), has its own reader: files-imports asks that
-- module whether the actor may read the record, and only then names the record for the rest of its transaction in
-- `aos.admitted_record`, as `<record type>:<record id>`. The attachment's policy admits the rows of that one record
-- beside those a grant covers. The restricted field classes are still Authorise's (section 11).

-- Whether the transaction names this record as one its owning module admitted the actor to.
create function files_imports.record_admitted(record_type text, record_id uuid) returns boolean
  language sql
  stable
  security invoker
  set search_path = pg_catalog
as $$
  select pg_catalog.current_setting('aos.admitted_record', true)
    = record_admitted.record_type || ':' || record_admitted.record_id::text
$$;
revoke execute on function files_imports.record_admitted(text, uuid) from public;
grant execute on function files_imports.record_admitted(text, uuid) to aos_runtime;

drop policy row_scope on files_imports.attachment;
create policy row_scope on files_imports.attachment for all to aos_runtime
  using (access.row_visible(record_type, site_id, store_id, business_unit_id, legal_entity_id, brand_id, null)
    or files_imports.record_admitted(record_type, record_id))
  with check (access.row_visible(record_type, site_id, store_id, business_unit_id, legal_entity_id, brand_id, null)
    or files_imports.record_admitted(record_type, record_id));

-- The record an attachment belongs to, by its type and identifier only, so files-imports can ask that record's owning
-- module before the attachment's row is visible to the actor. Nothing else of the row (code-house-rules 6.2: a narrowly
-- authorised internal function, owned by the migration role, executable only by the runtime role).
create function files_imports.attached_record(attachment_id uuid) returns table (record_type text, record_id uuid)
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select a.record_type, a.record_id from files_imports.attachment a where a.id = attached_record.attachment_id
$$;
revoke execute on function files_imports.attached_record(uuid) from public;
grant execute on function files_imports.attached_record(uuid) to aos_runtime;
