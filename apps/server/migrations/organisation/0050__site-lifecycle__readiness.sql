-- The site-lifecycle module's readiness records (module-map 4.16; domain-model 3.6, section 5, section 6 "Granting an
-- activity", invariant 7; PRD-LIF-001 to PRD-LIF-003; DEC-116, DEC-117; S1-F04-T02). Runs as aos_migration, which owns
-- everything it creates (code-house-rules 5.1). Compatible with the version running: it only adds (4.2).
--
-- No row is written here: no unit is ready, no zero stock is declared, nothing is granted (AGENTS.md "Never invent a
-- value"). Every table is append-only (PRD-MOD-011). Another module's record (a business unit, a Site, a user) is kept
-- by its identifier with no foreign key.
--
-- Every table is unscoped, as the structure it is about is (structure-and-masters 6.1): the records carry the unit's
-- place as their scope facts, and only site-lifecycle code reads them, admitting a reader only through Authorise on
-- their record type with the unit's facts (access-and-approvals 5.3, 7.1).

create schema site_lifecycle;
grant usage on schema site_lifecycle to aos_runtime;

-- An activity of a business unit, the record its readiness runs and its approval bind to (PRD-LIF-001): written with
-- the first run of the checks for the unit and the activity, and locked by every decision on it (code-house-rules 8.2).
create table site_lifecycle.activation (
  id uuid primary key,
  business_unit_id uuid not null,
  site_id uuid not null,
  activity text not null,
  recorded_at timestamptz not null default now(),
  constraint activation_activity check (activity in ('receiving', 'movement', 'selling')),
  constraint activation_key unique (business_unit_id, activity)
);
create trigger refuse_row_change before update or delete on site_lifecycle.activation
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on site_lifecycle.activation
  for each statement execute function kernel.refuse_change();

-- One run of the readiness checks (PRD-LIF-002): what each check found, when and by whom. The latest run of an
-- activation is the one its approval may bind to; `checks` keeps each check's state and what it named as missing.
create table site_lifecycle.readiness_record (
  id uuid primary key,
  activation_id uuid not null references site_lifecycle.activation (id),
  business_unit_id uuid not null,
  site_id uuid not null,
  activity text not null,
  passed boolean not null,
  checks jsonb not null,
  ran_by_user_id uuid not null,
  role_assignment_id uuid not null,
  ran_at timestamptz not null,
  constraint readiness_record_activity check (activity in ('receiving', 'movement', 'selling'))
);
create index readiness_record_activation on site_lifecycle.readiness_record (activation_id, id);
create trigger refuse_row_change before update or delete on site_lifecycle.readiness_record
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on site_lifecycle.readiness_record
  for each statement execute function kernel.refuse_change();

-- A unit's explicit declaration that it genuinely holds no stock (PRD-LIF-003; DEC-117): who declared it and when. The
-- stock-plan check passes with one; the activity's approver, a different person, approves the run that relies on it.
create table site_lifecycle.zero_stock_declaration (
  id uuid primary key,
  business_unit_id uuid not null,
  site_id uuid not null,
  declared_by_user_id uuid not null,
  role_assignment_id uuid not null,
  declared_at timestamptz not null
);
create index zero_stock_declaration_unit on site_lifecycle.zero_stock_declaration (business_unit_id, id);
create trigger refuse_row_change before update or delete on site_lifecycle.zero_stock_declaration
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on site_lifecycle.zero_stock_declaration
  for each statement execute function kernel.refuse_change();

-- Runtime grants (code-house-rules 5.2): append-only rows, so insert and select only (7.1); the activation's lock row
-- takes update on its identifier only.
grant select, insert on site_lifecycle.activation to aos_runtime;
grant update (id) on site_lifecycle.activation to aos_runtime;
grant select, insert on site_lifecycle.readiness_record to aos_runtime;
grant select, insert on site_lifecycle.zero_stock_declaration to aos_runtime;
