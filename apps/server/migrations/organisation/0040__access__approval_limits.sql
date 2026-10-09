-- Approval limits (access-and-approvals 9.2, 9.3, 9.4, 9.7, 13.1; domain-model 3.2, section 5; code-house-rules 7.1,
-- 7.3; POL-02.07, POL-02.09, POL-02.15, PRD-ACS-015, PRD-ACS-016; DM-8, DEC-105; S1-F05-T01). Runs as aos_migration,
-- which owns everything it creates (code-house-rules 5.1). Compatible with the version running: it only adds
-- (code-house-rules 4.2).
--
-- Every table here is unscoped: who may decide reads them before any scope applies, and they belong to the
-- Organisation as a whole (code-house-rules 6.3; access-and-approvals 9.11). Only access code reads them
-- (PRD-MOD-002). No row is written here: a missing limit grants nothing, and the real limits and their holders are
-- KDPS's (V-02, RR-065).

-- An approval limit: for one action type, held by an approver role within a scope, or by a named user through one of
-- their role assignments (access-and-approvals 9.2; POL-02.09, POL-02.15). A dated table: each row is its own version
-- (code-house-rules 7.3), Awaiting approval until a different authorised person decides it (POL-02.07). Its basis is
-- the action's rule's (PRD-ACS-015; DM-8, DEC-105): a money basis, the limit in whole paise (PRD-MOD-014). A value,
-- explicit unlimited authority and explicit authority over Unknown value are kept apart (PRD-ACS-016): a limit has a
-- value or is unlimited, never both, and may also, or only, cover an Unknown value. The role holder's scope is kept as
-- the role assignment's scope is given (access-and-approvals 5.1), frozen with the row, with its canonical form
-- `scope_key` (code-house-rules 7.3). `holder_key` is the overlap key's holder: `role:<role>:<scope_key>` or
-- `user:<user>:<assignment>`, checked against the columns. Each limit records its origin, KDPS's answer, a setting of
-- the test setup or synthetic, so nothing synthetic passes for a KDPS value (code-house-rules 11.1, 12.14). No two Approved rows of one action type and holder overlap
-- in time, whatever their dates (code-house-rules 7.3); a withdrawal of a limit is not built, so none is withdrawn.
create table access.approval_limit (
  id uuid primary key,
  action_type text not null,
  basis text not null,
  holder_kind text not null,
  role_id uuid references access.role (id),
  scope jsonb,
  scope_key text,
  app_user_id uuid references access.app_user (id),
  role_assignment_id uuid references access.role_assignment (id),
  holder_key text not null,
  amount bigint,
  unlimited boolean not null,
  covers_unknown boolean not null,
  origin text not null,
  valid_during daterange not null,
  decision text not null,
  recorded_at timestamptz not null default now(),
  constraint approval_limit_action_type check (action_type <> ''),
  constraint approval_limit_basis check (basis in ('cost', 'bill-value', 'documented-valuation', 'amount-paid',
    'cash-difference', 'net-pay')),
  constraint approval_limit_holder check (
    (holder_kind = 'role' and role_id is not null and scope is not null and scope_key is not null
      and app_user_id is null and role_assignment_id is null
      and holder_key = 'role:' || role_id::text || ':' || scope_key)
    or (holder_kind = 'individual' and role_id is null and scope is null and scope_key is null
      and app_user_id is not null and role_assignment_id is not null
      and holder_key = 'user:' || app_user_id::text || ':' || role_assignment_id::text)),
  constraint approval_limit_scope check (scope is null or pg_catalog.jsonb_typeof(scope) = 'object'),
  constraint approval_limit_amount check (amount is null or amount >= 0),
  constraint approval_limit_authority check (
    not (amount is not null and unlimited) and (amount is not null or unlimited or covers_unknown)),
  constraint approval_limit_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint approval_limit_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint approval_limit_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint approval_limit_no_overlap exclude using gist (
    action_type with =, holder_key with =, valid_during with &&) where (decision = 'Approved')
);
create index approval_limit_action_type on access.approval_limit (action_type);
create index approval_limit_role on access.approval_limit (role_id);
create index approval_limit_user on access.approval_limit (app_user_id);
create index approval_limit_assignment on access.approval_limit (role_assignment_id);
create trigger guard_version_change before update on access.approval_limit
  for each row execute function access.guard_version_change();

-- Every user who recorded a change in a limit: its preparers (access-and-approvals 9.1; GC3-1, DEC-105).
create table access.approval_limit_change (
  id uuid primary key,
  approval_limit_id uuid not null references access.approval_limit (id),
  changed_by_user_id uuid not null references access.app_user (id),
  recorded_at timestamptz not null default now()
);
create index approval_limit_change_limit on access.approval_limit_change (approval_limit_id);
create index approval_limit_change_user on access.approval_limit_change (changed_by_user_id);

-- The limit a decision relied on, where the request had a value on a basis (access-and-approvals 9.5, 9.7): the
-- recheck under the locks of a posting uses it. Null for a decision on an action with no value, as every decision
-- recorded before this migration was. Adding a column with no value edits no row (code-house-rules 7.1).
alter table access.approval_decision add column approval_limit_id uuid references access.approval_limit (id);
create index approval_decision_limit on access.approval_decision (approval_limit_id);

-- Never changed or deleted (code-house-rules 7.1).
create trigger refuse_row_change before update or delete on access.approval_limit_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.approval_limit_change
  for each statement execute function kernel.refuse_change();

-- The runtime role's privileges (code-house-rules 5.2). A limit is locked as an authority row by a decision relying on
-- it and by the decision that approves it or a limit replacing it (8.2), which needs UPDATE, as its guard allows anyway.
grant select, insert, update on access.approval_limit to aos_runtime;
grant select, insert on access.approval_limit_change to aos_runtime;
