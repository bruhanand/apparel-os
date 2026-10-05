# Readiness register

> **Not ranked.** This register gathers the open gaps and questions of every document into one list. It decides nothing and supplies no value. Each item keeps its original ID and links to where it is kept; the source wins over this list. See [index.md](index.md).

Checked on 5 Oct 2026 against the PRD, the policies, `DEC-001` to `DEC-111`, and updated the same day for `DEC-112` (the stage 1 baseline) and on 6 Oct 2026 for `S1-F01-T01` (RR-017, RR-205 to RR-215), the design documents, [phases.md](../phases.md), [questions-for-kdps.md](../questions-for-kdps.md), the reports and the data notes.

## 1. How to read it

**Categories.**

| Category | Meaning | Who answers |
| --- | --- | --- |
| Missing implementation | Designed, not built | The builders, inside the feature named |
| Missing or unreviewed design | No design yet, or a design whose sections were never reviewed | Design, reviewed under the doc gate; the product owner for product choices |
| Unresolved product behaviour | How the product should behave; no source settles it | The product owner, through a decision entry where the PRD changes |
| Customer configuration | KDPS's own values and choices inside the policies | KDPS, Accounts, the CA or another named persona |
| External approval | A signature, a confirmation of a baseline pick, or an agreement from outside the build team | KDPS, Accounts or the CA |
| Runtime verification | Something that must be proved by running it, not by writing it | The builders, with evidence |

**Gates** are those of [index.md](index.md) section 4: Design, Code, Accept, Exit, Live, each with the feature or stage it blocks. "Synthetic work proceeds" says whether design, code and tests on labelled synthetic data can go on before the item is answered.

**Original IDs.** `V-n` is [alignment-report.md](../reports/alignment-report.md) section 5. `SL-n`, `MM-n`, `DM-n`, `D-n`, `GC2-n` to `GC7-n` are the open-question tables of [stock-ledger.md](../design/stock/stock-ledger.md), [module-map.md](../design/architecture/module-map.md), [domain-model.md](../design/architecture/domain-model.md), [deployment.md](../design/platform/deployment.md) and the GC designs. `GC-n` is [gaps-before-code.md](../reports/gaps-before-code.md). "KDPS Owner 12", "Accounts 3", "CA 18" and "Operations 7" are question numbers in [questions-for-kdps.md](../questions-for-kdps.md). `Q-n` and the gap numbers are in the data notes ([open-questions.md](../data-notes/open-questions.md), [needs-coverage.md](../data-notes/needs-coverage.md)).

## 2. Counts

Each item is counted once, at the earliest gate it blocks.

| Category | Active | Design | Code | Accept | Exit | Live | None |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Missing implementation | 12 | — | 12: each is the work of its feature | — | — | — | — |
| Missing or unreviewed design | 33 | 8 | 23 | — | 1 | 1 | — |
| Unresolved product behaviour | 19 | 5 | 2 | 1 | — | 4 | 7 |
| Customer configuration | 104 | 1 | 1 | 1 | — | 100 | 1 |
| External approval | 30 | — | — | 1 | — | 29 | — |
| Runtime verification | 11 | — | 2 | 6 | 1 | 1 | 1 |
| **Total** | **209** | **14** | **40** | **9** | **2** | **135** | **9** |

Not counted: 21 data-note questions dropped as about old sheets only, 3 struck V-numbers, and the settled or baseline questions listed in section 10. Stale report entries are in section 9.

**The short answer.** Nothing a KDPS person must answer blocks the start of coding: 135 of the 209 items block only live activation. The first feature waits only on the stage 0 start gate ([stage-0-preparation.md](stage-0-preparation.md) section 2): Doc check running in CI (RR-186), a verified toolchain (RR-185), house rules part A (RR-011), the migration roles and fixtures (RR-006) and the `AGENTS.md` reviews (RR-020). Inside the feature: house rules part B and the deployment reviews before `S1-F01-T04` (RR-011, RR-021); the review of the setup-step permission matrix, the rerun check of temporary passwords, session routing and first passwords before `S1-F01-T10` (RR-017; written by `S1-F01-T01`, the rest settled by `DEC-112`); the screen-design reviews before `S1-F01-T14` (RR-019, RR-023). Team size, the extra worktree and whether this plan is gated block nothing (RR-031, RR-050, RR-052). The stock-and-posting feature also waits on design that does not exist yet (RR-012, and RR-013, whose decisions H1 to H6 `DEC-112` has taken) and on 25 never-reviewed ledger sections (RR-018).

## 3. Missing implementation

| RR | Original ID and source | Item | Owner | Affects | Blocks at | Synthetic work proceeds |
| --- | --- | --- | --- | --- | --- | --- |
| RR-001 | module-map 4.1 | Kernel mechanisms: Organisation routing and directory, command transaction, actor setting for row-level security, idempotency, outbox and pg-boss jobs, live updates, read-model gateway, operations view. Only the health endpoint, database handle and logger exist | Builders | S1-F01, S1-F08 | Code: everything after S1-F01 | Yes |
| RR-002 | GC-3, GC-5 | `access`, `audit`, `inbox`, `configuration`: nothing built | Builders | S1-F01, S1-F04, S1-F05 | Code: every later feature | Yes |
| RR-003 | GC-2 | `organisation`, `merchandise` catalogue and parties: empty shells only | Builders | S1-F02, S1-F03 | Code: S1-F06 onwards | Yes |
| RR-004 | GC-4, GC-5, GC-6, stock-ledger | `files-imports`, `numbering`, `exceptions`, `finance` books and tax rules, `stock` ledger: nothing built | Builders | S1-F06 to S1-F10, S1-F13 | Code: stage 2 | Yes |
| RR-005 | [gaps-before-code.md](../reports/gaps-before-code.md) section 3; GC-7 2.1 | `packages/calculations` is not created; no golden cases | Builders | S1-F11 | Exit S1 | Yes |
| RR-006 | [deployment.md](../design/platform/deployment.md) section 4; gaps-before-code section 3 | No migration runner, no migration and runtime roles, no row-level security harness, no synthetic fixture and reset tooling | Builders | S0-T05, S0-T06 | Code: S1-F01 | Yes |
| RR-007 | PRD Stack (Web, Verification); `AGENTS.md` "Current state" | Web app has no router, data layer, forms or components; Playwright is not installed | Builders | S1-F01 (first screen), S1-F11 (counter run) | Code: S1-F01 screens | Yes |
| RR-008 | PRD Stack (Authentication, Files, Jobs) | Argon2, TOTP, pg-boss and S3 client libraries are not installed; no MinIO for local development | Builders | S1-F01, S1-F06 | Code: those features | Yes |
| RR-009 | PRD Stack (API) | No generated OpenAPI or typed client | Builders | S0-T04, S1-F01-T05 | Code: S1-F01 screens | Yes |
| RR-193 | `S0-T06` code review, 5 Oct 2026; code-house-rules 11.2; [deployment.md](../design/platform/deployment.md) section 1 | The local seed reads the environment from `AOS_ENVIRONMENT`; the app's environment banner needs one too. Settle one variable that names the environment for both | Builders | S1-F01-T14 | Code: S1-F01-T14 | Yes |
| RR-194 | `S0-T06` code review, 5 Oct 2026; code-house-rules 11.2; CH-1 | The setup step must deal with the `syn_org_a` and `syn_org_b` databases the seed has already made on a machine or on `dev`, or the seed must move onto the setup step | Builders | S1-F01-T10 | Code: S1-F01-T10 | Yes |
| RR-195 | `S0-T06` code review, 5 Oct 2026; [deployment.md](../design/platform/deployment.md) section 1 | The seed trusts what `AOS_ENVIRONMENT` declares. Once the directory table exists, the seed should also refuse a directory that lists a non-synthetic Organisation | Builders | S1-F01-T02 | Code: S1-F01-T02 | Yes |

## 4. Missing or unreviewed design

| RR | Original ID and source | Item | Owner | Affects | Blocks at | Synthetic work proceeds |
| --- | --- | --- | --- | --- | --- | --- |
| RR-010 | GC-9 (gaps-before-code); MM-15; `POL-18.01` to `POL-18.05` | Backup, restore and export design: what is backed up, the restore proof, retention, deletion and legal holds, the complete export | Design; product owner approves | S1-F14, S5-F09 | Design and Code S1-F14; Exit S1 | Yes, other features |
| RR-011 | gaps-before-code section 3; `AGENTS.md` "Not written yet" | Code house rules in two parts. Part A, database and tests: folder layout, migrations and roles, row-level security pattern, transactions and lock order, time, test plan, fixtures, test-only harness schemas. Part B, API and runtime: API shape, error envelope, idempotency-key header and scope, version token, OpenAPI and typed client, events, the job retry rule ([access-and-approvals.md](../design/access/access-and-approvals.md) 9.8 step 5), logging, screen text, KDPS-valued settings, simulators | Design; product owner approves | Every feature | Code: part A in the stage 0 start gate; part B before S1-F01-T04 | Yes |
| RR-012 | Found 5 Oct 2026: module-map 4.15 says the area designs name the ledger's operations; [stock-ledger.md](../design/stock/stock-ledger.md) has no interface or tables section | Stock ledger interface operations, their inputs and refusals, and its tables | Design, reviewed in DR-2 | S1-F10 and every stock workflow | Code S1-F10 | Yes, other features |
| RR-013 | Found 5 Oct 2026: stock-ledger 11 and books-and-posting 16 need receipts, transfers, sales, returns, late cost and supplier returns, whose modules arrive in stages 2 to 4 | How stage 1 drives the golden scenarios. Decisions H1 to H6 taken by `DEC-112`: a test-only synthetic document driver exercising the real stock and posting logic; registered ledger callers, synthetic ones only in tests; a test-only schema; synthetic approval action types through the real approval machinery; isolated test databases only, never live; a read-only role for raw invariant checks ([s1-f10-stock-harness.md](s1-f10-stock-harness.md)). Every golden scenario stays. Still to do: write them into the ledger interface design and review it in DR-2. A question for the product owner, not for DR-2: GC-6 section 12 plans a handler posting synthetic opening counts on `dev`, while H2 and H5 keep synthetic callers to tests; until answered it runs in tests only (GC6-18) | Design review in DR-2; product owner for GC6-18 | S1-F10 | Design and Code S1-F10 | Yes, other features |
| RR-014 | GC-8 (gaps-before-code); module-map 4.17; `PRD-OFF-001` to `PRD-OFF-019` | Offline counter design: device identity proof, working set, local commit, upload, pause and release | Design | S1-F12, S4-F11 | Exit S1 (stage 1 holds the offline design); Design S4-F11 | Yes |
| RR-015 | Found 5 Oct 2026: GC-7 12.2 needs "a test page of the counter build"; [deployment.md](../design/platform/deployment.md) 3 serves `/counter/`; no package holds it | Which workspace package hosts the counter PWA and its golden-case test page. An engineering proposal, not decided: `apps/counter`, served at `/counter/` (`DEC-112` left it open). Recorded and reviewed before the counter run of `S1-F11` | Design (GC-8 or the house rules) | S1-F11, S4-F11 | Code: the counter run of S1-F11 | Yes, the server run |
| RR-016 | Found 5 Oct 2026: domain-model 3.6 and module-map 4.16 name the readiness checks only | What the "devices" and "stock plan" readiness checks verify in stage 1 (`PRD-LIF-002`, `PRD-LIF-003`). Direction (`DEC-112` left it open): derive stock-plan readiness from the approved opening path or an explicit zero declaration (`PRD-LIF-003`) and define the device check; invent no replenishment threshold and no new business prerequisite | Design | S1-F04, S1-F12 | Code: the stock-plan check of S1-F04; the devices check, which S1-F12 adds | Yes, the other checks |
| RR-017 | Found 5 Oct 2026: access-and-approvals 9.11 creates the first Admin and approver but names neither their roles nor the order across the directory and the new database | Settled by `DEC-112` and written into access-and-approvals 9.11: the setup step as an operator command; its setup states (finished refused, interrupted completed by the identical request, conflicting refused); what the first Admin and the first approver do, the Organisation-wide view they get and the access they never get from setup. Written by `S1-F01-T01` (6 Oct 2026), as Design choices: the two roles' permission matrix (record type, action, field class, scope) in 9.11; the setup states across the directory and the Organisation database, where a rerun is identical only when its non-secret fields match the setup record's fingerprint and both temporary passwords verify against the credentials the first run wrote, with no secret kept for the check (9.11); how a request with a session cookie finds its Organisation's database (3.3); how a new user's first temporary password is issued and handed over (3.2). Reviewed in two rounds by an independent AI reviewer (6 Oct 2026), every blocking finding fixed. Agreed by the product owner on 6 Oct 2026, including that every later user change, disabling included, is independently approved as `DEC-112` reads (round 2 point R1). Left OPEN: how a first user's lost credential is restored before anyone holds a reset (GC3-13, RR-206); whether a temporary password expires (GC3-5). KDPS confirms the role map later (V-01) | Design | S1-F01 | Code S1-F01-T10 | Yes |
| RR-018 | `docs/reviews.json`: 25 sections of [stock-ledger.md](../design/stock/stock-ledger.md) have only the 3 Oct 2026 baseline record, including 10.1 and all of section 11 | Review them before the ledger is coded | Reviewer named by the product owner | S1-F10 | Code S1-F10 | Yes, other features |
| RR-019 | `docs/reviews.json`: 24 sections of [design-language.md](../design/ui/design-language.md) are baseline only (tokens, typography, shells, components) | Review the sections a feature's screens use before those screens are built | Reviewer | Every screen | Code: S1-F01-T14 for the sections its screens use (DR-1b); each later screen likewise | Yes |
| RR-020 | `docs/reviews.json`: 4 sections of `AGENTS.md` are baseline only (top, document order, alignment rules, planned architecture) | Review before code starts | Reviewer | Every feature | Code S1-F01 (DR-1) | Yes |
| RR-021 | `docs/reviews.json`: [deployment.md](../design/platform/deployment.md) sections 5, 8, 9 are baseline only | Review 9 (logs) and 5 (live updates) before S1-F01; 8 before the side-by-side test | Reviewer | S1-F01, S2-F12 | Code S1-F01-T04 (5, 9) | Yes |
| RR-022 | `docs/reviews.json`: [phases.md](../phases.md) top, stage 3 and stage 6 are baseline only | Review before planning those stages in detail | Reviewer | Stages 3, 6 | Design S3, S6 | Yes |
| RR-023 | `docs/reviews.json`: [questions-for-kdps.md](../questions-for-kdps.md) (Booking, HR, before first live use) 3; [ui-blueprint.html](../design/ui/ui-blueprint.html) (`secCols`, `steps`, `storeSide`) 3; [personas.md](../design/access/personas.md) section 5 | Review before the next KDPS round and before the screens that use them | Reviewer | KDPS round; S1-F01 screens | Code: screens using them | Yes |
| RR-024 | module-map section 5: "Each gets its own design before its stage"; GC6 section 12; [prd-fit.md](../data-notes/prd-fit.md) 3.4 | Stage 2 area designs: booking, receiving and inbound ownership, PT workbench and costing (including the questions GC-6 12 hands it), AI gateway, labels through the local helper, damage, supplier-invoice matching, earlier-POS imports | Design | Stage 2 features | Design and Code: each S2 feature | Yes |
| RR-025 | module-map section 5 | Stage 3 area designs: transfers, counts, held goods, supplier returns and claims, statutory movement documents; their place in the lock order (MM-6) | Design | Stage 3 features | Design and Code: each S3 feature | Yes |
| RR-026 | module-map section 5; MM-15 (consent); GC6-11 (where opening dues sit before stage 5) | Stage 4 area designs: till and bill, offers, returns, balances, billed-retained, day close, IRN, EBO imports, the switch in `site-lifecycle` | Design | Stage 4 features | Design and Code: each S4 feature | Yes |
| RR-027 | module-map section 5; MM-11 (where the Customer credit limit and receivable sit) | Stage 5 area designs: ledger close, Tally, bank, payables, receivables, tax, assets, NAV, partners, closure and export, Hindi, messaging | Design | Stage 5 features | Design and Code: each S5 feature | Yes |
| RR-028 | module-map section 5 | Stage 6 area designs: HR, payroll, planning and the forecasting service | Design | Stage 6 features | Design and Code: each S6 feature | Yes |
| RR-029 | D-1 | Production hosting: choice and design, including key storage and rotation ([access-and-approvals.md](../design/access/access-and-approvals.md) 6) | Product owner | S4-F12 and every live operation | Live: before the first Store switch (`PRD-LIF-026`) | Yes |
| RR-030 | [design-language.md](../design/ui/design-language.md) 7 "Proposed states"; GC6-15 | State names proposed for design review, and no batch state beyond DM-4's four | Design review | Screens with those states | Code: the screens that show them | Yes |
| RR-202 | Round 5 review of `DEC-112`, 6 Oct 2026; house rules 7.3; access-and-approvals 4.3 | House rules 7.3 lets an approved version or dated row only have its end moved earlier, to today or later and never to or before its start. So an approved assignment or version that has not started (Scheduled) cannot be withdrawn or superseded before it starts. Decide whether the assignment editor needs that, and if so how the house rules allow it | Design (house rules part A); product owner approves | S1-F01-T11 | Code: S1-F01-T11 | Yes |
| RR-203 | Round 2 and 5 reviews of `DEC-112`; GC-6 3.1, section 11 | On `kdps-test`, intake must find customer-contact columns before the file is stored (GC6-6), but layout detection runs after storing (GC-6 3.1 step 4). Design how the in-memory check finds them, without guessing | Design, in `S1-F06` | S1-F06 | Code: the intake task of S1-F06 | Yes |
| RR-204 | Round 5 review of `DEC-112`; GC-6 15.1; house rules 3.2 | The `import_batch` code comes "from a sequence `files-imports` keeps itself"; house rules 3.2 says no business number comes from a PostgreSQL sequence. Say which is meant before the `files_imports` migration | Design, in `S1-F06` | S1-F06 | Code: the first `files_imports` migration | Yes |
| RR-207 | `S1-F01-T01` round 1 review, 6 Oct 2026; access-and-approvals 3.2; `PRD-INT-002` | How a replay of a request carrying a secret (creating a user, a reset, a password change, any request carrying an authenticator code) is told identical from changed content, when the idempotency hash covers only its non-secret fields and the stored credential may since have been replaced or never existed. The setup step has its own rule (9.11) | Product owner; code house rules part B | S1-F01 | Code: S1-F01-T04 | Yes |
| RR-208 | `S1-F01-T01` round 1 review; `packages/schemas` `enrolmentStartResponseSchema` | The enrolment response wraps the authenticator secret in `Secret`, which serialises as a placeholder and complicates OpenAPI. Settle how a secret shown once is sent and described | Builders | S1-F01-T05, S1-F01-T08 | Code: S1-F01-T05 | Yes |
| RR-209 | `S1-F01-T01` round 1 review; access-and-approvals 3.1; GC3-5 | A "slowed" sign-in answer may show which logins exist if throttling counts per login, against the single refusal of 3.1. Settle with the throttling design of GC3-5 | Builders; product owner with GC3-5 | S1-F01-T08 | Code: S1-F01-T08 | Yes |
| RR-210 | `S1-F01-T01` round 1 review; numbering-and-audit 4.1, 4.3 | The audit record's before and after values do not yet exclude password hashes and session identifier hashes. Fix numbering-and-audit through the doc gate | Builders; reviewed under the doc gate | S1-F01-T07 | Code: S1-F01-T07 | Yes |
| RR-211 | `S1-F01-T01` round 1 review; access-and-approvals 9.11 | The canonical form of the setup fingerprint: login case, persona order, settings normalisation, and its first version | Builders, reviewed with the setup step | S1-F01-T10 | Code: S1-F01-T10 | Yes |
| RR-212 | `S1-F01-T01` round 1 review; personas.md section 2; [ui-blueprint.html](../design/ui/ui-blueprint.html) | P-ADM lands on Setup › Policy readiness, which the first Admin's setup role does not grant (access-and-approvals 9.11). Settle the landing page or its unavailable state | Design review (DR-1b) | S1-F01-T14 | Code: S1-F01-T14 | Yes |
| RR-213 | `S1-F01-T01` round 2 review; access-and-approvals 3.2, 13.1; code-house-rules 7.2 | Where a pending user's temporary password lives: 3.2 stores its Argon2 hash with the user's draft version, but `password_credential` is one row per user with no link to a version, and a user-version row is frozen at submission, so the hash could outlive the password (the outcome 9.11 rejects for the setup record). Settle the credential's place and lifetime for a pending or rejected user, through the doc gate | Builders; reviewed under the doc gate | S1-F01-T08, S1-F01-T11 | Code: S1-F01-T08 | Yes |
| RR-214 | `S1-F01-T01` round 2 review; access-and-approvals 9.11; [s1-f01-first-access.md](s1-f01-first-access.md) section 6 | Wording: the 9.11 matrix's user row names disabling and ending but not re-enabling a Disabled user; 9.11 says every user change writes a permission-change access record, a display-name change included; feature-plan section 6 shows the version states for users but not the user states Active, Disabled and Ended. Fix through the doc gate | Builders; reviewed under the doc gate | S1-F01-T13 | Code: S1-F01-T13 | Yes |
| RR-215 | `S1-F01-T01` round 2 review; [s1-f01-first-access.md](s1-f01-first-access.md) section 5 step 6 | The user, the role and the assignment are approved as separate requests; nothing says what happens to an assignment whose user's first version is still pending or was rejected. Settle in the approvals design before the decide command | Builders; reviewed under the doc gate | S1-F01-T13 | Code: S1-F01-T13 | Yes |

## 5. Unresolved product behaviour

| RR | Original ID and source | Decision needed | Owner | Affects | Blocks at | Synthetic work proceeds |
| --- | --- | --- | --- | --- | --- | --- |
| RR-031 | GC-11; [phases.md](../phases.md) "no dates" | Who builds, and how many people or agents. Sets the number of parallel lanes and any dates | Product owner | Task division | None; never blocks the start | Yes |
| RR-033 | GC6-2 | Readers set by `DEC-112`: ExcelJS for XLSX, SheetJS CE for XLS and XLSB, PDF.js for PDF text, Tesseract.js for images when needed, each version checked and pinned before use, with no installation authorised by the decision. Tesseract.js runs behind the AI gateway (GC-6 9.2), so not before stage 2. To check under house rules 10.6: SheetJS CE's current releases may be published outside the npm registry, so how it is pinned in the lockfile needs checking; Tesseract.js fetches its language data from a CDN unless its paths are set locally, which "nothing external is fetched" forbids; PDF.js versions before 4.2.67 have a known script-execution flaw (CVE-2024-4367). Which origin class PDF-extracted values carry is for the stage 2 PT design. Still open: the CSV reader, and which image formats beyond JPEG and PNG are accepted | Product owner | S1-F07 | Code: the CSV reader in S1-F07 | Yes, the other readers |
| RR-038 | GC6-7; KDPS Owner 58 | Which other fields are left out on the test setup, and who sees cost columns there | Product owner; KDPS Owner | S2-F12 | Live: the side-by-side test | Yes |
| RR-040 | GC6-12; [prd-fit.md](../data-notes/prd-fit.md) candidate decision 23 | Rows for other customers in a multi-customer file: staged or skipped | Product owner | S2-F04, S2-F12 | Design: those S2 features | Yes |
| RR-041 | GC6-16; data notes Q-148 | Does a barcode missing from a positive-only SOH read as zero in comparisons | Product owner | S2-F12, S4-F12 | Design S2-F12; Live S4 (switch reconciliation) | Yes |
| RR-042 | GC7-11 | Which lines earned a group discount: every covered line (Proposed in GC-7 5.6) or, for buy-X-get-Y, only units in complete sets. Deferred by the product owner to the discount-module decisions; neither reading is accepted (`DEC-112`). The research note [apparel-os-discount-patterns-research.md](../reports/apparel-os-discount-patterns-research.md) is reference only. The CA's taxable-value confirmation stays separate (CA 20) | Product owner | S1-F11, S4-F02 | Accept: any S1-F11 golden case where the two readings differ; Live S4 | Yes: stage 1 cases use offers where both readings agree |
| RR-043 | `DEC-067` (Choice) | May the earlier POS keep selling at a Store on production hosting before its switch? No default | Product owner | Production rollout | Live: first live use on production ("stage 2 waits", `DEC-067`) | Yes |
| RR-044 | SL-9; KDPS Owner 41 | Rollout order on production: when a warehouse goes live and loads opening stock (`POL-14.07` allows it only at a Store's switch); moves between a live Site and an unswitched Store | Product owner; KDPS for `POL-14.07` | S4-F12, production | Live: first live use on production | Yes |
| RR-045 | SL-10; KDPS Owner 43; `DEC-059` | The later plan for returns with no sale in the app. The baseline until then is set by `DEC-105` | Product owner; CA for another legal entity | After S4-F12 | None now; the later plan | Yes |
| RR-046 | SL-11; GC4-4 | Post a large document in ordered chunks, only if the staged commit fails the counter performance test; it would change atomicity and need its own decision (`DEC-112`) and a PRD decision | Product owner | S1-F10 | Only if RR-189 fails | Yes |
| RR-047 | Data notes gaps 1, 2, 3, 4, 18 ([needs-coverage.md](../data-notes/needs-coverage.md) section 3) | Decided by `DEC-112`: gift, promotional and packaging goods as SKUs with an explicit purpose and actual stock cost, their use reported apart from sales; an optional parent brand, apart from aliases; effective-dated many-to-many brand-supplier links, each booking naming its actual supplier; structured supplier cash-discount and interest terms, with calculation, application and posting left to the later payment design; an opening row's original receipt date kept only where a source backs it, otherwise Unknown, with time since the switch reported apart and older seasons flagged only through an explicit season order. Still to do, before the `S1-F03` and `S1-F13` code that implements them: the PRD bullets, through decision entries that cite `DEC-112` ("Gift-with-purchase" needs a "Words used" row apart from "Gift voucher"), the structure-and-masters and GC-6 10.2 edits, and KDPS questions for the supplier-term values (Accounts, CA). The season order and the "old" cutoff are RR-199 | Product owner | S1-F03, S1-F13 | Design S1-F03 | Yes |
| RR-048 | Data notes gaps 5 to 17, 19 to 23; the parked `Color` tags | The other proposed gaps, placed by their stages (claims kinds, freight on transfers, paper bills, terminal registry, offer kinds, brand style lists, brand report, measures catalogue, footfall, budgets, discount ceilings, segments, biometrics, staff pictures) | Product owner | Stages 3 to 6 | Design: each affected feature | Yes |
| RR-049 | Data notes Q-140, Q-141, Q-143, Q-144, Q-145, Q-149, Q-150, Q-151 | Product-owner questions from the data: role grid meaning (feeds V-01), landing page (`PRD-UXP-001` already requires persona home screens, so Q-141 looks answered; confirm), analyst thresholds (never defaults), footfall, gift flag, amount-only price changes in earlier-POS exports, offer kinds, brand eligibility lists | Product owner | S1-F01, S1-F03, S2-F12, S4-F04 | Design: the affected features | Yes |
| RR-050 | Found 5 Oct 2026: `git worktree list` | An extra worktree, `.claude/worktrees/document-checker-improvements-c67c98`, holds uncommitted edits to the doc checker, its tests, the AI review notes, the hook and the Doc check workflow. Its branch commit is already in `main`; whether the edits are superseded was not checked. It is preserved: no task reads into, changes or removes it. A plain `eslint .` at the root scans it; the official lint commands do not | Product owner | Repository hygiene | None | Yes |
| RR-051 | PRD Stack (Phone); `DEC-105` | A native phone client needs a later decision; responsive web serves phones through stage 6 | Product owner | `PRD-PRO-009` (part) | None: deferred | Yes |
| RR-052 | This plan | Whether `docs/implementation/` becomes a gated document so the checker flags it when its sources change | Product owner | This plan | None | Yes |
| RR-201 | GC6-17; `DEC-112` (GC6-3); data notes G-33 | Whether an ordinary external hyperlink in a sheet, such as a Google Drive link in KDPS's files, is an unapproved link that refuses the file, or is kept as text and never followed. `DEC-112` says the dependency rule alone refuses no ordinary hyperlink and approves no external link; GC-6 9.3 keeps refusing unapproved links until this is answered | Product owner | S1-F06, S2-F12 | None: refused until decided | Yes |
| RR-205 | Found 6 Oct 2026 (`S1-F01-T01`): [stages-and-features.md](stages-and-features.md) `S1-F06` and `S1-F07`; RR-033; GC6-2; GC-6 9.2 | Two scheduling mismatches, not resolved here. (1) CSV: `S1-F06`'s acceptance cites imports-and-opening-data 17 test 1 "XLSX and CSV", while the CSV reader is still OPEN (GC6-2) and RR-033 gates it to `S1-F07`; decide whether `S1-F06` drops CSV from its acceptance or the CSV reader is chosen before `S1-F06`. (2) PDF: `S1-F07` builds "readers for XLSX, XLS, XLSB, CSV and PDF text" in stage 1, while GC-6 9.2 stores a PDF as evidence in stage 1, has its text extraction arrive in stage 2 (**Proposed**), and keeps stage 1 imports to the manual route (DEC-105); decide whether the PDF text reader is built in `S1-F07` or in stage 2. PDF.js is the reader `DEC-112` chose; its pin at 4.2.67 or later is RR-033's | Product owner | S1-F06, S1-F07 | Code: S1-F06/S1-F07 | Yes, the XLSX part |
| RR-206 | GC3-13 (access-and-approvals 9.11, 16), found 6 Oct 2026 in `S1-F01-T01` | How the first Admin's or the first approver's lost password or authenticator is restored before anyone in the Organisation holds a credential reset. The setup step's roles hold no reset (9.11), so until a later approved role assignment grants one, nobody in the Organisation can reset either of them | Product owner | S1-F01 | Live S1 | Yes |

## 6. Customer configuration

### 6.1 KDPS decisions that shape the build

| RR | Original ID and source | Decision or value needed | Owner | Affects | Blocks at | Synthetic work proceeds |
| --- | --- | --- | --- | --- | --- | --- |
| RR-054 | GC3-5; Admin (questions list) | Password rules, including whether a temporary password expires unused (access-and-approvals 3.2), and after how many failed sign-ins attempts slow or stop, for how long. Until expiry is set, a temporary password does not expire: that fails open, and is acceptable only because GC3-5 gates live use | Admin; product owner | S1-F01 | Live S1 | Yes, labelled synthetic settings |
| RR-055 | GC3-6; KDPS Owner 54 | How long a fresh authenticator code stays fresh for protected actions | KDPS Owner | S1-F01 | Live S1 | Yes: until set, every protected action asks again |
| RR-056 | `POL-02.23`; KDPS Owner 45; GC3-12 | The approve and reject reason list. Deciding is unavailable until a list is in force; the first list is approved with a free-text reason (`DEC-104`) | KDPS Owner, Admin | S1-F01 | Live S1; on `kdps-test` the first list is a test setting | Yes, a labelled synthetic list |
| RR-057 | MM-8; KDPS Owner 49 | Who approves Site readiness and each business unit's activity | KDPS Owner | S1-F04 | Live S1 | Yes |
| RR-058 | GC3-8; KDPS Owner 52 | Due times and escalation recipients for approvals and tasks, per action type and Site | KDPS Owner, Admin | S1-F05 | Live S1 | Yes: items carry no due time until set |
| RR-059 | Alignment report B-9; KDPS Owner 5; `POL-02.19`, `POL-02.20` | The bulk-approval allowlist; named stand-ins, scopes, limits and periods | KDPS Owner, Admin | S1-F05 | Live S1 | Yes: an empty allowlist allows nothing |
| RR-060 | GC5-1; Accounts 14 | Start and end of the financial year for yearly series | Accounts, CA | S1-F08, S1-F09, S1-F12 | Live S1; bills in S4 | Yes |
| RR-061 | GC4-1; Accounts 15 | The periods of each book inside the financial year | Accounts, CA | S1-F09 | Live S2 (first live posting) | Yes |
| RR-062 | GC5-2; CA 17 | Number formats of statutory documents other than bills (credit notes, movement documents) | Accounts, CA | S3-F03, S4-F05 | Live S3, S4 | Yes |
| RR-063 | GC4-3; CA 19 | Does a correction of a journal posted under a wrong map fall on its own date or in the original period | Accounts, CA | S5-F01 | Live S5 | Yes |

### 6.2 KDPS values

Each value below is unset and has no default (`AGENTS.md`, "Never invent a value"). Every one blocks only live activation, except where the gate says otherwise; synthetic work proceeds for all of them.

| RR | Value (V-number) | Sources and KDPS question | Owner | Affects | Blocks at |
| --- | --- | --- | --- | --- | --- |
| RR-064 | Which person holds which persona, role and scope (also who approves refunds, KDPS Owner 17; who holds the approve permissions, KDPS Owner 42) (V-01) | `POL-02.11`; KDPS Owner 1, 17, 42 | KDPS Owner, Admin | S1-F01, S1-F02, S1-F05 | Live S1; on `kdps-test` test assignments only (`DEC-103`) |
| RR-065 | Approval limit amounts per action and approver, including individual limits (V-02) | `POL-02.10`, `POL-02.15`; KDPS Owner 2, 18 | KDPS Owner | S1-F05 and every valued approval | Live S1 (approvals); a missing limit grants nothing |
| RR-066 | Exception owners, due times, escalation and alert recipients, including missing EBO reports (V-03) | `POL-02.11`, `POL-02.16`; KDPS Owner 3 | KDPS Owner, Admin | S1-F08; every feature that raises exceptions | Live S1; an operation whose exceptions have no routing stays unavailable |
| RR-067 | Validate production TOTP and the 5/15-minute idle and 12-hour absolute limits; name the setup Admin and first access approver (V-04) | `POL-02.17`, `POL-02.18`, `PRD-ACS-023`; KDPS Owner 4 | Admin | S1-F01 | Live S1 |
| RR-068 | Categories needing batch or expiry; shelf-life days for receiving and selling (SL-8) (V-05) | `POL-04.08`; Operations 1 | Booking, Operations | S1-F03, S2-F02 | Live S1 (profiles); S2 (receiving) |
| RR-069 | Piece-tracked categories beyond apparel and footwear (V-06) | `POL-04.09`; Operations 2 | Booking, Operations | S1-F03, S2-F07 | Live S2 |
| RR-070 | Accounting framework: AS or Ind AS (V-07) | `POL-09.10`; CA 1 | CA | S1-F09, S1-F10 | Live S2 (first live posting) |
| RR-071 | KDPS's current cost method and pool, with a valuation sample (SL-1) (V-08) | `POL-09.09`, `POL-09.21`; Accounts 1 | Accounts, CA | S1-F09, S1-F10 | Live S1 as listed; in practice before the first live valued movement (S2) |
| RR-072 | Confirm the applicable method and pool; validate any future change (SL-1) (V-09) | `POL-09.06`, `POL-09.19`, `POL-09.21`; CA 2 | CA | S1-F10 | Live S2 |
| RR-073 | Ledger accounts and posting maps per book, including variance accounts (SL-3) (V-10) | `POL-09.11`; Accounts 3 | Accounts, CA | S1-F09 | Live S2 |
| RR-074 | Rounding and invoice-matching tolerances (V-11) | `POL-09.14`; Accounts 4 | Accounts | S1-F09, S2-F10 | Live S2 |
| RR-075 | Recovery targets accepted (15 minutes, 4 hours are provisional) (V-12) | `POL-18.01`; KDPS Owner 6 | KDPS Owner | S1-F14 | Live S1 (go-live drill) |
| RR-076 | Retention period per record class; legal holds (V-13) | `POL-18.05`; KDPS Owner 7, CA 12 | KDPS Owner, Admin, CA | S1-F14, S1-F01 (audit) | Live S1; nothing is deleted while unset |
| RR-077 | Commercial model, ownership event, return and payment terms per brand (V-14) | `POL-01.05`, `POL-01.09`, `POL-01.14`; KDPS Owner 8 | KDPS Owner, Accounts | S1-F03, S2-F01, S2-F03, S3-F07 | Live S2 |
| RR-078 | Costing profile per brand: BASIC to P RATE, charges, rounding (V-15) | `POL-03.06`, `POL-03.07`; Accounts 6 | Booking, Accounts | S2-F04 | Live S2 |
| RR-079 | Who may change or cancel a booking, until when; delivery windows (V-16) | `POL-05.04`, `POL-05.05`; KDPS Owner 9 | KDPS Owner, Booking | S2-F01 | Live S2 |
| RR-080 | Open-to-buy budgets by brand and season (V-17) | `POL-05.02`, `POL-05.09`, `PRD-BKG-004`; KDPS Owner 10 | KDPS Owner, Booking, Accounts | S2-F01 | Live S2 |
| RR-081 | GST registration per business unit; HSN codes, rates and slabs (V-18) | `POL-10.06`, `POL-10.08`; Accounts 5 | Accounts, CA | S1-F02, S1-F09, S1-F11 | Live S2 |
| RR-082 | Named write-off and disposal approvers and cost limits (V-19) | `POL-17.04`, `POL-17.10`; KDPS Owner 11 | KDPS Owner, Operations, Accounts | S3-F06 | Live S3 |
| RR-083 | Named Booking approvers for resolved wrong or unidentified goods (V-20) | `POL-17.02`, `POL-17.11`; KDPS Owner 12 | KDPS Owner | S2-F08 | Live S2 |
| RR-084 | Count cost limits, Store manager and escalation approvers (SL-7) (V-21) | `POL-02.11`, `POL-02.21`; KDPS Owner 13 | KDPS Owner, Operations | S3-F05 | Live S3 |
| RR-085 | Supplier-return reminder schedule (V-22) | `PRD-OFR-009`; Operations 3 | Operations | S3-F07 | Live S3 |
| RR-086 | Defect assessment, consumer-rights and warranty evidence (V-23) | `POL-06.05`; KDPS Owner 14 | KDPS Owner, Operations | S4-F05 | Live S4 |
| RR-087 | Stores with an authorised return override (V-24) | `POL-06.01`; KDPS Owner 15 | KDPS Owner | S4-F05 | Live S4 |
| RR-088 | Provider and evidence configuration for the selected tenders (V-25) | `POL-07.09`, `PRD-POS-021`; KDPS Owner 16 | KDPS Owner, Accounts | S4-F02 | Live S4 |
| RR-089 | No-bill returns on or off; value limit; valuation method (V-28) | `POL-07.08`; KDPS Owner 18 | KDPS Owner, Accounts | S4-F05 | Live S4 |
| RR-090 | Store credit validity and authorised Stores in the same legal entity (V-29) | `POL-07.11`, `PRD-RET-023`; KDPS Owner 19 | KDPS Owner, Accounts | S4-F06 | Live S4 |
| RR-091 | Gift-voucher validity, partial redemption, unused balance, lost voucher, tax (V-30) | `POL-07.10`, `POL-10.10`; KDPS Owner 20, CA 6 | KDPS Owner, Accounts, CA | S4-F06 | Live S4 |
| RR-092 | Loyalty terms (V-31) | `POL-07.13`, `POL-07.09`, `PRD-RET-019`; KDPS Owner 21 | KDPS Owner, Accounts | S4-F06 | Live S4 |
| RR-093 | Customer notice and consent text; permitted uses (V-32) | `POL-07.12`, `PRD-POS-012`; KDPS Owner 22 | KDPS Owner | S4-F03 | Live S4 |
| RR-094 | Billed-retained collection period and reminders (V-33) | `POL-08.04`; Operations 5 | Operations | S4-F07 | Live S4 |
| RR-095 | Outcome for abandoned billed-retained goods (alignment report A-8) (V-34) | `POL-08.04`; KDPS Owner 23 | KDPS Owner, Operations, Accounts | S4-F07 | Live S4 |
| RR-096 | Revenue timing for billed-retained goods (SL-17 part) (V-35) | `POL-08.06`, `POL-09.10`; CA 5 | CA | S4-F07 | Live S4 |
| RR-097 | Pilot offline Store, counter and reserved stock (cash first) (V-36) | `POL-16.01`, `POL-16.02`, `POL-16.04`; KDPS Owner 24 | KDPS Owner, Operations | S4-F11 | Live S4 (offline) |
| RR-098 | External-terminal evidence and reconciliation procedure for offline use (V-37) | `POL-16.02`; KDPS Owner 24 | KDPS Owner, Accounts | S4-F11 | Live S4, only if card or UPI is recorded offline |
| RR-099 | Day-close cash-variance tolerance, approver sets and higher approver (V-38) | `POL-02.13`, `PRD-CSH-011`; KDPS Owner 25 | Accounts, KDPS Owner | S4-F08 | Live S4 |
| RR-100 | Petty-cash float and limits per Store (V-39) | `POL-09.14`; Accounts 7 | Accounts | S4-F08 | Live S4 |
| RR-101 | Bill number format within the GST limit (V-40) | `POL-10.07`; CA 4 | CA | S1-F12, S4-F02 | Live S4 |
| RR-102 | E-invoice applicability per entity (V-41) | `POL-10.03`; Accounts 8 | Accounts, CA | S4-F09 | Live S4 |
| RR-103 | Expected and overdue time and escalation for a missing EBO daily report (V-42) | `POL-02.11`; KDPS Owner 26 | KDPS Owner, Operations | S4-F10 | Live S4 |
| RR-104 | Permitted offer combinations, cost shares, named proposer and approver (V-43) | `POL-19.01` to `POL-19.05`; KDPS Owner 27 | KDPS Owner, Brand manager | S4-F04 | Live S4 |
| RR-105 | Pilot opening manifest, balances, cutoff, switch date, carried work, approvals, fallback (V-44) | `POL-14.05`, `POL-14.07`; KDPS Owner 28 | KDPS Owner, Accounts, Operations | S4-F12 | Live S4 (before the pilot switch) |
| RR-106 | Run length of the side-by-side test; material-difference threshold; meaning of serious exception (V-45) | `POL-14.08`; KDPS Owner 29, 38, 39 | KDPS Owner, Accounts, Operations | S2-F12, S4-F12 | Run length before the side-by-side test; the rest before the first switch |
| RR-107 | Tally voucher types checked against KDPS's real Tally (the MM-12 setting value) (V-46) | `POL-09.15`, `POL-09.16`; Accounts 2, 9 | Accounts | S5-F02 | Live S5 |
| RR-108 | Franchise rates and terms per agreement (V-47) | `POL-12.05`; KDPS Owner 32 | KDPS Owner, Accounts | S5-F08 | Live S5 |
| RR-109 | TDS rules (V-48) | `POL-10.04`; CA 8 | CA | S5-F06 | Live S5 |
| RR-110 | Store P&L and brand-by-Store allocation bases (V-49) | `POL-09.20`; KDPS Owner 34 | Accounts, CA | S5-F07 | Live S5 |
| RR-111 | Capitalisation thresholds, depreciation methods and rates (V-50) | `POL-09.26`; CA 10 | CA | S5-F07 | Live S5 |
| RR-112 | Recipients of the 9 PM WhatsApp summary (V-51) | `POL-02.14`; KDPS Owner 30 | KDPS Owner | S5-F11 | Live S5 |
| RR-113 | Validated pay, leave, overtime, incentive and final-settlement rules (V-52) | `POL-13.06`, `POL-13.11`, `POL-13.15`; KDPS Owner 35 | KDPS Owner, HR, Accounts, CA | S6-F01, S6-F02, S6-F03 | Live S6 |
| RR-114 | Payroll statutory rules per employer and state (V-53) | `POL-10.04`; CA 11 | Accounts, CA | S6-F03 | Live S6 |
| RR-115 | Lead times, horizons, held-out evidence, pass thresholds for forecasts (V-54) | `POL-15.08`; KDPS Owner 36 | KDPS Owner, Booking | S6-F04 | Live S6 |
| RR-116 | EBO brand commission and settlement basis, rates and terms (V-56) | `POL-12.06`; KDPS Owner 33 | KDPS Owner, Accounts | S5-F08 | Live S5 |
| RR-117 | Pieces in each Store, who labels them and when, before its switch (V-57) | `PRD-LIF-025`; Operations 6 | KDPS Owner, Operations | S4-F12 | Live S4 (before each switch) |
| RR-118 | How goods owned before receipt and their supplier liability are recorded (V-58) | `POL-09.02`, `POL-09.22`, `PRD-ORG-018`; CA 3 | Accounts, CA | S2-F03 | Live S2 |
| RR-119 | Customer credit limits and due dates (V-59) | `POL-07.09`, `PRD-POS-022`; KDPS Owner 16 | KDPS Owner, Accounts | S5-F05 | Live S5 |
| RR-120 | Action types allowed for phone approval links (V-60) | `POL-02.22`, `PRD-ACS-012`; KDPS Owner 31 | KDPS Owner | S5-F11 | Live S5 |
| RR-121 | Verified MSME classification and payment deadline per supplier (V-61) | `POL-10.09`; CA 9 | Accounts, CA | S5-F04 | Live S5 |
| RR-122 | Each Store's default warehouse and permitted transfer routes (V-62) | `PRD-ORG-013`; Operations 4 | Operations | S1-F02, S3-F01 | Live S3 |
| RR-123 | Restore operator, pre-launch restore-test date, drill frequency (V-63) | `POL-18.03`; Admin | Admin, KDPS Owner | S1-F14 | Live S1 (pre-launch drill) |
| RR-124 | Rounding rule for a stock cost that does not divide into whole paise (SL-2) (V-64) | `PRD-MOD-014`; Accounts 10 | Accounts, CA | S1-F10 | Live S2: G10b, the values under the real rule, is accepted before moving-average postings go live. Stage 1 proves G10a instead (refusal with no rule; an emptying outflow leaves no residue); G10 is not a stage 1 exit item |
| RR-125 | Offline working-set validity time (V-66) | `POL-16.07`, `PRD-OFF-004`; KDPS Owner 44 | KDPS Owner, Operations | S4-F11 | Live S4 (offline) |
| RR-126 | Cheaper-replacement rule for exchanges (V-67) | `POL-06.09`, `PRD-RET-008`; KDPS Owner 46 | KDPS Owner, Operations | S4-F05 | Live S4 |
| RR-127 | Replacement-SKU restrictions (V-68) | `POL-06.10`, `PRD-RET-009`; KDPS Owner 46 | KDPS Owner, Operations | S4-F05 | Live S4 |
| RR-128 | Evidence for refused return attempts (V-69) | `POL-06.11`, `PRD-RET-015`; KDPS Owner 46 | KDPS Owner, Operations | S4-F05 | Live S4 |
| RR-129 | Exception alert thresholds and recipients (V-70) | `POL-02.25`, `PRD-EXC-013`; KDPS Owner 47 | KDPS Owner, Admin | S1-F08, S4-F08, S4-F10 | Live S4 |
| RR-130 | Owner authority for onward commission (V-71) | `POL-12.08`, `PRD-PAY-013`; KDPS Owner 48 | KDPS Owner, Accounts | S5-F05 | Live S5 |
| RR-131 | Return credit-note and tax-document cancellation treatment (V-72) | `POL-10.11`, `PRD-TAX-004`; CA 7 | CA | S4-F05, S4-F09 | Live S4 |

### 6.3 Other KDPS, Accounts and CA answers

| RR | Original ID and source | Value or decision needed | Owner | Affects | Blocks at | Synthetic work proceeds |
| --- | --- | --- | --- | --- | --- | --- |
| RR-132 | GC6-9; Accounts 19 | What counts as valuation evidence for an opening row; whether the earlier POS's `Rate` may serve | Accounts, CA | S1-F13, S4-F12 | Live S4 (switch) | Yes |
| RR-133 | GC6-10; Accounts 20 | Fields of the dues, advances and deposits layouts; what "outstanding commercial stock" holds; the form of the closed-books balances | Accounts, CA | S1-F13, S4-F12 | Live S4 (switch); stage 1 builds the layouts on synthetic fields | Yes |
| RR-134 | GC6-13 | Rounding rule for each money column whose value has more decimals than paise | Accounts | S1-F06, S1-F07 | Live: the first real import of that column | Yes |
| RR-135 | GC6-14; Operations 7 | Which reason texts and bill series mark an earlier-POS line as a transfer keyed as a sale | Operations, Accounts | S2-F12 | Live: side-by-side reports | Yes |
| RR-136 | GC7-1; CA 21 | Do selling prices, MRP and price lists include tax | CA | S1-F11, S4-F02 | Live S4 | Yes: golden cases cover both bases as rule data |
| RR-137 | GC7-2; CA 22 | Which value is compared with a value slab, and what applies near a bound | CA | S1-F11, S4-F02 | Live S4 | Yes |
| RR-138 | GC7-3; CA 23 | Tax rounding: per line or bill, per component or total, mode, what is rounded | Accounts, CA | S1-F11 | Live S4 | Yes, named synthetic rules |
| RR-139 | GC7-4; Accounts 16 | Whether and how the amount due is rounded | Accounts, CA | S1-F11, S4-F02 | Live S4 | Yes |
| RR-140 | GC7-5; Accounts 17 | How a percentage discount on a line is rounded | Accounts | S1-F11 | Live S4 | Yes |
| RR-141 | GC7-6; Accounts 18 | Does a bill's round-off count in the refund cap | Accounts, CA | S1-F11, S4-F05 | Live S4 | Yes |
| RR-142 | GC7-7; KDPS Owner 55 | May a manual discount apply to a line with an offer, and in which order | KDPS Owner, Brand manager | S4-F02 | Live S4 | Yes |
| RR-143 | GC7-8; CA 24 | For each registration: does a counter sale carry tax, which components and shares | CA | S1-F11, S4-F02 | Live S4 | Yes |
| RR-144 | GC7-9; KDPS Owner 56 | Per offer: marked-down prices, reward units, the meaning of each offer kind, how combined offers apply | Brand manager; KDPS Owner | S4-F04 | Live S4 | Yes |
| RR-145 | GC7-10; CA 20 | Is spreading a group discount by price (`DEC-109`) the correct tax treatment | CA | S1-F11, S4-F02 | Live S4 | Yes |
| RR-146 | SL-5; CA 13 | How a net realisable value write-down is worked out, spread and reversed | CA | S5-F01 | Live S5 | Yes |
| RR-147 | SL-6 | How value is divided when the cost formula or pool mode changes | CA | S1-F10, S5-F01 | Live: before any change | Yes |
| RR-148 | SL-14; CA 14 | How Store value is shown under a book pool | Accounts, CA | S5-F07, S5-F09 | Live S5 | Yes |
| RR-149 | SL-15; CA 15 | Accounting date of a late valued movement whose business date is in a locked period | Accounts, CA | S5-F01 | Live S5 | Yes |
| RR-150 | SL-17 (beyond V-35); CA 5 | Whether a cancelled billed-retained sale's goods return at a cost; what value carried billed-retained items take at the switch | CA | S4-F07, S4-F12 | Live S4 | Yes |
| RR-151 | KDPS (answerer Operations); design-language 12; `DEC-084` | Piece-label layout, label and receipt printer models, the label printers' command language | KDPS Operations; design | S2-F07 | Code: the printer adapter of S2-F07 | Yes, with a fake printer |
| RR-152 | KDPS (answerer not named); design-language 12 | One real messy delivery to test the reconciliation layout | KDPS Owner | S2-F02 | Accept S2-F02 (design input) | Yes |
| RR-153 | KDPS (answerer not named) | Logo artwork | KDPS Owner | S4 screens, bills | Live S4 (before the pilot switch) | Yes |
| RR-154 | `POL-12.04`; KDPS (answerer not named) | What partner users see in their statements and ledger | KDPS | S5-F08 | Design S5-F08 | Yes |
| RR-155 | Accounts 12, 13; PRD "Business measures" | Targets marked proposed (Tally rejection, profit timing). Goals, never settings | Accounts | Reports | None | Yes |
| RR-156 | KDPS Owner 57 | A fixed daily export from the earlier POS for the side-by-side test | KDPS Owner | S2-F12 | Live: the side-by-side test | Yes, synthetic replicas |
| RR-199 | `DEC-112` (data notes gap 18, A-4) | The order of seasons used to flag older stock, and the cutoff for "old". Not set; season never stands for a receipt date or an age. A KDPS question is added with the PRD bullet (RR-047) | KDPS Owner, Booking | S1-F13, S4-F12 | Live S4 (opening stock at the switch) | Yes, labelled synthetic order |

## 7. External approval

### 7.1 Policy signatures

All 19 policies are Open: none is signed ([kdps-policies.md](../kdps-policies.md) status table). A policy is Signed when its "Signed by, date" line is complete (`DEC-092`). Its live operations also need their real values configured and validated by a different person (DM-6, `DEC-105`). Synthetic work proceeds for every policy.

| RR | Policy | Decided by | Live gate | Features it switches on |
| --- | --- | --- | --- | --- |
| RR-157 | 1 Commercial ownership | Owner, Accounts | Live S2 | S2-F01, S2-F03, S2-F06, S3-F07, S3-F08 |
| RR-158 | 2 Permissions and approvals | Owner, Admin | Live S1 | S1-F01, S1-F05, S1-F08; count rules S3-F05; day close S4-F08; phone approval S5-F11 |
| RR-159 | 3 Source conflicts and pricing | Booking, Accounts | Live S2 | S2-F04, S2-F06 |
| RR-160 | 4 Merchandise tracking | Booking, Operations | Live S1 | S1-F03, S2-F02, S2-F07 |
| RR-161 | 5 Booking | Owner, Booking | Live S2 | S2-F01 |
| RR-162 | 6 Customer returns | Owner, Operations | Live S4 | S4-F05 |
| RR-163 | 7 Refunds and no-bill returns | Owner, Accounts | Live S4; Customer credit S5 | S4-F05, S4-F06, S5-F05 |
| RR-164 | 8 Billed-retained | Operations, Accounts | Live S4 | S4-F07 |
| RR-165 | 9 Financial posting | Accounts, CA | Live S1; allocation, assets, vouchers S5 | S1-F09, S1-F10, S2-F06, S5-F01, S5-F02, S5-F07 |
| RR-166 | 10 Statutory applicability | Accounts, CA | Live S2 to S6 by part | S1-F02, S1-F09, S3-F03, S4-F09, S5-F06, S6-F03 |
| RR-167 | 11 Official book | Owner, CA | Live S5 | S5-F01 |
| RR-168 | 12 Franchise/partner | Owner, Accounts | Live S5 | S5-F05, S5-F08 |
| RR-169 | 13 Workforce | Owner, HR | Live S6 | S6-F01 to S6-F03 |
| RR-170 | 14 Opening and cutover | Owner, Accounts, Operations | Live S4 (before the pilot switch) | S1-F13 publishing, S4-F12 |
| RR-171 | 15 Planning | Owner, Booking | Live S6 | S6-F04 |
| RR-172 | 16 Offline operation | Owner, Operations | Live S4 | S4-F11 |
| RR-173 | 17 Held-goods outcomes | Owner, Operations, Accounts | Live S2; write-off and disposal S3 | S2-F08, S3-F06 |
| RR-174 | 18 Recovery and retention | Owner, Admin | Live S1 | S1-F14 |
| RR-175 | 19 Offers and promotions | Owner, Brand manager | Live S4 | S4-F04, S6-F04 (markdowns) |

### 7.2 Baseline picks awaiting confirmation, and agreements

The build follows the `DEC-105` and `DEC-112` baseline picks now. Each confirmer may confirm or ask for a change; a change is a new decision entry and reworks the features named.

| RR | Original ID and source | Confirmation or agreement needed | Owner | Affects | Blocks at | Synthetic work proceeds |
| --- | --- | --- | --- | --- | --- | --- |
| RR-176 | GC2-1 (CA 16), MM-3 and SL-23 (Outcome A), MM-10, MM-13 | Confirm the registration-in-Site-State check, Outcome A for a missing posting map, IRN before issue, and the statutory document for a registration-only change | CA | S1-F02, S1-F09, S1-F10, S4-F09, S3-F03 | Live: the affected stages | Yes |
| RR-177 | GC3-1, GC3-4 (KDPS Owner 50), GC3-6 pick, GC3-7 (KDPS Owner 51), GC3-8 pick, GC3-12, DM-5, DM-8 limits basis, MM-8 pick, cost drift, Owner and losses (KDPS Owner 42) | Confirm the access, approval and loss-approval picks | KDPS Owner (with Admin where named) | S1-F01, S1-F03, S1-F04, S1-F05, S3-F05, S3-F06 | Live S1 to S3 | Yes |
| RR-178 | GC2-2, MM-12 | Confirm second-person approval of structure, mapping and agreement changes and the separate mapping verification; confirm the voucher model with and without items | Accounts, CA; KDPS Owner and Admin for GC2-2 | S1-F02, S1-F03, S5-F02 | Live S1, S5 | Yes |
| RR-179 | GC2-5, GC2-9, GC3-9, DM-4 | Confirm: no stock-unit change while stock exists; approved vocabulary for list attributes; staff see their own record read-only; the state names | Booking, Operations; Booking; KDPS Owner and HR; design review | S1-F03, S6-F01, every screen | Live S1, S6 | Yes |
| RR-180 | D-4; KDPS Owner 37 | KDPS agrees to hold real data on the Railway test setup outside India, and says whether customer details are imported | KDPS Owner | S2-F12, every `kdps-test` use | Live: before KDPS's side-by-side test | Yes |
| RR-181 | D-5; Accounts 11 | A separate test Tally company for the connector | Accounts | S5-F02 | Accept S5-F02 | Yes, until stage 5 testing |
| RR-182 | SL-4; CA 2; `POL-09.06` | Validate the cost rules with real cases: supplier-return variance, late-cost split, reversals, FIFO layer dates, posting order, consignment pass-through | CA; product owner | S1-F10 | Live S2 | Yes |
| RR-183 | V-65; `DEC-029`, `DEC-085` | The name of the KDPS representative who agreed `DEC-017` to `DEC-022` | Product owner | Policy 2 signature | Live S1 (signature record) | Yes |
| RR-184 | KDPS Owner 40; `DEC-053` | Does the earlier POS accept the approved PT export in the KDPS layout | KDPS Owner | S2-F04 | Live: the side-by-side test | Yes |
| RR-197 | `DEC-112`: GC6-4, GC6-6, GC6-8; KDPS Owner 37, 59; D-4 | Confirm the import picks for KDPS: a separate person confirms each new or changed layout and mapping version, and who the confirmers are; on `kdps-test`, files with customer-contact columns refused before storing; opening files staged and validated there as a rehearsal that never publishes | KDPS Owner | S1-F06, S1-F13, S2-F12 | Live S1 (layout confirmation); the side-by-side test | Yes |
| RR-198 | `DEC-112`: GC4-2, GC4-4; CA 18, Accounts 21; `POL-09.01` | Confirm the posting-map workflow (an Accounts maker, a different Accounts approver in the app, the CA's evidence attached or referenced before a version takes effect, one piece of evidence possibly covering a named set of versions) and one journal series per book and financial year. This is not the Accounts and CA approval of the rules themselves | Accounts, CA | S1-F09, S1-F10 | Live S2 (first live posting) | Yes |

## 8. Runtime verification

| RR | Original ID and source | What must be proved | Owner | Affects | Blocks at | Synthetic work proceeds |
| --- | --- | --- | --- | --- | --- | --- |
| RR-036 | GC6-5; `DEC-112` | The caps at intake (uploaded and expanded size, rows, parser memory, processing time): chosen, documented and tuned by the builders within the safeguards of GC-6 9.3, tested with representative synthetic files; excess refused clearly, never truncated; a cap that blocks a required workflow reported to the product owner | Builders | S1-F06 | Live: intake on `kdps-test` | Yes |
| RR-185 | Found 5 Oct 2026 | On this machine `pnpm` is not on the PATH (the workspace pins `pnpm@12.4.1`; corepack is installed but not enabled) and Docker is absent, so `pnpm` scripts and integration tests cannot run locally. CI runs them | Builders | Every feature | Code: the stage 0 start gate (S0-T02) | Yes, through CI |
| RR-186 | Found 5 Oct 2026: GitHub Actions runs 37180459025 to 37279667535 | The Doc check workflow has failed on every push since 4 Oct 2026: `actions/setup-node` looks for pnpm, which that workflow never installs, so the doc checker has not run in CI since. It passes locally (0 errors) | Builders | Every document change | Code: the stage 0 start gate (S0-T03) | Yes; the pre-commit hook still runs locally |
| RR-187 | [deployment.md](../design/platform/deployment.md) sections 1, 2, 4; house rules CH-2 | The Railway `dev` and `kdps-test` environments, services, bucket and automatic deploys from `main` were not inspected; nor was Railway's PostgreSQL major version, which must be 17 like the tests (`DEC-112`) | Product owner | S1-F06 on `dev`; every `dev` demo | Accept: the first demo on `dev` | Yes, locally and in CI |
| RR-188 | `POL-18.03`; V-63; GC-9 | A restore proof on synthetic data at stage 1 exit; Admin's restore drill before go-live | Builders; Admin | S1-F14 | Exit S1; Live S1 | Yes |
| RR-189 | PRD "Performance"; stock-ledger 10.6 and 11.9; [deployment.md](../design/platform/deployment.md) 8 | The 10,000-line PT import under one minute (S1-F07); a large posting while counters sell (S1-F10); counter lookup and finalisation on real Store connections during the side-by-side test | Builders | S1-F07, S1-F10, S4-F02 | Accept S1-F07, S1-F10; Live S4 (production choice) | Yes |
| RR-190 | [deployment.md](../design/platform/deployment.md) 4; access-and-approvals 7.2 | The runtime role owns no table and cannot bypass row-level security; with no actor set no scoped row shows | Builders | S0-T05, S1-F01 | Accept S1-F01 | Yes |
| RR-191 | stock-ledger 11.9; `PRD-SEC-016`; `PRD-ACP-018` | Concurrency suites on real PostgreSQL for every posting feature | Builders | S1-F01, S1-F10 onwards | Accept: each posting feature | Yes |
| RR-192 | `PRD-SEC-016` | Persona browser journeys for every affected change; none exists until Playwright arrives with S1-F01 | Builders | Every feature with screens | Accept: each such feature | Yes |
| RR-196 | `S0-T06` code review, 5 Oct 2026; code-house-rules 10.1, 11.3 | The two isolation test files wait up to 240 s for each other, and the runner does not promise to schedule them together. Fine while the integration run takes seconds; recheck when it grows past about two minutes, for example by running the pair first | Builders | Every integration run | None | Yes |
| RR-200 | House rules CH-3; `DEC-112` | The runtime role's time limits: the starting values for synthetic work (lock wait 1 s, statement 5 s) set on the role locally, in tests and on `dev`, then measured and tuned; a command that reaches one rolls back and reports the failure. `apps/server/db/roles.sql` and the Railway runbook, which still says no limit is set, are updated for `dev` only. With the 1 s lock limit, counter postings in a book can time out behind a large posting job holding the journal series (GC4-4); the `S1-F10` measurement checks it. The limits of `kdps-test` and production are set only after measurement | Builders | S1-F01 onwards | Accept: the first demo on `dev` | Yes |

## 9. Report entries checked for staleness

Reports are snapshots and decide nothing. These entries were checked against the decisions and designs on 5 Oct 2026. They are not counted as active; the reports were left unchanged.

| Entry | Where | Status today |
| --- | --- | --- |
| GC-10: file storage provider for the test setup | [gaps-before-code.md](../reports/gaps-before-code.md) section 4 | **Stale.** Settled as a baseline by `DEC-105` (D-2): a Railway bucket. [deployment.md](../design/platform/deployment.md) section 2 and module-map 4.7 already say so |
| "SL-22 and SL-23 block stage 1: they belong to the financial posting design (GC-4)" | gaps-before-code section 6 | **Stale.** SL-22 is settled by `DEC-097` ([access-and-approvals.md](../design/access/access-and-approvals.md) 9.8). SL-23 is the `DEC-105` baseline, Outcome A, applied in [books-and-posting.md](../design/finance/books-and-posting.md) section 10; the CA confirms it (RR-176) |
| GC-8 and GC-9 missing; `packages/calculations` not created; house rules partial | gaps-before-code sections 1 to 3 | **Current** (RR-014, RR-010, RR-005, RR-011) |
| GC-11: who builds | gaps-before-code section 4 | **Current** (RR-031) |
| Product-owner list under "Since this report": file storage (D-2, GC-10), SL-22, SL-23, the custom domain (D-3), SL-18, the helper and gateway route (D-6), the registration-only change | [alignment-report.md](../reports/alignment-report.md) section 1 | **Stale.** All settled or baseline: `DEC-097` for SL-22, `DEC-105` for the rest (MM-13 for the registration-only change) |
| Same list: GC-11, `DEC-067`, D-1, SL-9, SL-11, the later plan of SL-10 | alignment-report section 1 | **Current** (RR-031, RR-043, RR-029, RR-044, RR-046, RR-045) |
| SL-10: "How the customer is served meanwhile is OPEN" | alignment-report section 1 | **Stale.** `DEC-105` sets it: the no-bill return route where policy 7 allows it, otherwise refused with the reason shown |
| "The imports and opening-data design (GC-6, not yet written)" | [data-notes/README.md](../data-notes/README.md), the row for data-quality-and-import-rules | **Stale.** GC-6 was written on 5 Oct 2026 ([imports-and-opening-data.md](../design/platform/imports-and-opening-data.md)) |
| A-8: abandonment outcome | alignment-report 2.1 | **Current**, same item as V-34 (RR-095) |

## 10. Excluded from the active count

| Kind | IDs |
| --- | --- |
| Struck values | V-26 (`DEC-007`), V-27 (`DEC-020`; approvers and limits stay V-02), V-55 (`DEC-015`; limits stay V-02) |
| Settled stock-ledger questions | SL-12, SL-13, SL-16 (`DEC-034`, `DEC-035`), SL-19 (`DEC-089`), SL-20, SL-21 (`DEC-087`), SL-22 (`DEC-097`) |
| Baseline picks of `DEC-105` with no confirmer, or whose confirmation is counted in RR-176 to RR-179 | SL-18, SL-23, MM-1, MM-3, MM-6, MM-7, MM-8, MM-10, MM-12, MM-13, MM-14, MM-15, DM-4 to DM-8, GC2-1 to GC2-7, GC2-9, GC3-1, GC3-4, GC3-6 (pick), GC3-7, GC3-8 (pick), GC3-9, GC3-12, D-2, D-3, D-6 |
| Settled or baseline by `DEC-112` (5 Oct 2026), with no confirmer or with their confirmation counted in RR-197 and RR-198 | RR-032 (GC6-1), RR-034 (GC6-3), RR-035 (GC6-4), RR-037 (GC6-6), RR-039 (GC6-8), RR-053 (GC4-2); GC4-4; house rules CH-1, CH-4, CH-5, CH-7 and the development baselines of CH-2 and CH-3 (their open parts are RR-187 and RR-200); harness decisions H1 to H6 (their write-up stays in RR-013). RR-036 moved to section 8 |
| Settled module-map, domain-model and access questions | MM-2 (`DEC-093`), MM-4, MM-5 (`DEC-097`), MM-9 (`DEC-099`), DM-1 (`DEC-094`), DM-2 (`DEC-095`), DM-3 (`DEC-096`), DM-9, GC2-8 (`DEC-098`), GC3-2 (`DEC-101`), GC3-3 (`DEC-102`), GC3-10 (`DEC-104`), GC3-11 (`DEC-103`) |
| Settled report conflicts | Alignment report A-1 to A-7, A-9; B-1 to B-19 have their policy homes, and their values are V-numbers above |
| Dropped data-note questions | The 21 questions of Part C of [open-questions.md](../data-notes/open-questions.md): they ask only how an old sheet works |
| Data-note questions not yet moved to the official list | The 132 questions in Parts A and B of [open-questions.md](../data-notes/open-questions.md). They are source observations: a question there changes nothing until it is moved into [questions-for-kdps.md](../questions-for-kdps.md) through the doc gate. Those that gate a feature are lifted above (RR-041, RR-049; RR-032 is settled by `DEC-112`) |

## 11. Observations, proposals and decisions

- **Decisions** are the `DEC-` entries and the PRD and policy text. Only they bind the build.
- **Baseline picks** of `DEC-105` and `DEC-112` bind the build until a confirmer asks for a change (section 7.2).
- **Proposals** are marked "Proposed" in the designs (GC6-15, GC-7 5.6 and 5.8) or are the data notes' gap drafts. They bind nothing. Where a task would have to choose one, the gate is Code for that task.
- **Source observations** are what the KDPS files show today ([data-notes/](../data-notes/README.md)). They are evidence of need, never settings, and analyst values are never defaults.
