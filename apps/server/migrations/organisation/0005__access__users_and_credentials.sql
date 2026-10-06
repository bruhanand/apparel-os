-- The access module's schema: users and their versions, password credentials, second factors, sessions, service
-- identities and their credentials (access-and-approvals 2.1, 2.3, 3, 6, 13.1; module-map 4.3; S1-F01-T08).
-- Runs as aos_migration, which owns everything it creates (code-house-rules 5.1).
--
-- These tables are read by Authenticate and sign-in before any actor exists, so they are unscoped
-- (code-house-rules 6.3). Only access code reads them (PRD-MOD-002). Passwords, credentials and session identifiers
-- are held only as hashes, and second-factor secrets only encrypted under the Organisation's key, held outside the
-- database (access-and-approvals 6; PRD-SEC-006, PRD-SEC-014, POL-18.02).

create schema access;
grant usage on schema access to aos_runtime;

create extension if not exists btree_gist schema public;

-- The guard of an effective-dated version row (code-house-rules 7.3). It admits only: any change to a version still
-- Awaiting approval (its decision is recorded once, from there); on an Approved version, moving the end of
-- valid_during earlier and never to or before its start, and recording its withdrawal once, from null. A Rejected
-- version never changes. Whether a new end is today or later is the command's check under the Organisation's
-- timezone, which a trigger cannot see (code-house-rules 7.3, section 9). Columns are compared through jsonb, so the
-- one function serves every version table, with or without a withdrawal column.
create function access.guard_version_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  old_rest jsonb := pg_catalog.to_jsonb(old) - 'valid_during' - 'withdrawal_id';
  new_rest jsonb := pg_catalog.to_jsonb(new) - 'valid_during' - 'withdrawal_id';
  old_withdrawal jsonb := pg_catalog.to_jsonb(old) -> 'withdrawal_id';
  new_withdrawal jsonb := pg_catalog.to_jsonb(new) -> 'withdrawal_id';
begin
  if old.decision = 'Awaiting approval' then
    return new;
  end if;
  if old.decision = 'Approved' and new_rest = old_rest
     and pg_catalog.lower(new.valid_during) is not distinct from pg_catalog.lower(old.valid_during)
     and (new.valid_during = old.valid_during
          or (pg_catalog.upper(new.valid_during) > pg_catalog.lower(new.valid_during)
              and (pg_catalog.upper_inf(old.valid_during)
                   or pg_catalog.upper(new.valid_during) < pg_catalog.upper(old.valid_during))))
     and (new_withdrawal is not distinct from old_withdrawal
          or (old_withdrawal is null or old_withdrawal = 'null'::jsonb)) then
    return new;
  end if;
  raise exception 'a decided version of %.% changes only as code-house-rules 7.3 allows', tg_table_schema, tg_table_name
    using errcode = 'AO003';
end;
$$;
revoke execute on function access.guard_version_change() from public;

-- A user: one person's login in one Organisation (access-and-approvals 2.1; PRD-ACS-020). Never deleted and never
-- changed: the login is never given to another person, even after the user ends, and a change to the user's details
-- or state is a version. Unique on the login without regard to letter case. A partner user names its partner
-- (access-and-approvals 2.2), whose record arrives with `partners` in stage 5, so no foreign key.
create table access.app_user (
  id uuid primary key,
  login text not null,
  partner_id uuid,
  recorded_at timestamptz not null default now(),
  constraint app_user_login check (login <> '')
);
create unique index app_user_login_key on access.app_user (pg_catalog.lower(login));
create index app_user_partner on access.app_user (partner_id);

-- A user's versions (access-and-approvals 2.1, 9.11; code-house-rules 7.3; DEC-112): the display name and the state,
-- effective-dated, Awaiting approval until decided by an authorised person other than the preparer. A user with no
-- Approved version in force has no state in force and cannot sign in (7.1 step 1). State names: design-language 7
-- (DM-4, DEC-105).
create table access.app_user_version (
  id uuid primary key,
  app_user_id uuid not null references access.app_user (id),
  display_name text not null,
  state text not null,
  valid_during daterange not null,
  decision text not null,
  recorded_at timestamptz not null default now(),
  constraint app_user_version_display_name check (display_name <> ''),
  constraint app_user_version_state check (state in ('Active', 'Disabled', 'Ended')),
  constraint app_user_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint app_user_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint app_user_version_no_overlap exclude using gist (app_user_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index app_user_version_user on access.app_user_version (app_user_id);
create trigger guard_version_change before update on access.app_user_version
  for each row execute function access.guard_version_change();

-- A user's password credentials (access-and-approvals 3.2, 13.1): an Argon2id hash only, the current one per user
-- unique. A temporary password names the user version it was entered with (RR-213). A replaced credential keeps no
-- hash at all, so no form of a password outlives it, and a replay can no longer be compared with it
-- (code-house-rules 12.5, item 3).
create table access.password_credential (
  id uuid primary key,
  app_user_id uuid not null references access.app_user (id),
  password_hash text,
  temporary boolean not null,
  entered_with_version_id uuid references access.app_user_version (id),
  replaced_at timestamptz,
  recorded_at timestamptz not null default now(),
  constraint password_credential_hash check (password_hash like '$argon2id$%'),
  constraint password_credential_current_has_hash check ((replaced_at is null) = (password_hash is not null))
);
create unique index password_credential_current on access.password_credential (app_user_id) where replaced_at is null;
create index password_credential_user on access.password_credential (app_user_id);
create index password_credential_version on access.password_credential (entered_with_version_id);

-- A user's second factor: an authenticator app (access-and-approvals 3.2; PRD-SEC-001, POL-02.17). The secret is
-- encrypted in the application under the Organisation's key before it reaches PostgreSQL (access-and-approvals 6).
-- At most one is being set up and at most one is Confirmed per user. The last time step whose code was accepted is
-- kept, so a code is never accepted twice.
create table access.second_factor (
  id uuid primary key,
  app_user_id uuid not null references access.app_user (id),
  secret_scheme text not null,
  secret_ciphertext text not null,
  state text not null,
  last_used_step bigint,
  confirmed_at timestamptz,
  recorded_at timestamptz not null default now(),
  constraint second_factor_state check (state in ('Setting up', 'Confirmed', 'Replaced', 'Reset')),
  constraint second_factor_confirmed check ((state in ('Confirmed', 'Reset')) = (confirmed_at is not null))
);
create index second_factor_user on access.second_factor (app_user_id);
create unique index second_factor_setting_up on access.second_factor (app_user_id) where state = 'Setting up';
create unique index second_factor_confirmed_one on access.second_factor (app_user_id) where state = 'Confirmed';

-- A session (access-and-approvals 3.3): the SHA-256 hash of the cookie's random identifier, never the identifier.
-- User, kind and device are fixed; Revoked and Ended are final. A session on a registered billing device is a shared
-- POS session (POL-02.18); devices arrive in S1-F12, so no foreign key yet.
create table access.session (
  id uuid primary key,
  app_user_id uuid not null references access.app_user (id),
  identifier_hash text not null unique,
  kind text not null,
  device_id uuid,
  state text not null,
  started_at timestamptz not null,
  last_activity_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint session_identifier_hash check (identifier_hash ~ '^[0-9a-f]{64}$'),
  constraint session_kind check (kind in ('office', 'shared-pos')),
  constraint session_kind_device check ((kind = 'shared-pos') = (device_id is not null)),
  constraint session_state check (state in ('In force', 'Locked', 'Ended', 'Revoked'))
);
create index session_app_user on access.session (app_user_id);
create index session_device on access.session (device_id);

create function access.guard_session_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if new.id <> old.id or new.app_user_id <> old.app_user_id or new.identifier_hash <> old.identifier_hash
     or new.kind <> old.kind or new.device_id is distinct from old.device_id or new.started_at <> old.started_at
     or new.recorded_at <> old.recorded_at then
    raise exception 'a session keeps its user, identifier, kind, device and start' using errcode = 'AO004';
  end if;
  if old.state in ('Ended', 'Revoked') and new is distinct from old then
    raise exception 'an ended or revoked session is final' using errcode = 'AO004';
  end if;
  return new;
end;
$$;
revoke execute on function access.guard_session_change() from public;
create trigger guard_session_change before update on access.session
  for each row execute function access.guard_session_change();

-- A service identity: a non-human actor with its own audit identity (access-and-approvals 2.3; PRD-SEC-018). An
-- internal identity runs jobs and delivers the outbox; an outside caller presents a credential.
create table access.service_identity (
  id uuid primary key,
  code text not null unique,
  kind text not null,
  recorded_at timestamptz not null default now(),
  constraint service_identity_code check (code <> ''),
  constraint service_identity_kind check (kind in ('internal', 'outside-caller'))
);

create table access.service_identity_version (
  id uuid primary key,
  service_identity_id uuid not null references access.service_identity (id),
  state text not null,
  valid_during daterange not null,
  decision text not null,
  recorded_at timestamptz not null default now(),
  constraint service_identity_version_state check (state in ('Active', 'Disabled')),
  constraint service_identity_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint service_identity_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint service_identity_version_no_overlap exclude using gist (service_identity_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index service_identity_version_identity on access.service_identity_version (service_identity_id);
create trigger guard_version_change before update on access.service_identity_version
  for each row execute function access.guard_version_change();

-- A service identity's credential: the secret shown once, stored only as an Argon2id hash, revocable, never logged
-- (access-and-approvals 2.3; code-house-rules 12.6; PRD-SEC-014). Revoking it is final.
create table access.service_credential (
  id uuid primary key,
  service_identity_id uuid not null references access.service_identity (id),
  secret_hash text not null,
  revoked_at timestamptz,
  recorded_at timestamptz not null default now(),
  constraint service_credential_hash check (secret_hash like '$argon2id$%')
);
create index service_credential_identity on access.service_credential (service_identity_id);

create function access.guard_service_credential_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if new.id <> old.id or new.service_identity_id <> old.service_identity_id or new.secret_hash <> old.secret_hash
     or new.recorded_at <> old.recorded_at or old.revoked_at is not null then
    raise exception 'a service credential changes only by being revoked, once' using errcode = 'AO004';
  end if;
  return new;
end;
$$;
revoke execute on function access.guard_service_credential_change() from public;
create trigger guard_service_credential_change before update on access.service_credential
  for each row execute function access.guard_service_credential_change();

-- Never deleted or changed (code-house-rules 7.1).
create trigger refuse_row_change before update or delete on access.app_user
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.app_user
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.service_identity
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.service_identity
  for each statement execute function kernel.refuse_change();

-- The runtime role's privileges (code-house-rules 5.2). No DELETE anywhere: a user, a version, a credential and a
-- session are kept with their history (PRD-ACS-013).
grant select, insert on access.app_user to aos_runtime;
grant select, insert, update on access.app_user_version to aos_runtime;
grant select, insert, update on access.password_credential to aos_runtime;
grant select, insert, update on access.second_factor to aos_runtime;
grant select, insert, update on access.session to aos_runtime;
grant select, insert on access.service_identity to aos_runtime;
grant select, insert, update on access.service_identity_version to aos_runtime;
grant select, insert, update on access.service_credential to aos_runtime;
