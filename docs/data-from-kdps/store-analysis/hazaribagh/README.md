# hazaribagh

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [store-analysis](../README.md)

## What this folder is

- The Hazaribagh ("HZB") sales and stock exports from the earlier POS, taken on 24 Jul 2026, the script `build-report.py`, a dashboard config, and two reports made from them (a dashboard and a stock-sales-margin report) with their PDFs.
- The exports come from KDPS. The script, config and reports were made afterwards by the ERP team or an analyst (the files do not say who). The dashboard is labelled "AI-Assisted" and "Prepared for KDPS Lifestyle Pvt. Ltd."
- Everything numeric that looks like a rule in the reports (ceilings, colour cut-offs, verdict labels, running costs) is an analyst assumption, not a KDPS decision. See "Parameters the analysts used" below and the warning in [../README.md](../README.md).
- Data notes: [pos-exports.md](../../../data-notes/pos-exports.md), [stores-and-codes.md](../../../data-notes/stores-and-codes.md), [analyses-and-metrics.md](../../../data-notes/analyses-and-metrics.md).

## HZB and JSL are the same Store

The `jsl/` folder ([jsl/README.md](../jsl/README.md)) is the same Store as this one: Jainsons Lifestyle, Hazaribagh. The evidence is strong, but it is an inference from the files, not a statement by KDPS.

- `Q&A-req-recieved/LIST OF ALL STORES.xlsx` lists one Hazaribagh store, `JAINSONS-LIFESTYLE | HAZARIBAGH`. No Store called HZB or JSL is listed.
- Bill numbers in this folder's sales file are `25-26/JSL/…` and `26-27/JSL/…`. `JSL` is the bill-series prefix of Jainsons Lifestyle; the HZB file has no other prefix. The carry-bag brand is `JAINSONS` in both folders.
- The sales files overlap line for line. Of the 6,640 bills in the JSL files, 6,639 are in the HZB file, and 6,637 of those 6,639 have the same number of lines, the same quantity and the same net amount. Two differ: `26-27/JSL/2013` (2 lines in the JSL export against 6 in the HZB export; guess: the bill was still open when the JSL file was exported on 30 Jun) and `25-26/JSL/1246` (6 lines in the JSL export against 5 in the HZB export). The one JSL bill missing from the HZB file is `26-27/JSL/2014`. The HZB file also holds 455 later bills (`26-27/JSL/2030` to `/2484`, 30 Jun to 24 Jul 2026).
- 16,531 of the 17,051 HZB stock barcodes are in the JSL stock file, and 11,682 of the 11,701 barcodes sold in the HZB file are in the JSL stock file.
- The two configs differ only in `store_name`, `store_code`, `region` and `soh_as_on`.
- Result: the HZB and JSL analyses describe one Store at two cut-off dates, 24 Jul 2026 (HZB) and 30 Jun 2026 (JSL). The analyst treated them as two stores.

## Files

### `SOH_Hazaribagh.xlsx`

- **What:** a stock-on-hand snapshot as on 24 Jul 2026, positive-stock rows only. 1.6 MB. Created 24 Jul 2026 18:15 UTC, last saved 19:43 UTC (author field `user`).
- **Sheets (2):**

| Sheet | Rows used | Content |
| --- | --- | --- |
| `Sheet1` | `A1:N17053` (header + 17,051 barcode rows + 1 total row at row 17,053) | The stock rows. Filter on `A1:N17053`. |
| `Sheet2` | `A1:D204` | A leftover pivot table, not used by the script: filter `Gender` = `FEMALE`, rows are about 200 brands, values `Sum of Tqty` (total 9,151), `Sum of Rate` (₹76,07,730.59) and `Sum of Mrp` (₹1,23,60,849). `Sum of Rate` adds unit costs, which means nothing. |

- **Columns of `Sheet1` (14):** `Item Name`, `Brand`, `Category`, `Gender`, `Fit`, `Design`, `Size`, `Barcode`, `Supplier`, `Tqty`, `Mrp`, `Rate`, `Amount`, `OFFER`.
  - One row is one barcode (style, colour and size). `Rate` is the unit cost; `Amount` = `Tqty` × `Rate`.
  - `OFFER` is `IN OFFER` on 732 rows (1,525 pieces) and `NOT IN OFFER` on 16,319 rows. What puts a row in an offer, and who sets it, is not stated.
  - The column names differ from the Vaishnavi stock file: `Design` (not `Design No`), `Category` comes before `Gender`, there is no `Season` and no movement columns, and `OFFER` is new.
- **Totals:** 17,051 rows, no duplicate barcodes, no zero or negative `Tqty`; 26,736 pieces; cost ₹3,80,69,006.06; MRP value ₹6,00,98,160. The total row (no barcode) carries `Tqty` 26,736 and `Amount` ₹3,85,50,679.28: the pieces agree, the amount is ₹4,81,673.22 more than the rows, unexplained. Two rows are `CARRY BAG` (20 pieces); the report leaves them out (17,049 rows, 26,716 pieces).
- **Distinct values:** 344 brands, 59 non-blank category codes (about 13 are real categories), 96 item names, 232 suppliers, 109 sizes, 7 gender strings, 70 fit strings.
- **Blanks:** `Category` 4, `Fit` 4, `Size` 4, `Supplier` 16.
- **Quirks:**
  - It cannot show stock-outs: sold-out barcodes are not in the file, so only 3,490 of the 11,701 barcodes sold (29.8%) are found in it.
  - `Category` mixes real categories (`CASUAL WEAR` 10,345 rows, `FORMAL WEAR` 1,852, `PARTY WEAR` 1,475, `SEASONAL WEAR` 1,273, `NIGHTWEAR`, `ACCESSORIES`, `TRADITIONAL WEAR`, `INNERWEAR`) with short codes (`UTP`, `USP`, `BLZP`, `UTM`, `USE` and others).
  - `Gender`: `MALE` 8,369, `FEMALE` 5,054, `KIDS MALE` 2,277, `KIDS FEMALE` 1,310, `UNISEX` 36, `SMAG HALF ZIPPER` 4, `NA` 1.
  - `Fit` has 195 values with a trailing non-breaking space (`REGULAR `). `Size` is text on 8,731 rows and a number on 8,316. `Barcode` is a number on 15,557 rows and text on 1,494. `Design` is an Excel date on 76 rows.
  - 13 rows have `Rate` above `Mrp`. 298 rows hold 6 or more pieces; the largest row holds 189.
  - Top suppliers by cost: Aditya Birla Lifestyle Brands ₹89.3 L, Vishal Marketing ₹61.9 L, Saraogi Super Sales ₹16.7 L, KDPS Lifestyle Pvt Ltd (Deoghar) ₹14.5 L.
- Sensitive content: cost per barcode (so margin) and supplier names. Not copied here.

### `Sales_Hazaribagh.xlsx`

- **What:** the sales report from the first bill (4 Sep 2025) to 24 Jul 2026. 4.6 MB. The author field names an individual (not copied). Created 24 Jul 2026 18:02 UTC, last saved 19:43 UTC by `user`.
- **Sheets (2):**

| Sheet | Rows used | Content |
| --- | --- | --- |
| `Sheet1` | `A1:Y26200` | Header, 26,195 line rows (rows 2 to 26,196), a total row (row 26,197), the words `SALES RETURN` in the `Customer` column of row 26,198, a blank row, and the total row repeated (row 26,200) |
| `Sheet2` | `A1:D205` | A leftover pivot table, not used by the script: filter `Gender` = `(Multiple Items)`, rows about 200 brands, `Sum of Qty` (total 8,133), `Sum of Disc Amt` (−₹9,81,507.40), `Sum of Net Amount` (₹1,36,60,467.60) |

- **Columns of `Sheet1` (25, no empty first column):** `Bill Date`, `Bill No`, `Customer`, `Phone`, `Item`, `Brand`, `Color`, `Size`, `Design No`, `Barcode`, `SalesMan`, `Sub Category`, `Gender`, `Fit`, `season`, `Qty`, `Rate`, `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount`, `Bill Amount`, `Cash`, `Card`, `Credit`. These are the same names as the Vaishnavi sales file (which has an extra empty column A).
- **Row structure:**
  - One row is one bill line. `Bill Date` and `Bill No` are repeated on every line of a bill (the JSL and Vaishnavi files leave them blank on later lines).
  - `Customer`, `Phone`, `Sub Category`, `Bill Amount`, `Cash`, `Card` and `Credit` are filled only on a bill's first line. So `Sub Category` is the category code of the first item only (inferred).
  - `Rate` is the MRP at sale; `Gross Amt` = `Qty` × `Rate`; `Net Amount` = `Gross Amt` + `Disc Amt` (`Disc Amt` is negative).
- **Bill numbers:** `25-26/JSL/1` to `25-26/JSL/4611` (4,611 bills, no gap) and `26-27/JSL/1` to `26-27/JSL/2484` (2,483 bills; number 2014 is missing, the only gap in either series). 7,094 bills in all, on 317 different days.
- **Totals (my sums of the line rows):**

| Measure | Value |
| --- | --- |
| Lines / bills | 26,195 / 7,094 |
| `Qty` | 26,169 |
| `Gross Amt` | ₹3,85,49,731 |
| `Disc Amt` | −₹69,88,861.13 |
| `Net Amount` | ₹3,15,60,869.87 |
| `Bill Amount` (first lines) | ₹3,13,95,062.14 |
| `Cash` / `Card` / `Credit` | ₹1,12,36,256.70 / ₹2,01,58,805.44 / 0 |
| 25-26 part (from 4 Sep 2025 to 31 Mar 2026) | 4,611 bills, 16,845 pieces, net ₹2,03,01,335.87 |
| 26-27 part (to 24 Jul 2026) | 2,483 bills, 9,323 pieces, net ₹1,12,59,534 |
| Distinct non-blank values | 346 brands, 105 items, 102 sizes, 11,701 barcodes, 61 season strings, 16 salesperson names |

- **The total row covers only the 26-27 part:** its `Qty` 9,323, `Gross Amt` ₹1,32,16,162, `Disc Amt` −₹19,56,628, `Net Amount` ₹1,12,59,534, `Bill Amount` ₹1,12,52,042, `Cash` ₹38,58,721 and `Card` ₹73,93,321 match the 26-27 lines exactly. So the POS total row appears to restart at the financial year, and the report's note that the total "does not reconcile" is explained (inferred).
- **Tenders:** 2,500 bills cash only, 3,984 card only, 442 split, 163 with no tender. No UPI column.
- **Returns:** 942 lines with negative `Qty` (948 pieces, net −₹18,50,042); 723 bills mix sale and return lines (exchanges). No link to the original bill.
- **Carry bags:** 6,447 `CARRY BAG` lines (7,027 bags, net ₹1,941; 6,446 under brand `JAINSONS`, 1 under `VIMAL`), almost all at `Disc%` 100. `Disc%` is 100 on 6,579 lines in all.
- **Discount quirk:** 1,308 lines have `Disc%` 0 but a non-zero `Disc Amt`, so the "0% (full price)" discount band in the reports contains rupee discounts (₹5.2 L in the stock-sales-margin report's own table).
- **Salespeople:** 16 names. `SalesMan` is blank on 8,011 lines (30.6%): on 6,403 of the 6,447 carry-bag lines and on 1,607 of 19,747 other lines (8.1%).
- **Customer and phone:** `Customer` is `CASH` on 1,518 bills. `Phone` is a 10-digit number on 5,789 bills (81.6%), blank on 1,116 and `0` on 189. 3,644 distinct 10-digit phones.
- **Other quirks:**
  - `Color` is mostly `PREMIUM` (11,300 lines), `ECONOMY` (9,814), `MEDIUM` (4,574) or `ASSO.` (334), not a colour. Staff tag goods with no clear colour or classification this way, mostly non-brand goods (product owner, 4 Oct 2026). How the product handles these tags is OPEN for the product owner.
  - `Gender`: `MALE` 8,710, `FEMALE` 7,845, `UNISEX` 6,704 (carry bags are mostly `UNISEX`), `KIDS MALE` 1,766, `KIDS FEMALE` 1,104, `KIDSM` 36, `KIDS` 18, and a few junk values.
  - `season` is an Excel date on 597 lines and blank on 56. `Design No` is an Excel date in the year 2513 on 75 lines; the same line in the JSL export holds the same date with day and month swapped (`2513-01-05` against `2513-05-01`).
  - Bill `26-27/JSL/2014` (30 Jun 2026, 4 lines, ₹5,249) exists in the JSL export and is gone here: the only gap in the series. Whether a bill was deleted after export is not known.
- Sensitive content: customer names and phone numbers; salesperson names; per-person sales. Not copied here.

### `build-report.py`

- **What:** a Python script (43 KB, 661 lines) that writes the `Hazaribagh-Stock-Sales-Margin.html` report. Its docstring (written twice, lines 2 to 10) says: run `python3 build-report.py`; needs pandas and openpyxl (it also imports numpy); reads the two `.xlsx` files in its own folder; writes `Hazaribagh-Stock-Sales-Margin.html`. This README was written from reading the script. It was not run.
- **Inputs and outputs:** reads `Sales_Hazaribagh.xlsx` and `SOH_Hazaribagh.xlsx` (sheet `Sheet1` of each) from its own folder. Writes only the HTML file, and prints the headline, the monthly table, the category and item tables, the discount bands, the loss-makers, the dead-stock items and the top brands to the screen. The "Generated" date in the report comes from the computer clock, which is why the report says 25 Jul 2026.
- **Hard-coded lookup tables (lines 17 to 30):**
  - `ITEM_MERGE` (15 entries): `SAREES`, `SILK SAREE` to `SAREE`; `SWEAT SHIRT` to `SWEATSHIRT`; `TROUSERS` to `TROUSER`; `KURTA SET` to `KURTI SET`; `TROLLEY`, `HARD TROLLY` to `TROLLY`; `DUFFLE BAG` to `DUFFEL BAG`; `BELTS` to `BELT`; `HANDKERCHIEFS` to `HANDKERCHIEF`; `JACKET (FS)` to `JACKET`; `T SHIRT`, `TSHIRT` to `T-SHIRT`; `LADIES PURSE` to `PURSE`; and a no-op `SWEATER` to `SWEATER`.
  - `BRAND_ALIAS` (13 entries): `LP`, `LY`, `LR` to `LOUIS PHILIPPE`; `VH`, `VS`, `VD`, `VF`, `VX` to `VAN HEUSEN`; `AS` to `ALLEN SOLLY`; `PE` to `PETER ENGLAND`; `USPA`, `U. S. POLO`, `US POLO` to `U.S. POLO`.
  - `CAT_FIX` (13 entries): spelling and code fixes such as `FORMAL WAER` to `FORMAL WEAR`; `ACCE`, `ACCM` to `ACCESSORIES`; `SILK SAREE`, `SAREE`, `SAREEM`, `BLOUSE`, `LEHP` to `TRADITIONAL WEAR`; `TROUSER`, `FULL SET` to `CASUAL WEAR`; `CAPE` to `WINTER WEAR`.
  - `VALID` (13 categories): `CASUAL WEAR`, `FORMAL WEAR`, `PARTY WEAR`, `SEASONAL WEAR`, `NIGHTWEAR`, `ACCESSORIES`, `TRADITIONAL WEAR`, `INNERWEAR`, `SPORTS WEAR`, `WINTER WEAR`, `WINTER SET`, `FABRIC`, `PROMOTIONAL`. Any other category code is dropped.
  - `PACKAGING`: `CARRY BAG`, `POLY BAG`, `PROMO BAG`.
- **Steps, with every formula:**
  1. **Load stock (lines 37 to 44).** Keep rows with a barcode and an item name (this drops the total row; a code comment calls it "hidden"). Convert `Tqty`, `Mrp`, `Rate`, `Amount` to numbers (blank becomes 0). Normalise item (upper case, merge table) and brand (alias table). Category is the cleaned `Category` kept only if in `VALID`. `stk_mrp` = `Tqty` × `Mrp`; `stk_cost` = `Tqty` × `Rate`.
  2. **Load sales (lines 46 to 56).** Keep rows with a bill date and an item, then rows with a quantity (this drops the total rows). Fill `Bill No`, `Customer` and `Phone` downwards: a bill with a blank phone takes the previous bill's phone (a probable cause of the high phone-capture and repeat-customer figures on the dashboards; guess). Convert the number columns. `Bill Date` to a date; month `ym`. `disc` = −`Disc Amt` (positive). Blank `Gross Amt` and `Net Amount` become 0.
  3. **Category (lines 58 to 73).** The stock file is the authority. Missing categories are filled by barcode (most common value), then by brand and item, then by item. Packaging items are set to `PACKAGING`. What is still empty becomes `OTHER / UNCLASSIFIED`. `cat_cov` records the share of sold lines that had a category before the last fill.
  4. **Cost ratio (lines 75 to 92).** Cost ratio = stock cost ÷ stock MRP, over stock rows with `Mrp`, `Rate` and `Tqty` all above 0. It is computed at six levels (barcode, brand and item, item, brand, category, whole stock). Each sold line takes the first level that has a value, in that order. The result is clipped to between 0.05 and 1.20. The level used is recorded.
  5. **Cost of goods and margin (lines 93 to 94).** `cogs` = `Gross Amt` × cost ratio. `margin` = `Net Amount` − `cogs`. So cost of goods is MRP value times a stock-based ratio, not a real cost at sale; a free-gift line gets full cost and zero revenue.
  6. **Aggregates (lines 96 to 116).** Packaging is split out; the rest is "merchandise". By item, category and brand: sold quantity, MRP value sold, discount, net, cost of goods, lines; stock quantity, stock MRP, stock cost, SKU count. Then: margin % = margin ÷ net × 100; discount % = discount ÷ MRP value sold × 100; **sell-through %** = sold ÷ (sold + stock quantity) × 100 (closing snapshot, because opening stock was not supplied); **cover (months)** = stock quantity ÷ (sold quantity ÷ **11.0**), the 11 being typed into the script, not computed. Sorted by stock MRP.
  7. **Headline (lines 118 to 148).** Period, months (11, counted from the data), bills (distinct `Bill No`), lines, sums, overall cost ratio, full-price margin % = break-even discount % = (1 − overall cost ratio) × 100, match-tier mix (share of cost of goods by level), monthly table.
  8. **Discount bands (lines 152 to 160).** The `Disc%` column (not the `Disc Amt` rupees) is cut at **0, 10, 20, 30, 36.68, 50, 70, 99.99, 100** into nine labelled bands (the 70-99% band is empty and not shown). 36.68 is the break-even discount for this Store, typed in as a number (my check of the stock file gives 36.68). Lines with `Disc%` 0 and a rupee discount fall in the full-price band.
  9. **Loss-makers and others (lines 162 to 170).** Per-item break-even discount; items with margin below 0 and net above ₹2 L; 100%-discount lines; items with stock and no sale; top 20 brands (all printed only).
  10. **Brand buy margin (lines 173 to 176).** (1 − stock cost ÷ stock MRP) × 100 by brand, leaving out `PROMOTIONAL` stock (inflated MRP, near-zero cost).
  11. **HTML (lines 179 to 660).** Style sheet, number formats (`inr` for rupees with Indian commas, `cr` shows crore from ₹1 Cr and lakh below), tables, bars, call-outs and text.
- **Hard-coded values and thresholds in the HTML step (all analyst assumptions):**

| Where | Value | Effect |
| --- | --- | --- |
| Lines 315, 338, 357 | Margin 30% and 15% | Category and item margin tags and bars: green at 30% or more, amber at 15% or more, red below |
| Line 422 | Margin 25% and 10% | Brand margin tag colours |
| Line 305 | Margin above 20% | The margin tile on the headline strip is green above 20%, amber otherwise |
| Line 359 | Cover of 200 months or more | Shown as "200+ mo" |
| Lines 530, 533, 537 | First 6 rows | Each call-out lists at most six items |
| Lines 346, 358 | Sell-through 50, 35 and 25 | Category bars green at 50 or more, gold at 35 or more; item sell-through green at 50 or more, red below 25 |
| Lines 393, 413 | Margin 25%, and below 0 | Discount-band and month tags |
| Line 401 | Margin above 20% of net, or above 0 | Month bar colour: green, gold, red |
| Lines 369, 417, 334, 344 | Top 30 items, top 18 brands, top 9 categories | How many rows and bars are shown |
| Line 432 | Stock MRP above ₹10 L and margin below 15% | "Fix first: big stock, thin margin" call-out (first 6 shown) |
| Line 433 | Stock MRP above ₹3 L and sell-through below 30% | "Watch: slow movers" call-out |
| Line 434 | Net above ₹5 L and margin above 30% | "Protect: the earners" call-out |
| Lines 502 to 511 | Text on casual wear, and on party, seasonal and traditional wear "barely discounted (5 to 15%)" | Typed text; names the categories |
| Lines 576 to 580 | Months `2026-01` and `2026-07`; "clean months — Sep, Oct, Nov, Mar, Apr, May — all ran 30%+ margin at under 10% discount" | Typed text and typed month keys; the script would fail without those months |
| Lines 595 to 599 | Eight named brands, "26 to 35% buy margin", "25 to 35% discount", four named brands with negative margin | Typed text, not computed |
| Line 630 | `38550679.28` | The stock file's total-row amount, typed in |

- **Not general:** file names, the Store name, the 11 months, the month keys and the brand sentences are fixed in the script. It needs the HZB-style stock file (with cost in `Rate`). The lookup tables are KDPS-wide and reusable. For the ERP the replacement is a declared read model, not this script.

### `dashboard-config.json`

- 245 bytes, one JSON object. Keys:

| Key | Value | Note |
| --- | --- | --- |
| `store_name` | `Hazaribagh Store` | Display name |
| `store_code` | `HZB` | The JSL folder uses `JSL` for the same Store |
| `region` | `Jharkhand` | The JSL config says `Bihar / Jharkhand` |
| `costs` | an object, below | Running-cost assumptions |
| `costs.variable_pct_of_sales` | `7` | Percent of sales |
| `costs.rent` | `220000` | The reports call it ₹2.2 L a month |
| `costs.electricity` | `100000` | The reports call it ₹1.0 L a month |
| `costs.misc` | `40000` | The reports call it ₹0.4 L a month |
| `discount_ceiling_pct` | `null` | No ceiling given; the dashboard still shows a "hard ceiling" of 37% worked out from the cost ratio |
| `soh_as_on` | `2026-07-24` | Date of the stock snapshot |

- Units (rupees a month) are not stated in the file; the dashboards say "per month" (inferred). The cost figures are what "you gave" according to the JSL business analysis; who gave them, and whether they include staff salary, is not stated. They are analyst inputs, not KDPS-approved.
- The file is read by a "store-dashboard skill" that is not in these folders. `build-report.py` does not read it.

### `Hazaribagh-Stock-Sales-Margin.html` and `.pdf`

- **What:** the script's output: "Hazaribagh — stock, sale-through, discount & margin", header "KDPS Lifestyle Pvt Ltd · Store report". Period Sep 25 to Jul 26, 7,094 bills, 19,747 lines, 17,049 stock SKU lines, prepared 25 Jul 2026.
- **Format:** HTML (53 KB) and a 10-page A4 PDF (headless Chrome, 25 Jul 2026 12:02 UTC). In the PDF the wide tables are cut off at the right edge (a print-layout fault): the category table loses `Cost of goods`, `Margin` and `Margin %`, the item table loses `Actual sales`, `Margin` and `Margin %`, and the brand table loses the margin columns and `Buy margin`. The HTML has every column.
- **Answers five questions (headline strip):**

| Question | Answer in the report |
| --- | --- |
| 1 · Stock holding at MRP | ₹6.01 Cr; 26,716 pcs; 17,049 SKU lines; cost ₹3.81 Cr |
| 2 · Sale-through | 41.7% (19,141 pcs sold against 26,716 on hand; "45,857 handled") |
| 3 · Discount given | ₹69.0 L, 17.9% of ₹3.85 Cr tag value sold |
| 4 · Actual sales | ₹3.16 Cr; average bill ₹4,449 |
| 5 · Margin earned | ₹69.6 L, 22.1% of sales; "would be 37% at full price" |
| Break-even discount | 37%; goods cost 63% of the tag |

- **Sections:** The five answers; Answer 5 · category wise (table, two bar charts, two call-outs); Answers 1 to 4 · item wise (table of the top 30 items, three call-outs); Where the margin leaks (discount bands); Month by month; Brand view (top 18 brands by stock); How these numbers were built (method and caveats).
- **Category table (₹ lakh):**

| Category | Stock @ MRP | Stock qty | Sale-thru | Disc % | Actual sales | Margin | Margin % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Casual Wear | 305.6 | 14,489 | 37% | 24% | 140.2 | 15.3 | 11% |
| Formal Wear | 106.0 | 3,170 | 38% | 14% | 41.5 | 10.4 | 25% |
| Party Wear | 84.6 | 2,406 | 37% | 5% | 44.9 | 17.4 | 39% |
| Seasonal Wear | 54.0 | 2,538 | 56% | 15% | 64.9 | 18.8 | 29% |
| Accessories | 15.3 | 1,521 | 45% | 18% | 6.2 | 2.6 | 42% |
| Promotional | 9.4 | 145 | 51% | 61% | 0.6 | 0.4 | 68% |
| Traditional Wear | 9.2 | 378 | 47% | 4% | 6.0 | 2.0 | 34% |
| Nightwear | 5.3 | 425 | 38% | 6% | 2.7 | 0.6 | 23% |
| Innerwear | 4.4 | 1,099 | 63% | 6% | 4.2 | 0.9 | 20% |
| Sports Wear | 2.0 | 166 | 28% | 16% | 0.5 | 0.1 | 18% |
| Winter Wear | 2.0 | 225 | 41% | 17% | 2.0 | 0.7 | 33% |
| Fabric | 1.6 | 77 | 16% | 1% | 0.3 | 0.1 | 38% |
| Winter Set | 1.3 | 72 | 32% | 7% | 0.7 | 0.3 | 41% |
| Other / Unclassified | 0.1 | 5 | 90% | 20% | 0.9 | 0.1 | 15% |
| Total | 600.9 | 26,716 | 42% | 18% | 315.6 | 69.6 | 22% |

  - Call-outs: "Casual wear is the problem" (half the shop, 44% of sales, 22% of margin); "Party, seasonal and traditional wear carry the store" (37% of sales, 55% of margin).
- **Item table:** top 30 items by stock at MRP. Examples: Shirt ₹87.3 L stock, 36% sale-through, 27% discount, 3% margin; Jeans ₹85.0 L, 36%, 30%, 10%; Saree ₹63.9 L, 52%, 5%, 37%; T-Shirt ₹49.6 L, 33%, 24%, 8%; Kurti Set ₹46.0 L, 45%, 7%, 33%; Suit ₹43.8 L, 36%, 10%, 35%; Trouser ₹40.3 L, 34%, 28%, −2%. Cover (months) runs from 2 (Trolly) to 82 (Duffel Bag); "All other 69 items" and a total row close the table. Three call-outs use the thresholds above: Fix first (Shirt, Jeans, T-Shirt, Trouser, Blazer), Watch (Backpack, Palazzo Set, Duffel Bag) and Protect (Saree, Kurti Set, Suit, Salwar Suit, Lehenga, Dresses).
- **Discount bands (₹ lakh):**

| Band | Qty | Sold @ MRP | Discount | Actual sales | % of sales | Margin | Margin % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0% (full price) | 9,987 | 165.8 | 5.2 | 160.6 | 51% | 55.8 | 35% |
| 1-10% | 4,298 | 82.9 | 5.0 | 77.8 | 25% | 25.5 | 33% |
| 10-20% | 710 | 15.7 | 3.1 | 12.7 | 4% | 2.6 | 20% |
| 20-30% | 901 | 23.8 | 7.0 | 16.8 | 5% | 1.3 | 8% |
| 30-36.7% | 55 | 0.9 | 0.3 | 0.6 | 0% | 0.0 | 8% |
| 36.7-50% | 2,455 | 74.0 | 34.2 | 39.7 | 13% | −9.2 | −23% |
| 50-70% | 511 | 16.5 | 9.1 | 7.4 | 2% | −3.3 | −45% |
| 100% (free) | 224 | 5.1 | 5.1 | 0.0 | 0% | −3.0 | 0% |

  - Reading: "₹15.6 L of margin was destroyed below the line"; 15% of sales (₹47.2 L) sold at more than 37% discount; margin would be 32% without it; full-price selling is 51% of sales at 35% margin.
- **Month by month (net sales ₹ L, margin %):** Sep 23.7 (30%), Oct 22.1 (32%), Nov 32.6 (31%), Dec 20.7 (21%), Jan 40.0 (−6%), Feb 29.5 (17%), Mar 34.4 (30%), Apr 48.3 (33%), May 20.6 (32%), Jun 26.7 (21%), Jul 17.0 (0%). Text: "January is where the year was lost" (₹26.4 L of discount at 40% off turned ₹40.0 L of sales into a ₹2.5 L loss on goods); July "heading the same way".
- **Brand view:** top 18 brands by stock at MRP with sale-through, discount %, sales, margin and "buy margin". Van Heusen ₹46.2 L stock, 37% sale-through, 29% discount, 4% margin, 32% buy margin; Louis Philippe ₹38.8 L, 36%, 30%, 9%, 44%; Allen Solly ₹38.4 L, 47%, 34%, 3%, 35%; Arrow, Killer, Levis and U.S. Polo Kids at or below zero margin; Jay Ambey (42%) and Yes Mam (37%) at the top. Text: the national menswear brands are "bought thin and discounted deep", with buy margins of 26 to 35%.
- **Method and caveats it states:** cost of goods is estimated (no cost column in sales); match quality 29% of cost matched on exact barcode, 64% on brand and item, 7% on item, 0.3% on brand or overall average; margin is gross (rent, salary and power not deducted); carry bags (6,447 lines, 7,027 pieces, ₹1,941) excluded; 946 returned pieces (₹18.5 L) are netted; the stock file's total row is "₹4,84,973 above the sum of its rows" and the sales file's total row "does not reconcile".
- **How the last two statements check out:** the report's ₹4,84,973 compares the file's total row with stock cost after the two carry-bag rows (₹3,300) are removed; against all rows the difference is ₹4,81,673. The sales total row reconciles with the 26-27 lines (above).

### `HZB-Dashboard.html` and `.pdf`

- **What:** "Hazaribagh Store — Business Dashboard", header "Monthly Store Dashboard · 16 Measures · AI-Assisted". Tags: sales Sep 25 to Jul 26 (11 months), stock file `SOH_Hazaribagh.xlsx`, 7,094 bills, 19,141 pieces, ₹3.16 Cr, 16 staff, 3,643 known customers. Footer: "Prepared for KDPS Lifestyle Pvt. Ltd. · Hazaribagh Store · Generated generated from data files." It says it was built by the "store-dashboard skill" from `Sales_Hazaribagh.xlsx` and `SOH_Hazaribagh.xlsx`. The generator is not in the folder.
- **Format:** HTML (36 KB) and an 8-page A4 PDF (headless Chrome, 27 Jul 2026 08:27 UTC); same numbers.
- **Headline strip:** net sales ₹3.16 Cr (7,094 bills); net profit kept ₹7.2 L (about 2%); average margin 22% ("about 37% at full price"); average bill ₹4,449 (2.7 pieces); stock against sales speed 0.7× ("about 17 months to sell"); repeat customers 40% (drive 66% of tracked sales). Each card also shows a change "vs last month" (−36% sales, −6372% profit, −104% margin, −12% bill). These compare the part month of July (to 24 Jul) with June, next to the 11-month total, and mean nothing.
- **"What's covered":** the 16 measures it names, with section numbers: 1 staff productivity; 2 average bill value; 3 repeat and new customers; 4 month-on-month profit and loss; 5 dead stock; 6 fast-moving stock; 7 stock turnover; 8 ageing; 9 out-of-stock items; 10 item-wise; 11 gender-wise; 12 top 20 brands; 13 size analysis; 14 accessories; 15 discount; 16 margin. Where the list of 16 came from is not stated (the JSL analysis says "the 16 measures you asked for").
- **Sections:**

| Section | What it says |
| --- | --- |
| 1 · Sales through the period | ₹17.0 L to ₹48.3 L a month. Profit or loss by month (₹ L): Sep +1.6, Oct +2.1, Nov +4.2, Dec −0.5, Jan −9.1, Feb −0.8, Mar +4.3, Apr +8.9, May +1.5, Jun +0.1, Jul −4.9. Best Apr, weakest Jan |
| 2 · The money (#4, #15, #16) | "Past 37% off, the store sells at a loss"; keep 37% "as the hard ceiling". P&L table by month: net sales, discount %, cost of goods, gross profit, running cost, profit or loss. 11 months: sales ₹316 L, discount 18%, cost of goods ₹247 L, gross profit ₹69 L, running cost ₹62 L, profit ₹7 L. "₹69.0 L given away against ₹68.9 L gross profit"; a 5-point cut in discount "about ₹17.2 L a year" |
| 3 · Brands (#12, #16) | Top 20 by sales with discount, margin, stock and verdict. Verdict labels: "Big, thin profit" (U.S. Polo, Allen Solly, Van Heusen, Louis Philippe), "Selling at a loss" (Killer, Levis, Arrow, Mufti), "Star, grow it" (Fw, Jay Ambey, Plazer, Yes Mam, Citrus, Ashmita Bq, Hyphen, Khushaal), "Thin profit" (Peter England, Blackberry), "Healthy" (Jockey, Blackberrys) |
| 4 · What sells (#10, #11, #13, #14) | Sales by section: Men 48%, Women 43%, Kids Male 5%, Kids Female 4%. Top items (Saree ₹48.6 L at 5% discount; Shirt ₹39.3 L at 27%; Jeans ₹36.1 L at 30%; Kurti Set ₹32.0 L at 7%; and eight more). Fastest sizes by section. Accessories ₹9.1 L on ₹6.8 L of stock |
| 5 · Stock health (#5 to #9) | Stock ₹3.81 Cr at cost (₹6.01 Cr at MRP), about 17 months of sales (a healthy shop "3 to 4 months"); only 20% of stock value in styles that have sold; stock turn 0.7× a year against a target of 3 to 4×; ageing 6+ months ₹0.40 Cr; out of stock on fast items 0; stock by age (₹ Cr): under 3 months 0.05, 3 to 6 months 0.27, 6 to 12 months 0.31, over a year 0.09, "no season tag" 3.10; slow money by item (Shirt ₹55.1 L, Jeans ₹45.6 L, T-Shirt ₹30.2 L, Trouser ₹25.1 L, Suit ₹23.8 L, Kurti Set ₹20.5 L) |
| 6 · Customers and staff (#1 to #3) | Average bill ₹4,449; repeat customers 40% (66% of tracked sales); "bills with a phone 96%"; 3,643 known customers; top 5% bring 27% of sales; a table of eight salespeople with sales, bills, average bill and "price held" (93% down to 55% across the 16 staff) |
| 7 · What we could not measure | No conversion rate (no footfall); profit is an estimate; only 11 months of sales; no colour analysis (the analysis read the `Color` field as a price band: analyst assumption) |
| 8 · What to do | Six moves: cap the discount at 37% ("never sell below cost"); fix the brand and product mix; clear the ₹0.40 Cr aged stock; buy the right mix; capture every customer and use the list (WhatsApp reminders); manage by this dashboard every month |
| How this was prepared; Honest caveats | Cost of goods and profit are estimates; running cost is 7% of sales plus rent ₹2.2 L, electricity ₹1.0 L and misc ₹0.4 L a month; dead stock means not sold in the 11 months |

- Staff names appear in the report's table; not copied here.

## Parameters the analysts used (all analyst assumptions, none a KDPS decision)

| Parameter | Value | Where |
| --- | --- | --- |
| Discount ceiling | 37% ("hard ceiling for normal selling"), derived as 100% minus the stock cost ratio of 63%; `discount_ceiling_pct` is `null` | Dashboard, report |
| Running costs | 7% of sales plus ₹3.6 L a month fixed (rent ₹2.2 L, electricity ₹1.0 L, misc ₹0.4 L) | `dashboard-config.json`, dashboard P&L |
| Healthy stock turn | 3 to 4 times a year, "3 to 4 months of stock" | Dashboard |
| Margin colour cut-offs | 30 and 15 (categories, items); 25 and 10 (brands); 25 (bands, months) | `build-report.py` |
| Sell-through colour cut-offs | 50, 35, 25 | `build-report.py` |
| Call-out thresholds | ₹10 L stock and under 15% margin; ₹3 L stock and under 30% sell-through; ₹5 L sales and over 30% margin | `build-report.py` |
| Verdict labels | Star, Big thin profit, Selling at a loss, Thin profit, Healthy; the rule is not in the folder. U.S. Polo gets "Big, thin profit" at 10% margin here and "Healthy" at 11% in the JSL dashboard, so the cut-off lies between (inferred) | Dashboard |
| Cost ratio | Stock cost ÷ stock MRP at six levels, clipped 0.05 to 1.20 | `build-report.py` |
| Cover divisor | 11 months, typed in | `build-report.py` |
| "5-point discount cut = ₹17.2 L a year" | 5% of annualised net sales, with no effect on volume | Dashboard |
| Staff cost | Not clearly included in the running cost | Dashboard |

## Which figures reproduce (HZB)

My recount from the raw files.

| Figure | Report says | Recount | Result |
| --- | --- | --- | --- |
| Bills, net sales, discount | 7,094; ₹3.16 Cr; ₹69.9 L (all lines) | 7,094; ₹3,15,60,870; ₹69,88,861 | Reproduces |
| Pieces sold (merchandise) | 19,141 | 26,169 all lines less 7,027 bags is 19,142 | Reproduces within 1 |
| Stock | 26,716 pcs, ₹6.01 Cr MRP, ₹3.81 Cr cost | 26,736 less 20 bag pieces; ₹6.01 Cr; ₹3.81 Cr | Reproduces |
| Carry bags | 6,447 lines, 7,027 pcs, ₹1,941 | Same | Reproduces |
| Cost ratio and break-even | 63% and 37% | 63.32% and 36.68% | Reproduces |
| Known customers | 3,643 | 3,644 distinct 10-digit phones | Reproduces within 1 |
| Bills with a phone | 96% | 81.6% (5,789 of 7,094); 189 bills hold `0` and 1,116 are blank | Does not reproduce. Filling the phone down across bills gives about 100%. |
| Repeat customers | 40%, driving 66% of tracked sales | 30% of phones with 2 or more bills, 58% of sales; 41.5% with the fill-down | Does not reproduce; the fill-down probably explains it (guess) |
| Out of stock on fast items | 0 | The stock file has no zero rows, so it cannot show this | An artefact |
| Stock by age | Mostly "no season tag" (₹3.10 Cr of ₹3.81 Cr) | The stock file has no `Season` column | Mostly missing (the little ageing shown probably comes from the sales `season` through the barcode; guess) |
| Margin, profit, cost of goods | ₹69.6 L, ₹7.2 L | Cannot be checked: cost of goods is an estimate by design | Estimates |
| "Vs last month" cards | −36%, −6372%, −104% | Last (part) month against the month before | Meaningless |

## Data quality summary

- The stock file keeps only positive rows, with no `Season`; sold-out items cannot be found in it.
- Brand names differ between sales and stock (`FW` and `Fashion World`, `Blackberry` and `Blackberrys`, `U.S. Polo Kids`); the dashboard shows `Fw` as a "Star" brand with ₹0 stock.
- The cost margin rests on a ratio, matched to exact barcode only for 29% of sold cost.
- Whether sales `Net Amount` includes GST and whether `Rate` is ex-GST is not known; if `Rate` is ex-GST, margin is overstated.
- The sales file has no GST column, no time of day, no cost, no return-to-bill link.
- The two "Sheet2" pivots are leftovers and mean nothing.

## Open questions

Full list: [open-questions.md](../../../data-notes/open-questions.md).

1. Is `JAINSONS-LIFESTYLE | HAZARIBAGH` the Store behind both `HZB` and `JSL`, and which name and code should the ERP use? Owner: KDPS Owner. Blocks stage 1 store set-up.
2. Are `Rate` (stock cost) and sales `Net Amount` with or without GST? Is `Rate` a landed cost, and does it change with scheme or margin support? Owner: Accounts and the CA.
3. Who set the running costs (7% of sales, rent ₹2.2 L, electricity ₹1.0 L, misc ₹0.4 L), do they include staff salary, and are they approved? Owner: KDPS Owner and Accounts.
4. Is a discount ceiling KDPS policy? The 36 to 37% in the dashboards is derived from the cost ratio. Owner: KDPS Owner (see `POL-19.03` for markdown approval).
5. Which measures does KDPS want on a Store dashboard, and who approved the "16 measures"? Owner: KDPS Owner and product owner. Blocks reports in every stage.
6. Was bill `26-27/JSL/2014` deleted on purpose? Can the POS delete or edit a bill after export, and does it keep a trace? Owner: KDPS Owner.
7. What does `OFFER` mean (`IN OFFER` on 732 stock rows), and who maintains it? Owner: KDPS Owner (offers).
8. Can the other stores' exports follow the JSL movement-statement layout (full stock, zero rows kept, season and opening quantity)? Owner: KDPS Owner.
9. May customer phone numbers be used for WhatsApp reminders and customer lists? Owner: KDPS Owner and the CA.
