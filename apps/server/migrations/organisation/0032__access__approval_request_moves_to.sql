-- The scope facts a version under approval moves its document to (structure-and-masters 6.1; access-and-approvals
-- 9.1, 9.3, 13.1; product owner, 9 Oct 2026; PRD-ACS-004; S1-F02-T03 review). Runs as aos_migration, which owns the
-- table (code-house-rules 5.1). Compatible with the version running: it only adds columns that may be null
-- (code-house-rules 4.2).
--
-- A version can move the record it is of: a Store version that links the Store to another Site, or a unit's mapping
-- version that maps it to another legal entity. The owning module then passes, with Request approval, the facts the
-- record carries now (0031) and those the version moves it to; who may decide is an approver whose one assignment
-- covers both (9.3). Null in every column when the version moves the document nowhere. Written once with the request;
-- the request's guard (0015) admits no change but its state.

alter table access.approval_request
  add column moves_to_legal_entity_id uuid,
  add column moves_to_site_id uuid,
  add column moves_to_store_id uuid,
  add column moves_to_business_unit_id uuid,
  add column moves_to_brand_id uuid;
