# S2-F02-T03 — Findings at the count and the held-line decisions

Status: blocked
Blocked by: S2-F02-T02, S2-F08-T01
Feature: [Stage 2 first version](../../spec.md)

## Build

- Findings on each line ([goods-in.md](../../../../design/goods-in/goods-in.md) 4.4; `PRD-REC-006`): shortage, excess, wrong, unidentified and damage, coexisting; excess, wrong and unidentified goods received or not received.
- At GRN issue: excess under an excess hold, wrong goods in quarantine, unidentified goods in quarantine with identity Unknown, damage through damage reports (`S2-F08-T01`); not-received goods create no custody; exceptions to Booking for shortage, excess, wrong and unidentified (4.5).
- Held-line decisions (4.6): a Booking approver, not the receiver, takes excess in or leaves it held, and takes wrong or unidentified goods in after naming the product, or leaves them quarantined (`PRD-REC-013`, `POL-17.02`, `POL-17.11`); each keeps the original finding. Policy gate: policy 17.
- **Ledger support this needs** (found by `S2-F02-T01`): the excess hold on goods of Unknown SKU, using the origin-based holds `S2-F08-T01` adds; and a receipt count of unidentified goods with no described identity, in quarantine. Amend stock-ledger.md in the same change.
- The read `merchandise` · PT uses: whether every held line of a GRN is decided, and its good pieces per style and size (5.1, 5.4). The receipt problems read model.

## Expected outputs

`receiving` changes and migrations; routes, schemas, OpenAPI; screens; integration tests.

## Done when

Design test 1 (custody from the count, shortage with Booking) and the holding part of test 2 pass; every check passes.

## Notes

- Built 22 Oct 2026 on branch `s2/f02-t03-findings-and-held-lines`, awaiting review. The design is written back in goods-in 4.5, 4.8, 4.9 (as built), 8.5, 10.3 to 10.5, section 11 and section 13 (GI-5, GI-6); stock-ledger 2.3, 13.2, 13.4, 13.14 and 13.16 (as built, for the product owner's review of the ledger change); access-and-approvals 5.3 (its example of an Unknown brand, unidentified goods, corrected against RR-555).
- **Ledger support** (stock-ledger 13.16): a receipt count may name the origin it makes, so the holds of the GRN's one request name its goods (excess, quarantine, damage), of a SKU or of Unknown SKU; and a receipt count of unidentified goods with no identity as described, in the unidentified condition, quarantined in the same request. `receiving`'s `grn` registers `place-hold`.
- **Damage at the count**: `reportDamage` cannot join the GRN's single ledger request, so `stock` · documents offers three steps instead, `countDamageReady` before any lock above step 1, `countDamageHold` as an item of the GRN's request, and `recordCountDamage` after it is written; the report-recording half of `reportDamage` is shared (`commands/record.ts`). Its states reach `receiving` through the narrowly authorised `stock.damage_of_grn_lines` (migration 0097).
- **`receiving`** (migration `receiving__findings_and_held_lines`, 0096): what a count line counts (on the invoice, wrong, unidentified), its extra pieces received or not, its damage with one photo; the GRN line's findings; held lines, their versions and their decision through `access` (`receiving.held_line.decision` on approve of `receiving.held_line`), naming the product of unidentified goods (edit on `receiving.held_line`); the follow-ups `receiving.shortage`, `receiving.excess`, `receiving.wrong-goods`, `receiving.unidentified-goods`; the gate `receiving.held-line-decisions` (policy 17); `receiving.held-line-decided`; the reads `ptBasis` (for `merchandise` · PT) and `receiptProblems` (the read model of the report); routes `readHeldLine` and `nameHeldLineProduct`; `receiving.line-differs-from-invoice` removed, `receiving.extra-not-recorded` added for lines saved before.
- **Tests**: `apps/server/test/receiving-findings.int.test.ts` (design test 1; the holding part of test 2; the decisions, the gate, the PT read, the receipt problems), `apps/server/test/stock-ledger-held-receipts.int.test.ts`, `packages/schemas/src/receiving.test.ts`, `apps/web/e2e/held-lines.spec.ts`; the receiving, damage and register tests updated for the new count line shape.
- **Beyond the ticket**: (1) the counter's and the web app's typed API clients, and the web app's `useSubmission`, are now named by their types, since the larger route table passed the length the compiler writes out by inference (TS7056); (2) a GRN with nothing received at all makes no ledger request, which the ledger would refuse as empty.
- **Open, for the product owner**: RR-571 (damage on wrong or unidentified goods at the count, GI-5), RR-572 (what settles a shortage's follow-up, GI-6), RR-573 (the namer of unidentified goods' product and their approver are different people; the decision on cost), and RR-566 (policy 17's values, which held-line decisions need as damage reports do).
