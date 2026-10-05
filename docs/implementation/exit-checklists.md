# Exit checklists

> **Not ranked.** Part of the [implementation plan](index.md). The exit checks are those of [phases.md](../phases.md), which come from the PRD's acceptance conditions; this page adds the evidence each needs and the checks `PRD-SEC-016` and `PRD-ACP-018` ask of every stage. If they disagree, [phases.md](../phases.md) and the PRD win.

A stage exits only when every item of its exit list is ticked with its evidence attached, and, in every stage, each PRD bullet whose "Complete at" falls in the stage passes its whole acceptance while each bullet the stage owns passes the part its owner builds ([requirement-coverage.md](requirement-coverage.md)). Live activation is a separate list: a stage can exit on synthetic data long before anything goes live. Evidence is a CI run link, a test report, a recorded drill or a reviewed document; a statement alone is not evidence.

## 1. Stage 1 — Shared foundation

### 1.1 Exit checks from phases.md

- [ ] **One Site, units in different books and registrations, keeps correct mappings** (`PRD-ACP-013`). Evidence: [structure-and-masters.md](../design/masters/structure-and-masters.md) 9 test 1 and [books-and-posting.md](../design/finance/books-and-posting.md) 15 test 7 green in CI.
- [ ] **Shared golden cases pass on server and counter code** (`PRD-ACP-018`, `PRD-MOD-007`). Evidence: the Vitest suite and the Playwright counter run of [shared-calculations.md](../design/calculations/shared-calculations.md) 12.2 green in the same CI run, with the case list and the IDs each case covers.
- [ ] **Golden stock-and-posting scenarios pass under both cost formulas and both pool modes** (`PRD-LED-014`, `PRD-LED-015`). Evidence: [stock-ledger.md](../design/stock/stock-ledger.md) 11.2 to 11.7 and books-and-posting 16 green, driven through the real services by the synthetic harness once its decisions are taken ([s1-f10-stock-harness.md](s1-f10-stock-harness.md)). This check is the story of stock-ledger 11.1, as [phases.md](../phases.md) names it; G10 is not part of it. `S1-F10` proves G10a (with no rounding rule the outflow is refused and commits nothing; an emptying outflow leaves no residue); G10b waits for the rule and is in section 2.3, never passed by an invented rule.
- [ ] **A backup restores with linked records and attachments** (`PRD-SEC-012`). Evidence: the GC-9 design reviewed; a restore drill record on `dev` with synthetic data: steps, start and end times, every stored file matching its hash and opening from its record ([imports-and-opening-data.md](../design/platform/imports-and-opening-data.md) 17 test 23), number series paused until reconciled ([numbering-and-audit.md](../design/platform/numbering-and-audit.md) 7 test 7), audit seals verified.
- [ ] **An operation whose policy is not configured stays unavailable** (`PRD-SEC-017`). Evidence: [access-and-approvals.md](../design/access/access-and-approvals.md) 15 test 1, imports-and-opening-data 17 test 22 and books-and-posting 15 test 15 green; a browser journey showing the reason on screen.
- [ ] **An activity stays disabled for a Site or business unit until its readiness checks pass** (`PRD-LIF-002`). Evidence: the `S1-F04` acceptance tests green.

### 1.2 Checks every stage owes

- [ ] Concurrency on real PostgreSQL: stock-ledger 11.9, `S1-F01-AT14`, imports-and-opening-data 17 test 15, numbering-and-audit 7 test 2.
- [ ] Organisation isolation in every module that holds data: access-and-approvals 15 test 2, structure-and-masters 9 test 14.
- [ ] Self-approval refused for every independently approved action built in stage 1: access changes, structure, mapping verification, agreements, bank details, vocabulary, product proposals, mapping rules, layout and mapping versions (`DEC-112`), posting-map and account versions (`DEC-112`), stand-ins, period reopening.
- [ ] Stale-version refusal, duplicate requests answered once, and partial-failure rollback (one failing line fails its document; an exception survives the rollback that found it).
- [ ] Persona browser journeys for every stage 1 screen, including recovery: a locked session keeps unfinished work, and a reload in the middle of an approval decides nothing twice.
- [ ] The 10,000-line PT parse within one minute (RR-189) and the large posting while counters sell (stock-ledger 11.9), on synthetic data.

### 1.3 Completeness

- [ ] `S1-F01` to `S1-F14` accepted, each with its evidence.
- [ ] GC-8, GC-9 and the stock ledger interface and tables written and reviewed (RR-010, RR-012, RR-014); no section a stage 1 feature relies on is still baseline-only.
- [ ] Stage 1 reports exist: master lists, access and audit history, import outcomes.
- [ ] Every PRD bullet owned by a stage 1 feature passes the part its owner builds, and every bullet completed in stage 1 passes its whole acceptance ([requirement-coverage.md](requirement-coverage.md)).
- [ ] No KDPS-valued setting has a default, and no synthetic value is read as one.
- [ ] The doc checker passes in CI; the readiness register is updated.

### 1.4 Live activation

On production:

- [ ] Policies 2, 4, 9 and 18 Signed, with their real values validated by a different person (RR-158, RR-160, RR-165, RR-174).
- [ ] KDPS's role map, limits, exception routing, sign-in settings, tracking profiles, cost method, recovery targets and retention entered and validated (RR-064 to RR-068, RR-071, RR-075, RR-076).
- [ ] Production hosting chosen and designed (RR-029).
- [ ] Admin's restore drill done on production before go-live, with Operations and Accounts validating totals (`POL-18.03`, RR-123, RR-188).

On `kdps-test`, for KDPS's real masters before the side-by-side test:

- [ ] KDPS agrees to hold real data there (RR-180).
- [ ] Test role assignments prepared from what KDPS says and approved by a second person (`DEC-103`); the first reason list approved with a free-text reason (GC3-12, `DEC-104`).
- [ ] Gated actions stay unavailable (`DEC-071`).

## 2. Stage 2 — Goods-in

### 2.1 Exit checks

- [ ] Invoice or booking quantities never create uncounted stock; clean accepted quantity proceeds while damage, excess or identity discrepancies stay held (`PRD-ACP-001`).
- [ ] Goods owned before receipt appear as inbound ownership, never as stock; an amount only with invoice or agreement-price evidence; closed against the receipt count (`PRD-ACP-020`).
- [ ] Primary and supplemental PT coverage cannot overlap, including under concurrent approval (`PRD-ACP-002`, `PRD-INT-005`).
- [ ] Supplier, direct-store and opening goods meet the same selling-Site acceptance and hold checks (`PRD-ACP-003`).
- [ ] Damage blocks stock at once; independent rejection clears only the mistaken damage hold (`PRD-ACP-005`).
- [ ] A side-by-side test import changes no stock: after a daily load every stock quantity and value is unchanged (`PRD-LIF-014`; stock-ledger G4).

### 2.2 Checks every stage owes

- [ ] Concurrency, isolation, self-approval (PT, damage, excess and wrong goods, booking), stale versions, duplicates and rollback for every stage 2 posting.
- [ ] Persona journeys for Warehouse, Booking, Accounts and Operations, with recovery.
- [ ] Stage 2 reports: booking status, receipt discrepancies, PT lines right first time, fill rate and timeliness, stock by product, size, location, condition and owner.

### 2.3 Live activation

- [ ] Policies 1, 3, 5, 17 and the stage 2 parts of 10 Signed and validated (RR-157, RR-159, RR-161, RR-173, RR-166).
- [ ] Brand terms, costing profiles, booking rules, budgets, registrations, rates, wrong-goods approvers, framework, cost confirmation, maps, tolerances and the inbound-ownership treatment entered and validated (RR-070, RR-072 to RR-074, RR-077 to RR-081, RR-083, RR-118).
- [ ] Each Site's receiving activity approved after its readiness checks (`PRD-LIF-001`).
- [ ] Before moving-average postings go live: the stock cost rounding rule set and validated (RR-124), and golden scenario G10b accepted with the values under that rule.
- [ ] For the side-by-side test: KDPS's agreement (RR-180), the run length (RR-106), the test-setup field choices (RR-038) and the confirmed import picks (RR-197), the earlier POS's export and PT acceptance (RR-156, RR-184).

## 3. Stage 3 — Stock movement

### 3.1 Exit checks

- [ ] Transfer approval, several dispatches, whole-shipment counts, cancellation, shortage, damage and failed-delivery return reconcile every quantity without a fake destination receipt (`PRD-ACP-006`).
- [ ] Transferred goods meet the same selling-Site acceptance and hold checks as supplier goods (`PRD-ACP-003`).
- [ ] Missing pre-PT identity or value stays unknown during return, custody movement or disposal (`PRD-ACP-004`).
- [ ] Supplier departure alone does not complete an RTV; partial-pickup closure leaves no pending shipment or undispatched reservation (`PRD-ACP-007`).
- [ ] Stock quantity and value reconcile from receipt through every movement (stock-ledger 11.7 checks run on stage 3 flows).

### 3.2 Checks every stage owes, and live activation

- [ ] Two approvals cannot reserve the same quantity; a count freeze refuses an in-flight sale or move under the lock; persona journeys for Operations and Warehouse.
- [ ] Live: policy 17 (write-off and disposal), the return-rights part of 1 and the movement-document part of 10 Signed and validated; write-off approvers, count limits, reminder schedule, routes and document formats entered (RR-082, RR-084, RR-085, RR-122, RR-062); each Site's movement activity approved.

## 4. Stage 4 — Store day

### 4.1 Exit checks

- [ ] Organisation return policy and authorised Store override apply correctly; original paid caps, replacement price, refund state and physical disposition stay separate (`PRD-ACP-008`).
- [ ] Concurrent returns and credit redemption cannot spend the same entitlement twice (`PRD-ACP-009`).
- [ ] Changed offer totals, cash splits, explicit zero, invalid entry and repeated checkout give one correctly paid immutable bill; printer failure makes no new sale (`PRD-ACP-010`).
- [ ] A PT correction after sale or transfer keeps origins and respects dependent quantities (`PRD-ACP-002`).
- [ ] Duplicate or corrected EBO uploads affect stock, incentives and finance once and create no second GST invoice (`PRD-ACP-012`).
- [ ] Opening unknown season excludes season-specific offers; a later correction cannot rewrite past bills or labels (`PRD-ACP-014`).
- [ ] A cancelled or corrected tax document stays distinct from the operational reversal (`PRD-TAX-004`).
- [ ] Before offline is enabled: power loss, restart, expiry, full storage, duplicate tabs, wrong clock, device replacement, repeated upload and year-spanning pause keep bills, quantities and numbering (`PRD-ACP-011`).

### 4.2 Checks every stage owes

- [ ] Counter performance measured against the PRD targets on real Store connections during the side-by-side test (RR-189); counters never wait on background work (`PRD-PRF-003`).
- [ ] Persona journeys for Cashier, Store manager, Salesperson and EBO staff, including till recovery after a browser restart.

### 4.3 Live activation and the pilot switch

- [ ] Policies 6, 7, 8, 14, 16, 19 and the stage 4 parts of 10 Signed and validated (RR-162 to RR-164, RR-170, RR-172, RR-175, RR-166).
- [ ] The stage 4 KDPS values entered and validated (RR-086 to RR-106, RR-117, RR-125 to RR-131).
- [ ] Production hosting in place (RR-029); `DEC-067` and SL-9 answered (RR-043, RR-044).
- [ ] Restore drill on production before go-live (`POL-18.03`, RR-188).
- [ ] Go or no-go pass marks of [phases.md](../phases.md) "Testing and switch-over" met: no unexplained material difference at the switch count, all participating staff trained, no serious exception open, Site readiness verified; signed by Owner, Accounts and Operations (`POL-14.05`, `POL-14.08`).
- [ ] Offline switched on only after 4.1's offline check passes and policy 16 is Signed (`DEC-051`).

## 5. Stage 5 — Financial control

### 5.1 Exit checks

- [ ] Purchase, partial receipt, dispute, credit and payment, and sale, return and provider settlement reconcile through operational records, ledgers and Tally (`PRD-ACP-016`).
- [ ] One Site with units in different books and registrations keeps correct mappings and historical snapshots (`PRD-ACP-013`).
- [ ] Closure cannot retire unresolved stock, money or cases; reopening and relocation keep identities and history (`PRD-ACP-015`).
- [ ] The complete export reproduces linked records, attachments and control totals without reusing business identities (`PRD-ACP-019`).

### 5.2 Live activation

- [ ] Policies 9 (remaining parts), 11, 12, the stage 5 parts of 10, and 7 for Customer credit Signed and validated (RR-165 to RR-168, RR-163).
- [ ] Voucher types checked against KDPS's real Tally in a test company first (RR-107, RR-181); the other stage 5 values entered (RR-108 to RR-112, RR-116, RR-119 to RR-121, RR-130).

## 6. Stage 6 — People and planning

### 6.1 Exit checks

- [ ] Attendance correction, returned-sale incentives and payroll replay keep raw evidence and one approved period outcome (`PRD-ACP-017`).
- [ ] Shared golden cases for incentives, including returned-sale reversals and policy versions, pass on the shared logic (`PRD-ACP-018`, `PRD-MOD-007`).
- [ ] Planning proposals cannot purchase, transfer or change prices without the relevant approval (`PRD-EXC-020`).
- [ ] Forecasts are evaluated against the configured horizon, baseline and quality measures (`PRD-EXC-021`).

### 6.2 Live activation

- [ ] Policies 13, 15 and the payroll part of 10 Signed and validated (RR-169, RR-171, RR-166); pay, payroll and forecast values entered (RR-113 to RR-115).
- [ ] Forecasting starts only when the history meets the Planning policy's quality rule ([phases.md](../phases.md) stage 6).
