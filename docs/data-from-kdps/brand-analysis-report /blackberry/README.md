# blackberry

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [..](../README.md)

## What this folder is
- Blackberry June 2026 (1 to 18 Jun): the monthly workbook in KDPS's report layout, and the brand's stock list for KDPS (`KDPS LIFE.xlsx`) with an offer tag on every barcode.
- The workbook was saved on 19 Jun 2026; `KDPS LIFE.xlsx` was created on 11 Jun 2026 (internal dates). Both are the brand's and KDPS's working files; their authors are not named.
- How June differs from May: tables in the [parent README](../README.md) and the May file in [2026-05/data](../../monthly-reports-april-may-2026/2026-05/data/README.md).
- Notes (not ranked): [offers-and-brand-reports.md](../../../data-notes/offers-and-brand-reports.md) for offers, the AMM list and brand reports; [pos-exports.md](../../../data-notes/pos-exports.md) for POS layouts; [stores-and-codes.md](../../../data-notes/stores-and-codes.md) for Store codes.

## Files

### `BLACKBERRY_SALES_STOCK_DETAILS_JUNE2026.xlsx` (68,198 bytes)
Five sheets: `SALES`, `SOH`, `OFFER`, `BRAND REPORT`, `BILL SUMMARY`. Saved 19 Jun 2026.

**`SALES`** (`A1:N98`, autofilter `A4:N4`, frozen at row 65)
- Rows 1 to 3 merged `A:N`: `KDPS LIFESTYLE PVT. LTD.`, `List of Sales Vouchers`, `Voucher Series : BLACKBERRY (From 01-06-2026 to 30-06-2026)`. The header says to 30 Jun; data stops at 18 Jun.
- Row 4, 14 columns: `Date`, `Vch/Bill No`, `Particulars`, `Item Details`, `Brand`, `Size`, `Style Code`, `Barcode`, `Unit`, `Qty.`, `MRP`, `Dis %`, `Dis Amount`, `Total`. No columns after `N` (the unlabeled POS columns of May are gone).
- Data in rows 5 to 81: 77 lines. Rows 82 to 97 are blank formatted rows. Row 98 is a totals row of `=SUM` formulas for `J`, `K`, `M`, `N` (the file holds no saved result for them, so a viewer that does not recalculate shows blanks).
- Totals (computed): quantity 71 (three returns), `MRP` ₹1,92,149, `Dis Amount` -₹47,516.15, `Total` ₹1,44,632.85.
- 36 bills: `26-27/GAYA/561` upwards (76 lines) and one line of `26-27/JSL/1668`. Dates 1 to 18 Jun 2026, in date order. 16 bills before 12 Jun and 20 from 12 Jun.
- `Particulars` `CASH` on all lines, `Unit` `PCS`, barcodes 13-digit numbers. Brand spelling: `BLACKBERRYS` 58 lines, `BLACKBERRY` 19. Items: TROUSER 32, SHIRT 28, T-SHIRT 8, DUFFEL BAG 3, JEANS 2, BELTS 1, BELT 1, SOCKS 1, BLAZER 1.
- `Dis %`, `Dis Amount` and `Total` are typed values on every line (no formulas). `Dis Amount` is negative on a sale (34 lines) and positive on one return line (+₹1,599.50); `Total` equals `MRP` plus `Dis Amount`. The first rows of June (before 12 Jun) have `Dis %` 0 on all 35 lines; the only discounts then are the three duffel-bag lines (MRP 3,499, `Dis Amount` -3,300, `Total` 199, `Dis %` 0).
- From 12 Jun (42 lines): `Dis %` 50 on 19 lines, 40 on 11, 30 on one, 25 on one, 0 on 10.
- Where the typed discounts come from is not stated. They look like the POS bill values (inferred); the May file kept the POS columns beside a zero `Dis %`.

**`SOH`** (`A1:J806`, autofilter `A4:J462`)
- Rows 1 to 3 merged `A:J`: `KDPS LIFESTYLE PVT. LTD`, an address line of KDPS's Deoghar head office (not copied), `List of Stock Details`. No `Voucher Series` line, no Store column.
- Row 4: `Date`, `Item Details`, `Barcode`, `Size`, `Style Code`, `Brand`, `Qty.`, `MRP`, `Unit`, `Total MRP` (`MRP` and `Unit` swapped against the April and May files).
- 801 rows (5 to 805). `Total MRP` is `=G*H` with no saved value. Row 806 sums `G` only (quantity 1,172); there is no `Total MRP` total. Computed: MRP value ₹42,34,150.
- `Date` is 1 Apr 2026 on every row (not June). `Brand` is `BLACKBERRYS` on every row. `Unit` `PCS`.
- Items: TROUSER 270, SHIRT 264, T-SHIRT 133, BLAZER 48, SUIT 31, JEANS 27, SHOES 6, BELTS 6. Quantity per row: 1 (503 rows), 2 (267), 3 (21), 4 (4), 5 (4), 28 (1). 87 rows repeat a barcode that is on another row.
- Against May's `SOH`: 714 distinct barcodes here against 891 in May; 649 in both; 65 only in June; 242 May barcodes missing; 96 shared barcodes with a different quantity.
- Against the June sales: all 71 distinct barcodes sold in June are in May's `SOH`; 52 of them are in this June `SOH`.

**`OFFER`** (`A2:B14`, no header row)
- Rows 2 to 12 are identical to the May file: the "Promo Offers for Fresh MRP sale" list and the promo slabs for new duffel bags and trolleys: shop for ₹6,999 get ₹600 off (excluding footwear, suits, blazers, zipper jackets; remark "In case of unavailability of Duffle Bag"); ₹10,999 get ₹1,000 off (all except suits); ₹14,999 get ₹1,500 off; ₹19,999 get ₹2,000 off (remark "In case of unavailability of Trolley Bag"); shop for ₹6,995 get a duffel bag worth ₹2,995 at ₹99 (excluding AFI and S&J; "As per availability."); shop for ₹22,999 get a trolley worth ₹7,995 at ₹399 (all categories; "As per availability."); then percentage lines `BUY 1 @ 20% OFF / BUY 2 OR MORE @ 30% OFF` (12/12 to 16/12), `BUY 1 - 20% / BUY 2 -  30% / BUY 3 - 40%` (17/12 to 22/01) and `BUY 1 - 30% / BUY 2 -  40% / BUY 3 - 50%` (23/01 to 15/02). Years are not written (inferred 2025 and 2026).
- Row 13: the slab line `BUY 6999/- GET 600/- OFF, BUY 10999/- GET 1000/- OFF, BUY 14999/- GET 1500/- OFF, BUY 19999/- GET 2000/- OFF, BUY 22999/- GET TROLLY FOR 399/-`. Remark now `Start Date 16/02 -  End Date 11/06` (May: open).
- Row 14 (new): `B1 - 30% / B2 & B3 - 40% / B4 & MORE - 50% / 25%  - 40 % ON WAIST COAT, SUIT AND BLAZER (AMM LIST)`, remark `Start Date 12/06 - End Date ` (no end date).
- "AMM LIST" appears in the offer text itself, so here AMM names a brand list that decides which items the percentage applies to. What the letters stand for is not given (OPEN).

**`BRAND REPORT`** (`A1:M82`, frozen at row 5, no autofilter)
- `A1`: `BLACKBERRYS — BRAND SALES REPORT (June 2026, 1–18)`. `A2`: `Discounts reconstructed from OFFER sheet + AMM list. Duffel bills → bag is the discount; non-duffel ≥₹6999 → cash-off; from 12-Jun → AMM per-item %.` Row 3 empty. Row 4 headers (13): `Date`, `Bill No`, `Item`, `Brand`, `Size`, `Style Code`, `Barcode`, `Qty`, `MRP`, `Offer Applied`, `Final Dis %`, `Final Dis Amt`, `Final Total`.
- Rows 5 to 81: 77 lines, in the same order as `SALES` with the same barcodes and `MRP`. Row 82 is a totals row: `I82` ₹1,92,149 (`MRP`), `J82` `TOTALS →`, `L82` -₹54,692.40, `M82` ₹1,37,456.60. All cells are typed values (no formulas); the method is not in the file. Brand `BLACKBERRYS` on every line.
- **`Offer Applied` labels** (lines):

| Label | Lines | `MRP` | `Final Dis Amt` | Meaning (inferred from the sheet) |
| --- | --- | --- | --- | --- |
| `Full MRP` | 22 | ₹42,024 | 0 | No offer applies to the line |
| `Full MRP (bag taken)` | 8 | ₹22,754 | 0 | Line on a bill where the duffel-bag offer was taken |
| `Duffel @₹199` | 3 | ₹10,497 | -₹9,900 | The duffel-bag line itself, billed at ₹199 |
| `Buy ₹6999 → ₹600 off` | 1 | ₹3,199 | -₹600 | Cash-off slab booked on one line (`Final Dis %` 18.76) |
| `Buy ₹10999 → ₹1000 off` | 1 | ₹3,999 | -₹1,000 | Cash-off slab booked on one line (`Final Dis %` 25.01) |
| `B-tier 30%` | 6 | ₹9,832 | -₹2,949.60 | Tier for one qualifying piece on the bill (from 12 Jun) |
| `B-tier 40%` | 19 | ₹49,397 | -₹19,758.80 | Tier for two or three qualifying pieces |
| `B-tier 50%` | 13 | ₹36,169 | -₹18,084.50 | Tier for four or more qualifying pieces |
| `FLAT 25%` | 2 | ₹9,598 | -₹2,399.50 | A flat 25% for items the brand tags `FLAT 25%` in `KDPS LIFE.xlsx` (a jacket and socks here) |
| `Fresh – No Discount` | 2 | ₹4,680 | 0 | Items the brand tags `Fresh` |

- **How the reconstruction reads.**
  - Bills with a duffel bag (`26-27/GAYA/564`, `585`, `626`): the bag line is billed at ₹199 (discount ₹3,300 on MRP 3,499) and the other lines stay at full MRP.
  - Bills of ₹6,999 and above without a bag, before 12 Jun (`582` at ₹8,557, `589` at ₹11,496): the slab cash-off of ₹600 or ₹1,000 is booked on one line, the one that carries the tier tag in `KDPS LIFE.xlsx`; the others stay at full MRP (inferred).
  - From 12 Jun: the tier follows the number of qualifying pieces on the bill: 1 gives 30%, 2 or 3 give 40%, 4 or more give 50% (the `OFFER` row 14). A qualifying piece is one with the tier tag in `KDPS LIFE.xlsx`; `Fresh` pieces get nothing; `FLAT 25%` pieces get 25% (inferred).
  - A return line carries the same percentage with a positive discount (`26-27/GAYA/687`: one sale and one return, flagged `exchange/return`); `26-27/GAYA/593` is two sales and two returns of the same items and nets to 0.
- **Against `SALES`.** Reconstructed net ₹1,37,456.60 against ₹1,44,632.85 in `SALES`, a difference of ₹7,176.25. 17 of 77 lines differ in discount: 11 lines are billed at 0% where the report applies an offer (two cash-off lines before 12 Jun; nine from 12 Jun, namely eight tier lines and one 25% sock line), and 6 lines on `26-27/GAYA/678` and `26-27/GAYA/687` (18 Jun) are billed at 50% where the report applies 40% (three lines), 30% (two lines, one a return) or none (one `Fresh` shirt).
- **Who made it.** Not stated. The wording ("reconstructed") and the typed values point to an analyst's working sheet, so the rules in it are an analyst's reading, not a KDPS decision.

**`BILL SUMMARY`** (`A1:H40`, frozen at row 4)
- `A1`: `BLACKBERRYS — BILL-WISE SUMMARY (June 2026)`. Row 3 headers (8): `Date`, `Bill No`, `Lines`, `Gross MRP`, `Offer Applied`, `Total Discount`, `Net Sale`, `Flags`. Rows 4 to 39: 36 bills (77 lines, one row per bill). Row 40: `TOTAL` with `Gross MRP` ₹1,92,149, `Total Discount` -₹54,692.40, `Net Sale` ₹1,37,456.60. All typed values.
- `Offer Applied` per bill: `No offer` 11 bills, `B-tier 40% (2 qualifying)` 8, `B-tier 30% (1 qualifying)` 5, `Duffel bag offer` 3, `FLAT % (AMM)` 2, `B-tier 50% (4 qualifying)` 2, and one bill each of `Buy ₹6999 → ₹600 off`, `Buy ₹10999 → ₹1000 off`, `B-tier 50% (5 qualifying)`, `B-tier 40% (3 qualifying)` and `Fresh – No Discount`.
- `Flags`: one bill (`26-27/GAYA/687`) says `exchange/return`. `26-27/GAYA/593` shows `Gross MRP` 0 (four lines that cancel). The `Lines` count includes the pieces that do not qualify (for example `B-tier 40% (3 qualifying)` on a four-line bill that holds a `Fresh` shirt).
- **Sensitive content.** None. No customer fields exist in this workbook.

### `KDPS LIFE.xlsx` (77,730 bytes)
- **What it is.** The brand's list of KDPS's Blackberry stock, one row per barcode, with the brand's own item and category codes and an `Offer` tag. The `Dealer Name` is `KDPS LIFE` and a single dealer code repeats on every row (probably KDPS's dealer ID in the brand's system; not copied). Created 11 Jun 2026; the creator is a person named in the file properties (not copied). The file looks like the brand's output sent to KDPS (guess).
- **Sheet `Sheet1`** (`A1:O908`): 907 data rows, 888 distinct barcodes (19 rows repeat a barcode). Header row 1, 15 columns:

| Col | Header | Content |
| --- | --- | --- |
| A | `EanNo` | 13-digit barcode (number) |
| B | `SOH F` | Stock figure for the row: 1 (543 rows), 2 (312), 3 (44), 4 (7), 5 (1); total 1,332 |
| C | `Item No` | The brand's item code (268 distinct, such as `MS014469C1`) |
| D | `Size` | 13 sizes: 42 (149 rows), 40 (139), 38 (133), 34 (92), 44 (86), 32 (79), 39 (76), 36 (76), 30 (61), 46 and 45 (5 each), 43 and 41 (3 each) |
| E | `Description` | Style name and colour joined by `#` (266 distinct, such as `BP-P1-SO-SYLVIA#Chocolate Sauce`) |
| F | `Sub-Category` | FORMAL SHIRTS 243, FORMAL TROUSER 173, CASUAL TROUSER 159, CASUAL SHIRTS 113, TSHIRTS 91, JACKETS 51, SUITS 39, DENIM 16, FOOTWEAR 9, BELTS 8, SOCKS 5 |
| G | `Category` | 20 two-letter codes: `MS` 226, `DL` 167, `EK` 150, `ES` 111, `ET` 91, `CJ` 48, `CP` 39, `NS` 17, `ED` 15, `BT` 8, `FD` 6, `ND` 6, `SC` 5, `NK` 4, `FO` 3, `RK` 3, `EJ` 3, `US` 2, `UT` 2, `UD` 1 |
| H | `R/F` | `FASHION` 859, `ROC` 48 (the meaning of `ROC` is not given) |
| I | `Category-Co` | Same as `Sub-Category`, except belts (8) and socks (5) become `ACCESSORIES` |
| J | `MRP` | 39 values from ₹599 to ₹19,799 (₹2,625 on 139 rows, ₹3,199 on 97, ₹2,399 on 82) |
| K | `Season` | `SS26` 519, `AW25` 298, `AW26` 38, `AW23` 17, `SS25` 8, `AW21` 8, `AW22` 8, `AW24` 4, `AW20` 4, `SS22` 2, `AW19` 1 |
| L | `Wizapp Code` | One constant dealer code on every row (not copied) |
| M | `Dealer Name` | `KDPS LIFE` on every row |
| N | `State` | Blank on every row |
| O | `Offer` | The offer tag, below |

- **`Offer` tags.**

| Tag | Rows | Pieces (`SOH F`) | MRP value | Items |
| --- | --- | --- | --- | --- |
| `B1-30%, B2&3- 40%, B4 & MORE 50%` | 660 | 995 | ₹27,10,815 | formal shirts 193, formal trousers 136, casual trousers 136, T-shirts 91, casual shirts 88, denim 16 |
| `Fresh` | 184 | 246 | ₹12,61,920 | formal shirts 50, formal trousers 37, suits 26, casual shirts 25, casual trousers 23, jackets 21, socks 2 (seasons `SS26` 89, `AW26` 38, `AW25` 33, `AW23` 11, `SS25` 8, `AW20` 4, `AW21` 1) |
| `FLAT 25%` | 58 | 85 | ₹6,58,615 | jackets 27, suits 11, footwear 9, belts 8, socks 3 (all `SS26`) |
| `FLAT 40%` | 5 | 6 | ₹54,746 | jackets 3, suits 2 (seasons `AW21` and `AW22`) |

  The total stock figure is 1,332 pieces and the MRP value ₹46,86,096.
- **Links to other files.**
  - It matches the May `SOH` file on all 888 distinct barcodes and their quantities (1,332 pieces). The May `SOH` has 3 more barcodes (31 more pieces) that are not listed. So it is the stock as at about 1 Jun, not the June `SOH` of the June workbook: only 646 of the list's 888 barcodes are in that `SOH`, 242 are not, and 68 barcodes of that `SOH` are not in the list.
  - 74 of the 77 June sale lines (by barcode) are in it. Their tags: tiered 64 lines, `Fresh` 6, `FLAT 25%` 4. Three lines are not listed.
  - From 12 Jun, 38 sold lines have the tier tag; 8 of them were billed with no discount. Before 12 Jun, 26 sold lines (24 sales and two returns) have the tier tag and none carries a discount, as the tiers began on 12 Jun.
  - Its `Offer` tags are the "AMM list" of the Blackberry `OFFER` row 14 in everything but name (inferred): tier items, `FLAT 25%` items, and a `Fresh` group with no offer.
- **Quirks.** Barcodes repeat on 19 rows; `State` is empty; some categories are spelled differently between `Sub-Category` and `Category-Co`.
- **Notes.** [offers-and-brand-reports.md](../../../data-notes/offers-and-brand-reports.md).

## Subfolders
None.

## Open questions
Full list goes to [open-questions.md](../../../data-notes/open-questions.md).
1. What does AMM stand for in the brand's offer text, and is the `Offer` column of `KDPS LIFE.xlsx` the brand's AMM list for Blackberry? Who maintains it and how often is it sent? Owner: Brand manager (P-BRM) and KDPS Owner (P-OWN).
2. What do `ROC`, `R/F` and `SOH F` mean in `KDPS LIFE.xlsx`? Owner: Brand manager.
3. Who builds the `BRAND REPORT` and `BILL SUMMARY`, and are the tier counts, cash-off placement and `FLAT 25%` rule as the brand states them? Owner: KDPS Owner and the brand.
4. Why does the June `SOH` carry 1 Apr 2026 dates and a shorter list than May? Which stock date should the report use? Owner: Accounts (P-ACC).
5. The duffel bag is billed at ₹199, the `OFFER` text says ₹99. Which is right, and who funds the difference? Owner: Brand manager and Accounts.
6. Are `AFI` and `S&J` brand or format names excluded from the duffel-bag offer? Owner: Brand manager.
