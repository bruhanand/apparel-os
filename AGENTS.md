# AGENTS.md
<!-- deps: none — contributor guide intro -->

This file guides AI coding agents working in this repository. `CLAUDE.md` is a link to this file; edit this one.

## Current state
<!-- deps: prd.md#stack — planned toolchain sentence restates PRD stack rows -->

Apparel OS is a retail ERP for apparel, footwear and packaged-goods businesses. The first customer is KDPS Lifestyle Pvt. Ltd. (KDPS).

The repository holds the documents, the doc checker (see "Checking the documents") and the code workspace skeleton (see "Code workspace"). There is no business code yet. Use only the commands listed there; do not invent others.

The toolchain, from the PRD's "Technical platform" section, is pnpm workspaces with Turborepo, strict TypeScript, Vitest, Playwright, Testcontainers with real PostgreSQL, ESLint and Prettier. Playwright arrives with the first real screen.

## Document order
<!-- deps: none — contributor process; restates docs/README.md order -->

`docs/README.md` is binding. When two documents disagree, the higher one wins:

1. `docs/prd.md`: what the product does. Source of truth for requirements and vocabulary.
2. `docs/kdps-policies.md`: what KDPS decided, within the options the PRD allows.
3. `docs/design/`: how the system implements both. Never contradicts the two above.
4. Code: implements the design.

`docs/phases.md` sets delivery order only; the PRD and policies win over it. `docs/decisions.md` logs why the PRD or policies changed. `docs/reports/` holds one-time reports and `docs/questions-for-kdps.md` holds open questions; neither decides anything.

- Fix the lower document to match the higher one. Never edit a higher document just to fit a lower one.
- A business decision is never settled in design or code. Raise it against the PRD or the policies.
- Use words exactly as the PRD's "Words used" tables define them, in docs and code. Add a new term there first.
- When documents clash, report the clash instead of guessing.



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
- Document numbering and audit history (business codes, number series, the bill series per billing device, tax registration and financial year, formats, the audit record and the access record; their tables) are in `docs/design/platform/numbering-and-audit.md` (GC-5). Its open questions are GC5-n.
- The UI was first drawn for RetailsOps, an earlier version of this product in another repo. Its codes (G-, OQ-, R-, BP-) and decisions are not requirements; anything still wanted belongs in the PRD or the policies.



## Delivery

Build in the six stages of `docs/phases.md`: shared foundation, goods-in, stock movement, store day, financial control, people and planning. Design, development and synthetic-data testing may proceed before KDPS policy signatures. Enable each policy-dependent live operation only after the required policy is signed and its real values, authorities and evidence are configured and validated. Stage 1 fixes the stock and money recording rules; each later live operational stage records its stock and money effects from its first enabled operation. Design offline billing in stage 1; enable it only under the signed Offline operation policy. Screens are English first; Hindi for stages 1 to 5 arrives in stage 5 and for stage 6 in stage 6; email, WhatsApp and SMS messaging arrive in stage 5; before then nothing is sent, and alerts reach people in My work (DEC-099, `PRD-EXC-013`).

During the side-by-side test, the earlier POS keeps selling and stays the system of record. Its daily sales report and stock-on-hand (SOH) are imported into the Railway test setup for checking only; they never move stock (`PRD-LIF-014`). Stores switch over one at a time at a day close, but only on production hosting, which is chosen before the first switch (`PRD-LIF-026`).

## Code workspace
pnpm workspaces with Turborepo. Node.js 22.18 or later; the pnpm version is the one `package.json` names.

| Path | What it holds |
| --- | --- |
| `apps/server` | The NestJS modular monolith. `src/kernel` holds plumbing; `src/modules/` holds one folder per module or part, such as `organisation` and `merchandise/catalogue`, each with an `index.ts` as its public interface |
| `apps/web` | The React web app (Vite, Tailwind CSS) |
| `packages/domain` | Shared primitives: money in integer paise, Unknown, UUIDv7 |
| `packages/schemas` | Shared Zod schemas for the API |
| `packages/ui` | Shared UI helpers for shadcn/ui |
| `tools/module-check` | The module boundary check |

| Command | What it does |
| --- | --- |
| `pnpm install` | Installs dependencies. Run it once after cloning |
| `pnpm build` | Builds every package |
| `pnpm lint` | Type-aware ESLint |
| `pnpm typecheck` | Strict TypeScript |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:integration` | Tests against real PostgreSQL through Testcontainers. Needs Docker |
| `pnpm check:modules` | The module boundary check. Runs without an install |
| `pnpm format`, `pnpm format:check` | Prettier |

- Another module is imported only through its `index.ts`, and calls go to a lower tier, or to the same tier only where module-map sections 4 and 5 list the call (`PRD-MOD-002`, `PRD-SEC-015`; `module-map.md` sections 2 and 3). `pnpm check:modules` enforces both; its tier table is in `tools/module-check/check.mts` and changes with the module map.
- Every constructor injection names its token with `@Inject(...)`; nothing relies on decorator metadata.
- Money is integer paise through `@apparel-os/domain` (`PRD-MOD-014`). Unknown stays distinct from zero (`PRD-MOD-015`).
- Code and tests cite the PRD or policy ID where they enforce a rule.
- The pre-commit hook runs the module check when code is staged, and lint and typecheck too once dependencies are installed. `.github/workflows/code-check.yml` runs them with both test suites.
- Not written yet: the full house rules for code (API error shape, the idempotency key on writes, migration roles, test plan). See `docs/reports/gaps-before-code.md` section 3.

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

These come from the PRD's "Technical platform" section and apply to all future code.

- **Shape.** A NestJS modular monolith, a React web app, a counter PWA with IndexedDB, and a separate Python forecasting service. Python is the only language besides TypeScript.
- **Tenancy.** One PostgreSQL database per customer Organisation.
- **Modules.** Each module owns its tables and exposes a public interface. Other modules never read its tables directly. Reports read declared read models.
- **Transactions.** Synchronous economic effects run through module interfaces in one transaction. Durable follow-up goes through a PostgreSQL outbox processed by pg-boss.
- **Shared calculations.** Pricing, tax, discount allocation, rounding and incentive logic is written once in shared TypeScript and used by both server and counter.
- **Records are append-only.** Approved documents and posted stock and accounting entries are never updated or deleted. Corrections are linked reversals. Stock balances are derived from movements.
- **Money.** INR is stored as integer paise. No binary floating point for money. Unknown values stay distinct from zero.
- **Integrity.** Every write carries a scoped idempotency key. Locks are taken in a deterministic order, and authority, version, state and quantity are rechecked under the lock.
- **External systems.** Tally, GST, bank and messaging outcomes are tracked as pending, unknown, failed or succeeded, outside the local transaction. Retry only after reconciliation.



## Domain rules that cut across modules
<!-- deps: PRD-REC-008, PRD-STK-003, PRD-STK-001, PRD-REC-009, PRD-LED-005, PRD-ACS-006, PRD-ACS-007, PRD-SEC-017, PRD-SEC-003, PRD-SEC-004, PRD-ACP-001, PRD-REC-021, PRD-ORG-014, POL-02.07 — count creates stock, sellable test, separate facts, approvals, default off, AI drafts -->

- Only a physical count creates stock. Invoice, booking or price ticket (PT) quantities never do.
- A piece is sellable only with official PT coverage, barcode verification and physical acceptance at its selling Site, and no conflicting hold or reservation.
- Keep separate: physical custody, PT coverage, availability, ownership and accounting recognition.
- Independent approval means a different authorised person from the preparer. Approval binds to the exact document version.
- Nothing is on by default. A policy-dependent operation stays unavailable until its policy is configured.
- AI output is always a reviewable draft and never posts stock, money or tax.

