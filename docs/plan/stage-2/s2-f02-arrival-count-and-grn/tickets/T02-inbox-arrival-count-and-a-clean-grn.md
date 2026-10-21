# S2-F02-T02 — Receive Goods inbox, Arrival, count and a clean GRN

Status: blocked
Blocked by: S2-F02-T01
Feature: [Stage 2 first version](../../spec.md)

## Build

- The Receive Goods inbox per Site, Pending and History ([goods-in.md](../../../../design/goods-in/goods-in.md) 4.1; `PRD-REC-001`, `PRD-REC-002`); receiving refused at a unit without approved receiving readiness or with an unverified mapping (`PRD-LIF-001`, `POL-10.08`).
- The Arrival (4.2): Site and unit, supplier and brand, invoices first (at least one, each with number, date and file, `DEC-133`; a possible duplicate flagged), transporter, lorry receipt, cartons, optional vehicle and e-way bill numbers, photos, arrival time.
- The count (4.3): lines of style code, colour as the invoice names it (`DEC-138`), size from the size list, a product hint, invoice and counted quantities, batch and expiry where a product's profile requires them; saved as it goes and resumable; who counted and who entered it.
- Issuing a GRN whose lines match their invoice quantities (4.5): no approval; the number from the GRN series (synthetic settings until RR-449); in one transaction, receipt counts into the unit's receiving location in good condition, cost Unknown and not accepted, with the owner from the brand's Agreement in force on the arrival date; audit and outbox. The printed GRN carries no value.
- Policy gate: the unit's receiving activity, policies 4 and 10 (goods-in 10.5). Screens of goods-in section 11.

## Expected outputs

`receiving` records and migrations; routes, schemas, OpenAPI; screens; integration tests; the receiver's browser journey.

## Done when

Design tests 3, 18 and 19 pass, with the custody of a clean GRN equal to its count (part of test 1); a Store-scoped reader sees only its Store's receipts (part of test 20); every check passes.

## Notes

- Built 21 Oct 2026 on branch `s2/f02-t02-inbox-arrival-and-grn`, awaiting review. The design is written back in goods-in 4.8 (as built), 10.5 (as built), section 13 (GI-3, GI-4), stock-ledger 13.2 (as built) and structure-and-masters 5.5.
- **`receiving`** (tier 4; migration `receiving__arrivals_counts_and_grns`, number 0088): the Arrival, its invoices, photos and changes, the count's entries, the GRN and its lines, all append-only and scoped by place, legal entity and brand; routes for the inbox of a Site, an Arrival's read, recording an Arrival, an invoice, photos, saving and removing a count line, and issuing the GRN; Receive Goods › Inbox in the web app; `receiving.grn-issued`.
- **The gate**: two operations, `receiving.receive-goods` (policy 4) and `receiving.receive-goods-statutory` (policy 10), with the capability `receiving.goods-in` and the receiving activity; the unit's mapping verification beside them (`POL-10.08`). Since the receiving activity now names real operations, the readiness test and journey sign policy 10 and give someone at the unit the receiving permissions (`site-readiness.int.test.ts`, `serve.ts`).
- **Tests**: `apps/server/test/receiving.int.test.ts` (tests 3, 18, 19; the custody of a clean GRN equal to its count; the Store-scoped reader of test 20), `apps/server/src/modules/receiving/domain/{lines,owner}.test.ts`, and the receiver's journey `apps/web/e2e/receive-goods.spec.ts`, in an Organisation of its own in `serve.ts`.
- **Beyond the ticket**: (1) `merchandise` · parties exports `brandSupplierLinkedOn` (is a supplier linked to a brand on a date) and its `termsInForce` read, which the Arrival and the GRN need; (2) the stock ledger takes its callers from the composition root under `STOCK_CALLERS`, with `receiving`'s as the first, and its registry test changes with it; (3) a GRN of goods of a product not yet set up is refused to a person without every brand in scope, before anything posts, since the ledger's rows of those goods are of Unknown brand and the write would otherwise fail as a defect (RR-555).
- **Not built here**: the findings at the count, so a line whose counted quantity differs from its invoice quantity stops the GRN (`receiving.line-differs-from-invoice`) until `S2-F02-T03`; receiving against a booking (`S2-F02-T04`); naming a product or a batch on a line from the screen (the API takes both); History stays empty until the PT and the scan-in exist.
- **Open, for the product owner**: RR-553 (which attribute is the size list, GI-3), RR-554 (the owner when ownership passes at receipt and acceptance, GI-4), RR-555 (goods of Unknown brand and brand-limited people), RR-556 (policies 4 and 10 report no values, so receiving stays unavailable everywhere, `dev` included, until they do).
- **Migration number**: built as 0087, the next free number after `0086__booking__open_to_buy_budgets.sql`, and renumbered `0088__receiving__arrivals_counts_and_grns.sql` when the integration tip brought `0087__merchandise.parties__agreement_terms_without_default_model.sql` (S2-F01-T01); the merger renumbers it again if another branch takes 0088.
