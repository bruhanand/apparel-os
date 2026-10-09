# S1-F08-T03 — Evidence files on exceptions and approvals

Status: done
Blocked by: S1-F08-T02 (done), S1-F06-T05 (done)
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
- Built (9 Oct 2026): evidence on an exception, the route `addExceptionEvidence` (`exceptions/commands/evidence.ts`), one `evidence` event per file naming its attachment (migration 0037); evidence on a decision, an optional `evidence` list on `decideApproval`, linked in Decide through the decision-evidence contract `access` defines and `files-imports` implements (`DECISION_EVIDENCE`), named on the decision (migration 0038) and read back by the approval panel. Exception types declare `evidenceClasses` and approval rules `decisionEvidenceClasses`, with no default; every one declares none so far (RR-453). Screens: the record drawer's Evidence n tab (design-language 10.15) on the exception record, with the picker for a reader who may act on an open exception, and the optional picker in the approval panel's decision form, the decided panel listing its files; each file shows its name, type and size and opens (saves) through the app. Tests: `apps/server/test/evidence.int.test.ts` (both kinds open for an authorised reader and match their hash; a reader without the record, or without a class the evidence carries, is refused and served nothing; a restricted download writes its access record; a decision failing at commit leaves no link; the second Organisation is served nothing), and the journey `apps/web/e2e/evidence.spec.ts`. The details settled are written in access-and-approvals 9.5 "Evidence, as built" and 12.4 "Evidence", module-map section 3 rule 6, imports-and-opening-data 11 and design-language 10.15.
- Beyond the ticket: the record drawer's Evidence n tab (design-language 10.15 names it; the ticket asks only for a picker and a list); `base64Of` moved from the mapping verification screen into the shared `apps/web/src/files/Evidence.tsx`, and the evidence list schema into `packages/schemas` `files.ts`.
- Open: RR-452 (an owner with no grant on `exceptions.exception` acts on it but cannot add or open its evidence), RR-453 (which classes each kind of evidence carries), RR-454 (no screen opens a restricted evidence file yet). RR-320 is closed.
- Review fixes (9 Oct 2026, S1-F08 review): whoever may act on an exception adds and opens its evidence with no grant on `exceptions.exception`: `files-imports` asks the owning module through the record-reader contract it defines and `exceptions` implements (`AttachedRecordReaders`), names the admitted record for the attachment's policy (migration 0039) and authorises the restricted classes alone (`authoriseFieldClasses`) (P2; product owner, 9 Oct 2026; RR-452 closed).
- Closed 9 Oct 2026 on `s1/f08-number-series-and-exceptions`, reviewed with `/code-review` with the feature's other tickets; review fixes `894cd99` to `3100c8f`; no blocking finding left.
- Beyond the ticket (logged at the product owner's request): the record drawer's "Evidence n" tab; shared evidence parts and schema moved into `files`; the `files-imports` record-reader contract and migration 0039 so an exception's owner may add and open evidence (product owner, 9 Oct 2026); `access.authoriseFieldClasses`.
