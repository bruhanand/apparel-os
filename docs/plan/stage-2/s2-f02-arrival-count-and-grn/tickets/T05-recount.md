# S2-F02-T05 — Recount

Status: in-progress
Blocked by: S2-F02-T03, S2-F04-T02 (the GRN's "PT attached" mark is built there)
Feature: [Stage 2 first version](../../spec.md)

## Build

- A linked recount of a GRN's lines, proposed with a reason and approved by a different person; it adds or reverses receipt counts for the difference and keeps the original count ([goods-in.md](../../../../design/goods-in/goods-in.md) 4.7; `PRD-REC-019`).
- Refused once a PT is uploaded for the GRN. `receiving` keeps a "PT attached" mark on the GRN, which `merchandise` · PT sets at submit and clears at withdrawal, rejection or reversal (`S2-F04-T02`, `S2-F06-T01`, `S2-F09-T01`); this ticket builds the mark and its refusal.

## Expected outputs

`receiving` changes; routes and schemas; the screen; integration tests.

## Done when

A recount corrects custody with the original kept; the recounter cannot approve their own; a recount is refused while the mark is set; every check passes.

## Notes

- The mark is built in S2-F04-T02 (goods-in 5.8): `receiving.grn_pt_mark`, set and cleared through `receiving`'s `setPtMark` and `clearPtMark` under the GRN's row lock (`ptMarkLock`), and read by `ptMark`. This ticket builds only the recount's refusal while it is set.
- **Built** 22 Oct 2026 on `s2/f02-t05-recount` (goods-in 4.7 design choices, 4.11 "As built"): `receiving`'s recount, proposed on the GRN with a reason (`POST /api/receiving/grns/{grnId}/recounts`) and decided through `access` by a different person (`receiving.recount.approval`, on the goods' cost), read for its panel (`GET /api/receiving/recounts/{recountId}`); migrations `0107__receiving__recounts` and `0108__booking__grn_lines_delivering` (provisional numbers; the merger renumbers them); the GRN screen's recounts and proposal, and the panel's facts in My work; the journey `apps/web/e2e/recount.spec.ts`. Questions for the product owner: RR-587 to RR-591.
- **Beyond the ticket**, each needed for the recount to be right:
  - `stock` · ledger (stock-ledger 13.18, **For review**): a receipt count of goods of a product not yet set up may be reversed by its origin, and a reversal of a receipt count whose cost is not established names no pool and asks no posting check; the read `receiptCountOfLine`; `receiving`'s registration of the record type `recount`.
  - `booking`: the narrowly authorised read `booking.grn_lines_delivering` and `grnLinesDelivering` on its interface, so a recount refuses a line delivering to a booking whatever the proposer sees (DEC-117).
  - `merchandise` · PT: the upload waits for a recount of its GRN, named in `merchandise.pt-held-lines-open`; a recounted line, whose goods may be on several origins, is named once in the coverage's GRN lines.
  - `receiving`: Booking's later link takes a line's pieces as recounted, and the screen's booking standing too; a recount that makes a shortage larger raises its own shortage follow-up; `receivingApprovals` moved to `commands/approvals.ts` with the recount's effect beside the held line's.
  - `module-map` section 5: `receiving` holds the recount (`PRD-REC-019`) and reads which GRN lines deliver to a booking.
