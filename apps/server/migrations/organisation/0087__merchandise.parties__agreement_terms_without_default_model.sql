-- The agreement's default model for new bookings retired (structure-and-masters 5.2 as built; DEC-129, POL-01.02;
-- RR-545; S2-F01-T01). Every booking takes its brand Agreement's commercial model, so a new agreement version holds no
-- model for new bookings: it is written in the shape `agreement-terms/2`, which is `agreement-terms/1` without
-- `defaultModel`, every other term as it was (code-house-rules 3.3). A version already stored in `/1` is kept exactly as
-- stored, approved or not (PRD-MOD-011): no row is changed here and the versions' guard (code-house-rules 7.3) stays on.
-- Reading a `/1` version drops the term, so no read carries it. Runs as aos_migration, which owns the table
-- (code-house-rules 5.1).
--
-- Not compatible with the version running (code-house-rules 4.2): the code deployed before this migration writes new
-- versions in `/1`, which the trigger below refuses, so between this migration and the new version taking traffic
-- preparing an agreement version fails. Accepted as a planned brief interruption of the test setup, which holds only
-- synthetic data (DEC-120): `dev` is the only environment with data (deployment.md section 2).

-- Both shapes are stored: `/1` only in the rows written before this migration.
alter table merchandise.agreement_version drop constraint agreement_version_terms_format;
alter table merchandise.agreement_version
  add constraint agreement_version_terms_format check (terms_format in ('agreement-terms/1', 'agreement-terms/2')),
  add constraint agreement_version_no_default_model
    check (terms_format = 'agreement-terms/1' or not (terms ? 'defaultModel'));

-- A version written from now on is in `/2` and never carries the term. A check constraint cannot tell a new row from
-- one stored before, and a stored `/1` version still records its decision and has its end moved earlier as its guard
-- allows, so the rule is a trigger on insert alone; an update never changes a version's terms (its guard).
create function merchandise.refuse_retired_agreement_terms() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if new.terms_format <> 'agreement-terms/2' or new.terms ? 'defaultModel' then
    raise exception 'a new agreement version is written in agreement-terms/2, without the default model (DEC-129)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function merchandise.refuse_retired_agreement_terms() from public;
create trigger refuse_retired_terms before insert on merchandise.agreement_version
  for each row execute function merchandise.refuse_retired_agreement_terms();
