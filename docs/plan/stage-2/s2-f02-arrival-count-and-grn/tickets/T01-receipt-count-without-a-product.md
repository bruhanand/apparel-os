# S2-F02-T01 — Ledger: receipt count of goods without a product, and the identity step

Status: done
Blocked by: —
Feature: [Stage 2 first version](../../spec.md)

## Build

- GI-1 ([goods-in.md](../../../../design/goods-in/goods-in.md) 4.5, 6.3 step 4, 13): the stock ledger's receipt count takes goods whose SKU is Unknown, with an identity as described (style code, colour, size), in good condition and not quarantined ([stock-ledger.md](../../../../design/stock/stock-ledger.md) 2.2; `PRD-DMG-005`). The stage 1 build needs a known SKU (stock-ledger 13.9).
- An identity step that, given the PT's rows for one style and size, splits the receipt origins of that style and size into the PT's SKUs by quantity, as linked records keeping the originals; it also corrects an origin that named another SKU (6.3 step 4).
- Such goods are never sellable: no coverage, no acceptance (stock-ledger 6.3). Rebuild and compare still matches.
- Amend stock-ledger 2.2, 2.3, 13.4 and 13.9 in the same change, for the product owner's review of the ledger change (GI-1).

## Expected outputs

Ledger changes and migrations; stock-ledger design amendments; integration tests at the ledger's interface.

## Done when

A receipt count of described goods with Unknown SKU succeeds without quarantine; the identity step splits a style and size into SKUs with quantities conserved and the originals linked; nothing is sellable before coverage and acceptance; rebuild and compare passes; GI-1 closed.

## Notes

- Built 21 Oct 2026 on branch `s2/f02-t01-receipt-count-without-a-product`, awaiting review. Design written back in stock-ledger 2.2, 2.3, 13.4, 13.9, 14.2 and the new 13.14, each marked **For review (GI-1)** for the product owner's review of the ledger change; goods-in 4.5, 10.6 and section 13 (GI-1 closed).
- **The receipt count** (stock `domain/request.ts`, `plan.ts`, `domain/working.ts`, `write.ts`): `skuId: null` with `described` (style code, colour, size; a colour or size not stated is null, Unknown), in good condition, by quantity in pieces, no batch, not quarantined; the origin keeps the identity in three new columns of `stock.receipt_origin` (migration `stock.ledger__described_goods`, provisional number 0100). The goods of Unknown SKU at a unit share one SKU balance; Recheck reads only the named origins' balances under it. Record coverage refuses an origin of Unknown SKU (`identity-unknown`).
- **The identity step** (`identity-resolved`; `domain/identity.ts` for the split rule `splitIdentity`, exported): parts of origin, SKU, quantity and a caller-made new origin identifier (or none to keep the origin's SKU); every free unit of each named origin at the unit takes exactly one part; new origins of the kind `identity-resolved` keep their parent; wrong or unidentified goods taken in return to good by it once their quarantine is released; only under the request's approval (`condition-route` otherwise).
- **Tests**: `apps/server/test/stock-ledger-identity.int.test.ts` (11 tests on real PostgreSQL through the synthetic caller and the real `finance` · books), `apps/server/src/modules/stock/ledger/domain/identity.test.ts` (the split rule's worked examples). The synthetic caller registers `identity-resolved` (`test/support/stock-ledger.ts`).
- **Beyond the ticket**: (1) later items of the same request may name an origin the identity step makes, so record coverage and cost established follow it in one request, as PT approval needs (goods-in 6.3 steps 4 and 5; stock-ledger 13.14), with Write now taking a new origin's source line from the movement that made it and its state from what later items recorded; (2) a request whose items change nothing writes no audit record or event; (3) `OriginState` carries the full owner, stock unit, receiving mapping version and book, parent and identity as described.
- **Not built, for the tickets that need it** (stock-ledger 13.14): holds, condition changes and moves of goods of Unknown SKU, since an item names its goods by SKU: the excess, damage and quarantine of a line of a product not yet set up (`S2-F02-T03`, `S2-F08-T01`) need a ledger change first; a receipt count of unidentified goods, whose identity is Unknown (`S2-F02-T03`).
- **Migration number**: the runner refuses a gap in the numbers (`migration-set.ts`); the file is `0085__stock.ledger__described_goods.sql`, the next free number on `s2/goods-in-first-version` after `0084__merchandise.catalogue__repeated_brand_barcodes.sql` (built as the provisional 0100 and renumbered at the merge).
- **Code review 1 of stage 2** (21 Oct 2026): `splitIdentity` takes the maker of new origin identifiers from the caller and answers the identity step's parts (`IdentityPart`) directly, so one type remains (`IdentitySplitPart` and its `keeps` are gone); the receipt count's SKU and identity as described are paired by the type `CountedGoods`, the ledger still checking the pairing (stock-ledger 13.14); the split rule's tests name their IDs (code-house-rules 10.2); Recheck's owner and the identity step's custody location are defects when missing, never an empty identifier (`PRD-MOD-015`).
- Closed 21 Oct 2026 on `s2/goods-in-first-version`: commit `0cce376`, merged as `e157c17`; reviewed with `/code-review`, its fixes merged as `aa55bb2`; no blocking finding left. The stock-ledger amendment (GI-1) waits for the product owner's review; the brand of goods without a product is RR-555.
