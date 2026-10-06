# S1-F01-T04 — Idempotency and API conventions

Status: in-progress
Blocked by: T03 (done)
Feature: [S1-F01 First access](../spec.md)

## Build

A command sent through the API replays once, every error uses one envelope, and the API has its generated OpenAPI and typed client.

- Idempotency: the kernel idempotency table and helper of section 11 (`PRD-INT-002`)
- API conventions (from T05): validation from Zod, the error envelope and refusal codes, the idempotency-key requirement on writes, the version token, correlation identifier, generated OpenAPI and the typed client; the health endpoint moved onto them

## Expected outputs

Idempotency helper; Nest wiring; OpenAPI output; typed client; tests, including contract tests

## Done when

- Same key and content: one effect, same result, answered only after Authenticate and Authorise pass now; changed content: refused and kept with every restricted value encrypted; two concurrent calls with one key: one effect; a lost connection or a timeout during `COMMIT`, for a transaction that committed and one that did not, never frees the key or lets a second effect happen (house rules 12.4)
- The same command sent twice through the API with one key has one effect; a write without a key is refused; every error matches the envelope; OpenAPI is generated in CI; the web app compiles against the typed client

## Notes

- Partial work on the idempotency part only, unreviewed and with **no tests**: branch `worktree-agent-ac4283b04ef22abff`, commit `a98dcbe` (10 files, +1,242 lines: migration `organisation/0003__kernel__idempotency.sql`, `kernel/idempotency/` canonical form, contracts, errors, helper, module). It forks from `07c8acf` and should apply cleanly. Use it as a starting point; review it as new code.
- Brief: section 11 of the spec and house rules 12.4 and 12.5 (replay, secrets, uncertain commit).
- RR-208: how a secret shown once is sent and described (house rules 12.6, `DEC-113`); built here and in T08.
- T05 (API conventions in code) merged into this ticket on 6 Oct 2026 (product owner).
