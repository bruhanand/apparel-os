# Implementation plan

> **Not ranked.** This plan breaks the six delivery stages of [phases.md](../phases.md) into features and tasks. It decides nothing. The [PRD](../prd.md), the [KDPS policies](../kdps-policies.md) and the [design documents](../design/README.md) win over it, and [phases.md](../phases.md) sets the stage order. A business question found while using this plan goes to the PRD or the policies through [decisions.md](../decisions.md), never into code. See [README.md](../README.md).

Written on 5 Oct 2026 against commit `8239c69` on `main`. Planning only: no application code, dependency, service or review record was changed to write it.

## 1. How the plan is built

The plan runs from preparation to live use in five layers:

1. **Gates** say what must be true before a piece of work may start or finish. Every open item in the [readiness register](readiness-register.md) names the gate it blocks (section 4).
2. **Stages** are the six stages of [phases.md](../phases.md), unchanged, plus a preparation stage before stage 1 ([stage-0-preparation.md](stage-0-preparation.md)).
3. **Features** split each stage into vertical, end-to-end workflows a person can see: screen, API and stored records together ([stages-and-features.md](stages-and-features.md)).
4. **Tasks** split a feature into pieces one agent can build and verify alone, each with its inputs, outputs and completion criteria. Only the first feature and the shared calculations are broken into tasks now ([s1-f01-first-access.md](s1-f01-first-access.md), [s1-f11-shared-calculations.md](s1-f11-shared-calculations.md)); later features get their tasks when their turn comes, so the detail does not go stale.
5. **Acceptance tests and evidence** close each feature and each stage ([exit-checklists.md](exit-checklists.md)). [requirement-coverage.md](requirement-coverage.md) traces every PRD bullet to the feature that delivers it.

| File | What it holds |
| --- | --- |
| [index.md](index.md) | This page: structure, labels, gates, shared contracts, ownership, checkpoints |
| [readiness-register.md](readiness-register.md) | Every open gap and question, deduplicated, with owner, gate and whether synthetic work can go on |
| [stage-0-preparation.md](stage-0-preparation.md) | The preparation stage: what was verified on 5 Oct 2026 and the tasks before the first feature |
| [stages-and-features.md](stages-and-features.md) | The six stages: outcomes, scope, gates, features, parallel work, exit and live activation; the dependency map |
| [s1-f01-first-access.md](s1-f01-first-access.md) | The first feature in full: workflow, invariants, records, transactions, failures, tasks and tests |
| [s1-f10-stock-harness.md](s1-f10-stock-harness.md) | The synthetic harness that drives the stock golden scenarios through the real services, and its decisions H1 to H6, taken by `DEC-112` |
| [s1-f11-shared-calculations.md](s1-f11-shared-calculations.md) | The shared calculations package: tasks, tests, the golden cases and RR-042, and the counter run blocked on RR-015 |
| [requirement-coverage.md](requirement-coverage.md) | All 520 PRD bullets with their owner feature and the feature that completes them; all 19 policies; deferred items named |
| [exit-checklists.md](exit-checklists.md) | Stage exit checklists and live-activation checklists, with the evidence each item needs |

## 2. What exists, what is designed, what is missing

Verified on 5 Oct 2026 by reading the repository and running the checks listed in [stage-0-preparation.md](stage-0-preparation.md) section 1.

| Area | Exists in code | Designed | Missing |
| --- | --- | --- | --- |
| Workspace and checks | pnpm and Turborepo workspace; server, web, domain, schemas, UI packages; module check; doc checker; pre-commit hook; CI workflows | `AGENTS.md` "Code workspace" | Code house rules (API, errors, idempotency key, migrations and roles, test plan); Playwright |
| Shared primitives | `packages/domain`: integer paise, Unknown, UUIDv7, with tests | [module-map.md](../design/architecture/module-map.md) 4.1 | — |
| `kernel` | Health endpoint, database handle, pino logger | [module-map.md](../design/architecture/module-map.md) 4.1 | Organisation routing and directory, transactions, idempotency, outbox and jobs, live updates, read-model gateway, operations view |
| `access`, `audit`, `inbox`, `configuration` | Nothing | GC-3 [access-and-approvals.md](../design/access/access-and-approvals.md); GC-5 [numbering-and-audit.md](../design/platform/numbering-and-audit.md) | All of it |
| `organisation`, `merchandise` | Empty module shells with their `index.ts` | GC-2 [structure-and-masters.md](../design/masters/structure-and-masters.md) | All records and screens |
| `files-imports` | Nothing | GC-6 [imports-and-opening-data.md](../design/platform/imports-and-opening-data.md) | All of it |
| `numbering`, `exceptions` | Nothing | GC-5; GC-3 section 12 | All of it |
| `finance` · books and tax rules | Nothing | GC-4 [books-and-posting.md](../design/finance/books-and-posting.md); GC-7 section 10 | All of it |
| `stock` · ledger | Nothing | [stock-ledger.md](../design/stock/stock-ledger.md) (rules, golden scenarios) | Its interface operations and tables are not designed yet (RR-012) |
| `calculations` | Nothing: `packages/calculations` does not exist | GC-7 [shared-calculations.md](../design/calculations/shared-calculations.md) | The package, its golden cases, the counter test page |
| Offline counter | Nothing | Outline only (module-map 4.17, domain-model 3.12) | GC-8 design |
| Backup, restore, export | Nothing | Test-hosting notes only ([deployment.md](../design/platform/deployment.md) 4) | GC-9 design |
| Web app | A placeholder page | [design-language.md](../design/ui/design-language.md), [ui-blueprint.html](../design/ui/ui-blueprint.html) | Router, data layer, forms, components, every screen |
| Stages 2 to 6 | Nothing | Outlines only (module-map section 5) | Each stage's area designs |

## 3. Labels used in this plan

These labels name pieces of work. They are not requirement IDs: a rule is always cited by its `PRD-`, `POL-` or `DEC-` ID.

| Label | Meaning | Example |
| --- | --- | --- |
| `S0-Tnn` | A preparation task | `S0-T04` |
| `Sn-Fnn` | Feature nn of stage n | `S1-F01` |
| `Sn-Fnn-Tnn` | Task nn of that feature | `S1-F01-T07` |
| `Sn-Fnn-ATnn` | Acceptance test nn of that feature | `S1-F01-AT05` |
| `RR-nnn` | An item in the readiness register | `RR-012` |
| `IC-n` | An integration checkpoint (section 8) | `IC-2` |
| `DR-n` | A documentation review batch (section 9) | `DR-1` |

The open-question codes of the designs (`GC2-n`, `SL-n`, `MM-n`, `V-n` and the rest) keep their meaning; the register lists them beside its own number.

## 4. Gates

An open item blocks work only at the gate it names. Most open KDPS values block live activation only: design, code and synthetic tests go on without them (`DEC-105`, [phases.md](../phases.md) "How the stages are cut").

| Gate | Blocks | Example |
| --- | --- | --- |
| **Design** | Writing or changing the design of the named feature | A product-owner choice the design needs, such as how stage 1 golden scenarios are driven (RR-013) |
| **Code** | Coding the named feature or task | The code house rules before `S1-F01` (RR-011) |
| **Accept** | Accepting the named feature: a test or its evidence needs it | The 10,000-line PT parse within one minute for `S1-F07` (RR-189) |
| **Exit** | The stage exit | The GC-9 design and the restore proof for stage 1 (RR-010) |
| **Live** | Switching a policy-dependent operation on for a real Organisation, or using real KDPS data | The signed policy 2 and KDPS's role map (RR-158, RR-064) |

- Synthetic data is labelled synthetic in names, codes and file properties, and never becomes a default (`AGENTS.md`, "Never invent a value").
- A KDPS value with no answer is a setting with no default. On `dev`, tests use labelled synthetic settings; on production the operation stays unavailable until the policy is Signed and the value validated (`PRD-SEC-017`, `DEC-105`).
- Historical KDPS exports are evidence for checks, never verified opening stock (`PRD-LIF-014`, `PRD-LIF-027`).

## 5. Simulated external services first

Every outside system is reached through one adapter owned by one module, and its outcomes are kept as pending, unknown, failed or succeeded, outside the local transaction (`PRD-INT-006`, `PRD-INT-007`; [module-map.md](../design/architecture/module-map.md) section 3, rule 7). Each adapter is built in three steps, in this order:

1. **Simulator first.** An in-process fake of the outside system serves unit, integration and browser tests and local development. It is scripted to answer with success, refusal, a timeout whose outcome is unknown, a duplicate or late callback and, where the system works in batches, partial success, so reconciliation before retry is tested from the start (`PRD-INT-007`, `PRD-INT-008`). A simulator is labelled synthetic and never ships as a fallback: a production configuration that selects one refuses to start.
2. **Sandbox or test instance on `kdps-test`.** The provider's sandbox, a test company or named test recipients, as [deployment.md](../design/platform/deployment.md) section 7 lists. Every other outside system is off there.
3. **Real endpoint** only at live activation, after its policy is Signed and its values validated.

| Outside system | First | Then on `kdps-test` | Live from |
| --- | --- | --- | --- |
| File storage (S3-compatible) | Not simulated: MinIO locally and the Railway bucket on `dev` (PRD Stack: Files; D-2) | The Railway bucket | Production hosting (RR-029) |
| Local helper: label and receipt printers, cash drawer | A fake helper that records what would print (`S2-F07`) | A real helper on a test PC | Stage 2 labels; stage 4 receipts |
| AI provider | A stub returning fixed structured output and invalid output (`S2-F05`) | Off unless the capability is switched on | Capability on per Organisation |
| GST: IRN, e-invoice, e-way bill | A GSP simulator (`S4-F09`) | The GSP sandbox; never a real IRN | Stage 4 (IRN); stage 5 (e-way) |
| Card and UPI providers | A provider simulator (`S4-F02`) | Sandbox; no real charge | Stage 4 |
| Bank files, statements and settlement reports | Synthetic files in each layout (`S5-F03`, `S5-F04`) | Off | Stage 5 |
| TallyPrime through the local gateway | A simulated gateway answering accept, reject, partial and no answer (`S5-F02`) | A separate test Tally company (RR-181) | Stage 5 |
| Email, WhatsApp, SMS | A capture sink (`S5-F11`); nothing is sent before stage 5 (`DEC-099`) | Named test recipients only | Stage 5 |
| EBO brand APIs | A simulated brand feed (`S4-F10`) | Off until a brand permits access | Stage 4 |

Stage 1 calls no outside system except file storage.

## 6. Shared contracts that must settle first

Parallel work is safe only after the contract it calls is stable. Each contract below is built once, by the feature named, and then changed only through its owner with a note to every caller.

| Contract | Owner | Built in | Callers |
| --- | --- | --- | --- |
| API conventions: route shape, Zod schemas in `packages/schemas`, error envelope, idempotency-key header, version token for stale-version refusal, generated OpenAPI and typed client | Code house rules | `S0-T04`, first used in `S1-F01-T05` | Every feature |
| Migration layout: one schema per module, directory and Organisation migration sets, migration and runtime roles | Code house rules | `S0-T05` | Every feature with tables |
| Synthetic fixtures and reset | Code house rules | `S0-T06` | Every database and browser test |
| Command context: one transaction, actor setting for row-level security, lock helper | `kernel` | `S1-F01-T03` | Every module |
| Idempotency helper | `kernel` | `S1-F01-T04` | Every write |
| Outbox event envelope and consumer registration | `kernel` | `S1-F01-T06` | Every module that publishes or consumes |
| Authenticate, Authorise, Restrict fields, Request approval, Decide, Verify under lock, Record use | `access` | `S1-F01` (limits in `S1-F05`, Record use in `S1-F10`) | Every module |
| Record, Record access, Read history | `audit` | `S1-F01-T07` | Every module |
| Publish, update and close a work item | `inbox` | `S1-F01-T12` | `access`, `exceptions`, later modules |
| Check availability; register a validity check; activity grants | `configuration` | `S1-F04` | Every policy-dependent operation |
| Read the structure; scope contract; location-in-use contract | `organisation` | `S1-F02` | `access`, `merchandise`, `finance`, `stock` |
| Resolve a code; read a SKU; read the terms in force; stock-presence contract | `merchandise` | `S1-F03` | Imports, `stock`, stage 2 onwards |
| Import handler contract | `files-imports` | `S1-F06` | `organisation`, `merchandise`, `site-lifecycle`, `ebo-imports` |
| Allocate a number; series states | `numbering` | `S1-F08` | `exceptions`, `finance`, `pos` |
| Raise an exception; resolution-check contract | `exceptions` | `S1-F08` | Every module |
| Post, Check postable, Reverse | `finance` · books | `S1-F09` | `stock`, `pos`, later finance parts |
| Stock ledger operations | `stock` · ledger | `S1-F10`, after its design (RR-012) | Every stock workflow from stage 2 |
| Calculation function signatures and the golden-case format | `calculations` | `S1-F11` | `pos`, `offers`, `merchandise` · PT, `hr`, the counter |

## 7. Module ownership and lanes

- **One owning lane per module at a time.** Each module folder under `apps/server/src/modules/`, `kernel`, each package and each feature folder of the web app has one owning lane at a time. A feature that needs a change in a module another lane owns hands that task to the owning lane's queue. Two features run at the same time only when their tasks in shared modules can be queued this way.
- **Splitting a module.** A lane may let another lane work in a separate subfolder of its module, while the module's `index.ts`, migrations and registrations stay with the owning lane.
- **The web app.** Each feature's screens live in their own folder under `apps/web/src/`; the router, the shell and the message catalogue stay with one integrator.

Stage 1 lanes:

| Lane | Owns | Stage 1 queue, in order |
| --- | --- | --- |
| Access | `access`, `configuration`, `site-lifecycle` | `S1-F01` access tasks; `S1-F02` access tasks (scope contract, place tree in effective grants); `S1-F05`; `S1-F03` access tasks (field classes, encryption); `S1-F04`; `S1-F12` device tasks; `S1-F10` access tasks (verify under lock, record use) |
| Platform | `kernel`, `audit`, `inbox`, `numbering`, `exceptions` | `S1-F01` kernel, audit and inbox tasks; `S1-F08`; `S1-F14` operations parts |
| Structure | `organisation` | `S1-F02`; its import handler for `S1-F06`; its readiness answers for `S1-F04` |
| Masters | `merchandise` | `S1-F03`; its import handler for `S1-F06` |
| Imports | `files-imports` | `S1-F06`; `S1-F07`; `S1-F13` layouts; `S1-F14` file checks |
| Finance | `finance` | `S1-F09`; `S1-F10` posting parts |
| Stock | `stock` and the synthetic harness | `S1-F10` after DR-2; `S1-F13` opening handler |
| Calculations | `packages/calculations` and the counter build host | `S1-F11` |
| Web | `apps/web` shell and router | Each feature's screens, in feature order |
| Design | Design documents | RR-012, RR-013 and the harness decisions; GC-8; GC-9 |

The access lane carries the most stage 1 work and sets the critical path. With fewer builders than lanes, lanes are taken in the order of the table; how many run at once (RR-031) never blocks the start.

Shared files, owned by one integrator each and merged in order:

| Shared file or folder | Rule |
| --- | --- |
| `apps/server/src/app.module.ts` | One line per module, added by the feature that adds the module |
| `packages/schemas/src/index.ts` | Each module exports from its own file; the index only re-exports |
| Migration folders | One folder per module schema; migration numbers are taken when the change merges, not when the branch starts |
| `tools/module-check/check.mts` tier table | Changes only after [module-map.md](../design/architecture/module-map.md) changes (`AGENTS.md`, "Code workspace") |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `eslint.config.mjs`, `.github/workflows/` | One change per merge; a new dependency must be in the PRD Stack (`AGENTS.md`, "Stack") |
| `docs/reviews.json` | Written only by the doc checker's review commands, in one sequence per review round |

## 8. Integration checkpoints and stage overlap

At each checkpoint every lane merges to `main`, the full check set passes in CI, and the contracts used so far are frozen for the next lanes.

| Checkpoint | After | What must be true |
| --- | --- | --- |
| IC-1 | Stage 0 | The start gate of [stage-0-preparation.md](stage-0-preparation.md) section 2 is met |
| IC-2 | `S1-F01` | Kernel command context, idempotency, outbox, audit and the approval contract frozen; first browser journey green |
| IC-3 | `S1-F02`, `S1-F03`, `S1-F05` | Place scope, field classes, masters and approval limits frozen; later modules authorise against real scope facts |
| IC-4 | `S1-F04`, `S1-F08`, `S1-F09` | Policy gate, numbering, exceptions and Post frozen: the prerequisites of any stock or money effect |
| IC-5 | `S1-F06`, `S1-F07`, `S1-F12` | Imports, layouts and device series frozen |
| IC-6 | `S1-F10`, `S1-F11`, `S1-F13`, `S1-F14` | Stage 1 exit rehearsal: golden cases and scenarios, opening data, restore proof |
| Later | Each later stage | One checkpoint after the stage's first posting feature (its mid-stage checkpoint) and one at its exit |

**Stage overlap: one rule for every stage.**

- Design of a stage may start once the contracts it calls are frozen.
- Coding of a stage's feature may start after the previous stage's mid-stage checkpoint (for stage 2, IC-4), once that feature's area design is reviewed and the features it depends on are merged. The one exception is the order [phases.md](../phases.md) gives inside stage 6: employee records, attendance, rosters and leave may start after stage 1.
- A stage exits only after the previous stage has exited.
- Live use follows each stage's own live-activation list. Building a feature never switches it on (`PRD-SEC-017`, `DEC-105`).

## 9. Documentation review checkpoints

Reviews use the existing gate in `AGENTS.md` ("Change gate", "Honest reviews") and [tools/doc-check/ai-review.md](../../tools/doc-check/ai-review.md). A review round is gathered first with `impact`, so each section is reviewed once.

| Batch | When | Sections |
| --- | --- | --- |
| DR-1 | Start gate (`S0-T08`) | The new code house rules; the never-reviewed `AGENTS.md` sections (4); [deployment.md](../design/platform/deployment.md) sections 5 and 9 |
| DR-1b | Before `S1-F01-T14`, the first screen | The [design-language.md](../design/ui/design-language.md) sections and [ui-blueprint.html](../design/ui/ui-blueprint.html) parts the first screens use |
| DR-2 | Before coding `S1-F10` | The stock ledger interface and tables (RR-012); the synthetic harness and its decisions ([s1-f10-stock-harness.md](s1-f10-stock-harness.md), RR-013); the 25 never-reviewed sections of [stock-ledger.md](../design/stock/stock-ledger.md) (RR-018) |
| DR-3 | Before coding `S1-F12` and `S1-F14` | GC-8 and GC-9, and the edits they cause elsewhere |
| DR-4 onwards | Before each later stage's coding | That stage's area designs, the never-reviewed sections of [phases.md](../phases.md) for it, and any decision round |

- Only a reviewer the product owner names may have records written with `review`, `record` or `drop`, and `--by` names who actually reviewed.
- **Named reviewers** (`S0-T01`, 5 Oct 2026): Anand Kumar, for DR-1 and later batches, recorded as `--by "Anand Kumar"`. **Also accepted** (product owner, 5 Oct 2026): independent AI reviewers working under [tools/doc-check/ai-review.md](../../tools/doc-check/ai-review.md), recorded under their own name, never under Anand Kumar's. A batch reviewed this way counts as reviewed once its findings are fixed and re-reviewed and the product owner approves the batch. This waives no review requirement and permits no record of a review that did not happen.
- **Batches approved by the product owner:** the `DEC-112` batch (rounds 1 to 6) and the `S1-F01-T01` batch (rounds 1 and 2), on 6 Oct 2026.
- One reason per section, from reading that section against its current sources. Never one reason for many sections, and never a reason written to make the check pass.
- A finding is fixed in the lower document. A business question goes up as a decision entry or a KDPS question.

## 10. Rules for whoever builds a task

- Follow `AGENTS.md`. Cite the PRD, policy or decision ID in code and tests where a rule is enforced.
- Complete each task that changes code as `AGENTS.md` "Completing a code task" says: independent review, fixes rechecked, final checks on the final revision.
- Leave `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm check:modules`, `pnpm format:check` and the doc checker passing.
- Every setting whose value belongs to KDPS ships with no default. Tests set labelled synthetic values.
- Nothing policy-dependent is switched on by default. A capability ships off (`PRD-SEC-017`).
- Build every outside-system adapter against its simulator first (section 5).
- If a task meets a question the design does not answer, stop and raise it: a design note for a technical choice, the product owner for a product choice, `docs/questions-for-kdps.md` for a KDPS value.

## 11. Keeping the plan current

- This folder is not a gated document: the doc checker checks its IDs, links and tables only, not its meaning. When the PRD or the policies change, check [requirement-coverage.md](requirement-coverage.md) and the register by hand.
- On 5 Oct 2026 every one of the 520 PRD bullets had one owner feature and one completing feature, and no feature named an ID that does not exist.
- Whether to make this folder a gated document is a product-owner choice (RR-052).
