# AGENTS.md

This file guides AI coding agents working in this repository. `CLAUDE.md` is a link to this file; edit this one.

## Current state

Apparel OS is a retail ERP for apparel, footwear and packaged-goods businesses. The first customer is KDPS Lifestyle Pvt. Ltd. (KDPS).

The repository holds the documents (`docs/`, start at `docs/README.md` and `docs/STATUS.md`) and the code workspace (see "Code workspace"). Stage 1 is in progress: see `docs/plan/stage-1/README.md`. Use only the commands listed in "Code workspace"; do not invent others.

The toolchain, from the PRD's "Technical platform" section, is pnpm workspaces with Turborepo, strict TypeScript, Vitest, Playwright, Testcontainers with real PostgreSQL, ESLint and Prettier. Playwright arrived with `S1-F01-T15`, the first browser journey (`apps/web/e2e/`), which also unblocks the counter run of the shared golden cases (`docs/design/calculations/shared-calculations.md` 12.2).

## Document order

`docs/README.md` is binding. When two documents disagree, the higher one wins:

1. `docs/prd.md`: what the product does. Source of truth for requirements and vocabulary.
2. `docs/kdps-policies.md`: what KDPS decided, within the options the PRD allows.
3. `docs/design/`: how the system implements both. Never contradicts the two above.
4. Code: implements the design.

`docs/phases.md` sets delivery order only; the PRD and policies win over it. `docs/decisions.md` logs why the PRD or policies changed. `docs/questions-for-kdps.md` holds open questions for KDPS. `docs/plan/` (roadmap, stage folders with specs and tickets, open items, KDPS values, build rules), `docs/data-notes/`, `docs/research/` and `docs/history/` (old reports, kept as they were) are not ranked: they decide nothing, and the plan follows `docs/phases.md`.

- Fix the lower document to match the higher one. Never edit a higher document just to fit a lower one.
- A business decision is never settled in design or code. Raise it against the PRD or the policies.
- Use words exactly as the PRD's "Words used" tables define them, in docs and code. Add a new term there first.
- When documents clash, report the clash instead of guessing.
- Code that differs from its design is a defect: fix the code, or change the design first. Where no design exists yet, code follows the PRD and the policies directly, and the missing design is noted.


## Never invent a value

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
- Questions only KDPS or the CA can answer go in `docs/questions-for-kdps.md`, grouped by person, in plain language, and are tracked in `docs/plan/kdps-values.md`. Questions for the product owner go in `docs/plan/open-items.md`.
- `node tools/link-check/check.mts` (`pnpm check:links`) checks that every relative link in `docs/` and this file resolves and every cited `PRD-`, `POL-` and `DEC-` ID exists. It skips `docs/history/` and files git ignores. It reads no meaning: a passing check is not proof that the documents agree.


## Working on the documents

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
- The offline counter (billing devices, the device bill series, the counter app `apps/counter`, offline authority, the working set, local commit, upload, pause and release, the devices readiness check) is drafted in `docs/design/pos/offline-counter.md` (GC-8), and backup, restore and export in `docs/design/platform/backup-and-restore.md` (GC-9). Both are **Draft**: not yet approved by the product owner; their open questions are GC8-n and GC9-n.
- Imports and opening data (file intake and format readers, the stored original, versioned layouts, mappings and mapping rules, staging and the origin of each value, the five batch kinds, duplicate control and corrections, the validation report, the import handler contract, the opening-data layouts for stock, dues, advances and deposits and their reconciliation; their tables) are in `docs/design/platform/imports-and-opening-data.md` (GC-6). The data notes' layouts are samples, never settings. Its open questions are GC6-n.
- The UI was first drawn for RetailsOps, an earlier version of this product in another repo. Its codes (G-, OQ-, R-, BP-) and decisions are not requirements; anything still wanted belongs in the PRD or the policies.


## Delivery

Build in the six stages of `docs/phases.md`: shared foundation, goods-in, stock movement, store day, financial control, people and planning. Design, development and synthetic-data testing may proceed before KDPS policy signatures. Enable each policy-dependent live operation only after the required policy is signed and its real values, authorities and evidence are configured and validated. Stage 1 fixes the stock and money recording rules; each later live operational stage records its stock and money effects from its first enabled operation. Design offline billing in stage 1; enable it only under the signed Offline operation policy. Screens are English first; Hindi for stages 1 to 5 arrives in stage 5 and for stage 6 in stage 6; email, WhatsApp and SMS messaging arrive in stage 5; before then nothing is sent, and alerts reach people in My work (DEC-099, `PRD-EXC-013`).

During the side-by-side test, the earlier POS keeps selling and stays the system of record. Its daily sales report and stock-on-hand (SOH) are imported into the Railway test setup for checking only; they never move stock (`PRD-LIF-014`). Stores switch over one at a time at a day close, but only on production hosting, which is chosen before the first switch (`PRD-LIF-026`).

## Code workspace
pnpm workspaces with Turborepo. Node.js 22.18 or later; the pnpm version is the one `package.json` names.

| Path | What it holds |
| --- | --- |
| `apps/server` | The NestJS modular monolith; it starts only with `AOS_RUNTIME_DATABASE_URL` and `AOS_DATABASE_POOL_MAX` set (`deployment.md` section 4). `src/kernel` holds plumbing; `src/modules/` holds one folder per module or part, such as `organisation`, `configuration` and `merchandise/catalogue`, each with an `index.ts` as its public interface |
| `apps/server/migrations` | The two migration sets, `directory/` and `organisation/`: reviewed SQL files `NNNN__<unit>__<what>.sql` with each set's table register, `tables.json`, and the Organisation set's restricted maintenance, `maintenance.sql`, run after every migration run (code-house-rules 4.1, 4.3) |
| `apps/server/db` | `roles.sql`, which creates the migration and runtime roles; `runtime-limits-synthetic.sql`, the runtime role's starting time limits for synthetic work; and the runbook for creating them on Railway |
| `apps/server/test` | Tests that span units; `support/` (the test database helpers), `fixtures/` (synthetic labels and the two synthetic Organisations) and `seed/` (the local seed), none of which application code imports (code-house-rules 11) |
| `apps/web` | The React web app (Vite, Tailwind CSS) |
| `packages/domain` | Shared primitives: money in integer paise, Unknown, UUIDv7 |
| `packages/calculations` | The shared calculations of `shared-calculations.md` (GC-7): selling at `@apparel-os/calculations`, costing at `@apparel-os/calculations/costing` (server only); the golden cases in `golden/`. It imports only `@apparel-os/domain` |
| `packages/schemas` | Shared Zod schemas for the API, with the route table and the typed client (code-house-rules 12.2) |
| `packages/ui` | Shared UI helpers for shadcn/ui |
| `tools/module-check` | The module boundary check |
| `tools/link-check` | The link and ID check of the documents |

| Command | What it does |
| --- | --- |
| `pnpm install` | Installs dependencies. Run it once after cloning |
| `pnpm build` | Builds every package |
| `pnpm lint` | Type-aware ESLint |
| `pnpm typecheck` | Strict TypeScript |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:integration` | Tests against real PostgreSQL through Testcontainers, each file in its own databases (copies of the migrated templates, or empty ones for the runner and seed tests), at least two files at once. Needs Docker |
| `pnpm check:modules` | The module boundary check. Runs without an install |
| `pnpm check:links` | The link and ID check of `docs/` and this file. Runs without an install |
| `pnpm migrate` | The pre-deploy step: migrates the directory database, then every Organisation database the directory lists, in code order, as the migration role, reaching each on the same server by the name the directory keeps, then runs each set's maintenance file. Refuses a connection string without a host, any other role, or a database that role does not own, and stops and exits 1 at the first failure. Needs `pnpm build` and `AOS_MIGRATION_DATABASE_URL` |
| `pnpm seed` | The local seed: builds it apart from the application, migrates the directory database, then initialises the two synthetic Organisations through the setup step, each with its own first Admin and first approver and labelled synthetic settings (`DEC-118`). Refuses unless `AOS_ENVIRONMENT` is `local` or `dev`, and on Railway unless both it and the Railway environment are `dev`; refuses, before changing anything, a directory that lists an Organisation that is not synthetic, a seed code at another database, or a seed code without a finished setup. A finished Organisation is left as it is. Needs `AOS_MIGRATION_DATABASE_URL`, `AOS_RUNTIME_DATABASE_URL` and `AOS_SEED_FIRST_USERS_FILE`, a file named `SYNTHETIC-<name>.secrets.json` (ignored by git) from which the first users' synthetic temporary passwords are read, or to which they are written when it is missing; they are never logged |
| `pnpm --filter @apparel-os/server start:worker` | Starts the worker from the same build as the server: it serves no route and runs pg-boss and the outbox processor in each Organisation database the directory lists. Needs `pnpm build`, `AOS_RUNTIME_DATABASE_URL`, `AOS_DATABASE_POOL_MAX` and `AOS_WORKER_SETTINGS`; for local work, the labelled synthetic settings in `apps/server/test/fixtures/SYNTHETIC-worker-settings.local.json` (`DEC-118`, `DEC-119`) |
| `pnpm --filter @apparel-os/server setup-organisation <request.json>` | The setup step of a new Organisation, an operator command and never an API route: creates, migrates and lists its database, then writes the first two users, the settings and the worker's service identities from the request file, which holds no secret. Asks at the prompt for the two temporary passwords, never echoed or logged. Prints the answer as one JSON line; exits 1 on a refusal or failure. Needs `pnpm build`, `AOS_MIGRATION_DATABASE_URL` and `AOS_RUNTIME_DATABASE_URL` |
| `pnpm --filter @apparel-os/server recover-first-user <code> <login> <password\|authenticator\|both>` | Recovers one of an Organisation's first two users, an operator command and never an API route: resets the password, the authenticator or both. Asks at the prompt how the person's identity was verified and, for a password reset, the new temporary password, never echoed or logged. Prints the answer as one JSON line; exits 1 on a refusal or failure. Needs `pnpm build` and `AOS_RUNTIME_DATABASE_URL` |
| `pnpm --filter @apparel-os/schemas generate:openapi` | Builds the schemas package and writes `packages/schemas/openapi.json` from the route table. Run it after changing a route; a unit test fails while the committed document differs |
| `pnpm test:e2e` | The browser journeys (Playwright, Chromium, `apps/web/e2e/`): builds every package and the journeys' server (`build:browser`), starts it on its own PostgreSQL container with synthetic data and the built web app under `vite preview`, and keeps each run's trace in `apps/web/test-results`. Needs Docker and, once per machine, `pnpm --filter @apparel-os/web exec playwright install chromium` |
| `pnpm format`, `pnpm format:check` | Prettier |

- Another module is imported only through its `index.ts`, and calls go to a lower tier, or to the same tier only where module-map sections 4 and 5 list the call (`PRD-MOD-002`, `PRD-SEC-015`; `module-map.md` sections 2 and 3). `pnpm check:modules` enforces both; its tier table is in `tools/module-check/check.mts` and changes with the module map.
- Every constructor injection names its token with `@Inject(...)`; nothing relies on decorator metadata.
- Money is integer paise through `@apparel-os/domain` (`PRD-MOD-014`). Unknown stays distinct from zero (`PRD-MOD-015`).
- Code and tests cite the PRD or policy ID where they enforce a rule.
- The pre-commit hook (`.githooks/`; enable it once per clone with `git config core.hooksPath .githooks`) runs the link check when documents are staged, and the module check, lint and typecheck when code is staged and dependencies are installed. `.github/workflows/code-check.yml` runs all of them, the format check, both test suites and the browser journeys on every push and pull request.
- The house rules for code are in `docs/design/platform/code-house-rules.md`. Part A (folder layout, database layout, migrations and roles, row-level security, append-only rows, transactions and locks, time, tests, fixtures) is reviewed and approved; `DEC-112` sets baselines for CH-1, CH-4, CH-5 and CH-7 and development baselines for CH-2 and CH-3, and its other open questions stay open at their gates. Part B (API shape, error envelope, idempotency key, version token, events, jobs, logs, screen text) was approved by the product owner on 6 Oct 2026, with CH-8 answered and CH-12 answered by `DEC-113`.

## How we work

The plan lives in `docs/plan/`. Each stage has a folder (`docs/plan/stage-1/`); each feature in it has a folder with `spec.md` (what it does) and `tickets/` (one file per piece of work, named with its task label, such as `T04-idempotency-helper.md` for `S1-F01-T04`). `docs/STATUS.md` says, in plain words, where the work stands and what waits on the product owner.

Work runs through the skills in `.claude/skills/` (decided by the product owner, 6 Oct 2026); they replace the earlier separate review-and-recheck loop:

1. **Grill.** `/grill-with-docs` settles with the product owner only what the PRD, the policies and the designs leave open. Business answers go up as "Document order" says; KDPS values go to `docs/questions-for-kdps.md`.
2. **Spec and tickets.** `/to-spec` and `/to-tickets`, published as "Agent skills" says. Each ticket has `Status:`, `Blocked by:`, what to build, the design sections and IDs it follows, and when it is done.
3. **Build.** `/implement` for a ticket or `/implement-spec` for a spec's ticket graph: test first with `/tdd`, reviewed with `/code-review`, as those skills say. Cite the PRD, policy or decision ID where a rule is enforced. A design detail found while coding is edited in the design in the same change.
4. **Close.** Set the ticket's status, note any follow-up in `docs/plan/open-items.md` with its owner and the gate it blocks, and update `docs/STATUS.md`. Commit subjects start with the ticket label (`S1-F01-T04: idempotency helper`).

- CI (`.github/workflows/code-check.yml`) runs every check, both test suites and the browser journeys on each push; leave them passing.
- When a fix would change business behaviour or a ticket's scope, stop and ask the product owner. A fix never fills an OPEN value.
- The skills commit on their working or integration branch. Pushing, merging into `main` and anything on Railway wait for the product owner's go-ahead; because `main` deploys to `dev` automatically, an approval to merge must say it includes that deployment. Commits and pull requests carry no AI attribution lines.
- Never throw away uncommitted work, even if it looks obsolete: save it to a `saved/<name>` branch first.
- A change that touches only documents needs no code review: keep the document order, log PRD and policy changes in `docs/decisions.md` first, and run the link check.

## Agent skills

### Issue tracker

Tickets are local markdown files under `docs/plan/stage-N/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, written as the ticket's `Status:` value, plus `done`, `in-progress` and `blocked`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. The glossary is the PRD's "Words used" tables and decisions are `DEC-nnn` entries in `docs/decisions.md`; there is no `GLOSSARY.md` or `docs/adr/`. See `docs/agents/domain.md`.

## Stack

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
| Authentication  | PostgreSQL server sessions, secure cookies, Argon2, OTP and TOTP; a maintained QR code library for the authenticator enrolment code, drawn in the app, never through an external QR service |
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

- Only a physical count creates stock. Invoice, booking or price ticket (PT) quantities never do.
- A piece is sellable only with official PT coverage, barcode verification and physical acceptance at its selling Site, and no conflicting hold or reservation.
- Keep separate: physical custody, PT coverage, availability, ownership and accounting recognition.
- Independent approval means a different authorised person from the preparer. Approval binds to the exact document version.
- Nothing is on by default. A policy-dependent operation stays unavailable until its policy is configured.
- AI output is always a reviewable draft and never posts stock, money or tax.

