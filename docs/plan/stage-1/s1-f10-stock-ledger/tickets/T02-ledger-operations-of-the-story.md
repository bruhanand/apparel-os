# S1-F10-T02 — Quantity operations

Status: blocked
Blocked by: T01; S1-F01-T13 (approval requests and decisions)
Feature: [S1-F10 Stock ledger with balanced posting](../spec.md)

## Build

Part 1, "Stock quantities and movements": the interface of stock-ledger section 13 for the unvalued operations, under the lock order of 10.3 with the refinements of RR-227 (receipt origins only read locked shared at step 2; the unit anchor at step 3, shared for every item and exclusive to start or end a count freeze) and the rechecks of 10.4, with `access` Verify under lock and Record use where an item needs approval. Verify under lock and Record use are built here, in `access`, as S1-F01 spec section 16 defers approval use by a posting to this feature (`DEC-097`):

- the request and its four operations (Plan, Lock, Recheck and value, Write) for unvalued items, which carry no value and call no Post, with registered callers and the synthetic-caller guard (13.1 to 13.3);
- movement items: receipt count, location move, condition change (13.4);
- status items: coverage, acceptance, holds, reservations, count freeze (13.5);
- the reads Custody, Piece and Availability, and Rebuild and compare over the quantity projections (13.6, 2.1);
- their refusals (13.8).

Development tests may use stand-ins built to the declared `organisation` and `merchandise` read contracts; acceptance runs through the real modules (T04).

Measure anchor-row contention: many items at one business unit take its unit anchor in shared mode while a count freeze takes it exclusively (14.3). The builder resolves any performance problem and brings back to the product owner only a change that affects business behaviour.

Rechecks under lock that must respect holds and count freezes hidden from the actor run through one narrowly authorised internal `stock` function that sees every such row at the command's unit and returns only a generic refusal, never the hidden row's details (stock-ledger 14.3; code-house-rules 6.2; `DEC-117`).

## Expected outputs

`stock` · ledger module and its `index.ts`; tests; the anchor-row measurement

## Done when

Each unvalued operation posts or refuses as section 13 says; rebuild-and-compare (2.1) matches the stored balances; the anchor-row contention test runs and its measurement is recorded

A brand-limited actor's move or reservation inside a count freeze or hold over another brand's goods is refused with the generic reason, and the refusal reveals nothing of the hidden row (`DEC-117`)

## Notes

- On 6 Oct 2026 (product owner) the valued parts of this ticket (cost pools, FIFO layers, moving average, valuation in posting order, the valued movement items) moved to T03, so this ticket no longer waits for S1-F09.
