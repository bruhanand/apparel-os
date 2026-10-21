# S2-F02-T03 — Findings at the count and the held-line decisions

Status: blocked
Blocked by: S2-F02-T02, S2-F08-T01
Feature: [Stage 2 first version](../../spec.md)

## Build

- Findings on each line ([goods-in.md](../../../../design/goods-in/goods-in.md) 4.4; `PRD-REC-006`): shortage, excess, wrong, unidentified and damage, coexisting; excess, wrong and unidentified goods received or not received.
- At GRN issue: excess under an excess hold, wrong goods in quarantine, unidentified goods in quarantine with identity Unknown, damage through damage reports (`S2-F08-T01`); not-received goods create no custody; exceptions to Booking for shortage, excess, wrong and unidentified (4.5).
- Held-line decisions (4.6): a Booking approver, not the receiver, takes excess in or leaves it held, and takes wrong or unidentified goods in after naming the product, or leaves them quarantined (`PRD-REC-013`, `POL-17.02`, `POL-17.11`); each keeps the original finding. Policy gate: policy 17.
- The read `merchandise` · PT uses: whether every held line of a GRN is decided, and its good pieces per style and size (5.1, 5.4). The receipt problems read model.

## Expected outputs

`receiving` changes and migrations; routes, schemas, OpenAPI; screens; integration tests.

## Done when

Design test 1 (custody from the count, shortage with Booking) and the holding part of test 2 pass; every check passes.
