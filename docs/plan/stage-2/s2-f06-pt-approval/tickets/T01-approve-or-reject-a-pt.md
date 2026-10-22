# S2-F06-T01 — Approve or reject a PT

Status: in-progress
Blocked by: S2-F04-T02
Feature: [Stage 2 first version](../../spec.md)

## Build

- The PT review in My work ([goods-in.md](../../../../design/goods-in/goods-in.md) 6.1, 6.2): routed to approvers whose limit covers `P RATE` times `QTY`; rows, totals, BASIC beside `P RATE`, margins, the GRN's invoices and photos, new products, repeated barcodes, differences.
- Approve, in one transaction with the stock ledger's lock order (6.3; module-map 6.2 flow C): verify the approval under the lock (the uploader cannot approve); confirm the new products; freeze the revision and number it from the PT series; give the GRN's goods their SKUs through the identity step (`S2-F02-T01`); record coverage and establish cost at `P RATE`; release the excess holds and quarantine of goods Booking took in; post owned goods under `stock.cost-established` against the receipt account of the posting map (synthetic in tests; `DEC-140`), consignment goods recording cost only; audit and outbox.
- Refusals under the locks: the GRN changed after the upload, overlapping coverage, a missing posting map, a locked period, a missing series. A large PT posts through the queued job (flow E). Reject: the draft ends and the mark clears.
- Download an approved PT as XLSX in the template's columns (6.5). Policy gate: policies 1, 3, 9 and 10.

## Expected outputs

`merchandise` · PT changes; the posting job registration; routes, schemas, OpenAPI; the review screen; integration tests.

## Done when

Design tests 11 and 12 pass, with the approval part of 21 posting through the job; after approval nothing is sellable (part of test 13); every check passes.
