# S1-F01-T30 — The screen locks itself when the idle limit passes

Status: done
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
- Built: the session read (`GET /api/access/session`) gives `idleLockSeconds`, read from `access.office-session-limits` in `ownAccess`; the OpenAPI document is regenerated. In the web app, `lock/idle-lock.ts` keeps one timer (`startIdleLock`) and the instant of the last request (`noteRequest`); `api.ts` notes each call to a route that is not `public` when it is sent; `lock/use-idle-lock.ts` starts the timer while the session is active and shows the lock as the server-triggered path does (`App.tsx`), so the page stays and `useRouteForm` empties the secret fields as before.
- Choice (the ticket asked for it to be noted): the timer is counted from the last authenticated request, as the server counts, and local pointer or key activity does not reset it. A person who only moves the mouse sees the lock at the moment the server would have locked at the next request, so the screen and the server agree. A tab that comes back to the front or regains focus checks at once, since a background timer may run late.
- The session read is reached only once first sign-in is done (`access.sign-in-incomplete` before), so the enrolment and password-change screens run no timer; the server still locks those sessions at the next request.
- A changed limit (access-and-approvals 3.3, essential security settings) reaches a screen at its next page load or sign-in. A screen holding a larger old limit may show its lock later than the server would lock, but the server still locks at the next request; one holding a smaller old limit may lock a little early, and the unlock then reaches the session as usual.
- Tests: `idle-lock.test.ts` with a fake clock (lock after the limit, none while requests keep coming, one timer, a late-woken tab); the session read in `sign-in.int.test.ts` and `roles-and-assignments.int.test.ts`; `apps/web/e2e/lock.spec.ts` now waits with no click and finds the lock.
