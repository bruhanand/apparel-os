# S2-F04-T01 — A brand barcode on several products

Status: ready-for-agent
Blocked by: —
Feature: [Stage 2 first version](../../spec.md)

## Build

- `PRD-MER-007` as reworded by `DEC-135` (RR-547): a brand's external barcode may map to more than one SKU; the mapping is flagged as repeated; leading zeros and historical aliases kept.
- Resolve a code answers every candidate for a repeated barcode instead of refusing it. Callers that need one SKU, such as the stage 1 imports, treat more than one candidate as a choice for the person (a row issue), as before.
- Bring structure-and-masters 4.3 and module-map 4.12 "Resolve a code" in line in the same change.

## Expected outputs

`merchandise` · catalogue changes and migrations; schemas and OpenAPI; design amendments; tests.

## Done when

The barcode part of design test 10 passes; the stage 1 import tests still pass; RR-547 closed.

## Notes

- Built 21 Oct 2026 (structure-and-masters 4.3 "As built" with `S2-F04-T01`). **Design choices:** a brand's barcode is the code kind supplier barcode; only it may name more than one SKU, and never one SKU in two units; every other kind keeps the refusal of an ambiguous mapping. The repeated flag is worked out when a mapping is read, so ending one mapping ends it.
- Beyond the ticket: Setup › Products › Barcodes and aliases shows the flag ("Repeated on another product"), and the products browser journey maps one barcode to both its SKUs and sees both flagged; the browser journeys' Booking user of that journey gained create on `merchandise.external_code` for it.
- The migration is not compatible with the version running: between it and the new version taking traffic, Map a code fails (planned brief interruption on `dev`, `DEC-120`; its header says so).
- Code review 1 of stage 2 (21 Oct 2026): Resolve a code keeps, for one deploy, the one candidate's `skuId`, `packId` and `mappingId` at the top level beside `candidates`, marked deprecated, none for a repeated code (code-house-rules 12.1 "Compatible changes"; structure-and-masters 4.3 "As built"). Their removal is RR-551 (open-items section 4).
