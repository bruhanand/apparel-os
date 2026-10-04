# Data quality and import rules

> **Not ranked.** These notes describe the data KDPS sent. They decide nothing. A PRD or policy change they lead to needs an entry in [decisions.md](../decisions.md) first. See [README.md](README.md).

## 1. What this note is

- Every data problem seen in the KDPS files, grouped, with where it was seen, how many times, and the import rule it implies.
- The GC-6 imports design (file intake, saved mappings, staging, review, publishing, duplicate control) is not written yet ([gaps-before-code.md](../reports/gaps-before-code.md)). These notes are input to it. A "Rule" line is a proposal for that design. None is decided.
- A rule that needs a business choice is marked **OPEN** with its owner and does not invent a value. A rule that follows from an existing PRD rule cites it.
- The layouts themselves are in [pos-exports.md](pos-exports.md) and [pos-export-layouts.json](pos-export-layouts.json). PT file layouts are in [pt-file-layouts.md](pt-file-layouts.md).
- Counts come from re-opening the files, except where a line says "survey": "survey" marks a figure taken from the first-pass read of the files (October 2026) and not counted again for this note. "(guess)" and "(inferred)" mark what the files do not state.
- Paths are under `docs/data-from-kdps/`. A bare file name means the one file of that name.
- Customer names, phones, salesperson names, tax numbers and bank details are not copied. Counts and column names only.
- The import rules rest on these PRD rules: `PRD-IMP-001` to `PRD-IMP-013` (imports), `PRD-LIF-010`, `PRD-LIF-013`, `PRD-LIF-014`, `PRD-LIF-016` (earlier-POS imports), `PRD-MER-005` to `PRD-MER-007` (unknown values, barcodes), `PRD-MOD-014`, `PRD-MOD-015` (paise, unknown is not zero) and `PRD-SEC-006`, `PRD-SEC-010`, `PRD-SEC-011`, `PRD-SEC-014` (restricted data, file validation).

Principles the rules share:

- Keep the original file, cell values and source words next to any normalised value (`PRD-IMP-002`, `PRD-IMP-003`).
- Refuse a row, or flag it for a person, instead of guessing (`PRD-IMP-007`, `PRD-IMP-009`).
- Show a validation report before anything is published (`PRD-IMP-005`). The report fields are in section 5.
- A side-by-side test import never creates or moves stock (`PRD-LIF-014`) and never makes a tax invoice (`PRD-LIF-016`).

## 2. File and container problems

**A-1. The extension lies, or the format is unusual**

- Seen: `Q&A-req-recieved/PT FILE/AS INNERWEAR.csv` is a binary `.xls` (sheet `INVOICE`). `TWILLS.xls` is an `.xlsx`. `Madura Fashion Brand AS - VH - LP.xlsb` is binary xlsx. `Peter England.CSV` is a true CSV with space-padded fields (53 columns, header names padded too). `USPOLO INNER WEAR.csv` is a true CSV with no header row (56 columns, 14 rows). `FAHRENHEIT 60518.xls` has a damaged container header (survey). `JOCKEY-NARAYANI.xls` is 1.5 MB for 31 rows (survey).
- Rule: read the content, not the extension. Report the real format. Accept XLSX, XLS, XLSB and CSV (`PRD-IMP-001`). Trim padded fields and header names for matching and keep the original text (`PRD-IMP-002`). A damaged file is reported as unreadable with its error, never skipped silently (`PRD-IMP-007`, `PRD-SEC-011`).

**A-2. The header is not in row 1, or sits behind a title block**

- Seen: brand vouchers (three merged title rows, header on row 4; Mufti header on row 3); `KDPS-DIRECTION.xlsx` (header row 4); the Singh More DSR (header row 3, with a subtotal row and a message row above); `KDPS PT FILE SHEET.xlsx` and the `INVOICE DETAILS.` sheet (header row 2, totals in row 1); `ARVIND ALL BRAND & SPYKAR_PT.xlsx` (header row 5, title merged across `A1:AE4`); the Jockey `.xls` files (header row 9); `AS INNERWEAR.csv` (header row 16, letterhead above); `ambreli 1855.xls` (two-row header on rows 24 and 25).
- Rule: the saved layout records the header row and the column names. Detect a layout by the names it finds, not by cell letters (`PRD-IMP-004`). A two-row header needs an explicit mapping. Merged title text is not data.

**A-3. A leading blank column**

- Seen: column A is empty and names start in B in the 25-column sales files except the Hazaribagh ones (Vaishnavi Deoghar, `jsl/`, Sanskar, Allen Solly Deogarh, Singh More sample), the Banka sale sheet, both movement statements, and the debit-note `SOFTWARE` sheets.
- Rule: map by header name. The saved layout keeps a column offset only as a hint.

**A-4. Unlabelled columns**

- Seen: Bokaro `Sale` column N (a lookup result); voucher columns O to R; Bokaro `Stock` column H (empty); Vaishnavi SOH `Sheet2` column O (HSN-like codes on 41 rows); DSR `Stock In` columns A to F (pivot labels, blank); Dumka sale column I (`0` on every row); PT files with blank headers that hold cost, MRP, style, fit or GST (`kidcity 1316&1317.xlsx` col G, `XERICS JEANS PT FILE.xlsx` col H, `TWILLS.xls` col G, `ZILU BOTTOMS.xlsx`, `MUFTI.xlsx`, survey).
- Rule: never drop a column silently. A saved layout records an explicit choice for each unlabelled column: map it, or ignore it (`PRD-IMP-003`, `PRD-IMP-006`).

**A-5. Sheets with no header row**

- Seen: Dumka `AS-SALE`, `LP-SALE`, `VH-SALE` and `AS-SOH`, `LP-SOH`, `VH-SOH` (the first data row is where a header would be); `USPOLO INNER WEAR.csv`.
- Rule: a headerless sheet needs a positional mapping that a person confirms (`PRD-IMP-003`, `PRD-IMP-008`). Never treat the first data row as a header without that confirmation.

**A-6. Merged cells, title rows and repeated titles**

- Seen: PT files (`SWEET DREAMS.xlsx` repeats its title across cells; `KILLER JUNIOR.xlsx` merged title; Jockey `.xls` has 9 merged cells; `AS INNERWEAR.csv` 42; `ambreli 1855.xls` 46); brand vouchers (3 merged title cells per sheet); `KDPS INVOICE & OFFER DETAILS..xlsx` `OFFER DETAILS.` (13 merged ranges); `KDPS-DIRECTION.xlsx` (5).
- Rule: ignore text in merged title ranges. Take the vendor, brand and period from them only as claims shown to the reviewer (see B-8).

**A-7. Hidden sheets, hidden rows and active filters**

- Seen, hidden sheets: `CREDIT NOTE DATA SHEET`, `2025-26_SOFTWARE`, `2026-27_SOFTWARE` (debit-note workbook); `Arvind & LC Invoice Details.` (invoice workbook, plus hidden column M; hidden column N on `SUPPLIER DATA BASE`); `"Office" Work Sheet` and `"PRAVIN JI " Work Sheet` (PT workbook); `PACKING` in `ambreli 1855.xls`.
- Seen, hidden rows from a filter: Banka `sale report` 1,558 of 1,588 rows and `STOCK REPORT` 11,755 of 12,178 (filter on item and Van Heusen brand names); `AS SOH ` 7,410 of 10,372; Hazaribagh LP `Sheet1` 272 of 372 and `Sheet2` 5,008 of 5,596 (filter on the LP family); Dumka `AS-SALE` 24 rows and the three `SOH` sheets 288, 128 and 104 rows (zero stock); `OFFER DETAILS.` 95 rows; `kidcity 1316&1317.xlsx` 228 of 272 rows (filter on one invoice, so a reader of visible rows sees 44).
- Rule: read every row of every sheet, hidden or not. The staging preview shows hidden sheets, hidden rows and active filters, so a reviewer decides (`PRD-IMP-002`, `PRD-IMP-005`, `PRD-IMP-007`). Never import "visible rows only". OPEN: whether a filtered-out row was deliberately excluded or only hidden (KDPS Owner).

**A-8. Leftover sheets and pivots**

- Seen: `Sheet2` of `Sales_Hazaribagh.xlsx` and `SOH_Hazaribagh.xlsx` (pivots); `jsl/fy 25-26 sales.xlsx` `Sheet2` (kids-brand pivot), `Sheet3` (brand, customer, phone list, 113 rows) and `Sheet4` (phone pivot); empty `Sheet2` and `Sheet3` in several workbooks; DSR `Stock In` and `SOH & Sale Summary` pivots.
- Rule: import only the sheets the saved layout names. List the others as ignored, with their row counts. A pivot is never a source of records.

**A-9. External links and absolute paths**

- Seen: `KDPS-DIRECTION.xlsx` looks up two workbooks under `C:\Users\user\Downloads` that are not supplied. `pt-file-format.xlsx` links to a local copy of the PT workbook and has a broken name `EmptyList` (`#REF!`). `KDPS INVOICE & OFFER DETAILS..xlsx` has about 14,000 lookup formulas.
- Rule: never follow an external link. Use the cached value and report the link (`PRD-SEC-011`). Imported content cannot run macros, scripts or unapproved links.

**A-10. Formulas, pre-built rows and filler rows**

- Seen: the DSR `Sale` sheet has formulas to row 20,993 for 4,780 data lines (dates to April 2027); `Cash` runs to 12 Apr 2027 and `Petty Cash` to 30 Apr 2027; `AS SOH ` ends with 3,125 filler rows that hold `0` in three columns; the `OWNER` PT sheet is formatted to 16,342 rows (survey); the invoice workbook's `COMPILED PT FILE` has about 1,000 pre-built formula rows (survey).
- Rule: a row is data only when the layout's key columns are filled (barcode for stock, item or barcode for sales). Count and report ignored filler rows. Read cached values; flag cells whose formula returned an error (J-1).

**A-11. A cell the reader cannot type**

- Seen: in the DSR `Bank Reconciliation` sheet a numeric identifier cell is formatted as a date with an impossible serial (value not copied). A reader raises an error on it.
- Rule: the reader must not stop on one bad cell. It keeps the raw value and reports the cell (`PRD-IMP-007`).

**A-12. Stray spaces in sheet names and headers**

- Seen: sheet names `AS SALE `, `LP2 SALE `, `AS SOH `, `LP2 SOH ` end in a space; headers `Dis ` and `Date ` end in a space; headers hold line breaks and double spaces (DSR `Petty Cash`, `CN  QUANTITY`); the PE CSV header names are padded.
- Rule: match names after trimming and collapsing spaces; keep the original text.

## 3. Dates

**B-1. "Mon-YY" season text turned into dates by Excel**

- Seen: the `Season` or `season` cell holds a real date where the text was `Mon-YY`. Excel read `YY` as the day of the month. In `SOH REPORT FORMAT.xlsx` 7,135 of 22,387 cells (6,770 of them are 21 to 25 of a 2026 month); in `VAISHNAVI DEOGHAR 12-06-2026 SOH.xlsx` `Sheet1` 6,752 of 33,381 (6,059); in the Vaishnavi FY sales file 2,540 of 15,285 (2,173); in `Sales_Hazaribagh.xlsx` 597 (138); in the Dumka stock sheets 3, 52, 31 and 16.
- Reading: the day is the year (23, 24, 25 mean 2023, 2024, 2025) and the month is the month; the year of the date is the year the file was opened (2026). Example: 25 Mar 2026 is `Mar-25`. This is an inference (the first-pass read reached the same reading), not confirmed by KDPS.
- Side effect: these dates look like the future. 4,201 in `SOH REPORT FORMAT.xlsx` fall after the file's own date, up to December 2026.
- The `jsl/` files hold none of these (`soh30626.xlsx` keeps the text).
- Rule: never import a date-typed `Season` as a date. Keep the original cell. Store the season as unknown, selected explicitly and audited (`PRD-LIF-006`, `PRD-MER-005`). Offer the decode (`Mar-25`) as a suggestion with its evidence, accepted only by a person (`PRD-IMP-006`, `PRD-IMP-009`). OPEN: what the season tag means (receipt month or launch) and whether the decode may be applied (KDPS Owner).

**B-2. Full dates in the season field**

- Seen: text `dd-mm-yyyy` in `Season` (183 in the Vaishnavi SOH `Sheet1`, 226 in the Vaishnavi FY sales, 267 in `Sales_Hazaribagh.xlsx`, 129 in `SOH REPORT FORMAT.xlsx`); real dates that are not Mon-YY misreads (459 in `Sales_Hazaribagh.xlsx`, 668 in `jsl/fy 25-26 sales.xlsx`, 878 in `soh30626.xlsx`). The meaning is unknown (for example 29-04-2025 appears on stock from several brands).
- Rule: as B-1. A date in a season field is not a season (`PRD-MER-004`). OPEN: what these dates are (KDPS Owner).

**B-3. Design numbers turned into dates**

- Seen: `Design No` or `Design` cells that are dates with years from 1940 to 5335: 75 in `Sales_Hazaribagh.xlsx`, 97 in `SOH REPORT FORMAT.xlsx`, 112 in `soh30626.xlsx`, 76 in `SOH_Hazaribagh.xlsx`, 55 in `jsl/fy 25-26 sales.xlsx`, 17 in `jsl/fy 26-27 sales.xlsx`. The same cell reads `2513-01-05` in one export and `2513-05-01` in another.
- Rule: a design number is text. A date-typed value in a design column is flagged and cannot identify a style. The original cell is kept (`PRD-IMP-002`, `PRD-IMP-007`).

**B-4. Day and month swapped**

- Seen: the same `Season` cell is `2025-09-07` in `Sales_Hazaribagh.xlsx` and `2025-07-09` in `jsl/fy 25-26 sales.xlsx` (at least 339 matched lines; 215 more where the text `dd-mm-yyyy` in one export equals the real date in the other). Debit-note `SUMMARY` dates against the `KDPS CN & DN SHEET` sheets: 75 of 100 matched real dates are swapped (the `SOFTWARE` sheet shows 6 Apr 2026 where the summary shows 4 Jun 2026). Offer sheets in `Q&A-req-recieved/BRAND OFFERS/BRAND OFFERS.xlsx` (Mufti: many dates stored with day and month swapped, survey).
- Cause (guess): the PC that opened or saved the file read dates as day-first or month-first.
- Rule: a layout fixes one date format per column. No importer guess. Check the date against other evidence in the file (bill dates only go up with the bill serial in every sales file) and report a contradiction with the correction required (`PRD-IMP-007`). A swapped date is never repaired by the importer. OPEN: how the accounts workbook dates are to be corrected (Accounts).

**B-5. Text dates in many formats**

- Seen: real Excel dates (sales, stock); text `dd-mm-yyyy` (debit-note `SUMMARY` 257 and 58 rows, `Season`); text `dd-mm-yy` (20 `SUMMARY` rows, for example `29-05-26`); text `dd/mm/yyyy` (PT invoice dates, survey); text `dd.mm.yyyy` (`BLACKBERRY.xlsx` PT file, `KILLER` offer rows); `yyyymmdd` (`Peter England.CSV`); Excel serial numbers (see B-6); `dd/mm` without a year (`BLACKBERRY` offer sheet, brand workbooks `OFFER` sheets: `Start Date 17/12`); the text `Not Disclosed Yet.` in 9 closing-date cells of the offer sheets; a date with a `00:00:00` time part (all bank statement dates); `From 01-05-2026` inside a title cell.
- Rule: each saved layout names the accepted formats per column. A value that fits none stays as text and is flagged. `Not Disclosed Yet.` means no date; it never becomes a date (`PRD-MOD-015`).

**B-6. Excel serial numbers**

- Seen: `Date` in the Allen Solly Deogarh `AS SOH ` (7,025 integer cells, 3 Aug 2024 to 18 Apr 2026) and `LP2 SOH `; `Billing Date` in the Madura `.xlsb` (46128 is 16 Apr 2026); the `ambreli 1855.xls` invoice date.
- Rule: read the cell type. A serial in a date column is converted with the workbook's date system, and the original number is kept.

**B-7. Dates after the file's own period**

- Seen: 25 real `SUMMARY` dates after the newest text date (15 Jun 2026); 8 credit-note dates after 30 Jun 2026 (7 on `KDPS CN & DN SHEET`, 1 on the brand sheet, up to 25 Dec 2026); Mufti offer end year 2026 for a 10 Dec 2025 date (survey); the Mon-YY misreads in B-1.
- Rule: report any date later than the file's period (`PRD-IMP-007`).

**B-8. Header period and data period disagree**

- Seen: the May Blackberry file says `01-05-2026 to 31-05-2026` and holds 52 of 137 lines dated in April; the June Blackberry title says `to 30-06-2026` and the data stops on 18 Jun; the June Mufti `SALES` title still says May; Blackberry June `SOH` is dated 1 Apr on every row; the April voucher `SOH` titles say `From 01-04-2026` on some files and `From 01-05-2026` on others; the `SOH` date column is 2026-05-01 on most rows and 2026-04-01 on 335.
- Rule: a period in a title or file name is a claim. Compare it with the smallest and largest data date and show any mismatch. Do not correct it.

**B-9. No time of day**

- Seen: every POS bill date is midnight. No sales or stock file has a time.
- Rule: a bill's order inside a day is the bill serial. Time-based checks are not possible on this data.

## 4. Numbers, identifiers and master attributes

### Numbers

**C-1. Numbers held as text, or text in a number column**

- Seen, POS exports: `Rate` is the text `NaN` on 5 lines of `Sales_Hazaribagh.xlsx` (4 of them also in `jsl/fy 25-26 sales.xlsx`) and 1 line of the Vaishnavi FY file; `Net Amount` is a single space on 1 line of that file; amounts are text in Indian comma format on 23 cells of the bank statement.
- Seen, other files (survey): PT files where every cell is text (`SUVIDHI`, `FAHRENHEIT`, `BLACKBERRY`, `minelli`); the Jockey `Batch No.` column holds MRP as text; `kidcity` `Price` is text on 140 of 272 rows; `XERICS` MRP is `1,195.00/pcs`; `Invoice Ageing` is text (`595 Days`) on 942 rows; credit days and cash discount mix numbers with `NO` and `NET`.
- Rule: parse by the layout's column type. A text value in a number column is an error for that field, shown with the correction required, and kept as text. It is never read as zero (`PRD-MOD-015`, `PRD-IMP-007`).

**C-2. Money precision and displayed rounding**

- Seen: sales `Net Amount` keeps paise; `Bill Amount` is whole rupees; stock `Rate` is shown to 2 decimals while `Amount` keeps the unrounded product, so `Amount` differs from `Tqty` x `Rate` by a few paise on 17 rows (`SOH REPORT FORMAT.xlsx`) and 11 rows (`soh30626.xlsx`); the vendor PT file rounds `BASIC` to whole rupees (sum 1,14,115 against the invoice's 1,14,156.90, survey); float noise such as 3152.3999 in `DSY.xlsx` and 899.6999999999999 in vouchers.
- Rule: parse decimals exactly and convert to integer paise (`PRD-MOD-014`). Keep the original text. For `Amount` against `Tqty` x `Rate`, the bound that two-decimal display implies is half a paise per unit; that is arithmetic, not a business tolerance. Any wider tolerance is OPEN (Accounts).

### Barcodes and identifiers

**D-1. Barcode classes mix in one column**

Counts by class (rows):

| Class | `SOH REPORT FORMAT.xlsx` | Vaishnavi SOH `Sheet1` | `soh30626.xlsx` | `Sales_Hazaribagh.xlsx` (lines) |
| --- | --- | --- | --- | --- |
| 7 digits (in-house, mostly start with 1) | 10,458 | 4,436 | 6,241 | 14,077 |
| 13 digits, valid EAN-13 check digit | 7,965 | 26,301 | 18,359 | 8,954 |
| 13 digits, check digit fails | 418 | 43 | 514 | 462 |
| Alphanumeric | 1,855 | 1,848 | 2,124 | 1,564 |
| 10 digits | 456 | 257 | 1,247 | 490 |
| 6 digits | 498 | 98 | 206 | 401 |
| 15 digits | 324 | 25 | 300 | 63 |
| Other digit lengths (5, 8, 9, 11, 12, 14) | 413 | 373 | 377 | 184 |
| Total | 22,387 | 33,381 | 29,368 | 26,195 |

- Seen elsewhere (survey): PT files with 12-digit codes (`SUVIDHI`), 10-digit (`AMIDHARA`, `minelli`), 8-character alphanumeric (`HYPHEN`), 7-digit style plus size (`XERICS`), a brand's initials plus MRP such as `AS159` that is not unique (`AS INNERWEAR`), 13 or 14 digits with a leading 0 (`DSY`), 6 digits (`BANJARAN`), 5 digits (`ZILU`).
- Rule: a barcode is a text key. Store the class per row for the reviewer (valid EAN-13, EAN-13 failing the check, 7-digit, other numeric, alphanumeric). Do not repair. A failing check digit is flagged, not refused, because in-house and vendor-made codes also have 13 digits (`PRD-IMP-007`). Map an external barcode to a SKU with scope and validity (`PRD-MER-006`). OPEN: whether a barcode that fails the check is accepted as an in-house code (KDPS Owner; per supplier, see the barcode YES/NO list in `SUPPLIER BRAND DETAILS.xlsx`).

**D-2. Barcodes, phones and codes held as numbers**

- Seen: in nine POS files all-digit barcodes are numbers and none is text (0 of about 158,000 values); phone numbers are numbers (so `0` and 9 or 11 digit values cannot be told from a lost zero); DSR `Barcode No.` is a float on 4,506 rows; DN `Bill No`, `Size`, `Design No`, `HSN` are floats; the 15-digit class is at the edge of Excel's precision.
- Rule: a leading zero lost before the file reached KDPS cannot be recovered. Read identifiers as text where the file holds text; for numbers keep the digits as printed and flag lengths outside the class list (`PRD-MER-007`). Phone is stored as text with its length validated; a failing value is reported and kept (see L-1).

**D-3. Rounded barcodes**

- Seen: every barcode of `AS SALE ` (178 lines) and `LP2 SALE ` (35 lines) is a 13-digit number ending in `000000`: 6 and 5 distinct values for 213 lines (for example `8909240000000` on 81 lines). All 13-digit barcodes in the debit-note `SOFTWARE` sheets end in `000000`: 11,853 of 14,135 lines (2025-26) and 1,819 of 2,291 (2026-27). The same barcodes in `AS SOH ` are not rounded. The cause is a display format that kept 7 significant digits (guess).
- Rule: flag a 13-digit value ending in six zeros as "rounded, cannot identify". It is never matched by barcode. A match by design number and size is offered as a suggestion for a person (`PRD-IMP-009`). OPEN: whether KDPS can export barcodes as text (KDPS Owner).

**D-4. A barcode is not a unique key**

- Seen: sales lines repeat a barcode once per piece; stock exports hold one row per barcode (no duplicates in any); 245 barcodes in `Sales_Hazaribagh.xlsx` and 157 in the Vaishnavi FY file were sold at more than one `Rate` (the MRP changed); in 1,593 of 17,027 matched lines the sale `Rate` differs from the current stock `Mrp` (survey); PT files repeat a barcode on separate rows (`Jockey`, `STATUS QUO`, `XERICS`), across two invoices (`kidcity`, 16 SKUs), on several bills (`Madura`, 1,391 EANs), with two MRPs (`JOCKEY_DD SALES.xls`, one EAN at 629 and 639) and with MRP varying by size (`AMIDHARA`, `DSY`); one duplicated barcode in the `SANTOSH` PT sheet.
- Rule: the unit of import is the line. Keep each line's price as its own snapshot (`PRD-MER-009`, `PRD-POS-014`). One barcode with two MRPs in one stock snapshot is a conflict shown to the reviewer (`PRD-IMP-007`). Identical pieces may share a barcode (`PRD-MER-003`, `PRD-MER-016`).

**D-5. Codes in the barcode column that are not barcodes**

- Seen: the placeholder style code `KDPS-DEGR-MF` on 56 Mufti `SOH` rows and 6 sales rows; `Scan Stock` and `Audit Differance` (Banka, 183 rows) and `Opening Stock` and `Audit Diff` (`AS SOH `, 37 rows; DSR 77 rows) in the document-number column of the stock ledgers; the PT cases in D-1.
- Rule: a label in an identity column is a source word, kept as is. A document label is not a document number, and a stock-ledger line with such a label is an inward line without a document (`PRD-IMP-007`).

**D-6. Invoice and bill numbers mangled**

- Seen: `INVOICE DETAILS.` invoice numbers are text on 1,092 rows, numbers on 162, and 5 became dates (years 1953, 2242, 2382, 2401, 2408); 9 numbers are duplicated; 2 read `NOT AVAILABLE`; debit-note `SOFTWARE` `Bill No` is a float on 351 lines and a date on 1; DSR `Invoice No` has two styles (`WH\S-n`, `25-26/WH/S-n`).
- Rule: an invoice or bill number is text. A date-typed or float value is flagged. A reused number with different content is a conflict (`PRD-IMP-011`).

### Attribute columns reused or loose

**E-1. `Color` holds a price band**

- Seen: `Color` is `PREMIUM`, `MEDIUM`, `ECONOMY` or `ASSO.` on 26,022 of 26,195 lines of `Sales_Hazaribagh.xlsx`; in `SOH REPORT FORMAT.xlsx` the same bands plus `WORK`, `ASSD`, digits `1` to `5`, letters `A` to `C`, `NA`, `.` beside real colours; the PT `Master Sheet` `COLOR` list holds the three bands too (survey).
- Rule: store the word as "source colour or price band". Write it to the colour attribute only through a confirmed mapping (`PRD-IMP-003`, `PRD-IMP-008`, `PRD-IMP-009`). OPEN: what the bands mean and who assigns them (KDPS Owner).

**E-2. `Size` holds packs, measures and numbers**

- Seen: `FS`, `FREE SIZE`, kids ages (`2-4 Y`), measures (`274 X 274 CM`, `95*100`, `16X19 L`); sizes stored as numbers or text in the same column; blank on 373 lines of Vaishnavi SOH `Sheet1`, 250 of `SOH REPORT FORMAT.xlsx`, 14 of `soh30626.xlsx` and 134 lines of the Vaishnavi FY sales; PT sizes also hold months, ml, cm and bra sizes (survey).
- Rule: keep size as text. A blank size stays unknown and is never turned into Free Size (`PRD-MER-005`).

**E-3. `Fit` holds codes, product words and typos**

- Seen: `Fit` has 60 distinct values in `Sales_Hazaribagh.xlsx`, 47 in `SOH REPORT FORMAT.xlsx`, 49 in Vaishnavi SOH. It holds `LM` (7,492 rows of `SOH REPORT FORMAT.xlsx`), `MM`, `VLM`, `HM`, `VHM`, product words (`SILK SAREE`, `COTTON KURTI`, `ANKLE`), model names, and misspellings (`REGULER`, `Reguler`, `REGULLAR`). Values end in a non-breaking space on 182 lines (`Sales_Hazaribagh.xlsx`), 195 rows (`SOH_Hazaribagh.xlsx`), 296 (`soh30626.xlsx`).
- Rule: keep the source word. Fit codes need a confirmed vocabulary before they map to an attribute (`PRD-IMP-008`). OPEN: what `LM`, `MM`, `VLM`, `HM` mean (KDPS Owner).

**E-4. `Category` and `Sub Category` mix words and codes**

- Seen: category words (`CASUAL WEAR`, `FORMAL WEAR`, `SEASONAL WEAR`, `ACCESSORIES`, `INNERWEAR`) beside 3 to 5 letter codes (`USM`, `UTP`, `LJM`, `SETM`, `KURP`); typos (`FORMAL WAER`, `PARTY WAER`); 186 distinct values in `SOH REPORT FORMAT.xlsx`, 194 in Vaishnavi SOH, 59 in `SOH_Hazaribagh.xlsx`, 42 in the `Sales_Hazaribagh.xlsx` sub category. The last letter of many codes is M, P or E, like the price bands (guess).
- Rule: as E-3. In the sales report the category is printed on a bill's first line only (H-1), so line categories come from the stock master by barcode.

**E-5. `Gender` holds many spellings and non-gender values**

- Seen: 12 spellings in `Sales_Hazaribagh.xlsx`, 24 in `SOH REPORT FORMAT.xlsx`, 33 in Vaishnavi SOH: `FEAMLE`, `FMALE`, `FEAMAL`, `FMAMLE`, `KIDSM`, `KIDM`, `KIDEM`, `KIDSF`, `KIDS M`, `FEMALE KIDS`, `BOY`, `MENS`, `MEN`, `Male`, `Female`, and non-gender words (`.`, `ACCE`, `PROMO`, `ASSC.`, `NA`, `CARRY BAG`, `GIFT`, `LUGGAGE`, `JEANS`, `SMAG HALF ZIPPER`).
- Rule: keep the source word; propose a normalised gender for confirmation (`PRD-IMP-003`, `PRD-IMP-008`).

**E-6. `Season` has many formats**

- Seen (patterns): `SPRING SUMMER(Mon-yy)`, `AUTUMN WINTER(Mon-yy)`, `SPRING SUMMER(yyyy)`, `AUTUMN WINTER(yyyy)`, `SSyy`, `SS-yy`, `AWyy`, `AW-yy`, `SS yy-yy`, `AW yy-yy` and `SS yy` (Sanskar), brand codes (`FSyy`, `VDyy`, `JNSyy`, `ASyy`), `N/A`, blank, `ACCE`, `CORE FASHION`, `FASHION STUDIO`, `AllSeason`, and the date forms in B-1 and B-2.
- The `Season` of one barcode can differ between two exports of the same bills: 1,017 of 17,004 uniquely matched lines between `Sales_Hazaribagh.xlsx` and `jsl/fy 25-26 sales.xlsx` (358 are text against text, for example `SPRING SUMMER(Apr-26)` against `AUTUMN WINTER(Jul-26)`). The source may change it when stock is re-entered (guess).
- Rule: keep the source text. A season is a master attribute with its own vocabulary (`PRD-MER-004`). An unknown season is selected explicitly (`PRD-LIF-006`). OPEN: season meaning and format (KDPS Owner).

**E-7. Gift and promotional items sit among stock**

- Seen: carry bags (31,032 pieces in `soh30626.xlsx`); trolleys with an MRP far above their cost (cost about 8% of MRP, survey); promo bags and backpacks sold at Rs 99 to 399; `PROMOTIONAL` in `Category`.
- Rule: import as they are. Classification as gift or packaging is a master choice (OPEN: KDPS Owner). Reports that use these rows must show them separately.

**E-8. The `Supplier` column names KDPS itself**

- Seen: `KDPS LIFESTYLE PVT LTD (DEOGHAR)` (876 rows of `SOH REPORT FORMAT.xlsx`, 1,850 of `soh30626.xlsx`, 4,867 of Vaishnavi SOH) and two other spellings (`KDPS LIFESTYLE PVT LTD`, `KDPS LIFESTYLE PVT. LTD`). Probably transferred or own stock (guess).
- Rule: keep the source word. Do not read it as a supplier relationship; stock that arrived by transfer has no purchase evidence (`PRD-LIF-008`).

### Spelling variants

**F-1. Brand: names, codes and spacing**

- Seen: Louis Philippe as `LOUIS PHILIPPE`, `LP`, `LY`, `LR`, `LA`, `LX`; Van Heusen as `VAN HEUSEN`, `VH`, `VS`, `VD`, `VF`, `VX`, `VW`; Allen Solly as `ALLEN SOLLY`, `AS`, `AL`, `AT`. KDPS staff filters group these (`AL`, `ALLEN SOLLY`, `AS`, `AT`). 15 spellings that differ only by spacing or punctuation in `SOH REPORT FORMAT.xlsx` (`W O E`/`WOE`, `U. S. POLO`/`US POLO`/`U S POLO`, `P KIDS`/`PKIDS`), 11 in Vaishnavi SOH (`BLACK BERRY`/`BLACKBERRY`, `V KILLER`/`VKILLER`). Blackberry in vouchers: `BLACKBERRYS`, `BLACKBERRY`, `BLACK BERRY`. `SUPPLIER BRAND DETAILS.xlsx` has 1,163 brands of which 30 groups differ only by spacing or punctuation (survey). Stock-master brands missing from the brand master: 24 of 778 (survey). Sales and stock brand names differ (`FW` and `Fashion World`, survey).
- Rule: keep the original word and a proposed normalised brand. Aliases are governed through proposal and independent confirmation (`PRD-IMP-008`); close matches are offered for manual selection (`PRD-IMP-009`). OPEN: whether the division codes roll up into one brand, and for which reports (KDPS Owner).

**F-2. Supplier and party legal names**

- Seen: the Madura group under three names (`MADURA PVT LTD`, `ADITYA BIRLA FASHION LTD`, `ADITYA BIRLA LIFESTYLE BRANDS LIMITED`; 431, 654 and 1,425 rows in `SOH REPORT FORMAT.xlsx`); for 23% of `SOH REPORT FORMAT.xlsx` rows the supplier differs from the brand master's supplier (survey); supplier spellings such as `M.N GARMENTS`/`MN GARMENTS`, `D S CREATION`/`DS CREATION`, `D APPAREL`/`D APPARELS` (survey); `SUPPLIER DATA BASE` has 261 suppliers, most with `-` placeholders (survey).
- Rule: as F-1, for parties. Whether the Madura names are one party is a legal question (OPEN: KDPS Owner and the CA).

**F-3. Item, store and sheet names**

- Seen: items `Sarees`, `Saree`, `Silk Saree`; `PAJAMA` and `PAJAMS` (survey); stores `Deogarh` in names and `deoghar` in emails; a store-list "STORE NAME" that is a brand or format name (not unique without the town).
- Rule: as F-1. A Store is identified by its code and Site, not by its name (see [stores-and-codes.md](stores-and-codes.md)).

## 5. Rows, bills and stock structure

**G-1. Total, section, filler and note rows**

- Seen, total rows: the POS sales reports end with a total row, a `SALES RETURN` label row, a blank row and the total again (`SALE REPORT FORMAT.xlsx`, Vaishnavi 2026, `jsl/` files, `Sales_Hazaribagh.xlsx`, Sanskar). Banka has the total, two blank rows and the total. Movement statements end with a total row with no barcode. `VAISHNAVI DEOGHAR 12-06-2026 SOH.xlsx` `Sheet1` has a blank row and a total row. `SOH_Hazaribagh.xlsx` has a total row. Vouchers end with a total row. Bokaro `Sale` ends with a total row that has `#N/A`. The debit-note `SOFTWARE` sheets end with a total row. PT files end with `Grand Total :`, `*Sub Total*`, `Total` or a quantity-only row, and some have a filler line (blank barcode, quantity 1, rate 0, `SUVIDHI`, `FAHRENHEIT`).
- Seen, note rows: `NOTE: 19 PCS JEANS SHORT` in the barcode column of a stock sheet.
- Seen, restart: the `Sales_Hazaribagh.xlsx` total covers financial year 2026-27 only (9,323 pieces) though the file holds two years (inferred: the POS total restarts at the financial year).
- Rule: detect these rows by the empty key columns. Parse them as control totals, compare them with the line sums, and show the difference (`PRD-IMP-005`, `PRD-IMP-013`, `PRD-EBO-003`). A brand-reported or POS-reported total is marked separately from verified evidence (`PRD-EBO-004`). They are never imported as lines. A free-text note row is shown to the reviewer.

**H-1. Bill-level fields are blank on continuation lines; orphan lines**

- Seen: in the 25-column sales report `Customer`, `Phone`, `Sub Category`, `Bill Amount`, `Cash`, `Card`, `Credit` are on the first line of a bill only (for example 5,383 bills on 15,285 lines in the Vaishnavi FY file). `Bill Date` and `Bill No` also if the file is the first-line variant. `AS SALE ` starts with 3 lines and `LP2 SALE ` with 4 lines that have no bill header at all. `Phone` is blank on 2,578 of 5,383 bills.
- Rule: a line belongs to the nearest header above it, within one file only. A line with no header above it is an orphan: refuse it with the correction required, and never fill a date, bill number or tender from neighbouring lines (`PRD-IMP-007`, `PRD-IMP-009`). A document cannot be half posted (`PRD-IMP-012`).

**H-2. Brand-cut files break the bill totals**

- Seen: the Allen Solly Deogarh sheets, the Hazaribagh LP sheet and the Sanskar sheet hold one brand's lines. `Bill Amount` and the tenders are for the whole bill: they differ from the sum of the lines on 37 of 42 bills (`AS SALE `), 4 of 5 (`LP2 SALE `), 27 of 30 (Sanskar) and 84 of 105 (Hazaribagh LP).
- Rule: detect a brand cut (a filter on brand, or `Bill Amount` that does not add up). Mark its bills "partial". Do not reconcile tenders against partial bills. OPEN: whether KDPS can send the whole store export instead of a brand cut (KDPS Owner).

**H-3. `Bill Amount` does not match the lines**

- Seen: `Bill Amount` is the half-up rounded sum of the lines on almost every bill, but differs by more than Rs 1 on 19 of 5,383 bills (Vaishnavi FY), 126 of 4,611 (`jsl/fy 25-26 sales.xlsx`), 2 of 2,029 (`jsl/fy 26-27 sales.xlsx`), and 0 in the Vaishnavi 2026 and June files. Three bills round up from a fraction below one half. Two `Bill Amount` values hold paise.
- Rule: import both the lines and the bill header values. Report each bill where the header differs from the lines, with both values (`PRD-IMP-007`). OPEN: which value is right and the rounding rule (Accounts, CA).

**H-4. Zero-value bills**

- Seen: bills with `Bill Amount` 0 and no tender: 110 (Vaishnavi FY), 21 (Vaishnavi 2026), 116 (`jsl/fy 25-26 sales.xlsx`), 35 (`fy 26-27`), 6 (June), 163 (`Sales_Hazaribagh.xlsx`). Some are gift-only bills. Some have lines worth money and a zero `Bill Amount` (for example 1,599 on one bill).
- Rule: import as they are. Report zero-tender bills that carry value. OPEN: what a zero-tender bill with value means (KDPS Owner).

**H-5. Returns are negative lines with no link to the original bill**

- Seen: 441 return lines in the Vaishnavi FY file (326 of 327 bills with a return also hold a sale line), 942 in `Sales_Hazaribagh.xlsx` (723 mixed bills), 68 in Vaishnavi 2026. Refund bills have a negative `Bill Amount` and tender (8 bills in the Vaishnavi FY file).
- Rule: import a return as a returned line of the same document, as historical reference only (`PRD-IMP-010`, `PRD-LIF-014`). Do not infer the original bill; no field gives it (`PRD-IMP-009`). Bill-backed entitlement (`PRD-RET-005`) applies to bills made in Apparel OS, not to imported history. OPEN: whether KDPS can supply the link (KDPS Owner).

**H-6. Discount fields disagree**

- Seen: `Disc%` 0 with a rupee `Disc Amt` on 665 lines (Vaishnavi FY), 209 (Vaishnavi 2026), 1,308 (`Sales_Hazaribagh.xlsx`), 894 (`jsl/fy 25-26 sales.xlsx`), 263 (Banka); `Disc%` not zero and still disagreeing with `Disc Amt` / `Gross Amt` on 96 lines (Vaishnavi FY); `Disc Amt` sign flips on return lines (190 positive lines); Bokaro holds `Disc Amt` positive throughout; voucher `Dis` is positive in April and negative in June Blackberry.
- Rule: import both values as given with the sign convention of the layout. Never recompute one from the other. Report the lines where they disagree (`PRD-IMP-007`). A reason or scheme for a rupee discount is not in the export. OPEN: how to treat amount-only price changes in reports (product owner).

**H-7. Carry bags and free gifts are lines**

- Seen: item `CARRY BAG` at a few rupees with `Disc%` 100 (about 8,200 pieces in the Vaishnavi FY file, 7,000 in `Sales_Hazaribagh.xlsx`, 586 lines in the DSR); free gifts as ordinary items with `Disc%` 100 (1,368 lines in the Vaishnavi FY file, 223 in `Sales_Hazaribagh.xlsx`); gift trolleys and bags sold at Rs 99 to 399 (survey).
- Rule: import as lines. They count as sales lines in totals, so reports must be able to exclude them by item. OPEN: whether bags are stocked items and how gifts are valued (KDPS Owner, Accounts).

**H-8. Tender fields**

- Seen: only `Cash`, `Card`, `Credit` exist; `Credit` is 0 on every bill in every file; there is no UPI column; the Singh More DSR shows UPI at 47% of sales and card 15%, while the POS sample shows cash and card only. Split tenders: 177 bills in the Vaishnavi FY file.
- Rule: import the tender columns as given. Do not map `Card` to a tender type until KDPS says what it holds (`PRD-POS-005`). OPEN: whether `Card` includes UPI (Accounts, CA).

**H-9. Customer and phone fields**

- Seen: `CASH` as customer on 2,058 of 5,383 bills (Vaishnavi FY); `MANUAL BILL UPDATE` on 30 of them; one `#NAME?` customer cell (bill 26-27/JSL/199); phones of 9 digits (22), 11 digits (7) and 2 digits (1) in the Vaishnavi FY file; the value `0` on 189 Hazaribagh bills; 199 phones shared by several names (survey).
- Rule: see L-1. Phone is optional and stored as text with its purpose (`PRD-POS-012`). A failing phone is reported and kept.

**H-10. Overlapping exports and a bill missing from a later export**

- Seen: `Sales_Hazaribagh.xlsx` and the `jsl/` files hold the same bills: 6,639 bill numbers are in both. `jsl/june sales report.xlsx` is a subset of `jsl/fy 26-27 sales.xlsx`. One bill, `26-27/JSL/2014` (4 lines, Rs 5,249), is in the `jsl/` file and absent from the later `Sales_Hazaribagh.xlsx`; it is the only gap in that series. `Sales_Hazaribagh.xlsx` also has 455 bills the `jsl/` files do not. One bill number has two header lines in `Sales_Hazaribagh.xlsx`.
- Rule: a bill's identity is its series as printed and its number. Overlapping files are detected and deduplicated by that identity (`PRD-IMP-011`). A bill present in one export and absent from a later export of the same period is listed for review and never dropped silently. A reused identity with different content is an explicit conflict or a governed revision (`PRD-IMP-011`, `PRD-IMP-013`). One header line per bill number is expected; two is reported. OPEN: whether the POS can remove a bill after it was exported, and whether it keeps a trace (KDPS Owner).

**I-1. Stock files with and without zero rows**

- Seen: positive-only: `SOH_Hazaribagh.xlsx`, the Dumka stock sheets, Bokaro `Stock`, Deoghar `STOCK REPORT`, Banka `STOCK REPORT`, Vaishnavi SOH `Sheet2`. With zero rows: both movement statements, Vaishnavi SOH `Sheet1` (24,576 of 33,381), Hazaribagh LP `Sheet2` (1,999 of 5,595). Only 29.8% of the barcodes sold at Hazaribagh are in its positive-only stock file (survey).
- Rule: the saved layout says whether zero rows are kept. A barcode missing from a positive-only file is "not listed". Whether that means zero is OPEN (product owner), because a SOH is a comparison source and not a count (`PRD-LIF-014`, `PRD-LIF-027`).

**I-2. Two sheets of one workbook disagree**

- Seen: Vaishnavi SOH `Sheet2` against `Sheet1` for the same 8,805 barcodes: season differs on 3,007 rows, brand on 660, size on 410, gender on 40, item name on 34. Quantity, `Mrp`, cost and supplier are the same.
- Rule: an import reads one sheet named by the layout. A second sheet with the same keys is compared and the differences shown. It never overwrites approved data (`POL-03.02`).

**I-3. Cost above MRP, MRP missing**

- Seen: `Rate` above `Mrp` on 47 rows of `SOH REPORT FORMAT.xlsx`, 29 of `soh30626.xlsx`, 13 of `SOH_Hazaribagh.xlsx`, and 24 SKUs of the Vaishnavi file (analysis file); `Mrp` is 0 or blank on 1 and 20 rows.
- Rule: report them (`PRD-IMP-007`). A cost above the MRP is not corrected.

**I-4. Copies and stale sheets**

- Seen: the Mufti June `SOH` is the May `SOH` (803 rows identical). The Bokaro April voucher `SOH` equals the Allen Solly Deogarh voucher `SOH` on 341 rows. The Blackberry June `SOH` is dated 1 Apr. The DSR on-hand figure nets inward since Oct 2024 against sales since Apr 2026, so it may count items sold earlier (guess).
- Rule: compare a new file with the last accepted file of the same Store and brand. Identical content under a new period is reported as a possible stale copy.

**I-5. Stock-in lines without a document**

- Seen: Banka `Scan Stock` (105 rows) and `Audit Differance` (78); `AS SOH ` `Opening Stock` (14) and `Audit Diff` (23); DSR `Audit Diff` (77 lines, 136 pieces).
- Rule: shown as inward lines with no source document. Only a physical count creates stock; this evidence supports a count, not a receipt (`PRD-LIF-008`).

## 6. Errors, formulas and totals

**J-1. Error values left in cells**

- Seen: `#N/A` on 49 Bokaro `Sale` lines and its total row; `#N/A` on 3 Banka `STOCK REPORT` cells; `#NAME?` in one `Customer` cell of `Sales_Hazaribagh.xlsx` and `jsl/fy 26-27 sales.xlsx`; `#ERROR!` (9,570) and `#VALUE!` (2,162) in the DSR `Bank Reconciliation` sheet; `#VALUE!` in 2 cells of the debit-note brand sheet; `#REF!` in the name `EmptyList` of `pt-file-format.xlsx`. The text `NaN` in `Rate` (C-1).
- Rule: an error value is a missing value, not zero and not text (`PRD-MOD-015`). Report each cell. The row is flagged if the field is required.

**J-2. Formula drift between copies**

- Seen: in `KDPS PT FILE SHEET.xlsx` the `P RATE` formula is `BASIC x 1.2` in six work sheets and `BASIC x 1.1` in three (`DEBANJAN`, `MAHENDRA`, `PRAVIN JI`); `PRAVIN JI` has an older tax formula; `MARGIN` comes out at exactly 22 on every `SANTOSH` line (a formula, because `BASIC` is 65% of `MRP` there) and is a pasted constant 22 in the vendor PT file; in `KDPS-DIRECTION.xlsx` `OFFER PROPORTION` points at `$P$26*$Q$26` on 375 rows and at `$P$5*$Q$5` on 24 rows, not at its own row; the DSR picks a GST rate by line value (10.71 or 15.2542) with a `Check` column that returns 0 either way; the PT tax formulas use fixed slabs (survey).
- Rule: import values, never rules from formulas. Report copies of one template whose formulas differ. A formula constant is an analyst or staff choice, not a KDPS policy. OPEN: which multiplier and tax rule is right (KDPS Owner, CA, product owner).

**K-1. Totals that do not reconcile**

- POS total rows against lines: `Sales_Hazaribagh.xlsx` (financial-year restart, G-1); `VAISHNAVI DEOGHAR 12-06-2026 SOH.xlsx` `Sheet1` total 13,375 pieces and Rs 1,79,81,513.78 against lines of 13,354 and Rs 1,79,81,382.52; `SOH_Hazaribagh.xlsx` `Amount` Rs 4,81,673.22 above the lines (pieces agree). The `soh30626.xlsx` and `SOH REPORT FORMAT.xlsx` totals agree.
- Net total against `Bill Amount` total: `jsl/fy 25-26 sales.xlsx` Rs 2,03,01,335.87 against Rs 2,01,48,269.14; `Sales_Hazaribagh.xlsx` Rs 1,12,59,534 against Rs 1,12,52,042 (FY 2026-27 part); the June file agrees.
- Brand reports: voucher `Total` differs from the POS net in 5 of 6 April stores, because `Dis %` holds the brand-offer calculation. The Blackberry June `SALES` total is Rs 1,44,632.85 and the `BRAND REPORT` total Rs 1,37,456.60.
- Accounts: invoice workbook `SUMMARY` header totals (cash discount 22,888; goods returns 16,674; payments 4,88,269) differ from `INVOICE DETAILS.` (96,301; 2,145; 23,50,486); the `INVOICE DETAILS.` header says `NEED TO UPDATE: 219` while 942 of 1,480 rows hold a date, quantity and value (survey).
- Debit notes: the `SUMMARY` and the `SOFTWARE` sheets agree on 58 of 104 rows of 2026-27.
- Rule: parse every total as a control total. Compare, and show the differences by file and by bill. Differences are reported, not fixed (`PRD-IMP-013`).

## 7. Personal and restricted data

**L-1. Personal and restricted values in the exports**

- Seen: `Customer` and `Phone` on every bill of every 25-column file; `SalesMan` on the lines; customer, brand and phone lists in `jsl/fy 25-26 sales.xlsx` (`Sheet3`, `Sheet4`); supplier bank details and agent phone numbers in `KDPS INVOICE & OFFER DETAILS..xlsx`; `GSTIN` columns (debit-note workbook, PT files); `Ac No. / Person` and `MID No` in the DSR; private names in the bank statement narration; cost (`Rate`, `Amount`) and margin in the stock files; staff first names as sheet tab names; an author field that names a person in one file's metadata (survey).
- Rule: restricted bank and identity fields are masked or excluded (`PRD-SEC-006`); customer contact information is protected by role and retention (`PRD-SEC-010`); logs carry no unnecessary personal data (`PRD-SEC-014`). The side-by-side test runs on test hosting with real KDPS data (`DEC-028`). OPEN: which fields are masked or excluded for the test, and who may see cost columns (KDPS Owner; product owner for the design).

## 8. Master and accounts workbooks (from the surveys, spot-checked)

- PT `Master Sheet` (`pt-master-sheet.xlsx`, `KDPS PT FILE SHEET.xlsx`, `pt-file-format.xlsx`): typos in lists (`GREE`, `STARD`, `PAJAMS`, `SKINNY TEPAR`, `SUPPER SKINNY`, `TOM BOY`/`TOMBOY`); `COLOR` holds the price bands; the last 7 brands are appended out of order; `SIZE` mixes numbers, letters, bra sizes, kids ages, months, ml and cm; item-to-category combos such as `CASUAL WEAR/INNERWEAR`. The `pt-file-format.xlsx` copy is older (591 rows against 593; brands `NOSTRUM` and `TOMBOY` missing; 71 rows differ). Rule: a vocabulary change goes through proposal and confirmation (`PRD-IMP-008`).
- PT work sheets: stray input prompts left on drop-downs; `SUGGESTED` columns return `WRONG ITEM` or `PLEASE RECTIFY` on a miss; one work sheet formatted to 16,342 rows; hidden sheets (A-7).
- Invoice workbook: `INVOICE DETAILS.` has 538 rows with only a file name; `TEN Uploaded Date` filled on 25 rows; `Invoice Ageing` text; `SUPPLIER DATA BASE` has `-` placeholders (brand `-` on 192 of 239 rows), agent numbers as text and floats, cash discount as 0.03, 0.05 or `NET`, credit days as numbers or `NO`.
- Offer sheets (`OFFER DETAILS.`, `BRAND OFFERS.xlsx`): 9 closing dates read `Not Disclosed Yet.`; `0FF` with a zero; `MRR` for MRP; overlapping offers with no stated winner; `OFFER DETAILS.` has 95 hidden rows. These are offer facts, covered in [offers-and-brand-reports.md](offers-and-brand-reports.md).
- Debit-note workbook: `BRAND NAME` and `SEASON` almost always blank on `KDPS CN & DN SHEET`; `SETTLEMENT DIFFERENCE` mixes numbers and text (`CLAIM FULLY SETTLED`); a header cell shows `#VALUE!`.
- Bank statement: two layouts in one sheet (part 1 has date, narration, date, amount; part 2 has separate debit and credit columns with text amounts and no header row); a gap from 15 Apr to 31 May 2026; no running balance.
- Vendor PDF `VSN DEO DA-26-27-0119.pdf` is image only (6 pages, skewed, handwritten corrections). `PRD-IMP-001` accepts PDF and photographs; extraction is an AI draft a person reviews (`PRD-SEC-003`).
- PT files (33 files, survey): vendor, buyer and brand are often only in the file name; no GST percentage column in 13 layouts across 12 files (some give tax amounts only; see pt-file-layouts.md); the same vendor sends different layouts; one file is a whole month for 176 customers (`Madura`, 113,983 rows, of which 5,923 are KDPS). Details are in [pt-file-layouts.md](pt-file-layouts.md).

## 9. What the validation report must show

From `PRD-IMP-005`, `PRD-IMP-007` and `PRD-IMP-013`, and from the problems above. The report is per file and per Store.

- The real format found, the sheets read and ignored (with row counts), the header row, the offset and each unlabelled column's recorded choice (A-1 to A-8).
- Hidden sheets, hidden rows and active filters (A-7).
- Rows read, rows ignored as filler or totals, rows refused, rows flagged, with the reason of each.
- The control totals found in the file against the sums of its lines (G-1, K-1).
- Dates outside the file's period, dates that are swapped or typed wrongly, and the period claimed in titles against the data (B-4, B-7, B-8).
- Barcode classes, rounded barcodes and barcodes with two prices (D-1, D-3, D-4).
- Attribute words not in the confirmed vocabulary, per column (E-1 to E-6, F-1 to F-3).
- Bills with a missing header, with two headers, partial bills, header against lines, zero-tender bills (H-1 to H-4).
- Bills seen in an earlier file and missing now, overlapping bills, and conflicts of identity (H-10).
- Accepted, rejected, pending and duplicate quantities and values (`PRD-IMP-013`).
- Fields masked or excluded (L-1).

## Open questions

| # | Question | Owner |
| --- | --- | --- |
| 1 | Which POS and version exports each file, and which date format and locale do the exporting PCs use? Can KDPS export CSV with ISO dates and barcodes as text? | KDPS Owner |
| 2 | What does the `Season` tag mean (receipt month, launch, other)? What are the full dates in `Season`? May a "Mon-YY" decode be applied? | KDPS Owner |
| 3 | What do the price bands in `Color`, the `Fit` codes and the category codes mean, and who assigns them? Do the brand division codes (LP, LY, LR, VH, VS, VD, VF, VX, AS, AL, AT) roll up into one brand? | KDPS Owner |
| 4 | Are the Madura, Aditya Birla Fashion and Aditya Birla Lifestyle names one party? | KDPS Owner, CA |
| 5 | Is a barcode that fails the EAN-13 check an in-house code? Which suppliers print barcodes? | KDPS Owner |
| 6 | Were filtered-out rows deliberately excluded? Can KDPS send the whole store export instead of a brand cut? | KDPS Owner |
| 7 | Which value is right when `Bill Amount` differs from the lines, and what is the rounding rule? What does a zero-tender bill with value mean? | Accounts, CA |
| 8 | Does `Card` include UPI? Are sales values and `Rate` tax-inclusive? | Accounts, CA |
| 9 | Can the POS remove a bill after it was exported, and does it keep a trace? Can it give the link from a return to its original bill? | KDPS Owner |
| 10 | Are carry bags stocked items? How are gifts valued? Which items count as gifts? | KDPS Owner, Accounts |
| 11 | Which fields are masked or excluded in the side-by-side test, and who may see cost columns? | KDPS Owner; product owner for the design |
| 12 | How are wrongly dated accounts rows (swapped day and month) to be corrected, and which tolerance applies to rounding differences? | Accounts |
| 13 | Does a barcode missing from a positive-only stock file mean zero stock when comparing with a count? | Product owner |
| 14 | Which multiplier and which tax rule are right in the PT work sheets? | KDPS Owner, CA, product owner |
| 15 | How should amount-only price changes (`Disc%` 0 with a rupee discount) appear in reports? | Product owner |
