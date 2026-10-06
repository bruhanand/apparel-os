# S1-F14-T03 — Restore into a fresh target

Status: blocked
Blocked by: S1-F14-T02
Feature: [S1-F14 Backup, restore and export proof](../../spec.md)

## Build

A backup restored into a fresh target, proved, held until two people validate it, then reopened, with series paused until reconciled ([backup-and-restore.md](../../../../design/platform/backup-and-restore.md) (GC-9) sections 4 to 6, 8.1, 8.2, 10 and 11).

- **The restore command** (4.1, 4.2, 10.3): an operator command, never an API endpoint. Step 1 refuses before writing anything: a manifest that does not decrypt, a backup from another environment, a target that is not fresh (or is the source), a listed key version not available, a backup taken by newer code. Then: each database restored from its dump after its hash is checked, the directory first when the whole environment is restored; the runner's database privilege step and any newer migration (code-house-rules 4.3); the directory pointed at the target, the change recorded; the Organisation's file objects copied into the target's store; the recovery hold placed before any request reaches it; the participants run in tier order; the report.
- **Participants' after-restore steps** (4.2 step 7, 10.1, 10.2), under the restore's internal service identity, created with the Organisation (access-and-approvals 2.3, 9.11; `PRD-SEC-018`): `access` ends every session (4.4; `PRD-SEC-008`); `numbering` pauses every series with a series event, import batch code series included (5.3, GC9-9); `files-imports` checks that every stored file's object exists, decrypts with the key version it names and hashes to its content hash, opens every attachment as a synthetic reader authorised for its record and is refused for one outside it, and lists objects with no record with their store time, keeping them (5.1, 3.3); every module runs its checks of S1-F14-T02 and compares its control totals with the manifest's (5.2); `audit` recomputes the seal chain, checks it ends at the manifest's latest seal (5.4), then records every step's outcome as audit records. A failed check is never skipped: the Organisation stays held.
- **The recovery hold** (4.3, 4.5; `POL-18.03`, `POL-18.04`): `kernel`'s command runner refuses every command except sign-in, session and access commands, reading and the recovery commands, naming the hold; jobs and outbox delivery wait. After reopening, rows bound for a module inside are delivered (consumers idempotent, `PRD-INT-008`); rows bound for an outside system stay undelivered until their outcome is reconciled (`PRD-INT-006`).
- **Recovery commands** (4.3, 5.3; where GC9-8 places them): reconcile a series with its evidence, setting the next number past both the evidence and the highest restored allocation, recording the skip and reason, never lowering it; record a validation, one by Operations and one by Accounts, saying what was compared against what with what evidence; reopen, refused until both validations are recorded and every recovery gap is reconciled or raised as an exception, asking confirmation that revocations and legal holds known from outside evidence were placed again (4.4, 8.4). Each runs as the acting user under Authorise with its audit record.
- **Tables** (section 11): `kernel.recovery_event` and `kernel.recovery_hold`; `configuration.recovery_validation`; `configuration.retention_schedule` with versions and no rows, so nothing is deleted (8.1, 8.2; `POL-18.05`).
- **The drill record** (section 6): written by the restore command as a structured file and a readable text beside the backup: purpose, who conducted it, the backup and its recovery point, each step's start and end time, each check with its result and counts, each recovery gap and how it was settled, each series reconciled, the key versions used and whether each came from its kept copy, validations and reopening with their times. It holds no record data, no restricted value and no secret (`PRD-SEC-014`).
- **Recovery status** in the operations view, for authorised operators only (`PRD-SEC-013`).
- **Code workspace**: the restore command's name and what it does are added to the "Code workspace" table of `AGENTS.md`.

## Expected outputs

- The restore command; the after-restore steps of each participant; the recovery hold; the recovery commands and their tables; the drill record; recovery status
- Tests in CI against real PostgreSQL and MinIO, with the two synthetic Organisations

## Done when

- GC-9 12 tests 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17 and 18 pass
- imports-and-opening-data 17 test 23 passes (it is GC-9 test 2)
- numbering-and-audit 7 tests 7, 10 and 14 pass in their restore form (GC-9 tests 4, 5 and 6)

## Notes

- The largest ticket of this feature. If it does not fit one working session, stop and ask the product owner to split it (the hold, the recovery commands and reopening, with tests 9 and 14, would go apart); never drop a check to make it fit.
- GC9-6 (who validates and who reopens) and GC9-15 (outside credentials after a restore) stay open; tests use synthetic users with labelled synthetic role assignments.
- Legal holds and the retention functions of classes other than audit are built before the first deletion can be enabled, not here (8.3, 10.2).
