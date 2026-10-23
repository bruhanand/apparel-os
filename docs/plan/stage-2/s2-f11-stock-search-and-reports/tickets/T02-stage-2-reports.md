# S2-F11-T02 — The stage 2 reports

Status: in-progress
Blocked by: S2-F01-T04, S2-F02-T04, S2-F07-T01
Feature: [Stage 2 first version](../../spec.md)

## Build

- Booking status, receipt problems, supplier fill rate and timeliness, and stock by product, size, location, condition and owner, with the definitions of [goods-in.md](../../../../design/goods-in/goods-in.md) 9.3 (`PRD-BKG-005`, `PRD-BKG-011`, `PRD-PRO-001`, `PRD-EXC-009`).
- Filters, drill-down to the records, as-of time, Unknown values marked, cost only with the permission, XLSX export (9.1; `PRD-EXC-010`, `PRD-EXC-011`).

## Expected outputs

Read models; routes, schemas, OpenAPI; report screens; integration tests on a synthetic data set.

## Done when

Each report's figures equal hand-worked expected values on a labelled synthetic data set; a scoped reader sees only permitted rows; every check passes.

## Notes

- Built (23 Oct 2026, branch `s2/f11-t02-reports`, on `s2/f11-t01-stock-search` merged in for its read-model gateway, `reports` module and XLSX writer; `Status:` unchanged): the four reports of goods-in 9.3 under a Reports section, each read through the read-model gateway, with filters, drill-down to the booking and the GRN's Arrival, the as-of time, Unknown values marked, cost only with the cost field class and XLSX export (goods-in 9.5); the read models `booking.statuses`, `receiving.receipt-problems`, `receiving.report-lines`, `receiving.grn-names`, `stock.damage-report-states`, `stock.holdings` (stock-ledger 13.23), `merchandise.origin-mrp`, `merchandise.value-names`, `merchandise.party-names` and legal entities in `organisation.places`; the migration `merchandise.pt__mrp_of_origins` (the narrowly authorised MRP read and an index), numbered after the last on this branch since the runner refuses a gap; the integration test `apps/server/test/stage-2-reports.int.test.ts` on a labelled SYNTHETIC data set with hand-worked figures, the unit test of the supplier metrics, and the journey `apps/web/e2e/stage-2-reports.spec.ts`. Design written in goods-in 9.3 (the overdue row brought to RR-576) and 9.5, stock-ledger 13.23, module-map 4.1, and structure-and-masters 3.8, 4.7 and 5.5.
- Beyond the ticket: the booking lifecycle's delivered, cancelled and extension reads batched for many bookings at once, the one-booking reads their case; the shared step that records an export's access to cost, which stock search's export now uses too; `SearchRefused` renamed `ReadRefused`, since the reports share it; the PT world of the tests taking further TEST-ONLY checks and receiving against a booking at a time given, and the booking gate opened for the policies given; the journeys' server's booking fixture made a function, with a second booking and its own pair of fixture users for the reports journey.
- Open, for the product owner: RR-650 (the supplier metrics' readings), RR-651 (the reports as built), RR-652 (the MRP value and who sees it).
- Review 9 changes (23 Oct 2026, branch `s2/review-8-fixes`; `Status:` unchanged): the MRP read under the reader's actor, migration 0115 now `merchandise.pt__origin_index` with no function; the supplier report's count damage reports read as the reader may see them, a hidden one making the damage rate Unknown; journeys opening every report by a persona allowed to use it (P-BKG and P-STM); amounts with no ₹ in cells, Unknown and rates with no measure blank cells read as unknown; drill-downs to the records of each figure (the stock report's to its PTs and movements, a damage report from its number, the supplier report's figures to their own bookings and GRNs); the line's own delivery date shown; the indicative cost left out; the tests of a place-scoped reader, wrong and unidentified goods, on-time Unknown when GRNs are hidden, the supplier drill-down and the as-of times; one `Reading`, one export step, one paging rule with a cap on records read, one owner map, one facts builder, one in-force state list, unexported types removed, the reports' own messages, the Arrival drill named from `organisation.places`, and the index of 0116. RR-650 extended; RR-652 narrowed; RR-660 and RR-661 added.
