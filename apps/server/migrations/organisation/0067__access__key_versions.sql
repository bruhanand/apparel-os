-- Key versions in `access` (backup-and-restore 2.3, 2.4, 10.2, section 11; access-and-approvals 6; POL-18.02,
-- PRD-SEC-006, PRD-SEC-014; GC9-18; S1-F14-T02). Runs as aos_migration, which owns everything it creates
-- (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2); the new column is
-- nullable for rows written before it, and the guard applies to rows inserted from now on.

-- The identifiers of the Organisation's data key versions: the identifier (HMAC-SHA-256 of a fixed label under the
-- key, shortened; 2.4), what the key is for, and when it was first used. Never the key. The start check of the server
-- compares the key in its environment with these and refuses to start on a difference; when none is listed yet, it
-- records the environment's key as the first version (backup-and-restore 2.4 "As built"). Unscoped: technical rows
-- with no scope fact, read only by `access` code at start and by the backup command (section 11).
create table access.key_version (
  id uuid primary key,
  identifier text not null,
  purpose text not null,
  first_used_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint key_version_identifier unique (identifier),
  constraint key_version_identifier_form check (identifier ~ '^[0-9a-f]{32}$'),
  constraint key_version_purpose check (purpose in ('organisation-data'))
);

-- The append-only guards (code-house-rules 7.1).
create trigger refuse_row_change before update or delete on access.key_version
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.key_version
  for each statement execute function kernel.refuse_change();

grant select, insert on access.key_version to aos_runtime;

-- An authenticator secret names the key version that encrypted it (2.3). Null on rows written before this column.
alter table access.second_factor add column secret_key_version text;
create trigger require_key_version before insert on access.second_factor
  for each row execute function kernel.require_key_version('secret_key_version');
