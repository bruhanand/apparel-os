-- The outbox (code-house-rules 12.8; module-map 4.1 "Outbox and jobs", section 8; PRD-MOD-006, PRD-INT-004,
-- PRD-INT-008). Three append-only tables of kernel in each Organisation database (code-house-rules 7.1;
-- PRD-MOD-011). They are unscoped: only kernel reads them, for the worker and the live-update stream, and each
-- consumer then reads the record under its own authorisation (code-house-rules 12.8 "The row").
-- How long these rows are kept is OPEN (CH-9); until it is set nothing is deleted from them, and the runtime role
-- holds no DELETE.
-- Runs as aos_migration, which owns everything it creates (code-house-rules 5.1).

-- One event, saved in the transaction that caused it: its identity, its type and payload version, its event and
-- recording times, who acted and on whose behalf, the command's correlation identifier, the subject, the subject's
-- scope facts as identifiers (code-house-rules 6.1, 12.12) and the payload, identifiers and versions only, never an
-- amount, a name, a restricted value or a secret (access-and-approvals 6; PRD-SEC-006).
create table kernel.outbox_event (
  id uuid primary key,
  event_type text not null,
  payload_version integer not null,
  event_time timestamptz not null,
  recorded_at timestamptz not null default now(),
  actor_id uuid,
  on_behalf_of_user_id uuid,
  correlation_id uuid not null,
  subject_module text not null,
  subject_record_type text not null,
  subject_record_id uuid not null,
  subject_version_id uuid,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  legal_entity_id uuid,
  brand_id uuid,
  subject_user_id uuid,
  payload jsonb not null,
  constraint outbox_event_type check (event_type ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'),
  constraint outbox_event_payload_version check (payload_version > 0),
  constraint outbox_event_payload check (jsonb_typeof(payload) = 'object')
);
-- The processor reads the new events of one type in identifier order (code-house-rules 12.8 "Dispatch").
create index outbox_event_type_recorded on kernel.outbox_event (event_type, recorded_at, id);

-- Each consumer the worker has registered, by its stable name, with the event type it reads and when it was first
-- registered: it receives the events recorded from then on (code-house-rules 12.8 "Consumers"). A renamed consumer
-- is a new consumer; a name never changes its event type.
create table kernel.outbox_consumer (
  id uuid primary key,
  name text not null unique,
  event_type text not null,
  recorded_at timestamptz not null default now(),
  constraint outbox_consumer_name check (name ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'),
  constraint outbox_consumer_event_type check (event_type ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$')
);

-- An event handed to one consumer, with the pg-boss job that delivers it, written in one transaction with that job.
-- The pair is unique, so an event is handed to each consumer once (code-house-rules 12.8 "Dispatch").
create table kernel.outbox_dispatch (
  id uuid primary key,
  outbox_event_id uuid not null references kernel.outbox_event (id),
  outbox_consumer_id uuid not null references kernel.outbox_consumer (id),
  job_id uuid not null unique,
  recorded_at timestamptz not null default now(),
  constraint outbox_dispatch_once unique (outbox_consumer_id, outbox_event_id)
);
create index outbox_dispatch_event on kernel.outbox_dispatch (outbox_event_id);

-- The append-only guards (code-house-rules 7.1).
create trigger refuse_row_change before update or delete on kernel.outbox_event
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on kernel.outbox_event
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on kernel.outbox_consumer
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on kernel.outbox_consumer
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on kernel.outbox_dispatch
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on kernel.outbox_dispatch
  for each statement execute function kernel.refuse_change();

-- The runtime role's privileges (code-house-rules 5.2).
grant select, insert on kernel.outbox_event to aos_runtime;
grant select, insert on kernel.outbox_consumer to aos_runtime;
grant select, insert on kernel.outbox_dispatch to aos_runtime;
