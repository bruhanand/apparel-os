-- The organisation module's schema and its first records: geography, legal entities, tax registrations, accounting
-- books, Sites, Stores and groupings (structure-and-masters 2, 3.1 to 3.3, 3.6, 3.7, 6.1; module-map 4.11;
-- PRD-ORG-001, PRD-ORG-003, PRD-ORG-007 to PRD-ORG-011, PRD-ORG-020, PRD-ORG-021; PRD-MOD-008, PRD-MOD-010;
-- POL-10.06; S1-F02-T01). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible
-- with the version running: it only adds (code-house-rules 4.2).
--
-- Every master is an identity row, fixed at creation and never changed or deleted, and version rows under
-- structure-and-masters 2.2 and code-house-rules 7.3: a version is Awaiting approval until a different authorised
-- person decides it (GC2-2, DEC-105; PRD-ACS-006), approved versions never overlap, Scheduled ones included, and an
-- approved version changes only by its end moving earlier, when the next version starts. The rows a version holds,
-- aliases and grouping members, are frozen with it. Codes are kept as text, compared exactly, unique in their scope
-- and never reused (2.1). No column has a default but `recorded_at` (code-house-rules 3.3).
--
-- Every table is unscoped (structure-and-masters 6.1): the structure belongs to the Organisation as a whole, as access
-- records do, so the permission on the record type decides (access-and-approvals 5.3, 7.1); the place scope of
-- operational records is matched against these records' identifiers, never against these rows.

create schema organisation;
grant usage on schema organisation to aos_runtime;

-- The guard of an effective-dated version row (code-house-rules 7.3). A version is frozen when it is prepared
-- (structure-and-masters 6.1), so a version Awaiting approval changes only by its decision being recorded, once:
-- Approved or Rejected, nothing else changed, except that an approved version may take an end with it, where an
-- approved version of the same master starts after it (structure-and-masters 2.2; product owner, 8 Oct 2026). An
-- Approved version changes only by moving the end of valid_during earlier, never to or before its start. A Rejected
-- version never changes. No version of these masters is withdrawn yet (RR-202, RR-439): the withdrawal document
-- arrives with the first master that needs it (structure-and-masters 2.3).
create function organisation.guard_version_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  old_rest jsonb := pg_catalog.to_jsonb(old) - 'valid_during' - 'decision';
  new_rest jsonb := pg_catalog.to_jsonb(new) - 'valid_during' - 'decision';
begin
  if old.decision = 'Awaiting approval' and new.decision in ('Approved', 'Rejected') and new_rest = old_rest
     and pg_catalog.lower(new.valid_during) is not distinct from pg_catalog.lower(old.valid_during)
     and (new.valid_during = old.valid_during
          or (new.decision = 'Approved' and pg_catalog.upper_inf(old.valid_during)
              and pg_catalog.upper(new.valid_during) > pg_catalog.lower(new.valid_during))) then
    return new;
  end if;
  if old.decision = 'Approved' and new.decision = 'Approved' and new_rest = old_rest
     and pg_catalog.lower(new.valid_during) is not distinct from pg_catalog.lower(old.valid_during)
     and (new.valid_during = old.valid_during
          or (pg_catalog.upper(new.valid_during) > pg_catalog.lower(new.valid_during)
              and (pg_catalog.upper_inf(old.valid_during)
                   or pg_catalog.upper(new.valid_during) < pg_catalog.upper(old.valid_during)))) then
    return new;
  end if;
  raise exception 'a version of %.% changes only as code-house-rules 7.3 allows', tg_table_schema, tg_table_name
    using errcode = 'AO003';
end;
$$;
revoke execute on function organisation.guard_version_change() from public;

-- The rows a version freezes with it, aliases and grouping members, are written while it is prepared: a row naming a
-- version that is already decided is refused (structure-and-masters 6.1; code-house-rules 7.3). The trigger's
-- arguments name the version table and the row's column that names the version.
create function organisation.refuse_after_decision() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  decided text;
begin
  execute pg_catalog.format('select decision from organisation.%I where id = $1', tg_argv[0])
    into decided
    using (pg_catalog.to_jsonb(new) ->> tg_argv[1])::uuid;
  if decided is distinct from 'Awaiting approval' then
    raise exception 'a row of %.% is frozen with its version, which is decided', tg_table_schema, tg_table_name
      using errcode = 'AO003';
  end if;
  return new;
end;
$$;
revoke execute on function organisation.refuse_after_decision() from public;

-- Geography (structure-and-masters 3.6; PRD-ORG-007, PRD-ORG-011): Country, State, City and Area, each fixed to its
-- parent at creation, its code unique under its parent; the countries are the Organisation's own. Each level's name
-- is versioned.

-- A country the Organisation configures (PRD-ORG-011). Its code is unique in the Organisation.
create table organisation.country (
  id uuid primary key,
  code text not null unique,
  recorded_at timestamptz not null default now(),
  constraint country_code check (code <> '')
);
create trigger refuse_row_change before update or delete on organisation.country
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.country
  for each statement execute function kernel.refuse_change();

-- A country's name, effective-dated (structure-and-masters 2.2).
create table organisation.country_version (
  id uuid primary key,
  country_id uuid not null references organisation.country (id),
  name text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint country_version_name check (name <> ''),
  constraint country_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint country_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint country_version_no_overlap exclude using gist (country_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index country_version_country on organisation.country_version (country_id);
create index country_version_prepared_by on organisation.country_version (prepared_by_user_id);
create trigger guard_version_change before update on organisation.country_version
  for each row execute function organisation.guard_version_change();

-- A state, fixed to its country; its code unique in its country (structure-and-masters 3.1, 6.1).
create table organisation.state (
  id uuid primary key,
  country_id uuid not null references organisation.country (id),
  code text not null,
  recorded_at timestamptz not null default now(),
  constraint state_code check (code <> ''),
  constraint state_code_in_country unique (country_id, code)
);
create trigger refuse_row_change before update or delete on organisation.state
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.state
  for each statement execute function kernel.refuse_change();

-- A state's name, effective-dated (structure-and-masters 2.2).
create table organisation.state_version (
  id uuid primary key,
  state_id uuid not null references organisation.state (id),
  name text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint state_version_name check (name <> ''),
  constraint state_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint state_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint state_version_no_overlap exclude using gist (state_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index state_version_state on organisation.state_version (state_id);
create index state_version_prepared_by on organisation.state_version (prepared_by_user_id);
create trigger guard_version_change before update on organisation.state_version
  for each row execute function organisation.guard_version_change();

-- A city, fixed to its state; its code unique in its state (structure-and-masters 3.1, 6.1).
create table organisation.city (
  id uuid primary key,
  state_id uuid not null references organisation.state (id),
  code text not null,
  recorded_at timestamptz not null default now(),
  constraint city_code check (code <> ''),
  constraint city_code_in_state unique (state_id, code)
);
create trigger refuse_row_change before update or delete on organisation.city
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.city
  for each statement execute function kernel.refuse_change();

-- A city's name, effective-dated (structure-and-masters 2.2).
create table organisation.city_version (
  id uuid primary key,
  city_id uuid not null references organisation.city (id),
  name text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint city_version_name check (name <> ''),
  constraint city_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint city_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint city_version_no_overlap exclude using gist (city_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index city_version_city on organisation.city_version (city_id);
create index city_version_prepared_by on organisation.city_version (prepared_by_user_id);
create trigger guard_version_change before update on organisation.city_version
  for each row execute function organisation.guard_version_change();

-- An area, fixed to its city; its code unique in its city (structure-and-masters 3.1, 6.1).
create table organisation.area (
  id uuid primary key,
  city_id uuid not null references organisation.city (id),
  code text not null,
  recorded_at timestamptz not null default now(),
  constraint area_code check (code <> ''),
  constraint area_code_in_city unique (city_id, code)
);
create trigger refuse_row_change before update or delete on organisation.area
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.area
  for each statement execute function kernel.refuse_change();

-- An area's name, effective-dated (structure-and-masters 2.2).
create table organisation.area_version (
  id uuid primary key,
  area_id uuid not null references organisation.area (id),
  name text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint area_version_name check (name <> ''),
  constraint area_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint area_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint area_version_no_overlap exclude using gist (area_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index area_version_area on organisation.area_version (area_id);
create index area_version_prepared_by on organisation.area_version (prepared_by_user_id);
create trigger guard_version_change before update on organisation.area_version
  for each row execute function organisation.guard_version_change();

-- A legal entity (structure-and-masters 3.1, 3.2; PRD-ORG-001). Which statutory identifiers it carries is OPEN
-- (Accounts, CA; stage 2), so none is kept yet.
create table organisation.legal_entity (
  id uuid primary key,
  code text not null unique,
  recorded_at timestamptz not null default now(),
  constraint legal_entity_code check (code <> '')
);
create trigger refuse_row_change before update or delete on organisation.legal_entity
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.legal_entity
  for each statement execute function kernel.refuse_change();

-- A legal entity's legal name, effective-dated.
create table organisation.legal_entity_version (
  id uuid primary key,
  legal_entity_id uuid not null references organisation.legal_entity (id),
  legal_name text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint legal_entity_version_legal_name check (legal_name <> ''),
  constraint legal_entity_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint legal_entity_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint legal_entity_version_no_overlap exclude using gist (legal_entity_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index legal_entity_version_legal_entity on organisation.legal_entity_version (legal_entity_id);
create index legal_entity_version_prepared_by on organisation.legal_entity_version (prepared_by_user_id);
create trigger guard_version_change before update on organisation.legal_entity_version
  for each row execute function organisation.guard_version_change();

-- A tax registration, fixed to one legal entity when it is created (structure-and-masters 3.2; PRD-ORG-020, DEC-095):
-- a registration that would need another legal entity is a new record. Its verification record (POL-10.06) is
-- deferred (product owner, 8 Oct 2026; structure-and-masters 3.1).
create table organisation.tax_registration (
  id uuid primary key,
  code text not null unique,
  legal_entity_id uuid not null references organisation.legal_entity (id),
  recorded_at timestamptz not null default now(),
  constraint tax_registration_code check (code <> '')
);
create index tax_registration_legal_entity on organisation.tax_registration (legal_entity_id);
create trigger refuse_row_change before update or delete on organisation.tax_registration
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.tax_registration
  for each statement execute function kernel.refuse_change();

-- A registration's number, kept as text and compared exactly, the State it is registered in and its validity dates,
-- from its first day, open-ended while it has no end (POL-10.06; structure-and-masters 3.1).
create table organisation.tax_registration_version (
  id uuid primary key,
  tax_registration_id uuid not null references organisation.tax_registration (id),
  registration_number text not null,
  state_id uuid not null references organisation.state (id),
  validity daterange not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint tax_registration_version_number check (registration_number <> ''),
  constraint tax_registration_version_validity
    check (not pg_catalog.lower_inf(validity) and not pg_catalog.isempty(validity)),
  constraint tax_registration_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint tax_registration_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint tax_registration_version_no_overlap exclude using gist (tax_registration_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index tax_registration_version_tax_registration on organisation.tax_registration_version (tax_registration_id);
create index tax_registration_version_prepared_by on organisation.tax_registration_version (prepared_by_user_id);
create index tax_registration_version_state on organisation.tax_registration_version (state_id);
create trigger guard_version_change before update on organisation.tax_registration_version
  for each row execute function organisation.guard_version_change();

-- An accounting book's identity, fixed to one legal entity when it is created (structure-and-masters 3.2; PRD-ORG-020,
-- PRD-LED-002). The ledger itself is `finance` · books'.
create table organisation.accounting_book (
  id uuid primary key,
  code text not null unique,
  legal_entity_id uuid not null references organisation.legal_entity (id),
  recorded_at timestamptz not null default now(),
  constraint accounting_book_code check (code <> '')
);
create index accounting_book_legal_entity on organisation.accounting_book (legal_entity_id);
create trigger refuse_row_change before update or delete on organisation.accounting_book
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.accounting_book
  for each statement execute function kernel.refuse_change();

-- A book's name, effective-dated.
create table organisation.accounting_book_version (
  id uuid primary key,
  accounting_book_id uuid not null references organisation.accounting_book (id),
  name text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint accounting_book_version_name check (name <> ''),
  constraint accounting_book_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint accounting_book_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint accounting_book_version_no_overlap exclude using gist (accounting_book_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index accounting_book_version_accounting_book on organisation.accounting_book_version (accounting_book_id);
create index accounting_book_version_prepared_by on organisation.accounting_book_version (prepared_by_user_id);
create trigger guard_version_change before update on organisation.accounting_book_version
  for each row execute function organisation.guard_version_change();

-- A Site: a physical place with a permanent code (structure-and-masters 3.1, 3.3; PRD-ORG-003).
create table organisation.site (
  id uuid primary key,
  code text not null unique,
  recorded_at timestamptz not null default now(),
  constraint site_code check (code <> '')
);
create trigger refuse_row_change before update or delete on organisation.site
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.site
  for each statement execute function kernel.refuse_change();

-- A Site's versioned fields (structure-and-masters 3.1): its name; its physical kind, one of the five of PRD-ORG-010
-- (GC2-3, DEC-105); its Area (3.6); its addresses, in the order given; its opening and closing dates, Unknown (null)
-- until known (2.4); and its status, Setting up when it is created (3.7; DM-4, DEC-105). Classifications are not kept
-- yet: no source names them.
create table organisation.site_version (
  id uuid primary key,
  site_id uuid not null references organisation.site (id),
  name text not null,
  physical_kind text not null,
  area_id uuid not null references organisation.area (id),
  addresses text[] not null,
  opening_date date,
  closing_date date,
  status text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint site_version_name check (name <> ''),
  constraint site_version_physical_kind check (physical_kind in ('head-office', 'regional-office',
    'central-warehouse', 'regional-warehouse', 'retail-site')),
  constraint site_version_addresses
    check (pg_catalog.array_position(addresses, '') is null and pg_catalog.array_position(addresses, null) is null),
  constraint site_version_status check (status in ('Setting up', 'Active', 'Closing', 'Closed')),
  constraint site_version_dates check (closing_date is null or opening_date is null or closing_date >= opening_date),
  constraint site_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint site_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint site_version_no_overlap exclude using gist (site_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index site_version_site on organisation.site_version (site_id);
create index site_version_prepared_by on organisation.site_version (prepared_by_user_id);
create index site_version_area on organisation.site_version (area_id);
create trigger guard_version_change before update on organisation.site_version
  for each row execute function organisation.guard_version_change();

-- An alias of a Site, frozen with the version that names it: earlier names are kept here (PRD-ORG-008).
create table organisation.site_alias (
  id uuid primary key,
  site_version_id uuid not null references organisation.site_version (id),
  alias text not null,
  recorded_at timestamptz not null default now(),
  constraint site_alias_text check (alias <> ''),
  constraint site_alias_once unique (site_version_id, alias)
);
create trigger refuse_row_change before update or delete on organisation.site_alias
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.site_alias
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_decision before insert on organisation.site_alias
  for each row execute function organisation.refuse_after_decision('site_version', 'site_version_id');

-- A Store: a trading business at a Site (structure-and-masters 3.1, 3.3; PRD-ORG-021).
create table organisation.store (
  id uuid primary key,
  code text not null unique,
  recorded_at timestamptz not null default now(),
  constraint store_code check (code <> '')
);
create trigger refuse_row_change before update or delete on organisation.store
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.store
  for each statement execute function kernel.refuse_change();

-- A Store's versioned fields (structure-and-masters 3.1): its name, format and operating model (PRD-ORG-010), its
-- opening and closing dates and status (3.7), and its Site link: the Site it is at while the version is in force, so
-- a Store is at one Site on any date and several Stores may be at one Site (3.3; PRD-ORG-021). A later link is a
-- later version, Scheduled until its date. Partner associations arrive with `partners` (stage 5).
create table organisation.store_version (
  id uuid primary key,
  store_id uuid not null references organisation.store (id),
  name text not null,
  format text not null,
  operating_model text not null,
  site_id uuid not null references organisation.site (id),
  opening_date date,
  closing_date date,
  status text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint store_version_name check (name <> ''),
  constraint store_version_format check (format in ('mbo', 'ebo', 'shop-in-shop', 'kiosk')),
  constraint store_version_operating_model check (operating_model in ('company-owned', 'franchise-owned',
    'franchise-owned-company-operated')),
  constraint store_version_status check (status in ('Setting up', 'Active', 'Closing', 'Closed')),
  constraint store_version_dates check (closing_date is null or opening_date is null or closing_date >= opening_date),
  constraint store_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint store_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint store_version_no_overlap exclude using gist (store_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index store_version_store on organisation.store_version (store_id);
create index store_version_prepared_by on organisation.store_version (prepared_by_user_id);
create index store_version_site on organisation.store_version (site_id);
create trigger guard_version_change before update on organisation.store_version
  for each row execute function organisation.guard_version_change();

-- An alias of a Store, frozen with the version that names it (PRD-ORG-008).
create table organisation.store_alias (
  id uuid primary key,
  store_version_id uuid not null references organisation.store_version (id),
  alias text not null,
  recorded_at timestamptz not null default now(),
  constraint store_alias_text check (alias <> ''),
  constraint store_alias_once unique (store_version_id, alias)
);
create trigger refuse_row_change before update or delete on organisation.store_alias
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.store_alias
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_decision before insert on organisation.store_alias
  for each row execute function organisation.refuse_after_decision('store_version', 'store_version_id');

-- A grouping of Stores: a region or a cluster, its kind fixed at creation (structure-and-masters 3.6; PRD-ORG-007).
-- Another kind waits for the configuration that names it.
create table organisation.grouping (
  id uuid primary key,
  code text not null unique,
  kind text not null,
  recorded_at timestamptz not null default now(),
  constraint grouping_code check (code <> ''),
  constraint grouping_kind check (kind in ('region', 'cluster'))
);
create trigger refuse_row_change before update or delete on organisation.grouping
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.grouping
  for each statement execute function kernel.refuse_change();

-- A grouping's name and, through grouping_member, its Stores, effective-dated: membership is dated by the
-- version that lists it (structure-and-masters 3.6).
create table organisation.grouping_version (
  id uuid primary key,
  grouping_id uuid not null references organisation.grouping (id),
  name text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint grouping_version_name check (name <> ''),
  constraint grouping_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint grouping_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint grouping_version_no_overlap exclude using gist (grouping_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index grouping_version_grouping on organisation.grouping_version (grouping_id);
create index grouping_version_prepared_by on organisation.grouping_version (prepared_by_user_id);
create trigger guard_version_change before update on organisation.grouping_version
  for each row execute function organisation.guard_version_change();

-- A Store that a grouping version lists, frozen with it (structure-and-masters 3.6).
create table organisation.grouping_member (
  id uuid primary key,
  grouping_version_id uuid not null references organisation.grouping_version (id),
  store_id uuid not null references organisation.store (id),
  recorded_at timestamptz not null default now(),
  constraint grouping_member_once unique (grouping_version_id, store_id)
);
create index grouping_member_store on organisation.grouping_member (store_id);
create trigger refuse_row_change before update or delete on organisation.grouping_member
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.grouping_member
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_decision before insert on organisation.grouping_member
  for each row execute function organisation.refuse_after_decision('grouping_version', 'grouping_version_id');

-- Runtime grants (code-house-rules 5.2). An identity row is append-only and locked: a decision locks it at step 1, so
-- two decisions on one master never pass each other (8.2), hence UPDATE on its identifier only (7.1). A version row
-- takes the changes its guard allows. The rows frozen with a version are append-only.
grant select, insert on organisation.country to aos_runtime;
grant update (id) on organisation.country to aos_runtime;
grant select, insert, update on organisation.country_version to aos_runtime;
grant select, insert on organisation.state to aos_runtime;
grant update (id) on organisation.state to aos_runtime;
grant select, insert, update on organisation.state_version to aos_runtime;
grant select, insert on organisation.city to aos_runtime;
grant update (id) on organisation.city to aos_runtime;
grant select, insert, update on organisation.city_version to aos_runtime;
grant select, insert on organisation.area to aos_runtime;
grant update (id) on organisation.area to aos_runtime;
grant select, insert, update on organisation.area_version to aos_runtime;
grant select, insert on organisation.legal_entity to aos_runtime;
grant update (id) on organisation.legal_entity to aos_runtime;
grant select, insert, update on organisation.legal_entity_version to aos_runtime;
grant select, insert on organisation.tax_registration to aos_runtime;
grant update (id) on organisation.tax_registration to aos_runtime;
grant select, insert, update on organisation.tax_registration_version to aos_runtime;
grant select, insert on organisation.accounting_book to aos_runtime;
grant update (id) on organisation.accounting_book to aos_runtime;
grant select, insert, update on organisation.accounting_book_version to aos_runtime;
grant select, insert on organisation.site to aos_runtime;
grant update (id) on organisation.site to aos_runtime;
grant select, insert, update on organisation.site_version to aos_runtime;
grant select, insert on organisation.store to aos_runtime;
grant update (id) on organisation.store to aos_runtime;
grant select, insert, update on organisation.store_version to aos_runtime;
grant select, insert on organisation.grouping to aos_runtime;
grant update (id) on organisation.grouping to aos_runtime;
grant select, insert, update on organisation.grouping_version to aos_runtime;
grant select, insert on organisation.site_alias to aos_runtime;
grant select, insert on organisation.store_alias to aos_runtime;
grant select, insert on organisation.grouping_member to aos_runtime;
