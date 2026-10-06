-- The access module's approvals: the preparers of user versions, the approve and reject reasons, the approval rule
-- settings, approval requests with their preparers, and approval decisions (access-and-approvals 2.1, 8, 9.1, 9.3,
-- 9.5, 9.6, 9.11, 13.1; code-house-rules 7.1, 7.2, 7.3; POL-02.07, POL-02.23, DEC-104, DEC-112; S1-F01-T13). It also
-- lets a role assignment be Withdrawn before approval, when the user's first version is rejected (DEC-116, DEC-117).
-- Runs as aos_migration, which owns everything it creates (code-house-rules 5.1).
--
-- Every table here is unscoped: access reads them before any scope applies, and they belong to the Organisation as a
-- whole (code-house-rules 6.3; access-and-approvals 9.11). Only access code reads them (PRD-MOD-002).

-- Every user who recorded a change in a user version: its preparers (access-and-approvals 9.1; GC3-1, DEC-105).
create table access.app_user_version_change (
  id uuid primary key,
  app_user_version_id uuid not null references access.app_user_version (id),
  changed_by_user_id uuid not null references access.app_user (id),
  recorded_at timestamptz not null default now()
);
create index app_user_version_change_version on access.app_user_version_change (app_user_version_id);
create index app_user_version_change_user on access.app_user_version_change (changed_by_user_id);

-- An approve or reject reason (access-and-approvals 9.5, 13.1; POL-02.23). Its code and kind are fixed; its text is
-- a version. No reason has a default: the list holds only what an approved change put in it.
create table access.approval_reason (
  id uuid primary key,
  code text not null unique,
  kind text not null,
  recorded_at timestamptz not null default now(),
  constraint approval_reason_code check (code <> ''),
  constraint approval_reason_kind check (kind in ('approve', 'reject'))
);

create table access.approval_reason_version (
  id uuid primary key,
  approval_reason_id uuid not null references access.approval_reason (id),
  text text not null,
  valid_during daterange not null,
  decision text not null,
  recorded_at timestamptz not null default now(),
  constraint approval_reason_version_text check (text <> ''),
  constraint approval_reason_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint approval_reason_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint approval_reason_version_no_overlap exclude using gist (approval_reason_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index approval_reason_version_reason on access.approval_reason_version (approval_reason_id);
create trigger guard_version_change before update on access.approval_reason_version
  for each row execute function access.guard_version_change();

create table access.approval_reason_version_change (
  id uuid primary key,
  approval_reason_version_id uuid not null references access.approval_reason_version (id),
  changed_by_user_id uuid not null references access.app_user (id),
  recorded_at timestamptz not null default now()
);
create index approval_reason_version_change_version
  on access.approval_reason_version_change (approval_reason_version_id);
create index approval_reason_version_change_user on access.approval_reason_version_change (changed_by_user_id);

-- The configured parts of an approval rule, one per action type: whether bulk and phone approval are allowed
-- (access-and-approvals 8, 13.1; POL-02.19, POL-02.22). The fixed parts are in code. No default: an action type with
-- no Approved version in force allows neither.
create table access.approval_rule_setting (
  id uuid primary key,
  action_type text not null unique,
  recorded_at timestamptz not null default now(),
  constraint approval_rule_setting_action_type check (action_type <> '')
);

create table access.approval_rule_setting_version (
  id uuid primary key,
  approval_rule_setting_id uuid not null references access.approval_rule_setting (id),
  bulk_allowed boolean not null,
  phone_allowed boolean not null,
  valid_during daterange not null,
  decision text not null,
  recorded_at timestamptz not null default now(),
  constraint approval_rule_setting_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint approval_rule_setting_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint approval_rule_setting_version_no_overlap
    exclude using gist (approval_rule_setting_id with =, valid_during with &&) where (decision = 'Approved')
);
create index approval_rule_setting_version_setting on access.approval_rule_setting_version (approval_rule_setting_id);
create trigger guard_version_change before update on access.approval_rule_setting_version
  for each row execute function access.guard_version_change();

create table access.approval_rule_setting_version_change (
  id uuid primary key,
  approval_rule_setting_version_id uuid not null references access.approval_rule_setting_version (id),
  changed_by_user_id uuid not null references access.app_user (id),
  recorded_at timestamptz not null default now()
);
create index approval_rule_setting_version_change_version
  on access.approval_rule_setting_version_change (approval_rule_setting_version_id);
create index approval_rule_setting_version_change_user
  on access.approval_rule_setting_version_change (changed_by_user_id);

-- An approval request (access-and-approvals 9.1, 9.6, 13.1; PRD-ACS-007): bound to one document version and one
-- action type, with its value on its basis, none for an access change, or Unknown, never zero (PRD-ACS-015,
-- PRD-MOD-015). One open request per document version and action type. Its state is recorded once, from Awaiting
-- approval: Approved or Rejected by a decision, Superseded by a new version of the document (9.6), or Withdrawn when
-- the user it waits on is rejected (DEC-117). Nothing else of it ever changes.
create table access.approval_request (
  id uuid primary key,
  action_type text not null,
  document_module text not null,
  document_record_type text not null,
  document_record_id uuid not null,
  document_version_id uuid not null,
  value_kind text not null,
  value_basis text,
  value_amount bigint,
  state text not null,
  recorded_at timestamptz not null default now(),
  constraint approval_request_state check (state in ('Awaiting approval', 'Approved', 'Rejected', 'Superseded',
    'Withdrawn')),
  constraint approval_request_value check (
    (value_kind = 'none' and value_basis is null and value_amount is null)
    or (value_kind = 'unknown' and value_basis is not null and value_amount is null)
    or (value_kind = 'known' and value_basis is not null and value_amount is not null))
);
create unique index approval_request_open on access.approval_request (document_version_id, action_type)
  where state = 'Awaiting approval';
create index approval_request_document on access.approval_request (document_record_id);

create function access.guard_request_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if old.state = 'Awaiting approval' and new.state <> 'Awaiting approval'
     and (pg_catalog.to_jsonb(new) - 'state') = (pg_catalog.to_jsonb(old) - 'state') then
    return new;
  end if;
  raise exception 'an approval request changes only by recording its state once' using errcode = 'AO003';
end;
$$;
revoke execute on function access.guard_request_change() from public;
create trigger guard_request_change before update on access.approval_request
  for each row execute function access.guard_request_change();

-- The preparers of the version a request binds to, frozen when it is requested (access-and-approvals 9.1; GC3-1).
create table access.approval_request_preparer (
  id uuid primary key,
  approval_request_id uuid not null references access.approval_request (id),
  user_id uuid not null references access.app_user (id),
  recorded_at timestamptz not null default now(),
  constraint approval_request_preparer_once unique (approval_request_id, user_id)
);

-- An approval decision (access-and-approvals 9.5, 13.1; domain-model 3.2): the approver, the outcome, the reason (one
-- from the list in force, or free text on a reason-list change, DEC-104), the comment, the version decided, the value
-- and its basis, and the role assignment it relied on. One per request; an entry, never edited (PRD-MOD-011).
create table access.approval_decision (
  id uuid primary key,
  approval_request_id uuid not null unique references access.approval_request (id),
  approver_user_id uuid not null references access.app_user (id),
  role_assignment_id uuid not null references access.role_assignment (id),
  outcome text not null,
  document_version_id uuid not null,
  approval_reason_version_id uuid references access.approval_reason_version (id),
  reason_text text,
  comment text,
  value_kind text not null,
  value_basis text,
  value_amount bigint,
  decided_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint approval_decision_outcome check (outcome in ('Approved', 'Rejected')),
  constraint approval_decision_reason check (num_nonnulls(approval_reason_version_id, reason_text) = 1),
  constraint approval_decision_reason_text check (reason_text <> ''),
  constraint approval_decision_comment check (comment <> ''),
  constraint approval_decision_value check (
    (value_kind = 'none' and value_basis is null and value_amount is null)
    or (value_kind = 'unknown' and value_basis is not null and value_amount is null)
    or (value_kind = 'known' and value_basis is not null and value_amount is not null))
);
create index approval_decision_approver on access.approval_decision (approver_user_id);
create index approval_decision_assignment on access.approval_decision (role_assignment_id);
create index approval_decision_reason on access.approval_decision (approval_reason_version_id);

-- Withdrawn before approval (DEC-116, DEC-117): rejecting a user's first version withdraws their pending assignments.
-- Such an assignment takes the decision Withdrawn, final, with a reference to the withdrawal that says so; the
-- withdrawal's version keeps which kind of withdrawal it was and the decision that caused it.
alter table access.role_assignment drop constraint role_assignment_decision;
alter table access.role_assignment add constraint role_assignment_decision
  check (decision in ('Awaiting approval', 'Approved', 'Rejected', 'Withdrawn'));
alter table access.role_assignment drop constraint role_assignment_withdrawn_approved;
alter table access.role_assignment add constraint role_assignment_withdrawn_approved
  check (withdrawal_id is null or decision in ('Approved', 'Withdrawn'));
alter table access.role_assignment add constraint role_assignment_withdrawn_reference
  check (decision <> 'Withdrawn' or withdrawal_id is not null);

alter table access.role_assignment_withdrawal_version
  add column kind text not null default 'before-start',
  add column caused_by_decision_id uuid references access.approval_decision (id);
alter table access.role_assignment_withdrawal_version alter column kind drop default;
alter table access.role_assignment_withdrawal_version add constraint role_assignment_withdrawal_version_kind
  check (kind in ('before-start', 'before-approval'));
alter table access.role_assignment_withdrawal_version add constraint role_assignment_withdrawal_version_cause
  check ((kind = 'before-approval') = (caused_by_decision_id is not null));
create index role_assignment_withdrawal_version_cause
  on access.role_assignment_withdrawal_version (caused_by_decision_id);

-- Never changed or deleted (code-house-rules 7.1).
create trigger refuse_row_change before update or delete on access.app_user_version_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.app_user_version_change
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.approval_reason
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.approval_reason
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.approval_reason_version_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.approval_reason_version_change
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.approval_rule_setting
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.approval_rule_setting
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.approval_rule_setting_version_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.approval_rule_setting_version_change
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.approval_request_preparer
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.approval_request_preparer
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.approval_decision
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.approval_decision
  for each statement execute function kernel.refuse_change();

-- The runtime role's privileges (code-house-rules 5.2). Decide locks the request and the versions it decides (8.2),
-- which needs UPDATE, as their guards allow anyway.
grant select, insert on access.app_user_version_change to aos_runtime;
grant select, insert on access.approval_reason to aos_runtime;
grant select, insert, update on access.approval_reason_version to aos_runtime;
grant select, insert on access.approval_reason_version_change to aos_runtime;
grant select, insert on access.approval_rule_setting to aos_runtime;
grant select, insert, update on access.approval_rule_setting_version to aos_runtime;
grant select, insert on access.approval_rule_setting_version_change to aos_runtime;
grant select, insert, update on access.approval_request to aos_runtime;
grant select, insert on access.approval_request_preparer to aos_runtime;
grant select, insert on access.approval_decision to aos_runtime;
