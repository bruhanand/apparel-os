-- The validations of a restored Organisation, and retention schedules with no rows (backup-and-restore 4.3, 8.1,
-- 8.2, section 11; POL-18.03, POL-18.05; GC9-8; S1-F14-T03). Runs as aos_migration, which owns everything it creates
-- (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2).

-- A validation of a restored Organisation before it reopens (4.3; POL-18.03): one by Operations and one by Accounts,
-- each saying which of stock, bills and financial totals it compared, against what, and with what evidence. Recorded
-- by an authorised person through the recovery command, under Authorise, with its audit record. Which of the three
-- each validates is not split here, and whether one person may record both is OPEN (GC9-6; KDPS Owner, Admin).
create table configuration.recovery_validation (
  id uuid primary key,
  restore_id uuid not null,
  validates text not null,
  compared text[] not null,
  compared_against text not null,
  evidence text not null,
  validated_by_user_id uuid not null,
  role_assignment_id uuid not null,
  validated_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint recovery_validation_validates check (validates in ('operations', 'accounts')),
  constraint recovery_validation_compared check (cardinality(compared) > 0
    and compared <@ array['stock', 'bills', 'financial-totals']::text[]),
  constraint recovery_validation_text check (compared_against <> '' and evidence <> '')
);
create index recovery_validation_restore on configuration.recovery_validation (restore_id);

create trigger refuse_row_change before update or delete on configuration.recovery_validation
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on configuration.recovery_validation
  for each statement execute function kernel.refuse_change();

grant select, insert on configuration.recovery_validation to aos_runtime;

-- Retention schedules (8.1, 8.2; POL-18.05): one per record class, versioned like any setting, naming once KDPS sets
-- it the period and the date it counts from. No row is written: every period is OPEN (V-13, RR-076; KDPS Owner,
-- Admin, CA) and nothing has a default (DEC-105), so no record class has a schedule and nothing is deleted. The
-- command that sets one is built with the first retention deletion (backup-and-restore 10.2).
create table configuration.retention_schedule (
  id uuid primary key,
  record_class text not null,
  recorded_at timestamptz not null default now(),
  constraint retention_schedule_class unique (record_class),
  constraint retention_schedule_class_text check (record_class <> '')
);

create trigger refuse_row_change before update or delete on configuration.retention_schedule
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on configuration.retention_schedule
  for each statement execute function kernel.refuse_change();

create table configuration.retention_schedule_version (
  id uuid primary key,
  retention_schedule_id uuid not null references configuration.retention_schedule (id),
  period interval not null,
  counts_from text not null,
  origin text not null,
  valid_during daterange not null,
  decision text not null,
  recorded_at timestamptz not null default now(),
  constraint retention_schedule_version_period check (period > interval '0'),
  constraint retention_schedule_version_counts_from check (counts_from <> ''),
  constraint retention_schedule_version_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint retention_schedule_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint retention_schedule_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint retention_schedule_version_no_overlap
    exclude using gist (retention_schedule_id with =, valid_during with &&) where (decision = 'Approved')
);
create index retention_schedule_version_schedule on configuration.retention_schedule_version (retention_schedule_id);
create trigger guard_version_change before update on configuration.retention_schedule_version
  for each row execute function configuration.guard_version_change();

grant select on configuration.retention_schedule to aos_runtime;
grant select on configuration.retention_schedule_version to aos_runtime;
