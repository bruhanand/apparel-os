# Apparel OS — Product Requirements Document

## Product

Apparel OS runs purchasing, receiving, stock, selling, finance, workforce management and planning for retail businesses selling clothing, footwear and packaged goods. It connects offices, warehouses, multi-brand outlets (MBO), exclusive-brand outlets (EBO) and franchise operations in one system.

- Show stock by product, size, location, condition and owner.
- Convert supplier files into reviewed merchandise and price-ticket records.
- Track supplier commitments, return rights, claims and settlement.
- Reconcile sales, cash, electronic collections and bank movements.
- Maintain a double-entry ledger and exchange approved vouchers with Tally.
- Connect attendance, sales attribution, targets, incentives and payroll.
- Preserve stock, money, staff and document history through openings, closures and relocation.
- Provide operational reports, profit analysis and human-approved planning recommendations.
- Support English and Hindi interfaces, counter and office PCs, and a phone client.
- Online storefronts, marketplace order management, automatic government-return filing and facial recognition are outside the product scope. EBO brand billing software remains an external system whose reports are imported.

### Business measures

- Measure stock-count accuracy against the configured tolerance for each operating unit.
- Measure imported price-ticket lines approved without re-entry or correction.
- Track eligible supplier returns so missed deadlines remain visible.
- Explain each store-day and bank line by the next working day through a match or an assigned exception.
- Generate Tally vouchers without duplicate manual entry; track import rejection against the target of less than 2%.
- Make monthly brand-by-store profit available by the fifth working day, identifying incomplete inputs.
- Calculate incentives from approved sales and attendance records without a separate calculation sheet.

## Organisation, sites and ownership

- Keep Organisation, legal entity, tax registration, accounting book, Site, Store, business unit and internal stock location as separate records.
- An Organisation is an independent retail business group containing its legal entities and operating network. Its data is isolated from other Organisations.
- A Site is a physical place with a permanent identity and site code. A Store is a trading business at a Site, with a separate store code, name and history.
- A business unit, or SBU, is the whole Store or one of several units within it. Offices and warehouses can also have business units.
- Map each business unit explicitly to its legal entity, tax registration and accounting book. Units at one Site may have different mappings; transactions use the relevant unit's mappings.
- Allow whole-store and warehouse units to cover several brands, brand-counter units to cover one brand, and office units to operate without a brand.
- Maintain geography as Country → State → City → Area → Site. Regions and clusters are additional configurable groupings.
- Maintain Site and Store names, aliases, addresses, classifications, opening and closing dates, status and partner associations.
- Keep physical Site kind, Store format, operating model, inventory ownership and settlement terms independent.
- Support head and regional offices, central and regional warehouses, MBO, EBO, shop-in-shop and kiosk formats, and company-owned, franchise-owned and franchise-owned company-operated stores.
- Configure countries, currencies, merchandise categories, product identity, commercial terms, workforce rules and accounting interfaces for each Organisation.
- Maintain floor, backstore, zones, racks, bins, fixtures, display and alteration locations. Damage, holds and transit are stock/custody conditions, not invented Sites.
- Assign each Store a default warehouse for replenishment and returns; permit other authorised routes.
- Record stock ownership from the applicable agreement. Outright and sale-or-return terms do not by themselves determine legal title, valuation or accounting recognition.
- Track company, supplier/brand and partner-owned goods separately where the approved commercial model requires it. Exclude third-party-owned goods from owned-inventory value under the applicable accounting policy.
- Maintain effective-dated margins, commissions, payment terms, return windows, return processes, credit-note terms and brand-funded promotion terms.

## People, access and approvals

| Responsibility | Work supported |
| --- | --- |
| Owner | Business results, significant approvals, payments, offers and losses |
| Admin | Users, permissions, masters, configuration and integration administration |
| Accounts | Cash, bank, payables, receivables, claims, tax, journals, Tally and period close |
| Chartered Accountant (CA) | Authorised book/report access, comments and document requests |
| Booking | Buying plans, bookings, deliveries, merchandise and price-ticket preparation |
| Operations | Distribution, transfers, counts, exceptions and Site lifecycle |
| Warehouse | Receiving, labels, putaway, picking, dispatch and supplier returns |
| Brand manager | Brand performance, assortment, pricing, offers and brand reporting |
| Store manager | Store operation, authorised discounts/returns and day close |
| Cashier | Billing, tender recording and authorised customer returns |
| Salesperson | Sale attribution, targets and own incentive information |
| EBO staff | Brand-report uploads, stock handling and petty cash |
| HR | Employee records, attendance, rosters, leave, incentives and payroll |
| Auditor | Scoped read-only records and audit evidence |

- Allow a person to hold several roles, with explicit action, entity, Site, brand and field permissions.
- Keep work placement separate from access. A responsibility label does not itself grant a transaction or approval.
- Apply scope within each role assignment; do not combine an action from one assignment with another assignment's fields or locations.
- Effective-date assignments and policy changes; preserve their history. All-members scope includes future members; selected-member scope remains fixed; empty scope grants none.
- Require a different authorised person from the preparer wherever independent approval applies, including PT approval and transfer approval.
- Bind approval to the reviewed document version, source/destination, items, quantity, amount and beneficiary as applicable. Material changes require renewed approval.
- Restrict salary, identity documents, bank details, customer contact information, cost and margin according to field permissions.
- Give each person one inbox containing tasks, exceptions and approvals, ordered by due time and exposure.
- Support approve/reject with reasons, evidence, comments, delegation during absence and escalation of overdue work.
- Permit bulk approval only within the configured authority and risk policy.
- Support phone and WhatsApp approval through authenticated actions tied to the exact record version.
- Record actor, event time, recording time, scope, before/after values, version, reason, source and approval evidence for important changes.
- Preserve approved content and completed business events. Corrections, reversals and lifecycle changes are separately attributable records.

## Merchandise and identifiers

- Maintain brands, suppliers, agents, ordering parties, invoicing parties and goods movers independently.
- Maintain stable internal SKU identities for merchandise variants. Apparel and footwear use style/article, colour and size, with category-specific size sets and size-colour grids.
- Maintain season, collection, launch date, gender, fabric, fit, category, HSN and applicable merchandise attributes.
- Preserve unknown values. Missing size is distinct from an explicitly supplied Free Size.
- Map external barcodes and supplier codes to the correct SKU and unit, with scope and validity dates. Identical pieces can share a barcode.
- Reject ambiguous active mappings; preserve leading zeros and historical aliases.
- Print internal barcode labels when appropriate identifiers are absent.
- Keep purchase cost, price-ticket maximum retail price (MRP), selling price, tax and discount separate; retain transaction-time snapshots.
- Support packaged-goods units of measure, packs and conversions, and batch/expiry tracking where the merchandise profile requires them.
- Carry configured unit, batch and expiry identity through receiving, movement, sale, return and count. Missing required tracking information blocks the affected operation.
- Apply configured expiry eligibility and hold rules; quantities in different units are not silently combined.
- Maintain product and vocabulary proposals separately from approved masters. Unconfirmed identity cannot enter an official PT.

## Source conversion and imports

- Accept spreadsheets, CSV, PDF and photographs for supported document workflows; support brand PT files in XLSX, XLS, XLSB and CSV formats.
- Preserve the original file, source system, uploader, time, document reference and original row/field values.
- Use saved, versioned mappings by source and document type; retain original source words alongside normalised values.
- Detect layouts from their structure; a brand name can identify candidates but cannot silently select an incompatible mapping.
- Stage data, validate references and totals, preview proposed records and changes, obtain the required review, then publish.
- Distinguish supplied values, deterministic calculations, confirmed mappings and AI suggestions.
- Report row/field errors and conflicting identity, quantity, price, tax or date information with the correction required.
- Govern vocabulary and mapping rules through proposal and independent confirmation; an unapproved proposal changes no operational data.
- Offer exact or close-match suggestions for manual selection; never fill identity or commercial facts from an unaccepted guess.
- Distinguish create, update, opening balance, historical reference and transaction import. An analytical-history import creates no live stock, receivable or tax document.
- Prevent duplicate business effects across repeated uploads, corrected files and integration retries. A reused source identity with different content is an explicit conflict or governed revision.
- Retain successful and failed document outcomes; a required document cannot be partly posted because one line failed.
- Reconcile accepted, rejected, pending and duplicate quantities and values. Correcting an import preserves its original evidence and downstream links.

## Booking and buying

- Create bookings by brand, season and destination, using style/size quantities and a size-colour grid.
- Record booking-specific terms with effective brand/supplier terms as defaults.
- Show total pieces, indicative cost and MRP values. Indicative booking cost does not replace approved receipt cost.
- Control booking approval against the open-to-buy budget by brand and season.
- Track ordered, delivered, outstanding and cancelled quantities separately from invoice discrepancies.
- Derive delivered quantities from retained receipt links rather than a manually maintained counter.
- At GRN issue against a booking, link a counted line only when it has one exact style-and-size match. Preserve actor and date; ambiguous lines require buyer review.
- Support deliveries without a booking and subsequent authorised linking.
- Record expected delivery dates, transporter and lorry receipt references; notify responsible users of late deliveries.
- Compare supplier order confirmations with bookings and show differences for review.
- Measure supplier fill rate, delivery timeliness, damage and PT accuracy.
- Suggest buying and size quantities from qualified sales history, with human approval.
- Configure commitment, amendment and cancellation rules; cancellation cannot erase quantities already physically received.

## Receiving and price tickets

A goods receipt note (GRN) records the goods physically counted at the receiving Site. A price ticket (PT) is a reviewed table of merchandise identity, counted coverage, approved cost, maximum retail price (MRP) and tax information. It may come from a supplier or be assembled from an invoice and merchandise evidence.

- Provide one Receive Goods inbox per Site, combining vendor deliveries and incoming transfer dispatches, with Pending and History views.
- Start vendor receiving through Goods arrived or Receive against booking; both open the same guided workflow.
- Keep arrival, count, GRN, discrepancy, PT revision, approval, label job and acceptance records distinct within the workflow.
- Receive directly at a Store or warehouse, by barcode scan or controlled count; record the actual Site even when another Site prepares the PT.
- Count goods despite missing booking, invoice or PT. Capture actual quantity, identity evidence and condition.
- Record shortage, excess, wrong, unidentified and damage observations separately; conditions can coexist.
- Preserve carton, seal and damage photographs, transporter references and inbound e-way evidence.
- Create physical custody only from the actual count. Invoice or PT quantities cannot manufacture stock.
- Keep counted custody, official priced coverage, available stock and financial approval distinct.
- Compare invoice, GRN and PT quantities, prices, taxes and charges nightly; assign differences to Accounts and Booking.
- Allow clean resolved portions to proceed independently of quantities still disputed.
- Keep wrong/unidentified and excess quantities held until their applicable identity and acceptance rules are satisfied. Missing PT alone does not classify goods as wrong.
- Accept good excess only through explicit authority, preserving the original discrepancy.
- Prepare PTs at the receiving Site or through an authorised warehouse/office workbench without changing the receipt location.
- Allow one primary PT and supplemental PTs against counted portions of the same receipt; approved coverage cannot overlap.
- Reconcile every PT row to receipt quantities and their origins. A receipt PT cannot be an unlinked merchandise list.
- Require a submitted revision, completed review and independent approval before a PT becomes official.
- Freeze the approved revision's values and coverage. Maintain its source file, mapping/calculation profile and reviewer evidence.
- Correct or reverse through linked records; validate dependencies on accepted, reserved, transferred, returned and sold quantities before changing coverage.
- Print merchandise/MRP labels from official frozen PT values and retain print/reprint jobs. A pre-approval custody label cannot assert an approved price or sale eligibility.
- Verify the barcode/tag and physically accept goods at the selling Site. PT approval alone cannot make goods sellable.
- Record acceptance and putaway by the people authorised at the actual destination; vendor-supplied tags still require verification.

### PT workbench

- Provide To prepare, To approve and Mapping rules views, including new SKU proposals awaiting confirmation.
- Support GRN-count preparation, canonical-file upload and supplier-file conversion through the same reviewed records.
- Provide approved-vocabulary dropdowns, column fill for all or blank rows, controlled quick fills, row/page-selection review, per-cell origin and canonical workbook export.
- Save PT edits explicitly; preserve recoverable drafts without treating them as submitted or approved. Editing a reviewed row removes its review mark.
- Show concurrent changes side by side instead of silently overwriting another person's review.
- Resolve changed merchandise attributes to an existing SKU or a separately confirmed new SKU.
- Calculate protected derived fields from the approved profile; do not permit unrestricted typing over them.
- Support the KDPS export profile: SEASON, BRAND, COLOR, GENDER, SUB CATEGORY, TYPE, ITEM, FIT, SIZE, BARCODE, DESIGN, HSN, QTY, MRP, BASIC, P RATE, INPUT TAX, OUTPUT TAX, NAG, MARGIN, SUGGESTED SUB CATEGORY and SUGGESTED TYPE.
- Treat that profile as a view of resolved merchandise, quantity, cost and tax records, rather than the universal storage model.
- Retain BASIC as the profile's cost base, P RATE as its approved receipt-layer cost and MRP as the ticket value. The exact derivation, tax bases, additions and rounding belong to the approved costing profile.
- NAG equals QTY. Display ticket MARGIN as (MRP − P RATE) ÷ MRP × 100, rounded half-up to two decimal places; report realised profit and agreed commercial margins separately.
- INPUT TAX and OUTPUT TAX represent the approved profile's purchase-side and sale-side tax classifications. SUGGESTED SUB CATEGORY and SUGGESTED TYPE are master hints requiring confirmation, not automatic changes to merchandise identity.
- Support base-to-ticket derivation, ticket-to-purchase derivation and both-supplied verification. Block calculations with missing inputs, invalid slabs or unresolved source conflicts.

## Stock and warehouse control

- Track physical quantity, official PT coverage/value, available quantity, reservations, ordinary holds, excess hold, quarantine and transit separately.
- Track billed-retained, alteration and display custody without double-counting physical quantity.
- A piece is sellable only with official PT coverage, barcode verification and physical acceptance at its selling Site, with no conflicting hold or reservation.
- Preserve receipt origin, PT revision, quantity, ownership and cost through every move. Grouped displays must retain separate underlying origins.
- Within-Site floor, backstore, rack and bin moves are exact-quantity movements preserving condition and acceptance; they are not inter-Site transfers.
- Provide stock search by product, brand, size, barcode, location and condition, including availability at authorised alternative stores.
- Distinguish good unsold dead stock from damaged/non-returnable stock.
- For a full store count, reconcile tills, stop finalisation, establish the count scope, count/scan, review differences and authorise adjustments before resuming selling.
- Support cycle counts by location, rack, brand or selected items, with an explicit rule for movements occurring during the count.
- Preserve initial counts, recounts, differences, reasons and approved corrections.
- Identify broken size runs and opportunities to obtain missing sizes from other locations.

## Transfers and physical movement

- Support warehouse-to-store, store-to-warehouse, store-to-store and warehouse-to-warehouse movements.
- An internal transfer has one source and destination; different destinations require separate documents.
- Keep internal transfers, returns to vendor (RTV) and commercial sales to partners distinct.
- Present allowed destinations by name/code without granting access to their operational data. Ordinary internal movement remains within its authorised legal-entity boundary.
- Use request/draft → independent higher-authority approval and reservation → dispatch → destination count → acceptance.
- At approval, ordinary transfers require official PT coverage, source acceptance and available unreserved quantity. Bind reservations to the reviewed source/custody references and condition.
- Recheck dispatch eligibility against that movement's reservation without clearing existing holds. Controlled quarantine or incomplete-custody routes require their separate authority.
- Approval reserves reviewed quantities at source and prevents competing allocation or sale.
- An undispatched reservation has no automatic expiry. Release it only by actual dispatch or explicit cancellation.
- Changing items, increasing quantity or changing destination requires renewed approval. A smaller dispatch leaves the remainder reserved.
- Support several dispatches against one approved movement. Each records actual quantities, source references, departure time, recording time, actor and transport evidence.
- Derive transfer documentation for registered stock from its source origins; do not create a new vendor purchase or apply markup again.
- Record actual dispatch and arrival separately and safely once. Pending destination visibility is not physical receipt.
- Receive each dispatch as one whole shipment. Separate dispatches can arrive separately; staged partial receipt within one dispatch is outside this movement contract.
- An unfinished scan session stays unfinished; it cannot silently short-close the shipment.
- Record expected and actual good, damaged, wrong, unidentified, excess and missing quantities. Damage is not shortage, and absent goods do not enter quarantine.
- Release eligible good quantities independently of disputed portions.
- Preserve explicit discrepancy resolution before missing or disputed quantities count as accounted for.
- If delivery fails and goods return, record actual receipt at the source linked to the dispatch, with condition and evidence; preserve the failed destination outcome.
- For internal dispatch, completion requires destination accounting for its quantities. For direct vendor pickup, it requires confirmed handover. For delivery to a vendor, it requires confirmed vendor receipt.
- Complete the overall movement only when every dispatched quantity is accounted for and no undispatched reservation remains. Returned or cancelled quantity is not labelled successfully delivered.
- Cancellation clears only the relevant undispatched reservation, never quarantine or another hold.
- Determine statutory movement documents from configured ownership, entity, registration and movement rules. Keep transfer PTs and statutory documents separately linked.
- Record actual departure/arrival even when documentation is missing; retain missing-at-dispatch, later attachment and verification as an owned compliance exception.
- Track documentation compliance and financial settlement independently of movement completion.
- Retain supplied return deadlines and dashboard reminders. Reminders never dispatch, cancel or release goods automatically.

## Damage, quarantine and disposal

- Reporting damage immediately makes the affected quantity unavailable, before confirmation.
- Require a different authorised reviewer to confirm or reject the report, preserving the observations and decision.
- Rejecting a mistaken report removes only that damage hold; other holds or reservations remain.
- Record damage at arrival, after GRN and before PT, or after official PT, using the available custody/origin evidence.
- Preserve unknown pre-PT identity, cost and tax instead of inventing stock layers or zero values.
- Allow confirmed damaged goods to remain quarantined without a forced movement or time-based release.
- Support controlled store-to-warehouse quarantine movement and store/warehouse-to-vendor returns, retaining condition at every hop.
- Pre-PT custody movement requires its approved quantity/document/authority contract; ordinary good-stock transfer permission cannot bypass a hold.
- Wrong or excess goods returned to the supplier can use GRN custody without forced PT completion.
- Acceptance of wrong/unidentified goods requires resolved identity, explicit permission and the applicable PT route. Acceptance of damaged goods never makes them good stock.
- Write-off records loss of established value; goods still present remain in physical custody and unavailable.
- Disposal records actual destruction or scrap/recycling handover, with source/custody reference, Site, quantity, method, reason, actor, event/recording times and evidence.
- Allow partial disposal, leaving the balance in quarantine.
- Withdraw quantity from an outstanding RTV commitment before disposing of it.
- Record scrap proceeds separately. Prevent a second recognition of value loss when disposal follows write-off.
- Record pre-PT disposal without creating a fictitious cost, purchase liability or journal.
- Donation or sale as damaged merchandise requires a separately authorised disposition policy; destruction/scrap permissions do not permit it.

## Counter sales and payments

- Bill by scan, search or a size-colour selector from eligible stock.
- Attribute each line to a salesperson separately from the cashier.
- Apply approved offers; require the configured authority and reason for manual discounts or price changes.
- Allocate basket discounts across lines before applying the relevant effective tax and rounding rules.
- Support enabled cash, card, UPI, store-credit and gift-voucher tenders and exact split allocation.
- Start payment allocation as unallocated; total allocated tenders must equal the amount due.
- Record cash received separately from cash tender. An omitted cash-received entry explicitly means exact cash; entered zero means zero.
- Reject insufficient cash, cash-received input without a cash portion, and invalid amounts. Calculate change only on cash.
- Revalidate tender allocation after any item, quantity, offer or price change; stale amounts cannot finalise the revised bill.
- Distinguish manually recorded card/UPI collections from provider-confirmed attempts and from final bank settlement.
- Retain provider references and pending/failed/confirmed outcomes; an uncertain response requires lookup/reconciliation before another charge.
- Make customer phone optional; record consent and permitted use separately.
- Save held carts and support recall with current eligibility/price validation.
- Preserve completed bill items, prices, discounts, taxes, tender allocation, business date, operator and calculation-policy snapshots.
- Search bills by customer, number and date range; include unsynced local bills without duplicating them after sync.
- Reprint the same bill identity. Printer or digital-delivery failure cannot create another sale or delete a completed bill.
- Send permitted digital bills through WhatsApp or SMS.
- Support billed-retained goods paid for but still in store custody, with linked collection/alteration status and protected quantity. Its fulfilment and accounting policy governs issue, pickup, cancellation and release.
- Obtain the required Invoice Reference Number (IRN) evidence before issuing an applicable tax invoice or authorising goods release.

## Customer returns, exchanges and credit

- Maintain an entity-default return policy with explicit Store overrides.
- Configure ordinary and defective-item cases independently, including time limits and permitted refund, exchange, store-credit or refusal outcomes.
- Determine bill-backed entitlement from original paid quantity/value less prior completed or pending returns, not current MRP.
- Prevent concurrent requests from returning the same sold quantity or exceeding its remaining paid-value entitlement.
- Use current prices and offers for replacement goods. Equal value has no difference; higher value collects the difference.
- For a cheaper replacement, apply the configured refund-difference, credit-difference or refusal rule.
- Allow replacement SKUs other than the original unless the configured policy restricts them.
- Determine refund entitlement separately from permitted tender routing; do not infer cash substitution from an exchange.
- Keep approved, pending, failed and confirmed refunds distinct; failed payment remains an outstanding customer obligation.
- Record customer remedy and physical returned condition separately.
- Accept good returned pieces through the site's acceptance rules; quarantine damaged/defective pieces immediately.
- A refused request does not create returned stock through this flow.
- Record refused attempts and reasons within the applicable evidence policy.
- Issue customer-linked store credit with configured validity and cross-store redemption scope. Check and consume the authoritative balance online.
- Keep no-bill returns unavailable without their explicit eligibility, valuation, permission and tender policy.
- Maintain customer purchase history, sizes and preferred brands, with appropriate access.
- Support loyalty earning/redemption and return reversals under configured rules, retaining liability and balance history.

## EBO sales and external billing

- Import brand-software sales, returns, stock and payment reports through saved approved layouts.
- Accept spreadsheets/files or photographed reports; show parsed rows and errors before submission.
- Validate Store, business date, document identities, items, totals and previous imports.
- Mark brand-reported totals separately from independently verified bill evidence.
- Apply approved sales/returns to the operational stock, cash, incentives and reporting records once; never create a second GST invoice for externally issued bills.
- Retain corrections and reversals without losing the original report.
- Alert staff and Operations when an expected daily report is absent.
- Reconcile brand stock with system stock monthly; assign differences for resolution.
- Produce EBO brand-settlement statements and the configured commission/partner basis.
- Support authorised API ingestion where the brand permits access, using the same validation and duplicate controls as file imports.

## Offers, prices and supplier returns

- Support percentage, flat-value, buy-X-get-Y and basket-value offers by brand, item, Store/group and effective dates.
- Require offer approval before activation; retain combination rules, source and brand/company cost shares.
- Use the same evaluation for Running Offers and checkout; show applicable items, dates and combination rules.
- Maintain end-of-season price lists and sale-sticker printing without changing historical sale prices.
- Apply only the tax-rate rules relevant to the merchandise and value basis; highlight material tax effects of discounts.
- Report offer sales, margin impact and who funded the discount.
- Suggest markdown steps using ageing and sell-through, with review before publication.
- Track supplier return eligibility and deadlines by receipt lot and contractual qualifying event.
- Support return reminders, including 30-, 15- and 7-day reminders where the configured schedule applies.
- Build proposed unsold-return lists for approval and picking; preserve exclusions and edited selections.
- Support direct vendor pickup or consolidation through a warehouse, with independently approved legs.
- Keep RTV preparation, reservation, physical departure, vendor handover/receipt and financial follow-up separate.
- Track Initiated, Completed, Cancelled before departure and Closed—partially returned outcomes.
- Record partial-pickup reasons against remaining quantities: vendor rejection, later pickup, goods not ready, withdrawal or another stated reason.
- Record whether another pickup is expected for each remaining portion; Other requires a remark. Keep the RTV Initiated while any quantity awaits departure or any dispatched shipment remains unresolved.
- Explicitly withdraw rejected/abandoned undispatched quantities; closing that balance cannot close a shipment still awaiting confirmation.
- Link replacement goods to a new inbound receipt.
- Maintain one supplier-claims register for shortage, damage, price differences, promotional funding and display support.
- Link debit requests, supplier credit notes, quantities, amounts, application and cash outcome. Physical return does not automatically reduce a payable.
- Produce sale-or-return statements of sold stock and obligations under the approved agreement.

## Finance and accounting

### Ledger and official books

- Maintain an integrated double-entry ledger per accounting book, with chart of accounts, Store/brand cost centres and financial periods.
- Map books through the relevant business unit; support several books and approved inter-book allocations where a bank account serves more than one book.
- Use configured recognition and posting rules for receipts, sales, returns, claims, payments, payroll and adjustments.
- Require balanced journals, source-document links and immutable posted entries; use linked reversals/corrections.
- Keep operational quantities, provisional commercial amounts and accounting recognition distinct.
- Preserve receipt-cost evidence and record later approved cost adjustments separately, including their inventory/COGS effects for goods already sold.
- Reconcile inventory value, receivables, payables, cash, bank and controlling ledger balances.
- Lock financial periods; require authorised reopening for affected posting.
- Provide month-close checklists, owners, due dates, reconciliations and unresolved amounts.
- Tally remains the official book until an authorised accounting-book transition. Keep the internal ledger and external book reconciled.
- Send approved masters before sales, purchases, payments, receipts, journals and credit/debit vouchers through Tally XML.
- Retain acknowledgment, rejection, correction and retry outcomes; require a successful acknowledgment before marking a voucher imported.

### Cash, collections and bank

- Close each Store day using opening cash plus inflows minus outflows, compared with a denomination-based physical count.
- Preserve original count, recount, variance, explanation and supporting evidence.
- Separate sales collections, old-dues recovery, cash transfers and non-cash collections.
- Maintain petty expenses with bill photos, limits, top-up requests and float accountability.
- Track pickup, safe handover and bank deposit; cash remains in transit until the relevant receipt is confirmed.
- Match POS totals to card/UPI provider reports and bank credits, distinguishing gross collection, fees, refunds, withholding and net settlement.
- Import bank CSV/Excel statements without duplicate lines; suggest matches with confidence and support authorised bulk acceptance.
- Route ambiguous or unmatched lines to review rather than forcing a match.
- Retain standard payment references/narrations linking bank movements to Store and purpose.
- Cash counting, provider settlement and bank reconciliation remain separate outcomes.

### Payables, receivables and payments

- Track supplier invoices through capture, matching, approval, payment readiness and settlement, with quantity/price/tax/charge exceptions.
- Preserve duplicate-invoice checks, disputed balances, payment holds, claims and supplier-credit application.
- Keep outright and sale-or-return obligations separately reportable under the approved recognition policy.
- Maintain a consolidated outgoing-payment plan, including recurring rent, salary, utilities, loans and petty-cash needs.
- Propose payment runs by due date, contract and approved claim disposition; produce bank-specific upload files.
- Bind mobile approval to the amount, beneficiary, bank details and reviewed request version.
- Mark a bank payment paid only from bank evidence, and a cash payment paid only from its required handover evidence.
- Keep deposits, advances, loans and floats separate from expenses.
- Forecast cash from planned payments and expected collections.
- Track applicable MSME payment obligations and statutory due dates using verified supplier classification and rules.
- Maintain customer, brand and partner receivables, ageing, partial receipts, advances and unapplied balances.
- Track commission from sales basis to brand invoice, receipt, franchise share and onward payment.
- Do not disburse unreceived onward commission without the configured Owner authority.
- Record expense allocation by Store and brand.

### Tax and assets

- Maintain GST output registers, HSN summaries and return-preparation files.
- Match supplier filings/GSTR-2B to purchase evidence before the authorised input-credit decision.
- Support e-invoice and e-way creation through an approved GST Suvidha Provider (GSP), with status lookup, error ownership and safe retry.
- Keep tax-document issue, cancellation/correction and operational reversals distinct.
- Maintain effective-dated goods classification, rate/value rules, registration applicability and statutory document requirements.
- Support TDS calculations, challan records, statement/certificate preparation and reconciliation for applicable rent, contractor, professional and commission payments.
- Provide a statutory calendar and scoped CA access to reports, comments and document requests.
- Prepare statutory data for authorised filing; do not claim submission merely because an export exists.
- Maintain fixed assets, fit-out capitalisation, depreciation, transfers, disposal and monthly Store net-asset-value snapshots.

## Franchise and partner accounts

- Maintain partner leads, active agreements and exit, with access limited to their authorised Stores and records.
- Record effective royalty, revenue share, commission, minimum guarantee, deposits, credit limits and payment terms.
- Maintain partner ledgers and credit controls.
- Produce monthly statements comparing minimum guarantee and actual entitlement, with assigned discrepancies.
- Apply the agreed contract to franchise dispatch, invoice price, inventory ownership and settlement. Do not infer a purchase-price sale from the Store's franchise label.
- Use the applicable commercial/inter-entity process when ownership changes; an internal transfer cannot silently change owner.

## HRMS and payroll

- Maintain employee identity, legal employer, employment history, joining, transfers, roles, exit and restricted documents.
- Record ID, bank, PAN, PF and ESI details only within authorised workforce scope.
- Support joining/exit checklists and governed final settlement against applicable requirements.
- Capture attendance photo, location, time and registered device without face matching.
- Support supervisor spot checks for sampled events, unusual location and new devices.
- Retain original attendance events; approved regularisation is separate evidence.
- Maintain rosters, shifts, weekly offs, busy-day staffing, leave types/balances and state holiday calendars.
- Configure shift attribution, overtime and payroll-day rules for the relevant employer and staff group.
- Set targets by Store, brand and salesperson.
- Calculate incentives using approved percentage, per-piece, slab, brand-funded and team-pool rules, with attendance eligibility.
- Use both POS and approved EBO evidence; retain salesperson attribution, return reversals and calculation-policy versions.
- Show staff their authorised target and incentive information.
- Track brand-funded incentives as a separately evidenced brand obligation.
- Export approved payroll inputs including days, leave, overtime, incentives, deductions, advances and recoveries.
- Support native payroll and payslips, alongside controlled external payroll exchange.
- Keep input approval, calculation, employer liabilities, payment instructions and actual salary payment distinct.
- Track salary advances/loans and recovery schedules.
- Maintain effective statutory payroll rules, required registers and shop-licence tracking by employer and location.
- Reconcile payroll-period totals and external acknowledgments; a repeated export cannot create a second payroll.

## Exceptions, reports and planning

- Give each unresolved shortage, excess, damage, mismatch, transit gap, cash variance, uncertain payment, missing report or unfinished operation an owner, due date, status, evidence and exposure.
- Resolve through permitted correction, return, reversal or reconciliation; verify the linked business outcome before closure.
- Closing a support ticket cannot settle stock or money. Preserve repeated, reopened and unresolved cases.
- Show exception dashboards by Store, brand and type, with recurring issues highlighted.
- Report sales by Store, brand, category, size, salesperson and hour.
- Report ageing, sell-through, weeks of cover, broken sizes, hot/warm/cold/dead stock and suggested action.
- Report the cost of dead stock, missed supplier returns and commercial-model margins.
- Produce brand-by-store profit and Store P&L using the configured merchandise cost, commission, support and expense allocation bases.
- Give every metric one definition covering eligible states, units, dates, returns, discounts, tax, cost basis and aggregation.
- Separate sales, collections, settlements and profit; show as-of time, estimates and missing data.
- Drill from totals to source evidence; restrict every report and export to permitted data.
- Produce brand sell-through reports and role-specific daily summaries, including the configured 9 PM WhatsApp summary.
- Notify responsible users of cash gaps, large discounts, missing reports, overdue transit and return deadlines.
- Send customer bills and credit information through permitted channels; marketing requires its applicable consent.
- Answer plain-language questions only from the asker's authorised data, with inspectable supporting records.
- Recommend warehouse-to-store replenishment and store-to-store rebalancing using demand, eligible stock, incoming commitments, size gaps and display requirements.
- Provide demand forecasts by style, size and Store, opening-stock proposals for new stores and optional festival/weather signals.
- Qualify missing data, stockouts, sparse/new-item history and uncertain forecasts; provide a manual planning path.
- Preserve baseline, edited proposal, reason, author, approval and accepted/rejected outcome.
- Planning proposals cannot purchase, transfer or change prices without the relevant approval.
- Evaluate forecasting and planning against the configured horizon, baseline, quality measures and operational results.

## Opening, closure, migration and export

- Combine shared Site readiness with separate business-unit approval for receiving, movement and selling.
- Verify mappings, users/access, locations, devices, required policies and stock plan before enabling each activity.
- Empty stock-operating units declare zero opening stock; non-stock offices need no fictitious stock opening.
- Existing stock requires a reviewed manifest, physical verification, authorised variances, an opening PT and Site acceptance.
- Require identity, quantity, location and valuation evidence for opening rows.
- Permit explicitly selected and audited unknown historical season. It matches no season-specific offer and loosens no other opening requirement.
- Preserve original opening evidence and past transaction snapshots when season is later established.
- Opening stock creates no vendor delivery, booking, invoice, purchase liability or automatic accounting entry.
- Import opening supplier/customer dues, advances, deposits and outstanding commercial stock separately; reconcile with the last closed books without double counting.
- Import historical sales for reports only, preserving source identities.
- Keep opening balances, historical reference and live corrections distinct, with defined cutover and reconciliation.
- During closure, stop new operations and settle stock, transit, reservations, custody, staff, cash, dues, books and exceptions.
- Show remaining closure quantities and values by brand and owner.
- Final retirement requires all outstanding items resolved; unresolved items cannot be waived solely to retire a unit.
- Preserve identities and history after closure; reopening requires fresh readiness, mapping and access approval.
- Relocation creates a new linked Site. Renaming does not replace the physical identity.
- Export masters, documents, lines, stock/accounting movements, attachments, mappings and audit history with reconstructible relationships and reconciled totals.
- Retain customer history and in-progress work through migration. Demo-data retirement cannot authorise deletion of real business records.

## Operator experience

- Provide role-specific home screens with relevant numbers, tasks and approvals; daily actions are reachable within three navigation actions.
- Provide scan/search, keyboard shortcuts, saved filters, bulk actions, comments, attachments and drill-through.
- Show state, blocking reason and next action; preserve unfinished work.
- Give Store users Billing, Bills, Till & Sync, Receive Goods, Transfers, Stock, Offers, Money, Reports and staff self-service.
- Give warehouse users expected arrivals, receiving/PT work, labels, putaway, pick/dispatch, supplier returns and counts.
- MBO opening includes attendance, readiness checklist, opening cash and till start; day close includes counted cash, tender reconciliation and closing checklist.
- EBO opening and close include the required reporting checklist, upload status and cash deposit work.
- Accounts workbench combines cash/bank differences, supplier matching, claims, payment proposals, tax errors, Tally errors and close tasks.
- Owner, Booking, Operations, Brand, HR and Admin workbenches expose their respective approvals and operating queues.
- Provide one operational path for each business action. Historical records remain readable without a competing writable ledger.

## Technical platform

### Stack

| Area | Required technology |
| --- | --- |
| Language/runtime | Strict TypeScript; supported Node.js LTS |
| Repository | pnpm workspaces and Turborepo; server, web, shared domain, schemas and UI packages |
| Server | NestJS modular monolith |
| API | REST/JSON, shared Zod schemas, generated OpenAPI and typed client |
| Database | PostgreSQL with constraints, row locks, triggers and row-level security |
| Database access | Drizzle ORM, reviewed SQL migrations, raw SQL for locking and reporting |
| Jobs | pg-boss and a transactional outbox in PostgreSQL |
| Live updates | Server-Sent Events carrying identifiers; authorised refetch |
| Web | React, Vite, TanStack Router/Query/Table, React Hook Form, Zod, Tailwind CSS, shadcn/ui |
| Counter | Chrome/Edge PWA; Dexie/IndexedDB; Workbox |
| Hardware | Keyboard-input scanners, ESC/POS printing and cash drawer via local helper; Tauri only for an unmet hardware requirement |
| Phone | React Native and Expo, sharing domain logic and schemas |
| Authentication | PostgreSQL server sessions, secure cookies, Argon2, OTP and TOTP |
| Files | S3-compatible document/photo interface; MinIO for local development |
| Documents | ExcelJS for supported Excel operations, format-specific import adapters, PDF extraction and HTML-to-PDF |
| Search | PostgreSQL full-text and trigram search |
| AI | Provider-neutral gateway, vision/document adapters, Zod validation and versioned prompts |
| Forecasting | Separate Python forecasting service; the only additional application language |
| Messaging | Email, WhatsApp Business Platform and SMS adapters |
| Diagnostics | pino structured JSON logs and OpenTelemetry-ready traces |
| Verification | Vitest, Playwright, Testcontainers with real PostgreSQL, ESLint and Prettier |

### Module and data boundaries

- Use a separate PostgreSQL database for each independent customer Organisation, containing its legal entities, Sites and books.
- Each module owns its records and exposes a public interface; other modules do not access its tables ad hoc.
- Reports use declared, authorised reporting views or read models through module interfaces, with visible as-of timestamps.
- Share identity/access, configuration, audit, numbering, money/tax calculations, files/imports, inbox, notifications and the AI gateway.
- Provide business modules for merchandise/PT, booking, receiving, stock, POS, EBO imports, offers, supplier returns, finance, partners, HR, exceptions, reports, planning and Site lifecycle.
- Perform synchronous economic effects through module interfaces in one transaction; use the outbox for durable follow-up.
- Write pricing, tax, discount allocation, rounding and incentive logic once in shared TypeScript, usable by server and counter.
- Use UUIDv7 internal identifiers and unique scoped business codes; names are labels.
- Store timezone-aware event/recording timestamps and explicit business dates under the Organisation's timezone.
- Effective-date configuration without overlapping versions in the same scope; preserve the version used by each transaction.
- Protect official document payloads and posted stock/accounting entries from update/delete. Append linked corrections and attributable lifecycle events; rebuildable status projections remain separate.
- Derive stock balances from authoritative movements; rebuild without changing historical facts.
- Enforce balanced journals per book at commit.
- Store INR amounts in integer paise; other enabled currencies use their configured integer minor units. Use decimal arithmetic for intermediate calculations and explicit rounding rules; never use binary floating-point money calculations.
- Preserve explicit currency, units and rounding rules. Unknown values remain distinct from zero.
- Resolve the exact-cash UI shorthand into its declared cash amount before persistence; it is not the general meaning of a missing monetary value.

### Transaction and integration integrity

- Authenticate Organisation and actor, then check role assignment, action, entity/Site/brand and permitted fields.
- Use a scoped idempotency identity. Identical replay returns the original result; changed content under that identity is rejected and retained for investigation.
- Acquire locks in a deterministic order and recheck authority, document version, state, independent approval and quantity under the locks.
- Commit number allocation, stock, monetary records, approval evidence, audit and outbox together or commit none.
- Concurrency cannot oversell, duplicate a return, overlap PT coverage or reserve the same quantity for two movements.
- Treat bank, GST, Tally and messaging acknowledgments as external outcomes, outside the local database transaction.
- Preserve request identities, pending/unknown/failed/succeeded outcomes, authenticated callbacks and safe reconciliation before retry.
- Outbox replay cannot duplicate downstream incentives, vouchers, claims, messages or exceptions.
- Connect TallyPrime through its XML/local gateway with file-export fallback and acknowledgment reconciliation.
- Connect GST through a licensed/approved GSP; use status lookup when IRN or e-way creation has an uncertain result.
- Support bank-specific payment files and CSV/Excel statements, card/UPI settlement imports and provider-specific live terminal adapters.
- Support approved EBO API/file adapters with the same identity and validation rules.
- Adapter replacement cannot alter the meaning of completed business records.

### Offline counter

- Permit offline billing only through one exclusively authorised offline counter per Store.
- Register devices online and allocate a device-specific financial-year bill series; devices cannot share a live series.
- Delegate authority for 24 hours after online renewal. Expiry stops new finalisation without deleting work or releasing potentially consumed stock.
- Cache authorised identities/aliases, eligible quantity, prices, offers and tax versions with a defined validity time. Block finalisation against an expired working set; do not send cost, margin or receipt-origin value to the till.
- Record the working-set and authority versions on every bill.
- Protect delegated selling quantities against central sale, reservation or dispatch until reconciled and explicitly released.
- Before success or printing, commit bill, sequence advance, local quantity effects and pending-sync evidence in one IndexedDB transaction.
- Before that commit, retain a recoverable cart; afterwards, retain an immutable recoverable bill.
- Upload automatically and safely once; keep refused or conflicting bills in a visible reconciliation queue.
- Device replacement requires old-queue reconciliation and a fresh series. A cloned/restored device cannot continue the previous identity.
- Release protected quantity only while online after sequence/queue reconciliation and a durable local and central billing pause.
- Use financial year plus next sequence for pause/release checks, including pauses crossing a year boundary. A missing reply leaves the counter paused.
- Preserve pause through restart; resume only after online confirmation and a full fresh protected stock snapshot.
- Flag and retain a bill received inside a paused interval; never discard it to clear a conflict.
- Restrict returns/exchanges to online authority unless an explicit offline-return policy authorises cached original bills and protected return entitlements.
- Any authorised offline return remains unavailable until synchronised and accepted; never permit duplicate use of the original entitlement.
- Refunds, store-credit redemption, transfers, supplier/bank payment execution and actions needing fresh approval require online authority.
- Enable offline cash/manual-tender recording only under its approved tender policy. It cannot assert online provider confirmation or settle a bank payment.
- Block unknown items, ineligible quantity, expired authority and tax-document-dependent finalisation without the required evidence.
- Handle incorrect clocks, duplicate tabs, full storage, app upgrade, device loss and connection loss without deleting a finalised bill.

### AI, security and operational reliability

- Require password login plus the configured OTP/TOTP verification, using the application's PostgreSQL-backed sessions. Apply configured idle and absolute session expiry and reauthentication for protected actions.
- Send AI requests through the gateway; validate structured output and retain permitted input references, model, prompt version, confidence and cost.
- Keep AI extraction and recommendations as reviewable drafts. Every AI workflow has a manual route.
- AI cannot independently post stock, money or tax.
- Enforce access on APIs, search, reports, exports, files, jobs, notifications, live updates and AI answers, backed by PostgreSQL scope controls.
- Encrypt restricted bank, identity and salary data at rest; mask/exclude fields and keep them out of unauthorised caches and logs.
- Log sign-ins, permission changes and sensitive access; protect audit evidence from unauthorised alteration.
- Revoke lost devices and sessions; offline delegation has a bounded expiry rather than an impossible promise of instant disconnected revocation.
- Apply purpose-specific consent, notices, retention, deletion and legal-hold controls under applicable law.
- Protect employee photos, location evidence, payroll data and customer contact information by role and retention policy.
- Validate file types, sizes and parsing results; imported content cannot execute macros, active scripts or unapproved external links.
- Provide reliable backup, restore verification and export recovery for records and attachments, with defined recovery-time and data-loss objectives.
- Expose failed jobs, stale data, integration failures, missing uploads, stuck sync and recovery status to authorised operators.
- Maintain correlated logs/traces and incident evidence without leaking secrets or unnecessary personal data.
- Pin compatible dependencies and preserve reproducible lockfiles; validate schema changes and module boundaries.
- Type checks, lint, calculation tests, database/concurrency tests and role-specific browser journeys must pass for affected changes.
- Use per-Organisation capability controls; switching on a feature cannot bypass missing policy or stock/accounting invariants.

### Performance

Reference workload: 60 Stores, 500 users, 100 concurrent counters, 200,000 SKUs and five years of history.

| Operation | Target |
| --- | --- |
| Counter barcode lookup | Under 200 ms |
| Online local bill finalisation | Under 1 second |
| Offline durable bill finalisation | Under 300 ms |
| Visible list opening | Under 2 seconds |
| Standard report | Under 5 seconds |
| Parse/map/validate a 10,000-line structured PT import | Under 1 minute |

- Measure against the defined workload, devices and connection conditions.
- External payment/IRN response, AI extraction and human review are separately measured; they are not hidden inside local commit targets.
- Reporting, imports and background work must not delay counter finalisation.
- Show freshness and incomplete results instead of presenting stale data as current.

## Required policy configuration

A policy-dependent operation remains unavailable until its required configuration, authority and evidence are valid. Suggested commercial, financial or permission values are never active defaults.

| Policy | Required definition |
| --- | --- |
| Commercial ownership | Active stock models, legal owner, return rights, recognition and settlement rules by agreement |
| Permissions and approvals | Role/action/field/scope assignments; amount/quantity limits; independent checks; material-change reapproval |
| Source conflicts and pricing | Authoritative cost, MRP, attribute and tax evidence; calculation profiles; unresolved-conflict treatment |
| Merchandise tracking | Product profiles requiring batch/expiry or other tracking; units, pack conversions, required identifiers and expiry eligibility |
| Booking | Commitment, revision, cancellation, delivery-window and outstanding-balance rules |
| Customer returns | Ordinary/defective windows, qualifying date, Store overrides and permitted remedies |
| Refunds and no-bill returns | Tender routing, cash substitution, original-payment restoration, valuation and privileged evidence |
| Billed-retained | Custody, collection, alteration, cancellation, abandonment and financial recognition |
| Financial posting | Recognition, cost formula/adjustment, accounts, book mappings, tolerances, vouchers and acknowledgments |
| Statutory applicability | Registration, goods/rate classification, sale-or-return tax, e-invoice/e-way, TDS and payroll rules |
| Official book | Authority and reconciliation evidence for moving the official book from Tally |
| Franchise/partner | Ownership, dispatch classification/price, commission, royalty, guarantees, credit and settlement |
| Workforce | Employer/state/staff-group pay, leave, overtime, incentives and final-settlement policies |
| Opening and cutover | Verified manifest, financial opening balances, cutoff, outstanding work and sign-off authority |
| Planning | Purpose, horizon, history quality, forecast measures and permitted approval/automation boundaries |
| Offline operation | Permitted tender/return modes, stock and return allocations, device authority and conflict resolution |
| Held-goods outcomes | Pre-PT custody-movement rules, wrong/unidentified acceptance, write-off/disposal authority and value treatment |
| Recovery and retention | Recovery objectives, backup/export verification, retention schedules and legal holds |

## Acceptance conditions

- Invoice/booking quantities never create uncounted physical stock; clean accepted quantity can proceed while damage, excess or identity discrepancies remain held.
- Primary/supplemental PT coverage cannot overlap, and a correction after sale/transfer preserves origins and respects dependent quantities.
- Vendor/direct-store/opening/transfer goods all meet the same selling-Site acceptance and hold checks.
- Missing pre-PT identity/value remains unknown during return, custody movement or disposal; no fictitious layer, zero value or payable is created.
- Damage immediately blocks stock; independent rejection clears only the mistaken damage hold.
- Transfer approval, multiple dispatches, whole-shipment counts, cancellation, shortage/damage and failed-delivery return reconcile every quantity without fake destination receipt.
- Vendor departure alone does not complete an RTV; partial-pickup closure leaves no pending shipment or undispatched reservation.
- Entity return policy and Store override apply correctly; original paid caps, current replacement price, refund state and physical disposition remain separate.
- Concurrent returns and credit redemption cannot spend the same entitlement twice.
- Changed offer totals, cash splits, explicit zero, invalid entry and repeated checkout produce one correctly paid immutable bill; printer failure produces no new sale.
- Offline power loss, restart, expiry, full storage, duplicate tabs, wrong clock, device replacement, repeated upload and year-spanning pause preserve bills, quantities and numbering.
- Duplicate/corrected EBO uploads affect stock, incentives and finance once, retain reported status and create no second GST invoice.
- One physical Site with different business-unit books/registrations retains correct mappings and historical snapshots.
- Opening unknown season excludes season-specific offers; later correction cannot rewrite past bills or labels.
- Closure cannot retire unresolved stock, money or cases; reopening and relocation preserve the correct identities and history.
- Purchase/partial receipt/dispute/credit/payment and sale/return/provider settlement reconcile through operational records, ledgers and Tally.
- Attendance correction, returned-sale incentives and payroll replay preserve raw evidence and one approved period outcome.
- Shared golden cases validate prices, discounts, tax, rounding, incentives and posting; real PostgreSQL concurrency and scoped browser journeys enforce the same rules.
- Backup restoration and complete export reproduce linked records, attachments and control totals without reusing business identities.
