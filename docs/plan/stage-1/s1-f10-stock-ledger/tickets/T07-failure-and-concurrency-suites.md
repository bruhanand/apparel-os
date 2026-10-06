# S1-F10-T07 — Failure, concurrency, large posting and acceptance

Status: blocked
Blocked by: T06; S1-F08-T02; S1-F09-T03 (books-and-posting test 9: the lock waits for postings in flight)
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
