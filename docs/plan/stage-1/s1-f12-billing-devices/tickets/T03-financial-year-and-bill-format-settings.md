# S1-F12-T03 — Financial year and bill-number format settings

Status: ready-for-agent
Blocked by: S1-F12-T01 (`numbering`'s financial years and kind formats, and `pos`'s `defineMissingSeries`); S1-F12-T02 (every device's rows held while its series are defined); S1-F01-T13 (approval rules, reasons and decisions); S1-F02-T01 (the decision-effect contract)
Feature: [S1-F12 Billing devices and device bill series](../../spec.md)

## Build

The approved change that sets the Organisation's financial-year dates and the bill-number format, and that gives every Active billing device its missing series in the same transaction ([offline-counter.md](../../../../design/pos/offline-counter.md) (GC-8) 4.1, 4.3a; [numbering-and-audit.md](../../../../design/platform/numbering-and-audit.md) 3.3, 3.5; `DEC-116`, `DEC-117`). Product owner, 10 Oct 2026: a new stage 1 ticket.

- **The settings** (numbering-and-audit 3.3, 3.5; code-house-rules 12.14): the financial years (`numbering.financial_year`: a label, a first and a last day, never overlapping) and the format a numbered kind's new series take (`numbering.kind_format`, for `pos.bill` here), each with its origin. Neither has a default. Their values are KDPS's: the financial-year dates (GC5-1, RR-060; Accounts and the CA) and the bill-number format within the GST limit (V-40, RR-101; `POL-10.07`; the CA). This ticket chooses no value; tests use labelled synthetic ones.
- **Prepared by one person, approved by a second** (product owner, 10 Oct 2026; access-and-approvals 9; `PRD-ACS-006`): a route and the access approval flow, with the decision's effect taking the setting into force in the decision's transaction (access-and-approvals 9.8b). The permissions come only through role assignments (`POL-02.03`); who holds them is KDPS's (V-01).
- **The missing series** (offline-counter 4.1; `DEC-117`): the approval that defines a financial year or sets the bill-number format calls `pos`'s `defineMissingSeries` in its own transaction, holding `missingSeriesLockTargets` in its step 1 lock call (code-house-rules 8.2), so every Active device without a series for that year gets one. Retry-safe: a repeat defines nothing twice, and no existing series is replaced, renumbered or reset. This completes T01's last Done-when clause.
- **Screen**: on Setup, the financial years and the bill-number format, each with its pending change and its approval on the approval panel; the refusals with their reasons (`PRD-UXP-003`).
- **The journal series' year label** (books-and-posting 4.1 "As built"; `S1-F09-T02`): a period names its financial year by a label Accounts give it, while the year's dates are OPEN. Once the Organisation's financial years exist, that label may move onto them. Decide it here, or note it as an open item; never change a period already defined.

## Expected outputs

- The routes, the decision effects and the Setup screen for financial years and the bill-number format
- The missing series defined by the approving decision; tests on the server and the Admin's browser journey

## Done when

- A financial year or a bill-number format prepared by one person takes effect only when a different authorised person approves it; the preparer cannot approve their own change
- A device enrolled before the format and year exist gets its series when the approving change commits; repeating the change creates none twice; an existing series is untouched (`DEC-117`; T01's last Done-when clause)
- A revocation or retirement in progress is waited for, and the device it ends gets no series (code-house-rules 8.2)
- With either setting missing, the devices readiness check still fails naming it (offline-counter section 11; test 8)
- No value is chosen: every test value is labelled synthetic

## Notes

- Live gates: the financial-year dates (GC5-1, RR-060) and the bill-number format (V-40, RR-101), each with its origin validated (code-house-rules 12.14).
- Related: RR-449 (no screen or route defines a number format or a series yet).
