# Offers and brand reports

> **Not ranked.** These notes describe the data KDPS sent. They decide nothing. A PRD or policy change they lead to needs an entry in [decisions.md](../decisions.md) first. See [README.md](README.md).

This note covers the offer data KDPS sent, the AMM list, and the monthly brand reports:

- **Brand offers.** What KDPS and its brands call an offer, every mechanic seen, and every offer in the files, brand by brand.
- **The AMM list.** A Louis Philippe style list with a `Discount` or `No Discount` flag per style.
- **Monthly brand reports.** The sales and stock lists KDPS builds each month for brands from its POS exports.

Source folders:

- Offers: [BRAND OFFERS](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/README.md), with [ALLEN SOLLY](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/ALLEN%20SOLLY/README.md), [LOUIS PHILLIPE](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/LOUIS%20PHILLIPE/README.md), [PETER ENGLAND](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/PETER%20ENGLAND/README.md) and [VAN HEUSEN](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/VAN%20HEUSEN/README.md).
- Brand reports: [monthly-reports-april-may-2026](../data-from-kdps/monthly-reports-april-may-2026/README.md), with [2026-04](../data-from-kdps/monthly-reports-april-may-2026/2026-04/README.md), [2026-04/DATA](../data-from-kdps/monthly-reports-april-may-2026/2026-04/DATA/README.md), [2026-05](../data-from-kdps/monthly-reports-april-may-2026/2026-05/README.md) and [2026-05/data](../data-from-kdps/monthly-reports-april-may-2026/2026-05/data/README.md).
- June brand files: [brand-analysis-report](../data-from-kdps/brand-analysis-report%20/README.md), with [blackberry](../data-from-kdps/brand-analysis-report%20/blackberry/README.md) and [mufti](../data-from-kdps/brand-analysis-report%20/mufti/README.md).
- Related notes: [stores-and-codes.md](stores-and-codes.md) (bill-series prefixes and store names), [pos-exports.md](pos-exports.md) (the POS export layouts), [data-quality-and-import-rules.md](data-quality-and-import-rules.md), [analyses-and-metrics.md](analyses-and-metrics.md), [prd-fit.md](prd-fit.md) and [open-questions.md](open-questions.md).

How to read this note:

- A statement marked **(guess)** or **(inferred)** is not in the files. It is a reading of them.
- The earlier analyst work (the `BRAND REPORT` sheet, the two `.skill` files, the formulas in `KDPS-DIRECTION.xlsx`, the single rate of 30 in the April vouchers) holds **analyst assumptions, not KDPS decisions**. None of it is an ERP setting.
- Offer terms here are brand terms sent to KDPS. KDPS's own choices on offers (which may combine, who pays) are not in any file. `POL-19.01` says no combination rule is assumed, and `POL-19.02` says no cost share is assumed.
- **OPEN** marks a question the data cannot answer, with its owner. The owners are the PRD personas: KDPS Owner (`P-OWN`), Brand manager (`P-BRM`), Accounts (`P-ACC`), the CA (`P-CHA`), Operations (`P-OPS`), and the product owner.
- Names, phone numbers and email addresses in the email screenshots are not copied. Customer, salesperson and staff details in the POS exports are not copied either.
- Spellings are as in the files, typos included (`0FF` with a zero, `MRR`, `TROLLY`).
- Terms such as ATV, EOSS, GWP, AMM and NOD are not in the PRD's "Words used" tables. A new term goes there first (`AGENTS.md`).

## 1. Offer vocabulary

The files never define their own terms. The "Meaning" column says where the data shows a meaning; otherwise the meaning is a **(guess)** or **OPEN**.

| Term | Where it appears | What the data shows | Meaning |
| --- | --- | --- | --- |
| `EOSS` | `Offer Type` on 51 of the 104 lines of `BRAND OFFERS.xlsx`; the Libas, Spykar and Linen Club SS'26 rows | Percent tiers and buy-get deals that deepen every one to three weeks: 8 Dec 2025 to 22 Feb 2026 (season `AW'25`), then again from 28 May 2026 (`SS'26`). The drop-down list `DN TYPE` in `KDPS DEBIT & CREDIT NOTE DETAILS.xlsx` has the value `EOSS CREDIT NOTES`; no data row uses it | End of season sale (guess). `PRD-OFR-004` also speaks of end-of-season price lists. The list value suggests brands credit KDPS for the sale (guess) |
| `ATV` | `Offer Type` on 37 lines | Used for three shapes: bill-value slabs (`BUY 14999/- GET 3000/- 0FF`), count slabs with an amount off (`BUY 2 GET 750/- OFF`, Linen Club) and count slabs with a percentage (`BUY 4 GET 40% OFF`, Spykar) | Not defined. Average transaction value, an offer meant to raise the bill (guess). OPEN, owner Brand manager |
| `ABV` | Allen Solly, Peter England and Louis Philippe emails | Always a spend threshold with a cash-off: `Shop for 5999 and get 1000rs off`, `new ABV offer added` (LP, 21 May: `Shop for MRP 7999 and get 750 Off`) | Not defined. Average bill value, the same idea as `ATV` (guess). OPEN, owner Brand manager |
| `GWP` | `Offer Type` on 11 lines (U. S. Polo, U. S. Polo Kids) | A bag, backpack or trolley sold at a token price after a spend: `BUY 7999/- & GET A DUFFEL BAG WORTH 4999/- FOR 499/-`. The gift is not free | Gift with purchase (guess). The same mechanic has other names: `Promo`, `PROMO` (Allen Solly, Libas), `Bag Offer` (Peter England) and "item promo slab" (Blackberry) |
| `FRESH` | 5 lines with status `NO OFFER`; `Fresh` in `KDPS LIFE.xlsx` (184 items) | `FRESH SALE PERIOD`: the weeks after a season launches. U. S. Polo, U. S. Polo Kids and Flying Machine: 16 Feb to 16 Apr 2026; Arrow: 16 Feb to 2 Mar; Spykar: 23 to 26 Feb. In `KDPS LIFE.xlsx` the tag marks items that get no discount. Blackberry's `OFFER` sheet still lists "Promo Offers for Fresh MRP sale" (bill-value slabs and bags) | A full-price period with no percentage offer (inferred from the status). OPEN: whether bill-value or gift promos may run in such a period; Blackberry shows they do |
| `Promo`, `PROMO` | `Offer Type` on the Libas, Parx and SweetDreams sheets; the Allen Solly emails | Covers spend cash-off (`Shop for 2999 Get 500 Off`), count percentages (Parx) and gifts at a token price (`Shop for 4999, get a school bag at 99/-`) | Not defined. The word names several different mechanics |
| `B1-20%`, `B2-30%`, "B1@20% B2@30%", "B2 or more @ 40%" | Nearly every brand | The number of items bought sets the percentage. Written `B1-20%`, `B1@20%`, `B1 20`, `B1 20%`, `Buy 1 @ 20% off`, `1-25%` | `B` is buy (inferred). Whether the higher rate applies to every item or only to the Nth is OPEN (section 4). In Blackberry's June POS lines the top rate sits on every qualifying line |
| `B1G1`, `B1-G1`, `B2G1`, `B2-G1`, `B2G2`, `B2-G2`, `B3-G3`, `B2 GET 2` | U. S. Polo, Flying Machine, Arrow, Spykar, Mufti, Killer, Linen Club, Parx, Allen Solly | Buy N, get M free. In Mufti's June POS lines a free unit appears as a line at 100%. In all 8 June bills with a 100% line it is the lowest-priced line on the bill | `G` is get-free (inferred). In `B1-20%, B2-G1, B3-G2` (U. S. Polo, 19 to 23 Dec 2025) the number of free items grows with the number bought |
| `B2@1599` | Peter England, 1 to 22 Jun 2026, category `Tie` | A price point for a pair of ties | Buy 2 at 1,599 (guess). OPEN: 1,599 in total or each |
| "shop for X get Y off", "buy X get Y off" | Allen Solly, Libas, Parx, Blackberry, Van Heusen, Peter England, Flying Machine, Arrow | Spend X on the bill and get Y rupees off. Louis Philippe writes `Shop for MRP 7999` | A bill-value slab. OPEN: whether X counts MRP or the price after other discounts (section 4) |
| "flat price" | Louis Philippe suits (`Flat 7999 ( MRP till 13000 )`), Van Heusen (`Flat – 4999`, men's blazers), Peter England (`Flat price Off on S&B AMM (599/1999/2999/5999/8999/12999)`), SweetDreams (`Mrp 3249 to 3649 - Flat 2599`) | A fixed selling price for a band of MRP or a type of goods. For Peter England the wording could also mean a fixed amount off | A fixed price per unit (inferred for LP, VH, SweetDreams). OPEN for Peter England |
| `Flat 40%`, `FLAT 50% OFF` | Spykar, Mufti, Allen Solly, Van Heusen, Libas | One percentage on every unit, whatever the count | Flat percentage (inferred) |
| `AMM` | Allen Solly, Louis Philippe, Peter England, Van Heusen and Blackberry offers; `16_AMM List dtd 20.01.26.xlsb` | A style-code list the brand keeps. Offers marked `AMM` apply only to listed styles (Peter England: "AMM offers are only applicable on the attached list of style codes"). Louis Philippe's email has a `Remarks` column with `AMM`, `NON AMM` and `All Codes`. In the list file every style has a flag `Discount` or `No Discount` (section 5) | Not expanded in any file. A list of styles open to the brand's discount scheme (guess). OPEN: expansion, owner of the list, refresh rule. Owner Brand manager |
| `NOD` | Allen Solly (`HOAS NOD codes`, `All NOD KIDS Style codes`, `Men's NOD style codes`); Libas (`NOT ON NOD`); all 3,443 rows of the cached Arvind AW'25 EOSS tag list inside `KDPS-DIRECTION.xlsx` | A second style tag. At Allen Solly the bill-value offers and gifts sit on `NOD` codes and the percent offers on `AMM` codes. Libas' count percentages exclude `NOD` in May 2026 | No Discount, the styles kept out of percentage markdown and given spend offers instead (guess). It fits the AMM list's `No Discount` flag. OPEN, owner Brand manager |
| `HOAS`, `HOVH` | Allen Solly: `HOAS NOD codes`, `HOAS (Selected partners, wherever stock is available)`. Van Heusen: `HOVH` on `B1 @ 20%`, `B2 & Abv @ 30%` and `Shop for 7999 and get 750 off` | A channel or format group inside the brand. The offer or the gift applies to it | House of Allen Solly and House of Van Heusen, the brands' own store formats (guess). OPEN: which KDPS Stores belong to each (Operations) |
| `VS`, `VD`, `VX`, `VF`, `VW` | Van Heusen: `Applicable Sub Brand: VS,VD , VX & VF`; `Flat @ 40%` on `VF`; `Shop for 4999 and get 750 off` on `VW` | The two letters begin Van Heusen style codes (`VDSF…`, `VXKC…`, `VSSF…`, `VHSF…`). In the Hazaribagh files the brand `VAN HEUSEN WOMENS` carries `VW` styles. The same pattern is seen for Louis Philippe (`LP`, `LY`, `LR`, `LX`, `LA`), Peter England (`PE`, `PJ`, `PX`, `PC`, `PI`) and Allen Solly (`AS`, `AB` on `ALLEN SOLLY JUNIOR`, `AH` on `ALLEN SOLLY WOMENS`, `AL`, `AT`) | Sub-brand or line codes (inferred from the style codes). What each line is (`VF`, `VX`, `VS`) is OPEN, owner Brand manager |
| `PE TR MBO ABV` | Peter England, 1 to 22 Jun 2026, category `Bundle Offer`: `GET Rs 1000 OFF ON SHOPPING OF Rs 4999`, `GET Rs 1999 OFF ON SHOPPING OF Rs 9999` | An `ABV` offer for Peter England labelled `TR` and `MBO` | `MBO` is multi-brand outlet (inferred): `LIST OF ALL STORES.xlsx` names five stores `MBO` (Sahebgunj, Dumka, Bokaro, Gaya, Kankarbagh). `TR` is OPEN, owner Brand manager (the AMM list has a reason `TR Line - No Discount`) |
| `PE GST benefit` | Peter England, 1 to 22 Jun 2026, category `GST benefit`: `11.02%`, `6.25%`, `FLAT` | Three lines, no explanation. The percentages equal 1 − 1.05 ÷ 1.18 = 11.02% and 1 − 1.05 ÷ 1.12 = 6.25%: the fall in price when GST on a piece drops from 18% or 12% to 5%. `KDPS-DIRECTION.xlsx` links to an outside table (`FM APPAREL A4.xlsx`, copy cached inside) with `Old GST Rate`, `New GST Rate` and `GST DIFF` (section 6.7) | A pass-on of a GST rate change to the customer (inferred from the arithmetic). Not stated in any file. OPEN, owners Accounts and the CA |
| `SU#BZ` | Arrow EOSS rows: `SU#BZ Flat-30%`, `SU#BZ - FLAT 40%` | Suits and blazers get a flat percentage while other goods follow the count tiers. A `#` also marks an exception in a U. S. Polo row: `# (JACKET/SWEATER – B1-20%, B2-30%)` | Suits and blazers (inferred; Peter England and Parx write `S&B` and `Suit & blazer`) |
| `JCK`, `SWS`, `SWE` | U. S. Polo, U. S. Polo Kids, Arrow and Flying Machine EOSS rows, 23 Jan to 15 Feb 2026: `(JCK,SWS,SWE - Flat-40%)`, Arrow `Flat 50%` from 7 Feb | A flat percentage on three goods inside a tiered offer | Jacket, sweatshirt, sweater (inferred: Peter England's June email lists `Jacket , Sweater , Sweatshirt` under `Flat 50% on AMM Merch`) |
| `NOT ON NOD` | Libas, 1 to 18 May 2026: `B110%,B225% NOT ON NOD`, `B110%,B230% NOT ON NOD` | The count percentages (read B1 10%, B2 25%, then B2 30%) apply to styles outside `NOD`. The next rows (`B130%,B240% ON ALL`) apply to all | See `NOD`. There is no space or sign between the count and the rate, so `B110%` is also open to misreading |
| "as per availability" | Blackberry `OFFER` sheet (`As per availability.`); Allen Solly (`wherever stock is available`, `wherever stock has been sent`); Blackberry `In case of unavailability of Duffle Bag` | The gift part of an offer holds only while the bag, trolley or fanny pack is in stock or has been sent to the Store. Blackberry gives a cash-off when the bag is not available | The offer lasts as long as the gift stock lasts (inferred). Where the stock is counted is not stated. OPEN, owner Operations |
| `S&B`, `S&J`, `AFI` | Peter England (`S&B`); Blackberry (`EXCLUDING AFI AND S&J`) | Category groups used in exclusions | `S&B` is suits and blazers (inferred). `S&J` and `AFI` are not explained. OPEN, owner Brand manager |
| `NSV` | A stray note beside the Linen Club EOSS row of 25 Dec 2025 to 2 Feb 2026: `NSV - 24lakh 1% 28lakh 2% 34lakh 3%` and `Deo 1staff` | In the Singh More daily sales report `NSV` is the sum of a line's tenders (net sale value, inferred) | A staff incentive slab on net sale value (guess): 1% at 24 lakh, 2% at 28 lakh, 3% at 34 lakh. Who it pays, and what `Deo 1staff` means, is OPEN, owners KDPS Owner and HR. See `PRD-HRM-010` |
| `CORE`, `OCOR`, `Old Core`, `ROC` | The AMM list `Season`; the Arvind list (`CORE` 2,976 rows, `OCOR` 467); `KDPS LIFE.xlsx` column `R/F` (`FASHION` 859, `ROC` 48; all 48 `ROC` items are tagged `Fresh`) | Style groups that sit outside the seasonal range | Core and old core (guess). `ROC` is OPEN, owner Brand manager |
| `Further communication`, `Till further communication`, `Not Disclosed Yet.` | Allen Solly and Van Heusen emails; 9 lines of `BRAND OFFERS.xlsx` (text in the `Offer Closing Date` column) | The offer has no close date | Open-ended |
| `Q code` | Two columns of the AMM list | The first holds the style plus `Q`; the second repeats the flag | See section 5 |

## 2. Offer mechanics catalogue

Every distinct mechanic seen, with one real example. "Source" keys are in section 3.

| # | Mechanic | One real example | What the data leaves unclear |
| --- | --- | --- | --- |
| 1 | Count tiers, percentage | U. S. Polo, 4 to 8 Jan 2026: `B1-20%, B2-30%, B3-40%` (`BO`) | Whether the higher rate applies to all items or only the Nth |
| 2 | "And above" tier | Blackberry, 12/12 to 16/12: `BUY 1 @ 20% OFF / BUY 2 OR MORE @ 30% OFF`; Allen Solly, Apr and May 2026: `B2 or more @ 40%` | Whether items of different categories count together |
| 3 | Tier with a step missing | Mufti, 11 to 31 Dec 2025: `1-25% / 2-40% / 4-50%` | The rate for three items |
| 4 | Buy N, get M free | Mufti, 28 May to 11 Jun 2026: `B2 - G1` | Which unit is free. In the POS lines it is the lowest-priced one |
| 5 | Free items that grow with the count | U. S. Polo, 19 to 23 Dec 2025: `B1-20%, B2-G1, B3-G2` | Whether the rates and the free items stack |
| 6 | Free item or percentage, same dates ("X OR Y") | Spykar, 28 to 30 Nov 2025: `MEN'S B2G2 OR BUY 2 GET 30% OFF, BUY 1 GET 20% OFF`; Linen Club, 8 to 18 Dec 2025: `B1-20%, B2-30%, OR B3 & ABOVE 40%` | Who chooses: the customer, the cashier or the best result |
| 7 | Count tiers, amount off | Linen Club, 3 Sep 2025 to 22 Apr 2026: `BUY 2 GET 750/- OFF`, `BUY 3 GET 1250/- OFF`, `BUY 4 GET 2000/- OFF` | Count of units or of bills |
| 8 | Count tiers on a product condition | Spykar, 15 to 27 May 2026: `BUY 3 DENIMS IN KANO/SUPPER SKINNY/SKINNY FIT (MRR RS.2999 & ABOVE) & GET RS.2000` (2 denims: 1,200; 1 denim: 500) | `MRR` is read as MRP |
| 9 | Bill-value slab, amount off | Flying Machine, 8 Sep to 31 Oct 2025: `BUY 14999/- GET 3000/- 0FF`, `10999/- GET 2000/-`, `5999/- GET 1000/-` | Basis (MRP or net); whether the threshold itself qualifies |
| 10 | Bill-value slab, percentage off | Spykar, 24 Sep to 27 Nov 2025: `BUY 14999/- GET 20% 0FF , BUY 7999/- GET 15% 0FF` | Same |
| 11 | Percentage at one price point | Mufti, 6 to 26 Nov 2025: `flat10% on 7999`, `flat15% on 15999` | Whether the rate applies to the bill or to a single piece at that price |
| 12 | Flat percentage, any count | Spykar, 29 Jan to 22 Feb 2026: `FLAT 50% OFF`; Mufti, 22 Jan to 22 Feb 2026: `Flat -50%` | None |
| 13 | Flat percentage on named goods inside a tiered offer | U. S. Polo, 23 to 26 Jan 2026: `B1-30%, B2-40%, B2-G2, (JCK,SWS,SWE - Flat-40%)` | Whether the flat rate replaces the tiers for those goods |
| 14 | Flat percentage by gender or category | Allen Solly, from 1 Apr 2026: `Flat 40% off on Women AMM bags`; Van Heusen: `Flat @ 30%` on `Acc Men's`, `Flat @ 25%` on `Women's Bags`, `Flat @ 40%` on `Winterwear – Men-Women` | None |
| 15 | Flat price by MRP band | Louis Philippe suits, from 11 Apr (year not written): `Flat 7999 ( MRP till 13000 )`, `Flat 9999 ( MRP between 13001 to 18000 )`, `Flat 12999 ( MRP Greater than 18001 )` | An MRP of exactly 18,001 is in no band as written |
| 16 | Flat price by type of goods | Van Heusen: `Flat – 4999` men's blazers, `Flat – 9999` two-piece suits, `Flat – 12999` three-piece suits, `Flat-999` T-shirt MRP 1099 | None |
| 17 | Price for a pair | Peter England, 1 to 22 Jun 2026: `B2@1599`, ties | Total or each |
| 18 | MRP band to a fixed price | SweetDreams, from 13 Jun 2026: `Mrp 3249 to 3649 - Flat 2599` | None |
| 19 | Gift at a token price after a spend | U. S. Polo, 6 Sep to 10 Oct 2025: `BUY 7999/- & GET A DUFFEL BAG WORTH 4999/- FOR 499/-` | Whether the gift counts towards the spend |
| 20 | Ladder of gifts by spend | U. S. Polo, from 17 Apr 2026: backpack at 499 after 8,999, duffel bag at 699 after 11,999, trolley at 899 after 19,999 | Whether a bigger bill may take a smaller gift |
| 21 | Gift with a cash-off fallback | Blackberry, 16 Feb to 11 Jun: `SHOP FOR RS. 6999/- AND GET RS. 600/ OFF` with the remark `In case of unavailability of Duffle Bag`; the bag offer reads `SHOP FOR Rs. 6995/- AND GET DUFFEL BAG of Rs. 2995/- AT Rs. 99/-` | Which remark belongs to which slab |
| 22 | Gift limited to stock sent | Allen Solly, Apr and May 2026: `Shop for 4999, get a school bag at 99/-`, `Promo (wherever stock has been sent)`, `All NOD KIDS Style codes` | Who tells the Store the stock has been sent |
| 23 | Instant discount in place of a voucher | Van Heusen: `instead of 750 additional shopping you can give 750 off` (`Shop for 7999 and get 750 off`) | The date of the change |
| 24 | Gender or category scope | Spykar, 27 Feb to 27 May 2026: men's slabs 15,999 / 12,999 / 7,999, women's slabs 4,999 / 2,999 | None |
| 25 | Style-list scope | Allen Solly `Men's AMM style codes`; Van Heusen `As per AMM list`; Peter England "attached list of style codes" | The lists are mostly missing (section 4) |
| 26 | Sub-brand scope | Louis Philippe `All Sub Brand(LP,LY,LA,LX,LR)`; Van Heusen `VS,VD , VX & VF` | None |
| 27 | Store or channel scope | Allen Solly `HOAS (Selected partners ...)`; Van Heusen `PAN INDIA Offer`; Mufti `Store` column (`Ratu`, `Lee`, `Jainsons`); Peter England `MBO` | Which KDPS Stores are meant |
| 28 | Exclusions | Van Heusen: T-shirts of MRP 1099 and 1299 are excluded from the T-shirt and brand-level offers. Louis Philippe: `All Categories except Winter Wear`. Blackberry: `EXCLUDING FOOTWEAR, SUITS, BLAZERS, ZIPPER JACKETS`. Libas: `NOT ON NOD` | None |
| 29 | Two offers on the same goods | Louis Philippe, from 4 Feb (year not written), winterwear and tweed: `Buy 1 - Get 30%` and `Buy 1 - Get 1`, both `All Codes` | Which applies |
| 30 | Earlier lines dropped | Louis Philippe: `Only below offers are active.` | Whether earlier lines are cancelled |
| 31 | Open-ended offer | Allen Solly `Further communication`; 9 lines with `Not Disclosed Yet.` | The close date |
| 32 | Event offer for a few days | Spykar Black Friday, 28 to 30 Nov 2025; Mufti Black Friday, 27 Nov (`B2G1`) and 28 to 30 Nov (`B2G40, B1G20`); Allen Solly `Womens Day Offers` (handbags, Apr 2026) | None |
| 33 | Pass-on of a GST rate change | Peter England, 1 to 22 Jun 2026: `PE GST benefit 11.02%`, `6.25%`, `FLAT` | Meaning (section 1) |
| 34 | Staff incentive slab on net sale value | The note beside the Linen Club row of 25 Dec 2025 to 2 Feb 2026 | Meaning (section 1) |
| 35 | Price per MRP point looked up from a table | `KDPS-DIRECTION.xlsx`, Flying Machine May 2026: `Dis Amount` is a lookup of `GST DIFF` by MRP | Purpose (section 6.7) |

## 3. Every offer, brand by brand

### 3.1 Sources, and what is a copy of what

| Key | File |
| --- | --- |
| `BO` | `Q&A-req-recieved/BRAND OFFERS/BRAND OFFERS.xlsx`. Seven sheets: `USPS-FM-ARROW-LC-SPYKAR` (104 offer lines, the standard 8-column layout), `BLACKBERRY` (free text), `MUFTI` (no header), `KILLER` (3 columns), `LIBAS`, `PARX`, `SWEET DREAMS` (7 columns each) |
| `KIOD` | `KDPS INVOICE & OFFER DETAILS..xlsx`, sheet `OFFER DETAILS.` |
| `FM-img` | `monthly-reports-april-may-2026/FM-offer-list.jpeg` |
| `AS-Apr`, `AS-May`, `AS-Jun` | `Q&A-req-recieved/BRAND OFFERS/ALLEN SOLLY/Allensolly APRIL.jpeg`, `Allensolly MAY.jpeg`, `Allensolly JUNE.jpeg`; the crops `ALLEN SOLLY-1.png` (May), `ALLEN SOLLY-2.png` (June), `ALLEN SOLLY-3.png` (April) |
| `PE-Jun`, `PE-ABV` | `PETER ENGLAND/PE JUNE.jpeg`, `PE ABV OFFER.jpeg` |
| `LP-img` | `LOUIS PHILLIPE/LP MAY.jpeg`, `LP APRIL.jpeg`; `PETER ENGLAND/PE MAY.jpeg` is the same file as `LP MAY.jpeg` |
| `VH-img` | `VAN HEUSEN/VH APRIL 1.jpeg` to `VH APRIL 5.jpeg`, `VH ADDITIONAL OFFER.jpeg`, `VH ADDITIONAL OFFER 2.jpeg` |
| `BB-May`, `BB-Jun` | Sheet `OFFER` of `BLACKBERRY_SALES_STOCK_DETAILS_MAY2026.xlsx` (May folder) and `BLACKBERRY_SALES_STOCK_DETAILS_JUNE2026.xlsx` (June folder) |
| `MU-May`, `MU-Jun` | Sheet `OFFER` of the two Mufti workbooks |
| `KL` | `brand-analysis-report /blackberry/KDPS LIFE.xlsx`, column `Offer` |

What is a copy of what:

- `BO` sheet `USPS-FM-ARROW-LC-SPYKAR` and `KIOD` `OFFER DETAILS.` are the same table. All 104 offer lines match cell for cell in columns A to H. Both hold the same 74 hyperlinks (Google Drive links, equal targets) and the same two stray notes in cells I54 and J54. `KIOD` is a workbook with six sheets; only this sheet is an offer table (its hidden invoice sheet has three `PROMO` invoices, section 7).
- `FM-img` is a screenshot of the 18 Flying Machine lines of that table. It adds nothing.
- Of the 80 non-empty `Offer Artwork` cells, 74 are links, 5 read `NO ARTWORK` (the `FRESH` rows) and 1 reads `ARTWORK NOT RECEIVED` (U. S. Polo SS'26 trolley row).
- The three Allen Solly PNGs are crops of the three Allen Solly emails. `PE MAY.jpeg` and `LP MAY.jpeg` are byte-identical, so there is no Peter England May data. `LP APRIL.jpeg` is a shorter crop of the same Louis Philippe email. `VH APRIL 2.jpeg` and `VH APRIL 3.jpeg` overlap. `VH ADDITIONAL OFFER.jpeg` is artwork `BUY 2 AND GET ₹1000 OFF`, and `VH ADDITIONAL OFFER 2.jpeg` is artwork `SHOP FOR ₹7999 AND GET ₹750 OFF` with `*T&C apply`. Both are lines already in the Van Heusen table.
- `BO` sheet `BLACKBERRY` and `BB-Jun` hold the same 11 offer rows. `BB-May` lacks the 12/06 row and the end date of the 16/02 row.
- `BO` sheet `MUFTI` is the June version of the Mufti history (it holds the close of `B2 - G1` and the 12 Jun row). It has no header and no store column. Its first row holds one slab where `MU-Jun` holds three. 22 of its date cells have day and month swapped (section 3.4). `MU-Jun` has 24 rows with true dates. `MU-May` has 23 rows and lacks the 12 Jun row and the close of `B2 - G1`.
- The workbook and the images carry file times of 13 Jun 2026.

Dates in the tables are written as `d Mon yyyy`. A table lists what the file says; it does not say whether the offer was ever applied.

### 3.2 U. S. Polo, U. S. Polo Kids, Flying Machine, Arrow, Linen Club, Spykar

All six brands are in the one standard table: 104 lines, 51 `EOSS`, 37 `ATV`, 11 `GWP`, 5 `FRESH`, seasons `AW'25` (83 lines) and `SS'26` (21 lines), status `CLOSED` (90), `STILL RUNNING` (9) and `NO OFFER` (5). Start dates run from 3 Sep 2025 to 11 Jun 2026. Counts by brand: U. S. Polo 20, U. S. Polo Kids 22, Flying Machine 18, Arrow 18, Spykar 18, Linen Club 8. The stray note `NSV - 24lakh 1% 28lakh 2% 34lakh 3%` and `Deo 1staff` sits in columns I and J of the Linen Club row of 25 Dec 2025 (sheet row 54).

#### U. S. Polo (`U. S. POLO` in the file)

Source: `BO` sheet `USPS-FM-ARROW-LC-SPYKAR` (same rows in `KIOD`). 14 rows below from 20 offer lines; slabs on the same dates are joined with ` ; `. The first column is the sheet row.

| Sheet rows | Month | Type | Season | Details (as written) | Start | Close | Status | Artwork |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2–4 | Sep 2025 | GWP | AW'25 | BUY 7999/- & GET A DUFFEL BAG WORTH 4999/- FOR 499/- ; BUY 10999/- & GET A BACKPACK WORTH 6999/- FOR 699/- ; BUY 16999/- & GET A TROLLEY WORTH 7999/- FOR 799/- | 6 Sep 2025 | 10 Oct 2025 | CLOSED | PDF link |
| 17–19 | Oct 2025 | ATV | AW'25 | BUY 16999/- GET 3000/- 0FF ; BUY 12999/- GET 2000/- 0FF ; BUY 7999/- GET 1000/- 0FF | 11 Oct 2025 | 10 Dec 2025 | CLOSED | PDF link |
| 41 | Dec 2025 | EOSS | AW'25 | B1-20% & B2-30% | 12 Dec 2025 | 18 Dec 2025 | CLOSED | PDF link |
| 45 | Dec 2025 | EOSS | AW'25 | B1-20%, B2-G1, B3-G2 # (JACKET/SWEATER – B1-20%, B2-30%) | 19 Dec 2025 | 23 Dec 2025 | CLOSED | PDF link |
| 49 | Dec 2025 | EOSS | AW'25 | B1-20%, B2-30%, B2-G2 | 24 Dec 2025 | 3 Jan 2026 | CLOSED | PDF link |
| 55 | Jan 2026 | EOSS | AW'25 | B1-20%, B2-30%, B3-40% | 4 Jan 2026 | 8 Jan 2026 | CLOSED | PDF link |
| 62 | Jan 2026 | EOSS | AW'25 | B1-20%, B2-30%, B2-G2 | 9 Jan 2026 | 15 Jan 2026 | CLOSED | PDF link |
| 66 | Jan 2026 | EOSS | AW'25 | B1-30%, B2-40%, B2-G2 | 16 Jan 2026 | 22 Jan 2026 | CLOSED | PDF link |
| 70 | Jan 2026 | EOSS | AW'25 | B1-30%, B2-40%, B2-G2, (JCK,SWS,SWE - Flat-40%) | 23 Jan 2026 | 26 Jan 2026 | CLOSED | PDF link |
| 74 | Jan 2026 | EOSS | AW'25 | B1-30%, B2-40%, (JCK,SWS,SWE - Flat-40%) | 27 Jan 2026 | 29 Jan 2026 | CLOSED | PDF link |
| 80 | Jan 2026 | EOSS | AW'25 | B1-30%, B2-40%, B2-G2 | 30 Jan 2026 | 6 Feb 2026 | CLOSED | PDF link |
| 84 | Feb 2026 | EOSS | AW'25 | B1-30%, B2-40%, (JCK,SWE,SWS - Flat 40%) | 7 Feb 2026 | 15 Feb 2026 | CLOSED | PDF link |
| 88 | Feb 2026 | FRESH | SS'26 | FRESH SALE PERIOD | 16 Feb 2026 | 16 Apr 2026 | NO OFFER | `NO ARTWORK` |
| 93–95 | Apr 2026 | GWP | SS'26 | BUY 8999/- & GET A BACKPACK WORTH 4999/- FOR 499/- ; BUY 11999/- & GET A DUFFEL BAG WORTH 6999/- FOR 699/- ; BUY 19999/- & GET A TROLLEY WORTH 8999/- FOR 899/- | 17 Apr 2026 | Not Disclosed Yet. | STILL RUNNING | PDF link, `ARTWORK NOT RECEIVED` on one row |

#### U. S. Polo Kids (`U. S. POLO KIDS` in the file)

Source: `BO` sheet `USPS-FM-ARROW-LC-SPYKAR` (same rows in `KIOD`). 15 rows below from 22 offer lines; slabs on the same dates are joined with ` ; `. The first column is the sheet row.

| Sheet rows | Month | Type | Season | Details (as written) | Start | Close | Status | Artwork |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5–7 | Sep 2025 | GWP | AW'25 | BUY 5999/- & GET A SCHOOL BAG WORTH 3995/- FOR 499/- ; BUY 7999/- & GET A SCHOOL BAG + TIFFIN CASE WORTH 4995/- FOR 699/- ; BUY 10999/- & GET A TROLLY WORTH 7995/- FOR 799/- | 6 Sep 2025 | 10 Oct 2025 | CLOSED | PDF link |
| 20–22 | Oct 2025 | ATV | AW'25 | BUY 10999/- GET 2000/- 0FF ; BUY 6999/- GET 1000/- 0FF ; BUY 3999/- GET 500/- 0FF | 11 Oct 2025 | 31 Oct 2025 | CLOSED | PDF link |
| 29–31 | Nov 2025 | ATV | AW'25 | BUY 10999/- GET 2000/- 0FF ; BUY 5999/- GET 1000/- 0FF ; BUY 3999/- GET 500/- 0FF | 1 Nov 2025 | 10 Dec 2025 | CLOSED | PDF link |
| 42 | Dec 2025 | EOSS | AW'25 | B1-20% & B2-30% | 12 Dec 2025 | 18 Dec 2025 | CLOSED | PDF link |
| 47 | Dec 2025 | EOSS | AW'25 | B1-20%, B2-30%, B2-G2 | 19 Dec 2025 | 23 Dec 2025 | CLOSED | PDF link |
| 50 | Dec 2025 | EOSS | AW'25 | B1-20%, B2-30%, B2-G2 | 24 Dec 2025 | 3 Jan 2026 | CLOSED | PDF link |
| 57 | Jan 2026 | EOSS | AW'25 | B1-20%, B2-30%, B3-40% | 4 Jan 2026 | 8 Jan 2026 | CLOSED | PDF link |
| 63 | Jan 2026 | EOSS | AW'25 | B1-20%, B2-30%, B3-40% | 9 Jan 2026 | 15 Jan 2026 | CLOSED | PDF link |
| 67 | Jan 2026 | EOSS | AW'25 | B1-30%, B2-40%, B2-G2 | 16 Jan 2026 | 22 Jan 2026 | CLOSED | PDF link |
| 71 | Jan 2026 | EOSS | AW'25 | B1-30%, B2-40%, B3-50% | 23 Jan 2026 | 26 Jan 2026 | CLOSED | PDF link |
| 75 | Jan 2026 | EOSS | AW'25 | B1-30%, B2-40%, (JCK,SWS,SWE - Flat-40%) | 27 Jan 2026 | 29 Jan 2026 | CLOSED | PDF link |
| 81 | Jan 2026 | EOSS | AW'25 | B1-30%, B2-40%, B3-50% | 30 Jan 2026 | 6 Feb 2026 | CLOSED | PDF link |
| 85 | Feb 2026 | EOSS | AW'25 | B1-30%, B2-40%, (JCK,SWE,SWS - Flat 40%) | 7 Feb 2026 | 15 Feb 2026 | CLOSED | PDF link |
| 89 | Feb 2026 | FRESH | SS'26 | FRESH SALE PERIOD | 16 Feb 2026 | 16 Apr 2026 | NO OFFER | `NO ARTWORK` |
| 96–97 | Apr 2026 | GWP | SS'26 | BUY 7995/- & GET A BACKPACK WORTH 4999/- FOR 599/- ; BUY 12995/- & GET A TROLLEY WORTH 7999/- FOR 799/- | 17 Apr 2026 | Not Disclosed Yet. | STILL RUNNING | PDF link |

#### Flying Machine (`FLYING MACHINE` in the file)

Source: `BO` sheet `USPS-FM-ARROW-LC-SPYKAR` (same rows in `KIOD`). Also on `FM-img`. 14 rows below from 18 offer lines; slabs on the same dates are joined with ` ; `. The first column is the sheet row.

| Sheet rows | Month | Type | Season | Details (as written) | Start | Close | Status | Artwork |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8–10 | Sep 2025 | ATV | AW'25 | BUY 14999/- GET 3000/- 0FF ; BUY 10999/- GET 2000/- 0FF ; BUY 5999/- GET 1000/- 0FF | 8 Sep 2025 | 31 Oct 2025 | CLOSED | PDF link |
| 26–28 | Nov 2025 | ATV | AW'25 | BUY 10999/- GET 2000/- 0FF ; BUY 5999/- GET 1000/- 0FF ; BUY 3999/- GET 500/- 0FF | 1 Nov 2025 | 10 Dec 2025 | CLOSED | PDF link |
| 38 | Dec 2025 | EOSS | AW'25 | BUY 1-20% & BUY-2-30% | 11 Dec 2025 | 18 Dec 2025 | CLOSED | PDF link |
| 48 | Dec 2025 | EOSS | AW'25 | B1-20%, B2-30%, B2-G2 | 19 Dec 2025 | 23 Dec 2025 | CLOSED | PDF link |
| 52 | Dec 2025 | EOSS | AW'25 | B1-20%, B1-G1 | 24 Dec 2025 | 3 Jan 2026 | CLOSED | PDF link |
| 58 | Jan 2026 | EOSS | AW'25 | B1-30%, B2-40% | 4 Jan 2026 | 8 Jan 2026 | CLOSED | PDF link |
| 61 | Jan 2026 | EOSS | AW'25 | B1 20, B1-G1 | 9 Jan 2026 | 15 Jan 2026 | CLOSED | PDF link |
| 65 | Jan 2026 | EOSS | AW'25 | B1 20, B1-G1 | 16 Jan 2026 | 22 Jan 2026 | CLOSED | PDF link |
| 69 | Jan 2026 | EOSS | AW'25 | B1-40%, B2-50% | 23 Jan 2026 | 26 Jan 2026 | CLOSED | PDF link |
| 73 | Jan 2026 | EOSS | AW'25 | B1-30%, B2-40%, (JCK,SWS,SWE - Flat-40%) | 27 Jan 2026 | 29 Jan 2026 | CLOSED | PDF link |
| 79 | Jan 2026 | EOSS | AW'25 | B1-40%, B2-50% | 30 Jan 2026 | 6 Feb 2026 | CLOSED | PDF link |
| 83 | Feb 2026 | EOSS | AW'25 | B1-40%, B2-50% | 7 Feb 2026 | 15 Feb 2026 | CLOSED | PDF link |
| 87 | Feb 2026 | FRESH | SS'26 | FRESH SALE PERIOD | 16 Feb 2026 | 16 Apr 2026 | NO OFFER | `NO ARTWORK` |
| 98 | Apr 2026 | ATV | SS'26 | BUY 4999/- GET 500/- OFF & BUY 6999/- GET 1000/- OFF | 17 Apr 2026 | Not Disclosed Yet. | STILL RUNNING | PDF link |

#### Arrow (`ARROW` in the file)

Source: `BO` sheet `USPS-FM-ARROW-LC-SPYKAR` (same rows in `KIOD`). 14 rows below from 18 offer lines; slabs on the same dates are joined with ` ; `. The first column is the sheet row.

| Sheet rows | Month | Type | Season | Details (as written) | Start | Close | Status | Artwork |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 11–13 | Sep 2025 | ATV | AW'25 | BUY 16999/- GET 3000/- 0FF ; BUY 12999/- GET 2000/- 0FF ; BUY 6999/- GET 1000/- 0FF | 8 Sep 2025 | 31 Oct 2025 | CLOSED | PDF link |
| 23–25 | Nov 2025 | ATV | AW'25 | BUY 14999/- GET 3000/- 0FF ; BUY 10999/- GET 2000/- 0FF ; BUY 6999/- GET 1000/- 0FF | 1 Nov 2025 | 10 Dec 2025 | CLOSED | PDF link |
| 43 | Dec 2025 | EOSS | AW'25 | B1-20% & B2-30% | 12 Dec 2025 | 18 Dec 2025 | CLOSED | PDF link |
| 46 | Dec 2025 | EOSS | AW'25 | B1-20%, B2-G1, B3-G2 (SU#BZ FLAT-30%) | 19 Dec 2025 | 23 Dec 2025 | CLOSED | PDF link |
| 51 | Dec 2025 | EOSS | AW'25 | B1-20%, B2-30%, B2-G2 (SU#BZ Flat-30%) | 24 Dec 2025 | 3 Jan 2026 | CLOSED | PDF link |
| 56 | Jan 2026 | EOSS | AW'25 | B1-20%, B2-30%, B3-40%, (SU#BZ Flat-30%) | 4 Jan 2026 | 8 Jan 2026 | CLOSED | PDF link |
| 60 | Jan 2026 | EOSS | AW'25 | B1-20%, B2-30%, B2-G2 (SU#BZ Flat-30%) | 9 Jan 2026 | 15 Jan 2026 | CLOSED | PDF link |
| 64 | Jan 2026 | EOSS | AW'25 | B1-30%, B2-40%, B2-G2, (SU#BZ Flat-40%) | 16 Jan 2026 | 22 Jan 2026 | CLOSED | PDF link |
| 68 | Jan 2026 | EOSS | AW'25 | B1-30%, B2-40%, B3-50%, (SU#BZ Flat-40%) | 23 Jan 2026 | 26 Jan 2026 | CLOSED | PDF link |
| 72 | Jan 2026 | EOSS | AW'25 | B1-30%, B2-40%, (JCK,SWS,SWE - Flat-40%) | 27 Jan 2026 | 29 Jan 2026 | CLOSED | PDF link |
| 78 | Jan 2026 | EOSS | AW'25 | B1-30%, B2-40%, B3-50%, (SU#BZ Flat-40%) | 30 Jan 2026 | 6 Feb 2026 | CLOSED | PDF link |
| 82 | Feb 2026 | EOSS | AW'25 | B1-30%, B2-40%, (JCK,SWE,SWS - Flat 50%) (SU#BZ - FLAT 40%) | 7 Feb 2026 | 15 Feb 2026 | CLOSED | PDF link |
| 86 | Feb 2026 | FRESH | SS'26 | FRESH SALE PERIOD | 16 Feb 2026 | 2 Mar 2026 | NO OFFER | `NO ARTWORK` |
| 92 | Mar 2026 | ATV | SS'26 | BUY 4999/- & GET 500/-, BUY 6999/- & GET 1000/-, BUY 12999/- & GET 2000/-, BUY 16999/- & GET 3000/- | 3 Mar 2026 | Not Disclosed Yet. | STILL RUNNING | PDF link |

#### Linen Club (`LINEN CLUB` in the file)

Source: `BO` sheet `USPS-FM-ARROW-LC-SPYKAR` (same rows in `KIOD`). 6 rows below from 8 offer lines; slabs on the same dates are joined with ` ; `. The first column is the sheet row.

| Sheet rows | Month | Type | Season | Details (as written) | Start | Close | Status | Artwork |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 14–16 | Sep 2025 | ATV | AW'25 | BUY 2 GET 750/- OFF ; BUY 3 GET 1250/- OFF ; BUY 4 GET 2000/- OFF | 3 Sep 2025 | 22 Apr 2026 | CLOSED | PDF link |
| 37 | Dec 2025 | EOSS | AW'25 | B1-20%, B2-30%, OR B3 & ABOVE 40% | 8 Dec 2025 | 18 Dec 2025 | CLOSED | PDF link |
| 44 | Dec 2025 | EOSS | AW'25 | BUY 1 - 25%, BUY 2 & ABOVE - 40% | 19 Dec 2025 | 24 Dec 2025 | CLOSED | PDF link |
| 54 | Dec 2025 | EOSS | AW'25 | BUY 1 - 25%, BUY 2 - 40%, & BUY 3 - 50% | 25 Dec 2025 | 2 Feb 2026 | CLOSED | PDF link |
| 99 | Apr 2026 | ATV | SS'26 | BUY 2 GET 1000/- OFF, BUY 3 GET 1500/- OFF & BUY 4 GET 2000/- OFF | 23 Apr 2026 | 10 Jun 2026 | CLOSED | PDF link |
| 104 | Jun 2026 | EOSS | SS'26 | BUY 1-30%,BUY 2-40% & B2G2 | 11 Jun 2026 | Not Disclosed Yet. | STILL RUNNING | PDF link |

#### Spykar (`SPYKAR` in the file)

Source: `BO` sheet `USPS-FM-ARROW-LC-SPYKAR` (same rows in `KIOD`). 12 rows below from 18 offer lines; slabs on the same dates are joined with ` ; `. The first column is the sheet row.

| Sheet rows | Month | Type | Season | Details (as written) | Start | Close | Status | Artwork |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 32 | Sep 2025 | ATV | AW'25 | BUY 14999/- GET 20% 0FF , BUY 7999/- GET 15% 0FF | 24 Sep 2025 | 27 Nov 2025 | CLOSED | PDF link |
| 33–34 | Nov 2025 | ATV | AW'25 | MEN'S B2G2 OR BUY 2 GET 30% OFF, BUY 1 GET 20% OFF ; WOMEN'S B2G2 OR BUY 2 GET 30% OFF, BUY 1 GET 20% OFF | 28 Nov 2025 | 30 Nov 2025 | CLOSED | 2 PDF links |
| 35–36 | Dec 2025 | ATV | AW'25 | MEN'S BUY 4 GET 40% OFF, BUY 2 GET 30% OFF, BUY 1 GET 20% OFF ; WOMEN'S BUY 4 GET 40% OFF, BUY 2 GET 30% OFF, BUY 1 GET 20% OFF | 1 Dec 2025 | 10 Dec 2025 | CLOSED | 2 PDF links |
| 39–40 | Dec 2025 | EOSS | AW'25 | MEN'S BUY 1 GET 30% OFF, BUY 2 GET 40% OFF & BUY 4 GET 50% OFF ; WOMEN'S BUY 1 GET 40% OFF, BUY 2 GET 50% OFF | 11 Dec 2025 | 24 Dec 2025 | CLOSED | 2 PDF links |
| 53 | Dec 2025 | EOSS | AW'25 | MEN'S BUY 1 GET 40% OFF & BUY 3 GET 50% OFF | 25 Dec 2025 | 5 Jan 2026 | CLOSED | PDF link |
| 59 | Jan 2026 | EOSS | AW'25 | MEN'S BUY 2 GET 50% OFF & BUY 1 GET 40% OFF | 6 Jan 2026 | 28 Jan 2026 | CLOSED | PDF link |
| 76 | Jan 2026 | EOSS | AW'25 | FLAT 50% OFF | 29 Jan 2026 | 22 Feb 2026 | CLOSED | PDF link |
| 77 | Feb 2026 | FRESH | SS'26 | FRESH SALE PERIOD | 23 Feb 2026 | 26 Feb 2026 | NO OFFER | `NO ARTWORK` |
| 90–91 | Feb 2026 | ATV | SS'26 | MEN'S BUY 15999/- GET 3000/- OFF, BUY 12999/- GET 2000/- OFF & BUY 7999/- GET 1000/- OFF ; WOMEN'S BUY 4999/- GET 1000/- OFF & BUY 2999/- GET 500/- OFF | 27 Feb 2026 | 27 May 2026 | CLOSED | 2 PDF links |
| 100–102 | May 2026 | ATV | SS'26 | BUY 3 DENIMS IN KANO/SUPPER SKINNY/SKINNY FIT (MRR RS.2999 & ABOVE) & GET RS.2000 ; BUY 2 DENIMS IN KANO/SUPPER SKINNY/SKINNY FIT (MRR RS.2999 & ABOVE) & GET RS.1200 ; BUY 1 DENIMS IN KANO/SUPPER SKINNY/SKINNY FIT (MRR RS.2999 & ABOVE) & GET RS.500 | 15 May 2026 | 27 May 2026 | CLOSED | PDF link |
| 103 | May 2026 | EOSS | SS'26 | BUY 2 GET 1 FREE & BUY 1 & GET 20% OFF | 28 May 2026 | 11 Jun 2026 | CLOSED | PDF link |
| 105 | Jun 2026 | EOSS | SS'26 | B1G1 & FLAT 40% | 11 Jun 2026 | Not Disclosed Yet. | STILL RUNNING | PDF link |

### 3.3 Blackberry

Source: `BO` sheet `BLACKBERRY`, `BB-May`, `BB-Jun`. The sheet has no column headers: the title row reads `Promo Offers for Fresh MRP sale.`, the second row has `ITEM PROMO SLAB for New Duffle bags & Trolleys` and `Remarks`. Dates are written `dd/mm` without a year. The order of rows and the June sales point to Dec 2025 to Jun 2026 (inferred).

| Order | Month | Details (as written) | Start | Close | Remarks (as written) |
| --- | --- | --- | --- | --- | --- |
| 1 | undated | `SHOP FOR RS. 6999/- AND GET RS. 600/ OFF (EXCLUDING FOOTWEAR, SUITS, BLAZERS, ZIPPER JACKETS)` | not written | not written | `In case of unavailability of Duffle Bag` |
| 2 | undated | `SHOP FOR RS. 10999/- AND GET RS. 1000/ OFF (Including all categories Except Suits)` | not written | not written | none |
| 3 | undated | `SHOP FOR RS. 14999/- AND GET RS. 1500/ OFF (Including all categories)` | not written | not written | none |
| 4 | undated | `SHOP FOR RS. 19999/- AND GET RS. 2000/ OFF (Including all categories)` | not written | not written | `In case of unavailability of Trolley Bag` |
| 5 | undated | `SHOP FOR Rs. 6995/- AND GET DUFFEL BAG of Rs. 2995/- AT Rs. 99/- (EXCLUDING AFI AND S&J)` | not written | not written | `As per availability.` |
| 6 | undated | `SHOP FOR RS. 22999/- AND GET TROLLEY WORTH RS. 7995/- AT RS. 399/- (INCLUDING ALL CATEGORIES)` | not written | not written | `As per availability.` |
| 7 | Dec | `BUY 1 @ 20% OFF / BUY 2 OR MORE @ 30% OFF` | 12/12 | 16/12 | `Start Date 12/12 - End Date 16/12` |
| 8 | Dec | `BUY 1 - 20% / BUY 2 - 30% / BUY 3 - 40%` | 17/12 | 22/01 | `Start Date 17/12 - End Date 22/01` |
| 9 | Jan | `BUY 1 - 30% / BUY 2 - 40% / BUY 3 - 50%` | 23/01 | 15/02 | `Start Date 23/01 - End Date 15/02` |
| 10 | Feb | `BUY 6999/- GET 600/- OFF, BUY 10999/- GET 1000/- OFF, BUY 14999/- GET 1500/- OFF, BUY 19999/- GET 2000/- OFF, BUY 22999/- GET TROLLY FOR 399/-` | 16/02 | 11/06 | `Start Date 16/02 - End Date 11/06` (`BB-May`: `Start Date 16/02`, no end) |
| 11 | Jun | `B1 - 30% / B2 & B3 - 40% / B4 & MORE - 50% / 25% - 40 % ON WAIST COAT, SUIT AND BLAZER (AMM LIST)` | 12/06 | not written | `Start Date 12/06 - End Date` (`BB-May`: row absent) |

Notes:

- Rows 1 to 6 are the "promo" rows for a fresh-MRP period; the file does not date them. Row 10 repeats their amounts (6999, 10999, 14999, 19999, trolley at 399 after 22999) without the bag at 99.
- The 12 Jun row ends in "(AMM LIST)": the percentage for each suit, blazer and waistcoat comes from a list that is not in the folder.

Item tags in `KL` (a list of KDPS stock that looks brand-made (inferred); 907 rows, 888 distinct `EanNo`, 1,332 pieces in column `SOH F`):

| Tag in `Offer` | Rows | Pieces | `Sub-Category` of the rows | MRP range |
| --- | --- | --- | --- | --- |
| `B1-30%, B2&3- 40%, B4 & MORE 50%` | 660 | 995 | Formal shirts 193, casual shirts 88, formal trouser 136, casual trouser 136, denim 16, T-shirts 91 | 1,495 to 4,499 |
| `FLAT 25%` | 58 | 85 | Jackets 27, suits 11, footwear 9, belts 8, socks 3 | 599 to 19,799 |
| `Fresh` | 184 | 246 | Formal shirts 50, formal trouser 37, suits 26, casual shirts 25, casual trouser 23, jackets 21, socks 2 | 599 to 19,799 |
| `FLAT 40%` | 5 | 6 | Suits 2, jackets 3 | 7,369 to 12,635 |

The tag `FLAT 25%` also covers footwear, belts and socks, which the 12 Jun row does not name. The first tag appears to cover the `B1-30% ...` tiers of the 12 Jun row (inferred). The `State` column of `KL` is empty.

### 3.4 Mufti

Source: `BO` sheet `MUFTI` (22 rows), `MU-May` (23 rows), `MU-Jun` (24 rows). The table uses the true dates of `MU-Jun`. `BO` has no `Store` column; `MU-Jun` has columns `Brand` and `Store` filled on the first three rows only (`Ratu`, `Lee`, `Jainsons`), which are the three bill-value slabs of Mar 2025.

| # | Month | Details (as written) | Start | Close | Note |
| --- | --- | --- | --- | --- | --- |
| 1 | Mar 2025 | `BUY 7999GET 1000 OFF` ; `BUY 12999GET 2000 OFF` ; `BUY 17999GET 3000 OFF` | 14 Mar 2025 | 23 May 2025 | One row per slab, stores `Ratu`, `Lee`, `Jainsons`. `BO` lists only the 17,999 slab |
| 2 | Apr 2025 | `B-2-g1` | 23 Apr 2025 | 11 Jun 2025 | |
| 3 | Jun 2025 | `B3-G3` ; `B1-25%` ; `B2-40%` | 12 Jun 2025 | 4 Jul 2025 | Three rows with the same dates |
| 4 | Jun 2025 | `B1-G1` | 5 Jun 2025 | 7 Jul 2025 | |
| 5 | Jun 2025 | `B1-30%` | 5 Jun 2025 | 17 Jul 2025 | |
| 6 | Jul 2025 | `flat -50%` | 18 Jul 2025 | 20 Aug 2025 | |
| 7 | Sep 2025 | `BUY 7999GET 1000 OFF` ; `BUY 12999GET 2000 OFF` ; `BUY 17999GET 3000 OFF` | 5 Sep 2025 | 5 Nov 2025 | |
| 8 | Nov 2025 | `flat10% on 7999` ; `flat15% on 15999` | 6 Nov 2025 | 26 Nov 2025 | |
| 9 | Nov 2025 | `Black Friday Offer B2G1` | 27 Nov 2025 | 27 Nov 2025 | One day |
| 10 | Nov 2025 | `Black Friday Offer B2G40, B1G20` | 28 Nov 2025 | 30 Nov 2025 | |
| 11 | Dec 2025 | `1-10% / 2-20% / 3-30%` | 1 Dec 2025 | 10 Dec 2026 as typed | The year looks like a typo: row 12 starts 11 Dec 2025 |
| 12 | Dec 2025 | `1-25% / 2-40% / 4-50%` | 11 Dec 2025 | 31 Dec 2025 | |
| 13 | Jan 2026 | `B1 25% / B2 50%` | 1 Jan 2026 | 21 Jan 2026 | |
| 14 | Jan 2026 | `Flat -50%` | 22 Jan 2026 | 22 Feb 2026 | |
| 15 | Mar 2026 | `Purchase for 7999/- and get 1000/- off Purchase for 12999/- and get 2000/- off Purchase for 17999/- and get 3000/- off` | 13 Mar 2026 | 27 May 2026 | All three slabs in one cell |
| 16 | May 2026 | `B2 - G1` | 28 May 2026 | 11 Jun 2026 | `MU-May`: no close date |
| 17 | Jun 2026 | `B2 - G2 / B2 - 40% / B1-25%` | 12 Jun 2026 | not written | Absent from `MU-May` |

In `BO` sheet `MUFTI` the dates are a mix: 17 are text (`dd-mm-yyyy`), 2 read the same either way, and 22 are real dates with day and month swapped. For example `12-06-2025` (12 Jun 2025) is stored as 6 Dec 2025, and `04-07-2025` (4 Jul) as 7 Apr. The table above uses the true dates of `MU-Jun`, which agree with the 17 text dates.

The handwritten page in `monthly-reports-april-may-2026/20260601_163402.heic` lists the slabs `7999 → 1000`, `12999 → 2000`, `17999 → 3000` with "Start Date 1st May" and an arrow down to `27th May`, then `28th May` to `31st May` with `2 sale, 1 sale 100%`. The `MU-Jun` start for the slabs is 13 Mar 2026; the 1 May on the page is the first day of the report month (guess). `2 sale, 1 sale 100%` matches `B2 - G1` (buy two, one at 100% off).

### 3.5 Killer

Source: `BO` sheet `KILLER` (7 rows). Columns `START DATE`, `OFFERING`, `END DATE`; no season, type or status. Dates are text: `dd-mm-yyyy` and `dd.mm.yyyy`. A start is written on the first row of a group and an end on its last row.

| Month | Details (as written) | Start | End |
| --- | --- | --- | --- |
| Feb 2026 | `500 OFF ON 4995` ; `1000 OFF ON 6995` ; `2000 OFF ON 10995` | `21-02-2026` | `05.06.2026` |
| Jun 2026 | `BUY 1 @ 20% OFF` ; `BUY 2 @ 30% OFF` ; `BUY 2 GET 2` | `06.06.2026` | not written |

### 3.6 Libas

Source: `BO` sheet `LIBAS` (9 rows; standard 7 columns: `Brand Name`, `Offer Type`, `Season`, `Offer Details`, `Offer Starting Date`, `Offer Closing Date`, `Offer Status`).

| Month | Type | Season | Details (as written) | Start | Close | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Mar 2026 | Promo | SS'26 | `Shop for 2999 Get 500 Off` ; `Shop for 4999 Get 1000 Off` ; `Shop for 8999 Get 2000 Off` | 12 Mar 2026 | 30 Apr 2026 | Closed |
| Apr 2026 | Promo | SS'26 | `Flat 20% on Selected Style` | 20 Apr 2026 | 30 Apr 2026 | Closed |
| May 2026 | Promo | SS'26 | `B110%,B225% NOT ON NOD` | 1 May 2026 | 6 May 2026 | Closed |
| May 2026 | Promo | SS'26 | `B110%,B230% NOT ON NOD` | 7 May 2026 | 18 May 2026 | Closed |
| May 2026 | EOSS | SS'26 | `B130%,B240% ON ALL` | 19 May 2026 | 31 May 2026 | Closed |
| Jun 2026 | EOSS | SS'26 | `FLAT 30%& 40% ACCORDING SHEET` | 1 Jun 2026 | 4 Jun 2026 | Closed |
| Jun 2026 | EOSS | SS'26 | `B1 30% B2 40%` | 5 Jun 2026 | 23 Jun 2026 | STILL RUNNING |

`FLAT 30%& 40% ACCORDING SHEET` points to a sheet that is not in the folder.

### 3.7 Parx

Source: `BO` sheet `PARX` (6 rows; standard 7 columns).

| Month | Type | Season | Details (as written) | Start | Close | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Mar 2026 | Promo | SS'26 | `Shop for 4999 Get 500 Off` ; `Shop for 7499 Get 750 Off` ; `Shop for 11999 Get 1250 Off` | 3 Mar 2026 | 4 Jun 2026 | CLOSED |
| Jun 2026 | Promo | SS'26 | `B 1 20% B 2 & More 30%(Applicable before December 2025 Suit blazer)` | 5 Jun 2026 | 11 Jun 2026 | CLOSED |
| Jun 2026 | Promo | SS'26 | `B1 20, B2G1, B3G1` | 12 Jun 2026 | empty | STILL RUNNING |
| Jun 2026 | Promo | SS'26 | `Suit & blazer 20%` | 12 Jun 2026 | empty | STILL RUNNING |

### 3.8 SweetDreams

Source: `BO` sheet `SWEET DREAMS` (4 rows; standard 7 columns; brand written `SweetDreams`).

| Month | Type | Season | Details (as written) | Start | Close | Status |
| --- | --- | --- | --- | --- | --- | --- |
| May 2026 | Promo | SS'26 | `Flat 20% off` | 9 May 2026 | 10 May 2026 | CLOSED |
| Jun 2026 | Promo | SS'26 | `Buy 2 And Above 20%` | 6 Jun 2026 | 7 Jun 2026 | CLOSED |
| Jun 2026 | Promo | SS'26 | `Flat - 20% off` | 13 Jun 2026 | empty | STILL RUNNING |
| Jun 2026 | Promo | SS'26 | `Mrp 3249 to 3649 - Flat 2599` | 13 Jun 2026 | empty | STILL RUNNING |

### 3.9 Allen Solly

Source: `AS-Apr`, `AS-May`, `AS-Jun` (screenshots of emails from the brand's trade team, forwarded to KDPS staff). Every row has `Type`: `AMM` for percent and item offers, `ABV` for spend offers. A second table lists gift promos (`Offer Type`: `Promo`, `PROMO`). In `AS-Apr` the `END` of every row is `Further communication` and `START` is `1st April`. In `AS-May` `START` is `1st May`; the `END` column of the slab table is cut off in the screenshot, and the promo table's `Validity` reads `Till further communication`. `AS-Jun` is a forward of a brand email of 10 Jun 2026.

| # | Slab (as written) | Type | Applicable (as written) | Apr | May | Jun |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `B1@20% B2@30%` | AMM | `Men's AMM style codes` | yes | yes | no |
| 2 | `B1G1` | AMM | `All Winterwear codes` | yes | yes | no |
| 3 | `Flat 40% off on Women AMM bags` | AMM | `Applicable on Women AMM Handbags` | yes | yes | no |
| 4 | `B2 or more @ 40%` | AMM | `Applicable on Women & Kids Non Winter Wear` | yes | yes | no |
| 5 | `Buy 1 @ 20% off (Women)` | AMM | `All Women Wear AMM style codes promo` | yes | yes | no |
| 6 | `B1 @ 20%` | AMM | `All Kids Wear AMM style codes promo` | yes | yes | no |
| 7 | `B1 @ 30% & B2 or more @ 50%` | AMM | `All Kids Winter Wear AMM style codes promo` | yes | yes | no |
| 8 | `B1@30%` | AMM | Apr: `Suits & Blazers`. May: `Blazers & Jackets` | yes | yes (new wording) | no |
| 9 | `Buy 2 T-shirt and get 500/- off` | AMM | `Men's Tshirt` | no | yes | no |
| 10 | `Shop for 5999 and get 1000rs off` | ABV | `HOAS NOD codes` | yes | yes | no |
| 11 | `Shop for 4999 and get 750rs off` | ABV | `HOAS NOD codes` | yes | yes | no |
| 12 | `Shop for 14999 and get 2000rsoff` | ABV | `HOAS NOD codes` | no | yes | no |
| 13 | `B1@30%` | AMM, `CAT` `Mens all` | `Men's AMM style codes` | no | no | 10 Jun to 18 Jun |

Gift promos (same in `AS-Apr` and `AS-May`):

| # | Offer (as written) | Type | Applicable style codes (as written) |
| --- | --- | --- | --- |
| 14 | `Buy a product worth Rs 6999 & get an Allen Solly Bag at Rs 199` | Promo | `HOAS (Selected partners, wherever stock is available )` |
| 15 | `Shop for 4999, get a school bag at 99/-` | Promo (wherever stock has been sent) | `All NOD KIDS Style codes` |
| 16 | `Shop for 2999, get a fanny pack at 99/-` | Promo (wherever stock has been sent) | `All NOD KIDS Style codes` |
| 17 | `Shop for 14999, get an Allen Solly Trolley at 299/-` | PROMO | `HOAS NOD CODES` |
| 18 | `Shop for Rs 4999 & Get Belt Wallet Combo at Rs 99` | Promo (wherever stock has been sent) | `Men's NOD style codes` |

`AS-Apr` also has a third table headed `Offers`, `Offer Type`, `Applicable style codes\Categories`, `START`, `END` with one row in red text: `Flat 40% off on Women AMM bags`, type `Womens Day Offers`, `Womens Handbag codes only`, `1st April`, `Further communication`. The same line is also in the main table (row 3).

### 3.10 Peter England

Source: `PE-Jun` (valid 1 Jun to 22 Jun 2026; table columns `Description`, `From date`, `VALID Till`, `Category`) and `PE-ABV` (an undated scroll of a similar table). The email says: "Refer the attachment for the style code wise offer details" and "Kindly note the AMM offers are only applicable on the attached list of style codes." The attachment is not in the folder.

| # | Description (as written) | From | Till | Category (as written) |
| --- | --- | --- | --- | --- |
| 1 | `B1@30% on AMM Merch` | 01-06-2026 | 22-06-2026 | Shirt, Trouser, Tshirt, Jeans, Accombo, Bag, Belt, Bermuda, Blazer, Cap, Cravats, Cuflink, Denim, Headger, Helmet, Jacket, Ktregg, Kurpyj, Kurta, Lnkurst, Ltrkpnt, Mask, Msungla, Nehru Jacket And Tro, Nujckt, Pyjama, Shoes, Shorts, Socks, Suit, Sweater, Sweatshirt, T Shirt, T Shirt And Jogger, Tanktop, Towel, Tproduc, Trakpnt, Tsjogrs, Tsshort, Waistct, Wallet, Watch (43 names) |
| 2 | `B2@1599` | 01-06-2026 | 22-06-2026 | Tie |
| 3 | `Flat 50% on AMM Merch` | 01-06-2026 | 22-06-2026 | Jacket, Sweater, Sweatshirt |
| 4 | `Flat price Off on S&B AMM (599/1999/2999/5999/8999/12999)` | 01-06-2026 | 22-06-2026 | Blazer, Pocksqa, Suit |
| 5 | `BUY FOR 4999 & GET A BAG AT 99` | 01-06-2026 | 22-06-2026 | Bag Offer |
| 6 | `PE TR MBO ABV GET Rs 1000 OFF ON SHOPPING OF Rs 4999` | 01-06-2026 | 22-06-2026 | Bundle Offer |
| 7 | `PE TR MBO ABV GET Rs 1999 OFF ON SHOPPING OF Rs 9999` | 01-06-2026 | 22-06-2026 | Bundle Offer |
| 8 | `PE GST benefit 11.02%` | 01-06-2026 | 22-06-2026 | GST benefit |
| 9 | `PE GST benefit 6.25%` | 01-06-2026 | 22-06-2026 | GST benefit |
| 10 | `PE GST benefit FLAT` | 01-06-2026 | 22-06-2026 | GST benefit |

`PE-ABV` has no dates and no GST lines. Its first table lists `B1@30% on AMM Merch` for `Shirts, Trousers, Jeans, T-shirts, Suits & Blazer` (five categories, against 43 names in `PE-Jun`), `B2@1599` for `Tie`, `Flat 50% on AMM Merch` for `Sweater , Sweatshirt , Jacket`, and `Flat price Off on S&B AMM (599/1999/2999/5999/8999/12999)` for `Suits & Blazers & Pocket Square`. Its second table holds the bag line and the two `PE TR MBO ABV` lines (rows 5 to 7 above). The category names in `PE-Jun` look like POS product codes (inferred). No Peter England offer for any other month is in the folder.

### 3.11 Van Heusen

Source: `VH-img`. The screenshots carry no dates except one: `Buy 2 Products and get 1000 Off` with `PAN INDIA Offer` and `Start Date` `19-03-2026` (month `Mar`). The file names say April. The email asks: "Kindly enable this offer until further communication."

Change of wording (`VH APRIL 1.jpeg`): under `Revised - New` the lines are `Shop for 7999 and get 750 Off` and `Shop for 4999 and get 750 off`. Under `Existing` they read `Shop for 7999 and get 750 additional shopping` and `Shop for 4999 and get 750 additional shopping`. The note reads "instead of 750 additional shopping you can give 750 off".

| # | Offer description (as written) | Brand or sub-brand | Categories | Remarks |
| --- | --- | --- | --- | --- |
| 1 | `B1 @ 20%` | HOVH | All Categories | `As per AMM list` |
| 2 | `B2 & Abv @ 30%` | HOVH | All Categories | `As per AMM list` |
| 3 | `Flat – 4999` | Men's Blazers | Men's Blazers | `As per AMM list` |
| 4 | `Flat – 9999` | Men's Suits - 2 Piece | Men's Suits - 2 Piece | `As per AMM list` |
| 5 | `Flat – 12999` | Men's Suits - 3 Piece | Men's Suits - 3 Piece | `As per AMM list` |
| 6 | `Flat-999` | T-shirt MRP-1099 | T-shirt MRP-1099 | `T-shirt MRP-1099` |
| 7 | `B2 Get 300 off` | T-shirt MRP-1299 | T-shirt MRP-1299 | `T-shirt MRP-1299` |
| 8 | `Buy 3 T shirts get 750 off` | All Mens T-shirt Excluding- 1099 & 1299 T-shirts | Men's T-shirt | `As per AMM list` |
| 9 | `Buy 2 T shirts get 500 off` | All Mens T-shirt Excluding- 1099 & 1299 T-shirts | Men's T-shirt | `As per AMM list` |
| 10 | `Buy 2 Products and get 1000 Off` | VS,VD , VX & VF | Brand Level-(Excluding T-shirt) | `As per AMM list` |
| 11 | `Flat @ 40%` | VF | All Categories | `As per AMM list` |
| 12 | `Flat @ 40%` | Men Footwear | Men Footwear | `As per AMM list` |
| 13 | `Flat @ 30%` | ACC Men's | Acc Men's | `As per AMM list` |
| 14 | `Flat @ 25%` | Women's Bags | Women's Bags | `As per AMM list` |
| 15 | `Flat @ 40%` | Winterwear – Men-Women | Winterwear – Men-Women | `As per AMM list` |
| 16 | `Shop for 7999 and get 750 off` | HOVH | All Categories | `-` |
| 17 | `Shop for 4999 and get 750 off` | VW | All Categories | `-` |

Promo offers (`Offer Type`: `Promo Offer`):

| # | Promo led offers | Offer (as written) |
| --- | --- | --- |
| 18 | VW Hang bags | `Shop for 4999 & above - Get a Handbag at just 199` |
| 19 | Trolley | `Shop for 12999/- and Get a Trolley @ 299` |
| 20 | Belt-Wallet Combo | `VH - Shop for 8999/- and Get a Belt Wallet Combo @ 99` |
| 21 | Flex Bags | `Shop for 4999 & above - Get a Flex backpack at just 99` |

### 3.12 Louis Philippe

Source: `LP-img`. The email says: "Please find new ABV offer added. Only below offers are active." Dates are written `dd-Mon` without a year; 2026 is inferred from the April voucher data. Table columns in the email: `Start Date`, `DESCRIPTION`, `Applicable Categories`, `Brand`, `Remarks`, `Region`, and an unlabelled last column. `Region` is `All` on every row.

| Start | Description (as written) | Applicable categories | Brand (sub-brands) | Remarks | Last column |
| --- | --- | --- | --- | --- | --- |
| 04-Feb | `Buy 1- Get 30%` | All Categories except Winter Wear | All Sub Brand(LP,LY,LA,LX,LR) | AMM | No Change in Offer |
| 04-Feb | `Buy 1 - Get 30%` | Winter Wear & Tweed | All Sub Brand(LP,LY,LA,LX,LR) | All Codes | No Change in Offer |
| 04-Feb | `Buy 1 - Get 1` | Winter Wear & Tweed | All Sub Brand(LP,LY,LA,LX,LR) | All Codes | No Change in Offer |
| 04-Feb | `Flat 40% Off` | Foot wear and Acc | All Sub Brand(LP,LY,LR,LA,LX) | AMM | No Change in Offer |
| 04-Feb | `Promo offers` | All Categories | All Sub Brand(LP,LX) | NON AMM | No Change in Offer |
| 11-Apr | `Flat 7999 ( MRP till 13000 )` | Suits | All Sub Brand(LP,LY,LR,LA,LX) | AMM | No Change in Offer |
| 11-Apr | `Flat 9999 ( MRP between 13001 to 18000 )` | Suits | All Sub Brand(LP,LY,LR,LA,LX) | AMM | No Change in Offer |
| 11-Apr | `Flat 12999 ( MRP Greater than 18001 )` | Suits | All Sub Brand(LP,LY,LR,LA,LX) | AMM | No Change in Offer |
| 21-May | `Shop for MRP 7999 and get 750 Off` | All Categories | All Sub Brand(LP,LY,LA,LX,LR) | AMM | New |

The email does not say what the "promo offers" (gifts) for `NON AMM` styles are. The gift styles in the April sales carry codes `LPPROMODBG…`, `LPPROMOTBAG…`, `LPPROMOBGPK…` and `LPPROMOBW…`. The AMM list holds 30 `LPPROMO…` styles, all flagged `Discount`. Of the 33 gift lines in the six April vouchers, 10 are found in the list and 23 are not (section 5). There is no Louis Philippe offer in the folder other than this email.

### 3.13 Month by month: what the files hold for each brand

A brand with no row for a month has no data in these files; it does not mean no offer ran.

| Month | Brands with offer rows that start or run in the month |
| --- | --- |
| Mar 2025 to Aug 2025 | Mufti only (rows 1 to 6) |
| Sep 2025 | U. S. Polo and U. S. Polo Kids (GWP from 6 Sep); Flying Machine and Arrow (ATV from 8 Sep); Linen Club (ATV from 3 Sep); Spykar (ATV from 24 Sep); Mufti (slabs from 5 Sep) |
| Oct 2025 | U. S. Polo (ATV from 11 Oct); U. S. Polo Kids (ATV from 11 Oct); the others continue |
| Nov 2025 | Flying Machine, Arrow, U. S. Polo Kids (second ATV from 1 Nov); Spykar and Mufti (Black Friday); Mufti (flat 10% and 15%) |
| Dec 2025 | Linen Club (EOSS from 8 Dec); Flying Machine (11 Dec); U. S. Polo, U. S. Polo Kids and Arrow (12 Dec); Spykar (11 Dec); Mufti (1 and 11 Dec); Blackberry (12 Dec, undated year) |
| Jan 2026 | EOSS tiers at U. S. Polo, U. S. Polo Kids, Flying Machine, Arrow, Spykar, Linen Club, Mufti, Blackberry |
| Feb 2026 | EOSS tiers end on 2 Feb (Linen Club), 15 Feb (U. S. Polo, U. S. Polo Kids, Flying Machine, Arrow, Blackberry) and 22 Feb (Spykar, Mufti); `FRESH` from 16 Feb (U. S. Polo, U. S. Polo Kids, Flying Machine, Arrow) and 23 Feb (Spykar); Killer slabs from 21 Feb; Blackberry slabs from 16 Feb; Louis Philippe from 4 Feb |
| Mar 2026 | Arrow ATV (3 Mar); Libas (12 Mar); Parx (3 Mar); Mufti slabs (13 Mar); Van Heusen buy-2 offer (19 Mar); Spykar ATV (from 27 Feb) |
| Apr 2026 | Allen Solly (1 Apr); Louis Philippe suits (11 Apr); U. S. Polo, U. S. Polo Kids and Flying Machine (17 Apr); Linen Club (23 Apr); Libas flat 20% (20 Apr) |
| May 2026 | Allen Solly (1 May); Libas (1, 7, 19 May); Spykar denim (15 May) and EOSS (28 May); Louis Philippe `Shop for MRP 7999` (21 May); Mufti `B2 - G1` (28 May); SweetDreams (9 May) |
| Jun 2026 | Peter England (1 to 22 Jun); Allen Solly men's `B1@30%` (10 to 18 Jun); Killer (6 Jun); Libas, Parx (5, 12 Jun); Linen Club and Spykar EOSS (11 Jun); Blackberry (12 Jun); Mufti (12 Jun); SweetDreams (6, 13 Jun) |

## 4. Overlaps and ambiguities in the offer data

This section lists what the files leave open. It decides none of it.

### 4.1 Same brand, overlapping dates, no winner stated

| Brand | What overlaps | Dates | Source |
| --- | --- | --- | --- |
| Linen Club | The AW'25 `ATV` count slabs (`BUY 2 GET 750/- OFF` and so on) run under three `EOSS` offers | ATV 3 Sep 2025 to 22 Apr 2026; EOSS 8 Dec 2025 to 2 Feb 2026 | `BO`, `KIOD` |
| Spykar | The broad SS'26 `ATV` (men's and women's slabs) and the denim `ATV` (`BUY 3 DENIMS ... GET RS.2000`) | 15 to 27 May 2026 (13 days) | `BO`, `KIOD` |
| Spykar | The `EOSS` of 28 May ends on the day the next `EOSS` starts | 11 Jun 2026 belongs to both | `BO`, `KIOD` |
| Mufti | `B-2-g1` (23 Apr to 11 Jun 2025) overlaps the 14 Mar to 23 May 2025 slabs, and `B1-G1` and `B1-30%` (from 5 Jun) overlap both `B-2-g1` and `B3-G3` / `B1-25%` / `B2-40%` (12 Jun to 4 Jul 2025) | 23 Apr to 23 May 2025; 5 Jun to 7 Jul 2025 | `MU-Jun` |
| Libas | `Flat 20% on Selected Style` runs inside the three `Shop for` slabs | 20 to 30 Apr 2026 | `BO` |
| Parx | Two rows start together and stay open: `B1 20, B2G1, B3G1` and `Suit & blazer 20%`. The earlier `B 1 20% B 2 & More 30%` has a note that is hard to read: `(Applicable before December 2025 Suit blazer)` | from 12 Jun 2026 | `BO` |
| SweetDreams | `Flat - 20% off` and `Mrp 3249 to 3649 - Flat 2599` both start 13 Jun and stay open | from 13 Jun 2026 | `BO` |
| Allen Solly | A men's suit may fall under `Men's AMM style codes` (`B1@20% B2@30%`) and under `Suits & Blazers` (`B1@30%`; `Blazers & Jackets` from May). Women's handbags are listed twice (main table and the `Womens Day Offers` table). `B2 or more @ 40%` (women and kids), `Buy 1 @ 20% off (Women)` and `B1 @ 20%` (kids) read as tiers of one offer but are three rows. A bill of 14,999 or more meets all three `ABV` slabs of May (4,999, 5,999, 14,999) | Apr and May 2026 | `AS-Apr`, `AS-May` |
| Van Heusen | `Buy 2 Products and get 1000 Off` (`VS,VD , VX & VF`, brand level) against `Flat @ 40%` on `VF` and against `B1 @ 20%`, `B2 & Abv @ 30%` on `HOVH`. T-shirts: `Buy 2 T shirts get 500 off`, `Buy 3 T shirts get 750 off`, `Flat-999` (MRP 1099) and `B2 Get 300 off` (MRP 1299), while the brand-level offer excludes T-shirts | from 19 Mar 2026 | `VH-img` |
| Louis Philippe | `Buy 1 - Get 30%` and `Buy 1 - Get 1` both apply to winter wear and tweed (`All Codes`). The 21 May `Shop for MRP 7999 and get 750 Off` covers all categories, including goods under `Buy 1- Get 30%` and the suit prices | from 4 Feb, 11 Apr, 21 May | `LP-img` |
| Peter England | `B1@30% on AMM Merch` lists Blazer, Jacket, Suit, Sweater and Sweatshirt, which `Flat 50% on AMM Merch` and `Flat price Off on S&B AMM` also list | 1 to 22 Jun 2026 | `PE-Jun` |
| Blackberry | Bill-value slabs, the bag at 99 and the 12 Jun tiers. On the same bill a duffel bag and a cash-off slab can both qualify. Rows 1 to 6 have no dates | 16 Feb to 11 Jun; undated | `BO`, `BB-Jun` |

Days with no row for a brand are also gaps: 11 Dec 2025 for U. S. Polo, U. S. Polo Kids and Arrow (the ATV closes 10 Dec and the EOSS starts 12 Dec; Flying Machine's EOSS starts 11 Dec); 21 Aug to 4 Sep 2025 and 23 Feb to 12 Mar 2026 for Mufti. Linen Club has no row between 3 Feb and 22 Apr 2026 except the AW'25 ATV. The `Season` label flips from `AW'25` to `SS'26` on 16 Feb for four brands but on 23 Feb for Spykar. The close of Mufti's `1-10% / 2-20% / 3-30%` is typed `10 Dec 2026` (a year too late).

### 4.2 Wording the data cannot settle

| # | Question | What the data shows |
| --- | --- | --- |
| 1 | Does the higher rate of "B1@20% B2@30%" apply to every item or only to the second? | In Blackberry's June POS lines the top rate sits on every qualifying line: bill 646 (14 Jun) has five trousers at 50%, bills 671 and 684 have four lines each at 50%. Mufti's `B2 - G2 / B2 - 40% / B1-25%` bill of 14 Jun has four lines at 50% |
| 2 | Which unit is free in "B1G1" or "B2-G1"? | In Mufti's June POS lines the 100% line is the lowest-priced one in all 8 bills that have one. For ties it is one of the equal lines. The design asks each buy-get offer to say, at approval, whether the lowest- or highest-valued units are the reward (design 5.3, `GC7-9`) |
| 3 | Does "B2-G1" need three items? | 7 of the 8 Mufti bills with a 100% line have three lines. Bill 26-27/LEEDEO/468 (7 Jun) has two lines and one at 100% |
| 4 | What does "B2 - G2" give on three items? | Mufti bill 26-27/LEEDEO/541 (18 Jun) has three shirts at 2,799 with two at 100% |
| 5 | Which offer explains a rate the offer list does not have? | Mufti June lines show 20% on 8 lines (1 to 11 Jun) and 30% on 2 lines (6 Jun, one bill), while the `OFFER` rows for those dates are `B2 - G1` only. In May the source discounts show 20% on 7 lines and 5% on 3 lines against slabs only. Whether these were manual discounts is not stated |
| 6 | Does the spend threshold count MRP or the price after other discounts? | Louis Philippe and Spykar's denim row say MRP (`MRR` in the Spykar row). Others say nothing. Blackberry's `BRAND REPORT` (analyst work) tests the bill's gross MRP |
| 7 | Is the threshold inclusive? | Flying Machine's list says `BUY 4999/- GET 500/-`. `KDPS-DIRECTION.xlsx` tests `>4999` and `>6999`. Louis Philippe's bands read `MRP till 13000`, `between 13001 to 18000`, `Greater than 18001`, so an MRP of 18,001 is in no band |
| 8 | Does the gift count towards the spend? | Blackberry bill 26-27/GAYA/564 (1 Jun) has a duffel bag, an MRP-2,429 shirt and an MRP-2,625 shirt. Without the bag it is 5,054, under the 6,995 of the bag offer |
| 9 | What does the bag cost? | The `OFFER` sheet says a bag worth 2,995 at 99 for a spend of 6,995. The POS bills the duffel bag (MRP 3,499 or 3,155) at 199: 11 lines in May, 3 in June |
| 10 | When two slabs fit, which applies? | No file says. A bill that meets the 14,999 slab also meets the lower ones |
| 11 | Does a threshold count one bill, one brand or one sub-brand? | No file says. The Spykar and Van Heusen rows name sub-brands or genders; the others name none |
| 12 | Is "flat price" a price or an amount off? | Clear for Louis Philippe and Van Heusen (a price). Open for Peter England's `599/1999/2999/5999/8999/12999` |
| 13 | Is a free or token-price gift in stock? | `as per availability`, `wherever stock has been sent`: the stock source is not named |
| 14 | Do the first and the last day count? | Spykar's 11 Jun is both an end and a start. Blackberry's 12/06 row has no end |
| 15 | Which email is the live source? | Louis Philippe says "Only below offers are active". Allen Solly's April and May emails each list "all offers" with open ends and do not cancel earlier lines |
| 16 | Do tiers count items of different categories together? | Blackberry's `BRAND REPORT` counts only items tagged to the tiered offer in `KL`. No offer text says so |
| 17 | What do rows 8 and 9 of the Van Heusen table add up to? | The T-shirt offers exclude MRP 1099 and 1299 pieces, which have their own offers. No file says whether the brand-level offer then also leaves them out |

Missing lists and files that offers depend on:

- Peter England's attachment ("style code wise offer details"); Van Heusen's `AMM list`; Allen Solly's `AMM` and `NOD` lists; Libas' `ACCORDING SHEET`; Blackberry's `AMM LIST` for suits, blazers and waistcoats; the artwork of the U. S. Polo SS'26 trolley offer.
- The only style list in the folder is the Louis Philippe AMM list (section 5).

### 4.3 What the PRD already answers, and what stays open

IDs were checked against [prd.md](../prd.md), [kdps-policies.md](../kdps-policies.md) and [decisions.md](../decisions.md). The design is [shared-calculations.md](../design/calculations/shared-calculations.md) (GC-7).

| Data question | What is already written | Still open |
| --- | --- | --- |
| Several offers fit the same lines and no rule lets them combine: which applies? | The permitted set that gives the customer the largest total discount on the bill; a tie goes to the set approved first; Running Offers and checkout choose the same (`PRD-OFR-021`, `DEC-108`; design 5.4) | Which offers may combine, and in what order, is KDPS's (`POL-19.01`, `POL-19.04`). No file states any combination. Owners: KDPS Owner with the Brand manager. Stage 4 |
| One discount for several lines (a bill-value slab, a free item) | Spread over the lines that earned it, in proportion to their value, rounded down to whole paise, with the left-over paise to the largest line (`PRD-POS-023`, `DEC-109`; design 5.6) | The old POS and the analyst's `BRAND REPORT` put the whole amount on one line (the free line, the bag line, one shirt). Whether a brand report needs a reward-line view is OPEN. Owner: product owner. Which lines "earned" the discount for a buy-get offer is design question `GC7-11` |
| A price above MRP | Refused, with no override (`PRD-POS-024`, `DEC-111`) | `KDPS-DIRECTION.xlsx`'s lookup gives a positive `GST DIFF` from MRP 2,849 up (a figure above MRP). How such a figure relates to a bill is OPEN, owners Accounts and the CA |
| A return from an offer bill | Refund at the paid value the bill recorded for the returned units (`PRD-RET-024`, `DEC-110`; `PRD-RET-005`) | How a brand report treats a returned line is not written. The April skill sets a return and its paired sale to 0%; Blackberry's June lines show a return at the same rate as its sale. OPEN, owner Accounts |
| Which offers are in force on a date | Approved offer versions with effective dates by brand, item and Store or group (`PRD-OFR-001`, `PRD-OFR-002`; design 5.3: those in force on the bill's business date) | 9 lines have `Not Disclosed Yet.` for the close, Allen Solly has `Further communication`, Blackberry rows 1 to 6 have no dates, Louis Philippe's year is not written. These need dates before approval. Owner: Brand manager |
| Offer kinds | `PRD-OFR-001` names percentage, flat-value, buy-X-get-Y and basket-value; design 5.5 gives each a meaning, marked **Proposed** | No PRD kind covers: count-tier percentages, a gift at a token price after a spend, a flat price per MRP band, a price for a pair, a cash-off fallback when a gift is out of stock, "X or Y" alternatives, a GST pass-on, a staff slab. A business decision for the product owner, raised against the PRD |
| Threshold and basis for a basket-value offer | Design 5.5: the discount applies if the eligible lines' value at its turn meets the threshold (read as inclusive); design 5.3: each offer states its settings at approval. Both **Proposed** (`GC7-9`) | MRP or net basis, per bill or per brand, and whether the gift counts: OPEN. Owners: Brand manager; KDPS Owner (approver). `questions-for-kdps.md` items 27 and 56 |
| A manual discount on an offer line | Refused until KDPS sets a rule (design 5.7, `GC7-7`; `PRD-POS-003`) | Whether the Mufti 20% and 30% lines and the Blackberry flat 200 and 300 lines were manual: OPEN, owner KDPS Owner. `questions-for-kdps.md` item 55 |
| Who pays for an offer | Offers retain brand and Organisation cost shares and their source (`PRD-OFR-002`, `POL-19.02`, `POL-19.05`, `PRD-ORG-016`); offer sales and who funded the discount are reported (`PRD-OFR-006`) | No file states a share. `KDPS DEBIT & CREDIT NOTE DETAILS.xlsx` lists `EOSS CREDIT NOTES` as a debit-note type but no row uses it. Owners: KDPS Owner, Brand manager, Accounts. `questions-for-kdps.md` item 27 |
| Brand support claimed after a promotion | A claims register that includes promotional funding, and links of debit requests to supplier credit notes (`PRD-OFR-018`, `PRD-OFR-019`) | How the Dis column of a brand report becomes a claim, and what is paid back: OPEN, owner Accounts |
| A staff slab on net sale value | Incentives by approved percentage, per-piece, slab, brand-funded and team-pool rules (`PRD-HRM-010`); brand-funded incentives as a separate obligation (`PRD-HRM-013`) | Meaning of the note beside the Linen Club row. Owners: KDPS Owner, HR. Stage 6 |
| A brand's style list of eligible goods | Offers by item (`PRD-OFR-001`); external codes mapped with scope and validity dates (`PRD-MER-006`) | No requirement for a brand-supplied list with a flag per style, a reason, an as-on date and an approval reference. Owner: product owner |
| A brand-facing monthly report | None. `PRD-EXC-012` is brand sell-through reports for KDPS; `PRD-EBO-001` imports brand-software reports; `PRD-EBO-009` is the EBO brand-settlement statement (stage 5) | The report in section 6 has no PRD home. Owner: product owner |

## 5. The AMM list

File: `monthly-reports-april-may-2026/2026-04/16_AMM List dtd 20.01.26.xlsb`. It is an Excel binary workbook with one sheet, `Stylecode`: one header row and **77,912 data rows**. The file name and a column header both give the date, 20 Jan 2026. It holds Louis Philippe styles only. Who built it is not stated; the references in its `Ref.` column point to emails and approvals from named people (names not copied), so it is a brand-side list that KDPS received (inferred). The `discount-audit` skill reads it.

### 5.1 Columns

| Column (as written) | Filled | Distinct | What it holds |
| --- | --- | --- | --- |
| `Sl.No` | 77,912 | 77,912 | Running number, 1 to 77,912 |
| `Div` | 77,912 | 15 | A division code: `LP` 38,094, `LY` 24,966, `LR` 12,377, `LX` 1,724, `LA` 671, `LT` 42, `LS` 17, `LU` 7, `Lp` 5, `Ly` 3, `LB` 2, `LK` 1, `LE` 1, `LQ` 1, `LV` 1. It matches the first two letters of the style code except on 620 rows, all with `Div` `LP`, whose style begins `LY`, `LS`, `LR`, `LT`, `LX`, `LW` and others |
| `Product` | 77,912 | 60 | A product code with the prefix `FG`: `FGSHIRT` 38,054, `FGTROUSER` 10,640, `FGTSHIRT` 8,581, `FGJEANS` 3,606, `FGSWSHIRT` 2,013, `FGSUIT` 1,815, `FGJACKET` 1,649, `FGBLAZER` 1,502, `FGSWEATER` 1,296, `FGSOCKS` 1,242, `FGSHOES` 1,202, `FGTIE` 1,181, `FGBELT` 1,021, and others. Some are written in two cases (`FGShirt` 741) |
| `Style codes` | 77,912 | 77,912 | The style code. Each appears once. Lengths 10 to 15; 14 characters on 65,372 rows. 3,101 end in `Q` |
| `MRP` | 77,912 | 245 | The MRP of the style: 0 to 39,999. 16 rows have 0. The most common are 1,999 (7,111 rows), 2,499 (7,103), 2,999 (5,973), 2,799 (5,260) |
| `Discount/No Discount` | 77,912 | 2 | The flag: `Discount` 77,459, `No Discount` 453 |
| `Season` | 77,892 | 54 | A season label such as `Spring Summer 2020` (17,710), `Autumn Winter 2021` (7,976), `Autumn Winter 2020` (6,639), `Autumn Winter 2024` (5,871), `Spring Summer 2024` (5,648), `Spring Summer 2025` (4,532), `Autumn Winter 2025` (3,506), `CORE` (1,449), `Old Core` (260). 20 rows are blank, 37 hold the number 0, 78 hold `NA` |
| `As on 20th Jan'26` | 77,912 | 6 | The reason for the flag (section 5.3) |
| `Q code` (first) | 77,912 | 77,912 | The style code plus `Q` |
| `Ref.` | 12,431 | 93 | A free-text reference: "Added as per mail from <name> dd.mm.yy", "As per approval from <name> on <date>", `Core Jeans`, `ICONIC Trousers`, "Festive Codes Rebuy-mail from <name> dtd 12th Jan'26". 11,631 are text, 800 are Excel date serials. The dates in the text run to 12 Jan 2026; the earliest with a year is 11 Dec 2024. The biggest are 3,130 rows from one mail of 11 Dec 2024 and 1,561 from one of 12 Nov (year not written) |
| `Q code` (second) | 77,912 | 2 | A copy of the flag (`Discount` 77,459, `No Discount` 453) |

The two `Q code` columns together form a lookup from `<style>Q` to the flag. 7 April voucher lines carry a style that ends in `Q`; the voucher lookup does not find them, but they match the first `Q code` column (section 5.5).

Spring-summer 2026 is nearly absent: `Spring Summer 2026` has 9 rows and `Autumn Winter 2026` has 1.

### 5.2 Divisions and flags

| `Div` | `Discount` | `No Discount` |
| --- | --- | --- |
| `LP` | 37,749 | 345 |
| `LY` | 24,931 | 35 |
| `LR` | 12,304 | 73 |
| `LX` | 1,724 | 0 |
| `LA` | 671 | 0 |
| `LT`, `LS`, `LU`, `Lp`, `Ly`, `LB`, `LK`, `LE`, `LQ`, `LV` | 80 | 0 |

The 453 `No Discount` rows are 207 `FGSHIRT`, 188 `FGTROUSER`, 24 `FGJEANS`, 16 `FGSUIT`, 14 `FGBLAZER` and 4 `FGTSHIRT`. By season they are `Autumn Winter 2025` 208, `CORE` 121, `Spring Summer 2025` 60, `Spring Summer 2024` 24, `Autumn Winter 2022` 16, `Spring Summer 2023` 12, `Autumn Winter 2021 Core` 7 and `Spring Summer 2026` 5.

### 5.3 Reasons in `As on 20th Jan'26`

| Reason (as written) | Rows | Flag |
| --- | --- | --- |
| `Discount` | 77,315 | `Discount` |
| `TR Line - No Discount` | 214 | `No Discount` |
| `Core -No Discount` | 144 | `No Discount` |
| `Added back to Disocunt` | 144 | `Discount` |
| `Iconic Trousers-Discontinued from AMM` | 50 | `No Discount` |
| `Festive Rebuy-Discountinued from AMM` | 45 | `No Discount` |

"Discontinued from AMM" shows that a style can be taken off the list, which also hints that `AMM` is the name of the scheme or list itself (guess). `TR Line` is not explained (OPEN; 188 of the 453 `No Discount` rows are trousers).

### 5.4 How a voucher looks a style up

- The `discount-audit` skill puts a formula in column O of the voucher: `=IFERROR(VLOOKUP($G5,'[16_AMM List dtd 20.01.26.xlsb]Stylecode'!$D$2:$F$77913,3,0),"No Discount")`. It matches the voucher's `Style Code` (column G) exactly against `Style codes` (column D) and returns the flag (column F). A style not found returns `No Discount`.
- The delivered April vouchers hold the result as text, not as a formula. In all 429 lines the text equals what the list gives.
- The raw `Sale` sheet of Bokaro already has the lookup in an unlabelled column N. It holds `Discount` on 29 lines, `No Discount` on 11 and the text `#N/A` on 49: the list was not open when it was filled.
- No offer rate is in the list. In the six April vouchers every percentage-discounted line carries 30 (plus one backpack at 100%); 30 equals Louis Philippe's `Buy 1 - Get 30%`. Which offer a line was given is the analyst's choice; the skill says never to hard-code the rate. The list holds no date, no brand other than Louis Philippe and no category rule.

### 5.5 Coverage gap in the April vouchers

429 voucher lines in six stores were looked up.

| Result | Lines |
| --- | --- |
| Listed, `Discount` | 237 |
| Listed, `No Discount` (`TR Line` 20, `Core` 14, `Festive Rebuy` 3, `Iconic Trousers` 2) | 39 |
| **Not in the list** (read as `No Discount`) | **153** (36%), 75 distinct styles |

By store, lines not in the list: Bokaro 50 of 90, VAS-DEO 44 of 138, HZB 33 of 99, SANSKAR 12 of 51, AS-DEO 8 of 35, Dumka 6 of 16.

What the missing lines are:

- By item: shirt 55, T-shirt 51, duffel bag 20, trouser 13, socks 6, backpack 3, suit 2, jeans 2, blazer 1.
- The 23 gift lines (duffel bags and backpacks, codes beginning `LPPROMO`) are among them. The list does hold 30 `LPPROMO…` styles (all `Discount`); 10 of the 33 gift lines in the vouchers are found, 23 are not.
- The raw files of three stores carry a season label (HZB, AS-DEO and SANSKAR: 185 lines, 53 not in the list). Of those 53, 37 are spring-summer 2026 labels (`SPRING SUMMER(Jan-26)` 9, `(Feb-26)` 12, `(Mar-26)` 7, `(Apr-26)` 6, `SS 26` 3), 9 are `SS 25-26` and 7 are `AUTUMN WINTER(Nov-25)`. The list is dated 20 Jan 2026 and holds almost no spring-summer 2026 style.
- 7 lines have a style ending in `Q`; the same style plus `Q` is in the list's first `Q code` column, which the voucher lookup does not use.
- 9 suit lines (HZB 4, VAS-DEO 5) are listed as `Discount` but show `Dis %` 0, with a typed discount amount that gives a total of 9,999 (section 6.6).

OPEN: what `AMM` stands for; who owns the list at the brand; how often it is refreshed and how a new style is added; how styles missing from it are to be treated; whether `TR Line` and `Core` are permanent. Owners: Brand manager (list owner and refresh), KDPS Owner (treatment of missing styles). The list also has no home in the PRD (section 4.3).

## 6. The monthly brand report

### 6.1 What it is

Each month KDPS builds, for a brand and a Store, two lists in one workbook:

- `SALES`: titled `List of Sales Vouchers`. One row per sold line, with the brand's discount.
- `SOH`: titled `List of Stock Details`. One row per barcode in stock at a date, with MRP.

The title lines read `KDPS LIFESTYLE PVT. LTD.`, the list name, and `Voucher Series : <BRAND> (From dd-mm-yyyy To dd-mm-yyyy)`. The layout (company line, `Vch/Bill No.`, `Particulars`, `Unit` `PCS`) looks like a Tally voucher-register printout (guess). It is a report, not a Tally entry. The PRD's "Voucher" means a Tally entry.

- The `Dis %` column holds the brand-offer percentage, not always what the POS gave the customer (section 6.10).
- Who receives the report, under which scheme, and what money follows from it are not stated in any file. They are OPEN (section 6.12).
- `report-offer.md` (in `docs/data-from-kdps`, outside these folders) is the English translation of a call (about 19 Jun 2026) about the dummy Blackberry and Mufti offer report: offers applied from the AMM list at the best percentage; wish to club sales across days for the best benefit; refresh weekly or fortnightly.
- The ERP team's two Excel add-in skills (`kdps-report`, `discount-audit`, files dated 31 May 2026) and `KDPS-DIRECTION.xlsx` automate the build. They are analyst work, not KDPS decisions.

### 6.2 What was delivered

| Month | Brand | File | Stores (bill-series prefix) | `SALES` lines | `SOH` rows |
| --- | --- | --- | --- | --- | --- |
| Apr 2026 | Louis Philippe | `SALES_VOUCHERS_LP_APRIL2026_AS-DEO.xlsx` | AS-DEO (`DEOT`) | 35 | 336 |
| Apr 2026 | Louis Philippe | `SALES_VOUCHERS_LP_APRIL2026_BOKARO.xlsx` | Bokaro (`LBKR`) | 90 | 336 |
| Apr 2026 | Louis Philippe | `SALES_VOUCHERS_LP_APRIL2026_DUMKA.xlsx` | Dumka (`DMK`) | 16 | 240 |
| Apr 2026 | Louis Philippe | `SALES_VOUCHERS_LP_APRIL2026_HZB.xlsx` | Hazaribagh (`JSL`) | 99 | 587 |
| Apr 2026 | Louis Philippe | `SALES_VOUCHERS_LP_APRIL2026_SANSKAR.xlsx` | Sanskar (`SAN`) | 51 | 1 |
| Apr 2026 | Louis Philippe | `SALES_VOUCHERS_LP_APRIL2026_VAS-DEO.xlsx` | Vaishnavi Deoghar (`DEO`) | 138 | 839 |
| May 2026 | Blackberry | `BLACKBERRY_SALES_STOCK_DETAILS_MAY2026.xlsx` | one file for the brand: `GAYA` 133 lines, `JSL` 4 lines (78 bills) | 137 | 911 |
| May 2026 | Mufti | `MUFTI_SALES_STOCK_DETAILS_MAY2026.xlsx` | one file: `LEEDEO` 31, `JSL` 7, `VAS` 6, `GAYA` 4 lines (42 bills) | 48 | 798 |
| Jun 2026 (1 to 18) | Blackberry | `BLACKBERRY_SALES_STOCK_DETAILS_JUNE2026.xlsx` | `GAYA` 76 lines, `JSL` 1 (36 bills) | 77 | 801 |
| Jun 2026 (1 to 18) | Mufti | `MUFTI_SALES_STOCK_DETAILS_JUNE2026.xlsx` | `LEEDEO` 40, `JSL` 10, `SAN` 10, `GAYA` 2 lines (38 bills) | 62 | 798 |

The six April vouchers hold 429 lines, 397 pieces and a gross `Price` of 14,32,688 (see 6.10 for the stores). The other inputs are `FORMAT_SALES_VOUCHERS.xlsx` (the header-only template), `KDPS-DIRECTION.xlsx` (a Flying Machine template for May 2026), `FM-offer-list.jpeg` and two phone photos. The June Blackberry workbook also has the sheets `BRAND REPORT` and `BILL SUMMARY` (6.9).

### 6.3 Reports per month

The second phone photo (`20260601_163404.heic`, one page of handwriting) lists brand, number of stores and number of reports:

| Brand on the page | Stores | Reports |
| --- | --- | --- |
| Mufti | 4 | 1 |
| BB (Blackberry) | 3 | 1 |
| LP | 6 | 6 |
| PE | 7 | 7 |
| AS | 10 | 10 |
| VH | 7 | 7 |
| Banjaran | 2 | 2 |

That is 34 reports a month: one per brand and Store, except Mufti and Blackberry, which are one report each across their Stores. `LP` matches the six April files. `Banjaran` is a brand (inferred; a PT file `BANJARAN.xlsx` exists in the PT folder). The files give no store names for the other brands.

### 6.4 The template

`FORMAT_SALES_VOUCHERS.xlsx` holds headers only.

- `SALES` has 14 columns: `Date`, `Vch/Bill No.`, `Particulars`, `Item Details`, `Brand`, `Size`, `Style Code`, `Barcode`, `Unit`, `Qty.`, `Price`, `Dis %`, `Dis ` (with a trailing space), `Total`. Title cell `A3`: `Voucher Series : LOUIS PHILIPPE  (From 01-04-2026 To 30-04-2026)`.
- `SOH` has 10 columns: `Date`, `Item Details`, `Barcode`, `Size`, `Style Code`, `Brand`, `Qty.`, `Unit`, `MRP`, `Total MRP`. Title cell `A3`: `Voucher Series : LOUIS PHILIPPE (From 01-04-2026)`.
- The delivered April files add an unlabelled column O (the AMM flag). The VAS-DEO file also has unlabelled columns P, Q and R holding the POS `Disc%`, `Disc Amt` and `Net Amount`. The Blackberry and Mufti May files have unlabelled P to R with the same three source values.
- Variants: the price column is `Price` (April, Mufti) or `MRP` (Blackberry); the discount column is `Dis ` (April), `Dis Amount` (Blackberry) or `Dis Amt` (Mufti); the stock unit column is `Unit` or `Units`. Blackberry's `SOH` has a store-tag column K in May and none in June; Mufti's `SOH` has an unlabelled column K with the store.

### 6.5 Raw POS lines to voucher lines (Bokaro, worked example)

Bokaro's raw `Sale` sheet has 90 lines and a totals row; the voucher `SALES` has the same 90 lines in the same order, plus its own totals row.

| Voucher column | Taken from raw `Sale` | Rule |
| --- | --- | --- |
| `Date` | `Bill Date` | mapped one to one |
| `Vch/Bill No.` | `Bill No` | mapped one to one |
| `Particulars` | (raw `Customer` is also `CASH`) | typed `CASH` on every line |
| `Item Details` | `Item` | copied |
| `Brand` | `Brand` | copied |
| `Size` | `Size` | copied |
| `Style Code` | `Design No` | copied |
| `Barcode` | `Barcode` | copied |
| `Unit` | none | typed `PCS` |
| `Qty.` | `Qty` | copied; a return stays negative |
| `Price` | `Gross Amt` | not `Rate` |
| `Dis %` | `Disc%` | a value |
| `Dis ` | `Disc Amt` | formula `=L/100*K` on the 29 `Discount` lines; a typed value on the other 61 (0, or the flat amount on the 4 gift lines) |
| `Total` | `Net Amount` | formula `=K-M` on the 29 `Discount` lines; a typed value on the other 61 |
| column O | unlabelled column N | the AMM flag as text |

Dropped: `Rate`, `Disc Amt` (replaced by the formula), `Net Amount` (replaced by the formula). Raw `Disc Amt` is positive in Bokaro and negative in the other stores' exports.

Three lines side by side (Bokaro; no customer data):

| Line | Raw `Gross Amt` / `Disc%` / `Disc Amt` / `Net Amount` / flag | Voucher `Price` / `Dis %` / `Dis ` / `Total` / O |
| --- | --- | --- |
| Trouser, `26-27/LBKR/3`, 1 Apr | 2,625 / 30 / 787.5 / 1,837.5 / `Discount` | 2,625 / 30 / `=L5/100*K5` = 787.5 / `=K5-M5` = 1,837.5 / `Discount` |
| T-shirt, `26-27/LBKR/5`, 2 Apr | 2,625 / 0 / 0 / 2,625 / `#N/A` | 2,625 / 0 / 0 (typed) / 2,625 (typed) / `No Discount` |
| Duffel bag `LPPROMOTBAG25028`, `26-27/LBKR/77`, 19 Apr | 7,999 / 0 / 7,850 / 149 / `#N/A` | 7,999 / 0 / 7,850 (typed) / 149 / `No Discount` |

Totals match the raw sheet: quantity 80, `Price` 2,80,131, `Dis ` 55,820.30, `Total` 2,24,310.70. Raw column N holds `Discount` on 29 lines, `No Discount` on 11 and `#N/A` on 49; the voucher shows `Discount` 29 and `No Discount` 61. Bokaro's raw sheet is already worked: its `Disc%` is 30 or 0 and the gift line carries the flat discount. It is not a plain POS export (inferred). For VAS-DEO, SANSKAR, HZB (Louis Philippe lines only) and Dumka, barcode, quantity and gross also match the raw sheet line for line; `Dis %` and `Total` do not (6.10).

### 6.6 The `Dis %` rule

The `discount-audit` skill (analyst work) sets `Dis %` (column L) as follows:

1. The AMM workbook must be open. An offer list (an `Offers` sheet, or one the user provides) gives the rate by category; the rate is never hard-coded; only offers effective on or before the bill date apply.
2. Column O holds the AMM flag (section 5.4).
3. `Dis %` is written as a value:
   - flag not `Discount`: 0;
   - a return (`qty<0`): 0;
   - the sale line directly above a return of the same style: 0, so the pair cancels;
   - otherwise the offer rate, for example 30.
4. A gift line (item a bag or backpack, or a style such as `LPPROMOTBAG*`): `Dis %` is 0 and `Dis ` links to the flat discount amount in the original sale sheet (`M{r}=Sale!L{r-3}`), so 7,999 − 7,850 gives 149. The skill adds that gift lines are not 30% giveaways and that the original sale sheet is the single source for their discount.
5. A style not found in the AMM list is treated as `No Discount`.
6. Acceptance test: no difference from a hand-made reference sheet (`refSale`).

A re-check of the six April vouchers against these rules finds that column O equals the list on all 429 lines, and `Dis %` differs from the rules as written on 25 lines:

| What the line shows | Lines | Where |
| --- | --- | --- |
| A return carries 30% (rule: 0) | 9 | HZB 3, VAS-DEO 6 |
| A suit, flag `Discount`, shows `Dis %` 0 and a typed `Dis ` that makes the total 9,999 (MRP 15,802, 17,909 or 12,999) | 9 | HZB 4, VAS-DEO 5 |
| A gift line (bag, backpack or `LPPROMO` style) carries a percentage (rule: 0 plus a flat amount) | 7 | SANSKAR 4 (belt-wallet combo at 30%), AS-DEO 2 (one belt-wallet combo at 30%, one backpack at 100%), HZB 1 (backpack priced 99 at 30%) |

The suit totals (9,999) fit Louis Philippe's `Flat 9999 ( MRP between 13001 to 18000 )` for MRP 15,802 and 17,909. Three VAS-DEO suit lines have an MRP of 12,999 and a total of 9,999, while the band for MRP up to 13,000 reads `Flat 7999`. The email gives 11 Apr as the start of the suit prices, while three suit lines dated 4 and 5 Apr show the same 9,999 total. An earlier suit offer would explain it; none is in the folder. Both points are OPEN (owner Brand manager).

Gift lines: 27 lines in four stores (VAS-DEO 20, SANSKAR 4, AS-DEO 2, HZB 1) have a voucher total that differs from the POS net amount; for example a VAS-DEO backpack shows 3,999 where the POS net was 99. Bokaro's 4 duffel bags carry the POS net of 149.

### 6.7 `KDPS-DIRECTION.xlsx` (Flying Machine, May 2026)

An Excel workbook with two sheets, `Sale Report May-26` and `SOH`. It is a formula template. The sale sheet's header reads `Voucher Series :` `FLYING MACHINE` and `From 01-05-2026 to 31-05-2026`.

- `Sale Report May-26` (`A1:U404`): rows 5 to 403 hold formulas only (399 rows) and row 404 holds subtotals of `Qty.`, `Price` and `Total`. The input cells (date, bill number, item, MRP, barcode, size, style, quantity) are empty.
- Header columns: `Date`, `Vch/Bill No`, `Particulars`, `Item Details`, `MRP`, `Barcode`, `Size`, `Style Code`, `Brand`, `Qty.`, `Unit`, `Price`, `Dis Amount`, `Total`, `BILL QTY`, `BILL VALUE`, `OFFER`, `OFFER PROPORTION`, `DISCOUNT %`, `EOSS FLAG`.
- Counters in `O1:S3`: `LAST BILL NO`, `T.QTY`, `REPORTED QTY`, `BALANCE TO DO`, `AVERAGE DIS %`, with formulas for each.
- `Price` = `Qty.` × `MRP`. `Total` = `Price` + `Dis Amount`.
- `Dis Amount` is a lookup of the `MRP` in an outside workbook, `FM APPAREL A4.xlsx` (a Downloads folder on a local drive; not supplied), sheet `Table 1`, range `B2:I147`, column 8. The workbook keeps a cached copy of that range (145 rows). Its headers are `Existing MRP`, `Old GST Rate`, `Old GST Amt`, `Base Value`, `New GST Rate`, `New GST Amt`, `New MRP`, `GST DIFF`. The `Existing MRP` runs from 1,059 to 9,500 with `Old GST Rate` 12% on every row. `New GST Rate` is 5% on 49 rows (up to MRP 2,799) and 18% on 96 rows (from 2,849). Old GST is MRP × 12 ÷ 112, base value is MRP less that, new GST is the base times the new rate, `New MRP` is base plus new GST, and `GST DIFF` is `New MRP` less `Existing MRP`. It is −6.25% of MRP on the 5% rows and about +5.4% on the 18% rows. So the `Dis Amount` of this template is the GST-change difference, not a brand-offer discount. Its purpose is not stated. OPEN, owners Accounts and the CA.
- `BILL QTY` and `BILL VALUE` total each bill number on its first line.
- `OFFER`: on rows 5 to 149 (145 rows) a bill value above 6,999 gives 1,000 and above 4,999 gives 500. On rows 150 to 403 (254 rows) a bill quantity of 2 or more gives 50% of the bill value and a quantity of 1 gives 40%.
- `OFFER PROPORTION` spreads the bill's offer over its lines in proportion to the line value (`L5/$P$26*$Q$26`). The anchor cells are fixed: `$P$26` and `$Q$26` on 375 rows, `$P$5` and `$Q$5` on rows 380 to 403 (24 rows), not the line's own bill.
- `DISCOUNT %` = `OFFER` ÷ `BILL VALUE`.
- `EOSS FLAG` = a lookup of the barcode in an outside workbook `1. ARVIND ALL BRAND AW'25 EOSS OFFER.xlsx` (`Sheet1!C3:L3445`, 10th column), defaulting to `EOSS`. The cached copy holds 3,443 rows: style code (column C), group (`CORE` 2,976, `OCOR` 467), season code (`CO25` 1,575, `CO26` 1,251, `OC25` 410, `CO24` 150, `OC26` 57), MRP (40 values), brand code (`US` 1,348, `AR` 1,020, `UD` 296, `FM` 289, `AN` 250, `AS` 240), category code, SKU code, size, product, and the value `NOD` on every row.
- `SOH` (`A1:L2001`): 1,067 rows with a barcode, 1,567 pieces, MRP total 38,48,486.10, all brand `FLYING MACHINE`, date text `01-05-2026`. Products: jeans 457, T-shirt 305, shirt 232, trouser 35, sweatshirt 23, jacket 15.

Probable defects (analyst work; likely, not certain):

- The slab tests use `>`; the Flying Machine list says `BUY 4999/-` and `BUY 6999/-`, which reads `>=`.
- `OFFER PROPORTION` anchors to a fixed row, not to its own row.
- The offer regime is chosen by row position, not by bill date.
- The `EOSS FLAG` looks up the barcode (column F) in a range whose first column (`C`) holds style codes, so it probably returns the default `EOSS` every time.
- Both outside workbooks are missing from the folder.

### 6.8 The `kdps-report` skill

`kdps-report` (input: brand and month; it runs inside Excel with `execute_office_js`) builds the two sheets end to end:

1. Step 0: find the source sheets by column header, not by name. Sales source: `Bill Date`, `Bill No`, `Item`, `Brand`, `Size`, `Design No`, `Barcode`, `Qty`, `Gross Amt`, `Disc%`. Stock source: `Item Name`, `Brand`, `Design`, `Size`, `Barcode`, `Tqty`, `Mrp`. Never overwrite a source sheet; make new sheets with a month suffix (`Sale Apr26`, `SOH Apr26`).
2. Steps 1 to 3: create the two sheets and their title and header rows (Cambria; the 14 and 10 columns of 6.4).
3. Step 4: read one dated cell to anchor the date serial of the month start.
4. Step 5: fill `SALES` line for line from the sales source and never reorder: `CASH`, `PCS`, `Price` from `Gross Amt`, `Dis %` from `Disc%`, `Dis ` as `=L/100*K`, `Total` as `=K-M`, returns negative. Step 5a fills blank dates and bill numbers from neighbouring values and flags them for review. Step 5b keeps dates inside the month. Steps 5c and 5d add the totals row and borders.
5. Step 6: check `SALES` before `SOH`.
6. Step 7: fill `SOH` line for line from the stock source: `Date` is the month-start serial on every row, `Brand` is the brand's short code on every row (for example `LP`), `Total MRP` is `=I*G`; add a totals row.
7. Step 8: read back and report counts and totals, and flag lines for review.

The skill names two other skills, `kdps-start-report` and `audit-xls`, which are not supplied. `discount-audit` runs after `kdps-report` (6.6).

### 6.9 May and June files

**Blackberry.** `BB-May` is one workbook for the brand with sheets `SALES`, `SOH` and `OFFER`.

- `SALES`: 137 lines, 120 pieces, `MRP` 3,91,807, `Dis %` 0 on every line (so `Total` equals `MRP`), 78 bills (`GAYA`, `JSL`). The unlabelled columns P to R hold the source `Disc%`, source discount and source net: source discount −41,191.95 in all; flat amounts of −3,300 (9 duffel bags, MRP 3,499), −2,956 (2 duffel bags, MRP 3,155), −600 (4), −300 (6), −200 (4), −400 (1), −179.95 (1; the one 5% line). The header says `01-05-2026 to 31-05-2026`; 52 lines are dated 20 to 30 Apr. Brand is `BLACKBERRYS` (108 lines) or `BLACKBERRY` (29).
- `SOH`: 911 rows, 1,363 pieces, MRP total 48,41,751, every row dated 1 Jun 2026, a store column (`GAYA` 826, `JSL` 55, `WH` 18, `VAS-DEO` 12), the head-office address line in the title, and three brand spellings (`BLACKBERRYS` 665, `BLACKBERRY` 232, `BLACK BERRY` 14). 891 barcodes; 20 repeat.
- `OFFER`: 10 rows (3.3).

`BB-Jun` (1 to 18 Jun):

- `SALES`: 77 lines, 71 pieces, `MRP` 1,92,149, `Total` 1,44,632.85. `Dis %` is 0 on 45 lines, 50 on 19, 40 on 11, 30 on 1 and 25 on 1; the 3 duffel bags show a flat −3,300 and a total of 199. The header says `to 30-06-2026`.
- `SOH`: 801 rows, 1,172 pieces, MRP total (computed) 42,34,150, every row dated 1 Apr 2026, no store column, brand `BLACKBERRYS`, `Total MRP` column blank. 65 of its barcodes are not in the May stock.
- `BRAND REPORT` (the 77 lines re-priced; title `BLACKBERRYS — BRAND SALES REPORT (June 2026, 1–18)`). Its note line reads `Discounts reconstructed from OFFER sheet + AMM list. Duffel bills → bag is the discount; non-duffel ≥₹6999 → cash-off; from 12-Jun → AMM per-item %.` Columns: `Date`, `Bill No`, `Item`, `Brand`, `Size`, `Style Code`, `Barcode`, `Qty`, `MRP`, `Offer Applied`, `Final Dis %`, `Final Dis Amt`, `Final Total`. `Offer Applied` takes the values `Full MRP`, `Full MRP (bag taken)`, `Duffel @₹199`, `Buy ₹6999 → ₹600 off`, `Buy ₹10999 → ₹1000 off`, `B-tier 30%`, `B-tier 40%`, `B-tier 50%`, `FLAT 25%` and `Fresh – No Discount`. The `B-tier` rate follows the number of items on the bill tagged with the tiered offer in `KL` (1 gives 30%, 2 or 3 give 40%, 4 or more give 50%). A cash-off is put on one line of the bill (₹600 on one shirt of bill 582, ₹1,000 on one pair of jeans of bill 589). Totals: `MRP` 1,92,149, discount −54,692.40, final total 1,37,456.60; against 1,44,632.85 in `SALES`, a difference of 7,176.25. These rules are the analyst's, not KDPS's.
- `BILL SUMMARY`: 36 bills with `Lines`, `Gross MRP`, `Offer Applied`, `Total Discount`, `Net Sale` and `Flags`; one flag (`exchange/return`, bill 26-27/GAYA/687). Offer labels such as `B-tier 40% (3 qualifying)` and `FLAT % (AMM)`.
- Against `KL`: 74 of the 77 lines carry a barcode that is in `KL` (3 are not). Of the 64 lines tagged with the tiered offer, 34 show `Dis %` 0 in `SALES`. 26 of those 34 are dated 1 to 11 Jun, before the tiered offer of 12 Jun. The other 8 are dated 13 Jun (3 single-line bills), 15 Jun (2 bills, 4 lines) and 16 Jun (1 line); the `BRAND REPORT` gives them 30% or 40%. One line tagged `Fresh` (bill 678) carries 50% in `SALES`; the `BRAND REPORT` gives it 0.
- `KL` against the May stock: all 888 barcodes of `KL` are in `BB-May`'s `SOH` with the same quantity; `BB-May` has 3 barcodes that `KL` lacks.

**Mufti.**

- `MU-May`: `SALES` 48 lines, 44 pieces, `Price` 1,34,556, `Dis %` 0 on every line, 42 bills (`LEEDEO`, `JSL`, `VAS`, `GAYA`). The sheet's header row is row 3 (the title is on one line: `List of Sales Vouchers :  MUFTI (From 01-05-2026 To 31-05-2026)`). Unlabelled columns P to R: source `Disc%` 0 on 38 lines, 20 on 7, 5 on 3; source discount −7,187.45 in all (two large: −2,000 on a 4,499 pair of jeans, 5 May; −1,000 on a 2,799 shirt, 20 May). `SOH`: 798 rows, 1,179 pieces, MRP total 37,30,221, every row dated 1 Jun 2026, header `MUFTI (From 01-06-2026)`, store column `JSL` 389, `LEE DEO` 209, `GAYA` 117, `WH` 83.
- `MU-Jun`: `SALES` 62 lines, 56 pieces, `Price` 1,72,944, `Total` 1,24,646.50, `Dis %` 0 on 26 lines, 100 on 9, 25 on 8, 20 on 8, 50 on 5, 40 on 4, 30 on 2; 38 bills (`LEEDEO`, `JSL`, `SAN`, `GAYA`). The header still says `From 01-05-2026 To 31-05-2026`. `SOH` has the same 798 rows, quantity and MRP total as May, with the same date (1 Jun). So the June file holds old stock beside new sales. No brand report or bill summary.
- The placeholder style `KDPS-DEGR-MF` is on 6 `SALES` lines in May, 5 in June and 56 `SOH` rows (68 pieces). Its meaning is not stated. OPEN, owner Brand manager.

### 6.10 Reconciliation: voucher against POS, April

Voucher gross (`Price`) equals the raw gross in all six stores, and quantity equals too. `Total` does not equal the POS net in five.

| Store | Voucher lines | Qty | Gross (raw = voucher) | POS net | Voucher `Total` | Voucher − POS | Lines where `Dis %` differs from POS `Disc%` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bokaro | 90 | 80 | 2,80,131 | 2,24,310.70 | 2,24,310.70 | 0 | 0 of 90 (raw already worked) |
| VAS-DEO | 138 | 126 | 5,13,902 | 3,06,131.35 | 4,29,045.90 | +1,22,914.55 | 34 of 138 |
| SANSKAR | 51 | 51 | 1,58,891 | 1,33,109.50 | 1,28,604.50 | −4,505.00 | 28 of 51 |
| HZB (Louis Philippe lines) | 99 | 92 | 3,36,894 | 2,80,091.40 | 2,56,983.90 | −23,107.50 | 50 of 99 |
| AS-DEO (`LP2 SALE `) | 35 | 32 | 95,902 | 73,726.90 | 70,382.40 | −3,344.50 | 16 of 35 |
| Dumka (`LP-SALE`) | 16 | 16 | 46,968 | 34,133 | 40,497 | +6,364 | not comparable: no `Disc%` in the raw sheet |
| All six | 429 | 397 | 14,32,688 | | 11,49,824.40 | | |

On the 128 differing lines in the four comparable stores, the voucher shows 30% on 98 (the POS had 0, 5, 10, 20 or 100) and 0 on 30 (the POS had 5, 10, 20, 25, 30, 60 or 100). So the voucher's `Dis %` is the brand-offer rate on lines flagged `Discount`, not a copy of the POS discount. Whether the customer received the voucher's discount is not stated. The voucher carries no customer data.

- HZB's raw sheet has 371 lines; 99 are Louis Philippe (brands `LOUIS PHILIPPE`, `LP`, `LY`, `LR`). The rest are Allen Solly (120 plus 11 `ALLEN SOLLY JUNIOR`), Van Heusen (82), Peter England (51) and a few others.
- AS-DEO's raw file has `AS SALE ` (178 lines) and `LP2 SALE ` (35 lines); only 5 of the 35 `LP2 SALE ` lines carry a bill date and bill number, and 42 of the 178 `AS SALE ` lines. All `LP2 SALE ` barcodes are rounded (`8909470000000` style); no barcode in the voucher matches the raw one.
- Dumka's raw file `LP_APRIL SALE REPOT_DUMKA.xlsx` has no header row and its net amount sits in column N on some lines and in column O on others.
- Bokaro's raw `Stock` (694 rows, 1,053 pieces, MRP 38,30,842) is not what the voucher `SOH` holds (6.11).

### 6.11 `SOH` lists

| Store | Rows | Pieces | MRP total | Dates | Header `From` | Source |
| --- | --- | --- | --- | --- | --- | --- |
| AS-DEO | 336 | 490 | 15,10,156 | 335 rows 1 Apr, 1 row 1 May | 01-04-2026 | `LP2 SOH ` |
| Bokaro | 336 | 490 | 15,10,156 | all 1 May | 01-04-2026 | **the same rows as AS-DEO** |
| Dumka | 240 | 379 | 11,29,578 | all 1 May | 01-04-2026 | `DUMKA_STOCK DETAILS APRIL2026.xlsx` sheet `LP` |
| HZB | 587 | 959 | 35,61,118 | all 1 May | 01-05-2026 | raw `Sheet2`, Louis Philippe rows with stock |
| SANSKAR | 1 | 1 | 2,625 | 1 May | 01-05-2026 | none: the raw file has no stock sheet |
| VAS-DEO | 839 | 1,178 | 40,87,960 | all 1 May | 01-05-2026 | raw `STOCK REPORT`, rows with stock |

Bokaro's `SOH` repeats AS-DEO's row for row (barcode, style, quantity, MRP). The skill says the date is the month start, which is 1 Apr for April; the files hold 1 May on nearly every row, and the header `From` varies. The Blackberry and Mufti files hold 1 Jun, and the June Blackberry file 1 Apr. Which day is right (opening on the first of the month, or closing on the first of the next) is OPEN. Brand codes in `SOH` are mixed (`LP`, `LOUIS PHILIPPE`, `LY`, `LR`, `LA`). VAS-DEO's `SALES` brand column mixes `LOUIS PHILIPPE` (89), `LP` (44), `LR` (3) and `LY` (2). Dumka's and AS-DEO's voucher totals rows have no `Price` total.

### 6.12 Who receives it, and what money follows

OPEN. Nothing in the files names the recipient, the scheme, the date due or the channel.

- Who receives each report, and under which agreement? Owner: KDPS Owner and Accounts.
- Is the `Dis ` column used for a reimbursement claim, for an audit by the brand, or only for reporting? What is paid, by whom, and when? Owner: Accounts.
- Which brands ask for which layout? Only the Louis Philippe layout, a Flying Machine template, and Blackberry and Mufti files are here; Peter England, Allen Solly, Van Heusen and Banjaran have none. Owner: Brand manager.
- May a brand report differ from the POS bill in the `Dis %`, and must it reconcile to receipts, bank settlement or credit notes? Owner: KDPS Owner, Accounts, the CA.

## 7. What the ERP must keep to produce brand reports and offer checks

The ERP can produce the brand reports and check offers only if it keeps the facts below on its own records. The PRD IDs were checked in [prd.md](../prd.md) and [kdps-policies.md](../kdps-policies.md). A "gap" is something the data needs that no PRD ID covers; it is a question for the product owner, not a design choice.

| What to keep | Fields the data shows are needed | PRD home | Gap |
| --- | --- | --- | --- |
| The bill and its line | Business date; bill number and series; Store; billing device; one row per line with a signed quantity | `PRD-POS-014` (items, prices, discounts, taxes, business date, operator, calculation-policy snapshots), `PRD-POS-020` (a bill series per billing device) | The old exports repeat bill-level fields only on a bill's first line in some files; the ERP keeps them on every line |
| The goods on the line | Brand as the brand names it; item name; style code (design number); size; barcode; MRP; season; the sub-brand code that begins the style code (`LP`, `LY`, `LR`, `VD`, `VW`, `AB`, `AH`...) | `PRD-MER-002` (SKU: style or article, colour, size), `PRD-MER-004` (season, gender, fit, category), `PRD-MER-006` (external barcodes and supplier codes, with scope and validity dates) | Brand and style spellings differ across files (`LP`, `LOUIS PHILIPPE`, `LY`; `BLACKBERRYS`, `BLACKBERRY`, `BLACK BERRY`). A report needs the brand's own spelling per brand, set once |
| Price and discount, kept apart | MRP; start price (price list or MRP); selling price; each discount with its source; each line's share of a group discount; tax | `PRD-MER-009`, `PRD-POS-003`, `PRD-POS-023`, `PRD-POS-024`, `PRD-OFR-004` | The brand view (`Dis %` by offer rate) and the customer view (what the POS gave) differ in the April files (section 6.10). The ERP can keep the real discount; the brand view is derived and needs its own label |
| The offer behind each discount | Offer identity and version; its kind; threshold; rate or amount; which lines earned a group discount; which unit was the reward unit | `PRD-OFR-001`, `PRD-OFR-002`, `PRD-OFR-003`, `PRD-OFR-021`, `PRD-POS-014` | The old POS shows a free unit as a 100% line, and the gift as a line sold at a token price. `PRD-POS-023` spreads a group discount instead. Whether a brand report needs the reward unit named is OPEN |
| A return or exchange | The original line; the refund at the paid value; the exchange on the same bill | `PRD-RET-005`, `PRD-RET-024` | How a returned line shows in a brand report (0%, or the sale's rate) is not written |
| Salesperson | One salesperson per line, separate from the cashier | `PRD-POS-002` | The Singh More daily sales sheet has `Sale Person` empty on its sale lines |
| An offer record | Brand; kind; threshold and basis; rate, amount or price; free-unit rule; gift item and token price; scope (style list, category, gender, sub-brand, Store group, channel); exclusions; alternatives; start and close dates (an open end is flagged); the source (email, artwork, date received); who approved | `PRD-OFR-001`, `PRD-OFR-002` (approval before activation; retain combination rules, source and cost shares), `PRD-OFR-003`, `POL-19.01`, `POL-19.04` | Section 4.3: kinds not in `PRD-OFR-001` (count tiers, gift at a token price, flat price per MRP band, price for a pair, fallback when a gift is out, alternatives) |
| Who pays | Brand and Organisation share per offer; the brand's agreement | `PRD-OFR-002`, `PRD-OFR-006`, `PRD-ORG-016`, `POL-19.02`, `POL-19.05` | No share is in any file |
| A brand's list of eligible styles | Brand; style code; flag (`Discount` or `No Discount`); reason; as-on date; source reference (mail or approval); division; product; season; MRP. A new version replaces the list on a date | `PRD-OFR-001` (offers by item), `PRD-MER-006` | No requirement for such a list (section 5). Missing styles need a rule: 36% of the April lines were not in the list |
| Gift stock | The gift as its own SKU; the invoice that brought it in; the token price; availability per Store | `PRD-MER-002` | The hidden sheet `Arvind & LC Invoice Details.` of `KDPS INVOICE & OFFER DETAILS..xlsx` has three invoices with booking status `PROMO` (10 and 11 Sep 2025; 80 pieces; billing 48,959 against MRP 48,920), and a remark on another invoice: duffel bag 5, backpack 10 and trolley 2, "promo also billed". Gifts are bought at about MRP and sold at a token price. How the cost of the gift is shared is OPEN |
| The brand report itself | A sales list and a stock list per brand, Store and month; a header line with the brand and the period; the layout each brand wants; an as-of time on the stock list | `PRD-MOD-003` (reports read declared read models with as-of timestamps) | No PRD ID names a brand-facing monthly report. `PRD-EXC-012` is brand sell-through reports for KDPS; `PRD-EBO-001` imports brand-software reports; `PRD-EBO-009` is the EBO brand-settlement statement (stage 5). The stock date (first of the month, opening or closing) is OPEN |
| Brand support and claims | Debit requests, supplier credit notes, quantities, amounts, applied and paid | `PRD-OFR-018`, `PRD-OFR-019` | The debit-note type `EOSS CREDIT NOTES` and the claim type `MONTHLY TARGET INCENTIVE` are only drop-down values in `KDPS DEBIT & CREDIT NOTE DETAILS.xlsx` |
| Staff slabs funded by a brand | Net sale value slab; who is paid; the brand's evidence | `PRD-HRM-010`, `PRD-HRM-013` | The Linen Club note is unexplained |
| Tax rules and price changes | Effective-dated rate and value rules by goods class | `PRD-TAX-005` | The GST-change table behind `Dis Amount` in `KDPS-DIRECTION.xlsx` and Peter England's `PE GST benefit` need the CA |
| Reports built from the earlier POS | Imported sales and stock for checking and reports only | `PRD-LIF-010`, `PRD-LIF-014` | None |

The same facts also let the ERP answer the checks the files try to do by hand: which offers were in force on a bill's date, which style was eligible, which rate the offer gave, and what the customer actually paid.

## 8. Open questions

"Stage 4" is the stage that needs the Offers and promotions policy (PRD "Required policy configuration"). Brand reports are not placed in any stage. Items marked "in `questions-for-kdps.md`" are already asked there under that number at the time of writing; the full list for all notes goes to [open-questions.md](open-questions.md).

| # | Question | Owner | Blocks |
| --- | --- | --- | --- |
| 1 | Which offers may combine (percentage with bill-value, brand offer with a Store or manual discount), and in what order? No file states any combination | KDPS Owner with the Brand manager | Stage 4. In `questions-for-kdps.md` item 27 |
| 2 | For each brand offer, what share does the brand pay and what share does KDPS pay, including the cost of a gift sold at a token price? | KDPS Owner, Brand manager, Accounts | Stage 4. Item 27 |
| 3 | Who receives each brand report, under which scheme, and what is the `Dis ` column used for: a reimbursement claim, an audit by the brand or only reporting? What is paid, by whom, and when? | KDPS Owner, Accounts | No stage placed |
| 4 | May a brand report's `Dis %` differ from the discount the POS gave, and must the report reconcile to receipts, bank settlement or credit notes? | KDPS Owner, Accounts, the CA | No stage placed |
| 5 | What are the Mufti 20% and 30% lines (June) and the Blackberry flat 200, 300 and 400 lines (May) with no matching offer row: manual discounts? | KDPS Owner | Stage 4. Item 55 |
| 6 | What does the note `NSV - 24lakh 1% 28lakh 2% 34lakh 3%` / `Deo 1staff` beside the Linen Club row mean, and who does it pay? | KDPS Owner, HR | Stage 6 |
| 7 | What do `AMM`, `NOD`, `HOAS`, `HOVH`, `VS`, `VD`, `VX`, `VF`, `VW`, `TR`, `S&J`, `AFI`, `ROC` and `Q code` stand for? Which KDPS Stores are `HOAS`, `HOVH` and `MBO` for offers? | Brand manager; Operations (Stores) | Stage 4 |
| 8 | Who owns the AMM list, how often is it refreshed, how is a new style added, and how must a style missing from it (153 of 429 April lines) be treated? Are `TR Line` and `Core` permanent? | Brand manager; KDPS Owner (missing styles) | Stage 4 |
| 9 | Please send the lists the offers point to: Peter England's attachment; Van Heusen's AMM list; Allen Solly's AMM and NOD lists; Libas' `ACCORDING SHEET`; Blackberry's AMM list for suits, blazers and waistcoats | Brand manager | Stage 4 |
| 10 | Which email or artwork is the live source for each offer, what are the close dates behind the 9 `Not Disclosed Yet.` lines and Allen Solly's `Further communication`, and what are the dates and year of Blackberry's undated rows and of Louis Philippe's table? Is there any Peter England offer for April or May and any Louis Philippe offer before 4 Feb? | Brand manager | Stage 4 |
| 11 | Does a spend threshold count MRP or the price after other discounts? Is the threshold itself included? Does it count one bill, one brand or one sub-brand? Does a gift count towards the spend? When two slabs fit, which applies? | Brand manager; KDPS Owner (approver) | Stage 4. Item 56 |
| 12 | In "B1@20% B2@30%" does the higher rate apply to every item or only the second? In "B1G1" and "B2-G1" which item is free and how many items are needed? What does "B2@1599" mean, and is `Flat price Off` (Peter England) a price or an amount? | Brand manager; KDPS Owner (approver) | Stage 4. Item 56 |
| 13 | Blackberry's bag: ₹99 on a spend of 6,995 in the `OFFER` sheet, ₹199 in the POS (MRP 3,499 or 3,155). Which terms are current? | Brand manager | Stage 4 |
| 14 | Louis Philippe suits: which price applies for MRP 12,999, for MRP 18,001, and before 11 Apr? | Brand manager | Stage 4 |
| 15 | Which offers may a gift promo run alongside, and may a gift promo run in a `FRESH` period? | Brand manager | Stage 4 |
| 16 | What is `Dis Amount` in the Flying Machine template (a lookup of `GST DIFF` by MRP from `FM APPAREL A4.xlsx`)? What is Peter England's `PE GST benefit` (11.02%, 6.25%, `FLAT`)? Is a GST-rate pass-on meant? What is the GST value of a gift sold at a token price? | Accounts, the CA | Stage 2 (goods and rate classification) |
| 17 | How is the `Dis ` column of a brand report turned into a claim, and how is the debit-note type `EOSS CREDIT NOTES` used? How is a returned line shown in a brand report? | Accounts | Stage 5 (claims) |
| 18 | The stock list date: first of the month (opening) or first of the next month (closing)? Is Bokaro's stock list meant to be Bokaro's own (694 rows) and not AS-DEO's? Where is Sanskar's stock? | Accounts, Operations | No stage placed |
| 19 | What does the placeholder style `KDPS-DEGR-MF` on Mufti lines and stock mean? | Brand manager | No stage placed |
| 20 | Which layout does each brand want (Peter England, Allen Solly, Van Heusen, Banjaran, Flying Machine, Blackberry, Mufti)? Which Stores report for which brand? The two outside workbooks of the Flying Machine template (`FM APPAREL A4.xlsx`, the Arvind AW'25 EOSS offer list) and the `Offers` sheet the skill expects: please send them | Brand manager, Accounts | No stage placed |
| 21 | Gifts at a token price, count-tier percentages, flat prices per MRP band, a price for a pair, a cash-off fallback and "X or Y" alternatives have no kind in `PRD-OFR-001`. Should the PRD add them, and does a brand report need the reward unit named? | Product owner | Stage 4 |
| 22 | Should the PRD hold a brand's eligibility list with a flag per style, a reason, an as-on date and an approval reference, and a brand-facing monthly report? | Product owner | Stage 4 for the list; no stage for the report |
