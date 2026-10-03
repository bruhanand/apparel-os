# Questions for KDPS and the CA
<!-- deps: prd.md#required-policy-configuration — sample-data work never waits for policy answers -->

> **Not ranked.** These are questions, not answers. Each answer goes into [kdps-policies.md](kdps-policies.md) (logged in [decisions.md](decisions.md) first if it changes a rule). See [README.md](README.md).

**How to use this list.**

- Questions are grouped by the person who should answer. Some need two people; they appear under the first and say who else.
- Each question names the policy bullet it fills (`POL-…`) and the stage that waits for it. Building and testing with sample data never waits; only real, live use does.
- `V-` numbers point to section 5 of the [alignment report](reports/alignment-report.md).
- Please give real numbers, names and dates. "Same as now" is fine if you also tell us what "now" is.

## KDPS Owner

### Needed for stage 1 (setup)

1. **Who does what?** For each actual employee: their job/personas, the places they work (whole Sites or warehouses, or just one Store or brand counter), brands and role assignments. One person may hold several. Include Operations, HR, EBO staff, CA and Auditor users; editable templates now exist for all five. Also say who gets self-service (their own attendance, targets, incentives and payslips); it is a role of its own. · `POL-02.11` · V-01
2. **Approval limits.** Confirm role-level approval limits by action, then name any authorised person with an individual limit. Include PT approval by proposed acquisition cost, discount, refund, stock adjustment, write-off, transfer and supplier payment. A missing limit grants no authority. Actual amounts and names remain open. · `POL-02.10`, `POL-02.15`, `PRD-ACS-015` · V-02
3. **Problems ("exceptions").** For each type and Site, who owns it, when is it due, and who receives an escalation? Include short delivery, damage, cash gap, supplier matter and missing EBO report. Stock routes to Operations, money to Accounts and supplier matters to Booking. · `POL-02.11`, `POL-02.16` · V-03
4. **Logins.** Production uses authenticator-app TOTP. Initial idle locks are 5 minutes for shared POS and 15 minutes for office sessions, with a 12-hour absolute limit. Which named Admin runs the production setup and validates these settings? Also name who first approves changes to access; it must be a different person from that Admin. · `POL-02.17`, `POL-02.18`, `PRD-ACS-023` · V-04
5. **Bulk approval and stand-ins.** Which action types belong on the explicit bulk-approval allowlist? Name each stand-in, scope, limit and time period. · `POL-02.19`, `POL-02.20` · alignment report B-9
6. **Recovery after a failure.** We plan for losing at most 15 minutes of work and being back within 4 hours. Is that acceptable for your business? Also confirm that restore drills run quarterly after go-live (proposed, `POL-18.03`). · `POL-18.01`, `POL-18.03` · V-12
7. **How long to keep records.** Confirm legal retention duration for each record class and any current legal holds. (Check with the CA.) · `POL-18.05` · V-13
42. **Who approves what else.** Name the people or roles who hold the approve permissions for PT approval, damage confirmation, stock adjustments, write-offs, supplier-return steps, transfers and count differences above the Store Manager's limit, and say whether the Owner approves losses or only sees them. · `POL-02.07`, `POL-02.10`, `PRD-TRF-005` · UI blueprint open item 28 · stage 1 live approvals
45. **Approve and reject reasons.** Which reasons may an approver pick when approving or rejecting? · `POL-02.23`, `PRD-ACS-010` · stage 1
49. **Who says a Site is ready.** Before a Store, warehouse or office may receive, move or sell goods in the app, someone must approve that it is ready. Who approves this for each Site and for each business unit in it? · `PRD-LIF-001`, `PRD-LIF-002`; no policy bullet names the approver yet (policy 2) · module map MM-8 · stage 1 live use
50. **A lost login code or password.** When someone loses the phone with their authenticator app, or forgets their password, an authorised person resets it. Must a second person approve each reset? (With the Admin.) · policy 2; no policy bullet yet · access design GC3-4 · stage 1 live use
51. **Standing in.** When one person stands in for another during an absence, must a second person approve the stand-in before it starts? · `POL-02.07`, `POL-02.20` · access design GC3-7 · stage 1 live use
52. **Approvals and tasks left waiting.** When an approval or a task is not done in time, when is it overdue, and who is told or takes it over? Question 3 covers problems (exceptions) only. (With the Admin.) · `PRD-ACS-010`; no policy bullet yet · access design GC3-8 · stage 1 live approvals

### Needed for stage 2 (goods in)

8. **Each brand's deal.** For every real brand or supplier, provide the signed terms: commercial model, ownership event, return eligibility/window, costs, deductions and payment terms. (With Accounts.) · `POL-01.05`, `POL-01.09`, `POL-01.14` · V-14
9. **Bookings.** Which signed agreement sets each authorised amendment or cancellation right and time window? What delivery window applies to each booking? (With Booking.) · `POL-05.04`, `POL-05.05`, `POL-05.10` · V-16
10. **Buying budget.** Booking prepares the brand/season budget, Accounts checks it and the Owner approves it. What are the real budget amounts and period? (With Booking.) · `POL-05.02`, `POL-05.09` · V-17, B-10
11. **Write-offs and disposal.** Operations proposes each case; which named independent approvers may approve it within what cost limits? Accounts reviews value. · `POL-17.04`, `POL-17.10` · V-19
12. **Wrong or unknown goods.** Name the authorised Booking approvers by Site and brand for cases whose identity and PT route are resolved. · `POL-17.02`, `POL-17.11` · V-20

### Needed for stage 3 (stock movement)

13. **Stock counts.** What count tolerance, stated as a cost difference (`PRD-ACS-015`), applies; which approver set approves within it; and who approves above it? Counted items/locations stay frozen; who may move frozen items, if anyone? Confirm any required recount and sign-off steps. (With Operations.) · `POL-02.10`, `POL-02.21`, `POL-02.24` · V-21

### Needed for stage 4 (store day)

14. **Defective items.** What assessment and evidence process applies under the relevant consumer rights and warranties? Do not set a universal hard cutoff without an applicable legal or warranty basis. (With Operations.) · `POL-06.05` · V-23
15. **Store exceptions.** Does any Store get a different return rule? Which, and what rule? · `POL-06.01` · V-24
16. **How customers may pay.** In-scope instruments are cash, card, UPI, verified Bank transfer, Store credit, own Gift vouchers and approved Customer credit/pay-later. Confirm provider arrangements and evidence for each; that is needed for stage 4 (V-25). Actual Customer credit limits and due dates are needed by stage 5, when Customer credit goes live (V-59). (With Accounts.) · `POL-07.09` · V-25, V-59
17. **Refund approvers.** Name the independent authorised people and scopes for no-bill returns, cash substitution, tender/return overrides and refunds above limit. The actual limits are in V-02. · `POL-07.09`, `POL-02.15` · V-02, V-01
18. **Returns without a bill.** Allowed or not? If yes: up to what value, who approves, and how is the item valued? (With Accounts.) · `POL-07.06`, `POL-07.08`, `PRD-ACS-015` · V-28, V-02
19. **Store credit.** How long is it valid, and which authorised Stores within the same legal entity may redeem it? (With Accounts.) · `POL-07.11` · V-29
20. **Gift vouchers.** KDPS issues its own vouchers. Confirm validity, partial redemption, refund of unused balance and lost-voucher treatment. The CA confirms tax on issue and redemption (CA question 6). · `POL-07.10`, `POL-10.10` · V-30
21. **Loyalty.** Should KDPS enable a points scheme? If so, how are points earned, used and expired? Keep it disabled until the scheme is approved. (With Accounts.) · `POL-07.13` · V-31
22. **Customer phone numbers.** What purpose is explained when an optional phone number is collected, and what marketing consent text is used? · `POL-07.12` · V-32
23. **Goods never collected.** If a paid item kept for alteration or pickup is never collected, what happens to it, and after how long? (With Operations and Accounts; take legal advice.) · `POL-08.04` · V-34
24. **Offline billing.** Name the approved pilot Store and its one registered counter; set its reserved eligible stock. The pilot starts cash-first. Later external-terminal use needs a written evidence/reconciliation procedure. (With Operations and Accounts.) · `POL-16.01`, `POL-16.02`, `POL-16.04` · V-36, V-37
25. **Day-close cash.** What cash-variance tolerance applies, who is in the approver set within it, and who is the higher approver above it? Never write off automatically. · `POL-02.13` · V-38
26. **EBO reports.** By what time must each EBO's daily report arrive before it counts as missing, and who owns a late-report exception? (With Operations.) · `POL-02.11` · V-42
27. **Offers and promotions.** Offers do not stack unless a rule explicitly allows it. Provide each brand agreement's cost shares and name the Brand manager who proposes and authorised approver who approves those shares and markdowns. · `POL-19.01`–`POL-19.05` · V-43
28. **The pilot switch.** Which Store goes first, on which date? Who verifies and signs its opening stock, balances and carried work at the day-close switch, and what is the fallback if the switch fails? (With Accounts and Operations.) · `POL-14.02`–`POL-14.07` · V-44
29. **Switch pass marks.** Set the material-difference threshold per Store for the switch count against the earlier POS's last SOH, before the first switch. (How long the side-by-side test runs is question 38.) Pass requires training for all participating staff and, at each switch, no unexplained material difference. · `POL-14.08`, `PRD-LIF-027` · V-45
39. **Serious exception at go/no-go.** What counts as a serious exception that must be closed before the first switch? (With Operations.) · `POL-14.08` · stage 4
43. **Returns of earlier-POS bills.** For the 15 days after a Store switches, such returns and EBO returns not linked to their sale are unavailable in the app. How should the Store serve these customers meanwhile? (The product owner decides.) · `POL-06.02`, `DEC-059` · stock-ledger SL-10 · no V- number · before the first switch
44. **Offline working-set validity time.** How long may the till's cached prices, offers and tax versions be used offline before billing is blocked? (With Operations; see question 24.) · `POL-16.07`, `PRD-OFF-004` · V-66 · stage 4
46. **Exchange and refused-return rules.** What happens on a cheaper replacement, are there any replacement-SKU restrictions, and what evidence does a refused return need? (With Operations.) · `POL-06.09`–`POL-06.11` · V-67 to V-69 · stage 4
47. **Exception alerts.** Which alerts under `PRD-EXC-013` are on, and what are their thresholds and recipients? · `POL-02.25` · V-70 · stage 4

### Needed for stage 5 (money)

30. **Daily summary.** Name the recipients for the 9 PM WhatsApp summary. · `POL-02.14`, `POL-02.11` · V-51
31. **Phone approvals.** Which approval types may use an authenticated notification link tied to the exact record version? A plain “yes” is not approval. · `POL-02.22`, `PRD-ACS-012` · V-60
32. **Franchise deals.** For each franchise partner: commission, royalty, minimum guarantee, deposit, credit limit and payment terms. (With Accounts.) · `POL-12.05` · V-47
33. **EBO commission and settlement.** How is each brand's commission calculated and settled, including returns and adjustments? (With Accounts.) · `POL-12.06` · V-56
34. **Store profit.** Accounts and the CA choose causal allocation drivers for shared costs (for example, floor area or headcount where suitable). Show results before and after allocation. (With Accounts and the CA.) · `POL-09.20` · V-49
48. **Onward commission.** What Owner authority is needed before unreceived commission is paid on? (With Accounts.) · `POL-12.08` · V-71 · stage 5

### Needed for stage 6 (people and planning)

35. **Pay and incentives.** Salary make-up, leave, overtime, incentive schemes and targets, by employer, state and staff group. (With HR.) · `POL-13.06`, `POL-13.11` · V-52
36. **Forecasts.** Set replenishment horizon from actual lead time plus review cycle and the buying horizon from the seasonal plan. Provide held-out data and define evaluation against a simple baseline, including stockout/excess outcomes and pass thresholds. (With Booking.) · `POL-15.08` · V-54
53. **Staff seeing their own record.** Besides their own attendance, targets, incentives and payslips, may staff see their own employee record in the app, and which parts of it? (With HR.) · `PRD-HRM-012`; policies 2 and 13; no policy bullet yet · access design GC3-9 · stage 6

### Needed before the side-by-side test

37. **Your data on the test setup.** The side-by-side test holds your real product, stock and sales data with Railway, a hosting company whose servers are outside India. It is a test, not your official system. Do you agree? Should customer names and phone numbers from the earlier POS reports be left out of the import? Until you answer, imports keep no customer name or phone number (`PRD-SEC-009`, `PRD-SEC-010`). · `PRD-LIF-026` · alignment report 4.15 · before the side-by-side test
38. **How long the side-by-side test runs.** Set the run length before the test starts. (The switch threshold is question 29.) · `phases.md`, `POL-14.08` · V-45 · before the side-by-side test
40. **Earlier POS PT file.** Does the earlier POS accept the approved PT export from Apparel OS in the KDPS layout during the test? · `DEC-053`, `PRD-PTW-008` · before the side-by-side test

### Needed before first live use on production

41. **When a warehouse goes live.** `POL-14.07` today allows real opening stock only at a Store's switch. When does each warehouse go live and load its opening stock? How do goods move between a Site already on the app and a Store not yet switched, and how are direct deliveries to such a Store handled? (With Operations; the product owner decides the rollout order.) · `POL-14.07`, `PRD-REC-004` · stock-ledger SL-9 · alignment report 4.15 · no V- number · before the first live use on production, not a build blocker

## Accounts

1. **How is stock valued today?** Confirm the current method and pool from KDPS's CA-approved practice. Send a real stock-valuation sample from Tally or Excel. Retain it initially; any future change is separately approved. Apparel OS supports FIFO and moving weighted average (DEC-031). If KDPS uses a periodic average today (one average for a month or year), please say so. · `POL-09.09`, `POL-09.21` · V-08 · stage 1
2. **Does Tally track stock?** Do sales and purchase entries carry item quantities or only amounts? Send real sample vouchers of each kind. · `POL-09.16` · V-46 · shapes stage 1 design; needed by stage 5
3. **Ledger accounts.** Provide KDPS's current CA-approved chart of accounts and identify the ledger each transaction should post to, including the difference between a supplier's credit and the stock value a supplier return removes, late cost changes for goods already sold (and any excess shown on its own line in cost of goods sold), and the variance left when a mistaken receipt is undone. (With the CA.) · `POL-09.11`, `POL-09.23` · V-10 · stage 2
4. **Small differences.** How much rounding or invoice-matching difference is acceptable before it becomes a problem to chase? · `POL-09.14` · V-11 · stage 2
5. **GST numbers.** Which GST registration covers each business unit: each whole Store, brand counter, warehouse and office? Also provide the HSN codes, GST rates and slabs for your goods. (With the CA.) · `POL-10.06`, `POL-10.08` · V-18 · stage 2
6. **Each brand's cost formula.** For each brand: how do you get from BASIC to P RATE? Which discounts, freight and other charges, in what order, with what rounding? One real worked example per brand. (With Booking.) · `POL-03.06`, `POL-03.07` · V-15 · stage 2
7. **Petty cash.** Float and spending limit for each Store. · `POL-09.14` · V-39 · stage 4
8. **E-invoices.** Which of your legal entities must issue e-invoices? (With the CA.) · `POL-10.03` · V-41 · stage 4
9. **Tally voucher types.** Validate the starting map against real Tally samples. Contra covers only cash/bank transfers within one legal entity, never stock transfers. · `POL-09.15`, `POL-09.16`, `POL-09.25` · V-46 · stage 5
10. **Rounding stock cost.** When an average cost does not divide into whole paise, how should each sale's cost be rounded? (With the CA.) · `PRD-MOD-014` · stock-ledger SL-2 · V-64 · stage 2
11. **A test Tally company.** Can a separate Tally company be set up for testing the connector, so test vouchers never reach KDPS's real books? · no POL bullet; product-owner item deployment.md D-5 · no V- number · stage 5 testing
12. **Tally rejection target (proposed).** Is "less than 2% of vouchers rejected" an agreed goal? · PRD Business measures · DEC-050 · stage 5
13. **Brand-by-store profit timing (proposed).** Is "fifth working day of the month" an agreed goal, given allocation bases in `POL-09.20`? · PRD Business measures · DEC-050 · stage 5
14. **Financial year dates.** On which dates does KDPS's financial year start and end? Bill numbers and other yearly number series restart with it. (With the CA.) · no policy bullet yet · numbering design GC5-1 · stage 1 live use; bills in stage 4

## CA

1. **AS or Ind AS?** Which accounting standards apply to KDPS Lifestyle Pvt. Ltd.? · `POL-09.10` · V-07 · stage 2
2. **Cost formula and pool.** Confirm the existing applicable method and pool with Accounts. KDPS retains these initially; provide a future change proposal only if needed, with representative validation. Please also check the stock-ledger cost rules with real cases. First: a supplier return leaves stock at the formula cost, not its own purchase cost, so a gap to the supplier's credit can show even at the purchase price. Then: a late cost change follows its goods, and any excess it cannot put on stock goes to cost of goods sold; customer returns come back at their sale's cost; a mistaken receipt is undone at its own value; costs are worked out in posting order. · `POL-09.06`, `POL-09.19`, `POL-09.21`, `PRD-LED-016`–`PRD-LED-018` · V-09, stock-ledger SL-4 · stage 2
3. **Goods owned before they arrive.** When a deal makes KDPS the owner at supplier dispatch, how should those goods and the supplier liability be recorded before they are counted? The system will show an amount only when backed by an invoice or the deal's price. · `POL-09.02`, `POL-09.22` · V-58 · stage 2
4. **Bill number format.** Each till will have its own number series per GST registration per financial year. Please confirm the length limit and allowed characters, and approve a format. · `POL-10.07` · V-40 · stage 4
5. **Altered or held goods.** When a customer has paid but the goods stay in the Store (for alteration or pickup), when is the sale recognised? Does the goods' cost leave stock at the bill or at handover? · `POL-08.06`, `POL-09.10` · V-35, stock-ledger SL-17 · stage 4
6. **Gift vouchers and tax.** How is GST handled when a voucher is sold and when it is used? · `POL-10.10` · V-30 · stage 4
7. **Return credit notes.** How should tax-document cancellation and credit notes treat customer returns? · `POL-10.11` · V-72 · stage 4
8. **TDS.** Which payments (rent, contractors, professionals, commission) need TDS, and at which rates? · `POL-10.04` · V-48 · stage 5
9. **MSME suppliers.** Provide evidence of each supplier's MSME classification and confirm its applicable payment deadline. · `POL-10.09` · V-61 · stage 5
10. **Fixed assets.** Category-specific capitalisation thresholds, depreciation methods and actual rates. · `POL-09.26` · V-50 · stage 5
11. **Payroll law.** Which PF, ESI and other payroll rules apply to each employer and state? (With Accounts and HR.) · `POL-10.04` · V-53 · stage 6
12. **Record keeping.** Validate the legal retention period for each record class and identify records under a legal hold. · `POL-18.05` · V-13 · stage 1
13. **Writing stock down to what it can sell for.** How should a net realisable value write-down be worked out and spread, under FIFO and under moving average, and how is it reversed? · `PRD-LED-007`, `POL-09.08` · stock-ledger SL-5 · stage 5
14. **Store value when cost is pooled for the whole book.** If stock cost is pooled across the whole book, how should each Store's stock value be shown for its monthly net asset value and at closure? (With Accounts.) · `PRD-NAV-016`, `PRD-LIF-018` · stock-ledger SL-14 · stage 5
15. **Late entries for a closed month.** When a stock entry arrives late and its business date falls in a closed month, which accounting date should it take? (With Accounts.) · `PRD-LED-009`, `POL-09.12` · stock-ledger SL-15 · stage 5
16. **Who owns each registration and book.** The app treats each GST registration and each set of books as belonging to exactly one legal entity, and checks that each business unit's registration and books belong to its own legal entity. Is that right for KDPS? Also: must a unit's GST registration always be in the same State as the place it trades from? · `PRD-ORG-020`, `POL-10.06`, `POL-10.08` · GC-2 GC2-1 · stage 2
17. **Numbers on other tax documents.** Besides bills, which number format must credit notes for customer returns, and the tax documents that travel with goods moved between places, follow? (With Accounts.) · `POL-10.07`, `POL-10.11`, `PRD-TRF-023` · numbering design GC5-2 · stage 3 (movement documents); stage 4 (credit notes)

## Operations

1. **Batch and expiry.** Which product categories need batch or expiry tracking? How many days of shelf life must remain to receive, and to sell? (With Booking.) · `POL-04.08` · V-05 · stage 1
2. **Piece labels.** Apparel and footwear use piece IDs by default. Which additional categories, if any, should be explicitly piece-tracked? (With Booking.) · `POL-04.09` · V-06 · stage 2
3. **Supplier-return reminders.** Set the actual reminder schedule from each supplier agreement and its return deadline; the example intervals are not defaults. · `PRD-OFR-009` · V-22 · stage 3
4. **Transfer routes.** Provide the actual Store/warehouse route matrix, including each Store's default warehouse and any allowed alternatives. · `PRD-ORG-013` · V-62 · stage 3
5. **Altered or held goods.** How long may a Store keep paid goods waiting for collection, and when are reminders sent? · `POL-08.04` · V-33 · stage 4
6. **Piece labels at the switch.** How many pieces are in each Store today? Who labels them, and on which days before that Store's switch? Every apparel and footwear piece needs its own label by the switch count. · `PRD-LIF-025` · V-57 · stage 4, before each switch

## KDPS (answerer not yet named)

These come from the UI blueprint's open items. The blueprint names KDPS, not a person. The product owner names who answers each.

- **Partner statements.** What may a franchise partner user see in their statements and ledger? · `POL-02`, `POL-12` (policies 2 and 12; no single bullet named) · UI blueprint open item 14 · answerer: unassigned · stage 5
- **Reconciliation sample.** One real messy delivery to test the reconciliation layout. · no POL bullet; design input · UI blueprint open item 18 · answerer: unassigned · stage 2
- **Labels and printers.** The piece-label layout, the label and receipt printer models, and the command language the label printers use. Labels print through the same local helper on any PC with the printer (DEC-084). · no POL bullet; design input · UI blueprint open item 19 · answerer: KDPS Operations · stage 2
- **Logo.** Artwork for the empty logo slot. · no POL bullet; design input · UI blueprint open item 23 · answerer: unassigned · before the pilot switch

## Booking
<!-- deps: none — cross-reference to other question numbers -->

- See KDPS Owner 9, 10 and 36, Accounts 6 and Operations 1 and 2. These are shared with Booking.

## HR
<!-- deps: none — cross-reference to other question numbers -->

- See KDPS Owner 35 and CA 10.

## Admin

- See KDPS Owner 4 and 5, and Owner 6 (recovery). Name the restore operator, set the pre-launch restore-test date and confirm how often restore drills run under `POL-18.03` (V-63, stage 1).
- **Password rules and wrong tries.** How long and how varied must a password be? After how many wrong sign-in tries does sign-in slow down or stop, and for how long? (With the product owner.) · policy 2; no policy bullet yet · access design GC3-5 · stage 1 live use
