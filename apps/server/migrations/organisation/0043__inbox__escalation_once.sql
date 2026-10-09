-- A work item is escalated at most once (access-and-approvals 11.3, 12.4, 13.2; code-house-rules 8.2; PRD-ACS-010,
-- PRD-INT-008; S1-F05 review). Runs as aos_migration (code-house-rules 5.1). Compatible with the version running: it
-- only adds (code-house-rules 4.2).
--
-- An exception escalates once per raise or reopen, and each raise or reopen publishes its own work item (12.4 "As
-- built"); an approval escalates once per request, and a task once, each its own item (11.3 "As built"). So one
-- escalation per work item is the rule for all three, and the key makes two overlapping runs of
-- `exceptions.escalate-overdue` or `inbox.escalate-overdue` record it once: the second insert does nothing. The runs
-- also lock the rows they escalate (code-house-rules 8.2), so the second waits and finds the item escalated.
alter table inbox.work_item_escalation add constraint work_item_escalation_once unique (work_item_id);
