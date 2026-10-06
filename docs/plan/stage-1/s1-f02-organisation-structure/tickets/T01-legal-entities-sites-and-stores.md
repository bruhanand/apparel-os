# S1-F02-T01 — Legal entities, Sites and Stores

Status: blocked
Blocked by: S1-F01-T13, S1-F01-T16
Feature: [S1-F02 Organisation structure and verified mappings](../../spec.md)

## Build

The `organisation` module with its first migration: every record a business unit's mapping will name, and the places a unit will sit in ([structure-and-masters.md](../../../../design/masters/structure-and-masters.md) 2, 3.1 to 3.3, 3.6, 3.7, 6.1, 8; [module-map.md](../../../../design/architecture/module-map.md) 4.11). Business units, their mappings and locations follow in S1-F02-T02, because a unit is created with its first mapping version (3.4; domain-model invariant 8). Every record is an identity row plus versions under 2.2 and house rules 7.3: approved versions never overlap, Scheduled ones included; no version starts on a past date (GC2-7, `DEC-105`); a version in force is never edited; a Scheduled version is withdrawn only through an approved change (RR-202).

- **Geography** (3.6; `PRD-ORG-007`, `PRD-ORG-011`): Country, State, City and Area, each fixed to its parent, with countries configured per Organisation.
- **Legal entities, tax registrations and accounting books** (3.2; `PRD-ORG-001`, `PRD-ORG-020`): a legal entity with its legal name; a registration and a book each fixed to one legal entity at creation; a registration's number kept as text, with its State and validity dates (`POL-10.06`). A registration or book that would need another legal entity is a new record.
- **Sites** (3.1, 3.3; `PRD-ORG-003`, `PRD-ORG-008` to `PRD-ORG-010`): permanent code, physical kind (the five of `PRD-ORG-010`), addresses, aliases, Area as a versioned field, opening and closing dates. A new Site starts in Setting up (3.7).
- **Stores** (3.1, 3.3; `PRD-ORG-021`): format, operating model, aliases and dates, and the dated Store–Site link, one link in force per Store, several Stores allowed at one Site. A new Store starts in Setting up.
- **Groupings** (3.6; `PRD-ORG-007`): region, cluster or another configured kind, with dated Store membership.
- **Codes** (2.1): typed by the Organisation, unique in their scope, kept as text and compared exactly, never changed or reused.
- **Maintain** (2.3; module-map 6.2 flow A): a draft version, Request approval, a decision by a different authorised person (GC2-2, `DEC-105`; `PRD-ACS-006`), then the version takes effect with its audit record and `organisation.structure-changed` in one transaction. Each action type has its approval rule, with independence fixed in code ([access-and-approvals.md](../../../../design/access/access-and-approvals.md) 8); its configured parts have no default. The record types, actions and the scope facts each record carries are declared in the permission registry (access-and-approvals 4.1, 5.3).
- **Read the structure as of a date** for these records (3.8), and the **master lists** read model with its as-of time (module-map 4.11; [phases.md](../../../../phases.md) stage 1 reports).
- **Screens** (structure-and-masters 8; ui-blueprint Setup › Organisation structure: legal entities, registrations, books, Sites, Stores; Setup › Geography and groupings): lists and editors; each master's version history and the version in force on a chosen date; approval from My work; refusals that name what is missing (`PRD-UXP-003`).

## Expected outputs

`organisation` module with its `index.ts`; first `organisation` migration with its `tables.json` entries; schemas and routes; the two screens; the master lists read model; tests

## Done when

- structure-and-masters 9 test 14 passes for these records, and test 16 for a change to any of them approved by its preparer
- structure-and-masters 9 test 4, its dated-link part, with a Scheduled (future-dated) Store–Site link version only: two Stores at one Site, and reads of a Store's Site link before and after that version's date. Its place-expansion part passes in S1-F02-T03
- A registration or book cannot move to another legal entity; a version starting on a past date, or overlapping another approved version (a Scheduled one included), is refused
- Browser journey: an Admin prepares a synthetic Site and a Store at it; a different authorised person approves each from My work; both show in Setting up, with their version history, and in the master list with its as-of time

## Notes

- This ticket takes the legal records and places, and S1-F02-T02 the business units, because a unit cannot exist without a mapping to a legal entity, registration and book, and the mapping checks the State of the unit's Site (structure-and-masters 3.4, GC2-1).
- Test 4 is proved in stage 1 with a Scheduled (future-dated) Store–Site link version only; the relocation flow (structure-and-masters 3.3) stays in stage 5 with test 17 (product owner, 6 Oct 2026, DEC-116).
- Which statutory identifiers a legal entity carries is OPEN (PAN is only an example; Accounts, CA; stage 2; structure-and-masters 3.2). KDPS's real legal entities, registrations (V-18, RR-081) and books stay OPEN; tests use labelled synthetic ones.
- structure-and-masters 3.1 names a registration verification record (`POL-10.06`) that section 6.1 gives no table. Ask before building it.
- structure-and-masters does not say which `organisation` tables are `scoped` (house rules 6.1); write it into section 6.1 with the code.
- Live use: RR-178 (second-person approval of structure changes confirmed); who holds that authority is KDPS's (V-01, RR-064).
