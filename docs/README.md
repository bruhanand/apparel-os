# Apparel OS documents

**Start here:** [STATUS.md](STATUS.md) says where the work stands, what comes next and what is waiting on you, on one screen.

## The order of authority

When two documents disagree, the one higher in this order wins.

| Rank | Document | What it says |
| --- | --- | --- |
| 1 | [prd.md](prd.md) | What the product does. The source of truth for requirements and for vocabulary, through its "Words used" tables. |
| 2 | [kdps-policies.md](kdps-policies.md) | What KDPS has decided, within the options the PRD allows. |
| 3 | [design/](design/README.md) | How the system implements the PRD and the KDPS policies. A design document may never contradict either of them. |
| 4 | Code | Implements the design. |

[phases.md](phases.md) sets the order of the work only; if it disagrees with the PRD or the KDPS policies, they win. Everything else below is unranked and decides nothing on its own.

## Folder map

| Path | What it is | Who reads it |
| --- | --- | --- |
| [STATUS.md](STATUS.md) | Where we are, what's next, what's waiting on you | You, every session |
| [prd.md](prd.md), [kdps-policies.md](kdps-policies.md) | Ranks 1 and 2 | Everyone |
| [phases.md](phases.md) | The six delivery stages and their exit checks | Everyone |
| [decisions.md](decisions.md) | Log of every change to the PRD and policies (`DEC-nnn`): question, options, choice, why. The entry comes first; the edit follows | Everyone |
| [questions-for-kdps.md](questions-for-kdps.md) | What only KDPS or the CA can answer, by person, in plain language | You, KDPS |
| [design/](design/README.md) | Rank 3. One folder per area: `access/`, `architecture/`, `calculations/`, `finance/`, `masters/`, `platform/`, `pos/`, `stock/`, `ui/` | Builders |
| [plan/](plan/roadmap.md) | How the stages are built: [roadmap.md](plan/roadmap.md) (all stages and features), [stage-1/](plan/stage-1/README.md) (the current stage: one folder per feature with its spec and tickets), [open-items.md](plan/open-items.md) (questions for you and builders), [kdps-values.md](plan/kdps-values.md) (what KDPS must answer before going live), [how-we-build.md](plan/how-we-build.md) (build rules), [coverage.md](plan/coverage.md) (which feature delivers each PRD rule) | You and builders |
| [data-notes/](data-notes/README.md) | Notes on the KDPS data by topic: layouts, codes, offers, data quality, fit with the PRD | Builders |
| [data-from-kdps/](data-from-kdps/README.md) | Raw data KDPS sent (June–July 2026). Git-ignored; only its READMEs are tracked | Builders |
| [research/](research/discount-patterns-research.md) | Reference research for later designs (discount patterns) | Builders, later |
| [history/](history/reports-README.md) | Old one-time reports, the stage 0 record and old session handouts. Kept for provenance; nobody updates them | Rarely |
| [agents/](agents/domain.md) | Setup for the AI agent skills (tracker, labels, domain docs) | AI agents |

## Codes you'll see

| Code | Means | Where it lives |
| --- | --- | --- |
| `PRD-XXX-nnn` | A PRD requirement | [prd.md](prd.md) |
| `POL-nn.nn` | A KDPS policy answer | [kdps-policies.md](kdps-policies.md) |
| `DEC-nnn` | A decision that changed the PRD or policies | [decisions.md](decisions.md) |
| `S1-F01`, `S1-F01-T04`, `S1-F01-AT05` | Stage 1 feature 1, its ticket 4, its acceptance test 5 | [roadmap.md](plan/roadmap.md); tickets in `plan/stage-N/<feature>/tickets/` |
| `RR-nnn` | An open item | [open-items.md](plan/open-items.md), or [kdps-values.md](plan/kdps-values.md) for KDPS values |
| `V-nn` | A KDPS value still to be given | [kdps-values.md](plan/kdps-values.md) section 2 (first listed in [the alignment report](history/alignment-report.md) section 5) |
| `GC-1` … `GC-9` | The nine stage 1 designs: GC-1 [module map](design/architecture/module-map.md), GC-2 [structure and masters](design/masters/structure-and-masters.md), GC-3 [access and approvals](design/access/access-and-approvals.md), GC-4 [books and posting](design/finance/books-and-posting.md), GC-5 [numbering and audit](design/platform/numbering-and-audit.md), GC-6 [imports and opening data](design/platform/imports-and-opening-data.md), GC-7 [shared calculations](design/calculations/shared-calculations.md), GC-8 [offline counter](design/pos/offline-counter.md) (draft), GC-9 [backup and restore](design/platform/backup-and-restore.md) (draft). GC-10 and GC-11 were settled or moved to RR-031 | The design files |
| `GC2-n` … `GC9-n`, `SL-n`, `MM-n`, `DM-n`, `D-n`, `CH-n` | An open question inside a design: GC-2 to GC-9, the stock ledger, module map, domain model, deployment, code house rules | That design's open-questions section |
| `H1` … `H6` | Decisions about the stock test harness (`DEC-112`) | [S1-F10 spec](plan/stage-1/s1-f10-stock-ledger/spec.md) section 5 |
| `P-ADM`, `P-OWN` … | The 14 personas | [personas.md](design/access/personas.md) |
| `A-`, `B-`, `C-`, `N-`, `X-` | Findings of the old alignment reports, cited in `decisions.md` "Report item" lines | [history/](history/reports-README.md) |

## When two documents disagree

- The higher document wins straight away. Treat the lower one as wrong until it is fixed.
- Fix the lower document to match. Never change a higher document only to make a lower one fit.
- If the higher document is the one that is wrong, change it first. Then update everything below it.
- A KDPS policy answer that falls outside the options the PRD allows is not a valid policy. It is a request to change the PRD.
- A design question that needs a business decision is not settled in the design. It goes up to the PRD or the KDPS policies.
- Code that differs from its design is a defect. Fix the code, or change the design first and then the code.
- Where no design document exists yet, code follows the PRD and the KDPS policies directly, and the missing design is noted.

## Words

- Use words exactly as the PRD's "Words used" tables define them, in every document and in the code.
- A new term is added to "Words used" first, before any other document or code uses it.
- A lower document cannot give an existing word a different meaning.

## Design documents

- Design documents live in [design/](design/), one folder per area. The user interface design is in [design/ui/](design/ui/). Personas, roles, access, approvals, My work and exceptions are in [design/access/](design/access/). Hosting and environments, the code house rules, document numbering and audit history, and imports and opening data are in [design/platform/](design/platform/). The stock ledger, which every stage posts stock through, is in [design/stock/](design/stock/). The module map and the domain model, which every other design and all code follow, are in [design/architecture/](design/architecture/). The business structure and the masters are in [design/masters/](design/masters/). The books, their periods, journals and posting maps are in [design/finance/](design/finance/). The shared price, discount, tax and rounding calculations, used by server and counter, are in [design/calculations/](design/calculations/). The offline counter and billing devices are in [design/pos/](design/pos/) (draft). Backup, restore and export are in [design/platform/](design/platform/) (draft).
- Each design document starts by naming the PRD sections and KDPS policies it implements, with the requirement and policy IDs (`PRD-…`, `POL-…`) it applies. It cites the ID next to each rule it applies.
- A design document lists its open questions. A question that needs a business decision is raised against the PRD or the KDPS policies.
