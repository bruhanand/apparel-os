# S1-F01-T11 — Roles, assignments and scope

Status: blocked
Blocked by: T06, T08
Feature: [S1-F01 First access](../spec.md)

## Build

The permission registry (each module declares its record types, actions and field classes); roles with versions and expanded permissions; the self-service rule; persona held; role assignments with all, selected or empty scope per dimension and own-record scope, with the canonical scope key and the reviewed constraint that keeps one actor's assignments of one role and one exact scope from overlapping (`DEC-112`, house rules CH-7); withdrawal of a Scheduled assignment before its start through a prepared and independently approved change, with the once-set withdrawal reference the overlap constraint leaves out (RR-202, house rules 7.3, CH-11); effective grants rebuilt on change and by a scheduled job when dates pass; Authorise returning the assignment it used; the Restrict-fields hook for `S1-F03` (access-and-approvals 4, 5, 7)

## Expected outputs

`access` roles and assignments; tests

## Done when

Tests 5a, 5b, 6, 9 (all members and empty), 10 and 11 pass

## Notes

- RR-232: reset `aos.actor_id` before a connection returns to the pool, and test it.
- RR-202: withdrawal of a Scheduled assignment is in scope here; the state name "Withdrawn" is still open (design-language).
- RR-190: prove the runtime role owns no table and cannot bypass row-level security (mostly proved by `roles.int.test.ts`).
