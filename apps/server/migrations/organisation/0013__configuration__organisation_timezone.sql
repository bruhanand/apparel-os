-- The configuration module's schema and its first setting: the Organisation's timezone (code-house-rules 9;
-- domain-model 3.6; module-map section 3 rule 6, 4.4; PRD-MOD-009, PRD-MOD-010; RR-231; S1-F01-T10).
-- Runs as aos_migration, which owns everything it creates (code-house-rules 5.1).

create schema configuration;
grant usage on schema configuration to aos_runtime;

-- The guard of an effective-dated version row (code-house-rules 7.3), as access.guard_version_change: any change to a
-- version still Awaiting approval; on an Approved version only moving the end of valid_during earlier, never to or
-- before its start. A Rejected version never changes. Generic over the range type, so it serves an instant range.
create function configuration.guard_version_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  old_rest jsonb := pg_catalog.to_jsonb(old) - 'valid_during';
  new_rest jsonb := pg_catalog.to_jsonb(new) - 'valid_during';
begin
  if old.decision = 'Awaiting approval' then
    return new;
  end if;
  if old.decision = 'Approved' and new_rest = old_rest
     and pg_catalog.lower(new.valid_during) is not distinct from pg_catalog.lower(old.valid_during)
     and (new.valid_during = old.valid_during
          or (pg_catalog.upper(new.valid_during) > pg_catalog.lower(new.valid_during)
              and (pg_catalog.upper_inf(old.valid_during)
                   or pg_catalog.upper(new.valid_during) < pg_catalog.upper(old.valid_during)))) then
    return new;
  end if;
  raise exception 'a decided version of %.% changes only as code-house-rules 7.3 allows', tg_table_schema, tg_table_name
    using errcode = 'AO003';
end;
$$;
revoke execute on function configuration.guard_version_change() from public;

-- The Organisation's timezone, effective-dated, with no default (code-house-rules 9). Its versions are dated by
-- instants, not business dates: a business date is worked out under this timezone, so the timezone cannot be dated
-- by one (code-house-rules 9, as built). Each version records its origin: KDPS's answer, a setting of the test setup,
-- or synthetic (code-house-rules 12.14). Read by the command runner for every command, before any actor is set, so
-- it is unscoped (code-house-rules 6.3); it belongs to the Organisation, not to a place.
create table configuration.organisation_timezone_version (
  id uuid primary key,
  timezone text not null,
  origin text not null,
  valid_during tstzrange not null,
  decision text not null,
  recorded_at timestamptz not null default now(),
  constraint organisation_timezone_version_timezone check (timezone <> ''),
  constraint organisation_timezone_version_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint organisation_timezone_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint organisation_timezone_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint organisation_timezone_version_no_overlap exclude using gist (valid_during with &&)
    where (decision = 'Approved')
);
create trigger guard_version_change before update on configuration.organisation_timezone_version
  for each row execute function configuration.guard_version_change();

grant select, insert, update on configuration.organisation_timezone_version to aos_runtime;
