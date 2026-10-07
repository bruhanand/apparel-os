# S1-F01-T24 — Worker retries, history upkeep and the test Organisations

Status: done
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

- **Provisional retry default** (RR-270 part; `PRD-SEC-013`; `DEC-118`; code-house-rules 12.9, CH-10). For transient failures, five attempts in all (`retries` 4), with increasing delays (`retryBackoff`) and jitter, written only in the labelled synthetic worker settings of local work, tests and the `dev` proposal, never as a default in application code and never as a KDPS value. If pg-boss's backoff adds no jitter, the worker adds it to each delay. A missing setting still stops the worker at start (code-house-rules 12.14). Failed jobs stay failed and visible, and nothing deletes them (CH-9).
- **History upkeep** (RR-240; `PRD-SEC-007`, `PRD-SEC-013`, `PRD-MOD-011`; `DEC-118`; numbering-and-audit 4.4; code-house-rules 3.2, 5.2, 12.9, CH-5). A new job kind `audit.ensure-partitions`, sent by the worker for each Organisation the directory lists under the `audit-jobs` service identity, at the interval of its worker setting, independent of deploys. A reviewed migration makes `audit.ensure_partitions` a `SECURITY DEFINER` function owned by the migration role with its own `search_path`, and grants `EXECUTE` on it alone to the runtime role. It only creates missing partitions of the coming months; it never drops, detaches or deletes a partition or a row. A failed run fails its job, which stays visible, and logs `audit-partitions-upkeep-failed`; the coverage check is unchanged. The setup step writes `audit-jobs` the action it needs. The interval stays **OPEN** (RR-270): the synthetic settings of tests and local work carry a labelled synthetic interval only.
- **The test Organisations** (RR-330; `PRD-ACS-023`; `DEC-118`; code-house-rules 11.2; access-and-approvals 9.11). `pnpm seed` initialises `syn_org_a` and `syn_org_b` through the setup step itself, each with its own first Admin and its own first approver (four different synthetic people), and labelled synthetic settings, including every required security setting. The temporary passwords are synthetic test values, never logged or echoed, given as the setup step allows (typed at a prompt, or from a git-ignored or labelled synthetic fixture file) and never committed in plain text. A finished Organisation is left as it is; a rerun changes nothing. Update the `AGENTS.md` "Code workspace" row of `pnpm seed`, which says it writes no other row.
- **Sealing interval:** not set here. The intervals of `audit.seal-closed-block`, `audit.check-seals`, `audit.check-partition-coverage` and `audit.ensure-partitions` stay **OPEN**, owner the product owner (RR-270).

## Expected outputs

Worker registry and settings schema changes in `apps/server`; a reviewed `audit` migration; the synthetic worker settings of tests, the browser server and local work; the seed moved onto the setup step; `AGENTS.md` seed row; tests.

## Done when

- A unit test: the worker settings schema accepts the synthetic retry settings and refuses a job kind without them; no retry value appears in application code.
- An integration test: a job failing transiently is attempted five times with growing, jittered delays and then stays failed and listed; a defect is not retried.
- An integration test: `audit.ensure-partitions` run by the worker as the runtime role creates next months' partitions; the runtime role still cannot create, drop or detach a partition directly; a forced failure leaves the job failed and visible and deletes nothing; numbering-and-audit 7 tests 9, 10 and 14 still pass.
- An integration test of the seed: both Organisations are listed, each with a first Admin and a first approver who are different people, and each first user can sign in; a second run changes nothing; it still refuses outside `local` and `dev`.
- The full check set is green.

## Notes

- Built (7 Oct 2026, branch `s1/f01-t24`, commit 4e9b4e1). The worker timings of `DEC-119` (product owner, 7 Oct 2026) were applied with the retries of `DEC-118`: 10 s first delay, 300 s per attempt, poll 5 s, sealing 900 s, the seal check, the coverage check and the upkeep 3600 s, all only in the labelled synthetic settings (`apps/server/test/fixtures/worker-settings.ts`, and `SYNTHETIC-worker-settings.local.json` for local work). Tests shorten only their waits, never the attempts. pg-boss 12.35.1's backoff already draws a random jitter, so the worker adds none (code-house-rules 12.9).
- Upkeep: job kind `audit.ensure-partitions` (create on `audit.audit_partition`, which the permission registry now declares), migration `0019__audit__scheduled_partition_upkeep.sql` (the existing function made `SECURITY DEFINER`, `EXECUTE` to the runtime role, its queue). Tests: `test/partition-upkeep.int.test.ts`; the retries and a step whose commit landed before its time limit, in `test/worker.int.test.ts`; the settings, in `test/fixtures/worker-settings.test.ts`.
- Seed: `pnpm seed` now runs the setup step for both synthetic Organisations and needs `AOS_RUNTIME_DATABASE_URL` and `AOS_SEED_FIRST_USERS_FILE` (`SYNTHETIC-<name>.secrets.json`, ignored by the repository). A directory listing a seed code without a finished setup, left by an earlier seed, is refused: drop those local databases once.
- RR-270 closed; RR-390 (the grants rebuild's interval) opened. Renumbered 0018 to 0019 on merging after `S1-F01-T22`.
- Second S1-F01 review fixes (branch `s1/f01-review-fixes-2`): migration `0021__audit__partition_upkeep_hardening.sql` sets `audit.ensure_partitions`'s search path to `pg_catalog, pg_temp` and serialises concurrent runs with a transaction advisory lock (`test/partition-upkeep.int.test.ts`).
