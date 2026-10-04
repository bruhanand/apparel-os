# Access and store asks

> **Not ranked.** These notes describe the data KDPS sent. They decide nothing. A PRD or policy change they lead to needs an entry in [decisions.md](../decisions.md) first. See [README.md](README.md).

This note covers three things: the role grid the ERP team drew in July 2026 and how it compares with the PRD's 14 personas; what the data says about users and who is who; and the handwritten wish list from the stores, with the dashboard requirement, each mapped to PRD IDs where they exist.

- **Sources.** `scope-dashboard-detail/ERP_DASHBOARD_V1.xlsx`; `Q&A-req-recieved/MOM_S.xlsx`; `KDPS PT FILE SHEET.xlsx` (tab names and line counts only); sales exports (counts of salesperson values only); `store-requirements-users/` (two notebook pages in two copies each, and two HTML files the ERP team wrote).
- **Status of the grid.** The grid is the ERP team's proposal. It is not a KDPS decision. The role names come from an earlier version of the product ([personas.md](../design/access/personas.md) section 5 lists them: `owner`, `store_person`, `warehouse`, `brand_manager`, `accounts`, `it_admin`).
- **Privacy.** Staff names appear only as tab names of the PT file (file structure) and for the two people the MOM names as data providers. Salesperson names, staff bank and contact details are not copied.
- **Marks.** **(guess)** marks my reading. Counts are of what the files hold.
- **Related notes.** The PRD people, access and approval rules are applied in [access-and-approvals.md](../design/access/access-and-approvals.md). Metric definitions and the earlier analysts' figures: [analyses-and-metrics.md](analyses-and-metrics.md). Transfers: [transfers.md](transfers.md).

## 1. `ERP_DASHBOARD_V1.xlsx`

### 1.1 What the file is

- **Made by.** The ERP team, in openpyxl. The workbook properties say created 17 Jul 2026, last modified 24 Jul 2026 (modified by `user`); the file's modified time is 3 Aug 2026. Its notes use ERP-team words ("locked decision", "maker-checker rulings"). It is not a KDPS document and records no KDPS decision.
- **Sheets, in order.** `RBAC` (title `ROLE BASES ACCESS CONTROL`, spelling as given): 18 modules by 6 roles. `DFR` (`Dashboard Functional Requirement`): the dashboard measures. `SIDEBAR RBAC` (title `SIDEBAR SECTIONS - ROLE BASED ACCESS (24 Jul 2026)`): 12 sidebar sections by 6 roles, with three notes. `RBAC` and `DFR` came first (17 Jul); the sidebar sheet is dated 24 Jul.
- **No users.** The workbook names no person and holds no user list.

### 1.2 `RBAC` in full

Columns: `Module`, `Owner`, `Store POS`, `Warehouse`, `Brand Manager`, `Accounts`, `Admin`. Cell text as in the file.

| `Module` | `Owner` | `Store POS` | `Warehouse` | `Brand Manager` | `Accounts` | `Admin` |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard | All | Own Store | Warehouse | Assigned Brands | Finance | All |
| Sales Billing | NO | Create | View | View | View | All |
| Returns & Exchange | NO | Create | View | View | View | All |
| Customers | All | Create / Edit | View | View | View | Manage |
| Products | Full | NO | Full | Edit Assigned | View | Full |
| Inventory | Full | Own Store | Full | Assigned Brands | View | Full |
| Purchase Orders | Approve | NO | Draft | Create | View | Configure |
| Goods Receipt (GRN) | All | NO | Create | View | View | All |
| Stock Transfer | Override | Request | Execute | Approve | View | Monitor |
| Pricing | View | View | View | Recommend | View | Approve |
| Promotions | Approve | View | View | Recommend | View | Maintain |
| Discounts | Override | NO | NO | Approve (limit) | View | Configure |
| Expenses | All | Create | Create | View | View | Monitor |
| Finance | Full | NO | NO | NO | Full | NO |
| Reports | All | Store Only | All | Brand Only | All | All |
| User Management | Full | NO | NO | NO | NO | Full |
| Audit Logs | Full | NO | NO | NO | View | Full |

### 1.3 `SIDEBAR RBAC` in full

Role headers: `Owner`, `Store Person`, `Warehouse`, `Brand Manager`, `Accounts`, `Admin`. The first sheet calls the store role `Store POS`; this one calls it `Store Person`.

| `Section` | `Owner` | `Store Person` | `Warehouse` | `Brand Manager` | `Accounts` | `Admin` |
| --- | --- | --- | --- | --- | --- | --- |
| Home | All (network) | Own store | Warehouse | Assigned brands | Finance view | All |
| Sell | View | Create (bill, return, customer) | No | View | View | All |
| Booking | Approve | No | Draft | Create | View | Configure |
| Receive Goods | View all | Receive at store only (1) | Create (GRN, PT) | View | View | All |
| Transfer | Override | Request / Send / Receive | Execute (distribute, dispatch) | Approve | View | Monitor |
| Stock Count | View all + approve big variances | Count own store | Count warehouse | View assigned brands | View | All |
| Return to Brand | Approve | Mark damage only | Create & execute | View own brands | View (credit notes) | All |
| Stock | Full (all locations) | Own store | Full | Assigned brands | View | Full |
| Money | Full | Expenses only (create) | Expenses only (create) | No | Full | No (2) |
| Offers & Price | Approve / Override | View | View | Recommend + approve within limit | View | Configure |
| Reports | All | Own store only | All | Own brands only | All | All |
| Setup | Full | No | Products only | Edit assigned products | View | Full (incl. Users & Roles) |

The three notes under the table, as written:

1. "(1) Sheet 1 gives Store = NO for GRN, but the locked decision allows booking-less direct delivery to a store, so stores get receive-at-own-store only. To confirm."
2. "(2) Per Sheet 1: Admin has no Finance access (only Accounts and Owner). Kept deliberately."
3. "Stock Count and Return to Brand are not rows in Sheet 1; derived from the Inventory row + maker-checker rulings (counter != approver; store flags damage, only warehouse builds the return)." (no number in the file)

### 1.4 `DFR` in full

The sheet is a list of labels in merged cells, with no values, formulas or figures.

- **Today's Business Snapshot:** `Today's Sale`, `MTD Sales`, `Quantity Sold`, `Total Bills`.
- **Target vs Achivement** (spelling as given): the text "Link to be provides so that the landing page has the name of stores with target given and achivement".
- **Store Analysis:** the text "Link to be provided so that the landing page has Store wise:-", then a grid of three period columns `Todays`, `MTD`, `YTD`, each with the seven rows `Sale`, `Quantity Sold`, `Total Bills`, `Average Bill Value`, `Units per Transaction`, `Discount Value`, `Discount %`.

The mapping to PRD reports is in section 5.

### 1.5 Inconsistencies between the two sheets

- Owner on billing: `RBAC` says NO for `Sales Billing`; `SIDEBAR RBAC` says View for `Sell`.
- Warehouse on billing: View in `RBAC`; No in the sidebar.
- Store on goods receipt: NO in `RBAC`; "Receive at store only" in the sidebar (note 1 admits it).
- Warehouse on products: `Full` in `RBAC`; "Products only" under `Setup` in the sidebar.
- Pricing: `RBAC` lets Admin Approve and the Owner only View; the sidebar's `Offers & Price` gives the Owner "Approve / Override" and Admin "Configure".
- Customers: the sidebar has no Customers section; it is folded into `Sell` ("Create (bill, return, customer)").
- Role name: `Store POS` against `Store Person`.

## 2. How the grid compares with the PRD's 14 personas

### 2.1 The PRD side

The PRD lists 14 personas and says a persona sets the home screen and menu but grants no access. Only role assignments grant access, each with its own scope (`PRD-ACS-002`, `PRD-ACS-003`, `PRD-ACS-004`, `PRD-ACS-021`). KDPS's policy 2 starts from eleven editable role templates (`POL-02.01`): Owner, Store POS, Warehouse, Brand Manager, Accounts, Admin, Operations, HR, EBO staff, CA and Auditor. A template label alone grants nothing. The proposed template map is Open.

| ID | Persona | Work supported (PRD) | Template (proposed map in policy 2) |
| --- | --- | --- | --- |
| P-OWN | Owner | Business results, significant approvals, payments, offers and losses | Owner |
| P-ADM | Admin | Users, permissions, masters, configuration and integration administration | Admin |
| P-ACC | Accounts | Cash, bank, payables, receivables, claims, tax, journals, Tally and period close | Accounts |
| P-CHA | Chartered Accountant (CA) | Authorised book and report access, comments and document requests | CA |
| P-BKG | Booking | Buying plans, bookings, deliveries, merchandise and price-ticket preparation | Brand Manager |
| P-OPS | Operations | Distribution, transfers, counts, exceptions and Site lifecycle | Operations |
| P-WHS | Warehouse | Receiving, labels, putaway, picking, dispatch and supplier returns | Warehouse |
| P-BRM | Brand manager | Brand performance, assortment, pricing, offers and brand reporting | Brand Manager |
| P-STM | Store manager | Store operation, authorised discounts and returns, and day close | Store POS |
| P-CSH | Cashier | Billing, tender recording and authorised customer returns | Store POS |
| P-SLS | Salesperson | Sale attribution, targets and own incentive information | Store POS |
| P-EBO | EBO staff | Brand-report uploads, stock handling and petty cash | EBO staff |
| P-HRS | HR | Employee records, attendance, rosters, leave, incentives and payroll | HR |
| P-AUD | Auditor | Scoped read-only records and audit evidence | Auditor |

The six roles in the grid are exactly the first six templates of `POL-02.01`.

### 2.2 The six grid roles against the personas

| Grid role | Nearest personas | Where the grid and the PRD agree | Where they differ |
| --- | --- | --- | --- |
| `Owner` | P-OWN | Approves bookings (Purchase Orders), promotions, returns to brand and large count differences, and sees everything. The PRD's Owner approves bookings and the buying budget, offers, payments and write-offs | "Full" on Products and User Management, and "Override" on Stock Transfer and Discounts, are not Owner work in the PRD. Override has no PRD meaning (see 2.3) |
| `Store POS` / `Store Person` | P-STM, P-CSH and P-SLS together | Bills, returns, own-Store stock, count own Store, damage flagged by the store, reports for the own Store | One role for three personas. The PRD separates the cashier from the salesperson on a bill (`PRD-POS-002`) and gives the store manager authorised discounts and returns within a limit (`PRD-POS-003`). The grid gives `Store POS` "NO" on Discounts |
| `Warehouse` | P-WHS, and part of P-OPS (distribution, counts) | Receives and creates GRN and PT, executes and dispatches transfers, counts the warehouse, builds supplier returns | "Draft" on Purchase Orders and "Full" on Products. In the PRD, buying is P-BKG's work and masters are P-ADM's and P-BKG's (`PRD-BKG-001`, `PRD-MER-013`) |
| `Brand Manager` | P-BRM and P-BKG (the template map joins them) | Creates bookings, recommends prices and promotions, sees brand stock and reports for assigned brands | "Approve" on Stock Transfer and "Approve (limit)" on Discounts. The PRD sends transfers to a higher authority with a limit on cost (`PRD-TRF-005`, `PRD-ACS-015`); who holds each approval is Open (`POL-02.10`) |
| `Accounts` | P-ACC | Full on finance, view elsewhere, view on audit logs, expenses view | The grid is silent on payments approval, claims, Tally and period close, which are P-ACC work |
| `Admin` | P-ADM | Users, roles, configuration; no Finance (a deliberate note) | "All" on Sales Billing, Returns, Inventory, GRN and Reports and "Approve" on Pricing make Admin a super-user. The PRD describes Admin as users, permissions, masters, configuration and integrations, and a change to roles needs approval by a different authorised person (`PRD-ACS-023`) |

### 2.3 Mismatches

1. **Six roles against fourteen personas.** The grid has no Operations (P-OPS), HR (P-HRS), EBO staff (P-EBO), CA (P-CHA) or Auditor (P-AUD) role, and no self-service role for every employee (`PRD-ACS-022`). P-SLS and P-CSH sit inside Store POS, and P-BKG inside Brand Manager. Operations is the persona that holds distribution, transfers, counts and exceptions in the PRD, yet the grid gives those to Warehouse, Brand Manager and Owner.
2. **A role grants access in the grid; a persona does not in the PRD.** The PRD grants access only through role assignments with scope: entity, Site (whole Sites, or single Stores or business units), brand and fields, with effective dates and history (`PRD-ACS-001`, `PRD-ACS-004`, `PRD-ACS-005`, `PRD-ACS-021`). The grid has only words such as "Own Store" and "Assigned Brands".
3. **Broad words.** `All`, `Full`, `Manage`, `Configure`, `Monitor` and `Override` must be expanded into explicit view, create, edit, approve, cancel, export and override permissions (`POL-02.03`). "Override" has no counterpart: approval needs a different person from the preparer and a limit; a missing limit grants no authority; nobody approves their own work through another role (`PRD-ACS-006`, `POL-02.08`, `POL-02.09`).
4. **Approvals are mixed into access.** The grid lets the Owner approve purchase orders, Brand Manager approve transfers and discounts, and Admin approve pricing. The PRD keeps approval authority separate from ordinary access (`POL-02.05`), gives each limit a value basis (`PRD-ACS-015`, `PRD-ACS-016`), binds approval to the exact document version (`PRD-ACS-007`) and leaves the holders Open (`POL-02.10`, `POL-02.11`). Admin approving prices is the clearest conflict with the Admin persona.
5. **"User Management: Full" for both Owner and Admin.** Role, permission and approval-rule changes need approval by a different authorised person; the first Admin and the first approver are created together in one setup step (`PRD-ACS-023`). The grid has no prepare-and-approve split.
6. **Store POS cannot discount; the PRD has the store manager approve discounts and returns within a limit.** A cashier approves nothing, and a configured exceptional discount needs approval by a person other than the preparer (`PRD-POS-003`, `POL-02.07`). The store manager approves within a configured limit ([personas.md](../design/access/personas.md), P-STM).
7. **"Purchase Orders" is not a PRD record.** The PRD buys through bookings (`PRD-BKG-001`) approved against open-to-buy (`PRD-BKG-004`). The Owner approves the buying budget and Accounts checks it (`POL-05.09`).
8. **Warehouse "Create & execute" on Return to Brand and Store "mark damage only".** This matches today's practice, where debit notes are numbered by the warehouse (see [transfers.md](transfers.md) section 5). It is narrower than the PRD, which allows store-to-supplier returns and a different reviewer to confirm damage (`PRD-DMG-001`, `PRD-DMG-002`, `PRD-DMG-007`).
9. **"Approve big variances" on Stock Count for the Owner.** The PRD lets a configured tolerance select the approver and sends a larger difference to a higher approver with an owned exception (`PRD-STK-012`, `POL-02.21`). The tolerance is not set. "Counter is not the approver" agrees with `PRD-ACS-006`.
10. **No restricted fields.** The grid has no field-level rules. Cost, margin, salary, identity documents, bank details and customer contact need their own permissions (`PRD-ACS-008`, `POL-02.04`). `Products: Full` and `Inventory: Full` may expose cost; the data shows cost in every stock export.
11. **Whole areas are missing from the grid.** People and HR (attendance, rosters, payroll, targets, incentives); External sales (the earlier-POS import in the side-by-side test and EBO uploads); Partners (franchise statements); Setup pages for devices, integrations and policy readiness; day close and cash (the grid has only `Expenses`); and My work (one inbox for tasks, exceptions and approvals, `PRD-ACS-009`). The blueprint holds them ([ui-blueprint.html](../design/ui/ui-blueprint.html) section 3a and [personas.md](../design/access/personas.md)).
12. **Reports.** "Store Only" and "Brand Only" are scopes. Every report and export must be restricted to permitted data (`PRD-EXC-011`, `PRD-SEC-005`).
13. **Admin without Finance.** The note says it was kept deliberately. No PRD or policy rule says so. It is a choice for policy 2 (Owner, Admin).
14. **Names.** The grid says `Store POS` and `Store Person`; the earlier product said `store_person` (manager and staff merged); the PRD says P-STM, P-CSH, P-SLS.

### 2.4 Grid modules against PRD sections

| Grid module or section | PRD section it lands in |
| --- | --- |
| Dashboard, Home | Operator experience (`PRD-UXP-001`); Exceptions, reports and planning |
| Sales Billing, Sell | Counter sales and payments |
| Returns & Exchange | Customer returns, exchanges and credit |
| Customers | Customer purchase history (`PRD-RET-018`); customer phone is optional (`PRD-POS-012`) |
| Products, Setup | Merchandise and identifiers; Source conversion and imports |
| Inventory, Stock | Stock and warehouse control |
| Purchase Orders, Booking | Booking and buying |
| Goods Receipt (GRN), Receive Goods | Receiving and price tickets |
| Stock Transfer, Transfer | Transfers and physical movement |
| Stock Count | Stock and warehouse control (`PRD-STK-008` to `PRD-STK-012`) |
| Return to Brand | Damage, quarantine and disposal; Offers, prices and supplier returns |
| Pricing, Promotions, Discounts, Offers & Price | Offers, prices and supplier returns |
| Expenses | Cash, collections and bank (petty expenses, `PRD-CSH-004`) |
| Finance, Money | Finance and accounting |
| User Management | People, access and approvals |
| Audit Logs | The audit record (`PRD-ACS-013`) |

## 3. Users and who is who

### 3.1 The users list that never arrived

- **MOM item 13.** `Q&A-req-recieved/MOM_S.xlsx`, sheet `11.6.26`, row 13 reads `COMPLETE LIST OF PROBABLE SOFTWARE USERS AND THEIR PRIVILAGES` (spelling as given). The provider is `PRIYO`. The status cell is blank. It is the only requirement besides item 9 (`BANK API AND DOCUMANTATION`, meeting done) with no status.
- **The `USERS` sheet.** The second sheet of the same workbook is named `USERS` and is empty (range `A1:A1`, no value).
- **What this means.** No one has listed who will use the ERP, in which Store, with which role. The roles in `ERP_DASHBOARD_V1.xlsx` are not built on a user list. The PRD says the real person-to-persona, role and scope map stays unconfigured until KDPS supplies it (`POL-02.11`).
- **The workbook itself.** Its properties say `openpyxl`, 4 Oct 2026, while the file's modified time is 13 Jun 2026, so this copy was rewritten by a script.

### 3.2 The checklist and the two named data owners

The MOM sheet is a data-request checklist, dated by its sheet name `11.6.26`. Columns `SR NO.`, `REQUIREMENT LIST`, `PROVIDER`, then two columns without headers (status and a note). The provider is the KDPS person who is to give the item.

| `SR NO.` | `REQUIREMENT LIST` (as written) | `PROVIDER` | Status and note |
| --- | --- | --- | --- |
| 1 | BRAND NAME LIST | PRIYO | DONE |
| 2 | BRAND MARGIN | PRIYO | DONE |
| 3 | LAST MONTHS BRAND OFFERS | PRIYO | DONE; note `MADURA PENDING` |
| 4 | SUPPLIER LIST | PRIYO | DONE |
| 5 | SUPPLIER LIST WITH BRAND | PRIYO | DONE |
| 6 | BRAND PT FILE | PRIYO | DONE |
| 7 | WH TO STORE TRANSFER FORMAT | DEBANJAN | EXPLAINED |
| 8 | TEN SOFTWARE API WITH DOCUMANTATION | PRIYO | PROCESSED; note `MEETING DONE` |
| 9 | BANK API AND DOCUMANTATION | PRIYO | blank; note `MEETING DONE` |
| 10 | SALE REPORT FORMAT | DEBANJAN | DONE |
| 11 | SOH REPORT FORMAT | DEBANJAN | DONE |
| 12 | LIST OF ALL STORE USING SOFTWARE | PRIYO | DONE |
| 13 | COMPLETE LIST OF PROBABLE SOFTWARE USERS AND THEIR PRIVILAGES | PRIYO | blank |

- **Priyo** provides 10 of the 13 items: commercial data (brands, margins, offers, suppliers, PT files), the two API items and the user and store lists. **Debanjan** provides 3: the transfer format and the two earlier-POS report formats. Their roles at KDPS are not stated in any file (OPEN).
- **Item 3** says Madura's offers were still pending when it was written. They exist only as screenshots (see [offers-and-brand-reports.md](offers-and-brand-reports.md)).
- **No brand-margin file and no API documents** are in the data, although items 2 and 8 are marked done or processed and items 8 and 9 note a meeting. The transfer format has no file at all (item 7).
- **The call transcript.** `report-offer.md` (English translation of a call (about 19 Jun 2026) about the dummy Blackberry and Mufti offer report: offers applied from the AMM list at the best percentage; wish to club sales across days for the best benefit; refresh weekly or fortnightly) addresses two people as "Piyo Sir" and "Debanjan Ji". They are probably the same two people as the MOM's Priyo and Debanjan (guess).

### 3.3 PT-sheet tab owners (structure only)

`KDPS PT FILE SHEET.xlsx` is the KDPS PT template. It has one work sheet per person, each a copy of the same template. The tab names are the people. What each tab holds, by line count:

| Tab (as named in the file) | State | PT lines | Pieces | Brand and season |
| --- | --- | --- | --- | --- |
| `"OWNER" Work Sheet` | visible | 0 (formatted to 16,342 rows) | 0 | none |
| `"DEBANJAN" Work Sheet` | visible | 0 | 0 | none |
| `"MAHENDRA" Work Sheet` | visible | 1 | 90 | Tomboy; Jun-26 |
| `"Office" Work Sheet` | hidden | 0 | 0 | none |
| `"PRAVIN JI " Work Sheet` | hidden | 0 | 0 | none |
| `"NARESH" Work Sheet` | visible | 243 | 310 | Levis; Jun-26 |
| `"ANKIT" Work Sheet` | visible | 41 | 62 | Van Heusen; Jun-26 |
| `"SANTOSH" Work Sheet` | visible | 13 | 13 | Status Quo (12) and Flying Machine (1); May-26 |
| `"GULSHAN" Work Sheet` | visible (the tab name starts with a space) | 22 | 34 | Van Heusen innerwear; Jun-26 |

- **What it suggests (guess).** PT preparation is split by person and brand: one person per brand family. This is a brand-scoped preparer role (P-BKG or P-WHS) rather than one shared account (`PRD-ACS-001`, `PRD-ACS-021`). Concurrent edits need the side-by-side view of `PRD-PTW-005`.
- **The multiplier that drifted** between copies (`P RATE` = `BASIC` × 1.2 in six copies and 1.1 in three) is covered in [pt-file-layouts.md](pt-file-layouts.md).
- **Who they are is not stated.** Which Store, role or approval limit each person has is OPEN. The tab named `"OWNER" Work Sheet` is empty, so it does not show who the Owner is.

### 3.4 Salesperson attribution today

The earlier POS records a `SalesMan` on each bill line. Counts of distinct values per store file (names not copied; one value is the word `Admin`):

| Store file | Lines | Lines with a blank salesperson | Distinct values |
| --- | --- | --- | --- |
| Vaishnavi Deoghar, FY 25-26 | 15,285 | 384 (3%) | 8 |
| Vaishnavi Deoghar, 1 Apr to 13 Jun 2026 | 2,548 | 4 (0%) | 9 |
| Hazaribagh (`Sales_Hazaribagh.xlsx`, 4 Sep 2025 to 24 Jul 2026) | 26,195 | 8,011 (31%) | 16 |
| Jainsons FY 25-26 and FY 26-27 files | 17,039 and 7,397 | 5,543 (33%) and 2,026 (27%) | 13 and 14 |
| Banka, April 2026 | 1,586 | 0 (0%) | 6 |
| Sanskar, April 2026 | 51 | 2 (4%) | 7 |
| Allen Solly Deogarh, April 2026 (`AS SALE `) | 178 | 73 (41%) | 2 |
| `SALE REPORT FORMAT.xlsx` (Singh More, 12 to 13 Jun 2026) | 54 | 0 (0%) | 5 |

- **Blank values are mostly continuation lines.** In the Jainsons and Hazaribagh exports the salesperson sits on a bill's first line only, so it needs a fill-down. The Vaishnavi Deoghar exports repeat it on each line.
- **The word `Admin`** is the salesperson on 1,520 lines of Vaishnavi Deoghar's FY 25-26 file. A shared or default login recorded as a salesperson (guess).
- **The Singh More DSR has none.** The column `Sale Person` of the DSR `Sale` sheet is empty on all 4,780 lines, although the same store's POS export (`SALE REPORT FORMAT.xlsx`) names five people.
- **Across the files,** 46 distinct values (names as typed, not merged), at least 10 at Vaishnavi Deoghar and 17 at Hazaribagh. That is a floor on the number of counter staff. It is not a user list.
- **The PRD** attributes each line to a salesperson separately from the cashier (`PRD-POS-002`); the store note below asks for the same.

## 4. The store ops wish list

Source: `store-requirements-users/WhatsApp Image 2026-06-30 at 07.38.57.jpeg` and `...07.38.58.jpeg` (two notebook pages, headed "Store ops"), and the two PNG copies `store-ops-notes-2026-07-25-p1.png` and `-p2.png`. The two sets are the same two pages (same photo, same crop); the PNGs are re-saves dated 25 Jul. The ERP team's HTML files treat them as two separate requests; they are one list.

### 4.1 Every handwritten point, with its PRD home

| # | The note says (page 1 unless marked) | PRD home | Remark |
| --- | --- | --- | --- |
| 1 | Seven screens listed: 1 Sell; 2 "Reports" struck out, then "Inventory"; 3 a struck word, then "Reports"; 4 Barcode search / Item search; 5 Attendance; 6 Customer Search; 7 Member Details | `PRD-UXP-004` (Store areas: billing and till session, bills history, receiving, transfers, stock and counts, offers and pricing, money and day close, reports, damage and supplier returns, external sales imports, staff self-service) | The PRD lists capabilities, not menu labels (`PRD-UXP-004`). The stores' list has no day close, till, cash or petty cash |
| 2 | Sell: "interface" (nothing more written) | `PRD-POS-001` (bill by scan, search or size-colour selector); `PRD-UXP-001` | Details "to be discussed later" per the ERP team's reading |
| 3 | Inventory: Stock Receive | `PRD-REC-001`, `PRD-REC-004`, `PRD-REC-005`, `PRD-REC-021`, `PRD-REC-022`; a delivery without a booking: `PRD-BKG-008` | One Receive Goods inbox per Site. The grid lets a store receive at its own Store only |
| 4 | Inventory: Stock Transfer | `PRD-TRF-001` to `PRD-TRF-026`; `PRD-REC-001` (incoming transfers in the inbox) | See [transfers.md](transfers.md) |
| 5 | Inventory: one line struck out (not legible) | none | Nothing to map |
| 6 | Inventory: Voucher search | No exact home. In the PRD a voucher is a Tally entry (PRD "Words used"). Closest: `PRD-UXP-002` (scan, search, drill-through) and `PRD-REC-001` (Pending and History). Design: the blueprint's Home "Search results" (products, pieces, documents, bills) | The ERP team read it as transfer documents. Not confirmed (OPEN) |
| 7 | Inventory: PT file generation | `PRD-PTW-001` to `PRD-PTW-013` (workbench; canonical workbook export `PRD-PTW-003`; KDPS export profile `PRD-PTW-008`); `PRD-REC-014` to `PRD-REC-018`; labels `PRD-REC-020` | "Generation" may mean converting an incoming PT or producing an outgoing one. Not confirmed |
| 8 | A bracket joins the Inventory points to "Invoice upload (Madura?)" | `PRD-IMP-001` to `PRD-IMP-013`; `PRD-PTW-002` (supplier-file conversion); `PRD-REC-010` (invoice, GRN and PT comparison) | Madura sends one SAP extract for all its customers ([pt-file-layouts.md](pt-file-layouts.md)). The word is "Madura" with a question mark in the ERP team's reading |
| 9 | A bracket joins them to "Booking" | `PRD-BKG-001` to `PRD-BKG-013` | Booking is head-office work (P-BKG); the grid gives `Store Person` "No". Whether stores want to see or enter bookings is OPEN |
| 10 | Item Search: search item; search barcode; search brand | `PRD-STK-006` (stock search by product, brand, size, barcode, location, condition); `PRD-UXP-002`; `PRD-MER-006` (external barcodes) | Includes availability at other stores |
| 11 | Page 2. Attendance: "Post attendance with biometrics" | `PRD-HRM-004` (photo, location, time and registered device, without face matching). `PRD-PRO-010` puts facial recognition outside the product | A biometric device has no PRD home (section 4.2) |
| 12 | Attendance: view attendance (Leave, Delays, etc.); the word "Send" before it is struck | `PRD-HRM-006` (original events kept; regularisation separate), `PRD-HRM-007` (rosters, shifts, leave), `PRD-HRM-005` (spot checks), `PRD-UXP-006` (MBO opening includes attendance) | |
| 13 | Attendance: Send attendance | `PRD-HRM-014` (payroll inputs: days, leave, overtime) | To whom is not written (OPEN) |
| 14 | Customer Search: by Name, Phone Number, Bill No. | `PRD-POS-015` (search bills by customer, number and date range); `PRD-RET-018` (purchase history); customer phone is optional `PRD-POS-012`; customer contact is a restricted field `PRD-ACS-008` | |
| 15 | A boxed "Sell interface with details", then "after search return" and "Can Re print Only" | `PRD-POS-016` (reprint the same bill identity), `PRD-POS-014` (completed bills preserved), `PRD-ACS-014` | The stores themselves write "reprint only", which agrees with append-only bills |
| 16 | Member Details: Add / Remove members | `PRD-HRM-001` (employee identity, history, roles, exit) | The ERP team's 25 Jul note says "member" means staff, not loyalty customers |
| 17 | Update members (details can be updated): contact details, bank details | `PRD-HRM-002` (ID, bank, PAN, PF, ESI only within authorised workforce scope); `PRD-ACS-008` | Whether a Store may edit staff bank details is OPEN (policies 2 and 13) |
| 18 | Members monthly target | `PRD-HRM-009` (targets by Store, brand and salesperson); `POL-13.11` (actual targets not assumed) | |
| 19 | Members monthly achievement | `PRD-HRM-011` (POS and EBO evidence, salesperson attribution, return reversals), `PRD-HRM-012` (staff see their own target and incentive information), `PRD-POS-002` | |
| 20 | Growth / de-growth | none | No PRD measure. A comparison with a past period; `PRD-EXC-009` requires a definition for every metric (section 4.2) |
| 21 | Show members with "pie" | none | The June HTML reads it as a pie chart and the July HTML as a picture. Not confirmed (section 4.2) |
| 22 | Reports: Stock Report | `PRD-STG-001` (basic reports in every stage), `PRD-PRO-001`, `PRD-EXC-006` (ageing, sell-through, weeks of cover), `PRD-STK-006` | |
| 23 | Reports: Sales Report | `PRD-EXC-005` (sales by Store, brand, category, size, salesperson and hour) | |
| 24 | Reports: member-wise Report | `PRD-EXC-005` (by salesperson), `PRD-HRM-011` | Needs the salesperson on each line (`PRD-POS-002`); the Singh More DSR leaves it empty (section 3.4) |
| 25 | Reports: Item-wise Report | `PRD-EXC-005`, `PRD-EXC-006` | |
| 26 | Reports: Date Range Sales Report | `PRD-EXC-005`; saved filters `PRD-UXP-002` | |
| 27 | Reports: "etc." | `PRD-EXC-012` (brand sell-through, persona daily summaries), `PRD-EXC-004` | |

### 4.2 Points with no PRD home

- **A biometric attendance device.** The PRD allows an attendance photo, location, time and registered device, "without face matching" (`PRD-HRM-004`), and excludes facial recognition (`PRD-PRO-010`). No fingerprint or other biometric device is named in the PRD, the policies or the hardware row of the stack. Adding one needs a PRD change and a decision entry first. Owner: the product owner and KDPS Owner.
- **Growth and de-growth per member.** No PRD rule or measure compares a staff member's sales with a past period. If wanted, it needs a definition first (`PRD-EXC-009`).
- **Members with a picture or a pie.** No PRD rule gives a staff member a photo on a record (the attendance photo is evidence, not a profile picture) or a pie chart.
- **A Store editing staff bank details.** Allowed only inside an authorised workforce scope (`PRD-HRM-002`); who that is for stores is not set.
- **Voucher search** and **Send attendance** (to whom) are unclear rather than missing.

### 4.3 The ERP team's analyses of the note

- `store-requirements-vs-build-2026-06-30.html` and `store-ops-notes-vs-build-2026-07-25.html` were written by the ERP team for an earlier version of this product (guess: RetailsOps; they mention the Ten Software POS, an "alpha", issue #96, the PT Mapper with nine brand profiles and an Outbound module). Their "Built", "Planned" and "Not built" labels do not describe Apparel OS.
- **June file.** Lists the seven screens, marks Stock Receive, Invoice upload, PT file and Booking as built, and asks three questions: does KDPS own the customer, is attendance in scope, and what does "Member Details" mean. A 25 Jul note on the same file answers the third: members are staff.
- **July file.** Calls itself a second note and says the stores "asked twice" for attendance. The images show it is the same two pages. It proposes: pull a thin attendance slice forward, and park staff targets but record the salesperson on every bill.
- **What carries over.** The PRD already has the salesperson on every line (`PRD-POS-002`), reprint of the same bill (`PRD-POS-016`), attendance without face matching (`PRD-HRM-004`) and targets (`PRD-HRM-009`). The assumptions "the POS owns the customer" and "attendance is deferred" are not PRD rules.

## 5. The dashboard requirement against the PRD's reports

The dashboard requirement is the `DFR` sheet (section 1.4). The PRD has no "dashboard" requirement of this shape. Its nearest rules are persona home screens with relevant numbers (`PRD-UXP-001`) and the report rules in "Exceptions, reports and planning". Every metric needs one definition (`PRD-EXC-009`), sales are kept apart from collections and profit with an as-of time (`PRD-EXC-010`), totals drill to evidence (`PRD-EXC-011`), and reports read declared read models with visible as-of timestamps (`PRD-MOD-003`). The PRD's "Business measures" table holds operational goals (count accuracy, PT accuracy and so on), not these sales measures.

| `DFR` measure | PRD home | What the data shows about its definition |
| --- | --- | --- |
| `Today's Sale` | `PRD-EXC-005`, `PRD-EXC-009`, `PRD-EXC-010`, `PRD-UXP-001`; the 9 PM daily summary (`PRD-EXC-012`, `POL-02.14`) | Not defined: gross at MRP, net after discount, tax inside or outside, returns netted. A POS line has `Gross Amt`, `Disc Amt`, `Net Amount` and a bill-level `Bill Amount`; the DSR uses `NSV` (cash plus UPI plus card plus dues sale) |
| `MTD Sales` | the same | Month to date, calendar month. Not defined in the PRD |
| `Quantity Sold` | the same | A return is a negative-quantity line inside a bill. Free carry bags count as pieces in the POS: 7,027 pieces in the Hazaribagh sales file, 8,226 bags at ₹0 at Vaishnavi Deoghar in FY 25-26, 586 carry-bag lines at ₹7 in the Singh More DSR, 582 of them at 100% discount. Whether bags count is OPEN |
| `Total Bills` | the same; bill identity `PRD-POS-014`, `PRD-POS-020` | A bill may hold returns and sales together (724 of the 7,094 bills in the Hazaribagh file) |
| Target vs Achievement ("stores with target given and achievement") | `PRD-HRM-009` (targets by Store, brand and salesperson), `PRD-HRM-011`, `PRD-HRM-012`, `PRD-PRO-006`; `POL-13.07` and `POL-13.11` (schemes and actual targets not assumed) | No store target appears in any file. The only slab-like text is a stray note "NSV - 24lakh 1% 28lakh 2% 34lakh 3%" beside the Linen Club offers, which reads like an incentive slab (guess) |
| Store Analysis: `Todays`, `MTD`, `YTD` columns, per store | `PRD-EXC-005` (by Store); a financial-year basis for YTD (the year start is an Organisation setting with no default; [numbering-and-audit.md](../design/platform/numbering-and-audit.md) section 3.3) | The earlier analysts' reports compute these per store, from POS exports ([analyses-and-metrics.md](analyses-and-metrics.md)) |
| `Average Bill Value` | `PRD-EXC-009` (no PRD definition; `ABV` is not in the PRD's "Words used") | The brand offer files use "ABV" for a bill-value threshold, so the abbreviation already means two things (guess). Analyst figure: Vaishnavi Deoghar FY 25-26 sales ₹1.67 crore over 5,383 bills, average ₹3,108 (an analyst's number) |
| `Units per Transaction` | `PRD-EXC-009` (no PRD definition) | The analysts' pieces per bill is 3.7 or 2.7 depending on whether carry bags are counted |
| `Discount Value` | `PRD-EXC-009`; `PRD-POS-003`, `PRD-POS-023`, `PRD-OFR-021` | The POS holds offer discounts, manual discounts, free gifts (`Disc%` = 100) and amount-only overrides with `Disc%` = 0 in one column. Which count as discount is OPEN |
| `Discount %` | `PRD-EXC-009` | The denominator is not stated: gross MRP, or net. Analysts divide discount by the MRP value sold |

## Open questions

1. **The users list (MOM item 13).** Who will use the ERP, in which Store or office, with which role. Owner: KDPS Owner (the MOM names Priyo as the provider); Admin loads it. Blocks stage 1 (users, permissions) and every live operation (`POL-02.11`).
2. **Who made the grid and who confirms it.** Is `ERP_DASHBOARD_V1.xlsx` a proposal only, and are the six roles meant to be the first six templates of policy 2 (`POL-02.01`)? Owner: the product owner. Blocks stage 1.
3. **Who approves what, and up to what limit.** Transfers, discounts, pricing, bookings, stock counts above tolerance, write-offs. The grid names roles for these; policy 2 leaves them Open. Owner: KDPS Owner (`POL-02.09`, `POL-02.10`). Blocks stage 1 live approvals and stage 3.
4. **Admin's reach.** Should Admin hold billing, returns, inventory, GRN and pricing approval, as the grid says? The PRD describes Admin as users, permissions, masters, configuration and integrations. Owner: the product owner and KDPS Owner. Blocks stage 1.
5. **Admin and Finance.** Is "no Finance for Admin" wanted? Owner: KDPS Owner (policy 2). Blocks stage 1.
6. **Biometric attendance.** Do the stores really want a fingerprint or other biometric device? The PRD offers a photo, location and device only. A change needs a decision entry. Owner: KDPS Owner and HR. Blocks stage 6.
7. **Who may keep staff records at a store,** including bank and contact details (note "Member Details"), and who sees them. Owner: KDPS Owner and HR (`PRD-HRM-002`, `POL-02.04`). Blocks stage 6; the restricted-field rule is needed in stage 1.
8. **Growth, de-growth and the pie or picture of members.** Define or drop. Owner: KDPS Owner and HR. Blocks stage 6.
9. **Voucher search, PT file generation, Booking at a store.** What each means, and whether store staff place bookings. Owner: Operations and Booking. Blocks stage 2.
10. **Send attendance.** To whom, how often. Owner: HR. Blocks stage 6.
11. **Definitions for the dashboard measures.** Sale (gross, net, tax in or out), whether returns and free carry bags count in quantity and bills, MTD and YTD basis, average bill value, units per transaction, discount value and percentage. Owner: KDPS Owner and Accounts (`PRD-EXC-009`). Blocks the stage 4 reports; basic reports belong to every stage (`PRD-STG-001`).
12. **Store targets.** Who sets them, by what basis, and where the first values come from. Owner: KDPS Owner and HR (`POL-13.11`). Blocks stage 6.
13. **Whose dashboard is the landing page.** One page for the Owner or one per persona? Owner: the product owner (`PRD-UXP-001`). Blocks stage 1 home screens.
14. **Who the PT-sheet tab owners are,** which Store, role or brand each holds, and the approval limit of each. Owner: Booking and Admin. Blocks stage 2.
15. **Customer search.** Which store roles may see customer name and phone (a restricted field). Owner: KDPS Owner (`PRD-ACS-008`). Blocks stage 4.
16. **Salesperson on every line.** The Singh More DSR leaves `Sale Person` empty. Who records it, and is a shared login such as `Admin` allowed at the till? Owner: Operations. Blocks stage 4.
