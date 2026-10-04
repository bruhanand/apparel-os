# PT file layouts

> **Not ranked.** These notes describe the data KDPS sent. They decide nothing. A PRD or policy change they lead to needs an entry in [decisions.md](../decisions.md) first. See [README.md](README.md).

What the price ticket (PT) files KDPS sent look like, for the import adapters. Two parts: KDPS's own PT template (and one vendor file filled in it), and the 33 vendor files in `docs/data-from-kdps/Q&A-req-recieved/PT FILE/` (see its [README.md](../data-from-kdps/Q&A-req-recieved/PT%20FILE/README.md)). The machine-readable twin is [pt-layouts.json](pt-layouts.json).

- Requirements these files bear on: `PRD-IMP-001` (XLSX, XLS, XLSB and CSV brand PT files), `PRD-IMP-003`, `PRD-IMP-004` (detect a layout from its structure, not from the brand name), `PRD-IMP-005`, `PRD-IMP-006`, `PRD-IMP-007`, `PRD-IMP-009`, `PRD-IMP-011`; `PRD-PTW-002`, `PRD-PTW-008` to `PRD-PTW-013` (the KDPS export profile, costing and tax columns); `PRD-REC-014` to `PRD-REC-018`.
- The folder holds 33 vendor files (an earlier count said 34). Every count below was taken again from the raw files.
- The mapping of vendor columns to the **standard fields** (listed in section 4 and in `pt-layouts.json`) is the analyst's reading. It is not a KDPS decision and not a requirement.
- Formulas, thresholds and multipliers in KDPS's own sheet are **what the sheet does today**. They are not settled policy. Brand cost formulas and tax classes need a signed policy (`POL-03.06`, `POL-03.07`, `POL-10.02`, `POL-10.05`, `POL-10.06`).
- No tax registration numbers, bank details, phone numbers, e-mail addresses or personal names are copied here. Where a file holds them, the note says "present".
- Cost values: only formulas, ratios and totals are given, never per-item cost lists.

Headline facts:

- 33 vendor files, 35 layouts (the workbooks `AMIDHARA.xlsx` and `ambreli 1855.xls` each hold two). Nine layout families (section 3).
- Real formats: 21 files are OOXML workbook (.xlsx); 9 files are BIFF/OLE2 workbook (.xls); 2 files are plain-text CSV; 1 file is OOXML workbook (.xlsb, binary parts). Two extensions lie: `TWILLS.xls` is OOXML and `AS INNERWEAR.csv` is a binary `.xls`. The Madura `.xlsb` is a binary OOXML workbook (the extension is right, but few readers handle it).
- 24 of 35 layouts carry a valid EAN-13 on every row. The others carry internal or partial codes (section 5).
- Quantity above 1 on a row is normal (section 5). KDPS's own layout writes one row per piece.

## 1. KDPS's own PT template

### 1.1 The files

- `docs/data-from-kdps/KDPS PT FILE SHEET.xlsx` (KDPS staff, 21 Jun 2026; the file has no workbook properties and empty drawings, so it is probably a Google Sheets export (guess)). Ten tabs:
  - `Master Sheet`: the drop-down lists (see [item-master-vocabulary.md](item-master-vocabulary.md)). Dimension A1:V999; data in A to L only; AutoFilter A1:L593.
  - Nine work tabs, one per person: `"OWNER" Work Sheet`, `"DEBANJAN" Work Sheet`, `"MAHENDRA" Work Sheet`, `"Office" Work Sheet` (hidden), `"PRAVIN JI " Work Sheet` (hidden, trailing space in the name), `"NARESH" Work Sheet`, `"ANKIT" Work Sheet`, `"SANTOSH" Work Sheet`, ` "GULSHAN" Work Sheet` (leading space). The double quotes are part of the tab names.
- `docs/data-from-kdps/05-reference-data/pt-file-format.xlsx` (saved on 8 Jun 2026 on the ERP side, Excel for Mac): the blank template. Two sheets: `Master Sheet` and `"OWNER" Work Sheet` (2,342 rows, formulas pre-filled, header row 2).
  - Its master lists are older: 590 brands (no `NOSTRUM`, `TOMBOY`), 95 items (no `BOTTLE`, `BUNDY`, `CARDIGAN`), 134 sizes (no `6XL`). Seasons, colours, genders, fits, sub categories, types and GST % are the same.
  - It has drop-downs on columns A to I (lists from `Master Sheet` columns A to I) and on `INPUT TAX` and `OUTPUT TAX` (the `GST %` list). They are stored in a newer extension block, which some readers drop: an earlier survey note that said "no drop-downs" was wrong.
  - It carries an external link to a local copy of `KDPS PT FILE SHEET.xlsx` in a Downloads folder, and a broken defined name `EmptyList` (`#REF!`). The same `EmptyList` name is broken in `KDPS PT FILE SHEET.xlsx`.
- `docs/data-from-kdps/05-reference-data/vendor-files/DA-26-27-0119 VAISHNAVI DEOGHAR PT FILE.xlsx`: a vendor-supplied file in the KDPS layout, values only (section 1.6).

### 1.2 Columns of a work tab

Header on row 2, data from row 3, row 1 holds `SUBTOTAL(9, ...)` over `QTY`, `MRP`, `BASIC`, `P RATE` and `NAG`. Formulas are shown for row 3 of `"OWNER" Work Sheet` (every row repeats them).

| Col | Header | How it is filled | Notes |
| --- | --- | --- | --- |
| A | `SEASON` | Drop-down from `Master Sheet` A | Label such as `SPRING SUMMER(Jun-26)` |
| B | `BRAND` | Drop-down from `Master Sheet` B | 592 brands |
| C | `COLOR` | Drop-down from `Master Sheet` C | Also holds the tags `ECONOMY`, `MEDIUM`, `PREMIUM` instead of a colour. Staff tag goods with no clear colour or classification this way, mostly non-brand goods (product owner, 4 Oct 2026). How the product handles these tags is OPEN for the product owner |
| D | `GENDER` | Drop-down from `Master Sheet` D | 5 values |
| E | `SUB CATEGORY` | Drop-down from `Master Sheet` E | 9 values |
| F | `TYPE` | Drop-down from `Master Sheet` F | 7 values |
| G | `ITEM` | Drop-down from `Master Sheet` G | 98 values |
| H | `FIT` | Drop-down from `Master Sheet` H | 75 values |
| I | `SIZE` | Drop-down from `Master Sheet` I | 135 values; numbers and text mixed |
| J | `BARCODE` | Typed or pasted number | EAN-13 stored as a number (all 320 filled barcodes in the file are valid) |
| K | `DESIGN` | Typed text | The vendor's style or design code |
| L | `HSN` | Typed number | 6 or 8 digits |
| M | `QTY` | Typed number | Pieces on the row |
| N | `MRP` | Typed number | Unit MRP |
| O | `BASIC` | Typed number | Cost base (see `PRD-PTW-010`) |
| P | `P RATE` | Formula (1.2 times `BASIC`) | See 1.3 |
| Q | `INPUT TAX` | Formula (5 or 18) | Also carries a drop-down on the `GST %` list |
| R | `OUTPUT TAX` | Formula (5 or 18) | Also carries a drop-down on the `GST %` list |
| S | `NAG` | Formula `=M3` | Equals `QTY` (`PRD-PTW-011`) |
| T | `MARGIN` | Formula | (`MRP` less `P RATE`) over `MRP`, times 100, not rounded in the cell |
| U | (no header) | Empty | A very narrow column (width 0.33) |
| V | `SUGGESTED SUB CATEGORY` | Formula | Lookup of `ITEM` in the `Master Sheet` item map |
| W | `SUGGESTED TYPE` | Formula | Lookup of `ITEM` in the `Master Sheet` item map |

`PRD-PTW-008` lists the same 20 columns plus the two `SUGGESTED` columns as the KDPS export profile.

### 1.3 The formulas, exactly

```
P RATE (P3):       =IF(O3<>"",O3*1.2,"")
NAG (S3):          =M3
MARGIN (T3):       =IFERROR((N3-P3)*100/N3,"")
SUGGESTED SUB CATEGORY (V3):
  =IF($G3=""," ", IFERROR( VLOOKUP($G3,'Master Sheet'!$G$2:$L$999,5,0),"WRONG ITEM"))
SUGGESTED TYPE (W3):
  =IF($G3=""," ", IFERROR( VLOOKUP($G3,'Master Sheet'!$G$2:$L$999,6,0),"PLEASE RECTIFY "))
```

INPUT TAX (Q3) and OUTPUT TAX (R3) are the same nested `IF`; INPUT TAX compares `BASIC` (column O) with 2500, OUTPUT TAX compares `MRP` (column N) with 2625:

```
=IF(M3="","",
   IF(E3="FABRIC",5,
      IF(G3="SAREE",5,
         IF(OR(G3="BELT",G3="LADIES PURSE",G3="WALLET"),18,
            IF(G3="","",
               IF(AND(F3="LUGGAGE",O3<>""),18,        <- N3 in OUTPUT TAX
                  IF(O3="","",                          <- N3 in OUTPUT TAX
                     IF(O3<=2500,5,18)                  <- N3<=2625 in OUTPUT TAX
                  )))))))
```

In words (order matters, the first test that fits wins):

- No `QTY`: blank.
- `SUB CATEGORY` is `FABRIC`: 5.
- `ITEM` is `SAREE`: 5.
- `ITEM` is `BELT`, `LADIES PURSE` or `WALLET`: 18.
- `ITEM` blank: blank.
- `TYPE` is `LUGGAGE` and the compared value is filled: 18. (The item map gives `BACKPACK`, `DUFFLE BAG` and `TROLLEY` the type `LUGGAGE/ACCESSORIES`, which is not `LUGGAGE`; only `HANDBAG` maps to `LUGGAGE`.)
- Compared value blank: blank.
- Compared value up to the threshold: 5, otherwise 18. The threshold is 2500 on `BASIC` for INPUT TAX and 2625 on `MRP` for OUTPUT TAX. (2625 is 2500 plus 5% (inferred); nothing in the sheet says so.)
- The formulas never return 12 or `TAX FREE`, although both are in the `GST %` list and both cells carry a drop-down on it.
- A margin cell is empty when `MRP` is empty or zero (`IFERROR`). A `P RATE` cell is empty when `BASIC` is empty.

These are what KDPS's sheet does today. `PRD-PTW-010` leaves the exact derivation, tax bases and rounding to the approved costing profile, `POL-03.07` says no brand formula or rate is assumed, and `POL-10.06` says KDPS's classifications, rates and applicability still need verification. Treat every number above as an analyst observation.

### 1.4 Drift between the tabs

Compared cell by cell. The multiplier and the tax formula differ between copies of the same template.

| Tab | State | `P RATE` times | Tax formula | `SUGGESTED` columns | Formula rows | Row-1 `SUBTOTAL` range | AutoFilter |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `OWNER` | visible | 1.2 | current | V, W | 3 to 16342 | rows 3 to 2342 | A2:W16342 |
| `DEBANJAN` | visible | 1.1 | current | V, W | 3 to 2477 | rows 3 to 2313 | A2:T2 (header only) |
| `MAHENDRA` | visible | 1.1 | current | V, W | 3 to 2342 | rows 3 to 1000 | none |
| `Office` | hidden | 1.2 (rows 3 to 1551 only) | current | U, V (shifted one column left, blank fallback `" "`) | 3 to 2342 (`P`, `S`, `T` only to 1551) | rows 3 to 1551 | A2:T2342 |
| `PRAVIN JI ` | hidden | 1.1 | older: no `FABRIC` test; only `SAREE` and `BELT`; threshold 2625 on both `BASIC` and `MRP` | none | 3 to 1000 | rows 3 to 1000 | none |
| `NARESH` | visible | 1.2 | current | V, W | 3 to 2342 | rows 3 to 1000 | A2:T57 (data runs to row 245) |
| `ANKIT` | visible | 1.2 | current | V, W | 3 to 1000 | rows 3 to 1000 | none |
| `SANTOSH` | visible | 1.2 (blank at row 1000) | current | V, W | 3 to 1000 | `BASIC` sum runs `O5:O10003`; the others rows 3 to 1000 | none |
| `GULSHAN` | visible | 1.2 | current | V, W | 3 to 1000 | rows 3 to 1000 | A2:T1000 |

Other differences between tabs:

- The `BRAND` drop-down on `DEBANJAN`, `MAHENDRA` and `SANTOSH` carries a stray input prompt that is a first name (present, not copied); `Office` has the prompt `Connect with "HO"` on `SEASON` and `COLOR`. All tabs have the prompt `Click and enter a value from range` on `INPUT TAX` and `OUTPUT TAX`.
- `OWNER` is formatted down to row 16342; the other tabs to row 1000 or 2342.
- Margin cells are formulas on every tab. An earlier survey note said `SANTOSH` has a hard-coded margin of 22; that is not so: its margin cells are formulas that evaluate to exactly 22 because `BASIC` is 65% of `MRP` on all 13 lines (so `P RATE` is 78% of `MRP`).

### 1.5 What the tabs hold

About 320 PT lines in all (every line dated `SPRING SUMMER(Jun-26)` unless noted).

| Tab | Lines | Pieces | Brand | What | Tax cells |
| --- | --- | --- | --- | --- | --- |
| `NARESH` | 243 (rows 3 to 245) | 310 | `LEVIS` | `PREMIUM`, `MALE`, `CASUAL WEAR`; `T-SHIRT` 90, `JEANS` 85, `SHIRT` 67, `CARGO` 1; `SLIM` fit on 168 lines | `INPUT TAX` 5 on 188 lines, 18 on 55; `OUTPUT TAX` 18 on 179, 5 on 64; 124 lines have `MRP` above 2625 and `BASIC` up to 2500, so input is 5 and output is 18 |
| `ANKIT` | 41 | 62 | `VAN HEUSEN` | `PREMIUM`, `MALE`, `REGULAR`; `INNERWEAR` 23, `NIGHTWEAR` 11, `CASUAL WEAR` 7; items `SHORTS` 15, `LOWER` 11, `T-SHIRT` 7, `BRIEF` 4, `VEST` 4 | 5 and 5 on every line |
| `GULSHAN` | 22 | 34 | `VAN HEUSEN` | `ECONOMY`, `MALE`, `REGULAR`; `BRIEF` 10, `LOWER` 7, `VEST` 5 | 5 and 5 on every line |
| `SANTOSH` | 13 (rows 3 to 15) | 13 | `STATUS QUO` 12, `FLYING MACHINE` 1; season `SPRING SUMMER(May-26)` | `T-SHIRT`, `SLIM`; one barcode used twice; the `FLYING MACHINE` line carries a `STATUS QUO` design code (a wrong brand pick? inferred). 48 further rows (17 to 64) hold only a pre-filled `FIT` of `SLIM` and the formulas | 5 and 5 |
| `MAHENDRA` | 1 | 90 | `TOMBOY` | `KIDS MALE` `SHORTS`, size `5-6 Y` | 5 and 5 |
| `OWNER`, `DEBANJAN`, `Office`, `PRAVIN JI ` | 0 | 0 | | Empty (formulas only) | |

- `NARESH` margins run from 17.87 to 29.85 (cell values). `ANKIT` lines cluster at 20.00 and 14.29; `GULSHAN` at 20.00, 16.57 and 15.43.
- All 320 filled barcodes are 13-digit EANs stored as numbers; the only repeat is one `SANTOSH` barcode.

### 1.6 Worked example: vendor invoice 0119 and its PT file

Files: `docs/data-from-kdps/05-reference-data/vendor-files/VSN DEO DA-26-27-0119.pdf` (6 pages, image only, skewed, with handwritten marks on the tax table) and `DA-26-27-0119 VAISHNAVI DEOGHAR PT FILE.xlsx` (same folder).

**The invoice** (read from the page images):

- Seller `D Apparel`, Ranchi. Invoice `DA/26-27/0119`, 20 Apr 2026, due in 30 days. Billed and shipped to `KDPS LIFESTYLE PRIVATE LIMITED-DEO` (Deoghar). Place of supply Jharkhand.
- 102 lines (`SR NO` 1 to 102), each with a product name that packs style, colour, a running number and size (`SQ-CL-26099 (PKT) WHITE 617 3XL`), plus `Size / Qty : 3XL 1`. Total 124.00 pieces.
- Per line: `HSN CODE`, `MRP`, `QTY`, `RATE`, `Disc %` (empty), `TAXABLE AMOUNT`, `GST %` (5), `CGST AMT`, `SGST AMT`, `TOTAL`.
- Sub total (taxable) 1,14,156.90. `DISCOUNT ALLOWED` empty. `Motiya` 50.00. `Bus Fare` empty. CGST 2,855.03, SGST 2,855.03. `Rounding Off` 0.04. Grand total 1,19,917.00.
- HSN summary: 61091000 taxable 90,422.68 and 61033200 taxable 23,784.22, each with a handwritten mark beside it (they read as 99 and 25, which match the PT file's piece counts; inferred); total taxable 1,14,206.90, which is the sub total plus the 50.00 `Motiya`; CGST and SGST 2.5% each, total tax 5,710.06.
- Check: 1,14,156.90 + 50.00 + 5,710.06 + 0.04 = 1,19,917.00.
- The `RATE` of each line is 65% of its `MRP` (line 1: 1,649.00 gives 1,071.85). Summed over the 124 pieces, `MRP` times 0.65 is exactly 1,14,156.90.

**The PT file** (`Sheet1`, header row 1, the 20 KDPS columns, values only, no formulas):

- 124 piece rows (`QTY` 1 on each), 102 distinct barcodes: 81 barcodes once, 20 twice, 1 three times. 102 matches the invoice's 102 lines; 124 matches its 124 pieces.
- Fixed values: season `SPRING SUMMER(Apr-26)`, brand `STATUS QUO`, colour `PREMIUM`, sub category `CASUAL WEAR`, fit `SLIM`, `INPUT TAX` 5, `OUTPUT TAX` 5, `NAG` 1, `MARGIN` 22. Gender `MALE` on 62 rows and `KIDS MALE` on 62. `T-SHIRT` 99 rows (`TOP WEAR`, HSN 61091000) and `LOWER` 25 rows (`BOTTOM WEAR`, HSN 61033200): these match the handwritten marks on the invoice (inferred).
- 12 designs (`SQ-CL-26099 (PKT)`, `SQ-CL-26037`, `CR-TRK-111`, `TRK-26269`, `KD-CL-8011` and others). Sizes: `S` to `4XL` for men, `8` to `16` (stored as numbers) for kids.
- All 124 barcodes are valid EAN-13. A stray last row (sheet row 126) holds only season, brand, colour and fit.

**Where the two differ:**

| Quantity | Invoice | PT file | Gap |
| --- | --- | --- | --- |
| Pieces | 124 | 124 | 0 |
| Lines | 102 | 102 distinct barcodes | 0 |
| Taxable value | 1,14,156.90 | sum of `BASIC` 1,14,115 | 41.90 less in the PT file |
| Tax | 5% (HSN summary) | `INPUT TAX` 5 and `OUTPUT TAX` 5 | none |

- **Rounding gap.** `BASIC` is rounded to a whole rupee on every row (it is `MRP` times 0.65, rounded). The invoice keeps paise. Summed, `BASIC` is 41.90 below the invoice (0.04%).
- **`P RATE` is not `BASIC` times 1.2.** `P RATE` holds `MRP` times 0.78 to the paise (for example 935.22 on an `MRP` of 1,199 where `BASIC` is 779), which is the unrounded base times 1.2. The ratio of `P RATE` to the rounded `BASIC` runs from 1.1998 to 1.2006. Sum of `P RATE` is 1,36,988.28.
- **`MARGIN` is a constant 22**, which follows from `P RATE` being 78% of `MRP`. It is a consequence of the rate being 65% of `MRP`, not a measured margin.
- **Per HSN.** Summed from the PT file, the 99 T-shirts come to 90,383.15 and the 25 lowers to 23,773.75 at 65% of `MRP`. The invoice's HSN table shows 90,422.68 and 23,784.22: the 50.00 `Motiya` sits inside those two figures (39.53 and 10.47). How it was split is not stated.
- **Charges.** `Motiya` (50.00) and `Bus Fare` (empty) are invoice charges that no PT column carries; `Rounding Off` (0.04) is likewise outside the PT. See `PRD-PTW-010` (additions belong to the costing profile) and `PRD-REC-010` (nightly invoice, GRN and PT comparison).
- **Same vendor, next invoice.** `STATUS QUO.xlsx` (invoice `DA/26-27/0160`, 1 May 2026) has the same 65% rate on all 43 lines.
- **Who filled it.** The file has no author properties that settle it. Whether the vendor or KDPS typed the template is OPEN.

### 1.7 What this means for adapters

- A vendor file can arrive already in the KDPS layout (values only, header on row 1). The reader must not assume the work-sheet header on row 2 (`PRD-IMP-004`).
- `BASIC`, `P RATE` and `MARGIN` can be supplied values, deterministic calculations or both (`PRD-IMP-006`, `PRD-PTW-013`). In the example they disagree by rounding; verification of both supplied values needs a tolerance from the costing profile (`POL-03.06`).
- `INPUT TAX` and `OUTPUT TAX` are classifications for the approved profile (`PRD-PTW-012`); the sheet's 5 or 18 rule is a draft for the CA (`POL-10.02`, `POL-10.05`).
- The `SUGGESTED` columns are master hints, not identity (`PRD-PTW-012`).
- One row per piece (as in the example) and one row per barcode with a quantity (as in most vendor files) both occur. The PT must reconcile every row to the receipt quantity (`PRD-REC-016`).

## 2. The 33 vendor files

One section per file, in the order of the layout families (section 3). For each: vendor, document kind, real format, sheet, header row, rows and pieces, exact columns, the mapping to the standard fields, barcode kind, missing fields, quirks and difficulty.

- "Item rows" are rows with a barcode and a numeric quantity, after the skipped rows. "Pieces" is the sum of the quantity column.
- Header names are given after trimming leading and trailing spaces. Files where the raw names carry stray spaces: `JOCKEY 852.xls`, `JOCKEY PARAS.xls`, `JOCKEY-NARAYANI.xls`, `JOCKEY-NARVADA.xls`, `JOCKEY_DD SALES.xls`, `Peter England.CSV` (every name padded), `SWEET DREAMS.xlsx`, `AMIDHARA.xlsx` (sheet `ANOKHI`), `STATUS QUO.xlsx` (`Bill  No` has two spaces inside).
- Text in square brackets, such as `[col G: ...]`, names a column that has no header text.
- Brand-to-supplier statements come from `SUPPLIER BRAND DETAILS.xlsx` (see [item-master-vocabulary.md](item-master-vocabulary.md)). The barcode flag is its `BARCODE` sheet (YES or NO per supplier).

### 2.1. `36257 KDPS SUVIDHI.xls`

- **Vendor:** Not named inside the file. The file name carries `36257` (invoice number, guess) and `SUVIDHI`. `SUPPLIER BRAND DETAILS.xlsx` lists a supplier `SUVIDHI TEXTILES PRIVATE LIMITED` with barcode flag YES (guess: the same business).
- **Document kind:** Item list from the vendor's billing software; no invoice header and no totals row. Family F1 (item-list).
- **Real format:** BIFF/OLE2 workbook (.xls).
- **Document:** No invoice number or date inside the file.
- **Sheet:** `Sheet1`; header row 1; data from row 2.
- **Skip:** rows whose `Item Code` is blank (a filler row at sheet row 57: `SNO.` 56, quantity 1, no rate).
- **Size:** 55 item rows, 55 pieces, 55 distinct barcodes (sheet holds 57 rows in all).
- **Columns, in order** (11 named columns and 1 unnamed with data): `SNO.`, `Item Code`, `ITEM NAME`, [col D: style code, for example 12702C], `PACK / SIZE`, `LOT NUMBER`, `TOTAL QTY`, `C.D.`, `T.D.`, `SALE RATE`, `AMOUNT`, `M.R.P.`.
- **Mapping to standard fields:** design = `[col D, blank header]`; item_description = `ITEM NAME`; size = `PACK / SIZE`; barcode = `Item Code`; qty = `TOTAL QTY`; mrp = `M.R.P.`; cost = `SALE RATE`; line_total = `AMOUNT`.
- **Not mapped:** `SNO.`, `LOT NUMBER`, `C.D.`, `T.D.`.
- **Missing:** vendor, buyer, invoice_no, invoice_date, brand, season, colour, gender, fit, hsn, gst_rate.
- **Barcode:** internal numeric code; 55 rows of 12 characters; 0 of 55 pass the EAN-13 check.
- **Quirks:**
  - Every cell is text, including quantities, rates and amounts.
  - `LOT NUMBER` holds a full stop on all 55 rows. `C.D.` and `T.D.` (discount columns) hold 0.
  - `PACK / SIZE` carries a body measure, for example `XL (105 CMS)`.
  - Colour is not a column. It follows the style code inside `ITEM NAME` (style, then a colour word).
  - `Item Code` is 12 digits starting 897 and fails the EAN-13 check; 4 of the 55 pass a UPC-A check, which looks like chance (inferred).
  - A trailing filler row has no `Item Code`: skip rows without a barcode.
- **Difficulty:** Easy (One header row, one row per piece, no layout tricks.)

### 2.2. `FAHRENHEIT 60518.xls`

- **Vendor:** Not named inside the file. The file name carries `60518` (invoice number, guess) and `FAHRENHEIT`. `SUPPLIER BRAND DETAILS.xlsx` maps the brand `FAHRENHEIT` to `INDTECH APPARELS PVT. LTD.` (barcode flag YES).
- **Document kind:** Item list from the vendor's billing software; no invoice header. Family F1 (item-list).
- **Real format:** BIFF/OLE2 workbook (.xls).
- **Document:** No invoice number or date inside the file.
- **Sheet:** `Sheet1`; header row 1; data from row 2.
- **Skip:** rows whose `Item Code` is blank (a filler row at sheet row 33: `SNO.` 32, quantity 1, rate 0, `TAX 3` 5).
- **Size:** 31 item rows, 35 pieces, 31 distinct barcodes (sheet holds 33 rows in all).
- **Columns, in order** (15 named columns): `SNO.`, `Item Code`, `ITEM NAME`, `PACK / SIZE`, `TOTAL QTY`, `M.R.P`, `REVISED M.R.P.`, `SALE RATE`, `AMOUNT`, `GROUP NAME`, `LOT NUMBER`, `TAX 1`, `TAX 2`, `TAX 3`, `HSN CODE`.
- **Mapping to standard fields:** item_description = `ITEM NAME`; category = `GROUP NAME`; size = `PACK / SIZE`; barcode = `Item Code`; hsn = `HSN CODE`; gst_rate = `TAX 3`; qty = `TOTAL QTY`; mrp = `M.R.P`; cost = `SALE RATE`; line_total = `AMOUNT`.
- **Not mapped:** `SNO.`, `REVISED M.R.P.`, `LOT NUMBER`, `TAX 1`, `TAX 2`.
- **Missing:** vendor, buyer, invoice_no, invoice_date, brand, season, colour, gender, fit.
- **Barcode:** EAN-13; 31 rows of 13 characters; 31 of 31 pass the EAN-13 check.
- **Quirks:**
  - The OLE2 container is damaged (size is not 512 plus a multiple of the sector size; the short-stream tables disagree). A strict reader fails; a tolerant one reads it.
  - Numbers are stored as text.
  - `REVISED M.R.P.` equals `M.R.P` on every row.
  - Only `TAX 3` is filled (5, a percentage). `TAX 1` and `TAX 2` are empty.
  - `GROUP NAME` is `T-SHIRTS` on all rows. HSN is 61059090 on 27 rows and 61099090 on 4.
  - `PACK / SIZE` has two forms: `M/1.05 m`, `L/1.10 m`, `XL/1.15 m`, `2XL/1.20 m` (24 rows) and `XL    (1 MTR.5 CM.)`, `L     (1 MTR.)`, `M     (95 CM)`, `2XL   (1 MTR.10CM)` (7 rows). The size is the text before the first space or slash.
  - Colour follows the style code inside `ITEM NAME`.
  - `LOT NUMBER` is `IND` on 30 rows and `1` on one row.
- **Difficulty:** Easy (Simple table; only the damaged container needs a tolerant parser.)

### 2.3. `AMIDHARA.xlsx`

- **Vendor:** Not named inside the file. The two sheets are named for the brands `ANOKHI` and `AMIDHARA`; the data says `ANOKKHI` and `AMIDHARA`. `SUPPLIER BRAND DETAILS.xlsx` maps both `AMIDHARA` and `ANOKKHI` to `SHRI SAI ENTERPRISES` (barcode flag YES).
- **Document kind:** Two item lists in one workbook, one sheet per brand, with different columns. Family F1 (item-list).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** No invoice number or date inside the file.
- **Layout, sheet `ANOKHI`:**
  - Header row 1; data from row 2.
  - **Size:** 16 item rows, 16 pieces, 16 distinct barcodes (sheet holds 17 rows in all).
  - **Columns, in order** (10 named columns and 1 unnamed with data): `Barcode`, [col B: brand, `ANOKKHI`], `Item Code`, `Description`, `Category`, `Color`, `Size`, `Quantity`, `MRP`, `HSN Code`.
  - **Mapping to standard fields:** brand = `[col B, blank header]`; design = `Item Code`; item_description = `Description`; category = `Category`; colour = `Color`; size = `Size`; barcode = `Barcode`; hsn = `HSN Code`; qty = `Quantity`; mrp = `MRP`.
  - **Not mapped:** [col D, header ` Item Code` with a leading space: brand plus code].
  - **Missing:** vendor, buyer, invoice_no, invoice_date, season, gender, fit, gst_rate, cost.
  - **Barcode:** internal numeric code; 16 rows of 10 characters; 0 of 16 pass the EAN-13 check.
- **Layout, sheet `AMIDHARA`:**
  - Header row 1; data from row 2.
  - **Size:** 48 item rows, 48 pieces, 48 distinct barcodes (sheet holds 49 rows in all).
  - **Columns, in order** (10 named columns): `Barcode`, `Item Code`, `Category`, `Color`, `Brand`, `Brand Item Code`, `Size`, `Quantity`, `MRP`, `HSN Code`.
  - **Mapping to standard fields:** brand = `Brand`; design = `Item Code`; category = `Category`; colour = `Color`; size = `Size`; barcode = `Barcode`; hsn = `HSN Code`; qty = `Quantity`; mrp = `MRP`.
  - **Not mapped:** `Brand Item Code`.
  - **Missing:** vendor, buyer, invoice_no, invoice_date, season, gender, fit, gst_rate, cost.
  - **Barcode:** internal numeric code; 48 rows of 10 characters; 0 of 48 pass the EAN-13 check.
- **Quirks:**
  - One workbook holds two layouts; a reader must choose the layout per sheet.
  - `Barcode` is a 10-digit integer: 893... on `ANOKHI` (16 rows) and 111... on `AMIDHARA` (48 rows). Neither is an EAN-13.
  - Quantity is 1 on every row. MRP rises by 100 for each size step (sizes 24, 26, 28 ... 36).
  - `Size` is a plain number (24 to 36), with no unit.
  - `ANOKHI` has two columns named `Item Code` (one with a leading space): once the names are trimmed they collide.
  - `Category` is `KIDS SAREE` on the first sheet and `JACKET PLAZO` or `PLAZOO` on the second.
  - HSN is 6 digits (620443) on the rows seen.
  - No cost, GST, invoice, vendor, buyer, season, gender or fit.
- **Difficulty:** Easy (Two tiny tables; the only trap is the two layouts and the duplicate header name.)

### 2.4. `peppermint 13.xlsx`

- **Vendor:** Not named inside the file. The file name carries `13` (invoice number, guess); the brand `PEPPERMINT` maps to `GEETANSHI APPARELS` in `SUPPLIER BRAND DETAILS.xlsx` (barcode flag YES).
- **Document kind:** Item-master style list from the vendor's billing software, with the richest master data of all 33 files. Family F1 (item-list).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** No invoice number, date, vendor or buyer inside the file.
- **Sheet:** `Sheet1`; header row 1; data from row 2.
- **Size:** 24 item rows, 24 pieces, 24 distinct barcodes (sheet holds 25 rows in all).
- **Columns, in order** (22 named columns): `Stock No`, `Item Description`, `Product`, `Brand`, `Style`, `Shade`, `Size`, `Retail Price`, `Cost Price`, `GST Group`, `UOM`, `GST %`, `HSN Code`, `GENDER`, `SEASON`, `Style Name`, `Short Name`, `TransRate`, `TransQty`, `Discount %`, `Discount Amount`, `Item Remarks`.
- **Mapping to standard fields:** brand = `Brand`; season = `SEASON`; design = `Style`; item_description = `Item Description`; category = `Product`; colour = `Shade`; gender = `GENDER`; size = `Size`; barcode = `Stock No`; hsn = `HSN Code`; gst_rate = `GST %`; qty = `TransQty`; mrp = `Retail Price`; cost = `Cost Price`.
- **Not mapped:** `GST Group`, `UOM`, `Style Name`, `Short Name`, `TransRate`, `Discount %`, `Discount Amount`, `Item Remarks`.
- **Missing:** vendor, buyer, invoice_no, invoice_date, fit.
- **Barcode:** EAN-13; 24 rows of 13 characters; 24 of 24 pass the EAN-13 check.
- **Quirks:**
  - `Cost Price` equals `TransRate` on all 24 rows and is 65% of `Retail Price` on all 24 rows.
  - `SEASON` is a code (`SS26`), `GENDER` is `Girls` (a mixed-case spelling, not the master's `FEMALE` / `KIDS FEMALE`).
  - `Style Name` repeats `Style`. `Short Name` and `Item Remarks` are empty. `Discount %` and `Discount Amount` are 0.
  - `Stock No` is stored as text (13-digit EAN-13, valid).
  - `Item Description` is a short generic name (`Skirt & Top`, `Pant & Top`); `Product` is the item word (`SKIRT SET`, `PANT SET`).
  - No fit column.
- **Difficulty:** Easy (Clean single table with the most fields.)

### 2.5. `minelli 06161.xlsx`

- **Vendor:** `Firm` column: `SHUBH SHRI CLOTHING PRIVATE LIMITED` (the brand `MINELLI` maps to the same supplier in `SUPPLIER BRAND DETAILS.xlsx`, barcode flag YES).
- **Document kind:** Item list with an invoice number but no date. Family F1 (item-list).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `Invoice No` is `SS/25-26/06161` on every row; no invoice date.
- **Sheet:** `Table`; header row 1; data from row 2.
- **Skip:** the last row (empty barcode, quantity total only).
- **Size:** 10 item rows, 10 pieces, 10 distinct barcodes (sheet holds 12 rows in all).
- **Columns, in order** (18 named columns): `BarCode No`, `Category`, `Firm`, `Brand`, `Style`, `Shade`, `Size`, `Item Desc`, `MRP`, `DP`, `Cost Price`, `Tax`, `Gender`, `HSN Code`, `Qty`, `Invoice No`, `PDT`, `Party Name`.
- **Mapping to standard fields:** vendor = `Firm`; buyer = `Party Name`; invoice_no = `Invoice No`; brand = `Brand`; design = `Style`; item_description = `Item Desc`; category = `Category`; colour = `Shade`; gender = `Gender`; size = `Size`; barcode = `BarCode No`; hsn = `HSN Code`; gst_rate = `Tax`; qty = `Qty`; mrp = `MRP`; cost = `Cost Price`.
- **Not mapped:** `DP`, `PDT`.
- **Missing:** invoice_date, season, fit.
- **Barcode:** internal numeric code; 10 rows of 10 characters; 0 of 10 pass the EAN-13 check.
- **Quirks:**
  - Every value is text, including `MRP` (`2599.00`), `Qty` (`1.000`) and `Tax` (`5.00`).
  - `BarCode No` is a 10-digit text starting 251; `PDT` repeats it as `barcode;1`.
  - `DP` equals `MRP` on all rows.
  - `Gender` and `Party Name` columns exist but are empty. Column I (between `Item Desc` and `MRP`) has no header and no data.
  - `Shade` is `A` or `B` (5 rows each), not a colour. `Size` is a measure with the size letter in brackets: `96CM(M)`, `1.02M(L)`, `1.08M(XL)`, `1.14M(2XL)`, `1.20M(3XL)`.
- **Difficulty:** Easy (One table; all text, so every number needs parsing.)

### 2.6. `kidcity 1316&1317.xlsx`

- **Vendor:** Not named inside the file. The brand `KIDCITY` maps to `KIDCITY SOLUTIONS PVT. LTD.` in `SUPPLIER BRAND DETAILS.xlsx` (barcode flag YES). The `INV` prefix is `KC`.
- **Document kind:** One sheet holding two invoices, with a filter that hides the rows of the first. Family F1 (item-list).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `INV` is `KC/25-26/1316` on 228 rows and `KC/25-26/1317` on 44 rows; no date, vendor or buyer.
- **Sheet:** `BILLING FILE`; header row 1; data from row 2.
- **Size:** 272 item rows, 512 pieces, 256 distinct barcodes (16 rows repeat one) (sheet holds 273 rows in all).
- **Columns, in order** (10 named columns and 1 unnamed with data): `VSKU`, `Age Group`, `Color`, `Gender`, `Category Name`, `Price`, [col G: formula `=F2-(35.5/100*F2)`: price less 35.5%], `SKU No`, `QTY`, `PKG NO`, `INV`.
- **Mapping to standard fields:** invoice_no = `INV`; design = `VSKU`; category = `Category Name`; colour = `Color`; gender = `Gender`; size = `Age Group`; barcode = `SKU No`; qty = `QTY`; mrp = `Price`; cost = `[col G, blank header, formula]`.
- **Not mapped:** `PKG NO`.
- **Missing:** vendor, buyer, invoice_date, brand, season, fit, hsn, gst_rate.
- **Barcode:** internal numeric code; 272 rows of 13 characters; 31 of 272 pass the EAN-13 check.
- **Quirks:**
  - An AutoFilter hides sheet rows 2 to 229 (all 228 rows of invoice 1316). A reader that skips hidden rows sees only 44 rows.
  - `SKU No` is 13 digits starting 820, sequential (8200954001001 to 8202330001711), and fails the EAN-13 check on 241 of 272 rows: an internal number, not an EAN.
  - 16 `SKU No` values appear in both invoices (256 distinct codes on 272 rows).
  - `Price` is text on 140 rows and a number on 132 rows.
  - Column G has no header; each cell is a formula (price less 35.5%), so the file carries a cost the vendor did not label.
  - `PKG NO` is `A` (228 rows) or `B` (44 rows).
  - `Gender` spelling varies by case (`Girls`, `GIRLS`, `Boys`, `BOYS`). `Color` also varies by case (`White`, `WHITE`).
  - `Age Group` is written `7-8Y` with no space, where the master list writes `7-8 Y`.
  - Quantity is 2 on 226 rows, 1 on 41, 4 on 4 and 3 on 1 (512 pieces on 272 rows).
  - No HSN, GST, date, vendor, buyer, brand or season.
- **Difficulty:** Medium (Hidden rows, two invoices in one sheet, internal SKUs and a hidden formula column.)

### 2.7. `ARVIND ALL BRAND & SPYKAR_PT.xlsx`

- **Vendor:** Not named inside the file (no vendor name or tax number). The data is Flying Machine (`FM`); `SUPPLIER BRAND DETAILS.xlsx` maps `FM` to `VISHAL MARKETING` (barcode flag YES). The file name mentions `ARVIND` and `SPYKAR`.
- **Document kind:** Sales-register export from the vendor's accounting software, with e-invoice columns. Family F2 (voucher-register).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `Voucher No` `S/26-27/596`, `Voucher Date` 21 May 2026, buyer `KDPS LIFESTYLE PVT LTD`.
- **Sheet:** `Sheet1`; header row 5; data from row 6.
- **Skip:** rows 1 to 4 (a merged title block); the `Grand Total :` row in column A.
- **Size:** 11 item rows, 13 pieces, 11 distinct barcodes (sheet holds 17 rows in all).
- **Columns, in order** (31 named columns): `Voucher No`, `Voucher Date`, `Party Name`, `Narration`, `Vehicle Number`, `Stock No`, `Item Description`, `Product`, `Brand`, `Style`, `Shade`, `Size`, `Sales Qty`, `Bill Level Disc. Amt.`, `Bill Level Disc. Per.`, `Total Discount`, `Net Amount`, `Retail Price`, `Item Rate`, `Item Base Value`, `Tax Percentage`, `Tax Amount`, `Item Net Amount`, `Taxable Value`, `HSN Code`, `Season`, `IRN No`, `Ack No`, `Ack Date`, `IRN Status`, `IRN Cancel Date`.
- **Mapping to standard fields:** buyer = `Party Name`; invoice_no = `Voucher No`; invoice_date = `Voucher Date`; brand = `Brand`; season = `Season`; design = `Style`; item_description = `Item Description`; category = `Product`; colour = `Shade`; size = `Size`; barcode = `Stock No`; hsn = `HSN Code`; gst_rate = `Tax Percentage`; qty = `Sales Qty`; mrp = `Retail Price`; cost = `Item Rate`; taxable_value = `Taxable Value`; tax_amount = `Tax Amount`; line_total = `Item Net Amount`.
- **Not mapped:** `Narration`, `Vehicle Number`, `Bill Level Disc. Amt.`, `Bill Level Disc. Per.`, `Total Discount`, `Net Amount`, `Item Base Value`, `IRN No`, `Ack No`, `Ack Date`, `IRN Status`, `IRN Cancel Date`.
- **Missing:** vendor, gender, fit.
- **Barcode:** EAN-13; 11 rows of 13 characters; 11 of 11 pass the EAN-13 check.
- **Quirks:**
  - Rows 1 to 4 are a merged title (`A1:AE4`); the header is row 5.
  - The file name promises `ALL BRAND & SPYKAR` but every row is `FM` (Flying Machine). `Narration` reads `FM EXTRA STOCK  CORRECTION AGAINST BILL` on every row: this may not be a normal goods-in (OPEN).
  - `Season` is a code per row (`AW24`, `SS25`).
  - E-invoice fields `IRN No`, `Ack No`, `Ack Date`, `IRN Status` (`ACT`) and `IRN Cancel Date` are present.
  - `Vehicle Number`, `Bill Level Disc. Amt.`, `Bill Level Disc. Per.` and `Total Discount` carry no information on these rows (0 or empty).
  - `Stock No` is a text EAN-13 (valid, prefix 890). Two rows have quantity 2 (11 rows, 13 pieces).
- **Difficulty:** Easy (Clean register; skip the title block and the total row.)

### 2.8. `BK ENTERPRISES_LC_PT.xlsx`

- **Vendor:** Not named inside the file. The brand is `LITTLE PINK`; `SUPPLIER BRAND DETAILS.xlsx` maps `LITTLE PINK` and `LINEN CLUB` to `B.K ENTERPRISES` (barcode flag YES). The file name carries `BK ENTERPRISES` and `LC`.
- **Document kind:** Sales-register export from the vendor's accounting software. Family F2 (voucher-register).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `Voucher Type` `Sales`, `Voucher No` `S/55`, `Voucher Date` 14 Apr 2026, buyer `KDPS LIFE STYLE PVT. LTD.` (spelled with a space in LIFE STYLE).
- **Sheet:** `Sheet1`; header row 5; data from row 6.
- **Skip:** rows 1 to 4 (a merged title block); the `Grand Total :` row in column A.
- **Size:** 13 item rows, 13 pieces, 13 distinct barcodes (sheet holds 19 rows in all).
- **Columns, in order** (28 named columns): `Voucher Type`, `Voucher No`, `Voucher Date`, `Party Name`, `Narration`, `Sales Man`, `Stock No`, `Item Description`, `Product`, `Brand`, `Style`, `Shade`, `Size`, `Sales Qty`, `Total Discount`, `Net Amount`, `Retail Price`, `Item Rate`, `Item Base Value`, `Tax Amount`, `Add on Amount`, `Deduction Amount`, `Item Net Amount`, `Taxable Value`, `CGST Amount`, `SGST Amount`, `HSN Code`, `Season`.
- **Mapping to standard fields:** buyer = `Party Name`; invoice_no = `Voucher No`; invoice_date = `Voucher Date`; brand = `Brand`; season = `Season`; design = `Style`; item_description = `Item Description`; category = `Product`; colour = `Shade`; size = `Size`; barcode = `Stock No`; hsn = `HSN Code`; qty = `Sales Qty`; mrp = `Retail Price`; cost = `Item Rate`; taxable_value = `Taxable Value`; tax_amount = `Tax Amount`; line_total = `Item Net Amount`.
- **Not mapped:** `Voucher Type`, `Narration`, `Sales Man`, `Total Discount`, `Net Amount`, `Item Base Value`, `Add on Amount`, `Deduction Amount`, `CGST Amount`, `SGST Amount`.
- **Missing:** vendor, gender, fit, gst_rate.
- **Barcode:** EAN-13; 13 rows of 13 characters; 13 of 13 pass the EAN-13 check.
- **Quirks:**
  - No GST percentage column: only `Tax Amount`, `CGST Amount` and `SGST Amount` (each CGST and SGST is half of the tax).
  - `Shade` is `A` or `B`, which is not a colour.
  - `Stock No` is a text EAN-13 with a valid check digit and prefix 777 (the Indian prefix is 890): probably vendor-made (inferred).
  - The first row shows 1184.15 in `Net Amount` and `Item Net Amount`, while the next rows at the same rate show 1184.51 (transposed digits, inferred).
  - `Sales Man`, `Add on Amount` and `Deduction Amount` carry no information on these rows.
  - 13 rows, 13 pieces.
- **Difficulty:** Easy (Clean register; the tax percentage must be derived.)

### 2.9. `DEAL SS26 2970.xlsx`

- **Vendor:** `Party Name` is `OM GANPATI ENTERPRISES` and a `GSTIN` column holds its tax number (present, not copied). In sibling register files `Party Name` is the buyer, so this is probably the invoiced party, not the seller (inferred). The vendor is not named. `SUPPLIER BRAND DETAILS.xlsx` maps the brand `DEAL` to `VISHAL MARKETING` (barcode flag YES). The debit-and-credit-note workbook names `Om Ganpati Enterprises` as one of two legal entities; the supplier list also has `OM GANPATI (DMK)` (OPEN).
- **Document kind:** Sales-register export from the vendor's accounting software. Family F2 (voucher-register).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `Voucher No` `S/25-26/2970`, `Voucher Date` 3 Feb 2026. `Narration` reads `DEAL SS26 (JAINSONS LIFESTYLE)`: the goods are named for the Hazaribagh store `Jainsons-Lifestyle`.
- **Sheet:** `Sheet1`; header row 5; data from row 6.
- **Skip:** rows 1 to 4 (a merged title block); the `Grand Total :` row in column A.
- **Size:** 55 item rows, 108 pieces, 55 distinct barcodes (sheet holds 61 rows in all).
- **Columns, in order** (37 named columns): `Voucher Type`, `Voucher No`, `Voucher Date`, `Party Name`, `GSTIN`, `Narration`, `Tax Type`, `Additional Info.`, `Stock No`, `Item Description`, `Product`, `Brand`, `Style`, `Shade`, `Size`, `Sales Qty`, `Bill Level Disc. Amt.`, `Bill Level Disc. Per.`, `Total Discount`, `Net Amount`, `Retail Price`, `Item Rate`, `Tax Percentage`, `Tax Amount`, `Add on Amount`, `Deduction Amount`, `Item Net Amount`, `Taxable Value`, `CGST Rate`, `CGST Amount`, `SGST Rate`, `SGST Amount`, `HSN Code`, `Total Value (MRP)`, `Purchase Price`, `TCS Amount`, `Season`.
- **Mapping to standard fields:** buyer = `Party Name`; invoice_no = `Voucher No`; invoice_date = `Voucher Date`; brand = `Brand`; season = `Season`; design = `Style`; item_description = `Item Description`; category = `Product`; colour = `Shade`; size = `Size`; barcode = `Stock No`; hsn = `HSN Code`; gst_rate = `Tax Percentage`; qty = `Sales Qty`; mrp = `Retail Price`; cost = `Item Rate`; taxable_value = `Taxable Value`; tax_amount = `Tax Amount`; line_total = `Item Net Amount`.
- **Not mapped:** `Voucher Type`, `GSTIN`, `Narration`, `Tax Type`, `Additional Info.`, `Bill Level Disc. Amt.`, `Bill Level Disc. Per.`, `Total Discount`, `Net Amount`, `Add on Amount`, `Deduction Amount`, `CGST Rate`, `CGST Amount`, `SGST Rate`, `SGST Amount`, `Total Value (MRP)`, `Purchase Price`, `TCS Amount`.
- **Missing:** vendor, gender, fit.
- **Barcode:** EAN-13; 55 rows of 13 characters; 55 of 55 pass the EAN-13 check.
- **Quirks:**
  - Two cost-like columns: `Item Rate` and `Purchase Price`. `Purchase Price` is 93% of `Item Rate` on all 55 rows; which one is KDPS's cost is OPEN.
  - `Total Value (MRP)` is `Retail Price` times quantity. `TCS Amount` is 0. `Tax Type` is `GST For Apparel`. `CGST Rate` and `SGST Rate` are 2.5 each.
  - `Style` such as `50930L` repeats per colour and size; `Shade` is a colour word (`DARK BLUE`, `MUD 3`).
  - 55 rows, 108 pieces (53 rows with quantity 2).
  - KDPS is not named anywhere in the file.
- **Difficulty:** Easy (Clean register; the open points are commercial, not structural.)

### 2.10. `ZILU BOTTOMS.xlsx`

- **Vendor:** Not named inside the file. The brand `ZILU BOTTOMS` maps to `FASHION MARKETING` in `SUPPLIER BRAND DETAILS.xlsx` (barcode flag YES).
- **Document kind:** Sales-register export from the vendor's accounting software, with unlabelled columns. Family F2 (voucher-register).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `Voucher No` `2025-26/FML/16`, `Voucher Date` 28 Aug 2025, buyer `KDPS LIFESTYLE PRIVATE LIMITED`.
- **Sheet:** `Sheet1`; header row 1; data from row 2.
- **Skip:** the last row (an unlabelled totals row with no barcode).
- **Size:** 107 item rows, 107 pieces, 107 distinct barcodes (sheet holds 109 rows in all).
- **Columns, in order** (26 named columns and 4 unnamed with data): `Voucher Type`, `Voucher No`, `Voucher Date`, `Party Name`, `Barcode`, `Item Description`, `Product`, [col H: fit, `SLIM STRAIGHT`], [col I: type, `BOTTOM WEAR`], `Brand`, `Style`, `Shade`, `Size`, `Sales Qty`, `Bill Level Disc. Amt.`, `Bill Level Disc. Per.`, `Total Discount`, `Net Amount`, [col S: GST percentage applied (5 on every row)], `Retail Price`, [col U: a rate that follows MRP bands: 5 where MRP is up to 799, 12 where MRP is 1199 or more], `Item Rate`, `Item Base Value`, `Item Level Disc. Amt.`, `Item Level Disc. Perc.`, `Tax Amount`, `Add on Amount`, `Deduction Amount`, `Item Net Amount`, `HSN Code`.
- **Mapping to standard fields:** buyer = `Party Name`; invoice_no = `Voucher No`; invoice_date = `Voucher Date`; brand = `Brand`; design = `Style`; item_description = `Item Description`; category = `Product`; colour = `Shade`; gender = `Voucher Type`; fit = `[col H, blank header]`; size = `Size`; barcode = `Barcode`; hsn = `HSN Code`; gst_rate = `[col S, blank header]`; qty = `Sales Qty`; mrp = `Retail Price`; cost = `Item Rate`; tax_amount = `Tax Amount`; line_total = `Item Net Amount`.
- **Not mapped:** `Bill Level Disc. Amt.`, `Bill Level Disc. Per.`, `Total Discount`, `Net Amount`, `Item Base Value`, `Item Level Disc. Amt.`, `Item Level Disc. Perc.`, `Add on Amount`, `Deduction Amount`, [col I: blank header], [col U: blank header].
- **Missing:** vendor, season.
- **Barcode:** internal numeric code; 107 rows of 5 characters; 0 of 107 pass the EAN-13 check.
- **Quirks:**
  - `Voucher Type` holds `FEMALE` on every row: a gender stored in a voucher-type column.
  - Five columns have no header: H (fit), I (type), S (GST percentage 5), U (5 or 12 by MRP band) and V (empty).
  - `Barcode` is a 5-digit text (22107 to 34282), an internal code, not an EAN, although the supplier flag is YES.
  - `Add on Amount` is a small per-row adjustment (0.4 to 0.9); `Item Net Amount` is `Item Rate` plus `Tax Amount` plus that adjustment. `Deduction Amount` is 0.
  - The voucher is dated 28 Aug 2025. Column U shows 12 for MRP bands of 1199 and above and 5 for 799 and below, which reads like an MRP-based GST slab (inferred); see the GST rules found in `item-master-vocabulary.md`. 29 distinct styles.
  - No season.
- **Difficulty:** Easy (Clean table; the unlabelled columns need a decision.)

### 2.11. `BANJARAN.xlsx`

- **Vendor:** `Party Name` is `VINAYAK EMPORIUM PVT LTD` (voucher prefix `VEP`); a `GSTIN` column holds its tax number (present, not copied). KDPS is not named. `SUPPLIER BRAND DETAILS.xlsx` maps `BANJARAN` to the same supplier (barcode flag YES).
- **Document kind:** Sale-voucher export with 40 columns, most of them empty. Family F2 (voucher-register).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `No` `VEP/003216/25-26`, `Type` `Sale`, `Date` 26 Mar 2026.
- **Sheet:** `Sheet1`; header row 1; data from row 2.
- **Size:** 11 item rows, 37 pieces, 11 distinct barcodes (sheet holds 12 rows in all).
- **Columns, in order** (40 named columns): `Date`, `No`, `Type`, `Party Name`, `Item Name`, `Item Group`, `HSN Code`, `Note`, `Qty`, `Unit`, `Net Rate`, `Amt`, `Rate Before Disc`, `Material`, `Category`, `Supplier Barcode`, `Style Of Work`, `Party Item Name`, `Item Desc`, `Item Catalog`, `Style/Cut`, `Neck`, `Brand`, `Sleeve`, `Performance`, `Embroidery`, `Occassion`, `Print Design Type`, `GSTIN`, `Sales Person1`, `GST Rate`, `GST Amt`, `SALE RATE`, `Retail Rate`, `st_cd`, `Item Print Name`, `Size`, `Colour`, `Supplier Code`, `POS Disc`.
- **Mapping to standard fields:** vendor = `Party Name`; invoice_no = `No`; invoice_date = `Date`; design = `Item Name`; item_description = `Party Item Name`; colour = `Item Group`; barcode = `Supplier Barcode`; hsn = `HSN Code`; gst_rate = `GST Rate`; qty = `Qty`; mrp = `Retail Rate`; cost = `Net Rate`; tax_amount = `GST Amt`; line_total = `Amt`.
- **Not mapped:** `Type`, `Note`, `Unit`, `Rate Before Disc`, `Material`, `Category`, `Style Of Work`, `Item Desc`, `Item Catalog`, `Style/Cut`, `Neck`, `Brand`, `Sleeve`, `Performance`, `Embroidery`, `Occassion`, `Print Design Type`, `GSTIN`, `Sales Person1`, `SALE RATE`, `st_cd`, `Item Print Name`, `Size`, `Colour`, `Supplier Code`, `POS Disc`.
- **Missing:** buyer, brand, season, gender, fit.
- **Barcode:** internal numeric code; 11 rows of 6 characters; 0 of 11 pass the EAN-13 check.
- **Quirks:**
  - 40 columns; the descriptive ones (`Size`, `Colour`, `Brand`, `Category`, `Style/Cut`, `Neck`, `Sleeve` and others) are empty on almost every row.
  - `Item Group` holds the colour (`PINK`, `ORANGE`).
  - `Party Item Name` packs style, colour and size as `KBD/10324#PINK-FREE` (style, hash, colour, hyphen, size).
  - `Supplier Barcode` is a 6-digit integer (not an EAN). Quantity is 3 or 4 per barcode (11 rows, 37 pieces): one row means several pieces.
  - `Rate Before Disc` equals `Retail Rate` (the MRP); `SALE RATE` is 0; `POS Disc` is 0.
  - `Material` is `COTTON` on 10 rows. `Style Of Work` is `LAD` on one row.
  - `st_cd` is a 6-digit code whose meaning is not stated.
- **Difficulty:** Medium (Wide sparse table; size and colour have to be parsed out of a packed name.)

### 2.12. `TWILLS.xls`

- **Vendor:** `Compnay Name` (sic): `M.N GARMENTS`. `SUPPLIER BRAND DETAILS.xlsx` maps the brand `TWILLS` to `MN GARMENTS` (barcode flag YES). `GST CMP` (the seller's tax number) is empty.
- **Document kind:** Vendor ledger report; the sheet is named `VTSSalesPtFilesLedgerReport`. Family F4 (ledger-report).
- **Real format:** OOXML workbook (.xlsx); the `.xls` extension is wrong.
- **Document:** `Vch No` `25-26/2612`; the date is in a column headed `Educational` (18 Mar 2026); `Ledger Name` is the buyer `KDPS LIFESTYLE PRIVATE LIMITED`.
- **Sheet:** `VTSSalesPtFilesLedgerReport`; header row 1; data from row 2.
- **Size:** 47 item rows, 69 pieces, 47 distinct barcodes (sheet holds 48 rows in all).
- **Columns, in order** (20 named columns and 1 unnamed with data): `Compnay Name`, `GST CMP`, `Vch No`, `Educational`, `Ledger Name`, `Buyer`, [col G: formula `LEFT(H2,10)`: the first 10 characters of `Item Name` (the style code)], `Item Name`, `Bar Code`, `Type`, `HSN`, `Quantity`, `Rate`, `MRP`, `Disc`, `Disc Amt`, `Amount`, `CGST`, `SGST`, `IGST`, `Net Amount`.
- **Mapping to standard fields:** vendor = `Compnay Name`; buyer = `Ledger Name`; invoice_no = `Vch No`; invoice_date = `Educational`; design = `[col G, blank header, formula]`; item_description = `Item Name`; barcode = `Bar Code`; hsn = `HSN`; qty = `Quantity`; mrp = `MRP`; cost = `Rate`; taxable_value = `Amount`; line_total = `Net Amount`.
- **Not mapped:** `GST CMP`, `Buyer`, `Type`, `Disc`, `Disc Amt`, `CGST`, `SGST`, `IGST`.
- **Missing:** brand, season, colour, gender, fit, gst_rate.
- **Barcode:** EAN-13; 47 rows of 13 characters; 47 of 47 pass the EAN-13 check.
- **Quirks:**
  - The `.xls` file is really OOXML (.xlsx): sniff the content.
  - Labels are shifted: `Compnay Name` is the vendor, `Educational` is the date, `Buyer` holds the buyer's tax number (present, not copied).
  - Column G has no header and holds the formula `LEFT(H2,10)` (the first 10 characters of `Item Name`) as the style code.
  - Size is a suffix of `Item Name` (`52844-7808 Z  MAGNUM FS-S`: the text after the last hyphen).
  - `Type` is a sub-brand or line (`MAGNUM`, `MERCURY`, `FILA`, `ESQUIRE`, `OPERA`).
  - `CGST` and `SGST` hold amounts (2.5% each); `IGST` is empty. No GST percentage, colour or season.
  - 47 rows, 69 pieces (22 rows with quantity 2). `Bar Code` is a valid EAN-13.
- **Difficulty:** Medium (Shifted labels, a hidden formula column and a size buried in the name.)

### 2.13. `STATUS QUO.xlsx`

- **Vendor:** `CMP NAME`: `D Apparel` (state `Jharkhand`; its tax number is in `GST No`, present, not copied). `SUPPLIER BRAND DETAILS.xlsx` maps `STATUS QUO` to `D APPAREL` (barcode flag YES).
- **Document kind:** Vendor PT file for one invoice; the same vendor as the worked example in the KDPS template section. Family F4 (ledger-report).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `Bill  No` (two spaces) `DA/26-27/0160`, `Bill Date` 1 May 2026, buyer `KDPS LIFESTYLE PRIVATE LIMITED-DEO` (Deoghar).
- **Sheet:** `PTFiles`; header row 1; data from row 2.
- **Skip:** the `Total` row (label in column H, no barcode).
- **Size:** 43 item rows, 43 pieces, 33 distinct barcodes (10 rows repeat one) (sheet holds 45 rows in all).
- **Columns, in order** (29 named columns): `CMP NAME`, `STATE`, `GST No`, `Bill  No`, `Bill Date`, `Customer Name`, `Buyer GSTIN`, `Item`, `Item Code`, `EN Code`, `Shade`, `MRP`, `Quantity`, `Unit`, `Size`, `Rate`, `Disc`, `Disc Amt`, `Amount`, `GST %`, `HSN Code`, `Discount`, `Motiya`, `Bus Fare`, `CGST`, `SGST`, `IGST`, `Round off`, `Net Amount`.
- **Mapping to standard fields:** vendor = `CMP NAME`; buyer = `Customer Name`; invoice_no = `Bill  No`; invoice_date = `Bill Date`; design = `Item Code`; category = `Item`; colour = `Shade`; size = `Size`; barcode = `EN Code`; hsn = `HSN Code`; gst_rate = `GST %`; qty = `Quantity`; mrp = `MRP`; cost = `Rate`; taxable_value = `Amount`.
- **Not mapped:** `STATE`, `GST No`, `Buyer GSTIN`, `Unit`, `Disc`, `Disc Amt`, `Discount`, `Motiya`, `Bus Fare`, `CGST`, `SGST`, `IGST`, `Round off`, `Net Amount`.
- **Missing:** brand, season, gender, fit.
- **Barcode:** EAN-13; 43 rows of 13 characters; 43 of 43 pass the EAN-13 check.
- **Quirks:**
  - Invoice totals (`CGST`, `SGST`, `Round off`, `Net Amount`, and `Motiya` 50) are filled on the first row only; do not read them as line values.
  - `Disc Amt` holds the text `On Value` on every row; `Disc` and `Discount` are empty; `Bus Fare` is empty.
  - `Rate` is 65% of `MRP` on all 43 rows.
  - 33 distinct barcodes on 43 rows (10 barcodes repeat on a second row; each row has quantity 1).
  - `Size` mixes letters and numbers (`S` to `3XL`, `8` to `16` for kids).
  - `Item` carries a trailing full stop on some values (`MENS T-SHIRT.`, `KIDS T-SHIRT.`).
  - HSN 61091000 (23 rows), 61033200 (12), 61034990 (8). `GST %` is 5 on every row.
- **Difficulty:** Easy (One table with a totals row; invoice-level values sit on row 2.)

### 2.14. `SWEET DREAMS.xlsx`

- **Vendor:** `FROM`: `D D APPARELS`. The brand `SWEET DREAMS` maps to `DD APPAREL` in `SUPPLIER BRAND DETAILS.xlsx` (barcode flag YES). `STATUS QUO.xlsx` names `D Apparel`; whether the two are one business is OPEN.
- **Document kind:** Accounting-software report titled `D_PT FILE From 05/02/2026 to 06/02/2026` (title repeated across all 27 cells of row 2). Family F3 (accounting-export).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `BILL NO.` `DDSL-109`, `BILL DATE` `06/02/2026` (text), buyer `KDPS LIFESTYLE PRIVATE LIMITED RANCHI`.
- **Sheet:** `Report`; header row 3; data from row 4.
- **Skip:** rows 1 and 2 (title); `BILL NO. WISE TOTALS` and `GRAND TOTALS` (label in column B).
- **Size:** 24 item rows, 24 pieces, 24 distinct barcodes (sheet holds 29 rows in all).
- **Columns, in order** (27 named columns): `SNO.`, `FROM`, `BILL NO.`, `BILL DATE`, `PARTY NAME WITHOUT CITY`, `GENDER + Body`, `PRICE GROUP`, `BODY`, `Season`, `HSN CODE`, `ITEM CODE`, `ADDITIONAL ITEM CODE`, `ITEM NAME`, `SHADE`, `SIZE`, `QTY`, `M.R.P.`, `RATE`, `GROSS AMOUNT`, `CD(%)`, `CD VALUE`, `TD(%)`, `TD VALUE`, `AFTER DISCOUNT AMT`, `TAX-1(RS)`, `TAX-3(RS)`, `NET AMOUNT`.
- **Mapping to standard fields:** vendor = `FROM`; buyer = `PARTY NAME WITHOUT CITY`; invoice_no = `BILL NO.`; invoice_date = `BILL DATE`; season = `Season`; design = `ITEM NAME`; category = `BODY`; colour = `SHADE`; gender = `GENDER + Body`; size = `SIZE`; barcode = `ADDITIONAL ITEM CODE`; hsn = `HSN CODE`; qty = `QTY`; mrp = `M.R.P.`; cost = `RATE`; taxable_value = `AFTER DISCOUNT AMT`; line_total = `NET AMOUNT`.
- **Not mapped:** `SNO.`, `PRICE GROUP`, `ITEM CODE`, `GROSS AMOUNT`, `CD(%)`, `CD VALUE`, `TD(%)`, `TD VALUE`, `TAX-1(RS)`, `TAX-3(RS)`.
- **Missing:** brand, fit, gst_rate.
- **Barcode:** EAN-13; 24 rows of 13 characters; 24 of 24 pass the EAN-13 check.
- **Quirks:**
  - `ITEM CODE` is a 13-digit internal number (1100001016766); the real EAN-13 is in `ADDITIONAL ITEM CODE`.
  - `GENDER + Body` fuses gender and body part (`MEN BERMUDA LENGTH`, `MEN PYJAMA LENGTH`); `BODY` repeats the body part.
  - `Season` is `S26`; `PRICE GROUP` is `BS-SEPARATE`.
  - Headers ` SIZE` and ` QTY` have a leading space.
  - No GST percentage: `TAX-1(RS)` and `TAX-3(RS)` are the tax amounts (CGST and SGST, equal). `CD(%)`, `CD VALUE`, `TD(%)` and `TD VALUE` are empty.
  - `BILL DATE` is text `dd/mm/yyyy`. Brand is only in the file name.
  - 24 rows, 24 pieces. HSN is 62081990 on 18 rows and 61071100 on 6.
- **Difficulty:** Easy (Clean table once the title rows and total rows are skipped.)

### 2.15. `KILLER JUNIOR.xlsx`

- **Vendor:** No vendor column; the buyer column is `PARTY NAME`. `COMPANY NAME` is the brand `JUNIOR KILLER`; `SUPPLIER BRAND DETAILS.xlsx` maps `KILLER JUNIOR`, `JUNIOR KILLER` and `KILLER` to `D D SALES CO` (barcode flag YES).
- **Document kind:** Accounting-software report titled `PT FILE FORMAT - SALE ...` (row 2). Family F3 (accounting-export).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `BILL NO.` `JKL-30`, `BILL DATE` `30/04/2026` (text), buyer `KDPS LIFESTYLE PVT LTD-JNR    -DUMKA` (a Dumka junior store hint).
- **Sheet:** `Report`; header row 3; data from row 4.
- **Skip:** row 2 (title); `Bill Totals`, `Date Totals`, `Grand Totals` (label in column E).
- **Size:** 24 item rows, 24 pieces, 24 distinct barcodes (sheet holds 30 rows in all).
- **Columns, in order** (27 named columns): `BILL NO.`, `BILL DATE`, `PARTY NAME`, `COMPANY NAME`, `ITEM NAME`, `PRODUCT`, `GROUP9.GRP1`, `GROUP10.GRP1`, `GROUP18.GRP1`, `GROUP25.GRP1`, `ITEM CODE`, `BARCODE`, `SHADE NAME`, `SIZE`, `RATE/PACK`, `PACKING`, `LOCATION`, `TOTAL QTY`, `M.R.P.`, `GROSS AMOUNT`, `RATE/UNIT`, `CD(%)`, `AFTER DISCOUNT AMOUNT`, `TAX-1(RS)`, `TAX-3(RS)`, `BILL AMOUNT`, `REMARKS-1`.
- **Mapping to standard fields:** buyer = `PARTY NAME`; invoice_no = `BILL NO.`; invoice_date = `BILL DATE`; brand = `COMPANY NAME`; season = `GROUP9.GRP1`; design = `ITEM NAME`; category = `PRODUCT`; colour = `SHADE NAME`; fit = `GROUP10.GRP1`; size = `SIZE`; barcode = `BARCODE`; hsn = `GROUP25.GRP1`; qty = `TOTAL QTY`; mrp = `M.R.P.`; cost = `RATE/UNIT`; taxable_value = `AFTER DISCOUNT AMOUNT`; line_total = `BILL AMOUNT`.
- **Not mapped:** `GROUP18.GRP1`, `ITEM CODE`, `RATE/PACK`, `PACKING`, `LOCATION`, `GROSS AMOUNT`, `CD(%)`, `TAX-1(RS)`, `TAX-3(RS)`, `REMARKS-1`.
- **Missing:** vendor, gender, gst_rate.
- **Barcode:** EAN-13; 24 rows of 13 characters; 24 of 24 pass the EAN-13 check.
- **Quirks:**
  - Generic column names carry meaning: `GROUP9.GRP1` is the season (`SS26`, `CORE`), `GROUP10.GRP1` is the fit, `GROUP25.GRP1` is the HSN.
  - `GROUP25.GRP1` holds `(NIL)` on the 7 T-shirt rows: HSN missing there. `GROUP18.GRP1` is `(NIL)` on all rows.
  - `SIZE` is an age range (`10-11 YEARS`); `PACKING` is a measure with uneven spacing (`44.5cm`, `46.5 cm`).
  - `ITEM CODE` is a 7-digit internal number; `BARCODE` is the valid EAN-13.
  - `LOCATION`, `CD(%)` and `REMARKS-1` are empty. `RATE/PACK` equals `RATE/UNIT`.
  - No GST percentage: `TAX-1(RS)` and `TAX-3(RS)` are equal tax amounts (CGST and SGST). 24 rows, 24 pieces.
- **Difficulty:** Easy (Clean table; the generic group names need a mapping.)

### 2.16. `BEEVEE 390.xlsx`

- **Vendor:** `OWNER SITE`: `BEEVEE` (`SUPPLIER BRAND DETAILS.xlsx` maps `BEEVEE` to `SHARP TRADING CO.`, barcode flag YES). `REF SITE` is `KDPS-HZB-BV`, which looks like a KDPS Site and brand-counter code (guess).
- **Document kind:** `PT EMAIL` export (sheet named `PT EMAIL _Dont touch`); the vendor emails it in this shape. Family F5 (pt-email).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `INVOICE_NO` `SBVS25-26-000390`, `INVOICE_DATE` 23 Oct 2025, buyer `KDPS LIFESTYLE PRIVATE LIMITED-(HAZARIBAGH)`.
- **Sheet:** `PT EMAIL _Dont touch`; header row 3; data from row 4.
- **Skip:** rows 1 and 2 (empty or merged).
- **Size:** 24 item rows, 33 pieces, 24 distinct barcodes (sheet holds 27 rows in all).
- **Columns, in order** (23 named columns): `OWNER SITE`, `INVOICE_DATE`, `INVOICE_NO`, `CUSTOMER_NAME`, `REF SITE`, `BARCODE`, `CATEGORY1`, `CATEGORY2`, `CATEGORY3`, `CATEGORY4`, `CATEGORY5`, `DIVISION`, `SECTION`, `DEPARTMENT`, `HSN CODE`, `TAX_AMOUNT`, `TAX_RATE`, `TAXABLE_AMOUNT`, `ITEM_NET_AMOUNT`, `INVOICE_QUANTITY`, `INVOICE_RATE`, `INVOICE_RSP`, `MRP`.
- **Mapping to standard fields:** vendor = `OWNER SITE`; buyer = `CUSTOMER_NAME`; invoice_no = `INVOICE_NO`; invoice_date = `INVOICE_DATE`; brand = `CATEGORY1`; design = `CATEGORY2`; category = `CATEGORY5`; colour = `CATEGORY3`; size = `CATEGORY4`; barcode = `BARCODE`; hsn = `HSN CODE`; gst_rate = `TAX_RATE`; qty = `INVOICE_QUANTITY`; mrp = `MRP`; cost = `INVOICE_RATE`; taxable_value = `TAXABLE_AMOUNT`; tax_amount = `TAX_AMOUNT`; line_total = `ITEM_NET_AMOUNT`.
- **Not mapped:** `REF SITE`, `DIVISION`, `SECTION`, `DEPARTMENT`, `INVOICE_RSP`.
- **Missing:** season, gender, fit.
- **Barcode:** EAN-13; 24 rows of 13 characters; 24 of 24 pass the EAN-13 check.
- **Quirks:**
  - `CATEGORY1` is the brand, `CATEGORY2` the style, `CATEGORY3` the colour, `CATEGORY4` the size and `CATEGORY5` the product line. The names mean nothing by themselves.
  - `DIVISION`, `SECTION` and `DEPARTMENT` give a vendor hierarchy (`LOWER`, `MENS LOWER`, `PYJAMA-1`, `CARGO-1`).
  - `INVOICE_RSP` equals `MRP`. `TAX_RATE` is 5 on every row.
  - `CATEGORY4` mixes letters and waist numbers (`XXL`, `36`, `30`).
  - 24 rows, 33 pieces (9 rows with quantity 2). `BARCODE` is a valid EAN-13 stored as an integer.
- **Difficulty:** Easy (The cleanest family; fixed names, one header row.)

### 2.17. `go colours 000023.xlsx`

- **Vendor:** `OWNER SITE`: `ESSPL-GOCOLORS` (`SUPPLIER BRAND DETAILS.xlsx` maps `GOCOLORS` to `EMPORIO SIDDHARTH SALES PRIVATE`, barcode flag YES). `REF SITE` is `KDPS-HZB-GC` (same pattern, guess).
- **Document kind:** `PT EMAIL` export; the sheet is named `PT EMAIL _Dont touch (1)`. Family F5 (pt-email).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `INVOICE_NO` `2GCS25-26-000023`, `INVOICE_DATE` 24 Mar 2026, buyer `KDPS LIFESTYLE PRIVATE LIMITED-(HAZARIBAGH)`.
- **Sheet:** `PT EMAIL _Dont touch (1)`; header row 3; data from row 4.
- **Skip:** rows 1 and 2 (empty or merged).
- **Size:** 46 item rows, 46 pieces, 46 distinct barcodes (sheet holds 49 rows in all).
- **Columns, in order** (23 named columns): `OWNER SITE`, `INVOICE_DATE`, `INVOICE_NO`, `CUSTOMER_NAME`, `REF SITE`, `BARCODE`, `CATEGORY1`, `CATEGORY2`, `CATEGORY3`, `CATEGORY4`, `CATEGORY5`, `DIVISION`, `SECTION`, `DEPARTMENT`, `HSN CODE`, `TAX_AMOUNT`, `TAX_RATE`, `TAXABLE_AMOUNT`, `ITEM_NET_AMOUNT`, `INVOICE_QUANTITY`, `INVOICE_RATE`, `INVOICE_RSP`, `MRP`.
- **Mapping to standard fields:** vendor = `OWNER SITE`; buyer = `CUSTOMER_NAME`; invoice_no = `INVOICE_NO`; invoice_date = `INVOICE_DATE`; brand = `CATEGORY1`; design = `CATEGORY2`; category = `CATEGORY5`; colour = `CATEGORY3`; size = `CATEGORY4`; barcode = `BARCODE`; hsn = `HSN CODE`; gst_rate = `TAX_RATE`; qty = `INVOICE_QUANTITY`; mrp = `MRP`; cost = `INVOICE_RATE`; taxable_value = `TAXABLE_AMOUNT`; tax_amount = `TAX_AMOUNT`; line_total = `ITEM_NET_AMOUNT`.
- **Not mapped:** `REF SITE`, `DIVISION`, `SECTION`, `DEPARTMENT`, `INVOICE_RSP`.
- **Missing:** season, gender, fit.
- **Barcode:** EAN-13; 46 rows of 13 characters; 46 of 46 pass the EAN-13 check.
- **Quirks:**
  - Same columns as `BEEVEE 390.xlsx`. `TAX_RATE` is 5 on every row; `INVOICE_RSP` equals `MRP`.
  - `CATEGORY3` (colour) carries a numeric suffix (`BLACK73/1`). `DIVISION` is `LOWER` and `SECTION` is `LADIES LOWER` on every row.
  - 46 rows, 46 pieces; `BARCODE` is a valid EAN-13 integer.
- **Difficulty:** Easy (Same family and same difficulty as the other `PT EMAIL` files.)

### 2.18. `MUFTI.xlsx`

- **Vendor:** `OWNER SITE`: `MUFTI` (`SUPPLIER BRAND DETAILS.xlsx` maps `MUFTI` to `SHRING APPARELS`, barcode flag YES). `REF SITE` is `KDPS-HZB-MF` (same pattern, guess).
- **Document kind:** `PT EMAIL` export with five extra unlabelled columns. Family F5 (pt-email).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `INVOICE_NO` `SMFS25-26-000753`, `INVOICE_DATE` 22 Aug 2025, buyer `KDPS LIFESTYLE PRIVATE LIMITED-(HAZARIBAGH)`.
- **Sheet:** `PT EMAIL _Dont touch`; header row 3; data from row 4.
- **Skip:** rows 1 and 2 (empty or merged).
- **Size:** 97 item rows, 133 pieces, 97 distinct barcodes (sheet holds 102 rows in all).
- **Columns, in order** (23 named columns and 5 unnamed with data): `OWNER SITE`, `INVOICE_DATE`, `INVOICE_NO`, `CUSTOMER_NAME`, `REF SITE`, `BARCODE`, `CATEGORY1`, `CATEGORY2`, `CATEGORY3`, `CATEGORY4`, `CATEGORY5`, [col L: item, for example `JEANS`, `SHIRT`], [col M: type, `TOP WEAR` or `BOTTOM WEAR`], [col N: fit, for example `SLIM`, `SKINNY`, `ANKLE`], `DIVISION`, `SECTION`, `DEPARTMENT`, `HSN CODE`, `TAX_AMOUNT`, `TAX_RATE`, `TAXABLE_AMOUNT`, `ITEM_NET_AMOUNT`, `INVOICE_QUANTITY`, `INVOICE_RATE`, `INVOICE_RSP`, `MRP`, [col AA: 5 on every row], [col AB: 18 where MRP is above 2625, 5 where it is 2625 or less (all 97 rows)].
- **Mapping to standard fields:** vendor = `OWNER SITE`; buyer = `CUSTOMER_NAME`; invoice_no = `INVOICE_NO`; invoice_date = `INVOICE_DATE`; brand = `CATEGORY1`; design = `CATEGORY2`; category = `CATEGORY5`; item = `[col L, blank header]`; colour = `CATEGORY3`; fit = `[col N, blank header]`; size = `CATEGORY4`; barcode = `BARCODE`; hsn = `HSN CODE`; gst_rate = `TAX_RATE`; qty = `INVOICE_QUANTITY`; mrp = `MRP`; cost = `INVOICE_RATE`; taxable_value = `TAXABLE_AMOUNT`; tax_amount = `TAX_AMOUNT`; line_total = `ITEM_NET_AMOUNT`.
- **Not mapped:** `REF SITE`, `DIVISION`, `SECTION`, `DEPARTMENT`, `INVOICE_RSP`, [col M: blank header], [col AA: blank header], [col AB: blank header].
- **Missing:** season, gender.
- **Barcode:** EAN-13; 97 rows of 13 characters; 97 of 97 pass the EAN-13 check.
- **Quirks:**
  - Three columns after `CATEGORY5` have no header: L (item), M (top or bottom wear) and N (fit). The master lists have these fields.
  - Two trailing columns (AA and AB) have no header: AA is 5 on every row; AB is 18 on the 68 rows with MRP above 2625 and 5 on the other 29. They mirror the output-tax rule of the KDPS template, so KDPS staff probably added them (inferred).
  - `TAX_RATE` is 12 on 89 rows and 5 on 8 rows (the invoice is dated 22 Aug 2025).
  - `TAXABLE_AMOUNT` is 1.0035 times quantity times `INVOICE_RATE` on all 97 rows (about 0.35% more); what the extra is, is OPEN.
  - `CATEGORY3` (colour) carries a code prefix (`86-TINTED`, `16-BLUE`).
  - 97 rows, 133 pieces (28 rows with quantity 2, 4 with 3). `BARCODE` is a valid EAN-13 integer.
- **Difficulty:** Easy (Same family; the unlabelled columns carry real fields.)

### 2.19. `HYPHEN.xlsx`

- **Vendor:** No seller name. `AGENT_NAME` is a person's name (present, not copied). `SUPPLIER BRAND DETAILS.xlsx` maps `HYPHEN` to `HYPHEN GARMENTS PVT LTD` (barcode flag YES). `REFERENCE_SITE` is `KDPS Lifestyle (Ranchi)`.
- **Document kind:** Snake-case export, a sibling of the `PT EMAIL` family (sheet `PT FILE BILL NO WISE`). Family F5 (pt-email).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `INVOICE_NO` `HPNS25-26-013192`, `DOCUMENT_NO` `S26DDJH-030`, `INVOICE_DATE` 23 Mar 2026.
- **Sheet:** `PT FILE BILL NO WISE`; header row 3; data from row 4.
- **Skip:** row 1 (title); the last row (quantity total only).
- **Size:** 10 item rows, 10 pieces, 10 distinct barcodes (sheet holds 14 rows in all).
- **Columns, in order** (16 named columns): `AGENT_NAME`, `REFERENCE_SITE`, `INVOICE_DATE`, `INVOICE_NO`, `DOCUMENT_NO`, `HSN_CODE`, `SECTION`, `DEPARTMENT`, `BARCODE`, `STYLE`, `S/L`, `SIZE`, `MRP`, `RSP`, `INVOICE_RATE`, `INVOICE_QUANTITY`.
- **Mapping to standard fields:** buyer = `REFERENCE_SITE`; invoice_no = `INVOICE_NO`; invoice_date = `INVOICE_DATE`; design = `STYLE`; category = `DEPARTMENT`; size = `SIZE`; barcode = `BARCODE`; hsn = `HSN_CODE`; qty = `INVOICE_QUANTITY`; mrp = `MRP`; cost = `INVOICE_RATE`.
- **Not mapped:** `AGENT_NAME`, `DOCUMENT_NO`, `SECTION`, `S/L`, `RSP`.
- **Missing:** vendor, brand, season, colour, gender, fit, gst_rate.
- **Barcode:** internal alphanumeric code; 10 rows of 8 characters; 0 of 10 pass the EAN-13 check.
- **Quirks:**
  - `BARCODE` is 8 characters starting `HY` (`HY581454`): not an EAN. The supplier flag is YES.
  - `SIZE` mixes a waist and a letter (`36/XS`, `38/S`, `46/3XL`).
  - `SECTION` is `Winter Wear`; `DEPARTMENT` is `Blazers` (6 rows) or `3 Pcs Suit` (4 rows). `RSP` equals `MRP`. `S/L` is empty.
  - No brand, colour, GST or season. 10 rows, 10 pieces.
- **Difficulty:** Easy (Small table; only the non-EAN code and the combined size need care.)

### 2.20. `JOCKEY 852.xls`

- **Vendor:** Jockey (no seller column). A customer code is present (value not copied; it differs from the other four report files). `SUPPLIER BRAND DETAILS.xlsx` maps `JOCKEY` to `OM GANPATI (DMK)` (barcode flag YES).
- **Document kind:** `Bill Wise Item List` report (`Report: Bill Wise Item List`, `Selected date range for Report : From 03/03/2026 To 03/03/2026`). Family F6 (jockey-bill-wise).
- **Real format:** BIFF/OLE2 workbook (.xls).
- **Document:** `Bill Prefix` `SCRS25`, `Bill No` 852, `Bill Date` `03/03/2026` (text).
- **Sheet:** `Sheet1`; header row 9; data from row 10.
- **Skip:** rows 1 to 8 (full stops and the report title); `*Sub Total*`, `*Sub Total* - *date*` and `*Grand Total*` (label in column A).
- **Size:** 9 item rows, 16 pieces, 9 distinct barcodes (sheet holds 21 rows in all).
- **Columns, in order** (30 named columns): `Bill Date`, `Tran Type`, `Bill Prefix`, `Bill No`, `Customer Code`, `Customer Name`, `Sales Man Code`, `Item Promo Code`, `Bill Promo Code`, `StockNo`, `Item Description`, `Product Code`, `Range Code`, `Style Code`, `Colour Code`, `Size`, `Batch No.`, `Cost`, `MDP`, `Doc Rate`, `Qty`, `Value`, `Addons`, `Deduction`, `Tax Perc.`, `Tax`, `Item - Discount`, `Bill - Discount`, `Total - Discount`, `Old Bill Ref.`.
- **Mapping to standard fields:** buyer = `Customer Name`; invoice_no = `Bill Prefix` + `Bill No`; invoice_date = `Bill Date`; design = `Style Code`; item_description = `Item Description`; category = `Product Code`; colour = `Colour Code`; size = `Size`; barcode = `StockNo`; gst_rate = `Tax Perc.`; qty = `Qty`; mrp = `Batch No.`; cost = `Doc Rate`; tax_amount = `Tax`; line_total = `Value`.
- **Not mapped:** `Tran Type`, `Customer Code`, `Sales Man Code`, `Item Promo Code`, `Bill Promo Code`, `Range Code`, `Cost`, `MDP`, `Addons`, `Deduction`, `Item - Discount`, `Bill - Discount`, `Total - Discount`, `Old Bill Ref.`.
- **Missing:** vendor, brand, season, gender, fit, hsn.
- **Barcode:** EAN-13; 9 rows of 13 characters; 9 of 9 pass the EAN-13 check.
- **Quirks:**
  - `Batch No.` actually holds the MRP (text, `999.00`).
  - `Doc Rate` is the unit rate before tax; `Value` is tax-inclusive (`Doc Rate` times quantity plus `Tax`). `Cost` is above `Doc Rate` on one row, so it is not a safe cost.
  - No `HSN Code` column in this file (the others have one). `Customer Name` is `Kdps Lifestyle Private Limited`.
  - Header names carry stray spaces (` Customer Name`, `Product Code `, `Range Code `, `Style Code `, `Colour Code `).
  - `Item Description` is `style-0103-colour` (`9500-0103-NAVY`); `Product Code` holds a product word (`Track Pant`, `TRACK PANT`: case varies).
  - 9 rows, 16 pieces. `StockNo` is a text EAN-13.
- **Difficulty:** Medium (Title and total rows, shifting columns between Jockey files; read columns by name.)

### 2.21. `JOCKEY PARAS.xls`

- **Vendor:** Jockey (no seller column); a customer code is present (value not copied). `PARAS` in the file name looks like a depot or sub-division (guess).
- **Document kind:** `Bill Wise Item List` report (`From 18/04/2026 To 18/04/2026`). Family F6 (jockey-bill-wise).
- **Real format:** BIFF/OLE2 workbook (.xls).
- **Document:** `Bill Prefix` `PECRS26`, `Bill No` 175, `Bill Date` `18/04/2026` (text).
- **Sheet:** `Sheet1`; header row 9; data from row 10.
- **Skip:** rows 1 to 8; `*Sub Total*`, `*Sub Total* - *date*` and `*Grand Total*`.
- **Size:** 43 item rows, 146 pieces, 30 distinct barcodes (13 rows repeat one) (sheet holds 55 rows in all).
- **Columns, in order** (39 named columns): `Bill Date`, `Tran Type`, `Bill Prefix`, `Bill No`, `Customer Code`, `Customer Name`, `Item Promo Code`, `Bill Promo Code`, `StockNo`, `Item Description`, `Product Code`, `Product Desc`, `Range Code`, `Range Desc`, `Style Code`, `Style Desc`, `Colour Code`, `Size`, `Batch No.`, `UOM`, `Pack`, `Material`, `IC1`, `Division`, `DistItem`, `HSN Code`, `Cost`, `MDP`, `Doc Rate`, `Qty`, `Value`, `Addons`, `Deduction`, `Tax Perc.`, `Tax`, `Item - Discount`, `Bill - Discount`, `Total - Discount`, `Old Bill Ref.`.
- **Mapping to standard fields:** buyer = `Customer Name`; invoice_no = `Bill Prefix` + `Bill No`; invoice_date = `Bill Date`; design = `Style Code`; item_description = `Item Description`; category = `Product Code`; colour = `Colour Code`; size = `Size`; barcode = `StockNo`; hsn = `HSN Code`; gst_rate = `Tax Perc.`; qty = `Qty`; mrp = `Batch No.`; cost = `Doc Rate`; tax_amount = `Tax`; line_total = `Value`.
- **Not mapped:** `Tran Type`, `Customer Code`, `Item Promo Code`, `Bill Promo Code`, `Product Desc`, `Range Code`, `Range Desc`, `Style Desc`, `UOM`, `Pack`, `Material`, `IC1`, `Division`, `DistItem`, `Cost`, `MDP`, `Addons`, `Deduction`, `Item - Discount`, `Bill - Discount`, `Total - Discount`, `Old Bill Ref.`.
- **Missing:** vendor, brand, season, gender, fit.
- **Barcode:** EAN-13; 43 rows of 13 characters; 43 of 43 pass the EAN-13 check.
- **Quirks:**
  - Adds `Product Desc`, `Range Desc`, `Style Desc`, `UOM`, `Pack`, `Material`, `IC1`, `Division` and `DistItem`.
  - 13 extra rows repeat a barcode (43 rows, 30 distinct codes); quantity is up to 10 per row (146 pieces).
  - `Batch No.` holds the MRP (text). HSN values: 61091000, 61071990, 62034290, 61071100.
  - Header names carry stray spaces.
- **Difficulty:** Medium (Same report as the other Jockey files with a different column set.)

### 2.22. `JOCKEY-NARAYANI.xls`

- **Vendor:** Jockey (no seller column); a customer code is present (value not copied). `NARAYANI` in the file name looks like a depot or sub-division (guess).
- **Document kind:** `Bill Wise Item List` data with no title block and no total rows; the sheet is named `Sheet3`. Family F6 (jockey-bill-wise).
- **Real format:** BIFF/OLE2 workbook (.xls).
- **Document:** `Bill Prefix` `P2CRS26`, `Bill No` 162, `Bill Date` `18/04/2026` (text).
- **Sheet:** `Sheet3`; header row 1; data from row 2.
- **Size:** 30 item rows, 39 pieces, 30 distinct barcodes (sheet holds 31 rows in all).
- **Columns, in order** (28 named columns): `Bill Date`, `Tran Type`, `Bill Prefix`, `Bill No`, `Customer Code`, `Customer Name`, `StockNo`, `Item Description`, `Product Code`, `Range Code`, `Style Code`, `Colour Code`, `Size`, `Batch No.`, `HSN Code`, `Cost`, `MDP`, `Doc Rate`, `Qty`, `Value`, `Addons`, `Deduction`, `Tax Perc.`, `Tax`, `Item - Discount`, `Bill - Discount`, `Total - Discount`, `Old Bill Ref.`.
- **Mapping to standard fields:** buyer = `Customer Name`; invoice_no = `Bill Prefix` + `Bill No`; invoice_date = `Bill Date`; design = `Style Code`; item_description = `Item Description`; category = `Product Code`; colour = `Colour Code`; size = `Size`; barcode = `StockNo`; hsn = `HSN Code`; gst_rate = `Tax Perc.`; qty = `Qty`; mrp = `Batch No.`; cost = `Doc Rate`; tax_amount = `Tax`; line_total = `Value`.
- **Not mapped:** `Tran Type`, `Customer Code`, `Range Code`, `Cost`, `MDP`, `Addons`, `Deduction`, `Item - Discount`, `Bill - Discount`, `Total - Discount`, `Old Bill Ref.`.
- **Missing:** vendor, brand, season, gender, fit.
- **Barcode:** EAN-13; 30 rows of 13 characters; 30 of 30 pass the EAN-13 check.
- **Quirks:**
  - The header is row 1 (the other four Jockey files put it on row 9) and there are no total rows.
  - The file is 1.5 MB for 31 rows (hidden content or formatting; not investigated).
  - `Batch No.` holds the MRP (text). `Product Code` is `NA` on 3 rows.
  - 30 rows, 39 pieces.
- **Difficulty:** Medium (Same report; the header position moves, so detect it, do not hard-code row 9.)

### 2.23. `JOCKEY-NARVADA.xls`

- **Vendor:** Jockey (no seller column); a customer code is present (value not copied). `NARVADA` in the file name looks like a depot or sub-division (guess).
- **Document kind:** `Bill Wise Item List` report (`From 18/04/2026 To 20/04/2026`). Family F6 (jockey-bill-wise).
- **Real format:** BIFF/OLE2 workbook (.xls).
- **Document:** `Bill Prefix` `EDCRS26`, `Bill No` 34, `Bill Date` `18/04/2026` (text).
- **Sheet:** `Sheet1`; header row 9; data from row 10.
- **Skip:** rows 1 to 8; `*Sub Total*`, `*Sub Total* - *date*` and `*Grand Total*`.
- **Size:** 2 item rows, 20 pieces, 2 distinct barcodes (sheet holds 14 rows in all).
- **Columns, in order** (29 named columns): `Bill Date`, `Tran Type`, `Bill Prefix`, `Bill No`, `Customer Code`, `Sales Man Code`, `Item Promo Code`, `Bill Promo Code`, `StockNo`, `Item Description`, `Product Code`, `Range Code`, `Style Code`, `Colour Code`, `Size`, `Batch No.`, `HSN Code`, `MDP`, `Doc Rate`, `Qty`, `Value`, `Addons`, `Deduction`, `Tax Perc.`, `Tax`, `Item - Discount`, `Bill - Discount`, `Total - Discount`, `Old Bill Ref.`.
- **Mapping to standard fields:** invoice_no = `Bill Prefix` + `Bill No`; invoice_date = `Bill Date`; design = `Style Code`; item_description = `Item Description`; category = `Product Code`; colour = `Colour Code`; size = `Size`; barcode = `StockNo`; hsn = `HSN Code`; gst_rate = `Tax Perc.`; qty = `Qty`; mrp = `Batch No.`; cost = `Doc Rate`; tax_amount = `Tax`; line_total = `Value`.
- **Not mapped:** `Tran Type`, `Customer Code`, `Sales Man Code`, `Item Promo Code`, `Bill Promo Code`, `Range Code`, `MDP`, `Addons`, `Deduction`, `Item - Discount`, `Bill - Discount`, `Total - Discount`, `Old Bill Ref.`.
- **Missing:** vendor, buyer, brand, season, gender, fit.
- **Barcode:** EAN-13; 2 rows of 13 characters; 2 of 2 pass the EAN-13 check.
- **Quirks:**
  - No `Customer Name` and no `Cost` column; `Sales Man Code` is present.
  - 2 rows, 20 pieces (10 handkerchiefs each); `Size` is `FS`; HSN 62132000.
  - `Batch No.` holds the MRP (text).
- **Difficulty:** Medium (Same report; fewer columns.)

### 2.24. `JOCKEY_DD SALES.xls`

- **Vendor:** Jockey (no seller column); a customer code is present (value not copied). The `DD/JBN26` prefix and the `DD SALES` file name point to a distributor `DD` (guess).
- **Document kind:** `Bill Wise Item List` report (`From 01/05/2026 To 04/05/2026`). Family F6 (jockey-bill-wise).
- **Real format:** BIFF/OLE2 workbook (.xls).
- **Document:** `Bill Prefix` `DD/JBN26`, `Bill No` 135 and 136, `Bill Date` `01/05/2026` (text).
- **Sheet:** `Sheet1`; header row 9; data from row 10.
- **Skip:** rows 1 to 8; `*Sub Total*`, `*Sub Total* - *date*` and `*Grand Total*`.
- **Size:** 185 item rows, 349 pieces, 165 distinct barcodes (20 rows repeat one) (sheet holds 197 rows in all).
- **Columns, in order** (31 named columns): `Bill Date`, `Tran Type`, `Bill Prefix`, `Bill No`, `Customer Code`, `Customer Name`, `Sales Man Code`, `Item Promo Code`, `Bill Promo Code`, `StockNo`, `Item Description`, `Product Code`, `Range Code`, `Style Code`, `Colour Code`, `Size`, `Batch No.`, `HSN Code`, `Cost`, `MDP`, `Doc Rate`, `Qty`, `Value`, `Addons`, `Deduction`, `Tax Perc.`, `Tax`, `Item - Discount`, `Bill - Discount`, `Total - Discount`, `Old Bill Ref.`.
- **Mapping to standard fields:** buyer = `Customer Name`; invoice_no = `Bill Prefix` + `Bill No`; invoice_date = `Bill Date`; design = `Style Code`; item_description = `Item Description`; category = `Product Code`; colour = `Colour Code`; size = `Size`; barcode = `StockNo`; hsn = `HSN Code`; gst_rate = `Tax Perc.`; qty = `Qty`; mrp = `Batch No.`; cost = `Doc Rate`; tax_amount = `Tax`; line_total = `Value`.
- **Not mapped:** `Tran Type`, `Customer Code`, `Sales Man Code`, `Item Promo Code`, `Bill Promo Code`, `Range Code`, `Cost`, `MDP`, `Addons`, `Deduction`, `Item - Discount`, `Bill - Discount`, `Total - Discount`, `Old Bill Ref.`.
- **Missing:** vendor, brand, season, gender, fit.
- **Barcode:** EAN-13; 185 rows of 13 characters; 185 of 185 pass the EAN-13 check.
- **Quirks:**
  - The largest Jockey file: 185 rows, 349 pieces, two bills. 20 extra rows repeat a barcode (165 distinct).
  - Four EANs appear at two MRPs each (for example 629 and 639): the MRP is not a property of the barcode alone.
  - `Cost` is above `Doc Rate` on 24 rows. `Batch No.` holds the MRP (text).
  - `Product Code` is `EVERYDAY BRA`, `ACTIVE BRA` and so on; sizes are bra sizes (`34B`, `36C`) and letters. HSN 62121000.
- **Difficulty:** Medium (Same report; large, with repeated barcodes and a barcode with two MRPs.)

### 2.25. `JOCKEY.xlsx`

- **Vendor:** Seller not named; the first record names a party `BR-D D DEVELOPERS PVT LID - JFH`, which is not KDPS (buyer or ship-to? OPEN). `SUPPLIER BRAND DETAILS.xlsx` lists `D D DEVELOPPER` in the barcode list only (flag YES).
- **Document kind:** Invoice printout: row 1 is an unlabelled header record, row 2 is the column header. Family F7 (jockey-invoice-print).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** Row 1 (unlabelled): sequence 1, `JCRS26/10` (invoice), two dates 6 Apr 2026, taxable total, line count 6, tax total, round-off 0.11, total 24,253.
- **Sheet:** `Sheet1`; header row 2; data from row 3.
- **Skip:** row 1 (the unlabelled header record).
- **Size:** 6 item rows, 60 pieces, 6 distinct barcodes (sheet holds 8 rows in all).
- **Columns, in order** (15 named columns; the sheet is 134 columns wide): `S.N`, `STOCK NO.`, `STYLE DISC`, `STYLE CODE`, `COLOUR`, `PRODUCE NAME`, `HSN CODE`, `SIZE`, `QTY`, `MRP`, `RATE`, `TAXABLE AMOUNT`, `CGST(2.5%)`, `SGST(2.5%)`, `AMOUNT`.
- **Mapping to standard fields:** buyer = `[row 1, col E, unlabelled]`; invoice_no = `[row 1, col F, unlabelled]`; invoice_date = `[row 1, col G, unlabelled]`; design = `STYLE CODE`; item_description = `STYLE DISC`; category = `PRODUCE NAME`; colour = `COLOUR`; size = `SIZE`; barcode = `STOCK NO.`; hsn = `HSN CODE`; qty = `QTY`; mrp = `MRP`; cost = `RATE`; taxable_value = `TAXABLE AMOUNT`; line_total = `AMOUNT`.
- **Not mapped:** `S.N`, `CGST(2.5%)`, `SGST(2.5%)`.
- **Missing:** vendor, brand, season, gender, fit, gst_rate.
- **Barcode:** EAN-13; 6 rows of 13 characters; 6 of 6 pass the EAN-13 check.
- **Quirks:**
  - Row 1 carries the document facts with no labels; row 2 is the real header.
  - `PRODUCE NAME` (sic) is the product word (`Bikini`, `BIKINI`: case varies).
  - `CGST(2.5%)` is a formula (taxable amount times 2.5%); `SGST(2.5%)` holds pasted values; `AMOUNT` is a formula (taxable plus both taxes). The tax percentage is only in the header text.
  - The sheet is 134 columns wide (the last 119 are empty).
  - 6 rows, 60 pieces (10 per row). `STOCK NO.` is a valid EAN-13 integer.
- **Difficulty:** Medium (Unlabelled header record and a tax rate that lives in a header cell.)

### 2.26. `Peter England.CSV`

- **Vendor:** `Company Name`: `ADITYA BIRLA LIFESTYLE BRANDS LIMITED` (its tax number is in `Company GST No`, present, not copied). `SUPPLIER BRAND DETAILS.xlsx` maps `PETER ENGLAND` to `MADURA PVT LTD`: the same group under another legal name.
- **Document kind:** Brand SAP-style billing extract, a true CSV, one file for 5 invoices. Family F8 (brand-sap).
- **Real format:** plain-text CSV.
- **Document:** `Invoice No` values `MSF2262000004170`, `MSF2262000004229`, `MSF2262000004296` (18 rows), `MSF2262000004473` (7 rows), `MSF2262000004635`; `Inv Date` `yyyymmdd`, 25 to 30 May 2026.
- **Sheet:** `csv`; header row 1; data from row 2.
- **Size:** 28 item rows, 33 pieces, 28 distinct barcodes (sheet holds 29 rows in all).
- **Columns, in order** (53 named columns): `Customer`, `Name`, `City`, `Customer GST No`, `Transporter Nam`, `LR No`, `LR Date`, `PO`, `Internal Ref No`, `Invoice No`, `Inv Date`, `Carton No`, `Brand`, `Product`, `Retek Class`, `HSN Code`, `Material`, `Grid`, `Size`, `Sleeve`, `EAN No`, `Quantity`, `MRP`, `WSP`, `CD%`, `CD Value`, `Discount %`, `Disc Value`, `Service Charge`, `CGST %`, `CGST Value`, `IGST %`, `IGST Value`, `SGST %`, `SGST Value`, `UGST %`, `UGST Value`, `Tax Amount`, `Invoice Amount`, `Unit MRP`, `Net Unit Cost`, `Plant`, `Material Description`, `Fabric Base Type`, `Fabric Design Type`, `Product Type`, `Color`, `Category`, `Fit Type`, `Company Name`, `Company GST No`, `Company Location`, `Unit Cost`.
- **Mapping to standard fields:** vendor = `Company Name`; buyer = `Name`; invoice_no = `Invoice No`; invoice_date = `Inv Date`; brand = `Brand`; design = `Material`; item_description = `Material Description`; category = `Retek Class`; colour = `Color`; fit = `Fit Type`; size = `Size`; barcode = `EAN No`; hsn = `HSN Code`; gst_rate = `CGST %` + `SGST %` + `IGST %` + `UGST %`; qty = `Quantity`; mrp = `MRP`; cost = `Unit Cost`; tax_amount = `Tax Amount`; line_total = `Invoice Amount`.
- **Not mapped:** `Customer`, `City`, `Customer GST No`, `Transporter Nam`, `LR No`, `LR Date`, `PO`, `Internal Ref No`, `Carton No`, `Product`, `Grid`, `Sleeve`, `WSP`, `CD%`, `CD Value`, `Discount %`, `Disc Value`, `Service Charge`, `CGST Value`, `IGST Value`, `SGST Value`, `UGST Value`, `Unit MRP`, `Net Unit Cost`, `Plant`, `Fabric Base Type`, `Fabric Design Type`, `Product Type`, `Category`, `Company GST No`, `Company Location`.
- **Missing:** season, gender.
- **Barcode:** EAN-13; 28 rows of 13 characters; 28 of 28 pass the EAN-13 check.
- **Quirks:**
  - A real CSV with 53 comma-separated fields whose names and values are padded with spaces: trim before matching.
  - Several invoices in one file.
  - `Brand` holds a code (`PJ` 19 rows, `N` 8, `RE` 1); `Product` is `FGJEANS`, `FGTSHIRT`, `FGSHIRT`; `Retek Class` is `Jeans` and so on.
  - Whole-rupee rounding: `CGST %` and `SGST %` show 3 for 2.5, and amounts are whole rupees.
  - `Service Charge` (14 to 74) is added into the taxable value; `Net Unit Cost` is `WSP` plus service charge plus tax (per unit, within a rupee), so it is tax-inclusive. Which price is the cost to book (`Unit Cost`, `WSP` or `Net Unit Cost`) is OPEN.
  - On the 5 rows with quantity 2, `WSP`, `Service Charge`, `Tax Amount` and `Invoice Amount` are LINE values while `Unit Cost`, `Net Unit Cost`, `MRP` and `Unit MRP` are per unit. Read the per-unit columns.
  - `Category` is `NA` on all rows; `Sleeve` is `H` or `F` or empty; `Color` mixes case (`BLACK`, `Navy`).
  - `Fit Type` carries brand fit codes (`PJ RG OCTANEMIDSTR`, `PC SL Slim`). `Fabric Base Type` holds fabric percentages.
  - 28 rows, 33 pieces; `EAN No` is a valid EAN-13 (text). Customer code for the Deoghar Site differs from the one in the Madura file by one digit (typo? OPEN).
- **Difficulty:** Medium (Padding, several invoices and a rounded tax percentage; the best metadata of any file.)

### 2.27. `Madura Fashion Brand AS - VH - LP.xlsb`

- **Vendor:** The seller is not a column (Madura / Aditya Birla Lifestyle Brands, from the file name and the data; inferred). `Sold to Name1` is the customer. The file lists every Madura customer (176 `Sold-to` parties); KDPS is 9 `Sold-to` codes, one per town, with the name spelled `KDPS LIFESTYLE PRIVATE LIMITED` or `KDPS LIFESTYLEPRIVATE LIMITED` (no space).
- **Document kind:** SAP billing-document extract for April 2026, for every Madura customer; only the KDPS rows are KDPS goods. Family F8 (brand-sap).
- **Real format:** OOXML workbook (.xlsb, binary parts).
- **Document:** `Reference` is the invoice number (`MSF2...` for 5,478 KDPS rows, `MSG2...` for 445); `Billing Date` is an Excel serial (6 to 30 Apr 2026).
- **Sheet:** `Sheet1`; header row 1; data from row 2.
- **Skip:** every row whose `Sold to Name1` does not begin `KDPS`.
- **Size:** 5,923 KDPS rows, 8,385 pieces, 3,812 distinct EANs (2,111 rows repeat one); the sheet holds 113,983 data rows for all customers.
- **Columns, in order** (24 named columns and 2 unnamed with data): `Sold-to`, `Sold to Name1`, `CGrp`, `SGrp`, `City`, `BillT`, `Variant Material`, `Purchase order no.`, `Bill. Doc.`, `Account group`, `Reference`, `Your Ref.`, `Billing Date`, `Dv`, `Material Grp`, `Size 1`, `EAN/UPC`, `Generic Material`, `HSN  CODE`, `Billed Quantity`, [col V: unit MRP], [col W: unit net rate], `MRP`, `NET Value`, `Tax Amount`, `Gross Value`.
- **Mapping to standard fields:** buyer = `Sold to Name1`; invoice_no = `Reference`; invoice_date = `Billing Date`; brand = `Dv`; design = `Generic Material`; category = `Material Grp`; size = `Size 1`; barcode = `EAN/UPC`; hsn = `HSN  CODE`; qty = `Billed Quantity`; mrp = `[col V, blank header, unit MRP]`; cost = `[col W, blank header, unit net rate]`; taxable_value = `NET Value`; tax_amount = `Tax Amount`; line_total = `Gross Value`.
- **Not mapped:** `Sold-to`, `CGrp`, `SGrp`, `City`, `BillT`, `Variant Material`, `Purchase order no.`, `Bill. Doc.`, `Account group`, `Your Ref.`, `MRP`.
- **Missing:** vendor, season, colour, gender, fit, gst_rate.
- **Barcode:** EAN-13; 5,923 rows of 13 characters; 5,923 of 5,923 pass the EAN-13 check.
- **Quirks:**
  - 113,983 data rows; only 5,923 rows (219 bill documents, 8,385 pieces) belong to KDPS (9 `Sold-to` codes: Deogarh, Hazaribag, Banka, Bodh Gaya, Sahibganj, Ranchi (two codes), Bokaro, Dumka).
  - The file is `.xlsb` (binary OOXML parts); the name says `AS - VH - LP` (Allen Solly, Van Heusen, Louis Philippe).
  - `BillT` on KDPS rows: `ZINV` 5,439, `ZREU` 445, `ZPOR` 39. `ZREU` rows are apparel (shirts, jackets, suits) with positive quantities and an `MSG2` reference (a return or another document kind? OPEN). `ZPOR` rows are all `FGBAG` (bags), size 0, `Your Ref.` `PROMO` on 12 of them.
  - `Dv` is a brand code: on KDPS rows `AS`, `AK`, `AL`, `AH`, `AT`, `VH`, `VW`, `VS`, `VD`, `VX`, `VF`, `LP`, `LR`, `LY`; across the whole file also `LA`, `LX`, `N`, `RE`, `AY`, `PJ`.
  - `MRP` is the LINE total (unit MRP times quantity); the unit MRP and the unit net rate sit in two columns with no header (V and W). `NET Value` is the taxable line value; `Gross Value` adds tax.
  - `Size 1` is a float for numeric sizes and text for letters; 47 KDPS rows have size 0 (39 `ZPOR` bag rows and 8 `ZINV` rows).
  - `EAN/UPC` is a 13-digit float (all 5,923 valid EAN-13, prefix 890). 3,812 distinct EANs; 1,379 of them are on more than one bill document.
  - No colour and no description; `Variant Material` and `Generic Material` are the vendor's article codes.
  - `Your Ref.` is `NA` (3,673 KDPS rows), `MAIL` (804), `ORD. TRANS` (535), `NOG` (265), a number or empty otherwise.
- **Difficulty:** Hard (Binary format, 114 thousand rows for many customers, line-total MRP and unlabelled unit columns.)

### 2.28. `BLACKBERRY.xlsx`

- **Vendor:** `BRAND NAME`: `Blackberrys` (SAP-style extract of the brand company; `SUPPLIER BRAND DETAILS.xlsx` maps the brand to `MOHAN CLOTHING COMPANY`, barcode flag YES). `BILL TO PARTY` holds a customer code.
- **Document kind:** Brand billing extract, every cell stored as text. Family F8 (brand-sap).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `INVOICE NUMBER` `8500273403`, `INVOICE DATE` `28.02.2026` (text, dots), buyer `KDPS LIFESTYLE PVT LTD` in `SHIP TO PATY NAME` (sic).
- **Sheet:** `Sheet2`; header row 1; data from row 2.
- **Size:** 29 item rows, 41 pieces, 29 distinct barcodes (sheet holds 30 rows in all).
- **Columns, in order** (41 named columns): `BRAND NAME`, `INVOICE NUMBER`, `INVOICE DATE`, `BILL TO PARTY`, `SHIP TO PARTY CODE`, `SHIP TO PATY NAME`, `ORDER TYPE`, `SPSN`, `CATEGORY`, `GROUP CATEGORY`, `DELIVERY  NO`, `G ARTICLE`, `SIZES`, `EANCODE`, `ITEM DESCRIPTION`, `FIT`, `STYLE`, `COLOUR`, `INVOICE QTY`, `UNIT MRP`, `CHANNEL`, `SALES OFC`, `BASIC AMOUNT`, `DISCOUNT VALUE`, `DISCOUNT %`, `TAXABLE VALUE`, `COST PER UNIT`, `HSN CODE`, `BRAND TYPE`, `LINE ITEM NUMBER`, `SUPPLYING PLANT`, `IGST VALUE`, `CGST VALUE`, `SGST VALUE`, `IGST TAX %`, `CGST TAX %`, `SGST TAX %`, `DOCKET NO`, `DOCKET DATE`, `ACKNOWLEDGEMENT NO`, `ARTICLE SEASON`.
- **Mapping to standard fields:** buyer = `SHIP TO PATY NAME`; invoice_no = `INVOICE NUMBER`; invoice_date = `INVOICE DATE`; brand = `BRAND NAME`; season = `ARTICLE SEASON`; design = `G ARTICLE`; item_description = `ITEM DESCRIPTION`; category = `GROUP CATEGORY`; colour = `COLOUR`; fit = `FIT`; size = `SIZES`; barcode = `EANCODE`; hsn = `HSN CODE`; gst_rate = `IGST TAX %` + `CGST TAX %` + `SGST TAX %`; qty = `INVOICE QTY`; mrp = `UNIT MRP`; cost = `COST PER UNIT`; taxable_value = `TAXABLE VALUE`; tax_amount = `IGST VALUE` + `CGST VALUE` + `SGST VALUE`.
- **Not mapped:** `BILL TO PARTY`, `SHIP TO PARTY CODE`, `ORDER TYPE`, `SPSN`, `CATEGORY`, `DELIVERY  NO`, `STYLE`, `CHANNEL`, `SALES OFC`, `BASIC AMOUNT`, `DISCOUNT VALUE`, `DISCOUNT %`, `BRAND TYPE`, `LINE ITEM NUMBER`, `SUPPLYING PLANT`, `DOCKET NO`, `DOCKET DATE`, `ACKNOWLEDGEMENT NO`.
- **Missing:** vendor, gender.
- **Barcode:** EAN-13; 29 rows of 13 characters; 29 of 29 pass the EAN-13 check.
- **Quirks:**
  - Every value is text, including numbers (`2399.00`), dates (`28.02.2026`) and codes.
  - `ARTICLE SEASON` is `SS26` (24 rows) or `AW25` (5 rows).
  - `FIT` values (`INDIA SLIM`, `B-95`, `B-91`) are brand fit names that also appear in the master `FIT` list.
  - `CATEGORY` is a code (`DL`, `MS`); `GROUP CATEGORY` is the readable word (`FORMAL TROUSER`, `FORMAL SHIRTS`). `STYLE` is the style name; `G ARTICLE` is the article code (which of the two is KDPS's DESIGN is OPEN).
  - The tax is split into `IGST`, `CGST` and `SGST` value and percentage columns (IGST 5% on the rows seen; CGST and SGST 0.00).
  - `BASIC AMOUNT` is the MRP line, `DISCOUNT VALUE` / `DISCOUNT %` the brand discount, `COST PER UNIT` the rate after discount. 29 rows, 41 pieces.
  - `SHIP TO PARTY CODE`, `BILL TO PARTY`, `CHANNEL`, `SALES OFC`, `SUPPLYING PLANT`, `DOCKET NO` and `ACKNOWLEDGEMENT NO` are not needed for stock.
- **Difficulty:** Easy (Clean single table; all text, so every value needs parsing.)

### 2.29. `USPOLO INNER WEAR.csv`

- **Vendor:** Seller: a distributor, `DAULAL NANDLAL TRADING PRIVATE LIMITED` (column F; tax number in column G, present, not copied). Buyer `KDPS LIFESTYLE P LTD` (column K). The brand is only in the file name; `SUPPLIER BRAND DETAILS.xlsx` maps `US POLO INNERWEAR` to `OM GANPATI (DMK)` and `U. S. POLO INNERWEAR` to `ANAND FABRICS`.
- **Document kind:** Distributor invoice-line export with no header row (56 columns). Family F9 (printed-invoice).
- **Real format:** plain-text CSV.
- **Document:** Column A `AV116` (invoice), column B `13-03-2026`, columns C and D `March` and `2026`; one invoice.
- **Sheet:** `csv`; no header row; data from row 1.
- **Size:** 14 item rows, 119 pieces, 14 distinct barcodes (sheet holds 14 rows in all).
- **Columns:** none named. 56 columns (A to BD); see the mapping.
- **Mapping to standard fields:** vendor = `[col F, no header]`; buyer = `[col K, no header]`; invoice_no = `[col A, no header]`; invoice_date = `[col B, no header]`; design = `[col AB, no header]`; item_description = `[col X, no header]`; category = `[col Y, no header]`; colour = `[col AD, no header]`; size = `[col AE, no header]`; barcode = `[col U, no header]`; hsn = `[col AA, no header]`; gst_rate = `[col AU, no header]` + `[col AW, no header]`; qty = `[col AH, no header]`; mrp = `[col AJ, no header]`; cost = `[col AI, no header]`; taxable_value = `[col AQ, no header]`; tax_amount = `[col BB, no header]`; line_total = `[col BA, no header]`.
- **Not mapped:** [col C, no header], [col D, no header], [col E, no header], [col G, no header], [col H, no header], [col I, no header], [col J, no header], [col L, no header], [col M, no header], [col O, no header], [col P, no header], [col R, no header], [col S, no header], [col T, no header], [col V, no header], [col AC, no header], [col AG, no header], [col AK, no header], [col AL, no header], [col AM, no header], [col AN, no header], [col AO, no header], [col AP, no header], [col AR, no header], [col AS, no header], [col AT, no header], [col AV, no header], [col AX, no header], [col BC, no header], [col BD, no header].
- **Missing:** brand, season, gender, fit.
- **Barcode:** EAN-13; 14 rows of 13 characters; 14 of 14 pass the EAN-13 check.
- **Quirks:**
  - There is no header row: row 1 is data. The mapping is inferred from the values (guess) and must be confirmed with the vendor.
  - Column V holds `item code-description-colour-pack-size`; column X repeats it without the code; column AC is the pack (`1P`, `2P`, `6P`); column AD is the colour.
  - Quantity (column AH) counts packs: `2P` row has 24, `6P` row has 10; the MRP and the rate are per pack.
  - Columns AL to AP hold 0 or repeat the amount. `AS` is -0.33 and `AT` is 25143 on every row: `AT` looks like the invoice total (the sum of column BA is 25,142.70), `AS` its round-off (inferred).
  - Column BC holds a print timestamp and column BD `Normal Sale`.
  - 14 rows, 119 packs, 14 distinct valid EAN-13 codes.
- **Difficulty:** Hard (No header row, a mapping that has to be inferred, and quantities in packs.)

### 2.30. `AS INNERWEAR.csv`

- **Vendor:** Seller: `T.T.APPARELS`, Ranchi (letterhead rows 1 to 15; tax numbers and contact details present, not copied). Buyer `M/s KDPS LIFESTYLE PVT LTD` (Hazaribagh address). The `Company` column holds `ADDON`.
- **Document kind:** Printed tax invoice saved as a spreadsheet: letterhead, header block, one table, totals block and amount in words. Family F9 (printed-invoice).
- **Real format:** BIFF/OLE2 workbook (.xls); the `.csv` extension is wrong.
- **Document:** `Invoice No` `ADD-289` (cell K10), `Date :` `16/03/2026` (text, cell P10), `LR/GR No` date `16/03/2026`.
- **Sheet:** `INVOICE`; header row 16; data from row 17.
- **Skip:** rows 1 to 15 (letterhead and document header); rows 27 to 40 (totals block, amount in words, terms).
- **Size:** 10 item rows, 155 pieces, 10 distinct barcodes (sheet holds 40 rows in all).
- **Columns, in order** (16 named columns): `HSN Code`, `Particulars`, `Packing`, `Company`, `Batchno`, `Expiry`, `MFG`, `M.R.P.`, `Qty.`, `Free`, `Rate`, `SGST%`, `CGST%`, `Amount`, `Disc%`, `Barcode`.
- **Mapping to standard fields:** vendor = `[cell A1, letterhead]`; buyer = `[cell A10]`; invoice_no = `[cell K10]`; invoice_date = `[cell P10]`; item_description = `Particulars`; barcode = `Barcode`; hsn = `HSN Code`; gst_rate = `SGST%` + `CGST%`; qty = `Qty.`; mrp = `M.R.P.`; cost = `Rate`; line_total = `Amount`.
- **Not mapped:** `Packing`, `Company`, `Batchno`, `Expiry`, `MFG`, `Free`, `Disc%`.
- **Missing:** brand, season, colour, gender, fit.
- **Barcode:** brand initials plus MRP (not a barcode); 10 rows of 5 characters; 0 of 10 pass the EAN-13 check.
- **Quirks:**
  - The `.csv` extension is wrong: it is a binary `.xls` (OLE2) file, with 42 merged cells.
  - `HSN Code` holds the code and the product word in one padded cell (`61159500       SOCKS`).
  - Brand and MRP live in `Particulars` (`ALLEN SOLLY SOCKS MRP-159`): four brands in one invoice (Allen Solly, Louis Philippe, Peter England, Van Heusen).
  - `Barcode` is the brand initials plus the MRP (`AS159`, `LP249`, `PE139`, `VH369`): not unique per item, not a barcode.
  - No size or colour. `Packing` is `10PCS`, `1PCS` or empty. `Free`, `Expiry`, `MFG`, `Batchno` are empty.
  - 10 rows, 155 pieces (quantity 5 to 35 per row). `SGST%` and `CGST%` are 2.5 each.
  - Totals block (`Total`, `Less Discount`, `Add SGST`, `Add CGST`, `Less :  Round Off`, `Total`) sits below the table.
- **Difficulty:** Hard (Printed layout, no barcode, no size, brand and price inside free text.)

### 2.31. `XERICS JEANS PT FILE.xlsx`

- **Vendor:** Not named inside the file. The brand `XERICS` maps to `SNEHA ENTERPRISES` in `SUPPLIER BRAND DETAILS.xlsx` (barcode flag NO).
- **Document kind:** Invoice-style `GST INVOICE` sheet with a two-row header. Family F9 (printed-invoice).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** No invoice number or date inside the file.
- **Sheet:** `GST INVOICE`; header row 1; data from row 3.
- **Skip:** row 2 (second header row: `No.`, `Marginal`); the subtotal row 93 (amount only) and the `Total` row 94 (blank `Br-Code`).
- **Size:** 90 item rows, 90 pieces, 20 distinct barcodes (70 rows repeat one) (sheet holds 94 rows in all).
- **Columns, in order** (11 named columns and 1 unnamed with data): `Sl`, `Br-Code`, `Description of Goods`, `HSN/SAC`, `Size`, `MRP/`, `Quantity`, [col H: formula `LEFT(F3,5)`: MRP text cut to 5 characters], `Rate`, `per`, `Disc. %`, `Amount`.
- **Mapping to standard fields:** design = `Description of Goods`; size = `Size`; barcode = `Br-Code`; hsn = `HSN/SAC`; qty = `Quantity`; mrp = `MRP/`; cost = `Rate`; line_total = `Amount`.
- **Not mapped:** `Sl`, `per`, `Disc. %`, [col H: blank header].
- **Missing:** vendor, buyer, invoice_no, invoice_date, brand, season, colour, gender, fit, gst_rate.
- **Barcode:** style-plus-size code (not a barcode); 90 rows of 7 characters; 0 of 90 pass the EAN-13 check.
- **Quirks:**
  - The header is two rows (`Sl` over `No.`, `MRP/` over `Marginal`).
  - `Br-Code` is 7 digits: a 5-digit style plus a 2-digit size (`5000730`). Only 20 distinct codes on 90 rows (70 repeats): one row per piece. The supplier flag is NO: KDPS prints its own barcode for this vendor.
  - `MRP/` is text (`1,195.00/pcs`); column H (no header) is a formula that keeps the first five characters.
  - `Disc. %` is 5 on every row; `Amount` is a constant per row (the rate less that discount), not a formula.
  - `Quantity` is 1 on every row; 90 pieces. `per` is `pcs`.
  - No GST percentage, tax amounts, invoice number, date, vendor or buyer.
- **Difficulty:** Medium (Two-row header, text MRP, a style-and-size code that is not a barcode.)

### 2.32. `ambreli 1855.xls`

- **Vendor:** Seller: `OVERSEAS ENTERPRISES`, Delhi (letterhead; tax number present, not copied). `SUPPLIER BRAND DETAILS.xlsx` maps `AMBRELI` to the same supplier (barcode flag YES). Buyer `KDPS LIFESTYLE PRIVATE LIMITED (C/O JAINSONS LIFESTYLE)`, Hazaribagh.
- **Document kind:** Tax invoice sheet (`INVOICE`) plus a hidden packing list (`PACKING`). Family F9 (printed-invoice).
- **Real format:** BIFF/OLE2 workbook (.xls).
- **Document:** `Invoice No.` `1855-GST/2025-26`, `Invoice Date` Excel serial 46074 (21 Feb 2026). Goods line (row 23): `SHAWLS, STOLES & SCARVES ETC`.
- **Layout, sheet `INVOICE`:**
  - Header rows 24 and 25; data from row 26.
  - **Skip:** rows 1 to 23 (letterhead, document header, receiver and consignee blocks); the `TOTAL` row (row 42).
  - **Size:** 16 item rows, 76 pieces, 16 distinct barcodes (sheet holds 42 rows in all).
  - **Columns, in order** (two-row header): `S.No.`, `DESCRIPTION OF PRODUCT` over `STYLE NAME` (column B), `EAN CODE` (column C, row 25 only), `HSN CODE`, `COLOR`, `UOM`, `MRP`, `SET`, `QTY`, `RATE 60.24%      OF MRP`, `TAXABLE VALUE`, `CGST` over `Rate %` and `Amount`, `SGST` over `Rate %` and `Amount`, `IGST` over `Rate %` and `Amount`, `TOTAL`.
  - **Mapping to standard fields:** vendor = `[cell A1, letterhead]`; buyer = `[cell D11]`; invoice_no = `[cell D6]`; invoice_date = `[cell D7]`; design = `STYLE NAME`; colour = `COLOR`; barcode = `EAN CODE`; hsn = `HSN CODE`; gst_rate = `[row 25 `Rate %` under `CGST`, `SGST`, `IGST` (columns L, N, P)]`; qty = `QTY`; mrp = `MRP`; cost = `RATE 60.24%      OF MRP`; taxable_value = `TAXABLE VALUE`; tax_amount = `[row 25 `Amount` under `CGST`, `SGST`, `IGST` (columns M, O, Q)]`; line_total = `TOTAL`.
  - **Not mapped:** `S.No.`, `UOM`, `SET`.
  - **Missing:** brand, season, gender, fit.
  - **Barcode:** EAN-13; 16 rows of 13 characters; 16 of 16 pass the EAN-13 check.
- **Layout, sheet `PACKING` (hidden):**
  - Header row 23; data from row 24.
  - **Skip:** rows 1 to 22; the `TOTAL` rows 97 and 98 (no EAN).
  - **Size:** 72 item rows, 275 pieces, 72 distinct barcodes (sheet holds 99 rows in all).
  - **Columns, in order** (8 named columns): `S. NO.`, `CARTON`, `STYLE NO.`, `EAN CODE`, `COLOUR`, `MRP`, `SET`, `QTY`.
  - **Mapping to standard fields:** design = `STYLE NO.`; colour = `COLOUR`; barcode = `EAN CODE`; qty = `QTY`; mrp = `MRP`.
  - **Not mapped:** `S. NO.`, `CARTON`, `SET`.
  - **Missing:** vendor, buyer, invoice_no, invoice_date, brand, season, gender, fit, hsn, gst_rate, cost.
  - **Barcode:** EAN-13; 72 rows of 13 characters; 72 of 72 pass the EAN-13 check.
- **Quirks:**
  - The `INVOICE` sheet has a letterhead (rows 1 to 23, 46 merged cells), a two-row header (rows 24 and 25) and 16 lines (76 pieces); the invoice date is an Excel serial.
  - Header text `RATE 60.24%      OF MRP`: the rate is stated as a share of MRP in the column name itself. The IGST rate is stored as 0.05.
  - The hidden `PACKING` sheet has 72 lines (275 pieces) with a `CARTON` label on the first row of each carton only; `SET` is a number or the word `LOOSE`.
  - Only 1 of the 16 invoice EANs also appears in the packing list: the two sheets do not reconcile (one shipment? OPEN).
  - Quantity on two invoice lines is 3 where the others are 5; `COLOR` is `ASSORTED` on every invoice line.
  - The invoice is IGST (the seller is in Delhi, the buyer in Jharkhand); the total taxable value and tax are in the `TOTAL` row.
- **Difficulty:** Hard (Letterhead, two-row header, hidden second sheet that does not reconcile with the first.)

### 2.33. `DSY.xlsx`

- **Vendor:** Not named inside the file. The brand `DSY` maps to `DS YUVRAAJ` in `SUPPLIER BRAND DETAILS.xlsx` (barcode flag YES).
- **Document kind:** Invoice-line list with a formula-driven rate. Family F2 (voucher-register).
- **Real format:** OOXML workbook (.xlsx).
- **Document:** `INVOICE NO` `DS/01028/25-26` and `INVOICE DATE` `13/02/2026` (text) repeat on every row.
- **Sheet:** `Sheet1`; header row 1; data from row 2.
- **Size:** 23 item rows, 23 pieces, 23 distinct barcodes (sheet holds 24 rows in all).
- **Columns, in order** (17 named columns): `Sl NO.`, `ITEM NAME`, `BRAND`, `Barcode`, `SIZE`, `QTY`, `MRP`, `Mark Down`, `RATE`, `HSNCODE`, `CATEGORY`, `GENDER`, `INVOICE NO`, `INVOICE DATE`, `TAX`, `CD%`, `AMOUNT`.
- **Mapping to standard fields:** invoice_no = `INVOICE NO`; invoice_date = `INVOICE DATE`; brand = `BRAND`; design = `ITEM NAME`; category = `CATEGORY`; gender = `GENDER`; size = `SIZE`; barcode = `Barcode`; hsn = `HSNCODE`; gst_rate = `TAX`; qty = `QTY`; mrp = `MRP`; cost = `RATE`; line_total = `AMOUNT`.
- **Not mapped:** `Sl NO.`, `Mark Down`, `CD%`.
- **Missing:** vendor, buyer, season, colour, fit.
- **Barcode:** internal numeric code; 6 rows of 13 characters, 17 rows of 14 characters; 0 of 23 pass the EAN-13 check.
- **Quirks:**
  - `Barcode` is 13 or 14 digits and always begins with 0 (17 rows are 14 digits, 6 are 13): 3 of 23 pass a GTIN check, so it is an internal code, with a leading zero to keep.
  - `RATE` is a formula: MRP less 43.2% when MRP is above 2624, otherwise less 40%. The value carries float noise (`3152.3999...`).
  - `AMOUNT` is the invoice total repeated on every row, not the line amount.
  - `MRP` varies by size inside one style. `TAX` is 5 on 12 rows and 18 on 11 rows (by category: `W/C KURTA SET` and `INDO WESTERN SET`).
  - `CD%` is empty; `Mark Down` is 43.2 on every row. `HSNCODE` is one value (610329) for all rows.
  - No colour, season, vendor or buyer. 23 rows, 23 pieces.
- **Difficulty:** Medium (Internal 14-digit codes with a leading zero, a formula rate and a repeated total.)

## 3. Layout families

| Family | Name | Files | Difficulty |
| --- | --- | --- | --- |
| F1 | Bare item list or master-style list (no bill header, or a thin one) | `36257 KDPS SUVIDHI.xls`, `FAHRENHEIT 60518.xls`, `AMIDHARA.xlsx`, `peppermint 13.xlsx`, `minelli 06161.xlsx`, `kidcity 1316&1317.xlsx` | Easy 5, Medium 1 |
| F2 | Voucher or sales-register export (`Stock No`, `Retail Price`, `Item Rate`) and its cousins | `ARVIND ALL BRAND & SPYKAR_PT.xlsx`, `BK ENTERPRISES_LC_PT.xlsx`, `DEAL SS26 2970.xlsx`, `ZILU BOTTOMS.xlsx`, `BANJARAN.xlsx`, `DSY.xlsx` | Easy 4, Medium 2 |
| F3 | Accounting export with `ITEM CODE`, `TOTAL QTY` or `QTY`, `TAX-1(RS)`, `TAX-3(RS)` | `SWEET DREAMS.xlsx`, `KILLER JUNIOR.xlsx` | Easy 2 |
| F4 | Ledger report with a CGST / SGST / IGST / Net Amount tail | `TWILLS.xls`, `STATUS QUO.xlsx` | Medium 1, Easy 1 |
| F5 | `PT EMAIL` snake-case export (`INVOICE_NO`, `CATEGORY1` to `CATEGORY5`) | `BEEVEE 390.xlsx`, `go colours 000023.xlsx`, `MUFTI.xlsx`, `HYPHEN.xlsx` | Easy 4 |
| F6 | Jockey `Bill Wise Item List` report | `JOCKEY 852.xls`, `JOCKEY PARAS.xls`, `JOCKEY-NARAYANI.xls`, `JOCKEY-NARVADA.xls`, `JOCKEY_DD SALES.xls` | Medium 5 |
| F7 | Jockey invoice printout with an unlabelled header record | `JOCKEY.xlsx` | Medium 1 |
| F8 | Aditya Birla / Madura and other brand SAP-style billing extracts | `Peter England.CSV`, `Madura Fashion Brand AS - VH - LP.xlsb`, `BLACKBERRY.xlsx` | Medium 1, Hard 1, Easy 1 |
| F9 | Printed invoice or distributor layout (letterhead, two-row header or no header) | `USPOLO INNER WEAR.csv`, `AS INNERWEAR.csv`, `XERICS JEANS PT FILE.xlsx`, `ambreli 1855.xls` | Hard 3, Medium 1 |

- Family F1 and F3 look alike (item code, quantity, rate, a tax-in-rupees tail). `SUVIDHI` and `FAHRENHEIT` share the look of F3.
- Family F2 holds `DSY.xlsx` and `BANJARAN.xlsx` as cousins: they have no `Stock No` / `Retail Price` pair but the same one-row-per-voucher-line idea. `DSY.xlsx` is listed with F2 here for convenience.
- Family F5 is the cleanest and the easiest to detect by its header (`INVOICE_NO`, `CATEGORY1` to `CATEGORY5`); `HYPHEN.xlsx` is a sibling with different names.
- Family F6 (Jockey) varies by file: the header sits on row 9 in four files and row 1 in one; some files lack `Customer Name`, `Cost` or `HSN Code`; `PARAS` adds nine columns. Read by name.
- Layout detection by structure (`PRD-IMP-004`): the header names above are distinctive enough to detect F5, F6, F2, F3 (`ITEM CODE` with `TAX-1(RS)`), F4 (`CGST`, `SGST`, `IGST`, `Net Amount`) and Peter England (53 padded names). F1, F9 and the headerless `USPOLO INNER WEAR.csv` need a saved mapping per source (`PRD-IMP-003`).

## 4. The common field set

Standard fields used in the mapping (also `standard_fields` in `pt-layouts.json`). Count = how many of the 35 vendor layouts map the field to a column.

| Standard field | Meaning | Layouts mapping it |
| --- | --- | --- |
| `vendor` | Seller or invoicing party named in the file | 12 of 35 |
| `buyer` | Buyer, ship-to or store hint named in the file | 24 of 35 |
| `invoice_no` | Document number the file belongs to | 28 of 35 |
| `invoice_date` | Document date | 26 of 35 |
| `brand` | Brand as written (a code in some files) | 16 of 35 |
| `season` | Season as written (label, code or date-corrupted text) | 7 of 35 |
| `design` | Style, design or article code (KDPS column DESIGN) | 33 of 35 |
| `item_description` | Free-text name of the item | 21 of 35 |
| `category` | Vendor's own product or category word | 28 of 35 |
| `colour` | Colour or shade (KDPS COLOR also holds the tags `PREMIUM`, `MEDIUM`, `ECONOMY`) | 27 of 35 |
| `gender` | Gender as written | 6 of 35 |
| `fit` | Fit as written | 5 of 35 |
| `size` | Size as written | 30 of 35 |
| `barcode` | The code to scan or print (EAN-13, internal or other) | 35 of 35 |
| `hsn` | HSN code | 31 of 35 |
| `gst_rate` | GST percentage as supplied on the line | 22 of 35 |
| `qty` | Quantity on the row (can be more than 1) | 35 of 35 |
| `mrp` | Unit MRP | 35 of 35 |
| `cost` | Unit rate before tax as billed by the vendor (KDPS column BASIC) | 32 of 35 |
| `taxable_value` | Taxable value of the line | 15 of 35 |
| `tax_amount` | Tax amount of the line (one component or the total) | 18 of 35 |
| `line_total` | Line total as the file states it | 26 of 35 |

KDPS-only fields (`item`, `sub_category`, `type`, `p_rate`, `input_tax`, `output_tax`, `nag`, `margin`) appear only in KDPS's own layouts. No vendor file supplies `item`, `sub_category` or `type` in the KDPS vocabulary: they come from the master and from the `SUGGESTED` hints (`PRD-PTW-012`).

Present in every layout: a barcode or code, a quantity, a style or description, an MRP and a size (the exceptions are `AS INNERWEAR.csv`, which has no size, and `kidcity`, whose size is an age group).

Often missing (layouts that do not map the field):

- **colour as its own field:** 8 of 35 layouts (8 files). `36257 KDPS SUVIDHI.xls`, `AS INNERWEAR.csv`, `DSY.xlsx`, `FAHRENHEIT 60518.xls`, `HYPHEN.xlsx`, `Madura Fashion Brand AS - VH - LP.xlsb`, `TWILLS.xls`, `XERICS JEANS PT FILE.xlsx`.
- **HSN:** 4 of 35 layouts (4 files). `36257 KDPS SUVIDHI.xls`, `JOCKEY 852.xls`, `ambreli 1855.xls`, `kidcity 1316&1317.xlsx`.
- **GST percentage:** 13 of 35 layouts (12 files). `36257 KDPS SUVIDHI.xls`, `AMIDHARA.xlsx`, `BK ENTERPRISES_LC_PT.xlsx`, `HYPHEN.xlsx`, `JOCKEY.xlsx`, `KILLER JUNIOR.xlsx`, `Madura Fashion Brand AS - VH - LP.xlsb`, `SWEET DREAMS.xlsx`, `TWILLS.xls`, `XERICS JEANS PT FILE.xlsx`, `ambreli 1855.xls`, `kidcity 1316&1317.xlsx`.
- **cost:** 3 of 35 layouts (2 files). `AMIDHARA.xlsx`, `ambreli 1855.xls`.
- **invoice number:** 7 of 35 layouts (6 files). `36257 KDPS SUVIDHI.xls`, `AMIDHARA.xlsx`, `FAHRENHEIT 60518.xls`, `XERICS JEANS PT FILE.xlsx`, `ambreli 1855.xls`, `peppermint 13.xlsx`.
- **invoice date:** 9 of 35 layouts (8 files). `36257 KDPS SUVIDHI.xls`, `AMIDHARA.xlsx`, `FAHRENHEIT 60518.xls`, `XERICS JEANS PT FILE.xlsx`, `ambreli 1855.xls`, `kidcity 1316&1317.xlsx`, `minelli 06161.xlsx`, `peppermint 13.xlsx`.
- **vendor name:** 23 of 35 layouts in 22 files (too many to list; see `pt-layouts.json`, where the field is `null`).
- **buyer:** 11 of 35 layouts (10 files). `36257 KDPS SUVIDHI.xls`, `AMIDHARA.xlsx`, `BANJARAN.xlsx`, `DSY.xlsx`, `FAHRENHEIT 60518.xls`, `JOCKEY-NARVADA.xls`, `XERICS JEANS PT FILE.xlsx`, `ambreli 1855.xls`, `kidcity 1316&1317.xlsx`, `peppermint 13.xlsx`.
- **a brand column:** 19 of 35 layouts in 18 files (too many to list; see `pt-layouts.json`, where the field is `null`).
- **season:** 28 of 35 layouts in 26 files (too many to list; see `pt-layouts.json`, where the field is `null`).
- **gender:** 29 of 35 layouts in 27 files (too many to list; see `pt-layouts.json`, where the field is `null`).
- **fit:** 30 of 35 layouts in 28 files (too many to list; see `pt-layouts.json`, where the field is `null`).

Where a file gives a GST amount and no percentage (`BK ENTERPRISES_LC_PT.xlsx`, `TWILLS.xls`, `SWEET DREAMS.xlsx`, `KILLER JUNIOR.xlsx`, `Madura ...xlsb`), the percentage has to be derived, and `PRD-PTW-013` blocks calculations that have missing inputs.

## 5. Cross-file notes

### Same vendor in several files

- **Jockey:** five `Bill Wise Item List` files (`JOCKEY 852.xls`, `JOCKEY PARAS.xls`, `JOCKEY-NARAYANI.xls`, `JOCKEY-NARVADA.xls`, `JOCKEY_DD SALES.xls`) and one invoice printout (`JOCKEY.xlsx`). Two customer codes appear across the five report files (`852` has one, the other four share the second). The bill prefix differs per file (`SCRS25`, `PECRS26`, `P2CRS26`, `EDCRS26`, `DD/JBN26`); the printout has `JCRS26/10`. What the file-name suffixes (`PARAS`, `NARAYANI`, `NARVADA`) mean is not stated (depot or sub-division, guess). `SUPPLIER BRAND DETAILS.xlsx` maps `JOCKEY` to `OM GANPATI (DMK)`.
- **D Apparel:** `STATUS QUO.xlsx` (invoice `DA/26-27/0160`) and the worked example (`DA/26-27/0119`). `SWEET DREAMS.xlsx` names `D D APPARELS`; the brand list maps `SWEET DREAMS` to `DD APPAREL` and `STATUS QUO` to `D APPAREL`, so these may be two businesses (OPEN).
- **Aditya Birla / Madura:** `Peter England.CSV` (invoices 25 to 30 May 2026) and the Madura `.xlsb` (April 2026). No invoice and no EAN is in both files (checked: 28 EANs against all 113,983 rows). The Deoghar customer code differs by one digit between them (typo?). `BLACKBERRY.xlsx` has a similar shape but is the Blackberrys brand company.
- **Om Ganpati:** `Party Name` of `DEAL SS26 2970.xlsx`; a supplier (`OM GANPATI (DMK)`) for Jockey, Lee and US Polo innerwear in the brand list; and one of two legal entities in the debit-and-credit-note workbook. Which role applies in the DEAL file is OPEN.

### Barcodes

- 10 files do not carry a plain EAN-13 as their code: `36257 KDPS SUVIDHI.xls`, `AMIDHARA.xlsx`, `minelli 06161.xlsx`, `kidcity 1316&1317.xlsx`, `ZILU BOTTOMS.xlsx`, `BANJARAN.xlsx`, `HYPHEN.xlsx`, `AS INNERWEAR.csv`, `XERICS JEANS PT FILE.xlsx`, `DSY.xlsx`. Kinds: 12-digit internal (`SUVIDHI`), 10-digit (`AMIDHARA`, `minelli`), 5-digit (`ZILU`), 6-digit (`BANJARAN`), 8-character alphanumeric (`HYPHEN`), 13 or 14 digits with a leading zero (`DSY`), 13-digit sequential internal (`kidcity`), 7-digit style plus size (`XERICS`), brand initials plus MRP (`AS INNERWEAR`).
- `BK ENTERPRISES_LC_PT.xlsx` has a valid EAN-13 check digit under the prefix 777, not the Indian 890: probably vendor-made (inferred). `SWEET DREAMS.xlsx` has an internal `ITEM CODE` next to the real EAN-13 in `ADDITIONAL ITEM CODE`; read the second.
- The supplier flag in `SUPPLIER BRAND DETAILS.xlsx` does not predict the code kind. Suppliers flagged YES send non-EAN codes in `ZILU` (`FASHION MARKETING`), `BANJARAN` (`VINAYAK EMPORIUM PVT LTD`), `HYPHEN` (`HYPHEN GARMENTS PVT LTD`), `minelli` (`SHUBH SHRI CLOTHING PRIVATE LIMITED`), `AMIDHARA` (`SHRI SAI ENTERPRISES`), `DSY` (`DS YUVRAAJ`), `kidcity` (`KIDCITY SOLUTIONS PVT. LTD.`) and `SUVIDHI` (`SUVIDHI TEXTILES PRIVATE LIMITED`). The one NO supplier in this set, `SNEHA ENTERPRISES` (`XERICS`), sends a style-and-size code. The vendors `T.T.APPARELS` and `DAULAL NANDLAL TRADING PRIVATE LIMITED` are not in the flag list.
- **A barcode is not unique in a file.** Rows repeat a barcode in `STATUS QUO.xlsx` (10), `JOCKEY PARAS.xls` (13), `JOCKEY_DD SALES.xls` (20), `kidcity` (16 across the two invoices), `XERICS` (70) and the vendor example (22). In the Madura file 1,379 of 3,812 KDPS EANs are on more than one bill document.
- **One barcode, two MRPs:** four EANs in `JOCKEY_DD SALES.xls` (for example 629 and 639). MRP also varies by size inside one style (`AMIDHARA`, `DSY`). The master of codes must not treat MRP as a property of the barcode (`PRD-MER-009`).
- `PRD-MER-006` and `PRD-MER-007` (preserve leading zeros, reject ambiguous mappings) matter here: `DSY` codes begin with 0 and several vendors share short numeric ranges (5-digit, 6-digit, 7-digit codes could collide across vendors).

### More than one invoice in a file

- `kidcity 1316&1317.xlsx` (2 invoices, one hidden by a filter), `Peter England.CSV` (5), the Madura `.xlsb` (219 bill documents for KDPS, a whole month for 176 customers), `JOCKEY_DD SALES.xls` (2 bills). The other files are one invoice each, or carry no invoice number at all (`SUVIDHI`, `FAHRENHEIT`, `AMIDHARA`, `peppermint`, `XERICS`).
- A PT file for one GRN versus a file spanning invoices is OPEN (question 1 below). `PRD-IMP-011` and `PRD-IMP-012` need a document identity: the invoice number, which is missing in five files.

### Quantity above 1 on a row

- Rows with a quantity above 1 occur in 20 of the 33 files. The largest quantities on one row: `AS INNERWEAR.csv` (35), `USPOLO INNER WEAR.csv` (24), `Madura Fashion Brand AS - VH - LP.xlsb` (18), `JOCKEY PARAS.xls` (10), `JOCKEY-NARAYANI.xls` (10), `JOCKEY-NARVADA.xls` (10). `BANJARAN.xlsx` has 3 or 4 on every row.
- `USPOLO INNER WEAR.csv` counts packs (`2P`, `6P`), not pieces.
- KDPS's own example writes one row per piece. Whether a quantity N means N labels or one row with N is OPEN; `PRD-MER-015` prints piece-ID labels from the receipt count, and `PRD-MER-003` gives every piece its own internal ID.

### Dates, numbers and structure

- Dates arrive six ways: real dates; `dd/mm/yyyy` text (`SWEET DREAMS`, `KILLER JUNIOR`, Jockey, `DSY`, `AS INNERWEAR`); `dd.mm.yyyy` text (`BLACKBERRY`); `dd-mm-yyyy` text (`USPOLO`); `yyyymmdd` text (`Peter England`); Excel serial numbers (Madura, `ambreli`). One date column is mislabelled `Educational` (`TWILLS`).
- Numbers stored as text: `SUVIDHI` and `FAHRENHEIT` (everything), `minelli`, `BLACKBERRY`, the Jockey `Batch No.` (the MRP), `kidcity` `Price` (140 of 272 rows) and `peppermint` `Stock No`.
- Total or filler rows exist in most files; the skip rules are in each section.
- Hidden content: the `PACKING` sheet of `ambreli 1855.xls`, 228 filter-hidden rows in `kidcity`, a 1.5 MB size for 31 rows in `JOCKEY-NARAYANI.xls`.
- Store hints sit in free text: `-(HAZARIBAGH)` and the `REF SITE` codes `KDPS-HZB-BV`, `KDPS-HZB-GC`, `KDPS-HZB-MF` (F5), `-DEO` (`STATUS QUO`, and the example), `-JNR    -DUMKA` (`KILLER JUNIOR`), `RANCHI` (`SWEET DREAMS`, `HYPHEN`), `(JAINSONS LIFESTYLE)` (`DEAL`, `ambreli`), the `City` column (`Peter England`, Madura). See [stores-and-codes.md](stores-and-codes.md).
- No row has an MRP below its rate in the 27 layouts where both columns are named.

## 6. Open questions

| # | Question | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | Is one PT file one invoice or one GRN, or can it span invoices (`kidcity` has 2, `Peter England.CSV` 5, the Madura file a whole month for every customer)? Which Madura rows are KDPS stock (the 9 `Sold-to` codes; bill types `ZREU` and `ZPOR`)? | Product owner with Booking | Stage 2 import design |
| 2 | Which price is the cost to book: the vendor rate, taxable value over quantity, or the net unit cost (`Peter England.CSV` service charge, `MUFTI.xlsx` +0.35%, Jockey `Cost` against `Doc Rate`, `DEAL SS26 2970.xlsx` `Purchase Price` at 93% of `Item Rate`)? | Booking and Accounts (per brand costing profile, `POL-03.06`) | Stage 2 costing |
| 3 | What do the template's `P RATE` multipliers 1.2 and 1.1 mean, why do the tabs differ, and is each brand's `BASIC` to `P RATE` rule a policy (`POL-03.06`, `POL-03.07`)? In the worked example `BASIC` is 65% of `MRP` and `P RATE` 78%; is that the agreed brand margin? | Booking, Accounts and the KDPS Owner | Stage 2 costing |
| 4 | Who owns each personal tab (`OWNER`, `DEBANJAN`, `MAHENDRA`, `Office`, `PRAVIN JI`, `NARESH`, `ANKIT`, `SANTOSH`, `GULSHAN`): a Store, a brand or a role? | KDPS Owner | Role and workbench design |
| 5 | Who fills the vendor PT file, the vendor or KDPS, and must it equal the invoice exactly (whole-rupee `BASIC` against paise, `Motiya`, `Bus Fare`, round-off)? | Booking and Accounts | Stage 2 reconciliation tolerance |
| 6 | For files without a usable barcode (`AS INNERWEAR.csv`, `XERICS`, `BANJARAN`, `ZILU`, `HYPHEN`, `SUVIDHI`) or with internal codes: does KDPS print its own barcode, and what does the earlier POS use? | Booking and Operations | Stage 2 labels |
| 7 | Does a quantity N on a row mean N tags to print, and may the importer split it into N piece rows? | Product owner | Stage 2 labels |
| 8 | Which GST rate applies when a file has none, and what are `MUFTI.xlsx` columns AA and AB and `ZILU BOTTOMS.xlsx` columns S and U? `MUFTI.xlsx` shows 12% on an invoice dated 22 Aug 2025 next to the later 5 and 18. | CA | Stage 2 tax |
| 9 | Is `ARVIND ALL BRAND & SPYKAR_PT.xlsx` (named for all Arvind brands, only `FM` rows, narration `EXTRA STOCK CORRECTION`) real goods-in or a correction document? | KDPS Owner and Booking | Stage 2 import design |
| 10 | `DEAL SS26 2970.xlsx` and `ambreli 1855.xls` name `Jainsons Lifestyle`: which Site or Store is that? Why is `JOCKEY.xlsx` addressed to `D D DEVELOPERS`, and why is the `DEAL` voucher made out to `OM GANPATI ENTERPRISES`? | KDPS Owner and Accounts | Party and Site masters |
| 11 | Do the `ambreli` invoice (16 lines, 76 pieces) and its hidden packing list (72 lines, 275 pieces; one EAN in common) belong to one shipment? | Booking | Stage 2 import design |
| 12 | Are `D Apparel` and `D D APPARELS` one business? Are `ADITYA BIRLA LIFESTYLE BRANDS LIMITED` and `MADURA PVT LTD` one supplier for Peter England (see the vocabulary note)? | Accounts | Party master |
| 13 | Will vendors keep their layouts, and may KDPS ask the largest (Madura, Jockey) for a fixed export? | Booking | Stage 2 adapter plan |
| 14 | What do `ZREU` (445 KDPS rows, positive quantities, `MSG2` references) and `ZPOR` (39 rows, bags, size 0) bill types mean in the Madura file? | Booking, from Madura | Stage 2 import design |

Related open items elsewhere: each brand's cost formula (question 6 of [questions-for-kdps.md](../questions-for-kdps.md)) and value slabs (question 22 there; `GC7-2` in [shared-calculations.md](../design/calculations/shared-calculations.md)).
