# S1-F10-T03 — Valuation and hand-off to Post

Status: blocked
Blocked by: T02 (done); S1-F09-T02 (books, maps, open periods and Post), S1-F08-T02 (an exception raised after a rollback)
Feature: [S1-F10 Stock ledger with balanced posting](../spec.md)

## Build

Part 2, "Stock valuation and accounting":

- **Valuation.** Cost pools, FIFO layers and moving average; every outflow valued in posting order under the pool locks (stock-ledger 7.1 to 7.10; 13.1, Recheck and value). A new cost pool takes its formula, pool mode and cost-setting version from the book's cost setting read at Plan (product owner, 6 Oct 2026). A missing pool or transit value row is created empty at lock step 6 (RR-227).
- **Valued items.** The valued movement items the story of 11.1 needs, with their refusals (13.4, 13.8): cost established, dispatch and arrival between pools, sale issue, customer return, cost adjustment and the supplier-return legs; the Value and Inventory reconciliation reads; Rebuild and compare extended to pools and layers (13.6, 2.1).
- **Hand-off to Post.** Valued movements hand their values to `finance` Post in the same transaction ([books-and-posting.md](../../../../design/finance/books-and-posting.md) 8 and 10); a missing map raises an exception in its own transaction (SL-23 Outcome A, `DEC-105`); queued posting jobs one at a time per book (10.6).

## Expected outputs

Valuation in `stock` · ledger; the posting hand-off; tests

## Done when

Each valued operation posts or refuses as section 13 says; a new pool carries the formula, pool mode and cost-setting version read at Plan; rebuild-and-compare (2.1) matches the stored balances, pools and layers; books-and-posting 15 tests 4, 5, 7, 8 pass (test 1 needs the harness and is in T04); posting-source rows reconcile the inventory account with the ledger movement by movement (8.3)

## Notes

- Holds the valued parts of the earlier T02, moved here on 6 Oct 2026 (product owner). Part 2 is accepted only through the real modules (T04).
