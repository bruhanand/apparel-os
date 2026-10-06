# S1-F13-T02 — Dues, advances and deposits

Status: blocked
Blocked by: S1-F13-T01
Feature: [S1-F13 Opening-data layouts and reconciliation](../../spec.md)

## Build

The financial opening layouts, each its own kind, staged, validated and reconciled with synthetic closed-book balances; nothing posts ([imports-and-opening-data.md](../../../../design/platform/imports-and-opening-data.md) (GC-6) 10.4, 10.5, section 11; `PRD-LIF-009`, `PRD-LIF-011`, `POL-14.03`).

- **Separate layouts and opening kinds** (10.4): supplier dues (party, legal entity and book, document reference and date, original and open amounts, due date), customer dues (customer, document reference and date, open amount, due date), advances given and received (party, purpose, amount, evidence) and deposits given and received (party, agreement reference, amount, evidence). The fields are GC-6's **Proposed** ones, on labelled synthetic data. Outstanding commercial stock is not built: its fields are OPEN (GC6-10).
- **Every row** carries its legal entity and book through a business unit's mapping (`PRD-ORG-005`), amounts in integer paise (`PRD-MOD-014`) and the cutoff date. Deposits and advances stay apart from expenses (`PRD-PAY-008`). Customer names on customer dues are personal data and carry their restricted class (section 11).
- **Reconciliation** (10.4; `POL-14.03`): a comparison run of S1-F13-T01 compares each kind's totals, per party and per account, with synthetic closed-book balances, listing every difference.
- **No double count** (10.4; `PRD-LIF-011`): a row that is also open as a live document is Blocking. No stage 1 module holds live dues (payables and receivables are stage 5; GC6-11), so the check goes through the opening-balance test handler against a test-only stand-in in its `test_` schema (code-house-rules 11.4). Write the shape of that check into GC-6 10.4 with this code.
- **Never** (10.5; `PRD-LIF-008`): no delivery, invoice, liability or journal is created.

## Expected outputs

- Four layouts and mappings with their opening kinds; the totals comparison; the double-count check; tests

## Done when

- GC-6 17 test 21 passes
- No journal, liability or other record outside `files-imports` exists after the four kinds are staged and validated

## Notes

- RR-047 is a gate of this feature's code; it is listed on S1-F13-T01, which this ticket follows.
- RR-133 (GC6-10, Accounts question 20): the real fields, what outstanding commercial stock holds and the form of the closed-book balances stay with Accounts and the CA. GC6-11: where these items are held between the stage 4 switch and stage 5 stays open.
- Financial opening balances post only at a Store's switch, in stage 4 (books-and-posting 7.3).
