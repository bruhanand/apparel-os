# S1-F08-T03 — Evidence files on exceptions and approvals

Status: blocked
Blocked by: S1-F08-T02, S1-F06-T05
Feature: [S1-F08 Number series and exceptions](../../spec.md)

## Build

Stored files attach as evidence to exceptions and to approval decisions, through Attach and Read a file of `files-imports`, built in S1-F06-T05 ([imports-and-opening-data.md](../../../../design/platform/imports-and-opening-data.md) 11, 13.1, 15.1 `attachment`; [module-map.md](../../../../design/architecture/module-map.md) 4.7).

- **Exceptions** ([access-and-approvals.md](../../../../design/access/access-and-approvals.md) 12.1, 12.3; `PRD-EXC-001`, `POL-03.05`): the owner or an authorised person adds evidence while the exception is open, recorded as an evidence event linking the stored file to the exception.
- **Approval decisions** (access-and-approvals 9.5; `PRD-ACS-010`, `POL-02.23`): the approver attaches evidence with the decision. The file is stored first, outside the decision's transaction, and linked in it, so the decision stays one entry that is never edited.
- **Who may read it** (imports-and-opening-data 11): `exceptions` and `access` declare the restricted field classes their kinds of evidence carry. S1-F06-T05 serves a file only through the app, to a reader authorised for the record it is attached to and for those classes (`PRD-SEC-005`), and writes an access record when one holding a restricted class is downloaded ([numbering-and-audit.md](../../../../design/platform/numbering-and-audit.md) 5.1).
- PDFs and photographs are kept as evidence only, with no layout (S1-F06-T05; [stage spec](../../spec.md), Imports).
- **Screens**: an evidence picker on the exception record and in the approval panel ([design-language.md](../../../../design/ui/design-language.md) 10.14); attached files listed with name, type and size, opening through the app.

## Expected outputs

Evidence attachment for exceptions and decisions; screens; tests

## Done when

- An exception's evidence and a decision's evidence open from their records for an authorised reader, and the stored file matches its hash; a reader without the record, or without a class the evidence carries, is refused and nothing is served; a restricted download writes an access record
- A decision that fails to commit leaves no link to its evidence
- A second synthetic Organisation is never served the other's file
- Browser journey: an Operations user attaches a synthetic photograph to an exception; an approver attaches a synthetic PDF to a decision; both open from their records

## Notes

- imports-and-opening-data 17 test 23 checks these attachments after a restore, in S1-F14.
- Other evidence attaches through S1-F06-T05 in its own ticket: mapping verification (S1-F02-T02), policy signature and validation (S1-F04-T01), signed agreements (S1-F03-T03), and the CA's evidence for book settings, posting maps and tax rules (S1-F09-T01, S1-F09-T02, S1-F09-T04) (product owner, 6 Oct 2026, DEC-116).
