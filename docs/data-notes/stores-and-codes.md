# Stores and codes

> **Not ranked.** These notes describe the data KDPS sent. They decide nothing. A PRD or policy change they lead to needs an entry in [decisions.md](../decisions.md) first. See [README.md](README.md).

This note lists every place the data shows KDPS operating, and every store, location and document code found in the files. It answers three questions: which places exist, what each code stands for, and what the bill number looks like.

- **How the codes were found.** The bill-number pattern `<FY>/<code>/<serial>` was searched in every cell of every `.xlsx`, `.xls`, `.xlsb` and `.csv` file. Store words (town names, `KDPS`, `JAINSONS`, `OM GANPATI`) were searched the same way. File names in the invoice tracker were split into parts and counted.
- **Meaning marks.** **Confirmed** means a file says it in its own words (a name column, a title, a sheet label, a file name) or the PRD's "Words used" table defines it. **(guess)** means a reading of a pattern. Neither mark means KDPS has stated it. No store code list was sent: the list of stores has no code column.
- **Privacy.** E-mail addresses on the store list, tax registration numbers, terminal IDs, customer codes at brands and staff names are not copied. They are described as "present".
- **Related notes.** Transfers and the transfer-document numbers: [transfers.md](transfers.md). Purchases and supplier invoice formats: [purchases-and-supplier-notes.md](purchases-and-supplier-notes.md). PT file layouts: [pt-file-layouts.md](pt-file-layouts.md). Bank narrations: [store-close-cash-and-bank.md](store-close-cash-and-bank.md). Earlier-POS export layouts: [pos-exports.md](pos-exports.md).

## 1. Places KDPS operates

### 1.1 The store list

Source: `Q&A-req-recieved/LIST OF ALL STORES.xlsx`, sheet `STORE LIST`, made by KDPS. It has 17 data rows and the columns `SL NO`, `STORE NAME`, `LOCATION`, `EMAIL`, `CLOUD` and `RETAIL JI`. The meaning of `CLOUD` and `RETAIL JI` is not stated. `STORE NAME` is a brand or format name, so it is not unique; a store is identified only by name plus `LOCATION`. The e-mail column is present on 13 rows (one address per store; not copied) and blank on 4. The name column spells the town "DEOGARH"; other files spell it "Deoghar".

The workbook properties say it was written by `openpyxl` on 4 Oct 2026, while the file's modified time is 13 Jun 2026. So the copy in the data folder was rewritten by a script; the original export is not available.

| `SL NO` | `STORE NAME` | `LOCATION` | `CLOUD` | `RETAIL JI` | Format (reading) | Codes seen for it (section 3) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | VAISHNAVI | BHAGALPUR | YES | blank | Vaishnavi family store | `BGP` in transfer documents and bank narrations |
| 2 | VAISHNAVI | KAHELGAON | YES | blank | Vaishnavi family store | `KLG` in transfer documents and bank narrations; `KLG2` (guess: a second series or counter) |
| 3 | MBO | SAHEBGUNJ | YES | blank | MBO | `SBJ` in transfer documents and file names; `SBG` in bank narrations; Madura town `SAHIBGANJ` |
| 4 | MBO | DUMKA | YES | blank | MBO | Bills `DMK`; transfer documents `DMK`; Madura town `DUMKA` |
| 5 | MBO | BOKARO | YES | blank | MBO | Bills `LBKR`; transfer documents `LBKR`; tags `BOKARO`, `BOK`, `MBOB`; Madura town `Bokaro` |
| 6 | VAISHNAVI | SINGH MORE | YES | blank | Vaishnavi family store | Bills `SGMR`; bank tag `SMORE`; the town is never stated |
| 7 | JAINSONS-LIFESTYLE | HAZARIBAGH | YES | blank | Not stated. The sales file holds 347 brands, so it trades like a multi-brand store (inferred) | Bills `JSL`; tags `HZB`, `J-HZB`; dealer site `KDPS-HZB-..`; bank tags `HZB`, `JSONS`; Madura town `Hazaribag` |
| 8 | VAISHNAVI | DEOGARH | YES | blank | Vaishnavi family store | Bills `DEO`; labels `VAS-DEO`, `V-DEO`, `VSN DEO`; transfer documents `DEO`; Madura town `Deogarh` |
| 9 | LEE | DEOGARH | YES | blank | Single-brand EBO by its name. Mufti reports list it too, so it also sells Mufti | Bills `LEEDEO`; SOH tag `LEE DEO`; file-name tags `LDEO`, `LEEDEO` |
| 10 | ALLEN SOLLY | DEOGARH | YES | blank | Single-brand EBO by its name. The workbook also holds Louis Philippe sheets (`LP2`) | Bills `DEOT`; label `AS-DEO`; transfer documents `DEOT`; bank tag `AS DEO` |
| 11 | SPYKAR | DEOGARH | NO | YES | Single-brand EBO by its name | Bank tag `SPY DEO`; no bill series seen |
| 12 | VAISHNAVI | BANKA | blank | blank | Vaishnavi family store | Bills `VAB`; label `Vaishnavi Banka`; transfer documents `VAB`; Madura town `BANKA` |
| 13 | JOCKEY | BANKA | YES | YES | Single-brand EBO by its name | Transfer documents `JBNK`; no bill series seen |
| 14 | MBO | GAYA | YES | YES | MBO | Bills `GAYA`; transfer documents `GAYA`; SOH tag `GAYA`; Madura town `BODH GAYA` |
| 15 | PETER ENGLAND | KANKARBAGH | NO | YES | Single-brand EBO by its name | Tags `KANKARBAGH`, `PEK`, `KKBG`; bank tag `KBAGH` |
| 16 | MBO | KANKARBAGH | NO | YES | MBO | Tags `KANKARBAGH`, `PATNA`; bank tag `KBAGH` |
| 17 | WAREHOUSE | RANCHI | YES | YES | Warehouse | Transfer documents `WH`; debit-note series `WH/PR`; SOH tag `WH`; two Madura towns `RANCHI` |

What the list shows:

- **Formats.** 5 Vaishnavi family stores, 5 MBO, 5 stores named for one brand (Lee, Allen Solly, Spykar, Jockey, Peter England), Jainsons Lifestyle, and 1 warehouse. The PRD's own formats are MBO and EBO (`PRD-ORG-010`).
- **EBO caution.** The PRD defines an EBO as a store billed on the brand's own software (PRD "Words used"). The data holds earlier-POS bills for the Allen Solly Deogarh store (`DEOT`), so at least that store bills on KDPS's POS. Whether the other single-brand stores do is not known.
- **Flags.** `CLOUD` is YES on 13 rows, NO on 3 (Spykar Deogarh, Peter England Kankarbagh, MBO Kankarbagh) and blank on Vaishnavi Banka. `RETAIL JI` is YES on 6 rows (Spykar Deogarh, Jockey Banka, MBO Gaya, Peter England Kankarbagh, MBO Kankarbagh, Warehouse Ranchi) and blank elsewhere. All 3 CLOUD = NO stores are RETAIL JI = YES.
- **Pattern that may explain the flags (guess).** Every raw earlier-POS sales export in the data (`DEO`, `SGMR`, `JSL`, `VAB`, `DMK`, `LBKR`, `DEOT`, `SAN`) comes from a store whose `RETAIL JI` is blank or that is not on the list. No raw export comes from a `RETAIL JI` = YES store; the only Gaya bills are in brand voucher files. So `RETAIL JI` may mean a second POS product. It is not confirmed.
- **No fields for the ERP.** The list has no store code, address, tax registration, store type, legal entity, manager, opening date or Site. `PRD-ORG-003` needs a Site code and a Store code; `PRD-ORG-008` needs aliases, classifications and dates.
- **Names the POS prints.** The earlier POS prints `Store Name` in some stock sheets: `Vaishnavi Banka`, `Vaishnavi Deoghar` and (in the daily sales report) `Vaishnavi Singh More`. These match rows 12, 8 and 6.

### 1.2 Places named in the data but not on the list

The names below appear in file names, remarks, tags or bill series. Each is a candidate Store, Site or business unit. Whether it is a separate Store is OPEN.

| Name or tag | Where it appears | What it probably is |
| --- | --- | --- |
| Vaishnavi Ratu (`Ratu`, `S-RATU`, `RATU`, `SR`, `VSN RATU`) | Invoice tracker `Stock Remarks` (6 invoices name "Vaishnavi Ratu" among the stores that received a split); invoice file names with `S-RATU` (7) and `RATU` (7); bank narrations `VSN RATU` (7 lines); Mufti `OFFER` sheet column `Store` = `Ratu` for offers from 14 Mar 2025; a debit-note file name `D D SALES KILLER DEBIT NOTE RATU STOCK (SMORE STORE.pdf` | A Vaishnavi store (guess). Possibly the same store as row 6, Singh More: Ratu Road is in the Ranchi area (general knowledge, not in the data), and the debit-note file name pairs "RATU" with "SMORE STORE". Not confirmed |
| Sanskar (`SAN`, `SANSKAR`, `SANSHKAR`, `SANSKAR RETAIL`) | Bills `26-27/SAN/..` in `SANSKAR LOUIS PHILIPPE SALE REPORT .xlsx` and in the Mufti June sales; invoice file names with `SANSKAR` or `SANSHKAR` (23) and `SAN` (30); debit-note file names "LP GR SANSKAR STORE"; `Brand` column value `SANSKAR` (27 lines in `Sales_Hazaribagh.xlsx`); `Supplier` column value `SANSKAR RETAIL` (90 rows in `SOH REPORT FORMAT.xlsx`, 20 brands in `SUPPLIER BRAND DETAILS.xlsx`) | Three uses of one word. As a store: a Louis Philippe selling store with its own bill series (confirmed by the sales file). As a brand and as a supplier: probably the Master Sheet brand and the store's trading name when it sends goods (guess). Not on the store list |
| Fashion Studio, Deoghar (`FS-DEO`, `FS`) | 54 invoice file names with `FS-DEO` and 11 with `FS` (all Aditya Birla invoices); a file named "fashion studio deoghar"; `SUPPLIER DATA BASE` row `FS-DEO`; the Master Sheet `BRAND` list has `FASHION STUDIO`, `FS-HYPHEN`, `FS-KILLER`, `FS-MUFTI`, `FS-FORT COLLINS`; 3 invoices dated 15 Apr 2026 numbered `FS-KDPS_78`, `FS-KDPS_85`, `FS-KDPS_104` | A store or business in Deoghar named Fashion Studio (guess). 54 file names carry `FS-DEO`, more than Dumka (25) or Bokaro (25). Not on the store list |
| Patna (`PATNA`, `PTN`, `KBAGH`, `KKBG`, `KANKARBAGH`, `PEK`) | 28 invoice file names with `PATNA`, 9 with `KANKARBAGH`; transfer documents `PTN/S-3` (2023); remarks "Deoghar Stock Transfer To Patna" (2 invoices); bank tags `KBAGH` and `PAT OFC` | Patna covers the two Kankarbagh stores (rows 15 and 16) and possibly an office. `PAT OFC` pays software and incentive items, so a Patna office is likely (guess) |
| TAS (HZB), TAS Dumka | Invoice tracker remarks: "TAS (HZB) Stock Transfer To JainSons (HZB)" (3), "TAS Dumka Stock Transfer To Lee Deoghar" (1) | A store or counter label inside Hazaribagh and Dumka. The remarks are on U.S. Polo invoices. Possibly "The Arvind Store" (guess). OPEN |
| `RKJ` | Transfer documents `25-26/RKJ/S-n` (Banka report 13 rows, Singh More ledger 28 rows) and `RKJ\S-1`. In the Singh More ledger the items are Jockey (28 rows) and Aristocrat (1): bras, panties, a lower and a trolley bag | A place that sends only Jockey goods (guess: a Jockey store or counter). Jockey Banka is `JBNK`, so this is another one |
| `ASVH` | Transfer documents `25-26/ASVH/S-n` (Dumka 25 rows, Banka 1, Allen Solly Deogarh 3) | A sender that held Allen Solly and Van Heusen goods (guess). Unknown |
| `KLG2` | `KLG2\S-n` (2023 to 2025) and `25-26/KLG2/S-20`, `S-21` (Jan 2026; sarees to Singh More) | A second Kahalgaon series (guess) |
| Allen Solly Gaya (`ASG`, `AS_GAYA`) | Remarks "109 Units Allen Solly Gaya"; 2 file names with `ASG` | Possibly the Gaya MBO selling Allen Solly (guess), or a separate Allen Solly store |
| `MBOB`, "KDPS Bokaro" | 2 file names with `MBOB`; remarks "KDPS Bokaro" | MBO Bokaro (guess) |
| USPA & Spykar | Remarks "76 Units USPA & SPYKAR" | A store that sells U.S. Polo and Spykar. Probably Spykar Deogarh (guess) |
| Offices and hubs | Bank tags `JH OFC` (7 lines), `PAT OFC` (2), `OFC` (9 in all), `HUB` (9), `ADMIN` (4), `BR` (3) | `JH` is probably Jharkhand (the accounting company file is named `KDPS LIFESTYLE PVT LTD JH 24-25`) and `PAT` Patna (guess). `HUB` and `BR` unknown |
| Towns that look like places KDPS pays people in | Bank tags `LATEHAR`, `GUMLA`, `GARHWA`, `GODDA`, `NAWADA`, `MOTIHARI`, `JAMTARA`, `GIRIDIH`, `CHAIBASA`, `SKELA`, `JAMUI`, `BARH`, `ARAH`, `SMSPUR`, `SMSPUE`, `JMLPUR`, `MOK`, `MADHU`, `MATWARI`, `RNAGAR`; also `RBZR`, `DBG`, `MBN`, `RPS`, `MED`, `TEAM` | Guesses: town abbreviations (and the last six unknown). None is on the store list. They appear on salary, incentive, commission, rent and petty-cash lines. OPEN |
| Godda | The `USPOLO INNER WEAR.csv` distributor's beat reads `DUMKA-DEOGHAR-GODDA` | A delivery route of a supplier, not a KDPS place (guess) |

### 1.3 Two states, and why it matters for GST registrations (OPEN)

- **Towns by state (general knowledge, not in the data).** Bihar: Bhagalpur, Kahalgaon, Banka, Gaya and Kankarbagh (Patna). Jharkhand: Sahibganj, Dumka, Bokaro, Hazaribagh, Deoghar and Ranchi. That makes 7 of the 17 rows Bihar (Bhagalpur, Kahelgaon, Banka twice, Gaya, Kankarbagh twice), 9 Jharkhand, and Singh More unknown (Jharkhand if it is in Ranchi).
- **What the files show.**
  - Every registration number tied to KDPS's own PAN (the PAN printed on the challan) that appears anywhere (the challan, the Peter England, Status Quo and Ambreli invoices, the debit-note workbook) carries state code 20, Jharkhand. 576 such numbers sit in the debit-note workbook. No KDPS registration with Bihar's code (10) appears.
  - Madura billed Banka and Bodh Gaya under their own `Sold-to` towns (section 3.7). The challan terms say disputes are subject to "Patna jurisdiction", while the challan's billing address is in Ranchi and its branch office in Deoghar.
  - The accounting ledger for a supplier is printed from a company file named `KDPS LIFESTYLE PVT LTD JH 24-25` (from 1 Apr 2024); `JH` may mean Jharkhand and imply a separate company file for Bihar (guess).
  - Bank narrations carry both `JH OFC` and `PAT OFC`.
  - Madura's extract names no `KDPS` customer in Patna, Bhagalpur or Kahalgaon. Where Kankarbagh's Madura goods are billed is not shown.
- **Why it matters.** A tax registration belongs to one legal entity and a business unit's registration must be in the State of its Site (`PRD-ORG-020`, `PRD-ORG-005`; design: [structure-and-masters.md](../design/masters/structure-and-masters.md) section 3.4). A transfer from the Ranchi warehouse to a Bihar store crosses states if the registrations differ, which changes the statutory documents (`PRD-TRF-023`, `POL-10.03`, `POL-10.08`). The bill-number format is also set per registration (`PRD-POS-020`, `POL-10.07`).
- **OPEN.** How many GST registrations KDPS holds, in which states, and which store uses which. Owner: Accounts and the CA (`POL-10.01`, `POL-10.06`). Blocks stage 2 (goods-in uses the mapping, `POL-10.08`).

### 1.4 Legal entities and trade names seen

| Name | Where it appears | Reading |
| --- | --- | --- |
| KDPS Lifestyle Pvt. Ltd. | Everywhere. Spellings seen: `KDPS LIFESTYLE PRIVATE LIMITED`, `KDPS LIFESTYLE PVT LTD`, `KDPS LIFESTYLE PVT. LTD`, `KDPS. LIFESTYLE. PVT. LTD`, `KDPS LIFESTYLEPRIVATE LIMITED` (Madura, Dumka and Bokaro), `KDPS LIFE STYLE PVT. LTD.`, `KDPS LIFESTYLE P LTD`, `KDPS LIFE` (the Blackberry dealer name in `KDPS LIFE.xlsx`) | The first customer's legal entity (confirmed by the PRD). Central Plaza, Deoghar is the address on the accounting company file and on the Blackberry reports. The challan prints a "Billing address" in Upper Bazar, Ranchi and names Central Plaza, Deoghar as its branch office |
| Om Ganpati Enterprises, `OM GANPATI (DMK)` | `KDPS DEBIT & CREDIT NOTE DETAILS.xlsx`: `DATA BASE` column `FRENCHEEZI` lists two names, KDPS Lifestyle Pvt Ltd and Om Ganpati Enterprises; in `CREDIT NOTE DATA SHEET` 10 of 11 claims are KDPS and 1 is Om Ganpati (brand SMAG, Nov 2025); a remark says a credit note "was received in KDPS ledger, not in Om Ganpati". `DEAL SS26 2970.xlsx`: `Party Name` is Om Ganpati Enterprises, narration "DEAL SS26 (JAINSONS LIFESTYLE)". Bank narrations pay it as `VSN WH STOCK` (3 lines). Invoice file names `OM GANPATI ENTERPRISES_WS2637_LDEO` and `_WS2638_SBG`. The item `Supplier` column holds `OM GANPATI (DMK)`: 942 rows in the Vaishnavi Deoghar SOH, 329 in `SOH REPORT FORMAT.xlsx`, 25 in the Hazaribagh stock file. `SUPPLIER BRAND DETAILS.xlsx` maps 28 brands to `OM GANPATI (DMK)` (Lee, Jockey, U.S. Polo, Skybags, Adidas, Reebok, Puma and others) and flags it as delivering barcoded goods | A second business that is both a supplier of brand goods and, per the `FRENCHEEZI` list, one of two "franchisee" entities. `(DMK)` points to Dumka. Whether it is a franchise partner, a related firm or a second KDPS legal entity is OPEN. Under the PRD, ownership change between entities uses the commercial process (`PRD-FRN-005`, `PRD-FRN-006`) |
| Jainsons Lifestyle, "Jain Sons", "JainSons (HZB)" | Store list row 7; challan consignee "KDPS Lifestyle Private Limited, C/O Jain Sons, Hazaribagh"; Ambreli invoice to "KDPS LIFESTYLE PRIVATE LIMITED (C/O JAINSONS LIFESTYLE)"; `DEAL SS26 2970.xlsx` narration; bank tags `JSONS HZB SAL`, `JSONS HZB RENT`; carry-bag brand `JAINSONS` (31,012 bags in the `soh30626.xlsx` stock) | The trade name of the Hazaribagh store. The goods are invoiced to KDPS or Om Ganpati "care of" it, so the legal entity behind it is OPEN (section 1.5) |
| D D Developers Pvt Ltd - JFH | `Q&A-req-recieved/PT FILE/JOCKEY.xlsx` only: invoice `JCRS26/10` dated 6 Apr 2026, 6 lines, addressed to "BR-D D DEVELOPERS PVT LID - JFH". KDPS is not named | A party that Jockey invoiced for goods that sit in KDPS's PT file folder (guess: a group company or franchise holder for a Jockey store). OPEN |
| Sanskar Retail | `Supplier` column (section 1.2) | A trading name used as a supplier name for transferred goods (guess) |
| "KDPS Lifestyle Pvt Ltd (Deoghar)" | `Supplier` column on 4,867 rows of the Vaishnavi Deoghar SOH, 1,850 of `soh30626.xlsx`, 876 of `SOH REPORT FORMAT.xlsx`, 656 of `SOH_Hazaribagh.xlsx` | The head-office buying unit in Deoghar, named as the supplier of goods it passes to stores (guess). In this POS the supplier field can hold a KDPS unit. Same for `OM GANPATI (DMK)` and `SANSKAR RETAIL` |
| Vaishnavi | Store names, the `VAISHNAVI` carry-bag brand (8,226 free bags in one financial year at Vaishnavi Deoghar), bank prefix `VSN`, file label `VSN DEO` | KDPS's family-store trading name |

### 1.5 JSL = Jainsons Lifestyle = Hazaribagh (evidence)

- `LIST OF ALL STORES.xlsx` row 7 reads `JAINSONS-LIFESTYLE | HAZARIBAGH`. `JSL` is the three letters of its name.
- The bill series `JSL` runs in every Hazaribagh file: `25-26/JSL/1` (4 Sep 2025) to `/4611` (31 Mar 2026) and `26-27/JSL/1` to `/2484` (24 Jul 2026). The files in `store-analysis/hazaribagh/` and `store-analysis/jsl/` overlap line for line. April's Hazaribagh Louis Philippe file (`LP sales & soh HAZARIBAGH.xlsx`) and its voucher (`SALES_VOUCHERS_LP_APRIL2026_HZB.xlsx`) use `JSL` bills.
- Ship-to hints from vendors and KDPS: `-(HAZARIBAGH)` on Mufti, Beevee and Go Colors invoices with dealer site `KDPS-HZB-MF`, `-BV` and `-GC`; the Ambreli and Deal invoices name Jainsons Lifestyle; the challan consignee is c/o Jain Sons, Hazaribagh; across the `Invoice Soft Copy` and `PT File Excel Sheet` columns, 190 file names carry the tag `JSL`, 100 carry `HZB` and 28 carry `J-HZB`.
- The analysts' configs (`store-analysis/hazaribagh/dashboard-config.json`, `store-analysis/jsl/dashboard-config.json`) name the same store twice: `HZB` ("Hazaribagh Store", region "Jharkhand", stock as on 24 Jul 2026) and `JSL` ("JSL Store", region "Bihar / Jharkhand", 30 Jun 2026). The names and regions are analyst settings, not KDPS decisions. Only the cut-off date differs.
- Not yet explained: the invoice tracker has both "TAS (HZB)" and "JainSons (HZB)" (section 1.2), and an invoice comment reads "goods returned from Sainsons (HZB)", a typo for Jainsons.

## 2. Bill numbers

### 2.1 The format

- **Format.** `<FY>/<store code>/<serial>`, for example `26-27/DEO/919`. The FY part is the two-digit start and end year (`25-26`, `26-27`). The store code is 3 to 6 capital letters. The serial is a whole number with no padding. Same format in every earlier-POS sales export.
- **Reset.** Each series restarts at 1 on the first sale of the financial year. `25-26/DEO/1` is dated 3 Apr 2025 and `26-27/DEO/1` is dated 1 Apr 2026. The Hazaribagh series `JSL` starts on 4 Sep 2025, the first date in its files.
- **Per store, not per till.** The data shows one series per store code. Whether a store has one billing device or several is not shown. The ERP gives each billing device its own series per tax registration and financial year (`PRD-POS-020`, `PRD-OFF-002`, `DEC-005`; design: [numbering-and-audit.md](../design/platform/numbering-and-audit.md) section 3.4).
- **Time.** Sales files carry a date without a time of day.
- **Financial year.** All series restart on 1 April, which fits an April to March year. The ERP's year start is an Organisation setting with no default (design: [numbering-and-audit.md](../design/platform/numbering-and-audit.md) section 3.3). Owner: the CA.

### 2.2 The series seen in sales data

The bill counts are of the bills the files hold. The brand-filtered files (Louis Philippe, Blackberry, Mufti) hold only some of a store's bills, so the highest serial is the better sign of volume.

| Prefix | Store (reading) | FY and serials seen | Dates | Bills in the files | Files |
| --- | --- | --- | --- | --- | --- |
| `DEO` | Vaishnavi Deogarh (confirmed: the sheet `STOCK REPORT` names `Vaishnavi Deoghar`) | `25-26`: 1 to 5,383, no gaps. `26-27`: 1 to 919, no gaps | 3 Apr 2025 to 31 Mar 2026; 1 Apr to 13 Jun 2026 | 5,383; 919 | `store-analysis/VAISHNAVI/SALE REPORT 1 APRIL 25 TO 31 MARCH 26.xlsx`, `SALE REPORT 1st Apr 26 TO 13th Jun 26.xlsx`; the April `VAS-DEO` Louis Philippe file holds 57 of the 919 |
| `JSL` | Jainsons Lifestyle, Hazaribagh (section 1.5) | `25-26`: 1 to 4,611. `26-27`: 1 to 2,484 (2,483 bills in the 24 Jul file: serial 2014 is in the 30 Jun export and not in the 24 Jul one) | 4 Sep 2025 to 31 Mar 2026; 1 Apr to 24 Jul 2026 | 4,611; 2,483 | `Sales_Hazaribagh.xlsx`, `fy 25-26 sales.xlsx`, `fy 26-27 sales.xlsx`, `june sales report.xlsx` (595 bills, 1,418 to 2,012) |
| `SGMR` | Vaishnavi Singh More (confirmed: the DSR header names it) | `26-27`: 1 to 1,166 in the DSR (serial 343 missing); 1,263 to 1,283 in the sample | 1 Apr to 5 Jun 2026; 12 to 13 Jun 2026 | 1,165; 21 | `bank-statement/3. Vaishnavi Singh More DSR(Fy-26-27).xlsx`, `SALE REPORT FORMAT.xlsx` |
| `VAB` | Vaishnavi Banka (confirmed: the file is the Banka report) | `26-27`: 1 to 566, no gaps | 1 to 30 Apr 2026 | 566 | `APR SALE & STOCK REPORT BANKA.xlsx` |
| `SAN` | Sanskar (section 1.2) | `26-27`: 34 to 1,238 in April; 2,680 to 2,963 in June | 2 to 28 Apr; 9 to 17 Jun 2026 | 30; 5 | `SANSKAR LOUIS PHILIPPE SALE REPORT .xlsx`, Mufti June |
| `DEOT` | Allen Solly Deogarh (guess; the workbook is `AS-DEO`) | `26-27`: 6 to 187. Older bills are cited as `25-26/DEOT/1181` and `25-26/DEOT/1411` in exchange references | 2 to 30 Apr 2026 | 47 | `AS  & LP2  APR 26 SALE  AND SOH AS-DEO.xlsx` |
| `DMK` | MBO Dumka (confirmed: the file is the Dumka report) | `26-27`: 4 to 74 | 2 to 30 Apr 2026 | 43 | `LP_APRIL SALE REPOT_DUMKA.xlsx` |
| `LBKR` | MBO Bokaro (confirmed: the file is the Bokaro report). The letters `LBKR` may be "L" plus "BKR" (guess) | `26-27`: 3 to 149 | 1 to 30 Apr 2026 | 54 | `LP Sale with Closing SOH report April 2026_BOKARO.xlsx` |
| `GAYA` | MBO Gaya | `26-27`: 217 to 520 (Blackberry May), 433 to 558 (Mufti May), 561 to 687 (Blackberry June), 591 (Mufti June) | 20 Apr to 18 Jun 2026 | 113 | Blackberry and Mufti workbooks only |
| `LEEDEO` | Lee Deogarh | `26-27`: 244 to 544 | 2 May to 18 Jun 2026 | 52 | Mufti workbooks only |
| `VAS` | Unknown (section 3.1) | `26-27`: 214 to 300 | 5 to 12 May 2026 | 4 | `MUFTI_SALES_STOCK_DETAILS_MAY2026.xlsx` only |

### 2.3 Quirks in the bill numbers

- `Manual Bill No.` in the Singh More DSR is empty on all 4,780 sale lines. The column holds nothing. The bill number sits in `Online Bill No.`.
- The bill number is also the key to returns: a return is a negative-quantity line inside a bill, with no link to the original bill (see [pos-exports.md](pos-exports.md)).
- A bill number appears in Tally-style voucher files as `Vch/Bill No`. The same text.

## 3. Codes seen

### 3.1 Bill-series prefixes (sales)

Confirmed means the file names the store beside the bill.

| Code | Meaning | Status | Seen in |
| --- | --- | --- | --- |
| `DEO` | Vaishnavi Deogarh | Confirmed | Vaishnavi Deoghar sales files; the April `VAS-DEO` file |
| `SGMR` | Vaishnavi Singh More | Confirmed | The DSR and `SALE REPORT FORMAT.xlsx`. The letters are probably "SinGh MoR" (guess) |
| `JSL` | Jainsons Lifestyle, Hazaribagh | Confirmed (section 1.5) | Hazaribagh and Jainsons files; Blackberry and Mufti workbooks |
| `VAB` | Vaishnavi Banka | Confirmed | Banka report |
| `DMK` | MBO Dumka | Confirmed | Dumka report |
| `LBKR` | MBO Bokaro | Confirmed | Bokaro report |
| `DEOT` | Allen Solly Deogarh | (guess) | The `AS-DEO` workbook (`AS SALE `, `LP2 SALE `). The extra letter T is unexplained |
| `LEEDEO` | Lee Deogarh | Confirmed by the name and the `LEE DEO` SOH tag | Mufti workbooks |
| `GAYA` | MBO Gaya | Confirmed by the town | Blackberry and Mufti workbooks |
| `SAN` | Sanskar store | (guess; section 1.2) | Louis Philippe April file, Mufti June |
| `VAS` | A Vaishnavi series other than `DEO` (guess) | Unknown | Mufti May (4 bills). It is the same word as the transfer sender `VAS` and the label `VAS-DEO`. Its serials (214 on 5 May, 300 on 12 May) are far below `DEO`'s on the same days (473 and 564), so it is a different series |

### 3.2 Transfer and inward-document prefixes

These codes sit in the `Bill no` or `Invoice No` column of the inward ledgers (`Stock Inward Details` in the Singh More DSR, `STOCK REPORT` in the Banka workbook, `AS SOH`, `LP2 SOH`, and the three Dumka SOH sheets). The number is the sending location's own transfer document. The general shape is `<FY>/<sender code>/S-<n>`, for example `26-27/WH/S-175`. The letter S probably stands for stock transfer (guess). Counts, dates and the older formats are in [transfers.md](transfers.md) section 3.2.

| Code | Reading | Status |
| --- | --- | --- |
| `WH` | The Ranchi warehouse. Sends the bulk of all stock | Confirmed: store list row 17; invoice remarks "Product Received at Ranchi(WH)"; the tag `WH` in SOH; debit notes `25-26/WH/PR-n` |
| `DEO` | Vaishnavi Deoghar sending stock | (guess; same code as its bills) |
| `VAS` | A Vaishnavi sender with its own numbering (20 documents to Singh More, 1 to Banka) | (guess) |
| `VAB` | Vaishnavi Banka | Confirmed (same code as its bills) |
| `DMK` | MBO Dumka | Confirmed |
| `BGP` | Vaishnavi Bhagalpur | (guess: the first letters of the town) |
| `KLG`, `KLG2` | Vaishnavi Kahalgaon; `KLG2` a second series (guess) | (guess) |
| `SBJ` | MBO Sahebganj | (guess) |
| `PTN` | Patna | (guess) |
| `LEEDEO` | Lee Deogarh | Confirmed |
| `JBNK` | Jockey Banka | (guess) |
| `SGMR` | Vaishnavi Singh More | Confirmed |
| `JSL` | Jainsons Hazaribagh | Confirmed |
| `DEOT` | Allen Solly Deogarh | (guess) |
| `LBKR` | MBO Bokaro | Confirmed |
| `GAYA` | MBO Gaya | Confirmed |
| `RKJ` | Unknown; sends only Jockey goods | OPEN |
| `ASVH` | Unknown; Allen Solly and Van Heusen goods | OPEN |
| `Opening Stock` | `AS SOH ` (14 rows, dated 9 Aug 2024) | Not a sender. The opening balance when this POS started at Allen Solly Deogarh (guess) |
| `Audit Diff`, `Audit Differance` | Singh More ledger (77 rows, 136 pieces, 7 Apr 2025 to 27 Jan 2026), Banka report (78 rows), `AS SOH ` (23 rows, 31 Mar 2025) | Not a sender. Pieces found at an audit and added as inward (guess) |
| `Scan Stock` | Banka report (105 rows) | Not a sender. Pieces added by scanning (guess) |
| `Ex Bill No-n`, `(EX BILL25-26/DEOT/1411)` | `AS SOH ` (3 rows) | A reference to the bill an exchange came from (guess) |
| `MSF…` | Not a KDPS code. Aditya Birla invoice numbers that arrived straight at Allen Solly Deogarh (15 documents, 152 rows, 207 pieces) | Confirmed by the prefix: 630 rows of `INVOICE DETAILS.` carry the same prefix with Aditya Birla as supplier |

### 3.3 Other KDPS document series

| Series | Where seen | Reading |
| --- | --- | --- |
| `DCJ/26-27/0073` | The delivery challan photographed on 23 Jun 2026 (`transfer-data/`) | KDPS's delivery challan: `DC NO` (confirmed by the photograph). `DCJ` is probably "delivery challan" plus a letter, perhaps `J` for Jharkhand; the debit-note format `DN/J/26-27/022` also carries a `J` (guess). Challan 73 is dated 23 Jun 2026. The warehouse's transfer document `26-27/WH/S-689` is dated 2 Jun 2026, so challans are not issued for every transfer document (guess) |
| `25-26/WH/PR-n`, `26-27/WH/PR-n` | `KDPS DEBIT & CREDIT NOTE DETAILS.xlsx`: 369 debit notes in `2025-26-SUMMARY` (from 4 Apr 2025), 104 in `2026-27-SUMMARY` (from 4 Apr 2026) | The warehouse's debit note, `PR` = purchase return (guess; the sheet's `DN TYPE` column lists goods return, damage and short claims). Zero-padding varies: `PR-1`, `PR-09`, `PR-001` |
| `KDPS/26-27/0020`, `0021`, `0023`; `DN/J/26-27/022` | Four rows of `KDPS CN & DN SHEET` (April 2026) | A different debit-note format in FY 26-27 (guess: a new numbering from the accounting software). Which one is current is OPEN |
| `28-26/WH/PR-197` | One credit-note cell | A typo for `25-26/WH/PR-197` |
| `25-26/nnnn`, `26-27/nnnn` voucher numbers | `Prem Clothing Ledger FY- 2025-26.pdf`: purchase vouchers `25-26/0114` to `25-26/0556`; payment vouchers 458, 652, 653, 1002 with no year | KDPS's own accounting voucher numbers: the ledger names them `Vch No.` and `Vch Type` (confirmed); Tally-style and a Jharkhand company file (guess) |
| `26IH-<digits>-nnn` | 14 file names in `INVOICE DETAILS.` such as `KDPS (26IH-<digits>-011) MBO BOKARO.pdf`, `... VAISHNAVI DEOGHAR`, `... MBO SAHEBGANJ`, `... JOCKEY BANKA`, `... VAISHNAVI SINGHMOR`, `... FASHION STUDIO`; their `Supplier Name` shows KDPS | Probably invoices of the `IH` series that C2D Ventures and Sushila Enterprises use for Van Heusen goods (guess), each named for the store it went to. The supplier cell was filled with KDPS. OPEN |

### 3.4 Dealer site tags and SOH location tags

| Tag | Where seen | Reading |
| --- | --- | --- |
| `KDPS-HZB-MF`, `KDPS-HZB-BV`, `KDPS-HZB-GC` | Column `REF SITE` of `MUFTI.xlsx`, `BEEVEE 390.xlsx`, `go colours 000023.xlsx` (one value per file, every row) | The brand's code for the KDPS ship-to: `KDPS`, store (`HZB`), brand (`MF` Mufti, `BV` Beevee, `GC` Go Colors). Confirmed by the vendor (`OWNER SITE`) and the buyer text `-(HAZARIBAGH)` in the same rows |
| `KDPS-DEGR-MF` | `Style Code` on 56 Mufti SOH rows (68 pieces: JSL 42 rows, LEE DEO 8, GAYA 2, WH 4) and 6 (May) or 5 (June) Mufti sales lines on JSL, LEEDEO and SAN bills | By the pattern above, the Mufti dealer site for Deogarh (`DEGR` = Deogarh, `MF` = Mufti) (guess). It is a placeholder used where a style code is missing, not a style. It is not tied to the Deogarh store |
| `KDPS Lifestyle (Ranchi)` | `REFERENCE_SITE` in `HYPHEN.xlsx` | Hyphen's name for the Ranchi ship-to |
| `LEE DEO`, `JSL`, `GAYA`, `WH` | Column K (no header) in the Mufti SOH sheets: 209, 389, 117 and 83 rows | Stock location, added by hand when the brand report is built. Confirmed by the values |
| `JSL`, `VAS-DEO`, `GAYA`, `WH` | Column K in the Blackberry May SOH: 55, 12, 826 and 18 rows (`GAYA` holds 1,252 of 1,363 pieces) | Same. `VAS-DEO` is Vaishnavi Deoghar (confirmed by the file label) |
| `Vaishnavi Banka`, `Vaishnavi Deoghar` | Column `Store Name` in the Banka `STOCK REPORT` and the `VAS-DEO` `STOCK REPORT` | Printed by the POS. Confirmed |
| `Vaishnavi Singh More` | Column `Store Name` in the DSR `Sale` sheet (all 4,780 lines) | Confirmed |

### 3.5 Store tags in invoice file names (`INVOICE DETAILS.`)

The columns `Invoice Soft Copy` and `PT File Excel Sheet` hold 2,952 file names, most with a destination tag, for example `ADITYA BIRLA_MSF2252000030240_AK_FS-DEO_25-26.pdf` (supplier, invoice number, brand code, destination, year). Counts below are of the 1,478 names in `Invoice Soft Copy` that contain the tag as a separate word.

| Tag | Names | Reading |
| --- | --- | --- |
| `JSL` | 102 | Jainsons Hazaribagh (confirmed) |
| `GAYA`, `GYA` | 95, 1 | MBO Gaya (confirmed by the town) |
| `HZB`, `J-HZB` | 74, 28 | Hazaribagh (confirmed by the town); `J-` may stand for Jainsons (guess) |
| `FS-DEO`, `FS` | 54, 11 | Fashion Studio, Deoghar (guess) |
| `VAS-DEO`, `V-DEO`, `VASDEO`, `VDEO`, `DEO` | 35, 17, 2, 1, 19 | Vaishnavi Deoghar (`VSN DEO` in a file name confirms it) |
| `WH` | 34 | Ranchi warehouse (confirmed: store list row 17) |
| `SBJ`, `SBG` | 33, 1 | MBO Sahebganj (guess: abbreviations of the town) |
| `SAN`, `SANSKAR`, `SANSHKAR` | 30, 15, 8 | Sanskar (confirmed as a name in the files; what it is, a store, is a guess; section 1.2) |
| `PATNA`, `KANKARBAGH`, `PEK`, `KKBG` | 28, 9, 1, 1 | Patna and Kankarbagh stores. `PEK` is probably Peter England Kankarbagh (guess) |
| `DUMKA`, `DMK` | 25, 7 | MBO Dumka (confirmed by the town) |
| `BOKARO`, `BOK`, `MBOB` | 25, 1, 2 | MBO Bokaro (confirmed by the town; `MBOB` is a guess) |
| `SGMR` | 24 (43 across both columns, 32 of those Aditya Birla invoices) | Vaishnavi Singh More (confirmed: the same code as its bills) |
| `S-RATU`, `RATU` | 7, 7 | Ratu (guess) |
| `SR` | 7 | Probably Ratu or Singh More (guess); all Aditya Birla invoices |
| `AS-DEO`, `LEEDEO`, `LDEO`, `LEE` | 15, 6, 2, 1 | Allen Solly Deogarh; Lee Deogarh (confirmed by the names) |
| `BANKA`, `BGP` | 11, 4 | Vaishnavi Banka (confirmed by the town); Bhagalpur (guess: first letters) |
| `ASG`, `KDPS` | 2, 15 | Allen Solly Gaya (guess). `KDPS` appears in the names of the 20 rows whose `Supplier Name` is KDPS (section 3.3) |
| Brand codes before the tag | `AS`, `AK`, `AH`, `PE`, `LP`, `LR`, `VH`, `VW`, `RE` | Madura brand divisions (section 3.7) |
| Piece counts | `_10PCS`, `_14PCS`, `_79PCS` and similar | The number of pieces on that part-invoice |

### 3.6 Tags in bank narrations (`bank-statement/Bank statement.xlsx`)

KDPS types a short narration when it pays by NEFT. The pattern is `<format or brand> <place> <purpose> [<month> <year>]`. 229 narrations parse this way (the sheet has about 376 lines). The names of the people paid are not copied. The PRD wants such references kept (`PRD-CSH-009`).

| Part | Values seen (count) | Reading |
| --- | --- | --- |
| Format or brand | `VSN` 80, `PE` 34, `COBB` 25, `AD` 18, `KLR` 16, `JSONS` 16, `SPY` 8, `JH` 7, `LP` 6, `VH` 6, `MBO` 4, `LEVIS` 3, `PAT` 2, `JPL` 2, `LEE` 1, `AS` 1 | `VSN` is Vaishnavi (confirmed by the file name `VSN DEO ...`). `JSONS` is Jainsons. `JH` and `PAT` are Jharkhand and Patna offices (guess). `PE`, `LP`, `VH`, `AS`, `LEVIS`, `SPY`, `LEE` are brands or the brand's stores (guess). `COBB`, `AD`, `KLR`, `JPL` are unknown (`KLR` may be Killer; guess) |
| Place | `WH` 41, `HZB` 28, `DEO` 16, `SMORE` 14, `OFC` 9, `HUB` 9, `BOK` 9, `DMK` 9, `KLG` 8, `SBG` 8, `LATEHAR` 7, `RATU` 7, `BANKA` 7, `GUMLA` 5, and 1 to 4 each for `RBZR`, `KBAGH`, `ADMIN`, `GARHWA`, `DBG`, `BR`, `BGP`, `NAWADA`, `GODDA`, `GAYA` and 20 more (section 1.2) | Store codes `WH`, `HZB`, `DEO`, `SMORE` (Singh More), `BOK`, `DMK`, `KLG`, `SBG`, `RATU`, `BANKA`, `BGP`, `GAYA`, `KBAGH` and the towns in section 1.2 |
| Purpose | `SAL` 94, `STOCK` 39, `PETTY CASH` 20, `INCENTIVE` 18, `TOUR TRAVEL` 12, `RENT` 12, `ADV SAL` 6, `TAILORING MTRL` 4, `COMM` 3, `TAILORING` 3, `HVAC` 3 and 13 others | Salary, warehouse stock, petty cash, incentive, travel, rent, advance salary, tailoring material, commission, air-conditioning |

Two readings worth noting: `VSN WH STOCK` (35 lines) is the payment tag for warehouse stock, and the same tag is used for suppliers as different as D Apparel, Tayal Garments and Om Ganpati Enterprises.

### 3.7 Madura (Aditya Birla) codes

Source: `Q&A-req-recieved/PT FILE/Madura Fashion Brand AS - VH - LP.xlsb`, a billing extract for all Madura customers in April 2026 (113,983 rows, 176 `Sold-to` parties). 5,923 rows, 219 bill documents and 8,385 pieces are KDPS's.

**The 9 KDPS `Sold-to` codes.** There are 9 codes, one per Madura ship-to account. Each is a 6-digit customer code at Madura; the codes are not copied. The name field reads `KDPS LIFESTYLE PRIVATE LIMITED` (`KDPS LIFESTYLEPRIVATE LIMITED` for Dumka and Bokaro). The group `CGrp` is `KM`, `SGrp` 142 and `Account group` 1 on every row.

| Town (`City`) | Rows | Bill documents | Pieces | Billing dates | Brand codes (`Dv`) |
| --- | --- | --- | --- | --- | --- |
| Deogarh | 2,146 | 64 | 3,012 | 6 to 30 Apr 2026 | AS, AK, AH, AL, VW, VH, VS, LR, LP, LY, VF, VD, VX |
| Hazaribag | 1,247 | 55 | 1,571 | 8 to 30 Apr | AH, VW, AK, LR, LP, LY, VD, AS, VH, VS, VX, AL |
| BANKA | 738 | 7 | 997 | 25 to 30 Apr | VW, VS, VH, VD, VF, VX |
| BODH GAYA | 608 | 21 | 951 | 8 to 30 Apr | AL, AS, AT |
| SAHIBGANJ | 348 | 18 | 523 | 8 to 30 Apr | AL, AS, VH, VS, VD, VF, VX |
| RANCHI (account 1) | 146 | 9 | 207 | 8 to 30 Apr | AS, AL |
| RANCHI (account 2) | 341 | 17 | 524 | 8 to 30 Apr | LY, LR, LP, AS |
| Dumka | 126 | 17 | 229 | 8 to 30 Apr | LR, AL, AS, LP |
| Bokaro | 223 | 11 | 371 | 9 to 30 Apr | LY, LR, LP |

- **Not in the extract.** No `KDPS` name appears for Patna, Kankarbagh, Bhagalpur, Kahalgaon, Singh More or Sanskar. Where those stores' Madura goods are billed is not shown (OPEN).
- **Two Ranchi accounts.** The warehouse and one more place (guess). Not named.
- **Bill types (`BillT`).** For KDPS rows: `ZINV` 5,439 rows, `ZREU` 445, `ZPOR` 39. The meaning is not given. `ZINV` is probably an invoice, and `ZREU` rows have positive quantity so they may be returns (guess).
- **Peter England file.** `Peter England.CSV` (28 rows, 5 invoices dated 25 to 30 May 2026) carries a Deogarh customer code that differs from the Madura extract's Deogarh code in one digit. A typo in one of them (guess).
- **Brand division codes (`Dv`).** 14 of the extract's 20 codes occur on KDPS rows (rows and pieces): `AS` 1,354 and 2,127; `AK` 947 and 964; `VW` 528 and 689; `VH` 462 and 618; `AL` 420 and 666; `LR` 415 and 633; `AH` 366 and 461; `VS` 365 and 483; `LP` 365 and 695; `LY` 289 and 428; `VD` 157 and 211; `VX` 126 and 187; `VF` 109 and 187; `AT` 20 and 30. The Louis Philippe emails list the sub-brands `LP`, `LY`, `LA`, `LX`, `LR` and the Van Heusen emails use `VS`, `VD`, `VX`, `VF`, `VH`, `VW`, so those two families are confirmed. `AS` is Allen Solly. `AK`, `AH`, `AL` and `AT` are probably Allen Solly lines (`AK` has kids' shirts; `AL` is mostly jeans) (guess).

### 3.8 Customer and distributor codes at other brands

| Brand | What the file holds |
| --- | --- |
| Jockey | 5 files `JOCKEY 852.xls`, `JOCKEY PARAS.xls`, `JOCKEY-NARAYANI.xls`, `JOCKEY-NARVADA.xls`, `JOCKEY_DD SALES.xls`. They carry 2 distinct customer codes (prefix `JH-`): one only in `JOCKEY 852.xls` (3 Mar 2026), one in the other four (18 Apr to 1 May 2026). Meaning unknown (two Jockey accounts, guess). The `Bill Prefix` per file is the distributor's series: `SCRS25`, `PECRS26`, `P2CRS26`, `EDCRS26`, `DD/JBN26`. `DD/JBN26` may be D D Sales for Jockey Banka (guess) |
| U.S. Polo innerwear | `USPOLO INNER WEAR.csv`: buyer "KDPS LIFESTYLE P LTD", route `DUMKA-DEOGHAR-GODDA`, `DUMKA` |
| Killer | `KILLER JUNIOR.xlsx`: buyer text "KDPS LIFESTYLE PVT LTD-JNR -DUMKA" |
| Status Quo | `STATUS QUO.xlsx`: buyer text "KDPS LIFESTYLE PRIVATE LIMITED-DEO" |
| Allen Solly innerwear | `AS INNERWEAR.csv`: invoice `ADD-289` from a Ranchi distributor to "M/s KDPS LIFESTYLE PVT LTD, HAZARIBAGH" |

### 3.9 Supplier-side invoice prefixes

These are the suppliers' numbers, not KDPS codes. They are listed so an import does not mistake them for KDPS series. The numbers come from `INVOICE DETAILS.` (counts of rows) and the PT files.

| Prefix | Supplier (as in the file) | Rows or files |
| --- | --- | --- |
| `MSF…` | Aditya Birla (Madura) | 630 rows |
| `S/25-26/n`, `S/n` | Vishal Marketing & Co. | 44 |
| `J-…` | Jain Adishwar Hosiery Works | 43 |
| `DA/26-27/nnnn`, `DA-25-26-nnnn` | D Apparel | 32 |
| `25-26/BLRS/n`, `25-26/JPS/n`, `25-26/MUMS/n` | Saraogi Super Sales (BLR, JP, MUM are probably branch cities; guess). Credit notes use `BLRSR` | 20, 12, 9 |
| `GSTN…`, `JKL…` | D D Sales Co (Killer) | 16, 2 |
| `SMFS25-26-nnnnnn` | Shring Apparels (Mufti) | 13 |
| `IH…` | Sushila Enterprises, C2D Ventures LLP | 12 |
| `SCRS…`, `EDCRS…`, `MDCRS…`, `SOCCRS…`, `P…` | Jockey distributors | 5, 3, 5, 3, 7 |
| `SBVS25-26-nnnnnn`, `2GCS25-26-nnnnnn`, `HPNS25-26-nnnnnn` | Beevee, Go Colors, Hyphen (PT files) | 1 file each |
| `JCRS26/10` | A Jockey invoice to D D Developers (section 1.4) | 1 file |

## 4. Other abbreviations that look like codes

| Word | Where | Reading |
| --- | --- | --- |
| `CLOUD`, `RETAIL JI` | Store list | Not defined. See section 1.1 |
| `TEN`, "TEN software" | `INVOICE DETAILS.` (`TEN Uploaded Date`, status "Uploaded In TEN"); MOM item 8 | The earlier POS (guess: the ERP team's notes call the POS "Ten Software"; the notes are the ERP team's words, not KDPS's) |
| `VENUE`, `DB` | `Booking Status` "BOOKED IN VENUE", `BOOKED IN "DB"` | Unknown systems or lists (OPEN) |
| `AMM`, `NOD`, `HOAS`, `HOVH`, `ATV`, `EOSS`, `GWP`, `FRESH` | Brand offer files | Offer vocabulary. See [offers-and-brand-reports.md](offers-and-brand-reports.md) |
| `NSV` | DSR column `NSV`; a note "NSV - 24lakh 1% 28lakh 2% 34lakh 3%" beside the Linen Club offers | Net sale value in the DSR (confirmed: it equals cash plus UPI plus card plus dues sale). The note reads like a staff incentive slab (guess) |
| `Wizapp Code`, `Dealer Name` | `KDPS LIFE.xlsx` | Blackberrys' dealer code and dealer name for KDPS (guess) |
| `BANJARAN` | `Brand` column (226 rows of `SOH REPORT FORMAT.xlsx`, 251 of `SOH_Hazaribagh.xlsx`, 56 sales lines in `Sales_Hazaribagh.xlsx`); the PT file `BANJARAN.xlsx` from Vinayak Emporium; the Master Sheet `BRAND` list; the photographed report list ("Banjaran 2 to 2") | A brand, not a place (confirmed by the `Brand` column) |
| `FRENCHEEZI` | Debit-note workbook | The word for "franchisee"; holds legal entity names (section 1.4) |
| `Swip`, `Satt`, `MID`, `Tid` | DSR | Card swipe machine; settlement; merchant and terminal IDs (values not copied) |

## 5. How this lines up with the PRD

- The PRD wants a permanent Site code and a separate Store code (`PRD-ORG-003`), unique business codes (`PRD-MOD-008`), and aliases and history for names (`PRD-ORG-008`). The data shows several names and codes for one place (`DEO`, `VAS-DEO`, `V-DEO`, `VSN DEO`; `JSL`, `HZB`, `J-HZB`, `JSONS`). The master should hold the aliases and the file-name tags (`PRD-IMP-003`).
- Several Stores trade in one town (4 in Deoghar, 2 in Kankarbagh and 2 in Banka on the list) and Deoghar's Madura goods are billed on one `Sold-to`. The PRD allows several Stores at one Site and a brand counter as a business unit (`PRD-ORG-021`, `PRD-ORG-004`). Which are separate Sites is OPEN.
- A Store's legal entity, tax registration and book are mapped explicitly, never inferred from the Site (`PRD-ORG-005`, `POL-10.01`).
- Earlier-POS imports during the side-by-side test must map these bill series, store tags and `Store Name` values to Stores (`PRD-LIF-013`, `PRD-LIF-014`). A series is never continued after a switch (`PRD-LIF-015`).
- The ERP's bill series is per billing device, registration and financial year (`PRD-POS-020`). The earlier POS series is per store code and year. They are different things, and the old series is kept for reference only.

## Open questions

1. **The complete list of places.** Send every Store, office, warehouse and counter with its code, town, format (MBO, single-brand, family store, shop-in-shop), opening date, legal entity and tax registration. The list has 17 rows, but the data names more places (Ratu, Sanskar, Fashion Studio, Patna, TAS, and the towns in bank narrations). Owner: KDPS Owner (the data provider named in the MOM is Priyo). Blocks stage 1 (structure and masters).
2. **Which codes are which.** Confirm each code in sections 3.1 and 3.2, and say what these stand for: `VAS` (as a bill series and as a sender), `DEOT`, `ASVH`, `RKJ`, `KLG2`, `FS`, `SR`, `TAS`, `LBKR`, `SBJ` against `SBG`. Owner: Operations. Blocks stage 1 (the earlier-POS import layouts) and the side-by-side test.
3. **Singh More and Ratu.** Which town is Singh More, and is "Vaishnavi Ratu" the same store? Owner: KDPS Owner. Blocks stage 1.
4. **States and registrations.** How many GST registrations, in which states, and which Store and warehouse uses which; whether the Ranchi warehouse sends to Bihar stores on a delivery challan or on a tax invoice. Owner: Accounts and the CA. Blocks stage 2 (`POL-10.08`) and stage 3 for transfers.
5. **Legal entities.** What Om Ganpati Enterprises, Sanskar Retail and Jainsons Lifestyle are (franchise, related firm, trade name or second legal entity), which Stores each owns, and who D D Developers is. Owner: KDPS Owner and the CA. Blocks stage 1 (structure) and stage 5 (franchise and books).
6. **Meaning of `CLOUD` and `RETAIL JI`.** Which POS and which version runs in each Store, and whether the single-brand stores bill on KDPS's POS or on the brand's own software (the PRD's EBO). Owner: Operations. Blocks the side-by-side test.
7. **Billing devices.** How many billing devices each Store has and whether a Store holds more than one bill series today. Owner: Operations and Admin. Blocks stage 4 (billing).
8. **Financial year and bill-number format.** Confirm the 1 April year start and the allowed length and characters of a bill number per registration (`POL-10.07`). Owner: the CA. Blocks stage 4.
9. **Bank-narration towns.** Do `LATEHAR`, `GUMLA`, `GARHWA`, `GODDA`, `NAWADA` and the other town tags mean KDPS Stores, brand-store staff placements or something else? Owner: KDPS Owner and Accounts. Blocks stage 1 and stage 5.
10. **Dealer site codes.** Who issues `KDPS-HZB-MF`, `KDPS-DEGR-MF` and the like, and does every brand have one per Store? Owner: Booking. Blocks stage 2 (PT conversion by dealer site).
11. **Madura billing for Patna and the Singh More store.** Under which customer name and registration are they billed? Owner: Accounts. Blocks stage 2.
12. **Challan series.** What `DCJ` stands for, which entity and registration it belongs to, and which movements get a challan. Owner: Accounts and the CA. Blocks stage 3 (`POL-10.03`).
