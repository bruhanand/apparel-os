# Apparel OS — Delivery stages
<!-- deps: prd.md#delivery-stages, PRD-LIF-012 — six stages and side-by-side test come from the PRD -->

> **Delivery plan.** Sets the order of work only. If this document disagrees with the PRD or the KDPS policies, they win. See [README.md](README.md).

This document divides the product in [prd.md](prd.md) into six delivery stages and describes how each is tested beside the earlier POS at KDPS. The PRD holds the rules; this document holds only the order of delivery.

## How the stages are cut

- Each stage completes one workflow end to end and replaces one manual habit.
- Stages follow the path of goods and money: set up, goods in, goods move, goods sold, money controlled.
- Design and test the stock and money effects in stage 1 using synthetic data. Every enabled operational stage records its stock and money effects from its first live operation; stage 5 extends those records into full accounting.
- Design offline billing from stage 1, even though it is enabled later.
- HRMS can progress alongside the core once staff and permissions exist.
- Basic operational reports belong in every stage. Forecasting waits for dependable history.
- A stage may be designed, developed and tested with synthetic data before policy signatures. A policy-dependent live operation may be enabled only after the policy is signed and its real values, authorities and evidence are configured and validated. See [kdps-policies.md](kdps-policies.md). The side-by-side test on real KDPS data is not a live operation: it needs KDPS's agreement to hold real data (deployment D-4), not signed policies; gated actions stay disabled until their policies are signed (`DEC-071`).
- A stage ends only when its exit checks pass. Exit checks come from "Acceptance conditions" in the PRD.
- This plan carries no dates. Dates depend on team size, which is not yet set.
- The phone client is not yet placed in a stage.
- Build screens in English first, ready for Hindi: screen text is kept apart from code and layouts allow longer text. The Hindi interface for screens built in stages 1 to 5 arrives in stage 5; stage 6 screens get Hindi in stage 6. WhatsApp and SMS messaging arrive in stage 5.

| Stage | Delivers | Replaces at KDPS |
| --- | --- | --- |
| 1. Shared foundation | Structure, access, products, parties, numbering, audit, recording rules | Scattered master sheets |
| 2. Goods-in | Booking to accepted stock | Excel PT conversion; calls about what arrived |
| 3. Stock movement | Allocation to store receipt, counts, supplier returns, claims | WhatsApp and phone tracking of goods |
| 4. Store day | Opening till to day-close reconciliation | The earlier POS |
| 5. Financial control | Full accounting, Tally, bank, tax, franchise settlement | Retyping into Tally; hand matching of bank lines |
| 6. People and planning | HRMS, incentives, payroll, forecasting | Incentive sheets; hand-built reports |

## Stage 1 — Shared foundation

**Goal.** Build the business structure, users, permissions, products, parties, document numbering, audit history and stock/money recording rules. Prepare opening-data imports here. Load real opening balances only at each Store’s approved cutover, from a physical count, reviewed opening PT and verified financial balances.

**In scope (PRD sections)**

- Organisation, sites and ownership: Organisations, legal entities, tax registrations, books, Sites, Stores, business units, locations and their mappings.
- Site and business-unit readiness for receiving, movement and selling (`PRD-LIF-001`, `PRD-LIF-002`): the readiness record and its gating rules, exercised with synthetic data.
- People, access and approvals: personas, roles, scoped permissions, independent approval, one inbox, audit record.
- Merchandise and identifiers: brands, suppliers and other parties, SKUs, barcodes, units, product proposals.
- Effective-dated commercial terms for brands and suppliers.
- Source conversion and imports: file intake, saved mappings, staging, review, duplicate control.
- Technical platform: stack, module and data boundaries, transaction and integration integrity, login and sessions, access enforcement, encryption, backup and restore.
- Recording rules: stock balances derived from movements, balanced journals per book, chart of accounts, financial periods, posting rules, document numbering.
- Offline design: device registration, device bill series, and pricing, tax, discount allocation and rounding logic shared by server and counter (`PRD-MOD-007`). The shared module also holds incentive logic; its golden cases are completed in stage 6.
- The exception record: owner, due date, status, evidence and exposure.
- Opening-data layouts for stock, dues, advances and deposits.

**Out of scope.** Live Store selling and policy-dependent stock or financial posting. Build and exercise these paths with synthetic data; do not activate them without signed policies and validated production configuration. Opening balances are prepared but not loaded.

**Stock and money records.** None are live yet. Stage 1 fixes the recording rules that every later stage posts under; they are tested here.

**Policies needed before live use.** Permissions and approvals; Merchandise tracking; Financial posting; Recovery and retention. Opening and cutover is needed before the stage 4 pilot switch; its import layouts are built and tested here with sample data.

**Reports.** Master lists, access and audit history, import outcomes.

**Exit checks**

- One physical Site with different business-unit books and registrations keeps correct mappings.
- Shared golden cases for prices, discounts, discount allocation, tax and rounding pass on server and counter code (`PRD-ACP-018`, `PRD-MOD-007`).
- Golden stock-and-posting scenarios on synthetic data pass: receipt, transfer, sale, return and late cost adjustment, under both cost formulas and both cost-pool modes (`PRD-LED-014`, `PRD-LED-015`).
- A backup restores with linked records and attachments.
- An operation whose policy is not configured stays unavailable.
- An activity stays disabled for a Site or business unit until its readiness checks pass (`PRD-LIF-002`).

## Stage 2 — Complete goods-in workflow

**Goal.** Booking/order → physical receipt → discrepancies → PT approval → labels → accepted stock. Include damage holds, corrections and supplier invoice matching in this stage.

**In scope (PRD sections)**

- Booking and buying, except buying suggestions from sales history.
- Receiving and price tickets, including the PT workbench and the KDPS export profile.
- Labels, including piece IDs for piece-tracked goods, barcode verification, acceptance and putaway at the selling Site. A profile changed to piece-tracked after stock exists needs a labelling count first (`PRD-MER-018`).
- Inbound ownership: goods owned under an agreement before receipt, recorded outside stock, with an amount only from invoice or agreement-price evidence, and closed against the receipt count (`PRD-ORG-017` to `PRD-ORG-019`).
- Damage reported at or after receipt: immediate hold, independent confirmation or rejection.
- PT corrections and reversals through linked records.
- Supplier invoice capture and matching against GRN and PT, with quantity, price, tax and charge exceptions.
- Stock search by product, brand, size, barcode, location and condition.
- Receiving is enabled for a Site or business unit only after its readiness approval (`PRD-LIF-001`, `PRD-LIF-002`).
- The side-by-side test import of the earlier POS's daily sales report and SOH, for checking and reports only; it never moves stock (`PRD-LIF-013`, `PRD-LIF-014`). Piece rules at that Store start at its switch (`PRD-MER-017`).

**Out of scope.** Inter-Site transfers, supplier returns, disposal, payment runs.

**Stock and money records.** From its first live operation in this stage: physical custody from the actual count; official PT coverage and receipt cost; ownership from the agreement, with inbound ownership kept outside stock and closed against the receipt count; the supplier obligation under the approved recognition rule.

**Policies needed before live use.** Commercial ownership; Source conflicts and pricing; Booking; Statutory applicability (registration, goods/rate classification, sale-or-return tax); Held-goods outcomes.

**Reports.** Ordered, delivered, outstanding and cancelled by booking; receipt discrepancies; PT lines right first time; supplier fill rate and timeliness; stock by product, size, location, condition and owner.

**Exit checks**

- Invoice or booking quantities never create uncounted physical stock; clean accepted quantity proceeds while damage, excess or identity discrepancies stay held.
- Goods owned before receipt appear as inbound ownership, never as stock; they carry an amount only with invoice or agreement-price evidence, and close against the receipt count (`PRD-ACP-020`).
- Primary and supplemental PT coverage cannot overlap.
- Supplier, direct-store and opening goods meet the same selling-Site acceptance and hold checks.
- Damage immediately blocks stock; independent rejection clears only the mistaken damage hold.
- A side-by-side test import changes no stock: after a daily load, every stock quantity and value in Apparel OS is unchanged (`PRD-LIF-014`).

## Stage 3 — Complete stock-movement workflow

**Goal.** Allocation → transfer → dispatch → store receipt, plus counts, supplier returns and claims. Stock quantities and values must reconcile throughout.

**In scope (PRD sections)**

- Transfers and physical movement: request, independent approval and reservation, dispatch, destination count, acceptance.
- Stock and warehouse control: within-Site moves, full store counts, cycle counts, broken size runs.
- Damage, quarantine and disposal: quarantine movement, write-off, disposal.
- Supplier returns: eligibility and deadlines, proposed return lists, pickup or warehouse consolidation, RTV outcomes.
- The supplier-claims register and its debit requests and credit notes.
- Statutory movement documents recorded and linked; a missing document is an owned compliance exception.
- Movement is enabled for a Site or business unit only after its readiness approval (`PRD-LIF-001`, `PRD-LIF-002`).

**Out of scope.** Recommended replenishment and rebalancing (stage 6). Creation of e-way bills through a GSP (stage 5). Supplier payment (stage 5).

**Stock and money records.** From its first live operation in this stage: every movement keeps receipt origin, PT revision, quantity, ownership and cost; write-off records loss of established value; claims record amounts due from suppliers.

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

- Counter sales and payments. Customer credit waits for receivables in stage 5.
- Customer returns, exchanges and credit, including Store credit, gift vouchers and loyalty.
- Offers and price lists, with one evaluation shared by Running Offers and checkout.
- Store day close: denomination count, variance, petty expenses, cash pickup and deposit.
- EBO sales and external billing imports. EBO brand-settlement statements wait for stage 5.
- Selling is enabled for a Site or business unit only after its readiness approval (`PRD-LIF-001`, `PRD-LIF-002`).
- IRN evidence through a GSP where a tax invoice requires it.
- Tax-document cancellation and correction distinct from operational reversals (`PRD-TAX-004`).
- Store operator experience: Billing, Bills, Till & Sync, opening and closing checklists.
- Offline counter, enabled only under the signed Offline operation policy and after the offline exit check below.
- Earlier-POS-bill returns and EBO returns not linked to their imported sale stay unavailable in the app after a Store's switch until a later plan is approved (`POL-06.02`, `DEC-059`, stock-ledger SL-10). How the customer is served meanwhile is OPEN (product owner).
- The pilot Store switch from the earlier POS, on production hosting only (`PRD-LIF-026`). See "Testing and switch-over".

**Out of scope.** Bank matching, provider settlement matching and Tally vouchers (stage 5). Hindi screens and WhatsApp or SMS bills (stage 5).

**Stock and money records.** From its first live operation in this stage: immutable bills with price, discount, tax and tender snapshots; cash movements; sales and returns posted under the approved rules; Store credit, gift-voucher and loyalty liabilities.

**Policies needed before live use.** Customer returns; Refunds and no-bill returns; Billed-retained; Offers and promotions; Offline operation; Opening and cutover (before the pilot switch); Statutory applicability (invoice-number format, e-invoice; gift-voucher tax, `POL-10.10`; customer-return credit-note treatment, `POL-10.11`).

**Reports.** Sales by Store, brand, category, size, salesperson and hour; day-close variance; offer sales and who funded the discount.

**Exit checks**

- Organisation return policy and authorised Store override apply correctly; original paid caps, current replacement price, refund state and physical disposition stay separate.
- Concurrent returns and credit redemption cannot spend the same entitlement twice.
- Changed offer totals, cash splits, explicit zero, invalid entry and repeated checkout produce one correctly paid immutable bill; printer failure produces no new sale.
- A PT correction after sale or transfer preserves origins and respects dependent quantities.
- Duplicate or corrected EBO uploads affect stock, incentives and finance once and create no second GST invoice.
- Opening unknown season excludes season-specific offers; later correction cannot rewrite past bills or labels.
- A cancelled or corrected tax document stays distinct from the operational reversal of the bill or return (`PRD-TAX-004`).
- Before offline is enabled: power loss, restart, expiry, full storage, duplicate tabs, wrong clock, device replacement, repeated upload and year-spanning pause preserve bills, quantities and numbering.

## Stage 5 — Complete financial control

**Goal.** Extend the financial records already captured into full accounting, Tally integration, bank matching, tax and franchise settlement. Don't wait until here to decide how receipts and sales affect money.

**In scope (PRD sections)**

- Ledger and official books: reconciliations, period locks, month close, Tally XML exchange, net realisable value write-downs (`PRD-LED-007`).
- Cash, collections and bank: provider settlement matching, bank statement import and matching.
- Payables, receivables and payments: payment plans and runs, bank files, supplier-credit application, receivables, commission, and Customer credit at the till.
- Tax and assets: GST registers, GSTR-2B matching, e-way bills through a GSP, TDS, statutory calendar, fixed assets.
- Net asset value and profitability; brand-by-store profit and Store P&L.
- Franchise and partner accounts.
- EBO brand-settlement statements and the configured commission and partner basis (`PRD-EBO-009`).
- Site closure, relocation and complete export.
- Hindi interface for the screens built in stages 1 to 5 (`PRD-PRO-009`).
- WhatsApp and SMS messaging: digital bills, phone and WhatsApp approvals, the daily summary and alerts.

**Out of scope.** Payroll posting (stage 6).

**Stock and money records.** From its first live operation in this stage: no new kinds. The records written since stage 2 are reconciled, closed by period and exchanged with Tally.

**Policies needed before live use.** Official book; Franchise/partner (including the EBO brand commission and settlement basis); Refunds and no-bill returns (Customer credit); Financial posting (Store P&L allocation, asset policy, vouchers and acknowledgments); Statutory applicability (e-way creation, TDS).

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
- Hindi interface for the stage 6 screens: check-in, targets, incentives, payslips, Self-service and planning (`PRD-PRO-009`).

**Order inside the stage**

- Employee records, attendance, rosters and leave can start after stage 1.
- Incentives need sales evidence from stage 4 bills or approved EBO imports (`PRD-HRM-011`).
- Payroll posting needs the books in stage 5.
- Forecasting starts only when the history meets the quality rule in the Planning policy.

**Stock and money records.** From its first live operation in this stage: raw attendance events; incentive calculations with their policy versions; payroll inputs, liabilities and payments kept distinct.

**Policies needed before live use.** Workforce; Planning; Statutory applicability (payroll).

**Reports.** Attendance; target against achievement; incentive statements; forecast accuracy against the baseline.

**Exit checks**

- Attendance correction, returned-sale incentives and payroll replay preserve raw evidence and one approved period outcome.
- Shared golden cases for incentives, including returned-sale reversals and policy versions, pass on the shared logic (`PRD-ACP-018`, `PRD-MOD-007`).
- Planning proposals cannot purchase, transfer or change prices without the relevant approval.
- Forecasts are evaluated against the configured horizon, baseline and quality measures.

## Testing and switch-over

The built system is tested beside the earlier POS before it replaces it. KDPS runs the side-by-side test on the Railway test setup; the earlier POS keeps selling and stays the system of record throughout. A Store switches only after the checks pass and only on production hosting, chosen before the first switch (`PRD-LIF-026`). One Store at a time. The Store switch needs stage 4. Policy 14 names Owner, Accounts and Operations as switch approvers; the date, manifest, balances, cutoff and day-close date, run length and material-difference threshold remain to be set (`POL-14.05`, `POL-14.07`, `POL-14.08`). While the earlier POS is active it does all real billing and nobody scans goods twice; bills made in Apparel OS during the test only test the app.

| Step | What happens | System of record |
| --- | --- | --- |
| Before the test | KDPS agreement to hold real data on the test setup (deployment D-4); load product masters and approved mappings. The side-by-side test is not a live operation and needs no signed policies, but gated actions stay disabled until their policies are signed (`DEC-071`). | Earlier POS |
| Side-by-side test (Railway test setup) | Test the app: goods-in and transfers. Test bills and other gated actions wait for their signed policy (`DEC-071`). Load the earlier POS's end-of-day sales report and SOH for checking and reports only; they never move stock in Apparel OS (`PRD-LIF-014`) | Earlier POS |
| Go or no-go check | No serious exception is open, all participating staff are trained, and Site readiness is verified: mappings, users and access, locations, devices, required policies and stock plan (`PRD-LIF-002`) | Earlier POS |
| Switch day (production hosting) | One pilot Store, at its day close (`PRD-LIF-015`). Stop billing on the earlier POS and take its last SOH; record the cutoff and day-close date; carry unfinished work with its original references (`POL-14.04`, `POL-14.07`). Then run the full Store count (`PRD-STK-008`): physically count stock, label every piece of a piece-tracked profile that has no piece ID and verify every piece ID. Reconcile the count with the earlier POS's last SOH and report every difference (`PRD-LIF-027`), reconcile it against the reviewed opening PT and verified balances, approve the cutover, record the verified count as opening stock (billed-retained items carried across the switch under `POL-14.04` are counted apart and are not opening stock, `PRD-LIF-028`), allocate each billing device its fresh bill series (`PRD-LIF-015`, `PRD-POS-020`), then start billing in Apparel OS | Apparel OS for that Store |
| After the switch | Apparel OS runs for real. The earlier POS is kept for reference only. Other Stores switch one at a time | Apparel OS |

**Rules**

- Switch one pilot Store first, never every Store on one day.
- Never switch a Store on the test setup. It issues no tax invoice and bills no real customer.
- Plan each Store's labelling before its switch day: how many pieces, who labels them, and the label stock needed (`PRD-LIF-025`).
- Write the way back before the switch: the checks that would send the pilot Store back to the earlier POS, who decides, and how bills made in Apparel OS are carried back.
- Avoid double typing. Apparel OS exports the approved PT in the KDPS layout so the earlier POS can load it manually during the test (`DEC-053`). Whether the earlier POS accepts that file remains to be confirmed.
- A side-by-side test import creates no tax invoice and no second sale.
- Decide, before the first Store switch, how a customer with an earlier-POS bill is served during the return window (stock-ledger SL-10; OPEN, product owner).
- Every difference found at the switch count is reported and explained; none is closed by editing a number to match.

**Go or no-go pass marks.** See `POL-14.08`. KDPS sets the run length before the test starts and the material-difference threshold before the first switch. All participating staff must be trained, no serious exception may remain open, and Site readiness must be verified (`PRD-LIF-002`). At each switch, no unexplained material difference may remain between the count and the earlier POS's last SOH.

| Check | Pass mark |
| --- | --- |
| Run length of the side-by-side test | OPEN — KDPS Owner, before the side-by-side test |
| Material-difference threshold per Store, at the switch count | OPEN — KDPS Owner and Accounts, before the first switch |
| Unexplained material differences at the switch count | None |
| Meaning of "serious exception" | OPEN — KDPS Owner and Operations, before the first switch (blocks stage 4) |
| Open serious exceptions | None, as defined by the row above |
| Participating staff trained | All |
| Site readiness: mappings, users and access, locations, devices, required policies and stock plan (`PRD-LIF-002`) | Verified |
| Who signs the switch | Owner, Accounts and Operations |
