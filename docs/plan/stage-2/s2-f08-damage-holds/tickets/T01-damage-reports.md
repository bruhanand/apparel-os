# S2-F08-T01 — Damage reports

Status: blocked
Blocked by: S2-F02-T02
Feature: [Stage 2 first version](../../spec.md)

## Build

- The damage report of `stock` · documents ([goods-in.md](../../../../design/goods-in/goods-in.md) section 8; `PRD-DMG-001`–`PRD-DMG-006`, `PRD-DMG-010`): goods (a GRN line's goods at the receiving location, or a product at a location), quantity, what is wrong, photos; a damage hold at once; an exception to Operations in My work; a number from the damage-report series.
- Confirm or reject by a different authorised person with a reason; the value basis is cost, and Unknown cost needs explicit authority (8.3). Confirm: damaged condition and quarantine where the goods are. Reject: only its hold released.
- Undo a mistaken confirmation by a linked reversal, proposed and approved by different people (`PRD-STK-017`).
- The interface `receiving` calls to raise a report inside its own transaction (goods-in 10.2). Policy gate: policy 17.
- Screens: report damage; the decision in My work.

## Expected outputs

`stock` · documents records and migrations; routes, schemas, OpenAPI; screens; integration tests.

## Done when

Design test 16 passes; a report raised through the receiving interface joins the caller's transaction and commits or rolls back with it; every check passes.
