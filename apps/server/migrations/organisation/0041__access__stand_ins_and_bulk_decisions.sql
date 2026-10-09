-- Stand-in grants and bulk decisions (access-and-approvals 9.3, 9.5, 9.9, 10, 13.1; code-house-rules 7.1, 7.3, 8.2;
-- PRD-ACS-011, PRD-ACS-018, PRD-ACS-019, POL-02.19, POL-02.20; GC3-7, DEC-105; S1-F05-T02). Runs as aos_migration,
-- which owns everything it creates (code-house-rules 5.1). Compatible with the version running: it only adds
-- (code-house-rules 4.2).
--
-- Every table here is unscoped: who may decide reads them before any scope applies, and they belong to the
-- Organisation as a whole (code-house-rules 6.3; access-and-approvals 9.11). Only access code reads them
-- (PRD-MOD-002). No row is written here: the stand-ins, their scopes, limits and periods are KDPS's (POL-02.20; KDPS
-- Owner question 5), and the bulk allowlist is the approval rule setting's, empty until KDPS sets it (B-9).

-- A stand-in grant (access-and-approvals 10; PRD-ACS-018, POL-02.20): the stand-in, the person stood in for, the scope,
-- frozen with the row as an assignment's is given (5.1) with its canonical form `scope_key` (code-house-rules 7.3), and
-- its dates, half-open, always with an end: it ends by itself (PRD-ACS-018). A dated table, each row its own version,
-- Awaiting approval until a different authorised person decides it (GC3-7, DEC-105). Its actions are rows of
-- stand_in_grant_action, written with it. Each grant records its origin, so nothing synthetic passes for a KDPS value
-- (code-house-rules 11.1, 12.14). The overlap key is the stand-in, the person stood in for and the exact scope, as a
-- role assignment's is its actor, role and exact scope (code-house-rules 7.3): two Approved grants of one key never
-- overlap in time; grants with another key may, and each is checked on its own (9.3). Locked shared by a decision
-- relying on it, exclusively by the decision on it (code-house-rules 8.2).
create table access.stand_in_grant (
  id uuid primary key,
  stand_in_user_id uuid not null references access.app_user (id),
  for_user_id uuid not null references access.app_user (id),
  scope jsonb not null,
  scope_key text not null,
  origin text not null,
  valid_during daterange not null,
  decision text not null,
  recorded_at timestamptz not null default now(),
  constraint stand_in_grant_two_people check (stand_in_user_id <> for_user_id),
  constraint stand_in_grant_scope check (pg_catalog.jsonb_typeof(scope) = 'object' and scope_key <> ''),
  constraint stand_in_grant_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint stand_in_grant_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint stand_in_grant_dates check (
    not pg_catalog.lower_inf(valid_during) and not pg_catalog.upper_inf(valid_during)
    and not pg_catalog.isempty(valid_during)),
  constraint stand_in_grant_no_overlap exclude using gist (
    stand_in_user_id with =, for_user_id with =, scope_key with =, valid_during with &&) where (decision = 'Approved')
);
create index stand_in_grant_stand_in on access.stand_in_grant (stand_in_user_id);
create index stand_in_grant_for on access.stand_in_grant (for_user_id);
create trigger guard_version_change before update on access.stand_in_grant
  for each row execute function access.guard_version_change();

-- One action a grant gives: an approval action type and the limit on its rule's basis, as a limit states it (9.2;
-- PRD-ACS-016): a value in whole paise, explicit unlimited authority, or none, with authority over Unknown value
-- apart. An action with no value states none of them (DM-8). Written with its grant and never changed.
create table access.stand_in_grant_action (
  id uuid primary key,
  stand_in_grant_id uuid not null references access.stand_in_grant (id),
  action_type text not null,
  amount bigint,
  unlimited boolean not null,
  covers_unknown boolean not null,
  recorded_at timestamptz not null default now(),
  constraint stand_in_grant_action_type check (action_type <> ''),
  constraint stand_in_grant_action_once unique (stand_in_grant_id, action_type),
  constraint stand_in_grant_action_amount check (amount is null or amount >= 0),
  constraint stand_in_grant_action_authority check (not (amount is not null and unlimited))
);
create index stand_in_grant_action_type_index on access.stand_in_grant_action (action_type);

-- Every user who recorded a change in a grant: its preparers (access-and-approvals 9.1; GC3-1, DEC-105).
create table access.stand_in_grant_change (
  id uuid primary key,
  stand_in_grant_id uuid not null references access.stand_in_grant (id),
  changed_by_user_id uuid not null references access.app_user (id),
  recorded_at timestamptz not null default now()
);
create index stand_in_grant_change_grant on access.stand_in_grant_change (stand_in_grant_id);
create index stand_in_grant_change_user on access.stand_in_grant_change (changed_by_user_id);

-- A batch of bulk decisions (access-and-approvals 9.9, 13.1; PRD-ACS-019): the approver, the requests selected, and
-- when, recorded in its own transaction with the one fresh authenticator code the selection takes (3.3); each item's
-- decision names it. An entry, never changed.
create table access.bulk_decision_batch (
  id uuid primary key,
  approver_user_id uuid not null references access.app_user (id),
  approval_request_ids uuid[] not null,
  recorded_at timestamptz not null default now(),
  constraint bulk_decision_batch_items check (pg_catalog.cardinality(approval_request_ids) > 0)
);
create index bulk_decision_batch_approver on access.bulk_decision_batch (approver_user_id);

-- The stand-in grant a decision relied on, where it was one (access-and-approvals 9.5, 10), and the bulk batch it was
-- made in (9.9). Null for every decision recorded before, as for one made directly. Adding a column with no value edits
-- no row (code-house-rules 7.1).
alter table access.approval_decision add column stand_in_grant_id uuid references access.stand_in_grant (id);
alter table access.approval_decision add column bulk_decision_batch_id uuid
  references access.bulk_decision_batch (id);
create index approval_decision_stand_in_grant on access.approval_decision (stand_in_grant_id);
create index approval_decision_batch on access.approval_decision (bulk_decision_batch_id);

-- Never changed or deleted (code-house-rules 7.1).
create trigger refuse_row_change before update or delete on access.stand_in_grant_action
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.stand_in_grant_action
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.stand_in_grant_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.stand_in_grant_change
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on access.bulk_decision_batch
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.bulk_decision_batch
  for each statement execute function kernel.refuse_change();

-- The runtime role's privileges (code-house-rules 5.2). A grant is locked as an authority row (8.2), which needs
-- UPDATE, as its guard allows anyway.
grant select, insert, update on access.stand_in_grant to aos_runtime;
grant select, insert on access.stand_in_grant_action to aos_runtime;
grant select, insert on access.stand_in_grant_change to aos_runtime;
grant select, insert on access.bulk_decision_batch to aos_runtime;
