-- The scope facts of the document an approval request binds to (access-and-approvals 9.1, 9.3, 9.8a, 13.1; RR-435;
-- PRD-ACS-001, PRD-ACS-004; S1-F02-T03). Runs as aos_migration, which owns the table (code-house-rules 5.1).
-- Compatible with the version running: it only adds columns that may be null (code-house-rules 4.2).
--
-- The owning module passes its document's facts with Request approval, as it passes them to Authorise (5.3): the
-- legal entity, the Site, the Store, the business unit and the brand it carries. A fact the document's record type
-- does not declare is null and not checked; a declared fact left null is Unknown, covered only by all-members scope
-- (PRD-MOD-015). Who may decide is an approver whose one assignment grants approve on the record type and covers these
-- facts (9.3). Written once with the request; the request's guard (0015) admits no change but its state, so the facts
-- a decision is judged on are those the request froze. A request of an access change keeps none: its record types
-- carry no scope fact (9.11).

alter table access.approval_request
  add column legal_entity_id uuid,
  add column site_id uuid,
  add column store_id uuid,
  add column business_unit_id uuid,
  add column brand_id uuid;
