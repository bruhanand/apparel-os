# S1-F09-T01 — Books, cost settings, chart of accounts and dimensions

Status: blocked
Blocked by: S1-F02-T02, S1-F06-T05 (stored files, for the CA's evidence)
Feature: [S1-F09 Books, posting maps, periods and tax-rule records](../../spec.md)

## Build

The `finance` module, books part, with its first migration ([books-and-posting.md](../../../../design/finance/books-and-posting.md) 13.1: `book_setting` and `account`, each with versions).

- **Book settings** (2.2, 2.3): effective-dated versions of two kinds per book. Cost: the formula, FIFO or moving weighted average, and the pool mode, one pool per SKU across the book or one per SKU at each Site (`PRD-LED-014`, `PRD-LED-015`, `DEC-004`, `DEC-031`). Voucher model: vouchers with or without items (MM-12, `DEC-105`). Neither has a default: reading a setting answers its version in force with its identifier, or "not set" (house rules 12.14), and the stock ledger refuses a valued item while the cost setting is not set (`no-cost-setting`, stock-ledger 13.8; `PRD-SEC-017`). A version that changes the formula or pool mode of a book that has held stock is refused, naming SL-6 (2.2; stock-ledger 7.12). `finance` asks "has this book held stock?" through a contract it defines here and `stock` implements in S1-F10-T01 (module-map section 3, rule 6, as for location-in-use; product owner, 6 Oct 2026, DEC-116); while no implementation answers, such a change is refused.
- **Chart of accounts** (3.1; `PRD-LED-001`): accounts per book as masters with versions; code unique in the book; nature (asset, liability, equity, income or expense) fixed at creation; retired, never deleted, and a retired account takes no new line.
- **Approval of versions** (6.3; `POL-09.01`, `DEC-112` GC4-2): an account version, cost setting or voucher-model setting is prepared by an authorised Accounts user and takes effect only when a different authorised Accounts user, never one of its preparers, decides it through `access` ([access-and-approvals.md](../../../../design/access/access-and-approvals.md) 9.3, 9.5), and the CA's approval evidence is attached, as a stored file through S1-F06-T05, or referenced. One piece of evidence may cover a named set of versions if it says which. No version starts on a past date, and a version in force is never edited (structure-and-masters 2.2; house rules 7.3).
- **Dimensions** (2.1, 3.2; `POL-09.11`, `PRD-ORG-005`, `PRD-ORG-006`): a business unit's book is found through its mapping on the accounting date from `organisation`, keeping the mapping version (`PRD-LED-002`, `PRD-ACP-013`); the Store comes from the unit, none for a warehouse or office unit; the brand is the one the source names. Post (S1-F09-T02) uses this lookup and refuses a missing required dimension.
- **API** (API only in stage 1; product owner, 6 Oct 2026, DEC-116): Maintain accounts and settings (9.1); Read the cost setting of a book on a date, with its version, for the stock ledger's Plan (stock-ledger 13.1); the "has this book held stock?" contract; the record types and actions registered with `access`.

## Expected outputs

`finance` module with its `index.ts`; first `finance` migration with its `tables.json` entries; schemas and routes; tests

## Done when

- The approval path of 6.3 works for account, cost-setting and voucher-model versions: the clauses of books-and-posting 15 test 15a for these kinds pass (S1-F09-T02 adds posting maps and owns the test)
- With no approved cost setting, Read answers not set; a second account with the same code in one book is refused; an account's nature cannot change; a retired account stays readable; a version starting on a past date is refused; a formula or pool change on a book that has held stock, as a test-only implementation of the contract answers, is refused naming SL-6, and is refused while no implementation answers
- A synthetic CA evidence file attached to a set of versions opens from each of them for an authorised reader
- A unit with no mapping on the date is refused; a unit's Store comes from the unit; a second synthetic Organisation sees none of these records

## Notes

- "Has this book held stock?" is a contract `finance` defines and `stock` implements, and the books-and-posting 2.2 refusal uses it (product owner, 6 Oct 2026, DEC-116). `finance` sits in tier 2 and cannot call `stock` in tier 3, so this is the module-map section 3, rule 6 pattern.
- The CA's evidence is a real stored file from the start: S1-F06-T05 is built right after S1-F01, and this ticket attaches it (product owner, 6 Oct 2026, DEC-116). What a reference, used instead of an attached file, holds is not designed; settle it in books-and-posting 6.3 with the code.
- Book settings and the chart of accounts are API only in stage 1; their screens are designed and built before the first live posting in stage 2 (product owner, 6 Oct 2026, DEC-116).
- Values stay OPEN: KDPS's formula and pool (V-08, V-09, SL-1; RR-071, RR-072), the accounts (V-10, RR-073), the voucher model per book (V-46, RR-107), the framework (V-07, RR-070). Tests use the labelled synthetic book and chart of 16.1. Accounts and the CA confirm the workflow before live use (RR-198).
- As built (S1-F09-T01): module `finance` · books with migration 0051 (`finance.book_setting`, `book_setting_version`, `account`, `account_version`, `ca_approval_evidence`, `ca_approval_evidence_cover`); routes under `/api/finance/` (accounts, a book's settings, Read the cost setting on a date, record CA approval evidence); `booksApprovals` handed to `access`; `dimensionsOn` for Post. The CA's evidence is the books part's own record, recorded before the decision against the set of versions it names; Decide's effect refuses `finance.no-ca-evidence` without it (books-and-posting 6.3 "As built for accounts and settings"). Tests: `apps/server/test/books.int.test.ts`, `books-routes.int.test.ts`.
- Beyond the ticket: the composition root hands `stock` · ledger's existing `BookStockHistory` to `finance` under `BOOK_HELD_STOCK`, since it already exists (S1-F10-T01); `organisation` exports `accountingBookExists` and `mappingOn` for `finance`; the web message catalogue names the new record types, action types and codes.
