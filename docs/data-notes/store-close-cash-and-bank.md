# Store close, cash book and bank statement

> **Not ranked.** These notes describe the data KDPS sent. They decide nothing. A PRD or policy change they lead to needs an entry in [decisions.md](../decisions.md) first. See [README.md](README.md).

This note covers one store's daily sales report (DSR) workbook, which is also its cash book, bank deposit record and stock-on-hand sheet, and the company bank statement extract. It explains how card and UPI settlements are matched to sales today and what the data cannot do. Raw files are not in git; they are named here in backticks. Sensitive values (card terminal and merchant IDs, bank account numbers, IFSC codes, UPI IDs, names of people in bank narrations, the text in the `Ac No. / Person` column) are present in the files and are not copied. Figures marked "(computed)" were worked out from the files by the notes' author.

Related notes: [pos-exports.md](pos-exports.md) (POS export layouts), [stores-and-codes.md](stores-and-codes.md) (store codes such as `SGMR`), [transfers.md](transfers.md) (transfers), [purchases-and-supplier-notes.md](purchases-and-supplier-notes.md) (supplier payments seen in the bank file).

## 1. Sources

| File | Folder | What it is |
| --- | --- | --- |
| `3. Vaishnavi Singh More DSR(Fy-26-27).xlsx` | `bank-statement` | One store's FY 2026-27 DSR workbook. Made by KDPS (store and finance staff). A Google Sheets export (formulas written with Google functions `LET` and `FILTER`, one threaded comment dated 6 Jun 2026, two pivot tables). Seven sheets. The "3." in the name may be a store sequence number (guess). |
| `Bank statement.xlsx` | `bank-statement` | A company-level bank extract compiled by KDPS Accounts from two downloads, stitched into one sheet. Not a bank-issued file. One sheet, 378 rows. |
| POS sales reports | `Q&A-req-recieved`, `store-analysis` | Cash, card and credit columns on each bill (section 6). Described in [pos-exports.md](pos-exports.md). |

Folder README: [bank-statement](../data-from-kdps/bank-statement/README.md).

## 2. Key facts

- The workbook is the store's daily close in spreadsheet form: sales lines with tender amounts, a cash book driven by sums of the sales lines, a bank deposit record, petty cash (unused) and stock on hand. The store is named "Vaishnavi Singh More"; its bill series is `26-27/SGMR/n`. The sheet never says which town it is in.
- Sales lines run 1 Apr to 5 Jun 2026 (66 consecutive days). 4,780 lines, 5,967 pieces, total MRP ₹74,75,948, net sale value (NSV) ₹31,41,851 (the sum of what the lines record as paid).
- Tender split of NSV (computed): cash 37.2%, UPI 47.2%, card (swipe) 15.5%, dues sale 0.16%.
- There is no counted cash and no variance anywhere. The cash book balance is calculated: opening plus cash sales minus deposits minus cash sent to head office. The book balance on 5 Jun is ₹2,83,286.84.
- 1,635 lines (34% of lines, 94% of the headline discount) are in a separate bill series `26-27/SGMR/S-n` with zero tender and 100% discount. They look like stock moved out of the store, typed as sales (inferred). The headline discount of 58% of MRP is therefore not a customer discount; on lines that were actually paid for, the discount is about 4% (computed).
- UPI and card amounts are empty for the last seven days (30 May to 5 Jun); those days show cash only.
- The `Bank Reconciliation` sheet belongs to another store (Vaishnavi Banka) and the year 2025. Almost every formula in it returns an error. The `Petty Cash` sheet is entirely zero.
- The bank extract covers 28 Mar to 14 Apr 2026 (outgoing items only) and 1 to 6 Jun 2026 (debits and credits). 15 Apr to 31 May (47 days) is missing.
- Card settlements arrive as one credit per terminal per day; UPI arrives as one PhonePe credit per day for all stores together. A store's UPI share cannot be read from the bank file (section 5).
- The GST rule inside the DSR (12/112 below ₹2,500 and 18/118 from ₹2,500, judged on the value of the line) is what the sheet does. It is not a settled rule. OPEN for the CA (section 3.9).

## 3. `3. Vaishnavi Singh More DSR(Fy-26-27).xlsx`

### 3.1 Sheet map

| Sheet | Used area | Formatted to | Role |
| --- | --- | --- | --- |
| `Sale` | 4,780 lines in rows 4 to 4,783; 32 columns A to AF | row 21,193 | Every bill line with tender. |
| `Cash` | 66 days in use (1 Apr to 5 Jun 2026); 377 date rows to 12 Apr 2027; 14 columns A to N | row 580 | Daily cash book. |
| `Stock In` | 11,964 pivot rows; columns A to J | row 11,968 | Stock on hand per barcode: pivot over `Stock Inward Details` plus sold quantity. |
| `SOH & Sale Summary` | one subtotal row and a one-row pivot (A2:C3) | row 220 | Mostly empty in this export. |
| `Stock Inward Details` | 12,123 lines in rows 4 to 12,126 (12,121 dated, 2 without date or invoice); columns A to J | row 29,780 | Every piece received at the store, from 1 Oct 2024. |
| `Bank Reconciliation` | 168 date rows, 1 Apr to 15 Sep 2025; columns A to T | row 1,000 | Card, UPI and deposit matching, copied from the Banka store; broken. |
| `Petty Cash` | 395 date rows, 1 Apr 2026 to 30 Apr 2027; columns A to R | row 597 | Petty cash book, unused. |

Row 2 of `Sale`, `Stock Inward Details` and `Bank Reconciliation` holds a Google Sheets formula (`LET`, `FILTER`, `INDIRECT`) that returns "No Blank Or Error Cell" or the address of the first blank or error cell in a column. In `Stock Inward Details` it points at row 11,715 for several columns: the first incomplete line (section 3.11).

### 3.2 `Sale` columns

Header on row 3. Row 1 holds the store name in `A1`, three totals (`K1` 5,967 pieces; `L1` 66,04,281, a sum of the MRP column, which has no meaning; `M1` 74,75,948 total MRP) and two labels: `N1` " Sale" over the tender columns `N` to `Q` and `R1` "Dues Recovery" over `R` to `T`.

| Col | Header | Entered or formula | Notes |
| --- | --- | --- | --- |
| A | `Date` | entered | 66 distinct dates. |
| B | `Manual Bill No.` | entered | Empty on all 4,780 lines. |
| C | `Online Bill No.` | entered | The POS bill number, such as `26-27/SGMR/1`. 1,225 distinct values (section 3.4). |
| D | `Sale Person` | entered | Empty on all lines. The salesperson is never captured. |
| E | `Barcode No.` | entered | Looked up against `Stock In`. |
| F | `Brand` | lookup | VLOOKUP into `Stock In` columns A to I. |
| G | `Product` | lookup | same |
| H | `Style Code` | lookup | same |
| I | `Store Name` | formula | Copies `A1`. |
| J | `Size` | lookup | Uses a shorter range (rows to 9,000) than the other lookups (to 15,000). |
| K | `Quantity` | entered | Negative for returns. |
| L | `MRP` | lookup | |
| M | `Total MRP` | formula | `K` times `L`. |
| N | `Cash` | entered | Sale tender. |
| O | `Online UPI` | entered | Sale tender. |
| P | `Swip` | entered | Card swipe machine. |
| Q | `Dues Sale` | entered | Credit sale (customer pays later). |
| R | `Cash` | entered | Dues recovery tender. |
| S | `UPI` | entered | Dues recovery tender; never used. |
| T | `Swip` | entered | Dues recovery tender; never used. |
| U | `Tid No` | entered | Terminal ID. Empty on all lines. |
| V | `NSV` | formula | `N + O + P + Q`. |
| W | `Discount` | formula | `M - N - O - P - Q`. |
| X | `GST%` | formula | `IF(V < 2500, 10.71%, 15.2542%) * 100`, so 10.71 or 15.2542. |
| Y | `Taxable Amount` | formula | `V - Z`. |
| Z | `GST` | formula | `V * X%`. |
| AA | `Check` | formula | `IF((SUM(N+O+P+Q+V+W) - V) = M, 0, 0)`: returns 0 whichever way the test goes, so it can never flag an error. |
| AB | `Reason for Discount or Dues` | entered | 479 lines (section 3.7). |
| AC | `Dis %` | formula | `W / M * 100`. |
| AD | `Margin` | formula | `V - Z`: the same number as `Y`. No cost is involved, so it is not a margin. |
| AE | `Year` | formula | Text year. |
| AF | `Month` | formula | Text month name. |

What staff type: date, POS bill number, barcode, quantity, tender amounts and the reason. Everything else is derived. NSV is therefore the sum of the tenders typed, not the bill value from the POS. Brand, product, style, size and MRP come from the pivot sheet by barcode; because the lookups read a pivot range, they depend on the pivot's label columns, which are blank in this export (cached values survive).

### 3.3 Totals and tender split (computed)

| Measure | Value |
| --- | --- |
| Lines | 4,780 |
| Dates | 1 Apr to 5 Jun 2026, no day missing |
| Distinct POS bill numbers | 1,225: 1,165 in the normal series (numbers 1 to 1,166; number 343 is missing) and 60 in the `S-` series |
| Pieces | 5,967 (normal series 3,167, `S-` series 2,800) |
| Total MRP | ₹74,75,948 |
| NSV | ₹31,41,850.84 |
| Discount (`MRP - NSV`) | ₹43,34,097 (58.0% of MRP). The `Discount` column adds to ₹42,49,114 because one formula is broken (section 3.8). |
| Taxable amount | ₹27,54,125.54 |
| GST | ₹3,87,725.30 |
| Cash | ₹11,68,776.95 (37.2%) |
| UPI | ₹14,81,530.83 (47.2%) |
| Swipe (card) | ₹4,86,619.56 (15.5%) |
| Dues sale | ₹4,923.50 (0.16%) |
| Dues recovered in cash | ₹3,324.30 |
| Daily NSV | average ₹47,604; lowest ₹9,561; highest ₹1,03,663 |
| NSV by month | April ₹15,63,197; May ₹14,29,448; 1 to 5 June ₹1,49,206 (cash only) |
| Tender mix by month (cash, UPI, swipe) | April 34%, 51%, 15%; May 35%, 48%, 17%; June 100%, 0%, 0% |

Tenders add up to NSV exactly. In the last seven days (30 May to 5 Jun), the `Online UPI` and `Swip` columns are empty on every line, although the bank statement shows card settlements and UPI credits for 1 to 6 Jun. The cash-only NSV for those seven days (₹2.44 lakh) is below what the sheet's daily average would give (about ₹3.3 lakh), so UPI and card are probably typed later (inferred).

### 3.4 Bill series

- Normal series `26-27/SGMR/n`: 3,145 lines, 1,165 bills, NSV ₹31,41,851, 607 lines with zero tender (584 carry bags, 23 free gifts, section 3.6).
- Stock-movement series `26-27/SGMR/S-n`: 60 bills (`S-1` to `S-60`), 1,635 lines, 2,800 pieces, total MRP ₹40,61,838, zero tender and 100% discount on every line. Each bill sits on a single date; 26 distinct dates between 3 Apr and 5 Jun; the busiest days are 19 May (320 lines), 18 May (269), 20 May (216), 24 May (120) and 22 May (119); the largest bill has 126 lines. Brands include Okane, Sona Rupa, Allen Solly, Deal, U. S. Polo Innerwear and PMS. Only 77 of the 1,635 lines carry a reason; 1,558 carry none.
- Reading (inferred): the `S-` bills record stock leaving the store (to the warehouse, to other stores, as defective returns), typed as sales so that the stock-on-hand sheet falls. 94% of the headline discount comes from these lines.
- Bill 283 appears on two dates: 17 Apr (a dues sale) and 28 May (its recovery, section 3.6).

### 3.5 Returns

- 105 lines have negative quantity: −106 pieces, −₹1,59,539 of NSV. Tender on these lines: cash 68, UPI 29, swipe 7, none 1. The refund goes out in the tender column as a negative amount.
- Returns are lines inside the day's sales, with no link to the original bill (the POS reports are the same). One return line (a suit, −1 piece, −₹1,699 at MRP) has zero tender while a matching +1 line exists on the same bill: a same-price exchange.

### 3.6 Dues sale, dues recovery, carry bags, free gifts

- Dues sale: 2 lines. Bill 283 on 17 Apr (₹3,324.30) was recovered in cash on 28 May: the recovery is a new line dated 28 May with quantity 0, the same bill number and the amount in column `R`. Bill 898 on 18 May (₹1,599.20) has no recovery yet. The `UPI` and `Swip` recovery columns are never used. No customer name or limit exists on the sheet.
- Carry bags: product `CARRY BAG`, brand `VAISHNAVI`, billed as a piece at ₹7: 585 lines at ₹7 and 1 at ₹6, 647 bags. 582 lines carry a 100% discount; 584 have zero tender. One carry-bag line carries ₹2,199 in cash with the reason "Stock Transferr" (a sale keyed to the wrong item (guess)) and one carries ₹6. 121 of the 586 carry-bag lines carry a transfer reason, so bags are also moved out with stock.
- Free gifts: 23 other lines in the normal series have zero tender (about ₹1.37 lakh at MRP). Most are trolleys with MRP of ₹9,100 to ₹9,250, so they look like gift-with-purchase items (inferred); two are a same-price return and exchange.

### 3.7 Zero-tender lines and the reason texts

- Lines with zero NSV: 2,242. They split into carry bags 584, free gifts and an exchange 23, and the `S-` series 1,635.
- Of the 1,658 non-bag lines with zero tender, 1,576 have no reason text (₹37.6 lakh at MRP), 54 say "Stock Transferr" and 28 say "STOCK TRANSFER TO KAHELGAON STORE".
- 479 lines carry a reason. 277 of them (₹3,82,405 of tender: cash ₹1,14,558, UPI ₹1,98,245, swipe ₹69,602) have real tender, so the reason is attached to ordinary sales as well. Texts exactly as typed:

| Reason text | Lines | With tender | Tender (₹) |
| --- | --- | --- | --- |
| `Stock Transferr` | 374 | 222 | 3,16,566 |
| `STOCK TRANSFER TO KAHELGAON STORE` | 39 | 8 | 8,128 |
| `STOCK TRANSFER TO WAREHOUSE (DEFECTIVE)` | 18 | 13 | 12,092 |
| `STOCK TRANSFER TO WAREHOUSE` | 16 | 10 | 7,869 |
| `STOCK TRANSFER TO SINGHMORE VAISHNAVI` | 15 | 10 | 19,703 |
| `DEFECTIVE GR TO WAREHOUSE` | 9 | 8 | 10,580 |
| `STOCK TRANSFER TO BANKA STORE` | 8 | 6 | 7,468 |

- Of the 374 `Stock Transferr` lines, 154 have 0% discount and 152 have 100%, so about half look like sales at full MRP that were labelled "transfer" and about half like stock leaving at 100% discount (inferred). 15 lines name this same store as the destination. 50 are in the `S-` series.
- The tender on all reason lines (about ₹3.8 lakh) is inside the cash book totals.
- The reason column has no controlled list: seven spellings and one typo.

### 3.8 Price above MRP, broken formulas, other quirks

- 8 lines have a negative discount, meaning the tender exceeds the total MRP (for example a ₹7 carry bag with ₹2,199 paid). A selling price above MRP is what `PRD-POS-024` forbids.
- `W` (discount) is broken on two lines: row 357 reads `P359` where it should read `O357`, and row 359 reads `#REF!`. Row 359 (a backpack, MRP total ₹84,983 for 17 pieces, no tender) therefore shows no discount, and the discount column falls short of MRP minus NSV by ₹84,983.
- 11 lines worth ₹2,500 or more have more than one piece and a per-piece value below ₹2,500, so the GST slab is applied to the line value, not the piece price (section 3.9).
- Header cell `L1` adds the MRP column; it means nothing.
- Month and year columns are text.

### 3.9 The GST rule in the sheet (OPEN for the CA)

- What the sheet does: for each line, if NSV is below ₹2,500 the GST is 10.71% of NSV (which is 12/112); otherwise 15.2542% (which is 18/118). The prices are tax-inclusive. The test uses the value of the line (NSV, after discount, for all pieces on the line), not the price of one piece and not MRP.
- Result (computed): 4,500 lines at the lower rate (NSV ₹20.14 lakh, GST ₹2.16 lakh) and 280 lines at the higher rate (NSV ₹11.27 lakh, GST ₹1.72 lakh). The "GST%" column holds 10.71 and 15.2542, not 12 and 18.
- This is staff arithmetic for the sheet, not a KDPS decision. Other data shows other rates: KDPS's own PT template (`KDPS PT FILE SHEET.xlsx`, see [pt-file-layouts.md](pt-file-layouts.md)) taxes at 5% up to a value and 18% above; the debit-note software export shows lines at 5%, 12% and 18% (see [purchases-and-supplier-notes.md](purchases-and-supplier-notes.md)). The three sources do not agree on one rule.
- Which rates and which value (price per piece, taxable value, line value) apply is for the CA (`POL-10.02`, `POL-10.05`, `POL-10.06`; design question GC7-2 in [shared-calculations.md](../design/calculations/shared-calculations.md)). Nothing here sets a rate or a slab.

### 3.10 `Cash` sheet

- Header row 3: `Date`, `Opening Balance`, `Cash`, `UPI`, `Swip`, `Dues`, `Cash`, `UPI`, `Swip`, `NSV`, `Bank Deposit`, `Cash Transfer to Ho`, `Ac No. / Person`, `Closing Balance`. Row 1 has a label "Cash Sale" over `C` and "Dues Recovery" over `G`; row 2 holds the totals (cash ₹11,68,776.95, UPI ₹14,81,530.83, swipe ₹4,86,619.56, dues ₹4,923.50, dues recovered ₹3,324.30, NSV ₹31,41,850.84, deposits ₹8,22,700, HO transfers ₹1,40,000).
- Formulas: `C` to `J` are `SUMIF` of the matching `Sale` column by date. `N` (closing) is `B + C - K - L + G`: opening plus cash sales minus deposit minus cash sent to head office plus dues recovered in cash. UPI and card never enter the cash balance. Opening of each day is the previous closing.
- Typed: only the first opening balance (₹73,885.59 on 1 Apr 2026, a hard-coded number), the bank deposits and the HO transfers.
- 33 deposits, 2 Apr to 30 May, ₹8,22,700 (April ₹5,07,100; May ₹3,15,600); smallest ₹2,300, largest ₹79,300; the gap between deposits is at most 5 days (median 1). No deposit after 30 May though cash kept coming in. 3 cash transfers to head office: 13 Apr ₹45,000, 6 May ₹45,000, 22 May ₹50,000. On those three rows `Ac No. / Person` holds text naming a person or account (not copied).
- Cash book: lowest ₹38,857.74 on 8 Apr; ₹2,83,286.84 on 5 Jun. The book never goes negative.
- Check (computed): opening ₹73,885.59 plus cash ₹11,68,776.95 minus deposits ₹8,22,700 minus HO ₹1,40,000 plus dues recovered ₹3,324.30 equals ₹2,83,286.84, as the sheet shows.
- Missing: any counted cash, denominations, variance, explanation, in-transit state or receipt from head office. The "bank deposit" is the amount the store typed, with no proof of credit in the bank file.
- Because UPI and card sales are not typed for 30 May to 5 Jun, only the cash columns of that week are complete.

### 3.11 `Stock In`, `SOH & Sale Summary`, `Stock Inward Details`

- `Stock Inward Details`: header row 3: `Date`, `Invoice No`, `Barcode no`, `Brand`, `Product`, `Style code`, `Size`, `QTY`, `MRP`, `Total MRP` (formula `I * H`). 12,121 dated lines, 1 Oct 2024 to 2 Jun 2026, 23,623 pieces, total MRP ₹3,49,12,387; 664 distinct invoice numbers plus the label `Audit Diff`, 11,964 distinct barcodes, 628 brands. By month: Oct 2024 1,548 lines; Feb 2026 1,316; Mar 2026 1,073; Apr 2026 799; May 2026 1,287; Jun 2026 54; the other months hold 45 to 864 lines.
- `Invoice No` is the document that brought the pieces to this store, mostly KDPS's own transfer numbers. Two styles: `25-26/WH/S-nnn` (7,844 lines) and `WH\S-nnn` (3,080 lines, a backslash); other sources `VAS`, `BGP`, `VAB`, `DEO`, `DMK`, `RKJ`, `JSL`, `KLG` and `JBNK` appear in one or both styles. Pieces by source: `WH` 20,970; `VAB` 921; `VAS` 920; `BGP` 281; `DEO` 157; `RKJ` 101; `DMK` 66; `JSL` 26; `KLG` 25; `JBNK` 19. `WH` is the warehouse; the other codes are other KDPS locations (guess; see [stores-and-codes.md](stores-and-codes.md)). `S-n` follows the same "S" convention as the `S-` bill series in `Sale` (stock movement; inferred).
- `Audit Diff`: 77 lines (136 pieces; 73 lines on 7 Apr 2025, 3 on 14 Jan 2026, 1 on 27 Jan 2026): stock found at audit and added as inward. It is the only place in these files where stock is added from an audit count.
- Barcodes: among the 10,975 lines with a numeric barcode, 7 digits on 6,432 lines (internal), 13 digits on 3,549 (EAN), 6 digits on 335, 15 digits on 253, 10 digits on 243 and 11 digits on 57; 1,148 lines hold a text barcode. 135 barcodes appear on more than one line (one 7 times); no barcode has two MRPs; 41 lines have quantity 0. Two lines (rows 11,715 and 11,716) have no date and no invoice number, and the first has no quantity.
- `Stock In`: pivot over `Stock Inward Details` columns C to I (rows barcode, brand, product, style code, size; data field named `Total SOH QTY`, the sum of inward `QTY`), then columns `Sold QTY` (`SUMIF` of `Sale` quantity by barcode), `Till Date Qty` (inward minus sold), `MRP` (lookup) and `Total MRP`. Cached totals: inward 23,623; sold 5,967; on hand 17,656; on-hand MRP ₹2,74,38,788. The pivot's label columns A to F are blank in this export.
- Reading: stock on hand here is inward since Oct 2024 less sales since 1 Apr 2026 only. Earlier sales are not deducted (inferred), so items sold before April still count as on hand. The 2,800 pieces on `S-` bills reduce it; returns add back. It is a comparison source, not a count.
- `SOH & Sale Summary`: row 1 `SUBTOTAL` with the total MRP ₹2,74,38,788 and zeros; a pivot on `Stock In` (`SUM of Sold QTY`, `SUM of Till Date Qty`, `SUM of Total MRP`) that is empty in the export.

### 3.12 `Bank Reconciliation` (copied from another store, broken)

- Header cell `A1` says "Vaishnavi Banka"; `B1` "MID No:-" and `C1` holds a card merchant ID (present, not copied). It has 168 date rows from 1 Apr to 15 Sep **2025**. The sheet was probably copied from the Banka store's workbook (inferred).
- Header row 3: `Date`, `Store Name`, `MID No`, `Opening Balance`, `Total Revenue`, `Cash sale`, `Swip Amt`, `Swip Satt Amt`, `Bank Charge (%)`, `Online UPI`, `UPI Satt Amt`, `Dues Sale`, `Dues Recover`, `Cash Dues Recover`, `UPI Dues Recover`, `Swip Dues Recover`, `Bank Deposit`, `Cash Transfer to (HO)`, `Bank Deposit Verified`, `Outstanding Balance`. "Satt" is settlement.
- Intended method (from the formulas): `Total Revenue` is cash plus swipe plus UPI plus dues recovery; `Bank Charge (%)` is `(Swip Amt - Swip Satt Amt) / Swip Amt`, the share of card sales lost between sale and settlement; `Outstanding Balance` is opening plus cash sale minus bank deposit minus HO transfer; `Bank Deposit Verified` is a manual tick; `Dues Recover` is the sum of its three tender parts.
- State: its links to the `Sale` sheet fail, so `MID No`, `Total Revenue`, `Cash sale`, `Swip Amt` (160 of 168), `Online UPI`, `Dues Sale`, the three dues columns, `Opening Balance` (167 of 168) and `Outstanding Balance` show `#ERROR!` or `#VALUE!` on every date row. What remains are hand-typed numbers: 91 `UPI Satt Amt` values for 1 Apr to 30 Jun 2025 (₹21,30,083.95 in all) and 8 `Swip Amt` values. `Swip Satt Amt`, `Bank Deposit`, `Cash Transfer to (HO)` and `Bank Deposit Verified` are empty.
- One threaded comment (cell `H47`, dated 6 Jun 2026) reads, in short, that ₹989 of a Banka card settlement was credited under the Killer Banka merchant ID, with a reply "CLEAR FILTER" (my reading of the terse text). It suggests card settlements are matched by hand and can land under another brand's terminal.

### 3.13 `Petty Cash`

- Header row 2: `Date`, `Opening Balance`, `Petty Cash Received`, `Staff Salary`, `Tea Snacks`, `Alteration`, `Courier & Cargo Exp`, `Wow Bill/ Incentive Expance`, `Rent`, `Electricity Bill`, `Water Exp`, `Net Charge`, `Show Room Repaire  Maint. Exp`, `Printing & Stationery Exp`, `Other Exp.  (if any)`, `Total Expance`, `Reason of Other Exp.`, `Closing Balance`. Twelve expense heads from `D` to `O`; spellings as in the file.
- Formulas: `Total Expance` is `SUM(D:O)`; closing is opening plus received minus total expense; opening is the previous closing. Row 1 is a total row. 395 date rows (1 Apr 2026 to 30 Apr 2027).
- Every figure is zero and no text is typed, so petty cash is not in use. No float limit, bill photo, top-up request or approver exists in the sheet.

## 4. `Bank statement.xlsx`

### 4.1 Layout and periods

- One sheet, 378 rows, columns A to F, hand-stitched from two bank downloads. The bank is probably ICICI (the card settlement narrations name `ICICIPOS`, and the Prem Clothing ledger pays from an ICICI overdraft account; guess).
- Rows 2 to 203: part 1. Header row 1 reads `Date`, `Narration`, `Date`, `Amount` (posting date, narration, value date, amount). 202 lines, 28 Mar to 14 Apr 2026. The amount column has no debit or credit marker. All 202 lines are outgoing (assumed; no inward narration appears). Amounts are numbers (199 whole, 3 with paise). Total ₹1,44,95,606.28.
- Row 204 is blank.
- Rows 205 to 378: part 2. No header row. Columns: `Date`, `Narration`, a blank column, `Date`, debit, credit. 174 lines, 1 to 6 Jun 2026. Amounts are mixed: debits 42 numbers and 12 text; credits 109 numbers and 11 text, the text in Indian comma format (`12,50,000.00`). Debits ₹88,10,690.12 (54 lines); credits ₹72,86,288.19 (120 lines).
- Gap: 15 Apr to 31 May 2026 is missing (47 days). No running balance, no opening or closing balance, no bank account number on the sheet.
- Posting date and value date agree on all lines except the two monthly interest lines (one in each part), where the value date is a day earlier.
- No line repeats (same narration and amount), so the two downloads do not overlap.

### 4.2 Part 1: outgoing items, 28 Mar to 14 Apr (computed)

| Kind (from the narration) | Lines | Amount |
| --- | --- | --- |
| NEFT payments (`INF/NEFT/...`) | 183 | ₹95,95,129 |
| Internal-style transfers (`INF/INFT/...`) | 11 | ₹15,98,866 |
| Automatic debit to a brand (`ACH/...`, Aditya Birla Lifestyle) | 2 | ₹24,99,228 (₹5,26,377 on 31 Mar and ₹19,72,851 on 14 Apr) |
| Interest collected on a loan or overdraft account (`Int.Coll`, for 2 Mar to 1 Apr) | 1 | ₹3,45,900 |
| Online bill payments (`BIL/...`): one loan EMI and three travel bookings | 4 | ₹4,36,833 (EMI ₹2,70,764; travel ₹1,66,069) |
| Cash-service fee (`RET04808_MAR2026_AD_EZ_CHG+GST`, EZCASH charges) | 1 | ₹19,651 |

- Narration style of a NEFT line: a bank reference, the beneficiary bank's IFSC code, an eight-digit reference and a tag. Most tags are the beneficiary's name (a person or a firm); a few are purposes such as "WH STOCK" (6 lines, ₹9.43 lakh), "PETTY CASH" (3, ₹36,000), "RENT" (1), "COMM" and "ADV SAL". Names are not copied.
- By beneficiary (computed by matching the tag's first letters to the supplier master in `KDPS INVOICE & OFFER DETAILS..xlsx`; rough): about 39 of the 234 NEFT and transfer lines in both parts (₹1.03 crore of ₹1.82 crore) go to firms that are in the supplier master. The other 195 lines (₹79 lakh) are mostly small: 171 are ₹50,000 or less (₹21.9 lakh in all) and look like payments to individuals.
- Busy days: 30 Mar 8 lines ₹31.2 lakh; 4 Apr 37 lines ₹11.6 lakh; 6 Apr 12 lines ₹16.6 lakh; 7 Apr 98 lines ₹15.2 lakh (median ₹10,516). The 7 Apr batch looks like a salary or reimbursement run (guess).

### 4.3 Part 2: 1 to 6 Jun 2026 (computed)

Credits, 120 lines, ₹72,86,288:

| Kind | Lines | Amount | Notes |
| --- | --- | --- | --- |
| Card settlements (`ICICIPOS SET ...`) | 57 | ₹6,08,137 | One credit per terminal per day. 21 distinct terminals (partial IDs in the narration; not copied). 6 to 12 lines a day: 1 Jun 10, 2 Jun 9, 3 Jun 6, 4 Jun 9, 5 Jun 11, 6 Jun 12. Per line from ₹619 to ₹40,495. Two narration forms: `FT-ICICIPOS SET ...` (45) and `EZY/ICICIPOS_SET_...` (12). The narration carries the settlement date, which equals the posting date on all 57. |
| PhonePe UPI settlements (`NEFT-...-PhonePe Limited-F09 ...`) | 6 | ₹19,32,592.21 | One per day, 1 to 6 Jun: ₹3,92,668.27; ₹3,28,224.29; ₹3,01,080.03; ₹3,05,034.86; ₹3,28,774.00; ₹2,76,810.76. The label in the narration is the same on all six and does not name a Store. |
| Cash deposits | 47 | ₹18,31,660 | By channel: bank branch deposits `BY CASH -<depositor>` 13 (₹5,70,000; the depositor's name is in the narration); cash-deposit machine lines `CAM/<machine>/CASH DEP.../<serial>` 17 (₹7,96,700); EZCASH retailer deposits `CSH/EZC...` 17 (₹4,64,960; the narration carries a retailer code and a town code such as DEO, BAN or KHA). 6 to 9 lines a day, ₹1.56 lakh to ₹4.46 lakh a day. |
| NEFT from parties | 5 | ₹18,34,972 | Two of ₹12,00,000 and ₹5,00,000 from one firm, others small. |
| RTGS from parties | 2 | ₹9,72,927 | |
| UPI from individuals | 2 | ₹1,00,000 | ₹50,000 each; UPI IDs are in the narration (not copied). |
| IMPS | 1 | ₹6,000 | Narration mentions carry bags. |

Debits, 54 lines, ₹88,10,690:

| Kind | Lines | Amount |
| --- | --- | --- |
| NEFT payments | 33 | ₹56,42,680 |
| Transfers (`INF/INFT`) | 7 | ₹13,67,943 |
| Automatic debit to the brand (`ACH/ADITYA BIRLA LIFESTY...`) | 1 | ₹11,88,805 |
| Online bill payments (`BIL/ONL/...` and a loan EMI of ₹2,70,764 on 5 Jun) | 11 | ₹3,62,264 |
| Interest collected (`Int.Coll`, 2 May to 1 Jun, posted 2 Jun) | 1 | ₹2,48,762 |
| Cash handling charge (`Cash Chg 01-31MAY26+GST`) | 1 | ₹236 |

- The `ACH` automatic debits to Aditya Birla total ₹36,88,033 over the two parts (₹5,26,377; ₹19,72,850; ₹11,88,805). They are payments to a supplier that appear in no payment column of the invoice tracker (see [purchases-and-supplier-notes.md](purchases-and-supplier-notes.md)).
- The monthly loan EMI is ₹2,70,764 on 5 Apr and 5 Jun; monthly interest ₹3,45,900 and ₹2,48,762. These are loan service, not store expenses.

### 4.4 Sensitive content in the bank file (not copied)

Beneficiary and depositor names in narrations (private individuals and firms), branch IFSC codes inside NEFT narrations, UPI IDs, partial card terminal IDs, a loan reference inside two narrations, the settlement account label of the UPI provider.

## 5. How settlement matching works today, and its limits

What the files show (inferred from the sheets; KDPS has not described the procedure):

1. Each day, the store types every bill line with its tender split. The `Cash` sheet adds them up by date.
2. Cash: the store deposits cash at a bank branch, a deposit machine or an EZCASH retailer and types the amount in `Bank Deposit` on the day it deposits. Cash sent to head office is typed in `Cash Transfer to Ho` with a person or account text. The bank file's cash credits (branch, machine, EZCASH) can be seen, but a deposit cannot be linked to a store from the narration alone: machine lines carry a machine ID, branch lines a depositor's name, EZCASH lines a retailer code and a town code.
3. Card: each terminal settles to the bank one credit per day. The intended match is `Swip Amt` (card sales typed from the POS) against `Swip Satt Amt` (the settlement for that store's terminal, found by the terminal ID in the narration), with `Bank Charge (%)` as the difference. The `Bank Reconciliation` sheet is built for this, but its card settlement column is empty and its links are broken. The `Tid No` column on `Sale` is empty, so no terminal is tied to any sale line. No table from terminal to Store exists in the files.
4. UPI: the sheet has `Online UPI` (sales) and `UPI Satt Amt` (settlement) per day. The only settlement amounts ever typed are 91 daily `UPI Satt Amt` values for the Banka store in Apr to Jun 2025 (₹21.3 lakh). The bank file has one PhonePe credit per day for all stores together under one label. Those typed amounts must therefore have come from a store-level report of the UPI provider, not from the bank statement (inferred).
5. Deposit verification is a manual tick that is empty everywhere.

Why UPI cannot be split by store from the bank file: the bank shows six credits (one a day) with ₹2.8 to ₹3.9 lakh each, with the same label and no store, device or bill reference. The daily total across all stores is not divisible without the provider's own per-store settlement report. By contrast, a card credit names its terminal, so card can be matched to a store once a terminal-to-Store table exists (inferred).

What cannot be matched with the files sent:

- The DSR's June deposits and settlements (none typed) against the bank file's 1 to 6 Jun credits.
- The DSR's April deposits (2 to 14 Apr, ₹1,36,200, plus a ₹45,000 transfer to head office on 13 Apr) against the bank file's April lines, which hold no credits.
- Part 2 cash credits (47 lines, ₹18.3 lakh) to any store sheet except by town code on the EZCASH lines.

## 6. Tender split in the POS sales reports (Cash, Card, Credit only; UPI unknown)

- The POS reports (the earlier POS's daily sales report) carry only three tender columns at the end of each bill's first line: `Cash`, `Card`, `Credit`. There is no `UPI` column, no card terminal, no provider reference and no tender sequence. Layout details are in [pos-exports.md](pos-exports.md).
- `Credit` is 0 on every bill in the files checked (Vaishnavi Deoghar, Hazaribagh, JSL 2026-27 and the Singh More sample). `Bill Amount` equals `Cash` plus `Card` plus `Credit` on every bill row of those files (computed).
- Observed totals (computed):

| File | Bills | Cash | Card | Credit | Notes |
| --- | --- | --- | --- | --- | --- |
| `store-analysis/VAISHNAVI/SALE REPORT 1 APRIL 25 TO 31 MARCH 26.xlsx` | 5,383 | ₹59.2 lakh | ₹1.075 crore | 0 | 177 bills use both cash and card; 110 bills have zero tender (probably carry bags and gifts). Card is 64.5%. |
| `store-analysis/VAISHNAVI/SALE REPORT 1st Apr 26 TO 13th Jun 26.xlsx` | 919 | ₹12.2 lakh | ₹19.7 lakh | 0 | The file has a total row and a repeated total. |
| `Q&A-req-recieved/SALE REPORT FORMAT.xlsx` | 21 (bills 1263 to 1283 of the Singh More series, 12 to 13 Jun 2026) | ₹28,850 | ₹24,467 | 0 | One bill uses both. |

- The Singh More DSR for April and May has UPI at about 50% and swipe at about 16% of NSV, so UPI plus swipe is about 65% (computed). The Deoghar and Hazaribagh POS files show about 65% as "Card" (computed). That fits UPI being counted under `Card` in the POS (guess), but the files do not say. Whether UPI is inside `Card`, inside `Cash`, or recorded elsewhere is OPEN.
- The DSR splits the POS tender into cash, UPI and swipe by hand. Its bill numbers (`26-27/SGMR/1` to `/1166` to 5 Jun) continue into the POS sample (`/1263` to `/1283` on 12 to 13 Jun), so the DSR's `Online Bill No.` is the POS bill number.
- Customer name and phone are on the POS bill; the DSR holds none.

## 7. Data-quality issues

- Empty columns that the design depends on: `Manual Bill No.`, `Sale Person`, `Tid No`. The `Check` column cannot fail. `Margin` is not margin.
- Two broken `Discount` formulas (rows 357 and 359); one stray `#REF!`.
- NSV is built from typed tenders; the last seven days have no UPI or card typed.
- 1,635 zero-tender lines in the `S-` series, plus 584 carry-bag lines and 23 free-gift lines at zero tender; the reason texts are free text with seven forms and a typo (`Stock Transferr`); 222 of 374 such lines carry real tender.
- 8 lines paid above MRP; 1 return line with no refund tender; bill number 343 missing; bill 283 on two dates; two dues sales, one recovered.
- Stock on hand counts inward since Oct 2024 against sales since Apr 2026; transfers count as sales; 2 misaligned inward lines; 41 zero-quantity inward lines; 135 repeated inward barcodes.
- The `Bank Reconciliation` sheet is for another store and year and returns errors; the `Petty Cash` sheet is unused.
- Bank file: two layouts in one sheet (header only for the first); no debit or credit marker in part 1; amounts mix numbers and text in part 2; a 47-day gap; no balances.
- Totals and sources: the `L1` total in `Sale` is meaningless; pivots lose their labels in the export.
- Sensitive content: card merchant ID in a header cell; person-or-account text on the head office transfers; names, IFSC codes, UPI IDs and partial terminal IDs in the bank narrations.

## 8. Mapping to the PRD and policies

Each ID was checked in `docs/prd.md` or `docs/kdps-policies.md`.

| Area in the data | PRD and policy IDs | What the data shows against the rule |
| --- | --- | --- |
| Tenders: cash, card, UPI; split allocation | `PRD-POS-005`, `PRD-POS-006`, `POL-07.09` | The DSR records cash, UPI, swipe and dues by hand; the POS report has no UPI. |
| Manual card and UPI amounts against provider confirmation and bank settlement | `PRD-POS-010`, `PRD-POS-011`, `PRD-CSH-006` | Provider reference and confirmation state do not exist in the sheet; settlement is matched by hand, if at all. |
| Salesperson on each line | `PRD-POS-002` | `Sale Person` is empty on all 4,780 lines. |
| Bill series per device, tax registration and year | `PRD-POS-020` | The `S-` series is a second series on one store's workbook, typed as sales, with zero tender. |
| Dues sale and recovery | `PRD-POS-022`, `PRD-CSH-003` | Two lines; no customer, limit or due date. Recovery typed as a new zero-quantity line. |
| Price not above MRP | `PRD-POS-024` | 8 lines with tender above MRP. |
| Returns, refunds by original tender | `PRD-RET-005`, `PRD-RET-010`, `PRD-RET-022` | Return lines carry no link to the original bill; refund is a negative tender amount. |
| Tax by classification, rate and value slab; tax effect of discounts | `PRD-OFR-005`, `PRD-TAX-005`, `POL-10.02`, `POL-10.05`, `POL-10.06` | The sheet's 12/112 and 18/118 split by line value; OPEN for the CA. |
| Transfers kept distinct from sales; no markup; dispatch and receipt | `PRD-TRF-001`, `PRD-TRF-003`, `PRD-TRF-005`, `PRD-TRF-012`, `PRD-TRF-013`, `PRD-LED-015` | Transfers out are typed as zero-tender sales on the `S-` series; no approval, dispatch or destination count. |
| Opening cash, inflows, outflows against a counted amount | `PRD-CSH-001`, `PRD-CSH-002` | The balance is calculated; no count, no recount. |
| Cash variance, explanation, approval | `PRD-CSH-011`, `POL-02.13`, `PRD-EXC-001` | None recorded; no tolerance or approver set. |
| Collections, dues recovery, cash transfers kept separate | `PRD-CSH-003` | The `Cash` sheet separates sales cash, dues recovery, deposits and HO transfers. |
| Petty cash | `PRD-CSH-004`, `POL-09.14`, `PRD-PAY-014` | Twelve expense heads exist and are unused; no float limit is set (`POL-09.14` says limits are unset). |
| Pickup, safe handover, deposit, cash in transit | `PRD-CSH-005` | A deposit is typed as done on the day; no in-transit state. Cash to head office has an unnamed receiver. |
| Match POS totals to card and UPI reports and bank credits; fees, refunds, net settlement | `PRD-CSH-006` | `Bank Charge (%)` is the intended fee; the sheet is broken. |
| Bank statement import without duplicates; matching with confidence; unmatched lines to review; settlement imports | `PRD-CSH-007`, `PRD-CSH-008`, `PRD-INT-011` | Two layouts, text amounts, a gap, no balance; the file has no duplicate lines. |
| Narrations that link a bank movement to a Store and a purpose | `PRD-CSH-009` | Card narrations name a terminal; UPI narrations name no Store; cash narrations name a depositor or a retailer and town; payments carry mostly a beneficiary name. |
| Cash counting, settlement and bank reconciliation as separate outcomes | `PRD-CSH-010` | All three are mixed in one sheet. |
| A bank account serving several books; reconciliation of cash and bank balances | `PRD-LED-002`, `PRD-LED-008` | One company-level extract for the whole network. |
| Loans, advances, floats and expenses kept apart; payments marked paid from bank evidence | `PRD-PAY-004`, `PRD-PAY-007`, `PRD-PAY-008` | Loan EMI and interest sit among supplier payments; the supplier auto-debits are not recorded on the supplier side. |
| Imported daily sales and SOH are comparison evidence only | `PRD-LIF-013`, `PRD-LIF-014`, `PRD-LIF-010`, `PRD-IMP-010` | The DSR stock figure is a sheet total of inward less sales; it creates nothing. |

Gaps (no PRD home found, or the PRD asks for what the data lacks):

- A store day close with counted cash and variance. The PRD asks for it (`PRD-CSH-001`, `PRD-CSH-011`); the data has none.
- A terminal registry (card terminal and merchant IDs to Store and business unit), needed to match card settlements by terminal. Not found in the PRD as a named record.
- A provider's per-Store UPI settlement report as an import source for UPI matching (`PRD-CSH-006` names card and UPI provider reports in general).
- Cash deposit channels (branch, deposit machine, EZCASH retailer) and their fees as bank movements; `PRD-CSH-009` covers narration references only.
- "Wow Bill/ Incentive Expance" and "Net Charge" as petty-cash heads; heads are not defined anywhere in the PRD.
- Free-gift and carry-bag items billed at ₹7 or ₹0 as stock movements. The PRD has no free-gift record (see the offers note for the offer side).

## Open questions

| # | Question | Owner |
| --- | --- | --- |
| 1 | Which town is "Singh More", and what do the codes `SGMR` and the stock sources (`WH`, `VAS`, `BGP`, `VAB`, `DEO`, `DMK`, `RKJ`, `JSL`, `KLG`, `JBNK`) stand for? | Product owner, KDPS Owner |
| 2 | What is the rule for recording stock leaving a store (valued at what, in which tender)? Is the `S-` bill series the intended transfer document, and what do the 1,576 reasonless lines mean? | Operations (P-OPS), Accounts |
| 3 | Is the GST rule in the DSR (12/112 below ₹2,500 and 18/118 from ₹2,500, on the value of the line) correct? Which rates and which value apply at the counter? | CA, Accounts |
| 4 | Do stores physically count cash each day? Where are the counted amount, denominations and variance recorded, and who approves a difference? | Store manager (P-STM), Accounts |
| 5 | Where do per-Store UPI settlement amounts come from (the PhonePe merchant report?), and is UPI settled as one credit a day for all stores? | Accounts |
| 6 | Which card terminal and merchant IDs belong to which Store? Is a terminal ever shared between stores? How many settle a day, and on which day does each settle? | Accounts |
| 7 | Is UPI recorded inside `Card` or `Cash` in the earlier POS? | Accounts, Store manager (P-STM) |
| 8 | Why does the `Bank Reconciliation` sheet hold the Banka store's 2025 data, and which store sheets use it for real? | Accounts |
| 9 | Why is 15 Apr to 31 May missing from the bank extract? Can the full period, a consistent export, other accounts and the account balance be supplied? | Accounts |
| 10 | Why are UPI and card empty for 30 May to 5 Jun in the DSR? Are they typed later from provider reports? | Store manager (P-STM), Accounts |
| 11 | Who receives cash sent to head office, and how is receipt confirmed? What does `Ac No. / Person` record? | Accounts, KDPS Owner |
| 12 | How are dues sales approved (limit, due date), and who chases recovery? | KDPS Owner, Accounts |
| 13 | Why are carry bags billed at ₹7 with 100% discount and trolleys at zero tender? Are they stock items? | Store manager (P-STM), Operations (P-OPS) |
| 14 | Who fills `Sale Person`, and how are incentives worked out while it is empty? | HR (P-HRS), Store manager (P-STM) |
| 15 | When will petty cash start, which heads are allowed (what are "Wow Bill/ Incentive Expance" and "Net Charge"), and what float and limits apply? (`POL-09.14` says they are unset.) | Accounts, KDPS Owner |
| 16 | Why do 8 lines carry tender above MRP, and what happens to a return line with no refund tender? | Store manager (P-STM), Accounts |
| 17 | Which POS produces the card and cash columns, and does it hold UPI anywhere? | Product owner |
| 18 | Which fees apply to EZCASH and cash-deposit channels (the March fee of ₹19,651 and the May handling charge of ₹236), and do they follow a monthly schedule? | Accounts |
