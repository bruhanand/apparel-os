# S1-F14-T05 — The restore's check of user and service-identity references

Status: in-progress
Blocked by: S1-F14-T03 (done; the restore's checks run through the registry)
Feature: [S1-F14 Backup, restore and export proof](../../spec.md)

## Build

The restore check that every column naming a user or a service identity names one the restored database holds ([backup-and-restore.md](../../../../design/platform/backup-and-restore.md) (GC-9) 5.1, 10.4 "Not checked as references yet"; `PRD-ACP-019`). Product owner, 20 Oct 2026 (RR-535): built before the stage 1 exit. This is not the key-recovery ticket RR-530 once named `S1-F14-T05`; that command is deferred to before the first production backup.

- **Actor references** (10.4): a participant declares each column of its tables that names a user or a service identity (`actor_id`, `received_by_id`, `attached_by_id` and the like), with the column that says which kind it is where the table has one (`actor_kind`, `received_by_kind`, `attached_by_kind`). `access` answers for both kinds: its users (`access.app_user`) and its service identities (`access.service_identity`).
- **The check** (5.1): where the kind is kept, a user's identifier must name a user and a service identity's a service identity, and any other kind fails; where it is not, the identifier must name one or the other. A table with no participant answering for users and service identities fails the check; it is never skipped. Counts and the column's name only (`PRD-SEC-014`).
- **Every such column is declared**: a column named `actor_id` or ending in `_by_id` that a participant neither declares as an actor reference nor covers otherwise fails a test, so a later table cannot add one unchecked.
- **Out of scope** (RR-535): audit and access records' `record_id` stay proved by the seal chain (5.4); outbox subjects, version identifiers and later stages' source documents are checked by the participant that adds each, from stage 2 on.

## Expected outputs

- The contract's actor references, declared by `kernel`, `access`, `audit`, `exceptions` and `files-imports` for their columns
- Tests on real PostgreSQL: the checks pass on both synthetic Organisations as backed up; a dangling actor and a kind that names the other table each fail

## Done when

- Every column naming a user or a service identity in the Organisation database is checked by the restore and the recheck, and a test fails when one is added undeclared
- An identifier no user or service identity holds, or one of the wrong kind, fails its check with its count
- The design's 10.4 bullet says what is built; RR-535 is closed
