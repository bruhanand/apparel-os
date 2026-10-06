# S1-F01-T20 — Acceptance: journeys, concurrency, isolation and leak suite

Status: blocked
Blocked by: T10, T16, T18
Feature: [S1-F01 First access](../spec.md)

## Build

- Journeys (from T19): the journeys of section 14 test `S1-F01-AT18` on the Playwright setup of T15, including a keyboard-only path through sign-in and approval, a reload mid-journey that decides nothing twice, and a locked session that keeps unfinished work
- Concurrency, isolation and leak suite: integration tests on real PostgreSQL under the runtime role for the concurrency, isolation and leak cases of section 10
- Acceptance run (from T21): run every acceptance test; gather the evidence of section 15; update `AGENTS.md` "Current state", [STATUS.md](../../../../STATUS.md) and any design text the code proved wrong; Demo 1 on Railway `dev`: setup, sign-in, permissions and independent approval

## Expected outputs

Journeys; tests; evidence bundle; reviewed doc edits

## Done when

- The `S1-F01-AT18` journeys pass in CI and keep their traces as artefacts
- `S1-F01-AT02`, `S1-F01-AT09`, `S1-F01-AT14`, `S1-F01-AT15`, `S1-F01-AT17` pass in CI
- Section 15 complete; the link check passes; the product owner accepts
- Demo 1 shown on `dev`, once the product owner authorises the deploy

## Notes

- On 6 Oct 2026 (product owner) T19's remaining journeys and all of T21 merged into this ticket; T19's Playwright setup and first sign-in journey are in T15.
- RR-192: persona browser journeys.
- Synthetic users and role assignments for the journeys come from the fixtures (house rules 11).
- RR-191: concurrency suites on real PostgreSQL.
- RR-196: recheck the paired isolation tests when the integration run passes about two minutes.
- RR-190 and RR-200 (role proofs and time-limit measurement) close here; RR-216 (`AOS_DATABASE_POOL_MAX` for `dev`) and RR-187 (inspect Railway `dev`) are needed for the first `dev` demo, now Demo 0 in T14.
