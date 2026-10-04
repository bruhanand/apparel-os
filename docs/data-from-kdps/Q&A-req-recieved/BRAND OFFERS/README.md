# BRAND OFFERS

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [Q&A-req-recieved](../README.md)

## What this folder is

The brand offers that KDPS gave the ERP team in answer to item 3 of `MOM_S.xlsx` ("LAST MONTHS BRAND OFFERS", provider Priyo, status DONE, note "MADURA PENDING"; see [Q&A-req-recieved](../README.md)). It has two kinds of material:

- `BRAND OFFERS.xlsx`: a spreadsheet of offers for the non-Madura brands (US Polo, US Polo Kids, Flying Machine, Arrow, Spykar, Linen Club, Blackberry, Mufti, Killer, Libas, Parx, Sweet Dreams). Probably compiled by KDPS from the brands' offer calendars and artwork (guess; the file does not say who made it). It looks like a Google Sheets export.
- Screenshots of brand emails for the four Madura brands: Allen Solly, Louis Philippe, Peter England, Van Heusen. They were made on a phone and forwarded to KDPS staff. They are not KDPS documents. One sub-folder per brand. They are the way the "Madura pending" items were supplied (inferred from file dates: all saved on 13 Jun 2026, after the 11 Jun checklist).
- Three PNG crops of the Allen Solly emails sit beside the spreadsheet.

Everything here is a record of what brands offered. Nothing in it says how offers combine, who pays for them, or which style lists they cover. Those are open (see the end).

## Files in this folder

| File or folder | What it is |
| --- | --- |
| `BRAND OFFERS.xlsx` | Offer spreadsheet, 7 sheets (below). Saved 13 Jun 2026 01:51 |
| `ALLEN SOLLY-1.png` (597 x 453) | Crop of the table of the May Allen Solly email (12 + 5 rows) |
| `ALLEN SOLLY-2.png` (562 x 58) | Crop of the June email table (one row) |
| `ALLEN SOLLY-3.png` (559 x 396) | Crop of the April email tables (10 + 5 + 1 rows) |
| `ALLEN SOLLY/` | 3 screenshots (April, May, June). See [ALLEN SOLLY](ALLEN%20SOLLY/README.md) |
| `LOUIS PHILLIPE/` | 2 screenshots of one email. See [LOUIS PHILLIPE](LOUIS%20PHILLIPE/README.md) |
| `PETER ENGLAND/` | 3 screenshots (one is a Louis Philippe copy). See [PETER ENGLAND](PETER%20ENGLAND/README.md) |
| `VAN HEUSEN/` | 5 email screenshots and 2 artwork images. See [VAN HEUSEN](VAN%20HEUSEN/README.md) |
| `.DS_Store` | macOS folder file, not data |

The PNGs repeat the content of the Allen Solly JPEG screenshots (same rows, same words). Their file names say "-1", "-2", "-3" but they are May, June and April in that order. The Allen Solly README lists every row.

## `BRAND OFFERS.xlsx`

Seven sheets. The sheet dimensions include blank formatted cells; the real data sizes are below.

| Sheet | Data rows | Shape |
| --- | --- | --- |
| `USPS-FM-ARROW-LC-SPYKAR` | 104 (rows 2 to 105) | Eight columns with a header row |
| `BLACKBERRY` | 13 rows (a title, a column-name row and 11 offers) | Free text, two columns, no header row |
| `MUFTI` | 22 | Three columns, no header row |
| `KILLER` | 6 (rows 2 to 7) | Header `START DATE`, `OFFERING`, `END DATE` |
| `LIBAS` | 9 | Seven columns with a header row |
| `PARX` | 6 | Seven columns with a header row |
| `SWEET DREAMS` | 4 | Seven columns with a header row |

No hidden sheets, rows or columns. No comments. The first sheet is identical, cell for cell in columns A to H and rows 1 to 105, to the sheet `OFFER DETAILS.` in `KDPS INVOICE & OFFER DETAILS..xlsx` at the top of the data folder (see [data-from-kdps](../../README.md)). So the offer list exists twice.

### Sheet `USPS-FM-ARROW-LC-SPYKAR`

- Header row 1: `Brand Name`, `Offer Type`, `Season`, `Offer Details`, `Offer Starting Date`, `Offer Closing Date`, `Offer Status`, `Offer Artwork`.
- 104 offer lines. By brand (names as written): `U. S. POLO` 20, `U. S. POLO KIDS` 22, `FLYING MACHINE` 18, `ARROW` 18, `SPYKAR` 18, `LINEN CLUB` 8.
- By `Offer Type`: `EOSS` 51, `ATV` 37, `GWP` 11, `FRESH` 5.
- By `Season`: `AW'25` 83, `SS'26` 21.
- By `Offer Status`: `CLOSED` 90, `STILL RUNNING` 9, `NO OFFER` 5 (the five `FRESH` rows).
- Dates are real date cells. Start dates run from 3 Sep 2025 to 11 Jun 2026. Closing dates run from 10 Oct 2025 to 11 Jun 2026. Nine rows have the text `Not Disclosed Yet.` in the closing-date column (a text value in a date column). They are the nine `STILL RUNNING` rows.
- `Offer Artwork`: 80 cells filled. 74 are hyperlinks to PDF artwork on Google Drive (the links are not copied here; each shows a descriptive file name such as the brand, the offer and the season). 13 merged ranges let one PDF cover the three slab rows of one offer. `NO ARTWORK` appears 5 times (the `FRESH` rows). `ARTWORK NOT RECEIVED` appears once (the US Polo trolley gift, row 95).
- The text of `Offer Details` is free text with typos: `0FF` (zero for the letter O), `MRR` for MRP (Spykar denim rows), `TROLLY`, `SUPPER SKINNY`, `ARTWOEK` in a file name, a mix of `B1-20%`, `B1 20`, `BUY 1-20%`, `BUY-2-30%`. The details below keep the text as written.
- A stray note sits to the right of row 54 (Linen Club, third EOSS, 25 Dec 2025 to 2 Feb 2026), in two unlabelled cells: `NSV - 24lakh 1% 28lakh 2% 34lakh 3%` and `Deo 1staff`. It reads like a staff incentive slab on net sale value for one Store ("Deo" is probably Deoghar and "1staff" one staff member) (guess). It is not an offer.

Notation used in `Offer Details` (not defined in the file; readings are guesses):

- `B1-20%`, `B2-30%`: buy 1 gets 20% off, buy 2 or more gets 30% off. Whether the higher percentage applies to every piece or only the second is not stated.
- `B2-G1`, `B3-G2`, `B2G2`, `B1G1`: buy 2 get 1, buy 3 get 2, buy 2 get 2, buy 1 get 1. Which piece is free is not stated.
- `BUY 14999/- GET 3000/- 0FF`: a bill-value slab (spend 14,999, get 3,000 off). The file calls these `ATV`. Some `ATV` rows are count based (`BUY 2 GET 750/- OFF`, Linen Club) or percentage based (Spykar).
- `SU#BZ Flat-30%`: suits and blazers at a flat 30% (guess). `JCK,SWS,SWE`: jackets, sweatshirts and sweaters (guess).
- `GWP`: gift with purchase, here a bag at a token price after a spend (`BUY 7999/- & GET A DUFFEL BAG WORTH 4999/- FOR 499/-`).
- `EOSS`: end-of-season sale. `FRESH`: a full-price launch period with no offer (`FRESH SALE PERIOD`, status `NO OFFER`).

The offer lines, grouped by brand. "Rows" are spreadsheet row numbers. One table row stands for the slabs of one offer period that share dates and artwork. Slabs are separated by semicolons.

#### U. S. POLO

| Rows | Type | Season | From | To | Status | Offer details (as written) |
| --- | --- | --- | --- | --- | --- | --- |
| 2-4 | GWP | AW'25 | 6 Sep 2025 | 10 Oct 2025 | CLOSED | `BUY 7999/- & GET A DUFFEL BAG WORTH 4999/- FOR 499/-` ; `BUY 10999/- & GET A BACKPACK WORTH 6999/- FOR 699/-` ; `BUY 16999/- & GET A TROLLEY WORTH 7999/- FOR 799/-` |
| 17-19 | ATV | AW'25 | 11 Oct 2025 | 10 Dec 2025 | CLOSED | `BUY 16999/- GET 3000/- 0FF` ; `BUY 12999/- GET 2000/- 0FF` ; `BUY 7999/- GET 1000/- 0FF` |
| 41 | EOSS | AW'25 | 12 Dec 2025 | 18 Dec 2025 | CLOSED | `B1-20% & B2-30%` |
| 45 | EOSS | AW'25 | 19 Dec 2025 | 23 Dec 2025 | CLOSED | `B1-20%, B2-G1, B3-G2 # (JACKET/SWEATER – B1-20%, B2-30%)` |
| 49 | EOSS | AW'25 | 24 Dec 2025 | 3 Jan 2026 | CLOSED | `B1-20%, B2-30%, B2-G2` |
| 55 | EOSS | AW'25 | 4 Jan 2026 | 8 Jan 2026 | CLOSED | `B1-20%, B2-30%, B3-40%` |
| 62 | EOSS | AW'25 | 9 Jan 2026 | 15 Jan 2026 | CLOSED | `B1-20%, B2-30%, B2-G2` |
| 66 | EOSS | AW'25 | 16 Jan 2026 | 22 Jan 2026 | CLOSED | `B1-30%, B2-40%, B2-G2` |
| 70 | EOSS | AW'25 | 23 Jan 2026 | 26 Jan 2026 | CLOSED | `B1-30%, B2-40%, B2-G2, (JCK,SWS,SWE - Flat-40%)` |
| 74 | EOSS | AW'25 | 27 Jan 2026 | 29 Jan 2026 | CLOSED | `B1-30%, B2-40%, (JCK,SWS,SWE - Flat-40%)` |
| 80 | EOSS | AW'25 | 30 Jan 2026 | 6 Feb 2026 | CLOSED | `B1-30%, B2-40%, B2-G2` |
| 84 | EOSS | AW'25 | 7 Feb 2026 | 15 Feb 2026 | CLOSED | `B1-30%, B2-40%, (JCK,SWE,SWS - Flat 40%)` |
| 88 | FRESH | SS'26 | 16 Feb 2026 | 16 Apr 2026 | NO OFFER | `FRESH SALE PERIOD` |
| 93-95 | GWP | SS'26 | 17 Apr 2026 | Not Disclosed Yet. | STILL RUNNING | `BUY 8999/- & GET A BACKPACK WORTH 4999/- FOR 499/-` ; `BUY 11999/- & GET A DUFFEL BAG WORTH 6999/- FOR 699/-` ; `BUY 19999/- & GET A TROLLEY WORTH 8999/- FOR 899/-` |

#### U. S. POLO KIDS

| Rows | Type | Season | From | To | Status | Offer details (as written) |
| --- | --- | --- | --- | --- | --- | --- |
| 5-7 | GWP | AW'25 | 6 Sep 2025 | 10 Oct 2025 | CLOSED | `BUY 5999/- & GET A SCHOOL BAG WORTH 3995/- FOR 499/-` ; `BUY 7999/- & GET A SCHOOL BAG + TIFFIN CASE WORTH 4995/- FOR 699/-` ; `BUY 10999/- & GET A TROLLY WORTH 7995/- FOR 799/-` |
| 20-22 | ATV | AW'25 | 11 Oct 2025 | 31 Oct 2025 | CLOSED | `BUY 10999/- GET 2000/- 0FF` ; `BUY 6999/- GET 1000/- 0FF` ; `BUY 3999/- GET 500/- 0FF` |
| 29-31 | ATV | AW'25 | 1 Nov 2025 | 10 Dec 2025 | CLOSED | `BUY 10999/- GET 2000/- 0FF` ; `BUY 5999/- GET 1000/- 0FF` ; `BUY 3999/- GET 500/- 0FF` |
| 42 | EOSS | AW'25 | 12 Dec 2025 | 18 Dec 2025 | CLOSED | `B1-20% & B2-30%` |
| 47 | EOSS | AW'25 | 19 Dec 2025 | 23 Dec 2025 | CLOSED | `B1-20%, B2-30%, B2-G2` |
| 50 | EOSS | AW'25 | 24 Dec 2025 | 3 Jan 2026 | CLOSED | `B1-20%, B2-30%, B2-G2` |
| 57 | EOSS | AW'25 | 4 Jan 2026 | 8 Jan 2026 | CLOSED | `B1-20%, B2-30%, B3-40%` |
| 63 | EOSS | AW'25 | 9 Jan 2026 | 15 Jan 2026 | CLOSED | `B1-20%, B2-30%, B3-40%` |
| 67 | EOSS | AW'25 | 16 Jan 2026 | 22 Jan 2026 | CLOSED | `B1-30%, B2-40%, B2-G2` |
| 71 | EOSS | AW'25 | 23 Jan 2026 | 26 Jan 2026 | CLOSED | `B1-30%, B2-40%, B3-50%` |
| 75 | EOSS | AW'25 | 27 Jan 2026 | 29 Jan 2026 | CLOSED | `B1-30%, B2-40%, (JCK,SWS,SWE - Flat-40%)` |
| 81 | EOSS | AW'25 | 30 Jan 2026 | 6 Feb 2026 | CLOSED | `B1-30%, B2-40%, B3-50%` |
| 85 | EOSS | AW'25 | 7 Feb 2026 | 15 Feb 2026 | CLOSED | `B1-30%, B2-40%, (JCK,SWE,SWS - Flat 40%)` |
| 89 | FRESH | SS'26 | 16 Feb 2026 | 16 Apr 2026 | NO OFFER | `FRESH SALE PERIOD` |
| 96-97 | GWP | SS'26 | 17 Apr 2026 | Not Disclosed Yet. | STILL RUNNING | `BUY 7995/- & GET A BACKPACK WORTH 4999/- FOR 599/-` ; `BUY 12995/- & GET A TROLLEY WORTH 7999/- FOR 799/-` |

#### FLYING MACHINE

| Rows | Type | Season | From | To | Status | Offer details (as written) |
| --- | --- | --- | --- | --- | --- | --- |
| 8-10 | ATV | AW'25 | 8 Sep 2025 | 31 Oct 2025 | CLOSED | `BUY 14999/- GET 3000/- 0FF` ; `BUY 10999/- GET 2000/- 0FF` ; `BUY 5999/- GET 1000/- 0FF` |
| 26-28 | ATV | AW'25 | 1 Nov 2025 | 10 Dec 2025 | CLOSED | `BUY 10999/- GET 2000/- 0FF` ; `BUY 5999/- GET 1000/- 0FF` ; `BUY 3999/- GET 500/- 0FF` |
| 38 | EOSS | AW'25 | 11 Dec 2025 | 18 Dec 2025 | CLOSED | `BUY 1-20% & BUY-2-30%` |
| 48 | EOSS | AW'25 | 19 Dec 2025 | 23 Dec 2025 | CLOSED | `B1-20%, B2-30%, B2-G2` |
| 52 | EOSS | AW'25 | 24 Dec 2025 | 3 Jan 2026 | CLOSED | `B1-20%, B1-G1` |
| 58 | EOSS | AW'25 | 4 Jan 2026 | 8 Jan 2026 | CLOSED | `B1-30%, B2-40%` |
| 61 | EOSS | AW'25 | 9 Jan 2026 | 15 Jan 2026 | CLOSED | `B1 20, B1-G1` |
| 65 | EOSS | AW'25 | 16 Jan 2026 | 22 Jan 2026 | CLOSED | `B1 20, B1-G1` |
| 69 | EOSS | AW'25 | 23 Jan 2026 | 26 Jan 2026 | CLOSED | `B1-40%, B2-50%` |
| 73 | EOSS | AW'25 | 27 Jan 2026 | 29 Jan 2026 | CLOSED | `B1-30%, B2-40%, (JCK,SWS,SWE - Flat-40%)` |
| 79 | EOSS | AW'25 | 30 Jan 2026 | 6 Feb 2026 | CLOSED | `B1-40%, B2-50%` |
| 83 | EOSS | AW'25 | 7 Feb 2026 | 15 Feb 2026 | CLOSED | `B1-40%, B2-50%` |
| 87 | FRESH | SS'26 | 16 Feb 2026 | 16 Apr 2026 | NO OFFER | `FRESH SALE PERIOD` |
| 98 | ATV | SS'26 | 17 Apr 2026 | Not Disclosed Yet. | STILL RUNNING | `BUY 4999/- GET 500/- OFF & BUY 6999/- GET 1000/- OFF` |

#### ARROW

| Rows | Type | Season | From | To | Status | Offer details (as written) |
| --- | --- | --- | --- | --- | --- | --- |
| 11-13 | ATV | AW'25 | 8 Sep 2025 | 31 Oct 2025 | CLOSED | `BUY 16999/- GET 3000/- 0FF` ; `BUY 12999/- GET 2000/- 0FF` ; `BUY 6999/- GET 1000/- 0FF` |
| 23-25 | ATV | AW'25 | 1 Nov 2025 | 10 Dec 2025 | CLOSED | `BUY 14999/- GET 3000/- 0FF` ; `BUY 10999/- GET 2000/- 0FF` ; `BUY 6999/- GET 1000/- 0FF` |
| 43 | EOSS | AW'25 | 12 Dec 2025 | 18 Dec 2025 | CLOSED | `B1-20% & B2-30%` |
| 46 | EOSS | AW'25 | 19 Dec 2025 | 23 Dec 2025 | CLOSED | `B1-20%, B2-G1, B3-G2 (SU#BZ FLAT-30%)` |
| 51 | EOSS | AW'25 | 24 Dec 2025 | 3 Jan 2026 | CLOSED | `B1-20%, B2-30%, B2-G2 (SU#BZ Flat-30%)` |
| 56 | EOSS | AW'25 | 4 Jan 2026 | 8 Jan 2026 | CLOSED | `B1-20%, B2-30%, B3-40%, (SU#BZ Flat-30%)` |
| 60 | EOSS | AW'25 | 9 Jan 2026 | 15 Jan 2026 | CLOSED | `B1-20%, B2-30%, B2-G2 (SU#BZ Flat-30%)` |
| 64 | EOSS | AW'25 | 16 Jan 2026 | 22 Jan 2026 | CLOSED | `B1-30%, B2-40%, B2-G2, (SU#BZ Flat-40%)` |
| 68 | EOSS | AW'25 | 23 Jan 2026 | 26 Jan 2026 | CLOSED | `B1-30%, B2-40%, B3-50%, (SU#BZ Flat-40%)` |
| 72 | EOSS | AW'25 | 27 Jan 2026 | 29 Jan 2026 | CLOSED | `B1-30%, B2-40%, (JCK,SWS,SWE - Flat-40%)` |
| 78 | EOSS | AW'25 | 30 Jan 2026 | 6 Feb 2026 | CLOSED | `B1-30%, B2-40%, B3-50%, (SU#BZ Flat-40%)` |
| 82 | EOSS | AW'25 | 7 Feb 2026 | 15 Feb 2026 | CLOSED | `B1-30%, B2-40%, (JCK,SWE,SWS - Flat 50%) (SU#BZ - FLAT 40%)` |
| 86 | FRESH | SS'26 | 16 Feb 2026 | 2 Mar 2026 | NO OFFER | `FRESH SALE PERIOD` |
| 92 | ATV | SS'26 | 3 Mar 2026 | Not Disclosed Yet. | STILL RUNNING | `BUY 4999/- & GET 500/-, BUY 6999/- & GET 1000/-, BUY 12999/- & GET 2000/-, BUY 16999/- & GET 3000/-` |

#### SPYKAR

| Rows | Type | Season | From | To | Status | Offer details (as written) |
| --- | --- | --- | --- | --- | --- | --- |
| 32 | ATV | AW'25 | 24 Sep 2025 | 27 Nov 2025 | CLOSED | `BUY 14999/- GET 20% 0FF , BUY 7999/- GET 15% 0FF` |
| 33-34 | ATV | AW'25 | 28 Nov 2025 | 30 Nov 2025 | CLOSED | `MEN'S B2G2 OR BUY 2 GET 30% OFF, BUY 1 GET 20% OFF` ; `WOMEN'S B2G2 OR BUY 2 GET 30% OFF, BUY 1 GET 20% OFF` |
| 35-36 | ATV | AW'25 | 1 Dec 2025 | 10 Dec 2025 | CLOSED | `MEN'S BUY 4 GET 40% OFF, BUY 2 GET 30% OFF, BUY 1 GET 20% OFF` ; `WOMEN'S BUY 4 GET 40% OFF, BUY 2 GET 30% OFF, BUY 1 GET 20% OFF` |
| 39-40 | EOSS | AW'25 | 11 Dec 2025 | 24 Dec 2025 | CLOSED | `MEN'S BUY 1 GET 30% OFF, BUY 2 GET 40% OFF & BUY 4 GET 50% OFF` ; `WOMEN'S BUY 1 GET 40% OFF, BUY 2 GET 50% OFF` |
| 53 | EOSS | AW'25 | 25 Dec 2025 | 5 Jan 2026 | CLOSED | `MEN'S BUY 1 GET 40% OFF & BUY 3 GET 50% OFF` |
| 59 | EOSS | AW'25 | 6 Jan 2026 | 28 Jan 2026 | CLOSED | `MEN'S BUY 2 GET 50% OFF & BUY 1 GET 40% OFF` |
| 76 | EOSS | AW'25 | 29 Jan 2026 | 22 Feb 2026 | CLOSED | `FLAT 50% OFF` |
| 77 | FRESH | SS'26 | 23 Feb 2026 | 26 Feb 2026 | NO OFFER | `FRESH SALE PERIOD` |
| 90-91 | ATV | SS'26 | 27 Feb 2026 | 27 May 2026 | CLOSED | `MEN'S BUY 15999/- GET 3000/- OFF, BUY 12999/- GET 2000/- OFF & BUY 7999/- GET 1000/- OFF` ; `WOMEN'S BUY 4999/- GET 1000/- OFF & BUY 2999/- GET 500/- OFF` |
| 100-102 | ATV | SS'26 | 15 May 2026 | 27 May 2026 | CLOSED | `BUY 3 DENIMS IN KANO/SUPPER SKINNY/SKINNY FIT (MRR RS.2999 & ABOVE) & GET RS.2000` ; `BUY 2 DENIMS IN KANO/SUPPER SKINNY/SKINNY FIT (MRR RS.2999 & ABOVE) & GET RS.1200` ; `BUY 1 DENIMS IN KANO/SUPPER SKINNY/SKINNY FIT (MRR RS.2999 & ABOVE) & GET RS.500` |
| 103 | EOSS | SS'26 | 28 May 2026 | 11 Jun 2026 | CLOSED | `BUY 2 GET 1 FREE & BUY 1 & GET 20% OFF` |
| 105 | EOSS | SS'26 | 11 Jun 2026 | Not Disclosed Yet. | STILL RUNNING | `B1G1 & FLAT 40%` |

#### LINEN CLUB

| Rows | Type | Season | From | To | Status | Offer details (as written) |
| --- | --- | --- | --- | --- | --- | --- |
| 14-16 | ATV | AW'25 | 3 Sep 2025 | 22 Apr 2026 | CLOSED | `BUY 2 GET 750/- OFF` ; `BUY 3 GET 1250/- OFF` ; `BUY 4 GET 2000/- OFF` |
| 37 | EOSS | AW'25 | 8 Dec 2025 | 18 Dec 2025 | CLOSED | `B1-20%, B2-30%, OR B3 & ABOVE 40%` |
| 44 | EOSS | AW'25 | 19 Dec 2025 | 24 Dec 2025 | CLOSED | `BUY 1 - 25%, BUY 2 & ABOVE - 40%` |
| 54 | EOSS | AW'25 | 25 Dec 2025 | 2 Feb 2026 | CLOSED | `BUY 1 - 25%, BUY 2 - 40%, & BUY 3 - 50%` |
| 99 | ATV | SS'26 | 23 Apr 2026 | 10 Jun 2026 | CLOSED | `BUY 2 GET 1000/- OFF, BUY 3 GET 1500/- OFF & BUY 4 GET 2000/- OFF` |
| 104 | EOSS | SS'26 | 11 Jun 2026 | Not Disclosed Yet. | STILL RUNNING | `BUY 1-30%,BUY 2-40% & B2G2` |

Observations from these rows (facts of the data; the file states no rule):

- Each brand follows a similar calendar: gift offers or bill-value slabs first (Sep to Dec 2025), then weekly or fortnightly end-of-season steps that deepen (for example B1 20% and B2 30%, then B1 30% and B2 40%, then B3 50%), then a fresh full-price period (US Polo, US Polo Kids and Flying Machine from 16 Feb to 16 Apr 2026; Arrow from 16 Feb to 2 Mar; Spykar from 23 to 26 Feb), and then SS'26 bill-value or gift offers.
- The 18 Flying Machine rows are also shown as a table screenshot, `FM-offer-list.jpeg` (file date 27 May 2026), in the April and May monthly-reports folder. It shows the same 18 rows as this sheet (see [monthly-reports-april-may-2026](../../monthly-reports-april-may-2026/README.md)).
- At each date change a new row begins; the old row closes. The rows do not say whether the old offer is cancelled or may still be claimed.
- Overlaps in the data: Linen Club's AW'25 `ATV` (3 Sep 2025 to 22 Apr 2026) runs through all three of its AW'25 `EOSS` periods. Spykar's SS'26 `ATV` (27 Feb to 27 May 2026) overlaps its denim `ATV` (15 to 27 May). Spykar's `EOSS` closes 11 Jun 2026 and the next `EOSS` starts 11 Jun 2026 (a shared day).
- Gap days: on 11 Dec 2025 US Polo, US Polo Kids and Arrow have no row (the `ATV` closes 10 Dec and the `EOSS` opens 12 Dec). Linen Club has no `EOSS` or other row between 3 Feb and 22 Apr 2026 beyond its long `ATV`.
- Category and gender limits appear inside the text: Spykar men's and women's slabs differ; `SU#BZ` and `JCK,SWS,SWE` exceptions; denim only in `KANO/SUPPER SKINNY/SKINNY FIT` with MRP Rs 2,999 and above.

### Sheet `BLACKBERRY`

Free text with no header. Row 1 is the title `Promo Offers for Fresh MRP sale.` Row 2 is `ITEM PROMO SLAB for New Duffle bags & Trolleys` with the second column named `Remarks`. Dates are written `dd/mm` with no year.

| Row | Offer text (column A) | Remark (column B) |
| --- | --- | --- |
| 3 | `SHOP FOR RS. 6999/- AND GET RS. 600/ OFF (EXCLUDING FOOTWEAR, SUITS, BLAZERS, ZIPPER JACKETS)` | `In case of unavailability of Duffle Bag` |
| 4 | `SHOP FOR RS. 10999/- AND GET RS. 1000/ OFF (Including all categories Except Suits)` | |
| 5 | `SHOP FOR RS. 14999/- AND GET RS. 1500/ OFF (Including all categories)` | |
| 6 | `SHOP FOR RS. 19999/- AND GET RS. 2000/ OFF (Including all categories)` | `In case of unavailability of Trolley Bag` |
| 7 | `SHOP FOR Rs. 6995/- AND GET DUFFEL BAG of Rs. 2995/- AT Rs. 99/- (EXCLUDING AFI AND S&J)` | `As per availability.` |
| 8 | `SHOP FOR RS. 22999/- AND GET TROLLEY WORTH RS. 7995/- AT RS. 399/- (INCLUDING ALL CATEGORIES)` | `As per availability.` |
| 9 | `BUY 1 @ 20% OFF / BUY 2 OR MORE @ 30% OFF` | `Start Date 12/12 - End Date 16/12` |
| 10 | `BUY 1 - 20% / BUY 2 - 30% / BUY 3 - 40%` | `Start Date 17/12 - End Date 22/01` |
| 11 | `BUY 1 - 30% / BUY 2 - 40% / BUY 3 - 50%` | `Start Date 23/01 - End Date 15/02` |
| 12 | `BUY 6999/- GET 600/- OFF, BUY 10999/- GET 1000/- OFF, BUY 14999/- GET 1500/- OFF, BUY 19999/- GET 2000/- OFF, BUY 22999/- GET TROLLY FOR 399/-` | `Start Date 16/02 - End Date 11/06` |
| 13 | `B1 - 30% / B2 & B3 - 40% / B4 & MORE - 50% / 25% - 40 % ON WAIST COAT, SUIT AND BLAZER (AMM LIST)` | `Start Date 12/06 - End Date` |

- The rows read as a timeline: 12 Dec to 16 Dec, 17 Dec to 22 Jan, 23 Jan to 15 Feb, 16 Feb to 11 Jun, then from 12 Jun with no end. The years are not written; Dec 2025 to Jun 2026 is inferred from the sequence.
- Rows 3 to 8 are the "fresh MRP sale" slabs with bag gifts. The remark in rows 3 and 6 gives a fallback: if the bag is not available, the cash-off amount applies. Rows 7 and 8 say "As per availability", so the gift offer depends on stock.
- Row 13 mentions an AMM list for waistcoat, suit and blazer. Row 7 excludes `AFI` and `S&J` (not defined; `S&J` is probably suits and jackets, guess).

### Sheet `MUFTI`

No header. Three columns: start date, offer, end date. The date cells are a mix of text (`dd-mm-yyyy`) and real dates. Where a cell holds a real date, day and month look swapped (for example the end of row 2 is stored as 6 Nov 2025 but the chain of dates shows it means 11 Jun 2025). The table gives the cells as stored and the reading that the date chain supports (an inference; text cells are read as written).

| Row | Start (as stored) | End (as stored) | Offer (as written) | Reading: from | Reading: to |
| --- | --- | --- | --- | --- | --- |
| 1 | `14-03-2025` (text) | `23-05-2025` (text) | `BUY 17999GET 3000 OFF` | 14 Mar 2025 | 23 May 2025 |
| 2 | `23-04-2025` (text) | date 6 Nov 2025 | `B-2-g1` | 23 Apr 2025 | 11 Jun 2025 |
| 3 | date 6 Dec 2025 | date 7 Apr 2025 | `B3-G3` | 12 Jun 2025 | 4 Jul 2025 |
| 4 | date 6 Dec 2025 | date 7 Apr 2025 | `B1-25%` | 12 Jun 2025 | 4 Jul 2025 |
| 5 | date 6 Dec 2025 | date 7 Apr 2025 | `B2-40%` | 12 Jun 2025 | 4 Jul 2025 |
| 6 | date 6 May 2025 | date 7 Jul 2025 | `B1-G1` | 5 Jun 2025 (see note) | 7 Jul 2025 |
| 7 | date 6 May 2025 | `17-07-2025` (text) | `B1-30%` | 5 Jun 2025 (see note) | 17 Jul 2025 |
| 8 | `18-07-2025` (text) | `20-08-2025` (text) | `flat -50%` | 18 Jul 2025 | 20 Aug 2025 |
| 9 | date 9 May 2025 | date 11 May 2025 | `BUY 7999GET 1000 OFF` | 5 Sep 2025 | 5 Nov 2025 |
| 10 | date 9 May 2025 | date 11 May 2025 | `BUY 12999GET 2000 OFF` | 5 Sep 2025 | 5 Nov 2025 |
| 11 | date 9 May 2025 | date 11 May 2025 | `BUY 17999GET 3000 OFF` | 5 Sep 2025 | 5 Nov 2025 |
| 12 | date 11 Jun 2025 | `26-11-2025` (text) | `flat10% on 7999` | 6 Nov 2025 | 26 Nov 2025 |
| 13 | date 11 Jun 2025 | `26-11-2025` (text) | `flat15% on 15999` | 6 Nov 2025 | 26 Nov 2025 |
| 14 | `27-11-2025` (text) | `27-11-2025` (text) | `Black Friday Offer B2G1` | 27 Nov 2025 | 27 Nov 2025 |
| 15 | `28-11-2025` (text) | `30-11-2025` (text) | `Black Friday Offer B2G40, B1G20` | 28 Nov 2025 | 30 Nov 2025 |
| 16 | date 12 Jan 2025 | date 12 Oct 2026 | `1-10% / 2-20% / 3-30%` | 1 Dec 2025 | 10 Dec 2025 (end year stored as 2026, a typo) |
| 17 | date 12 Nov 2025 | `31-12-2025` (text) | `1-25% / 2-40% / 4-50%` | 11 Dec 2025 | 31 Dec 2025 |
| 18 | date 1 Jan 2026 | `21-01-2026` (text) | `B1 25% / B2 50%` | 1 Jan 2026 | 21 Jan 2026 |
| 19 | `22-01-2026` (text) | `22-02-2026` (text) | `Flat -50%` | 22 Jan 2026 | 22 Feb 2026 |
| 20 | `13-03-2026` (text) | `27-05-2026` (text) | `Purchase for 7999/- and get 1000/- off Purchase for 12999/- and get 2000/- off Purchase for 17999/- and get 3000/- off` | 13 Mar 2026 | 27 May 2026 |
| 21 | `28-05-2026` (text) | date 6 Nov 2026 | `B2 - G1` | 28 May 2026 | 11 Jun 2026 |
| 22 | date 6 Dec 2026 | (blank) | `B2 - G2 / B2 - 40% / B1-25%` | 12 Jun 2026 | open |

- Note on rows 6 and 7: read the same way, the start is 5 Jun 2025, which overlaps rows 3 to 5 (12 Jun to 4 Jul). A typo for 5 Jul 2025 would fit the chain (guess). The intended date is not certain.
- The Mufti timeline has bill-value slabs (Rs 7,999 gets 1,000 off; 12,999 gets 2,000; 17,999 gets 3,000), count-based percentages, buy-N-get-N, flat 50%, Black Friday and flat percentages above a spend.
- There is no gap row for 23 Feb to 12 Mar 2026.

### Sheet `KILLER`

Header `START DATE`, `OFFERING`, `END DATE` (row 1). Dates are text with `dd-mm-yyyy` and `dd.mm.yyyy`. A date appears only on the first row of each block; the blank cells below it belong to the same period.

| Row | Start date | Offering | End date |
| --- | --- | --- | --- |
| 2 | `21-02-2026` | `500 OFF ON 4995` | |
| 3 | | `1000 OFF ON 6995` | |
| 4 | | `2000 OFF ON 10995` | `05.06.2026` |
| 5 | `06.06.2026` | `BUY 1 @ 20% OFF` | |
| 6 | | `BUY 2 @ 30% OFF` | |
| 7 | | `BUY 2 GET 2` | |

### Sheets `LIBAS`, `PARX`, `SWEET DREAMS`

Header row 1: `Brand Name`, `Offer Type`, `Season`, `Offer Details`, `Offer Starting Date`, `Offer Closing Date`, `Offer Status` (the seven-column layout of the first sheet without the artwork column). Dates are real date cells.

`LIBAS` (9 rows), season `SS'26`:

| Row | Type | Offer details | From | To | Status |
| --- | --- | --- | --- | --- | --- |
| 2 | Promo | `Shop for 2999 Get 500 Off` | 12 Mar 2026 | 30 Apr 2026 | Closed |
| 3 | Promo | `Shop for 4999 Get 1000 Off` | 12 Mar 2026 | 30 Apr 2026 | Closed |
| 4 | Promo | `Shop for 8999 Get 2000 Off` | 12 Mar 2026 | 30 Apr 2026 | Closed |
| 5 | Promo | `Flat 20% on Selected Style` | 20 Apr 2026 | 30 Apr 2026 | Closed |
| 6 | Promo | `B110%,B225% NOT ON NOD` | 1 May 2026 | 6 May 2026 | Closed |
| 7 | Promo | `B110%,B230% NOT ON NOD` | 7 May 2026 | 18 May 2026 | Closed |
| 8 | EOSS | `B130%,B240% ON ALL` | 19 May 2026 | 31 May 2026 | Closed |
| 9 | EOSS | `FLAT 30%& 40% ACCORDING SHEET` | 1 Jun 2026 | 4 Jun 2026 | Closed |
| 10 | EOSS | `B1 30% B2 40%` | 5 Jun 2026 | 23 Jun 2026 | STILL RUNNING |

`PARX` (6 rows), season `SS'26`, brand written `Parx`, type `Promo` on every row:

| Row | Offer details | From | To | Status |
| --- | --- | --- | --- | --- |
| 2 | `Shop for 4999 Get 500 Off` | 3 Mar 2026 | 4 Jun 2026 | CLOSED |
| 3 | `Shop for 7499 Get 750 Off` | 3 Mar 2026 | 4 Jun 2026 | CLOSED |
| 4 | `Shop for 11999 Get 1250 Off` | 3 Mar 2026 | 4 Jun 2026 | CLOSED |
| 5 | `B 1 20% B 2 & More 30%(Applicable before December 2025 Suit blazer)` | 5 Jun 2026 | 11 Jun 2026 | CLOSED |
| 6 | `B1 20, B2G1, B3G1` | 12 Jun 2026 | (blank) | STILL RUNNING |
| 7 | `Suit & blazer 20%` | 12 Jun 2026 | (blank) | STILL RUNNING |

`SWEET DREAMS` (4 rows), season `SS'26`, brand written `SweetDreams`, type `Promo`:

| Row | Offer details | From | To | Status |
| --- | --- | --- | --- | --- |
| 2 | `Flat 20% off` | 9 May 2026 | 10 May 2026 | CLOSED |
| 3 | `Buy 2 And Above 20%` | 6 Jun 2026 | 7 Jun 2026 | CLOSED |
| 4 | `Flat - 20% off` | 13 Jun 2026 | (blank) | STILL RUNNING |
| 5 | `Mrp 3249 to 3649 - Flat 2599` | 13 Jun 2026 | (blank) | STILL RUNNING |

- Libas uses `NOT ON NOD` (NOD is not defined here; the Allen Solly emails also use NOD).
- Libas rows 2 to 4 and Parx rows 2 to 4 are bill-value slabs labelled `Promo`, not `ATV`. Parx row 5 mentions December 2025 and suit-blazer in one line; its meaning is not clear.
- The Libas, Parx and Sweet Dreams statuses use mixed case (`Closed`, `CLOSED`).

## Latest state by brand (as of the files, June 2026)

| Brand | Latest row in this folder | From | To |
| --- | --- | --- | --- |
| Libas | `B1 30% B2 40%` | 5 Jun 2026 | 23 Jun 2026 |
| Parx | `B1 20, B2G1, B3G1`; `Suit & blazer 20%` | 12 Jun 2026 | open |
| Sweet Dreams | `Flat - 20% off`; `Mrp 3249 to 3649 - Flat 2599` | 13 Jun 2026 | open |
| Killer | `BUY 1 @ 20% OFF`, `BUY 2 @ 30% OFF`, `BUY 2 GET 2` | 6 Jun 2026 | open |
| Mufti | `B2 - G2 / B2 - 40% / B1-25%` | 12 Jun 2026 (reading) | open |
| Blackberry | Tiered B1 30%, B2 and B3 40%, B4 and more 50%; 25% to 40% on waistcoat, suit, blazer (AMM list) | 12 Jun (no year) | open |
| Spykar | `B1G1 & FLAT 40%` | 11 Jun 2026 | open |
| Linen Club | `BUY 1-30%,BUY 2-40% & B2G2` | 11 Jun 2026 | open |
| Arrow | Bill-value slab, 4999 gets 500, 6999 gets 1000, 12999 gets 2000, 16999 gets 3000 | 3 Mar 2026 | open |
| US Polo | Gift offers (backpack, duffel, trolley) | 17 Apr 2026 | open |
| US Polo Kids | Gift offers (backpack, trolley) | 17 Apr 2026 | open |
| Flying Machine | Bill-value slab, 4999 gets 500, 6999 gets 1000 | 17 Apr 2026 | open |
| Allen Solly | Percentage and bill-value lists; June adds men's `B1@30%` | 1 Apr 2026 (list), 10 to 18 Jun (flat) | further communication |
| Louis Philippe | Buy 1 get 30% and flat suit prices; bill-value Rs 750 off on MRP 7999 | 4 Feb 2026, 11 Apr, 21 May | not shown |
| Peter England | `B1@30%` on AMM merchandise, bill-value slabs | 1 Jun 2026 | 22 Jun 2026 |
| Van Heusen | Percentage, flat prices, bill-value and gifts | 19 Mar 2026 (one row) | until further communication |

"open" means the file has no closing date (blank, or `Not Disclosed Yet.`). It does not say the offer is still valid today.

## The Madura brand sub-folders

| Brand | Files | What they hold |
| --- | --- | --- |
| Allen Solly (AS) | 3 JPEG | April (1st April, 10 + 5 + 1 rows), May (1st May, 12 + 5 rows), June (men's `B1@30%` 10 to 18 June) |
| Louis Philippe (LP) | 2 JPEG | One email table with 9 rows (4 Feb, 11 Apr, 21 May); the second image is a crop of the same email |
| Peter England (PE) | 3 JPEG | A 1 to 22 Jun 2026 table with 10 rows, an earlier undated version, and a copy of the Louis Philippe email |
| Van Heusen (VH) | 5 JPEG + 2 artwork | A 17-row offer table, a 4-row gift table, a revision from "750 additional shopping" to "750 off", and a 19 Mar 2026 start for "buy 2 get 1000 off" |

- Offers in these emails are tied to style lists called "AMM" (percentage offers) and "NOD" (gift and some bill-value offers). The lists were not sent. "As per AMM list" appears on most Van Heusen rows and PE says the offers apply only to the attached list.
- The brand email screenshots show brand trade staff names, mobile numbers and mailing lists. They are not copied into the READMEs.

## What the data says about combining offers

No file states whether offers combine. The data shows:

- Percentage offers and bill-value offers cover different style lists in the Allen Solly and Libas wording (AMM against NOD). They may not compete (guess).
- Within one brand some rows overlap with no stated winner: Van Heusen row 10 (buy 2 get 1000 off at brand level) against flat 40% on VF; Allen Solly's men's AMM slab and its suits and blazers slab, which may both cover suits; Linen Club bill-value slab against its percentage tiers; Spykar's two bill-value slabs in May.
- Explicit exclusions: Van Heusen leaves out T-shirts at MRP 1099 and 1299 from some offers; Louis Philippe leaves out winter wear from the "Buy 1 Get 30%" row; Blackberry excludes footwear, suits, blazers and zipper jackets from the Rs 6,999 slab.
- Gift and bag offers depend on stock ("As per availability", "wherever stock has been sent"), and Blackberry gives a cash fallback when the bag is not available.
- Whether a "shop for X" threshold counts MRP or the net bill is stated only by Louis Philippe (MRP).

The PRD supports percentage, flat-value, buy-X-get-Y and basket-value offers (`PRD-OFR-001`), keeps combination rules, source and brand or company cost shares on an approved offer (`PRD-OFR-002`), and gives the customer the largest total discount from the permitted set when offers may not combine (`PRD-OFR-021`). The data above does not state which offers may combine.

## Related notes

- Offer vocabulary, the offer timeline and the brand reports built from it: [offers-and-brand-reports.md](../../../data-notes/offers-and-brand-reports.md).
- Brand to supplier map and the Madura two-letter brand codes: [item-master-vocabulary.md](../../../data-notes/item-master-vocabulary.md) and [purchases-and-supplier-notes.md](../../../data-notes/purchases-and-supplier-notes.md). In `SUPPLIER BRAND DETAILS.xlsx`: `FLYING MACHINE`, `ARROW` and `SPYKAR` map to VISHAL MARKETING; `U S POLO` to OM GANPATI (DMK); `LINEN CLUB` to B.K ENTERPRISES; `MUFTI` to SHRING APPARELS; `KILLER` to D D SALES CO; `BLACKBERRY` to MOHAN CLOTHING COMPANY; `LIBAS` to TAYAL GARMENTS; `PARX` to AAYUSHMAN AGENCIES; `SWEET DREAMS` to DD APPAREL.
- The April and May 2026 brand sales reports that carry an offer column: [monthly-reports-april-may-2026](../../monthly-reports-april-may-2026/README.md).
- `report-offer.md` at the top of the data folder is an English translation of a call (about 19 Jun 2026) about the dummy Blackberry and Mufti offer report: offers applied from the AMM list at the best percentage; wish to club sales across days for the best benefit; refresh weekly or fortnightly. See [data-from-kdps](../../README.md).

## Open questions

- Brand manager (P-BRM) or KDPS Owner: do any offers combine (percentage with bill-value; brand offer with a Store or manual discount)? Blocks Stage 4 (store day: offers and price lists).
- Product owner: is a bill-value slab measured on MRP or on the net bill, and is the threshold per bill, per brand or per sub-brand? Blocks Stage 4.
- Product owner: what do AMM, NOD, HOAS, HOVH, ATV, ABV and `PE GST benefit` mean? Please send the style-code lists. Blocks Stage 4.
- Brand manager (P-BRM): which source is authoritative for each brand offer (artwork, calendar sheet or email)? What are the missing months (Peter England May, Louis Philippe April, Van Heusen dates, years of the Blackberry rows)? Blocks Stage 4.
- KDPS Owner or Accounts: who funds each offer, and how is brand support claimed? Offer approval keeps brand and company cost shares (`PRD-OFR-002`). Blocks Stage 4.
- KDPS Owner: is the `NSV - 24lakh 1% 28lakh 2% 34lakh 3%` / `Deo 1staff` note a staff incentive slab? Blocks Stage 6 (people and planning), where incentives are designed.
- Product owner: Mufti rows 6 and 7 (start date 5 Jun or 5 Jul 2025) and the Mufti date cells that show swapped day and month need confirming before any import. Blocks Stage 4 (history for reports).
