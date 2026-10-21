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
