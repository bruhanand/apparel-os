# VAISHNAVI

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [store-analysis](../README.md)

## What this folder is

- The three raw exports from the Vaishnavi Store at Deoghar (bill series `DEO`): one stock-on-hand (SOH) report and two sales reports. The file properties show them created between 31 Mar and 14 Jun 2026 and last saved on 12 to 14 Jun 2026 through Excel. The workbook author field is `VAISHNAVI` on all three.
- The POS product is not named anywhere in the cells, strings or workbook properties (the print settings inside the files name a Star RP3150 thermal receipt printer). The Store appears in `Q&A-req-recieved/LIST OF ALL STORES.xlsx` as `VAISHNAVI | DEOGARH`; the file names say `DEOGHAR`.
- The analyses made from these files (the report, the data quality note, the two workbooks) are described in [../README.md](../README.md). All their thresholds are analyst assumptions, not KDPS decisions.
- Data notes: [pos-exports.md](../../../data-notes/pos-exports.md) (layouts), [stores-and-codes.md](../../../data-notes/stores-and-codes.md) (Store codes) and [analyses-and-metrics.md](../../../data-notes/analyses-and-metrics.md) (measures).

## Files

### `VAISHNAVI DEOGHAR 12-06-2026 SOH.xlsx`

- **What:** the Store's stock report as on 12 Jun 2026, in a 3.2 MB workbook. Created 12 Jun 2026 07:48 UTC, last saved 14 Jun 2026 14:35 UTC (the last-saved-by field holds `12`, so a person edited it after export; the content of the edits is unknown).
- **Sheets (3):**

| Sheet | Rows used | Content |
| --- | --- | --- |
| `Sheet1` | `A1:N33384` (header + 33,381 barcode rows + 1 total row + 1 blank row) | The raw POS stock report: the whole catalogue, in stock or not. Filter set on `A1:N33383`. |
| `Sheet2` | `A1:O8806` (header + 8,805 rows) | The in-stock rows only, with cleaned values. Filter set on `A1:N8806`. |
| `Sheet3` | `A1:A1` | Empty |

- **Columns (14, same names on `Sheet1` and `Sheet2`):** `Item Name`, `Brand`, `Size`, `Supplier`, `Barcode`, `Design No`, `Category`, `Gender`, `Fit`, `Season`, `Tqty`, `Mrp`, `Rate`, `Amount`.
  - One row is one barcode, that is one style, colour and size (the SKU). It is not one piece.
  - `Rate` is the unit cost. `Amount` = `Tqty` × `Rate` (rows sum to ₹1,79,81,382.52; `Tqty` × `Rate` gives ₹1,79,81,382.70, a ₹0.18 difference from the stored amounts).
  - There is no inward or goods-receipt date, vendor invoice number, HSN column, Store column or colour column. There is no cost or MRP history.
  - `Sheet2` has an unlabelled 15th column `O` with 41 numeric codes that look like HSN codes (61099090 on 30 rows, 401000 on 6, 42033000 on 3, 62050000 on 2; guess).

**`Sheet1` in detail**

| Measure | Value |
| --- | --- |
| Barcode rows | 33,381, all different barcodes |
| Rows with `Tqty` 0 | 24,576 (they keep `Mrp` and `Rate`, so `Sheet1` also works as a cost and MRP catalogue for sold-out items) |
| Rows with `Tqty` above 0 | 8,805 |
| Negative `Tqty` | none |
| Pieces | 13,354 |
| Cost value (`Amount`) | ₹1,79,81,382.52 |
| MRP value (`Tqty` × `Mrp`) | ₹3,03,57,010 |
| Total row (row 33,383, no barcode, all other cells blank) | `Tqty` 13,375 and `Amount` ₹1,79,81,513.78: 21 pieces and ₹131.26 more than the rows. Unexplained. |
| Blank row 33,384 | Present, after the total row |
| Distinct non-blank values | 370 brands, 131 item names, 184 sizes, 137 suppliers, 10,286 design numbers, 194 categories, 33 gender strings, 50 fits, 186 season strings |
| Blank cells | `Item Name` 18, `Brand` 5, `Size` 373, `Supplier` 17, `Category` 177, `Gender` 95, `Fit` 124, `Season` 3,846 |

- **Barcode formats are mixed:** 26,344 are 13-digit numbers (EAN style); 4,436 are 7-digit in-house numbers; 1,848 are text (for example a barcode with letters); the rest are numbers of 5, 6, 8 to 12, 14 and 15 digits. `Barcode` is stored as a number on 31,533 rows and as text on 1,848.
- **`Gender` is free text:** `MALE` 22,565, `FEMALE` 4,839, `KIDS MALE` 2,398, `KIDSM` 2,167, `KIDSF` 368, `.` 177, `UNISEX` 139, `MIX` 106, `KIDS FEMALE` 64, `NA` 58, `FMALE` 49, `KIDS` 40, `KIDM` 39, `ASSO.` 36, `PROMO` 35 and 18 more spellings (including `SMAG HALF ZIPPER`, `FEAMLE`, `FEMALE KIDS`, `BOY`, `ACCE`, `MENS`, `LUGGAGE`, `GIFT`).
- **`Season` is a mix of formats (all rows):** `SPRING SUMMER(Mon-yy)` or `AUTUMN WINTER(Mon-yy)` on 9,952 rows; real Excel date values on 6,752 rows; `SS-yy` or `AW-yy` on 4,721; blank on 3,846; text such as `SS25`, `SS24`, `AW24`, `FS22`, `AS22` (no hyphen); `SPRING SUMMER(yyyy)` on 896; text dates such as `29-04-2025`; and stray values (`1`, `2`, `4`, `241`, `243`, `N/A`, `ALL SEASON`, `CORE`, `VAISHNAVI`, `KDPS`). Among the 8,805 in-stock rows: 4,844 `Mon-yy` labels, 1,267 `SSyy`/`AWyy` text, 1,010 Excel dates, 878 `SS-yy`, 640 blank, 93 year-only, 63 other, 10 text dates.
- **Brand codes are inconsistent:** among in-stock rows `VAN HEUSEN` 1,082 and `LOUIS PHILIPPE` 748 share the shelf with `LP` 286, `VH` 173, `VX` 78, `VS` 68, `VD` 45, `LR` 42, `LY` 40, `VF` 39.

**`Sheet2` in detail**

- Same 8,805 barcodes as the in-stock rows of `Sheet1`, in the same order. `Tqty`, `Mrp`, `Rate`, `Amount`, `Supplier` and `Design No` are identical.
- These cells differ from `Sheet1`: `Season` 3,007, `Brand` 660, `Size` 410, `Gender` 40, `Item Name` 34, `Category` 1, `Fit` 1. So `Sheet2` looks like a hand-cleaned copy of `Sheet1`'s in-stock rows (inferred; who cleaned it is not known).
- `Season` on `Sheet2` is normalised: 4,845 labels of the form `SPRING SUMMER(Mon-yy)` or `AUTUMN WINTER(Mon-yy)`, 3,867 of the form `SS-yy` or `AW-yy`, 93 with a year only. 41 distinct strings. The 1,010 Excel dates of `Sheet1` appear here as `SS-yy` or `AW-yy` codes. The date cells are misread text: the day of the month equals the year and the month is the lot month (for example 2026-03-23 stands for `SS-23`; inferred, not confirmed).
- `Gender` has 6 values: `MALE` 5,831, `KIDS MALE` 1,650, `FEMALE` 1,245, `UNISEX` 64, `Male` 13, `KIDS FEMALE` 2.
- Distinct non-blank values: 220 brands, 84 item names, 121 categories, 39 fits, 123 sizes, 107 suppliers, 3,718 design numbers. Blank: `Category` 34, `Fit` 29, `Supplier` 2.

**What the in-stock stock looks like (`Sheet2`)**

| Measure | Value |
| --- | --- |
| Pieces / SKUs | 13,354 / 8,805 |
| Cost / MRP value | ₹1,79,81,383 / ₹3,03,57,010 |
| Cost as a share of MRP | 59.2% by value; median per SKU 70.0% |
| Rows holding 6 or more pieces | 133 |
| Rows holding 1 piece | 6,266 |
| Largest row | 377 pcs, Van Heusen trolley (MRP ₹9,999, unit cost about ₹804) |
| All trolley rows | 11 rows, 407 pcs, cost ₹3.42 L, MRP value ₹40.65 L |
| Cost as a share of MRP without trolleys | 67% |
| Cost above MRP | 24 rows, 33 pcs; 1 more row with cost equal to MRP |
| Cost below 20% of MRP | 22 rows (mostly trolleys and bags) |
| Rows with `Mrp` 0 (in `Sheet1`) | 2 |
| Top item names | `T-SHIRT` 2,215 rows, `SHIRT` 1,957, `JEANS` 1,149, `TROUSER` 467, `KURTI SET` 410 |
| Top suppliers by cost value | Aditya Birla Lifestyle Brands ₹55.6 L, Vishal Marketing ₹43.2 L, D Apparel ₹15.6 L, Madura ₹14.1 L, KDPS Lifestyle Pvt Ltd (Deoghar) ₹11.4 L (probably transfers or opening stock; guess) |
| Top brands by cost value (merged) | Van Heusen ₹33.6 L, Louis Philippe ₹33.0 L, Spykar ₹17.2 L, Status Quo ₹14.9 L, Flying Machine ₹12.0 L (the analysis merges brand codes) |

- `Category` holds both words (`CASUAL WEAR`, `FORMAL WEAR`, `SEASONAL WEAR`, `INNERWEAR`) and codes (`UTP`, `USM`, `UTM`, `USP`).
- Trolleys have an MRP near ₹10,000 and a unit cost near ₹800. They are sold in the sales files at ₹99 to ₹399 and look like gift-with-purchase items (inferred).
- Sensitive content: cost per barcode (so margin) and supplier names. Not copied here.

### `SALE REPORT 1 APRIL 25 TO 31 MARCH 26.xlsx`

- **What:** the sales report for financial year 2025-26, one row per bill line, for Vaishnavi Deoghar. A 2.3 MB workbook, created 31 Mar 2026 09:34 UTC, last saved 14 Jun 2026 15:19 UTC.
- **Sheet:** one, `Sheet1`, `A1:Z15286` (header + 15,285 line rows). It has no total row and no `SALES RETURN` block.
- **Columns (26, column A empty on every row):** `Bill Date`, `Bill No`, `Customer`, `Phone`, `Item`, `Brand`, `Color`, `Size`, `Design No`, `Barcode`, `SalesMan`, `Sub Category`, `Gender`, `Fit`, `season`, `Qty`, `Rate`, `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount`, `Bill Amount`, `Cash`, `Card`, `Credit`.
- **Row structure:**
  - A row is one bill line (barcode and quantity).
  - These fields are filled only on the first line of each bill: `Bill Date`, `Bill No`, `Customer`, `Phone`, `Sub Category`, `Bill Amount`, `Cash`, `Card`, `Credit`. `Sub Category` is therefore a category code of the bill's first item, not of every line (5,375 of the 5,383 first lines carry it).
  - `Rate` is the sale-time MRP. `Gross Amt` = `Qty` × `Rate` and `Gross Amt` + `Disc Amt` = `Net Amount` on every line except one. `Disc Amt` is negative for a discount. `Disc%` is whole or fractional percent.
  - `Bill Date` has no time of day.
- **Bill numbers:** `25-26/DEO/1` to `25-26/DEO/5383`, 5,383 bills, no gap and no repeat; one series per financial year with the Store code `DEO`. Dates never go back as the number rises. The first bill is 3 Apr 2025 and the last 31 Mar 2026; bills fall on 357 different days.

| Total (the file has no total row; these are my sums) | Value |
| --- | --- |
| Lines / bills | 15,285 / 5,383 (2.84 lines a bill) |
| `Qty` | 21,831 |
| `Gross Amt` | ₹2,50,48,000 |
| `Disc Amt` | −₹83,17,767.34 (33.2% of gross) |
| `Net Amount` | ₹1,67,28,633.66 |
| `Bill Amount` (first lines) | ₹1,66,71,082 |
| `Cash` / `Card` / `Credit` | ₹59,21,842 / ₹1,07,49,240 / 0 |
| Distinct non-blank values | 273 brands, 100 items, 127 sizes, 8,941 barcodes, 112 `Sub Category` codes, 8 salesperson names (one is `Admin`) |

| Month | Bills | Net sales (₹ L) |
| --- | --- | --- |
| Apr 2025 | 340 | 12.6 |
| May 2025 | 410 | 13.1 |
| Jun 2025 | 427 | 11.6 |
| Jul 2025 | 588 | 15.7 |
| Aug 2025 | 507 | 12.7 |
| Sep 2025 | 558 | 19.7 |
| Oct 2025 | 245 | 8.1 |
| Nov 2025 | 475 | 16.4 |
| Dec 2025 | 530 | 16.5 |
| Jan 2026 | 505 | 14.9 |
| Feb 2026 | 445 | 13.5 |
| Mar 2026 | 353 | 12.6 |

- **Tenders:** `Cash`, `Card` and `Credit` are the only tender columns. `Credit` is 0 on every bill. There is no UPI column; whether UPI is inside `Card` or `Cash` is not stated. Of 5,383 bills, 1,970 are cash only, 3,118 card only, 177 split, and 110 have no tender (bills of zero value). On every bill `Cash` + `Card` + `Credit` equals `Bill Amount`.
- **Returns:** 442 lines with a negative `Qty` (445 pieces, net −₹7,66,410) in 327 bills; 326 of those bills also have sale lines (exchanges) and 1 bill is returns only. 8 bills have a negative `Bill Amount` (−₹5,298 together). There is no link from a return line to its original bill.
- **Free gifts and bags:**
  - Lines with `Disc%` 100: 2,634. Of these, 1,368 are non-bag merchandise (about ₹27 to 28 L at MRP; the figure depends on whether return lines are counted).
  - `CARRY BAG` lines: 1,271 (1,267 under brand `VAISHNAVI`, 4 under brand `.`), 8,226 bags in all, at `Rate` ₹25, ₹15 or ₹7 and nearly all at 100% discount (net ₹139 in total). Single lines hold 2,489, 1,896, 1,178 and 916 bags (probably bulk consumption booked through a bill; guess).
  - The `SalesMan` on carry-bag lines is `Admin`: 1,247 of the 1,520 `Admin` lines are carry-bag lines.
- **Discount quirks:** 665 lines have `Disc%` 0 but a non-zero `Disc Amt` (−₹12,38,624 together), so rupee-amount overrides hide inside the percentage. 26 lines (mostly Louis Philippe and Van Heusen brand codes; 25 of them billed in Oct and Nov 2025) have `Disc%` −5.35 with a positive `Disc Amt` (net above the MRP-based gross; reason unknown). Fractional percentages such as 6.25, 52.5 and 99.99 appear.
- **Customer and phone:** 2,058 bills have `Customer` `CASH` (a walk-in). 2,578 bills have a blank `Phone`; 2,775 have a 10-digit number; 30 have another length (22 of 9 digits, 6 of 11, 1 of 2 digits, 1 empty). 2,327 distinct phones appear in all. 29 bills are named `MANUAL BILL UPDATE` (19 Apr to 9 Oct 2025, `Bill Amount` ₹2.54 L): probably paper bills keyed in later (guess).
- **Salespeople:** 8 names including `Admin`; 384 lines have no `SalesMan`.
- **Other quirks:**
  - 19 bills have a header `Bill Amount` that differs from the sum of their line `Net Amount` by more than ₹1 (the line sums are ₹57,520 higher in total).
  - One line has the text `NaN` in `Rate` (bill `25-26/DEO/2009`, quantity 0). One line has a single space in `Net Amount` (bill `25-26/DEO/72`).
  - `Item` is blank on 5 lines that still carry a barcode.
  - `Gender` has 29 spellings (`MALE` 9,993 lines, `FEMALE` 2,065, `KIDSM` 864, `NA` 725, `CARRY BAG` 576, `KIDS MALE` 481, `PROMO` 106, `.` 103 and others). `Color` mixes real colours with price bands (`PREMIUM` 4,611 lines, `ASSO.` 2,267, `NA` 1,460, `BLACK` 1,199, `MEDIUM` 846, `ECONOMY` 741). `Fit` mixes real fits (`SLIM`, `REGULAR`, `FREE FIT`) with what look like margin or price-band codes (`LM` 5,359, `VLM` 1,327, `MM` 674, `HM`, `HLM`, `VHM`) and `LOSS` (702 lines, almost all carry bags and gifts). What these codes mean is not stated (guess: margin bands).
  - `season` holds Excel dates on 2,540 lines (the text `Mar-25` was read as 25 March 2026) and is blank on 1,137.
  - `Design No` is text on 13,074 lines, a number on 2,210 and an Excel date on 1; `Barcode` is a number on 13,209 lines and text on 2,076.
  - The sale `Rate` differs from the `Mrp` now on the stock sheet for about 1,500 of about 16,500 matched sale lines (about 9%), so MRP changes over time.
- Sensitive content: customer names and phone numbers; salesperson names; per-person sales. Not copied here.

### `SALE REPORT 1st Apr 26 TO 13th Jun 26.xlsx`

- **What:** the sales report from the start of financial year 2026-27 to 13 Jun 2026, same layout as above. A 396 KB workbook, created 14 Jun 2026 15:08 UTC, saved 15:09.
- **Sheets (3):** `Sheet1` (`A1:Z2553`); `Sheet2` and `Sheet3` are empty (`A1:A1`).
- **Columns:** the same 26 as the full-year file (column A empty, then `Bill Date` to `Credit`).
- **Rows:** header; 2,548 line rows (rows 2 to 2,549); row 2,550 a total row; row 2,551 the text `SALES RETURN`; row 2,552 blank; row 2,553 the total row repeated. The total row has no label and holds only the sums in `Qty`, `Gross Amt`, `Disc Amt`, `Net Amount`, `Bill Amount`, `Cash` and `Card` (it matches the line sums exactly; `Credit` is left empty). The words `SALES RETURN` sit in the `Customer` column of row 2,551, and nothing follows them.
- **Bill numbers:** `26-27/DEO/1` to `26-27/DEO/919`, 919 bills, no gap. The series restarted at 1 on 1 Apr 2026. Bills fall on all 74 days from 1 Apr to 13 Jun 2026.

| Total | Value |
| --- | --- |
| Lines / bills | 2,548 / 919 (2.77 lines a bill) |
| `Qty` | 2,537 |
| `Gross Amt` | ₹44,48,617 |
| `Disc Amt` | −₹12,68,320.69 |
| `Net Amount` | ₹31,80,296.31 |
| `Bill Amount` | ₹31,80,290 |
| `Cash` / `Card` / `Credit` | ₹12,15,283 / ₹19,65,007 / 0 |
| Distinct non-blank values | 112 brands, 61 items, 86 sizes, 1,775 barcodes, 46 `Sub Category` codes, 9 salesperson names |

- By month: Apr 2026 387 bills, ₹13.9 L; May 395 bills, ₹12.95 L; Jun (to the 13th) 137 bills, ₹4.9 L. Average bill ₹3,461.
- Tenders: 355 bills cash only, 518 card only, 24 split, 21 none. Header `Bill Amount` equals the sum of line net on every bill.
- Returns: 68 lines (68 pieces, net −₹1,24,133) in 56 bills, all exchanges; one bill has a negative amount (−₹21).
- Carry bags: 223 lines (261 bags, all under brand `VAISHNAVI`, net ₹0; `SalesMan` is `Admin` on 222 of them). Lines with `Disc%` 100: 313, of which 90 are non-bag (about ₹2.4 L at MRP). `Disc%` 0 with a non-zero `Disc Amt`: 211 lines (−₹6,06,374).
- Customers: 316 bills `CASH`; phone 10-digit on 507 bills, blank on 408, 9 digits on 2, 11 digits on 2. Lines without `SalesMan`: 4. `Item` is blank on 7 lines that carry a barcode. `season` holds Excel dates on 145 lines and is blank on 64.
- Sensitive content: as in the full-year file.

## How the three files link

- `Barcode` links sales to stock. 10,263 distinct barcodes were sold in the two sales files; 10,262 of them are in `Sheet1` of the stock file (one is not). Sold-out items stay in `Sheet1` with their cost and MRP, so `Sheet1` serves as a catalogue.
- Brand names differ between the sales and stock files (sales `LP`, stock `LOUIS PHILIPPE`), so brand totals do not line up without a manual merge.
- The two sales files do not overlap: the first ends 31 Mar 2026 and the second starts 1 Apr 2026 with a fresh bill series.
- The stock report was created on 12 Jun 2026 and the second sales report runs to 13 Jun 2026, so sales after the stock report are not reflected in it.
- The raw files do not contain: a tax or GST split, an HSN code per sale line, line cost, a Store or billing device ID, a time of day, a UPI tender, a return-to-bill link, or an inward date for stock.

## Open questions

Full list: [open-questions.md](../../../data-notes/open-questions.md).

1. Which POS and version produced these exports, and can it export an inward date and proper season text? Owner: KDPS Owner.
2. What do the `Season` month-year tags mean (receipt month or season launch), and why do some cells hold dates? Owner: KDPS Owner with the Store.
3. Is `Rate` a landed cost, with or without GST, and does it ever change? Owner: Accounts and the CA.
4. Is UPI inside `Card` or inside `Cash`? Where is a return linked to its bill? Are `MANUAL BILL UPDATE` bills paper bills keyed in later? Owner: KDPS Owner with the Store.
5. What do the `Fit` codes `LM`, `VLM`, `MM`, `HM`, `HLM`, `VHM` and `LOSS` mean? Owner: KDPS Owner or Accounts.
6. Why do the stock total row (13,375 pieces) and the sum of the rows (13,354) differ, and who made `Sheet2`? Owner: Vaishnavi Store, via the KDPS Owner.
7. What are the trolleys, backpacks and bags with cost near 8% of MRP; are they gift items to leave out of dead-stock and margin figures? Owner: KDPS Owner.
