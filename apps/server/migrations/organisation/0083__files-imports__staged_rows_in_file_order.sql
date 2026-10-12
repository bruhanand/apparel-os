-- A document's staged rows in the file's order (imports-and-opening-data 3.2, 9.3, 9.4, 13.3; fix/large-batch-validate).
-- Runs as aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible with the version running:
-- an index is added and the one it covers is dropped; no table or row changes (code-house-rules 4.2).

-- A batch's documents are read in the file's order, by the sheet and row number of each document's first data row
-- (import-common `documentsInFileOrder`). On the index of `document_id` alone that first row is found by reading every
-- row of the document, each checked by row-level security, so a document of tens of thousands of rows took seconds
-- and grew past the runtime role's statement limit (CH-3). On this index the first row is the first entry read.
create index staged_row_document_order on files_imports.staged_row (document_id, sheet, row_number);

-- Its leading column serves every lookup the index of `document_id` served.
drop index files_imports.staged_row_document;
