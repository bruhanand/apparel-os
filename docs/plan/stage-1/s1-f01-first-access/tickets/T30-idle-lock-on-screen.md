# S1-F01-T30 — The screen locks itself when the idle limit passes

Status: ready-for-agent
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

- The session read gives the web app the idle-lock limit in force (a setting value, never a secret)
- The web app keeps a timer reset by the person's own activity and by each authenticated request; when it passes, the existing lock screen shows, keeping unfinished work and clearing secret fields as it does today
- No polling is added; the server still locks at the next request and stays the real check (access-and-approvals 4)
- Edit access-and-approvals and RR-301 to match

## Done when

- A unit test with a fake clock shows the lock after the limit and none while the person is active
- The lock journey (`apps/web/e2e/lock.spec.ts`) shows the lock with no click
- Every check, both test suites and the browser journeys pass

## Notes

- Found in the hands-on test, [test-report.md](../test-report.md) F2.
- Product owner, 7 Oct 2026: lock on a screen timer, still without polling.
