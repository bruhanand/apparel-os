# S1-F10-T03 — Valuation and hand-off to Post

Status: done
Blocked by: T02 (done); S1-F09-T02 (done), S1-F08-T02 (done)
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
- Built on `s1/f10-t03` (10 Oct 2026), awaiting review; design as built in stock-ledger 13.10 and books-and-posting 7.2, 8.1, 9.1:
  - Migration `0055__stock.ledger__valuation` (a customer return's `returns_movement_id`; `stock.rebuild_partial` over the value tables).
  - `stock` · ledger: the pure cost formulas (`domain/valuation.ts`) and the valued items on the working state (`domain/valuing.ts`); Plan reading the cost setting and asking Check postable; Lock creating and locking pools and transit values at step 6; Hold periods; Post inside Write; the Value and Inventory reconciliation reads; Rebuild and compare over pools, layers and transit values; the posting event kinds of books-and-posting 7.2 with their reversal kinds, declared in the production composition; the `stock.no-cost-setting`, `stock.not-sellable` and `stock.posting-refused` codes and messages.
  - `finance` · books: Check postable may be given the document, as Post is.
  - Tests: `domain/valuation.test.ts`, `domain/event-kinds.test.ts`; `apps/server/test/stock-ledger-valuation.int.test.ts`: the story of 11.1 under all four combinations ending at 11.6 and 16.3, with Rebuild and compare and the movement-by-movement reconciliation of 8.3; books-and-posting 15 tests 4, 5, 7 and 8 at the ledger; the refusals `no-cost-setting`, `rule-not-set` (SL-2, SL-17), `not-sellable`, `exceeds-source`, `route-not-allowed`.
  - Test 8 as built: a missing map refuses at Plan (books-and-posting 10 step 1), since a map version never ends retroactively; the refusal under the locks (a period locked since Plan, a changed item) is T07's.
  - Not built: queued posting jobs one at a time per book (10.6), left for the large-posting job of T07; the valued items stage 3 to 5 bring (13.10).
- Closed 11 Oct 2026 on `s1/f10-stock-ledger-2`, reviewed with `/code-review` (Opus); review fixes `eb985e7`, `8d04ab3`, `0382f03`, `e5052f3`; no blocking finding left. Its own commits: `7e3de5f`, `3307ebe`.
- Review fixes for this ticket (S1-F10 review, 11 Oct 2026; stock-ledger 13.10): test 8 under the locks too, an account retired by a same-day version between Plan and the locks, which Post refuses as it should (the as-built claim that a map can only be missing at Plan was wrong; no code change needed); the valued items split by kind under `domain/valuing/`, money carried as `Paise`, one walk for every oldest-first or newest-taken take; a reservation valued at its pool's cost for its approval (product owner, 11 Oct 2026); valuations record their formula, and only a moving-average valuation of the named kinds may name no origin (migration 0056); one `kernel` helper for statements in parts.
