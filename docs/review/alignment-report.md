# Alignment report — 2 Oct 2026

> **Not ranked.** This report decides nothing and changes nothing. Each fix still needs a decision record (`docs/decisions/`) before the PRD or the policies change. See [README.md](../README.md).

**What was checked.** [prd.md](../prd.md) against [kdps-policies.md](../kdps-policies.md), and both against [phases.md](../phases.md) and the design files in [design/](../design/). Checked after the IDs were added. It re-checks the findings of [audit-2026-10-02.md](../audit-2026-10-02.md); audit codes (B-04, D-06 …) are given where they match.

**How to read it.**

- `PRD-STK-003` is a PRD bullet; `POL-09.04` is a policy answer bullet; `POL-09` is the whole policy.
- **Who decides:** **Me** = the product owner (decides what the product supports, in the PRD). **KDPS Owner**, **Accounts**, **CA** = KDPS people (decide KDPS's values, in the policies). Other PRD personas (Operations, Booking, HR, Admin) are named where the PRD names them.
- **Blocks** = the delivery stage whose live operation waits for it. Design and synthetic-data tests never wait.

## 1. Short version

1. **Two real clashes between the PRD and the policies.** One role per user (POL-02.02) against several roles (PRD-ACS-001). A provisional supplier liability (POL-09.02) with no PRD rule saying when an amount may be recorded.
2. **KDPS values sit inside the PRD.** The 15-day return window, "KDPS-tracked" pieces and "Tally is KDPS's sole book" belong in the policies.
3. **Eleven open points change the data model** (section 4). The biggest: which pieces get a piece ID, the cost averaging scope, ownership before custody, bill series, gift vouchers.
4. **About 14 configured rules have no policy to switch them on** (section 3). Cash-variance tolerance, offer combination rules, Store P&L allocation and bill-number format are the most urgent.
5. **54 values are still open** (section 5). Stage 1 needs 8 of them.
6. **The UI files show some open values as if decided** (section 6).

## 2. PRD against policies: conflicts

### 2.1 Open conflicts

| # | Kind | Where | Finding | Who decides | Blocks |
| --- | --- | --- | --- | --- | --- |
| A-1 | Conflict | `POL-02.02` vs `PRD-ACS-001`, `PRD-ACS-004` | Policy: "Assign each user **a** role with explicit … scope." PRD: a person may hold **several** roles, each scope applied inside its own assignment. Read literally, the policy forbids what the PRD allows, and the persona design (several personas per person) needs several roles. | Me | 1 |
| A-2 | Unclear | `POL-09.02` vs `PRD-LED-005`, `PRD-DMG-016`, `PRD-ACP-004`, `PRD-LIF-008` | Policy 9 lets a supplier obligation carry a **provisional valuation** while the invoice is missing or the PT is pending, "under CA-approved posting rules". The PRD keeps "provisional commercial amounts" distinct (`PRD-LED-005`) and forbids a fictitious payable for unknown pre-PT value (`PRD-ACP-004`). No PRD rule says what evidence makes a provisional amount allowed rather than fictitious. Audit B-08, still open. | Me (the rule); CA (the posting treatment) | 2 |
| A-3 | Layering | `PRD-RET-002` = `POL-06.02` | The PRD states KDPS's own value: "KDPS's ordinary apparel and footwear return window is 15 days from customer handover … The defective-item cutoff remains to be decided." The same sentence is in the policy. A product rule should not carry one customer's value or open item. | Me | 4 |
| A-4 | Layering | PRD "Words used": Tally, Piece ID; `PRD-MER-003` | "Tally: TallyPrime, **KDPS's** sole official accounting book …" and "Piece ID: … one **KDPS-tracked** physical piece" put a customer fact inside product words. "KDPS-tracked" is not defined anywhere (see 4.1). BASIC, NAG, P RATE and the KDPS export profile (`PRD-PTW-008`) are fine: they name a layout the product supports. | Me | 1 |
| A-5 | Layering | `PRD-EXC-012` | "The configured **9 PM** WhatsApp summary." The time is fixed in the PRD while the recipients and channel are policy 2 values. | Me | 5 |
| A-6 | Misfiled | `POL-07.09`; PRD policy table, rows 2 and 7 | "Which refund cases require independent approval" is asked in policy 7, but the PRD lists "refund-approval cases" under policy 2 (Permissions). One question, two homes. Audit D-05. | Me | 4 |
| A-7 | Unclear | PRD policy table, row 14: "1; signed before the pilot switch" | Two times for one policy. Stage 1 needs the opening layouts; the pilot switch is in stage 4. Audit D-03, still open. | Me | 1 |
| A-8 | Gap | `POL-08.04`; PRD policy table, row 8 | The abandonment outcome for goods never collected is still unconfigured. The PRD row requires it. Audit B-13 (second half), still open. | KDPS Owner, Operations, Accounts | 4 |
| A-9 | Unclear | `POL-02.01` template map | The **Brand Manager** template serves both P-BKG (prepares PTs and bookings) and P-BRM (approves offers). The **Store POS** template serves P-STM, P-CSH and P-SLS. Both still work only if a different person approves (`POL-02.07`). Five personas have no template (P-OPS, P-HRS, P-EBO, P-CHA, P-AUD). | KDPS Owner, Admin | 1 |

### 2.2 Earlier audit conflicts, re-checked

| Audit | Status today |
| --- | --- |
| B-01 consignment not a PRD word | Fixed. "Consignment" is in "Words used". |
| B-02 "ticket" for exception and price tag | Fixed. The policies say "exception" and "price tag". |
| B-03 six templates vs PRD roles | Partly fixed. Template map added to policy 2; see A-9. |
| B-04 return policy per entity or Organisation | Fixed. Both say Organisation (`PRD-RET-001`, `POL-06.01`). |
| B-05 repair as a remedy | Fixed. `PRD-RET-004` allows repair. |
| B-06 15 days as a "default" | Fixed in wording; the value now sits in the PRD too (A-3). |
| B-07 unique piece ID vs shared barcode | Text now agrees (`PRD-MER-003`, `PRD-MER-006`, `POL-04.06`). What "KDPS-tracked" covers is open (4.1). |
| B-08 provisional valuation | Open (A-2). |
| B-09 shared-sale splits | Fixed. No longer in policy 13. |
| B-10 net realisable value | Fixed. In "Words used" and `PRD-LED-007`. |
| B-11 "delivery" to customers | Fixed. Gone from policy 6. |
| B-12 second-person list too short | Fixed. `POL-02.07` lists transfers, damage, offers, mapping rules and supplier-return steps. |
| B-13 handover wording; abandonment | Wording fixed (`POL-08.01`). Abandonment open (A-8). |

## 3. Configured rules with no policy to switch them on

The PRD says these are "configured" or "under policy". Nothing is on by default (`PRD-SEC-017`), so each one needs a home in "Required policy configuration".

| # | Rule | PRD IDs | Nearest policy | What is missing | Who decides | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| B-1 | Cash variance at day close: tolerance, who approves, what happens above it | `PRD-CSH-001`, `PRD-CSH-002`, `PRD-EXC-001` | 9 covers "rounding/invoice tolerances" only | A cash-variance line in policy 9 or 2 | Me (where it lives); Accounts (values) | 4 |
| B-2 | Offer combination (stacking) rules, brand and company cost shares, markdown approval | `PRD-OFR-002`, `PRD-OFR-007`, `PRD-POS-003` | 2 covers who approves only | An offers and pricing policy, or a widened row | Me; KDPS Owner, Brand manager | 4 |
| B-3 | Bill and document number formats, including the GST limit | `PRD-MOD-004`, `PRD-OFF-002`, `PRD-LIF-015` | None | A numbering line (format per registration and year) | Me (shape); CA (compliance) | 4 |
| B-4 | Store P&L and brand-by-store profit allocation bases | `PRD-EXC-008` | None | Merchandise cost, commission, support and expense allocation bases | Me; KDPS Owner, Accounts | 5 |
| B-5 | EBO: when a daily report counts as missing; brand commission and settlement basis | `PRD-EBO-007`, `PRD-EBO-009` | 12 covers franchise partners, not EBO brands | An EBO line in policy 1 or 12 | Me; KDPS Owner, Operations | 4 |
| B-6 | Loyalty earning, redemption and expiry | `PRD-RET-019` | Rows 6 and 7 name loyalty; `POL-06` says nothing; `POL-07.09` says unconfirmed | The answer itself | KDPS Owner, Accounts | 4 |
| B-7 | Gift voucher issue, validity and redemption | `PRD-POS-005` | Row 7 names it; `POL-07.09` says unconfirmed | The answer itself | KDPS Owner, Accounts | 4 |
| B-8 | Which actions may be approved by phone or WhatsApp | `PRD-ACS-012` | 2 | A list of permitted actions | KDPS Owner | 5 |
| B-9 | Bulk approval "risk policy"; delegation during absence | `PRD-ACS-010`, `PRD-ACS-011` | 2 | Which approvals may be bulked or delegated | KDPS Owner, Admin | 1 |
| B-10 | Open-to-buy budget: who sets and approves it | `PRD-BKG-004`, `POL-05.02` | 5 | The budget owner and approval | KDPS Owner, Booking | 2 |
| B-11 | Supplier-return reminder schedule | `PRD-OFR-009` | 1 has return windows, no reminders | The reminder schedule per agreement | Operations | 3 |
| B-12 | MSME payment obligations | `PRD-PAY-010` | 10 does not name MSME | MSME classification and due-date rules | Accounts, CA | 5 |
| B-13 | Depreciation method and fixed-asset rules | `PRD-TAX-009` | 9 does not name depreciation | Method, rates, capitalisation threshold | CA | 5 |
| B-14 | Default warehouse and permitted transfer routes per Store | `PRD-ORG-013`, `PRD-TRF-004` | None (setup data) | Routes and who may change them | Operations | 3 |

## 4. Open points that change the data model

### 4.1 Piece IDs

- **Where:** `PRD-MER-003`, `PRD-MER-006`, `PRD-STK-003`, `POL-04.06`, `POL-04.07`, `POL-09.07`.
- **The point.** Every "KDPS-tracked" piece gets its own ID, while identical pieces share a supplier barcode. Nothing says which pieces are tracked.
- **Why it matters.** It decides whether stock is stored per piece or as quantity per SKU, how labels print at receipt, and what the till must scan. If the till scans only a supplier barcode, the system cannot know which piece was sold, and `PRD-MER-003` (piece identity through sale) fails.
- **Who decides:** Me (what "tracked" means and whether the till must scan the piece); Booking, Operations (which categories).
- **Blocks:** 2 (labels at receipt).

### 4.2 Cost formula and averaging scope

- **Where:** `POL-09.06`, `POL-09.07`, `POL-09.09`, `PRD-LED-006`.
- **The point.** Moving weighted average is "preferred", subject to the CA. The scope of the average is not stated: per SKU across the whole accounting book? Per SKU per Site? Per business unit? KDPS's current method is unknown.
- **Why it matters.** It decides the shape of cost layers and the cost of every transfer, return and late cost change.
- **Who decides:** Me (the scopes the product supports); CA (formula and scope for KDPS); Accounts (today's method).
- **Blocks:** 2 (first receipt cost).

### 4.3 Does KDPS's Tally track stock?

- **Where:** `POL-09.15`, `POL-09.16`, `PRD-LED-012`.
- **The point.** If Tally keeps inventory, vouchers must carry items and quantities, and stock journals may be needed. If it keeps accounts only, vouchers carry ledger amounts.
- **Why it matters.** It decides the voucher model and whether stock is valued in two places.
- **Who decides:** Accounts (fact); CA (whether it should).
- **Blocks:** 5 (vouchers); the posting model is designed in 1.

### 4.4 Ownership before custody

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

### 4.7 Split-tender refund order

- **Where:** `POL-07.01`, `PRD-RET-010`, `PRD-POS-005`.
- **The point.** Refunds go to the original tenders, capped per tender, and "no new tender priority is assumed". For a partial return of a bill paid in two or more tenders, nothing says which tender is refunded first.
- **Why it matters.** It decides how much refundable value each tender line keeps.
- **Who decides:** Me (the orders the product supports); KDPS Owner, Accounts (which one KDPS uses).
- **Blocks:** 4.

### 4.8 Count and cash tolerances

- **Where:** `PRD-STK-008`, `PRD-CSH-001`, `POL-02.11`, `POL-09.13`, `POL-09.14`.
- **The point.** It is not said what a tolerance does. Does a difference inside it post automatically, or is it still approved, only by a lower authority? `POL-09.13` says differences show even within tolerance and never authorise a write-off; the PRD says nothing for counts or cash.
- **Why it matters.** It decides whether an adjustment can exist without an approval record.
- **Who decides:** Me (what a tolerance does); KDPS Owner, Operations, Accounts (values).
- **Blocks:** 3 (counts), 4 (cash).

### 4.9 Bill numbering per device

- **Where:** `PRD-OFF-002`, `PRD-LIF-015`, `PRD-ORG-005`.
- **The point.** The offline counter has its own series per financial year. Nothing says whether online tills also have one each, or share a Store series. A GST invoice number is limited in length and must be unique per registration and year (CA to confirm the exact rule). One Site can hold units with different registrations.
- **Why it matters.** It decides who owns a number series: device, Store or business unit and registration.
- **Who decides:** Me (series owner); CA (format rules).
- **Blocks:** 4.

### 4.10 Store credit and gift vouchers

- **Where:** `PRD-RET-016`, `PRD-POS-005`, `POL-07.03`, `POL-07.09`.
- **The point.** Store credit is customer-linked (PRD). Gift vouchers are named as a tender only. Does the product sell its own vouchers (a liability), only accept outside ones, or both? Are they bearer or named? Can a voucher be refunded?
- **Why it matters.** It decides a voucher ledger and whether a voucher sale is a sale of goods.
- **Who decides:** Me (what the product supports); KDPS Owner, Accounts, CA (terms and tax).
- **Blocks:** 4.

### 4.11 Value basis of approval limits

- **Where:** `POL-02.09`, `PRD-ACS-011`.
- **The point.** Limits use "amount, quantity or discount percentage". For stock it is not said whether the amount is at MRP or at cost. Unknown pre-PT cost (`PRD-DMG-005`) has no amount at all. Audit D-06, still open.
- **Why it matters.** Each limit needs a stored basis, and a rule for unknown value.
- **Who decides:** Me (per-limit basis, and the rule for unknown value); KDPS Owner (values).
- **Blocks:** 1.

## 5. Open values

Every value below is unset. None may be invented; each stays OPEN until its owner gives it.

| # | Value | IDs | Who decides | Blocks |
| --- | --- | --- | --- | --- |
| V-01 | Which person holds which persona, role and scope | `POL-02.11` | KDPS Owner, Admin | 1 |
| V-02 | Approval limit amounts per action and approver | `POL-02.10` | KDPS Owner | 1 |
| V-03 | Exception owners, due times, escalation and alert recipients | `POL-02.11` | KDPS Owner, Admin | 1 |
| V-04 | Session lengths; OTP or TOTP | `POL-02.11`, `PRD-SEC-001` | KDPS Owner, Admin | 1 |
| V-05 | Categories needing batch or expiry; shelf-life days for receiving and selling | `POL-04.08` | Booking, Operations | 1 |
| V-06 | Categories whose pieces get a piece ID | `POL-04.06` | Booking, Operations | 2 |
| V-07 | Accounting framework: AS or Ind AS | `POL-09.10` | CA | 2 |
| V-08 | KDPS's current cost method | `POL-09.09` | Accounts | 1 |
| V-09 | Cost formula and averaging scope for KDPS | `POL-09.06` | CA | 2 |
| V-10 | Ledger accounts and posting maps per book | `POL-09.11` | Accounts, CA | 2 |
| V-11 | Rounding and invoice-matching tolerances | `POL-09.14` | Accounts | 2 |
| V-12 | Recovery targets accepted (15 min / 4 h are provisional) | `POL-18.01` | KDPS Owner | 1 |
| V-13 | Retention period per record class; legal holds | `POL-18.05` | KDPS Owner, Admin, CA | 1 |
| V-14 | Commercial model, ownership event, return terms and payment terms per brand | `POL-01.05`, `POL-01.09`, `POL-01.14` | KDPS Owner, Accounts | 2 |
| V-15 | Costing profile per brand (BASIC to P RATE, charges, rounding) | `POL-03.06`, `POL-03.07` | Booking, Accounts | 2 |
| V-16 | Who may change or cancel a booking, and until when; delivery windows | `POL-05.04`, `POL-05.05` | KDPS Owner, Booking | 2 |
| V-17 | Open-to-buy budgets by brand and season | `POL-05.02`, `PRD-BKG-004` | KDPS Owner, Booking | 2 |
| V-18 | GST registration per business unit; HSN codes, rates and slabs | `POL-10.06` | Accounts, CA | 2 |
| V-19 | Write-off and disposal approvers and limits | `POL-17.04` | KDPS Owner, Operations, Accounts | 2 (write-off and disposal by 3) |
| V-20 | Who accepts wrong or unidentified goods (Booking is named; which people) | `POL-17.02` | KDPS Owner | 2 |
| V-21 | Count tolerance, variance approver, rule for movement during a count | `POL-02.11` | KDPS Owner, Operations | 3 |
| V-22 | Supplier-return reminder schedule | `PRD-OFR-009` | Operations | 3 |
| V-23 | Defective-item return cutoff | `POL-06.05` | KDPS Owner, Operations | 4 |
| V-24 | Stores with an authorised return override | `POL-06.01` | KDPS Owner | 4 |
| V-25 | Tenders enabled online | `POL-07.09` | KDPS Owner, Accounts | 4 |
| V-26 | Refund order for split-tender bills | `POL-07.01` | KDPS Owner, Accounts | 4 |
| V-27 | Which refunds need a second person | `POL-07.09` | KDPS Owner, Accounts | 4 |
| V-28 | No-bill returns on or off; value limit; valuation method | `POL-07.08` | KDPS Owner, Accounts | 4 |
| V-29 | Store-credit validity and cross-Store scope | `POL-07.09`, `PRD-RET-016` | KDPS Owner, Accounts | 4 |
| V-30 | Gift voucher terms | `POL-07.09` | KDPS Owner, Accounts, CA | 4 |
| V-31 | Loyalty terms | `POL-07.09`, `PRD-RET-019` | KDPS Owner, Accounts | 4 |
| V-32 | Customer notice and consent text; permitted uses | `POL-07.09`, `PRD-POS-012` | KDPS Owner | 4 |
| V-33 | Billed-retained collection period and reminders | `POL-08.04` | Operations | 4 |
| V-34 | Abandoned billed-retained goods: outcome | `POL-08.04` | KDPS Owner, Operations, Accounts | 4 |
| V-35 | Revenue timing for billed-retained goods | `POL-08.06`, `POL-09.10` | CA | 4 |
| V-36 | Which Stores bill offline, on which counter; stock set aside per Store | `POL-16.01`, `POL-16.04` | KDPS Owner, Operations | 4 |
| V-37 | Evidence procedure for card or UPI taken offline | `POL-16.02` | KDPS Owner, Accounts | 4 |
| V-38 | Cash-variance tolerance and approver at day close | B-1 | Accounts, KDPS Owner | 4 |
| V-39 | Petty-cash float and limits per Store | `POL-09.14` | Accounts | 4 |
| V-40 | Bill number format within the GST limit | B-3 | CA | 4 |
| V-41 | E-invoice applicability per entity | `POL-10.03` | Accounts, CA | 4 |
| V-42 | EBO missing-report time; EBO brand commission basis | B-5 | KDPS Owner, Operations | 4 |
| V-43 | Offer stacking rules and cost shares | B-2 | KDPS Owner, Brand manager | 4 |
| V-44 | Opening manifest, balances, cutoff and switch date for the pilot Store | `POL-14.07` | KDPS Owner, Accounts, Operations | before the pilot switch (4) |
| V-45 | Go or no-go pass marks for the test run | [phases.md](../phases.md) | KDPS Owner | before the test run |
| V-46 | Tally voucher types checked against KDPS's real Tally | `POL-09.15`, `POL-09.16` | Accounts | 5 |
| V-47 | Franchise rates and terms per agreement | `POL-12.05` | KDPS Owner, Accounts | 5 |
| V-48 | TDS rules | `POL-10.04` | CA | 5 |
| V-49 | Store P&L allocation bases | B-4 | KDPS Owner, Accounts | 5 |
| V-50 | Depreciation method and rates | B-13 | CA | 5 |
| V-51 | Who receives the 9 PM summary, and on which channel | `POL-02.11` | KDPS Owner | 5 |
| V-52 | Pay, leave, overtime, incentive and final-settlement values | `POL-13.06`, `POL-13.11` | KDPS Owner, HR | 6 |
| V-53 | Payroll statutory rules per employer and state | `POL-10.04` | Accounts, CA | 6 |
| V-54 | Forecast horizons, measures and thresholds | `POL-15.07` | KDPS Owner, Booking | 6 |

**Product-owner decisions (Me)** behind the values above: A-1 to A-7, B-1 to B-5, and 4.1, 4.2, 4.4, 4.6 to 4.11. They are the interview topics in step 4.

## 6. Design files that show open values as decided

Report only. Design is fixed after the PRD and policies settle.

| # | File | Finding | Rule it breaks |
| --- | --- | --- | --- |
| E-1 | `design/ui/design-system.html`, `design/ui/design-language.md` §8 | Bill no. `B01C1/2627/04381` shown as the format. `ui-blueprint.html` G20 says the format is open. | 4.9, V-40 |
| E-2 | `design/ui/design-system.html` | Limits shown as "Value at cost" for adjustments and "Proposed at MRP" for a PT. Blueprint G2 says the basis is open. | 4.11 |
| E-3 | `design/ui/design-system.html` | Sample values with no "example" label: limits ₹50,000 and ₹50,00,000; day close "due 21:30"; shift 10:00–19:00 with no grace; P RATE = MRP × 0.5 (this one is labelled). | AGENTS.md "Never invent a value" |
| E-4 | `design/ui/ui-blueprint.html` | The Owner gets "Approve losses" in the access grid; G12 says write-off approvers are open. | `POL-17.04`, V-19 |
| E-5 | `design/ui/design-system.html`, `design/ui/ui-blueprint.html` | Offline tenders differ: design system shows Cash and UPI; the blueprint till mock in Offline state shows all five tenders. | `POL-16.02`, `PRD-OFF-017` |
| E-6 | `design/ui/ui-blueprint.html` | "The till, counts and stock lookup scan [the piece ID]" reads as settled; G5 says which goods get piece IDs is open. | 4.1 |
| E-7 | `design/ui/ui-blueprint.html` | Ledger, trial balance and period close sit beside "Tally is the sole official book". Fine only if marked as the internal ledger. | `PRD-LED-011`, `POL-11.01` |
| E-8 | `design/ui/ui-blueprint.html` | Transfer approval needs "a higher authority". `PRD-TRF-005` says "independent higher-authority approval", so this agrees; but `POL-02.07` only says "other than the preparer". Who counts as higher is not set. | V-02 |

## 7. Follow-ups, no decision needed

- Table rows have no IDs yet: business measures, performance targets, the policy table, the stack. Give them IDs when a design document first needs to cite one.
- `phases.md` exit checks copy acceptance text. Point each at its `PRD-ACP-` ID.
- The UI codes (G-, OQ-, R-, BP-) should map to PRD and POL IDs when the blueprint is next edited.
