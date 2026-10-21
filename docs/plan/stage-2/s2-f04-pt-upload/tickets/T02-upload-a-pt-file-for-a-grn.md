# S2-F04-T02 — Upload a PT file for a GRN

Status: blocked
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
