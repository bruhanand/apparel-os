# 2026-04

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [..](../README.md)

## What this folder is
- The April 2026 Louis Philippe (LP) reports for six Stores, one workbook each (`SALES_VOUCHERS_LP_APRIL2026_<store>.xlsx`), saved on 2 May 2026. Each has a `SALES` list (April 1 to 30) and a `SOH` list (stock on hand, as the POS reports it).
- Each voucher is built one to one from the Store's raw POS export in [DATA](DATA/README.md) (eight raw files, one of them a Banka export that has no voucher). The discount flag in column `O` comes from the AMM list, `16_AMM List dtd 20.01.26.xlsb`, also here.
- Made by KDPS staff (the author is not named). The layout is `FORMAT_SALES_VOUCHERS.xlsx` in the parent folder ([README](../README.md)).
- Notes (not ranked): [offers-and-brand-reports.md](../../../data-notes/offers-and-brand-reports.md) for offers, the AMM list and brand reports; [pos-exports.md](../../../data-notes/pos-exports.md) for the raw POS layouts; [stores-and-codes.md](../../../data-notes/stores-and-codes.md) for Store codes.

## Store and bill-series codes in these files
| Voucher file suffix | Raw file Store | Bill series (`26-27/<series>/n`) | Bills in voucher |
| --- | --- | --- | --- |
| `AS-DEO` | Allen Solly Store, Deoghar (inferred from the sheet names `AS` and `LP2`) | `DEOT` | 28 |
| `BOKARO` | Bokaro | `LBKR` | 54 |
| `DUMKA` | Dumka | `DMK` | 11 |
| `HZB` | Hazaribagh (inferred from the file name `HAZARIBAGH`) | `JSL` | 51 |
| `SANSKAR` | Sanskar | `SAN` | 30 |
| `VAS-DEO` | Vaishnavi Deoghar | `DEO` | 57 |

Store names are read from the file names and from the raw `Store Name` column (`Vaishnavi Deoghar`); the others are inferred. The full code table is in [stores-and-codes.md](../../../data-notes/stores-and-codes.md).

## Files

### The six voucher files: common layout
Every workbook has two sheets and the same header block as `FORMAT_SALES_VOUCHERS.xlsx`.
- **`SALES`**
  - Rows 1 to 3 merged `A:N`: `KDPS LIFESTYLE PVT. LTD.`, `List of Sales Vouchers`, `Voucher Series : LOUIS PHILIPPE  (From 01-04-2026 To 30-04-2026)`. Row 4 holds the 14 headers, data starts in row 5, and a totals row follows the last line. Each workbook was last saved on 2 May 2026.
  - Columns `A` to `N`: `Date`, `Vch/Bill No.`, `Particulars`, `Item Details`, `Brand`, `Size`, `Style Code`, `Barcode`, `Unit`, `Qty.`, `Price`, `Dis %`, `Dis `, `Total`.
  - `Particulars` is `CASH` on every line and `Unit` is `PCS`. `Price` is the POS `Gross Amt` (MRP times quantity). `Dis %` is a typed number (30 or 0, and 100 once). `Dis ` is `=L/100*K` and `Total` is `=K-M`, except where the Dis cell is typed (see the blocks). Returns are negative quantities and negative prices.
  - Column `O` has no header. It holds the AMM flag text `Discount` or `No Discount` on every line. The `discount-audit` skill names this column `Discount Status`, but the delivered files leave `O4` blank.
  - The totals row sums `J`, `K`, `M`, `N` (VAS-DEO also sums `R`).
- **`SOH`**
  - Rows 1 to 3 merged `A:J`: the company line, `List of Stock Details`, and `Voucher Series : LOUIS PHILIPPE (From <date>)`. Row 4: `Date`, `Item Details`, `Barcode`, `Size`, `Style Code`, `Brand`, `Qty.`, `Unit`, `MRP`, `Total MRP`. Data from row 5. `Total MRP` is `=I*G`. The totals row sums `G` and `J`.
  - `Brand` holds the short codes of the LP family (`LP`, `LY`, `LR`, `LA`) mixed with `LOUIS PHILIPPE`. `Unit` is `PCS`.
  - `Date` is one date on (almost) every line, which differs by file (see the blocks): 1 Apr 2026 or 1 May 2026. The header line `(From ...)` also differs: `01-04-2026` on AS-DEO, BOKARO and DUMKA; `01-05-2026` on HZB, SANSKAR and VAS-DEO.
- **Totals across the six `SALES` sheets:** 429 lines, quantity 397, `Price` ₹14,32,688, `Dis` ₹2,82,863.60, `Total` ₹11,49,824.40. Of the 429 lines: `Discount` flag 237, `No Discount` 192; `Dis %` 30 on 222, 0 on 206, 100 on 1.

### `SALES_VOUCHERS_LP_APRIL2026_AS-DEO.xlsx` (37,708 bytes)
- **Raw source.** `AS  & LP2  APR 26 SALE  AND SOH AS-DEO.xlsx`, sheets `LP2 SALE ` and `LP2 SOH ` (note the trailing spaces in the sheet names).
- **`SALES`.** Rows 5 to 39 (35 lines), totals in row 40. Bills `26-27/DEOT/6` to `26-27/DEOT/153` (28 bills). Dates 2 to 26 Apr. Quantity 32 (two returns of -1). `Price` ₹95,902, `Dis` ₹25,519.60, `Total` ₹70,382.40.
  - `Dis %`: 30 on 20 lines, 0 on 14, 100 on one (a backpack at MRP 7,999, so its `Total` is 0). Flags: `Discount` 21, `No Discount` 14.
  - `Dis ` is a formula on every line.
  - Items: T-SHIRT 15, SHIRT 11, JEANS 4, BACKPACK 2, BELT 1, TROUSER 1, TROUSERS 1.
- **Mapping to the raw sheet.**
  - Row order, item, size, style code, quantity and gross match the 35 raw `LP2 SALE ` lines.
  - The raw sheet shows a date and a bill number only on the first line of each bill (5 of its 35 lines); the voucher shows both on all 35 lines.
  - Raw barcodes are rounded to six significant digits (all 213 barcodes in the file's two sale sheets end in seven zeros, for example `8909470000000`). The voucher shows full 13-digit barcodes whose rounded form equals the raw value on all 35 lines. All 32 distinct voucher barcodes are in the raw `AS SOH ` sheet; 16 of them are also in `LP2 SOH `.
  - The brand is written `LOUIS PHILIPPE` on every voucher line; raw has `LOUIS PHILIPPE` 25, `LP` 8, `LY` 2.
- **Reconciliation.** Voucher `Price` ₹95,902 equals raw gross. Voucher `Total` ₹70,382.40; raw `LP2 SALE ` net ₹73,726.90 (POS discount ₹22,175.10). `Dis %` differs from the POS `Disc%` on 16 of 35 lines (the POS shows 0 on 27 lines).
- **`SOH`.** Rows 5 to 340 (336 rows), totals in row 341: quantity 490, `Total MRP` ₹15,10,156. Header `(From 01-04-2026)`. `Date`: 335 rows 1 Apr 2026, the first row 1 May 2026. Brand codes: `LOUIS PHILIPPE` 168, `LP` 148, `LY` 15, `LR` 5. Items: SHIRT 135, T-SHIRT 105, JEANS 61, TROUSER 21, TROUSERS 7, BACKPACK 3, BELT 2, TROLLEY 1, DUFFEL BAG 1. It is the raw `LP2 SOH ` list (all 336 rows, quantity above 0).
- **AMM coverage.** 8 of 35 lines are not in the AMM list and show `No Discount`.

### `SALES_VOUCHERS_LP_APRIL2026_BOKARO.xlsx` (42,919 bytes)
- **Raw source.** `LP Sale with Closing SOH report April 2026_BOKARO.xlsx`, sheet `Sale`. (The `SOH` sheet is not from this Store's raw `Stock` sheet; see below.)
- **`SALES`.** Rows 5 to 94 (90 lines), totals in row 95 (`J`, `K`, `M`, `N`). Frozen at row 68. Bills `26-27/LBKR/3` to `26-27/LBKR/149` (54 bills). Dates 1 to 30 Apr. Quantity 80 (five returns of -1). `Price` ₹2,80,131, `Dis` ₹55,820.30, `Total` ₹2,24,310.70.
  - `Dis %`: 30 on 27 lines, 0 on 63. Flags: `Discount` 29, `No Discount` 61. Two `Discount`-flagged lines have `Dis %` 0: a T-shirt return and the T-shirt line directly above it.
  - `Dis ` is a formula on 29 lines and a typed value on 61 (57 zeros and four duffel bags). The four duffel bags at MRP 7,999 carry a typed `Dis` of 7,850, so each `Total` is ₹149. The `discount-audit` skill describes this as the "promo bag override".
  - Items: SHIRT 38, T-SHIRT 23, TROUSER 14, JEANS 7, DUFFEL BAG 4, BLAZER 2, SUIT 2. Blazers and suits: one blazer at 30%; the other blazer and both suits at 0% with `No Discount`.
- **Mapping to the raw sheet.**
  - The raw file is already a worked sheet, not a plain POS export. It has 13 labelled columns (`Bill Date`, `Bill No`, `Customer`, `Item`, `Brand`, `Size`, `Design No`, `Barcode`, `Qty`, `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount`) plus an unlabeled column `N`, a lookup that reads `Discount`, `No Discount` or `#N/A` (49 lines `#N/A`, because the AMM list was not open).
  - Voucher columns follow it one to one: `Bill Date` to `Date`, `Bill No` to `Vch/Bill No.`, `Design No` to `Style Code`, `Gross Amt` to `Price`, `Disc%` to `Dis %`. `Customer` is `CASH` on every raw line and is not carried. `Disc Amt` and `Net Amount` are dropped but their totals match.
  - Raw totals row 92 sums `Gross Amt`, `Disc Amt` and `Net Amount`; its column `N` shows `#N/A`.
- **Reconciliation.** All 90 lines match the raw lines on barcode, style, quantity, gross and date. `Dis %` equals the raw `Disc%` on all 90. Raw net ₹2,24,310.70 equals the voucher `Total`; raw `Disc Amt` is positive here (₹55,820.30), negative in the other raw files.
- **`SOH`.** Rows 5 to 340 (336 rows): quantity 490, `Total MRP` ₹15,10,156. All dated 1 May 2026; header `(From 01-04-2026)`. It is identical (same barcodes, quantities and MRPs, in the same order) to the AS-DEO `SOH` above, that is the Allen Solly Store's `LP2 SOH `. Bokaro's own raw `Stock` sheet has 694 rows, quantity 1,053, MRP value ₹38,30,842; only 73 of its 694 barcodes appear in this `SOH`.
- **AMM coverage.** 50 of 90 lines are not in the AMM list.

### `SALES_VOUCHERS_LP_APRIL2026_DUMKA.xlsx` (29,596 bytes)
- **Raw source.** `LP_APRIL SALE REPOT_DUMKA.xlsx`, sheet `LP-SALE`; `SOH` from `DUMKA_STOCK DETAILS APRIL2026.xlsx`, sheet `LP`.
- **`SALES`.** Rows 5 to 20 (16 lines), totals in row 21 (`J`, `M`, `N`; no `K` total). Bills `26-27/DMK/4` to `26-27/DMK/69` (11 bills). Dates 2 to 29 Apr. Quantity 16, no returns. `Price` ₹46,968, `Dis` ₹6,471, `Total` ₹40,497.
  - `Dis %`: 30 on 8 lines, 0 on 8. Flags: `Discount` 8, `No Discount` 8. `Dis ` is a formula on every line.
  - Items: T-SHIRT 8, JEANS 4, SHIRT 2, TROUSER 1, DUFFEL BAG 1.
- **Mapping to the raw sheet.** The raw sheet has no header and no discount percentage. Its columns are by position: `A` date, `C` bill number, `E` barcode, `F` brand, `G` item, `H` design number, `I` a constant 0, `J` size, `K` quantity, `L` rate, `M` gross, then a net amount in `N` (13 lines) or in `O` (4 lines; one line has both). Row order, bill, barcode, style, quantity and gross match on all 16 lines.
- **Reconciliation.** `Price` equals raw gross. Voucher `Total` ₹40,497 against a raw net of ₹35,631 (sum of `N` and `O`; one line holds 901 in `N` and 1,498 in `O`, which add to its 2,399 gross). `Dis %` is not comparable because the raw sheet has none.
- **`SOH`.** Rows 5 to 244 (240 rows), totals in row 245: quantity 379, `Total MRP` ₹11,29,578. All dated 1 May 2026; header `(From 01-04-2026)`. Same 240 rows, in order, as the raw `LP` sheet of `DUMKA_STOCK DETAILS APRIL2026.xlsx`, not the 360-row `LP-SOH` ledger sheet of the sale file. Brand codes: `LOUIS PHILIPPE` 119, `LP` 115, `LY` 4, `LR` 2.
- **AMM coverage.** 6 of 16 lines are not in the AMM list.

### `SALES_VOUCHERS_LP_APRIL2026_HZB.xlsx` (58,412 bytes)
- **Raw source.** `LP sales & soh HAZARIBAGH.xlsx`: the 99 Louis Philippe family lines (brand `LOUIS PHILIPPE`, `LP`, `LY`, `LR`) of `Sheet1` (371 lines, all Madura brands); `SOH` from the 587 LP-family rows of `Sheet2` with `Tqty` above 0.
- **`SALES`.** Rows 5 to 103 (99 lines), totals in row 104. Frozen at row 77. Bills `26-27/JSL/42` to `26-27/JSL/901` (51 bills). Dates 2 to 30 Apr. Quantity 92 (four returns). `Price` ₹3,36,894, `Dis` ₹79,910.10, `Total` ₹2,56,983.90.
  - `Dis %`: 30 on 55 lines, 0 on 44. Flags: `Discount` 59, `No Discount` 40. Three of the four returns carry 30% (the `discount-audit` skill says returns get 0).
  - `Dis ` is typed on four lines: four suits (MRP 15,802 and 17,909) have `Dis %` 0 and a typed `Dis` (5,803 and 7,910) so that each `Total` is ₹9,999. The POS gave these lines 30%.
  - Items: SHIRT 38, TROUSER 18, T-SHIRT 18, JEANS 8, SUIT 7, SOCKS 6, BLAZER 3, BACKPACK 1. Two lines have a blank `Size`.
- **Reconciliation.** Row order, bill, barcode, style, quantity and gross match the 99 raw lines. `Price` ₹3,36,894 equals raw gross. Voucher `Total` ₹2,56,983.90; raw net of the 99 lines ₹2,80,091.40. `Dis %` differs from the POS on 50 of 99 lines.
- **`SOH`.** Rows 5 to 591 (587 rows), totals in row 592: quantity 959, `Total MRP` ₹35,61,118. All dated 1 May 2026; header `(From 01-05-2026)`. Same rows, in order, as the raw `Sheet2` selection. Brand codes: `LOUIS PHILIPPE` 345, `LP` 201, `LY` 26, `LR` 15.
- **AMM coverage.** 33 of 99 lines are not in the AMM list.

### `SALES_VOUCHERS_LP_APRIL2026_SANSKAR.xlsx` (19,693 bytes)
- **Raw source.** `SANSKAR LOUIS PHILIPPE SALE REPORT .xlsx`, sheet `Sheet1` (51 lines). The raw file has no stock sheet.
- **`SALES`.** Rows 5 to 55 (51 lines), totals in row 56. Frozen at row 8. Bills `26-27/SAN/34` to `26-27/SAN/1238` (30 bills). Dates 2 to 28 Apr. Quantity 51, no returns. `Price` ₹1,58,891, `Dis` ₹30,286.50, `Total` ₹1,28,604.50.
  - `Dis %`: 30 on 29 lines, 0 on 22. Flags: `Discount` 29, `No Discount` 22. `Dis ` is a formula on every line.
  - Items: TROUSER 16, SHIRT 12, T-SHIRT 11, JEANS 7, BELT 4, BLAZER 1. Rows 54 and 55 are two identical lines (same bill `26-27/SAN/1238`, same barcode); the raw file has both.
- **Reconciliation.** Row order, bill, barcode, style, quantity and gross match all 51 raw lines. `Price` equals raw gross. Voucher `Total` ₹1,28,604.50; raw net ₹1,33,109.50 (raw bill amounts total ₹1,28,240). `Dis %` differs from the POS on 28 of 51 lines (the POS shows 0 on 48 lines).
- **`SOH`.** One data row (row 5), blank formatted rows 6 to 16, totals in row 17: quantity 1, `Total MRP` ₹2,625. Dated 1 May 2026; header `(From 01-05-2026)`. The row is the same barcode, style, size, MRP and brand code as the first row of the HZB `SOH`. No Sanskar stock list is in the raw files.
- **AMM coverage.** 12 of 51 lines are not in the AMM list.

### `SALES_VOUCHERS_LP_APRIL2026_VAS-DEO.xlsx` (80,645 bytes)
- **Raw source.** `LP SALE REPORT & STOCK REPORT APRIL'2026 VAS-DEO.xlsx`, sheets `SALE REPORT` (138 lines) and `STOCK REPORT` (839 rows).
- **`SALES`.** Rows 5 to 142 (138 lines), totals in row 143 (`J`, `K`, `M`, `N`, `R`). Frozen at row 20. Bills `26-27/DEO/1` to `26-27/DEO/374` (57 bills). Dates 1 to 30 Apr. Quantity 126 (six returns). `Price` ₹5,13,902, `Dis` ₹84,856.10, `Total` ₹4,29,045.90.
  - Extra columns, unlabeled: `O` the AMM flag; `P` the POS `Disc%`; `Q` the POS `Disc Amt` (negative); `R` the POS `Net Amount`. The sum of `R` is ₹3,06,131.35 (the raw net).
  - `Dis %`: 30 on 83 lines, 0 on 55. Flags: `Discount` 91, `No Discount` 47. Eight `Discount`-flagged lines have `Dis %` 0: five suits and three backpacks. All six returns carry 30%.
  - `Dis ` is typed on five suit lines (`Dis` 5,803 or 3,000, so `Total` ₹9,999 on MRP 15,802 or 12,999); on two of the 12,999 lines the POS billed ₹7,999.
  - Twenty promo bag lines (DUFFEL BAG and BACKPACK, style codes starting `LPPROMO`) show `Dis` 0 and so a `Total` equal to the MRP (₹3,999 to ₹10,534), while the POS billed ₹99 to ₹299 on most of them (one at 60%, one at 100%). Here the voucher `Total` does not follow the POS net.
  - `Brand` keeps the raw codes: `LOUIS PHILIPPE` 89, `LP` 44, `LR` 3, `LY` 2.
  - Items: T-SHIRT 36, SHIRT 35, JEANS 26, DUFFEL BAG 15, TROUSER 12, SUIT 6, BACKPACK 5, BLAZER 3.
- **Reconciliation.** Row order, bill, barcode, style, quantity and gross match all 138 raw lines. `Price` equals raw gross. Voucher `Total` ₹4,29,045.90 against raw net ₹3,06,131.35. `Dis %` differs from the POS on 34 of 138 lines.
- **`SOH`.** Rows 5 to 843 (839 rows), totals in row 844: quantity 1,178, `Total MRP` ₹40,87,960. Dated 1 May 2026; header `(From 01-05-2026)`. Same rows, in order, as the raw `STOCK REPORT`. The raw sheet ends with a merged note row `NOTE: 19 PCS JEANS SHORT`, which is not carried. Brand codes: `LOUIS PHILIPPE` 819, `LP` 19, `LA` 1.
- **AMM coverage.** 44 of 138 lines are not in the AMM list.

### Reconciliation at a glance
| Store | Lines | Raw gross (equals voucher `Price`) | Raw POS net | Voucher `Total` | `Dis %` differs from POS `Disc%` |
| --- | --- | --- | --- | --- | --- |
| AS-DEO | 35 | ₹95,902 | ₹73,726.90 | ₹70,382.40 | 16 of 35 |
| BOKARO | 90 | ₹2,80,131 | ₹2,24,310.70 | ₹2,24,310.70 | 0 of 90 |
| DUMKA | 16 | ₹46,968 | ₹35,631 (no `Disc%` in raw) | ₹40,497 | not comparable |
| HZB | 99 | ₹3,36,894 | ₹2,80,091.40 | ₹2,56,983.90 | 50 of 99 |
| SANSKAR | 51 | ₹1,58,891 | ₹1,33,109.50 | ₹1,28,604.50 | 28 of 51 |
| VAS-DEO | 138 | ₹5,13,902 | ₹3,06,131.35 | ₹4,29,045.90 | 34 of 138 |

- Gross, row order, barcode, style and quantity match on all six. Bill and date match wherever the raw line carries them (AS-DEO's raw sheet carries them on 5 of 35 lines; its raw barcodes are rounded). Only `Dis %` and so `Total` change.
- The voucher `Total` is the AMM-flag and offer calculation (30% on `Discount` lines) rather than the POS net. It equals the POS net only in Bokaro, whose raw file already had that calculation. These totals are not receipts; no file reconciles them with bank or settlement (OPEN).
- The offer rate of 30% matches the "Buy 1 - Get 30%" line of the Louis Philippe offer email picture saved at `Q&A-req-recieved/BRAND OFFERS/LOUIS PHILLIPE/LP APRIL.jpeg` (from 4 Feb, all categories except winter wear, tagged `AMM`; see [LOUIS PHILLIPE](../../Q&A-req-recieved/BRAND%20OFFERS/LOUIS%20PHILLIPE/README.md)). The suit lines that carry a flat ₹9,999 follow, probably, the "Flat 9999 (MRP between 13001 to 18000)" suit line of the same picture, which starts 11 Apr (inferred; the lines at MRP 12,999 fall in a different band of that picture, OPEN). The rate is not stored in any workbook here (the `discount-audit` skill expects an `Offers` sheet).
- The skills are dated 31 May 2026, after these vouchers (2 May). They describe the method and a reference sheet (`refSale`), not necessarily how each April file was built. See [2026-05](../2026-05/README.md).

### `16_AMM List dtd 20.01.26.xlsb` (2,959,413 bytes)
- **What it is.** The AMM list, "dated 20.01.26" and numbered 16 in its file name. It is a list of Louis Philippe family style codes with a flag that says whether the style is eligible for the brand's discount offers. The letters AMM are not explained anywhere in the files (OPEN). The LP offer email picture tags offers as `AMM` or `NON AMM`, so the flag works as the offer-eligibility list (inferred). Who owns it and how often it is refreshed are not stated. Real format: Excel binary workbook (`.xlsb`), saved 2 Apr 2026.
- **Sheet.** One sheet, `Stylecode`: 77,913 rows (a header and 77,912 styles), 11 columns, all rows full width.
- **Columns, in order.**

| Col | Header | Content |
| --- | --- | --- |
| A | `Sl.No` | 1 to 77,912, no gaps |
| B | `Div` | Division code, 15 values: `LP` 38,094, `LY` 24,966, `LR` 12,377, `LX` 1,724, `LA` 671, `LT` 42, `LS` 17, `LU` 7, `Lp` 5, `Ly` 3, `LB` 2, and one each of `LK`, `LE`, `LQ`, `LV` |
| C | `Product` | 60 values with `FG` (finished goods) prefix, some in mixed case: `FGSHIRT` 38,054, `FGTROUSER` 10,640, `FGTSHIRT` 8,581, `FGJEANS` 3,606, `FGSWSHIRT` 2,013, `FGSUIT` 1,815, `FGJACKET` 1,649, `FGBLAZER` 1,502, `FGSWEATER` 1,296, `FGSOCKS` 1,242, `FGSHOES` 1,202, `FGTIE` 1,181, `FGBELT` 1,021, `FGShirt` 741, `FGWALLET` 517, and more |
| D | `Style codes` | 77,912 distinct style codes (13 to 15 characters mostly; 3,101 end in `Q`) |
| E | `MRP` | 245 distinct values, 0 (16 rows) to 39,999; 1,999 on 7,111 rows, 2,499 on 7,103 rows |
| F | `Discount/No Discount` | `Discount` 77,459, `No Discount` 453 |
| G | `Season` | 55 values, below |
| H | `As on 20th Jan'26` | The reason or status as on 20 Jan 2026, below |
| I | `Q code` | The style code with `Q` appended on every row |
| J | `Ref.` | Free-text source note, below |
| K | `Q code` (second, same title) | Repeats the flag (`Discount` or `No Discount`) on every row, equal to `F` |

- **Divisions and style prefix.** The first two letters of the style code equal `Div` on 77,292 rows. On 620 rows they differ (317 `LY` styles under `Div` `LP`, 99 `LS`, 79 `LR`, 58 `LT`, 37 `LX` and others), so `Div` is not a reliable key. No style code is repeated (also case-insensitively).
- **Reasons (`As on 20th Jan'26`).** Typos as in the file.

| Reason | Rows | Flag in `F` |
| --- | --- | --- |
| `Discount` | 77,315 | `Discount` |
| `TR Line - No Discount` | 214 | `No Discount` |
| `Core -No Discount` | 144 | `No Discount` |
| `Added back to Disocunt` | 144 (all `FGJEANS`) | `Discount` |
| `Iconic Trousers-Discontinued from AMM` | 50 | `No Discount` |
| `Festive Rebuy-Discountinued from AMM` | 45 | `No Discount` |

  The 453 `No Discount` rows are SHIRT 207, TROUSER 188, JEANS 24, SUIT 16 (reason `Core -No Discount`), BLAZER 14 and T-SHIRT 4; by division `LP` 345, `LR` 73, `LY` 35. The other 1,810 suit rows are `Discount`.
- **Seasons.** 55 spellings. The largest: `Spring Summer 2020` 17,710, `Autumn Winter 2021` 7,976, `Autumn Winter 2020` 6,639, `Autumn Winter 2024` 5,871, `Spring Summer 2024` 5,648, `Autumn Winter 2022` 5,588, `Autumn Winter 2023` 5,176, `Spring Summer 2022` 4,908, `Spring Summer 2025` 4,532, `Autumn Winter 2025` 3,506, `Spring Summer 2023` 2,911, `Spring Summer 2021` 2,096. Others run from `Spring Summer 2006` to `Autumn Winter 2026`. `Spring Summer 2026` has 9 rows and `Autumn Winter 2026` 1. Also `CORE` 1,449, `Autumn Winter 2021 Core` 401, `Old Core` 260, `OLDCORE` 4, `NA` 78, `FG` 3, `AW10` 2, two stray labels (`Season - G - Jul`, `Season - V - Aug`) and 57 blank or zero.
- **`Ref.`.** Blank on 65,481 rows. Free text on 11,631 rows, mostly "Added as per mail from <a brand-side person> dated ..." or an approval note; the most common: 3,130 rows from one December 2024 mail, 1,561 from a November mail, 1,495 from a 16 Jun 2025 mail, 1,317 "Inwarded till Mar'25 ... approval ... 17th Jun'25" (some rows with typos such as `Jun'34`), 1,145 and 152 from a 24 May 2025 mail, 913 from a 5 Jun 2025 note, plus `Core Jeans` 164, `ICONIC Trousers` 99, and 45 "Festive Codes Rebuy" (12 Jan 2026). Names of the people in the notes are not copied here. 800 rows hold an Excel date serial instead of text (1 Apr 2025 to 19 Jun 2025).
- **How it is used.** In each April voucher, column `O` is `IFERROR(VLOOKUP($G5,'[16_AMM List dtd 20.01.26.xlsb]Stylecode'!$D$2:$F$77913,3,0),"No Discount")` (from the `discount-audit` skill): match the voucher style code to column `D`, return column `F`, and show `No Discount` when not found. The workbook had to be open; where it was not (Bokaro raw), the cell showed `#N/A`.
- **Coverage gap.**
  - 153 of the 429 April voucher lines (36%, 75 of the 254 distinct style codes) are not in the list and so show `No Discount`: AS-DEO 8, BOKARO 50, DUMKA 6, HZB 33, SANSKAR 12, VAS-DEO 44.
  - Of the 153: 23 bag lines (duffel bags and backpacks, promo style codes starting `LPPROMO`), 6 sock lines (style `LP249`), and 124 clothing lines (shirts 55, T-shirts 51, trousers 13, jeans 2, suits 2, blazer 1). The other 39 `No Discount` lines are in the list and flagged `No Discount` there.
  - Matched lines are mostly older seasons (`Autumn Winter 2025` 104 lines, `Spring Summer 2024` 61, `Spring Summer 2025` 55, `CORE` 21); only one matched line is `Spring Summer 2026`. The list is dated 20 Jan 2026 and holds just 10 rows for the 2026 seasons, so newer styles sold in April are probably missing because the list is out of date (inferred).
  - Whether a style missing from the list should get the offer or not is not defined (OPEN).
- **Notes.** [offers-and-brand-reports.md](../../../data-notes/offers-and-brand-reports.md).

## Subfolders
- [DATA](DATA/README.md): the eight raw POS export files these vouchers were built from.

## Open questions
Full list goes to [open-questions.md](../../../data-notes/open-questions.md).
1. What does AMM stand for, who owns the list (the brand or KDPS), how often is it refreshed, and what is the rule for a style that is missing from it (36% of April lines)? Owner: KDPS Owner (P-OWN) and Brand manager (P-BRM). Blocks: offer-eligibility design for brand claims (stage 5).
2. Where do the Louis Philippe offer rates and dates come from, which lines take the flat suit prices, and why do some suit and promo-bag lines carry typed discounts? Owner: KDPS Owner and Accounts (P-ACC).
3. Is a voucher `Total` meant to equal the POS net, or the brand's offer calculation? Is it checked against receipts, bank settlement or credit notes? Owner: Accounts and CA (P-CHA).
4. Should `SOH` be dated the first of the reporting month (opening) or the first of the next month (closing)? The files use 1 Apr and 1 May. Owner: Accounts.
5. Is Bokaro's `SOH` meant to be the Allen Solly Store's `LP2 SOH `? Where is Sanskar's stock list? Owner: KDPS Owner.
6. Which POS software does each Store use? Can the exports keep the bill number and date on every line and give unrounded 13-digit barcodes (Allen Solly Store's exports are rounded)? Owner: product owner with KDPS Owner.
