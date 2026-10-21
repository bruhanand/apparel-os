# S2-F07-T02 — First-version acceptance: journey, concurrency and timings

Status: blocked
Blocked by: S2-F01-T04, S2-F02-T04, S2-F02-T05, S2-F06-T01, S2-F07-T01, S2-F09-T01, S2-F11-T01, S2-F11-T02
Feature: [Stage 2 first version](../../spec.md)

## Build

- The joined browser journey of design test 22 ([goods-in.md](../../../../design/goods-in/goods-in.md) section 12): booking, approval, Arrival, count, GRN, PT upload, PT approval and scan-in, ending with the pieces sellable in stock search, with one refusal at each step; persona journeys for Booking, Warehouse, a Store's staff, Accounts and Operations, with recovery (roadmap 2.2).
- The concurrency cases gathered: two approvals of one PT, a recount racing a PT approval, the last piece scanned twice, a GRN issued twice (tests 12, 14, 19).
- The 10,000-line timings measured and recorded: the file check within one minute and the approval through the job (test 21; `PRD-PRF-001`).
- An evidence file in this feature folder: CI run, tests, timings, and which stage 2 exit checks the first version proves and which wait (goods-in section 12).

## Expected outputs

Browser journeys; the evidence file.

## Done when

The journeys and suites pass in CI; the evidence file is reviewed by the product owner.
