-- The inbox module's schema: work items, who may act on them, and task and approval routing (access-and-approvals
-- 11, 13.2; module-map 4.8; domain-model 3.3; PRD-ACS-009; S1-F01-T13). Runs as aos_migration, which owns everything
-- it creates (code-house-rules 5.1).
--
-- Work items are unscoped (code-house-rules 6.3): My work needs no permission (access-and-approvals 9.11, 11.2), so
-- no grant could admit its reader through row-level security. Who may act is decided when the list is read: a named
-- user, or the owner's eligibility rule, which `access` answers (11.2). Only inbox code reads these tables.

create schema inbox;
grant usage on schema inbox to aos_runtime;

-- The guard of an effective-dated version row of inbox (code-house-rules 7.3), the module's own, as access's: any
-- change while Awaiting approval; on an Approved version only moving the end of valid_during earlier, never to or
-- before its start; a Rejected version never changes.
create function inbox.guard_version_change() returns trigger
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
revoke execute on function inbox.guard_version_change() from public;

-- A work item: a projection of its owner's record (access-and-approvals 11.1; domain-model 3.3), keyed by the owner's
-- record, version and kind, so a replayed event never makes a second item (PRD-INT-008). The due time is null while
-- task and approval routing has no rows (RR-058): a stated absence, never a default. The exposure is an amount in paise,
-- Unknown, or none (an access change has no value), never Unknown as zero (PRD-MOD-015). Rebuildable by its owners.
create table inbox.work_item (
  id uuid primary key,
  kind text not null,
  owner_module text not null,
  owner_record_type text not null,
  owner_record_id uuid not null,
  owner_version_id uuid not null,
  state text not null,
  open boolean not null,
  due_at timestamptz,
  exposure_kind text not null,
  exposure_amount bigint,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  legal_entity_id uuid,
  brand_id uuid,
  recorded_at timestamptz not null default now(),
  constraint work_item_kind check (kind in ('task', 'approval', 'exception')),
  constraint work_item_state check (state <> ''),
  constraint work_item_exposure check (
    (exposure_kind in ('none', 'unknown') and exposure_amount is null)
    or (exposure_kind = 'known' and exposure_amount is not null)),
  constraint work_item_owner unique (owner_module, owner_record_id, owner_version_id, kind)
);
create index work_item_open on inbox.work_item (open, due_at);

-- Who may act on an item: a named user, or the owner's eligibility reference, such as `access.approval-request`,
-- which the owner answers for each reader when My work is read (access-and-approvals 11.1, 11.2).
create table inbox.work_item_actor (
  id uuid primary key,
  work_item_id uuid not null references inbox.work_item (id),
  user_id uuid,
  eligibility text,
  recorded_at timestamptz not null default now(),
  constraint work_item_actor_one check (num_nonnulls(user_id, eligibility) = 1),
  constraint work_item_actor_eligibility check (eligibility <> '')
);
create index work_item_actor_item on inbox.work_item_actor (work_item_id);
create index work_item_actor_user on inbox.work_item_actor (user_id);

-- Task and approval routing per action type and Site: the due-time rule and the escalation recipient
-- (access-and-approvals 9.4, 11.3, 13.2; GC3-8, DEC-105). The values are KDPS's (KDPS question 52) and stay OPEN: the
-- table has no rows and no default (RR-058). The shape of a due-time rule is a versioned format, named per version.
create table inbox.work_item_routing (
  id uuid primary key,
  action_type text not null,
  site_id uuid,
  recorded_at timestamptz not null default now(),
  constraint work_item_routing_action_type check (action_type <> '')
);
create unique index work_item_routing_key on inbox.work_item_routing (action_type, coalesce(site_id,
  '00000000-0000-0000-0000-000000000000'::uuid));

create table inbox.work_item_routing_version (
  id uuid primary key,
  work_item_routing_id uuid not null references inbox.work_item_routing (id),
  due_rule_format text not null,
  due_rule jsonb not null,
  escalation_user_id uuid,
  valid_during daterange not null,
  decision text not null,
  recorded_at timestamptz not null default now(),
  constraint work_item_routing_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint work_item_routing_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint work_item_routing_version_no_overlap
    exclude using gist (work_item_routing_id with =, valid_during with &&) where (decision = 'Approved')
);
create index work_item_routing_version_routing on inbox.work_item_routing_version (work_item_routing_id);
create trigger guard_version_change before update on inbox.work_item_routing_version
  for each row execute function inbox.guard_version_change();

-- An item changes only in its state, whether it is open and its due time, and is never deleted: it stays as the
-- history of what reached My work.
create function inbox.guard_work_item_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if (pg_catalog.to_jsonb(new) - 'state' - 'open' - 'due_at') = (pg_catalog.to_jsonb(old) - 'state' - 'open' - 'due_at')
     and (old.open or not new.open) then
    return new;
  end if;
  raise exception 'a work item changes only in its state, its due time and by closing' using errcode = 'AO003';
end;
$$;
revoke execute on function inbox.guard_work_item_change() from public;
create trigger guard_work_item_change before update on inbox.work_item
  for each row execute function inbox.guard_work_item_change();

create trigger refuse_row_change before update or delete on inbox.work_item_actor
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on inbox.work_item_actor
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on inbox.work_item_routing
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on inbox.work_item_routing
  for each statement execute function kernel.refuse_change();

grant select, insert, update on inbox.work_item to aos_runtime;
grant select, insert on inbox.work_item_actor to aos_runtime;
grant select, insert on inbox.work_item_routing to aos_runtime;
grant select, insert, update on inbox.work_item_routing_version to aos_runtime;
