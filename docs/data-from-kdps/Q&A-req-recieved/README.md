# Q&A-req-recieved

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [data-from-kdps](../README.md)

## What this folder is

KDPS's answers to the ERP team's first data request. The request was a checklist of 13 items dated 11 Jun 2026 (`MOM_S.xlsx`). KDPS staff named in it as data providers are Priyo and Debanjan. The answers were saved on 12 and 13 Jun 2026 (file dates); the PT files inside `PT FILE/` are older (Dec 2025 to Apr 2026) because they are real supplier files that KDPS had received. The folder name keeps the spelling "recieved".

It holds five spreadsheets and two sub-folders:

| Item | What it is | Section |
| --- | --- | --- |
| `MOM_S.xlsx` | The 13-line request checklist, with provider and status | below |
| `LIST OF ALL STORES.xlsx` | The 17 Stores and the warehouse that use the earlier software | below |
| `SOH REPORT FORMAT.xlsx` | A sample stock-on-hand (SOH) report, 22,387 barcode rows | below |
| `SALE REPORT FORMAT.xlsx` | A sample sales report, 21 bills of one Store on 12 and 13 Jun 2026 | below |
| `SUPPLIER BRAND DETAILS.xlsx` | Brand to supplier map (1,163 brands) and a barcode flag per supplier | below |
| `PT FILE/` | 33 supplier price-ticket (PT) files | [PT FILE](PT%20FILE/README.md) |
| `BRAND OFFERS/` | Brand offers: a spreadsheet and email screenshots | [BRAND OFFERS](BRAND%20OFFERS/README.md) |

Hidden files: `.DS_Store` (macOS) and a `.claude/` folder of tool state. They are not data.

Words follow the PRD: Store, Site, MBO and EBO, PT (price ticket), SOH (a comparison source, never physical verification), Supplier. The earlier POS is the system the Stores use today (`PRD-LIF-014`: side-by-side test imports never create, reduce or move stock).

Data notes that cover this folder: [stores-and-codes.md](../../data-notes/stores-and-codes.md), [pos-exports.md](../../data-notes/pos-exports.md), [item-master-vocabulary.md](../../data-notes/item-master-vocabulary.md), [purchases-and-supplier-notes.md](../../data-notes/purchases-and-supplier-notes.md), [offers-and-brand-reports.md](../../data-notes/offers-and-brand-reports.md), [pt-file-layouts.md](../../data-notes/pt-file-layouts.md) and [access-and-store-asks.md](../../data-notes/access-and-store-asks.md).

## Files

### `MOM_S.xlsx`

- What it is: a data-request checklist, not minutes of a meeting. "MOM" probably stands for minutes of meeting (guess); the sheet is the list of items agreed at a meeting and who provides each. File saved 13 Jun 2026 03:52. It has no document properties and looks like a Google Sheets export (inferred).
- Format: `.xlsx`, two sheets: `11.6.26` and `USERS`. Sheet `11.6.26` is the date 11 Jun 2026 written as a sheet name.
- Sheet `11.6.26`: 13 data rows (rows 2 to 14). Header row 1 has three names: `SR NO.`, `REQUIREMENT LIST`, `PROVIDER`. Column D (status) and column E (note) have no header. The sheet's dimension is A1:Z1000 (blank formatted cells).
- Sheet `USERS`: completely empty (one blank cell). The users, roles and privileges list that item 13 asks for is not in the file.
- Providers named in the file (KDPS staff; first names only): Priyo (10 items) and Debanjan (3 items). Statuses: DONE 9, EXPLAINED 1, PROCESSED 1, blank 2.

Every line as written (spelling kept):

| SR NO. | Requirement | Provider | Status (col D) | Note (col E) | What this folder holds for it |
| --- | --- | --- | --- | --- | --- |
| 1 | `BRAND NAME LIST` | PRIYO | DONE | | The brand names are in `SUPPLIER BRAND DETAILS.xlsx`, sheet `BRAND` (inferred; no separate brand file) |
| 2 | `BRAND MARGIN` | PRIYO | DONE | | No brand-margin file in this folder |
| 3 | `LAST MONTHS BRAND OFFERS` | PRIYO | DONE | `MADURA PENDING` | `BRAND OFFERS/BRAND OFFERS.xlsx` (non-Madura brands) and the Madura email screenshots in the four brand sub-folders |
| 4 | `SUPPLIER LIST` | PRIYO | DONE | | `SUPPLIER BRAND DETAILS.xlsx` (inferred) |
| 5 | `SUPPLIER LIST WITH BRAND` | PRIYO | DONE | | `SUPPLIER BRAND DETAILS.xlsx`, sheet `BRAND` |
| 6 | `BRAND PT FILE` | PRIYO | DONE | | `PT FILE/` (33 files) |
| 7 | `WH TO STORE TRANSFER FORMAT` | DEBANJAN | EXPLAINED | | No file here. "Explained" suggests it was given by explanation (inferred). See [transfer-data](../transfer-data/README.md) for transfer files KDPS sent separately (whether they match this item is not stated) |
| 8 | `TEN SOFTWARE API WITH DOCUMANTATION` | PRIYO | PROCESSED | `MEETING DONE` | No document here. "TEN" is not explained; the accounting workbook `KDPS INVOICE & OFFER DETAILS..xlsx` has a column `TEN Uploaded Date`, so TEN is probably the accounting software (Tally?) (guess) |
| 9 | `BANK API AND DOCUMANTATION` | PRIYO | | `MEETING DONE` | No document here |
| 10 | `SALE REPORT FORMAT` | DEBANJAN | DONE | | `SALE REPORT FORMAT.xlsx` |
| 11 | `SOH REPORT FORMAT` | DEBANJAN | DONE | | `SOH REPORT FORMAT.xlsx` |
| 12 | `LIST OF ALL STORE USING SOFTWARE` | PRIYO | DONE | | `LIST OF ALL STORES.xlsx` |
| 13 | `COMPLETE LIST OF PROBABLE SOFTWARE USERS AND THEIR PRIVILAGES` | PRIYO | | | Not received here. Sheet `USERS` is empty. See [store-requirements-users](../store-requirements-users/README.md) for the separate folder on users and Store asks (whether it answers item 13 is not stated) |

- Quirks: typos in the requirement text (`DOCUMANTATION`, `PRIVILAGES`); two statuses are missing (items 9 and 13); item 7 says "explained" rather than "done".
- Sensitive content: none.
- Covered in: [access-and-store-asks.md](../../data-notes/access-and-store-asks.md) and [stores-and-codes.md](../../data-notes/stores-and-codes.md).

### `LIST OF ALL STORES.xlsx`

- What it is: KDPS's list of the Stores that use the earlier software, with two yes/no flags. Probably a Google Sheets export (no document properties) (inferred). File saved 13 Jun 2026 00:17.
- Sheet `STORE LIST` (one sheet). 17 data rows (rows 2 to 18). Header: `SL NO`, `STORE NAME`, `LOCATION`, `EMAIL`, `CLOUD`, `RETAIL JI`. The sheet's dimension is A1:Z984 (blank formatted cells). `SL NO` is stored as a number (1.0 to 17.0).
- Every row (email addresses are present on rows 1 to 13 and not copied; rows 14 to 17 have none):

| SL NO | STORE NAME | LOCATION | CLOUD | RETAIL JI |
| --- | --- | --- | --- | --- |
| 1 | VAISHNAVI | BHAGALPUR | YES | |
| 2 | VAISHNAVI | KAHELGAON | YES | |
| 3 | MBO | SAHEBGUNJ | YES | |
| 4 | MBO | DUMKA | YES | |
| 5 | MBO | BOKARO | YES | |
| 6 | VAISHNAVI | SINGH MORE | YES | |
| 7 | JAINSONS-LIFESTYLE | HAZARIBAGH | YES | |
| 8 | VAISHNAVI | DEOGARH | YES | |
| 9 | LEE | DEOGARH | YES | |
| 10 | ALLEN SOLLY | DEOGARH | YES | |
| 11 | SPYKAR | DEOGARH | NO | YES |
| 12 | VAISHNAVI | BANKA | | |
| 13 | JOCKEY | BANKA | YES | YES |
| 14 | MBO | GAYA | YES | YES |
| 15 | PETER ENGLAND | KANKARBAGH | NO | YES |
| 16 | MBO | KANKARBAGH | NO | YES |
| 17 | WAREHOUSE | RANCHI | YES | YES |

- Counts: `VAISHNAVI` 5 rows, `MBO` 5 rows, single names 6 (JAINSONS-LIFESTYLE, LEE, ALLEN SOLLY, SPYKAR, JOCKEY, PETER ENGLAND), `WAREHOUSE` 1. Towns with several rows: Deogarh 4 (Vaishnavi, Lee, Allen Solly, Spykar), Banka 2, Kankarbagh 2.
- Flags: `CLOUD` is YES on 13 rows, NO on 3 (Spykar Deogarh, Peter England Kankarbagh, MBO Kankarbagh) and blank on 1 (Vaishnavi Banka). `RETAIL JI` is YES on 6 rows (rows 11 and 13 to 17) and blank on the rest. The file does not say what either flag means. `RETAIL JI` is probably the name of a POS product (guess). All three `CLOUD` = NO rows have `RETAIL JI` = YES.
- Names: `STORE NAME` is a format or brand name, not a unique Store name. Uniqueness needs name plus town. `MBO` is the PRD word for a multi-brand outlet. Single-brand names (Lee, Allen Solly, Spykar, Jockey, Peter England) look like EBOs (exclusive-brand outlets), and `VAISHNAVI` looks like a family or ethnic wear format (the sales sample, probably from Vaishnavi Singh More, holds sarees, petticoats and kidswear) (inferred). The file does not classify the Stores.
- Missing: no Store code, address, GST registration, Store type, manager, opening date or legal entity. Four rows have no email. The spelling "Deogarh" in the names differs from the email IDs, which spell it differently. Which towns are in Bihar or Jharkhand, and whether they sit under different GST registrations, is not in the file.
- Links: the Madura April 2026 billing extract names nine KDPS sold-to accounts by city: Deogarh, Hazaribag, Banka, Bodh Gaya, Sahibganj, Ranchi (two codes), Bokaro and Dumka (see [PT FILE](PT%20FILE/README.md)). The supplier PT files carry Site codes such as `KDPS-HZB-MF`. The Hazaribagh bill series (`JSL`) appears in the exports described in [store-analysis](../store-analysis/README.md).
- Sensitive content: one email address per Store (13 present). Not copied.
- Covered in: [stores-and-codes.md](../../data-notes/stores-and-codes.md).

### `SOH REPORT FORMAT.xlsx`

- What it is: a sample stock-on-hand movement report from the earlier POS, one row per barcode. KDPS (Debanjan) sent it as the layout for the SOH import (`MOM_S.xlsx` item 11). The file's author property names the same person (first name only). Created and saved 13 Jun 2026 (Excel). 2,417,141 bytes.
- Which Store and which dates it covers: not stated. There is no Store column, date range or title. The software name is not stated either.
- Format: `.xlsx`, one sheet `Sheet1`, 24 columns (A to X), 22,389 rows: header row 1, 22,387 data rows (rows 2 to 22388) and one unlabelled totals row (row 22389). Column A is empty.

| Col | Header | Filled | Content and notes |
| --- | --- | --- | --- |
| B | `Item Name` | 22,385 | 135 distinct (SHIRT 2,911; T-SHIRT 2,134; JEANS 1,886; SAREE 1,761; SET 1,302; KURTI SET 1,296; TOP 1,060; BABA SUIT 994; JACKET 925; KURTI 651). Near duplicates such as SAREE and SAREES, TROUSER and TROUSERS, SWEAT SHIRT and SWEATSHIRT |
| C | `Brand` | 22,387 | 778 distinct values. One row holds the number `125` as the brand |
| D | `Color` | 22,387 | 380 distinct. Reused for other things: PREMIUM 6,237; ASSO. 3,799; MEDIUM 2,647; NA 1,482; `.` 990; ECONOMY 696; WORK 458. Real colours follow (BLACK 417, WHITE 359, NAVY 299). 488 cells are numbers (1, 2, 3 ...) |
| E | `Size` | 22,137 | 178 distinct; 250 blank. FREE SIZE 2,746; FS 1,827; L 1,735; XL 1,557; M 1,536; XXL 796; numbers (40, 38, 32 ...) 9,213 cells; also `NA`, `.`, age ranges such as `2-4 Y` and `10-11Y`, and dimension text such as `274 X 274 CM` |
| F | `Supplier` | 22,367 | 258 distinct; 20 blank |
| G | `Barcode` | 22,387 | All 22,387 values are different. 20,532 are stored as numbers and 1,855 as text |
| H | `Design No` | 22,387 | 9,161 distinct. 97 cells were auto-converted to dates (for example a year 3106) |
| I | `Category` | 22,368 | 187 distinct; 19 blank. Words (CASUAL WEAR 4,146; SEASONAL WEAR 1,881; FORMAL WEAR 1,430; PARTY WEAR 1,003) and codes (USE 965, SETM 830, USM 777, SETE 777, LJM 621, UTE 603 ...) |
| J | `Gender` | 22,387 | 24 spellings (below) |
| K | `Fit` | 22,387 | 48 distinct. LM 7,492; REGULAR 3,845; MM 3,430; FREE FIT 2,362; SLIM 1,936; VLM 1,062; also SILK SAREE, HM, `MM A`, REGULER, REGULLAR, a spelling with a non-breaking space, and 49 numeric zeros. Fit holds sleeve and fabric words too (FULL SHIRT, HALF SLEEVE, ROUND NECK) |
| L | `Season` | 20,314 | 95 distinct text values, 7,135 cells that are dates and one number (4). 2,073 blank. See below |
| M | `Op Qty` | 20,282 | Opening quantity. 9,842 rows are non-zero. Sum 18,462 |
| N | `Purchase` | 0 | Empty on every data row. The totals row shows 0 |
| O | `Sale` | 1,766 | Stored as negatives. Sum -2,779. 4 rows hold a positive value (1, 1, 2, 1; probably returns netted in this column, guess) |
| P | `Adjustment` | 0 | Empty. Totals row 0 |
| Q | `Sl Ret` | 0 | Empty. Totals row 0. Probably sales return (guess) |
| R | `St Trf` | 1,390 | Stored as negatives. Sum -2,805. Probably stock transferred out (guess) |
| S | `Stf Reciept` | 2,349 | Positive. Sum +4,737. Probably stock transfer received (guess); the header is misspelled |
| T | `Pur Ret` | 0 | Empty. Totals row 0 |
| U | `Tqty` | 22,387 | Closing quantity. Sum 17,615. 9,985 rows are above zero and 12,402 are zero. None is negative |
| V | `Mrp` | 22,387 | MRP. One row has 0 |
| W | `Rate` | 22,387 | Probably a purchase or cost rate (guess): the median is about 65% of MRP. Above MRP on 47 rows |
| X | `Amount` | 22,387 | `Tqty` times `Rate`. Within a few paise on every row (9 rows differ by 1 to 4 paise from rounding) |

- The movement identity holds on every row: `Op Qty` + `Purchase` + `Sale` + `Adjustment` + `Sl Ret` + `St Trf` + `Stf Reciept` + `Pur Ret` = `Tqty`. No row breaks it.
- Totals row (row 22389, no label): `Op Qty` 18,462; `Purchase` 0; `Sale` -2,779; `Adjustment` 0; `Sl Ret` 0; `St Trf` -2,805; `Stf Reciept` +4,737; `Pur Ret` 0; `Tqty` 17,615; `Amount` Rs 1,70,00,216.02 (about Rs 1.70 crore). Valued at MRP the 17,615 pieces come to Rs 2,76,44,725 (about Rs 2.76 crore). The totals row has no totals for `Mrp` or `Rate`.
- Brands: the largest by rows are PETER ENGLAND 1,429, KILLER 1,001, ALLEN SOLLY 831, SPYKAR 679, OXEMBERG 539, ZOLA 530, CROSS COLOR 516, DEAL 423, KIDCITY 420. The largest by closing pieces are KIDCITY 685, OXEMBERG 579, PETER ENGLAND 573, PMS 551, BANJARAN 474, VIMAL 404, SHAKTI 388, ZOLA 377, JOCKEY 367. Brand aliases exist (ALLEN SOLLY, AS and ALLEN SOLLY WOMENS; `V SPYKAR`, `V SPY`, `V ARROW`, `V KILLER` next to SPYKAR, ARROW, KILLER).
- Suppliers: SSS 3,118 rows; VISHAL MARKETING 1,511; ADITYA BIRLA LIFESTYLE BRANDS LIMITED 1,425; D D SALES CO 975; `KDPS LIFESTYLE PVT LTD (DEOGHAR)` 876; P M SONS 800; SARAOGI SUPER SALES 775; VARIETY TEXTILE 717; ADITYA BIRLA FASHION LTD 654; SIYARAM SILK MILLS LTD 593; SHREE EMPORIUM 593; MALHOTRA MARKETING 516. KDPS appears as its own supplier under three spellings (876 + 58 + 4 = 938 rows), probably own or transferred stock (guess).
- Gender spellings (24): FEMALE 7,924; MALE 7,703; KIDSM 1,747; KIDS MALE 1,713; KIDS FEMALE 1,341; KIDSF 1,122; UNISEX 213; KIDM 198; `.` 108; ACCE 85; KIDS 59; Female 39; FEAMLE 38; FMALE 29; FEMALE KIDS 13; FEAMAL 12; Male 10; PROMO 10; KIDEM 9; ASSC. 9; NA 2; CARRY BAG 1; FMAMLE 1; MIX 1.
- Season: 7,135 cells (32%) are real dates because the spreadsheet seems to have turned a text such as `Oct-24` into a date (inferred; the dates run from 4 Jan 2022 to 24 Dec 2026). The text forms are `SPRING SUMMER(Feb-26)` (1,759), `AW-24` (1,653), `SPRING SUMMER(Mar-26)` (1,409), `AUTUMN WINTER(Oct-25)` (1,245), `AUTUMN WINTER(Aug-25)` (1,072), `AUTUMN WINTER(Sep-25)` (950), `SPRING SUMMER(Apr-26)` (851), `AUTUMN WINTER(Nov-25)` (734), `SS25` (552), `AW24` (523), `SS-25` (434), `SPRING SUMMER(May-26)` (413) and many more; also text dates such as `28-04-2025` (38), `N/A` (25) and `CORE FASHION` (8).
- Barcodes: 10,726 are seven characters (10,436 of them start with 1: internal codes). 8,386 are 13 digits (7,003 start with 890; 7,965 pass the EAN-13 check digit). 524 are 15 characters (for example Zola). Lengths run from 5 to 15. 1,855 are stored as text, including 13 that start with 0 (leading zeros are at risk when stored as numbers).
- Quality: season is mixed; colour, size, fit and category columns are reused as other fields; gender has 24 spellings; brand, supplier and item names have spelling variants; 20 rows have no supplier, 250 no size, 19 no category, 2 no item name; Rate is above MRP on 47 rows; 2,105 rows have no `Op Qty`; four whole columns are empty.
- Sensitive content: `Rate` is probably the purchase cost, so this file shows cost data. No customer data.
- Use: the layout for the SOH import in the side-by-side test (Stage 2, comparison only, `PRD-LIF-014`); it also shows the item and SKU master clean-up that is needed (Stage 1).
- Covered in: [pos-exports.md](../../data-notes/pos-exports.md), [item-master-vocabulary.md](../../data-notes/item-master-vocabulary.md).

### `SALE REPORT FORMAT.xlsx`

- What it is: a sample bill-line sales report from the earlier POS for one Store (`MOM_S.xlsx` item 10, provider Debanjan). Created 13 Jun 2026 (Excel), 17,772 bytes. The Store is not named. The bill numbers start `26-27/SGMR/`, so the series is the financial year 2026-27, Store code `SGMR`, then a serial. `SGMR` is probably the Vaishnavi Singh More Store (guess).
- Format: `.xlsx`, one sheet `Sheet1`, columns A to Z (A empty), header in row 1: `Bill Date`, `Bill No`, `Customer`, `Phone`, `Item`, `Brand`, `Color`, `Size`, `Design No`, `Barcode`, `SalesMan`, `Sub Category`, `Gender`, `Fit`, `season` (lower case), `Qty`, `Rate`, `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount`, `Bill Amount`, `Cash`, `Card`, `Credit`.
- Rows: 59. Row 1 is the header. Rows 2 to 55 are 54 bill lines. Row 56 is a totals row. Row 57 holds only a customer name (a stray row). Row 58 is blank. Row 59 repeats the totals row. Totals: `Qty` 56, `Gross Amt` 54,463, `Disc Amt` -1,145.5, `Net Amount` 53,317.5, `Bill Amount` 53,317, `Cash` 28,850, `Card` 24,467 (no Credit total is printed).
- Period: 20 bills on 12 Jun 2026 and 1 bill on 13 Jun 2026. Bill numbers run `1263` to `1283`: 21 bills, no gaps.
- Row meaning:
  - Bill-level fields appear only on a bill's first line: `Bill Date`, `Bill No`, `Customer`, `Phone`, `Sub Category`, `Bill Amount`, `Cash`, `Card`, `Credit`. `Sub Category` is therefore filled on only 21 of 54 lines.
  - Line-level fields repeat on every line: item, brand, colour, size, design, barcode, `SalesMan`, gender, fit, season, `Qty`, `Rate`, `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount`.
  - `Bill Amount` is the sum of the bill's `Net Amount`, rounded to the rupee, and equals `Cash` + `Card` + `Credit` on all 21 bills. Three bills round: 1268 (894.1 to 894), 1271 (1,759.2 to 1,759) and 1281 (479.2 to 479).
- Lines per bill: 1 line on 9 bills, 2 on 5, 3 on 1, 4 on 2, 5 on 2, 6 on 1, 8 on 1. The largest bill (1266) has 8 lines and 15 pieces (seven petticoats). 56 pieces net (59 sold, 3 returned).
- Tenders: 12 bills card only, 8 cash only, 1 split (bill 1267: cash 1,500 and card 198). `Credit` is 0 on every bill. No UPI or other tender appears.
- Returns: 3 lines have negative `Qty` inside bills that also sell: a set at 2,849 on bill 1268, and a top at 1,030 and a top at 999 on bill 1280 (that bill nets to 268).
- Discounts: only 3 lines carry `Disc%` (20, 20 and 10). Nine lines carry a negative `Disc Amt`. Six of them have no percentage; four bring the line to a round net (1,049 to 1,000; 2,498 to 2,400; 2,199 to 2,100; 5,899 to 5,780). That is a manual price change at the counter (inferred).
- Goods: sarees (14 lines), petticoats (9), tops (7), T-shirts (7), baba suits (4), frocks (3), sets (2), and one line each of bra, dresses, jeans, stole, dupatta, kurti set, bedsheet, sarees. Gender: FEMALE 36 lines, KIDS MALE 7, KIDS FEMALE 6, KIDSF 2, MALE 2, UNISEX 1. 28 brands: AMBRELI, BANJARAN, CITY MAGIC N, FW, GIRLLY, JAIBHARAT, JOCKEY, JULAHAA, KAYAAN, KIDCITY, KIDOZ, KODAK, LITTLE GIRL, MAXZONE, NEEL MADHAV, P KIDS, PMS, PRM, RAJSHREE, SAGUN, SATYAM, SHAKTI, SMAG, SURBHI, VIMAL, WELSPUN, WONDERS, ZOLA. Several of these brands have supplier PT files in `PT FILE/` (BANJARAN, AMBRELI, KIDCITY, JOCKEY).
- Barcodes: 43 of the 54 are seven characters (internal), 5 are 13 digits, 2 are 15 characters, and one each is 6, 8, 10 and 12 characters. One has a letter prefix (`P...`).
- Season: 7 of 54 lines have a real date in `season` (the same spreadsheet damage as in the SOH file); 2 are blank.
- `SalesMan`: present on every line, 5 different values. `Customer` and `Phone` are present on every bill's first line (21 of 21); the phone is stored as a number.
- Sensitive content: customer names (most end in "JI"), 10-digit phone numbers on every bill, and salesman first names. None is copied. A copy for the development setup needs masking.
- Use: the layout for the daily sales report import in the side-by-side test (comparison only), and a picture of what a counter bill holds: a bill series per Store and year, split tender, returns on a bill, a manual price change and a rupee round-off.
- Covered in: [pos-exports.md](../../data-notes/pos-exports.md).

### `SUPPLIER BRAND DETAILS.xlsx`

- What it is: KDPS's brand to supplier map and a barcode flag per supplier (`MOM_S.xlsx` items 4 and 5, provider Priyo). Created 13 Jun 2026 06:51 and saved 07:14 (Excel). The file properties name Debanjan as author, although the checklist names Priyo as provider (Debanjan may have prepared it). 2,644,550 bytes, almost all of it blank formatting.
- Sheet `BRAND`: header `Brand`, `Supplier`. The sheet dimension is A1:B151162 and the filter range A1:B135796, but the real data is rows 2 to 1,164, so 1,163 rows.
  - 1,163 distinct brands, each listed once; 281 distinct suppliers; 38 brands have no supplier.
  - One supplier per brand (no brand appears twice). Largest suppliers by number of brands: SSS 176, VARIETY TEXTILE 175, P M SONS 127, SHREE EMPORIUM 35, M R & COMPANY 29, OM GANPATI (DMK) 28, JAIN ADISHWAR HOSIERY WORKS 27, SARAOGI SUPER SALES 21, MADURA PVT LTD 20, SANSKAR RETAIL 20, VISHAL MARKETING 20, PLAZER FABRICS 17, BABULAL PREMKUMAR 16, PRAKASH TRADERS 13. These look like distributors or agents (guess).
  - 30 groups of brand names differ only in spacing or punctuation: `U. S. POLO INNERWEAR` / `US POLO INNERWEAR`; `K T` / `KT`; `LIFE STYLE` / `LIFESTYLE`; `V D` / `VD`; `BODY CARE` / `BODYCARE`; `BLACK BERRY` / `BLACKBERRY`; `U S POLO` / `U. S. POLO` / `US POLO`; `P M` / `PM`; `R MUSKAN` / `R.MUSKAN`; `S NAWAZ` / `S.NAWAZ`; `TINY TREE` / `TINYTREE`; `LA KRISHNA` / `LA-KRISHNA`; `GOT IT` / `GOTIT`; `JULAHAA- TANA BANA` / `JULAHAA-TANA BANA`; `LAXMI NX` / `LAXMINX`; `S C` / `SC`; `S F` / `SF`; `P KIDS` / `PKIDS`; `MAD BOYS` / `MADBOYS`; `W O E` / `WOE`; `OUT LOOK` / `OUTLOOK`; `NEEL MADH` / `NEELMADH`; `RUDHAVS HR` / `RUDHAVSHR`; `TALIB CRE` / `TALIB CRE.`; `JAI BHARAT` / `JAIBHARAT`; `HI CHOICE` / `HI-CHOICE`; `RUDHAVA HR` / `RUDHAVAHR`; `A JAYTEX` / `AJAYTEX`; `SPYKAR UNDER JEANS` / `SPYKAR UNDERJEANS`; `M A` / `MA`. Other brand variants exist that this check does not catch (`BLACKBERRY` and `BLACKBERRYS`, `KILLER`, `KILLER JUNIOR` and `JUNIOR KILLER`, `SWEET DREAM` and `SWEET DREAMS`, `STATUS QUO`, `STATU QUO` and `STATUS QOU`).
  - Madura group: 20 brand names map to MADURA PVT LTD: `PETER ENGLAND`, `VAN HEUSEN` and 18 two-letter codes (`LP`, `VH`, `VF`, `AK`, `AH`, `LY`, `LR`, `LA`, `VX`, `VD`, `VS`, `AS`, `AL`, `AT`, `LX`, `N`, `VW`, `PX`). The same codes are the brand codes in the Madura April billing extract and in the Louis Philippe and Van Heusen offer emails. `ALLEN SOLLY` (and its Women's and Junior names), `LOUIS PHILIPPE` and `VAN HEUSEN WOMENS` map to ADITYA BIRLA LIFESTYLE BRANDS LIMITED.
  - Brands used by the other files in this folder: `FLYING MACHINE`, `ARROW`, `SPYKAR`, `DEAL`, `FM` to VISHAL MARKETING; `JOCKEY`, `LEE`, `US POLO` to OM GANPATI (DMK); `KILLER` and `NEXTBIT` to D D SALES CO; `MUFTI` to SHRING APPARELS; `BLACKBERRY` to MOHAN CLOTHING COMPANY; `LINEN CLUB` and `LITTLE PINK` to B.K ENTERPRISES; `LIBAS` to TAYAL GARMENTS; `PARX` to AAYUSHMAN AGENCIES; `SWEET DREAMS` to DD APPAREL; `STATUS QUO` to D APPAREL; `TWILLS` to MN GARMENTS; `KIDCITY` to KIDCITY SOLUTIONS PVT. LTD.; `BANJARAN` to VINAYAK EMPORIUM PVT LTD; `AMBRELI` to OVERSEAS ENTERPRISES; `HYPHEN` to HYPHEN GARMENTS PVT LTD; `ZILU BOTTOMS` to FASHION MARKETING; `PEPPERMINT` to GEETANSHI APPARELS; `MINELLI` to SHUBH SHRI CLOTHING PRIVATE LIMITED; `DSY` to DS YUVRAAJ; `FAHRENHEIT` to INDTECH APPARELS PVT. LTD.; `BEEVEE` to SHARP TRADING CO.; `GOCOLORS` to EMPORIO SIDDHARTH SALES PRIVATE; `AMIDHARA` and `ANOKKHI` to SHRI SAI ENTERPRISES; `XERICS` to SNEHA ENTERPRISES.
- Sheet `BARCODE`: despite the name it holds no barcodes. Header `Barcode`, `Supplier`; 360 rows, one per supplier. The sheet dimension is A1:D361 but columns C and D are empty. `Barcode` holds `YES` (116) or `NO` (244).
  - It is probably a flag for whether the supplier delivers goods already carrying a barcode (guess; the file does not say). Fits that reading: YES for MADURA PVT LTD, both Aditya Birla names, VISHAL MARKETING, D D SALES CO, OM GANPATI (DMK), SARAOGI SUPER SALES, SANSKAR RETAIL, TAYAL GARMENTS, MALHOTRA MARKETING, SIYARAM SILK MILLS LTD and the suppliers of most PT files. NO for SSS, VARIETY TEXTILE, P M SONS, SHREE EMPORIUM, M R & COMPANY, PLAZER FABRICS, BABULAL PREMKUMAR, PRAKASH TRADERS, P.R. MODI & SONS TEXTILE PVT LTD and SNEHA ENTERPRISES (XERICS). In the SOH sample, 9,848 of the 10,726 seven-character barcodes sit on rows whose supplier is flagged NO, while 7,483 of the 8,386 13-digit barcodes sit on rows whose supplier is flagged YES (exact supplier-name match; rows whose supplier name is not in the sheet are left out of those two counts). So the flag fits "supplier delivers goods with a vendor barcode" (YES) against "KDPS prints its own seven-character barcode" (NO) (inferred).
  - All 281 suppliers of the `BRAND` sheet appear here (82 YES, 199 NO). 79 suppliers appear only here (34 YES, 45 NO). Brand rows by flag: 291 rows have a YES supplier, 834 a NO supplier, 38 no supplier.
  - Supplier name variants: `M.N GARMENTS` and `MN GARMENTS`; `D S CREATION` and `DS CREATION`; `D APPAREL` and `DD APPAREL`; `D D DEVELOPPER` (Jockey's PT file names a "D D Developers" party). The Madura group has three names: MADURA PVT LTD, ADITYA BIRLA FASHION LTD, ADITYA BIRLA LIFESTYLE BRANDS LIMITED.
- Cross-check with the SOH sample (exact text match, no alias handling, so it overstates the differences): 24 of the 778 SOH brands are not in the map (for example `V SPYKAR`, `V SPY`, `V U. S. POLO`, `V ARROW`, `V KILLER`, `JUST PINK`, `P.M.SONS`, `FASHION STUDIO`, `MURARKA`, `DESI BELLE`); 409 map brands are not in the SOH sample; of 22,147 SOH rows whose brand is in the map and whose supplier is filled, 5,384 (24%) name a different supplier from the map. Peter England maps to MADURA PVT LTD but its SOH rows show three supplier names (ADITYA BIRLA FASHION LTD 654, ADITYA BIRLA LIFESTYLE BRANDS LIMITED 582, MADURA PVT LTD 193). Allen Solly maps to the Aditya Birla Lifestyle name (813 SOH rows) but 14 SOH rows show MADURA PVT LTD and 4 show KDPS as supplier.
- Sensitive content: none (business names only).
- Use: seeds the brand and Supplier masters (Stage 1). It shows that brand to supplier changes over time and that Supplier legal names need alias and merge handling.
- Covered in: [item-master-vocabulary.md](../../data-notes/item-master-vocabulary.md), [purchases-and-supplier-notes.md](../../data-notes/purchases-and-supplier-notes.md).

## Subfolders

- [PT FILE](PT%20FILE/README.md): 33 supplier PT files, one block per file, layout families and the common field set.
- [BRAND OFFERS](BRAND%20OFFERS/README.md): `BRAND OFFERS.xlsx` sheet by sheet, three Allen Solly PNG crops, and four brand folders:
  - [ALLEN SOLLY](BRAND%20OFFERS/ALLEN%20SOLLY/README.md)
  - [LOUIS PHILLIPE](BRAND%20OFFERS/LOUIS%20PHILLIPE/README.md)
  - [PETER ENGLAND](BRAND%20OFFERS/PETER%20ENGLAND/README.md) (`PE MAY.jpeg` is a copy of `LP MAY.jpeg`)
  - [VAN HEUSEN](BRAND%20OFFERS/VAN%20HEUSEN/README.md)

## Open questions

- KDPS Owner: which Store and which date range does the SOH sample cover, and is `Rate` the purchase cost? Blocks Stage 2 (goods-in: SOH import for the side-by-side test).
- KDPS Owner: what do the `CLOUD` and `RETAIL JI` flags mean, and which POS runs each Store today? Blocks Stage 1 (Site and Store master) and the switch plan.
- KDPS Owner or Accounts: please give each Store's code, address, legal entity and GST registration. Do the Bihar and Jharkhand Stores sit under different registrations? Blocks Stage 1.
- KDPS Owner: who are the software users and what may each do (`MOM_S.xlsx` item 13; sheet `USERS` is empty)? Blocks Stage 1 (roles and role assignments).
- KDPS Owner: are the brand margin file, the warehouse-to-Store transfer format and the accounting and bank API documents (items 2, 7, 8, 9) available as files? Blocks Stage 3 (transfers) and Stage 5 (Tally and bank).
- KDPS Owner: what does `BARCODE` = YES or NO per Supplier mean, and who prints tickets and barcodes for NO Suppliers? Blocks Stage 2.
- KDPS Owner or Accounts: which legal Supplier name applies to Peter England and Allen Solly (Madura, Aditya Birla Fashion or Aditya Birla Lifestyle), and is brand to Supplier one to one? Blocks Stage 1 (Supplier master).
- KDPS Owner: what does "KDPS LIFESTYLE PVT LTD (DEOGHAR)" as a supplier in the SOH sample stand for (own stock, a transfer)? Blocks Stage 2.
- Product owner: may the sales sample (with customer names and phones) be used in the development setup, or must it be masked first? Blocks Stage 2.
- Offers: see the open questions in [BRAND OFFERS](BRAND%20OFFERS/README.md). Supplier PT files: see [PT FILE](PT%20FILE/README.md).
