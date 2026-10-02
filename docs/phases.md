# Apparel OS — Delivery stages

> **Delivery plan.** Sets the order of work only. If this document disagrees with the PRD or the KDPS policies, they win. See [README.md](README.md).

This document divides the product in [prd.md](prd.md) into six delivery stages and describes how each is tested beside the current system at KDPS. The PRD holds the rules; this document holds only the order of delivery.

## How the stages are cut

- Each stage completes one workflow end to end and replaces one manual habit.
- Stages follow the path of goods and money: set up, goods in, goods move, goods sold, money controlled.
- Design and test the stock and money effects in stage 1 using synthetic data. Every enabled operational stage records its stock and money effects from its first live operation; stage 5 extends those records into full accounting.
- Design offline billing from stage 1, even though it is enabled later.
- HRMS can progress alongside the core once staff and permissions exist.
- Basic operational reports belong in every stage. Forecasting waits for dependable history.
- A stage may be designed, developed and tested with synthetic data before policy signatures. A policy-dependent live operation may be enabled only after the policy is signed and its real values, authorities and evidence are configured and validated. See [kdps-policies.md](kdps-policies.md).
- A stage ends only when its exit checks pass. Exit checks come from "Acceptance conditions" in the PRD.
- This plan carries no dates. Dates depend on team size, which is not yet set.
- The phone client is not yet placed in a stage.
- Build screens in English first, ready for Hindi: screen text is kept apart from code and layouts allow longer text. The Hindi interface and WhatsApp and SMS messaging arrive in stage 5.

| Stage | Delivers | Replaces at KDPS |
| --- | --- | --- |
| 1. Shared foundation | Structure, access, products, parties, numbering, audit, recording rules | Scattered master sheets |
| 2. Goods-in | Booking to accepted stock | Excel PT conversion; calls about what arrived |
| 3. Stock movement | Allocation to store receipt, counts, supplier returns, claims | WhatsApp and phone tracking of goods |
| 4. Store day | Opening till to day-close reconciliation | The current POS |
| 5. Financial control | Full accounting, Tally, bank, tax, franchise settlement | Retyping into Tally; hand matching of bank lines |
| 6. People and planning | HRMS, incentives, payroll, forecasting | Incentive sheets; hand-built reports |

## Stage 1 — Shared foundation

**Goal.** Build the business structure, users, permissions, products, parties, document numbering, audit history and stock/money recording rules. Prepare opening-data imports here. Load real opening balances only at each Store’s approved cutover, from a physical count, reviewed opening PT and verified financial balances.

**In scope (PRD sections)**

- Organisation, sites and ownership: Organisations, legal entities, tax registrations, books, Sites, Stores, business units, locations and their mappings.
- People, access and approvals: personas, roles, scoped permissions, independent approval, one inbox, audit record.
- Merchandise and identifiers: brands, suppliers and other parties, SKUs, barcodes, units, product proposals.
- Effective-dated commercial terms for brands and suppliers.
- Source conversion and imports: file intake, saved mappings, staging, review, duplicate control.
- Technical platform: stack, module and data boundaries, transaction and integration integrity, login and sessions, access enforcement, encryption, backup and restore.
- Recording rules: stock balances derived from movements, balanced journals per book, chart of accounts, financial periods, posting rules, document numbering.
- Offline design: device registration, device bill series, and pricing, tax and rounding logic shared by server and counter.
- The exception record: owner, due date, status, evidence and exposure.
- Opening-data layouts for stock, dues, advances and deposits.

**Out of scope.** Live Store selling and policy-dependent stock or financial posting. Build and exercise these paths with synthetic data; do not activate them without signed policies and validated production configuration. Opening balances are prepared but not loaded.

**Stock and money records from day one.** None are live. The rules that every later stage posts under are fixed and tested here.

**Policies needed before live use.** Permissions and approvals; Merchandise tracking; Financial posting; Recovery and retention. Opening and cutover is needed before the stage 4 pilot switch; its import layouts are built and tested here with sample data.

**Reports.** Master lists, access and audit history, import outcomes.

**Exit checks**

- One physical Site with different business-unit books and registrations keeps correct mappings.
- Shared golden cases for prices, discounts, tax and rounding pass on server and counter code.
- A backup restores with linked records and attachments.
- An operation whose policy is not configured stays unavailable.

## Stage 2 — Complete goods-in workflow

**Goal.** Booking/order → physical receipt → discrepancies → PT approval → labels → accepted stock. Include damage holds, corrections and supplier invoice matching in this stage.

**In scope (PRD sections)**

- Booking and buying, except buying suggestions from sales history.
- Receiving and price tickets, including the PT workbench and the KDPS export profile.
- Labels, including piece IDs for piece-tracked goods, barcode verification, acceptance and putaway at the selling Site.
- Damage reported at or after receipt: immediate hold, independent confirmation or rejection.
- PT corrections and reversals through linked records.
- Supplier invoice capture and matching against GRN and PT, with quantity, price, tax and charge exceptions.
- Stock search by product, brand, size, barcode, location and condition.
- The parallel-run import of the current POS's daily sales report and SOH, so system stock stays true while the current POS sells.

**Out of scope.** Inter-Site transfers, supplier returns, disposal, payment runs.

**Stock and money records from day one.** Physical custody from the actual count; official PT coverage and receipt cost; ownership from the agreement; the supplier obligation under the approved recognition rule.

**Policies needed before live use.** Commercial ownership; Source conflicts and pricing; Booking; Statutory applicability (goods classification and rates); Held-goods outcomes.

**Reports.** Ordered, delivered, outstanding and cancelled by booking; receipt discrepancies; PT lines right first time; supplier fill rate and timeliness; stock by product, size, location, condition and owner.

**Exit checks**

- Invoice or booking quantities never create uncounted physical stock; clean accepted quantity proceeds while damage, excess or identity discrepancies stay held.
- Primary and supplemental PT coverage cannot overlap.
- Supplier, direct-store and opening goods meet the same selling-Site acceptance and hold checks.
- Damage immediately blocks stock; independent rejection clears only the mistaken damage hold.
- System stock after the daily sales load agrees with the current POS's SOH, or each difference is an owned exception.

## Stage 3 — Complete stock-movement workflow

**Goal.** Allocation → transfer → dispatch → store receipt, plus counts, supplier returns and claims. Stock quantities and values must reconcile throughout.

**In scope (PRD sections)**

- Transfers and physical movement: request, independent approval and reservation, dispatch, destination count, acceptance.
- Stock and warehouse control: within-Site moves, full store counts, cycle counts, broken size runs.
- Damage, quarantine and disposal: quarantine movement, write-off, disposal.
- Supplier returns: eligibility and deadlines, proposed return lists, pickup or warehouse consolidation, RTV outcomes.
- The supplier-claims register and its debit requests and credit notes.
- Statutory movement documents recorded and linked; a missing document is an owned compliance exception.

**Out of scope.** Recommended replenishment and rebalancing (stage 6). Creation of e-way bills through a GSP (stage 5). Supplier payment (stage 5).

**Stock and money records from day one.** Every movement keeps receipt origin, PT revision, quantity, ownership and cost; write-off records loss of established value; claims record amounts due from suppliers.

**Policies needed before live use.** Held-goods outcomes (write-off and disposal); Commercial ownership (return rights); Statutory applicability (movement documents).

**Reports.** Goods in transit and overdue transit; count differences; return deadlines; claims register; dead stock and damaged stock.

**Exit checks**

- Transfer approval, multiple dispatches, whole-shipment counts, cancellation, shortage, damage and failed-delivery return reconcile every quantity without a fake destination receipt.
- Transferred goods meet the same selling-Site acceptance and hold checks as supplier goods.
- Missing pre-PT identity or value stays unknown during return, custody movement or disposal.
- Supplier departure alone does not complete an RTV; partial-pickup closure leaves no pending shipment or undispatched reservation.
- Stock quantity and value reconcile from receipt through every movement.

## Stage 4 — Complete store-day workflow

**Goal.** Opening till → sale → payment → return/exchange → day close → reconciliation. Design offline behaviour from the start, even if you enable it later.

**In scope (PRD sections)**

- Counter sales and payments.
- Customer returns, exchanges and credit, including store credit and loyalty.
- Offers and price lists, with one evaluation shared by Running Offers and checkout.
- Store day close: denomination count, variance, petty expenses, cash pickup and deposit.
- EBO sales and external billing imports.
- IRN evidence through a GSP where a tax invoice requires it.
- Store operator experience: Billing, Bills, Till & Sync, opening and closing checklists.
- Offline counter, enabled after online billing is proven.
- The pilot Store switch from the current POS. See "Testing and switch-over".

**Out of scope.** Bank matching, provider settlement matching and Tally vouchers (stage 5). Hindi screens and WhatsApp or SMS bills (stage 5).

**Stock and money records from day one.** Immutable bills with price, discount, tax and tender snapshots; cash movements; sales and returns posted under the approved rules; store-credit and loyalty liabilities.

**Policies needed before live use.** Customer returns; Refunds and no-bill returns; Billed-retained; Offers and promotions; Offline operation; Opening and cutover (before the pilot switch); Statutory applicability (e-invoice).

**Reports.** Sales by Store, brand, category, size, salesperson and hour; day-close variance; offer sales and who funded the discount.

**Exit checks**

- Organisation return policy and authorised Store override apply correctly; original paid caps, current replacement price, refund state and physical disposition stay separate.
- Concurrent returns and credit redemption cannot spend the same entitlement twice.
- Changed offer totals, cash splits, explicit zero, invalid entry and repeated checkout produce one correctly paid immutable bill; printer failure produces no new sale.
- A PT correction after sale or transfer preserves origins and respects dependent quantities.
- Duplicate or corrected EBO uploads affect stock, incentives and finance once and create no second GST invoice.
- Opening unknown season excludes season-specific offers; later correction cannot rewrite past bills or labels.
- Before offline is enabled: power loss, restart, expiry, full storage, duplicate tabs, wrong clock, device replacement, repeated upload and year-spanning pause preserve bills, quantities and numbering.

## Stage 5 — Complete financial control

**Goal.** Extend the financial records already captured into full accounting, Tally integration, bank matching, tax and franchise settlement. Don't wait until here to decide how receipts and sales affect money.

**In scope (PRD sections)**

- Ledger and official books: reconciliations, period locks, month close, Tally XML exchange.
- Cash, collections and bank: provider settlement matching, bank statement import and matching.
- Payables, receivables and payments: payment plans and runs, bank files, supplier-credit application, receivables, commission.
- Tax and assets: GST registers, GSTR-2B matching, e-way bills through a GSP, TDS, statutory calendar, fixed assets.
- Net asset value and profitability; brand-by-store profit and Store P&L.
- Franchise and partner accounts.
- Site closure, relocation and complete export.
- Hindi interface for the screens already built.
- WhatsApp and SMS messaging: digital bills, phone and WhatsApp approvals, the daily summary and alerts.

**Out of scope.** Payroll posting (stage 6).

**Stock and money records from day one.** No new kinds. The records written since stage 2 are reconciled, closed by period and exchanged with Tally.

**Policies needed before live use.** Official book; Franchise/partner; Financial posting (vouchers and acknowledgments); Statutory applicability (TDS).

**Reports.** Trial balance and ledgers; payables and receivables ageing; bank reconciliation; GST registers; Store NAV; brand-by-store profit; Store P&L.

**Exit checks**

- Purchase, partial receipt, dispute, credit and payment, and sale, return and provider settlement, reconcile through operational records, ledgers and Tally.
- One physical Site with different business-unit books and registrations keeps correct mappings and historical snapshots.
- Closure cannot retire unresolved stock, money or cases; reopening and relocation preserve identities and history.
- Complete export reproduces linked records, attachments and control totals without reusing business identities.

## Stage 6 — People and planning

**Goal.** HRMS can progress alongside the core once staff and permissions exist. Basic operational reports belong in every stage; forecasting comes once dependable history is available.

**In scope (PRD sections)**

- HRMS and payroll: employee records, attendance, rosters, leave, targets, incentives, payroll, advances.
- Planning: buying and size suggestions, replenishment and rebalancing recommendations, markdown suggestions, demand forecasts, opening-stock proposals.
- Plain-language questions answered from the asker's authorised data.

**Order inside the stage**

- Employee records, attendance, rosters and leave can start after stage 1.
- Incentives need sales evidence, from the parallel-run import or from stage 4.
- Payroll posting needs the books in stage 5.
- Forecasting starts only when the history meets the quality rule in the Planning policy.

**Stock and money records from day one.** Raw attendance events; incentive calculations with their policy versions; payroll inputs, liabilities and payments kept distinct.

**Policies needed before live use.** Workforce; Planning; Statutory applicability (payroll).

**Reports.** Attendance; target against achievement; incentive statements; forecast accuracy against the baseline.

**Exit checks**

- Attendance correction, returned-sale incentives and payroll replay preserve raw evidence and one approved period outcome.
- Planning proposals cannot purchase, transfer or change prices without the relevant approval.
- Forecasts are evaluated against the configured horizon, baseline and quality measures.

## Testing and switch-over

The built system is tested beside the current system before it replaces it. The current POS keeps selling during the first half of the test. The switch happens mid-way, one Store at a time, and only after the checks pass. The Store switch needs stage 4. Policy 14 names Owner, Accounts and Operations as switch approvers; the date, manifest, balances and quantitative go/no-go pass marks remain to be set.

| Step | What happens | System of record |
| --- | --- | --- |
| Before the test | Load product masters and approved mappings; treat the current POS SOH only as a comparison source, not as proof of physical stock or value | Current |
| First half | Exercise goods-in and transfer workflows in shadow mode. Import the daily sales report and SOH from the current POS as comparison evidence; do not make unverified opening quantities official. Compare stock every day | Current |
| Go or no-go check | Stock and sales agree for the agreed run of days; no serious exception is open; staff are trained | Current |
| Switch day | One pilot Store. At day close: physically count stock, stop billing on the current POS, reconcile the count against the reviewed opening PT and verified balances, approve the cutover, then start billing in Apparel OS | Apparel OS for that Store |
| Second half | Apparel OS runs for real. The current POS is kept for reference only. Other Stores switch one at a time | Apparel OS |

**Rules**

- Switch one pilot Store first, never every Store on one day.
- Write the way back before the switch: the checks that would send the pilot Store back to the current POS, who decides, and how bills made in Apparel OS are carried back.
- Avoid double typing. Apparel OS exports the approved PT in the KDPS layout so the current POS can load it. This depends on the current POS accepting that file and must be confirmed.
- A parallel-run import creates no tax invoice and no second sale.
- Every difference between the two systems becomes an exception with an owner; none is closed by editing a number to match.

**Go or no-go pass marks.** To be set by KDPS before the test starts.

| Check | Pass mark |
| --- | --- |
| Days in a row that system stock agrees with the current POS's SOH | To be set |
| Allowed stock difference per Store | To be set |
| Days in a row that daily sales totals agree | To be set |
| Open serious exceptions | To be set |
| Staff trained at the pilot Store | To be set |
| Who signs the switch | Owner, Accounts and Operations |
