# How we build

> **Not ranked.** The working rules for building Apparel OS: labels, gates, the rules every ticket follows, simulators, the shared contracts and files. It decides nothing; the PRD, the policies and the designs win. The work loop itself is in `AGENTS.md` "How we work".

## 1. Labels

These labels name pieces of work. Ticket files keep the task label in their name (`tickets/T04-idempotency-helper.md` is `S1-F01-T04`). They are not requirement IDs: a rule is always cited by its `PRD-`, `POL-` or `DEC-` ID.

| Label | Meaning | Example |
| --- | --- | --- |
| `S0-Tnn` | A preparation task | `S0-T04` |
| `Sn-Fnn` | Feature nn of stage n | `S1-F01` |
| `Sn-Fnn-Tnn` | Task nn of that feature | `S1-F01-T07` |
| `Sn-Fnn-ATnn` | Acceptance test nn of that feature | `S1-F01-AT05` |
| `RR-nnn` | An open item: in [open-items.md](open-items.md) or [kdps-values.md](kdps-values.md) | `RR-012` |

The open-question codes of the designs (`GC2-n`, `SL-n`, `MM-n`, `V-n` and the rest) keep their meaning; the open-item lists name them beside their RR number, and [docs/README.md](../README.md) says which document each prefix belongs to.

## 2. Gates

An open item blocks work only at the gate it names. Most open KDPS values block live activation only: design, code and synthetic tests go on without them (`DEC-105`, [phases.md](../phases.md) "How the stages are cut").

| Gate | Blocks | Example |
| --- | --- | --- |
| **Design** | Writing or changing the design of the named feature | A product-owner choice the design needs |
| **Code** | Coding the named feature or task | Approval of the stock ledger's Proposed choices before `S1-F10` (RR-012) |
| **Accept** | Accepting the named feature: a test or its evidence needs it | The 10,000-line PT parse within one minute for `S1-F07` (RR-189) |
| **Exit** | The stage exit | The restore proof for stage 1 (RR-188) |
| **Live** | Switching a policy-dependent operation on for a real Organisation, or using real KDPS data | The signed policy 2 and KDPS's role map (RR-158, RR-064) |

- Synthetic data is labelled synthetic in names, codes and file properties, and never becomes a default (`AGENTS.md`, "Never invent a value").
- A KDPS value with no answer is a setting with no default. On `dev`, tests use labelled synthetic settings; on production the operation stays unavailable until the policy is Signed and the value validated (`PRD-SEC-017`, `DEC-105`).
- Historical KDPS exports are evidence for checks, never verified opening stock (`PRD-LIF-014`, `PRD-LIF-027`).

## 3. Rules for whoever builds a ticket

- Follow `AGENTS.md`. Cite the PRD, policy or decision ID in code and tests where a rule is enforced.
- Follow the loop of `AGENTS.md` "How we work": tests, one independent review, a focused recheck of the fixes, final checks. A blocking defect that remains keeps the ticket unfinished.
- Leave `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm check:modules`, `pnpm check:links` and `pnpm format:check` passing.
- Every setting whose value belongs to KDPS ships with no default. Tests set labelled synthetic values.
- Nothing policy-dependent is switched on by default. A capability ships off (`PRD-SEC-017`).
- Build every outside-system adapter against its simulator first (section 4).
- If a task meets a question the design does not answer, stop and raise it: a design note for a technical choice, the product owner for a product choice ([open-items.md](open-items.md)), [questions-for-kdps.md](../questions-for-kdps.md) for a KDPS value.

## 4. Simulated external services first

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

## 5. Shared contracts

Parallel work is safe only after the contract it calls is stable. Each contract below is built once, by the feature named, and then changed only through its owner with a note to every caller.

| Contract | Owner | Built in | Callers |
| --- | --- | --- | --- |
| API conventions: route shape, Zod schemas in `packages/schemas`, error envelope, idempotency-key header, version token for stale-version refusal, generated OpenAPI and typed client | Code house rules | `S0-T04` (built), first used in `S1-F01-T05` | Every feature |
| Migration layout: one schema per module, directory and Organisation migration sets, migration and runtime roles | Code house rules | `S0-T05` (built) | Every feature with tables |
| Synthetic fixtures and reset | Code house rules | `S0-T06` (built) | Every database and browser test |
| Command context: one transaction, actor setting for row-level security, lock helper | `kernel` | `S1-F01-T03` (built) | Every module |
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
| Stock ledger operations | `stock` · ledger | `S1-F10`, after its Proposed choices are approved (RR-012) | Every stock workflow from stage 2 |
| Calculation function signatures and the golden-case format | `calculations` | `S1-F11` (built, server half) | `pos`, `offers`, `merchandise` · PT, `hr`, the counter |

## 6. Ownership and shared files

- **One owner per module at a time.** Each module folder under `apps/server/src/modules/`, `kernel`, each package and each feature folder of the web app has one owner at a time. A change in a module someone else is working on goes to them.
- **The web app.** Each feature's screens live in their own folder under `apps/web/src/`; the router, the shell and the message catalogue have one owner.

Shared files, changed one merge at a time:

| Shared file or folder | Rule |
| --- | --- |
| `apps/server/src/app.module.ts` | One line per module, added by the feature that adds the module |
| `packages/schemas/src/index.ts` | Each module exports from its own file; the index only re-exports |
| Migration folders | One folder per module schema; migration numbers are taken when the change merges, not when the branch starts |
| `tools/module-check/check.mts` tier table | Changes only after [module-map.md](../design/architecture/module-map.md) changes (`AGENTS.md`, "Code workspace") |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `eslint.config.mjs`, `.github/workflows/` | One change per merge; a new dependency must be in the PRD Stack (`AGENTS.md`, "Stack") |

## 7. What binds the build

- **Decisions** are the `DEC-` entries and the PRD and policy text. Only they bind the build.
- **Baseline picks** of `DEC-105` and `DEC-112` bind the build until a confirmer asks for a change ([kdps-values.md](kdps-values.md), baseline picks).
- **Proposals** are marked "Proposed" in the designs (GC6-15, GC-7 5.6 and 5.8) or are the data notes' gap drafts. They bind nothing. Where a task would have to choose one, the gate is Code for that task.
- **Source observations** are what the KDPS files show today ([data-notes/](../data-notes/README.md)). They are evidence of need, never settings, and analyst values are never defaults.

## 8. A builder's machine

Checked on the product owner's machine on 5 Oct 2026 ([stage 0 record](../history/stage-0-preparation.md)):

- Node.js 22.18 or later; pnpm at the version `package.json` names, activated with `corepack enable` and `corepack prepare pnpm@<version> --activate`.
- Docker Desktop running before `pnpm test:integration`. Testcontainers reaches it through the `desktop-linux` Docker context; there may be no `/var/run/docker.sock`.
- `git config core.hooksPath .githooks` once per clone, so the pre-commit hook runs the link check and the code checks.
- Commits carry no AI attribution lines (product owner's standing rule).
