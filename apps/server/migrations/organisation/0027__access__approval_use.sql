-- The use of an approval decision by a posting (access-and-approvals 9.7, 9.8, 13.1; module-map 4.3 "Record use";
-- stock-ledger 10.4, 13.1; DEC-097; PRD-ACS-007, PRD-ACS-013, PRD-INT-004; S1-F10-T02). Runs as aos_migration, which
-- owns everything it creates (code-house-rules 5.1). Compatible with the version running: it only adds
-- (code-house-rules 4.2).
--
-- One use per decision, enforced by a unique key: a replayed posting finds the use and does nothing more (9.8 step 3;
-- PRD-INT-002, PRD-INT-008). The posting module writes it in its posting transaction, with the identifier it made for
-- the use before writing, so its own records name the use (stock-ledger 13.3). It names what the decision authorised:
-- the posting document's module, record type, record and version, and who posted it. Append-only (PRD-MOD-011).

create table access.approval_use (
  id uuid primary key,
  approval_decision_id uuid not null references access.approval_decision (id),
  posting_module text not null,
  posting_record_type text not null,
  posting_record_id uuid not null,
  posting_version_id uuid not null,
  actor_user_id uuid references access.app_user (id),
  actor_service_identity_id uuid references access.service_identity (id),
  on_behalf_of_user_id uuid references access.app_user (id),
  recorded_at timestamptz not null default now(),
  constraint approval_use_once unique (approval_decision_id),
  constraint approval_use_names check (posting_module <> '' and posting_record_type <> ''),
  constraint approval_use_actor check ((actor_user_id is null) <> (actor_service_identity_id is null)),
  constraint approval_use_on_behalf_of check (on_behalf_of_user_id is null or actor_service_identity_id is not null)
);
create index approval_use_posting on access.approval_use (posting_record_id);
create index approval_use_actor_user on access.approval_use (actor_user_id);
create index approval_use_actor_service_identity on access.approval_use (actor_service_identity_id);
create index approval_use_on_behalf_of on access.approval_use (on_behalf_of_user_id);

create trigger refuse_row_change before update or delete on access.approval_use
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on access.approval_use
  for each statement execute function kernel.refuse_change();

-- Runtime grants (code-house-rules 5.2): append-only, so SELECT and INSERT.
grant select, insert on access.approval_use to aos_runtime;
