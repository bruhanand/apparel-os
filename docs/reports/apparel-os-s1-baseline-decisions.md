# Apparel OS S1 baseline decisions

For Anand and Claude Code. Decisions and read-only repository audit consolidated on 5 October 2026.

This is the approved product and development baseline to record through the repository’s existing decision process. It does not certify implementation, approve unfinished designs, supply formal Accounts/CA signoff, or authorise installation, pushing, deployment, real-data use, or live activation. Deferred decisions and review gates remain explicit below.

## Product direction

Build a structured Apparel OS baseline with simple, consistent workflows. KDPS will adapt to the product. Input files and existing customer habits are migration and engineering evidence, not authority for product rules. Accounting, legal, data-use, and correctness gates still apply. Technical defaults are development assumptions until tested, not proven production settings.

## Instructions for Claude Code

When Anand authorises repository integration:

1. Verify the repository, commit, branch, working tree, and [AGENTS.md](../../AGENTS.md). Read the existing authority hierarchy and decision log. Preserve unrelated worktree changes.
2. Reconcile these decisions against current decision IDs, PRD, policies, and designs. Record the approved scope in one focused integration batch; update only affected documents and tests. Do not start a broad replan.
3. Preserve higher-ranked rules, provenance, formal approvers, acceptance conditions, and activation gates. If a material conflict remains, report the exact conflict before changing the affected scope. A partly answered record is not automatically closed.
4. Complete the affected design reviews before implementation at their stated gates. GC-8, GC-9, the ledger design, and house rules Part B are not automatically approved by this handoff.
5. Report recorded decisions, changed files, checks actually run, and remaining gates separately. Obtain any further authority needed for installation, external changes, pushing, deployment, or activation.

Repository paths below are relative to `bruhanand/apparel-os`.

## Approved baseline

### Organisation bootstrap and first permissions

References: DEC-101, RR-017; [access §9.11](../design/access/access-and-approvals.md), [first access](../implementation/s1-f01-first-access.md).

- An authorised operator command creates and migrates an Organisation database; ordinary users cannot. Identical interrupted requests safely resume, conflicting requests using the same code are refused, and completed setup cannot rerun.
- The initial Admin prepares users, roles, assignments, approval rules, and reason-list changes. A separate first approver inspects, approves, or rejects them. Neither may approve their own work.
- Give both the Organisation-wide governance visibility required for those duties. Neither receives automatic business-posting, payroll, bank, customer-contact, cost, or margin access.
- Developers derive and independently review the exact record/action/field/scope permission matrix before setup is accepted. The workflow is approved; an unwritten matrix is not. F01 initially uses all/empty scopes; selected members arrive with later master records.
- Bootstrap does not activate unsigned policy or live operation. Preserve DEC-101 and all activation gates.

### Database and audit testing

References: CH2, CH4, CH5.

Use PostgreSQL 17 for development/tests; verify Railway’s actual major separately. Prepare audit partitions ahead through restricted maintenance at setup and on a schedule; alert on coverage failure and never silently drop audit records. Preserve the existing **recording-month** granularity in numbering/audit §4.4 and house rules §3.2. Specify the creation mechanism and advance horizon without reopening that granularity.

Alongside runtime integration tests, use an accepted read-only database role to check direct invariants in an isolated synthetic test database.

### Test harness and ledger coverage

References: H1–H6, RR-012/013/018; [stock harness §3.2](../implementation/s1-f10-stock-harness.md).

A test-only driver exercises real stock/posting logic. Ledger callers must be registered; synthetic callers exist only in tests. Use test-only schema and synthetic approval types through the real approval machinery, in an isolated database, never live. Verify read models and direct invariants through the read-only role.

Retain all existing golden scenarios: receipt, transfer, sale, customer return, Cost established/PT approval, Late cost change, opening count, supplier-return legs, damage, count, and reversals. Earlier examples did not reduce scope. Later real source-document workflow tests remain necessary.

### Role assignment intervals

Reference: CH7.

Different roles may coexist, as may the same role across distinct authorised scopes. The same person, role, and exact scope cannot have overlapping effective intervals; replacement closes or supersedes the old assignment. Do not combine permissions/scopes from separate assignments to expand authority. No self-approval. Settle the canonical scope key and reviewed interval constraint before the first access migration.

### Import safeguards and opening rehearsal

References: RR-034/035/037/039; [GC-6](../design/platform/imports-and-opening-data.md).

- Reject workbooks dependent on external-workbook data. Explain the problem and request a self-contained copy; never silently strip dependencies or trust stale linked values. Reconcile GC-6’s broad “external links” wording with `PRD-SEC-011`: this dependency rule does not itself reject ordinary hyperlinks or internal references, and it does not grant approval to otherwise unapproved external links.
- A separate authorised person approves each new or changed layout-mapping **version** before publication. Drafting/validation may happen first; an unchanged approved mapping needs no per-file reapproval.
- `kdps-test` rejects customer-contact columns **before storing**, even if they contain synthetic contacts. Offer a clean re-upload path; do not silently remove columns. Synthetic contact-validation tests belong in isolated development tests, not `kdps-test`. Real-data permission remains separate under D-4/RR-180.
- Opening-file mapping/validation in `kdps-test` may display errors and reconciliation totals, but remains staged. It cannot publish operational stock or financial balances. Preserve Policy 14 and production-switch gates.

### Posting maps and accounting approvals

References: GC4-2, RR-053, `POL-09.01`; [books and posting §6.3](../design/finance/books-and-posting.md).

Retain Accounts and CA approval of applicable accounting-rule versions, including account, map, cost, and voucher-setting versions. An authorised Accounts maker prepares a change and a separate authorised Accounts approver decides it in the app. Attach or reference the applicable CA approval evidence **before activation**.

The CA need not personally operate the app. Evidence may cover an explicitly identified batch of versions; it must make the coverage clear. Ordinary transactions under approved rules need no fresh CA approval each time. Retain version history and never rewrite posted journals.

This approves the product workflow only. It is not actual Accounts/CA signoff, an exemption from the current framework/rule approval gate, or permission to activate without evidence.

### Internal journal numbering and timeouts

References: GC4-4, CH3, `PRD-PRF-003`, `PRD-INT-004`.

Start with one internal journal series per **book and financial year**. Keep the numbering lock short without breaking business atomicity. Prove concurrent posting and large jobs before acceptance; revisit the series approach with Accounts if performance fails. Ordered chunks would alter atomicity and require a separate decision. Customer-bill numbering is unchanged.

For synthetic-development runtime work, start with `lock_timeout = 1s` and `statement_timeout = 5s`. On timeout, roll back and report failure. Tune after measurement. Longer migration/maintenance values are separately scoped and not fixed here. These are not blanket server-wide settings or production performance promises.

### Import proof order

Reference: RR-032.

Prove product/supplier masters, then opening quantities/values, purchase/receiving PT, and earlier-POS sales/returns comparison. This priority does not override dependencies or drop other required formats. Representative file/layout selection is engineering coverage work; customer habits do not determine the product baseline.

### Readers and extraction

Reference: RR-033. This is the final reconciled reader choice.

- Keep **ExcelJS for XLSX**; add **SheetJS CE for legacy XLS/XLSB**. This replaces the earlier all-Excel SheetJS choice.
- Use **PDF.js** for selectable PDF text and **Tesseract.js** for images when needed. Scanned PDFs require separate conversion and reviewed extraction.
- Prefer structured spreadsheets. PDF/image extraction produces a reviewable draft; uncertain required fields block publication. Never silently guess or publish uncertain values.
- Do not execute macros or fetch external content. Verify maintained, security-checked, repository-compatible versions and pins before use. No installation is authorised by this document.

### Resource limits

Reference: RR-036/GC6-5.

Developers may choose/tune technical caps within the approved safeguards, document them, and test representative synthetic files. Cover uploaded/expanded size, rows, parser memory, and processing time; clearly refuse excess without silent truncation. Report caps that block required workflows. No numeric resource caps are fixed here. Product rules, acceptance criteria, and live-data permissions remain Anand’s decisions. Record this delegation where the current design assigns every cap to the product owner.

### Gifts and brand relationships

References: RR-047 G-3, G-7/A-3, G-6; [needs coverage](../data-notes/needs-coverage.md).

Track gifts/packaging as SKUs with explicit purpose and actual stock cost; giving an item away does not make its cost zero. Report their use separately from merchandise sales. Support an optional parent brand/family relation, distinct from aliases. Use effective-dated many-to-many brand/supplier links, while each booking names its actual supplier; infer no exclusive supplier. Record the affected decisions before `S1-F03` acceptance.

### Supplier terms and opening-stock age

References: RR-047 G-1, A-4.

Record structured supplier cash-discount and interest terms in Stage 1. Automatic calculation, application, and posting wait for the later payment design. Accounts/CA validation of actual values and treatment remains separate.

Preserve a source-backed original receipt date when available. Otherwise, original age stays unknown and time since switch is reported separately. Preserve season for grouping and older-season flags using an explicit season order. Season does not prove an exact receipt date or elapsed age. Actual season ordering and the “old” cutoff are unset; do not invent them.

## Deferred discounts and remaining gates

**RR-042 is deferred and unapproved.** Anand will decide discount-module choices later. Neither all-covered-lines allocation nor complete-set-only allocation is accepted. Keep any genuinely affected `S1-F11` calculation acceptance case and live `S4-F02` gate open; deferral does not waive them. Taxable-value confirmation remains separate.

The separate discount-pattern research Markdown is nonbinding. Examples such as configurable buy-N/get-M and “best valid offer” do not expand the PRD or close RR-042. Offer selection/combination and line allocation are separate decisions.

Engineering and formal review work still required:

- **RR-016:** derive stock-plan readiness from the approved opening path or explicit zero declaration (`PRD-LIF-003`) and define the device check; invent no replenishment threshold or new business prerequisite.
- **RR-015 and CH6:** record/review counter-bundle placement before the `S1-F11` Chromium run; `apps/counter` at `/counter/` remains an engineering proposal. Design multi-brand/two-ended scope checking before the first applicable Stage 2/3 table; CH6 does not block S1-F01.
- **Ledger and harness:** write operations/tables and independently review the 25 baseline-only ledger sections under DR-2 before `S1-F10`.
- **GC-8/GC-9:** still unwritten and subject to DR-3. Preserve offline-counter design before `S1-F12`/Stage 1 exit and the `S1-F14` synthetic restore drill with attachments, hashes, paused numbering, and audit seals.
- **Part B/deployment/UI:** house rules Part B and deployment §§5/9 review precede `S1-F01-T04`; design-language/blueprint review precede T14.
- **RR-193–196:** align environment variable/banner at T14; reconcile pre-existing synthetic databases at T10; refuse seeding a directory with non-synthetic Organisations once routing exists at T02; revisit paired isolation-test scheduling as the suite grows.
- **RR-187 and engineering checks:** verify actual Railway topology, major, and wiring before the first dev demo. Verify reader compatibility/security, measured resource caps, representative fixtures, and journal performance. Documentation does not prove live infrastructure exists.

All 19 policies were Open at the audit. Signed policy, actual values, independent validation, authority assignments, Accounts/CA evidence, Site activity grants, real-data permission, and production-switch/restore gates remain separate. Do not use old KDPS rates, accounts, or thresholds as defaults.

Preserve Stage 1 exit evidence: server and counter calculations; stock/posting under both formulas and pool modes; policy/readiness refusal; mappings; restore with attachments; concurrency/isolation/independent approvals; a 10,000-line PT parse; and large posting while counters sell. G10a invents no rounding rule; G10b waits for the real rule before moving-average posting goes live.

Sources: [readiness register](../implementation/readiness-register.md), [stock ledger](../design/stock/stock-ledger.md), [house rules](../design/platform/code-house-rules.md), [deployment](../design/platform/deployment.md), [shared calculations](../design/calculations/shared-calculations.md), and [Stage 1 exit checklist](../implementation/exit-checklists.md). Recheck at the integration commit.

## Verified repository and CI snapshot

Read-only audit on 5 October 2026: clean checked-out `main` at `be181817c28e2ad73162c6fb41b054697104ba02`. [PR #4](https://github.com/bruhanand/apparel-os/pull/4) merged base `be181817`, head `6c09ddc6`, squash `2c68d88e`. At the audit, GitHub `main` pointed to the squash commit; the local checkout was one commit behind.

- PR head [Code check](https://github.com/bruhanand/apparel-os/actions/runs/37341014430) and [Doc check](https://github.com/bruhanand/apparel-os/actions/runs/37341014639) passed. Logs showed 46 server unit tests, 48 integration tests across seven files, and zero documentation errors/warnings.
- Merged-main [Code check](https://github.com/bruhanand/apparel-os/actions/runs/37341324309) and [Doc check](https://github.com/bruhanand/apparel-os/actions/runs/37341324282) passed; the code log again showed 48 integration tests passing.

The newer handout records completed independent review and all six Stage 0 start conditions met. The local checkout remains the S0-T05 skeleton; S1-F01 is not built. Next planned work is `S1-F01-T01`, contract schemas and reviewed setup design. Applying Railway’s roles runbook is an operator step before first migration deployment, not a T01 prerequisite.

The audit inspected relevant code, plans, readiness records, designs, and exact CI logs. It did not fetch, rerun local tests/checkers/services, inspect live Railway, or reread every PRD/policy section. CI success does not approve the remaining designs or live gates.

## Official public references

These explain mechanisms and risks; project choices above remain Anand’s decisions, not universal requirements or production validation.

- [PostgreSQL 17 timeouts](https://www.postgresql.org/docs/17/runtime-config-client.html): lock/statement scope, not a prescription for 1s/5s.
- [PostgreSQL 17 partitioning](https://www.postgresql.org/docs/17/ddl-partitioning.html): maintenance and failed inserts without matching partitions.
- [Microsoft workbook links](https://support.microsoft.com/en-us/excel/manage-workbook-links): dependency behavior and conversion to current values when links are broken.
- [NIST configuration change control](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-128.pdf#page=43): independent review by analogy, not a per-file ERP mandate.
- [ExcelJS](https://github.com/exceljs/exceljs) and [SheetJS formats](https://docs.sheetjs.com/docs/miscellany/formats/): reader capabilities; verify chosen versions locally.
- [PDF.js text extraction](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html#getTextContent): page text still needs business-field interpretation and validation.
- [Tesseract.js scope](https://github.com/naptha/tesseract.js#project-scope): image OCR, not direct PDF processing.
- [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html): restricted handling, maintained parsers, and resource limits; no universal numeric caps.
