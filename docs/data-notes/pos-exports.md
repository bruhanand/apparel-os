# POS exports and store Excel layouts

> **Not ranked.** These notes describe the data KDPS sent. They decide nothing. A PRD or policy change they lead to needs an entry in [decisions.md](../decisions.md) first. See [README.md](README.md).

## 1. What this note covers

- Every layout of a sales or stock report in the KDPS files: the earlier POS exports, the stores' own Excel workbooks, the brand reports KDPS staff build, and the item lines of the debit-note workbook.
- Why it matters. During the side-by-side test the earlier POS's daily sales report and SOH are imported through saved approved layouts (`PRD-LIF-013`). They are evidence for checking and reports only (`PRD-LIF-014`, `PRD-LIF-016`). Sales history is imported for reports only (`PRD-LIF-010`). At a Store's switch the verified count is reconciled with the earlier POS's last SOH (`PRD-LIF-027`). Saved layouts are versioned and chosen by file structure (`PRD-IMP-003`, `PRD-IMP-004`).
- Companion files: [pos-export-layouts.json](pos-export-layouts.json) holds the same layouts in machine-readable form (29 entries, the ids used below). [data-quality-and-import-rules.md](data-quality-and-import-rules.md) lists every data problem seen and the import rule it implies.
- The GC-6 imports design is not written yet ([gaps-before-code.md](../reports/gaps-before-code.md)). These notes are input to it.
- Every file was opened again. Counts come from the raw files, except where a line says "survey": "survey" marks a figure taken from the first-pass read of the files (October 2026) and not counted again for this note. "(guess)" and "(inferred)" mark what the files do not state. Values set by earlier analysts are analyst assumptions, not KDPS decisions.
- Customer names, phone numbers, salesperson names, tax numbers and bank details exist in these files. They are not copied here. Cost columns are described, never listed.

How to read the tables:

- Column names are in backticks, spelled as in the file, typos included.
- "Header row" is the row number where the names sit.
- "Leading blank column" means column A is empty and the names start in column B.
- Money is in rupees as the files hold it. Money in the new system is integer paise (`PRD-MOD-014`).

## 2. Layout map

| ID | Layout | Columns | Header row | Seen in | Made by (guess) |
| --- | --- | --- | --- | --- | --- |
| `sales-bill-line-25` | Bill-line sales report, bill fields on the first line | 25 | 1, leading blank column | Vaishnavi Deoghar (2 files), the Singh More sample, Jainsons Hazaribagh `jsl/` (3 files), Allen Solly Deogarh sheets | Earlier POS |
| `sales-bill-line-25-repeat` | Same 25 columns, date and bill number on every line | 25 | 1 | `Sales_Hazaribagh.xlsx`, the Hazaribagh LP sheet, the Sanskar sheet | Earlier POS |
| `sales-banka-19` | Sales report without customer and tender columns | 19 | 1, leading blank column | Banka April sale sheet | Earlier POS with columns removed |
| `sales-vasdeo-15` | Sales report, 15 columns | 15 | 1 | Deoghar Louis Philippe sale sheet | Earlier POS with columns removed |
| `sales-bokaro-13` | Sales report, 13 columns plus a lookup column | 13 + 1 | 1 | Bokaro sale sheet | Reworked by KDPS staff |
| `sales-dumka-headerless` | Headerless sales sheets, misplaced amounts | 14 positions | none | Dumka April sale file (3 sheets) | Hand-built |
| `soh-movement-23` | Stock movement statement with `Color` | 23 | 1, leading blank column | `SOH REPORT FORMAT.xlsx` | Earlier POS |
| `soh-movement-22` | Stock movement statement without `Color` | 22 | 1, leading blank column | `soh30626.xlsx` | Earlier POS |
| `soh-stock-details-14` | Stock-details snapshot | 14 | 1 | Vaishnavi Deoghar SOH (2 sheets), Dumka stock (4 sheets), Hazaribagh LP stock sheet | Earlier POS |
| `soh-stock-details-offer-14` | Stock-details snapshot with `OFFER`, no `Season` | 14 | 1 | `SOH_Hazaribagh.xlsx` | Earlier POS |
| `soh-minimal-bokaro-7` | Minimal stock list | 7 + 1 empty | 1 | Bokaro `Stock` sheet | Staff cut-down |
| `soh-minimal-vasdeo-8` | Minimal stock list with `Store Name` | 8 | 1 | Deoghar Louis Philippe `STOCK REPORT` | Staff cut-down |
| `soh-ledger-14-store` | Stock ledger (opening, inward, sold, till date) with `Store Name` | 14 | 1 | Banka `STOCK REPORT` | Store's own Excel |
| `soh-ledger-14-season` | Stock ledger with `Season` | 14 | 1 | Allen Solly Deogarh `AS SOH `, `LP2 SOH ` | Store's own Excel |
| `soh-ledger-14-headerless` | Stock ledger without a header row | 14 positions | none | Dumka `AS-SOH`, `LP-SOH`, `VH-SOH` | Store's own Excel |
| `dsr-sale-32` | Daily sales report workbook, `Sale` | 32 | 3 | Singh More DSR | Store workbook |
| `dsr-cash-14` | DSR `Cash` | 14 | 3 | Singh More DSR | Store workbook |
| `dsr-stock-in-pivot` | DSR `Stock In` pivot | 4 + blanks | 3 | Singh More DSR | Store workbook |
| `dsr-stock-inward-10` | DSR `Stock Inward Details` | 10 | 3 | Singh More DSR | Store workbook |
| `dsr-bank-reconciliation-20` | DSR `Bank Reconciliation` (another store, broken) | 20 | 3 | Singh More DSR | Store workbook |
| `dsr-petty-cash-18` | DSR `Petty Cash` | 18 | 2 | Singh More DSR | Store workbook |
| `brand-voucher-sales-14` | Brand report "List of Sales Vouchers", `SALES` | 14 | 4 (Mufti 3) | April Louis Philippe (6 stores), May and June Blackberry and Mufti | KDPS staff |
| `brand-voucher-soh-10` | Brand report "List of Stock Details", `SOH` | 10 (+1) | 4 | Same workbooks | KDPS staff |
| `brand-fm-direction-sale-20` | Flying Machine template, formulas only | 20 | 4 | `KDPS-DIRECTION.xlsx` | KDPS staff or the ERP team |
| `brand-blackberry-brand-report-13` | Blackberry `BRAND REPORT` | 13 | 4 | June Blackberry workbook | Staff or ERP team |
| `brand-blackberry-bill-summary-8` | Blackberry `BILL SUMMARY` | 8 | 3 | June Blackberry workbook | Staff or ERP team |
| `brand-stock-tag-list-15` | Brand-side stock tag list | 15 | 1 | `KDPS LIFE.xlsx` | The brand |
| `dn-software-17` | Debit-note item lines, `SOFTWARE` sheets | 17 | 1, leading blank column | `KDPS DEBIT & CREDIT NOTE DETAILS.xlsx` (hidden sheets) | Billing or accounting software (unknown) |
| `dn-summary-4` | Debit-note summary sheets | 4 | 1 | Same workbook | KDPS Accounts |

## 3. Which POS made these files?

Unknown. No exported file names its source system.

- `Q&A-req-recieved/LIST OF ALL STORES.xlsx` has a column `RETAIL JI`. It is YES on six rows (Spykar Deogarh, Jockey Banka, MBO Gaya, Peter England Kankarbagh, MBO Kankarbagh, Warehouse Ranchi) and blank on the others. The sheet does not say what it means. The stores that gave the 25-column report (Vaishnavi Deoghar, Vaishnavi Singh More, Jainsons Hazaribagh, Allen Solly Deogarh) are not flagged.
- "TEN" appears in KDPS's invoice tracker (`Uploaded In TEN` and `TEN Uploaded Date` in `KDPS INVOICE & OFFER DETAILS..xlsx`) and in `Q&A-req-recieved/MOM_S.xlsx` item 8 (`TEN software API with documentation`). Two earlier analyst papers in `store-requirements-users/` call the POS "Ten Software". Those papers are not KDPS decisions.
- Guess: the 25-column report, the movement statement and the stock-details report come from one product, probably TEN. `Retail Ji` may be a second product at the six flagged stores. This is weak.
- The column style (`Tqty`, `Stf Reciept`, `SalesMan`, `Disc%`) is common in Indian apparel POS products. That is a guess, not evidence.
- KDPS names Debanjan as the provider of the sale report format and of the SOH report format (`MOM_S.xlsx` items 10 and 11, both marked done).
- Not POS exports: the DSR workbook, the stock ledgers, the brand reports and the debit-note summary are workbooks that KDPS staff build or edit.

## 4. Sales layouts

### 4.1 `sales-bill-line-25` and `sales-bill-line-25-repeat`

What a row means: one bill line, that is one barcode and quantity on one bill. Several lines make a bill. The report prints the bill's own fields once, on its first line.

Header row 1, 25 columns. In most files the header starts in column B (column A is empty). Hazaribagh files start in column A.

| # | Column | Meaning | Quirks |
| --- | --- | --- | --- |
| 1 | `Bill Date` | Date of the bill | Real Excel date at midnight, no time of day. First line only, except in the repeat variant |
| 2 | `Bill No` | `YY-YY/CODE/n`: financial year, store code, serial | Text. Serial starts at 1 on 1 April and has no gaps in the full-period files. First line only, except in the repeat variant |
| 3 | `Customer` | Name keyed at the counter. `CASH` for a walk-in | Personal data. First line only. `CASH` on 2,058 of 5,383 bills (Vaishnavi FY 2025-26). `MANUAL BILL UPDATE` on 30 bills of that file. One cell holds the formula error `#NAME?` |
| 4 | `Phone` | Customer mobile number | Personal data. First line only. A number, so a leading zero cannot survive. 2,805 of 5,383 bills have one. Lengths 9, 11 and 1 (`0`) seen |
| 5 | `Item` | Item type: SHIRT, JEANS, CARRY BAG | Blank on 5 and 7 lines in the two Vaishnavi Deoghar files; those lines carry `NA` in other columns |
| 6 | `Brand` | Brand name or a brand or division code | LP, LY, LR (Louis Philippe), VH, VS, VF (Van Heusen), AS, AL (Allen Solly) beside the full names. Carry bags carry the store's own name |
| 7 | `Color` | `PREMIUM`, `MEDIUM`, `ECONOMY` or `ASSO.` instead of a colour | 26,022 of 26,195 lines in `Sales_Hazaribagh.xlsx`. A real colour on a few. Staff tag goods with no clear colour or classification this way, mostly non-brand goods (product owner, 4 Oct 2026). How the product handles these tags is OPEN for the product owner |
| 8 | `Size` | Size as keyed | Number, letters, `FREE SIZE`, `FS`, kids age, pack or measure. Numbers are stored as numbers |
| 9 | `Design No` | Style or design code | Excel turns some into dates: 75 cells in `Sales_Hazaribagh.xlsx` |
| 10 | `Barcode` | Barcode or in-house code | All-digit values are numbers. Alphanumeric values are text |
| 11 | `SalesMan` | Salesperson for the line | Personal data. Line level, can differ inside a bill. Blank on 30% to 45% of lines in the Jainsons Hazaribagh files |
| 12 | `Sub Category` | Category of the bill's first line item | Printed on the first line only. Words (`CASUAL WEAR`) and codes (`USM`, `UTP`) mix |
| 13 | `Gender` | Gender or kids group | 12 spellings in `Sales_Hazaribagh.xlsx` |
| 14 | `Fit` | Fit | Also holds the codes `LM`, `MM`, `VLM`, `HM` and product words. 182 values end in a non-breaking space |
| 15 | `season` | Season label (lower-case header) | Several formats. 597 cells are real dates and 267 are text dates in `Sales_Hazaribagh.xlsx` |
| 16 | `Qty` | Signed quantity | Negative on a return or exchange line |
| 17 | `Rate` | Sale-time MRP per unit. Not cost | `Qty` x `Rate` = `Gross Amt` on every line. Text `NaN` on 1 line (Vaishnavi FY) and 5 lines (`Sales_Hazaribagh.xlsx`) |
| 18 | `Gross Amt` | `Qty` x `Rate` | Negative on returns |
| 19 | `Disc%` | Discount percentage | 0 on many lines that carry a rupee discount. 100 on carry bags and free gifts |
| 20 | `Disc Amt` | Rupee discount | Negative on sale lines, positive on return lines |
| 21 | `Net Amount` | `Gross Amt` + `Disc Amt` | Paise kept. One cell holds a space |
| 22 | `Bill Amount` | Bill total in whole rupees | First line only |
| 23 | `Cash` | Cash part of the bill | First line only |
| 24 | `Card` | Card part of the bill | First line only. Whether UPI is inside `Card` is not stated |
| 25 | `Credit` | Credit part of the bill | First line only. 0 on every bill in every file |

Synthetic example (not KDPS data), 15 of the 25 columns. One bill: a shirt at 10%, jeans with a rupee discount and 0%, and a returned trouser in the same bill.

| Bill Date | Bill No | Item | Qty | Rate | Gross Amt | Disc% | Disc Amt | Net Amount | Bill Amount | Cash | Card | Credit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-01-05 | `26-27/XXX/1` | SHIRT | 1 | 1000 | 1000 | 10 | -100 | 900 | 1000 | 400 | 600 | 0 |
| (blank) | (blank) | JEANS | 1 | 700 | 700 | 0 | -100 | 600 | (blank) | (blank) | (blank) | (blank) |
| (blank) | (blank) | TROUSER | -1 | 500 | -500 | 0 | 0 | -500 | (blank) | (blank) | (blank) | (blank) |

**Two variants of the same report**

- First-line variant (`sales-bill-line-25`). `Bill Date`, `Bill No`, `Customer`, `Phone`, `Sub Category`, `Bill Amount`, `Cash`, `Card` and `Credit` sit on the first line of a bill only. Continuation lines leave them blank.
- Repeat variant (`sales-bill-line-25-repeat`). `Bill Date` and `Bill No` repeat on every line. `Customer`, `Phone`, `Sub Category`, `Bill Amount` and the tenders stay on the first line only. Seen in the Jainsons Hazaribagh `Sales_Hazaribagh.xlsx` and the Hazaribagh LP sheet, and in the Sanskar sheet.
- The same Hazaribagh bills appear in both variants: `Sales_Hazaribagh.xlsx` (repeat) and the three `jsl/` files (first-line). The report seems to have an option for repeating date and bill number (guess).
- Brand-cut files. The Allen Solly Deogarh sheets and the Hazaribagh LP sheet hold only one brand's lines. `Bill Amount` and the tenders still describe the whole bill, so they do not add up to the lines you see. The first 3 lines of `AS SALE ` and the first 4 of `LP2 SALE ` have no bill header at all.

**Identities that held on every line or bill checked**

- `Gross Amt` = `Qty` x `Rate`, and `Net Amount` = `Gross Amt` + `Disc Amt`. Exceptions are the lines with text in `Rate` or `Net Amount`.
- `Bill Amount` = `Cash` + `Card` + `Credit` on every bill in every file.
- `Bill Amount` is the sum of the bill's `Net Amount` rounded half up to the rupee. In the Vaishnavi FY 2025-26 file 5,361 of 5,383 bills do so, 3 round up from a fraction below one half, and 19 differ by more than 1 rupee. The `jsl/fy 25-26 sales.xlsx` file has 126 such bills of 4,611.
- Bill dates only go up from the first line to the last.

**Returns, carry bags, gifts and discounts**

- A return is a negative-quantity line inside a normal bill, an exchange. In the Vaishnavi FY 2025-26 file 326 of the 327 bills with a return line also hold a sale line. No field links a return to its original bill.
- `Disc Amt` flips sign with the quantity: positive on return lines (190 lines in the Vaishnavi FY file).
- Carry bags are sold as items: item `CARRY BAG`, brand = the store's name, rate 6, 7, 15 or 25 rupees, `Disc%` 100, net 0. About 8,200 pieces in the Vaishnavi FY file and 7,000 in `Sales_Hazaribagh.xlsx`.
- Free gifts are ordinary items with `Disc%` 100 and net 0: 1,368 lines in the Vaishnavi FY file and 223 in `Sales_Hazaribagh.xlsx` (besides carry bags).
- `Disc%` 0 with a non-zero `Disc Amt`: 665 lines in the Vaishnavi FY file, 1,308 in `Sales_Hazaribagh.xlsx`, 894 in `jsl/fy 25-26 sales.xlsx`. On 96 lines of the Vaishnavi FY file `Disc%` is not zero and still disagrees with `Disc Amt` / `Gross Amt`.
- Bills with `Bill Amount` 0 and no tender: 110 in the Vaishnavi FY file. Some are gift-only bills. Eight bills have a negative `Bill Amount` and a negative tender (refund bills).

**Rows after the data**

- Most files end with a total row: `Qty`, `Gross Amt`, `Disc Amt`, `Net Amount`, `Bill Amount`, `Cash`, `Card` (`Credit` blank).
- Then a row with the label `SALES RETURN` in the `Customer` column, a blank row, and the total row again. The `SALES RETURN` section is empty in every file seen. Returns are lines inside bills.
- The Vaishnavi FY 2025-26 file has no total row. Brand-cut files have none.
- In `Sales_Hazaribagh.xlsx` the total row covers only financial year 2026-27 (9,323 pieces) although the file holds two years. The total seems to restart at the financial year (inferred).
- Totals do not agree with each other: in `jsl/fy 25-26 sales.xlsx` the `Net Amount` total is Rs 2,03,01,335.87 and the `Bill Amount` total Rs 2,01,48,269.14.

**What no sales report holds**

- No tax split or tax rate, no `HSN`, no time of day.
- No UPI tender (see `Card`), no payment reference.
- No line cost.
- No billing device or store field (the store code is inside `Bill No` only).
- No link from a return to its original bill.
- No loyalty or voucher fields.

**Files and counts**

| File | Variant | Lines | Bills | Dates | Bill numbers |
| --- | --- | --- | --- | --- | --- |
| `Q&A-req-recieved/SALE REPORT FORMAT.xlsx` | First-line | 54 | 21 | 12 to 13 Jun 2026 | `26-27/SGMR/1263` to `/1283` |
| `store-analysis/VAISHNAVI/SALE REPORT 1 APRIL 25 TO 31 MARCH 26.xlsx` | First-line | 15,285 | 5,383 | 3 Apr 2025 to 31 Mar 2026 | `25-26/DEO/1` to `/5383` |
| `store-analysis/VAISHNAVI/SALE REPORT 1st Apr 26 TO 13th Jun 26.xlsx` | First-line | 2,548 | 919 | 1 Apr to 13 Jun 2026 | `26-27/DEO/1` to `/919` |
| `store-analysis/jsl/fy 25-26 sales.xlsx` | First-line | 17,039 | 4,611 | 4 Sep 2025 to 31 Mar 2026 | `25-26/JSL/1` to `/4611` |
| `store-analysis/jsl/fy 26-27 sales.xlsx` | First-line | 7,397 | 2,029 | 1 Apr to 30 Jun 2026 | `26-27/JSL/1` to `/2029` |
| `store-analysis/jsl/june sales report.xlsx` | First-line | 2,251 | 595 | 1 to 29 Jun 2026 | `26-27/JSL/1418` to `/2012` |
| `store-analysis/hazaribagh/Sales_Hazaribagh.xlsx` | Repeat | 26,195 | 7,094 | 4 Sep 2025 to 24 Jul 2026 | `25-26/JSL/1` to `/4611`, `26-27/JSL/1` to `/2484` |
| `monthly-reports-april-may-2026/2026-04/DATA/LP sales & soh HAZARIBAGH.xlsx` (`Sheet1`) | Repeat | 371 | 105 headers | 1 to 30 Apr 2026 | `26-27/JSL/12` to `/901` |
| `monthly-reports-april-may-2026/2026-04/DATA/SANSKAR LOUIS PHILIPPE SALE REPORT .xlsx` | Repeat | 51 | 30 | 2 to 28 Apr 2026 | `26-27/SAN/34` to `/1238` |
| `monthly-reports-april-may-2026/2026-04/DATA/AS  & LP2  APR 26 SALE  AND SOH AS-DEO.xlsx` (`AS SALE `) | First-line | 178 | 42 headers | 2 to 30 Apr 2026 | `26-27/DEOT/6` to `/187` |
| Same file (`LP2 SALE `) | First-line | 35 | 5 headers | 3 to 24 Apr 2026 | `26-27/DEOT/10` to `/131` |

Notes on the table:

- Line counts include the few lines with a blank `Item`.
- The two Hazaribagh series overlap the `jsl/` files: 6,639 bill numbers are in both. `jsl/june sales report.xlsx` is a subset of `jsl/fy 26-27 sales.xlsx`. `Sales_Hazaribagh.xlsx` also holds 455 later bills (to 24 Jul 2026).
- `Sheet2`, `Sheet3` and `Sheet4` of the `jsl/fy 25-26 sales.xlsx` workbook are leftovers: a kids-brand pivot, a brand, customer and phone list (113 rows) and a phone pivot. `Sheet2` of `Sales_Hazaribagh.xlsx` is a pivot.

**Bill series codes seen** (the codes in `Bill No`)

| Code | Seen in | Store (guess, from file names, store list and the DSR) |
| --- | --- | --- |
| `DEO` | Vaishnavi Deoghar files, Deoghar Louis Philippe sheet | Vaishnavi Deoghar |
| `SGMR` | `SALE REPORT FORMAT.xlsx`, Singh More DSR | Vaishnavi Singh More (the DSR header names it) |
| `JSL` | `jsl/` files, `Sales_Hazaribagh.xlsx`, Blackberry and Mufti vouchers | Jainsons Lifestyle, Hazaribagh |
| `VAB` | Banka sale sheet | Vaishnavi Banka |
| `DEOT` | Allen Solly Deogarh sheets | Allen Solly Deogarh (file name `AS-DEO`) |
| `DMK` | Dumka sheets | MBO Dumka |
| `LBKR` | Bokaro sheet | MBO Bokaro |
| `SAN` | Sanskar sheet | Not in the store list; unknown |
| `LEEDEO` | Mufti vouchers | Lee Deogarh |
| `GAYA` | Blackberry and Mufti vouchers | MBO Gaya |

The full code table is in [stores-and-codes.md](stores-and-codes.md). The number format `YY-YY/CODE/n` is what `PRD-POS-020` calls a bill series per registration and financial year; whether the code is a device, a Store or a registration is OPEN (see Open questions).

### 4.2 Cut-down sales layouts

These carry the same column names as `sales-bill-line-25`, in the same order, with columns removed. They are probably the same report with fewer columns chosen, or the 25-column file edited by staff (guess).

**`sales-banka-19`** (`APR SALE & STOCK REPORT BANKA.xlsx`, sheet `sale report`)

- Header row 1, leading blank column. Columns: `Bill Date`, `Bill No`, `Item`, `Brand`, `Color`, `Size`, `Design No`, `Barcode`, `SalesMan`, `Sub Category`, `Gender`, `Fit`, `season`, `Qty`, `Rate`, `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount`.
- No `Customer`, `Phone`, `Bill Amount` or tender columns. There is no payment information at all.
- `Bill Date` and `Bill No` on every line; `Sub Category` on the first line of a bill only (566 of 1,586 lines); `SalesMan` on every line.
- 1,586 lines, 566 bills, 1 to 30 April 2026, qty 1,631, gross Rs 22,17,929, net Rs 18,00,949.45. One total row, two blank rows, the total again.
- An autofilter on `Item` and `Brand` hides 1,558 of 1,588 rows. Only a Van Heusen family view is visible.

**`sales-vasdeo-15`** (`LP SALE REPORT & STOCK REPORT APRIL'2026 VAS-DEO.xlsx`, sheet `SALE REPORT`)

- Header row 1 from column A. Columns: `Bill Date`, `Bill No`, `Customer`, `Phone`, `Item`, `Brand`, `Size`, `Design No`, `Barcode`, `Qty`, `Rate`, `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount`.
- `Bill Date` and `Bill No` on every line; `Customer` and `Phone` on the first line of a bill.
- 138 lines, 57 bills, 1 to 30 April 2026, Louis Philippe only. No total row.

**`sales-bokaro-13`** (`LP Sale with Closing SOH report April 2026_BOKARO.xlsx`, sheet `Sale`)

- Header row 1 from column A. Columns: `Bill Date`, `Bill No`, `Customer`, `Item`, `Brand`, `Size`, `Design No`, `Barcode`, `Qty`, `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount`, then an unlabelled column N.
- Column N is a lookup staff added: `Discount`, `No Discount` or `#N/A` (49 lines and the total row, because the lookup file was closed).
- No `Rate`. `Disc Amt` is positive on every line, the opposite sign of the 25-column report. `Disc%` is 30 or 0: the sheet is already worked, not a raw POS export.
- 90 lines, 54 bills, 1 to 30 April 2026, Louis Philippe only. `Customer` (`CASH`) on every line. One total row.

**`sales-dumka-headerless`** (`LP_APRIL SALE REPOT_DUMKA.xlsx`, sheets `AS-SALE`, `LP-SALE`, `VH-SALE`)

- No header row. Positions: A date; B empty; C bill number (`26-27/DMK/n`); D empty; E barcode; F brand; G item; H design number; I `0` on every row (unknown); J size; K quantity; L rate (MRP); M gross amount; N or O net amount.
- The net amount sits in N on 73 rows and in O on 20 rows, and in both on 2 rows. The sheets are misaligned.
- 71, 16 and 8 data rows. No customer, no tender, no total row. In `AS-SALE` row 1 is empty and a filter hides 24 rows (Allen Solly family visible).
- A reader that takes row 1 as the header drops or mislabels the first data row.

## 5. Stock layouts

### 5.1 Movement statement: `soh-movement-23` and `soh-movement-22`

Header row 1, leading blank column. 23 columns with `Color` (`SOH REPORT FORMAT.xlsx`), 22 without (`jsl/soh30626.xlsx`).

What a row means: one barcode, that is one style, colour and size. It is not one piece. Opening quantity plus the signed movements equals closing quantity `Tqty`. Zero-balance rows are kept.

| # | Column | Meaning | Quirks |
| --- | --- | --- | --- |
| 1 | `Item Name` | Item type | |
| 2 | `Brand` | Brand name or code | Names and codes mix |
| 3 | `Color` | Colour, a `PREMIUM` / `MEDIUM` / `ECONOMY` / `ASSO.` tag or a code | Only in the 23-column file. 6,237 `PREMIUM`, 3,799 `ASSO.`, 2,647 `MEDIUM`, 696 `ECONOMY`, 458 `WORK` of 22,387 rows |
| 4 | `Size` | Size | Blank on 250 rows (23 columns) and 14 rows (22 columns) |
| 5 | `Supplier` | Supplier legal name as held on the item | KDPS's own legal name appears for own or transferred stock. Blank on 21 and 33 rows |
| 6 | `Barcode` | Barcode or in-house code | One row per barcode, no duplicates. Numbers when all digits |
| 7 | `Design No` | Style or design code | Some become dates in Excel (97 and 112 cells) |
| 8 | `Category` | Category word or code | Words and codes mix |
| 9 | `Gender` | Gender or kids group | 24 spellings in the 23-column file |
| 10 | `Fit` | Fit, `LM`/`MM`/`VLM`/`HM` code or product word | Non-breaking spaces |
| 11 | `Season` | Season label | 7,135 of 22,387 cells are dates (23 columns); 878 of 29,368 (22 columns) |
| 12 | `Op Qty` | Opening quantity at the start of the period | Blank on some rows, 0 on others. The period is not in the file |
| 13 | `Purchase` | Quantity bought | Empty on every row in both files |
| 14 | `Sale` | Quantity sold, negative | Returns appear netted in it (inferred; `Sl Ret` is empty). Positive on 4 and 15 rows |
| 15 | `Adjustment` | Stock adjustment | Empty on every row |
| 16 | `Sl Ret` | Sales return | Empty on every row |
| 17 | `St Trf` | Stock transferred out, negative | |
| 18 | `Stf Reciept` | Stock received by transfer, positive | Header spelled this way. All stock arrives by transfer in `soh30626.xlsx` |
| 19 | `Pur Ret` | Purchase return | Empty on every row |
| 20 | `Tqty` | Closing quantity | `Op Qty` + `Purchase` + `Sale` + `Adjustment` + `Sl Ret` + `St Trf` + `Stf Reciept` + `Pur Ret` on every row. No negative balance |
| 21 | `Mrp` | Current MRP per unit | Not the sale-time price. It changes over time |
| 22 | `Rate` | Unit cost (inferred). Not MRP | Above `Mrp` on 47 rows (23 columns) and 29 rows (22 columns). `Mrp` 0 or blank on 1 and 20 rows. Whether GST is inside is not stated |
| 23 | `Amount` | `Tqty` x `Rate`, unrounded | `Rate` is shown to 2 decimals, so `Amount` differs from `Tqty` x shown `Rate` by a few paise on 17 and 11 rows |

Facts per file:

- `SOH REPORT FORMAT.xlsx`: 22,387 rows, 9,985 with stock and 12,402 at zero. Opening 18,462, sale -2,779, transfers out -2,805, transfers in +4,737, closing 17,615. `Amount` Rs 1,70,00,216.02. No store name and no period in the file.
- Which store: probably Vaishnavi Singh More. All 46 distinct barcodes sold in `SALE REPORT FORMAT.xlsx` are in it, and almost none are in the Deoghar or Hazaribagh stock files (inferred). Its `Sale` column covers those sales.
- `jsl/soh30626.xlsx`: 29,368 rows, 17,643 with stock and 11,725 at zero. Opening 58,613, sale -7,548, transfers out -2,477, transfers in +10,139, closing 58,727 pieces, of which 31,032 are carry bags. `Amount` Rs 4,03,52,910.10.
- Period of `soh30626.xlsx`: `Sale` equals minus the net sales quantity of `jsl/fy 26-27 sales.xlsx` for 1 Apr to 29 Jun 2026 on all 29,368 barcodes (total 7,548). The file name says 30-06-26 (inferred: the statement runs to the day before its name).
- The last row has no barcode: it holds the totals of the movement columns, `Tqty` and `Amount`. It reconciles with the lines in both files.

### 5.2 Stock-details snapshot: `soh-stock-details-14` and `soh-stock-details-offer-14`

`soh-stock-details-14`, header row 1. Columns: `Item Name`, `Brand`, `Size`, `Supplier`, `Barcode`, `Design No`, `Category`, `Gender`, `Fit`, `Season`, `Tqty`, `Mrp`, `Rate`, `Amount`.

| Column | Meaning | Quirks |
| --- | --- | --- |
| `Item Name`, `Brand`, `Size`, `Supplier`, `Barcode`, `Design No`, `Category`, `Gender`, `Fit`, `Season` | As in the movement statement | Same quirks |
| `Tqty` | Quantity on hand at the export | Zero rows kept in Vaishnavi `Sheet1` and the Hazaribagh `Sheet2`; absent in the Dumka sheets and Vaishnavi `Sheet2` |
| `Mrp` | Current MRP per unit | |
| `Rate` | Unit cost (inferred) | 24 SKUs have cost above `Mrp` in the Vaishnavi file (analysis file `Vaishnavi-SOH-data-errors.xlsx`) |
| `Amount` | `Tqty` x `Rate` | |

- `store-analysis/VAISHNAVI/VAISHNAVI DEOGHAR 12-06-2026 SOH.xlsx`:
  - `Sheet1`: 33,381 barcode rows, 24,576 at zero, 8,805 with stock. A blank row, then a total row (`Tqty` 13,375, `Amount` Rs 1,79,81,513.78) that does not match the lines (13,354 and Rs 1,79,81,382.52).
  - `Sheet2`: the 8,805 rows with stock. Season is cleaned to `SS-yy`, `AW-yy` or `SEASON(Mon-yy)` (3,007 rows differ from `Sheet1`); brand differs on 660 rows, size on 410, gender on 40 and item name on 34. An unlabelled 15th column holds HSN-like codes on 41 rows. It looks hand-cleaned (inferred).
  - `Sheet3` is empty.
- `monthly-reports-april-may-2026/2026-04/DATA/DUMKA_STOCK DETAILS APRIL2026.xlsx`: sheets `VH` (319 rows), `PE` (18), `LP` (240), `AS` (556). All rows have stock. No total row. `PE` has one row that looks hand-keyed, with a different shape (inferred).
- `LP sales & soh HAZARIBAGH.xlsx` `Sheet2`: 5,595 rows, 1,999 at zero, 1 negative. A filter on `Brand` (LP family) hides 5,008 rows.
- `Season` here holds dates and text dates such as `29-04-2025`.

`soh-stock-details-offer-14` (`store-analysis/hazaribagh/SOH_Hazaribagh.xlsx`): header row 1, columns `Item Name`, `Brand`, `Category`, `Gender`, `Fit`, `Design`, `Size`, `Barcode`, `Supplier`, `Tqty`, `Mrp`, `Rate`, `Amount`, `OFFER`.

- Different order from the 14-column snapshot. The header is `Design`, not `Design No`. There is no `Season` and no `Color`.
- 17,051 rows, all with stock. A barcode that sold out is not listed, so the file cannot show stock-outs. 26,736 pieces. The file was created on 24 Jul 2026.
- `OFFER` is `IN OFFER` on 732 rows and `NOT IN OFFER` on 16,319.
- A total row (`Tqty` 26,736, `Amount` Rs 3,85,50,679.28). Its `Amount` is Rs 4,81,673.22 above the sum of the lines. The pieces agree.
- `Sheet2` is a leftover pivot (brand by sum of `Tqty`, `Rate`, `Mrp`, filtered to `Gender` FEMALE). "Sum of Rate" adds unit costs, which means nothing.

### 5.3 Minimal stock lists

- `soh-minimal-bokaro-7` (`LP Sale with Closing SOH report April 2026_BOKARO.xlsx`, sheet `Stock`): `Item Name`, `Brand`, `Design`, `Size`, `Barcode`, `Tqty`, `Mrp`, then an empty unlabelled column. 694 rows, 1,053 pieces, all with stock. No cost, no supplier, no season, no total.
- `soh-minimal-vasdeo-8` (`LP SALE REPORT & STOCK REPORT APRIL'2026 VAS-DEO.xlsx`, sheet `STOCK REPORT`): `Barcode no`, `Brand`, `Product`, `Style code`, `Store Name`, `Size`, `Till Date Qty`, `MRP`. 840 barcode rows, 1,178 pieces. `Store Name` is `Vaishnavi Deoghar` on every row. The last row is a free-text note in the `Barcode no` column: `NOTE: 19 PCS JEANS SHORT`.

### 5.4 Stock ledger (opening, inward, sold, till date)

These are the store's own Excel, probably copies of the `Stock In` sheet of a store workbook such as the Singh More DSR (inferred from the matching column names). They are not POS exports. One row is one barcode. `Date` and `Bill no` show one inward document for the barcode.

| # | `soh-ledger-14-store` | `soh-ledger-14-season` and headerless | Meaning and quirks |
| --- | --- | --- | --- |
| 1 | `Date` | `Date` | Date of the inward document. Real dates (24 Dec 2021 to 29 Apr 2026) in Banka. Excel serial numbers on 7,025 rows of `AS SOH ` |
| 2 | `Bill no` | `Bill no` | Document number or a label: `Scan Stock` (105 rows), `Audit Differance` (78) in Banka; `Opening Stock` (14), `Audit Diff` (23) in `AS SOH ` |
| 3 | `Barcode no` | `Barcode no` | One row per barcode |
| 4 | `Brand` | `Brand` | |
| 5 | `Product` | `Product` | Item type |
| 6 | `Style code` | `Style code` | `#N/A` on 1 Banka row |
| 7 | `Store Name` | `Season` | Banka holds one store name. The other layout holds a season, empty on almost every row |
| 8 | `Size` | `Size` | `#N/A` on 2 Banka rows |
| 9 | `Stock Opening Qty` | `Stock Opening Qty` | Blank on 6,664 of 12,177 Banka rows |
| 10 | `Stock Inward` | `Stock Inward` | Blank on 4,513 Banka rows |
| 11 | `Qty Sold` | `Qty Sold` | One negative row in Banka |
| 12 | `Till Date Qty` | `Till Date Qty` | Opening + inward - sold on every row |
| 13 | `MRP` | `MRP` | |
| 14 | `Total MRP` | `Total MRP` | `Till Date Qty` x `MRP` on every row |

- Banka `STOCK REPORT` (`APR SALE & STOCK REPORT BANKA.xlsx`): 12,177 rows, till-date quantity 21,771, every row above 0. A filter on `Brand` hides 11,755 of 12,178 rows (Van Heusen family visible).
- `AS SOH ` (`AS  & LP2  APR 26 SALE  AND SOH AS-DEO.xlsx`): 10,371 rows. 7,246 have a barcode (5,124 of them at zero). 3,125 are filler rows with `0` in `Qty Sold`, `Till Date Qty` and `Total MRP` only. 7,410 rows are hidden.
- `LP2 SOH `: 336 rows, 490 pieces. It is the source of the Bokaro voucher SOH (see 7).
- Dumka `AS-SOH` (804 rows), `LP-SOH` (360), `VH-SOH` (322): the same positions as `AS SOH ` with no header row. The first data row sits where the header would be. Rows at zero (288, 128, 104) are hidden. Column G (season) and most of column I (opening) are empty.

**Which stock layout each Store gave**

| Store (guess) | Layout | File |
| --- | --- | --- |
| Vaishnavi Deoghar | `soh-stock-details-14`, `soh-minimal-vasdeo-8` | `VAISHNAVI DEOGHAR 12-06-2026 SOH.xlsx`, Deoghar April sheet |
| Jainsons Hazaribagh | `soh-movement-22`, `soh-stock-details-offer-14`, `soh-stock-details-14` | `soh30626.xlsx`, `SOH_Hazaribagh.xlsx`, `LP sales & soh HAZARIBAGH.xlsx` |
| Vaishnavi Singh More | `soh-movement-23` (inferred) | `SOH REPORT FORMAT.xlsx` |
| Vaishnavi Banka | `soh-ledger-14-store` | Banka `STOCK REPORT` |
| Allen Solly Deogarh | `soh-ledger-14-season` | `AS SOH `, `LP2 SOH ` |
| MBO Dumka | `soh-stock-details-14`, `soh-ledger-14-headerless` | `DUMKA_STOCK DETAILS APRIL2026.xlsx`, `LP_APRIL SALE REPOT_DUMKA.xlsx` |
| MBO Bokaro | `soh-minimal-bokaro-7` | Bokaro `Stock` sheet |

The Store layouts differ, so a saved layout is per Store and per report (`PRD-IMP-003`).

## 6. The DSR workbook (the store's own Excel)

`bank-statement/3. Vaishnavi Singh More DSR(Fy-26-27).xlsx` is a daily sales report workbook of Vaishnavi Singh More for FY 2026-27. It is a Google Sheets export with formulas, pivots and one threaded comment. Store staff type the sales lines and deposits; formulas do the rest. [store-close-cash-and-bank.md](store-close-cash-and-bank.md) covers its cash and bank use. Layouts only here.

**`dsr-sale-32`** (`Sale`, header row 3). Rows 1 and 2 hold subtotals and the message `No Blank Or Error Cell`.

`Date`, `Manual Bill No.`, `Online Bill No.`, `Sale Person`, `Barcode No.`, `Brand`, `Product`, `Style Code`, `Store Name`, `Size`, `Quantity`, `MRP`, `Total MRP`, `Cash`, `Online UPI`, `Swip`, `Dues Sale`, `Cash`, `UPI`, `Swip`, `Tid No`, `NSV`, `Discount`, `GST%`, `Taxable Amount`, `GST`, `Check`, `Reason for Discount or Dues`, `Dis %`, `Margin`, `Year`, `Month`.

- Typed per line: `Date`, `Online Bill No.` (the POS bill number, `26-27/SGMR/n`), `Barcode No.`, `Quantity` and the tender amounts. `Brand`, `Product`, `Style Code`, `Size` and `MRP` are looked up from `Stock In` by barcode.
- The second `Cash`/`UPI`/`Swip` trio is dues recovery. `Swip` is the card swipe machine.
- Formulas: `NSV` = cash + UPI + swipe + dues sale. `Discount` = `Total MRP` - `NSV` (derived, not entered). `GST%` is picked by line value: 10.71 below Rs 2,500, otherwise 15.2542 (12/112 and 18/118). The CA must confirm the slab. `Taxable Amount` = `NSV` - `GST`. `Margin` equals `Taxable Amount`, so no cost is involved. `Check` returns 0 in both cases.
- `Manual Bill No.`, `Sale Person` and `Tid No` are empty on every row.
- 4,780 data lines, 1,225 bills, 1 Apr to 5 Jun 2026: 5,967 pieces, Rs 74,75,948 at MRP, `NSV` Rs 31,41,850.84. Formulas run to row 20,993 (dates to April 2027).
- 586 lines are carry bags at Rs 7 (585) or Rs 6 (1), mostly at 100% discount. 105 lines are returns. 479 lines carry a reason text, mostly stock-transfer labels (`Stock Transferr` is a typo, 374 lines). 2,238 lines have zero tender and 100% discount; 2,037 of them have no reason. Three lines hold a `Dues Sale` value.

**`dsr-cash-14`** (`Cash`, header row 3): `Date`, `Opening Balance`, `Cash`, `UPI`, `Swip`, `Dues`, `Cash`, `UPI`, `Swip`, `NSV`, `Bank Deposit`, `Cash Transfer to Ho`, `Ac No. / Person`, `Closing Balance`.

- One row per day (377 dated rows, to 12 Apr 2027). Each day sums the `Sale` sheet by date. Closing = opening + cash sales - deposit - HO transfer + cash dues recovered. UPI and card never enter the cash balance.
- Only the 1 April opening is typed. 33 deposits and 3 head-office transfers are typed. `Ac No. / Person` is filled on 3 rows (bank or personal data). There is no counted-cash or variance column.

**`dsr-stock-in-pivot`** (`Stock In`, header row 3): a pivot over `Stock Inward Details`. Label columns A to F are blank in the export. Columns `Sold QTY`, `Till Date Qty`, `MRP`, `Total MRP` are formulas. Row 2 holds totals: 23,623 inward, 5,967 sold, 17,656 on hand, Rs 2.74 crore at MRP. Sales are counted from 1 Apr 2026 only while inward starts in Oct 2024, so on-hand may count items sold earlier (guess).

**`dsr-stock-inward-10`** (`Stock Inward Details`, header row 3; row 1 holds the store name and totals, row 2 a validation helper): `Date`, `Invoice No`, `Barcode no`, `Brand`, `Product`, `Style code`, `Size`, `QTY`, `MRP`, `Total MRP`.

- 12,123 lines, 666 document labels, 11,964 barcodes, 23,623 pieces, 1 Oct 2024 to 2 Jun 2026.
- `Invoice No` is in two styles (`WH\S-n` and `25-26/WH/S-n`). 77 lines are labelled `Audit Diff`, 136 pieces: stock found at audit and added as inward.

**`dsr-bank-reconciliation-20`** (`Bank Reconciliation`, header row 3): `Date`, `Store Name`, `MID No`, `Opening Balance`, `Total Revenue`, `Cash sale`, `Swip Amt`, `Swip Satt Amt`, `Bank Charge (%)`, `Online UPI`, `UPI Satt Amt`, `Dues Sale`, `Dues Recover`, `Cash Dues Recover`, `UPI Dues Recover`, `Swip Dues Recover`, `Bank Deposit`, `Cash Transfer to (HO)`, `Bank Deposit Verified`, `Outstanding Balance`.

- A copy of another store's sheet (Vaishnavi Banka, 1 Apr to 15 Sep 2025). Its links to `Sale` fail: 9,570 `#ERROR!` and 2,162 `#VALUE!` cells. Only 91 hand-typed UPI settlement amounts remain.
- `MID No` is a card terminal merchant identifier (bank data). One such cell is formatted as a date with an impossible serial. A reader must not stop on it.
- `Satt` means settlement.

**`dsr-petty-cash-18`** (`Petty Cash`, header row 2): `Date`, `Opening Balance`, `Petty Cash Received`, `Staff Salary`, `Tea Snacks`, `Alteration`, `Courier & Cargo Exp`, `Wow Bill/ Incentive Expance`, `Rent`, `Electricity Bill`, `Water Exp`, `Net Charge`, `Show Room Repaire  Maint. Exp`, `Printing & Stationery Exp`, `Other Exp.  (if any)`, `Total Expance`, `Reason of Other Exp.`, `Closing Balance`. Pre-dated to 30 Apr 2027. Every figure is 0. Not in use yet. Some header cells hold line breaks and double spaces.

`SOH & Sale Summary` is a second pivot, empty except a total row.

## 7. Brand report: "List of Sales Vouchers" and "List of Stock Details"

KDPS staff or the ERP team build one workbook per brand and month in a Tally-style report layout (guess). It is not a POS output. The titles read like Tally list reports (guess). In the PRD, "Voucher" means a Tally entry; here it is only the name of the report.

**`brand-voucher-sales-14`** (`SALES`, header row 4)

- Three title rows in merged cells: `KDPS LIFESTYLE PVT. LTD.`, `List of Sales Vouchers`, `Voucher Series : <brand> (From dd-mm-yyyy To dd-mm-yyyy)`. The Mufti files have two title rows and the header on row 3.
- Columns: `Date`, `Vch/Bill No.`, `Particulars`, `Item Details`, `Brand`, `Size`, `Style Code`, `Barcode`, `Unit`, `Qty.`, `Price`, `Dis %`, `Dis ` (trailing space), `Total`.

| Column | Meaning | Quirks |
| --- | --- | --- |
| `Date` | Sale date | Copied 1:1 from `Bill Date` |
| `Vch/Bill No.` | Bill number | `Vch/Bill No` without the dot in Blackberry and Mufti |
| `Particulars` | Party | The word `CASH` on every line (hard-coded) |
| `Item Details` | Item type | |
| `Brand` | Brand | Names and codes mix (`LP`, `LOUIS PHILIPPE`, `LY`, `LR`) |
| `Size` | Size | |
| `Style Code` | The POS `Design No` | |
| `Barcode` | Barcode | |
| `Unit` | Unit | The word `PCS` (hard-coded) |
| `Qty.` | Quantity | Negative on returns |
| `Price` | The POS `Gross Amt` of the line, not the rate | `MRP` in Blackberry |
| `Dis %` | Percentage of the brand-offer calculation | Not the POS `Disc%` |
| `Dis ` | Discount amount | `Dis Amount` or `Dis Amt` elsewhere. Positive in the April files, negative in the June Blackberry file |
| `Total` | `Price` minus discount | Differs from the POS net in 5 of the 6 April stores |

- Unlabelled columns after `Total`: column O holds the `AMM` lookup result (`Discount`, `No Discount`). In the Deoghar April file columns P to R hold the POS `Disc %`, `Disc Amt` and `Net Amount`. In the May files P to R are source discount columns.
- Each file ends with a total row.
- Rows are in the order of the POS file, one voucher line per POS line.
- The period in the title does not always match the data. The May Blackberry file holds 52 of its 137 lines dated in April (20 Apr to 22 May). The Mufti June file still says May. The June Blackberry title says "to 30-06-2026" but the data stops on 18 Jun.
- April files cover six Stores (Louis Philippe): 90 lines (Bokaro), 138 (Deoghar), 51 (Sanskar), 99 (Hazaribagh), 35 (Allen Solly Deogarh), 16 (Dumka). May covers Blackberry (137 lines) and Mufti (48 lines).

**`brand-voucher-soh-10`** (`SOH`, header row 4; title "List of Stock Details")

- Columns: `Date`, `Item Details`, `Barcode`, `Size`, `Style Code`, `Brand`, `Qty.`, `Unit`, `MRP`, `Total MRP`.
- Rows with quantity above 0 only. `Total MRP` = `Qty.` x `MRP`.
- `Date` is 2026-05-01 on most rows, 2026-04-01 on 335 Allen Solly Deogarh rows and 2026-06-01 in the May Blackberry and Mufti files. The title says "From 01-04-2026" on some files and "From 01-05-2026" on others.
- Blackberry May: header `Units`. Blackberry June: order `Qty.`, `MRP`, `Unit`, `Total MRP`, `Total MRP` blank, every row dated 2026-04-01.
- An unlabelled store tag column (`GAYA`, `JSL`, `WH`, `VAS-DEO`, `LEE DEO`) in the Blackberry and Mufti May files and the Mufti June file.
- Copies: the Mufti June SOH is identical to the May SOH (803 rows). The Bokaro April SOH equals the Allen Solly Deogarh April SOH on all 341 rows (columns B to J). Bokaro's own 694-row `Stock` sheet was not used.
- Placeholder style code `KDPS-DEGR-MF` on 56 Mufti SOH rows and 6 sales rows. The meaning is unknown.

**`brand-fm-direction-sale-20`** (`KDPS-DIRECTION.xlsx`, `Sale Report May-26`, header row 4)

- Columns: `Date`, `Vch/Bill No`, `Particulars`, `Item Details`, `MRP`, `Barcode`, `Size`, `Style Code`, `Brand`, `Qty.`, `Unit`, `Price`, `Dis Amount`, `Total`, `BILL QTY`, `BILL VALUE`, `OFFER`, `OFFER PROPORTION`, `DISCOUNT %`, `EOSS FLAG`. Counters in `O1:S2`.
- A prepared sheet of 399 formula rows. The input cells (date, bill, item, MRP, barcode, size, style, quantity) are empty.
- `Dis Amount` and `EOSS FLAG` look up two external workbooks under `C:\Users\user\Downloads`, which are not supplied.
- `OFFER PROPORTION` points at `$P$26*$Q$26` on 375 rows and `$P$5*$Q$5` on 24 rows, not at its own row (likely a copy error).
- The `SOH` sheet holds 1,067 rows, 1,567 pieces, Rs 38,48,486 at MRP, dates as text `01-05-2026`, unit `Pcs.`.

**Other brand-side sheets (not POS exports)**

- `brand-blackberry-brand-report-13` (`BRAND REPORT`, header row 4): `Date`, `Bill No`, `Item`, `Brand`, `Size`, `Style Code`, `Barcode`, `Qty`, `MRP`, `Offer Applied`, `Final Dis %`, `Final Dis Amt`, `Final Total`. 77 lines, 1 to 18 June 2026. A `TOTALS` row: Rs 1,92,149 at MRP, Rs 1,37,456.60 final.
- `brand-blackberry-bill-summary-8` (`BILL SUMMARY`, header row 3): `Date`, `Bill No`, `Lines`, `Gross MRP`, `Offer Applied`, `Total Discount`, `Net Sale`, `Flags`. 36 bills.
- `brand-stock-tag-list-15` (`KDPS LIFE.xlsx`, brand-supplied, header row 1): `EanNo`, `SOH F`, `Item No`, `Size`, `Description`, `Sub-Category`, `Category`, `R/F`, `Category-Co`, `MRP`, `Season`, `Wizapp Code`, `Dealer Name`, `State`, `Offer`. 907 rows, 1,332 pieces. It matches the May stock file on all 888 barcodes and quantities. `State` is empty.
- The offer and AMM content of these files is in [offers-and-brand-reports.md](offers-and-brand-reports.md).

## 8. Debit-note item lines: the `SOFTWARE` sheets

`KDPS DEBIT & CREDIT NOTE DETAILS.xlsx` has two hidden sheets, `2025-26_SOFTWARE` (14,135 lines) and `2026-27_SOFTWARE` (2,291 lines). They hold the item lines of purchase returns (debit notes). They are in the sales-report column style, but they mean something else. Header row 1, leading blank column. The summary sheets `2025-26-SUMMARY` and `2026-27-SUMMARY` (`Date`, `Invoice No`, `Party Name`, `Bill Amount`) hold one row per debit note.

| # | Column | Meaning here | Quirks |
| --- | --- | --- | --- |
| 1 | `Bill Date` | Date of the debit note | 4 Apr 2025 to 31 Mar 2026 and 4 Apr to 25 May 2026 |
| 2 | `Bill No` | The supplier's original purchase invoice number being returned | Mixed text formats of many suppliers. Floats on 317 lines. One date |
| 3 | `Party` | Supplier name | 109 and 42 suppliers |
| 4 | `GSTIN` | Supplier tax number | Blank on 900 and 2 lines. Not copied |
| 5 | `Item` | Item type | |
| 6 | `Brand` | Brand | 281 and 72 brands |
| 7 | `Size` | Size | Floats and text |
| 8 | `Design No` | Design number | Floats |
| 9 | `Barcode` | Barcode | Every 13-digit value ends in `000000` (rounded): 11,853 and 1,819 lines. A barcode cannot identify the item |
| 10 | `HSN` | HSN code | Float |
| 11 | `Qty` | Quantity returned | Above 1 on 3,083 and 283 lines |
| 12 | `Rate` | Taxable rate per unit | |
| 13 | `Gross Amt` | Taxable value of the line | `Qty` x `Rate` except on 8 lines |
| 14 | `Disc%` | Discount percentage | 0 on every line |
| 15 | `Disc Amt` | Discount | 0 on every line |
| 16 | `Net Amount` | Taxable value plus GST | The ratio to `Gross Amt` is exactly 1.05, 1.12 or 1.18 on every line. No tax-rate column |
| 17 | `Bill Amount` | Equals `Gross Amt` on every line | |

- A total row: 19,235 pieces, taxable Rs 3.26 crore in 2025-26; 2,705 pieces, Rs 38.0 lakh in 2026-27.
- In this layout `Net Amount` is tax-inclusive. In the sales report it is `Gross Amt` + `Disc Amt`. The same name means two things.
- Where one debit note covers a party and a date, the `SUMMARY` amount equals the rounded sum of `Net Amount` of the `SOFTWARE` lines. 58 of the 104 rows of 2026-27 match on party and amount. The `SOFTWARE` sheet stops on 25 May 2026 and the summary runs to 15 Jun 2026.
- The `SUMMARY` dates are real dates on 112 and 26 rows and text (`dd-mm-yyyy`, `dd-mm-yy`) on 257 and 78 rows. Of 100 real dates that match a debit note in the `KDPS CN & DN SHEET` sheets, 75 have day and month swapped. 25 real dates fall after the newest text date (15 Jun 2026).
- Debit notes, claims and settlement are covered in [purchases-and-supplier-notes.md](purchases-and-supplier-notes.md).

## 9. Files that look like layouts but are not exports

- `store-analysis/Vaishnavi-SOH-data-errors.xlsx` (tabs `Summary`, `Cost above MRP`, `Season mismatch`) and `store-analysis/Vaishnavi-Dead-Stock-Worklist.xlsx` (tabs `Summary`, `By Gender`, `Non-moving stock`, `Overstock 6+ pcs`) are outputs of an earlier analysis by the ERP team. They are not POS exports.
- `bank-statement/Bank statement.xlsx` is a bank extract stitched from two downloads (see [store-close-cash-and-bank.md](store-close-cash-and-bank.md)).
- The `.skill` files and the AMM list are covered in [offers-and-brand-reports.md](offers-and-brand-reports.md).
- The PT file layouts are in [pt-file-layouts.md](pt-file-layouts.md).

## 10. Cross-checks that held

- Movement statement: `Sale` of `soh30626.xlsx` equals minus the net sales quantity of the sales files for 1 Apr to 29 Jun 2026 on all 29,368 barcodes.
- Movement statement: opening plus movements equals `Tqty` on every row of both files.
- Ledgers: opening + inward - sold = till date, and `Total MRP` = till date x `MRP`, on every row of every ledger sheet.
- Sales report: `Bill Amount` = `Cash` + `Card` + `Credit` on every bill of every file.
- Hazaribagh: the `Sales_Hazaribagh.xlsx` total for FY 2025-26 equals the `jsl/fy 25-26 sales.xlsx` total (16,846 pieces, Rs 2,53,33,569 gross, Rs 2,03,01,335.87 net).
- Debit notes: the `SUMMARY` amount equals the rounded sum of `Net Amount` of the `SOFTWARE` lines on 58 of 104 rows of 2026-27 (matched on party and amount).

These checks can become validation rules for the side-by-side test (`PRD-IMP-005`, `PRD-IMP-013`). Whether they become rules is for the product owner.

## 11. Missing from every POS export

- Inward date, supplier invoice number and receipt batch per barcode (only the season text, and only in some layouts).
- Cost history and MRP history (one cost and one current MRP per barcode).
- Cost on the sale line.
- Tax rate and tax amount.
- A piece identity (a row is a barcode).
- Time of sale, billing device, cashier.
- Movement rows for purchase, adjustment, sales return and purchase return (empty in every movement statement).
- A stock location (one file is one Store).

## Open questions

| # | Question | Owner |
| --- | --- | --- |
| 1 | Which POS and version produced each layout at each Store? What do `TEN` and `Retail Ji` name? | KDPS Owner |
| 2 | Can the POS give a one-day sales report and an end-of-day SOH in one fixed layout? The files seen cover one day to one financial year. Who sets the daily schedule (Debanjan is named as format provider)? | KDPS Owner |
| 3 | Does `Card` include UPI? Is a sales value tax-inclusive? Is SOH `Rate` cost, and is GST inside it? | Accounts, CA |
| 4 | Does the POS keep a link from a return to its original bill, anywhere? | KDPS Owner |
| 5 | What do the `Fit` codes (`LM`, `MM`, `VLM`, `HM`) and category codes such as `USM` mean? Where do they belong in the masters? | KDPS Owner; product owner for placement (`PRD-IMP-008`) |
| 6 | Why does `Sub Category` print on the first line only? Is it a POS setting? | KDPS Owner |
| 7 | What does the customer value `MANUAL BILL UPDATE` mean? | KDPS Owner |
| 8 | Are carry bags and promo gifts items in the POS item master? Which items count as gifts? | KDPS Owner |
| 9 | What period does `Op Qty` start at? The movement statements carry no period. | KDPS Owner |
| 10 | Which Store is `SOH REPORT FORMAT.xlsx`? (Singh More, inferred.) Which Store is `SAN`? | KDPS Owner |
| 11 | Is the bill series code a device, a Store or a tax registration? | KDPS Owner |
| 12 | What are the debit-note `SOFTWARE` sheets exported from? Can barcodes be exported as text? | Accounts |
| 13 | Who keeps the ledger workbooks (`STOCK REPORT`, `AS SOH `) and from what source? | KDPS Owner |
| 14 | Which layouts must stage 1 support first, and which are only evidence for the design? | Product owner |
