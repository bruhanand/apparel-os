# Apparel OS — Product Requirements Document

> **Rank 1 of 4.** This document wins over the KDPS policies, the design and the code. See [README.md](README.md).

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

### Why this exists

**Who.** The first customer is KDPS Lifestyle Pvt. Ltd. (KDPS). Its work today is spread across four tools that are not connected:

- The POS only sells goods.
- Excel holds every document and report.
- Tally holds the books.
- Phone calls, WhatsApp and email carry the work between people.

There is no single system. Data is scattered, documents are converted by hand and there are no analytics.

**Why.** Organise the business in one place and let software do the manual, repetitive work. People decide; the software records, checks and reminds.

| Today at KDPS | What it costs | What Apparel OS does |
| --- | --- | --- |
| Supplier files are retyped into Excel price tickets | Hours of manual work; wrong prices and labels | Converts the file into a reviewed PT; a person approves it |
| Stock is known through the POS and separate sheets | Nobody has one picture of what is where | Shows stock by product, size, location, condition and owner |
| Transfers and approvals run on WhatsApp and phone calls | No trail; gaps with no owner | Tracked movements, one inbox and recorded approvals |
| Supplier return deadlines are remembered by people | Missed returns; money stuck in unsold stock | Tracks return rights and deadlines; sends reminders |
| Cash, card, UPI and bank entries are matched by hand | Gaps are found late | Matches daily; every gap gets an owner |
| Sales and purchases are typed again into Tally | Double entry and errors | Generates Tally vouchers from approved records |
| Incentives are worked out in sheets | Delay and disputes | Calculates from approved sales and attendance |
| Reports are built by hand from Excel exports | Late numbers; no analytics | One definition per number; reports from live records |

### Words used

Business words:

| Word | Meaning |
| --- | --- |
| Acceptance | Confirmation that goods meet the applicable identity, count, condition, policy and destination checks |
| Accrual | Recording income, expense, assets or obligations when their applicable recognition event occurs, rather than only when cash moves |
| Ageing | How long stock has been held, or how long a due has been unpaid |
| AS, Ind AS | Indian Accounting Standards; Ind AS is the framework notified under the applicable company-law rules |
| BASIC | In the KDPS PT layout, the cost base of a piece before the additions set by the costing profile |
| Booking | A buying order placed with a brand or supplier for a season |
| Business unit | The whole Store or one of several operating units at a Site, mapped to its legal entity, tax registration and accounting book |
| CA | Chartered Accountant |
| COGS | Cost of goods sold: the cost of the pieces sold in a period |
| Consignment | An agreement under which goods are held for sale; ownership and settlement follow the agreement, not the label alone |
| Contra | A Tally voucher for a transfer between accounts within the same legal entity |
| Coverage | Quantity covered by an approved price ticket at a merchandise identity and location |
| Custody | Who physically holds the goods and where, separate from who owns them |
| Cycle count | A count of part of the stock, such as one rack or brand, without a full store count |
| Day close | The end of a Store's business day: counted cash, tender reconciliation and the closing checklist |
| Dead stock | Good unsold stock that is no longer selling |
| Disposal | A record of actual destruction or scrap/recycling handover of goods |
| E-invoice | An electronic tax invoice whose applicable government registration/acknowledgment evidence is linked to the issued invoice |
| E-way bill | The electronic government document required to move goods above a set value |
| EBO | Exclusive-brand outlet: a store selling one brand, billed on the brand's own software |
| ESI | Employees' State Insurance: a statutory health-insurance contribution for staff |
| Exception | A tracked unresolved condition or difference with an owner, due date, status, evidence and exposure |
| FIFO | First-in, first-out inventory cost formula |
| Fill rate | The share of the ordered quantity that the supplier delivered |
| GRN | Goods receipt note: the record of goods physically counted at the receiving Site |
| GSP | GST Suvidha Provider: an approved service connecting software to the government GST system |
| GST | Goods and Services Tax |
| GSTR-2B | The government statement of available input tax credit, built from what suppliers filed |
| Hold | A block that keeps stock from being sold or moved until a question is settled |
| HR, HRMS | Human resources; human resource management system |
| HSN | Harmonised System of Nomenclature: the goods classification code used for GST |
| INR | Indian rupee. One rupee is 100 paise |
| IRN | Invoice Reference Number: the unique number the government e-invoice system gives a tax invoice |
| KDPS | KDPS Lifestyle Pvt. Ltd., the first customer; also the name of its PT column layout |
| Lakh | 100,000 |
| Legal entity | A registered company or other legal person with its own statutory and accounting identity |
| Markdown | A planned price reduction |
| MBO | Multi-brand outlet: a store selling several brands |
| MRP | Maximum retail price: the price printed on the price tag |
| MSME | Micro, Small and Medium Enterprise. Registered MSME suppliers must be paid within legal time limits |
| My work | The user's assigned tasks, approvals and exceptions |
| NAG | Piece count in the KDPS PT layout; always equal to QTY |
| NAV | Net asset value: what a store or business owns minus what it owes on a date |
| Net realisable value | Estimated selling price less the costs required to complete and sell the goods, under the applicable accounting framework |
| Official | Approved to serve as the operational record for the stated fact; official PT coverage does not determine ownership or accounting recognition |
| Offline authority | The time-limited right of a Store's one registered offline counter to finalise bills without a connection; renewed online every 24 hours |
| Open-to-buy | The budget still free to commit to new bookings, by brand and season |
| Organisation | An independent retail business group containing its legal entities and operating network, with data isolated from other Organisations |
| Outright | Commercial terms where goods are bought with no agreed right to return unsold pieces |
| P RATE | Purchase rate: in the KDPS PT layout, the approved cost of a piece at receipt |
| P&L | Profit and loss statement |
| PAN | Permanent Account Number: the income-tax identity number |
| Persona | One of the 14 kinds of work listed in People, access and approvals, each with a short ID. A person can hold several; a persona grants no access |
| PF | Provident Fund: a statutory retirement-savings contribution for staff |
| Piece ID | The unique internal ID of one KDPS-tracked physical piece, printed as a barcode label |
| POS | Point of sale: the billing counter and its software |
| Price tag | The paper tag showing merchandise identity and ticket price; it is not the same as an exception or a PT record |
| PT | Price ticket: a reviewed table of merchandise identity, counted coverage, approved cost, MRP and tax information |
| Putaway | Placing received goods in their storage location |
| QTY | Quantity |
| Quarantine | A hold that keeps damaged, wrong or unidentified goods apart from sellable stock |
| Reservation | Stock set aside for an approved purpose and unavailable for another allocation |
| Role | A named set of permissions, granted to a person through scoped role assignments |
| RTV | Supplier return: goods sent back to a supplier under an agreement or approved claim |
| Sale-or-return | Commercial terms where unsold pieces can go back to the supplier under the agreement |
| SBU | Short for business unit |
| Sell-through | The share of received pieces sold in a period |
| Shop-in-shop | A brand counter operating inside a larger store |
| Site | A physical place with a permanent identity |
| SKU | Stock keeping unit: one merchandise variant, such as one style, colour and size |
| SOH, stock on hand | A quantity reported by a system as in stock; it is a comparison source, not physical verification |
| Store | A trading business at a Site |
| Store credit | A customer-linked balance issued under policy and redeemable within its configured scope and validity |
| Supplier return | A return of goods to a supplier under an agreement or an approved claim |
| Tally | TallyPrime, KDPS’s sole official accounting book unless a separately approved future change occurs |
| TDS | Tax deducted at source |
| Tender | The way a customer pays: cash, card, UPI, store credit or gift voucher |
| Till | The cash counter and its drawer for one billing session |
| UPI | Unified Payments Interface: instant bank-to-bank payment by phone |
| Voucher | An accounting entry in Tally, such as a sale, purchase, payment or journal |
| Weeks of cover | How many weeks the current stock lasts at the current rate of sale |
| Weighted average | Inventory cost formula using the average cost of similar inventory |
| Write-off | An approved record that removes the established accounting value of stock; it does not itself destroy or move the goods |

Technical words:

| Word | Meaning |
| --- | --- |
| AI | Artificial intelligence: software that reads documents and drafts suggestions for a person to review |
| API | Application programming interface: how one program talks to another |
| CSV, XLSX, XLS, XLSB | Spreadsheet file formats |
| ESC/POS | The command language used by receipt printers |
| Idempotency | Sending the same request twice has the effect of sending it once |
| LTS | Long-term support: a software version maintained for a long period |
| ORM | Object-relational mapper: a library that reads and writes database rows from code |
| OTP | One-time password sent to the user |
| Outbox | A database table of follow-up work, saved in the same transaction as the business record |
| PWA | Progressive web app: a web page that installs and works like an app, including offline |
| RBAC | Role-based access control: permissions assigned through scoped role assignments |
| REST/JSON | The common style and data format for web APIs |
| S3 | A widely used interface for storing files |
| SMS | Text message to a phone |
| SQL | The language used to query the database |
| TOTP | Time-based one-time password from an authenticator app |
| UUIDv7 | A unique identifier that sorts by creation time |
| XML | A text data format; Tally imports vouchers in it |

### Business measures

Targets marked proposed are starting goals awaiting KDPS agreement. They are goals, not system settings, and never act as policy defaults. The present value of each measure is recorded during the first month of the test run.

| Measure | How it is counted | Target | Checked | Owner |
| --- | --- | --- | --- | --- |
| Stock-count accuracy | Pieces matching the system at a count ÷ pieces counted, within the configured tolerance for each operating unit | 98% (proposed) | Every count | Operations |
| PT lines right first time | Imported PT lines approved without re-entry or correction ÷ lines imported, once the brand's layout is saved | 90% (proposed) | Monthly | Booking |
| Supplier returns in time | Eligible return value dispatched before its deadline ÷ eligible return value; every missed deadline stays visible | 95% (proposed) | Monthly | Operations |
| Store-days and bank lines explained | Store-days and bank lines with a match or an assigned exception by the next working day ÷ all store-days and bank lines | 100% (proposed) | Daily | Accounts |
| Tally import rejection | Vouchers rejected by Tally ÷ vouchers sent | Less than 2% | Monthly | Accounts |
| Tally manual entry | Vouchers typed by hand for records the system holds | Zero (proposed) | Monthly | Accounts |
| Monthly brand-by-store profit | Working day on which it is available, with incomplete inputs identified | Fifth working day | Monthly | Accounts |
| Incentives without a side sheet | Incentive amounts calculated from approved sales and attendance records ÷ all incentive amounts paid | 100% (proposed) | Each payroll period | HR |
| Backup and restore | Most data that can be lost; time to restore service | 15 minutes; 4 hours (proposed) | Each restore test | Admin |

### Delivery stages

The product is delivered in six stages. Each stage completes one workflow end to end. The full plan, the test run and the switch from the current system are in [phases.md](phases.md).

| Stage | Delivers |
| --- | --- |
| 1. Shared foundation | Business structure, users, permissions, products, parties, document numbering, audit history, and stock/money recording rules |
| 2. Goods-in | Booking/order → physical receipt → discrepancies → PT approval → labels → accepted stock |
| 3. Stock movement | Allocation → transfer → dispatch → store receipt, plus counts, supplier returns and claims |
| 4. Store day | Opening till → sale → payment → return/exchange → day close → reconciliation |
| 5. Financial control | Full accounting, Tally integration, bank matching, tax and franchise settlement |
| 6. People and planning | HRMS alongside the core; forecasting once dependable history exists |

- Basic operational reports belong in every stage.
- Each stage records its stock and money effects from the start; stage 5 extends those records into full accounting.

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

| ID | Persona | Work supported |
| --- | --- | --- |
| P-OWN | Owner | Business results, significant approvals, payments, offers and losses |
| P-ADM | Admin | Users, permissions, masters, configuration and integration administration |
| P-ACC | Accounts | Cash, bank, payables, receivables, claims, tax, journals, Tally and period close |
| P-CHA | Chartered Accountant (CA) | Authorised book/report access, comments and document requests |
| P-BKG | Booking | Buying plans, bookings, deliveries, merchandise and price-ticket preparation |
| P-OPS | Operations | Distribution, transfers, counts, exceptions and Site lifecycle |
| P-WHS | Warehouse | Receiving, labels, putaway, picking, dispatch and supplier returns |
| P-BRM | Brand manager | Brand performance, assortment, pricing, offers and brand reporting |
| P-STM | Store manager | Store operation, authorised discounts/returns and day close |
| P-CSH | Cashier | Billing, tender recording and authorised customer returns |
| P-SLS | Salesperson | Sale attribution, targets and own incentive information |
| P-EBO | EBO staff | Brand-report uploads, stock handling and petty cash |
| P-HRS | HR | Employee records, attendance, rosters, leave, incentives and payroll |
| P-AUD | Auditor | Scoped read-only records and audit evidence |

- Allow a person to hold several roles, with explicit action, entity, Site, brand and field permissions.
- Allow a person to hold several personas. Personas set home screens, menus and summaries; only role assignments grant access.
- Keep work placement separate from access. A persona does not itself grant a transaction or approval.
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
- Assign a unique internal ID to each KDPS-tracked physical piece, even when identical pieces share a supplier barcode. Preserve that piece identity through custody, PT coverage, sale, return and count.
- Maintain season, collection, launch date, gender, fabric, fit, category, HSN and applicable merchandise attributes.
- Preserve unknown values. Missing size is distinct from an explicitly supplied Free Size.
- Map external barcodes and supplier codes to the correct SKU and unit, with scope and validity dates. Identical pieces may share an external barcode; their internal piece IDs remain distinct.
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

- Provide one Receive Goods inbox per Site, combining supplier deliveries and incoming transfer dispatches, with Pending and History views.
- Start supplier receiving through Goods arrived or Receive against booking; both open the same guided workflow.
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
- Record acceptance and putaway by the people authorised at the actual destination; supplier-supplied tags still require verification.

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
- Keep internal transfers, returns to supplier (RTV) and commercial sales to partners distinct.
- Present allowed destinations by name/code without granting access to their operational data. Ordinary internal movement remains within its authorised legal-entity boundary.
- Use request/draft → independent higher-authority approval and reservation → dispatch → destination count → acceptance.
- At approval, ordinary transfers require official PT coverage, source acceptance and available unreserved quantity. Bind reservations to the reviewed source/custody references and condition.
- Recheck dispatch eligibility against that movement's reservation without clearing existing holds. Controlled quarantine or incomplete-custody routes require their separate authority.
- Approval reserves reviewed quantities at source and prevents competing allocation or sale.
- An undispatched reservation has no automatic expiry. Release it only by actual dispatch or explicit cancellation.
- Changing items, increasing quantity or changing destination requires renewed approval. A smaller dispatch leaves the remainder reserved.
- Support several dispatches against one approved movement. Each records actual quantities, source references, departure time, recording time, actor and transport evidence.
- Derive transfer documentation for registered stock from its source origins; do not create a new supplier purchase or apply markup again.
- Record actual dispatch and arrival separately and safely once. Pending destination visibility is not physical receipt.
- Receive each dispatch as one whole shipment. Separate dispatches can arrive separately; staged partial receipt within one dispatch is outside this movement contract.
- An unfinished scan session stays unfinished; it cannot silently short-close the shipment.
- Record expected and actual good, damaged, wrong, unidentified, excess and missing quantities. Damage is not shortage, and absent goods do not enter quarantine.
- Release eligible good quantities independently of disputed portions.
- Preserve explicit discrepancy resolution before missing or disputed quantities count as accounted for.
- If delivery fails and goods return, record actual receipt at the source linked to the dispatch, with condition and evidence; preserve the failed destination outcome.
- For internal dispatch, completion requires destination accounting for its quantities. For direct supplier pickup, it requires confirmed handover. For delivery to a supplier, it requires confirmed supplier receipt.
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
- Support controlled store-to-warehouse quarantine movement and store/warehouse-to-supplier returns, retaining condition at every hop.
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

- Maintain an Organisation return policy with Store-specific overrides only when explicitly authorised by the Organisation. Snapshot the policy that applied to each sale.
- KDPS’s ordinary apparel and footwear return window is 15 days from customer handover. The Organisation may edit its policy. A Store-specific override must be explicitly authorised by the Organisation and effective-dated. The defective-item cutoff remains to be decided.
- Configure ordinary and defective-item cases independently, including permitted refund, exchange, store-credit or refusal outcomes.
- For defective goods, assess separately and support replacement, repair where appropriate, or refund under applicable consumer rights and warranties; do not force store credit where a refund is owed.
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
- Support direct supplier pickup or consolidation through a warehouse, with independently approved legs.
- Keep RTV preparation, reservation, physical departure, supplier handover/receipt and financial follow-up separate.
- Track Initiated, Completed, Cancelled before departure and Closed—partially returned outcomes.
- Record partial-pickup reasons against remaining quantities: supplier rejection, later pickup, goods not ready, withdrawal or another stated reason.
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
- Support lower-of-cost-and-net-realisable-value write-downs under applicable rules.
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

### Net asset value and profitability

**Net asset value (NAV)** is what the store or business owns minus what it owes, on a particular date.

Assets:

- Stock/inventory value
- Refundable security deposits paid
- Fixtures and other fixed assets, after accumulated depreciation
- Debtors: money customers or others owe you
- Cash and bank balances

Minus liabilities:

- Creditors: money owed to suppliers
- Outstanding loans
- Unpaid expenses, interest and taxes
- Security deposits received that must be returned

NAV = Total assets − Total liabilities

Example: ₹20 lakh assets − ₹8 lakh liabilities = ₹12 lakh NAV

**Profitability** is how much the store or business earned or lost over a period.

- Sales after returns and discounts, excluding GST
- Minus cost of the goods sold = Gross profit
- Minus operating expenses such as rent, salaries, electricity and allocated head-office expenses
- Minus depreciation and interest, plus other income = Profit before tax
- Minus applicable income-tax expense = Net profit

Example: ₹10 lakh net sales − ₹6 lakh goods cost − ₹3 lakh expenses, depreciation, interest and tax = ₹1 lakh net profit

- Stock/inventory value counts owned goods only; third-party-owned goods are excluded under the ownership rules.
- These definitions govern the monthly Store net-asset-value snapshots and the Store P&L.

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
- Produce brand sell-through reports and persona-specific daily summaries, including the configured 9 PM WhatsApp summary.
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
- Opening stock creates no supplier delivery, booking, invoice, purchase liability or automatic accounting entry.
- Import opening supplier/customer dues, advances, deposits and outstanding commercial stock separately; reconcile with the last closed books without double counting.
- Import historical sales for reports only, preserving source identities.
- Keep opening balances, historical reference and live corrections distinct, with defined cutover and reconciliation.
- Support a parallel run in which the existing external POS remains the selling system for a Store.
- During a parallel run, import that POS's daily sales report and stock-on-hand (SOH) report through saved approved layouts, with the same validation and duplicate controls as EBO imports. Apply each sale and return to stock once.
- Compare the reported SOH with system stock each day; each difference becomes an owned exception.
- Switch each Store over at a day close, with verified balances and a fresh bill series. After the switch, the earlier POS is kept for reference only.
- A parallel-run import never creates a tax invoice or a second sale for an externally issued bill.
- During closure, stop new operations and settle stock, transit, reservations, custody, staff, cash, dues, books and exceptions.
- Show remaining closure quantities and values by brand and owner.
- Final retirement requires all outstanding items resolved; unresolved items cannot be waived solely to retire a unit.
- Preserve identities and history after closure; reopening requires fresh readiness, mapping and access approval.
- Relocation creates a new linked Site. Renaming does not replace the physical identity.
- Export masters, documents, lines, stock/accounting movements, attachments, mappings and audit history with reconstructible relationships and reconciled totals.
- Retain customer history and in-progress work through migration. Demo-data retirement cannot authorise deletion of real business records.

## Operator experience

- Provide persona-specific home screens with relevant numbers, tasks and approvals; daily actions are reachable within three navigation actions.
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
- Require returns and exchanges to use online authority. Do not enable an offline return or refund flow.
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
- Type checks, lint, calculation tests, database/concurrency tests and persona-specific browser journeys must pass for affected changes.
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

Decided by names the personas that set and approve the policy. Needed by stage marks when its policy-dependent live operations may be enabled, not when design, development or synthetic-data tests may begin. Live activation requires a signed policy and validated real configuration; see [phases.md](phases.md). KDPS's answers are kept in [kdps-policies.md](kdps-policies.md).

| Policy | Required definition | Decided by | Needed by stage |
| --- | --- | --- | --- |
| Commercial ownership | Active stock models, legal owner, return rights, recognition and settlement rules by agreement | Owner, Accounts | 2 |
| Permissions and approvals | Role/action/field/scope assignments; amount/quantity limits and refund-approval cases; independent checks; count variance tolerance/approval and movement during counts; exception owner/due/escalation and alert recipients; 9 PM summary recipients/channels; session settings; material-change reapproval | Owner, Admin | 1 |
| Source conflicts and pricing | Authoritative cost, MRP, attribute and tax evidence; calculation profiles; unresolved-conflict treatment | Booking, Accounts | 2 |
| Merchandise tracking | Product profiles requiring batch/expiry or other tracking; units, pack conversions, required identifiers and expiry eligibility | Booking, Operations | 1 |
| Booking | Commitment, revision, cancellation, delivery-window and outstanding-balance rules | Owner, Booking | 2 |
| Customer returns | Ordinary/defective windows, qualifying date, authorised Store overrides, permitted remedies, Store-credit and loyalty settings | Owner, Operations | 4 |
| Refunds and no-bill returns | Enabled online tenders, original-tender routing, no-bill eligibility/valuation and privileged evidence; Store credit and gift-voucher issuance/redemption rules; required customer notice/consent | Owner, Accounts | 4 |
| Billed-retained | Custody, collection, alteration, cancellation, abandonment and financial recognition | Operations, Accounts | 4 |
| Financial posting | Recognition, cost formula/adjustment, accounts, book mappings, rounding/invoice tolerances, petty-cash float/limits, vouchers and acknowledgments | Accounts, CA | 1; vouchers and acknowledgments by 5 |
| Statutory applicability | Registration, goods/rate classification, sale-or-return tax, e-invoice/e-way, TDS and payroll rules | Accounts, CA | 2; e-invoice by 4, TDS by 5, payroll by 6 |
| Official book | Authority and reconciliation evidence for moving the official book from Tally | Owner, CA | 5 |
| Franchise/partner | Ownership, dispatch classification/price, commission, royalty, guarantees, credit and settlement | Owner, Accounts | 5 |
| Workforce | Employer/state/staff-group pay, leave, overtime, incentives and final-settlement policies | Owner, HR | 6 |
| Opening and cutover | Verified manifest, financial opening balances, cutoff, outstanding work and sign-off authority | Owner, Accounts, Operations | 1; signed before the pilot switch |
| Planning | Purpose, horizon, history quality, forecast measures and permitted approval/automation boundaries | Owner, Booking | 6 |
| Offline operation | Permitted offline tenders and their evidence, stock allocations, device authority and conflict resolution | Owner, Operations | 4 |
| Held-goods outcomes | Pre-PT custody movement, wrong/unidentified acceptance, write-off/disposal authority/value, and any separate authorised donation/sale route for damaged goods | Owner, Operations, Accounts | 2; write-off and disposal by 3 |
| Recovery and retention | Recovery objectives, backup/export verification, retention schedules and legal holds | Owner, Admin | 1 |

## Acceptance conditions

- Invoice/booking quantities never create uncounted physical stock; clean accepted quantity can proceed while damage, excess or identity discrepancies remain held.
- Primary/supplemental PT coverage cannot overlap, and a correction after sale/transfer preserves origins and respects dependent quantities.
- Supplier, direct-store, opening and transfer goods all meet the same selling-Site acceptance and hold checks.
- Missing pre-PT identity/value remains unknown during return, custody movement or disposal; no fictitious layer, zero value or payable is created.
- Damage immediately blocks stock; independent rejection clears only the mistaken damage hold.
- Transfer approval, multiple dispatches, whole-shipment counts, cancellation, shortage/damage and failed-delivery return reconcile every quantity without fake destination receipt.
- Supplier departure alone does not complete an RTV; partial-pickup closure leaves no pending shipment or undispatched reservation.
- Organisation return policy and authorised Store override apply correctly; original paid caps, current replacement price, refund state and physical disposition remain separate.
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
