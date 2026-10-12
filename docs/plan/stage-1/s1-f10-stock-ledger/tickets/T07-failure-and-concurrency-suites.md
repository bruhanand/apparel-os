# S1-F10-T07 — Failure, concurrency, large posting and acceptance

Status: done
Blocked by: T06 (on `s1/f10-stock-ledger-2`); S1-F08-T02 (done); S1-F09-T03 (done)
Feature: [S1-F10 Stock ledger with balanced posting](../spec.md)

## Build

- The injected failures and the concurrency cases of [spec](../spec.md) 3.6 and stock-ledger 11.9, on separate connections; isolation by scope and Organisation.
- A large posting runs as a job while sales go on (stock-ledger 10.6); measure it on synthetic data. An early signal only: the binding measurement is the counter in stage 4 (RR-189).
- Run every acceptance test; gather the evidence for stage 1 exit check 3 ([stage-1 README](../../README.md)); update [STATUS.md](../../../../STATUS.md) and any design text the code proved wrong.

## Expected outputs

Tests; job and measurement; evidence bundle

## Done when

books-and-posting 15 tests 8, 9, 16, 17 and 18 pass; stock-ledger 11.9 passes; each approval is used once (`DEC-097`); the large-posting job finishes without blocking the concurrent sales of the test and the timing is recorded (RR-189, RR-200); stage 1 exit check 3 is evidenced; the product owner accepts

## Notes

- Absorbs S1-F10-T08 (large-posting job) and S1-F10-T09 (acceptance evidence) on 6 Oct 2026 (product owner).
- Built on `s1/f10-t07` (11 Oct 2026), awaiting review and the product owner's acceptance; design as built in stock-ledger 13.12 and 14.3 ("Pool admission"), code-house-rules 5.2, 6.2 and 12.9, access-and-approvals 9.8 and books-and-posting 15. Evidence: [evidence.md](../evidence.md).
  - Tests: `apps/server/test/stock-harness-concurrency.int.test.ts` (the cases of stock-ledger 11.9), `stock-harness-failures.int.test.ts` (spec 3.6 failures; books-and-posting 15 test 9), `stock-harness-isolation.int.test.ts` (a Store-scoped seller; test 18; the second Organisation), `stock-posting-job.int.test.ts` (the click and the queued job; tests 8 and 17; one at a time per book) and `stock-posting-large.int.test.ts` (test 16 and the measurement, printed with `AOS_STOCK_LARGE_REPORT=1`); a case in `job-queue.int.test.ts` for the posting queue.
  - The T03 defect fixed: a seller scoped to one Store or unit could not lock or write the pool its sale takes value from (SL-25 (c), (e)). The design's write rule: pool admission, migration `0068__stock.ledger__pool_admission` with `stock.pool_admitted` and the `SECURITY DEFINER` `stock.pool_row_admitted` (code-house-rules 5.2, 6.2). The seller still reads no pool, valuation or other place's stock.
  - Queued posting jobs (left by T03): migration `0069__kernel__posting_queue` (`kernel.posting-delivery`, pg-boss `singleton`); a consumer may declare `postingBook`, and the worker sends its deliveries there with the book as singleton key and group and fetches one group at a time. Only the harness has a posting consumer (test-only, `test-syn-stock-harness.post-document`, event `test-syn-stock-harness.post-requested`); production registers no new consumer or job kind, so `SYNTHETIC-worker-settings.local.json` is unchanged. `jobIdentities` takes the test's declarations, as Access does. Harness: the click, the request to post (test-only migration `0003__test-stock-harness__post_request`), retries, a document changed after approval, `ScenarioRun` for commands without a file, a second Store S2, and a sender, key and hold point per step.
  - Large documents, found by the 10,000-line test: a multi-row insert of 10,000 rows overflowed the query builder, so the ledger's and Post's inserts go in parts of at most 1,000 rows; changed origin states are one update per 1,000; `finance` Check postable reads what a request's items share once and the posted rows in one read; Hold periods asks each period once; a quadratic grouping in Post removed. The job went from 94 s to 15.6 s, about 6 s of it under the locks. These change no behaviour.
  - Measured (SYNTHETIC; local container on a shared laptop, so possibly inflated): see stock-ledger 13.12. 25 of 548 counter bills overlapping the job reached the 1 s lock limit (RR-200), including bills of a SKU the job did not touch, which wait on the book's journal series (GC4-4). Recorded, not judged (RR-189).
  - Not met as written in "Done when": "the large-posting job finishes without blocking the concurrent sales of the test". It finishes, and bills outside its locked part are not delayed, but bills during its locked part wait and some time out. For the product owner.
  - Not done here: a CI run (the branch is not pushed); Rebuild and compare at 10,000 origins passes the 5 s statement limit, so the large test checks the 8.3 reconciliation and the raw invariants instead; how a real document shows a failed posting job is its own module's (stages 2 to 4).
- Closed 11 Oct 2026 on `s1/f10-stock-ledger-2`, reviewed with `/code-review` (Opus); review fixes `eb985e7`, `0382f03`, `e5052f3`; no blocking finding left. Its own commits: `f039ddc`, `27dba30`, `22c042b`, `325c028`, `30faa75`, `5a82d48`.
- Accepted by the product owner, 11 Oct 2026, on the measured timeouts: 25 of 548 bills reached the 1 s lock limit while the 10,000-line posting held its locks for about 6 s, on a shared laptop. "Done when" on blocking is accepted on that basis; the fix is decided before live counter sales in stage 4, measured on the real counter (RR-189, RR-504). Pool admission approved as designed. Open items from this ticket: RR-512, RR-513, RR-514.
