# 05-reference-data

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [data-from-kdps](../README.md). Notes: [docs/data-notes](../../data-notes/README.md).

## What this folder is

- Reference material for the ERP team rather than operating data: the KDPS logo, the blank PT file template that staff and vendors are given, and a subfolder of four vendor documents.
- The logo is a KDPS brand file. The template was saved by an ERP-team member on 8 Jun 2026 (the author field names that person), so the copy here is the ERP team's. It is the template behind the filled copy in `../KDPS PT FILE SHEET.xlsx` (see the [top README](../README.md)).
- Files: 2 here plus 4 in `vendor-files/` (6 in all).

## Files

### `KDPS-logo.png`

- **What it is.** A PNG, 350 by 87 pixels, RGBA, 13,808 bytes (file dated 6 Jun 2026).
- **What it shows.** A four-petal flower in red (top), orange (right), blue (bottom) and green (left), crossed by a needle with a thread. A wordmark follows in white on a transparent background, so it is only legible on a dark background. It is a KDPS brand asset for screens and print (inferred).
- **Made by.** KDPS (the brand owner).
- **Sensitive.** None.
- **Notes.** None: it is an asset, not data.

### `pt-file-format.xlsx`

- **What it is.** The standard PT file format: a blank KDPS PT workbook with the master lists and one empty work sheet. It is what a person or a vendor copies to prepare a PT (price ticket) file. The PRD defines `BASIC`, `P RATE` and `NAG` for this layout in "Words used" ([prd.md](../../prd.md)) and lists these columns as the KDPS export profile (`PRD-PTW-008`).
- **Made by.** The ERP team (author and last-saved fields name an ERP-team member). Created and saved on 8 Jun 2026 between 10:30 and 10:32 UTC. Not a file KDPS sent.
- **Real format.** A genuine `.xlsx` saved by Excel for Mac. No hidden sheets.
- **Sheets (2).**

| Sheet | Used range | Header row | Filter | Freeze | Data rows |
| --- | --- | --- | --- | --- | --- |
| `Master Sheet` | `A1:V999` (data in `A1:L591`) | 1 | `A1:L591` | none | lists only |
| `"OWNER" Work Sheet` | `A1:AA2342` | 2 | `A2:W2342` | `A3` | 0 (blank template) |

- **`Master Sheet`.** Header row 1, 12 columns, counts exclude the header: `SEASON` 22, `BRAND` 590, `COLOR` 23, `GENDER` 5, `SUB CATEGORY` 9, `TYPE` 7, `ITEM` 95, `FIT` 75, `SIZE` 134, `GST %` 4, then a second `SUB CATEGORY` (K) and `TYPE` (L) with 95 values each that map the `ITEM` on the same row to its sub category and type. The meaning of each list and the quirks (price tiers inside `COLOR`, typos in `FIT`, mixed units in `SIZE`) are in the block for `../pt-master-sheet.xlsx` in the [top README](../README.md).
- **Older than the KDPS copy.** Against the `Master Sheet` of `../KDPS PT FILE SHEET.xlsx`: it lacks the brands `NOSTRUM` and `TOMBOY` (590 against 592), the items `BOTTLE`, `BUNDY` and `CARDIGAN` (95 against 98) and the size `6XL` (134 against 135). Rows from about row 66 of the `SIZE` column shift because of the missing size, so 82 cells differ. Seasons, colours, genders, fits, GST values and sub categories match. The `Master Sheet` in the KDPS copy (file dated 21 Jun 2026) is the newer list.
- **`"OWNER" Work Sheet`.** Header row 2, columns A to T: `SEASON`, `BRAND`, `COLOR`, `GENDER`, `SUB CATEGORY`, `TYPE`, `ITEM`, `FIT`, `SIZE`, `BARCODE`, `DESIGN`, `HSN`, `QTY`, `MRP`, `BASIC`, `P RATE`, `INPUT TAX`, `OUTPUT TAX`, `NAG`, `MARGIN`; column U blank; `SUGGESTED SUB CATEGORY` (V) and `SUGGESTED TYPE` (W).
  - Row 1 holds `SUBTOTAL(9, …)` over `QTY`, `MRP`, `BASIC`, `P RATE` and `NAG` for rows 3 to 2342.
  - Formulas are pre-filled in `P` to `T`, `V` and `W` down to row 2342: `P RATE` = `BASIC` × 1.2; `INPUT TAX` and `OUTPUT TAX` by the rules described in the `KDPS PT FILE SHEET.xlsx` block of the [top README](../README.md) (5 or 18 by item and by `BASIC` or `MRP` against 2500 and 2625); `NAG` = `QTY`; `MARGIN` = (`MRP` − `P RATE`) × 100 / `MRP`; the suggested columns look the item up in the `Master Sheet` and show `WRONG ITEM` or `PLEASE RECTIFY ` on a miss.
  - 11 drop-down rules for rows 3 to 2342: columns A to I take lists from the matching `Master Sheet` columns (`BRAND` is split into two rules, `B3:B773` and `B774:B2342`), and `INPUT TAX` and `OUTPUT TAX` (`Q:R`) take the `GST %` list, with the prompt "Click and enter a value from range". The rules sit in Excel's extension block, so a reader that ignores extensions (openpyxl does) sees none; a first reading of this file found "no drop-downs" for that reason.
- **Leftovers.**
  - An external link to a local copy of `KDPS PT FILE SHEET.xlsx` in a Downloads folder (`../../Downloads/KDPS%20PT%20FILE%20SHEET.xlsx`), which is not here.
  - Defined name `BRAND` = `'Master Sheet'!$B$1:$B$999`, and `EmptyList` = `#REF!` (broken).
- **Role.** Shows the PT columns and drop-down vocabulary KDPS expects. It is not a vendor's layout: vendor PT files arrive in their own layouts (see [Q&A-req-recieved/PT FILE](../Q&A-req-recieved/PT%20FILE/README.md)).
- **Sensitive.** None. No data lines.
- **Notes.** [pt-file-layouts.md](../../data-notes/pt-file-layouts.md), [item-master-vocabulary.md](../../data-notes/item-master-vocabulary.md).

## Subfolders

- [vendor-files/README.md](vendor-files/README.md): a supplier ledger from KDPS's Tally, a supplier's own ledger of KDPS, one photographed vendor tax invoice, and the PT file made for that invoice.

## Open questions

Full list: [open-questions.md](../../data-notes/open-questions.md).

- Who keeps the master lists current (brands, items, sizes, colours), and who approves a new value? Owner: KDPS Owner (Booking and Admin personas, `P-BKG`, `P-ADM`, do the work). Blocks the item master in stage 1.
- May the KDPS logo be used on screens, receipts and labels, and in which version? Owner: KDPS Owner. Blocks the UI design language only.
- Do vendors fill this template, or only KDPS staff? The vendor files sent so far use the vendors' own layouts. Owner: KDPS Owner. Blocks the stage 2 goods-in design.
