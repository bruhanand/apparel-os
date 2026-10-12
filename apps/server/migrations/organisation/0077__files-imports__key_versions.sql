-- Stored files and file receipts name the key version that encrypted them (backup-and-restore 2.3, 2.4;
-- imports-and-opening-data 11, 15.1; POL-18.02, PRD-SEC-006; GC9-18; S1-F14-T02). Runs as aos_migration, which owns
-- both tables (code-house-rules 5.1). Compatible with the version running: it only adds a nullable column, and the
-- guard applies to rows inserted from now on (code-house-rules 4.2). Rows written before keep a null: they were
-- encrypted by the Organisation's first key version (migration 0075), and an append-only row is never changed.

alter table files_imports.stored_file add column key_version text;
create trigger require_key_version before insert on files_imports.stored_file
  for each row execute function kernel.require_key_version('key_version');

alter table files_imports.file_receipt add column key_version text;
create trigger require_key_version before insert on files_imports.file_receipt
  for each row execute function kernel.require_key_version('key_version');
