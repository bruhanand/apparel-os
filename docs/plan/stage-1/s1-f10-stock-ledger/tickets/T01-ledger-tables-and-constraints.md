# S1-F10-T01 — Stock tables, constraints and row security

Status: blocked
Blocked by: S1-F01-T11 (`access.row_visible`)
Feature: [S1-F10 Stock ledger with balanced posting](../spec.md)

## Build

The `stock` schema of [stock-ledger.md](../../../../design/stock/stock-ledger.md) section 14: unit anchors, movements with their legs and pieces, balances, receipt origins and their state, pieces, coverage, acceptance, holds, reservations, cost pools and layers, valuations and transit values, with their constraints, append-only guards, locks, indexes and row-level security (14.1 to 14.3; house rules 3 to 7). With the product owner's decisions of 6 Oct 2026:

- **Open-pool key.** One open pool per book, SKU and Site, as a partial unique key with nulls not distinct, so an empty Site counts as equal and a book has at most one open whole-book pool per SKU (14.2, `cost_pool`).
- **Row-level security** through `access.row_visible`, the one policy of house rules 6.2 on every table (RR-228; stock-ledger SL-25):
  - (b) a row at a business unit that belongs to no Store carries no Store and is matched by its Site and unit;
  - (c) a whole-book pool carries no Site, so only all-members place scope sees its rows;
  - (e) a Site pool's rows (`cost_pool`, `cost_layer`, the pool rows of `valuation` and `valuation_layer`) are seen only by a reader whose place scope covers the pool's whole Site, by a selected Site or wider;
  - (d) a header row that can cover several brands (`movement`, `hold`, `hold_scope`, `reservation`) records its brand set as an array column, and a brand-limited reader sees it only with access to every brand in the set, through the every-brand `access` function of code-house-rules 6.2; `unit_anchor` carries no brand and is matched by place only (`DEC-117`);
  - cost and value columns still need the cost field permission: they are masked, not filtered by the policy (access-and-approvals 6).
- **"Has this book held stock?"** `stock` implements the contract `finance` defines for the books-and-posting 2.2 refusal of a cost-formula or pool-mode change, answering from its own rows of the book (module-map section 3, rule 6; product owner, 6 Oct 2026, DEC-116). It is built to the contract's declared shape in module-map section 3, like the stand-ins in Notes, and wired to `finance` when S1-F09-T01 defines it.

## Expected outputs

First `stock` migration with its `tables.json` entries; the "has this book held stock?" implementation; integration tests

## Done when

Constraints and guards refuse what section 14 forbids, including a second open pool for the same book, SKU and empty Site; row-level security shows a scoped reader only its rows, under (b) to (e) above; the runtime role cannot change a posted row; "has this book held stock?" answers yes for a synthetic book with stock rows and no for one without

## Notes

- Stock-ledger 13 to 15 (RR-012), the lock-order refinements (RR-227) and RR-228 (b), (c) and (e), with (d) amended to the brand-set rule, were approved by the product owner on 6 Oct 2026, so they no longer block this ticket. RR-228 (a), one command writing in two scopes by an actor scoped to one, stays open until stage 3; until then the harness acts with synthetic actors whose scope covers both places.
- Stock-ledger 14.1, 14.3, SL-24 and SL-25 and house rules 6.2 and 8.2 are brought in line with these decisions before this ticket's code ([stage 1 spec](../../spec.md), build order step 1).
- Not blocked by S1-F02 or S1-F03: development tests may use stand-ins built to the declared `organisation` and `merchandise` read contracts (product owner, 6 Oct 2026). The place-scope row-level security test runs once S1-F02-T03 lands.
- Built (S1-F10-T01): migration `0025__access__row_visible_brand_set` (the every-brand function) and `0026__stock.ledger__tables` (the 24 tables of stock-ledger 14.2 with their keys, checks, append-only guards, row locks' grants, indexes and one policy each, and `stock.book_has_held_stock`); their `tables.json` entries; the Drizzle definitions; the `stock.*` record types in the permission registry; the unit `stock/ledger` with `BookStockHistory`; tests in `apps/server/test/stock-ledger-tables.int.test.ts` and the register test. Design details settled, written into the designs: the every-brand function's signature and set semantics (null element Unknown, empty set no brand, the unit anchor passing the empty set; code-house-rules 6.2); the record types each table's policy names, view only (stock-ledger 14.3); the shape of "has this book held stock?" and its `SECURITY DEFINER` answer (stock-ledger 13.7, books-and-posting 2.2); `book_id` on `movement_leg` (14.2); the names of release and reservation events and `reservation_event.reservation_kind` (14.2); `none` as a stated import kind and event kind (14.2); copies of an origin's count date and quantity held by composite foreign keys, not triggers, because a trigger would be filtered by row-level security (14.2). For S1-F10-T02: `hold_release` names one claim (14.2), so ending a count freeze needs claims for it to release, or a design change. No stand-ins were needed: the stock tables keep other modules' identifiers without foreign keys, so the tests use synthetic UUIDs.
