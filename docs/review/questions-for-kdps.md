# Questions for KDPS and the CA

> **Not ranked.** These are questions, not answers. Each answer goes into [kdps-policies.md](../kdps-policies.md) (logged in [decisions.md](../decisions.md) first if it changes a rule). See [README.md](../README.md).

**How to use this list.**

- Questions are grouped by the person who should answer. Some need two people; they appear under the first and say who else.
- Each question names the policy bullet it fills (`POL-…`) and the stage that waits for it. Building and testing with sample data never waits; only real, live use does.
- `V-` numbers point to section 5 of the [alignment report](alignment-report.md).
- Please give real numbers, names and dates. "Same as now" is fine if you also tell us what "now" is.

## KDPS Owner

### Needed for stage 1 (setup)

1. **Who does what?** For each person: their job, which Stores or warehouses, which brands. We will turn this into role assignments. One person may hold several. · `POL-02.11` · V-01
2. **Who fills the five jobs with no template yet?** Operations (transfers, counts, problems), HR, EBO staff, your CA's login, and any auditor. · `POL-02.01` · V-01
3. **Approval limits.** For each kind of approval (PT approval by proposed acquisition cost, discount, refund, stock adjustment, write-off, transfer, supplier payment …), who may approve and up to how much? Stock limits are measured at cost; customer money at bill value. Is anyone allowed "no upper limit"? · `POL-02.10`, `PRD-ACS-015` · V-02
4. **Problems ("exceptions").** For each kind (short delivery, damage, cash gap, missing report …), who owns it, how many days to fix it, and who hears if it is late? · `POL-02.11` · V-03
5. **Logins.** How long may someone stay logged in while idle, and in total? One-time code by SMS, or an authenticator app? (Ask Admin too.) · `POL-02.11` · V-04
6. **Bulk approval and stand-ins.** Which approvals may be done many at once? Who covers for an approver on leave? (Ask Admin too.) · alignment report B-9
7. **Recovery after a failure.** We plan for losing at most 15 minutes of work and being back within 4 hours. Is that acceptable for your business? · `POL-18.01` · V-12
8. **How long to keep records.** Bills, stock, staff, customer and audit records: how many years each? Any records under a legal hold now? (Check with the CA.) · `POL-18.05` · V-13

### Needed for stage 2 (goods in)

9. **Each brand's deal.** For every real brand or supplier: outright, sale-or-return or consignment? When do the goods become yours (supplier dispatch, receipt, acceptance)? Can unsold goods go back, within how many days, counted from when? Payment terms? (With Accounts.) · `POL-01.05`, `POL-01.09`, `POL-01.14` · V-14
10. **Bookings.** Who may change or cancel a booking, and until when? How long is a normal delivery window? (With Booking.) · `POL-05.04`, `POL-05.05` · V-16
11. **Buying budget.** Who sets the open-to-buy budget per brand and season, and who approves it? (With Booking.) · `POL-05.02` · V-17, B-10
12. **Write-offs and disposal.** Who may approve writing off or destroying stock, and up to what value? (With Operations and Accounts.) · `POL-17.04` · V-19
13. **Wrong or unknown goods.** Booking approves keeping them. Which named people? · `POL-17.02` · V-20

### Needed for stage 3 (stock movement)

14. **Stock counts.** How big a difference may a Store manager approve, and who approves above that? While a count is open, may goods still move? (With Operations.) · `POL-02.11` · V-21

### Needed for stage 4 (store day)

15. **Defective items.** Up to how many days after purchase may a customer bring back a faulty item? (With Operations.) · `POL-06.05` · V-23
16. **Store exceptions.** Does any Store get a different return rule? Which, and what rule? · `POL-06.01` · V-24
17. **How customers may pay.** Which of cash, card, UPI, store credit and gift voucher are switched on? (With Accounts.) · `POL-07.09` · V-25
18. **Refund approval cases.** Which refund cases require approval by an independent authorised person? (With Accounts.) · `POL-07.09` · V-27
19. **Returns without a bill.** Allowed or not? If yes: up to what value, who approves, and how is the item valued? (With Accounts.) · `POL-07.08` · V-28
20. **Store credit.** How long is it valid? Usable at every Store? (With Accounts.) · `POL-07.09` · V-29
21. **Gift vouchers.** KDPS sells its own vouchers. How long valid? Can a customer use part and keep the rest? Can an unused balance be refunded? What if one is lost? (With Accounts; the CA for tax.) · `POL-07.10` · V-30
22. **Loyalty.** Do you want a points scheme? If so, how are points earned, used and expired? (With Accounts.) · `POL-07.09` · V-31
23. **Customer phone numbers.** What do you tell customers when you take their number, and what may you use it for? · `POL-07.09` · V-32
24. **Goods never collected.** If a paid item kept for alteration or pickup is never collected, what happens to it, and after how long? (With Operations and Accounts; take legal advice.) · `POL-08.04` · V-34
25. **Offline billing.** Which Stores may bill when the internet is down, on which counter? How much stock is set aside for it? How do you prove a card or UPI payment taken offline? (With Operations and Accounts.) · `POL-16.01`, `POL-16.02`, `POL-16.04` · V-36, V-37
26. **Day-close cash.** How big a cash shortage or excess may a Store manager approve, and who approves above that? (With Accounts.) · `POL-02.13` · V-38
27. **EBO reports.** By what time must each EBO's daily report arrive before it counts as missing, and who owns a late-report exception? (With Operations.) · `POL-02.11` · V-42
28. **Offers and promotions.** Which offers may combine, how are their costs split between the Organisation and each brand, and who approves markdowns? (With the Brand manager.) · `POL-19.01`–`POL-19.03` · V-43
29. **The pilot switch.** Which Store goes first, on which date? Who verifies and signs its opening stock, balances and carried work at the day-close switch? (With Accounts and Operations.) · `POL-14.02`–`POL-14.07` · V-44
30. **Test-run pass marks.** How many days in a row must stock and sales agree with the old POS? How big a stock difference is acceptable per Store? How many staff must be trained? · `phases.md` · V-45

### Needed for stage 5 (money)

31. **Daily summary.** Who receives the 9 PM summary, and by WhatsApp, SMS or both? · `POL-02.14`, `POL-02.11` · V-51
32. **Phone approvals.** Which approvals may be given from a phone or WhatsApp? · alignment report B-8
33. **Franchise deals.** For each franchise partner: commission, royalty, minimum guarantee, deposit, credit limit and payment terms. (With Accounts.) · `POL-12.05` · V-47
34. **EBO commission and settlement.** How is each brand's commission calculated and settled, including returns and adjustments? (With Accounts.) · `POL-12.06` · V-56
35. **Store profit.** What bases allocate merchandise cost, commissions, brand support and shared expenses to Store P&L and brand-by-Store profit? (With Accounts and the CA.) · `POL-09.20` · V-49

### Needed for stage 6 (people and planning)

36. **Pay and incentives.** Salary make-up, leave, overtime, incentive schemes and targets, by employer, state and staff group. (With HR.) · `POL-13.06`, `POL-13.11` · V-52
37. **Forecasts.** How far ahead should forecasts look, for buying and for replenishment? How will you judge them? (With Booking.) · `POL-15.07` · V-54

## Accounts

1. **How is stock valued today?** Which cost method do you use now (FIFO, average, something else)? Send a sample stock valuation from Tally or Excel. · `POL-09.09` · V-08 · stage 1
2. **Does Tally track stock?** Do your Tally sales and purchase entries carry items and quantities, or only amounts? Please send a sample voucher of each kind. · `POL-09.16` · V-46 · shapes stage 1 design; needed by stage 5
3. **Ledger accounts.** Your chart of accounts, and which ledger each kind of transaction should post to. (With the CA.) · `POL-09.11` · V-10 · stage 2
4. **Small differences.** How much rounding or invoice-matching difference is acceptable before it becomes a problem to chase? · `POL-09.14` · V-11 · stage 2
5. **GST numbers.** Which GST registration covers each Store, warehouse and office unit? (With the CA.) · `POL-10.06` · V-18 · stage 2
6. **Each brand's cost formula.** For each brand: how do you get from BASIC to P RATE? Which discounts, freight and other charges, in what order, with what rounding? One real worked example per brand. (With Booking.) · `POL-03.06`, `POL-03.07` · V-15 · stage 2
7. **Petty cash.** Float and spending limit for each Store. · `POL-09.14` · V-39 · stage 4
8. **E-invoices.** Which of your legal entities must issue e-invoices? (With the CA.) · `POL-10.03` · V-41 · stage 4
9. **Tally voucher types.** Check our starting map (sales → Sales, purchases → Purchase, returns → Credit/Debit Note, receipts and payments, transfers → Contra, others → Journal) against your Tally. · `POL-09.15` · V-46 · stage 5

## CA

1. **AS or Ind AS?** Which accounting standards apply to KDPS Lifestyle Pvt. Ltd.? · `POL-09.10` · V-07 · stage 2
2. **Cost formula and pool.** Moving weighted average or FIFO? Averaged per item across the whole company book, or per item at each Store or warehouse? · `POL-09.06`, `POL-09.19` · V-09 · stage 2
3. **Goods owned before they arrive.** When a deal makes KDPS the owner at supplier dispatch, how should those goods and the supplier liability be recorded before they are counted? The system will show an amount only when backed by an invoice or the deal's price. · `POL-09.02` · stage 2
4. **Bill number format.** Each till will have its own number series per GST registration per financial year. Please confirm the length limit and allowed characters, and approve a format. · `POL-10.07` · V-40 · stage 4
5. **Altered or held goods.** When a customer has paid but the goods stay in the Store (for alteration or pickup), when is the sale recognised? · `POL-08.06`, `POL-09.10` · V-35 · stage 4
6. **Gift vouchers and tax.** How is GST handled when a voucher is sold and when it is used? · `POL-07.10` · V-30 · stage 4
7. **TDS.** Which payments (rent, contractors, professionals, commission) need TDS, and at which rates? · `POL-10.04` · V-48 · stage 5
8. **MSME suppliers.** Which suppliers are registered MSMEs, and which payment deadlines apply? · alignment report B-12 · stage 5
9. **Fixed assets.** Depreciation method and rates; the minimum value to capitalise a fit-out or fixture. · alignment report B-13 · V-50 · stage 5
10. **Payroll law.** Which PF, ESI and other payroll rules apply to each employer and state? (With Accounts and HR.) · `POL-10.04` · V-53 · stage 6
11. **Record keeping.** How long must each kind of record legally be kept? · `POL-18.05` · V-13 · stage 1

## Operations

1. **Batch and expiry.** Which product categories need batch or expiry tracking? How many days of shelf life must remain to receive, and to sell? (With Booking.) · `POL-04.08` · V-05 · stage 1
2. **Piece labels.** Which categories get their own piece-ID label on every item? (With Booking.) · `POL-04.09` · V-06 · stage 2
3. **Supplier-return reminders.** How many days before a return deadline should reminders go out? · alignment report B-11 · V-22 · stage 3
4. **Transfer routes.** Each Store's default warehouse, and which other routes are allowed. · alignment report B-14 · stage 3
5. **Altered or held goods.** How long may a Store keep paid goods waiting for collection, and when are reminders sent? · `POL-08.04` · V-33 · stage 4

## Booking

- See KDPS Owner 10, 11 and 36, Accounts 6 and Operations 1 and 2. These are shared with Booking.

## HR

- See KDPS Owner 35 and CA 10.

## Admin

- See KDPS Owner 5 and 6, and the restore drill plan in `POL-18.03` (who runs it, and when before go-live).
