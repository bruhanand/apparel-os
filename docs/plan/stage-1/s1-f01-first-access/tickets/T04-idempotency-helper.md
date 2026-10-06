# S1-F01-T04 — Idempotency helper

Status: in-progress
Blocked by: T03 (done)
Feature: [S1-F01 First access](../spec.md)

## Build

The kernel idempotency table and helper of section 11 (`PRD-INT-002`)

## Expected outputs

Helper; tests

## Done when

Same key and content: one effect, same result, answered only after Authenticate and Authorise pass now; changed content: refused and kept with every restricted value encrypted; two concurrent calls with one key: one effect; a lost connection or a timeout during `COMMIT`, for a transaction that committed and one that did not, never frees the key or lets a second effect happen (house rules 12.4)

## Notes

- Partial work, unreviewed and with **no tests**: branch `worktree-agent-ac4283b04ef22abff`, commit `a98dcbe` (10 files, +1,242 lines: migration `organisation/0003__kernel__idempotency.sql`, `kernel/idempotency/` canonical form, contracts, errors, helper, module). It forks from `07c8acf` and should apply cleanly. Use it as a starting point; review it as new code.
- Brief: section 11 of the spec and house rules 12.4 and 12.5 (replay, secrets, uncertain commit).
