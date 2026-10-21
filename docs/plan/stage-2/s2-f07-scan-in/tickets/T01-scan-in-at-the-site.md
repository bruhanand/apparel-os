# S2-F07-T01 — Scan-in at the Site

Status: blocked
Blocked by: S2-F06-T01, S2-F08-T01
Feature: [Stage 2 first version](../../spec.md)

## Build

- GRNs waiting for scan-in in the inbox; a scan-in that several people can work on and resume ([goods-in.md](../../../../design/goods-in/goods-in.md) section 7).
- The destination chosen and changeable between scans: floor or backstore at a Store, a bin at a warehouse.
- One piece per scan, scanned or typed from the tag; the barcode resolved to a product the PT covers with pieces still waiting; a repeated barcode asks which product (`S2-F04-T01`); a barcode not covered, or nothing left, refused and recorded with no stock change.
- Each accepted scan in one transaction: acceptance and the location move in the stock ledger, the scan record, audit (7.2). Damage while scanning through a damage report (`S2-F08-T01`). Stop with pieces left; nothing written off.
- Under a brand Agreement whose ownership passes at receipt and acceptance, the accepted scan also posts the ownership change from the brand, the owner the GRN recorded, to the Organisation (the receiving unit's legal entity), since the scan-in is the acceptance (`DEC-141`, `POL-01.05`; goods-in 4.5, 4.8).
- The read `merchandise` · PT uses: whether any piece of a GRN is accepted (for `S2-F09-T01`). Policy gate: the unit's receiving activity, policies 4 and 10.

## Expected outputs

`receiving` changes; routes, schemas, OpenAPI; the scan-in screen at phone width; integration tests.

## Done when

Design tests 13, 14 and 17 pass, including the last piece scanned twice at once accepted once; every check passes.
