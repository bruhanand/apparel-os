-- User versions dated by instants, and the role locked at step 0 (access-and-approvals 2.1, 9.5, 13.1; code-house-rules
-- 7.3, 8.2, 9; PRD-SEC-019, PRD-SEC-008, PRD-INT-003; DEC-118, RR-321, RR-360; S1-F01-T22). A disabling or ending takes effect at the moment it is approved, not
-- from the next business day, so a user's versions are dated by instants (`tstzrange`), as the Organisation's timezone
-- is (0013): the version in force ends at the decision's recording time and the new one starts there. Runs as
-- aos_migration, which owns the table (code-house-rules 5.1).
--
-- The column changes type in place, so its exclusion constraint (one Approved version at any instant), its check
-- that every version has a start, the guard trigger of code-house-rules 7.3 (generic over the range type) and every
-- row stay. Each recorded business day becomes the instant that day starts under the Organisation's timezone in force
-- now (code-house-rules 9); a database holding user versions but no timezone in force is refused, never guessed.
--
-- Not compatible with the version running (code-house-rules 4.2): the code deployed before this migration reads the
-- column as dates, so between this migration and the new version taking traffic its reads of user versions fail and
-- no one signs in. Accepted for the test setup, which holds only synthetic data (RR-370).

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
    raise exception 'user versions exist but no Organisation timezone is in force (code-house-rules 9)'
      using errcode = 'AO003';
  end if;
  return day::timestamp at time zone zone;
end;
$$;
revoke execute on function access.start_of_business_day(date) from public;

alter table access.app_user_version
  alter column valid_during type tstzrange
  using pg_catalog.tstzrange(
    access.start_of_business_day(pg_catalog.lower(valid_during)),
    access.start_of_business_day(pg_catalog.upper(valid_during))
  );

drop function access.start_of_business_day(date);

-- The role joins the authority rows of step 0 (code-house-rules 8.2 "Authority first"; access-and-approvals 7.1 step
-- 4, 9.5; PRD-INT-003; DEC-118, RR-360). A command relying on a role assignment locks the role it grants in shared
-- mode, and a decision that makes a role version take effect locks it exclusively. A row lock needs the UPDATE
-- privilege on a column of the row, so the runtime role gets UPDATE on the identifier column only, as on app_user and
-- service_identity (0017): the rows stay append-only and the refuse_change triggers still refuse every UPDATE.

grant update (id) on access.role to aos_runtime;
