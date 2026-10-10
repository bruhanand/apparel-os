-- Devices in `access`: the device's identity, its key and its state, and the one-time challenges a device signs to
-- prove itself (access-and-approvals 2.4, 3.3, 13.1; offline-counter 3.1 to 3.4, 12.3; PRD-OFF-002, PRD-OFF-010,
-- PRD-SEC-008; DEC-116; S1-F12-T01). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1).
-- Compatible with the version running: it only adds (4.2), and the session's new foreign key holds already, since no
-- session names a device yet.
--
-- These tables are read by sign-in before any actor exists, so they are unscoped (code-house-rules 6.3); only access
-- code reads them (PRD-MOD-002). The billing facts of a device (its Store and units) are `pos`'s (offline-counter 3.1).
-- No device is registered here (AGENTS.md "Never invent a value").

-- A device: its code, unique in the Organisation without regard to letter case (access-and-approvals 2.4), its label,
-- and once enrolled its public key, an ECDSA P-256 key as a JWK, set once at enrolment and never changed: a new key is
-- a new device (offline-counter 3.2, 3.5). Its state lives in its versions. Locked by enrolment as its own record.
create table access.device (
  id uuid primary key,
  code text not null,
  label text not null,
  public_key jsonb,
  enrolled_at timestamptz,
  recorded_at timestamptz not null default now(),
  constraint device_code check (code <> ''),
  constraint device_label check (label <> ''),
  constraint device_key_with_enrolment check ((public_key is null) = (enrolled_at is null))
);
create unique index device_code_unique on access.device (pg_catalog.lower(code));

create function access.guard_device_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if new.id <> old.id or new.code <> old.code or new.label <> old.label or new.recorded_at <> old.recorded_at then
    raise exception 'a device keeps its identifier, code and label' using errcode = 'AO004';
  end if;
  if old.public_key is not null and (new.public_key is distinct from old.public_key
     or new.enrolled_at is distinct from old.enrolled_at) then
    raise exception 'a device''s key is set once, at enrolment, and never changed' using errcode = 'AO004';
  end if;
  return new;
end;
$$;
revoke execute on function access.guard_device_change() from public;
create trigger guard_device_change before update on access.device
  for each row execute function access.guard_device_change();

-- A device's states, in order (offline-counter 3.1; GC8-7, DEC-116): Setting up when registered, Active once enrolled,
-- then Revoked (reported lost, DEC-092) or Ended (retired), both final. Append-only: the latest version is the state.
-- Each version follows the one before it by a step the trigger admits, so two commands can never write one version
-- number twice (the unique key) or skip a state.
create table access.device_version (
  id uuid primary key,
  device_id uuid not null references access.device (id),
  version integer not null,
  state text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint device_version_state check (state in ('Setting up', 'Active', 'Revoked', 'Ended')),
  constraint device_version_positive check (version >= 1),
  constraint device_version_unique unique (device_id, version)
);

create function access.check_device_version() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  previous text;
begin
  if new.version = 1 then
    if new.state <> 'Setting up' then
      raise exception 'a device starts Setting up' using errcode = 'AO004';
    end if;
    return new;
  end if;
  select v.state into previous from access.device_version v
   where v.device_id = new.device_id and v.version = new.version - 1;
  if previous is null
     or not ((previous = 'Setting up' and new.state in ('Active', 'Revoked', 'Ended'))
             or (previous = 'Active' and new.state in ('Revoked', 'Ended'))) then
    raise exception 'a device''s state moves only from Setting up to Active, and to Revoked or Ended, which are final'
      using errcode = 'AO004';
  end if;
  return new;
end;
$$;
revoke execute on function access.check_device_version() from public;
create trigger check_device_version before insert on access.device_version
  for each row execute function access.check_device_version();
create trigger refuse_row_change before update or delete on access.device_version
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.device_version
  for each statement execute function kernel.refuse_change();

-- A one-time challenge a device signs with its private key (offline-counter 3.2, 3.3): 256 random bits, base64url,
-- issued on the sign-in path with no actor (code-house-rules 6.3) and used at most once, for an enrolment or a sign-in,
-- by the device that signed it. A challenge is no secret: only the device's private key can sign it. The source
-- address it was issued to bounds how many unused challenges one address may hold in the sign-in throttling window
-- (access-and-approvals 3.1; S1-F12 review). A used challenge is kept, final, as the record of the proof that used it.
create table access.device_challenge (
  id uuid primary key,
  challenge text not null,
  issued_at timestamptz not null,
  network_address inet not null,
  used_at timestamptz,
  used_for text,
  device_id uuid references access.device (id),
  recorded_at timestamptz not null default now(),
  constraint device_challenge_form check (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  constraint device_challenge_unique unique (challenge),
  constraint device_challenge_used_for check (used_for in ('enrolment', 'sign-in')),
  constraint device_challenge_use check (
    (used_at is null) = (used_for is null) and (used_at is null) = (device_id is null))
);
create index device_challenge_device on access.device_challenge (device_id);
create index device_challenge_unused on access.device_challenge (network_address, issued_at) where used_at is null;

create function access.guard_device_challenge_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if new.id <> old.id or new.challenge <> old.challenge or new.issued_at <> old.issued_at
     or new.network_address <> old.network_address or new.recorded_at <> old.recorded_at
     or old.used_at is not null then
    raise exception 'a challenge is used once and never changed' using errcode = 'AO004';
  end if;
  return new;
end;
$$;
revoke execute on function access.guard_device_challenge_change() from public;
create trigger guard_device_challenge_change before update on access.device_challenge
  for each row execute function access.guard_device_challenge_change();

-- A shared POS session names its device (0005; access-and-approvals 3.3; POL-02.18). Devices exist now.
alter table access.session add constraint session_device foreign key (device_id) references access.device (id);

-- Runtime grants (code-house-rules 5.2): a device and a challenge change only as their guards admit; a version is
-- append-only.
grant select, insert, update on access.device to aos_runtime;
grant select, insert on access.device_version to aos_runtime;
grant select, insert, update on access.device_challenge to aos_runtime;
