# S2-F01-T03 — Record and approve a booking

Status: ready-for-agent
Blocked by: S2-F01-T01, S2-F01-T02
Feature: [Stage 2 first version](../../spec.md)

## Build

- A booking Draft in `booking` ([goods-in.md](../../../../design/goods-in/goods-in.md) 3.1): the booking document uploaded as stored files (`DEC-136`); header of supplier (linked to the brand on the booking's date, `PRD-MER-021`), brand, season (season vocabulary), destination Site and delivery window; lines of style code and quantity, with colour, size, line date, indicative cost and MRP (`DEC-130`); the size-colour grid; totals (`PRD-BKG-003`).
- The brand's Agreement terms shown read-only (3.2, `DEC-129`).
- Submit, with at least one document attached; an approval request bound to that version. Approve or reject with a reason by a different person whose booking limit covers the booking's value at cost (3.4; domain-model section 5).
- Approval, in one transaction: open-to-buy checked and reserved (3.3), the Agreement version fixed (`DEC-132`), the number given from the booking series (synthetic settings until RR-449), the booking Approved, audit and outbox. Rejection returns it to Draft.
- Refusals named: no Agreement in force, open-to-buy short or missing, no number series, supplier not linked to the brand, no document. Policy gate: policies 5 and 1 (goods-in 10.5).
- Screens Booking › Bookings and the booking form; the approval in My work.

## Expected outputs

`booking` records and migrations; routes, schemas, OpenAPI; screens; integration tests; a browser journey.

## Done when

Design test 4 (approval, reservation, fixed Agreement version, refusals) passes; the Booking journey records a booking with the grid and has it approved by another person; every check passes.
