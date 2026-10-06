-- The access module's settings and the failed sign-ins throttling counts (access-and-approvals 3.1, 3.2, 3.3;
-- code-house-rules 7.3, 12.14; DEC-116; S1-F01-T08). Runs as aos_migration (code-house-rules 5.1).

-- A setting of access, such as the sign-in throttling, the password rules or a session limit (code-house-rules
-- 12.14; PRD-MOD-010). It has no default anywhere: a setting with no Approved version in force is not set, and what
-- needs it stays unavailable.
create table access.setting (
  id uuid primary key,
  setting_key text not null unique,
  recorded_at timestamptz not null default now(),
  constraint setting_key_form check (setting_key ~ '^access\.[a-z][a-z0-9-]*$')
);

-- A setting's effective-dated versions (code-house-rules 7.3). The value's shape is the versioned Zod schema named by
-- value_format (code-house-rules 3.3). The origin says where it came from: KDPS's answer, a setting of the test setup
-- on kdps-test, or synthetic (12.14; 11.1), so nothing synthetic passes for a KDPS value.
create table access.setting_version (
  id uuid primary key,
  setting_id uuid not null references access.setting (id),
  value_format text not null,
  value jsonb not null,
  origin text not null,
  valid_during daterange not null,
  decision text not null,
  recorded_at timestamptz not null default now(),
  constraint setting_version_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint setting_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint setting_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint setting_version_no_overlap exclude using gist (setting_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index setting_version_setting on access.setting_version (setting_id);
create trigger guard_version_change before update on access.setting_version
  for each row execute function access.guard_version_change();

-- A failed sign-in, as throttling counts it, by the typed login and by the source address (access-and-approvals 3.1;
-- DEC-116). The typed login is kept only as a keyed digest under the Organisation's key, held outside the database,
-- so a typed login that matched no user is never kept in a form a copy of the database could read (PRD-SEC-014;
-- numbering-and-audit 5.2). A login that exists and one that does not are counted alike. The access record of the
-- attempt is audit's (PRD-SEC-007); this table only counts.
create table access.sign_in_failure (
  id uuid primary key,
  login_digest text not null,
  network_address inet not null,
  failed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint sign_in_failure_login_digest check (login_digest ~ '^[0-9a-f]{64}$')
);
create index sign_in_failure_login on access.sign_in_failure (login_digest, failed_at);
create index sign_in_failure_address on access.sign_in_failure (network_address, failed_at);

create trigger refuse_row_change before update or delete on access.sign_in_failure
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.sign_in_failure
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.setting
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.setting
  for each statement execute function kernel.refuse_change();

grant select, insert on access.setting to aos_runtime;
grant select, insert, update on access.setting_version to aos_runtime;
grant select, insert on access.sign_in_failure to aos_runtime;
