# S1-F03-T02 — Styles, SKUs, codes, packs and tracking profiles

Status: blocked
Blocked by: S1-F03-T01; S1-F03-T03 (suppliers, for supplier-scoped codes); S1-F10-T02 (the stock balances behind the stock-presence contract)
Feature: [S1-F03 Product and party masters](../../spec.md)

## Build

The rest of the catalogue part of `merchandise` ([structure-and-masters.md](../../../../design/masters/structure-and-masters.md) 4), every record under 2.2 and house rules 7.3.

- **Styles** (4.1; `PRD-MER-002`, `PRD-MER-004`, `PRD-MER-005`): brand and category fixed; brand article number, season, collection, launch date, gender, fabric, fit and HSN as versioned fields, each a value or Unknown (2.4). A list-type attribute takes only an approved vocabulary value (GC2-9). HSN is the style's value; the classification it names is `finance`'s (S1-F09-T04).
- **SKUs** (4.1; `POL-04.02`): style, colour, size and any other identity attribute the category names, fixed at creation; unique per style and identity values with nulls not distinct, so Unknown size and Free Size are two SKUs (`PRD-MER-005`). Each SKU has an explicit purpose: merchandise, or gift-with-purchase, promotional or packaging goods, which are SKUs like any other and keep their actual stock cost (`DEC-112`, RR-047 gap 1), placed as the RR-047 edit of 4.1 says.
- **Product proposals** (4.2; `PRD-MER-013`): a new style or SKU enters the catalogue only by confirming a proposal, which keeps the original source words; a different person from the proposer confirms or rejects it (DM-5, `DEC-105`); states Proposed, Confirmed and Rejected; nothing is filled from an unaccepted guess (`PRD-IMP-009`). Emits `merchandise.product-confirmed`.
- **External codes** (4.3; `PRD-MER-006` to `PRD-MER-008`): text kept exactly as supplied, leading zeros included; mapped to a SKU and a unit (the stock unit or a pack); scope one supplier, one brand or the Organisation, with validity dates; earlier codes kept as historical aliases; the same-scope conflict refused by the exclusion constraint, the cross-scope case by the service under a lock on the code; internal barcodes in the same table with kind internal. Resolve a code refuses when more than one target or none matches (4.7). Emits `merchandise.code-mapping-changed`.
- **Stock unit and packs** (4.4; `POL-04.03`, `POL-04.04`, `PRD-MER-012`): one stock unit per SKU (piece, pair or pack) as a versioned field, quantities whole; a new unit version refused while stock of the SKU is recorded (GC2-5); purchasing and selling packs with an explicit conversion, or contents SKU by SKU for a mixed pack, versioned so past quantities keep their conversion.
- **Tracking profiles** (4.5, 4.6; `PRD-MER-010`, `PRD-MER-011`, `PRD-MER-014`, `POL-04.01`, `POL-04.05`): piece-tracked or quantity; batch and expiry required; required identifiers; minimum remaining shelf life for receiving and for selling, none with a default; the dated category link `category_tracking_profile`. A change to piece-tracked is recorded as requested and takes effect at a Site only when its labelling count is complete; it is refused while stock exists at a Site with no labelling count planned (`PRD-MER-018`, `DEC-054`). The labelling count is stage 2; here the operation it will call records the change in force at a Site. Emits `merchandise.tracking-profile-changed`.
- **Stock-presence contract** (module-map section 3, rule 6): `merchandise` defines it; `stock` · ledger implements it from its balances ([stock-ledger.md](../../../../design/stock/stock-ledger.md) 13.7). The stock-unit and piece-tracking checks ask it; `merchandise` reads no stock table.
- **Read a SKU as of a date** (4.7): identity, purpose, stock unit, packs, tracking profile in force at a Site, HSN and attributes, with the version identifiers to store. S1-F10 replaces its stand-ins with this.
- **Screens** (structure-and-masters 8): Setup › Products (styles, SKUs, barcodes and aliases) and Setup › Merchandise tracking profiles (units, packs, batch and expiry, piece IDs). Product proposals are decided from My work. Unknown shows as Unknown, never blank or zero.

## Expected outputs

Catalogue operations and migrations; the stock-presence contract and its `stock` implementation; the Products and Merchandise tracking profiles screens; tests

## Done when

- structure-and-masters 9 tests 7, 8, 9, 10, 18 and 20 pass
- Read a SKU returns the versions in force on a date with their identifiers; an unconfirmed proposal is never read as a SKU; a gift-with-purchase, promotional or packaging SKU is read with its purpose and a stock unit like any other SKU
- Browser journey: a Booking user proposes a style with two SKUs, one of Unknown size and one Free Size; a different user confirms it from My work; both SKUs show on the Products screen with their codes; the proposer's own confirmation is refused, with its reason on screen

## Notes

- Module-map section 8 names no event for packs yet; add it there before this code emits one ([stage spec](../../spec.md), Further Notes).
- KDPS values stay OPEN: batch and expiry categories and shelf-life days (V-05, RR-068); piece-tracked categories beyond apparel and footwear (V-06, RR-069). Tests use labelled synthetic profiles. Live use also waits for RR-179 (GC2-5 and GC2-9 confirmed).
- Reporting the use of gift, promotional and packaging goods apart from merchandise sales (`DEC-112`) belongs to the stage that reports sales.
