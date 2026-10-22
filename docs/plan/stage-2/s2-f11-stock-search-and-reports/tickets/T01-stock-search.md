# S2-F11-T01 — Stock search

Status: blocked
Blocked by: S2-F07-T01
Feature: [Stage 2 first version](../../spec.md)

## Build

- Search by style code or product name, brand, size, barcode, location and condition ([goods-in.md](../../../../design/goods-in/goods-in.md) 9.2; `PRD-STK-006`); a repeated barcode shows each product.
- Each result a product at a place with physical, available (to sell at a Store, to move at a warehouse), waiting and held quantities, held by kind (`PRD-STK-001`); the same product at the other Sites the reader may see; goods before PT approval by their counted style code, colour and size.
- Read models through the read-model gateway with their as-of time; cost only with the cost permission; XLSX export (9.1).
- From a result, report damage on a product at its location, the screen path of the damage route that `S2-F08-T01` left to stock search (goods-in 8.1, 8.5 "Screens"; `PRD-DMG-004`).

## Expected outputs

Read models; routes, schemas, OpenAPI; the search screen; integration tests.

## Done when

Design test 20 passes; on the synthetic journey's data the four quantities equal the ledger's; every check passes.
