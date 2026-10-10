# S1-F06-T03 — Layouts, mappings and the validation report

Status: done
Blocked by: S1-F06-T01; S1-F02-T02 (the `organisation` Maintain operations the `organisation` handler calls); S1-F02-T03 (place scope, for test 26); S1-F04-T01 (capability controls, for the AI part of test 11)
Feature: [S1-F06 File intake and a synthetic master import](../../spec.md)

## Build

Layouts found by structure, versioned and independently confirmed; every staged value traceable; the validation report and preview a reviewer approves ([imports-and-opening-data.md](../../../../design/platform/imports-and-opening-data.md) (GC-6) sections 5, 6 and 8, 13.1 and 13.2).

- **Detection by structure** (6.5; `PRD-IMP-004`): a layout version is compatible only when every required column is found at its header row. A source hint narrows and orders the candidates and never selects an incompatible version. One compatible version is proposed to the preparer; with several the preparer chooses; with none the preparer proposes a new version.
- **Layouts, mappings and mapping rules in versions** (6.1 to 6.4, 15.1; `PRD-IMP-003`, `PRD-IMP-008`): a layout version records structure only, including each column's type, whether it is required, mapped or ignored, and its restricted field class; a mapping version fills one target's fields, with its transforms and named calculations; a mapping rule maps one source word to one approved value in one scope with validity dates. Versions are never edited. Each is Proposed, Confirmed or Rejected; confirmation is a decision in `access` under the approval rule for mapping-rule confirmation, by a different person from the proposer (`POL-02.07`, `POL-02.08`; `DEC-112` GC6-4), refused for the proposer by a trigger as well. Two Confirmed rules for the same attribute, scope and word with different targets are refused by the exclusion constraint; a layout-scope rule wins over wider ones; wider rules that disagree leave the word unmapped with an issue naming them. An unconfirmed proposal changes no record. Confirming emits `files-imports.mapping-confirmed`. A batch may preview with Proposed versions; Publish needs Confirmed ones.
- **A batch keeps its versions** (`PRD-MOD-010`): its layout and mapping versions are fixed on it; a new version leaves past batches as they were. Batch states as 3.2: any change to a staged value, a document excluded or put back, or a new version returns the batch from Validated to Staged, and an open approval request on the old batch version ends as Superseded (`PRD-ACS-007`).
- **Where each value came from** (section 5; `PRD-IMP-006`, `PRD-IMP-009`): Supplied; Calculated by a named function with its version and inputs, money and tax arithmetic through `packages/calculations`; Mapped, with the rule version and the original word; Entered by a person, in `staged_value_entry` with who, when, the reason and the suggestion it came from. AI suggestions are unavailable while the capability is off (`DEC-105`). A calculated value never replaces a supplied one; a disagreement is a row issue. Money becomes paise by exact decimal arithmetic; a value with more decimals than paise is flagged and stays Unknown until its mapping names a rounding rule (6.2, class C-2).
- **The validation report** (8.1, 8.2; `PRD-IMP-005`, `PRD-IMP-007`): one per batch, split by document and by Store; row issues with class, severity, place, original value, what is wrong, the correction needed and the rule applied; Blocking, Warning and Note, a Warning marked seen by the submitter or approver, one class at a time if they choose; control totals reported against the sum of the lines. It runs the checks of 8.3 that synthetic master files in XLSX meet (such as A-2, A-4, A-7, A-10, A-11, C-1, J-1); the classes of the earlier-POS and vendor-PT layouts come with them in `S2-F13`.
- **Preview and submit** (3.1 steps 7 and 8, 13.2): the handler works out, without writing, what each document would create or change, shown beside the report. Submit for review refuses a batch that is not Validated or still has Blocking issues.
- **Handlers** (13.2; structure-and-masters 7): the `merchandise` handler gains reference checks, suggestions from its own records (codes through Resolve a code, words by trigram search over approved vocabulary) and the check of mapping rules whose targets it owns; an `organisation` create handler does the same for the structure masters, publishing through Maintain so the same approvals apply.
- **Scope** (15.1; access-and-approvals 7.2): batches, documents, rows and files carry Site, Store, business unit and legal-entity columns under row-level security.
- **Screens** (section 16; design-language 10.10): the staging grid shows each original cell beside its normalised value and origin, with hidden rows and sheets marked; the validation report; the preview; layouts, mappings and rules in force (14); proposals decided from My work. Browser journeys for the preparer (P-BKG) and a confirmer, including the proposer's own confirmation refused with its reason.

## Expected outputs

- Detection, versioned layouts, mappings and mapping rules with confirmation, origins, the validation report and preview in `files-imports`
- The extended `merchandise` handler and the `organisation` create handler
- The staging, report, preview and layouts screens; tests and journeys

## Done when

- GC-6 17 tests 11, 12, 13 and 26 pass
- On synthetic XLSX files: one compatible layout version is proposed; two make the preparer choose; none leads to a new Proposed version; a hint never selects an incompatible version
- A change to a Validated batch returns it to Staged and supersedes its open approval request
- The browser journeys pass

## Notes

- GC-6 17 test 3, which proves detection with the sample brand layouts, moved to `S2-F13` with tests 4 to 10 (product owner, 6 Oct 2026).
- RR-197 (GC6-4): the KDPS Owner names who may confirm layout and mapping versions; live use waits for it. Tests use labelled synthetic confirmers.
- RR-134 (GC6-13): which rounding rule each money column uses stays with Accounts; until named, such values stay Unknown.
- The colour tags of class E-1 stay source words (GC-6 6.3).

- Built 10 Oct 2026 on `s1/f06-t03`, from `s1/f06-file-intake-2`. As built in GC-6 3.3, 5, 6.3, 6.4, 6.5, 8, 11, 13.1, 13.2, 13.3, 15.1 and 16, access-and-approvals 9.1a and structure-and-masters 7. Migrations 0057 (`files-imports`: proposals of layouts and mappings, mapping rules and their versions, batch versions and submission, excluded documents, scope columns of documents and rows, values entered by a person, row issues, control totals) and 0058 (pg_trgm, for the handler's suggestions). Tests: GC-6 17 tests 11, 12, 13 and 26 in `apps/server/test/imports-review.int.test.ts`, with detection, the Store handler and the superseded request; journeys `file-intake.spec.ts` (extended) and `import-rules.spec.ts`. No job kind and no outbox consumer is added; the event `files-imports.mapping-confirmed` is emitted with no consumer.
- The three T01 follow-ups: (a) masking and the exclusion of encrypted columns are built (GC-6 11 "As built"); (b) row issues are kept by Validate in the validation report; (c) staging stays in the request, since this ticket's sections do not require the job of 3.3, which comes with the caps (`S1-F06-T02`) or the 10,000-line measurement (`S2-F13`).
- Choices made while building, each written in the design: the import classes `required`, `rule`, `calculation` and `handler` beside the 60 of 8.3; a rule's attribute is `<target>.<field>` and its target the field's value (a code); a word no rule maps stays Supplied for the handler to check; Warnings are marked seen by whoever holds edit on the batch while it is Validated, and Submit refuses unseen ones; a batch version changes with each entry or exclusion, and Publish needs the version submitted; `access` gains Supersede a request; the import handler registry is provided by the composition root; the AI-suggestion refusal names the capability `ai-gateway.drafts`; trigram suggestions at similarity 0.3 or more, five at most.
- Beyond the ticket, kept small: Detect a layout returns each sheet's first row, so the screen fills a proposed layout's columns from the file; a `labelParams` option on the shared Button and GrantedButton; the approval panel's facts for the three confirmations; batch versions superseding the approval of a synthetic approval-reviewed handler, proved in tests only (no stage 1 handler requires one).
- Still open, for the product owner: Publish authorises the handler's own permission without per-document scope facts, so a Store-scoped preparer cannot publish Stores; layout and mapping versions are edited as JSON on screen; the report split by Store waits for documents that name Stores; who confirms stays RR-197.
