# S1-F10-T04 — Harness and the story under four combinations

Status: blocked
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
