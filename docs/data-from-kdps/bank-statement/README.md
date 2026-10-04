# bank-statement

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [data-from-kdps](../README.md). Notes: [docs/data-notes](../../data-notes/README.md).

## What this folder is

- Two KDPS workbooks, both dated 11 Jun 2026, that together show how a Store's day is closed and how cash and card money is traced to the bank:
  - one Store's daily sales report (DSR) for FY 2026-27: sale lines, the cash book, stock on hand, a bank reconciliation sheet and a petty cash sheet;
  - a bank-statement extract for the company: outgoing payments for 28 Mar to 14 Apr 2026, and debits and credits for 1 to 6 Jun 2026.
- The folder name covers only the second file. The first is a Store workbook.
- Made by KDPS: Store staff type the sale lines and deposits; Accounts compiled the bank extract. Neither file was made by the ERP team.
- **Privacy rule for this folder.** The bank file and the DSR hold account references, card-terminal references, UPI identifiers and the names of people who pay in cash or are paid. None of these is copied here. This README gives counts, totals, columns and layouts only.
- The PRD's day close is counted cash, tender reconciliation and a closing checklist (`PRD-CSH-001`, `PRD-CSH-003`, `PRD-CSH-010`); these files are the manual process it replaces. Bank-statement import and matching are `PRD-CSH-006`, `PRD-CSH-007` and `PRD-CSH-008`.

## Files

### `3. Vaishnavi Singh More DSR(Fy-26-27).xlsx`

- **What it is.** A per-Store daily sales report workbook for FY 2026-27 for the Store named "Vaishnavi Singh More" in cell `A1`. Bills are numbered in the series `26-27/SGMR/n`. Vaishnavi is a KDPS Store brand; the file never says which town Singh More is in (the store list in `../Q&A-req-recieved/LIST OF ALL STORES.xlsx` has a "Singh More" row; see [Q&A-req-recieved](../Q&A-req-recieved/README.md)). The "3." in the file name may be a Store sequence number (guess).
- **Made by.** KDPS Store staff and Accounts. The workbook properties are stripped; it holds Google Sheets markers (the threaded-comment provider, `__xludf.DUMMYFUNCTION` formulas), so it is a Google Sheets export. About 4.6 MB.
- **Period.** Sale lines run 1 Apr to 5 Jun 2026: 66 days in a row, so the Store traded every day. Formulas and dates are pre-filled for the rest of the year (to Apr 2027).
- **Sheets (7).**

| Sheet | Used range | Filter | Freeze | Content |
| --- | --- | --- | --- | --- |
| `Sale` | `A1:AF21193` | `A3:AF20993` | `A4` | 4,780 sale lines (rows 4 to 4783) with formulas pre-filled to row 21193 |
| `Cash` | `A1:Z580` | none | `A4` | 377 date rows, 1 Apr 2026 to 12 Apr 2027 |
| `Stock In` | `A1:J11968` | none | `A4` | A pivot over `Stock Inward Details` plus formula columns |
| `SOH & Sale Summary` | `A1:Z220` | none | `A3` | A second pivot, nearly empty |
| `Stock Inward Details` | `A1:L29780` | `A3:L29780` | `A4` | 12,123 inward lines |
| `Bank Reconciliation` | `A1:AC1000` | none | `A3` | 168 dated rows, for another Store and year; mostly errors |
| `Petty Cash` | `A1:Z597` | none | `A3` | 395 dated rows, every figure zero |

#### `Sale`

- Title cell `A1` is the Store name. Row 1 also holds `SUBTOTAL` formulas over `K`, `L` and `M`: quantity 5,967; `MRP` sum 66,04,281 (a sum of unit prices, not meaningful); `Total MRP` Rs 74,75,948. Merged headers: `N1:Q1` " Sale" and `R1:T1` "Dues Recovery". Row 2 (hidden) holds a check formula in `A`, `C` and `E` that answers "No Blank Or Error Cell". Header row 3.
- **Columns A to AF** (the headers repeat the names `Cash`, `UPI` and `Swip`, once for sales in `N`, `O`, `P` and once for dues recovery in `R`, `S`, `T`):

| Col | Header | Filled by | Notes |
| --- | --- | --- | --- |
| A | `Date` | typed | 1 Apr to 5 Jun 2026 |
| B | `Manual Bill No.` | typed | Empty on every line |
| C | `Online Bill No.` | typed | The POS bill number. `26-27/SGMR/1` to `/1166` (1,165 numbers; one number missing) and a second form `26-27/SGMR/S-1` to `S-60` (60 numbers) |
| D | `Sale Person` | typed | Empty on every line: the salesperson is never captured |
| E | `Barcode No.` | typed | Mostly a 7-digit internal code, then 13-digit, 6-digit and others; numbers and text |
| F | `Brand` | lookup in `Stock In` by barcode | 350 brands |
| G | `Product` | lookup | 83 products (most lines: `SAREE`, `CARRY BAG`, `KURTI SET`, `PETTICOAT`, `JACKET`) |
| H | `Style Code` | lookup | |
| I | `Store Name` | `=$A$1` | The Store name on every line |
| J | `Size` | lookup | `FREE SIZE`, `NA`, `FS`, `L`, `XL`, `M` and others |
| K | `Quantity` | typed | Negative on 105 return lines |
| L | `MRP` | lookup | |
| M | `Total MRP` | `=K*L` | |
| N | `Cash` | typed | Sale tender |
| O | `Online UPI` | typed | Sale tender |
| P | `Swip` | typed | Sale tender by card (the swipe machine) |
| Q | `Dues Sale` | typed | Sale on credit |
| R | `Cash` | typed | Dues recovery in cash |
| S | `UPI` | typed | Dues recovery by UPI |
| T | `Swip` | typed | Dues recovery by card |
| U | `Tid No` | typed | A card-terminal number column. Empty on every line |
| V | `NSV` | `=N+O+P+Q` | Net sales value |
| W | `Discount` | `=M-N-O-P-Q` | Derived from tender, not typed |
| X | `GST%` | `=IF(V<2500, 10.71%, 15.2542%)*100` | 10.71 on 4,500 lines, 15.2542 on 280. These are 12/112 and 18/118 (inferred), chosen by the line's net value, not the price per piece |
| Y | `Taxable Amount` | `=V-Z` | |
| Z | `GST` | `=V*X%` | |
| AA | `Check` | `=IF((SUM(N+O+P+Q+V+W)-V)=M,0,0)` | Returns 0 whichever way the test goes, so it can never flag an error. 0 on every line |
| AB | `Reason for Discount or Dues` | typed | 479 lines filled (see below) |
| AC | `Dis %` | `=W/M*100` | |
| AD | `Margin` | `=V-Z` | The same number as `Taxable Amount`; no cost is involved, so it is not a margin |
| AE | `Year` | `=TEXT(A,"YYYY")` | |
| AF | `Month` | `=TEXT(A,"MMMM")` | `April` 1,988 lines, `May` 2,616, `June` 176 |

- **Totals.** 4,780 lines; 5,967 pieces; 1,225 bill numbers; `Total MRP` Rs 74,75,948; `NSV` Rs 31,41,851. Tender split: cash Rs 11,68,777 (37%), UPI Rs 14,81,531 (47%), card Rs 4,86,620 (15%), dues sale Rs 4,923.50 (0.2%). Dues recovery in cash Rs 3,324.30. Daily `NSV` runs from Rs 9,561 to Rs 1,03,663 (peak 21 Apr).
- **Returns.** 105 lines with a negative quantity (Total MRP about Rs 1.63 lakh), inside normal bills. No link to the original bill.
- **Dues (credit) sales.** 3 lines: 2 sale lines (Rs 3,324.30 on 17 Apr and Rs 1,599.20 on 18 May) and 1 recovery in cash of Rs 3,324.30 on 28 May.
- **Carry bags.** 586 lines of product `CARRY BAG`, brand `VAISHNAVI`, MRP 7; 584 of them have tender 0 (100% discount).
- **Zero-tender lines.** 2,242 lines have `NSV` 0, and 2,238 lines have `Dis %` 100. Of the 2,242, 584 are carry bags and 1,658 are other goods with Total MRP Rs 41.99 lakh; 202 of the 2,242 carry a reason.
- **The `S-` series.** The 60 bill numbers `26-27/SGMR/S-n` hold 1,635 lines and 2,800 pieces, all dated 3 Apr to 5 Jun, and the tender on them sums to zero. Together with the stock-transfer reasons below, they look like stock leaving the Store recorded as sales (inferred).
- **Reasons (column `AB`).** 479 lines. `Stock Transferr` (sic) 374; `STOCK TRANSFER TO KAHELGAON STORE` 39; `STOCK TRANSFER TO WAREHOUSE (DEFECTIVE)` 18; `STOCK TRANSFER TO WAREHOUSE` 16; `STOCK TRANSFER TO SINGHMORE VAISHNAVI` 15; `DEFECTIVE GR TO WAREHOUSE` 9; `STOCK TRANSFER TO BANKA STORE` 8. 270 of these lines carry real tender (Rs 3.82 lakh in all), and that tender is inside the cash book totals. 15 lines name this same Store as the destination. Many of the 374 `Stock Transferr` lines look like ordinary customer sales (inferred from their tender).
- **GST rule.** The sheet uses 12% below Rs 2,500 and 18% above, judged per line value. This is a KDPS spreadsheet rule, not a signed policy. OPEN: CA.
- **Recalculation caveat.** The lookups read `Stock In` columns `A` to `I`, and the pivot labels in `Stock In` `A` to `F` are blank in this export. The cached values are present; a fresh recalculation would return blanks (inferred).
- **Sensitive.** A card-terminal column (empty). No customer data. No salesperson.

#### `Cash`

- Merged headers `A1:B2` (the Store name), `C1:F1` "Cash Sale" and `G1:I1` "Dues Recovery". Row 2 holds `SUBTOTAL` totals. Header row 3: `Date`, `Opening Balance`, `Cash`, `UPI`, `Swip`, `Dues`, `Cash`, `UPI`, `Swip`, `NSV`, `Bank Deposit`, `Cash Transfer to Ho`, `Ac No. / Person`, `Closing Balance` (columns A to N; the second `Cash`, `UPI`, `Swip` are dues recovery).
- One row per day. Sales columns `C` to `J` are `SUMIF` of the `Sale` sheet by date. `Closing Balance` = `Opening Balance` + `Cash` − `Bank Deposit` − `Cash Transfer to Ho` + dues recovered in cash. UPI and card never enter the cash balance.
- Typed: the opening balance of 1 Apr (Rs 73,885.59; the other days link to the day before), `Bank Deposit` and `Cash Transfer to Ho` and `Ac No. / Person`.
- 377 rows, 1 Apr 2026 to 12 Apr 2027; 66 have sales. Totals in row 2: cash sale Rs 11,68,777; UPI Rs 14,81,531; card Rs 4,86,620; dues Rs 4,923.50; dues recovered in cash Rs 3,324.30; `NSV` Rs 31,41,851; bank deposits Rs 8,22,700; cash sent to head office Rs 1,40,000.
- Bank deposits: 33 deposits, first on 2 Apr, last on 30 May. Cash transfers to head office: 3 (13 Apr Rs 45,000; 6 May Rs 45,000; 22 May Rs 50,000). The column `Ac No. / Person` is filled on exactly those 3 rows (the values are an account or a person; not copied).
- Book cash at 5 Jun 2026 is Rs 2,83,287 (it stays the same on the later rows). **There is no physical-count column and no variance column**: the closing balance is a book figure. This differs from `PRD-CSH-001` and `PRD-CSH-002`.
- Sensitive: the `Ac No. / Person` cells.

#### `Stock In` and `SOH & Sale Summary`

- `Stock In`: header row 3. Columns `A` to `F` are a pivot over `Stock Inward Details` (source `C3:I29780`) with the labels `Barcode no`, `Brand`, `Product`, `Style code`, `Size` and a data field "Total SOH QTY"; they are blank in this export. Formula columns: `Sold QTY` (G, `SUMIF` of `Sale` quantity by barcode), `Till Date Qty` (H, inward minus sold: stock on hand), `MRP` (I, a lookup into `Stock Inward Details`; one cell is a typed 2049) and `Total MRP` (J, `MRP` × `Till Date Qty`). 11,965 rows with an `MRP`.
- Row 2 totals (cached): 23,623 inward; 5,967 sold; 17,656 on hand; `MRP` sum 2,06,13,889; `Total MRP` Rs 2,74,38,788 (Rs 2.74 crore at MRP).
- Quirk: inward since 1 Oct 2024 is set against sales since 1 Apr 2026 only, so the 17,656 on hand may include goods sold earlier (inferred).
- `SOH & Sale Summary`: row 1 reads `SUBTOTAL` with `Total MRP` Rs 2,74,38,788 and zeros beside it. A second pivot (`A2:C3`, source `Stock In!A3:J11968`) with data fields `SUM of Sold QTY`, `SUM of Till Date Qty` and `SUM of Total MRP`. Only 4 cells hold values.

#### `Stock Inward Details`

- Row 1 has the Store name and `SUBTOTAL` totals (quantity 23,623; `MRP` 2,09,92,524; `Total MRP` Rs 3,49,12,387). Row 2 (hidden) holds checks that answer with a cell address where a blank was found (`A11715`, `B11715`, `E3510`, `H11715`). Header row 3, columns A to J: `Date`, `Invoice No`, `Barcode no`, `Brand`, `Product`, `Style code`, `Size`, `QTY`, `MRP`, `Total MRP` (`=I*H`). Columns K and L are empty.
- 12,123 lines (rows 4 to 12126), 12,121 with a date, from 1 Oct 2024 to 2 Jun 2026. 665 distinct values in `Invoice No` (including `Audit Diff`), 11,964 barcodes, 628 brands, 23,623 pieces (Rs 3.49 crore at MRP). 40 lines have a zero or negative quantity.
- `Invoice No` takes two forms: `WH\S-301` (a backslash; 3,080 lines) and `25-26/WH/S-nnn` or `26-27/WH/S-nnn` (7,844 lines for the `WH` form). Source prefixes, by distinct invoice: `WH` 614, `VAS` 20, `VAB` 7, `DEO` 5, `DMK` 5, `BGP` 4, `JSL` 3, `RKJ` 3, `KLG` 2 (written `25-26/KLG2/S-n`), `JBNK` 1. These look like other KDPS places (a warehouse and Stores) (guess); see [stores-and-codes.md](../../data-notes/stores-and-codes.md).
- 77 lines are labelled `Audit Diff` (136 pieces on 3 dates): stock found at an audit and added as inward. Under the PRD only a physical count creates stock, and a count has to be recorded as one.
- Sensitive: none.

#### `Bank Reconciliation`

- **This sheet is broken and is for another Store and year.** Cell `A1` names "Vaishnavi Banka"; `B1` holds the label `MID No:-` and `C1` a card-terminal reference (present, not copied). 168 dated rows, 1 Apr to 15 Sep **2025**.
- Header row 3, columns A to T: `Date`, `Store Name`, `MID No`, `Opening Balance`, `Total Revenue`, `Cash sale`, `Swip Amt`, `Swip Satt Amt`, `Bank Charge (%)`, `Online UPI`, `UPI Satt Amt`, `Dues Sale`, `Dues Recover`, `Cash Dues Recover`, `UPI Dues Recover`, `Swip Dues Recover`, `Bank Deposit`, `Cash Transfer to (HO)`, `Bank Deposit Verified`, `Outstanding Balance`. Row 2 holds `SUBTOTAL` totals and a check.
- Intended method (from the formulas): compare each day's recorded card and UPI sales with the settlement amounts credited (`Satt` is settlement); `Bank Charge (%)` = (`Swip Amt` − `Swip Satt Amt`) ÷ `Swip Amt`; `Outstanding Balance` = `Opening Balance` + `Cash sale` − `Bank Deposit` − `Cash Transfer to (HO)`; `Bank Deposit Verified` is a manual tick.
- State: the sheet was copied from Banka, so its links to `Sale` return `#ERROR!` or `#VALUE!` in the columns `MID No`, `Total Revenue`, `Cash sale`, `Swip Amt`, `Online UPI`, `Dues Sale`, `Cash Dues Recover`, `UPI Dues Recover`, `Swip Dues Recover` and `Outstanding Balance`, down to row 999. Only 91 typed `UPI Satt Amt` amounts remain (1 Apr to 30 Jun 2025, Rs 21,30,084 in all). `Swip Satt Amt`, `Bank Deposit` and `Cash Transfer to (HO)` hold no values. A conditional format sits on `Bank Charge (%)`.
- One threaded comment (6 Jun 2026, on `H47`): a Rs 989 card settlement for Banka landed under another Banka unit's terminal; a reply says "CLEAR FILTER".

#### `Petty Cash`

- Merged `A1:B1` "Total". Row 1 sums each column to row 397. Header row 2, columns A to R: `Date`, `Opening Balance`, `Petty Cash Received`, `Staff Salary`, `Tea Snacks`, `Alteration`, `Courier & Cargo` and `Exp` (one cell with a line break), `Wow Bill/ Incentive Expance`, `Rent`, `Electricity Bill`, `Water Exp`, `Net Charge`, `Show Room Repaire  Maint.` and `Exp` (a line break), `Printing & Stationery Exp`, `Other Exp.  (if any)`, `Total Expance`, `Reason of Other Exp.`, `Closing Balance`.
- 395 dated rows, 1 Apr 2026 to 30 Apr 2027. Every figure is 0 or blank, so it is not in use yet. `Total Expance` = `SUM(D:O)`; `Closing Balance` = `Opening Balance` + `Petty Cash Received` − `Total Expance`; each opening balance is the previous closing balance.
- Compare `PRD-CSH-004` (petty expenses with bill photos, limits, top-up requests and float accountability).

- **Notes.** [store-close-cash-and-bank.md](../../data-notes/store-close-cash-and-bank.md), [pos-exports.md](../../data-notes/pos-exports.md), [data-quality-and-import-rules.md](../../data-notes/data-quality-and-import-rules.md).

### `Bank statement.xlsx`

- **What it is.** One sheet, `Sheet1` (used range `A1:F378`, 376 lines), stitched by hand from two bank downloads. It is a company-level extract compiled by KDPS Accounts, not a bank-issued file. The narration styles point to an ICICI Bank current account (inferred). No account number appears in this README.
- **Made by.** KDPS Accounts (inferred). The file properties name a person as author (not copied); last saved 6 Jun 2026 09:50 UTC; file dated 11 Jun 2026. 27,903 bytes. No hidden sheets, no formulas, no filter.
- **Part 1 (rows 2 to 203, 202 lines, 28 Mar to 14 Apr 2026).**
  - Header row 1, columns A to D: `Date`, `Narration`, `Date`, `Amount`. Columns E and F are empty. Column C repeats the date of A (equal on 201 of 202 lines).
  - Only outgoing items: Rs 1,44,95,606 in total. 199 amounts are whole numbers and 3 have paise.
  - By narration type (approximate, by words in the narration): internet-banking transfers to suppliers and parties 183 lines (about Rs 95.95 lakh); internal fund transfers 11 (Rs 15.99 lakh); auto-debits 2 (Rs 24.99 lakh); bill payments 4 (Rs 4.37 lakh); other 2 (Rs 3.66 lakh). Narrations carry tags such as a warehouse-stock tag, Store codes and brand shorthand. Loan EMI and interest lines are among them.
  - Dates: 16 distinct days.
- **Row 204** is blank.
- **Part 2 (rows 205 to 378, 174 lines, 1 to 6 Jun 2026).**
  - **No header row.** Reading by values (inferred): `A` date, `B` narration, `C` empty, `D` a second date, `E` debit, `F` credit. Amounts are stored as text in Indian comma format (for example `12,50,000.`) on 23 lines and as numbers on the rest.
  - Debits: 54 lines, Rs 88,10,690. By type: transfers to suppliers and parties 33 (Rs 56.43 lakh); bill payments 11 (Rs 3.62 lakh); internal fund transfers 7 (Rs 13.68 lakh); an auto-debit 1 (Rs 11.89 lakh); loan and interest and others 2.
  - Credits: 120 lines, Rs 72,86,288:
    - card settlements, one narration per terminal per day: 57 lines, Rs 6.08 lakh;
    - UPI settlement lumps, 6 lines (Rs 19.33 lakh, one per day for all Stores, so a Store's share cannot be read from this file (inferred));
    - cash deposits: 47 lines in three forms: branch counter deposits 13 (Rs 5.70 lakh, narration names a town and a depositor), deposit-machine lines 17 (Rs 7.97 lakh) and cash-collection-service lines 17 (Rs 4.65 lakh), the last two kinds told apart by their narration tags (inferred); Rs 18.32 lakh in all;
    - transfers from parties: bank transfers, RTGS, UPI and IMPS credits (10 lines, about Rs 29.1 lakh).
  - Lines per day: 49, 20, 29, 22, 33 and 21 for 1 to 6 Jun.
- **The gap.** 15 Apr to 31 May 2026 is missing. The file has no running balance and no opening or closing balance.
- **Link to the DSR.** The narration of a card-settlement credit carries a terminal reference; the DSR `Bank Reconciliation` sheet has a header cell for a terminal reference and a `Swip Satt Amt` column meant to receive it. The cash-deposit narrations carry a town and a depositor, like the DSR's `Bank Deposit` column. Nothing in the bank file can be tied to the Singh More Store: the DSR has no June deposits, and April lines in the bank file are payments out.
- **Sensitive.** Beneficiary names (businesses and private individuals), depositor names and towns, UPI identifiers, IFSC codes, card-terminal references and loan lines are present in the narrations. None is copied.
- **Notes.** [store-close-cash-and-bank.md](../../data-notes/store-close-cash-and-bank.md).

## What the two files show about the process today

- Sales, tender, discount and dues are typed per line in one sheet. Cash on hand is a book balance with no physical count. UPI and card sales are not matched to provider reports or bank credits (the reconciliation sheet does not work). Deposits are typed in, not matched to the bank file.
- Stock transfers out of the Store, defective returns to the warehouse and stock found in audits sit inside the sale and inward lists, with zero or partial tender, which distorts sales, discount and the cash book.
- Petty cash exists as a sheet but is unused.

## Subfolders

None.

## Open questions

Full list: [open-questions.md](../../data-notes/open-questions.md).

- Which town is "Singh More", and is its card-terminal settlement the one in the bank file? Why does `Bank Reconciliation` still hold the Banka Store's 2025 data? Owner: KDPS Owner, Accounts. Blocks the store day close design in stage 4.
- What is the rule for recording stock sent out of a Store (the `S-` series, `Stock Transferr`, defective returns to the warehouse)? At what value, in which tender? Owner: KDPS Owner, Accounts. Blocks transfer and day-close design (stages 3 and 4).
- Do Stores count cash each day, and where are the counted amount and the variance written? Owner: KDPS Owner. Blocks `PRD-CSH-001` configuration (cash-variance tolerance is a policy value).
- Is the 12% under Rs 2,500, 18% above rule per line current? Owner: CA. Blocks the tax rules (stage 1).
- Who fills `Sale Person`, and why is it always blank? Owner: KDPS Owner (needed for `PRD-POS-002`).
- Is UPI settled as one lump per day for all Stores, and how does a Store learn its share? What do "Dues Sale" and "Satt" mean in KDPS's words? Owner: Accounts.
- What do the codes `VAS`, `BGP`, `VAB`, `DEO`, `DMK`, `RKJ`, `JSL`, `KLG`, `JBNK`, `GAYA`, `SAN` and `LEEDEO` stand for? Owner: KDPS Owner.
- Why is 15 Apr to 31 May missing from the bank extract, and can KDPS give a full period in the bank's own export format? Owner: Accounts.
- Who prepares the bank-statement extract, and may a sample be used in the development environment? Owner: Accounts.
