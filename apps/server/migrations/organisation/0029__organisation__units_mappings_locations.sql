-- Business units, their mappings and the mappings' verifications, internal stock locations and each Store's default
-- warehouse (structure-and-masters 3.3 to 3.6, 6.1; module-map 4.11; PRD-ORG-004 to PRD-ORG-006, PRD-ORG-012,
-- PRD-ORG-013, PRD-ORG-020; POL-10.01, POL-10.08; GC2-1, GC2-2, DEC-105; S1-F02-T02). Runs as aos_migration, which
-- owns everything it creates (code-house-rules 5.1). Compatible with the version running: it adds tables, and adds
-- deferred checks to the Site and registration versions of 0028 that only refuse what the State rule refuses
-- (code-house-rules 4.2).
--
-- Each record follows 0028: an identity row fixed at creation, version rows under structure-and-masters 2.2 and
-- code-house-rules 7.3 guarded by organisation.guard_version_change, and no column with a default but `recorded_at`. A
-- mapping's identity is its business unit's, and a default warehouse's its Store's: they are dated version rows only
-- (6.1). Every table is unscoped, as 0028's are: these record types declare no scope fact yet, and the permission on
-- the record type decides (structure-and-masters 6.1; access-and-approvals 5.3, 9.8a).
--
-- The service checks every rule here first and answers a refusal that names it (PRD-UXP-003); the triggers are the
-- database's own guard behind it and raise SQLSTATE AO006, a rule of the structure broken.

-- A business unit (structure-and-masters 3.3; PRD-ORG-004, PRD-ORG-006): one of the four kinds the PRD names, at a Site
-- fixed when it is created; a whole-store or brand-counter unit belongs to one Store, fixed too, and a warehouse or
-- office unit to none. A unit a relocation creates, naming the old unit it replaces (GC2-4), arrives with the stage 5
-- relocation flow.
create table organisation.business_unit (
  id uuid primary key,
  code text not null unique,
  site_id uuid not null references organisation.site (id),
  kind text not null,
  store_id uuid references organisation.store (id),
  recorded_at timestamptz not null default now(),
  constraint business_unit_code check (code <> ''),
  constraint business_unit_kind check (kind in ('whole-store', 'brand-counter', 'warehouse', 'office')),
  constraint business_unit_store check ((kind in ('whole-store', 'brand-counter')) = (store_id is not null)),
  -- A location names its unit and its Site together, so the unit is always at the location's Site (3.5).
  constraint business_unit_at_site unique (id, site_id)
);
create index business_unit_site on organisation.business_unit (site_id);
create index business_unit_store on organisation.business_unit (store_id);
create trigger refuse_row_change before update or delete on organisation.business_unit
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.business_unit
  for each statement execute function kernel.refuse_change();

-- A unit's name and status, effective-dated (structure-and-masters 3.1, 3.7): Setting up when it is created; a later
-- version keeps the status of the latest approved one, since the lifecycle events that change it are site-lifecycle's.
create table organisation.business_unit_version (
  id uuid primary key,
  business_unit_id uuid not null references organisation.business_unit (id),
  name text not null,
  status text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint business_unit_version_name check (name <> ''),
  constraint business_unit_version_status check (status in ('Setting up', 'Active', 'Closing', 'Closed')),
  constraint business_unit_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint business_unit_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint business_unit_version_no_overlap exclude using gist (business_unit_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index business_unit_version_business_unit on organisation.business_unit_version (business_unit_id);
create index business_unit_version_prepared_by on organisation.business_unit_version (prepared_by_user_id);
create trigger guard_version_change before update on organisation.business_unit_version
  for each row execute function organisation.guard_version_change();

-- The kind rules of a Store's unit, checked when its first version is approved (structure-and-masters 3.3, 6.1): the
-- unit is created at the Site its Store is linked to on its start, by the Store's approved version in force then; and
-- a Store has one whole-store unit at that Site. The decision locks the Store's row before it (code-house-rules 8.2),
-- so two whole-store units of one Store are never approved at once.
create function organisation.check_store_unit() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  unit organisation.business_unit;
begin
  if not (old.decision = 'Awaiting approval' and new.decision = 'Approved') then
    return null;
  end if;
  select * into unit from organisation.business_unit where id = new.business_unit_id;
  if unit.store_id is null or exists (
    select 1 from organisation.business_unit_version v
    where v.business_unit_id = unit.id and v.decision = 'Approved' and v.id <> new.id) then
    return null;
  end if;
  if not exists (
    select 1 from organisation.store_version s
    where s.store_id = unit.store_id and s.decision = 'Approved' and s.site_id = unit.site_id
      and s.valid_during @> pg_catalog.lower(new.valid_during)) then
    raise exception 'business unit % is not at the Site its Store is linked to on its start', unit.id
      using errcode = 'AO006';
  end if;
  if unit.kind = 'whole-store' and exists (
    select 1 from organisation.business_unit other
    join organisation.business_unit_version v on v.business_unit_id = other.id and v.decision = 'Approved'
    where other.store_id = unit.store_id and other.site_id = unit.site_id and other.kind = 'whole-store'
      and other.id <> unit.id) then
    raise exception 'the Store of business unit % has a whole-store unit at its Site already', unit.id
      using errcode = 'AO006';
  end if;
  return null;
end;
$$;
revoke execute on function organisation.check_store_unit() from public;
create trigger check_store_unit after update on organisation.business_unit_version
  for each row execute function organisation.check_store_unit();

-- A unit's mapping, effective-dated (structure-and-masters 3.4; PRD-ORG-005, POL-10.01): one legal entity, one tax
-- registration and one accounting book, never inferred from the Site. Its identity is the unit's. A unit's first
-- mapping is prepared with its first version, named by `prepared_with_version_id`, and approved or rejected with it;
-- a later mapping version is a change of its own.
create table organisation.business_unit_mapping (
  id uuid primary key,
  business_unit_id uuid not null references organisation.business_unit (id),
  legal_entity_id uuid not null references organisation.legal_entity (id),
  tax_registration_id uuid not null references organisation.tax_registration (id),
  accounting_book_id uuid not null references organisation.accounting_book (id),
  prepared_with_version_id uuid references organisation.business_unit_version (id),
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint business_unit_mapping_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint business_unit_mapping_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint business_unit_mapping_no_overlap exclude using gist (business_unit_id with =, valid_during with &&)
    where (decision = 'Approved'),
  constraint business_unit_mapping_prepared_with unique (prepared_with_version_id)
);
create index business_unit_mapping_business_unit on organisation.business_unit_mapping (business_unit_id);
create index business_unit_mapping_prepared_by on organisation.business_unit_mapping (prepared_by_user_id);
create index business_unit_mapping_legal_entity on organisation.business_unit_mapping (legal_entity_id);
create index business_unit_mapping_tax_registration on organisation.business_unit_mapping (tax_registration_id);
create index business_unit_mapping_accounting_book on organisation.business_unit_mapping (accounting_book_id);
create trigger guard_version_change before update on organisation.business_unit_mapping
  for each row execute function organisation.guard_version_change();

-- The registration and the book belong to the mapped legal entity (structure-and-masters 3.4; PRD-ORG-020). Both are
-- fixed to their legal entity at creation (0028), so the check holds for good once the row is written.
create function organisation.check_mapping_legal_entity() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if not exists (select 1 from organisation.tax_registration r
                 where r.id = new.tax_registration_id and r.legal_entity_id = new.legal_entity_id)
     or not exists (select 1 from organisation.accounting_book b
                    where b.id = new.accounting_book_id and b.legal_entity_id = new.legal_entity_id) then
    raise exception 'mapping % names a registration or book of another legal entity', new.id using errcode = 'AO006';
  end if;
  return new;
end;
$$;
revoke execute on function organisation.check_mapping_legal_entity() from public;
create trigger check_mapping_legal_entity before insert on organisation.business_unit_mapping
  for each row execute function organisation.check_mapping_legal_entity();

-- Whether an approved mapping is out of step with the State rule on any day it is in force (structure-and-masters
-- 3.4; GC2-1, DEC-105): on some day, the State of the registration's approved version then is not the State of the
-- Area of the unit's Site's approved version then. A day with no approved version of either is not out of step here:
-- approval refuses a version whose records are not in force on its start, and an approved version ends only where the
-- next starts (6.1).
create function organisation.mapping_out_of_step(mapping_id uuid) returns boolean
  language sql
  stable
  set search_path = pg_catalog
as $$
  select exists (
    select 1
    from organisation.business_unit_mapping m
    join organisation.business_unit u on u.id = m.business_unit_id
    join organisation.site_version sv
      on sv.site_id = u.site_id and sv.decision = 'Approved' and sv.valid_during && m.valid_during
    join organisation.area a on a.id = sv.area_id
    join organisation.city c on c.id = a.city_id
    join organisation.tax_registration_version rv
      on rv.tax_registration_id = m.tax_registration_id and rv.decision = 'Approved'
     and rv.valid_during && (m.valid_during * sv.valid_during)
    where m.id = mapping_out_of_step.mapping_id and m.decision = 'Approved' and rv.state_id <> c.state_id)
$$;
revoke execute on function organisation.mapping_out_of_step(uuid) from public;
grant execute on function organisation.mapping_out_of_step(uuid) to aos_runtime;

-- An approved mapping keeps the State rule, and a unit's approved mappings leave no gap from the first one's start:
-- each one that ends is followed by one starting that day (structure-and-masters 3.4, 6.1; domain-model invariant 8).
-- Checked at commit, once every version a decision moves has its final dates.
create function organisation.check_mapping() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if new.decision <> 'Approved' then
    return null;
  end if;
  if organisation.mapping_out_of_step(new.id) then
    raise exception 'mapping % names a registration in another State than its unit''s Site', new.id
      using errcode = 'AO006';
  end if;
  if exists (
    select 1 from organisation.business_unit_mapping m
    where m.business_unit_id = new.business_unit_id and m.decision = 'Approved'
      and not pg_catalog.upper_inf(m.valid_during)
      and not exists (select 1 from organisation.business_unit_mapping n
                      where n.business_unit_id = m.business_unit_id and n.decision = 'Approved'
                        and pg_catalog.lower(n.valid_during) = pg_catalog.upper(m.valid_during))) then
    raise exception 'business unit % would be left without a mapping', new.business_unit_id using errcode = 'AO006';
  end if;
  return null;
end;
$$;
revoke execute on function organisation.check_mapping() from public;
create constraint trigger check_mapping after insert or update on organisation.business_unit_mapping
  deferrable initially deferred
  for each row execute function organisation.check_mapping();

-- A new approved Site version (a new Area) or registration version (a new State) that would put a mapping in force
-- out of step is refused too, so the State rule holds at all times (structure-and-masters 3.4; GC2-1). Checked at
-- commit, on the mappings of the units at the Site, or naming the registration, that overlap the new version.
create function organisation.check_mappings_in_step() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if not (old.decision = 'Awaiting approval' and new.decision = 'Approved') then
    return null;
  end if;
  if tg_table_name = 'site_version' and exists (
    select 1 from organisation.business_unit u
    join organisation.business_unit_mapping m on m.business_unit_id = u.id and m.decision = 'Approved'
    where u.site_id = (pg_catalog.to_jsonb(new) ->> 'site_id')::uuid and m.valid_during && new.valid_during
      and organisation.mapping_out_of_step(m.id)) then
    raise exception 'a Site version would put a mapping out of step with its registration''s State'
      using errcode = 'AO006';
  end if;
  if tg_table_name = 'tax_registration_version' and exists (
    select 1 from organisation.business_unit_mapping m
    where m.tax_registration_id = (pg_catalog.to_jsonb(new) ->> 'tax_registration_id')::uuid
      and m.decision = 'Approved' and m.valid_during && new.valid_during and organisation.mapping_out_of_step(m.id)) then
    raise exception 'a registration version would put a mapping out of step with its unit''s Site'
      using errcode = 'AO006';
  end if;
  return null;
end;
$$;
revoke execute on function organisation.check_mappings_in_step() from public;
create constraint trigger check_mappings_in_step after update on organisation.site_version
  deferrable initially deferred
  for each row execute function organisation.check_mappings_in_step();
create constraint trigger check_mappings_in_step after update on organisation.tax_registration_version
  deferrable initially deferred
  for each row execute function organisation.check_mappings_in_step();

-- A mapping version's verification (structure-and-masters 3.4; POL-10.08): append-only, one per approved mapping
-- version, with who verified it, when, and the attachments of its evidence, stored files attached through
-- files-imports in the same transaction (S1-F06-T05). The verifier is never the person who made the mapping (GC2-2,
-- DEC-105); the separate verify permission is checked by the service.
create table organisation.business_unit_mapping_verification (
  id uuid primary key,
  business_unit_mapping_id uuid not null references organisation.business_unit_mapping (id),
  verified_by_user_id uuid not null,
  verified_at timestamptz not null,
  attachment_ids uuid[] not null,
  recorded_at timestamptz not null default now(),
  constraint business_unit_mapping_verification_once unique (business_unit_mapping_id),
  constraint business_unit_mapping_verification_evidence
    check (pg_catalog.cardinality(attachment_ids) > 0 and pg_catalog.array_position(attachment_ids, null) is null)
);
create index business_unit_mapping_verification_verified_by
  on organisation.business_unit_mapping_verification (verified_by_user_id);
create trigger refuse_row_change before update or delete on organisation.business_unit_mapping_verification
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.business_unit_mapping_verification
  for each statement execute function kernel.refuse_change();

create function organisation.check_mapping_verification() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  mapping organisation.business_unit_mapping;
begin
  select * into mapping from organisation.business_unit_mapping where id = new.business_unit_mapping_id;
  if mapping.decision <> 'Approved' then
    raise exception 'mapping % is not approved', mapping.id using errcode = 'AO006';
  end if;
  if mapping.prepared_by_user_id = new.verified_by_user_id then
    raise exception 'mapping % is verified by the person who made it', mapping.id using errcode = 'AO006';
  end if;
  return new;
end;
$$;
revoke execute on function organisation.check_mapping_verification() from public;
create trigger check_mapping_verification before insert on organisation.business_unit_mapping_verification
  for each row execute function organisation.check_mapping_verification();

-- An internal stock location (structure-and-masters 3.5; PRD-ORG-012), fixed to one Site and one business unit at that
-- Site when it is created (DM-9): the unit and the Site are one foreign key, so the unit is always at the Site. Its
-- code is unique at its Site.
create table organisation.location (
  id uuid primary key,
  code text not null,
  site_id uuid not null references organisation.site (id),
  business_unit_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint location_code check (code <> ''),
  constraint location_code_at_site unique (site_id, code),
  constraint location_unit_at_site foreign key (business_unit_id, site_id)
    references organisation.business_unit (id, site_id)
);
create index location_business_unit on organisation.location (business_unit_id, site_id);
create trigger refuse_row_change before update or delete on organisation.location
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.location
  for each statement execute function kernel.refuse_change();

-- A location's name, kind, parent and whether it is retired, effective-dated (structure-and-masters 3.1, 3.5): a
-- zone, rack or bin may nest under a parent location of the same unit; retiring is a version from its start, never a
-- deletion. Damage, holds and transit are stock conditions, never a location (PRD-ORG-012).
create table organisation.location_version (
  id uuid primary key,
  location_id uuid not null references organisation.location (id),
  name text not null,
  kind text not null,
  parent_location_id uuid references organisation.location (id),
  retired boolean not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint location_version_name check (name <> ''),
  constraint location_version_kind check (kind in ('floor', 'backstore', 'zone', 'rack', 'bin', 'fixture', 'display',
    'alteration')),
  constraint location_version_parent check (parent_location_id is null
    or (kind in ('zone', 'rack', 'bin') and parent_location_id <> location_id)),
  constraint location_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint location_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint location_version_no_overlap exclude using gist (location_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index location_version_location on organisation.location_version (location_id);
create index location_version_prepared_by on organisation.location_version (prepared_by_user_id);
create index location_version_parent on organisation.location_version (parent_location_id);
create trigger guard_version_change before update on organisation.location_version
  for each row execute function organisation.guard_version_change();

-- A parent location is of the same business unit, so a location and its parent are counted by one unit (3.5).
create function organisation.check_location_parent() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if new.parent_location_id is not null and not exists (
    select 1 from organisation.location l
    join organisation.location p on p.business_unit_id = l.business_unit_id
    where l.id = new.location_id and p.id = new.parent_location_id) then
    raise exception 'location % nests under a location of another unit', new.location_id using errcode = 'AO006';
  end if;
  return new;
end;
$$;
revoke execute on function organisation.check_location_parent() from public;
create trigger check_location_parent before insert on organisation.location_version
  for each row execute function organisation.check_location_parent();

-- A Store's default warehouse for replenishment and returns, effective-dated (structure-and-masters 3.6;
-- PRD-ORG-013): a warehouse unit, which names its Site too; one in force per Store. Its identity is the Store's. Other
-- authorised routes wait for V-62 (Operations; stage 3).
create table organisation.store_default_warehouse (
  id uuid primary key,
  store_id uuid not null references organisation.store (id),
  warehouse_unit_id uuid not null references organisation.business_unit (id),
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint store_default_warehouse_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint store_default_warehouse_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint store_default_warehouse_no_overlap exclude using gist (store_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index store_default_warehouse_store on organisation.store_default_warehouse (store_id);
create index store_default_warehouse_unit on organisation.store_default_warehouse (warehouse_unit_id);
create index store_default_warehouse_prepared_by on organisation.store_default_warehouse (prepared_by_user_id);
create trigger guard_version_change before update on organisation.store_default_warehouse
  for each row execute function organisation.guard_version_change();

create function organisation.check_default_warehouse() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if not exists (select 1 from organisation.business_unit u where u.id = new.warehouse_unit_id and u.kind = 'warehouse')
  then
    raise exception 'default warehouse % names a unit that is not a warehouse unit', new.id using errcode = 'AO006';
  end if;
  return new;
end;
$$;
revoke execute on function organisation.check_default_warehouse() from public;
create trigger check_default_warehouse before insert on organisation.store_default_warehouse
  for each row execute function organisation.check_default_warehouse();

-- Runtime grants (code-house-rules 5.2), as 0028's: an identity row is append-only and locked, a version row takes
-- the changes its guard allows, and a verification is append-only.
grant select, insert on organisation.business_unit to aos_runtime;
grant update (id) on organisation.business_unit to aos_runtime;
grant select, insert, update on organisation.business_unit_version to aos_runtime;
grant select, insert, update on organisation.business_unit_mapping to aos_runtime;
grant select, insert on organisation.business_unit_mapping_verification to aos_runtime;
grant select, insert on organisation.location to aos_runtime;
grant update (id) on organisation.location to aos_runtime;
grant select, insert, update on organisation.location_version to aos_runtime;
grant select, insert, update on organisation.store_default_warehouse to aos_runtime;
