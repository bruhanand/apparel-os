# S1-F11 — Acceptance evidence

> **Not ranked.** Evidence for [spec](spec.md) section 8. It decides nothing.

## 1. The CI run

Run 37667713068 on branch `s1/f11-shared-calculations`, commit `101cc42` (CI run URL: github.com/bruhanand/apparel-os/actions/runs/37667713068):

- `check` (lint, typecheck, module check, link check, format check, unit tests including the Vitest server run of `S1-F11-AT01` to `S1-F11-AT05`): success.
- `counter-run` (Playwright, Chromium, `S1-F11-AT06`): success.
- `browser-journeys` (the S1-F01 journeys, not part of this feature): **hung, cancelled and re-run; result recorded in the ticket's Notes.**

## 2. Counter run result

Locally: 39 passed, 3 skipped. The skipped cases are CG-21, CG-21b and CG-22, costing cases reported as server-only, never as passed. No case is marked pending.

## 3. Bundle check (`S1-F11-AT11`)

`apps/counter/test/build-guard.test.ts` builds twice with real Vite: a selling-only build passes; a build with a deliberate import of `@apparel-os/calculations/costing` fails. The e2e also reads the build guard's module list and fails if it holds a costing module.

## 4. Synthetic rule data

Every golden case file carries `"synthetic": true`. The rule data of the unit and property tests is `packages/calculations/test/synthetic.ts`; every value is labelled `SYN-…` or `syn-…` and is never a default (shared-calculations 12.3; code-house-rules 11.1).

## 5. Case list and the IDs each case covers

| Case | Title | Function | Covers | Synthetic |
| --- | --- | --- | --- | --- |
| CG-01 | One line, no offer | priceBill | `PRD-POS-004`, `PRD-TAX-005` | yes |
| CG-02 | Two slabs | priceBill | `POL-10.02` | yes |
| CG-03 | Percentage offer | priceBill | `PRD-OFR-001` | yes |
| CG-04 | Flat-value offer | priceBill | `PRD-OFR-001` | yes |
| CG-05 | Basket offer spread, paise left | priceBill | `PRD-POS-023` | yes |
| CG-06 | Buy 2 get 1, spread | priceBill | `PRD-POS-023` | yes |
| CG-07a | Two offers, no rule: best for the customer | priceBill | `PRD-OFR-021` | yes |
| CG-07b | Tie | priceBill | `PRD-OFR-021` | yes |
| CG-08 | Combination permitted | priceBill | `POL-19.04`, `PRD-OFR-021` | yes |
| CG-09 | Discount moves the slab | priceBill | `PRD-OFR-005` | yes |
| CG-10 | No slab fits | priceBill | `POL-10.05` | yes |
| CG-11 | Price above MRP | priceBill | `PRD-POS-024` | yes |
| CG-12 | Markdown price list | priceBill | `PRD-OFR-004` | yes |
| CG-13 | Unknown inputs | priceBill | `PRD-MOD-015` | yes |
| CG-14 | Prices exclude tax | priceBill | `PRD-TAX-005` | yes |
| CG-15a | Exact cash | checkTenders | `PRD-POS-007`, `PRD-MOD-016` | yes |
| CG-15b | Change | checkTenders | `PRD-POS-008` | yes |
| CG-15c | Entered zero | checkTenders | `PRD-POS-007` | yes |
| CG-15d | Does not add up | checkTenders | `PRD-POS-006` | yes |
| CG-15e | Cash received with no cash line | checkTenders | `PRD-POS-008` | yes |
| CG-15f | Stale allocation | checkTenders | `PRD-POS-009` | yes |
| CG-15g | Invalid amount | checkTenders | `PRD-POS-008` | yes |
| CG-16 | Part of a line | returnValue | `PRD-RET-024` | yes |
| CG-16b | Too many | returnValue | `PRD-RET-005`, `PRD-RET-006` | yes |
| CG-17 | Return the reward unit | returnValue | `PRD-RET-024`, `PRD-ACP-008` | yes |
| CG-18a | Split refund, paise left | splitRefund | `PRD-RET-022` | yes |
| CG-18b | A cap binds | splitRefund | `PRD-RET-022` | yes |
| CG-18c | The DEC-007 example | splitRefund | `PRD-RET-022` | yes |
| CG-18d | Above what is left | splitRefund | `PRD-RET-022` | yes |
| CG-19a | Exchange, higher | exchangeDifference | `PRD-RET-007` | yes |
| CG-19b | Exchange, cheaper, no rule | exchangeDifference | `PRD-RET-008` | yes |
| CG-19c | Exchange, cheaper, synthetic rule | exchangeDifference | `PRD-RET-008` | yes |
| CG-20a | Modes | round | `PRD-MOD-014`, `PRD-MOD-015` | yes |
| CG-20b | Bill round-off | priceBill | `PRD-MOD-014` | yes |
| CG-20c | Missing rule | priceBill | `PRD-SEC-017` | yes |
| CG-21 | Synthetic costing profile | costLine | `POL-03.06`, `PRD-PTW-010` | yes |
| CG-21b | Missing input | costLine | `POL-03.08` | yes |
| CG-22 | Ticket margin | ticketMargin | `PRD-PTW-011` | yes |

## 6. Review and triage

`/code-review` (standards and spec axes) on the counter half, since `cb4be59`. Findings and triage:

| Finding | Triage |
| --- | --- |
| Costing detection duplicated in three places; guard could pass if resolution failed | Fixed: one shared `isCostingModule`; the guard fails if the costing entry does not resolve (`101cc42`) |
| Local copies of case and outcome types; copied costing function list; brittle path assertion | Fixed |
| Failure path of the counter run not shown | Fixed: a deliberately wrong case is reported failed |
| Serial e2e hid later cases after a failure | Fixed |
| Unused `@apparel-os/domain` dependency; single-use options and helper | Fixed |
| `vite` and `@playwright/test` not in the catalogue | Fixed |
| 5.4 and 5.5 stale (React, root script) | Fixed in the design |
| Counter outcome compared with expected files, not with the server's actual output | Accepted: both runs use the same case files and the whole result including versions |
| Guard checks module paths, not exports | Accepted: the selling entry point may not import costing (module check and `S1-F11-AT10`) |

The server half was reviewed in three rounds before `8e71547`. No blocking finding is left. The product owner's acceptance is recorded in the ticket.
