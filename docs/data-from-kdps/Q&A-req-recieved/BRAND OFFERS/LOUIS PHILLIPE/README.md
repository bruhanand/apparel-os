# LOUIS PHILLIPE

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [BRAND OFFERS](../README.md)

## What this folder is

Two phone screenshots (JPEG) of one email from the Louis Philippe (LP) trade team about LP offers. The folder name keeps the spelling "PHILLIPE"; the brand is Louis Philippe. Not made by KDPS. Both files were saved on 13 Jun 2026 (file dates, 02:45 and 02:46).

- `LP MAY.jpeg` is 953 x 1600 pixels and shows the whole email table (nine rows).
- `LP APRIL.jpeg` is 720 x 1155 pixels. It is the same email, cut off lower down: it shows the same header and the first eight table rows, and stops before the 21-May row. It is not a separate April email. The email is the same one (same sender line, same time 16:50, same text). Its name is therefore misleading: there is no Louis Philippe email for April here.
- `PE MAY.jpeg` in the [PETER ENGLAND](../PETER%20ENGLAND/README.md) folder is byte-identical to `LP MAY.jpeg` (same MD5 checksum, same size 85,795 bytes). It is not a Peter England offer.
- The sender's name and the internal mailing-list name are visible in the header. They are not copied here. The email is addressed to the LP trade team and one more recipient.

## The email

- Text: the email is addressed to the team. It says a new ABV offer has been added and that only the offers in the table below are active. A further line asks a colleague to share the artwork for the ABV offer. The sign-off is cut off at the bottom of the screenshot.
- Because the email says only the listed offers are active, the table replaces any earlier LP offer list. Earlier lists are not in this folder.
- The table has seven labelled columns and one unlabelled last column. Dates show day and month only (the year is not shown; 2026 is assumed from the file dates and the other brands, inferred).

Columns: `Start Date`, `DESCRIPTION`, `Applicable Categories`, `Brand`, `Remarks`, `Region`, and an unlabelled last column holding "No Change in Offer" or "New".

| # | Start date | Description | Applicable categories | Brand (sub-brands) | Remarks | Region | Last column |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 04-Feb | Buy 1- Get 30% | All Categories except Winter Wear | All Sub Brand (LP, LY, LA, LX, LR) | AMM | All | No Change in Offer |
| 2 | 04-Feb | Buy 1 - Get 30% | Winter Wear & Tweed | All Sub Brand (LP, LY, LA, LX, LR) | All Codes | All | No Change in Offer |
| 3 | 04-Feb | Buy 1 - Get 1 | Winter Wear & Tweed | All Sub Brand (LP, LY, LA, LX, LR) | All Codes | All | No Change in Offer |
| 4 | 04-Feb | Flat 40% Off | Foot wear and Acc | All Sub Brand (LP, LY, LR, LA, LX) | AMM | All | No Change in Offer |
| 5 | 04-Feb | Promo offers | All Categories | All Sub Brand (LP, LX) | NON AMM | All | No Change in Offer |
| 6 | 11-Apr | Flat 7999 ( MRP till 13000 ) | Suits | All Sub Brand (LP, LY, LR, LA, LX) | AMM | All | No Change in Offer |
| 7 | 11-Apr | Flat 9999 ( MRP between 13001 to 18000 ) | Suits | All Sub Brand (LP, LY, LR, LA, LX) | AMM | All | No Change in Offer |
| 8 | 11-Apr | Flat 12999 ( MRP Greater than 18001 ) | Suits | All Sub Brand (LP, LY, LR, LA, LX) | AMM | All | No Change in Offer |
| 9 | 21-May | Shop for MRP 7999 and get 750 Off | All Categories | All Sub Brand (LP, LY, LA, LX, LR) | AMM | All | New |

- Rows 6 to 8 have a green highlight on the description cell.
- The only row marked "New" is the 21-May row (`ABV` offer, as the email text says).
- There is no end date on any row. No row gives the style list; "AMM", "All Codes" and "NON AMM" refer to lists that were not sent.
- The Suits rows are written as flat figures by MRP band: up to 13000, 13001 to 18000, and "Greater than 18001". As written, an MRP of exactly 18001 falls in no band. Whether the flat figure is the selling price or an amount off is not stated; "Flat 7999 ( MRP till 13000 )" reads as a selling price (inferred).
- Row 5 "Promo offers" gives no mechanics. It applies to LP and LX only and to NON AMM styles.

## Words as written

- Sub-brand codes `LP`, `LY`, `LA`, `LX`, `LR` are the Louis Philippe sub-brand codes. In `SUPPLIER BRAND DETAILS.xlsx` each of them is a brand name mapped to MADURA PVT LTD (the brand name `LOUIS PHILIPPE` itself maps to ADITYA BIRLA LIFESTYLE BRANDS LIMITED).
- `ABV`: a bill-value offer ("Shop for MRP 7999 and get 750 Off"). The email measures it on MRP ("Shop for MRP 7999"), the only one of the four brands that says so.
- `AMM` and `NON AMM`: not defined (guess: style lists; see [ALLEN SOLLY](../ALLEN%20SOLLY/README.md)).
- `Region`: "All" on every row. No region split is shown.

## What the screenshots do not say

- The style list behind AMM, and which styles are "NON AMM" for the LP and LX promos.
- What the "Promo offers" row gives.
- Whether the 21-May bill-value offer combines with the Buy 1 Get 30% rows.
- Whether the percentage offers apply to the sold price or the MRP.
- The year of each date, and whether the 04-Feb rows are still running (the email says only the listed offers are active).
- Who funds each offer.

## Related notes

- Offer vocabulary and stacking observations: [offers-and-brand-reports.md](../../../../data-notes/offers-and-brand-reports.md).
- Brand to supplier and the two-letter brand codes: [item-master-vocabulary.md](../../../../data-notes/item-master-vocabulary.md) and [purchases-and-supplier-notes.md](../../../../data-notes/purchases-and-supplier-notes.md).
- The April 2026 Madura billing extract carries these sub-brand codes (`LP`, `LY`, `LR`) on 1,069 KDPS lines. See [PT FILE](../../PT%20FILE/README.md).
- The April 2026 Louis Philippe sales-voucher and stock workbooks (one per Store) use an LP offer rate and are described in [monthly-reports-april-may-2026](../../../monthly-reports-april-may-2026/README.md).

## Open questions

- Product owner: which styles are AMM and NON AMM for Louis Philippe, and what does the "Promo offers" row give? Blocks Stage 4 (store day: offers and price lists).
- Brand manager (P-BRM): is there a separate Louis Philippe email for April, and what is the source for the year of each start date? Blocks Stage 4.
- Product owner: are the Suits flat prices selling prices or amounts off, and how is a Suit at an exact band edge priced? Blocks Stage 4.
- KDPS Owner or Accounts: who funds each LP offer? Offer approval keeps the brand and company cost shares (`PRD-OFR-002`). Blocks Stage 4.
