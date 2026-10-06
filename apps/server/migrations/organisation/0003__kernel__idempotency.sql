-- The idempotency records (code-house-rules 12.4, 12.5, 12.6; PRD-INT-002, PRD-INT-004; DEC-113, DEC-114).
-- Three append-only tables of kernel in each Organisation database (code-house-rules 7.1; PRD-MOD-011). They are
-- unscoped: the helper finds a key at step 2 of module-map 6.1, before Authorise and before the record's scope is
-- known. Only the helper reads them (PRD-MOD-002). The Organisation is the database itself (PRD-MOD-001), so a key
-- belongs to the Organisation, the actor, the operation and the key together.
-- How long these rows are kept is OPEN (CH-9); until it is set nothing is deleted from them, and the runtime role
-- holds no DELETE.
-- Runs as aos_migration, which owns everything it creates (code-house-rules 5.1).

-- One row per key: who sent it, for which operation, and the hash of the request's canonical form with its version.
-- The hash covers no secret; only the names of the secret fields present enter it, and are kept here (12.5;
-- PRD-SEC-014).
create table kernel.idempotency_key (
  id uuid primary key,
  actor_id uuid not null,
  operation text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  form_version integer not null,
  secret_fields text[] not null,
  correlation_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint idempotency_key_scope unique (actor_id, operation, idempotency_key),
  constraint idempotency_key_hash_form check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint idempotency_key_form_version check (form_version > 0),
  constraint idempotency_key_secret_fields check (array_position(secret_fields, null) is null)
);

-- The outcome of a key's request, written in its transaction: a success with the answer as sent, or a kept refusal
-- (code-house-rules 12.3, 12.4); the one kept `conflict` is a stale version (12.7). An answer that showed a secret or a restricted value unmasked is not kept; only the
-- fact is, in `shown` (12.6; DEC-113, DEC-114). The identifiers of the credentials the command wrote are never sent
-- (12.5).
create table kernel.idempotency_result (
  id uuid primary key,
  idempotency_key_id uuid not null unique references kernel.idempotency_key (id),
  outcome text not null,
  shown text not null,
  answer jsonb,
  credential_ids uuid[] not null,
  recorded_at timestamptz not null default now(),
  constraint idempotency_result_outcome
    check (outcome in ('success', 'unavailable', 'not-authorised', 'not-found', 'refused', 'conflict')),
  constraint idempotency_result_shown check (shown in ('nothing', 'secret', 'restricted-value')),
  -- The answer is kept exactly when nothing was shown; `shown` states why it is not.
  constraint idempotency_result_answer_kept check ((shown = 'nothing') = (answer is not null)),
  constraint idempotency_result_shown_on_success check (shown = 'nothing' or outcome = 'success'),
  constraint idempotency_result_credentials_on_success check (outcome = 'success' or cardinality(credential_ids) = 0),
  constraint idempotency_result_credential_ids check (array_position(credential_ids, null) is null)
);

-- A request refused under a key already used, kept for investigation in a transaction of its own
-- (code-house-rules 12.4 "Changed content"; PRD-INT-002). Its actor, operation, key and first hash are those of its
-- key row. The canonical form holds no secret in any form, and every restricted value only encrypted under the
-- Organisation's key (PRD-SEC-006, PRD-SEC-014).
create table kernel.idempotency_conflict (
  id uuid primary key,
  idempotency_key_id uuid not null references kernel.idempotency_key (id),
  reason text not null,
  request_hash text not null,
  form_version integer not null,
  correlation_id uuid not null,
  request_form jsonb not null,
  recorded_at timestamptz not null default now(),
  constraint idempotency_conflict_reason
    check (reason in ('content-changed', 'form-version-changed', 'secret-not-comparable')),
  constraint idempotency_conflict_hash_form check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint idempotency_conflict_form_version check (form_version > 0)
);
create index idempotency_conflict_key on kernel.idempotency_conflict (idempotency_key_id);

-- The append-only guards (code-house-rules 7.1).
create trigger refuse_row_change before update or delete on kernel.idempotency_key
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on kernel.idempotency_key
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on kernel.idempotency_result
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on kernel.idempotency_result
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on kernel.idempotency_conflict
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on kernel.idempotency_conflict
  for each statement execute function kernel.refuse_change();

-- An append-only table that no command locks: SELECT and INSERT only (code-house-rules 5.2).
grant select, insert on kernel.idempotency_key to aos_runtime;
grant select, insert on kernel.idempotency_result to aos_runtime;
grant select, insert on kernel.idempotency_conflict to aos_runtime;
