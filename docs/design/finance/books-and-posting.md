# Books and posting

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Current**, 4 Oct 2026. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements these PRD sections: Ledger and official books (the books, their periods, journals and posting rules); from Module and data boundaries and Transaction and integration integrity, balanced journals at commit, immutable entries, idempotency and locking for posting. It details the `finance` · books part of [module-map.md](../architecture/module-map.md) 4.14 and is GC-4 in [gaps-before-code.md](../../history/gaps-before-code.md).

- PRD IDs: `PRD-ACP-004`, `PRD-ACP-013`, `PRD-ACP-018`, `PRD-ACS-007`, `PRD-ACS-013`, `PRD-EXC-001`, `PRD-EXC-004`, `PRD-INT-002`–`PRD-INT-004`, `PRD-INT-008`, `PRD-LED-001`–`PRD-LED-005`, `PRD-LED-008`–`PRD-LED-012`, `PRD-LED-014`–`PRD-LED-020`, `PRD-LIF-008`, `PRD-MOD-003`, `PRD-MOD-008`–`PRD-MOD-011`, `PRD-MOD-013`–`PRD-MOD-015`, `PRD-NAV-001`–`PRD-NAV-014`, `PRD-OFF-009`, `PRD-OFF-014`, `PRD-ORG-001`, `PRD-ORG-005`, `PRD-ORG-006`, `PRD-ORG-020`, `PRD-PRF-003`, `PRD-PRF-004`, `PRD-SEC-005`, `PRD-SEC-017`, `PRD-SEC-018`, `PRD-STG-002`, `PRD-UXP-003`.
- Policies: 2 (`POL-02.16`), 9 (`POL-09.01`–`POL-09.05`, `POL-09.10`–`POL-09.13`, `POL-09.16`, `POL-09.19`, `POL-09.21`, `POL-09.23`, `POL-09.24`), 11 (`POL-11.01`).
- Decisions: DEC-004, DEC-031, DEC-087, DEC-097, DEC-105, DEC-106, DEC-107, DEC-112, DEC-116.

Depends on: [module-map.md](../architecture/module-map.md) (4.14, 6 and 7: the Post boundary and the one transaction), [domain-model.md](../architecture/domain-model.md) (3.10: the book records), [stock-ledger.md](../stock/stock-ledger.md) (sections 7, 10 and 11: valued movements, the lock order and the golden scenarios), [structure-and-masters.md](../masters/structure-and-masters.md) (3.2 and 3.4: books, legal entities and the business-unit mapping), [access-and-approvals.md](../access/access-and-approvals.md) (approvals, 9.8 for a document a job posts, and the exception record), [numbering-and-audit.md](../platform/numbering-and-audit.md) (journal numbers and the financial year).

Used by: every module that posts a money effect: the stock ledger from stage 1, then `merchandise` · PT, `receiving`, `stock` · documents, `supplier-returns`, `pos`, `finance` · operations, `site-lifecycle` and `hr`; the stage 1 code of `finance` · books; the stage 5 Tally exchange design.

---

## 1. What this document fixes

- The records of `finance` · books: books and their settings, the chart of accounts, financial periods, journals, posting maps and posting event kinds (`PRD-LED-001`, `PRD-LED-003`).
- The operations of module-map 4.14 made concrete: Post, Check postable, Reverse, period locks and reopenings, and the maintenance of accounts, maps and settings.
- How a valued stock movement reaches the books in its own transaction (`PRD-MOD-013`; stock-ledger 7.11).
- The tables of the books part (section 13), the tests (section 15) and the posting half of the stage 1 golden scenarios (section 16).

It fixes no account, map, rate, formula, rounding rule, period date or approver. Those are KDPS's, Accounts' and the CA's, and stay OPEN until supplied (section 17). It leaves out the `finance` · tax rules part, and the stage 5 work of `finance` · operations: the Tally exchange, month close and inter-book bank allocations (`PRD-LED-002`, `PRD-LED-010`, `PRD-LED-012`). It designs no manual journal. Labels (**Design choice**, **Proposed**, **OPEN**) mean what module-map section 1 says.

## 2. Books and their settings

### 2.1 Books

- A book's identity is kept by `organisation`: its code, its legal entity, fixed at creation, and its name (`PRD-ORG-001`, `PRD-ORG-020`; [structure-and-masters.md](../masters/structure-and-masters.md) 3.2). The ledger of the book, its chart, periods, journals, maps and settings are kept here (`PRD-LED-001`).
- Books are reached through the business unit, never the Site (`PRD-LED-002`, `PRD-ORG-005`). A posting names the business unit; Post reads the unit's mapping as of the accounting date from `organisation` and keeps the mapping version it used (`PRD-ACP-013`).
- Amounts are INR in integer paise (`PRD-MOD-014`). An Unknown amount is never posted and never turned into zero (`PRD-MOD-015`, `POL-09.02`).
- Tally remains KDPS's official book (`POL-11.01`). The books here are the internal ledger that each stage writes from its first live operation (`PRD-STG-002`), reconciled with Tally from stage 5 (`PRD-LED-011`).

### 2.2 Cost settings

- Each book has an effective-dated cost setting: the cost formula, FIFO or moving weighted average, and the cost-pool mode, one pool per SKU across the book or one per SKU at each Site (`PRD-LED-014`, `PRD-LED-015`, DEC-004, DEC-031). The stock ledger reads it (stock-ledger 7.1); it is kept here (module-map 4.14).
- There is no default. A book with no approved cost setting takes no valued movement (`PRD-SEC-017`). KDPS's formula and pool are OPEN (V-08, V-09, SL-1, `POL-09.19`); KDPS first keeps its current CA-approved method (`POL-09.21`).
- A version that changes the formula or the pool mode of a book that has held stock is refused until the CA has said how value is divided at the change (stock-ledger 7.12, SL-6). **Design choice.** `finance` asks whether the book has held stock through a contract it defines, "has this book held stock?", which `stock` · ledger implements, since `finance` cannot call `stock` (module-map section 3, rules 4 and 6; stock-ledger 13.7; product owner, 6 Oct 2026). Its shape is `hasHeldStock(context, book) → yes or no`, in the caller's transaction and whatever the asker may see, as stock-ledger 13.7 sets it (S1-F10-T01); S1-F09-T01 declares it, with its token, in `finance` · books.

### 2.3 Tally voucher model

- Each book has an effective-dated voucher-model setting: vouchers with items, which carry stock items and quantities, or vouchers without items, which carry amounts only (MM-12, DEC-105). It decides how the stage 5 exchange builds vouchers; it changes nothing in the journals here. **Design choice.**
- So that either choice works, every journal line keeps its links to the movements and document lines it came from (8.3). The quantities stay in the stock ledger and are read from it when a voucher with items is built; a journal never holds a quantity (`PRD-LED-005`).
- The setting has no default. Which value each book uses is OPEN (V-46; Accounts, CA; needed by 5, designed in 1). Avoiding a double stock or money effect in Tally is checked against KDPS's real Tally (`POL-09.16`).

## 3. Chart of accounts

### 3.1 Accounts

- Each book has its own chart of accounts (`PRD-LED-001`). An account has a code unique in its book, a name, and its nature: asset, liability, equity, income or expense. The nature is fixed at creation; the trial balance and the net asset value and profit reports group by it (`PRD-NAV-001`–`PRD-NAV-014`). **Design choice.**
- An account is a master with effective-dated versions ([structure-and-masters.md](../masters/structure-and-masters.md) 2.2). It is retired, never deleted, and a retired account takes no new line.
- The chart starts from KDPS's current chart, reviewed by Accounts and the CA (`POL-09.23`). The real accounts are OPEN (V-10; Accounts, CA; stage 2). Tests use the labelled synthetic chart of 16.1.

### 3.2 Dimensions

- Store and brand are dimensions on journal lines, not separate ledgers (`PRD-LED-001`, `POL-09.11`). Each line also carries the business unit it posts for, from which its book comes (`PRD-ORG-005`).
- A line carries a Store when its business unit belongs to one, and a brand when its source names one; a warehouse or office unit has no Store (`PRD-ORG-006`). The map says which dimensions each line requires (6.1). A missing required dimension refuses the posting. **Design choice.**
- Under a whole-book cost pool the Store on an inventory line names where the movement happened. It is not a Store value: how Store value is shown under a book pool is OPEN (SL-14; stock-ledger 7.1).

## 4. Financial periods

### 4.1 Periods

- A period is a date range of one book (`PRD-LED-001`). Its code is unique in its book. A period lies inside one financial year ([numbering-and-audit.md](../platform/numbering-and-audit.md) 3.3). Periods of a book never overlap and leave no gap after the book's first period. **Design choice.**
- Which date ranges each book uses is OPEN (GC4-1; Accounts, CA; stage 2). The financial year's dates are OPEN too (GC5-1). Tests use labelled synthetic periods.
- A period is Open, Locked or Reopened (DM-4, DEC-105; [design-language.md](../ui/design-language.md) section 7). The state is a projection of the period's events and reopenings (13.1); the period row itself holds only identity and dates. **Design choice.**

### 4.2 Lock

- A person whose role assignment grants the lock action on the book locks a period (`PRD-LED-009`). No source asks for a second person to lock, so none is asked. **Design choice.**
- Periods are locked in date order: a period is locked only when every earlier period of its book is locked. **Design choice.**
- A posting whose accounting date falls in a Locked period is refused (`PRD-LED-009`), unless a reopening names it (4.3).

### 4.3 Reopening

1. **Request.** An authorised person asks to reopen a Locked period. The request gives its reason and names the corrections it is for: each a source record, by owning module, record type and identifier (`PRD-LED-019`, `PRD-LED-020`).
2. **Approval.** A different authorised person from the requester approves it, through Request approval and Decide in `access` ([access-and-approvals.md](../access/access-and-approvals.md) 9.1 to 9.5; `PRD-LED-019`, DEC-106). The approval binds to the request as made: period, reason and named corrections (`PRD-ACS-007`). Adding a correction is a new request. **Design choice.** The action has no value basis. Who may request and who may approve is KDPS's (V-01).
3. **Reopened.** From the approval the period shows Reopened. Only postings whose source is a named correction may enter it; every other posting stays refused (`PRD-LED-020`, DEC-107).
4. **Locked again.** Each named correction's posting is recorded against the reopening in its own transaction. When every named correction has posted, or the reopening is withdrawn by its requester or an authorised person, the period shows Locked again with nothing more to do (`PRD-LED-020`). **Design choice:** no time limit, since `PRD-LED-020` sets none.
5. Several reopenings of one period may be in force at once. The period shows Reopened while any of them has a correction still to post.

### 4.4 The accounting date

- Each journal has an accounting date, apart from the business date of its source (stock-ledger 7.10). The accounting date is the source's business date, kept under the Organisation's timezone (`PRD-MOD-009`). **Design choice**, until SL-15 says otherwise for a late movement.
- When that date falls in a Locked period, the posting is refused unless a reopening names it (4.3). Which accounting date a late movement takes instead is OPEN (SL-15; Accounts, CA; stage 5). Until it is set, nothing moves a posting to another date.
- As section 10 says, a refused posting leaves its document as it was and raises an exception. Accounts may then ask for a reopening that names it, and the document is posted again.

### 4.5 Locking against posting

- Every transaction that posts takes the row of each period it posts into in shared mode, after the cost pool rows and before the number series (stock-ledger 10.3, step 7; MM-6, DEC-105). Postings into one period never wait for each other on the period row. They do wait on the book's journal series (5.4), which each holds from step 8 until commit; that is GC4-4.
- Locking a period, and the approval that reopens one, take the period row in exclusive mode. They wait for postings already holding it, and a posting that comes after them sees the new state under its lock (`PRD-INT-003`).
- The use of a named correction (4.3, step 4) is a row with a unique key on that correction. It needs no lock of its own, so stock-ledger 10.3 gains no step. **Design choice.**

## 5. Journals

### 5.1 What a journal holds

| Part | What it holds | IDs |
| --- | --- | --- |
| Book | One book. A posting that affects two books writes one journal in each | `PRD-LED-001`, `PRD-MOD-013` |
| Dates | Accounting date (4.4) and business date; event and recording times | `PRD-MOD-009` |
| Event kind | The posting event kind (section 7) | `PRD-LED-003` |
| Source | The source document: owning module, record type, identifier and version | `PRD-LED-004` |
| Map version | The posting map version applied | `POL-09.12`, `PRD-MOD-010` |
| Business-unit mapping | The mapping version Post read for each unit | `PRD-ACP-013` |
| Number | From the journal series (5.4) | `PRD-MOD-008` |
| Actor | The user or service identity, and the person a job acts for | `PRD-ACS-013`, `PRD-SEC-018` |
| Reverses | The journal this one reverses, if any | `PRD-LED-004`, `PRD-MOD-011` |
| Lines | Account, side (debit or credit), amount in paise above zero, business unit, Store and brand | `PRD-LED-001`, `PRD-MOD-014` |

### 5.2 Balanced at commit

- Each journal's debits equal its credits, and it has at least two lines (`PRD-LED-004`, `PRD-MOD-013`). Post checks this before it writes; a deferred constraint trigger checks it again at commit, so a journal that does not balance never commits (`POL-09.13`). **Design choice** of the trigger.
- There is no tolerance for an unbalanced journal, a duplicate posting or an unexplained missing one (`POL-09.13`). The rounding and invoice tolerances of `POL-09.24` never apply to a journal's balance.

### 5.3 Never changed

- A posted journal and its lines are never updated or deleted. The runtime role may insert and read them only, and a trigger refuses every update and delete (`PRD-LED-004`, `PRD-MOD-011`). **Design choice** of the guard.
- A mistake is undone by a linked reversal (9.1, 9.4). A journal is reversed at most once. A reversed journal shows Reversed ([design-language.md](../ui/design-language.md) section 7).

### 5.4 Numbers

- Each journal takes a number from a series of the kind journal, one per book and financial year, allocated in the posting transaction from a series the caller locked at stock-ledger 10.3 step 8 ([numbering-and-audit.md](../platform/numbering-and-audit.md) 3.2, 3.3). Baseline (DEC-112, GC4-4): one series per book and financial year, its row held only from that step to commit, without splitting a posting's one transaction. Concurrent posting and large posting jobs are proved before acceptance (test 10; stock-ledger 10.6). If the performance test fails, the series is revisited with Accounts; posting in ordered chunks would change atomicity and needs its own decision (SL-11). Accounts confirms.
- The format is the Organisation's choice, with no default ([numbering-and-audit.md](../platform/numbering-and-audit.md) 3.5). Tests use a labelled synthetic format.

## 6. Posting maps

### 6.1 What a map is

- A posting map says, for one book and one posting event kind, which accounts take each amount the event carries (`PRD-LED-003`, `POL-09.11`).
- A map version is a set of lines. Each line names a component of the event kind (7.1), a side and an account of the same book, and the dimensions the line requires (3.2). A component may have lines on both sides or on one; the journal as a whole must balance (5.2). **Design choice.**
- A component with a positive amount posts on its line's side; a negative amount posts the same value on the other side. **Design choice.**
- Every component of the event kind has at least one line. A map can never say "no journal" for a valued movement, because the movement and its journals commit together (`PRD-MOD-013`, DEC-087). **Design choice.**
- Which accounts each event kind uses, and so what each posting recognises, is Accounts' and the CA's under the recognition rules of policy 9 (`POL-09.02`–`POL-09.05`). The design sets none. The real maps are OPEN (V-10, SL-3; Accounts, CA; stage 2).

### 6.2 When a map is valid

A posting finds a valid map only when all of these are true on the accounting date:

1. One map version for the book and event kind is in force on that date, and it was approved (6.3).
2. Every component the posting carries has a line.
3. Every account on those lines is in force and not retired.
4. Every dimension the lines require is present.
5. The journal the lines make balances (5.2).

Otherwise the map is missing or invalid, and the posting is refused with the failed condition as its reason (`POL-09.12`; section 10).

### 6.3 Approval and versions

- Accounts and the CA supply the accounts and the maps, and approve the framework and rules before activation (`POL-09.01`, `POL-09.11`, `POL-09.23`). A map version, an account version, a cost setting and a voucher-model setting take effect only with an approval decision that records the approval of Accounts and the CA (`POL-09.01`).
- Baseline (DEC-112, GC4-2): an authorised Accounts user prepares the change, and a different authorised Accounts user, never one of its preparers, decides it in the app ([access-and-approvals.md](../access/access-and-approvals.md) 9.3). Before the version takes effect, the decision attaches or references the CA's approval evidence. Attached evidence is a real stored file of `files-imports` (`S1-F06-T05`; module-map 4.7; product owner, 6 Oct 2026). A reference names what the evidence is, who gave it, its date and where it is kept. **Design choice** of the reference. The CA need not use the app, and one piece of evidence may cover a named set of versions if it says which. Ordinary postings under an approved version need no fresh CA approval. This is the workflow only: Accounts and the CA confirm it (CA question 18), and their actual approval of the framework and rules is still needed before activation (`POL-09.01`).
- Versions are effective-dated and never overlap for one book and event kind (`PRD-MOD-010`). No version starts on a past date, as for every master (GC2-7, DEC-105; [structure-and-masters.md](../masters/structure-and-masters.md) 2.2). A version in force is never edited; a change is a new version.
- Each journal keeps the map version it applied (`POL-09.12`). A later version never changes a posted journal.
- A change emits `finance.posting-map-changed` (module-map section 8).

## 7. Posting event kinds

### 7.1 Rules

- A posting event kind names one kind of money effect and the amounts it carries, called components. Each component is a signed amount in paise. **Design choice.**
- The module that posts the event declares the kind in code, with its components and the stage it goes live, before its code posts it. Its design lists it here first. **Design choice**, like events (module-map section 8).
- A kind is named after its owner, in the form `module.effect`. Post knows kinds and amounts, never stock (module-map 4.14).
- Each kind has a reversal kind with the same components, for the linked reversal of a movement or document of that kind. The reversal of an inflow made in error also carries a `variance` component for the part that would take a pool below zero (stock-ledger 7.5, `PRD-LED-018`). A reversal kind is mapped like any other kind; nothing mirrors it by default.

### 7.2 Stock kinds

Declared by `stock` · ledger for its valued movements (stock-ledger 2.3, section 7). Built and tested in stage 1; live from the stage named.

| Event kind | Valued movement | Components | Live |
| --- | --- | --- | --- |
| `stock.cost-established` | Cost established: value enters a pool, or a dispatch in transit (stock-ledger 7.6) | `to-pool`, `to-dispatch` | 2 |
| `stock.cost-adjustment` | Cost adjustment: a later approved cost change follows its goods (stock-ledger 7.7, `PRD-LED-016`) | `to-pool`, `to-dispatch`, `to-cogs`, `to-supplier-claim`, `to-loss`, `excess-to-cogs` | 2 |
| `stock.sale-issue` | Sale issue at the formula cost (stock-ledger 7.5) | `cost` | 4 |
| `stock.customer-return` | Customer return at the cost its sale issued (stock-ledger 7.5, `PRD-LED-017`) | `cost` | 4 |
| `stock.pool-dispatch` | Dispatch from one pool to another: value leaves the source pool for the dispatch (stock-ledger 7.8) | `cost` | 3 |
| `stock.pool-arrival` | Arrival count: value enters the destination pool from the dispatch (stock-ledger 7.8) | `cost` | 3 |
| `stock.failed-delivery-return` | Failed delivery: value returns to the source pool from the dispatch (stock-ledger 7.8) | `cost` | 3 |
| `stock.dispatch-loss` | Units missing at arrival, recorded as lost under approval (stock-ledger 7.8) | `cost` | 3 |
| `stock.supplier-return-departure` | Value leaves the pool for the supplier-return shipment (stock-ledger 7.8) | `cost` | 3 |
| `stock.supplier-handover` | Value leaves the shipment at confirmed handover or supplier receipt (stock-ledger 7.8) | `cost` | 3 |
| `stock.supplier-rejection-return` | Refused goods return to the pool at the shipment's value (stock-ledger 7.8) | `cost` | 3 |
| `stock.count-loss` | Count shortage at the formula cost (stock-ledger 8.3) | `cost` | 3 |
| `stock.write-off` | Write-off at the formula cost (stock-ledger 7.9) | `cost` | 3 |
| `stock.disposal-loss` | Disposal of goods not written off first (stock-ledger 7.9) | `cost` | 3 |
| `stock.pass-through` | A supplier-owned unit whose ownership passes at its sale goes in and out at the agreed cost (stock-ledger 7.2; a working assumption, SL-4) | `cost` | 4 |
| `stock.nrv-write-down` | Net realisable value write-down (stock-ledger 7.9; how it is worked out is SL-5) | `cost` | 5 |

- Found goods matched to a recorded loss post as the reversal of that loss, at the cost the loss took (stock-ledger 8.4, `PRD-LED-017`).
- A movement with no value posts nothing: a pre-PT receipt count, a location move, a move inside one pool, an acceptance, hold or reservation (module-map section 7; `PRD-ACP-004`). Opening stock posts no automatic journal (`PRD-LIF-008`).
- The supplier-return variance against the supplier's credit is posted when the credit note is matched, by `finance` · operations, not by the stock ledger (stock-ledger 7.5, `PRD-LED-017`).

### 7.3 Later kinds

Each is declared by its own design before its stage, under the recognition and posting rules of policy 9 (`PRD-LED-003`). Outline only.

| Owner | What its kinds record | Stage |
| --- | --- | --- |
| `finance` · operations | Supplier invoices and their matching; the supplier-return variance at credit-note matching; day-close cash variance; payments, receipts and contra; provider settlement; depreciation | 2 to 5 |
| `pos` | Sale revenue, tax, tenders and rounding; customer refunds, Store credit and Gift vouchers | 4 |
| `site-lifecycle` | Financial opening balances at a Store's switch (policy 14) | 4 |
| `hr` | Payroll | 6 |

## 8. The hand-off from valued stock movements

### 8.1 The call

- The stock ledger calls Post inside the movement's transaction, once per business document, for all its valued movements. It writes no journal itself (stock-ledger 7.11, DEC-087).
- For each valued movement it passes an item: the movement's identifier as the item key, the event kind, the business unit, the brand, the business date and the component amounts. The Store is taken from the unit and checked against what the caller passed (module-map 4.14).
- Post finds each unit's book through the unit's mapping on the accounting date (2.1), the period (4.4) and the map (6.2).

### 8.2 One journal per book, kind and date

- Post writes one journal for each book, event kind and accounting date in the document. Its lines are summed by account, side, business unit, Store and brand. **Design choice:** a 10,000-line document makes a handful of journals, not 10,000 (stock-ledger 10.6).
- A transfer between pools in two books of one legal entity posts the dispatch in the source book and the arrival in the destination book, each journal balanced in its own book (stock-ledger 7.8). The accounts that carry the value between the two books come from their maps (V-10).

### 8.3 Where each line came from

- For each item and component, Post writes a posting-source row: the source module, the item key, the component, its signed amount and the journal line it went into (`PRD-LED-004`).
- These rows let the inventory account be reconciled with the stock ledger's read model, movement by movement (`PRD-LED-008`), and let a voucher with items be built later (2.3).

### 8.4 Order and value

- Value is worked out by the stock ledger in posting order, under its pool locks (stock-ledger 7.10). Post takes the amounts as given; it never values stock.
- An Unknown amount refuses the item (`PRD-MOD-015`). The stock ledger sends none, because a movement of Unknown value posts nothing (7.2).

## 9. Operations

### 9.1 Interface

The operations of module-map 4.14, made concrete. "Hold periods" is added as a **design choice**, so the period rows are locked at their step before any write.

| Operation | Called by | Returns or does | Refuses when |
| --- | --- | --- | --- |
| Check postable | The caller, before any lock | For each item: the book, the period and its state, the map version and the journal number series, or the reasons it would be refused. Writes nothing and locks nothing (module-map 6.1, step 4) | — |
| Hold periods | The caller's transaction, at stock-ledger 10.3 step 7 | Takes each period row the items post into in shared mode (4.5) | A period does not exist; it is Locked and no reopening names the item's source |
| Post | `stock` · ledger for valued movements; any module for its own money effect, in its transaction | Rechecks under the locks, then writes the journals (8.2), their lines and posting-source rows, and the use of a named correction (4.3); takes journal numbers; emits `finance.journal-posted`. Returns the result of 9.2 (`PRD-LED-003`, `PRD-LED-004`, `PRD-MOD-013`, `POL-09.11`, `POL-09.12`) | No valid map (6.2); the period is Locked, or Reopened for other corrections (`PRD-LED-009`, `PRD-LED-020`); an amount is Unknown; a required dimension is missing; the journal would not balance (`POL-09.13`); an item was already posted with different content (9.3) |
| Reverse | The module that owns the source record | A new journal with the same lines on opposite sides, linked to the one it reverses, dated on the reversal's own business date (`PRD-LED-004`, `PRD-MOD-011`) | The journal is already reversed; the reversal's period is Locked, or Reopened for other corrections |
| Lock a period | Accounts, with authority | 4.2; emits `finance.period-locked` | An earlier period of the book is not Locked |
| Request, withdraw a reopening | Accounts, with authority | 4.3 | The period is not Locked; no correction is named |
| Approve a reopening | A different authorised person | 4.3, through `access`; emits `finance.period-reopened` | The approver is the requester (`PRD-LED-019`) |
| Maintain accounts, maps and settings | Accounts; approved under 6.3 | New versions of accounts, maps, cost settings and voucher-model settings | 6.3; 2.2 (a formula or pool change) |
| Read | Reports and `finance` · operations, through the read-model gateway | Section 12 | — |

### 9.2 Results

- Post answers with one result per document: Posted, with the journals and the map version each used; Nothing to post, when every component is zero; or Refused, with each refused item and its reason. It never skips a journal silently (module-map 6.3).
- One refused item refuses the whole document; the caller's transaction rolls back (`PRD-INT-004`; stock-ledger 10.2).

### 9.3 Idempotency

- A posting-source row is unique on source module, item key and component. Post is idempotent on its source reference: an item already posted with the same content returns its first result, and replay never doubles a journal (`PRD-INT-002`, `PRD-INT-008`).
- An item already posted with different content is refused (`refused`, 9.1), whatever idempotency key its command carries. The changed item is kept for investigation as an exception raised after the business transaction rolls back, in the way module-map 6.3 raises one for a missing posting map ([module-map.md](../architecture/module-map.md) 4.13, 6.3): its evidence names the source reference and keeps the changed item's content (component, amount, accounts and dimensions) with the hashes of the posted and the changed content, never a secret, and any restricted value only encrypted ([code-house-rules.md](../platform/code-house-rules.md) 12.4; `PRD-INT-002`). `finance` opens no transaction of its own inside Post. **Design choice.**

### 9.4 Correcting a posting

- When a journal used a map later found wrong, Accounts correct it: a linked reversal (9.1) and a new journal for the same source items. Its posting-source rows point to the rows they replace. **Design choice.**
- Both are dated on the correction's own business date. The reversal carries the original lines on opposite sides and keeps the original map version (9.1). The new journal uses the map version in force on that date, so a corrected version, which never starts on a past date (6.3), applies. The movement and its stock values do not change. **Design choice.**
- Whether such a correction should instead fall in the original period is OPEN (GC4-3; Accounts, CA; stage 5).

## 10. No valid map, or no open period (SL-23)

For a missing or invalid map the baseline is Outcome A (SL-23, DEC-105; the CA confirms; module-map 6.3). Post's other refusals in 9.1, such as a Locked period (`PRD-LED-009`), end the same way for another reason: the movement and its journals commit together or not at all (`PRD-MOD-013`, `PRD-INT-004`, DEC-087). Which accounting date a late movement could take instead stays OPEN (SL-15).

1. **Before the locks.** The caller runs Check postable. A refusal stops the command before any lock: nothing is written, and the person sees the reason (`PRD-UXP-003`).
2. **Under the locks.** Post repeats every check. A refusal rolls back the whole transaction: no number, movement, balance, pool row, journal, approval use, audit or outbox row commits. The document stays as it was (`PRD-INT-004`).
3. **The exception.** The calling module raises an exception of the type unfinished operation in a new transaction of its own, so the rollback does not lose it (`PRD-EXC-001`; module-map 4.13). It links the document, and the book and event kind of the refused map, and gives the reason. It is keyed by the command's idempotency key, so a replay makes no second exception; a new exception on the same book and event kind links to the open one (`PRD-EXC-004`, `PRD-INT-008`). It is routed as a money exception to Accounts (`POL-02.16`); the real owner is OPEN (V-03).
4. **By caller:**
   - An online counter sale is refused with its reason, and its cart is kept (`PRD-UXP-003`; module-map 6.3).
   - A job posting a large document leaves its approval decision recorded and unused, and the document shows the failure ([access-and-approvals.md](../access/access-and-approvals.md) 9.8; DEC-097).
   - An offline bill already issued goes to the visible reconciliation queue and is never discarded (`PRD-OFF-009`, `PRD-OFF-014`; stock-ledger 10.5).
5. **After the fix.** Once a valid map is approved, or a reopening names the document, the document is posted again and posts once (9.3).

`POL-09.12` asks to preserve the underlying operational event. Under Outcome A that event is preserved by the document staying as it was and by the exception, not by a committed movement (module-map 6.3).

## 11. The policy gate

- `finance` · books registers a validity check for the Financial posting policy with `configuration` (module-map section 3, rule 6). Policy 9 is valid for a book only when it is Signed, its real values are validated (DM-6, DEC-105), and the book has an approved cost setting, a chart in force, a period covering today, and an approved map for every event kind that each enabled operation posts.
- An operation whose posting configuration is not valid stays unavailable and names what is missing (`PRD-SEC-017`, `PRD-UXP-003`). Section 10 is the case left over at commit.

## 12. Read models

- **Ledger:** the lines of an account in a book over a date range, with their opening and closing balances, dimensions, journal numbers and source links (`PRD-LED-001`, `PRD-LED-004`).
- **Trial balance:** per book and period, each account's opening balance, debits, credits and closing balance; total debits equal total credits (`PRD-MOD-013`).
- Both carry their as-of time (`PRD-MOD-003`, `PRD-PRF-004`), and are labelled as the internal ledger, not the official book (`POL-11.01`).
- Rows carry the book's legal entity and the line's business unit, Store and brand as scope facts, and row-level security applies ([access-and-approvals.md](../access/access-and-approvals.md) 5.3 and 7.2; `PRD-SEC-005`). A reader whose scope covers only part of a book sees the lines in scope, and the trial balance says it is partial (`PRD-PRF-004`). **Design choice.**
- In stage 1 they run on synthetic data (module-map 4.14).

## 13. Tables

Every table has a UUIDv7 primary key. "+ versions" means a companion table of effective-dated versions with an exclusion constraint on approved versions ([structure-and-masters.md](../masters/structure-and-masters.md) 2.2). The module owns one PostgreSQL schema, and a reference to another module's record keeps its identifier without a foreign key ([structure-and-masters.md](../masters/structure-and-masters.md) 2.5). **Design choice** throughout; other columns are left to reviewed migrations.

### 13.1 Schema `finance`

The books part's tables. The tax rules and operations parts add theirs in their own designs.

| Table | Unique | Other constraints |
| --- | --- | --- |
| `book_setting` + versions | book and setting kind | kind is cost or voucher model; a version takes effect only when approved (6.3); no past start; a formula or pool change refused while 2.2 says so |
| `account` + versions | book and code | nature fixed; retired, never deleted |
| `financial_period` | book and code | date range inside one financial year; no overlap per book (exclusion constraint); no gap, checked by a trigger |
| `period_event` | — | append-only: locked; with `period_reopening`, the source of the state projection (4.1) |
| `period_reopening` | — | request, reason, requester, approval decision, withdrawal; takes effect only with a decision by a different person, checked by `access` (`PRD-LED-019`) |
| `period_reopening_source` | reopening and source record | the named corrections (`PRD-LED-020`) |
| `period_reopening_use` | named correction | one use, written in the posting transaction (4.5) |
| `posting_map` + versions | book and event kind | approved versions never overlap; no past start; in force only when approved (6.3) |
| `posting_map_line` | — | component, side and account of the map's book; required dimensions |
| `journal` | number | book, accounting date, event kind, map version and source fixed; insert only; a reversal names the journal it reverses, unique, in the same book; refused into a Locked period, or a Reopened one without a named correction, by a trigger as the last guard |
| `journal_line` | — | account of the journal's book; side debit or credit; amount in paise above zero; insert only; debits equal credits per journal, checked by a deferred constraint trigger at commit |
| `posting_source` | source module, item key and component | signed amount; the journal line it went into; replaces, for a correction (9.4); insert only |

## 14. Screens

- In stage 1, book settings and the chart of accounts are reached through the API only. Their screens are designed and built before the first live posting, in stage 2 (product owner, 6 Oct 2026; DEC-116).
- [ui-blueprint.html](../ui/ui-blueprint.html) holds these screens: Setup › Posting maps; Money › Internal ledger and trial balance, and Period close (checklist and locks).
- GC-4 adds four things to them:
  - A map shows, for its book and event kind, every component and its lines, the version in force on a chosen date, and its approval.
  - Period close shows each period's state, the reopenings in force with their named corrections, and which of them have posted (`PRD-LED-019`, `PRD-LED-020`).
  - A refused posting names its reason: the missing map, the failed condition of 6.2, or the Locked period (`PRD-UXP-003`).
  - The ledger and trial balance say they are the internal ledger, show their as-of time, and say when they are partial (section 12).

## 15. Tests on synthetic data

All data is labelled synthetic and never becomes a default (`AGENTS.md`: "Never invent a value"). Tests run against real PostgreSQL.

| # | Test | IDs |
| --- | --- | --- |
| 1 | **Stage 1 exit check.** The posting half of the golden scenarios (section 16) passes under both formulas and both pool modes | `PRD-ACP-018`, `PRD-LED-014`, `PRD-LED-015` |
| 2 | A journal whose lines do not balance never commits, even when written past the service, by the deferred trigger | `PRD-MOD-013`, `POL-09.13` |
| 3 | The runtime role cannot update or delete a journal or a line; a correction is a linked reversal, reversed at most once | `PRD-LED-004`, `PRD-MOD-011` |
| 4 | The same item posted twice gives one journal and the same result; the same item with changed content is refused and kept | `PRD-INT-002`, `PRD-INT-008` |
| 5 | An Unknown amount is refused; a pre-PT movement makes no journal (G2) | `PRD-MOD-015`, `PRD-ACP-004` |
| 6 | A posting dated before a new map version uses the old version; one dated after uses the new; each journal keeps its own | `POL-09.12`, `PRD-MOD-010` |
| 7 | **Stage 1 exit check.** One Site with two business units in two books: each posting goes to its own unit's book and keeps the mapping version it used | `PRD-ACP-013`, `PRD-LED-002`, `PRD-ORG-005` |
| 8 | No valid map at commit: nothing commits (no number, movement, pool row, journal or approval use); the exception survives the rollback; a replay makes no second exception; after the map is approved the document posts once | `PRD-INT-004`, `PRD-EXC-001`, `POL-09.12`, DEC-105 |
| 9 | A lock waits for a posting in flight in the same period; a posting after the lock is refused | `PRD-LED-009`, `PRD-INT-003` |
| 10 | Postings into one period do not wait for each other on the period row; the wait on the journal series is measured, not assumed away (GC4-4) | `PRD-PRF-003` |
| 11 | A reopening approved by its requester is refused; approved by another authorised person, the period shows Reopened | `PRD-LED-019` |
| 12 | In a Reopened period a named correction posts once; any other posting is refused; when the last named correction posts, or the reopening is withdrawn, the period shows Locked | `PRD-LED-020` |
| 13 | A period cannot be locked while an earlier one is open; periods of a book cannot overlap or leave a gap | `PRD-LED-009` |
| 14 | A map with a component that has no line, or a retired account, or a missing required dimension is invalid, and Check postable gives the same reason as Post | `POL-09.12` |
| 15 | A book with no approved cost setting or map leaves the operation unavailable and names what is missing | `PRD-SEC-017`, `PRD-UXP-003` |
| 15a | A map, account, cost-setting or voucher-setting version decided by its preparer is refused; a decision by a different Accounts user that attaches or references no CA approval evidence gives the version no effect; one piece of evidence naming several versions covers each of them | `POL-09.01`, DEC-112 |
| 16 | A 10,000-line document makes one journal per book, event kind and date, and one posting-source row per movement and component | `PRD-LED-004`, `PRD-PRF-003` |
| 17 | A queued posting refused at commit leaves its approval decision unused | DEC-097, `PRD-INT-004` |
| 18 | A reader scoped to one Store sees only that Store's lines, and the trial balance says it is partial | `PRD-SEC-005`, `PRD-PRF-004` |

## 16. Golden scenarios: the posting half

The journals posted from the story of stock-ledger 11.1, under the four combinations of stock-ledger 11.2 to 11.5. The stock values are those tables'; this section adds only the journals.

> **All data in this section is SYNTHETIC.** The accounts, maps, periods and numbers are test data only. They never become a default, a KDPS value or a policy value, and they settle no recognition rule (`POL-09.02`, `POL-09.05`).

### 16.1 Synthetic chart and maps

One book, BK-SYN, with one open synthetic period covering the story. Every line also carries the business unit of its movement (W1 or S1) and the synthetic brand of SKU X.

| Account | Nature | Used for |
| --- | --- | --- |
| SYN-INV | Asset | Stock in cost pools |
| SYN-TRN | Asset | Value held on a dispatch between pools |
| SYN-RSH | Asset | Value held on a supplier-return shipment |
| SYN-CLM | Asset | Supplier claim after handover |
| SYN-PUR | Liability | Purchase clearing: the other side of cost established and cost adjustment |
| SYN-COGS | Expense | Cost of goods sold |
| SYN-LOSS | Expense | Late-cost shares of written-off or lost goods |
| SYN-VAR | Expense | Variance left by a reversal of an inflow made in error |

| Event kind | Component | Debit | Credit |
| --- | --- | --- | --- |
| `stock.cost-established` | `to-pool` | SYN-INV | SYN-PUR |
| `stock.cost-established` | `to-dispatch` | SYN-TRN | SYN-PUR |
| `stock.cost-adjustment` | `to-pool` | SYN-INV | SYN-PUR |
| `stock.cost-adjustment` | `to-dispatch` | SYN-TRN | SYN-PUR |
| `stock.cost-adjustment` | `to-cogs` | SYN-COGS | SYN-PUR |
| `stock.cost-adjustment` | `to-supplier-claim` | SYN-CLM | SYN-PUR |
| `stock.cost-adjustment` | `to-loss` | SYN-LOSS | SYN-PUR |
| `stock.cost-adjustment` | `excess-to-cogs` | SYN-COGS | SYN-PUR |
| `stock.pool-dispatch` | `cost` | SYN-TRN | SYN-INV |
| `stock.pool-arrival` | `cost` | SYN-INV | SYN-TRN |
| `stock.sale-issue` | `cost` | SYN-COGS | SYN-INV |
| `stock.customer-return` | `cost` | SYN-INV | SYN-COGS |
| `stock.supplier-return-departure` | `cost` | SYN-RSH | SYN-INV |
| `stock.supplier-handover` | `cost` | SYN-CLM | SYN-RSH |
| `stock.cost-established` reversal | `to-pool` | SYN-PUR | SYN-INV |
| `stock.cost-established` reversal | `to-dispatch` | SYN-PUR | SYN-TRN |
| `stock.cost-established` reversal | `variance` | SYN-PUR | SYN-VAR |

### 16.2 Journals per step

Values in ₹. "—" means no valued movement, so no journal. Each row is one balanced journal, or one component of one.

| Step | Event kind · component | Debit | Credit | Moving average, book | Moving average, Site | FIFO, book | FIFO, Site |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `stock.cost-established` · `to-pool` | SYN-INV (W1) | SYN-PUR | 1,000.00 | 1,000.00 | 1,000.00 | 1,000.00 |
| 2 | `stock.cost-established` · `to-pool` | SYN-INV (S1) | SYN-PUR | 780.00 | 780.00 | 780.00 | 780.00 |
| 3 dispatch | `stock.pool-dispatch` · `cost` | SYN-TRN | SYN-INV (W1) | — | 400.00 | — | 400.00 |
| 3 arrival | `stock.pool-arrival` · `cost` | SYN-INV (S1) | SYN-TRN | — | 400.00 | — | 400.00 |
| 4 | `stock.sale-issue` · `cost` | SYN-COGS (S1) | SYN-INV (S1) | 556.25 | 590.00 | 500.00 | 650.00 |
| 5 | `stock.customer-return` · `cost` | SYN-INV (S1) | SYN-COGS (S1) | 111.25 | 118.00 | 100.00 | 130.00 |
| 6 | `stock.cost-adjustment` · `to-pool` | SYN-INV | SYN-PUR | 120.00 | 120.00 (W1 90.00, S1 30.00) | 90.00 | 150.00 (W1 90.00, S1 60.00) |
| 6 | `stock.cost-adjustment` · `to-cogs` | SYN-COGS | SYN-PUR | 30.00 | 30.00 | 60.00 | — |
| 7 departure | `stock.supplier-return-departure` · `cost` | SYN-RSH | SYN-INV (S1) | 121.25 | 123.00 | 115.00 | 130.00 |
| 7 handover | `stock.supplier-handover` · `cost` | SYN-CLM | SYN-RSH | 121.25 | 123.00 | 115.00 | 130.00 |

- Step 3 under a book pool moves custody inside one pool, so it posts nothing (stock-ledger 7.8).
- Step 6 is one journal per combination: the cost-adjustment components share it, with SYN-PUR credited 150.00 in each.
- Step 7's variance against the supplier's ₹130.00 credit (stock-ledger 11.6) is posted later, when the credit note is matched (7.2). It is not in these journals.

### 16.3 End trial balance

| Account | Moving average, book | Moving average, Site | FIFO, book | FIFO, Site |
| --- | --- | --- | --- | --- |
| SYN-INV (debit) | 1,333.75 | 1,305.00 (W1 690.00, S1 615.00) | 1,355.00 | 1,280.00 (W1 690.00, S1 590.00) |
| SYN-COGS (debit) | 475.00 | 502.00 | 460.00 | 520.00 |
| SYN-CLM (debit) | 121.25 | 123.00 | 115.00 | 130.00 |
| SYN-TRN, SYN-RSH | 0.00 | 0.00 | 0.00 | 0.00 |
| SYN-PUR (credit) | 1,930.00 | 1,930.00 | 1,930.00 | 1,930.00 |

- In every column, debits and credits are 1,930.00 each.
- SYN-INV equals the stock value, SYN-COGS the cost of goods sold and SYN-CLM the value out by supplier return in stock-ledger 11.6.

### 16.4 Further posting scenarios

| # | Scenario | Must show |
| --- | --- | --- |
| P1 | G7: Site pools; after step 3's dispatch and before its arrival, R1's cost rises by ₹15.00 a piece | One `stock.cost-adjustment` journal under both formulas: `to-pool` 90.00 to SYN-INV (W1) and `to-dispatch` 60.00 to SYN-TRN, SYN-PUR credited 150.00. The arrival then posts 460.00 from SYN-TRN to SYN-INV (S1). SYN-TRN ends at 0.00 (stock-ledger 7.7) |
| P2 | G13: book pool, both formulas; step 1 is found miscounted after step 2 and 4 pieces are reversed | A `stock.cost-established` reversal of 400.00: SYN-PUR debited, SYN-INV credited; SYN-INV then 1,380.00; no `variance` (`PRD-LED-018`) |
| P3 | G2: a receipt counted before PT approval; one piece disposed of; the PT approved | No journal for the count or the disposal; the PT approval posts `stock.cost-established` for the remaining pieces only (`PRD-ACP-004`) |
| P4 | Step 1 with no approved map for `stock.cost-established` | Nothing commits and the PT revision stays as it was; one exception is raised; after the map is approved, step 1 posts once (section 10) |
| P5 | Step 4 dated in a Locked period | Refused; with a reopening that names the bill, it posts; the period then shows Locked (4.3) |
| P6 | Opening stock at a Site | No automatic journal (`PRD-LIF-008`) |

### 16.5 Checks after every step

- Every journal balances, and every amount is whole paise above zero.
- SYN-INV equals the stock ledger's pool value per book; SYN-TRN equals the value held on open dispatches; SYN-RSH equals the value held on open supplier-return shipments (`PRD-LED-008`; stock-ledger 11.7).
- Every valued movement has exactly one posting-source row per non-zero component, and every posting-source row's amount is in its journal line.
- A replay of any step changes nothing (`PRD-INT-008`).
- No Unknown amount appears in any journal (`PRD-MOD-015`).

## 17. Open questions

Nothing below has a default. Questions already open elsewhere are pointed to, not repeated: the accounting framework (V-07, `POL-09.10`); KDPS's cost formula and pool (V-08, V-09, SL-1); the accounts and maps, including the variance accounts (V-10, SL-3); tolerances (V-11); the voucher-model value (V-46, MM-12); the rounding of stock cost (V-64, SL-2); validating the cost rules (SL-4); net realisable value (SL-5); a formula or pool change (SL-6); Store value under a book pool (SL-14); the accounting date of a late movement (SL-15); billed-retained timing (V-35, SL-17); goods owned before receipt (V-58); the financial year (GC5-1); who requests, approves and locks (V-01); exception owners (V-03). SL-23 and MM-6 are baselines of DEC-105 (sections 4.5 and 10).

| # | Question | Kind | Who decides | Blocks | Impact |
| --- | --- | --- | --- | --- | --- |
| GC4-1 | The periods of each book: which date ranges inside the financial year (4.1) | Business | Accounts, CA | 2 (first live posting) | Where journals fall; when locks apply |
| GC4-2 | Baseline (DEC-112): an Accounts maker prepares a change to an account, map, cost setting or voucher-model setting; a different authorised Accounts approver decides it in the app; the CA's approval evidence is attached as a stored file or referenced before it takes effect, and may cover a named set of versions (6.3, `POL-09.01`). Tax-rule records are approved the same way (shared-calculations 10.1; `POL-10.05`; DEC-116) | Business | Accounts, CA (confirm the workflow) | 2 (first live posting) | Who can make a map take effect |
| GC4-4 | Baseline (DEC-112): one journal series per book and financial year (5.4), its row held briefly without breaking one-transaction posting. Every posting in a book, counter sales included, holds that row from stock-ledger 10.3 step 8 until commit, so the wait is measured, not assumed away: concurrent posting and large jobs are proved before acceptance (test 10, stock-ledger 10.6), and if the performance test fails, for counters waiting in breach of `PRD-PRF-003` or for any other posting, the series is revisited with Accounts. Ordered chunks need their own decision | Technical, with Accounts consulted on journal numbering | Accounts (confirms) | Acceptance of S1-F10; the stage 4 counter performance test | Whether counters wait on journal numbers |
| GC4-3 | When a journal posted under a map later found wrong is corrected, does the correction fall on its own date, as 9.4 builds it, or in the original period | Business | Accounts, CA | 5 | Which period shows a map correction |

**Settled here:** MM-12's design (2.3, DEC-105). **Settled since:** reopening a locked period (DEC-106, DEC-107; 4.3). **Baseline picks of DEC-112:** GC4-2 (6.3) and GC4-4 (5.4).
