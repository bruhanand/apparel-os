# S1-F10 — Acceptance evidence

> **Not ranked.** Evidence for stage 1 exit check 3 ([stage 1 README](../README.md) 7.1), the concurrency check every stage owes (7.2) and the "Done when" of [S1-F10-T07](tickets/T07-failure-and-concurrency-suites.md). It decides nothing. Acceptance is the product owner's.

Every value in these tests is SYNTHETIC: synthetic Organisations, books, Sites, SKUs, accounts, maps, periods, P RATEs and approval limits, labelled as such and never a default (code-house-rules 11.1). Expected values are written by hand from stock-ledger 11 and books-and-posting 16, never produced by the code under test.

## 1. The runs

Local runs on branch `s1/f10-t07`, 11 Oct 2026, on a development laptop whose Docker was shared with other tracks' test runs. The branch is not pushed, so there is no CI run yet; the CI run is the product owner's to ask for when merging.

| Check | Result |
| --- | --- |
| `pnpm test:integration` | 76 files, 1,108 tests passed (195 s) |
| `pnpm test` | all packages passed (server: 45 files, 353 tests) |
| `pnpm lint`, `pnpm typecheck`, `pnpm check:modules`, `pnpm check:links`, `pnpm format:check` | passed |
| `pnpm test:e2e` | 25 browser journeys passed |

## 2. Stage 1 exit check 3: the story under both formulas and both pool modes

`PRD-LED-014`, `PRD-LED-015`, `PRD-ACP-018`; books-and-posting 15 test 1. Built in `S1-F10-T04`.

- `apps/server/test/stock-harness-story.int.test.ts` runs the four scenario files of `apps/server/test/harness/stock/scenarios/` (moving average or FIFO, book or Site pool), each in its own database copies, through the synthetic document driver and the real `access`, `organisation`, `merchandise`, `configuration`, `numbering`, `exceptions`, `audit`, `stock` ledger and `finance` books.
- After every command: the movement kinds and the journals of books-and-posting 16.2, Rebuild and compare (2.1), the movement-by-movement reconciliation of the inventory account (8.3), the accounts against the ledger (16.5), the raw invariants under the read-only role (11.7, H6), and a replay under the same key that changes nothing. After every step: the pools, layers, value in transit and cost of goods sold of 11.2 to 11.5. At the end: the trial balance of 16.3.
- All four pass.

## 3. Further scenarios

`apps/server/test/stock-harness-further.int.test.ts` (`S1-F10-T06`): G2 to G13 of stock-ledger 11.8 with G10a, and P1 to P5 of books-and-posting 16.4, one file each under `scenarios/further/`, with the same checks after every command. All pass. G10b waits for the rounding rule (RR-124) and is not a stage 1 exit item.

## 4. Concurrency: stock-ledger 11.9

Separate connections; the first transaction is held under its locks, the second sent, and the test waits until PostgreSQL shows it waiting for a lock before letting the first go on (code-house-rules 10.3). `apps/server/test/stock-harness-concurrency.int.test.ts` unless named.

| 11.9 case | Outcome |
| --- | --- |
| Two tills sell the last piece | One written; the other refused under the lock, `stock.piece-not-at-place` |
| Two transfer approvals reserve the same quantity | One written; the other `stock.reservation-overlap` |
| The same request twice; the same key with changed content | One effect and one answer (the second replays); changed content refused `kernel.idempotency-key-reused` and kept in `kernel.idempotency_conflict` |
| Sales of one SKU at two Stores under a book pool | The first to post takes the oldest FIFO layer whatever Store sells it; no deadlock |
| A count freeze while a sale is in flight | The sale is refused `stock.count-freeze-active`; the other order is in `stock-ledger-anchor.int.test.ts` |
| A document changed after approval | Refused `access.approval-version-changed`; nothing commits; the decision stays unused (`stock-harness-failures.int.test.ts`) |
| Two documents on one number series touching the same stock | Both post, items in opposite orders; no deadlock |
| A 10,000-line PT approval while counters sell under a book pool | Section 8 |

## 5. Injected failures (S1-F10 spec 3.6)

| Failure | Where | Outcome |
| --- | --- | --- |
| No valid posting map | Scenario P4; `stock-posting-job.int.test.ts` | Nothing commits; the exception survives; a replay raises no second one; after the map is approved the document posts once. For a queued posting, the decision stays unused and a retry with it posts once |
| A queued posting job that fails | `stock-posting-job.int.test.ts` | Nothing posts; its decision stays unused (`DEC-097`) |
| A period locked while a posting waits | `stock-harness-failures.int.test.ts` | The lock waits for the sale in flight; a sale after it, or one planned before it, is refused and commits nothing |
| The same key with changed content | `stock-harness-concurrency.int.test.ts` | Refused and kept |
| A document changed after approval | `stock-harness-failures.int.test.ts`, `stock-posting-job.int.test.ts` | Refused; renewed approval of the new version posts |

## 6. Books-and-posting 15 tests owed by S1-F10

| Test | Where |
| --- | --- |
| 1 (exit check) | `stock-harness-story.int.test.ts` |
| 4, 5, 7 | `stock-ledger-valuation.int.test.ts` (`S1-F10-T03`) |
| 8 | Scenario P4; `stock-posting-job.int.test.ts` |
| 9 | `stock-harness-failures.int.test.ts` (with a stock posting); `period-close.int.test.ts` (`S1-F09-T03`) |
| 16 | `stock-posting-large.int.test.ts`: one journal for the book, kind and date, 10,000 posting-source rows, 10,000 movements, the decision used once |
| 17 | `stock-posting-job.int.test.ts` |
| 18 | `stock-harness-isolation.int.test.ts` |

## 7. Each approval is used once (`DEC-097`)

`access.approval_use` has one row per decision by its unique key. The tests read it after every refusal and every posting: a refused posting leaves none; a posted one leaves one; a further request with the same decision posts nothing more (`stock-posting-job.int.test.ts`, `stock-harness-failures.int.test.ts`).

## 8. The large posting, measured (RR-189, RR-200)

Recorded, not judged: no target is set here. The binding measurement is the counter in stage 4 (RR-189); SL-11 applies only if that fails. Run with `AOS_STOCK_LARGE_REPORT=1` to print the numbers. The laptop's Docker was shared with other tests, so they may be inflated.

- **Set-up:** a FIFO book pool; 10,000 receipt origins at W1 over 10 SKUs, one unit each, covered by one PT approval at a P RATE of 1.00; counter stock of the same 10 SKUs and one more at S1. The click approves; the posting job posts. Four tills sell the 10 SKUs at S1 and one sells the eleventh, one unit a bill, on their own connections, until the job ends.
- **The job:** 15.6 s from the click to its end. Plan 8.6 s (no stock lock held), Lock 0.25 s, Hold periods and the series 0.02 s, Recheck 1.3 s, Write 4.3 s: about 6 s under the pool and series locks. Before the changes of `S1-F10-T07` (stock-ledger 13.12) it took 94 s, about 48 s under the locks.
- **The bills overlapping the job:** same SKUs median 91 ms, 95th percentile 1,021 ms, slowest 1,403 ms; the other SKU median 90 ms, 95th percentile 199 ms, slowest 1,278 ms. Outside the job the same tills ran at median 60 ms.
- **Timeouts:** 25 of 548 bills reached the runtime role's 1 s lock limit and rolled back. Same-SKU bills wait on the pools; other-SKU bills wait on the book's journal series, which the job holds from step 8 until it commits (GC4-4). Any posting job whose locked part lasts more than 1 s times out the postings of its book that arrive meanwhile.
- **Rebuild and compare** over the whole database at this volume reached the 5 s statement limit (8.7 s); the large test checks the 8.3 reconciliation and the raw invariants instead.

## 9. Isolation

- A seller scoped to one Store sells at it under a book pool and under a Site pool, and afterwards reads no pool, layer or valuation row and no other place's stock; a sale at W1 by that seller is refused and commits nothing (`stock-harness-isolation.int.test.ts`; stock-ledger 14.3 "Pool admission").
- A reader scoped to S1 reads only S1's journal lines, and the trial balance says partial (books-and-posting 15 test 18).
- The second synthetic Organisation's database holds none of the first's movements, journals or pools.

## 10. For the product owner to look at

1. Section 8: whether bills timing out behind a large posting's locked part is acceptable for now, given RR-189 and RR-200, or needs SL-11 or a change to the lock limit, the journal series (GC4-4) or the job's locked work. T07's "Done when" says the job finishes "without blocking the concurrent sales of the test"; it finishes, but some bills during its locked part time out.
2. Pool admission (stock-ledger 14.3): the design's write rule that lets a seller scoped to one Store or unit post against a pool it cannot read, while still not reading it.
3. The posting queue (code-house-rules 12.9): one at a time per book through pg-boss's singleton key and its group.
4. A CI run of the branch, browser journeys included, before acceptance.
