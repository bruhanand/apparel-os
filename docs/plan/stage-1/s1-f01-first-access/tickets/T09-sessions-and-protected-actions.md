# S1-F01-T09 — Sessions, protected actions and the lock screen

Status: blocked
Blocked by: T11 (Authorise for resets and disabling), T15
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
