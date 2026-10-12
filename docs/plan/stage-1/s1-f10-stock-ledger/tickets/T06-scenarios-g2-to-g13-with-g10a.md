# S1-F10-T06 — Scenarios G2 to G13 with G10a

Status: done
Blocked by: T04; S1-F08-T02
Feature: [S1-F10 Stock ledger with balanced posting](../spec.md)

## Build

The further scenarios of stock-ledger 11.8, with G10a only: no rounding rule set, an outflow that does not divide into whole paise is refused (7.10); an emptying outflow takes all remaining value (7.3). G10b waits for the real rounding rule (RR-124)

## Expected outputs

Scenario files; tests

## Done when

G2 to G13 and G10a pass; the 11.7 checks hold after every step ([spec](../spec.md) 3.5, 3.7)

## Notes

- Built on `s1/f10-t06` (11 Oct 2026), awaiting review; design as built in stock-ledger 13.11 and 15.6 and books-and-posting 7.2.
  - One scenario file per scenario under `apps/server/test/harness/stock/scenarios/further/`, run by `apps/server/test/stock-harness-further.int.test.ts`, each in its own world, with the checks of 11.7 and 16.5 after every command: G2 (P3), G3, G4, G5, G6, G7 under both formulas with Site pools (P1), G8 by origin and by expiry, G9, G10a, G11 under both formulas, G12, G13 under both formulas (P2), and the posting scenarios P4 and P5 of books-and-posting 16.4. All pass. G10b waits for the rounding rule (RR-124).
  - Ledger items built for them (13.11): disposal, count difference, reversal (of a receipt count and of a count loss) and piece correction (of a sale), and a sale's pass-through at an agreed cost (G6, a working assumption pending SL-4). Refusals they add are tested in `apps/server/test/stock-ledger-further.int.test.ts` (SL-27, SL-28, a count's own freeze).
  - Driver: the further commands, a test-only migration for the new document kinds, five more synthetic action types, and its own exception type for P4.
  - Defects found and fixed, each with a scenario that failed first: a quantity-tracked customer return could take the oldest layer first instead of the newest taken, because a sale's legs and layers were read back by their UUIDv7s, which one millisecond does not order (G9); no reopening could name a stock posting, because the ledger gave Post the bare record type where a reopening names `<module>.<record type>` (P5); cost established on a supplier-owned origin answered no value, which a cost-basis PT approval cannot verify (G6).
  - Not built (now open items RR-506 to RR-511 and RR-508): the tolerance that selects a count's approver (G3; the stage 3 count document's); the import module's duplicate control for a second earlier-POS load (G4 shows only the ledger's half: historical reference never posts); reversal of any other movement kind; a piece correction or found goods between pools; a customer return of piece B after a piece correction; P6 (opening count).
- Closed 11 Oct 2026 on `s1/f10-stock-ledger-2`, reviewed with `/code-review` (Opus); review fixes `8d04ab3`, `e5052f3`; no blocking finding left. Its own commits: `79a3c84`, `588ee5b`.
- Review fixes for this ticket: a quantity-tracked disposal refuses units another hold or a reservation also claims, as the piece path does (tested in `stock-ledger-further.int.test.ts`); the disposal reading confirmed and the pass-through kept as a labelled working assumption until the CA validates SL-4, refused for live use by its callers (product owner, 11 Oct 2026; RR-505; stock-ledger 13.11).
