# S1-F03-T01 — Brands, categories and vocabularies

Status: blocked
Blocked by: S1-F02-T02 (units, for brand coverage); RR-047: the PRD bullets for the `DEC-112` master picks, and the structure-and-masters edits they need, approved (done, `DEC-123`, 9 Oct 2026)
Feature: [S1-F03 Product and party masters](../../spec.md)

## Build

The `merchandise` module, catalogue part, with its first migration. Every record is an identity row plus versions under [structure-and-masters.md](../../../../design/masters/structure-and-masters.md) 2.2 and house rules 7.3: approved versions never overlap, no version starts on a past date (GC2-7, `DEC-105`), a version in force is never edited, and each change writes its audit record in the same transaction (2.5).

- **Brands** (4.1; `PRD-MER-001`): code, name and aliases; an optional parent brand naming the brand's family, kept apart from its aliases (`DEC-112`, RR-047 gap 2). A brand is not a party (5.1).
- **Brand coverage** (3.3; `PRD-ORG-006`): the dated `business_unit_brand` record. A brand-counter unit has exactly one brand in force, an office unit none, a whole-store or warehouse unit any number. The unit's kind is read through `organisation`'s interface.
- **Brand scope for access**: `merchandise` implements the `access` scope contract for brand (module-map section 3, rule 6, and 4.12), so an assignment selecting an unknown or retired brand is refused.
- **Categories and size sets** (4.1; `PRD-MER-002`, `PRD-ORG-011`, `POL-04.01`): the category tree with its versioned parent, size set and the attributes that make up a SKU's identity; size sets fixed to a category, with ordered sizes. The category's tracking-profile link comes with tracking profiles in S1-F03-T02.
- **Attributes and vocabularies** (4.2; GC2-9): attributes configured per Organisation; a list-type attribute takes only its approved vocabulary values. A new value is a vocabulary proposal until a different person confirms it, and an unconfirmed proposal changes no operational data (`PRD-MER-004`, `PRD-IMP-008`, `POL-02.07`).
- **API**: Maintain masters, and Propose, Confirm or Reject a vocabulary value (4.7), each a command with an idempotency key and a version token (house rules 12.4, 12.7); the record types and actions registered with `access`.
- **Screen**: Setup › Vocabularies (structure-and-masters 8): Season, Brand, Colour, Gender, Sub category, Type, Item, Fit and Size, where Brand edits the brand records, Size the size sets and Sub category the category tree (4.2). Each master shows its version history and the version in force on a chosen date.

## Expected outputs

`merchandise` module with its `index.ts`; first `merchandise` migration with its `tables.json` entries; schemas and routes; the Vocabularies screen; tests

## Done when

- structure-and-masters 9 tests 5, 11 and 19 pass
- A parent brand is read apart from the brand's aliases; an unconfirmed vocabulary proposal is never offered as a value; an assignment selecting a brand is validated through the scope contract; a second synthetic Organisation sees none of these records
- Browser journey: a Booking user proposes a colour value; a different user confirms it from My work and it shows on the Vocabularies screen; the proposer's own confirmation is refused, with its reason on screen

## Notes

- Test 5 sits under S1-F02 in the stage [README](../../README.md) section 5, but `merchandise` owns brand coverage (structure-and-masters 3.3, `business_unit_brand` in 6.2), so it is built and proved here.
- Module-map section 8 names no event for brands or vocabulary yet; add them there before this code emits any (structure-and-masters 2.5; [stage spec](../../spec.md), Further Notes).
- Cite the new PRD IDs from RR-047 in code and tests once they exist.
- Who may propose, confirm and maintain is KDPS's (V-01, RR-064); tests use labelled synthetic roles. Live use also waits for RR-179 (GC2-9 confirmed by Booking).
