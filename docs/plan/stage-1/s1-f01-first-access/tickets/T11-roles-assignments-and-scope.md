# S1-F01-T11 — Roles, assignments and scope

Status: done
Blocked by: T06 (done), T08 (done)
Feature: [S1-F01 First access](../spec.md)

## Build

The permission registry (each module declares its record types, actions and field classes); roles with versions and expanded permissions; the self-service rule; persona held; role assignments with all, selected or empty scope per dimension and own-record scope, with the canonical scope key and the reviewed constraint that keeps one actor's assignments of one role and one exact scope from overlapping (`DEC-112`, house rules CH-7); withdrawal of a Scheduled assignment before its start through a prepared and independently approved change, with the once-set withdrawal reference the overlap constraint leaves out (RR-202, house rules 7.3, CH-11); effective grants rebuilt on change and by a scheduled job when dates pass; Authorise returning the assignment it used; the Restrict-fields hook for `S1-F03` (access-and-approvals 4, 5, 7)

## Expected outputs

`access` roles and assignments; tests

## Done when

Tests 5a, 5b, 6, 9 (all members and empty), 10 and 11 pass

## Notes

- RR-232: reset `aos.actor_id` before a connection returns to the pool, and test it.
- RR-202: withdrawal of a Scheduled assignment is in scope here. The state name Withdrawn and the withdrawal mechanism of house rules 7.3 are approved (CH-11; product owner, 6 Oct 2026, DEC-116).
- RR-190: prove the runtime role owns no table and cannot bypass row-level security (mostly proved by `roles.int.test.ts`).
- Built on branch `s1/f01-t11`, test-first. Migrations `organisation/0010__access__roles_and_assignments.sql` (`persona_held`, `role` + `role_version`, `role_permission`, the change rows, `role_assignment` with `scope_key` and its exclusion constraint, `assignment_scope`, `assignment_scope_member`, the withdrawal document, `effective_grant`, `access.scope_key_of`, `access.row_visible`), `0011__audit__history_read_policies.sql` (RR-242) and `0012__kernel__access_job_queue.sql`.
- The permission registry is `permissionRegistry` in `packages/schemas` (shared with the web shell, RR-261). `access` offers Authorise, Restrict fields, the session's personas and grants (RR-281), preparing roles, role versions, assignments and withdrawals, the effects T13's Decide calls, and the grants rebuild with its job kind `access.rebuild-grants` (`access-jobs`). Routes: `POST /api/access/roles`, `/roles/{roleId}/versions`, `/role-assignments`, `/role-assignments/{assignmentId}/withdrawal`; the guard runs Authorise on every `action` route.
- RR-273: job kinds and consumers declare `authorises`; the worker authorises each step, each redelivery and the outbox processor.
- Tests: `roles-and-assignments.int.test.ts` (tests 5a, 5b, 6, 9, 10, 11; withdrawal; dates passing; role versions; restricted fields; the routes and the session read), `access/domain/scope.test.ts`, the RR-232 case in `command-runner.int.test.ts`, the RR-273 refusal in `worker.int.test.ts`, the register checks of `locked` and `projection`.
- Design edits in the same change: code-house-rules 6.3 and 7.3 (CH-7's canonical form, settled), access-and-approvals 4.3, 7.1 and 13.1, numbering-and-audit 4.5.
- Follow-ups: RR-290 (setup writes the identities' roles), RR-291 (T13: approvals over these effects), RR-292 (ending early, draft edits), RR-293 (Available), RR-294 (EXPLAIN on volume), RR-295 (concurrent overlapping approvals), RR-296 (Authorise in commands for scoped record types), RR-297 (`configuration.policy_status`).
