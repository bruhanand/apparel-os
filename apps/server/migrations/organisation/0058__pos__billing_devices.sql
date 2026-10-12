-- The `pos` module's billing devices (offline-counter 3.1, 3.2, 12.3; module-map 4.17; PRD-OFF-002, PRD-POS-020,
-- PRD-ORG-005; DEC-005, DEC-116; S1-F12-T01). Runs as aos_migration, which owns everything it creates
-- (code-house-rules 5.1). Compatible with the version running: it only adds (4.2). No device is registered here.
--
-- A billing device's identity, key and state are `access`'s (`access.device`, 0055); `pos` keeps, for the same
-- identifier, its Store, fixed for life, and the business units of that Store it bills for, dated. Another module's
-- record (the device, a Store, a unit, a user) is kept by its identifier with no foreign key (structure-and-masters 2.5).
--
-- Every table is unscoped, as the structure it belongs to is (structure-and-masters 6.1): the records carry the
-- Store's place as their scope facts, and only pos code reads them, admitting a reader only through Authorise on
-- `pos.billing_device` with the Store's facts (access-and-approvals 5.3, 7.1). Append-only.

create schema pos;
grant usage on schema pos to aos_runtime;

-- A billing device's billing facts: its Store, fixed for life (offline-counter 3.1), and who registered it with the
-- assignment Authorise used. Locked as the command's own record by a change of its units (S1-F12-T02).
create table pos.billing_device (
  id uuid primary key,
  store_id uuid not null,
  registered_by_user_id uuid not null,
  role_assignment_id uuid not null,
  registered_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
create index billing_device_store on pos.billing_device (store_id);
create trigger refuse_row_change before update or delete on pos.billing_device
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on pos.billing_device
  for each statement execute function kernel.refuse_change();

-- A business unit a billing device bills for, from a business date (offline-counter 3.1): only a whole-store or
-- brand-counter unit of the device's own Store, which the command checks against `organisation`. Its registrations
-- are those of its units' mappings in force on a date, never chosen apart (PRD-ORG-005). One unit is listed at most
-- once at a time for one device.
create table pos.billing_device_unit (
  id uuid primary key,
  billing_device_id uuid not null references pos.billing_device (id),
  business_unit_id uuid not null,
  valid_during daterange not null,
  recorded_at timestamptz not null default now(),
  constraint billing_device_unit_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint billing_device_unit_no_overlap
    exclude using gist (billing_device_id with =, business_unit_id with =, valid_during with &&)
);
create index billing_device_unit_unit on pos.billing_device_unit (business_unit_id);
create trigger refuse_row_change before update or delete on pos.billing_device_unit
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on pos.billing_device_unit
  for each statement execute function kernel.refuse_change();

-- Runtime grants (code-house-rules 5.2): append-only rows, so insert and select only (7.1); the device's lock row takes
-- update on its identifier only.
grant select, insert on pos.billing_device to aos_runtime;
grant update (id) on pos.billing_device to aos_runtime;
grant select, insert on pos.billing_device_unit to aos_runtime;
