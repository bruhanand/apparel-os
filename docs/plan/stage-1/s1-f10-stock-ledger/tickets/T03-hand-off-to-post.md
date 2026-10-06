# S1-F10-T03 — Hand-off to Post

Status: blocked
Blocked by: T02; S1-F09 (books, maps, periods)
Feature: [S1-F10 Stock ledger with balanced posting](../spec.md)

## Build

Valued movements hand their values to `finance` Post in the same transaction ([books-and-posting.md](../../../../design/finance/books-and-posting.md) 8 and 10); a missing map raises an exception in its own transaction (SL-23 Outcome A, `DEC-105`); queued posting jobs one at a time per book (10.6)

## Expected outputs

The posting hand-off; tests

## Done when

books-and-posting 15 tests 1, 4, 5, 7, 8 pass; posting-source rows reconcile the inventory account with the ledger movement by movement (8.3)
