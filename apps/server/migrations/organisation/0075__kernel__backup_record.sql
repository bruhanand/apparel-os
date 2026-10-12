-- The record of each application backup in the Organisation's own database, and the guard that every encrypted value
-- names its key version (backup-and-restore 2.3, 2.4, 3.2 step 8, section 11; PRD-SEC-012, PRD-SEC-013, POL-18.02;
-- GC9-17, GC9-18; DEC-093; S1-F14-T02). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1).
-- Compatible with the version running: it only adds (code-house-rules 4.2).

-- One row for each backup that covered this Organisation, appended by the backup command as the migration role once
-- the backup is checked (3.2 steps 7 and 8), complete or failed; a failed one is never offered for restore. The row of
-- a backup is therefore in the next backup, not in its own. It holds no record data and no key: the backup's
-- identifier, the environment it was taken in, the commit of the code that took it, this database's snapshot time,
-- the backup key version's identifier (2.4), the hash of the encrypted manifest, and, for a failed backup, the kinds of
-- failure found. The directory database gets no such row (DEC-093). Only the operations view reads it, as the runtime
-- role (PRD-SEC-013).
create table kernel.backup_record (
  id uuid primary key,
  backup_id uuid not null,
  environment text not null,
  code_commit text,
  snapshot_at timestamptz not null,
  backup_key_version text not null,
  manifest_sha256 text not null,
  result text not null,
  failures text[] not null,
  finished_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint backup_record_backup unique (backup_id),
  constraint backup_record_environment check (environment in ('local', 'dev', 'kdps-test')),
  constraint backup_record_commit check (code_commit is null or code_commit <> ''),
  constraint backup_record_key_version check (backup_key_version ~ '^[0-9a-f]{32}$'),
  constraint backup_record_manifest_hash check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  constraint backup_record_result check (result in ('complete', 'failed')),
  constraint backup_record_failures check ((result = 'complete') = (cardinality(failures) = 0)),
  constraint backup_record_failure_kinds check (failures <@ array['object-missing', 'dump-hash-differs',
    'dump-does-not-decrypt', 'manifest-does-not-decrypt', 'dump-tool-failed', 'file-copy-failed']::text[])
);

-- The append-only guards (code-house-rules 7.1).
create trigger refuse_row_change before update or delete on kernel.backup_record
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on kernel.backup_record
  for each statement execute function kernel.refuse_change();

-- Read by the operations view only; written only by the backup command as the migration role (section 11).
grant select on kernel.backup_record to aos_runtime;

-- A row that holds a value encrypted under an Organisation key names the key version that encrypted it
-- (backup-and-restore 2.3, 2.4). Each table's migration adds a BEFORE INSERT trigger calling this function with the
-- column's name. Rows written before key versions were recorded keep a null: they were all encrypted by the
-- Organisation's first key version, the only one before rotation (production hosting, GC9-11), and are never changed.
create function kernel.require_key_version() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if coalesce(pg_catalog.to_jsonb(new) ->> tg_argv[0], '') !~ '^[0-9a-f]{32}$' then
    raise exception 'a value encrypted under an Organisation key names its key version: %.%.%',
      tg_table_schema, tg_table_name, tg_argv[0] using errcode = 'AO018';
  end if;
  return new;
end;
$$;
revoke execute on function kernel.require_key_version() from public;
