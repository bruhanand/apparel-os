-- Number series after a restore (numbering-and-audit 3.6, 3.7; backup-and-restore 5.3; POL-18.04, PRD-ACP-019;
-- S1-F14-T03). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible with the
-- version running: it only adds (code-house-rules 4.2); the new columns are null on every earlier event.
--
-- `paused-after-restore`: the restore's participant paused the series, Open or Paused before, so that no number is
-- given from it until it is reconciled against the evidence of what was issued after the recovery point.
-- `reconciled-after-restore`: an authorised person recorded that evidence; the next number was set past the higher of
-- the evidence and the highest restored allocation, never lowered, and the series released. The event keeps the
-- restore, the evidence, the highest number it shows (none for a statement that no document left the system), the
-- highest restored allocation, the next number before and after, so the numbers skipped are `before` to `after - 1`,
-- and the reason.

alter table numbering.series_event drop constraint series_event_event;
alter table numbering.series_event add constraint series_event_event
  check (event in ('defined', 'paused', 'released', 'closed', 'paused-after-restore', 'reconciled-after-restore'));

alter table numbering.series_event
  add column restore_id uuid,
  add column evidence text,
  add column evidence_highest bigint,
  add column restored_highest bigint,
  add column next_sequence_before bigint,
  add column next_sequence_after bigint,
  add column reason text;

alter table numbering.series_event add constraint series_event_restore
  check ((event in ('paused-after-restore', 'reconciled-after-restore')) = (restore_id is not null));
alter table numbering.series_event add constraint series_event_reconciled
  check (event <> 'reconciled-after-restore'
    or (evidence is not null and evidence <> '' and reason is not null and reason <> ''
        and restored_highest >= 0 and (evidence_highest is null or evidence_highest >= 0)
        and next_sequence_before >= 1 and next_sequence_after >= next_sequence_before
        and next_sequence_after > restored_highest
        and (evidence_highest is null or next_sequence_after > evidence_highest)));
alter table numbering.series_event add constraint series_event_reconciled_only
  check (event = 'reconciled-after-restore'
    or (evidence is null and evidence_highest is null and restored_highest is null and next_sequence_before is null
        and next_sequence_after is null and reason is null));
