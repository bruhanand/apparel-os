# Document numbering and audit history

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Current**, 3 Oct 2026. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements these PRD sections: Module and data boundaries (numbering, audit, business codes); from People, access and approvals, the audit record; from AI, security and operational reliability, the access record; from Counter sales and payments and Offline counter, the device bill series. It is GC-5 in [gaps-before-code.md](../../reports/gaps-before-code.md). The two shared modules it details, `numbering` and `audit`, sit at tier 1 of [module-map.md](../architecture/module-map.md) section 2.

- PRD IDs: `PRD-MOD-004`, `PRD-MOD-008`–`PRD-MOD-011`; `PRD-ACS-008`, `PRD-ACS-013`, `PRD-ACS-014`; `PRD-SEC-005`–`PRD-SEC-007`, `PRD-SEC-012`, `PRD-SEC-014`, `PRD-SEC-018`; `PRD-INT-002`–`PRD-INT-004`; `PRD-POS-016`, `PRD-POS-020`; `PRD-OFF-002`, `PRD-OFF-007`, `PRD-OFF-009`, `PRD-OFF-010`, `PRD-OFF-012`; `PRD-LIF-015`, `PRD-LIF-020`; `PRD-TRF-023`; `PRD-ACP-019`.
- Policies: 10 (`POL-10.07`, `POL-10.11`), 18 (`POL-18.01`, `POL-18.04`, `POL-18.05`).
- Decisions: DEC-005, DEC-093, DEC-097, DEC-105.

Depends on: [module-map.md](../architecture/module-map.md) (4.5 and 4.6: owners and operations), [domain-model.md](../architecture/domain-model.md) (3.4 and 3.5: the records), [stock-ledger.md](../stock/stock-ledger.md) (10.2 and 10.3: one transaction, the series row locked last), [access-and-approvals.md](../access/access-and-approvals.md) (GC-3: actors, scope, restricted fields, sign-in), [structure-and-masters.md](../masters/structure-and-masters.md) (2.1: master codes).

Used by: every module that numbers a document or records a change; the offline counter design (GC-8) and the backup and restore design (GC-9); the stage 1 code of `numbering` and `audit`.

---

## 1. What this document fixes

- Business codes for documents (`PRD-MOD-008`). Master codes are in [structure-and-masters.md](../masters/structure-and-masters.md) 2.1.
- Number series: what a series is, how a number is given, the bill series per billing device, tax registration and financial year, and how formats are set (`PRD-MOD-004`, `PRD-POS-020`).
- The audit record and the access record: what they hold, when they are written, how they are protected and read (`PRD-ACS-013`, `PRD-SEC-007`).
- The tables of `numbering` and `audit` (section 6).

It fixes no number format, no financial-year date and no retention period. Labels (**Design choice**, **Proposed**, **OPEN**) mean what module-map section 1 says.

## 2. Business codes

- Every record has a UUIDv7 identifier. A record people refer to also has a business code, unique in a stated scope; a name is a label (`PRD-MOD-008`).
- A document's business code is the number its series gives it (section 3). It is unique in its series, and its text is unique in the scope its owner names for display; for a bill, that is its tax registration and financial year (3.5). **Design choice.**
- A code is never reused, including after closure, restore or export (`PRD-ACP-019`, `PRD-LIF-020`). A cancelled or reversed document keeps its number.
- The Organisation types master codes ([structure-and-masters.md](../masters/structure-and-masters.md) 2.1), or may draw them from a series it defines for that kind of master. **Design choice.**

## 3. Number series

### 3.1 What a series is

- A series gives numbers for one document kind in one scope ([domain-model.md](../architecture/domain-model.md) 3.5). It is identified by the kind, an opaque scope key that the owning module supplies after validating the scope, and the financial year where the kind restarts each year (module-map section 3, rule 6).
- The owning module declares each kind it numbers: whether it restarts each financial year, what its scope key stands for, and its display scope (3.5). **Design choice.**
- A series is Open, Paused or Closed (the state names of DEC-105, DM-4; [design-language.md](../ui/design-language.md) section 7). Closed is final: a closed series is never reopened or continued (`PRD-LIF-015`, `PRD-OFF-010`). An open or paused series is live, and one kind, scope and year has at most one live series (`PRD-POS-020`).
- `numbering` calls no other module (module-map 4.6).

### 3.2 Giving a number

- Allocate runs inside the owning module's transaction. The command has already locked every series it draws from, last, in its lock phase (stock-ledger 10.3, step 8; [code-house-rules.md](code-house-rules.md) 8.2): `numbering` offers the series rows as lock targets. Allocate takes the next sequence number from a series the transaction holds, records the allocation and returns the formatted number. It refuses a series the transaction has not locked. The number commits with its document, or neither does (`PRD-INT-004`; stock-ledger 10.2).
- So an online series has no gaps: a transaction that rolls back never gave its number away. **Design choice**, following from `PRD-INT-004`.
- Allocate refuses when no open series exists for the kind, scope and year, or the series is paused or closed.
- Each allocation records the series, the sequence number, the formatted text, the document kind and reference, and the time. A replayed command returns its first result, with the same number (`PRD-INT-002`).
- A reprint keeps the same number and identity (`PRD-POS-016`).
- The series row is held only until the commit, and each billing device has its own series, so counters never wait for each other's bill numbers (`PRD-POS-020`; stock-ledger 10.3). A sale's journals draw on its book's journal series, which every posting in the book shares; that wait is books-and-posting GC4-4.

### 3.3 Financial year

- A kind that restarts each financial year has one series per year. The year is the one the document's business date falls in, under the Organisation's timezone (`PRD-MOD-009`). **Design choice** of using the business date.
- The financial year's start and end are an Organisation setting with no default. OPEN (GC5-1).
- The owning module defines the next year's series before the year starts, so the first document of a year never waits. An offline counter receives its next series while online, since series are allocated online (GC-8; `PRD-OFF-002`). **Design choice.**

### 3.4 Bill series per billing device

- Each billing device has its own bill series per tax registration and financial year, online or offline. Two live devices never share a series (`PRD-POS-020`, `PRD-OFF-002`, DEC-005).
- `pos` defines the series. Its scope key stands for the device and the tax registration (module-map 4.6 and 4.17).
- A Store's switch starts a fresh series (`PRD-LIF-015`). A replaced device starts a fresh series once its old queue is reconciled (`PRD-OFF-010`). The old series is closed and never continued.
- Offline, the counter advances its series in the same local transaction as the bill (`PRD-OFF-007`). On upload, `pos` records the numbers already used, and the central series keeps them as allocations. A number already recorded with another document is a conflict, kept in the reconciliation queue and never discarded (`PRD-OFF-009`). Pause and release use the financial year and the next sequence number (`PRD-OFF-012`). The offline counter design (GC-8) details the rest.

### 3.5 Formats

- A format turns a sequence number into the text people see. It is made of fixed text, a part taken from the series' scope (such as the device code), the financial-year label, and the sequence number at a set width. **Design choice** of the parts.
- A series keeps one format for its life. A new format applies only to series defined after it, so printed numbers never change style partway through a series. **Design choice.**
- A format is refused if it could give the same text to two series in the same display scope. For bills that scope is the tax registration and financial year, so a bill format must carry a part taken from the device. The database also keeps formatted numbers unique in that scope. **Design choice.**
- The bill-number format is set per Organisation within the statutory limit (`PRD-POS-020`), and the CA confirms it for each tax registration (`POL-10.07`). It is OPEN (V-40; Accounts, CA; stage 4). The longest number a format can produce must fit the limit the CA confirms.
- Formats of other statutory documents are OPEN (GC5-2).
- The Organisation chooses the formats of other documents, as it chooses codes. No format has a default. Tests use labelled synthetic formats, such as the labelled sample in [design-language.md](../ui/design-language.md) section 8.

### 3.6 After a restore

- A restore may lose the latest allocations while their documents, such as printed bills, exist outside the database (`POL-18.01`).
- So after a restore every series is paused until it is reconciled against the counters' records and other evidence. Its next number is then set past the highest number known to be issued, and the skip is recorded with its reason (`POL-18.04`, `PRD-ACP-019`). **Design choice.** The backup and restore design (GC-9) runs it.

### 3.7 Interface

The operations of module-map 4.6, made concrete, with Pause, release, close and Record used numbers added (**Design choice**; module-map 4.6 lists them):

| Operation | Called by | Returns or does | Refuses when |
| --- | --- | --- | --- |
| Define a series | The owning module, after validating the scope | A series for a kind, scope key and year, with its format | An open or paused series already exists for that kind, scope and year; the format fails 3.5 |
| Allocate | The owning module, inside its transaction | The next number and its text | No open series; the series is paused or closed |
| Pause, release, close | The owning module | Changes the state; close is final | The series is closed |
| Record used numbers | `pos`, on an offline upload | Keeps numbers the device already used as allocations | A number is already recorded with another document |
| Read series state | `pos` | The financial year and the next sequence number (`PRD-OFF-012`) | — |

## 4. The audit record

### 4.1 What it holds

| Field | What it is | IDs |
| --- | --- | --- |
| Actor | The user or service identity. For a job carrying out a person's decision, also the person on whose behalf it acts | `PRD-ACS-013`, `PRD-SEC-018`; GC-3 2.3 |
| Assignment | The role assignment Authorise used | GC-3 7.1 |
| Times | Event time, recording time and business date | `PRD-MOD-009` |
| Scope | The legal entity, Site, Store, business unit and brand of the record, as it carries them | `PRD-ACS-013`; GC-3 5.3 |
| Record | Module, record type, identifier and version | `PRD-ACS-013` |
| Operation | What was done | — |
| Before and after | The changed fields only; restricted values as 4.3 says | `PRD-ACS-013` |
| Reason | The reason given, where one is asked | `PRD-ACS-013` |
| Source | Screen, import batch and row, job, adapter or device | `PRD-ACS-013` |
| Approval evidence | The approval decision, and its use when a job posted the document | `PRD-ACS-013`; GC-3 9.8 |
| Request | The idempotency key and the correlation identifier | `PRD-INT-002`, `PRD-SEC-014` |

### 4.2 When it is written

- Every change made through a module's interface writes an audit record in the same transaction. It commits with the change, or neither does (`PRD-INT-004`). **Design choice:** every change, so nobody judges case by case which change is important enough.
- Reads are not audited, except sensitive access (5.1).
- The audit record is not the business history. Corrections, reversals and lifecycle changes are their own records in the owning module (`PRD-ACS-014`, `PRD-MOD-011`).

### 4.3 Restricted values

- An encrypted value (bank details, identity documents, salary and payroll data, an authenticator secret) is never copied into an audit record. The record says the field changed and names the versions of the owning record that held the old and the new value, as supplier bank details are versioned ([structure-and-masters.md](../masters/structure-and-masters.md) 5.1). Where the owning record keeps no earlier version, such as a replaced authenticator secret, the record says so. **Design choice.**
- Other restricted values (cost, margin, customer contact, employee photos, location evidence) are kept and shown only under field permissions (`PRD-ACS-008`; module-map 4.5).

### 4.4 Protection

- Append-only. The runtime role may insert and read audit rows, never update or delete them. A trigger refuses every update, and allows a delete only through the retention function (4.6) (`PRD-SEC-007`, `PRD-MOD-011`). **Design choice.**
- Sealing. A job seals each closed block of audit and access records: it hashes the block's rows together with the previous seal and stores the result. A check recomputes the chain and reports any difference. Seals go into backups and exports. **Design choice:** sealing after the fact keeps business transactions free of a shared lock.
- The tables are partitioned by recording month. **Design choice.**

### 4.5 Reading history

- The history of a record, or of an actor, is read inside the reader's scope. Audit rows carry the record's scope facts, and row-level security applies (`PRD-SEC-005`; GC-3 7.2). Restricted values follow field permissions (`PRD-ACS-008`).
- A read model serves the stage 1 report "access and audit history" ([phases.md](../../phases.md), stage 1).

### 4.6 Retention

- Retention is set by record class, including audit records, and checked against legal requirements (`POL-18.05`). The periods are OPEN (V-13; KDPS Owner, Admin, CA; stage 1 live use). Until they are set, nothing is deleted.
- A legal hold overrides routine deletion (`POL-18.05`).
- Deletion after retention runs only through the retention function, one sealed block at a time, and records which block went, when and under which schedule. **Design choice.**
- Retention, deletion and legal holds are designed with backup, restore and export (GC-9). Customer consent and notices are designed with the stage 4 counter, and employee data with the stage 6 HR design (DEC-105, module-map MM-15). **Design choice.**

## 5. The access record

### 5.1 Kinds

The access record logs sign-ins, permission changes and sensitive access (`PRD-SEC-007`):

- sign-in attempts and their outcome; sign-out; a session locked, ended or revoked;
- enrolment and reset of the second factor; password changes and resets;
- device registration and revocation;
- permission changes, each pointing to its audit record ([access-and-approvals.md](../access/access-and-approvals.md) 9.11);
- sensitive access: showing an encrypted field unmasked, and an export that includes any restricted field. **Design choice.**

### 5.2 What each holds

- The user, or for a failed sign-in the user only when the login matched one; the Organisation; the time; the outcome; the device where registered; the network address; for sensitive access, the record, the field class and whether it was shown or exported.
- Never the password, the authenticator code, or a typed login that matched no user (`PRD-SEC-014`).
- An attempt with an unknown Organisation code has no Organisation to write to; it goes only to the service log ([access-and-approvals.md](../access/access-and-approvals.md) 3.1).
- Protection, sealing, reading and retention are as for the audit record (4.4 to 4.6).

## 6. Tables

Every table has a UUIDv7 primary key. Each module owns one PostgreSQL schema ([structure-and-masters.md](../masters/structure-and-masters.md) 2.5). **Design choice** throughout; other columns are left to reviewed migrations.

### 6.1 Schema `numbering`
<!-- deps: PRD-POS-020, PRD-OFF-002, PRD-OFF-010, PRD-LIF-015, PRD-INT-004, PRD-MOD-008, PRD-ACP-019 — table list for the series records of section 3 -->

| Table | Unique | Other constraints |
| --- | --- | --- |
| `number_format` + versions | code | a statutory kind's format records the CA's confirmation |
| `series` | kind, scope key and year, for an open or paused series | format fixed for life; closed is final |
| `allocation` | series and sequence number; document; formatted text within its display scope | append-only |
| `series_event` | — | append-only: defined, paused, released, closed, reconciled after a restore |

### 6.2 Schema `audit`
<!-- deps: PRD-ACS-013, PRD-SEC-007, PRD-MOD-011, POL-18.05 — table list for the audit and access records of sections 4 and 5 -->

| Table | Unique | Other constraints |
| --- | --- | --- |
| `audit_record` | — | append-only; partitioned by recording month |
| `access_record` | — | append-only; partitioned by recording month |
| `audit_seal` | block | chained to the previous seal |
| `retention_deletion` | block | append-only |

## 7. Tests on synthetic data

All data is labelled synthetic and never becomes a default (`AGENTS.md`: "Never invent a value"). Tests run against real PostgreSQL.

| # | Test | IDs |
| --- | --- | --- |
| 1 | A number is given in its document's transaction; a rollback leaves no allocation and no gap | `PRD-INT-004` |
| 2 | Concurrent allocations on one series get distinct, consecutive numbers; allocations on two device series do not wait for each other | `PRD-INT-003`, `PRD-POS-020` |
| 3 | A second open series for the same kind, scope and year is refused, so two live devices never share one | `PRD-POS-020`, `PRD-OFF-002` |
| 4 | A closed series refuses allocation and cannot reopen; a replaced device and a switched Store start fresh series | `PRD-OFF-010`, `PRD-LIF-015` |
| 5 | A format that could repeat text across two series in one registration and year is refused | `PRD-MOD-008` |
| 6 | A reprint keeps its number | `PRD-POS-016` |
| 7 | After a simulated restore, every series is paused until reconciled | `POL-18.04` |
| 8 | An audit record commits with its change; a rollback leaves none | `PRD-INT-004` |
| 9 | The runtime role cannot update or delete an audit or access record | `PRD-SEC-007` |
| 10 | Altering a sealed row is reported by the seal check | `PRD-SEC-007` |
| 11 | An encrypted value never appears in an audit record | `PRD-SEC-006` |
| 12 | A reader sees only the history inside their scope | `PRD-SEC-005` |
| 13 | A failed sign-in keeps no password, no code and no unmatched login | `PRD-SEC-014` |
| 14 | Nothing is deleted while no retention period is set | `POL-18.05` |

## 8. Open questions

Nothing below has a default. Questions already open elsewhere are pointed to, not repeated: the bill-number format (V-40, `POL-10.07`); retention periods (V-13, `POL-18.05`); the offline series detail (GC-8); the restore steps (GC-9). The series state names (DM-4) and where consent, notices, deletion and legal holds are designed (module-map MM-15) are baseline picks of DEC-105 (3.1, 4.6).

| # | Question | Kind | Who decides | Blocks | Impact |
| --- | --- | --- | --- | --- | --- |
| GC5-1 | The start and end of the financial year that bill series and other yearly series follow (3.3) | Business, statutory | Accounts, CA | 1 live use; bills in 4 | Which series a document's number comes from |
| GC5-2 | The number formats of statutory documents other than bills, such as credit notes for customer returns (`POL-10.11`) and statutory movement documents (`PRD-TRF-023`). `POL-10.07` covers bill numbers only | Business, statutory | Accounts, CA | 3 (movement documents); 4 (credit notes) | The format settings of those series |
