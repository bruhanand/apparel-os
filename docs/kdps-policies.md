# KDPS — Policy answers

> **Rank 2 of 4.** Answers must stay within the options the PRD allows. If this document and the PRD disagree, the PRD wins. See [README.md](README.md).

> **IDs.** Every answer bullet starts with an ID, such as `POL-09.04`.
>
> | Part | Meaning |
> | --- | --- |
> | `POL` | This document |
> | `09` | Policy number (1 to 18) |
> | `.04` | Bullet number inside that policy's answer |
>
> - `POL-09` alone means the whole policy.
> - Question bullets have no ID.
> - An ID never changes and is never reused.

Apparel OS switches on no policy-dependent live operation by default. All 18 answers are recorded, but their status remains Open until KDPS signs them; an answer does not mean its live values are configured. Product design, development and synthetic-data tests may proceed using documented shapes. A real operation stays unavailable until its required policy is signed and the relevant Organisation, entity, Store, user, approval and accounting values are configured and validated. The policies and their required definitions come from "Required policy configuration" in [prd.md](prd.md). The stages are described in [phases.md](phases.md).

| # | Policy | Decided by | Needed by stage | Status |
| --- | --- | --- | --- | --- |
| 1 | Commercial ownership | Owner, Accounts | 2 | Open |
| 2 | Permissions and approvals | Owner, Admin | 1 | Open |
| 3 | Source conflicts and pricing | Booking, Accounts | 2 | Open |
| 4 | Merchandise tracking | Booking, Operations | 1 | Open |
| 5 | Booking | Owner, Booking | 2 | Open |
| 6 | Customer returns | Owner, Operations | 4 | Open |
| 7 | Refunds and no-bill returns | Owner, Accounts | 4 | Open |
| 8 | Billed-retained | Operations, Accounts | 4 | Open |
| 9 | Financial posting | Accounts, CA | 1; vouchers and acknowledgments by 5 | Open |
| 10 | Statutory applicability | Accounts, CA | 2; e-invoice by 4, TDS by 5, payroll by 6 | Open |
| 11 | Official book | Owner, CA | 5 | Open |
| 12 | Franchise/partner | Owner, Accounts | 5 | Open |
| 13 | Workforce | Owner, HR | 6 | Open |
| 14 | Opening and cutover | Owner, Accounts, Operations | 1; signed before the pilot switch | Open |
| 15 | Planning | Owner, Booking | 6 | Open |
| 16 | Offline operation | Owner, Operations | 4 | Open |
| 17 | Held-goods outcomes | Owner, Operations, Accounts | 2; write-off and disposal by 3 | Open |
| 18 | Recovery and retention | Owner, Admin | 1 | Open |

## 1. Commercial ownership

- For each brand or supplier, are goods bought outright, on sale-or-return, or on another model?
- Under each agreement, who owns the stock while it sits in a store or warehouse?
- What return rights apply: how many days, counted from which event, by which process?
- When is the purchase recognised in the books, and how is each model settled?

**Answer:**

- `POL-01.01` Supported commercial models: outright purchase, purchase with return rights (sale-or-return), and consignment.
- `POL-01.02` For each brand, a configured default commercial model is preselected on every new booking. The model can be changed for an individual booking.
- `POL-01.03` Commercial models and related commercial terms are configurable at both the brand and booking levels and may be revised later.
- `POL-01.04` Commercial terms may be edited directly while the booking is a draft. Once goods or accounting entries exist, subsequent changes use a recorded amendment that preserves prior transaction history.
- `POL-01.05` The ownership-transfer event is configurable per brand agreement and inherited by its bookings. Options include supplier dispatch, receipt and acceptance by KDPS, sale to the customer (typically for consignment), or another explicitly agreed event.
- `POL-01.06` Receipt and acceptance may be proposed for a new purchase agreement, but must be confirmed against the actual supplier terms. The configured event does not automatically assign ownership or override the governing agreement.
- `POL-01.07` Sale-or-return rights are separate from ownership transfer. PT approval confirms merchandise data and approved cost; it does not automatically change legal ownership.
- `POL-01.08` Supplier return rights are configured per brand agreement, inherited by each booking, and may be overridden per booking.
- `POL-01.09` Each agreement specifies whether unsold goods may be returned, the return window in days or as a fixed season-end date, and whether the window starts at dispatch, receipt, or acceptance.
- `POL-01.10` Each agreement also specifies eligible condition tags, packaging and quantity limits, supplier-approval requirements, freight responsibility and deductions, and whether accepted returns settle by credit note, replacement, or refund.
- `POL-01.11` The agreement determines the applicable return terms; there is no universal return-window default. Defective or incorrectly supplied goods follow a separate claims process, including under outright purchase.
- `POL-01.12` For outright and purchase-with-return-rights agreements, supplier payment follows the booking’s agreed due dates, advances, and instalments; unsold stock does not automatically defer payment.
- `POL-01.13` For consignment, settlement follows the agreed sale or consumption event and reporting cycle, reconciling customer returns and adjustments.
- `POL-01.14` Payment terms are configurable per brand and may be overridden per booking. Track disputed amounts separately from undisputed amounts due.
- `POL-01.15` Accounting recognition remains unresolved here and belongs to the Financial posting policy.

**Signed by, date:**

## 2. Permissions and approvals

- Which person holds which role, at which Sites and for which brands?
- Who may see cost, margin, salary, bank details and customer phone numbers?
- Which actions need a second person to approve?
- What are the amount and quantity limits for each approver?
- Which changes after approval need a fresh approval?
- Who owns each kind of exception, what are its due and escalation rules, and who receives the required alerts?
- What stock-count tolerance, variance approver, and movement rule apply while a count is open?
- Which session-expiry, notice-recipient and operational-alert settings apply?

**Answer:**

- `POL-02.01` Start with editable KDPS role templates for Owner, Store POS, Warehouse, Brand Manager, Accounts and Admin. Businesses can configure their own roles; a template label alone grants no permission and does not replace the PRD personas.
- `POL-02.02` Assign each user one or more roles, each with explicit business, Site and brand scope.
- `POL-02.03` Expand broad labels such as All, Full and Manage into explicit view, create, edit, approve, cancel, export and override permissions.
- `POL-02.04` Control sensitive fields separately from module access.
- `POL-02.05` Keep approval authority separate from ordinary access, with configurable limits and independence requirements.
- `POL-02.06` Preserve who changed permissions and when.
- `POL-02.07` Require approval by an authorised person other than the preparer for every independently approved action in the PRD, including PT approval and changes to approved cost/pricing; transfers; damage confirmation; offer approval; mapping-rule confirmation; supplier-return steps; stock adjustments, write-offs and discrepancy settlements; configured exceptional discounts and refunds; no-bill returns; supplier payments and supplier bank-detail changes; and role, permission and approval-rule changes.
- `POL-02.08` A person cannot self-approve through another role. Routine billing and receiving within approved rules can proceed without additional approval.
- `POL-02.09` Configure approval limits per action and approver role within the assigned business, Site and brand scope, using amount, quantity or discount percentage as relevant. Route requests above the limit to the next authorised eligible approver; if none exists, leave the request pending without auto-approval. A missing limit does not grant unlimited authority; unlimited authority must be explicitly configured.
- `POL-02.10` Set numeric limit values when KDPS assigns approvers; the values remain undecided.
- `POL-02.11` The actual person-to-persona, role and scope map, exception owners/timings/recipients, count controls, session durations, and daily summary audiences/channels remain unconfigured. Do not enable the affected live actions until these values are approved.
- `POL-02.12` Material changes after approval require renewed approval. These include changes to amount, quantity, price, supplier or customer, destination, commercial terms, or payment details when relevant to the action.
- `POL-02.13` The day-close cash-variance tolerance and its approvers remain unconfigured.
- `POL-02.14` Send KDPS's daily summary at 9 PM.

**Template map (proposed, Open).** Which PRD personas each KDPS template serves. A person gets only the parts their role assignment grants.

| KDPS template | PRD personas |
| --- | --- |
| Owner | P-OWN Owner |
| Store POS | P-STM Store manager, P-CSH Cashier, P-SLS Salesperson |
| Warehouse | P-WHS Warehouse |
| Brand Manager | P-BRM Brand manager, P-BKG Booking |
| Accounts | P-ACC Accounts |
| Admin | P-ADM Admin |
| No template yet | P-OPS Operations, P-HRS HR, P-EBO EBO staff, P-CHA Chartered Accountant (CA), P-AUD Auditor. KDPS to decide who holds these |

**Signed by, date:**

## 3. Source conflicts and pricing

- When the invoice, the supplier file and the paper price tag disagree on cost, MRP, attributes or tax, which one is trusted?
- How is P RATE worked out from BASIC for each brand: which additions, which tax base, which rounding?
- What happens to a line while a conflict is open?

**Answer:**

- `POL-03.01` Resolve conflicts by field; there is no universal rule that the invoice or supplier file wins every conflict. Record physically counted quantity separately from invoiced and booked quantity. Compare invoice cost with agreed booking terms and the approved costing profile; compare MRP and attributes on the price tag/item with supplier data and flag inconsistencies. Accounts validates tax against applicable rules.
- `POL-03.02` Preserve original values and record the approved resolution, evidence and approver. Imports must not silently overwrite approved data.
- `POL-03.03` A conflict does not prevent recording physical custody, but it holds the affected line from final PT approval and saleability. Clean, independently resolved lines may proceed.
- `POL-03.04` Automatically create an exception for detected conflicts; users may also raise one manually. Link it to the affected document/item and retain conflicting values, evidence and resolution history.
- `POL-03.05` Assign each exception to the responsible user or team in Booking, Accounts or Warehouse based on the issue. Support comments, attachments, reassignment and escalation; resolve through the required approval. Closing an exception alone does not change saleability or accounting.
- `POL-03.06` Maintain an approved costing profile per brand. A booking-level override requires approval. The profile defines discounts and additions and their calculation order, allocation of freight and other charges, tax treatment (keeping recoverable tax separate from inventory cost), rounding, and permitted matching tolerances.
- `POL-03.07` Keep BASIC, calculated P RATE and supplier-provided cost separately visible. Each brand formula must be supported by its agreement or a verified worked example; no formula or rate is assumed.
- `POL-03.08` Missing inputs or an unexplained mismatch raise an exception and block final costing approval.

**Signed by, date:**

## 4. Merchandise tracking

- Which product types need batch or expiry tracking?
- Which units and pack sizes are used, and how do they convert?
- Which identifiers must every piece carry?
- How close to expiry can goods still be sold?

**Answer:**

- `POL-04.01` Configure merchandise tracking profiles by category.
- `POL-04.02` Apparel and footwear identity includes the style/article, colour and size variant.
- `POL-04.03` Set a stock unit per product (piece, pair or pack) and explicit conversions for each purchasing and selling pack. Itemise mixed size/colour packs by their contents.
- `POL-04.04` Retain unit and pack-conversion history so later changes do not rewrite past quantities.
- `POL-04.05` Require batch/expiry identity throughout movements only for profiles that require it. Configure minimum remaining shelf life separately for receiving and selling; hold goods that fail the applicable eligibility rule.
- `POL-04.06` Give each physical piece of a piece-tracked profile a unique internal ID with a printable barcode, and retain supplier product barcodes for lookup.
- `POL-04.07` Support quantity-based tracking for broader products where appropriate.
- `POL-04.08` Specific batch/expiry categories and minimum remaining shelf-life day limits remain to be confirmed.
- `POL-04.09` Which categories are piece-tracked remains to be confirmed.

**Signed by, date:**

## 5. Booking

- When does a booking become a firm commitment?
- Who may change or cancel a booking, and until when?
- What is the delivery window, and what happens to quantity still outstanding after it?

**Answer:**

- `POL-05.01` Booking lifecycle: Draft is an editable buying plan; Approved is internal authorisation; Issued means it has been sent to the supplier; Confirmed records supplier acceptance against the agreed version.
- `POL-05.02` Approval includes buying/open-to-buy budget checks, and the budget is reserved to prevent duplicate spending. Actual commercial commitment follows the governing agreement, not the status label alone.
- `POL-05.03` Material changes after approval require renewed approval.
- `POL-05.04` After issue, amendments and cancellation follow the supplier agreement; record the communication with the supplier and its response. Cancellation cannot erase quantities already received.
- `POL-05.05` Set a delivery window per booking and line-level delivery dates for staggered deliveries. Partial receipts reduce outstanding quantity; shortages remain visible.
- `POL-05.06` When the delivery window expires, mark the remaining balance overdue and raise a follow-up exception. Expiry alone does not cancel the balance.
- `POL-05.07` An authorised user may extend the window or cancel undelivered balance under the supplier terms and required approval.
- `POL-05.08` Late or excess goods may be recorded into physical custody, but require approval before acceptance into the booking.

**Signed by, date:**

## 6. Customer returns

- How many days does a customer have for an ordinary return, and for a defective item?
- From which date are the days counted?
- What can the customer get in each case: refund, exchange, store credit, or refusal?
- Does any Store follow a different rule?

**Answer:**

- `POL-06.01` Each Store inherits its Organisation’s customer-return policy, including return windows, eligibility and permitted remedies. A Store-specific override is permitted only when explicitly authorised by the Organisation.
- `POL-06.02` KDPS’s ordinary apparel and footwear return window is 15 days from customer handover. The Organisation may edit its policy. A Store-specific override is permitted only when explicitly authorised by the Organisation and must be effective-dated. Eligibility requires the item to be unused, with its original tags and a sale that can be traced.
- `POL-06.03` Count the ordinary return window from customer handover. For billed-retained goods, start it on collection.
- `POL-06.04` Preserve the policy that applied at the time of sale; a later policy change cannot retrospectively reduce that sale’s return eligibility.
- `POL-06.05` Handle defective items through a separate assessment and remedy process. Do not reject one solely because the ordinary return window has elapsed; applicable consumer rights and warranties still apply. The defective-item cutoff remains to be decided.
- `POL-06.06` For eligible ordinary returns, offer refund, exchange or store credit, with the customer choosing among remedies permitted by policy. Record an exchange's return and replacement separately and collect or refund any price difference; refund routing is governed by the Refunds and no-bill returns policy.
- `POL-06.07` For defective goods, support assessment followed by replacement, repair where appropriate, or refund under applicable consumer rights and warranties. Do not force store credit where a refund is owed.

**Signed by, date:**

## 7. Refunds and no-bill returns

- Does a refund go back to the original payment method?
- When may cash be given in place of the original method?
- Are returns without a bill allowed? If so, who may approve one, at what value, and with what evidence?
- Which tenders may be enabled online, and how are store credit, gift vouchers and loyalty issued, valued, expired and redeemed?
- Which refund cases require independent approval, and what policy-defined exception or value basis applies?
- What customer notice, consent and permitted contact use apply when contact details are collected?

**Answer:**

- `POL-07.01` Route each refund only to its original tender(s), capped at each tender’s remaining refundable amount; a cash purchase may be refunded in cash. For split payments, retain the original tender allocations and split each refund across them in proportion, as the PRD requires. A card/UPI refund cannot be substituted with cash.
- `POL-07.02` Keep refund entitlement separate from permitted tender routing. Prevent duplicate refunds; while the original refund outcome is unknown, do not issue a second refund. Keep approved, pending, failed and confirmed outcomes distinct; a failed payment remains an outstanding customer obligation.
- `POL-07.03` Issue store credit only with the customer’s agreement.
- `POL-07.04` For a no-bill request, first search the original sale using receipt details, customer details or payment reference. If found, handle it as an ordinary bill-backed return.
- `POL-07.05` If no original sale is found, raise an exception request with item details, evidence and reason. An independent authorised approver must approve it within the configured value limit.
- `POL-07.06` An approved ordinary no-bill exception may be handled by exchange or store credit; it does not receive an automatic cash refund. Use documented, evidenced valuation rather than assuming MRP.
- `POL-07.07` Assess defective-goods claims separately under applicable rights and warranties.
- `POL-07.08` Each Organisation may enable or disable ordinary no-bill exceptions. Keep them unavailable until eligibility, valuation and approval limits are configured.
- `POL-07.09` The online tender set, store-credit/voucher/loyalty values, customer notice/consent rules and which refund cases require independent approval remain to be confirmed. These features remain unavailable until configured.
- `POL-07.10` Gift-voucher validity, partial redemption, refund of an unused balance and treatment of a lost voucher remain to be confirmed.

**Signed by, date:**

## 8. Billed-retained

- When goods are paid for but stay in the store, for alteration or later pickup, who is responsible for them?
- How long are they kept, and what happens if they are never collected?
- What happens on cancellation?
- When is the sale recognised in the books?

**Answer:**

- `POL-08.01` The Store is responsible for safekeeping until handover to the customer is recorded.
- `POL-08.02` Link each retained piece to its bill, customer, storage location, reason for retention and promised collection date. Keep retained pieces unavailable for sale or allocation.
- `POL-08.03` Track alteration separately from ready-for-collection status. Record collection and partial pickups piece by piece.
- `POL-08.04` Configure collection periods and reminders per Organisation. An overdue item raises a follow-up exception; it is not automatically resold, written off or forfeited. An abandonment outcome remains unconfigured and must be decided under applicable law before any such disposition is enabled.
- `POL-08.05` Handle cancellation under the agreed return or alteration terms and required approvals. Inspect goods before releasing them to sellable stock.
- `POL-08.06` Keep payment, physical handover and revenue recognition distinct. Revenue-recognition timing remains unresolved here and belongs to Financial posting.

**Signed by, date:**

## 9. Financial posting

- When is a purchase, a sale and a return recognised in the books?
- Which cost formula is used for stock, and how are later cost adjustments treated?
- Which accounts does each kind of transaction post to, in which book?
- What difference is tolerated before a reconciliation is raised as an exception?
- What petty-cash float and transaction limits apply to each Store or business unit?
- Which Tally voucher type does each transaction become, and what counts as a successful acknowledgment?

**Answer:**

- `POL-09.01` Use accrual-based recognition and posting rules configured per Organisation and accounting book. Accounts and the CA must approve the applicable framework and rules before activation.
- `POL-09.02` Recognise purchase inventory and the supplier obligation when required by the contract and applicable accounting framework. Receipt/acceptance is a common recognition event, but not a universal rule. Physical custody is recorded from the actual count regardless of invoice or PT status. If an obligation exists while the invoice is missing or PT is pending, a provisional valuation requires traceable source evidence, the governing agreement and approved costing inputs under CA-approved posting rules. Reconcile it when final evidence arrives. If the inputs do not support a value, preserve the obligation as an exception and keep its amount unknown; do not fabricate a payable, inventory value or journal.
- `POL-09.03` Genuine supplier-owned consignment remains outside owned inventory until its relevant recognition event. Sale-or-return ownership follows the agreement; the label alone does not determine it.
- `POL-09.04` Recognise ordinary-sale revenue and COGS at the applicable transfer event, normally customer handover. Payment or invoicing alone does not determine recognition. Billed-retained goods require a separate assessment of readiness and remaining obligations, including alteration.
- `POL-09.05` Keep physical receipt of returned goods, credit/refund entitlement and repayment as distinct events. PT approval is a valuation control, not a universal accounting-recognition trigger.
- `POL-09.06` Conditional preferred inventory-costing baseline: support FIFO and weighted-average methods; moving weighted average is preferred for KDPS interchangeable stock, subject to CA confirmation of the existing/applicable policy and validation with representative purchase, sale, return and late-cost cases before activation. This is a preference for evaluation, not an activated method.
- `POL-09.07` Retain receipt- and piece-level source cost history regardless of the financial cost formula. A unique barcode alone does not justify specific-identification costing for interchangeable goods. Apply a consistent formula to inventories of similar nature and use, not a separate formula casually per booking.
- `POL-09.08` Trace later approved cost changes to their effects on remaining inventory and COGS for goods already sold. Support lower-of-cost-and-net-realisable-value write-downs under applicable rules.
- `POL-09.09` KDPS’s existing cost method is unknown. If it changes, reconcile the transition and opening stock; no operational method change or validation is claimed here.
- `POL-09.10` The applicable framework (AS or Ind AS), exact event mappings and billed-retained recognition rules still require CA approval; no framework is assumed.
- `POL-09.11` Define posting maps per Organisation and accounting book for purchases, sales, returns, payments, stock adjustments and other events. Use Store and brand dimensions rather than a separate ledger per Store. Accounts and the CA must supply the actual ledger accounts.
- `POL-09.12` A missing or invalid map blocks the affected financial posting and raises an exception while preserving the underlying operational event. Version maps and retain the applied rule with each transaction. Posted entries are immutable; corrections use linked reversals or adjustments subject to financial-period locks.
- `POL-09.13` Apply zero tolerance to unbalanced journals, duplicate postings and unexplained missing transactions. Permit configurable, Accounts-approved tolerances only for genuine rounding and invoice matching; show differences even within tolerance. Above tolerance, raise an exception and hold the affected financial action. A tolerance never authorises a write-off; that requires a separate approved rule.
- `POL-09.14` Actual rupee or percentage tolerance values and petty-cash floats/limits remain unset until checked and approved.
- `POL-09.15` Use configurable, Accounts-approved starting Tally mappings: sales to Sales; purchases to Purchase; sales returns to Credit Note; purchase returns to Debit Note; receipts and payments to Receipt and Payment; own-entity cash/bank transfers to Contra; and appropriate accrual, depreciation and adjustment events to Journal.
- `POL-09.16` Validate inventory vouchers and combined cash-sale mapping against KDPS’s actual Tally configuration to avoid duplicate stock or money effects.
- `POL-09.17` Exporting or sending a voucher is not success. Parse Tally’s response and associate each accepted voucher with its ERP transaction. Support partial batch success; rejected or uncertain vouchers remain pending and can be safely retried without duplicates.
- `POL-09.18` Reconcile voucher values, tax and totals before marking a batch reconciled.
- `POL-09.19` The cost pool (each SKU across the accounting book, or each SKU at each Site) remains to be confirmed by the CA.

**Signed by, date:**

## 10. Statutory applicability

- Which tax registration covers each business unit?
- Which HSN code and GST rate apply to each kind of goods, and at which value slabs?
- How is tax treated on sale-or-return goods?
- Which invoices need an e-invoice, and which movements need an e-way bill?
- Which payments attract TDS, and at what rate?
- Which payroll laws apply to each employer and state?

**Answer:**

- `POL-10.01` Map each business unit explicitly to its legal entity, tax registration and accounting book. Do not infer these mappings from the Site.
- `POL-10.02` Maintain effective-dated HSN and merchandise classifications, rates and applicable value slabs. Determine sale-or-return tax from the actual agreement and transaction.
- `POL-10.03` Configure e-invoice and e-way bill requirements by applicable entity and transaction, preserving official acknowledgments.
- `POL-10.04` Configure TDS rules for applicable payment types and payroll rules by employer and state.
- `POL-10.05` Accounts and the CA approve statutory settings. Missing required configuration blocks the affected statutory action and raises an exception; configuration cannot bypass applicable law.
- `POL-10.06` KDPS registrations, merchandise classifications, rates and applicability still require verification; no thresholds or framework applicability are assumed.
- `POL-10.07` The bill-number format for each tax registration, within the statutory limit, remains to be confirmed by the CA.

**Signed by, date:**

## 11. Official book

- Tally is the official book today. Who may decide to move the official book to Apparel OS?
- What reconciliation evidence must exist before that move?

**Answer:**

- `POL-11.01` Tally remains KDPS’s sole official accounting book for now. Apparel OS may maintain operational/internal financial records and reconcile them with Tally; no current book migration is approved.
- `POL-11.02` A future switch requires joint Owner and CA approval, with Accounts preparing the evidence. Authority is explicit by accounting book and financial period so there are not two independent official results.
- `POL-11.03` Before a switch, opening and transaction balances for inventory value, receivables/payables, cash/bank and tax must reconcile, with no unresolved material differences. A successful close, tested backup/restore and available audit trail are also required.
- `POL-11.04` Define the cutover date, treatment of pending entries and fallback before any switch. No transition date is set.

**Signed by, date:**

## 12. Franchise/partner

- Under each partner agreement, who owns the stock?
- Is a dispatch to the partner a sale or a transfer, and at what price?
- What are the commission, royalty and minimum guarantee?
- What are the deposit, credit limit and payment terms?
- How and when is the partner settled?

**Answer:**

- `POL-12.01` Set stock ownership and the event that changes ownership from each signed, effective-dated partner agreement. Classify dispatch under that agreement as a sale, consignment or custody movement, with applicable pricing and tax. A franchise label alone does not make a dispatch a sale or change ownership.
- `POL-12.02` Record the agreement's calculation basis and terms for commission, royalty, revenue share and minimum guarantee, including return and adjustment effects.
- `POL-12.03` Record deposits, credit limits, payment terms, settlement cycle, deductions, dispute handling and required approval under the agreement.
- `POL-12.04` Version agreements and preserve the version applicable to each transaction. Provide source-detail statements for sales, returns, charges and payments so settlements can be reconciled.
- `POL-12.05` Obtain actual rates and terms from each signed agreement; they remain to be supplied.

**Signed by, date:**

## 13. Workforce

- For each employer, state and staff group: how is pay made up?
- What are the leave types and balances?
- How is overtime counted and paid?
- Which incentive rules apply, and what attendance is needed to qualify?
- How is a final settlement worked out when someone leaves?

**Answer:**

- `POL-13.01` Configure effective-dated payroll rules by legal employer, state and staff group, covering salary components, pay cycle, and joining/leaving proration.
- `POL-13.02` Define leave types, accrual and balances, carry-forward and encashment where applicable.
- `POL-13.03` Configure shifts, weekly offs, holidays, and overtime eligibility and calculation.
- `POL-13.04` Preserve original attendance events; corrections require approval and remain separately recorded. Missing punches and attendance disputes create a review task and do not automatically count as unpaid absence.
- `POL-13.05` Prepare approved payroll inputs and a calculation breakdown; approval is required before creating payment instructions.
- `POL-13.06` HR and Accounts validate actual entitlements, rates and statutory deductions against applicable law. Do not assume universal state rules; specific values remain to be confirmed.
- `POL-13.07` Use versioned, effective-dated incentive schemes for percentage, per-piece, target-slab, brand-funded and team-pool incentives. Each scheme specifies eligible staff, Sites, brands and dates, with a calculation basis of net sales, units or margin.
- `POL-13.08` Define attendance eligibility and treatment of approved leave, salesperson attribution per the PRD’s sale-line rule, and incentive adjustment handling. Apply returns, cancellations and corrections to the incentive calculation.
- `POL-13.09` Define approval and payout timing for each scheme. Show employees an explanation of their calculation.
- `POL-13.10` After payment, corrections remain visible as reviewed adjustments; do not silently rewrite earnings or deduct them from salary.
- `POL-13.11` Configure actual targets, rates and eligibility thresholds; none are assumed here.
- `POL-13.12` On exit, prepare an itemised final settlement of earned salary, approved incentives, reimbursements, leave encashment and applicable statutory dues, less only permitted deductions and recoveries.
- `POL-13.13` HR verifies the leaving date and entitlements; Accounts verifies amounts and approves payment. Track asset return and disputed recoveries separately; do not automatically withhold all earned pay.
- `POL-13.14` Track applicable deadlines and retain the final statement and payment evidence. Validate formulas and deadlines by employer and applicable law; no universal rules are assumed.

**Signed by, date:**

## 14. Opening and cutover

- Which stock list is the verified opening manifest for each Store, and who verified it?
- What are the opening supplier dues, customer dues, advances and deposits, and which closed books do they agree with?
- On which date and at which day close does each Store switch?
- Which unfinished work is carried across the switch?
- Who signs the switch?

**Answer:**

- `POL-14.01` Switch one Store at a time at a recorded day close, after the parallel run's stock and sales reconcile.
- `POL-14.02` Operations verifies the opening manifest by item, quantity, location, condition and ownership.
- `POL-14.03` Accounts verifies opening values, supplier and customer dues, advances and deposits against the last closed books. Complete a through-cutoff reconciliation that prevents omissions and double counting.
- `POL-14.04` Carry unfinished transfers, bookings, supplier/customer returns and refunds, claims and billed-retained items with their original references.
- `POL-14.05` Owner, Accounts and Operations approve the switch and its fallback.
- `POL-14.06` Opening stock records physically counted and verified stock without creating a fabricated purchase or supplier liability. Historical sales are reporting-only. After a Store switches, the old POS is reference-only; Tally remains the official book.
- `POL-14.07` Import and reconciliation tools may be prepared before cutover evidence is complete. Before the pilot switch, record the verified manifest and balances, day-close date, carried work, approvals and fallback.

**Signed by, date:**

## 15. Planning

- What is each forecast used for: buying, replenishment, markdowns, new-store opening?
- How far ahead should it look?
- How much clean sales history is needed before a forecast is trusted?
- How is a forecast judged against the baseline?
- Which proposals need approval, and may any step run without one?

**Answer:**

- `POL-15.01` Provide human-approved recommendations for buying, replenishment, rebalancing, markdowns and new-store opening.
- `POL-15.02` Set forecast horizons by purpose using relevant lead times, review cycles and seasons.
- `POL-15.03` Assess data quality, including missing days, stockouts, returns and promotions. Validate minimum history by category and purpose; no fixed month minimum is assumed.
- `POL-15.04` Evaluate forecasts out of sample against a simple baseline.
- `POL-15.05` Flag sparse/new-item data and uncertainty, provide a manual path, and preserve reasons when people override proposals.
- `POL-15.06` Proposal generation may run automatically; purchases, transfers and price changes still require their applicable approvals.
- `POL-15.07` Keep actual horizons, measures and thresholds configurable until validated.

**Signed by, date:**

## 16. Offline operation

- Which Stores may bill offline, and on which single counter?
- Which payment methods may be recorded offline?
- Are returns allowed offline?
- How much stock is set aside for the offline counter?
- Who resolves a bill that is refused or conflicts after upload?

**Answer:**

- `POL-16.01` Enable offline billing only for approved Stores, through one registered counter per Store, with authority renewed online every 24 hours.
- `POL-16.02` Cash may be recorded offline. External-terminal tenders require an approved evidence procedure; a screenshot alone is not provider confirmation.
- `POL-16.03` Refunds and returns/exchanges require online authority; store-credit redemption and actions requiring fresh approval also require online authority.
- `POL-16.04` Permit only reserved eligible counter stock and valid cached prices, offers and tax versions. Configure allocation limits per Store; actual limits remain unset.
- `POL-16.05` Expired authority, required data or statutory documents block finalisation while preserving work. Uploads must be duplicate-free; refused or conflicting bills create exceptions for the Store Manager, with Accounts handling monetary differences.
- `POL-16.06` Obtain required statutory documents before the applicable invoice is issued or goods are released.

**Signed by, date:**

## 17. Held-goods outcomes

- May goods without an approved PT be moved, and under whose authority?
- Who may accept wrong or unidentified goods, and through which PT route?
- Who may approve a write-off or a disposal, and up to what value?
- How is the lost value treated in the books?
- May damaged merchandise be sold or donated, and under which separately approved disposition rule?

**Answer:**

- `POL-17.01` Pre-PT custody/quarantine movement uses a separate authorised route and preserves the hold at the destination. Ordinary transfer approval cannot bypass it.
- `POL-17.02` Wrong or unidentified goods remain held until identity is resolved, Booking approves, and the applicable PT route is completed.
- `POL-17.03` Damaged-goods acceptance requires documented inspection and condition controls; acceptance never makes goods automatically good stock.
- `POL-17.04` Write-off and disposal require independent approvals under configured authority/value limits. Approver identities and limit values remain pending configuration.
- `POL-17.05` A write-off of established value is distinct from physical presence: goods still present remain in custody and unavailable.
- `POL-17.06` Record disposal quantity, reason, actual destruction or scrap handover, custody/source references and evidence; any remaining quantity stays quarantined.
- `POL-17.07` Accounts treats loss only against established values. Unknown pre-PT cost remains unknown and creates no fictitious cost, liability or journal.
- `POL-17.08` Link the case/exception to affected stock and claims, preserving the actual approver, limits, evidence and history; approvers/limits remain pending configuration.
- `POL-17.09` Donation or sale of damaged merchandise is not enabled by destruction/scrap authority and stays unavailable until an explicit disposition rule is approved.

**Signed by, date:**

## 18. Recovery and retention

- After a failure, how much recent data may be lost at most?
- How quickly must the system be back?
- How often is a backup restore tested, and by whom?
- How long is each kind of record kept?
- Which records are under a legal hold?

**Answer:**

- `POL-18.01` Use provisional targets of 15 minutes for recovery point (maximum recent data loss) and 4 hours for recovery time, subject to measured restore tests and KDPS business-impact acceptance. These targets are not a proven guarantee.
- `POL-18.02` Protect encrypted backups of records and attachments.
- `POL-18.03` Admin conducts a restore drill before go-live, quarterly thereafter, and after major recovery changes. Operations and Accounts validate stock, bills and financial totals before reopening.
- `POL-18.04` Reconcile any recovery gap against counter, provider and Tally records. Do not silently lose or duplicate transactions.
- `POL-18.05` Set retention by record class, including financial, stock, employee, customer and audit records. Validate actual durations against applicable legal retention requirements; legal holds override routine deletion.

**Signed by, date:**
