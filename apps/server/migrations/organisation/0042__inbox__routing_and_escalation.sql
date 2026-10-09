-- Task and approval routing and their escalation (access-and-approvals 9.4, 11.1, 11.3, 13.2; code-house-rules 7.3,
-- 8.2, 12.9; PRD-ACS-010; GC3-8, DEC-105; S1-F05-T02). Runs as aos_migration (code-house-rules 5.1).
--
-- Migration 0016 made the routing tables with no row (RR-058); nothing writes them before this one, so their columns
-- are completed here as exception routing's are (12.4 "As built"): the escalation recipient a named user or a role, the
-- origin of the values (code-house-rules 12.14) and who prepared the version, frozen when prepared and approved by a
-- different authorised person. No value has a default (KDPS question 52).

-- The guard of a routing version, frozen when prepared as exception routing's (code-house-rules 7.3): while Awaiting
-- approval only its decision is recorded, once; an Approved version only has its end moved earlier, never to or
-- before its start, when the next one follows it; a Rejected version never changes. It replaces 0016's, whose only
-- table this is.
create or replace function inbox.guard_version_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  old_rest jsonb := pg_catalog.to_jsonb(old) - 'valid_during' - 'decision';
  new_rest jsonb := pg_catalog.to_jsonb(new) - 'valid_during' - 'decision';
begin
  if old.decision = 'Awaiting approval' and new.decision in ('Approved', 'Rejected') and new_rest = old_rest
     and new.valid_during = old.valid_during then
    return new;
  end if;
  if old.decision = 'Approved' and new.decision = 'Approved' and new_rest = old_rest
     and pg_catalog.lower(new.valid_during) = pg_catalog.lower(old.valid_during)
     and pg_catalog.upper(new.valid_during) > pg_catalog.lower(new.valid_during)
     and (pg_catalog.upper_inf(old.valid_during)
          or pg_catalog.upper(new.valid_during) < pg_catalog.upper(old.valid_during)) then
    return new;
  end if;
  raise exception 'a decided version of %.% changes only as code-house-rules 7.3 allows', tg_table_schema, tg_table_name
    using errcode = 'AO003';
end;
$$;
revoke execute on function inbox.guard_version_change() from public;

alter table inbox.work_item_routing_version add column escalation_role_id uuid;
alter table inbox.work_item_routing_version add column origin text not null;
alter table inbox.work_item_routing_version add column prepared_by_user_id uuid not null;
alter table inbox.work_item_routing_version add constraint work_item_routing_version_escalation
  check (num_nonnulls(escalation_user_id, escalation_role_id) = 1);
alter table inbox.work_item_routing_version add constraint work_item_routing_version_format
  check (due_rule_format <> '');
alter table inbox.work_item_routing_version add constraint work_item_routing_version_origin
  check (origin in ('kdps', 'test-setup', 'synthetic'));

-- The routing version that gave a task or an approval item its due time and escalation recipient, when `inbox`
-- received it (11.1; PRD-MOD-010); null while none was in force, and so no due time. Fixed with the item, as its
-- guard keeps every column but its state, whether it is open and its due time.
alter table inbox.work_item add column routing_version_id uuid references inbox.work_item_routing_version (id);
create index work_item_overdue on inbox.work_item (open, kind, due_at) where routing_version_id is not null;

-- A routing's versions are prepared and decided under the routing row's lock at step 1 (code-house-rules 8.2), which
-- needs UPDATE (id); its guard refuses every change of a column anyway.
grant update (id) on inbox.work_item_routing to aos_runtime;

-- The pg-boss queue of the inbox job kind that escalates tasks and approvals past their due time (11.3; PRD-ACS-010),
-- created by migration because the runtime role creates no object (code-house-rules 3.2, 12.9). Kept as every queue of
-- 0009: pg-boss deletes no job until the retention periods of CH-9 are set.
select pgboss.create_queue('inbox.escalate-overdue', jsonb_build_object(
  'policy', 'standard',
  'retryLimit', 0,
  'deleteAfterSeconds', 0,
  'retentionSeconds', 2147483647
));
