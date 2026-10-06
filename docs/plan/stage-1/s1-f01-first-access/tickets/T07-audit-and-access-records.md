# S1-F01-T07 — Audit and access records

Status: ready-for-agent
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
