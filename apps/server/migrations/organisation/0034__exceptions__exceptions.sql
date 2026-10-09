-- The exceptions module's schema: exception types, exceptions, their links and events, and routing with its versions
-- (access-and-approvals 12, 13.3; module-map 4.13; PRD-EXC-001 to PRD-EXC-004, POL-02.16, POL-03.04, POL-03.05;
-- S1-F08-T02). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1).
--
-- Every table is unscoped (access-and-approvals 12.4 "As built"): an exception is acted on by its owner, a named user
-- or a holder of a role within the Site's scope, who may hold no grant on the exception's type (module-map 4.13), and
-- it is raised inside the command that found the problem, whose actor may hold none either; no row-level policy can
-- say both. Only exceptions code reads these tables, and it admits a reader only as the owner or through Authorise on
-- `exceptions.exception` with the exception's facts (access-and-approvals 7.1).

create schema exceptions;
grant usage on schema exceptions to aos_runtime;

-- A type a module registers in code (12.1), recorded the first time it is routed or raised. Never changed.
create table exceptions.exception_type (
  id uuid primary key,
  code text not null,
  category text not null,
  module text not null,
  recorded_at timestamptz not null default now(),
  constraint exception_type_code unique (code),
  constraint exception_type_category check (category in ('shortage', 'excess', 'damage', 'mismatch', 'transit-gap',
    'cash-variance', 'uncertain-payment', 'missing-report', 'unfinished-operation', 'source-conflict')),
  constraint exception_type_module check (module <> '')
);

-- A routing rule per type and Site (12.2; POL-02.16, DEC-037). A null Site routes the exceptions that have no Site,
-- such as a failed job of the Organisation as a whole; it is no fallback for any Site.
create table exceptions.exception_routing (
  id uuid primary key,
  exception_type_id uuid not null references exceptions.exception_type (id),
  site_id uuid,
  recorded_at timestamptz not null default now()
);
create unique index exception_routing_key on exceptions.exception_routing (exception_type_id, site_id)
  nulls not distinct;

-- The routing's effective-dated versions (code-house-rules 7.3; PRD-MOD-010): the owner, the due-time rule in a
-- versioned format, and the escalation recipient, each a named user or a role; where the values came from (12.14);
-- who prepared it. No version has a default (V-03). A version is frozen when it is prepared and takes effect from its
-- first day once a different authorised person approves it (access-and-approvals 12.4 "As built"; POL-02.11); its
-- decision is recorded once. Approved versions never overlap.
create table exceptions.exception_routing_version (
  id uuid primary key,
  exception_routing_id uuid not null references exceptions.exception_routing (id),
  owner_user_id uuid,
  owner_role_id uuid,
  due_rule_format text not null,
  due_rule jsonb not null,
  escalation_user_id uuid,
  escalation_role_id uuid,
  valid_during daterange not null,
  origin text not null,
  prepared_by_user_id uuid not null,
  decision text not null,
  recorded_at timestamptz not null default now(),
  constraint exception_routing_version_owner check (num_nonnulls(owner_user_id, owner_role_id) = 1),
  constraint exception_routing_version_escalation check (num_nonnulls(escalation_user_id, escalation_role_id) = 1),
  constraint exception_routing_version_format check (due_rule_format <> ''),
  constraint exception_routing_version_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint exception_routing_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint exception_routing_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint exception_routing_version_no_overlap
    exclude using gist (exception_routing_id with =, valid_during with &&) where (decision = 'Approved')
);
create index exception_routing_version_routing on exceptions.exception_routing_version (exception_routing_id);

-- The guard of a routing version (code-house-rules 7.3), frozen when prepared as `organisation`'s are: while Awaiting
-- approval only its decision is recorded, once, and recording an approval may give it no other change; an Approved
-- version only has its end moved earlier, never to or before its start, when the next one follows it; a Rejected
-- version never changes.
create function exceptions.guard_version_change() returns trigger
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
revoke execute on function exceptions.guard_version_change() from public;
create trigger guard_version_change before update on exceptions.exception_routing_version
  for each row execute function exceptions.guard_version_change();

-- An exception (12.1, 13.3): its code from the exception-code series, keyed by the event that raised it so a replay
-- makes no second one (PRD-INT-008); its type and Site, fixed; the Store, business unit and brand where they apply;
-- its exposure in paise or Unknown, never Unknown as zero (PRD-MOD-015); the routing version it used (PRD-MOD-010),
-- with the owner and due time it gave; the earlier exception of its type on the same record (PRD-EXC-004). Its state
-- and owner are projections of its events, and change only with them.
create table exceptions.exception (
  id uuid primary key,
  code text not null,
  raising_event text not null,
  exception_type_id uuid not null references exceptions.exception_type (id),
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  brand_id uuid,
  exposure_kind text not null,
  exposure_amount bigint,
  routing_version_id uuid not null references exceptions.exception_routing_version (id),
  owner_user_id uuid,
  owner_role_id uuid,
  due_at timestamptz not null,
  state text not null,
  earlier_exception_id uuid references exceptions.exception (id),
  raised_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint exception_code check (code <> ''),
  constraint exception_code_unique unique (code),
  constraint exception_raising_event check (raising_event <> ''),
  constraint exception_raising_event_unique unique (raising_event),
  constraint exception_exposure check (
    (exposure_kind = 'unknown' and exposure_amount is null)
    or (exposure_kind = 'known' and exposure_amount is not null and exposure_amount >= 0)),
  constraint exception_owner check (num_nonnulls(owner_user_id, owner_role_id) = 1),
  constraint exception_state check (state in ('Unresolved', 'Resolved', 'Closed', 'Reopened'))
);
create index exception_open on exceptions.exception (state, due_at);
create index exception_type_site on exceptions.exception (exception_type_id, site_id);

create function exceptions.guard_exception_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if (pg_catalog.to_jsonb(new) - 'state' - 'owner_user_id' - 'owner_role_id')
     = (pg_catalog.to_jsonb(old) - 'state' - 'owner_user_id' - 'owner_role_id') then
    return new;
  end if;
  raise exception 'an exception changes only in its state and its owner' using errcode = 'AO003';
end;
$$;
revoke execute on function exceptions.guard_exception_change() from public;
create trigger guard_exception_change before update on exceptions.exception
  for each row execute function exceptions.guard_exception_change();

-- A record an exception is about, and its version where it has one (12.1). A reference to another module's record
-- keeps its identifier without a foreign key (structure-and-masters 2.5).
create table exceptions.exception_link (
  id uuid primary key,
  exception_id uuid not null references exceptions.exception (id),
  module text not null,
  record_type text not null,
  record_id uuid not null,
  version_id uuid,
  recorded_at timestamptz not null default now(),
  constraint exception_link_module check (module <> ''),
  constraint exception_link_record_type check (record_type <> ''),
  constraint exception_link_unique unique (exception_id, record_id)
);
create index exception_link_record on exceptions.exception_link (record_id);

-- What happened to an exception (13.3; POL-03.05, PRD-EXC-003): raised, assigned, comment, evidence, escalated,
-- resolved, closed, reopened, with who did it, for whom, and the comment given. Append-only.
create table exceptions.exception_event (
  id uuid primary key,
  exception_id uuid not null references exceptions.exception (id),
  kind text not null,
  actor_id uuid,
  to_user_id uuid,
  to_role_id uuid,
  comment text,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint exception_event_kind check (kind in ('raised', 'assigned', 'comment', 'evidence', 'escalated',
    'resolved', 'closed', 'reopened')),
  constraint exception_event_to check (num_nonnulls(to_user_id, to_role_id) <= 1),
  constraint exception_event_comment check (comment <> '')
);
create index exception_event_exception on exceptions.exception_event (exception_id, id);

create trigger refuse_row_change before update or delete on exceptions.exception_type
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on exceptions.exception_type
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on exceptions.exception_routing
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on exceptions.exception_routing
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on exceptions.exception_link
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on exceptions.exception_link
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on exceptions.exception_event
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on exceptions.exception_event
  for each statement execute function kernel.refuse_change();

grant select, insert on exceptions.exception_type to aos_runtime;
grant select, insert on exceptions.exception_routing to aos_runtime;
-- A routing row is locked while its versions change (code-house-rules 5.2, 8.2).
grant update (id) on exceptions.exception_routing to aos_runtime;
grant select, insert, update on exceptions.exception_routing_version to aos_runtime;
grant select, insert, update on exceptions.exception to aos_runtime;
grant select, insert on exceptions.exception_link to aos_runtime;
grant select, insert on exceptions.exception_event to aos_runtime;
