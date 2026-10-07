# S1-F01-T22 — Same-day disabling and role locking

Status: done
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

- **Same-day disabling** (RR-321; `PRD-SEC-019`, `PRD-SEC-008`; `DEC-118`). A disabling or ending of a user takes effect at the moment it is approved, not from the next business day. User versions are dated by instants (`tstzrange`), as the Organisation's timezone versions are: the version in force ends at the decision's recording time and the new one starts there, so a user created or approved earlier the same day can be disabled at once (access-and-approvals 2.1, 9.5, 13.1; code-house-rules 7.3, 9). In the decision's transaction every session of the user is revoked and a new sign-in is refused from then (access-and-approvals 3.3, 7.1 step 1). A reviewed migration changes `access.app_user_version` from business dates to instants, keeping its exclusion constraint, its trigger rules and its history; `access.version-overlaps` no longer refuses a same-day version.
- **Role locking** (RR-360; `PRD-INT-003`; `DEC-118`). A command relying on a role assignment also locks, shared, the role that assignment grants at step 0; a decision that makes a role version take effect locks the role exclusively at step 0; under the locks the command rechecks the role's version in force and refuses as stale (`kernel.stale-version`) when it changed (code-house-rules 8.1, 8.2; access-and-approvals 7.1 step 4, 9.5). `holdAuthority` and Decide take the role with the user and assignment in the same step-0 call. The role table is marked `locked` in its register if it is not already.

## Expected outputs

A reviewed `access` migration; changes to `access` versions, Decide and `holdAuthority`; the design's "As built" notes updated; tests.

## Done when

- access-and-approvals 15 test 19h passes: a user approved earlier today is disabled today; the decision revokes every session, the next request of each is refused, and a new sign-in is refused at once (integration test on real PostgreSQL).
- Test 19i passes: a role version taking effect and a command relying on that role, raced both ways, never pass each other; the one that locks second waits and sees the other's commit; no command succeeds on the replaced version.
- The existing tests 19f, AT05 and AT10 and `authority-locks.int.test.ts` still pass; history shows the disabling with its decision instant.
- The full check set is green (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm check:modules`, `pnpm check:links`, `pnpm format:check`).

## Notes

- Built in commit `172db33` on `s1/f01-t22`. Migration `0018__access__user_instants_and_role_lock.sql` changes `app_user_version.valid_during` to `tstzrange` in place (each recorded day becomes its start under the Organisation's timezone) and grants `UPDATE (id)` on `access.role`, now marked `locked`.
- The user version in force is the Approved one with no end, so a command that waited at step 0 for a disabling sees it. A decision whose recording time is earlier than the start of the version in force is refused as stale (access-and-approvals 9.5 "As built").
- Tests: 19h in `test/same-day-disabling.int.test.ts` (through the API); 19i in `test/authority-locks.int.test.ts`. `userInForce(context, userId)` lost its date argument; `replaceCredentials` lost its business date.
- Follow-up: RR-370 (migration 0018 is not compatible with the version running for the first `dev` deploy after it; product owner).
- Second S1-F01 review fixes (branch `s1/f01-review-fixes-2`): job steps now take the same step-0 locks and role recheck through `JobIdentities.hold` (`access/commands/job-identities.ts`, moved from `queries/`); a stale role throws `StaleAuthority`, which the retry rule retries. Tests: the last two describes of `test/authority-locks.int.test.ts`.
