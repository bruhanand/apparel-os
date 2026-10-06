# S1-F01-T04 — Idempotency and API conventions

Status: done
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

- Built on branch `s1/f01-t04-impl` from the earlier unreviewed draft (`0469a12`), rebuilt test-first: commit `2f4835f`.
- Idempotency: migration `organisation/0003__kernel__idempotency.sql` (three append-only `kernel` tables), `kernel/idempotency/` (canonical form, helper, contracts, module). Tested on real PostgreSQL in `test/idempotency.int.test.ts`: replay, scope, CH-14 replay access, kept and unkept refusals, stale version kept, changed content kept with secrets out and restricted values encrypted, 12.5 and 12.6 replays, two at once (wait, rollback, lock limit), and an uncertain commit (lost connection and time limit, committed and not) never giving a second effect.
- API conventions (from T05): `packages/schemas` route table, error envelope and kernel codes, `shownOnceSecret()` (RR-208), generated `openapi.json` checked by a unit test, typed client; the server's route interceptor, envelope filter, route declaration check, `Cache-Control: no-store` and the request log line; the health endpoint on the route table; the web app's client in `apps/web/src/api.ts`. A command through the API under one key: `test/idempotency-api.int.test.ts`.
- Design details written into code-house-rules 12.2, 12.3 and 12.4 in the same change: the `issues` field, `kernel.invalid-request` and `kernel.not-found`, the replay header on a kept refusal, the version token hashed as part of the body, `x-error-codes` and `x-access` in OpenAPI.
- Follow-ups: RR-240 (Origin check, T08), RR-241 (access codes, T13), RR-242 (`paiseSchema` codec), RR-243 (secret check and cipher, T08), RR-244 (body limit, S1-F06).
- T05 (API conventions in code) merged into this ticket on 6 Oct 2026 (product owner).
