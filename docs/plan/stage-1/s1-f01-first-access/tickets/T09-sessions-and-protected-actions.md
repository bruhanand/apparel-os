# S1-F01-T09 — Sessions, protected actions and the lock screen

Status: ready-for-human
Blocked by: T11 (done), T15 (done)
Feature: [S1-F01 First access](../spec.md)

## Build

- Sessions: idle and absolute limits per session kind from settings; lock and unlock; revoking one or all sessions; disabling a user; the fresh-code check for protected actions with no freshness setting; resetting another user's credential (access-and-approvals 3.3, GC3-4, GC3-6)
- Lock screen (from T15): the session-lock screen

## Expected outputs

`access` sessions; the session-lock screen; tests

## Done when

- Tests 3a, 3b, 4 and 5 (sessions part) pass
- Manual check of the lock screen against design-language; the journeys of T20 cover it

## Notes

- The session-lock screen moved here from T15 on 6 Oct 2026 (product owner).
- Built 7 Oct 2026 on branch `s1/f01-t09` (commit 36e3189). Tests 3a, 3b, 4 and 5 (sessions part) pass in `apps/server/test/sessions.int.test.ts`; the web lock screen and kept-draft offer have unit tests in `apps/web/src/lock/`.
- Left for a person: the manual check of the lock screen against design-language (RR-304); the journeys of T20 drive it.
- Disabling a user: the session side is built (`AccessInterface.revokeSessions`, called by the decision's transaction; Authenticate refuses a user not Active). Preparing and deciding user changes is in no ticket yet (RR-300, product owner).
- Follow-ups: RR-300 to RR-304. RR-264 closed.
- S1-F01 review fixes (branch `s1/f01-review-fixes`): Authenticate locks the session row through the lock helper at step 1 (`access.session` marked `locked`) and moved to `commands/authenticate-session.ts`.
