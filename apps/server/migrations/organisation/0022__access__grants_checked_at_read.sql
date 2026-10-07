-- Effective grants checked against today when they are read, not when the sweep runs (access-and-approvals 7.2, 13.1;
-- code-house-rules 6.2; PRD-ACS-005; DEC-120, RR-390; S1-F01-T26). An assignment, and the role version it grants
-- through, authorise only while their dates hold today under the Organisation's timezone. Authorise reads the
-- assignments themselves; row-level security reads the effective grants, so those now keep, for each assignment and
-- each Approved version of its role that is in force today or later, the business days both hold (`valid_during`, the
-- intersection of the two ranges), and access.row_visible admits a grant only while that range holds the transaction's
-- business date. So an end that passed hides rows in the very next transaction, and a Scheduled assignment or role
-- version shows them from its start, whether or not the rebuild job has run since; the job only refreshes the rows and
-- publishes what changed. Runs as aos_migration, which owns the table and the function (code-house-rules 5.1).
--
-- `kernel` sets the business date beside the actor at the start of each transaction, as
-- set_config('aos.business_date', <date>, true), from the Organisation's timezone in force at the command's instant
-- (code-house-rules 6.2, 9). With no date set, as with no actor, no grant is admitted (PRD-SEC-005).
--
-- Not compatible with the version running (code-house-rules 4.2): the code deployed before this migration writes grant
-- rows without the new columns and sets no business date, so between this migration and the new version taking
-- traffic no scoped row shows and an approval that rebuilds grants fails. Accepted as a planned brief interruption of
-- the test setup, which holds only synthetic data (DEC-120).

alter table access.effective_grant
  add column role_version_id uuid references access.role_version (id),
  add column valid_during daterange;

-- The rows written so far: each came from its assignment and the role version in force on its `as_of` day.
update access.effective_grant g
   set role_version_id = v.id,
       valid_during = a.valid_during * v.valid_during
  from access.role_assignment a
  join access.role_version v on v.role_id = a.role_id and v.decision = 'Approved'
 where a.id = g.role_assignment_id
   and v.valid_during @> g.as_of;
delete from access.effective_grant where role_version_id is null;

alter table access.effective_grant
  alter column role_version_id set not null,
  alter column valid_during set not null,
  drop constraint effective_grant_once,
  add constraint effective_grant_once unique (actor_id, record_type, role_assignment_id, role_version_id),
  add constraint effective_grant_dated
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during));

-- As 0010's, with one more condition: the grant's business days hold the transaction's business date. CREATE OR
-- REPLACE keeps the function's owner and grants.
create or replace function access.row_visible(
  record_type text, site_id uuid, store_id uuid, business_unit_id uuid, legal_entity_id uuid, brand_id uuid,
  subject_id uuid
) returns boolean
  language sql
  stable
  security invoker
  set search_path = pg_catalog
as $$
  select coalesce(bool_or(
    case when g.own_records then row_visible.subject_id = g.actor_id
    else (not g.declares_legal_entity or g.legal_entity_all or row_visible.legal_entity_id = any (g.legal_entity_ids))
     and (not g.declares_place or g.place_all or row_visible.business_unit_id = any (g.business_unit_ids)
          or row_visible.store_id = any (g.store_ids) or row_visible.site_id = any (g.site_ids))
     and (not g.declares_brand or g.brand_all or row_visible.brand_id = any (g.brand_ids))
    end), false)
  from access.effective_grant g
  where g.actor_id = nullif(pg_catalog.current_setting('aos.actor_id', true), '')::uuid
    and g.record_type = row_visible.record_type
    and g.valid_during @> nullif(pg_catalog.current_setting('aos.business_date', true), '')::date
$$;
