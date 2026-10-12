# S1-F06-T02 — Intake refusals and caps

Status: done
Blocked by: S1-F06-T01; S1-F06-T03 (layout column classes, the preview and the validation report, which test 25 and the RR-203 check need)
Feature: [S1-F06 File intake and a synthetic master import](../../spec.md)

## Build

Everything intake refuses before a file is stored, and the restricted columns of a stored file ([imports-and-opening-data.md](../../../../design/platform/imports-and-opening-data.md) (GC-6) 9.3 and section 11).

- **Safety at intake** (9.3, class A-9; `PRD-SEC-011`; `DEC-112` GC6-3): read in memory, before anything is stored, intake refuses a file holding macros, active scripts, embedded objects or unapproved links, and a workbook that depends on data in another workbook. That last refusal asks for a self-contained copy; no dependency is stripped and no stale linked value trusted. An ordinary external hyperlink in a sheet is not an unapproved link: it is kept as inert text, never followed or rendered as a live link on any screen, and the file is accepted (product owner, 6 Oct 2026, DEC-116; RR-201, GC6-17). A reference inside the workbook is read. No link is ever followed or fetched.
- **Damaged files** (9.2, A-1): a file whose content cannot be read as its found format is refused with the reader's error.
- **Caps** (9.3; `DEC-112` GC6-5, RR-036): uploaded size, expanded size, rows, parser memory and processing time, each an environment setting read at start through one Zod schema; a missing one stops the service at start (code-house-rules 12.14). The builders choose the values for local work, tests and `dev`, document them beside GC-6 9.3, and test them with representative synthetic files. A file over a cap is refused with the cap named, nothing is stored or staged, and nothing is truncated. A cap that blocks a required workflow is reported to the product owner.
- **Customer-contact columns on `kdps-test`** (section 11; `DEC-052`; `DEC-112` GC6-6): first design the in-memory check (RR-203) in GC-6 3.1 and section 11, without guessing: layout detection runs after storing today (3.1 step 4), so say how intake finds such columns before it, for example by detecting the layout in memory against the restricted column classes of the layout versions of S1-F06-T03, and what happens when no layout fits. Then build it: on a test-setup Organisation, a file with customer-contact columns is refused before it is stored, even with synthetic contacts; the refusal says why and offers a clean upload again; intake never removes columns itself.
- **Restricted columns** (section 11; access-and-approvals section 6; `PRD-ACS-008`, `PRD-SEC-006`): a value of a class the reader's assignment does not grant is masked in the preview and the validation report on screen, and left out of read models and exports. A column of an encrypted class is left out of staging unless the mapping fills a target that holds that class. Downloading a file that holds a restricted class is an export with an access record (numbering-and-audit 5.1). No restricted value reaches a log, an error or a live-update event (`PRD-SEC-014`); logs carry a file's hash and size only.
- **Screens**: each refusal shows on the intake page with its reason and the next action (`PRD-UXP-003`); masked cells in the staging grid and the report; the browser journey of a preparer whose file is refused, and of a reader without the cost class.

## Expected outputs

- Intake checks and caps in `files-imports`; the caps' Zod schema and their documented values for local work, tests and `dev`
- The RR-203 design in GC-6; the customer-contact refusal
- Masking and leaving out of restricted classes; tests and journeys

## Done when

- GC-6 17 test 1, XLSX part, passes: an `.xls` that is XLSX is read; a damaged file is refused with its error; a file with a macro or an unapproved link, or a workbook that depends on another workbook's data, is refused before it is stored, the last with a request for a self-contained copy; a file whose sheet holds an ordinary external hyperlink is accepted, the link kept as inert text and never shown as a live link; a reference inside the workbook is read; no link is followed
- GC-6 17 tests 25 and 28 pass
- The RR-203 design is written in GC-6 and reviewed before its code
- The two browser journeys pass

## Notes

- The other formats of test 1 (a `.csv` that is XLS, and CSV, XLS and XLSB files) moved to stage 2 with `S2-F13` (product owner, 6 Oct 2026).
- RR-201 answered (GC6-17; product owner, 6 Oct 2026, DEC-116): an ordinary external hyperlink is kept as inert text and the file accepted. The cross-workbook dependency refusal (GC6-3) is unchanged.
- RR-036: the caps of `kdps-test` are documented and tested before intake there.
- RR-197: the KDPS Owner confirms the customer-contact refusal (question 37). GC6-7 (other fields left out on the test setup; who sees cost columns) stays open with the KDPS Owner and the product owner.
- Lifting the publishing limit of S1-F06-T01: whichever of S1-F06-T02, S1-F06-T03 and S1-F06-T04 closes last lifts it (S1-F06-T04 Notes).
- The checks for evidence files (type from content, active content in PDFs, size limits) are built first, in S1-F06-T05 (`DEC-117`); this ticket adds the workbook refusals and caps and reuses them.

- Built 11 Oct 2026 on `s1/f06-t02`, from `s1/f06-file-intake-2`. As built in GC-6 3.1, 3.3, 9.3, 11, 13.1 and 18 (GC6-5), deployment.md section 9 and the Railway runbook. No migration, no job kind, no outbox consumer, no new dependency. Tests: GC-6 17 test 1 (XLSX part), 25 and 28 in `apps/server/test/intake-refusals.int.test.ts`; unit tests of the workbook checks, the caps, the capped read and the customer-contact check; journeys `intake-refusals.spec.ts` (a refused macro workbook, then a clean copy; a preparer without the class cost).
- The RR-203 design (GC-6 section 11) was approved as built by the product owner, 10 Oct 2026: a sheet no Confirmed layout recognises refuses the file, and every sheet holding data is checked, notes sheets included. RR-203 is closed.
- Choices made while building, each written in the design: every read of a workbook (intake, Start an import, Detect a layout) runs the safety checks and ExcelJS in a worker thread, its heap limited to the parser-memory cap and ended at the time cap; a damaged file is refused at intake, naming the reader's error as a word, never its message (`PRD-SEC-014`); every external relationship but an ordinary hyperlink counts as an unapproved link, and data connections too; the uploaded-size cap may be at most 10 MiB, what the import upload's body limit carries; the caps of local work, tests and `dev` (10 MiB, 100 MiB expanded, 150,000 rows, 1,024 MiB, 60 s), from measurements, accepted for those environments only by the product owner, 10 Oct 2026, and labelled SYNTHETIC in the fixture, GC-6 9.3 and deployment.md (the values of `kdps-test` stay OPEN, RR-036); on `kdps-test`, a sheet no Confirmed layout recognises refuses the file.
- Beyond the ticket, kept small: RR-434 (PDF streams behind a filter the check cannot open are refused), assigned to this ticket in open-items; the publishing limit also drops `S1-F06-T03`'s control, which is built, so it names duplicate control (`S1-F06-T04`) alone; the intake page's type refusal now names the types allowed for an import as well as for evidence.
- **Before the next deploy to `dev`:** the five `AOS_INTAKE_*` variables must be set on `app` (values in GC-6 9.3), or `app` will not start. Anything on Railway waits for the product owner.
- Masking in the preview and the report, and the left-out encrypted columns, were built with `S1-F06-T03`; downloading a restricted file as an export with an access record with `S1-F06-T05` and `S1-F06-T06`. This ticket adds the tests of 17 test 25 that no log holds a restricted value, and the masked cost journey.
- Closed 11 Oct 2026 on `s1/f06-file-intake-2`, reviewed with `/code-review`; review fixes 936fefd, 75cfac6 and c9cc40b on `s1/f06-fixes`; no blocking finding left. The ticket's own commits: ff55268, 0cc519f, e602374.
- Review fixes for this ticket: the workbook's relationship and content type parts are read by an XML tokenizer, the content types part found whatever its case, with crafted-workbook tests for each bypass; one refusal for a workbook not read. Evidence-file checks not using these caps or the worker: RR-502.
- Second review (Opus), 11 Oct 2026; review fixes (2) COMMITS on `s1/f06-fixes-2`, every check passing. For this ticket: a container with two entries of one name is refused; a Power Query part is known by its element; test 25 now gives the cost column a control total, so the masking of the report, its K-1 issue and the outcomes report bites, and `maskIssueOriginal` and `maskOutcome` are unit tested; test 28 adds files just over the documented caps of uploaded size (10 MiB), expanded size (100 MiB) and rows (150,000 accepted, 150,001 refused). The parser-memory (1,024 MiB) and processing-time (60 s) caps stay proved with tight SYNTHETIC caps: a file that takes a gibibyte of heap or a minute to read is not practical in a test run. Store a file for an import was already authorised first, by its route's guard (create on `files_imports.stored_file`, a type with no scope facts), before its workbook checks; the design now says so.
