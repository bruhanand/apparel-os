# Access, approvals, inbox and exceptions

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Current**, 3 Oct 2026. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements these PRD sections: People, access and approvals; from Exceptions, reports and planning, the exception record and alerts; from AI, security and operational reliability, sign-in, scope controls, restricted data, revocation and service identities; from Franchise and partner accounts, partner users. It is GC-3 in [gaps-before-code.md](../../reports/gaps-before-code.md).

- PRD IDs: `PRD-ACS-001`–`PRD-ACS-023`; `PRD-EXC-001`–`PRD-EXC-004`, `PRD-EXC-013`; `PRD-SEC-001`, `PRD-SEC-005`–`PRD-SEC-008`, `PRD-SEC-010`, `PRD-SEC-014`, `PRD-SEC-017`, `PRD-SEC-018`; `PRD-FRN-001`, `PRD-FRN-007`; `PRD-INT-001`–`PRD-INT-004`, `PRD-INT-007`, `PRD-INT-008`; `PRD-MOD-010`, `PRD-MOD-015`; `PRD-UXP-003`; `PRD-OFF-002`–`PRD-OFF-004`, `PRD-OFF-010`; `PRD-HRM-004`, `PRD-HRM-012`, `PRD-HRM-015`; `PRD-TRF-004`, `PRD-TRF-005`, `PRD-TRF-010`; `PRD-LIF-001`.
- Policies: 2 (`POL-02.01`–`POL-02.12`, `POL-02.15`–`POL-02.20`, `POL-02.22`, `POL-02.23`, `POL-02.25`), 3 (`POL-03.04`, `POL-03.05`), 10 (`POL-10.01`), 12 (`POL-12.04`), 18 (`POL-18.02`).
- Decisions: DEC-001, DEC-036, DEC-037, DEC-041, DEC-042, DEC-043, DEC-066, DEC-071, DEC-092, DEC-093, DEC-094, DEC-097, DEC-098, DEC-099, DEC-100, DEC-101, DEC-102, DEC-103, DEC-104, DEC-105.

Depends on: [module-map.md](../architecture/module-map.md) (owners and operations of `access`, `inbox` and `exceptions`; the transaction shape), [domain-model.md](../architecture/domain-model.md) (the records, invariants and approval boundaries), [structure-and-masters.md](../masters/structure-and-masters.md) (the place tree), [personas.md](personas.md) (users, personas and the KDPS templates), [stock-ledger.md](../stock/stock-ledger.md) (locks and rechecks), [deployment.md](../platform/deployment.md) (sign-in routing and database roles).

Used by: every module, which authorises its commands and requests approvals here; [numbering-and-audit.md](../platform/numbering-and-audit.md) (GC-5), which keeps the access record; the stage 1 code of `access`, `inbox` and `exceptions`.

---

## 1. What this document fixes

- How a person signs in and keeps a session (`PRD-SEC-001`), and how a service identity is authenticated by its credential (`PRD-SEC-018`; 2.3).
- How access is granted and checked: permissions, roles, role assignments, scope, restricted fields, and the PostgreSQL scope controls behind them (`PRD-ACS-001`–`PRD-ACS-008`, `PRD-SEC-005`).
- How approvals work: rules, limits, requests, decisions, independence, stand-ins, bulk and phone approval, and the approval of a document that a job posts later (DEC-097).
- The one inbox, My work, and the exception record (`PRD-ACS-009`, `PRD-EXC-001`).
- The tables of `access`, `inbox` and `exceptions`, by name, key and constraint (section 13).

It fixes no person, role holder, scope, limit, allowlist, reason, owner or due time. Those are KDPS's under policy 2 and stay OPEN until configured (V-01 to V-04; `POL-02.10`, `POL-02.11`). Module-map 4.3, 4.8 and 4.13 name the operations; this document makes them concrete. Labels (**Design choice**, **Proposed**, **OPEN**) mean what module-map section 1 says.

## 2. Who acts

### 2.1 Users

- A user is one person's login in one Organisation, with one My work. A person who serves several Organisations holds a separate user in each; no login, session or role assignment crosses Organisations (`PRD-ACS-020`, DEC-093).
- A user has a UUIDv7 identifier and a login identifier unique in the Organisation, compared without regard to letter case. A login identifier is never given to another person, even after the user ends. **Design choice.**
- A user is Active or Disabled, and may be Ended; it is never deleted, so its history stays (`PRD-ACS-013`). Disabling takes effect at once: no new sign-in, and every session of the user is revoked (`PRD-SEC-008`). The state names are the baseline of DEC-105 (DM-4; [design-language.md](../ui/design-language.md) section 7).
- A user holds personas, with dates. A persona sets home screens, menus and summaries and grants nothing (`PRD-ACS-002`, `PRD-ACS-003`; [personas.md](personas.md) section 1).
- Customers and suppliers are records, not users ([personas.md](personas.md) section 4).

### 2.2 Partner users

- Partner staff are users who hold Store personas on their authorised Stores only. Their statement and ledger access comes from role assignments, not from a separate persona (`PRD-FRN-007`, DEC-042).
- A partner user's record names the partner it works for. Every role assignment of a partner user selects Stores, never all members and never a Site, and each selected Store must have that partner among its partner associations on the assignment's dates ([structure-and-masters.md](../masters/structure-and-masters.md) 3.1). Maintain refuses a wider scope (`PRD-FRN-001`, `PRD-FRN-007`). **Design choice.**
- Partner users arrive with the `partners` module in stage 5. The rule is fixed now so the stage 1 tables allow it. What partners see in their statements and ledgers is OPEN (`POL-12.04`; KDPS; stage 5).

### 2.3 Service identities

- A service identity is a non-human actor with its own audit identity, scoped credentials and least-privilege access. It has no screens (`PRD-SEC-018`).
- Two kinds. **Design choice.**
  - An internal identity, under which the worker runs a job or delivers the outbox (module-map section 10).
  - An outside caller with its own credential, such as an authenticated adapter callback (`PRD-INT-007`). The local helper and the Tally local gateway are this kind too: they call the server over HTTPS with a service-identity credential, and nothing calls into a Store or office (DEC-105; [deployment.md](../platform/deployment.md) section 6, D-6). The secret is shown once, stored only as an Argon2 hash, revocable and never logged (`PRD-SEC-014`).
- It gets access only through role assignments, scoped as narrowly as its work needs (`PRD-SEC-018`).
- It never decides an approval: an approver is an authorised person (`PRD-ACS-006`).
- When a job carries out a person's decision, the audit record names the service identity as the actor and the person on whose behalf it acts (section 9.8). **Design choice.**

### 2.4 Devices

- A device is registered online by an authorised person and has a device code unique in the Organisation (`PRD-OFF-002`). `access` keeps its identity and state; `pos` keeps its billing facts; `hr` uses registered devices for attendance (`PRD-HRM-004`; module-map 2.3).
- A lost device is Revoked (`PRD-SEC-008`, DEC-092). Revoking ends its sessions at their next request. Revoked is final; a replacement is a new device.
- A cloned or restored device cannot continue the identity (`PRD-OFF-010`). How a device proves its identity is the offline counter design (GC-8).
- Offline delegation has a bounded expiry instead of instant revocation (`PRD-SEC-008`, `PRD-OFF-003`).

## 3. Sign-in and sessions

### 3.1 Sign-in

1. The person gives the Organisation code, the login and the password. The directory finds the Organisation's database by its code; it holds nothing else (DEC-093; [deployment.md](../platform/deployment.md) sections 3 and 4).
2. The password is checked against its Argon2 hash (PRD Stack: Authentication).
3. The second factor is checked: the code from an authenticator app (TOTP) (`PRD-SEC-001`, `POL-02.17`). Nothing is sent by message before stage 5, and sign-in needs nothing sent (DEC-099).
4. A session is created in the Organisation's database, and its identifier goes in the cookie ([deployment.md](../platform/deployment.md) section 3).

- One refusal message covers a wrong Organisation code, login, password or code, so a failed attempt does not say which part was wrong. **Design choice.**
- Every attempt in a known Organisation writes an access record ([numbering-and-audit.md](../platform/numbering-and-audit.md) 5.2; `PRD-SEC-007`). An attempt with an unknown Organisation code goes only to the service log, without what was typed (`PRD-SEC-014`). **Design choice.**
- Repeated failures slow or stop further attempts. The thresholds, and the password rules, are OPEN (GC3-5).
- Production and `kdps-test` require the authenticator code. Development uses the same sign-in as production, with synthetic users, so it has no easier path and nothing in it weakens production login (`POL-02.17`, `PRD-ACS-017`; DEC-105, [deployment.md](../platform/deployment.md) D-6). **Design choice.**

### 3.2 Passwords and the second factor

- At the first sign-in the user enrols an authenticator app and confirms it with a code. The secret is encrypted at rest (section 6) and never shown again. **Design choice.**
- A user changes their own password after giving a fresh authenticator code. **Design choice.**
- A lost authenticator or a forgotten password is reset by a person who holds edit on the user's credentials, never by the user alone. The user enrols again or sets a new password at the next sign-in, and every session of the user is revoked. Before stage 5 nothing is sent (DEC-099), so a temporary password is handed over in person. **Design choice.** Each reset writes an access record.
- A reset needs no second approver. It is a protected action (3.3), so the person who resets gives a fresh authenticator code, and nobody resets their own credential, even if they hold edit on all credentials (DEC-105, GC3-4). **Design choice.**
- Signing in, changing one's own password or second factor, and ending one's own sessions are part of authentication (`PRD-SEC-001`), not access to a record (`PRD-INT-001`), so they need no role assignment. They act only on the signed-in user's own credentials and sessions, grant nothing and reach no other record. **Design choice.**

### 3.3 Sessions

- A session is a row in the Organisation's database: the user, the device where registered, its kind, its start, its last activity and its state. The cookie holds a random identifier; the database keeps only its hash. **Design choice.**
- Kind: a session on a registered billing device is a shared POS session; any other is an office session. Policy 2 names these two kinds (`POL-02.18`). **Design choice** of how the kind is decided.
- The idle-lock and absolute limits per kind are effective-dated settings in `access` (`PRD-ACS-017`, `PRD-MOD-010`). Policy 2 states 5 minutes for shared POS sessions, 15 minutes for office sessions and 12 hours absolute (`POL-02.18`). They apply once policy 2 is Signed and the Admin has validated them (V-04), as DM-6 requires: a person holding the validate permission who did not enter them (DEC-105). Until then no value is active on production; synthetic tests use labelled synthetic values. On `kdps-test`, before policy 2 is Signed, sessions use the values `POL-02.18` states, as settings of the test setup that enable no other gated action (DEC-102, DEC-071).
- When the idle limit passes, the session locks and the screen keeps the unfinished work. The same user unlocks it with their password. Someone else at the same device signs in with a session of their own. **Design choice.**
- When the absolute limit passes, the session ends. Unfinished work is kept and offered back after the next sign-in: drafts already saved stay as Draft records; unsaved screen input is kept on the device for the same user and Organisation (`PRD-ACS-017`, `POL-02.18`, `PRD-UXP-003`). Restricted fields are never kept in that copy; the person enters them again (`PRD-SEC-006`). **Design choice.**
- A session, every session of a user, or every session of a device can be revoked. Revocation takes effect at the next request and closes the session's live-update stream (`PRD-SEC-008`). Event: `access.session-revoked`.
- Protected actions ask for a fresh authenticator code (`PRD-SEC-001`): deciding an approval, changing access, changing bank details, showing or exporting an encrypted field, resetting another user's credential, and changing one's own password (3.2). The first four are the baseline of GC3-6 (DEC-105); the reset follows from GC3-4, and the own-password change is a **Design choice**. How long a code stays fresh is a setting with no default; it stays OPEN (GC3-6; KDPS Owner; stage 1 live use). Until it is set, each protected action asks for a new code. **Design choice** (fail-safe; no duration chosen).
- A browser is signed in to one Organisation at a time ([deployment.md](../platform/deployment.md) section 3).

## 4. Permissions, roles and role assignments

### 4.1 Permissions

- A permission is one action on one record type, or one field class (`POL-02.03`, `POL-02.04`, `PRD-ACS-008`).
- The actions are view, create, edit, approve, cancel, export and override. A broad label such as All, Full or Manage is expanded into these before it is saved; it is never stored as a label (`POL-02.03`).
- Each module declares its record types, their actions and which of its fields belong to which field class. A new record type or action is added by a reviewed code change, not at run time. **Design choice.**
- The field classes are those the PRD restricts: salary and payroll data, identity documents, bank details, customer contact information, cost, margin, employee photos and location evidence (`PRD-ACS-008`, `PRD-SEC-010`). A field-class permission is view, or view and edit. **Design choice** of the grouping.
- Holding approve gives no authority to approve a valued action without a limit (section 9.2; `POL-02.05`, `POL-02.15`).

### 4.2 Roles

- A role is a named set of permissions, with a code unique in the Organisation and versions (`POL-02.01`; PRD "Words used").
- KDPS starts from eleven editable templates: Owner, Store POS, Warehouse, Brand Manager, Accounts, Admin, Operations, HR, EBO staff, CA and Auditor (`POL-02.01`). A template is a starting set of permissions copied into a new role; its label grants nothing. The access grid in [ui-blueprint.html](../ui/ui-blueprint.html) (3a) is the design starting point for each template's permissions; KDPS confirms them (V-01).
- **Self-service role** (`PRD-ACS-022`, DEC-041, DEC-100). A role that holds self-service permissions holds nothing else, and every assignment of it has own-record scope (5.4). It is not one of the eleven templates.
- A role change after a new Organisation's setup step (9.11, `PRD-ACS-023`) is a new version, prepared and then approved by an authorised person other than the preparer, effective from its start date (`POL-02.07`; module-map 6.2 flow A).

### 4.3 Role assignments

- A role assignment is a user or service identity, a role, a scope and effective dates. It is the only thing that grants access, except a stand-in grant, which gives only the authority it names for a limited time (section 10; `PRD-ACS-018`). A user may hold several assignments, and each applies only inside its own scope (`PRD-ACS-001`–`PRD-ACS-004`, DEC-001).
- Assignments are effective-dated. Versions never overlap, and history is kept (`PRD-ACS-005`, `PRD-MOD-010`, `POL-02.06`). A version starts today or later, as for masters ([structure-and-masters.md](../masters/structure-and-masters.md) 2.2), and none starts on a past date; there is no exception (DEC-105, GC2-7). **Design choice.**
- Every change after a new Organisation's setup step (9.11, `PRD-ACS-023`), including ending an assignment early, is prepared and then approved by an authorised person other than the preparer, and takes effect from its date (`POL-02.07`). On `kdps-test`, before policy 2 is Signed, KDPS staff get role assignments prepared from what KDPS tells us and approved like any other change; they are settings of the test setup, not the signed role map of `POL-02.11`, and enable no gated action (DEC-103, DEC-071). Approving them needs a reason list in force there first: the first list, with the reasons KDPS gives, is a setting of the test setup, approved first with a free-text reason (DEC-105, DEC-104; 9.5, GC3-12).
- To cut a person's access at once online, disable the user (2.1); that grants nothing, so it waits for no approval. Work already delegated to an offline counter ends at its bounded expiry (`PRD-SEC-008`, `PRD-OFF-003`). **Design choice.**

## 5. Scope

### 5.1 Three dimensions, or own records

- A role assignment's scope has three dimensions: legal entity, place and brand (`PRD-ACS-001`, `POL-02.02`). In each it is all members, which includes future members; selected members, which stay fixed; or empty. An assignment that is empty in any dimension grants nothing (`PRD-ACS-005`).
- The one exception is own-record scope, which has no dimensions. Only the self-service role uses it (`PRD-ACS-021`, `PRD-ACS-022`).
- Selected members are checked through the scope contract of `organisation` and `merchandise` when the assignment is saved (module-map section 3, rule 6).

### 5.2 The place tree

- Places form one tree: a Site, the Stores linked to it on a date, and the business units of each Store; warehouse and office units hang directly under their Site ([structure-and-masters.md](../masters/structure-and-masters.md) 3.9; `PRD-ACS-021`).
- A selected Site covers every Store and business unit at it, including ones added later. A selected Store covers every business unit of it, including ones added later (`PRD-ACS-021`, DEC-094, DEC-098). A selected business unit covers only itself (`PRD-ACS-005`).
- From stage 5, when a Store can relocate, a Store-scoped assignment follows the Store and a Site-scoped one covers the Stores linked to the Site on the record's business date ([structure-and-masters.md](../masters/structure-and-masters.md) 3.9). **Design choice.** A business unit stays at its Site, so a Site-scoped assignment covers it through that Site. A relocating Store gets new business units at its new Site, linked to its old ones, and stock moves between them by transfer (DEC-105, GC2-4; [structure-and-masters.md](../masters/structure-and-masters.md) 3.3).

### 5.3 Matching a record

- Each record type declares which scope facts it carries: legal entity, Site, Store, business unit and brand. The owning module passes its record's facts to Authorise (module-map section 3, rule 6). **Design choice.**
- The legal entity comes from the business unit's mapping version that the record uses, never from the Site (`POL-10.01`; [structure-and-masters.md](../masters/structure-and-masters.md) 3.4).
- For each dimension the record carries, the assignment's scope must cover the record's fact. A dimension the record type does not carry is not checked: a brand or a party has no place, so the permission on its record type decides (4.1). **Design choice.**
- A record with several facts in one dimension:
  - Several brands, such as a document with lines of several brands: covered only when every brand is covered, so a brand-limited assignment never acts on another brand's lines. **Design choice.**
  - Two places, such as a transfer: the action names the place it acts at, such as dispatch at the source and receipt at the destination. The stage 3 transfer design names it per action. Allowed destinations are shown by name and code only (`PRD-TRF-004`).
- A fact that is Unknown, such as the brand of unidentified goods, is covered only by all-members scope in that dimension. Unknown never matches a selected member (`PRD-MOD-015`). **Design choice.**

### 5.4 Own records

- Each module declares which of its record types have a subject person. Own-record scope covers those records whose subject is the signed-in user (`PRD-ACS-021`, `PRD-ACS-022`, DEC-041). **Design choice.**
- From stage 6 that includes the person's attendance, targets, incentives and payslips, which `hr` links to the user ([personas.md](personas.md) section 4; `PRD-HRM-012`, `PRD-HRM-015`). Staff also see their own employee record, read-only, through self-service. Its restricted fields follow the self-service role's field permissions (DEC-105, GC3-9). Field-class permissions of the self-service role count as self-service permissions and apply only to own records. **Design choice.** which field classes that role grants is KDPS's and stays OPEN (KDPS question 53; stage 6). A salesperson's own attributed sale lines are declared by `pos` in stage 4 ([personas.md](personas.md), P-SLS).
- Own-record scope never covers another person's record, a legal entity, a place or a brand. An assignment scoped by legal entity, place or brand never grants a self-service permission (`PRD-ACS-022`). Maintain refuses a role that mixes self-service permissions with others, and an assignment of the self-service role with any other scope. **Design choice** that enforces `PRD-ACS-022`.

## 6. Restricted fields and encryption

- Restricted fields are salary, identity documents, bank details, customer contact information, cost and margin (`PRD-ACS-008`), and employee photos, location evidence and payroll data (`PRD-SEC-010`).
- A restricted field is shown only when the same assignment that grants the action also grants its field class (`PRD-ACS-004`, `PRD-ACS-008`). Otherwise a screen shows it masked, so the person knows it exists, and exports, read models, live updates and logs leave it out. **Design choice.**
- Bank details, identity documents, salary and payroll data, and authenticator secrets are encrypted in the application before they reach PostgreSQL, with a key per Organisation held outside the database. The database and its backups hold only the encrypted value (`PRD-SEC-006`, `POL-18.02`). **Design choice.** On test hosting the key is an environment secret ([deployment.md](../platform/deployment.md) section 9). Key storage and rotation on production wait for the production hosting design ([deployment.md](../platform/deployment.md) D-1).
- A restricted value never appears in a log, an error message, an unauthorised cache or a live-update event (`PRD-SEC-006`, `PRD-SEC-014`). The counter never receives cost, margin or receipt-origin value (`PRD-OFF-004`).
- The audit record keeps no copy of an encrypted value, and showing or exporting one writes an access record ([numbering-and-audit.md](../platform/numbering-and-audit.md) 4.3 and 5.2).

## 7. Checking an action

### 7.1 The order

Every request and every job step goes through steps 1 to 3, which are steps 1 and 3 of module-map 6.1. A command that takes locks also goes through step 4, which is step 6 of module-map 6.1. Sign-in and a user's actions on their own credentials and sessions (3.1, 3.2) are one exception: they need only step 1 once a session exists. A new Organisation's setup step (9.11) is the other.

1. **Authenticate.** The session is in force, not locked and not Revoked, and the user is Active (2.1); for a service identity, the identity is enabled and its credential is not revoked (`PRD-INT-001`, `PRD-ACS-017`, `PRD-SEC-008`, `PRD-SEC-018`).
2. **Available.** `configuration` answers whether the operation is available here and now: the capability is on, the policy is Signed, the owning module's configured records are valid, and the activity is granted where one applies (`PRD-SEC-017`, `PRD-LIF-001`; module-map 4.4). Otherwise the request is refused with the blocking reason. This is the stage 1 exit check "an operation whose policy is not configured stays unavailable".
3. **Authorise.** Find one role assignment, or for an approval decision one stand-in grant (section 10), that, on the date of the action, grants the action on the record type, covers the record's scope facts (5.3), and grants every restricted field class the action reads or writes (`PRD-ACS-001`, `PRD-ACS-004`, `PRD-INT-001`). Authorise returns the assignment it used; the audit record and any approval decision store it.
4. **Under the locks.** Check again that the user is Active, or the service identity enabled; repeat step 3 for the same assignment; and make the approval checks of 9.7 (`PRD-INT-003`; stock-ledger 10.4).

- The date of the action is today under the Organisation's timezone, not the record's business date: authority is about who may act now. **Design choice.**
- A refusal names what is missing: the action, the place, the brand or the field class, and where one assignment nearly covers it, which one ([personas.md](personas.md) section 3; `PRD-UXP-003`).
- Jobs, imports, live updates, search, reports and AI answers go through the same steps under their own actor (`PRD-SEC-005`; module-map section 3, rule 8).

### 7.2 Row-level security

- Every table of scoped rows carries the row's scope facts as columns and has a PostgreSQL row-level security policy (`PRD-SEC-005`). The runtime role neither owns the tables nor bypasses the policies ([deployment.md](../platform/deployment.md) section 4).
- A row carries the identifiers of its Site, Store and business unit, as they apply. So a grant for a Site, a Store or a unit matches by equality, and SQL never expands the tree. **Design choice.**
- `access` keeps an effective-grant table: for each actor and record type, the places, legal entities and brands its assignments in force cover, with all members kept as a wildcard. It is derived from the assignments and stand-in grants, and rebuilt when they change and when a start or end date passes (`PRD-ACS-005`, `PRD-ACS-018`). **Design choice.**
- `kernel` sets the actor in a transaction-local setting at the start of each transaction, from the Scope for the database operation of `access` (module-map 4.1 and 4.3). Each policy admits a row when one grant of that actor for the row's record type covers the row's facts, or, for a self-service grant, when the row's subject is the actor. With no actor set, every scoped table shows no rows. **Design choice.**
- Row-level security is a backstop. It limits rows to those some assignment of the actor could reach; the exact check is Authorise, one assignment per action (`PRD-ACS-004`). In a list, each row is shown through one assignment that grants view on it.
- Restricted columns are protected by masking and encryption (section 6), not by row-level security.
- Read models carry the same scope columns and policies, so they are read under the reader's own authorisation (module-map section 3, rule 5). **Design choice.**

## 8. Approval rules

- One approval rule per action type that needs approval. Its fixed parts come from the PRD and the policies and are kept in code: whether independent approval is required (`PRD-ACS-006`, `POL-02.07`), the value basis (`PRD-ACS-015`), and what counts as a material change (`POL-02.12`, with narrower rules such as `PRD-TRF-010`). [domain-model.md](../architecture/domain-model.md) section 5 lists them. Independence that a source requires can never be switched off.
- Its configured parts are effective-dated settings with no default: whether bulk approval is allowed (`POL-02.19`), whether phone approval is allowed (`POL-02.22`), and the approve and reject reasons (`POL-02.23`). A change to them is approved by an authorised person other than the preparer (`POL-02.07`); a decision on a change to the reason list gives a free-text reason (9.5, DEC-104).
- Where `PRD-ACS-015` names no basis for an action, the value bases of DEC-105 apply (DM-8; [domain-model.md](../architecture/domain-model.md) section 5): booking approval, the booking's value at cost; damage confirmation, acceptance of excess, wrong or unidentified goods, and each supplier-return step, cost; day-close cash variance, the difference; payroll inputs, the period's net pay; offers, no value limit. **Design choice.** The limits on those bases are KDPS's and stay OPEN (V-02). The mechanism supports a basis or none.

## 9. Approvals

### 9.1 Requesting approval

- The owning module calls Request approval with: the action type; the document and its exact version; the material facts (source, destination, items, quantity, amount and beneficiary, as they apply); the value on its basis, or Unknown; the scope facts; and the preparers (`PRD-ACS-007`, `PRD-ACS-015`).
- The preparers are every user who recorded a change in the version under approval, including the one who submitted it (DEC-105, GC3-1). **Design choice.**
- Refused when the action has no approval rule in force or the operation is unavailable (7.1 step 2).
- One open request per document version and action type. **Design choice.**
- `access` publishes the request to My work through the outbox (module-map section 3, rule 6).

### 9.2 Approval limits

- A limit is set for one action type, either for an approver role within a scope or for a named individual (`POL-02.09`, `POL-02.15`). It states its basis from the action's rule (`PRD-ACS-015`): cost, bill value, documented valuation, the amount paid, the difference of a day-close cash variance or the period's net pay, in paise (DM-8, DEC-105); a quantity with its unit; or a discount percentage where configured. The basis is shown beside the limit (`PRD-ACS-015`, `POL-02.09`).
- A missing limit grants nothing. Unlimited authority is an explicit setting (`POL-02.09`, `POL-02.15`). Authority over Unknown value is a separate explicit setting (`PRD-ACS-016`).
- An individual limit names the user and the assignment it applies to, and replaces the role's limit for that user and action. **Design choice.**
- A limit covers a value when the value on its basis is at most the limit. **Design choice.**
- Limits are effective-dated, and a change is approved by an authorised person other than the preparer (`POL-02.07`). The values are OPEN (V-02; KDPS Owner; stage 1 live approvals).

### 9.3 Who may decide

An eligible approver for a request is a person who, when deciding:

- holds an assignment in force that grants approve on the action's record type and covers the request's scope facts (`PRD-ACS-001`, `PRD-ACS-004`), or holds a stand-in grant that covers the request (section 10);
- has, through that same assignment or stand-in grant, a limit that covers the value on its basis, or explicit authority over Unknown value when the value is Unknown (`PRD-ACS-004`, `POL-02.09`, `PRD-ACS-016`). For PT approval, a missing or disputed proposed acquisition cost blocks value-based approval until it is resolved (`PRD-ACS-016`, `POL-02.09`). An action whose approval has no value ("—") or no value limit (offers, DM-8; [domain-model.md](../architecture/domain-model.md) section 5) needs only the approve permission. For an action whose basis `PRD-ACS-015` does not name, the value basis is the one DEC-105 sets (section 8; [domain-model.md](../architecture/domain-model.md) section 5);
- is not one of the preparers, through any role (`PRD-ACS-006`, `POL-02.08`);
- is a person, never a service identity (2.3).

A higher authority is a different person whose limit covers the action on its value basis (PRD "Words used", DEC-043). Transfers need one (`PRD-TRF-005`).

### 9.4 Routing

- The request is offered to the eligible approvers with the lowest limit that covers its value; explicit unlimited authority comes after every finite limit. If nobody is eligible, it stays Awaiting approval and is never approved automatically (`POL-02.09`, DEC-043). **Design choice** of the order.
- Eligibility is worked out when My work is read and again at Decide, so a change to assignments, limits or stand-ins applies as soon as it is in force. **Design choice.**
- Overdue requests escalate under a configured rule (`PRD-ACS-010`). An approval gets a due time and an escalation recipient per action type and Site, set like exception routing (12.2) as effective-dated settings (DEC-105, GC3-8). An escalation adds the recipient and keeps the owner (11.3). **Design choice.** No policy names the values, so they are KDPS's and stay OPEN (KDPS question 52; stage 1 live approvals).

### 9.5 Deciding

- The approver approves or rejects, with a reason from the configured list, evidence and a comment (`PRD-ACS-010`, `POL-02.23`). Until the list is configured, deciding is unavailable, since nothing is on by default. The one exception is a decision on a change to the reason list itself, which gives a free-text reason, so the first list can be approved (DEC-104). On `kdps-test` before policy 2 is Signed, the first reason list, with the reasons KDPS gives (KDPS Owner question 45), is a setting of the test setup, approved first by a different authorised person with a free-text reason; it enables no gated action (DEC-105, DEC-104, DEC-071; GC3-12). Until it is in force, the test role assignments of 4.3 cannot be decided.
- Decide checks 9.3 again, that the request is still open, and that the document's current version is the one requested (`PRD-ACS-007`).
- The decision records the approver, the time, the outcome, the reason, the evidence, the comment, the version decided, the value and its basis, the approved amount where the document states one, and the role assignment and limit version, or the stand-in grant, it relied on ([domain-model.md](../architecture/domain-model.md) 3.2). It is an entry and is never edited.
- Then, depending on the document (module-map 6.2): a master version takes effect in the same transaction (flow A); a document posts in the same transaction; or a large document waits for its job (9.8).
- A rejection returns the document to its preparers. A new version needs a new request.

### 9.6 Material change

- A change to a material fact after a request or a decision ends its force. The new version needs a new request (`PRD-ACS-007`, `POL-02.12`). The request that the change ended is shown as Superseded (DEC-105, DM-4; [design-language.md](../ui/design-language.md) section 7).
- The owning module declares, per action type, which of the facts bound by `PRD-ACS-007` and listed in `POL-02.12` are relevant to it. A narrower rule applies only where a source gives one: for a transfer, only an increase in quantity, a change of item or a change of destination is material (`PRD-TRF-010`, DEC-036).
- When a change that is not material makes a new version, the decision stays in force, and the module records that it carried to the new version. **Design choice.**

### 9.7 Recheck under the locks

After the authority rows of step 0, the posting module locks the document and its approval rows (stock-ledger 10.3, step 1) and asks `access` to verify (stock-ledger 10.4):

- the decision is Approved and not yet used (9.8);
- the version being posted is the version decided; or, when a later step of the document posts it, such as a transfer's dispatch, a version the decision carried to (9.6). A queued posting takes only the version its request to post names (9.8, DEC-097);
- the approver is still not one of the preparers (`PRD-ACS-006`);
- the value under the lock, on its basis, is within the limit the decision relied on and within the approved amount. Otherwise posting is refused and the document returns for renewed approval (`PRD-ACS-007`, `POL-02.12`, DEC-066).

The approver's authority is judged when they decide; the recheck uses the limit recorded in the decision. **Design choice.**

### 9.8 Approval of a document a job posts (settles SL-22)

A large document is approved by a click and posted later by a job, one at a time per accounting book (stock-ledger 10.6). DEC-097 settles what happens between the two.

1. **The click.** One transaction records the Approved decision, its audit record, a request to post naming the decision and the version, and the outbox row for the job. It has no stock or money effect.
2. **The job.** It acts as a service identity on behalf of the approver (2.3). It does the slow work first, then one transaction: it locks the document and the decision (stock-ledger 10.3, step 1), rechecks (9.7), where the version posted must be the one the request to post names, posts, and records the use of the decision: this decision authorised this posting. The use commits with the stock and money records; it is the approval evidence of `PRD-INT-004`.
3. **Once.** A decision has at most one use, enforced by a unique key. A replayed job finds the use and does nothing more (`PRD-INT-002`, `PRD-INT-008`).
4. **A failed job.** Nothing is posted. The decision stays Approved and unused, and the document shows the failure (stock-ledger 10.6). A job that still fails after its retries raises an unfinished-operation exception (`PRD-EXC-001`), routed under `POL-02.16`. **Design choice.**
5. **A retry.** Started by an authorised person, or by the job runner under its retry rule (the code house rules; **Design choice**). It uses the same decision only while the document version is unchanged and the value under the lock is within the decision's limit and the approved amount; otherwise the document returns for renewed approval (`PRD-ACS-007`, DEC-066).

### 9.9 Bulk approval

- Only for action types on the configured allowlist (`PRD-ACS-011`, `POL-02.19`). The allowlist is OPEN (alignment report B-9; KDPS Owner, Admin).
- The screen shows the selected items and their total on their shared basis: the sum of the known values and the number of items whose value is Unknown, which are never added as zero. Items on different bases are not totalled together (`PRD-ACS-019`, `PRD-MOD-015`). **Design choice** of how Unknown is shown.
- Each item is its own decision in its own transaction, rechecked for permission, scope, limit, state and independence. An item that fails goes to individual review; the others go on. A batch identity links the decisions (`PRD-ACS-019`, `POL-02.19`). **Design choice.**

### 9.10 Phone approval

- From stage 5 ([phases.md](../../phases.md)). A message carries a link to the request and its exact version. The link is not a credential: opening it needs a signed-in session with the second factor, and the checks of 9.5 apply (`PRD-ACS-012`). A plain reply is never an approval.
- Only allowlisted action types. The list is OPEN (V-60, `POL-02.22`; KDPS Owner; stage 5).

### 9.11 Changes to access

- Changes to roles, permissions, role assignments, limits, approval rules, allowlists and reasons are prepared, approved by an authorised person other than the preparer, effective-dated, and kept with their history (`POL-02.06`, `POL-02.07`; module-map 6.2 flow A). Stand-in grants follow the same route (DEC-105, GC3-7).
- Each writes an audit record and a permission-change access record ([numbering-and-audit.md](../platform/numbering-and-audit.md) 5.2; `PRD-SEC-007`).
- A new Organisation's first Admin and its first approver of access changes are created together in one setup step, recorded and audited under a service identity, because no user of the Organisation can yet approve it. Every later change follows independent approval (`PRD-ACS-023`, DEC-101). The first Admin and the first approver are two different people, since an approver must differ from the preparer (`PRD-ACS-006`). The step runs once, while the Organisation has no user yet; it is the platform's own operation, so no role assignment authorises it, and its audit record names the service identity as the actor. **Design choice** of running it once and of how it is authorised.

## 10. Stand-ins

- A stand-in grant names the stand-in, the person they stand in for, the actions, scope and limits it gives, and its start and end. It ends by itself at the end time (`PRD-ACS-018`, `POL-02.20`).
- A grant is never wider than the authority of the person stood in for on those dates. **Design choice.**
- A stand-in never approves work they prepared; 9.3 applies to them as to anyone (`PRD-ACS-018`, `POL-02.20`).
- A person who holds the stand-in permission records the grant. A grant needs approval by a different authorised person from the one who recorded it before it takes effect (DEC-105, GC3-7; KDPS confirms, question 51).
- The stand-in sees in My work the items the grant covers (`PRD-ACS-010`), and a decision records the grant it relied on.
- The real names, scopes, limits and periods are OPEN (`POL-02.20`; KDPS Owner question 5).

## 11. My work

### 11.1 Work items

- A work item belongs to `inbox` and is a projection of the owner's record ([domain-model.md](../architecture/domain-model.md) 3.3). It holds: the kind (task, approval or exception); the owning module, record type, record and version; who may act, as named users or as the owner's rule for who is eligible; the due time; the exposure in paise or Unknown; and the scope facts.
- The owning module publishes, updates and closes its items (module-map 4.8). `exceptions` and higher modules call `inbox` in their own transaction; `access` publishes through the outbox (module-map section 3, rule 6). For a task or an approval, `inbox` sets the due time and escalation recipient from `work_item_routing` when it receives the item (GC3-8, DEC-105). **Design choice.**
- An item is keyed by the owner's record, version and kind, so a replay never makes a second item (`PRD-INT-008`).

### 11.2 The list

- One list per person, with the tasks, exceptions and approvals they may act on, including those a stand-in grant covers (`PRD-ACS-009`, `PRD-ACS-010`).
- Ordered by due time, earliest first, then by exposure, largest first. An Unknown exposure sorts above every known amount at the same due time and never counts as zero (`PRD-ACS-009`, `PRD-MOD-015`). **Design choice** of where Unknown sorts.
- Each item shows its state, its blocking reason and its next action (`PRD-UXP-003`). Opening it opens the owner's record; acting runs the owner's operation with its own checks (module-map 4.8).
- Every signed-in user has My work. `access` filters it, so an item drops out as soon as its reader is no longer eligible. **Design choice.**

### 11.3 Escalation and alerts

- For an exception, a job escalates an open item past its due time under the rule routed for its type and Site (`POL-02.16`); the rules are OPEN (V-03). For a task or an approval, a due time and an escalation recipient are set per action type and Site, like exception routing (12.2), as effective-dated settings (DEC-105, GC3-8). No policy names the values, so they stay OPEN (KDPS question 52; KDPS Owner, Admin; stage 1 live approvals). **Design choice:** an escalation adds the recipient, keeps the original owner and is recorded (`PRD-ACS-010`). The item shows Overdue ([design-language.md](../ui/design-language.md) section 7).
- Before stage 5 nothing is sent (DEC-099). An alert to responsible users about cash gaps, large discounts, missing reports, overdue transit or return deadlines reaches them as a work item or an exception in My work, and on the screen concerned (`PRD-EXC-013`). Which alerts are on, their thresholds and recipients are OPEN (V-70, `POL-02.25`). From stage 5, `notifications` may also send them.
- Live updates carry the item's identifier only; the screen refetches it through `inbox` ([deployment.md](../platform/deployment.md) section 5).

## 12. Exceptions

### 12.1 The record

- An exception holds: a code from a number series ([numbering-and-audit.md](../platform/numbering-and-audit.md)); its type; links to the affected records and their versions; evidence, as attachments in `files-imports`; its exposure in paise or Unknown; its owner; its due time; its status; its Site, and its Store, business unit and brand where they apply (`PRD-EXC-001`; PRD "Words used": Exception).
- Types: shortage, excess, damage, mismatch, transit gap, cash variance, uncertain payment, missing report and unfinished operation (`PRD-EXC-001`), and source conflict (`POL-03.04`). Each module registers the types it raises, the record types they link to, and the resolution check it implements (module-map section 3, rule 6). **Design choice.**
- Raise is keyed by the event that raised it, so a replay never makes a second exception (`PRD-INT-008`).
- It is raised in the transaction that found the problem, or, after a rollback, in a new transaction of its own (module-map 4.13).

### 12.2 Routing

- A routing rule per type and Site names the owner, the due-time rule and the escalation (`POL-02.16`, `POL-03.05`, DEC-037). Policy 2 routes stock to Operations, money to Accounts and supplier Booking matters to Booking (`POL-02.16`). The real owners, due times and escalation are OPEN (V-03; KDPS Owner, Admin).
- The owner is a named user, or a role within the Site's scope. For a role, the exception appears in the My work of each holder until one takes it. **Design choice.**
- An operation whose exceptions have no routing configured stays unavailable (`POL-02.16`).
- Routing rules are effective-dated settings in `exceptions`, kept with their history (`PRD-MOD-010`).

### 12.3 Lifecycle

- **Raised.** Its first state is Unresolved (DEC-105, DM-4; [design-language.md](../ui/design-language.md) section 7).
- While open, it can be reassigned, commented on, given evidence and escalated (`POL-03.05`).
- **Resolved** when the permitted correction, return, reversal or reconciliation is recorded in its owning module (`PRD-EXC-002`).
- **Closed** only after the owning module's resolution check verifies the linked business outcome (`PRD-EXC-002`) and any required approval is in force (`POL-03.05`). The required approval is the approval of the linked correction in its owning module; a type that needs an approval of its own names it in its stage design. **Design choice.**
- **Overdue** when past its due time. **Reopened** when the problem comes back. Repeated, reopened and unresolved cases are kept (`PRD-EXC-003`).
- An exception settles nothing: closing it changes no stock, money or saleability (`PRD-EXC-003`, `POL-03.05`).
- A new exception of the same type on the same linked record links to the earlier one, so recurring issues show (`PRD-EXC-004`). **Design choice.**
- Read model: open exceptions by Store, brand and type, with exposure and repeats; Unknown exposure is counted apart, never as zero (`PRD-EXC-004`, `PRD-MOD-015`).

## 13. Tables

Every table has a UUIDv7 primary key. "+ versions" means a companion table of effective-dated versions with an exclusion constraint on approved versions ([structure-and-masters.md](../masters/structure-and-masters.md) 2.2). Each module owns one PostgreSQL schema, and a reference to another module's record keeps its identifier without a foreign key ([structure-and-masters.md](../masters/structure-and-masters.md) 2.5). **Design choice** throughout; other columns are left to reviewed migrations.

### 13.1 Schema `access`
<!-- deps: PRD-ACS-001, PRD-ACS-005, PRD-ACS-007, PRD-ACS-010, PRD-ACS-015, PRD-ACS-016, PRD-ACS-018, PRD-ACS-020, PRD-ACS-022, PRD-SEC-001, PRD-SEC-006, PRD-SEC-008, PRD-SEC-018, PRD-INT-004, POL-02.07, POL-02.09, POL-02.15, POL-02.19, POL-02.20, POL-02.22, POL-02.23 — table list for the records of sections 2 to 10 -->

| Table | Unique | Other constraints |
| --- | --- | --- |
| `app_user` + versions | login identifier, ignoring letter case | never deleted; a partner user names its partner |
| `password_credential` | user | Argon2 hash only |
| `second_factor` | user, for the one in force | secret encrypted |
| `session` | identifier hash | user, kind and device fixed; Revoked is final |
| `device` + versions | code | Revoked is final |
| `service_identity` + versions, `service_credential` | code | credential stored as an Argon2 hash; revocable |
| `persona_held` (dated) | — | persona is one of P-OWN … P-AUD |
| `role` + versions, `role_permission` | code | a role with a self-service permission has no other permission |
| `role_assignment` (dated) | — | the actor is a user or a service identity; own-record scope only for a self-service role, and only own-record scope for it; a partner user's assignment selects Stores only |
| `assignment_scope` | assignment and dimension | dimension is legal entity, place or brand; kind is all, selected or empty |
| `assignment_scope_member` | assignment, dimension and member | place members are a Site, a Store or a business unit |
| `effective_grant` | — | derived from assignments in force; rebuildable (7.2) |
| `approval_rule_setting` + versions | action type | bulk allowed; phone allowed |
| `approval_reason` + versions | code | approve or reject |
| `approval_limit` (dated) | — | for a role and scope or a named user; basis stated; a value, explicit unlimited, and explicit authority over Unknown kept apart; no overlap for one action and holder |
| `stand_in_grant` | — | ends after it starts; expires by itself; takes effect only when approved by a different person from its preparer |
| `approval_request` | document, version and action type, for open requests | value on its basis or Unknown |
| `approval_decision` | request | append-only; names the assignment and limit version, or the stand-in grant, it relied on |
| `approval_carry` | decision and version | only to a version with no material change |
| `approval_use` | decision | one use per decision; written in the posting transaction |
| `bulk_decision_batch` | — | links its decisions |

### 13.2 Schema `inbox`
<!-- deps: PRD-ACS-009, PRD-ACS-010, PRD-INT-008, PRD-MOD-015 — table list for work items (11) -->

| Table | Unique | Other constraints |
| --- | --- | --- |
| `work_item` | owner module, record, version and kind | exposure in paise or Unknown; rebuildable by the owners |
| `work_item_actor` | — | a named user, or the owner's eligibility reference |
| `work_item_escalation` | — | append-only |
| `work_item_routing` + versions | action type and Site | due-time rule and escalation recipient for tasks and approvals; no default (9.4, 11.3) |

### 13.3 Schema `exceptions`
<!-- deps: PRD-EXC-001, PRD-EXC-002, PRD-EXC-003, PRD-EXC-004, PRD-INT-008, POL-02.16, POL-03.04, POL-03.05 — table list for the exception record (12) -->

| Table | Unique | Other constraints |
| --- | --- | --- |
| `exception_type` | code | registered by the raising module |
| `exception` | code; raising event | type and Site fixed; status is a projection of its events |
| `exception_link` | exception and linked record | — |
| `exception_event` | — | append-only: raised, assigned, comment, evidence, escalated, resolved, closed, reopened |
| `exception_routing` + versions | type and Site | owner, due-time rule, escalation |

## 14. Screens
<!-- deps: PRD-UXP-003, PRD-ACS-009, PRD-ACS-015, PRD-ACS-019, PRD-ACS-021 — where the access screens sit and what GC-3 adds -->

- [ui-blueprint.html](../ui/ui-blueprint.html) holds these screens: Setup › Personas and roles (templates and role assignments), Approval limits, Exception rules, Devices, tills and bill series, Audit log and Policy readiness; Home › My work (tasks, approvals, exceptions).
- GC-3 adds four things to them:
  - The assignment editor shows the place scope as the tree, and says that a selected Site covers Stores and business units added later, and a selected Store covers business units added later (`PRD-ACS-021`).
  - An approval shows the value and its basis beside the limit (`PRD-ACS-015`).
  - A disabled action names what is missing (`PRD-UXP-003`).
  - Bulk approval shows the items, the total and the number of items of Unknown value (`PRD-ACS-019`).

## 15. Tests on synthetic data

All data is labelled synthetic and never becomes a default (`AGENTS.md`: "Never invent a value"). Tests run against real PostgreSQL.

| # | Test | IDs |
| --- | --- | --- |
| 1 | **Stage 1 exit check.** An operation whose policy is not Signed stays unavailable and names its blocking reason | `PRD-SEC-017`, `PRD-UXP-003` |
| 2 | Two Organisations: a user of one cannot sign in with the other's code, and no row crosses | `PRD-ACS-020` |
| 3 | Sign-in needs the password and the authenticator code; every wrong part gets the same refusal; attempts are recorded | `PRD-SEC-001`, `PRD-SEC-007` |
| 3a | A protected action asks for a fresh authenticator code; with no freshness setting, each one asks again | `PRD-SEC-001`, DEC-105 |
| 3b | A reset of another user's credential needs a fresh code, revokes every session of that user and writes an access record; a user cannot reset their own credential, even holding edit on all credentials | `PRD-SEC-001`, `PRD-SEC-007`, `PRD-SEC-008`, DEC-105 |
| 3c | In `dev`, sign-in needs a password and an authenticator code, as in production, and its users are labelled synthetic | `PRD-ACS-017`, `POL-02.17`, DEC-105 |
| 4 | Idle lock and absolute limit with synthetic values; unfinished work is offered back | `PRD-ACS-017` |
| 5 | Revoking a device or a user's sessions refuses the next request | `PRD-SEC-008` |
| 5a | A role assignment version that starts on a past date is refused | `PRD-ACS-005`, `PRD-MOD-010`, DEC-105 |
| 6 | A persona alone grants nothing | `PRD-ACS-002`, `PRD-ACS-003` |
| 7 | One user, two assignments: cost is visible at the Store whose assignment grants it and masked at the other | `PRD-ACS-004`, `PRD-ACS-008` |
| 8 | A selected Site covers a new Store and unit; a selected Store covers a new brand counter; a selected unit does not cover a new unit | `PRD-ACS-021`, `PRD-ACS-005` |
| 9 | All members covers a new Site; an empty dimension grants nothing | `PRD-ACS-005` |
| 10 | The self-service role reaches only its user's records; a role mixing self-service with other permissions is refused | `PRD-ACS-022` |
| 10a | A user of the self-service role reads their own employee record, read-only, and cannot edit it; a restricted field of it shows only where the role's field permissions grant it | `PRD-ACS-022`, `PRD-ACS-008`, DEC-105 |
| 11 | Row-level security: with no actor set no scoped row shows; with an actor, only covered rows | `PRD-SEC-005` |
| 12 | Self-approval is refused, also through another role | `PRD-ACS-006`, `POL-02.08` |
| 12a | Every user who recorded a change in a version, not only the one who submitted it, is refused as its approver | `PRD-ACS-006`, `POL-02.08`, DEC-105 |
| 13 | A missing limit grants nothing; Unknown value needs explicit authority; a request above every limit stays Awaiting approval | `POL-02.09`, `PRD-ACS-016` |
| 13a | Each action the PRD gives no basis is limited on its DEC-105 basis, with synthetic limits (a booking on its value at cost; day-close cash variance on the difference); an offer has no value limit and needs only the approve permission | `PRD-ACS-015`, DEC-105 |
| 14 | A material change ends an approval; a transfer reduced before dispatch keeps it | `PRD-ACS-007`, `PRD-TRF-010` |
| 15 | A value under the lock above the decision's limit is refused for renewed approval | `PRD-ACS-007`, DEC-066 |
| 16 | A queued posting whose job fails keeps its decision unused; a retry on the same version posts once with its use record; a changed version needs a new approval | `PRD-INT-004`, `PRD-INT-008`, DEC-097 |
| 17 | Bulk approval refuses an action type not on the allowlist; a failing item goes to individual review; Unknown values are never added as zero | `PRD-ACS-019` |
| 18 | A stand-in grant expires by itself; a stand-in cannot approve their own preparation | `PRD-ACS-018` |
| 18a | A stand-in grant approved by the person who recorded it is refused, and it takes no effect until a different authorised person approves it | `PRD-ACS-018`, DEC-105 |
| 19 | An access change approved by its preparer is refused | `POL-02.07` |
| 19a | A new Organisation's setup step creates its first Admin and first approver once; a second run is refused; the next access change needs a different approver | `PRD-ACS-023` |
| 19b | A decision on a change to the reason list accepts a free-text reason; any other decision needs a reason from the list in force | `POL-02.23`, DEC-104 |
| 19c | On `kdps-test` before policy 2 is Signed, the first reason list is approved with a free-text reason, after which the test role assignments can be decided; nothing gated is enabled | `POL-02.23`, DEC-104, DEC-105 |
| 20 | My work order, with Unknown exposure never treated as zero | `PRD-ACS-009`, `PRD-MOD-015` |
| 20a | An approval or task past its due time, with a synthetic due time and recipient set for its action type and Site, escalates: the recipient is added, the owner is kept and the escalation is recorded | `PRD-ACS-010`, DEC-105 |
| 21 | An exception raised after a rollback survives; a replay makes no second exception; closing waits for the resolution check | `PRD-EXC-002`, `PRD-INT-008` |
| 22 | A service identity cannot decide an approval | `PRD-ACS-006`, `PRD-SEC-018` |
| 23 | A restricted value never appears in logs or live updates, and an encrypted value never appears in an audit record | `PRD-SEC-006`, `PRD-SEC-014` |

## 16. Open questions

Nothing below has a default. A row marked Baseline (DEC-105) is settled for the build; the person named confirms it or asks for a change, which is a new decision entry. Questions already open elsewhere are pointed to, not repeated: who holds which role, scope and limit (V-01, V-02); exception owners, due times and escalation (V-03); approval and task due times and escalation recipients (KDPS question 52); validating sign-in settings (V-04); approve and reject reasons (`POL-02.23`; KDPS Owner question 45; stage 1); the bulk allowlist and stand-ins (alignment report B-9); phone approval types (V-60); alert thresholds (V-70); the readiness approver (MM-8); what partners see (`POL-12.04`); the limits and holders for the Owner's loss approvals ([personas.md](personas.md) section 6). The state names (DM-4) and the value bases not named by the PRD (DM-8) are baseline picks of DEC-105 (2.1, 9.6, 12.3; section 8).

| # | Question | Kind | Who decides | Blocks | Impact |
| --- | --- | --- | --- | --- | --- |
| GC3-1 | Baseline (DEC-105): the preparers of a version are everyone who recorded a change in it, including the one who submitted it (9.1) | Business | KDPS Owner | — | — |
| GC3-2 | Settled: one setup step, recorded under a service identity, creates the first Admin and the first approver of access changes (`PRD-ACS-023`, DEC-101; 9.11) | — | — | — | — |
| GC3-3 | Settled: before policy 2 is Signed, `kdps-test` sessions use the values `POL-02.18` states (DEC-102; 3.3) | — | — | — | — |
| GC3-4 | Baseline (DEC-105): a credential reset needs no second approver; it is a protected action, it is recorded, and nobody resets their own (3.2) | Business | KDPS Owner, Admin | — | — |
| GC3-5 | The password rules, and after how many failed sign-ins attempts slow down or stop, for how long (3.1) | Business | Admin (V-04); product owner | 1 live use | Sign-in security settings |
| GC3-6 | Baseline (DEC-105): the protected actions are those in 3.3 (the first four from GC3-6; the reset follows from GC3-4) (`PRD-SEC-001`). **OPEN:** how long a fresh code lasts is a setting with no default (3.3; KDPS Owner question 54) | Business | KDPS Owner | 1 live use (the freshness setting) | How long a fresh code is trusted |
| GC3-7 | Baseline (DEC-105): a stand-in grant needs approval by a different authorised person (10) | Business | KDPS Owner | — | — |
| GC3-8 | Baseline (DEC-105): approvals and tasks get a due time and an escalation recipient per action type and Site, set like exception routing; an escalation adds the recipient and keeps the owner (9.4, 11.3). The values are KDPS's (KDPS question 52) | Business | KDPS Owner, Admin | — | — |
| GC3-9 | Baseline (DEC-105): staff see their own employee record, read-only, through self-service; its restricted fields follow the self-service role's field permissions (5.4). Which field classes the role grants is KDPS's (KDPS question 53) | Business | KDPS Owner, HR | — | — |
| GC3-10 | Settled: a decision on a change to the reason list gives a free-text reason (DEC-104; 9.5) | — | — | — | — |
| GC3-11 | Settled: on `kdps-test`, KDPS staff get role assignments as test-setup settings that enable no gated action (DEC-103; 4.3) | — | — | — | — |
| GC3-12 | Baseline (DEC-105): on `kdps-test`, the first reason list, with the reasons KDPS gives (question 45), is a setting of the test setup, approved first with a free-text reason under DEC-104 (4.3, 9.5) | Business | KDPS Owner, Admin | — | — |

**Settled here:** SL-22 and MM-4 (DEC-097, section 9.8); MM-5 (this document settles SL-22); MM-9 (DEC-099, sections 3.1 and 11.3); GC2-8 (DEC-098, section 5.2); which assignment carries self-service (DEC-100, sections 4.2 and 5.4). GC3-2 (DEC-101, section 9.11); GC3-3 (DEC-102, section 3.3). GC3-10 (DEC-104, section 9.5); GC3-11 (DEC-103, section 4.3). Baseline picks of DEC-105: GC3-1 (9.1), GC3-4 (3.2), GC3-6 (3.3; how long a fresh code lasts stays OPEN), GC3-7 (10), GC3-8 (9.4, 11.3), GC3-9 (5.4), GC3-12 (4.3, 9.5); GC2-4 (5.2); GC2-7 (4.3); DM-4 (2.1, 9.6, 12.3); DM-8 (8, 9.3); D-6, for service identities and the development sign-in (2.3, 3.1).
