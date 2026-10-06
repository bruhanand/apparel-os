# S1-F01-T18 — History screens

Status: done
Blocked by: T07, T11, T14
Feature: [S1-F01 First access](../spec.md)

## Build

History of a record or an actor within scope; the access history report of stage 1 ([phases.md](../../../../phases.md) stage 1 "Reports"); masked restricted values; as-of time

## Expected outputs

Screens

## Done when

Covered by the journeys of T20

## Notes

- Built 7 Oct 2026 on `s1/f01-t18`. Server: four reads served by `access` (`readRecordHistory`, `readActorHistory`, `readAccessHistory`, `readSensitiveAccessHistory` in `packages/schemas`), rows through `audit` (`readHistory` now paged, new `readAccessHistory`), each row shown through one assignment, restricted values masked server side, 100-row pages with a cursor and the as-of time (numbering-and-audit 4.5 "The reads, as built"). Routes on scoped record types declare `authorisedIn: 'command'` (RR-296 closed). Web: Setup › Audit log (Changes, Sign-ins, Sensitive access) and `RecordHistory` / `ActorHistory` / `AccessHistory` for record drawers. No migration.
- Tests: `apps/server/test/history.int.test.ts`; `apps/web/src/history/history.test.tsx`. The browser journey that reads history is T20's.
- Follow-ups: RR-310 (time zone shown), RR-311 (Authorise per row on volume), RR-312 (T16 drawers embed `RecordHistory`), RR-313 (device access records screen).
