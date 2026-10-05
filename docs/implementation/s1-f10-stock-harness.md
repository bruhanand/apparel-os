# S1-F10 — Synthetic stock harness

> **Not ranked.** Part of the [implementation plan](index.md). It changes no rule. The product owner took decisions H1 to H6 on 5 Oct 2026 (`DEC-112`; section 5). The agreed parts move into the stock ledger interface design (RR-012, RR-013) and are reviewed in DR-2 with the 25 never-reviewed ledger sections (RR-018) before anything here is built.

## 1. The problem

- The stage 1 exit check needs the golden stock-and-posting scenarios to pass on synthetic data: receipt, transfer, sale, return and late cost adjustment, under both cost formulas and both pool modes ([phases.md](../phases.md) stage 1; `PRD-LED-014`, `PRD-LED-015`, `PRD-ACP-018`).
- The story of [stock-ledger.md](../design/stock/stock-ledger.md) 11.1 and the journals of [books-and-posting.md](../design/finance/books-and-posting.md) 16 need business documents: a receipt count, a PT approval that establishes cost, a transfer, a sale, a customer return, a late cost change and a supplier return.
- The modules that own those documents (`receiving`, `merchandise` · PT, `stock` · documents, `pos`, `supplier-returns`) and their screens arrive in stages 2 to 4, with designs not yet written. The ledger itself names no operations: the area designs name them (module-map 4.15).

## 2. What must be real

The harness replaces only the business documents: their states, screens and APIs. Everything else runs for real, on real PostgreSQL under the runtime role:

| Real part | Rule it proves |
| --- | --- |
| The kernel command runner: one transaction per command, called modules join it | `PRD-INT-004`, `PRD-MOD-006` |
| The idempotency helper | `PRD-INT-002` |
| Locks in the order of stock-ledger 10.3, all before the first write | `PRD-INT-003` |
| `configuration` Check availability for valued effects | `PRD-SEC-017` |
| `access` Authorise, Verify under lock and Record use | stock-ledger 10.4; `DEC-097` |
| The stock ledger's operations, tables, constraints and triggers: movements, balances, receipt origins, pieces, holds, reservations, cost pools and layers | stock-ledger sections 2 to 8 |
| `finance` Post: maps, periods, the deferred balance trigger, posting-source rows | `PRD-MOD-013`, `DEC-087`; books-and-posting 5, 8 |
| `numbering` Allocate, locked last | stock-ledger 10.3 step 8 |
| `exceptions` Raise in its own transaction after a rollback | SL-23 Outcome A, `DEC-105` |
| `audit` records and outbox rows in the same transaction | `PRD-INT-004` |
| Queued posting jobs, one at a time per book | stock-ledger 10.6 |
| Row-level security and two synthetic Organisations | `PRD-SEC-005`, `PRD-ORG-002` |

## 3. Proposed design

### 3.1 Shape

- A **synthetic document driver**: test-only code in the server's test tree (for example `apps/server/test/harness/stock/`), composed into a test application only. It plays the owning module of each document kind.
- It calls only the public interfaces (`index.ts`) of `kernel`, `configuration`, `access`, `numbering`, `exceptions`, `audit`, `stock` · ledger and `finance` · books, like any module above them (module-map section 3, rules 1 and 8). It never writes another module's tables.
- Its own documents live in a test-only schema with one table: identity, kind, version, state, lines and the scope facts of the Site, Store, business unit and book. A test-only migration set creates it in test databases only (H3). Lock order step 1 locks these rows, and a change after approval raises the version, so stale-version and material-change refusals are real.

### 3.2 Commands

Each harness command is one kernel command and follows module-map 6.1: idempotency key; availability; authorisation; slow work before any lock; locks; rechecks; ledger operations, which call Post; number allocation last; audit; outbox; commit.

| Harness command | Plays | Ledger effects: movements (stock-ledger 2.3) and status records (sections 3, 6) | Approval (H4) |
| --- | --- | --- | --- |
| Receipt count | GRN count | Receipt count | None |
| Cost established | PT approval | Cost established | Independent, on the cost of the covered quantity |
| Opening count | A verified opening count (also the GC-6 test handler; on `dev` only if the product owner allows it, RR-013) | Opening count | Independent |
| Transfer approve, dispatch, arrive, accept | A transfer | Reservation (status); Dispatch; Arrival count; acceptance (status) | Independent, on cost |
| Sale | A bill | Sale issue | None |
| Customer return | A return | Customer return | None |
| Late cost change | An approved cost change | Cost adjustment | Independent, on cost |
| Supplier return depart, hand over, reject | An RTV leg | Supplier-return departure; Supplier handover; Supplier rejection return | Independent, on cost |
| Damage report, confirm, reject | A damage report | Damage hold (status); Condition change | Independent, on cost |
| Count freeze, count difference | A count | Count freeze (status); Count difference | Independent, on cost |
| Reversal | A correction | Reversal | Independent |

### 3.3 Fixtures

Built through the real interfaces of `S1-F01` to `S1-F09`, never by direct inserts: the synthetic Organisation through the setup step; a preparer, an approver and an Accounts user; the book BK-SYN with warehouse W1 and Store S1 as in stock-ledger 11.1, each business unit's mapping verified by a different person; SKU X with a piece-tracked profile; the book's cost formula and pool mode for the combination under test; the synthetic chart and maps of books-and-posting 16.1, approved by a different person; open periods; policy 9 recorded Signed with its values validated by a different person, as labelled synthetic status (DM-6); approval limits on cost through `S1-F05`. Every value says SYNTHETIC.

### 3.4 Scenario files

- One file per scenario and combination, in the style of the shared golden cases (shared-calculations 12.1): `synthetic: true`, the IDs it covers, its steps, the movement kinds each step must produce, the stock values after each step (stock-ledger 11.2 to 11.6 and 11.8), the journals (books-and-posting 16.2) and the end trial balance (16.3).
- Expected values are written by hand from those sections and reviewed, never produced by the code under test.
- The files outlive the harness: when a later stage builds the real document, the same story is re-run with that document in place of the harness command, as a regression.

### 3.5 Checks after every step

- stock-ledger 11.7: through the ledger's rebuild-and-compare operation (stock-ledger 2.1) and its read models.
- books-and-posting 16.5: through the trial balance and the posting-source rows that reconcile the inventory account with the ledger, movement by movement (books-and-posting 8.3).
- Raw invariant queries, such as "every piece is in exactly one place", run under a read-only verification role used only by tests (H6).

### 3.6 Matrix, failures and concurrency

- The story runs under the four combinations (moving average or FIFO, book pool or Site pool), each in its own cloned template database.
- Failures injected: no valid posting map at commit (nothing commits, the exception survives, a replay makes no second exception, and after the map is approved the document posts once; books-and-posting 15 test 8); a queued posting job that fails (its decision stays unused; `DEC-097`); a period locked while a posting waits (test 9); the same key with changed content; a document changed after approval.
- Concurrency on separate connections (stock-ledger 11.9): two sales of the last piece; two reservations of one quantity; a count freeze against a sale in flight; two documents sharing one number series; a large posting job against sales under a book pool.
- Isolation: a reader scoped to S1 sees only S1's lines and a trial balance marked partial (books-and-posting 15 test 18); the second Organisation sees nothing.
- The large-posting timing is an early signal only. The binding measurement is the counter in stage 4 (RR-189); SL-11 applies only if that test fails.

### 3.7 G10

- **G10a, in `S1-F10` acceptance:** with no rounding rule set, an outflow whose value does not divide into whole paise is refused with its reason and commits nothing (stock-ledger 7.10); an outflow that empties the pool takes all its remaining value, with no rounding needed (7.3).
- **G10b, when the rule is set (V-64, RR-124):** the values under the real rule. It is an acceptance item before moving-average postings go live, not a stage 1 exit item ([exit-checklists.md](exit-checklists.md) sections 1.1 and 2.3).

### 3.8 What the harness never does

- It never ships in a production composition and never posts on `kdps-test` or production.
- It never sets a KDPS value; it is not the design of the stage 2 to 4 documents, which get their own designs and tests.

## 4. Options considered

| Option | What it is | Verdict |
| --- | --- | --- |
| A. Synthetic document driver | Test-only documents calling the real interfaces, as above | **Recommended.** Proves the transaction, locks, approvals, constraints and journals without pulling later stages forward |
| B. Minimal real documents now | Build thin receiving, transfer, sale and return modules in stage 1 | Not recommended. Their designs do not exist (RR-024 to RR-026); thin versions would be settled in code and rebuilt later |
| C. Ledger tests only | Call ledger functions directly, without the command runner, approvals or Post | Not recommended. Misses lock order, approval use, the journals and the one-transaction rule the exit check is about |

## 5. Decisions

None of these changes the PRD or the policies; each is an architectural or test-design choice the product owner approves, then recorded in the ledger interface design and reviewed in DR-2.

**Taken on 5 Oct 2026 (`DEC-112`).** H1: option A, a test-only synthetic document driver that exercises the real stock and posting logic. H2: registered ledger callers; synthetic callers exist only in tests. H3: a test-only schema (house rules 11.4). H4: synthetic approval action types through the real approval machinery. H5: test runs only, in isolated test databases, never live. H6: both, with raw queries only under the read-only test role (house rules CH-4). Every golden scenario stays: receipt, transfer, sale, customer return, cost established at PT approval, late cost change, opening count, the supplier-return legs, damage, count and reversals; tests of the real documents follow when they arrive. The H5 recommendation's `dev` handler is not part of the decision: GC-6 section 12 plans a `dev` handler that posts synthetic opening counts, and whether it may run there as a registered caller, given H2 and H5, is a question for the product owner, not for design review (RR-013). Until it is answered, it runs in tests only.

The table keeps the options as they were put.

| # | Decision | Options | Recommendation | Who |
| --- | --- | --- | --- | --- |
| H1 | How stage 1 drives the golden scenarios | A, B or C of section 4 | A | Product owner |
| H2 | How the ledger knows who is posting | The ledger interface takes a source-document reference (owning module, kind, identity, version) from registered callers and refuses an unregistered one; the harness registers only in the test composition. Or the ledger trusts any caller | Registered callers. The same guard can refuse a historical-reference source, as GC-6 4.2 proposes | Product owner; design review |
| H3 | Where harness documents are stored | A test-only schema and migration set applied to test databases only. Or documents held in memory, with no row to lock | Test-only schema, written into house rules part A | Product owner; design review |
| H4 | How harness approvals are defined | Synthetic action types in test code, with independence required and a cost value basis like the stock actions of domain-model section 5. Or golden scenarios without approvals | Synthetic action types, labelled synthetic; the real action types arrive with their modules | Product owner |
| H5 | Where the harness may run | Test runs only. Or also as a scenario runner on `dev` | Test runs only. GC-6 section 12 already plans a `dev` handler for synthetic opening counts; it should use the same guarded caller registration, allowed only on `dev` with synthetic data | Product owner |
| H6 | How tests read invariants | Through the ledger's rebuild-and-compare and the finance read models only. Or also raw queries under a read-only verification role | Both: read models first, raw queries only under the read-only test role | Design review |

## 6. After the decisions

1. Write the stock ledger interface and tables (RR-012), including H2, and record H1 to H6 there. House rules part A already records H3 (11.4) and H6 (CH-4).
2. Review them with the 25 never-reviewed ledger sections in DR-2.
3. Break `S1-F10` into tasks, in this order: ledger tables and constraints; the operations of the story; the hand-off to Post; the harness driver, fixtures and scenario files; the four-combination matrix; scenarios G2 to G13 with G10a; failure and concurrency suites; the large-posting job; acceptance evidence.
