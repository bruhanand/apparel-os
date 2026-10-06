-- The audit module's schema: the audit record, the access record, their seals and the record of retention deletions
-- (numbering-and-audit 4, 5 and 6.2; module-map 4.5; S1-F01-T07). Runs as aos_migration, which owns everything it
-- creates (code-house-rules 5.1).

create schema audit;
grant usage on schema audit to aos_runtime;

-- Recording time is the database's, the transaction's time (code-house-rules 9). An insert that names any other
-- recording time is refused, so no row can be placed in a block that is already sealed (numbering-and-audit 4.4).
create function audit.require_recording_time() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if new.recorded_at is distinct from pg_catalog.now() then
    raise exception 'recording time of %.% is set by the database', tg_table_schema, tg_table_name
      using errcode = 'AO002';
  end if;
  return new;
end;
$$;
revoke execute on function audit.require_recording_time() from public;

-- The audit record (numbering-and-audit 4.1; PRD-ACS-013). Partitioned by recording month (4.4), so its key holds the
-- recording time (code-house-rules 3.2). Scope columns are the record's own facts, null where the record carries none
-- (Unknown, PRD-MOD-015). `changes` holds the changed fields only, in the shape the versioned schema named by
-- `changes_format` states (code-house-rules 3.3): never an encrypted value, a password hash or a session identifier
-- hash (4.3; PRD-SEC-006, PRD-SEC-014).
create table audit.audit_record (
  id uuid not null,
  recorded_at timestamptz not null default now(),
  occurred_at timestamptz not null,
  business_date date,
  actor_kind text not null check (actor_kind in ('user', 'service-identity')),
  actor_id uuid not null,
  on_behalf_of_user_id uuid,
  role_assignment_id uuid,
  legal_entity_id uuid,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  brand_id uuid,
  record_module text not null,
  record_type text not null,
  record_id uuid not null,
  record_version_id uuid,
  operation text not null,
  changes_format text not null check (changes_format = 'audit-changes/1'),
  changes jsonb not null,
  reason text,
  source_kind text not null check (source_kind in ('screen', 'import', 'job', 'adapter', 'device', 'operator-command')),
  source_reference text,
  source_row integer,
  approval_decision_id uuid,
  approval_use_id uuid,
  idempotency_key text,
  correlation_id uuid not null,
  primary key (id, recorded_at),
  -- A job carrying out a person's decision names that person (access-and-approvals 2.3; PRD-SEC-018).
  check (on_behalf_of_user_id is null or actor_kind = 'service-identity'),
  -- An import names its batch, and may name the row (4.1).
  check (source_kind <> 'import' or source_reference is not null),
  check (source_row is null or source_kind = 'import'),
  check (approval_use_id is null or approval_decision_id is not null)
) partition by range (recorded_at);

create index audit_record_record on audit.audit_record (record_module, record_type, record_id, recorded_at);
create index audit_record_actor on audit.audit_record (actor_id, recorded_at);
create index audit_record_on_behalf_of on audit.audit_record (on_behalf_of_user_id);
create index audit_record_legal_entity on audit.audit_record (legal_entity_id);
create index audit_record_site on audit.audit_record (site_id);
create index audit_record_store on audit.audit_record (store_id);
create index audit_record_business_unit on audit.audit_record (business_unit_id);
create index audit_record_brand on audit.audit_record (brand_id);

-- The access record (numbering-and-audit 5; PRD-SEC-007). Never the password, the authenticator code or a typed login
-- that matched no user: a failed sign-in names the user only when the login matched one (5.2; PRD-SEC-014).
create table audit.access_record (
  id uuid not null,
  recorded_at timestamptz not null default now(),
  occurred_at timestamptz not null,
  kind text not null check (kind in (
    'sign-in', 'sign-out', 'session-locked', 'session-ended', 'session-revoked',
    'second-factor-enrolled', 'second-factor-reset', 'password-changed', 'password-reset', 'operator-recovery',
    'device-registered', 'device-revoked', 'permission-changed', 'sensitive-access')),
  outcome text not null check (outcome in ('succeeded', 'refused')),
  user_id uuid,
  device_id uuid,
  network_address inet,
  identity_verification text,
  audit_record_id uuid,
  record_module text,
  record_type text,
  record_id uuid,
  field_class text,
  exposure text check (exposure in ('shown', 'exported')),
  legal_entity_id uuid,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  brand_id uuid,
  correlation_id uuid not null,
  primary key (id, recorded_at),
  -- A permission change points to its audit record, written in the same transaction, so with the same recording time
  -- (5.1; access-and-approvals 9.11).
  foreign key (audit_record_id, recorded_at) references audit.audit_record (id, recorded_at),
  check ((kind = 'permission-changed') = (audit_record_id is not null)),
  -- Sensitive access names the record, the field class and whether it was shown or exported (5.2).
  check ((kind = 'sensitive-access') = (exposure is not null)),
  check (kind <> 'sensitive-access' or (record_module is not null and record_type is not null
    and record_id is not null and field_class is not null)),
  -- The operator's recovery of a first user's password or authenticator says how the identity was verified (5.1).
  check ((kind = 'operator-recovery') = (identity_verification is not null))
) partition by range (recorded_at);

create index access_record_user on audit.access_record (user_id, recorded_at);
create index access_record_audit_record on audit.access_record (audit_record_id, recorded_at);
create index access_record_record on audit.access_record (record_module, record_type, record_id);
create index access_record_device on audit.access_record (device_id);
create index access_record_legal_entity on audit.access_record (legal_entity_id);
create index access_record_site on audit.access_record (site_id);
create index access_record_store on audit.access_record (store_id);
create index access_record_business_unit on audit.access_record (business_unit_id);
create index access_record_brand on audit.access_record (brand_id);

-- Append-only (numbering-and-audit 4.4; code-house-rules 7.1; PRD-SEC-007, PRD-MOD-011). No retention period is set
-- (V-13, POL-18.05), so no delete is admitted at all: the retention function deletes nothing (4.6). Row triggers on a
-- partitioned table reach every partition; the TRUNCATE trigger is added to each partition too, by
-- audit.ensure_partitions, since a statement trigger is not.
create trigger audit_record_recording_time before insert on audit.audit_record
  for each row execute function audit.require_recording_time();
create trigger audit_record_append_only before update or delete on audit.audit_record
  for each row execute function kernel.refuse_change();
create trigger audit_record_no_truncate before truncate on audit.audit_record
  for each statement execute function kernel.refuse_change();
create trigger access_record_recording_time before insert on audit.access_record
  for each row execute function audit.require_recording_time();
create trigger access_record_append_only before update or delete on audit.access_record
  for each row execute function kernel.refuse_change();
create trigger access_record_no_truncate before truncate on audit.access_record
  for each statement execute function kernel.refuse_change();

-- Scoped for reading (numbering-and-audit 4.5; code-house-rules 6.3). Inserting is admitted for any row, since a
-- refusal would lose the record of an attempt and the paths of 6.3 write with no actor. Reading goes through
-- access.row_visible, whose policy `access` adds with the function (S1-F01-T11); until then no policy admits a read,
-- so the runtime role reads no row (PRD-SEC-005).
alter table audit.audit_record enable row level security;
create policy insert_any on audit.audit_record for insert to aos_runtime with check (true);
alter table audit.access_record enable row level security;
create policy insert_any on audit.access_record for insert to aos_runtime with check (true);

grant select, insert on audit.audit_record to aos_runtime;
grant select, insert on audit.access_record to aos_runtime;

-- The seal of each closed block of audit and access records, chained to the previous seal (numbering-and-audit 4.4).
-- A block covers the recording times [covers_from, covers_to); the first starts at -infinity and each next one where
-- the previous ended. `format` names how the block's rows are hashed, so a later column changes no earlier hash.
create table audit.audit_seal (
  id uuid primary key,
  block_number bigint not null unique check (block_number >= 1),
  format text not null check (format = 'audit-seal/1'),
  covers_from timestamptz not null,
  covers_to timestamptz not null,
  audit_rows bigint not null check (audit_rows >= 0),
  access_rows bigint not null check (access_rows >= 0),
  previous_seal_id uuid unique references audit.audit_seal (id),
  previous_hash text,
  hash text not null,
  recorded_at timestamptz not null default now(),
  check (covers_from < covers_to),
  check ((block_number = 1) = (previous_seal_id is null)),
  check ((previous_seal_id is null) = (previous_hash is null)),
  check (block_number > 1 or covers_from = '-infinity')
);

create trigger audit_seal_append_only before update or delete on audit.audit_seal
  for each row execute function kernel.refuse_change();
create trigger audit_seal_no_truncate before truncate on audit.audit_seal
  for each statement execute function kernel.refuse_change();

-- Which sealed block the retention function deleted, when and under which schedule (numbering-and-audit 4.6). Empty
-- while no retention period is set.
create table audit.retention_deletion (
  id uuid primary key,
  audit_seal_id uuid not null unique references audit.audit_seal (id),
  retention_schedule text not null,
  audit_rows bigint not null check (audit_rows >= 0),
  access_rows bigint not null check (access_rows >= 0),
  recorded_at timestamptz not null default now()
);

create trigger retention_deletion_append_only before update or delete on audit.retention_deletion
  for each row execute function kernel.refuse_change();
create trigger retention_deletion_no_truncate before truncate on audit.retention_deletion
  for each statement execute function kernel.refuse_change();

-- Partition maintenance (numbering-and-audit 4.4; code-house-rules 3.2; DEC-112, CH-5). Creates the monthly
-- partitions of both tables, by UTC month, from the current month through the third month after it, and gives each
-- partition the TRUNCATE guard. Restricted maintenance: owned by the migration role and executable by nobody else. It
-- runs in this migration, so at every Organisation's setup, and after every migration run from the set's
-- maintenance.sql (code-house-rules 4.3), and on a schedule. Creating a partition that exists is skipped, so it can
-- run any number of times.
create function audit.ensure_partitions() returns void
  language plpgsql
  set search_path = pg_catalog
  set timezone = 'UTC'
as $$
declare
  months_ahead constant integer := 3;
  first_month timestamptz := date_trunc('month', now());
  month_start timestamptz;
  partition_name text;
  parent text;
begin
  foreach parent in array array['audit_record', 'access_record'] loop
    for step in 0 .. months_ahead loop
      month_start := first_month + make_interval(months => step);
      partition_name := format('%s_y%sm%s', parent, to_char(month_start, 'YYYY'), to_char(month_start, 'MM'));
      if to_regclass(format('audit.%I', partition_name)) is null then
        execute format('create table audit.%I partition of audit.%I for values from (%L) to (%L)',
          partition_name, parent, month_start, month_start + interval '1 month');
        execute format('create trigger %I before truncate on audit.%I for each statement execute function kernel.refuse_change()',
          partition_name || '_no_truncate', partition_name);
      end if;
    end loop;
  end loop;
end;
$$;
revoke execute on function audit.ensure_partitions() from public;

select audit.ensure_partitions();

-- The rows of one block and their hash, chained to the previous seal's hash (numbering-and-audit 4.4). Format
-- audit-seal/1 hashes these columns, in this order, of each row ordered by recording time and identifier, with times
-- written in UTC. Internal to the two functions below, which run as the owner and so see every row.
create function audit.block_digest(
  p_previous_hash text, p_from timestamptz, p_to timestamptz,
  out audit_rows bigint, out access_rows bigint, out hash text)
  language sql
  stable
  set search_path = pg_catalog
  set timezone = 'UTC'
as $$
  with a as (
    select count(*) as n,
      coalesce(string_agg(jsonb_build_array(
        r.id, r.recorded_at, r.occurred_at, r.business_date, r.actor_kind, r.actor_id, r.on_behalf_of_user_id,
        r.role_assignment_id, r.legal_entity_id, r.site_id, r.store_id, r.business_unit_id, r.brand_id,
        r.record_module, r.record_type, r.record_id, r.record_version_id, r.operation, r.changes_format, r.changes,
        r.reason, r.source_kind, r.source_reference, r.source_row, r.approval_decision_id, r.approval_use_id,
        r.idempotency_key, r.correlation_id)::text, E'\n' order by r.recorded_at, r.id), '') as body
    from audit.audit_record r
    where r.recorded_at >= p_from and r.recorded_at < p_to
  ), x as (
    select count(*) as n,
      coalesce(string_agg(jsonb_build_array(
        r.id, r.recorded_at, r.occurred_at, r.kind, r.outcome, r.user_id, r.device_id, r.network_address,
        r.identity_verification, r.audit_record_id, r.record_module, r.record_type, r.record_id, r.field_class,
        r.exposure, r.legal_entity_id, r.site_id, r.store_id, r.business_unit_id, r.brand_id,
        r.correlation_id)::text, E'\n' order by r.recorded_at, r.id), '') as body
    from audit.access_record r
    where r.recorded_at >= p_from and r.recorded_at < p_to
  )
  select a.n, x.n,
    encode(sha256(convert_to(concat_ws(E'\n', 'audit-seal/1', coalesce(p_previous_hash, ''), p_from::text, p_to::text,
      'audit', a.body, 'access', x.body), 'UTF8')), 'hex')
  from a, x
$$;
revoke execute on function audit.block_digest(text, timestamptz, timestamptz) from public;

-- Seals the block from the end of the last seal up to p_cutoff, if it holds any row, and returns its number, or null
-- when there is nothing to seal (numbering-and-audit 4.4). The caller passes as the cutoff the start of the oldest
-- transaction still open in this database, or its own start when none is older: a row is recorded at its
-- transaction's start, so no row can still arrive before it. Sealers take turns on the seal table. SECURITY DEFINER,
-- named by numbering-and-audit 4.4, because sealing must see every row whatever the caller's scope
-- (code-house-rules 5.2).
create function audit.seal_block(p_seal_id uuid, p_cutoff timestamptz) returns bigint
  language plpgsql
  security definer
  set search_path = pg_catalog
  set timezone = 'UTC'
as $$
declare
  last_seal audit.audit_seal%rowtype;
  block_from timestamptz := '-infinity';
  digest record;
begin
  if p_cutoff is null or p_cutoff > now() then
    raise exception 'a block can be sealed only up to the start of the sealing transaction' using errcode = 'AO003';
  end if;
  lock table audit.audit_seal in exclusive mode;
  select * into last_seal from audit.audit_seal order by block_number desc limit 1;
  if found then
    block_from := last_seal.covers_to;
  end if;
  if p_cutoff <= block_from then
    return null;
  end if;
  select * into digest from audit.block_digest(last_seal.hash, block_from, p_cutoff);
  if digest.audit_rows = 0 and digest.access_rows = 0 then
    return null;
  end if;
  insert into audit.audit_seal (id, block_number, format, covers_from, covers_to, audit_rows, access_rows,
    previous_seal_id, previous_hash, hash)
  values (p_seal_id, coalesce(last_seal.block_number, 0) + 1, 'audit-seal/1', block_from, p_cutoff,
    digest.audit_rows, digest.access_rows, last_seal.id, last_seal.hash, digest.hash);
  return coalesce(last_seal.block_number, 0) + 1;
end;
$$;
revoke execute on function audit.seal_block(uuid, timestamptz) from public;
grant execute on function audit.seal_block(uuid, timestamptz) to aos_runtime;

-- Recomputes the chain and reports each difference as a block number and a problem, never a row's content
-- (numbering-and-audit 4.4; PRD-SEC-007). `chain-broken`: the seal does not follow the one before it. `rows-differ`:
-- the block holds another number of rows than were sealed. `hash-differs`: a row of the block was changed, added or
-- removed. A block the retention function deleted is not recomputed; its seal still carries the chain. SECURITY
-- DEFINER, named by numbering-and-audit 4.4, for the reason seal_block is.
create function audit.check_seals() returns table (block_number bigint, problem text)
  language plpgsql
  stable
  security definer
  set search_path = pg_catalog
  set timezone = 'UTC'
as $$
declare
  seal audit.audit_seal%rowtype;
  previous audit.audit_seal%rowtype;
  digest record;
  has_previous boolean := false;
begin
  for seal in select * from audit.audit_seal s order by s.block_number loop
    if (has_previous and (seal.block_number <> previous.block_number + 1 or seal.previous_seal_id <> previous.id
          or seal.previous_hash <> previous.hash or seal.covers_from <> previous.covers_to))
       or (not has_previous and seal.block_number <> 1) then
      block_number := seal.block_number;
      problem := 'chain-broken';
      return next;
    end if;
    if not exists (select 1 from audit.retention_deletion d where d.audit_seal_id = seal.id) then
      select * into digest from audit.block_digest(seal.previous_hash, seal.covers_from, seal.covers_to);
      if digest.audit_rows <> seal.audit_rows or digest.access_rows <> seal.access_rows then
        block_number := seal.block_number;
        problem := 'rows-differ';
        return next;
      end if;
      if digest.hash <> seal.hash then
        block_number := seal.block_number;
        problem := 'hash-differs';
        return next;
      end if;
    end if;
    previous := seal;
    has_previous := true;
  end loop;
end;
$$;
revoke execute on function audit.check_seals() from public;
grant execute on function audit.check_seals() to aos_runtime;

-- The retention function (numbering-and-audit 4.6; POL-18.05). Deletion after retention runs only through it, one
-- sealed block at a time, recorded in audit.retention_deletion. The retention periods are OPEN (V-13; KDPS Owner,
-- Admin, CA; stage 1 live use), so it deletes nothing and returns 0, and the append-only guard admits no delete. When
-- a period is set, a later migration gives it the deletion and lets the guard admit it alone. SECURITY DEFINER, named
-- by numbering-and-audit 4.6.
create function audit.delete_after_retention() returns bigint
  language plpgsql
  security definer
  set search_path = pg_catalog
as $$
begin
  return 0;
end;
$$;
revoke execute on function audit.delete_after_retention() from public;
grant execute on function audit.delete_after_retention() to aos_runtime;
