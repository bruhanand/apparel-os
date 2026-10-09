-- Evidence on an exception (access-and-approvals 12.1, 12.3; POL-03.05, PRD-EXC-001; S1-F08-T03). Runs as aos_migration
-- (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2).
--
-- An evidence event names the attachment, in files-imports, that links the stored file to the exception
-- (imports-and-opening-data 13.1, 15.1). Every evidence event names one, and no other event names any. The attachment is
-- another module's record, kept by its identifier without a foreign key (structure-and-masters 2.5). No evidence event
-- was written before this migration, so every row already meets the check.
alter table exceptions.exception_event add column attachment_id uuid;
alter table exceptions.exception_event add constraint exception_event_attachment
  check ((kind = 'evidence') = (attachment_id is not null));
