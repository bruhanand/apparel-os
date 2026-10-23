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

## Notes

- Built 23 Oct 2026: goods-in 6.7, stock-ledger 13.21 (for review), open items RR-613 to RR-616. After the wave D review's fixes were merged (integration tip 29e69bf8), the reversal undoes the approval through the same named steps, and a posting the ledger refuses raises the approval's unfinished-operation exception, linking the reversal.
- The identity the PT's approval gave the pieces stays (goods-in 6.4): the reversal takes off only the coverage and the cost, and a corrected PT's approval takes the pieces from the reversed PT's new receipt origins (`goodsAfterReversals`), so its own approval path changed by that one step. Recorded in goods-in 6.7 and stock-ledger 13.21 for review (RR-613).
- Beyond the ticket: the ledger's reversal of a cost established, value only, and its read `coverageAndCostOfSource` (stock-ledger 13.21), which the reversal needs and no earlier ticket built; a SYNTHETIC posting map of `stock.cost-established-reversal` and a SYNTHETIC variance account in the shared PT test book (`apps/server/test/support/pt-gate.ts`), so the PT approval world's other tests run with a fourth account; the PT review takes a title, so the reversal's panel names the PT it reverses.
- A PT whose goods are held or damaged since its approval is not reversed (RR-614, for the product owner); a recount after a reversal is not built (RR-615); a large reversal posts with its decision, its queued path not built (RR-616).
