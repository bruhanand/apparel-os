# S1-F01-T13 — Approvals and My work

Status: done
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

- Approvals: approval rule settings for access-change actions; the reason list and its free-text exception; Request approval with preparers; Decide with the fresh code, the rechecks and the version taking effect in the same transaction; supersession on material change; rejection back to the preparers (access-and-approvals 8, 9.1, 9.3, 9.5, 9.6, 9.11). A new user's first version and their role assignments may wait together; deciding an assignment is refused until the user's first version is approved, and rejecting the user's first version withdraws their pending assignments (access-and-approvals 4.3; product owner, 6 Oct 2026, DEC-116)
- My work (from T12): work items published, updated and closed from `access` events through the outbox; List my work with eligibility checked at read; ordering by due time then exposure with Unknown above known; no due time while routing has no rows (access-and-approvals 11)

A rejected user's pending assignments become Withdrawn, keeping that they were withdrawn before approval and why (`DEC-117`).

## Expected outputs

`access` approvals; `inbox` module; tests

## Done when

- Tests 12, 12a, 14 (access-change part), 19, 19b, 19f and 22 pass
- Deciding an assignment of a user whose first version is not yet approved is refused; rejecting that version withdraws the user's pending assignments
- Test 20 passes; a replayed event makes no second item; an ineligible reader sees nothing

## Notes

- RR-214: wording fixes for the 9.11 matrix and the user states (Active, Disabled, Ended).
- RR-215 answered (product owner, 6 Oct 2026, DEC-116): as Build says.
- T12 (Inbox and My work) merged into this ticket on 6 Oct 2026 (product owner).
- Built on branch `s1/f01-t13` (see the commit named in the next note). Also built here: user changes (RR-300, named by the orchestrator), approve and reject reasons, approval rule settings, the approval panel read and the reasons read. Migrations `0015__access__approvals.sql`, `0016__inbox__work_items.sql`. Tests: `test/approvals.int.test.ts` (12, 12a, 14, 19, 19b, 19f, 19g, 22, concurrent decisions), `test/my-work.int.test.ts` (20, replay, idempotent decision through the API), `src/modules/inbox/domain/order.test.ts`.
- Closed: RR-214, RR-246, RR-291, RR-295, RR-300. Follow-ups: RR-320 (evidence files), RR-321 (same-day disabling, product owner), RR-322 (`inbox` identity and worker settings on `dev`), RR-323 (rejection task in My work), RR-325 (step-0 authority locks), RR-326 (list reads for T16).
