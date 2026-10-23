# S2-F09-T01 — Reverse a PT before the scan-in

Status: in-progress
Blocked by: S2-F07-T01
Feature: [Stage 2 first version](../../spec.md)

## Build

- Propose a reversal of an approved PT with a reason; a different person approves it ([goods-in.md](../../../../design/goods-in/goods-in.md) 6.4; `DEC-137`, `PRD-REC-019`).
- Refused once any piece of the PT is accepted (the read of `S2-F07-T01`).
- In one transaction: coverage removed, the established cost and its journal reversed (stock-ledger 2.3 Reversal, 7.5), the PT and its reversal kept as linked records, the GRN's mark cleared; products it confirmed stay. The GRN then waits for a corrected file (`S2-F04-T02`).
- Policy gate: policies 1, 3, 9 and 10.

## Expected outputs

`merchandise` · PT changes; routes and schemas; the screen; integration tests.

## Done when

Design test 15 passes: a reversed PT is followed by a corrected file approved again; a reversal is refused after one scan; every check passes.
