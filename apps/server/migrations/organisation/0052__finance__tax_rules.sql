-- The tax rules part of finance: goods classifications, rate and value rules with their slabs, registration
-- applicability with its components, the price basis and the rounding rules, each effective-dated, and the CA's
-- evidence of each version (shared-calculations 3.3, 10.1, 10.3; module-map 4.14; PRD-TAX-005, PRD-MOD-010,
-- PRD-MOD-014, PRD-MOD-015; POL-10.02, POL-10.05; GC4-2, GC7-1 to GC7-3, GC7-8, DEC-105, DEC-112, DEC-116;
-- S1-F09-T04). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible with the
-- version running: it only adds (code-house-rules 4.2). No rate, slab, component, price basis, rounding rule or date
-- is written here: they are Accounts' and the CA's, OPEN (V-18, GC7-1 to GC7-4, GC7-8).
--
-- The schema `finance` is shared with the books part (S1-F09-T01), whichever migration creates it first; the version
-- guard is the module's one guard, the same body as merchandise's, so both parts create or replace it alike.
--
-- Every record is an identity row, fixed at creation and never changed or deleted, and version rows under
-- structure-and-masters 2.2 and code-house-rules 7.3, frozen when prepared: approved versions never overlap, Scheduled
-- ones included. A version waits for a different authorised Accounts user and the CA's evidence (10.1; books-and-
-- posting 6.3). The rows a version holds, slabs and components, are written with it and frozen with it. Another
-- module's record (a tax registration, a user, an attachment) is kept by its identifier with no foreign key (2.5).
--
-- Every table is unscoped: the tax rules belong to the Organisation as a whole, their record type carries no scope
-- fact and the permission on the type decides (access-and-approvals 5.3); only finance code reads them (PRD-MOD-002).

create schema if not exists finance;
grant usage on schema finance to aos_runtime;

-- The guard of an effective-dated version row (code-house-rules 7.3), as merchandise's: a version Awaiting approval
-- changes only by its decision being recorded, once, taking an end where an approved version starts after it; an
-- Approved version only by moving the end of valid_during earlier, never to or before its start; a Rejected one never.
create or replace function finance.guard_version_change() returns trigger
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
revoke execute on function finance.guard_version_change() from public;

-- The rows a tax-rule version holds, slabs and components, are written in the transaction that records it and frozen
-- after (code-house-rules 7.3): a row naming a version recorded by an earlier transaction is refused. The trigger's
-- arguments name the version table and the row's column that names the version.
create function finance.tax_rule_row_frozen() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  recorded timestamptz;
begin
  execute pg_catalog.format('select recorded_at from finance.%I where id = $1', tg_argv[0])
    into recorded
    using (pg_catalog.to_jsonb(new) ->> tg_argv[1])::uuid;
  if recorded is distinct from pg_catalog.now() then
    raise exception 'a row of %.% is frozen with its version', tg_table_schema, tg_table_name
      using errcode = 'AO003';
  end if;
  return new;
end;
$$;
revoke execute on function finance.tax_rule_row_frozen() from public;

-- A goods classification: one HSN entry the Organisation uses, its code unique (10.1, 10.3; POL-10.05).
create table finance.goods_classification (
  id uuid primary key,
  code text not null unique,
  recorded_at timestamptz not null default now(),
  constraint goods_classification_code check (code <> '')
);
create trigger refuse_row_change before update or delete on finance.goods_classification
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.goods_classification
  for each statement execute function kernel.refuse_change();

-- A classification's versions: whether it is retired from the version's start; retired, never deleted (10.3). Each
-- version records where its value came from (code-house-rules 12.14).
create table finance.goods_classification_version (
  id uuid primary key,
  goods_classification_id uuid not null references finance.goods_classification (id),
  retired boolean not null,
  origin text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint goods_classification_version_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint goods_classification_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint goods_classification_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint goods_classification_version_no_overlap
    exclude using gist (goods_classification_id with =, valid_during with &&) where (decision = 'Approved')
);
create index goods_classification_version_classification
  on finance.goods_classification_version (goods_classification_id);
create index goods_classification_version_prepared_by on finance.goods_classification_version (prepared_by_user_id);
create trigger guard_version_change before update on finance.goods_classification_version
  for each row execute function finance.guard_version_change();

-- A rate and value rule: one per classification (10.1, 10.3).
create table finance.tax_rate_rule (
  id uuid primary key,
  goods_classification_id uuid not null unique references finance.goods_classification (id),
  recorded_at timestamptz not null default now()
);
create trigger refuse_row_change before update or delete on finance.tax_rate_rule
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.tax_rate_rule
  for each statement execute function kernel.refuse_change();

-- A rate rule's versions: one rate at every value, or value slabs compared with the value the rule names (GC7-2),
-- each part of that value stated, none defaulted. Rates are exact decimals, percentages (shared-calculations 3.1).
create table finance.tax_rate_rule_version (
  id uuid primary key,
  tax_rate_rule_id uuid not null references finance.tax_rate_rule (id),
  rule_kind text not null,
  rate numeric,
  compared_per text,
  compared_discounts text,
  compared_tax text,
  origin text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint tax_rate_rule_version_kind check (rule_kind in ('single-rate', 'slabs')),
  constraint tax_rate_rule_version_rate check (rate >= 0),
  constraint tax_rate_rule_version_compared check (
    compared_per in ('unit', 'line') and compared_discounts in ('before', 'after')
    and compared_tax in ('excluded', 'included')),
  constraint tax_rate_rule_version_shape check (
    (rule_kind = 'single-rate' and rate is not null
       and compared_per is null and compared_discounts is null and compared_tax is null)
    or (rule_kind = 'slabs' and rate is null
       and compared_per is not null and compared_discounts is not null and compared_tax is not null)),
  constraint tax_rate_rule_version_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint tax_rate_rule_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint tax_rate_rule_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint tax_rate_rule_version_no_overlap
    exclude using gist (tax_rate_rule_id with =, valid_during with &&) where (decision = 'Approved')
);
create index tax_rate_rule_version_rule on finance.tax_rate_rule_version (tax_rate_rule_id);
create index tax_rate_rule_version_prepared_by on finance.tax_rate_rule_version (prepared_by_user_id);
create trigger guard_version_change before update on finance.tax_rate_rule_version
  for each row execute function finance.guard_version_change();

-- A value slab of a rate rule version (10.3): its lower bound in paise, which side the bound's own value falls on,
-- and its rate as an exact decimal; frozen with the version.
create table finance.tax_rate_slab (
  id uuid primary key,
  tax_rate_rule_version_id uuid not null references finance.tax_rate_rule_version (id),
  lower_bound_paise bigint not null,
  bound_in text not null,
  rate numeric not null,
  recorded_at timestamptz not null default now(),
  constraint tax_rate_slab_bound check (lower_bound_paise >= 0),
  constraint tax_rate_slab_bound_in check (bound_in in ('this-slab', 'slab-below')),
  constraint tax_rate_slab_rate check (rate >= 0),
  constraint tax_rate_slab_once unique (tax_rate_rule_version_id, lower_bound_paise)
);
create trigger refuse_row_change before update or delete on finance.tax_rate_slab
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.tax_rate_slab
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_version before insert on finance.tax_rate_slab
  for each row execute function finance.tax_rule_row_frozen('tax_rate_rule_version', 'tax_rate_rule_version_id');

-- At commit: a slabs version has slabs, the lowest starting at zero; a single-rate version has none (10.3).
create function finance.check_tax_rate_slabs() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  lowest bigint;
  counted bigint;
begin
  select pg_catalog.min(s.lower_bound_paise), pg_catalog.count(*) into lowest, counted
    from finance.tax_rate_slab s where s.tax_rate_rule_version_id = new.id;
  if (new.rule_kind = 'slabs' and lowest is distinct from 0) or (new.rule_kind = 'single-rate' and counted > 0) then
    raise exception 'the slabs of rate rule version % do not start at zero', new.id using errcode = 'AO003';
  end if;
  return null;
end;
$$;
revoke execute on function finance.check_tax_rate_slabs() from public;
create constraint trigger check_slabs after insert on finance.tax_rate_rule_version
  deferrable initially deferred for each row execute function finance.check_tax_rate_slabs();

-- Registration applicability: one per tax registration of organisation (10.1, 10.3).
create table finance.registration_tax_applicability (
  id uuid primary key,
  tax_registration_id uuid not null unique,
  recorded_at timestamptz not null default now()
);
create trigger refuse_row_change before update or delete on finance.registration_tax_applicability
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.registration_tax_applicability
  for each statement execute function kernel.refuse_change();

-- Its versions: whether a counter sale under the registration carries output tax (GC7-8).
create table finance.registration_tax_applicability_version (
  id uuid primary key,
  registration_tax_applicability_id uuid not null references finance.registration_tax_applicability (id),
  charges_tax boolean not null,
  origin text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint registration_tax_applicability_version_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint registration_tax_applicability_version_decision
    check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint registration_tax_applicability_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint registration_tax_applicability_version_no_overlap
    exclude using gist (registration_tax_applicability_id with =, valid_during with &&) where (decision = 'Approved')
);
create index registration_tax_applicability_version_applicability
  on finance.registration_tax_applicability_version (registration_tax_applicability_id);
create index registration_tax_applicability_version_prepared_by
  on finance.registration_tax_applicability_version (prepared_by_user_id);
create trigger guard_version_change before update on finance.registration_tax_applicability_version
  for each row execute function finance.guard_version_change();

-- A tax component of an applicability version and its share of the rate as an exact decimal (10.3); frozen with it.
create table finance.registration_tax_component (
  id uuid primary key,
  registration_tax_applicability_version_id uuid not null
    references finance.registration_tax_applicability_version (id),
  component text not null,
  share numeric not null,
  recorded_at timestamptz not null default now(),
  constraint registration_tax_component_name check (component <> ''),
  constraint registration_tax_component_share check (share > 0 and share <= 1),
  constraint registration_tax_component_once unique (registration_tax_applicability_version_id, component)
);
create trigger refuse_row_change before update or delete on finance.registration_tax_component
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.registration_tax_component
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_version before insert on finance.registration_tax_component
  for each row execute function finance.tax_rule_row_frozen(
    'registration_tax_applicability_version', 'registration_tax_applicability_version_id');

-- At commit: when the registration charges tax, its component shares add up to one; when not, it has none (10.3).
create function finance.check_tax_component_shares() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  total numeric;
  counted bigint;
begin
  select pg_catalog.sum(c.share), pg_catalog.count(*) into total, counted
    from finance.registration_tax_component c where c.registration_tax_applicability_version_id = new.id;
  if (new.charges_tax and total is distinct from 1) or (not new.charges_tax and counted > 0) then
    raise exception 'the component shares of applicability version % do not add up to one', new.id
      using errcode = 'AO003';
  end if;
  return null;
end;
$$;
revoke execute on function finance.check_tax_component_shares() from public;
create constraint trigger check_shares after insert on finance.registration_tax_applicability_version
  deferrable initially deferred for each row execute function finance.check_tax_component_shares();

-- The price basis: one record for the Organisation (10.1; GC7-1).
create table finance.price_basis (
  id uuid primary key,
  recorded_at timestamptz not null default now()
);
create unique index price_basis_one on finance.price_basis ((true));
create trigger refuse_row_change before update or delete on finance.price_basis
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.price_basis
  for each statement execute function kernel.refuse_change();

-- Its versions: whether selling prices include tax; one in force (10.3).
create table finance.price_basis_version (
  id uuid primary key,
  price_basis_id uuid not null references finance.price_basis (id),
  prices_include_tax boolean not null,
  origin text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint price_basis_version_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint price_basis_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint price_basis_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint price_basis_version_no_overlap
    exclude using gist (price_basis_id with =, valid_during with &&) where (decision = 'Approved')
);
create index price_basis_version_basis on finance.price_basis_version (price_basis_id);
create index price_basis_version_prepared_by on finance.price_basis_version (prepared_by_user_id);
create trigger guard_version_change before update on finance.price_basis_version
  for each row execute function finance.guard_version_change();

-- A rounding rule: one per kind, discount, tax or bill (shared-calculations 3.3, 10.3).
create table finance.rounding_rule (
  id uuid primary key,
  kind text not null unique,
  recorded_at timestamptz not null default now(),
  constraint rounding_rule_kind check (kind in ('discount', 'tax', 'bill')),
  constraint rounding_rule_id_kind unique (id, kind)
);
create trigger refuse_row_change before update or delete on finance.rounding_rule
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.rounding_rule
  for each statement execute function kernel.refuse_change();

-- Its versions (10.3): the unit in paise above zero, one of the four modes of 3.3, and a level for tax only. The kind
-- is repeated from the rule, under a foreign key to the pair, so the level's check can see it.
create table finance.rounding_rule_version (
  id uuid primary key,
  rounding_rule_id uuid not null,
  kind text not null,
  unit_paise bigint not null,
  mode text not null,
  level text,
  origin text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint rounding_rule_version_rule foreign key (rounding_rule_id, kind)
    references finance.rounding_rule (id, kind),
  constraint rounding_rule_version_unit check (unit_paise > 0),
  constraint rounding_rule_version_mode check (mode in ('half-up', 'half-to-even', 'up', 'down')),
  constraint rounding_rule_version_level check (level in ('line', 'bill')),
  constraint rounding_rule_version_level_for_tax check ((kind = 'tax') = (level is not null)),
  constraint rounding_rule_version_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint rounding_rule_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint rounding_rule_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint rounding_rule_version_no_overlap
    exclude using gist (rounding_rule_id with =, valid_during with &&) where (decision = 'Approved')
);
create index rounding_rule_version_rule on finance.rounding_rule_version (rounding_rule_id, kind);
create index rounding_rule_version_prepared_by on finance.rounding_rule_version (prepared_by_user_id);
create trigger guard_version_change before update on finance.rounding_rule_version
  for each row execute function finance.guard_version_change();

-- The CA's evidence of one tax-rule version (10.1; books-and-posting 6.3, GC4-2; POL-10.05; DEC-116): a stored file
-- attached through files-imports, or a reference naming what the evidence is, who gave it, its date and where it is
-- kept. One piece of evidence covering a named set of versions is one row for each. Exactly one version is named.
create table finance.tax_rule_ca_evidence (
  id uuid primary key,
  goods_classification_version_id uuid references finance.goods_classification_version (id),
  tax_rate_rule_version_id uuid references finance.tax_rate_rule_version (id),
  registration_tax_applicability_version_id uuid references finance.registration_tax_applicability_version (id),
  price_basis_version_id uuid references finance.price_basis_version (id),
  rounding_rule_version_id uuid references finance.rounding_rule_version (id),
  evidence_kind text not null,
  attachment_id uuid,
  reference_what text,
  reference_given_by text,
  reference_given_on date,
  reference_kept_at text,
  recorded_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint tax_rule_ca_evidence_one_version check (pg_catalog.num_nonnulls(
    goods_classification_version_id, tax_rate_rule_version_id, registration_tax_applicability_version_id,
    price_basis_version_id, rounding_rule_version_id) = 1),
  constraint tax_rule_ca_evidence_kind check (
    (evidence_kind = 'file' and attachment_id is not null and reference_what is null and reference_given_by is null
       and reference_given_on is null and reference_kept_at is null)
    or (evidence_kind = 'reference' and attachment_id is null and reference_what <> '' and reference_given_by <> ''
       and reference_given_on is not null and reference_kept_at <> ''))
);
create index tax_rule_ca_evidence_classification on finance.tax_rule_ca_evidence (goods_classification_version_id);
create index tax_rule_ca_evidence_rate_rule on finance.tax_rule_ca_evidence (tax_rate_rule_version_id);
create index tax_rule_ca_evidence_applicability
  on finance.tax_rule_ca_evidence (registration_tax_applicability_version_id);
create index tax_rule_ca_evidence_price_basis on finance.tax_rule_ca_evidence (price_basis_version_id);
create index tax_rule_ca_evidence_rounding on finance.tax_rule_ca_evidence (rounding_rule_version_id);
create index tax_rule_ca_evidence_recorded_by on finance.tax_rule_ca_evidence (recorded_by_user_id);
create trigger refuse_row_change before update or delete on finance.tax_rule_ca_evidence
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.tax_rule_ca_evidence
  for each statement execute function kernel.refuse_change();

-- Runtime grants (code-house-rules 5.2). An identity row is append-only and locked: a change locks it at step 1, so two
-- changes to one record never pass each other (8.2), hence UPDATE on its identifier only (7.1). A version row takes the
-- changes its guard allows. The rows frozen with a version and the evidence are append-only.
grant select, insert on finance.goods_classification to aos_runtime;
grant update (id) on finance.goods_classification to aos_runtime;
grant select, insert, update on finance.goods_classification_version to aos_runtime;
grant select, insert on finance.tax_rate_rule to aos_runtime;
grant update (id) on finance.tax_rate_rule to aos_runtime;
grant select, insert, update on finance.tax_rate_rule_version to aos_runtime;
grant select, insert on finance.tax_rate_slab to aos_runtime;
grant select, insert on finance.registration_tax_applicability to aos_runtime;
grant update (id) on finance.registration_tax_applicability to aos_runtime;
grant select, insert, update on finance.registration_tax_applicability_version to aos_runtime;
grant select, insert on finance.registration_tax_component to aos_runtime;
grant select, insert on finance.price_basis to aos_runtime;
grant update (id) on finance.price_basis to aos_runtime;
grant select, insert, update on finance.price_basis_version to aos_runtime;
grant select, insert on finance.rounding_rule to aos_runtime;
grant update (id) on finance.rounding_rule to aos_runtime;
grant select, insert, update on finance.rounding_rule_version to aos_runtime;
grant select, insert on finance.tax_rule_ca_evidence to aos_runtime;
