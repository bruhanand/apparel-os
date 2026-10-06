-- The setup record of a new Organisation (access-and-approvals 9.11, 13.1; PRD-ACS-023, DEC-101, DEC-112;
-- S1-F01-T10). Runs as aos_migration (code-house-rules 5.1).

-- Written once, in the setup step's transaction, under the `setup` service identity. It holds the SHA-256 fingerprint
-- of the request's non-secret fields and the version of its canonical form, never a password or any form of one: a
-- rerun's temporary passwords are verified against access.password_credential instead. It names the first Admin and
-- the first approver, the two users the operator's recovery command may restore (access-and-approvals 3.2; DEC-116).
-- At most one row; append-only. Read by the setup step and the recovery command, which act before any scope applies
-- (code-house-rules 6.3).
create table access.setup_record (
  id uuid primary key,
  organisation_code text not null unique,
  fingerprint text not null,
  canonical_form_version text not null,
  first_admin_user_id uuid not null references access.app_user (id),
  first_approver_user_id uuid not null references access.app_user (id),
  recorded_at timestamptz not null default now(),
  constraint setup_record_organisation_code check (organisation_code <> ''),
  constraint setup_record_fingerprint check (fingerprint ~ '^[0-9a-f]{64}$'),
  constraint setup_record_canonical_form_version check (canonical_form_version <> ''),
  constraint setup_record_two_users check (first_admin_user_id <> first_approver_user_id)
);
-- At most one row (access-and-approvals 13.1): of two setup runs at once, the second's insert waits and then fails.
create unique index setup_record_one_row on access.setup_record ((true));

create trigger refuse_row_change before update or delete on access.setup_record
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.setup_record
  for each statement execute function kernel.refuse_change();

grant select, insert on access.setup_record to aos_runtime;
