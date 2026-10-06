-- The access module's roles, role assignments, scope and effective grants, the personas a user holds, the withdrawal
-- of a Scheduled assignment, and the scope function every row-level security policy calls (access-and-approvals 2.1,
-- 4, 5, 7.2, 13.1; code-house-rules 6.2, 7.2, 7.3; DEC-112, CH-7; RR-202, CH-11; S1-F01-T11). Runs as aos_migration,
-- which owns everything it creates (code-house-rules 5.1).
--
-- Authenticate and Authorise read these tables, so they are unscoped (code-house-rules 6.3); only access code reads
-- them (PRD-MOD-002). What anyone else sees of them comes through access's interface.

-- The personas a user version holds, in the user's chosen order: the first sets the landing screen (access-and-
-- approvals 2.1; personas.md section 2; DEC-116). They belong to the version, so a change of personas is a user
-- version, prepared and approved like any other (9.11, DEC-112). A persona grants nothing (PRD-ACS-002, PRD-ACS-003).
create table access.persona_held (
  id uuid primary key,
  app_user_version_id uuid not null references access.app_user_version (id),
  persona text not null,
  position integer not null,
  recorded_at timestamptz not null default now(),
  constraint persona_held_persona check (persona in ('P-OWN', 'P-ADM', 'P-ACC', 'P-CHA', 'P-BKG', 'P-OPS', 'P-WHS',
    'P-BRM', 'P-STM', 'P-CSH', 'P-SLS', 'P-EBO', 'P-HRS', 'P-AUD')),
  constraint persona_held_position check (position >= 1),
  constraint persona_held_once unique (app_user_version_id, persona),
  constraint persona_held_order unique (app_user_version_id, position)
);

-- A role: a code unique in the Organisation (POL-02.01; access-and-approvals 4.2). Whether it is a self-service role
-- is fixed when it is created, so every version holds self-service permissions only or none, and every assignment of
-- it has own-record scope or none (PRD-ACS-022, DEC-100). Never changed or deleted.
create table access.role (
  id uuid primary key,
  code text not null unique,
  self_service boolean not null,
  recorded_at timestamptz not null default now(),
  constraint role_code check (code <> ''),
  constraint role_kind unique (id, self_service)
);

-- A role's effective-dated versions: the name and, through role_permission, the permissions (access-and-approvals
-- 4.2; code-house-rules 7.3). Awaiting approval until decided by an authorised person other than the preparer
-- (POL-02.07).
create table access.role_version (
  id uuid primary key,
  role_id uuid not null references access.role (id),
  name text not null,
  valid_during daterange not null,
  decision text not null,
  recorded_at timestamptz not null default now(),
  constraint role_version_name check (name <> ''),
  constraint role_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint role_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint role_version_no_overlap exclude using gist (role_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index role_version_role on access.role_version (role_id);
create trigger guard_version_change before update on access.role_version
  for each row execute function access.guard_version_change();

-- One permission of a role version: an explicit action on a record type of the permission registry, or a field class
-- (POL-02.03, POL-02.04, PRD-ACS-008; access-and-approvals 4.1). Broad labels are never stored. Frozen with its
-- version: written while the version is Awaiting approval, never changed or deleted; a changed draft is a new version.
create table access.role_permission (
  id uuid primary key,
  role_version_id uuid not null references access.role_version (id),
  kind text not null,
  record_type text,
  action text,
  field_class text,
  field_access text,
  recorded_at timestamptz not null default now(),
  constraint role_permission_kind check (
    (kind = 'action' and record_type is not null and action is not null and field_class is null and field_access is null)
    or (kind = 'field-class' and record_type is null and action is null and field_class is not null
        and field_access is not null)),
  constraint role_permission_action check (action in ('view', 'create', 'edit', 'approve', 'cancel', 'export', 'override')),
  constraint role_permission_field_class check (field_class in ('salary-and-payroll', 'identity-documents',
    'bank-details', 'customer-contact', 'cost', 'margin', 'employee-photos', 'location-evidence')),
  constraint role_permission_field_access check (field_access in ('view', 'view-and-edit'))
);
create unique index role_permission_action_once on access.role_permission (role_version_id, record_type, action)
  where kind = 'action';
create unique index role_permission_field_class_once on access.role_permission (role_version_id, field_class)
  where kind = 'field-class';
create index role_permission_version on access.role_permission (role_version_id);

-- Every user who recorded a change in a role version: its preparers (access-and-approvals 9.1; GC3-1, DEC-105).
create table access.role_version_change (
  id uuid primary key,
  role_version_id uuid not null references access.role_version (id),
  changed_by_user_id uuid not null references access.app_user (id),
  recorded_at timestamptz not null default now()
);
create index role_version_change_version on access.role_version_change (role_version_id);
create index role_version_change_user on access.role_version_change (changed_by_user_id);

-- A withdrawal of a Scheduled role assignment before its start: a document of its own, with version rows frozen at
-- submission and change rows naming who changed them (code-house-rules 7.2, 7.3; access-and-approvals 4.3, 13.1;
-- RR-202, CH-11). One per assignment; a rejected version is followed by a new version of the same withdrawal.
create table access.role_assignment_withdrawal (
  id uuid primary key,
  role_assignment_id uuid not null unique,
  recorded_at timestamptz not null default now(),
  constraint role_assignment_withdrawal_of unique (id, role_assignment_id)
);

create table access.role_assignment_withdrawal_version (
  id uuid primary key,
  withdrawal_id uuid not null references access.role_assignment_withdrawal (id),
  reason text not null,
  decision text not null,
  recorded_at timestamptz not null default now(),
  constraint role_assignment_withdrawal_version_reason check (reason <> ''),
  constraint role_assignment_withdrawal_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected'))
);
create index role_assignment_withdrawal_version_withdrawal on access.role_assignment_withdrawal_version (withdrawal_id);
create unique index role_assignment_withdrawal_version_approved
  on access.role_assignment_withdrawal_version (withdrawal_id) where decision = 'Approved';

create table access.role_assignment_withdrawal_change (
  id uuid primary key,
  withdrawal_version_id uuid not null references access.role_assignment_withdrawal_version (id),
  changed_by_user_id uuid not null references access.app_user (id),
  recorded_at timestamptz not null default now()
);
create index role_assignment_withdrawal_change_version
  on access.role_assignment_withdrawal_change (withdrawal_version_id);
create index role_assignment_withdrawal_change_user on access.role_assignment_withdrawal_change (changed_by_user_id);

-- A document version changes only while it is Awaiting approval: its reason, then its decision, once
-- (code-house-rules 7.2).
create function access.guard_document_version_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if old.decision = 'Awaiting approval' and new.id = old.id and new.recorded_at = old.recorded_at then
    return new;
  end if;
  raise exception 'a decided document version of %.% never changes', tg_table_schema, tg_table_name
    using errcode = 'AO003';
end;
$$;
revoke execute on function access.guard_document_version_change() from public;
create trigger guard_document_version_change before update on access.role_assignment_withdrawal_version
  for each row execute function access.guard_document_version_change();

-- A role assignment: a user or a service identity, a role, a scope and effective dates (access-and-approvals 4.3;
-- PRD-ACS-001 to PRD-ACS-005). A dated table: each row is its own version (code-house-rules 7.3). Its actor, role and
-- scope are fixed when it is written; while it is Awaiting approval its dates may change, and its decision is
-- recorded once. Own-record scope belongs to a self-service role, and only to it, and only to a user (5.4; PRD-ACS-022,
-- DEC-100). `scope_key` is the canonical form of the exact scope (code-house-rules 7.3; DEC-112, CH-7), checked
-- against the scope rows at commit. No two Approved, not withdrawn assignments of one actor, one role and one exact
-- scope overlap in time, whatever their dates. `withdrawal_id` is set once, only on an Approved assignment, by the
-- approved withdrawal (7.3; RR-202, CH-11). A partner user's assignment selecting Stores only waits for `partners`
-- (stage 5; access-and-approvals 2.2).
create table access.role_assignment (
  id uuid primary key,
  app_user_id uuid references access.app_user (id),
  service_identity_id uuid references access.service_identity (id),
  role_id uuid not null,
  role_self_service boolean not null,
  own_records boolean not null,
  scope_key text not null,
  valid_during daterange not null,
  decision text not null,
  withdrawal_id uuid,
  recorded_at timestamptz not null default now(),
  constraint role_assignment_role foreign key (role_id, role_self_service) references access.role (id, self_service),
  constraint role_assignment_withdrawal foreign key (withdrawal_id, id)
    references access.role_assignment_withdrawal (id, role_assignment_id),
  constraint role_assignment_actor check (pg_catalog.num_nonnulls(app_user_id, service_identity_id) = 1),
  constraint role_assignment_self_service check (role_self_service = own_records),
  constraint role_assignment_own_records check (own_records = (scope_key = 'own-records')),
  constraint role_assignment_own_records_user check (not own_records or app_user_id is not null),
  constraint role_assignment_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint role_assignment_withdrawn_approved check (withdrawal_id is null or decision = 'Approved'),
  constraint role_assignment_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint role_assignment_no_overlap exclude using gist (
    (coalesce(app_user_id, service_identity_id)) with =, role_id with =, scope_key with =, valid_during with &&)
    where (decision = 'Approved' and withdrawal_id is null)
);
create index role_assignment_user on access.role_assignment (app_user_id);
create index role_assignment_service_identity on access.role_assignment (service_identity_id);
create index role_assignment_role_kind on access.role_assignment (role_id, role_self_service);
create index role_assignment_withdrawn_by on access.role_assignment (withdrawal_id, id);
create trigger guard_version_change before update on access.role_assignment
  for each row execute function access.guard_version_change();

alter table access.role_assignment_withdrawal
  add constraint role_assignment_withdrawal_assignment
  foreign key (role_assignment_id) references access.role_assignment (id);

-- One dimension of an assignment's scope: all members, which includes later members; selected members, which stay
-- fixed; or empty, which grants nothing (access-and-approvals 5.1; PRD-ACS-005). Written with the assignment, three
-- rows for a dimension scope and none for own-record scope; never changed.
create table access.assignment_scope (
  id uuid primary key,
  role_assignment_id uuid not null references access.role_assignment (id),
  dimension text not null,
  kind text not null,
  recorded_at timestamptz not null default now(),
  constraint assignment_scope_dimension check (dimension in ('legal-entity', 'place', 'brand')),
  constraint assignment_scope_kind check (kind in ('all', 'selected', 'empty')),
  constraint assignment_scope_once unique (role_assignment_id, dimension)
);

-- A selected member: a legal entity, a Site, a Store or a business unit, or a brand (access-and-approvals 5.1, 5.2).
-- Their records belong to `organisation` and `merchandise`, so no foreign key (code-house-rules 3.2).
create table access.assignment_scope_member (
  id uuid primary key,
  assignment_scope_id uuid not null references access.assignment_scope (id),
  member_type text not null,
  member_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint assignment_scope_member_type
    check (member_type in ('legal-entity', 'site', 'store', 'business-unit', 'brand')),
  constraint assignment_scope_member_once unique (assignment_scope_id, member_type, member_id)
);
create index assignment_scope_member_member on access.assignment_scope_member (member_id);

-- Every user who recorded a change in an assignment: its preparers (access-and-approvals 9.1; GC3-1, DEC-105).
create table access.role_assignment_change (
  id uuid primary key,
  role_assignment_id uuid not null references access.role_assignment (id),
  changed_by_user_id uuid not null references access.app_user (id),
  recorded_at timestamptz not null default now()
);
create index role_assignment_change_assignment on access.role_assignment_change (role_assignment_id);
create index role_assignment_change_user on access.role_assignment_change (changed_by_user_id);

-- The canonical form of an assignment's exact scope (code-house-rules 7.3; DEC-112, CH-7), from its scope rows:
-- `own-records`, or `legal-entity=<part>;place=<part>;brand=<part>`, where a part is `all`, `empty` or
-- `selected:` followed by the members sorted and joined by commas, a place member as `<type>:<id>`. Two scopes are
-- the same exact scope when their forms are equal. The application makes the same form (access domain scope-key.ts).
create function access.scope_key_of(assignment uuid) returns text
  language sql
  stable
  set search_path = pg_catalog
as $$
  select case
    when not exists (select 1 from access.assignment_scope s where s.role_assignment_id = assignment) then 'own-records'
    else (
      select pg_catalog.string_agg(d.dimension || '=' || coalesce((
        select case s.kind when 'selected' then 'selected:' || coalesce((
          select pg_catalog.string_agg(
            case when s.dimension = 'place' then m.member_type || ':' || m.member_id::text else m.member_id::text end,
            ',' order by case when s.dimension = 'place' then m.member_type || ':' || m.member_id::text
                              else m.member_id::text end collate "C")
          from access.assignment_scope_member m where m.assignment_scope_id = s.id), '') else s.kind end
        from access.assignment_scope s where s.role_assignment_id = assignment and s.dimension = d.dimension), '?'),
        ';' order by d.position)
      from (values ('legal-entity', 1), ('place', 2), ('brand', 3)) as d (dimension, position))
  end
$$;
revoke execute on function access.scope_key_of(uuid) from public;
-- The check below runs with its caller's rights, so the runtime role executes it.
grant execute on function access.scope_key_of(uuid) to aos_runtime;

-- At commit, an assignment's scope_key must be the canonical form of its scope rows, and a scope row is written only
-- while its assignment is Awaiting approval (code-house-rules 7.3).
create function access.check_assignment_scope() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  assignment uuid;
  key text;
begin
  if tg_table_name = 'role_assignment' then
    assignment := new.id;
  elsif tg_table_name = 'assignment_scope' then
    assignment := new.role_assignment_id;
  else
    select s.role_assignment_id into assignment from access.assignment_scope s where s.id = new.assignment_scope_id;
  end if;
  select a.scope_key into key from access.role_assignment a where a.id = assignment;
  if key is distinct from access.scope_key_of(assignment) then
    raise exception 'the scope key of role assignment % differs from its scope', assignment using errcode = 'AO005';
  end if;
  return null;
end;
$$;
revoke execute on function access.check_assignment_scope() from public;
create constraint trigger check_assignment_scope after insert or update on access.role_assignment
  deferrable initially deferred for each row execute function access.check_assignment_scope();
create constraint trigger check_assignment_scope after insert on access.assignment_scope
  deferrable initially deferred for each row execute function access.check_assignment_scope();
create constraint trigger check_assignment_scope after insert on access.assignment_scope_member
  deferrable initially deferred for each row execute function access.check_assignment_scope();

-- A permission or a scope row is written only while its version or assignment is Awaiting approval, so nothing is
-- added to what an approved one grants (code-house-rules 7.2, 7.3).
create function access.guard_draft_child() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  decision text;
begin
  if tg_table_name = 'role_permission' then
    select v.decision into decision from access.role_version v where v.id = new.role_version_id;
  elsif tg_table_name = 'assignment_scope' then
    select a.decision into decision from access.role_assignment a where a.id = new.role_assignment_id;
  else
    select a.decision into decision
    from access.assignment_scope s join access.role_assignment a on a.id = s.role_assignment_id
    where s.id = new.assignment_scope_id;
  end if;
  if decision is distinct from 'Awaiting approval' then
    raise exception 'a row of %.% is written only while its draft is Awaiting approval', tg_table_schema, tg_table_name
      using errcode = 'AO003';
  end if;
  return new;
end;
$$;
revoke execute on function access.guard_draft_child() from public;
create trigger guard_draft_child before insert on access.role_permission
  for each row execute function access.guard_draft_child();
create trigger guard_draft_child before insert on access.assignment_scope
  for each row execute function access.guard_draft_child();
create trigger guard_draft_child before insert on access.assignment_scope_member
  for each row execute function access.guard_draft_child();

-- The effective grants (access-and-approvals 7.2): for each actor, record type and assignment in force on `as_of`, the
-- actions it grants and the legal entities, places and brands it covers, all members kept as a wildcard, with which
-- facts the record type declares (5.3). Derived from the assignments, never edited: rebuilt for an actor when its
-- assignments or their roles change, and by the scheduled job when a start or end date passes. An assignment empty in
-- any dimension has no row: it grants nothing (PRD-ACS-005). A withdrawn assignment never has one (7.3).
create table access.effective_grant (
  id uuid primary key,
  actor_id uuid not null,
  record_type text not null,
  role_assignment_id uuid not null references access.role_assignment (id),
  actions text[] not null,
  own_records boolean not null,
  declares_legal_entity boolean not null,
  declares_place boolean not null,
  declares_brand boolean not null,
  legal_entity_all boolean not null,
  legal_entity_ids uuid[] not null,
  place_all boolean not null,
  site_ids uuid[] not null,
  store_ids uuid[] not null,
  business_unit_ids uuid[] not null,
  brand_all boolean not null,
  brand_ids uuid[] not null,
  as_of date not null,
  recorded_at timestamptz not null default now(),
  constraint effective_grant_once unique (actor_id, record_type, role_assignment_id),
  constraint effective_grant_actions check (pg_catalog.cardinality(actions) > 0)
);
create index effective_grant_assignment on access.effective_grant (role_assignment_id);

-- Whether one effective grant of the actor for the record type covers a row's facts, or, for a self-service grant,
-- whether the row's subject is the actor (code-house-rules 6.2; access-and-approvals 7.2). Every row-level security
-- policy calls it, and reaches access only through it. A fact the record type does not declare is not checked; a
-- declared fact left null is Unknown, covered only by all-members scope (PRD-MOD-015). With no actor set, it answers
-- false, so every scoped table shows no rows (PRD-SEC-005). The actor setting reads as an empty string after its
-- transaction ended, which counts as no actor.
create function access.row_visible(
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
$$;
revoke execute on function access.row_visible(text, uuid, uuid, uuid, uuid, uuid, uuid) from public;
grant execute on function access.row_visible(text, uuid, uuid, uuid, uuid, uuid, uuid) to aos_runtime;

-- Never changed or deleted (code-house-rules 7.1).
create trigger refuse_row_change before update or delete on access.persona_held
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.persona_held
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.role
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.role
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.role_permission
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.role_permission
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.role_version_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.role_version_change
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.role_assignment_withdrawal
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.role_assignment_withdrawal
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.role_assignment_withdrawal_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.role_assignment_withdrawal_change
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.assignment_scope
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.assignment_scope
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.assignment_scope_member
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.assignment_scope_member
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.role_assignment_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.role_assignment_change
  for each statement execute function kernel.refuse_change();

-- The runtime role's privileges (code-house-rules 5.2). A role assignment is locked as an authority row and as the
-- record a withdrawal changes (8.2), which needs UPDATE, as its versions table grants anyway. The effective grants
-- are a projection: rebuilt by deleting an actor's rows and writing them again.
grant select, insert on access.persona_held to aos_runtime;
grant select, insert on access.role to aos_runtime;
grant select, insert, update on access.role_version to aos_runtime;
grant select, insert on access.role_permission to aos_runtime;
grant select, insert on access.role_version_change to aos_runtime;
grant select, insert on access.role_assignment_withdrawal to aos_runtime;
grant select, insert, update on access.role_assignment_withdrawal_version to aos_runtime;
grant select, insert on access.role_assignment_withdrawal_change to aos_runtime;
grant select, insert, update on access.role_assignment to aos_runtime;
grant select, insert on access.assignment_scope to aos_runtime;
grant select, insert on access.assignment_scope_member to aos_runtime;
grant select, insert on access.role_assignment_change to aos_runtime;
grant select, insert, delete on access.effective_grant to aos_runtime;
