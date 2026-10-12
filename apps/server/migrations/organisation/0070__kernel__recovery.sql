-- The restore's history and the recovery hold in the Organisation's own database (backup-and-restore 4.2, 4.3, 4.5,
-- section 6, section 11; POL-18.03, POL-18.04, PRD-SEC-013; S1-F14-T03). Runs as aos_migration, which owns
-- everything it creates (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules
-- 4.2).

-- What happened to this Organisation in a restore, one row per fact: restored from which backup and recovery point;
-- the hold placed; each participant's step and check with its result and counts; each recovery gap the restore
-- found, such as an object of the file store with no record and the time it was stored; and the hold lifted, by whom.
-- Counts, names and identifiers only: no record data, no restricted value, no secret (PRD-SEC-014). Written by the
-- restore command as the migration role, except the row of reopening, which the reopen command writes as the runtime
-- role through kernel's interface (section 11). Read by the operations view's recovery status and by the drill record.
create table kernel.recovery_event (
  id uuid primary key,
  restore_id uuid not null,
  kind text not null,
  backup_id uuid,
  recovery_point timestamptz,
  unit text,
  name text,
  passed boolean,
  checked bigint,
  failed bigint,
  subject text,
  subject_at timestamptz,
  actor_id uuid,
  role_assignment_id uuid,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint recovery_event_kind check (kind in ('restored', 'hold-placed', 'step', 'check', 'gap', 'hold-lifted')),
  constraint recovery_event_restored check (kind <> 'restored' or (backup_id is not null and recovery_point is not null)),
  constraint recovery_event_result check (kind not in ('step', 'check')
    or (unit is not null and name is not null and passed is not null and checked >= 0 and failed >= 0)),
  constraint recovery_event_gap check (kind <> 'gap' or (unit is not null and name is not null and subject is not null)),
  constraint recovery_event_lifted check (kind <> 'hold-lifted'
    or (actor_id is not null and role_assignment_id is not null)),
  constraint recovery_event_text check (coalesce(unit, 'x') <> '' and coalesce(name, 'x') <> ''
    and coalesce(subject, 'x') <> '')
);
create index recovery_event_restore on kernel.recovery_event (restore_id, occurred_at);

-- The append-only guards (code-house-rules 7.1).
create trigger refuse_row_change before update or delete on kernel.recovery_event
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on kernel.recovery_event
  for each statement execute function kernel.refuse_change();

-- The recovery hold (4.3): a projection of the events above, at most one row, present while the restored
-- Organisation is held. The command runner reads it at the start of every command and refuses every command but
-- sign-in, session and access commands, reads and the recovery commands; the worker serves no job or delivery while it
-- is there. Placed by the restore command as the migration role, before any request reaches the database; lifted by
-- the reopen command, which deletes it in the transaction that writes the `hold-lifted` event.
create table kernel.recovery_hold (
  id uuid primary key,
  restore_id uuid not null,
  placed_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
create unique index recovery_hold_one on kernel.recovery_hold ((true));

grant select, insert on kernel.recovery_event to aos_runtime;
-- UPDATE for the row lock the reopen command takes on the hold before it rechecks and lifts it (code-house-rules 8.2).
grant select, insert, update, delete on kernel.recovery_hold to aos_runtime;
