# PT FILE

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [Q&A-req-recieved](../README.md)

## What this folder is

33 sample supplier files that KDPS uses to build price tickets (PTs). They answer item 6 of `MOM_S.xlsx` ("BRAND PT FILE", provider Priyo, DONE; see [Q&A-req-recieved](../README.md)). The folder holds 33 files and no sub-folders. They are real supplier or distributor documents (invoices, sales registers, item lists and billing extracts) for goods bought by KDPS between Aug 2025 and May 2026 (invoice dates), not files made for the ERP team. Most were copied into this folder on 13 Jun 2026; a few keep older file dates (Dec 2025 to Apr 2026, and 3 Jun 2026 for the Madura extract). Each block gives the file date.

- The PRD's PT is a reviewed table of merchandise identity, counted coverage, approved cost, MRP and tax information. KDPS's own PT layout (the export profile) is in `PRD-PTW-008`. The PRD requires supplier-file conversion through the same reviewed records (`PRD-PTW-002`). This folder is the evidence for how different the supplier layouts are.
- Stage: the PT workbench and supplier-file conversion belong to Stage 2 (goods-in). Stage 1 imports use the manual route only (`docs/phases.md`).
- Supplier names are business names and are kept. GSTIN numbers, phone numbers, email addresses, letterhead addresses, contact persons and salesperson names appear in several files and are not copied. Cost columns are described, not listed.
- Companion notes with the layouts in machine-readable form: [pt-file-layouts.md](../../../data-notes/pt-file-layouts.md). Brand to supplier: [item-master-vocabulary.md](../../../data-notes/item-master-vocabulary.md), [purchases-and-supplier-notes.md](../../../data-notes/purchases-and-supplier-notes.md).

## How to read this README

- "Header row n" is the spreadsheet row that holds the column names (row 1 unless stated). "Item rows" counts rows that carry one SKU line; totals, filler and blank rows are listed separately. "Pieces" is the sum of the quantity column.
- Extensions lie. A reader must open the file by its content, not its extension: `AS INNERWEAR.csv` is a binary `.xls` (OLE2), `TWILLS.xls` is an `.xlsx` package, `Madura Fashion Brand AS - VH - LP.xlsb` is a binary workbook inside a zip package, and the two `.csv` files that really are CSV have no sheet. `JOCKEY-NARAYANI.xls` is 1.5 MB for 31 rows (not explained).
- Difficulty ratings (Easy, Easy-medium, Medium, Medium-hard, Hard) are the ERP team's estimate for writing a parser. They are not KDPS decisions.
- "Supplier map" lines compare the file with `SUPPLIER BRAND DETAILS.xlsx` in [Q&A-req-recieved](../README.md): the supplier that sheet gives for the brand, and its `BARCODE` flag (YES or NO).
- Words in single backticks are exact headers or values. "Blank header" means the column has no name in the file.

## The 33 files at a glance

| # | File | Real format | Sheet(s) | Header row | Item rows | Pieces | Family | Difficulty |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `36257 KDPS SUVIDHI.xls` | .xls | `Sheet1` | 1 | 55 (+1 filler) | 55 | A bare list | Easy |
| 2 | `FAHRENHEIT 60518.xls` | .xls, damaged header | `Sheet1` | 1 | 31 (+1 filler) | 35 | A bare list | Easy |
| 3 | `AMIDHARA.xlsx` | .xlsx | `ANOKHI`, `AMIDHARA` | 1 | 16 and 48 | 16 and 48 | A master-style list | Easy |
| 4 | `peppermint 13.xlsx` | .xlsx | `Sheet1` | 1 | 24 | 24 | A master-style list | Easy |
| 5 | `minelli 06161.xlsx` | .xlsx | `Table` | 1 | 10 | 10 | A master-style list | Easy |
| 6 | `kidcity 1316&1317.xlsx` | .xlsx | `BILLING FILE` | 1 | 272 | 512 | A master-style list | Medium |
| 7 | `ARVIND ALL BRAND & SPYKAR_PT.xlsx` | .xlsx | `Sheet1` | 5 | 11 | 13 | B voucher register | Easy |
| 8 | `BK ENTERPRISES_LC_PT.xlsx` | .xlsx | `Sheet1` | 5 | 13 | 13 | B voucher register | Easy |
| 9 | `DEAL SS26 2970.xlsx` | .xlsx | `Sheet1` | 5 | 55 | 108 | B voucher register | Easy |
| 10 | `ZILU BOTTOMS.xlsx` | .xlsx | `Sheet1` | 1 | 107 | 107 | B voucher register | Easy-medium |
| 11 | `BANJARAN.xlsx` | .xlsx | `Sheet1` | 1 | 11 | 37 | B cousin | Medium |
| 12 | `TWILLS.xls` | .xlsx | `VTSSalesPtFilesLedgerReport` | 1 | 47 | 69 | B ledger report | Medium |
| 13 | `STATUS QUO.xlsx` | .xlsx | `PTFiles` | 1 | 43 | 43 | B ledger report | Easy-medium |
| 14 | `SWEET DREAMS.xlsx` | .xlsx | `Report` | 3 | 24 | 24 | B accounting export | Easy |
| 15 | `KILLER JUNIOR.xlsx` | .xlsx | `Report` | 3 | 24 | 24 | B accounting export | Easy-medium |
| 16 | `BEEVEE 390.xlsx` | .xlsx | `PT EMAIL _Dont touch` | 3 | 24 | 33 | C PT EMAIL | Easy |
| 17 | `go colours 000023.xlsx` | .xlsx | `PT EMAIL _Dont touch (1)` | 3 | 46 | 46 | C PT EMAIL | Easy |
| 18 | `MUFTI.xlsx` | .xlsx | `PT EMAIL _Dont touch` | 3 | 97 | 133 | C PT EMAIL | Easy |
| 19 | `HYPHEN.xlsx` | .xlsx | `PT FILE BILL NO WISE` | 3 | 10 | 10 | C sibling | Easy |
| 20 | `JOCKEY 852.xls` | .xls | `Sheet1` | 9 | 9 | 16 | D Jockey bill-wise list | Medium |
| 21 | `JOCKEY PARAS.xls` | .xls | `Sheet1` | 9 | 43 | 146 | D Jockey bill-wise list | Medium |
| 22 | `JOCKEY-NARAYANI.xls` | .xls | `Sheet3` | 1 | 30 | 39 | D Jockey bill-wise list | Medium |
| 23 | `JOCKEY-NARVADA.xls` | .xls | `Sheet1` | 9 | 2 | 20 | D Jockey bill-wise list | Medium |
| 24 | `JOCKEY_DD SALES.xls` | .xls | `Sheet1` | 9 | 185 | 349 | D Jockey bill-wise list | Medium |
| 25 | `JOCKEY.xlsx` | .xlsx | `Sheet1` | 2 | 6 | 60 | D Jockey invoice print | Medium |
| 26 | `Peter England.CSV` | CSV | none | 1 | 28 | 33 | E Aditya Birla | Medium |
| 27 | `Madura Fashion Brand AS - VH - LP.xlsb` | .xlsb | `Sheet1` | 1 | 113,983 (5,923 are KDPS) | 8,385 (KDPS) | E Madura billing extract | Hard |
| 28 | `BLACKBERRY.xlsx` | .xlsx | `Sheet2` | 1 | 29 | 41 | E SAP-like | Easy |
| 29 | `USPOLO INNER WEAR.csv` | CSV, no header | none | none | 14 | 119 (packs) | F distributor | Medium-hard |
| 30 | `AS INNERWEAR.csv` | .xls | `INVOICE` | 16 | 10 | 155 | F printed invoice | Hard |
| 31 | `XERICS JEANS PT FILE.xlsx` | .xlsx | `GST INVOICE` | 1 and 2 | 90 | 90 | F printed invoice | Medium-hard |
| 32 | `ambreli 1855.xls` | .xls | `INVOICE`, `PACKING` (hidden) | 24 and 25 | 16 and 72 | 76 and 275 | F printed invoice | Hard |
| 33 | `DSY.xlsx` | .xlsx | `Sheet1` | 1 | 23 | 23 | F distributor | Easy-medium |

## Family A: item lists with no bill header

Six files: two bare item lists (`SUVIDHI`, `FAHRENHEIT`) and four master-style lists (`AMIDHARA`, `peppermint`, `minelli`, `kidcity`).

### 1. `36257 KDPS SUVIDHI.xls`

- Supplier and brand: not in the data. The file name carries "36257" (probably an invoice number, guess), "KDPS" and "SUVIDHI". The supplier map has a Supplier named SUVIDHI TEXTILES PRIVATE LIMITED (brand CELSIUS, barcode flag YES); that this is the same supplier is not stated (guess).
- Kind: a bare item list from an accounting program (header `SNO.`, `Item Code`). File date 15 Mar 2026; last saved by the KDPS data provider (file property).
- Real format: `.xls` (OLE2). Sheet `Sheet1`, 57 rows by 12 columns. Header row 1.
- Rows: 55 item rows (rows 2 to 56), 55 pieces (every `TOTAL QTY` is 1). Row 57 is a filler row: `SNO.` 56, no code, quantity 1, rate 0, MRP 0.
- Columns: `SNO.`, `Item Code`, `ITEM NAME`, a blank-header column D (the style code), `PACK / SIZE`, `LOT NUMBER`, `TOTAL QTY`, `C.D.`, `T.D.`, `SALE RATE`, `AMOUNT`, `M.R.P.`.
- Values: 9 style codes (14 style-and-colour names such as `12702C AMBROSIA`), sizes M, L, XL, 2XL written with a chest size (`XL (105 CMS)`). MRP 995 on 12 rows and 1045 on 43 rows. `SALE RATE` is 666.65 or 700.15, which is exactly 67% of MRP on every row. `LOT NUMBER` is `.` on every row. `C.D.` and `T.D.` are 0. Row amounts add to 38,106.25. Every cell is text.
- Barcode: `Item Code`, 12 digits starting 897665. Not a valid EAN-13 or UPC-A pattern (only 4 of 55 pass a UPC-A check by chance).
- Missing: invoice number and date, supplier, buyer, brand, HSN, GST rate, season, colour as its own field, gender.
- Adapter: Easy. Strip the filler row and read the size from the text.

### 2. `FAHRENHEIT 60518.xls`

- Supplier and brand: brand FAHRENHEIT from the file name ("60518" probably an invoice number, guess). Supplier map: INDTECH APPARELS PVT. LTD. (flag YES). File date 20 Mar 2026.
- Kind: a bare item list, same program family as SUVIDHI.
- Real format: `.xls` with a damaged OLE2 header (the reader warns that the file size and a sector table are inconsistent; a parser must tolerate it). Sheet `Sheet1`, 33 rows by 15 columns. Header row 1.
- Rows: 31 item rows (rows 2 to 32) and 35 pieces (27 rows of 1 and 4 rows of 2). Row 33 is a filler row: `SNO.` 32, no code, quantity 1, MRP 0, `TAX 3` 5.
- Columns: `SNO.`, `Item Code`, `ITEM NAME`, `PACK / SIZE`, `TOTAL QTY`, `M.R.P`, `REVISED M.R.P.`, `SALE RATE`, `AMOUNT`, `GROUP NAME`, `LOT NUMBER`, `TAX 1`, `TAX 2`, `TAX 3`, `HSN CODE`.
- Values: 9 style and colour names (for example `773600 CELERY`). `GROUP NAME` is `T-SHIRTS` on every row. `LOT NUMBER` is `IND` on 30 rows and `1` on one. `TAX 3` is 5 on every row (a rate in percent, inferred); `TAX 1` and `TAX 2` are blank. HSN is 61059090 (27 rows) or 61099090 (4 rows). MRP is 895 (26 rows), 1295 (4 rows) or 995 (1 row); `REVISED M.R.P.` equals `M.R.P` on every row. `SALE RATE` is 67% of MRP. Sizes are written two ways: `L     (1 MTR.)` and `M/1.05 m`, plus plain `XL`, `L`. Every cell is text.
- Barcode: `Item Code`, 13 digits, all valid EAN-13 (31 of 31), starting 8901000 or 8903942.
- Missing: invoice number and date, supplier, buyer, brand column, season, gender.
- Adapter: Easy, but the reader must tolerate the damaged header.

### 3. `AMIDHARA.xlsx`

- Supplier and brand: brands ANOKKHI (item descriptions `KIDS SAREE` and `KIDS TULIP`) and AMIDHARA (`JACKET PLAZO` and `PLAZOO`). Supplier map: both brands to SHRI SAI ENTERPRISES (flag YES). File date 13 Jun 2026.
- Kind: two item lists in one workbook with different layouts.
- Real format: `.xlsx`. Two sheets, both header row 1.
- Sheet `ANOKHI` (the data spells the brand `ANOKKHI`): 17 rows by 11 columns, 16 item rows, 16 pieces. Columns: `Barcode`, a blank-header column B (the brand), `Item Code`, ` Item Code` (with a leading space; brand plus code), `Description`, `Category`, `Color`, `Size`, `Quantity`, `MRP`, `HSN Code`. Two style codes (5931 `KIDS SAREE` in ORANGE, 5932 `KIDS TULIP` in `M. GREEN`), sizes 24 to 38 in steps of 2 (8 sizes each), MRP 3,560 to 4,350 (rising by 100 per size step), HSN 620443. `Barcode` is a 10-digit number starting 893.
- Sheet `AMIDHARA`: 49 rows by 10 columns, 48 item rows, 48 pieces. Columns: `Barcode`, `Item Code`, `Category`, `Color`, `Brand`, `Brand Item Code`, `Size`, `Quantity`, `MRP`, `HSN Code`. Five style codes (1526 with 16 rows; 326, 336, 324, 354 with 8 rows each), two categories (`JACKET PLAZO` 24 rows, `PLAZOO` 24 rows), five colours (CREAM, MUSTARD, RANI, BLACK, PINK), sizes 24 to 38, MRP 3,290 to 4,710, HSN 620443. `Barcode` is a 10-digit number starting 111.
- Barcode: 10-digit numbers, not EAN-13. Quantity is 1 on every row.
- Missing: cost, GST rate, invoice number and date, supplier, buyer, season, gender.
- Adapter: Easy. Two sheets need two mappings.

### 4. `peppermint 13.xlsx`

- Supplier and brand: brand PEPPERMINT (girls' sets). Supplier map: GEETANSHI APPARELS (flag YES). File date 9 Apr 2026 ("13" may be an invoice number, guess).
- Kind: an item-master style export from a retail program. Richest master data of the 33.
- Real format: `.xlsx`. Sheet `Sheet1`, 25 rows by 22 columns. Header row 1.
- Rows: 24 item rows and 24 pieces.
- Columns: `Stock No`, `Item Description`, `Product`, `Brand`, `Style`, `Shade`, `Size`, `Retail Price`, `Cost Price`, `GST Group`, `UOM`, `GST %`, `HSN Code`, `GENDER`, `SEASON`, `Style Name`, `Short Name`, `TransRate`, `TransQty`, `Discount %`, `Discount Amount`, `Item Remarks`.
- Values: 3 styles (for example `40MFKASKS2-21209`, 8 rows each) in PEACH, Black and CREAM; sizes 24 to 38; retail price 1,899 to 2,499; `Cost Price` is 65% of `Retail Price` on the rows checked and `TransRate` equals `Cost Price` (inferred); `GST Group` `GST For Apparel`; `GST %` 5; HSN 62042300; `GENDER` Girls; `SEASON` SS26; `UOM` Pcs. `Short Name` and `Item Remarks` are empty.
- Barcode: `Stock No`, 13-digit text, all valid EAN-13 (24 of 24), starting 89053857.
- Missing: invoice number and date, supplier and buyer.
- Adapter: Easy.

### 5. `minelli 06161.xlsx`

- Supplier and brand: brand MINELLI; `Firm` is SHUBH SHRI CLOTHING PRIVATE LIMITED. Supplier map: the same name (flag YES). File date 9 Apr 2026.
- Kind: an item list with a vendor invoice number (`SS/25-26/06161`; "06161" is also in the file name).
- Real format: `.xlsx`. Sheet `Table`, 12 rows by 19 columns. Header row 1.
- Rows: 10 item rows, 10 pieces. Row 12 holds only a quantity total (10).
- Columns: `BarCode No`, `Category`, `Firm`, `Brand`, `Style`, `Shade`, `Size`, `Item Desc`, a blank-header column I (empty), `MRP`, `DP`, `Cost Price`, `Tax`, `Gender`, `HSN Code`, `Qty`, `Invoice No`, `PDT`, `Party Name`.
- Values: one style (`MI-98681-A LINE SKD SET-HAKOBA`), category `SKD`, shade `A` or `B`, sizes `96CM(M)`, `1.02M(L)`, `1.08M(XL)`, `1.14M(2XL)`, `1.20M(3XL)`. `MRP` and `DP` are both 2599.00; `Cost Price` is 1533.41 (59% of MRP); `Tax` 5.00; HSN 62044210; `PDT` repeats the barcode with `;1`. Every value is text (for example `"2599.00"`, `"1.000"`). `Gender` and `Party Name` are empty.
- Barcode: `BarCode No`, 10-digit text (for example starting 2512100), not EAN-13.
- Missing: invoice date, buyer, gender.
- Adapter: Easy. Convert text to numbers and drop the total row.

### 6. `kidcity 1316&1317.xlsx`

- Supplier and brand: brand KIDCITY (style codes `KC-...`, invoice prefix `KC/25-26/`). Supplier map: KIDCITY SOLUTIONS PVT. LTD. (flag YES). File date 27 Mar 2026.
- Kind: a billing file that holds two invoices (1316 and 1317) in one sheet.
- Real format: `.xlsx`. Sheet `BILLING FILE`, 273 rows by 11 columns. Header row 1. An AutoFilter covers A1:K273 and hides rows 2 to 229, which are all 228 rows of invoice 1316. A reader that skips hidden rows sees only the 44 rows of invoice 1317.
- Rows: 272 item rows, 512 pieces. Invoice 1316: 228 rows, 440 pieces, package A. Invoice 1317: 44 rows, 72 pieces, package B. `QTY` is 2 on 226 rows, 1 on 41, 4 on 4 and 3 on 1.
- Columns: `VSKU`, `Age Group`, `Color`, `Gender`, `Category Name`, `Price`, a blank-header column G (a formula, MRP less 35.5%, the cost), `SKU No`, `QTY`, `PKG NO`, `INV`.
- Values: 64 style codes; 9 age groups (`2-3Y` to `15-16Y`); 43 colours; `Gender` is Girls or Boys in mixed case (`Girls` 88, `GIRLS` 48, `Boys` 68, `BOYS` 68); 14 category names (for example `Senior Girls Top`, `Junior Boys Fashion T-SHIRT`). `Price` (the MRP) is 199, 249, 299, 349, 399 or 449, stored as text on 140 rows and as a number on 132 rows. Column G holds the formula `=F2-(35.5/100*F2)` (for example 192.855 for MRP 299; float noise).
- Barcode: `SKU No`, 13-digit number starting 820 (internal, sequential). Only 31 of the 272 pass the EAN-13 check. 256 are different; 16 appear in both invoices.
- Missing: HSN, GST rate, invoice date, supplier name, brand column.
- Adapter: Medium (the hidden rows, two invoices, the number-as-text price).

## Family B: voucher registers, ledger reports and accounting exports

### 7. `ARVIND ALL BRAND & SPYKAR_PT.xlsx`

- Supplier and brand: the file name promises all Arvind brands and Spykar; the data holds only brand `FM` (Flying Machine). The seller is not named. The party is KDPS. Supplier map: `FM` to VISHAL MARKETING (flag YES). File date 13 Jun 2026.
- Kind: a sales-register print with e-invoice columns. Title in a merged block A1:AE4: "PT FILE - PT FILE", date range 21-05-2026 to 23-05-2026.
- Real format: `.xlsx`. Sheet `Sheet1`, 17 rows by 31 columns. Header row 5.
- Rows: 11 item rows (rows 6 to 16) with 13 pieces (9 rows of 1 and 2 rows of 2). Row 17 is `Grand Total :` (13 pieces; net amount 17,270; taxable value 16,447.83; tax 822.42).
- Columns: `Voucher No`, `Voucher Date`, `Party Name`, `Narration`, `Vehicle Number`, `Stock No`, `Item Description`, `Product`, `Brand`, `Style`, `Shade`, `Size`, `Sales Qty`, `Bill Level Disc. Amt.`, `Bill Level Disc. Per.`, `Total Discount`, `Net Amount`, `Retail Price`, `Item Rate`, `Item Base Value`, `Tax Percentage`, `Tax Amount`, `Item Net Amount`, `Taxable Value`, `HSN Code`, `Season`, `IRN No`, `Ack No`, `Ack Date`, `IRN Status`, `IRN Cancel Date`.
- Values: voucher `S/26-27/596` dated 21 May 2026; `Narration` says an extra-stock correction against a bill; 3 styles (`FMTSH7824`, `FMSHT4540`, `FMSHT5165`); sizes S to XXL; retail price 1,799 or 1,999; HSN 62052000 or 61091000; `Season` SS25 or AW24; tax 5%. `IRN Status` is `ACT` on all rows (the e-invoice reference and acknowledgement numbers are present, not copied). `Vehicle Number` and `IRN Cancel Date` are empty.
- Barcode: `Stock No`, 13-digit text, all valid EAN-13 (11 of 11), starting 890911.
- Missing: the seller's name, buyer GSTIN column.
- Quirks: an "extra stock correction" is not a normal goods-in; the file name names more than the file holds.
- Adapter: Easy.

### 8. `BK ENTERPRISES_LC_PT.xlsx`

- Supplier and brand: B.K Enterprises (from the file name) and brand `LITTLE PINK` (the data; the narration is `LITTLE PINK SS26`). The "LC" in the file name probably means Linen Club (guess), but the data holds Little Pink. Supplier map: `LITTLE PINK` and `LINEN CLUB` both to B.K ENTERPRISES (flag YES). File date 13 Jun 2026.
- Kind: a sales-register print. Merged title A1:AB4: "PT FILE - BK ENTERPRISES - PT FILE - BK ENTERPRISES", date range 14-04-2026 to 14-04-2026.
- Real format: `.xlsx`. Sheet `Sheet1`, 19 rows by 28 columns. Header row 5.
- Rows: 13 item rows (rows 6 to 18) with 13 pieces. Row 19 is `Grand Total :` (net 16,341; taxable 15,563.26; CGST and SGST 389.05 each).
- Columns: `Voucher Type`, `Voucher No`, `Voucher Date`, `Party Name`, `Narration`, `Sales Man`, `Stock No`, `Item Description`, `Product`, `Brand`, `Style`, `Shade`, `Size`, `Sales Qty`, `Total Discount`, `Net Amount`, `Retail Price`, `Item Rate`, `Item Base Value`, `Tax Amount`, `Add on Amount`, `Deduction Amount`, `Item Net Amount`, `Taxable Value`, `CGST Amount`, `SGST Amount`, `HSN Code`, `Season`.
- Values: voucher `S/55` dated 14 Apr 2026; party `KDPS LIFE STYLE PVT. LTD.` (spelled with a space); `Product` `LADIES R.KURTI`; styles 10871 (8 rows) and 10881 (5 rows); `Shade` is `A` or `B`; sizes M, L, XL, XXL; retail price 1,749 (6 rows), 1,999 (5) or 1,820 (2); HSN 61083990; `Season` SS26. `Sales Man` is empty. There is no tax percentage column, only amounts (CGST and SGST).
- Barcode: `Stock No`, 13-digit text starting 7777016, valid EAN-13 check digit (13 of 13) but made by the supplier (777 prefix).
- Quirks: the same rate gives two net amounts (1,184.15 and 1,184.51; probably a typo).
- Adapter: Easy.

### 9. `DEAL SS26 2970.xlsx`

- Supplier and brand: brand `DEAL` (women's jeans and tops). The party in the file is OM GANPATI ENTERPRISES with its own GSTIN column; KDPS is named only in the narration `DEAL SS26 (JAINSONS LIFESTYLE)`. Whether Om Ganpati is the supplier or an intermediary is not clear. Supplier map: `DEAL` to VISHAL MARKETING (flag YES); `OM GANPATI (DMK)` supplies Jockey, Lee and US Polo. File date 8 Feb 2026.
- Kind: a sales register. Merged title: "Sales Register - Sales Register", date range 01-02-2026 to 07-02-2026.
- Real format: `.xlsx`. Sheet `Sheet1`, 61 rows by 37 columns. Header row 5.
- Rows: 55 item rows (rows 6 to 60) with 108 pieces (53 rows of 2, 2 rows of 1). Row 61 is `Grand Total :` (net 1,46,778; taxable 1,39,788.48; CGST and SGST 3,494.93 each; MRP value 2,02,592).
- Columns: `Voucher Type`, `Voucher No`, `Voucher Date`, `Party Name`, `GSTIN`, `Narration`, `Tax Type`, `Additional Info.`, `Stock No`, `Item Description`, `Product`, `Brand`, `Style`, `Shade`, `Size`, `Sales Qty`, `Bill Level Disc. Amt.`, `Bill Level Disc. Per.`, `Total Discount`, `Net Amount`, `Retail Price`, `Item Rate`, `Tax Percentage`, `Tax Amount`, `Add on Amount`, `Deduction Amount`, `Item Net Amount`, `Taxable Value`, `CGST Rate`, `CGST Amount`, `SGST Rate`, `SGST Amount`, `HSN Code`, `Total Value (MRP)`, `Purchase Price`, `TCS Amount`, `Season`.
- Values: voucher `S/25-26/2970` dated 3 Feb 2026; products `WOMAN STRAIGHT JEANS` (34 rows) and `WOMAN TOP` (21); 5 styles (`50930L`, `50992L`, `50989L`, `61378L`, `61380L`); 8 shades (for example `MID BLUE`, `CP 1`); sizes S to 3XL; retail price 1,099 to 2,599 (7 values); `Tax Type` `GST For Apparel`; tax 5% (CGST 2.5 and SGST 2.5); HSN 62046290 or 61099090; `Season` SS26; `TCS Amount` 0. `Purchase Price` (for example 1,346.93) differs from `Item Rate` (1,448.31); the file does not say which is the cost to book.
- Barcode: `Stock No`, 13-digit text, valid EAN-13 (55 of 55), starting 8905787 or 8909361.
- Missing: the buyer's name as a field, the supplier's name apart from the party.
- Adapter: Easy.

### 10. `ZILU BOTTOMS.xlsx`

- Supplier and brand: brand `ZILU BOTTOMS`; seller not named. Supplier map: FASHION MARKETING (flag YES). File date 13 Jun 2026 (last saved 8 Sep 2025 per the file's own property).
- Kind: a sales register without a title block. The first column `Voucher Type` holds `FEMALE` (not a voucher type).
- Real format: `.xlsx`. Sheet `Sheet1`, 109 rows by 31 columns. Header row 1.
- Rows: 107 item rows (rows 2 to 108) with 107 pieces. Row 109 is an unlabelled totals row (107 pieces; net 73,321; base 69,763.01; tax 3,487.54).
- Columns: `Voucher Type`, `Voucher No`, `Voucher Date`, `Party Name`, `Barcode`, `Item Description`, `Product`, blank (fit), blank (category), `Brand`, `Style`, `Shade`, `Size`, `Sales Qty`, `Bill Level Disc. Amt.`, `Bill Level Disc. Per.`, `Total Discount`, `Net Amount`, blank (value 5 on every row), `Retail Price`, blank (12 on 54 rows and 5 on 53 rows), blank (empty), `Item Rate`, `Item Base Value`, `Item Level Disc. Amt.`, `Item Level Disc. Perc.`, `Tax Amount`, `Add on Amount`, `Deduction Amount`, `Item Net Amount`, `HSN Code`.
- Values: voucher `2025-26/FML/16` dated 28 Aug 2025; party KDPS; `Product` `TROUSER`; the unlabelled fit column is `SLIM STRAIGHT` and the unlabelled category column is `BOTTOM WEAR`; 29 styles, 19 shades; sizes M, L, XL, XXL; retail price 599 to 1,499 (8 values); HSN 620469. The unlabelled column after `Net Amount` is 5 on all rows. The unlabelled column after `Retail Price` is 12 where the retail price is 1,199 or more and 5 where it is 599 or 799 (inferred as a rate by price band). The tax amount on every row is 5% of the item base. The meaning is not stated.
- Barcode: `Barcode`, 5-digit text (for example `22107`), internal and unique (107 of 107).
- Missing: season, seller, GST percentage as a named column.
- Adapter: Easy-medium (blank-header columns carry attributes).

### 11. `BANJARAN.xlsx`

- Supplier and brand: brand BANJARAN (cotton kurti sets). `Party Name` is VINAYAK EMPORIUM PVT. LIMITED (probably the invoicing supplier, with the voucher prefix `VEP`; KDPS is not named). Supplier map: VINAYAK EMPORIUM PVT LTD (flag YES). File date 13 Jun 2026.
- Kind: a sales voucher export with 40 columns, most empty.
- Real format: `.xlsx`. Sheet `Sheet1`, 12 rows by 40 columns. Header row 1.
- Rows: 11 item rows with 37 pieces (3 or 4 per barcode). Invoice `VEP/003216/25-26` dated 26 Mar 2026. No totals row.
- Columns: `Date`, `No`, `Type`, `Party Name`, `Item Name`, `Item Group`, `HSN Code`, `Note`, `Qty`, `Unit`, `Net Rate`, `Amt`, `Rate Before Disc`, `Material`, `Category`, `Supplier Barcode`, `Style Of Work`, `Party Item Name`, `Item Desc`, `Item Catalog`, `Style/Cut`, `Neck`, `Brand`, `Sleeve`, `Performance`, `Embroidery`, `Occassion`, `Print Design Type`, `GSTIN`, `Sales Person1`, `GST Rate`, `GST Amt`, `SALE RATE`, `Retail Rate`, `st_cd`, `Item Print Name`, `Size`, `Colour`, `Supplier Code`, `POS Disc`.
- Values: `Item Name` is the style (`KBD/10324`); `Item Group` holds the colour (PINK, ORANGE, YELLOW, WHITE and 2 more); `Party Item Name` is `KBD/10324#PINK-FREE` (style, colour and size in one text); HSN 620449; `Net Rate` is the cost (619.38 to 1,146.38); `Rate Before Disc` and `Retail Rate` are both the MRP (999 to 1,849); `GST Rate` 5; `Unit` `PCS`; `Material` `COTTON` on 10 rows. `Style Of Work`, `Neck`, `Sleeve` and `Embroidery` are filled on one row each. `Size`, `Colour`, `Brand`, `Category`, `Item Desc`, `Supplier Code` and `Sales Person1` are empty. `SALE RATE` and `POS Disc` are 0.
- Barcode: `Supplier Barcode`, 6-digit number (for example `198441`), not EAN-13. `st_cd` is another 6-digit number (643996).
- Missing: a usable colour, size and brand as named fields; buyer.
- Adapter: Medium (the fields are in odd columns).

### 12. `TWILLS.xls`

- Supplier and brand: `Compnay Name` is M.N GARMENTS (the supplier). Brand TWILLS (the file name); `Type` holds five sub-ranges (MERCURY 23 rows, MAGNUM 8, FILA 8, ESQUIRE 4, OPERA 4). Supplier map: `TWILLS` to MN GARMENTS (flag YES). File date 13 Jun 2026.
- Real format: an `.xlsx` package with an `.xls` extension. Sheet `VTSSalesPtFilesLedgerReport` ("VTS" is probably the program name, guess), 48 rows by 21 columns. Header row 1.
- Rows: 47 item rows with 69 pieces; no totals row. 47 formulas (the blank-header column G).
- Columns (labels are shifted or misspelled): `Compnay Name`, `GST CMP`, `Vch No`, `Educational` (this is the date), `Ledger Name` (the buyer), `Buyer` (this holds the buyer's GSTIN), a blank-header column G (style, a formula taking the first 10 characters of `Item Name`), `Item Name`, `Bar Code`, `Type`, `HSN`, `Quantity`, `Rate`, `MRP`, `Disc`, `Disc Amt`, `Amount`, `CGST`, `SGST`, `IGST`, `Net Amount`.
- Values: `Vch No` `25-26/2612` dated 18 Mar 2026; the buyer is KDPS; 13 styles; `Item Name` ends with the size (`52844-7808 Z  MAGNUM FS-S`); sizes S, M, L, XL and 30, 32, 34; `Rate` 669, 703, 870 or 937; `MRP` 999, 1,049, 1,299 or 1,399; HSN 62052000 (39 rows) or 62034200 (8); `CGST` and `SGST` are amounts only (no percentage); total `Amount` 52,395 and `Net Amount` 55,014.90. `GST CMP`, `Disc`, `Disc Amt` and `IGST` are empty.
- Barcode: `Bar Code`, 13-digit text, valid EAN-13 (47 of 47), starting 8909272.
- Missing: colour, GST percentage, the seller's GSTIN.
- Adapter: Medium (shifted labels, the size is inside the name, GST in amounts only).

### 13. `STATUS QUO.xlsx`

- Supplier and brand: `CMP NAME` is D Apparel (the supplier; state Jharkhand; GSTIN present, not copied). Brand STATUS QUO (item codes `SQ-...`; kids `KD-...`). Supplier map: `STATUS QUO` to D APPAREL (flag YES). File date 13 Jun 2026.
- Kind: a ledger report. Real format: `.xlsx`. Sheet `PTFiles`, 45 rows by 29 columns. Header row 1.
- Rows: 43 item rows with 43 pieces. Row 45 is `Total` (43 pieces; amount 42,059.55).
- Columns: `CMP NAME`, `STATE`, `GST No`, `Bill  No` (two spaces), `Bill Date`, `Customer Name`, `Buyer GSTIN`, `Item`, `Item Code`, `EN Code`, `Shade`, `MRP`, `Quantity`, `Unit`, `Size`, `Rate`, `Disc`, `Disc Amt`, `Amount`, `GST %`, `HSN Code`, `Discount`, `Motiya`, `Bus Fare`, `CGST`, `SGST`, `IGST`, `Round off`, `Net Amount`.
- Values: bill `DA/26-27/0160` dated 1 May 2026; `Customer Name` is `KDPS LIFESTYLE PRIVATE LIMITED-DEO` (the suffix marks the Deoghar Store); 4 item names (`MENS T-SHIRT.`, `MENS TRACK PANT`, `MENS SHORTS`, `KIDS T-SHIRT.`); 6 item codes; sizes S to 3XL and kids 8 to 16; MRP 999 to 2,299; `Disc Amt` is the text `On Value`; `GST %` 5; HSN 61091000, 61033200 or 61034990. The invoice totals (`Motiya` 50, `CGST` and `SGST` 1,052.77 each, `Round off` -0.09, `Net Amount` 44,215) are on row 2 only. `Motiya` is a charge added to the invoice (not explained).
- Barcode: `EN Code`, 13-digit text, valid EAN-13 (43 of 43). 10 barcodes appear on two rows each.
- Missing: brand column, colour is `Shade`.
- Adapter: Easy-medium (header values only on row 2; repeated barcodes).

### 14. `SWEET DREAMS.xlsx`

- Supplier and brand: `FROM` is D D APPARELS; brand SWEET DREAMS only from the file name (men's pyjamas and bermudas). Supplier map: `SWEET DREAMS` to DD APPAREL (flag YES). File date 13 Jun 2026.
- Kind: an accounting export. Row 2 holds a title repeated across every cell: "D_PT FILE From 05/02/2026 to 06/02/2026". Real format: `.xlsx`. Sheet `Report`, 29 rows by 27 columns. Header row 3.
- Rows: 24 item rows (rows 4 to 27) with 24 pieces. Row 28 `BILL NO. WISE TOTALS` and row 29 `GRAND TOTALS` (label in column B; 24 pieces; gross and after-discount 16,337.49; tax 408.44 and 408.44; net 17,154).
- Columns: `SNO.`, `FROM`, `BILL NO.`, `BILL DATE`, `PARTY NAME WITHOUT CITY`, `GENDER + Body`, `PRICE GROUP`, `BODY`, `Season`, `HSN CODE`, `ITEM CODE`, `ADDITIONAL ITEM CODE`, `ITEM NAME`, `SHADE`, ` SIZE` (leading space), ` QTY` (leading space), `M.R.P.`, `RATE`, `GROSS AMOUNT`, `CD(%)`, `CD VALUE`, `TD(%)`, `TD VALUE`, `AFTER DISCOUNT AMT`, `TAX-1(RS)`, `TAX-3(RS)`, `NET AMOUNT`.
- Values: bill `DDSL-109` dated `06/02/2026` (text); `GENDER + Body` `MEN PYJAMA LENGTH` (21 rows) or `MEN BERMUDA LENGTH` (3); 3 `ITEM NAME` styles; 6 shades; sizes M, L, XL, XXL; MRP 1,049 (21 rows) or 599 (3); `RATE` has 4 decimals (410.7343); HSN 62081990 (18 rows) or 61071100 (6); `Season` S26. `TAX-1(RS)` and `TAX-3(RS)` are amounts (2.5% each). `CD` and `TD` columns are empty.
- Barcode: `ITEM CODE` is a 13-digit internal code starting 11000010 (not EAN-13; 4 of 24 pass by chance); `ADDITIONAL ITEM CODE` is the real EAN-13 (24 of 24 valid, starting 890932).
- Missing: brand column, GST percentage, the buyer's GSTIN.
- Adapter: Easy (use `ADDITIONAL ITEM CODE`).

### 15. `KILLER JUNIOR.xlsx`

- Supplier and brand: `COMPANY NAME` is JUNIOR KILLER; the seller is not named. Supplier map: `KILLER`, `JUNIOR KILLER` and `KILLER JUNIOR` to D D SALES CO (flag YES). File date 13 Jun 2026.
- Kind: an accounting export of the same family as SWEET DREAMS. Title in a merged cell A2:AA2: "PT FILE FORMAT - SALE From 30/04/2026 to 31/03/2027". Real format: `.xlsx`. Sheet `Report`, 30 rows by 27 columns. Header row 3.
- Rows: 24 item rows (rows 4 to 27) with 24 pieces. Rows 28 `Bill Totals`, 29 `Date Totals`, 30 `Grand Totals` (label in column E; gross and after-discount 22,246.18; tax 556.16 and 556.16; bill amount 23,358.01).
- Columns: `BILL NO.`, `BILL DATE`, `PARTY NAME`, `COMPANY NAME`, `ITEM NAME`, `PRODUCT`, `GROUP9.GRP1`, `GROUP10.GRP1`, `GROUP18.GRP1`, `GROUP25.GRP1`, `ITEM CODE`, `BARCODE`, `SHADE NAME`, `SIZE`, `RATE/PACK`, `PACKING`, `LOCATION`, `TOTAL QTY`, `M.R.P.`, `GROSS AMOUNT`, `RATE/UNIT`, `CD(%)`, `AFTER DISCOUNT AMOUNT`, `TAX-1(RS)`, `TAX-3(RS)`, `BILL AMOUNT`, `REMARKS-1`.
- Values: bill `JKL-30` dated `30/04/2026` (text); `PARTY NAME` is KDPS with the suffix `-JNR    -DUMKA` (a Dumka Store, junior section; inferred); `PRODUCT` is `SHIRTS` (7), `T-SHIRTS` (7) or `TROUSERS` (10); `GROUP9.GRP1` holds the season (`SS26` 14 rows, `CORE` 10); `GROUP10.GRP1` the fit (`SLIM FIT`, `REGULAR FIT`, `ROUND NECK H/S`); `GROUP18.GRP1` is `(NIL)` on every row; `GROUP25.GRP1` holds the HSN (62052000 or 62034200) and is `(NIL)` on the 7 T-shirt rows; sizes are `10-11 YEARS` style (8 sizes); `PACKING` is a measurement text (`44.5cm`); MRP 1,199, 1,299 or 1,499; tax amounts only. `LOCATION`, `CD(%)` and `REMARKS-1` are empty.
- Barcode: `BARCODE`, 13-digit text, valid EAN-13 (24 of 24), starting 89093 or 89058. `ITEM CODE` is a 7-digit internal code.
- Missing: HSN on T-shirts, GST percentage.
- Adapter: Easy-medium (generic group columns).

## Family C: the "PT EMAIL" snake-case layout

BEEVEE, go colours and MUFTI share one layout (merged rows 1 to 2, sheet name `PT EMAIL _Dont touch`, header in row 3, no totals row). HYPHEN is a sibling. Brand-company systems appear to produce it (guess). It is the cleanest layout of the 33.

Columns of BEEVEE and go colours (23, row 3): `OWNER SITE`, `INVOICE_DATE`, `INVOICE_NO`, `CUSTOMER_NAME`, `REF SITE`, `BARCODE`, `CATEGORY1`, `CATEGORY2`, `CATEGORY3`, `CATEGORY4`, `CATEGORY5`, `DIVISION`, `SECTION`, `DEPARTMENT`, `HSN CODE`, `TAX_AMOUNT`, `TAX_RATE`, `TAXABLE_AMOUNT`, `ITEM_NET_AMOUNT`, `INVOICE_QUANTITY`, `INVOICE_RATE`, `INVOICE_RSP`, `MRP`. Meaning of the generic columns (from the values): `CATEGORY1` brand, `CATEGORY2` style, `CATEGORY3` colour, `CATEGORY4` size, `CATEGORY5` product.

### 16. `BEEVEE 390.xlsx`

- Supplier and brand: `OWNER SITE` is BEEVEE (the brand's own site as seller). Supplier map: BEEVEE to SHARP TRADING CO. (flag YES). File date 10 Dec 2025.
- Real format: `.xlsx`. Sheet `PT EMAIL _Dont touch`, 27 rows by 23 columns (2 merged cells). Header row 3.
- Rows: 24 item rows (rows 4 to 27) with 33 pieces. Invoice `SBVS25-26-000390` dated 23 Oct 2025.
- Values: `REF SITE` is `KDPS-HZB-BV` (a KDPS Site code: Hazaribagh, brand BV); `CUSTOMER_NAME` is KDPS; 4 styles (`COREPY3710` 15 rows, `CORECR3771` 4, `FMCR3166-M` 3, `FMCR3166-O` 2); colours BLACK, NAVY and 2 more; 8 size values, numbers and text mixed (for example `XXL`, `L`, `32`, `36`); products `PYJAMA` and `CARGO`; `DIVISION` `LOWER`, `SECTION` `MENS LOWER`; HSN 62072110 (15) or 62034200 (9); `TAX_RATE` 5; `INVOICE_RSP` equals `MRP` (1,049, 1,899 or 2,199).
- Barcode: `BARCODE`, 13-digit number, valid EAN-13 (24 of 24), starting 8905089.
- Missing: season, gender, fit.
- Adapter: Easy.

### 17. `go colours 000023.xlsx`

- Supplier and brand: `OWNER SITE` is `ESSPL-GOCOLORS` (ESSPL is probably Emporio Siddharth Sales Pvt Ltd). Supplier map: `GOCOLORS` to EMPORIO SIDDHARTH SALES PRIVATE (flag YES). File date 28 Mar 2026.
- Real format: `.xlsx`. Sheet `PT EMAIL _Dont touch (1)`, 49 rows by 23 columns. Header row 3.
- Rows: 46 item rows (rows 4 to 49) with 46 pieces. Invoice `2GCS25-26-000023` dated 24 Mar 2026.
- Values: `REF SITE` `KDPS-HZB-GC`; 5 styles (`LPZ1` 20 rows, `LJ16` 10, `LT03` 8, `LJ17` 5, `LJ19` 3); products such as `Rib Palazzo`, `Boot cut Jeans`; `SECTION` `LADIES LOWER`; HSN 61046200 (28) or 62046300 (18); `TAX_RATE` 5; MRP 1,049, 1,199, 2,099 or 2,399.
- Barcode: `BARCODE`, 13-digit number, valid EAN-13 (46 of 46), starting 8905344.
- Missing: season, gender, fit.
- Adapter: Easy.

### 18. `MUFTI.xlsx`

- Supplier and brand: `OWNER SITE` is MUFTI. Supplier map: MUFTI to SHRING APPARELS (flag YES). File date 13 Jun 2026.
- Real format: `.xlsx`. Sheet `PT EMAIL _Dont touch`, 102 rows by 28 columns (2 merged cells). Header row 3.
- Rows: 97 item rows (rows 4 to 100; rows 101 and 102 are empty) with 133 pieces. Invoice `SMFS25-26-000753` dated 22 Aug 2025.
- Columns: the 23 above, plus three blank-header columns after `CATEGORY5` (product type, `BOTTOM WEAR` or `TOP WEAR`, and fit such as `SKINNY`, `SLIM`) and two blank-header columns after `MRP` (value 5 on all rows; and 18 on 68 rows or 5 on 29 rows). The two trailing columns are probably a revised GST rate (inferred): 18 appears where the MRP is 2,799 or more and 5 where it is 2,599 or less.
- Values: `REF SITE` `KDPS-HZB-MF`; 26 styles; 21 colours; sizes M, L, XL, XXL, 3XL and 28 to 40; 6 `CATEGORY5` products (`SHIRT F/S` 36, `DENIM DELUXE` 16, `ORIGINALS` 16, `T-SHIRT H/S` 12, `SHIRT H/S` 12, `COTTON DENIM` 5); HSN 62052000, 62034200, 61091000, 61052010; `TAX_RATE` is 12 on 89 rows and 5 on 8 T-shirt rows; MRP 1,399 to 4,299 (15 values). `TAXABLE_AMOUNT` differs from quantity times `INVOICE_RATE` on all 97 rows by about 0.35% (taxable amount is higher; the cause is not stated).
- Barcode: `BARCODE`, 13-digit number, valid EAN-13 (97 of 97), starting 8905310.
- Missing: season, gender (fit is in an unlabelled column).
- Adapter: Easy.

### 19. `HYPHEN.xlsx`

- Supplier and brand: no brand column (the file name and the `HY` barcode prefix point to HYPHEN; inferred). `AGENT_NAME` holds a person's name (not copied). Supplier map: HYPHEN GARMENTS PVT LTD (flag YES). File date 13 Jun 2026.
- Kind: a sibling of the PT EMAIL layout with a title row ("PT FILE BILL NO WISE") and underscore headers. Real format: `.xlsx`. Sheet `PT FILE BILL NO WISE`, 14 rows by 16 columns (2 merged cells). Header row 3.
- Rows: 10 item rows (rows 4 to 13) with 10 pieces. Row 14 holds only a quantity total (10). Invoice `HPNS25-26-013192` dated 23 Mar 2026; `DOCUMENT_NO` `S26DDJH-030`.
- Columns: `AGENT_NAME`, `REFERENCE_SITE`, `INVOICE_DATE`, `INVOICE_NO`, `DOCUMENT_NO`, `HSN_CODE`, `SECTION`, `DEPARTMENT`, `BARCODE`, `STYLE`, `S/L`, `SIZE`, `MRP`, `RSP`, `INVOICE_RATE`, `INVOICE_QUANTITY`.
- Values: `REFERENCE_SITE` is `KDPS Lifestyle (Ranchi)` (the receiving Site); `SECTION` `Winter Wear`; `DEPARTMENT` `3 Pcs Suit` (rows with `MRP` 5,399 and rate 3,104) and `Blazers` (MRP 2,599, rate 1,793); styles `SSS-048596` and `HBL-097206`; sizes `36/XS`, `38/S` ... `46/3XL`; HSN 62031910. `S/L` is empty. `MRP` equals `RSP`.
- Barcode: `BARCODE`, 8-character alphanumeric (`HY581454`), not EAN-13.
- Missing: brand, colour, GST rate, season.
- Adapter: Easy.

## Family D: Jockey

Six Jockey files: five "Bill Wise Item List" reports (`.xls`) and one invoice print (`.xlsx`). Customer codes `JH-194862` (PARAS, NARAYANI, NARVADA, DD SALES) and `JH-200662` (852) identify the KDPS account. The file names PARAS, NARAYANI, NARVADA and DD SALES and the different bill prefixes look like different issuing dealers or depots (guess). Supplier map: `JOCKEY` to OM GANPATI (DMK) (flag YES); the supplier `D D DEVELOPPER` (barcode flag YES) appears only in the `BARCODE` sheet.

Layout of the five "Bill Wise Item List" files: rows 1 to 6 hold `.` filler, row 7 `Report: Bill Wise Item List`, row 8 the selected date range, row 9 the header (except NARAYANI, which starts with the header in row 1). The data ends with three total rows: `*Sub Total*`, `*Sub Total* - *date*` and `*Grand Total*`. Each has 9 merged cells (NARAYANI none). Several header names carry stray spaces. `Batch No.` actually holds the MRP as text (`"999.00"`). `Cost` and `MDP` are not explained; `Cost` is sometimes above `Doc Rate`. `Doc Rate` looks like the ex-tax rate and `Value` the tax-inclusive line value (`Doc Rate` times `Qty`, plus `Tax`, less `Deduction`) (inferred). Every bill is `Tran Type` `Sales`; `Tax Perc.` is 5.0.

Header of `JOCKEY 852.xls` (30 columns): `Bill Date`, `Tran Type`, `Bill Prefix`, `Bill No`, `Customer Code`, `Customer Name`, `Sales Man Code`, `Item Promo Code`, `Bill Promo Code`, `StockNo`, `Item Description`, `Product Code`, `Range Code`, `Style Code`, `Colour Code`, `Size`, `Batch No.`, `Cost`, `MDP`, `Doc Rate`, `Qty`, `Value`, `Addons`, `Deduction`, `Tax Perc.`, `Tax`, `Item - Discount`, `Bill - Discount`, `Total - Discount`, `Old Bill Ref.`. The other four differ as listed in their blocks.

### 20. `JOCKEY 852.xls`

- Real format: `.xls`. Sheet `Sheet1`, 21 rows by 30 columns. File date 12 Mar 2026. Header row 9. Range: 03/03/2026.
- Rows: 9 item rows with 16 pieces. Bill `SCRS25` no. 852 on `03/03/2026`. Total `Value` 9,622.00. Customer code `JH-200662`.
- Products: `TANK TOP` (5 rows), `Track Pant` (3), `TRACK PANT` (1) (case varies). Range codes `ATHLE-M`, `Sport`, `MOVE-MENS`. No HSN column. MRP in `Batch No.` (999, 1,429, 699 ...).
- Barcode: `StockNo`, 13-digit text, valid EAN-13 (9 of 9), starting 8901326. 9 different.
- Missing: HSN, brand column.
- Adapter: Medium (read the columns by name).

### 21. `JOCKEY PARAS.xls`

- Real format: `.xls`. Sheet `Sheet1`, 55 rows by 39 columns. File date 13 Jun 2026 (file property: created 21 Apr 2026). Header row 9. Range 18/04/2026 to 18/04/2026.
- Differences from the 852 header: no `Sales Man Code`; added `Product Desc`, `Range Desc`, `Style Desc`, `UOM`, `Pack`, `Material`, `IC1`, `Division`, `DistItem` and `HSN Code`.
- Rows: 43 item rows with 146 pieces. Bill `PECRS26` no. 175 on `18/04/2026`. Total `Value` 40,412. 30 different stock numbers; 13 appear twice (duplicate lines).
- Products: `Vest` (25 rows) and `VEST` (3), `BOXER SHORTS` (4), `TRUNK` (4) and `Trunk` (2), `Brief` (3) and `BRIEF` (2); range `HERITAGE` and others; `UOM` `EA`; `DistItem` such as `BU-BOXER SHORTS`; HSN codes present.
- Barcode: `StockNo`, 13-digit text, valid EAN-13 (43 of 43). `Material` repeats the item description.
- Adapter: Medium.

### 22. `JOCKEY-NARAYANI.xls`

- Real format: `.xls`. Sheet `Sheet3`, 31 rows by 28 columns. File date 13 Jun 2026 (file property: saved 18 Apr 2026). 1.5 MB for 31 rows (not explained). Header row 1, no title block and no totals rows.
- Differences from the 852 header: no `Sales Man Code`, `Item Promo Code`, `Bill Promo Code`; added `HSN Code`.
- Rows: 30 item rows with 39 pieces. Bill `P2CRS26` no. 162 on `18/04/2026`. Total `Value` 14,691.
- Products: `BRIEF` (14), `TRUNK` (12), `NA` (3), `Brief` (1); range `IC-USOFT`; HSN 61071220. Example: `MDP` 326.03 against `Doc Rate` 444.9 (`MDP` is not the sale rate).
- Barcode: `StockNo`, 13-digit text, valid EAN-13 (30 of 30).
- Adapter: Medium.

### 23. `JOCKEY-NARVADA.xls`

- Real format: `.xls`. Sheet `Sheet1`, 14 rows by 29 columns. File date 13 Jun 2026. Header row 9. Range 18/04/2026 to 20/04/2026.
- Differences from the 852 header: no `Customer Name`, no `Cost`; added `HSN Code`.
- Rows: 2 item rows with 20 pieces (10 each). Bill `EDCRS26` no. 34 on `18/04/2026`. Total `Value` 4,423. Product `HANDKERCHIEF` (range `ELANCE-HK`), size `FS`, HSN 62132000, MRP 329 and 299.
- Barcode: `StockNo`, 13-digit text, valid EAN-13 (2 of 2).
- Adapter: Medium.

### 24. `JOCKEY_DD SALES.xls`

- Real format: `.xls`. Sheet `Sheet1`, 197 rows by 31 columns. File date 13 Jun 2026. Header row 9. Range 01/05/2026 to 04/05/2026 (every line is dated 01/05/2026).
- Differences from the 852 header: added `HSN Code`.
- Rows: 185 item rows with 349 pieces. Bills `DD/JBN26` no. 135 (110 rows) and no. 136 (75 rows). Total `Value` 1,63,327. 165 different stock numbers; 20 appear twice. Four EANs appear with two different MRPs each (for example 629 and 639).
- Products: bras (`Everyday Bra` 96 rows, `ACTIVE BRA` 25, `EVERYDAY BRA` 24, `Active Bra` 16, `Plus Size Bra` 9, `BEGINNERS BRA` 8, `T-Shirt Bra` 3, `Beginners Bra` 3, and more); range `ATHLE-BRA`; HSN 62121000 on all rows; sizes are band and cup (`34B`, `36C`, `36B`) or letters. `Cost` is above `Doc Rate` on 24 of 185 rows.
- Barcode: `StockNo`, 13-digit text, valid EAN-13 (185 of 185).
- Adapter: Medium.

### 25. `JOCKEY.xlsx`

- Supplier and brand: an invoice printout; the first record names the party `BR-D D DEVELOPERS PVT LID - JFH` and invoice `JCRS26/10` (two dates, 6 Apr 2026). Supplier map: `D D DEVELOPPER` appears in the `BARCODE` sheet only (flag YES). File date 13 Jun 2026.
- Real format: `.xlsx`. Sheet `Sheet1`, A1:ED8 (wide, blank beyond column O). 8 rows.
- Layout: row 1 is an unlabelled header record (sequence 1, 10, 0, `6EY`, party, invoice number, two dates, taxable total 23,098.20, line count 6, tax 1,154.91, 0, 0, round-off 0.11, total 24,253). Row 2 is the header: `S.N`, `STOCK NO.`, `STYLE DISC`, `STYLE CODE`, `COLOUR`, `PRODUCE NAME`, `HSN CODE`, `SIZE`, `QTY`, `MRP`, `RATE`, `TAXABLE AMOUNT`, `CGST(2.5%)`, `SGST(2.5%)`, `AMOUNT`.
- Rows: 6 item rows (rows 3 to 8), 60 pieces (10 per row). `STYLE CODE` 1525; `PRODUCE NAME` `Bikini` or `BIKINI`; colour `DASTD` and `DKPTD`; sizes S, M, L; MRP 549 and 599; HSN 61082100. `CGST(2.5%)` and `AMOUNT` are formulas (`=L3*2.5%`, `=L3+M3+N3`); `SGST(2.5%)` is typed.
- Barcode: `STOCK NO.`, 13-digit number, valid EAN-13 (6 of 6), starting 8901326.
- Missing: season, colour name, brand, a bill date column.
- Quirks: addressed to "D D Developers", not KDPS.
- Adapter: Medium (an unlabelled record above the header).

## Family E: Aditya Birla, Madura and Blackberry

### 26. `Peter England.CSV`

- Supplier and brand: `Company Name` is ADITYA BIRLA LIFESTYLE BRANDS LIMITED. `Brand` holds the codes `PJ` (19 rows), `N` (8) and `RE` (1). The customer code is 321828 and the city Deogarh. Supplier map: `PETER ENGLAND` to MADURA PVT LTD (flag YES). File date 13 Jun 2026.
- Real format: a true CSV, comma-separated, fields padded with spaces. 29 lines by 53 columns. Header row 1.
- Rows: 28 item rows with 33 pieces (23 rows of 1, 5 rows of 2). Five invoices: `MSF2262000004296` (18 rows, 27 May 2026, brand `PJ`), `MSF2262000004473` (7 rows, 29 May, `N`), `MSF2262000004170` (1 row, 25 May, `RE`), `MSF2262000004229` (1 row, 26 May, `N`), `MSF2262000004635` (1 row, 30 May, `PJ`). `Inv Date` is `yyyymmdd`.
- Columns (53): `Customer`, `Name`, `City`, `Customer GST No`, `Transporter Nam`, `LR No`, `LR Date`, `PO`, `Internal Ref No`, `Invoice No`, `Inv Date`, `Carton No`, `Brand`, `Product`, `Retek Class`, `HSN Code`, `Material`, `Grid`, `Size`, `Sleeve`, `EAN No`, `Quantity`, `MRP`, `WSP`, `CD%`, `CD Value`, `Discount %`, `Disc Value`, `Service Charge`, `CGST %`, `CGST Value`, `IGST %`, `IGST Value`, `SGST %`, `SGST Value`, `UGST %`, `UGST Value`, `Tax Amount`, `Invoice Amount`, `Unit MRP`, `Net Unit Cost`, `Plant`, `Material Description`, `Fabric Base Type`, `Fabric Design Type`, `Product Type`, `Color`, `Category`, `Fit Type`, `Company Name`, `Company GST No`, `Company Location`, `Unit Cost`.
- Values: `Product` `FGJEANS` (18), `FGTSHIRT` (9), `FGSHIRT` (1); `Retek Class` Jeans, T Shirt, Shirt; sizes `XXL`, `82`, `76`, `96`, `92`, `S` and more; `Sleeve` `H` or `F` on shirts and T-shirts; MRP 999 to 2,625 (8 values); `Plant` `C014`; `Category` is `NA` on every row; `Fit Type` has 6 values (for example `PJ RG OCTANEMIDSTR`); `Fabric Base Type` 12 values (for example `70 Cotton28 Polyester2 Elastan`); `Color` 10 values.
- Cost columns: `WSP` and `Service Charge` are line totals; `Unit Cost` is the per-piece WSP; `Net Unit Cost` is the per-piece amount with service charge and tax (for example `Unit Cost` 1,531 and `Net Unit Cost` 1,643). All amounts are rounded to whole rupees, so `CGST %` shows 3 for 2.5. On all 28 rows `WSP` + `Service Charge` + `Tax Amount` = `Invoice Amount`, and `Unit Cost` times `Quantity` = `WSP`.
- Barcode: `EAN No`, 13 digits, valid EAN-13 (28 of 28).
- Missing: none of the core fields; it has the best metadata of the 33.
- Adapter: Medium (53 columns, whole-rupee rounding, the service charge in the cost).

### 27. `Madura Fashion Brand AS - VH - LP.xlsb`

- Supplier and brand: a billing extract of Madura Fashion (Aditya Birla) for all of its customers in April 2026. Brand codes in `Dv`. Supplier map: the Madura brand names map to MADURA PVT LTD (flag YES). File date 3 Jun 2026; 5,100,049 bytes.
- Real format: `.xlsb` (binary workbook) inside a zip package. Sheet `Sheet1`, 113,984 rows by 27 columns. Header row 1.
- Rows: 113,983 data rows for 176 sold-to accounts (149 distinct names), billing dates 1 to 30 Apr 2026, bill types ZINV 42,644, ZGST 42,594, ZREU 28,191, ZRUA 257, ZPOR 170, S1 127. Only 5,923 rows belong to KDPS: nine sold-to accounts, one per city, 219 bill documents, 447 purchase orders, 8,385 pieces, billing dates 6 to 30 Apr 2026. By bill type, KDPS rows are ZINV 5,439 (7,464 pieces), ZREU 445 (624 pieces) and ZPOR 39 (297 pieces). Value for KDPS rows: net Rs 1,49,58,498; tax Rs 10,52,894; gross Rs 1,60,11,393; line MRP Rs 2,59,55,453.
- KDPS sold-to accounts (code, city, rows): 321328 Deogarh 2,146; 321949 Hazaribag 1,247; 323542 Banka 738; 321844 Bodh Gaya 608; 321788 Sahibganj 348; 322542 Ranchi 341; 322519 Ranchi 146; 323118 Bokaro 223; 323110 Dumka 126. The name is `KDPS LIFESTYLE PRIVATE LIMITED` for seven accounts and `KDPS LIFESTYLEPRIVATE LIMITED` (no space) for Bokaro and Dumka. The Deogarh code here is 321328; `Peter England.CSV` has 321828 (one of them may be a typo).
- Columns (27): `Sold-to`, `Sold to Name1`, `CGrp`, `SGrp`, `City`, `BillT`, `Variant Material`, `Purchase order no.`, `Bill. Doc.`, `Account group`, `Reference`, `Your Ref.`, `Billing Date`, `Dv`, `Material Grp`, a blank-header column P, `Size 1`, `EAN/UPC`, `Generic Material`, `HSN  CODE`, `Billed Quantity`, a blank-header column V (unit MRP), a blank-header column W (unit net rate), `MRP`, `NET Value`, `Tax Amount`, `Gross Value`.
- Values: `Billing Date` is an Excel serial number. `CGrp` is `KM` and `SGrp` 142 on every KDPS row. `Dv` (brand code) for KDPS rows: AS 1,354; AK 947; VW 528; VH 462; AL 420; LR 415; AH 366; VS 365; LP 365; LY 289; VD 157; VX 126; VF 109; AT 20. `Material Grp` is a product group (`FGSHIRT` 2,035, `FGTSHIRT` 1,385, `FGJEANS` 860, `FGTROUSER` 503, `FGSWSHIRT` 169, `FGCKNTOP` 148 and more). `Variant Material` is the style plus size (`LPKPMRGFI74526XXLH`); `Generic Material` is the style. `Your Ref.` is `NA` (3,673 rows), `MAIL` (804) or `ORD. TRANS` (535). The column titled `MRP` holds the line total (quantity times the unit MRP in column V); `NET Value` is the line net. Quantity is 1 on 3,779 KDPS rows and 2 on 2,030. HSN 62052090 (1,551 rows), 62034290 (906), 61091000 (719) and others. `ZREU` rows carry positive quantities (returns or credit documents, guess). For ZPOR rows the line MRP is far above the net value (for example 26,997 against 3,216.23); the meaning is not stated.
- Barcode: `EAN/UPC`, 13-digit numbers stored as floating-point values, all valid EAN-13. KDPS rows hold 3,812 different EANs; 1,379 of them are billed on more than one row. 47 KDPS rows have size 0 (44 `FGBAG` and 3 `FGTIE`).
- Missing: colour, a description, the PT fields (season, gender, fit), buyer other than the sold-to name.
- Adapter: Hard (a 113,983-row file with 176 customers; choose rows by sold-to code and bill type).

### 28. `BLACKBERRY.xlsx`

- Supplier and brand: `BRAND NAME` is Blackberrys; the seller is the brand company (an SAP-like extract). Supplier map: `BLACKBERRY` and `BLACKBERRYS` to MOHAN CLOTHING COMPANY (flag YES). File date 13 Jun 2026.
- Real format: `.xlsx`. Sheet `Sheet2`, 30 rows by 41 columns. Header row 1. Every cell is text.
- Rows: 29 item rows with 41 pieces. Invoice `8500273403` dated `28.02.2026` (text, `dd.mm.yyyy`). `ACKNOWLEDGEMENT NO` is present (not copied).
- Columns (41): `BRAND NAME`, `INVOICE NUMBER`, `INVOICE DATE`, `BILL TO PARTY`, `SHIP TO PARTY CODE`, `SHIP TO PATY NAME`, `ORDER TYPE`, `SPSN`, `CATEGORY`, `GROUP CATEGORY`, `DELIVERY  NO`, `G ARTICLE`, `SIZES`, `EANCODE`, `ITEM DESCRIPTION`, `FIT`, `STYLE`, `COLOUR`, `INVOICE QTY`, `UNIT MRP`, `CHANNEL`, `SALES OFC`, `BASIC AMOUNT`, `DISCOUNT VALUE`, `DISCOUNT %`, `TAXABLE VALUE`, `COST PER UNIT`, `HSN CODE`, `BRAND TYPE`, `LINE ITEM NUMBER`, `SUPPLYING PLANT`, `IGST VALUE`, `CGST VALUE`, `SGST VALUE`, `IGST TAX %`, `CGST TAX %`, `SGST TAX %`, `DOCKET NO`, `DOCKET DATE`, `ACKNOWLEDGEMENT NO`, `ARTICLE SEASON`.
- Values: ship-to is KDPS (code present); `SPSN` holds a person's first name (not copied); `CATEGORY` `MS`; `GROUP CATEGORY` `FORMAL SHIRTS` and one more; 6 articles (`G ARTICLE` such as `MS015176B1`); `FIT` 3 values (for example `INDIA SLIM`); 5 styles; 5 colours; sizes 38 to 44 and more (9); `UNIT MRP` 2,399 or 2,599 and a third value; `DISCOUNT %` 29.76 or a second value (the brand's trade discount, not a customer discount); `IGST TAX %` 5.00 on all rows (IGST rather than CGST and SGST; probably an inter-state sale, inferred); `ARTICLE SEASON` SS26 or AW25; `SALES OFC` `EAST`; `BRAND TYPE` `Mainline`; `SUPPLYING PLANT` 2006; `DOCKET NO` empty; `DOCKET DATE` `00000000`.
- Barcode: `EANCODE`, 13-digit text, valid EAN-13 (29 of 29), starting 8909114.
- Missing: none of the core fields.
- Adapter: Easy.

## Family F: distributor and printed-invoice layouts

### 29. `USPOLO INNER WEAR.csv`

- Supplier and brand: no brand column (US Polo innerwear, from the file name). The seller is a distributor, DAULAL NANDLAL TRADING PRIVATE LIMITED (GSTIN present, not copied); the buyer is `KDPS LIFESTYLE P LTD`. Supplier map: `US POLO INNERWEAR` to OM GANPATI (DMK) (flag YES). File date 18 Mar 2026.
- Real format: a true CSV, no header row, 56 columns, 14 lines. The column meaning below is inferred from the values.
- Rows: 14 item rows with 119 packs (7 rows of 5, 6 of 10, 1 of 24). One invoice `AV116` dated `13-03-2026`; the month name and the year are in two more columns; a timestamp `13:03:2026 13:06:41` and `Normal Sale` close each line. Invoice total 25,143 (repeated on every row).
- Columns by position (inferred from the values): 1 invoice number, 2 date, 3 month name, 4 year, 5 an id, 6 seller, 7 seller GSTIN, 8 an id (`ARE12`), 9 state, 10 an id, 11 buyer, 12 an id (`NEWBEAT107`), 13 route text (`DUMKA-DEOGHAR-GODDA`), 15 and 16 a city id and city (`DUMKA`), 18 state, 19 an id, 20 a salesman name (not copied), 21 EAN-13, 22 item code with description, 24 description, 25 category (`Brief-MENS`, `Vest-MENS`, `Trunk-MENS`), 27 HSN, 28 style, 29 pack (`1P`, `2P`, `6P`), 30 colour (`ASSORTED`, `WHITE`, `Lt Grey/Black/Navy`), 31 size (S, M, L), 33 unit (`PCS`), 34 quantity (in packs), 35 rate, 36 MRP, 37 gross amount, 40 and 43 net and taxable amounts, 44 the rate again, 45 round-off (-0.33), 46 invoice total, 47 to 50 CGST and SGST rates (2.5) and amounts, 53 line total, 54 line tax, 55 timestamp, 56 sale type. The other columns (14, 17, 23, 26, 32, 38, 39, 41, 42, 51, 52) are empty or 0 on every row.
- Values: 6 style codes (`EB002`, `EB004`, `I024` and more), HSN 61071100 (9 rows), 61079110 (3), 61159500 (2), MRP 299, 279, 349 and more, rate about 70% of MRP.
- Barcode: column 21, 13 digits, valid EAN-13 (14 of 14), starting 8905706.
- Missing: header row; brand.
- Adapter: Medium-hard (no header, a pack count in the quantity column).

### 30. `AS INNERWEAR.csv`

- Supplier and brand: a printed tax invoice of T.T. APPARELS (Ranchi) to KDPS Hazaribagh for socks and handkerchiefs of Allen Solly, Louis Philippe, Peter England and Van Heusen. The letterhead has phone numbers, an email address, GSTIN and TIN (not copied). File properties: created 20 Mar 2026 by an account named `test`. File date 13 Jun 2026.
- Real format: a binary `.xls` (OLE2) with a `.csv` extension. Sheet `INVOICE`, 40 rows by 16 columns, 42 merged cells.
- Layout: letterhead rows 1 to 9; invoice `ADD-289` dated `16/03/2026` (text) in row 10; the buyer address and transport block rows 10 to 15; header row 16; item rows 17 to 26; totals block rows 27 to 32; terms rows 33 to 40.
- Columns (row 16): `HSN Code`, `Particulars`, `Packing`, `Company`, `Batchno`, `Expiry`, `MFG`, `M.R.P.`, `Qty.`, `Free`, `Rate`, `SGST%`, `CGST%`, `Amount`, `Disc%`, `Barcode`.
- Rows: 10 item rows with 155 pieces. Totals: amount 24,055.40, SGST 601.40, CGST 601.40, round-off -0.20, total 25,258.00 (the words line says Twenty Five Thousand Two Hundred and ...).
- Values: the `HSN Code` cell holds the code and the product text together (`61159500       SOCKS`, `62132000       HANKY`). `Particulars` carries the brand and the MRP (`ALLEN SOLLY SOCKS MRP-159`, `LOUIS PHILLIPE SOCKS MRP 249`, `PETER ENGLAND SOCKS MRP-139`, `VAN HEUSEN HANKY MRP-369`). One Allen Solly line, `ALLEN SOLLY SOCKS MRP-179`, has HSN text `HANKY`. `Company` is `ADDON`. `Batchno` is `MIX` on the first row only. Quantities: 30, 10, 10, 10, 35, 10, 10, 20, 15, 5. MRP 129 to 449; rate about 69% of MRP; SGST and CGST 2.5% each.
- Barcode: `Barcode` holds the brand initials and the MRP (`AS159`, `LP249`, `PE139`, `VH369`). It is not unique per item and is not an EAN.
- Missing: size, colour, a real barcode, season.
- Adapter: Hard (a printed layout; fields are packed into text).

### 31. `XERICS JEANS PT FILE.xlsx`

- Supplier and brand: brand XERICS (style `XJ ...`). The seller and buyer are not named. Supplier map: XERIC and XERICS to SNEHA ENTERPRISES (flag NO). File date 14 Mar 2026.
- Real format: `.xlsx`. Sheet `GST INVOICE`, A1:L94, 92 formulas. A two-row header (rows 1 and 2): `Sl` / `No.`, `Br-Code`, `Description of Goods`, `HSN/SAC`, `Size`, `MRP/` / `Marginal`, `Quantity`, a blank-header column H (a formula taking the first 5 characters of the MRP text, giving `1,195`), `Rate`, `per`, `Disc. %`, `Amount`.
- Rows: 90 item rows (rows 3 to 92), 90 pieces (one row per piece, `Quantity` 1). Row 93 is a stray row (65,664 in the discount column). Row 94 is `Total` (90; 65,664).
- Values: `Br-Code` 20 different 7-digit text codes (a 5-digit style plus a 2-digit size, for example `5000730` is style 50007 and size 30), repeated once per piece; 5 `Description of Goods` values (`XJ 50007`, `XJ 30094`, `XJ 30095`, `XJ 30097`, `XJ 30098`); sizes 28, 30, 32, 34; HSN 62034200; `MRP/ Marginal` is the text `1,195.00/pcs`; `Rate` 768; `Disc. %` 5; `Amount` 729.60 on every row (768 less 5%).
- Barcode: `Br-Code`, 7 digits (style plus size), not unique per piece and not an EAN. No per-item barcode exists.
- Missing: GST rate and tax amounts, invoice number and date, seller, buyer, colour.
- Adapter: Medium-hard.

### 32. `ambreli 1855.xls`

- Supplier and brand: OVERSEAS ENTERPRISES (Delhi) to `KDPS LIFESTYLE PRIVATE LIMITED (C/O JAINSONS LIFESTYLE)` at a Hazaribagh address. Brand AMBRELI (shawls, stoles and scarves; the SOH sample and the sales sample use the same brand). A contact person and two mobile numbers, GSTINs and an email address are present (not copied). Supplier map: AMBRELI to OVERSEAS ENTERPRISES (flag YES). File date 27 Feb 2026 (properties: last printed 21 Feb 2026).
- Real format: `.xls` (OLE2). Two sheets.
- Sheet `INVOICE`: 42 rows by 18 columns, 46 merged cells. Letterhead and a copy-type block (original, duplicate, triplicate) in rows 1 to 4; invoice `1855-GST/2025-26`, invoice date as an Excel serial number (21 Feb 2026), place of supply and billing blocks rows 5 to 22; the title `SHAWLS, STOLES & SCARVES ETC.` in row 23; a two-row header in rows 24 and 25: `S.No.`, `DESCRIPTION OF PRODUCT` (with `STYLE NAME` and `EAN CODE` under it), `HSN CODE`, `COLOR`, `UOM`, `MRP`, `SET`, `QTY`, `RATE 60.24%      OF MRP`, `TAXABLE VALUE`, `CGST` (`Rate %`, `Amount`), `SGST` (`Rate %`, `Amount`), `IGST` (`Rate %`, `Amount`), `TOTAL`. Lines in rows 26 to 41 (16 lines, 76 pieces), `TOTAL` in row 42 (set 16, quantity 76, taxable 12,996.31, IGST 649.82, total 13,646.13). The IGST rate is stored as 0.05. HSN 62143000; colour `ASSORTED`; unit `PCS`; MRP 109 to 499 (the rate is 60.24% of MRP). Styles `AM-ST-...`. Two lines have quantity 3 and the rest 5.
- Sheet `PACKING` (hidden): 99 rows by 9 columns, 9 merged cells. A packing list with the seller's letterhead, `PACKING LIST`, bill number and date, then the header in row 23: `S. NO.`, `CARTON`, `STYLE NO.`, `EAN CODE`, `COLOUR`, `MRP`, `SET`, `QTY`. 72 item rows with 275 pieces; `CARTON` is `CTN-1` and so on; `SET` is 1 on 45 rows and `LOOSE` on 27 rows. Row 97 shows 22 and 101 and row 98 shows 45 and 275.
- The two sheets do not reconcile: only 1 of the 16 invoice EANs appears in the packing list.
- Barcode: `EAN CODE`, 13-digit numbers (floating point), starting 8901191 (the invoice sheet; the packing sheet has the same prefix).
- Missing: none on the invoice sheet except season and gender.
- Adapter: Hard (letterhead layout, merged cells, a hidden second sheet that does not match the first).

### 33. `DSY.xlsx`

- Supplier and brand: brand `DSY` (men's indo-western and kurta sets). The seller and buyer are not named. Supplier map: DSY to DS YUVRAAJ (flag YES). File date 13 Jun 2026.
- Real format: `.xlsx`. Sheet `Sheet1`, 24 rows by 17 columns, 23 formulas (the `RATE` column). Header row 1.
- Rows: 23 item rows, 23 pieces. Invoice `DS/01028/25-26` dated `13/02/2026` (text). `AMOUNT` is the invoice total (55,834.40) repeated on every row.
- Columns: `Sl NO.`, `ITEM NAME`, `BRAND`, `Barcode`, `SIZE`, `QTY`, `MRP`, `Mark Down`, `RATE`, `HSNCODE`, `CATEGORY`, `GENDER`, `INVOICE NO`, `INVOICE DATE`, `TAX`, `CD%`, `AMOUNT`.
- Values: 3 `ITEM NAME` styles (`6767N`, `5736N` and one more); `CATEGORY` `INDO WESTERN SET` and `W/C KURTA SET`; `GENDER` `MENS`; sizes 5 to 14 (6 values, numeric); MRP 2,860 to 5,920 (16 values, rising with size); `Mark Down` 43.2; `RATE` is a formula `MRP * (1 - IF(MRP > 2624, 43.2%, 40%))` (float noise such as 3152.3999999999996); HSN 610329 on all rows; `TAX` 18 (indo-western sets) or 5 (kurta sets); `CD%` empty.
- Barcode: `Barcode`, text of 14 digits on 17 rows and 13 digits on 6 rows, with a leading 0 (internal; no row passes the EAN-13 check).
- Missing: colour, season, seller, buyer.
- Adapter: Easy-medium (formulas in the rate; invoice total on every row).

## Layout families in short

| Family | Files | Marks |
| --- | --- | --- |
| A bare item lists | SUVIDHI, FAHRENHEIT | `SNO.`, `Item Code`, `TOTAL QTY`, a filler last row, text-only cells |
| A master-style lists | AMIDHARA, peppermint, minelli, kidcity | Item-master columns (`Brand`, `Style`, `Shade`, `Size`, `HSN Code`); no bill header |
| B voucher registers | ARVIND, BK, DEAL, ZILU (cousins BANJARAN, DSY) | `Voucher No`, `Stock No`, `Retail Price`, `Item Rate`; title rows and a `Grand Total :` row |
| B ledger reports | TWILLS, STATUS QUO | `CGST`, `SGST`, `IGST`, `Net Amount` tail; labels shifted in TWILLS |
| B accounting exports | SWEET DREAMS, KILLER JUNIOR (SUVIDHI and FAHRENHEIT look related) | `TAX-1(RS)`, `TAX-3(RS)`, bill totals rows |
| C PT EMAIL | BEEVEE, go colours, MUFTI (sibling HYPHEN) | `OWNER SITE`, `CATEGORY1` to `CATEGORY5`, snake_case; cleanest |
| D Jockey | five bill-wise lists and one invoice print | `StockNo`, `Batch No.` holds the MRP; totals rows |
| E Aditya Birla and SAP-style | Peter England, Madura extract, BLACKBERRY | Code columns, tax split columns |
| F printed invoices and distributor | USPOLO, AS INNERWEAR, XERICS, ambreli | Header block, merged cells, packed text, a missing header |

## The common field set

Every file has some barcode or code, a quantity, a style or description, an MRP and a size. The names differ. This table maps the KDPS PT export profile (`PRD-PTW-008`) to what the supplier files carry.

| KDPS PT field | Names used by suppliers (files) |
| --- | --- |
| `BARCODE` | `Item Code` (SUVIDHI, FAHRENHEIT); `Barcode` (AMIDHARA, ANOKHI, ZILU, DSY, AS INNERWEAR as brand plus MRP); `Stock No` (peppermint, ARVIND, BK, DEAL); `StockNo` (Jockey lists); `STOCK NO.` (JOCKEY.xlsx); `BarCode No` (minelli); `SKU No` (kidcity); `Supplier Barcode` (BANJARAN); `Bar Code` (TWILLS); `EN Code` (STATUS QUO); `ADDITIONAL ITEM CODE` (SWEET DREAMS); `BARCODE` (KILLER JUNIOR, BEEVEE, go colours, MUFTI, HYPHEN); `EAN No` (Peter England); `EAN/UPC` (Madura); `EANCODE` (BLACKBERRY); an unnamed column (USPOLO); `Br-Code` (XERICS); `EAN CODE` (ambreli) |
| `DESIGN` (style) | `ITEM NAME` (SUVIDHI, FAHRENHEIT, SWEET DREAMS, KILLER JUNIOR, DSY); `Item Code` (AMIDHARA, STATUS QUO); `Style` (peppermint, minelli, ARVIND, BK, DEAL, ZILU, BLACKBERRY, HYPHEN); `VSKU` (kidcity); `Item Name` (BANJARAN); `CATEGORY2` (PT EMAIL); `Style Code` (Jockey); `Material` and `Generic Material` (Peter England, Madura); `STYLE NAME` (ambreli); `Description of Goods` (XERICS) |
| `COLOR` | `Shade` (peppermint, minelli, ARVIND, BK, DEAL, ZILU, STATUS QUO); `Color` (AMIDHARA, kidcity, Peter England); `COLOUR` (BLACKBERRY, JOCKEY.xlsx); `Colour Code` (Jockey); `SHADE` and `SHADE NAME` (SWEET DREAMS, KILLER JUNIOR); `CATEGORY3` (PT EMAIL); `COLOR` (ambreli); the `Item Group` column of BANJARAN. Absent as a field: SUVIDHI and FAHRENHEIT (inside the item name), HYPHEN, TWILLS, XERICS, DSY, AS INNERWEAR, Madura |
| `SIZE` | `PACK / SIZE` (SUVIDHI, FAHRENHEIT); `Size` (most); `SIZES` (BLACKBERRY); ` SIZE` (SWEET DREAMS); `Size 1` (Madura); `Age Group` (kidcity); `CATEGORY4` (PT EMAIL); inside `Item Name` (TWILLS); none (AS INNERWEAR) |
| `QTY` | `TOTAL QTY`, `Quantity`, `Qty`, `QTY`, `Sales Qty`, `INVOICE_QUANTITY`, `INVOICE QTY`, `Qty.`, `Billed Quantity`, `TransQty` |
| `MRP` | `M.R.P.`, `MRP`, `Retail Price`, `Retail Rate`, `Price` (kidcity), `RSP`, `INVOICE_RSP`, `UNIT MRP`, `MRP/ Marginal` (XERICS), `Batch No.` (Jockey lists), a line total in `MRP` (Madura) |
| `BASIC` and `P RATE` (cost) | `SALE RATE`, `Cost Price`, `Item Rate`, `Rate`, `Net Rate`, `RATE`, `INVOICE_RATE`, `WSP`, `Net Unit Cost`, `Unit Cost`, `Doc Rate`, `COST PER UNIT`, `Purchase Price` (DEAL), `RATE/UNIT`, `Cost` and `MDP` (Jockey). The cost to book differs by file (see open questions) |
| `HSN` | `HSN CODE`, `HSN Code`, `HSN`, `HSN/SAC`, `HSNCODE`, `HSN_CODE`, `HSN  CODE`, `GROUP25.GRP1` (KILLER JUNIOR), inside the `HSN Code` text (AS INNERWEAR) |
| `INPUT TAX` and `OUTPUT TAX` | A GST percentage in `Tax Percentage`, `TAX_RATE`, `GST %`, `Tax Perc.`, `TAX`, `GST Rate`, `TAX 3`, `SGST%` and `CGST%`, `IGST TAX %`. Amounts only: BK, TWILLS, SWEET DREAMS, KILLER JUNIOR, Madura. No tax data: SUVIDHI (no HSN either), HYPHEN, AMIDHARA, kidcity, XERICS |
| `BRAND` | A `Brand` column (peppermint, minelli, ARVIND, BK, DEAL, ZILU, AMIDHARA, DSY, BLACKBERRY, and BANJARAN where it is empty); `CATEGORY1` (PT EMAIL); `COMPANY NAME` (KILLER JUNIOR); `Dv` code (Madura); code `PJ`, `N` or `RE` (Peter England). No brand field: SUVIDHI, FAHRENHEIT, HYPHEN, SWEET DREAMS, the six Jockey files, USPOLO, TWILLS (only a `Type` sub-range), STATUS QUO, kidcity, XERICS, ambreli, and AS INNERWEAR (brand inside `Particulars`) |
| `SEASON` | `SEASON` (peppermint); `Season` (ARVIND, BK, DEAL, SWEET DREAMS); `GROUP9.GRP1` (KILLER JUNIOR); `ARTICLE SEASON` (BLACKBERRY). Absent elsewhere |
| `GENDER`, `FIT`, `SUB CATEGORY`, `TYPE`, `ITEM` | Rare. `GENDER` in peppermint, DSY, kidcity, SWEET DREAMS (`GENDER + Body`), minelli (empty); `FIT` in BLACKBERRY, Peter England (`Fit Type`), KILLER JUNIOR (`GROUP10.GRP1`) and unlabelled columns (ZILU, MUFTI); category words in `Category`, `Product`, `CATEGORY5`, `DEPARTMENT`, `SECTION`, `Retek Class`, `Material Grp` |

Also on most files, and not part of the PT profile: an invoice number (`Voucher No`, `INVOICE_NO`, `Bill No`, `Invoice No`, `Vch No`, `Reference`), an invoice date in five forms (real date, `dd/mm/yyyy` text, `dd.mm.yyyy` text, `yyyymmdd`, Excel serial), the supplier or `OWNER SITE`, the buyer (`Party Name`, `CUSTOMER_NAME`, `Ledger Name`, `Customer Name`, `REF SITE`), and a bill total.

- Often missing: supplier name (not a column in SUVIDHI, FAHRENHEIT, AMIDHARA, peppermint, kidcity, ARVIND, ZILU, KILLER JUNIOR, XERICS, DSY; BK only in the title), buyer (SUVIDHI, FAHRENHEIT, AMIDHARA, peppermint, minelli, kidcity, BANJARAN, XERICS, DSY), invoice number or date (SUVIDHI, FAHRENHEIT, AMIDHARA, peppermint, XERICS; kidcity and minelli lack a date), HSN (SUVIDHI, JOCKEY 852, kidcity), cost (AMIDHARA).
- Supplier GSTIN is present in BANJARAN, DEAL, STATUS QUO, Peter England, USPOLO, AS INNERWEAR and ambreli (the packing sheet). TWILLS has `GST CMP` empty. KDPS GSTIN is present as the buyer in several files. None is copied.
- Quantity above 1 on a barcode row is common (up to 10 in Jockey invoice and Madura rows; 35 on one AS INNERWEAR line). Tag printing would have to explode the quantity.

## Barcodes

- Valid EAN-13 (all rows): FAHRENHEIT, peppermint, ARVIND, BK, DEAL, TWILLS, STATUS QUO, SWEET DREAMS (`ADDITIONAL ITEM CODE`), KILLER JUNIOR, BEEVEE, go colours, MUFTI, BLACKBERRY, all Jockey files, Peter England, Madura, USPOLO, ambreli. BK's 777 prefix is vendor-made but valid.
- Not EAN-13: SUVIDHI (12 digits), AMIDHARA (10 digits), BANJARAN (6), ZILU (5), minelli (10), HYPHEN (8 alphanumeric), DSY (13 or 14 digits with a leading 0), kidcity (13 digits starting 820, internal; 31 of 272 pass), XERICS (7, style plus size), AS INNERWEAR (brand initials plus MRP), SWEET DREAMS `ITEM CODE` (internal).
- No usable per-item barcode: AS INNERWEAR, XERICS, BANJARAN.
- A barcode is not unique in a file: Jockey PARAS (13 repeated), DD SALES (20 repeated, four with two MRPs), STATUS QUO (10 repeated), XERICS (one code per 3 to 6 rows), kidcity (16 shared between the two invoices), Madura (1,379 of 3,812 KDPS EANs billed more than once). MRP also changes with size inside a style (AMIDHARA, DSY).

## Cross-file notes and quirks

- Numbers stored as text: SUVIDHI, FAHRENHEIT, minelli, BLACKBERRY, kidcity (price), the Jockey `Batch No.` column. Float noise: DSY, kidcity.
- Totals, filler and blank rows: SUVIDHI and FAHRENHEIT (filler), ARVIND, BK, DEAL and ZILU (totals), STATUS QUO, minelli, HYPHEN, SWEET DREAMS, KILLER JUNIOR (totals), the Jockey lists (three total rows), AS INNERWEAR and ambreli (a totals block), XERICS (a stray row and a total).
- Store hints in free text: `REF SITE` (`KDPS-HZB-BV`, `-GC`, `-MF`: Hazaribagh), STATUS QUO `-DEO` (Deoghar), KILLER JUNIOR `-JNR` (Junior), HYPHEN `Ranchi`, ambreli `C/O JAINSONS LIFESTYLE` (Hazaribagh), Peter England city `Deogarh`, Madura nine cities. Which KDPS Site or Store receives each file is not a column in most files.
- Same supplier across files: five Jockey lists and the Jockey invoice print; D Apparel / D D Apparels in STATUS QUO and SWEET DREAMS (probably one distributor, guess; the supplier map lists `D APPAREL` and `DD APPAREL` separately); Aditya Birla in Peter England and Madura (the two do not overlap: May against April).
- Hidden content: the ambreli `PACKING` sheet and the kidcity rows hidden by a filter. No hidden columns in any `.xlsx`.
- Names that differ from the content: the ARVIND file name says all brands and Spykar but the data is Flying Machine only; the BK file name says LC but the data is Little Pink; `JOCKEY.xlsx` is addressed to "D D Developers".
- Sensitive content by file: GSTIN (BANJARAN, DEAL, STATUS QUO, Peter England, USPOLO, AS INNERWEAR, ambreli, TWILLS buyer column, STATUS QUO buyer column); contact details (AS INNERWEAR, ambreli); person names (HYPHEN `AGENT_NAME`, BLACKBERRY `SPSN`, USPOLO salesman, ambreli contact); e-invoice reference and acknowledgement numbers (ARVIND, BLACKBERRY). None is copied.

## Adapter difficulty

- Easy (14): SUVIDHI, FAHRENHEIT, AMIDHARA, peppermint, minelli, ARVIND, BK, DEAL, SWEET DREAMS, BEEVEE, go colours, MUFTI, HYPHEN, BLACKBERRY.
- Easy-medium: ZILU, STATUS QUO, KILLER JUNIOR, DSY.
- Medium: kidcity, BANJARAN, TWILLS, the six Jockey files, Peter England.
- Medium-hard: USPOLO, XERICS.
- Hard: Madura extract, AS INNERWEAR, ambreli.
- Rule for adapters: read each file by its content and each column by its name, never by position; tolerate damaged headers; ignore filler, totals and hidden rows only after reading them; keep every source value and its origin for review.

## Open questions

- KDPS Owner or Booking (P-BKG): is one PT file one invoice (or one goods receipt), or can it span invoices (kidcity 2, Peter England 5, Madura a whole month for 176 customers)? Which Madura rows count as KDPS goods (the nine sold-to accounts; bill types ZINV, ZREU, ZPOR)? Blocks Stage 2 (goods-in).
- Accounts: which price is the cost to book: rate, taxable value divided by quantity, or net unit cost (Peter England service charge, MUFTI taxable amount 0.35% above rate times quantity, Jockey `Cost` against `Doc Rate`, DEAL `Purchase Price` against `Item Rate`)? Blocks Stage 2.
- KDPS Owner or Operations (P-OPS): for files without a usable barcode (AS INNERWEAR, XERICS, BANJARAN, ZILU, HYPHEN) or with an internal one, does KDPS print its own barcode, and what does the earlier POS use? Blocks Stage 2.
- KDPS Owner: DEAL and ambreli name "Jainsons Lifestyle": which KDPS Site or Store is that? Why is `JOCKEY.xlsx` addressed to D D Developers, and why is DEAL invoiced to Om Ganpati Enterprises? Blocks Stage 1 (Supplier and party master) and Stage 2.
- KDPS Owner: do the ambreli invoice sheet (16 lines, 76 pieces) and the hidden packing list (72 lines, 275 pieces) belong to one shipment? Blocks Stage 2.
- Product owner: does quantity N on a row mean N price tickets to print? Blocks Stage 2.
- Accounts or CA: which GST rate applies when a file gives none, and what are the unlabelled rate columns in MUFTI and ZILU? Blocks Stage 2 (tax on receipt).
- KDPS Owner: is the ARVIND file (extra stock correction against a bill) real goods-in, and is the Aditya Birla Deogarh account code 321328 or 321828? Blocks Stage 2.
- Product owner: will suppliers keep their layouts, and can KDPS ask the large ones (Madura, Jockey) for a fixed export? Blocks Stage 2.
