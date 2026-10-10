# S1-F06-T04 — Duplicates, concurrent publish and the outcomes report

Status: ready-for-human
Blocked by: S1-F06-T03
Feature: [S1-F06 File intake and a synthetic master import](../../spec.md)

## Build

Nothing publishes twice, one bad document fails alone, every count closes, and the import outcomes report shows it ([imports-and-opening-data.md](../../../../design/platform/imports-and-opening-data.md) (GC-6) section 7, 3.2, 13.1, 14 and 15.1).

- **Source identity** (7.1; `PRD-IMP-011`, `PRD-INT-002`): each document's identity is its target, a scope key the handler names and the document reference the layout names; for a master create or update, the target record type and the record's business code. It is the idempotency key of publishing.
- **Checked three times** (7.2): at Start an import for the reference the uploader claims, refused when already published unless the batch is a governed revision of it; at validation, where a document already published with the same content is counted as a duplicate; and under the lock at publishing. The partial unique index on target, scope key and reference among published documents not replaced by a revision (15.1; domain-model invariant 20) is the last guard, so two publishes at once give one effect (`PRD-INT-005`). A file already read starts a new batch for the same target and layout only if every earlier such batch Failed.
- **Duplicates, conflicts and revisions** (7.2, 7.3; `PRD-ACP-012`, `PRD-MOD-011`): a duplicate has no effect and is counted as duplicate; the same identity with different content is a conflict, refused unless the handler supports a governed revision and the reviewer chooses one. A governed revision publishes once, reversing the earlier document's effects and posting the new ones in one transaction; the original file, rows, outcome and links stay. For masters, a correction is a new version: both handlers accept the update kind, whose versions start today or later (4.1; structure-and-masters 2.2).
- **Publish per document** (3.1 step 9; `PRD-IMP-012`, `PRD-MOD-006`): one transaction per document with its audit record and outbox rows; one failing line fails its document; other documents publish; the failed outcome is kept and the batch stays Validated so it can be corrected (3.2). Withdraw makes a batch Failed. Events `files-imports.import-published` and `files-imports.import-failed` (13.3), identifiers only.
- **Outcomes** (7.4; `PRD-IMP-013`): per document and per batch, rows read, rows ignored by role, quantities and values accepted, rejected, pending and duplicate, and control totals as reported, summed and accepted. Counts close: rows read equal rows ignored plus accepted, rejected, pending and duplicate; Submit and Publish refuse a batch whose counts do not close. An outcome is written for every publish attempt.
- **Import outcomes report** (14; `PRD-MOD-003`, `PRD-EXC-011`): each batch and document with kind, target, layout and mapping versions, uploader, times, state, counts and values; filters by Store, kind, state and date; drill to rows, issues and the stored file; its as-of time; read under the reader's own authorisation and scope (`PRD-SEC-005`).
- **Screens**: duplicates and conflicts named in the validation report and on Publish; the import outcomes report page; browser journeys for a preparer whose repeat upload is a duplicate and a Store-scoped reader of the report.

## Expected outputs

- Source identity, duplicate and conflict control, governed revisions and the update kind in `files-imports` and both handlers
- Outcomes, the import outcomes report and its screen; tests and journeys

## Done when

- GC-6 17 tests 14, 15, 16 and 17 pass; test 15 runs on separate connections against real PostgreSQL (stage 1 README 7.2)
- A repeated Publish request with the same idempotency key is answered once; a stale batch version is refused
- The import outcomes report shows its as-of time and only the batches inside the reader's scope
- The browser journeys pass

## Notes

- **Lifting the publishing limit of S1-F06-T01.** Once S1-F06-T02, S1-F06-T03 and S1-F06-T04 are all done, the one that closes last removes the synthetic-only guard of S1-F06-T01 in the same change, turning its check into one that shows publishing outside local work, tests and `dev` now depends only on those controls and on the other gates in force. Lifting it enables no real data: real masters on `kdps-test` still need KDPS's agreement (RR-180, D-4) and the confirmers of RR-197.
- Overlapping exports, stale copies and two sheets with the same keys (7.2, classes H-10, I-2, I-4) are earlier-POS cases and come with `S2-F13`.

- Built 11 Oct 2026 on `s1/f06-t04`, from `s1/f06-file-intake-2`, with `S1-F06-T02` merged in. As built in GC-6 3.3, 7.4, 13.1, 13.2, 13.3, 14, 15.1 and 16. Migration 0059 (`files-imports`: a document's source identity and content hash, the partial unique index on published identities, revisions, the outcome's batch version, measures and control totals, its scope under row-level security, the classes `duplicate`, `conflict` and `revision`, and two narrowly authorised functions). Tests: GC-6 17 tests 14, 15 (on separate connections), 16 and 17 in `apps/server/test/imports-duplicates.int.test.ts`, with the replay of Publish under its key, a stale batch version, Withdraw and the outcomes report under a Store-scoped reader; unit tests of identity, outcomes and the report; journeys `import-duplicates.spec.ts` (a repeat upload counted as a duplicate; a Store-scoped reader of the report). No job kind and no outbox consumer is added; `files-imports.import-published` and `files-imports.import-failed` are emitted with no consumer.
- **The publishing limit of S1-F06-T01 is lifted**, as this ticket closes last of T02, T03 and T04: the guard and its code `files-imports.publishing-limited` are gone, and the `kdps-test` test now shows Publish there depends only on the review, Confirmed versions and duplicate control. It enables no real data: real masters on `kdps-test` still need KDPS's agreement (RR-180, D-4) and the confirmers of RR-197.
- Choices made while building, each written in the design: one command per document under a key derived from the request's, then the batch's command keeps the outcome; the document is marked Published before its handler writes, so the unique index decides a race; the content hash covers the handler's fields in no row order; the same file is refused per target and layout (any version); a governed revision is chosen by starting an update batch; rows above the data are staged as `ignored`, so rows read close against rows staged; a failed attempt answers with its outcome (200), not a refusal; a batch whose every document is a duplicate stays Staged, to be withdrawn.
- Beyond the ticket, kept small: Withdraw (3.2 names it; no route existed); both handlers' update kind (named in the ticket) needed a merchandise update path through Prepare a SKU version, which locks its SKUs at step 1, so the catalogue's Maintain operation now skips a lock its caller already holds (code-house-rules 8.2 "Rows of other modules"); entering a value in a published document's row is refused; the batch page shows its stored file (as restricted where it holds a class).
- Proposed open items, for the product owner: the outcomes report has no page size; the Store filter offers only the Stores the reader may view as masters, so a Store-scoped reader without Store view filters by kind, state and date only; Publish still authorises the handler's own permission without per-document facts (from S1-F06-T03); a restricted import file has no download screen yet; a concurrent second Start of the same file is not locked against (documents stay guarded by the index).
