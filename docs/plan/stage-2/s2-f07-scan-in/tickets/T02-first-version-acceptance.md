# S2-F07-T02 — First-version acceptance: journey, concurrency and timings

Status: in-progress
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
- Beyond the ticket: test 19 found that starting an import sent twice under one key was refused the second time (`files-imports.file-already-imported`) instead of replaying its first answer (`PRD-INT-002`; code-house-rules 12.4): the start's duplicate check ran before the key was looked at. Fixed in `files-imports`' `start-import.ts`, first by carrying the duplicate refusal into the command's transaction, under the key; as it now is after review 10, every refusal but access is answered under the key and the duplicate decided under the stored file's lock (below) (imports-and-opening-data section 7 "As built", "Checked three times"); tested at the import's own seam too (`imports-duplicates.int.test.ts`).
- The persona journeys already built cover Booking, Warehouse, a Store's staff and the Owner with a refusal and its recovery each; Operations and Accounts meet theirs in the joined journey (below, review 10), which also walks Stock search by Accounts, refused to Booking (RR-660 updated). What "recovery" means is asked in RR-670.
- Open, for the product owner: RR-670.
- Review 10 changes (code review 10 of stage 2, 23 Oct 2026, branch `s2/review-10-fixes`; `Status:` unchanged): `start-import.ts` answers every refusal but an access refusal under the request's key, after its replay, and decides the duplicate control under the stored file's lock; its read stops at the first refusal and stages nothing then, and where the refusal it stopped at (the handler's, or a duplicate) no longer stands in the transaction, the start is read, staged and run again, once; the refusal order is in imports-and-opening-data 7.2 "As built". Tested by a Start sent again after its batch is published, for a product file and for a PT file, and by an earlier batch withdrawn between the read and the transaction (`imports-duplicates.int.test.ts`, `goods-in-acceptance.int.test.ts`). The concurrency cases now hold the first transaction under its locks until the second is seen waiting (`heldUntilSecondWaits`, `test/support/transactions.ts`): two approvals of one PT, the last piece scanned twice, two booking approvals, and a GRN issued twice at once, under two keys and under one key (new); each fails with its lock taken out. The joined journey meets a server refusal at every step: the Arrival with an arrival time later than now, a count line repeated, Accounts' check of a budget version Booking replaced meanwhile (Accounts then checks the newer one), and Operations' approval with an authenticator code already used (then approved with the new one). The journeys' dates and times come from the server's clock in the Organisation's timezone through `e2e/support/clock.ts`; `signedIn` and the inbox are shared from `e2e/support/journey.ts` by every journey; `serve.ts` makes its individual limits through one helper. The evidence file says how each concurrency case is forced and what refusal each persona meets, with the final runs and timings. Follow-up for the builders: RR-680 (the scan form's "Accepted" message missed once in the PT approval journey, which passed run again).
- Built and reviewed 23 Oct 2026 (commits 65d34063, ed794c7d, merged in ed97a6b3; review 10 fixes f19f9381, db84c2b9, merged in 79bb0ee7); every check passes locally and 49 browser journeys pass (one screen flake, RR-680). Its "Done when" waits on two steps of the product owner's: the CI run after a push, and the review of [the evidence file](../evidence.md).
