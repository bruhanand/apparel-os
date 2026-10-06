# S1-F14-T02 — Backup

Status: blocked
Blocked by: S1-F14-T01 (GC-9 approved, GC9-7 settled); S1-F06-T05 (stored files and attachments under the Organisation's prefix, which the backup copies); S1-F06-T01 (import batches); S1-F08-T01 (number series)
Feature: [S1-F14 Backup, restore and export proof](../../spec.md)

## Build

The application backup: one consistent, encrypted, self-checked copy of each database and the file store, with control totals a restore can be compared against ([backup-and-restore.md](../../../../design/platform/backup-and-restore.md) (GC-9) sections 2 and 3, 10.1 to 10.3, section 11).

- **The restore contract** (10.1): `kernel` defines it and keeps its registry; each module that holds records registers a participant at start. This ticket builds the two parts that read: **control totals** (named counts and sums over the module's own tables, in a fixed order, read in the transaction context it is given; money in paise, Unknown counted apart, never as zero; `PRD-MOD-014`, `PRD-MOD-015`) and **checks** (its own invariants, and that every reference it holds to another module's record resolves through that module's interface; `PRD-MOD-002`). Participants for every module that holds records when this ticket is built: `organisation`, `merchandise`, `exceptions`, `finance` · books, `stock` · ledger, `files-imports`, `numbering`, `audit`, `access` (10.2).
- **Key identifiers** (2.3): every encrypted field and stored file records the identifier of the key version that encrypted it, where an earlier ticket did not; the manifest lists the identifiers each Organisation's data needs. The backup key is its own key, an environment secret, never an Organisation key.
- **The backup command** (3.2, 10.3; `PRD-SEC-012`, `POL-18.02`): an operator command, never an API endpoint and never run by `app` or `worker`, reading as the role GC9-7 settles. For each database it opens a repeatable-read, read-only transaction, exports its snapshot and runs PostgreSQL's dump tool on it; in the same snapshot it computes every participant's control totals and reads the latest audit seal. Each dump is encrypted with the backup key (authenticated encryption from Node's built-in crypto) and stored with its hash. The file store is copied after every snapshot, incrementally, and checked against the backup store's listing (3.3). The manifest (3.2 step 6), encrypted, holds no record data and no key.
- **Complete or failed** (3.2 steps 7 and 8): a backup is complete only when every stored-file key the snapshots reference is in the backup store and every dump decrypts and matches its hash; a failed one is kept with its failure and never offered for restore. After completion `kernel.backup_record` (append-only) gains a row in each Organisation database backed up; the directory database gets none (`DEC-093`).
- **Backup status** in the operations view, for authorised operators (`PRD-SEC-013`).
- **Code workspace**: the command's name and what it does are added to the "Code workspace" table of `AGENTS.md` (10.3).

## Expected outputs

- The restore contract and registry in `kernel`; control totals and checks in each module that holds records
- The backup command, the manifest, `kernel.backup_record`; backup status in the operations view; tests

## Done when

- GC-9 12 test 7 passes
- The backup halves of GC-9 tests 12, 15 and 17 pass (each passes whole in S1-F14-T03, once the restore and its drill record exist): the dumps and manifest are encrypted and hold no plaintext of an encrypted field or file and no key; the backup command cannot be reached through the API and the runtime role cannot run it; its logs hold no secret and no restricted value
- A backup missing a referenced object, or with a dump that fails its hash, is recorded as failed and is not offered for restore
- Each participant's checks pass on the synthetic Organisations used by the tests, both of them, against real PostgreSQL and MinIO

## Notes

- The operations view comes from S1-F08-T04; if it is not built yet, backup status waits for it.
- A module that starts holding records after this ticket registers its own participant in its own ticket.
- Running on `dev` is S1-F14-T04.
