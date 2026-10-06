# S1-F01-T03 — Command context

Status: done
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

One transaction per command shared by called modules; the transaction-local actor setting read by row-level security; a lock helper taking rows in ascending ID; correlation identifier; business date from the Organisation's timezone (`PRD-MOD-006`, `PRD-MOD-009`, `PRD-INT-003`); the runtime role's starting time limits for synthetic work, a timeout rolling the command back (`DEC-112`, house rules CH-3, RR-200)

## Expected outputs

Kernel command runner; tests

## Done when

Nested module calls share one transaction; a rollback undoes all of them; with no actor a scoped test table shows no row

## Notes

- Done: commit `07c8acf`, 6 Oct 2026. `kernel/command-runner/`, `kernel/time/`, `apps/server/db/runtime-limits-synthetic.sql`.
- Follow-ups: RR-231 (`configuration` supplies the Organisation timezone; the kernel side, `kernel/time/organisation-timezone.ts`, exists) and RR-232 (reset `aos.actor_id` before a connection returns to the pool, in T11). RR-200 (measure the time limits) stays open.
