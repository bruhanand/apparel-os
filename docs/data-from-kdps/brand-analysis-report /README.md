# brand-analysis-report

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [..](../README.md)

The folder name ends with a space (`brand-analysis-report `). Links to it write the space as `%20`.

## What this folder is
- The June 2026 versions (1 to 18 Jun) of the Blackberry and Mufti monthly workbooks, one folder per brand, saved on 19 Jun 2026. They continue the May workbooks in [2026-05/data](../monthly-reports-april-may-2026/2026-05/data/README.md).
- Blackberry also has a master list of KDPS's stock as the brand sees it, `KDPS LIFE.xlsx` (created 11 Jun 2026), and two new sheets, `BRAND REPORT` and `BILL SUMMARY`, that work out the discount each line should carry under the brand's offers.
- Made by KDPS staff or the ERP team's earlier analysis (the author is not named; `BRAND REPORT` is typed values, not a POS output). The brand-side list `KDPS LIFE.xlsx` is the brand's file (guess, see the [blackberry README](blackberry/README.md)). Any offer rule shown in them is an analyst's reading of the brand's offer text, not a KDPS decision.
- A raw file in the parent folder, `report-offer.md`, is the English translation of a call (about 19 Jun 2026) about the dummy Blackberry and Mufti offer report: offers applied from the AMM list at the best percentage; wish to club sales across days for the best benefit; refresh weekly or fortnightly. These June files fall on the same dates and brands, so they may be that dummy report (inferred).
- Notes (not ranked): [offers-and-brand-reports.md](../../data-notes/offers-and-brand-reports.md) for offers, the AMM list and brand reports; [pos-exports.md](../../data-notes/pos-exports.md) for the POS layouts the `SALES` lines come from.
- PRD rules these files touch: `PRD-OFR-021` (when offers cannot combine, apply the permitted set that gives the customer the largest total discount on the bill), `PRD-OFR-002` (offers keep brand and company cost shares), `PRD-OFR-006` (report who funded the discount) and `PRD-EBO-004` (brand-reported totals kept apart from verified bill evidence). See [prd.md](../../prd.md).

## Files and subfolders
| Path | What it holds | README |
| --- | --- | --- |
| `blackberry/BLACKBERRY_SALES_STOCK_DETAILS_JUNE2026.xlsx` | Blackberry June workbook, five sheets: `SALES`, `SOH`, `OFFER`, `BRAND REPORT`, `BILL SUMMARY` | [blackberry](blackberry/README.md) |
| `blackberry/KDPS LIFE.xlsx` | The brand's stock list for KDPS with an `Offer` tag on each barcode (907 rows) | [blackberry](blackberry/README.md) |
| `mufti/MUFTI_SALES_STOCK_DETAILS_JUNE2026.xlsx` | Mufti June workbook, three sheets: `SALES`, `SOH`, `OFFER` | [mufti](mufti/README.md) |

## How June differs from May

### Blackberry
| Item | May ([data](../monthly-reports-april-may-2026/2026-05/data/README.md)) | June ([blackberry](blackberry/README.md)) |
| --- | --- | --- |
| Sheets | `SALES`, `SOH`, `OFFER` | adds `BRAND REPORT`, `BILL SUMMARY` |
| `SALES` period in header | `From 01-05-2026 to 31-05-2026` | `From 01-06-2026 to 30-06-2026`; data stops at 18 Jun |
| `SALES` lines | 137 (20 Apr to 22 May; 52 lines dated in April) | 77 (1 to 18 Jun) |
| Quantity, `MRP` total | 120, ₹3,91,807 | 71, ₹1,92,149 |
| Bills | 78 (`GAYA` 133 lines, `JSL` 4) | 36 (`GAYA` 76 lines, `JSL` 1) |
| `Dis %` | 0 on every line | typed: 0 (45 lines), 50 (19), 40 (11), 30 (1), 25 (1) |
| `Dis Amount`, `Total` | formulas; discount 0 | typed values; discount -₹47,516.15; `Total` ₹1,44,632.85 |
| POS columns `P` to `R` | present, unlabeled | gone (the POS figures now sit in `Dis %` and `Dis Amount`, inferred) |
| `SOH` rows, quantity | 911, 1,363 | 801, 1,172 |
| `SOH` date | 1 Jun 2026 | 1 Apr 2026 |
| `SOH` Store tag (column `K`) | `GAYA`, `JSL`, `WH`, `VAS-DEO` | none |
| `SOH` brand spelling | three (`BLACKBERRYS`, `BLACKBERRY`, `BLACK BERRY`) | one (`BLACKBERRYS`) |
| `SOH` column order | `Qty.`, `Units`, `MRP`, `Total MRP` | `Qty.`, `MRP`, `Unit`, `Total MRP` |
| `OFFER` | slab list; last row open from 16/02 | the same, with row 13 closed `End Date 11/06`; new row 14 from 12/06: `B1 - 30% / B2 & B3 - 40% / B4 & MORE - 50% / 25%  - 40 % ON WAIST COAT, SUIT AND BLAZER (AMM LIST)` |
| Overlap of `SOH` barcodes | 891 distinct | 714 distinct; 649 also in May, 65 new, 242 May barcodes absent |

### Mufti
| Item | May | June ([mufti](mufti/README.md)) |
| --- | --- | --- |
| `SALES` period in header | `From 01-05-2026 To 31-05-2026` | unchanged (still May) |
| `SALES` lines | 48 (2 to 31 May) | 62 (1 to 18 Jun) |
| Quantity, `Price` total | 44, ₹1,34,556 | 56, ₹1,72,944 |
| Bills | 42 (`LEEDEO` 31 lines, `JSL` 7, `VAS` 6, `GAYA` 4) | 38 (`LEEDEO` 40 lines, `JSL` 10, `SAN` 10, `GAYA` 2) |
| `Dis %` | 0 on every line | typed: 0 (26 lines), 100 (9), 20 (8), 25 (8), 50 (5), 40 (4), 30 (2) |
| `Dis Amt`, `Total` | formulas; discount 0 | typed values; discount -₹48,297.50; `Total` ₹1,24,646.50 |
| POS columns `P` to `R` | present, unlabeled | gone |
| `SOH` | 798 rows, 1,179 pieces, dated 1 Jun 2026 | identical to May in every cell |
| `OFFER` | 23 lines to row 24 (`B2 - G1` from 28 May, no end) | row 24 closed 11 Jun 2026; new row 25 from 12 Jun 2026: `B2 - G2 / B2 - 40% / B1-25%` |
| New sheets | none | none (no brand report or bill summary) |

- Both June files were produced after the May ones with the discount layers filled in by hand or by script: the new `Dis %` values are typed and `Total` is no longer a formula.
- Mufti's June `SOH` is the May stock list unchanged, so the pieces sold in June are still counted in it (all 57 distinct barcodes sold in June are in it). Blackberry's June `SOH` carries a different, shorter list dated 1 Apr 2026.

## Subfolders
- [blackberry](blackberry/README.md)
- [mufti](mufti/README.md)

## Open questions
Full list goes to [open-questions.md](../../data-notes/open-questions.md).
1. Who builds the `BRAND REPORT` and `BILL SUMMARY`, how are they refreshed, and is the report the document sent to the brand or an internal check? Owner: KDPS Owner (P-OWN) and Brand manager (P-BRM). Blocks: brand-report export design (stage 5).
2. Which stock date and source is right for each brand's June `SOH` (Blackberry dated 1 Apr, Mufti equal to May)? Owner: Accounts (P-ACC).
3. The `SALES` header still says May (Mufti) and to 30 Jun (Blackberry) although the data stops at 18 Jun. Is the period meant to be the whole month or the data cut-off? Owner: Accounts.
4. How is a tier such as `B2` or `B4 & MORE` counted: by bill, by day, or by the offer period, and which items qualify? Owner: Brand manager and the brand.
5. What offers did the Mufti lines at 20% and 30% before 12 Jun use? The `OFFER` calendar lists only `B2 - G1` for 28 May to 11 Jun. Owner: Brand manager.
