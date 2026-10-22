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

## Notes

- Built (22 Oct 2026, branch `s2/f01-t03-record-and-approve-a-booking`): migration `0094__booking__bookings.sql` (a provisional number; the merger numbers it gap-free) with eight `tables.json` entries; record type `booking.booking` (view, create, edit, approve; place and brand); action type `booking.booking.approve` on the value at cost; number kind `booking.booking`; routes `listBookings`, `readBooking`, `recordBooking`, `saveBookingDraft`, `attachBookingDocuments`, `submitBooking`, OpenAPI regenerated; the decision effect of the approval; the event `booking.booking-approved`; remaining open-to-buy now less the reservations. Screens Booking › Bookings and the booking form; the booking's facts on the approval panel in My work. Tests: `apps/server/test/bookings.int.test.ts`, `apps/web/src/booking/lines.test.ts`, the journey `apps/web/e2e/booking.spec.ts`. Design written into goods-in 3.3 "As built", 3.9 (new), 10.4, 10.5 and 11; structure-and-masters 5.5; module-map section 5.
- Design choices, written into goods-in 3.9: the destination is one Site, with no Store (several Stores may share a Site, `PRD-ORG-021`); brand and destination are fixed for a booking's life; the size is kept as written text, not a value of the size list; the supplier link is checked when a Draft is saved and on the approval's date; a version rejected may be submitted again unchanged; the preparers of a version are everyone who changed the booking since its last approval; Agreement margins are not shown on a booking; technical caps `BOOKING_CAPS` and a 512 KiB body for a Draft.
- Beyond the ticket: `termsOfVersion` in `merchandise` · parties (the terms of the version a booking fixed); the Agreement's terms view of the web app shared as `AgreementTermsList`; the refusal text naming the open-to-buy shortfall; the test fixtures `writeSyntheticBudget` (a SYNTHETIC approved budget for the browser journey, written as a fixture since a budget approved on a fixture's clock is in force only from that clock's instant, as `writeSyntheticMarking` does) and `bookingLimitApproved` (a booking limit through `access`'s commands).
- Review 4 (22 Oct 2026, branch `s2/review-4-fixes`): `bookingTotals` moved to a third entry point of `packages/calculations`, `@apparel-os/calculations/booking`, which the web app now depends on (shared-calculations 2.1, 2.2); the line cap is 10,000, written 1,000 lines a statement, with an 8 MiB body for a Draft; attaching documents names the version token; the open-to-buy refusal names the brand and season only, and the screen shows the value at cost beside what is left and any shortfall, so the refusal text naming the amounts is gone (goods-in 3.9).
- Open, for the product owner: which records are policy 5's values (RR-561) and policy 1's (RR-565): until both are answered a booking's approval stays unavailable outside tests, which open the gate through TEST-ONLY checks reporting labelled synthetic values. The seed is unchanged: `DEC-143` covers the GRN series alone, so `dev` approves no booking until RR-564 is answered.
