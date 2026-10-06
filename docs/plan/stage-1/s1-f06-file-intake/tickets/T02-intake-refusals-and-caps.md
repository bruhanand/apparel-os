# S1-F06-T02 — Intake refusals and caps

Status: blocked
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
