# S1-F02-T02 — Business units, verified mappings and locations

Status: blocked
Blocked by: S1-F02-T01 (done), S1-F06-T05 (done) (stored files, for verification evidence)
Feature: [S1-F02 Organisation structure and verified mappings](../../spec.md)

## Build

The rest of the `organisation` module ([structure-and-masters.md](../../../../design/masters/structure-and-masters.md) 3.3 to 3.6, 3.8, 6.1, 8; [module-map.md](../../../../design/architecture/module-map.md) 4.11), every record under 2.2 and house rules 7.3, every change through flow A with a different authorised approver (2.3; GC2-2, `DEC-105`).

- **Business units** (3.3; `PRD-ORG-004`, `PRD-ORG-006`): whole-store, brand counter, warehouse or office; Site, kind and Store fixed at creation; a Store's unit created at the Site its Store is linked to on that date; exactly one whole-store unit per Store at that Site; warehouse and office units belong to no Store. A unit is created with its first mapping version and starts in Setting up (3.4, 3.7).
- **The mapping** (3.4; `PRD-ORG-005`, `POL-10.01`): dated versions mapping a unit to one legal entity, one tax registration and one accounting book, never inferred from the Site, with no gap and no overlap; a unit is never left without one. Refused when the registration or book belongs to another legal entity (`PRD-ORG-020`), or when the registration's State is not the State of the unit's Site on the mapping's start date (GC2-1, `DEC-105`); a new Site Area version or registration State version that would put a mapping in force out of step is refused too. Emits `organisation.mapping-changed`.
- **Verification** (3.4; `POL-10.08`): an append-only record linked to one mapping version, with who verified it, when, and the evidence, a stored file attached to the verification through S1-F06-T05. Refused for the person who made the mapping (by trigger) and for anyone without the separate verify permission (by the service).
- **Read a unit's mapping as of a date** (3.8): legal entity, registration, book, the mapping version identifier for the caller to store (`PRD-ACP-013`), and its verification; refused when no mapping is in force on that date.
- **Locations** (3.5; `PRD-ORG-012`): floor, backstore, zone, rack, bin, fixture, display or alteration; fixed to one Site and one unit at that Site; zones, racks and bins may nest. Retiring one asks `stock` through the location-in-use contract `organisation` defines here (module-map section 3, rule 6), and is refused while stock is recorded there or while no implementation answers.
- **Default warehouse** (3.6; `PRD-ORG-013`): each Store's dated link to a warehouse unit, one in force per Store.
- **Read the structure** gains units with their kind and mapping version, locations and default warehouses, so `merchandise` can apply the brand-coverage rule by unit kind (3.3), and `finance` can find a unit's book (S1-F09-T01). The **master lists** read model gains the same, with each mapping's verification state.
- **Screens** (structure-and-masters 8; ui-blueprint Setup › Organisation structure: business units, locations): the mapping shows its legal entity, registration and book together, and a mismatch or an other-State registration is refused with its reason; verification with its evidence; each master's version history and the version in force on a chosen date.
- A test-only synthetic transaction in a `test_` schema (house rules 11.4) stores the mapping version it used, for test 1.

## Expected outputs

Business units, mappings, verifications, locations and default warehouses in `organisation`, with their migration and `tables.json` entries; the location-in-use contract; schemas and routes; the screens; tests

## Done when

- structure-and-masters 9 tests 1, 2, 3, 6 and 15 pass; test 16 for a mapping change approved by its preparer and for a mapping verified by its maker or by someone without the verify permission; test 14 for these records
- Stage 1 exit check 1, mapping part ([README](../../README.md) 7.1): test 1 green, with one Site holding two units mapped to different books and registrations
- A second whole-store unit for a Store, a Store's unit at a Site its Store is not linked to, and a default warehouse link to a unit that is not a warehouse are refused; a location cannot be retired while no stock implementation answers
- Browser journey: an Admin prepares two units at one synthetic Site mapped to different books and registrations; a different authorised person approves them from My work; an Accounts user who did not make the mapping verifies one, attaching a synthetic evidence file; the maker's own verification is refused, with its reason on screen

## Notes

- structure-and-masters 9 test 5 (brand coverage by unit kind) is built and proved in S1-F03-T01, since `merchandise` owns brand coverage; this ticket gives it the unit's kind.
- Verification evidence is a real stored file from the start: S1-F06-T05 is built right after S1-F01, and this ticket attaches the file (product owner, 6 Oct 2026, DEC-116).
- access-and-approvals 4.1 has no verify action; how the separate verify permission sits in the registry is written into structure-and-masters 3.4 with the code.
- Accounts and the CA confirm the verification rule and whether a mapping is also a statutory setting under `POL-10.05` (structure-and-masters 2.3). Live use: RR-176 (the registration-in-State check, CA), RR-178, RR-081 (registrations per unit, V-18), RR-122 (default warehouses, V-62; other routes stay OPEN for stage 3).
