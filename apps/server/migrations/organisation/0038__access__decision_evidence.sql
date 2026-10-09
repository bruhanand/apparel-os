-- The evidence of an approval decision (access-and-approvals 9.5; domain-model 3.2; PRD-ACS-010, POL-02.23; S1-F08-T03).
-- Runs as aos_migration (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2).
--
-- The decision names the attachment, in files-imports, of each evidence file the approver gave, written in the
-- decision's own transaction, so a decision that does not commit leaves no link. An empty list is a decision given with
-- no evidence, as every decision recorded before this migration was. The decision stays an entry, never edited
-- (append-only, code-house-rules 7.1): adding a column with its value for the rows already there edits none of them.
alter table access.approval_decision add column evidence_attachment_ids uuid[] not null default '{}';
