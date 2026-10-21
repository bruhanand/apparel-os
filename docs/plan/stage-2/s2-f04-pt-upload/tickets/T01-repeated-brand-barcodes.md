# S2-F04-T01 — A brand barcode on several products

Status: ready-for-human
Blocked by: —
Feature: [Stage 2 first version](../../spec.md)

## Build

- `PRD-MER-007` as reworded by `DEC-135` (RR-547): a brand's external barcode may map to more than one SKU; the mapping is flagged as repeated; leading zeros and historical aliases kept.
- Resolve a code answers every candidate for a repeated barcode instead of refusing it. Callers that need one SKU, such as the stage 1 imports, treat more than one candidate as a choice for the person (a row issue), as before.
- Bring structure-and-masters 4.3 and module-map 4.12 "Resolve a code" in line in the same change.

## Expected outputs

`merchandise` · catalogue changes and migrations; schemas and OpenAPI; design amendments; tests.

## Done when

The barcode part of design test 10 passes; the stage 1 import tests still pass; RR-547 closed.

## Notes

- Built 21 Oct 2026 (structure-and-masters 4.3 "As built" with `S2-F04-T01`). **Design choices:** a brand's barcode is the code kind supplier barcode; only it may name more than one SKU, and never one SKU in two units; every other kind keeps the refusal of an ambiguous mapping. The repeated flag is worked out when a mapping is read, so ending one mapping ends it.
- Beyond the ticket: Setup › Products › Barcodes and aliases shows the flag ("Repeated on another product"), and the products browser journey maps one barcode to both its SKUs and sees both flagged; the browser journeys' Booking user of that journey gained create on `merchandise.external_code` for it.
- The migration is not compatible with the version running: between it and the new version taking traffic, Map a code fails (planned brief interruption on `dev`, `DEC-120`; its header says so).
- Code review 1 of stage 2 (21 Oct 2026): Resolve a code keeps, for one deploy, the one candidate's `skuId`, `packId` and `mappingId` at the top level beside `candidates`, marked deprecated, none for a repeated code (code-house-rules 12.1 "Compatible changes"; structure-and-masters 4.3 "As built"). Their removal is RR-551 (open-items section 4).
- Built and merged 21 Oct 2026 on `s2/goods-in-first-version`: commit `6b3a975`, merged as `08b0e9e`; reviewed with `/code-review`, its fixes merged as `aa55bb2`. Waits for the product owner: the code lets every supplier barcode repeat in any scope, wider than `PRD-MER-007`'s "a brand's external barcode ... where the brand's tags repeat it" (RR-554). It closes once that is answered and any change it needs is built.
- **RR-554 built** (21 Oct 2026, branch `s2/w2-repeats-under-a-brand`; the product owner decided the same day that only a barcode recorded under a brand may repeat, `PRD-MER-007` as written). Migration `0089__merchandise.catalogue__repeats_only_under_a_brand.sql`: the same-scope exclusion leaves out only a supplier barcode recorded under a brand; the one-unit exclusion stays. The service refuses a second SKU for a supplier's or the Organisation's barcode again (`merchandise.code-conflict`), and the Organisation's mapping and a brand's repeat refuse each other across scopes. **Design choices** (structure-and-masters 4.3 "As built"): Resolve answers several SKUs only where the brand given names each under its scope; a matched mapping in another scope that names one of them, such as the supplier's own, adds no choice, and one naming another SKU makes the code ambiguous, as before; the repeated flag is set only on a brand's mapping that another under the same brand repeats. The stage 1 import handlers resolve without a brand, so a brand's repeat never reaches them; their test now records its repeat under a brand. The products browser journey maps its barcode under the style's brand.
- Beyond the ticket (RR-554): goods-in 5.5 and 7.2 now say the PT upload records a row's barcode under its product's brand and the scan-in resolves with the PT's brand, so a repeat stays possible there (`S2-F04-T02`, `S2-F07-T01`); the refusal's message names the brand rule.
