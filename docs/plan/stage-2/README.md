# Stage 2 — Goods-in, first version

> **Not ranked.** Stage 2 of [phases.md](../../phases.md), its first version split into tickets. It decides nothing; phases.md, the PRD and the policies win over it.

The whole first version in one document: [spec.md](spec.md). The design is [goods-in.md](../../design/goods-in/goods-in.md), approved 21 Oct 2026; the decisions are `DEC-128` to `DEC-140` ([grill notes](../stage-2-grill-notes.md)). Each feature has a folder here with its `tickets/`; the later parts of stage 2 are in [roadmap.md](../roadmap.md) section 2.

## 1. Goal

- Booking records a booking from its document and has it approved against open-to-buy, its terms from the brand's Agreement (`DEC-129` to `DEC-132`).
- Goods arrive with their invoice; the receiver counts them by hand, keeps every problem apart and issues the GRN; counted goods are held but not sellable (`PRD-REC-008`, `DEC-133`).
- The PT file is uploaded in KDPS's fixed template, checked against the GRN, and approved by a different person; the stock becomes official and valued (`DEC-134`, `DEC-135`, `DEC-140`).
- The goods are scanned in piece by piece; at a Store they become sellable (`PRD-STK-003`).
- Damage holds goods at once and a different person decides it (`PRD-ACP-005`). Stock search and four reports show it all.

## 2. Where we are

Updated 21 Oct 2026. On the integration branch `s2/goods-in-first-version` (not pushed): `S2-F01-T01` and `S2-F02-T01` done; `S2-F01-T02` and `S2-F04-T01` built, reviewed and merged, waiting for the product owner's answers (RR-548 to RR-550, RR-554); `S2-F02-T02` built, reviewed and merged, waiting for RR-555 to RR-559.

## 3. Scope

The first version of goods-in, section 1. After it, placement OPEN (RR-546): the PT workbench, vendor file readers, all AI reading, labels for goods without a brand barcode, piece tracking, supplemental PTs, corrections after the scan-in, inbound ownership. Invoice matching moved to stage 5 (`DEC-137`).

## 4. Features

| Feature | First version | Later (RR-546) |
| --- | --- | --- |
| `S2-F01` Bookings | Document upload and entry by hand, approval against open-to-buy, changes, cancellation, overdue | AI reading of booking documents; the supplier confirmation comparison (`PRD-BKG-010`) |
| `S2-F02` Arrival, count and GRN | Inbox, Arrival, count by hand, findings, held-line decisions, receiving against a booking, recount | — |
| `S2-F03` Inbound ownership | — | All (`DEC-139`) |
| `S2-F04` PT workbench and costing | Upload of the fixed PT template for a GRN | The workbench, costing profiles |
| `S2-F05` AI drafts | — | All (`DEC-136`) |
| `S2-F06` PT approval and established cost | All | — |
| `S2-F07` Labels, verification, acceptance | The scan-in | Labels, piece IDs |
| `S2-F08` Damage holds | All | — |
| `S2-F09` PT corrections and reversals | Reversal before the scan-in | Corrections after it |
| `S2-F10` Supplier invoice matching | Moved to stage 5 (`DEC-137`) | — |
| `S2-F11` Stock search and goods-in reports | Search and four reports | The PT accuracy report |
| `S2-F12` Side-by-side test imports | Parked | — |
| `S2-F13` Sample layouts and readers | KDPS's template through the stage 1 XLSX reader | The other readers and vendor layouts |

## 5. Before live use

Policies 1, 3, 5, 17 and the stage 2 parts of 10 Signed and validated, their values entered (open-to-buy budgets V-17 and RR-080, the posting map's receipt account, approval limits), number series set up (RR-449 for a screen), and each Site's receiving readiness approved ([roadmap.md](../roadmap.md) 2.3). Until then everything runs on labelled synthetic data on `dev`.

## 6. Tickets

| Ticket | Status | Blocked by |
| --- | --- | --- |
| [F01-T01 Remove the Agreement's default model](s2-f01-bookings/tickets/T01-remove-the-agreement-default-model.md) | done | — |
| [F01-T02 Open-to-buy budgets](s2-f01-bookings/tickets/T02-open-to-buy-budgets.md) | ready-for-human | — (RR-548, RR-549, RR-550) |
| [F01-T03 Record and approve a booking](s2-f01-bookings/tickets/T03-record-and-approve-a-booking.md) | blocked | F01-T01, F01-T02 |
| [F01-T04 Issued, Confirmed, changes, cancellation and overdue](s2-f01-bookings/tickets/T04-issue-confirm-change-cancel-and-overdue.md) | blocked | F01-T03 |
| [F02-T01 Ledger: receipt count without a product, identity step](s2-f02-arrival-count-and-grn/tickets/T01-receipt-count-without-a-product.md) | done | — |
| [F02-T02 Inbox, Arrival, count and a clean GRN](s2-f02-arrival-count-and-grn/tickets/T02-inbox-arrival-count-and-a-clean-grn.md) | ready-for-human | — (RR-555 to RR-559) |
| [F08-T01 Damage reports](s2-f08-damage-holds/tickets/T01-damage-reports.md) | blocked | F02-T02 |
| [F02-T03 Findings and held-line decisions](s2-f02-arrival-count-and-grn/tickets/T03-findings-and-held-lines.md) | blocked | F02-T02, F08-T01 |
| [F02-T04 Receive against a booking](s2-f02-arrival-count-and-grn/tickets/T04-receive-against-a-booking.md) | blocked | F02-T02, F01-T04 |
| [F02-T05 Recount](s2-f02-arrival-count-and-grn/tickets/T05-recount.md) | blocked | F02-T03 |
| [F04-T01 A brand barcode on several products](s2-f04-pt-upload/tickets/T01-repeated-brand-barcodes.md) | ready-for-human | — (RR-554) |
| [F04-T02 Upload a PT file for a GRN](s2-f04-pt-upload/tickets/T02-upload-a-pt-file-for-a-grn.md) | blocked | F02-T03, F04-T01 |
| [F06-T01 Approve or reject a PT](s2-f06-pt-approval/tickets/T01-approve-or-reject-a-pt.md) | blocked | F04-T02 |
| [F07-T01 Scan-in at the Site](s2-f07-scan-in/tickets/T01-scan-in-at-the-site.md) | blocked | F06-T01, F08-T01 |
| [F09-T01 Reverse a PT before the scan-in](s2-f09-pt-reversal/tickets/T01-reverse-a-pt-before-the-scan-in.md) | blocked | F07-T01 |
| [F11-T01 Stock search](s2-f11-stock-search-and-reports/tickets/T01-stock-search.md) | blocked | F07-T01 |
| [F11-T02 The stage 2 reports](s2-f11-stock-search-and-reports/tickets/T02-stage-2-reports.md) | blocked | F01-T04, F02-T04, F07-T01 |
| [F07-T02 First-version acceptance](s2-f07-scan-in/tickets/T02-first-version-acceptance.md) | blocked | F01-T04, F02-T04, F02-T05, F06-T01, F07-T01, F09-T01, F11-T01, F11-T02 |

## 7. Exit checks the first version reaches

From [phases.md](../../phases.md) stage 2 and [roadmap.md](../roadmap.md) 2.1, with the design tests that prove them (goods-in section 12):

- [ ] Invoice or booking quantities never create uncounted stock; clean quantity proceeds while damage, excess or identity problems stay held (`PRD-ACP-001`; tests 1, 2).
- [ ] PT coverage cannot overlap, including under concurrent approval (`PRD-ACP-002`; test 12). Supplemental PTs follow later.
- [ ] Supplier and direct-store goods meet the same selling-Site acceptance and hold checks (`PRD-ACP-003`; test 17). Opening goods arrive with the stage 4 switch.
- [ ] Damage blocks stock at once; independent rejection clears only the mistaken hold (`PRD-ACP-005`; test 16).
- Not reached by the first version: inbound ownership (`PRD-ACP-020`, `DEC-139`) and the side-by-side import (`PRD-LIF-014`, parked). Stage 2 exits only when they are placed and proved, and after stage 1 exits.
