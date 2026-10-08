# Business structure and masters

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Current**, 3 Oct 2026. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements these PRD sections: Organisation, sites and ownership; Merchandise and identifiers; and, from People, access and approvals, the place scope of a role assignment, restricted fields, audit and the approvals these masters need. It is GC-2 in [gaps-before-code.md](../../history/gaps-before-code.md).

- PRD IDs: `PRD-ORG-001`–`PRD-ORG-017`, `PRD-ORG-020`, `PRD-ORG-021`; `PRD-MER-001`–`PRD-MER-018`; `PRD-ACS-001`, `PRD-ACS-005`, `PRD-ACS-006`, `PRD-ACS-008`, `PRD-ACS-020`–`PRD-ACS-022`; `PRD-IMP-003`, `PRD-IMP-008`–`PRD-IMP-010`; `PRD-UXP-003`; `PRD-ACS-013`; cited as pointers only: `PRD-FRN-005`, `PRD-LED-002`, `PRD-OFR-001`, `PRD-TRF-001`; `PRD-LIF-001`, `PRD-LIF-002`, `PRD-LIF-017`, `PRD-LIF-019`–`PRD-LIF-021`, `PRD-LIF-029`; `PRD-MOD-002`, `PRD-MOD-008`–`PRD-MOD-011`, `PRD-MOD-015`; `PRD-SEC-006`; `PRD-TRF-004`; `PRD-ACP-013`, `PRD-ACP-019`.
- Policies: 1 (`POL-01.01`–`POL-01.11`, `POL-01.14`), 2 (`POL-02.02`, `POL-02.07`, `POL-02.08`), 4 (`POL-04.01`–`POL-04.09`), 10 (`POL-10.01`, `POL-10.02`, `POL-10.05`, `POL-10.06`, `POL-10.08`, `POL-10.09`).
- Decisions: DEC-041, DEC-054, DEC-086, DEC-093, DEC-094, DEC-095, DEC-096, DEC-098, DEC-100, DEC-105, DEC-116.

Depends on: [module-map.md](../architecture/module-map.md) (owners, interfaces and events of `organisation` and `merchandise`), [domain-model.md](../architecture/domain-model.md) (the records and invariants this document makes concrete), [stock-ledger.md](../stock/stock-ledger.md) (the place facts a movement carries).

Used by: the access design, [access-and-approvals.md](../access/access-and-approvals.md) (GC-3), which uses the place tree of section 3.9; the stage 1 code of `organisation` and `merchandise`; every later design that reads the structure, a SKU, a party or an agreement.

---

## 1. What this document fixes

- The fields, codes, versions and checks of the `organisation` module and of the catalogue and parties parts of `merchandise`. Their owners, interfaces and events are in module-map 4.11 and 4.12 and are not repeated.
- The tables each module owns, by name, key and constraint (section 6). Other columns are left to reviewed migrations.
- The place tree that role assignments use (section 3.9).

It fixes no screen beyond pointers (section 8), no approval limit and no KDPS value. Labels (**Design choice**, **Proposed**, **OPEN**) mean what module-map section 1 says.

## 2. Rules for every master

### 2.1 Codes and names

- Every record has a UUIDv7 identifier. A record people refer to also has a business code, unique in the scope named in sections 3 to 5 (`PRD-MOD-008`).
- A code is never reused, including after closure, restore or export (`PRD-ACP-019`, `PRD-LIF-020`). A Site code is permanent (`PRD-ORG-003`). Other codes are never changed either, so a record keeps one code for life; a mistyped code is fixed by retiring the record and creating a new one. **Design choice.**
- A name is a label and can change; earlier names are kept as aliases where the PRD asks for them (`PRD-ORG-008`).
- The Organisation chooses its codes. The system checks only that a code is not blank and is unique in its scope. It is stored as text and compared exactly, so leading zeros are kept. **Design choice.**

### 2.2 Effective-dated versions

- A master is one identity row plus version rows. A version holds the fields that may change and the business dates it is in force: from a start date, up to an end date or open-ended (`PRD-MOD-010`). Business dates are under the Organisation's timezone (`PRD-MOD-009`).
- Approved versions of one master never overlap, so versions in force never do. PostgreSQL enforces it with an exclusion constraint on the master and its date range, applied to every approved version: Scheduled, In force and Ended. Versions Awaiting approval, Rejected versions and versions withdrawn before their start are left out (`PRD-MOD-010`; [code-house-rules.md](../platform/code-house-rules.md) 7.3). **Design choice.**
- Where a master must always have a version in force, such as a business unit's mapping (section 3.4), a new version ends the one before it on its start date, so no gap opens.
- A version in force is never edited, so the version a transaction used stays as it was (`PRD-MOD-010`). A change is a new version with its own start date. **Design choice.**
- A version may start today or later, never on a past date, because a transaction keeps the version it used and a back-dated version would disagree with it. A draft whose start date passes before approval is re-dated before it takes effect. A change found late is recorded from today, with its real date noted on it. **Design choice.** There is no exception: no master version ever starts on a past date (GC2-7, DEC-105). A relocation is recorded before its date in the stage 5 relocation flow (`PRD-LIF-029`).
- **Re-dating, as built** (`S1-F02-T01` review, 8 Oct 2026). Approving a draft whose start has passed is refused (`organisation.starts-in-past`), and the draft never takes effect. Its preparer, or another person who may change the record, re-dates it by preparing the same change again from today or later; the new version's request supersedes the draft's (access-and-approvals 9.6), as for any later version of the record. The screen offers Re-date on such a draft, starting from its fields. GC2-7 does not say who re-dates, so the least surprising reading is taken: whoever may prepare the change, never the approver, since approval binds to the exact version (`PRD-ACS-007`). **Design choice.**
- **A version that starts before a Scheduled one** (product owner, 8 Oct 2026). A version may start before an approved Scheduled version of the same record. When approved, it ends where the Scheduled version starts, so no two overlap; the Scheduled version keeps its own values, and the change is not carried into it. The editor warns the preparer of this when the chosen start falls before an approved Scheduled version. Versions may be approved in any order of their starts: approving a later one first never blocks an earlier one. Only an approved version on the same start date is refused (`organisation.version-overlaps`).
- A transaction stores the identifier of each version it used (`PRD-MOD-010`, `PRD-ACP-013`).
- History is kept: earlier versions, who recorded them and when (`PRD-ACS-005`, `PRD-ACS-013`).

### 2.3 Changing a master

- A change follows flow A of module-map 6.2: a draft version, approval where a rule needs it, then the version takes effect from its start date, with the audit record and outbox rows in the same transaction.
- Independent approval applies where `POL-02.07` or the PRD requires it. For the records in this document that is: a supplier's bank-detail change (`POL-02.07`) and the confirmation of a vocabulary value or mapping rule (`PRD-IMP-008`, `POL-02.07`).
- Accounts and the CA approve statutory settings (`POL-10.05`), and a business unit's mapping to a tax registration is verified before statutory goods-in processing (`POL-10.08`). Under the baseline, verifying a mapping is a separate permission, held by a different person from the one who made the mapping (GC2-2, DEC-105). Accounts and the CA confirm the verification rule, and whether a mapping also counts as a statutory setting under `POL-10.05`.
- **Baseline (DEC-105).** A different authorised person from the preparer also approves: every change to the structure, to a business-unit mapping and to an agreement version (GC2-2); every other party's bank-detail change, not only a supplier's (5.1, GC2-6); and the confirmation of a product proposal (4.2, DM-5). **Design choice.** Who holds that authority is a KDPS setting with no default (OPEN, V-01; KDPS Owner, Admin; stage 1 live use).
- A version waiting for approval shows Awaiting approval. The states of a master version are Awaiting approval, Scheduled, In force, Ended and Rejected ([design-language.md](../ui/design-language.md) section 7; DM-4, DEC-105). A Scheduled version withdrawn before its start through an approved change is never in force (product owner, 6 Oct 2026, RR-202; [code-house-rules.md](../platform/code-house-rules.md) 7.3); it shows Withdrawn, a state name the product owner approved the same day ([design-language.md](../ui/design-language.md) section 7).

### 2.4 Unknown and blank

- An attribute the source did not give is Unknown and stays distinct from zero, blank or any default (`PRD-MOD-015`, `PRD-MER-005`). A missing size is Unknown; Free Size is a size value (`PRD-MER-005`).
- In storage, an Unknown value is a null in a nullable column. A real value that means "none" is a vocabulary value or a structural rule, never a null. **Design choice.**
- No field in this document has a default value. A suggested value is never an active default (PRD "Required policy configuration").

### 2.5 Ownership in the database

- Each module owns one PostgreSQL schema: `organisation` and `merchandise`. Only that module's code reads or writes it (`PRD-MOD-002`). **Design choice.**
- A record that refers to another module's record keeps its identifier without a foreign key. The owning module checks the reference through the other module's interface when it writes. Masters are retired, never deleted, so a reference never dangles. **Design choice.**
- Every change writes an audit record in the same transaction (`PRD-ACS-013`), and an outbox event where module-map section 8 names one. Events for the masters it does not name yet, such as brands, parties, packs and vocabulary, are added there before their code emits them.

## 3. Organisation structure

Owner: `organisation`. The eight records of `PRD-ORG-001` are kept separate.

### 3.1 Records

| Record | Code unique in | Fixed at creation | Versioned fields | IDs |
| --- | --- | --- | --- | --- |
| Organisation | The directory of Organisations (DEC-093) | Its database | Name. Timezone and currencies are Organisation settings in `configuration` | `PRD-ORG-002`, `PRD-ORG-011`, `PRD-ACS-020` |
| Legal entity | The Organisation | — | Legal name; the statutory identifiers Accounts and the CA name, such as PAN (OPEN, 3.2) | `PRD-ORG-001`, PRD "Words used" |
| Tax registration | The Organisation | Its legal entity (`PRD-ORG-020`) | Registration number, kept as text; the State it is registered in; validity dates. Its verification (`POL-10.06`) is a separate linked record, apart from each mapping's (3.4). **Deferred** (product owner, 8 Oct 2026; RR-438): registrations are built without it in `S1-F02-T01`, and it arrives before any live statutory use of a registration (Accounts, CA) | `PRD-ORG-001`, `PRD-ORG-020` |
| Accounting book | The Organisation | Its legal entity (`PRD-ORG-020`) | Name. The ledger itself is in `finance` · books | `PRD-ORG-001`, `PRD-ORG-020`, `PRD-LED-002` |
| Site | The Organisation | — | Name, aliases, addresses, Area, physical kind, classifications, opening and closing dates, status | `PRD-ORG-003`, `PRD-ORG-007`–`PRD-ORG-010` |
| Store | The Organisation | — | Name, aliases, format, operating model, classifications, opening and closing dates, status, partner associations; its Site link (3.3), kept on each version (6.1) | `PRD-ORG-003`, `PRD-ORG-008`–`PRD-ORG-010`, `PRD-ORG-021` |
| Business unit | The Organisation | Its Site (3.3); its kind; its Store, for a Store's unit; the old unit it replaces, for a unit a relocation created (3.3, GC2-4) | Name; its mapping (3.4); its brand coverage, kept by `merchandise` (3.3) | `PRD-ORG-004`–`PRD-ORG-006` |
| Internal stock location | Its Site | Its Site and business unit (3.5) | Name, kind, parent location, active dates | `PRD-ORG-012` |
| Country, State, City, Area | Its parent level; Country in the Organisation | Its parent | Name | `PRD-ORG-007`, `PRD-ORG-011` |
| Grouping | The Organisation | Its kind: region, cluster or another configured kind | Name; members (3.6) | `PRD-ORG-007` |
| Default warehouse link | — | From a Store; to a warehouse unit | Dates (3.6). Other routes are OPEN (3.6) | `PRD-ORG-013` |

- The Organisation's own row lives in its database. The directory outside the Organisation databases holds only each Organisation's code and where its database is; it holds no users, sessions or business records (DEC-093, `PRD-ACS-020`). [deployment.md](../platform/deployment.md) section 4 places it.
- The physical kinds of a Site are those `PRD-ORG-010` names: head office, regional office, central warehouse, regional warehouse and retail site. A retail site is a Site where one or more Stores trade (PRD "Words used"; GC2-3, DEC-105).
- Store formats are MBO, EBO, shop-in-shop and kiosk. Operating models are company-owned, franchise-owned and franchise-owned company-operated (`PRD-ORG-010`).

### 3.2 Legal entities, registrations and books

- Each tax registration and each accounting book belongs to exactly one legal entity, fixed when it is created. A legal entity may hold several of each (`PRD-ORG-020`, DEC-095).
- Because the link is fixed, a registration or book that would need another legal entity is a new record, never a changed one.
- The CA is asked to confirm the rule for KDPS's registrations and books ([questions-for-kdps.md](../../questions-for-kdps.md), CA question 16). KDPS's real registrations are OPEN (V-18, `POL-10.06`; Accounts, CA; stage 2). Its real legal entities and books, and which statutory identifiers each entity carries, are OPEN too (Accounts, CA; stage 2, with the books' accounts in V-10).

### 3.3 Sites, Stores and business units

- **Several Stores at one Site.** Several Stores may trade at one Site at the same time (`PRD-ORG-021`).
- **The Store's Site link is dated.** A Store is at one Site on any date. The link is a versioned record, so it can move (`PRD-ORG-021`). On relocation the Store keeps its code, name and history, and the link moves to the new linked Site from the relocation date (`PRD-LIF-029`, `PRD-LIF-021`). Renaming never replaces a Site's identity (`PRD-LIF-021`).
- **Business-unit kinds.** A business unit is one of the four kinds the PRD names: whole-store, brand counter, warehouse or office (`PRD-ORG-004`, `PRD-ORG-006`). **Design choice:** no other kind until the PRD names one.
  - A whole-store unit and a brand-counter unit belong to one Store. A Store has exactly one whole-store unit at the Site it is linked to, for its trading outside any brand counter, and any number of brand-counter units there. A relocation leaves the old units at the old Site until they close (below). **Design choice** (`PRD-ORG-004`, `PRD-ORG-021`).
  - A brand counter inside the Organisation's own Store is a brand-counter unit of that Store. A Store of the shop-in-shop format is the Organisation's own Store trading inside another business's premises (`PRD-ORG-021`).
  - A Store's unit is created at the Site the Store is linked to on that date. **Design choice.**
  - A warehouse unit and an office unit sit at a Site and belong to no Store.
  - A business unit stays at the Site where it was created. **Design choice.** When a Store relocates, it gets new business units at its new Site, linked to its old ones, and stock moves between them by transfer (GC2-4, DEC-096, DEC-105). Each new unit carries a link to the old unit it replaces. An old unit closes under 3.7 once its outstanding items, stock included, are resolved (`PRD-LIF-019`). No relocation happens before stage 5, where the relocation flow is built (`PRD-LIF-029`).
- **Brand coverage.** A whole-store or warehouse unit may cover several brands; a brand-counter unit covers exactly one brand; an office unit operates without a brand (`PRD-ORG-006`). The coverage is a dated record kept by `merchandise`, which owns brands; it checks the unit's kind through `organisation`. **Design choice:** it follows the allowed call direction of module-map section 3.
- **Five independent facts.** Physical Site kind is on the Site. Store format and operating model are on the Store. Inventory ownership and settlement terms come from agreements (section 5) and, for partners, from partner agreements (stage 5); ownership is carried on each receipt origin by the stock ledger. None is inferred from another (`PRD-ORG-009`, `PRD-ORG-014`, `PRD-FRN-005`).

### 3.4 The business-unit mapping

- Each business unit maps explicitly to one legal entity, one tax registration and one accounting book. The mapping is never inferred from the Site (`PRD-ORG-005`, `POL-10.01`).
- A business unit is created with its first mapping version, and always has one in force after that (domain-model invariant 8). A new version ends the one before it (2.2).
- The mapping is refused unless the tax registration and the book both belong to the mapped legal entity (`PRD-ORG-020`).
- Two units at one Site may map differently. A transaction uses its own unit's mapping and stores the mapping version it used (`PRD-ORG-005`, `PRD-ACP-013`).
- A mapping version's verification is a separate, append-only record linked to it: who verified it, when, and the evidence (`POL-10.08`). The evidence is stored files attached through `files-imports` from the start (`S1-F06-T05`; product owner, 6 Oct 2026). The version itself is never edited (2.2). Verifying it is a separate permission, held by a different person from the one who made the mapping (GC2-2, DEC-105). A missing or unverified registration mapping blocks the affected live statutory action (`POL-10.08`). Readiness checks the mapping before an activity is granted (`PRD-LIF-002`).
- A unit's tax registration must be in the State of its Site. The mapping is refused unless the registration's State is the State of the unit's Site on the mapping's start date; the check compares them (GC2-1, DEC-105; the CA confirms it, question 16). A new Site Area version or registration State version that would put a mapping in force out of step is refused too, so the rule holds at all times (domain-model invariant 8). **Design choice.**
- **As built** (`S1-F02-T02`). **Design choice** throughout; no value is chosen.
  - **The verify permission** is create on its own record type, `organisation.business_unit_mapping_verification` (view, create), declared in the permission registry (access-and-approvals 4.1). No permission on the mapping or the unit gives it, so no new action is needed; who holds it is KDPS's (V-01). Verifying is a command of its own, never an approval: its route's Authorise checks the permission and holds it at step 0 (`organisation.verify-business-unit-mapping`), and the service refuses the person who prepared the mapping version (`organisation.verifier-made-mapping`), as the table's trigger does behind it.
  - **One verification per approved mapping version.** A version Awaiting approval is not verified (`organisation.mapping-not-approved`), and a second verification of a version is refused (`organisation.mapping-already-verified`). A new mapping version needs its own. A verification is never corrected or withdrawn: a wrong one is put right by a new mapping version, verified afresh (product owner, 8 Oct 2026). Accounts and the CA confirm this against `POL-10.08` (RR-442).
  - **Evidence** is one stored file or more, each handed in first through Store a file and attached to the verification through `files-imports` in the verification's transaction, as kind `business-unit-mapping-verification` with no restricted field class (imports-and-opening-data 11, 13.1). The verification keeps the attachments' identifiers; a reader opens a file through the verification's record type.
  - **A unit's first mapping** is a mapping version that names the unit version it was prepared with; Decide approves or rejects the two together, under the unit's lock, and the unit's history shows that mapping with the version, so its approver sees the facts the decision binds to (`PRD-ACS-007`). A later mapping version is a change of its own, with action type `organisation.business_unit_mapping.change` on record type `organisation.business_unit_mapping`, its record being the unit. A unit version that would be in force with no mapping is refused (`organisation.unit-without-mapping`), so a new unit's draft re-dated under 2.2 names its mapping again.
    - Deciding a unit version with the mapping prepared with it needs approve on both record types, `organisation.business_unit` and `organisation.business_unit_mapping`, each through an assignment in force (product owner, 8 Oct 2026); both assignments are locked at step 0. `access` asks the effect which other documents a decision decides with it (access-and-approvals 9.8b), so the approval panel and My work show the decision unavailable, naming the missing permission, until both are held.
    - Once a unit has an approved version, a unit version never names a mapping (product owner, 8 Oct 2026): its mapping changes only through a mapping version, under that action's permissions (`organisation.mapping-through-mapping-change`, when prepared and again under the decision's locks). A unit version naming some of the three mapping fields but not all is refused (`organisation.mapping-incomplete`), never read as naming none.
    - Every approved unit version starts on a day an approved mapping of the unit is in force, so no day of a unit is without one (`organisation.unit-without-mapping`, under the decision's locks); the database checks it at commit too.
  - **The State rule** is checked when the change is prepared, from the approved versions in force on its start, and again under the locks once the versions a decision moves have their final dates (`organisation.registration-in-another-state`; for a Site or registration version, `organisation.mapping-out-of-step`). The database holds it behind the service, with a check at commit on approved mappings, Site versions and registration versions, and keeps a unit's approved mappings without a gap from the first one's start.
  - **Read a unit's mapping as of a date** answers the unit's Site, Store and kind, the legal entity, registration and book, the mapping version's identifier and its verification, or `organisation.no-mapping-in-force`. It keeps the shape of the stock ledger's place read (stock-ledger 13.1 `unitAt`), which is wired to it with RR-436.

### 3.5 Internal stock locations

- A location is a floor, backstore, zone, rack, bin, fixture, display or alteration location (`PRD-ORG-012`). Zones, racks and bins may nest under a parent location. **Design choice.**
- Damage, holds and transit are stock and custody conditions, never a location or a Site (`PRD-ORG-012`).
- **Settles DM-9.** Each location belongs to one Site and to one business unit at that Site, fixed at creation. Two units never share a location, so a count of a location and its balances belong to one unit. A shared physical shelf is recorded as one location per unit. **Design choice.** A stock movement names its Site, business unit and location (stock-ledger 2.2); the location must belong to both.
- A location is retired, never deleted. Retiring asks the stock ledger through a contract whether stock is still recorded there; `organisation` does not read stock tables. **Design choice** (module-map section 3, rules 4 and 6).
- **As built** (`S1-F02-T02`). **Design choice.** A location's versions hold its name, kind, parent and whether it is retired; a new location is in use from its first version's start, and retiring is a later version from its start, so its active dates are from its first version to the start of the version that retires it. A parent is a location of the same business unit, and only a zone, rack or bin has one. The location-in-use contract is `organisation`'s, `hasStock(context, location) → yes or no` in the caller's transaction, provided to `organisation` by the composition root under `LOCATION_IN_USE`; `stock` · ledger answers it from its own rows: yes while a balance at the location holds units (stock-ledger 13.7). It is asked when a retirement is prepared and again when it is approved; while no implementation is provided, retiring is refused (`organisation.location-in-use-unanswered`), and while stock is recorded there, `organisation.location-holds-stock`.
  - **Nesting** (S1-F02-T02 review, 8 Oct 2026). On no day does a location nest under itself through any number of levels (`organisation.location-nesting-cycle`); a location is not retired while a location nested under it is not retired on a day both are in force (`organisation.location-has-children`); and a location does not nest under a parent retired on a day it is in force (`organisation.location-parent-retired`). Each is read from the approved versions over the days the version would have once approved: when prepared, to the start of the next approved version, and under the decision's locks, its final days. A decision on a location version locks its own row exclusively and its parent and every location the parent is nested under, shared, so two decisions that would together close a loop, or retire a parent while a child is nested under it, never pass each other. The database holds the three rules at commit behind the service.
  - **The retirement window** (S1-F02-T02 review, 8 Oct 2026). Whether stock is recorded is asked when a retirement is prepared and when it is approved, not on its start date, and the stock ledger does not yet read a location's state: a movement into the location after the approval, before or after the retirement's start, is not refused, and a receipt that commits while the approval runs is not seen by it. The window is accepted for now (product owner, 8 Oct 2026): the stock ledger reads no location in production yet (RR-436), so no live movement meets it. RR-443 closes it before stock is first posted into locations: the read answers a location as of the business date and the ledger refuses a movement into a retired one, and the ledger and the retirement serialise on a lock both take, in the order of code-house-rules 8.2.

### 3.6 Geography, groupings and routes

- Geography is Country, State, City, Area, Site (`PRD-ORG-007`). The countries are configured per Organisation (`PRD-ORG-011`). A Site's Area is a versioned field.
- A grouping is a region, a cluster or another configured kind (`PRD-ORG-007`). Its members are Stores, with dated membership. **Design choice:** offers apply by Store or group (`PRD-OFR-001`), and no PRD rule groups Sites without Stores.
- Each Store has a default warehouse for replenishment and returns: a dated link to a warehouse business unit, which names the Site too (`PRD-ORG-013`). **Design choice:** a unit, not a Site, because one warehouse Site may hold units of different legal entities.
- Other authorised routes (`PRD-ORG-013`) may join any two units the transfer kinds of `PRD-TRF-001` allow. Their shape and which routes KDPS authorises are OPEN (V-62; Operations; stage 3).
- Allowed destinations are listed by name and code only, without access to their operational data (`PRD-TRF-004`). The transfer rules that use them are stage 3.

### 3.7 Lifecycle

- A Site and a Store carry opening and closing dates and a status (`PRD-ORG-008`). The events are those of domain-model 3.1: created; each activity granted after readiness (`PRD-LIF-001`, `PRD-LIF-002`); closure started, which stops new operations (`PRD-LIF-017`); retired only when every outstanding item is resolved (`PRD-LIF-019`); reopened only with fresh readiness, mapping and access approval (`PRD-LIF-020`).
- Identity and history stay after closure (`PRD-LIF-020`). The states of a Site, Store and business unit are Setting up, Active, Closing and Closed (DM-4, DEC-105; [design-language.md](../ui/design-language.md) section 7).
- `organisation` answers the readiness checks for mappings and locations; `site-lifecycle` asks them (module-map 4.16).

### 3.8 Interface

The operations of module-map 4.11, made concrete:

| Operation | Returns or does | Refuses when |
| --- | --- | --- |
| Read the structure as of a date | Sites, Stores with their Site link, business units with their mapping version, locations, geography, groupings (`PRD-ORG-001`, `PRD-ORG-005`) | — |
| Answer readiness checks | For `site-lifecycle`: whether a unit's mapping is in force and verified, and whether its locations exist (`PRD-LIF-002`; 3.7) | — |
| Read a unit's mapping as of a date | Legal entity, tax registration, book, the mapping version identifier for the caller to store (`PRD-ACP-013`), and the mapping's verification. A caller about to take a live statutory action refuses it while the mapping is unverified (`POL-10.08`) | No mapping is in force on that date |
| Expand a place for access | The Stores and business units a Site or Store covers on a date (3.9), for `access` through the scope contract (module-map 4.11) | — |
| Check scope membership | Whether a legal entity, Site, Store or business unit exists and sits where an assignment says, for the scope contract of module-map section 3 | — |
| List allowed destinations | Names and codes only (`PRD-TRF-004`); the default warehouse and other routes (`PRD-ORG-013`) | — |
| Maintain the structure | New records and versions under 2.2 and 2.3, and a mapping's verification record (3.4) | A version would overlap another approved version (2.2); a version would start on a past date (2.2); a record a version names has no approved version in force on its start, when the version is approved (`organisation.reference-not-in-force`; 6.1); a unit would be left with no mapping; a registration or book belongs to another legal entity (`PRD-ORG-020`); a registration is in another State than the unit's Site (3.4, GC2-1); a location's unit is at another Site; a Store's unit would be at a Site the Store is not linked to; a kind rule in 3.3 is broken; a location to retire still has stock recorded (3.5); a change is approved by its preparer, or a mapping is verified by the person who made it or by someone without the verify permission (2.3, 3.4, GC2-2) |

Events: `organisation.structure-changed`, `organisation.mapping-changed` (module-map section 8).

**Check scope membership and Expand a place, as built** (`S1-F02-T03`; module-map section 3, rule 6). **Design choice** throughout; no value is chosen.

- They are `organisation`'s implementation of the scope contract `access` defines (`organisationScopeMembers`), handed to `access` by the composition root under `SCOPE_MEMBERS`; it answers the member types legal entity, Site, Store and business unit.
- **Check scope membership** answers, of the members an assignment names, those that do not exist as the master their type names, so a Store's identifier given as a Site is not where the assignment says, and those with no approved version in force on any day of the assignment's dates, so a record still awaiting approval, rejected, or ended before the assignment starts is refused too. `access` refuses such an assignment when it is saved (`access.scope-member-not-found`, naming each member; access-and-approvals 5.1).
- **Expand a place** answers, on a date, for a Site the Stores whose approved version in force links them to it and every business unit at it with an approved version in force, the Stores' units and the warehouse and office units alike; for a Store its business units in force; for a unit only itself (3.9; test 4). Authorise and row-level security never call it: a record carries its Site, Store and unit, so a grant matches by equality and SQL never expands the tree (access-and-approvals 7.2).
- The answers do not depend on what the caller's actor may see: these tables carry no row-level security (6.1).

### 3.9 The place tree for access

- A role assignment's places form one tree: a Site, the Stores linked to it on a date, and the business units of each Store; warehouse and office units hang directly under their Site (`PRD-ACS-021`, DEC-094).
- Its place scope is all members, selected members or empty (`PRD-ACS-005`). All members covers every Site, now and later. A selected member may be a Site, a Store or a business unit. Empty grants nothing.
- A selected Site covers every Store and business unit at it, including ones added later. A selected Store covers every business unit of it, including ones added later (`PRD-ACS-021`, DEC-098). A selected business unit covers only itself.
- From stage 5, when a Store can relocate: a Store-scoped assignment follows the Store, and a Site-scoped assignment covers the Stores linked to the Site on the record's business date. **Design choice.** The relocated Store's new business units sit at its new Site, and its old units stay at the old Site until they close (3.3; GC2-4, DEC-105). Until then an old unit is covered both by a selection of its own Site and by a selection of its Store, since a selected Site covers every unit at it and a selected Store every unit of it (`PRD-ACS-021`).
- Legal entity and brand stay separate scope dimensions (`PRD-ACS-001`, `POL-02.02`). Self-service uses a scope of the person's own records, through its own role (`PRD-ACS-021`, `PRD-ACS-022`, DEC-041, DEC-100); it is not a place.
- `organisation` builds and expands the tree; `access` decides. How a record without a Store, a brand or a business unit is matched, and how the tree reaches PostgreSQL scope controls, is in [access-and-approvals.md](../access/access-and-approvals.md) 5.3 and 7.2.

## 4. Merchandise catalogue

Owner: `merchandise` · catalogue. Merchandise tracking policy (`POL-04`).

### 4.1 Records

| Record | Code unique in | Fixed at creation | Versioned fields | IDs |
| --- | --- | --- | --- | --- |
| Brand | The Organisation | — | Name, aliases | `PRD-MER-001` |
| Category | The Organisation | — | Name, parent category, size set, the attributes that make up a SKU's identity, tracking profile (4.6) | `PRD-MER-002`, `PRD-ORG-011`, `POL-04.01` |
| Style | The Organisation | Brand, category | Brand article number; season, collection, launch date, gender, fabric, fit, HSN; each a value or Unknown | `PRD-MER-002`, `PRD-MER-004`, `PRD-MER-005` |
| SKU | The Organisation | Style; colour; size; any other identity attribute the category names | Stock unit (4.4) | `PRD-MER-002`, `POL-04.02`, `POL-04.03`, `POL-04.04` |
| Size set | The Organisation | Category | Ordered sizes | `PRD-MER-002` |
| Attribute and vocabulary value | Its attribute | — | Label | `PRD-MER-004`, `PRD-MER-013`, `PRD-IMP-008` |
| External code | Its code, kind and scope, per validity dates (4.3) | — | Validity dates; active or historical alias | `PRD-MER-006`, `PRD-MER-007` |
| Pack | The SKU | SKU | Its conversion to stock units, or its contents for a mixed pack | `PRD-MER-010`, `POL-04.03`, `POL-04.04` |
| Tracking profile | The Organisation | — | Piece-tracked or quantity; batch and expiry required; required identifiers; minimum remaining shelf life for receiving and for selling | `PRD-MER-010`, `PRD-MER-014`, `POL-04.01`, `POL-04.05` |
| Product proposal | — | — | Proposed style or SKU fields with the original source words | `PRD-MER-013` |

- A SKU of apparel or footwear is one style, colour and size (`PRD-MER-002`, `POL-04.02`). Other categories name their own identity attributes, as the Organisation configures product identity (`PRD-ORG-011`).
- At most one SKU exists per style and set of identity values (colour and size for apparel and footwear), and an Unknown value counts as one value here (PostgreSQL unique with nulls not distinct). So a SKU with Unknown size and the Free Size SKU of the same style and colour are two SKUs (`PRD-MER-005`). **Design choice.**
- A style's size-colour grid is the set of its SKUs; it needs no record of its own (`PRD-MER-002`). **Design choice.**
- A SKU's identity never changes. A wrong SKU is corrected by the flows that own its stock, never by editing it (`PRD-MOD-011`).
- Purchase cost, PT MRP, selling price, tax and discount are not catalogue fields. Each lives in its own record and each transaction keeps its own snapshot (`PRD-MER-009`). HSN is on the style; tax rules are in `finance` · tax rules, effective-dated (`POL-10.02`).
- The piece record belongs to the stock ledger (stock-ledger section 5). A supplier barcode names the SKU, never the piece (`PRD-MER-016`).

### 4.2 Vocabulary and proposals

- Every list-type merchandise attribute takes its values from an approved vocabulary, and which attributes exist is configured per Organisation (`PRD-ORG-011`; GC2-9, DEC-105). The Setup screen of [ui-blueprint.html](../ui/ui-blueprint.html) lists Season, Brand, Colour, Gender, Sub category, Type, Item, Fit and Size. Type and Item have no field in 4.1, and collection and fabric have no entry on that screen; the Organisation configures each as an attribute, with a vocabulary where it is list-type.
- On that screen, Brand edits the brand records, Size edits the size sets and Sub category edits the category tree of 4.1; the other attributes are vocabulary values. **Design choice.**
- A source word is turned into a vocabulary value, brand, size or category by a mapping rule. The mapping rule is a `files-imports` record with its own proposal and confirmation, and it refers to the value by its identifier; the original words are kept with the import (`PRD-IMP-003`, `PRD-IMP-008`; module-map 4.7). The vocabulary keeps only its approved values.
- A new value is a proposal until a different person confirms it. An unconfirmed proposal changes no operational data (`PRD-IMP-008`, `POL-02.07`).
- A product proposal is kept apart from the approved masters until confirmed or rejected. Unconfirmed identity cannot enter an official PT (`PRD-MER-013`). A product proposal is confirmed by a different person from its proposer (DM-5, DEC-105). Its states are Proposed, Confirmed and Rejected (DM-4, DEC-105).
- A new style or SKU enters the catalogue only by confirming a product proposal; Maintain changes the versioned fields of existing ones (`PRD-MER-013`). **Design choice.**
- A suggestion is offered for manual selection only; identity is never filled from an unaccepted guess (`PRD-IMP-009`).

### 4.3 External codes

- An external code is a supplier barcode, a supplier style code or another code a source uses, mapped to a SKU and to a unit: the stock unit or one of the SKU's packs (`PRD-MER-006`).
- It is kept as text, exactly as supplied, so leading zeros survive. Earlier codes stay as historical aliases (`PRD-MER-007`).
- Its scope is one supplier, one brand or the whole Organisation, with validity dates. **Design choice:** the PRD asks for a scope and does not name its kinds.
- Two scopes overlap when they name the same supplier or brand, or when either is the whole Organisation. A supplier scope and a brand scope are not compared when a mapping is saved; Resolve refuses a request that matches both with different targets. **Design choice.**
- Identical pieces may share one code; their piece IDs stay distinct (`PRD-MER-006`).
- **Ambiguity.** An active mapping is refused if, for the same code and kind, any date it covers is already covered in an overlapping scope with a different SKU or unit (`PRD-MER-007`). **Design choice** of enforcement: the database enforces the same-scope case with an exclusion constraint; the service checks the cross-scope case under a lock on the code. Resolve also refuses when more than one target matches, so an ambiguity the save check cannot see is never used.
- An internal barcode, printed when suitable identifiers are absent (`PRD-MER-008`), is kept in the same code table with kind internal, issued by the Organisation, so one lookup resolves every SKU-level code; piece IDs are resolved by the stock ledger. **Design choice.** Its format belongs to the label design (stage 2).

### 4.4 Units and packs

- Each SKU has one stock unit at a time: piece, pair or pack (`POL-04.03`). Quantities are whole numbers of that unit. **Design choice**, following `POL-04.03`.
- The stock unit is a versioned field, so its history is kept (`POL-04.04`). A SKU's stock unit cannot change while any stock of it is recorded; a change is refused until none is (GC2-5, DEC-105). `merchandise` asks the stock ledger through a contract whether stock is recorded; it does not read stock tables (module-map section 3, rules 4 and 6).
- Each purchasing and selling pack has an explicit conversion to stock units. A mixed size or colour pack is itemised by its contents, SKU by SKU (`POL-04.03`).
- A conversion change is a new version; past quantities keep the conversion they used (`POL-04.04`).
- A quantity always carries its unit. Quantities in different units are never added without a stated conversion (`PRD-MER-012`).

### 4.5 Batch and expiry

- A tracking profile that requires batch and expiry makes them part of the identity carried through receiving, movement, sale, return and count. A missing required value blocks the affected operation (`PRD-MER-011`, `POL-04.05`).
- Minimum remaining shelf life is set separately for receiving and for selling; goods that fail it are held (`POL-04.05`, `PRD-MER-012`). The categories and day limits are OPEN (V-05, `POL-04.08`; Booking, Operations; stage 1).

### 4.6 Tracking profiles

- A tracking profile is set per category, with dated versions (`POL-04.01`, `PRD-MER-014`). Goods outside a piece-tracked profile are held as quantity per SKU and unit (`PRD-MER-014`).
- Which profiles KDPS uses is configuration, not a default: apparel and footwear use piece IDs for KDPS, and any other category needs an explicit selection (`POL-04.09`). Further piece-tracked categories are OPEN (V-06; Booking, Operations; stage 2).
- A change from quantity to piece-tracked is recorded as requested. It takes effect at each Site only when the labelling count there is complete, and piece rules start from that count (`PRD-MER-018`, DEC-054). The labelling count belongs to stage 2 ([phases.md](../../phases.md)); it calls `merchandise` to record the change in force at its Site. The change is refused while stock exists at a Site and no labelling count is planned there (module-map 4.12). `merchandise` asks the stock ledger through a contract whether that stock exists; it does not read stock tables (module-map section 3, rules 4 and 6).
- At a Store still on its earlier POS, piece rules start at its switch count (`PRD-MER-017`).

### 4.7 Interface

The operations of module-map 4.12, made concrete:

| Operation | Returns or does | Refuses when |
| --- | --- | --- |
| Resolve a code | The SKU and unit, given the code, its kind, a supplier or brand where known, and a date (`PRD-MER-006`) | More than one target matches (`PRD-MER-007`); none matches |
| Read a SKU as of a date | Identity, stock unit, packs, tracking profile in force at a Site, HSN and attributes, with the version identifiers to store (`PRD-MER-002`, `PRD-MER-004`, `PRD-MER-014`) | — |
| Propose; confirm or reject | Product and vocabulary proposals (4.2) | A confirmer is the proposer (`PRD-IMP-008`; for a product proposal, DM-5, DEC-105) |
| Maintain masters | New records and versions under 2.2 and 2.3, including a business unit's brand coverage | A rule of 4.1 to 4.6 is broken; a SKU's stock unit changes while stock of it is recorded (4.4, GC2-5); a brand-coverage rule of 3.3 is broken (`PRD-ORG-006`) |
| Change a tracking profile | 4.6 | Stock exists at a Site and no labelling count is planned there (`PRD-MER-018`) |

Events: `merchandise.product-confirmed`, `merchandise.code-mapping-changed`, `merchandise.tracking-profile-changed` (module-map section 8).

## 5. Parties and agreements

Owner: `merchandise` · parties. Commercial ownership policy (`POL-01`).

### 5.1 Parties

- A party is a company or person the Organisation deals with on the supply side. Its code is unique in the Organisation.
- A party holds one or more roles: supplier, agent, ordering party, invoicing party, goods mover. Each role is its own dated record, so each is maintained independently (`PRD-MER-001`). **Design choice:** one party record per legal person, with roles, rather than one record per role.
- A brand is not a party. Brands and suppliers are kept apart (`PRD-MER-001`).
- Versioned fields: legal name; tax identity numbers, kept as text; MSME classification, verified against evidence before any payment control uses it (`POL-10.09`); each supplier's classification is OPEN (V-61; Accounts, CA; stage 5); contacts.
- **Bank details** of any party are restricted fields (`PRD-ACS-008`), encrypted at rest and kept out of logs and unauthorised caches (`PRD-SEC-006`). A change is a new version. A supplier's change takes effect only after approval by a different authorised person (`POL-02.07`). Every other party's bank-detail change needs the same approval, not only a supplier's (GC2-6, DEC-105).
- Customers, partners and employees are not parties here. Records stay separate in each module. An optional link by tax identity shows one legal person's records together; payables and receivables are never netted automatically (DM-7, DEC-105).

### 5.2 Agreements

- An agreement holds the commercial terms with a brand or a supplier. Its code is unique in the Organisation. Its versions are effective-dated and may be revised later (`PRD-ORG-016`, `POL-01.03`).
- A version holds these terms, each a value or Unknown, none defaulted (`POL-01.11`):

| Term | Values | IDs |
| --- | --- | --- |
| Commercial model | Outright, sale-or-return, consignment | `POL-01.01` |
| Default model for new bookings of the brand | One of the above | `POL-01.02` |
| Ownership-transfer event | Supplier dispatch; receipt and acceptance; sale to the customer; or another explicitly agreed event, described | `POL-01.05`, `POL-01.06` |
| Return rights | Whether unsold goods may go back; the window in days or a fixed season-end date; whether it starts at dispatch, receipt or acceptance | `POL-01.08`, `POL-01.09` |
| Return conditions | Eligible condition tags; packaging and quantity limits; supplier approval; freight and deductions; settlement by credit note, replacement or refund | `POL-01.10` |
| Money terms | Margins, commissions, payment terms, credit-note terms, brand-funded promotion terms | `PRD-ORG-016`, `POL-01.14` |

- Margins are restricted fields (`PRD-ACS-008`).
- The signed agreement is attached as evidence through `files-imports`, as stored files from the start (`S1-F06-T05`; product owner, 6 Oct 2026).
- A booking inherits the terms in force and may override them; that record belongs to `booking` (`POL-01.02`, `POL-01.04`, `POL-01.08`; stage 2). The costing profile shown on the Agreement screen belongs to `merchandise` · PT (policy 3; stage 2).
- Each brand's real model and terms are OPEN (V-14; KDPS Owner, Accounts; stage 2).

### 5.3 What an agreement never decides alone

- The outright or sale-or-return label alone decides neither legal title, valuation nor accounting recognition (`PRD-ORG-014`, `POL-01.06`).
- The configured ownership event does not assign ownership by itself or override the governing agreement (`POL-01.06`).
- Return rights are separate from ownership transfer, and PT approval does not by itself change legal ownership (`POL-01.07`).
- Defective or wrongly supplied goods follow the claims process, even under outright purchase (`POL-01.11`).

### 5.4 Inbound ownership

- Inbound ownership records are delivered in stage 2 (DEC-086) and are not designed here. Their home is `receiving` (module-map MM-7, DEC-105). They are not stock (`PRD-ORG-017`).

### 5.5 Interface

| Operation | Returns or does | Refuses when |
| --- | --- | --- |
| Read a party | The party, its roles in force and, only for a permitted reader, its bank details (`PRD-ACS-008`) | — |
| Read the terms in force | The agreement version in force for a brand or supplier on a date, with its identifier (`PRD-ORG-016`) | No version is in force |
| Maintain a party or agreement | New records and versions under 2.2 and 2.3 | A version would overlap another approved version (`PRD-MOD-010`; 2.2); an agreement version is approved by its preparer (2.3, GC2-2) |
| Change bank details | A new version; it waits for approval by a different authorised person: a supplier's under `POL-02.07`, every other party's under the baseline (GC2-6, DEC-105) | A change is approved by its preparer |

Event: `merchandise.agreement-changed` (module-map section 8).

## 6. Tables

Names, keys and constraints. Every table has a UUIDv7 primary key. A table marked "+ versions" has a companion table of versions under 2.2, with a date range and an exclusion constraint on approved versions. **Design choice** throughout; columns beyond these are left to reviewed migrations.

### 6.1 Schema `organisation`

| Table | Unique | Other constraints |
| --- | --- | --- |
| `organisation` + versions | — | one row |
| `legal_entity` + versions | code | — |
| `tax_registration` + versions | code | legal entity fixed; its verification record is deferred (3.1; RR-438) |
| `accounting_book` + versions | code | legal entity fixed |
| `site` + versions, `site_alias` | code | — |
| `store` + versions, `store_alias` | code | each version holds the Store's Site link, `site_id`: one link in force per Store on any date, held by the versions' exclusion constraint; a later link is a later version, Scheduled until its date (3.3). **Design choice** as built (`S1-F02-T01`): the dated link `store_site` is this column, not a table of its own. Its cost: a Site-link change and a change to any other Store field share one version line, so a link change is a whole new Store version and a later field change is prepared on top of it; the stage 5 relocation flow meets this when it moves a Store (3.3) |
| `business_unit` + versions | code | Site, kind and Store fixed; Store set for whole-store and brand-counter, empty otherwise; one whole-store unit per Store at the Store's linked Site; a Store's unit created at the Store's linked Site, checked by a trigger; a unit created by a relocation names the old unit of the same Store that it replaces, fixed at creation (3.3, GC2-4) |
| `business_unit_mapping` (dated) | — | no gap and no overlap per unit; every approved unit version starts on a day a mapping is in force, checked at commit (3.4); registration and book belong to the mapped legal entity, and the registration's State is the State of the unit's Site (GC2-1), checked by a trigger on the mapping and on new Site Area and registration State versions |
| `business_unit_mapping_verification` (append-only) | — | linked to one mapping version; the verifier is not the person who made the mapping, checked by a trigger; the verify permission is checked by the service (GC2-2) |
| `location` + versions | Site and code | Site and business unit fixed; the unit is at the location's Site; a parent of the same unit; no nesting loop on any day, no retired location with a child not retired, and no child of a retired parent, checked at commit (3.5) |
| `country`, `state`, `city`, `area` + versions | parent and code | — |
| `grouping` + versions, `grouping_member` | code | members are Stores; each member row belongs to one grouping version, frozen with it, so membership is dated by the version that lists it (3.6) |
| `store_default_warehouse` (dated) | — | the target is a warehouse unit; one in force per Store. Other routes wait for V-62 |

**Classes and the rows a version freezes, as built** (`S1-F02-T01`; code-house-rules 3.2, 6.1, 7.3). **Design choice** throughout; none sets a business value.

- **Every table built so far is `unscoped`**: geography, legal entities, tax registrations, books, Sites, Stores and groupings, with their versions, aliases and members, and business units, mappings and their verifications, locations and default warehouses (`S1-F02-T01`, `S1-F02-T02`). Geography, legal entities, tax registrations, books and groupings belong to the Organisation as a whole: their record types declare no scope fact, and the permission on the record type decides (access-and-approvals 5.3, 7.1).
- **Place-scoped records, as built** (`S1-F02-T03`; product owner, 8 Oct 2026). **Design choice** of which facts each declares; none sets a business value. Each of these record types declares place, and no legal entity or brand: a unit's legal entity is its mapping's, never the Site's (`POL-10.01`), and a record's facts are matched by equality (access-and-approvals 5.3, 7.2).

  | Record type | Place facts it carries |
  | --- | --- |
  | `organisation.site` | the Site itself |
  | `organisation.store` | the Store itself, and the Site it is linked to on the day authorised: by its approved version in force, or, for a Store with none in force that day (a new or Scheduled one), by its first version |
  | `organisation.store_default_warehouse` | the Store's, as above; the warehouse unit it names is a destination, shown by name and code only (`PRD-TRF-004`) |
  | `organisation.business_unit`, `organisation.business_unit_mapping`, `organisation.business_unit_mapping_verification` | the unit, its Site, and its Store where it has one, all fixed at creation (3.3) |
  | `organisation.location` | its unit's facts: the unit, the unit's Site and Store |

  - **Authorised by them.** Their routes authorise in the command, with the record's facts on the day (access-and-approvals 7.1 step 3; RR-296): a one-record read, a new version, a verification; a list and the master lists authorise each row and leave out the rows the reader's scope does not cover, so a page may hold fewer records than its limit while its cursor moves on past them (code-house-rules 12.1). A new record is authorised with the facts its draft names: a new Site names no place yet, so only all-members place scope may prepare one; a new Store its Site; a new unit its Site and Store; a new location its unit's facts. So a selected Site covers the Stores and units prepared at it later, and a selected Store the units added to it later (3.9; `PRD-ACS-021`). A refusal names the place by type, identifier and code (`PRD-UXP-003`).
  - **Carried with them.** Each audit record of these records keeps their facts, so their history is read only within a scope that covers them (numbering-and-audit 4.5); each approval request keeps them, so only an approver whose assignment covers them decides (access-and-approvals 9.1, 9.3; RR-435); a verification's evidence is attached with the unit's facts (imports-and-opening-data 11). Audit records written before `S1-F02-T03` carry none, so only all-members scope reads them (RR-445).
  - **Why the tables stay `unscoped`.** Row-level security on them would hide from a place-scoped actor the rows `organisation`'s own rules must read across places (a Store's Site in force, the State rule of 3.4, location nesting, a reference in force), and the rows the scope contract answers from (3.8). The reader's scope is enforced by Authorise on every route and each list row instead, as code-house-rules 6.1 allows an `unscoped` table; every read of these tables is `organisation`'s own (`PRD-MOD-002`). **Design choice.**
- **Business units, mappings, locations and default warehouses, as built** (`S1-F02-T02`; migration `0029`). A unit and a location are identity rows plus versions, locked as above. A mapping's identity row is its unit's and a default warehouse's is its Store's: each is a table of dated version rows (`business_unit_mapping`, `store_default_warehouse`) under the same guard, and a decision on one locks the unit's or the Store's row. A decision on a Store's unit also locks the Store's row, so two whole-store units of one Store are never approved at once. A location names its unit and Site in one foreign key to the unit's (identifier, Site), so its unit is always at its Site. A unit created by a relocation, naming the unit it replaces (GC2-4), gets its column with the stage 5 relocation flow. The triggers behind the service raise SQLSTATE `AO006`.
- An identity row is append-only and `locked`: a decision locks it exclusively at step 1, so two decisions on versions of one master never pass each other (code-house-rules 8.2); every version of the master changes only under that lock. Aliases and grouping members are append-only rows of their version, written when it is prepared; a trigger refuses one for a version already decided. A version Awaiting approval is frozen too: its guard admits only its decision, recorded once (code-house-rules 7.3).
- Two preparations of one code at once: the second meets the code's unique constraint and is refused `organisation.code-taken`, never failed (2.1).
- A version row keeps the user who prepared it, `prepared_by_user_id`, in place of change rows: a version is prepared whole by one person and frozen when prepared, since a separate draft is not built (access-and-approvals 9.5; RR-292). That person is its one preparer (9.1; GC3-1).
- A version is prepared open-ended from its start. Approving it ends the approved version in force or Scheduled at its start on that day; where an approved version starts after it, the approved version ends where that one starts, recorded with its decision (2.2; product owner, 8 Oct 2026). Approving is refused while another approved version, a Scheduled one included, starts on the same date (`organisation.version-overlaps`), or when its start has passed (`organisation.starts-in-past`; GC2-7; re-dating in 2.2). It is refused too while a record it names (a State's country, a City's State, an Area's City, a registration's legal entity and State, a book's legal entity, a Site's Area, a Store's Site, a grouping's Stores) has no approved version in force on its start (`organisation.reference-not-in-force`); once in force, such a record stays in force, since an approved version ends only where the next starts and none is withdrawn yet.
- The status of a Site or Store is not prepared: a new one starts Setting up (3.7), and a later version keeps the status of the latest approved one, since the lifecycle events that change it are `site-lifecycle`'s (module-map 4.16). Opening and closing dates are Unknown until given (2.4); a Site's addresses are a list, in the order given.
- **Reads, as built.** Each master's records are listed a page at a time by cursor, in code order then identifier, at most 100 a page, a technical cap the builders set (`MASTER_PAGE_CAP`; code-house-rules 12.1), and one record is read on its own with every version. Read the structure as of a date reads only the versions in force on it. The master lists need no permission of their own: they show each master whose record type the reader may view and name the others (product owner, 8 Oct 2026; module-map section 3, rule 5).
- Not built yet: withdrawing a Scheduled version of these masters (RR-202; code-house-rules 7.3), so none can be withdrawn and the guard admits only moving an end earlier (RR-439); classifications of a Site or Store, a grouping kind other than region and cluster, and the Organisation's own row, until the product owner names them (RR-440); a Store's partner associations, which arrive with `partners` in stage 5 (RR-441).

### 6.2 Schema `merchandise`

| Table | Unique | Other constraints |
| --- | --- | --- |
| `brand` + versions, `brand_alias` | code | — |
| `category` + versions, `category_tracking_profile` (dated) | code | — |
| `style` + versions | code | brand and category fixed |
| `sku` + versions | code; style and identity values with nulls not distinct | identity fixed; stock unit versioned, and a new unit version is refused while stock of the SKU is recorded, asked of the stock ledger through its contract (4.4, GC2-5) |
| `size_set` + versions, `size_set_member` | code | category fixed |
| `attribute`, `vocabulary_value` + versions | attribute and code | attributes are configured per Organisation; a list-type attribute takes only its approved vocabulary values (GC2-9) |
| `vocabulary_proposal`, `product_proposal` | — | confirmer differs from proposer, for vocabulary (`PRD-IMP-008`) and for product proposals (DM-5) |
| `external_code` | — | exclusion: same code, kind and scope, overlapping dates, different target |
| `pack` + versions, `pack_content` | SKU and code | contents only for a mixed pack |
| `tracking_profile` + versions, `tracking_profile_site_change` | code | — |
| `business_unit_brand` (dated) | — | brand-counter unit: exactly one brand in force; office unit: none |
| `party` + versions, `party_role` (dated) | code | — |
| `party_bank_details` (versions) | — | encrypted; every party's version is in force only with an approval by a different person (`POL-02.07` for a supplier; GC2-6 for every other party) |
| `agreement` + versions, `agreement_attachment` | code | — |

## 7. Master imports

- `organisation` and `merchandise` register import handlers with `files-imports` for create and update imports of their masters (`PRD-IMP-010`; module-map 4.7).
- A published row goes through the same Maintain operation as a person's change, so the same checks and approvals apply (module-map section 3, rule 8).
- New products arrive as product proposals (4.2, `PRD-MER-013`) and source words for vocabulary as proposals (`PRD-IMP-008`). Identity is never filled from an unaccepted guess (`PRD-IMP-009`).
- Brand PT files are stage 2 (`merchandise` · PT). Opening-data layouts are GC-6.

## 8. Screens

- The Setup section of [ui-blueprint.html](../ui/ui-blueprint.html) holds these screens: Organisation structure; Geography and groupings; Products; Suppliers and agreements; Agreement; Merchandise tracking profiles; Vocabularies.
- GC-2 adds three things to them:
  - The mapping of a business unit shows its legal entity, tax registration and book together, and a mismatch is refused with its reason (`PRD-ORG-020`). A registration in another State than the unit's Site is refused with its reason too (3.4, GC2-1).
  - Each master shows its version history and the version in force on a chosen date.
  - A change whose start falls before an approved Scheduled version of the record warns its preparer that it ends where that version starts and is not carried into it; a draft whose start has passed offers Re-date (2.2; product owner, 8 Oct 2026).
  - Restricted fields are masked or left out by field permission (`PRD-ACS-008`). An unavailable action names what is missing (`PRD-UXP-003`).
- **As built** (`S1-F02-T02`). Setup › Organisation structure gains the tabs Business units, Mappings, Locations and Default warehouses. A new unit's form names its legal entity, registration and book with it. Each mapping version shows its verification, with when it was made and the name of each evidence file, or, while it has none, Verify mapping, which stores the chosen file and verifies with it; a refusal names its reason. The master lists show each unit, location and mapping in force, a mapping with its verification state. The Accounts persona's menu gains Setup › Organisation structure, where it verifies mappings (`POL-10.08`): the synthetic journey's choice, since who holds the verify permission is KDPS's (V-01). Its menu holds no My work entry, as the blueprint lists none; My work needs no permission and is open to every person.

## 9. Tests on synthetic data

All data is labelled synthetic and never becomes a default (`AGENTS.md`: "Never invent a value"). Tests run against real PostgreSQL. As built (`S1-F02-T02`), test 1's synthetic transaction is the test-only `test_mapping.synthetic_transaction`, made by its test in its own database copy (code-house-rules 11.4, as built).

| # | Test | IDs |
| --- | --- | --- |
| 1 | **Stage 1 exit check.** One Site with two business units mapped to different books and tax registrations. A synthetic transaction on each stores its own unit's mapping version; a later mapping change leaves the stored versions unchanged | `PRD-ACP-013`, `PRD-ORG-005` |
| 2 | A mapping whose registration or book belongs to another legal entity is refused | `PRD-ORG-020` |
| 3 | Overlapping approved versions are refused, a Scheduled one included; a unit can never be left without a mapping | `PRD-MOD-010`, `PRD-ORG-005` |
| 4 | Two Stores at one Site; one has a Scheduled (future-dated) Store–Site link version to another Site; reads before and after its start date; a Site-scoped and a Store-scoped place expand as section 3.9 says. Stage 1 proves it with that link version only; the relocation flow stays in stage 5 with test 17 (product owner, 6 Oct 2026, DEC-116). As built, the place-expansion part is `scope-by-place.int.test.ts` (`S1-F02-T03`) | `PRD-ORG-021`, `PRD-LIF-029`, `PRD-ACS-021` |
| 5 | Brand coverage by unit kind | `PRD-ORG-006` |
| 6 | A location whose unit is at another Site is refused (3.5, DM-9) | `PRD-ORG-012` |
| 7 | External codes: leading zeros kept; a conflicting active mapping is refused; identical pieces share one; Resolve refuses an ambiguity across scopes | `PRD-MER-006`, `PRD-MER-007` |
| 8 | A SKU with Unknown size and the Free Size SKU are different | `PRD-MER-005` |
| 9 | A pack conversion change leaves past quantities as they were | `POL-04.04` |
| 10 | A change to piece-tracked takes effect only at a Site whose labelling count is complete | `PRD-MER-018` |
| 11 | A vocabulary value confirmed by its proposer is refused | `PRD-IMP-008` |
| 12 | A supplier's bank-detail change approved by its preparer is refused; bank details are hidden without the field permission | `POL-02.07`, `PRD-ACS-008` |
| 13 | Agreement terms left Unknown stay Unknown | `POL-01.11`, `PRD-MOD-015` |
| 14 | Two Organisations: nothing of one is visible from the other | `PRD-ORG-002`, `PRD-ACS-020` |
| 15 | A mapping whose tax registration is in another State than the unit's Site is refused; one in the same State is accepted (3.4, GC2-1) | `PRD-ORG-005`, `POL-10.06` |
| 16 | A change to the structure, to a mapping or to an agreement version, approved by its preparer, is refused. A mapping verified by the person who made it, or by someone without the verify permission, is refused (2.3, 3.4, GC2-2) | `PRD-ACS-006`, `POL-02.08`, `POL-10.08` |
| 17 | A Store relocates: new business units are created at the new Site, each linked to the old unit it replaces; the old units stay at the old Site; stock moves from the old units to the new ones by transfer; an old unit closes only when its stock and other items are resolved (3.3, GC2-4; stage 5) | `PRD-LIF-029`, `PRD-LIF-021`, `PRD-LIF-019` |
| 18 | A SKU's stock unit change is refused while stock of it is recorded, and accepted as a new version when none is (4.4, GC2-5) | `POL-04.03`, `POL-04.04` |
| 19 | A master version that starts on a past date is refused, with no exception (2.2, GC2-7) | `PRD-MOD-010` |
| 20 | A product proposal confirmed by its proposer is refused (4.2, DM-5). A value for a list-type attribute that is not an approved vocabulary value is refused (GC2-9) | `PRD-MER-013`, `PRD-IMP-008` |
| 21 | A non-supplier party's bank-detail change approved by its preparer is refused (5.1, GC2-6) | `PRD-ACS-008`, `PRD-ACS-006` |

## 10. Open questions

Nothing below has a default. Each question carries its baseline pick (DEC-105); the "Who decides" column of such a row names who confirms the pick or asks for a change. Questions kept in other documents are pointed to, not repeated: state names (DM-4), product-proposal independence (DM-5), one legal person in several roles (DM-7), readiness approver (MM-8) and inbound ownership's home (MM-7), each with its baseline pick (DEC-105); and KDPS's values V-05, V-06, V-14, V-18, V-61 and V-62, which stay open.

| # | Question | Kind | Who decides | Blocks | Impact |
| --- | --- | --- | --- | --- | --- |
| GC2-1 | Baseline (DEC-105): a business unit's tax registration must be in the State of its Site; the mapping check compares them | Business, statutory | CA (question 16) | — | — |
| GC2-2 | Baseline (DEC-105): changes to the structure, to business-unit mappings and to agreement versions need approval by a different authorised person; verifying a mapping is a separate permission, held by a different person from the one who made the mapping | Business | KDPS Owner, Admin; Accounts, CA | — | — |
| GC2-3 | Baseline (DEC-105): the Site kind where Stores trade is a retail site (new "Words used" row; `PRD-ORG-010`) | Business (vocabulary) | — | — | — |
| GC2-4 | Baseline (DEC-105): a relocating Store gets new business units at its new Site, linked to its old ones; stock moves between them by transfer | Business | — | — | — |
| GC2-5 | Baseline (DEC-105): a SKU's stock unit cannot change while any stock of it is recorded | Business | Booking, Operations | — | — |
| GC2-6 | Baseline (DEC-105): every party's bank-detail change needs approval by a different authorised person, not only a supplier's | Business | KDPS Owner, Admin | — | — |
| GC2-7 | Baseline (DEC-105): no master version ever starts on a past date | Business | — | — | — |
| GC2-8 | Settled: a selected Store covers every business unit of it, including ones added later (`PRD-ACS-021`, DEC-098) | — | — | — | — |
| GC2-9 | Baseline (DEC-105): every list-type merchandise attribute carries an approved vocabulary; which attributes exist is configured per Organisation (`PRD-ORG-011`) | Business | Booking | — | — |

**Settled here:** DM-9 (section 3.5). **Settled since:** GC2-8 (DEC-098). **Baseline (DEC-105):** GC2-1 to GC2-7 and GC2-9, for the person named to confirm or change.
