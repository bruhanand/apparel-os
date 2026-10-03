# Personas

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Current**, 3 Oct 2026. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements these PRD sections: People, access and approvals; Operator experience; Franchise and partner accounts; HRMS and payroll. Policy: 2 (permissions and approvals).

Requirement and policy IDs applied: `PRD-ACS-001` to `PRD-ACS-009`, `PRD-ACS-015` to `PRD-ACS-021`, `PRD-UXP-001`, `PRD-UXP-004` to `PRD-UXP-010`, `PRD-TRF-005`, `PRD-CSH-011`, `PRD-FRN-007`, `PRD-SEC-018`; `POL-02.01` to `POL-02.11`, `POL-02.13` to `POL-02.21`; `POL-05.09`, `POL-13.13`, `POL-17.10`, `POL-19.05` (cited beside the persona cards that use them).

Used by: [design-language.md](../ui/design-language.md), [ui-blueprint.html](../ui/ui-blueprint.html) and [design-system.html](../ui/design-system.html).

---

## 1. The model

| Word | Meaning | Grants access? |
| --- | --- | --- |
| User | One person's login in one Organisation, with one My work. A person serving several Organisations has a user in each (`PRD-ACS-020`) | — |
| Persona | One of the PRD's 14 kinds of work, each with a short ID. A user can hold several | **No.** It sets the home screen, landing page, menu order, daily summary and test journeys |
| Role | A named set of permissions. KDPS starts from eleven editable templates (`POL-02.01`) | Yes: actions and fields |
| Role assignment | A user, a role, a scope (legal entity, brand, and places: whole Sites, or single Stores or business units within a Site, `PRD-ACS-021`) and effective dates | Yes, only inside its own scope |

Rules (PRD: People, access and approvals):

- A persona does not itself grant a transaction or approval. Only role assignments grant access (`PRD-ACS-002`, `PRD-ACS-003`).
- Approval authority and limits are separate from ordinary access (`POL-02.05`). Who approves what, and up to what limit, is set in policy 2 and stays OPEN until KDPS configures it (`POL-02.10`, `POL-02.11`).
- Independent approval needs a different person from the preparer, even when one user holds several personas (`PRD-ACS-006`, `POL-02.07`, `POL-02.08`).
- An action uses one assignment's permissions inside that assignment's scope. It never combines one assignment's action with another's fields or locations (`PRD-ACS-004`).
- Field restrictions (cost, margin, salary, bank details, customer contact) follow the role assignment, not the persona (`PRD-ACS-008`, `POL-02.04`).

## 2. The 14 personas

In PRD order. "Work" is the PRD text. "Lands on", "Menu" and "Usual scope" are design defaults; the real scope comes from each role assignment.

| ID | Persona | Group | Main screens | Lands on | Usual scope | KDPS template |
| --- | --- | --- | --- | --- | --- | --- |
| P-OWN | Owner | Owner | Back office, phone | My work › Approvals | All | Owner |
| P-ADM | Admin | Head office | Back office | Setup › Policy readiness | All (setup) | Admin |
| P-ACC | Accounts | Head office | Back office | Money › Accounts workbench | Entities in scope | Accounts |
| P-CHA | Chartered Accountant (CA) | Outside | Back office (read-mostly) | Money › Statutory calendar | Books in scope | CA |
| P-BKG | Booking | Head office | Back office | Booking › Bookings | Assigned brands | Brand Manager |
| P-OPS | Operations | Head office | Back office, phone | My work › Exceptions | Sites in scope | Operations |
| P-WHS | Warehouse | Warehouse | Back office, phone scan | Receive Goods › Inbox | Own Site | Warehouse |
| P-BRM | Brand manager | Head office | Back office | Reports › Sales for assigned brands | Assigned brands | Brand Manager |
| P-STM | Store manager | Store | Back office, till, phone | Home (own Store) | Own Store | Store POS |
| P-CSH | Cashier | Store | Till | Till sign-in | Own Store | Store POS |
| P-SLS | Salesperson | Store | Portal | Self-service › My targets | Own Store | Store POS |
| P-EBO | EBO staff | Store | Portal | Portal › Today | Own EBO | EBO staff |
| P-HRS | HR | Head office | Back office | People › Attendance | Employers in scope | HR |
| P-AUD | Auditor | Outside | Back office (read-only) | Setup › Audit log | Records in scope | Auditor |

**Phone and scan.** "Phone" means responsive web on a handset unless a separate phone client is placed in a stage. Camera scanning is **OPEN** (product owner); handheld or Bluetooth scanners follow the PRD Hardware row.

The template column follows the proposed, Open template map in policy 2 (eleven templates, `POL-02.01`). A template label alone grants no permission.

Menus. The sidebar for each persona lists every section where the access grid in [ui-blueprint.html](../ui/ui-blueprint.html) (section 3a) gives that persona more than "none", so a section is never granted and missing from the menu (`PRD-ACS-002`, `PRD-ACS-003`). Home appears where the grid gives it (the cashier, salesperson and EBO staff land on the till or the portal). Portal and Self-service are shells, not grid sections: each portal page sits under the section that holds it (Uploads under External sales; Petty cash and cash deposit under Money), and Self-service is granted only through a role assignment scoped to the person's own records (`PRD-ACS-002`, `PRD-ACS-003`, `DEC-041`).

Menu names are working labels. `PRD-UXP-004` lists Store capabilities and areas, not menu labels (`DEC-056`). Sell groups billing, bills and till session; Stock Count, Damage & supplier returns and External sales keep their own menus.

### Persona cards

Each card lists the approvals the persona's work involves. Who actually approves, and the limits, always come from policy 2.

**P-OWN · Owner**
- Work: business results, significant approvals, payments, offers and losses.
- Menu: Home (daily summary, approvals, exceptions) · Sell, Receive Goods, Transfer, Stock Count, Damage & supplier returns, Stock, External sales, People (view) · Booking (open-to-buy, approve) · Offers & price (approve) · Money (payments to approve) · Reports (all, profit, business measures) · Partners (approve) · Setup (policy readiness, approval limits, approve changes).
- Approvals in this work: payments, offers, bookings and the buying budget (`POL-05.09`), and anything routed up as the next approver, each only where policy 2 names the Owner (and, for offers, policy 19). Losses: Operations proposes write-offs and disposals and an independent approver acts within configured cost limits (`POL-17.10`). Whether the Owner approves losses or only sees them is **OPEN** (KDPS Owner, policy 2; blocks stage 3). The grid shows the Owner as View on Damage and Stock Count until then.

**P-ADM · Admin**
- Work: users, permissions, masters, configuration and integration administration.
- Menu: Home (My work) · Setup (users, roles, devices, saved layouts, integrations, policy readiness) · Reports (exports).
- Approvals in this work: prepares role, permission and approval-rule changes. Another authorised person approves them (`POL-02.07`).

**P-ACC · Accounts**
- Work: cash, bank, payables, receivables, claims, tax, journals, Tally and period close.
- Menu: Home (finance) · Money (all) · Receive Goods (invoice matching) · Damage & supplier returns (claims register) · External sales (settlement) · Partners (statements, ledgers) · Reports (all, profit) · Setup (posting maps) · Sell (bills), Booking, Transfer, Stock Count, Stock (value), Offers & price, People (payroll) as view only.
- Approvals in this work: supplier payments and supplier bank-detail changes, discrepancy settlements, refunds routed to finance, and day-close cash differences above the configured tolerance, where a higher approver is needed (`POL-02.13`, `PRD-CSH-011`). Accounts checks the buying budget (`POL-05.09`); the Owner approves it. The preparer and the approver are never the same person.

**P-CHA · Chartered Accountant (CA)**
- Work: authorised book and report access, comments and document requests.
- Menu: Home (own work) · Money (books and reports in scope, GST, statutory calendar, comments, document requests; `PRD-TAX-007`) · Reports (profit, in scope).
- Approvals in this work: none. Read and comment only.

**P-BKG · Booking**
- Work: buying plans, bookings, deliveries, merchandise and price-ticket preparation.
- Menu: Home (own work) · Booking (bookings, open-to-buy, supplier performance) · Receive Goods (PT work, mapping rules, new SKU proposals) · Stock (view) · Reports (sales and stock health for buying) · Setup (products, suppliers and agreements).
- Approvals in this work: prepares bookings, PTs and mapping rules. PT approval and mapping-rule confirmation need a different person (`POL-02.07`). Prepares the buying budget; Accounts checks it and the Owner approves it (`POL-05.09`).

**P-OPS · Operations**
- Work: distribution, transfers, counts, exceptions and Site lifecycle.
- Menu: Home (exception dashboard) · Transfer (in transit, approvals as set in policy 2) · Stock Count (plan, differences above the Store manager's limit as set in policy 2) · Damage & supplier returns (return deadlines, supplier returns) · External sales (earlier-POS imports, EBO uploads; view) · Setup (Site opening and closure) · Sell, Booking, Receive Goods, Stock, Offers & price, Reports as view only.
- Approvals in this work: proposes write-offs and disposals for independent approval within configured cost limits (`POL-17.10`). Transfers need approval by a higher authority: a different person whose approval limit covers the transfer on its cost basis (`PRD-TRF-005`, `POL-02.07`, `POL-02.09`). Supplier-return steps and stock adjustments need approval by an authorised person other than the preparer (`POL-02.07`); who holds those approvals is set in policy 2 and is **OPEN** (KDPS Owner; blocks stage 1 live approvals). Count differences above the Store manager's limit go to a higher authorised approver named in policy 2 (`POL-02.21`).

**P-WHS · Warehouse**
- Work: receiving, labels, putaway, picking, dispatch and supplier returns.
- Menu: Home (queues, My work) · Receive Goods (inbox, PT work to prepare and submit, labels, opening stock) · Transfer (pick, dispatch, receive) · Stock Count (own Site) · Damage & supplier returns (report damage, pick and dispatch returns) · Stock (own Site) · Booking (expected arrivals, read-only) · Reports (own Site).
- Approvals in this work: none of its own. It prepares GRNs, PTs and damage reports for others to approve.

**P-BRM · Brand manager**
- Work: brand performance, assortment, pricing, offers and brand reporting.
- Menu: Home (assigned brands) · Offers & price (draft offers, price lists) · Booking (assortment) · Stock (assigned brands) · Reports (sales by brand, stock health and sell-through).
- Approvals in this work: proposes offers, promotion cost shares and price changes. An authorised approver approves them before activation (`POL-19.05`, `POL-19.03`, policy 2); who that is stays **OPEN** (Owner and Brand manager, policy 19; blocks stage 4).

**P-STM · Store manager**
- Work: Store operation, authorised discounts and returns, and day close.
- Menu: Home (Store numbers, My work) · Sell (till, bills, customers, billed-retained, approvals within limit) · Receive Goods (own Store inbox) · Transfer (request, receive) · Stock Count (own Store, differences within limit) · Damage & supplier returns (report damage) · Stock (own Store, other Stores for sizes) · External sales (earlier-POS import during the side-by-side test) · Money (Store day, petty cash) · Offers & price (running offers) · Reports (own Store) · People (team attendance, view).
- Approvals in this work: discounts and returns within the configured limit; count differences within the configured count tolerance (`POL-02.21`); and day-close cash differences within the configured cash-variance tolerance, if the Store manager is in the approver set for it, with a higher approver above it (`POL-02.13`). The tolerances and limits come from policy 2 and are not yet set.

**P-CSH · Cashier**
- Work: billing, tender recording and authorised customer returns.
- Menu: Sell (till, bills, authorised returns) · Stock (lookup) · Offers & price (running offers).
- Approvals in this work: none. Discounts above the cashier's limit go to manager approval (F7).

**P-SLS · Salesperson**
- Work: sale attribution, targets and own incentive information.
- Menu: Sell (own attributed lines, read-only) · Stock (lookup, other Stores) · Offers & price (running offers) · Reports (own targets) · Self-service (targets and own incentives).
- Approvals in this work: none.

**P-EBO · EBO staff**
- Work: brand-report uploads, stock handling and petty cash.
- Menu: Portal (Today checklist · uploads, shown under External sales · petty cash and cash deposit, shown under Money) · Stock (own Store).
- Approvals in this work: none.

**P-HRS · HR**
- Work: employee records, attendance, rosters, leave, incentives and payroll.
- Menu: Home (own work) · People (records, attendance, rosters, leave, incentives, payroll inputs) · Reports (staff reports in scope).
- Approvals in this work: prepares payroll inputs and attendance regularisation. Payroll approval needs a different person (`POL-13.13`, `POL-02.07`).

**P-AUD · Auditor**
- Work: scoped read-only records and audit evidence.
- Menu: all sections read-only within scope · Setup (audit log).
- Approvals in this work: none.

Approve permissions that no card names (PT approval, damage confirmation, stock adjustments, write-offs and disposals, supplier-return steps) are permissions assigned under policy 2 (`POL-02.07`). No persona holds them by default; the real holders are **OPEN** (KDPS Owner, policy 2; blocks stage 1 live approvals).

## 3. Several personas on screen

- One login and one My work across all personas, within one Organisation (`PRD-ACS-020`).
- The sidebar is the union of the sections the user's role assignments grant. A section appears once, with the tabs of every persona merged.
- Home shows one block per persona held. The user picks which persona's home opens first; by default it is the first assignment.
- An action is enabled only where one role assignment covers the current scope. Otherwise it is disabled and the reason names what is missing, for example "Your Store manager assignment covers BLR01 only".
- A user who prepared a record can never approve it through another persona.
- At the till, a person bills as themselves. Manager approval (F7) comes from a different authorised person whenever policy 2 makes it independent.
- Daily summaries follow personas. Recipients are a policy 2 value; channel and time are set (`POL-02.14`).

## 4. Not personas

| Who | How they are handled |
| --- | --- |
| Every employee | Self-service (attendance check-in, own targets, own incentives, payslips) is granted only through a role assignment scoped to the person's own records (`PRD-ACS-002`, `PRD-ACS-003`, `PRD-HRM-012`) |
| Partner users | They hold Store personas (P-STM, P-CSH, P-SLS) on their own Stores only. Their statements and ledger come from a permission (PRD: Franchise and partner accounts; `PRD-FRN-007`) |
| Service identities | Non-human actors with their own audit identity and least-privilege scope; no screens (`PRD-SEC-018`) |
| Customers, suppliers | No login. They appear as records |

## 5. Where the earlier codes land

History only. RetailsOps, the earlier version of this product, used these codes. They are not requirements.

| Earlier code | Now |
| --- | --- |
| C-OWN Company owner | P-OWN |
| C-FIN Finance | P-ACC |
| M-STR Store manager | P-STM |
| M-CSH Cashier / counter staff | P-CSH |
| C-WHO Warehouse operator | P-WHS |
| E-RPT EBO reporter | P-EBO |
| C-HRA HR administrator | P-HRS |
| X-PLT Platform administrator | P-ADM inside an Organisation. Running the platform itself is not a persona |
| C-PMO Product master owner | P-BKG (merchandise) and P-ADM (masters) |
| C-INV Inventory controller / PT approver | P-OPS for counts and discrepancies. PT approval is a permission (policy 2), not a persona |
| C-BUY Buyer / merchandiser | P-BKG buys, P-OPS distributes, P-BRM runs offers |
| C-CAO Commercial agreement owner | P-BKG prepares; the approver comes from policy 2 |
| C-STO Site transition owner | P-OPS (Site lifecycle) |
| X-FRN Franchise partner | Store personas on the partner's own Stores (section 4) |
| C-PAY Payroll reviewer | An approval permission held by someone other than the HR preparer |
| C-EMP Employee | Self-service, not a persona |
| C-ANL Analytics user | Report access granted by role, not a persona |
| X-SVC Support / service identity | A service identity, not a persona (`PRD-SEC-018`) |
| RBAC v1 roles: owner, store_person, warehouse, brand_manager, accounts, it_admin | The first six of the eleven KDPS templates in policy 2 (`POL-02.01`). store_person (Store manager and staff merged) is now Store POS, serving P-STM, P-CSH and P-SLS |
| Extra roles: ho_ops, promo, data_steward, hr_admin, payroll_reviewer, franchise_partner, ebo_reporter, analyst | P-OPS, P-BRM, P-BKG and P-ADM, P-HRS, an approval permission, Store personas, P-EBO, a report permission |

## 6. Open items
<!-- deps: POL-02.01, POL-02.02, POL-02.07, POL-02.10, POL-02.11, PRD-FRN-007, POL-12.04, DEC-041, DEC-042 — open policy 2 and 12 items on roles, approvers, self-service and partner visibility -->

| Item | Who decides | Needed by |
| --- | --- | --- |
| Which people hold which personas, roles and scopes | KDPS, policy 2 | Each live operation |
| Who holds the roles built from the Operations, HR, EBO staff, CA and Auditor templates (P-OPS, P-HRS, P-EBO, P-CHA, P-AUD) | KDPS, policy 2 | Their first live work |
| Which people hold the approve permissions for PT approval, damage confirmation, stock adjustments, write-offs and supplier-return steps; whether the Owner approves losses; the limits | KDPS Owner, policy 2 | Stage 1 live approvals |
| What partner users may see in their statements and ledger | KDPS, policies 2 and 12 | Stage 5 |
| Which template or role assignment carries own-record self-service | Product owner | Stage 1 access; stage 6 HRMS self-service |
