# data

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [..](../README.md)

## What this folder is
- The May 2026 reports for two brands, Blackberry and Mufti, each one workbook that covers all of the brand's Stores (the "4 Stores to 1 report" and "3 Stores to 1 report" lines of the notebook photo, see the [parent README](../../README.md)). Saved 2 Jun 2026 (internal save dates 1 Jun 2026).
- Each workbook has three sheets: `SALES` and `SOH` (the report layout of `FORMAT_SALES_VOUCHERS.xlsx`, with changes) and `OFFER` (the brand's offer calendar copied in as a reference). Offers are not yet applied: `Dis %` is 0 on every line.
- Made by KDPS staff (the author is not named). June versions of the same two workbooks are in [brand-analysis-report](../../../brand-analysis-report%20/README.md); they show what changed next.
- Notes (not ranked): [offers-and-brand-reports.md](../../../../data-notes/offers-and-brand-reports.md) for the offers and brand reports; [pos-exports.md](../../../../data-notes/pos-exports.md) for the earlier POS layouts the `SALES` lines come from; [stores-and-codes.md](../../../../data-notes/stores-and-codes.md) for the Store codes.

## Files

### `BLACKBERRY_SALES_STOCK_DETAILS_MAY2026.xlsx` (85,969 bytes)
- **Brand and Stores.** Blackberry (written `BLACKBERRYS`, `BLACKBERRY` and `BLACK BERRY`). Bill series `26-27/GAYA/n` (133 lines) and `26-27/JSL/n` (4 lines) in `SALES`. In `SOH` the Stores are tags `GAYA`, `JSL`, `VAS-DEO` and the warehouse `WH`. Gaya and JSL (Jainsons, Hazaribagh) are read as Stores from the codes (inferred); see [stores-and-codes.md](../../../../data-notes/stores-and-codes.md).
- **Sheet `SALES`** (`A1:R142`, autofilter `A4:N142`, frozen at row 74).
  - Rows 1 to 3 merged `A:N`: `KDPS LIFESTYLE PVT. LTD.`, `List of Sales Vouchers`, `Voucher Series : BLACKBERRY (From 01-05-2026 to 31-05-2026)` (lowercase "to" and one space before the bracket, unlike the April files).
  - Row 4 headers: `Date`, `Vch/Bill No` (no dot, unlike the April files), `Particulars`, `Item Details`, `Brand`, `Size`, `Style Code`, `Barcode`, `Unit`, `Qty.`, `MRP` (the April files say `Price`), `Dis %`, `Dis Amount` (April: `Dis `), `Total`.
  - Column `O` is empty. Columns `P`, `Q`, `R` have no header; they hold, line by line, the POS discount percentage, the POS discount amount (negative) and the POS net amount.
  - Data in rows 5 to 141: 137 lines; totals in row 142 (`=SUM` of `J`, `K`, `M`, `N`). `Dis %` is 0 on every line; `Dis Amount` is `=L/100*K` and `Total` is `=K-M`.
  - Totals: quantity 120 (nine returns of -1), `MRP` ₹3,91,807, `Dis Amount` 0, `Total` ₹3,91,807. The POS columns total: discount -₹41,191.95, net ₹3,50,615.05.
  - 78 bills; 36 of them have more than one line. `Particulars` `CASH` on all lines, `Unit` `PCS`, barcodes 13-digit.
  - **Dates.** 20 Apr to 22 May 2026, in date order. 52 lines are dated 20 to 30 Apr (bills `26-27/GAYA/217` to `26-27/GAYA/360`) and 85 lines 1 to 22 May, although the header covers 1 to 31 May and no line is later than 22 May. Bill numbers run `26-27/GAYA/217` to `26-27/GAYA/520` and `26-27/JSL/693` to `26-27/JSL/923`.
  - Brand spelling: `BLACKBERRYS` 108 lines, `BLACKBERRY` 29. Items: SHIRT 51, TROUSER 46, T-SHIRT 13, DUFFEL BAG 11, BLAZER 9, JEANS 5, BELTS 2.
  - **POS discounts.** POS `Disc%` is 0 on 136 lines and 5 on one. The POS discount amounts are flat: 110 lines have none; others show -₹3,300 (9 lines), -₹300 (6), -₹600 (4), -₹200 (4), -₹2,956 (2) and single lines of -₹179.95 and -₹400. The 11 `DUFFEL BAG` lines (nine `DUFFLE BAG- STONE GREY` at MRP 3,499 and two `BG000055A1` at MRP 3,155) are billed at a net of ₹199 each. The `OFFER` sheet text says a duffel bag "AT Rs. 99/-" (see below); the sales show ₹199 (OPEN).
- **Sheet `SOH`** (`A1:K916`, autofilter `A4:J462`).
  - Rows 1 to 3 merged `A:J`: `KDPS LIFESTYLE PVT. LTD` (no final full stop), an address line of KDPS's Deoghar head office (not copied), `List of Stock Details`. There is no `Voucher Series` line.
  - Row 4: `Date`, `Item Details`, `Barcode`, `Size`, `Style Code`, `Brand`, `Qty.`, `Units` (plural, unlike April), `MRP`, `Total MRP`. Column `K` has no header and holds a Store tag.
  - 911 rows (5 to 915); totals in row 916 (`G` and `J`): quantity 1,363, `Total MRP` ₹48,41,751. `Total MRP` is `=I*G`. `Date` is 1 Jun 2026 on every row (the day after May, so a closing stock date). The autofilter stops at row 462 although data runs to row 915.
  - Tags (column `K`): `GAYA` 826 rows, quantity 1,252, MRP value ₹39,45,022; `JSL` 55 rows, 73, ₹7,53,555; `WH` 18 rows, 23, ₹95,885; `VAS-DEO` 12 rows, 15, ₹47,289.
  - Brand spelling: `BLACKBERRYS` 665 rows, `BLACKBERRY` 232, `BLACK BERRY` 14. Items: SHIRT 356, TROUSER 326, T-SHIRT 91, BLAZER 51, SUIT 39, JEANS 16, SHOES 9, BELTS 6. Quantity per row: 1 (544 rows), 2 (312), 3 (45), 4 (7), 5 (1), 11 (1). 20 barcodes appear on more than one row (the same piece code at another location).
  - Style codes use the brand's pattern (for example prefixes `BP-`, `EK`, `NL-`, `ES-`, `ET-`), and some are long internal codes. No placeholder style code appears.
- **Sheet `OFFER`** (`A2:B13`, no header row). Text of the brand's promotion list, quoted from the file:

| Row | Text in `A` | Remark in `B` |
| --- | --- | --- |
| 2 | `Promo Offers for Fresh MRP sale.` | |
| 3 | `ITEM PROMO SLAB for New Duffle bags & Trolleys` | `Remarks` |
| 4 | `SHOP FOR RS. 6999/- AND GET RS. 600/ OFF (EXCLUDING FOOTWEAR, SUITS, BLAZERS, ZIPPER JACKETS)` | `In case of unavailability of Duffle Bag` |
| 5 | `SHOP FOR RS. 10999/- AND GET RS. 1000/ OFF (Including all categories Except Suits)` | |
| 6 | `SHOP FOR RS. 14999/- AND GET RS. 1500/ OFF (Including all categories)` | |
| 7 | `SHOP FOR RS. 19999/- AND GET RS. 2000/ OFF (Including all categories)` | `In case of unavailability of Trolley Bag` |
| 8 | `SHOP FOR Rs. 6995/- AND GET DUFFEL BAG of Rs. 2995/- AT Rs. 99/- (EXCLUDING AFI AND S&J)` | `As per availability.` |
| 9 | `SHOP FOR RS. 22999/- AND GET TROLLEY WORTH RS. 7995/- AT RS. 399/- (INCLUDING ALL CATEGORIES)` | `As per availability.` |
| 10 | `BUY 1 @ 20% OFF / BUY 2 OR MORE @ 30% OFF` | `Start Date 12/12 - End Date 16/12` |
| 11 | `BUY 1 - 20% / BUY 2 -  30% / BUY 3 - 40%` | `Start Date 17/12 - End Date 22/01` |
| 12 | `BUY 1 - 30% / BUY 2 -  40% / BUY 3 - 50%` | `Start Date 23/01 - End Date 15/02` |
| 13 | `BUY 6999/- GET 600/- OFF, BUY 10999/- GET 1000/- OFF, BUY 14999/- GET 1500/- OFF, BUY 19999/- GET 2000/- OFF, BUY 22999/- GET TROLLY FOR 399/-` | `Start Date 16/02` |

  The dates in `B` carry no year; the order suggests 12 Dec 2025 to 16 Feb 2026 onward (inferred). Row 13 has no end date in this May file. The text is the brand's wording ("Fresh MRP" and "AFI", "S&J" are not explained: OPEN).
- **Used by.** Evidence for the Blackberry report layout and offer calendar; no April equivalent.

### `MUFTI_SALES_STOCK_DETAILS_MAY2026.xlsx` (66,433 bytes)
- **Brand and Stores.** Mufti. Four Stores in `SALES` by bill series: `26-27/LEEDEO/n` (31 lines), `26-27/JSL/n` (7), `26-27/VAS/n` (6), `26-27/GAYA/n` (4). In `SOH` the tags are `JSL`, `LEE DEO`, `GAYA` and the warehouse `WH`.
- **Sheet `SALES`** (`A1:R52`, autofilter `A3:N51`, frozen at row 4).
  - Rows 1 and 2 merged `A:N`: `KDPS LIFESTYLE PVT. LTD.` and `List of Sales Vouchers :  MUFTI (From 01-05-2026 To 31-05-2026)` (the brand and period sit in the title, with no `Voucher Series` line). Row 3 is the header (this file has no third title row).
  - Headers: `Date`, `Vch/Bill No`, `Particulars`, `Item Details`, `Brand`, `Size`, `Style Code`, `Barcode`, `Unit`, `Qty.`, `Price`, `Dis %`, `Dis Amt`, `Total`. Column `O` is empty; `P`, `Q`, `R` have no header and hold the POS discount percentage, discount amount and net amount.
  - Data in rows 4 to 51: 48 lines; totals in row 52 for `J`, `K` and `N` only (no `Dis Amt` total). `Dis %` is 0 on every line; `Dis Amt` is `=L/100*K` and `Total` is `=K-M`.
  - Totals: quantity 44 (two returns), `Price` ₹1,34,556, `Total` ₹1,34,556. POS columns: discount -₹7,187.45, net ₹1,27,368.55.
  - 42 bills (four with more than one line). Dates 2 to 31 May 2026, mostly in date order (not strictly). Bill numbers `26-27/LEEDEO/244` to `26-27/LEEDEO/433`, `26-27/JSL/939` to `26-27/JSL/1318`, `26-27/VAS/214` to `26-27/VAS/300`, `26-27/GAYA/433` to `26-27/GAYA/558`.
  - Brand `MUFTI` on all lines. Items: SHIRT 22, JEANS 14, T-SHIRT 11, TROUSER 1.
  - POS `Disc%`: 0 on 38 lines, 20 on seven, 5 on three. POS discount amounts: 35 lines none; 5% lines -₹129.95 (two) and -₹224.95; 20% lines -₹299.80 to -₹699.80; flat amounts of -₹2,000 and -₹1,000 (one line each, slab offers) and -₹5 on one line.
  - Six lines carry the style `KDPS-DEGR-MF` (jeans 3, shirts 2, T-shirt 1), which is not in the brand's code pattern (`MFS-`, `MFT-`, `MFK-` plus a number and `-W`). Its meaning is unknown (OPEN).
- **Sheet `SOH`** (`A1:K803`, autofilter `A4:J4`).
  - Rows 1 to 3 merged `A:J`: `KDPS LIFESTYLE PVT. LTD.`, `List of Stock Details`, `MUFTI (From 01-06-2026)` (no `Voucher Series :` prefix). Row 4: `Date`, `Item Details`, `Barcode`, `Size`, `Style Code`, `Brand`, `Qty.`, `Unit`, `MRP`, `Total MRP`. Column `K` has no header and holds a Store tag.
  - 798 rows (5 to 802); totals in row 803: quantity 1,179, `Total MRP` ₹37,30,221 (`=G*I`). `Date` 1 Jun 2026 on every row.
  - Tags: `JSL` 389 rows, quantity 564, MRP value ₹16,60,036; `LEE DEO` 209 rows, 307, ₹10,24,793; `GAYA` 117 rows, 196, ₹6,91,904; `WH` 83 rows, 112, ₹3,53,488. Items: JEANS 330, SHIRT 288, T-SHIRT 147, TROUSER 33. Quantity per row: 1 (498 rows), 2 (245), 3 (37), 4 (13), 6 (3), 5 (2).
  - 203 barcodes appear on more than one row (429 rows, up to three rows each), the same piece code held at several locations. 56 rows carry the placeholder style `KDPS-DEGR-MF` (jeans 25, shirts 16, T-shirts 15; mostly at `JSL`, 42 rows).
- **Sheet `OFFER`** (`A1:F24`). Header row: `Date `, `Offer`, `End Date`, an empty `D`, `Brand `, `Store` (trailing spaces as in the file). The offer calendar, 23 lines (the `Brand` and `Store` columns are filled on the first three lines only):

| Row | Start | Offer text | End | Brand, Store |
| --- | --- | --- | --- | --- |
| 2 | 14 Mar 2025 | `BUY 7999GET 1000 OFF` | 23 May 2025 | `MUFTI`, `Ratu` |
| 3 | 14 Mar 2025 | `BUY 12999GET 2000 OFF` | 23 May 2025 | `MUFTI`, `Lee` |
| 4 | 14 Mar 2025 | `BUY 17999GET 3000 OFF` | 23 May 2025 | `MUFTI`, `Jainsons` |
| 5 | 23 Apr 2025 | `B-2-g1` | 11 Jun 2025 | |
| 6 | 12 Jun 2025 | `B3-G3` | 4 Jul 2025 | |
| 7 | 12 Jun 2025 | `B1-25%` | 4 Jul 2025 | |
| 8 | 12 Jun 2025 | `B2-40%` | 4 Jul 2025 | |
| 9 | 5 Jun 2025 | `B1-G1` | 7 Jul 2025 | |
| 10 | 5 Jun 2025 | `B1-30%` | 17 Jul 2025 | |
| 11 | 18 Jul 2025 | `flat -50%` | 20 Aug 2025 | |
| 12 | 5 Sep 2025 | `BUY 7999GET 1000 OFF` | 5 Nov 2025 | |
| 13 | 5 Sep 2025 | `BUY 12999GET 2000 OFF` | 5 Nov 2025 | |
| 14 | 5 Sep 2025 | `BUY 17999GET 3000 OFF` | 5 Nov 2025 | |
| 15 | 6 Nov 2025 | `flat10% on 7999` | 26 Nov 2025 | |
| 16 | 6 Nov 2025 | `flat15% on 15999` | 26 Nov 2025 | |
| 17 | 27 Nov 2025 | `Black Friday Offer B2G1` | 27 Nov 2025 | |
| 18 | 28 Nov 2025 | `Black Friday Offer B2G40, B1G20` | 30 Nov 2025 | |
| 19 | 1 Dec 2025 | `1-10% / 2-20% / 3-30%` | 10 Dec 2026 (as stored; likely a typing slip for 2025) | |
| 20 | 11 Dec 2025 | `1-25% / 2-40% / 4-50%` | 31 Dec 2025 | |
| 21 | 1 Jan 2026 | `B1 25% / B2 50%` | 21 Jan 2026 | |
| 22 | 22 Jan 2026 | `Flat -50%` | 22 Feb 2026 | |
| 23 | 13 Mar 2026 | `Purchase for 7999/- and get 1000/- off  Purchase for 12999/- and get 2000/- off Purchase for 17999/- and get 3000/- off` | 27 May 2026 | |
| 24 | 28 May 2026 | `B2 - G1` | none | |

  - Reading: `B` is buy, `G` is get free (`B2-G1` is buy two, get one); `B1-25%` is 25% on the first piece, and so on (guess; the brand's exact terms are not in the file).
  - Several lines overlap in time (rows 5 to 10 in June 2025). Which offer applies at the till on an overlap is not stated (OPEN); see `PRD-OFR-021` in [prd.md](../../../../prd.md) for the PRD's rule.
  - Rows 23 and 24 are the May offers: the slab offer to 27 May and `B2 - G1` from 28 May. They match photo 1 in the parent folder ([README](../../README.md)).
  - The `Store` names `Ratu`, `Lee`, `Jainsons` against the first three lines are not explained (a Store per slab, or the Stores where the offer ran: OPEN).
- **Used by.** Evidence for the Mufti report layout and offer calendar.

## Compared with the April vouchers
| Item | April (Louis Philippe, [2026-04](../../2026-04/README.md)) | May (this folder) |
| --- | --- | --- |
| Workbooks | One per Store | One per brand, all Stores |
| Title lines | Three merged lines incl. `Voucher Series : ...` | Blackberry as April with different case; Mufti has two title lines and the header in row 3 |
| `Price` header | `Price` | Blackberry `MRP`; Mufti `Price` |
| Discount headers | `Dis ` | Blackberry `Dis Amount`; Mufti `Dis Amt` |
| `Dis %` | 30 or 0 (offer applied) | 0 on every line (offers not applied) |
| Extra columns | `O` flag (VAS-DEO also `P` to `R`) | `O` empty; `P` to `R` (POS discount %, discount amount, net) on every line |
| `SOH` date | 1 Apr 2026 or 1 May 2026 | 1 Jun 2026 |
| `SOH` extra column | none | `K` Store tag |
| Brand spelling | `LOUIS PHILIPPE` plus codes | Blackberry has three spellings; Mufti one |

## Subfolders
None.

## Open questions
Full list goes to [open-questions.md](../../../../data-notes/open-questions.md).
1. Why does the Blackberry May `SALES` sheet include 52 lines dated 20 to 30 Apr and none after 22 May? Is it a rolling extract, and which report does each line belong to? Owner: KDPS Owner (P-OWN) and Accounts (P-ACC).
2. Is the `SOH` date meant to be the closing date of the month (1 Jun 2026 here) or the opening date (the April files use 1 Apr or 1 May)? And should the Store tag column `K` stay in the report sent to a brand? Owner: Accounts.
3. What is the style `KDPS-DEGR-MF` on Mufti lines (6 sales lines, 56 stock rows)? Owner: KDPS Owner.
4. How is a duffel bag billed at ₹199 related to the `OFFER` text "AT Rs. 99/-"? Owner: Brand manager (P-BRM).
5. Do the Store names beside the first three Mufti offer lines limit those slabs to those Stores? Owner: Brand manager.
6. Do the brands expect the POS discount columns (`P` to `R`) in the report or only `Dis %` and `Dis Amount`? Owner: KDPS Owner and the brands.
