# KDPS values

> **Not ranked.** What KDPS, Accounts, the CA and other named people must answer, sign or confirm before an operation goes live. It decides nothing and supplies no value: every value here is unset and has no default (`AGENTS.md`, "Never invent a value"). The questions themselves, in plain language, are in [questions-for-kdps.md](../questions-for-kdps.md); this page tracks each by its RR number, its V-number where it has one, and the gate it blocks. Almost all block live use only: design, code and tests on labelled synthetic data go on without them.

**Original IDs.** `V-n` is [alignment-report.md](../history/alignment-report.md) section 5. `SL-n`, `MM-n`, `DM-n`, `D-n`, `GC2-n` to `GC7-n` are the open-question tables of [stock-ledger.md](../design/stock/stock-ledger.md), [module-map.md](../design/architecture/module-map.md), [domain-model.md](../design/architecture/domain-model.md), [deployment.md](../design/platform/deployment.md) and the GC designs. `GC-n` is [gaps-before-code.md](../history/gaps-before-code.md). "KDPS Owner 12", "Accounts 3", "CA 18" and "Operations 7" are question numbers in [questions-for-kdps.md](../questions-for-kdps.md). `Q-n` and the gap numbers are in the data notes ([open-questions.md](../data-notes/open-questions.md), [needs-coverage.md](../data-notes/needs-coverage.md)).

## 1. KDPS decisions that shape the build

| RR | Original ID and source | Decision or value needed | Owner | Affects | Blocks at | Synthetic work proceeds |
| --- | --- | --- | --- | --- | --- | --- |
| RR-054 | GC3-5; Admin (questions list) | Password rules, including whether a temporary password expires unused (access-and-approvals 3.2), and after how many failed sign-ins attempts slow or stop, for how long. Attempts are counted by typed login and by source address, with equivalent answers for a login that exists and one that does not (`DEC-116`); only the numbers are open. Until expiry is set, a temporary password does not expire: that fails open, and is acceptable only because GC3-5 gates live use | Admin; product owner | S1-F01 | Live S1 | Yes, labelled synthetic settings |
| RR-055 | GC3-6; KDPS Owner 54 | How long a fresh authenticator code stays fresh for protected actions | KDPS Owner | S1-F01 | Live S1 | Yes: until set, every protected action asks again |
| RR-056 | `POL-02.23`; KDPS Owner 45; GC3-12 | The approve and reject reason list. Deciding is unavailable until a list is in force; the first list is approved with a free-text reason (`DEC-104`) | KDPS Owner, Admin | S1-F01 | Live S1; on `kdps-test` the first list is a test setting | Yes, a labelled synthetic list |
| RR-057 | MM-8; KDPS Owner 49 | Who approves Site readiness and each business unit's activity | KDPS Owner | S1-F04 | Live S1 | Yes |
| RR-058 | GC3-8; KDPS Owner 52 | Due times and escalation recipients for approvals and tasks, per action type and Site | KDPS Owner, Admin | S1-F05 | Live S1 | Yes: items carry no due time until set |
| RR-059 | Alignment report B-9; KDPS Owner 5; `POL-02.19`, `POL-02.20` | The bulk-approval allowlist; named stand-ins, scopes, limits and periods | KDPS Owner, Admin | S1-F05 | Live S1 | Yes: an empty allowlist allows nothing |
| RR-060 | GC5-1; Accounts 14 | Start and end of the financial year for yearly series | Accounts, CA | S1-F08, S1-F09, S1-F12 | Live S1; bills in S4 | Yes |
| RR-061 | GC4-1; Accounts 15 | The periods of each book inside the financial year | Accounts, CA | S1-F09 | Live S2 (first live posting) | Yes |
| RR-062 | GC5-2; CA 17 | Number formats of statutory documents other than bills (credit notes, movement documents) | Accounts, CA | S3-F03, S4-F05 | Live S3, S4 | Yes |
| RR-063 | GC4-3; CA 19 | Does a correction of a journal posted under a wrong map fall on its own date or in the original period | Accounts, CA | S5-F01 | Live S5 | Yes |

## 2. KDPS values (V-numbers)

Each value below is unset and has no default (`AGENTS.md`, "Never invent a value"). Every one blocks only live activation, except where the gate says otherwise; synthetic work proceeds for all of them.

| RR | Value (V-number) | Sources and KDPS question | Owner | Affects | Blocks at |
| --- | --- | --- | --- | --- | --- |
| RR-064 | Which person holds which persona, role and scope (also who approves refunds, KDPS Owner 17; who holds the approve permissions, KDPS Owner 42) (V-01) | `POL-02.11`; KDPS Owner 1, 17, 42 | KDPS Owner, Admin | S1-F01, S1-F02, S1-F05 | Live S1; on `kdps-test` test assignments only (`DEC-103`) |
| RR-065 | Approval limit amounts per action and approver, including individual limits (V-02) | `POL-02.10`, `POL-02.15`; KDPS Owner 2, 18 | KDPS Owner | S1-F05 and every valued approval | Live S1 (approvals); a missing limit grants nothing |
| RR-066 | Exception owners, due times, escalation and alert recipients, including missing EBO reports (V-03) | `POL-02.11`, `POL-02.16`; KDPS Owner 3 | KDPS Owner, Admin | S1-F08; every feature that raises exceptions | Live S1; an operation whose exceptions have no routing stays unavailable |
| RR-067 | Validate production TOTP and the 5/15-minute idle and 12-hour absolute limits; name the setup Admin and first access approver (V-04) | `POL-02.17`, `POL-02.18`, `PRD-ACS-023`; KDPS Owner 4 | Admin | S1-F01 | Live S1 |
| RR-068 | Categories needing batch or expiry; shelf-life days for receiving and selling (SL-8) (V-05) | `POL-04.08`; Operations 1 | Booking, Operations | S1-F03, S2-F02 | Live S1 (profiles); S2 (receiving) |
| RR-069 | Piece-tracked categories beyond apparel and footwear (V-06) | `POL-04.09`; Operations 2 | Booking, Operations | S1-F03, S2-F07 | Live S2 |
| RR-070 | Accounting framework: AS or Ind AS (V-07) | `POL-09.10`; CA 1 | CA | S1-F09, S1-F10 | Live S2 (first live posting) |
| RR-071 | KDPS's current cost method and pool, with a valuation sample (SL-1) (V-08) | `POL-09.09`, `POL-09.21`; Accounts 1 | Accounts, CA | S1-F09, S1-F10 | Live S1 as listed; in practice before the first live valued movement (S2) |
| RR-072 | Confirm the applicable method and pool; validate any future change (SL-1) (V-09) | `POL-09.06`, `POL-09.19`, `POL-09.21`; CA 2 | CA | S1-F10 | Live S2 |
| RR-073 | Ledger accounts and posting maps per book, including variance accounts (SL-3) (V-10) | `POL-09.11`; Accounts 3 | Accounts, CA | S1-F09 | Live S2 |
| RR-074 | Rounding and invoice-matching tolerances (V-11) | `POL-09.14`; Accounts 4 | Accounts | S1-F09, S2-F10 | Live S2 |
| RR-075 | Recovery targets accepted (15 minutes, 4 hours are provisional) (V-12) | `POL-18.01`; KDPS Owner 6 | KDPS Owner | S1-F14 | Live S1 (go-live drill) |
| RR-076 | Retention period per record class; legal holds (V-13) | `POL-18.05`; KDPS Owner 7, CA 12 | KDPS Owner, Admin, CA | S1-F14, S1-F01 (audit) | Live S1; nothing is deleted while unset |
| RR-077 | Commercial model, ownership event, return and payment terms per brand (V-14) | `POL-01.05`, `POL-01.09`, `POL-01.14`; KDPS Owner 8 | KDPS Owner, Accounts | S1-F03, S2-F01, S2-F03, S3-F07 | Live S2 |
| RR-078 | Costing profile per brand: BASIC to P RATE, charges, rounding (V-15) | `POL-03.06`, `POL-03.07`; Accounts 6 | Booking, Accounts | S2-F04 | Live S2 |
| RR-079 | Who may change or cancel a booking, until when; delivery windows (V-16) | `POL-05.04`, `POL-05.05`; KDPS Owner 9 | KDPS Owner, Booking | S2-F01 | Live S2 |
| RR-080 | Open-to-buy budgets by brand and season (V-17) | `POL-05.02`, `POL-05.09`, `PRD-BKG-004`; KDPS Owner 10 | KDPS Owner, Booking, Accounts | S2-F01 | Live S2 |
| RR-081 | GST registration per business unit; HSN codes, rates and slabs (V-18) | `POL-10.06`, `POL-10.08`; Accounts 5 | Accounts, CA | S1-F02, S1-F09, S1-F11 | Live S2 |
| RR-082 | Named write-off and disposal approvers and cost limits (V-19) | `POL-17.04`, `POL-17.10`; KDPS Owner 11 | KDPS Owner, Operations, Accounts | S3-F06 | Live S3 |
| RR-083 | Named Booking approvers for resolved wrong or unidentified goods (V-20) | `POL-17.02`, `POL-17.11`; KDPS Owner 12 | KDPS Owner | S2-F08 | Live S2 |
| RR-084 | Count cost limits, Store manager and escalation approvers (SL-7) (V-21) | `POL-02.11`, `POL-02.21`; KDPS Owner 13 | KDPS Owner, Operations | S3-F05 | Live S3 |
| RR-085 | Supplier-return reminder schedule (V-22) | `PRD-OFR-009`; Operations 3 | Operations | S3-F07 | Live S3 |
| RR-086 | Defect assessment, consumer-rights and warranty evidence (V-23) | `POL-06.05`; KDPS Owner 14 | KDPS Owner, Operations | S4-F05 | Live S4 |
| RR-087 | Stores with an authorised return override (V-24) | `POL-06.01`; KDPS Owner 15 | KDPS Owner | S4-F05 | Live S4 |
| RR-088 | Provider and evidence configuration for the selected tenders (V-25) | `POL-07.09`, `PRD-POS-021`; KDPS Owner 16 | KDPS Owner, Accounts | S4-F02 | Live S4 |
| RR-089 | No-bill returns on or off; value limit; valuation method (V-28) | `POL-07.08`; KDPS Owner 18 | KDPS Owner, Accounts | S4-F05 | Live S4 |
| RR-090 | Store credit validity and authorised Stores in the same legal entity (V-29) | `POL-07.11`, `PRD-RET-023`; KDPS Owner 19 | KDPS Owner, Accounts | S4-F06 | Live S4 |
| RR-091 | Gift-voucher validity, partial redemption, unused balance, lost voucher, tax (V-30) | `POL-07.10`, `POL-10.10`; KDPS Owner 20, CA 6 | KDPS Owner, Accounts, CA | S4-F06 | Live S4 |
| RR-092 | Loyalty terms (V-31) | `POL-07.13`, `POL-07.09`, `PRD-RET-019`; KDPS Owner 21 | KDPS Owner, Accounts | S4-F06 | Live S4 |
| RR-093 | Customer notice and consent text; permitted uses (V-32) | `POL-07.12`, `PRD-POS-012`; KDPS Owner 22 | KDPS Owner | S4-F03 | Live S4 |
| RR-094 | Billed-retained collection period and reminders (V-33) | `POL-08.04`; Operations 5 | Operations | S4-F07 | Live S4 |
| RR-095 | Outcome for abandoned billed-retained goods (alignment report A-8) (V-34) | `POL-08.04`; KDPS Owner 23 | KDPS Owner, Operations, Accounts | S4-F07 | Live S4 |
| RR-096 | Revenue timing for billed-retained goods (SL-17 part) (V-35) | `POL-08.06`, `POL-09.10`; CA 5 | CA | S4-F07 | Live S4 |
| RR-097 | Pilot offline Store, counter and reserved stock (cash first) (V-36) | `POL-16.01`, `POL-16.02`, `POL-16.04`; KDPS Owner 24 | KDPS Owner, Operations | S4-F11 | Live S4 (offline) |
| RR-098 | External-terminal evidence and reconciliation procedure for offline use (V-37) | `POL-16.02`; KDPS Owner 24 | KDPS Owner, Accounts | S4-F11 | Live S4, only if card or UPI is recorded offline |
| RR-099 | Day-close cash-variance tolerance, approver sets and higher approver (V-38) | `POL-02.13`, `PRD-CSH-011`; KDPS Owner 25 | Accounts, KDPS Owner | S4-F08 | Live S4 |
| RR-100 | Petty-cash float and limits per Store (V-39) | `POL-09.14`; Accounts 7 | Accounts | S4-F08 | Live S4 |
| RR-101 | Bill number format within the GST limit (V-40) | `POL-10.07`; CA 4 | CA | S1-F12, S4-F02 | Live S4 |
| RR-102 | E-invoice applicability per entity (V-41) | `POL-10.03`; Accounts 8 | Accounts, CA | S4-F09 | Live S4 |
| RR-103 | Expected and overdue time and escalation for a missing EBO daily report (V-42) | `POL-02.11`; KDPS Owner 26 | KDPS Owner, Operations | S4-F10 | Live S4 |
| RR-104 | Permitted offer combinations, cost shares, named proposer and approver (V-43) | `POL-19.01` to `POL-19.05`; KDPS Owner 27 | KDPS Owner, Brand manager | S4-F04 | Live S4 |
| RR-105 | Pilot opening manifest, balances, cutoff, switch date, carried work, approvals, fallback (V-44) | `POL-14.05`, `POL-14.07`; KDPS Owner 28 | KDPS Owner, Accounts, Operations | S4-F12 | Live S4 (before the pilot switch) |
| RR-106 | Run length of the side-by-side test; material-difference threshold; meaning of serious exception (V-45) | `POL-14.08`; KDPS Owner 29, 38, 39 | KDPS Owner, Accounts, Operations | S2-F12, S4-F12 | Run length before the side-by-side test; the rest before the first switch |
| RR-107 | Tally voucher types checked against KDPS's real Tally (the MM-12 setting value) (V-46) | `POL-09.15`, `POL-09.16`; Accounts 2, 9 | Accounts | S5-F02 | Live S5 |
| RR-108 | Franchise rates and terms per agreement (V-47) | `POL-12.05`; KDPS Owner 32 | KDPS Owner, Accounts | S5-F08 | Live S5 |
| RR-109 | TDS rules (V-48) | `POL-10.04`; CA 8 | CA | S5-F06 | Live S5 |
| RR-110 | Store P&L and brand-by-Store allocation bases (V-49) | `POL-09.20`; KDPS Owner 34 | Accounts, CA | S5-F07 | Live S5 |
| RR-111 | Capitalisation thresholds, depreciation methods and rates (V-50) | `POL-09.26`; CA 10 | CA | S5-F07 | Live S5 |
| RR-112 | Recipients of the 9 PM WhatsApp summary (V-51) | `POL-02.14`; KDPS Owner 30 | KDPS Owner | S5-F11 | Live S5 |
| RR-113 | Validated pay, leave, overtime, incentive and final-settlement rules (V-52) | `POL-13.06`, `POL-13.11`, `POL-13.15`; KDPS Owner 35 | KDPS Owner, HR, Accounts, CA | S6-F01, S6-F02, S6-F03 | Live S6 |
| RR-114 | Payroll statutory rules per employer and state (V-53) | `POL-10.04`; CA 11 | Accounts, CA | S6-F03 | Live S6 |
| RR-115 | Lead times, horizons, held-out evidence, pass thresholds for forecasts (V-54) | `POL-15.08`; KDPS Owner 36 | KDPS Owner, Booking | S6-F04 | Live S6 |
| RR-116 | EBO brand commission and settlement basis, rates and terms (V-56) | `POL-12.06`; KDPS Owner 33 | KDPS Owner, Accounts | S5-F08 | Live S5 |
| RR-117 | Pieces in each Store, who labels them and when, before its switch (V-57) | `PRD-LIF-025`; Operations 6 | KDPS Owner, Operations | S4-F12 | Live S4 (before each switch) |
| RR-118 | How goods owned before receipt and their supplier liability are recorded (V-58) | `POL-09.02`, `POL-09.22`, `PRD-ORG-018`; CA 3 | Accounts, CA | S2-F03 | Live S2 |
| RR-119 | Customer credit limits and due dates (V-59) | `POL-07.09`, `PRD-POS-022`; KDPS Owner 16 | KDPS Owner, Accounts | S5-F05 | Live S5 |
| RR-120 | Action types allowed for phone approval links (V-60) | `POL-02.22`, `PRD-ACS-012`; KDPS Owner 31 | KDPS Owner | S5-F11 | Live S5 |
| RR-121 | Verified MSME classification and payment deadline per supplier (V-61) | `POL-10.09`; CA 9 | Accounts, CA | S5-F04 | Live S5 |
| RR-122 | Each Store's default warehouse and permitted transfer routes (V-62) | `PRD-ORG-013`; Operations 4 | Operations | S1-F02, S3-F01 | Live S3 |
| RR-123 | Restore operator, pre-launch restore-test date, drill frequency (V-63) | `POL-18.03`; Admin | Admin, KDPS Owner | S1-F14 | Live S1 (pre-launch drill) |
| RR-124 | Rounding rule for a stock cost that does not divide into whole paise (SL-2) (V-64) | `PRD-MOD-014`; Accounts 10 | Accounts, CA | S1-F10 | Live S2: G10b, the values under the real rule, is accepted before moving-average postings go live. Stage 1 proves G10a instead (refusal with no rule; an emptying outflow leaves no residue); G10 is not a stage 1 exit item |
| RR-125 | Offline working-set validity time (V-66) | `POL-16.07`, `PRD-OFF-004`; KDPS Owner 44 | KDPS Owner, Operations | S4-F11 | Live S4 (offline) |
| RR-126 | Cheaper-replacement rule for exchanges (V-67) | `POL-06.09`, `PRD-RET-008`; KDPS Owner 46 | KDPS Owner, Operations | S4-F05 | Live S4 |
| RR-127 | Replacement-SKU restrictions (V-68) | `POL-06.10`, `PRD-RET-009`; KDPS Owner 46 | KDPS Owner, Operations | S4-F05 | Live S4 |
| RR-128 | Evidence for refused return attempts (V-69) | `POL-06.11`, `PRD-RET-015`; KDPS Owner 46 | KDPS Owner, Operations | S4-F05 | Live S4 |
| RR-129 | Exception alert thresholds and recipients (V-70) | `POL-02.25`, `PRD-EXC-013`; KDPS Owner 47 | KDPS Owner, Admin | S1-F08, S4-F08, S4-F10 | Live S4 |
| RR-130 | Owner authority for onward commission (V-71) | `POL-12.08`, `PRD-PAY-013`; KDPS Owner 48 | KDPS Owner, Accounts | S5-F05 | Live S5 |
| RR-131 | Return credit-note and tax-document cancellation treatment (V-72) | `POL-10.11`, `PRD-TAX-004`; CA 7 | CA | S4-F05, S4-F09 | Live S4 |

## 3. Other KDPS, Accounts and CA answers

| RR | Original ID and source | Value or decision needed | Owner | Affects | Blocks at | Synthetic work proceeds |
| --- | --- | --- | --- | --- | --- | --- |
| RR-132 | GC6-9; Accounts 19 | What counts as valuation evidence for an opening row; whether the earlier POS's `Rate` may serve | Accounts, CA | S1-F13, S4-F12 | Live S4 (switch) | Yes |
| RR-133 | GC6-10; Accounts 20 | Fields of the dues, advances and deposits layouts; what "outstanding commercial stock" holds; the form of the closed-books balances | Accounts, CA | S1-F13, S4-F12 | Live S4 (switch); stage 1 builds the layouts on synthetic fields | Yes |
| RR-134 | GC6-13; Accounts 24 | Rounding rule for each money column whose value has more decimals than paise | Accounts | S1-F06, S2-F13 | Live: the first real import of that column | Yes |
| RR-135 | GC6-14; Operations 7 | Which reason texts and bill series mark an earlier-POS line as a transfer keyed as a sale | Operations, Accounts | S2-F12 | Live: side-by-side reports | Yes |
| RR-136 | GC7-1; CA 21 | Do selling prices, MRP and price lists include tax | CA | S1-F11, S4-F02 | Live S4 | Yes: golden cases cover both bases as rule data |
| RR-137 | GC7-2; CA 22 | Which value is compared with a value slab, and what applies near a bound | CA | S1-F11, S4-F02 | Live S4 | Yes |
| RR-138 | GC7-3; CA 23 | Tax rounding: per line or bill, per component or total, mode, what is rounded | Accounts, CA | S1-F11 | Live S4 | Yes, named synthetic rules |
| RR-139 | GC7-4; Accounts 16 | Whether and how the amount due is rounded | Accounts, CA | S1-F11, S4-F02 | Live S4 | Yes |
| RR-140 | GC7-5; Accounts 17 | How a percentage discount on a line is rounded | Accounts | S1-F11 | Live S4 | Yes |
| RR-141 | GC7-6; Accounts 18 | Does a bill's round-off count in the refund cap | Accounts, CA | S1-F11, S4-F05 | Live S4 | Yes |
| RR-142 | GC7-7; KDPS Owner 55 | May a manual discount apply to a line with an offer, and in which order | KDPS Owner, Brand manager | S4-F02 | Live S4 | Yes |
| RR-143 | GC7-8; CA 24 | For each registration: does a counter sale carry tax, which components and shares | CA | S1-F11, S4-F02 | Live S4 | Yes |
| RR-144 | GC7-9; KDPS Owner 56 | Per offer: marked-down prices, reward units, the meaning of each offer kind, how combined offers apply | Brand manager; KDPS Owner | S4-F04 | Live S4 | Yes |
| RR-145 | GC7-10; CA 20 | Is spreading a group discount by price (`DEC-109`) the correct tax treatment | CA | S1-F11, S4-F02 | Live S4 | Yes |
| RR-219 | GC7-12; CA 25 | When tax is rounded on the whole bill, how each line's tax components and taxable value are worked out so the lines add up to the bill (statutory presentation, `POL-10.05`). Until decided, a bill-level tax rounding rule is refused | CA, Accounts; the product owner for the design | S1-F11, S4-F02 | Live S4 | Yes |
| RR-220 | GC7-13; Accounts 22 | In an exchange, does the replacement bill's round-off count in what is compared with the returned units' value? Until decided, such an exchange is refused | Accounts, CA | S1-F11, S4-F05 | Live S4 | Yes |
| RR-221 | GC7-14; Accounts 23 | How a free buy-X-get-Y unit worth a fraction of a paise is rounded. Until decided, such a bill is refused | Accounts | S1-F11, S4-F04 | Live S4 | Yes |
| RR-146 | SL-5; CA 13 | How a net realisable value write-down is worked out, spread and reversed | CA | S5-F01 | Live S5 | Yes |
| RR-147 | SL-6; CA 26 | How value is divided when the cost formula or pool mode changes | CA | S1-F10, S5-F01 | Live: before any change | Yes |
| RR-148 | SL-14; CA 14 | How Store value is shown under a book pool | Accounts, CA | S5-F07, S5-F09 | Live S5 | Yes |
| RR-149 | SL-15; CA 15 | Accounting date of a late valued movement whose business date is in a locked period | Accounts, CA | S5-F01 | Live S5 | Yes |
| RR-150 | SL-17 (beyond V-35); CA 5 | Whether a cancelled billed-retained sale's goods return at a cost; what value carried billed-retained items take at the switch | CA | S4-F07, S4-F12 | Live S4 | Yes |
| RR-151 | KDPS (answerer Operations); design-language 12; `DEC-084` | Piece-label layout, label and receipt printer models, the label printers' command language | KDPS Operations; design | S2-F07 | Code: the printer adapter of S2-F07 | Yes, with a fake printer |
| RR-152 | KDPS (answerer not named); design-language 12 | One real messy delivery to test the reconciliation layout | KDPS Owner | S2-F02 | Accept S2-F02 (design input) | Yes |
| RR-153 | KDPS (answerer not named) | Logo artwork | KDPS Owner | S4 screens, bills | Live S4 (before the pilot switch) | Yes |
| RR-154 | `POL-12.04`; KDPS (answerer not named) | What partner users see in their statements and ledger | KDPS | S5-F08 | Design S5-F08 | Yes |
| RR-155 | Accounts 12, 13; PRD "Business measures" | Targets marked proposed (Tally rejection, profit timing). Goals, never settings | Accounts | Reports | None | Yes |
| RR-156 | KDPS Owner 57 | A fixed daily export from the earlier POS for the side-by-side test | KDPS Owner | S2-F12 | Live: the side-by-side test | Yes, synthetic replicas |
| RR-199 | `DEC-112` (data notes gap 18, A-4); KDPS Owner 61 | The order of seasons used to flag older stock, and the cutoff for "old". Not set; season never stands for a receipt date or an age. | KDPS Owner, Booking | S1-F13, S4-F12 | Live S4 (opening stock at the switch) | Yes, labelled synthetic order |
| RR-229 | SL-26; CA 27; stock-ledger 7.2, 13.4; `POL-01.05`, `POL-09.03` | Value entering a pool through an ownership change after its cost is established: which posting event kind it posts and what that recognises. Until set, such an item is refused (`rule-not-set`) | Accounts, CA; the event kind declared in books-and-posting 7.2 first | S2 receiving and PT | Live S2, for an agreement whose ownership event falls between receipt and sale | Yes |
| RR-230 | SL-27; CA 28; stock-ledger 7.5; `PRD-LED-018` | A FIFO reversal of an inflow made in error, once the inflow's own layer and the layers from it no longer hold the value to come off: from which other layers the rest comes off, at pool level. Until set, such a reversal is refused (`rule-not-set`) | CA, with Accounts | S1-F10 (refusal only), S2 | Live S2, moving FIFO reversals of inflows live | Yes |
| RR-234 | SL-28 (stock ledger review round 2, 6 Oct 2026); CA 29 for the settlement | Whether a found piece may be swapped with a missing piece of the same SKU that belongs to another owner or legal entity (`PRD-STK-015`, DEC-035), which changes what each owner is owed. Until decided, such a pair is treated as no match: held with an exception | Product owner; CA for the settlement effect | S3-F05 | Live S3 | Yes |
| RR-235 | `DEC-112` (data notes gap 4); Accounts 25; the decided part is RR-047 | The supplier cash-discount and interest term values per supplier (rate, days, from when). How they are calculated, applied and posted is left to the later payment design | Accounts, CA | S1-F03 (recorded on the agreement), S5-F04 | Live S1 (supplier masters); used from S5 | Yes |
| RR-237 | GC9-12; `POL-18.02`; KDPS Owner 62; `DEC-116` | Who at KDPS holds the production backup key, kept apart from the Organisation keys, and who stands in when that person is unavailable. GC9-12 names no custodian. The `dev` custodian is the product owner's (RR-236) | KDPS Owner, Admin | S1-F14 | Live S1 (production backups) | Yes |

## 4. Policy signatures

All 19 policies are Open: none is signed ([kdps-policies.md](../kdps-policies.md) status table). A policy is Signed when its "Signed by, date" line is complete (`DEC-092`). Its live operations also need their real values configured and validated by a person who did not enter them (DM-6, `DEC-105`, `DEC-116`). Synthetic work proceeds for every policy.

| RR | Policy | Decided by | Live gate | Features it switches on |
| --- | --- | --- | --- | --- |
| RR-157 | 1 Commercial ownership | Owner, Accounts | Live S2 | S2-F01, S2-F03, S2-F06, S3-F07, S3-F08 |
| RR-158 | 2 Permissions and approvals | Owner, Admin | Live S1 | S1-F01, S1-F05, S1-F08; count rules S3-F05; day close S4-F08; phone approval S5-F11 |
| RR-159 | 3 Source conflicts and pricing | Booking, Accounts | Live S2 | S2-F04, S2-F06 |
| RR-160 | 4 Merchandise tracking | Booking, Operations | Live S1 | S1-F03, S2-F02, S2-F07 |
| RR-161 | 5 Booking | Owner, Booking | Live S2 | S2-F01 |
| RR-162 | 6 Customer returns | Owner, Operations | Live S4 | S4-F05 |
| RR-163 | 7 Refunds and no-bill returns | Owner, Accounts | Live S4; Customer credit S5 | S4-F05, S4-F06, S5-F05 |
| RR-164 | 8 Billed-retained | Operations, Accounts | Live S4 | S4-F07 |
| RR-165 | 9 Financial posting | Accounts, CA | Live S1; allocation, assets, vouchers S5 | S1-F09, S1-F10, S2-F06, S5-F01, S5-F02, S5-F07 |
| RR-166 | 10 Statutory applicability | Accounts, CA | Live S2 to S6 by part | S1-F02, S1-F09, S3-F03, S4-F09, S5-F06, S6-F03 |
| RR-167 | 11 Official book | Owner, CA | Live S5 | S5-F01 |
| RR-168 | 12 Franchise/partner | Owner, Accounts | Live S5 | S5-F05, S5-F08 |
| RR-169 | 13 Workforce | Owner, HR | Live S6 | S6-F01 to S6-F03 |
| RR-170 | 14 Opening and cutover | Owner, Accounts, Operations | Live S4 (before the pilot switch) | S1-F13 publishing, S4-F12 |
| RR-171 | 15 Planning | Owner, Booking | Live S6 | S6-F04 |
| RR-172 | 16 Offline operation | Owner, Operations | Live S4 | S4-F11 |
| RR-173 | 17 Held-goods outcomes | Owner, Operations, Accounts | Live S2; write-off and disposal S3 | S2-F08, S3-F06 |
| RR-174 | 18 Recovery and retention | Owner, Admin | Live S1 | S1-F14 |
| RR-175 | 19 Offers and promotions | Owner, Brand manager | Live S4 | S4-F04, S6-F04 (markdowns) |

## 5. Baseline picks awaiting confirmation, and agreements

The build follows the `DEC-105` and `DEC-112` baseline picks now. Each confirmer may confirm or ask for a change; a change is a new decision entry and reworks the features named.

| RR | Original ID and source | Confirmation or agreement needed | Owner | Affects | Blocks at | Synthetic work proceeds |
| --- | --- | --- | --- | --- | --- | --- |
| RR-176 | GC2-1 (CA 16), MM-3 and SL-23 (Outcome A), MM-10, MM-13 | Confirm the registration-in-Site-State check, Outcome A for a missing posting map, IRN before issue, and the statutory document for a registration-only change | CA | S1-F02, S1-F09, S1-F10, S4-F09, S3-F03 | Live: the affected stages | Yes |
| RR-177 | GC3-1, GC3-4 (KDPS Owner 50), GC3-6 pick, GC3-7 (KDPS Owner 51), GC3-8 pick, GC3-12, DM-5, DM-8 limits basis, MM-8 pick, cost drift, Owner and losses (KDPS Owner 42) | Confirm the access, approval and loss-approval picks | KDPS Owner (with Admin where named) | S1-F01, S1-F03, S1-F04, S1-F05, S3-F05, S3-F06 | Live S1 to S3 | Yes |
| RR-178 | GC2-2 (KDPS Owner 60), MM-12 | Confirm second-person approval of structure, mapping and agreement changes and the separate mapping verification; confirm the voucher model with and without items | Accounts, CA; KDPS Owner and Admin for GC2-2 | S1-F02, S1-F03, S5-F02 | Live S1, S5 | Yes |
| RR-179 | GC2-5, GC2-9 (Booking, product records), GC3-9, DM-4 | Confirm: no stock-unit change while stock exists; approved vocabulary for list attributes; staff see their own record read-only; the state names | Booking, Operations; Booking; KDPS Owner and HR; design review | S1-F03, S6-F01, every screen | Live S1, S6 | Yes |
| RR-180 | D-4; KDPS Owner 37 | KDPS agrees to hold real data on the Railway test setup outside India, and says whether customer details are imported | KDPS Owner | S2-F12, every `kdps-test` use | Live: before KDPS's side-by-side test | Yes |
| RR-181 | D-5; Accounts 11 | A separate test Tally company for the connector | Accounts | S5-F02 | Accept S5-F02 | Yes, until stage 5 testing |
| RR-182 | SL-4; CA 2; `POL-09.06` | Validate the cost rules with real cases: supplier-return variance, late-cost split, reversals, FIFO layer dates, posting order, consignment pass-through | CA; product owner | S1-F10 | Live S2 | Yes |
| RR-183 | V-65; `DEC-029`, `DEC-085` | The name of the KDPS representative who agreed `DEC-017` to `DEC-022` | Product owner | Policy 2 signature | Live S1 (signature record) | Yes |
| RR-184 | KDPS Owner 40; `DEC-053` | Does the earlier POS accept the approved PT export in the KDPS layout | KDPS Owner | S2-F04 | Live: the side-by-side test | Yes |
| RR-197 | `DEC-112`: GC6-4, GC6-6, GC6-8; KDPS Owner 37, 59; D-4 | Confirm the import picks for KDPS: a separate person confirms each new or changed layout and mapping version, and who the confirmers are; on `kdps-test`, files with customer-contact columns refused before storing; opening files staged and validated there as a rehearsal that never publishes | KDPS Owner | S1-F06, S1-F13, S2-F12 | Live S1 (layout confirmation); the side-by-side test | Yes |
| RR-198 | `DEC-112`: GC4-2, GC4-4; CA 18, Accounts 21; `POL-09.01` | Confirm the posting-map workflow (an Accounts maker, a different Accounts approver in the app, the CA's evidence attached or referenced before a version takes effect, one piece of evidence possibly covering a named set of versions) and one journal series per book and financial year. This is not the Accounts and CA approval of the rules themselves | Accounts, CA | S1-F09, S1-F10 | Live S2 (first live posting) | Yes |
