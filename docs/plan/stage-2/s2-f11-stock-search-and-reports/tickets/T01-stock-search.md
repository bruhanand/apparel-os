# S2-F11-T01 — Stock search

Status: done
Blocked by: S2-F07-T01
Feature: [Stage 2 first version](../../spec.md)

## Build

- Search by style code or product name, brand, size, barcode, location and condition ([goods-in.md](../../../../design/goods-in/goods-in.md) 9.2; `PRD-STK-006`); a repeated barcode shows each product.
- Each result a product at a place with physical, available (to sell at a Store, to move at a warehouse), waiting and held quantities, held by kind (`PRD-STK-001`); the same product at the other Sites the reader may see; goods before PT approval by their counted style code, colour and size.
- Read models through the read-model gateway with their as-of time; cost only with the cost permission; XLSX export (9.1).
- From a result, report damage on a product at its location, the screen path of the damage route that `S2-F08-T01` left to stock search (goods-in 8.1, 8.5 "Screens"; `PRD-DMG-004`).

## Expected outputs

Read models; routes, schemas, OpenAPI; the search screen; integration tests.

## Done when

Design test 20 passes; on the synthetic journey's data the four quantities equal the ledger's; every check passes.

## Notes

- Built (23 Oct 2026, branch `s2/f11-t01-stock-search`; `Status:` unchanged): the kernel's read-model gateway (module-map 4.1 "As built"); the ledger's read models of stock search, the positions, the same products at other units and the cost of balances, with their arithmetic (stock-ledger 13.22); the catalogue's product search and product facts and `organisation`'s places, as read models (structure-and-masters 3.8, 4.7 "As built"); the `reports` module with the search route and its export (goods-in 9.4); migrations `0113__merchandise.catalogue__product_search.sql` and `0114__stock.ledger__counted_style_search.sql` (trigram indexes), numbered after the integration branch's 0112 since the runner refuses a gap; the Stock › Stock search screen with Report damage on a product's result; the integration tests `apps/server/test/stock-search.int.test.ts` (design test 20, and the four quantities against the ledger's own reads), the unit tests of the gateway and of the quantities, and the stock search step at the end of the browser journey `apps/web/e2e/pt-approval.spec.ts`. Design written in goods-in 9.4 (and 8.5, 11), stock-ledger 13.22, module-map 4.1 and section 5 (`reports`), and structure-and-masters 3.8 and 4.7.
- Beyond the ticket: the read-model gateway itself, which no earlier ticket built, and the read models of the catalogue and `organisation` the search reads names through; a "Stock" sidebar section, with Stock search in the menu of every persona whose ui-blueprint menu has Stock; `reports`' own text catalogue for the export's words (code-house-rules 12.13); `containsPattern`, the kernel's helper for a text searched as a part; the browser journeys' world's maker granted create on damage reports, for the damage path from a result.
- Open, for the product owner: RR-640 (no product name to search), RR-641 (which cost the search shows), RR-642 (the as-built choices).
- Review 8 changes (23 Oct 2026, branch `s2/review-8-fixes`; `Status:` unchanged): all four quantities compared with the ledger's own reads; the records behind a result, its GRNs, PTs and movements at the location, through the ledger's `stock.records` (route `GET /api/reports/stock-records`, 100 a page); the export listing `kernel.stale-version` and holding every view grant at step 0 with the cost's, through one export step shared with the stock report; cost cells with no ₹ under "Cost (₹)", Unknown a blank cell read as unknown; one constant for the text cap; Unknown sent as `{ kind: 'unknown' }`; one source for the conditions and hold kinds, the page limit and the business-date and refusal handling; the search's own messages; the gateway in a module of its own; each result keyed by its whole key, its legal entity included, and the same products elsewhere once; a Store's staff (P-STM) journey searching at their Store. RR-660 and RR-661 added.
- Done 23 Oct 2026: reviewed (code review 8) with its fixes in; every check and 48 browser journeys pass on the integration branch. Commits a4b5a2b5, bc23af91, 14f460a6, d450e8d1, merged in 0ce22f77; review 8 fixes b818bb2c, a619700c, merged in ff2f3827.
