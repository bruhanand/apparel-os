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
