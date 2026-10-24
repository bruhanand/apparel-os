# S2-F07-T01 — Scan-in at the Site

Status: done
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

## Notes

- Built (23 Oct 2026, branch `s2/f07-t01-scan-in`; `Status:` unchanged): migrations `0110__receiving__scan_in.sql` (the scans) and `0111__stock.ledger__pt_revision_goods.sql` (the narrowly authorised read of what a PT revision covers); the scan route and the scan-in's read; the inbox's "Waiting for its scan-in" and History (RR-606 closed); `receiving`'s `anyAccepted` for `S2-F09-T01`; the scan-in's screen at phone width, reached from the GRN; the integration tests `apps/server/test/receiving-scan-in.int.test.ts` (design tests 13, 14 and 17) and the rules' unit test; the scan-in step of the browser journey `apps/web/e2e/pt-approval.spec.ts`, on its world. Design written in goods-in 7.5 (and 4.8, 10.3 to 10.5, 11) and stock-ledger 13.20 (for review, RR-612).
- Ownership (`DEC-141`): under an Agreement passing ownership at receipt and acceptance, a scan sends the ledger the ownership change, which the ledger refuses, `stock.rule-not-set` naming SL-26, since the piece's cost is established and no event kind posts value entering stock at an ownership change. So the scan-in of such goods stays unavailable until the product owner settles SL-26 (RR-610). Nothing is posted or invented for it.
- A design choice for the product owner: a piece is never scanned in to the receiving location itself (RR-611).
- Beyond the ticket: the inbox's History view, filled a batch at a time with a technical cap of 1,000 deliveries a request (`INBOX_EXAMINED_CAP`); the event `receiving.piece-accepted` (goods-in 10.4 proposed it); the stock ledger's record acceptance in a named condition and its ownership-change item, built for the SL-26 refusal only (stock-ledger 13.20); `merchandise` · catalogue's `resolveCode` exported for `receiving`; the damage report form taking a product at a location, for damage found while scanning; the test world's warehouse granted receiving, `issuedGrn`'s unit and brand choices and `enrol`; the browser journeys' server's floor location for the PT world and the maker's scan permission.
- Open, for the product owner: RR-610, RR-611, RR-612.
- Built and merged 23 Oct 2026 (commits 9055c838, ca57cfca, 11a1d451, merged in 2a3dfbab); every check and 47 browser journeys pass. Awaiting code review with wave F; `Status:` stays in-progress until then.
- Review 8 changes (23 Oct 2026, branch `s2/review-8-fixes`; `Status:` unchanged): the goods a PT covers read under the reader's own actor, migration 0111 now `stock.ledger__pt_goods_not_waiting`, with no read past the reader's grants; the scan-in's read refused, and the inbox Unknown, to a reader without view on the stock it reads, and a scan holding that view at step 0 (goods-in 7.5; code-house-rules 6.2, `DEC-117`); the scan-in complete when every piece is accepted or under a damage report (goods-in 7.3), a product's pieces under a damage report counted apart from those held otherwise; a gate refusal tested; a product's name sent in the shape of Unknown; one constant for the barcode's cap, tested against the migration's check; the location kinds a type; `resolveCode` moved to the catalogue's queries; the scan-in's authority and names read in `receiving`'s own query; a Store's staff (P-STM) journey, scanning in at their own Store. RR-612 narrowed; RR-660 and RR-661 added.
- Done 23 Oct 2026: reviewed (code review 8) with its fixes in; every check and 48 browser journeys pass on the integration branch. Commits 9055c838, ca57cfca, 11a1d451, merged in 2a3dfbab; review 8 fixes e82788fb, 34a08575, a619700c, merged in ff2f3827.
