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
