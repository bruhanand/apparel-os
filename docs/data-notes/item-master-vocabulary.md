# Item master vocabulary

> **Not ranked.** These notes describe the data KDPS sent. They decide nothing. A PRD or policy change they lead to needs an entry in [decisions.md](../decisions.md) first. See [README.md](README.md).

Every value list KDPS uses for items, taken from the `Master Sheet` of the PT template and from the data KDPS sent: the supplier and brand list, the point-of-sale (POS) stock and sales exports, the vendor PT files and the Madura billing extract. It feeds the vocabulary and mapping design (`PRD-MER-004`, `PRD-MER-013`, `PRD-IMP-003`, `PRD-IMP-008`, `PRD-PTW-003`) and the masters design ([structure-and-masters.md](../design/masters/structure-and-masters.md) sections 4.1 to 4.3 and 5.1).

- Counts for the POS side come from `SOH REPORT FORMAT.xlsx` (22,387 stock rows, one row per barcode) unless another file is named. Where a spelling list is pooled across files, only the spellings are given, never counts, because the same stock appears in several exports.
- Pooled POS sources: `SOH REPORT FORMAT.xlsx`, `SALE REPORT FORMAT.xlsx`, `store-analysis/hazaribagh` (`SOH_Hazaribagh.xlsx`, `Sales_Hazaribagh.xlsx`), `store-analysis/jsl` (the four `.xlsx` files), `store-analysis/VAISHNAVI` (three files) and, for brands, the April and May 2026 monthly report workbooks. See [pos-exports.md](pos-exports.md).
- Readings of what a code means are marked **(inferred)** or **(guess)**. None is a KDPS decision. Values that earlier analysts used in the `store-analysis` reports are analyst assumptions, not KDPS decisions.
- The word list is not a requirement. Which values are approved is for KDPS to confirm through the proposal and confirmation rule (`PRD-MER-013`, `PRD-IMP-008`).
- Cost, margin and customer data are not listed.

## 1. The lists and where they live

`Master Sheet` (in `KDPS PT FILE SHEET.xlsx`, `pt-master-sheet.xlsx` and `pt-file-format.xlsx`) is one sheet of independent columns, not one table. Columns K and L give each `ITEM` on the same row its sub category and type.

| Col | Header | Values | Notes |
| --- | --- | --- | --- |
| A | `SEASON` | 22 | `SPRING SUMMER(Jan-25)` to `AUTUMN WINTER(Oct-26)` |
| B | `BRAND` | 592 | The last 7 are appended out of order (`ADITYA`, `ALFALITE`, `CARLTON`, `MONTE CARLO`, `TOM BOY`, `NOSTRUM`, `TOMBOY`). A defined name `BRAND` covers B1:B999 |
| C | `COLOR` | 23 | Holds 20 colours and the 3 price tiers `ECONOMY`, `MEDIUM`, `PREMIUM` |
| D | `GENDER` | 5 | |
| E | `SUB CATEGORY` | 9 | |
| F | `TYPE` | 7 | |
| G | `ITEM` | 98 | Alphabetical, then `BOTTLE`, `BUNDY`, `CARDIGAN` appended |
| H | `FIT` | 75 | |
| I | `SIZE` | 135 | Numbers, letters, bra sizes, kids ages, months, ml, cm and dimensions mixed |
| J | `GST %` | 4 | `5`, `12`, `18`, `TAX FREE` |
| K | `SUB CATEGORY` (item map) | 98 | One entry per `ITEM`; 4 entries are combinations that are not in column E |
| L | `TYPE` (item map) | 98 | One entry per `ITEM`; 1 value (`LUGGAGE/ACCESSORIES`) is not in column F |

- `pt-master-sheet.xlsx` (made on the ERP side, 1 Oct 2026) is the same lists as `KDPS PT FILE SHEET.xlsx` cell for cell (593 rows; only whole numbers are stored as integers in one and floats in the other).
- `pt-file-format.xlsx` holds an older version: 590 brands (no `NOSTRUM`, `TOMBOY`), 95 items (no `BOTTLE`, `BUNDY`, `CARDIGAN`), 134 sizes (no `6XL`). The other lists are the same.
- No list has a duplicate, a padded value or a case-only variant inside itself.
- The PT template's drop-downs read these lists (`PRD-PTW-003`). `SUGGESTED SUB CATEGORY` and `SUGGESTED TYPE` read the item map (`PRD-PTW-012`).
- How much of the POS data the master covers (rows of `SOH REPORT FORMAT.xlsx` whose value is in the master list after upper-casing, of 22,387 rows): brand 17,661, colour 11,882, gender 18,943, item 18,832, fit 9,420, size 18,807.

## 2. Seasons

**The 22 master labels** (`SEASON`):

| Half-year | Labels |
| --- | --- |
| Jan to Jun 2025, `SPRING SUMMER` | `SPRING SUMMER(Jan-25)`, `SPRING SUMMER(Feb-25)`, `SPRING SUMMER(Mar-25)`, `SPRING SUMMER(Apr-25)`, `SPRING SUMMER(May-25)`, `SPRING SUMMER(Jun-25)` |
| Jul to Dec 2025, `AUTUMN WINTER` | `AUTUMN WINTER(Jul-25)`, `AUTUMN WINTER(Aug-25)`, `AUTUMN WINTER(Sep-25)`, `AUTUMN WINTER(Oct-25)`, `AUTUMN WINTER(Nov-25)`, `AUTUMN WINTER(Dec-25)` |
| Jan to Jun 2026, `SPRING SUMMER` | `SPRING SUMMER(Jan-26)`, `SPRING SUMMER(Feb-26)`, `SPRING SUMMER(Mar-26)`, `SPRING SUMMER(Apr-26)`, `SPRING SUMMER(May-26)`, `SPRING SUMMER(Jun-26)` |
| Jul to Oct 2026, `AUTUMN WINTER` | `AUTUMN WINTER(Jul-26)`, `AUTUMN WINTER(Aug-26)`, `AUTUMN WINTER(Sep-26)`, `AUTUMN WINTER(Oct-26)` |

**The month rule as the sheet writes it.** The sheet has no separate rule text (checked: no cell outside A to L, no comment). The rule is carried by the labels themselves: `SPRING SUMMER` for January to June and `AUTUMN WINTER` for July to December, then the month in three letters and the year in two digits in brackets: `SPRING SUMMER(Jun-26)`. The list stops at `Oct-26`.

**What the POS data holds** (`SOH REPORT FORMAT.xlsx`, `Season` column, 22,387 rows, 147 distinct values):

| Kind | Rows | Share | Examples |
| --- | --- | --- | --- |
| Master label (month and year in brackets) | 8,813 | 39.4% | `SPRING SUMMER(Feb-26)` 1,759, `SPRING SUMMER(Mar-26)` 1,409, `AUTUMN WINTER(Oct-25)` 1,245, `AUTUMN WINTER(Aug-25)` 1,072 |
| Same label form, month not in the master | 481 | 2.1% | `AUTUMN WINTER(Sep-24)` 228, `SPRING SUMMER(Jul-25)` 108, `AUTUMN WINTER(Jan-26)` 64, `AUTUMN WINTER(Aug-24)` 54 |
| Label with a year only | 50 | 0.2% | `SPRING SUMMER(2022)` 35, `AUTUMN WINTER(2023)` 9, `AUTUMN WINTER(2021)` 4, `SPRING SUMMER(2023)` 2 |
| Short code (`SSyy`, `SS-yy`, `AWyy`, `AW-yy`, `FSyy`, `ASyy`, `NEOyy`) | 3,652 | 16.3% | `AW-24` 1,653, `SS25` 552, `AW24` 523, `SS-25` 434 |
| Text date `dd-mm-yyyy` | 132 | 0.6% | `28-04-2025` 38, `20-06-2025` 15, `29-05-2025` 15, `25-06-2025` 14 |
| Date value (Excel turned a label into a date) | 7,135 | 31.9% | `<date:2026-09-24>` 1,263, `<date:2026-10-24>` 1,014, `<date:2026-02-25>` 657, `<date:2026-11-24>` 635 |
| Blank | 2,073 | 9.3% | `<blank>` 2,073 |
| Other words | 51 | 0.2% | `N/A` 25, `CORE FASHION` 8, `AllSeason` 6, `ALL SEASON` 5 |

- **Labels that break the January-to-June rule.** `SPRING SUMMER(Jul-25)` (108 rows), `AUTUMN WINTER(Jan-26)` (64), `AUTUMN WINTER(Mar-26)` (4) and `AUTUMN WINTER(May-26)` (1) are all in the sample. The month in the brackets is therefore not always on the side of the year the half-season name implies; whether it is the lot or receipt month, the launch month or something else is OPEN.
- **Labels in the data but not in the master.** Month labels for 2023 and 2024 (`AUTUMN WINTER(Sep-24)`, `AUTUMN WINTER(Aug-24)`, `AUTUMN WINTER(Sep-23)`, `AUTUMN WINTER(Nov-24)`) and one with the month in capitals (`SPRING SUMMER(APR-26)`, 3 rows). The master starts at `Jan-25`.
- **Master labels with no row in this sample:** `SPRING SUMMER(Jan-25)`, `SPRING SUMMER(Feb-25)`, `SPRING SUMMER(Mar-25)`, `SPRING SUMMER(Apr-25)`, `SPRING SUMMER(May-25)`, `AUTUMN WINTER(Jul-26)`, `AUTUMN WINTER(Aug-26)`, `AUTUMN WINTER(Sep-26)`, `AUTUMN WINTER(Oct-26)`.
- **Year-only labels:** `SPRING SUMMER(2022)`, `AUTUMN WINTER(2023)`, `AUTUMN WINTER(2021)` and `SPRING SUMMER(2023)` here; the pooled files hold 11 year-only labels, from 2013 to 2023.
- **Short codes** (3,652 rows): `AW-24` 1,653, `SS25` 552, `AW24` 523, `SS-25` 434, `AW22` 180, `AW23` 89, `SS23` 79, `SS24` 72, `SS-23` 16, `SS18` 11, `SS19` 10, `AW21` 8, `AW-23` 7, `AW20` 6, `NEO24` 3, `AS22` 3, `FS21` 2, `SS29` 1, `SS28` 1, `FS22` 1, `AW18` 1. Across all pooled files codes also include implausible years (`SS28`, `SS29`, `SS31`, `AW13`, `AW-26` to `AW-70`); those look like misread dates.
- **Other words:** `N/A` 25, `CORE FASHION` 8, `AllSeason` 6, `ALL SEASON` 5, `SBJ` 4, `4` 1, `R21` 1, `ALL SEASION` 1. Pooled files add `ALL SEASION`, `EOSS`, `CORE`, `UNIFORM`, `GVIP`, `KDPS`, `VAISHNAVI`, `ACCE`, `VD23`, and numbers (`1` to `6`, `241`, `243`, `251`).
- **Date-corrupted values.** 7,135 rows (31.9%) hold a date where a label should be. Of them 6,774 are dated 2026 with a day of the month between 21 and 29, mostly 23 to 25 (for example 24 Sep 2026, 1,263 rows; 24 Oct 2026, 1,014 rows). That is the pattern of a month-and-year text such as `Sep-24` read as a day and month (inferred): the day number is the year and the month is the lot month. The earlier analysts reached the same reading in the `store-analysis` notes (an analyst reading, not a KDPS decision).
- **Vendor PT files use short codes too:** `SS26` (`peppermint`, `DEAL`, `BK ENTERPRISES`, `BLACKBERRY`, `KILLER JUNIOR`), `S26` (`SWEET DREAMS`), `AW24` and `SS25` (`ARVIND`), `AW25` (`BLACKBERRY`), `CORE` (`KILLER JUNIOR`). The KDPS label form is not used by any vendor.
- The opening rules treat an unknown historical season as a value of its own that matches no season-specific offer (`PRD-LIF-006`, `PRD-LIF-007`, `PRD-ACP-014`). The blank and unreadable values above are what that rule has to carry at import.

<details><summary>All 147 season values in the sample, with rows</summary>

(blank) 2,073, `SPRING SUMMER(Feb-26)` 1,759, `AW-24` 1,653, `SPRING SUMMER(Mar-26)` 1,409, `<date:2026-09-24>` 1,263, `AUTUMN WINTER(Oct-25)` 1,245, `AUTUMN WINTER(Aug-25)` 1,072, `<date:2026-10-24>` 1,014, `AUTUMN WINTER(Sep-25)` 950, `SPRING SUMMER(Apr-26)` 851, `AUTUMN WINTER(Nov-25)` 734, `<date:2026-02-25>` 657, `<date:2026-11-24>` 635, `SS25` 552, `AW24` 523, `SS-25` 434, `<date:2026-12-24>` 421, `SPRING SUMMER(May-26)` 413, `<date:2026-08-24>` 380, `<date:2026-03-25>` 347, `AUTUMN WINTER(Sep-24)` 228, `<date:2026-05-25>` 216, `<date:2026-02-23>` 202, `AW22` 180, `<date:2026-09-23>` 177, `<date:2026-03-23>` 170, `<date:2026-03-24>` 161, `AUTUMN WINTER(Dec-25)` 149, `<date:2026-04-25>` 142, `<date:2026-01-25>` 138, `<date:2026-01-23>` 133, `<date:2025-01-07>` 114, `<date:2026-04-23>` 112, `SPRING SUMMER(Jun-26)` 109, `SPRING SUMMER(Jul-25)` 108, `<date:2026-05-24>` 94, `AW23` 89, `<date:2026-10-23>` 87, `SS23` 79, `<date:2026-04-24>` 77, `SPRING SUMMER(Jan-26)` 76, `<date:2026-02-24>` 74, `SS24` 72, `<date:2026-06-23>` 68, `AUTUMN WINTER(Jan-26)` 64, `AUTUMN WINTER(Aug-24)` 54, `<date:2023-01-06>` 48, `<date:2025-06-19>` 42, `28-04-2025` 38, `<date:2026-12-23>` 38, `SPRING SUMMER(2022)` 35, `<date:2025-09-07>` 34, `<date:2026-05-23>` 33, `AUTUMN WINTER(Jul-25)` 33, `<date:2026-08-23>` 32, `<date:2025-08-07>` 31, `<date:2026-07-25>` 29, `<date:2022-01-04>` 25, `N/A` 25, `<date:2026-11-23>` 23, `<date:2025-01-03>` 21, `<date:2026-11-22>` 19, `<date:2024-01-09>` 18, `<date:2026-01-24>` 17, `AUTUMN WINTER(Sep-23)` 16, `SS-23` 16, `20-06-2025` 15, `29-05-2025` 15, `25-06-2025` 14, `SPRING SUMMER(Jun-25)` 13, `SS18` 11, `<date:2025-01-05>` 10, `<date:2025-05-07>` 10, `SS19` 10, `AUTUMN WINTER(2023)` 9, `AW21` 8, `CORE FASHION` 8, `30-06-2025` 7, `AW-23` 7, `<date:2022-01-09>` 6, `AW20` 6, `AllSeason` 6, `29-04-2025` 5, `<date:2026-06-24>` 5, `ALL SEASON` 5, `AUTUMN WINTER(2021)` 4, `AUTUMN WINTER(Mar-26)` 4, `SBJ` 4, `17/06/2025` 3, `<date:2026-10-22>` 3, `AS22` 3, `AUTUMN WINTER(Nov-24)` 3, `NEO24` 3, `SPRING SUMMER(APR-26)` 3, `20-05-2025` 2, `FS21` 2, `SPRING SUMMER(2023)` 2, `19-04-2025` 1, `28-02-2033` 1, `29-01-2028` 1, `29-01-2032` 1, `29-01-2033` 1, `29-02-2028` 1, `29-03-2033` 1, `29-04-2033` 1, `29-05-2033` 1, `29-07-2033` 1, `29-08-2029` 1, `29-08-2032` 1, `29-08-2033` 1, `29-08-2034` 1, `29-09-2029` 1, `29-09-2031` 1, `29-09-2032` 1, `29-09-2033` 1, `29-09-2034` 1, `29-10-2029` 1, `29-10-2031` 1, `29-10-2032` 1, `29-10-2033` 1, `29-10-2034` 1, `29-11-2029` 1, `29-11-2031` 1, `29-11-2032` 1, `29-11-2033` 1, `29-11-2034` 1, `29-12-2029` 1, `29-12-2031` 1, `29-12-2032` 1, `30-04-2025` 1, `4` 1, `<date:2025-06-10>` 1, `<date:2025-07-07>` 1, `<date:2026-07-23>` 1, `<date:2026-07-24>` 1, `<date:2026-10-21>` 1, `<date:2026-10-26>` 1, `<date:2026-10-27>` 1, `<date:2026-10-28>` 1, `<date:2026-10-29>` 1, `ALL SEASION` 1, `AUTUMN WINTER(May-26)` 1, `AW18` 1, `FS22` 1, `R21` 1, `SS28` 1, `SS29` 1

</details>


## 3. Brands

### 3.1 Counts

| Source | Spellings | Notes |
| --- | --- | --- |
| `Master Sheet` `BRAND` | 592 | No case or spacing duplicates except `TOM BOY` / `TOMBOY` and `S F` / `SF` |
| `SUPPLIER BRAND DETAILS.xlsx` sheet `BRAND` (columns `Brand`, `Supplier`) | 1,163 | Each brand once; 38 have no supplier; 281 distinct suppliers. The file has about 151,000 rows of blank formatting |
| Both lists, same spelling (upper-cased) | 470 | 122 master brands are not in the supplier list; 693 supplier-list brands are not in the master |
| `SOH REPORT FORMAT.xlsx` `Brand` | 778 | 17,661 of 22,387 rows are in the master list; the other 4,726 rows use 426 spellings the master lacks |
| Pooled POS exports (11 files) | 983 | 539 of them not in the master |
| April and May 2026 monthly reports | 637 | Includes junk values in the brand field: `125`, `XXX`, `XYZBR`, `W2365`, `P2989`, `AS303`, `MR125`, `544 DP22`, `KDPS`, `VAISHNAVI` |

Brand is not a party: brands and suppliers are kept apart (`PRD-MER-001`; structure-and-masters 5.1). A brand's name is a label that can change and earlier names are aliases (structure-and-masters 2.1).

### 3.2 Spellings that differ only by spacing, punctuation or case

44 groups across the four brand sources. In each group the spellings are the same brand name written differently (inferred from the text; the supplier column shows where the two spellings go to different suppliers). Source letters: M = master, S = supplier list, P = POS exports, T = monthly reports.

<details><summary>All groups</summary>

| Spellings (sources) | Supplier in the supplier list |
| --- | --- |
| `A JAYTEX` (PS), `AJAYTEX` (PST) | VARIETY TEXTILE |
| `BLACK BERRY` (PST), `BLACKBERRY` (PST) | MOHAN CLOTHING COMPANY |
| `BODY CARE` (PS), `BODYCARE` (PS) | MANOJ ENTERPRISES |
| `F W` (T), `FW` (MPST) | SSS |
| `GOT IT` (S), `GOTIT` (PS) | RISHAV AGENCY |
| `HI CHOICE` (MPST), `HI-CHOICE` (PS) | VARIETY TEXTILE |
| `JAI BHARAT` (PS), `JAIBHARAT` (PST) | VARIETY TEXTILE |
| `JULAHAA- TANA BANA` (S), `JULAHAA-TANA BANA` (S) | SANSKAR RETAIL |
| `K C OSWAL` (PST), `KC OSWAL` (T) | VARIETY TEXTILE |
| `K T` (S), `KT` (PST) | KISHORI TRADELINK; P M SONS |
| `LA KRISHNA` (PS), `LA-KRISHNA` (MPS) | P M SONS; PLAZER FABRICS |
| `LAXMI HARI` (M), `LAXMIHARI` (PST) | VARIETY TEXTILE |
| `LAXMI NX` (MPST), `LAXMINX` (S) | none; SARAOGI SUPER SALES |
| `LIFE STYLE` (MPS), `LIFESTYLE` (PST) | M R & COMPANY; VARIETY TEXTILE |
| `M A` (S), `MA` (S) | none |
| `MAD BOYS` (MPS), `MADBOYS` (PST) | SHREE EMPORIUM |
| `MAXQ S` (PST), `MAXQ'S` (M) | SAI ENTERPRISE |
| `NEEL MADH` (MPS), `NEELMADH` (S) | VARIETY TEXTILE |
| `OUT LOOK` (MPS), `OUTLOOK` (S) | VARIETY TEXTILE |
| `P KIDS` (MPST), `PKIDS` (PST) | SHREE EMPORIUM; SSS |
| `P M` (ST), `PM` (S) | P M SONS |
| `POOJA DESI` (M), `POOJA DESI.` (PST) | SSS |
| `RISHI TEX` (M), `RISHI TEX.` (PST) | SSS |
| `R MUSKAN` (S), `R.MUSKAN` (S) | P M SONS |
| `RUDHAVA HR` (S), `RUDHAVAHR` (PS) | VARIETY TEXTILE |
| `RUDHAVS HR` (PS), `RUDHAVSHR` (MPST) | VARIETY TEXTILE |
| `S C` (PS), `SC` (S) | none; SARTHAK CREATION |
| `S F` (MPST), `SF` (MS) | none; SHAKTI FASHION |
| `S NAWAZ` (ST), `S.NAWAZ` (S) | P M SONS; SSS |
| `SPYKAR UNDER JEANS` (PS), `SPYKAR UNDERJEANS` (MPS) | VISHAL MARKETING |
| `S S RAM` (PS), `S SRAM` (T) | SRI SAI RAM DUPATTA |
| `TALIB CRE` (PS), `TALIB CRE.` (PS) | VARIETY TEXTILE |
| `TINY TREE` (MPST), `TINYTREE` (PS) | P M SONS |
| `TOM BOY` (MS), `TOMBOY` (M) | NATIONAL TRADING |
| `U S POLO` (PST), `U. S. POLO` (MPS), `US POLO` (PST) | OM GANPATI (DMK); VISHAL MARKETING |
| `U. S. POLO INNERWEAR` (MPST), `U. S. Polo Innerwear` (T), `US POLO INNERWEAR` (PS) | ANAND FABRICS; OM GANPATI (DMK) |
| `U. S. POLO KIDS` (MPST), `USPOLO KIDS` (P) | VISHAL MARKETING |
| `V D` (ST), `VD` (PST) | MADURA PVT LTD; P M SONS |
| `V KILLER` (MPT), `VKILLER` (P) | not listed |
| `V LEVIS` (MPT), `VLEVIS` (PT) | not listed |
| `V SUR SHYAM` (PT), `V SURSHYAM` (P) | not listed |
| `WEGA BOYS` (T), `WEGABOYS` (MPST) | M.B. ENTERPRISES |
| `WILD CRAFT` (T), `WILDCRAFT` (MPS) | D D SALES CO |
| `W O E` (PS), `WOE` (MPST) | SSS |

</details>

In the supplier list 30 groups have 2 or 3 spellings of one name; in 11 of them the spellings go to different suppliers (for example `KT` and `K T`, `LIFESTYLE` and `LIFE STYLE`, `VD` and `V D`, `US POLO INNERWEAR` and `U. S. POLO INNERWEAR`).

### 3.3 Brand codes and family spellings

Madura-group brands appear as short codes. The codes below are the ones seen next to the full name; their meaning is not stated anywhere in the data (**guess**: sub-brands or lines of the group). Sources: M, S, P, T as above; D = the `Dv` column of the Madura billing extract (`Madura Fashion Brand AS - VH - LP.xlsb`); E = the `Brand` column of `Peter England.CSV`.

| Family | Spellings (sources) and the supplier in the supplier list |
| --- | --- |
| Louis Philippe | `LOUIS PHILIPPE` (MSPT, ADITYA BIRLA LIFESTYLE BRANDS LIMITED); `LP` (SPTD, MADURA PVT LTD); `LY` (SPTD, MADURA PVT LTD); `LR` (SPTD, MADURA PVT LTD); `LA` (SPTD, MADURA PVT LTD); `LX` (SPD, MADURA PVT LTD) |
| Van Heusen | `VAN HEUSEN` (MSPT, MADURA PVT LTD); `VAN HEUSEN WOMENS` (MSPT, ADITYA BIRLA LIFESTYLE BRANDS LIMITED); `VH` (SPTD, MADURA PVT LTD); `VS` (SPTD, MADURA PVT LTD); `VD` (SPTD, MADURA PVT LTD); `VF` (SPTD, MADURA PVT LTD); `VX` (SPTD, MADURA PVT LTD); `VW` (SPTD, MADURA PVT LTD); `VH INNERWEAR` (SPT, C2D VENTURES LLP); `V VAN HEUSEN` (P); `VAN` (T) |
| Allen Solly | `ALLEN SOLLY` (MSPT, ADITYA BIRLA LIFESTYLE BRANDS LIMITED); `ALLEN SOLLY JUNIOR` (MSPT, ADITYA BIRLA LIFESTYLE BRANDS LIMITED); `ALLEN SOLLY WOMENS` (MSPT, ADITYA BIRLA LIFESTYLE BRANDS LIMITED); `AS` (SPTD, MADURA PVT LTD); `AK` (SPD, MADURA PVT LTD); `AH` (SPD, MADURA PVT LTD); `AT` (SPTD, MADURA PVT LTD); `AL` (SPTD, MADURA PVT LTD) |
| Peter England | `PETER ENGLAND` (MSPT, MADURA PVT LTD); `PX` (SP, MADURA PVT LTD); `PT` (SP, SANSKAR RETAIL); `N` (SDE, MADURA PVT LTD); `RE` (DE); `PJ` (DE) |
| US Polo | `U. S. POLO` (MSP, VISHAL MARKETING); `U. S. POLO KIDS` (MSPT, VISHAL MARKETING); `U. S. POLO INNERWEAR` (MSPT, ANAND FABRICS); `US POLO` (SPT, OM GANPATI (DMK)); `U S POLO` (SPT, OM GANPATI (DMK)); `USPOLO KIDS` (P); `US POLO INNERWEAR` (SP, OM GANPATI (DMK)); `USPA` (SPT, VISHAL MARKETING); `USPA KIDS` (SPT, VISHAL MARKETING); `USPA INNERWEAR` (P); `V U. S. POLO` (MP); `V U. S. POLO KIDS` (MPT); `V USPA KIDS` (PT) |
| Raymond | `RAYMOND` (S, AAYUSHMAN AGENCIES); `RAYMOND HERITAGE` (S, AAYUSHMAN AGENCIES); `RAYMOND LIMITED` (S, AAYUSHMAN AGENCIES) |
| Blackberrys | `BLACKBERRYS` (MSPT, MOHAN CLOTHING COMPANY); `BLACKBERRY` (SPT, MOHAN CLOTHING COMPANY); `BLACK BERRY` (SPT, MOHAN CLOTHING COMPANY) |
| Flying Machine | `FLYING MACHINE` (MSPT, VISHAL MARKETING); `FM` (SPT, VISHAL MARKETING); `V FLYING MACHINE` (MPT); `V FM` (P) |
| Status Quo | `STATUS QUO` (MSPT, D APPAREL); `STATUS QOU` (SP, D APPAREL); `V STATUS QUO` (MPT); `V SQ` (PT) |
| Spykar | `SPYKAR` (MSPT, VISHAL MARKETING); `V SPYKAR` (MPT); `V SPY` (P); `SPY` (SPT, VISHAL MARKETING); `SPYKAR UNDERJEANS` (MSP, VISHAL MARKETING); `SPYKAR UNDER JEANS` (SP, VISHAL MARKETING) |
| Killer | `KILLER` (MSPT, D D SALES CO); `KILLER JUNIOR` (MS, D D SALES CO); `JUNIOR KILLER` (S, D D SALES CO); `V KILLER` (MPT); `VKILLER` (P); `FS-KILLER` (M) |
| Mufti | `MUFTI` (MSPT, SHRING APPARELS); `V MUFTI` (MP); `FS-MUFTI` (M) |
| Levis | `LEVIS` (MSPT, JAIN ADISHWAR HOSIERY WORKS); `DLEVIS` (MSPT, JAIN ADHISWER); `V LEVIS` (MPT); `VLEVIS` (PT) |
| Linen Club | `LINEN CLUB` (MSPT, B.K ENTERPRISES); `V LINEN CLUB` (MT) |
| Arrow | `ARROW` (MSPT, VISHAL MARKETING); `V ARROW` (MPT) |
| Sweet Dreams | `SWEET DREAMS` (MSPT, DD APPAREL); `SWEET DREAM` (SPT, DD APPAREL) |
| Xerics | `XERICS` (ST, SNEHA ENTERPRISES); `XERIC` (MSPT, SNEHA ENTERPRISES) |
| Tomboy | `TOM BOY` (MS, NATIONAL TRADING); `TOMBOY` (M) |
| Go Colors | `GOCOLORS` (MSP, EMPORIO SIDDHARTH SALES PRIVATE); `GO COLORS` (-) |

Reading the table:

- **Louis Philippe, Van Heusen, Allen Solly and Peter England** are each one brand name plus several 2-letter codes. The master has only the long names (`LOUIS PHILIPPE`, `VAN HEUSEN`, `VAN HEUSEN WOMENS`, `ALLEN SOLLY`, `ALLEN SOLLY JUNIOR`, `ALLEN SOLLY WOMENS`, `PETER ENGLAND`); the codes are POS and supplier-list spellings. In the supplier list the long names of Louis Philippe, Allen Solly and `VAN HEUSEN WOMENS` go to `ADITYA BIRLA LIFESTYLE BRANDS LIMITED` and the codes go to `MADURA PVT LTD` (`PETER ENGLAND` and `VAN HEUSEN` too).
- The Louis Philippe offer email lists the sub-brands LP, LY, LA, LX and LR; the Van Heusen emails name VS, VD, VX, VF and VW (see [offers-and-brand-reports.md](offers-and-brand-reports.md)).
- `PT` is in the POS data next to `PX`, but the supplier list sends `PT` to `SANSKAR RETAIL` and `PX` to `MADURA PVT LTD`: which brand `PT` is, is OPEN.
- The Madura codes in `Dv` of the KDPS rows are `AS`, `AK`, `AL`, `AH`, `AT`, `VH`, `VW`, `VS`, `VD`, `VX`, `VF`, `LP`, `LR`, `LY` (14); across the whole file there are also `LA`, `LX`, `N`, `RE`, `AY`, `PJ`. `Peter England.CSV` uses `PJ`, `N`, `RE`.
- **US Polo** has eight to thirteen spellings. The master has `U. S. POLO`, `U. S. POLO KIDS`, `U. S. POLO INNERWEAR`, `V U. S. POLO` and `V U. S. POLO KIDS`.
- **Raymond** appears only in the supplier list (`RAYMOND`, `RAYMOND HERITAGE`, `RAYMOND LIMITED`, all to `AAYUSHMAN AGENCIES`); the master and the POS exports have no Raymond brand.
- **Blackberrys** has three spellings in the supplier list and the POS data (`BLACKBERRYS`, `BLACKBERRY`, `BLACK BERRY`, all to `MOHAN CLOTHING COMPANY`); the master has `BLACKBERRYS`. The vendor PT file says `Blackberrys`.
- **PT file spellings that differ from the master:** `GO COLORS` (master `GOCOLORS`), `JUNIOR KILLER` (master `KILLER JUNIOR`), `ANOKKHI` (not in the master), `FM` (master `FLYING MACHINE`), `Blackberrys` (case).

### 3.4 Prefix patterns

- **`V ` prefix.** 12 master brands, 18 supplier-list brands and 32 POS spellings begin `V ` (for example `V ARROW`, `V D CR`, `V FLYING MACHINE`, `V JACK&JONES`, `V KILLER`, `V LEVIS`). Several are a second spelling of a brand that also exists without the prefix (`V ARROW` / `ARROW`, `V KILLER` / `KILLER`, `V LEVIS` / `LEVIS`). What the V stands for is not stated (guess: a variant or a store-family code). OPEN.
- **`FS` prefix.** The master has `FS`, `FS-FORT COLLINS`, `FS-HYPHEN`, `FS-KILLER`, `FS-MUFTI`, `FS-SNITCH` and `FASHION STUDIO`. `FS` is also a season code (`FS21`, `FS22`) in the data. Meaning not stated (guess: a Fashion Studio store or counter). OPEN.

### 3.5 The 592 master brands

<details><summary>Full list, in the sheet's order</summary>

`24 STREET`, `7 STITCH`, `90 ML`, `A`, `A CUBE`, `A FLESH`, `A.M EXCLUSIVE`, `AADYA`, `AALEKH`, `AANCHAL`, `AARAV`, `AARI`, `AAROHI`, `AAVKAR`, `ABHIVADAN`, `ACTIVE BOY`, `AENY`, `A-FIRST`, `AGAM`, `AGARWAL`, `AJJAWAM`, `AKSHITA`, `ALLEN SOLLY`, `ALLEN SOLLY JUNIOR`, `ALLEN SOLLY WOMENS`, `ALLIANCE`, `ALVARO`, `AMBIKA`, `AMBRELI`, `AMIDHARA`, `AMNESIA`, `ANAYA`, `ANJANA`, `ANJU FAB`, `ANJU FEB`, `ANNARA`, `ANOKKHI`, `ANORA`, `ANULA SAR`, `APNI`, `ARISTOCRAT`, `ARRAY`, `ARROW`, `ARTI`, `ARUNA`, `ARVIND`, `ASHMI CREATION`, `ASHMI SIGNATURE`, `ASHMITA`, `ASHMITA BQ`, `AURA`, `AURELIA`, `B K SILK`, `B2 JEANS`, `BABES N DOLLS`, `BABLA`, `BABY BABY`, `BAD BOYS`, `BAHUBALI`, `BALAJI`, `BALAK`, `BANJARAN`, `BANSAL`, `BE LIKE U`, `BE POSITIVE`, `BEANIE`, `BEEKAY`, `BEETLE`, `BEEVEE`, `BEGANIS`, `BEING HUMAN`, `BELIEVE IN`, `BELLA MOUNT`, `BENGAL MUS`, `BIBA`, `BILIPATRA`, `BILLFOLD`, `BINANI`, `BLACK HARRY`, `BLACK JACK`, `BLACKBERRYS`, `BLAZER.COM`, `BLAZO`, `BONJOUR`, `BONNY`, `BONO`, `BOYS FUN`, `BRITISH ZONE`, `BUBBLE`, `CAAFECHINO`, `CAILIN`, `CAMPUS`, `CAPAL`, `CAVIO`, `CELIO`, `CELSIUS`, `CHANCELLOR`, `CHANDA`, `CHARCHIT`, `CHARKHA`, `CHHAPAAYI`, `CHOCO MOCO`, `CHOCOLATE BABY`, `CHOKRI`, `CHOTU MOTU`, `CIAOSIS`, `CITRUS`, `CITY MAGIC N`, `CLIMATE`, `CLUB WEAR`, `COCO BOY`, `COLORPLUS`, `COMFORT LADY`, `COOL MIND`, `COT STYLE`, `CROSS COLOR`, `CUCUMBER`, `D F`, `D M`, `DANABOI`, `DAVNO`, `DEAL`, `DEEWANEE`, `DESHNA`, `DESI BELLE`, `DESIMAL`, `DEVTA`, `DHRUV`, `DHURANDHAR`, `DIKSHA DRESS`, `DIL SE`, `DIPESH`, `DIPU`, `DIYA`, `DLEVIS`, `DLP`, `DOLLCY`, `DOLPHIN`, `DSY`, `EAGLE`, `EK OMKAR`, `ELITE`, `EMPIRE`, `EURO KIDS`, `EYE LIKE`, `FAHRENHEIT`, `FASHION STUDIO`, `FASHION WORLD`, `FETE`, `FIRE FOX`, `FIRST DAY`, `FIRST FUN`, `FIRST GIRL`, `FIRST LOVE`, `FLO WING`, `FLYING MACHINE`, `FOCUS`, `FOCUS JEANS`, `FOGA CLOTHING`, `FORT COLLINS`, `FRIENDS`, `FRIO`, `FS`, `FS-FORT COLLINS`, `FS-HYPHEN`, `FS-KILLER`, `FS-MUFTI`, `FS-SNITCH`, `FUNNY DOLL`, `FW`, `GAJENDRA`, `GANESH`, `GANPATI`, `GARGI NX`, `GAURANGI`, `GAURAV`, `GAYATRI`, `GEAR`, `G-ELEVEN`, `GHASIRAM`, `GIL`, `GIRIRAJ`, `GIRLLY`, `GOCOLORS`, `GOLANI`, `GOLDSTROMS`, `GOMTEE`, `GOOFY`, `GOURI`, `GRAMMER`, `GREEN CHANEL`, `GROWVID`, `GUDDU`, `GURUKUL`, `HARIGANGA`, `HARISH`, `HAVOK`, `HEART & SOUL`, `HENNY`, `HI CHOICE`, `HIMEYA`, `HIRAWAT`, `HTV`, `HYPHEN`, `INDIAN WOM`, `INTEGRITI`, `ISHANA`, `JACK&JONES`, `JANANI`, `JANSONS`, `JANTA`, `JANVI`, `JAY AMBEY`, `JOCKEY`, `JOMAA`, `JULAHAA`, `JUNIPER`, `JUST PINK`, `K.S-TAREEKA`, `K2`, `KAASHVI`, `KAJOL`, `KALAVATI`, `KALEE`, `KALPANA`, `KAMILIANT`, `KARIM`, `KARISHMA`, `KARNI`, `KARNIKA CARE`, `KASHNI`, `KAVERI`, `KAYAAN`, `KETAN`, `KF`, `KHADIM'S`, `KHALSA`, `KHUSHAAL`, `KIAHRA`, `KIDCITY`, `KIDOZ`, `KILLER`, `KILLER JUNIOR`, `KIMORA`, `KINGDOM`, `KISHORE`, `KKASHISH`, `KLJ`, `KM`, `KNIT`, `KODAK`, `KOKO ROSIE`, `KOOKIE`, `KRIPA`, `KRISHNA`, `KRISHNAGANGA`, `KRISHNAM`, `KUNDAN`, `KYRA`, `L T COMBO`, `LADDU PRINTS`, `LADO`, `LA-KRISHNA`, `LAND MARK`, `LAXMI HARI`, `LAXMI NX`, `LAXMIPATI`, `LE MARIE`, `LEE`, `LEVIS`, `LIBAS`, `LIFE STYLE`, `LILY&LALI`, `LINEN CLUB`, `LITTILE GIRL`, `LITTLE BUDDIES`, `LITTLE CHAMPION`, `LITTLE COCO`, `LITTLE DOLLY`, `LITTLE GIRL`, `LITTLE PINK`, `LITTLE PRINCE`, `LITTTLE GENIUS`, `LOGUS`, `LONDON GIRL`, `LOTUS`, `LOUIS PHILIPPE`, `LOVE BIRD`, `LOVELY KIDS`, `LUX`, `M FABRICS`, `MAD BOYS`, `MADAM`, `MADHUDRI`, `MADONA F.S`, `MAHIMA`, `MAHOTSAV`, `MANAS`, `MANASHI`, `MANISH`, `MANISH CREATIONS`, `MANIYAR`, `MANOHAR`, `MANSI`, `MANYAVAR`, `MARVILLOSA`, `MAXQ'S`, `MAYURMILA`, `MC`, `ME & MINE`, `MEDIBOY`, `MEET MILAN`, `MEGHA`, `MEGHDOOT`, `MEGHMALINI`, `MENIKI`, `MILAN`, `MINELLI`, `MINU`, `MISS 17`, `MISS ART`, `MISS CHOOSY`, `MISS INDIA`, `MNG`, `MODMIS`, `MOHINI`, `MOMS PET`, `MONALISHA`, `MOSTYLE`, `MOTI OSWAL`, `MP`, `MUFTI`, `MUKET`, `MUMTAZ`, `MUNKEY`, `MYGLAM`, `N TIQUE`, `NAMO SHREE`, `NAMSHVI`, `NANDINI`, `NARESH`, `NEEL MADH`, `NEELKAMAL`, `NEVER NEUD`, `NEW LOVELY`, `NEXTBIT`, `NIMBOLI`, `NIRZARI`, `NITESH`, `NO MONDAYS`, `OCTAVE`, `OKANE`, `OKKY DOKKY`, `OLLISA`, `OM CREATION`, `OM SANSKRITI`, `OMKAR`, `ORKIDS`, `OSTER`, `OSWAL`, `OTIS`, `OUT LOOK`, `OXEMBERG`, `P KIDS`, `P NOVINO`, `PADMAVATI`, `PAGRIWALA`, `PAMPARA`, `PANTH`, `PARI`, `PARIS`, `PARIS BEAUTY`, `PARK AVENUE`, `PARX`, `PATOLA`, `PATRALEKH`, `PAYAL`, `PEPE JEANS`, `PEPPERMINT`, `PETER ENGLAND`, `PINK MARIE`, `PINKLIFE`, `PLAZER`, `PMS`, `POOJA DESI`, `POONAM`, `PRESENCE`, `PRESIMENT`, `PRETTY GIRL`, `PRINCESS`, `PRIYAM`, `PRM`, `PSYNA`, `PUBJ BOYS`, `PUNEET`, `R CREATION`, `R H PRINT`, `RADHA MADHAV`, `RADHE KRISHNA`, `RAINBOW`, `RAJE`, `RAJSHREE`, `RAMAPATI`, `RAMAYA`, `RAMPA`, `RAMRASIYA`, `RANG RUCHI`, `RANGI SANGI`, `RATAN`, `RATHOD`, `RAVIRAJ`, `RB CARDIGAN`, `RECAP`, `RED RING`, `REX STRAUT`, `RG KANCHUKI`, `RICH BORN`, `RICH DOLL`, `RIDDHIS`, `RIDHI SIDHI`, `RINKA`, `RISHI`, `RISHI TEX`, `RNJ`, `ROCK IT`, `ROOP NIKHAR`, `ROSE CLUB`, `ROSE DIVINE`, `RRF`, `RS COLE`, `RSV`, `RT`, `RUBY`, `RUDHAVSHR`, `RUH`, `RUH NEE`, `RUPA`, `S F`, `S STUDIO`, `S4U`, `SAAGEDO`, `SABHYATA`, `SABHYTA`, `SAESHA`, `SAFARI`, `SAGAR`, `SAGUN`, `SAHELI`, `SAIYAM`, `SAM SACHI`, `SAMARTH`, `SAMBHAV`, `SAMITA`, `SAMP DESI`, `SAMPAT SACHIN`, `SANGINI`, `SANJEEVNI`, `SANSKAR`, `SANSKRITI`, `SARAOGI`, `SAROJ`, `SARTHAK`, `SATGURU`, `SATYAM`, `SATYANAM`, `SEEMAYA`, `SEWBERRY`, `SF`, `SHAGUN`, `SHAHI ACHKAN`, `SHAKTI`, `SHAKUNT`, `SHAMBHA`, `SHAMJI`, `SHANKESHWARA`, `SHARDHA`, `SHILA`, `SHIVALI`, `SHOES`, `SHREE FASHION`, `SHREE JAGADAMBA`, `SHREE RADHA`, `SHREE SHYAM`, `SHRI NITESH`, `SHRITHIK`, `SHRUTI`, `SHUBH BANDHAN`, `SIYA`, `SKG`, `SKYBAG`, `SKYLO`, `SMAG`, `SMBHVSAR`, `SPHERE`, `SPIRIT`, `SPYKAR`, `SPYKAR UNDERJEANS`, `SRUTI`, `ST. VALENTINE`, `STATUS QUO`, `STAYAM`, `STDS`, `STRIDE`, `STRRUCK`, `SUBHASH`, `SUCCESS`, `SUHAGAN`, `SUKANYA`, `SUKHDEV`, `SUNDRI`, `SUPERSHVA`, `SURBHI`, `SURYA ETHNIC`, `SWAYAMVAR`, `SWEET DREAMS`, `TADPOLE`, `TAKA BOYS`, `TALIB`, `TALKEE`, `TANA BANA`, `TANVI`, `TARANG`, `TEACHER`, `TEJOO`, `TINY`, `TINY TOFFY`, `TINY TREE`, `TITLEE`, `TODAYSILK`, `TOP GIRL`, `TRADITION`, `TRENDY`, `TRIDENT`, `TURTLE`, `TWILLS`, `U. S. POLO`, `U. S. POLO INNERWEAR`, `U. S. POLO KIDS`, `UCB`, `UNNATI`, `V ARROW`, `V D CR`, `V FLYING MACHINE`, `V JACK&JONES`, `V KILLER`, `V LEVIS`, `V LINEN CLUB`, `V MUFTI`, `V SPYKAR`, `V STATUS QUO`, `V U. S. POLO`, `V U. S. POLO KIDS`, `VACHI`, `VAISHNAVI`, `VAN HEUSEN`, `VAN HEUSEN WOMENS`, `VANESIS`, `VARDHMAN`, `VEEDAM`, `VEER`, `VIDHI`, `VIMAL`, `VINEET`, `VINSON`, `VIP`, `VIPIN`, `VIRATRA`, `VISHAL`, `W`, `WEGABOYS`, `WELSPUN`, `WERE ON`, `WILDCRAFT`, `WILSON`, `WOE`, `WONDERS`, `WORTH`, `XERIC`, `YES MAM`, `YOU GIRL`, `YOUNG WING`, `ZEEL`, `ZILU BOTTOMS`, `ZOIE`, `ZOLA`, `ADITYA`, `ALFALITE`, `CARLTON`, `MONTE CARLO`, `TOM BOY`, `NOSTRUM`, `TOMBOY`

</details>

- Values that are not brand names: `A`, `90 ML`, `24 STREET`, `7 STITCH` are real labels that look like codes. `FS`, `KF`, `DLP`, `KLJ` are short codes without a long form in the list.

<details><summary>Brand spellings in the POS exports and monthly reports that are not in the master (names only, pooled across files)</summary>

616 spellings: `.`, `125`, `4 U`, `544 DP22`, `<blank>`, `A JAIN`, `A JAYTEX`, `A M EXCLU`, `AARVISHRE`, `AAYUSHI`, `ABCD`, `ADDICTION`, `ADIDAS`, `AH`, `AHM`, `AJAYTEX`, `AJDP`, `AK`, `AL`, `ALL DAY PANTS`, `AMERICAN TOURISTER`, `AMOHA`, `ANAARA`, `ANAMORE`, `ANGORA`, `ANJANA SAREE`, `ANNIE`, `ANTRA`, `ANULA`, `ANUSHREE`, `APPLE MINT DP22`, `ARCTIC FOX`, `ARROW JEANS`, `ARSHIYA`, `ARTH`, `AS`, `AS303`, `ASHOK JAIN`, `ASICS`, `ASM`, `AT`, `ATHARV`, `ATHRAV`, `ATTITUDE`, `B FSHION DP22`, `B LADY`, `BAABLA`, `BABULAL`, `BABYS DAY`, `BARKATI`, `BEETEL`, `BELLA MOUNTE`, `BEN PARKER`, `BERRY`, `BEST LOOK`, `BHAGWATI`, `BHE`, `BHOLE`, `BLACK BERRY`, `BLACKBERRY`, `BLOOM DP22`, `BLPK`, `BLPK 17354`, `BLUE DENIM`, `BMW`, `BODY CARE`, `BODYCARE`, `BONIE`, `BORGO FORD`, `BOSS`, `BOSSBERRY`, `BOUNJOR`, `BOYS GARAGE`, `BOYS TOWN`, `BRIZZLE`, `BSK`, `BUMCHAMS`, `BUTTLER`, `CAPRESE`, `CHANDRAKA`, `CHEERY TREE`, `CHERRY TERRY`, `CHINTAMANI`, `CITY BOY`, `CITY BOY DP22`, `CITY CHIC`, `CITY CLUB`, `CITY MAGIC`, `CLASSIC POLO`, `CLUB VIEW`, `CRAFT`, `CRAZY BOY`, `CRYSTAL`, `D APPAREL`, `D C`, `DAGA`, `DEAR GIRL`, `DHANTAX`, `DIKSHA DRES.`, `DJ BOY DP22`, `DVEEJA`, `E MARC`, `EASIES`, `ELA`, `ELOMELO`, `ENGLISH CHANNEL`, `EUROPE`, `EVER19`, `F TOUCH DP22`, `F W`, `F W DP22`, `FA21`, `FEARTHER TOUCH`, `FLEXY FIT`, `FM`, `FORT COLLIN`, `FRIDAY FUNDAY`, `FUSION & FASHION`, `FWG`, `GADIA PABRICS`, `GEETA SA`, `GIRL CHANNEL`, `GIRLYY`, `GLAM FULL`, `GLAMM`, `GO`, `GOLDEN KEY`, `GOMTEE FS`, `GOMTESH`, `GOMTESHWA`, `GOMTHESWER`, `GOTIT`, `GT`, `GVS`, `H BOY`, `H F`, `H S C`, `HANHUI`, `HARGANGA`, `HELLY DP22`, `HI-CHOICE`, `HIMANEE`, `HONGCHENG`, `HOODIE`, `HUMMEL`, `HWK`, `HYPEN`, `I STYLE`, `IDEA N`, `INAACO`, `IND LADY`, `INDIAN LADY`, `INDIAN TERRAIN`, `INDIAN WO`, `INDIAN WOE`, `J SON`, `J ZEEL`, `J.HAMPSTEAD`, `JA`, `JAI BHARA`, `JAI BHARAT`, `JAI MATA DI`, `JAIBHARAT`, `JAINAM ART`, `JAINSONS`, `JASLEEN`, `JASMIT`, `JAY VARDHAN`, `JEE LINE`, `JIFFY`, `JINAAM`, `JINAM`, `JINDAL`, `JINGLE BELL`, `JIO FASHION`, `JISAAN`, `JMD`, `JMDC`, `JMDF`, `JOHN PLAYER`, `JSS`, `JUST CREATION`, `JUST MUMS`, `K AASTHA`, `K BOYZ`, `K C OSWAL`, `K MARK`, `K-KUSUM`, `K-MOTI OSW`, `KANYADAN`, `KARISH`, `KARNIKA`, `KARNIKA COOL`, `KARNIKA ICE`, `KARNIKA LIFE`, `KATNA`, `KAUSHAL`, `KAUSTUKI`, `KC OSWAL`, `KDPS`, `KETI MINI`, `KEY2`, `KHALSHA`, `KHATUDHISH`, `KHOOBSURAT`, `KI`, `KIAI GIRL`, `KIDIKO NX`, `KIDS KENDY`, `KIDS POWER`, `KIDZO`, `KIKO`, `KINGDOM N`, `KISS MISS`, `KITTY SHAWLS`, `KK`, `KLUB KORNER`, `KNOT`, `KOKO ROISE`, `KOOKA`, `KOOLME N`, `KRISHI`, `KT`, `KVR`, `L STYLE`, `LA`, `LA KRISHA`, `LA KRISHNA`, `LADDU`, `LADY BEAUTY`, `LARA N`, `LAVANYA`, `LAWMAN`, `LAWMAN PG3`, `LAXMI HAR`, `LAXMIHARI`, `LEMAIRE`, `LIFESTYLE`, `LINDSAY`, `LINKWAY DP22`, `LIVEN`, `LOCKET`, `LOLI POLI`, `LOOSE`, `LOUNGE BRA`, `LP`, `LR`, `LSB`, `LT COIMB`, `LUCKY WOM`, `LX`, `LY`, `M S`, `MAAHIMA`, `MAD BOYZ`, `MADBOYS`, `MADE BOYS`, `MAGIC DIS`, `MAHADEV`, `MAHAKALI`, `MAHARAJA SHREE`, `MAHAVIR`, `MALCHAND`, `MAMTA HOME`, `MANASI`, `MARAVILLOSA`, `MASHUP`, `MAXQ S`, `MAXZONE`, `MAYUR`, `MAYURMIL`, `MBS FASHION`, `MEC`, `MEEI`, `MEENA`, `MEENA DP22`, `MEERUT DP22`, `MENIKI DP22`, `METAL`, `MISS 15`, `MISS ART DP22`, `MISS UNI.`, `MKB`, `MM`, `MMS`, `MODA`, `MONALISA`, `MONDAY CLOSED`, `MONTREAL`, `MOODELS`, `MOON H`, `MORVINANDAN`, `MOSKO`, `MOTAP`, `MR ANTRA`, `MR C HARI`, `MR INDER`, `MR JANKI`, `MR K LEELA`, `MR KAYAAN`, `MR MANISH`, `MR MILAN`, `MR NAYRA`, `MR RAMPA`, `MR SATYAM`, `MR SHUBHASH`, `MR SUKNYA`, `MR TAANI`, `MR TANNI`, `MR. RAMAYA`, `MR125`, `MSD`, `MUDRA`, `MUDRA NX`, `MUKUTRAJ`, `MULTI BRAND`, `MURARKA`, `MUSKAN`, `MY MIO`, `MYSHA DP22`, `N G`, `N-OKANE`, `N.N BASAK`, `NAMRATA`, `NANDANI`, `NAUGHTY S`, `NAVDUR`, `NAVYA`, `NAVYAA`, `NAYESHA DP22`, `NEEL MADHAV`, `NEETI CRE`, `NET WORK`, `NEUTRON`, `NEWCASTLE`, `NEXXT G`, `NIMANTARAN`, `NIRZARI DP22`, `NOMBOLI`, `NOMONDAY`, `NON`, `NOORIE`, `NOTTIE PLANET`, `NOVINO`, `NU WAY`, `ONEIX`, `OUTSHINY`, `OXEMBRG`, `P KIDS N`, `P M`, `P.M.SONS`, `P2989`, `PALAV`, `PANKAJ`, `PATRALEKHA`, `PILOT`, `PKIDS`, `PLAIN TAG`, `PMS WIN22`, `PMSR`, `POCO`, `POOJA`, `POOJA DES.`, `POOJA DESI.`, `PORTMOR`, `PRATHAM`, `PRATIK`, `PRINCE`, `PRIYADAMI`, `PRIYADHAMI`, `PRMS`, `PROLINE`, `PROTMOR`, `PT`, `PUMA`, `PUNAM`, `PX`, `RAASHI`, `RAHI`, `RAMSON`, `RATHODE`, `RATNALAKH`, `RAVIKA`, `RAZWADA`, `RAZWADA DP22`, `RC`, `RED & WHITE`, `RED APPLE`, `REEBOK`, `RICHLADY`, `RIDDHI SI`, `RIDI SIDI`, `RISHI TEX.`, `RIVER`, `RM`, `ROHAN`, `ROMSHAY`, `ROOP LAXMI`, `ROOSTER`, `RRJ`, `RS COLLECTION`, `RSSJ`, `RUBIA`, `RUDHAVAHR`, `RUDHAVS HR`, `RUNATA`, `RUPA TORRIDO`, `S C`, `S MOCHAN`, `S N ALAM`, `S NAWAZ`, `S O C`, `S RUDAL DP22`, `S S RAM`, `S SRAM`, `S T`, `S V`, `S.VINAYAK`, `SA MAU`, `SABHV ART`, `SACHDEVA`, `SAFFRON`, `SAHIL`, `SAKINA`, `SALSA`, `SAMBHAVI`, `SAMBHAVS`, `SAMBHV ART`, `SAMI`, `SAMI DP22`, `SAMPAT`, `SANBAR`, `SANDWICH`, `SANMATI`, `SARDA`, `SARVMANGAL`, `SAYONARA`, `SE`, `SELFIE`, `SEWBERY`, `SHAILJA`, `SHAMBV ART`, `SHARDA`, `SHARP K`, `SHI SHANG JING`, `SHILPA`, `SHIVA`, `SHOW KIDS`, `SHOW KIDS DP22`, `SHRADDHA`, `SHREE BALAJEE`, `SHREE KUNJ`, `SHUBH`, `SIDHHIVIN`, `SIFFAR`, `SILVER PALM`, `SIZZLER`, `SKB`, `SKP`, `SKY FAS.`, `SKYBAGS`, `SLEEK GIRL`, `SLIVER PALM`, `SMBHV ART`, `SMIRO`, `SN ALAM DP22`, `SNR PLUS`, `SNS`, `SONA RUPA`, `SONALI`, `SONI`, `SONNET`, `SOUBHAGYA`, `SPACES`, `SPICE JET`, `SPN`, `SPORTS BRA`, `SPRING`, `SPY`, `SPYDER`, `SPYKAR UNDER JEANS`, `SRC`, `SRI KARU`, `SRI MUTHU`, `SRM`, `STAR MARKS`, `STATU QUO`, `STATUS 3`, `STATUS QOU`, `STRIDE JR`, `SUN WAY`, `SUNKEY`, `SUPARSHAV`, `SUPARSHVA`, `SUR SHYAM`, `SURYA`, `SV SAREE`, `SW DD`, `SWAGAT PRINT`, `SWARN`, `SWARNA`, `SWAROOP`, `SWATI`, `SWEET DREAM`, `SWEET SIXTEEN`, `SWIM SEA`, `SWISH`, `T PLUS`, `T-SHIRT BRA`, `TAKA BOY`, `TAKIB CRE`, `TALIB CRE`, `TALIB CRE.`, `TALIB PRI`, `TAN MAN`, `TANNI`, `TEJOO MAL`, `THANKS`, `THE BOYS`, `TINYTREE`, `TORRIDO`, `TRENDY GIRL`, `TULIP`, `TULSI`, `TWO KIDS DP22`, `U S POLO`, `UDAAN`, `UDAN`, `UNC`, `UNDERJEANS`, `UNIWORTH`, `URBAN TRAIL`, `US POLO`, `US POLO INNERWEAR`, `USPA`, `USPA INNERWEAR`, `USPA KIDS`, `USPOLO KIDS`, `V ABHINANDAN`, `V ABHIVADAN`, `V B B`, `V B BALI`, `V D`, `V FM`, `V L H`, `V MAHIMA`, `V MKC`, `V PALAV`, `V PARX`, `V SHARDA`, `V SHEEVA`, `V SPY`, `V SQ`, `V SRI DESIN`, `V SSAND`, `V SUR SHYAM`, `V SURSHYAM`, `V TANAT`, `V TWILLS`, `V USPA KIDS`, `V VAN HEUSEN`, `V VISHAL`, `V ZEEL`, `VAISFM`, `VAISU`, `VAISUK`, `VAN`, `VANITA`, `VASTRAART`, `VAVYAA`, `VD`, `VEDISH`, `VENUS`, `VF`, `VGC`, `VH`, `VH INNERWEAR`, `VINEET EN`, `VIRTARA`, `VIVAAN`, `VIVANI`, `VKILLER`, `VLEE`, `VLEVIS`, `VOBI SOBI`, `VRISH`, `VS`, `VW`, `VX`, `W O E`, `W2365`, `WAC`, `WARINO`, `WE4U`, `WEGA BOYS`, `WILD CRAFT`, `WILDCRAFT L`, `WO`, `WOCKY TRENDZ`, `WOMAX`, `WOOL TOUCH`, `WRANGLER`, `XERICS`, `XXX`, `XYZBR`, `YAARON`, `YOUNG CLUB`, `YOUNG WINGS`, `YOUNGER`, `YUONG WING`, `YUVATI`, `ZANVAR`, `ZIPPY`, `ZOYA`, `ZSS`, `ZUNI ZUNI`

</details>


## 4. Colours and price tiers

**The 23 master `COLOR` values:** `BLACK`, `BLUE`, `BROWN`, `CHIKU`, `CREAM`, `ECONOMY`, `GREE`, `GREEN`, `GREY`, `MAROON`, `MEDIUM`, `NAVY`, `OLIVE`, `ORANGE`, `PINK`, `PREMIUM`, `PURPLE`, `RUST`, `STARD`, `TEAL`, `WHITE`, `YELLOW`, `RED`.

- Typos in the master: `GREE` (green) and `STARD` (unclear; mustard? guess). `CHIKU` is a colour name (a light brown).
- Three of the 23 are price tiers, not colours: `ECONOMY`, `MEDIUM`, `PREMIUM`. The PT work tabs use them that way (`PREMIUM` in `NARESH`, `ANKIT`, `MAHENDRA`; `ECONOMY` in `GULSHAN`) and so does the vendor example (`PREMIUM`). The rule that assigns a tier is not in any file (OPEN).

**What the POS data holds** (`SOH REPORT FORMAT.xlsx` `Color`, 22,387 rows, 379 distinct values):

| Kind | Rows | Share | Values |
| --- | --- | --- | --- |
| Price tier | 9,580 | 42.8% | `PREMIUM` 6,237, `MEDIUM` 2,647, `ECONOMY` 696 |
| Assorted | 4,082 | 18.2% | `ASSO.` 3,799, `MIX` 116, `ASSD` 91, `ASSO` 26, `MULTI` 21, `ASSORTED` 10, `ASSD.` 8, `ASSTD` 5 |
| Work | 463 | 2.1% | `WORK` 458, `D WORK` 5 |
| None (`NA`, `.`, blank) | 2,472 | 11.0% | `NA` 1,482, `.` 990 |
| Number, single letter or `CP n` | 789 | 3.5% | `1` 154, `2` 146, `3` 67, `A` 55, `B` 43, `5` 41, `4` 38, `C` 36 |
| A colour word | 5,001 | 22.3% | 331 spellings; the commonest `BLACK` 417, `WHITE` 359, `NAVY` 299, `GREEN` 179, `BLUE` 171, `GREY` 135, `OLIVE` 134, `MAROON` 121, `DENIM` 116, `PINK` 111, `WINE` 107, `YELLOW` 100 |

- The master's 23 values cover few of the 379 colour spellings: only 21 distinct spellings in the sample are in the master (tiers included), on 11,882 of 22,387 rows.
- The sales exports use the field the same way: in the store sales files the `Color` column holds `PREMIUM`, `MEDIUM`, `ECONOMY` or `ASSO.` on nearly every row (the earlier analysts called it a price band; an analyst reading).
- Spelling variants of one colour are many (`NAVY`, `NAVY BLUE`, `NEVY`, `N.BLUE`; `MAROON`, `MAHROON`, `MEROON`; `MUSTARD`, `MUSTERD`, `MUSTRED`; `KHAKI`, `KHAKHI`; `GREY`, `GRAY`; `BLACK`, `BALCK`). Many are two colours joined (`BLACK BLACK`, `WHITE X TEAL`, `GREEN MIL. GREEN MIL`).
- `PRD-MER-002` makes colour part of a SKU's identity; a price tier cannot be part of it. Where `COLOR` holds a tier the real colour is unknown and must stay Unknown (`PRD-MER-005`).

<details><summary>All 379 colour values in the sample, with rows</summary>

`PREMIUM` 6,237, `ASSO.` 3,799, `MEDIUM` 2,647, `NA` 1,482, `.` 990, `ECONOMY` 696, `WORK` 458, `BLACK` 417, `WHITE` 359, `NAVY` 299, `GREEN` 179, `BLUE` 171, `1` 154, `2` 146, `GREY` 135, `OLIVE` 134, `MAROON` 121, `DENIM` 116, `MIX` 116, `PINK` 111, `WINE` 107, `YELLOW` 100, `MEDIUM BLUE` 98, `ASSD` 91, `RED` 87, `PISTA` 77, `3` 67, `BEIGE` 64, `NAVY BLUE` 62, `LIGHT BLUE` 58, `MEDIUM GREY` 57, `A` 55, `DARK INDIGO` 54, `CREAM` 51, `B` 43, `5` 41, `BROWN` 40, `OFF WHITE` 39, `PRINT` 39, `4` 38, `LIGHT INDIGO` 38, `C` 36, `MID INDIGO` 36, `MUSTARD` 36, `BOTTLE GREEN` 35, `CP 1` 35, `PEACH` 35, `YELLOW OCHRE` 35, `RIFLE GREEN` 33, `RUST` 30, `TEAL` 30, `MID BLUE` 28, `DARK OLIVE` 27, `FIROJI` 27, `LIGHT` 27, `ASSO` 26, `DARK BLUE` 26, `WINE RED` 25, `CHARCOAL` 24, `LIGHT GREY` 24, `OLIVE GREEN` 24, `PURPLE` 24, `BLACK BLACK` 23, `COFFEE` 23, `DARK` 23, `CP 5` 21, `MULTI` 21, `SKY` 21, `SKY BLUE` 21, `E` 19, `KHAKI` 19, `L BLUE` 19, `LEMON` 19, `LILAC` 19, `RANI` 19, `6` 17, `DARK GREEN` 17, `MUSTERD` 17, `AQUA` 16, `LAVENDER` 16, `MINT` 16, `CP 2` 15, `DARK GREY` 15, `POWDER BLUE` 15, `F` 14, `LIGHT KHAKI` 14, `LIGHT OLIVE` 14, `MAUVE` 14, `MILITARY GREEN` 13, `NATURAL` 13, `ORANGE` 13, `CORAL` 12, `F GREEN` 12, `GOLD` 12, `7` 11, `BLACK  BROWN` 11, `CP 4` 11, `D BLUE` 11, `D GREY` 11, `TINT` 11, `ASSORTED` 10, `FIROZI` 10, `INDIGO BLUE` 10, `LIGHT GREEN` 10, `LT. GREY` 10, `SEA GREEN` 10, `TEAL BLUE` 10, `BRICK` 9, `BURNT ORANGE` 9, `DEEP RED` 9, `ECRU` 9, `GRAY` 9, `GREY MELANGE` 9, `PUMA GREEN` 9, `SAGE GREEN` 9, `TEAL57` 9, `WHITE WHITE` 9, `ASSD.` 8, `B GREEN` 8, `BALCK` 8, `BUBBLE GUM` 8, `CHARCOAL BLACK` 8, `CHOCOLATE` 8, `CP 3` 8, `CP 7` 8, `JASPER` 8, `MIDNIGHT BLUE` 8, `MOSS GREY` 8, `ONION` 8, `PEACOCK GR` 8, `RAW BLUE` 8, `TAN` 8, `VINTAGE BLUE` 8, `CILANTRO GREEN` 7, `COFFE` 7, `GREEN MIL. GREEN MIL` 7, `INDIGO` 7, `M GREEN` 7, `M.GREEN` 7, `MAHROON` 7, `OCEAN BLUE` 7, `P BLUE` 7, `C GREEN` 6, `CP 6` 6, `D FIROJI` 6, `DK. PURPLE` 6, `GFREEN` 6, `GULABI` 6, `H` 6, `KHAKHI` 6, `LIGHT TEAL` 6, `OLIVEGREEN` 6, `P.BLUE` 6, `S` 6, `T BLUE` 6, `V SILK` 6, `WHITE X TEAL` 6, `8` 5, `AQUA SEA` 5, `ASSTD` 5, `CANDY` 5, `COFFEE BROWN` 5, `CREAM WHITE` 5, `D WORK` 5, `DARK PURPLE` 5, `DEEP WINE RED` 5, `DK.BROWN` 5, `DK.GREY` 5, `DUSTY AQUA BLUE` 5, `DUSTY MINT` 5, `FRIAR BROWN` 5, `L GREEN` 5, `LIGHT NAVY` 5, `MAUVE RED` 5, `ME. GREY` 5, `MEHENDI` 5, `MEROON` 5, `MOUSE MIL.` 5, `MUD BROWN` 5, `N.BLUE` 5, `NAVY BLUE.` 5, `NEVY` 5, `NILE` 5, `OFF WHITE OFF WHITE` 5, `PARCHMENT BEIGE` 5, `PISTA GREEN` 5, `PURPAL` 5, `ROYAL` 5, `SAND` 5, `SKY GREEN` 5, `SKY MILANGE` 5, `SLATE GREY` 5, `SULPHUR YELLOW` 5, `YELLOW32` 5, `-B8-82F` 4, `11` 4, `ANTHRA MELANGE` 4, `BABY PINK` 4, `BISON BROWN` 4, `BLACK INDIGO` 4, `BLUISH GREY` 4, `C.GREEN` 4, `CARROT` 4, `CP 11` 4, `CP 9` 4, `DARK ONION` 4, `DK. GREEN` 4, `DUSTY BLUE` 4, `ECRU MELANGE` 4, `ELECTRIC_BLUE` 4, `ENGLISH ROSE` 4, `FLAMINGO` 4, `FUCHSIA PINK` 4, `GREENISH GREY` 4, `I` 4, `JADE` 4, `KIWI` 4, `KOTA` 4, `KPJAIN` 4, `L PISTA` 4, `LEHERIYA` 4, `LIGHT GREY INDIGO` 4, `LIGHT GREY55` 4, `LT. BLUE` 4, `MULTY` 4, `MUSTARD YELLOW` 4, `NATURAL MEL` 4, `OLD ROSE` 4, `OLIVE_MELANGE` 4, `ONION ONION` 4, `OXFORD BLUE` 4, `PEACH PINK` 4, `PETROL BLUE` 4, `RAMA BLUE` 4, `RAW BLACK` 4, `RICH PALLU` 4, `RUST RED` 4, `SAND GREEN SAND GREE` 4, `SAND KHAKI` 4, `SEAGREEN` 4, `SKY MELANGE` 4, `STEEL` 4, `TEAL TEAL` 4, `WHITE X B. GUM` 4, `63` 3, `68-B` 3, `B.RUST` 3, `B9` 3, `BEIGE BEIGE` 3, `BEIGE MILANGE` 3, `BLUE MIL. BLUE MIL.` 3, `BUTA CONT` 3, `CARDIUM` 3, `CHROME YELLOW` 3, `CP 10` 3, `D` 3, `DK. GREY` 3, `DUSTY KHAKI` 3, `GAZRI` 3, `GRAPE` 3, `GREEN GREEN` 3, `GREEN MILANGE` 3, `HEATHER` 3, `KURM` 3, `L PURPLE` 3, `LIGHT JADE` 3, `LT. MAUVE` 3, `M BLUE` 3, `M8` 3, `MEHNDI` 3, `MGRML` 3, `MINA CONT` 3, `MOOF` 3, `O/D BLACK` 3, `OLIVE OLIVE` 3, `P GREEN` 3, `PASTEL PINK` 3, `PEACH MIL.` 3, `PEECH` 3, `S BLUE` 3, `SAND GREEN` 3, `SEAPORT` 3, `SLATE BLUE` 3, `SUEDE PINK` 3, `SUNFLOWER` 3, `TURQUOISE BLUE` 3, `YELLOW MILANGE` 3, `64` 2, `AQUA GREEN` 2, `B7` 2, `BEIGE A` 2, `CB` 2, `CHAML` 2, `CHICKOO` 2, `CHIT PALLU` 2, `D GREEN` 2, `DARK WINE` 2, `DK. NAVY` 2, `EMB BUTTA` 2, `FOWN` 2, `GREY MEL` 2, `HOT CORAL` 2, `ICE NAVY INDIGO` 2, `INDIGO CAMO` 2, `JET BLACK` 2, `L YELLWO` 2, `LEMAN` 2, `LIRIL` 2, `LT. OLIVE` 2, `M GREEN X DR ZAD` 2, `M.RED` 2, `NAVY X RED` 2, `NI` 2, `ORSMK` 2, `OTHERS` 2, `P.GREEN TEAL WHITE` 2, `R.GREEN` 2, `SHTLTR` 2, `SIFFON` 2, `SMOKE DENIM` 2, `STLER` 2, `T.BLUE` 2, `YELLWO` 2, `AQUA BLUE` 1, `B. RUST` 1, `BLPNK` 1, `BORDER` 1, `BROWEN` 1, `BTRED` 1, `BUTTA SK` 1, `CHARCOAL MEL` 1, `CHARCOALMEL` 1, `CHIKU` 1, `CONT BUTTA` 1, `DARK KHAKI` 1, `DARK RED / BLACK` 1, `FAWN` 1, `FIROJA` 1, `G-TINT` 1, `GAJRI` 1, `GREY MIL` 1, `HAPPY` 1, `INSBL` 1, `KRISHNA` 1, `L.GREEN` 1, `LIGHT BLUE INDIGO` 1, `LIHGT KHAKI` 1, `LIME` 1, `LME` 1, `MEDIUM BLUE80` 1, `MHD` 1, `MIN CONT` 1, `MINIG` 1, `MULTI2` 1, `MULTICOLOUR` 1, `MUSTRED` 1, `N BLUE` 1, `NATURAL/BROWN` 1, `NAVY B` 1, `NAVY LAVENDER WHITE` 1, `NET` 1, `PHONE` 1, `PISTAGREEN` 1, `PLAIN` 1, `PURPLE15` 1, `R BLUE` 1, `RED SMALL CHECK` 1, `RESHAM MINA` 1, `ROSWI` 1, `ROYAL BLUE` 1, `S LEMON` 1, `S WHITE` 1, `SD BUTTA` 1, `SDGIJ` 1, `SKY MEL` 1, `SRMR` 1, `STGML` 1, `STRIPE` 1, `TVRA` 1

</details>


## 5. Genders

**The 5 master `GENDER` values:** `MALE`, `FEMALE`, `KIDS MALE`, `KIDS FEMALE`, `UNISEX`.

**What the POS data holds** (`SOH REPORT FORMAT.xlsx` `Gender`, 24 spellings, one of them blank). The "reads as" column is an inference, not a mapping KDPS approved:

| Spelling | Rows | Reads as (inferred) |
| --- | --- | --- |
| `FEMALE` | 7,924 | FEMALE |
| `MALE` | 7,703 | MALE |
| `KIDSM` | 1,747 | KIDS MALE |
| `KIDS MALE` | 1,713 | KIDS MALE |
| `KIDS FEMALE` | 1,341 | KIDS FEMALE |
| `KIDSF` | 1,122 | KIDS FEMALE |
| `UNISEX` | 213 | UNISEX |
| `KIDM` | 198 | KIDS MALE |
| `.` | 108 | none |
| `ACCE` | 85 | not a gender (accessories) |
| `KIDS` | 59 | kids, sex not given |
| `Female` | 39 | FEMALE |
| `FEAMLE` | 38 | FEMALE |
| `FMALE` | 29 | FEMALE |
| `FEMALE KIDS` | 13 | KIDS FEMALE |
| `FEAMAL` | 12 | FEMALE |
| `Male` | 10 | MALE |
| `PROMO` | 10 | not a gender |
| `KIDEM` | 9 | KIDS MALE |
| `ASSC.` | 9 | not a gender (accessories) |
| `NA` | 2 | none |
| `CARRY BAG` | 1 | not a gender |
| `FMAMLE` | 1 | FEMALE |
| `MIX` | 1 | unisex? or mixed |

- All 5 master values occur, plus the case variants `Female` and `Male`; together they cover 18,943 of 22,387 rows. Misspellings: `FEAMLE`, `FEAMAL`, `FMALE`, `FMAMLE` (female) and `KIDEM`.
- The field also holds non-gender words: `ACCE`, `ASSC.`, `CARRY BAG`, `PROMO`, `.`, `NA`.
- Other pooled files add `SMAG HALF ZIPPER` (an item description), `Grand Total` (a total row), `ASSO.`, `BOY`, `ACCE.`, `MENS`, `MEN`, `KIDS M`, `ACC`, `JEANS`, `GIFT`, `N/A`, `LM`, `LUGGAGE`: 39 distinct spellings in all, counting the stray `Grand Total`.
- Vendor PT files add `Girls` (`peppermint`), `MENS` (`DSY`), `Boys`/`BOYS`/`Girls`/`GIRLS` (`kidcity`), `FEMALE` in the voucher-type column (`ZILU`), and gender fused with a body part (`MEN BERMUDA LENGTH`, `SWEET DREAMS`).

## 6. Sub categories and types

**`SUB CATEGORY` (9 values):** `ACCESSORIES`, `CASUAL WEAR`, `FABRIC`, `FORMAL WEAR`, `INNERWEAR`, `NIGHTWEAR`, `PARTY WEAR`, `SEASONAL WEAR`, `SPORTS WEAR`.

**`TYPE` (7 values):** `ACCESSORIES`, `BOTTOM WEAR`, `FOOTWEAR`, `FULL SET`, `LUGGAGE`, `ONE-PIECE`, `TOP WEAR`.

- The item map (columns K and L) gives each of the 98 items one sub category and one type. Items per sub category: `ACCESSORIES` 38, `CASUAL WEAR` 24, `PARTY WEAR` 10, `FORMAL WEAR` 8, `INNERWEAR` 8, `SPORTS WEAR` 2, `NIGHTWEAR` 2, `CASUAL WEAR/INNERWEAR` 1, `FABRIC` 1, `CASUAL/SPORTS /NIGHTWEAR` 1, `SEASONAL WEAR` 1, `FORMAL / CASUAL/ PARTY WEAR` 1, `SPORTS WEAR/INNERWEAR` 1.
- Items per type: `ACCESSORIES` 35, `TOP WEAR` 31, `BOTTOM WEAR` 16, `FULL SET` 7, `LUGGAGE/ACCESSORIES` 3, `FOOTWEAR` 3, `ONE-PIECE` 2, `LUGGAGE` 1.
- **Map values that are not in the drop-down lists:** sub category `CASUAL WEAR/INNERWEAR`, `CASUAL/SPORTS /NIGHTWEAR`, `FORMAL / CASUAL/ PARTY WEAR`, `SPORTS WEAR/INNERWEAR` (one item each: `CARGO`, `LOWER`, `SHIRT`, `SHORTS`) and type `LUGGAGE/ACCESSORIES` (`BACKPACK`, `DUFFLE BAG`, `TROLLEY`). So the suggested value can never be picked from the list. The PT work tabs also copy these combinations into `SUGGESTED` cells (the `NARESH` tab shows `FORMAL / CASUAL/ PARTY WEAR` and `CASUAL WEAR/INNERWEAR`).
- A sub category is not a category: the POS data holds category codes (section 11) that are a different level.
- structure-and-masters 4.1 has a `Category` record with a parent and a size set; the PRD keeps categories and attributes apart (`PRD-MER-002`, `PRD-MER-004`). Whether `SUB CATEGORY` and `TYPE` are categories or attributes is the Organisation's configuration (`PRD-ORG-011`); the Setup screen of `ui-blueprint.html` lists both as vocabularies (structure-and-masters 4.2).

## 7. Items

**98 master items** with the sub category and type that the item map assigns:

<details><summary>Item map (98 rows)</summary>

| Item | Sub category | Type |
| --- | --- | --- |
| `BABA SUIT` | FORMAL WEAR | FULL SET |
| `BACKPACK` | ACCESSORIES | LUGGAGE/ACCESSORIES |
| `BATH MAT` | ACCESSORIES | ACCESSORIES |
| `BEDSHEET` | ACCESSORIES | ACCESSORIES |
| `BELT` | ACCESSORIES | ACCESSORIES |
| `BELT & WALLET` | ACCESSORIES | ACCESSORIES |
| `BHAGALPURI CHADAR` | ACCESSORIES | ONE-PIECE |
| `BLAZER` | FORMAL WEAR | TOP WEAR |
| `BLOOMER` | INNERWEAR | BOTTOM WEAR |
| `BLOUSE` | FORMAL WEAR | TOP WEAR |
| `BRA` | INNERWEAR | ACCESSORIES |
| `BRIEF` | INNERWEAR | ACCESSORIES |
| `CAMISOLE` | INNERWEAR | TOP WEAR |
| `CAP` | ACCESSORIES | ACCESSORIES |
| `CAPRI` | CASUAL WEAR | BOTTOM WEAR |
| `CARGO` | CASUAL WEAR/INNERWEAR | BOTTOM WEAR |
| `CARRY BAG` | ACCESSORIES | ACCESSORIES |
| `CHAIN` | ACCESSORIES | ACCESSORIES |
| `CO-ORD SET` | CASUAL WEAR | FULL SET |
| `CROP TOP` | CASUAL WEAR | TOP WEAR |
| `CUFFLING` | ACCESSORIES | ACCESSORIES |
| `DEODRENT` | ACCESSORIES | ACCESSORIES |
| `DHOTI` | PARTY WEAR | BOTTOM WEAR |
| `DRESS MATERIAL` | FABRIC | FULL SET |
| `DRESSES` | CASUAL WEAR | TOP WEAR |
| `DUFFLE BAG` | ACCESSORIES | LUGGAGE/ACCESSORIES |
| `DUNGAREE` | CASUAL WEAR | ONE-PIECE |
| `DUPATTA` | PARTY WEAR | TOP WEAR |
| `EARRINGS` | ACCESSORIES | ACCESSORIES |
| `FROCK` | FORMAL WEAR | TOP WEAR |
| `GLOVES` | ACCESSORIES | ACCESSORIES |
| `GOWN` | CASUAL WEAR | TOP WEAR |
| `HANDBAG` | ACCESSORIES | LUGGAGE |
| `HANDKERCHIEF` | ACCESSORIES | ACCESSORIES |
| `HEADPHONE` | ACCESSORIES | ACCESSORIES |
| `JACKET` | CASUAL WEAR | TOP WEAR |
| `JEANS` | CASUAL WEAR | BOTTOM WEAR |
| `JEGGING` | CASUAL WEAR | BOTTOM WEAR |
| `JOGGER` | SPORTS WEAR | BOTTOM WEAR |
| `JUMP SUIT` | CASUAL WEAR | TOP WEAR |
| `JUTI` | PARTY WEAR | FOOTWEAR |
| `KURTA` | PARTY WEAR | TOP WEAR |
| `KURTI` | CASUAL WEAR | TOP WEAR |
| `KURTI SET` | PARTY WEAR | TOP WEAR |
| `LADIES PURSE` | ACCESSORIES | ACCESSORIES |
| `LEGGING` | CASUAL WEAR | BOTTOM WEAR |
| `LEHENGA` | PARTY WEAR | BOTTOM WEAR |
| `LOCKET CHAIN` | ACCESSORIES | ACCESSORIES |
| `LOWER` | CASUAL/SPORTS /NIGHTWEAR | BOTTOM WEAR |
| `MALA` | ACCESSORIES | ACCESSORIES |
| `MANGALSUTRA` | ACCESSORIES | ACCESSORIES |
| `MIDY` | CASUAL WEAR | BOTTOM WEAR |
| `MUFFLER` | ACCESSORIES | ACCESSORIES |
| `NECKLACE` | ACCESSORIES | ACCESSORIES |
| `NECKLACE SET` | ACCESSORIES | ACCESSORIES |
| `NEHRU JACKET` | PARTY WEAR | TOP WEAR |
| `NIGHT SUIT` | NIGHTWEAR | TOP WEAR |
| `NIGHTY` | NIGHTWEAR | TOP WEAR |
| `PALAZZO` | CASUAL WEAR | BOTTOM WEAR |
| `PALAZZO SET` | CASUAL WEAR | FULL SET |
| `PANTIE` | INNERWEAR | ACCESSORIES |
| `PATIALA` | CASUAL WEAR | FULL SET |
| `PERFUME` | ACCESSORIES | ACCESSORIES |
| `PETTICOAT` | INNERWEAR | BOTTOM WEAR |
| `PILLOW` | ACCESSORIES | ACCESSORIES |
| `POCKET SQUARE` | ACCESSORIES | ACCESSORIES |
| `RAINCOAT` | SEASONAL WEAR | FULL SET |
| `SAFA` | PARTY WEAR | TOP WEAR |
| `SALWAR SUIT` | CASUAL WEAR | TOP WEAR |
| `SAREE` | FORMAL WEAR | TOP WEAR |
| `SCARVES` | ACCESSORIES | ACCESSORIES |
| `SHACKET` | CASUAL WEAR | TOP WEAR |
| `SHERWANI` | PARTY WEAR | TOP WEAR |
| `SHIRT` | FORMAL / CASUAL/ PARTY WEAR | TOP WEAR |
| `SHOES` | ACCESSORIES | FOOTWEAR |
| `SHORTS` | SPORTS WEAR/INNERWEAR | BOTTOM WEAR |
| `SKIRT` | FORMAL WEAR | BOTTOM WEAR |
| `SLIPPERS` | ACCESSORIES | FOOTWEAR |
| `SOCKS` | ACCESSORIES | ACCESSORIES |
| `SPEAKER` | ACCESSORIES | ACCESSORIES |
| `STOLE` | ACCESSORIES | TOP WEAR |
| `SUIT` | FORMAL WEAR | TOP WEAR |
| `SWEATER` | CASUAL WEAR | TOP WEAR |
| `SWEATSHIRT` | CASUAL WEAR | TOP WEAR |
| `THERMAL` | INNERWEAR | ACCESSORIES |
| `TIES & BOWTIE` | ACCESSORIES | ACCESSORIES |
| `TOP` | CASUAL WEAR | TOP WEAR |
| `TOWEL` | ACCESSORIES | ACCESSORIES |
| `TRACKSUIT` | SPORTS WEAR | FULL SET |
| `TROLLEY` | ACCESSORIES | LUGGAGE/ACCESSORIES |
| `TROUSER` | FORMAL WEAR | BOTTOM WEAR |
| `T-SHIRT` | CASUAL WEAR | TOP WEAR |
| `VEST` | INNERWEAR | ACCESSORIES |
| `WALLET` | ACCESSORIES | ACCESSORIES |
| `WINDCHEATER` | CASUAL WEAR | TOP WEAR |
| `BOTTLE` | ACCESSORIES | ACCESSORIES |
| `BUNDY` | PARTY WEAR | TOP WEAR |
| `CARDIGAN` | CASUAL WEAR | TOP WEAR |

</details>

**What the POS data holds** (`SOH REPORT FORMAT.xlsx` `Item Name`): 135 distinct spellings; 60 are in the master and cover 18,832 of 22,387 rows. The commonest items outside the master:

| Spelling | Rows | Nearest master item (inferred) |
| --- | --- | --- |
| `SET` | 1,302 | `CO-ORD SET`, `KURTI SET`, `PALAZZO SET` ... (a generic set) |
| `SWEAT SHIRT` | 584 | `SWEATSHIRT` |
| `TROUSERS` | 461 | `TROUSER` |
| `SAREES` | 197 | `SAREE` |
| `KURTA SET` | 138 | `KURTA` or `KURTI SET` |
| `WINTER SET` | 110 | none |
| `SHORT` | 64 | `SHORTS` |
| `COAT` | 51 | `BLAZER`? (guess) |
| `MIDDI` | 49 | `MIDY` |
| `WINTER TOP` | 49 | none |
| `WAISTCOAT` | 43 | none |
| `BUNDY SET` | 40 | `BUNDY` |
| `HOT PANT` | 32 | none |
| `PANT` | 30 | `TROUSER`? |
| `TROLLY` | 26 | `TROLLEY` |
| `SARARA` | 26 | none |
| `TRACK PANT` | 23 | none (`TRACK PANT` is a master fit) |
| `WINTER KURTI SET` | 22 | none |
| `PURSE` | 21 | `LADIES PURSE` |
| `KURTA PAJAMA` | 21 | `KURTA` |
| `WINTER CAP` | 20 | `CAP` |
| `T SHIRT` | 19 | `T-SHIRT` |
| `PANTY` | 19 | `PANTIE` |
| `L DUPTTA` | 17 | `DUPATTA` |
| `SHAWL` | 16 | none |

- The common items inside the master: `SHIRT`, `T-SHIRT`, `JEANS`, `SAREE`, `KURTI SET`, `TOP`, `BABA SUIT`, `JACKET`, `KURTI`, `FROCK` (the first ten by rows).
- Typos and odd spellings in the master items: `DEODRENT`, `CUFFLING`, `SCARVES`, `TROLLEY` against POS `TROLLY`, `DRESSES` against POS `DRESS`. The item list mixes garments, accessories, jewellery (`EARRINGS`, `MANGALSUTRA`, `NECKLACE`), electronics (`HEADPHONE`, `SPEAKER`) and toiletries (`PERFUME`, `DEODRENT`).
- The vendor files use their own item word (`Product`, `PRODUCT`, `Product Code`, `BODY`, `Category Name`); none uses the master item list. The mapping from a vendor word to a master item is a mapping rule, proposed and confirmed (`PRD-IMP-003`, `PRD-IMP-008`).

<details><summary>All 135 item names in the sample, with rows</summary>

`SHIRT` 2,911, `T-SHIRT` 2,134, `JEANS` 1,886, `SAREE` 1,761, `SET` 1,302, `KURTI SET` 1,296, `TOP` 1,060, `BABA SUIT` 994, `JACKET` 925, `KURTI` 651, `SWEAT SHIRT` 584, `FROCK` 526, `KURTA` 474, `DRESSES` 466, `TROUSERS` 461, `BLAZER` 363, `SWEATSHIRT` 355, `SALWAR SUIT` 313, `LOWER` 310, `SUIT` 250, `SAREES` 197, `SWEATER` 193, `NIGHTY` 173, `STOLE` 155, `TROUSER` 152, `BEDSHEET` 146, `KURTA SET` 138, `GOWN` 120, `DUPATTA` 115, `WINTER SET` 110, `THERMAL` 100, `BRA` 92, `CARDIGAN` 88, `SOCKS` 80, `SHORTS` 73, `SHORT` 64, `LEHENGA` 62, `PALAZZO SET` 60, `CROP TOP` 55, `CAP` 54, `TOWEL` 53, `COAT` 51, `CO-ORD SET` 50, `MIDDI` 49, `WINTER TOP` 49, `JEGGING` 43, `WAISTCOAT` 43, `BUNDY SET` 40, `VEST` 37, `HOT PANT` 32, `PANT` 30, `BLOUSE` 27, `SARARA` 26, `TROLLY` 26, `BRIEF` 25, `BELT` 23, `TRACK PANT` 23, `WINTER KURTI SET` 22, `KURTA PAJAMA` 21, `PURSE` 21, `WINTER CAP` 20, `PANTY` 19, `T SHIRT` 19, `SKIRT` 18, `L DUPTTA` 17, `INFANT SET` 16, `MIDY` 16, `SHAWL` 16, `TROLLEY` 16, `PALAZZO` 15, `BATH MAT` 13, `BUNDY` 13, `WALLET` 13, `HANDKERCHIEFS` 12, `NIGHT SUIT` 11, `BACKPACK` 10, `KIDS SET` 10, `MUFFLER` 10, `WINTER LOWER` 10, `JACKET (FS)` 9, `BOY SET` 8, `PATIALA` 8, `DUPTTA` 7, `HIPSTER` 7, `KIDS SHORT` 7, `PETTICOAT` 7, `BOXER` 6, `GIRL SET` 6, `JOGGER` 6, `JUMP SUIT` 6, `LEGGINGS` 6, `CARGO` 5, `DUNGAREE` 5, `WAIST COAT` 5, `BABY SUIT` 4, `CROP SET` 4, `JEGGINGS` 4, `PILLOW` 4, `TANK TOP` 4, `DUFFEL BAG` 3, `SKIRT SET` 3, `TANK` 3, (blank) 2, `ACCESSORIES` 2, `BABY ROMPER` 2, `BACKPACKS` 2, `CARRY BAG` 2, `COMISOLE` 2, `DEO` 2, `KIDS CAPRI` 2, `NAYARA` 2, `SOFT TROLLY` 2, `SPEAKER` 2, `TRUNK` 2, `UNDERSHIRT HS` 2, `ARM SHIELD` 1, `BAG` 1, `BAG BACKPACK` 1, `BAGPACK` 1, `BEDDING SET` 1, `DUFFLE TROLLY` 1, `GARARA` 1, `JOGGER PANT` 1, `KIDS JACKET` 1, `LAPTOP BAG` 1, `LOUNGE PANT` 1, `PANTIE` 1, `PAPLON` 1, `PLAZO SET` 1, `PROMO BAG` 1, `SCARF` 1, `SLEEPING BAG` 1, `TANAT SAREE` 1, `UMBRELLA` 1, `W TOP` 1

</details>


## 8. Fits

**75 master `FIT` values.** Groups (the groups are an analyst's reading):

- Plain fit words: `REGULAR`, `REGULAR STRAIGHT`, `SLIM`, `SLIM STRAIGHT`, `SUPER SLIM`, `SKINNY`, `STRAIGHT`, `RELAXED`, `BOOTCUT`, `TAILORED`, `CROPPED`, `ANKLE`, `MANKLE`, `SMART`, `CLASSIC FIT`, `FREE FIT`, `INDIA SLIM`.
- Garment or neck or sleeve words used as a fit: `CREW NECK`, `ROUND NECK`, `POLO NECK`, `FULL SHIRT`, `HALF SHIRT`, `HALF SLEEVE`, `SLEEVE LESS`, `TANK TOP`, `TRUNK`, `BERMUDA`, `BIKINI`, `BOXER`, `HIPSTER`, `PAJAMA`, `PAJAMS`, `TRACK PANT`, `SHORTS SET`, `SKIRT SET`, `PANT SET`.
- Set and suit words: `2 PCS SUIT`, `3 PCS SUIT`, `5 PCS SUIT`, `DHOTI KURTA SET`, `INDO WESTERN`, `COTTON KURTI`, `COTTON SAREE`, `SILK SAREE`, `ETHNIC`, `UNSTITCHED`.
- Brand fit names (guess: fit or style names of one brand each): `AUSTIN`, `BRANDON`, `BRUCE`, `CHELSEA FIT`, `CHICO`, `CONNOR`, `DENVER`, `FREDDIE`, `HAROLD`, `HENRY`, `JACKSON`, `MANHATTAN`, `REGALLO`, `RICARDO`, `ROVER`, `SHAWN`, `SLASH`, `B-91`, `B-95`, `KANO`, `NEO`. `B-91`, `B-95` and `INDIA SLIM` appear in the `BLACKBERRY.xlsx` `FIT` column.
- Typos: `SKINNY TEPAR`, `SLIM TEPAR`, `SUPPER SKINNY`, `LOSSE`, `PAJAMS`, `ZERO CALORIE` (a style name? guess), `PROMO`.

<details><summary>All 75 values, in the sheet's order</summary>

`2 PCS SUIT`, `3 PCS SUIT`, `5 PCS SUIT`, `ANKLE`, `AUSTIN`, `B-91`, `B-95`, `BERMUDA`, `BIKINI`, `BOOTCUT`, `BOXER`, `BRANDON`, `BRUCE`, `CHELSEA FIT`, `CHICO`, `CLASSIC FIT`, `CONNOR`, `COTTON KURTI`, `COTTON SAREE`, `CREW NECK`, `CROPPED`, `DENVER`, `DHOTI KURTA SET`, `ETHNIC`, `FREDDIE`, `FREE FIT`, `FULL SHIRT`, `HALF SHIRT`, `HALF SLEEVE`, `HAROLD`, `HENRY`, `HIPSTER`, `INDIA SLIM`, `INDO WESTERN`, `JACKSON`, `KANO`, `LOSSE`, `MANHATTAN`, `MANKLE`, `NEO`, `PAJAMA`, `PAJAMS`, `PANT SET`, `POLO NECK`, `PROMO`, `REGALLO`, `REGULAR`, `REGULAR STRAIGHT`, `RELAXED`, `RICARDO`, `ROUND NECK`, `ROVER`, `SHAWN`, `SHORTS SET`, `SILK SAREE`, `SKINNY`, `SKINNY TEPAR`, `SKIRT SET`, `SLASH`, `SLEEVE LESS`, `SLIM`, `SLIM STRAIGHT`, `SLIM TEPAR`, `SMART`, `SPORTS WOMENS`, `STRAIGHT`, `SUPER SLIM`, `SUPPER SKINNY`, `TAILORED`, `TANK TOP`, `TEXTURED`, `TRACK PANT`, `TRUNK`, `UNSTITCHED`, `ZERO CALORIE`

</details>

**What the POS data holds** (`SOH REPORT FORMAT.xlsx` `Fit`): 47 spellings, 24 of them in the master (they cover 9,420 of 22,387 rows). The commonest values that are **not** in the master list:

| Value | Rows | Note |
| --- | --- | --- |
| `LM` | 7,492 | code |
| `MM` | 3,430 | code |
| `VLM` | 1,062 | code |
| `HM` | 285 | code |
| `MM A` | 204 | code |
| `.` | 192 | none |
| `REGULER` | 100 | typo of `REGULAR` |
| `Reguler` | 49 | typo of `REGULAR` |
| `0` | 49 | none |
| `SF` | 19 | code |
| `VHM` | 14 | code |
| `LOSS` | 13 | typo? of `LOSSE` |
| `LM A` | 12 | code |
| `REGULLAR` | 10 | typo of `REGULAR` |
| `SLIM FIT` | 10 | master has `SLIM` |
| `FULL SET` | 10 | a set word |
| `A LM` | 8 | code |
| `FREE SIZE` | 3 | a size |
| `FREE` | 1 | a size |
| `OLD` | 1 |  |
| `GIFT` | 1 | not a fit |
| `WOMENS INNERWEAR` | 1 | not a fit |
| `ACCESSORIES` | 1 | not a fit |

- `LM`, `MM`, `HM`, `VLM`, `VHM` are five codes that fill 12,283 rows (12,507 with their `MM A`, `LM A`, `A LM` variants). What they mean is not stated; the earlier analysts called them price-tier codes (an analyst reading). They are not in the master. OPEN.
- `SILK SAREE` (361 rows), `FULL SHIRT`, `HALF SHIRT`, `ANKLE`, `COTTON KURTI`, `COTTON SAREE` are in the master list and are used as a fit of sarees, shirts and kurtis. `ROUND NECK`, `HALF SLEEVE` too.

<details><summary>All 47 fit values in the sample, with rows</summary>

`LM` 7,492, `REGULAR` 3,903, `MM` 3,430, `FREE FIT` 2,362, `SLIM` 1,936, `VLM` 1,062, `SILK SAREE` 361, `HM` 285, `MM A` 204, `.` 192, `FULL SHIRT` 183, `ANKLE` 107, `REGULER` 100, `HALF SHIRT` 85, `ROUND NECK` 85, `RELAXED` 73, `COTTON KURTI` 67, `HALF SLEEVE` 66, `SKINNY` 65, `0` 49, `Reguler` 49, `KANO` 36, `COTTON SAREE` 28, `ZERO CALORIE` 24, `SF` 19, `VHM` 14, `LOSS` 13, `LM A` 12, `FULL SET` 10, `REGULLAR` 10, `SLIM FIT` 10, `REGULAR STRAIGHT` 9, `A LM` 8, `BRANDON` 8, `DHOTI KURTA SET` 5, `ETHNIC` 4, `POLO NECK` 4, `PROMO` 4, `FREE SIZE` 3, `BOXER` 2, `TRUNK` 2, `ACCESSORIES` 1, `FREE` 1, `GIFT` 1, `OLD` 1, `TRACK PANT` 1, `WOMENS INNERWEAR` 1

</details>


## 9. Sizes

**135 master `SIZE` values**, grouped by kind. The groups are an analyst's reading; the sheet has one flat list.

| Kind | Count | Values |
| --- | --- | --- |
| Plain numbers (no unit) | 51 | `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `10`, `11`, `12`, `13`, `14`, `15`, `16`, `18`, `20`, `22`, `23`, `24`, `26`, `27`, `28`, `29`, `30`, `32`, `33`, `34`, `36`, `38`, `39`, `40`, `41`, `42`, `44`, `46`, `48`, `72`, `76`, `82`, `86`, `92`, `96`, `100`, `102`, `104`, `108`, `112`, `80` |
| Letter sizes | 10 | `L`, `M`, `S`, `XL`, `XS`, `XXL`, `3XL`, `4XL`, `5XL`, `6XL` |
| Free size | 1 | `FREE SIZE` |
| Odd codes | 6 | `AS`, `EES`, `EL`, `ES`, `EXL`, `EXS` |
| Bra sizes | 20 | `30B`, `32B`, `34B`, `36B`, `38B`, `30C`, `32C`, `34C`, `36C`, `38C`, `30D`, `32D`, `34D`, `36D`, `38D`, `40B`, `42D`, `40C`, `42C`, `40D` |
| Kids ages in years | 17 | `12-14 Y`, `10-12 Y`, `8-10 Y`, `6-7 Y`, `4-6 Y`, `2-4 Y`, `2-3 Y`, `11-12 Y`, `13-14 Y`, `3-4 Y`, `5-6 Y`, `7-8 Y`, `9-10 Y`, `10-11 Y`, `15-16 Y`, `8-9 Y`, `4-5 Y` |
| Months | 3 | `12-18 M`, `6-12 M`, `0-6 M` |
| Volume | 4 | `150 ML`, `185 ML`, `100 ML`, `250 ML` |
| Centimetres | 15 | `50 CM`, `55 CM`, `60 CM`, `65 CM`, `66 CM`, `67 CM`, `68 CM`, `70 CM`, `75 CM`, `76 CM`, `78 CM`, `79 CM`, `80 CM`, `85 CM`, `90 CM` |
| Width by length in cm | 6 | `274 X 274 CM`, `70 X 150 CM`, `75 X 150 CM`, `43 X 68 CM`, `40 X 61 CM`, `183 X 198 CM` |
| Saree pieces | 2 | `WITH BLOUSE PIECE`, `WITHOUT BLOUSE PIECE` |

- The numbers run 0 to 16, then even numbers 18 to 48 with 23, 27, 29, 33, 39 and 41 added, then 72, 76, 80, 82, 86, 92, 96, 100, 102, 104, 108 and 112. They are shared by waist, chest, kids age or length in the data (guess); the unit is not stated.
- The odd codes `AS`, `EES`, `EL`, `ES`, `EXL`, `EXS` have no explanation in the data (guess: size letters with a stray prefix; `EXL`, `EXS`, `EL`, `ES` read as `XL`, `XS`, `L`, `S`).
- `PRD-MER-005` keeps a missing size distinct from an explicitly supplied Free Size. The data has both a `FREE SIZE` and several non-values (below).

**What the POS data holds** (`SOH REPORT FORMAT.xlsx` `Size`): 178 spellings, 92 in the master, covering 18,807 of 22,387 rows. The commonest values **not** in the master:

| Value | Rows | Reads as (inferred) |
| --- | --- | --- |
| `FS` | 1,827 | free size (the master says `FREE SIZE`) |
| `NA` | 445 | no size |
| `.` | 367 | no size |
| (blank) | 250 | no size |
| `2XL` | 152 | `XXL` |
| `-` | 90 | no size |
| `FREE` | 36 | free size |
| `11-12Y` | 34 | `11-12 Y` |
| `13-14Y` | 34 | `13-14 Y` |
| `8-9Y` | 34 | `8-9 Y` |
| `6-7Y` | 33 | `6-7 Y` |
| `4-5Y` | 32 | `4-5 Y` |
| `10-11Y` | 31 | `10-11 Y` |
| `M/XXL` | 16 | a range |
| `ST` | 16 | unknown |
| `..` | 14 | no size |
| `M*XXL` | 10 | a range |
| `90*100` | 8 | a dimension |

- Free size is written `FREE SIZE` (2,746 rows), `FS` (1,827) and `FREE` (36). A missing size is `NA` (445), `.` (367), `-` (90), `..` (14) or blank (250).
- Kids ages are written with a space in the master (`7-8 Y`) and without in the data (`7-8Y`), also `12 YR`, `0-1YR`; measures use `*` (`90*100`, `16*24`) where the master uses `X` and `CM`.
- Vendor files add `3XXL`, `XXXL`, `4XXL`, bra sizes without a letter case rule, `96CM(M)`, `1.02M(L)` (`minelli`), `36/XS` (`HYPHEN`), `XL (105 CMS)` (`SUVIDHI`), `M/1.05 m` (`FAHRENHEIT`).

<details><summary>All 178 size values in the sample, with rows</summary>

`FREE SIZE` 2,746, `FS` 1,827, `L` 1,735, `XL` 1,557, `M` 1,536, `XXL` 796, `40` 693, `38` 657, `S` 652, `32` 616, `30` 590, `36` 587, `34` 576, `42` 534, `28` 492, `NA` 445, `26` 430, `24` 372, `.` 367, `44` 341, `22` 311, `39` 303, `20` 289, `16` 276, `18` 255, (blank) 250, `14` 158, `12` 154, `6` 153, `2XL` 152, `8` 137, `10` 131, `82` 130, `86` 127, `76` 126, `2-4 Y` 117, `92` 111, `-` 90, `2` 73, `96` 70, `3XL` 69, `4` 67, `3` 64, `8-10 Y` 58, `1` 54, `0` 48, `10-12 Y` 42, `12-14 Y` 42, `4-6 Y` 41, `274 X 274 CM` 38, `15-16 Y` 36, `FREE` 36, `11-12Y` 34, `13-14Y` 34, `5` 34, `8-9Y` 34, `6-7Y` 33, `72` 33, `4-5Y` 32, `10-11Y` 31, `100` 27, `9` 26, `7` 25, `6-7 Y` 24, `104` 22, `46` 22, `108` 20, `5-6 Y` 19, `7-8 Y` 19, `M/XXL` 16, `ST` 16, `..` 14, `5XL` 14, `183 X 198 CM` 13, `9-10 Y` 12, `13` 11, `55 CM` 10, `M*XXL` 10, `4XL` 8, `90*100` 8, `OP` 7, `16*24` 6, `32B` 6, `65` 6, `85` 6, `90` 6, `11` 5, `34C` 5, `60` 5, `70` 5, `73` 5, `80` 5, `112` 4, `12 YR` 4, `14 YR` 4, `22 TO 26` 4, `34B` 4, `3XXL` 4, `50` 4, `68 CM` 4, `XS` 4, `0*5` 3, `10 YR` 3, `108*108` 3, `11-12 Y` 3, `13-14 Y` 3, `34D` 3, `36B` 3, `36C` 3, `55` 3, `6*10` 3, `66` 3, `8 YR` 3, `95` 3, `XXXL` 3, `0-1YR` 2, `1 10` 2, `150 ML` 2, `16 TO 20` 2, `2-3 Y` 2, `3-4 Y` 2, `30B` 2, `38C` 2, `4 YR` 2, `48` 2, `50CM` 2, `55CM` 2, `6 YR` 2, `60CM` 2, `67 CM` 2, `70 X 150 CM` 2, `70*90` 2, `70CM` 2, `75` 2, `75CM` 2, `76 CM` 2, `0*22` 1, `1 TO 3` 1, `1*10` 1, `1-2YR` 1, `10TO12` 1, `12*16` 1, `12TO14` 1, `14TO16` 1, `15` 1, `16*34` 1, `1618` 1, `18/24` 1, `2 YR` 1, `20/24` 1, `22 36` 1, `3 YR` 1, `3-5YR` 1, `32C` 1, `36D` 1, `38B` 1, `4 TO6` 1, `4 Y` 1, `40 X 61 CM` 1, `40D` 1, `43 X 68 CM` 1, `45` 1, `4XXL` 1, `50 X 180` 1, `52` 1, `6-12M` 1, `65CM` 1, `66 CM` 1, `6TO8` 1, `70*100` 1, `8TO10` 1, `BOX` 1, `L TO XXL` 1, `L*XXL` 1, `M*XL` 1, `NB` 1, `S TO M` 1, `XXX` 1

</details>


## 10. GST % and the rules found

**The 4 master `GST %` values:** `5`, `12`, `18`, `TAX FREE` (the first three are numbers, the last is text). The PT sheet's formulas return only 5 or 18; the drop-down on `INPUT TAX` and `OUTPUT TAX` offers all four.

The files carry **several different GST rules**. They are listed side by side. **OPEN for the CA: no source here is taken as right, and this note does not say which rule applies.** (`POL-10.02` effective-dated rates and value slabs; `POL-10.05` Accounts and the CA approve statutory settings; `POL-10.06` KDPS's classifications, rates and applicability need verification; `GC7-2` in [shared-calculations.md](../design/calculations/shared-calculations.md) asks which value is compared with a slab.)

| Source | What it does | Compared value | Boundary |
| --- | --- | --- | --- |
| PT template, `INPUT TAX` (see [pt-file-layouts.md](pt-file-layouts.md) 1.3) | 5% or 18%; fabric and saree 5%; belt, ladies purse, wallet 18%; luggage 18% | `BASIC` | 5% at 2,500 or less |
| PT template, `OUTPUT TAX` | the same | `MRP` | 5% at 2,625 or less |
| PT template, `PRAVIN JI` tab (older) | 5% or 18%; only saree 5% and belt 18%; luggage 18% | `BASIC` and `MRP` | 5% at 2,625 or less, for both |
| Store daily sales report, `bank-statement/3. Vaishnavi Singh More DSR(Fy-26-27).xlsx`, sheet `Sale`, column `GST%` (formula `=IF(V4<2500,10.71%,15.2542%)*100`) | 12% or 18%, taken out of a tax-inclusive amount (10.71% is 12 over 112; 15.2542% is 18 over 118) | `NSV`, the net sale value of the line | 12% below 2,500, 18% from 2,500 |
| Vendor invoices dated Aug 2025 (what the vendor charged) | `MUFTI.xlsx` (22 Aug 2025): 12% on 89 lines with MRP 2,399 to 4,299, 5% on 8 lines with MRP 1,399 to 1,499. `ZILU BOTTOMS.xlsx` (28 Aug 2025): 5% on every line (MRP 599 to 1,499); a second unlabelled column shows 5 for MRP up to 799 and 12 for MRP 1,199 and above | the line rate (inferred) | about 1,000 in the unit rate (inferred) |
| Vendor invoice dated Oct 2025 | `BEEVEE 390.xlsx` (23 Oct 2025): 5% on 24 lines with MRP 1,049 to 2,199 | not stated | not stated |
| Vendor invoices dated 2026 | 5% on lines up to MRP 3,199 (`BLACKBERRY.xlsx`, `DEAL`, `STATUS QUO`, `Peter England.CSV` to MRP 2,625, `peppermint`, `BANJARAN`, the Jockey files); 18% on `DSY.xlsx` lines with MRP 5,490 to 5,920 (5% on its MRP 2,860 to 3,145); in the Madura extract 18% on 247 KDPS invoice lines (MRP 4,213 to 27,391) and 5% on 5,192 (MRP 799 to 4,299) | not stated | not stated |

- **Where they conflict.** Below the threshold the PT sheet says 5% and the daily sales report says 12%. The compared value differs too (cost, MRP, net sale value). The boundary differs (2,500 or 2,625, less than or equal against strictly less than). The vendor invoices of 2026 charge 5% on lines that the daily sales report would tax at 12%.
- The vendor invoices show what the vendor charged on a given date; they are not KDPS's own rule. Dates matter: the Aug 2025 invoices charge 12% where the 2026 ones charge 5% on similar prices.
- `MUFTI.xlsx` carries two extra unlabelled columns that follow the PT sheet's output rule (AA is 5 on every row; AB is 5 for MRP up to 2,625 and 18 above), next to its own `TAX_RATE` of 12 (see [pt-file-layouts.md](pt-file-layouts.md) 2.18).
- HSN codes seen in the vendor files are 6 or 8 digits and are not the same as the PT sheet's tax class; the PT sheet decides tax by item words, not by HSN.

## 11. Category codes in the POS data

The POS stock export has a `Category` column (187 spellings in `SOH REPORT FORMAT.xlsx`) and the POS sales exports have a `Sub Category` column that holds the same codes. It is a mix of words and short codes. It is not the master's `SUB CATEGORY` list.

- **Master sub-category words** (`CASUAL WEAR` 4,146, `SEASONAL WEAR` 1,881, `FORMAL WEAR` 1,430, `PARTY WEAR` 1,003, `ACCESSORIES` 398, `INNERWEAR` 260, `NIGHTWEAR` 83, `SPORTS WEAR` 60): 9,261 rows. Variants: `FORMAL WAER` 50, `PARTY WAER` 31, `WINTER WEAR` 104, `WINTER SET` 99, `TRADITIONAL WEAR` 41.
- **Stem plus a last letter M, E or P.** 35 stems (one to six letters) occur with at least two of the three last letters, for 12,159 rows. The last letter does not follow gender or colour tier in the data. It may be the price tier initial, `M` for `MEDIUM`, `E` for `ECONOMY`, `P` for `PREMIUM` (guess); the tier words are a `Color` value on other rows. The stems and their commonest items:

| Code stem | Last letters seen (rows) | Commonest item names (rows) |
| --- | --- | --- |
| `SET` | `E` 777, `M` 830, `P` 558 | `SET` 1,254, `BABA SUIT` 614, `FROCK` 81 |
| `US` | `E` 965, `M` 777, `P` 259 | `SHIRT` 1,801, `T-SHIRT` 76, `JEANS` 67 |
| `UT` | `E` 603, `M` 483, `P` 228 | `T-SHIRT` 1,199, `TOP` 57, `SWEAT SHIRT` 20 |
| `LJ` | `E` 390, `M` 621, `P` 135 | `JEANS` 1,018, `T-SHIRT` 73, `TROUSERS` 15 |
| `KUR` | `E` 329, `M` 482, `P` 298 | `KURTI` 452, `KURTA` 271, `KURTI SET` 213 |
| `SAREE` | `E` 303, `M` 283, `P` 281 | `SAREE` 866, `SET` 1 |
| `USS` | `E` 114, `M` 350, `P` 217 | `SWEAT SHIRT` 480, `SWEATER` 150, `JACKET` 35 |
| `UWJ` | `E` 31, `M` 293, `P` 215 | `JACKET` 478, `SWEAT SHIRT` 47, `SWEATER` 14 |
| `LT` | `E` 89, `M` 242, `P` 58 | `TROUSERS` 368, `T-SHIRT` 8, `JEANS` 7 |
| `TOP` | `E` 131, `M` 120, `P` 33 | `TOP` 256, `MIDDI` 16, `SET` 7 |
| `LL` | `E` 51, `M` 167, `P` 31 | `LOWER` 227, `T-SHIRT` 9, `LEGGINGS` 5 |
| `ACC` | `E` 83, `M` 113, `P` 46 | `BEDSHEET` 48, `SOCKS` 45, `BELT` 23 |
| `NIGH` | `E` 19, `M` 59, `P` 64 | `NIGHTY` 135, `NIGHT SUIT` 7 |
| `BLZ` | `E` 11, `M` 57, `P` 68 | `BLAZER` 129, `JACKET` 4, `JEANS` 2 |
| `U` | `E` 22, `M` 35, `P` 43 | `FROCK` 91, `TOP` 9 |
| `UP` | `E` 45, `M` 27, `P` 20 | `FROCK` 43, `MIDDI` 32, `TOP` 17 |
| `STL` | `E` 34, `M` 23, `P` 17 | `STOLE` 74 |
| `SUT` | `E` 22, `M` 36, `P` 11 | `SUIT` 69 |
| `CRD` | `E` 18, `M` 15, `P` 34 | `CARDIGAN` 67 |
| `SUIT` | `E` 5, `M` 15, `P` 38 | `SUIT` 53, `GOWN` 5 |
| `UK` | `M` 50, `P` 4 | `KURTA` 53, `T-SHIRT` 1 |
| `WC` | `E` 7, `M` 41 | `WAISTCOAT` 43, `WAIST COAT` 5 |
| `PANT` | `E` 32, `M` 11, `P` 3 | `PANT` 27, `HOT PANT` 19 |
| `BUN` | `E` 28, `M` 16 | `BUNDY SET` 31, `BUNDY` 13 |
| `CAP` | `E` 25, `M` 13 | `CAP` 38 |
| `GOW` | `E` 2, `M` 9, `P` 21 | `GOWN` 30, `SAREE` 2 |
| `LB` | `E` 12, `M` 9, `P` 11 | `SHORT` 22, `BOXER` 4, `LOWER` 3 |
| `UG` | `E` 6, `M` 13, `P` 13 | `T-SHIRT` 10, `VEST` 5, `BRA` 4 |
| `LEH` | `E` 6, `M` 14, `P` 9 | `LEHENGA` 29 |
| `SARE` | `E` 5, `M` 15 | `SAREE` 20 |

- Examples: `USM`, `USE`, `USP` (shirts: stem `US`), `SETE`, `SETM`, `SETP` (sets and baba suits), `UTP` (T-shirts), `KURP` (kurtis and kurtas), `ACCE` (accessories: socks, bedsheets, shorts).
- Codes whose stem is seen with only one last letter, and plain words (commonest first): `TOP` 75, `TRLE` 52, `JACKET` 27, `LSM` 25, `SET` 20, `ACC` 20, `PRINT` 20, `JEANS` 19, `FROCK` 19, `KURTIS` 18, `UJWM` 15, `COATP` 14, `SEM` 11, `SUIT` 10, `BLAZER` 10, `WORK` 10, `BUMP` 9, `BOTTAM` 9, `PROMO` 8, `KURTI` 7, `UKFE` 6, `UWCP` 5, `SKIRM` 4, `FROCKE` 4, `USWM` 4, `FEW` 3, `WSETE` 2, `UDM` 2, `SWAD` 2, `SHIRT` 1, `SUTIP` 1, `MIDDI` 1, `PANT` 1, `FORCK` 1, `EMBO` 1, `TPE` 1, `LEHNGA` 1, `SARARA` 1, `DUMKA` 1, `LPP` 1 and 4 more.
- Words that are item names, not categories: `JEANS` 19, `T-SHIRT` 3, `SHIRT` 1, `SUIT` 10, `BLAZER` 10, `FROCK` 19, `JACKET` 27, `BABA SUIT` 19, `SWEAT SHIRT` 7, `TRACK PANT` 4, `KURTI` 7 and others. Blank 20; `.` 3; `PROMO`, `PROMOTIONAL`, `PRINT`, `WORK`, `DUMKA` also occur.
- Pooled across all POS files the field has 262 distinct values (186 code-like, 76 words). The earlier analysts' `CAT_FIX` dictionary treated about 13 as valid codes (an analyst assumption, not a KDPS list).
- Because the same field holds a master word in one store and a code in another, the import must map it per source (`PRD-IMP-003`); neither the code list nor a meaning for each code is in the data (OPEN).

<details><summary>All 187 category values in the sample, with rows</summary>

`CASUAL WEAR` 4,146, `SEASONAL WEAR` 1,881, `FORMAL WEAR` 1,430, `PARTY WEAR` 1,003, `USE` 965, `SETM` 830, `SETE` 777, `USM` 777, `LJM` 621, `UTE` 603, `SETP` 558, `UTM` 483, `KURM` 482, `ACCESSORIES` 398, `LJE` 390, `USSM` 350, `KURE` 329, `SAREEE` 303, `KURP` 298, `UWJM` 293, `SAREEM` 283, `SAREEP` 281, `INNERWEAR` 260, `USP` 259, `LTM` 242, `UTP` 228, `USSP` 217, `UWJP` 215, `LLM` 167, `LJP` 135, `TOPE` 131, `TOPM` 120, `USSE` 114, `ACCM` 113, `WINTER WEAR` 104, `WINTER SET` 99, `LTE` 89, `ACCE` 83, `NIGHTWEAR` 83, `TOP` 75, `BLZP` 68, `NIGHP` 64, `SPORTS WEAR` 60, `NIGHM` 59, `LTP` 58, `BLZM` 57, `TRLE` 52, `LLE` 51, `FORMAL WAER` 50, `UKM` 50, `ACCP` 46, `UPE` 45, `UP` 43, `TRADITIONAL WEAR` 41, `WCM` 41, `SUITP` 38, `ONE PIECE` 36, `SUTM` 36, `UM` 35, `CRDP` 34, `STLE` 34, `TOPP` 33, `PANTE` 32, `LLP` 31, `PARTY WAER` 31, `UWJE` 31, `BUNE` 28, `JACKET` 27, `UPM` 27, `CAPE` 25, `LSM` 25, `STLM` 23, `SUTE` 22, `UE` 22, `GOWP` 21, `ACC` 20, `PRINT` 20, `SET` 20, `UPP` 20, (blank) 19, `BABA SUIT` 19, `FROCK` 19, `JEANS` 19, `NIGHE` 19, `CRDE` 18, `KURTIS` 18, `DUPE` 17, `LE` 17, `STLP` 17, `BUNM` 16, `CRDM` 15, `SAREM` 15, `SUITM` 15, `UJWM` 15, `COATP` 14, `LEHM` 14, `CAPM` 13, `CROP LHANGA` 13, `UGM` 13, `UGP` 13, `LBE` 12, `BLZE` 11, `LBP` 11, `PANTM` 11, `SEM` 11, `SUTP` 11, `ACCE.` 10, `BLAZER` 10, `SUIT` 10, `WORK` 10, `BOTTAM` 9, `BUMP` 9, `GOWM` 9, `LBM` 9, `LEHP` 9, `BOY SET` 8, `FULL SET` 8, `FWM` 8, `PROMO` 8, `PROMOTIONAL` 8, `SY SAREE` 8, `KURTI` 7, `SILK SAREE` 7, `SWEAT SHIRT` 7, `WCE` 7, `LEHE` 6, `UGE` 6, `UKFE` 6, `GUJRATI SET` 5, `SAREE` 5, `SUITE` 5, `UWCP` 5, `BABY SUIT` 4, `FROCKE` 4, `GIRLS SET` 4, `L DUPATTA` 4, `LDUP` 4, `SKIRM` 4, `THERM` 4, `TRACK PANT` 4, `UKP` 4, `USWM` 4, `.` 3, `DENIM SET` 3, `F SUIT` 3, `FEW` 3, `PANTP` 3, `SKIRT SET` 3, `T-SHIRT` 3, `BABY ROMPER` 2, `CARRY BAG` 2, `D WORK` 2, `FWP` 2, `GOWE` 2, `LDUE` 2, `LDUM` 2, `LM` 2, `PRINT  SAREE` 2, `SWAD` 2, `SY  SAREE` 2, `UDM` 2, `WSETE` 2, `COTM` 1, `DUMKA` 1, `DUPM` 1, `EMBO` 1, `FORCK` 1, `GIRL-SET` 1, `KIDS JACKET` 1, `KUR E` 1, `L TOP` 1, `LEHNGA` 1, `LPP` 1, `MIDDI` 1, `PAN.SHT.FULL` 1, `PANT` 1, `PLAZO SET` 1, `PRPMO` 1, `SAEREEE` 1, `SARARA` 1, `SHIRT` 1, `STALLP` 1, `SUTIP` 1, `TANAT SAREE` 1, `THERP` 1, `TPE` 1, `W TOP` 1

</details>


## 12. Brand to supplier

- `SUPPLIER BRAND DETAILS.xlsx` sheet `BRAND` maps each of 1,163 brands to at most one supplier (strictly one supplier per brand; 38 brands have none; 281 distinct suppliers).
- Concentration: `SSS` 176, `VARIETY TEXTILE` 175, `P M SONS` 127, `SHREE EMPORIUM` 35, `M R & COMPANY` 29, `OM GANPATI (DMK)` 28, `JAIN ADISHWAR HOSIERY WORKS` 27, `SARAOGI SUPER SALES` 21 brands. These look like distributors or agents (guess).
- **The stock export disagrees with the list.** Of 22,387 rows in `SOH REPORT FORMAT.xlsx`: the supplier equals the list's supplier for the brand on 16,763 rows (74.9%); it differs or is blank on 5,123 (22.9%); the brand is not in the list on 220 rows and the list gives no supplier for the brand on 281 rows. 105 of 778 brand spellings appear under more than one supplier in the export (my recount; the earlier survey counted 5,115 rows).
- **Madura legal-name variants.** In the supplier list `PETER ENGLAND` and 19 codes go to `MADURA PVT LTD`, and `ALLEN SOLLY` (three spellings), `LOUIS PHILIPPE` and `VAN HEUSEN WOMENS` to `ADITYA BIRLA LIFESTYLE BRANDS LIMITED`. In the stock export `PETER ENGLAND` is under `ADITYA BIRLA FASHION LTD` (654 rows), `ADITYA BIRLA LIFESTYLE BRANDS LIMITED` (582) and `MADURA PVT LTD` (193), and `ALLEN SOLLY` is under `ADITYA BIRLA LIFESTYLE BRANDS LIMITED` (813), `MADURA PVT LTD` (14) and `KDPS LIFESTYLE PVT LTD (DEOGHAR)` (4). Three Madura-group legal names occur in all: `ADITYA BIRLA LIFESTYLE BRANDS LIMITED` (1,425 rows), `ADITYA BIRLA FASHION LTD` (654), `MADURA PVT LTD` (431). Which legal entity invoices which brand, and for which period, is OPEN (Accounts).
- **KDPS as its own supplier.** `KDPS LIFESTYLE PVT LTD (DEOGHAR)` (876 rows), `KDPS LIFESTYLE PVT. LTD` (58) and `KDPS LIFESTYLE PVT LTD` (4): 938 rows under three spellings. It is not a supplier in the list. It reads as stock transferred in or own-label stock (guess).
- **Supplier spelling variants** in the export: `D S CREATION` / `DS CREATION`, the three `KDPS` spellings; in the list: `MN GARMENTS` / `M.N GARMENTS` (and `MN GARMENTS` against `M.N GARMENTS` in the `TWILLS.xls` file).
- Brand to supplier is many to one in the list and can be many to many over time in the data (a brand changes distributor). The party master keeps brands and suppliers apart and gives each its own dated role (`PRD-MER-001`; structure-and-masters 5.1, 5.2).

### 12.1 The supplier barcode flag

`SUPPLIER BRAND DETAILS.xlsx` sheet `BARCODE` has columns `Barcode` (`YES` or `NO`) and `Supplier`: 360 suppliers, 116 `YES` and 244 `NO`, each supplier once, none with both. It holds no barcodes. 79 of the 360 suppliers have no brand in the `BRAND` sheet; all 281 suppliers that do have one are in this list.

- Of the 1,125 brands that have a supplier, 834 (74%) sit under a `NO` supplier and 291 under a `YES` supplier.
- Largest `NO` suppliers by brands: `SSS` 176, `VARIETY TEXTILE` 175, `P M SONS` 127, `SHREE EMPORIUM` 35, `M R & COMPANY` 29, `PLAZER FABRICS` 17. Largest `YES`: `OM GANPATI (DMK)` 28, `JAIN ADISHWAR HOSIERY WORKS` 27, `SARAOGI SUPER SALES` 21, `MADURA PVT LTD` 20, `SANSKAR RETAIL` 20, `VISHAL MARKETING` 20, `MN GARMENTS` 12.
- `YES` includes Madura, Vishal Marketing (Spykar, Flying Machine, Arrow, US Polo), D D Sales (Killer), Om Ganpati (Lee, Jockey), D Apparel (Status Quo) and Aditya Birla.
- **What it implies (inferred).** In the stock export, rows whose supplier is flagged `NO` have a 7-digit barcode on 9,780 of 10,327 rows (94.7%); rows flagged `YES` have a valid EAN-13 on 7,075 of 11,102 (63.7%) and a 7-digit code on 597 (5.4%). So `NO` reads as: the supplier sends goods without a scannable barcode, and KDPS prints its own 7-digit label (the codes mostly start with 1). `YES` reads as: the goods arrive barcoded. This is a reading of the pattern, not a statement by KDPS.
- `YES` does not guarantee an EAN-13: suppliers flagged `YES` send 5-, 6-, 8- and 10-character codes in the vendor PT files (see [pt-file-layouts.md](pt-file-layouts.md) section 5).
- The 7-digit internal codes are PT-style codes that carry no checksum. In the Apparel OS design they are external codes of kind internal, kept as text so that leading zeros survive (structure-and-masters 4.3; `PRD-MER-006`, `PRD-MER-007`, `PRD-MER-008`).

## 13. Where this lands in the PRD and the masters design

| This note | Requirement or design |
| --- | --- |
| Seasons, genders, fits, sizes, sub categories, types, items, colours, brands (the drop-down lists) | `PRD-MER-004` (season, collection, launch date, gender, fabric, fit, category, HSN); structure-and-masters 4.1 (records) and 4.2 (vocabulary) |
| A new value or a source word | `PRD-MER-013`, `PRD-IMP-008`: proposal and independent confirmation; `PRD-IMP-009`: close matches offered, never filled from a guess |
| Source word to vocabulary value (`7-8Y` to `7-8 Y`, `FEAMLE` to `FEMALE`, `REGULER` to `REGULAR`) | `PRD-IMP-003`: saved, versioned mappings by source; original words kept beside the normalised value |
| Brand, supplier and agent kept apart | `PRD-MER-001`; structure-and-masters 5.1 |
| Colour and size make a SKU | `PRD-MER-002`, `POL-04.02`; `COLOR` holding a tier is not a colour |
| Missing size or season stays Unknown; `FREE SIZE` is a value | `PRD-MER-005`; `PRD-LIF-006` for an unknown historical season |
| Barcodes, supplier codes, leading zeros, aliases | `PRD-MER-006`, `PRD-MER-007`, `PRD-MER-008`; structure-and-masters 4.3 |
| Tax class by item word; GST % values | `PRD-PTW-012`, `POL-10.02`, `POL-10.05`, `POL-10.06`; `PRD-TAX-005` |
| Dropdowns and suggestions in the PT workbench | `PRD-PTW-003`, `PRD-PTW-012` |
| Every list-type attribute needs an approved vocabulary; the Organisation chooses which attributes exist | structure-and-masters 4.2, `GC2-9`; `PRD-ORG-011` |

## 14. Open questions

| # | Question | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | What does the month in a season label mean (lot or receipt month, launch month, season month)? Why do `SPRING SUMMER(Jul-25)` and `AUTUMN WINTER(Jan-26)` exist? Is `Oct-26` the last label, and who adds new ones? | Booking, KDPS Owner | Stage 1 vocabulary; stage 2 PT |
| 2 | Is `COLOR` meant to hold a colour or a price tier? What assigns a tier (`PREMIUM`, `MEDIUM`, `ECONOMY`), per brand, per item or per price? Where will the real colour live? | Booking, KDPS Owner | Stage 2 PT; SKU identity |
| 3 | What do the fit codes `LM`, `MM`, `HM`, `VLM`, `VHM` mean, and the last letters `M`, `E`, `P` of the category codes (`USM`, `USE`, `USP`)? | Booking | Stage 1 vocabulary |
| 4 | Which category code list does KDPS want (the master sub categories, the POS codes, or a new tree)? Is `SUB CATEGORY` a category or an attribute? | Booking, KDPS Owner | Stage 1 vocabulary |
| 5 | What do the brand codes `AK`, `AL`, `AH`, `AT`, `LA`, `LX`, `PJ`, `N`, `RE`, `AY` and `PT` stand for, and are the `V ` and `FS-` prefixes variants of the brand before them? | Booking, with Madura | Stage 1 brand master |
| 6 | Which spelling of each brand is the approved one (`US POLO` or `U. S. POLO`, `BLACKBERRYS`, `GOCOLORS`, `KILLER JUNIOR` or `JUNIOR KILLER`), and may the alias groups of section 3.2 be merged by KDPS-approved mapping rules? | Booking, Accounts | Stage 1 brand master |
| 7 | Which legal entity invoices Peter England, Allen Solly, Louis Philippe and Van Heusen (`MADURA PVT LTD`, `ADITYA BIRLA LIFESTYLE BRANDS LIMITED`, `ADITYA BIRLA FASHION LTD`), and from when? | Accounts | Party master; stage 2 receiving |
| 8 | What does the supplier barcode flag `YES` or `NO` mean, and who prints barcodes and tickets for `NO` suppliers (the 7-digit codes starting with 1)? | Booking, Operations | Stage 2 labels |
| 9 | GST: which rate and which compared value apply (5% or 12% below the threshold; cost, MRP or net sale value; 2,500 or 2,625; less than or less than or equal)? Which of the PT sheet, the daily sales report and the vendor invoices is current? Is the `TAX FREE` value used, and for which goods? | CA, Accounts | Stage 2 PT tax; stage 4 counter tax |
| 10 | Are the 98 items the intended item list? Which of the POS item words (`SET`, `COAT`, `WINTER SET`, `WAISTCOAT`, `HOT PANT`, `SARARA`) become items, and are accessories, jewellery, electronics and toiletries in scope? | Booking | Stage 1 vocabulary |
| 11 | Is the size list one list or one per category (`PRD-MER-002` asks for category-specific size sets)? What do the odd codes `AS`, `EES`, `EL`, `ES`, `EXL`, `EXS` mean, and what unit do the plain numbers carry? | Booking | Stage 1 size sets |
| 12 | What do the `KDPS LIFESTYLE PVT LTD (DEOGHAR)` rows in the supplier column of the stock export represent (internal transfer, own stock)? | Accounts, Operations | Stage 3 transfers |

See also [open-questions.md](open-questions.md) for the full list across all data notes.
