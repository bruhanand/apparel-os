# Apparel OS — Product Requirements Document

> **Rank 1 of 4.** This document wins over the KDPS policies, the design and the code. See [README.md](README.md).

> **IDs.** Every requirement bullet starts with an ID, such as `PRD-STK-003`.
>
> - `PRD` means this document. The three letters name the section. The number is the next free number in that section when the bullet was added. Bullets are never renumbered, so the order on the page need not follow the numbers.
> - An ID never changes and is never reused. A removed bullet's ID is retired.
> - The bullets under "Why this exists" describe KDPS today and have no ID.
> - Retired IDs: `PRD-RET-002` (DEC-010), `PRD-EXC-022` (DEC-026), `PRD-LIF-024` (DEC-030).

| Prefix | Section |
| --- | --- |
| PRO | Product |
| STG | Delivery stages |
| ORG | Organisation, sites and ownership |
| ACS | People, access and approvals |
| MER | Merchandise and identifiers |
| IMP | Source conversion and imports |
| BKG | Booking and buying |
| REC | Receiving and price tickets |
| PTW | PT workbench |
| STK | Stock and warehouse control |
| TRF | Transfers and physical movement |
| DMG | Damage, quarantine and disposal |
| POS | Counter sales and payments |
| RET | Customer returns, exchanges and credit |
| EBO | EBO sales and external billing |
| OFR | Offers, prices and supplier returns |
| LED | Ledger and official books |
| CSH | Cash, collections and bank |
| PAY | Payables, receivables and payments |
| TAX | Tax and assets |
| NAV | Net asset value and profitability |
| FRN | Franchise and partner accounts |
| HRM | HRMS and payroll |
| EXC | Exceptions, reports and planning |
| LIF | Opening, closure, migration and export |
| UXP | Operator experience |
| MOD | Module and data boundaries |
| INT | Transaction and integration integrity |
| OFF | Offline counter |
| SEC | AI, security and operational reliability |
| PRF | Performance |
| ACP | Acceptance conditions |

## Product

Apparel OS runs purchasing, receiving, stock, selling, finance, workforce management and planning for retail businesses selling clothing, footwear and packaged goods. It connects offices, warehouses, multi-brand outlets (MBO), exclusive-brand outlets (EBO) and franchise operations in one system.

- `PRD-PRO-001` Show stock by product, size, location, condition and owner.
- `PRD-PRO-002` Convert supplier files into reviewed merchandise and price-ticket records.
- `PRD-PRO-003` Track supplier commitments, return rights, claims and settlement.
- `PRD-PRO-004` Reconcile sales, cash, electronic collections and bank movements.
- `PRD-PRO-005` Maintain a double-entry ledger and exchange approved vouchers with Tally.
- `PRD-PRO-006` Connect attendance, sales attribution, targets, incentives and payroll.
- `PRD-PRO-007` Preserve stock, money, staff and document history through openings, closures and relocation.
- `PRD-PRO-008` Provide operational reports, profit analysis and human-approved planning recommendations.
- `PRD-PRO-009` Support English and Hindi interfaces, counter and office PCs, and a phone client.
- `PRD-PRO-010` Online storefronts, marketplace order management, automatic government-return filing and facial recognition are outside the product scope. EBO brand billing software remains an external system whose reports are imported.

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
| Bank transfer | A customer payment sent directly between bank accounts, confirmed by bank/provider evidence |
| Billed-retained | Goods paid for but still held in the Store until handover to the customer, for collection or alteration. Not a hold. Not available for sale or allocation |
| Billing device | A registered device that issues bills and holds its own bill series (`PRD-POS-020`, `PRD-OFF-002`) |
| Booking | A buying order placed with a brand or supplier for a season |
| Business unit | The whole Store or one of several operating units at a Site, mapped to its legal entity, tax registration and accounting book |
| CA | Chartered Accountant |
| COGS | Cost of goods sold: the cost of the pieces sold in a period |
| Consignment | An agreement under which goods are held for sale; ownership and settlement follow the agreement, not the label alone |
| Contra | A Tally voucher for a transfer between accounts within the same legal entity |
| Cost layer | Under FIFO, a quantity that entered a cost pool together at one cost; the oldest layer is issued first |
| Cost pool | The stock over which a cost formula runs: each SKU across an accounting book, or each SKU at each Site, as configured per book |
| Coverage | Quantity covered by an approved price ticket at a merchandise identity and location |
| Crore | 100 Lakh (10,000,000). L and Cr are display shortcuts for Lakh and Crore |
| Customer credit | An approved amount the customer may pay later under a configured limit and due date; distinct from Store credit |
| Custody | Who physically holds the goods and where, separate from who owns them |
| Cycle count | A count of part of the stock, such as one rack or brand, without a full store count |
| Day close | The end of a Store's business day: counted cash, tender reconciliation and the closing checklist |
| Dead stock | Good unsold stock that is no longer selling |
| Disposal | A record of actual destruction or scrap/recycling handover of goods |
| E-invoice | An electronic tax invoice whose applicable government registration/acknowledgment evidence is linked to the issued invoice |
| E-way bill | The electronic government document required to move goods above a set value |
| Earlier POS | The POS a Store used before its switch to Apparel OS; reference only after the switch (`PRD-LIF-015`) |
| EBO | Exclusive-brand outlet: a store selling one brand, billed on the brand's own software |
| ESI | Employees' State Insurance: a statutory health-insurance contribution for staff |
| Exception | A tracked unresolved condition or difference with an owner, due date, status, evidence and exposure |
| FIFO | First-in, first-out inventory cost formula |
| Fill rate | The share of the ordered quantity that the supplier delivered |
| Gift voucher | A bearer voucher issued by the Organisation, identified by a unique code and redeemable as a tender within its configured validity |
| GRN | Goods receipt note: the record of goods physically counted at the receiving Site |
| GSP | GST Suvidha Provider: an approved service connecting software to the government GST system |
| GST | Goods and Services Tax |
| GSTR-2B | The government statement of available input tax credit, built from what suppliers filed |
| Higher authority | An approver who is a different person from the preparer and whose approval limit covers the action on its value basis (`PRD-ACS-015`, `PRD-ACS-016`) |
| Hold | A block that keeps stock from being sold or moved until a question is settled |
| HR, HRMS | Human resources; human resource management system |
| HSN | Harmonised System of Nomenclature: the goods classification code used for GST |
| Inbound ownership | Ownership of goods acquired under an agreement before they are counted at the receiving Site; it is not stock |
| INR | Indian rupee. One rupee is 100 paise |
| IRN | Invoice Reference Number: the unique number the government e-invoice system gives a tax invoice |
| KDPS | KDPS Lifestyle Pvt. Ltd., the first customer; also the name of its PT column layout |
| Lakh | 100,000. L is a display shortcut |
| Legal entity | A registered company or other legal person with its own statutory and accounting identity |
| Markdown | A planned price reduction |
| MBO | Multi-brand outlet: a store selling several brands |
| Movement | An append-only record of a change in stock quantity, place, condition, custody, ownership or value. Stock balances are derived from movements |
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
| Piece ID | The unique internal ID of one piece-tracked physical piece, printed as a barcode label |
| Piece-tracked | Merchandise whose tracking profile requires a piece ID for every physical piece |
| Pilot Store | The first Store to switch (`POL-14.07`) |
| POS | Point of sale: the billing counter and its software |
| Price tag | The paper tag showing merchandise identity and ticket price; it is not the same as an exception or a PT record |
| PT | Price ticket: a reviewed table of merchandise identity, counted coverage, approved cost, MRP and tax information |
| Putaway | Placing received goods in their storage location |
| QTY | Quantity |
| Quarantine | A hold that keeps damaged, wrong or unidentified goods apart from sellable stock |
| Receipt origin | The counted receipt, opening stock or other counted source a quantity of stock came from. It carries its PT revision, ownership and cost through every move |
| Reservation | Stock set aside for an approved purpose and unavailable for another allocation |
| Retail site | A Site where one or more Stores trade |
| Role | A named set of permissions, granted to a person through scoped role assignments |
| RTV | Supplier return: goods sent back to a supplier under an agreement or approved claim |
| Sale-or-return | Commercial terms where unsold pieces can go back to the supplier under the agreement |
| SBU | Short for business unit |
| Sell-through | The share of received pieces sold in a period |
| Shop-in-shop | A Store format: the Organisation's own Store trading inside another business's premises. A brand counter inside the Organisation's own Store is a business unit of that Store, not a shop-in-shop |
| Side-by-side test | The period in which the earlier POS stays the selling system for a Store while Apparel OS is tested beside it (`PRD-LIF-012`, `PRD-LIF-026`) |
| Site | A physical place with a permanent identity |
| SKU | Stock keeping unit: one merchandise variant, such as one style, colour and size |
| SOH, stock on hand | A quantity reported by a system as in stock; it is a comparison source, not physical verification |
| Store | A trading business at a Site |
| Store credit | A customer-linked balance issued under policy and redeemable within its configured scope and validity |
| Supplier return | A return of goods to a supplier under an agreement or an approved claim |
| Switch | The day-close change at which a Store stops billing on the earlier POS and starts in Apparel OS (`PRD-LIF-015`) |
| Switch count | The full Store count taken at a Store's switch; its verified count becomes opening stock (`PRD-LIF-025`, `PRD-LIF-027`) |
| Tally | TallyPrime, an external accounting book. Whether it is the official book is set by the Official book policy |
| TDS | Tax deducted at source |
| Tender | The way a customer pays: cash, card, UPI, Bank transfer, Store credit, Gift voucher or approved Customer credit |
| Till | The cash counter and its drawer for one billing session |
| UPI | Unified Payments Interface: instant bank-to-bank payment by phone |
| Voucher | An accounting entry in Tally, such as a sale, purchase, payment or journal |
| Weeks of cover | How many weeks the current stock lasts at the current rate of sale |
| Weighted average | Inventory cost formula using the average cost of similar inventory, recalculated each time goods enter the cost pool (moving weighted average) |
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

Targets marked proposed are starting goals awaiting KDPS agreement. They are goals, not system settings, and never act as policy defaults. The present value of each measure is recorded during the side-by-side test.

| Measure | How it is counted | Target | Checked | Owner |
| --- | --- | --- | --- | --- |
| Stock-count accuracy | Pieces equal to the system quantity at a count ÷ pieces counted, for each operating unit; differences are tracked by approver tier | 98% (proposed) | Every count | Operations |
| PT lines right first time | Imported PT lines approved without re-entry or correction ÷ lines imported, once the brand's layout is saved | 90% (proposed) | Monthly | Booking |
| Supplier returns in time | Eligible return value dispatched before its deadline ÷ eligible return value; every missed deadline stays visible | 95% (proposed) | Monthly | Operations |
| Store-days and bank lines explained | Store-days and bank lines with a match or an assigned exception by the next working day ÷ all store-days and bank lines | 100% (proposed) | Daily | Accounts |
| Tally import rejection | Vouchers rejected by Tally ÷ vouchers sent | Less than 2% (proposed) | Monthly | Accounts |
| Tally manual entry | Vouchers typed by hand for records the system holds | Zero (proposed) | Monthly | Accounts |
| Monthly brand-by-store profit | Working day on which it is available, with incomplete inputs identified | Fifth working day (proposed) | Monthly | Accounts |
| Incentives without a side sheet | Incentive amounts calculated from approved sales and attendance records ÷ all incentive amounts paid | 100% (proposed) | Each payroll period | HR |
| Backup and restore | Most data that can be lost; time to restore service | 15 minutes; 4 hours (proposed) | Each restore test | Admin |

### Delivery stages

The product is delivered in six stages. Each stage completes one workflow end to end. The full plan, the side-by-side test and the switch from the earlier POS are in [phases.md](phases.md).

| Stage | Delivers |
| --- | --- |
| 1. Shared foundation | Business structure, users, permissions, products, parties, document numbering, audit history, and stock/money recording rules |
| 2. Goods-in | Booking/order → physical receipt → discrepancies → PT approval → labels → accepted stock |
| 3. Stock movement | Allocation → transfer → dispatch → store receipt, plus counts, supplier returns and claims |
| 4. Store day | Opening till → sale → payment → return/exchange → day close → reconciliation |
| 5. Financial control | Full accounting, Tally integration, bank matching, tax and franchise settlement |
| 6. People and planning | HRMS alongside the core; forecasting once dependable history exists |

- `PRD-STG-001` Basic operational reports belong in every stage.
- `PRD-STG-002` Each stage records its stock and money effects from the start; stage 5 extends those records into full accounting.

## Organisation, sites and ownership

- `PRD-ORG-001` Keep Organisation, legal entity, tax registration, accounting book, Site, Store, business unit and internal stock location as separate records.
- `PRD-ORG-002` An Organisation is an independent retail business group containing its legal entities and operating network. Its data is isolated from other Organisations.
- `PRD-ORG-003` A Site is a physical place with a permanent identity and site code. A Store is a trading business at a Site, with a separate store code, name and history.
- `PRD-ORG-004` A business unit, or SBU, is the whole Store or one of several units within it. Offices and warehouses can also have business units.
- `PRD-ORG-005` Map each business unit explicitly to its legal entity, tax registration and accounting book. Units at one Site may have different mappings; transactions use the relevant unit's mappings.
- `PRD-ORG-020` Each tax registration and each accounting book belongs to exactly one legal entity, fixed when it is created. A legal entity may hold several of each. A business unit's tax registration and accounting book must belong to its mapped legal entity.
- `PRD-ORG-006` Allow whole-store and warehouse units to cover several brands, brand-counter units to cover one brand, and office units to operate without a brand.
- `PRD-ORG-021` Several Stores may trade at one Site at the same time. A Store's link to its Site is effective-dated. A brand counter inside the Organisation's own Store is a business unit of that Store; the shop-in-shop Store format is the Organisation's own Store trading inside another business's premises.
- `PRD-ORG-007` Maintain geography as Country → State → City → Area → Site. Regions and clusters are additional configurable groupings.
- `PRD-ORG-008` Maintain Site and Store names, aliases, addresses, classifications, opening and closing dates, status and partner associations.
- `PRD-ORG-009` Keep physical Site kind, Store format, operating model, inventory ownership and settlement terms independent.
- `PRD-ORG-010` Support head and regional offices, central and regional warehouses, retail sites, MBO, EBO, shop-in-shop and kiosk formats, and company-owned, franchise-owned and franchise-owned company-operated stores.
- `PRD-ORG-011` Configure countries, currencies, merchandise categories, product identity, commercial terms, workforce rules and accounting interfaces for each Organisation.
- `PRD-ORG-012` Maintain floor, backstore, zones, racks, bins, fixtures, display and alteration locations. Damage, holds and transit are stock/custody conditions, not invented Sites.
- `PRD-ORG-013` Assign each Store a default warehouse for replenishment and returns; permit other authorised routes.
- `PRD-ORG-014` Record stock ownership from the applicable agreement. Outright and sale-or-return terms do not by themselves determine legal title, valuation or accounting recognition.
- `PRD-ORG-015` Track company, supplier/brand and partner-owned goods separately where the approved commercial model requires it. Exclude third-party-owned goods from owned-inventory value under the applicable accounting policy.
- `PRD-ORG-016` Maintain effective-dated margins, commissions, payment terms, return windows, return processes, credit-note terms and brand-funded promotion terms.
- `PRD-ORG-017` When an agreement transfers ownership before receipt, record inbound ownership by agreement, booking, supplier document and quantity. Inbound ownership is not stock: it cannot be sold, reserved, transferred or counted as custody.
- `PRD-ORG-018` Give inbound ownership a provisional amount only from a supplier invoice or the agreement's price for the same goods and quantity. Without that evidence, keep the amount unknown and raise an exception; never create a fictitious payable, inventory value or journal. Accounting recognition follows the Financial posting policy.
- `PRD-ORG-019` Close inbound ownership against the receipt count. Settle quantity and amount differences through the receiving discrepancy and invoice-matching records.

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

- `PRD-ACS-001` Allow a person to hold several roles, with explicit action, entity, Site, brand and field permissions.
- `PRD-ACS-002` Allow a person to hold several personas. Personas set home screens, menus and summaries; only role assignments grant access.
- `PRD-ACS-003` Keep work placement separate from access. A persona does not itself grant a transaction or approval.
- `PRD-ACS-004` Apply scope within each role assignment; do not combine an action from one assignment with another assignment's fields or locations.
- `PRD-ACS-005` Effective-date assignments and policy changes; preserve their history. All-members scope includes future members; selected-member scope remains fixed; empty scope grants none.
- `PRD-ACS-006` Require a different authorised person from the preparer wherever independent approval applies, including PT approval and transfer approval.
- `PRD-ACS-007` Bind approval to the reviewed document version, source/destination, items, quantity, amount and beneficiary as applicable. Material changes require renewed approval.
- `PRD-ACS-008` Restrict salary, identity documents, bank details, customer contact information, cost and margin according to field permissions.
- `PRD-ACS-009` Give each person one inbox containing tasks, exceptions and approvals, ordered by due time and exposure.
- `PRD-ACS-010` Support approve/reject with reasons, evidence, comments, delegation during absence and escalation of overdue work.
- `PRD-ACS-011` Permit bulk approval only within the configured authority and risk policy.
- `PRD-ACS-015` Give each approval limit an explicit value basis: cost for stock adjustments, write-offs, disposals and transfers; bill value for discounts and bill-backed refunds; documented valuation for no-bill returns under the no-bill policy; if no valuation is accepted, the value is unknown (`PRD-ACS-016`); the amount paid for payments; quantity or discount percentage where configured. For PT approval limits, use the total proposed acquisition cost of the covered PT quantities: the proposed P RATE times the covered quantity on the PT revision under approval, not MRP. Show the basis beside the limit.
- `PRD-ACS-016` When a request's value on its basis is unknown, only a person whose authority explicitly covers unknown value may approve it; otherwise it stays pending. Unknown value never counts as zero. For PT approval, missing or disputed proposed acquisition cost blocks value-based approval until resolved; do not treat it as zero.
- `PRD-ACS-012` Send phone approval notifications as links to authenticated actions bound to the exact record version. A plain text or WhatsApp “yes” is not approval.
- `PRD-ACS-013` Record actor, event time, recording time, scope, before/after values, version, reason, source and approval evidence for important changes.
- `PRD-ACS-014` Preserve approved content and completed business events. Corrections, reversals and lifecycle changes are separately attributable records.
- `PRD-ACS-017` Apply the configured idle-lock and absolute session limits; preserve unfinished work when a session locks or expires. Keep development test access separate from production authentication.
- `PRD-ACS-018` Grant a stand-in only named, scoped, time-limited authority with automatic expiry. A stand-in cannot approve their own preparation.
- `PRD-ACS-019` For bulk approval, show the selected items and total, recheck each item's scope, limit, state and independent-approval requirement, and route exceptions individually. Enable only explicitly allowed action types.
- `PRD-ACS-020` A user belongs to one Organisation. A person who works for several Organisations, such as a CA or an Auditor, holds a separate user in each; no login, session or role assignment crosses Organisations.
- `PRD-ACS-021` Scope a role assignment's places by whole Sites, or by single Stores or business units within a Site. A selected Site covers every Store and business unit at it, including ones added later. A selected Store covers every business unit of it, including ones added later. Self-service uses a scope limited to the person's own records.
- `PRD-ACS-022` Grant self-service only through a role assignment whose only scope is the person's own records. That assignment covers no legal entity, place or brand; an assignment scoped by legal entity, place or brand never grants self-service.
- `PRD-ACS-023` Create a new Organisation's first Admin and its first approver of access changes together, in one setup step recorded under a service identity, since no user of the Organisation can yet approve it. From then on, every change to roles, permissions, role assignments and approval rules needs approval by a different authorised person.

## Merchandise and identifiers

- `PRD-MER-001` Maintain brands, suppliers, agents, ordering parties, invoicing parties and goods movers independently.
- `PRD-MER-002` Maintain stable internal SKU identities for merchandise variants. Apparel and footwear use style/article, colour and size, with category-specific size sets and size-colour grids.
- `PRD-MER-003` Assign a unique internal ID to each piece-tracked physical piece, even when identical pieces share a supplier barcode. Preserve that piece identity through custody, PT coverage, sale, return and count.
- `PRD-MER-004` Maintain season, collection, launch date, gender, fabric, fit, category, HSN and applicable merchandise attributes.
- `PRD-MER-005` Preserve unknown values. Missing size is distinct from an explicitly supplied Free Size.
- `PRD-MER-006` Map external barcodes and supplier codes to the correct SKU and unit, with scope and validity dates. Identical pieces may share an external barcode; their internal piece IDs remain distinct.
- `PRD-MER-007` Reject ambiguous active mappings; preserve leading zeros and historical aliases.
- `PRD-MER-008` Print internal barcode labels when appropriate identifiers are absent.
- `PRD-MER-009` Keep purchase cost, price-ticket maximum retail price (MRP), selling price, tax and discount separate; retain transaction-time snapshots.
- `PRD-MER-010` Support packaged-goods units of measure, packs and conversions, and batch/expiry tracking where the merchandise profile requires them.
- `PRD-MER-011` Carry configured unit, batch and expiry identity through receiving, movement, sale, return and count. Missing required tracking information blocks the affected operation.
- `PRD-MER-012` Apply configured expiry eligibility and hold rules; quantities in different units are not silently combined.
- `PRD-MER-013` Maintain product and vocabulary proposals separately from approved masters. Unconfirmed identity cannot enter an official PT.
- `PRD-MER-014` Set piece tracking per merchandise tracking profile. Goods outside a piece-tracked profile are held as quantity per SKU and unit.
- `PRD-MER-015` Print piece-ID labels from the receipt count. A piece-ID label printed before PT approval asserts no price or sale eligibility.
- `PRD-MER-016` Bill, count, transfer and return piece-tracked goods by scanning the piece ID. A supplier barcode identifies the SKU, not the piece, and cannot complete these actions alone.
- `PRD-MER-017` At a Store still selling through an earlier POS, piece rules start at its switch count.
- `PRD-MER-018` Changing a merchandise tracking profile from quantity-tracked to piece-tracked applies only through a labelling count: count, label and verify every piece of that profile at each Site; piece rules start from that count.

## Source conversion and imports

- `PRD-IMP-001` Accept spreadsheets, CSV, PDF and photographs for supported document workflows; support brand PT files in XLSX, XLS, XLSB and CSV formats.
- `PRD-IMP-002` Preserve the original file, source system, uploader, time, document reference and original row/field values.
- `PRD-IMP-003` Use saved, versioned mappings by source and document type; retain original source words alongside normalised values.
- `PRD-IMP-004` Detect layouts from their structure; a brand name can identify candidates but cannot silently select an incompatible mapping.
- `PRD-IMP-005` Stage data, validate references and totals, preview proposed records and changes, obtain the required review, then publish.
- `PRD-IMP-006` Distinguish supplied values, deterministic calculations, confirmed mappings and AI suggestions.
- `PRD-IMP-007` Report row/field errors and conflicting identity, quantity, price, tax or date information with the correction required.
- `PRD-IMP-008` Govern vocabulary and mapping rules through proposal and independent confirmation; an unapproved proposal changes no operational data.
- `PRD-IMP-009` Offer exact or close-match suggestions for manual selection; never fill identity or commercial facts from an unaccepted guess.
- `PRD-IMP-010` Distinguish create, update, opening balance, historical reference and transaction import. An analytical-history import creates no live stock, receivable or tax document.
- `PRD-IMP-011` Prevent duplicate business effects across repeated uploads, corrected files and integration retries. A reused source identity with different content is an explicit conflict or governed revision.
- `PRD-IMP-012` Retain successful and failed document outcomes; a required document cannot be partly posted because one line failed.
- `PRD-IMP-013` Reconcile accepted, rejected, pending and duplicate quantities and values. Correcting an import preserves its original evidence and downstream links.

## Booking and buying

- `PRD-BKG-001` Create bookings by brand, season and destination, using style/size quantities and a size-colour grid.
- `PRD-BKG-002` Record booking-specific terms with effective brand/supplier terms as defaults.
- `PRD-BKG-003` Show total pieces, indicative cost and MRP values. Indicative booking cost does not replace approved receipt cost.
- `PRD-BKG-004` Control booking approval against the open-to-buy budget by brand and season.
- `PRD-BKG-005` Track ordered, delivered, outstanding and cancelled quantities separately from invoice discrepancies.
- `PRD-BKG-006` Derive delivered quantities from retained receipt links rather than a manually maintained counter.
- `PRD-BKG-007` At GRN issue against a booking, link a counted line only when it has one exact style-and-size match. Preserve actor and date; ambiguous lines require buyer review.
- `PRD-BKG-008` Support deliveries without a booking and subsequent authorised linking.
- `PRD-BKG-009` Record expected delivery dates, transporter and lorry receipt references; notify responsible users of late deliveries.
- `PRD-BKG-010` Compare supplier order confirmations with bookings and show differences for review.
- `PRD-BKG-011` Measure supplier fill rate, delivery timeliness, damage and PT accuracy.
- `PRD-BKG-012` Suggest buying and size quantities from qualified sales history, with human approval.
- `PRD-BKG-013` Configure commitment, amendment and cancellation rules; cancellation cannot erase quantities already physically received.

## Receiving and price tickets

A goods receipt note (GRN) records the goods physically counted at the receiving Site. A price ticket (PT) is a reviewed table of merchandise identity, counted coverage, approved cost, maximum retail price (MRP) and tax information. It may come from a supplier or be assembled from an invoice and merchandise evidence.

- `PRD-REC-001` Provide one Receive Goods inbox per Site, combining supplier deliveries and incoming transfer dispatches, with Pending and History views.
- `PRD-REC-002` Start supplier receiving through Goods arrived or Receive against booking; both open the same guided workflow.
- `PRD-REC-003` Keep arrival, count, GRN, discrepancy, PT revision, approval, label job and acceptance records distinct within the workflow.
- `PRD-REC-004` Receive directly at a Store or warehouse, by barcode scan or controlled count; record the actual Site even when another Site prepares the PT.
- `PRD-REC-005` Count goods despite missing booking, invoice or PT. Capture actual quantity, identity evidence and condition.
- `PRD-REC-006` Record shortage, excess, wrong, unidentified and damage observations separately; conditions can coexist.
- `PRD-REC-007` Preserve carton, seal and damage photographs, transporter references and inbound e-way evidence.
- `PRD-REC-008` Create physical custody only from the actual count. Invoice or PT quantities cannot manufacture stock.
- `PRD-REC-009` Keep counted custody, official priced coverage, available stock and financial approval distinct.
- `PRD-REC-010` Compare invoice, GRN and PT quantities, prices, taxes and charges nightly; assign differences to Accounts and Booking.
- `PRD-REC-011` Allow clean resolved portions to proceed independently of quantities still disputed.
- `PRD-REC-012` Keep wrong/unidentified and excess quantities held until their applicable identity and acceptance rules are satisfied. Missing PT alone does not classify goods as wrong.
- `PRD-REC-013` Accept good excess only through explicit authority, preserving the original discrepancy.
- `PRD-REC-014` Prepare PTs at the receiving Site or through an authorised warehouse/office workbench without changing the receipt location.
- `PRD-REC-015` Allow one primary PT and supplemental PTs against counted portions of the same receipt; approved coverage cannot overlap.
- `PRD-REC-016` Reconcile every PT row to receipt quantities and their origins. A receipt PT cannot be an unlinked merchandise list.
- `PRD-REC-017` Require a submitted revision, completed review and independent approval before a PT becomes official.
- `PRD-REC-018` Freeze the approved revision's values and coverage. Maintain its source file, mapping/calculation profile and reviewer evidence.
- `PRD-REC-019` Correct or reverse through linked records; validate dependencies on accepted, reserved, transferred, returned and sold quantities before changing coverage.
- `PRD-REC-020` Print merchandise/MRP labels from official frozen PT values and retain print/reprint jobs. A pre-approval custody label cannot assert an approved price or sale eligibility.
- `PRD-REC-021` Verify the barcode/tag and physically accept goods at the selling Site. PT approval alone cannot make goods sellable.
- `PRD-REC-022` Record acceptance and putaway by the people authorised at the actual destination; supplier-supplied tags still require verification.

### PT workbench

- `PRD-PTW-001` Provide To prepare, To approve and Mapping rules views, including new SKU proposals awaiting confirmation.
- `PRD-PTW-002` Support GRN-count preparation, canonical-file upload and supplier-file conversion through the same reviewed records.
- `PRD-PTW-003` Provide approved-vocabulary dropdowns, column fill for all or blank rows, controlled quick fills, row/page-selection review, per-cell origin and canonical workbook export.
- `PRD-PTW-004` Save PT edits explicitly; preserve recoverable drafts without treating them as submitted or approved. Editing a reviewed row removes its review mark.
- `PRD-PTW-005` Show concurrent changes side by side instead of silently overwriting another person's review.
- `PRD-PTW-006` Resolve changed merchandise attributes to an existing SKU or a separately confirmed new SKU.
- `PRD-PTW-007` Calculate protected derived fields from the approved profile; do not permit unrestricted typing over them.
- `PRD-PTW-008` Support the KDPS export profile: SEASON, BRAND, COLOR, GENDER, SUB CATEGORY, TYPE, ITEM, FIT, SIZE, BARCODE, DESIGN, HSN, QTY, MRP, BASIC, P RATE, INPUT TAX, OUTPUT TAX, NAG, MARGIN, SUGGESTED SUB CATEGORY and SUGGESTED TYPE.
- `PRD-PTW-009` Treat that profile as a view of resolved merchandise, quantity, cost and tax records, rather than the universal storage model.
- `PRD-PTW-010` Retain BASIC as the profile's cost base, P RATE as its approved receipt-layer cost and MRP as the ticket value. The exact derivation, tax bases, additions and rounding belong to the approved costing profile.
- `PRD-PTW-011` NAG equals QTY. Display ticket MARGIN as (MRP − P RATE) ÷ MRP × 100, rounded half-up to two decimal places; report realised profit and agreed commercial margins separately.
- `PRD-PTW-012` INPUT TAX and OUTPUT TAX represent the approved profile's purchase-side and sale-side tax classifications. SUGGESTED SUB CATEGORY and SUGGESTED TYPE are master hints requiring confirmation, not automatic changes to merchandise identity.
- `PRD-PTW-013` Support base-to-ticket derivation, ticket-to-purchase derivation and both-supplied verification. Block calculations with missing inputs, invalid slabs or unresolved source conflicts.

## Stock and warehouse control

- `PRD-STK-001` Track physical quantity, official PT coverage/value, available quantity, reservations, ordinary holds, excess hold, quarantine and transit separately.
- `PRD-STK-002` Track billed-retained, alteration and display custody without double-counting physical quantity.
- `PRD-STK-003` A piece is sellable only with official PT coverage, barcode verification and physical acceptance at its selling Site, with no conflicting hold or reservation.
- `PRD-STK-004` Preserve receipt origin, PT revision, quantity, ownership and cost through every move. Grouped displays must retain separate underlying origins.
- `PRD-STK-005` Within-Site floor, backstore, rack and bin moves are exact-quantity movements preserving condition and acceptance; they are not inter-Site transfers.
- `PRD-STK-006` Provide stock search by product, brand, size, barcode, location and condition, including availability at authorised alternative stores.
- `PRD-STK-007` Distinguish good unsold dead stock from damaged/non-returnable stock.
- `PRD-STK-008` For a full Store count, stop selling, reconcile tills, establish and freeze the count scope, count/scan, review differences and authorise adjustments before resuming selling.
- `PRD-STK-009` Support cycle counts by location, rack, brand or selected items. Freeze counted items and locations from sale and movement while the count is open.
- `PRD-STK-010` Preserve initial counts, recounts, differences, reasons and approved corrections.
- `PRD-STK-012` Record, explain and approve every count difference. The configured count tolerance only selects the approver: within it, the approver set for that tolerance; above it, a higher approver and an owned exception. No difference is adjusted automatically.
- `PRD-STK-011` Identify broken size runs and opportunities to obtain missing sizes from other locations.
- `PRD-STK-013` When an operation on quantity-tracked goods does not name the receipt origin, take the oldest receipt origin at that place first. Where batch or expiry is tracked, take the soonest expiry first.
- `PRD-STK-014` A count surplus with no known receipt origin creates custody held as excess, with owner, PT coverage and cost unknown. It becomes available only when an approver links it to a recorded loss, which is reversed with that loss's origin, owner, coverage and cost; or when its owner is established and a PT for the counted quantity is approved, as for opening stock.
- `PRD-STK-016` When an imported EBO sale report would oversell available stock, hold the import for reconciliation before stock is reduced; do not apply the oversell silently.
- `PRD-STK-017` A mistaken damage confirmation is corrected by a linked reversal that restores the prior custody and stock state; it does not edit the original confirmation.
- `PRD-STK-015` When a count finds a piece the ledger shows as sold, returned to its supplier or disposed of, an approver may link it to the movement that wrongly named it. A correction record then swaps it with the piece of the same SKU that actually left; the bill or other document never changes. Without such a match, the found piece is held and an exception is raised.

## Transfers and physical movement

- `PRD-TRF-001` Support warehouse-to-store, store-to-warehouse, store-to-store and warehouse-to-warehouse movements.
- `PRD-TRF-002` An internal transfer has one source and destination; different destinations require separate documents.
- `PRD-TRF-003` Keep internal transfers, returns to supplier (RTV) and commercial sales to partners distinct.
- `PRD-TRF-004` Present allowed destinations by name/code without granting access to their operational data. Ordinary internal movement remains within its authorised legal-entity boundary.
- `PRD-TRF-005` Use request/draft → independent higher-authority approval and reservation → dispatch → destination count → acceptance.
- `PRD-TRF-006` At approval, ordinary transfers require official PT coverage, source acceptance and available unreserved quantity. Bind reservations to the reviewed source/custody references and condition.
- `PRD-TRF-007` Recheck dispatch eligibility against that movement's reservation without clearing existing holds. Controlled quarantine or incomplete-custody routes require their separate authority.
- `PRD-TRF-008` Approval reserves reviewed quantities at source and prevents competing allocation or sale.
- `PRD-TRF-009` An undispatched reservation has no automatic expiry. Release it only by actual dispatch or explicit cancellation.
- `PRD-TRF-010` Changing items, increasing quantity or changing destination requires renewed approval. A smaller dispatch leaves the remainder reserved.
- `PRD-TRF-011` Support several dispatches against one approved movement. Each records actual quantities, source references, departure time, recording time, actor and transport evidence.
- `PRD-TRF-012` Derive transfer documentation for registered stock from its source origins; do not create a new supplier purchase or apply markup again.
- `PRD-TRF-013` Record actual dispatch and arrival separately and safely once. Pending destination visibility is not physical receipt.
- `PRD-TRF-014` Receive each dispatch as one whole shipment. Separate dispatches can arrive separately; staged partial receipt within one dispatch is outside this movement contract.
- `PRD-TRF-015` An unfinished scan session stays unfinished; it cannot silently short-close the shipment.
- `PRD-TRF-016` Record expected and actual good, damaged, wrong, unidentified, excess and missing quantities. Damage is not shortage, and absent goods do not enter quarantine.
- `PRD-TRF-017` Release eligible good quantities independently of disputed portions.
- `PRD-TRF-018` Preserve explicit discrepancy resolution before missing or disputed quantities count as accounted for.
- `PRD-TRF-019` If delivery fails and goods return, record actual receipt at the source linked to the dispatch, with condition and evidence; preserve the failed destination outcome.
- `PRD-TRF-020` For internal dispatch, completion requires destination accounting for its quantities. For direct supplier pickup, it requires confirmed handover. For delivery to a supplier, it requires confirmed supplier receipt.
- `PRD-TRF-021` Complete the overall movement only when every dispatched quantity is accounted for and no undispatched reservation remains. Returned or cancelled quantity is not labelled successfully delivered.
- `PRD-TRF-022` Cancellation clears only the relevant undispatched reservation, never quarantine or another hold.
- `PRD-TRF-023` Determine statutory movement documents from configured ownership, entity, registration and movement rules. Keep transfer PTs and statutory documents separately linked.
- `PRD-TRF-024` Record actual departure/arrival even when documentation is missing; retain missing-at-dispatch, later attachment and verification as an owned compliance exception.
- `PRD-TRF-025` Track documentation compliance and financial settlement independently of movement completion.
- `PRD-TRF-026` Retain supplied return deadlines and dashboard reminders. Reminders never dispatch, cancel or release goods automatically.

## Damage, quarantine and disposal

- `PRD-DMG-001` Reporting damage immediately makes the affected quantity unavailable, before confirmation.
- `PRD-DMG-002` Require a different authorised reviewer to confirm or reject the report, preserving the observations and decision.
- `PRD-DMG-003` Rejecting a mistaken report removes only that damage hold; other holds or reservations remain.
- `PRD-DMG-004` Record damage at arrival, after GRN and before PT, or after official PT, using the available custody/origin evidence.
- `PRD-DMG-005` Preserve unknown pre-PT identity, cost and tax instead of inventing stock layers or zero values.
- `PRD-DMG-006` Allow confirmed damaged goods to remain quarantined without a forced movement or time-based release.
- `PRD-DMG-007` Support controlled store-to-warehouse quarantine movement and store/warehouse-to-supplier returns, retaining condition at every hop.
- `PRD-DMG-008` Pre-PT custody movement requires its approved quantity/document/authority contract; ordinary good-stock transfer permission cannot bypass a hold.
- `PRD-DMG-009` Wrong or excess goods returned to the supplier can use GRN custody without forced PT completion.
- `PRD-DMG-010` Acceptance of wrong/unidentified goods requires resolved identity, explicit permission and the applicable PT route. Acceptance of damaged goods never makes them good stock.
- `PRD-DMG-011` Write-off records loss of established value; goods still present remain in physical custody and unavailable.
- `PRD-DMG-012` Disposal records actual destruction or scrap/recycling handover, with source/custody reference, Site, quantity, method, reason, actor, event/recording times and evidence.
- `PRD-DMG-013` Allow partial disposal, leaving the balance in quarantine.
- `PRD-DMG-014` Withdraw quantity from an outstanding RTV commitment before disposing of it.
- `PRD-DMG-015` Record scrap proceeds separately. Prevent a second recognition of value loss when disposal follows write-off.
- `PRD-DMG-016` Record pre-PT disposal without creating a fictitious cost, purchase liability or journal.
- `PRD-DMG-017` Donation or sale as damaged merchandise requires a separately authorised disposition policy; destruction/scrap permissions do not permit it.

## Counter sales and payments

- `PRD-POS-001` Bill by scan, search or a size-colour selector from eligible stock.
- `PRD-POS-002` Attribute each line to a salesperson separately from the cashier.
- `PRD-POS-003` Apply approved offers; require the configured authority and reason for manual discounts or price changes.
- `PRD-POS-024` Never let a line's selling price, from a price list or a manual change, exceed the MRP of the goods sold; refuse it, with no override.
- `PRD-POS-004` Allocate basket discounts across lines before applying the relevant effective tax and rounding rules.
- `PRD-POS-023` Spread a discount that an offer gives for a group of lines, such as a basket-value or buy-X-get-Y offer, over the lines that earned it in proportion to each line's value before that discount. Round each share down to whole paise and give the paise left to the line with the largest such value, or to the first of them on the bill.
- `PRD-POS-005` Support enabled cash, card, UPI, verified Bank transfer, Store credit, Gift voucher and approved Customer credit tenders with exact split allocation. Keep each actual instrument and its confirmation state distinct.
- `PRD-POS-006` Start payment allocation as unallocated; total allocated tenders must equal the amount due.
- `PRD-POS-007` Record cash received separately from cash tender. An omitted cash-received entry explicitly means exact cash; entered zero means zero.
- `PRD-POS-008` Reject insufficient cash, cash-received input without a cash portion, and invalid amounts. Calculate change only on cash.
- `PRD-POS-009` Revalidate tender allocation after any item, quantity, offer or price change; stale amounts cannot finalise the revised bill.
- `PRD-POS-010` Distinguish manually recorded card/UPI collections from provider-confirmed attempts and from final bank settlement.
- `PRD-POS-011` Retain provider references and pending/failed/confirmed outcomes; an uncertain response requires lookup/reconciliation before another charge.
- `PRD-POS-012` Make customer phone optional; explain its purpose when collected and keep marketing consent separate.
- `PRD-POS-013` Save held carts and support recall with current eligibility/price validation.
- `PRD-POS-014` Preserve completed bill items, prices, discounts, taxes, tender allocation, business date, operator and calculation-policy snapshots.
- `PRD-POS-015` Search bills by customer, number and date range; include unsynced local bills without duplicating them after sync.
- `PRD-POS-016` Reprint the same bill identity. Printer or digital-delivery failure cannot create another sale or delete a completed bill.
- `PRD-POS-017` Send permitted digital bills through WhatsApp or SMS.
- `PRD-POS-018` Support billed-retained goods paid for but still in store custody, with linked collection/alteration status and protected quantity. Its fulfilment and accounting policy governs issue, pickup, cancellation and release.
- `PRD-POS-019` Obtain the required Invoice Reference Number (IRN) evidence before issuing an applicable tax invoice or authorising goods release.
- `PRD-POS-020` Give each billing device its own bill series per tax registration and financial year, online or offline. Devices never share a live series. Set the number format per Organisation within the statutory limits for invoice numbers.
- `PRD-POS-021` Require provider or bank evidence to confirm a Bank transfer tender; a customer screenshot alone is not confirmation.
- `PRD-POS-022` Allow Customer credit sales only under an approved customer limit and due date; record the receivable and its settlement separately from Store credit.

## Customer returns, exchanges and credit

- `PRD-RET-001` Maintain an Organisation return policy with Store-specific overrides only when explicitly authorised by the Organisation. Effective-date each override. Snapshot the policy that applied to each sale.
- `PRD-RET-003` Configure ordinary and defective-item cases independently, including permitted refund, exchange, store-credit or refusal outcomes.
- `PRD-RET-004` For defective goods, assess separately and support replacement, repair where appropriate, or refund under applicable consumer rights and warranties; do not force store credit where a refund is owed.
- `PRD-RET-005` Determine bill-backed entitlement from original paid quantity/value less prior completed or pending returns, not current MRP.
- `PRD-RET-024` Refund returned units at the paid value the bill recorded for them, after offers and spread discounts; do not work the offer out again on the units the customer keeps. For part of a line, each returned unit takes the line's paid value ÷ sold quantity, rounded down to whole paise; the return that brings the line's returned quantity to its sold quantity takes all that remains.
- `PRD-RET-006` Prevent concurrent requests from returning the same sold quantity or exceeding its remaining paid-value entitlement.
- `PRD-RET-007` Use current prices and offers for replacement goods. Equal value has no difference; higher value collects the difference.
- `PRD-RET-008` For a cheaper replacement, apply the configured refund-difference, credit-difference or refusal rule.
- `PRD-RET-009` Allow replacement SKUs other than the original unless the configured policy restricts them.
- `PRD-RET-010` Determine refund entitlement separately from permitted tender routing; require independent authorised approval for cash substitution or another tender override.
- `PRD-RET-011` Keep approved, pending, failed and confirmed refunds distinct; failed payment remains an outstanding customer obligation.
- `PRD-RET-022` For a bill paid with several tenders, split each refund across the original tenders in proportion to their original allocation, capped at each tender's remaining refundable amount. Give any amount above a tender's cap to the other original tenders in the same proportion, and any paise left by rounding to the largest tender.
- `PRD-RET-012` Record customer remedy and physical returned condition separately.
- `PRD-RET-013` Accept good returned pieces through the site's acceptance rules; quarantine damaged/defective pieces immediately.
- `PRD-RET-014` A refused request does not create returned stock through this flow.
- `PRD-RET-015` Record refused attempts and reasons within the applicable evidence policy.
- `PRD-RET-016` Issue customer-linked store credit with configured validity and cross-store redemption scope. Check and consume the authoritative balance online.
- `PRD-RET-017` Keep no-bill returns unavailable without their explicit eligibility, valuation, permission and tender policy.
- `PRD-RET-018` Maintain customer purchase history, sizes and preferred brands, with appropriate access.
- `PRD-RET-019` Support loyalty earning/redemption and return reversals under configured rules, retaining liability and balance history.
- `PRD-RET-020` Issue the Organisation's own gift vouchers as bearer vouchers with a unique code and configured validity. Record each unredeemed balance as a liability, and check and consume the authoritative balance online at redemption. Tax on issue and redemption follows the Statutory applicability policy.
- `PRD-RET-021` Accept only the Organisation's own gift vouchers as the gift-voucher tender. Vouchers issued by brands or other parties are outside the product until the PRD adds them.
- `PRD-RET-023` Restrict store-credit redemption to authorised Stores within the same legal entity; configure validity and redemption scope before activation.

## EBO sales and external billing

- `PRD-EBO-001` Import brand-software sales, returns, stock and payment reports through saved approved layouts.
- `PRD-EBO-002` Accept spreadsheets/files or photographed reports; show parsed rows and errors before submission.
- `PRD-EBO-003` Validate Store, business date, document identities, items, totals and previous imports.
- `PRD-EBO-004` Mark brand-reported totals separately from independently verified bill evidence.
- `PRD-EBO-005` Apply approved sales/returns to the operational stock, cash, incentives and reporting records once; never create a second GST invoice for externally issued bills.
- `PRD-EBO-006` Retain corrections and reversals without losing the original report.
- `PRD-EBO-007` Alert staff and Operations when an expected daily report is absent.
- `PRD-EBO-008` Reconcile brand stock with system stock monthly; assign differences for resolution.
- `PRD-EBO-009` Produce EBO brand-settlement statements and the configured commission/partner basis.
- `PRD-EBO-010` Support authorised API ingestion where the brand permits access, using the same validation and duplicate controls as file imports.
- `PRD-EBO-011` An EBO Store that reports through brand software holds piece-tracked goods as SKU quantity until it bills in Apparel OS; its imports name no piece.

## Offers, prices and supplier returns

- `PRD-OFR-001` Support percentage, flat-value, buy-X-get-Y and basket-value offers by brand, item, Store/group and effective dates.
- `PRD-OFR-002` Require offer approval before activation; retain combination rules, source and brand/company cost shares.
- `PRD-OFR-003` Use the same evaluation for Running Offers and checkout; show applicable items, dates and combination rules.
- `PRD-OFR-021` When offers apply to the same lines and no effective rule permits them to combine, apply the permitted set of offers that gives the customer the largest total discount on the bill; a tie goes to the set holding the offer approved first. Running Offers and checkout make the same choice.
- `PRD-OFR-004` Maintain end-of-season price lists and sale-sticker printing without changing historical sale prices.
- `PRD-OFR-005` Apply only the tax-rate rules relevant to the merchandise and value basis; highlight material tax effects of discounts.
- `PRD-OFR-006` Report offer sales, margin impact and who funded the discount.
- `PRD-OFR-007` Suggest markdown steps using ageing and sell-through, with review before publication.
- `PRD-OFR-008` Track supplier return eligibility and deadlines by receipt origin and contractual qualifying event.
- `PRD-OFR-009` Support return reminders, including 30-, 15- and 7-day reminders where the configured schedule applies.
- `PRD-OFR-010` Build proposed unsold-return lists for approval and picking; preserve exclusions and edited selections.
- `PRD-OFR-011` Support direct supplier pickup or consolidation through a warehouse, with independently approved legs.
- `PRD-OFR-012` Keep RTV preparation, reservation, physical departure, supplier handover/receipt and financial follow-up separate.
- `PRD-OFR-013` Track Initiated, Completed, Cancelled before departure and Closed—partially returned outcomes.
- `PRD-OFR-014` Record partial-pickup reasons against remaining quantities: supplier rejection, later pickup, goods not ready, withdrawal or another stated reason.
- `PRD-OFR-015` Record whether another pickup is expected for each remaining portion; Other requires a remark. Keep the RTV Initiated while any quantity awaits departure or any dispatched shipment remains unresolved.
- `PRD-OFR-016` Explicitly withdraw rejected/abandoned undispatched quantities; closing that balance cannot close a shipment still awaiting confirmation.
- `PRD-OFR-017` Link replacement goods to a new inbound receipt.
- `PRD-OFR-018` Maintain one supplier-claims register for shortage, damage, price differences, promotional funding and display support.
- `PRD-OFR-019` Link debit requests, supplier credit notes, quantities, amounts, application and cash outcome. Physical return does not automatically reduce a payable.
- `PRD-OFR-020` Produce sale-or-return statements of sold stock and obligations under the approved agreement.

## Finance and accounting

### Ledger and official books

- `PRD-LED-001` Maintain an integrated double-entry ledger per accounting book, with chart of accounts, Store/brand cost centres and financial periods.
- `PRD-LED-002` Map books through the relevant business unit; support several books and approved inter-book allocations where a bank account serves more than one book.
- `PRD-LED-003` Use configured recognition and posting rules for receipts, sales, returns, claims, payments, payroll and adjustments.
- `PRD-LED-004` Require balanced journals, source-document links and immutable posted entries; use linked reversals/corrections.
- `PRD-LED-005` Keep operational quantities, provisional commercial amounts and accounting recognition distinct.
- `PRD-LED-006` Preserve receipt-cost evidence and record later approved cost adjustments separately, including their inventory/COGS effects for goods already sold.
- `PRD-LED-007` Support lower-of-cost-and-net-realisable-value write-downs under applicable rules.
- `PRD-LED-014` Support FIFO and moving weighted-average cost formulas. The Financial posting policy selects the formula for each accounting book and applies it consistently to inventories of similar nature and use.
- `PRD-LED-015` Configure the cost pool for each accounting book: each SKU across the whole book, or each SKU at each Site. Under a Site pool, a transfer carries its source cost into the destination pool without markup. Changing the formula or pool is effective-dated and reconciles the transition.
- `PRD-LED-016` A later cost adjustment follows its goods: under FIFO, through the receipt's cost layer; under weighted average, through the receipt's own units by receipt origin. Units still held change the cost pool's value; units gone carry their share to cost of goods sold or to the movement that took them. A pool's value never falls below zero; any excess goes with the share for units gone or, when none are gone, to cost of goods sold as its own line.
- `PRD-LED-017` Every outflow from a cost pool, including a supplier return, leaves at the pool's formula cost, except a reversal of an inflow made in error (`PRD-LED-018`). Show the difference from the supplier's credit as a separate variance. An inflow that undoes an earlier outflow, such as a customer return or found goods matched to a recorded loss, comes back at the cost it left with.
- `PRD-LED-018` A reversal of an inflow made in error takes off the value that inflow added. Any part that would take a cost pool below zero is shown as a separate variance.
- `PRD-LED-008` Reconcile inventory value, receivables, payables, cash, bank and controlling ledger balances.
- `PRD-LED-009` Lock financial periods; require authorised reopening for affected posting.
- `PRD-LED-019` Reopening a locked financial period needs a request with its reason, approved by a different authorised person from the requester.
- `PRD-LED-020` A reopening names the corrections it is for. Only their postings may enter the reopened period; every other posting stays refused. The period locks again once they have posted or the reopening is withdrawn.
- `PRD-LED-010` Provide month-close checklists, owners, due dates, reconciliations and unresolved amounts.
- `PRD-LED-011` The official book is the one the Official book policy names, until an authorised accounting-book transition. Keep the internal ledger and external book reconciled.
- `PRD-LED-012` Send approved masters before sales, purchases, payments, receipts, contra, journals and credit/debit vouchers through Tally XML.
- `PRD-LED-013` Retain acknowledgment, rejection, correction and retry outcomes; require a successful acknowledgment before marking a voucher imported.

### Cash, collections and bank

- `PRD-CSH-001` Close each Store day using opening cash plus inflows minus outflows, compared with a denomination-based physical count.
- `PRD-CSH-002` Preserve original count, recount, variance, explanation and supporting evidence.
- `PRD-CSH-011` Record, explain and approve every day-close cash variance. The configured cash-variance tolerance only selects the approver: within it, the approver set for that tolerance; above it, a higher approver and an owned exception. No variance is written off automatically.
- `PRD-CSH-003` Separate sales collections, old-dues recovery, cash transfers and non-cash collections.
- `PRD-CSH-004` Maintain petty expenses with bill photos, limits, top-up requests and float accountability.
- `PRD-CSH-005` Track pickup, safe handover and bank deposit; cash remains in transit until the relevant receipt is confirmed.
- `PRD-CSH-006` Match POS totals to card/UPI provider reports and bank credits, distinguishing gross collection, fees, refunds, withholding and net settlement.
- `PRD-CSH-007` Import bank CSV/Excel statements without duplicate lines; suggest matches with confidence and support authorised bulk acceptance.
- `PRD-CSH-008` Route ambiguous or unmatched lines to review rather than forcing a match.
- `PRD-CSH-009` Retain standard payment references/narrations linking bank movements to Store and purpose.
- `PRD-CSH-010` Cash counting, provider settlement and bank reconciliation remain separate outcomes.

### Payables, receivables and payments

- `PRD-PAY-001` Track supplier invoices through capture, matching, approval, payment readiness and settlement, with quantity/price/tax/charge exceptions.
- `PRD-PAY-002` Preserve duplicate-invoice checks, disputed balances, payment holds, claims and supplier-credit application.
- `PRD-PAY-003` Keep outright and sale-or-return obligations separately reportable under the approved recognition policy.
- `PRD-PAY-004` Maintain a consolidated outgoing-payment plan, including recurring rent, salary, utilities, loans and petty-cash needs.
- `PRD-PAY-005` Propose payment runs by due date, contract and approved claim disposition; produce bank-specific upload files.
- `PRD-PAY-006` Bind mobile approval to the amount, beneficiary, bank details and reviewed request version.
- `PRD-PAY-007` Mark a bank payment paid only from bank evidence, and a cash payment paid only from its required handover evidence.
- `PRD-PAY-008` Keep deposits, advances, loans and floats separate from expenses.
- `PRD-PAY-009` Forecast cash from planned payments and expected collections.
- `PRD-PAY-010` Track applicable MSME payment obligations and statutory due dates using verified supplier classification and rules.
- `PRD-PAY-011` Maintain customer, brand and partner receivables, ageing, partial receipts, advances and unapplied balances.
- `PRD-PAY-012` Track commission from sales basis to brand invoice, receipt, franchise share and onward payment.
- `PRD-PAY-013` Do not disburse unreceived onward commission without the configured Owner authority.
- `PRD-PAY-014` Record expense allocation by Store and brand.

### Tax and assets

- `PRD-TAX-001` Maintain GST output registers, HSN summaries and return-preparation files.
- `PRD-TAX-002` Match supplier filings/GSTR-2B to purchase evidence before the authorised input-credit decision.
- `PRD-TAX-003` Support e-invoice and e-way creation through an approved GST Suvidha Provider (GSP), with status lookup, error ownership and safe retry.
- `PRD-TAX-004` Keep tax-document issue, cancellation/correction and operational reversals distinct.
- `PRD-TAX-005` Maintain effective-dated goods classification, rate/value rules, registration applicability and statutory document requirements.
- `PRD-TAX-006` Support TDS calculations, challan records, statement/certificate preparation and reconciliation for applicable rent, contractor, professional and commission payments.
- `PRD-TAX-007` Provide a statutory calendar and scoped CA access to reports, comments and document requests.
- `PRD-TAX-008` Prepare statutory data for authorised filing; do not claim submission merely because an export exists.
- `PRD-TAX-009` Maintain fixed assets, fit-out capitalisation, depreciation, transfers, disposal and monthly Store net-asset-value snapshots.

### Net asset value and profitability

**Net asset value (NAV)** is what the store or business owns minus what it owes, on a particular date.

Assets:

- `PRD-NAV-001` Stock/inventory value
- `PRD-NAV-002` Refundable security deposits paid
- `PRD-NAV-003` Fixtures and other fixed assets, after accumulated depreciation
- `PRD-NAV-004` Debtors: money customers or others owe you
- `PRD-NAV-005` Cash and bank balances

Minus liabilities:

- `PRD-NAV-006` Creditors: money owed to suppliers
- `PRD-NAV-007` Outstanding loans
- `PRD-NAV-008` Unpaid expenses, interest and taxes
- `PRD-NAV-009` Security deposits received that must be returned

NAV = Total assets − Total liabilities

Example: ₹20 lakh assets − ₹8 lakh liabilities = ₹12 lakh NAV

**Profitability** is how much the store or business earned or lost over a period.

- `PRD-NAV-010` Sales after returns and discounts, excluding GST
- `PRD-NAV-011` Minus cost of the goods sold = Gross profit
- `PRD-NAV-012` Minus operating expenses such as rent, salaries, electricity and allocated head-office expenses
- `PRD-NAV-013` Minus depreciation and interest, plus other income = Profit before tax
- `PRD-NAV-014` Minus applicable income-tax expense = Net profit

Example: ₹10 lakh net sales − ₹6 lakh goods cost − ₹3 lakh expenses, depreciation, interest and tax = ₹1 lakh net profit

- `PRD-NAV-015` Stock/inventory value counts owned goods only; third-party-owned goods are excluded under the ownership rules.
- `PRD-NAV-016` These definitions govern the monthly Store net-asset-value snapshots; the Store P&L follows `PRD-NAV-017`.
- `PRD-NAV-017` End the Store P&L and brand-by-store profit at profit before tax. Show income-tax expense and net profit only for a legal entity.

## Franchise and partner accounts

- `PRD-FRN-001` Maintain partner leads, active agreements and exit, with access limited to their authorised Stores and records.
- `PRD-FRN-002` Record effective royalty, revenue share, commission, minimum guarantee, deposits, credit limits and payment terms.
- `PRD-FRN-003` Maintain partner ledgers and credit controls.
- `PRD-FRN-004` Produce monthly statements comparing minimum guarantee and actual entitlement, with assigned discrepancies.
- `PRD-FRN-005` Apply the agreed contract to franchise dispatch, invoice price, inventory ownership and settlement. Do not infer a purchase-price sale from the Store's franchise label.
- `PRD-FRN-006` Use the applicable commercial/inter-entity process when ownership changes; an internal transfer cannot silently change owner.
- `PRD-FRN-007` Partner staff are users who hold Store personas on their authorised Stores only. Their statement and ledger access comes from role assignments, not a separate persona.

## HRMS and payroll

- `PRD-HRM-001` Maintain employee identity, legal employer, employment history, joining, transfers, roles, exit and restricted documents.
- `PRD-HRM-002` Record ID, bank, PAN, PF and ESI details only within authorised workforce scope.
- `PRD-HRM-003` Support joining/exit checklists and governed final settlement against applicable requirements.
- `PRD-HRM-004` Capture attendance photo, location, time and registered device without face matching.
- `PRD-HRM-005` Support supervisor spot checks for sampled events, unusual location and new devices.
- `PRD-HRM-006` Retain original attendance events; approved regularisation is separate evidence.
- `PRD-HRM-007` Maintain rosters, shifts, weekly offs, busy-day staffing, leave types/balances and state holiday calendars.
- `PRD-HRM-008` Configure shift attribution, overtime and payroll-day rules for the relevant employer and staff group.
- `PRD-HRM-009` Set targets by Store, brand and salesperson.
- `PRD-HRM-010` Calculate incentives using approved percentage, per-piece, slab, brand-funded and team-pool rules, with attendance eligibility.
- `PRD-HRM-011` Use both POS and approved EBO evidence; retain salesperson attribution, return reversals and calculation-policy versions.
- `PRD-HRM-012` Show staff their authorised target and incentive information.
- `PRD-HRM-013` Track brand-funded incentives as a separately evidenced brand obligation.
- `PRD-HRM-014` Export approved payroll inputs including days, leave, overtime, incentives, deductions, advances and recoveries.
- `PRD-HRM-015` Support native payroll and payslips, alongside controlled external payroll exchange.
- `PRD-HRM-016` Keep input approval, calculation, employer liabilities, payment instructions and actual salary payment distinct.
- `PRD-HRM-017` Track salary advances/loans and recovery schedules.
- `PRD-HRM-018` Maintain effective statutory payroll rules, required registers and shop-licence tracking by employer and location.
- `PRD-HRM-019` Reconcile payroll-period totals and external acknowledgments; a repeated export cannot create a second payroll.

## Exceptions, reports and planning

- `PRD-EXC-001` Give each unresolved shortage, excess, damage, mismatch, transit gap, cash variance, uncertain payment, missing report or unfinished operation an owner, due date, status, evidence and exposure.
- `PRD-EXC-002` Resolve through permitted correction, return, reversal or reconciliation; verify the linked business outcome before closure.
- `PRD-EXC-003` Closing a support ticket cannot settle stock or money. Preserve repeated, reopened and unresolved cases.
- `PRD-EXC-004` Show exception dashboards by Store, brand and type, with recurring issues highlighted.
- `PRD-EXC-005` Report sales by Store, brand, category, size, salesperson and hour.
- `PRD-EXC-006` Report ageing, sell-through, weeks of cover, broken sizes, hot/warm/cold/dead stock and suggested action.
- `PRD-EXC-007` Report the cost of dead stock, missed supplier returns and commercial-model margins.
- `PRD-EXC-008` Produce brand-by-store profit and Store P&L using the configured merchandise cost, commission, support and expense allocation bases.
- `PRD-EXC-009` Give every metric one definition covering eligible states, units, dates, returns, discounts, tax, cost basis and aggregation.
- `PRD-EXC-010` Separate sales, collections, settlements and profit; show as-of time, estimates and missing data.
- `PRD-EXC-011` Drill from totals to source evidence; restrict every report and export to permitted data.
- `PRD-EXC-012` Produce brand sell-through reports and persona-specific daily summaries, including the configured daily WhatsApp summary.
- `PRD-EXC-013` Notify responsible users of cash gaps, large discounts, missing reports, overdue transit and return deadlines.
- `PRD-EXC-014` Send customer bills and credit information through permitted channels; marketing requires its applicable consent.
- `PRD-EXC-015` Answer plain-language questions only from the asker's authorised data, with inspectable supporting records.
- `PRD-EXC-016` Recommend warehouse-to-store replenishment and store-to-store rebalancing using demand, eligible stock, incoming commitments, size gaps and display requirements.
- `PRD-EXC-017` Provide demand forecasts by style, size and Store, opening-stock proposals for new stores and optional festival/weather signals.
- `PRD-EXC-018` Qualify missing data, stockouts, sparse/new-item history and uncertain forecasts; provide a manual planning path.
- `PRD-EXC-019` Preserve baseline, edited proposal, reason, author, approval and accepted/rejected outcome.
- `PRD-EXC-020` Planning proposals cannot purchase, transfer or change prices without the relevant approval.
- `PRD-EXC-021` Evaluate forecasting and planning against the configured horizon, baseline, quality measures and operational results.

## Opening, closure, migration and export

- `PRD-LIF-001` Combine shared Site readiness with separate business-unit approval for receiving, movement and selling.
- `PRD-LIF-002` Verify mappings, users/access, locations, devices, required policies and stock plan before enabling each activity.
- `PRD-LIF-003` Empty stock-operating units declare zero opening stock; non-stock offices need no fictitious stock opening.
- `PRD-LIF-004` Existing stock requires a reviewed manifest, physical verification, authorised variances, an opening PT and Site acceptance.
- `PRD-LIF-005` Require identity, quantity, location and valuation evidence for opening rows.
- `PRD-LIF-006` Permit explicitly selected and audited unknown historical season. It matches no season-specific offer and loosens no other opening requirement.
- `PRD-LIF-007` Preserve original opening evidence and past transaction snapshots when season is later established.
- `PRD-LIF-008` Opening stock creates no supplier delivery, booking, invoice, purchase liability or automatic accounting entry.
- `PRD-LIF-009` Import opening supplier/customer dues, advances, deposits and outstanding commercial stock separately; reconcile with the last closed books without double counting.
- `PRD-LIF-010` Import historical sales for reports only, preserving source identities.
- `PRD-LIF-011` Keep opening balances, historical reference and live corrections distinct, with defined cutover and reconciliation.
- `PRD-LIF-012` Support a side-by-side test in which the earlier POS remains the selling system for a Store.
- `PRD-LIF-013` During a side-by-side test, import that POS's daily sales report and stock-on-hand (SOH) report through saved approved layouts, with the same validation and duplicate controls as EBO imports.
- `PRD-LIF-014` Side-by-side test imports are evidence for checking and reports only. They never create, reduce or move stock.
- `PRD-LIF-015` Switch each Store over at a day close, with verified balances and a fresh bill series. After the switch, the earlier POS is kept for reference only.
- `PRD-LIF-016` A side-by-side test import never creates a tax invoice or a second sale for an externally issued bill.
- `PRD-LIF-017` During closure, stop new operations and settle stock, transit, reservations, custody, staff, cash, dues, books and exceptions.
- `PRD-LIF-018` Show remaining closure quantities and values by brand and owner.
- `PRD-LIF-019` Final retirement requires all outstanding items resolved; unresolved items cannot be waived solely to retire a unit.
- `PRD-LIF-020` Preserve identities and history after closure; reopening requires fresh readiness, mapping and access approval.
- `PRD-LIF-021` Relocation creates a new linked Site. Renaming does not replace the physical identity.
- `PRD-LIF-029` On relocation the Store keeps its code, name and history; its Site link moves to the new linked Site from the relocation date.
- `PRD-LIF-022` Export masters, documents, lines, stock/accounting movements, attachments, mappings and audit history with reconstructible relationships and reconciled totals.
- `PRD-LIF-023` Retain customer history and in-progress work through migration. Demo-data retirement cannot authorise deletion of real business records.
- `PRD-LIF-025` At a Store's switch count, label every piece of a piece-tracked profile that has no piece ID, and verify every piece ID counted. Plan each Store's labelling before its switch day.
- `PRD-LIF-026` Switch a Store only on production hosting. A side-by-side test on test hosting keeps the earlier POS as the system of record; it issues no tax invoice and bills no real customer.
- `PRD-LIF-027` At a Store's switch, its verified count becomes its opening stock under the opening rules. Reconcile the count with the earlier POS's last SOH and report every difference.
- `PRD-LIF-028` Count billed-retained items carried across a Store's switch (`POL-14.04`) apart from its opening stock. They are not opening stock under `PRD-LIF-027`. Their value follows the recognition rule the Financial posting policy sets.

## Operator experience

- `PRD-UXP-001` Provide persona-specific home screens with relevant numbers, tasks and approvals; daily actions are reachable within three navigation actions.
- `PRD-UXP-002` Provide scan/search, keyboard shortcuts, saved filters, bulk actions, comments, attachments and drill-through.
- `PRD-UXP-003` Show state, blocking reason and next action; preserve unfinished work.
- `PRD-UXP-004` Give Store users the operational areas they need: billing and till session, bills history, till sync, receiving, transfers, stock and counts, offers and pricing, money and day close, reports, damage and supplier returns, external sales imports and staff self-service. The list names capabilities and areas, not menu labels.
- `PRD-UXP-005` Give warehouse users expected arrivals, receiving/PT work, labels, putaway, pick/dispatch, supplier returns and counts.
- `PRD-UXP-006` MBO opening includes attendance, readiness checklist, opening cash and till start; day close includes counted cash, tender reconciliation and closing checklist.
- `PRD-UXP-007` EBO opening and close include the required reporting checklist, upload status and cash deposit work.
- `PRD-UXP-008` Accounts workbench combines cash/bank differences, supplier matching, claims, payment proposals, tax errors, Tally errors and close tasks.
- `PRD-UXP-009` Owner, Booking, Operations, Brand, HR and Admin workbenches expose their respective approvals and operating queues.
- `PRD-UXP-010` Provide one operational path for each business action. Historical records remain readable without a competing writable ledger.

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
| Hardware | Keyboard-input scanners; ESC/POS receipt printing, cash drawer and label printing via a local helper on any PC that has the printer; Tauri only for an unmet hardware requirement |
| Phone | React Native and Expo, sharing domain logic and schemas |
| Authentication | PostgreSQL server sessions, secure cookies, Argon2, OTP and TOTP; a maintained QR code library that draws the authenticator enrolment code inside the application, never through an external QR service |
| Files | S3-compatible document/photo interface; MinIO for local development |
| Documents | ExcelJS for supported Excel operations, format-specific import adapters, PDF extraction and HTML-to-PDF |
| Search | PostgreSQL full-text and trigram search |
| AI | Provider-neutral gateway, vision/document adapters, Zod validation and versioned prompts |
| Forecasting | Separate Python forecasting service; the only additional application language |
| Messaging | Email, WhatsApp Business Platform and SMS adapters |
| Diagnostics | pino structured JSON logs and OpenTelemetry-ready traces |
| Verification | Vitest, Playwright, Testcontainers with real PostgreSQL, ESLint and Prettier |
| Hosting | Test environments, including a customer's side-by-side test: Railway for the server, jobs, PostgreSQL, web app and counter PWA. Production hosting is chosen before the first Store switch |

### Module and data boundaries

- `PRD-MOD-001` Use a separate PostgreSQL database for each independent customer Organisation, containing its legal entities, Sites and books.
- `PRD-MOD-002` Each module owns its records and exposes a public interface; other modules do not access its tables ad hoc.
- `PRD-MOD-003` Reports use declared, authorised reporting views or read models through module interfaces, with visible as-of timestamps.
- `PRD-MOD-004` Share identity/access, configuration, audit, numbering, money/tax calculations, files/imports, inbox, notifications and the AI gateway.
- `PRD-MOD-005` Provide business modules for merchandise/PT, booking, receiving, stock, POS, EBO imports, offers, supplier returns, finance, partners, HR, exceptions, reports, planning and Site lifecycle.
- `PRD-MOD-006` Perform synchronous economic effects through module interfaces in one transaction; use the outbox for durable follow-up.
- `PRD-MOD-007` Write pricing, tax, discount allocation, rounding and incentive logic once in shared TypeScript, usable by server and counter.
- `PRD-MOD-008` Use UUIDv7 internal identifiers and unique scoped business codes; names are labels.
- `PRD-MOD-009` Store timezone-aware event/recording timestamps and explicit business dates under the Organisation's timezone.
- `PRD-MOD-010` Effective-date configuration without overlapping versions in the same scope; preserve the version used by each transaction.
- `PRD-MOD-011` Protect official document payloads and posted stock/accounting entries from update/delete. Append linked corrections and attributable lifecycle events; rebuildable status projections remain separate.
- `PRD-MOD-012` Derive stock balances from authoritative movements; rebuild without changing historical facts.
- `PRD-MOD-013` Enforce balanced journals per book at commit.
- `PRD-MOD-014` Store INR amounts in integer paise; other enabled currencies use their configured integer minor units. Use decimal arithmetic for intermediate calculations and explicit rounding rules; never use binary floating-point money calculations.
- `PRD-MOD-015` Preserve explicit currency, units and rounding rules. Unknown values remain distinct from zero.
- `PRD-MOD-016` Resolve the exact-cash UI shorthand into its declared cash amount before persistence; it is not the general meaning of a missing monetary value.
- `PRD-MOD-017` Show times on screens, and work out business dates, in the Organisation's configured timezone, whatever the device's time zone; store timestamps in UTC.

### Transaction and integration integrity

- `PRD-INT-001` Authenticate Organisation and actor, then check role assignment, action, entity/Site/brand and permitted fields.
- `PRD-INT-002` Use a scoped idempotency identity. Identical replay returns the original result; changed content under that identity is rejected and retained for investigation. An answer that showed a secret, such as an authenticator secret at enrolment, or a restricted value shown unmasked, is never repeated: its identical replay is refused and the request is started again.
- `PRD-INT-003` Acquire locks in a deterministic order and recheck authority, document version, state, independent approval and quantity under the locks.
- `PRD-INT-004` Commit number allocation, stock, monetary records, approval evidence, audit and outbox together or commit none.
- `PRD-INT-005` Concurrency cannot oversell, duplicate a return, overlap PT coverage or reserve the same quantity for two movements.
- `PRD-INT-006` Treat bank, GST, Tally and messaging acknowledgments as external outcomes, outside the local database transaction.
- `PRD-INT-007` Preserve request identities, pending/unknown/failed/succeeded outcomes, authenticated callbacks and safe reconciliation before retry.
- `PRD-INT-008` Outbox replay cannot duplicate downstream incentives, vouchers, claims, messages or exceptions.
- `PRD-INT-009` Connect TallyPrime through its XML/local gateway with file-export fallback and acknowledgment reconciliation.
- `PRD-INT-010` Connect GST through a licensed/approved GSP; use status lookup when IRN or e-way creation has an uncertain result.
- `PRD-INT-011` Support bank-specific payment files and CSV/Excel statements, card/UPI settlement imports and provider-specific live terminal adapters.
- `PRD-INT-012` Support approved EBO API/file adapters with the same identity and validation rules.
- `PRD-INT-013` Adapter replacement cannot alter the meaning of completed business records.

### Offline counter

- `PRD-OFF-001` Permit offline billing only through one exclusively authorised offline counter per Store.
- `PRD-OFF-002` Register devices online and allocate a device-specific bill series for each tax registration and financial year; devices cannot share a live series.
- `PRD-OFF-003` Delegate authority for 24 hours after online renewal. Expiry stops new finalisation without deleting work or releasing potentially consumed stock.
- `PRD-OFF-004` Cache authorised identities/aliases, eligible quantity, prices, offers and tax versions with a defined validity time. Block finalisation against an expired working set; do not send cost, margin or receipt-origin value to the till.
- `PRD-OFF-005` Record the working-set and authority versions on every bill.
- `PRD-OFF-006` Protect delegated selling quantities against central sale, reservation or dispatch until reconciled and explicitly released.
- `PRD-OFF-007` Before success or printing, commit bill, sequence advance, local quantity effects and pending-sync evidence in one IndexedDB transaction.
- `PRD-OFF-008` Before that commit, retain a recoverable cart; afterwards, retain an immutable recoverable bill.
- `PRD-OFF-009` Upload automatically and safely once; keep refused or conflicting bills in a visible reconciliation queue.
- `PRD-OFF-010` Device replacement requires old-queue reconciliation and a fresh series. A cloned/restored device cannot continue the previous identity.
- `PRD-OFF-011` Release protected quantity only while online after sequence/queue reconciliation and a durable local and central billing pause.
- `PRD-OFF-012` Use financial year plus next sequence for pause/release checks, including pauses crossing a year boundary. A missing reply leaves the counter paused.
- `PRD-OFF-013` Preserve pause through restart; resume only after online confirmation and a full fresh protected stock snapshot.
- `PRD-OFF-014` Flag and retain a bill received inside a paused interval; never discard it to clear a conflict.
- `PRD-OFF-015` Require returns and exchanges to use online authority. Do not enable an offline return or refund flow.
- `PRD-OFF-016` Refunds, Store-credit redemption, gift-voucher redemption, Customer credit sales, loyalty redemption, transfers, supplier/bank payment execution and actions needing fresh approval require online authority.
- `PRD-OFF-017` Enable offline cash/manual-tender recording only under its approved tender policy. It cannot assert online provider confirmation or settle a bank payment.
- `PRD-OFF-018` Block unknown items, ineligible quantity, expired authority and tax-document-dependent finalisation without the required evidence.
- `PRD-OFF-019` Handle incorrect clocks, duplicate tabs, full storage, app upgrade, device loss and connection loss without deleting a finalised bill.

### AI, security and operational reliability

- `PRD-SEC-001` Require password login plus the configured OTP/TOTP verification, using the application's PostgreSQL-backed sessions. Apply configured idle and absolute session expiry and reauthentication for protected actions.
- `PRD-SEC-002` Send AI requests through the gateway; validate structured output and retain permitted input references, model, prompt version, confidence and cost.
- `PRD-SEC-003` Keep AI extraction and recommendations as reviewable drafts. Every AI workflow has a manual route.
- `PRD-SEC-004` AI cannot independently post stock, money or tax.
- `PRD-SEC-005` Enforce access on APIs, search, reports, exports, files, jobs, notifications, live updates and AI answers, backed by PostgreSQL scope controls.
- `PRD-SEC-006` Encrypt restricted bank, identity and salary data at rest; mask/exclude fields and keep them out of unauthorised caches and logs.
- `PRD-SEC-007` Log sign-ins, permission changes and sensitive access; protect audit evidence from unauthorised alteration.
- `PRD-SEC-008` Revoke lost devices and sessions; offline delegation has a bounded expiry rather than an impossible promise of instant disconnected revocation.
- `PRD-SEC-009` Apply purpose-specific consent, notices, retention, deletion and legal-hold controls under applicable law.
- `PRD-SEC-010` Protect employee photos, location evidence, payroll data and customer contact information by role and retention policy.
- `PRD-SEC-011` Validate file types, sizes and parsing results; imported content cannot execute macros, active scripts or unapproved external links.
- `PRD-SEC-012` Provide reliable backup, restore verification and export recovery for records and attachments, with defined recovery-time and data-loss objectives.
- `PRD-SEC-013` Expose failed jobs, stale data, integration failures, missing uploads, stuck sync and recovery status to authorised operators.
- `PRD-SEC-014` Maintain correlated logs/traces and incident evidence without leaking secrets or unnecessary personal data.
- `PRD-SEC-015` Pin compatible dependencies and preserve reproducible lockfiles; validate schema changes and module boundaries.
- `PRD-SEC-016` Type checks, lint, calculation tests, database/concurrency tests and persona-specific browser journeys must pass for affected changes.
- `PRD-SEC-017` Use per-Organisation capability controls; switching on a feature cannot bypass missing policy or stock/accounting invariants.
- `PRD-SEC-018` Service identities are non-human actors with their own audit identity, scoped credentials and least-privilege access; they have no operator screens.
- `PRD-SEC-019` Disabling or ending a user takes effect as soon as it is approved: revoke every session of the user and refuse any new sign-in from that moment, not from the next business day.

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

- `PRD-PRF-001` Measure against the defined workload, devices and connection conditions.
- `PRD-PRF-002` External payment/IRN response, AI extraction and human review are separately measured; they are not hidden inside local commit targets.
- `PRD-PRF-003` Reporting, imports and background work must not delay counter finalisation.
- `PRD-PRF-004` Show freshness and incomplete results instead of presenting stale data as current.

## Required policy configuration

A policy-dependent operation remains unavailable until its required configuration, authority and evidence are valid. Suggested commercial, financial or permission values are never active defaults.

"Needed by stage" is the earliest stage at which any value of that policy is needed; each value's own stage is listed in the alignment report. Decided by names the personas that set and approve the policy. Needed by stage marks when its policy-dependent live operations may be enabled, not when design, development or synthetic-data tests may begin. Live activation requires a signed policy and validated real configuration; see [phases.md](phases.md). KDPS's answers are kept in [kdps-policies.md](kdps-policies.md).

| Policy | Required definition | Decided by | Needed by stage |
| --- | --- | --- | --- |
| Commercial ownership | Active stock models, legal owner, return rights, recognition and settlement rules by agreement | Owner, Accounts | 2 |
| Permissions and approvals | Role/action/field/scope assignments; production TOTP and session locks; amount/quantity limits and authorities for actions including refund cases selected under policy 7; independent checks; bulk-approval allowlist and stand-ins; phone/WhatsApp approval action types (`POL-02.22`); approve/reject reason list (`POL-02.23`); count variance tolerance/approval and movement during counts; day-close cash-variance tolerance/approval; exception owner/due/escalation, exception alert thresholds and recipients (`POL-02.25`, `PRD-EXC-013`), including missing EBO daily reports; daily summary time and recipients; material-change reapproval | Owner, Admin | 1 |
| Source conflicts and pricing | Authoritative cost, MRP, attribute and tax evidence; calculation profiles; unresolved-conflict treatment | Booking, Accounts | 2 |
| Merchandise tracking | Product profiles requiring batch/expiry or other tracking; units, pack conversions, required identifiers and expiry eligibility | Booking, Operations | 1 |
| Booking | Commitment, revision, cancellation, delivery-window and outstanding-balance rules | Owner, Booking | 2 |
| Customer returns | Ordinary return window and defective-item assessment, qualifying date, authorised Store overrides, permitted remedies, Store-credit and loyalty settings; cheaper-replacement rule (`PRD-RET-008`), replacement-SKU restrictions (`PRD-RET-009`) and refused-return evidence (`PRD-RET-015`) | Owner, Operations | 4 |
| Refunds and no-bill returns | Refund cases requiring independent approval; enabled online tenders, original-tender routing, no-bill eligibility/valuation and privileged evidence; Store credit and gift-voucher issuance/redemption rules; Customer credit limits and due dates; Bank transfer evidence; required customer notice/consent | Owner, Accounts | 4; Customer credit by 5 |
| Billed-retained | Custody, collection, alteration, cancellation, abandonment and financial recognition | Operations, Accounts | 4 |
| Financial posting | Recognition, cost formula/adjustment, cost pool, accounts, book mappings, rounding/invoice tolerances, petty-cash float/limits, Store P&L and brand-by-Store allocation bases, asset capitalisation/depreciation policy, vouchers and acknowledgments | Accounts, CA | 1; Store P&L allocation, asset policy, vouchers and acknowledgments by 5 |
| Statutory applicability | Registration, goods/rate classification, invoice-number format, sale-or-return tax, e-invoice/e-way, TDS and payroll rules; customer-return credit-note treatment (`POL-10.11`) | Accounts, CA | 2 (registration, goods/rate classification, sale-or-return tax); movement documents by 3; invoice-number format and e-invoice by 4; e-way creation by 5; TDS by 5; payroll by 6 |
| Official book | Authority and reconciliation evidence for moving the official book from the book the policy names | Owner, CA | 5 |
| Franchise/partner | Ownership, dispatch classification/price, commission, royalty, guarantees, credit and settlement, including EBO brand commission and settlement basis; onward commission authority (`PRD-PAY-013`, `POL-12.08`) | Owner, Accounts | 5 |
| Workforce | Employer/state/staff-group pay, leave, overtime, incentives and final-settlement policies | Owner, HR | 6 |
| Opening and cutover | Verified manifest, financial opening balances, cutoff, outstanding work and sign-off authority | Owner, Accounts, Operations | 4; before the pilot switch |
| Planning | Purpose, horizon, history quality, forecast measures and permitted approval/automation boundaries | Owner, Booking | 6 |
| Offline operation | Permitted offline tenders and their evidence, stock allocations, device authority, working-set validity time (`POL-16.07`) and conflict resolution | Owner, Operations | 4 |
| Held-goods outcomes | Pre-PT custody movement, wrong/unidentified acceptance, write-off/disposal authority/value, and any separate authorised donation/sale route for damaged goods | Owner, Operations, Accounts | 2; write-off and disposal by 3 |
| Recovery and retention | Recovery objectives, backup/export verification, retention schedules and legal holds | Owner, Admin | 1 |
| Offers and promotions | Offer stacking/combination rules, brand and Organisation cost shares, and markdown approval authority and workflow | Owner, Brand manager | 4 |

## Acceptance conditions

- `PRD-ACP-001` Invoice/booking quantities never create uncounted physical stock; clean accepted quantity can proceed while damage, excess or identity discrepancies remain held.
- `PRD-ACP-002` Primary/supplemental PT coverage cannot overlap, and a correction after sale/transfer preserves origins and respects dependent quantities.
- `PRD-ACP-003` Supplier, direct-store, opening and transfer goods all meet the same selling-Site acceptance and hold checks.
- `PRD-ACP-004` Missing pre-PT identity/value remains unknown during return, custody movement or disposal; no fictitious layer, zero value or payable is created.
- `PRD-ACP-005` Damage immediately blocks stock; independent rejection clears only the mistaken damage hold.
- `PRD-ACP-006` Transfer approval, multiple dispatches, whole-shipment counts, cancellation, shortage/damage and failed-delivery return reconcile every quantity without fake destination receipt.
- `PRD-ACP-007` Supplier departure alone does not complete an RTV; partial-pickup closure leaves no pending shipment or undispatched reservation.
- `PRD-ACP-008` Organisation return policy and authorised Store override apply correctly; original paid caps, current replacement price, refund state and physical disposition remain separate.
- `PRD-ACP-009` Concurrent returns and credit redemption cannot spend the same entitlement twice.
- `PRD-ACP-010` Changed offer totals, cash splits, explicit zero, invalid entry and repeated checkout produce one correctly paid immutable bill; printer failure produces no new sale.
- `PRD-ACP-011` Offline power loss, restart, expiry, full storage, duplicate tabs, wrong clock, device replacement, repeated upload and year-spanning pause preserve bills, quantities and numbering.
- `PRD-ACP-012` Duplicate/corrected EBO uploads affect stock, incentives and finance once, retain reported status and create no second GST invoice.
- `PRD-ACP-013` One physical Site with different business-unit books/registrations retains correct mappings and historical snapshots.
- `PRD-ACP-014` Opening unknown season excludes season-specific offers; later correction cannot rewrite past bills or labels.
- `PRD-ACP-015` Closure cannot retire unresolved stock, money or cases; reopening and relocation preserve the correct identities and history.
- `PRD-ACP-016` Purchase/partial receipt/dispute/credit/payment and sale/return/provider settlement reconcile through operational records, ledgers and Tally.
- `PRD-ACP-017` Attendance correction, returned-sale incentives and payroll replay preserve raw evidence and one approved period outcome.
- `PRD-ACP-018` Shared golden cases validate prices, discounts, tax, rounding, incentives and posting; real PostgreSQL concurrency and scoped browser journeys enforce the same rules.
- `PRD-ACP-019` Backup restoration and complete export reproduce linked records, attachments and control totals without reusing business identities.
- `PRD-ACP-020` Goods owned before receipt appear as inbound ownership, never as stock; they carry an amount only with invoice or agreement-price evidence, and close against the receipt count.
