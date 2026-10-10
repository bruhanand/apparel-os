-- A product proposal published from an import keeps the batch, document and staged rows it came from
-- (imports-and-opening-data 5 "Every published record keeps the batch, document and staged row it came from";
-- structure-and-masters 7; PRD-IMP-002, PRD-IMP-006, PRD-MER-013; S1-F06-T01). Runs as aos_migration
-- (code-house-rules 5.1). Compatible with the version running: it only adds nullable columns (code-house-rules 4.2).
--
-- They are identifiers of `files-imports` records, kept without a foreign key, as no foreign key crosses schemas
-- (code-house-rules 3.2). A proposal a person makes on screen has none; one from an import has all three. The guard
-- of 0047 keeps them, as every column but the decision's, from changing.

alter table merchandise.product_proposal
  add column import_batch_id uuid,
  add column import_document_id uuid,
  add column import_staged_row_ids uuid[],
  add constraint product_proposal_import_source check (
    (import_batch_id is null) = (import_document_id is null)
    and (import_batch_id is null) = (import_staged_row_ids is null)
    and (import_staged_row_ids is null or cardinality(import_staged_row_ids) > 0));
