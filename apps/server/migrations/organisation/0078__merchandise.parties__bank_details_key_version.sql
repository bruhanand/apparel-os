-- A party's bank details name the key version that encrypted them (backup-and-restore 2.3, 2.4; access-and-approvals
-- 6; POL-18.02, PRD-SEC-006; GC9-18; S1-F14-T02). Runs as aos_migration, which owns the table (code-house-rules 5.1).
-- Compatible with the version running: it only adds a nullable column, and the guard applies to rows inserted from now
-- on (code-house-rules 4.2). Rows written before keep a null: they were encrypted by the Organisation's first key
-- version (migration 0075). The version trigger of 0046 already refuses a change to the sealed value of a version.

alter table merchandise.party_bank_details add column key_version text;
create trigger require_key_version before insert on merchandise.party_bank_details
  for each row execute function kernel.require_key_version('key_version');
