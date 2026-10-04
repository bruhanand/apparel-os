# data-from-kdps

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [docs](../README.md). Notes on the data by ERP topic: [docs/data-notes](../data-notes/README.md).

## What this folder is

- Data that KDPS Lifestyle Pvt. Ltd. (KDPS) sent to the ERP team in June and July 2026: spreadsheets kept by KDPS staff, vendor and brand files, a bank extract, exports from the earlier POS, photographs of paper, and one call transcript.
- It also holds files the ERP team made itself, some from the KDPS data: `pt-master-sheet.xlsx`, `report-offer.md`, `05-reference-data/pt-file-format.xlsx`, everything in `scope-dashboard-detail/`, the two HTML files in `store-requirements-users/`, and the reports, worklists, script and configs in `store-analysis/`. See "Who made what".
- 136 files plus 4 `.DS_Store` files: 5 at the top level and the rest in 9 top-level folders and their nested folders. Counts are given per folder below.
- The data is a sample for design and for synthetic-data testing. It is evidence of how KDPS works today. It decides nothing.

## How to read this

- The raw files are git-ignored. Only the `README.md` files are committed, so a README is the only way to see what is here without the raw files.
- The notes in [docs/data-notes](../data-notes/README.md) explain the data by ERP topic (stores, transfers, PT layouts, offers, purchases, store close and bank, access, POS exports, data quality). Each file block below links to the note that covers it. [file-inventory.csv](../data-notes/file-inventory.csv) lists every raw file.
- Each README here starts with what the folder is, then one block per file or group of near-identical files, then subfolders, then open questions.
- File names, sheet names and column names are in backticks and spelled exactly as in the file, typos included.
- Values set by earlier analysts (the reports, dashboards, scripts and configs in `store-analysis/`, the roles in `scope-dashboard-detail/`) are analyst assumptions, not KDPS decisions.
- Customer, bank, tax-registration and staff contact details are not copied into any README. A README says "present" and describes the column.
- Words follow the "Words used" tables in [prd.md](../prd.md): Organisation, Site, Store, Booking, PT (price ticket), SOH, MRP, Supplier return, Billing device.

## Files and subfolders at a glance

Top-level files (5, with their blocks further down this page):

| File | What it is | Made by |
| --- | --- | --- |
| `pt-master-sheet.xlsx` | The `Master Sheet` drop-down lists of the KDPS PT file, as a stand-alone workbook. Identical to the `Master Sheet` in `KDPS PT FILE SHEET.xlsx` | ERP team (1 Oct 2026) |
| `KDPS PT FILE SHEET.xlsx` | The KDPS PT file template with one work sheet per person, drop-downs, tax and margin formulas, and about 320 filled PT lines | KDPS staff (file dated 21 Jun 2026) |
| `KDPS INVOICE & OFFER DETAILS..xlsx` | Six sheets: supplier invoices tracker, brand offer calendar, supplier database, compiled PT file and party ledger summary | KDPS staff (file dated 15 Jun 2026) |
| `KDPS DEBIT & CREDIT NOTE DETAILS.xlsx` | Eight sheets: Supplier return claims, debit notes, credit notes and settlements, with the item lines behind the debit notes | KDPS accounts (inferred; file dated 17 Jun 2026) |
| `report-offer.md` | English translation of a call about the Blackberry and Mufti offer report | ERP team |

Subfolders (with files in them):

| Folder | Files | What it holds | README |
| --- | --- | --- | --- |
| `05-reference-data/` | 6 | The KDPS logo, the blank PT file template given to staff and vendors, and four vendor documents | [05-reference-data/README.md](05-reference-data/README.md) |
| `Q&A-req-recieved/` | 57 | First batch sent against the ERP team's data-request checklist: store list, brand-to-supplier map, samples of the earlier POS's SOH and sale reports, brand offers, 33 vendor PT files | [Q&A-req-recieved/README.md](Q&A-req-recieved/README.md) |
| `brand-analysis-report /` | 3 | June 2026 Blackberry and Mufti sales, SOH and offer sheets, and a Blackberry-side list of KDPS stock | [brand-analysis-report%20/README.md](brand-analysis-report%20/README.md) |
| `monthly-reports-april-may-2026/` | 24 | April Louis Philippe and May Blackberry and Mufti brand reports in Tally-style voucher layout, their raw POS exports, the AMM style list, a Flying Machine template, two AI skill files and photos | [monthly-reports-april-may-2026/README.md](monthly-reports-april-may-2026/README.md) |
| `store-analysis/` | 29 | Analyses of the Vaishnavi Deoghar Store and the Hazaribagh Store (also called JSL) from the earlier POS's exports: raw exports, HTML and PDF reports, worklists, a script and configs | [store-analysis/README.md](store-analysis/README.md) |
| `scope-dashboard-detail/` | 1 | `ERP_DASHBOARD_V1.xlsx`: role-access tables and a dashboard requirement, made by the ERP team | [scope-dashboard-detail/README.md](scope-dashboard-detail/README.md) |
| `transfer-data/` | 3 | Three phone photos of paper for stock sent from Ranchi to Deoghar and Hazaribagh: gate passes and a delivery challan | [transfer-data/README.md](transfer-data/README.md) |
| `store-requirements-users/` | 6 | Two photographed handwritten notebook pages of Store screens, the same two pages as PNGs, and two ERP-team HTML files that compare them with the earlier product | [store-requirements-users/README.md](store-requirements-users/README.md) |
| `bank-statement/` | 2 | One Store's FY 2026-27 daily sales report workbook, and a bank-statement extract (the folder name covers only the second file) | [bank-statement/README.md](bank-statement/README.md) |

Nested folders:

| Folder | README |
| --- | --- |
| `05-reference-data/vendor-files/` | [05-reference-data/vendor-files/README.md](05-reference-data/vendor-files/README.md) |
| `Q&A-req-recieved/PT FILE/` | [Q&A-req-recieved/PT%20FILE/README.md](Q&A-req-recieved/PT%20FILE/README.md) |
| `Q&A-req-recieved/BRAND OFFERS/` | [Q&A-req-recieved/BRAND%20OFFERS/README.md](Q&A-req-recieved/BRAND%20OFFERS/README.md) |
| `Q&A-req-recieved/BRAND OFFERS/ALLEN SOLLY/` | [Q&A-req-recieved/BRAND%20OFFERS/ALLEN%20SOLLY/README.md](Q&A-req-recieved/BRAND%20OFFERS/ALLEN%20SOLLY/README.md) |
| `Q&A-req-recieved/BRAND OFFERS/LOUIS PHILLIPE/` | [Q&A-req-recieved/BRAND%20OFFERS/LOUIS%20PHILLIPE/README.md](Q&A-req-recieved/BRAND%20OFFERS/LOUIS%20PHILLIPE/README.md) |
| `Q&A-req-recieved/BRAND OFFERS/PETER ENGLAND/` | [Q&A-req-recieved/BRAND%20OFFERS/PETER%20ENGLAND/README.md](Q&A-req-recieved/BRAND%20OFFERS/PETER%20ENGLAND/README.md) |
| `Q&A-req-recieved/BRAND OFFERS/VAN HEUSEN/` | [Q&A-req-recieved/BRAND%20OFFERS/VAN%20HEUSEN/README.md](Q&A-req-recieved/BRAND%20OFFERS/VAN%20HEUSEN/README.md) |
| `brand-analysis-report /blackberry/` | [brand-analysis-report%20/blackberry/README.md](brand-analysis-report%20/blackberry/README.md) |
| `brand-analysis-report /mufti/` | [brand-analysis-report%20/mufti/README.md](brand-analysis-report%20/mufti/README.md) |
| `monthly-reports-april-may-2026/2026-04/` | [monthly-reports-april-may-2026/2026-04/README.md](monthly-reports-april-may-2026/2026-04/README.md) |
| `monthly-reports-april-may-2026/2026-04/DATA/` | [monthly-reports-april-may-2026/2026-04/DATA/README.md](monthly-reports-april-may-2026/2026-04/DATA/README.md) |
| `monthly-reports-april-may-2026/2026-05/` | [monthly-reports-april-may-2026/2026-05/README.md](monthly-reports-april-may-2026/2026-05/README.md) |
| `monthly-reports-april-may-2026/2026-05/data/` | [monthly-reports-april-may-2026/2026-05/data/README.md](monthly-reports-april-may-2026/2026-05/data/README.md) |
| `store-analysis/VAISHNAVI/` | [store-analysis/VAISHNAVI/README.md](store-analysis/VAISHNAVI/README.md) |
| `store-analysis/hazaribagh/` | [store-analysis/hazaribagh/README.md](store-analysis/hazaribagh/README.md) |
| `store-analysis/jsl/` | [store-analysis/jsl/README.md](store-analysis/jsl/README.md) |

## Who made what

KDPS staff files (hand-maintained spreadsheets; the three top-level workbooks look like Google Sheets exports (guess)):
- `KDPS PT FILE SHEET.xlsx`, `KDPS INVOICE & OFFER DETAILS..xlsx`, `KDPS DEBIT & CREDIT NOTE DETAILS.xlsx`.
- `Q&A-req-recieved/MOM_S.xlsx` (the data-request checklist), `LIST OF ALL STORES.xlsx`, `SUPPLIER BRAND DETAILS.xlsx`, and `BRAND OFFERS/BRAND OFFERS.xlsx`.
- `bank-statement/3. Vaishnavi Singh More DSR(Fy-26-27).xlsx`: a Store's daily sales report, typed by Store staff.
- The Tally-style voucher workbooks and the Blackberry and Mufti workbooks in `monthly-reports-april-may-2026/` and `brand-analysis-report /` (who built them is not stated; KDPS side or an analyst on its behalf (guess)).
- Phone photos: `transfer-data/`, the two handwritten pages in `store-requirements-users/`, the two photos and the offer list image in `monthly-reports-april-may-2026/`.

Vendor and brand files:
- 33 vendor PT files in `Q&A-req-recieved/PT FILE/`, made by the vendors' own billing software.
- Screenshots of brand emails in `Q&A-req-recieved/BRAND OFFERS/` (Allen Solly, Louis Philippe, Peter England, Van Heusen).
- `05-reference-data/vendor-files/`: a supplier's own ledger, a vendor tax invoice (photographed) and the PT file for it.
- `brand-analysis-report /blackberry/KDPS LIFE.xlsx`: a list of KDPS's stock that looks like a Blackberry-side file (guess).
- `monthly-reports-april-may-2026/2026-04/16_AMM List dtd 20.01.26.xlsb`: the AMM style list, a brand-side list.

Bank:
- `bank-statement/Bank statement.xlsx`: two bank downloads stitched by hand into one sheet. Compiled by KDPS; the bank's own export format is not preserved.

Exports from the earlier POS (the system of record during the side-by-side test; its exports are evidence for checking only, `PRD-LIF-014`):
- `Q&A-req-recieved/SOH REPORT FORMAT.xlsx` and `SALE REPORT FORMAT.xlsx` (samples).
- The raw sale and stock workbooks in `monthly-reports-april-may-2026/2026-04/DATA/`, `store-analysis/VAISHNAVI/`, `store-analysis/hazaribagh/` and `store-analysis/jsl/`.
- The POS product is not named in any file (a store list column called `RETAIL JI` and a "TEN software" in the data-request checklist are the only hints).

ERP-team analysis and scoping files:
- `pt-master-sheet.xlsx` (created 1 Oct 2026), `05-reference-data/pt-file-format.xlsx` (saved 8 Jun 2026), `report-offer.md` (translation), `scope-dashboard-detail/ERP_DASHBOARD_V1.xlsx` (17 and 24 Jul 2026, generated with a Python library).
- `store-requirements-users/*.html` (30 Jun and 25 Jul 2026): transcriptions of the handwritten pages and a status table against the earlier product.
- `store-analysis/` reports, worklists, `build-report.py`, `dashboard-config.json` files: AI-assisted analysis "prepared for KDPS". No KDPS decision is recorded in any of them. `store-analysis/analysis-parameters.md` is an empty file (0 bytes, dated 6 Jul).
- `monthly-reports-april-may-2026/2026-05/kdps-report.skill` and `discount-audit.skill` (31 May 2026) and `KDPS-DIRECTION.xlsx`: tooling for the brand reports; maker not stated (guess: ERP side or an analyst).

## Period each folder covers

| Folder or file | Period of the data | Date of the files |
| --- | --- | --- |
| `pt-master-sheet.xlsx` | Seasons Jan 2025 to Oct 2026 in its season list | 1 Oct 2026 |
| `KDPS PT FILE SHEET.xlsx` | PT lines for seasons May-26 and Jun-26 | 21 Jun 2026 |
| `KDPS INVOICE & OFFER DETAILS..xlsx` | Invoices 28 Oct 2024 to 1 Jun 2026; offers 3 Sep 2025 to 11 Jun 2026 | 15 Jun 2026 |
| `KDPS DEBIT & CREDIT NOTE DETAILS.xlsx` | Claims Sep to Nov 2025; debit notes 4 Apr 2025 to 19 May 2026; summaries to 15 Jun 2026 | 17 Jun 2026 |
| `report-offer.md` | One call, about 19 Jun 2026 (as told to the ERP team; the file has no date) | 4 Oct 2026 (file system) |
| `05-reference-data/` | Template saved 8 Jun 2026; vendor documents of 20 to 25 Apr 2026 | Jun and May 2026 |
| `Q&A-req-recieved/` | Checklist 11 Jun 2026; offers Sep 2025 to Jun 2026; sale sample 12 and 13 Jun 2026; vendor invoices Aug 2025 to about May 2026 | Jun to Sep 2026 |
| `brand-analysis-report /` | 1 to 18 Jun 2026 sales; SOH sheets dated 1 Apr 2026 (Blackberry) and 1 Jun 2026 (Mufti) | Jun 2026 |
| `monthly-reports-april-may-2026/` | April 2026 (Louis Philippe); May 2026 (Blackberry sales 20 Apr to 22 May; Mufti) | Apr to Jun 2026 |
| `store-analysis/` | Vaishnavi Deoghar 3 Apr 2025 to 13 Jun 2026; Hazaribagh and JSL 4 Sep 2025 to 24 Jul 2026 | Jun to Sep 2026 |
| `scope-dashboard-detail/` | Made 17 Jul 2026, edited 24 Jul 2026 | 3 Aug 2026 |
| `transfer-data/` | Papers dated 16 and 23 Jun 2026 | Photos of 25 Jun 2026 |
| `store-requirements-users/` | Notes photographed 30 Jun 2026; HTML files 30 Jun and 25 Jul 2026 | Jul and Aug 2026 |
| `bank-statement/` | Store DSR 1 Apr to 5 Jun 2026 (FY 2026-27); bank lines 28 Mar to 14 Apr and 1 to 6 Jun 2026 | Jun 2026 |

## Sensitivity summary

"Present" means the raw files hold it and no README copies it.

| Folder | Customer | Cost and margin | Bank | GST and tax IDs | Staff |
| --- | --- | --- | --- | --- | --- |
| Top-level workbooks | None | `BASIC`, `P RATE` and margin in the PT file; invoice values, payments, credit terms | Supplier bank account numbers and IFSC codes in `SUPPLIER DATA BASE` and `INVOICE DETAILS.` | Party GSTINs in the software sheets | Staff first names as tab names; agent phone numbers |
| `05-reference-data/` | None | Cost columns in the vendor PT file | None | GSTINs, phone numbers in the vendor invoice and ledgers | KDPS email in a ledger header |
| `Q&A-req-recieved/` | Names and phone numbers in `SALE REPORT FORMAT.xlsx` | `Rate` in `SOH REPORT FORMAT.xlsx` and cost columns in vendor PT files | Supplier bank flag only | Vendor GSTINs in PT files | Salesperson names; one email per Store; brand representative names and phones in screenshots |
| `bank-statement/` | None in the DSR | None | Company bank lines: beneficiary, depositor, UPI and terminal references inside narrations | None | A person's name in file properties |
| `brand-analysis-report /` | None seen | None seen | None | None | None seen |
| `monthly-reports-april-may-2026/` | Names and phones in raw POS exports | `Rate` and `Amount` in some raw stock sheets | None | None | Salesperson names in raw exports |
| `store-analysis/` | Names and phones in raw sales exports and one sheet | Cost per barcode, margin reports, configured running costs | None | None | Salesperson names and per-person sales |
| `scope-dashboard-detail/` | None | None | None | None | None |
| `transfer-data/` | None | A unit value on the challan | None | GSTIN and PAN on the challan | Phone numbers, signatures |
| `store-requirements-users/` | None | None | Asks for staff bank details in the ERP (no values) | None | None |

## Known duplicates and near-duplicates

- `Q&A-req-recieved/BRAND OFFERS/PETER ENGLAND/PE MAY.jpeg` is byte-identical to `LOUIS PHILLIPE/LP MAY.jpeg` (same MD5). It is a Louis Philippe email. There is no Peter England May data in the folder. `LP APRIL.jpeg` is a cropped copy of the same email, not an April offer.
- `pt-master-sheet.xlsx` equals the `Master Sheet` in `KDPS PT FILE SHEET.xlsx` (I compared every cell A1 to V999: no cell differs).
- `05-reference-data/pt-file-format.xlsx` holds an older `Master Sheet`: 590 brands against 592, 95 items against 98, 134 sizes against 135. It lacks the brands `NOSTRUM` and `TOMBOY`, the items `BOTTLE`, `BUNDY` and `CARDIGAN`, and the size `6XL`; 82 cells differ after the shift.
- `store-requirements-users/`: the two PNGs (`store-ops-notes-2026-07-25-p1.png`, `-p2.png`) show the same two notebook pages as the two JPEGs of 30 Jun 2026 (same size 899 by 1599; re-saved, not byte-identical). The second HTML calls itself a second note.
- HTML and PDF pairs in `store-analysis/` (and its subfolders) are the same reports: the PDF is a Chrome render of the HTML.
- JSL and Hazaribagh are the same Store (Jainsons Lifestyle, Hazaribagh): `JSL` is the bill-series prefix. The sale files overlap line for line. This is strong evidence, not a statement by KDPS.
- `store-analysis/jsl/june sales report.xlsx` is a subset of `fy 26-27 sales.xlsx`.
- Three Allen Solly PNGs in `BRAND OFFERS/` repeat the content of the three Allen Solly JPEGs. `VH APRIL 2` and `VH APRIL 3` overlap.
- The Mufti SOH sheet in `brand-analysis-report /` (June) is the same as the May one. The `BOKARO` SOH voucher in `monthly-reports-april-may-2026/2026-04/` is a copy of the `AS-DEO` `LP2` SOH.
- The `Bank Reconciliation` sheet in the Singh More DSR was copied from the Banka Store's workbook (its header names Banka, its dates are 2025).

## Odd folder and file names

- `Q&A-req-recieved/`: the spelling "recieved" is in the real name. Links keep it.
- `brand-analysis-report ` has a trailing space in the real folder name. Links write it as `brand-analysis-report%20/`.
- `KDPS INVOICE & OFFER DETAILS..xlsx` has a double dot.
- Brand folder `LOUIS PHILLIPE` (double L) is spelled so in the real name.
- `.claude/.cc-writes` folders (empty) sit in this folder, in `Q&A-req-recieved/` and in `monthly-reports-april-may-2026/`. They are leftovers of an AI coding tool (inferred) and hold no data.
- `.DS_Store` files (macOS) sit in this folder, in `Q&A-req-recieved/`, `Q&A-req-recieved/BRAND OFFERS/` and `store-analysis/`. They hold no data.
- File extensions lie in the PT files: `AS INNERWEAR.csv` is a binary `.xls`, `TWILLS.xls` is an `.xlsx`, the Madura `.xlsb` is a binary workbook.
- `monthly-reports-april-may-2026/2026-04/DATA` is upper case and `2026-05/data` is lower case.

## Top-level files

### `pt-master-sheet.xlsx`

- **What it is.** One workbook, one sheet, `Master Sheet`: the drop-down master lists behind the KDPS PT file. It is an extract of the `Master Sheet` in `KDPS PT FILE SHEET.xlsx`, with identical cell values.
- **Made by.** The ERP team. The file was created on 1 Oct 2026 (08:27 UTC) and last saved at 08:32 on a Mac (Microsoft Excel for Mac); the author field names an ERP-team member. It is not a file KDPS sent.
- **Shape.** Used range `A1:V999`; the data sits in `A1:L593`; `A1:L593` has an AutoFilter; a freeze pane is set at `A50` (a leftover view). Header row 1. No formulas, no merged cells, no drop-downs. Defined name `BRAND` = `'Master Sheet'!$B$1:$B$999`.
- **Columns.** Independent lists side by side, not one table. Counts exclude the header:

| Column | Header | Values | Holds |
| --- | --- | --- | --- |
| A | `SEASON` | 22 | `SPRING SUMMER(Jan-25)` to `SPRING SUMMER(Jun-25)`, then `AUTUMN WINTER(Jul-25)` to `AUTUMN WINTER(Dec-25)`, the same for 2026 up to `AUTUMN WINTER(Oct-26)`. One value per month |
| B | `BRAND` | 592 | Alphabetical until `ZOLA`; the last 7 (`ADITYA`, `ALFALITE`, `CARLTON`, `MONTE CARLO`, `TOM BOY`, `NOSTRUM`, `TOMBOY`) are appended out of order. Starts with `24 STREET`, `7 STITCH`, `90 ML`, `A`. `TOM BOY` and `TOMBOY`, and two spellings of `SF`, are duplicates |
| C | `COLOR` | 23 | `BLACK`, `BLUE`, `BROWN`, `CHIKU`, `CREAM`, `ECONOMY`, `GREE`, `GREEN`, `GREY`, `MAROON`, `MEDIUM`, `NAVY`, `OLIVE`, `ORANGE`, `PINK`, `PREMIUM`, `PURPLE`, `RUST`, `STARD`, `TEAL`, `WHITE`, `YELLOW`, `RED`. `ECONOMY`, `MEDIUM` and `PREMIUM` are tags, not colours (staff tag goods with no clear colour or classification this way, mostly non-brand goods: product owner, 4 Oct 2026; how the product handles these tags is OPEN for the product owner); `GREE` and `STARD` look like typos |
| D | `GENDER` | 5 | `MALE`, `FEMALE`, `KIDS MALE`, `KIDS FEMALE`, `UNISEX` |
| E | `SUB CATEGORY` | 9 | `ACCESSORIES`, `CASUAL WEAR`, `FABRIC`, `FORMAL WEAR`, `INNERWEAR`, `NIGHTWEAR`, `PARTY WEAR`, `SEASONAL WEAR`, `SPORTS WEAR` |
| F | `TYPE` | 7 | `ACCESSORIES`, `BOTTOM WEAR`, `FOOTWEAR`, `FULL SET`, `LUGGAGE`, `ONE-PIECE`, `TOP WEAR` |
| G | `ITEM` | 98 | Item names from `BABA SUIT` and `BACKPACK` to `WINDCHEATER`, then `BOTTLE`, `BUNDY`, `CARDIGAN` appended last |
| H | `FIT` | 75 | Fits and also other things: `2 PCS SUIT`, `3 PCS SUIT`, `5 PCS SUIT`, `B-91`, `B-95`, `COTTON KURTI`, `PROMO`, `UNSTITCHED`. Variants and typos: `PAJAMA` and `PAJAMS`, `SKINNY TEPAR` and `SLIM TEPAR`, `SUPPER SKINNY`, `LOSSE` |
| I | `SIZE` | 135 | Numbers (0 to 48, 72 to 112), `S` to `6XL`, bra sizes (`30B` to `42D`), kids ages (`2-4 Y` to `15-16 Y`), months (`0-6 M`, `6-12 M`, `12-18 M`), volumes (`100 ML` to `250 ML`), lengths and sizes in cm, `FREE SIZE`, `WITH BLOUSE PIECE`, `WITHOUT BLOUSE PIECE`. The odd codes `AS`, `EES`, `EL`, `ES`, `EXL`, `EXS` also appear |
| J | `GST %` | 4 | `5`, `12`, `18`, `TAX FREE` |
| K | `SUB CATEGORY` | 98 | For the `ITEM` on the same row, its sub category. 13 distinct values: the 9 above and the combinations `CASUAL WEAR/INNERWEAR`, `CASUAL/SPORTS /NIGHTWEAR`, `FORMAL / CASUAL/ PARTY WEAR`, `SPORTS WEAR/INNERWEAR` |
| L | `TYPE` | 98 | For the `ITEM` on the same row, its type. 8 distinct values: the 7 above plus `LUGGAGE/ACCESSORIES` (3 items) |

- **How it is used.** In `KDPS PT FILE SHEET.xlsx` the work sheets take drop-downs from these lists, and the `SUGGESTED SUB CATEGORY` and `SUGGESTED TYPE` columns look up an `ITEM` in columns `G:L` (see that block).
- **Quirks.**
  - `COLOR` holds the tags `PREMIUM`, `MEDIUM` or `ECONOMY` instead of a colour; the work sheets use it that way (`PREMIUM` on 285 of 320 lines, `ECONOMY` on 22, a real colour on the other 13).
  - Combined values in `SUB CATEGORY` and `TYPE` break a one-value-per-field rule.
  - The `ITEM` list mixes garments, accessories, luggage, fabric, a perfume and electronics (`HEADPHONE`, `SPEAKER`).
- **Sensitive.** None.
- **Notes.** [item-master-vocabulary.md](../data-notes/item-master-vocabulary.md), [pt-file-layouts.md](../data-notes/pt-file-layouts.md).

### `KDPS PT FILE SHEET.xlsx`

- **What it is.** The KDPS PT file template with one work sheet per person. Each person copies the template, picks values from drop-downs, and types barcode, design, HSN, quantity, MRP and `BASIC`. Formulas fill the purchase rate, input and output tax, margin and two suggested category columns. The PRD defines `BASIC`, `P RATE` and `NAG` for this layout in "Words used" (`NAG` always equals `QTY`), lists the same 22 columns as the KDPS export profile (`PRD-PTW-008`), and sets `MARGIN` as (`MRP` − `P RATE`) ÷ `MRP` × 100 (`PRD-PTW-011`). The cost derivation belongs to the approved costing profile (`PRD-PTW-010`).
- **Made by.** KDPS staff. File dated 21 Jun 2026. The properties are stripped and a people list is present, so it looks like a Google Sheets export (guess). The tab names are the first names of staff and a role (`OWNER`, `Office`).
- **Sheets (10).** Every work sheet has the same header row 2:

  `SEASON`, `BRAND`, `COLOR`, `GENDER`, `SUB CATEGORY`, `TYPE`, `ITEM`, `FIT`, `SIZE`, `BARCODE`, `DESIGN`, `HSN`, `QTY`, `MRP`, `BASIC`, `P RATE`, `INPUT TAX`, `OUTPUT TAX`, `NAG`, `MARGIN` (columns A to T), a blank column U, then `SUGGESTED SUB CATEGORY` (V) and `SUGGESTED TYPE` (W).

| Sheet | State | Used range | Filter | Freeze | PT lines | Sum of `QTY` | Multiplier in `P RATE` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Master Sheet` | visible | `A1:V999` | `A1:L593` | `A2` | none | none | none |
| `"OWNER" Work Sheet` | visible | `A1:AA16342` | `A2:W16342` | `A3` | 0 | 0 | 1.2 |
| `"DEBANJAN" Work Sheet` | visible | `A1:AA2477` | `A2:T2` | none | 0 | 0 | 1.1 |
| `"MAHENDRA" Work Sheet` | visible | `A1:AA2342` | none | none | 1 | 90 | 1.1 |
| `"Office" Work Sheet` | hidden | `A1:Z2342` | `A2:T2342` | `A3` | 0 | 0 | 1.2 |
| `"PRAVIN JI " Work Sheet` (trailing space) | hidden | `A1:Z1000` | none | `A3` | 0 | 0 | 1.1 |
| `"NARESH" Work Sheet` | visible | `A1:AA2342` | `A2:T57` | `A3` | 243 | 310 | 1.2 |
| `"ANKIT" Work Sheet` | visible | `A1:AA1000` | none | `A3` | 41 | 62 | 1.2 |
| `"SANTOSH" Work Sheet` | visible | `A1:AA1000` | none | `A3` | 13 | 13 | 1.2 |
| ` "GULSHAN" Work Sheet` (leading space) | visible | `A1:Y1000` | `A2:T1000` | `A3` | 22 | 34 | 1.2 |

- **`Master Sheet`.** Same lists as `pt-master-sheet.xlsx` (see the block above for every column). Conditional formatting on 11 ranges.
- **PT lines in total.** 320 lines and 509 pieces (sum of `QTY`). Season is `SPRING SUMMER(Jun-26)` except `SANTOSH` (`SPRING SUMMER(May-26)`).
  - `NARESH`: Levis, `PREMIUM`, `MALE`, `CASUAL WEAR`. Items: `T-SHIRT` 90, `JEANS` 85, `SHIRT` 67, `CARGO` 1. 243 distinct barcodes (every one a valid EAN-13) and 167 designs. `INPUT TAX` is 5 on 188 lines and 18 on 55; `OUTPUT TAX` is 18 on 179 lines and 5 on 64. `BASIC` is between 58% and 68% of `MRP`.
  - `ANKIT`: Van Heusen, `PREMIUM`, `MALE`. Sub category `INNERWEAR` 23, `NIGHTWEAR` 11, `CASUAL WEAR` 7. Items: `SHORTS` 15, `LOWER` 11, `T-SHIRT` 7, `BRIEF` 4, `VEST` 4. 41 distinct barcodes (valid EAN-13), 41 designs. Tax 5 on every line. `BASIC` is between 67% and 71% of `MRP`.
  - `GULSHAN`: Van Heusen, `ECONOMY`, `MALE`. `INNERWEAR` 15, `SPORTS WEAR` 7. Items: `BRIEF` 10, `LOWER` 7, `VEST` 5. 22 distinct barcodes (valid EAN-13). Tax 5 on every line.
  - `SANTOSH`: Flying Machine 1 line and Status Quo 12 lines; `T-SHIRT` on all 13; `COLOR` `TEAL` 8 and `BLACK` 5; `GENDER` `MALE` 8 and `KIDS MALE` 5; 12 distinct barcodes (one appears on two lines), 2 designs. `BASIC` is exactly 65% of `MRP` on every line, so `MARGIN` computes to exactly 22. 48 more rows (17 to 64) hold only `FIT` = `SLIM`.
  - `MAHENDRA`: one line, Tomboy kids shorts, size `5-6 Y`, `QTY` 90. Its `HSN` has 6 digits (the others have 8).
  - `OWNER`, `DEBANJAN`, `Office` and `PRAVIN JI`: no lines. `OWNER` is formatted to row 16,342.
- **Formulas (all work sheets).**
  - Row 1: `SUBTOTAL(9, …)` over `QTY`, `MRP`, `BASIC`, `P RATE` and `NAG`. `SANTOSH` sums `BASIC` over `O5:O10003` where the others sum `O3:…` (a stray range).
  - `P RATE` = `BASIC` × 1.2 or × 1.1 (see the table). The multiplier has drifted between copies.
  - `INPUT TAX`: blank when `QTY` is blank; 5 for sub category `FABRIC`; 5 for item `SAREE`; 18 for `BELT`, `LADIES PURSE`, `WALLET`; 18 when type is `LUGGAGE` and `BASIC` is set; otherwise 5 when `BASIC` is 2500 or less, else 18.
  - `OUTPUT TAX`: the same rules on `MRP`, with the cut-off 2625 (inferred: 2500 plus 5 per cent) instead of 2500.
  - `NAG` = `QTY`. `MARGIN` = (`MRP` − `P RATE`) × 100 / `MRP`.
  - `SUGGESTED SUB CATEGORY` and `SUGGESTED TYPE` = `VLOOKUP` of `ITEM` into `'Master Sheet'!G2:L999` (columns 5 and 6). A miss shows `WRONG ITEM` or `PLEASE RECTIFY `. In `Office` the same columns sit one column left (U and V) and show a blank on a miss. `PRAVIN JI ` has no suggested columns and an older tax formula (no `FABRIC`, wallet or purse rules; `BELT` 18; 2625 for both taxes).
  - These tax rules are KDPS's spreadsheet logic. They are not a signed policy. OPEN: confirm with the CA.
- **Drop-downs.** 10 or 11 list rules on every work sheet: columns A to I point to the matching `Master Sheet` column; `INPUT TAX` and `OUTPUT TAX` (Q:R) point to `GST %`, with the prompt "Click and enter a value from range". Stray input prompts remain on `DEBANJAN` and `MAHENDRA` (column B), `SANTOSH` (column B) and `Office` (columns A and C): a person's name or `Connect with "HO"`.
- **Defined names.** `BRAND` = `'Master Sheet'!$B$1:$B$999`; `EmptyList` = `#REF!` (broken).
- **Quirks.**
  - Hidden sheets `Office` and `PRAVIN JI ` are empty.
  - `SUGGESTED` values include combinations (`FORMAL / CASUAL/ PARTY WEAR`, `CASUAL/SPORTS /NIGHTWEAR`).
  - Barcodes are 13-digit numbers stored as numbers.
  - `HSN` is stored as a number.
  - `NARESH` has an AutoFilter on `A2:T57` although it holds 243 lines.
- **Sensitive.** Cost (`BASIC`, `P RATE`) and margin per line. Staff first names as tab names.
- **Notes.** [pt-file-layouts.md](../data-notes/pt-file-layouts.md), [item-master-vocabulary.md](../data-notes/item-master-vocabulary.md).

### `KDPS INVOICE & OFFER DETAILS..xlsx`

- **What it is.** The KDPS accounts and merchandising tracker for supplier invoices, brand offers and supplier terms. Six sheets, hand-maintained, with Excel threaded comments, one pivot table and more than 17,000 formulas.
- **Made by.** KDPS staff. File dated 15 Jun 2026. The properties are stripped; the comments come from two Google Sheets accounts (a KDPS operations account and a KDPS staff account; names not copied). A cached `Invoice Ageing` of 595 days for an invoice of 28 Oct 2024 puts the last recalculation on 15 Jun 2026.
- **Links.** The soft-copy and artwork cells are hyperlinks to Google Drive files (67 on the first sheet, 74 on `OFFER DETAILS.`, 1,477 on `INVOICE DETAILS.` for `Invoice Soft Copy`, 779 for `PT File Excel Sheet`). The Drive files are not here.

| Sheet | State | Used range | Filter | Freeze | Data rows |
| --- | --- | --- | --- | --- | --- |
| `Arvind & LC Invoice Details.` | hidden | `A1:AB1001` | `A2:AB1001` | `G3` | 67 (rows 3 to 69) |
| `OFFER DETAILS.` | visible | `A1:AA999` | `A1:J105` | `A2` | 104 (rows 2 to 105) |
| `SUPPLIER DATA BASE` | visible | `A1:T936` | `A1:T936` | `C2` | 261 (rows 2 to 262) |
| `INVOICE DETAILS.` | visible | `A1:X1994` | `A2:X1482` | `F3` | 1,414 with a supplier; 1,259 with an invoice number (rows 3 to 1482) |
| `COMPILED PT FILE` | visible | `A1:Z1000` | `A3:W3` | `A4` | 12 (rows 4 to 15) |
| `SUMMARY` | visible | `A1:Y1001` | `A2:H121` | `A3` | none in `A:G`; 115 computed rows |

**`Arvind & LC Invoice Details.`** (hidden)
- Title in `A1` "Arvind & Linen Club Invoice Details" (merged `A1:F1`). Header row 2, columns A to O: `Supplier Name`, `Invoice Number`, `Invoice Date`, `Month`, `Year`, `Brand Name`, `Quantity`, `Billing Amount`, `MRP Amount`, `Invoice Soft Copy`, `Invoice Season`, `Invoice Status`, `Stock Remarks`, `Booking Status`, `Margin Analysis Status`. Column M (`Stock Remarks`) is hidden.
- Row 1 totals: 6,630 pieces; billing Rs 1,46,55,490; MRP Rs 2,23,69,532.47; `Invoice Count` 67.
- 67 invoices from one supplier (Vishal Marketing & Company). Brands: `U.S POLO` 29, `ARROW` 13, `FLYING MACHINE` 8, `LINEN CLUB` 7, `U.S POLO KIDS` 5, `U.S POLO PROMO` 2, `U.S POLO (SOR)` 2, `U.S POLO KIDS PROMO` 1. `Invoice Season` is `AW'25` on all. `Invoice Status` is `Uploaded In TEN` on all. `Booking Status`: `BOOKED IN VENUE.` 55, `BOOKED IN "DB".` 6, `Non Booked Article Found.` 3, `PROMO` 3. `Margin Analysis Status`: `PENDING.` 57, `DONE.` 10.
- Drop-down lists: brand (11 values including the `PROMO` and `(SOR)` forms), `Booking Status` (adds `GOODS RETURNED`), `Invoice Status` (`Uploaded In TEN`, `Invoice Not Received`, `PT File Not Received`, `PT File Done Not-Uploaded In TEN`, `Inward Pending`, `Product Not Received`), `Margin Analysis Status` (`PENDING.`, `DONE.`, `GOODS RETURNED`), season (`AW'25` to `AW'27`).
- `Month` and `Year` are formulas on `Invoice Date` and show a blank down to row 1001.
- `Stock Remarks` (62 of 67 filled) say which Store received the goods or where they were transferred, in words ("Product Received (…)", "Stock Transfered … Units …").
- 4 threaded comments (16 Sep 2025 to 10 Feb 2026): goods returned from the Hazaribagh Store; a promo set billed with an invoice (duffel bags, backpacks, trolleys, 17 in all); 21 pieces returned for price mismatch; 51 pieces returned as unordered stock (to "VMC", inferred to be the supplier).
- Quirk: 6 invoice dates look day and month swapped (for example an invoice numbered in the 2200s is dated 11 Jan 2025 while its neighbours are dated Oct to Nov 2025), so the earliest and latest dates (11 Jan and 11 Dec 2025) are not reliable (inferred).

**`OFFER DETAILS.`**
- Header row 1, columns A to H: `Brand Name`, `Offer Type`, `Season`, `Offer Details`, `Offer Starting Date`, `Offer Closing Date`, `Offer Status`, `Offer Artwork` (the filter reaches column J).
- 104 offers. Brands: `U. S. POLO KIDS` 22, `U. S. POLO` 20, `FLYING MACHINE` 18, `ARROW` 18, `SPYKAR` 18, `LINEN CLUB` 8. Types: `EOSS` 51, `ATV` 37, `GWP` 11, `FRESH` 5. Seasons: `AW'25` 83, `SS'26` 21. Status: `CLOSED` 90, `STILL RUNNING` 9, `NO OFFER` 5.
- Starting dates 3 Sep 2025 to 11 Jun 2026 (all real dates). Closing dates: 95 real dates (10 Oct 2025 to 11 Jun 2026) and 9 cells with the text `Not Disclosed Yet.`.
- `Offer Details` is free text, for example `B1-20%, B2-30%, B2-G2 (SU#BZ Flat-30%)`, `BUY 16999/- GET 3000/- 0FF` (a zero for the letter O) and `BUY 8999/- & GET A BACKPACK WORTH 4999/- FOR 499/-`.
- `Offer Artwork` holds a PDF file name and a Drive link (13 merged cells span 2 or 3 rows; 80 cells filled, 74 hyperlinked).
- Drop-down lists: brands (6, spelled `U. S. POLO` and so on), `Season` (`AW'25` to `AW'28`, 7 values), `Offer Type` (4), `Offer Status` (3).
- Two stray notes sit beside the Linen Club row 54, in columns I and J: "NSV - 24lakh 1% 28lakh 2% 34lakh 3%" and "Deo 1staff". They read like a net-sale-value slab and a staff count for Deoghar (guess); the meaning is not stated.
- `ATV`, `GWP`, `EOSS` and `FRESH` are used without a definition in this file. Readings from the other offer files (guess): `ATV` a bill-value slab, `GWP` gift with purchase, `EOSS` end-of-season sale, `FRESH` a period with no offer. OPEN: KDPS Owner to confirm.

**`SUPPLIER DATA BASE`**
- Header row 1, columns A to M: `PARTY NAME`, `Location`, `Brand Name`, `Credit Days`, `CD`, `Agency Company`, `Agent Name`, `Agent Number`, `Agency Accounts Name`, `Accounts Desk Number`, `Account Holder Name`, `Bank Account`, `IFSC Code`. Column N (hidden) and columns O to T are empty.
- 261 parties, every name distinct. Most fields are "-" placeholders: `Location` "-" on 136 and blank on 8 (15 distinct places; `SURAT` 29, `RANCHI` 26, `KOLKATA` 20, `MUMBAI` 10, `INDORE` 7, `DELHI` 6); `Brand Name` "-" on 192, blank on 22 (39 distinct values, `JOCKEY` 7, `WITHOUT BRAND` 2, `MULTI BRAND` 2).
- `Credit Days`: "-" on 181, blank on 19, `NO` on 18, a number on 43 (`60` on 21, `30` on 8, `15` on 4, others 10 to 80). `CD` (cash discount): "-" on 200, blank on 19, 0.02 to 0.1 on about 34, `NET` on 3, `5% IN BILL` on 2, one `5.0`.
- `Agency Company`: 65 filled, 5 distinct values (`SURYAM TEXTILE AGENCY` 29, `NEPOLIAN` 17, `DIRECT` 9, `RTC` 7, `SUNRISE AGENCY` 3). `Agent Name` filled on 51, `Agent Number` on 58, `Account Holder Name` on 112, `Bank Account` on 111, `IFSC Code` on 111. `Agency Accounts Name` is empty throughout and `Accounts Desk Number` has 1 value.
- Quirks: `Agent Number` is stored as text and as numbers; `CD` is a fraction or text; `Credit Days` is a number or `NO`.
- Sensitive: bank account numbers, IFSC codes, account holder names and agent phone numbers are present.

**`INVOICE DETAILS.`**
- Title `A1` "Other Invoice Details" (merged `A1:E1`). Header row 2, columns A to V: `Supplier Name`, `Brand Name`, `Agency Company`, `Credit Days`, `CD %`, `Invoice No`, `Invoice Date`, `Invoice Qty`, `Invoice Value`, `Invoice Soft Copy`, `PT File Excel Sheet`, `TEN Uploaded Date`, `Invoice Ageing`, `Bank Name`, `Bank Account`, `IFSC Code`, `Payment Amount`, `Payment Date`, `CD Amount`, `GR Amount`, `Remarks`, `Accounting Year`.
- Typed columns: `Supplier Name` (a drop-down fed by `SUPPLIER DATA BASE`), `Invoice No`, `Invoice Date`, `Invoice Qty`, `Invoice Value`, `Invoice Soft Copy`, `PT File Excel Sheet`, `TEN Uploaded Date`, `Payment Amount`, `Payment Date`, `CD Amount`, `GR Amount`, `Remarks`. Formula columns (9 columns, about 17,900 formulas, 1,992 rows each): `Brand Name`, `Agency Company`, `Credit Days`, `CD %`, `Bank Name`, `Bank Account`, `IFSC Code` (all `VLOOKUP` into `SUPPLIER DATA BASE`), `Invoice Ageing` (today minus `Invoice Date`, as text) and `Accounting Year` (`FY 24-25`, `FY 25-26`, `FY 26-27` by date).
- Quirks in the formulas: the `VLOOKUP` rows test `$A$3` (absolute) rather than their own row; the column headed `Bank Name` returns `Account Holder Name` (column 11 of the lookup range).
- Row 1 header totals: 1,259 invoices (`F1`), 54,487 pieces (`H1`), Rs 6,77,63,895.84 (`I1`), "NEED TO UPDATE: 219" (`J1`: soft copies minus invoice numbers), payments Rs 23,50,486 (`Q1`), `CD Amount` 96,300.6 (`S1`), `GR Amount` 2,145 (`T1`).
- 126 distinct suppliers. The largest by rows: Aditya Birla 632, Saraogi Super Sales 69, Vishal Marketing 64, AS Textile 57, Jain Adishwar Hosiery Works 45, D Apparel 36, D D Sales Co 30, P R Modi and Sons 26.
- Rows: 1,414 with a supplier; 1,259 with an invoice number; 942 with an `Invoice Date` (28 Oct 2024 to 1 Jun 2026), of which 940 have date, quantity and value. 221 rows hold only a soft-copy file name. `Accounting Year`: `FY 25-26` 699, `FY 26-27` 242, `FY 24-25` 1.
- `PT File Excel Sheet`: "-" on 695, a file name on 779. `TEN Uploaded Date`: "-" on 602, a date on 25 rows (3 to 14 Apr 2026). `Payment Amount` on 49 rows (11 Feb to 14 Jun 2026, Rs 23,50,486); `CD Amount` on 17; `GR Amount` on 1; `Remarks` on 12 (for example `DONE`, `CONSIGNMENT`, "bill pay" notes listing invoice numbers).
- Quirks: `Invoice No` is text on 1,092 rows, a number on 162 and an Excel date on 5 (years 1953 to 2408, a mangled number); text values include `NOT AVAILABLE` (repeated); 4 supplier-and-invoice pairs repeat. Two threaded comments on `Invoice Soft Copy` name suppliers and were marked resolved (21 to 24 Feb 2026).
- Sensitive: bank details (looked up), payment amounts, credit terms.

**`COMPILED PT FILE`**
- Header row 3, columns A to V: `INVOICE NUMBER`, `INVOICE DATE`, `BRAND`, `COLOR`, `GENDER`, `SUB CATEGORY`, `TYPE`, `ITEM`, `FIT`, `SIZE`, `BARCODE`, `DESIGN`, `HSN`, `QTY`, `MRP`, `BASIC`, `P RATE`, `INPUT TAX`, `OUTPUT TAX`, `NAG`, `MARGIN`, `MONTH`. It is the PT layout with an invoice number and date in front and a month at the end.
- 12 lines, 108 pieces, three invoice numbers (`PMS/26-27/786` 7 lines; `MDCRS26/680` 4; `PECRS26/625` 1), all dated 1 Jun 2026. `PMS` jeans (female, `CASUAL WEAR`) and Jockey vests and briefs (male, `INNERWEAR`). `BARCODE` is filled on 5 of 12 and looks like style codes plus size (not an EAN).
- `INVOICE NUMBER` is a drop-down from `INVOICE DETAILS.`; `INVOICE DATE` is a `VLOOKUP` into it; `MONTH` is `UPPER(TEXT(date, "MMMM"))`. Both formulas are filled down to row 1000. The `P RATE`, tax, `NAG` and `MARGIN` cells are pasted values, not formulas.

**`SUMMARY`**
- Title `A1` "KDPS PARTY LEDGER SUMMARY". Header row 2: `Opening Balance` (C), `CD Amount` (D), `GR Value` (E), `Payment Amount` (F), `Interest If Any` (G), `Due As On` (H). Columns A and B have no header.
- A pivot table (`A2:B129`, rows `Supplier Name`, sum of `Invoice Value` over `INVOICE DETAILS.`) is defined but its cells are empty in this copy (the pivot is set to refresh on opening). Columns C to G are empty.
- `Due As On` is `SUM(B:C) − (SUM(D:F) + G)` per row. 115 rows still show a cached result (total Rs 6,72,35,606), but the inputs are blank, so these are stale results.
- Header totals (cached): `B1` Rs 6,77,63,895.84, `D1` 22,888, `E1` 16,674, `F1` 4,88,269, `G1` 459. They do not match `INVOICE DETAILS.` (payments 23,50,486, `CD` 96,300.6, `GR` 2,145).
- No data of its own remains.

- **Sensitive.** Supplier bank account numbers, IFSC codes, account holder names, agent names and phone numbers, payment amounts, credit terms. No customer data.
- **Notes.** [purchases-and-supplier-notes.md](../data-notes/purchases-and-supplier-notes.md), [offers-and-brand-reports.md](../data-notes/offers-and-brand-reports.md), [pt-file-layouts.md](../data-notes/pt-file-layouts.md).

### `KDPS DEBIT & CREDIT NOTE DETAILS.xlsx`

- **What it is.** The KDPS accounts tracker for Supplier returns and claims: the goods return (GR) or debit note (DN) KDPS raises, the credit note (CN) or settlement that comes back, and the difference. Eight sheets, hand-maintained. One legacy cell comment. 354 hyperlinks to Drive copies of the notes.
- **Made by.** KDPS accounts. File dated 17 Jun 2026. The properties are stripped.
- **Legal entities.** The `FRENCHEEZI` list in `DATA BASE` holds two names, `KDPS LIFESTYLE PVT LTD` and `OM GANPATI ENTERPRISES`. The column name is the file's spelling; it means the legal entity the claim belongs to (inferred).

| Sheet | State | Used range | Filter | Freeze | Data rows |
| --- | --- | --- | --- | --- | --- |
| `DATA BASE` | visible | `A1:AA1000` | none | `A3` | lists |
| `CREDIT NOTE DATA SHEET` | hidden | `A1:AC1000` | `A2:P1000` | `A3` | 11 (rows 3 to 13) |
| `KDPS CN & DN SHEET` | visible | `A1:AC866` | none | `D3` | 215 (rows 3 to 217) |
| `KDPS CN & DN SHEET-BRAND` | visible | `A1:AC781` | `A2:AC132` | none | 130 (rows 3 to 132) |
| `2025-26-SUMMARY` | visible | `A1:D370` | `A1:Z370` | none | 369 |
| `2025-26_SOFTWARE` | hidden | `A1:Z14137` | none | none | 14,135 lines and a total row |
| `2026-27-SUMMARY` | visible | `A1:D105` | none | none | 104 |
| `2026-27_SOFTWARE` | hidden | `A1:Z2293` | none | none | 2,291 lines and a total row |

**`DATA BASE`** (header row 2; lists only, no formulas; a stray cell comment on `H166` reads "16/04/2025 SALE RETURN RECEIVED 72397/-")
- `BRAND` 281 values; `SEASON` 8 (`SS'25`, `AW'25`, `SS'26`, `AW'26`, `SS'27`, `AW'27`, `SS'28`, `AW'28`); `DN TYPE` 7 (`EOSS CREDIT NOTES`, `STAFF SALARY REIMBURSEMENT`, `GOODS RETURN ` with a trailing space, `SHORT RECEIVED CLAIM`, `DAMAGE GOODS CLAIM`, `FURNITURE CLAIM`, `MONTHLY TARGET INCENTIVE`); `CLAIM STATUS` 7 (`RECEIVED`, `PENDING`, `HOLD`, `SHORT RECEIVED`, `REJECTED`, `DATA NOT RECEIVED`, `RESOLVED`); `REASON OF GR` 5 (`STOCK CORRECTION`, `WRONG INVOICE`, `UNORDERED STOCK`, `EXCHANGE`, `DEFECTIVE STOCK`); `FRENCHEEZI` 2; `PARTY NAME` 216.
- The drop-downs on the three claim sheets read these lists.

**`CREDIT NOTE DATA SHEET`** (hidden; title `A1` "KDPS CREDIT NOTE DETAILS")
- Header row 2, columns A to P: `FRENCHEEZI`, `BRAND`, `SEASON`, `REASON OF GR`, `GR NUMBER`, `GR DATE`, `QUANTITY`, `CLAIM AMOUNT`, `CLAIM STATUS`, `SETTLEMENT DATE`, `SETTLEMENT NO`, `SETTLED QTY`, `SETTLEMENT AMOUNT`, `SETTLEMENT DIFFERENCE`, `SETTLEMENT COPY`, `REMARKS`.
- 11 claims dated 15 Sep to 12 Nov 2025: 1,696 pieces; claimed Rs 31,22,179; settled Rs 30,67,666 on 1,674 pieces (9 settled). Brands: `ARROW` 2, `U.S. POLO` 2, `FM`, `U.S. POLO KIDS`, `SPYKAR` and others. `REASON OF GR`: `STOCK CORRECTION` 5, `WRONG INVOICE` 4, `DEFECTIVE STOCK` 2. `CLAIM STATUS`: `RESOLVED` 4, `SHORT RECEIVED` 2, `RECEIVED` 2, `PENDING` 2, `DATA NOT RECEIVED` 1. `KDPS LIFESTYLE PVT LTD` 10, `OM GANPATI ENTERPRISES` 1.
- `GR NUMBER` looks like `25-26/WH/PR-nn`; `SETTLEMENT NO` like `SR/nnn`; `SETTLEMENT COPY` like `SR_373.pdf` (9 hyperlinks).
- `SETTLEMENT DIFFERENCE` = claim minus settlement, or `CLAIM FULLY SETTLED` (a formula result: number or text in one column).

**`KDPS CN & DN SHEET`** (non-brand parties, tagged `NON BRAND`; title `A1` "KDPS CN & DN DETAILS")
- Header row 2, columns A to R: `PARTY NAME`, `BRAND NAME`, `SEASON`, `DN TYPE`, `DN NUMBER`, `DN DATE`, `DN QUANTITY`, `DN AMOUNT`, `DN COPY`, `CN NUMBER`, `CN DATE`, `CN  QUANTITY` (two spaces), `CN  AMOUNT` (two spaces), `CN COPY`, `CLAIM STATUS`, `SETTLEMENT DIFFERENCE`, `REMARKS`, `DETAILS`.
- 215 debit notes over 96 parties, 10 Apr 2025 to 19 May 2026. Cached header totals: `DN QUANTITY` 5,142; `DN AMOUNT` Rs 65,62,977; `CN  QUANTITY` 543; `CN  AMOUNT` Rs 36,45,252; `SETTLEMENT DIFFERENCE` Rs 29,17,725.
- `DN TYPE` is blank on 81 rows; `DAMAGE GOODS CLAIM` 74; `GOODS RETURN ` 60. `BRAND NAME` is filled on 1 row and `SEASON` on none. `CLAIM STATUS`: `PENDING` 106, `RECEIVED` 105, `SHORT RECEIVED` 2, `RESOLVED` 2. `CN NUMBER` on 108 rows (mixed forms: `SR/n`, `GRn`, `SB/…`, `CN/…`, numbers). `CN COPY` filled on 8 rows only. `DN COPY` is filled on 212 rows (file name with a Drive link).
- `DN NUMBER` is `25-26/WH/PR-nn` on 211 rows (PR stands for purchase return; WH for warehouse (guess)) and other forms on 4.
- `REMARKS`: `DONE` 93, `DEFECTIVE` 8, `DONE-PARTY LEDGER CHECK` 3, plus notes such as "speak to party", "final checked", a CN received in one entity's ledger and not the other, stock sent to another party who billed back.
- Quirks: three CN dates fall in Dec 2026 (after the file date); `SETTLEMENT DIFFERENCE` is a formula (`DN AMOUNT` − `CN  AMOUNT`) with 7 negative values; the first six `CN  QUANTITY` cells hold "-".

**`KDPS CN & DN SHEET-BRAND`** (same 18 columns, tagged `BRAND`)
- 130 debit notes over 11 parties, 4 Apr 2025 to 18 May 2026. Parties by rows: Vishal Marketing 40, Jain Adishwar Hosiery Works 27, D D Sales Co 18, Aditya Birla Fashion Ltd 16, D Apparel 9, Shring Apparels 8, Aditya Birla Lifestyle Brands Limited 5, Hyphen Garments Pvt Ltd 2 and others. Cached header totals: `DN QUANTITY` 8,022; `DN AMOUNT` Rs 1,74,34,268.77; `CN  QUANTITY` 1,175; `CN  AMOUNT` Rs 45,46,367; `SETTLEMENT DIFFERENCE` shows `#VALUE!` (one DN amount is the text `4,46,395`).
- `CN NUMBER` on 28 rows (`SR/n`, `HPNSC…`, strings of slashes). `CLAIM STATUS`: `PENDING` 102, `RECEIVED` 26, `SHORT RECEIVED` 2. `DN TYPE` is `GOODS RETURN ` on 22 rows and blank on 108. `DN NUMBER` is blank on 9 rows. The last CN date is 2 Jul 2026 (after the file date).
- Remarks include `DONE` 26, `DEFECTIVE` 3, `STOCK CORRECTION` 3 and one note that only 7 of 20 returned pieces were debited.

**`2025-26-SUMMARY`** and **`2026-27-SUMMARY`**
- Columns `A` to `D`, header row 1: `Date`, `Invoice No`, `Party Name`, `Bill Amount`. The `Invoice No` is the debit note number (`25-26/WH/PR-n`, `26-27/WH/PR-n`).
- `2025-26-SUMMARY`: 369 rows, Rs 3,48,50,036, 106 parties, numbers 1 to 375 with 6 missing (167, 168, 201, 272, 285, 299). `2026-27-SUMMARY`: 104 rows, Rs 45,79,814, 51 parties, numbers 1 to 105 with 31 missing, last date 15 Jun 2026.
- `Date` mixes real dates (112 and 26 rows) and text such as "13-05-2026" and "15-06-26". Day and month are swapped in the real dates (a note numbered PR-2 of 2026-27 shows 4 Jun; the software lines show 6 Apr). Dates run into Dec 2026 as a result.

**`2025-26_SOFTWARE`** and **`2026-27_SOFTWARE`** (hidden)
- Header row 1, columns B to R (column A is blank): `Bill Date`, `Bill No`, `Party`, `GSTIN`, `Item`, `Brand`, `Size`, `Design No`, `Barcode`, `HSN`, `Qty`, `Rate`, `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount`, `Bill Amount`. A totals row sits at the bottom.
- These are the item lines of the debit notes (Supplier returns), exported from the accounting or billing software: `Bill No` is the supplier bill returned against; `Party` is the supplier. In 2026-27 the per-date, per-party `Net Amount` sums match the `Bill Amount` in `2026-27-SUMMARY` (checked for the first eight notes). `Net Amount` is `Gross Amt` plus GST: the ratios are 1.05, 1.12 and 1.18.
- `2025-26_SOFTWARE`: 14,135 lines, 4 Apr 2025 to 31 Mar 2026, 1,217 bills, 109 parties, 281 brands, 19,235 pieces, gross Rs 3,26,48,266, net Rs 3,60,42,066. `2026-27_SOFTWARE`: 2,291 lines, 4 Apr to 25 May 2026, 260 bills, 42 parties, 71 brands (4 lines have none), 2,705 pieces, gross Rs 38,03,077, net Rs 40,53,357.
- `Disc%` and `Disc Amt` are 0 on every line. `Barcode` and `HSN` are numbers (a float) with some text; barcodes are 13-digit on 89% (2025-26) and 81% (2026-27) of lines and otherwise 5 to 10 digits (internal codes). `GSTIN` is filled on nearly all lines (supplier tax numbers; not copied). `Bill No` is mostly text, with some numbers and one date. `Size` is mixed text and numbers.

- **Sensitive.** Party GSTINs, claim amounts, a staff name in a remark.
- **Notes.** [purchases-and-supplier-notes.md](../data-notes/purchases-and-supplier-notes.md). The Supplier return and claim flow is in [prd.md](../prd.md) (Offers, prices and supplier returns).

### `report-offer.md`

- **What it is.** An English translation of a call (about 19 Jun 2026) about the dummy Blackberry and Mufti offer report: offers applied from the AMM list at the best percentage; wish to club sales across days for the best benefit; refresh weekly or fortnightly.
- **Made by.** The ERP team, from audio. The file has no date or author. It is 96 lines (3,190 bytes) of Markdown, opens with a phone on-hold message, and labels three speakers (`Speaker 1`, `Speaker 2`, `Speaker 3`). The labels may not be reliable.
- **Who is named.** People are addressed by short names and initials. They are not copied here.
- **Quirks.** A transcription of speech: repeated words, "Hmm", and numbers spoken in round figures.
- **Sensitive.** None.
- **Notes.** [offers-and-brand-reports.md](../data-notes/offers-and-brand-reports.md).

## Open questions

Full list: [open-questions.md](../data-notes/open-questions.md).

- What are `TEN`, `VENUE` and `DB` in the invoice statuses, and which system produced the `SOFTWARE` sheets? Owner: KDPS Owner, Accounts. Blocks stage 2 (goods-in) imports.
- Why is the `P RATE` multiplier 1.2 in some work sheets and 1.1 in others? The PRD defines `P RATE` as the approved cost at receipt; the costing profile that sets it is not signed. Owner: Accounts, CA. Blocks stage 1 costing configuration.
- Are the input and output tax formulas in the PT sheets (5 or 18, cut-offs 2500 and 2625) correct? Owner: CA. Blocks the tax-rule records (stage 1).
- What do `ATV`, `GWP`, `EOSS` and `FRESH` mean exactly, and how do offers combine? Owner: KDPS Owner (the brand owns each offer's terms). Blocks the offer rules.
- Which balance is true for a party: `SUMMARY`, `INVOICE DETAILS.` or Tally? Owner: Accounts. Blocks payables opening data.
- What does the legal-entity column `FRENCHEEZI` mean, and which Stores belong to `OM GANPATI ENTERPRISES`? Owner: KDPS Owner, CA. Blocks the entity-to-Store mapping.
- Are the day and month swaps in the debit-note summaries a typing habit, and which date is right? Owner: Accounts.
- Who owns each person's PT work sheet, and does each map to a Store or a role? Owner: KDPS Owner.
