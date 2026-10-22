# S2-F04-T02 — Upload a PT file for a GRN

Status: in-progress
Blocked by: S2-F02-T03, S2-F04-T01
Feature: [Stage 2 first version](../../spec.md)

## Build

- Setup ([goods-in.md](../../../../design/goods-in/goods-in.md) 5.2): the layout version of KDPS's PT template (20 columns plus the two `SUGGESTED` columns; all 20 required, `DEC-140`), proposed by an Admin and confirmed by a second person; the master sheet's lists as vocabularies, each confirmed; both from labelled synthetic replicas in tests and on `dev`. The blank template downloads with its lists (section 11).
- The PT import handler of `merchandise` · PT, a transaction batch in `files-imports` (imports-and-opening-data 4.1, 13.2): preconditions (5.1: GRN issued, every held line decided, no other live PT, the uploader's permission); the header found on row 1 or 2; the checks of 5.3 (the row checks and `MARGIN` as pure functions, `MARGIN` through the shared ticket-margin calculation) and the match of 5.4 against the GRN's good pieces per style and size, colour not compared (`DEC-138`); product proposals and barcode mappings, repeated barcodes flagged, differences from existing products (5.5).
- Refused whole with every problem listed by row and column (5.6). Otherwise the preview; then submit, which in one transaction creates the draft PT revision, its approval request on total proposed acquisition cost and the GRN's "PT attached" mark (`S2-F02-T05`). A draft is withdrawn, never edited.

## Expected outputs

`merchandise` · PT records and migrations; the handler; routes, schemas, OpenAPI; screens; unit and integration tests; synthetic fixtures labelled synthetic.

## Done when

Design tests 2 (refused while a held line is open), 8, 9, the proposal part of 10, and the 10,000-line check within one minute of 21 pass; every check passes.

## Notes

- Built (22 Oct 2026, branch `s2/f04-t02-pt-upload`; `Status:` unchanged): migrations `0103__files-imports__batch_subject.sql`, `0104__merchandise.catalogue__template_list_marks.sql`, `0105__receiving__pt_attached_mark.sql` and `0106__merchandise.pt__draft_pts.sql` (numbered after S2-F02-T04's 0101 and 0102) with their `tables.json` entries; the part `merchandise` · PT (`apps/server/src/modules/merchandise/pt/`) with its PT import handler, submit and withdrawal, reads, restore participant and the approval rule `merchandise.pt.approve` (no decision effect yet: `S2-F06-T01`); the record type `merchandise.pt` (view, create, edit, approve); routes `readGrnPt`, `previewPtUpload`, `downloadPtTemplate`, `withdrawPtRevision`, and on `startImport` the optional `subject`; OpenAPI regenerated; the screen Receive Goods › an Arrival › its GRN › PT file. Tests: `apps/server/test/pt-upload.int.test.ts` (design tests 2, 8, 9, the proposal part of 10 and the 10,000-line check of 21), `apps/server/src/modules/merchandise/pt/domain/*.test.ts`, `apps/server/src/modules/files-imports/domain/staging.test.ts`, the journey `apps/web/e2e/pt-upload.spec.ts`. Design written into goods-in 5.8 (new) and 10.3; imports-and-opening-data 6.5, 13.1 and 13.2; structure-and-masters 4.2, its operations, tables and screens; code-house-rules 10.6; module-map section 5.
- The GRN's "PT attached" mark is built here, moved from `S2-F02-T05` (goods-in 5.8): `receiving.grn_pt_mark`, dated, attributable, append-only changes set at submit and cleared at withdrawal through `receiving`'s `setPtMark` and `clearPtMark` under the GRN's row lock (`ptMarkLock`), read by `ptMark`; rejection and reversal will clear it (`S2-F06-T01`, `S2-F09-T01`). `S2-F02-T05` builds only the recount's refusal.
- Measured (SYNTHETIC, local test container, 22 Oct 2026): a 10,000-line file checked in 7.1 to 12.6 seconds and submitted in 12.7 to 18.0 seconds over four runs, both in the request; the design names no queued path for the upload (goods-in 5.8 "Speed").
- Beyond the ticket: the marked attributes extended from the season and the size to the template's other lists, colour, gender, type, item, fit and GST rate, so the master sheet's lists are the Organisation's approved vocabularies (structure-and-masters 4.2 "As built"; RR-582), and the Attributes tab renamed "Marked attributes" (the season-and-size journey follows it); two layout structure rules, the header on one of several rows and the sheet found by its header (imports-and-opening-data 6.5); a batch about one record, the handler's batch read and the blank template writer in `files-imports` (13.1, 13.2); Setup › Files › Saved layouts proposes a layout of the transaction kind too; a sheet not imported now names its rows on screen (`missing.sheet-rows.named`), for the import review too; the table register's check compares a numeric column's precision.
- For deploys (not done; each waits for the product owner's go-ahead): on `dev`, the PT upload and its template stay unavailable until an Admin marks the colour, gender, type, item, fit and GST rate attributes and a second person approves each, and until the PT template's layout and mapping are proposed and confirmed on Setup › Files.
- Open, for the product owner: RR-582 to RR-586.
- At the merge with S2-F02-T04 and `DEC-144` (22 Oct 2026): the migrations numbered from 0103 and the open items from RR-582; the seed's SYNTHETIC markings typed as the season and the size only (`SeededMark`), since `DEC-144` seeds only those two (RR-582 asks about the others).
