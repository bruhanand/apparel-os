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

## Notes

- Built (23 Oct 2026, branch `s2/f07-t02-acceptance`; `Status:` unchanged): the joined browser journey of goods-in 12 test 22, `apps/web/e2e/goods-in-journey.spec.ts`, six personas from the booking to stock on sale, each refused once with the reason on screen and recovering, two of them after a browser restart, on the PT world of the journeys' server with people, files and a reject reason of its own (`apps/server/test/browser/serve.ts`); test 19 across every write of the flow, from the budget to the scan-in, each sent twice under its key, `apps/server/test/goods-in-acceptance.int.test.ts`; the 10,000-line timings measured; the evidence file [evidence.md](../evidence.md). Goods-in 12 points to the evidence.
- Beyond the ticket: test 19 found that starting an import sent twice under one key was refused the second time (`files-imports.file-already-imported`) instead of replaying its first answer (`PRD-INT-002`; code-house-rules 12.4): the start's duplicate check ran before the key was looked at. Fixed in `files-imports`' `start-import.ts`: the check before the transaction only spares a repeated file the staging and carries its refusal into the command's transaction, under the key (imports-and-opening-data section 7 "As built", "Checked three times").
- The persona journeys already built cover Booking, Warehouse, a Store's staff, Operations and the Owner with a refusal and its recovery each; the joined journey adds Accounts' (approving a budget they checked) and Stock search by Accounts, refused to Booking (RR-660 updated). What "recovery" means is asked in RR-670.
- Open, for the product owner: RR-670.
