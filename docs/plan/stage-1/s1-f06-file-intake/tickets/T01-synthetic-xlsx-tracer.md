# S1-F06-T01 — Synthetic XLSX tracer

Status: blocked
Blocked by: S1-F06-T05 (stored files, which this ticket uses); S1-F03-T02 (product proposals, through the `merchandise` Maintain operation); S1-F08-T01 (number series, for batch codes)
Feature: [S1-F06 File intake and a synthetic master import](../../spec.md)

## Build

One synthetic product file in XLSX goes end to end through the thinnest path of the pipeline of [imports-and-opening-data.md](../../../../design/platform/imports-and-opening-data.md) (GC-6) 3.1, against real PostgreSQL and MinIO, on the stored files of S1-F06-T05.

- **Intake** (Store a file, 13.1; `PRD-IMP-001`, `PRD-IMP-002`): the import upload goes through Store a file of S1-F06-T05, which gains XLSX here. The file is read in memory and its format found from its content, never its extension (9.2, class A-1): a zip container with a workbook part is XLSX. An import upload of any other type is refused as not allowed, before anything is stored (PDF, JPEG and PNG are stored only as evidence, S1-F06-T05). The other refusals and the caps are S1-F06-T02.
- **The stored original** (3.1 step 2, section 11, 15.1): stored, encrypted, hashed and keyed by Organisation through S1-F06-T05, with its `stored_file` and `file_receipt` rows. The same bytes again add a receipt to the stored copy and show the batches that read it (7.2).
- **Who may read an import file** (13.1, section 11; `PRD-SEC-005`): through Read a file of S1-F06-T05, an import file is served to a reader whose assignment covers the batch's scope. A file whose layout is not confirmed counts as holding every restricted class.
- **Read** (9.1): the XLSX reader (ExcelJS, PRD Stack row Documents; version checked and pinned, code-house-rules 10.6) turns the file into the neutral grid: sheets with their hidden state, hidden rows, cached formula values only, error cells as errors (J-1), a note for any cell it could not read.
- **One fixed layout and mapping** for the synthetic product file, as `layout` and `mapping` records with one version each (6.1, 6.2). Proposal, confirmation by a different person and detection are S1-F06-T03.
- **Start, map and stage** (13.1; `PRD-IMP-003`, `PRD-IMP-006`, `PRD-IMP-010`): `import_batch` of kind create for target `merchandise`, with scope columns, and its code allocated from a `numbering` series in the start transaction (GC9-9, approved 6 Oct 2026). The code's format is an Organisation setting with no default: until it is set, starting an import is refused naming it; tests use a labelled synthetic format (numbering-and-audit 3.5). `import_document`; `staged_row` with every original cell kept and each normalised value marked Supplied with its sheet, row, column, raw value and cell type (section 5).
- **Validate, preview, submit, publish** (3.1 steps 6 to 10, 13.2): required fields checked, Unknown never read as zero (`PRD-MOD-015`). The `merchandise` create handler registers with `files-imports` (structure-and-masters 7): it previews without writing, then publishes the document in one transaction through its Maintain operation, so the SKU arrives as a product proposal that a different person confirms (`PRD-MER-013`, `PRD-IMP-012`). The audit record's source names the batch and staged row (numbering-and-audit 4.1); an outcome is written for the attempt (7.4).
- **Product-owner constraint (6 Oct 2026): publishing is limited to synthetic Organisations.** Publish is reachable only in local work, tests and `dev`, which hold synthetic Organisations only ([deployment.md](../../../../design/platform/deployment.md) section 1). Anywhere else, `kdps-test` included, it answers unavailable, names the publishing controls still missing (intake refusals and caps, S1-F06-T02; confirmed versioned layouts and mappings with the validation report, S1-F06-T03; duplicate control, S1-F06-T04), and writes nothing (`PRD-SEC-017`, `PRD-UXP-003`). The gate reads the environment name, as the simulator gate of code-house-rules 12.10 does; no application code tests for a synthetic code (11.1).
- **Screen**: a first Setup › File intake and saved layouts page (section 16): upload, the stored file and its receipts, the batch and its staged rows, Publish; one browser journey for a Booking preparer (P-BKG).
- **Design edits in the same change**, unless the stage spec's documents step has made them: GC-6 15.1 (batch codes come from a `numbering` series, and whether that kind restarts each financial year; the object-key edit is S1-F06-T05's); module-map 4.7 "Uses" gains `numbering`, a same-tier call (module-map section 3, rule 2), with the module check's tier table.

## Expected outputs

- `files-imports`: XLSX intake, the import-file read rule, batches, documents, staged rows, outcomes, on the stored files of S1-F06-T05
- The `merchandise` create handler for SKUs
- Migrations with their table-register entries; the first intake page; tests

## Done when

- GC-6 17 test 2 passes: the stored original equals the uploaded bytes; each receipt keeps uploader, time, source system and reference; the same bytes again show the earlier batch
- The tracer passes end to end: one synthetic XLSX (SYNTHETIC in its name and document property, code-house-rules 11.1) is uploaded, stored, staged with origins and published; a SKU proposal exists naming its batch, document and staged row; once a different person confirms it, the SKU reads from the catalogue; the batch code came from its `numbering` series
- An import upload of a type other than XLSX is refused and nothing is stored
- Publishing limit: with the environment set to `kdps-test`, or to any value other than local, tests or `dev`, Publish answers unavailable naming the missing controls, and nothing is written. This check stays until the limit is lifted (see S1-F06-T04 Notes)
- The preparer's browser journey passes

## Notes

- RR-187: the tracer on `dev`, with the Railway bucket, is accepted only after the product owner authorises and inspects the Railway environment. Local work and CI need no Railway step.
- Encryption, the Organisation prefix, write-once objects and attachments are built and proved in S1-F06-T05 (product owner, 6 Oct 2026, DEC-116); PDF, JPEG and PNG are kept there as evidence only (GC-6 9.2).
- `files-imports` now calls `numbering` for batch codes (module-map 4.7, GC9-9); add `numbering` to its same-tier list in the module boundary check (`tools/module-check`) with this ticket.
