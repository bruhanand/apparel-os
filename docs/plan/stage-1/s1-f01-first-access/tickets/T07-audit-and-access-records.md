# S1-F01-T07 — Audit and access records

Status: done
Blocked by: T03 (done)
Feature: [S1-F01 First access](../spec.md)

## Build

The `audit` schema: records partitioned by recording month, the append-only trigger with deletion only through the retention function (which deletes nothing while no period is set), Record, Record access, Read history within scope, the sealing job and seal check (numbering-and-audit 4); the partition maintenance and how far ahead it reaches, specified with this first `audit` migration (`DEC-112`, house rules CH-5)

## Expected outputs

`audit` module; tests

## Done when

numbering-and-audit 7 tests 8 to 11 and 14 pass; test 12 passes once T11 lands

## Notes

- An earlier start (branch `worktree-agent-a9ac93afd7240845d`) held only a `zod` dependency in `apps/server/package.json`; it was dropped. Start fresh.
- RR-210: the audit record's before and after values must exclude password hashes and session identifier hashes; fix numbering-and-audit 4.1 and 4.3 with the code.
- The catalogue test of house rules 10.4 has no task yet; it belongs with the first task that adds a business table (this one, or T04 if it lands first).
- Built on branch `s1/f01-t07`, commit `S1-F01-T07: audit and access records`. The `audit` module (`apps/server/src/modules/audit`), migration `0003__audit__audit_and_access_records.sql`, the set's `maintenance.sql` run by the runner on every migration run, and `apps/server/test/audit.int.test.ts`. numbering-and-audit 7 tests 8 to 11, 13 and 14 pass; test 12 waits for the read policy of T11 (RR-242).
- RR-210 done: numbering-and-audit 4.1 and 4.3 now exclude password, session identifier and credential hashes. Numbering-and-audit 4.4 to 4.6 and code-house-rules 3.2, 4.1, 4.3, 5.2 and CH-5 record the block, sealing, partition and retention mechanisms.
- The catalogue test of house rules 10.4 now checks `scoped` tables, the append-only guards (partitions included), partitioning, the functions granted to the runtime role and the audit Drizzle definitions.
- Follow-ups: RR-240 (scheduled maintenance between deploys), RR-241 (worker schedules sealing, seal check and coverage alert; T06), RR-242 (read policy; T11), RR-243 (brand sets; CH-6).

