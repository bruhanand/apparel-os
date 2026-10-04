# mufti

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [..](../README.md)

## What this folder is
- The Mufti June 2026 workbook (sales 1 to 18 Jun), one file for all of the brand's Stores, saved on 19 Jun 2026. It continues the May workbook in [2026-05/data](../../monthly-reports-april-may-2026/2026-05/data/README.md).
- Made by KDPS staff (the author is not named). Unlike Blackberry, there is no brand report, bill summary or brand stock list for Mufti in this folder.
- How June differs from May: the table in the [parent README](../README.md).
- Notes (not ranked): [offers-and-brand-reports.md](../../../data-notes/offers-and-brand-reports.md) for offers and brand reports; [pos-exports.md](../../../data-notes/pos-exports.md) for POS layouts; [stores-and-codes.md](../../../data-notes/stores-and-codes.md) for Store codes.

## Files

### `MUFTI_SALES_STOCK_DETAILS_JUNE2026.xlsx` (67,590 bytes)
Three sheets: `SALES`, `SOH`, `OFFER`. Saved 19 Jun 2026.

**`SALES`** (`A1:N90`, autofilter `A3:N89`, frozen at row 61)
- Rows 1 and 2 merged `A:N`: `KDPS LIFESTYLE PVT. LTD.` and `List of Sales Vouchers :  MUFTI (From 01-05-2026 To 31-05-2026)`. The title still says May although every line is dated in June. Row 3 is the header (no `Voucher Series` line).
- Row 3, 14 columns: `Date`, `Vch/Bill No`, `Particulars`, `Item Details`, `Brand`, `Size`, `Style Code`, `Barcode`, `Unit`, `Qty.`, `Price`, `Dis %`, `Dis Amt`, `Total`. The unlabeled POS columns of May (`P` to `R`) are gone.
- Data in rows 4 to 65: 62 lines. Rows 66 to 89 are blank. Row 90 is a totals row of `=SUM` formulas for `J`, `K`, `M`, `N` (saved results: quantity 56, `Price` 172,944, `Dis Amt` -48,297.50, `Total` 124,646.50).
- Totals: quantity 56 (three returns), `Price` ₹1,72,944, `Dis Amt` -₹48,297.50, `Total` ₹1,24,646.50.
- 38 bills, dates 1 to 18 Jun 2026 in date order. Bill series: `26-27/LEEDEO/n` (40 lines, 24 bills, numbers 435 to 544), `26-27/JSL/n` (10 lines, 8 bills, 1442 to 1721), `26-27/SAN/n` (10 lines, 5 bills, 2680 to 2963), `26-27/GAYA/n` (2 lines, one bill, number 591). `SAN` is new against May (which had `VAS`).
- `Particulars` `CASH`, `Unit` `PCS`, brand `MUFTI` on every line. Items: SHIRT 28, JEANS 23, T-SHIRT 8, TROUSER 3. Five lines carry the placeholder style `KDPS-DEGR-MF`.
- `Dis %`, `Dis Amt` and `Total` are typed values on every line (no formulas in the data rows). `Dis Amt` is negative for a discount (35 lines) and positive on one return line (+₹1,399.60); `Total` equals `Price` plus `Dis Amt`.
- **`Dis %` by period.** Before 12 Jun (35 lines, quantity 31, discount -₹20,978.80): 0 on 20 lines, 20 on 8, 100 on 5, 30 on 2. From 12 Jun (27 lines, quantity 25, discount -₹27,318.70): 25 on 8 lines, 0 on 6, 50 on 5, 100 on 4, 40 on 4.
  - The 100% lines (nine, `Total` 0, a shirt, jeans or T-shirt at ₹2,299 to ₹3,499) read as the free items of a buy-get offer (`B2 - G1` from 28 May, `B2 - G2` from 12 Jun in the `OFFER` sheet). Two of them sit on one bill (`26-27/LEEDEO/541`).
  - From 12 Jun the percentages 25 and 40 match `B1-25%` and `B2 - 40%` in the `OFFER` row 25. A 50% line is not in that text (OPEN).
  - Before 12 Jun the lines at 20% (8) and 30% (2) match no line of the `OFFER` calendar, which lists only `B2 - G1` for 28 May to 11 Jun (OPEN).
  - The three returns are `26-27/JSL/1482` and `26-27/LEEDEO/495` (both 0%) and `26-27/LEEDEO/537` (40%, positive `Dis Amt`).
- The June `SALES` lines' discounts look like POS bill values or the offer applied by hand (inferred); the file does not say.

**`SOH`** (`A1:K803`, autofilter `A4:J4`)
- Identical in every cell to the `SOH` sheet of the May file: rows 1 to 3 merged `A:J` (`KDPS LIFESTYLE PVT. LTD.`, `List of Stock Details`, `MUFTI (From 01-06-2026)`), header row 4 (`Date`, `Item Details`, `Barcode`, `Size`, `Style Code`, `Brand`, `Qty.`, `Unit`, `MRP`, `Total MRP`), column `K` an unlabeled Store tag.
- 798 rows (5 to 802), totals in row 803: quantity 1,179, `Total MRP` ₹37,30,221. `Date` 1 Jun 2026 on every row. Tags: `JSL` 389 rows (564 pieces, ₹16,60,036), `LEE DEO` 209 (307, ₹10,24,793), `GAYA` 117 (196, ₹6,91,904), `WH` 83 (112, ₹3,53,488). Items: JEANS 330, SHIRT 288, T-SHIRT 147, TROUSER 33. 56 rows carry the style `KDPS-DEGR-MF`.
- Because the sheet is the May list unchanged, all 57 distinct barcodes sold in June are still listed in it (two of them were also sold in May). It therefore shows a stock that is not reduced by the June sales and is not a June closing list.

**`OFFER`** (`A1:F25`)
- Header row 1: `Date `, `Offer`, `End Date`, an empty `D`, `Brand `, `Store`. Rows 2 to 23 are the same as the May file (the full table is in [2026-05/data](../../monthly-reports-april-may-2026/2026-05/data/README.md)): the 2025 and 2026 offer calendar from `BUY 7999GET 1000 OFF` (14 Mar 2025) to the slab line of 13 Mar to 27 May 2026. `Brand` and `Store` (`MUFTI`; `Ratu`, `Lee`, `Jainsons`) are filled on rows 2 to 4 only.
- Row 24: 28 May 2026, `B2 - G1`, now with an end date of 11 Jun 2026 (empty in May).
- Row 25 (new): 12 Jun 2026, `B2 - G2 / B2 - 40% / B1-25%`, no end date.
- `G` reads as "get free": `B2 - G2` is buy two, get two (guess).
- **Sensitive content.** None. No customer fields exist in this workbook.

## Subfolders
None.

## Open questions
Full list goes to [open-questions.md](../../../data-notes/open-questions.md).
1. What is the stock date meant to be, and where is Mufti's real June stock list (the `SOH` is May's)? Owner: Accounts (P-ACC).
2. Which offers explain the 20% and 30% lines before 12 Jun and the 50% lines from 12 Jun? Owner: Brand manager (P-BRM).
3. What does the placeholder style `KDPS-DEGR-MF` stand for (5 sales lines here, 56 stock rows)? Owner: KDPS Owner (P-OWN).
4. Why does the `SALES` title still say May, and should the period be the month or the data cut-off? Owner: Accounts.
5. Does `B2 - G2` mean buy two get two free, and how are the free items chosen? Owner: Brand manager and the brand.
