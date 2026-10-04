# jsl

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [store-analysis](../README.md)

## What this folder is

- The "JSL" sales and stock exports from the earlier POS, taken on 30 Jun 2026 (one sales file from 11 May 2026), a dashboard config, and three reports made from them: a dashboard, a business analysis and a winter purchase plan, each with a PDF.
- **JSL is Jainsons Lifestyle, KDPS's Hazaribagh Store. It is the same Store as the `hazaribagh/` folder ("HZB").** The bill-series prefix `JSL`, the Store list, the overlap of the two sales files and the shared stock barcodes show this; the evidence is laid out in [../hazaribagh/README.md](../hazaribagh/README.md). It is an inference from the files, not a statement by KDPS. The JSL files are the same Store at an earlier cut-off (30 Jun 2026 against 24 Jul 2026).
- The exports come from KDPS. The config and reports were made afterwards by the ERP team or an analyst (the files do not say who). The dashboard and the business analysis are labelled "AI-Assisted" and "Prepared for KDPS Lifestyle Pvt. Ltd."
- Every threshold, benchmark, ceiling, running cost and budget in the reports is an analyst assumption, not a KDPS decision (see "Parameters the analysts used" and [../README.md](../README.md)).
- Data notes: [pos-exports.md](../../../data-notes/pos-exports.md), [stores-and-codes.md](../../../data-notes/stores-and-codes.md), [analyses-and-metrics.md](../../../data-notes/analyses-and-metrics.md).

## Files

### The three sales files

All three have the same layout as the HZB sales file except for an empty first column: 26 columns `A:Z`, column A empty on every row, then `Bill Date`, `Bill No`, `Customer`, `Phone`, `Item`, `Brand`, `Color`, `Size`, `Design No`, `Barcode`, `SalesMan`, `Sub Category`, `Gender`, `Fit`, `season`, `Qty`, `Rate`, `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount`, `Bill Amount`, `Cash`, `Card`, `Credit`.

- **Row structure** (all three): one row is one bill line. `Bill Date`, `Bill No`, `Customer`, `Phone`, `Sub Category`, `Bill Amount`, `Cash`, `Card` and `Credit` are filled only on the first line of each bill (the HZB file repeats date and bill number on every line). `Rate` is the MRP at sale; `Gross Amt` = `Qty` × `Rate`; `Net Amount` = `Gross Amt` + `Disc Amt` (negative for a discount). Return lines have a negative `Qty` inside normal bills. `Color` is mostly `PREMIUM`, `ECONOMY` or `MEDIUM`, not a colour. Staff tag goods with no clear colour or classification this way, mostly non-brand goods (product owner, 4 Oct 2026). How the product handles these tags is OPEN for the product owner.
- **End of each file:** after the last line there is a total row (holding only `Qty`, `Gross Amt`, `Disc Amt`, `Net Amount`, `Bill Amount`, `Cash` and `Card`), a row with the words `SALES RETURN` in the `Customer` column, a blank row, and the total row repeated. The total rows equal the sums of the line rows exactly.

| | `fy 25-26 sales.xlsx` | `fy 26-27 sales.xlsx` | `june sales report.xlsx` |
| --- | --- | --- | --- |
| Size / author field | 2.5 MB / `DELL` | 0.8 MB / `DELL` | 0.3 MB / `DELL` |
| Created / last saved (UTC) | 11 May 2026 09:41 / 8 Jun 2026 13:12 | 30 Jun 2026 14:03 / 14:05 | 30 Jun 2026 06:18 / 06:18 |
| Sheets | 4: `Sheet2`, `Sheet4`, `Sheet3`, `Sheet1` (in that order) | 1: `Sheet1` | 1: `Sheet1` |
| Sales sheet range | `Sheet1` `A1:Z17044` | `A1:Z7402` | `A1:Z2256` |
| Line rows | 17,039 (rows 2 to 17,040) | 7,397 (rows 2 to 7,398) | 2,251 (rows 2 to 2,252) |
| Total / `SALES RETURN` / blank / total again | rows 17,041 / 17,042 / 17,043 / 17,044 | rows 7,399 / 7,400 / 7,401 / 7,402 | rows 2,253 / 2,254 / 2,255 / 2,256 |
| Bills | 4,611: `25-26/JSL/1` to `/4611`, no gap | 2,029: `26-27/JSL/1` to `/2029`, no gap | 595: `26-27/JSL/1418` to `/2012`, no gap |
| Period | 4 Sep 2025 to 31 Mar 2026 (202 days) | 1 Apr to 30 Jun 2026 (91 days) | 1 to 29 Jun 2026 (29 days) |
| `Qty` | 16,846 | 7,617 | 2,294 |
| `Gross Amt` | ₹2,53,33,569 | ₹1,06,00,462 | ₹31,36,647 |
| `Disc Amt` | −₹50,32,233.13 | −₹10,61,299.88 | −₹5,63,779 |
| `Net Amount` | ₹2,03,01,335.87 | ₹95,39,162.12 | ₹25,72,868 |
| `Bill Amount` | ₹2,01,48,269.14 | ₹95,32,619 | ₹25,72,868 |
| `Cash` / `Card` / `Credit` | ₹73,82,784.70 / ₹1,27,65,484.44 / 0 | ₹33,05,348 / ₹62,27,271 / 0 | ₹9,10,904 / ₹16,61,964 / 0 |
| Distinct non-blank values | 291 brands, 94 items, 97 sizes, 7,796 barcodes, 55 season strings, 13 salesperson names | 269 brands, 83 items, 80 sizes, 3,949 barcodes, 49 season strings, 14 salesperson names | 191 brands, 71 items, 61 sizes, 1,408 barcodes, 41 season strings, 14 salesperson names |
| Return lines (negative `Qty`); bills mixing sale and return lines | 655 lines (660 pcs, net −₹13,00,768); 498 bills | 227 lines (228 pcs, net −₹4,46,112); 178 bills | 73 lines (73 pcs, net −₹1,30,421); 53 bills |
| `Disc%` 100 lines | 4,125 | 1,950 | 620 |
| `CARRY BAG` lines | 4,093 (4,508 bags, net ₹1,729) | 1,914 (2,058 bags, net ₹159) | 579 (619 bags, net ₹91) |
| `Disc%` 0 with a rupee discount | 894 lines | 383 lines | 104 lines |
| `Customer` is `CASH` | 880 bills | 504 bills | 171 bills |
| `Phone` 10 digits / blank / `0` | 3,842 / 640 / 129 | 1,613 / 365 / 51 | 459 / 123 / 13 |
| Lines with no `SalesMan` | 5,543 | 2,026 | 582 |
| Tenders (bills): cash only / card only / split / none | 1,659 / 2,539 / 293 / 116 | 682 / 1,188 / 123 / 35 | 220 / 327 / 41 / 6 |
| `season` as Excel dates / blank | 668 / 43 | 168 / 7 | 46 / 3 |
| `Design No` as Excel dates | 55 | 17 | 5 |

- **Relationship between the three:** `june sales report.xlsx` holds bills 1418 to 2012 of `fy 26-27 sales.xlsx`, identical line for line (595 of 595 bills match on lines, quantity and net). The 17 bills of 30 Jun (2013 to 2029) are not in it, because it was exported at 06:18 UTC on 30 Jun, before the day closed. The two other files do not overlap (the series restarts at 1 on 1 Apr 2026).
- **Bills by month:** Sep 2025 543, Oct 576, Nov 708, Dec 536, Jan 898, Feb 614, Mar 736; Apr 2026 908, May 509, Jun 612.
- **Common to all three:**
  - `Phone` is blank or `0` on a fifth of the bills; `CASH` is the walk-in `Customer`.
  - `SalesMan` is blank mostly on carry-bag lines, which are added without a salesperson (the Vaishnavi files put `Admin` there).
  - Carry bags are sold as item `CARRY BAG` under brand `JAINSONS` (and one line under `VIMAL`) at `Disc%` 100.
  - `Design No` and `season` hold Excel dates where text was read as a date. The date in `Design No` is in the year 2513 and the day and month are swapped between this export and the HZB export of the same line (`2513-05-01` here against `2513-01-05` there).
  - There is no GST or tax column, no time of day, no cost, and no link from a return to its bill.
- **The extra sheets of `fy 25-26 sales.xlsx`:**

| Sheet | Range | Content |
| --- | --- | --- |
| `Sheet2` | `A1:E10` | A small pivot of one kids brand (`KIDCITY`) by `Gender` and `Item` with `Sum of Qty` (total 335) and `Sum of Net Amount` (total ₹1,15,518.25) |
| `Sheet4` | `A1:L115` | A pivot with no headings whose row labels are customer phone numbers, with number columns beside them; contains phone numbers |
| `Sheet3` | `A1:C113` | A list with the columns `Brand`, `Customer`, `Phone`: 111 rows, all brand `KILLER`, and a `Grand Total` row; a buyer contact list for one brand; contains customer names and phone numbers |
| `Sheet1` | `A1:Z17044` | The sales |

  None of these three sheets is used in the reports (guess). They look like work done by hand on the file after export (it was saved on 8 Jun 2026, four weeks after it was created).
- Sensitive content (all three): customer names and phone numbers; salesperson names and per-person sales. Not copied here.

### `soh30626.xlsx`

- **What:** a stock movement statement, not a plain stock list. 2.1 MB; created 30 Jun 2026 06:02 UTC, saved 06:04 (author field `DELL`). The file name reads as 30-06-26. The period is not written in the file; the opening quantities and sales quantities fit 1 Apr to 30 Jun 2026 (inferred, see below).
- **Sheet:** one, `Sheet1`, `A1:W29370`: header, 29,368 barcode rows (rows 2 to 29,369) and a total row (row 29,370, no barcode). No trailing blank row.
- **Columns (22, column A empty):** `Item Name`, `Brand`, `Size`, `Supplier`, `Barcode`, `Design No`, `Category`, `Gender`, `Fit`, `Season`, then the movement columns `Op Qty`, `Purchase`, `Sale`, `Adjustment`, `Sl Ret`, `St Trf`, `Stf Reciept`, `Pur Ret`, then `Tqty`, `Mrp`, `Rate`, `Amount`.
  - Reading of the movement columns from their names: opening quantity, purchase, sale, adjustment, sales return, transfer out, transfer received (spelled `Stf Reciept` in the file), purchase return.
  - `Tqty` = `Op Qty` + `Purchase` + `Sale` + `Adjustment` + `Sl Ret` + `St Trf` + `Stf Reciept` + `Pur Ret`, exactly, on every row. `Amount` = `Tqty` × `Rate`.
  - One row is one barcode. `Rate` is the unit cost.
- **Movement totals (the total row equals the sums of the rows):**

| Column | Total | Rows with a value |
| --- | --- | --- |
| `Op Qty` | 58,613 | 24,040 (15,899 above zero) |
| `Purchase` | 0 | none |
| `Sale` | −7,548 | 3,916 |
| `Adjustment` | 0 | none |
| `Sl Ret` | 0 | none |
| `St Trf` | −2,477 | 1,733 |
| `Stf Reciept` | +10,139 | 5,557 |
| `Pur Ret` | 0 | none |
| `Tqty` | 58,727 | 29,368 |
| `Amount` | ₹4,03,52,910.10 | |

- **What the movements say:**
  - Nothing was bought directly (`Purchase` is empty on every row): every piece arrived by transfer from other KDPS places. The supplier `KDPS LIFESTYLE PVT LTD (DEOGHAR)` is on 1,850 rows (₹17.7 L of cost), so Deoghar is one source (the winter plan calls the source the head-office godown).
  - `Sl Ret` is empty on every row although the sales files hold return lines, so returns appear to be netted inside `Sale` (inferred).
  - `Sale` equals the net quantity of `fy 26-27 sales.xlsx` for 29,319 of 29,368 barcodes (total −7,548 against 7,617 in the sales file, 69 pieces apart). That is why the period is read as 1 Apr to 30 Jun 2026.
  - Every one of the 10,891 barcodes sold in the JSL sales files is in this file (100%), and 11,682 of the 11,701 barcodes in the HZB sales file.
- **Stock figures:**

| Measure | Value |
| --- | --- |
| Rows | 29,368 (11,725 with `Tqty` 0; 17,643 above 0; none negative) |
| Pieces including 5 carry-bag rows | 58,727, of which 31,032 are carry bags (3 rows `JAINSONS`, 2 rows `ABHIVADAN`) |
| Merchandise only | 27,695 pieces; MRP value ₹6,27,73,470; cost ₹3,98,62,679 |
| Cost as a share of MRP (rows with stock, no bags) | 63.5% (break-even discount 36.5%) |
| Distinct non-blank values | 380 brands, 68 category codes, 115 item names, 239 suppliers, 79 season strings |
| Blank cells | `Brand` 10, `Size` 14, `Supplier` 32, `Category` 5, `Gender` 4, `Fit` 4, `Season` 97 |
| Top suppliers by merchandise stock cost | Aditya Birla Lifestyle Brands ₹94.5 L, Vishal Marketing ₹65.8 L, KDPS Lifestyle Pvt Ltd (Deoghar) ₹17.7 L, Saraogi Super Sales ₹16.2 L |
| Rows with `Rate` above `Mrp` (in stock) | 8 |

- **Why this layout is better for analysis than the HZB stock file:** it keeps zero-balance rows (stock-outs can be found), it has `Season` (for ageing), it shows movements (opening, sales, transfers) and it matches 100% of sold barcodes.
- **Quirks:**
  - `Season` is a mix of formats: `SPRING SUMMER(Mon-yy)` or `AUTUMN WINTER(Mon-yy)` on 27,555 rows; Excel date values on 878 (dates from 1 Jan 2023 to 9 Jul 2025, 443 on the 1st of a month, so most are probably `Mon-yy` text read as a date); `SS-yy` or `AW-yy` on 346; text without a hyphen (`SS25` 206, `AW24` 43, `AW23` 36, `SS24` 25) and `N/A` (134) on most of the rest; blank on 97. Stock with a missing or date-corrupted season holds ₹0.30 Cr of cost.
  - `Gender` has 13 spellings plus blank (`MALE` 16,798 rows, `FEMALE` 7,231, `KIDS MALE` 3,306, `KIDS FEMALE` 1,859, `UNISEX` 68, `KIDSM` 57, `KIDS` 18, `KIDSF` 8, `SMAG HALF ZIPPER` 7, `FEAMAL` 6, `ACCE` 4, blank 4).
  - `Barcode` is a number on 27,244 rows and text on 2,124.
  - Fit values carry non-breaking spaces and the category list mixes words and codes, as in the HZB stock file.
- Sensitive content: cost per barcode (so margin) and supplier names. Not copied here.

### `dashboard-config.json`

- 246 bytes, one JSON object. Keys: `store_name` (`JSL Store`), `store_code` (`JSL`), `region` (`Bihar / Jharkhand`), `costs` with `variable_pct_of_sales` (7), `rent` (220000), `electricity` (100000) and `misc` (40000), `discount_ceiling_pct` (`null`) and `soh_as_on` (`2026-06-30`).
- It is identical to [the HZB config](../hazaribagh/README.md) except for `store_name`, `store_code`, `region` and `soh_as_on`. The same notes apply: units are not stated (the reports read the costs as ₹ a month); the figures are analyst inputs, not KDPS-approved; and `discount_ceiling_pct` being `null` did not stop the reports applying a 36% ceiling worked out from the cost ratio. It is read by a "store-dashboard skill" that is not in these folders.

### `JSL-Dashboard.html` and `.pdf`

- **What:** "JSL Store — Business Dashboard", "Monthly Store Dashboard · 16 Measures · AI-Assisted", region Bihar / Jharkhand. HTML (36 KB) and an 8-page A4 PDF (headless Chrome, 27 Jul 2026 08:28 UTC), same numbers. Tags: sales Sep 25 to Jun 26 (10 months), stock file `soh30626.xlsx`, 6,640 bills, 17,896 pieces, ₹2.98 Cr, 16 staff, 2,561 known customers. Built by the "store-dashboard skill" from `fy 25-26 sales.xlsx`, `fy 26-27 sales.xlsx`, `june sales report.xlsx` and `soh30626.xlsx`; the generator is not in the folder. Footer "Prepared for KDPS Lifestyle Pvt. Ltd. · JSL Store · Generated generated from data files."
- **Same template as the HZB dashboard** ([hazaribagh/README.md](../hazaribagh/README.md)), with these headline figures: net sales ₹2.98 Cr (+28% "vs last month", which is June against May); net profit ₹13.4 L (about 4%); average margin 24% (about 36% at full price); average bill ₹4,494 (2.7 pieces per bill); stock against sales speed 0.7× (about 17 months); repeat customers 37% (63% of tracked sales).
- **Sections and figures:**

| Section | What it says |
| --- | --- |
| 1 · Sales through the period | ₹20.6 L to ₹48.3 L a month. Profit or loss (₹ L): Sep +1.8, Oct +2.1, Nov +4.5, Dec −0.5, Jan −9.0, Feb −0.6, Mar +4.3, Apr +9.0, May +1.5, Jun +0.2. Net sales (₹ L): 23.7, 22.1, 32.6, 20.7, 40.0, 29.5, 34.4, 48.3, 20.6, 26.5 |
| 2 · The money | Goods cost "about 64% of the tag", so "past 36% off the store sells at a loss"; "keep 36% as the hard ceiling". P&L table: 10 months, sales ₹298 L, discount 17%, cost of goods ₹228 L, gross profit ₹70 L, running cost ₹57 L, profit ₹13 L. "₹60.1 L given away in discount against ₹70.3 L gross profit"; a 5-point cut in discount "about ₹17.9 L a year" |
| 3 · Brands | Top 20 by sales with discount, margin, stock and verdict (Allen Solly, Van Heusen, Louis Philippe "Big, thin profit"; Killer, Levis, Mufti "Selling at a loss"; Fw, Jay Ambey, Plazer, Yes Mam, Citrus, Ashmita Bq, Hyphen, Khushaal, Gajendra "Star, grow it"; U.S. Polo and Jockey "Healthy"; Arrow, Peter England, Blackberry "Thin profit") |
| 4 · What sells | Sales by section: Men 47%, Women 44%, Kids Male 5%, Kids Female 4%. Top items (Saree ₹46.5 L at 5% discount, Shirt ₹36.1 L at 25%, Jeans ₹33.0 L at 28%, Kurti Set ₹30.5 L at 6%, and eight more). Fastest sizes. Accessories ₹8.9 L on ₹6.7 L of stock |
| 5 · Stock health | ₹3.99 Cr at cost (₹6.28 Cr at MRP), about 17 months of sales; only 19% of stock value in styles that have sold; stock turn 0.7× a year; ageing 6+ months ₹1.44 Cr; "out of stock on fast items" 1,184; stock by age (₹ Cr): under 3 months 1.04, 3 to 6 months 1.21, 6 to 12 months 1.34, over a year 0.10, no season tag 0.30; slow money by item (Shirt ₹60.3 L, Jeans ₹50.9 L, T-Shirt ₹34.6 L, Trouser ₹28.3 L, Suit ₹23.9 L, Saree ₹20.8 L) |
| 6 · Customers and staff | Average bill ₹4,494; repeat 37%; "bills with a phone 67%"; 2,561 known customers; top 5% bring 26% of sales; staff table with "price held" 96% down to 55% across 16 staff |
| 7 · What we could not measure | No conversion rate (no footfall); profit is an estimate; only 10 months of sales; no colour analysis |
| 8 · What to do | Six moves: cap the discount at 36%; fix the brand mix; clear the ₹1.44 Cr of aged stock; reorder the 1,184 fast items now at zero; capture a phone on every bill (now 67%); manage by the dashboard monthly |

- Staff names appear in the report's table; not copied here.

### `JSL-Business-Analysis-2026.html` and `.pdf`

- **What:** "JSL Store — Full Business Analysis (Sep 2025 – Jun 2026)", "Business Health Check", labelled "Full Business Analysis · 16 Measures · AI-Assisted", dated 1 July 2026. HTML (38 KB) and an 8-page A4 PDF (headless Chrome, 30 Jun 2026 18:51 UTC). It is the long, written version of the dashboard, built from three files: the FY 2025-26 sale report, the FY 2026-27 sale report and the stock as on 30 Jun 2026. Tags: 6,640 bills, 24,462 pieces, ₹2.98 Cr, 16 staff, 2,561 known customers.
- **Headline:** "A busy store that sells a lot but keeps almost no profit": ₹2.98 Cr in 10 months (about ₹3.6 Cr a year), profit about ₹13 L (4%), average margin 23% (about 36% without discounts), average bill ₹4,494 at 3.7 pieces (carry bags counted), stock turn 0.7×, repeat customers 37%. "January lost ₹9 lakh by selling below cost in a deep clearance."
- **Sections (same eight as the dashboard, with prose):**
  - 1 Sales through the year: "strong festive and wedding months, but January is a profit trap".
  - 2 The money: discount is eating profit; "set 36% as a hard ceiling for normal selling"; ₹61 L of discount against ₹70 L gross profit; a 5-point cut "worth roughly ₹15 lakh a year".
  - 3 Brands: "the biggest-selling brands are the worst earners": big western brands (Allen Solly, Van Heusen, Louis Philippe, Arrow, Killer, Levis, Mufti) make near zero or lose, while FW, Jay Ambey, Plazer, Yes Mam, Citrus and Jockey earn 23 to 41%.
  - 4 What sells: "Indian wear is the profit engine; men's western is the volume engine"; sections Men 47%, Women 44%, Kids 9%; sizes (men M, L, XL and waist 32 to 34; women free size and L; kids boys 8 to 14); accessories ₹8.9 L on ₹6.7 L of stock (best movers named: stoles, dupattas, belts, shawls, ladies purses, safa; backpacks overstocked).
  - 5 Stock health: ₹4.0 Cr at cost (₹6.3 Cr at MRP), about 17 months; only 19% of stock value in styles that sold; ageing 6+ months **₹1.28 Cr** (the dashboard says ₹1.44 Cr); 1,184 fast items out of stock (mostly t-shirts, shirts, jeans, kurti sets, tops); "stock by age" the same as the dashboard.
  - 6 Customers and staff: 67% of bills with a phone; 2,561 known customers; top 5% bring 26% of sales; seven staff shown with "price held" 75% to 94%.
  - 7 What we could not measure: no conversion rate; profit estimates; "stock comes by transfer from head office (the store made no direct purchases), so buying decisions are partly head-office's".
  - 8 What to do: six moves, as in the dashboard but with ₹1.28 Cr and "₹15 lakh a year".
- **Differences from the dashboard:** aged stock ₹1.28 Cr against ₹1.44 Cr; a 5-point discount cut ₹15 L against ₹17.9 L a year; pieces per bill 3.7 against 2.7; average margin 23% against 24%. Different definitions are not explained.

### `JSL-Winter-Purchase-Plan-2026.html` and `.pdf`

- **What:** "JSL Store — What to Buy for Winter 2026", "Winter Buying Plan · Store Deep-Dive", dated 30 June 2026. HTML (25 KB) and a 6-page A4 PDF (headless Chrome, 30 Jun 2026 12:20 UTC). It answers: what to buy for October 2026 to February 2027, how much, and how to pay for it. It is written in plain, short words for the Store owner. Basis: June 2026 sales (595 bills, ₹25.7 L) and the stock as on 30 Jun 2026 (27,695 items, ₹4.0 Cr at cost, ₹6.3 Cr at MRP).
- **Recommendation in one line:** the Store already holds more than a year of stock; clear ₹1.44 Cr of old stock first, then buy about ₹78 L (at cost, about ₹1.2 Cr at MRP) of fresh festival and winter stock, with all buying finished by October.
- **Headline tiles:** stock ₹4.0 Cr; June sales ₹25.7 L (595 bills, average bill ₹4,320); "how long the stock will last about 15 months" (a good shop "3 to 4 months"); stock 6 months old or more ₹1.44 Cr; "last winter, still unsold ₹1.26 Cr"; suggested winter buy "₹60 to 98 L, ₹78 L is the middle plan".
- **Sections:**

| Section | What it says and how it gets there |
| --- | --- |
| 1 · What sells well here | June sales by section: Women 46%, Men 45%, Kids 8%; costly (branded) goods bring "about 8 of every 10 rupees". Table of June item sales: Sarees 242 pcs, ₹4.2 L, 4% discount ("buy more"); Shirts (men) 231, ₹3.7 L, 29% ("buy little"); Jeans (men) 141, ₹3.0 L, 31%; Kurti sets 122, ₹2.6 L, 3% ("buy more"); T-shirts 176, ₹1.8 L, 30%; Trousers 95, ₹1.7 L, 28%; Salwar suits 43, ₹1.0 L, 3%; Lehengas 10, ₹0.85 L, 4%. Advice: buy common sizes only (waist 30 to 34; M, L, XL) |
| 2 · The problem: too much old stock | About 15 months of stock; ₹1.44 Cr is 6 months old or more, of which ₹1.26 Cr is "last winter's clothes". Stock by age (₹ Cr): under 3 months 1.04, 3 to 6 months 1.21, 6 to 12 months 1.34, over a year 0.10 (₹0.30 Cr has no season label); ₹2.25 Cr is under 6 months |
| 3 · The winter buy | ₹78 L in the middle plan (range ₹60 to 98 L), split below. "About 1,650 winter pieces from last year" are unsold, so "this is not a heavy-winter town". Buying calendar: July place orders and start clearing; August first new stock; September full festival stock, re-order sarees and kurti sets; October winter clothing on the floor and all buying finished. Dates named: Dussehra 20 Oct, Diwali 8 Nov, Chhath 15 Nov, then the wedding season and Dec to Jan |
| 4 · How to pay for it | Clear the ₹1.44 Cr old stock (₹2.30 Cr at MRP) to free "₹1.1 to 1.3 Cr" cash after clearance discounts; total stock goes from ₹4.0 Cr "towards ₹3.2 Cr". Biggest old blocks: men's shirts about ₹27 L, sarees ₹18 L, trousers ₹16 L, jeans ₹15 L, formal suits ₹10 L, kurti sets ₹9 L |
| 5 · What to do now | Five steps: clear old stock first; put more than half the budget into festival and Indian wear; buy little men's western; keep winter clothing small; do not let total stock grow ("one old piece out for each new piece in"; aim for about 11 months of stock, not 15) |
| How this was prepared; Honest note | Built from the June 2026 sale report and the 30 Jun stock list; about 31,000 carry-bag pieces and a stray total row left out; "one month of sales (June, a slow summer month)"; the budget size "needs a check against last year's October to February sales"; the shop's stock comes by transfer from the head-office godown, so treat the plan as the shop's winter order to head office |

- **The budget (the plan's table, at cost):**

| Block | Amount | Share | What is bought |
| --- | --- | --- | --- |
| Festival and Indian wear | ₹42 L | 54% | Fresh sarees, kurti sets, salwar suits, lehengas, gowns, wedding wear (suits, sherwani, Nehru jackets) |
| Men's western, winter styles only | ₹14 L | 18% | Full-sleeve shirts, dark or thick jeans, light jackets, in common sizes |
| Winter clothing, small | ₹12 L | 15% | Sweaters, sweatshirts, jackets, cardigans, thermals, mufflers, shawls, caps, women's and kids' winter sets |
| Kids | ₹6 L | 8% | Festival Indian wear and winter sets |
| Accessories and innerwear | ₹4 L | 5% | Stoles, caps, belts, purses, innerwear |
| Total | ₹78 L | 100% | About ₹1.2 Cr at MRP |

- **The method behind the ₹78 L is not stated.** The ₹78 L, the range of ₹60 to 98 L and the five-way split cannot be derived from the two files; they look like judgement (guess). They are analyst numbers, not a KDPS open-to-buy (the PRD's open-to-buy is a budget by brand and season; see the PRD "Words used").

## Parameters the analysts used (all analyst assumptions, none a KDPS decision)

| Parameter | Value | Where |
| --- | --- | --- |
| Discount ceiling | 36% (about 100% minus the 64% cost ratio); `discount_ceiling_pct` is `null` | Dashboard, business analysis |
| Running costs | 7% of sales plus ₹3.6 L a month fixed (rent ₹2.2 L, electricity ₹1.0 L, misc ₹0.4 L) | `dashboard-config.json`, P&L tables |
| Healthy stock turn | 3 to 4 times a year, "3 to 4 months" of stock | All three reports |
| Ageing bands | Under 3, 3 to 6, 6 to 12, over 12 months, counted from the month in the `Season` label to June 2026 (my check reproduces the report's bands to ₹0.01 Cr with this rule) | Dashboard, analysis, plan |
| "Aged stock" | 6 months or more: ₹1.44 Cr (dashboard, plan) or ₹1.28 Cr (analysis) | Different definitions |
| "Fast item out of stock" | 1,184 items; the rule is not stated | Dashboard, analysis |
| Verdict labels | Star, Healthy, Big thin profit, Thin profit, Selling at a loss; rules not stated | Dashboard, analysis |
| Winter budget | ₹78 L (₹60 to 98 L), five-way split, buying finished by October | Winter plan |
| Festival dates | Dussehra 20 Oct, Diwali 8 Nov, Chhath 15 Nov | Winter plan |
| "5-point discount cut" value | ₹17.9 L (dashboard) or ₹15 L (analysis) a year | Different estimates |

PRD meanings differ from the analysts' uses: sell-through in the PRD is "the share of received pieces sold in a period", and weeks of cover is in weeks (`docs/prd.md`, "Words used"); the reports use months of cover.

## Which figures reproduce (JSL)

My recount from the raw files.

| Figure | Report says | Recount | Result |
| --- | --- | --- | --- |
| Bills and net sales, Sep to Jun | 6,640; ₹2.98 Cr | 6,640; ₹2,98,40,498 | Reproduces |
| Pieces | 17,896 (dashboard), 24,462 (analysis) | 24,463 on all lines; 6,566 carry-bag pieces, so 17,897 without them | Reproduces within 1 |
| June | 595 bills, ₹25.7 L, average bill ₹4,320 | 595; ₹25,72,868; ₹4,324 | Reproduces |
| Stock | 27,695 pcs, ₹4.0 Cr cost, ₹6.3 Cr MRP | 27,695; ₹3,98,62,679; ₹6,27,73,470 | Reproduces |
| Ageing bands | 1.04, 1.21, 1.34, 0.10 Cr; 0.30 Cr without a tag | Same, to ₹0.01 Cr | Reproduces |
| Aged 6+ months | ₹1.44 Cr (dashboard, plan) and ₹1.28 Cr (analysis) | ₹1.34 Cr + ₹0.10 Cr = ₹1.44 Cr | ₹1.44 Cr reproduces; ₹1.28 Cr does not |
| June item table in the winter plan | as above | Same pieces, rupees and discounts; section split 46 / 45 / 8 | Reproduces |
| Share of June sales on `PREMIUM` lines | "about 8 of every 10 rupees" | 78.8% of June net is on lines with `Color` `PREMIUM`. The analysis read these tags as a price band (analyst assumption) | Reproduces |
| Months of cover | about 15 (plan), about 17 (dashboards) | 16.5 by quantity and 20.1 by MRP from June alone | Does not reproduce; basis not stated |
| Bills with a phone | 67% | 5,455 of 6,640 bills (82.2%) have a 10-digit phone | Does not reproduce |
| Known customers | 2,561 | 3,461 distinct 10-digit phones | Does not reproduce (probably understated) |
| Repeat customers | 37% | 29.8% of phones with 2 or more bills; 40.9% if the phone is filled down across bills | Does not reproduce; the fill-down probably explains it (guess) |
| Fast items now out of stock | 1,184 | 721 barcodes sold in June now at zero; 1,263 sold in May or June; 2,224 sold since 1 Apr | Does not reproduce; rule not stated |
| Cost ratio | 64% | 63.5% | Reproduces |
| Margin, profit, cost of goods | ₹13.4 L, 24% | Estimates by design (cost of goods is MRP value times a stock cost ratio) | Cannot be checked |
| "Last winter still unsold ₹1.26 Cr", "1,650 winter pieces", "₹1.1 to 1.3 Cr freed", "₹4.0 Cr towards ₹3.2 Cr" | as quoted | Not checked | Unverified |
| ₹78 L budget, ₹60 to 98 L range, five-way split | as quoted | No method in the report or the files | Not reproducible |

## Data quality summary

- The movement statement and the sales files agree closely (29,319 of 29,368 barcodes match on sales quantity), so this stock file is the best of the three layouts for analysis.
- Brand names differ between sales and stock (for example `FW` and `Fashion World`), and brand codes are not merged in the raw files.
- The reports compare tax-inclusive sales with the stock `Rate`; whether `Rate` includes GST is not known.
- Season tags are partly corrupted into dates, which weakens ageing for ₹0.30 Cr of stock.
- The sales files have no cost, no GST split, no time of day and no return-to-bill link.
- The two reports disagree on aged stock (₹1.44 Cr against ₹1.28 Cr), on pieces per bill (2.7 against 3.7) and on the value of a 5-point discount cut.

## Open questions

Full list: [open-questions.md](../../../data-notes/open-questions.md).

1. Confirm that JSL is Jainsons Lifestyle, Hazaribagh, and that HZB is the same Store; which code does the ERP use? Owner: KDPS Owner. Blocks stage 1 store set-up.
2. Which meaning of "aged stock", "dead stock" and "months of cover" does KDPS want, given the PRD terms? Owner: KDPS Owner and product owner. Blocks the dead-stock report (stage 3) and planning suggestions (stage 6, `POL-15.01`).
3. What basis should a winter or seasonal buying budget have, and is there an October to February actual from earlier years? Owner: KDPS Owner. Blocks stage 6 planning.
4. Who supplied the running costs (7%, rent ₹2.2 L, electricity ₹1.0 L, misc ₹0.4 L), and do they include staff salary? Owner: KDPS Owner and Accounts.
5. Does the movement statement's `Season` mean the purchase lot month or the real season? Is there a receipt date per piece? Owner: KDPS Owner.
6. Can every store's export follow this movement-statement layout (zero rows kept, `Season`, `Op Qty`)? Owner: KDPS Owner.
7. How is a "fast item out of stock" defined? Owner: KDPS Owner (it needs a selling-speed rule).
