# S1-F14-T04 — Restore drill on dev

Status: blocked
Blocked by: S1-F14-T03; Railway set-up and deploys authorised by the product owner; the `dev` backup-key custodian named by the product owner
Feature: [S1-F14 Backup, restore and export proof](../../spec.md)

## Build

The restore drill whose record is the evidence for stage 1 exit check 4, "A backup restores with linked records and attachments" ([stage 1 README](../../README.md) 7.1; [backup-and-restore.md](../../../../design/platform/backup-and-restore.md) (GC-9) sections 6 and 7; `PRD-SEC-012`, `POL-18.03`).

- **GC-9 test 1 in CI**: a synthetic Organisation with linked records across the stage 1 modules and attachments is backed up and restored into a fresh target on real PostgreSQL and MinIO; every check of 5.1 passes; every control total of 5.2 is equal; the drill record holds every step with its start and end time, who conducted it and every result.
- **Before the drill on `dev`**: verify on Railway, and record with RR-187, the assumptions the drill rests on (14.3): GC9-A4 (a second bucket whose credentials `app` and `worker` do not hold; objects listed and copied between buckets), GC9-A5 (a one-off command inside the private network with PostgreSQL 17 client tools) and GC9-A6 (a temporary target can be created and removed). Set the backup key as a `dev` secret; the named custodian keeps its copy outside Railway, apart from every backup (2.3, GC9-12).
- **The drill on `dev`** (section 7): a synthetic Organisation holding records from the stage 1 features (masters, access changes, imports with stored files and attachments, exceptions with evidence, number series, books and journals, stock movements) is backed up and restored into a temporary fresh target: its own PostgreSQL service and bucket, with an `app` instance pointed at them so files open through the application. Synthetic Operations and Accounts users record their validations; series are reconciled; the Organisation is reopened.
- **The drill record** (section 6; RR-188): steps with start and end times; who conducted it; every check and control total with its result; every stored file matching its hash and opening from its record (imports-and-opening-data 17 test 23); every series paused until reconciled (numbering-and-audit 7 test 7); the seal chain verified to the manifest's seal; the key versions used, each confirmed as coming from its kept copy; the measured recovery time, measured and not promised (deployment.md section 4). It is kept and handed to the product owner.
- **Afterwards**: the temporary target is removed once the record is kept; it held a copy of synthetic data only.

## Expected outputs

- GC-9 test 1 in CI
- The Railway assumptions verified and recorded; the drill record on `dev`

## Done when

- GC-9 12 test 1 passes in CI and on `dev`
- The drill record exists with everything section 6 lists, and the product owner accepts it as the evidence for stage 1 exit check 4

## Notes

- The CI run of test 1 needs no Railway step and may be built first; the ticket stays blocked until the drill on `dev` can run.
- If a Railway assumption fails, the part of GC-9 that rests on it is redesigned with the product owner before the drill.
- Live, not exit: the Admin's restore drill on production before go-live, with Operations and Accounts validating totals (`POL-18.03`; RR-123, RR-188); the recovery targets (RR-075); production key custody by the KDPS Owner and Admin under policy 18; GC9-A1 to GC9-A3 for `kdps-test`.
