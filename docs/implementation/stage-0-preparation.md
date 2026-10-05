# Stage 0 — Preparation

> **Not ranked.** Part of the [implementation plan](index.md). It decides nothing; the PRD, the policies and the designs win.

Stage 0 holds only the shared work the first feature needs before its first line of business code: a green CI, a verified toolchain, the code house rules, migrations with their two database roles, the synthetic-data approach, and the reviews of the design those rest on. Everything else is built inside the feature that first needs it (the outbox in `S1-F01`, file storage in `S1-F06`, the counter build in `S1-F11`), and every choice that does not block the first feature stays outside the gate (section 3).

## 1. What was verified on 5 Oct 2026

Run on commit `8239c69` with no working-tree changes. Nothing was installed.

| Check | How it was run | Result |
| --- | --- | --- |
| Node.js | `node --version` | v22.23.3, meets "22.18 or later" |
| Doc checker | `node tools/doc-check/check.mts` | 0 errors, 0 warnings. 451 tracked sections: 385 reviewed, 66 with a baseline record only |
| Doc checker's own tests | `node tools/doc-check/check.mts test` | All pass |
| Coverage | `node tools/doc-check/check.mts coverage` | 0 of 520 PRD bullets and 0 of 205 policy bullets cited by no gated section |
| Module check | `node tools/module-check/check.mts` | Passed |
| Typecheck | `tsc -p tsconfig.json` in each of `packages/domain`, `packages/schemas`, `packages/ui`, `apps/server`, `apps/web`, and `tools/module-check` | All pass. Run from `node_modules/.bin`, because `pnpm` is not on the PATH |
| Unit tests | `vitest run` in each package | domain 13, schemas 1, ui 2, server 1: all pass |
| Lint | `eslint .` in each package, and `eslint tools/module-check` | All pass. A plain `eslint .` at the root fails because it also scans an extra worktree (RR-050) |
| Formatting | `prettier --check .` | All files pass |
| Integration tests | Not run locally: no Docker | GitHub Actions "Code check" run 37279667550 on `8239c69`: lint, typecheck, module check, unit tests and the integration test (`createDb` against PostgreSQL 17 in Testcontainers) all pass |
| Doc check in CI | GitHub Actions history | Failing on every push since 4 Oct 2026; the checker never starts (RR-186) |
| `pnpm` scripts and Turborepo | Not run: `pnpm` not on the PATH; corepack present but not enabled | CI runs them through `pnpm` (RR-185) |
| Pre-commit hook | `git config --get core.hooksPath` | `.githooks`: enabled in this clone |
| Railway environments | Not inspected | RR-187 |

## 2. Start gate for S1-F01

`S1-F01` may start when all of these hold. Nothing else is in the gate.

| # | Condition | Task | Proved by |
| --- | --- | --- | --- |
| 1 | The Doc check workflow runs the checker in CI and passes | `S0-T03` | A green Doc check run whose log shows the checker's result and its tests |
| 2 | One builder machine runs every command of `AGENTS.md`, including integration tests against a real PostgreSQL container | `S0-T02` | The verification note |
| 3 | House rules part A (database, migrations, roles, row-level security pattern, transactions and locks, time, tests and fixtures) is written, reviewed and approved | `S0-T04`, `S0-T08` round 1 | Review records; the product owner's approval |
| 4 | The migration runner and both database roles exist and are proved in CI | `S0-T05` | Green integration tests |
| 5 | Synthetic fixtures and reset exist and are proved in CI | `S0-T06` | Green integration tests |
| 6 | The four never-reviewed `AGENTS.md` sections are reviewed | `S0-T08` round 1 | Review records |

Gates inside `S1-F01`, not before it:

- House rules part B (API, errors, idempotency key, version token, events, jobs, logging, screen text, KDPS-valued settings), reviewed with [deployment.md](../design/platform/deployment.md) sections 5 and 9 in `S0-T08` round 2, before `S1-F01-T04`. Tasks `T01` to `T03` need only part A.
- The design-language and blueprint reviews (DR-1b), before `S1-F01-T14`, the first screen.
- The setup-step detail (RR-017), settled in `S1-F01-T01`, before `S1-F01-T10`.

**Go-ahead.** Each task below that installs software, changes code or configuration, commits, pushes or writes review records waits for the product owner's explicit go-ahead. None of it has been done.

## 3. Outside every start gate

These are tracked, and none of them may hold up stage 0 or the first feature:

- How many people or agents build (RR-031). It sets how many lanes run at once; work starts with one.
- The extra worktree `.claude/worktrees/document-checker-improvements-c67c98` (RR-050). It is preserved as it is: no task reads into, changes or removes it. The official lint commands do not scan it.
- Whether `docs/implementation/` becomes a gated document (RR-052).
- Adding `pnpm format:check` to the Code check workflow (`S0-T07`): useful, not required to start.
- GC-8, GC-9, the stock ledger interface and the synthetic harness decisions: they gate `S1-F12`, `S1-F14` and `S1-F10`.
- Every KDPS, Accounts and CA answer: they gate live activation only.

## 4. Tasks

Each task ends with the full check set passing.

### S0-T01 — Name who records reviews

| Part | Content |
| --- | --- |
| Purpose | The doc checker's `review` and `record` commands need a named reviewer (`--by`); `S0-T08` cannot run without one |
| Prerequisites | None |
| Expected output | The name, written beside [index.md](index.md) section 9 |
| Completion criteria | One person is named for DR-1 and later batches |
| Owner | Product owner |

### S0-T02 — Verify the development environment

| Part | Content |
| --- | --- |
| Purpose | Prove that a builder machine runs every check, so a task can be verified without waiting for CI (RR-185) |
| Prerequisites | Go-ahead to activate the pinned package manager and install a Docker-compatible runtime |
| Steps | 1. `corepack enable`, then `corepack prepare pnpm@12.4.1 --activate`. 2. Install a Docker-compatible runtime for Testcontainers. 3. `pnpm install --frozen-lockfile`. 4. Run `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm check:modules`, `pnpm test`, `pnpm test:integration`, `pnpm format:check`, `node tools/doc-check/check.mts` and `node tools/doc-check/check.mts test`. 5. Confirm `git config --get core.hooksPath` prints `.githooks` |
| Expected output | A short note: versions of Node.js, pnpm and the container runtime, and each command's result |
| Completion criteria | Every command exits 0; the integration test reaches a real PostgreSQL container |
| Owner | Each builder, once per machine |

### S0-T03 — Restore the Doc check workflow

| Part | Content |
| --- | --- |
| Purpose | Make CI run the doc checker again (RR-186). `actions/setup-node@v5` in `.github/workflows/doc-check.yml` looks for pnpm because `package.json` names it, and the job stops before the checker runs |
| Prerequisites | Go-ahead to change the file, commit it on a branch and push, because only a CI run proves the fix. No decision, install or other task is needed |
| Steps | Change only that workflow, in one of two ways: turn off the package-manager cache on its `setup-node` step, or install pnpm before it as `code-check.yml` does. Leave the checker steps as they are |
| Expected output | A one-file change |
| Completion criteria | The Doc check workflow passes on that push, and its log shows the checker's "Doc check: 0 error(s)" line and the checker's tests |
| Owner | Builder; product owner approves the merge |

### S0-T04 — Write the code house rules

| Part | Content |
| --- | --- |
| Purpose | Fix the conventions every feature uses, so lanes produce one consistent schema, API and test style (RR-011, RR-009) |
| Prerequisites | Go-ahead to write the design document |
| Steps | Write one new design document under `docs/design/platform/` (for example `code-house-rules.md`) with the rank banner, header IDs and open questions like the other designs, in two parts that can be reviewed one after the other. **Part A, database and tests:** folder layout inside a module behind its `index.ts`; one schema per module and no cross-schema foreign keys (structure-and-masters 2.5); the directory and Organisation migration sets, file naming and reviewed SQL; the migration and runtime roles ([deployment.md](../design/platform/deployment.md) section 4); the row-level security policy pattern (access-and-approvals 7.2); append-only triggers; exclusion constraints for effective-dated versions; the command runner, one transaction per command, the lock order (stock-ledger 10.3) and no outside call inside a transaction (`PRD-INT-006`); event time, recording time and business date (`PRD-MOD-009`); the test plan: unit, integration on real PostgreSQL under the runtime role, browser journeys per persona, golden cases, naming, what runs on every change, every test citing the ID it proves (`PRD-SEC-016`); synthetic labelling and fixtures; test-only schemas for synthetic harnesses, if the harness decision H3 is taken ([s1-f10-stock-harness.md](s1-f10-stock-harness.md)); dependencies only from the PRD Stack, pinned in the lockfile (`PRD-SEC-015`). **Part B, API and runtime:** REST routes under `/api`, state changes as commands on a record, Zod schemas in `packages/schemas`, generated OpenAPI and a typed client; one error envelope whose refusal names what is missing (`PRD-UXP-003`) and never carries a restricted value (`PRD-SEC-006`, `PRD-SEC-014`); the idempotency key: header, required on every write, scope by operation kind and actor or device, kept in the command's transaction, replay and conflict behaviour (`PRD-INT-002`; stock-ledger 10.1), with its retention period an OPEN technical setting for the product owner; a version token on every editable record and the stale-version refusal (`PRD-ACS-007`, `PRD-INT-003`); outbox event names and envelope (module-map section 8), consumers idempotent on the event identity (`PRD-INT-008`); job queues and the retry rule that access-and-approvals 9.8 hands to the house rules, its numbers as settings; log fields, correlation identifiers and redaction; screen text in a message catalogue, English first and ready for Hindi ([phases.md](../phases.md)); how a KDPS-valued setting is modelled: effective-dated, no default, validated by a different person (DM-6), refused when unset; simulators for outside systems ([index.md](index.md) section 5). Then update the "Not written yet" line of `AGENTS.md` and link the document from the READMEs; leave [gaps-before-code.md](../reports/gaps-before-code.md) as the snapshot it is |
| Expected output | The new design document; the edited `AGENTS.md` line; links from [design/README.md](../design/README.md) and [docs/README.md](../README.md) |
| Completion criteria | Part A reviewed in `S0-T08` round 1 and approved by the product owner before `S0-T05`; part B reviewed in round 2 and approved before `S1-F01-T04`; the doc checker passes |
| Owner | Design author; product owner approves |

### S0-T05 — Migration runner and the two database roles

| Part | Content |
| --- | --- |
| Purpose | Every feature's tables need reviewed SQL migrations applied by a migration role, with the application running as a runtime role that owns nothing and cannot bypass row-level security (RR-006, RR-190) |
| Prerequisites | `S0-T02`; house rules part A approved; go-ahead for the code change |
| Steps | 1. Add a migration runner in `kernel` that applies two ordered sets: the directory database and each Organisation database (`PRD-MOD-001`, `DEC-093`). 2. Add the SQL that creates the two roles for tests and local use, and a written runbook for creating them on Railway; the product owner applies the runbook later, and no service is changed in this task. 3. Extend the Testcontainers helper: start PostgreSQL, create both roles, create a directory database and one Organisation database, migrate as the migration role, connect the application as the runtime role. 4. Add a pre-deploy entry point that runs both sets and stops on failure ([deployment.md](../design/platform/deployment.md) section 4) |
| Expected output | Runner, role SQL, runbook, test helper, integration tests |
| Completion criteria | Integration tests prove that the runtime role cannot create, alter or drop a table, cannot update or delete a row a trigger protects, and sees no row of a table under a row-level security policy when no actor is set; and that a failing migration leaves the earlier state. All green in CI |
| Owner | Builder |

### S0-T06 — Synthetic fixtures and reset

| Part | Content |
| --- | --- |
| Purpose | One way to create, label and reset synthetic data for every database and browser test, so nothing synthetic can pass as a real value (`AGENTS.md`, "Never invent a value") |
| Prerequisites | `S0-T05` |
| Steps | 1. Labelling: every synthetic code carries a `SYN` marker and every synthetic name says SYNTHETIC; generated files say SYNTHETIC in their name and a document property (GC-6 section 17). 2. Speed: one migrated template database per test run, cloned per test file; reset drops the clone. 3. Organisations: a helper that creates two synthetic Organisations, so isolation is always testable ([deployment.md](../design/platform/deployment.md) section 4). Until `S1-F01-T10` exists it writes the minimum rows directly; afterwards it calls the real setup step, so fixtures obey the same rules as users. 4. A local seed command creating the same two Organisations |
| Expected output | Test helpers, seed command, a section in house rules part A |
| Completion criteria | Two test files running at the same time never see each other's rows; every fixture value is labelled; no fixture value is read by application code as a default |
| Owner | Builder |

### S0-T07 — Formatting check in CI (outside the gate)

| Part | Content |
| --- | --- |
| Purpose | CI should hold every check that exists today (`PRD-SEC-016`); `pnpm format:check` is not yet in the Code check workflow |
| Prerequisites | `S0-T03`; go-ahead |
| Expected output | A one-line change to `.github/workflows/code-check.yml` |
| Completion criteria | Code check passes with the formatting step |
| Owner | Builder; may land at any time |

### S0-T08 — Documentation review batch DR-1

| Part | Content |
| --- | --- |
| Purpose | The first feature must rest on reviewed design, not on baseline records (RR-020, RR-021) |
| Prerequisites | `S0-T01`; the part of `S0-T04` under review |
| Steps | **Round 1, in the start gate:** house rules part A, and the four never-reviewed `AGENTS.md` sections (top, "Document order", "Alignment rules", "Planned architecture"). **Round 2, before `S1-F01-T04`:** house rules part B, and [deployment.md](../design/platform/deployment.md) sections 5 and 9. In each round: run `node tools/doc-check/check.mts impact` for the IDs the new text cites; write the packet for the stale sections and review it under [tools/doc-check/ai-review.md](../../tools/doc-check/ai-review.md), recording verdicts with `record`; read each never-reviewed section against its current sources and record it with `review`, one call and one reason per section; fix each finding in the lower document, or raise it |
| Expected output | Review records written by the checker; fixes where needed |
| Completion criteria | The doc checker passes; each listed section shows "reviewed"; no reason is reused |
| Owner | The reviewer named in `S0-T01` |

## 5. Corrected first assignment

**`S0-T03`, restore the Doc check workflow.** Its only prerequisite is the product owner's go-ahead to change `.github/workflows/doc-check.yml`, commit it on a branch and push it so CI runs. No decision, install, Docker runtime or other task comes first.

Then, each after its own go-ahead: `S0-T02` (toolchain), `S0-T01` and `S0-T04` part A, `S0-T08` round 1, `S0-T05`, `S0-T06`. When those are green, the start gate of section 2 is met and `S1-F01-T01` begins.

## 6. What stage 0 does not do

- It writes no business table, screen or endpoint other than what the tasks above name.
- It does not write GC-8, GC-9, the stock ledger interface or the synthetic harness: they belong to `S1-F12`, `S1-F14` and `S1-F10`.
- It changes no Railway service. Wiring the pre-deploy migration command into Railway is done by the product owner when `S1-F01` is first deployed to `dev` (RR-187).
- It sets no KDPS value. Every value it needs on `dev` is labelled synthetic.
