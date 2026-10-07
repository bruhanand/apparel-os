# S1-F01-T20 — Acceptance: journeys, concurrency, isolation and leak suite

Status: ready-for-human
Blocked by: T10, T16, T18 (done); RR-350 (CI on a pushed branch, the product owner's acceptance, Demo 1)
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

## Acceptance tests and where they run

Server tests are in `apps/server/test/` (integration, real PostgreSQL under the runtime role) unless a path says otherwise; journeys in `apps/web/e2e/`.

| Test | Proved by |
| --- | --- |
| `S1-F01-AT01` | `setup-step.int.test.ts` (all of 19a, 19d, 19e, concurrent runs, conflicts naming nothing); `src/modules/access/domain/setup-fingerprint.test.ts`; `recovery.int.test.ts` |
| `S1-F01-AT02` | `sign-in.int.test.ts` "two Organisations", "the Organisation of a signed-in request"; `organisation-routing.int.test.ts`; `fixtures-isolation-a/b.int.test.ts` |
| `S1-F01-AT03` | `sign-in.int.test.ts` (tests 3, 3c, 3e, 3g); `audit.int.test.ts` "Record access" (test 13); `e2e/sign-in.spec.ts` |
| `S1-F01-AT04` | `sessions.int.test.ts` "resetting another user credential" (tests 3a, 3b); `approvals.int.test.ts` fresh code |
| `S1-F01-AT05` | `sessions.int.test.ts` (limits, unlock, revoke, disabled user); `apps/web/src/lock/*.test.ts*`; `e2e/lock.spec.ts` (new) |
| `S1-F01-AT06` | `roles-and-assignments.int.test.ts` (tests 5a, 5b) |
| `S1-F01-AT07` | `roles-and-assignments.int.test.ts` (tests 6, 9); `src/modules/access/domain/scope.test.ts` |
| `S1-F01-AT08` | `roles-and-assignments.int.test.ts` (test 10) |
| `S1-F01-AT09` | `roles.int.test.ts`, `command-runner.int.test.ts` "the actor and row-level security", `roles-and-assignments.int.test.ts` (test 11), `audit.int.test.ts` |
| `S1-F01-AT10` | `approvals.int.test.ts` "who may decide", "users"; `setup-step.int.test.ts` (first approver never prepares); `e2e/approval.spec.ts` (the Admin cannot decide) |
| `S1-F01-AT11` | `approvals.int.test.ts` "material change"; `access-records.int.test.ts` (superseded request shown) |
| `S1-F01-AT12` | `approvals.int.test.ts` "the reason list"; `my-work.int.test.ts`; `e2e/approval.spec.ts` (free text for the first list) |
| `S1-F01-AT13` | `my-work.int.test.ts`; `worker.int.test.ts`; `src/modules/inbox/domain/order.test.ts` |
| `S1-F01-AT14` | `idempotency.int.test.ts` (replay, actor scope, authorised replay, changed content kept, uncertain commit), `idempotency-api.int.test.ts`, `approvals.int.test.ts` "concurrent decisions", `my-work.int.test.ts` (decision replayed), `secret-leaks.int.test.ts` (new: changed content on the decision refused and kept) |
| `S1-F01-AT15` | `decision-atomicity.int.test.ts` (new: a statement failure and a lost connection after Decide's writes leave nothing; the next decision commits once with grants, audit, access record and outbox rows); `audit.int.test.ts` test 8; `outbox.int.test.ts`; `command-runner.int.test.ts` |
| `S1-F01-AT16` | `audit.int.test.ts` (tests 9, 10, 12, 14); `history.int.test.ts`; `roles.int.test.ts` (append-only) |
| `S1-F01-AT17` | `secret-leaks.int.test.ts` (new: every secret and code of the slice searched for in both service logs, every answer and every row of the Organisation's database); `audit.int.test.ts` test 11; `idempotency.int.test.ts` (kept requests); `outbox.int.test.ts` |
| `S1-F01-AT18` | `e2e/approval.spec.ts` (new: the Organisation from the real setup step; the Admin prepares the reason list, a P-AUD user, a role and the assignment; the approver signs in and decides the first reason with the keyboard only; the assignment waits for its user and says so; a reload mid-decision and a reload right after one decide nothing twice; the third person reads the assignment's history with preparer, approver, reason and version, and finds the role editor refused naming "View on Role"); `e2e/lock.spec.ts` (new); `e2e/sign-in.spec.ts` |

## Notes

- On 6 Oct 2026 (product owner) T19's remaining journeys and all of T21 merged into this ticket; T19's Playwright setup and first sign-in journey are in T15.
- RR-192: persona browser journeys.
- Synthetic users and role assignments for the journeys come from the fixtures (house rules 11).
- RR-191: concurrency suites on real PostgreSQL.
- RR-196: recheck the paired isolation tests when the integration run passes about two minutes.
- RR-190 and RR-200 (role proofs and time-limit measurement) close here; RR-216 (`AOS_DATABASE_POOL_MAX` for `dev`) and RR-187 (inspect Railway `dev`) are needed for the first `dev` demo, now Demo 0 in T14.
- Built 7 Oct 2026 on `s1/f01-t20`, commit b452fba. New tests: `apps/server/test/decision-atomicity.int.test.ts` (AT15), `apps/server/test/secret-leaks.int.test.ts` (AT17, and AT14 on the decision), `apps/web/e2e/approval.spec.ts` and `apps/web/e2e/lock.spec.ts` (AT18). The journeys' server (`apps/server/test/browser/serve.ts`) now makes a third Organisation with the real setup step, runs the worker that feeds My work, gives the second Organisation a 15 s synthetic idle limit for the lock journey, and writes its service log to `apps/web/test-results/server-log.jsonl` when it stops (Playwright now stops it with SIGTERM). Every value is synthetic.
- Defects the acceptance tests found, fixed here: (1) the new-user form could not be sent with no persona ticked, and said nothing (`UsersScreen` now starts personas as an empty list); (2) a lock left a secret field (the temporary password) on the page, and the form read it back after its reset (`useRouteForm` now empties declared secret and restricted fields first); (3) the unavailable state did not name the missing permission (now "Needs View on Role.", `missing.permission.named`; `PRD-UXP-003`); (4) the history of a record a decision changed did not keep the decision's reason; the decision's audit record and its effects' now carry it (`Decider.reason`; access-and-approvals 9.11 edited).
- Local runs, 7 Oct 2026: lint, typecheck, unit tests, integration tests (29 files, 388 tests, 18 s, so RR-196 needs nothing yet), module check, link check, format check, and the three journeys (`pnpm test:e2e`, about 2.2 min: the approval journey waits for a later authenticator step before each of the approver's seven codes).
- Outstanding (RR-350, product owner): CI on a pushed branch with the Playwright job and its artefacts, the review of the design edits and acceptance (section 15), Demo 1 on `dev`. Left to the orchestrator: AGENTS.md "Current state" and STATUS.md. RR-190 closed; RR-200 stays open until the `dev` measurement; RR-304's journey part is done, its hand check stays with T09. New follow-ups RR-351, RR-352.
- 7 Oct 2026: GitHub Actions "Code check" green on the pushed branch `s1/f01-first-access` (run 37603828723), including the browser journeys; the product owner reviewed the screenshots of the S1-F01 screens and approved them, with the design edits of the visual fixes (RR-304, RR-430 closed). Stays ready-for-human until Demo 1 on Railway `dev` after the merge (RR-350).
