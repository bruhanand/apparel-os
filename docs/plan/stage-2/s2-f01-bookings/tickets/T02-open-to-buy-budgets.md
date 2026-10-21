# S2-F01-T02 — Open-to-buy budgets

Status: ready-for-agent
Blocked by: —
Feature: [Stage 2 first version](../../spec.md)

## Build

- The open-to-buy budget of `booking`: one amount in paise per brand and season, with versions ([goods-in.md](../../../../design/goods-in/goods-in.md) 3.3; `PRD-BKG-004`, `POL-05.09`).
- Booking prepares a version; Accounts records its check; the Owner, or whoever holds the approval, approves it, and only after the check. The preparer can neither check nor approve their own (`POL-02.07`). A change is a new version through the same steps; history is kept.
- The remaining open-to-buy read: the approved amount less the value reserved by approved bookings (reservations arrive with `S2-F01-T03`; until then nothing is reserved).
- Screen Booking › Open-to-buy; the check and the approval in My work. The operations register with the policy gate under policy 5 (goods-in 10.5). Amounts in tests and on `dev` are labelled synthetic (V-17, RR-080).

## Expected outputs

`booking` records, migration and table register entries; routes, schemas, OpenAPI; the screen; integration tests.

## Done when

A budget is usable only once checked and approved by people other than its preparer; each refusal names its reason; versions keep their history; the remaining amount reads correctly; every check passes.
