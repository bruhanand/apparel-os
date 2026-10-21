-- The Organisation's season attribute and size attribute (structure-and-masters 4.2 "As built"; goods-in GI-2, GI-3;
-- RR-550, RR-556; PRD-ORG-011, PRD-MOD-010; POL-02.07; S2-F01-T02, S2-F02-T02): two Organisation settings the
-- catalogue keeps, each marking one list-type attribute. Runs as aos_migration, which owns everything it creates
-- (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2). No attribute is
-- marked here: the Organisation marks its own, and with none marked what needs it is refused (code-house-rules 12.14).
--
-- A marking is an identity row, one per mark, written with its first version and never changed or deleted, the row
-- every change and its decision lock. Its versions follow code-house-rules 7.3 dated by instants, as an open-to-buy
-- budget's are (access-and-approvals 9.5): a version is frozen when it is prepared, Awaiting approval with no dates;
-- the approval records its decision once and starts it at the decision's instant, ending the version in force there;
-- approved versions never overlap. The attribute is the catalogue's own, held by a foreign key.
--
-- Every table is unscoped: the catalogue belongs to the Organisation as a whole, the record type carries no scope fact
-- and the permission on the type decides (access-and-approvals 5.3); only merchandise code reads it (PRD-MOD-002).

-- A marking: the season or the size list, each once.
create table merchandise.marked_attribute (
  id uuid primary key,
  mark text not null unique,
  recorded_at timestamptz not null default now(),
  constraint marked_attribute_mark check (mark in ('season', 'size'))
);
create trigger refuse_row_change before update or delete on merchandise.marked_attribute
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.marked_attribute
  for each statement execute function kernel.refuse_change();

-- A marking's versions: the attribute it marks, where the choice came from (code-house-rules 12.14), who prepared it,
-- and its decision. An approved version holds the instants it is in force: from its approval until the next approved
-- version's, open-ended while it is the one in force.
create table merchandise.marked_attribute_version (
  id uuid primary key,
  marked_attribute_id uuid not null references merchandise.marked_attribute (id),
  attribute_id uuid not null references merchandise.attribute (id),
  origin text not null,
  decision text not null,
  valid_during tstzrange,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint marked_attribute_version_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint marked_attribute_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint marked_attribute_version_dated check ((decision = 'Approved') = (valid_during is not null)),
  constraint marked_attribute_version_starts
    check (valid_during is null or (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during))),
  constraint marked_attribute_version_no_overlap
    exclude using gist (marked_attribute_id with =, valid_during with &&) where (decision = 'Approved')
);
create index marked_attribute_version_marked_attribute on merchandise.marked_attribute_version (marked_attribute_id);
create index marked_attribute_version_attribute on merchandise.marked_attribute_version (attribute_id);
create index marked_attribute_version_prepared_by on merchandise.marked_attribute_version (prepared_by_user_id);

-- The guard of a version dated by instants (code-house-rules 7.3), as an open-to-buy budget version's: while Awaiting
-- approval only its decision is recorded, once, an approval starting it at an instant, open-ended, a rejection giving it
-- no dates; an Approved version only has its open end set, once, after its start, when the next one is approved; a
-- Rejected version never changes.
create function merchandise.guard_instant_version_change() returns trigger
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
revoke execute on function merchandise.guard_instant_version_change() from public;
create trigger guard_version_change before update on merchandise.marked_attribute_version
  for each row execute function merchandise.guard_instant_version_change();

-- Runtime grants (code-house-rules 5.2): the identity row is append-only and locked, a change locking it at step 1
-- (8.2), hence UPDATE on its identifier only (7.1); a version takes the changes its guard allows.
grant select, insert on merchandise.marked_attribute to aos_runtime;
grant update (id) on merchandise.marked_attribute to aos_runtime;
grant select, insert, update on merchandise.marked_attribute_version to aos_runtime;
