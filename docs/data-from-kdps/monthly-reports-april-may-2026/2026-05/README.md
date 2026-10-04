# 2026-05

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [..](../README.md)

## What this folder is
- Two AI-assistant skill files, both written on 31 May 2026, and the May 2026 Blackberry and Mufti workbooks (in `data/`).
- The skills are step-by-step instructions for an AI assistant working inside Excel (it calls an Excel scripting function named `execute_office_js`). They automate two parts of the monthly report: building and filling the `SALES` and `SOH` lists (`kdps-report`), and filling the discount columns (`discount-audit`). The pipeline is described in the parent [README](../README.md); the vouchers they correspond to are in [2026-04](../2026-04/README.md).
- Notes (not ranked): [offers-and-brand-reports.md](../../../data-notes/offers-and-brand-reports.md) for offers and AMM; [pos-exports.md](../../../data-notes/pos-exports.md) for the raw layouts the skills read.

## Files

### `kdps-report.skill` (3,704 bytes)
- **Real format.** A zip archive (`.skill` is a renamed `.zip`). It holds one file, `kdps-report/SKILL.md` (8,601 bytes, dated 31 May 2026 09:55 inside the archive). Read with `unzip -p`; nothing was extracted into the repository.
- **Header (YAML).** `name: kdps-report`. The `description` says it builds and fills the KDPS LIFESTYLE PVT. LTD. "Sale" (List of Sales Vouchers) and "SOH" (List of Stock Details) report sheets from a passed brand and month: creates the formatted header shells, ingests the sales lines one to one (with a gap-fill of blank dates and bill numbers and totals), then fills SOH from the stock source (uniform month-start date, brand short code, Total MRP, totals). Trigger example: `kdps report LP April 2026`.
- **Inputs.**
  - Brand (required), for example `LP` or `LOUIS PHILIPPE`. It sets the brand short code written in the SOH `Brand` column (`LP`), the full brand name used in the `Voucher Series` header (`LOUIS PHILIPPE`), and which source sheets to read.
  - Month (required). The year defaults to the current year. The skill derives `start_date` (first day, `DD-MM-YYYY`) and `end_date` (last day, with the correct 28, 29, 30 or 31).
- **Steps.**
  - **Step 0, locate sources.** List the worksheets and used ranges; identify them by column headers, not by name (names may be `LP2 SALE `, `LP2 SOH `, or generic `Sale`, `Stock`). Sales source headers: `Bill Date`, `Bill No`, `Item`, `Brand`, `Size`, `Design No`, `Barcode`, `Qty`, `Gross Amt`, `Disc%`. Stock source headers: `Item Name`, `Brand`, `Design`, `Size`, `Barcode`, `Tqty`, `Mrp`. If raw data already sits on sheets named `Sale`, `SOH` or `Stock`, do not overwrite them; create new report sheets with a month suffix (`Sale Apr26`, `SOH Apr26`). Done when both sources and the target names are known.
  - **Step 1, create the two report sheets** (never overwrite source data).
  - **Step 2, build the `Sale` header.** Font Cambria, centred, black. Merge `A1:N1`, `A2:N2`, `A3:N3`; leave row 4 unmerged. `A1` `KDPS LIFESTYLE PVT. LTD.` bold 18; `A2` `List of Sales Vouchers` bold 14; `A3` `Voucher Series : {BRAND_NAME}  (From {start_date} To {end_date})` bold 14. Row 4, bold, underlined, size 10, centred: `Date`, `Vch/Bill No.`, `Particulars`, `Item Details`, `Brand`, `Size`, `Style Code`, `Barcode`, `Unit`, `Qty.`, `Price`, `Dis %`, `Dis`, `Total`. Borders: medium black box round `A1:N3`; thin grid and a medium top on `A4:N4`.
  - **Step 3, build the `SOH` header.** Same conventions. Merge `A1:J1`, `A2:J2`, `A3:J3`. `A1` company name bold 18; `A2` `List of Stock Details` bold 14; `A3` `Voucher Series : {BRAND_NAME} (From {start_date})` bold 12 (start date only). Row 4, size 11: `Date`, `Item Details`, `Barcode`, `Size`, `Style Code`, `Brand`, `Qty.`, `Unit`, `MRP`, `Total MRP`. Medium boxes round `A1:J3` and `A4:J4`.
  - **Step 4, verify the month-start serial.** Read one known dated source cell's displayed text to anchor the Excel date number to a date (the example uses `1-Apr-26` as serial `46113` and `3-Apr-26` as `46115`) and derive the month's first and last serial from it; do not assume an offset. Produces `start_serial` (example `46113`) and `end_serial` (example `46142`).
  - **Step 5, fill the `Sale` list.** Source rows map one to one to `Sale` rows from row 5; never reorder. Write a seed row, then copy down. Mapping (`Sale` column from source):

| Sale column | Source or rule |
| --- | --- |
| `Date` (A) | `Bill Date`; linked if complete, otherwise see 5a; format `d-mmm-yy` |
| `Vch/Bill No.` (B) | `Bill No`; linked if complete, otherwise see 5a |
| `Particulars` (C) | hard-coded `CASH` |
| `Item Details` (D) | `Item` |
| `Brand` (E) | `Brand` |
| `Size` (F) | `Size` |
| `Style Code` (G) | `Design No` |
| `Barcode` (H) | `Barcode`, number format `0` |
| `Unit` (I) | hard-coded `PCS` |
| `Qty.` (J) | `Qty`; keep the sign (-1 is a return); do not force to 1 or aggregate |
| `Price` (K) | `Gross Amt`, not `Rate`; negative for returns; equals the line total for quantity above 1 |
| `Dis %` (L) | `Disc%` |
| `Dis` (M) | formula `=L{r}/100*K{r}` |
| `Total` (N) | formula `=K{r}-M{r}` |

    Data formatting: Cambria 10, centred; format `0` on `H`, `K`, `M`, `N`.
  - **Step 5a, blank dates and bill numbers** (only when the source records them on the first row of each basket). The skill fills blank dates and bill numbers from neighbouring values and flags them for review. Bill numbers follow the source's series prefix (for example `26-27/LBKR/N`).
  - **Step 5b, month check.** After writing, read back the `Date` column's displayed text and confirm every date is within the reporting month.
  - **Step 5c, totals row** after the last line: `=SUM` of `J`, `K`, `M`, `N`, bold, Cambria 10, format `0`.
  - **Step 5d, borders.** Thin grid on `A5:N{last}`; thin top border on the totals row.
  - **Step 6, verify `Sale` before `SOH`.** Check sample rows and totals; no `#REF!` or `#VALUE!`.
  - **Step 7, fill `SOH`.** Source rows map one to one from row 5; never reorder.

| SOH column | Source or rule |
| --- | --- |
| `Date` (A) | `start_serial` on every row (the month's first day, not the source's raw date); `d-mmm-yy` |
| `Item Details` (B) | `Item Name` or `Product` |
| `Barcode` (C) | `Barcode`, format `0` |
| `Size` (D) | `Size` |
| `Style Code` (E) | `Design` or `Style code` |
| `Brand` (F) | hard-coded brand short code (for example `LP`) on every row |
| `Qty.` (G) | `Tqty` or `Till Date Qty` |
| `Unit` (H) | hard-coded `PCS` |
| `MRP` (I) | `Mrp`, format `0` |
| `Total MRP` (J) | formula `=I{r}*G{r}` |

    Totals row: `=SUM` of `G` and `J`, bold. Thin grid on `A5:J{last}`; thin top border on the totals row.
  - **Step 8, final verify and report.** Read back samples and totals of both sheets; check for `#REF!` and `#VALUE!`; confirm `Sale` dates are within the month and `SOH` dates all equal the month start. The final report names the two sheets created, the date range, the `Sale` row count and totals (Qty, Dis, Total), the `SOH` row count and totals (Qty, Total MRP), and flags the bill numbers it filled so the user can review them.
- **Rules stated.** Never overwrite source sheets. Never reorder rows. `Price` is `Gross Amt`, not `Rate`. Returns keep their negative sign. `Dis` and `Total` are formulas. `SOH` `Date` is the month start on every row.
- **Column-mapping note.** Source layouts vary, so map by header meaning, not by column letter. A "Bokaro-style" raw layout is given as the example: sales `A` `Bill Date`, `B` `Bill No`, `C` `Customer`, `D` `Item`, `E` `Brand`, `F` `Size`, `G` `Design No`, `H` `Barcode`, `I` `Qty`, `J` `Gross Amt`, `K` `Disc%`; stock `A` `Item Name`, `B` `Brand`, `C` `Design`, `D` `Size`, `E` `Barcode`, `F` `Tqty`, `G` `Mrp` (this matches the Bokaro raw file in [DATA](../2026-04/DATA/README.md)).
- **How it compares with the April vouchers (2 May).** The vouchers share the header block and the one-to-one mapping. They differ from the skill in places: most `SOH` sheets carry `1 May 2026` rather than the month start `1 Apr 2026`; `SOH` brand codes are mixed (`LP`, `LY`, `LR`, `LOUIS PHILIPPE`) rather than one short code; the column `O` the skill adds in `discount-audit` is unlabeled. The skill is dated a month after the vouchers (OPEN: was the skill written from the April work).

### `discount-audit.skill` (2,694 bytes)
- **Real format.** A zip archive with one file, `discount-audit/SKILL.md` (5,421 bytes, dated 31 May 2026 11:15 inside the archive).
- **Header (YAML).** `name: discount-audit`. The `description` says it fills and audits the `Dis %` and `Dis` columns on a KDPS sales voucher sheet using the AMM list discount flag, offer-list rates, return cancellation and the promo-bag source-of-truth rule, so that `Total` recalculates correctly. Use after the `Sale` report is built (for example by `kdps-report`) when asked to apply or audit discounts.
- **Where it sits.** The skill's own pipeline: `1. kdps-report` builds and fills the `Sale` and `SOH` sheets; `2. discount-audit` applies and audits `Dis %` and `Dis`; `3. audit-xls` (optional) is a general formula sweep. It also names a skill `kdps-start-report`. `kdps-start-report` and `audit-xls` are not supplied (OPEN).
- **Inputs.**
  - `target`: the `Sale` report sheet (default: the active sheet, for example `Sale Apr26`). Data rows start at row 5; columns `G` `Style Code`, `J` `Qty`, `K` `Price`, `L` `Dis %`, `M` `Dis`, `N` `Total`.
  - The AMM workbook `16_AMM List dtd 20.01.26.xlsb` (or the current AMM master), which must be open so the external lookup resolves: tab `Stylecode`, column `D` style codes, column `F` the `Discount/No Discount` flag ([AMM list](../2026-04/README.md)).
  - The offer source: the active promo or offer list giving the rate by category. Check for an `Offers` sheet in the workbook first; if none, ask the user for the offer details (Start Date, Description, Applicable Categories, Rate).
  - The original raw `Sale` sheet, the source of truth for promo bags. Report row R maps to source row R-3 (report row 5 is source row 2).
- **Goal.** Every `Sale` line has the correct `Dis %` and `Dis` so that `Total` (`K` less `M`) recalculates: discounted items carry the offer rate, returns and buy-and-return pairs carry 0, promo bags take their flat discount from the original sheet, and no cell shows an error.
- **Steps.**
  - **Step 1, prerequisites and the rate.** Confirm the AMM workbook is open. Find the offer rate in an `Offers` sheet or ask the user. Note the effective rate (for example "Buy 1 - Get 30%" is 30%); never hard-code it, take it from the offer source each run. Rule: apply only offers effective on or before the bill dates in scope (exclude future-dated offers).
  - **Step 2, helper column `O`.** Seed `O5`, autofill down to the last data row: `=IFERROR(VLOOKUP($G5,'[16_AMM List dtd 20.01.26.xlsb]Stylecode'!$D$2:$F$77913,3,0),"No Discount")`. Use the Excel script's `autoFill` (a single copy-to-range call can throw an exception while the external link evaluates). Header `O4` is `Discount Status` (Cambria, bold, underline). Done when `O` shows `Discount` or `No Discount` with no `#REF` or `#N/A`.
  - **Step 3, `Dis %` (column `L`) with return cancellation.** Read `A5:O{last}` and compute `L` per row in the script, then write as values (the buy-and-return pairing is not a clean formula; the reference sheet `refSale` also holds typed values). Rule per row:
    - flag not `Discount`: 0;
    - quantity below 0 (a return): 0;
    - the sale line directly above a return of the same style code (the buy the return cancels): 0;
    - otherwise the offer rate (for example 30).
    The skill adds a hard rule from its session: a return cancels the immediately preceding positive-quantity line of the same style code, and both get 0. Detect by scanning row order: for each return at index i, zero out i and i-1 if i-1 has the same style with a positive quantity.
  - **Step 4, promo-bag override from the `Sale` source.** For a promo bag (item is a bag such as `DUFFEL BAG` or `BACKPACK`, or style code like `LPPROMOTBAG*`) do not use the percentage rule. Set `L` to 0 and link `Dis` (`M`) to the flat discount amount in the original `Sale` source: `M{r}=Sale!L{r-3}` (the source discount-amount column). Then `Total` matches the source net (the example: 7,999 less 7,850 gives 149). Hard rule from its session: bags are not in the AMM master (they return `No Discount`) and are not giveaways at 30%; the original `Sale` sheet is the single source of truth for bag discounts.
  - **Step 5, verify.** Confirm `M` is `=L/100*K` and `N` is `=K-M` on all non-bag rows (bag `M` is the source link), and that the totals row sums `J`, `K`, `M`, `N`. Read back: no `#REF`, `#VALUE`, `#N/A`; returns negative; all dates in the reporting month. Report: count of lines discounted against zeroed (and why: returns, pairs, no discount), bag lines overridden, the final Qty, Dis and Total totals, and any lines the AI was unsure of for user review.
- **Notes in the skill.**
  - If a reference sheet (for example `refSale`) exists, diff the computed `L` column against it row by row; zero differences is the acceptance test.
  - "Not Found in AMM" is treated as `No Discount` (the `IFERROR` fallback), because the AMM master is the authority on eligibility.
- **Gaps and differences.**
  - Source pointer `Sale!L{r-3}` assumes the raw `Sale` sheet has `Disc Amt` in column `L`; this holds for the Bokaro raw file (see [DATA](../2026-04/DATA/README.md)) and not for the other raw files.
  - The skill excludes nothing for suits or blazers. In the April vouchers some suit lines carry typed discounts and other suit lines are flagged `Discount` with `Dis %` 0 (see [2026-04](../2026-04/README.md)); the skill does not explain this.
  - The AMM list is dated 20 Jan 2026; 36% of April lines were not in it (see [2026-04](../2026-04/README.md)).
- **Notes.** [offers-and-brand-reports.md](../../../data-notes/offers-and-brand-reports.md).

## Subfolders
- [data](data/README.md): the May 2026 Blackberry and Mufti workbooks.

## Open questions
Full list goes to [open-questions.md](../../../data-notes/open-questions.md).
1. Who wrote the two skills (KDPS staff or the ERP team's earlier analysis), and were they written from the April work? They are not KDPS decisions on offers. Owner: KDPS Owner (P-OWN).
2. Where are `kdps-start-report` and `audit-xls`, and the `Offers` sheet the skill expects? Owner: KDPS Owner.
3. Which rule decides a suit line's discount (typed amounts, flat prices, or the percentage rule)? Owner: KDPS Owner and Brand manager (P-BRM).
4. Should the `SOH` list be dated the first of the reporting month, as the skill says, or the first of the next month, as the delivered files mostly show? Owner: Accounts (P-ACC).
5. Should a return cancel the preceding same-style sale line for the offer, and is it a brand rule or KDPS practice? Owner: KDPS Owner and the brand.
