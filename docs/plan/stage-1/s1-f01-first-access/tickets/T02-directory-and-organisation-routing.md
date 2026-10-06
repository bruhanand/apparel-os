# S1-F01-T02 — Directory and Organisation routing

Status: done
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

The directory database and its migration; resolution by Organisation code at sign-in and from the session afterwards; a pool per Organisation database; the generic refusal for an unknown code (`DEC-093`, `PRD-MOD-001`); `pnpm migrate`, directory-only since `S0-T05`, switched to `migrateAll` over every Organisation the directory lists

## Expected outputs

Kernel routing code; integration tests

## Done when

Two synthetic Organisations route to their own databases; the directory holds only codes and locations; an unknown code leaves only a service-log line without the typed values; the command test shows `pnpm migrate` migrating the directory and both synthetic Organisation databases, and stopping at the first that fails; access-and-approvals 15 test 3d passes once T08 adds sessions

## Notes

- Done: commit `fc62efb`, 6 Oct 2026. `kernel/routing/`, `kernel/db/directory.ts`, `migrate-all.ts`, migration `directory/0002__kernel__directory_entry.sql`. Test 3d waits for T08 (sessions).
- RR-195 (the seed refuses a non-synthetic directory) was done here.
