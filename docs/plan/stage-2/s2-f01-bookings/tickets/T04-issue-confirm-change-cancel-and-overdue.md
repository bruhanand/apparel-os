# S2-F01-T04 — Issued, Confirmed, changes, cancellation and overdue

Status: blocked
Blocked by: S2-F01-T03
Feature: [Stage 2 first version](../../spec.md)

## Build

- Record Issued and Confirmed with their dates, the supplier's confirmation attached as a stored file ([goods-in.md](../../../../design/goods-in/goods-in.md) 3.4; `POL-05.01`, `DEC-099`).
- A change after approval is a new version approved again, taking the Agreement version then in force and reserving or releasing the open-to-buy difference (3.5, `DEC-132`).
- Cancelling an undelivered balance, and extending the window, each proposed by Booking and approved by a different person; a cancellation releases its reserved value and never erases received quantities (`POL-05.07`, `PRD-BKG-013`).
- The receipt link operation `receiving` will call at GRN issue (3.7), and later linking by Booking, dated and signed (`PRD-BKG-008`).
- Ordered, delivered, outstanding and cancelled quantities per line, delivered only from receipt links (3.6, `PRD-BKG-006`); the booking status read model.
- Overdue: when a line's date or the window passes with quantity outstanding, the balance is marked overdue and an exception reaches Booking in My work; nothing is cancelled (3.8, `POL-05.06`).

## Expected outputs

`booking` records and migrations; routes, schemas, OpenAPI; screens; the overdue job; integration tests.

## Done when

Design tests 4 (release and re-approval), 5 (with links made through the receipt link operation) and 7 pass; every check passes.

## Notes

- Built (22 Oct 2026, branch `s2/f01-t04-booking-lifecycle`): migration `0098__booking__lifecycle.sql` (numbered 0098 at the merge, after S2-F02-T03's 0096 and 0097) with nine `tables.json` entries, the line key (`booking_line.first_line_id`), the widened change kinds and the pg-boss queue `booking.mark-overdue`; action types `booking.booking.cancel-balance` and `booking.booking.extend-window` under approve on `booking.booking`; routes `recordBookingIssue`, `recordBookingConfirmation`, `proposeBookingCancellation`, `proposeBookingExtension`, and on existing routes, all additions: a line's `lineKey`, a submission's `communication`, the states Issued and Confirmed, and the booking's `change`, `issue`, `confirmation`, `status` and `amendments`; OpenAPI regenerated; the change's approval now reserves or releases the difference and the cancellation's and extension's decision effects; `booking`'s interface `bookingStatus`, `bookingLockTarget`, `linkReceiptAtIssue` and `linkReceiptLater`, which `receiving` calls from `S2-F02-T04`; the job kind `booking.mark-overdue` under the service identity `booking`, with its exception type `booking.overdue-balance`; the event `booking.booking-amended`. Screens: the booking's lifecycle on its screen and the amendment's facts on the approval panel. Tests: `apps/server/test/booking-lifecycle.int.test.ts` (design tests 4, 5 and 7), `apps/server/src/modules/booking/domain/lifecycle.test.ts`, `apps/web/src/booking/lines.test.ts`, the journey `apps/web/e2e/booking.spec.ts` extended. Design written into goods-in 3.10 (new), 10.3, 10.4, 10.5 and 11; domain-model section 5; code-house-rules 12.9.
- Design choices, written into goods-in 3.10: a line's key across versions; Issued and Confirmed per approved version (RR-575); a change keeps what is delivered and cancelled of each line, and a linked line's identity; a cancellation cancels whole balances, rechecked at its decision; no value basis for a cancellation's or an extension's approval (RR-574); the overdue exception per booking and due date, of the category shortage (RR-576); `OVERDUE_RUN_CAP` (100, a technical cap); the SYNTHETIC interval of the job, hourly, in the test settings only (CH-10).
- Beyond the ticket: the web app's and the counter's typed API clients, and `useSubmission`, now name their types, since the grown route table passed what the compiler spells out (TS7056); the setup step's test now lists the `booking` service identity.
- For deploys (not done; each waits for the product owner's go-ahead): the `worker`'s `AOS_WORKER_SETTINGS` needs a retry entry for `booking.mark-overdue` before its deploy, or the worker refuses to start (CH-10); each Organisation set up before needs `add-service-identities` for the `booking` identity (railway-roles-runbook "After a deploy that adds a job kind or a consumer"); and the overdue exceptions need the routing of `booking.overdue-balance` at each Site (Setup › Exception rules).
- Open, for the product owner: RR-574 to RR-578; booking approval, and so these lifecycle decisions, stay gated by policies 5 and 1 (RR-561, RR-565), opened in tests only through the TEST-ONLY checks of `S2-F01-T03`.
