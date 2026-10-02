# Personas

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Current**, 2 Oct 2026. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements these PRD sections: People, access and approvals; Operator experience; Franchise and partner accounts; HRMS and payroll. Policy: 2 (permissions and approvals).

Used by: [design-language.md](../ui/design-language.md), [ui-blueprint.html](../ui/ui-blueprint.html) and [design-system.html](../ui/design-system.html).

---

## 1. The model

| Word | Meaning | Grants access? |
| --- | --- | --- |
| User | One person: one login and one My work | — |
| Persona | One of the PRD's 14 kinds of work, each with a short ID. A user can hold several | **No.** It sets the home screen, landing page, menu order, daily summary and test journeys |
| Role | A named set of permissions. KDPS starts from 6 editable templates (policy 2) | Yes: actions and fields |
| Role assignment | A user, a role, a scope (legal entity, Site, Store, business unit, brand) and effective dates | Yes, only inside its own scope |

Rules (PRD: People, access and approvals):

- A persona does not itself grant a transaction or approval. Only role assignments grant access.
- Approval authority and limits are separate from ordinary access. Who approves what, and up to what limit, is set in policy 2.
- Independent approval needs a different person from the preparer, even when one user holds several personas.
- An action uses one assignment's permissions inside that assignment's scope. It never combines one assignment's action with another's fields or locations.
- Field restrictions (cost, margin, salary, bank details, customer contact) follow the role assignment, not the persona.

## 2. The 14 personas

In PRD order. "Work" is the PRD text. "Lands on", "Menu" and "Usual scope" are design defaults; the real scope comes from each role assignment.

| ID | Persona | Group | Main screens | Lands on | Usual scope | KDPS template |
| --- | --- | --- | --- | --- | --- | --- |
| P-OWN | Owner | Owner | Back office, phone | My work › Approvals | All | Owner |
| P-ADM | Admin | Head office | Back office | Setup › Policy readiness | All (setup) | Admin |
| P-ACC | Accounts | Head office | Back office | Money › Accounts workbench | Entities in scope | Accounts |
| P-CHA | Chartered Accountant (CA) | Outside | Back office (read-mostly) | Money › Statutory calendar | Books in scope | No template yet |
| P-BKG | Booking | Head office | Back office | Booking › Bookings | Assigned brands | Brand Manager |
| P-OPS | Operations | Head office | Back office, phone | My work › Exceptions | Sites in scope | No template yet |
| P-WHS | Warehouse | Warehouse | Back office, phone scan | Receive Goods › Inbox | Own Site | Warehouse |
| P-BRM | Brand manager | Head office | Back office | Reports › Assigned brands | Assigned brands | Brand Manager |
| P-STM | Store manager | Store | Back office, till, phone | Home (own Store) | Own Store | Store POS |
| P-CSH | Cashier | Store | Till | Till sign-in | Own Store | Store POS |
| P-SLS | Salesperson | Store | Portal | Self-service › My targets | Own Store | Store POS |
| P-EBO | EBO staff | Store | Portal | Portal › Today | Own EBO | No template yet |
| P-HRS | HR | Head office | Back office | People › Attendance | Employers in scope | No template yet |
| P-AUD | Auditor | Outside | Back office (read-only) | Setup › Audit log | Records in scope | No template yet |

The template column follows the proposed, Open template map in policy 2.

### Persona cards

Each card lists the approvals the persona's work involves. Who actually approves, and the limits, always come from policy 2.

**P-OWN · Owner**
- Work: business results, significant approvals, payments, offers and losses.
- Menu: Home (daily summary, approvals, exceptions) · Reports (all, profit, business measures) · Money (payments to approve) · Booking (open-to-buy) · Setup (policy readiness, approval limits).
- Approvals in this work: payments, offers, losses, bookings, and anything routed up as the next approver.

**P-ADM · Admin**
- Work: users, permissions, masters, configuration and integration administration.
- Menu: Setup (users, roles, devices, layouts, integrations, policy readiness) · Reports (exports).
- Approvals in this work: prepares role, permission and approval-rule changes. Another authorised person approves them.

**P-ACC · Accounts**
- Work: cash, bank, payables, receivables, claims, tax, journals, Tally and period close.
- Menu: Money (all) · Receive Goods (invoice matching) · Damage & supplier returns (claims register) · Partners (statements, ledgers) · Reports (profit).
- Approvals in this work: supplier payments and supplier bank-detail changes, discrepancy settlements, refunds routed to finance.

**P-CHA · Chartered Accountant (CA)**
- Work: authorised book and report access, comments and document requests.
- Menu: Money (books and reports in scope, comments, document requests) · Reports (profit, GST).
- Approvals in this work: none. Read and comment only.

**P-BKG · Booking**
- Work: buying plans, bookings, deliveries, merchandise and price-ticket preparation.
- Menu: Booking (bookings, open-to-buy, suppliers and agreements) · Receive Goods (PT work, mapping rules, new SKU proposals) · Reports (supplier performance).
- Approvals in this work: prepares bookings, PTs and mapping rules. PT approval and mapping-rule confirmation need a different person.

**P-OPS · Operations**
- Work: distribution, transfers, counts, exceptions and Site lifecycle.
- Menu: Home (exception dashboard) · Transfer (approve, in transit) · Stock Count (plan, approve differences) · Damage & supplier returns (return deadlines, supplier returns) · External sales (daily comparison, EBO uploads) · Setup (Site opening and closure).
- Approvals in this work: transfers, count differences, supplier-return steps, stock adjustments and write-offs.

**P-WHS · Warehouse**
- Work: receiving, labels, putaway, picking, dispatch and supplier returns.
- Menu: Home (queues, My work) · Receive Goods (inbox, PT work to prepare and submit, labels, opening stock) · Transfer (pick, dispatch, receive) · Stock Count (own Site) · Damage & supplier returns (report damage, pick and dispatch returns) · Stock (own Site) · Booking (expected arrivals, read-only).
- Approvals in this work: none of its own. It prepares GRNs, PTs and damage reports for others to approve.

**P-BRM · Brand manager**
- Work: brand performance, assortment, pricing, offers and brand reporting.
- Menu: Home (assigned brands) · Offers & price (draft offers, price lists) · Booking (assortment) · Stock (assigned brands) · Reports (brand performance).
- Approvals in this work: offers and price changes for assigned brands.

**P-STM · Store manager**
- Work: Store operation, authorised discounts and returns, and day close.
- Menu: Home (Store numbers, My work) · Sell (till, bills, customers, billed-retained, approvals within limit) · Receive Goods (own Store inbox) · Transfer (request, receive) · Stock Count (own Store) · Damage & supplier returns (report damage) · Stock (own Store, other Stores for sizes) · External sales (old POS import during the test) · Money (Store day, petty cash) · Offers & price (running offers) · Reports (own Store).
- Approvals in this work: discounts and returns within the configured limit, and the Store's day close.

**P-CSH · Cashier**
- Work: billing, tender recording and authorised customer returns.
- Menu: Sell (till, bills, authorised returns) · Stock (lookup) · Offers & price (running offers).
- Approvals in this work: none. Discounts above the cashier's limit go to manager approval (F7).

**P-SLS · Salesperson**
- Work: sale attribution, targets and own incentive information.
- Menu: Sell (own attributed lines, read-only) · Stock (lookup, other Stores) · Self-service (targets and own incentives).
- Approvals in this work: none.

**P-EBO · EBO staff**
- Work: brand-report uploads, stock handling and petty cash.
- Menu: Portal (Today checklist, uploads, petty cash, cash deposit) · Stock (own Store).
- Approvals in this work: none.

**P-HRS · HR**
- Work: employee records, attendance, rosters, leave, incentives and payroll.
- Menu: People (all) · Reports (attendance, staff).
- Approvals in this work: prepares payroll inputs and attendance regularisation. Payroll approval needs a different person.

**P-AUD · Auditor**
- Work: scoped read-only records and audit evidence.
- Menu: all sections read-only within scope · Setup (audit log).
- Approvals in this work: none.

## 3. Several personas on screen

- One login and one My work across all personas.
- The sidebar is the union of the sections the user's role assignments grant. A section appears once, with the tabs of every persona merged.
- Home shows one block per persona held. The user picks which persona's home opens first; by default it is the first assignment.
- An action is enabled only where one role assignment covers the current scope. Otherwise it is disabled and the reason names what is missing, for example "Your Store manager assignment covers BLR01 only".
- A user who prepared a record can never approve it through another persona.
- At the till, a person bills as themselves. Manager approval (F7) comes from a different authorised person whenever policy 2 makes it independent.
- Daily summaries follow personas. Who receives them, and through which channel, are policy 2 values.

## 4. Not personas

| Who | How they are handled |
| --- | --- |
| Every employee | Self-service (attendance check-in, own targets, own incentives, payslips) comes with an employee record (PRD: HRMS and payroll; Operator experience) |
| Partner users | They hold Store personas (P-STM, P-CSH, P-SLS) on their own Stores only. Their statements and ledger come from a permission (PRD: Franchise and partner accounts) |
| Service identities | Non-human actors with their own audit identity and least-privilege scope; no screens |
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
| X-SVC Support / service identity | A service identity, not a persona |
| RBAC v1 roles: owner, store_person, warehouse, brand_manager, accounts, it_admin | The 6 KDPS templates in policy 2. store_person (Store manager and staff merged) is now Store POS, serving P-STM, P-CSH and P-SLS |
| Extra roles: ho_ops, promo, data_steward, hr_admin, payroll_reviewer, franchise_partner, ebo_reporter, analyst | P-OPS, P-BRM, P-BKG and P-ADM, P-HRS, an approval permission, Store personas, P-EBO, a report permission |

## 6. Open items

| Item | Who decides | Needed by |
| --- | --- | --- |
| Which people hold which personas, roles and scopes | KDPS, policy 2 | Each live operation |
| Who holds the five personas without a template (P-OPS, P-HRS, P-EBO, P-CHA, P-AUD) | KDPS, policy 2 | Their first live work |
| What partner users may see in their statements and ledger | KDPS, policies 2 and 12 | Stage 5 |
