# Code house rules

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Draft**, 5 Oct 2026. Part A, database and tests (sections 2 to 11), is written for review. Part B, API and runtime (section 12), is not written yet. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements these PRD sections: "Technical platform" (Stack: Repository, Database, Database access, Verification); Module and data boundaries; Transaction and integration integrity; from AI, security and operational reliability, the PostgreSQL scope controls, dependency pinning and the checks every change must pass. It is the code house rules of [gaps-before-code.md](../../reports/gaps-before-code.md) section 3.

- PRD IDs: `PRD-MOD-001`, `PRD-MOD-002`, `PRD-MOD-006`, `PRD-MOD-008`–`PRD-MOD-011`, `PRD-MOD-014`, `PRD-MOD-015`; `PRD-INT-002`–`PRD-INT-004`, `PRD-INT-006`; `PRD-SEC-005`–`PRD-SEC-007`, `PRD-SEC-015`–`PRD-SEC-017`; `PRD-ACS-004`, `PRD-ACS-006`, `PRD-ACS-007`, `PRD-ACS-020`, `PRD-ACS-022`, `PRD-ACS-023`; `PRD-ACP-018`.
- Policies: 2 (`POL-02.12`).
- Decisions: DEC-093, DEC-101, DEC-105.

Depends on: [module-map.md](../architecture/module-map.md) (modules, tiers, the transaction shape, events), [domain-model.md](../architecture/domain-model.md) (kinds of record), [deployment.md](deployment.md) (the directory, the database per Organisation, the two roles), [access-and-approvals.md](../access/access-and-approvals.md) (row-level security, restricted fields, the setup step), [structure-and-masters.md](../masters/structure-and-masters.md) (versions, Unknown, one schema per module), [stock-ledger.md](../stock/stock-ledger.md) (idempotency, one transaction, lock order, rechecks), [numbering-and-audit.md](numbering-and-audit.md) and [books-and-posting.md](../finance/books-and-posting.md) (append-only guards), [shared-calculations.md](../calculations/shared-calculations.md) (golden cases), [imports-and-opening-data.md](imports-and-opening-data.md) (synthetic files).

Used by: all code and tests in the repository; the migration runner and roles, and the synthetic fixtures, that come first.

---

## 1. What this document fixes
<!-- deps: PRD-MOD-002, PRD-SEC-015, PRD-SEC-016 — scope of the house rules and how they relate to the designs -->

- The conventions every module's code follows, so that work done in parallel gives one schema style, one transaction style and one test style.
- **Part A, database and tests:** folder layout (section 2), database layout (3), migrations (4), database roles (5), row-level security (6), append-only rows and versions (7), commands, transactions and locks (8), time (9), tests (10), synthetic data and fixtures (11).
- **Part B, API and runtime:** section 12, not written yet.

Every rule here is a **Design choice** unless an ID sets it. It settles no business question and sets no KDPS value. Labels (**Design choice**, **Proposed**, **OPEN**) mean what module-map section 1 says. The area designs say which tables, columns and constraints a module has; this document says how they are written. Code that differs from these rules is a defect, as it is for any design ([docs README](../../README.md)).

## 2. Folder layout
<!-- deps: PRD-MOD-002, PRD-SEC-015 — where code lives inside a module behind its index.ts -->

- A unit is `kernel` or a module, or a part of one, under `apps/server/src/modules/` (module-map 2.1 and 2.2). Its `index.ts` is its public interface. Another unit imports only that file, and only downward or along a same-tier call module-map sections 4 and 5 list (`PRD-MOD-002`). `pnpm check:modules` enforces both (`PRD-SEC-015`).
- Inside a unit:

| Path | Holds |
| --- | --- |
| `index.ts` | The public interface: the Nest module, the interface tokens and types, and the contracts the unit defines (module-map section 3, rule 6). Nothing else is exported |
| `<unit>.module.ts` | The Nest module. Every constructor injection names its token with `@Inject(...)` |
| `domain/` | The unit's own rules as plain functions and types. No database, network, clock or logger |
| `commands/` | One file per command: the steps of 8.1 for that command |
| `queries/` | Reads and the unit's declared read models (module-map section 3, rule 5) |
| `db/` | Drizzle table definitions (`schema.ts`) and the unit's SQL. Never exported from `index.ts`, so no other unit can name its tables |
| `http/`, `jobs/` | Controllers, and job and event consumers. Their rules are part B |

- Tests sit beside the code they prove: `*.test.ts` for unit tests and `*.int.test.ts` for integration tests. Tests that span units sit in `apps/server/test/`. Browser journeys sit in `apps/web/e2e/` (10.1).
- `packages/domain` holds only primitives every unit shares: money in paise, Unknown, UUIDv7 (`PRD-MOD-008`, `PRD-MOD-014`, `PRD-MOD-015`). A rule that belongs to one module stays in that module. `packages/calculations`, when it is created, follows [shared-calculations.md](../calculations/shared-calculations.md).
- Code under `src/` never imports from a test folder or a fixture (11.2).

## 3. Database layout

### 3.1 Two kinds of database
<!-- deps: PRD-MOD-001, PRD-ACS-020, DEC-093 — directory and Organisation databases as code sees them -->

- One PostgreSQL database per Organisation, holding all its records (`PRD-MOD-001`). A directory database beside them holds only each Organisation's code and where its database is (DEC-093, `PRD-ACS-020`; [deployment.md](deployment.md) section 4).
- Each kind has its own migration set (4.1). No business table exists in both kinds, and no query joins the two. The one table both hold is the runner's own record, `kernel.migration` (4.3).

### 3.2 Schemas and tables
<!-- deps: PRD-MOD-002, PRD-MOD-008 — one schema per module and the naming of tables and keys -->

- Each module owns one schema, named after the module with `_` for `-`: `organisation`, `merchandise`, `files_imports`. A module's parts share its schema; each table belongs to one part, and only that part's code writes it. `kernel` owns the schema `kernel` (`PRD-MOD-002`; structure-and-masters 2.5).
- No foreign key crosses schemas. A reference to another module's record keeps its identifier, and the owner of the reference checks it through the other module's interface when it writes (structure-and-masters 2.5). Inside a schema, every reference has a foreign key.
- Names are lower-case `snake_case`; table names are singular (`journal_line`). A reference column is `<record>_id`.
- Every table has the primary key `id uuid`, a UUIDv7 made by the application through `@apparel-os/domain` (`PRD-MOD-008`). A partitioned table, such as the audit tables partitioned by recording month (numbering-and-audit 4.4), has the key `(id, recorded_at)`, because PostgreSQL requires a partitioned table's key to hold its partition key; its partitions are created by the migration role, never the runtime role, and how far ahead is CH-5. The register lists a partitioned table once, not each partition. No business number comes from a PostgreSQL sequence: a sequence gives numbers away on rollback, and numbers come from `numbering` (numbering-and-audit 3.2).
- Every object is written schema-qualified in SQL, and the runtime connection's `search_path` holds no application schema, so a name can never resolve to the wrong schema.
- Every table has an entry in the table register of its migration set (4.1). The entry gives its class, `scoped`, `self` or `unscoped` (6.1); the marks `append-only` (7.1), `versions` (7.3), `projection` and `locked` (a command locks its rows, 5.2) where they apply; and the section of the area design that sets the class. An `unscoped` entry names the section that says why. A table whose design does not say yet waits for that design before its migration merges.
- The register is reviewed with the migration that adds or changes the table, against the design section it names. The catalogue test compares the database with the register, not with anything the migration says about itself (10.4).
- **pg-boss** (PRD Stack: Jobs) keeps its own schema, `pgboss`, as a third-party schema. Its tables follow pg-boss, not 3.2 and 3.3: they keep their own keys, defaults and types. A migration installs and upgrades the schema at the version pinned in the lockfile; the runtime never installs or migrates it, and its queues are created by migration, because the runtime role creates no object. The register lists the schema as third-party, with the privileges the runtime role needs on it. This is checked against the pinned pg-boss version when part B adds jobs.

### 3.3 Column types
<!-- deps: PRD-MOD-009, PRD-MOD-014, PRD-MOD-015 — storage of money, Unknown, times, states and payloads -->

| Value | Column | Rule |
| --- | --- | --- |
| INR amount | `bigint`, name ends in `_paise` | Integer paise (`PRD-MOD-014`). Read into `Paise` through `@apparel-os/domain`, which refuses a value outside the safe integer range |
| Amount in another enabled currency | `bigint`, name ends in `_minor`, with a currency column beside it | That currency's configured integer minor unit, never paise (`PRD-MOD-014`, `PRD-MOD-015`). No such column exists until a currency other than INR is enabled; a currency-aware type is added to `@apparel-os/domain` first |
| Any amount | — | Never `numeric`, `real` or `double precision` |
| Rate, quantity with a fraction | `numeric` | Read and written as a decimal string, never as a JavaScript number |
| Unknown | A null in a nullable column | A value that means "none" is a stated value, never a null (structure-and-masters 2.4; `PRD-MOD-015`) |
| Event and recording time | `timestamptz` | Section 9. Never `timestamp` without a time zone |
| Business date | `date` | Section 9 |
| Effective dates | `daterange`, half-open `[start, end)` | 7.3 |
| State | `text` with a `CHECK` listing the state names | The names are those of [design-language.md](../ui/design-language.md) section 7. No PostgreSQL enum type |
| Payload snapshot | `jsonb` | Only for a payload whose shape a versioned Zod schema states, such as a staged import row. Never for a scope fact, an amount or a column a constraint needs |
| Code, name, text | `text` | A code is compared exactly (structure-and-masters 2.1) |

- No column has a default, except recording time (`recorded_at`, set by the database). A business value is always written by the command that knows it (`AGENTS.md`, "Never invent a value"; structure-and-masters 2.4).
- Every foreign key and every scope column has an index.

### 3.4 Database access in code
<!-- deps: PRD-MOD-002 — Drizzle and raw SQL use -->

- Ordinary reads and writes use Drizzle's query builder over the unit's own table definitions (PRD Stack: Database access).
- Locking and reporting use raw SQL through Drizzle's `sql` template, always with bound parameters. SQL is never built by joining strings around a value.
- The Drizzle definitions mirror the reviewed migrations; they never create or change a table. An integration test compares each definition with the migrated database: columns, types and nullability (10.4).

## 4. Migrations

### 4.1 Two ordered sets
<!-- deps: PRD-MOD-001, DEC-093 — the directory and Organisation migration sets -->

- `apps/server/migrations/directory/` is applied to the directory database; `apps/server/migrations/organisation/` to each Organisation database ([deployment.md](deployment.md) section 4).
- A file is named `NNNN__<unit>__<what>.sql`: a four-digit number unique and in order within its set, the unit that owns the change (`merchandise.catalogue` for a part), and a short description. One file changes one unit's schema only.
- Two branches that take the same number are fixed by the second to merge, before it merges. The runner refuses a set with a duplicate or missing number.
- Each set keeps its table register (3.2) beside its files, as `tables.json`.

### 4.2 Writing a migration
<!-- deps: PRD-SEC-015, PRD-MOD-011 — reviewed SQL, forward only, compatible with the running version -->

- Migrations are SQL written by hand and reviewed in the pull request (PRD Stack: Database access; `PRD-SEC-015`). A migration that creates a table, in the same file:
  - adds the table's register entry (3.2);
  - grants the runtime role exactly the privileges of 5.2;
  - enables row-level security and creates the policy of 6.2 for a `scoped` or `self` table;
  - adds the guard of 7.1 for an `append-only` table and the constraint of 7.3 for `versions`.
- **Forward only.** There are no down migrations. A mistake is fixed by a new migration. A file is never edited after it has been applied anywhere outside a developer's machine; the runner refuses a file whose checksum differs from the one it recorded.
- **Compatible with the version running.** A deploy migrates before the new version takes traffic, and a failed one leaves the old version running ([deployment.md](deployment.md) section 4). So a migration never breaks the code already deployed: add first; remove or rename only in a later deploy, after no running code uses the old shape.
- **Data.** A migration never changes or deletes rows of an append-only table (`PRD-MOD-011`). It may fill a new column of a projection, which is rebuildable.
- PostgreSQL extensions are created by a migration and only from this list: `btree_gist` (7.3), `pg_trgm` (PRD Stack: Search). Another extension needs a change to this list first.

### 4.3 The runner
<!-- deps: PRD-MOD-001, PRD-ACS-023, DEC-101 — how migrations are applied and recorded -->

- The runner lives in `kernel` and connects as the migration role (5.1). It applies the directory set to the directory database, then the Organisation set to each Organisation database the directory lists, in code order, and stops at the first failure.
- Each file runs in its own transaction, with its record, so a failing file leaves the database as it was before that file. A statement PostgreSQL refuses inside a transaction is not used.
- It records each applied file in `kernel.migration` of that database: file name, SHA-256 checksum, the time and the role that applied it. Before the first file for a database it takes a session-level PostgreSQL advisory lock, and holds it until the last file for that database has run, so two runs never migrate the same database at once.
- After the files, it applies the database-level privileges of 5.2 to that database, as its owner: it revokes `PUBLIC`'s privileges on the database and on schema `public`, and grants the runtime role `CONNECT`, and `USAGE` on `public`, where the extensions of 4.2 live. Then it reads the privileges back and fails if any differs, since a revoke PostgreSQL cannot apply only warns. They are not a migration: `CREATE DATABASE` does not copy a database's privileges or settings, so the runner applies them on every run, idempotently, and the test helper applies the same step to every copy it makes (11.3).
- It runs as the pre-deploy step of each deploy ([deployment.md](deployment.md) section 4). The setup step of a new Organisation migrates that Organisation's new database with the same runner before it writes the first rows (`PRD-ACS-023`, DEC-101; access-and-approvals 9.11). How the setup step holds the migration role's rights is CH-1.

## 5. Database roles

### 5.1 Two roles
<!-- deps: PRD-SEC-005, PRD-SEC-007 — the migration role and the runtime role -->

| Role | Name | What it is |
| --- | --- | --- |
| Migration role | `aos_migration` | Owns every directory and Organisation database, made with `CREATE DATABASE … OWNER aos_migration`, and every schema, table, function and trigger in them. Has `CREATEDB`, so that, under CH-1's proposal, it creates an Organisation's database. Used only by the migration runner, the setup step (CH-1) and test setup (10.1); CH-5 may add a partition job. Not a superuser |
| Runtime role | `aos_runtime` | Used by `app` and `worker`. Owns nothing, cannot create or change any object, does not bypass row-level security (`PRD-SEC-005`; [deployment.md](deployment.md) section 4). Not a superuser; no `CREATEDB`, `CREATEROLE` or `BYPASSRLS` |

- Each role has its own password, held in the environment's variables and never in the repository ([deployment.md](deployment.md) section 9).
- The SQL that creates both roles is kept for tests and local use, and a runbook gives the same steps for Railway.
- Tables do not use `FORCE ROW LEVEL SECURITY`, so the migration role, as owner, is not filtered. It is never used by application code.
- Settings of the runtime role, such as its `search_path` (3.2) and the time limits of CH-3, are set on the role, not on a database, so they hold in every database, copies included.

### 5.2 What the runtime role may do
<!-- deps: PRD-SEC-005, PRD-SEC-007, PRD-MOD-011 — explicit grants per table -->

- `CONNECT` on its databases, `USAGE` on each application schema and on `public`. Nothing on `kernel.migration`. `PUBLIC` holds no privilege on an application database, schema, table or function; the privileges PostgreSQL itself gives `PUBLIC` on `pg_catalog` and `information_schema` stay (10.4). A new database gives `PUBLIC` `CONNECT` and `TEMPORARY`, and `USAGE` on schema `public`, until the runner's database step revokes them (4.3).
- On each table, only the privileges its migration grants by name. No default privileges are set, so a new table grants nothing until its migration says so:

| Table class | Runtime privileges |
| --- | --- |
| `append-only` | `SELECT`, `INSERT`; and `UPDATE (id)` when it is `locked`, the guard of 7.1 refusing the update itself |
| `versions` | `SELECT`, `INSERT`, `UPDATE`; the trigger of 7.3 limits what an update may change |
| `projection` and other changeable tables | `SELECT`, `INSERT`, `UPDATE`; `DELETE` only where the table's design allows a delete |

- PostgreSQL takes a row lock, `FOR UPDATE` or `FOR SHARE` alike, only for a role holding `UPDATE` on at least one column of the table. So every `locked` table grants it, and an append-only one grants `UPDATE (id)` only.

- A function runs with its caller's rights. `SECURITY DEFINER` is used only where a design names the function, such as the audit retention function (numbering-and-audit 4.6); such a function sets its own `search_path`. `EXECUTE` on every function is revoked from `PUBLIC` and granted to the runtime role only where its code or a policy calls it.
- Tests prove that the runtime role cannot create, change or drop a table, and cannot update or delete a row a guard protects (10.4).

## 6. Row-level security

### 6.1 Which tables
<!-- deps: PRD-SEC-005, PRD-ACS-022 — scoped and self-service tables -->

- A `scoped` table holds rows that belong to a place, a legal entity or a brand. It carries those scope facts as columns: the identifiers of the Site, the Store and the business unit as they apply, the legal entity, the brand (access-and-approvals 7.2). A line that can be read on its own carries its document's scope facts too.
- A `self` table holds rows of one person, read through the self-service role (`PRD-ACS-022`). It carries the subject's user identifier.
- An `unscoped` table has no row-level security; Authorise alone guards it (access-and-approvals 7.1). Each area design says which of its tables are scoped; 6.3 classifies the tables that authentication reads.

### 6.2 The policy
<!-- deps: PRD-SEC-005 — the one policy shape and the actor setting -->

- After Authenticate, `kernel` sets the actor at the start of every transaction, reads included, except on the paths of 6.3, with `set_config('aos.actor_id', <id>, true)`: local to the transaction, so a pooled connection never carries an actor into the next one (access-and-approvals 7.2). Nothing ever sets it for the session.
- `access` provides one SQL function for every policy: `access.row_visible(record_type, site_id, store_id, business_unit_id, legal_entity_id, brand_id, subject_id)`. It is `STABLE`, written in SQL, and answers whether one effective grant of the actor for that record type covers the row's facts, or, for a self-service grant, whether the subject is the actor (access-and-approvals 7.2). A policy reaches `access` only through this function; it never reads `access` tables itself.
- The function knows which scope facts each record type declares (access-and-approvals 5.3). A null in a declared fact is Unknown and is covered only by all-members scope in that dimension; a fact the record type does not declare is passed as null and not checked. The facts of `stock.balance` in the example are for the stock design to set.
- The function takes one value of each scope fact. A record whose scope holds several values of one fact, such as a document with lines of several brands, or a transfer read from its source and its destination (access-and-approvals 5.3), does not fit it yet. No such table is created until CH-6 is settled.
- A policy's expression runs with the rights of the role that queries, so the function runs with its caller's rights (`SECURITY INVOKER`). It reads a table, so PostgreSQL does not inline it and runs it for each row; each scoped table's policy is checked with `EXPLAIN` on volume data before the table's first feature is accepted. Every name in it is schema-qualified. The runtime role holds `SELECT` on `access.effective_grant`, an `unscoped` table (6.3), and `EXECUTE` on the function; `PUBLIC` holds neither.
- It reads the actor as `nullif(current_setting('aos.actor_id', true), '')`. A setting that was set earlier in the session reads as an empty string, not as null, after its transaction ends, so the empty string must count as no actor. With no actor, the function answers false and every scoped table shows no rows.
- Every `scoped` or `self` table has one policy for the runtime role, the same predicate for reading and writing:

```sql
alter table stock.balance enable row level security;
create policy row_scope on stock.balance for all to aos_runtime
  using (access.row_visible('stock.balance', site_id, store_id, business_unit_id, null, null, null))
  with check (access.row_visible('stock.balance', site_id, store_id, business_unit_id, null, null, null));
```

- So a command cannot write a row its actor could not read. A table whose design lets an actor write rows for a scope it cannot read names its own write rule in that design; 6.3 names the one this document needs.
- Row-level security is the backstop; the exact check is Authorise, one assignment per action (`PRD-ACS-004` through access-and-approvals 7.2). Restricted columns are protected by masking and encryption, not by these policies (access-and-approvals 6; `PRD-SEC-006`).
- Read models carry the same scope columns and the same policy (access-and-approvals 7.2).

### 6.3 Before an actor exists
<!-- deps: PRD-SEC-007, PRD-MOD-002, PRD-ACS-023, DEC-101 — the sign-in and setup paths and the tables they reach -->

- Three paths run with no actor set:
  - authenticating a request or a job step, which reads the session or the service credential and the actor's state to learn who the actor is (access-and-approvals 7.1 step 1);
  - sign-in, with a user's actions on their own credentials and sessions (access-and-approvals 3.1, 3.2);
  - the setup step of a new Organisation, until it acts under its service identity (access-and-approvals 9.11; `PRD-ACS-023`, DEC-101; CH-1).
- Every other query of a request or job runs after the actor is set.
- The tables of `access` these paths and Authorise read are `unscoped`: `app_user`, `password_credential`, `second_factor`, `session`, `device`, `service_identity`, `service_credential`, `role`, `role_permission`, `role_assignment`, `assignment_scope`, `assignment_scope_member`, `approval_limit`, `stand_in_grant` and `effective_grant`, with their versions (access-and-approvals 13.1). Only `access` code reads them (`PRD-MOD-002`). Passwords, credentials and session identifiers in them are held only as hashes, and second-factor secrets encrypted (access-and-approvals 6, 13.1). What anyone else sees of them comes through `access`'s interface and its read models, which are scoped.
- The evidence these paths write goes to `audit`: the access record of every sign-in attempt in a known Organisation (access-and-approvals 3.1; `PRD-SEC-007`) and the setup step's audit records. Those tables are scoped for reading (numbering-and-audit 4.5), so they carry two policies instead of the one of 6.2: reading through `access.row_visible`, and inserting admitted for any row (`WITH CHECK (true)`). A refusal there would lose the record of an attempt, and the rows are append-only (7.1). An insert on these paths asks for no row back (`RETURNING`), since reading the row back is refused with no actor. **Design choice.**
- Nothing on these paths sets an actor it has not authenticated.

## 7. Append-only rows and versions

### 7.1 Append-only
<!-- deps: PRD-MOD-011, PRD-SEC-007 — the two guards on append-only tables -->

- Entries, status records, audit and access records, approval decisions, and the frozen payloads of documents are append-only (domain-model section 1; `PRD-MOD-011`, `PRD-SEC-007`). Each table is marked `append-only` and has two guards:
  1. the runtime role has no `DELETE` on it, and no `UPDATE` except `UPDATE (id)` on a `locked` table, which it needs to lock rows (5.2);
  2. a `BEFORE UPDATE OR DELETE` row trigger and a `BEFORE TRUNCATE` statement trigger call `kernel.refuse_change()`, which raises an error with a SQLSTATE of the class `AO`. The trigger also stops the owner. Taking a row lock fires no trigger.
- A delete a design allows, such as audit retention (numbering-and-audit 4.6), goes through that design's named function, and the trigger admits only it.
- A correction is its own linked record (`PRD-MOD-011`; domain-model section 1). A status that changes is a projection, kept apart from the rows it is built from.

### 7.2 Documents
<!-- deps: PRD-MOD-011, PRD-MOD-010, PRD-ACS-006, PRD-ACS-007, POL-02.12 — frozen document payloads, their preparers and their state -->

- A document is a header row with its state, and version rows that hold its payload. A draft version takes changes until it is submitted; each change is also written to an append-only change row naming who made it and when. So the preparers of a version are everyone with a change row on it, including the one who submitted it (access-and-approvals 9.1; GC3-1, DEC-105). From submission the version row is frozen; a later change opens a new version, which needs a new approval unless the change is not material and the decision carries to it (access-and-approvals 9.6; `PRD-ACS-007`, `POL-02.12`). An approval names the version it decided (domain-model section 1).
- After approval the payload is frozen: no new version is accepted except as its design allows. The state is a projection on the header, rebuildable from the document's events.

### 7.3 Effective-dated versions
<!-- deps: PRD-MOD-010, DEC-105 — exclusion constraints and the version a transaction used -->

- A master or setting with versions has a companion table `<table>_version` with `valid_during daterange`, half-open, under business dates (structure-and-masters 2.2; `PRD-MOD-010`). A dated table, such as `role_assignment`, `approval_limit` or `business_unit_mapping` (access-and-approvals 13.1; structure-and-masters 6.1), holds its own `valid_during` on each row and follows the rules of this section as if each row were a version; its register entry is marked `versions` and names the overlap key. A dated table whose design names no key, such as `role_assignment`, which may hold several assignments of one user at once (access-and-approvals 4.3), gets no exclusion constraint until its design names one (CH-7).
- A version row records its decision: Awaiting approval until it is decided, then approved or Rejected (structure-and-masters 2.3).
- Approved versions never overlap: an exclusion constraint on the master's identifier, or for a dated table the key its design names (for `approval_limit`, the action and holder; for `business_unit_mapping`, the unit), and `valid_during`, using `btree_gist`, limited by a `WHERE` clause to approved versions, whatever their dates: Scheduled, In force and Ended alike. A state that changes with the date alone cannot be the condition of a constraint, and two approved versions that overlap would both be in force on the dates they share (structure-and-masters 2.2).
- The runtime role holds `UPDATE` on the table (5.2), and a trigger allows only three changes: to a version still Awaiting approval; recording its decision, once; and, on an approved version, moving the end of `valid_during` earlier, to today or later and never to or before its start, either because a new version follows it on its own start date, or because an approved change ends it early, as for a role assignment ended early (access-and-approvals 4.3). It refuses every other change, including any change to an approved version's start or to a Rejected version.
- A version never starts on a past date (GC2-7, DEC-105). The command checks it against today under the Organisation's timezone (section 9); a `CHECK` constraint cannot see today.
- A transaction row stores the identifier of each version it used (`PRD-MOD-010`).

## 8. Commands, transactions and locks

### 8.1 The command runner
<!-- deps: PRD-MOD-006, PRD-INT-002, PRD-INT-004 — one transaction per command -->

- Every state change is a command run by `kernel`'s command runner. One command is one database transaction; every module the command calls joins it and never opens or commits its own (`PRD-MOD-006`, `PRD-INT-004`; module-map section 3, rule 3).
- The runner follows module-map 6.1: Organisation and actor, the idempotency key, availability and authorisation, slow work before any lock, locks, rechecks under the locks, writes, commit, then the outbox. The idempotency key's form is part B; its row is kept in the command's transaction (`PRD-INT-002`; stock-ledger 10.1).
- Each interface operation that reads or writes takes the command's transaction context as its first argument. There is no hidden ambient transaction.
- Isolation is `READ COMMITTED`, with explicit row locks and the rechecks of stock-ledger 10.4. Under it a read is not stable: a row read without a lock can change, and the change commit, before the command commits. So every fact a command rechecks under the locks is read after the locks are held, from a row the command has locked; from rows that change only under an exclusive lock of such a row, such as its versions or an assignment's scope rows; or from rows that never change once written, such as a frozen version's change rows (7.2, 8.2). A statement run after a lock is granted sees every change committed before it. A read-only query runs in a `READ ONLY` transaction, with the actor set as for a command.
- With the lock order of 8.2, and exclusive locks that leave foreign-key checks free, a deadlock means one of these rules was broken. The command fails, the failure is logged as a defect, and a test is written that reproduces it. The runner does not retry it.
- An exception that must survive a rollback is raised in its own transaction after the rollback (module-map 6.3; SL-23, DEC-105).

### 8.2 Lock order
<!-- deps: PRD-INT-003, DEC-105 — the kernel lock helper and stock-ledger 10.3 -->

- Locks are taken only through `kernel`'s lock helper, once per step of stock-ledger 10.3, with every row of that step from every table the step covers. The helper takes them in ascending identifier order across the whole step: each run of consecutive rows from one table in one `SELECT … ORDER BY id FOR NO KEY UPDATE`, or `FOR SHARE` where the step says so, as for the financial period row (step 7; MM-6, DEC-105). PostgreSQL locks such rows after sorting them.
- **Foreign keys.** Inserting a row that references another takes `FOR KEY SHARE` on the row it references, outside the helper. That lock waits for `FOR UPDATE` but not for `FOR NO KEY UPDATE` or `FOR SHARE`, so the helper never takes `FOR UPDATE`. This is safe because no command changes a column of a unique index, such as an identifier or a code (structure-and-masters 2.1), or deletes a row another row references; either would take `FOR UPDATE` itself.
- **Rows of other modules.** A step can hold rows of several modules, such as a document and the `access` approval rows of step 1. A module whose rows another command locks offers them through its interface as lock targets, and the command passes all the targets of a step to the helper in one call. The helper refuses a call for a step no higher than one already called in the transaction, so a step's rows are never taken in two calls, and two commands can never take them in different orders (`PRD-INT-003`).
- **Authority first.** Step 0 of stock-ledger 10.3 locks the rows the command's authority rests on: the acting user or service identity, the role assignment Authorise returned, the approval limits and the stand-in grant relied on, including the limit an approval decision used. A command that relies on them takes them in shared mode, so such commands never wait for each other. A command that changes one of them, such as disabling a user, ending an assignment, a limit or a stand-in grant, or revoking a service identity, takes it in exclusive mode at the same step. Under them the command rechecks that the user is still Active, or the service identity still enabled, as well as the assignment, scope and limits (access-and-approvals 7.1 step 4; stock-ledger 10.4). So a change of authority waits for the commands already relying on it, and a command that locks after it commits sees it: a user who is disabled posts nothing after the disabling commits (access-and-approvals 2.1; `PRD-INT-003`). The lock target is the identity row, not its versions. A command that needs one row in both modes takes it exclusively.
- **Missing balance rows.** Step 3 first creates the balance rows that do not exist yet, empty, with `INSERT … ON CONFLICT DO NOTHING` in ascending key order, then makes its lock call. Creating a row locks it. These empty rows are the only write before every lock is held; nothing that records the command's effects is written until then (stock-ledger 10.3).
- Every table the helper locks is marked `locked` in its register, so the runtime role holds the `UPDATE` privilege every row lock needs (5.2).
- **Number series.** A command locks every series it will draw numbers from, its own document series and the journal series of each book it posts to, in one call as step 8, before its first write. `numbering` offers the series rows as lock targets, and Allocate draws only from a series the transaction holds (numbering-and-audit 3.2; books-and-posting 5.4).
- A command that changes no stock or money locks its authority rows as step 0, its own record rows as step 1, and any number series as step 8. A row that stock-ledger 10.3 already places keeps its step: a financial period row is step 7 and a series row step 8, even when it is the command's own record, as for locking a period (books-and-posting 4.5).
- A later module's rows take the step its design names; stock-ledger 10.3 is updated then (module-map 6.1).

### 8.3 No outside call inside a transaction
<!-- deps: PRD-INT-006 — outside systems stay out of the transaction -->

- Nothing inside a transaction calls an outside system: file storage, messaging, GST, bank, Tally, AI or any other network service (`PRD-INT-006`). Such work runs before the transaction, as a stored file referenced by its identifier is, or after the commit through the outbox.
- The runner marks the work it runs as inside a transaction, and every adapter for an outside system refuses to run while that mark is set. A test proves the refusal.

## 9. Time
<!-- deps: PRD-MOD-009 — event time, recording time and business date -->

| Time | Column | Set by |
| --- | --- | --- |
| Event time | `occurred_at timestamptz` | The command, from when the thing happened: the device's time for an offline bill, the server's time for an online action |
| Recording time | `recorded_at timestamptz` | The database, as the transaction's time, so every row of one command has the same one |
| Business date | `business_date date` | The command, under the Organisation's timezone (`PRD-MOD-009`) |

- The server and the database run in UTC. A business date is never taken from the server's or the database's time zone.
- The Organisation's timezone is an Organisation setting in `configuration` (domain-model 3.6), with no default. An operation that needs a business date is unavailable until it is set (`PRD-SEC-017`).
- Code reads the time only through `kernel`'s clock, never `new Date()` or `Date.now()` in a command or in `domain/`. Tests set the clock.
- Dates under a timezone are worked out with the built-in `Intl` API. No date library is added.

## 10. Tests

### 10.1 Kinds of test
<!-- deps: PRD-SEC-016, PRD-ACP-018 — the test kinds and where each runs -->

| Kind | Tool | Where | What it proves |
| --- | --- | --- | --- |
| Unit | Vitest | `*.test.ts` | Pure rules: `domain/` and packages. No database, network or clock |
| Integration | Vitest and Testcontainers | `*.int.test.ts` | Commands, constraints, triggers, policies and read models on real PostgreSQL |
| Concurrency | Vitest and Testcontainers | `*.int.test.ts` | Two or more transactions on separate connections (10.3) |
| Golden cases | Vitest; Playwright for the counter run | Case files | Shared calculations on server and counter (shared-calculations 12.1, 12.2) and the stock-and-posting stories |
| Browser journey | Playwright | `apps/web/e2e/` | What one persona can and cannot see and do on the screens a change touches (`PRD-SEC-016`, `PRD-ACP-018`) |

- **Integration tests use the runtime role.** A test connects as `aos_runtime` and sets an actor exactly as the application does. Only test setup uses the migration role or the container's superuser.
- **Journeys per persona.** A feature that adds or changes a screen adds one journey per persona that uses it (P-OWN … P-AUD, [personas.md](../access/personas.md)). The journey signs in as a synthetic user holding a synthetic role assignment for that persona, and checks both what it may do and what it is refused, with the refusal's reason.
- Tests are independent of each other and of their order, and test files run in parallel (11.3). A test that passes only sometimes is a defect; the test runner never retries a failed test.

### 10.2 Naming and citing
<!-- deps: PRD-SEC-016 — every test names the rule it proves -->

- A test that proves a rule names its ID at the start of its title: `it('PRD-SEC-005 shows no scoped row when no actor is set', …)`. A test from a design's test table names that test too: `access-and-approvals 15 test 11`. So a search for an ID finds its tests.
- `describe` names the operation or the rule; `it` says the expected behaviour in plain words.

### 10.3 Concurrency tests
<!-- deps: PRD-INT-003, PRD-ACP-018 — how concurrent transactions are tested -->

- Each transaction has its own connection. The test drives the order step by step: the first transaction takes its lock; the second starts and the test waits until PostgreSQL shows it waiting for that lock; then the first commits or rolls back. A test never relies on a sleep to order transactions.
- The cases are those of the area designs, such as stock-ledger 11.9.

### 10.4 Database checks run as tests
<!-- deps: PRD-SEC-005, PRD-SEC-007, PRD-SEC-015, PRD-MOD-011 — tests over the whole migrated schema -->

After migrating an Organisation database and a directory database, one test reads the catalogue and the table registers and fails when:

- a table is missing from its set's register, or the register lists a table the database does not have (3.2). A third-party schema, such as `pgboss`, is checked as one entry instead: the runtime role holds exactly the privileges its entry lists, `PUBLIC` holds none, and the bullets below on classes and 5.2 do not apply to its tables;
- a `scoped` or `self` table has row-level security off or lacks its policy for the runtime role (6.2);
- an `append-only` table lacks its triggers, or the runtime role holds `DELETE`, a table-wide `UPDATE` or a column `UPDATE` other than on `id` on it (7.1);
- a `locked` table grants the runtime role no `UPDATE` on any column (5.2);
- a `versions` table lacks its exclusion constraint, except a dated table whose design names no overlap key yet (7.3, CH-7);
- the runtime role owns an object, or holds a privilege beyond what 5.2 gives its register class and the database step of 4.3 gives it;
- `PUBLIC` holds any privilege on the database or on an application schema, table or function (5.2). The privileges PostgreSQL itself gives `PUBLIC` on `pg_catalog` and `information_schema` are not counted;
- a Drizzle definition differs from its table (3.4);
- once 11.4 is approved, a schema named in a test-only migration set exists outside a test database.

### 10.5 What runs on every change
<!-- deps: PRD-SEC-015, PRD-SEC-016 — the checks every change passes -->

- Every push and pull request runs, through CI: lint, typecheck, the module check, unit tests, integration tests and the doc checker; then the golden cases and browser journeys once they exist (`PRD-SEC-016`). Nothing is skipped because of which paths a change touched.
- The pre-commit hook runs what `AGENTS.md` says it runs. A change is merged only with every check green.

### 10.6 Dependencies
<!-- deps: PRD-SEC-015 — dependency pinning and the lockfile -->

- A dependency is added only when it implements a row of the PRD Stack, and its pull request names that row (`AGENTS.md`, "Stack"). Anything else needs a PRD change first.
- `pnpm-lock.yaml` is committed, and every install in CI uses `pnpm install --frozen-lockfile`, so a build installs exactly what the lockfile pins (`PRD-SEC-015`). The pnpm version is the one `package.json` names, activated through corepack.
- Versions shared by several packages come from the workspace catalogue in `pnpm-workspace.yaml`.
- The PostgreSQL image of the tests is pinned by major version (CH-2), and the pg-boss version by the lockfile (3.2).

## 11. Synthetic data and fixtures

### 11.1 Labelling
<!-- deps: PRD-SEC-017 — synthetic labels and why no fixture value is a default -->

- Every synthetic code carries `SYN` and every synthetic name says SYNTHETIC. A generated file says SYNTHETIC in its name and in a document property (imports-and-opening-data 17).
- Synthetic policy status, synthetic settings and synthetic approval limits are recorded as such, so that nothing synthetic can pass for a KDPS value (`AGENTS.md`, "Never invent a value"; `PRD-SEC-017`).
- KDPS's own files are never committed or loaded into a test (imports-and-opening-data 17).

### 11.2 Fixtures
<!-- deps: PRD-ACS-020, PRD-ACS-023 — how fixtures are built -->

- Fixtures live only in test folders and in the local seed command. Code under `src/` never imports them, and a lint rule refuses such an import.
- Every database test has two synthetic Organisations, each with its own database, so every test can show that one cannot see the other (`PRD-ACS-020`; [deployment.md](deployment.md) section 4).
- A fixture is built through the real interfaces once they exist, so it obeys the same rules as a user: the setup step for an Organisation (`PRD-ACS-023`), the real commands for its records. Until an interface exists, a fixture writes the fewest rows it needs directly, and is moved onto the interface when it arrives.
- The local seed command creates the same two synthetic Organisations. It refuses to run unless the environment says it is local or `dev`.

### 11.3 Speed and isolation
<!-- deps: PRD-MOD-001 — template database and clones -->

- A test run starts one PostgreSQL container and migrates a template database of each kind once. Each test file gets its own copies, made with `CREATE DATABASE … TEMPLATE` while no session is connected to the template, and drops them at its end. So two test files running at once never see each other's rows.
- A copy does not inherit its template's database-level privileges or settings. Before any test connects to a copy as the runtime role, the helper applies the runner's database privilege step to it (4.3).

### 11.4 Test-only schemas
<!-- deps: PRD-SEC-016 — test-only migration set for synthetic harnesses, waiting on harness decision H3 -->

**Proposed**, waiting on the product owner's harness decision H3 ([s1-f10-stock-harness.md](../../implementation/s1-f10-stock-harness.md) section 5); not in force until then.

- A synthetic harness that needs rows of its own, such as the documents of the stock harness, keeps them in a schema named `test_<harness>`, created by a third migration set, `apps/server/test/migrations/`.
- Only test setup applies that set, after the Organisation set, to test databases. The pre-deploy runner never reads it, and the catalogue test fails if such a schema exists in a database the runner migrated (10.4).
- Harness code lives in `apps/server/test/` and is composed only into a test application.

## 12. Part B: API and runtime
<!-- deps: none — placeholder for part B, not written yet -->

Not written yet. It will hold: REST routes and commands, Zod schemas and the generated OpenAPI with its typed client; the error envelope; the idempotency key; the version token; events and the outbox; jobs and their retry rule; logs; screen text; how a KDPS-valued setting is modelled; simulators for outside systems.

## 13. Open questions

Technical choices for the product owner. None is a business decision, and none has a default.

| # | Question | Who decides | Blocks |
| --- | --- | --- | --- |
| CH-1 | How the setup step creates and migrates a new Organisation's database, since the runtime role cannot (4.3, 5.1). **Proposed:** the setup step is an operator command, not an API endpoint; it creates and migrates the database with the migration role's credentials, and writes its rows in one transaction as the runtime role under the `setup` service identity, so row-level security and the guards apply to them | Product owner | S1-F01-T10 |
| CH-2 | The PostgreSQL major version on Railway. Tests use `postgres:17-alpine`; both must be the same major version, checked when the roles runbook is written | Product owner | The first deploy of a migration to `dev` |
| CH-3 | The lock wait and statement time limits of the runtime role. PostgreSQL waits without limit unless they are set | Product owner | The first deploy to `dev` |
| CH-4 | Whether tests may also read invariants through raw queries under a read-only verification role (harness decision H6). If so, it is a third role with `SELECT` only, created in test databases only | Product owner | S1-F10 |
| CH-5 | How monthly partitions of the audit tables are created ahead of time, since the runtime role cannot create them and the runner runs only at a deploy (3.2): a scheduled job under the migration role, or the runner creating them ahead on each run with a default partition as a backstop | Product owner | The first `audit` migration, in S1-F01 |
| CH-6 | How a record whose scope holds several values of one fact (lines of several brands; a transfer's source and destination) carries them for row-level security (6.2): a child table of scope facts, or a function that takes a set. The answer also goes into access-and-approvals 7.2 | Product owner, in the access design | The first such table: stage 2 bookings and PT, stage 3 transfers |
| CH-7 | Which role assignments of one user may not overlap in time, and so the overlap key of `role_assignment` (7.3). access-and-approvals 4.3 says assignment versions never overlap and a user may hold several assignments; its table list does not name the key. The answer goes into access-and-approvals 13.1 | Product owner, in the access design | The first `access` migration, in S1-F01 |
