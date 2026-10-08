-- A receipt's original file name and claimed document reference are kept encrypted with the Organisation's key, not as
-- plaintext (imports-and-opening-data 11, 15.1; PRD-SEC-006, POL-18.02; S1-F06-T06; product owner, 8 Oct 2026, RR-433).
-- Runs as aos_migration (code-house-rules 5.1).
--
-- NOT compatible with the version running: the code of 0024 wrote `original_name` (not null) and `claimed_reference`,
-- which are dropped here. It is deployed as a planned brief interruption on `dev` (code-house-rules 4.2, DEC-120): `dev`
-- holds only synthetic data, and file storage is not enabled on any other host. A receipt row written before this
-- migration keeps its other columns and reads back with its name and reference Unknown (null); a row of an append-only
-- table is never changed (code-house-rules 4.2 "Data"), and the key is outside the database, so none is re-encrypted.
--
-- The sealed text is the base64url of nonce, tag and ciphertext; one scheme names the algorithm for both values.

alter table files_imports.file_receipt
  drop column original_name,
  drop column claimed_reference,
  add column original_name_sealed text,
  add column claimed_reference_sealed text,
  add column encryption_scheme text;

-- New rows only: a receipt before this migration has no sealed name. A null sealed reference is "none claimed".
alter table files_imports.file_receipt
  add constraint file_receipt_name_sealed check (original_name_sealed is not null and encryption_scheme is not null) not valid,
  add constraint file_receipt_reference_sealed check (claimed_reference_sealed is null or encryption_scheme is not null);
