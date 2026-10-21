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

## Notes

- Built (21 Oct 2026, branch `s2/f01-t02-open-to-buy-budgets`): the first code of `booking`. Migration `0085__booking__open_to_buy_budgets.sql` (provisional range 0095 to 0099; numbered gap-free on the branch so the runner's check passes) with three `tables.json` entries: `booking.open_to_buy_budget` (one per brand and season), its versions dated by instants, and Accounts' check, append-only, one per version, its trigger refusing the preparer. Record types `booking.open_to_buy_budget` (view, create, edit, approve; brand) and `booking.open_to_buy_check` (view, approve; brand). Routes `listOpenToBuyBudgets`, `readOpenToBuyBudget`, `prepareOpenToBuyBudget`, `prepareOpenToBuyBudgetVersion`; OpenAPI regenerated. The check and the approval are two approval rules of `access`; the check's effect records it and requests the approval in the same transaction, the approval's effect refuses a version with no check (`booking.budget-not-checked`). `remainingOpenToBuy` on `booking`'s interface for `S2-F01-T03`. Screen Booking › Open-to-buy, the budget facts on the approval panel, menus for Booking and the Owner. Tests: `apps/server/test/open-to-buy-budgets.int.test.ts` and the journey `apps/web/e2e/open-to-buy.spec.ts`.
- Design details settled, written into goods-in 3.3 "As built" and 10.5, access-and-approvals 9.8b "As built for a document decided in two steps", domain-model section 5 and goods-in section 13 (GI-2).
- Policy gate: the ticket says the operations register under policy 5. DEC-116 keeps setup and configuration operations ungated, and a budget is how policy 5's values are entered, so the budgets register as policy 5's values through the validity check `booking.open-to-buy-budgets`; the gated operation that uses them, a booking's approval, is `S2-F01-T03`'s (RR-549).
- Beyond the ticket: a section Booking in the web app's menu; the composition root's late-bound Request approval for a decision effect (access-and-approvals 9.8b).
- Open, for the product owner: RR-548 (may the checker also approve; a value limit on the approval), RR-549 (budgets as policy 5's values lapse its validation after each change), RR-550 (which attribute is the season, GI-2).
