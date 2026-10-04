# Analyses and metrics

> **Not ranked.** These notes describe the data KDPS sent. They decide nothing. A PRD or policy change they lead to needs an entry in [decisions.md](../decisions.md) first. See [README.md](README.md).

This note covers the earlier analyses of KDPS data: what they measured, how, what holds up, and what the ERP must record to produce such measures from its own records.

- The analyses are the ERP team's earlier work for KDPS. They are not KDPS decisions. Every threshold, benchmark, cost and budget value in them is an **analyst assumption**.
- **None of these values may become an ERP default.** `AGENTS.md` says: never invent a value. See section 3.
- "Recomputed" means recomputed from the raw files in `docs/data-from-kdps/store-analysis/` and the brand workbook. Figures are exact where stated.
- `analysis-parameters.md` in that folder is an empty file (0 bytes, dated 6 Jul 2026). No parameter list was ever written down. Nothing references it.
- **JSL is the Hazaribagh Store.** JSL is the bill-series prefix of Jainsons Lifestyle, Hazaribagh. The HZB and JSL sales files match line for line from Sep 2025 to May 2026, and the monthly sales in the two dashboards are identical for those months (June differs by ₹0.2 L). The analyst treated them as two stores. This is strong evidence, not a statement from KDPS (see [stores-and-codes.md](stores-and-codes.md)). So the HZB and JSL reports describe one Store at two cut-offs.
- Source folders: [store-analysis](../data-from-kdps/store-analysis/README.md), [VAISHNAVI](../data-from-kdps/store-analysis/VAISHNAVI/README.md), [hazaribagh](../data-from-kdps/store-analysis/hazaribagh/README.md), [jsl](../data-from-kdps/store-analysis/jsl/README.md), [brand-analysis-report](../data-from-kdps/brand-analysis-report%20/README.md).

## 1. What exists

None of the files names its author. The reports describe themselves as "AI-Assisted" and "Prepared for KDPS Lifestyle Pvt. Ltd." Who prepared them is OPEN (section 7). Each HTML report has a PDF beside it that is a Chrome render of the same page.

| Artefact | What it is | Made by and label | Date | Data used | Period and cut-off |
| --- | --- | --- | --- | --- | --- |
| `Vaishnavi-Deoghar-Analysis.html` (+ `.pdf`, 8 pages) | Business and operations review of the Vaishnavi Deoghar Store: sales, inventory, discounting and margin, brand scorecard, customers, data health, seven actions | ERP team's earlier analysis. "Store Performance & Operations Review · AI-Assisted Analysis" | 14 Jun 2026 (its footer) | The three raw workbooks in `VAISHNAVI/` | Sales 1 Apr 2025 to 13 Jun 2026. SOH as on 12 Jun 2026 |
| `Vaishnavi-Deoghar-Data-Quality.html` (+ `.pdf`, 3 pages) | Three stock-file problems: cost above MRP, two season labels, structure | Same | 14 Jun 2026 | `VAISHNAVI DEOGHAR 12-06-2026 SOH.xlsx` only (8,805 in-stock rows checked) | SOH as on 12 Jun 2026 |
| `Vaishnavi-SOH-data-errors.xlsx` | The lists behind the data-quality note. Tabs `Summary`, `Cost above MRP` (24 rows), `Season mismatch` (3,007 rows with both season values) | Same. The file property `creator` is `openpyxl`, so a script wrote it | Created 14 Jun 2026 | Same SOH file | Same |
| `Vaishnavi-Dead-Stock-Worklist.xlsx` | Worklist. Tabs `Summary`, `By Gender`, `Non-moving stock` (6,892 rows; 16 columns; last column `Action (fill in)` is empty), `Overstock 6+ pcs` (133 rows) | Same. Script-written (`openpyxl`) | Created 15 Jun 2026 | SOH file and both sales files | "Sold" = any sale 1 Apr 2025 to 13 Jun 2026 (14 months). Stock as on 12 Jun 2026 |
| `hazaribagh/HZB-Dashboard.html` (+ `.pdf`, 8 pages) | "Monthly Store Dashboard · 16 Measures · AI-Assisted". Built by a "store-dashboard skill" that is not in the folder | Same label. "Generated from data files"; no date printed. File times 3 Aug 2026 | Not printed | `Sales_Hazaribagh.xlsx`, `SOH_Hazaribagh.xlsx` | Sales 4 Sep 2025 to 24 Jul 2026 (printed "Sep 25 – Jul 26 (11 mo)"). SOH 24 Jul 2026 |
| `hazaribagh/Hazaribagh-Stock-Sales-Margin.html` (+ `.pdf`) | Five answers (stock at MRP, sell-through, discount, actual sales, margin) with category, item, discount-band, month and brand tables. The output of `build-report.py` | Same label | "Prepared 25 Jul 2026" | Same two workbooks | Same as the HZB dashboard |
| `hazaribagh/build-report.py` | 661-line Python script (pandas, numpy). Reads the two workbooks beside it and writes only the margin report. It hard-codes file names, the divisor `11.0`, narrative text about January and a total-row literal `38550679.28` | Same | File time 3 Aug 2026 | Same two workbooks | Same. Read, not run |
| `hazaribagh/dashboard-config.json` and `jsl/dashboard-config.json` | Six keys: `store_name`, `store_code`, `region`, `costs`, `discount_ceiling_pct`, `soh_as_on`. The two files differ only in name, code, region and `soh_as_on` (2026-07-24 for HZB, 2026-06-30 for JSL) | Read by the store-dashboard skill. `build-report.py` does not read it | File times 3 Aug 2026 (HZB) and 6 Jul 2026 (JSL) | Holds the running-cost values (section 3) | — |
| `jsl/JSL-Dashboard.html` (+ `.pdf`) | Same template as the HZB dashboard, 16 measures | Same label. Files dated 3 Aug 2026 | Not printed | `fy 25-26 sales.xlsx`, `fy 26-27 sales.xlsx`, `june sales report.xlsx`, `soh30626.xlsx` (as its footer lists them) | Sales 4 Sep 2025 to 30 Jun 2026 ("Sep 25 – Jun 26 (10 mo)"). SOH 30 Jun 2026 |
| `jsl/JSL-Business-Analysis-2026.html` (+ `.pdf`) | The long version of the same dashboard: "Full Business Analysis · 16 Measures · AI-Assisted" | Same label | "Analysis dated 1 July 2026" | The two FY sales files and the SOH file | Same as the JSL dashboard |
| `jsl/JSL-Winter-Purchase-Plan-2026.html` (+ `.pdf`) | A buying plan for Oct 2026 to Feb 2027 | Same label ("Winter Buying Plan · Store Deep-Dive") | "Winter plan dated 30 June 2026" | June 2026 sales (595 bills) and the SOH file | June 2026 sales. SOH 30 Jun 2026 |
| `BRAND REPORT` and `BILL SUMMARY` sheets in `brand-analysis-report /blackberry/BLACKBERRY_SALES_STOCK_DETAILS_JUNE2026.xlsx` | A line-by-line rebuild of the discount that the brand's offer rules give for the 77 sale lines of the `SALES` sheet, with a per-bill summary. Values only, no formulas | No author or label. The file property `creator` is `openpyxl`, so a script wrote it (probably AI-assisted: guess) | Last saved 19 Jun 2026 | The workbook's own `SALES` and `OFFER` sheets. The per-item offer tags agree with the `Offer` column of `KDPS LIFE.xlsx` on all 42 lines from 12 Jun (recomputed) | Title "June 2026, 1–18". The `SALES` header says 1 Jun to 30 Jun 2026. No stock cut-off: SOH is not used |

The Mufti workbook in that folder has no `BRAND REPORT` or `BILL SUMMARY`. The two Excel skills that build the monthly brand vouchers are covered in [offers-and-brand-reports.md](offers-and-brand-reports.md).

**Can `build-report.py` be reused?** Not directly. It hard-codes the file names, the 11-month divisor and Store-specific text, and it needs an HZB-style stock file with a cost column (`Rate`). Its dictionaries for items, brands and categories are KDPS-wide and worth reusing for import mappings ([item-master-vocabulary.md](item-master-vocabulary.md)). In the ERP the replacement is a declared read model in the `reports` module, not a script ([module-map.md](../design/architecture/module-map.md); `PRD-MOD-003`).

## 2. Every metric used, with its exact formula

Evidence tags: **code** = read in `build-report.py`. **text** = stated in a report. **inferred** = the report does not say; it is read from the numbers and checked on the raw data. The dashboard generator is not in the folder, so every dashboard formula marked inferred is a reading, not a fact.

Common terms:

- A **merchandise line** is a sales line whose item is not `CARRY BAG`, `POLY BAG` or `PROMO BAG` (code). Carry bags in the Vaishnavi data are sold under the brand `VAISHNAVI` at ₹0. In HZB they are 6,447 lines, 7,027 pieces and ₹1,941 of sales.
- Gross = `Rate` × `Qty`, where `Rate` is the sale-time MRP. Discount is stored negative in `Disc Amt`. Net = gross + discount. Returns are negative-quantity lines inside bills, so every total below is net of returns.
- Fill-down: bill-level fields (`Customer`, `Phone`, `Bill Amount`, tenders) sit on the first line of a bill. The script fills `Bill No`, `Customer` and `Phone` down the whole column (code). A bill whose first line has a blank `Phone` therefore takes the phone of the bill above it (inferred risk; see section 4).

### 2.1 Sales, bills and customers

| Measure | Formula as computed | Evidence | Used in |
| --- | --- | --- | --- |
| Net sales | Sum of `Net Amount` over merchandise lines | code | All |
| Bills | Count of distinct `Bill No` (merchandise lines) | code | All |
| Pieces sold | Sum of `Qty` (net of returns) | code | All |
| Average bill (ABV) | Net sales ÷ bills. HZB: ₹3.16 Cr ÷ 7,094 = ₹4,449 | inferred, checked | Dashboards, margin report, Vaishnavi |
| Pieces per bill | Pieces ÷ bills. HZB and JSL dashboards 2.7. JSL business analysis 3.7 (24,462 pieces including carry bags ÷ 6,640 bills). Vaishnavi "~2.4" | inferred, checked | Dashboards, Vaishnavi |
| Monthly net sales | Net sales grouped by the month of `Bill Date` | code | All |
| Known customers | Count of distinct phone numbers | inferred | Dashboards, Vaishnavi |
| Repeat customers | Customers with 2 or more bills ÷ known customers; and "drive X% of tracked sales" = their share of known-customer sales | inferred | Dashboards, Vaishnavi |
| Phone capture | Bills with a phone ÷ bills | inferred | Dashboards, Vaishnavi |
| Top 5% of customers | Share of known-customer sales from the top 5% of customers by spend | inferred | Dashboards, Vaishnavi |
| "Month-on-month" arrows on the headline tiles | The last month against the month before it, printed under a whole-period total (HZB: Jul against Jun, 17.0 ÷ 26.7 − 1 = −36%) | inferred, checked | Dashboards |

### 2.2 Discount, realisation and cost

| Measure | Formula as computed | Evidence | Used in |
| --- | --- | --- | --- |
| Discount (₹) | − sum of `Disc Amt` | code | All |
| Discount % | Discount ÷ sum of `Gross Amt` (the MRP value of what was sold, "tag value"). HZB: ₹69.0 L ÷ ₹3.85 Cr = 17.9% | code | All |
| Realisation, "price held" | Net ÷ gross, which is 1 − discount %. By month, brand or salesperson. Vaishnavi: 67% of ticket value over the year | inferred, checked | Vaishnavi, dashboards |
| Discount band | The line's printed `Disc%` placed in a band with edges 0, 10, 20, 30, 36.68, 50, 70, 100. `100% (free)` = `Disc%` of 99.99 or more | code | Margin report |
| Free gift (Vaishnavi) | A line with `Disc%` = 100 | text | Vaishnavi |
| Cost ratio of a stock group | Sum of (`Tqty` × `Rate`) ÷ sum of (`Tqty` × `Mrp`), over stock rows with `Tqty`, `Mrp` and `Rate` all above 0 | code | Margin, break-even |
| Cost ratio for a sold line | The first available of: its barcode, brand + item, item, brand, category, overall. Then clipped to 0.05 to 1.20 | code | Margin |
| COGS (estimated) | `Gross Amt` × the line's cost ratio. Return lines have negative gross, so they reverse | code | Margin, profit |
| Margin | `Net Amount` − COGS. Margin % = margin ÷ net | code | Margin, dashboards |
| Match quality | Share of COGS by tier. HZB: 29% barcode, 64% brand + item, 7% item, 0.3% brand or overall | code, text | Margin report |
| Full-price margin, break-even discount | 1 − the overall cost ratio. HZB 37%, JSL 36%. The same number is used both ways | code | Dashboards, margin report |
| Buy margin (brand) | 1 − sum of cost ÷ sum of MRP over the brand's stock, leaving out category `PROMOTIONAL` | code | Margin report |
| Vaishnavi cost basis | "Standard cost-of-goods estimate" = 59% × net sales (the stock cost share of MRP applied to sales) | inferred | Vaishnavi |
| "Mark-up" (Vaishnavi) | "41%" = 1 − 59% cost share. It is a margin on MRP, not a mark-up on cost (that would be about 69%) | inferred | Vaishnavi |

### 2.3 Profit (dashboards only)

| Measure | Formula as computed | Evidence |
| --- | --- | --- |
| Gross profit | Net sales − estimated COGS, per month | text |
| Running cost | 7% × month's net sales + ₹2,20,000 rent + ₹1,00,000 electricity + ₹40,000 misc (₹3.6 L fixed a month) | text |
| "Net profit kept" | Gross profit − running cost. HZB: ₹69 L − ₹62 L = ₹7.2 L (2%). JSL: ₹13.4 L (4%) | text, checked |
| "5-point discount cut is worth ₹X a year" | 5% × annualised net sales: HZB 5% × ₹3.156 Cr × 12 ÷ 11 = ₹17.2 L. No volume effect. JSL dashboard ₹17.9 L; JSL business analysis ₹15 L (not explained); Vaishnavi "₹10 L+" (5% of ₹2.3 Cr of goods sold) | inferred, checked |

### 2.4 Stock: value, sell-through, cover, turn

| Measure | Formula as computed | Evidence |
| --- | --- | --- |
| Stock at cost and at MRP | Sum of `Tqty` × `Rate`; sum of `Tqty` × `Mrp`. Rows without a barcode (the POS total row) are dropped | code |
| Sell-through % | Sold ÷ (sold + on hand) × 100. Sold = pieces over the whole sales period; on hand = the closing SOH snapshot. "Opening stock was not supplied" | code |
| Cover (months) | Stock quantity ÷ (sold quantity ÷ 11.0). The 11 is hard-coded. No sales: shown as "—"; 200 or more: "200+ mo" | code |
| "Stock takes ~17 months to sell" | Stock at MRP ÷ (MRP value sold ÷ months in the data). It is the value version of cover, not the quantity version (section 4 table) | inferred, checked |
| Stock turnover "0.7×/yr" | 12 ÷ the value cover (HZB 12 ÷ 17.2 = 0.70) | inferred, checked |
| Vaishnavi "inventory held ~1.8 yrs" | Stock at cost ÷ (59% × net sales) | inferred |
| Vaishnavi "sells ₹0.93 for every ₹1 of stock" | FY net sales ÷ stock at cost (₹1.67 Cr ÷ ₹1.80 Cr). Brand version "Sales ÷ Stock" uses the brand's own sales and stock | inferred, checked |
| "Share of stock value in styles that have sold even once" | Stock cost whose barcode has a net sold quantity above 0 ÷ stock cost. JSL 18.9% (reported 19%). HZB 19.9% (reported 20%) | inferred, checked |

### 2.5 Ageing, dead stock, aging, new, overstock

| Measure | Formula as computed | Evidence |
| --- | --- | --- |
| Age band (JSL, HZB, winter plan) | Months from the month in the season label to the as-on date: `SPRING SUMMER(Mar-26)` is Mar 2026. Bands: under 3, 3 to 6, 6 to 12, over 12 months. Labels without a month (`SS25`), blanks, `N/A` and Excel dates fall into "No season tag" | inferred, reproduced to the rupee on JSL |
| "Aging stock, 6 mo+" | The 6–12 band plus the over-12 band, at cost. The tile says "not sold in 6+ months" but sales play no part in it (JSL ₹1.34 Cr + ₹0.10 Cr = ₹1.44 Cr) | inferred, checked |
| HZB ageing | The HZB stock file has no `Season` column. The ages appear to come from the `season` column of the sales file, matched by barcode, so only styles that sold get an age: "No season tag ₹3.10 Cr" of ₹3.81 Cr | inferred |
| Never sold in 14 months (Vaishnavi) | A barcode in stock with no sales line from 1 Apr 2025 to 13 Jun 2026. Matched on exact barcode (size and colour). A barcode with only a return line counts as sold | text, checked |
| Dead / Aging / New (Vaishnavi) | Never sold, and the year in the season label is 2024 or older / 2025 / 2026. "Dead — untracked age" (no season) has 0 SKUs. New: "do NOT discount yet" | text |
| Stock by season year (Vaishnavi) | Stock at cost grouped by the year in the season label (2021 and older to 2026) | text, reproduced |
| "Dead stock" (HZB, JSL dashboards) | Stock at cost of barcodes with no sale in the data window (10 or 11 months), by item. Recomputed for HZB within about 2% | inferred, checked |
| Overstock (Vaishnavi) | 6 or more pieces on one barcode. Status `slow` if it sold at all, `NEVER SOLD` if not (100 and 33 rows) | text |
| `By Gender` tab | A gender's dead + aging cost ÷ total dead + aging cost (male 73.6%) | inferred, checked |
| "Out of stock on fast items" | Count of fast items "sold recently, now at zero". The rule for "fast" and "recently" is not stated | none |
| "Last winter, still unsold ₹1.26 Cr" (winter plan) | Stock at cost tagged `AUTUMN WINTER(…-25)`, whether or not any piece sold (8,620 pieces, ₹1.26 Cr, recomputed) | inferred, checked |

### 2.6 The 16 dashboard measures

The dashboards list "16 measures". The JSL business analysis says "all 16 measures you asked for". Who asked, and who approved the list, is not recorded.

| # | Measure | Section | What the page shows | Definition |
| --- | --- | --- | --- | --- |
| 1 | Staff productivity | 6 | Per salesperson: sales, bills, average bill, price held (8 of 16 shown). No hourly figure: no attendance or targets in the data | Price held = net ÷ MRP value (inferred) |
| 2 | Average bill value | 6 | Net sales ÷ bills; pieces per bill | See 2.1 |
| 3 | Repeat and new customers | 6 | Repeat %, their share of tracked sales, phone capture, known customers, top 5% | See 2.1 |
| 4 | Month-on-month P&L | 2 | Net sales, discount %, COGS, gross profit, running cost, profit or loss per month | See 2.3 |
| 5 | Dead stock | 5 | "Where the slow money sits": six items by cost not sold in the period | See 2.5 |
| 6 | Fast-moving stock | 5 | No table of its own. It appears only through #9 and the size table (#13) | Not stated |
| 7 | Stock turnover | 5 | ×/yr, months to sell, "target 3–4×" | See 2.4 |
| 8 | Ageing | 5 | Stock at cost in four age bands plus "No season tag" | See 2.5 |
| 9 | Out-of-stock items | 5 | Count of fast items now at zero (HZB 0; JSL 1,184) | Rule not stated |
| 10 | Item-wise | 4 | Top 12 items: pieces, sales, average price (= sales ÷ pieces), discount %, "Read" label | Label cut-offs not stated; seen: 7% or less "Full price", 9–10% "Some discount", 21% or more "Heavily discounted" |
| 11 | Gender-wise | 4 | Share of net sales by the `Gender` field (Men, Women, Kids Male, Kids Female, Kids) | Inferred |
| 12 | Top 20 brands | 3 | Pieces, sales, discount %, margin %, stock, verdict. Brand codes merged | Verdict cut-offs not stated (section 3) |
| 13 | Size analysis | 4 | Top 6 sizes by pieces sold per gender; % = how much of that size's stock has sold | Inferred: sell-through per size |
| 14 | Accessories | 4 | Accessories sales and stock. HZB shows ₹9.1 L sold on ₹6.8 L of stock; the margin report's `Accessories` category shows ₹6.2 L sold | The two reports use different accessory sets; the stock basis is not stated |
| 15 | Discount | 2 | Discount % by month, ₹ given, "the 37% rule" | See 2.2 |
| 16 | Margin | 2, 3 | Margin %, and the margin "at full price" | See 2.2 |

### 2.7 How the margin report and the dashboards cut the data

Steps in `build-report.py` (code):

1. Load stock. Drop rows with no `Barcode` or `Item Name`. Normalise item, brand and category with the dictionaries `ITEM_MERGE`, `BRAND_ALIAS`, `CAT_FIX` and `VALID`.
2. Load sales. Drop rows with no `Bill Date` or `Item`. Fill down `Bill No`, `Customer` and `Phone`. Month = month of `Bill Date`.
3. Category: the stock file's category wins. Gaps are filled by barcode, then brand + item, then item (the most common value). Packaging items get `PACKAGING` and are left out.
4. Cost-ratio cascade, COGS and margin (2.2).
5. Totals by item, category and brand: stock quantity, MRP and cost; sold quantity, gross, discount, net, COGS, margin; sell-through; cover; discount %.
6. Cuts: discount bands, months, top 30 items, top 18 brands by stock at MRP.
7. Callouts (thresholds are in section 3): "Fix first", "Watch", "Protect".

Dashboard brand verdicts, seen in the tables (inferred, not stated): margin of 28% or more "Star — grow it"; 20–23% "Healthy"; below 0 "Selling at a loss"; 1–10% "Thin profit" or, for brands selling ₹14 L or more, "Big, thin profit". The same brand gets different labels in the JSL dashboard and the JSL business analysis, which use the same data: U.S. Polo "Healthy" against "Big, thin profit"; Citrus "Star" against "Healthy"; Allen Solly "Big, thin profit" against "Big, no profit".

### 2.8 Vaishnavi analysis: the brand scorecard

| Measure | Formula as computed | Evidence |
| --- | --- | --- |
| Realisation (brand) | Brand net ÷ brand gross | inferred |
| Sales ÷ Stock | Brand FY net sales ÷ brand stock at cost. Jockey ₹9.9 L ÷ ₹4.0 L = 2.44× (on unrounded figures) | inferred, checked |
| Brand family | LP + LY + LR is Louis Philippe; VH + VS + VD + VF + VX is Van Heusen. Merged by the analyst using barcode matches. "Should be confirmed with the store" | text |
| Discount split of ₹83 L | "Markdown on sold goods ₹43 L", "Free gifts ₹28 L at MRP", "Returns reversed ₹7.7 L" | text |

### 2.9 Winter purchase plan

| Figure | How it was made |
| --- | --- |
| June sales ₹25.7 L, 595 bills, average bill ₹4,320 | `june sales report.xlsx` (1 to 29 Jun): net ÷ bills. Recomputed ₹4,324 |
| "About 15 months" of stock | Not stated. It matches quantity cover over all 10 months (15.5), not June alone (section 4 table) |
| "6 months old or more ₹1.44 Cr" | Season-tag age bands (2.5) |
| "Cash it can free ₹1.1–1.3 Cr" from ₹1.44 Cr at cost, ₹2.30 Cr at MRP | No discount rate is stated. The range is below the cost it frees (inferred) |
| "₹78 L" budget, "₹60–98 L" range, 54 / 18 / 15 / 8 / 5% split, "about ₹1.2 Cr at MRP" | No method is stated. ₹78 L ÷ the 63.5% cost ratio is ₹1.23 Cr, which fits the "about ₹1.2 Cr at MRP" figure only |
| Plan dates | Order July to October, "all buying done by October", Dussehra 20 Oct, Diwali 8 Nov, Chhath 15 Nov 2026 |
| Sold-in-June table | Pieces, money and discount % per item for June. "Costly (branded) clothes bring about 8 of 10 rupees": the cut-off for "costly" is not stated |

### 2.10 `BRAND REPORT` and `BILL SUMMARY` (Blackberry, 1 to 18 Jun 2026)

- `BRAND REPORT` columns: `Date`, `Bill No`, `Item`, `Brand`, `Size`, `Style Code`, `Barcode`, `Qty`, `MRP`, `Offer Applied`, `Final Dis %`, `Final Dis Amt`, `Final Total`. 77 lines, 36 bills. Its subtitle says: discounts reconstructed from the `OFFER` sheet and the AMM list.
- Rules in the sheet (from its subtitle and its `Offer Applied` labels):
  - A bill with a duffel bag: the bag is the discount (`Duffel @₹199`: ₹3,499 becomes ₹199, −₹3,300). The other lines of that bill are `Full MRP (bag taken)`.
  - Any other bill with a gross of ₹6,999 or more: a cash-off (`Buy ₹6999 → ₹600 off`, `Buy ₹10999 → ₹1000 off`), put on one line.
  - From 12 Jun: the per-item tag. `B-tier` percentages are B1 30%, B2 and B3 40%, B4 and more 50%, chosen by the number of qualifying pieces in the bill. `FLAT 25%` items. `Fresh – No Discount` items get 0 and are not counted. A return line is not counted.
  - `Final Dis %` = discount ÷ MRP. `Final Total` = MRP + `Final Dis Amt`.
- `BILL SUMMARY` columns: `Date`, `Bill No`, `Lines`, `Gross MRP`, `Offer Applied`, `Total Discount`, `Net Sale`, `Flags` (one bill is flagged `exchange/return`).
- Totals (recomputed): signed MRP ₹1,92,149. Rebuilt discount −₹54,692.40 and net ₹1,37,456.60. As billed in `SALES`: discount −₹47,516.15 and total ₹1,44,632.85. The gap is ₹7,176.25. The rebuilt discount amount differs from the billed one on 17 of 77 lines (2 before 12 Jun, 15 from 12 Jun).
- The offer slabs and percentages are the brand's terms in the `OFFER` sheet and in `KDPS LIFE.xlsx`. They are not KDPS decisions and not analyst values. The modelling choices above (duffel at ₹199, a cash-off on one line, the tier count) are the analyst's.

### 2.11 The data-quality checks

- Cost above MRP: stock rows where `Rate` is above `Mrp`. 24 SKUs, 33 pieces (recomputed). The data-quality note lists mostly Stride T-shirts and Van Heusen jeans.
- Season mismatch: the same 8,805 barcodes carry a different season on `Sheet1` and `Sheet2`: 3,007 (34%). Split: 1,194 format only (`SS25` and `SS-25`), 1,010 a date where a season belongs, 640 blank on one sheet, 163 genuinely different or `N/A`.
- Structure: two sheets for the same stock; `Sheet1` has 33,383 rows (24,576 zero stock, 8,805 in stock, one POS total row of 13,375 pieces); the rows sum to 13,354 pieces, so the POS total is 21 pieces off.
- These checks are the ones the ERP's import checks should repeat ([data-quality-and-import-rules.md](data-quality-and-import-rules.md)).

## 3. Analyst assumptions

**None of these values is a KDPS decision. None may become an ERP default.** Source "analyst" means no source is named in the report. The PRD says targets "never act as policy defaults" ([Business measures](../prd.md#business-measures)). `POL-15.07`, `POL-13.11` and `POL-02.25` keep thresholds unset until they are validated or configured. `POL-05.09` says actual budgets remain to be supplied.

| Value | Where used | Source | KDPS decision? |
| --- | --- | --- | --- |
| Healthy store turns stock 3–4 times a year, carries 3–4 months of stock | Vaishnavi analysis, dashboards, winter plan | analyst | No (OPEN) |
| Sales ÷ stock of 2.0 or more is "good" | Vaishnavi brand chart | analyst | No (OPEN) |
| Brand verdict words: Star, Healthy, Big but slow, Big overstocked, Overstocked, Slow + discounted (Vaishnavi); Star — grow it, Healthy, Big thin profit, Thin profit, Selling at a loss (dashboards) | Reports | analyst; cut-offs not stated | No (OPEN) |
| Margin colours: categories and items green at 30% or more, amber at 15% or more, red below; brands 25 and 10; month rows and discount-band rows green at 25% or more; bar charts 30 and 15 | `build-report.py` | analyst | No (OPEN) |
| Month bar: margin above 20% of sales is green, above 0 amber, otherwise red. "Around break-even" has no stated tolerance | `build-report.py`, dashboards | analyst | No (OPEN) |
| Sell-through colours: 50 and 35 on bars (green, gold, red); text positive at 50 or more, negative below 25 | `build-report.py` | analyst | No (OPEN) |
| "Fix first": stock at MRP over ₹10 L and margin under 15%. "Watch": stock at MRP over ₹3 L and sell-through under 30%. "Protect": net sales over ₹5 L and margin over 30% (first 6 of each shown) | `build-report.py` | analyst | No (OPEN) |
| List sizes: top 30 items, top 18 brands by stock at MRP (margin report); top 20 brands by sales, top 12 items, 8 salespeople, top 6 sizes per gender (dashboards) | Reports | analyst | No (OPEN) |
| Discount band edges 0, 10, 20, 30, 36.68, 50, 70, 100 | `build-report.py` | analyst; 36.68 is the HZB break-even typed in | No (OPEN) |
| Cost ratio clipped to 0.05–1.20 | `build-report.py` | analyst | No (OPEN) |
| Discount "hard ceiling" 37% (HZB) and 36% (JSL): normal selling must stay below it | Dashboards, margin report | analyst, derived from the cost ratio. Both configs have `discount_ceiling_pct` = null | No (OPEN) |
| Running costs: 7% of sales, rent ₹2.2 L, electricity ₹1.0 L, misc ₹0.4 L a month (config `costs`: 7, 220000, 100000, 40000) | Dashboards, both configs | "user gave" (business analysis: "as you gave"). The person is not named. Whether staff pay is included is not stated | No (OPEN) |
| 11-month divisor (`11.0`); the JSL dashboards use 10; annualise × 12 | `build-report.py`, dashboards | analyst (the months in the data) | No (OPEN) |
| 14-month window for "never sold" | Vaishnavi analysis, worklist | analyst (all the data supplied) | No (OPEN) |
| Dead / Aging / New by calendar year in the season label: 2024 and older, 2025, 2026. A Sep 2025 lot is "a year old" at nine months | Vaishnavi worklist | analyst | No (OPEN) |
| Season-tag age bands under 3, 3–6, 6–12, over 12 months; 6 months or more is "aged" | JSL and HZB dashboards, winter plan | analyst | No (OPEN) |
| Overstock = 6 or more pieces on one barcode | Vaishnavi worklist | analyst | No (OPEN) |
| "Fast item" and "sold recently" for out-of-stock counts | Dashboards | unknown | No (OPEN) |
| A line with `Disc%` of 100 is a free gift | Vaishnavi analysis | analyst | No (OPEN) |
| Packaging items `CARRY BAG`, `POLY BAG`, `PROMO BAG`; promotional stock = category `PROMOTIONAL` | `build-report.py` | analyst | No (OPEN) |
| Brand families, item and category merges (`ITEM_MERGE`, `BRAND_ALIAS`, `CAT_FIX`, `VALID`) | `build-report.py`, Vaishnavi analysis | analyst, inferred from the data | No (OPEN) |
| "5 points of discount is worth": ₹17.2 L (HZB), ₹17.9 L (JSL dashboard), ₹15 L (JSL business analysis), ₹10 L+ (Vaishnavi) | Reports | analyst | No (OPEN) |
| Other action sizes: ₹25–40 L freed in two clearance cycles; ₹50–70 L less stock at one turn; ₹2–3 L from the salesperson price gap; real gift cost ₹4–9 L; clearance cash ₹1.1–1.3 Cr; stock ₹4.0 Cr down to ₹3.2 Cr; "11 months, not 15" | Vaishnavi analysis, winter plan | analyst | No (OPEN) |
| Top 5% of customers as the "VIP" group | Vaishnavi analysis, dashboards | analyst | No (OPEN) |
| Winter budget ₹78 L at cost; range ₹60–98 L; about ₹1.2 Cr at MRP | Winter plan | analyst; method not stated | No (OPEN) |
| Winter split ₹42 L, ₹14 L, ₹12 L, ₹6 L, ₹4 L (54, 18, 15, 8, 5%) | Winter plan | analyst | No (OPEN) |
| Dussehra 20 Oct, Diwali 8 Nov, Chhath 15 Nov 2026; order July to October; clearance from July | Winter plan | analyst | No (OPEN) |
| Brand report modelling: duffel at ₹199, a cash-off on one line, tier by qualifying-piece count with returns and `Fresh` items left out | `BRAND REPORT` | analyst. The slabs and percentages are brand terms, not KDPS decisions | No (OPEN) |

Decision owner for all rows: the KDPS Owner. The running costs also need Accounts; the budget also needs Booking and Accounts (`POL-05.09`).

## 4. Headline findings and what reproduces

### 4.1 Headline findings (top lines only)

**Vaishnavi Deoghar (sales to 13 Jun 2026, SOH 12 Jun 2026)**

- FY 2025-26 net sales ₹1.67 Cr, 5,383 bills, average bill ₹3,108, about ₹13–14 L a month. September ₹19.7 L is the peak; October ₹8.1 L is the low.
- Stock ₹1.80 Cr at cost, ₹3.04 Cr at MRP, 13,354 pieces. 78% of stock value (₹1.41 Cr) has not sold in 14 months. Dead (2024 and older) is ₹38 L in 2,431 SKUs.
- 33% of ticket value is given away: ₹83 L on ₹2.50 Cr of MRP.
- Jockey sells ₹2.44 per ₹1 of stock; Spykar ₹0.62.
- Stock file: 24 SKUs with cost above MRP, 3,007 season mismatches, two sheets, a buried total row.

**Hazaribagh Store (HZB, sales 4 Sep 2025 to 24 Jul 2026, SOH 24 Jul 2026)**

- Net sales ₹3.16 Cr, 7,094 bills, 19,141 pieces. Discount ₹69.0 L (17.9% of tag value).
- Estimated margin ₹69.6 L (22.1%), against 37% at full price. Estimated profit after the assumed running costs: about ₹7 L (2%). January (₹26.4 L of discount, 40% off) lost money; July is heading the same way.
- Stock ₹6.01 Cr at MRP, ₹3.81 Cr at cost, 26,716 pieces. Sell-through 41.7%. About 17 months of cover on value.
- Casual wear is half the Store at 11% margin. Saree and kurti sets sell at 5–7% discount and 33–37% margin. ₹15.6 L of margin was lost on sales discounted deeper than 37%.

**JSL (the same Store, sales 4 Sep 2025 to 30 Jun 2026, SOH 30 Jun 2026)**

- Net sales ₹2.98 Cr, 6,640 bills, 17,896 pieces. Estimated profit about ₹13 L (4%).
- Stock 27,695 pieces, ₹3.99 Cr at cost, ₹6.28 Cr at MRP. ₹1.44 Cr is in season tags 6 months old or more.
- All stock arrives by transfer: the stock file shows no purchases. The business analysis says the buying advice is the Store's indent to head office.
- Winter plan: clear ₹1.44 Cr of old stock first, then buy about ₹78 L at cost.

**Blackberry `BRAND REPORT` (1 to 18 Jun 2026)**

- 77 lines, 36 bills. Billed ₹1,44,632.85; rebuilt by the offer rules ₹1,37,456.60. The discount differs on 17 lines.

### 4.2 What reproduces and what does not

Verdicts: **Yes** = matches the raw data. **No** = does not. **Partly** = depends on a definition the report does not state.

| Claim (as reported) | Recomputed from the raw files | Verdict |
| --- | --- | --- |
| Vaishnavi net sales ₹1.67 Cr, 5,383 bills, average bill ₹3,108 | ₹1,67,28,634; 5,383; ₹3,108 | Yes |
| Vaishnavi stock 13,354 pieces, ₹1.80 Cr cost, ₹3.04 Cr MRP | 13,354; ₹1,79,81,383; ₹3,03,57,010. The POS total row says 13,375 | Yes |
| Not sold in 14 months: 78%, ₹1.41 Cr | 78.4%, ₹1.41 Cr. Season-year splits also reproduce | Yes |
| Vaishnavi "100% of phones captured" (5,381 of 5,383 bills) | 2,805 bills (52%) carry a phone; 2,775 a valid 10-digit one; 2,058 bills are customer `CASH` | No |
| Vaishnavi "53% repeat customers" | 344 of 2,297 phones (15%) have 2 or more bills. Filling the phone down across bills gives about 53% (guess: the cause) | No |
| Vaishnavi "repeat customers drive ~93% of sales" | 30% of known-customer sales | No |
| Vaishnavi "top 5% of customers 21% of sales" | 21.8% of known-customer sales (15% of all sales) | Yes, on known customers only |
| "Buys at 59% of MRP, a 41% mark-up" | 59.2%, but 67.1% without 407 trolley pieces (MRP ₹9,999, cost about ₹804, sold at ₹99–₹399). The 41% is margin on MRP, not mark-up | Partly |
| Vaishnavi "~1.8 years of inventory" | Only with COGS = 59% × sales, which the trolleys understate | Partly |
| Vaishnavi "units per bill ~2.4" | 2.36 when carry bags, gift lines and returns are left out; 2.53 when only carry bags are left out | Partly |
| Vaishnavi "61% of stock value in styles that never sold" | By `Design No` 34%. By barcode 78%. The report's "style" is not defined | No |
| Vaishnavi discount split: ₹43 L + ₹28 L + ₹7.7 L for ₹83 L | The parts add to ₹78.7 L, not ₹83 L. Recomputed: ₹55.5 L on regular sale lines, of which ₹12.4 L is on 665 lines with `Disc%` of 0 (amount-only overrides); ₹43.1 L is on lines with a `Disc%`. The ₹7.7 L is net return value, not a discount (inferred) | No |
| Vaishnavi "Van Heusen trolley, ~30 years to clear" | A gift item, treated as slow stock | No |
| HZB net ₹3.16 Cr, 19,141 pieces, stock 26,716 pieces, ₹6.01 Cr MRP, ₹3.81 Cr cost | Same. Sell-through 41.7% | Yes |
| HZB margin 22.1%, profit ₹7 L | Not independently reproducible: cost is estimated and the script was not run | Partly |
| HZB "96% of bills with a phone" | 84% of bills have any phone; 81.6% a valid 10-digit one | No |
| HZB "3,643 known customers" | 3,644 | Yes |
| HZB "40% repeat, driving 66% of sales" | 30% of phones with 2 or more bills; 58% of known-customer sales | No |
| HZB "out of stock on fast items: 0" | An artefact. The HZB stock file keeps only rows with stock, so a stock-out cannot show | No |
| JSL "67% of bills with a phone" | The same bills as HZB: 85% any phone, 82% valid. HZB says 96% for the same Store | No |
| JSL "2,561 known customers" | 3,461 | No |
| JSL "37% repeat" | 30% of phones with 2 or more bills. Another reading (second-or-later bills ÷ bills with a valid phone) gives 36.6% for JSL but 37% for HZB against the reported 40% (guess: coincidence) | No |
| JSL sales 6,640 bills, 17,896 pieces, ₹2.98 Cr; stock 27,695 pieces, ₹3.99 Cr, ₹6.28 Cr | Same | Yes |
| Aged stock ₹1.44 Cr (JSL dashboard, winter plan) | Reproduces to the rupee as the 6–12 and over-12 age bands. Under 3 months ₹1.04 Cr, 3–6 ₹1.21 Cr, 6–12 ₹1.34 Cr, over 12 ₹0.10 Cr, no usable tag ₹0.30 Cr. The tile calls it "not sold in 6+ months", but it ignores sales | Partly |
| Aged stock ₹1.28 Cr "not sold in 6–10 months" (JSL business analysis) | Not reproduced. Aged 6 months or more and unsold: ₹1.03 Cr over the 10 months; ₹1.26 Cr with no sale in the last 4 months; ₹1.30 Cr in the last 3. Different definition (guess) | No |
| "Last winter, still unsold ₹1.26 Cr" | ₹1.26 Cr is all stock tagged Autumn Winter 2025, sold or not | Partly |
| Months of cover 15, 16.5, 17, 20 (table below) | Each matches one basis | Partly |
| JSL "1,184 fast items out of stock" | 1,260 zero-balance barcodes sold in May and June. The rule is not stated | Partly |
| "Only 19% of stock value in styles that sold even once" (JSL) | 18.9% | Yes |
| Trolley and promotional distortion of the cost ratio, HZB and JSL | Without category `PROMOTIONAL` and trolley, duffel and backpack items the ratio moves from 63.3–63.5% to 65.0%, so the break-even moves from 36.5–36.7% to 35% | Small here; large at Vaishnavi |
| Dashboard "vs last month" arrows | They compare the last month with the one before and sit under whole-period totals | No |
| Blackberry rebuilt net ₹1.37 lakh against billed ₹1.45 lakh | ₹1,37,456.60 against ₹1,44,632.85 | Yes |

**Months of cover.** The reports show four figures for nearly the same Store and stock. Each fits one basis (recomputed; the reports do not say which they used):

| Figure | Where | Basis that reproduces it |
| --- | --- | --- |
| 15 months | Winter plan | Stock quantity ÷ average monthly quantity over all 10 months of JSL sales: 27,695 ÷ 1,790 = 15.5. The plan says it used June |
| 16.5 months | none printed | Stock quantity ÷ June pieces from `june sales report.xlsx` (1,675): 16.5 |
| 17 months | Both dashboards, business analysis | Stock at MRP ÷ average monthly MRP value over the data window: JSL 17.5, HZB 17.2 |
| 20 months | none printed | Stock at MRP ÷ June MRP value (₹31.3 L): 20.1 |

For HZB the quantity version over 11 months is 15.4.

**Data caveats that limit any reproduction.**

- Bill `26-27/JSL/2014` is in the 30 Jun export (4 lines, ₹5,249) and gone from the 24 Jul export. It is the only gap in that series. A bill on 30 Jun was also partial in the first export.
- The HZB sales file's total row restarts at the financial year, so it does not match the line sum for the whole period (it matches Apr to 24 Jul exactly). The HZB stock total row's amount is ₹4,84,973 above the sum of its rows.
- It is not known whether `Net Amount` includes GST, or whether `Rate` is landed cost with or without GST. The reports compare tax-inclusive sales with stock `Rate`. If `Rate` excludes GST, the margins are overstated (section 7).
- Brand names differ between the sales and stock files (for example `FW` and `Fashion World`), so one dashboard shows "Fw" as a Star brand with ₹0 stock.
- Excel changed some `Season` and `Design No` text into dates. Day and month swap between exports (`2513-01-05` and `2513-05-01`).

## 5. Terminology clashes with the PRD

The PRD sources are [Words used](../prd.md#words-used) and [Business measures](../prd.md#business-measures). The differences are reported here; none is resolved. The PRD's Business measures table has nine measures (counts, PT lines, supplier returns, store-days and bank lines, Tally, brand-by-store profit, incentives, backup). None of the analysts' measures is in it. `PRD-EXC-009` requires one definition per metric, covering eligible states, units, dates, returns, discounts, tax, cost basis and aggregation. `PRD-EXC-006` asks for ageing, sell-through, weeks of cover, broken sizes, hot, warm, cold and dead stock, but gives no definitions beyond Words used.

| Term | In the analyses | In the PRD | Difference |
| --- | --- | --- | --- |
| Sell-through | Sold ÷ (sold + closing SOH), over the whole sales period (10 to 14 months). No opening stock | "The share of received pieces sold in a period" | Different denominator: pieces sold plus pieces left, not pieces received in the period. Different period |
| Cover | Months. Stock quantity (or MRP value) ÷ average monthly sales over the whole data window. Three bases in use | Weeks of cover: "how many weeks the current stock lasts at the current rate of sale" | Months against weeks. An all-period average against the current rate. Quantity or value is not fixed |
| Ageing | Months from the month in a season label (or the calendar year in it) to the report date. Proxy for lot month | "How long stock has been held, or how long a due has been unpaid" | A season label is not a held-since date. The earlier data has no inward date. The PRD ties age to a receipt (`PRD-STK-013`, receipt origin) |
| Dead stock | Vaishnavi: never sold in 14 months and season year 2024 or older. Dashboards: no sale in the data window (10 or 11 months), by item. New and gift stock are included until split out | "Good unsold stock that is no longer selling" (`PRD-STK-007`: separate from damaged or non-returnable stock) | The PRD has no time window and says "no longer selling". The analyses say "never sold in a window". Four definitions across the reports |
| Markdown | Any discount on a regular sale line ("markdown on sold goods") | "A planned price reduction" | The analyses do not separate planned markdown, offer, manual discount and free gift. `PRD-OFR-006` reports offer sales and who funded the discount |
| Discount % | Discount ÷ MRP value sold, with free gifts and amount-only overrides inside it | Not defined in Words used. `PRD-POS-003` (manual discounts need reason and authority); `PRD-POS-023` (group discounts spread by value) | The analyses mix offers, manual discounts and gifts in one percentage. The printed `Disc%` can be 0 while `Disc Amt` is not |
| Realisation, price held | Net ÷ MRP value | Not in the PRD | New word. `PRD-POS-024`: a line's price never exceeds MRP |
| Margin | Net − estimated COGS, ÷ net. "Buy margin" = 1 − cost ÷ MRP. Vaishnavi calls margin on MRP a "mark-up" | `PRD-NAV-011`: sales after returns and discounts excluding GST, minus the cost of goods sold. `PRD-PTW-011`: ticket MARGIN = (MRP − P RATE) ÷ MRP × 100, and report realised profit and agreed margins separately | The analyses' COGS is an estimate from a cost ratio, not the cost issued at sale (`PRD-LED-017`). Sales may include GST. Buy margin is the PT margin applied to stock. "Mark-up" is the wrong word |
| COGS | Gross × cost ratio | "The cost of the pieces sold in a period" | Estimated against recorded |
| Profit | "Net profit kept" = gross profit − 7% of sales − ₹3.6 L fixed a month | `PRD-NAV-012` to `PRD-NAV-014`: minus operating expenses (rent, salaries, electricity, allocated head-office expenses), depreciation, interest and income tax. `PRD-NAV-017`: a Store P&L ends at profit before tax; net profit is shown only for a legal entity | The analyses call a pre-depreciation, pre-allocation figure "net profit". Whether salaries are in the ₹3.6 L is not stated |
| Sales | Sum of `Net Amount`; whether it includes GST is unknown | `PRD-NAV-010`: sales after returns and discounts, excluding GST | Tax basis unknown. `PRD-EXC-009` wants tax stated |
| Average bill (ABV), pieces per bill | Net ÷ bills; pieces ÷ bills. Carry bags in or out changes the pieces figure (2.7 or 3.7) | Not in the PRD | No definition. Bill count rules for exchanges and bag-only bills are open |
| Stock turn, "stock vs sales speed" | Three formulas: 12 ÷ value cover (0.7×); net sales ÷ stock at cost (0.93); COGS ÷ stock (about 0.55) | Not in the PRD | No definition. The "3–4×" benchmark is an analyst value |
| SOH | Used as the Store's stock (value, cover, "stock on hand") | "A quantity reported by a system as in stock; it is a comparison source, not physical verification" | The analyses treat SOH as stock. Only a physical count creates stock (`PRD-REC-008`). Earlier-POS SOH never moves stock (`PRD-LIF-014`) |
| SKU, style | A barcode row. The earlier stock files have no colour column, so a "SKU" is style and size. "Style" is also used loosely (61% "styles") | "One merchandise variant, such as one style, colour and size" (`PRD-MER-002`) | The analysis SKU lacks colour. "Style" is undefined |
| Season | A label such as `SPRING SUMMER(Mar-26)` or `SS-25`, carrying a lot month | `PRD-MER-004`: season, collection and launch date are separate attributes. `PRD-LIF-006`: an unknown historical season can be selected | The label mixes season and a month |
| Brand | Merged brand "families" (LP + LY + LR) | `PRD-MER-001`: brands are kept independently. `PRD-MER-006`: external codes map to a SKU | "Family" is not a PRD concept |
| Gift | "Free gifts (GWP)": trolleys, backpacks, belts, carry bags at 100% discount | "Gift voucher" is a bearer voucher used as a tender | Different things. The PRD has no gift-with-purchase item. Offers are `PRD-OFR-001` |
| Overstock | 6 or more pieces on one barcode | Not defined. "Excess" in the PRD is goods found or arrived beyond the expected quantity (`PRD-STK-014`) | Do not read "overstock" as "excess" |
| Open-to-buy | The winter plan's "budget" of ₹78 L by merchandise block | "The budget still free to commit to new bookings, by brand and season" | The plan is by block, not by brand and season. Its method is not stated |
| Repeat, known customer, phone capture | Counts of phones | Not in the PRD. `PRD-POS-012` and `POL-07.12`: phone is optional and marketing consent is separate | No definition. The earlier data shows no phone as blank, "CASH", "0" or a short number |
| Staff productivity | Sales, bills, average bill and price held per salesperson | `PRD-EXC-005`: sales by salesperson and hour. `PRD-HRM-009`, `PRD-HRM-010` | "Price held" is new. No hourly or target measure was possible |
| Store, Site | "Store" for each shop; JSL and HZB as two Stores | Store: a trading business at a Site | Naming only. See [stores-and-codes.md](stores-and-codes.md) |

## 6. What the ERP must record to produce these measures

Status: **Covered** = the PRD or a design already records it. **Partly** = recorded, but a definition or field is missing. **Gap** = no rule found.

During the side-by-side test the earlier POS exports (daily sales and SOH) are evidence for checking and reports only (`PRD-LIF-013`, `PRD-LIF-014`). The same measures can be computed from them, but the exports carry no cost at sale, no inward date and no tax split. So margin and ageing from imports stay estimates, which `PRD-EXC-010` says must be shown as estimates with missing data.

| Record | Needed for | PRD and design | Status |
| --- | --- | --- | --- |
| Cost at sale, per sale line (per piece for piece-tracked goods) | Real COGS and margin instead of the cost-ratio estimate | `PRD-LED-017` (every outflow leaves at the pool's formula cost; a customer return comes back at the cost it left with), `PRD-MER-009` (cost kept separate, transaction-time snapshots), `PRD-NAV-011`; [stock-ledger.md](../design/stock/stock-ledger.md) 7.5. Cost stays off the till (`PRD-OFF-004`) and behind field permissions (`PRD-ACS-008`) | Covered. Opening-stock cost can be Unknown (stock-ledger 7.6) |
| Receipt date per receipt origin (the GRN count date) | Ageing as held-since | `PRD-REC-008`, `PRD-STK-004`, `PRD-STK-013`; stock-ledger section 4 (a receipt origin carries its count date) | Covered for new stock. **Gap for opening stock**: the earlier POS has no inward date. The switch count sets the opening origin (`PRD-LIF-004` to `PRD-LIF-006`) |
| Last-sale date per SKU | Dead, cold and slow stock | Derived from sale movements (`PRD-MOD-012`), reported under `PRD-EXC-006` | Derived. The definition is the gap (section 5) |
| Gift or promotional flag on an item | Stock value, dead stock and margin without trolleys and backpacks distorting them | No bullet. Related: `PRD-OFR-001` (buy-X-get-Y), `PRD-OFR-018` (promotional funding), `PRD-MER-004` (attributes) | **Gap** |
| Carry bags and packaging | Sales and piece counts | No bullet. The earlier POS sells carry bags as ₹0 lines (8,226 in Vaishnavi's year) | **Gap** |
| Zero-balance SKUs kept | Stock-outs, "never sold", true cover | Balances come from movements (`PRD-MOD-012`); stock-outs are qualified (`PRD-EXC-018`). The HZB export drops zero rows | Covered in the ERP. For imports ask for the full layout ([pos-exports.md](pos-exports.md)) |
| Salesperson on every sale line, separate from the cashier | Staff table | `PRD-POS-002`, `PRD-HRM-011`, `PRD-EXC-005` | Covered. Earlier data: `SalesMan` blank on 30.6% of HZB lines, mostly continuation lines |
| Tax on each line (rate, taxable value, tax) and sales excluding GST | Sales, margin, average bill | `PRD-POS-014`, `PRD-OFR-005`, `PRD-NAV-010`; [shared-calculations.md](../design/calculations/shared-calculations.md) | Covered. The earlier export has no tax columns |
| Return linked to its bill; exchange as its own record | Net sales, return rate | `PRD-RET-005`, `PRD-RET-006`, `PRD-RET-024`, `PRD-POS-014`; no-bill returns by policy (`PRD-RET-017`) | Covered. The earlier data has negative lines inside bills and no link |
| Discount amount, type, reason and funder on each line | Discount %, amount-only overrides, brand-funded discount | `PRD-POS-003`, `PRD-POS-014`, `PRD-OFR-002`, `PRD-OFR-006` | Covered |
| MRP at the time of sale | Realisation, discount % | `PRD-MER-009`, `PRD-POS-014`, `PRD-POS-024` | Covered. The sale-time MRP differs from the current SOH MRP on 1,593 of 17,027 matched Vaishnavi lines |
| Per SKU for a period: opening, receipts, sales, adjustments, returns, transfers out and in, supplier returns | True sell-through (received pieces), cover | Movements ([stock-ledger.md](../design/stock/stock-ledger.md) section 2); as-of read models (`PRD-MOD-003`) | Covered. The JSL movement statement (`Op Qty`, `Purchase`, `Sale`, `Adjustment`, `Sl Ret`, `St Trf`, `Stf Reciept`, `Pur Ret`) is the shape the earlier POS can give |
| Time of sale | Sales by hour | `PRD-EXC-005`, `PRD-MOD-009` | Covered. The earlier exports have dates only |
| Customer link and phone, optional; consent separate | Known and repeat customers, capture | `PRD-POS-012`, `POL-07.12`, `PRD-RET-018` | Partly: records covered, measure definitions missing. Unknown stays distinct from zero (`PRD-MOD-015`) |
| Store expenses by Store and brand, with allocation bases | Store profit | `PRD-NAV-012`, `PRD-PAY-014`, `PRD-CSH-004`, `PRD-EXC-008`; `POL-09.20` (Accounts and the CA approve the bases; unset; stage 5) | Covered as records. Bases unset |
| One canonical brand, category, gender, fit, season, launch date | Every cut | `PRD-MER-001`, `PRD-MER-004`, `PRD-MER-006`; [structure-and-masters.md](../design/masters/structure-and-masters.md) | Covered. A brand "family" has no PRD field: **Gap**. The earlier `Color` column holds `PREMIUM`, `MEDIUM`, `ECONOMY` or `ASSO.` instead of a colour (staff tag goods with no clear colour or classification this way, mostly non-brand goods: product owner, 4 Oct 2026); how the product handles these tags is OPEN for the product owner |
| Cost basis (`Rate` against P RATE) | Margin | `PRD-PTW-010` (P RATE is the approved receipt-layer cost) | What the earlier `Rate` is stays OPEN (section 7) |
| Attendance and targets | Sales per hour, target against actual | `PRD-HRM-004`, `PRD-HRM-009` | Covered, stage 6 |
| Footfall (door counter) | Conversion rate | None | **Gap**: the reports say conversion is impossible without it |
| Metric definitions: one per metric, with as-of time and estimates flagged | All reports | `PRD-EXC-009`, `PRD-EXC-010`, `PRD-PRF-004`; the `reports` module owns "Metric definitions" ([module-map.md](../design/architecture/module-map.md)) | Covered in principle. The definitions are OPEN |
| A completed bill cannot be deleted | A bill series without gaps | `PRD-POS-016`, `PRD-MOD-011` | Covered |
| Purchase-plan inputs: festival and clearance calendars | Winter-style plan | `PRD-EXC-016`, `PRD-EXC-017` (optional festival signals), `PRD-OFR-007` | Partly. A budget by block has no PRD home; open-to-buy is by brand and season (`POL-05.09`) |

## 7. Open questions

1. Which definition does KDPS want for sell-through, cover (weeks, quantity or value, which period), ageing (held-since or season label), dead and cold stock, stock turn, average bill and realisation? Owner: product owner, with the KDPS Owner. Blocks: the first report that shows each measure (`PRD-STG-001`); the definitions live in `reports` (`PRD-EXC-009`).
2. Does KDPS want any analyst threshold as its own target or policy: 3–4 turns, margin colours, sell-through bands, the 36–37% discount ceiling, qty of 6, the 14-month window, the season-year buckets? Owner: KDPS Owner. Blocks: nothing in the build; they stay unset (`POL-15.07`).
3. Who gave the running costs (7%, ₹2.2 L, ₹1.0 L, ₹0.4 L), do they include salaries, and are they true for each Store? Owner: Accounts. Blocks: Store profit, stage 5 (`POL-09.20`).
4. Is `Rate` landed cost, with or without GST? Does `Net Amount` include GST? Does either change with a scheme? Owner: Accounts and the CA. Blocks: margin checks on imports (stage 2) and Store profit (stage 5).
5. Are JSL and HZB one Store, and which code does the ERP use? Owner: KDPS Owner. Blocks: Store structure in stage 1 (see [stores-and-codes.md](stores-and-codes.md)).
6. What is the true phone-capture rate, and what does "known customer" or "repeat customer" mean for KDPS? May KDPS use phones for reminders (consent)? Owner: product owner; the KDPS Owner for use. Blocks: customer reports (stage 4).
7. How should gift-with-purchase goods and carry bags be recorded and kept out of stock value, dead stock and margin? Owner: KDPS Owner, with Accounts for cost. Blocks: item masters (stage 1) and offers (stage 4).
8. Is the month in a season label the lot month? Does the earlier POS hold a receipt date per piece? How old is opening stock at the switch count? Owner: KDPS Owner (earlier POS), product owner (rule). Blocks: ageing for opening stock (`PRD-LIF-004` to `PRD-LIF-006`).
9. Who asked for the 16 measures, and who approved the list? Owner: KDPS Owner.
10. How was the ₹78 L winter budget, its range and its split reached? Are there October-to-February actuals from earlier years? Owner: KDPS Owner, with Booking and Accounts (`POL-05.09`). Blocks: booking and open-to-buy configuration (stage 2).
11. Who prepared these reports, and who prepared the `BRAND REPORT`? Is it an internal check or something sent to the brand? Where does the ₹199 duffel price come from (the `OFFER` sheet lists a duffel at ₹99)? Owner: KDPS Owner. See [offers-and-brand-reports.md](offers-and-brand-reports.md).
12. Can the earlier POS export cost at sale, time of sale, an inward date and a return-to-bill link, and can every Store use the JSL movement-statement layout with zero rows kept? Owner: KDPS Owner. Blocks: the side-by-side imports (`PRD-LIF-013`).
13. Is a footfall counter wanted? If so, it needs a PRD entry first (decisions.md). Owner: product owner and KDPS Owner.
14. Was bill `26-27/JSL/2014` removed on purpose, and does the earlier POS keep a trace of deleted or edited bills? Owner: KDPS Owner.

The full list across all notes is in [open-questions.md](open-questions.md). PRD terms: [prd-fit.md](prd-fit.md).
