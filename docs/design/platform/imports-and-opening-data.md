# Imports and opening data

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Current**, 5 Oct 2026. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements these PRD sections: Source conversion and imports; from Opening, closure, migration and export, the opening-data layouts, the import kinds and the earlier-POS imports of the side-by-side test; from AI, security and operational reliability, file validation and restricted data in imports. It details the `files-imports` module of [module-map.md](../architecture/module-map.md) 4.7 and is GC-6 in [gaps-before-code.md](../../reports/gaps-before-code.md).

- PRD IDs: `PRD-IMP-001`–`PRD-IMP-013`; `PRD-LIF-003`–`PRD-LIF-011`, `PRD-LIF-013`, `PRD-LIF-014`, `PRD-LIF-016`, `PRD-LIF-025`–`PRD-LIF-028`; `PRD-MER-004`–`PRD-MER-007`, `PRD-MER-009`–`PRD-MER-011`, `PRD-MER-013`, `PRD-MER-017`; `PRD-ORG-005`, `PRD-ORG-012`, `PRD-ORG-014`; `PRD-REC-008`, `PRD-REC-017`; `PRD-PTW-002`, `PRD-PTW-003`, `PRD-PTW-013`; `PRD-STK-014`; `PRD-TRF-003`; `PRD-EBO-001`, `PRD-EBO-004`, `PRD-EBO-005`, `PRD-EBO-010`; `PRD-CSH-007`; `PRD-PAY-008`; `PRD-ACS-006`–`PRD-ACS-008`; `PRD-EXC-010`, `PRD-EXC-011`; `PRD-MOD-002`, `PRD-MOD-003`, `PRD-MOD-006`, `PRD-MOD-009`–`PRD-MOD-011`, `PRD-MOD-014`, `PRD-MOD-015`; `PRD-INT-002`, `PRD-INT-004`, `PRD-INT-005`, `PRD-INT-008`, `PRD-INT-011`, `PRD-INT-012`; `PRD-SEC-002`–`PRD-SEC-006`, `PRD-SEC-009`–`PRD-SEC-014`, `PRD-SEC-017`; `PRD-PRF-001`–`PRD-PRF-003`; `PRD-UXP-003`; `PRD-ACP-012`, `PRD-ACP-014`, `PRD-ACP-019`.
- Policies: 2 (`POL-02.07`, `POL-02.08`), 3 (`POL-03.02`, `POL-03.07`), 9 (`POL-09.09`), 10 (`POL-10.02`), 11 (`POL-11.01`), 14 (`POL-14.02`–`POL-14.04`, `POL-14.07`), 18 (`POL-18.02`, `POL-18.05`).
- Decisions: DEC-013, DEC-052, DEC-071, DEC-090, DEC-097, DEC-105.

Depends on: [module-map.md](../architecture/module-map.md) (4.7: owner, operations and events of `files-imports`; 6.2 flow B: publishing an import), [domain-model.md](../architecture/domain-model.md) (3.9: the records of files and imports), [structure-and-masters.md](../masters/structure-and-masters.md) (GC-2: vocabulary, external codes and master imports), [access-and-approvals.md](../access/access-and-approvals.md) (GC-3: approvals, restricted fields, service identities, 9.8 for a document a job posts), [stock-ledger.md](../stock/stock-ledger.md) (section 9: the switch; 10.1 and 10.6: idempotency and large documents), [numbering-and-audit.md](../platform/numbering-and-audit.md) (GC-5: business codes and the audit record), [books-and-posting.md](../finance/books-and-posting.md) (GC-4: 7.3, financial opening balances), [deployment.md](deployment.md) (D-2: the file bucket; D-4 and section 9: real data and personal data on the test setup).

Inputs, not ranked: the data notes [prd-fit.md](../../data-notes/prd-fit.md) (3.1), [data-quality-and-import-rules.md](../../data-notes/data-quality-and-import-rules.md), [pt-file-layouts.md](../../data-notes/pt-file-layouts.md) with [pt-layouts.json](../../data-notes/pt-layouts.json), [pos-exports.md](../../data-notes/pos-exports.md) with [pos-export-layouts.json](../../data-notes/pos-export-layouts.json), [item-master-vocabulary.md](../../data-notes/item-master-vocabulary.md), [stores-and-codes.md](../../data-notes/stores-and-codes.md), [transfers.md](../../data-notes/transfers.md), [store-close-cash-and-bank.md](../../data-notes/store-close-cash-and-bank.md) and [purchases-and-supplier-notes.md](../../data-notes/purchases-and-supplier-notes.md). They describe KDPS's files. Their layouts are samples; no value in them is a setting.

Used by: the stage 1 code of `files-imports`; the master import handlers of `organisation` and `merchandise` (structure-and-masters section 7); the stage 2 designs for the PT workbench and costing profiles and for the earlier-POS imports of `ebo-imports`; the stage 4 designs for EBO imports and for the switch in `site-lifecycle`; the stage 5 design for bank statements and settlement files; the backup and restore design (GC-9), which restores stored files and their links.

---

## 1. What this document fixes
<!-- deps: PRD-IMP-001, PRD-IMP-005, PRD-MOD-002, POL-14.07 — scope of this design: the files-imports module and the opening-data layouts -->

- The import pipeline of `files-imports`: intake, the stored original, layout detection, versioned layouts and mappings, staging, validation, preview, review and publishing through the target module's import handler (`PRD-IMP-001`–`PRD-IMP-013`; module-map 4.7). Owners, operations and events are in module-map 4.7 and are made concrete here, not repeated.
- The five batch kinds and what each may and may not post (section 4); where each staged value came from (section 5); duplicate control, corrections and reconciliation (section 7); the validation report and the 60 problem classes found in KDPS's files (section 8); the format readers (section 9).
- How the sample layouts in the data notes become versioned layout records (6.7), and the rules for earlier-POS sales lines that are returns or transfers keyed as sales (6.8).
- The opening-data layouts for stock, dues, advances and deposits, and the tools that reconcile them, built and tested with labelled sample data in stage 1 (section 10; `POL-14.07`).
- The tables `files-imports` owns (section 15), its read models (section 14) and its tests (section 17).

It fixes no KDPS value: no tolerance, rounding rule, file-size limit, Store code, vocabulary value or layout is decided here. It does not design the PT workbench, costing profiles, receiving, the switch flow, EBO application or bank matching; section 12 says which later design takes each. Labels (**Design choice**, **Proposed**, **OPEN**) mean what module-map section 1 says.

## 2. Records and words
<!-- deps: PRD-IMP-002, PRD-IMP-003, PRD-IMP-010, PRD-IMP-011 — the records of domain-model 3.9 as this design uses them -->

The records are those of [domain-model.md](../architecture/domain-model.md) 3.9, with two added: the document inside a batch, and the comparison run.

| Record | What it is here | IDs |
| --- | --- | --- |
| Stored file | One original file or photograph, kept byte for byte, with every receipt of it: source system, uploader, time and the document reference claimed | `PRD-IMP-002` |
| Attachment | A link from a stored file to a record of any module | `PRD-SEC-005` |
| Layout | A recognised file structure for one source and document type, in versions (6.1) | `PRD-IMP-003`, `PRD-IMP-004` |
| Mapping | How a layout version fills one target's fields, in versions (6.2) | `PRD-IMP-003` |
| Mapping rule | A rule that turns a source word into an approved value, in versions (6.3) | `PRD-IMP-003`, `PRD-IMP-008` |
| Import batch | One stored file read with one layout version and one mapping version, of one kind, for one target | `PRD-IMP-010` |
| Document | One business document the batch's file holds, with its document reference. A file may hold several (6.6). **Design choice:** the document is the unit of duplicate control and of publishing | `PRD-IMP-011`, `PRD-IMP-012` |
| Staged row | One row of the file, kept with every original cell, and its normalised values with their origins (section 5) | `PRD-IMP-002`, `PRD-IMP-006` |
| Row issue | A problem found by validation, with the correction it needs (section 8) | `PRD-IMP-007` |
| Import outcome | What happened to a batch and to each of its documents, kept for failures as well as successes (7.4) | `PRD-IMP-012`, `PRD-IMP-013` |
| Comparison run | A reconciliation of two sets by a key, such as an opening manifest against the earlier POS's last SOH (10.3). **Design choice:** a part of `files-imports`, so every opening and side-by-side check uses one tool | `PRD-LIF-027`, `POL-14.07` |

- "Batch" here always means an import batch. A batch of goods with an expiry date is "batch and expiry", as in `PRD-MER-011`.
- PRD words are used as defined: SOH is a comparison source, never a count; Earlier POS, Side-by-side test, Switch and Switch count are as in PRD "Words used". A KDPS report titled "List of Sales Vouchers" is a brand report, not a Voucher.

## 3. The pipeline

### 3.1 Steps
<!-- deps: PRD-IMP-002, PRD-IMP-003, PRD-IMP-004, PRD-IMP-005, PRD-IMP-012, PRD-SEC-011 — the order of the import steps -->

```mermaid
flowchart LR
  A[Intake] --> B[Store original]
  B --> C[Read]
  C --> D[Detect layout]
  D --> E[Map and stage]
  E --> F[Validate]
  F --> G[Preview]
  G --> H[Review]
  H --> I[Publish through handler]
  I --> J[Outcome]
```

1. **Intake.** A person or an adapter hands in a file with its source system and, where known, a document reference (`PRD-IMP-002`). The file is read in memory first and checked for safety and size (9.3, `PRD-SEC-011`). A refused file is not stored, and the refusal is shown with its reason.
2. **Store the original.** The bytes are kept unchanged and stored encrypted (section 11) in file storage: on the test setup a Railway bucket, S3-compatible ([deployment.md](deployment.md) D-2, DEC-105). The stored file is identified by a hash of its content; each receipt keeps its own source system, uploader, time and claimed document reference (`PRD-IMP-002`). **Design choice.**
3. **Read.** A format reader turns the file into a neutral grid (9.1). It evaluates no formula, runs no macro and follows no link (`PRD-SEC-011`).
4. **Detect the layout** from the grid's structure (6.5, `PRD-IMP-004`). The preparer confirms the layout version and the batch kind.
5. **Map and stage.** The mapping version turns each data row into a staged row: original cells kept, values normalised, every value marked with its origin (section 5; `PRD-IMP-003`, `PRD-IMP-006`). Rows are grouped into documents (6.6).
6. **Validate.** Field, row, document and file checks; references checked by the target module's handler through its own interface (13.2); control totals compared; duplicates and conflicts found (sections 7 and 8; `PRD-IMP-005`, `PRD-IMP-007`, `PRD-IMP-011`).
7. **Preview.** The target handler works out, without writing, what each document would create or change (13.2). The preview shows it beside the validation report (`PRD-IMP-005`).
8. **Review.** The review the handler requires for this kind and target (13.2): the preparer's submission after the preview, or an approval request in `access` bound to the exact batch version (`PRD-ACS-007`; access-and-approvals 9.1).
9. **Publish.** For each document chosen, the handler writes its own records in one transaction with the audit record and the outbox rows (module-map 6.2 flow B). A required document posts whole or not at all (`PRD-IMP-012`). A large document posts through a queued job (10.6; stock-ledger 10.6).
10. **Outcome.** The batch and each document keep what was accepted, rejected, pending and duplicate, with quantities and values, whether publishing succeeded or failed (7.4; `PRD-IMP-012`, `PRD-IMP-013`).

### 3.2 Batch states
<!-- deps: PRD-IMP-005, PRD-IMP-012, PRD-ACS-007, DEC-105 — the four batch states of DM-4 and their transitions -->

The states are the DM-4 baseline: Staged, Validated, Published and Failed (DEC-105; [design-language.md](../ui/design-language.md) section 7). No other state is added. **Proposed** (GC6-15): a queued or failed publish keeps the batch Validated, as below.

| From | To | When |
| --- | --- | --- |
| — | Staged | The batch is started and its rows staged |
| Staged | Validated | Validation finished. The batch now waits for review |
| Validated | Staged | A staged value is changed, a document is excluded or put back, or the layout or mapping version is changed. Validation runs again, and an open approval request on the old batch version ends as Superseded (`PRD-ACS-007`; access-and-approvals 9.6) |
| Validated | Published | Every document chosen for publishing has posted. The outcome lists those excluded, refused as duplicates or refused as conflicts |
| Staged or Validated | Failed | The file cannot be read, or the preparer withdraws the batch, for example when every document is excluded, a duplicate or a conflict. The outcome is kept (`PRD-IMP-012`) |

- A publish attempt that fails, or a publish job that fails, posts nothing; its outcome is kept, and the batch stays Validated so it can be corrected and published again. A retry of a job follows access-and-approvals 9.8 and stock-ledger 10.6: the same approval decision is used only while the batch version is unchanged.
- A batch whose publish job is queued shows Validated with the job's state beside it.
- A Published or Failed batch is never edited. A correction is a new batch (7.3).

### 3.3 Where the work runs
<!-- deps: PRD-PRF-001, PRD-PRF-003, PRD-MOD-006, PRD-SEC-013 — what runs outside the business transaction, and what runs as a job -->

- Steps 1 to 8 run outside any business transaction. Reading, staging and validating a large file run as a pg-boss job on the `worker`, never inside a counter request (`PRD-PRF-003`; module-map section 10). The preparer sees progress through live updates that carry identifiers only.
- Step 9 is one transaction per document, in the shape of module-map 6.1, under the handler's own module interface (`PRD-MOD-006`).
- The PRD performance table sets a target: parse, map and validate a 10,000-line structured PT import in under 1 minute. It is measured under `PRD-PRF-001`, and reported apart from human review and any AI extraction (`PRD-PRF-002`).
- A failed job, a stuck batch and a file that could not be read are shown to authorised operators (`PRD-SEC-013`).

## 4. Batch kinds

### 4.1 The five kinds
<!-- deps: PRD-IMP-010, PRD-LIF-008, PRD-LIF-010, PRD-LIF-011, PRD-LIF-014, PRD-LIF-016 — what each batch kind may and may not post -->

A batch has exactly one kind, chosen when it starts and fixed for life (`PRD-IMP-010`; domain-model 3.9).

| Kind | What it does | May create | Never creates | First targets |
| --- | --- | --- | --- | --- |
| Create | Adds master records | New master records through the owner's Maintain operation; product and vocabulary proposals (structure-and-masters 4.2, section 7) | Stock, money or a tax document | `organisation`, `merchandise` (stage 1) |
| Update | Changes existing master records | New versions through the owner's Maintain operation, starting today or later (structure-and-masters 2.2) | An edit of a version in force; a back-dated version; stock, money or a tax document | `organisation`, `merchandise` (stage 1) |
| Opening balance | Brings a unit's opening stock, dues, advances and deposits at its switch (section 10) | A reviewed opening manifest and reviewed opening balances in the Store's opening record; at the switch, opening count movements and financial opening balances | A supplier delivery, booking, invoice, purchase liability or automatic journal for opening stock (`PRD-LIF-008`) | `site-lifecycle` (stage 4); a stage 1 test handler on synthetic data (section 12) |
| Historical reference | Keeps past or outside facts for reports and checks only, such as historical sales (`PRD-LIF-010`) and the earlier POS's daily sales report and SOH (`PRD-LIF-013`) | Reference records in the target's read model, keeping their source identities | Live stock, a receivable or a tax document (`PRD-IMP-010`); any stock movement (`PRD-LIF-014`); a sale or a tax invoice for an externally issued bill (`PRD-LIF-016`) | `ebo-imports` for earlier-POS imports (stage 2); `site-lifecycle` for historical sales (module-map 11.1) |
| Transaction | Brings documents from an outside system that have their own effect under the owner's rules | What the owner's rules allow: a draft PT revision from a supplier file (stage 2), an EBO report applied once (stage 4, `PRD-EBO-005`), bank statement lines (stage 5) | Anything the owner's own workflow would not create; an official PT without PT approval (`PRD-REC-017`) | `merchandise` · PT, `ebo-imports`, `finance` · operations |

- Opening balances, historical reference and live corrections stay distinct (`PRD-LIF-011`). A correction found after a unit's cutover is a live correction in the owning module, such as a count difference or a journal; it is never a new opening batch (10.5).
- "Analytical-history import" in `PRD-IMP-010` means the historical-reference kind here. **Design choice.**

### 4.2 How the kind is enforced
<!-- deps: PRD-IMP-010, PRD-LIF-014, PRD-SEC-017, PRD-MOD-002 — guards that keep a batch inside its kind -->

- A handler registers the kinds it accepts and the effects it may have: none, master records, stock, money (13.2). Start an import refuses a kind the target's handler does not accept. **Design choice.**
- The source reference a handler passes to the stock ledger or to Post in `finance` · books carries the batch kind. **Proposed** for the stock-ledger and books designs: both refuse a source whose kind is historical reference, as a last guard behind the handler's own rule (`PRD-LIF-014`, `PRD-IMP-010`).
- An opening-balance batch publishes only where the operation is available: policy 14 Signed and its real values validated (`PRD-SEC-017`; module-map 4.4), on production hosting, at the Store's approved switch (`POL-14.07`, `PRD-LIF-026`). On `dev`, with synthetic data, the path runs under the synthetic-data banner (DEC-071).
- Test 18 of section 17 proves that a historical-reference load leaves every stock quantity and value unchanged, the stage 2 exit check of [phases.md](../../phases.md), rehearsed in stage 1 on synthetic data.

## 5. Where each value came from
<!-- deps: PRD-IMP-006, PRD-IMP-008, PRD-IMP-009, PRD-SEC-003, PRD-SEC-004, DEC-105 — origin of every staged value -->

Every staged value carries one origin (`PRD-IMP-006`):

| Origin | Meaning | Kept with it |
| --- | --- | --- |
| Supplied | Read from a cell of the file, after only the transforms the mapping names: trim, type, date format, decimal to paise, sign | Sheet, row, column, raw value, cell type and displayed text |
| Calculated | Worked out by a named deterministic function from other values, such as several columns joined or summed (6.2). Money and tax arithmetic uses `packages/calculations` ([shared-calculations.md](../calculations/shared-calculations.md)) | The function, its version and its inputs |
| Mapped | Turned into an approved value by a confirmed mapping rule (6.3) | The mapping rule version and the original word |
| AI suggestion | A draft from the AI gateway (stage 2 onwards) | The AI request record (`PRD-SEC-002`) |
| Entered by a person | Typed by a person, or chosen by a person from a suggestion | Who, when, the reason, and the suggestion it came from |

- **Entered by a person** is the fifth origin. **Design choice:** `PRD-IMP-009` asks for manual selection, and the PT grid already shows "typed" as an origin ([design-language.md](../ui/design-language.md) 10.10).
- The original cell is never overwritten. A calculated value never replaces a supplied one: both are kept, and a disagreement is a row issue (section 8). In the KDPS template, BASIC, P RATE and MARGIN may each be supplied, calculated or both ([pt-file-layouts.md](../../data-notes/pt-file-layouts.md) 1.6, 1.7).
- **Suggestions.** Exact or close matches are offered for manual selection. The target module's handler finds them in its own records (13.2): a code through `merchandise` Resolve a code, a word through trigram search over the approved vocabulary (PRD Stack: Search). `files-imports` sits at tier 1 and never calls those modules itself (module-map section 3). Identity and commercial facts are never filled from a suggestion nobody accepted (`PRD-IMP-009`). A word matched by a confirmed mapping rule is Mapped, not a suggestion.
- A word with no confirmed rule stays as its source word, its target is Unknown, and anything that needs it is blocked. An unapproved mapping proposal changes no operational data (`PRD-IMP-008`).
- **AI in stage 1:** none. Stage 1 imports use the manual route only (DEC-105, module-map MM-14). From stage 2 an AI draft enters only as AI-suggestion values that a person must accept, and AI never posts stock, money or tax (`PRD-SEC-003`, `PRD-SEC-004`).
- Every published record keeps the batch, document and staged row it came from. The audit record's source names the import batch and row ([numbering-and-audit.md](numbering-and-audit.md) 4.1).

## 6. Layouts, mappings and mapping rules

### 6.1 Layouts
<!-- deps: PRD-IMP-003, PRD-IMP-004, PRD-MOD-010 — what a layout version records -->

- A layout has a code unique in the Organisation, a source (a supplier, a brand, an earlier-POS Store report, a bank, or the Organisation's own template), a document type and the kinds it serves. Its content lives in versions (`PRD-IMP-003`).
- A layout version records the structure, never data:
  - the container format and sheet selector, by name, with names trimmed and spaces collapsed;
  - the header row or rows, or a positional layout for a sheet without one; the data start row; a leading-column offset as a hint only;
  - every column: its header name, its type, its accepted formats, and whether it is required, mapped or explicitly ignored;
  - fixed cells that hold document-level values, such as an invoice number in one cell above the table;
  - the structure rules of 6.6;
  - whether zero rows are present, and how control totals appear;
  - which columns form the document reference and the scope of its source identity (7.1);
  - the restricted field class of each column (section 11).
- A version is never edited. A change is a new version; each batch keeps the version it used (`PRD-IMP-003`, `PRD-MOD-010`).

### 6.2 Mappings
<!-- deps: PRD-IMP-003, PRD-IMP-006, PRD-MOD-014, PRD-MOD-015 — what a mapping version records -->

- A mapping fills one target's fields from one layout version. Its versions record, for each target field: the source column or fixed cell, or a set of them; the transform; and the mapping rules that apply to it (`PRD-IMP-003`).
- A set of columns becomes one value only through a named calculation, such as an invoice prefix joined to its number, or CGST plus SGST percentages summed into one rate; the value's origin is Calculated (section 5).
- Money becomes integer paise by exact decimal arithmetic (`PRD-MOD-014`). A spreadsheet number is a binary floating-point value; it is read as the shortest decimal that reproduces it. **Design choice.** A value with more decimals than paise is flagged, and it gets a paise value only from the named rounding rule that the mapping names for that column; until a rule is named it stays Unknown (`PRD-MOD-015`; class C-2 in 8.3). Which rule each money column uses is OPEN (GC6-13).
- A target field the mapping does not fill stays Unknown. Nothing gets a default (`PRD-MOD-015`).

### 6.3 Mapping rules
<!-- deps: PRD-IMP-003, PRD-IMP-008, PRD-MER-007, POL-02.07 — source words to approved values -->

- A mapping rule turns one source word into one approved value for one attribute, in one scope: a layout, a supplier, a brand or the whole Organisation. The target is an identifier: a vocabulary value, brand, size, category or party of `merchandise`, a Site, Store or business unit of `organisation`, or a line class (6.8). The module that owns the target checks it through its handler (13.2). Rules are versioned with validity dates (`PRD-IMP-003`).
- Matching compares the word after trimming and collapsing spaces; whether case matters is part of the rule. The original word is always kept beside the value (`PRD-IMP-003`).
- Two rules in force for the same attribute, scope and word with different targets are refused when the second is confirmed. A layout-scope rule wins over any wider rule, since it belongs to one file structure. Rules of the supplier, brand and Organisation scopes that match one word with different targets make the word ambiguous: it is not mapped, and the row issue names the rules. **Design choice**, in the spirit of `PRD-MER-007` and the external-code rule of structure-and-masters 4.3.
- Source-to-Store maps are mapping rules: a bill-series prefix such as `DEO`, a `Store Name` value, a dealer-site tag, a file-name tag ([stores-and-codes.md](../../data-notes/stores-and-codes.md) 3.1 to 3.4). A file name or title is a claim shown to the reviewer; it maps a Store only through a confirmed rule.
- KDPS's seed lists ([item-master-vocabulary.md](../../data-notes/item-master-vocabulary.md) 1) enter as proposals through a create batch, never as approved values (structure-and-masters 4.2, `PRD-MER-013`).
- The `Color` tags `PREMIUM`, `MEDIUM`, `ECONOMY` and `ASSO.` stay source words. No rule writes them to colour until the product owner decides how the product treats them (OPEN, parked by the product owner; class E-1).

### 6.4 Proposal and confirmation
<!-- deps: PRD-IMP-008, POL-02.07, POL-02.08, PRD-LIF-013, PRD-EBO-001 — who confirms a layout, mapping or mapping rule -->

- A mapping rule is proposed, then confirmed by a different person from its proposer. An unconfirmed proposal changes no operational data (`PRD-IMP-008`, `POL-02.07`, `POL-02.08`).
- **Proposed** (GC6-4): layout and mapping versions follow the same rule, reading "mapping rules" in `PRD-IMP-008` as covering them. The PRD already asks for "saved approved layouts" for earlier-POS and EBO imports (`PRD-LIF-013`, `PRD-EBO-001`).
- States are those of a proposal: Proposed, Confirmed, Rejected (DM-4, DEC-105). A confirmation is a decision in `access` under the approval rule for mapping-rule confirmation (access-and-approvals section 8), and emits `files-imports.mapping-confirmed`.
- A staged batch may use a Proposed layout and mapping to show its preview. Publishing needs Confirmed versions. **Design choice.**

### 6.5 Detecting a layout
<!-- deps: PRD-IMP-004 — layout detection from structure -->

- Detection compares the grid with each layout version's structure: the sheet, the header names at their row, the required columns, the column count and the distinctive names. A version is compatible only when every required column is found (`PRD-IMP-004`).
- A source hint (the supplier or brand the uploader names, or a word in the file name) narrows the candidates and orders them. It never selects a version that is not compatible (`PRD-IMP-004`).
- One compatible version: it is proposed, and the preparer confirms it. Several: the preparer chooses. None: the preparer proposes a new layout version (6.4). **Design choice.**
- From the sample files, families F2 to F6 and the Peter England CSV can be told apart by their header names; F1, F9 and the headerless CSV need a layout per source ([pt-file-layouts.md](../../data-notes/pt-file-layouts.md) 3). Earlier-POS layouts differ by Store and report, so a layout is per Store and per report ([pos-exports.md](../../data-notes/pos-exports.md) 5.4). KDPS Owner question 57 asks whether the earlier POS can give one fixed daily export per Store instead.

### 6.6 Structure rules a layout can state
<!-- deps: PRD-IMP-002, PRD-IMP-005, PRD-IMP-007, PRD-IMP-009, PRD-IMP-013 — rules for headers, rows, bills and totals -->

Each rule below is a field of the layout version, so the same file always reads the same way. The class codes are those of [data-quality-and-import-rules.md](../../data-notes/data-quality-and-import-rules.md); section 8 lists them all.

- **Headers.** The header row is recorded; a two-row header joins its rows into one name per column; a sheet with no header has a positional layout that a person confirms, and its first row is never taken as a header (A-2, A-5). Columns are found by name; an offset is only a hint (A-3).
- **Every column accounted for.** A column with no header text is mapped or explicitly ignored in the layout. A column the layout does not know makes the layout incompatible (A-4; `PRD-IMP-007`).
- **Every row read.** Hidden sheets, hidden rows and rows hidden by a filter are read like any other and shown to the reviewer (A-7). Only the sheets the layout names are imported; the others are listed with their row counts (A-8).
- **Row roles.** A row is data only when the layout's key columns are filled. Other rows are header, total, filler, note or ignored, and each is counted (A-10, G-1). A free-text note row is shown to the reviewer.
- **Control totals.** A total row is parsed as a control total and compared with the sum of the lines; it is never imported as a line (G-1, K-1; `PRD-IMP-013`).
- **Bill-level fields.** Where a report prints bill fields on a bill's first line only, a line belongs to the nearest bill header above it, inside the same file. A line with no header above it is refused with the correction needed; no date, bill number or tender is filled from neighbouring lines (H-1; `PRD-IMP-009`). In the repeat variant the date and bill number are read from each line ([pos-export-layouts.json](../../data-notes/pos-export-layouts.json): `bill_level_fields_on_first_line_only`, `bill_fields_repeated_on_every_line`). Two header lines for one bill number are reported (H-10).
- **Brand cuts.** A file that holds one brand's lines of whole bills is detected, by a filter on brand or by bill totals that do not add up; its bills are marked partial, and tenders are not reconciled against them (H-2).
- **Signs.** Each signed column states its convention; one value is never recomputed from another (H-6).
- **Zero rows.** The layout says whether zero-quantity rows are listed. A barcode missing from a file that lists only positive rows is "not listed", not zero (I-1). Whether "not listed" may be read as zero is OPEN (GC6-16).
- **Documents in one file.** Rows are grouped into documents by the document-reference columns. A file that holds several invoices or bills becomes several documents ([pt-file-layouts.md](../../data-notes/pt-file-layouts.md) 5). Rows for other customers, as in the Madura extract, stay in the stored original; whether they are staged at all is OPEN (GC6-12).

### 6.7 From the sample layout files to layout records
<!-- deps: PRD-IMP-003, PRD-IMP-008, PRD-LIF-013 — how pt-layouts.json and pos-export-layouts.json become layout versions -->

[pt-layouts.json](../../data-notes/pt-layouts.json) holds 37 entries: 35 vendor layouts in nine families and two variants of KDPS's own template. [pos-export-layouts.json](../../data-notes/pos-export-layouts.json) holds 29 sales, stock, store-workbook, brand-report and debit-note layouts. Both are an analyst's reading of KDPS's files, not KDPS decisions.

- A loader turns each entry into a **Proposed** layout version and a **Proposed** mapping. It runs only when an Admin of an Organisation chooses to run it, and nothing it loads is Confirmed or used as a default. A person checks each proposal against a sample file before it is confirmed under 6.4; who may confirm a layout or mapping version is GC6-4. **Design choice** of the loader only.
- Field by field:

| Field in the notes | Becomes |
| --- | --- |
| `id`, `name`, `family`, `kind` | Layout code, name, family and source kind |
| `real_format`, `sheet` | Container format and sheet selector (section 9) |
| `header_row`, `header_rows`, `data_starts_row`, `leading_blank_column` | Header rows, data start, offset hint; `null` header means a positional layout (A-5) |
| `columns` (PT: standard field to header; POS: name, meaning, type, notes) | Column list and mapping. A list as a value is a set of columns joined by a named calculation (6.2); a value such as `[cell K10]` is a fixed cell |
| `unmapped_columns` | Columns explicitly ignored (A-4) |
| `skip_rows_matching`, `total_rows` | Row-role rules and the control-total rule, rewritten as structure (key columns empty), not as row numbers |
| `bill_level_fields_on_first_line_only`, `bill_fields_repeated_on_every_line` | Bill-level field rule (6.6) |
| `barcode` (kind, length, valid EAN-13) | Expected identifier class, used only to flag (D-1) |
| `document_refs` | Document-reference columns or cells (7.1) |
| `quirks`, `difficulty`, `note`, `row_meaning`, `producer_guess` | Notes shown to the reviewer; never rules |

- The 30 standard fields of `pt-layouts.json` are an intermediate vocabulary for vendor PT files. The PT fields they map to belong to the stage 2 PT design (section 12).
- Formulas found in KDPS's sheets, such as P RATE as BASIC times 1.2 or the tax by item word, are never loaded as rules. Only values are imported (J-2; `POL-03.07`, `POL-10.02`).
- Which layouts stage 1 builds and proves first is OPEN (GC6-1).

### 6.8 Earlier-POS sales lines: sales, returns and transfers
<!-- deps: PRD-LIF-013, PRD-LIF-014, PRD-LIF-016, PRD-TRF-003, PRD-IMP-009 — classifying earlier-POS lines in side-by-side imports -->

The earlier POS's daily sales report is a historical-reference import (4.1). Nothing in it moves stock (`PRD-LIF-014`) or makes a sale or a tax invoice (`PRD-LIF-016`). Its lines still need a class so that comparison reports do not count a transfer as a sale.

- Each line gets a line class: sale, return, transfer keyed as a sale, or unclassified.
- A negative-quantity line is a return line of the same bill. No link to an original bill is inferred, because no field gives it (H-5; `PRD-IMP-009`).
- A transfer keyed as a sale is recognised only by a confirmed mapping rule with the line class as its target: a reason text such as `Stock Transferr` or `STOCK TRANSFER TO …`, or a bill-series pattern such as the zero-tender `S-` series ([transfers.md](../../data-notes/transfers.md) 3.3; [store-close-cash-and-bank.md](../../data-notes/store-close-cash-and-bank.md) 2). Which texts and series these are is KDPS's answer: OPEN (GC6-14).
- A line so classed is reported apart: never in sales totals, never a transfer document of the app, and no destination is inferred from free text. Any tender recorded on it is shown as reported. The PRD keeps transfers and sales distinct (`PRD-TRF-003`).
- A zero-tender line that no rule classifies is flagged and counted apart. It is never guessed.
- Carry bags and free gifts stay sales lines, and reports can leave them out by item; how they are classed in the masters is OPEN (KDPS Owner, Accounts; E-7, H-7).
- The Store of each bill comes from a confirmed source-to-Store rule on its bill-series prefix (6.3). A bill whose series maps to no Store blocks its document.

## 7. Duplicates, conflicts and corrections

### 7.1 Source identity
<!-- deps: PRD-IMP-011, PRD-INT-002 — the identity of an imported document -->

- Each document has a source identity: the target, a scope key and the document reference. The layout names the reference columns or cells; the handler names the scope (13.2). **Design choice.**

| Source | Scope | Document reference |
| --- | --- | --- |
| Earlier-POS bill | Store, from the confirmed series rule | Series as printed and bill number (H-10) |
| Earlier-POS SOH or daily report file | Store and report kind | Business date or date range |
| Supplier PT file (stage 2) | Supplier party | Invoice number; invoice numbers repeat across suppliers ([prd-fit.md](../../data-notes/prd-fit.md) 2.19) |
| Master create or update | Target record type | Business code of the record |
| Opening balance | Business unit and opening kind | The Store's switch record |

- A document with no reference cannot be published as a transaction or opening-balance document until a person enters the reference from evidence, with the origin Entered by a person (section 5). Six of the sample PT files have no invoice number ([pt-file-layouts.md](../../data-notes/pt-file-layouts.md) 4).
- The source identity is the idempotency key of publishing (module-map 6.2 flow B; stock-ledger 10.1; `PRD-INT-002`).

### 7.2 Same file, same document, changed document
<!-- deps: PRD-IMP-011, PRD-IMP-013, PRD-INT-002, PRD-INT-005, POL-03.02 — duplicate and conflict control -->

- **Same file.** A file whose content hash is already stored is linked to the stored copy, and the earlier batches that read it are shown. It starts a new batch for the same target and layout only if every earlier such batch Failed; one workbook may still feed two batches, such as its sales sheet and its stock sheet. **Design choice.**
- **Same document, same content.** A document whose source identity and content were already published is a duplicate. It has no effect; the outcome counts its quantities and values as duplicate (`PRD-IMP-011`, `PRD-IMP-013`).
- **Same identity, different content.** A conflict. It is refused, unless the handler supports a governed revision and the reviewer chooses one (7.3) (`PRD-IMP-011`).
- **Checked three times.** At the start, for the document reference the uploader claims: a published source identity is refused there unless the batch is a governed revision of it (13.1). At validation, for each document the file holds; one already published with the same content is counted as a duplicate. And again under the lock at publishing. A unique index on the source identity of published documents is the last guard, so two publishes at once give one effect (`PRD-INT-002`, `PRD-INT-005`; domain-model invariant 20).
- **Overlapping exports.** Bills that appear in an earlier and a later export are duplicates when their content agrees. A bill present in one export and absent from a later export of the same period is listed for review and never dropped silently (H-10).
- **Stale copies.** A file whose content equals the last accepted file of the same layout and Store under a new period is flagged as a possible stale copy (I-4).
- **Two sheets with the same keys.** Only the sheet the layout names is imported; the other is compared and the differences shown. An import never overwrites approved data silently (I-2; `POL-03.02`).
- **Retries.** An adapter that sends the same request again gets the first result (`PRD-INT-002`).

### 7.3 Corrections and governed revisions
<!-- deps: PRD-IMP-011, PRD-IMP-013, PRD-ACP-012, PRD-MOD-011 — correcting an imported document -->

- A published document is never edited (`PRD-MOD-011`). A correction is a new batch whose document names the one it revises.
- A governed revision publishes once: the handler reverses the earlier document's effects and posts the new ones in one transaction, as stock-ledger 10.1 says (`PRD-IMP-011`, `PRD-ACP-012`). Each handler declares whether it supports revisions and what reversing means for its records.
- The original stored file, its staged rows, its outcome and every downstream link stay, and the revision links to them (`PRD-IMP-013`).
- For a master, a correction is simply a new version (structure-and-masters 2.2). For a historical-reference document, the revision replaces the reference set as its current version and keeps the earlier one. **Design choice.**

### 7.4 Reconciling an import
<!-- deps: PRD-IMP-012, PRD-IMP-013, PRD-EBO-004 — the counts and values an outcome keeps -->

- Every outcome holds, per document and for the batch: rows read; rows ignored as header, total, filler or note; quantities and values accepted, rejected, pending and duplicate; control totals reported by the file, summed from the lines, and accepted (`PRD-IMP-013`).
- The counts close: rows read equal rows ignored plus rows accepted, rejected, pending and duplicate. A batch whose counts do not close cannot be published. **Design choice.**
- A total the source reports is kept apart from what the app verified (`PRD-EBO-004`).
- An outcome is written for every publish attempt, including one that failed (`PRD-IMP-012`).

## 8. The validation report

### 8.1 What it holds
<!-- deps: PRD-IMP-005, PRD-IMP-007, PRD-IMP-013 — contents of the validation report -->

One report per batch, split by document and by Store where the documents name Stores ([data-quality-and-import-rules.md](../../data-notes/data-quality-and-import-rules.md) 9):

- the real format found, the sheets read and ignored with their row counts, the header row and offset, and the choice recorded for each unlabelled column;
- hidden sheets, hidden rows and active filters;
- rows read, ignored, refused and flagged, each with its reason;
- control totals found against the sums of the lines;
- dates outside the file's period, dates that contradict their order, and a period claimed in a title or file name against the data;
- barcode classes, rounded barcodes, and barcodes with two prices in one snapshot;
- source words with no confirmed rule, per column;
- bills with no header, with two headers, partial bills, header totals against lines, zero-tender bills;
- bills seen in an earlier file and missing now, overlapping bills, duplicates and conflicts of identity;
- accepted, rejected, pending and duplicate quantities and values (`PRD-IMP-013`);
- the fields masked or left out (section 11).

### 8.2 Row issues and severities
<!-- deps: PRD-IMP-007, PRD-MOD-015 — the shape of a row issue -->

- A row issue holds: its class (8.3), its severity, its place (file, sheet, document, row, column), the original value, what is wrong, the correction needed, and the rule it applies (`PRD-IMP-007`).
- **Blocking**: the row, or the document it belongs to, cannot be published until corrected. **Warning**: publishable once the person who submits or approves the batch marks it seen; marking is recorded and may cover all issues of one class in one action. **Note**: information. **Design choice**, including the severity each class gets below.
- A required field that is missing, unreadable or of the wrong type is Blocking. Unknown is never read as zero (`PRD-MOD-015`).
- A correction is made in the source file and the file uploaded again, or entered in the staged row by a person (section 5). The original cell stays.

### 8.3 The 60 problem classes
<!-- deps: PRD-IMP-001, PRD-IMP-002, PRD-IMP-007, PRD-IMP-009, PRD-IMP-011, PRD-MER-005, PRD-MER-007, PRD-MOD-014, PRD-MOD-015, PRD-SEC-011, PRD-LIF-006, PRD-LIF-008, PRD-LIF-014, POL-03.02 — the data-quality classes as validation checks -->

The 60 classes of [data-quality-and-import-rules.md](../../data-notes/data-quality-and-import-rules.md) sections 2 to 7, each with its check. An OPEN answer belongs to the owner named there and in its open questions.

| Class | Check here | Severity | IDs |
| --- | --- | --- | --- |
| A-1 Extension lies; unusual format | Format from content (9.2); real format reported; an unreadable file refused with its error | Note; Blocking if unreadable | `PRD-IMP-001`, `PRD-SEC-011` |
| A-2 Header not on row 1 | Header row from the layout; names found by name | Blocking if not found | `PRD-IMP-004` |
| A-3 Leading blank column | Map by name; offset a hint | Note | `PRD-IMP-004` |
| A-4 Unlabelled columns | Each mapped or ignored in the layout | Blocking if unknown | `PRD-IMP-006` |
| A-5 No header row | Confirmed positional layout only | Blocking without one | `PRD-IMP-008` |
| A-6 Merged titles | Not data; shown as claims | Note | `PRD-IMP-002` |
| A-7 Hidden sheets, rows, filters | Every row read; hidden items shown. Deliberate exclusion OPEN (KDPS Owner) | Warning | `PRD-IMP-005` |
| A-8 Leftover sheets, pivots | Only named sheets; others listed | Note | `PRD-IMP-002` |
| A-9 External links | File refused (9.3, GC6-3) | Blocking | `PRD-SEC-011` |
| A-10 Formulas, filler rows | Cached values only; data rows by key columns; filler counted | Note | `PRD-IMP-013` |
| A-11 Unreadable cell | Raw value kept; cell reported | Warning; Blocking if required | `PRD-IMP-007` |
| A-12 Stray spaces | Trim and collapse to match; original kept | Note | `PRD-IMP-002` |
| B-1 Mon-YY season read as a date | Never a date; season Unknown, selected explicitly and audited; the decode offered as a suggestion. Meaning OPEN (KDPS Owner) | Warning | `PRD-LIF-006`, `PRD-IMP-009` |
| B-2 Full dates in season | As B-1. Meaning OPEN (KDPS Owner) | Warning | `PRD-MER-004` |
| B-3 Design number read as a date | Kept; cannot identify a style | Warning; Blocking for identity | `PRD-IMP-007` |
| B-4 Day and month swapped | One format per column; contradictions with the order of bills reported; never repaired. Correction OPEN (Accounts) | Warning | `PRD-IMP-007` |
| B-5 Text dates in many formats | Accepted formats per column; others stay text; `Not Disclosed Yet.` is no date | Warning; Blocking if required | `PRD-MOD-015` |
| B-6 Excel serial numbers | Converted by the workbook's date system; original kept | Note | `PRD-IMP-002` |
| B-7 Dates after the file's period | Reported | Warning | `PRD-IMP-007` |
| B-8 Title period against data | Claim compared with the data; mismatch shown | Warning | `PRD-IMP-007` |
| B-9 No time of day | Order inside a day by bill serial | Note | `PRD-MOD-009` |
| C-1 Text in a number column | Error for that field; kept as text; never zero | Blocking if required; else Warning | `PRD-MOD-015` |
| C-2 Money precision | Exact decimals to paise; more precision than paise flagged (6.2). Wider tolerance OPEN (Accounts) | Warning | `PRD-MOD-014` |
| D-1 Barcode classes mixed | Class stored per row; failing check digit flagged, not refused. In-house acceptance OPEN (KDPS Owner) | Warning | `PRD-MER-006` |
| D-2 Identifiers held as numbers | Read as text where text; digits as printed; lengths outside the class list flagged | Warning | `PRD-MER-007` |
| D-3 Rounded barcodes | "Rounded, cannot identify"; never matched by barcode; design and size offered as a suggestion. Barcodes exported as text OPEN (KDPS Owner) | Blocking for identity | `PRD-IMP-009` |
| D-4 Barcode not unique | The line is the unit; each line's price its own; two MRPs in one snapshot is a conflict | Warning | `PRD-MER-009` |
| D-5 Labels in an identity column | Source word kept; a document label is not a document number | Warning | `PRD-IMP-007` |
| D-6 Invoice or bill numbers mangled | Text; a date or float flagged; a reused number with other content is a conflict | Blocking for identity | `PRD-IMP-011` |
| E-1 `Color` holds tags | Source word kept; colour only through a confirmed rule. Treatment OPEN (product owner) | Warning | `PRD-IMP-008` |
| E-2 `Size` holds packs and measures | Size as text; blank stays Unknown, never Free Size | Warning | `PRD-MER-005` |
| E-3 `Fit` codes and typos | Source word; confirmed vocabulary first. Meaning OPEN (KDPS Owner) | Warning | `PRD-IMP-008` |
| E-4 Category words and codes | As E-3; a first-line-only category is never copied to other lines | Warning | `PRD-IMP-009` |
| E-5 Gender spellings | Source word; normalised value proposed for confirmation | Warning | `PRD-IMP-003` |
| E-6 Season formats | Source text; season from its vocabulary or explicit Unknown. Meaning OPEN (KDPS Owner) | Warning | `PRD-LIF-006` |
| E-7 Gift and promotional items | Imported as they are; reports can show them apart. Class OPEN (KDPS Owner) | Note | `PRD-IMP-010` |
| E-8 `Supplier` names KDPS itself | Source word; not a supplier relationship | Note | `PRD-LIF-008` |
| F-1 Brand spellings and codes | Original word and a proposed brand; close matches offered. Roll-up OPEN (KDPS Owner) | Warning | `PRD-IMP-008`, `PRD-IMP-009` |
| F-2 Party legal names | As F-1, for parties. Same-party question OPEN (KDPS Owner, CA) | Warning | `PRD-IMP-008` |
| F-3 Item, Store and sheet names | As F-1; a Store is found by a confirmed rule, never by name | Warning | `PRD-IMP-003` |
| G-1 Total, filler and note rows | Row roles; control totals compared; never lines | Note | `PRD-IMP-005` |
| H-1 Bill fields on the first line; orphans | Nearest header in the same file; orphan refused | Blocking for the orphan | `PRD-IMP-009` |
| H-2 Brand-cut bills | Marked partial; no tender reconciliation. Whole-store export OPEN (KDPS Owner) | Warning | `PRD-IMP-013` |
| H-3 Bill amount against lines | Both kept; differences reported. Which is right OPEN (Accounts, CA) | Warning | `PRD-IMP-007` |
| H-4 Zero-value bills | Kept; zero-tender bills with value reported. Meaning OPEN (KDPS Owner) | Warning | `PRD-IMP-007` |
| H-5 Returns with no link | Return line of the same bill; no original bill inferred. Whether the earlier POS can give the link OPEN (KDPS Owner) | Note | `PRD-IMP-009` |
| H-6 Discount fields disagree | Both kept with the layout's sign; never recomputed. Reporting of amount-only discounts OPEN (product owner) | Warning | `PRD-IMP-007` |
| H-7 Carry bags and gifts as lines | Sales lines; reports can leave them out by item. Class OPEN (KDPS Owner, Accounts) | Note | `PRD-IMP-010` |
| H-8 Tender columns | As given; `Card` not mapped to a tender type. Whether it holds UPI OPEN (Accounts, CA) | Warning | `PRD-IMP-009` |
| H-9 Customer and phone | Section 11; on the test setup not kept until question 37 is answered | Note | `PRD-SEC-010` |
| H-10 Overlapping exports; missing bill | Identity by series and number; missing bills listed. Whether the POS can remove a bill OPEN (KDPS Owner) | Warning | `PRD-IMP-011` |
| I-1 Zero rows kept or not | Layout says; "not listed" is not zero (GC6-16) | Note | `PRD-LIF-014` |
| I-2 Two sheets disagree | One sheet imported; the other compared | Warning | `POL-03.02` |
| I-3 Cost above MRP; MRP missing | Reported; not corrected | Warning | `PRD-IMP-007` |
| I-4 Copies and stale sheets | Compared with the last accepted file | Warning | `PRD-IMP-011` |
| I-5 Stock-in lines with no document | Inward with no source document; never stock | Note | `PRD-LIF-008` |
| J-1 Error values in cells | A missing value, not zero, not text | Blocking if required; else Warning | `PRD-MOD-015` |
| J-2 Formula drift between copies | Values only, never rules; differing copies reported. Which is right OPEN (KDPS Owner, CA, product owner) | Note | `PRD-IMP-006` |
| K-1 Totals that do not reconcile | Control totals compared; differences reported, not fixed | Warning | `PRD-IMP-013` |
| L-1 Personal and restricted values | Masked or left out (section 11) | Note | `PRD-SEC-006` |

## 9. Format readers

### 9.1 The neutral grid
<!-- deps: PRD-IMP-002, PRD-SEC-011 — the reader output every format shares -->

Every reader produces the same grid, so detection, mapping and validation never depend on the format. **Design choice.**

- Sheets with their names, order and hidden state; merged ranges; active filters and the rows they hide; hidden rows and columns.
- Cells with their raw value, cell type (text, number, date, boolean, error, empty), displayed text where the format gives it, and, for a formula, its cached value only (A-10).
- Error values such as `#N/A` or `#REF!` as errors, never as text or zero (J-1).
- Notes for anything the reader skipped or could not read, cell by cell (A-11). One bad cell never stops the file.

### 9.2 Formats and readers
<!-- deps: PRD-IMP-001, PRD-SEC-003, DEC-105 — which reader handles which format and layout family -->

The format is found from the content (container signature and structure), never from the file extension (A-1). PRD Stack: Documents names ExcelJS for supported Excel operations, format-specific import adapters and PDF extraction.

| Format | Found by | Reader | Sample families and files | Stage |
| --- | --- | --- | --- | --- |
| XLSX (OOXML) | Zip container with a workbook part | ExcelJS | KDPS template; F1 to F5 and F7; F8 `BLACKBERRY`; F9 `XERICS`; `TWILLS.xls`; every earlier-POS export; the DSR workbook | 1 |
| XLS (BIFF in OLE2) | OLE2 container with a workbook stream | **Proposed**: a library that reads BIFF; ExcelJS does not (GC6-2) | F1 `SUVIDHI`, `FAHRENHEIT`; F6 Jockey; F9 `ambreli`; `AS INNERWEAR.csv` | 1 (needed by stage 2) |
| XLSB | Zip container with binary workbook parts | **Proposed**: the same library as XLS (GC6-2) | F8 Madura | 1 (needed by stage 2) |
| CSV | Plain text | **Proposed**: ExcelJS's CSV reader or a streaming CSV parser; delimiter, quoting, encoding and header row are layout fields (GC6-2) | F8 Peter England (padded fields); F9 `USPOLO` (no header) | 1 |
| PDF | PDF signature | Stored as evidence in stage 1; values entered by a person against the stored file. **Proposed**: text extraction for PDFs with a text layer in stage 2 (GC6-2) | Supplier ledger PDFs; the image-only invoice `VSN DEO DA-26-27-0119.pdf` | 1 (store); 2 (extract) |
| Photograph (JPEG, PNG) | Image signature | Stored as evidence; values entered by a person. Other image formats OPEN (GC6-2) | Challans, gate passes, store notes | 1 (store) |

- Stage 1 imports use the manual route only (DEC-105). An image or a PDF without a text layer is read by a person, who enters the values with the file shown beside them. AI drafts arrive with the AI gateway in stage 2, and the manual route stays (`PRD-SEC-003`).
- `PRD-IMP-001` asks for brand PT files in XLSX, XLS, XLSB and CSV. All four readers are built in stage 1, so the sample layouts can be proved before stage 2. **Proposed.**

### 9.3 Safety at intake
<!-- deps: PRD-SEC-011, PRD-SEC-014 — what intake refuses -->

- Intake refuses, before anything is stored: a type not allowed; a file over the size limit; a container that expands past its limit; content that holds macros, active scripts or embedded objects; and content that holds external links (module-map 4.7; `PRD-SEC-011`). No link is approved in stage 1. Whether a workbook link is instead stripped, with its cached values read and the link reported (A-9), is GC6-3.
- The size and expansion limits are deployment settings with no value fixed here (GC6-5).
- A refusal names its reason. Logs carry the file's hash and size, never its content (`PRD-SEC-014`).

### 9.4 Size and speed
<!-- deps: PRD-PRF-001, PRD-PRF-003 — reading large files -->

- Readers stream rows where the format allows, and staging writes rows in sets.
- The Madura extract holds 113,983 rows for 176 customers, about eleven times the PRD's 10,000-line reference import ([prd-fit.md](../../data-notes/prd-fit.md) 2.19). It is measured as a stress case (`PRD-PRF-001`). Whether rows for other customers are staged is GC6-12.
- Store stock files of 17,000 to 33,000 barcode rows are inside the reference workload.

## 10. Opening data

### 10.1 When opening data loads
<!-- deps: POL-14.07, PRD-LIF-003, PRD-LIF-011, PRD-LIF-026, DEC-013, DEC-071 — the stage of each opening step -->

- **Stage 1.** The opening layouts, their staging and validation, and the reconciliation tools are built and tested with labelled sample data (`POL-14.07`, DEC-013). No real opening data is loaded.
- **At each Store's switch** (stage 4, production hosting only): real opening stock and balances are loaded at the Store's approved day-close switch (`POL-14.07`, `PRD-LIF-026`). The switch flow itself is the stage 4 `site-lifecycle` design; [phases.md](../../phases.md), "Testing and switch-over", lists its steps.
- **On `kdps-test`**, publishing an opening batch is unavailable: policy 14 is not Signed (DEC-071), and no Store switches on test hosting (`PRD-LIF-026`). **Proposed** (GC6-8): staging and validating an opening batch there, as a rehearsal that never publishes.
- An empty stock-operating unit declares zero opening stock with a declaration, not a file. A non-stock office needs no stock opening (`PRD-LIF-003`).
- Each opening batch names the switch record and day-close cutover it belongs to. A new opening batch for a unit whose cutover is complete is refused; later corrections are live corrections in the owning module (`PRD-LIF-011`). **Design choice.**

### 10.2 Opening stock
<!-- deps: PRD-LIF-004, PRD-LIF-005, PRD-LIF-006, PRD-LIF-007, PRD-LIF-025, PRD-LIF-027, PRD-LIF-028, POL-14.02, POL-14.03, POL-14.04 — the opening manifest layout -->

`PRD-LIF-004` asks, for existing stock, for a reviewed manifest, physical verification, authorised variances, an opening PT and Site acceptance. The manifest is the import. The physical verification is the switch count, which is the stock module's count document, scanned in the app (stock-ledger 8.1 and section 9); it is never imported.

One manifest row is one SKU, or one source identity not yet resolved to a SKU, at one location of one business unit:

| Field | Rule | IDs |
| --- | --- | --- |
| Site, business unit, internal location | Resolved through confirmed rules to `organisation` records | `PRD-LIF-005`, `PRD-ORG-012` |
| Identity | Barcode or supplier code resolved by Resolve a code, or style, colour and size resolved to a SKU; else a product proposal, which must be confirmed first | `PRD-LIF-005`, `PRD-MER-013` |
| Quantity and unit | Whole number in the SKU's stock unit | `PRD-LIF-005`, `PRD-MER-010` |
| Batch and expiry | Only where the tracking profile requires them; missing values block the row | `PRD-MER-011` |
| Condition | As the stock ledger names conditions | stock-ledger 2.2 |
| Owner | The Organisation's legal entity, or a supplier or brand under its agreement. Operations verifies it | `POL-14.02`, `PRD-ORG-014` |
| Season | A season value, or Unknown selected explicitly by a person and audited. Unknown matches no season-specific offer and loosens no other requirement | `PRD-LIF-006`, `PRD-ACP-014` |
| Valuation evidence | A cost per unit with the evidence it rests on, or Unknown. What counts as evidence is OPEN (GC6-9). Accounts verifies values | `PRD-LIF-005`, `POL-14.03` |
| Source words | The earlier POS's item, brand, colour, size, design, season and supplier as given | `PRD-IMP-003` |

- Facts from KDPS's data the layout must handle ([prd-fit.md](../../data-notes/prd-fit.md) 3.1): no HSN in any earlier-POS export; a real colour on about 22% of rows; a usable season on about 59%; a `Supplier` field that names KDPS units, which is not a supplier relationship (E-8). Every opening SKU still needs its HSN before its Store can sell (shared-calculations 5.8).
- Whether the earlier POS's `Rate` may serve as valuation evidence, alone or with other evidence, is OPEN (GC6-9; Accounts question 19). KDPS's cost method is unknown (`POL-09.09`). Until Accounts and the CA answer, no value in a KDPS file is taken as evidence ([prd-fit.md](../../data-notes/prd-fit.md) 6).
- Piece IDs are never imported. At the switch count every piece of a piece-tracked profile with no piece ID is labelled and every piece ID verified; piece rules start from that count (`PRD-LIF-025`, `PRD-MER-017`).
- Billed-retained items carried across the switch are a separate section of the opening batch with their earlier-POS bill reference. They are not opening stock (`PRD-LIF-028`, `POL-14.04`, DEC-090).
- When a season is established later, the opening rows and every snapshot taken from them stay as they were; the change is a new style version (`PRD-LIF-007`; structure-and-masters 2.2).

### 10.3 Reconciling opening stock
<!-- deps: PRD-LIF-004, PRD-LIF-027, PRD-STK-014, POL-14.07 — the opening reconciliation tools -->

The reconciliation tools `POL-14.07` asks for are comparison runs (section 2), built in stage 1:

| Run | Left | Right | Key |
| --- | --- | --- | --- |
| Manifest against last SOH | The staged manifest | The earlier POS's last SOH, a historical-reference batch | Barcode, then SKU |
| Count against manifest | The switch count, from the stock module's read model | The staged manifest | SKU and location |
| Count against last SOH | The switch count | The earlier POS's last SOH | Barcode, then SKU |

- Every difference is listed and reported (`PRD-LIF-027`). None is closed by editing a number ([phases.md](../../phases.md), "Testing and switch-over"). Variances are authorised as `PRD-LIF-004` requires; who authorises them, and how, is the stage 4 switch design's, with KDPS Owner question 28.
- A counted row with no valuation evidence is not opening stock. It is held as excess, with owner, coverage and cost Unknown, until the evidence and an opening PT arrive (stock-ledger section 9; `PRD-STK-014`).
- A comparison run keeps both sides' batch versions and its result, and never changes either side. **Design choice.**

### 10.4 Opening dues, advances and deposits
<!-- deps: PRD-LIF-009, PRD-LIF-011, PRD-PAY-008, POL-14.03, POL-11.01 — layouts for financial opening balances -->

Each is its own layout and its own opening kind, imported separately (`PRD-LIF-009`). The fields below are **Proposed**, for Accounts and the CA to confirm (GC6-10):

| Opening kind | One row is |
| --- | --- |
| Supplier dues | One open supplier document: party, legal entity and book, document reference and date, original and open amounts, due date |
| Customer dues | One open customer amount: customer, document reference and date, open amount, due date |
| Advances given and received | One advance: party, purpose, amount, evidence |
| Deposits given and received | One deposit: party, agreement reference, amount, evidence |
| Outstanding commercial stock | Named by `PRD-LIF-009`; its fields are OPEN (GC6-10) |

- Every row carries the legal entity and book through a business unit's mapping (`PRD-ORG-005`), amounts in paise, and the cutoff date. Deposits and advances stay apart from expenses (`PRD-PAY-008`).
- Accounts verifies the values against the last closed books, with a reconciliation through the cutoff that prevents omissions and double counting (`POL-14.03`). A comparison run (section 2) compares each kind's totals per party and per account with the closed-books balances. The form of those balances, such as a Tally export, is OPEN (GC6-10).
- A row that is also open as a live document in the app is a double count and is Blocking (`PRD-LIF-011`).
- KDPS's data holds no advance or deposit, two dues sales, and supplier balances in two ledger PDFs, a tracker summary and Tally that disagree ([prd-fit.md](../../data-notes/prd-fit.md) 2.17). Opening dues come from the last closed books, not from these sheets.
- Financial opening balances post at the switch under a `site-lifecycle` posting event kind (books-and-posting 7.3), declared by the stage 4 design. Tally remains KDPS's official book (`POL-11.01`). Where the open items sit between the stage 4 switch and the stage 5 payables and receivables is GC6-11.
- Customer names on customer dues are personal data (section 11).

### 10.5 What opening data never does
<!-- deps: PRD-LIF-008, PRD-LIF-011, PRD-REC-008, PRD-ACP-014 — limits on opening batches -->

- Opening stock creates no supplier delivery, booking, invoice, purchase liability or automatic journal (`PRD-LIF-008`; books-and-posting 7.2).
- Only the switch count creates stock. A manifest, an SOH or an `Audit Diff` line never does (`PRD-REC-008`; I-5).
- Opening balances, historical reference and live corrections stay distinct (`PRD-LIF-011`; 4.1).
- A later correction cannot rewrite past bills or labels (`PRD-ACP-014`).

### 10.6 Large openings
<!-- deps: PRD-PRF-001, PRD-PRF-003, PRD-INT-004, PRD-IMP-012, DEC-097 — staged commit for a Store's opening -->

A Store's opening holds tens of thousands of pieces: 13,354 at Deoghar, 27,695 at Hazaribagh and 21,771 at Banka in KDPS's data ([prd-fit.md](../../data-notes/prd-fit.md) 2.17). Its posting is a large document under stock-ledger 10.6.

- **Before any lock:** reading, staging, validation, identity resolution, matching to the count, and the inflow values from the valuation evidence. `files-imports` does this and hands the switch posting a validated set.
- **The posting:** a queued job, one at a time per accounting book. The approval click records the decision and a request to post naming the batch version; the job locks, rechecks, writes the opening count movements and records the decision's use, all in one transaction (access-and-approvals 9.8, DEC-097; `PRD-INT-004`). One document posts whole or not at all (`PRD-IMP-012`).
- **A failed job** posts nothing and leaves the decision unused; the batch shows the failure (3.2).
- **Measured** with stock-ledger 10.6: a full Site opening while counters sell at the reference workload (`PRD-PRF-001`, `PRD-PRF-003`).

## 11. Restricted and personal data
<!-- deps: PRD-ACS-008, PRD-SEC-005, PRD-SEC-006, PRD-SEC-009, PRD-SEC-010, PRD-SEC-014, DEC-052 — restricted fields in files, staging and reports -->

- Each layout column carries a restricted field class where it holds one: salary, identity documents, bank details, customer contact, cost and margin (`PRD-ACS-008`), and employee photos, location evidence and payroll data (`PRD-SEC-010`), the classes of access-and-approvals section 6. In previews, validation reports, read models and exports, a value of a class the reader's assignment does not grant is masked or left out (access-and-approvals section 6). Logs, errors and live-update events never carry it (`PRD-SEC-006`, `PRD-SEC-014`).
- A column of an encrypted class (bank details, identity documents, salary and payroll data) is left out of staging unless the mapping fills a target that holds that class, such as a party's bank details, which then wait for independent approval (structure-and-masters 5.1). A staged value of that class is encrypted like the master's (access-and-approvals section 6). **Design choice.**
- The stored original holds every column (`PRD-IMP-002`). Every stored file is encrypted by the application with the Organisation's key before it reaches file storage, so the bucket and its backups hold only encrypted files, as for encrypted fields in PostgreSQL (`PRD-SEC-006`, `POL-18.02`; access-and-approvals section 6). **Design choice:** all files, because a file's classes are known only after its layout is confirmed. The content hash is taken before encryption. A file is therefore served through the app, which decrypts it for an authorised reader, never by a link straight to the bucket. It is served only to a reader whose assignment covers the batch's scope and every restricted class its layout marks; a file waiting for its layout counts as holding every class until the layout is confirmed. A file kept only as evidence, such as a photograph or PDF attached to a record, has no layout: it is served to a reader authorised for the record it is attached to, and carries the restricted classes the attaching module declares for that kind of attachment. Two kinds of sensitive access in [numbering-and-audit.md](numbering-and-audit.md) 5.1 apply to stored files, and each writes an access record. Downloading a file that holds any restricted class is an export that includes a restricted field. Showing the columns of an encrypted class on screen is showing an encrypted field unmasked. **Design choice**, including reading a download as an export.
- **On the test setup.** Until KDPS answers question 37, imports keep no customer name or phone number (DEC-052; [deployment.md](deployment.md) section 9). A file whose layout holds such a column cannot then be stored without breaking either that rule or `PRD-IMP-002`. **Proposed** (GC6-6): on `kdps-test`, while customer details are to be left out, intake refuses such a file before storing it, and the uploader removes those columns and uploads again.
- Which other fields are left out on the test setup, such as salesperson names, supplier bank details and tax numbers, and who may see cost columns, is OPEN (GC6-7; data-quality L-1).
- Purpose, consent and retention follow `PRD-SEC-009` and `PRD-SEC-010`. Retention periods are set with backup, restore and export (module-map MM-15); until they are set, nothing is deleted (`POL-18.05`).

## 12. Stage 1 and later stages
<!-- deps: PRD-IMP-001, PRD-PTW-002, PRD-LIF-013, POL-14.07, DEC-105 — what GC-6 builds now and what later designs take -->

| Part | Stage 1 builds and tests | Defined here for later | Later design |
| --- | --- | --- | --- |
| Intake, stored files, attachments, readers, the grid | All, with synthetic files | — | — |
| Layouts, mappings, mapping rules, proposal and confirmation | All; the loader of 6.7 | — | — |
| Staging, validation report, duplicate control, outcomes, comparison runs | All | — | — |
| Master imports (create, update) | `organisation` and `merchandise` handlers (structure-and-masters section 7) | — | — |
| Opening data | Layouts, staging, validation and reconciliation on sample data; a test handler on `dev` that posts synthetic opening counts through the stock ledger (10.6) | Kinds, manifest fields, reconciliation runs, the gate (section 10) | Stage 4 switch design in `site-lifecycle`: the opening record, verifications, switch posting, financial opening balances |
| Earlier-POS imports | Layout loading and proofs on synthetic replicas; line classes (6.8) | Historical-reference kind, Store maps, comparisons | Stage 2 `ebo-imports` design |
| Vendor PT files | Readers for all four formats; layout loading and proofs | Origins, multi-document files, identity by supplier and invoice | Stage 2 PT workbench and costing design ([prd-fit.md](../../data-notes/prd-fit.md) 3.4) |
| AI drafts | None; the gateway is off (DEC-105) | AI-suggestion origin (section 5) | Stage 2, with the AI gateway |
| EBO reports | — | Transaction kind; same identity and validation rules (`PRD-EBO-010`, `PRD-INT-012`) | Stage 4 EBO design; no sample exists yet |
| Bank statements, settlement files, supplier ledgers | — | Transaction kind | Stage 5 finance designs (`PRD-CSH-007`, `PRD-INT-011`) |

The stage 2 PT design settles, among others: one PT row per piece or per barcode with a quantity, and whether the importer may split a row of quantity N ([pt-file-layouts.md](../../data-notes/pt-file-layouts.md) 6, questions 1 and 7); a PT file per invoice or per GRN; a shipment split across an invoice and a packing list; per-cell origin in the grid (`PRD-PTW-002`, `PRD-PTW-003`); the costing profile's verification of supplied and calculated cost (`PRD-PTW-013`).

## 13. Interface

### 13.1 Operations
<!-- deps: PRD-IMP-002, PRD-IMP-005, PRD-IMP-008, PRD-IMP-011, PRD-IMP-012 — the operations of module-map 4.7 made concrete -->

The operations of module-map 4.7, made concrete. Every call goes through the checks of access-and-approvals 7.1: available, authorised, scoped.

| Operation | Takes | Refuses when |
| --- | --- | --- |
| Store a file | Bytes, source system, document reference claimed | 9.3; on the test setup, 11 |
| Attach, read a file | Stored file, record and version | The reader lacks the scope or a restricted class the file holds (section 11) |
| Start an import | Stored file, kind, target, scope facts | The target's handler does not accept the kind (4.2); the same file is in a batch for the same target and layout that is not Failed, or a document with the same source identity (target, scope key and document reference, 7.1) is already published, unless the batch is a governed revision of it (7.2, 7.3) |
| Map and stage | Layout and mapping versions; values entered by a person; documents excluded or put back | An incompatible layout version (6.5); a value of a field the preparer may not write |
| Validate and preview | The batch | — (it reports) |
| Propose or confirm a mapping rule, layout or mapping version | The proposal | For a mapping rule, the confirmer is the proposer (`PRD-IMP-008`). For a layout or mapping version, the same check if GC6-4 is settled that way (6.4) |
| Submit for review | The batch version | It is not Validated; Blocking issues remain; counts do not close (7.4) |
| Publish | The batch version and its approval decision, where one is required | The review is missing; the layout or mapping version is not Confirmed (6.4); a document is a duplicate or a conflict; the handler refuses under its locks |
| Withdraw | The batch | It is Published |
| Run a comparison | Two sets and a key | — |

### 13.2 The import handler contract
<!-- deps: PRD-MOD-002, PRD-IMP-005, PRD-IMP-012, PRD-INT-002, PRD-ACS-006 — what a target module registers -->

`files-imports` never writes another module's records (`PRD-MOD-002`; module-map section 3, rule 6). A target module registers a handler that declares:

- the record type it fills, the kinds it accepts and the effects it may have (4.2);
- the shape of a staged row, as a shared Zod schema (PRD Stack: API);
- the scope of its source identity (7.1), and whether it supports governed revisions (7.3);
- reference checks, run through its own interface and refusing what its own operations would refuse;
- suggestions: exact or close matches for codes and words, from its own records (section 5);
- the check of a mapping rule whose target it owns (6.3);
- a preview that works out, without writing, what each document would create or change;
- the review it requires: the preparer's submission after preview; an approval rule in `access`, independent where a source requires it (`PRD-ACS-006`); or the approvals of the records it creates, such as a master version Awaiting approval (structure-and-masters 2.3);
- whether a document is large and posts through a queued job (10.6);
- publish: writes its records in the transaction it is given, idempotent on the source identity (`PRD-INT-002`), whole or not at all (`PRD-IMP-012`).

### 13.3 Events
<!-- deps: PRD-MOD-006, PRD-INT-008 — files-imports events -->

The events of module-map section 8, unchanged: `files-imports.import-published` (a document or batch published), `files-imports.import-failed` (a batch Failed or a publish attempt failed), `files-imports.mapping-confirmed` (a mapping rule, layout or mapping version confirmed). They carry identifiers only, and consumers are idempotent on the event (`PRD-INT-008`).

## 14. Read models and reports
<!-- deps: PRD-MOD-003, PRD-EXC-010, PRD-EXC-011, PRD-SEC-005, PRD-STG-001 — import read models and the stage 1 report -->

- **Import outcomes**, the stage 1 report ([phases.md](../../phases.md) stage 1): each batch and document with kind, target, layout and mapping versions, uploader, times, state, and the counts and values of 7.4; filters by Store, kind, state and date; drill to rows, issues and the stored file (`PRD-EXC-011`). It shows its as-of time (`PRD-MOD-003`, `PRD-EXC-010`).
- **Layouts and mapping rules in force**, with their versions, proposers and confirmers.
- **Comparison runs**, with their differences (10.3, 10.4).
- Master lists are the read models of `organisation` and `merchandise` (module-map 4.11). A master created or changed by an import shows its batch as the source in its history (numbering-and-audit 4.1).
- Every read model carries scope columns and is read under the reader's own authorisation; restricted values follow section 11 (`PRD-SEC-005`).

## 15. Tables
<!-- deps: PRD-MOD-002, PRD-MOD-008 — conventions for the tables of 15.1 -->

Names, keys and constraints. Every table has a UUIDv7 primary key. A table marked "+ versions" has a companion table of versions. **Design choice** throughout; other columns are left to reviewed migrations.

### 15.1 Schema `files_imports`
<!-- deps: PRD-IMP-002, PRD-IMP-003, PRD-IMP-008, PRD-IMP-010, PRD-IMP-011, PRD-IMP-012, PRD-IMP-013, PRD-MOD-010, PRD-MOD-011, PRD-SEC-005 — table list for the records of sections 2 to 7 -->

| Table | Unique | Other constraints |
| --- | --- | --- |
| `stored_file` | content hash | append-only; bucket key fixed; real format; restricted classes held |
| `file_receipt` | — | append-only: uploader or service identity, time, source system, document reference claimed, original name |
| `attachment` | stored file, record type, record and version | — |
| `layout` + versions | code | a version is Proposed, Confirmed or Rejected; a Confirmed version never changes; whether the confirmer must differ from the proposer follows GC6-4 |
| `mapping` + versions | code | layout version and target fixed; the same proposal states, and GC6-4 as for layouts |
| `mapping_rule` + versions | — | exclusion: same attribute, scope and normalised word, overlapping dates, different target, among Confirmed versions; the confirmer differs from the proposer, checked by a trigger (`PRD-IMP-008`) |
| `import_batch` | code, from a sequence `files-imports` keeps itself, since module-map 4.7 lists no call to `numbering` | kind and target fixed at start; state Staged, Validated, Published or Failed; scope columns |
| `import_document` | — | partial unique index on target, scope key and document reference among published documents not replaced by a revision; a revision names the document it replaces |
| `staged_row` | batch, sheet and row number | original cells never change; row role: data, header, total, filler, note or ignored |
| `staged_value_entry` | — | append-only: a value entered by a person, with who, when, reason and the suggestion it came from |
| `row_issue` | — | class, severity, correction needed; the reviewer's mark |
| `control_total` | — | reported, summed and accepted values |
| `import_outcome` | — | append-only; one per publish attempt |
| `comparison_run`, `comparison_line` | — | append-only; the two sides' batch versions or read-model as-of times |

- Staged rows and issues of a Published or Failed batch are kept. Nothing is deleted until retention is set (`POL-18.05`).
- Scoped tables carry Site, Store, business unit and legal-entity columns, with row-level security (access-and-approvals 7.2).

## 16. Screens
<!-- deps: PRD-UXP-003, PRD-LIF-014, PRD-ACS-008 — where the import screens sit and what GC-6 adds -->

- Setup › File intake and saved layouts in [ui-blueprint.html](../ui/ui-blueprint.html) holds uploads, saved layouts, staging and review, duplicate control and outcomes. External sales › Earlier-POS daily import (stage 2) and the opening stock pages of Receive Goods (stage 4) use the same components.
- GC-6 adds to them: the staging grid shows each original cell beside its normalised value, with its origin ([design-language.md](../ui/design-language.md) 10.10); hidden rows and sheets are marked; the validation report of section 8; a historical-reference batch carries the line "Checking and reports only; never moves stock" (`PRD-LIF-014`); restricted fields are masked (`PRD-ACS-008`); an unavailable action names what is missing (`PRD-UXP-003`).

## 17. Tests on synthetic data
<!-- deps: PRD-SEC-016, PRD-ACP-018, PRD-IMP-011, PRD-LIF-014, PRD-SEC-017, PRD-PRF-001 — tests and the stage 1 exit checks they serve -->

All data is labelled synthetic and never becomes a default (`AGENTS.md`: "Never invent a value"). Tests run in Vitest; database tests against real PostgreSQL through Testcontainers.

- **Fixtures.** The test suite generates its files: one synthetic replica per entry of the two layout files of 6.7, with the same structure (format, sheets, header rows, names, hidden rows, totals, quirks) and synthetic values. Each file says SYNTHETIC in its name and in a document property. KDPS's own files are never committed or loaded into `dev`: `docs/data-from-kdps/` is git-ignored, and `dev` holds synthetic data only ([deployment.md](deployment.md) section 1).
- **Stage 1 exit checks served.** "An operation whose policy is not configured stays unavailable" (test 22); "A backup restores with linked records and attachments", for which GC-6 supplies the stored-file hashes and attachment links the restore proof checks (test 23; GC-9). Also the stage 1 scope lines for imports and opening-data layouts, and the import outcomes report. Test 18 rehearses the stage 2 exit check for side-by-side imports.

| # | Test | IDs |
| --- | --- | --- |
| 1 | The format is found from content: a `.csv` that is XLS and an `.xls` that is XLSX are read; a damaged file is refused with its error; a file with a macro or an external link is refused before it is stored | `PRD-IMP-001`, `PRD-SEC-011` |
| 2 | The stored original equals the uploaded bytes; each receipt keeps uploader, time, source system and reference; the same bytes again show the earlier batch | `PRD-IMP-002` |
| 3 | A file named for one brand with another layout's structure is never given the brand's layout; with two compatible versions the preparer must choose | `PRD-IMP-004` |
| 4 | Header on row 16, a two-row header, a leading blank column, a headerless sheet: each reads as its layout says; a headerless sheet without a confirmed positional layout is refused | `PRD-IMP-003` |
| 5 | A filter that hides most rows: every row is read and the report shows the filter | `PRD-IMP-005` |
| 6 | First-line bill fields carry to the bill's lines; an orphan line is refused; nothing is filled from a neighbour | `PRD-IMP-009` |
| 7 | Total rows become control totals, and a mismatch is reported with both values | `PRD-IMP-013` |
| 8 | A season cell typed as a date stays Unknown with a suggestion; a swapped date that breaks bill order is reported; `Not Disclosed Yet.` is no date | `PRD-LIF-006`, `PRD-IMP-007` |
| 9 | Text in a number column and `#N/A` are never zero; a money value with sub-paise digits gets no paise value without a named rule | `PRD-MOD-014`, `PRD-MOD-015` |
| 10 | Barcodes keep leading zeros; a rounded 13-digit barcode is never matched; a failing check digit is flagged, not refused | `PRD-MER-007` |
| 11 | Every staged value has an origin; a calculated value never replaces a supplied one; AI suggestions are unavailable while the capability is off | `PRD-IMP-006`, `PRD-SEC-017` |
| 12 | A mapping rule confirmed by its proposer is refused; an unconfirmed proposal changes no record; two conflicting rules in one scope are refused. Under the GC6-4 proposal, a layout or mapping version confirmed by its proposer is refused too | `PRD-IMP-008`, `POL-02.07` |
| 13 | A batch keeps its layout and mapping versions; a new version leaves past batches as they were | `PRD-IMP-003`, `PRD-MOD-010` |
| 14 | The same document twice has one effect and counts as duplicate; changed content is refused as a conflict; a governed revision reverses and reposts once | `PRD-IMP-011`, `PRD-ACP-012` |
| 15 | Two concurrent publishes of one document give one effect | `PRD-INT-002`, `PRD-INT-005` |
| 16 | One failing line fails its document, other documents publish, and the failed outcome is kept | `PRD-IMP-012` |
| 17 | Counts close: read equals ignored plus accepted, rejected, pending and duplicate | `PRD-IMP-013` |
| 18 | After a historical-reference load of synthetic daily sales and SOH, every stock quantity and value is unchanged. Under the proposal of 4.2, the stock ledger and Post also refuse its source | `PRD-LIF-014`, `PRD-LIF-016`, `PRD-IMP-010` |
| 19 | Lines matched by a confirmed transfer rule are reported apart from sales; an unclassified zero-tender line is flagged | `PRD-TRF-003`, `PRD-IMP-009` |
| 20 | Opening stock on synthetic data: a row with no valuation evidence is held as excess; an empty unit declares zero; no delivery, booking, invoice, liability or journal is created; an explicit Unknown season is audited and matches no season offer; an opening batch after cutover is refused | `PRD-LIF-003`–`PRD-LIF-006`, `PRD-LIF-008`, `PRD-LIF-011`, `PRD-ACP-014` |
| 21 | Opening dues, advances and deposits stage as separate kinds; their totals compare with synthetic closed-books balances; a due also open as a live document is Blocking | `PRD-LIF-009`, `PRD-LIF-011` |
| 22 | **Stage 1 exit check.** Publishing an opening batch is unavailable without policy 14 Signed and validated, and names what is missing | `PRD-SEC-017`, `PRD-UXP-003` |
| 23 | **Stage 1 exit check (with GC-9).** After a restore, every stored file matches its hash and every attachment opens from its record | `PRD-SEC-012`, `PRD-ACP-019` |
| 24 | A synthetic opening of 30,000 rows posts through one queued job; a failed job posts nothing and leaves the decision unused; counter finalisation stays inside its target meanwhile | `PRD-INT-004`, `PRD-PRF-003`, DEC-097 |
| 25 | A reader without the cost class sees cost masked in the preview and the report on screen, and left out of exports and read models; under the GC6-6 proposal, a test-setup Organisation set to leave out customer details refuses a file with those columns before storing it; logs hold no restricted value | `PRD-ACS-008`, `PRD-SEC-014`, DEC-052 |
| 26 | A reader scoped to one Store sees only that Store's batches, rows and files | `PRD-SEC-005` |
| 27 | A synthetic 10,000-line structured PT file is parsed, mapped and validated in under 1 minute | `PRD-PRF-001` |

## 18. Open questions

Nothing below has a default. Questions kept elsewhere are pointed to, not repeated: the open questions of [data-quality-and-import-rules.md](../../data-notes/data-quality-and-import-rules.md), [pos-exports.md](../../data-notes/pos-exports.md), [pt-file-layouts.md](../../data-notes/pt-file-layouts.md) and [open-questions.md](../../data-notes/open-questions.md), named in 8.3 by class; who verifies and signs the opening manifest and balances (KDPS Owner question 28, `POL-14.02`, `POL-14.03`); KDPS's agreement to real data on the test setup (D-4, question 37); the rollout order on production (SL-9); the stock cost method and pool (V-08, V-09).

| # | Question | Kind | Who decides | Blocks | Impact |
| --- | --- | --- | --- | --- | --- |
| GC6-1 | Which of the 29 earlier-POS and 37 PT layout candidates stage 1 builds and proves first. **Proposed:** the KDPS template, the header-detectable families F2 to F6, `sales-bill-line-25` and its repeat variant, and `soh-movement-23`, `soh-movement-22` and `soh-stock-details-14` (6.7) | Business (delivery order) | Product owner | Stage 1 build order | Which layouts are ready for stage 2 |
| GC6-2 | Which libraries read XLS, XLSB, CSV and PDF text, and which image formats are accepted. ExcelJS reads XLSX and CSV, not XLS or XLSB (9.2) | Technical | Product owner | Stage 1 build of those readers | The `format-specific import adapters` of the PRD Stack |
| GC6-3 | An external workbook link: refused, as 9.3 says following module-map 4.7, or stripped with its cached values read and the link reported (A-9) | Technical (security) | Product owner | — (refused until decided) | Whether KDPS must save such files as values first |
| GC6-4 | **Proposed:** layout and mapping versions need confirmation by a different person, like mapping rules (6.4, `PRD-IMP-008`) | Business | Product owner; KDPS Owner names the confirmers | Stage 1 live use | Who can make a layout usable |
| GC6-5 | The file-size and expansion limits at intake (9.3) | Technical | Product owner | Intake on `kdps-test` | Which files are refused as too large |
| GC6-6 | **Proposed:** on `kdps-test`, while customer details are to be left out, intake refuses a file with customer-contact columns before storing it (section 11). This keeps both `PRD-IMP-002` and DEC-052 | Business | KDPS Owner (question 37); product owner | The side-by-side test | Whether KDPS edits exports before upload |
| GC6-7 | Which other fields are left out on the test setup, and who may see cost columns (section 11; data-quality L-1) | Business | KDPS Owner (question 58); product owner | The side-by-side test | Layout column classes on `kdps-test` |
| GC6-8 | **Proposed:** opening batches may be staged and validated on `kdps-test` as a rehearsal, never published (10.1) | Business | Product owner; KDPS Owner (D-4) | — | An early check of real opening data |
| GC6-9 | What counts as valuation evidence for an opening row, and whether the earlier POS's `Rate` may serve as evidence, alone or with other evidence (10.2, `PRD-LIF-005`) | Business | Accounts, CA (Accounts question 19) | Stage 4 switch | Which counted rows become opening stock and which are held as excess |
| GC6-10 | The fields of each dues, advances and deposits layout, what "outstanding commercial stock" holds for KDPS, and the form of the closed-books balances they reconcile to (10.4) | Business | Accounts, CA (Accounts question 20) | Stage 4 switch | The opening-balance layouts |
| GC6-11 | Where opening dues, advances and deposits are held between the stage 4 switch and the stage 5 payables and receivables; books-and-posting 7.3 gives `site-lifecycle` the posting kind | Technical | Product owner, in the stage 4 switch design | Stage 4 | The module that owns open items before stage 5 |
| GC6-12 | Whether rows for other customers in a multi-customer file, such as the Madura extract, are staged or skipped (6.6; [prd-fit.md](../../data-notes/prd-fit.md) candidate decision 23) | Business | Product owner | Stage 2 | What the Organisation keeps of others' data |
| GC6-13 | Which rounding rule each money column of a layout uses when a value has more decimals than paise (6.2; C-2) | Business | Accounts | The first real import of that column | Paise values of such cells |
| GC6-14 | Which reason texts and bill series mark an earlier-POS line as a transfer keyed as a sale (6.8) | Business | Operations, Accounts (Operations question 7) | Side-by-side reports (stage 2) | Sales totals in comparison reports |
| GC6-15 | **Proposed:** no batch state beyond the four of DM-4; a queued or failed publish keeps Validated (3.2) | Technical | Design review | — | State badges |
| GC6-16 | Whether a barcode not listed in a positive-only SOH may be read as zero in comparisons (6.6; I-1) | Business | Product owner | Side-by-side reports (stage 2); switch reconciliation (stage 4) | How comparison runs report it |

**Settled here:** the record parts of domain-model 3.9 (section 2), the import pipeline and handler contract (sections 3 and 13). **Proposed here, for the owner named:** GC6-1, GC6-4, GC6-6, GC6-8 and GC6-15, and the stock-ledger and books guard of 4.2.
