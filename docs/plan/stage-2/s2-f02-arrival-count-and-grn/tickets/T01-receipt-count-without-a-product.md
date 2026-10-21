# S2-F02-T01 — Ledger: receipt count of goods without a product, and the identity step

Status: ready-for-agent
Blocked by: —
Feature: [Stage 2 first version](../../spec.md)

## Build

- GI-1 ([goods-in.md](../../../../design/goods-in/goods-in.md) 4.5, 6.3 step 4, 13): the stock ledger's receipt count takes goods whose SKU is Unknown, with an identity as described (style code, colour, size), in good condition and not quarantined ([stock-ledger.md](../../../../design/stock/stock-ledger.md) 2.2; `PRD-DMG-005`). The stage 1 build needs a known SKU (stock-ledger 13.9).
- An identity step that, given the PT's rows for one style and size, splits the receipt origins of that style and size into the PT's SKUs by quantity, as linked records keeping the originals; it also corrects an origin that named another SKU (6.3 step 4).
- Such goods are never sellable: no coverage, no acceptance (stock-ledger 6.3). Rebuild and compare still matches.
- Amend stock-ledger 2.2, 2.3, 13.4 and 13.9 in the same change, for the product owner's review of the ledger change (GI-1).

## Expected outputs

Ledger changes and migrations; stock-ledger design amendments; integration tests at the ledger's interface.

## Done when

A receipt count of described goods with Unknown SKU succeeds without quarantine; the identity step splits a style and size into SKUs with quantities conserved and the originals linked; nothing is sellable before coverage and acceptance; rebuild and compare passes; GI-1 closed.
