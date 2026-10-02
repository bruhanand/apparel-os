# Questions for KDPS and the CA

> **Not ranked.** These are questions, not answers. Each answer goes into [kdps-policies.md](../kdps-policies.md) (logged in [decisions.md](../decisions.md) first if it changes a rule). See [README.md](../README.md).

**How to use this list.**

- Questions are grouped by the person who should answer. Some need two people; they appear under the first and say who else.
- Each question names the policy bullet it fills (`POL-…`) and the stage that waits for it. Building and testing with sample data never waits; only real, live use does.
- `V-` numbers point to section 5 of the [alignment report](alignment-report.md).
- Please give real numbers, names and dates. "Same as now" is fine if you also tell us what "now" is.

## KDPS Owner

### Needed for stage 1 (setup)

1. **Who does what?** For each actual employee: their job/personas, Sites or warehouses, brands and role assignments. One person may hold several. Include Operations, HR, EBO staff, CA and Auditor users; editable templates now exist for all five. · `POL-02.11` · V-01
2. **Approval limits.** Confirm default limits by role and action, then name any authorised person with an individual limit. Include PT approval by proposed acquisition cost, discount, refund, stock adjustment, write-off, transfer and supplier payment. A missing limit grants no authority. Actual amounts and names remain open. · `POL-02.10`, `POL-02.15`, `PRD-ACS-015` · V-02
3. **Problems ("exceptions").** For each type and Site, who owns it, when is it due, and who receives an escalation? Include short delivery, damage, cash gap, supplier matter and missing EBO report. Stock routes to Operations, money to Accounts and supplier matters to Booking. · `POL-02.11`, `POL-02.16` · V-03
4. **Logins.** Production uses authenticator-app TOTP. Initial idle locks are 5 minutes for shared POS and 15 minutes for office sessions, with a 12-hour absolute limit. Which named Admin runs the production setup and validates these settings? · `POL-02.17`, `POL-02.18` · V-04
5. **Bulk approval and stand-ins.** Which action types belong on the explicit bulk-approval allowlist? Name each stand-in, scope, limit and time period. · `POL-02.19`, `POL-02.20` · alignment report B-9
6. **Recovery after a failure.** We plan for losing at most 15 minutes of work and being back within 4 hours. Is that acceptable for your business? · `POL-18.01` · V-12
7. **How long to keep records.** Confirm legal retention duration for each record class and any current legal holds. (Check with the CA.) · `POL-18.05` · V-13

### Needed for stage 2 (goods in)

8. **Each brand's deal.** For every real brand or supplier, provide the signed terms: commercial model, ownership event, return eligibility/window, costs, deductions and payment terms. (With Accounts.) · `POL-01.05`, `POL-01.09`, `POL-01.14` · V-14
9. **Bookings.** Which signed agreement sets each authorised amendment or cancellation right and time window? What delivery window applies to each booking? (With Booking.) · `POL-05.04`, `POL-05.05`, `POL-05.10` · V-16
10. **Buying budget.** Booking prepares the brand/season budget, Accounts checks it and the Owner approves it. What are the real budget amounts and period? (With Booking.) · `POL-05.02`, `POL-05.09` · V-17, B-10
11. **Write-offs and disposal.** Operations proposes each case; which named independent approvers may approve it within what cost limits? Accounts reviews value. · `POL-17.04`, `POL-17.10` · V-19
12. **Wrong or unknown goods.** Name the authorised Booking approvers by Site and brand for cases whose identity and PT route are resolved. · `POL-17.02`, `POL-17.11` · V-20

### Needed for stage 3 (stock movement)

13. **Stock counts.** What cost difference may a Store Manager approve, and who approves above it? Counted items/locations stay frozen; confirm any required recount and sign-off steps. (With Operations.) · `POL-02.10`, `POL-02.21` · V-21

### Needed for stage 4 (store day)

14. **Defective items.** What assessment and evidence process applies under the relevant consumer rights and warranties? Do not set a universal hard cutoff without an applicable legal or warranty basis. (With Operations.) · `POL-06.05` · V-23
15. **Store exceptions.** Does any Store get a different return rule? Which, and what rule? · `POL-06.01` · V-24
16. **How customers may pay.** In-scope instruments are cash, card, UPI, verified Bank transfer, Store credit, own Gift vouchers and approved Customer credit/pay-later. Confirm provider arrangements and evidence for each. Set actual Customer credit limits and due dates. (With Accounts.) · `POL-07.09` · V-25
17. **Refund approvers.** Name the independent authorised people and scopes for no-bill returns, cash substitution, tender/return overrides and refunds above limit. The actual limits are in V-02. · `POL-07.09`, `POL-02.15` · V-27
18. **Returns without a bill.** Allowed or not? If yes: up to what value, who approves, and how is the item valued? (With Accounts.) · `POL-07.08` · V-28
19. **Store credit.** How long is it valid, and which authorised Stores within the same legal entity may redeem it? (With Accounts.) · `POL-07.11` · V-29
20. **Gift vouchers.** KDPS issues its own vouchers. Confirm validity, partial redemption, refund of unused balance and lost-voucher treatment. The CA confirms tax on issue and redemption. · `POL-07.10` · V-30
21. **Loyalty.** Should KDPS enable a points scheme? If so, how are points earned, used and expired? Keep it disabled until the scheme is approved. (With Accounts.) · `POL-07.13` · V-31
22. **Customer phone numbers.** What purpose is explained when an optional phone number is collected, and what marketing consent text is used? · `POL-07.12` · V-32
23. **Goods never collected.** If a paid item kept for alteration or pickup is never collected, what happens to it, and after how long? (With Operations and Accounts; take legal advice.) · `POL-08.04` · V-34
24. **Offline billing.** Name the approved pilot Store and its one registered counter; set its reserved eligible stock. The pilot starts cash-first. Later external-terminal use needs a written evidence/reconciliation procedure. (With Operations and Accounts.) · `POL-16.01`, `POL-16.02`, `POL-16.04` · V-36, V-37
25. **Day-close cash.** What cash difference may a Store Manager approve, and which named Accounts approver handles a larger difference? Never write off automatically. · `POL-02.13` · V-38
26. **EBO reports.** By what time must each EBO's daily report arrive before it counts as missing, and who owns a late-report exception? (With Operations.) · `POL-02.11` · V-42
27. **Offers and promotions.** Offers do not stack unless a rule explicitly allows it. Provide each brand agreement's cost shares and name the Brand manager who proposes and authorised approver who approves those shares and markdowns. · `POL-19.01`–`POL-19.05` · V-43
28. **The pilot switch.** Which Store goes first, on which date? Who verifies and signs its opening stock, balances and carried work at the day-close switch? (With Accounts and Operations.) · `POL-14.02`–`POL-14.07` · V-44
29. **Test-run pass marks.** Set how long the side-by-side test runs. Set the material-difference threshold per Store for the switch count against the old POS's last SOH. Pass requires training for all participating staff and, at each switch, no unexplained material difference. · `phases.md`, `PRD-LIF-027` · V-45

### Needed for stage 5 (money)

30. **Daily summary.** Name the recipients for the 9 PM WhatsApp summary. · `POL-02.14`, `POL-02.11` · V-51
31. **Phone approvals.** Which approval types may use an authenticated notification link tied to the exact record version? A plain “yes” is not approval. · `PRD-ACS-012`
32. **Franchise deals.** For each franchise partner: commission, royalty, minimum guarantee, deposit, credit limit and payment terms. (With Accounts.) · `POL-12.05` · V-47
33. **EBO commission and settlement.** How is each brand's commission calculated and settled, including returns and adjustments? (With Accounts.) · `POL-12.06` · V-56
34. **Store profit.** Accounts and the CA choose causal allocation drivers for shared costs (for example, floor area or headcount where suitable). Show results before and after allocation. (With Accounts and the CA.) · `POL-09.20` · V-49

### Needed for stage 6 (people and planning)

35. **Pay and incentives.** Salary make-up, leave, overtime, incentive schemes and targets, by employer, state and staff group. (With HR.) · `POL-13.06`, `POL-13.11` · V-52
36. **Forecasts.** Set replenishment horizon from actual lead time plus review cycle and the buying horizon from the seasonal plan. Provide held-out data and define evaluation against a simple baseline, including stockout/excess outcomes and pass thresholds. (With Booking.) · `POL-15.08` · V-54

### Needed before the side-by-side test

37. **Your data on the test setup.** The side-by-side test holds your real product, stock and sales data with Railway, a hosting company whose servers are outside India. It is a test, not your official system. Do you agree? Should customer names and phone numbers from the old POS reports be left out of the import? · `PRD-LIF-026` · alignment report 4.15 · before the side-by-side test

## Accounts

1. **How is stock valued today?** Confirm the current method and pool from KDPS's CA-approved practice. Send a real stock-valuation sample from Tally or Excel. Retain it initially; any future change is separately approved. Apparel OS supports FIFO and moving weighted average (DEC-031). If KDPS uses a periodic average today (one average for a month or year), please say so. · `POL-09.09`, `POL-09.21` · V-08 · stage 1
2. **Does Tally track stock?** Do sales and purchase entries carry item quantities or only amounts? Send real sample vouchers of each kind. · `POL-09.16` · V-46 · shapes stage 1 design; needed by stage 5
3. **Ledger accounts.** Provide KDPS's current CA-approved chart of accounts and identify the ledger each transaction should post to, including the difference between a supplier's credit and the stock value a supplier return removes, late cost changes for goods already sold (and any excess shown on its own line in cost of goods sold), and the variance left when a mistaken receipt is undone. (With the CA.) · `POL-09.11`, `POL-09.23` · V-10 · stage 2
4. **Small differences.** How much rounding or invoice-matching difference is acceptable before it becomes a problem to chase? · `POL-09.14` · V-11 · stage 2
5. **GST numbers.** Which GST registration covers each Store, warehouse and office unit? (With the CA.) · `POL-10.06` · V-18 · stage 2
6. **Each brand's cost formula.** For each brand: how do you get from BASIC to P RATE? Which discounts, freight and other charges, in what order, with what rounding? One real worked example per brand. (With Booking.) · `POL-03.06`, `POL-03.07` · V-15 · stage 2
7. **Petty cash.** Float and spending limit for each Store. · `POL-09.14` · V-39 · stage 4
8. **E-invoices.** Which of your legal entities must issue e-invoices? (With the CA.) · `POL-10.03` · V-41 · stage 4
9. **Tally voucher types.** Validate the starting map against real Tally samples. Contra covers only cash/bank transfers within one legal entity, never stock transfers. · `POL-09.15`, `POL-09.16`, `POL-09.25` · V-46 · stage 5
10. **Rounding stock cost.** When an average cost does not divide into whole paise, how should each sale's cost be rounded? (With the CA.) · `PRD-MOD-014` · stock-ledger SL-2 · stage 2

## CA

1. **AS or Ind AS?** Which accounting standards apply to KDPS Lifestyle Pvt. Ltd.? · `POL-09.10` · V-07 · stage 2
2. **Cost formula and pool.** Confirm the existing applicable method and pool with Accounts. KDPS retains these initially; provide a future change proposal only if needed, with representative validation. Please also check the stock-ledger cost rules with real cases. First: a supplier return leaves stock at the formula cost, not its own purchase cost, so a gap to the supplier's credit can show even at the purchase price. Then: a late cost change follows its goods, and any excess it cannot put on stock goes to cost of goods sold; customer returns come back at their sale's cost; a mistaken receipt is undone at its own value; costs are worked out in posting order. · `POL-09.06`, `POL-09.19`, `POL-09.21`, `PRD-LED-016`–`PRD-LED-018` · V-09, stock-ledger SL-4 · stage 2
3. **Goods owned before they arrive.** When a deal makes KDPS the owner at supplier dispatch, how should those goods and the supplier liability be recorded before they are counted? The system will show an amount only when backed by an invoice or the deal's price. · `POL-09.02` · stage 2
4. **Bill number format.** Each till will have its own number series per GST registration per financial year. Please confirm the length limit and allowed characters, and approve a format. · `POL-10.07` · V-40 · stage 4
5. **Altered or held goods.** When a customer has paid but the goods stay in the Store (for alteration or pickup), when is the sale recognised? Does the goods' cost leave stock at the bill or at handover? · `POL-08.06`, `POL-09.10` · V-35, stock-ledger SL-17 · stage 4
6. **Gift vouchers and tax.** How is GST handled when a voucher is sold and when it is used? · `POL-07.10` · V-30 · stage 4
7. **TDS.** Which payments (rent, contractors, professionals, commission) need TDS, and at which rates? · `POL-10.04` · V-48 · stage 5
8. **MSME suppliers.** Provide evidence of each supplier's MSME classification and confirm its applicable payment deadline. · `POL-10.09` · stage 5
9. **Fixed assets.** Category-specific capitalisation thresholds, depreciation methods and actual rates. · `POL-09.26` · V-50 · stage 5
10. **Payroll law.** Which PF, ESI and other payroll rules apply to each employer and state? (With Accounts and HR.) · `POL-10.04` · V-53 · stage 6
11. **Record keeping.** Validate the legal retention period for each record class and identify records under a legal hold. · `POL-18.05` · V-13 · stage 1
12. **Writing stock down to what it can sell for.** How should a net realisable value write-down be worked out and spread, under FIFO and under moving average, and how is it reversed? · `PRD-LED-007`, `POL-09.08` · stock-ledger SL-5 · stage 5
13. **Store value when cost is pooled for the whole book.** If stock cost is pooled across the whole book, how should each Store's stock value be shown for its monthly net asset value and at closure? (With Accounts.) · `PRD-NAV-016`, `PRD-LIF-018` · stock-ledger SL-14 · stage 5
14. **Late entries for a closed month.** When a stock entry arrives late and its business date falls in a closed month, which accounting date should it take? (With Accounts.) · `PRD-LED-009`, `POL-09.12` · stock-ledger SL-15 · stage 5

## Operations

1. **Batch and expiry.** Which product categories need batch or expiry tracking? How many days of shelf life must remain to receive, and to sell? (With Booking.) · `POL-04.08` · V-05 · stage 1
2. **Piece labels.** Apparel and footwear use piece IDs by default. Which additional categories, if any, should be explicitly piece-tracked? (With Booking.) · `POL-04.09` · V-06 · stage 2
3. **Supplier-return reminders.** Set the actual reminder schedule from each supplier agreement and its return deadline; the example intervals are not defaults. · `PRD-OFR-009` · V-22 · stage 3
4. **Transfer routes.** Provide the actual Store/warehouse route matrix, including each Store's default warehouse and any allowed alternatives. · `PRD-ORG-013` · stage 3
5. **Altered or held goods.** How long may a Store keep paid goods waiting for collection, and when are reminders sent? · `POL-08.04` · V-33 · stage 4
6. **Piece labels at the switch.** How many pieces are in each Store today? Who labels them, and on which days before that Store's switch? Every apparel and footwear piece needs its own label by the switch count. · `PRD-LIF-025` · V-57 · stage 4, before each switch

## Booking

- See KDPS Owner 9, 10 and 36, Accounts 6 and Operations 1 and 2. These are shared with Booking.

## HR

- See KDPS Owner 35 and CA 10.

## Admin

- See KDPS Owner 4 and 5. Name the restore operator and set the pre-launch restore-test date under `POL-18.03`.
