# S1-F10-T04 — Harness and the story under four combinations

Status: done
Blocked by: T03; S1-F02-T03, S1-F03-T02, S1-F05-T01, S1-F08-T01, S1-F08-T02, S1-F09-T03 (scenario P5: a locked period, then a reopening)
Feature: [S1-F10 Stock ledger with balanced posting](../spec.md)

## Build

- The synthetic document driver, its test-only schema and approvals, the fixtures and one scenario file per scenario and combination ([spec](../spec.md) 3.2 to 3.4; stock-ledger 15.1 to 15.4). The fixtures go through the real modules, with no stand-ins, so both parts are accepted through them ([spec](../spec.md) 3.3).
- The story runs under moving average or FIFO with a book or Site pool, each in its own cloned template database ([spec](../spec.md) 3.6).

## Expected outputs

Test-only harness under `apps/server/test/`; scenario files; fixtures; matrix runner; tests

## Done when

The harness calls only public interfaces; every value says SYNTHETIC; expected values are written by hand from stock-ledger 11 and books-and-posting 16; stock-ledger 11.2 to 11.6 pass in all four combinations; books-and-posting 15 test 1 (the stage 1 exit check, moved here from T03) passes

## Notes

- Absorbs S1-F10-T05 (four-combination matrix) on 6 Oct 2026 (product owner).
- Blocked by S1-F08-T02 because the scenarios test exceptions, such as P4, a step with no approved map (books-and-posting 16.4).
- Built on `s1/f10-t04` (10 Oct 2026), awaiting review; design as built in stock-ledger 13.10 and 15.6 and code-house-rules 11.4:
  - The driver, its checks, runner and four scenario files under `apps/server/test/harness/stock/`; the test-only set `apps/server/test/migrations/` (schema `test_stock_harness`); the read-only role `syn_verify`; the matrix `apps/server/test/stock-harness-story.int.test.ts`, each combination in its own database copies. The story of 11.1 passes step by step in all four combinations, with books-and-posting 15 test 1 (16.2 journals, 16.3 trial balance) and the checks of 11.7 and 16.5 after every command, a replay under the same key included.
  - The T03 story tests moved onto the harness: `stock-ledger-valuation.int.test.ts` keeps its other tests and shares the harness's checks.
  - The place read wired to `organisation` (`organisationPlaces`, with `locationPlace`), in the production composition too: the organisation half of RR-436.
  - A T03 gap closed: under moving average an emptying outflow of several receipt origins needs no rounding; one valuation per item (migration `0067__stock.ledger__item_valuation`); a customer return valued from the sale line (7.5).
  - A T03 defect fixed: units back into a FIFO pool make one layer per source layer (7.5, 7.8), not one per piece.
  - Not built: a mapping's verification in the fixtures (needs an evidence file through the route); P5 and the other 16.4 scenarios (T06, T07).
- Closed 11 Oct 2026 on `s1/f10-stock-ledger-2`, reviewed with `/code-review` (Opus); review fixes `8d04ab3`, `0520fed`, `e5052f3`; no blocking finding left. Its own commits: `16b2ff8`, `08ebdd5`, `49e5bc7`.
- Review fixes for this ticket: the fixture of spec 3.3 added, policy 9 recorded Signed and its values validated by a different person, as labelled synthetic status, through `configuration`'s real interface (stock-ledger 15.6); transfers and supplier returns approved on their pool's cost, written by hand into the scenario files (`approvedPaise`). RR-436 closed. Still not built: a mapping's verification in the fixtures.
