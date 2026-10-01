# KDPS — Policy answers

Apparel OS switches on nothing by default. Each policy below must be answered and signed by KDPS before the stage that needs it can start. The policies and their required definitions come from "Required policy configuration" in [prd.md](prd.md). The stages are described in [phases.md](phases.md).

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

- Supported commercial models: outright purchase, purchase with return rights (sale-or-return), and consignment.
- For each brand, a configured default commercial model is preselected on every new booking. The model can be changed for an individual booking.
- Commercial models and related commercial terms are configurable at both the brand and booking levels and may be revised later.
- Commercial terms may be edited directly while the booking is a draft. Once goods or accounting entries exist, subsequent changes use a recorded amendment that preserves prior transaction history.
- The ownership-transfer event is configurable per brand agreement and inherited by its bookings. Options include supplier dispatch, receipt and acceptance by KDPS, sale to the customer (typically for consignment), or another explicitly agreed event.
- Receipt and acceptance may be proposed for a new purchase agreement, but must be confirmed against the actual supplier terms. The configured event does not automatically assign ownership or override the governing agreement.
- Sale-or-return rights are separate from ownership transfer. PT approval confirms merchandise data and approved cost; it does not automatically change legal ownership.
- Supplier return rights are configured per brand agreement, inherited by each booking, and may be overridden per booking.
- Each agreement specifies whether unsold goods may be returned, the return window in days or as a fixed season-end date, and whether the window starts at dispatch, receipt, or acceptance.
- Each agreement also specifies eligible condition tags, packaging and quantity limits, supplier-approval requirements, freight responsibility and deductions, and whether accepted returns settle by credit note, replacement, or refund.
- The agreement determines the applicable return terms; there is no universal return-window default. Defective or incorrectly supplied goods follow a separate claims process, including under outright purchase.
- For outright and purchase-with-return-rights agreements, supplier payment follows the booking’s agreed due dates, advances, and instalments; unsold stock does not automatically defer payment.
- For consignment, settlement follows the agreed sale or consumption event and reporting cycle, reconciling customer returns and adjustments.
- Payment terms are configurable per brand and may be overridden per booking. Track disputed amounts separately from undisputed amounts due.
- Accounting recognition remains unresolved here and belongs to the Financial posting policy.

**Signed by, date:**

## 2. Permissions and approvals

- Which person holds which role, at which Sites and for which brands?
- Who may see cost, margin, salary, bank details and customer phone numbers?
- Which actions need a second person to approve?
- What are the amount and quantity limits for each approver?
- Which changes after approval need a fresh approval?

**Answer:**

- Start with editable KDPS role templates for Owner, Store POS, Warehouse, Brand Manager, Accounts and Admin, based on the user survey. Businesses can configure their own roles.
- Assign each user a role with explicit business, Site and brand scope.
- Expand broad labels such as All, Full and Manage into explicit view, create, edit, approve, cancel, export and override permissions.
- Control sensitive fields separately from module access.
- Keep approval authority separate from ordinary access, with configurable limits and independence requirements.
- Preserve who changed permissions and when.
- Require approval by an authorised person other than the preparer for PT approval and changes to approved cost/pricing; stock adjustments, write-offs and discrepancy settlements; exceptional discounts, refunds and no-bill returns; supplier payments and supplier bank-detail changes; and role, permission and approval-rule changes.
- A person cannot self-approve through another role. Routine billing and receiving within approved rules can proceed without additional approval.
- Configure approval limits per action and approver role within the assigned business, Site and brand scope, using amount, quantity or discount percentage as relevant. Route requests above the limit to the next authorised eligible approver; if none exists, leave the request pending without auto-approval. A missing limit does not grant unlimited authority; unlimited authority must be explicitly configured.
- Set numeric limit values when KDPS assigns approvers; the values remain undecided.
- Material changes after approval require renewed approval. These include changes to amount, quantity, price, supplier or customer, destination, commercial terms, or payment details when relevant to the action.

**Signed by, date:**

## 3. Source conflicts and pricing

- When the invoice, the supplier file and the physical ticket disagree on cost, MRP, attributes or tax, which one is trusted?
- How is P RATE worked out from BASIC for each brand: which additions, which tax base, which rounding?
- What happens to a line while a conflict is open?

**Answer:**

- Resolve conflicts by field; there is no universal rule that the invoice or supplier file wins every conflict. Record physically counted quantity separately from invoiced and booked quantity. Compare invoice cost with agreed booking terms and the approved costing profile; compare MRP and attributes on the physical ticket/item with supplier data and flag inconsistencies. Accounts validates tax against applicable rules.
- Preserve original values and record the approved resolution, evidence and approver. Imports must not silently overwrite approved data.
- A conflict does not prevent recording physical custody, but it holds the affected line from final PT approval and saleability. Clean, independently resolved lines may proceed.
- Automatically create discrepancy tickets for detected conflicts; users may also raise them manually. Link each ticket to the affected document/item and retain conflicting values, evidence and resolution history.
- Assign tickets to the responsible user or team in Booking, Accounts or Receiving based on the issue. Support comments, attachments, reassignment and escalation; resolve through the required approval. Closing a ticket alone does not change saleability or accounting.
- Maintain an approved costing profile per brand. A booking-level override requires approval. The profile defines discounts and additions and their calculation order, allocation of freight and other charges, tax treatment (keeping recoverable tax separate from inventory cost), rounding, and permitted matching tolerances.
- Keep BASIC, calculated P RATE and supplier-provided cost separately visible. Each brand formula must be supported by its agreement or a verified worked example; no formula or rate is assumed.
- Missing inputs or an unexplained mismatch raise a discrepancy ticket and block final costing approval.

**Signed by, date:**

## 4. Merchandise tracking

- Which product types need batch or expiry tracking?
- Which units and pack sizes are used, and how do they convert?
- Which identifiers must every piece carry?
- How close to expiry can goods still be sold?

**Answer:**

- Configure merchandise tracking profiles by category.
- Apparel and footwear identity includes the style/article, colour and size variant.
- Set a stock unit per product (piece, pair or pack) and explicit conversions for each purchasing and selling pack. Itemise mixed size/colour packs by their contents.
- Retain unit and pack-conversion history so later changes do not rewrite past quantities.
- Require batch/expiry identity throughout movements only for profiles that require it. Configure minimum remaining shelf life separately for receiving and selling; hold goods that fail the applicable eligibility rule.
- Give each KDPS-tracked physical piece a unique internal ID with a printable barcode, and retain supplier product barcodes for lookup.
- Support quantity-based tracking for broader products where appropriate.
- Specific batch/expiry categories and minimum remaining shelf-life day limits remain to be confirmed.

**Signed by, date:**

## 5. Booking

- When does a booking become a firm commitment?
- Who may change or cancel a booking, and until when?
- What is the delivery window, and what happens to quantity still outstanding after it?

**Answer:**

- Booking lifecycle: Draft is an editable buying plan; Approved is internal authorisation; Issued means it has been sent to the supplier; Confirmed records supplier acceptance against the agreed version.
- Approval includes buying/open-to-buy budget checks, and the budget is reserved to prevent duplicate spending. Actual commercial commitment follows the governing agreement, not the status label alone.
- Material changes after approval require renewed approval.
- After issue, amendments and cancellation follow the supplier agreement; record the communication with the supplier and its response. Cancellation cannot erase quantities already received.
- Set a delivery window per booking and line-level delivery dates for staggered deliveries. Partial receipts reduce outstanding quantity; shortages remain visible.
- When the delivery window expires, mark the remaining balance overdue and raise a follow-up ticket. Expiry alone does not cancel the balance.
- An authorised user may extend the window or cancel undelivered balance under the supplier terms and required approval.
- Late or excess goods may be recorded into physical custody, but require approval before acceptance into the booking.

**Signed by, date:**

## 6. Customer returns

- How many days does a customer have for an ordinary return, and for a defective item?
- From which date are the days counted?
- What can the customer get in each case: refund, exchange, store credit, or refusal?
- Does any Store follow a different rule?

**Answer:**

- Each Store inherits its Organisation’s customer-return policy, including return windows, eligibility and permitted remedies. A Store-specific override is permitted only when explicitly authorised by the Organisation.
- For ordinary apparel and footwear returns, use 15 days as a configurable Organisation-level starting default. Eligibility requires the item to be unused, with its original tags and a sale that can be traced.
- Count the ordinary return window from customer handover or delivery. For billed-retained goods, start it on collection.
- Preserve the policy that applied at the time of sale; a later policy change cannot retrospectively reduce that sale’s return eligibility.
- Handle defective items through a separate assessment and remedy process. Do not reject one solely because the ordinary return window has elapsed; applicable consumer rights and warranties still apply. The defective-item cutoff remains to be decided.
- For eligible ordinary returns, offer refund, exchange or store credit, with the customer choosing among remedies permitted by policy. Record an exchange's return and replacement separately and collect or refund any price difference; refund routing is governed by the Refunds and no-bill returns policy.
- For defective goods, support assessment followed by replacement, repair where appropriate, or refund under applicable consumer rights and warranties. Do not force store credit where a refund is owed.

**Signed by, date:**

## 7. Refunds and no-bill returns

- Does a refund go back to the original payment method?
- When may cash be given in place of the original method?
- Are returns without a bill allowed? If so, who may approve one, at what value, and with what evidence?

**Answer:**

- Route refunds to the original payment method by default. For split payments, allocate the refund among original tenders, capped at each tender’s remaining refundable amount; no priority among tenders is specified. A cash purchase may be refunded in cash as the original tender.
- Permit substitution of a card/UPI refund with cash only if the provider permits it, an independent authorised approver approves it, and the reason is recorded.
- Keep refund entitlement separate from permitted tender routing. Prevent duplicate refunds; while the original refund outcome is unknown, do not issue a second refund. Keep approved, pending, failed and confirmed outcomes distinct; a failed payment remains an outstanding customer obligation.
- Issue store credit only with the customer’s agreement.
- For a no-bill request, first search the original sale using receipt details, customer details or payment reference. If found, handle it as an ordinary bill-backed return.
- If no original sale is found, raise an exception request with item details, evidence and reason. An independent authorised approver must approve it within the configured value limit.
- An approved ordinary no-bill exception may be handled by exchange or store credit; it does not receive an automatic cash refund. Use documented, evidenced valuation rather than assuming MRP.
- Assess defective-goods claims separately under applicable rights and warranties.
- Each Organisation may enable or disable ordinary no-bill exceptions. Keep them unavailable until eligibility, valuation and approval limits are configured.

**Signed by, date:**

## 8. Billed-retained

- When goods are paid for but stay in the store, for alteration or later pickup, who is responsible for them?
- How long are they kept, and what happens if they are never collected?
- What happens on cancellation?
- When is the sale recognised in the books?

**Answer:**

- The Store is responsible for safekeeping until a handover to assigned staff is recorded.
- Link each retained piece to its bill, customer, storage location, reason for retention and promised collection date. Keep retained pieces unavailable for sale or allocation.
- Track alteration separately from ready-for-collection status. Record collection and partial pickups piece by piece.
- Configure collection periods and reminders per Organisation. An overdue item raises a follow-up ticket; it is not automatically resold, written off or forfeited.
- Handle cancellation under the agreed return or alteration terms and required approvals. Inspect goods before releasing them to sellable stock.
- Keep payment, physical handover and revenue recognition distinct. Revenue-recognition timing remains unresolved here and belongs to Financial posting.

**Signed by, date:**

## 9. Financial posting

- When is a purchase, a sale and a return recognised in the books?
- Which cost formula is used for stock, and how are later cost adjustments treated?
- Which accounts does each kind of transaction post to, in which book?
- What difference is tolerated before a reconciliation is raised as an exception?
- Which Tally voucher type does each transaction become, and what counts as a successful acknowledgment?

**Answer:**

- Use accrual-based recognition and posting rules configured per Organisation and accounting book. Accounts and the CA must approve the applicable framework and rules before activation.
- Recognise purchase inventory and the supplier obligation when required by the contract and applicable accounting framework. Receipt/acceptance is a common recognition event, but not a universal rule. Physical custody is recorded from the actual count regardless of invoice or PT status. If an obligation exists while the invoice is missing or PT is pending, record it using an approved, supported provisional valuation and reconcile it when evidence arrives; do not conceal the liability while awaiting paperwork.
- Genuine supplier-owned consignment remains outside owned inventory until its relevant recognition event. Sale-or-return ownership follows the agreement; the label alone does not determine it.
- Recognise ordinary-sale revenue and COGS at the applicable transfer event, normally customer handover. Payment or invoicing alone does not determine recognition. Billed-retained goods require a separate assessment of readiness and remaining obligations, including alteration.
- Keep physical receipt of returned goods, credit/refund entitlement and repayment as distinct events. PT approval is a valuation control, not a universal accounting-recognition trigger.
- Conditional preferred inventory-costing baseline: support FIFO and weighted-average methods; moving weighted average is preferred for KDPS interchangeable stock, subject to CA confirmation of the existing/applicable policy and validation with representative purchase, sale, return and late-cost cases before activation. This is a preference for evaluation, not an activated method.
- Retain receipt- and piece-level source cost history regardless of the financial cost formula. A unique barcode alone does not justify specific-identification costing for interchangeable goods. Apply a consistent formula to inventories of similar nature and use, not a separate formula casually per booking.
- Trace later approved cost changes to their effects on remaining inventory and COGS for goods already sold. Support lower-of-cost-and-net-realisable-value write-downs under applicable rules.
- KDPS’s existing cost method is unknown. If it changes, reconcile the transition and opening stock; no operational method change or validation is claimed here.
- The applicable framework (AS or Ind AS), exact event mappings and billed-retained recognition rules still require CA approval; no framework is assumed.
- Define posting maps per Organisation and accounting book for purchases, sales, returns, payments, stock adjustments and other events. Use Store and brand dimensions rather than a separate ledger per Store. Accounts and the CA must supply the actual ledger accounts.
- A missing or invalid map blocks the affected financial posting and raises a ticket while preserving the underlying operational event. Version maps and retain the applied rule with each transaction. Posted entries are immutable; corrections use linked reversals or adjustments subject to financial-period locks.
- Apply zero tolerance to unbalanced journals, duplicate postings and unexplained missing transactions. Permit configurable, Accounts-approved tolerances only for genuine rounding and invoice matching; show differences even within tolerance. Above tolerance, raise a ticket and hold the affected financial action. A tolerance never authorises a write-off; that requires a separate approved rule.
- Actual rupee or percentage tolerance values remain unset until representative transactions have been checked.
- Use configurable, Accounts-approved starting Tally mappings: sales to Sales; purchases to Purchase; sales returns to Credit Note; purchase returns to Debit Note; receipts and payments to Receipt and Payment; own-entity cash/bank transfers to Contra; and appropriate accrual, depreciation and adjustment events to Journal.
- Validate inventory vouchers and combined cash-sale mapping against KDPS’s actual Tally configuration to avoid duplicate stock or money effects.
- Exporting or sending a voucher is not success. Parse Tally’s response and associate each accepted voucher with its ERP transaction. Support partial batch success; rejected or uncertain vouchers remain pending and can be safely retried without duplicates.
- Reconcile voucher values, tax and totals before marking a batch reconciled.

**Signed by, date:**

## 10. Statutory applicability

- Which tax registration covers each business unit?
- Which HSN code and GST rate apply to each kind of goods, and at which value slabs?
- How is tax treated on sale-or-return goods?
- Which invoices need an e-invoice, and which movements need an e-way bill?
- Which payments attract TDS, and at what rate?
- Which payroll laws apply to each employer and state?

**Answer:**

- Map each business unit explicitly to its legal entity, tax registration and accounting book. Do not infer these mappings from the Site.
- Maintain effective-dated HSN and merchandise classifications, rates and applicable value slabs. Determine sale-or-return tax from the actual agreement and transaction.
- Configure e-invoice and e-way bill requirements by applicable entity and transaction, preserving official acknowledgments.
- Configure TDS rules for applicable payment types and payroll rules by employer and state.
- Accounts and the CA approve statutory settings. Missing required configuration blocks the affected statutory action and raises a ticket; configuration cannot bypass applicable law.
- KDPS registrations, merchandise classifications, rates and applicability still require verification; no thresholds or framework applicability are assumed.

**Signed by, date:**

## 11. Official book

- Tally is the official book today. Who may decide to move the official book to Apparel OS?
- What reconciliation evidence must exist before that move?

**Answer:**

- Tally remains KDPS’s sole official accounting book for now. Apparel OS may maintain operational/internal financial records and reconcile them with Tally; no current book migration is approved.
- A future switch requires joint Owner and CA approval, with Accounts preparing the evidence. Authority is explicit by accounting book and financial period so there are not two independent official results.
- Before a switch, opening and transaction balances for inventory value, receivables/payables, cash/bank and tax must reconcile, with no unresolved material differences. A successful close, tested backup/restore and available audit trail are also required.
- Define the cutover date, treatment of pending entries and fallback before any switch. No transition date is set.

**Signed by, date:**

## 12. Franchise/partner

- Under each partner agreement, who owns the stock?
- Is a dispatch to the partner a sale or a transfer, and at what price?
- What are the commission, royalty and minimum guarantee?
- What are the deposit, credit limit and payment terms?
- How and when is the partner settled?

**Answer:**

- Set stock ownership and the event that changes ownership from each signed, effective-dated partner agreement. Classify dispatch under that agreement as a sale, consignment or custody movement, with applicable pricing and tax. A franchise label alone does not make a dispatch a sale or change ownership.
- Record the agreement's calculation basis and terms for commission, royalty, revenue share and minimum guarantee, including return and adjustment effects.
- Record deposits, credit limits, payment terms, settlement cycle, deductions, dispute handling and required approval under the agreement.
- Version agreements and preserve the version applicable to each transaction. Provide source-detail statements for sales, returns, charges and payments so settlements can be reconciled.
- Obtain actual rates and terms from each signed agreement; they remain to be supplied.

**Signed by, date:**

## 13. Workforce

- For each employer, state and staff group: how is pay made up?
- What are the leave types and balances?
- How is overtime counted and paid?
- Which incentive rules apply, and what attendance is needed to qualify?
- How is a final settlement worked out when someone leaves?

**Answer:**

- Configure effective-dated payroll rules by legal employer, state and staff group, covering salary components, pay cycle, and joining/leaving proration.
- Define leave types, accrual and balances, carry-forward and encashment where applicable.
- Configure shifts, weekly offs, holidays, and overtime eligibility and calculation.
- Preserve original attendance events; corrections require approval and remain separately recorded. Missing punches and attendance disputes create a review task and do not automatically count as unpaid absence.
- Prepare approved payroll inputs and a calculation breakdown; approval is required before creating payment instructions.
- HR and Accounts validate actual entitlements, rates and statutory deductions against applicable law. Do not assume universal state rules; specific values remain to be confirmed.
- Use versioned, effective-dated incentive schemes for percentage, per-piece, target-slab, brand-funded and team-pool incentives. Each scheme specifies eligible staff, Sites, brands and dates, with a calculation basis of net sales, units or margin.
- Define attendance eligibility and treatment of approved leave, salesperson attribution and shared-sale splits. Apply returns, cancellations and corrections to the incentive calculation.
- Define approval and payout timing for each scheme. Show employees an explanation of their calculation.
- After payment, corrections remain visible as reviewed adjustments; do not silently rewrite earnings or deduct them from salary.
- Configure actual targets, rates and eligibility thresholds; none are assumed here.
- On exit, prepare an itemised final settlement of earned salary, approved incentives, reimbursements, leave encashment and applicable statutory dues, less only permitted deductions and recoveries.
- HR verifies the leaving date and entitlements; Accounts verifies amounts and approves payment. Track asset return and disputed recoveries separately; do not automatically withhold all earned pay.
- Track applicable deadlines and retain the final statement and payment evidence. Validate formulas and deadlines by employer and applicable law; no universal rules are assumed.

**Signed by, date:**

## 14. Opening and cutover

- Which stock list is the verified opening manifest for each Store, and who verified it?
- What are the opening supplier dues, customer dues, advances and deposits, and which closed books do they agree with?
- On which date and at which day close does each Store switch?
- Which unfinished work is carried across the switch?
- Who signs the switch?

**Answer:**

- Switch one Store at a time at a recorded day close, after the parallel run's stock and sales reconcile.
- Operations verifies the opening manifest by item, quantity, location, condition and ownership.
- Accounts verifies opening values, supplier and customer dues, advances and deposits against the last closed books. Complete a through-cutoff reconciliation that prevents omissions and double counting.
- Carry unfinished transfers, bookings, supplier/customer returns and refunds, claims and billed-retained items with their original references.
- Owner, Accounts and Operations approve the switch and its fallback.
- Opening stock records verified physical stock without creating a fabricated purchase or vendor liability. Historical sales are reporting-only. After a Store switches, the old POS is reference-only; Tally remains the official book.
- Import and reconciliation tools may be prepared before cutover evidence is complete. Before the pilot switch, record the verified manifest and balances, day-close date, carried work, approvals and fallback.

**Signed by, date:**

## 15. Planning

- What is each forecast used for: buying, replenishment, markdowns, new-store opening?
- How far ahead should it look?
- How much clean sales history is needed before a forecast is trusted?
- How is a forecast judged against the baseline?
- Which proposals need approval, and may any step run without one?

**Answer:**

- Provide human-approved recommendations for buying, replenishment, rebalancing, markdowns and new-store opening.
- Set forecast horizons by purpose using relevant lead times, review cycles and seasons.
- Assess data quality, including missing days, stockouts, returns and promotions. Validate minimum history by category and purpose; no fixed month minimum is assumed.
- Evaluate forecasts out of sample against a simple baseline.
- Flag sparse/new-item data and uncertainty, provide a manual path, and preserve reasons when people override proposals.
- Proposal generation may run automatically; purchases, transfers and price changes still require their applicable approvals.
- Keep actual horizons, measures and thresholds configurable until validated.

**Signed by, date:**

## 16. Offline operation

- Which Stores may bill offline, and on which single counter?
- Which payment methods may be recorded offline?
- Are returns allowed offline?
- How much stock is set aside for the offline counter?
- Who resolves a bill that is refused or conflicts after upload?

**Answer:**

- Enable offline billing only for approved Stores, through one registered counter per Store, with authority renewed online every 24 hours.
- Cash may be recorded offline. External-terminal tenders require an approved evidence procedure; a screenshot alone is not provider confirmation.
- Refunds, store-credit redemption, returns/exchanges and actions requiring fresh approval require online authority.
- Permit only reserved eligible counter stock and valid cached prices, offers and tax versions. Configure allocation limits per Store; actual limits remain unset.
- Expired authority, required data or statutory documents block finalisation while preserving work. Uploads must be duplicate-free; refused or conflicting bills create tickets for the Store Manager, with Accounts handling monetary differences.
- Obtain required statutory documents before the applicable invoice is issued or goods are released.

**Signed by, date:**

## 17. Held-goods outcomes

- May goods without an approved PT be moved, and under whose authority?
- Who may accept wrong or unidentified goods, and through which PT route?
- Who may approve a write-off or a disposal, and up to what value?
- How is the lost value treated in the books?

**Answer:**

- Pre-PT custody/quarantine movement uses a separate authorised route and preserves the hold at the destination. Ordinary transfer approval cannot bypass it.
- Wrong or unidentified goods remain held until identity is resolved, Booking approves, and the applicable PT route is completed.
- Damaged-goods acceptance requires documented inspection and condition controls; acceptance never makes goods automatically good stock.
- Write-off and disposal require independent approvals under configured authority/value limits. Approver identities and limit values remain pending configuration.
- A write-off of established value is distinct from physical presence: goods still present remain in custody and unavailable.
- Record disposal quantity, reason, actual destruction or scrap handover, custody/source references and evidence; any remaining quantity stays quarantined.
- Accounts treats loss only against established values. Unknown pre-PT cost remains unknown and creates no fictitious cost, liability or journal.
- Link the case/ticket to affected stock and claims, preserving the actual approver, limits, evidence and history; approvers/limits remain pending configuration.

**Signed by, date:**

## 18. Recovery and retention

- After a failure, how much recent data may be lost at most?
- How quickly must the system be back?
- How often is a backup restore tested, and by whom?
- How long is each kind of record kept?
- Which records are under a legal hold?

**Answer:**

- Use provisional targets of 15 minutes for recovery point (maximum recent data loss) and 4 hours for recovery time, subject to measured restore tests and KDPS business-impact acceptance. These targets are not a proven guarantee.
- Protect encrypted backups of records and attachments.
- Admin conducts a restore drill before go-live, quarterly thereafter, and after major recovery changes. Operations and Accounts validate stock, bills and financial totals before reopening.
- Reconcile any recovery gap against counter, provider and Tally records. Do not silently lose or duplicate transactions.
- Set retention by record class, including financial, stock, employee, customer and audit records. Validate actual durations against applicable legal retention requirements; legal holds override routine deletion.

**Signed by, date:**
