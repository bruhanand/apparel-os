# vendor-files

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [05-reference-data](../README.md). Notes: [docs/data-notes](../../../data-notes/README.md).

## What this folder is

- Four documents about two suppliers, copied into the folder on 6 May 2026 (the documents themselves were made between 22 and 25 Apr 2026):
  - two supplier ledgers (one from KDPS's own Tally books, one from a supplier's books);
  - one photographed vendor tax invoice for goods delivered to the Deoghar Store;
  - the PT file made for that invoice.
- They are examples for three ERP tasks: matching an invoice to its PT file and to counted stock; matching a supplier ledger to payables; and reading a scanned invoice with AI (an AI reading is always a reviewable draft).
- Who made them: the ledgers and the invoice come from accounting software (see each block); the PT file's author is not clear.

## Files

### `Prem Clothing Ledger FY- 2025-26.pdf`

- **What it is.** A one-page supplier ledger account for the supplier Prem Clothing (Jamshedpur), printed from KDPS's own accounting book for 1 Apr 2025 to 31 Mar 2026.
- **Made by.** KDPS Accounts. The PDF properties name TallyPrime as author and creator, title "Ledger Voucher", created 25 Apr 2026. The company line at the top reads "KDPS LIFESTYLE PVT LTD JH 24-25 - (from 1-Apr-24)": the Jharkhand company file in Tally, opened 1 Apr 2024 (inferred). It is a real text PDF (2,226 bytes).
- **Layout.** Header lines (KDPS company and its Deoghar address, a KDPS email, the supplier name and address), then `Ledger Account`, the period, `Page 1`, and the table with the columns `Date`, `Particulars`, `Credit`, `Debit`, `Vch No.`, `Vch Type` as the text layer reads them.
- **Entries (11).** 7 purchases and 4 payments.
  - Purchases: `Particulars` "Dr GST LOCAL PURCHASE", `Vch Type` `Purchase`, voucher numbers `25-26/0114`, `25-26/0169`, `25-26/0170`, `25-26/0230`, `25-26/0252`, `25-26/0554`, `25-26/0556`. Dates 22 Apr 2025 to 11 Nov 2025. Amounts Rs 33,100, 38,972, 39,822, 22,620, 15,782, 27,052 and 19,323.
  - Payments: `Particulars` "Cr" plus an ICICI Bank overdraft ledger name (no account number), `Vch Type` `Payment`, voucher numbers 458, 652, 653 and 1002, dated 14 May, 31 May (two) and 8 Jul 2025. Amounts Rs 33,100, 38,972, 39,822 and 38,402.
- **Totals.** Purchases Rs 1,96,671; payments Rs 1,50,296; `Cr Closing Balance` Rs 46,375 (still payable); both sides total Rs 1,96,671.
- **What reconciles.** Three payments equal three purchases one for one. The payment of 8 Jul 2025 (38,402) equals two purchases together (22,620 + 15,782). The two purchases of 11 Nov 2025 (27,052 + 19,323 = 46,375) are unpaid and equal the closing balance.
- **Quirks.** Several entries on one date show the date once. Amounts and voucher numbers run together in the text layer ("33,100.0025-26/0114"), so a text reader must split them.
- **Sensitive.** Supplier address and KDPS email present (not copied). No bank account number.
- **Notes.** [purchases-and-supplier-notes.md](../../../data-notes/purchases-and-supplier-notes.md).

### `OMKAR CREATION.pdf`

- **What it is.** A one-page ledger of the supplier Omkar Creation (Jaipur), printed from the supplier's own accounting software for "KDPS LIFESTYLE PVT LTD, RANCHI", period 1-4-2025 to 22-4-2026.
- **Made by.** The supplier. PDF producer "Synactis All In-The-Box version 3.12", created 22 Apr 2026. Text PDF (8,585 bytes).
- **Layout.** Header with the supplier name, address, GSTIN and Udyam number (present, not copied), title `L E D G E R`, then the table: `Date`, `Type`, `Vch No.`, `Particulars`, `Narration`, `Debit`, `Credit` and `Balance`, each with a rupee unit in its heading (the rupee sign shows as a back-tick in the text layer).
- **Entries (1).** `Sale`, voucher `GT/25-26/1662`, dated 24-01-2026, `Particulars` "Cr Sales", `Debit` Rs 79,643, balance Rs 79,643 `Dr`. `Narration` is empty. The foot shows `Total` 79,643 and 0, `Debit Balance` 79,643 and `Grand Total` 79,643 both sides.
- **Reading.** In the supplier's books KDPS owes Rs 79,643 and has paid nothing against it up to 22 Apr 2026. The account is under the Ranchi office name; which Store the goods went to is not stated.
- **Sensitive.** Supplier GSTIN and Udyam number (present, not copied).
- **Notes.** [purchases-and-supplier-notes.md](../../../data-notes/purchases-and-supplier-notes.md).

### `VSN DEO DA-26-27-0119.pdf`

- **What it is.** A tax invoice of the vendor D Apparel (Ranchi) to KDPS Lifestyle Pvt. Ltd. - Deoghar, photographed or scanned from paper: 6 pages of images, no text layer (5,815,368 bytes). PDF producer "OpenPDF", created 25 Apr 2026. The pages are skewed, with a torn corner and shadows on some pages. The file name probably reads "VSN" for the Vaishnavi Store and "DEO" for Deoghar (guess).
- **Header fields.** `Invoice Serial Number` `DA/26-27/0119`; `Invoice Date` 20-Apr-26; `Due Date` 30 Days; `GSTIN No.` (present); `Transportation Mode`, `Transport Details`, `Document Through` and `Billed By` are blank; `Place Of Supply` Jharkhand. `Details of Receiver(Billed to)` and `Details of Consignee(Shipped to)` are both KDPS Lifestyle Private Limited-DEO, Deoghar, state code 20 (a mobile number and GSTIN are present, not copied). The vendor's header and phone numbers repeat on every page.
- **Line table.** Columns `SR NO`, `PRODUCT NAME`, `HSN CODE`, `MRP`, `QTY`, `RATE`, `Disc %`, `TAXABLE AMOUNT`, `GST %`, `CGST AMT`, `SGST AMT`, `TOTAL`. Each product line is followed by a second line "Size / Qty : 3XL 1". 102 lines, numbered 1 to 102. Page 1 carries lines 1 to 21 and page 3 carries lines 44 to 65; the last line, number 102, is alone on page 6. Product names look like `SQ-CL-26099 (PKT) WHITE 617 3XL`, `KD-CL-8017 MINT 718 16`, `CR-TRK-111 FAWN 637 M`, `TRK-26269 BEIGE 259 M`: design code, colour, a number, size. The `Disc %` column is blank.
- **Tax.** `GST %` is 5 on every line, split 2.5 and 2.5. HSN codes seen: 61091000 (T-shirts) and 61033200 (tracksuit bottoms (inferred)).
- **Totals (page 6).** `TOTAL` 124.00 pcs; taxable Rs 1,14,156.90; `Sub Total` Rs 1,14,156.90; `DISCOUNT ALLOWED` blank; `Motiya` Rs 50.00; `Bus Fare` blank; `CGST` Rs 2,855.03; `SGST` Rs 2,855.03; `Rounding Off` Rs 0.04; `GRAND TOTAL` Rs 1,19,917.00, with the amount in words. A tax summary by HSN: 61091000 taxable Rs 90,422.68 and 61033200 taxable Rs 23,784.22, together Rs 1,14,206.90 (the 50 of `Motiya` is inside the tax base), tax Rs 4,520.88 and Rs 1,189.18, total tax Rs 5,710.06.
- **Handwriting.** Numbers written by hand beside the two HSN codes in the tax summary (read as 79 and 25; the meaning is not stated, perhaps a tally by the receiver (guess)).
- **Footer.** "FOR D Apparel", "AUTHORISED SIGNATORY", "SUBJECT TO RANCHI JURISDICTION", "This is a Computer Generated Invoice".
- **Unclear terms.** `Motiya` and `Bus Fare` are small charge lines; their meaning is not stated (guess: handling and transport). OPEN: Accounts.
- **Sensitive.** Vendor and KDPS GSTINs and phone numbers are present on every page. No customer data.
- **Matches.** `DA-26-27-0119 VAISHNAVI DEOGHAR PT FILE.xlsx` has 124 piece rows and 102 distinct barcodes, equal to the invoice's 124 pieces and 102 lines. The vendor `D Apparel` also appears in `../../KDPS INVOICE & OFFER DETAILS..xlsx` and in the debit note sheets (see the [top README](../../README.md)).
- **Notes.** [purchases-and-supplier-notes.md](../../../data-notes/purchases-and-supplier-notes.md), [pt-file-layouts.md](../../../data-notes/pt-file-layouts.md).

### `DA-26-27-0119 VAISHNAVI DEOGHAR PT FILE.xlsx`

- **What it is.** The PT file for invoice `DA/26-27/0119`, in the 20-column KDPS layout.
- **Made by.** Not clear: the vendor, KDPS Booking staff or the ERP team. The file was last saved on 25 Apr 2026 09:38 UTC (the properties hold no author). Whether the vendor or KDPS fills such files is an open question.
- **Sheets (3).** `Sheet1`, `Sheet2` and `Sheet3`; `Sheet2` and `Sheet3` are empty. `Sheet1` used range `A1:T126`, AutoFilter `A1:T1`, no freeze pane, no drop-downs, no formulas (values only).
- **Header (row 1), columns A to T.** `SEASON`, `BRAND`, `COLOR`, `GENDER`, `SUB CATEGORY`, `TYPE`, `ITEM`, `FIT`, `SIZE`, `BARCODE`, `DESIGN`, `HSN`, `QTY`, `MRP`, `BASIC`, `P RATE`, `INPUT TAX`, `OUTPUT TAX`, `NAG`, `MARGIN`.
- **Rows.** 124 piece rows (rows 2 to 125) and one stray row 126 holding only `SEASON`, `BRAND`, `COLOR` and `FIT`.
  - Constant on all rows: `SEASON` `SPRING SUMMER(Apr-26)`, `BRAND` `STATUS QUO`, `COLOR` `PREMIUM`, `FIT` `SLIM`, `SUB CATEGORY` `CASUAL WEAR` (124 rows), `INPUT TAX` 5, `OUTPUT TAX` 5, `NAG` 1, `QTY` 1, `MARGIN` 22.
  - `ITEM` and `TYPE`: `T-SHIRT` 99 (`TOP WEAR`) and `LOWER` 25 (`BOTTOM WEAR`). `GENDER`: `MALE` 62 (`T-SHIRT` 37, `LOWER` 25) and `KIDS MALE` 62 (`T-SHIRT`).
  - `SIZE`: letters `S` to `4XL` on 62 rows (`L` 20, `M` 17, `XL` 13, `XXL` 5, `S` 4, `3XL` 2, `4XL` 1) and kids' numbers 8 to 16 on 62 rows (`14` 14; `8`, `10`, `12`, `16` 12 each).
  - `BARCODE` is a 13-digit number on every piece row: 102 distinct, 21 repeated up to 3 times (one row per piece). `DESIGN` has 12 values (for example `SQ-CL-26099 (PKT)`, `TRK-26269`, `KD-CL-8011`). `HSN` 61091000 on 99 rows and 61033200 on 25. `MRP` runs from 999 to 2,299.
- **Money.** `BASIC` is a whole rupee on every row (the invoice rate is in paise) and is 65.0% of `MRP`; `P RATE` = `BASIC` × 1.2 pasted as a value (rounded to paise); `MARGIN` is the constant 22. The sum of `BASIC` over the 124 rows is Rs 1,14,115 against the invoice taxable value of Rs 1,14,156.90, a difference of Rs 41.90 from rounding.
- **Reading.** `BASIC` equals the invoice rate rounded to the rupee (inferred from the check above), not the rate with `Motiya` or tax.
- **Sensitive.** Cost and margin (as an aggregate only here).
- **Notes.** [pt-file-layouts.md](../../../data-notes/pt-file-layouts.md), [item-master-vocabulary.md](../../../data-notes/item-master-vocabulary.md).

## Subfolders

None.

## Open questions

Full list: [open-questions.md](../../../data-notes/open-questions.md).

- Who fills the vendor PT file (the vendor, KDPS Booking or the ERP team), and must `BASIC` match the invoice rate exactly (paise) or may it be rounded to the rupee? Owner: KDPS Owner, Accounts. Blocks the stage 2 goods-in check of PT against invoice.
- What are `Motiya` and `Bus Fare`, and are they part of the cost of the goods? Owner: Accounts, CA. Blocks costing profile configuration.
- Is the Tally company "JH 24-25" the book KDPS treats as official for Jharkhand, and how are company files named for later years? Owner: Accounts, CA. Blocks the book settings in stage 1.
- Why does Omkar Creation's ledger name the Ranchi office, and which Store received the goods? Owner: Accounts.
