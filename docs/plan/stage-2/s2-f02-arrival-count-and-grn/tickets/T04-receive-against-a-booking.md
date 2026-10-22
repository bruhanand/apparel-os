# S2-F02-T04 — Receive against a booking

Status: in-progress
Blocked by: S2-F02-T02, S2-F01-T04
Feature: [Stage 2 first version](../../spec.md)

## Build

- "Receive against booking": the Arrival names one booking of the same supplier and brand, Approved, Issued or Confirmed; its open lines show as the expected goods ([goods-in.md](../../../../design/goods-in/goods-in.md) 3.7, 4.1).
- At GRN issue each counted line links, through `booking`'s receipt link operation, to the one booking line whose style code matches, and whose colour and size match where the booking line gives them, ignoring case and spaces at the ends; any other line, and a GRN at a Site that is not the booking's destination, goes to Booking for review (`PRD-BKG-007`, `DEC-130`).
- Later linking of an unbooked GRN or a reviewed line by Booking, through `booking` (`PRD-BKG-008`).

## Expected outputs

`receiving` changes; routes and schemas; screens; integration tests.

## Done when

Design tests 5 and 6 pass with real GRNs; delivered quantities follow the links; every check passes.

## Notes

- Built 22 Oct 2026 on branch `s2/f02-t04-receive-against-booking`, awaiting review. The design is written back in goods-in 3.7 (late or excess goods, as the product owner decided on 22 Oct 2026, RR-577's `POL-05.08` half; an excess line goes to review whole, a design choice), 3.10, 4.8, 4.10 (as built), 10.3, 10.5, section 11 and section 13 (GI-8).
- **`booking`**: the receipt links work on a GRN's lines at once: `receiptsAtIssue` (read under the caller's lock before its later locks) and `linkReceiptsAtIssue` at issue, `linkReceiptsLater` for Booking's later link, which links lines within the window and the outstanding and proposes late or excess ones; the proposal, its lines and its one decision (migration `booking__receipt_link_proposals`) under the action type `booking.booking.link-receipt`, decided through `access` (`receipt-link-proposal.ts`); `receivableBooking`, `receiptsOfGrnLines`; the booking's read gives its proposals; the list's `receivable` filter. The pure rules are in `domain/receipts.ts`.
- **`receiving`**: an Arrival names its booking (migration `receiving__receiving_against_a_booking`); the GRN's issue locks the booking with the Arrival at step 1, links each line that received pieces or keeps why it went to review (`receiving.grn_line_booking`), and raises one `receiving.booking-review` follow-up a GRN; the route `linkGrnToBooking`; the Arrival's read gives the booking and each GRN line's place against bookings. The issue and record routes need view on the booking with its own facts (`AlsoNeeds` now carries a need's facts).
- **Migration numbers**: the runner refuses a gap, so the two migrations are 0101 and 0102 here, not the 0111 and 0112 the task gave; the merger renumbers them.
- **Tests**: `apps/server/test/receiving-against-booking.int.test.ts` (design tests 5 and 6 with real GRNs, late and excess, later links, refusals, not found); `apps/server/test/booking-lifecycle.int.test.ts` now receives through real GRNs in place of the test caller, its receipt-link tests moved to the new file; `apps/server/src/modules/booking/domain/receipts.test.ts`; `apps/web/src/receiving/booking-links.test.ts`; the journey `apps/web/e2e/receive-against-booking.spec.ts`; the register test's foreign keys of `receiving`.
- **Beyond the ticket**: the receiving fixture takes the labels of its size values (`sizes`), for bookings that name S, M, L and XL.
- **Open, for the product owner**: RR-580 (should an unbooked GRN reach Booking in My work too? GI-8), RR-581 (receiving against bookings as built: confirm or change). RR-577 keeps its `POL-05.10` half.
