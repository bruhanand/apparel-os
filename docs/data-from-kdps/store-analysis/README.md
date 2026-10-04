# store-analysis

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [data-from-kdps](../README.md)

## What this folder is

- Store exports from the earlier POS (sales reports and stock-on-hand (SOH) reports) for two KDPS Stores, plus the analyses, dashboards, worklists and one script that were made from them earlier.
- The exports come from KDPS Stores. The analyses were made afterwards by the ERP team or an analyst (the files do not say who). The reports are labelled "AI-Assisted" and "Prepared for KDPS Lifestyle Pvt. Ltd."
- Stores covered: Vaishnavi, Deoghar (`VAISHNAVI/`) and Jainsons Lifestyle, Hazaribagh, which appears twice (`hazaribagh/` as "HZB" and `jsl/` as "JSL"). The two Hazaribagh folders are the same Store (see [hazaribagh/README.md](hazaribagh/README.md)).
- Period: Vaishnavi to 13 Jun 2026; JSL to 30 Jun 2026; HZB to 24 Jul 2026. Analyses are dated 14 Jun, 15 Jun, 30 Jun, 1 Jul, 25 Jul and 27 Jul 2026.
- The files do not say why they were put here (guess: to show the kind of reports the owner wants from the ERP, and to give real earlier-POS exports to test imports against, `PRD-LIF-013`, `PRD-LIF-014`).

> **Warning: analyst assumptions, not KDPS decisions.** Every threshold, benchmark, window, bucket, cost assumption, ceiling, verdict label and budget in these analyses was chosen by the analyst. KDPS did not sign any of them. None may become an ERP default or a policy value. `analysis-parameters.md` is empty, so no parameter is written down anywhere; the values below are what the reports and worklists imply. A value becomes a setting only when the KDPS Owner decides it and it is logged through the PRD or the policies.

## Contents

| Path | What it is | Covered in |
| --- | --- | --- |
| `analysis-parameters.md` | Empty file (0 bytes) | this file |
| `.DS_Store` | macOS Finder file, no content of use | ignore |
| `Vaishnavi-Deoghar-Analysis.html`, `.pdf` | Business and operations analysis, 7 sections | this file |
| `Vaishnavi-Deoghar-Data-Quality.html`, `.pdf` | Stock data quality note, 3 issues | this file |
| `Vaishnavi-SOH-data-errors.xlsx` | The full error lists behind the data quality note | this file |
| `Vaishnavi-Dead-Stock-Worklist.xlsx` | Dead and non-moving stock worklist | this file |
| `VAISHNAVI/` | The three raw Vaishnavi Deoghar workbooks | [VAISHNAVI/README.md](VAISHNAVI/README.md) |
| `hazaribagh/` | Raw HZB workbooks, `build-report.py`, config, two reports | [hazaribagh/README.md](hazaribagh/README.md) |
| `jsl/` | Raw JSL workbooks, config, three reports | [jsl/README.md](jsl/README.md) |

## Subfolders

- [VAISHNAVI/README.md](VAISHNAVI/README.md): the three raw Vaishnavi files (stock-on-hand report and two sales reports).
- [hazaribagh/README.md](hazaribagh/README.md): HZB sales and stock files, the report script, the dashboard config, the HZB dashboard and the stock-sales-margin report.
- [jsl/README.md](jsl/README.md): JSL sales files, the stock movement statement, the config, the JSL dashboard, the business analysis and the winter purchase plan.

Data notes that use these files: [analyses-and-metrics.md](../../data-notes/analyses-and-metrics.md) (the measures and how they were computed), [pos-exports.md](../../data-notes/pos-exports.md) (the sales and SOH layouts) and [stores-and-codes.md](../../data-notes/stores-and-codes.md) (Store names and codes, including JSL and HZB).

## Files

### `analysis-parameters.md`

- 0 bytes, last saved 6 Jul 2026. Nothing in the folder refers to it.
- It looks like it was meant to hold the parameters of the analyses (guess). It holds none.
- Consequence: every parameter in the reports and worklists is implicit and is listed under "Parameters the analysts used" below and in the two other READMEs.

### `Vaishnavi-Deoghar-Analysis.html` and `.pdf`

- **What:** a one-store business and operations analysis for Vaishnavi, Deoghar. Tags in its header: "Store Performance & Operations Review · AI-Assisted Analysis", sales 1 Apr 2025 to 13 Jun 2026, stock as on 12 Jun 2026, 5,383 bills, 15,285 sale lines, 8,805 stock SKUs, 13,354 units. Footer: "Prepared for KDPS Lifestyle Pvt. Ltd. · Vaishnavi, Deoghar · Analysis dated 14 June 2026."
- **Format:** HTML (about 34 KB) and an 8-page A4 PDF rendered from it by headless Chrome. The PDF text and the HTML text carry the same numbers.
- **Inputs (as the report states):** the three files in `VAISHNAVI/`. Method as stated: bill-level fields filled down within each bill; carry bags and free gifts separated from sold goods; brand families merged by barcode matches between sales and stock.
- **Sections and headline figures:**

| Section | What it says |
| --- | --- |
| The headline | Net sales FY 2025-26 ₹1.67 Cr, 5,383 bills, average bill ₹3,108. Stock ₹1.80 Cr at cost (₹3.04 Cr at MRP, 13,354 pcs). "Inventory held about 1.8 yrs" against a "healthy" 3 to 4 months. "Not sold in 14 months" ₹1.41 Cr (78% of stock value). Discount "given away" 33% of ticket value (₹83 L). "Repeat customers 53%" and "100% phones captured". One-line story: ₹0.93 of sales a year per ₹1 of stock; Jockey sells ₹2.44 per ₹1 of stock. |
| 1 · Sales and footfall | About ₹13 to 14 L a month. Monthly net sales (₹ L): Apr 12.6, May 13.1, Jun 11.6, Jul 15.7, Aug 12.7, Sep 19.7, Oct 8.1, Nov 16.4, Dec 16.5, Jan 14.9, Feb 13.5, Mar 12.6, then 2026-27: Apr 13.9, May 13.0, Jun (13 days) 4.9. Average bill up about 11% (₹3,461 in 2026). "350 to 590 bills every month". Units per bill about 2.4. |
| 2 · The big one: inventory | ₹1.80 Cr locked in stock. Stock by season year (₹ L at cost): 2021 and older 4.3, 2022 6.7, 2023 12.8, 2024 22.7, 2025 59.3, 2026 74.0. Truly dead (2024 and older, never sold) ₹38 L in 2,431 SKUs; aging 2025 unsold ₹43 L; fresh 2026 unsold ₹59 L. "61% of stock value (₹1.10 Cr) is in styles that never sold." Examples of stuck stock: Van Heusen trolley (377 pcs, "about 30 years to clear"), big-size suits, formal trousers in waist 42 to 44, Spykar and Status Quo. |
| 3 · Discounting and margin | Stock bought at about 59% of MRP ("about a 41% mark-up"). Customers pay 67% of ticket value on average; average discount on sold items 24%. The ₹83 L is split: markdown ₹43 L, free gifts ₹28 L, returns reversed ₹7.7 L. Price held by month "from 86% (April) down to 60% (August)", by salesperson 78% best to 68% lowest (gap about ₹2.4 L a year), by brand Jockey 90% against Van Heusen and Spykar 66 to 69%. A 5-point cut in discount "worth ₹10 L+ a year". |
| 4 · Brand scorecard | Seven brands (below), with "price held" and "sales ÷ stock" (2.0+ called good). Small winners named: PMS, Miss 15, SMAG, Hyphen, Tadpole. |
| 5 · Customers | "Bills with a phone about 100% (5,381 of 5,383)". Known customers 2,274. "Came back 2+ times 53% (1,194)". Top 5% of customers bring 21% of sales. Suggests a monthly WhatsApp to lapsed customers and a VIP perk. |
| 6 · Data and system health | The same brand under many codes (LP, LY, LR, LOUIS PHILIPPE; VAN HEUSEN, VH, VS, VD, VF, VX); sales and stock use different brand names; 3,007 of 8,805 items (34%) carry a different season on the two stock sheets; totals and dead rows mixed with live data; 24 items with cost above MRP; carry bags recorded as a brand and sold item (about 8,200 a year). |
| 7 · What to do | Seven moves, in the analyst's priority order (below). |
| How this was prepared / Honest caveats | "Sold in 14 months" is matched at exact size-and-colour barcode, so new 2026 stock looks unsold; 41% mark-up and "1.8 years" use the stock-file cost and "a standard cost-of-goods estimate"; margin is directional, not audited; brand groupings are inferred and "should be confirmed with the store"; rupee impacts are estimates. |

- **Brand scorecard (the report's table):**

| Brand (merged) | Sales FY | Price held | Stock (cost) | Sales ÷ stock | Analyst label |
| --- | --- | --- | --- | --- | --- |
| Jockey | ₹9.9 L | 90% | ₹4.0 L | 2.44× | Star, copy this |
| Flying Machine | ₹15.8 L | 75% | ₹12.0 L | 1.32× | Healthy |
| U.S. Polo (incl. kids) | ₹11.5 L | 81% | ₹9.5 L | 1.21× | Healthy |
| Louis Philippe family | ₹33.7 L | 71% | ₹33.0 L | 1.02× | Big but slow |
| Van Heusen family | ₹34.8 L | 69% | ₹39.1 L | 0.89× | Big, overstocked |
| Status Quo | ₹11.9 L | 71% | ₹14.9 L | 0.80× | Overstocked |
| Spykar | ₹11.0 L | 66% | ₹17.8 L | 0.62× | Slow and discounted |

- **The seven moves (analyst recommendations, with the analyst's own estimates):**
  1. Free the cash in dead stock: ₹38 L dead plus ₹43 L aging; "₹25 to 40 L of working capital freed within two clearance cycles".
  2. Buy tighter: cut open-to-buy on slow, overstocked brands, shorten size curves; going from about 0.5 to 1.0 stock-turn "could run the same sales on ₹50 to 70 L less inventory".
  3. Put discounting under control: floor prices or a maximum discount per brand, measure salespeople on price held; "5 points is about ₹10 L+ a year, staff gap ₹2 to 3 L a year".
  4. Clean the brand and product master: one name per brand.
  5. Switch on the customer base: WhatsApp to lapsed customers, a VIP perk for the top 5%.
  6. Rebalance the assortment: stock "about 74% menswear"; try more womenswear and innerwear.
  7. Manage by a monthly dashboard of five numbers: stock-turn, dead-stock %, price held %, sell-through by brand, repeat-customer rate.
- **Reproduction against the raw files** is in the table "Which figures reproduce" below.
- Sensitive content: no customer or staff name appears in the report; per-brand and per-salesperson aggregates do.

### `Vaishnavi-Deoghar-Data-Quality.html` and `.pdf`

- **What:** a companion note to the analysis, titled "Vaishnavi Deoghar — Stock Data Quality Findings", "Data Quality Findings · Companion to the Store Analysis". Dated 14 Jun 2026. Footer "Prepared for KDPS Lifestyle Pvt. Ltd. · Vaishnavi, Deoghar · 14 June 2026."
- **Format:** HTML (about 16 KB) and a 3-page A4 PDF (headless Chrome), same numbers. The note points to `Vaishnavi-SOH-data-errors.xlsx` for the full lists.
- **Scope:** the stock file `VAISHNAVI DEOGHAR 12-06-2026 SOH.xlsx`, 8,805 in-stock items.
- **Sections:**
  - "At a glance": cost above MRP 24 items; same item with two seasons 3,007 (34%); structure problems "2 sheets plus a total row buried in the data".
  - "Issue 1": 24 items have cost above MRP (shown item by item with MRP, cost entered, gap and quantity). By brand: 15 Stride t-shirts (cost about 23% above MRP), 5 Van Heusen jeans (the largest gap: cost entered about 75% above the price tag), and one each of an earbud (Turtle), a bedsheet (Parx), a tank top (Jockey) and a back pack (U.S. Polo Kids). Total 33 pieces. The note calls them cost-field data-entry errors that "show a fake loss until corrected".
  - "Issue 2": the same 3,007 items carry a different `Season` on the two sheets: 1,194 formatting only (`SS25` against `SS-25`), 1,010 a date where the season should be (`2026-04-23` against `SS-24`), 640 blank on one sheet, 163 genuinely different or `N/A`.
  - "Issue 3": two sheets for the same stock (33,383 rows including 24,576 zero-stock items, against 8,805 in-stock rows); a grand-total row with no barcode (13,375 pieces, ₹1.80 Cr); zero-stock items mixed with live stock.
  - "What to do": correct the 24 costs, standardise the season field, keep one record per item "with a single, validated season and a cost that can never exceed MRP".
- **Notes on its numbers:** the 24 items, 33 pieces and the four-way season split reproduce exactly. Its row count for Sheet1 (33,383) includes the total row and one blank row; the file has 33,381 barcode rows.

### `Vaishnavi-SOH-data-errors.xlsx`

- **What:** the full lists behind the note above. Built by a script (file author field `openpyxl`), saved 14 Jun 2026 17:53 UTC.
- **Sheets (3):**

| Sheet | Rows | Columns | Content |
| --- | --- | --- | --- |
| `Summary` | 9 rows | 2 | A title row, the source file name, then `Issue \| Detail` rows: items with cost above MRP (24, "see 'Cost above MRP' tab"); same item with a different season across the two sheets (3,007 of 8,805, 34%); two sheets describe the same in-stock items ("Sheet1 = 33,383 rows (24,576 zero-stock + 8,805 in-stock + 1 grand-total row, no barcode); Sheet2 = 8,805"); grand-total row buried inside Sheet1 (13,375 pcs, ₹1,79,81,514); the Season field sometimes holds a date |
| `Cost above MRP` | 24 | 8: `Item`, `Brand`, `Size`, `Barcode`, `MRP (Rs)`, `Cost/Rate (Rs)`, `Gap (Rs)`, `Stock Qty` | One row per barcode; 15 `T-SHIRT` (`STRIDE`), 5 `JEANS` (`VAN HEUSEN`), 1 each `EARBUD`, `BEDSHEET`, `TANK TOP`, `BACK PACK`; quantities add to 33; header row frozen |
| `Season mismatch` | 3,007 | 6: `Item`, `Brand`, `Size`, `Barcode`, `Season in Sheet1`, `Season in Sheet2` | Both season values side by side, as text. The Sheet1 value is `(blank)` on 640 rows, `N/A` on 7, a date string on 1,010; header row frozen |

- **Quirk:** the `Summary` breakdown 24,576 + 8,805 + 1 adds to 33,382, not 33,383. The file has 33,381 barcode rows, one total row and one blank row.
- Per-item cost figures are in the file; they are not copied here.
- Data note: [analyses-and-metrics.md](../../data-notes/analyses-and-metrics.md).

### `Vaishnavi-Dead-Stock-Worklist.xlsx`

- **What:** a clearance worklist for Vaishnavi, Deoghar. Title: "Dead / Non-moving Stock Worklist"; subtitle: "Stock as on 12 Jun 2026 · 'Sold' = any sale 1 Apr 2025 – 13 Jun 2026 (14 months)". Saved 15 Jun 2026 06:51 UTC. File author field `openpyxl` (built by script).
- **Method (as implied by the sheets):** take the 8,805 in-stock barcodes of the stock file (the cleaned `Sheet2`); mark a barcode "sold" if it appears on any sales line in the two sales reports; the never-sold barcodes become the worklist; bucket them by the calendar year in their season label. Raw brand names are kept (104 rows still carry codes such as `LP`, `VH`, `VD`).
- **Sheets (4):**

| Sheet | Rows | Columns | Content |
| --- | --- | --- | --- |
| `Summary` | 5 data rows | 6: `Priority bucket`, `SKUs`, `Units`, `Cost value (₹)`, `MRP value (₹)`, `What to do` | The four buckets below; a `Dead — untracked age` row with all zeros; a `TOTAL never-sold` row |
| `By Gender` | 5 genders plus total | 8: `Gender`, `Dead (2024 & older)`, `Aging (2025)`, `New (2026 – watch)`, `Total never-sold`, `SKUs`, `Units`, `% of dead+aging` | Cost value by gender; `Male` 73.6% of the dead-plus-aging cost, `Kids — Boys` 15.3%, `Female` 10.7%, `Unisex` 0.4%, `Kids — Girls` 0.02% |
| `Non-moving stock` | 6,892 | 16: `Priority`, `Gender`, `Item`, `Brand`, `Size`, `Category`, `Season`, `Yr`, `Barcode`, `Design No`, `Qty`, `MRP`, `Cost`, `Value@Cost`, `Value@MRP`, `Action (fill in)` | One row per never-sold barcode; sorted by priority, then gender, then `Value@Cost` high to low; filter on; header frozen; `Action (fill in)` is empty on every row |
| `Overstock 6+ pcs` | 133 | 14: `Item`, `Brand`, `Gender`, `Size`, `Category`, `Season`, `Yr`, `Barcode`, `Qty`, `MRP`, `Cost`, `Value@Cost`, `Sold 14mo`, `Status` | Every barcode holding 6 or more pieces, sorted by `Value@Cost`; 1,545 pieces, ₹8.49 L at cost; `Status` is `slow` on 100 rows (sold at least once) and `NEVER SOLD` on 33 |

- **Summary buckets:**

| Bucket | SKUs | Units | Cost value | MRP value | What the sheet says to do |
| --- | --- | --- | --- | --- | --- |
| Dead, 2024 and older | 2,431 | 3,160 | ₹38.0 L (₹38,03,309) | ₹56.4 L | Clear first: old season and never sold |
| Aging, 2025 | 1,998 | 2,657 | ₹43.5 L (₹43,53,980) | ₹63.7 L | Clear next: a year old and not moving |
| New, 2026 | 2,463 | 3,605 | ₹59.4 L (₹59,36,814) | ₹87.1 L | Watch only: freshly arrived, "do NOT discount yet" |
| Total never sold | 6,892 | 9,422 | ₹1.41 Cr (₹1,40,94,104) | ₹2.07 Cr | |

- **Quirks:**
  - `Cost` is a whole-rupee figure, while `Value@Cost` uses the unrounded unit cost; `Qty × Cost` differs from `Value@Cost` by more than ₹1.5 on 76 rows.
  - Row sums of `Value@Cost` differ from the `Summary` buckets by ₹67 (dead), ₹22 (aging) and ₹12 (new), probably rounding (guess).
  - `Yr` is read from the season label of the stock file. Two rows carry `SPRING SUMMER(2018)` and `SPRING SUMMER(2019)`; the dead bucket also holds 2021 (261 rows), 2022 (467), 2023 (893) and 2024 (808).
  - 31 rows have a blank `Category`. The trolley rows are included at cost near 8% of MRP (see the overstock sheet).
  - The "14 months" window is the analyst's; the worklist labels 2026 stock "watch only" for the same reason as the report.
- Sensitive content: cost per barcode (hence margin). Not copied here.

## Parameters the analysts used (all analyst assumptions)

None of these is in a KDPS document. They are inferred from the Vaishnavi reports and worklists. The same caution applies to the HZB and JSL values in their READMEs.

| Parameter | Value used | Status |
| --- | --- | --- |
| "Sold" window | Any sales line (even a return line) between 1 Apr 2025 and 13 Jun 2026, "14 months" | Analyst assumption. Return-only barcodes count as sold (126 in-stock barcodes have a net sales quantity of zero or less). |
| Match level | Exact barcode (so size and colour), so new 2026 stock looks unsold | Analyst assumption |
| Age buckets | By the calendar year in the season label: 2024 and older = dead, 2025 = aging, 2026 = new ("do not discount yet") | Analyst assumption. A September 2025 lot is "a year old" at nine months. |
| Overstock | 6 or more pieces on one barcode | Analyst assumption |
| "Slow" | Sold at all; no velocity threshold exists | Analyst assumption |
| Healthy stock turn | 3 to 4 times a year (3 to 4 months on hand) | Analyst benchmark, no source |
| "Cash speed" | Sales ÷ stock, 2.0 and above called good | Analyst benchmark, no source |
| "Inventory held about 1.8 years" | Stock at cost ÷ a "standard cost-of-goods estimate"; I back-solve it as 59% of net sales | Analyst assumption; understates cost of goods |
| "41% mark-up" | 41% of MRP (cost is 59% of MRP). On cost it is about 69%. | Wording error in the report |
| Brand families | LP + LY + LR; VH + VS + VD + VF + VX merged | Inferred; the report says confirm with the store |
| Brand labels | Star, Healthy, Big but slow, Big and overstocked, Overstocked, Slow and discounted | Analyst labels; rules not stated |
| Action estimates | ₹25 to 40 L freed; ₹10 L+ from 5 discount points; ₹50 to 70 L less inventory; ₹2 to 3 L from the staff gap | Analyst estimates |

PRD meanings differ from the analysts' uses: the PRD defines dead stock as "good unsold stock that is no longer selling", sell-through as "the share of received pieces sold in a period" and ageing as how long stock has been held (`docs/prd.md`, "Words used"). The reports use a sales-window test, `sold ÷ (sold + on hand)` and the season label.

## Which figures reproduce (Vaishnavi analysis)

My recount from the raw files in `VAISHNAVI/` against the analysis and the worklist.

| Figure | Report says | Recount | Result |
| --- | --- | --- | --- |
| Net sales FY 2025-26, bills, average bill | ₹1.67 Cr, 5,383, ₹3,108 | ₹1,67,28,634; 5,383; ₹3,107.68 | Reproduces |
| Monthly net sales (15 months) | as listed above | Same to ₹0.1 L (May 2026 is ₹12.95 L) | Reproduces |
| Stock | 13,354 pcs, ₹1.80 Cr cost, ₹3.04 Cr MRP | 13,354; ₹1,79,81,383; ₹3,03,57,010 | Reproduces |
| Stock by season year | 4.3, 6.7, 12.8, 22.7, 59.3, 74.0 (₹ L) | Same, all six | Reproduces |
| Never sold in 14 months | 6,892 SKUs, ₹1.41 Cr, 78% | 6,894 SKUs, ₹1,41,05,646, 78.4% | Reproduces within 2 SKUs |
| Dead, aging, new buckets | 2,431 / 1,998 / 2,463 SKUs | 2,430 / 1,998 / 2,466 | Reproduces within 3 SKUs |
| Jockey sales ÷ stock | ₹9.9 L on ₹4.0 L, 2.44× | Same | Reproduces |
| Whole store sales ÷ stock | ₹0.93 per ₹1 | 0.93 | Reproduces |
| 24 items with cost above MRP | 24 (33 pcs) | 24 (33 pcs); one more has cost equal to MRP | Reproduces |
| 3,007 season mismatches and their four-way split | 1,194 / 1,010 / 640 / 163 | Same | Reproduces |
| Average discount on sold items | 24% | 24.2% (lines sold at less than 100% discount, no carry bags) | Reproduces |
| Customers pay 67% of ticket value on average | 67% | 66.8% (net ÷ gross, all lines) | Reproduces |
| Bills with a phone | about 100% (5,381 of 5,383) | 2,805 of 5,383 (52%); 2,058 bills are customer `CASH` | Does not reproduce |
| Repeat customers | 53% (1,194 of 2,274) | 344 of 2,327 phones (15%) bought twice | Does not reproduce. Filling the phone down across bills gives 1,228 of 2,327 (53%); that is probably how the figure arose (guess). |
| "Repeat customers drive about 93% of sales" | 93% | 30% of phone-bill sales (74% with the fill-down) | Does not reproduce |
| Top 5% of customers | 21% of sales | 21.7% of phone-bill sales, 15% of all sales | Reproduces only on phone-bill sales |
| Discount split | ₹43 L markdown, ₹28 L gifts, ₹7.7 L returns (sum ₹78.7 L, not ₹83 L) | Gifts about ₹27 to 28 L at MRP; returns ₹7.66 L; line discounts on other non-bag sale lines ₹55.8 L | Gifts and returns reproduce; ₹43 L does not, and the parts do not add to ₹83 L |
| Price held by month | 86% (April), 60% (August) | Net ÷ gross: 78% and 57%; without gifts, bags and returns: 90% and 63% | Does not reproduce; definition not stated |
| Price held by salesperson | 78% best, 68% lowest | Net ÷ gross: 70% best, 65% lowest | Does not reproduce; definition not stated |
| "350 to 590 bills every month" | 350 to 590 | 245 (Oct) to 588 (Jul); Apr 340 and Oct 245 are below 350 | Does not reproduce |
| Units per bill | about 2.4 | 2.5 without carry bags (4.1 with them) | Close, not exact |
| "61% in styles that never sold" | 61% (₹1.10 Cr) | 43% by brand plus design number; the report does not define "style" | Not reproduced |
| Cost as 59% of MRP | 59% | 59.2% overall, but 67% without trolleys (MRP ₹9,999, cost about ₹804, sold as gifts) | Reproduces, but distorted |
| Van Heusen trolley "about 30 years to clear" | 377 pcs | Treats a gift item as slow stock | Misleading |

Cost-side figures (the standard cost estimate, the 41% mark-up wording) and the action estimates cannot be checked from the files.

## Open questions

Full list: [open-questions.md](../../data-notes/open-questions.md).

1. Does KDPS want any analyst threshold to become policy: the 14-month sold window, the 2024 / 2025 / 2026 buckets, 6 or more pieces as overstock, 3 to 4 turns a year, the brand labels? Owner: KDPS Owner (decides), product owner (records). None is signed. Blocks the dead-stock report (stage 3) and planning suggestions (stage 6, `POL-15.01`).
2. What do the month-year season tags mean: month of receipt or season launch? Why do some `Season` cells hold dates? Owner: KDPS Owner and Store staff. Ageing in the ERP needs a real receipt date.
3. Is `Rate` a landed cost, with or without GST, and does it change? Owner: Accounts and the CA.
4. What are trolleys, backpacks and bags with cost near 8% of MRP: gift-with-purchase items to be left out of dead-stock and margin figures? Owner: KDPS Owner.
5. Which POS produced these files and at what version? Owner: KDPS Owner.
6. Who cleaned `Sheet2` of the stock file, and does the 13,375 against 13,354 total mismatch mean anything? Owner: Vaishnavi Store, via the KDPS Owner.
7. Does the ERP need a "gift or promotional item" flag so dead stock, sell-through and margin can exclude gifts? Owner: product owner.
