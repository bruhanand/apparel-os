# AGENTS.md
<!-- deps: none — contributor guide intro -->

This file guides AI coding agents working in this repository. `CLAUDE.md` is a link to this file; edit this one.

## Current state
<!-- deps: prd.md#stack — planned toolchain sentence restates PRD stack rows -->

Apparel OS is a retail ERP for apparel, footwear and packaged-goods businesses. The first customer is KDPS Lifestyle Pvt. Ltd. (KDPS).

The repository holds the documents, the doc checker (see "Checking the documents") and the code workspace skeleton (see "Code workspace"). There is no business code yet. Use only the commands listed there; do not invent others.

The toolchain, from the PRD's "Technical platform" section, is pnpm workspaces with Turborepo, strict TypeScript, Vitest, Playwright, Testcontainers with real PostgreSQL, ESLint and Prettier. Playwright arrives with the first real screen, or earlier with the counter run of the shared golden cases (`docs/design/calculations/shared-calculations.md` 12.2).

## Document order
<!-- deps: none — contributor process; restates docs/README.md order -->

`docs/README.md` is binding. When two documents disagree, the higher one wins:

1. `docs/prd.md`: what the product does. Source of truth for requirements and vocabulary.
2. `docs/kdps-policies.md`: what KDPS decided, within the options the PRD allows.
3. `docs/design/`: how the system implements both. Never contradicts the two above.
4. Code: implements the design.

`docs/phases.md` sets delivery order only; the PRD and policies win over it. `docs/decisions.md` logs why the PRD or policies changed. `docs/reports/` holds one-time reports and `docs/questions-for-kdps.md` holds open questions; neither decides anything. `docs/implementation/` (the implementation plan) and `docs/data-notes/` are not ranked either: they decide nothing, and the plan follows `docs/phases.md`.

- Fix the lower document to match the higher one. Never edit a higher document just to fit a lower one.
- A business decision is never settled in design or code. Raise it against the PRD or the policies.
- Use words exactly as the PRD's "Words used" tables define them, in docs and code. Add a new term there first.
- When documents clash, report the clash instead of guessing.
- Code that differs from its design is a defect: fix the code, or change the design first. Where no design exists yet, code follows the PRD and the policies directly, and the missing design is noted.



## Never invent a value
<!-- deps: prd.md#required-policy-configuration, PRD-SEC-017, DEC-071 — no invented values, no active defaults -->

- Never invent a policy value, threshold, tolerance, account, rate, limit, formula, date or approver. Not in documents, not in code, not in configuration.
- Mark every unknown as **OPEN** and name its owner: the product owner, the KDPS Owner, the CA or Accounts (or another PRD persona the PRD names as decider). Say which delivery stage it blocks.
- Synthetic test data is allowed only when it is labelled as synthetic. It never becomes a default.
- An example in the PRD or policies (such as "30-, 15- and 7-day reminders") is not a setting until a signed policy makes it one.



## Alignment rules

- Every requirement bullet in `prd.md` has a stable ID such as `PRD-STK-001` (section prefix, then a three-digit number). Every policy answer bullet has one such as `POL-09.04` (policy 9, answer bullet 4). The ID opens the bullet, in backticks. Each file explains its prefixes under its rank banner.
- A new bullet takes the next free number in its prefix. An edited bullet keeps its ID.
- IDs are never renumbered or reused. A removed rule's ID is retired, not given to another rule.
- Design documents cite the requirement and policy IDs they implement: in their header and next to each rule they apply. Code and tests cite the ID where a rule is enforced.
- Any change to `prd.md` or `kdps-policies.md` is logged first in `docs/decisions.md`: one short entry (`DEC-001` …) with date, who decided, question, options, choice and why, and the IDs changed. Then edit the document to match the entry.
- The PRD and policy text belong to the user. Propose a decision entry and wait for approval unless the user decides the change directly.
- Questions only KDPS or the CA can answer go in `docs/questions-for-kdps.md`, grouped by person, in plain language.



## Checking the documents
<!-- deps: none — how the doc checker works -->

`tools/doc-check/check.mts` checks IDs, decision entries, links and tables, and keeps the review gate. It needs Node.js 22.18 or later, which runs TypeScript directly, and git; `--staged` also uses `tar`.

| Command | What it does |
| --- | --- |
| `node tools/doc-check/check.mts` | Runs every check. Exit code 1 means errors. |
| `node tools/doc-check/check.mts impact <ID> [<ID> ...]` | Lists the sections a change to these rules, decisions or source headings (`prd.md#…`) would flag, before you make it. |
| `node tools/doc-check/check.mts packet --out <file> [--split <n>]` | Writes the review packet for the stale sections, in `n` parts. Refuses while any error other than "Review required" is open, except a record left by a removed section (`--force` writes it anyway). Leaves out sections already sent unchanged (`--all` sends them again). |
| `node tools/doc-check/check.mts record <file> [<file> ...] --by "<name>"` | Records the verdicts in the files: one line per section with its key, the State from the packet and its own reason, separated by tabs. |
| `node tools/doc-check/check.mts review "<section>" --by "<name>" --reason "<text>"` | Records the review of one section. |
| `node tools/doc-check/check.mts drop "<section>"` | Forgets the record of a section that no longer exists. |
| `node tools/doc-check/check.mts list [<filter>]` | Lists the sections and what each depends on. |
| `node tools/doc-check/check.mts coverage` | Lists the PRD and policy IDs no tracked section cites. Never fails. |
| `node tools/doc-check/check.mts --staged` | Checks exactly what the next commit holds: the staged documents and the staged checker, read from a copy of the index. The index and the working tree are not changed. The pre-commit hook uses it. |
| `node tools/doc-check/check.mts test` | The checker's own tests, on synthetic repositories. |

- **Sections.** Every section of `docs/design/`, `docs/phases.md`, `docs/questions-for-kdps.md` and this file is tracked, as is each data block of `ui-blueprint.html` and the page of each other HTML file in `docs/design/`.
- **Dependencies.** A section depends on the IDs it cites and on any `prd.md#…` or `kdps-policies.md#…` heading it names. One hop further, it depends on what the sections it points at cite: "(10.6)" in the same document, or a numbered section of another document named in words, such as `stock-ledger 10.4` or `deployment.md section 7`. A whole-section number covers its subsections. A pointer inside backticks is an example and does not count. A new decision entry whose Choice or Changed line cites a rule counts as a change to that rule.
- **Declaring.** A section that applies no rule carries `<!-- deps: none — reason -->` (in the blueprint script, `/* deps: none — reason */`). A section that rests on rules its text does not cite names them the same way: `<!-- deps: <IDs> — reason -->`.
- **Stale.** A section is stale when, since its record in `docs/reviews.json`, its own text changed, a source's text or decisions changed, it cites a source its record did not have, or it no longer cites one its record had. The check fails until each stale section is fixed or confirmed.
- **Decision log.** A PRD or policy bullet changed since the last commit needs a decision entry, added or edited since the PRD or policies were last committed, that cites it. A removed bullet needs such an entry too, and its ID must be listed as retired. A retired ID stays retired, and a decision entry is never removed. A new or changed bullet that no section cites gets a warning, and `packet` lists it: run the broad sweep. A stock, money or access bullet that changed, or that the Choice or Changed line of a new or edited decision cites, asks for the broad sweep whether or not a section cites it.
- **References.** The check fails on a pointer to a section number that a tracked document does not have, on a document name two files share (README), and on two sections with the same number.
- **Records.** `docs/reviews.json` must be exactly as the checker writes it, so a record duplicated by a merge or edited by hand fails the check, and no record can be written until it is fixed. A record whose section is gone names the section it may have become. A stale section whose record is only a baseline says so: read all of it, not only the change.
- **Headers.** A design document whose header lists its IDs ("- PRD IDs:", "- Policies:", "- Decisions:") lists every ID its sections cite, outside `<!-- -->` comments. A section that only places IDs, such as an ownership table, carries `<!-- header: not listed — reason -->`.
- **Reports** get the ID, link and table checks only. `alignment-sweep.md` and `decision-pack.md` are frozen proposals and may name IDs that were never added.

### Change gate
<!-- deps: none — how the doc checker works -->

1. Log the decision entry.
2. Edit the PRD or the policies. The entry and the edit may be separate commits, entry first.
3. Run the checker. Fix every error that is not "Review required" first. It warns when a stock, money or access rule changed.
4. Write the packet and run the AI review in `tools/doc-check/ai-review.md`. Run its broad sweep when warned.
5. Record the verdicts with `record`. Fix each finding, or record a finding judged not to be a clash with `review` and a reason. Then write the packet again: it holds only what changed since.
6. Run the checker until it passes, then commit.

Gather the decisions of a round before step 3, so each section is reviewed once; `impact` shows what a round will flag.

The pre-commit hook in `.githooks/` runs the checker on the staged snapshot, and the checker's tests when the checker changes. Enable it once per clone with `git config core.hooksPath .githooks`. GitHub runs both on every push and pull request (`.github/workflows/doc-check.yml`); a first push of a new branch is compared with where it left `main`. A base given with `--base` that does not exist is an error.

### Honest reviews
<!-- deps: none — how the doc checker works -->

- The checker never writes records. Only `review`, `record`, `drop` and the one-time `baseline` do.
- Record a review only after reading the section against its current sources. The reason says what was compared and what was found.
- One section per `review` call or `record` line, with that section's own reason from an actual review. Never record sections with one blanket reason to make the check pass. `record` refuses a verdict whose section changed after the reviewer read it, a reason of fewer than 8 words, a reason given for another section in the same files or already recorded for another section, and a reason that repeats the section's last record.
- Records marked `baseline` were taken on 3 Oct 2026 after the alignment sweep. They are a starting point, not reviews.
- A passing check is not proof that the documents are right. The checker follows IDs, pointers and fingerprints; it cannot read meaning.



## Working on the documents
<!-- deps: PRD-ACS-002, PRD-ACS-003, prd.md#people-access-and-approvals — 14 personas; a persona grants no access -->

- Do not delete or reword existing PRD rules as a side effect of another edit.
- PRD style: short imperative bullets, British spelling (Organisation, colour), capitalised defined nouns (Site, Store, Organisation).
- People are described by the PRD's 14 personas, each with an ID (P-OWN … P-AUD). A person can hold several; a persona grants no access, only role assignments do. Details and the earlier-code crosswalk: `docs/design/access/personas.md`.
- UI design lives in `docs/design/ui/`: `design-language.md` (tokens, states, components), `ui-blueprint.html` (screens, menus by persona), `design-system.html` (the live visual version of the design language) and `design-system-preview.html` (visual examples only). Each names the PRD sections and KDPS policies it implements.
- `ui-blueprint.html` renders only with `support.js` beside it and an internet connection (it loads React from unpkg). Its content lives in the `<script data-dc-script>` block at the end of the file.
- `design-system.html` is a self-contained bundle that opens offline. Its page is one JSON string in `<script type="__bundler/template">`: unpack it with `json.loads`, edit, and repack with `json.dumps(page, ensure_ascii=False).replace('</', '<\\u002F')`. Leave the manifest (fonts, React, runtime) alone.
- Test hosting (Railway environments, services, one origin, what the test setup never does) is in `docs/design/platform/deployment.md`. Production hosting is not designed yet.
- The stock ledger (movements, the five separate stock facts, holds and reservations, cost pools and layers, counts, locking, golden scenarios) is in `docs/design/stock/stock-ledger.md`. Every stage posts stock through it.
- The module map (modules, what each owns, interfaces, events, transaction boundaries, where every PRD ID lives) is in `docs/design/architecture/module-map.md`. The domain model (records, identities, lifecycles, invariants, approval boundaries) is in `docs/design/architecture/domain-model.md`. Every other design and all code follow them. Their open questions are MM-n and DM-n.
- The business structure and masters (legal entities, registrations, books, Sites, Stores, business units, locations, the place tree for access; brands, SKUs, external codes, units and packs, tracking profiles, parties, agreements; their tables) are in `docs/design/masters/structure-and-masters.md` (GC-2). Its open questions are GC2-n.
- Access, approvals, inbox and exceptions (sign-in with the Organisation code and TOTP, sessions, roles, role assignments and scope, restricted fields and encryption, row-level security, approval limits, independent, bulk and phone approval, stand-ins, the approval of a document a job posts, My work, the exception record, service identities, partner users; their tables) are in `docs/design/access/access-and-approvals.md` (GC-3). Its open questions are GC3-n.
- Books and posting (books and their cost and Tally voucher settings, the chart of accounts, financial periods with their locks and reopenings, balanced journals, posting maps, posting event kinds, the hand-off from valued stock movements, the SL-23 baseline, the ledger and trial balance, their tables, and the posting half of the golden scenarios) are in `docs/design/finance/books-and-posting.md` (GC-4). Its open questions are GC4-n.
- Shared calculations (the pure package `packages/calculations`, its tier and what the counter never gets; integer paise, exact intermediates and named rounding rules; the rule versions every bill keeps; start price and the MRP cap, offer eligibility and the best permitted set, the spread of group discounts, manual discounts, tax by classification, rate and value slab, the bill round-off; tenders; return values, exchanges and split-tender refunds; costing and ticket margin; incentives in outline; the tax-rule records and their tables; the golden-case format, how one set runs on server and counter, and the cases) are in `docs/design/calculations/shared-calculations.md` (GC-7). Its open questions are GC7-n.
- Document numbering and audit history (business codes, number series, the bill series per billing device, tax registration and financial year, formats, the audit record and the access record; their tables) are in `docs/design/platform/numbering-and-audit.md` (GC-5). Its open questions are GC5-n.
- Imports and opening data (file intake and format readers, the stored original, versioned layouts, mappings and mapping rules, staging and the origin of each value, the five batch kinds, duplicate control and corrections, the validation report, the import handler contract, the opening-data layouts for stock, dues, advances and deposits and their reconciliation; their tables) are in `docs/design/platform/imports-and-opening-data.md` (GC-6). The data notes' layouts are samples, never settings. Its open questions are GC6-n.
- The UI was first drawn for RetailsOps, an earlier version of this product in another repo. Its codes (G-, OQ-, R-, BP-) and decisions are not requirements; anything still wanted belongs in the PRD or the policies.



## Delivery

Build in the six stages of `docs/phases.md`: shared foundation, goods-in, stock movement, store day, financial control, people and planning. Design, development and synthetic-data testing may proceed before KDPS policy signatures. Enable each policy-dependent live operation only after the required policy is signed and its real values, authorities and evidence are configured and validated. Stage 1 fixes the stock and money recording rules; each later live operational stage records its stock and money effects from its first enabled operation. Design offline billing in stage 1; enable it only under the signed Offline operation policy. Screens are English first; Hindi for stages 1 to 5 arrives in stage 5 and for stage 6 in stage 6; email, WhatsApp and SMS messaging arrive in stage 5; before then nothing is sent, and alerts reach people in My work (DEC-099, `PRD-EXC-013`).

During the side-by-side test, the earlier POS keeps selling and stays the system of record. Its daily sales report and stock-on-hand (SOH) are imported into the Railway test setup for checking only; they never move stock (`PRD-LIF-014`). Stores switch over one at a time at a day close, but only on production hosting, which is chosen before the first switch (`PRD-LIF-026`).

## Code workspace
pnpm workspaces with Turborepo. Node.js 22.18 or later; the pnpm version is the one `package.json` names.

| Path | What it holds |
| --- | --- |
| `apps/server` | The NestJS modular monolith; it starts only with `AOS_RUNTIME_DATABASE_URL` and `AOS_DATABASE_POOL_MAX` set (`deployment.md` section 4). `src/kernel` holds plumbing; `src/modules/` holds one folder per module or part, such as `organisation` and `merchandise/catalogue`, each with an `index.ts` as its public interface |
| `apps/server/migrations` | The two migration sets, `directory/` and `organisation/`: reviewed SQL files `NNNN__<unit>__<what>.sql` with each set's table register, `tables.json` (code-house-rules 4.1) |
| `apps/server/db` | `roles.sql`, which creates the migration and runtime roles, and the runbook for creating them on Railway |
| `apps/server/test` | Tests that span units; `support/` (the test database helpers), `fixtures/` (synthetic labels and the two synthetic Organisations) and `seed/` (the local seed), none of which application code imports (code-house-rules 11) |
| `apps/web` | The React web app (Vite, Tailwind CSS) |
| `packages/domain` | Shared primitives: money in integer paise, Unknown, UUIDv7 |
| `packages/schemas` | Shared Zod schemas for the API, with the route table and the typed client (code-house-rules 12.2) |
| `packages/ui` | Shared UI helpers for shadcn/ui |
| `tools/module-check` | The module boundary check |

| Command | What it does |
| --- | --- |
| `pnpm install` | Installs dependencies. Run it once after cloning |
| `pnpm build` | Builds every package |
| `pnpm lint` | Type-aware ESLint |
| `pnpm typecheck` | Strict TypeScript |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:integration` | Tests against real PostgreSQL through Testcontainers, each file in its own databases (copies of the migrated templates, or empty ones for the runner and seed tests), at least two files at once. Needs Docker |
| `pnpm check:modules` | The module boundary check. Runs without an install |
| `pnpm migrate` | The pre-deploy step: migrates the directory database, then every Organisation database the directory lists, in code order, as the migration role, reaching each on the same server by the name the directory keeps. Refuses a connection string without a host, any other role, or a database that role does not own, and stops and exits 1 at the first failure. Needs `pnpm build` and `AOS_MIGRATION_DATABASE_URL` |
| `pnpm seed` | The local seed: builds it apart from the application, then creates the two synthetic Organisations' databases, migrates them and the directory database, and lists both in the directory, as the migration role. Refuses unless `AOS_ENVIRONMENT` is `local` or `dev`, and on Railway unless both it and the Railway environment are `dev`; refuses, before changing anything, a directory that lists an Organisation that is not synthetic or a seed code at another database. Writes no other row until the setup step (`S1-F01-T10`). Needs `AOS_MIGRATION_DATABASE_URL` |
| `pnpm format`, `pnpm format:check` | Prettier |

- Another module is imported only through its `index.ts`, and calls go to a lower tier, or to the same tier only where module-map sections 4 and 5 list the call (`PRD-MOD-002`, `PRD-SEC-015`; `module-map.md` sections 2 and 3). `pnpm check:modules` enforces both; its tier table is in `tools/module-check/check.mts` and changes with the module map.
- Every constructor injection names its token with `@Inject(...)`; nothing relies on decorator metadata.
- Money is integer paise through `@apparel-os/domain` (`PRD-MOD-014`). Unknown stays distinct from zero (`PRD-MOD-015`).
- Code and tests cite the PRD or policy ID where they enforce a rule.
- The pre-commit hook runs the module check when code is staged, and lint and typecheck too once dependencies are installed. `.github/workflows/code-check.yml` runs them with both test suites.
- The house rules for code are in `docs/design/platform/code-house-rules.md`. Part A (folder layout, database layout, migrations and roles, row-level security, append-only rows, transactions and locks, time, tests, fixtures) is reviewed and approved; `DEC-112` sets baselines for CH-1, CH-4, CH-5 and CH-7 and development baselines for CH-2 and CH-3, and its other open questions stay open at their gates. Part B (API shape, error envelope, idempotency key, version token, events, jobs, logs, screen text) was approved by the product owner on 6 Oct 2026, with CH-8 answered and CH-12 answered by `DEC-113`.

## Completing a code task

A task that changes code, such as a stage 0 or feature task of `docs/implementation/`, is complete only after the steps below. Code here means anything under `apps/`, `packages/` or `tools/` (the doc checker included), `.githooks/`, `.github/workflows/`, and the root workspace files the pre-commit hook lists. The steps add an independent review of the change and replace nothing: a document the task changes still passes "Change gate" and "Honest reviews"; document reviewers and their approval follow `docs/implementation/index.md` section 9; the approvals in the task's own completion criteria still apply; and committing, pushing and merging still wait for the product owner's go-ahead. A task that changes only documents follows "Change gate", "Honest reviews" and its own completion criteria, without these steps.

1. **Build.** Implement the task as agreed and run the tests it requires.
2. **Review.** Start an independent reviewer: a fresh agent session or a person who did not write the change. It is given the task, the changes and their sources, not the implementer's account of why the change is right. It reads the changes against the task and its completion criteria; the requirements, policies and decisions the task and its designs name, including any the change enforces without citing; the designs it implements; the code house rules; and this file. It returns findings, each with the file, the rule or design it breaks, why, and whether it is blocking. It edits no file and writes no review record.
3. **Triage.** The implementing session checks each finding against the code and its sources. It fixes every confirmed defect, with a test that proves the fix where one can, and states why each rejected finding is not a defect.
4. **Recheck.** Rerun the tests the fixes affect. The reviewer rechecks the fixes and what they touch, and sees each rejection with its reason. Repeat steps 3 and 4 until no blocking finding remains; a blocking finding still disputed goes to the product owner. A finding is blocking when it shows that the change breaks the task's criteria, a requirement, policy or decision, a design, the code house rules or this file, or that a test does not prove what it claims.
5. **Final checks.** On the final revision, run `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm check:modules`, `pnpm format:check` and the doc checker, with the checker's own tests when `tools/doc-check/` changed (`PRD-SEC-015`, `PRD-SEC-016`); browser journeys join them once Playwright exists. Where the task's completion criteria require CI, it must pass after the push the product owner allows. Record each non-blocking follow-up in the readiness register with its owner and the gate it blocks, and name it in the session handout.

- Keep a review to the task's change and what it touches. A finding outside that becomes a follow-up, not a fix in this task.
- When a fix would change business behaviour or the task's scope, stop and ask the product owner; a business decision goes up as "Document order" says. A KDPS value is marked OPEN and goes to `docs/questions-for-kdps.md`, as "Never invent a value" says; a fix never fills an OPEN value.
- The code reviewer's findings are not document review records. Only `review` and `record` write those, under "Honest reviews".
- If no independent reviewer can run, report that as a blocker and the task as not reviewed. Never call it reviewed.

## Stack
<!-- deps: prd.md#stack — restates the PRD stack table -->

From the PRD's "Technical platform" section. Use these; do not add others without a PRD change.


| Area            | Technology                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Language        | Strict TypeScript on a supported Node.js LTS. Python only for the forecasting service                                   |
| Repository      | pnpm workspaces and Turborepo: server, web, shared domain, schemas and UI packages                                      |
| Server          | NestJS modular monolith                                                                                                 |
| API             | REST/JSON, shared Zod schemas, generated OpenAPI and a typed client                                                     |
| Database        | PostgreSQL with constraints, row locks, triggers and row-level security                                                 |
| Database access | Drizzle ORM, reviewed SQL migrations, raw SQL for locking and reporting                                                 |
| Jobs            | pg-boss and a transactional outbox in PostgreSQL                                                                        |
| Live updates    | Server-Sent Events carrying identifiers, then an authorised refetch                                                     |
| Web             | React, Vite, TanStack Router/Query/Table, React Hook Form, Zod, Tailwind CSS, shadcn/ui                                 |
| Counter         | Chrome/Edge PWA with Dexie/IndexedDB and Workbox                                                                        |
| Hardware        | Keyboard-input scanners; ESC/POS receipt printing, cash drawer and label printing through a local helper on any PC that has the printer; Tauri only for an unmet hardware need |
| Phone           | React Native and Expo, sharing domain logic and schemas (not yet placed in a stage)                                     |
| Authentication  | PostgreSQL server sessions, secure cookies, Argon2, OTP and TOTP                                                        |
| Files           | S3-compatible storage; MinIO for local development                                                                      |
| Documents       | ExcelJS, format-specific import adapters, PDF extraction, HTML-to-PDF                                                   |
| Search          | PostgreSQL full-text and trigram search                                                                                 |
| AI              | Provider-neutral gateway, vision/document adapters, Zod validation, versioned prompts                                   |
| Forecasting     | A separate Python forecasting service; the only application language besides TypeScript                                 |
| Messaging       | Email, WhatsApp Business Platform and SMS adapters                                                                      |
| Diagnostics     | pino structured JSON logs; OpenTelemetry-ready traces                                                                   |
| Verification    | Vitest, Playwright, Testcontainers with real PostgreSQL, ESLint and Prettier                                            |
| Hosting         | Test, including KDPS's side-by-side test: Railway for the server, jobs, PostgreSQL, web app and counter PWA. Files on test: a Railway bucket, S3-compatible (`deployment.md` D-2, DEC-105). Production chosen before the first Store switch |




## Planned architecture
<!-- deps: prd.md#stack, PRD-MOD-001, PRD-MOD-002, PRD-MOD-003, PRD-MOD-006, PRD-MOD-007, PRD-MOD-011, PRD-MOD-012, PRD-MOD-014, PRD-MOD-015, PRD-INT-002, PRD-INT-003, PRD-INT-006, PRD-INT-007 — shape, tenancy, transactions, append-only, money, integrity -->

These come from the PRD's "Technical platform" section and apply to all code.

- **Shape.** A NestJS modular monolith, a React web app, a counter PWA with IndexedDB, and a separate Python forecasting service. Python is the only application language besides TypeScript.
- **Tenancy.** One PostgreSQL database per customer Organisation.
- **Modules.** Each module owns its tables and exposes a public interface. Other modules never read or write its tables. Reports read declared read models, with an as-of time, through module interfaces under the reader's own authorisation.
- **Transactions.** Synchronous economic effects run through module interfaces in one transaction. Durable follow-up goes through a PostgreSQL outbox processed by pg-boss.
- **Shared calculations.** Pricing, tax, discount allocation, rounding and incentive logic is written once in shared TypeScript and used by both server and counter.
- **Records are append-only.** Official document payloads and posted stock and accounting entries are never updated or deleted. Corrections and lifecycle changes are their own linked, attributable records; status projections are separate and rebuildable. Stock balances are derived from movements.
- **Money.** INR is stored as integer paise; another enabled currency in its configured integer minor unit. Intermediate steps are exact, and an amount becomes whole paise only under an explicit, named rounding rule. No binary floating point for money. Unknown values stay distinct from zero.
- **Integrity.** Every write carries a scoped idempotency key (sign-in excepted, code-house-rules 12.4). Locks are taken in a deterministic order, and authority, document version, state, independent approval and quantity are rechecked under the locks.
- **External systems.** Tally, GST, bank and messaging outcomes are tracked as pending, unknown, failed or succeeded, outside the local transaction. Retry only after reconciliation.



## Domain rules that cut across modules
<!-- deps: PRD-REC-008, PRD-STK-003, PRD-STK-001, PRD-REC-009, PRD-LED-005, PRD-ACS-006, PRD-ACS-007, PRD-SEC-017, PRD-SEC-003, PRD-SEC-004, PRD-ACP-001, PRD-REC-021, PRD-ORG-014, POL-02.07 — count creates stock, sellable test, separate facts, approvals, default off, AI drafts -->

- Only a physical count creates stock. Invoice, booking or price ticket (PT) quantities never do.
- A piece is sellable only with official PT coverage, barcode verification and physical acceptance at its selling Site, and no conflicting hold or reservation.
- Keep separate: physical custody, PT coverage, availability, ownership and accounting recognition.
- Independent approval means a different authorised person from the preparer. Approval binds to the exact document version.
- Nothing is on by default. A policy-dependent operation stays unavailable until its policy is configured.
- AI output is always a reviewable draft and never posts stock, money or tax.

