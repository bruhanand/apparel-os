# S1-F10-T01 — Ledger tables and constraints

Status: blocked
Blocked by: The product owner approves the **Proposed** choices of stock-ledger 13 to 15 (RR-012, with RR-227 lock-order refinements and RR-228 row-level security for stock rows, in [open-items.md](../../../open-items.md)); S1-F02, S1-F03 (the places and SKUs stock rows point at)
Feature: [S1-F10 Stock ledger with balanced posting](../spec.md)

## Build

The `stock` schema of [stock-ledger.md](../../../../design/stock/stock-ledger.md) section 14: movements, balances, receipt origins, pieces, holds, reservations, cost pools and layers, with their constraints, append-only guards, locks, indexes and row-level security (14.1 to 14.3; house rules 3 to 7)

## Expected outputs

First `stock` migration with its `tables.json` entries; integration tests

## Done when

Constraints and guards refuse what section 14 forbids; row-level security shows a scoped reader only its rows; the runtime role cannot change a posted row
