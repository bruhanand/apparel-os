# S2-F08-T01 — Damage reports

Status: ready-for-agent
Blocked by: S2-F02-T02
Feature: [Stage 2 first version](../../spec.md)

## Build

- The damage report of `stock` · documents ([goods-in.md](../../../../design/goods-in/goods-in.md) section 8; `PRD-DMG-001`–`PRD-DMG-006`, `PRD-DMG-010`): goods (a GRN line's goods at the receiving location, or a product at a location), quantity, what is wrong, photos; a damage hold at once; an exception to Operations in My work; a number from the damage-report series.
- Confirm or reject by a different authorised person with a reason; the value basis is cost, and Unknown cost needs explicit authority (8.3). Confirm: damaged condition and quarantine where the goods are. Reject: only its hold released.
- Undo a mistaken confirmation by a linked reversal, proposed and approved by different people (`PRD-STK-017`).
- The interface `receiving` calls to raise a report inside its own transaction (goods-in 10.2). Policy gate: policy 17.
- Screens: report damage; the decision in My work.
- **Ledger support this needs** (found by `S2-F02-T01`): stock-ledger items name goods by SKU, so a damage hold and the damaged condition cannot yet fall on goods of Unknown SKU (a GRN line of a product not yet set up). Extend the ledger's hold and condition-change items to name such goods by their receipt origin, and amend stock-ledger.md in the same change.

## Expected outputs

`stock` · documents records and migrations; routes, schemas, OpenAPI; screens; integration tests.

## Done when

Design test 16 passes; a report raised through the receiving interface joins the caller's transaction and commits or rolls back with it; every check passes.

## Notes

Built beyond the ticket's list, each needed by it (goods-in 8.5 "As built"):

- `access`: a document's decision effect may declare `postsWithDecision` and a `precheck`: the decision is written first, under a savepoint, so the effect's ledger request can verify and use it under the ledger's locks, and is rolled back when the effect refuses (access-and-approvals 9.8b "As built for a document posted with its decision").
- `receiving`: the Arrival's read gives each GRN line its identifier, which a report names.
- A read of a reversal, `GET /api/stock/damage-reversals/{damageReversalId}`, answering the report it belongs to, for the reversal's approval panel.
- Decision renewal (`decision-renewal`): a new round when the goods' cost moved past the request's value under the ledger's locks.
- The damage-report series is defined in the test fixtures and the server of the browser journeys only, not in the local seed (`DEC-143`): the product owner to say whether the seed adds it.
- The approval panel reads damage reports again after a decision.
