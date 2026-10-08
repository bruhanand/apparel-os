# S1-F02-T03 — Scope by place

Status: blocked
Blocked by: S1-F02-T02 (done), S1-F01-T11 (done)
Feature: [S1-F02 Organisation structure and verified mappings](../../spec.md)

## Build

Role assignments can select legal entities, Sites, Stores and business units, through the scope contract that `access` defines and `organisation` implements ([module-map.md](../../../../design/architecture/module-map.md) section 3, rule 6; [access-and-approvals.md](../../../../design/access/access-and-approvals.md) 5, 7; [structure-and-masters.md](../../../../design/masters/structure-and-masters.md) 3.8, 3.9). Until now assignments used all members or empty scope only (S1-F01).

- **The contract, `organisation` side** (structure-and-masters 3.8): Check scope membership, whether a legal entity, Site, Store or business unit exists and sits where the assignment says; Expand a place for access, the Stores and units a Site or Store covers on a date (3.9).
- **The contract, `access` side** (5.1): selected members kept in `assignment_scope_member` (access-and-approvals 13.1) and checked through the contract when an assignment is saved; the canonical scope key of S1-F01-T11 includes them (house rules 7.3, CH-7).
- **The place tree** (5.2; `PRD-ACS-021`, `DEC-094`, `DEC-098`): a selected Site covers every Store and unit at it, including ones added later; a selected Store covers every unit of it, including ones added later; a selected unit covers only itself; all members covers future members; an empty dimension grants nothing (`PRD-ACS-005`).
- **Authorise** (5.3, 7.1): matches the Site, Store, unit and legal entity facts a record carries, one assignment per action (`PRD-ACS-004`); an Unknown fact is covered only by all members; the legal entity comes from the unit's mapping version, never from the Site (`POL-10.01`). A refusal names the place or legal entity missing (`PRD-UXP-003`).
- **Effective grants and row-level security** (7.2; house rules 6.2): grants carry place and legal-entity identifiers, matched by equality against each row's facts, so SQL never expands the tree and places added later are covered.
- **Site and Store records place-scoped** (structure-and-masters 6.1; product owner, 8 Oct 2026): the `organisation.site` and `organisation.store` record types, unscoped as built in `S1-F02-T01`, declare their place facts and are authorised by them, together with approval requests carrying the document's scope facts (RR-435).
- **Units, mappings, verifications, locations and default warehouses place-scoped** (structure-and-masters 6.1; product owner, 8 Oct 2026): `organisation.business_unit`, `organisation.business_unit_mapping`, `organisation.business_unit_mapping_verification`, `organisation.location` and `organisation.store_default_warehouse`, unscoped as built in `S1-F02-T02`, declare the place facts they carry and are authorised by them, as Sites and Stores are; which facts each declares is written into structure-and-masters 6.1 with this ticket.
- **Screen** (access-and-approvals 14): the assignment editor of S1-F01-T16 shows the place scope as the tree, and says that a selected Site covers Stores and units added later, and a selected Store covers units added later.

## Expected outputs

The scope contract and its `organisation` implementation; selected-member scope in `access`; the assignment editor's place tree; tests

## Done when

- access-and-approvals 15 tests 8 and 9 pass (test 9: all members covers a new Site; its empty part passed in S1-F01-T11); test 11 with place-scoped actors
- structure-and-masters 9 test 4, its place-expansion part: a Site-scoped and a Store-scoped place expand as 3.9 says
- An assignment selecting a place or legal entity that does not exist, or is not where the assignment says, is refused when saved
- Browser journey: an Admin prepares an assignment selecting one synthetic Store; a different authorised person approves it; the user reads that Store's records and is refused at another Store, with the place named

## Notes

- How a Store-scoped and a Site-scoped assignment follow a relocating Store (3.9) is stage 5; not built here.
- Brand selection comes through `merchandise`'s side of the same contract in S1-F03-T01.
- Who holds which scope is KDPS's (V-01, RR-064); tests use labelled synthetic assignments.
