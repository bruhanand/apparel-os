# Backup, restore and export

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

> **Draft — not yet approved.** Written 6 Oct 2026 on a side branch and brought into the docs unreviewed. Every engineering choice here is **Proposed** until the product owner approves it, when stage 1 reaches this design.

Status: **Draft**, 6 Oct 2026. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements these PRD sections: from AI, security and operational reliability, backup, restore verification and export recovery, recovery status for operators, and retention, deletion and legal holds; from Opening, closure, migration and export, the complete export in outline. It is GC-9 in [gaps-before-code.md](../../history/gaps-before-code.md) and the design of readiness item RR-010. It places the platform work of policy 18 that [module-map.md](../architecture/module-map.md) 11.2 leaves to GC-9.

- PRD IDs: `PRD-SEC-001`, `PRD-SEC-005`–`PRD-SEC-010`, `PRD-SEC-012`–`PRD-SEC-014`, `PRD-SEC-017`, `PRD-SEC-018`; `PRD-ACP-019`; `PRD-LIF-020`, `PRD-LIF-022`, `PRD-LIF-023`, `PRD-LIF-026`; `PRD-MOD-001`–`PRD-MOD-003`, `PRD-MOD-006`, `PRD-MOD-008`, `PRD-MOD-009`, `PRD-MOD-011`, `PRD-MOD-014`, `PRD-MOD-015`; `PRD-INT-002`, `PRD-INT-004`, `PRD-INT-006`–`PRD-INT-008`; `PRD-IMP-002`; `PRD-ACS-008`, `PRD-ACS-013`, `PRD-ACS-020`; `PRD-OFF-009`, `PRD-OFF-010`; `PRD-EXC-001`, `PRD-EXC-011`; `PRD-PRF-004`.
- Policies: 18 (`POL-18.01`–`POL-18.05`).
- Decisions: DEC-028, DEC-052, DEC-053, DEC-075, DEC-093, DEC-105, DEC-112.

Depends on: [deployment.md](deployment.md) (sections 1, 2, 4 and 9: environments, the bucket, the databases and roles, secrets; D-1, production hosting), [code-house-rules.md](code-house-rules.md) (3.1, 4.3, 5.1, 7.1, 8.1, 8.3: databases, the runner, roles, append-only guards, commands, no outside call in a transaction), [numbering-and-audit.md](numbering-and-audit.md) (3.6 and 3.7: series after a restore; 4.4 to 4.6: seals and retention), [imports-and-opening-data.md](imports-and-opening-data.md) (3.1, section 11 and 15.1: stored files, their hash and encryption), [access-and-approvals.md](../access/access-and-approvals.md) (2.3, 2.4, section 6 and 9.11: service identities, devices, keys outside the database, the setup step), [module-map.md](../architecture/module-map.md) (section 3, 4.1, 4.4 and section 5: tiers, contracts, the kernel operations view, `configuration`, `site-lifecycle`).

Used by: the stage 1 code of `S1-F14` in `kernel`, `files-imports`, `numbering`, `audit`, `access` and `configuration`; the production hosting design (D-1, RR-029); the stage 5 design of the complete export (`S5-F09`); the offline counter design (GC-8), for bills a restore did not see.

---

## 1. What this document fixes

- What a backup holds and how it is kept apart from the keys that open it (section 2; `PRD-SEC-012`, `POL-18.02`).
- The two kinds of backup, how database and files stay consistent, and which values set frequency and keeping (section 3; `POL-18.01`).
- How a backup is restored into a fresh target, held until it is validated, and reopened (section 4; `POL-18.03`, `POL-18.04`).
- The restore proof: what is checked after every restore (section 5; `PRD-ACP-019`), and the drill record (section 6).
- What stage 1 proves on `dev` with synthetic data, and what waits for production hosting (section 7).
- Retention, deletion and legal holds (section 8; `POL-18.05`, `PRD-SEC-009`; module-map MM-15).
- The complete export: its scope for `S5-F09` and what stage 1 needs now (section 9; `PRD-LIF-022`).
- The implementation units, their owners, commands and tables (sections 10 and 11), the tests `S1-F14` runs (section 12), and the edits this design asks of other documents (section 13).

It fixes no recovery target, backup frequency, backup keeping period, retention period, legal hold, restore operator, drill date or drill cadence. Those are KDPS's and the Admin's under policy 18, with the CA for legal retention; they stay OPEN with no default (section 14). Railway's capabilities are not verified here; every one this design leans on is an assumption to verify (RR-187; section 14.3). Labels (**Design choice**, **Proposed**, **OPEN**) mean what module-map section 1 says; every choice made here is **Proposed**.

## 2. What is backed up

### 2.1 The parts of a backup

A backup of an environment has these parts. **Proposed.**

| Part | What it holds | IDs |
| --- | --- | --- |
| The directory database | Each Organisation's code and where its database is; nothing else ([deployment.md](deployment.md) section 4) | DEC-093, `PRD-ACS-020` |
| Each Organisation database | All of that Organisation's records: masters, documents, movements, journals, approvals, audit and access records with their seals, stored-file records and attachments, the outbox and job rows, and `kernel.migration` | `PRD-MOD-001`, `PRD-SEC-012` |
| The file store | Every stored object of the bucket, already encrypted by the application ([imports-and-opening-data.md](imports-and-opening-data.md) section 11) | `PRD-IMP-002`, `POL-18.02` |
| The manifest | One per backup: what it holds and how to check it (3.2). No record data, no key | `PRD-SEC-012` |

- The unit of restore is one Organisation: its database, its objects in the file store and its keys. A whole environment is its directory plus every Organisation. One database per Organisation makes this possible (`PRD-MOD-001`). **Proposed.**
- So that one Organisation's objects can be found without reading its database, every object key in the file store starts with the Organisation's identifier. **Proposed** (GC9-10); it adds a rule to [imports-and-opening-data.md](imports-and-opening-data.md) 15.1, where the bucket key is fixed per stored file.

### 2.2 What a backup never holds

- No encryption key: neither an Organisation's data key nor the backup key (2.3). A backup and the key that opens it are never kept together (`PRD-SEC-006`, `POL-18.02`).
- No environment secret: database passwords, bucket credentials and the like stay in the environment's variables ([deployment.md](deployment.md) section 9).
- No plaintext of an encrypted field or file. Bank details, identity documents, salary and payroll data and authenticator secrets are encrypted before they reach PostgreSQL, and every stored file before it reaches the bucket (access-and-approvals section 6; imports-and-opening-data section 11). The backup copies them as they are.
- Logs. They are pino JSON on standard output (deployment section 9) and are not part of a backup (`PRD-SEC-014`).

### 2.3 Encryption and the keys kept apart

- **The backup is encrypted as a whole** (`POL-18.02`). The application backup of 3.2 encrypts each database dump and the manifest with a backup key before they leave the command, using authenticated encryption from Node's built-in crypto, so no dependency is added. File objects need no second layer: they are encrypted with the Organisation's key already. **Proposed.**
- **The backup key is not an Organisation key.** It opens backups only. An Organisation's data key opens its encrypted fields and files only. Holding one never gives the other. **Proposed.**
- **Key identifiers, not keys.** Every encrypted field and file records the identifier of the key version that encrypted it, and the manifest lists the identifiers each backup needs. A restore refuses before writing anything when a listed key version is not available (4.2). **Proposed.** It makes key rotation, which waits for production hosting (access-and-approvals section 6; D-1, RR-029), safe for old backups: a key version is kept while any backup still kept needs it.
- **Copies of the keys are kept apart.** On test hosting each key is an environment secret (access-and-approvals section 6). A copy of every key version is held by the product owner outside Railway, in a store that holds no backup and that Railway credentials do not open. **Proposed** (GC9-12). Losing every copy of a key loses every backup it opens, so the drill checks the copies too (section 6).
- Key storage, backup and rotation on production are designed with production hosting (D-1, RR-029; GC9-11).

## 3. Two kinds of backup

### 3.1 Platform backups

- On `kdps-test`, Railway's scheduled PostgreSQL backups are turned on, and one restore is practised before the go-live drill ([deployment.md](deployment.md) section 4; `POL-18.03`).
- What they hold, how often they run, how long they are kept, whether they are encrypted at rest, and whether one can be restored into a new service rather than over the old one, are Railway's. None is verified (GC9-A1 to GC9-A3). A platform backup is restored with the platform's own tools and then proved with the checks of 5.1, which need nothing from the backup itself.
- Platform backups do not hold the bucket. The file store is copied by the application backup (3.2) or by the means production hosting chooses.
- The test setup makes no recovery promise; the `POL-18.01` targets apply to production (deployment section 4; DEC-028). The earlier POS stays the system of record, and a PT file already loaded into it is that system's record, so losing test data loses nothing official (DEC-053).

### 3.2 The application backup

An application backup is the backup this design builds and proves in stage 1. It is portable: it restores into any PostgreSQL 17 server and S3-compatible store, so it does not depend on a provider's restore tools. **Proposed.**

1. **One snapshot per database.** For each database the backup command opens a repeatable-read, read-only transaction, exports its snapshot, and runs PostgreSQL's own dump tool on that snapshot. So the dump and everything else read in that transaction see the same committed state (PRD Stack: Database). **Proposed.**
2. **Control totals in the same snapshot.** In that transaction, each module that holds records computes its control totals through the restore contract (10.1): named counts and sums over its own tables, in a fixed order, money as integer paise (`PRD-MOD-014`), and Unknown values counted apart, never as zero (`PRD-MOD-015`). For example, journals and the debit and credit totals of each book; movements and quantities of the stock ledger; stored files and attachments; allocations and the highest sequence number of each series. **Proposed.**
3. **The latest audit seal** of the Organisation is read in the same snapshot ([numbering-and-audit.md](numbering-and-audit.md) 4.4).
4. **Encrypt and store.** Each dump is encrypted with the backup key (2.3) and written to the backup store, with its hash.
5. **Copy the file store** after every database snapshot is taken (3.3).
6. **Write the manifest**, encrypted with the backup key: the backup's identifier; the environment it came from; the code commit that took it; for each database, the snapshot time, the last migration applied and the hash of its encrypted dump; for each Organisation, its control totals, its latest seal, the list of stored-file keys its snapshot references, and the key identifiers its data needs. **Proposed.**
7. **Check the backup** before calling it complete: every stored-file key the snapshots reference is present in the backup store, and every dump decrypts and matches its hash. A backup that fails is kept with its failure and never offered for restore. **Proposed.**
8. **Record it.** After the backup is complete, the command appends a row to `kernel.backup_record` in each Organisation database it backed up (section 11), so the operations view can show the last good backup (`PRD-SEC-013`). The record of a backup is therefore in the next backup, not in its own. The directory database gets no such row: it holds only routing facts (DEC-093).

- The command reads every row, so it needs a role that row-level security does not filter. **Proposed** (GC9-7): it reads as the migration role, the owner, which row-level security does not filter because no table forces it ([code-house-rules.md](code-house-rules.md) 5.1). That adds a use to the list in code-house-rules 5.1. The alternative is a separate read-only role that bypasses row-level security, if Railway allows one to be created (GC9-A5).
- It is an operator command, like the setup step: never an API endpoint, never run by `app` or `worker`, and it holds credentials they do not hold (code-house-rules 4.3; access-and-approvals 9.11; DEC-112, CH-1). **Proposed.**

### 3.3 Database and files consistent

- A file is stored before the transaction that records it, never inside it (code-house-rules 8.3; `PRD-INT-006`). Its stored-file record is append-only and its object key is fixed ([imports-and-opening-data.md](imports-and-opening-data.md) 15.1; `PRD-MOD-011`). The application never overwrites or deletes an object. **Proposed** as a rule the file-store adapter enforces.
- So every stored-file record in a snapshot names an object that was already in the bucket when the snapshot was taken, and is still there unchanged. A copy of the bucket taken after the snapshots holds every object they reference. **Proposed:** the database snapshots come first, the file copy second (3.2).
- The copy may also hold objects no snapshot references: files stored after the snapshot, or by a transaction that rolled back. They are kept and listed, never deleted (section 8). After a restore they are reported in the drill record as objects with no record, with their store time, because one stored after the recovery point can be evidence of lost work (`POL-18.04`; 4.5).
- The copy is incremental: an object whose key is already in the backup store is not copied again, since keys are never reused for other content. Each copy is checked against the backup store's own object listing (GC9-A4).
- Whether the bucket can refuse overwrites and deletes by itself, through object versioning or object lock, is a Railway capability not verified (GC9-A4). The rule above does not depend on it.

### 3.4 Frequency and how long backups are kept

- **No value is set here.** How often backups run and how long each is kept follow from policy 18 and are KDPS's and the Admin's. Nothing has a default (DEC-105).
- **Production.** The recovery point and recovery time are the provisional targets of `POL-18.01`, subject to measured restore tests and KDPS's acceptance (V-12, RR-075). A backup taken now and then cannot meet a recovery point measured in minutes; production hosting needs continuous backup of each database and of the file store. How it is done is part of the production hosting design (D-1, RR-029; GC9-1).
- **How long backups are kept** is OPEN (GC9-2): KDPS Owner and Admin, with the CA where a backup outlives a record's retention period (8.4).
- **Test setup.** On `dev`, an application backup is taken on demand for each drill. On `kdps-test`, Railway's scheduled backups run with the options Railway offers (deployment section 4); an application backup there holds real KDPS data, so it is taken only after KDPS's agreement to real data (D-4, DEC-052) and is kept in the same hosting.
- **Drills.** The Admin conducts a restore drill before go-live and after major recovery changes; a quarterly drill after that is proposed and awaits KDPS Owner and Admin sign-off (`POL-18.03`, DEC-075). The restore operator, the pre-launch date and the cadence are OPEN (V-63, RR-123).

## 4. Restore

### 4.1 Into a fresh target

- A restore writes only into a fresh target: a PostgreSQL server with no Apparel OS database and an empty file store, with the migration and runtime roles created as the roles runbook says ([code-house-rules.md](code-house-rules.md) 5.1). It never writes over the source environment or into a database that already holds rows. **Proposed.** Switching traffic from the source to the restored target is a separate, recorded step after reopening (4.3).
- A backup restores only into the environment it came from: a `dev` backup into a `dev` target, a `kdps-test` backup into a `kdps-test` target. The two are never mixed ([deployment.md](deployment.md) section 1). The manifest names its environment and the restore compares it with the target's. **Proposed.**
- Restoring onto production hosting from test hosting is never a switch: a Store switches only on production hosting, at its own switch count (`PRD-LIF-026`, DEC-028).

### 4.2 Steps

The restore command is an operator command, like the backup command (3.2). It writes each step with its start and end time to the drill record (section 6) as it goes. **Proposed.**

1. **Check before writing.** The manifest decrypts with the backup key; its environment matches the target's (4.1); the target is fresh (4.1); every key version it lists is available (2.3); the running code holds every migration the backup had applied. A backup taken by newer code is refused; older code's backup is restored, then migrated forward in step 3. Any failure stops the restore with nothing written.
2. **Restore the databases.** The directory database first when the whole environment is restored, then each Organisation database, from the dumps, as the migration role into databases it creates. Each dump's hash is checked before it is read.
3. **Apply the runner's database step and migrate.** The runner applies the database-level privileges to each restored database, as it does on every run and as the test helper does for copies ([code-house-rules.md](code-house-rules.md) 4.3, 11.3), then checks the recorded checksums and applies any newer migration.
4. **Point the directory at the target.** Where a restored Organisation's database is now found elsewhere, its directory entry in the target is written or changed to the new place, and the change is written to the drill record.
5. **Copy the file objects** of each restored Organisation into the target's file store.
6. **Place the recovery hold** on each restored Organisation before any request reaches it (4.3).
7. **Run the restore participants** of section 10.1, in tier order: `access` ends sessions (4.4); `numbering` pauses every series (5.3); `files-imports` checks every stored file and attachment (5.1); every module that holds records checks its references and computes its control totals (5.1, 5.2); `audit` verifies the seal chain (5.4) and then records the outcome of every step as audit records under the restore's internal service identity (access-and-approvals 2.3; `PRD-SEC-018`).
8. **Report.** The drill record lists each check with its result, and the operations view shows the Organisation as restored and held (`PRD-SEC-013`).

Steps 1 to 8 run without people. What follows needs authorised people (4.3): reconciling series and other recovery gaps, validating, and reopening.

### 4.3 Recovery hold and reopening

- **The hold.** A restored Organisation is held: `kernel`'s command runner refuses every command except sign-in, session and access commands (revocations included, 4.4), reading, and the recovery commands below. A refused command names the hold as its reason. Jobs and outbox delivery wait too, except the participants' own steps. **Proposed**, implementing `POL-18.03`: Operations and Accounts validate stock, bills and financial totals before reopening.
- **Recovery commands** belong to `configuration`, which owns availability and calls `audit` (module-map 4.4). Each runs as the acting user under Authorise and writes its audit record (`PRD-ACS-013`, `PRD-INT-004`). **Proposed** (GC9-8):
  - **Reconcile a series** after a restore, with its evidence (5.3). `configuration` calls `numbering`; module-map 4.4 does not list that call yet (section 13).
  - **Record a validation**: one by Operations and one by Accounts, each saying which of stock, bills and financial totals it compared, against what, and with what evidence (`POL-18.03`). Which of the three each validates is not split here; the policy names both.
  - **Reopen**: refused until both validations are recorded and every recovery gap (4.5) is reconciled or raised as an exception. Reopening lifts the hold and records the time, which ends the measured recovery time (section 6).
- **Who** holds the restore operator's role, the two validations and reopening is KDPS's. Whether one person holding both the Operations and the Accounts persona may record both validations, and who may reopen, are OPEN (GC9-6; V-63). On `dev` the drill uses synthetic users and labelled synthetic role assignments.
- **Series stay paused after reopening** until each is reconciled. A document that needs a paused series stays unavailable, and Allocate refuses it ([numbering-and-audit.md](numbering-and-audit.md) 3.2).
- **Policy gates still apply.** Reopening switches on no policy-dependent operation: the availability check answers as it did before the restore (`PRD-SEC-017`).

### 4.4 Sessions, devices and service identities

- **Sessions.** A restore can bring back a session that was ended or revoked after the recovery point. So `access` ends every session of a restored Organisation, and everyone signs in again with the second factor (`PRD-SEC-001`, `PRD-SEC-008`). **Proposed.**
- **Revocations after the recovery point** of a device, a user or a service identity are lost with everything else after it. Before reopening, the restore operator applies again each revocation known from outside evidence, such as the incident record. Whether every outside service credential is replaced after every restore is OPEN (GC9-15).
- **Devices.** A restored server never lets a device continue a cloned or restored identity (`PRD-OFF-010`). How an offline counter's queued bills and series meet a restored server is the offline counter design (GC-8; `PRD-OFF-009`).

### 4.5 Outside systems and the recovery gap

- **The recovery gap** is the work done after the recovery point that the restored database does not hold. It is reconciled against counter, provider and Tally records; no transaction is silently lost or duplicated (`POL-18.04`).
- **Held outside deliveries.** No outbox row is delivered while the hold is on (4.3). After reopening, rows bound for a module inside the Organisation are delivered as usual; their consumers are idempotent on the event's identity, so a delivery made again changes nothing (`PRD-INT-008`). Rows bound for an outside system (Tally, GST, bank, messaging) stay undelivered until their outcome is reconciled with that system, because a delivery the restored database thinks pending may already have reached it after the recovery point (`PRD-INT-006`, `PRD-INT-007`). **Proposed.**
- **Repeated requests.** An idempotency key recorded after the recovery point is lost, so a client repeating that request runs it again; its first effect was lost too (`PRD-INT-002`). An offline bill uploaded again is matched by its device and number (GC-8; `PRD-OFF-009`).
- **Each gap is an exception.** A piece of outside evidence that the restored records cannot explain becomes an exception with an owner and evidence (`PRD-EXC-001`; access-and-approvals section 12), raised by the module that owns the matching record through its restore participant. **Proposed.**
- **Stage 1 sources.** In stage 1 the only gap sources are the number series (5.3) and objects in the file store with no record (3.3). Later designs add theirs through the restore contract: the offline counter's queues (GC-8, stage 4), card and UPI providers and IRN (stage 4), bank and Tally (stage 5).

## 5. The restore proof

### 5.1 Checks on every restore

These checks run on every restored Organisation, from an application backup or a platform backup alike. **Proposed.**

| Check | What passes | IDs |
| --- | --- | --- |
| Stored files | Every stored-file record names an object in the restored file store; the object decrypts with the key version it names; the hash of the plaintext equals the record's content hash, which was taken before encryption ([imports-and-opening-data.md](imports-and-opening-data.md) 3.1) | `PRD-IMP-002`, `PRD-ACP-019` |
| Attachments | Every attachment opens from its record: read through `files-imports` as a synthetic reader authorised for that record, it returns those bytes; a reader outside the record's scope is refused | `PRD-SEC-005`, `PRD-ACP-019` |
| Links inside a module | Every foreign key holds: the dump tool creates foreign keys after loading rows, so PostgreSQL checks every row again | `PRD-ACP-019` |
| Links across modules | No foreign key crosses schemas (code-house-rules 3.2), so each module checks, through the other module's interface, that every reference it holds to another module's record resolves | `PRD-MOD-002`, `PRD-ACP-019` |
| Numbering | Every series is paused (5.3) | `POL-18.04` |
| Audit | The seal chain verifies (5.4) | `PRD-SEC-007` |
| Module invariants | Each module's own checks: for example every journal balances, and stock balances equal the sum of their movements (stock-ledger 11.7) | `PRD-ACP-019` |
| Objects with no record | Listed with their store time; kept | `POL-18.04`, `POL-18.05` |

A failed check is shown in the drill record and the operations view, and the Organisation stays held. A check is never skipped to let a restore pass.

### 5.2 Comparison with the backup's control totals

- For an application backup, each module computes its control totals on the restored database with the same function that computed them in the backup's snapshot (3.2). Every total must be equal. **Proposed.**
- For a platform backup there are no snapshot totals. The proof then rests on 5.1 and on the recovery gap (4.5), and the drill record says that no comparison was possible (`PRD-PRF-004`).

### 5.3 Number series

- After a restore every series is paused until it is reconciled against the counters' records and other evidence. Its next number is then set past the highest number known to be issued, and the skip is recorded with its reason ([numbering-and-audit.md](numbering-and-audit.md) 3.6; `POL-18.04`). This design runs it, as that section says.
- **Pause.** `numbering`'s restore participant pauses every open series and writes a series event for each (numbering-and-audit 6.1). It needs no caller from the owning module. **Proposed**, adding a row to numbering-and-audit 3.7 (section 13).
- **Reconcile.** An authorised person records, for one series, the evidence of the highest number issued: printed or uploaded bills, the counters' records, or a statement that no document left the system, with its reason. `numbering` sets the next number past the higher of that number and the highest allocation in the restored database, records the skip and the reason as the series event "reconciled after a restore", and releases the series. **Proposed** (4.3).
- A number is never given twice, including after a restore (`PRD-ACP-019`, `PRD-LIF-020`). A reconciliation never lowers a series' next number.
- **Import batch codes** come from a PostgreSQL sequence that `files-imports` keeps itself ([imports-and-opening-data.md](imports-and-opening-data.md) 15.1). After a restore that sequence restarts from the snapshot, so a code given after the recovery point could be given again, against `PRD-ACP-019`. **Proposed** (GC9-9): batch codes come from a `numbering` series, so they are paused and reconciled like any other. Until it is decided, the restore participant of `files-imports` reports the clash and keeps import intake under the hold.

### 5.4 Audit seals

- `audit`'s restore participant recomputes the seal chain over every sealed block and reports any difference ([numbering-and-audit.md](numbering-and-audit.md) 4.4; `PRD-SEC-007`).
- For an application backup it also checks that the chain ends at the latest seal the manifest holds (3.2). The manifest is kept apart from the database and encrypted, so a chain rebuilt over altered rows would not end at that seal. **Proposed.**
- Rows recorded after the last seal are sealed by the sealing job after reopening, as usual.

## 6. The restore drill record

Every restore, drill or real, produces a drill record. **Proposed.**

- **Who and when:** the drill's purpose (a drill, or a real restore and its cause); who conducted it, and for a go-live drill the Admin who conducts it (`POL-18.03`); the restore operator; the backup used and its recovery point; the start and end time of every step of 4.2; the time each validation was recorded and by whom; the time of reopening.
- **Measured times:** recovery time, from the start of the restore, or for a real failure from the time it was declared, to reopening; and the data lost, from the recovery point to the time the failure was declared. On production they are compared with the `POL-18.01` targets; on the test setup they are measured, not promised (deployment section 4).
- **Results:** every check of 5.1 and 5.2 with its result and counts; every recovery gap and how it was settled; each series reconciled, with its skip and reason; the key versions used, and confirmation that each came from its kept copy (2.3).
- **Where it is kept:** the restore command writes it as a structured file and a readable text, both kept beside the backup and handed to the person who conducted the drill. It is the evidence for the stage 1 exit check (`S1-F14`; [stage 1](../../plan/stage-1/README.md) exit checklist 7.1) and for the Admin's drills. The restored database also keeps the restore's history in `kernel.recovery_event` (section 11) and in its audit records (5.4).
- A drill record holds no record data, no restricted value and no secret (`PRD-SEC-014`).

## 7. Stage 1 on `dev`, and what waits for production

| Proved in stage 1 on synthetic data | Waits for production hosting (D-1, RR-029) or for KDPS |
| --- | --- |
| On `dev`, a synthetic Organisation with records from the stage 1 features (masters, access changes, imports with stored files and attachments, exceptions with evidence, number series, books and journals, stock movements) is backed up and restored into a fresh target (4.1); the proof of section 5 passes; series stay paused until reconciled; seals verify; the drill record exists (`S1-F14`) | Backup method and frequency that meet the `POL-18.01` targets once KDPS accepts them (V-12, RR-075; GC9-1) |
| The same, in CI, on real PostgreSQL through Testcontainers with a MinIO file store (code-house-rules 10.1; the tests of section 12) | Key storage, copies and rotation on production (RR-029; GC9-11) |
| Nothing is deleted while no retention period is set (8.2) | Retention periods and legal holds (V-13, RR-076); backup keeping (GC9-2) |
| The recovery hold, the validations and reopening, with synthetic users | The restore operator, the pre-launch drill date and cadence (V-63, RR-123); who validates and reopens (GC9-6) |
| — | The Admin's restore drill before go-live, on production (`POL-18.03`, RR-188) |

- **Fresh target on `dev`.** The drill restores into a temporary target holding only that drill's synthetic data: a separate PostgreSQL service and a separate bucket, with an `app` instance pointed at them so files are opened through the application. Whether this is a temporary Railway environment or extra services inside `dev` depends on what Railway allows (GC9-A6). It is removed after the drill record is kept; it is a copy of synthetic data, not a record. **Proposed.**
- **`kdps-test`.** Railway's scheduled backups and one practised restore (deployment section 4). Real data there needs KDPS's agreement (D-4, DEC-052), and a restore of it stays inside `kdps-test`.
- **Stage 1 exit** needs this design approved and the drill record on `dev` ([stage 1](../../plan/stage-1/README.md) exit checklist 7.1). Live use in stage 1 needs policy 18 Signed with its values validated (RR-075, RR-076, RR-123; stage 1 exit checklist 7.4).

## 8. Retention, deletion and legal holds

### 8.1 Retention schedules

- Retention is set by record class, including financial, stock, employee, customer and audit records, and validated against legal retention requirements (`POL-18.05`). The periods are OPEN (V-13, RR-076; KDPS Owner, Admin, CA). Nothing has a default (DEC-105).
- A retention schedule is a setting in `configuration`, versioned like any setting (module-map 11.2). It names a record class and, once KDPS sets it, its period and the date the period counts from. **Proposed.**
- Each module declares which of its record types belong to which class. A record type that belongs to no declared class is never deleted. **Proposed.**
- Customer consent and notices are designed with the stage 4 counter, and employee data with the stage 6 HR design (module-map MM-15, DEC-105; `PRD-SEC-009`, `PRD-SEC-010`).

### 8.2 Deletion

- **Nothing is deleted while no retention period is set** for its class (`POL-18.05`; [numbering-and-audit.md](numbering-and-audit.md) 4.6). Nothing is deleted under a legal hold (8.3).
- Deletion after retention runs only through a named retention function of the module that owns the records. The trigger on an append-only table admits that function alone ([code-house-rules.md](code-house-rules.md) 7.1; `PRD-MOD-011`). For audit and access records the function is designed: one sealed block at a time, recorded (numbering-and-audit 4.6).
- For every other class the owning module designs its function before a period for that class is enabled, including how its totals stay explainable once old rows are gone. OPEN (GC9-14); it blocks only the first deletion in that class.
- Retiring demo or synthetic data never deletes real business records (`PRD-LIF-023`). A synthetic Organisation on `dev` is a separate database; removing it is not retention.
- A restore deletes nothing, and objects in the file store with no record are kept (3.3).

### 8.3 Legal holds

- A legal hold overrides routine deletion (`POL-18.05`, `PRD-SEC-009`).
- A hold is a record in `configuration`: what it covers (record classes, and a legal entity, Site, party, date range or named records), its reason, who placed it and when; and, once released, who released it, when and why. A hold takes effect when it is placed. Every retention function checks holds before it deletes and skips what any hold covers. **Proposed.**
- Which records are under a legal hold today is KDPS's, with the CA (V-13; KDPS Owner question 7, CA question 12). Who may place and release a hold, and whether a release needs a different authorised person, are OPEN (GC9-4).
- Holds are built before the first retention deletion can be enabled, together with the schedules (section 10.2).

### 8.4 Backups, restores and retention

- A record deleted under retention stays in every backup taken before its deletion until that backup expires. So how long backups are kept (GC9-2) bounds how long a deleted record can still be recovered. The CA confirms that this is acceptable for each class (GC9-2). A backup is never edited to remove a record.
- A restore brings back records deleted after the recovery point. Retention runs again once the Organisation reopens, and deletes them again where their period has passed. While the hold is on, no retention function runs. **Proposed.**
- A legal hold placed after the recovery point is lost with everything else after it. Before reopening, the restore operator places it again from outside evidence; the reopen command asks for confirmation that this was done. **Proposed.**

## 9. The complete export

### 9.1 What stage 5 builds

The complete export is built in stage 5 by `site-lifecycle`, with closure and relocation (`S5-F09`; module-map section 5). This section sets its scope; the stage 5 design sets the rest (GC9-13).

- **What it holds:** masters, documents, lines, stock and accounting movements, attachments, mappings and audit history, with relationships that can be rebuilt and totals that reconcile (`PRD-LIF-022`).
- **Identities kept:** every record keeps its UUIDv7 identifier and its business code, and references stay as identifiers, so the relationships rebuild. An export never gives a code to a new record and never reuses one (`PRD-ACP-019`).
- **Versions kept:** effective-dated versions with their dates, and the version each transaction used.
- **Attachments** with the content hash of each file, so the receiver can check every file.
- **Control totals** computed by the system, not copied from any source file, stated in a manifest beside row counts and file hashes (`PRD-LIF-022`). KDPS's own files disagree with their totals in many places ([prd-fit.md](../../data-notes/prd-fit.md) 3.3).
- **Access:** an export is restricted to the data the exporter may see (`PRD-EXC-011`, `PRD-SEC-005`). A restricted field the exporter's assignment does not grant is left out, and the manifest says which classes were left out (`PRD-ACS-008`). An export that includes any restricted field writes an access record ([numbering-and-audit.md](numbering-and-audit.md) 5.1; `PRD-SEC-007`).
- **Open for stage 5:** its scopes (whole Organisation, legal entity, Site at closure), its file format, how the package is protected in transit and at rest, and who may run it (GC9-13).

### 9.2 What stage 1 needs

- Every record keeps its identifier and business code, and nothing reuses one, including after a restore (5.3; `PRD-MOD-008`).
- Each module computes named control totals over its own records (10.1). Stage 5 reuses the same definitions where the export's totals are the same, read through declared read models (`PRD-MOD-003`). **Proposed.**
- Nothing else of the export is built in stage 1.

## 10. Implementation units

### 10.1 The restore contract

- `kernel` sits at tier 0 and calls no module above it (module-map section 3). So `kernel` defines a restore contract and each module that holds records implements it and registers it at start, as a target module registers an import handler (module-map section 3, rule 6). **Proposed.**
- A participant may offer:
  - **control totals**: named counts and sums over its own tables, read in the transaction context it is given, never in one it opens itself (3.2, 5.2; `PRD-MOD-006`);
  - **after-restore steps** it runs before reopening (4.2, step 7), under the restore's internal service identity (`PRD-SEC-018`);
  - **checks**: of its own invariants and of the references it holds to other modules (5.1);
  - **gap checks**: evidence from outside the database that it compares with its records, raising an exception for each gap (4.5).
- `kernel` runs participants in tier order and passes their results to `audit`'s participant, which runs last and records them (4.2).

### 10.2 Units by module

| Module | Builds in stage 1 (`S1-F14`) | IDs |
| --- | --- | --- |
| `kernel` · operations | The backup and restore commands (3.2, 4.2); the restore contract and its registry (10.1); the recovery hold in the command runner (4.3); `kernel.backup_record` and `kernel.recovery_event` (section 11); the drill record (section 6); backup and recovery status in the operations view (module-map 4.1) | `PRD-SEC-012`, `PRD-SEC-013` |
| `files-imports` | The file-store copy (3.3) and the write-once rule of its adapter; its participant: every stored file and attachment checked (5.1), objects with no record listed (3.3), its control totals | `PRD-IMP-002`, `PRD-ACP-019` |
| `numbering` | Its participant: every series paused (5.3); the reconcile-after-restore operation; its control totals | `POL-18.04` |
| `audit` | Its participant: the seal chain checked against the manifest's seal (5.4); the restore's audit records; its control totals | `PRD-SEC-007` |
| `access` | Its participant: every session ended (4.4) | `PRD-SEC-008` |
| `configuration` | The recovery commands: reconcile a series, record a validation, reopen (4.3); retention schedules with no values, and the rule that nothing is deleted without one (8.1, 8.2) | `POL-18.03`, `POL-18.05` |
| Every other module holding records in stage 1 (`organisation`, `merchandise`, `exceptions`, `finance` · books, `stock` · ledger) | Its participant: control totals and checks (5.1, 5.2) | `PRD-ACP-019` |

- Legal holds (8.3) and the retention functions of classes other than audit (8.2) are built before the first deletion can be enabled, not in `S1-F14`. **Proposed.**
- `site-lifecycle` builds the complete export in stage 5 (section 9).

### 10.3 Commands and jobs

| What | Kind | Runs as | When |
| --- | --- | --- | --- |
| Take an application backup (3.2) | Operator command; never an API endpoint | The migration role (GC9-7), with the backup store's and the file store's credentials | On demand for each drill on `dev`; on production as its hosting design says (GC9-1) |
| Restore into a fresh target (4.2) | Operator command; never an API endpoint | The migration role in the target; the restore's internal service identity for participant steps | On demand |
| Recovery commands (4.3) | Ordinary commands of `configuration` | The acting user, under Authorise | While held |
| Seal audit blocks | The existing sealing job (numbering-and-audit 4.4) | `worker` | As now; again after reopening |

- The two operator commands are added to the "Code workspace" table of `AGENTS.md` when they are built, with their names; their names are not fixed here. They run inside the environment's private network, where the databases are reachable; how they are run there on Railway is not verified (GC9-A5).
- Nothing in either command calls an outside system inside a database transaction (code-house-rules 8.3; `PRD-INT-006`).

## 11. Tables

Every table has a UUIDv7 primary key and an entry in its set's table register (code-house-rules 3.2). **Proposed** throughout; other columns are left to reviewed migrations.

| Schema | Table | Class | Constraints |
| --- | --- | --- | --- |
| `kernel` (Organisation set) | `backup_record` | `unscoped`: technical rows only `kernel` reads; this section is the reason | append-only: backup identifier, snapshot time, result, manifest hash |
| `kernel` (Organisation set) | `recovery_event` | `unscoped`, as above | append-only: restored from which backup and recovery point; hold placed; each participant's result; hold lifted |
| `kernel` (Organisation set) | `recovery_hold` | `unscoped`, as above | projection of `recovery_event`; at most one row |
| `configuration` | `retention_schedule` + versions | `unscoped`: Organisation-wide settings, guarded by Authorise | one in force per record class; no row until KDPS sets a period |
| `configuration` | `legal_hold`, `legal_hold_release` | `unscoped`, as above | append-only; a release names its hold, once |
| `configuration` | `recovery_validation` | `unscoped`, as above | append-only: Operations or Accounts, what was compared, evidence, the restore it validates |

- The rows of `backup_record` and `recovery_event` are written by the operator commands as the migration role, as the runner writes `kernel.migration` (code-house-rules 4.3); every other row is written by a command as the runtime role.
- The directory database gets no new table (DEC-093).
- Times are event time, recording time and, where a person acts, business date (`PRD-MOD-009`).

## 12. Tests on synthetic data

All data is labelled synthetic and never becomes a default (`AGENTS.md`: "Never invent a value"). Tests run against real PostgreSQL through Testcontainers with a MinIO file store, with the two synthetic Organisations of code-house-rules 11.2. Test 1 also runs on `dev` as the drill whose record is the stage 1 exit evidence.

| # | Test | IDs |
| --- | --- | --- |
| 1 | **Stage 1 exit check.** A synthetic Organisation with linked records across the stage 1 modules and attachments is backed up and restored into a fresh target; every check of 5.1 passes; every control total of 5.2 is equal; the drill record holds the steps with start and end times, who conducted it and every result | `PRD-SEC-012`, `PRD-ACP-019`, `POL-18.03` |
| 2 | After a restore, every stored file matches its hash and every attachment opens from its record for an authorised reader; a reader outside the record's scope is refused (imports-and-opening-data 17 test 23) | `PRD-IMP-002`, `PRD-SEC-005` |
| 3 | A restored object that is missing, altered, or encrypted with another key fails the file check, is named in the drill record, and the Organisation stays held | `PRD-ACP-019` |
| 4 | After a restore every series is paused and Allocate refuses it; a reconciliation sets the next number past both the evidence and the highest restored allocation, records the skip and reason, and never lowers it; no number is given twice (numbering-and-audit 7 test 7) | `POL-18.04`, `PRD-ACP-019` |
| 5 | The restored seal chain verifies and ends at the manifest's seal; a sealed row altered in the backup copy is reported (numbering-and-audit 7 test 10) | `PRD-SEC-007` |
| 6 | Nothing is deleted while no retention period is set: across backup, restore and reopening, every append-only table keeps its rows and the file store keeps every object, including objects with no record (numbering-and-audit 7 test 14) | `POL-18.05` |
| 7 | A backup taken while synthetic commands keep writing has control totals equal to its own dump, because both come from one snapshot | `PRD-ACP-019` |
| 8 | A dangling reference across modules, made in a backup copy, is reported by the owning module's check | `PRD-MOD-002`, `PRD-ACP-019` |
| 9 | Under the hold every business command is refused with the hold as its reason; sign-in, reading and the recovery commands work; reopening is refused until both validations are recorded and every gap is reconciled or raised | `POL-18.03`, `POL-18.04` |
| 10 | Every session that existed in the backup is ended after the restore | `PRD-SEC-008` |
| 11 | The restore refuses, before writing anything: a target that is not fresh, the source itself, a backup from another environment, a backup whose key versions are missing, and a backup taken by newer code | `PRD-ACP-019` |
| 12 | The backup holds no plaintext of an encrypted field or a stored file, the dumps and manifest are encrypted, and no key is in the backup, the manifest or the drill record | `POL-18.02`, `PRD-SEC-006` |
| 13 | Restoring one Organisation writes nothing into the other's databases or objects, and each sees only its own records afterwards | `PRD-MOD-001`, `PRD-ACS-020` |
| 14 | No outbox row is delivered while the hold is on; after reopening, a row bound for a module inside is delivered and a repeat changes nothing, and a row bound for an outside system stays undelivered until its outcome is reconciled | `PRD-INT-006`, `PRD-INT-008` |
| 15 | The backup and restore commands cannot be reached through the API, and the runtime role cannot run them | `PRD-SEC-018` |
| 16 | Backup and recovery status shows to an authorised operator and to nobody else | `PRD-SEC-013`, `PRD-SEC-005` |
| 17 | Logs and the drill record of a backup and a restore hold no secret and no restricted value | `PRD-SEC-014` |
| 18 | An import batch code given after the recovery point is not given again after the restore (GC9-9) | `PRD-ACP-019` |

## 13. Edits this design asks of other documents

These follow only if the proposals are approved, with GC-9 and the edits it causes elsewhere. None is made here.

| Document | Edit | Proposal |
| --- | --- | --- |
| [module-map.md](../architecture/module-map.md) 4.1 | The operations view shows backup and recovery status; `kernel` holds the restore contract and the recovery hold | 4.3, 10.1 |
| module-map 4.4 | `configuration` uses `numbering` for the reconcile-after-restore call, and holds retention schedules, legal holds and recovery validations | GC9-8 |
| [numbering-and-audit.md](numbering-and-audit.md) 3.7 | A row for "pause every series after a restore" and one for "reconcile after a restore" | 5.3 |
| [imports-and-opening-data.md](imports-and-opening-data.md) 15.1 | Object keys start with the Organisation's identifier; objects are never overwritten or deleted; batch codes from a `numbering` series | GC9-10, 3.3, GC9-9 |
| [code-house-rules.md](code-house-rules.md) 5.1 | The migration role is also used by the backup and restore commands, or a read-only backup role is added | GC9-7 |
| [access-and-approvals.md](../access/access-and-approvals.md) 2.3 and 9.11 | The restore's internal service identity, created with the Organisation | 4.2 |
| [deployment.md](deployment.md) section 4 | A pointer to this design for the file-store backup and the drill | 3.1 |

## 14. Open questions and assumptions

Nothing below has a default. Questions already open elsewhere are pointed to, not repeated: the recovery targets (V-12, `POL-18.01`, RR-075); retention periods and current legal holds (V-13, `POL-18.05`, RR-076); the restore operator, the pre-launch drill date and the drill cadence (V-63, `POL-18.03`, DEC-075, RR-123); production hosting (D-1, RR-029); KDPS's agreement to real data on the test setup (D-4, DEC-052); offline bills after a restore (GC-8).

### 14.1 Open questions

| # | Question | Kind | Who decides | Blocks | Impact |
| --- | --- | --- | --- | --- | --- |
| GC9-1 | How production backs up each database and the file store continuously enough to meet the `POL-18.01` targets once KDPS accepts them (3.4) | Technical | Product owner, in the production hosting design (D-1) | Live S1; the first Store switch (`PRD-LIF-026`) | Whether the recovery point can be met |
| GC9-2 | How long backups are kept on each environment, and whether that is acceptable for each record class once its retention period is set (3.4, 8.4) | Business | KDPS Owner, Admin; CA for legal retention | Live S1 | How long a deleted record can still be recovered |
| GC9-3 | Whether the backup store must sit with another provider or region from the source on production (2.3, 3.2) | Technical | Product owner (D-1) | Live S1 | Whether one provider's failure can lose both |
| GC9-4 | Who may place and release a legal hold, and whether a release needs a different authorised person (8.3) | Business | KDPS Owner, CA | The first retention deletion | Who controls holds |
| GC9-5 | Whether a Site's or legal entity's records can be restored alone, apart from the Organisation (2.1) | Business | Product owner; KDPS Owner | — (the Organisation is the unit until decided) | Partial restores |
| GC9-6 | Who records the Operations and the Accounts validations, whether they must be two different people when one person holds both personas, and who may reopen (4.3) | Business | KDPS Owner, Admin | Live S1 (go-live drill) | Who can put a restored Organisation back in service |
| GC9-7 | **Proposed:** the backup and restore commands read and write as the migration role; or a separate read-only backup role that bypasses row-level security (3.2) | Technical | Product owner, at approval | Code: S1-F14 | Least privilege for backups |
| GC9-8 | **Proposed:** the recovery commands sit in `configuration`, with a listed call to `numbering` (4.3) | Technical | Design review, at approval | Code: S1-F14 | Module boundaries |
| GC9-9 | **Proposed:** import batch codes come from a `numbering` series, so a restore cannot give one twice (5.3) | Technical | Product owner, at approval | Accept: S1-F14 | `PRD-ACP-019` for batch codes |
| GC9-10 | **Proposed:** object keys in the file store start with the Organisation's identifier (2.1) | Technical | Product owner, at approval | Code: S1-F06, before the first stored file | Restoring and exporting one Organisation's files |
| GC9-11 | Key storage, copies and rotation on production (2.3) | Technical | Product owner (D-1, RR-029) | Live S1 | Whether old backups stay readable |
| GC9-12 | **Proposed:** on test hosting the product owner keeps a copy of every key version outside Railway, apart from the backups (2.3) | Technical | Product owner | Exit S1 (the drill checks the copies) | Whether a lost secret loses the backups |
| GC9-13 | The complete export's scopes, file format, package protection and who may run it (9.1) | Business and technical | Product owner, in the stage 5 design; KDPS Owner for who may run it | Design: S5-F09 | The export |
| GC9-14 | How each record class other than audit is deleted after retention, and how its totals stay explainable (8.2) | Technical | The owning module's design | The first deletion in that class | Retention beyond audit |
| GC9-15 | Whether every outside service credential is replaced after a restore, or only the revocations known from outside evidence are applied again (4.4) | Technical (security) | Product owner | Live S1 | What a restore can bring back |

### 14.2 Proposed choices at a glance

Each is **Proposed** where it is written; this list helps the approval find them.

- The Organisation as the unit of restore (2.1); object keys by Organisation (GC9-10).
- Backups encrypted as a whole with a backup key apart from Organisation keys; key identifiers recorded; copies of keys kept apart (2.3; GC9-12).
- The application backup: one exported snapshot per database, control totals and the latest seal in that snapshot, an encrypted manifest, a completeness check, and `kernel.backup_record` (3.2); read as the migration role (GC9-7).
- Database snapshots first, file copy second; the file-store adapter never overwrites or deletes; objects with no record kept and listed (3.3).
- Restore only into a fresh target of the same environment; refusals before writing; the steps of 4.2.
- The recovery hold, and the recovery commands in `configuration` (4.3; GC9-8).
- Every session ended after a restore (4.4); outside deliveries held until reconciled; each unexplained gap an exception (4.5).
- The checks of 5.1, the control-total comparison of 5.2, the pause and reconcile steps of 5.3, batch codes from `numbering` (GC9-9), and the manifest's seal check of 5.4.
- The drill record and what it holds (section 6); the temporary drill target on `dev` (section 7).
- Retention schedules and legal holds in `configuration`; record types mapped to classes; retention paused under the hold; holds placed again after a restore (section 8).
- The restore contract (10.1), the units by module (10.2), the commands (10.3) and the tables (section 11).

### 14.3 Assumptions to verify

None of these is verified. Each is checked on Railway before the drill on `dev` and recorded with RR-187; if one fails, the part that rests on it is redesigned at approval or later.

| # | Assumption | Rests on it | Blocks |
| --- | --- | --- | --- |
| GC9-A1 | Railway's scheduled PostgreSQL backups are available on the plan in use, with frequency and keeping that can be chosen, for the PostgreSQL major version the tests pin (code-house-rules CH-2, DEC-112) | 3.1 | Accept: the practised restore on `kdps-test` |
| GC9-A2 | A Railway PostgreSQL backup can be restored into a new service, not only over the one it came from; and whether point-in-time recovery exists | 3.1, GC9-1 | Accept: the practised restore on `kdps-test` |
| GC9-A3 | Railway encrypts its PostgreSQL backups at rest | 3.1, `POL-18.02` | Live: `kdps-test` with real data |
| GC9-A4 | A second Railway bucket can be created whose credentials `app` and `worker` do not hold; objects can be listed and copied between buckets; and whether object versioning or object lock exists | 3.2, 3.3 | Exit S1 (the drill) |
| GC9-A5 | A one-off command can run inside an environment's private network with PostgreSQL 17 client tools; and whether a non-superuser role can be given the right to bypass row-level security | 3.2, 10.3, GC9-7 | Exit S1 (the drill) |
| GC9-A6 | A temporary environment, or extra services inside `dev`, can be created for a drill and removed after it | Section 7 | Exit S1 (the drill) |
