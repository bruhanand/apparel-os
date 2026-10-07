-- The stored-file part of `files-imports`: stored files, their receipts and the attachments that link a file to a record
-- of any module (imports-and-opening-data 3.1 step 2, 11, 15.1; backup-and-restore 2.1, 3.3; module-map 4.7;
-- PRD-IMP-002, PRD-SEC-005, PRD-SEC-006, PRD-MOD-011; POL-18.02; S1-F06-T05). Runs as aos_migration, which owns
-- everything it creates (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2).
--
-- All three tables are append-only (code-house-rules 7.1). The object a stored file names is written once, encrypted by
-- the application, and never overwritten or deleted by it (backup-and-restore 3.3).

create schema files_imports;
grant usage on schema files_imports to aos_runtime;

-- One row for each distinct content (the hash is taken before encryption). The object key starts with the
-- Organisation's identifier (GC9-10) and is fixed here for good. `restricted_classes` is Unknown (null) until the
-- file's classes are known, which for an evidence file is what each attachment declares (section 11); it is never
-- zero classes by default.
create table files_imports.stored_file (
  id uuid primary key,
  content_hash text not null,
  size_bytes bigint not null,
  format text not null,
  object_key text not null,
  encryption_scheme text not null,
  restricted_classes text[],
  recorded_at timestamptz not null default now(),
  constraint stored_file_content_hash unique (content_hash),
  constraint stored_file_object_key unique (object_key),
  constraint stored_file_hash_form check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint stored_file_size check (size_bytes >= 0),
  constraint stored_file_format check (format in ('pdf', 'jpeg', 'png')),
  constraint stored_file_classes check (
    restricted_classes is null or restricted_classes <@ array['salary-and-payroll', 'identity-documents',
      'bank-details', 'customer-contact', 'cost', 'margin', 'employee-photos', 'location-evidence']::text[])
);

-- Every receipt of a file: who handed it in, when, from which system, under which document reference, with which
-- name. The same bytes again add a receipt here and no second stored file (PRD-IMP-002). A null claimed reference is
-- "none claimed".
create table files_imports.file_receipt (
  id uuid primary key,
  stored_file_id uuid not null references files_imports.stored_file (id),
  received_by_kind text not null,
  received_by_id uuid not null,
  received_at timestamptz not null,
  source_system text not null,
  claimed_reference text,
  original_name text not null,
  correlation_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint file_receipt_received_by_kind check (received_by_kind in ('user', 'service-identity')),
  constraint file_receipt_source_system check (source_system <> ''),
  constraint file_receipt_claimed_reference check (claimed_reference is null or claimed_reference <> '')
);
create index file_receipt_stored_file on files_imports.file_receipt (stored_file_id);

-- A link from a stored file to one record of any module, kept as evidence: the record and its version, what it
-- evidences, who attached it and when, the restricted classes the kind of evidence carries (declared by the attaching
-- module) and the record's scope facts, which row-level security reads (access-and-approvals 7.2). A null version is
-- a record that keeps none; a null scope fact is Unknown, covered only by all-members scope (PRD-MOD-015). Never
-- edited: a link written in a transaction that rolls back is gone with it.
create table files_imports.attachment (
  id uuid primary key,
  stored_file_id uuid not null references files_imports.stored_file (id),
  record_module text not null,
  record_type text not null,
  record_id uuid not null,
  record_version_id uuid,
  evidences text not null,
  restricted_classes text[] not null,
  attached_by_kind text not null,
  attached_by_id uuid not null,
  attached_at timestamptz not null,
  legal_entity_id uuid,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  brand_id uuid,
  recorded_at timestamptz not null default now(),
  constraint attachment_attached_by_kind check (attached_by_kind in ('user', 'service-identity')),
  constraint attachment_evidences check (evidences <> ''),
  constraint attachment_classes check (
    restricted_classes <@ array['salary-and-payroll', 'identity-documents', 'bank-details', 'customer-contact',
      'cost', 'margin', 'employee-photos', 'location-evidence']::text[])
);
create unique index attachment_once on files_imports.attachment (stored_file_id, record_type, record_id,
  coalesce(record_version_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index attachment_record on files_imports.attachment (record_type, record_id);
create index attachment_legal_entity on files_imports.attachment (legal_entity_id);
create index attachment_site on files_imports.attachment (site_id);
create index attachment_store on files_imports.attachment (store_id);
create index attachment_business_unit on files_imports.attachment (business_unit_id);
create index attachment_brand on files_imports.attachment (brand_id);

create trigger refuse_row_change before update or delete on files_imports.stored_file
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on files_imports.stored_file
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on files_imports.file_receipt
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on files_imports.file_receipt
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on files_imports.attachment
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on files_imports.attachment
  for each statement execute function kernel.refuse_change();

-- The attachment is scoped by the facts of the record it is attached to, under that record's own type, so a reader
-- sees an attachment only where an effective grant on the attached record's type covers its facts (code-house-rules
-- 6.2). The exact check, and the restricted classes, are Authorise's.
alter table files_imports.attachment enable row level security;
create policy row_scope on files_imports.attachment for all to aos_runtime
  using (access.row_visible(record_type, site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible(record_type, site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

grant select, insert on files_imports.stored_file to aos_runtime;
grant select, insert on files_imports.file_receipt to aos_runtime;
grant select, insert on files_imports.attachment to aos_runtime;
