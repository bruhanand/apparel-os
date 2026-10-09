-- The merchandise catalogue's first records: brands with their aliases and optional parent brand, business units'
-- brand coverage, categories with their size sets and identity attributes, the Organisation's attributes and their
-- vocabularies, and vocabulary proposals (structure-and-masters 2, 3.3, 4.1, 4.2, 6.2; module-map 4.12; PRD-MER-001,
-- PRD-MER-002, PRD-MER-004, PRD-MER-020, PRD-ORG-006, PRD-ORG-011, PRD-IMP-008; POL-02.07, POL-04.01; DEC-123;
-- S1-F03-T01). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible with the
-- version running: it only adds (code-house-rules 4.2). No brand, category, attribute or value is written here.
--
-- Every master is an identity row, fixed at creation and never changed or deleted, and version rows under
-- structure-and-masters 2.2 and code-house-rules 7.3: approved versions never overlap, Scheduled ones included, and an
-- approved version changes only by its end moving earlier, when the next version starts. A version of a brand,
-- category, size set, attribute or vocabulary value is recorded Approved, as no rule names an approval for it (2.3);
-- a brand coverage version waits for a different authorised person (3.3; GC2-2, DEC-105). The rows a version holds,
-- aliases, coverage members, sizes and identity attributes, are written with it in its own transaction and frozen
-- with it. Another module's record (a business unit, a user) is kept by its identifier with no foreign key (2.5).
--
-- Every table is unscoped: the catalogue belongs to the Organisation as a whole, its record types carry no scope fact
-- and the permission on the type decides (access-and-approvals 5.3); only merchandise code reads it (PRD-MOD-002).

create schema merchandise;
grant usage on schema merchandise to aos_runtime;

-- The guard of an effective-dated version row (code-house-rules 7.3), as organisation's: a version Awaiting approval
-- changes only by its decision being recorded, once, taking an end where an approved version starts after it; an
-- Approved version only by moving the end of valid_during earlier, never to or before its start; a Rejected one never.
create function merchandise.guard_version_change() returns trigger
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
revoke execute on function merchandise.guard_version_change() from public;

-- The rows a version holds are written in the transaction that records it and frozen after (structure-and-masters
-- 6.2; code-house-rules 7.3): a row naming a version recorded by an earlier transaction is refused. The trigger's
-- arguments name the version table and the row's column that names the version.
create function merchandise.refuse_after_version() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  recorded timestamptz;
begin
  execute pg_catalog.format('select recorded_at from merchandise.%I where id = $1', tg_argv[0])
    into recorded
    using (pg_catalog.to_jsonb(new) ->> tg_argv[1])::uuid;
  if recorded is distinct from pg_catalog.now() then
    raise exception 'a row of %.% is frozen with its version', tg_table_schema, tg_table_name
      using errcode = 'AO003';
  end if;
  return new;
end;
$$;
revoke execute on function merchandise.refuse_after_version() from public;

-- A brand (4.1; PRD-MER-001). A brand is not a party (5.1).
create table merchandise.brand (
  id uuid primary key,
  code text not null unique,
  recorded_at timestamptz not null default now(),
  constraint brand_code check (code <> '')
);
create trigger refuse_row_change before update or delete on merchandise.brand
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.brand
  for each statement execute function kernel.refuse_change();

-- A brand's versioned fields (4.1): its name, its optional parent brand, its family, kept apart from its aliases
-- (PRD-MER-020; DEC-123), and whether it is retired from the version's start (2.5).
create table merchandise.brand_version (
  id uuid primary key,
  brand_id uuid not null references merchandise.brand (id),
  name text not null,
  parent_brand_id uuid references merchandise.brand (id),
  retired boolean not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint brand_version_name check (name <> ''),
  constraint brand_version_not_own_parent check (parent_brand_id is distinct from brand_id),
  constraint brand_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint brand_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint brand_version_no_overlap exclude using gist (brand_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index brand_version_brand on merchandise.brand_version (brand_id);
create index brand_version_parent on merchandise.brand_version (parent_brand_id);
create index brand_version_prepared_by on merchandise.brand_version (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.brand_version
  for each row execute function merchandise.guard_version_change();

-- An alias of a brand, frozen with the version that names it (PRD-MER-001).
create table merchandise.brand_alias (
  id uuid primary key,
  brand_version_id uuid not null references merchandise.brand_version (id),
  alias text not null,
  recorded_at timestamptz not null default now(),
  constraint brand_alias_text check (alias <> ''),
  constraint brand_alias_once unique (brand_version_id, alias)
);
create trigger refuse_row_change before update or delete on merchandise.brand_alias
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.brand_alias
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_version before insert on merchandise.brand_alias
  for each row execute function merchandise.refuse_after_version('brand_version', 'brand_version_id');

-- A business unit's brand coverage: its identity is the unit's, kept by identifier (3.3; 2.5), a row a decision locks.
create table merchandise.business_unit_coverage (
  id uuid primary key,
  recorded_at timestamptz not null default now()
);
create trigger refuse_row_change before update or delete on merchandise.business_unit_coverage
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.business_unit_coverage
  for each statement execute function kernel.refuse_change();

-- The unit's coverage, effective-dated (3.3; PRD-ORG-006): the brands it covers while the version is in force.
create table merchandise.business_unit_brand (
  id uuid primary key,
  business_unit_id uuid not null references merchandise.business_unit_coverage (id),
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint business_unit_brand_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint business_unit_brand_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint business_unit_brand_no_overlap exclude using gist (business_unit_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index business_unit_brand_unit on merchandise.business_unit_brand (business_unit_id);
create index business_unit_brand_prepared_by on merchandise.business_unit_brand (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.business_unit_brand
  for each row execute function merchandise.guard_version_change();

-- A brand a coverage version lists, frozen with it.
create table merchandise.business_unit_brand_member (
  id uuid primary key,
  business_unit_brand_id uuid not null references merchandise.business_unit_brand (id),
  brand_id uuid not null references merchandise.brand (id),
  recorded_at timestamptz not null default now(),
  constraint business_unit_brand_member_once unique (business_unit_brand_id, brand_id)
);
create index business_unit_brand_member_brand on merchandise.business_unit_brand_member (brand_id);
create trigger refuse_row_change before update or delete on merchandise.business_unit_brand_member
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.business_unit_brand_member
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_version before insert on merchandise.business_unit_brand_member
  for each row execute function merchandise.refuse_after_version('business_unit_brand', 'business_unit_brand_id');

-- An attribute the Organisation configures (4.2; GC2-9; PRD-ORG-011): list-type, taking only its approved vocabulary
-- values, or text, fixed at creation.
create table merchandise.attribute (
  id uuid primary key,
  code text not null unique,
  value_kind text not null,
  recorded_at timestamptz not null default now(),
  constraint attribute_code check (code <> ''),
  constraint attribute_value_kind check (value_kind in ('list', 'text'))
);
create trigger refuse_row_change before update or delete on merchandise.attribute
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.attribute
  for each statement execute function kernel.refuse_change();

-- An attribute's name, effective-dated.
create table merchandise.attribute_version (
  id uuid primary key,
  attribute_id uuid not null references merchandise.attribute (id),
  name text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint attribute_version_name check (name <> ''),
  constraint attribute_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint attribute_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint attribute_version_no_overlap exclude using gist (attribute_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index attribute_version_attribute on merchandise.attribute_version (attribute_id);
create index attribute_version_prepared_by on merchandise.attribute_version (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.attribute_version
  for each row execute function merchandise.guard_version_change();

-- A proposed value of a list-type attribute, kept apart from the vocabulary until a different person confirms it
-- (4.2; PRD-IMP-008, POL-02.07). Its state moves once, from Proposed to Confirmed or Rejected (DM-4, DEC-105); one open
-- proposal per attribute and code.
create table merchandise.vocabulary_proposal (
  id uuid primary key,
  attribute_id uuid not null references merchandise.attribute (id),
  code text not null,
  name text not null,
  proposed_by_user_id uuid not null,
  state text not null,
  decided_by_user_id uuid,
  decided_at timestamptz,
  recorded_at timestamptz not null default now(),
  constraint vocabulary_proposal_code check (code <> ''),
  constraint vocabulary_proposal_name check (name <> ''),
  constraint vocabulary_proposal_state check (state in ('Proposed', 'Confirmed', 'Rejected')),
  constraint vocabulary_proposal_decided
    check ((state = 'Proposed') = (decided_by_user_id is null) and (decided_by_user_id is null) = (decided_at is null)),
  -- The confirmer, or the person rejecting it, is never its proposer (PRD-IMP-008).
  constraint vocabulary_proposal_independent check (decided_by_user_id is distinct from proposed_by_user_id)
);
create index vocabulary_proposal_attribute on merchandise.vocabulary_proposal (attribute_id);
create index vocabulary_proposal_proposed_by on merchandise.vocabulary_proposal (proposed_by_user_id);
create unique index vocabulary_proposal_open_code on merchandise.vocabulary_proposal (attribute_id, code)
  where state = 'Proposed';

-- A proposal changes only by its decision, once, nothing else changed.
create function merchandise.guard_proposal_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if old.state = 'Proposed' and new.state in ('Confirmed', 'Rejected')
     and (pg_catalog.to_jsonb(new) - 'state' - 'decided_by_user_id' - 'decided_at')
       = (pg_catalog.to_jsonb(old) - 'state' - 'decided_by_user_id' - 'decided_at') then
    return new;
  end if;
  raise exception 'a vocabulary proposal changes only by its decision, once' using errcode = 'AO003';
end;
$$;
revoke execute on function merchandise.guard_proposal_change() from public;
create trigger guard_proposal_change before update on merchandise.vocabulary_proposal
  for each row execute function merchandise.guard_proposal_change();

-- An approved vocabulary value, fixed to its attribute, its code unique in it (4.1, 4.2), made by confirming its
-- proposal, so the vocabulary keeps only approved values.
create table merchandise.vocabulary_value (
  id uuid primary key,
  attribute_id uuid not null references merchandise.attribute (id),
  code text not null,
  proposal_id uuid not null unique references merchandise.vocabulary_proposal (id),
  recorded_at timestamptz not null default now(),
  constraint vocabulary_value_code check (code <> ''),
  constraint vocabulary_value_code_in_attribute unique (attribute_id, code)
);
create trigger refuse_row_change before update or delete on merchandise.vocabulary_value
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.vocabulary_value
  for each statement execute function kernel.refuse_change();

-- A vocabulary value's name, effective-dated.
create table merchandise.vocabulary_value_version (
  id uuid primary key,
  vocabulary_value_id uuid not null references merchandise.vocabulary_value (id),
  name text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint vocabulary_value_version_name check (name <> ''),
  constraint vocabulary_value_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint vocabulary_value_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint vocabulary_value_version_no_overlap exclude using gist (vocabulary_value_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index vocabulary_value_version_value on merchandise.vocabulary_value_version (vocabulary_value_id);
create index vocabulary_value_version_prepared_by on merchandise.vocabulary_value_version (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.vocabulary_value_version
  for each row execute function merchandise.guard_version_change();

-- A category of the tree (4.1; PRD-MER-002).
create table merchandise.category (
  id uuid primary key,
  code text not null unique,
  recorded_at timestamptz not null default now(),
  constraint category_code check (code <> '')
);
create trigger refuse_row_change before update or delete on merchandise.category
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.category
  for each statement execute function kernel.refuse_change();

-- A size set, fixed to its category (4.1). The pair (id, category_id) is unique so a category version names only its
-- own category's size sets.
create table merchandise.size_set (
  id uuid primary key,
  code text not null unique,
  category_id uuid not null references merchandise.category (id),
  recorded_at timestamptz not null default now(),
  constraint size_set_code check (code <> ''),
  constraint size_set_of_category unique (id, category_id)
);
create index size_set_category on merchandise.size_set (category_id);
create trigger refuse_row_change before update or delete on merchandise.size_set
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.size_set
  for each statement execute function kernel.refuse_change();

-- A size set's name and, through size_set_member, its ordered sizes, effective-dated.
create table merchandise.size_set_version (
  id uuid primary key,
  size_set_id uuid not null references merchandise.size_set (id),
  name text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint size_set_version_name check (name <> ''),
  constraint size_set_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint size_set_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint size_set_version_no_overlap exclude using gist (size_set_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index size_set_version_size_set on merchandise.size_set_version (size_set_id);
create index size_set_version_prepared_by on merchandise.size_set_version (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.size_set_version
  for each row execute function merchandise.guard_version_change();

-- A size of a size set version, in its place in the order, each given once (4.1).
create table merchandise.size_set_member (
  id uuid primary key,
  size_set_version_id uuid not null references merchandise.size_set_version (id),
  position integer not null,
  size text not null,
  recorded_at timestamptz not null default now(),
  constraint size_set_member_size check (size <> ''),
  constraint size_set_member_position check (position >= 0),
  constraint size_set_member_place unique (size_set_version_id, position),
  constraint size_set_member_once unique (size_set_version_id, size)
);
create trigger refuse_row_change before update or delete on merchandise.size_set_member
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.size_set_member
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_version before insert on merchandise.size_set_member
  for each row execute function merchandise.refuse_after_version('size_set_version', 'size_set_version_id');

-- A category's versioned fields (4.1): its name, its parent in the tree, its size set, one of its own, and through
-- category_identity_attribute the attributes of a SKU's identity. Its tracking profile comes with S1-F03-T02.
create table merchandise.category_version (
  id uuid primary key,
  category_id uuid not null references merchandise.category (id),
  name text not null,
  parent_category_id uuid references merchandise.category (id),
  size_set_id uuid,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint category_version_name check (name <> ''),
  constraint category_version_not_own_parent check (parent_category_id is distinct from category_id),
  constraint category_version_size_set foreign key (size_set_id, category_id)
    references merchandise.size_set (id, category_id),
  constraint category_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint category_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint category_version_no_overlap exclude using gist (category_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index category_version_category on merchandise.category_version (category_id);
create index category_version_parent on merchandise.category_version (parent_category_id);
create index category_version_size_set on merchandise.category_version (size_set_id, category_id);
create index category_version_prepared_by on merchandise.category_version (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.category_version
  for each row execute function merchandise.guard_version_change();

-- An attribute of a SKU's identity in a category version, frozen with it (4.1; PRD-ORG-011, POL-04.02).
create table merchandise.category_identity_attribute (
  id uuid primary key,
  category_version_id uuid not null references merchandise.category_version (id),
  attribute_id uuid not null references merchandise.attribute (id),
  recorded_at timestamptz not null default now(),
  constraint category_identity_attribute_once unique (category_version_id, attribute_id)
);
create index category_identity_attribute_attribute on merchandise.category_identity_attribute (attribute_id);
create trigger refuse_row_change before update or delete on merchandise.category_identity_attribute
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.category_identity_attribute
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_version before insert on merchandise.category_identity_attribute
  for each row execute function merchandise.refuse_after_version('category_version', 'category_version_id');

-- Runtime grants (code-house-rules 5.2). An identity row is append-only and locked: a change locks it at step 1, so two
-- changes to one master never pass each other (8.2), hence UPDATE on its identifier only (7.1). A version row takes
-- the changes its guard allows, a proposal its decision. The rows frozen with a version are append-only.
grant select, insert on merchandise.brand to aos_runtime;
grant update (id) on merchandise.brand to aos_runtime;
grant select, insert, update on merchandise.brand_version to aos_runtime;
grant select, insert on merchandise.brand_alias to aos_runtime;
grant select, insert on merchandise.business_unit_coverage to aos_runtime;
grant update (id) on merchandise.business_unit_coverage to aos_runtime;
grant select, insert, update on merchandise.business_unit_brand to aos_runtime;
grant select, insert on merchandise.business_unit_brand_member to aos_runtime;
grant select, insert on merchandise.attribute to aos_runtime;
grant update (id) on merchandise.attribute to aos_runtime;
grant select, insert, update on merchandise.attribute_version to aos_runtime;
grant select, insert, update on merchandise.vocabulary_proposal to aos_runtime;
grant select, insert on merchandise.vocabulary_value to aos_runtime;
grant update (id) on merchandise.vocabulary_value to aos_runtime;
grant select, insert, update on merchandise.vocabulary_value_version to aos_runtime;
grant select, insert on merchandise.category to aos_runtime;
grant update (id) on merchandise.category to aos_runtime;
grant select, insert on merchandise.size_set to aos_runtime;
grant update (id) on merchandise.size_set to aos_runtime;
grant select, insert, update on merchandise.size_set_version to aos_runtime;
grant select, insert on merchandise.size_set_member to aos_runtime;
grant select, insert, update on merchandise.category_version to aos_runtime;
grant select, insert on merchandise.category_identity_attribute to aos_runtime;
