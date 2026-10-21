-- The booking module's schema and its open-to-buy budgets: one budget per brand and season, its versions, and Accounts'
-- check of a version (goods-in 3.3, 10.1; module-map section 5; PRD-BKG-004, PRD-MOD-010, PRD-MOD-011, PRD-MOD-014;
-- POL-05.09, POL-02.07; S2-F01-T02). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1).
-- Compatible with the version running: it only adds (code-house-rules 4.2). No amount is written here: every budget
-- is the product owner's, OPEN until set (V-17, RR-080).
--
-- A budget is an identity row, fixed at creation and never changed or deleted, naming its brand and its season, a
-- value of the Organisation's season attribute; both belong to `merchandise` and are kept by identifier with no
-- foreign key (code-house-rules 3.2). Its versions follow code-house-rules 7.3 dated by instants, as user versions are
-- (access-and-approvals 9.5): a version is frozen when it is prepared, Awaiting approval with no dates through
-- Accounts' check and the approval; the approval records its decision once and starts it at the decision's instant,
-- ending the version in force there; approved versions never overlap. Accounts' check is an append-only row of its
-- own, one per version, recorded by a person other than the version's preparer (POL-05.09, POL-02.07).
--
-- Every table is unscoped, as the masters of `organisation` are (structure-and-masters 6.1): a budget's record type
-- carries its brand, and every route authorises in its command with that fact (access-and-approvals 5.3, 7.1 step 3);
-- only booking code reads these tables (PRD-MOD-002).

create schema booking;
grant usage on schema booking to aos_runtime;

-- A budget: one brand and one season, each pair once (goods-in 3.3).
create table booking.open_to_buy_budget (
  id uuid primary key,
  brand_id uuid not null,
  season_attribute_id uuid not null,
  season_value_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint open_to_buy_budget_once unique (brand_id, season_value_id)
);
create index open_to_buy_budget_season on booking.open_to_buy_budget (season_value_id);
create trigger refuse_row_change before update or delete on booking.open_to_buy_budget
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.open_to_buy_budget
  for each statement execute function kernel.refuse_change();

-- A budget's versions: its amount in whole paise, never below zero (PRD-MOD-014), where the value came from
-- (code-house-rules 12.14), who prepared it, and its decision. An approved version holds the instants it is in force:
-- from its approval until the next approved version's, open-ended while it is the one in force.
create table booking.open_to_buy_budget_version (
  id uuid primary key,
  open_to_buy_budget_id uuid not null references booking.open_to_buy_budget (id),
  amount_paise bigint not null,
  origin text not null,
  decision text not null,
  valid_during tstzrange,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint open_to_buy_budget_version_amount check (amount_paise >= 0),
  constraint open_to_buy_budget_version_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint open_to_buy_budget_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint open_to_buy_budget_version_dated check ((decision = 'Approved') = (valid_during is not null)),
  constraint open_to_buy_budget_version_starts
    check (valid_during is null or (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during))),
  constraint open_to_buy_budget_version_no_overlap
    exclude using gist (open_to_buy_budget_id with =, valid_during with &&) where (decision = 'Approved')
);
create index open_to_buy_budget_version_budget on booking.open_to_buy_budget_version (open_to_buy_budget_id);
create index open_to_buy_budget_version_prepared_by on booking.open_to_buy_budget_version (prepared_by_user_id);

-- The guard of a budget version (code-house-rules 7.3), frozen when it is prepared: while Awaiting approval only its
-- decision is recorded, once, an approval starting it at an instant, open-ended, a rejection giving it no dates; an
-- Approved version only has its open end set, once, after its start, when the next one is approved; a Rejected
-- version never changes.
create function booking.guard_version_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  old_rest jsonb := pg_catalog.to_jsonb(old) - 'valid_during' - 'decision';
  new_rest jsonb := pg_catalog.to_jsonb(new) - 'valid_during' - 'decision';
begin
  if new_rest = old_rest and old.decision = 'Awaiting approval' and old.valid_during is null then
    if new.decision = 'Approved' and new.valid_during is not null and pg_catalog.upper_inf(new.valid_during) then
      return new;
    end if;
    if new.decision = 'Rejected' and new.valid_during is null then
      return new;
    end if;
  end if;
  if new_rest = old_rest and old.decision = 'Approved' and new.decision = 'Approved'
     and pg_catalog.upper_inf(old.valid_during) and not pg_catalog.upper_inf(new.valid_during)
     and pg_catalog.lower(new.valid_during) = pg_catalog.lower(old.valid_during)
     and pg_catalog.upper(new.valid_during) > pg_catalog.lower(new.valid_during) then
    return new;
  end if;
  raise exception 'a version of %.% changes only as code-house-rules 7.3 allows', tg_table_schema, tg_table_name
    using errcode = 'AO003';
end;
$$;
revoke execute on function booking.guard_version_change() from public;
create trigger guard_version_change before update on booking.open_to_buy_budget_version
  for each row execute function booking.guard_version_change();

-- Accounts' check of a version (goods-in 3.3; POL-05.09): append-only, one per version, recorded while the version
-- awaits its decision, with who checked it, when, and the approval decision of `access` that recorded it, kept by
-- identifier (code-house-rules 3.2). The checker is never the version's preparer (POL-02.07): `access` refuses them as
-- a preparer, and this trigger stands behind it.
create table booking.open_to_buy_budget_check (
  id uuid primary key,
  open_to_buy_budget_version_id uuid not null references booking.open_to_buy_budget_version (id),
  checked_by_user_id uuid not null,
  approval_decision_id uuid not null,
  checked_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint open_to_buy_budget_check_once unique (open_to_buy_budget_version_id)
);
create index open_to_buy_budget_check_checked_by on booking.open_to_buy_budget_check (checked_by_user_id);
create trigger refuse_row_change before update or delete on booking.open_to_buy_budget_check
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.open_to_buy_budget_check
  for each statement execute function kernel.refuse_change();

create function booking.check_budget_check() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  version booking.open_to_buy_budget_version;
begin
  select * into version from booking.open_to_buy_budget_version where id = new.open_to_buy_budget_version_id;
  if version.decision <> 'Awaiting approval' then
    raise exception 'budget version % is decided already', version.id using errcode = 'AO006';
  end if;
  if version.prepared_by_user_id = new.checked_by_user_id then
    raise exception 'budget version % is checked by its preparer', version.id using errcode = 'AO006';
  end if;
  return new;
end;
$$;
revoke execute on function booking.check_budget_check() from public;
create trigger check_budget_check before insert on booking.open_to_buy_budget_check
  for each row execute function booking.check_budget_check();

grant select, insert on booking.open_to_buy_budget to aos_runtime;
grant update (id) on booking.open_to_buy_budget to aos_runtime;
grant select, insert, update on booking.open_to_buy_budget_version to aos_runtime;
grant select, insert on booking.open_to_buy_budget_check to aos_runtime;
