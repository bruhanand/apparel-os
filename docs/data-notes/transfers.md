# Transfers

> **Not ranked.** These notes describe the data KDPS sent. They decide nothing. A PRD or policy change they lead to needs an entry in [decisions.md](../decisions.md) first. See [README.md](README.md).

This note describes how stock moves between KDPS places today, what paper and what records the move leaves, and what the ERP must capture that is missing. The ERP side is the PRD section "Transfers and physical movement" (`PRD-TRF-001` to `PRD-TRF-026`), the stock ledger design ([stock-ledger.md](../design/stock/stock-ledger.md), section 7.8 for cost between pools) and delivery stage 3.

- **Sources.** Three photographs in `transfer-data/`; the movement columns of two stock-on-hand (SOH) files; the inward ledgers inside the Singh More daily sales report (DSR), the Banka report, the Allen Solly Deogarh workbook and the Dumka workbook; the `Stock Remarks` column of the invoice tracker; the debit-note workbook; item 7 of `Q&A-req-recieved/MOM_S.xlsx`.
- **Codes.** What `WH`, `DEO`, `VAS` and the other sender codes stand for is in [stores-and-codes.md](stores-and-codes.md) section 3.2. This note uses them.
- **Marks.** **(guess)** marks my reading. Counts are of what the files hold.
- **Privacy.** Tax registration numbers, PAN, phone numbers, vehicle numbers and signatures on the photographs are not copied.

## 1. What today looks like

- **Stock reaches these stores by transfer, not by purchase.** In the Hazaribagh SOH for 1 Apr to 30 Jun 2026 the columns `Purchase`, `Adjustment`, `Sl Ret` and `Pur Ret` are empty on every row; all inflow is in `Stf Reciept`. The same holds for `SOH REPORT FORMAT.xlsx`. Suppliers invoice KDPS, goods are counted in at the Ranchi warehouse (`WH`) or at a store, and the stores then receive stock from the warehouse or from each other.
- **The warehouse is the biggest sender.** Of 665 inward documents in the Singh More ledger, 614 are `WH` documents (92%).
- **Stores also send to each other.** Deoghar, Hazaribagh, Gaya, Bokaro, Banka, Dumka and others appear as senders in each other's ledgers.
- **Some supplier goods go straight to a store.** In the invoice tracker, 45 of 62 remarks say the goods were received at a store (Vaishnavi Deoghar 30, Jainsons Hazaribagh 8, Lee Deoghar 7). 8 say they were received at the warehouse, and 6 of those add a per-store split. 9 are transfer-only remarks.
- **The paper is thin.** A transfer leaves a delivery challan (for some movements), a transporter's gate pass, and hand tallies. The challan is category-level and carries no tax. No document in the data carries an item, size or barcode list, an approval, a count at receipt or a short or damaged quantity.
- **In the POS a transfer is a number.** The sender's `S-` document number is typed at the receiving store with the lines. The SOH report shows a transfer only as two totals, `St Trf` and `Stf Reciept`, with no counter-party.
- **A transfer is sometimes keyed as a sale.** The Singh More DSR holds 479 sale lines marked as stock transfers, with tender recorded on most of them.
- **The format is explained, not written.** MOM item 7 (`WH TO STORE TRANSFER FORMAT`) is marked `EXPLAINED`. No file was handed over.

## 2. The paper evidence: `transfer-data/`

Three WhatsApp photographs, all dated 25 Jun 2026 and taken at a store desk (a keyboard is visible in one). They show goods moving from Ranchi to Deoghar and Hazaribagh on 16 and 23 Jun 2026.

| File | What it shows | Key fields |
| --- | --- | --- |
| `WhatsApp Image 2026-06-25 at 16.07.56.jpeg` | A KDPS delivery challan on top and a Vishal Roadways consignment note below | Challan `DC NO: DCJ/26-27/0073`, date 23 Jun 2026; transport mode Vishal Roadways. Receiver (billed to) and consignee (shipped to) both KDPS, same state (code 20) and same registration number. One line: "READYMADE GARMENTS", product FROCK, HSN 620449, 26 pcs, unit Pcs, rate 349.00, taxable amount 9,074.00. Subtotal 0.00; CGST @ 2.5%, SGST @ 2.5%, IGST @ 5% and IGST @ 18% all 0.00; net amount 9,074. Terms: 100% advance, payment by cheque, NEFT or RTGS, disputes subject to Patna jurisdiction. A stamp and a signature for the authorised signatory, dated 23/06/26. Handwritten: a circled 1 and a short Hindi note at the top (not legible). Consignment note: C.N. No. 29581, dated 23/6/26, 1 package, "To pay 170", statement charge 20.00; consignor and consignee both written "K.D.P.S. Lifestyle" |
| `WhatsApp Image 2026-06-25 at 16.07.44.jpeg` | A pink B.R.L. Road Carrier gate pass (destination copy), with a handwritten freight split below | No. 15460, dated 23/06/26, from Ranchi to Deoghar; gate pass stub no. 2382. Freight 600, statement charge 20, stub total 610. Handwritten: "LEE - 250/-" and "Vaishnavi Deoghar 210", "Bhara 60", "Total 270". "Bhara" is probably the Hindi word for freight (guess). So one freight charge is shared between the Lee and Vaishnavi Deoghar stores |
| `WhatsApp Image 2026-06-25 at 16.08.49.jpeg` | The same kind of gate pass dated 16 Jun, with handwritten piece tallies | No. 14228, dated 16/06/26, Ranchi to Deoghar; stub no. 2271. Freight 800, statement charge 20, stub total 810; "810 + 200 = 1010" written beside it (partly legible) |

### 2.1 The two tallies on the 16 Jun page

- **Left column (red ink).** Numbered 1 to 4 in circles: 88; 62 and 53 together in a bracket; 85; 155. The underlined sum is 443 with the word "stock" beside it, and a second figure 450. If each number is a carton (the gate pass lists a few packages), this is a count by carton (guess).
- **Right column.** A circled `12/321` and then pairs: `1/305`, `191/308`, `4/309`, `25/311`, `56/312`, `16/313`, `1/314`, `137/316`, summing to 431, then `431 + 19/304` equals 450. The first number looks like pieces and the second like a document number (guess). The numbers 304 to 321 are not tied to any series in the ledgers.
- **What it shows.** Two tallies of the same delivery (443 and 450) differ by 7 pieces, and nothing on the page explains the difference or says who counted. The tally is unsigned.

### 2.2 What the challan has, and what it lacks

| Has | Lacks |
| --- | --- |
| A KDPS-numbered document `DCJ/26-27/nnnn` with date | Item, size, colour, barcode, brand, MRP |
| Sender (a Ranchi billing address and the Deoghar branch address), receiver and consignee blocks | A reference to the inward or transfer document in the POS |
| HSN, quantity, rate and taxable amount per line, and tax rows set to 0.00 | A statement of what the rate of 349 is: cost, MRP or a transfer price |
| Transporter name and consignment note | Vehicle, departure time, arrival time, e-way bill number |
| An authorised signatory's stamp | The preparer, an approver, the receiver's signature, a count |

- **Same registration both sides.** The challan names the same state and registration number for the receiver and the consignee, so it is an inter-branch movement with no tax (reading). A movement to another registration or another state would need a tax invoice and possibly an e-way bill. See [stores-and-codes.md](stores-and-codes.md) section 1.3.
- **The template looks like a tax invoice.** The "Payment Terms 100% Advance" and "Add: IGST" rows are invoice wording on a delivery challan (guess).
- **Category-level line.** One line "READYMADE GARMENTS / FROCK" for 26 pieces. The ERP's rule is that a transfer lists items and quantities, not a category (`PRD-TRF-006`, `PRD-MER-016`).

## 3. What the earlier POS records

### 3.1 The two movement columns of the SOH report

The SOH layout (`SOH REPORT FORMAT.xlsx`, `store-analysis/jsl/soh30626.xlsx`) is one row per barcode with these columns: `Item Name`, `Brand`, `Size`, `Supplier`, `Barcode`, `Design No`, `Category`, `Gender`, `Fit`, `Season`, `Op Qty`, `Purchase`, `Sale`, `Adjustment`, `Sl Ret`, `St Trf`, `Stf Reciept`, `Pur Ret`, `Tqty`, `Mrp`, `Rate`, `Amount`. (`SOH REPORT FORMAT.xlsx` adds `Color`.) Outflows are stored as negatives. `Op Qty` plus the movements equals `Tqty` on every row of both files. The spelling `Stf Reciept` is in the file.

| File | `Op Qty` | `Sale` | `St Trf` | `Stf Reciept` | `Tqty` | Rows with `St Trf` ≠ 0 | Rows with `Stf Reciept` ≠ 0 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Q&A-req-recieved/SOH REPORT FORMAT.xlsx` (store and period not stated) | 18,462 | −2,779 | −2,805 | +4,737 | 17,615 | 1,390 | 2,308 |
| `store-analysis/jsl/soh30626.xlsx` (Hazaribagh, 1 Apr to 30 Jun 2026), all rows | 58,613 | −7,548 | −2,477 | +10,139 | 58,727 | 1,733 | 5,477 |
| Same, merchandise only (the `JAINSONS` carry bag, 31,012 pieces in stock, left out) | 25,562 | −5,509 | −2,477 | +10,119 | 27,695 | not counted | not counted |

- **Hazaribagh took in nearly twice what it sold.** In the quarter it received 10,119 merchandise pieces by transfer, sold 5,509 and sent 2,477 on.
- **No counter-party and no document number** sit on a movement row. A reader cannot tell where `Stf Reciept` came from or where `St Trf` went. The ledgers in 3.2 hold the sender's document number.
- **No purchases at a store.** `Purchase` is zero on every row of both files. An earlier analyst note says the same in words: "Stock comes by transfer from head office (the store made no direct purchases)". That is an analyst reading, not a KDPS statement.
- **The item's `Supplier` stays on the row** when stock moves. In both files, units of KDPS and its related firms appear as suppliers (`KDPS LIFESTYLE PVT LTD (DEOGHAR)`, `OM GANPATI (DMK)`, `SANSKAR RETAIL`; see [stores-and-codes.md](stores-and-codes.md) section 1.4).
- **The ERP side.** During the side-by-side test this report is an import for checking only and never moves stock (`PRD-LIF-013`, `PRD-LIF-014`).

### 3.2 The inward ledgers and the sender's document number

Four workbooks hold a ledger with one line per barcode and a document number. The columns are `Date`, `Bill no` (or `Invoice No`), `Barcode no`, `Brand`, `Product`, `Style code`, `Size`, then `Stock Opening Qty`, `Stock Inward`, `Qty Sold`, `Till Date Qty`, `MRP`, `Total MRP`. In the Singh More DSR the sheet `Stock Inward Details` has only `Date`, `Invoice No`, `Barcode no`, `Brand`, `Product`, `Style code`, `Size`, `QTY`, `MRP`, `Total MRP`.

| Ledger | Sheet and rows | Documents | Period |
| --- | --- | --- | --- |
| Singh More DSR (`bank-statement/3. Vaishnavi Singh More DSR(Fy-26-27).xlsx`) | `Stock Inward Details`, 12,121 lines, 23,622 pieces, MRP ₹3.49 crore | 665 | 1 Oct 2024 to 2 Jun 2026 |
| Banka report (`APR SALE & STOCK REPORT BANKA.xlsx`) | `STOCK REPORT`, 12,177 rows | 785 | 24 Dec 2021 to 29 Apr 2026 |
| Allen Solly Deogarh (`AS  & LP2  APR 26 SALE  AND SOH AS-DEO.xlsx`) | `AS SOH ` 10,372 rows; `LP2 SOH ` 336 rows | 262 in `AS SOH `; 29 in `LP2 SOH ` | 3 Aug 2024 to 18 Apr 2026 |
| Dumka (`LP_APRIL SALE REPOT_DUMKA.xlsx`) | `AS-SOH` 804 rows, `LP-SOH` 360, `VH-SOH` 322 (no header row) | 30, 19 and 6 | 14 Sep 2025 to 22 Apr 2026 |

Documents sent to the receiving store, by sender code (documents in each ledger):

| Sender | Singh More | Banka | Allen Solly Deogarh (`AS` / `LP2`) | Dumka (`AS` / `LP` / `VH`) | Reading (see [stores-and-codes.md](stores-and-codes.md)) |
| --- | --- | --- | --- | --- | --- |
| `WH` | 614 | 673 | 200 / 15 | 22 / 15 / 2 | Ranchi warehouse |
| `DEO` | 5 | 32 | 33 / 11 | 0 / 3 / 2 | Vaishnavi Deoghar (guess) |
| `VAS` | 20 | 2 | 0 | 0 | Unknown Vaishnavi sender |
| `VAB` | 7 | 0 | 3 / 1 | 0 | Vaishnavi Banka |
| `DMK` | 5 | 5 | 1 / 0 | 0 | MBO Dumka |
| `BGP` | 4 | 8 | 0 | 0 | Bhagalpur |
| `RKJ` | 3 | 1 | 0 | 0 | Unknown (Jockey goods) |
| `JSL` | 3 | 2 | 1 / 1 | 2 / 1 / 1 | Hazaribagh |
| `KLG`, `KLG2` | 2 | 19 | 0 | 0 | Kahalgaon |
| `JBNK` | 1 | 5 | 0 | 0 | Jockey Banka |
| `SBJ` | 0 | 19 | 0 | 0 | Sahebganj |
| `LEEDEO` | 0 | 6 | 0 | 0 | Lee Deoghar |
| `SGMR` | 0 | 4 | 0 | 0 | Singh More |
| `DEOT` | 0 | 3 | 1 / 0 | 3 / 0 / 0 | Allen Solly Deogarh (guess) |
| `PTN` | 0 | 2 | 0 | 0 | Patna |
| `LBKR` | 0 | 1 | 2 / 1 | 0 | MBO Bokaro |
| `GAYA` | 0 | 0 | 1 / 0 | 1 / 0 / 0 | MBO Gaya |
| `ASVH` | 0 | 1 | 1 / 0 | 2 / 0 / 1 | Unknown |
| Other kinds | 1 `Audit Diff` | 1 `Scan Stock`, 1 `Audit Differance` | 15 `MSF…` supplier invoices, 1 `Opening Stock`, 1 audit, 2 `Ex Bill` | 0 | Not senders (see [stores-and-codes.md](stores-and-codes.md) section 3.2) |

**How the document number changed.** The same warehouse numbering shows four shapes, by date:

| Shape | Example | Dates seen |
| --- | --- | --- |
| `WH/<n>` (no year, no `S`) | `WH/690` | 28 Jan 2022 to 29 Mar 2025 (Banka); 3 to 12 Aug 2024 (Allen Solly Deogarh) |
| `<CODE>\S-<n>` (backslash) | `WH\S-301`, `DEO\S-19`, `KLG\S-1`, `SBJ\S-5` | Apr 2023 to Mar 2025 (Singh More from 1 Oct 2024) |
| `<FY>/WH/<n>` | `25-26/WH/14` | 10 Apr to 14 May 2025 (26 documents, Banka only; a switch-over shape) |
| `<FY>/<CODE>/S-<n>` | `26-27/WH/S-175` | From 27 Mar 2025 (Allen Solly Deogarh) or 10 Apr 2025 to Jun 2026 |

- **Restart each year.** Each sender's numbering restarts at the new financial year. The Singh More ledger shows `WH` serials 34 to 3,160 in FY 25-26 (10 Apr 2025 to 31 Mar 2026, 348 documents seen) and 21 to 689 in FY 26-27 (4 Apr to 2 Jun 2026, 60 documents seen). So the warehouse issues about 10 `S-` documents a working day.
- **A document is small.** The 614 `WH` documents in the Singh More ledger have a median of 7 lines and 14 pieces. The largest has 323 lines and 498 pieces. 204 of them cover more than one brand. Each has one date. 35% of lines carry more than 1 piece. Whether the date is dispatch or receipt-keyed is not shown.
- **Who a document is addressed to.** The ledger gives no destination. The destination is whichever store's workbook holds the document.
- **Other inward kinds in the same column.** `Opening Stock` (14 rows dated 9 Aug 2024), `Audit Diff` and `Audit Differance` (pieces found at an audit and added as inward; 77 lines in Singh More, 78 in Banka, 23 in Allen Solly Deogarh), `Scan Stock` (105 rows, Banka), `Ex Bill` (3 rows) and `MSF…` (Aditya Birla's own invoice numbers for goods that arrived straight at Allen Solly Deogarh: 15 documents, 152 rows, 207 pieces).
- **An audit difference is an inward.** The ERP does not create stock this way. A count surplus with no known origin creates custody held as excess (`PRD-STK-014`) and every difference needs an approver (`PRD-STK-012`).

### 3.3 Transfers keyed as sales (`Stock Transferr`)

The Singh More DSR (`Sale` sheet, 4,780 lines, 1 Apr to 5 Jun 2026) has a column `Reason for Discount or Dues`. 479 lines hold a transfer reason. They sit inside ordinary `26-27/SGMR/n` bills.

| Reason text | Lines | Pieces | MRP total | Net sale value (`NSV`) | Dates (2026) |
| --- | --- | --- | --- | --- | --- |
| `Stock Transferr` (typo in the file) | 374 | 415 | ₹7.27 lakh | ₹3.17 lakh | 18 to 29 Apr (94 lines on 21 Apr) |
| `STOCK TRANSFER TO KAHELGAON STORE` | 39 | 49 | ₹0.48 lakh | ₹0.08 lakh | 2 to 5 Apr |
| `STOCK TRANSFER TO WAREHOUSE (DEFECTIVE)` | 18 | 16 | ₹0.13 lakh | ₹0.12 lakh | 13 Apr |
| `STOCK TRANSFER TO WAREHOUSE` | 16 | 15 | ₹0.08 lakh | ₹0.08 lakh | 3 to 4 Apr |
| `STOCK TRANSFER TO SINGHMORE VAISHNAVI` | 15 | 17 | ₹0.20 lakh | ₹0.20 lakh | 11 Apr |
| `DEFECTIVE GR TO WAREHOUSE` | 9 | 9 | ₹0.11 lakh | ₹0.11 lakh | 3 to 4 Apr |
| `STOCK TRANSFER TO BANKA STORE` | 8 | 8 | ₹0.08 lakh | ₹0.07 lakh | 10 Apr |
| Total | 479 | 529 | ₹8.34 lakh | ₹3.82 lakh | |

- **Tender is recorded.** 277 of the 479 lines carry a non-zero cash, UPI, card or dues entry. That tender sits in the day's cash book totals ([store-close-cash-and-bank.md](store-close-cash-and-bank.md)).
- **What `Stock Transferr` holds.** 99 of its 374 lines are `CARRY BAG` lines; 275 are merchandise (303 pieces, MRP ₹7.26 lakh): sarees 69, petticoats 39, blazers 25, kurti sets 22, salwar suits 14, shirts 13 and others. 54 of the 275 have no tender (MRP ₹3.97 lakh). The rest look like ordinary customer sales (guess). 116 bills carry the label.
- **Destinations are named only on 105 lines.** Kahalgaon, Banka, the warehouse (twice, once for defective goods), and a store called "Singhmore Vaishnavi" in a file that is itself the Singh More store's report. The Banka and Kahalgaon destinations match stores 12 and 2 on the store list.
- **Defective goods go to the warehouse** as a transfer (`STOCK TRANSFER TO WAREHOUSE (DEFECTIVE)`, `DEFECTIVE GR TO WAREHOUSE`). `GR` is the goods return of the debit-note sheets (section 5).
- **Meaning (guess).** Stock taken out of the store appears as lines of ordinary `SGMR` bills, labelled in the reason column. They are counted in the day's sales, discount, tender and cash. The PRD keeps internal transfers, returns to suppliers and sales to partners distinct (`PRD-TRF-003`). OPEN: the rule for how the stores are told to record a transfer out.

### 3.4 Stock by location in brand reports

The brand reports for Mufti and Blackberry carry a hand-added column K that tags each stock row with a location, because the POS stock sheet has no location (`LEE DEO`, `JSL`, `GAYA`, `WH`, `VAS-DEO`; row counts in [stores-and-codes.md](stores-and-codes.md) section 3.4). The warehouse (`WH`) holds 83 Mufti rows (112 pieces) and 18 Blackberry rows (23 pieces). `KDPS LIFE.xlsx` is the brand's own list of KDPS stock (907 rows) without any location. The ERP reads stock by location (`PRD-STK-006`, `PRD-PRO-001`).

## 4. The invoice tracker's transfer remarks

Source: `KDPS INVOICE & OFFER DETAILS..xlsx`, hidden sheet `Arvind & LC Invoice Details.`, column `Stock Remarks`. 67 invoices of Vishal Marketing & Co. for Arvind brands (U.S. Polo, Arrow, Flying Machine, Linen Club; invoice dates 11 Jan to 11 Dec 2025). 62 carry a remark. The remarks describe what happened to the goods after they arrived.

| Remark type | Invoices | Example |
| --- | --- | --- |
| Received at Vaishnavi Deoghar | 30 | "Product Received (Vaishnavi Deoghar)." |
| Received at Jainsons Hazaribagh | 8 | "Product Received (JainSons/HZB)." |
| Received at Lee Deoghar | 7 | "Product Received (Lee Deoghar)." |
| Received at the Ranchi warehouse | 8 | "Product Received at Ranchi(WH), Stock Transfered 03 Units Vaishnavi Banka, 06 Units Vaishnavi Ratu, & 21 Units KDPS Bokaro." |
| Transfer only | 9 | "TAS (HZB) Stock Transfer To JainSons (HZB)." (3), "Deoghar Stock Transfer To Patna." (2), "TAS Dumka Stock Transfer To Lee Deoghar." (1), and three splits |

Where a remark gives a split, the numbers add to the invoice quantity:

| Invoice | Pieces | Split in the remark | Adds up |
| --- | --- | --- | --- |
| `S/25-26/1189` (U.S. Polo, 30 Aug 2025) | 243 | Lee Deoghar 58, "USPA & SPYKAR" 76, Allen Solly Gaya 109 | Yes |
| `S/25-26/1358` (10 Sep 2025) | 125 | Lee 38, USPA & Spykar 27, Allen Solly Gaya 47, Jainsons (HZB) 13 | Yes |
| `S/25-26/1577` (25 Sep 2025) | 131 | Lee 66, USPA & Spykar 28, Allen Solly Gaya 37 | Yes |
| `S/170` (Linen Club, 11 Sep 2025) | 385 | Ratu 88, Banka 55, Lee 102, Bokaro and Sahibganj 140 | Yes |
| `S/171` (11 Sep 2025) | 125 | Ratu 48, Bokaro 40, returned to Vishal Marketing 37 | Yes |
| `S/226` (11 Oct 2025) | 49 | Lee 4, Ratu 12, Banka 9, Bokaro 24 | Yes |
| `S/239`, `S/282`, `S/302` | 30, 260, 21 | The same remark on all three: Banka 3, Ratu 6, Bokaro 21 (sum 30) | Only for `S/239` |

- **The split lives in a free-text cell.** There is no transfer document behind it in this workbook; the real documents are the sender's `S-` numbers in the stores' ledgers.
- **A split can include a supplier return** ("37 Units Returned To Vishal Marketing").
- **Other mentions of transfers in the workbook.** `INVOICE DETAILS.` lists a `Transfer Stock PT File (USPA INNERWEAR)` (a PDF and an XLSX with no supplier or invoice number). It shows a PT file was made for a transfer. The ERP keeps a transfer's PT and its statutory documents as separate linked records (`PRD-TRF-023`). A threaded comment on an invoice reads "goods returned from Sainsons (HZB)", a typo for Jainsons.

## 5. Returns to the warehouse and to suppliers

- **Debit notes are numbered by the warehouse.** The debit-note workbook (`KDPS DEBIT & CREDIT NOTE DETAILS.xlsx`) numbers goods returns `<FY>/WH/PR-n` (369 in FY 25-26 and 104 in FY 26-27 to 25 May 2026 in the two summary sheets). The `DN COPY` file names show where the goods came from: Hazaribagh (6 names), Sanskar (4), Bokaro (3 or 4), Dumka (2), and one each for Deoghar and "RATU STOCK (SMORE STORE". So a store's return to a supplier appears to be raised as a warehouse debit note (guess).
- **Types.** `DN TYPE` is `GOODS RETURN` (60 in the non-brand sheet, 22 in the brand sheet) or `DAMAGE GOODS CLAIM` (74).
- **Where it fits.** A supplier return is its own flow (`PRD-DMG-007`, `PRD-DMG-009`, `PRD-TRF-003`). A defective piece going from a store to the warehouse is a controlled quarantine movement with its own authority (`PRD-DMG-007`, `PRD-DMG-008`, `POL-17.01`). More on debit notes: [purchases-and-supplier-notes.md](purchases-and-supplier-notes.md).

## 6. Flows seen

| Flow | Evidence | What is recorded today |
| --- | --- | --- |
| Supplier to Ranchi warehouse, then to stores | Remarks (8 invoices); `WH` as sender in every ledger | The supplier invoice; `<FY>/WH/S-n` documents typed at the receiving store; a challan for some movements; a transporter's gate pass |
| Supplier straight to a store | 45 of 62 remarks; `MSF…` rows at Allen Solly Deogarh | The store keys the supplier's invoice |
| Store to store | `JSL`, `GAYA`, `DEO`, `DMK`, `VAB` senders in other stores' ledgers; "TAS Dumka Stock Transfer To Lee Deoghar" | The sender's `S-` number at the receiver |
| Deoghar to other stores | "Deoghar Stock Transfer To Patna" (2 invoices, 277 and 127 pieces); Deoghar as sender for 32 documents in the Banka report | Remarks and `S-` documents |
| Store to warehouse (defective, goods return) | DSR transfer lines; `GR` debit notes with store names | A sale-style line at the store; a warehouse debit note |
| Warehouse or store to supplier | `WH/PR-n` debit notes; "37 Units Returned To Vishal Marketing" | The debit note |
| Branch to branch on a challan | `DCJ/26-27/0073`, Ranchi to Hazaribagh, 26 frocks | A category-level challan, no tax |
| Across firms | `OM GANPATI (DMK)` and `SANSKAR RETAIL` as supplier names on stock rows | Unknown. Possibly a sale between firms (OPEN) |

## 7. What the ERP must capture that is missing today

| Gap today | Evidence | The ERP rule |
| --- | --- | --- |
| No transfer document with one source and one destination, and a destination that is a named place | The ledger gives no destination; the challan has billed-to and shipped-to blocks | One source and one destination per document; different destinations need separate documents (`PRD-TRF-001`, `PRD-TRF-002`); allowed destinations shown by name and code (`PRD-TRF-004`) |
| No request, approval or reservation | No paper or ledger shows who asked for or approved a move | Request, independent higher-authority approval and reservation, then dispatch (`PRD-TRF-005`, `PRD-TRF-008`, `PRD-ACS-006`, `PRD-ACS-007`); the approval limit is on cost (`PRD-ACS-015`, `POL-02.07`, `POL-02.09`). A reduction before dispatch needs no new approval (`POL-02.12`, `POL-05.03`) |
| Lines are not items | Category-level challan; a ledger of barcodes without a document | Items and quantities; piece-tracked goods by piece ID (`PRD-TRF-006`, `PRD-MER-016`, `PRD-STK-004`); approval needs official PT coverage and source acceptance (`PRD-TRF-006`) |
| Dispatch evidence is on paper only | Gate pass and consignment note photographs | Actual quantities, source references, departure time, recording time, actor and transport evidence per dispatch; several dispatches per approved movement (`PRD-TRF-011`, `PRD-TRF-013`) |
| No in-transit state | Stock leaves the sender's POS and appears at the receiver when keyed | Transit kept separate from physical, available and reserved stock (`PRD-STK-001`); pending destination visibility is not receipt (`PRD-TRF-013`) |
| Receipt is a hand tally, unsigned | 443 against 450 on the 16 Jun page | Receive each dispatch as one whole shipment, scanned; an unfinished count cannot short-close it (`PRD-TRF-014`, `PRD-TRF-015`); record good, damaged, wrong, unidentified, excess and missing quantities; damage is not shortage (`PRD-TRF-016`); release good quantities independently (`PRD-TRF-017`); explicit resolution before missing goods count as accounted for (`PRD-TRF-018`); an owned exception for a transit gap (`PRD-EXC-001`) and an alert for overdue transit (`PRD-EXC-013`) |
| A failed or returned delivery has no record | Nothing in the data | Record receipt at the source linked to the dispatch (`PRD-TRF-019`); completion rules (`PRD-TRF-020`, `PRD-TRF-021`); cancel only the relevant reservation (`PRD-TRF-022`) |
| Statutory documents are separate and thin | A challan with 0 tax; no e-way bill visible | Statutory documents from the configured ownership, entity, registration and movement rules, linked to but separate from the transfer PT (`PRD-TRF-023`); record departure and arrival even when a document is missing, with a compliance exception (`PRD-TRF-024`); track compliance and settlement apart from completion (`PRD-TRF-025`); GST documents through the approved provider (`PRD-TAX-003`, `PRD-INT-010`); configure by entity and transaction (`POL-10.03`, `POL-10.08`) |
| Transfers entered as sales | 479 DSR lines | Keep internal transfers, supplier returns and commercial sales distinct (`PRD-TRF-003`); a transfer takes the source cost without a new purchase or markup (`PRD-TRF-012`, `PRD-LED-015`, [stock-ledger.md](../design/stock/stock-ledger.md) section 7.8). A transfer is not a Contra voucher (`POL-09.25`) |
| Possible transfers between legal entities | Om Ganpati (DMK) and Sanskar Retail as suppliers | Ordinary internal movement stays inside its legal-entity boundary (`PRD-TRF-004`); a change of owner uses the commercial or inter-entity process (`PRD-FRN-006`, `POL-12.01`) |
| Freight is split by hand | "LEE - 250/-", "Vaishnavi Deoghar 210", "Bhara 60" | No PRD rule names transfer freight. The costing profile covers freight on purchases (`POL-03.06`). OPEN |
| Several stores share one carton or one freight bill | The 23 Jun gate pass is split between two stores | A transfer has one destination, so a shared load is two transfers or two dispatches (`PRD-TRF-002`, `PRD-TRF-011`) |
| Audit differences added as inward | `Audit Diff` rows | Never adjust a difference automatically; a surplus with no origin is held as excess (`PRD-STK-012`, `PRD-STK-014`) |
| Numbers per sender, per year, four shapes | Section 3.2 | The ERP numbers each document in its own series (`PRD-MOD-008`; [numbering-and-audit.md](../design/platform/numbering-and-audit.md)). Import maps the old shapes without treating them as new documents (`PRD-IMP-003`, `PRD-IMP-011`) |
| Unfinished transfers at the switch | Not in the data | Carry unfinished transfers with their references (`POL-14.04`); remaining closure quantities (`PRD-LIF-018`) |
| Rebalancing and replenishment by hand | The Hazaribagh quarter shows 2,477 pieces sent on | Recommendations only, never a transfer without approval (`PRD-EXC-016`, `PRD-EXC-020`) |

## 8. PRD transfer rules at a glance

Verified to exist in [prd.md](../prd.md):

- **Movements and documents.** `PRD-TRF-001` four routes (warehouse to store, store to warehouse, store to store, warehouse to warehouse); `PRD-TRF-002` one source and destination; `PRD-TRF-003` transfers, supplier returns and partner sales kept distinct; `PRD-TRF-004` destinations by name and code; ordinary movement stays inside the legal-entity boundary.
- **Approval and reservation.** `PRD-TRF-005` request, independent approval and reservation, dispatch, destination count, acceptance; `PRD-TRF-006` PT coverage, source acceptance and available quantity; `PRD-TRF-007` dispatch recheck; `PRD-TRF-008` approval reserves; `PRD-TRF-009` no automatic expiry; `PRD-TRF-010` renewed approval for material change.
- **Dispatch and receipt.** `PRD-TRF-011` several dispatches; `PRD-TRF-012` documents from source origins, no new purchase or markup; `PRD-TRF-013` dispatch and arrival recorded separately; `PRD-TRF-014` whole-shipment receipt; `PRD-TRF-015` unfinished scan session; `PRD-TRF-016` expected against actual quantities; `PRD-TRF-017` release of good quantities; `PRD-TRF-018` discrepancy resolution.
- **Failure and completion.** `PRD-TRF-019` failed delivery; `PRD-TRF-020` completion by kind; `PRD-TRF-021` complete only when every quantity is accounted for; `PRD-TRF-022` cancellation.
- **Statutory.** `PRD-TRF-023` documents from ownership, entity, registration and movement rules; `PRD-TRF-024` missing documents as a compliance exception; `PRD-TRF-025` compliance and settlement separate from completion. `PRD-TRF-026` keeps supplier return deadlines (supplier returns, not transfers).
- **Elsewhere.** `PRD-REC-001` one Receive Goods inbox per Site for supplier deliveries and incoming transfers; `PRD-STK-005` moves inside a Site are not transfers; `PRD-ORG-013` a default warehouse per Store; `PRD-STK-001` transit kept apart; `PRD-DMG-007` store-to-warehouse quarantine movement.

## Open questions

1. **The WH-to-store format.** MOM item 7 is marked `EXPLAINED`. Send a real set: the warehouse's transfer document, the packing list and the challan for one delivery, with a written description of who prepares what and when. Owner: Operations (the MOM names Debanjan as the data provider). Blocks stage 3 (transfer design).
2. **Who approves a transfer today,** and up to what value; what the Owner or a manager signs. Owner: KDPS Owner (policy 2: `POL-02.07`, `POL-02.09`, `POL-02.10`). Blocks stage 3 live approvals.
3. **Challan or tax invoice.** When is a delivery challan issued and when a tax invoice; what is the rate of 349 on the challan (cost, MRP or a transfer price); is an e-way bill raised, and from what value; what happens for a transfer to another registration or another state. Owner: Accounts and the CA (`POL-10.03`, `PRD-TRF-023`). Blocks stage 3.
4. **What `S-` documents are.** One document per carton, brand, store or day? Why about 10 a day at the warehouse in FY 25-26, against about 4 a day from Oct 2024 to Mar 2025 (`WH\S-301` to about `WH\S-980`)? Is the `Date` the dispatch date or the date keyed at the store? Owner: Operations. Blocks stage 3 and the side-by-side import of ledgers.
5. **Receipt and shortage.** Who counts a delivery, how a difference such as 443 against 450 is recorded and followed up, and who is told. Owner: Operations. Blocks stage 3.
6. **The `Stock Transferr` lines.** What they are, what the stores are told to do, and how the side-by-side import must treat them so that they never move stock (`PRD-LIF-014`). Owner: Operations and Accounts. Blocks the side-by-side test.
7. **Transfers across firms.** Do goods supplied by `OM GANPATI (DMK)`, `SANSKAR RETAIL` or `KDPS LIFESTYLE PVT LTD (DEOGHAR)` change owner, and on what document and price? Owner: KDPS Owner and the CA (`POL-12.01`, `PRD-FRN-006`). Blocks stages 3 and 5.
8. **Freight.** Who pays the carrier, how it is split between stores, and whether it is an expense of the receiving Store or an addition to stock cost. No PRD rule covers transfer freight. Owner: Accounts and the CA. Blocks stages 3 and 5.
9. **Direct delivery or via the warehouse.** Which brands go straight to stores (Madura goods reach stores directly in the data) and which through Ranchi. Owner: Booking. Blocks stage 2.
10. **Returns from stores.** Do stores return to suppliers directly or through the warehouse (the debit notes are warehouse-numbered), and who raises the debit note? Owner: Operations and Accounts. Blocks stage 3 (supplier returns).
11. **Transfer PT.** What the `Transfer Stock PT File (USPA INNERWEAR)` is and who prepares such a file. Owner: Booking. Blocks stage 3.
12. **How a store learns a delivery is coming** (phone, WhatsApp, the carrier) and who signs for it. Owner: Operations. Blocks stage 3.
