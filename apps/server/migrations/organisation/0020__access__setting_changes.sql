-- Changing an essential security setting after setup (access-and-approvals 3.3, 9.5, 9.11, 13.1; code-house-rules
-- 7.3, 8.2, 12.14; POL-02.06, POL-02.07, PRD-MOD-010; DEC-118, RR-334; S1-F01-T25). The sign-in throttling, the
-- password rules and the office session limits change only as a prepared version, approved by a different authorised
-- person, taking effect at the moment of its decision or from the start of a later business day. Runs as
-- aos_migration, which owns the tables (code-house-rules 5.1).
--
-- A version may take effect at its decision, dated like a user version (0018), so setting versions are dated by
-- instants (`tstzrange`). The column changes type in place, so its exclusion constraint, its check that every version
-- has a start, the generic guard trigger of code-house-rules 7.3 and every row stay. Each recorded business day becomes
-- the instant that day starts under the Organisation's timezone in force now (code-house-rules 9); a database holding
-- setting versions but no timezone in force is refused, never guessed.
--
-- Not compatible with the version running (code-house-rules 4.2): the code deployed before this migration reads the
-- column as dates, so between this migration and the new version taking traffic sign-in reads fail and no one signs
-- in. Accepted for the test setup, which holds only synthetic data (RR-400).

create function access.start_of_business_day(day date) returns timestamptz
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  zone text;
begin
  if day is null then
    return null;
  end if;
  select timezone into zone
    from configuration.organisation_timezone_version
   where decision = 'Approved' and valid_during @> pg_catalog.now();
  if zone is null then
    raise exception 'setting versions exist but no Organisation timezone is in force (code-house-rules 9)'
      using errcode = 'AO003';
  end if;
  return day::timestamp at time zone zone;
end;
$$;
revoke execute on function access.start_of_business_day(date) from public;

alter table access.setting_version
  alter column valid_during type tstzrange
  using pg_catalog.tstzrange(
    access.start_of_business_day(pg_catalog.lower(valid_during)),
    access.start_of_business_day(pg_catalog.upper(valid_during))
  );

drop function access.start_of_business_day(date);

-- When the version takes effect, as its preparer stated it (access-and-approvals 3.3): null, at the moment of its
-- decision, its range started again at the decision's recording time; or the business day from whose start it takes
-- effect. The setup step's first versions took effect when it wrote them, so they keep null. Fixed once written, as
-- every column the guard trigger compares.
alter table access.setting_version add column starts_on date;

-- Who changed a setting version: its preparers (access-and-approvals 9.1, 13.1; code-house-rules 7.2), as for the
-- other access changes (0015).
create table access.setting_version_change (
  id uuid primary key,
  setting_version_id uuid not null references access.setting_version (id),
  changed_by_user_id uuid not null references access.app_user (id),
  recorded_at timestamptz not null default now()
);
create index setting_version_change_version on access.setting_version_change (setting_version_id);
create index setting_version_change_user on access.setting_version_change (changed_by_user_id);

create trigger refuse_row_change before update or delete on access.setting_version_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.setting_version_change
  for each statement execute function kernel.refuse_change();

-- Decide locks the setting with the version it decides (code-house-rules 8.2), so two decisions on versions of one
-- setting never pass each other. A row lock needs the UPDATE privilege on a column of the row, so the runtime role gets
-- UPDATE on the identifier column only, as on role (0018): the row stays append-only and refuse_change still refuses
-- every UPDATE.
grant update (id) on access.setting to aos_runtime;
grant select, insert on access.setting_version_change to aos_runtime;
