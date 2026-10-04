# Purchases, supplier terms, supplier returns and supplier ledgers

> **Not ranked.** These notes describe the data KDPS sent. They decide nothing. A PRD or policy change they lead to needs an entry in [decisions.md](../decisions.md) first. See [README.md](README.md).

This note covers how KDPS tracks purchase invoices, supplier terms, debit and credit notes, supplier ledgers and the purchase documents that came as PT files. Raw files are not in git; they are named here in backticks. Sensitive values (supplier bank accounts, IFSC codes, agent names and phone numbers, GSTINs, Udyam numbers, addresses) are present in the files and are not copied. Figures marked "(computed)" were worked out from the file by the notes' author, not read from a total cell.

Related notes: [pt-file-layouts.md](pt-file-layouts.md) (the PT layouts themselves), [offers-and-brand-reports.md](offers-and-brand-reports.md) (the offer calendar), [stores-and-codes.md](stores-and-codes.md) (store and location codes), [pos-exports.md](pos-exports.md) (POS exports).

## 1. Sources

| File | Folder | What it is | Sheets or pages |
| --- | --- | --- | --- |
| `KDPS INVOICE & OFFER DETAILS..xlsx` | root of `data-from-kdps` | Accounts and merchandising tracker of supplier invoices, supplier master, offers and party ledger summary. Hand-maintained, Excel (threaded comments, one pivot table, about 14,000 lookup formulas). Last saved about 15 Jun 2026 (computed from the cached ageing values). | 6 (one hidden) |
| `KDPS DEBIT & CREDIT NOTE DETAILS.xlsx` | root | Accounts tracker of debit notes (DN) raised on suppliers, credit notes (CN) received, claims and settlements; plus the item lines of the returns, exported from software. | 8 (three hidden) |
| `SUPPLIER BRAND DETAILS.xlsx` | `Q&A-req-recieved` | Brand to supplier map and a Yes/No flag per supplier. | 2 |
| `Prem Clothing Ledger FY- 2025-26.pdf` | `05-reference-data/vendor-files` | One supplier's ledger printed from KDPS's own books (Tally-style). | 1 page |
| `OMKAR CREATION.pdf` | `05-reference-data/vendor-files` | One supplier's ledger of KDPS, printed from the supplier's books. | 1 page |
| `VSN DEO DA-26-27-0119.pdf` | `05-reference-data/vendor-files` | Photographed supplier tax invoice, six pages, images only. | 6 pages |
| `DA-26-27-0119 VAISHNAVI DEOGHAR PT FILE.xlsx` | `05-reference-data/vendor-files` | The PT file for that invoice. | 3 (two empty) |
| Purchase-like PT files | `Q&A-req-recieved/PT FILE` | The folder holds 33 files; most are supplier invoices or supplier sales registers exported as PT files (section 7). | varies |

Folder READMEs: [vendor-files](../data-from-kdps/05-reference-data/vendor-files/README.md), [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md), [PT FILE](../data-from-kdps/Q&A-req-recieved/PT%20FILE/README.md).

## 2. Key facts

- Purchasing today runs on spreadsheets. One row per supplier invoice, one PDF soft copy per invoice, and (from April 2026) one PT workbook per invoice.
- `INVOICE DETAILS.` holds 1,480 rows. Only 942 carry a date and a value (940 also a quantity); they cover 28 Oct 2024 to 1 Jun 2026 but 97.5% fall between Jan and Apr 2026. The other 538 rows hold only a file name, waiting to be typed.
- Typed totals for the 942 dated rows: 54,487 pieces and ₹6,77,63,895.84 (₹6.78 crore).
- The tracker has no payment status. Payment is "known" when a payment amount and date are typed (49 rows, ₹23.5 lakh, 3.5% of the dated value).
- The debit and credit note workbook tracks 345 DNs across two sheets (₹2.40 crore); the software summary lists 473 DNs (₹3.94 crore) for the two financial years. 208 DNs worth ₹1.57 crore are still "PENDING" on the two tracking sheets.
- The "FRENCHEEZI" column names two KDPS-side legal entities that claims are booked under: KDPS Lifestyle Pvt Ltd and Om Ganpati Enterprises.
- Totals disagree between sheets in several places (section 9). Dates are corrupted by day and month swaps in at least three places (section 10).

## 3. `KDPS INVOICE & OFFER DETAILS..xlsx`

### 3.1 Sheet map

| Sheet | State | Used area | Columns | Role |
| --- | --- | --- | --- | --- |
| `Arvind & LC Invoice Details.` | hidden | 67 invoices in rows 3 to 69; formatted to row 1001 and column AB | 15 used (`Supplier Name` to `Margin Analysis Status`) | Earlier tracker for one supplier (Vishal Marketing & Company) for Arvind brands and Linen Club, season AW'25. |
| `OFFER DETAILS.` | visible | 104 rows; formatted to 999 | 8 (`Brand Name`, `Offer Type`, `Season`, `Offer Details`, `Offer Starting Date`, `Offer Closing Date`, `Offer Status`, `Offer Artwork`) | Offer calendar for six brands. Described in [offers-and-brand-reports.md](offers-and-brand-reports.md). |
| `SUPPLIER DATA BASE` | visible | 261 supplier rows; formatted to row 936 and column T | 13 used, A to M | Supplier master. |
| `INVOICE DETAILS.` | visible | rows 3 to 1482 (1,480 rows); formatted to row 1994 | 22 used, A to V | Main invoice tracker (title cell: "Other Invoice Details"). |
| `COMPILED PT FILE` | visible | 12 data rows; 1,000 rows pre-built | 22 (A to V) | Intended roll-up of PT lines with the invoice number and date looked up. |
| `SUMMARY` | visible | pivot of 127 supplier rows; 115 rows carry a computed due amount | 8 (A to H) | "KDPS PARTY LEDGER SUMMARY". |

Other facts: a filter sits on every sheet. `INVOICE DETAILS.` column A has a drop-down fed from `SUPPLIER DATA BASE` column A, and column V has a drop-down of three financial years (`FY 24-25`, `FY 25-26`, `FY 26-27`). Comments: four threaded comments on the hidden sheet (section 3.8) and two on `INVOICE DETAILS.` whose text is only a supplier name (one marked "resolved").

### 3.2 The invoice tracking process, as the sheets show it

This is read from the columns and drop-downs. KDPS has not described it in writing.

1. A supplier invoice arrives as a PDF. The file is saved with a name that follows a loose convention (section 3.6) and a row is added to `INVOICE DETAILS.` with the file name in `Invoice Soft Copy`.
2. Someone types the header: `Supplier Name` (pick from the master), `Invoice No`, `Invoice Date`, `Invoice Qty`, `Invoice Value`. Brand, credit days, CD % and agency company fill in by lookup from the supplier master.
3. Since April 2026 a PT workbook is prepared for each invoice and its file name is typed in `PT File Excel Sheet`. Before April the column holds "-".
4. The PT file is "uploaded in TEN" and the date is typed in `TEN Uploaded Date`. TEN is probably the earlier POS and stock software (inferred from other files); it is not explained.
5. Goods are received at a Site. The hidden sheet records where in `Stock Remarks`, and whether the article was booked (`Booking Status`).
6. A margin check is tracked as `Margin Analysis Status` (hidden sheet only).
7. Payment: `Payment Amount`, `Payment Date`, `CD Amount` (cash discount) and `GR Amount` (goods return value) are typed. `Invoice Ageing` is a formula.
8. Returns go to the separate debit and credit note workbook (section 4).

The hidden sheet has a drop-down `Invoice Status` with six values: `Uploaded In TEN`, `Invoice Not Received`, `PT File Not Received`, `PT File Done Not-Uploaded In TEN`, `Inward Pending`, `Product Not Received.` (the last value keeps its full stop). It reads as a pipeline: invoice not received, PT file not received, PT file done but not uploaded, inward pending, product not received, uploaded. All 67 rows say `Uploaded In TEN`. The visible `INVOICE DETAILS.` has no status column; its status is implied by the PT file name and TEN date.

### 3.3 `INVOICE DETAILS.` columns

Header on row 2. Row 1 holds totals and the "NEED TO UPDATE" counter.

| Col | Header | How it is filled | Notes |
| --- | --- | --- | --- |
| A | `Supplier Name` | typed, drop-down | 126 distinct names, all present in `SUPPLIER DATA BASE`. Blank on 66 rows (24 of them dated). |
| B | `Brand Name` | VLOOKUP on the supplier master | One brand per supplier, so suppliers of many brands show "-" or a combined text. |
| C | `Agency Company` | VLOOKUP | "-" on 1,166 of 1,383 filled rows. |
| D | `Credit Days` | VLOOKUP | Number, "NO", "NIL" or "-". |
| E | `CD %` | VLOOKUP | Cash discount; fraction, whole percent or text (section 3.7). |
| F | `Invoice No` | typed | 1,092 text, 162 numbers, 5 mangled into dates (years 1953, 2242, 2382, 2401, 2408). |
| G | `Invoice Date` | typed | 942 real dates. |
| H | `Invoice Qty` | typed | 940 values. |
| I | `Invoice Value` | typed | 942 values; tax-inclusive (inferred from invoices that tie to PT files, sections 3.9 and 6.4). |
| J | `Invoice Soft Copy` | typed | A file name on 1,478 rows: 1,475 `.pdf`, 2 `.xlsx` (internal transfer lists, guess), 1 with no extension. |
| K | `PT File Excel Sheet` | typed | File name (778 `.xlsx`, 1 `.xls`) or "-" on 695 rows. |
| L | `TEN Uploaded Date` | typed | A date on 25 rows (3 to 14 Apr 2026); "-" on 602; blank on 853. |
| M | `Invoice Ageing` | formula `TODAY() - G` joined with " Days" | Text such as `595 Days`. Never stops at payment. No due date column. |
| N | `Bank Name` | VLOOKUP | Holds the account holder name from the master, not a bank name. |
| O | `Bank Account` | VLOOKUP | A real value on 661 rows; "-" on 738. Not copied. |
| P | `IFSC Code` | VLOOKUP | As above. Not copied. |
| Q | `Payment Amount` | typed | 49 rows. |
| R | `Payment Date` | typed | 47 rows. |
| S | `CD Amount` | typed | 17 rows (one says "NIL"). |
| T | `GR Amount` | typed | 1 row. |
| U | `Remarks` | typed | 12 rows: "BILL 33 & 34 PAID TOGETHER", "BILL PAY - ..." with three bill numbers, "258 & 196 PAID", "DONE", and "CONSIGNMENT" on two rows. |
| V | `Accounting Year` | formula on invoice date | `FY 24-25`, `FY 25-26` or `FY 26-27`. |

Formula quirks: the four lookup formulas test `$A$3` (an absolute cell) instead of the row's own supplier, so they depend on the first row. The lookups use one value per supplier, which cannot hold a supplier that sells several brands. Row 1: `F1` counts invoice numbers (1,259), `H1` sums quantity (54,487), `I1` sums value (₹6,77,63,895.84), `J1` reads "NEED TO UPDATE: 219" (soft copies listed, 1,478, minus invoice numbers typed, 1,259), `Q1` payments (₹23,50,486), `S1` CD (₹96,300.60), `T1` GR (₹2,145).

### 3.4 Counts, totals and coverage (computed)

| Measure | Value |
| --- | --- |
| Rows in the data area | 1,480 (rows 3 to 1482) |
| Rows with a supplier | 1,414 |
| Dated rows (rows 3 to 944) | 942 |
| File-name-only rows (rows 945 to 1482) | 538: all have a soft copy name and a PT file name; 317 have an invoice number (Aditya Birla); none has a date, quantity or value |
| Dated rows by financial year | `FY 24-25` 1; `FY 25-26` 699; `FY 26-27` 242 |
| Dated rows by month | Oct 2024 1; Aug 2025 1; Sep 2025 1; Oct 2025 3; Nov 2025 1; Dec 2025 8; Jan 2026 72; Feb 2026 243; Mar 2026 371; Apr 2026 232; May 2026 6; Jun 2026 3 |
| Quantity (dated rows) | 54,487 pieces (2 dated rows have no quantity) |
| Value (dated rows) | ₹6,77,63,895.84: `FY 24-25` ₹36,223; `FY 25-26` ₹5,15,71,979; `FY 26-27` ₹1,61,55,694 |
| Average value per piece | ₹1,240 |
| Invoice value | median ₹36,319; 12 invoices above ₹5 lakh; largest ₹7.70 lakh |
| Aditya Birla rows | 632 (315 dated: 10,119 pieces, ₹1,72,81,790); 317 more are file-name-only |
| Share of dated value | Aditya Birla 25.5%, Jain Adishwar Hosiery Works 12.0%, Vishal Marketing 10.1%, D D Sales 7.1%, Saraogi Super Sales 4.6% |
| Distinct suppliers | 126 on the tracker; 115 among dated rows |

Readings:

- The tracker was built for the Jan to Apr 2026 backlog. Only 14 dated rows are earlier than January 2026. The only earlier invoices kept anywhere in the file are the hidden sheet's, and only for one supplier (section 3.8).
- The 538 file-name-only rows are the backlog queued behind the dated ones. Row 945 onwards is clearly a second batch, not interleaved.
- No supplier plus invoice number pair repeats among the dated rows. Four numbers (118, 151, 29 and 25-26/2665) appear under two different suppliers, which is normal when numbers are per supplier. Four Aditya Birla invoice numbers are listed twice among the file-name-only rows. The text "NOT AVAILABLE" appears as the invoice number on two rows; their soft-copy cells hold `.xlsx` names that look like internal transfer lists (guess).
- Promo or part-invoices exist: one D D Sales row `PROM-34` has quantity 2 and value ₹2; 23 dated invoices have a single piece.

### 3.5 Payments, cash discount (CD), goods return (GR)

- Payments are on 49 rows, ₹23,50,486 in total. 47 have a date (11 Feb to 14 Jun 2026); 2 amounts have no date. One supplier accounts for 20 of the 49 rows. The largest supplier by value (Aditya Birla) has no payment row, although the bank file shows three automatic debits to that brand (₹36.9 lakh) in the weeks it covers (see [store-close-cash-and-bank.md](store-close-cash-and-bank.md)).
- Payment plus CD plus GR equals the invoice value within ₹2 on 43 of the 49 rows. Four rows are part-paid (payment, CD and GR together cover 13% to 99% of the invoice). Two rows show a payment larger than the invoice because one payment covers several bills ("BILL 33 & 34 PAID TOGETHER").
- CD amounts look like a percentage of the pre-tax value: on two rows a typed 9% matches 9% of the invoice divided by 1.05 (₹991.44 on ₹11,567; ₹1,190.16 on ₹13,885) (inferred). One supplier has a CD typed in the master but a CD amount on only 3 of its 20 payment rows; the sheet does not say why.
- One row carries a CD amount of ₹20,247 on a ₹23,643 invoice with a ₹3,396 payment. That looks like a returned-goods value typed in the CD column (guess).
- The one GR amount (₹2,145) sits on a row where payment, CD and GR together equal the invoice.
- No payment is tied to a bank reference. Nothing says how the payment was made or from which account.

### 3.6 Soft copy and PT file names

- Early names are free: `DD SALES -159.pdf`, `A S Textile 119.pdf`, `Ek Omkar-13807.pdf`.
- From about February 2026 a convention appears: `SUPPLIER(BRAND)_INVnnn_<destination>_<n>PCS.pdf`, for example a supplier, a brand in brackets, the invoice number, a destination code and the piece count. 545 file names carry a piece count (`nnPCS`). Destination codes seen in names of the form `_<code>_<n>PCS` include `JSL` (89 names), `GAYA` (70), `HZB` (63), `FS-DEO` (38), `VAS-DEO` (32), `SAN` (24), `PATNA` (24), `SBJ` (23), `SGMR` (20), `DUMKA` (19), `WH` (14), `BOKARO` (13), `AS-DEO` (10), `BANKA` (7) and `SANSKAR` (6). What each code is belongs to [stores-and-codes.md](stores-and-codes.md).
- Aditya Birla names use the invoice number plus a brand code and destination: `MSF2262000004170_PE_FS-DEO_1PC.xlsx` (the common codes are PE on 179 names, AS on 157, LP on 88 and VH on 66; PE is Peter England and the others are probably Allen Solly, Louis Philippe and Van Heusen, inferred).
- The PT file has the same name as the PDF with `.xlsx`.
- One soft copy is stated to be for one store while the PT file inside names another (invoice `DA/26-27/0160`: file name says `HZB`, the buyer line says `-DEO`).

### 3.7 `SUPPLIER DATA BASE` (supplier master)

Headers (A to M): `PARTY NAME`, `Location`, `Brand Name`, `Credit Days`, `CD`, `Agency Company`, `Agent Name`, `Agent Number`, `Agency Accounts Name`, `Accounts Desk Number`, `Account Holder Name`, `Bank Account`, `IFSC Code`. Columns N to T are formatted but empty. Names are not in alphabetical order.

| Field | Rows filled (of 261) | What the values look like (no values copied) |
| --- | --- | --- |
| `PARTY NAME` | 261 | 261 distinct; three pairs differ only by spacing or punctuation; KDPS Lifestyle Pvt Ltd itself is listed as a supplier. |
| `Location` | 117 real, 136 "-", 8 blank | Towns: Surat 29, Ranchi 26, Kolkata 20, Mumbai 10, Indore 7, Delhi 6, Patna 4, Ludhiana 4, and others. |
| `Brand Name` | 47 real, 192 "-" | One brand or a comma list ("JOCKEY, KILLER, NEXTBIT"); also "MULTI BRAND", "WITHOUT BRAND", a Hindi name. |
| `Credit Days` | 61 real, 181 "-" | 42 numbers (7, 10, 15, 21, 30, 45, 50, 60, 70, 80), 18 "NO", 1 "NIL". |
| `CD` | 42 real, 200 "-" | 36 numbers (mostly fractions: 0.02, 0.03, 0.05, 0.09, 0.1; two whole numbers 2 and 5), 3 "NET", 3 text such as "5% IN BILL" and "10% IN BILL". |
| `Agency Company` | 65 real, 177 "-" | Five values: Suryam Textile Agency 29, Nepolian 17, Direct 9, RTC 7, Sunrise Agency 3. "Direct" means no agent (inferred). |
| `Agent Name` | 51 | A person's name. Present, not copied. |
| `Agent Number` | 58 | Phone numbers, 39 as text and 19 as numbers. Present, not copied. |
| `Agency Accounts Name` | 0 real values (240 "-") | Empty in practice. |
| `Accounts Desk Number` | 1 | Phone number. Not copied. |
| `Account Holder Name` | 111 | 104 equal the party name; 7 differ. |
| `Bank Account` and `IFSC Code` | 111 each | Present. Not copied. |

133 of the 261 rows hold only a name and dashes. 128 rows have at least one real value beyond the name.

What the fields mean (inferred, not confirmed): credit days are payment days after invoice; CD is the cash discount percentage for paying within terms; "NET" means no discount; "% IN BILL" means the discount is already inside the invoice price; "NO" means no credit; an agency company is an agent's firm that stands between brand and KDPS, and the agent's person details are kept beside it. Whether agent commission is ever paid by KDPS is not shown.

### 3.8 Hidden sheet `Arvind & LC Invoice Details.`

- Title cell: "Arvind & Linen Club Invoice Details". Header row 2: `Supplier Name`, `Invoice Number`, `Invoice Date`, `Month`, `Year`, `Brand Name`, `Quantity`, `Billing Amount`, `MRP Amount`, `Invoice Soft Copy`, `Invoice Season`, `Invoice Status`, `Stock Remarks`, `Booking Status`, `Margin Analysis Status`. `Month` and `Year` are formulas on the date.
- 67 invoices, all from Vishal Marketing & Company, all `AW'25`. Row 1 totals (formulas): 6,630 pieces, billing ₹1,46,55,490, MRP amount ₹2,23,69,532.47, invoice count 67.
- Brands: U.S Polo 29, Arrow 13, Flying Machine 8, Linen Club 7, U.S Polo Kids 5, U.S Polo Promo 2, U.S Polo (SOR) 2, U.S Polo Kids Promo 1. `(SOR)` marks sale-or-return stock (inferred). The drop-down also lists promo versions of Arrow, Flying Machine and Linen Club.
- Billing is about 61% to 72% of MRP (Linen Club is lower: its median is 59.6%). Promo invoices are billed at about 100% of MRP.
- Invoice numbers follow the supplier's series (`S/25-26/842` to `S/25-26/2762`) and a separate Linen Club series (`S/170` to `S/302`).
- Drop-down lists:

| Column | Values (exact, including full stops) |
| --- | --- |
| `Booking Status` | `BOOKED IN VENUE.`, `BOOKED IN "DB".`, `Non Booked Article Found.`, `PROMO`, `GOODS RETURNED` |
| `Margin Analysis Status` | `PENDING.`, `DONE.`, `GOODS RETURNED` |
| `Invoice Season` | `AW'25`, `SS'26`, `AW'26`, `SS'27`, `AW'27` |
| `Brand Name` | `U.S POLO`, `U.S POLO KIDS`, `ARROW`, `FLYING MACHINE`, the four `... PROMO` versions, `LINEN CLUB`, `LINEN CLUB PROMO`, `U.S POLO (SOR)` |

- Values in use: `BOOKED IN VENUE.` 55, `BOOKED IN "DB".` 6, `Non Booked Article Found.` 3, `PROMO` 3. `Margin Analysis Status`: `PENDING.` 57, `DONE.` 10 (the first ten, August 2025). `GOODS RETURNED` is never selected; returns appear only in comments.
- `Stock Remarks` (62 of 67 filled) say where the goods were received and what moved on: "Product Received" at Vaishnavi Deoghar 30, JainSons/HZB 8, Lee Deoghar 7, the Ranchi warehouse 8; nine rows record onward transfers (some with unit counts per store). This is a manual record of receiving Site and onward transfer.
- Four threaded comments: "GOODS RETURNED FROM SAINSONS (HZB)" on Linen Club invoice `S/171`; a promo set billed with the goods on invoice `S/25-26/1446` (5 duffel bags, 10 backpacks and 2 trolleys, 17 in all, "PROMO ALSO BILLED"); "21 NOS GR TO VMC FOR PRICE MISMATCH" on `S/226`; "51 NOS GR TO VMC DUE TO UNORDERED STOCK" on `S/282`. VMC is probably the supplier's initials (inferred).
- This sheet and the Vishal rows on `INVOICE DETAILS.` (64 rows, Nov 2025 to Apr 2026) share no invoice number, so the two are consecutive trackers for one supplier, not duplicates. The hidden sheet's totals are not inside the visible tracker's totals.
- Quality: at least 11 invoice dates have day and month swapped (for example invoice `S/25-26/2329` shows 11 May 2025 but sits between November invoices); the derived `Month` column is wrong on those rows (Jan 3, May 2, Jun 3, Dec 1 and two August rows). One invoice number holds a trailing line break. Linen Club invoice `S/282` shows billing ₹3,06,186 against MRP ₹10,03,685 (30.5%, against about 60% for the others), which is not explained (the same invoice has a 51-piece return comment). Five rows have no stock remark.

### 3.9 `COMPILED PT FILE`

- Header row 3: `INVOICE NUMBER`, `INVOICE DATE`, `BRAND`, `COLOR`, `GENDER`, `SUB CATEGORY`, `TYPE`, `ITEM`, `FIT`, `SIZE`, `BARCODE`, `DESIGN`, `HSN`, `QTY`, `MRP`, `BASIC`, `P RATE`, `INPUT TAX`, `OUTPUT TAX`, `NAG`, `MARGIN`, `MONTH`. `INVOICE DATE` is a lookup into `INVOICE DETAILS.` by invoice number; `MONTH` is a formula. A drop-down on `INVOICE NUMBER` lists the tracker's invoice numbers.
- 12 data lines for three invoices, all dated 1 Jun 2026. By the soft-copy file names they are a P M Sons invoice (7 lines, 8 pieces, jeans), a Paras Textiles invoice for Jockey (1 line, 10 pieces, briefs) and a Tarun Apparels invoice for Jockey (4 lines, 90 pieces, vests). The file is a sample; about 997 rows hold only the two formulas.
- Here a PT row holds a quantity per size (1, 2, 10, 20, 40), not one row per piece as in the vendor PT file in section 6.4.
- Check (computed): basic cost times quantity times 1.05 equals the tracker's invoice value on two invoices (₹5,771 and ₹20,387). On the third the tracker says ₹2,122 against ₹2,046 computed. So `BASIC` is the pre-tax rate and the invoice value is tax-inclusive at 5%.
- `P RATE` is `BASIC` times 1.1 on the jeans and times 1.2 on the Jockey lines, pasted as values. The multiplier differs by invoice here as well as by person in the PT template. `MARGIN` is rounded to whole numbers (30, 29, 16, 13).
- Supplier names: on the first two June invoices the supplier on the tracker row does not match the supplier in the file name (the row for `PMS/26-27/786` names a different supplier from `P M SONS - 786.pdf`). Lookups (credit days, bank) would pull the wrong supplier's terms (inferred).

### 3.10 `SUMMARY`

- "KDPS PARTY LEDGER SUMMARY". It is a pivot over `INVOICE DETAILS.` columns A to T: one row per `Supplier Name` (127 rows including a blank) and the sum of `Invoice Value`. The pivot is marked to refresh on load, and its supplier names and values are not stored as cell values in this copy.
- Columns C to G are meant to be typed: `Opening Balance`, `CD Amount`, `GR Value`, `Payment Amount`, `Interest If Any`. Only one row (row 12) holds typed values; its figures are the whole sheet's header totals (CD ₹22,888, GR ₹16,674, payments ₹4,88,269, interest ₹459).
- Column H `Due As On` is a formula for every row. It is invoice value plus opening balance, less CD, GR and payments, less interest. The test inside the formula adds interest and the result subtracts it, so interest reduces the due balance instead of raising it (a formula defect). The header total is ₹6,72,35,605.84 across 115 rows (smallest ₹3,245; largest ₹1,72,81,790, the Aditya Birla total).
- It covers only what is on `INVOICE DETAILS.`: the hidden sheet's invoices are not in it, and the 538 file-name-only rows add nothing because they have no value.

### 3.11 `OFFER DETAILS.`

104 offer lines for six brands (see [offers-and-brand-reports.md](offers-and-brand-reports.md)). Types `ATV` 37, `GWP` 11, `EOSS` 51, `FRESH` 5; seasons `AW'25` and `SS'26`; status `CLOSED` 90, `STILL RUNNING` 9, `NO OFFER` 5; 9 closing dates read "Not Disclosed Yet.". Only its link to purchasing matters here: the offer artwork file names and the brand-funded promotions are the "promotional funding" that claims later recover (`PRD-OFR-018`).

## 4. `KDPS DEBIT & CREDIT NOTE DETAILS.xlsx`

### 4.1 Sheet map

| Sheet | State | Rows and columns used | What it holds |
| --- | --- | --- | --- |
| `DATA BASE` | visible | headers on row 2; 7 lists | Drop-down lists (section 4.3). One stray comment on an empty cell, "16/04/2025 SALE RETURN RECEIVED 72397/-". |
| `CREDIT NOTE DATA SHEET` | hidden | 11 rows, columns A to P | Claims against brands, with settlement fields. |
| `KDPS CN & DN SHEET` | visible | 215 rows (3 to 217), columns A to R | DNs on non-brand suppliers. |
| `KDPS CN & DN SHEET-BRAND` | visible | 130 rows (3 to 132), columns A to R | DNs on brand suppliers. |
| `2025-26-SUMMARY` | visible | 369 rows, A to D | DN list for FY 2025-26. |
| `2025-26_SOFTWARE` | hidden | 14,135 lines plus a totals row | Item lines of the returns, FY 2025-26. |
| `2026-27-SUMMARY` | visible | 104 rows, A to D | DN list for FY 2026-27. |
| `2026-27_SOFTWARE` | hidden | 2,291 lines plus a totals row | Item lines, FY 2026-27. |

### 4.2 The process, as the sheets show it

1. The warehouse raises a debit note on a supplier for goods being returned or claimed. It carries a number from one running series per financial year, `25-26/WH/PR-n` (PR is purchase return, WH is the warehouse; inferred). The DN is saved as a PDF and typed on the tracking sheet (`DN NUMBER`, `DN DATE`, `DN QUANTITY`, `DN AMOUNT`, `DN COPY`). Item lines are exported from the software (section 4.8).
2. The supplier answers with a credit note, or a settlement reference. It is typed as `CN NUMBER`, `CN DATE`, `CN  QUANTITY`, `CN  AMOUNT` (two spaces in the header) and `CN COPY`.
3. `CLAIM STATUS` is set from a drop-down. `SETTLEMENT DIFFERENCE` is a formula, DN amount minus CN amount, blank when equal. A DN with no CN therefore shows its whole value as the difference; the column is really the unsettled balance.
4. `REMARKS` and `DETAILS` carry notes; `DETAILS` is "NON BRAND" or "BRAND" on every row and marks which sheet the row sits on.
5. Brand claims (short received, wrong invoice, defective) go to the hidden `CREDIT NOTE DATA SHEET`, which adds the settlement document, settled quantity and settled amount.

### 4.3 `DATA BASE` lists

| List | Values |
| --- | --- |
| `BRAND` | 281 brand names. These are exactly the distinct `Brand` values of `2025-26_SOFTWARE` (281 of 281). 25 brands in `2026-27_SOFTWARE` are not in it. |
| `SEASON` | 8: `SS'25`, `AW'25`, `SS'26`, `AW'26`, `SS'27`, `AW'27`, `SS'28`, `AW'28` |
| `DN TYPE` | 7: `EOSS CREDIT NOTES`, `STAFF SALARY REIMBURSEMENT`, `GOODS RETURN ` (trailing space), `SHORT RECEIVED CLAIM`, `DAMAGE GOODS CLAIM`, `FURNITURE CLAIM`, `MONTHLY TARGET INCENTIVE` |
| `CLAIM STATUS` | 7: `RECEIVED`, `PENDING`, `HOLD`, `SHORT RECEIVED`, `REJECTED`, `DATA NOT RECEIVED`, `RESOLVED` |
| `REASON OF GR` | 5: `STOCK CORRECTION`, `WRONG INVOICE`, `UNORDERED STOCK`, `EXCHANGE`, `DEFECTIVE STOCK` |
| `FRENCHEEZI` (franchisee) | 2: `KDPS LIFESTYLE PVT LTD`, `OM GANPATI ENTERPRISES` |
| `PARTY NAME` | 216 supplier names. 96 of 96 non-brand parties and 11 of 11 brand parties are on it; 99 of the 109 parties in `2025-26_SOFTWARE` are. |

Only some values are used on the rows:

- `DN TYPE`: `GOODS RETURN ` on 82 DNs, `DAMAGE GOODS CLAIM` on 74, blank on 189 of 345. The other five types are never used. `STAFF SALARY REIMBURSEMENT`, `MONTHLY TARGET INCENTIVE`, `FURNITURE CLAIM` and `EOSS CREDIT NOTES` suggest brands also pay or credit KDPS for staff salaries, target incentives, furniture and end-of-season support; the data holds none.
- `CLAIM STATUS` in use: `PENDING`, `RECEIVED`, `SHORT RECEIVED`, `RESOLVED` on the tracking sheets; `DATA NOT RECEIVED` appears once on the brand claim sheet. `HOLD` and `REJECTED` are never used.
- `REASON OF GR` in use: `STOCK CORRECTION` 5, `WRONG INVOICE` 4, `DEFECTIVE STOCK` 2. `UNORDERED STOCK` and `EXCHANGE` are not used here, although the hidden invoice sheet's comment mentions a return for "unordered stock".

### 4.4 `KDPS CN & DN SHEET` (non-brand suppliers)

- Header row 2: `PARTY NAME`, `BRAND NAME`, `SEASON`, `DN TYPE`, `DN NUMBER`, `DN DATE`, `DN QUANTITY`, `DN AMOUNT`, `DN COPY`, `CN NUMBER`, `CN DATE`, `CN  QUANTITY`, `CN  AMOUNT`, `CN COPY`, `CLAIM STATUS`, `SETTLEMENT DIFFERENCE`, `REMARKS`, `DETAILS`.
- 215 DNs for 96 parties. DN dates 10 Apr 2025 to 19 May 2026 (monthly: Apr 2025 5, May 4, Jun 2, Jul 1, Aug 4, Sep 13, Oct 13, Nov 71, Dec 42, Jan 2026 5, Mar 3, Apr 16, May 36).
- Header totals: DN quantity 5,142, DN amount ₹65,62,977, CN quantity 543, CN amount ₹36,45,252, settlement difference ₹29,17,725.
- `BRAND NAME` is filled on 1 row and `SEASON` on none.
- 108 DNs have a CN (91 equal the DN amount, 10 are lower, 7 higher). `CN COPY` is filled on 8 rows (5 of them "-"). `DN COPY` on 212.
- Status: `PENDING` 106 (DN ₹28.47 lakh), `RECEIVED` 105 (DN ₹35.82 lakh, CN ₹35.68 lakh), `SHORT RECEIVED` 2, `RESOLVED` 2 (₹1.10 lakh, no CN).
- `REMARKS` on 121 rows: "DONE" 93, "DEFECTIVE" 8, "DONE-PARTY LEDGER CHECK" 3, and notes to talk to a party or staff member. Several explain the entity split: a credit note received in KDPS's ledger and not in Om Ganpati's, "billed to company", "CN billed to KDPS against bill no. ...", "CN again billed to KDPS", stock sent to one distributor and billed by another.
- DN number formats: `yy-yy/WH/PR-nnn` (128), `yy-yy/WH/PR-nn` (78), `yy-yy/WH/PR-n` (5), `KDPS/26-27/00nn` (3), `DN/J/26-27/022` (1). The padding is inconsistent. `CN NUMBER` is the supplier's own: `SR/n` 21, decimal-looking numbers 21 (stored as numbers), `GRn` 14, and others (`SB/...`, `CN/...`, `TAC/CN...`).
- CN dates: 7 CN dates fall in Oct to Dec 2026 against DN dates in Oct to Dec 2025 (probably the year typed wrongly (guess)); 3 CNs are dated 2 to 12 days before their DN; one cell holds the text "16-May-2025 & 24-MAY-2025".

### 4.5 `KDPS CN & DN SHEET-BRAND`

- Same 18 columns. 130 DNs for 11 parties: Vishal Marketing 40, Jain Adishwar Hosiery Works 27, D D Sales Co 18, Aditya Birla Fashion Ltd 16, D Apparel 9, Shring Apparels 8, Aditya Birla Lifestyle Brands Limited 5, and four others with 1 to 2 each.
- Header totals: DN quantity 8,022, DN amount ₹1,74,34,268.77, CN quantity 1,175, CN amount ₹45,46,367. The settlement-difference total shows `#VALUE!` because one cell holds text.
- DN dates 4 Apr 2025 to 18 May 2026 on 118 rows; 12 DNs have no quantity (7 are Jain Adishwar rows) and 9 have no DN number (7 of them Jain Adishwar). DN amount is text ("4,46,395") on one row.
- 28 DNs have a CN (20 equal, 5 lower, 3 higher). Status: `PENDING` 102 (DN ₹1.29 crore), `RECEIVED` 26 (DN ₹44.24 lakh, CN ₹44.36 lakh), `SHORT RECEIVED` 2.
- `DN TYPE` is `GOODS RETURN ` on 22 rows and blank on 108. `BRAND NAME` is filled on 4 rows and `SEASON` on 2.
- CN numbers are `SR/n` 13 (the supplier's sales-return numbers), `n/n-n` style 7 and others. One remark: "OUT OF 20 PCS 13 WAS RETURNED BACK TO US AND ONLY DN FOR 7 PCS WAS ISSUED" (a DN for a part of the goods).
- The two tracking sheets draw on one DN series: 211 and 121 numbers, and no number appears on both.

### 4.6 `CREDIT NOTE DATA SHEET` (brand claims)

- Header row 2: `FRENCHEEZI`, `BRAND`, `SEASON`, `REASON OF GR`, `GR NUMBER`, `GR DATE`, `QUANTITY`, `CLAIM AMOUNT`, `CLAIM STATUS`, `SETTLEMENT DATE`, `SETTLEMENT NO`, `SETTLED QTY`, `SETTLEMENT AMOUNT`, `SETTLEMENT DIFFERENCE`, `SETTLEMENT COPY`, `REMARKS`. Row 1 totals: quantity 1,696; claim ₹31,22,179; settled quantity 1,674; settled amount ₹30,67,666; difference ₹6,209. Drop-downs from `DATA BASE` on columns A to D and I.
- 11 claims: 10 for KDPS Lifestyle Pvt Ltd and 1 for Om Ganpati Enterprises. Brands: Arrow 2, U.S. Polo 2, and one each of FM, U.S. Polo Kids, Spykar, SMAG, Status Quo, Killer, Linen Club. Seasons `SS'25` 5, `AW'25` 6. `GR DATE` 15 Sep to 12 Nov 2025.
- Reasons: stock correction 5, wrong invoice 4, defective stock 2.
- Statuses: `RESOLVED` 4, `SHORT RECEIVED` 2, `RECEIVED` 2, `PENDING` 2, `DATA NOT RECEIVED` 1.
- `GR NUMBER` is the KDPS DN number (`25-26/WH/PR-n`) for stock correction and defective claims, and the supplier's invoice number for "wrong invoice" claims, which are settled bill to bill ("BILL TO BILL GR S-1896 (WRONG BILL)"). One row has "-".
- `SETTLEMENT NO` is the supplier's document: `SR/n` on 8 claims, `CN_25-26_198` on 1, blank on the 2 pending ones. Settlement is dated 0 to 5 days after the GR date. `SETTLEMENT DIFFERENCE` is claim minus settlement (a number) or the text "CLAIM FULLY SETTLED" (a formula): one claim settled ₹6,014 short, one ₹352 short, one ₹157 over.
- One claim (761 pieces, ₹14.97 lakh, 48% of the claim total) has no GR number and status `DATA NOT RECEIVED` while its settlement is fully settled. Status and remark disagree on that row (`DATA NOT RECEIVED` against "FULLY SETTLED").

### 4.7 The two `SUMMARY` sheets

- Columns `Date`, `Invoice No`, `Party Name`, `Bill Amount`. `Invoice No` is the DN number.
- `2025-26-SUMMARY`: 369 DNs, ₹3,48,50,036, 106 parties, numbers `PR-1` to `PR-375` with 6 skipped (167, 168, 201, 272, 285, 299). Largest parties by value: Aditya Birla Lifestyle Brands ₹1.03 crore, Vishal Marketing ₹70.6 lakh, Jain Adishwar ₹58.2 lakh, B.K Enterprises ₹26.0 lakh, Shring Apparels ₹14.6 lakh.
- `2026-27-SUMMARY`: 104 DNs, ₹45,79,814, 51 parties, `PR-1` to `PR-105` with number 31 skipped; dates up to 15 Jun 2026.
- Dates: 257 and 78 are text (`30-03-2026`, `15-06-26`) and 112 and 26 are real dates. Every text date has a day above 12 and every real date has a day of 12 or less, so the real dates were read as month-first and have day and month swapped (computed). For example `PR-2` shows 4 Jul 2025 here and 7 Apr 2025 on the tracking sheet. After the swap is undone, the dates follow the DN numbers (7 and 1 order inversions remain) and run 4 Apr 2025 to 31 Mar 2026 and 4 Apr to 15 Jun 2026. By month, FY 2025-26: Apr 20, May 9, Jun 9, Jul 2, Aug 13, Sep 35, Oct 27, Nov 85, Dec 68, Jan 9, Feb 8, Mar 84.
- 321 of 329 DNs dated on both a tracking sheet and a summary agree once the swap is undone; 8 differ.

### 4.8 The `SOFTWARE` sheets

- Item lines exported from software, one line per returned piece group. The software is not named (the earlier POS or stock software, guess). Used columns B to R after a blank column A: `Bill Date`, `Bill No`, `Party`, `GSTIN`, `Item`, `Brand`, `Size`, `Design No`, `Barcode`, `HSN`, `Qty`, `Rate`, `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount`, `Bill Amount`. Columns S to Z are empty. The last row is a totals row, inside the used range.
- `Bill Date` is the DN date. `Bill No` looks like the supplier's original invoice number the goods are returned against (for example the supplier's own series), not the DN number (inferred). `Net Amount` is `Gross Amt` plus tax. `Bill Amount` equals `Gross Amt` on every line, so it is the pre-tax value and not a bill total. `Disc%` and `Disc Amt` are always 0.

| Measure | `2025-26_SOFTWARE` | `2026-27_SOFTWARE` |
| --- | --- | --- |
| Lines | 14,135 | 2,291 |
| Dates | 4 Apr 2025 to 31 Mar 2026 | 4 Apr to 25 May 2026 |
| Pieces | 19,235 | 2,705 |
| Gross | ₹3,26,48,266.23 | ₹38,03,076.70 |
| Net (with tax) | ₹3,60,42,065.93 | ₹40,53,356.84 |
| Bill numbers | 1,217 | 260 |
| Parties | 109 | 42 |
| Brands | 281 | 71 (4 lines blank) |
| Items | 65 | 29 |
| HSN values | 221 | 65 |
| Net divided by gross | 1.05 on 6,901 lines; 1.12 on 5,969; 1.18 on 1,265 | 1.05 on 2,185; 1.18 on 105; 1.12 on 1 |

- Line counts by party, FY 2025-26: Aditya Birla Lifestyle Brands 3,635; Vishal Marketing 2,894; Jain Adishwar 1,655; B.K Enterprises 854; Shring Apparels 603; KDPS Lifestyle (three spellings) 1,048 together.
- Lines taxed at 12% are numerous from April to December 2025 (3,020 in September and 861 in December) and few from January 2026 (37, 35 and 191 in the next three months; 1 in FY 2026-27). This is only what the lines show; which rate applies is for the CA.
- Quality: `GSTIN` is blank on 900 lines in FY 2025-26 (474 of them KDPS-as-party lines) and 2 in FY 2026-27; `HSN` is the text "." on 54 lines; in FY 2025-26 the barcode is 13 digits on 11,853 lines, 7 digits on 1,274 (internal), text on 748, 6 digits on 161, 5 on 49 and 10 on 35, mostly stored as numbers; sizes mix `S/M/L`, numbers, "FS", "NA", "." and kids ages in two spellings ("10-11 YEARS" and "6-7 Y"); 317 `Bill No` values are numbers; 305 `Bill No` values appear on more than one date and 35 under more than one party (so it is not a document key); one `Bill No` holds a date.
- 1,048 lines (141 bill numbers, 1,256 pieces, ₹16.4 lakh gross, 4 Apr to 7 Dec 2025) name KDPS Lifestyle (spelled three ways, one with "(DEOGHAR)") as the party and carry supplier-style bill numbers (`SS-n`, `PM-n`, `JA-n`, `KD-PXn`). They are not on `2025-26-SUMMARY`. What they are (internal moves between KDPS entities, or returns billed to the company) is not stated.

### 4.9 Reconciliation between the sheets (computed)

| Check | Result |
| --- | --- |
| DN numbers on both tracking sheets | 211 and 121 numbers, none shared: one series split between "non brand" and "brand" by party. 13 rows have no number in the usual form (9 blank, 3 `KDPS/26-27/00nn`, 1 `DN/J/26-27/022`). |
| Tracking sheets against the two summary sheets | All 332 numbers on the tracking sheets are on the summaries. 141 summary DNs (₹1.74 crore) are on neither tracking sheet. |
| Amounts | 13 of 332 matched DNs differ in amount: 9 by ₹2 to ₹31,543, 3 have no amount on the tracking sheet and 1 holds text. |
| Summary against software | In 313 of 318 FY 2025-26 (date, party) groups the summary `Bill Amount` equals the sum of `Net Amount` (tax-inclusive). The software total is ₹11.9 lakh above the summary total: 9 groups of KDPS-party lines (₹12.5 lakh) are on the software and not on the summary. FY 2026-27: 63 of 64 groups match; 27 summary DNs (₹5.26 lakh) are dated 29 May to 15 Jun, after the software export ends (25 May). |
| Tracking sheet totals against summary totals | Tracking sheets ₹2.40 crore for 345 rows against ₹3.94 crore for 473 DNs on the summaries. |

## 5. `SUPPLIER BRAND DETAILS.xlsx`

- 2.6 MB because the sheets are formatted to about 151,000 rows; real data is small.
- `BRAND` (1,163 rows plus header): `Brand`, `Supplier`. 1,163 distinct brands, each once; 281 distinct suppliers; 38 brands have no supplier. 30 groups of brand names differ only by spacing or punctuation (for example "US POLO INNERWEAR" and "U. S. POLO INNERWEAR"). One supplier per brand, so a brand sold by two suppliers cannot be shown.
- Concentration: SSS 176 brands, Variety Textile 175, P M Sons 127, Shree Emporium 35, M R & Company 29, Om Ganpati (DMK) 28, Jain Adishwar Hosiery Works 27, Saraogi Super Sales 21. 206 suppliers have one brand; 15 have more than 10. The big ones look like distributors (guess).
- `BARCODE` (360 rows): `Barcode` (`YES` 116, `NO` 244) and `Supplier`. No barcodes. It holds all 281 suppliers of the first sheet plus 79 more. The meaning is not stated; the likely reading is "supplier delivers goods already carrying a barcode" (guess). It matters for who needs an internal label (`PRD-MER-008`).
- Supplier lists overlap only in part, which shows the lack of one supplier master:

| List | Names | In the invoice supplier master (261) |
| --- | --- | --- |
| `SUPPLIER DATA BASE` | 261 | all |
| `INVOICE DETAILS.` suppliers | 126 | all |
| `DATA BASE` party list in the DN workbook | 216 | 86 |
| `BRAND` sheet suppliers | 281 | 114 (after ignoring spacing and punctuation) |
| `BARCODE` sheet suppliers | 360 | 140 (same rule) |

- The `BARCODE` list is the nearest to a full party list: it matches 207 of the 216 parties in the DN workbook.
- Against the DN workbook, 258 of its 281 brands appear exactly among the 1,163 brands.

## 6. Vendor files

### 6.1 `Prem Clothing Ledger FY- 2025-26.pdf`

- One page, printed from KDPS's own accounting file. The heading names the company file "KDPS LIFESTYLE PVT LTD JH 24-25 - (from 1-Apr-24)": a company created from 1 Apr 2024 and used for 2025-26, so the company is not re-created each year (inferred). "JH" is probably Jharkhand. The page carries the company's address and e-mail and the supplier's address (not copied).
- Title "Ledger Account" for the supplier (Jamshedpur); period 1 Apr 2025 to 31 Mar 2026.
- Voucher shape: columns `Date`, `Particulars` (a "Dr" or "Cr" prefix and the other account), `Vch Type`, `Vch No.`, `Debit`, `Credit`. Seven purchase vouchers (type `Purchase`, numbers `25-26/0114` to `25-26/0556`, particulars "GST LOCAL PURCHASE") and four payment vouchers (type `Payment`, numbers 458, 652, 653, 1002, paid from an overdraft bank account, particulars "ICICI Bank Ltd (OD) A/c"). Purchase vouchers are keyed `25-26/nnnn` (KDPS's own number); payment vouchers are plain numbers.
- Totals: purchases ₹1,96,671, payments ₹1,50,296, closing balance ₹46,375 (credit). Payments match bills one for one (₹33,100; ₹38,972; ₹39,822; and ₹38,402 for two bills). The two bills of 11 Nov 2025 (₹27,052 and ₹19,323) are unpaid and make the closing balance of ₹46,375.
- "GST LOCAL PURCHASE" shows the purchase is booked as a local (same-state) purchase against a purchase ledger, not as an inventory voucher (inferred). The supplier does not appear in `INVOICE DETAILS.` or the supplier master; it is on the `BARCODE` sheet (`YES`) and the DN workbook's party list.

### 6.2 `OMKAR CREATION.pdf`

- One page from the supplier's own books (Jaipur): "L E D G E R", period 1-4-2025 to 22-4-2026, account "KDPS LIFESTYLE PVT LTD, RANCHI". The page carries the supplier's GSTIN and Udyam number (present, not copied). A printed Udyam number is the kind of evidence a supplier's MSME class would need (`PRD-PAY-010`).
- Columns: `Date`, `Type`, `Vch No.`, `Particulars`, `Narration`, `Debit (₹)`, `Credit (₹)`, `Balance (₹)`. One entry: `Sale` voucher `GT/25-26/1662` on 24-01-2026, "Cr Sales", ₹79,643, debit balance of the same amount. No payment entry as of 22 Apr 2026.
- It does not appear in the tracker. The supplier is on the `BARCODE` sheet (`NO`) and the supplier's account is addressed to "Ranchi", whereas KDPS's own books address Deoghar: the supplier knows KDPS by a different branch (inferred).
- The two ledgers show two shapes of the same thing: a ledger from KDPS's side (Tally voucher types and numbers) and from the supplier's side (their own voucher numbers). Matching needs the supplier's invoice number to be in KDPS's narration, which the Prem ledger does not show.

### 6.3 `VSN DEO DA-26-27-0119.pdf` (photographed invoice)

- Six pages, images only, no text layer, skewed, with a torn corner on page 1 and handwritten marks on page 6. It is an image of a supplier tax invoice. The file name carries the invoice number (`DA-26-27-0119`) and `VSN DEO` (a store label, guess).
- Header: "TAX INVOICE" from D Apparel (Ranchi): `Invoice Serial Number` `DA/26-27/0119`, `Invoice Date` 20-Apr-26, `Due Date` "30 Days" (a period, not a date), `Place Of Supply` Jharkhand. Fields `Transportation Mode`, `Transport Details`, `Document Through` and `Billed By` are empty. "Details of Receiver (Billed to)" and "Details of Consignee (Shipped to)" are the same: KDPS Lifestyle Private Limited-DEO, Deoghar. GSTINs and phone numbers are printed (not copied).
- Line table: `SR NO`, `PRODUCT NAME` (style code, colour and size, such as `SQ-CL-26099 (PKT) WHITE 617 3XL`, then a sub-line "Size / Qty : 3XL 1"), `HSN CODE`, `MRP`, `QTY`, `RATE`, `Disc %` (empty), `TAXABLE AMOUNT`, `GST %`, `CGST AMT`, `SGST AMT`, `TOTAL`. 102 lines on 6 pages (up to 21 lines a page; page 6 holds line 102 and the totals), 124 pieces ("124.00 pcs" on the total line). Pages end "Continued...".
- Lines are one colour and size each, with quantity 1 or 2. MRPs seen: 999 to 2,299. HSN `61091000` is on the t-shirt lines and `61033200` on the lower lines (as the PT file's `ITEM` shows). GST 5%, split 2.5% and 2.5%. The invoice rate is about 65% of MRP on every line (computed).
- Totals: `Sub Total` ₹1,14,156.90; `DISCOUNT ALLOWED` empty; `Motiya` ₹50.00; `Bus Fare` empty; `CGST` ₹2,855.03; `SGST` ₹2,855.03; `Rounding Off` ₹0.04; `GRAND TOTAL` ₹1,19,917.00 (in words "One Lakh Nineteen Thousand Nine Hundred Seventeen Only").
- HSN summary: 61091000 taxable ₹90,422.68; 61033200 taxable ₹23,784.22; total ₹1,14,206.90, which is ₹50 above the line total, the `Motiya` amount: the extra charge is inside the taxable base. Total tax ₹5,710.06. Handwritten numbers next to the two HSN rows look like piece counts (99 and 25, which add to 124) (guess).
- Footer: "We declare that this invoice shows the actual price of the goods described...", "SUBJECT TO RANCHI JURISDICTION", "This is a Computer Generated Invoice".
- It is one of the 538 file-name-only rows of the tracker (`D APPAREL - 0119.pdf`, row 965): no date, quantity or value is typed there.

### 6.4 `DA-26-27-0119 VAISHNAVI DEOGHAR PT FILE.xlsx`

- `Sheet1` has the 20 KDPS PT columns (`SEASON` to `MARGIN`) on row 1 (no totals row above, unlike the KDPS template which has the header on row 2); `Sheet2` and `Sheet3` are empty. 124 piece rows plus one stub row that holds only `SEASON`, `BRAND`, `COLOR` and `FIT` (row 126). No formulas; no `SUGGESTED SUB CATEGORY` or `SUGGESTED TYPE` columns.
- All rows: `SPRING SUMMER(Apr-26)`, `STATUS QUO`, `PREMIUM`, `CASUAL WEAR`, `SLIM`, 5% input and output tax. `T-SHIRT` 99 (`MALE` 37, `KIDS MALE` 62), `LOWER` 25 (all `MALE`). HSN as on the invoice. 102 distinct barcodes over 124 rows (each piece has its own row), 12 designs, one piece per row (`QTY` 1, `NAG` 1).
- `BASIC` is the invoice rate rounded to whole rupees (sum ₹1,14,115 against ₹1,14,156.90 on the invoice, ₹41.90 lower). `P RATE` is the unrounded invoice rate times 1.2. `MARGIN` is 22 on all 124 rows, which follows from the 65% rate and the 1.2 multiplier (computed), not from a margin rule. `MRP` values match the invoice.
- 124 pieces match the invoice. Who filled the file (supplier or KDPS) is not stated.

## 7. Purchase documents inside the PT files (cross-check against the tracker)

The PT folder holds supplier invoices or sales registers exported by suppliers. Matching their invoice numbers to `INVOICE DETAILS.` (computed) shows how well the tracker covers them. Layouts are in [pt-file-layouts.md](pt-file-layouts.md).

| PT file | Invoice shown | Date | Pieces in file | On the tracker |
| --- | --- | --- | --- | --- |
| `STATUS QUO.xlsx` | `DA/26-27/0160` (D Apparel) | 1 May 2026 | 43 | File-name-only row, `INV160_HZB_43PCS`; 43 matches |
| `JOCKEY 852.xls` | `SCRS25/852` | 3 Mar 2026 | 16 | Yes, 16 |
| `JOCKEY.xlsx` | `JCRS26/10` | 6 Apr 2026 | 60 | Yes, 60, ₹24,253 (the file's header record also says 24,253) |
| `JOCKEY PARAS.xls` | `PECRS26/175` | 18 Apr 2026 | 146 | Yes, 146 |
| `JOCKEY-NARAYANI.xls` | `P2CRS26/162` | 18 Apr 2026 | 39 | Yes, 39 |
| `JOCKEY-NARVADA.xls` | `EDCRS26/34` | 18 Apr 2026 | 20 | Yes, 20 |
| `JOCKEY_DD SALES.xls` | `DD/JBN26/135` and `/136` | 1 May 2026 | 185 lines | No |
| `HYPHEN.xlsx` | `HPNS25-26-013192` | 23 Mar 2026 | 10 | Yes, 10 |
| `TWILLS.xls` | `25-26/2612` (M N Garments) | 18 Mar 2026 | 69 | Yes, 69 |
| `BANJARAN.xlsx` | `VEP/003216/25-26` (Vinayak Emporium) | 26 Mar 2026 | 37 | Yes, 37 |
| `minelli 06161.xlsx` | `SS/25-26/06161` (Shubh Shri) | 31 Mar 2026 | 10 | Yes, 10 |
| `DSY.xlsx` | `DS/01028/25-26` | 13 Feb 2026 | 23 | Quantity 23 agrees; tracker value ₹63,236, file `AMOUNT` ₹55,834.40 |
| `kidcity 1316&1317.xlsx` | `KC/25-26/1316`, `/1317` | 17 Mar 2026 (tracker) | 512 | Yes: 440 + 72 |
| `BLACKBERRY.xlsx` | a 10-digit brand invoice number starting `8500` | 28 Feb 2026 | 41 | Yes, 41 |
| `go colours 000023.xlsx` | `2GCS25-26-000023` | 24 Mar 2026 | 46 | Tracker 47: one piece apart |
| `ambreli 1855.xls` | `1855-GST/2025-26` | serial date | 76 on the invoice sheet, 275 on the hidden packing sheet | Tracker `25-26/BLRS/1855`, 62 pieces, under a distributor's name; three different quantities |
| `AS INNERWEAR.csv` | `ADD-289` | 16 Mar 2026 | 155 | Yes, 155 |
| `36257 KDPS SUVIDHI.xls` | none in the file; 36257 is in the file name | | 55 | Yes, 55 (supplier cell blank) |
| `FAHRENHEIT 60518.xls` | none in the file | | 35 | Yes, 35 (supplier cell blank) |
| `AMIDHARA.xlsx` | none in the file | | 16 and 48 on two sheets | Two invoices of 16 and 48 pieces (13 Apr and 20 Feb 2026) |
| `peppermint 13.xlsx` | none in the file; 13 is in the file name | | 24 | Yes, `PMNT/2627/13`, 24 |
| `XERICS JEANS PT FILE.xlsx` | none in the file | | 90 | Yes, `SA144/25-26`, 90 |
| `Peter England.CSV` | five Aditya Birla invoices | 25 to 30 May 2026 | 33 | Four on the tracker as file-name-only rows (1, 1, 7 and 1 pieces); one (23 pieces) not on it |
| `ARVIND ALL BRAND & SPYKAR_PT.xlsx` | `S/26-27/596` (looks like the Vishal series, inferred) | 21 May 2026 | 13 | File-name-only row for invoice 596 |
| `Madura Fashion Brand AS - VH - LP.xlsb` | 219 bill documents for KDPS | 6 to 30 Apr 2026 | 8,385 | 203 invoices all on the tracker; 16 credit-type documents are not |
| `BK ENTERPRISES_LC_PT.xlsx` | `S/55` | 14 Apr 2026 | 13 | No |
| `DEAL SS26 2970.xlsx` | `S/25-26/2970` | 3 Feb 2026 | 108 | No |
| `SWEET DREAMS.xlsx` | `DDSL-109` | 6 Feb 2026 | 24 | No |
| `KILLER JUNIOR.xlsx` | `JKL-30` | 30 Apr 2026 | 24 | No |
| `USPOLO INNER WEAR.csv` | `AV116` | 13 Mar 2026 | 119 (14 lines) | No |
| `ZILU BOTTOMS.xlsx` | `2025-26/FML/16` | 28 Aug 2025 | 107 | No (before the tracker's range) |
| `BEEVEE 390.xlsx` | `SBVS25-26-000390` | 23 Oct 2025 | 33 | No (before the range) |
| `MUFTI.xlsx` | `SMFS25-26-000753` | 22 Aug 2025 | 133 | No (before the range) |

Readings:

- Pieces agree between the PT file and the tracker on 19 of the 21 PT files that can be compared. The two that do not are `go colours 000023.xlsx` (one piece apart) and `ambreli 1855.xls` (three quantities). Nine more files are not on the tracker at all. The agreement fits `PRD-REC-010` (compare invoice, receipt and PT quantities) and `PRD-REC-016` (every PT row reconciled to receipt quantities).
- The Madura April extract holds 219 billing documents for KDPS: 203 invoices (all on the tracker) and 16 documents of bill type `ZREU` with numbers starting `MSG` and positive quantities (624 pieces, ₹18.1 lakh; probably credit documents for returns (guess)). Of 73 tracker rows with a quantity, all 73 agree with the extract's quantity (computed). The extract is for all KDPS stores for the month, not one receipt; whether it can serve as a purchase document or only as a check is for the product owner.
- Several files are sales registers made for a buyer ("Sales Register" of a supplier, voucher type "Sales"), not PT files. `DEAL SS26 2970.xlsx` and `ARVIND ALL BRAND & SPYKAR_PT.xlsx` follow the numbering of the Vishal Marketing invoices on the tracker (`S/25-26/nnnn` and `S/26-27/nnn`; inferred); `DEAL SS26 2970.xlsx` is addressed to Om Ganpati Enterprises for a KDPS store, again showing the second legal entity on purchase documents. `ARVIND ALL BRAND & SPYKAR_PT.xlsx` has a narration "FM EXTRA STOCK CORRECTION AGAINST BILL" and e-invoice columns (IRN, acknowledgement number and date, IRN status) filled, which is supplier-side e-invoice evidence.

## 8. Extra charges on invoices

- `Motiya` and `Bus Fare` are two extra charge lines of the D Apparel invoice layout, shown on the photographed invoice and as columns of `STATUS QUO.xlsx`. `Motiya` is ₹50 on both invoices (`DA/26-27/0119` and `DA/26-27/0160`); `Bus Fare` is blank on both. The meaning of `Motiya` is not stated. `Bus Fare` is a transport charge.
- On both invoices the charge is taxed with the goods: on `DA/26-27/0119` the HSN taxable total is ₹50 higher than the line total; on `DA/26-27/0160` the CGST and SGST of ₹1,052.77 each match 2.5% of the goods plus the ₹50 within ₹0.03, and the net amount of ₹44,215 is goods ₹42,059.55 plus ₹50 plus both taxes less ₹0.09 round-off (computed). The PT file for 0119 ignores the charge: its rounded basic cost is ₹41.90 lower than the invoice line total and the ₹50 does not appear.
- `Peter England.CSV` has a `Service Charge` column that is added into the taxable value (see [pt-file-layouts.md](pt-file-layouts.md)). `Round off` is present in `STATUS QUO.xlsx` (−0.09 on a net of ₹44,215) and on the photographed invoice (0.04).
- The PT layout has no column for these charges. They change the true landed cost per piece; where they go is for the costing profile (`PRD-PTW-010`) and for invoice matching (`PRD-REC-010`, `PRD-PAY-001`).

## 9. Totals that disagree

| Where | Figure A | Figure B | Note |
| --- | --- | --- | --- |
| Invoice count | `INVOICE DETAILS.` `F1` 1,259 invoice numbers | 942 dated rows | 317 file-name-only rows already carry a number |
| "Need to update" | `J1` 219 | 538 file-name-only rows | 219 is soft copies minus invoice numbers, not rows to type |
| Payments | `INVOICE DETAILS.` ₹23,50,486 | `SUMMARY` ₹4,88,269 | `SUMMARY` has one typed row |
| CD | ₹96,301 | ₹22,888 | same |
| GR | ₹2,145 | ₹16,674 | same (here `SUMMARY` is the larger figure) |
| Hidden sheet against tracker | 67 invoices, ₹1.47 crore billing | 50 dated Vishal rows on the tracker, ₹68.3 lakh | no common invoice numbers; the hidden sheet is not in the visible totals |
| DN totals | tracking sheets ₹2.40 crore, 345 DNs | summaries ₹3.94 crore, 473 DNs | 141 DNs not tracked |
| DN totals, FY 2025-26 | software net ₹3.604 crore | summary ₹3.485 crore | the KDPS-party lines |
| Settlement difference | header ₹29,17,725 (non-brand) | DN minus CN | equals the unsettled balance, not a per-claim difference |
| Brand sheet difference | `#VALUE!` | | one text cell |
| `SUMMARY` `Due As On` | ₹6,72,35,605.84 | invoice total less CD, GR, payments plus interest | interest is subtracted |
| Debit note date, same DN | tracking sheet 7 Apr 2025 | summary 4 Jul 2025 | day and month swap |
| `DSY.xlsx` | tracker ₹63,236 | file ₹55,834.40 | tax-inclusive against pre-tax (guess) |
| `go colours 000023.xlsx` | file 46 pieces | tracker 47 | one piece |
| `ambreli 1855.xls` | tracker 62 | invoice sheet 76; packing 275 | three quantities |
| Photographed invoice and its PT file | ₹1,14,156.90 | ₹1,14,115 | rounded basic |

## 10. Data-quality issues

Dates and numbers

- Day and month swapped: hidden sheet invoice dates (at least 11 rows); both DN `SUMMARY` sheets (112 and 26 dates); DN CN dates (7 in Oct to Dec 2026 look like a year typo). Month and year columns derived from these dates are wrong on those rows.
- Numbers stored as text or the other way round: invoice numbers (1,092 text, 162 numbers, 5 turned into dates); CN numbers (21 stored as decimals); a DN amount `4,46,395`; barcodes, HSN and sizes in the software sheets.
- Ageing is stored as text (`595 Days`) and keeps growing after payment; there is no due date, so overdue cannot be computed from the sheet.
- Totals rows sit inside data ranges (both `SOFTWARE` sheets).

Identity

- Supplier names: three pairs in the master differ only by spacing; two supplier names on tracker rows differ from their file names; 66 rows have no supplier; one supplier holds several brands but the lookup returns one value.
- Brand names: 30 variants in `SUPPLIER BRAND DETAILS.xlsx`; `FM`, `U.S. POLO` and similar short forms in the claim sheet; brand codes (`PE`, `LP`, `VH`, `AS`) in file names.
- One DN series split across two sheets by party type; DN numbers padded two ways; 13 rows without the usual DN number.
- `Bill No` in the software sheets is not unique to a document.

Process

- Claims: `DN TYPE` blank on 189 of 345; status and remark disagree on some rows; `GR NUMBER` holds either the DN number or the supplier's invoice number depending on the reason.
- Credit notes issued to the wrong legal entity (KDPS Lifestyle against Om Ganpati) are patched by remarks, not fields.
- Payments are not linked to a bank line; one payment can cover several bills on a single row.
- Cash discount is typed in the master, but for the one supplier with many payment rows it was deducted on only 3 of 20 (cannot tell whether that was intended).
- Sensitive content present in the files (not copied): supplier bank accounts and IFSC codes (111 rows in the master, copied down onto invoice rows by lookup), agent names and phone numbers, GSTINs on the software sheets and invoices, supplier addresses and a Udyam number, KDPS's e-mail address on the ledger.

## 11. Mapping to the PRD and policies

Verified by search in `docs/prd.md` and `docs/kdps-policies.md`.

| Area in the data | PRD and policy IDs | What the data shows against the rule |
| --- | --- | --- |
| Brand, supplier and agent as separate parties; one supplier many brands | `PRD-MER-001`, `PRD-ORG-016` | Agent firm and agent person live in the supplier master; the brand to supplier map is one to one in the file but many to many in practice. |
| Credit days, cash discount, return and credit-note terms | `PRD-ORG-016`, `PRD-BKG-002`, `POL-01.08`, `POL-01.10`, `POL-01.11` | Credit days and CD sit on the supplier, with no effective date and no per-booking override. "Cash discount" has no PRD word (see below). |
| Invoice capture, matching, approval, payment readiness | `PRD-PAY-001`, `PRD-PAY-002`, `PRD-REC-010`, `PRD-REC-016` | The tracker does capture and a basic match by hand. Duplicate checks, disputes, holds and supplier-credit application are done in other sheets or not at all. |
| Booked status (`BOOKED IN VENUE.` and others), unbooked articles | `PRD-BKG-005`, `PRD-BKG-007`, `PRD-BKG-008`, `PRD-REC-004` | `Non Booked Article Found.` is delivery without a booking (`PRD-BKG-008`). Receiving Site is typed as a remark (`PRD-REC-004`). |
| PT file per invoice; PT upload; file name rules | `PRD-REC-014`, `PRD-REC-018`, `PRD-PTW-002`, `PRD-PTW-008`, `PRD-IMP-001`, `PRD-IMP-002`, `PRD-IMP-003`, `PRD-IMP-004` | One PT workbook per invoice from April 2026; names carry supplier, brand, invoice, destination and pieces. |
| Duplicate and repeated uploads | `PRD-IMP-011`, `PRD-IMP-013` | Same invoice number under two suppliers; same invoice listed twice (Aditya Birla); monthly extract against per-invoice files. |
| Costs, extra charges, rounding | `PRD-PTW-010`, `PRD-PTW-011`, `PRD-PTW-013`, `PRD-LED-006` | Pre-tax basic times a multiplier; `Motiya` and rounding are not in the PT. |
| Sale-or-return and consignment stock | `PRD-PAY-003`, `PRD-ORG-014`, `PRD-OFR-020`, `POL-09.03` | `(SOR)` brand label on invoices; "CONSIGNMENT" in remarks; no agreement reference. |
| Supplier returns, DN, CN, claims, settlement | `PRD-OFR-008` to `PRD-OFR-019`, `PRD-DMG-007`, `PRD-DMG-009`, `PRD-LED-017`, `POL-01.10`, `POL-01.11` | Seven claim statuses, five goods-return reasons, DN series. The DN workbook is the claims register (`PRD-OFR-018`) and links DN to CN to settlement (`PRD-OFR-019`). Physical return does not reduce a payable in the PRD; in the workbook the unsettled balance is DN minus CN. |
| Return reminders and deadlines | `PRD-OFR-009`, `PRD-OFR-010` | No deadline column in the workbook. |
| Promotional funding and display support | `PRD-OFR-018`, `PRD-OFR-002`, `PRD-OFR-006` | `EOSS CREDIT NOTES` and `FURNITURE CLAIM` types are defined and unused. |
| Legal entities ("franchisee" column) | `PRD-ORG-001`, `PRD-ORG-005`, `PRD-ORG-020`, `PRD-TRF-003` | Claims, credit notes and purchase documents are booked under KDPS Lifestyle or Om Ganpati; credit notes land in the wrong entity's ledger. |
| Tally books and vouchers | `PRD-LED-003`, `PRD-LED-008`, `PRD-LED-012`, `PRD-LED-013`, `POL-09.15`, `POL-11.01` | Supplier ledgers are Tally-style. Purchases keyed `25-26/nnnn`; payments by number; DN raised in software and tracked in a workbook. Purchase return maps to Debit Note (`POL-09.15`). |
| Payment from bank evidence | `PRD-PAY-005`, `PRD-PAY-007` | Payments typed with a date and no bank reference. |
| MSME and statutory dates | `PRD-PAY-010`, `POL-10.09` | A Udyam number is printed on one ledger; no classification column exists. |
| Importing history and side-by-side checks | `PRD-IMP-010`, `PRD-LIF-009`, `PRD-LIF-010`, `PRD-LIF-013`, `PRD-LIF-014` | Opening supplier dues come from ledgers like these; they are analytical history, not live documents. |
| Supplier fill rate, PT accuracy, damage | `PRD-BKG-011` | The unordered-stock and price-mismatch returns are the raw events. |
| Missed supplier returns and dead stock cost | `PRD-EXC-007`, `PRD-EXC-001` | 208 DNs worth ₹1.57 crore pending. |

No PRD home found (searched for each term):

- Cash discount (CD) on supplier invoices: the percentage, its base (before tax, apparently), the "% in bill" and "NET" forms, and when it is earned. The PRD has "payment terms" (`PRD-ORG-016`) but no cash discount.
- Interest on a supplier balance ("Interest If Any").
- Supplier invoice ageing and due date from credit days (the Words table defines ageing for dues; `PRD-PAY-011` covers receivables).
- Gift with purchase (`GWP`) stock and "promo also billed" goods billed at about MRP with an invoice (`PRD-OFR-001` lists percentage, flat, buy-X-get-Y and basket offers, not gifts).
- Brand reimbursements of staff salary, monthly target incentives and EOSS credit notes as DN types (only shortage, damage, price differences, promotional funding and display support are in `PRD-OFR-018`).
- Goods-return reasons such as stock correction and wrong invoice as a "bill to bill" return.
- A distributor or agent between brand and KDPS who bills on the brand's behalf (`PRD-MER-001` names agents and invoicing parties but not what the agency does).
- Extra invoice charges (`Motiya`, `Bus Fare`, service charge) as separate lines.
- Purchases through a second legal entity (Om Ganpati Enterprises) for a KDPS Store; `PRD-ORG-005` maps a business unit to one entity but not an invoice addressed to the other.

## Open questions

| # | Question | Owner |
| --- | --- | --- |
| 1 | What are TEN, "VENUE" and "DB" (the booking and upload systems named in the statuses)? Which software produces the `SOFTWARE` sheets? | KDPS Owner, Accounts |
| 2 | Which figure is the true supplier balance: `INVOICE DETAILS.`, `SUMMARY`, the DN workbook or Tally? Which is the source of record for the side-by-side test? | Accounts, CA |
| 3 | What is the base and the rule for cash discount (before tax, within credit days, "NET", "% in bill")? Why is it deducted on only some payment rows? | Accounts |
| 4 | What does credit days "NO" mean (pay on delivery)? What is "Interest If Any" and which way does it move the balance? | Accounts |
| 5 | What does an agency company do (commission, billing, collection)? Does KDPS pay the agent anything? What is "Direct"? | Booking, Accounts |
| 6 | Is the DN series meant to be one per warehouse per financial year? Why are 141 DNs (₹1.74 crore) not on the tracking sheets, and who decides brand against non-brand? | Accounts |
| 7 | Which DN types are brand-funded (`EOSS CREDIT NOTES`, `STAFF SALARY REIMBURSEMENT`, `FURNITURE CLAIM`, `MONTHLY TARGET INCENTIVE`) and do they exist in practice? When is each claim status used (`HOLD`, `REJECTED`)? | Accounts, brand manager (P-BRM) |
| 8 | Which legal entity books which claim and which Store (the `FRENCHEEZI` column)? How is a credit note posted to the wrong entity corrected? | KDPS Owner, CA |
| 9 | What are the 1,048 software lines that name KDPS Lifestyle as the party? | Accounts |
| 10 | What do the dates mean on the summary sheets: which is right where day and month are swapped? Are the CN dates in Oct to Dec 2026 a year typo? | Accounts |
| 11 | Is the soft-copy and PT file naming convention official, and what do the destination codes (`JSL`, `HZB`, `FS-DEO`, `SBJ` and others) stand for? | Booking, Warehouse |
| 12 | Who types the 538 file-name-only rows, how soon, and is the hidden sheet retired? | Accounts, Booking |
| 13 | Why were the Prem Clothing and Omkar Creation ledgers sent? Are they the supplier confirmation process, or the opening dues? | Accounts |
| 14 | What is "Motiya"? Is it taxed, and does it enter the cost of the goods? | Accounts, CA |
| 15 | What does the `BARCODE` Yes/No flag mean, and who maintains the brand to supplier map? | Booking |
| 16 | What agreement sits behind `U.S POLO (SOR)` and "CONSIGNMENT"? | KDPS Owner, CA |
| 17 | How are promo goods and gift-with-purchase items received, valued and sold? | Booking, brand manager (P-BRM) |
| 18 | Is a monthly brand extract (Madura) a purchase document, a check, or both? Why are 16 credit-type documents not on the tracker? | Product owner, Accounts |
| 19 | Are supplier MSME classes recorded anywhere (a Udyam number appears on a ledger)? | Accounts |
| 20 | Are payments made from one or several bank accounts, and where is the reference kept? | Accounts |
