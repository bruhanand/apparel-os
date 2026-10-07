# S1-F11 — Shared calculations on server and counter

> **Not ranked.** The spec of a stage 1 feature ([stage 1](../README.md)). It decides nothing. The rules come from the PRD, the policies and the designs cited; where this page and a design disagree, the design wins and this page is fixed.

## 1. Outcome

`packages/calculations` holds the shared selling and costing logic of [shared-calculations.md](../../../design/calculations/shared-calculations.md) (GC-7) as one pure TypeScript package with two entry points: `@apparel-os/calculations` for selling (price, offers, spread, tax, rounding, tenders, returns) and `@apparel-os/calculations/costing` for costing and ticket margin, which only the server imports. Every KDPS value (rates, slabs, components, rounding rules, offers, combination rules, thresholds, the cheaper-replacement rule, costing profiles) comes in as a versioned input and goes out again in the result; nothing has a default. The golden cases of GC-7 12.4 run on labelled synthetic rule data (12.3) in a Vitest suite on the server runtime, and the same case files run in a test page of the counter build in Chromium, with identical results. The counter bundle provably holds no costing entry point.

Stage 1 exit check 2 ([stage 1 README](../README.md) section 7) needs both runs green in the same CI run. The server half is built (`8e71547`); the counter half waits for Playwright (`S1-F01-T15`); the counter build host, `apps/counter`, was approved on 6 Oct 2026 (RR-015).

## 2. Binding references

| Kind | References |
| --- | --- |
| PRD | `PRD-MOD-002`, `PRD-MOD-007`, `PRD-MOD-010`, `PRD-MOD-014` to `PRD-MOD-016`; `PRD-POS-002` to `PRD-POS-009`, `PRD-POS-013`, `PRD-POS-014`, `PRD-POS-023`, `PRD-POS-024`; `PRD-RET-001`, `PRD-RET-005` to `PRD-RET-008`, `PRD-RET-010`, `PRD-RET-022`, `PRD-RET-024`; `PRD-OFR-001` to `PRD-OFR-006`, `PRD-OFR-021`; `PRD-TAX-005`; `PRD-OFF-004`, `PRD-OFF-005`, `PRD-OFF-009`, `PRD-OFF-016`; `PRD-MER-009`, `PRD-MER-015`; `PRD-STK-013`; `PRD-PTW-010`, `PRD-PTW-011`; `PRD-ACS-015`; `PRD-HRM-010`; `PRD-SEC-015` to `PRD-SEC-017`; `PRD-PRF-003`; `PRD-ACP-008`, `PRD-ACP-010`, `PRD-ACP-017`, `PRD-ACP-018` |
| Policies | `POL-03.06` to `POL-03.08`, `POL-06.04`, `POL-06.09`, `POL-07.01`, `POL-07.02`, `POL-09.13`, `POL-09.24`, `POL-10.02`, `POL-10.05`, `POL-10.06`, `POL-10.10`, `POL-10.11`, `POL-13.06`, `POL-13.08`, `POL-16.04`, `POL-19.01`, `POL-19.02`, `POL-19.04` |
| Decisions | `DEC-007`, `DEC-105`, `DEC-108`, `DEC-109`, `DEC-110`, `DEC-111`, `DEC-112` |
| Designs | [shared-calculations.md](../../../design/calculations/shared-calculations.md) sections 2 to 12; [module-map.md](../../../design/architecture/module-map.md) 4.2, 4.14, 6.2 flow D; [domain-model.md](../../../design/architecture/domain-model.md) 3.12 and invariant 18; [structure-and-masters.md](../../../design/masters/structure-and-masters.md) 2.2, 4.1; [code-house-rules.md](../../../design/platform/code-house-rules.md) 2, 10, 11 |
| Register | RR-005 (the package and its cases); RR-015 (the counter build host, approved 6 Oct 2026: `apps/counter`); RR-042 (which lines earn a group discount, deferred); RR-136 to RR-145 (the live values of GC7-1 to GC7-10) |

## 3. Scope

- In: the package, its numbers and refusals; pricing; tenders; returns, exchanges and split refunds; costing and ticket margin; the pure part of the tax-rule records (shapes, the checks of 10.1 and 10.3, the version in force on a date); the golden-case format, runner and cases; the other tests of 12.5 that need no counter; the source-level proof that selling never reaches costing.
- Out, here: the tax-rule tables, their migrations and the "Read tax rules" query (`finance` · tax rules, `S1-F09`); the callers (`pos`, `offers`, `merchandise` · PT, `hr`); Zod schemas for the shapes that cross the API (`packages/schemas`, with the first API that carries them, 2.1); incentives (section 9, stage 6).
- The counter run and the bundle check on the counter bundle are built in `T10` (section 6).

## 4. Business invariants

| Invariant | Source |
| --- | --- |
| Every amount is integer paise; every intermediate is an exact fraction of two `BigInt` integers; nothing is binary floating point | `PRD-MOD-014`; GC-7 3.1, 3.2; domain-model invariant 18 |
| An exact fraction becomes paise only at a named rounding step; a fraction reaching a result without one is a defect | GC-7 3.2, 3.3 |
| Unknown is never zero: a selling calculation needing an Unknown input refuses and names it; costing returns Unknown with the missing inputs listed | `PRD-MOD-015`, `POL-03.08`; GC-7 3.4 |
| No KDPS value has a default; a step whose rule is not in force refuses with the rule named | `PRD-SEC-017`; GC-7 3.3; `AGENTS.md` "Never invent a value" |
| Every function takes the rule versions it uses and returns them, so a bill keeps its snapshot | `PRD-POS-014`, `PRD-MOD-010`; GC-7 section 4 |
| No database, network, clock, randomness or environment; the same input always gives the same output | `PRD-MOD-007`; GC-7 2.1 |
| The package imports only `@apparel-os/domain`; the selling entry point never reaches the costing entry point | `PRD-MOD-002`, `PRD-OFF-004`; GC-7 2.1, 2.3 |
| Authority is never checked here; `pos` checks it through `access` | `PRD-POS-003`; GC-7 2.2 |
| Business conditions are typed refusals, never thrown exceptions | GC-7 5.10 |
| Where an open question (GC7-9, GC7-11 to GC7-16) would change an amount, the calculation refuses with `not-decided` naming it, and picks no reading of it. It does apply the **Proposed** readings GC-7 states (section 9) | `AGENTS.md` "Never invent a value"; GC-7 5.10; RR-042 |

## 5. Dependencies and gates

| Item | Gate | Status |
| --- | --- | --- |
| RR-042: which lines earn a group discount (GC7-11) | Accept: any golden case whose result depends on it | No case of 12.4 depends on it (section 9); the calculation refuses where the readings differ |
| RR-015: which workspace package hosts the counter PWA and its test page | Code: `S1-F11-T10` | Approved by the product owner on 6 Oct 2026: `apps/counter` ([offline-counter.md](../../../design/pos/offline-counter.md)), served at `/counter/`, with its browser tests in `apps/counter/e2e/` |
| Playwright in the workspace and CI | Code: `S1-F11-T10` | Arrived with `S1-F01-T15`; the counter run is in CI (T10) |
| RR-136 to RR-145: the real values of GC7-1 to GC7-10 | Live S4 | Not needed to build or test; synthetic rules stand in, labelled |

## 6. Tickets

One file per task in [tickets/](tickets/).

| Ticket | Status | Blocked by |
| --- | --- | --- |
| [S1-F11-T01 Package and numbers](tickets/T01-package-and-numbers.md) | done | — |
| [S1-F11-T02 Pricing](tickets/T02-pricing.md) | done | — |
| [S1-F11-T03 Tax-rule records, pure part](tickets/T03-tax-rule-records-pure-part.md) | done | — |
| [S1-F11-T04 Tenders](tickets/T04-tenders.md) | done | — |
| [S1-F11-T05 Returns](tickets/T05-returns.md) | done | — |
| [S1-F11-T06 Costing](tickets/T06-costing.md) | done | — |
| [S1-F11-T07 Golden-case format and server run](tickets/T07-golden-case-format-and-server-run.md) | done | — |
| [S1-F11-T08 Other tests of 12.5](tickets/T08-other-tests-of-12-5.md) | done | — |
| [S1-F11-T09 Entry points at the source](tickets/T09-entry-points-at-the-source.md) | done | — |
| [S1-F11-T10 Counter test page, counter run and bundle exclusion](tickets/T10-counter-test-page-and-counter-run.md) | in-progress | S1-F01-T15 (done); T07 (done) |
| [S1-F11-T11 Bundle exclusion on the counter bundle](tickets/T11-bundle-exclusion-on-the-counter-bundle.md) | merged → T10 | — |
| [S1-F11-T12 Review and acceptance](tickets/T12-review-and-acceptance.md) | merged → T10 | — |


## 7. Tests

Unit tests in Vitest beside the code; the golden cases and the tests of 12.5 under `packages/calculations/test/`. All data is labelled synthetic (code-house-rules 11.1). Each test cites the IDs it proves.

| Test | What it proves | Design test | IDs |
| --- | --- | --- | --- |
| `S1-F11-AT01` | The pricing cases on the server: one line, two slabs, percentage, flat, basket with paise left, buy 2 get 1 spread, best offer and tie, permitted combination, slab change, no slab fits, price above MRP, markdown price list, Unknown inputs, prices without tax | 12.4 CG-01 to CG-14 | `PRD-POS-004`, `PRD-TAX-005`, `POL-10.02`, `PRD-OFR-001`, `PRD-POS-023`, `PRD-OFR-021`, `POL-19.04`, `PRD-OFR-005`, `POL-10.05`, `PRD-POS-024`, `PRD-OFR-004`, `PRD-MOD-015` |
| `S1-F11-AT02` | The tender cases | 12.4 CG-15a to CG-15g | `PRD-POS-006` to `PRD-POS-009`, `PRD-MOD-016` |
| `S1-F11-AT03` | The return, exchange and split-refund cases | 12.4 CG-16 to CG-19c | `PRD-RET-005` to `PRD-RET-008`, `PRD-RET-022`, `PRD-RET-024`, `PRD-ACP-008` |
| `S1-F11-AT04` | Rounding mechanics: the four modes, the bill round-off, a missing rule | 12.4 CG-20a to CG-20c | `PRD-MOD-014`, `PRD-MOD-015`, `PRD-SEC-017` |
| `S1-F11-AT05` | Costing and margin, server only | 12.4 CG-21, CG-21b, CG-22 | `POL-03.06`, `POL-03.08`, `PRD-PTW-010`, `PRD-PTW-011` |
| `S1-F11-AT06` | The same case files on the counter build in Chromium give identical results (built in T10; acceptance open) | 12.2 | `PRD-ACP-018`, `PRD-MOD-007` |
| `S1-F11-AT07` | Spread shares add up to the discount; tender lines add up to the amount due; refunds of all units add up to the paid value; split refunds add up and respect caps; no line below zero; every number in a result is whole paise | 12.5 property tests | `PRD-MOD-014`, `PRD-ACP-010`, `PRD-POS-023`, `PRD-RET-022`, `PRD-RET-024` |
| `S1-F11-AT08` | The same lines in another order give the same amounts | 12.5 order | `PRD-POS-004` |
| `S1-F11-AT09` | A bill priced again with its recorded versions gives the same result | 12.5 snapshot | `PRD-POS-014`, `PRD-OFF-009` |
| `S1-F11-AT10` | Selling never reaches costing; the package imports only `@apparel-os/domain`; no clock, randomness, environment or floating-point helper; module check rule 4 fails on a selling import of costing or another package and passes otherwise | 2.1, 2.3 | `PRD-OFF-004`, `PRD-MOD-002`, `PRD-MOD-007` |
| `S1-F11-AT11` | The counter bundle holds no costing entry point (built in T10: build guard, its test, the module list checked in the counter run; acceptance open) | 2.3 | `PRD-OFF-004` |
| `S1-F11-AT12` | Where an open question would change an amount the calculation refuses with `not-decided` naming it: a rate the discount rounding rule takes past the line's value (GC7-5); combined offers without one order, or taking a line below zero on the start value (GC7-9); units left over after complete sets (GC7-11); bill-level tax rounding (GC7-12); a rounded replacement bill (GC7-13); a free unit worth part of a paise (GC7-14); a negative MARGIN needing rounding (GC7-15); a spread remainder above a line's value (GC7-16). A pending case is reported as pending, never as passed; a changed paise or version fails a case | 5.4 to 5.8, 5.10, 7.2, 8; 12.1 | `PRD-ACP-018`, `POL-19.04`, `PRD-POS-023`, `PRD-TAX-005`, `PRD-RET-008`, `PRD-PTW-011`; RR-042 |
| `S1-F11-AT13` | Refusals beyond the cases: several lines at once, no price basis or registration, manual discounts by amount and rate and on an offer line, combined offers on the start value, offers out of place or date, a registration that charges no tax, slabs compared before discounts or with tax | 5.2 to 5.10 | `PRD-POS-003`, `PRD-MOD-015`, `PRD-SEC-017`, `PRD-OFR-002`, `POL-10.02` |

`PRD-ACP-010`'s repeated checkout, printer failure and concurrency belong to the `pos` tests on real PostgreSQL and the browser journeys (12.5), not here.

## 8. Acceptance evidence

- (Recorded in [evidence.md](evidence.md).) A CI run with the Vitest server run (`S1-F11-AT01` to `S1-F11-AT05`) and the Playwright counter run (`S1-F11-AT06`) green in the same run, with the case list and the IDs each case covers (stage 1 exit check 2).
- The bundle check (`S1-F11-AT11`) green, and red on a deliberate costing import.
- The synthetic rule data used, each value labelled synthetic (12.3).
- The independent review of `AGENTS.md` "How we work", its findings and their triage.

## 9. Golden cases, RR-042 and the readings applied

- Thirty-eight case files in `packages/calculations/golden/`, one per row of 12.4 (CG-01 to CG-22). Where a row runs the function more than once (CG-11, CG-13, CG-16, CG-20a, CG-20b) its file holds `runs`. CG-15a to CG-15g and CG-19a to CG-19c point at their bills with `$pricedBill` and `$billReference`, and CG-17 reads its line from CG-06's priced bill with `$billLine`.
- No case of 12.4 depends on GC7-11 (RR-042): CG-06 and CG-17 use three qualifying units, exactly one complete set of buy 2 get 1, so every covered unit is in a complete set; CG-05 and CG-20b use a basket offer, where both readings say every covered line. None is pending.
- The calculation picks no reading of an open question: where one would change an amount it refuses `not-decided` naming it (GC-7 5.10). A case added later whose result depends on GC7-11 carries `"pending": "RR-042 deferred"` and is reported as skipped with that reason.
- It does apply the readings GC-7 states as **Proposed**, each awaiting its named owner: what each offer kind means in amounts (5.5, GC7-9); the two ways a combination rule applies offers, one rule ordering all of a line's offers and the bill-wide order (5.4, GC7-9); a manual price not counting as a markdown (5.3, GC7-9); half-open offer dates (5.3, the offers design); every covered line earning a group discount where both readings of GC7-11 agree (5.6); the taxable value with tax included as the price paid less the rounded components (5.8, GC7-3); no tax and no rate rule where a registration charges none (5.8, GC7-8); an Unknown rate before a discount when no slab fits (5.8, GC7-2); the cash line as the total of cash lines (section 6, the `pos` design); the replacement's amount due in an exchange (7.2, GC7-13); a negative MARGIN rounded to the nearest except an exact half (section 8, GC7-15); the spread charge and the tolerance as inputs (section 8, the `merchandise` · PT design).
- Its technical **Design choices**, with no business owner: what a bill records as considered, applied and used (section 4); rates of 0 to 100%; the tie-break when one list starts the other (5.4); the bounds of a manual discount (5.7); the refusal codes and what is a defect rather than a refusal (5.10); Unknown P RATE when no rounding step makes it whole and a zero MRP refused (3.4, section 8); the golden format, the shared runner and "Round by a rule" (12.1, 12.2, section 11).

## 10. Questions found while building

All are now in GC-7, as **Proposed** or **Design choice** text or as open questions of its section 13, and the code follows them. The new open questions, in [open-items.md](../../open-items.md) as RR-219 (GC7-12), RR-220 (GC7-13), RR-221 (GC7-14), RR-222 (GC7-15) and RR-223 (GC7-16):

| # | Question | Owner | Blocks | GC-7 |
| --- | --- | --- | --- | --- |
| GC7-12 | How tax rounded on the whole bill is carried to each line; until then a bill-level tax rounding rule is refused | CA and Accounts (`POL-10.05`, CA question 25); the product owner for the design | 4 | 3.3, 5.8 |
| GC7-13 | Whether a replacement bill's round-off counts in an exchange | Accounts, CA (Accounts question 22) | 4 | 7.2 |
| GC7-14 | How a free buy-X-get-Y unit worth a fraction of a paise is rounded | Accounts (Accounts question 23) | 4 | 5.5 |
| GC7-15 | Which way a negative MARGIN's half rounds under `PRD-PTW-011` | Product owner | 2 | 8 |
| GC7-16 | Where the paise a spread leaves go when the largest line has less value left | Product owner | 4 | 5.5, 5.6 |

Other points: the server suite imports the package by name, so the package's `turbo.json` builds it before its typecheck, lint and tests, and its own `test` script builds it first, so a run of Vitest in the package never reads a stale `dist` (12.2); the synthetic labels of the package's tests come from its own labelled file, `packages/calculations/test/synthetic.ts`, not from `apps/server/test/fixtures/synthetic.ts` (code-house-rules 11.1; the clarification is RR-224).

## 11. Deferred from this feature

| Requirement or part | Goes to |
| --- | --- |
| Tax-rule tables, migrations and "Read tax rules" (10.3, 10.2) | `S1-F09` |
| Zod schemas for priced bills and working sets (2.1) | The first API that carries them, `S4-F02` |
| The performance test that sets how many overlapping offers the counter must handle (5.4, `PRD-PRF-003`) | `S4-F02`, `S4-F04` |
| Incentives: only the outline of section 9 exists; nothing is built (`PRD-HRM-010`, `POL-13.06`, V-52) | Stage 6 |
| Gift-voucher tax and return credit-note tax (`POL-10.10`, `POL-10.11`) | When the CA answers (V-30, V-72) |
| The return policy snapshot and the working-set version on a bill (section 4) | Recorded by `pos` (`S4-F02`, `S4-F11`) |
