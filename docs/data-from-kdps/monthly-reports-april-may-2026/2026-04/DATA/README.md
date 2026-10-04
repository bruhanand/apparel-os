# DATA

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [..](../README.md)

## What this folder is
- The eight raw POS export files from which the April 2026 Louis Philippe vouchers in the parent folder were built ([2026-04](../README.md)). Each is a Store's sales lines and stock list for April 2026 as exported from the earlier POS and then lightly edited by hand. Saved 1 to 2 May 2026.
- Seven Stores are covered. Banka's export is here too, but no Banka voucher exists (its sales are not Louis Philippe).
- The exports come from at least four POS output families (see "Layouts" below). Column names are shared across most of them (`Bill Date`, `Bill No`, `Item`, `Brand`, `Design No`, `Barcode`, `Qty`, `Gross Amt` and so on); the sets of columns and the sheet layouts differ.
- Raw layouts in detail: [pos-exports.md](../../../../data-notes/pos-exports.md) (and the machine-readable [pos-export-layouts.json](../../../../data-notes/pos-export-layouts.json)). Store and bill-series codes: [stores-and-codes.md](../../../../data-notes/stores-and-codes.md). Offers and AMM: [offers-and-brand-reports.md](../../../../data-notes/offers-and-brand-reports.md).
- Sensitive content (described, not copied): customer names and phone numbers; salesperson names; tender split; supplier names and purchase rates in the stock sheets. See each block.

## Layouts at a glance
| File | Store | Sheets | Sale lines | Bills | Sale layout | Stock layout |
| --- | --- | --- | --- | --- | --- | --- |
| `APR SALE & STOCK REPORT BANKA.xlsx` | Banka (`VAB`) | `sale report`, `STOCK REPORT`, `Sheet3` | 1,586 | 566 | 19 columns from `B`, no customer or tender | ledger, 14 columns with `Store Name` |
| `AS  & LP2  APR 26 SALE  AND SOH AS-DEO.xlsx` | Allen Solly Store, Deoghar (`DEOT`) | `AS SALE `, `AS SOH `, `LP2 SALE `, `LP2 SOH ` | 178 + 35 | 42 + 5 headed | 25 columns from `B`, bill header on first line of a bill | ledger, 14 columns |
| `DUMKA_STOCK DETAILS APRIL2026.xlsx` | Dumka (`DMK`) | `VH`, `PE`, `LP`, `AS` | none | none | none | stock details with supplier and cost, 14 columns |
| `LP SALE REPORT & STOCK REPORT APRIL'2026 VAS-DEO.xlsx` | Vaishnavi Deoghar (`DEO`) | `SALE REPORT`, `STOCK REPORT`, `Sheet3` | 138 | 57 | 15 columns | minimal, 8 columns |
| `LP Sale with Closing SOH report April 2026_BOKARO.xlsx` | Bokaro (`LBKR`) | `Sale`, `Stock` | 90 | 54 | 13 columns plus a flag | minimal, 7 columns |
| `LP sales & soh HAZARIBAGH.xlsx` | Hazaribagh (`JSL`) | `Sheet1`, `Sheet2` | 371 | 105 | 25 columns | stock details with supplier and cost |
| `LP_APRIL SALE REPOT_DUMKA.xlsx` | Dumka (`DMK`) | `AS-SALE`, `LP-SALE`, `VH-SALE`, `AS-SOH`, `LP-SOH`, `VH-SOH` | 71 (+ 16 + 8 copies) | 43 | headerless, 15 positions | ledger, headerless |
| `SANSKAR LOUIS PHILIPPE SALE REPORT .xlsx` | Sanskar (`SAN`) | `Sheet1`, `Sheet2`, `Sheet3` | 51 | 30 | 25 columns from `B` | none |

- All sale lines are dated 1 to 30 Apr 2026 and use bill series `26-27/<series>/n`.
- `Disc Amt` is negative in every raw file except Bokaro, where it is positive; Dumka has no discount column at all.
- Store names are read from file names and the `Store Name` column; "Allen Solly Store, Deoghar" and "Hazaribagh" are inferred from file and sheet names.

## Column sets used in these files
- **Sale, 25 columns (AS-DEO, HZB, Sanskar):** `Bill Date`, `Bill No`, `Customer`, `Phone`, `Item`, `Brand`, `Color`, `Size`, `Design No`, `Barcode`, `SalesMan`, `Sub Category`, `Gender`, `Fit`, `season`, `Qty`, `Rate`, `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount`, `Bill Amount`, `Cash`, `Card`, `Credit`.
- **Sale, 19 columns (Banka):** the 25 above without `Customer`, `Phone`, `Bill Amount`, `Cash`, `Card` and `Credit`.
- **Sale, 15 columns (VAS-DEO):** `Bill Date`, `Bill No`, `Customer`, `Phone`, `Item`, `Brand`, `Size`, `Design No`, `Barcode`, `Qty`, `Rate`, `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount`.
- **Sale, 13 columns (Bokaro):** `Bill Date`, `Bill No`, `Customer`, `Item`, `Brand`, `Size`, `Design No`, `Barcode`, `Qty`, `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount`, plus one unlabeled flag column.
- **Stock ledger (AS-DEO, Dumka sale file):** `Date`, `Bill no`, `Barcode no`, `Brand`, `Product`, `Style code`, `Season`, `Size`, `Stock Opening Qty`, `Stock Inward`, `Qty Sold`, `Till Date Qty`, `MRP`, `Total MRP` (Dumka's has no header row). Banka's version has `Store Name` in place of `Season`.
- **Stock details (HZB `Sheet2`, `DUMKA_STOCK`):** `Item Name`, `Brand`, `Size`, `Supplier`, `Barcode`, `Design No`, `Category`, `Gender`, `Fit`, `Season`, `Tqty`, `Mrp`, `Rate`, `Amount`.
- **Minimal stock:** Bokaro `Stock`: `Item Name`, `Brand`, `Design`, `Size`, `Barcode`, `Tqty`, `Mrp`. VAS-DEO `STOCK REPORT`: `Barcode no`, `Brand`, `Product`, `Style code`, `Store Name`, `Size`, `Till Date Qty`, `MRP`.
- Common to the ledger sheets: `Till Date Qty` equals `Stock Opening Qty` plus `Stock Inward` less `Qty Sold` on every Banka row; `Total MRP` is `MRP` times `Till Date Qty` on every AS-DEO row.

## Files

### `APR SALE & STOCK REPORT BANKA.xlsx` (1,070,578 bytes)
- **Store.** Banka, store name `Vaishnavi Banka` (stock sheet), bill series `26-27/VAB/n`. Not a Louis Philippe Store: the brands are mostly other people's labels (221 brand spellings). No voucher was built from this file.
- **Sheet `sale report`** (`A1:T1591`). Column `A` is blank; the header is in `B1:T1` (19 columns, see above), autofilter `B1:T1588`.
  - 1,586 sale lines (rows 2 to 1587), 566 bills `26-27/VAB/1` to `26-27/VAB/566`, dates 1 to 30 Apr 2026. Quantity 1,631 (29 return lines). Gross ₹22,17,929; discount -₹4,16,979.55; net ₹18,00,949.45.
  - Totals appear twice: row 1588 and again row 1591 (quantity, gross, discount, net, the same figures), with blank rows 1589 and 1590 between.
  - `Disc%`: 0 on 1,411 lines, 100 on 56 (giveaways or free items), 10 on 45, 50 on 26, 70 on 24, 20 on 12, 40 on 6, 30 on 3, and 25, 55, 60 once each.
  - Brands: the top are `VAN HEUSEN` 118 lines, `INTEGRITI` 107, `U. S. POLO INNERWEAR` 73, `JOCKEY` 59, `CUCUMBER` 50, `YOUNG WING` 50, `OXEMBERG` 49, `US POLO` 46, `VIMAL` 42, `ARROW` 30, `SPYKAR` 27. Flying Machine appears under three spellings: `FLYING MACHINE` 24, `FM` 20, `V FLYING MACHINE` 16 (60 lines, quantity 55, gross ₹1,45,094, net ₹1,12,018). No Louis Philippe line.
  - Items: T-SHIRT 217, SHIRT 180, JEANS 158, SAREE 104, VEST 59, SET 56, SOCKS 48, KURTI SET 46, SUIT 44, PETTICOAT 42, BRIEF 40, LOWER 39, BABA SUIT 38, KURTA 36, TROUSER 36.
  - Quirks: `Sub Category` blank on 1,020 lines; `season` is text on 1,213 lines, a date (text coerced into a date, such as `2026-12-24`) on 295 and blank on 78 (text such as `SS-25`, `SS25`, `SPRING SUMMER(Mar-26)` mixed); `Gender` has inconsistent spellings (`KIDS MALE`, `KIDSM`, `KIDM`, `KIDEM`, `FEAMAL`, `ACCE`, `ASSO.`); barcodes are numbers on 1,436 lines and text on 150, of lengths 13 (768), 7 (612), 5 (62) and others, so non-EAN internal codes are mixed in. `SalesMan` is present (6 distinct names). No customer or tender columns.
- **Sheet `STOCK REPORT`** (`A1:N12178`, autofilter on all). Ledger layout with header in row 1: `Date`, `Bill no`, `Barcode no`, `Brand`, `Product`, `Style code`, `Store Name`, `Size`, `Stock Opening Qty`, `Stock Inward`, `Qty Sold`, `Till Date Qty`, `MRP`, `Total MRP`.
  - 12,177 rows, `Store Name` is `Vaishnavi Banka` on all. `Date` from 24 Dec 2021 to 29 Apr 2026 (the inward date of the receipt; 917 rows are April 2026, 1,549 March 2026, 1,305 February 2026).
  - Sums: opening 13,639, inward 16,511, sold 8,379, till date 21,771; `Total MRP` ₹3,22,46,669. No row has a negative or zero till-date quantity. Barcodes: 11,119 numbers and 1,058 text (such as `ATG0009X`); none repeated. 599 distinct brands.
  - `Bill no` is the inward document. Labels include `WH...` (warehouse, 5,927 rows), `DEO` 605, `LEEDEO` 237, `DMK\S-35`, `DMK\S-49`, `DEOT`, `BGP`, `SGMR`, plus `Scan Stock` 105 rows and `Audit Differance` 78 rows (typo as in the file), and plain numbers.
  - `Stock Opening Qty` is blank on 6,664 rows and `Stock Inward` on 4,513.
- **Sheet `Sheet3`.** Empty.
- **Used by.** No voucher. The sale sheet is the largest sample of the Banka POS layout (no customer or tender columns).

### `AS  & LP2  APR 26 SALE  AND SOH AS-DEO.xlsx` (534,108 bytes; two spaces after `AS` and before `AND`)
- **Store.** The sheet names (`AS`, `LP2`) and bill series `26-27/DEOT/n` point to the Allen Solly Store in Deoghar, which also stocks Louis Philippe (inferred). Sheets keep trailing spaces in their names: `AS SALE `, `AS SOH `, `LP2 SALE `, `LP2 SOH `.
- **Sheets `AS SALE ` (`B1:Z179`) and `LP2 SALE ` (`B1:Z36`).** The 25-column sale layout, starting in column `B`, header in row 1, no autofilter.
  - `AS SALE `: 178 lines, quantity 175 (two returns), gross ₹5,45,622, discount -₹1,64,718.55, net ₹3,80,903.45. Brands: `ALLEN SOLLY` 142, `AS` 29, `AL` 7. Items: SHIRT 67, T-SHIRT 39, JEANS 26, BAG 16, TROUSER 13, BLAZER 5, BACKPACK 5, TROUSERS 2. `Disc%`: 0 on 114, 30 on 34, 20 on 26, and one each at 5, 10, 50 and 100.
  - `LP2 SALE `: 35 lines, quantity 32 (two returns), gross ₹95,902, discount -₹22,175.10, net ₹73,726.90. Brands: `LOUIS PHILIPPE` 25, `LP` 8, `LY` 2. Items: T-SHIRT 15, SHIRT 11, JEANS 4, BACKPACK 2, BELT 1, TROUSER 1, TROUSERS 1. `Disc%`: 0 on 27, 30 on 4, 20 on 2, 10 on 1, 100 on 1.
  - **Bill header on the first line only.** `Bill Date`, `Bill No`, `Customer`, `Phone`, `Sub Category`, `Bill Amount`, `Cash`, `Card`, `Credit` are filled only on the first line of each bill. In `AS SALE ` 42 of 178 lines carry them (all bills `26-27/DEOT/n`, dates 2 to 30 Apr); in `LP2 SALE ` 5 of 35 (3 to 24 Apr). The sheets begin with lines that have no header at all. The bill amounts on the 42 header lines total ₹1,19,943 (cash ₹73,495, card ₹46,448, credit 0), far below the line net, so bill-level fields are missing for most bills (inferred). On `LP2 SALE ` the five bill amounts total ₹12,958, all cash.
  - **Barcodes are rounded.** All 213 sale barcodes (178 + 35) are 13-digit numbers ending in seven zeros (for example `8909470000000` or `8909240000000`): they keep six significant digits only, a spreadsheet float artefact. Sale lines therefore cannot be matched to stock by barcode.
  - `Customer` (name) is present on the header lines (and `Phone` on 20 of the 42 in `AS SALE `, 3 of 5 in `LP2 SALE `); `SalesMan` is present on 105 of 178 and 16 of 35 lines (2 distinct names in each sheet). `season` mixes text (`SPRING SUMMER(Jan-26)`) with dates (29 lines in `AS SALE `).
- **Sheet `AS SOH `** (`A1:N10372`). The stock ledger of the whole Store, not only Allen Solly: 14 columns (`Date`, `Bill no`, `Barcode no`, `Brand`, `Product`, `Style code`, `Season`, `Size`, `Stock Opening Qty`, `Stock Inward`, `Qty Sold`, `Till Date Qty`, `MRP`, `Total MRP`).
  - 7,246 rows carry a barcode (rows 2 to 7247); rows below are blank rows with zero formulas. Sums: opening 5,543, inward 7,882, sold 10,280, till date 3,145 (2,121 rows above 0; one row negative), `Total MRP` ₹92,42,700 (equals `MRP` times till date on every row).
  - `Date` is stored as a plain number (an Excel serial without date format) on 7,025 rows (3 Aug 2024 to 18 Apr 2026) and blank on 221. `Bill no` includes `Opening Stock` (14 rows, dated 3 Aug 2024), `Audit Diff` (23), `25-26/...` (4,440), `WH...`, `DEO\S-31`, `DMK\S-115`, `MSF...` document numbers, and blank on 69 rows. `Season` holds a date number (`45717`, 1 Mar 2025) on 282 rows and is otherwise blank.
  - 37 brands: `ALLEN SOLLY` 1,805, `LEVIS` 1,374, `TURTLE` 856, `AS` 844, `LP` 421, `DLEVIS` 372, `V LEVIS` 234, `AL` 221, `LOUIS PHILIPPE` 218, `VAN HEUSEN` 156, `VH` 136, `AT` 91 and others.
- **Sheet `LP2 SOH `** (`A1:N337`, autofilter all). The Louis Philippe part of the ledger: 336 rows, same columns. Opening 50, inward 562, sold 122, till date 490 (all rows above 0), `Total MRP` ₹15,10,156. `Date` (number) 2 Sep 2025 to 17 Apr 2026. `Bill no`: `25-26/...` 330 rows (`25-26/DEO/S-133` on 101 rows, `25-26/DEO/S-24` on 55, others from `WH`, `JSL`, `LBKR`), `26-27/...` 6. Brands: `LP` 160, `LOUIS PHILIPPE` 150, `LY` 20, `LR` 5, `LA` 1. `Season` blank on all rows. Barcodes are complete 13-digit numbers. `Qty Sold` here (122) is cumulative, not April only (the April `LP2 SALE ` quantity is 32).
- **Sensitive content.** Customer names and phone numbers, salesperson names (both present), tender split.
- **Used by.** The `AS-DEO` voucher (`LP2 SALE `, `LP2 SOH `) and, unchanged, the `BOKARO` voucher's `SOH` sheet.

### `DUMKA_STOCK DETAILS APRIL2026.xlsx` (96,153 bytes)
- **Store.** Dumka (file name). No sale lines.
- **Sheets** (header in row 1, 14 columns: `Item Name`, `Brand`, `Size`, `Supplier`, `Barcode`, `Design No`, `Category`, `Gender`, `Fit`, `Season`, `Tqty`, `Mrp`, `Rate`, `Amount`; autofilters on `PE`, `LP`, `AS` run to column `W`).

| Sheet | Rows | `Tqty` | MRP value (`Tqty` times `Mrp`) | Purchase `Amount` | Suppliers |
| --- | --- | --- | --- | --- | --- |
| `VH` | 319 | 542 | ₹10,72,977 | ₹7,80,783.82 | `ADITYA BIRLA LIFESTYLE BRANDS LIMITED` 139 rows, `C2D VENTURES LLP` 84, `MADURA PVT LTD` 72, `SUSHILA ENTERPRISES IH` 16, `JAIN SONS` 6, one each `SUSHILA ENTERPRISES SPORTS` and `KDPS LIFESTYLE PVT LTD (DEOGHAR)` |
| `PE` | 18 | 24 | ₹1,41,851 | ₹98,832.86 | `MADURA PVT LTD` 10, `ADITYA BIRLA FASHION LTD` 7, `SANSKAR RETAIL` 1 |
| `LP` | 240 | 379 | ₹11,29,578 | ₹7,14,803.47 | `ADITYA BIRLA LIFESTYLE BRANDS LIMITED` 230, `MADURA PVT LTD` 10 |
| `AS` | 556 | 798 | ₹27,92,709 | ₹18,45,145.25 | `ADITYA BIRLA LIFESTYLE BRANDS LIMITED` 342, `MADURA PVT LTD` 195, `WILSON PRINTS` 9, `JAIN SONS` 6, `KDPS LIFESTYLE PVT LTD (DEOGHAR)` 4 |

- **Details.**
  - `VH` items: SHIRT 84, JEANS 54, T-SHIRT 35, TROUSER 31, BRIEF 28, LOWER 25 (a Van Heusen range with innerwear). `PE` items: SUIT 10, TROUSERS 8. `LP` items: SHIRT 119, T-SHIRT 51, JEANS 43, TROUSER 24, DUFFEL BAG 2, BACKPACK 1. `AS` items: SHIRT 272, JEANS 71, TROUSER 70, T-SHIRT 42, TROUSERS 36, SWEATSHIRT 26.
  - `Season` mixes text (`AUTUMN WINTER(Jan-26)`, `AW-24`, a text date `29-04-2025`) with real dates (text coerced into a date: `VH` 35 rows, `PE` 17, `LP` 3, `AS` 57). `Category` values mix words (`CASUAL WEAR`) with codes (`USM`, `UTM`, `USP`, `SUTM`).
  - `Rate` is the purchase rate (cost per piece), below `Mrp`; `Amount` is `Tqty` times `Rate`. Cost values are not copied here; only the aggregates above.
  - Quantity per row is 1 on most rows. No barcode is repeated within a sheet.
- **Used by.** The `DUMKA` voucher's `SOH` sheet (the `LP` sheet, all 240 rows).

### `LP SALE REPORT & STOCK REPORT APRIL'2026 VAS-DEO.xlsx` (63,369 bytes; the file name has an apostrophe)
- **Store.** Vaishnavi Deoghar (`Store Name` in the stock sheet), bill series `26-27/DEO/n`. The report is for Louis Philippe.
- **Sheet `SALE REPORT`** (`A1:O139`). 15 columns, header in row 1.
  - 138 lines (rows 2 to 139), 57 bills `26-27/DEO/1` to `26-27/DEO/374`, 1 to 30 Apr. Quantity 126 (six returns). `Rate` sums to ₹5,46,494 (not meaningful with returns); gross ₹5,13,902; discount -₹2,07,770.65; net ₹3,06,131.35.
  - Brands: `LOUIS PHILIPPE` 89, `LP` 44, `LR` 3, `LY` 2. Items: T-SHIRT 36, SHIRT 35, JEANS 26, DUFFEL BAG 15, TROUSER 10, SUIT 6, BACKPACK 5, BLAZER 3, TROUSERS 2.
  - `Disc%`: 0 on 70, 30 on 53, 20 on 11, 100 on 2, 25 and 60 once each.
  - `Customer` is on the 57 header lines (45 distinct names), `Phone` on 40; neither on the other 81 lines. Names and numbers are present and not copied. There is no salesperson or tender column.
  - Promo bags: 20 lines for duffel bags and backpacks, style codes starting `LPPROMO` (`LPPROMOTBAG`, `LPPROMOBGPK`, `LPPROMODBG`), MRP ₹3,999 to ₹10,534, billed at `Net Amount` ₹99 to ₹299 on most (a flat `Disc Amt`), one at 60% and one at 100%.
- **Sheet `STOCK REPORT`** (`A1:H841`). Minimal layout, header in row 1: `Barcode no`, `Brand`, `Product`, `Style code`, `Store Name`, `Size`, `Till Date Qty`, `MRP`.
  - 839 rows, `Store Name` `Vaishnavi Deoghar` on all. Quantity 1,178, MRP value ₹40,87,960. Brands: `LOUIS PHILIPPE` 819, `LP` 19, `LA` 1. Items: SHIRT 268, T-SHIRT 215, JEANS 161, TROUSER 130, SUIT 26, BLAZER 23, SHOES 4, DUFFEL BAG 4, and others. Quantity per row: 1 (577 rows), 2 (232), 3 (19), 4 (7), 15 (2), 5 (1), 17 (1). No barcode is repeated.
  - Row 841 is a merged note `NOTE: 19 PCS JEANS SHORT` (`A841:H841`); its meaning is not stated.
- **Sheet `Sheet3`.** Empty.
- **Used by.** The `VAS-DEO` voucher.

### `LP Sale with Closing SOH report April 2026_BOKARO.xlsx` (46,284 bytes)
- **Store.** Bokaro (file name), bill series `26-27/LBKR/n`. Louis Philippe only.
- **Sheet `Sale`** (`A1:N92`). 13 labelled columns (`A` to `M`) and an unlabeled column `N`.
  - 90 lines (rows 2 to 91), 54 bills `26-27/LBKR/3` to `26-27/LBKR/149`, 1 to 30 Apr. Quantity 80 (five returns). Gross ₹2,80,131; `Disc Amt` +₹55,820.30 (positive); net ₹2,24,310.70. `Customer` is `CASH` on every line; no phone, salesperson or tender.
  - `Disc%` is 30 on 27 lines and 0 on 63. Four duffel bags at MRP 7,999 have `Disc%` 0 and `Disc Amt` 7,850 (net ₹149). Items: SHIRT 38, T-SHIRT 23, TROUSER 14, JEANS 7, DUFFEL BAG 4, BLAZER 2, SUIT 2.
  - The values are typed numbers (no formulas in the data rows). Column `N` is a lookup result (`Discount` 29, `No Discount` 11, `#N/A` 49, one blank): it holds pasted values, and `#N/A` where the AMM list was not open (inferred). Row 92 is a totals row with `=SUM(J2:J91)`, `=SUM(L2:L91)`, `=SUM(M2:M91)` and `#N/A` in `N`.
  - This is a worked sheet rather than a pure POS export: its percentages and flags were added by hand or by lookup.
- **Sheet `Stock`** (`A1:G695`). Minimal layout, header in row 1: `Item Name`, `Brand`, `Design`, `Size`, `Barcode`, `Tqty`, `Mrp`. 694 rows, quantity 1,053, MRP value ₹38,30,842, all `LOUIS PHILIPPE`. Items: SHIRT 276, JEANS 118, TROUSER 72, T-SHIRT 71, SWEATSHIRT 56, JACKET 33, BELT 24, BLAZER 22, SUIT 5, WALLET 5. Quantity per row: 1 (412 rows), 2 (262), 3 (8), 4 (6), 15 (2), 6 (2). No store, supplier or cost column; no barcode repeated.
- **Used by.** The `BOKARO` voucher's `SALES` sheet. The voucher's `SOH` sheet is not this `Stock` sheet (see [2026-04](../README.md)).

### `LP sales & soh HAZARIBAGH.xlsx` (459,138 bytes)
- **Store.** Hazaribagh (file name), bill series `26-27/JSL/n` (JSL is read as Jainsons, a Hazaribagh Store; inferred). All Madura Fashion brands in one export.
- **Sheet `Sheet1`** (`A1:Y372`, autofilter all). The 25-column sale layout starting in column `A`, header in row 1.
  - 371 lines, 105 bills `26-27/JSL/12` to `26-27/JSL/901`, 1 to 30 Apr. Quantity 339 (17 returns). Gross ₹10,03,204; discount -₹1,53,801.30; net ₹8,49,402.70.
  - Brands (lines): Allen Solly 136 (`ALLEN SOLLY` 120, `ALLEN SOLLY JUNIOR` 11, `ALLEN SOLLY WOMENS` 2, `AT` 2, `AS` 1); Van Heusen 85 (`VAN HEUSEN` 82, `VAN HEUSEN WOMENS` 1, `VF` 2); Louis Philippe 99 (`LOUIS PHILIPPE` 62, `LP` 32, `LY` 4, `LR` 1); Peter England 51. 73 bills hold more than one brand. The Louis Philippe lines: quantity 92, gross ₹3,36,894, net ₹2,80,091.40, 51 bills.
  - `Disc%`: 0 on 148 lines, 30 on 107, 20 on 50, 5 on 42, 40 on 12, 10 on 7, 50 on 4, 25 on 1.
  - Items: SHIRT 138, T-SHIRT 64, JEANS 59, TROUSER 57, SUIT 14, SOCKS 9, BLAZER 8, TROUSERS 6, Handkerchief 4, BACKPACK 4.
  - `Bill Date` and `Bill No` are on every line. `Customer`, `Phone`, `Sub Category` and the tender columns (`Bill Amount`, `Cash`, `Card`, `Credit`) are on the first line of each bill only (105 lines). Bill amounts total ₹7,64,258: cash ₹1,64,736, card ₹5,99,522, credit 0. `Customer` and `Phone` (93 of 105) are present; `SalesMan` is on 370 of 371 lines (12 distinct names). Not copied here.
- **Sheet `Sheet2`** (`A1:N5596`, autofilter all). Stock details layout, header in row 1 (14 columns, see above).
  - 5,595 rows. `Tqty` total 5,112 (3,595 rows above 0, 1,999 rows at 0, one negative). MRP value ₹1,46,38,247; purchase `Amount` ₹91,07,909.26.
  - 15 brand spellings: `ALLEN SOLLY` 1,884 rows, `VAN HEUSEN` 1,657, `PETER ENGLAND` 1,025, `LOUIS PHILIPPE` 345, `ALLEN SOLLY JUNIOR` 212, `LP` 201, `VAN HEUSEN WOMENS` 132, `ALLEN SOLLY WOMENS` 39 and others. Suppliers: `ADITYA BIRLA LIFESTYLE BRANDS LIMITED` 5,403 rows, `MADURA PVT LTD` 126, `TT APPARELS` 28, `JAIN SONS` 18, and five others with fewer than 10 rows each. `Season` is text on 5,488 rows, a date (coerced) on 104, blank on 3. No barcode repeated.
  - The Louis Philippe family rows with `Tqty` above 0: 587 rows, quantity 959, MRP value ₹35,61,118.
- **Used by.** The `HZB` voucher (the 99 LP lines and these 587 stock rows).

### `LP_APRIL SALE REPOT_DUMKA.xlsx` (128,078 bytes; `REPOT` is the file's spelling)
- **Store.** Dumka (file name), bill series `26-27/DMK/n`. This is Dumka's sale file: all brands, then copies per brand.
- **Sheets** (all headerless: no row of column titles).

| Sheet | Dimension | Content |
| --- | --- | --- |
| `AS-SALE` | `A2:O72` (row 1 empty; autofilter `A1:O72`) | 71 sale lines of all brands: Allen Solly family 47 (`ALLEN SOLLY` 38, `AT` 5, `AS` 3, `AL` 1), Louis Philippe 16 (`LOUIS PHILIPPE` 13, `LP` 3), Van Heusen family 8 (`VAN HEUSEN` 6, `VX` 1, `VF` 1) |
| `LP-SALE` | `A1:O16` | The 16 Louis Philippe lines again |
| `VH-SALE` | `A1:O8` | The 8 Van Heusen family lines again |
| `AS-SOH` | `A1:N804` | Stock ledger of the Allen Solly range, 804 rows |
| `LP-SOH` | `A1:N360` | Stock ledger of the Louis Philippe range, 360 rows |
| `VH-SOH` | `A1:N322` | Stock ledger of the Van Heusen range, 322 rows |

- **Sale sheets, columns by position.** `A` bill date, `B` empty, `C` bill number, `D` empty, `E` barcode, `F` brand, `G` item, `H` design number, `I` a constant 0, `J` size, `K` quantity, `L` rate (MRP), `M` gross (rate times quantity), `N` an amount (net, inferred), `O` the same kind of amount on some lines.
  - `AS-SALE`: 71 lines, 43 bills `26-27/DMK/4` to `26-27/DMK/74`, 2 to 30 Apr. Quantity 65 (three returns). Gross ₹1,84,075. Amount in `N` on 55 lines (sum ₹1,14,230), in `O` on 17 (sum ₹39,953), in both on one (901 in `N`, 1,498 in `O`, adding to the 2,399 gross); the two columns together total ₹1,54,183. The amount is below gross on 45 lines, equal on 23 and above on 3.
  - `LP-SALE`: 16 lines, 11 bills, 2 to 29 Apr, quantity 16, gross ₹46,968; amount `N` 13 lines, `O` 4, both 1; total ₹35,631.
  - `VH-SALE`: 8 lines, 7 bills, 3 to 30 Apr, quantity 8, gross ₹19,392; `N` 7 lines, `O` 1; total ₹14,919.
  - There is no discount percentage, no discount amount, no customer, no salesperson and no tender column. The misalignment (the amount in `N` or `O`) is the file's layout quirk, so a reader must sum both columns.
- **Stock ledger sheets** (columns as the ledger layout above, no header row):

| Sheet | Rows | Opening | Inward | Sold | Till date | `Total MRP` | Dates | Bill labels |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `AS-SOH` | 804 | 15 | 1,158 | 429 | 744 (516 rows above 0) | ₹26,00,059 | 17 Sep 2025 to 22 Apr 2026 | `WH` 524, `DEOT` 118, `JSL` 97, `GAYA` 41, `ASVH` 24 |
| `LP-SOH` | 360 | 65 | 531 | 226 | 370 (232 rows above 0) | ₹11,34,621 | 28 Sep 2025 to 21 Apr 2026 | `DEO` 155, `WH` 150, `JSL` 55 |
| `VH-SOH` | 322 | 10 | 468 | 193 | 285 (218 rows above 0) | ₹9,46,625 | 14 Sep to 24 Oct 2025 | `JSL` 171, `DEO` 121, `WH` 29, `ASVH` 1 |

  `Date` here is a real date (not a serial number). `Season` is blank on all rows. Brand codes in the Louis Philippe sheet: `LOUIS PHILIPPE` 171, `LP` 170, `LY` 14, `LA` 3, `LR` 2; in the Van Heusen sheet: `VAN HEUSEN` 193, `VS` 48, `VX` 33, `VD` 23, `VH` 21, `VF` 4.
- **Used by.** The `DUMKA` voucher's `SALES` sheet (`LP-SALE`). The voucher's `SOH` sheet comes from `DUMKA_STOCK DETAILS APRIL2026.xlsx`.

### `SANSKAR LOUIS PHILIPPE SALE REPORT .xlsx` (19,899 bytes; note the space before `.xlsx`)
- **Store.** Sanskar (file name), bill series `26-27/SAN/n`. Louis Philippe only.
- **Sheet `Sheet1`** (`A1:Z56`, autofilter `A1:Z1`). The 25-column sale layout starting in column `B` (column `A` blank), header in row 1.
  - 51 lines (rows 2 to 52), 30 bills `26-27/SAN/34` to `26-27/SAN/1238`, 2 to 28 Apr. Quantity 51 (no returns). Gross ₹1,58,891; discount -₹25,781.50; net ₹1,33,109.50.
  - Brands: `LOUIS PHILIPPE` 32, `LP` 19. Items: TROUSER 16, SHIRT 12, T-SHIRT 11, JEANS 7, BELT 4, BLAZER 1. `Disc%`: 0 on 48 lines, 20, 30 and 100 on one each. `season` is text such as `SS 25-26` (20 lines), `AW 25-26` (19), `SS 26` (12), unlike the spellings in the other exports.
  - `Bill Date` and `Bill No` are on every line; `Customer`, `Phone` (25 of 30), `Sub Category` and the tender columns on the first line of each bill (30 lines). Bill amounts total ₹1,28,240: cash ₹37,967, card ₹90,273, credit 0, which is ₹4,869.50 below the line net. `SalesMan` is on 49 of 51 lines (7 distinct names). Customer names, phone numbers and salesperson names are present and not copied.
  - **Footer.** Row 53 is a totals row (quantity 51, gross 1,58,891, discount -25,781.50, net 1,33,109.50, bill amount 1,28,240, cash 37,967, card 90,273). Row 54 has `SALES RETURN` in the `Customer` column and nothing else. Row 55 is blank. Row 56 repeats the totals row.
- **Sheets `Sheet2` and `Sheet3`.** Empty. There is no stock sheet.
- **Used by.** The `SANSKAR` voucher's `SALES` sheet.

## Quirks that apply across the files
- **Bill header on the first line.** The AS-DEO sale sheets carry date and bill number on the first line of each bill only. HZB, Sanskar and VAS-DEO carry date and bill number on every line and put customer fields (and, for HZB and Sanskar, the tender columns) on the first line of each bill only.
- **Rounded barcodes.** The Allen Solly Store's sale barcodes keep six significant digits (all 213 end in seven zeros). Banka's `Barcode` mixes numbers and text and short internal codes.
- **Dates and seasons coerced.** Season text such as `AW-24` or `Mar-26` was turned into a date in several files (Banka, AS-DEO, Dumka stock, HZB); `Date` in the AS-DEO ledgers is a plain serial number.
- **Duplicate totals rows and footers** (Banka rows 1588 and 1591; Sanskar rows 53 and 56; Bokaro row 92 with `#N/A`). Dumka's sale sheets have no totals row.
- **Brand codes.** Louis Philippe appears as `LOUIS PHILIPPE`, `LP`, `LY`, `LR`, `LA`, `LX` (families); Allen Solly as `ALLEN SOLLY`, `AS`, `AL`, `AT`; Van Heusen as `VAN HEUSEN`, `VH`, `VX`, `VF`, `VD`, `VS`. Suppliers are written `MADURA PVT LTD` or `ADITYA BIRLA LIFESTYLE BRANDS LIMITED` for the same brands.
- **Absent from every file:** a count result, an official PT coverage mark, or a hold flag. These are POS exports; stock lists are SOH, a comparison source and not a physical count.

## Subfolders
None.

## Open questions
Full list goes to [open-questions.md](../../../../data-notes/open-questions.md).
1. Which POS software and which export option produces each family (Banka, AS-DEO, Dumka, VAS-DEO, Bokaro, HZB, Sanskar)? Can the exports keep date, bill number and tender on every line and give unrounded 13-digit barcodes? Owner: KDPS Owner (P-OWN) and product owner.
2. Is the `LP2` sheet in the AS-DEO file the Louis Philippe range of the Allen Solly Store, and what is Bokaro's `SOH` meant to be (its own `Stock`, or the AS-DEO `LP2 SOH `)? Owner: KDPS Owner.
3. What do the two amount columns `N` and `O` in the Dumka sale sheets mean, and why does one line have values in both? Owner: KDPS Owner or the Store.
4. What does the note `NOTE: 19 PCS JEANS SHORT` on the VAS-DEO stock sheet mean? Owner: the Store (via KDPS Owner).
5. Which Banka brands, if any, must be reported to a brand company, and in what format? Owner: KDPS Owner.
6. How were the ledger rows labelled `Opening Stock`, `Audit Diff` (AS-DEO) and `Scan Stock`, `Audit Differance` (Banka) created, and do they match a physical count? Owner: Operations (P-OPS).
