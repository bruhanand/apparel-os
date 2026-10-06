# Stage 1 — Shared foundation: spec

Status: ready-for-agent

> **Not ranked.** One spec for the whole of stage 1 of [phases.md](../../phases.md), written 6 Oct 2026 from the designs and the product owner's grilling answers of the same day. It decides nothing: the PRD, the policies and the designs win over it. Where a design still says otherwise, the design is edited to match these answers (listed in Further Notes) before the code that depends on it. Feature details, tickets and status stay in [README.md](README.md) and each feature folder.

## Problem Statement

KDPS runs apparel, footwear and packaged-goods Stores on an earlier POS and spreadsheets. Nothing ties a piece of stock to its place, owner, price ticket and accounting value; structure, masters and access live in people's heads and files; anyone with a login can change anything, and nothing proves who approved what. Before any goods-in, transfer, selling or accounting workflow can be built, the product needs a foundation that every later stage posts through: who the people are and what each may do, how the business is structured, what the products and parties are, how numbers and history are kept, how stock and money are recorded, how prices and taxes are calculated identically on server and counter, how files come in, and how everything is backed up and restored.

None of this is live in stage 1. It must be built and proved on synthetic data, with every KDPS-valued setting left OPEN, so that later stages can switch on real operations as soon as KDPS signs the policies.

## Solution

A synthetic Organisation can be set up, signed into and administered end to end:

- A one-time setup step creates the Organisation with its first Admin and first approver. People sign in with the Organisation code, a password and an authenticator code. Every access change is prepared by one person and approved by a different one from My work, and all of it shows in history.
- Admin and Operations build legal entities, registrations, books, Sites, Stores, business units and locations; a different person verifies each unit's mapping. Booking maintains brands, vocabularies, SKUs, codes, tracking profiles, parties and dated agreements, with proposals confirmed by another person.
- Policies show their readiness; every capability ships off; an operation whose policy is not configured, or whose Site activity is not granted, stays unavailable and says why.
- Numbers are gapless; exceptions have owners and due times; audit history is append-only and sealed.
- Accounts sets up books, maps and periods. On synthetic data, the golden scenarios post stock movements and balanced journals together, under both cost formulas and both pool modes.
- The shared calculations price bills identically on the server and in the counter's browser build.
- Masters load from XLSX files through staging, review and publishing, without duplicates. Opening-data layouts are proved on synthetic data, never published without policy 14.
- Billing devices are registered with their own bill series; offline billing itself waits for stage 4.
- A backup restores into a fresh environment with linked records and attachments.

Two demos on Railway `dev` mark progress: **Demo 0** proves deployment, migrations and the web shell; **Demo 1** proves setup, sign-in, permissions and independent approval.

## User Stories

Personas are those of [personas.md](../../design/access/personas.md). "Platform operator" (who runs operator commands) and "builder" are not PRD personas.

### Setup and sign-in

1. As a platform operator, I want a one-time operator command that creates and migrates a new Organisation's database and creates its first Admin and first approver, so that the first access change has someone to approve it (`PRD-ACS-023`, `DEC-101`, `DEC-112`).
2. As a platform operator, I want an identical rerun of setup to resume or answer as a duplicate, and a conflicting one refused without naming what differs, so that setup never creates users twice or leaks data (`DEC-112`, `PRD-SEC-014`).
3. As the first approver, I want my setup role to grant only viewing and approving what the first Admin prepares, so that I can never be a preparer (`PRD-ACS-006`).
4. As the first Admin, I want to create and edit users, roles, assignments, approval rules and reasons, with no approve, export or restricted-field rights, so that I can set up access without power over business data (`DEC-112`, `POL-02.07`).
5. As any user, I want to sign in with the Organisation code, my login, my password and an authenticator code, so that only I can use my account (`PRD-SEC-001`, `POL-02.17`, `DEC-093`).
6. As any user, I want one generic refusal whichever part of sign-in was wrong, so that an attacker learns nothing (`PRD-SEC-014`).
7. As an Admin, I want every sign-in attempt in a known Organisation in the access record, and an unknown code noted only in the service log without what was typed, so that attempts can be reviewed (`PRD-SEC-007`).
8. As a new user, I want my first sign-in to reach only authenticator enrolment and a new password, so that a temporary password cannot be misused (`PRD-SEC-001`).
9. As a user, I want my authenticator secret shown once and never again, even on a repeated request, so that it cannot leak (`PRD-INT-002`, `DEC-113`).
10. As a user, I want to change my own password after a fresh authenticator code, without any role assignment, so that I control my credential (`PRD-SEC-001`).
11. As a user, I want a cookie carrying another or an unknown Organisation code to reach nothing, so that Organisations stay isolated (`PRD-ACS-020`, `PRD-ORG-002`).

### Sessions and protected actions

12. As an office user, I want my session to lock after the idle limit and keep my unfinished work, restricted fields excluded, and unlock with my password, so that a walk-away is safe and nothing is lost (`PRD-ACS-017`, `POL-02.18`, `PRD-UXP-003`).
13. As a user, I want my session to end at its absolute limit, with drafts offered back after I sign in again, so that long sessions expire without losing work (`PRD-ACS-017`).
14. As an Admin, I want to revoke one session, all of a user's sessions or all of a device's, effective at the next request, so that access can be cut fast (`PRD-SEC-008`).
15. As an Admin, I want disabling a user to take effect only when a different person approves it, revoking their sessions in the same transaction, so that no one locks others out alone (`PRD-SEC-008`, `DEC-112`).
16. As an approver, I want deciding an approval, changing access, changing bank details, showing or exporting an encrypted field and resetting a credential each to ask for a fresh authenticator code, so that sensitive actions prove presence (`PRD-SEC-001`).
17. As a holder of the credential-reset permission, I want to reset another user's lost password or authenticator, revoking their sessions and never my own, so that lost credentials are recoverable safely (`PRD-SEC-008`).

### Roles, scope and approvals

18. As an Admin, I want to build roles from the KDPS templates, with broad labels expanded into explicit actions, so that what a role grants is exact (`POL-02.01`, `POL-02.03`).
19. As an Admin, I want to assign a role to a user over a scope of legal entity, place and brand (all members, selected members or empty), starting today or later, so that access is effective-dated and scoped (`PRD-ACS-001`, `PRD-ACS-005`, `POL-02.06`).
20. As any user, I want my persona to set only my home screen and menus, never my access, so that access comes only from approved assignments (`PRD-ACS-002`, `PRD-ACS-003`).
21. As a user with several assignments, I want each action checked against one assignment only, so that scopes never combine to widen authority (`PRD-ACS-004`).
22. As an Admin, I want a selected Site to cover Stores and units added later, and a selected Store to cover units added later, so that scope follows the place tree (`PRD-ACS-021`, `DEC-094`, `DEC-098`).
23. As an employee, I want self-service only through a role scoped to my own records, so that self-service never reaches anyone else's data (`PRD-ACS-022`, `DEC-100`).
24. As an Admin, I want to withdraw a Scheduled assignment before its start through an approved change, so that a mistaken future grant never takes effect (RR-202).
25. As any user, I want a refusal to name what is missing (action, place, brand, field class), so that I know whom to ask (`PRD-UXP-003`).
26. As an approver, I want every access change after setup approved by someone other than any of its preparers, through any role, so that nobody grants themselves access (`PRD-ACS-006`, `POL-02.07`, `POL-02.08`).
27. As an approver, I want my approval bound to the exact version I reviewed, and a material change to supersede the request, so that I never approve something I did not see (`PRD-ACS-007`, `POL-02.12`).
28. As an approver, I want to decide with a reason from the configured list, evidence and a comment, with free text only for a change to the reason list itself, so that decisions are explainable (`POL-02.23`, `DEC-104`).
29. As an Admin, I want a service identity never able to decide an approval, so that approvals are always human (`PRD-SEC-018`).
30. As the Owner, I want approval limits per action type, for a role within a scope or a named person, with the value basis shown, so that authority is explicit (`POL-02.09`, `POL-02.15`, `PRD-ACS-015`).
31. As the Owner, I want a missing limit to grant nothing, unlimited authority to be an explicit setting, and an Unknown value to need explicit authority, so that nothing is approved by default (`PRD-ACS-016`).
32. As Accounts or Operations, I want a request routed to the eligible approvers with the lowest covering limit, and waiting when nobody is eligible, so that approvals go to the right level and never auto-approve (`DEC-043`).
33. As the Owner, I want stand-in grants that never exceed the authority stood in for, expire by themselves and need a different person's approval, so that cover during absence stays bounded (`PRD-ACS-018`, `POL-02.20`).
34. As an approver, I want bulk approval only for allowlisted types, each item rechecked in its own transaction and Unknown never added as zero, so that bulk is safe (`PRD-ACS-019`, `POL-02.19`).
35. As the Owner, I want overdue approvals escalated to a configured recipient per action type and Site, keeping the original owner, so that nothing waits unseen (`PRD-ACS-010`).
36. As an approver, I want each approval decision used once, rechecked against value under the lock, and left unused when its job fails, so that one approval never covers two effects (`DEC-097`, `DEC-066`).

### My work, exceptions, numbers and history

37. As any user, I want one My work list of the tasks, approvals and exceptions I may act on, including stand-in items, ordered by due time and then exposure with Unknown above known amounts, so that I see what matters first (`PRD-ACS-009`, `PRD-MOD-015`).
38. As a user, I want an item to leave My work as soon as I am no longer eligible, and a redelivered event never to create a second item, so that the list stays true (`PRD-INT-008`).
39. As Operations, I want an exception with a code, type, linked records, evidence, exposure, owner, due time and Site, routed per type and Site, so that every problem has an owner (`PRD-EXC-001`, `POL-02.16`).
40. As Operations, I want an exception to survive the rollback of the transaction that found it, and a replay never to raise a second one, so that failures are never lost or doubled (`PRD-EXC-002`, `PRD-INT-008`).
41. As Operations, I want an exception to close only after the owning module's resolution check, and closing to settle no stock or money, so that closing never hides a problem (`PRD-EXC-002`, `PRD-EXC-003`).
42. As Accounts, I want a job that keeps failing to raise an unfinished-operation exception, and operators to see failed jobs, so that nothing fails silently (`PRD-EXC-001`, `PRD-SEC-013`).
43. As Operations, I want evidence files attached to exceptions and approval decisions, so that the proof sits with the decision (`PRD-EXC-001`).
44. As a user, I want My work to update live with identifiers followed by an authorised refetch, so that I see changes without leaking data (PRD "Technical platform").
45. As Accounts, I want numbers given inside the document's transaction, gapless, from series per module, kind, scope and financial year, so that numbering is provable (`PRD-MOD-004`, `PRD-INT-004`).
46. As Accounts, I want a closed series never reused or reopened and a cancelled document to keep its number, so that the series stays honest (`PRD-LIF-015`, `PRD-ACP-019`).
47. As an Auditor, I want to read audit and access history for a record or an actor within my scope, masked where restricted, with an as-of time, so that I can reconstruct what happened (`PRD-ACS-013`, `PRD-ACS-014`).
48. As an Auditor, I want audit and access records append-only and sealed, with alteration detected, so that history cannot be rewritten (`PRD-SEC-007`, `PRD-MOD-011`).
49. As an Admin, I want service identities with their own credential (shown once, stored hashed, revocable), least-privilege assignments and their own audit identity, so that jobs and integrations are accountable (`PRD-SEC-018`).

### Organisation structure

50. As an Admin, I want legal entities with legal names and statutory identifiers, so that each unit maps to a real legal person (`PRD-ORG-001`).
51. As an Admin, I want tax registrations fixed to one legal entity, with the number kept as text, its State and validity dates, so that a registration never drifts between entities (`PRD-ORG-020`, `POL-10.06`).
52. As an Admin, I want book identities fixed to one legal entity, so that each book's ledger belongs to the right entity (`PRD-ORG-020`, `PRD-LED-002`).
53. As an Admin, I want Country, State, City and Area, with countries configured per Organisation, so that every Site sits in one Area (`PRD-ORG-007`, `PRD-ORG-011`).
54. As an Admin, I want a Site with a permanent code, its physical kind, addresses, aliases and dates, so that a physical place keeps one identity (`PRD-ORG-003`, `PRD-ORG-008` to `PRD-ORG-010`).
55. As an Admin, I want Stores with a format, an operating model and a dated Site link, several allowed at one Site, so that trading businesses stay apart from places (`PRD-ORG-021`).
56. As an Admin, I want business units (whole-store, brand counter, warehouse, office), with exactly one whole-store unit per Store, so that operations have the right accounting unit (`PRD-ORG-004`, `PRD-ORG-006`).
57. As an Admin, I want each unit's explicit dated mapping to one legal entity, one registration and one book, refused on a mismatch or on a registration in another State, so that statutory identity is never inferred from the Site (`PRD-ORG-005`, `POL-10.01`, GC2-1).
58. As Accounts, I want to verify a mapping version with evidence, as a different person from its maker and under a separate permission, so that statutory actions wait for a checked mapping (`POL-10.08`).
59. As the Owner, I want every structure, mapping and agreement change approved by a different authorised person, so that nobody reshapes the business alone (`PRD-ACS-006`).
60. As Operations, I want stock locations fixed to one Site and one unit at it, and a location's retirement refused while stock is recorded there, so that every balance belongs somewhere (`PRD-ORG-012`).
61. As an Admin, I want Store groupings with dated membership and each Store's dated default warehouse unit, so that later offers and replenishment have targets (`PRD-ORG-007`, `PRD-ORG-013`).
62. As an Auditor, I want each master's version history and the version in force on a chosen date, and every transaction to keep the version it used, so that past records never change meaning (`PRD-MOD-010`, `PRD-ACP-013`).
63. As an Admin, I want master lists reports, so that structure and masters can be reviewed (phases.md stage 1 reports).
64. As the Owner, I want one Organisation's data never visible from another, so that tenants stay isolated (`PRD-ORG-002`, `PRD-ACS-020`).

### Product and party masters

65. As Booking, I want brands with aliases and an optional parent brand, so that brand families stay apart from aliases (`PRD-MER-001`; `DEC-112`, RR-047).
66. As Booking, I want a category tree carrying its size set, SKU identity attributes and tracking profile, so that each product line defines its own identity (`PRD-MER-002`, `POL-04.01`).
67. As Booking, I want list attributes limited to approved vocabulary, and a new value confirmed by a different person before use, so that free text never becomes master data (`PRD-MER-004`, `PRD-IMP-008`).
68. As Booking, I want to propose a new style or SKU and have a different person confirm or reject it, so that unconfirmed identities never reach an official PT (`PRD-MER-013`).
69. As Booking, I want a SKU to be style, colour and size, with Unknown size distinct from Free Size, so that missing data is never mistaken for a real value (`PRD-MER-002`, `PRD-MER-005`, `POL-04.02`).
70. As Booking, I want gift-with-purchase, promotional and packaging goods held as SKUs with an explicit purpose and their actual stock cost, so that giving one away never makes its cost zero (`DEC-112`, RR-047).
71. As Booking, I want external barcodes and supplier codes mapped to a SKU and unit by scope and dates, keeping leading zeros and historical aliases, with ambiguity refused, so that a scan resolves to exactly one thing (`PRD-MER-006` to `PRD-MER-008`).
72. As Booking, I want one stock unit per SKU (piece, pair or pack), unchangeable while stock exists, so that quantities never change meaning (`POL-04.03`).
73. As Booking, I want pack conversions and mixed-pack contents versioned, so that past quantities keep their conversion (`POL-04.04`, `PRD-MER-012`).
74. As Operations, I want dated tracking profiles (piece or quantity, batch and expiry, identifiers, shelf life), with a change to piece tracking effective at a Site only after its labelling count, so that piece rules start from a count (`POL-04.05`, `PRD-MER-014`, `PRD-MER-018`).
75. As Booking, I want one party per legal person with dated roles (supplier, agent, ordering, invoicing, goods mover), kept apart from brands, and dated many-to-many brand–supplier links, so that each booking names its actual supplier (`PRD-MER-001`; `DEC-112`).
76. As Booking, I want dated agreement versions with commercial model, ownership event, return rights and money terms, each a value or Unknown, and the signed agreement attached, so that terms are never defaulted and trace to evidence (`PRD-ORG-016`, `POL-01.01` to `POL-01.14`).
77. As Accounts, I want supplier cash-discount and interest terms recorded as structured terms, so that the later payment design can apply them (`DEC-112`, RR-047).
78. As Accounts, I want bank details encrypted with the Organisation's key, masked without the field permission, unmasked only with a fresh code and an access record, and changed only with a different person's approval, so that payment details cannot be diverted (`PRD-ACS-008`, `PRD-SEC-006`, `DEC-114`).

### Policy readiness and activation

79. As an Admin, I want each of the 19 policies listed with its status and what is missing, so that I know what blocks go-live (PRD "Required policy configuration").
80. As an Admin, I want to record a policy as Signed with its signatory, date and evidence, so that the policy gate has an authoritative input (`DEC-092`).
81. As Accounts, I want a policy's real values validated with evidence by a person who did not enter them, so that configuration is independently checked.
82. As the Owner, I want every capability shipped off and switched on per Organisation, never bypassing a missing policy, so that nothing is on by default (`PRD-SEC-017`).
83. As Operations, I want to run readiness checks for a Site and unit (mappings, users and access, locations, required policies, stock plan, devices), so that gaps show before activation (`PRD-LIF-002`, `PRD-LIF-003`).
84. As the Owner, I want receiving, movement or selling enabled for a unit only by a different person's approval after its checks pass, so that activation is independent (`PRD-LIF-001`).
85. As any user, I want an unavailable action to show its state, its blocking reason and the next action, so that I know what to fix (`PRD-UXP-003`, `PRD-SEC-017`).
86. As an Admin, I want Sites, Stores and units to move through Setting up, Active, Closing and Closed, so that each lifecycle is visible (`PRD-ORG-008`).

### Books and posting

87. As Accounts, I want a book with an effective-dated cost setting (FIFO or moving average; one pool per SKU per book or per Site), and a book with no approved setting to refuse valued movements, so that stock is valued by the book's method and never by a default (`PRD-LED-014`, `PRD-LED-015`, `DEC-031`).
88. As Accounts, I want a change of formula or pool mode on a book that has held stock refused until the CA rules, so that value is never silently redistributed (SL-6).
89. As Accounts, I want a chart of accounts per book, codes unique in the book, a nature fixed at creation, and versions retired never deleted, so that reports group correctly (`PRD-LED-001`).
90. As Accounts, I want business unit, Store and brand as dimensions on journal lines, with a posting refused when a required dimension is missing, so that one ledger serves every Store (`POL-09.11`).
91. As an Accounts preparer, I want a posting-map version to take effect only when a different Accounts user decides it with the CA's evidence attached or referenced, one piece of evidence covering a named set of versions, so that maps follow the CA's approval (`POL-09.01`, `DEC-112`).
92. As Accounts, I want map versions effective-dated, never overlapping, never starting in the past, never edited in force, and each journal to keep the version it used, so that past postings stay explainable (`POL-09.12`, `PRD-MOD-010`).
93. As Accounts, I want Check postable to give the same reason Post would, so that a problem shows before anyone commits (books-and-posting 6.2).
94. As Accounts, I want periods without overlaps or gaps, locked in date order, a lock that waits for postings in flight and refuses every later posting, so that closed months stay closed (`PRD-LED-009`, `PRD-INT-003`).
95. As Accounts, I want a reopening that names its reason and corrections, is approved by someone other than the requester, admits only the named corrections and relocks itself when done, so that reopening is narrow (`PRD-LED-019`, `PRD-LED-020`, `DEC-106`, `DEC-107`).
96. As Accounts, I want effective-dated tax-rule records (goods classification, rates and slabs, registration applicability, price basis, rounding rules), each in force only when approved, so that calculations read one version on any date (`PRD-TAX-005`, `POL-10.05`).
97. As Accounts, I want a trial balance per book and period with its as-of time, marked partial for a scoped reader, so that the books can be checked (books-and-posting 12).
98. As an Auditor, I want journals insert-only, an unbalanced journal never committed even when written outside the service, and corrections only by one linked reversal, so that the ledger cannot be bent (`PRD-LED-004`, `POL-09.13`).

### Stock quantities and movements (S1-F10 part 1)

99. As Operations, I want stock balances derived only from append-only movements and rebuildable from them, so that stock can always be proven (`PRD-MOD-011`, `PRD-MOD-012`).
100. As Operations, I want custody, PT coverage, availability, ownership and accounting recognition kept as five separate facts, each changed only by its own events, so that none is inferred from another (stock-ledger 3).
101. As Operations, I want each piece in exactly one place, and quantity-tracked issues to take the oldest receipt origin first (soonest expiry where tracked), so that stock is rotated and traceable (`PRD-STK-013`).
102. As Operations, I want holds and reservations as separate records, each released only by its own event, so that a damage hold and a customer reservation never cancel each other (`PRD-TRF-022`, `PRD-DMG-003`).
103. As Operations, I want availability to equal custody minus reserved minus held stock outside reservations, never below zero, so that no one sells what is not there (stock-ledger 6.2).
104. As Operations, I want a count freeze that blocks every movement in its scope, including arrivals, and fixes expected quantities, with differences posted only after approval and tolerance only choosing the approver, so that counts are clean (`PRD-STK-008`, `PRD-STK-009`, `PRD-STK-012`).
105. As Operations, I want a found piece already recorded as sold swapped with a missing piece of the same SKU without changing the bill, so that counts correct identity without touching sales (`PRD-STK-015`).
106. As Operations, I want stock before its PT to show value Unknown, never zero, so that unvalued goods are visible as such (`PRD-ACP-004`).
107. As a brand-limited reader, I want to see a multi-brand stock header only when I have access to every brand it records, and cost only with the cost field permission, so that brand scope and cost restriction hold (RR-228 (d), product owner 6 Oct 2026).

### Stock valuation and accounting (S1-F10 part 2)

108. As Accounts, I want cost pools and FIFO layers with lineage, and moving averages, valued in posting order, so that values follow each book's formula (stock-ledger 7).
109. As Accounts, I want a new cost pool to take its formula, pool mode and cost-setting version from the cost setting read when the request was planned, so that no pool exists without its rules (product owner, 6 Oct 2026).
110. As Accounts, I want each valued movement and its balanced journals per book committed in one transaction, so that stock and money never disagree (`PRD-MOD-013`, `DEC-087`).
111. As Accounts, I want a movement with no valid map or open period to commit nothing, raise an exception in its own transaction once, and post once after the fix, so that the operational event is preserved without a half-posting (SL-23, `DEC-105`, `POL-09.12`).
112. As Accounts, I want a late cost change to follow its goods into pools, dispatches, cost of goods sold, supplier claims or losses, so that cost lands where the goods are (`PRD-LED-016`).
113. As Accounts, I want supplier returns to leave at formula cost and be held on the shipment until handover, refused goods coming back at the shipment's value, so that returns value correctly (stock-ledger 7.5, 7.8).
114. As Accounts, I want a mistaken inflow reversed at its own value, with a variance only where the pool would go below zero, so that corrections are exact (`PRD-LED-018`).
115. As Accounts, I want an outflow that does not divide into whole paise refused while no rounding rule exists, and an emptying outflow to take all remaining value, so that no rounding is invented (G10a, SL-2).
116. As Accounts, I want posting-source rows reconciling the inventory account with pool value movement by movement, so that the books prove the stock (`PRD-LED-008`).
117. As Accounts, I want a 10,000-line document posted as one queued job per book while counters keep selling, so that large postings never stall Stores (stock-ledger 10.6).

### Shared calculations

118. As a cashier, I want price, offers, spread, tax and round-off computed identically on the server and on the counter, so that a bill never changes at finalisation (`PRD-MOD-007`, `PRD-ACP-018`).
119. As Accounts, I want every amount in integer paise with exact intermediates, turned into paise only at named rounding steps, and a missing rule refused, so that rounding is never silent (`PRD-MOD-014`).
120. As a cashier, I want an Unknown MRP or HSN to refuse the line and name it, never price it at zero, so that Unknown never becomes zero (`PRD-MOD-015`).
121. As a merchandiser, I want costing and margin on the server only, with the counter bundle provably free of the costing entry point, so that cost never reaches a till (`PRD-OFF-004`).
122. As an Auditor, I want each priced bill to record every rule version it used, and repricing with them to give the same result, so that bills are reproducible (`PRD-POS-014`).
123. As the product owner, I want any step that depends on an open question to refuse with `not-decided` naming that question, so that no answer is invented (GC-7 5.10).

### Imports and opening data

124. As a preparer, I want to upload a file with its source system and claimed document reference, with the format found from its content and a damaged file refused, so that every receipt is traceable and renamed files still read (`PRD-IMP-001`, `PRD-IMP-002`).
125. As an Admin, I want a file refused before storing if it has macros, scripts, embedded objects, unapproved links or depends on another workbook, so that nothing active or stale gets in (`PRD-SEC-011`, GC6-3).
126. As an Admin, I want files over the documented caps refused with the cap named and never truncated, so that limits are visible (GC6-5, RR-036).
127. As the KDPS Owner, I want a file with customer-contact columns refused on `kdps-test` before it is stored, so that real contacts never land there (GC6-6, `DEC-052`).
128. As an Auditor, I want the original kept byte for byte, encrypted with the Organisation's key, identified by its hash and stored under the Organisation's id, so that it can be proved and restored per Organisation (`PRD-IMP-002`, `POL-18.02`, GC9-10).
129. As a reader, I want files served only through the app within my scope and classes, restricted downloads logged as exports, so that storage is never exposed (`PRD-SEC-005`, `PRD-ACS-008`).
130. As a preparer, I want the layout proposed from the file's structure, picking when several fit and proposing a new one when none does, so that a misleading file name never picks a layout (`PRD-IMP-004`).
131. As a preparer, I want XLSX read with hidden sheets and rows shown, cached formula values only and error cells never read as zero, so that nothing is silently dropped (GC-6 9.1).
132. As a confirmer, I want layout, mapping and mapping-rule versions confirmed by a different person, an unconfirmed proposal changing nothing, so that one person cannot redefine an import (`PRD-IMP-008`, GC6-4).
133. As a reviewer, I want each batch to keep its layout and mapping versions, each staged value shown beside its original cell with its origin, and corrections entered with a reason, so that every value is traceable (`PRD-IMP-003`, `PRD-IMP-006`, `PRD-IMP-009`).
134. As a reviewer, I want a validation report by document and Store with each issue's class, severity, place and needed correction, and a preview of each document's effect, so that I approve the actual effect (`PRD-IMP-005`, `PRD-IMP-007`).
135. As a reviewer, I want publishing through the target module's handler, one transaction per document, a failing document failing alone, so that publishing is all-or-nothing per document (`PRD-IMP-012`, `PRD-MOD-006`).
136. As a preparer, I want a repeated document counted as a duplicate with no effect, a changed one refused as a conflict, concurrent publishes giving one effect and corrections only by a new batch or governed revision, so that nothing posts twice and history is kept (`PRD-IMP-011`, `PRD-INT-002`, `PRD-INT-005`).
137. As Operations, I want an import outcomes report with counts, values, control totals and an as-of time, scoped to my Stores, so that imports reconcile (`PRD-IMP-012`, `PRD-IMP-013`).
138. As an Auditor, I want import batch codes taken from a number series, so that a restore never issues a code twice (GC9-9).
139. As Operations, I want an opening-stock manifest layout staged and validated on synthetic data, with place, identity, quantity, batch and expiry, condition, owner, season or explicit Unknown, and valuation evidence or Unknown, so that the switch path is proved early (`POL-14.07`, `DEC-013`, `PRD-LIF-004` to `PRD-LIF-006`).
140. As Accounts, I want supplier dues, customer dues, advances and deposits as separate layouts carrying legal entity and book through the unit's mapping, with a due already open as a live document blocking, so that nothing is counted twice (`PRD-LIF-009`, `PRD-LIF-011`).
141. As Operations, I want comparison runs (manifest against a synthetic SOH, count against manifest, count against SOH) listing every difference and changing neither side, so that variances are visible, never edited away (`PRD-LIF-027`).
142. As Accounts, I want each opening kind's totals compared with synthetic closed-book balances, so that omissions show (`POL-14.03`).
143. As an Admin, I want publishing opening data unavailable until policy 14 is Signed and validated, naming what is missing, so that the gate holds (`PRD-SEC-017`).
144. As Accounts, I want opening data never to create a delivery, invoice, liability or journal, rows without valuation evidence held as excess and a batch after cutover refused, so that openings stay apart from live corrections (`PRD-LIF-003`, `PRD-LIF-008`, `PRD-LIF-011`).
145. As Operations, I want a historical-reference load to change no stock quantity or value, so that checking imports never move stock (`PRD-LIF-014`).

### Billing devices

146. As an Admin, I want to register a billing device for a Store and its whole-store or brand-counter units, so that only selling units are billed (`POL-02.03`; GC-8 3.1).
147. As an authorised person at the device, I want to enrol it in the counter app with a fresh authenticator code and a non-extractable key, a second enrolment refused, so that the device identity is provable (GC8-8, `PRD-OFF-010`).
148. As a cashier, I want sign-in with a valid device proof to give a POS session bound to that device, so that tills are tied to devices (`POL-02.18`).
149. As Accounts, I want each Active device to get one open bill series per registration and financial year, a second refused, so that bill numbers are per device (`PRD-POS-020`, `PRD-OFF-002`, `DEC-005`).
150. As an Admin, I want to revoke a lost device (ending its sessions and closing its series), retire one, or replace one with a fresh series, so that a closed series never continues (`PRD-SEC-008`, `PRD-LIF-015`, `DEC-092`).
151. As Operations, I want selling readiness to need at least one Active device for the unit with an open series, naming what is missing, so that selling never starts unnumbered (`PRD-LIF-002`).

### Backup and restore

152. As a platform operator, I want an application backup that snapshots each database with control totals and the latest seal, encrypts dumps and manifest with a backup key kept apart from Organisation keys, and copies files after the snapshots, so that a backup is consistent and portable (`PRD-SEC-012`, `POL-18.02`).
153. As a platform operator, I want restores only into a fresh target of the same environment, refused before anything is written if checks fail, so that a source is never overwritten (`PRD-ACP-019`).
154. As an Auditor, I want every restored file to match its hash and open from its record, and a missing or altered one to keep the Organisation held, so that attachments are proved (`PRD-IMP-002`).
155. As Accounts, I want every number series paused after a restore until reconciled with evidence, never lowered and never issuing a number twice, so that numbering survives a restore (`POL-18.04`).
156. As an Auditor, I want the seal chain to verify and end at the manifest's seal, so that altered rows show (`PRD-SEC-007`).
157. As Operations and Accounts, I want a restored Organisation held until both validations are recorded and gaps reconciled, with nothing deleted while no retention period is set, so that reopening is deliberate (`POL-18.03`, `POL-18.05`).

### Screens, environments and demos

158. As any persona, I want a web app with my home screen and menus, every screen text from the message catalogue, an environment banner, and keyboard-only paths, so that I can work and always know which environment I am in (`PRD-UXP-001`, `PRD-UXP-003`).
159. As the product owner, I want local, `dev` (synthetic only, deployed from `main`, migrations before deploy) and `kdps-test` (manual promotion) environments with no data copied between them, so that synthetic and real data never mix (deployment.md 1, 4).
160. As the product owner, I want Demo 0 on `dev` showing an automatic deploy, migrations and the web shell, so that hosting problems surface early.
161. As the product owner, I want Demo 1 on `dev` showing setup, sign-in, a role assignment prepared by one person and approved by another from My work, the new user doing exactly what it grants, and the history, so that the access foundation is proven.

## Implementation Decisions

### Shape and modules

- One NestJS modular monolith, a React web app, a separate counter app (`apps/counter`, served at `/counter/`, approved 6 Oct 2026 with RR-015), shared packages for domain primitives, calculations, schemas and UI. One PostgreSQL database per Organisation plus a directory database holding only each Organisation's code and database name (`DEC-093`).
- Modules own their tables in their own schema and expose a public interface; references to another module's record hold its identifier with no foreign key, and the owner validates through the other's interface. Calls go to a lower tier, or the same tier only where the module map lists the call (`PRD-MOD-002`).
- Stage 1 modules and what each owns:
  - **kernel**: command runner, idempotency, outbox and pg-boss jobs, correlation, the actor setting for row-level security, time (business date under the Organisation's timezone), operations view, backup and restore operator commands and the recovery hold.
  - **access**: users, credentials, sessions, devices and their keys, service identities, personas held, roles, assignments and scope, effective grants, approval rules, reasons, limits, stand-ins, requests, decisions and uses, setup record.
  - **audit**: audit and access records (monthly partitions), seals.
  - **inbox**: work items and escalation. **exceptions**: exception types, exceptions, links, routing.
  - **numbering**: formats, series, allocations, pause and reconcile; device bill series; import batch codes (GC9-9). Calls no other module.
  - **configuration**: Organisation settings, policy status, capability controls, activity grants, the Available check, recovery commands, empty retention schedules.
  - **organisation**: legal entities, registrations, book identities, geography, Sites, Stores, units, mappings and verifications, locations, groupings.
  - **merchandise**: catalogue (brands, categories, styles, SKUs, attributes and vocabularies, proposals, external codes, units and packs, tracking profiles, brand coverage) and parties (parties, roles, encrypted bank details, agreements).
  - **site-lifecycle**: readiness checks and records; approves activities and writes grants into `configuration`.
  - **finance**: book settings, accounts, periods and reopenings, posting maps, journals and posting sources; tax-rule records.
  - **stock**: the ledger (movements, balances, pieces, coverage, acceptance, holds, reservations, cost pools and layers, valuations, transit value).
  - **files-imports**: intake, stored files, layouts, mappings and rules, batches, staging, issues, control totals, outcomes, comparison runs; target modules register import handlers.
  - **pos**: billing device facts only (device and its units).
  - **calculations** package: pure functions, no database, clock or environment; a selling entry point (server and counter) and a costing entry point (server only).

### Request handling (code house rules part B, approved 6 Oct 2026)

- Commands are `POST` routes per unit and record; every write carries an `Idempotency-Key` (UUIDv7) scoped by Organisation, actor and operation, sign-in excepted. An identical replay returns the kept answer only after access checks pass again; changed content is refused; an uncertain commit answers outcome-unknown. An answer that showed a secret or an unmasked restricted value is never replayed (`DEC-113`, `DEC-114`).
- Order of checks: authenticate → Available → Authorise (one assignment) → slow work and planning → locks in the deterministic order → recheck authority, version, state, independent approval and quantity under the locks → write → commit.
- A version token travels in the body and is compared under the lock; a mismatch is a stale-version refusal.
- One error envelope with a kind, a `<unit>.<reason>` code, what is missing and the next action; a hidden record is answered not-found.
- Outbox events carry identifiers only; consumers keep receipts and run under service identities. Live updates carry identifiers, then the client refetches under its own authorisation.
- Logs are structured JSON with a correlation identifier and never a secret or restricted value. All screen text comes from the message catalogue.

### Data rules

- Records, posted entries and audit rows are append-only (refusal triggers); corrections are linked records. Masters are an identity row plus version rows with non-overlapping approved versions; no version starts in the past; transactions store the version ids they used.
- Money is integer paise (`PRD-MOD-014`); Unknown is distinct from zero (`PRD-MOD-015`). No setting has a default; KDPS values stay OPEN and synthetic values are labelled.
- Row-level security is a backstop: with no actor set, no scoped row shows. The runtime role owns nothing and cannot bypass it.
- Locks follow one order (stock-ledger 10.3 as refined by RR-227): authority rows → document and approval rows → receipt origins (shared when only read) → the unit anchor (shared; exclusive to start or end a count freeze) with SKU balances → pieces → holds and reservations → cost pools and transit value (missing rows created at this step) → financial periods → number series last. Ascending identifiers within a step.

### Stock ledger (stock-ledger 13 to 15, approved 6 Oct 2026 with fixes)

- One ledger request per document or step, inside the caller's transaction, through four operations: **Plan** (reads masters, mapping and cost setting; writes and locks nothing), **Lock**, **Recheck and value**, **Write** (movements, legs, projections, valuations, one Post call). A plan made stale by a new receipt origin is refused, never retried by the ledger.
- Only registered callers post; synthetic callers exist only when the test app composes them.
- The open-pool key (one open pool per book, SKU and Site) treats an empty Site as equal, so a whole-book pool is unique. A new pool takes its formula, pool mode and cost-setting version from the cost setting read at Plan.
- Row-level security for stock rows: a unit without a Store is matched by Site and unit; a whole-book pool is visible only to all-places scope; Site pool value rows only to Site-wide or wider scope; a header covering several brands records its brand set and is visible to a brand-limited reader only with access to every one; cost still needs its field permission. One command writing in two scopes by an actor scoped to one stays OPEN until stage 3.
- Delivered in two parts of one feature: **Stock quantities and movements** (unvalued operations, holds, reservations, freeze, coverage, acceptance, reads; built right after the access feature, with stand-ins of the `organisation` and `merchandise` read contracts allowed in development tests only) and **Stock valuation and accounting** (after books; accepted only through the real modules).
- Anchor-row contention is measured; the builder resolves performance and brings back only changes that affect business behaviour.

### Books and posting (books-and-posting)

- `finance` exposes Check postable (no writes, no locks), Hold periods, Post (one journal per book, event kind and accounting date; idempotent per source item and component), Reverse, Lock, the reopening commands, Maintain and Read.
- Journals are insert-only with a deferred balance check and a period guard. Posting maps need maker and checker plus CA evidence. One journal series per book (GC4-4), held from step 8 to commit.

### Calculations (shared-calculations)

- Exact intermediates; paise only at named rounding rules with a rule version; every priced bill keeps its rule versions. Open questions refuse with `not-decided`. The counter build excludes the costing entry point, checked on every build.

### Imports (imports-and-opening-data)

- Files are stored before the recording transaction: encrypted with the Organisation's key, hashed before encryption, keyed by Organisation id, never overwritten or deleted by the app, served only through the app.
- Stage 1 reads XLSX only; XLS, XLSB, CSV readers, the sample layouts and the 10,000-line parse test move to stage 2 as **S2-F13**, first in stage 2 (product owner, 6 Oct 2026). PDFs and photos are stored as evidence only.
- Comparison runs, a synthetic SOH layout and the historical-reference handler stay in stage 1, because the opening-data work needs them.
- Opening-data publishing stays unavailable without policy 14; the synthetic opening-count handler runs in tests only until RR-013 is answered.

### Devices (offline-counter 3 to 5 and 11, approved 6 Oct 2026)

- Back-office registration, then browser enrolment with a non-extractable P-256 key and a fresh authenticator code; device proof by signing a server challenge. One series per device, registration and financial year; one writer per series. The counter's browser tests live in the counter app. Offline sections 6 to 10 stay Draft, due before the stage 1 exit gate.

### Backup and restore (backup-and-restore)

- Organisation is the unit of restore; import batch codes come from `numbering` (GC9-9); stored objects are prefixed by Organisation id (GC9-10). The rest of the design, including deletion and key recovery, is finished when S1-F14 starts. The `dev` backup-key custodian is named before the restore drill; production custody is for KDPS's Owner and Admin under policy 18 and blocks live use only.

### Environments

- Local: Testcontainers PostgreSQL 17 and MinIO. Railway `dev` and `kdps-test`: `app` (API, web at `/`, counter at `/counter/`, one origin), `worker`, PostgreSQL, a bucket. Railway setup and each deploy need the product owner's separate authorisation.
- `dev` pool: `AOS_DATABASE_POOL_MAX` = 5 per pool, a development assumption; the total across directory and Organisation pools, app instances, workers, migration and operator connections is checked against the database's connection budget, then tuned from measurements.

### Build order (one builder)

1. Documents: write today's approvals into the designs, the decision entry for S2-F13, the ticket splits.
2. **Sign-in and access control (S1-F01), part 1 "Sign-in and screens"**: idempotency, audit, API conventions, sign-in and enrolment, web shell, sign-in screens, Playwright with one sign-in journey (T04, T07, T05, T08, T14, T15a, T19a). **Demo 0** once the web shell lands and Railway is authorised.
3. **Shared calculations (S1-F11)** counter run: the counter build host and the golden run in Chromium.
4. **S1-F01 part 2 "Roles and approvals"**: outbox and worker, roles and scope, sessions, session-lock screen, setup step, My work, approvals, access screens, history, remaining journeys, concurrency suite, acceptance (T06, T11, T09, T15b, T10, T12, T13, T16 to T18, T19b, T20, T21). **Demo 1.**
5. **Stock ledger (S1-F10) part 1 "Stock quantities and movements"**.
6. Organisation structure (S1-F02) → number series and exceptions (S1-F08) → approval authority (S1-F05) → product and party masters (S1-F03; RR-047 bullets drafted during S1-F02, approved before S1-F03) → policy readiness and activation (S1-F04).
7. Books and periods (S1-F09) → **Stock ledger part 2 "Stock valuation and accounting"**.
8. File intake and master import (S1-F06) → evidence files for exceptions → billing devices (S1-F12) → backup and restore (S1-F14) → opening-data layouts (S1-F13), last.

## Testing Decisions

### What makes a good test

- Tests exercise external behaviour through public seams: an HTTP request and its answer, a module's public interface, a priced bill, a screen a persona uses. They never assert private functions, table internals or call order.
- Real PostgreSQL 17 through Testcontainers, each test file in its own database cloned from the migrated template; never mocks of the database.
- Synthetic data only, labelled as synthetic; no KDPS value is ever used as a default. Expected values are written by hand from the design, not recomputed by the code under test.
- Invariants are read through read models first, by raw query only under the read-only verification role (`DEC-112` CH-4, H6).
- Every rule test cites the PRD, policy or decision ID it proves.

### The four seams (fewest possible)

1. **The HTTP API** through the typed client, against real PostgreSQL. The default seam for access, approvals, structure, masters, readiness, numbering, exceptions, books, imports, devices and backup.
2. **The stock harness**: a test-only synthetic document driver calling the ledger and `finance` through their real interfaces, because stage 1 has no business documents (`DEC-112` H1 to H6). During part 1 only, development tests may stand in for the `organisation` and `merchandise` read contracts; acceptance uses the real modules.
3. **The golden cases**: one set of JSON cases run by Vitest on the server and by Playwright in Chromium against the counter build, in the same CI run.
4. **Browser journeys** with Playwright for every stage 1 screen, including keyboard-only paths, recovery after reload and a locked session keeping unfinished work.

### Prior art

- Integration tests against real PostgreSQL with per-file databases and synthetic Organisations: the existing routing, command-runner, migration, fixtures-isolation and seed tests in the server's test folder.
- Golden cases: the calculations package's 38 case files and their Vitest runner.

### What is tested (by design section)

- **Access and approvals** (access-and-approvals 15, tests 1 to 23 with their lettered variants; S1-F01 AT01 to AT18): unavailable operations, Organisation isolation, sign-in, fresh code, resets, session limits and revocation, past-start and overlapping assignments, persona grants nothing, field classes, place-tree coverage, self-service, row-level security, self-approval and every preparer refused, limits and Unknown, supersession, value under the lock, one use per decision, bulk, stand-ins, setup runs once, reasons, My work order, escalation, exceptions surviving rollback, service identities, no secret leaks.
- **Numbering and audit** (numbering-and-audit 7, tests 1 to 14): gapless allocation, concurrency, one open series, closed series final, formats, reprints, pause after restore, audit atomic with change, append-only, seals, scoped history, no deletion without retention.
- **Structure and masters** (structure-and-masters 9, tests 1 to 16 and 18 to 21; test 17 is stage 5).
- **Readiness**: no design lists numbered tests, so the S1-F04 spec defines them: capability off until switched on; policy not Signed or not validated → unavailable with its reason; an activity stays disabled until its checks pass; activation approved by someone other than the checker; Signed and validated by different people; a browser journey shows the reason on screen.
- **Books and posting** (books-and-posting 15, tests 1 to 18 with 15a; section 16 scenarios P1 to P6 and the checks of 16.5).
- **Stock ledger** (stock-ledger 11): the story of 11.1 under both cost formulas and both pool modes, scenarios G2 to G13 with G10a (G10b waits for the rounding rule), the invariants of 11.7 after every step, the concurrency suite of 11.9, the anchor-row measurement, header brand-set visibility, no synthetic caller in the production composition.
- **Shared calculations** (shared-calculations 12.4 and 12.5): cases CG-01 to CG-22 on server and counter (costing server-only), property tests, order invariance, snapshot repricing, the bundle-exclusion check, `not-decided` refusals.
- **Imports** (imports-and-opening-data 17, tests 1 XLSX part, 2, 11 to 18, 20 to 26 and 28); tests 1 (other formats), 3 to 10, 19 and 27 move with S2-F13.
- **Devices** (offline-counter stage 1 tests 1 to 12; numbering-and-audit 7 tests 2 to 4; access-and-approvals 15 test 5).
- **Backup and restore** (backup-and-restore 12, tests 1 to 18), with a restore drill record on `dev`.
- **Every stage owes**: concurrency on real PostgreSQL, Organisation isolation in every module with data, self-approval refused for every independently approved stage 1 action, stale versions refused, duplicates answered once, partial-failure rollback, browser journeys for every screen.

## Out of Scope

- Live Store selling and any live, policy-dependent stock or financial posting; loading real opening balances (stage 4 switch, `DEC-013`); real KDPS data anywhere until KDPS agrees (RR-180).
- Offline billing itself: offline authority, working set, local commit, upload, pause and release (stage 4, under the signed Offline operation policy). Its design sections stay Draft in stage 1.
- Sample layouts, the XLS, XLSB and CSV readers and the 10,000-line PT parse (moved to S2-F13); PDF text extraction (stage 2, S2-F05); the AI gateway (stage 2); email, WhatsApp and SMS (stage 5, `DEC-099`); Hindi screens (stage 5).
- Business documents (bookings, receipts, PT, transfers, bills) and their screens; relocation of units (stage 5); the complete export (stage 5); retention deletion and legal holds before their design is finished.
- Production hosting (chosen before the first Store switch, RR-029); a native phone app (RR-051).
- Every KDPS value: roles, limits, routing, reasons, sign-in settings, tracking profiles, cost method, periods, accounts, tax rates, retention, recovery targets. They stay OPEN; tests use labelled synthetic values.

## Further Notes

- **Decisions of 6 Oct 2026 (product owner, grilling)** this spec relies on, to be written into the designs before the code that needs them: stock-ledger 13 to 15 approved with the pool-key and pool-initialisation fixes; RR-227 approved; RR-228 (b), (c), (e) accepted and (d) amended to the brand-set rule; GC-8 sections 3 to 5 and 11 with `apps/counter` and a fresh code at enrolment approved, browser tests allowed in the counter app, section 5.5 aligned with the golden runner; GC9-9 and GC9-10 approved; S1-F07 moved to S2-F13 (one decision entry amending `DEC-112` GC6-1, `phases.md` and the roadmap); S1-F13 kept in stage 1, last; ticket splits T15a/T15b and T19a/T19b; S1-F10 in two parts; S1-F10-T02 also blocked by S1-F09; the feature titles "Sign-in and access control" (S1-F01) and "Stock ledger" (S1-F10), labels unchanged; `dev` pool 5.
- **Labels are fixed IDs**, never renumbered; the build order above is the only order. Plain names lead, labels follow.
- **Open items that block code** (each with its owner in [open-items.md](../open-items.md)): RR-047 PRD bullets before S1-F03; RR-016 stock-plan check before S1-F04; RR-202 the Withdrawn state name before S1-F01-T11; RR-203 the customer-contact check before S1-F06 intake; GC8-7 device state names before the devices screen; GC9-7 and GC9-8 before S1-F14; CH-2 Railway's PostgreSQL version before the first deploy; RR-187 and RR-216 before Demo 0. Module-map section 8 must name the events for brands, parties, packs and vocabulary before code emits them.
- **Open items that block only live use** are listed in [kdps-values.md](../kdps-values.md) and [open-items.md](../open-items.md); none blocks building or the stage 1 exit on synthetic data, except the restore drill (RR-188) and the `dev` backup-key custodian.
- **Exit checks** are those of [phases.md](../../phases.md) stage 1 and [README.md](README.md) section 7, with the 10,000-line parse moved to stage 2.
