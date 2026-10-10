-- The end of a billing device's life and the change of its units (offline-counter 3.5, 3.6, 12.1, 12.3; PRD-OFF-010,
-- PRD-LIF-015, PRD-ORG-005; S1-F12-T02). Runs as aos_migration, which owns everything it changes (code-house-rules
-- 5.1). Compatible with the version running: the new column is null for every device already registered, and the code
-- running before this migration never updates a unit row (4.2). No device is registered here.

-- A replacement names the device it replaces (offline-counter 3.5): a new device, with a new code and a new key, for
-- the same Store. A device is replaced at most once. Set when the replacement is registered, never changed.
alter table pos.billing_device add column replaces_device_id uuid references pos.billing_device (id);
create unique index billing_device_replaces on pos.billing_device (replaces_device_id)
  where replaces_device_id is not null;

-- A device's units are a dated table (code-house-rules 7.3): a change of its units from a date ends the rows of the
-- units it drops at that date and adds rows for the units it brings (offline-counter 12.1). The trigger admits one
-- change only: moving the end of `valid_during` earlier, never to or before its start; the command checks it is today
-- or later under the Organisation's timezone (section 9). Every other change, and any delete, stays refused.
create function pos.guard_billing_device_unit_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a billing device''s unit row is never deleted' using errcode = 'AO004';
  end if;
  if new.id <> old.id or new.billing_device_id <> old.billing_device_id
     or new.business_unit_id <> old.business_unit_id or new.recorded_at <> old.recorded_at
     or lower(new.valid_during) <> lower(old.valid_during) or upper_inf(new.valid_during)
     or (not upper_inf(old.valid_during) and upper(new.valid_during) >= upper(old.valid_during))
     or upper(new.valid_during) <= lower(new.valid_during) then
    raise exception 'a billing device''s unit row changes only by ending it earlier, after its start'
      using errcode = 'AO004';
  end if;
  return new;
end;
$$;
revoke execute on function pos.guard_billing_device_unit_change() from public;
drop trigger refuse_row_change on pos.billing_device_unit;
-- No longer append-only, so it keeps no `kernel.refuse_change` guard, as no dated table does (code-house-rules 7.1,
-- 7.3); a truncate would be the owner's alone, and the owner runs only reviewed migrations.
drop trigger refuse_truncate on pos.billing_device_unit;
create trigger guard_billing_device_unit_change before update or delete on pos.billing_device_unit
  for each row execute function pos.guard_billing_device_unit_change();

-- Runtime grants (code-house-rules 5.2): UPDATE on the table, as for every dated table (7.3); the guard admits only
-- the end of a row moved earlier.
grant update on pos.billing_device_unit to aos_runtime;
