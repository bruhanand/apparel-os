# Alignment report — 3 Oct 2026

> **Not ranked.** This report decides nothing and changes nothing. Any further PRD or policy change needs an entry in [decisions.md](../decisions.md) first. See [README.md](../README.md).

**What was checked.** [prd.md](../prd.md) against [kdps-policies.md](../kdps-policies.md), and both against [phases.md](../phases.md) and the design files in [design/](../design/). Refreshed on 3 Oct 2026 against DEC-001 to DEC-035 (first written after DEC-017 to DEC-029) and re-checks the findings of the earlier audit (in git history); audit codes (B-04, D-06 …) are given where they match.

**How to read it.**

- `PRD-STK-003` is a PRD bullet; `POL-09.04` is a policy answer bullet; `POL-09` is the whole policy.
- **Who decides:** **Me** = the product owner (decides what the product supports, in the PRD). **KDPS Owner**, **Accounts**, **CA** = KDPS people (decide KDPS's values, in the policies). Other PRD personas (Operations, Booking, HR, Admin) are named where the PRD names them.
- **Blocks** = the delivery stage whose live operation waits for it. Design and synthetic-data tests never wait.

## 1. Short version

**Since this report:** the product-owner decisions are logged as DEC-001 to DEC-035 in [decisions.md](../decisions.md). DEC-030 to DEC-035 came from the stock-ledger design ([design/stock/stock-ledger.md](../design/stock/stock-ledger.md)): the old POS stays outside app stock, moving average and cost rules, receipt-origin rules, and four new words. DEC-034 and DEC-035 settled its review questions: undoing a mistaken inflow, late-cost excess, and a counted piece the ledger shows as gone. Product-owner items left, none of them a PRD or policy clash:

  - **Holds up code or its division:** who builds and how many people or agents (GC-11 in [gaps-before-code.md](gaps-before-code.md), task division).
  - **Holds up the stage 1 build:** the file storage provider (D-2 in [deployment.md](../design/platform/deployment.md) section 10, the same item as GC-10 in [gaps-before-code.md](gaps-before-code.md)).
  - **Needed before KDPS's side-by-side test:** the custom domain or Railway address (D-3).
  - **Needed before the first Store switch:** production hosting (D-1).
  - **Before first live use on production, not a build blocker:** the rollout order on production (SL-9 in the stock-ledger design).
  - **No stage named yet:** how the in-store local helper and the Tally local gateway reach the server (4.15).
  - **Waiting on something else:** SL-10 (returns with no sale in the app) waits for the later plan to bring the earlier POS's data into the app, which needs a decision record because `PRD-LIF-010` imports old sales for reports only; SL-11 only if a performance test fails.

  Questions only KDPS or the CA can answer are in [questions-for-kdps.md](../questions-for-kdps.md).

1. **No PRD/policy clash remains open.** The provisional supplier amount (A-2) is settled on the product side by DEC-003; the CA's accounting treatment of goods owned before receipt is an open value (V-58).
2. **Settled product-owner findings are logged through DEC-035.** This includes the eleven access templates and controls (DEC-017), stage 2 evidence rules (DEC-018), count freezes (DEC-019), store-day instruments and controls (DEC-020), WhatsApp summaries and allocation evidence (DEC-021), and stage 6 validation approach (DEC-022); then piece tracking binding at each Store's switch (DEC-023), shadow stock for the parallel run (DEC-024, since replaced by DEC-030), Customer credit in stage 5 (DEC-025) and clean-ups (DEC-026); Railway test hosting (DEC-027, DEC-028); the record that DEC-017 to DEC-022 were agreed with KDPS (DEC-029); and the stock-ledger decisions (DEC-030 to DEC-035, above).
3. **Remaining structural questions** are listed in section 4. Their product rules and policy homes are identified; KDPS/CA values remain OPEN where applicable.
4. **Policy homes are now recorded for offers and promotions, EBO report timing and settlement, and Store P&L allocation** (DEC-014). Their real terms, rates, bases and formulas remain OPEN.
5. **The open values** are listed in section 5 with their owners and delivery stages.
6. **The UI files still contain sample or unresolved values** listed in section 6; an unresolved value is not a default.

## 2. PRD against policies: conflicts

### 2.1 Open conflicts

| # | Kind | Where | Finding | Who decides | Blocks |
| --- | --- | --- | --- | --- | --- |
| A-1 | **Settled: DEC-001** · Conflict | `POL-02.02` vs `PRD-ACS-001`, `PRD-ACS-004` | Policy: "Assign each user **a** role with explicit … scope." PRD: a person may hold **several** roles, each scope applied inside its own assignment. Read literally, the policy forbids what the PRD allows, and the persona design (several personas per person) needs several roles. | Me | 1 |
| A-2 | **Settled: DEC-003** · Unclear | `POL-09.02` vs `PRD-LED-005`, `PRD-DMG-016`, `PRD-ACP-004`, `PRD-LIF-008` | Policy 9 lets a supplier obligation carry a **provisional valuation** while the invoice is missing or the PT is pending, "under CA-approved posting rules". The PRD keeps "provisional commercial amounts" distinct (`PRD-LED-005`) and forbids a fictitious payable for unknown pre-PT value (`PRD-ACP-004`). No PRD rule says what evidence makes a provisional amount allowed rather than fictitious. Audit B-08, still open. | Me (the rule); CA (the posting treatment) | 2 |
| A-3 | **Settled: DEC-010** · Layering | `PRD-RET-001`, `POL-06.02` | The PRD now describes the Organisation-level return rule and effective-dated Store overrides; KDPS's 15-day ordinary window belongs in policy 6; defective goods are assessed under `POL-06.05` with no assumed cutoff. | Me | 4 |
| A-4 | **Settled: DEC-002, DEC-010** · Layering | PRD "Words used": Tally, Piece ID; `PRD-MER-003` | The PRD now defines Piece ID and Piece-tracked without KDPS-specific wording; Tally remains an external book whose official status is policy-controlled. No open clash remains. | — | — |
| A-5 | **Settled: DEC-010, DEC-021** · Layering | `PRD-EXC-012`, `POL-02.14` | The 9 PM WhatsApp summary and channel are set; recipient names remain open under policy 2. | KDPS Owner | 5 |
| A-6 | **Settled: DEC-012** · Policy ownership | `POL-07.09`, `POL-02.07`–`POL-02.09`; PRD policy rows 2 and 7 | Policy 7 selects refund cases requiring independent approval. Policy 2 assigns approvers, authority and limits, and enforces no-self-approval; it cross-references policy 7 without duplicating triggers. Audit D-05. | Me | 4 |
| A-7 | **Settled: DEC-013** · Stage timing | `POL-14.07`; PRD policy row 14 | Stage 1 builds and tests import layouts with labelled sample data. Verified real opening stock, balances and sign-off are required at the stage 4 pilot switch. Audit D-03. | Me | 1 for sample-data layouts; 4 for verified opening data and sign-off |
| A-8 | Gap | `POL-08.04`; PRD policy table, row 8 | The abandonment outcome for goods never collected is still unconfigured. The PRD row requires it. Audit B-13 (second half), still open. | KDPS Owner, Operations, Accounts | 4 |
| A-9 | **Settled: DEC-017** | `POL-02.01` template map | The **Brand Manager** template serves P-BKG and P-BRM; **Store POS** serves P-STM, P-CSH and P-SLS. Operations, HR, EBO staff, CA and Auditor now each have an editable template. Templates grant no access by themselves; independent approval still requires another authorised person (`POL-02.07`). Actual assignments remain open (V-01). | — | — |

### 2.2 Earlier audit conflicts, re-checked

| Audit | Status today |
| --- | --- |
| B-01 consignment not a PRD word | Fixed. "Consignment" is in "Words used". |
| B-02 "ticket" for exception and price tag | Fixed. The policies say "exception" and "price tag". |
| B-03 six templates vs PRD roles | Fixed by DEC-017. Policy 2 now has eleven editable templates; actual assignments remain open (V-01). |
| B-04 return policy per entity or Organisation | Fixed. Both say Organisation (`PRD-RET-001`, `POL-06.01`). |
| B-05 repair as a remedy | Fixed. `PRD-RET-004` allows repair. |
| B-06 15 days as a "default" | Fixed by DEC-010. `PRD-RET-001` keeps the product rule; KDPS's 15-day value is in `POL-06.02` (A-3). |
| B-07 unique piece ID vs shared barcode | Text now agrees (`PRD-MER-003`, `PRD-MER-006`, `POL-04.06`). Which categories KDPS tracks is set by DEC-002 and DEC-018 (4.1; categories V-06). |
| B-08 provisional valuation | Settled on the product side (A-2, DEC-003); accounting with the CA (V-58). |
| B-09 shared-sale splits | Fixed. No longer in policy 13. |
| B-10 net realisable value | Fixed. In "Words used" and `PRD-LED-007`. |
| B-11 "delivery" to customers | Fixed. Gone from policy 6. |
| B-12 second-person list too short | Fixed. `POL-02.07` lists transfers, damage, offers, mapping rules and supplier-return steps. |
| B-13 handover wording; abandonment | Wording fixed (`POL-08.01`). Abandonment open (A-8). |

## 3. Configured rules with no policy to switch them on

The PRD says these are "configured" or "under policy". Nothing is on by default (`PRD-SEC-017`), so each one needs a home in "Required policy configuration".

| # | Rule | PRD IDs | Nearest policy | What is missing | Who decides | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| B-1 | **Settled: DEC-008** (policy 2) · Cash variance at day close: tolerance, who approves, what happens above it | `PRD-CSH-001`, `PRD-CSH-002`, `PRD-EXC-001` | 9 covers "rounding/invoice tolerances" only | A cash-variance line in policy 9 or 2 | Me (where it lives); Accounts (values) | 4 |
| B-2 | **Settled: DEC-014 (policy home)** · Offer combination (stacking) rules, brand and Organisation cost shares, markdown approval | `PRD-OFR-002`, `PRD-OFR-007`, `PRD-POS-003` | `POL-19.01`–`POL-19.03` | Actual combination rules, cost shares and approval terms remain OPEN | KDPS Owner, Brand manager | 4 |
| B-3 | **Settled: DEC-005** · Bill and document number formats, including the GST limit | `PRD-MOD-004`, `PRD-OFF-002`, `PRD-LIF-015` | None | A numbering line (format per registration and year) | Me (shape); CA (compliance) | 4 |
| B-4 | **Settled: DEC-014 (policy home)** · Store P&L and brand-by-Store profit allocation bases | `PRD-EXC-008` | `POL-09.20` | Merchandise cost, commission, support and expense allocation bases remain OPEN | Accounts, CA | 5 |
| B-5 | **Settled: DEC-014 (policy homes)** · EBO report lateness; brand commission and settlement basis | `PRD-EBO-007`, `PRD-EBO-009` | `POL-02.11` for missing-report timing; `POL-12.06` for commission/settlement | Expected/overdue timing, escalation, and agreement-specific basis and rates remain OPEN | KDPS Owner, Operations (timing); Owner, Accounts (commission/settlement) | 4 (report timing); 5 (settlement) |
| B-6 | Loyalty earning, redemption and expiry | `PRD-RET-019` | `POL-07.13` keeps loyalty disabled until an approved scheme, earning, redemption, liability and expiry rules are configured; `POL-07.09` lists loyalty settings as unconfirmed | The scheme itself | KDPS Owner, Accounts | 4 |
| B-7 | Gift voucher issue, validity and redemption | `PRD-POS-005`, `POL-07.10` | Own bearer vouchers are in scope | Validity, partial redemption, unused-balance refund, lost-voucher and tax terms | KDPS Owner, Accounts, CA | 4 |
| B-8 | Which actions may be approved by phone or WhatsApp | `PRD-ACS-012` | 2 | Authenticated notification links bind approval to the exact record version; action types to enable remain to be confirmed (V-60) | KDPS Owner | 5 |
| B-9 | Bulk approval allowlist and named stand-ins | `PRD-ACS-010`, `PRD-ACS-011`, `POL-02.19`, `POL-02.20` | 2 | Item-by-item permission/limit/independence checks and expiry are set; action allowlist and actual assignments remain open | KDPS Owner, Admin | 1 |
| B-10 | **Settled: DEC-018** (`POL-05.09`) · Open-to-buy budget: who sets and approves it | `PRD-BKG-004`, `POL-05.02`, `POL-05.09` | 5 | Booking prepares, Accounts checks, the Owner approves; actual budgets, approver names and authority remain open (V-17) | KDPS Owner, Booking | 2 |
| B-11 | Supplier-return reminder schedule | `PRD-OFR-009` | 1 has return windows, no reminders | The reminder schedule per agreement | Operations | 3 |
| B-12 | MSME payment obligations | `PRD-PAY-010`, `POL-10.09` | `POL-10.09` | Verified supplier classification and legal deadlines (V-61) | Accounts, CA | 5 |
| B-13 | Category-specific fixed-asset policy | `PRD-TAX-009`, `POL-09.26` | `POL-09.26` | Capitalisation thresholds, methods and actual rates | CA | 5 |
| B-14 | Default warehouse and permitted transfer routes per Store | `PRD-ORG-013`, `PRD-TRF-004` | None (setup data) | Routes and who may change them (V-62) | Operations | 3 |

## 4. Open points that change the data model

### 4.1 Piece IDs

**Settled: DEC-002 and DEC-018** ([decisions.md](../decisions.md)). Piece tracking is set per profile. KDPS uses piece IDs by default for apparel and footwear; any additional categories need explicit selection (V-06).

- **Where:** `PRD-MER-003`, `PRD-MER-006`, `PRD-STK-003`, `POL-04.06`, `POL-04.07`, `POL-09.07`.
- **The point (history).** Before DEC-002, nothing said which pieces are tracked while identical pieces share a supplier barcode. Tracking is now set per profile (see above); only additional categories remain open (V-06).
- **Why it matters.** It decides whether stock is stored per piece or as quantity per SKU, how labels print at receipt, and what the till must scan. If the till scans only a supplier barcode, the system cannot know which piece was sold, and `PRD-MER-003` (piece identity through sale) fails.
- **Who decides:** Me (settled: DEC-002, DEC-018); Booking, Operations (any additional categories, V-06).
- **Blocks:** 2 (labels at receipt).

### 4.2 Cost formula and averaging scope

**Product side settled: DEC-004, DEC-018 and DEC-031.** The system supports FIFO and moving weighted average (periodic average is out until a PRD change) and the configured pool choices, but KDPS initially retains its current CA-approved method and pool. Actual method and pool must be verified; any future change is separate and validated (V-08, V-09).

- **Where:** `POL-09.06`, `POL-09.07`, `POL-09.09`, `PRD-LED-006`.
- **The point.** KDPS will initially retain its current CA-approved method and pool. Accounts and the CA must verify actual method, pool and supporting valuation; a future change requires separate approval and validation.
- **Why it matters.** It decides the shape of cost layers and the cost of every transfer, return and late cost change.
- **Who decides:** Me (the scopes the product supports); CA (formula and scope for KDPS); Accounts (today's method).
- **Blocks:** 1 (V-08, current method and valuation sample); 2 (V-09, confirmation before first receipt cost).

### 4.3 Does KDPS's Tally track stock?

- **Where:** `POL-09.15`, `POL-09.16`, `PRD-LED-012`.
- **The point.** If Tally keeps inventory, vouchers must carry items and quantities, and stock journals may be needed. If it keeps accounts only, vouchers carry ledger amounts.
- **Why it matters.** It decides the voucher model and whether stock is valued in two places.
- **Who decides:** Accounts (fact); CA (whether it should).
- **Blocks:** 5 (vouchers); the posting model is designed in 1.

### 4.4 Ownership before custody

**Settled: DEC-003.** An inbound ownership record that is not stock; an amount only from invoice or agreement-price evidence. Accounting still with the CA (V-58).

- **Where:** `POL-01.05`, `POL-09.02`, `PRD-ORG-014`, `PRD-REC-008`, `PRD-STK-004`.
- **The point.** An agreement can move ownership at supplier dispatch, before anything is counted. Stock comes only from a count. So KDPS can own goods it does not hold.
- **Why it matters.** It needs an "owned, not yet received" record that is not stock, and a rule for its value (A-2).
- **Who decides:** Me (the record and the evidence rule); CA (accounting).
- **Blocks:** 2.

### 4.5 AS or Ind AS

- **Where:** `POL-09.10`; "Words used": AS, Ind AS.
- **The point.** No framework is chosen. It changes recognition rules, revenue on billed-retained goods and some disclosures.
- **Why it matters.** The posting rules must not assume either framework.
- **Who decides:** CA.
- **Blocks:** 2 (first live posting).

### 4.6 Templates and personas

- **Where:** `POL-02.01`, `PRD-ACS-001`, `PRD-ACS-002`.
- **The point.** See A-1 and A-9.
- **Why it matters.** It decides whether a user has a list of role assignments or exactly one.
- **Who decides:** Me (several or one); KDPS Owner (who holds what).
- **Blocks:** 1.

### 4.7 Split-tender refund routing

**Settled: DEC-007 and DEC-020.** Proportional to the original split; cash substitution or another tender override requires independent approval.

- **Where:** `POL-07.01`, `PRD-RET-010`, `PRD-POS-005`.
- **The point.** The product routes refunds to original tenders; a policy-governed exception may substitute cash only after independent approval.
- **Why it matters.** It decides how much refundable value each tender line keeps.
- **Who decides:** KDPS Owner, Accounts (named approvers and limits).
- **Blocks:** 4.

### 4.8 Count and cash tolerances

**Product side settled: DEC-008 and DEC-019.** A tolerance only selects an approver; nothing is adjusted automatically. Full counts stop selling and counted scope is frozen. Store Managers approve only within configured cost limits. Values and approver names remain open (V-21, V-38).

- **Where:** `PRD-STK-008`, `PRD-CSH-001`, `POL-02.11`, `POL-02.13`, `POL-02.21`.
- **The point.** A tolerance only selects an approver. Cash differences are recorded and never automatically written off.
- **Why it matters.** It decides whether an adjustment can exist without an approval record.
- **Who decides:** Me (what a tolerance does); KDPS Owner, Operations, Accounts (values).
- **Blocks:** 3 (counts), 4 (cash).

### 4.9 Bill numbering per device

**Product side settled: DEC-005.** Every billing device has its own series per registration and year. Format: still open with the CA (V-40).

- **Where:** `PRD-OFF-002`, `PRD-LIF-015`, `PRD-ORG-005`.
- **The point.** The offline counter has its own series per financial year. Nothing says whether online tills also have one each, or share a Store series. A GST invoice number is limited in length and must be unique per registration and year (CA to confirm the exact rule). One Site can hold units with different registrations.
- **Why it matters.** It decides who owns a number series: device, Store or business unit and registration.
- **Who decides:** Me (series owner); CA (format rules).
- **Blocks:** 4.

### 4.10 Store credit and gift vouchers

**Product side settled: DEC-006 and DEC-020.** The in-scope instruments include customer-linked store credit and KDPS's own bearer vouchers, held as a liability, as well as bank transfer and approved customer credit. Store-credit scope is within the same legal entity. Validity, customer-credit terms, provider evidence and gift-voucher terms/tax remain open (V-25, V-29, V-30; Customer credit limits and due dates V-59).

- **Where:** `PRD-RET-016`, `PRD-POS-005`, `POL-07.03`, `POL-07.09`.
- **The point.** The product supports KDPS's own bearer vouchers, not outside vouchers. Actual validity, partial redemption, lost-voucher, refund and tax terms remain open.
- **Why it matters.** It decides a voucher ledger and whether a voucher sale is a sale of goods.
- **Who decides:** Me (what the product supports); KDPS Owner, Accounts, CA (terms and tax).
- **Blocks:** 4.

### 4.11 Value basis of approval limits

**Settled: DEC-009 and DEC-015.** Each limit names its basis; PT approval limits use total proposed acquisition cost for covered quantities, never MRP. Unknown values stay distinct from zero. Actual KDPS limit amounts and approvers remain OPEN (V-02).

- **Where:** `POL-02.09`, `POL-03.07`, `PRD-ACS-015`, `PRD-ACS-016`.
- **The rule.** PT approval cost is the proposed P RATE times the covered quantity on the PT revision under approval (DEC-016). Missing or disputed cost blocks value-based approval until resolved; this approval valuation does not determine supplier-liability recognition.
- **Why it matters.** Each limit needs a stored basis, and missing cost must not be mistaken for zero.
- **Who decides:** The PRD sets the basis and unknown-value rule; KDPS Owner sets live approval values and approvers.
- **Blocks:** 1 for approval configuration; 2 for PT approval.

### 4.12 Store P&L and income tax

**Settled: DEC-011 (D-02).** A Store P&L and brand-by-Store profit stop at profit before tax. Income-tax expense and net profit belong to the legal entity.

- **Where:** `PRD-NAV-014`, `PRD-NAV-016`, `PRD-NAV-017`.
- **The point.** Store allocation bases for merchandise cost, commissions, brand support and shared expenses remain OPEN under `POL-09.20` (V-49); this does not reopen where the P&L ends.
- **Who decides:** Me (the product rule); Accounts and the CA (KDPS allocation bases).
- **Blocks:** 5 for configured Store P&L reporting.

### 4.13 Imported sales of piece-tracked goods

**Settled: DEC-023, DEC-030.** Piece rules at a Store start at its switch count, where every unlabelled piece is labelled. Old-POS imports change no stock at all (DEC-030). EBO Stores reporting through brand software hold piece-tracked goods as SKU quantity.

- **Where:** `PRD-MER-016`, `PRD-MER-017`, `PRD-LIF-013`, `PRD-LIF-025`, `PRD-EBO-005`, `PRD-EBO-011`.
- **The point.** Neither the earlier POS nor brand software can say which piece was sold. The open part is the size of each Store's labelling job (V-57).
- **Who decides:** Me (the product rule); KDPS Owner and Operations (the labelling plan).
- **Blocks:** 4, before each Store's switch.

### 4.14 Old POS evidence and the switch reconciliation

**Replaced: DEC-030** (DEC-024 is superseded). The old POS does all real billing while active. Its end-of-day sales report and SOH are evidence for checking and reports only and never move app stock. At each Store's switch, the verified count becomes opening stock and is reconciled with the last SOH.

- **Where:** `PRD-LIF-013`, `PRD-LIF-014`, `PRD-LIF-027` (`PRD-LIF-024` retired); `phases.md` stage 2 and switch-over.
- **Who decides:** Me.
- **Blocks:** 4, the switch count reconciled with the last SOH (threshold V-45, before the first switch). Nothing else remains open here.

### 4.15 Deployment topology

**Testing settled: DEC-027, DEC-028.** Railway runs the server, jobs, PostgreSQL, web app and counter PWA for testing, including KDPS's side-by-side test with real KDPS data. The current POS stays the system of record; no Store switches on test hosting (`PRD-LIF-026`).

- **Still OPEN:** production hosting, chosen before the first Store switch; the file storage provider for the test setup; how the in-store local helper (PRD stack, Hardware) and the Tally local gateway (`PRD-INT-009`) reach the server; KDPS's agreement to hold its real data on the test setup (Owner question 37); the rollout order on production: when a warehouse goes live with its opening stock, and how goods move to a Store not yet switched ([stock-ledger](../design/stock/stock-ledger.md) SL-9; not a build blocker).
- **The point.** The test setup is designed in [design/platform/deployment.md](../design/platform/deployment.md); its open questions D-1 to D-5 are listed there.
- **Who decides:** Me; KDPS Owner for the data agreement.
- **Blocks:** 1 (file storage provider, D-2 / GC-10); 2 (side-by-side test with real data); 4 (first Store switch).

## 5. Open values

Every active value below is unset. None may be invented; each stays OPEN until its owner gives it. Struck-through entries record settled questions and are not open values.

| # | Value | IDs | Who decides | Blocks |
| --- | --- | --- | --- | --- |
| V-01 | Which person holds which persona, role and scope | `POL-02.11` | KDPS Owner, Admin | 1 |
| V-02 | Approval limit amounts per action and approver | `POL-02.10` | KDPS Owner | 1 |
| V-03 | Exception owners, due times, escalation and alert recipients | `POL-02.11` | KDPS Owner, Admin | 1 |
| V-04 | Validate production TOTP and the selected 5/15-minute idle and 12-hour absolute limits | `POL-02.17`, `POL-02.18` | Admin | 1 |
| V-05 | Categories needing batch or expiry; shelf-life days for receiving and selling | `POL-04.08` | Booking, Operations | 1 |
| V-06 | Any additional piece-tracked categories beyond apparel and footwear | `POL-04.09` | Booking, Operations | 2 |
| V-07 | Accounting framework: AS or Ind AS | `POL-09.10` | CA | 2 |
| V-08 | KDPS's current cost method and pool; provide a Tally/Excel valuation sample | `POL-09.09`, `POL-09.21` | Accounts, CA | 1 |
| V-09 | Confirm the current applicable method and pool; validate any future change | `POL-09.06`, `POL-09.19`, `POL-09.21` | CA | 2 |
| V-10 | Ledger accounts and posting maps per book | `POL-09.11` | Accounts, CA | 2 |
| V-11 | Rounding and invoice-matching tolerances | `POL-09.14` | Accounts | 2 |
| V-12 | Recovery targets accepted (15 min / 4 h are provisional) | `POL-18.01` | KDPS Owner | 1 |
| V-13 | Retention period per record class; legal holds | `POL-18.05` | KDPS Owner, Admin, CA | 1 |
| V-14 | Commercial model, ownership event, return terms and payment terms per brand | `POL-01.05`, `POL-01.09`, `POL-01.14` | KDPS Owner, Accounts | 2 |
| V-15 | Costing profile per brand (BASIC to P RATE, charges, rounding) | `POL-03.06`, `POL-03.07` | Booking, Accounts | 2 |
| V-16 | Who may change or cancel a booking, and until when; delivery windows | `POL-05.04`, `POL-05.05` | KDPS Owner, Booking | 2 |
| V-17 | Open-to-buy budgets by brand and season; workflow is set | `POL-05.02`, `POL-05.09`, `PRD-BKG-004` | KDPS Owner, Booking, Accounts | 2 |
| V-18 | GST registration per business unit; HSN codes, rates and slabs | `POL-10.06`, `POL-10.08` | Accounts, CA | 2 |
| V-19 | Named write-off/disposal approvers and configured cost limits | `POL-17.04`, `POL-17.10` | KDPS Owner, Operations, Accounts | 2 (write-off and disposal by 3) |
| V-20 | Named Booking approvers by Site and brand for resolved wrong/unidentified goods | `POL-17.02`, `POL-17.11` | KDPS Owner | 2 |
| V-21 | Count cost limits, Store Manager and escalation approvers; scope is frozen while counting | `POL-02.11`, `POL-02.21` | KDPS Owner, Operations | 3 |
| V-22 | Supplier-return reminder schedule | `PRD-OFR-009` | Operations | 3 |
| V-23 | Applicable defect assessment, consumer-rights and warranty evidence (no assumed hard cutoff) | `POL-06.05` | KDPS Owner, Operations | 4 |
| V-24 | Stores with an authorised return override | `POL-06.01` | KDPS Owner | 4 |
| V-25 | Provider/evidence configuration for the selected tender set (Customer credit limits and due dates: V-59) | `POL-07.09`, `PRD-POS-021` | KDPS Owner, Accounts | 4 |
| V-26 | ~~Refund order for split-tender bills~~ Settled: DEC-007 | `PRD-RET-022` | — | — |
| V-27 | ~~Which refund cases require independent approval~~ Triggers settled by DEC-020; named approvers and limits remain V-02 | `POL-07.09`, `POL-02.15` | — | — |
| V-28 | No-bill returns on or off; value limit; valuation method | `POL-07.08` | KDPS Owner, Accounts | 4 |
| V-29 | Store-credit validity and authorised Store list within the same legal entity | `POL-07.11`, `PRD-RET-023` | KDPS Owner, Accounts | 4 |
| V-30 | Own gift-voucher validity, partial redemption, unused-balance refund, lost voucher and tax | `POL-07.10` | KDPS Owner, Accounts, CA | 4 |
| V-31 | Loyalty terms | `POL-07.13`, `POL-07.09`, `PRD-RET-019` | KDPS Owner, Accounts | 4 |
| V-32 | Customer notice and consent text; permitted uses | `POL-07.12`, `POL-07.09`, `PRD-POS-012` | KDPS Owner | 4 |
| V-33 | Billed-retained collection period and reminders | `POL-08.04` | Operations | 4 |
| V-34 | Abandoned billed-retained goods: outcome | `POL-08.04` | KDPS Owner, Operations, Accounts | 4 |
| V-35 | Revenue timing for billed-retained goods | `POL-08.06`, `POL-09.10` | CA | 4 |
| V-36 | Approved pilot Store/counter and reserved stock; pilot is cash-first | `POL-16.01`, `POL-16.02`, `POL-16.04` | KDPS Owner, Operations | 4 |
| V-37 | Later external-terminal evidence and reconciliation procedure | `POL-16.02` | KDPS Owner, Accounts | 4 |
| V-38 | Cash-variance tolerance and approver at day close | B-1 | Accounts, KDPS Owner | 4 |
| V-39 | Petty-cash float and limits per Store | `POL-09.14` | Accounts | 4 |
| V-40 | Bill number format within the GST limit | B-3 | CA | 4 |
| V-41 | E-invoice applicability per entity | `POL-10.03` | Accounts, CA | 4 |
| V-42 | Expected/overdue time and escalation for a missing EBO daily report | `POL-02.11` | KDPS Owner, Operations | 4 |
| V-43 | Explicitly permitted offer combinations, agreement-based cost shares, named proposer and approver | `POL-19.01`–`POL-19.05` | KDPS Owner, Brand manager | 4 |
| V-44 | Opening manifest, balances, cutoff, switch date, carried work, approvals and fallback for the pilot Store | `POL-14.05`, `POL-14.07` | KDPS Owner, Accounts, Operations | before the pilot switch (4) |
| V-45 | Run length of the side-by-side test; material-difference threshold for the switch count against the old POS's last SOH. The no-unexplained-difference and all-staff-trained checks are set | [phases.md](../phases.md) | KDPS Owner, Accounts | Run length before the test run; threshold before the first switch |
| V-46 | Tally voucher types checked against KDPS's real Tally | `POL-09.15`, `POL-09.16` | Accounts | 5 |
| V-47 | Franchise rates and terms per agreement | `POL-12.05` | KDPS Owner, Accounts | 5 |
| V-48 | TDS rules | `POL-10.04` | CA | 5 |
| V-49 | Causal shared-cost drivers and other Store P&L/brand allocation bases; compare before and after | `POL-09.20` | Accounts, CA | 5 |
| V-50 | Category-specific capitalisation thresholds, depreciation methods and rates | `POL-09.26` | CA | 5 |
| V-51 | Names of recipients for the 9 PM WhatsApp summary | `POL-02.14` | KDPS Owner | 5 |
| V-52 | Existing validated pay, leave, overtime, incentive and final-settlement rules/examples | `POL-13.06`, `POL-13.11`, `POL-13.15` | KDPS Owner, HR, Accounts, CA | 6 |
| V-53 | Payroll statutory rules per employer and state | `POL-10.04` | Accounts, CA | 6 |
| V-54 | Actual lead times, review/seasonal horizons, held-out evidence and stockout/excess pass thresholds | `POL-15.08` | KDPS Owner, Booking | 6 |
| V-55 | ~~PT approval threshold value basis (cost or MRP)~~ Settled: DEC-015; actual limits remain V-02 | `PRD-ACS-015`, `POL-02.09` | — | — |
| V-56 | EBO brand commission and settlement basis, rates and terms | `POL-12.06` | Owner, Accounts | 5 |
| V-57 | Pieces in each Store today, who labels them and when, before its switch | `PRD-LIF-025` | KDPS Owner, Operations | 4 (before each switch) |
| V-58 | How goods owned before receipt and the supplier liability are recorded before they are counted (the AS or Ind AS framework is V-07) | `POL-09.02`, `POL-09.22`, `PRD-ORG-018` | Accounts, CA | 2 |
| V-59 | Customer credit limits and due dates | `POL-07.09`, `PRD-POS-022` | KDPS Owner, Accounts | 5 |
| V-60 | Which approval types may use an authenticated notification link (B-8) | `PRD-ACS-012` | KDPS Owner | 5 |
| V-61 | Verified MSME classification per supplier and its payment deadline (B-12) | `POL-10.09` | Accounts, CA | 5 |
| V-62 | Each Store's default warehouse and permitted transfer routes (B-14) | `PRD-ORG-013` | Operations | 3 |
| V-63 | Restore operator and pre-launch restore-test date | `POL-18.03` | Admin | 1 |
| V-64 | Rounding rule for a stock cost that does not divide into whole paise (stock-ledger SL-2) | `PRD-MOD-014` | Accounts, CA | 2 |

**Product-owner decisions (Me)** behind the values above: DEC-001 to DEC-035 (DEC-017 to DEC-022 agreed with KDPS, see DEC-029), including A-1 to A-7, A-9, B-1 to B-5, D-02, and 4.1, 4.2, 4.4, 4.6 to 4.12. They are the interview topics in step 4; settled product rules and policy homes are distinguished from values that KDPS or the CA still needs to supply.

## 6. Design files that show open values as decided

Report only. Design is fixed after the PRD and policies settle.

| # | File | Finding | Rule it breaks |
| --- | --- | --- | --- |
| E-1 | `design/ui/design-system.html`, `design/ui/design-language.md` §8 | Bill no. `B01C1/2627/04381` shown as the format. `ui-blueprint.html` open item 20 (Bill number) says the format is open. | 4.9, V-40 |
| E-2 | `design/ui/design-system.html` | **Fixed by DEC-015:** the PT approval card uses total proposed acquisition cost: proposed P RATE times covered quantity (DEC-016). Its synthetic example shows 1,096 pieces and ₹14,27,500, calculated from its displayed quantities and unit costs; the total follows quantity changes. | `PRD-ACS-015`, V-55 |
| E-3 | `design/ui/design-system.html` | Sample values with no "example" label: limits ₹50,000 and ₹50,00,000; day close "due 21:30"; shift 10:00–19:00 with no grace; P RATE = MRP × 0.5 (this one is labelled). | AGENTS.md "Never invent a value" |
| E-4 | `design/ui/ui-blueprint.html` | **Fixed:** the Owner now has View in the access grid. Open item 12 (Held goods) still correctly leaves write-off and disposal approvers and limits OPEN. | `POL-17.04`, V-19 |
| E-5 | `design/ui/design-system.html`, `design/ui/ui-blueprint.html` | Fixed: both files now show Cash only on the offline counter (DEC-020); later card/UPI requires an explicit evidence procedure. The design-system till also lists each piece ID under a piece-tracked line. | `POL-16.02` |
| E-6 | `design/ui/ui-blueprint.html` | Piece-level actions apply to configured piece-tracked profiles; DEC-018 sets apparel/footwear by default and leaves additional categories explicit. No open clash. | `POL-04.09` |
| E-7 | `design/ui/ui-blueprint.html` | Ledger, trial balance and period close sit beside "Tally is the sole official book". Fine only if marked as the internal ledger. | `PRD-LED-011`, `POL-11.01` |
| E-8 | `design/ui/ui-blueprint.html` | Transfer approval needs "a higher authority". `PRD-TRF-005` says "independent higher-authority approval", so this agrees; but `POL-02.07` only says "other than the preparer". Who counts as higher is not set. | V-02 |

## 7. Follow-ups, no decision needed

- Table rows have no IDs yet: business measures, performance targets, the policy table, the stack. Give them IDs when a design document first needs to cite one.
- `phases.md` exit checks copy acceptance text. Point each at its `PRD-ACP-` ID.
- The blueprint numbers its open items (the count is the one shown on its open-items page) and no longer uses the earlier G-, OQ-, R- and BP- codes. Cite PRD and POL IDs beside each item when the blueprint is next edited.
