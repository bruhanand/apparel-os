# monthly-reports-april-may-2026

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [..](../README.md)

## What this folder is
- KDPS staff (the author is not named in any file) build a monthly report for each brand they sell, one per brand and Store (for some brands, one for all Stores). Each report has two lists in a Tally-style layout: a **List of Sales Vouchers** (the month's sales lines) and a **List of Stock Details** (SOH, the stock a system reports as on hand; a comparison source, not a count).
- The reports are made from raw exports of the earlier POS (point-of-sale software), brand by brand. The brand's offer terms and an offer-eligibility list (the AMM list) feed the `Dis %` column.
- Files here were saved between 27 May and 2 Jun 2026 (top level; the photos were taken on 1 Jun), 2 Apr to 2 May 2026 (`2026-04/`) and 1 to 2 Jun 2026 (`2026-05/`). They show how the work is done today and the layout the reports follow. KDPS sent the folder as examples of the monthly reports and of how they are built.
- No file here names who receives a report, how it is sent, or on what date (OPEN, below). A phone call of about 19 Jun 2026 about the dummy Blackberry and Mufti offer report is summarised in the neighbouring `brand-analysis-report` folder ([README](../brand-analysis-report%20/README.md)).
- The words "voucher" and "series" in these files are Tally words. In the PRD's "Words used", a Voucher is an accounting entry in Tally; here it only names the report layout.

## Folder map
| Path | What it holds | README |
| --- | --- | --- |
| `FORMAT_SALES_VOUCHERS.xlsx` | Empty target layout for the two lists | this file, below |
| `KDPS-DIRECTION.xlsx` | Flying Machine (FM) May 2026 formula template | this file, below |
| `FM-offer-list.jpeg` | Flying Machine offer calendar (screenshot) | this file, below |
| `20260601_163402.heic`, `20260601_163404.heic` | Two phone photos of handwritten notebook pages | this file, below |
| `2026-04/` | Louis Philippe (LP) April 2026: six voucher files, the AMM list, `DATA/` raw POS exports | [2026-04](2026-04/README.md), [DATA](2026-04/DATA/README.md) |
| `2026-05/` | The two `.skill` files and `data/` (Blackberry and Mufti May files) | [2026-05](2026-05/README.md), [data](2026-05/data/README.md) |

Related notes (not ranked, decide nothing): [offers-and-brand-reports.md](../../data-notes/offers-and-brand-reports.md) for offers, the AMM list and brand reports; [pos-exports.md](../../data-notes/pos-exports.md) for the raw POS layouts; [stores-and-codes.md](../../data-notes/stores-and-codes.md) for Store and bill-series codes. PRD rules these files touch: `PRD-OFR-002` (offers keep brand and company cost shares), `PRD-OFR-006` (report who funded the discount), `PRD-OFR-018` (supplier-claims register, including promotional funding), `PRD-ORG-016` (brand-funded promotion terms), `PRD-EBO-004` (brand-reported totals kept apart from verified bill evidence) and `PRD-LIF-014` (side-by-side imports never move stock). See [prd.md](../../prd.md).

## How one report is made (as the files show it)
1. Store staff or head office export each Store's sales and stock from the earlier POS, per brand (one workbook per Store, several brands mixed in some). See [DATA](2026-04/DATA/README.md).
2. The brand's lines are picked out of the mixed export. For the Allen Solly Store in Deoghar the Louis Philippe sheets are called `LP2`.
3. The sales lines are copied one to one into the `SALES` layout of `FORMAT_SALES_VOUCHERS.xlsx`: `Particulars` is always `CASH`, `Unit` is always `PCS`, `Price` is the POS `Gross Amt`, `Dis` is `Dis %` of `Price` and `Total` is `Price` less `Dis`. Returns stay as negative quantities.
4. The stock list is copied into the `SOH` layout with a single date on every line, the brand's short code, and `Total MRP` as quantity times MRP.
5. A discount flag from the AMM list (`Discount` or `No Discount`) is looked up by style code and the offer percentage is typed into `Dis %` for flagged lines. See [2026-04](2026-04/README.md).
6. The two `.skill` files in `2026-05/` describe steps 3 to 5 as AI-assistant instructions for Excel (31 May 2026). See [2026-05](2026-05/README.md).
7. The finished workbook is submitted. Channel, recipient and date are not in the folder.

## Reports per brand each month (photo 2)
`20260601_163404.heic` lists, for each brand, how many Stores and how many reports. The totals add to 34 reports a month.

| Brand (as written) | Stores | Reports |
| --- | --- | --- |
| Mufti | 4 | 1 |
| BB (Blackberry) | 3 | 1 |
| LP (Louis Philippe) | 6 | 6 |
| PE (Peter England) | 7 | 7 |
| AS (Allen Solly) | 10 | 10 |
| VH (Van Heusen) | 7 | 7 |
| Banjaran | 2 | 2 |

- Mufti and Blackberry reports cover all their Stores in one workbook; the other brands get one report per Store.
- "Banjaran" is listed among the brands. It may be a brand or a Store name (guess).
- Samples in the folder: LP April (six Stores, see `2026-04/`), Blackberry and Mufti May and June, Flying Machine (the template below). No sample exists for PE, AS, VH or Banjaran (OPEN). Banka's April export holds Flying Machine sales (see [DATA](2026-04/DATA/README.md)); FM is not on the photo's list.

## Files at this level

### `FORMAT_SALES_VOUCHERS.xlsx`
- **What it is.** The empty target layout every report follows. 12,598 bytes, last saved 31 May 2026 (the file's internal date). Header rows only, no data. Created by KDPS staff (author not named).
- **Sheet `SALES`** (`A1:N4`, frozen below row 4). Rows 1 to 3 are merged across `A:N`:
  - `A1`: `KDPS LIFESTYLE PVT. LTD.`
  - `A2`: `List of Sales Vouchers`
  - `A3`: `Voucher Series : LOUIS PHILIPPE  (From 01-04-2026 To 30-04-2026)` (two spaces before the bracket)
  - Row 4, the 14 columns, in order:

| Col | Header | Meaning in the filled reports |
| --- | --- | --- |
| A | `Date` | Bill date, shown `d-mmm-yy` |
| B | `Vch/Bill No.` | POS bill number, such as `26-27/DEOT/6` (financial year, Store series, number) |
| C | `Particulars` | Always `CASH` in the filled files |
| D | `Item Details` | Item (SHIRT, T-SHIRT, JEANS and so on) |
| E | `Brand` | Brand name |
| F | `Size` | Size (letters or numbers) |
| G | `Style Code` | The POS `Design No` |
| H | `Barcode` | 13-digit barcode, number format `0` |
| I | `Unit` | Always `PCS` |
| J | `Qty.` | Quantity; a return is negative |
| K | `Price` | The POS `Gross Amt` (MRP times quantity), not the POS `Rate` |
| L | `Dis %` | Offer percentage |
| M | `Dis ` | Discount amount (the header has a trailing space); formula `L/100*K` |
| N | `Total` | `K` less `M` |

  - Column O is not in the target; delivered April vouchers add an unlabeled column O (discount flag). See [2026-04](2026-04/README.md).
- **Sheet `SOH`** (`A1:J4`). Rows 1 to 3 merged across `A:J`: `KDPS LIFESTYLE PVT. LTD.`, `List of Stock Details`, `Voucher Series : LOUIS PHILIPPE (From 01-04-2026)` (start date only). Row 4, 10 columns: `Date`, `Item Details`, `Barcode`, `Size`, `Style Code`, `Brand`, `Qty.`, `Unit`, `MRP`, `Total MRP`.
- **Format.** No formulas and no data: column widths, fonts and borders only. `SALES` is frozen below row 4; `SOH` is not frozen.
- **Used by.** All six April vouchers (identical layout), the Blackberry and Mufti May and June workbooks (small changes), and the `kdps-report` skill, which builds these header shells.
- **Notes.** [offers-and-brand-reports.md](../../data-notes/offers-and-brand-reports.md).

### `KDPS-DIRECTION.xlsx`
- **What it is.** A formula template for the Flying Machine (FM) report for May 2026, titled `Sale Report May-26` with the series `FLYING MACHINE`, `From 01-05-2026 to 31-05-2026`. Saved 27 May 2026 (343,095 bytes); first created 2 Nov 2025 (file's internal date). The name suggests it is the direction KDPS gave for the FM report (guess). It has no sales data: the input cells are empty and only formulas and a stock list are present.
- **Sheets.**
  - `Sale Report May-26`, `A1:U404`, frozen at row 100 (an odd place; the first rows scroll away). Rows `5` to `403` hold 399 rows of formulas. Row 404 has totals.
  - `SOH`, `A1:L2001`, frozen below row 4. 1,067 stock rows (rows 5 to 1071), formulas pre-filled to row 2000, totals in row 2001.
- **Header block of `Sale Report May-26`.**
  - `A1:N1` merged: `KDPS LIFESTYLE PVT. LTD.`; `A2:N2`: `List of Sales Vouchers`; `A3:B3`: `Voucher Series :`; `C3:D3`: `FLYING MACHINE`; `E3:N3`: `From 01-05-2026 to 31-05-2026`.
  - Row 4 headers, in order (20 columns, `A` to `T`): `Date`, `Vch/Bill No`, `Particulars`, `Item Details`, `MRP`, `Barcode`, `Size`, `Style Code`, `Brand`, `Qty.`, `Unit`, `Price`, `Dis Amount`, `Total`, `BILL QTY`, `BILL VALUE`, `OFFER`, `OFFER PROPORTION`, `DISCOUNT %`, `EOSS FLAG`.
  - Compared with `FORMAT_SALES_VOUCHERS.xlsx`: `MRP` is a new input column `E` placed before `Barcode`, `Size` and `Style Code`; `Dis %` is gone and `Dis Amount` is looked up; `Price` is computed as quantity times MRP; columns `O` to `T` are new.
- **Columns, rows 5 to 403 (399 rows).** `Date`, `Vch/Bill No`, `Item Details`, `MRP`, `Barcode`, `Size`, `Style Code` and `Qty.` are input cells (all empty: columns `A`, `B`, `D`, `E`, `F`, `G`, `H`, `J`). The rest are formulas:

| Col | Header | Formula (row 5 shown) | What it does |
| --- | --- | --- | --- |
| C | `Particulars` | `=IF($B5=0," ","Cash")` | `Cash` when a bill number is present |
| I | `Brand` | `=IF(H5>0,$C$3," ")` | Brand name from `C3` when a style code is present |
| K | `Unit` | `=IF($F5=0," ","Pcs.")` | `Pcs.` when a barcode is present |
| L | `Price` | `=IF(J5*E5=0," ",J5*E5)` | Quantity times MRP |
| M | `Dis Amount` | `=IF(E5>0,IFERROR(VLOOKUP($E5,'[2]Table 1'!$B$2:$I$147,8,0),"0.00")," ")` | Looks up the MRP in an external table and returns its 8th column (see "External files"); `"0.00"` (text) when the MRP is not found |
| N | `Total` | `=IFERROR(L5+M5," ")` | Price plus the looked-up amount |
| O | `BILL QTY` | `=IF(IF(COUNTIF($B$5:B5,B5)>1," ",SUMIF($B$5:$B$423,B5,$J$5:$J$423))=0," ",IF(COUNTIF($B$5:B5,B5)>1," ",SUMIF($B$5:$B$423,B5,$J$5:$J$423)))` | On the first line of each bill number, the quantity of the whole bill; blank on later lines |
| P | `BILL VALUE` | same shape, summing `L` (`Price`) | On the first line of each bill number, the value of the whole bill |
| Q | `OFFER` | two versions, see below | Offer amount for the bill |
| R | `OFFER PROPORTION` | `=IF(B5=""," ",IF(OR(L5="",P5="",Q5=""),"",IFERROR(L5/$P$26*$Q$26,"")))` | Spreads the bill's offer over its lines by price |
| S | `DISCOUNT %` | `=IFERROR(Q5/P5," ")` | Offer divided by bill value |
| T | `EOSS FLAG` | `=IF(F5>0,IFERROR(VLOOKUP($F5,[1]Sheet1!$C$3:$L$3445,10,0),"EOSS"),"")` | Looks up the barcode in an external Arvind EOSS offer file; shows `EOSS` when not found |

- **Two offer regimes by row position (not by date).**
  - Rows 5 to 149 (145 rows): `=IF(P5=" "," ",IF(P5>6999,1000,IF(P5>4999,500," ")))`. A bill value above 6,999 gives 1,000; above 4,999 gives 500; otherwise blank. This resembles the running FM Season SS'26 slab (see `FM-offer-list.jpeg`: buy 4999 get 500, buy 6999 get 1000), but it uses "above" where the list says "buy 4999" and "buy 6999" (likely a slip; OPEN).
  - Rows 150 to 403 (254 rows): `=IFERROR(IF(O150="","",IF(O150>=2,P150*50%,IF(O150=1,P150*40%,"")))," ")`. A bill of 2 or more pieces gives 50% of the bill value; a bill of 1 piece gives 40%. This resembles the percentage tiers `B1-40%, B2-50%` of the AW'25 end-of-season sale (EOSS) lines.
  - The template does not say which dates each regime covers (OPEN).
- **`OFFER PROPORTION` anchor.** On rows 5 to 379 (375 rows) the formula divides by `$P$26` and multiplies by `$Q$26` (the offer of the bill in row 26, not its own row). On rows 380 to 403 (24 rows) it anchors to `$P$5` and `$Q$5`. As written, the spread uses a single bill's value for every line (likely a template slip; OPEN).
- **Counters, `O1:S3`.**

| Cell | Label (row 1) | Formula (row 2) | Reading |
| --- | --- | --- | --- |
| `O1`/`O2` | `LAST BILL NO` | `=IF(MAX(B:B)=0," ",MAX(B:B))` | Highest value in column `B`. Works only when bill numbers are plain numbers; text such as `26-27/GAYA/561` gives blank |
| `P1`/`P2` | `T.QTY` | `=SUBTOTAL(9,J5:J1048576)` | Total quantity of all lines |
| `Q1`/`Q2` | `REPORTED QTY` | `=SUBTOTAL(9,O5:O1048576)` | Sum of `BILL QTY`, so the quantity on lines that carry a bill number |
| `R1`/`R2` | `BALANCE TO DO` | `=P2-Q2` | `T.QTY` less `REPORTED QTY` |
| `S1`/`S2` | `AVERAGE DIS %` | `=IFERROR(AVERAGE(S5:S403),"")` | Average of `DISCOUNT %` |

  - Unlabeled extras: `Q3` `=SUBTOTAL(9,Q5:Q1048576)` (sum of `OFFER`), `R3` `=SUBTOTAL(9,R5:R1048576)` (sum of `OFFER PROPORTION`), `S3` `=IF(Q3-R3<0,"",Q3-R3)` (their difference). Row 404: `J404`, `L404`, `N404` are `SUBTOTAL(9, ...)` of rows 5 to 403. All cached results are 0 or blank.
  - How KDPS intends to use the counters is not documented (OPEN).
- **Sheet `SOH`.**
  - `A1:J1` merged `KDPS LIFESTYLE PVT. LTD.`; `A2:J2` `List of Stock Details`; `A3:B3` `Voucher Series :`; `C3` `FLYING MACHINE`; `D3:J3` `From 01-05-2026`. Counters `K1` `QTY` and `L1` `AMOUNT` with `K2`, `L2` totals.
  - Columns (10): `Date`, `Item Details`, `Barcode`, `Size`, `Style Code`, `Brand`, `Qty.`, `Unit`, `MRP`, `Total MRP`. `Date` is `=IF(C5>0,RIGHT($D$3,10)," ")` (the date text from `D3`, `01-05-2026`); `Brand` is `=IF(C5>0,$C$3," ")`; `Unit` is `=IF(G5>0,"Pcs."," ")`; `Total MRP` is `=IF(I5*G5=0," ",I5*G5)`. Data columns `B`, `C`, `D`, `E`, `G`, `I` are typed.
  - 1,067 rows, quantity 1,567, total MRP ₹38,48,486.10. Dated `01-05-2026` on every row. 1,062 distinct barcodes (five repeats), 436 distinct style codes.
  - Item mix: JEANS 457, T-SHIRT 305, SHIRT 232, TROUSER 35, SWEATSHIRT 23, JACKET 15. Style codes start `FMJEN`, `FMTSH`, `FMSHT`, `FMTRC`, `FMTRO`, `FMSWS`, `FMJCK`. MRP from ₹899 to ₹7,374. Quantity per row: 1 (674 rows), 2 (318), 3 (48), 4 (24), 5 (1), 6 (2). No Store or location column.
- **External files the formulas point to (neither is in the folder).**
  - `[1]`: `1. ARVIND ALL BRAND AW'25 EOSS OFFER.xlsx`, sheet `Sheet1`, range `C3:L3445`. It is kept under KDPS's `INVOICE, MARGIN, & DEFECTIVE FORMAT` folder tree on the `D:` drive (`ARVIND LINEN CLUB & SPYKAR INVOICE` / `ARVIND ORDER & EOSS TAG SHEET` / `ARVIND AW'25 ORDER SHEET & EOSS TAG`). The workbook keeps a cached copy of 3,443 rows (rows 3 to 3445). Cached columns, as read: `C` style code (340 distinct), `D` `CORE` or `OCOR`, `E` a season code (`CO25` 1,575, `CO26` 1,251, `OC25` 410, `CO24` 150, `OC26` 57), `F` a number such as a price, `G` brand code (`US` 1,348, `AR` 1,020, `UD` 296, `FM` 289, `AN` 250, `AS` 240), `H` a sub-category code (18 values), `I` a style plus size code (3,443 distinct), `J` size (24 values), `K` category (TROUSER 1,207, SHIRT 1,132, POLO T-SHIRT 470, JEANS 366, BLAZER 100, T-SHIRT 72, SUIT 60, FORMAL SHIRT 18), `L` `NOD` on every row. The formula returns the 10th column (`L`). `NOD` probably means "no discount" (guess).
  - As cached, column `C` holds style codes while the formula looks up a barcode, so no barcode can match and the flag would always show the default `EOSS` (inferred; the real external file may differ).
  - `[2]`: `FM APPAREL A4.xlsx`, sheet `Table 1`, range `B2:I147`, kept under `C:\Users\user\Downloads`. Cached copy: 146 rows (rows 2 to 147). The title row sits at row 74: `Existing MRP`, `Old GST Rate`, `Old GST Amt`, `Base Value`, `New GST Rate`, `New GST Amt`, `New MRP`, `GST DIFF` (columns `B` to `I`). The other 145 rows are MRP values from ₹1,059 to ₹9,500; old rate 0.12 on every row; new rate 0.05 on 49 rows and 0.18 on 96 rows. The 8th column (`GST DIFF`) is negative where tax fell and positive where it rose. So the template's `Dis Amount` is a GST re-pricing difference by MRP, not a brand offer (inferred from the titles).
  - A VLOOKUP into a table that includes its own title row is harmless (the title text never equals an MRP).
- **Quirks.** `SUMIF` ranges run to row 423 though the sheet's formulas stop at row 403. Both external links show `refreshError` in the cache. The first sheet is frozen at row 100.
- **Notes.** [offers-and-brand-reports.md](../../data-notes/offers-and-brand-reports.md).

### `FM-offer-list.jpeg`
- **What it is.** A screenshot (1377 by 497 pixels, saved 27 May 2026) of a table of Flying Machine offers. Columns: `Brand Name`, `Offer Type`, `Season`, `Offer Details`, `Offer Starting Date`, `Offer Closing Date`, `Offer Status`. Who made it is not stated; the layout looks like a brand-side offer tracker (guess). Offer types: `ATV` (basket-value slabs; the abbreviation is not explained, perhaps average transaction value: guess), `EOSS` (read as end-of-season sale: percentage tiers and buy-get), `FRESH` (a no-offer period).
- **Every line** (18 lines; all `FLYING MACHINE`):

| # | Type | Season | Offer details | Start | Close | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ATV | AW'25 | BUY 14999/- GET 3000/- OFF | 08-Sep-25 | 31-Oct-25 | CLOSED |
| 2 | ATV | AW'25 | BUY 10999/- GET 2000/- OFF | 08-Sep-25 | 31-Oct-25 | CLOSED |
| 3 | ATV | AW'25 | BUY 5999/- GET 1000/- OFF | 08-Sep-25 | 31-Oct-25 | CLOSED |
| 4 | ATV | AW'25 | BUY 10999/- GET 2000/- OFF | 01-Nov-25 | 10-Dec-25 | CLOSED |
| 5 | ATV | AW'25 | BUY 5999/- GET 1000/- OFF | 01-Nov-25 | 10-Dec-25 | CLOSED |
| 6 | ATV | AW'25 | BUY 3999/- GET 500/- OFF | 01-Nov-25 | 10-Dec-25 | CLOSED |
| 7 | EOSS | AW'25 | BUY 1-20% & BUY-2-30% | 11-Dec-25 | 18-Dec-25 | CLOSED |
| 8 | EOSS | AW'25 | B1-20%, B2-30%, B2-G2 | 19-Dec-25 | 23-Dec-25 | CLOSED |
| 9 | EOSS | AW'25 | B1-20%, B1-G1 | 24-Dec-25 | 03-Jan-26 | CLOSED |
| 10 | EOSS | AW'25 | B1-30%, B2-40% | 04-Jan-26 | 08-Jan-26 | CLOSED |
| 11 | EOSS | AW'25 | B1 20, B1-G1 | 09-Jan-26 | 15-Jan-26 | CLOSED |
| 12 | EOSS | AW'25 | B1 20, B1-G1 | 16-Jan-26 | 22-Jan-26 | CLOSED |
| 13 | EOSS | AW'25 | B1-40%, B2-50% | 23-Jan-26 | 26-Jan-26 | CLOSED |
| 14 | EOSS | AW'25 | B1-30%, B2-40%, (JCK,SWS,SWE - Flat-40%) | 27-Jan-26 | 29-Jan-26 | CLOSED |
| 15 | EOSS | AW'25 | B1-40%, B2-50% | 30-Jan-26 | 06-Feb-26 | CLOSED |
| 16 | EOSS | AW'25 | B1-40%, B2-50% | 07-Feb-26 | 15-Feb-26 | CLOSED |
| 17 | FRESH | SS'26 | FRESH SALE PERIOD | 16-Feb-26 | 16-Apr-26 | NO OFFER |
| 18 | ATV | SS'26 | BUY 4999/- GET 500/- OFF & BUY 6999/- GET 1000/- OFF | 17-Apr-26 | Not Disclosed Yet. | STILL RUNNING |

- **Reading the codes.** `B1`, `B2` mean buy one, buy two; `-G1`, `-G2` mean get one or two free (as the Mufti `OFFER` sheet reads `B2-G1`); `JCK`, `SWS`, `SWE` are probably jackets, sweatshirts and sweaters (guess). The slabs `10999/2000` and `5999/1000` appear in both ATV blocks (8 Sep to 31 Oct and 1 Nov to 10 Dec 2025); `14999/3000` only in the first and `3999/500` only in the second. Statuses are coloured: `CLOSED` red, `NO OFFER` blue, `STILL RUNNING` green.
- **Links.** Line 18 is the offer behind rows 5 to 149 of `KDPS-DIRECTION.xlsx`; lines 13, 15 and 16 are the tier pattern behind rows 150 to 403.
- **Notes.** [offers-and-brand-reports.md](../../data-notes/offers-and-brand-reports.md).

### `20260601_163402.heic` (photo 1: Mufti offer dates)
- A phone photo (1 Jun 2026, 16:34) of a ruled notebook page headed `Brand Mufti` in handwriting. It was converted to JPEG to read; the original stays untouched.
- **What it says.**
  - `Start Date 1st May.`
  - Three slabs: `7999` gives `1000/-`, `12999` gives `2000/-`, `17999` gives `3000/-` (small marks under each slab are unclear).
  - A vertical arrow runs from `1st May` down to `27th May.`
  - `28th May.` `2sale` then `1sale 100%` (buy two, the third free; read as `B2-G1`).
  - A second arrow runs on to `31st May.`
- **Meaning.** The slabs match the Mufti `OFFER` sheet: `Purchase for 7999/- and get 1000/- off`, `12999 ... 2000`, `17999 ... 3000`, from 13 Mar to 27 May 2026, then `B2 - G1` from 28 May 2026 (see [data](2026-05/data/README.md)). So the page restates the Mufti offer calendar for May.
- Faint mirrored writing from the other side of the page shows through and cannot be read.

### `20260601_163404.heic` (photo 2: reports per brand)
- A phone photo (1 Jun 2026, 16:34) of another notebook page, a fingertip at its right edge. Handwritten list: `Mufti` `4 stor` `1 Report`; `BB` `3 Stores` `1 Report`; `LP` `6` `6`; `PE` `7` `7`; `AS` `10` `10`; `VH` `7` `7`; `Banjaran` `2` `2`; the last pair of numbers underlined. The table above totals them: 34 reports a month.

## Subfolders
- [2026-04](2026-04/README.md): April 2026 Louis Philippe vouchers and the AMM list. Raw POS exports: [DATA](2026-04/DATA/README.md).
- [2026-05](2026-05/README.md): the two `.skill` files. May Blackberry and Mufti workbooks: [data](2026-05/data/README.md).
- June files for the same two brands are in [brand-analysis-report](../brand-analysis-report%20/README.md).

## Open questions
Full list goes to [open-questions.md](../../data-notes/open-questions.md).
1. Who receives each monthly report, by what channel and on what date? What is the `Dis` column used for: reimbursement of a brand-funded offer, or reporting only? Owner: KDPS Owner (P-OWN) and Accounts (P-ACC). Blocks: any brand-report export design (stage 5).
2. What do the counters `LAST BILL NO`, `T.QTY`, `REPORTED QTY`, `BALANCE TO DO` and `AVERAGE DIS %` in `KDPS-DIRECTION.xlsx` track? Owner: KDPS Owner.
3. Which offer regime (50%/40% tiers or the 1,000/500 slabs) applies on which dates in the FM template, and should a slab count the exact threshold ("buy 4999") or only values above it? Owner: KDPS Owner and Brand manager (P-BRM).
4. Where are `FM APPAREL A4.xlsx` and `1. ARVIND ALL BRAND AW'25 EOSS OFFER.xlsx`? What does `NOD` mean? Owner: KDPS Owner.
5. Is "Banjaran" a brand or a Store, and what are the report formats for PE, AS and VH? Owner: KDPS Owner.
6. Should the SOH date in a report be the first of the reporting month or the first of the next month? (Files differ: see [2026-04](2026-04/README.md).) Owner: Accounts and the brand.
