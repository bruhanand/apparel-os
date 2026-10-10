# S1-F09-T03 — Period lock and reopening

Status: done
Blocked by: S1-F09-T02
Feature: [S1-F09 Books, posting maps, periods and tax-rule records](../../spec.md)

## Build

The period controls of `finance` · books ([books-and-posting.md](../../../../design/finance/books-and-posting.md) 4.2 to 4.5; `period_event`, `period_reopening`, `period_reopening_source` and `period_reopening_use` of 13.1).

- **Lock** (4.2; `PRD-LED-009`): by a person whose assignment grants the lock action on the book; only when every earlier period of the book is Locked. It takes the period row in exclusive mode, so it waits for postings already holding it in shared mode, and every later posting sees Locked (4.5; `PRD-INT-003`). `period_event` is append-only; the state (Open, Locked, Reopened) is a projection of the events and reopenings (4.1, DM-4). Emits `finance.period-locked`.
- **Refusals**: Hold periods, Post, Reverse and the journal's period-guard trigger refuse a Locked period, or a Reopened one for a posting that is not a named correction (9.1, 13.1).
- **Reopening** (4.3; `PRD-LED-019`, `PRD-LED-020`, `DEC-106`, `DEC-107`): a request with its reason and named corrections, each a source record by owning module, record type and identifier; refused when the period is not Locked or no correction is named. Approved through `access` Request approval and Decide by someone other than the requester, binding to the request as made (`PRD-ACS-007`); adding a correction is a new request. The approval takes the period row in exclusive mode. From the approval the period shows Reopened, and only postings whose source is a named correction enter it; each use is a `period_reopening_use` row with a unique key, written in the posting transaction. When every named correction has posted, or the reopening is withdrawn by its requester or an authorised person, the period shows Locked again. Several reopenings may be in force at once. Emits `finance.period-reopened`.
- **Screen** (14): Money › Period close: each period's state, the reopenings in force with their named corrections and which have posted; a refused posting names the Locked period.

## Expected outputs

Lock and reopening in `finance`; the Period close screen; tests

## Done when

- books-and-posting 15 tests 9, 10, 11, 12 and 13 pass (13 with its lock-order clause; S1-F09-T02 proved overlaps and gaps), 9 and 10 on separate connections
- Browser journey: an Accounts user locks two periods in order; a request to reopen the first, naming one synthetic correction, is approved by a different user from My work; the correction posts and the period shows Locked again, each step visible on Period close; the requester's own approval is refused, with its reason on screen

## Notes

- Test 10 measures the wait on the journal series rather than assuming it away; a result that breaches `PRD-PRF-003` goes back to Accounts under GC4-4.
- S1-F10-T07 also lists test 9, and S1-F10's scenario P5 (books-and-posting 16.4) needs this ticket.
- Who may lock, request and approve is KDPS's (V-01, RR-064); tests use labelled synthetic roles and periods (GC4-1, RR-061).
- As built (S1-F09-T03): migration 0054 (`finance.period_event`, `period_reopening`, `period_reopening_source`, `period_reopening_use`; the journal's guard now refuses a Locked period unless a reopening names the source); Lock a period, Request and Withdraw a reopening, Period close and Read a reopening on `Books`; the reopening's decision effect in `booksApprovals`; `finance.period-locked` and `finance.period-reopened`; routes `readPeriodClose`, `lockPeriod`, `requestReopening`, `readReopening`, `withdrawReopening`; Money › Period close and the reopening's facts on the approval panel; tests `apps/server/test/period-close.int.test.ts` (15 tests 9 to 13), the routes in `books-routes.int.test.ts`, and the journey `apps/web/e2e/period-close.spec.ts`. Test 10's measured wait on the journal series: mean 8.9 ms, p95 19.7 ms, max 21.2 ms (40 postings, 4 at once; books-and-posting 15 "As built"). Design gaps settled as **Design choice** in books-and-posting 4.2, 4.3, 4.5, 13.1 and 14 "As built" (edit on a period is the lock action; decisions and withdrawals as period events; a withdrawal locks the period row as an approval does). Open: RR-489 (who withdraws, and a pending request), RR-490 (reopening state names), RR-491 (the policy 9 check counts a Locked period).
- Beyond the ticket: the Read a reopening route, for the approval panel; Check postable takes the document optionally, so a request without it can name no correction; test support `apps/server/test/support/books.ts`; the journeys' server keeps the posting fixture open and serves a test-only harness on its own port that posts the SYNTHETIC correction mid-journey.
- Review fixes (S1-F09 review, 10 Oct 2026): the requester withdraws their own reopening without cancel, also while it awaits its decision, through `access`'s new Withdraw a request; anyone else needs cancel (RR-489, product owner); a further request on a Reopened period and a Reopened earlier period counting as Locked are confirmed (product owner); `finance.guard_journal` is defined once, in 0054; a correction's use refused at its unique key names the period.
- Closed 10 Oct 2026 on `s1/f09-books-and-periods` (commits `0173e78`, `4c77cf3`, `80f4d79`), reviewed with `/code-review` with the feature's other tickets; review fixes `732ff78`; no blocking finding left. Test 10 measured the wait on the journal series at mean 8.9 ms, 95th percentile 19.7 ms, maximum 21.2 ms (40 postings, 4 at once, local container), for Accounts under GC4-4. Product owner answers of 10 Oct 2026: the requester withdraws at any time (RR-489); a further request on a Reopened period and a Reopened earlier period counting as Locked are kept. Open: RR-490 (reopening state names, design review).
