-- A batch about one record (imports-and-opening-data 13.1, 13.2 "As built" with S2-F04-T02; goods-in 5.1, 5.6): the
-- record a target's handler names as the batch's subject, such as the GRN a PT file is uploaded for. Runs as
-- aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible with the version running: it only
-- adds two nullable columns, which a batch started by the running code leaves empty (code-house-rules 4.2).
--
-- The subject belongs to another module, so it keeps its record type and identifier with no foreign key
-- (code-house-rules 3.2); both are set or neither. The batch's guard trigger compares every other column before and
-- after a change, so a subject, written when the batch is started, never changes (migration 0063).

alter table files_imports.import_batch
  add column subject_record_type text,
  add column subject_record_id uuid,
  add constraint import_batch_subject
    check ((subject_record_type is null) = (subject_record_id is null) and subject_record_type <> '');
create index import_batch_subject on files_imports.import_batch (subject_record_id);
