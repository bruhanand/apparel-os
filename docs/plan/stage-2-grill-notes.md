# Stage 2 grill notes (19 and 20 Oct 2026)

Working notes from the stage 2 grill. Not a plan and not a decision record: only what is named as a `DEC-` entry is in `decisions.md`, the PRD or the policies. The 19 Oct notes were in a git stash that was later dropped; they were recovered on 20 Oct 2026 (branch `saved/stage-2-grill-notes-19-oct`).

From 20 Oct 2026 the grill combines the current documents with the earlier RetailsOps goods plan (`change-prd-goods-to-store-acceptance.md` in the KDPS repository, outside this one). Its "stage 1" ran from booking to acceptance at the Store, transfers included, so it spans our stages 2 and 3.

## How the owner wants the grill run

- The product owner takes every decision. KDPS adapts to what is built. No question is parked as "KDPS's to decide".
- Plan the whole application. Do not design around what KDPS does today (data notes, their sheets, vendor file variety). The PT file format is fixed.
- Ignore the side-by-side test. The earlier-POS test imports (`S2-F12`) are parked.
- Order: stage 2 scope, then stage 1 leftovers, then the goods flow step by step.
- Ask; don't assume. The last round (booking, invoices, damage, reports) was rejected because its recommendations were built on assumptions.

## Answers the owner gave

- Plan stage 2 now, alongside stage 1's last ticket.
- One goods-in design document, approved section by section.
- Build lanes are decided after the mapping.
- **Flow (owner's words):** goods arrive with an invoice → count → GRN → PT made from the received invoice or the supplier's file → PT made → inward into the system. PT making has many combinations; the owner has a lot of knowledge to share there, in its own discussion.
- **Arrival:** every delivery comes with its invoice, always. Normally one invoice per vendor or brand. Several invoices on one delivery may be allowed, but one delivery gets one GRN and one PT.
- **Count:** matched against the invoice (not blind), by hand, no scanning for the GRN. Several people may count; the process is the same whatever the size. Match with the invoice, then create the GRN.
- **Discrepancy words:** shortage, excess, wrong, unidentified, damage. Accepted as proposed (shortage and excess measured against the invoice; wrong = a known product not on the invoice; unidentified = matches no product).
- **Excess, wrong, unidentified:** keep it simple and flexible; rare. Each such line can be received or recorded as not received.
- **Damage at the count:** held at once, a damage report raised, a different person confirms or rejects.
- **Miscount after the GRN:** a linked recount, approved by a different person.
- **Follow-up:** Booking for shortage, excess, wrong and unidentified; Operations for damage.
- **Barcoding** is done inside PT making, before the PT is final.
- **When stock is real:** once the PT is finished, the stock is real in the application, priced and costed, and can be sold or moved. Selling happens only through the POS.

## Round 1, 20 Oct 2026 (combining with the old plan)

Where the old plan, the PRD and the 19 Oct answers already agree, carried into the design without a question: only the count creates custody and the GRN holds quantities, never value; one Arrival has one count and one GRN, and a miscount is a linked recount approved by a different person; damage is held at once and a different person confirms or rejects it, a rejection clearing only that hold; an approved PT is frozen and corrections are linked records that check what was already used; an unknown cost or identity stays Unknown, never zero; labels print from frozen PT values, with every print and reprint kept.

Answers (the product owner accepted each recommendation):

1. **Where stage 2 ends.** At accepted stock at the receiving Site, as `phases.md` says. Transfers, supplier returns, write-off, disposal and counts stay in stage 3; the old plan's transfer and return rules are used when stage 3 is designed.
2. **When goods become sellable.** ~~Finishing the PT includes the barcode check and acceptance in one step.~~ Corrected in round 10 (`DEC-135`): after PT approval the goods are scanned in at the Site; only then are they sellable at a Store. `PRD-REC-021`, `PRD-REC-022` and `PRD-STK-003` stand.
3. **Money in stage 2.** As the PRD says (`PRD-STG-002`): PT approval values the stock and posts balanced journals. The old plan's no-books rule is not taken. Corrected with goods-in design 6.3 (approved 21 Oct 2026): since `P RATE` includes handling and transportation (`DEC-140`), the journal's other side is a receipt account set by Accounts and the CA, not the supplier's payable; what the supplier is owed comes from invoice matching in stage 5.
4. **Taking in excess, wrong or unidentified goods.** The receiver records the line; a different person from Booking approves taking it in (`PRD-REC-013`, `POL-17.02`, `POL-17.11`).
5. **One delivery is an Arrival** (`DEC-128`). Batch keeps its lot-and-expiry meaning.
6. **PT making** is deferred: the product owner will open it. Agents do not raise it, including supplemental PTs, the costing profile per brand and the value of damaged goods.

## Round 2, 20 Oct 2026

1. **Goods owned before they arrive.** Inbound ownership stays in stage 2, as the PRD says (`PRD-ORG-017` to `PRD-ORG-019`, `PRD-ACP-020`).
2. **Booking (owner's words).** A booking is made by brand, season and destination, with lines of style code, colour, size and quantity. Terms come from the brand. The PRD's other booking rules stay: approval against open-to-buy, ordered, delivered, outstanding and cancelled quantities, late-delivery follow-up, supplier confirmations, commitment and cancellation rules, and the actual supplier named (`PRD-BKG-001` to `PRD-BKG-011`, `PRD-BKG-013`, `PRD-BKG-014`).

## Round 3, 20 Oct 2026 (owner's words, booking)

1. **Booking terms** are filled according to the signed MOU with the supplier or the brand (the recommendation that the brand's terms fill in and a booking may change them was declined). What exactly this means is asked in round 4.
2. **Every booking line has a style code.**
3. **How a booking is recorded and linked.** Someone uploads a document with the supplier, brand, destination, season and, per item, style code, colour, size and quantity ("can be present"). It is only a booking record. When the GRN is created it is linked to that booking. One booking can arrive in several Arrivals. Mostly lines will match; a line that does not match goes for review.
4. **Booking data.** Header: supplier, brand, terms according to the brand, destination, season. Per item: style code, size, quantity and colour can be present.
5. **GRN format** follows industry standards. A layout is to be drafted for the design from common practice ([grn-standard-fields.md](../research/grn-standard-fields.md)), keeping the round 1 rule that the GRN holds quantities, never values.

## Round 4, 20 Oct 2026 (booking)

1. **Terms from the signed MOU.** The MOU is recorded once as the supplier's or brand's Agreement (the PRD's word), with the signed copy attached. Every booking takes its terms from it and never differs. This removes the per-booking changes of `POL-01.02`, `POL-01.08` and `POL-01.14` and changes `PRD-BKG-002`; to be logged as a decision first.
2. **Required item fields.** Style code and quantity on every line; colour and size optional, for orders placed at style level.
3. **How a booking gets in.** There is no fixed template. The booking document arrives as a photo or a PDF; AI reads it and adds the booking lines as a draft; manual entry stays open (`PRD-SEC-003`).

## Round 5, 21 Oct 2026 (booking)

1. **Prices on booking lines.** Each line carries an indicative cost and an MRP, for the booking's totals and the open-to-buy check only; they never become the receipt cost.

Booking is written up: `DEC-129` (terms only from the Agreement), `DEC-130` (lines, prices, match to the GRN), `DEC-131` (read from a photo or PDF by AI, manual entry open). Two small booking points are open as RR-543 (which Agreement when both the supplier and the brand have one) and RR-544 (which Agreement version a booking follows after a revision).

## Round 6, 21 Oct 2026 (booking)

1. **Which Agreement.** The brand's; separate supplier terms are not needed now.
2. **A revised Agreement.** A booking's terms are fixed at its approval: it keeps that version and takes a later one only when approved again.

Both written as `DEC-132`; RR-543 and RR-544 closed. Booking is settled.

## Round 7, 21 Oct 2026 (GRN)

1. **GRN header.** GRN number and date; receiving Site; supplier and brand; each invoice's number and date; transporter; lorry receipt number and date; vehicle number and e-way bill number (both optional); number of cartons; carton, seal and damage photos (`PRD-REC-007`); who counted and who received ([grn-standard-fields.md](../research/grn-standard-fields.md)).
2. **Issuing the GRN.** The receiver issues it after the count, with no second approval; later corrections need a different person.
3. **Invoice first.** Every Arrival records at least one supplier invoice before its count starts (`DEC-133`).

GRN is settled, apart from what PT making decides.

## Round 8, 21 Oct 2026 (reports and stock search)

1. **Reports.** The PRD's stage 2 list as the default (booking status, receipt problems at the count, supplier fill rate and timeliness with damage, stock by product, size, location, condition and owner); details are the builders' defaults. The PT accuracy report waits for PT making.
2. **Stock search.** As `PRD-STK-006`, each result showing physical, available-to-sell and held quantities apart; a warehouse shows available to move instead of available to sell.
3. **Past dates.** Not in stage 2: current stock only, with its as-of time.

## PT file, opened by the owner, 21 Oct 2026

- **Order of work:** the operational flow first: booking, then the Arrival at the Site with its invoice, then the GRN, then the PT file. Reports and search take defaults.
- **First version:** the PT is made only by uploading a PT file for a GRN. The PT workbench is designed later, by the owner.
- **Format:** KDPS's own fixed PT template ([pt-file-layouts.md](../data-notes/pt-file-layouts.md) section 1; the 20 columns of `PRD-PTW-008` plus the two `SUGGESTED` columns).
- **Who:** whoever is assigned makes the file by hand and uploads it. The upload is what makes the stock real, to sell at a location.
- **Fixed vocabulary:** KDPS's PT values come from its fixed master sheet (`docs/data-from-kdps/pt-master-sheet.xlsx`, the `Master Sheet` of the template; kept outside git): 22 seasons, 592 brands, 23 colours, 5 genders, 9 sub categories, 7 types, 98 items, 75 fits, 135 sizes, 4 GST rates, and the item map from item to sub category and type ([item-master-vocabulary.md](../data-notes/item-master-vocabulary.md)).

## Round 9, 21 Oct 2026 (PT upload)

1. **Out of the first version:** the vendor-file readers (XLS, XLSB, CSV), the vendor layouts and AI reading of PT files, with the workbench; AI reading of booking photos stays.
2. **Master sheet values:** set up once as approved vocabularies, each confirmed by a second person; the upload refuses an off-list cell, naming it.
3. **Upload, then approval:** the upload makes a draft PT; a different person approves it, which makes the PT official and values the stock. Sellable only after the scan-in (round 10).
4. **Against the GRN:** "count should match". Whether by style, colour and size or in total is asked in round 10.

Written as `DEC-134`; placement of the deferred parts is RR-546.

## Round 10, 21 Oct 2026 (PT upload)

1. **Match:** per style, colour and size; otherwise the upload is refused with the differences.
2. **Price and tax columns:** taken as the file gives them, checked by the approver; NAG and MARGIN checked by the system.
3. **New products:** proposed by the upload, confirmed by the PT approver.
4. **Flow (owner's words):** stock received at a Store; the GRN created with the invoice upload; the PT file uploaded and approved; then the stock is scanned and inwarded into the Store, and then it is sellable.
5. **Barcodes** can repeat, rarely, for brand-tagged items; not a hard constraint.

Written as `DEC-135` (`PRD-MER-007` reworded; RR-547 for the stage 1 code). The owner asked why questions came back: round 1 answer 2 was built on a recommendation that merged the scan into the PT, and round 10 asked about it again. Latest owner words win; do not re-ask settled points.

## Round 11, 21 Oct 2026 (owner's words)

1. **Booking:** file upload and manual entry; AI reading deferred like the PT workbench. Booking document uploaded, booking entered: the booking is recorded.
2. **GRN:** all manual entry: counting, and the documents and photos uploaded.
3. **Labels and barcodes** for goods without a brand barcode: later. The PT uploaded in this version has everything sorted.
4. Asked what PT corrections and supplier invoice matching are, and why a scan is needed in the GRN (it is not: the count is by hand; the only scan is the inward after PT approval, from round 10).

Written as `DEC-136`.

## Round 12, 21 Oct 2026

1. **PT corrections:** reverse and re-upload, approved again by a different person, only before scan-in; later fixes later.
2. **Invoice matching:** moves to stage 5 with supplier payments.
3. **Held lines:** the PT is uploaded once every held line is decided; one PT per GRN; confirmed-damaged pieces stay held without a PT.
4. **Piece tracking:** none in the first version; every product by quantity.

Written as `DEC-137`.

## Round 13, 21 Oct 2026

1. **GRN colour (owner's baseline):** whatever the receiving invoice names, none if it names none. ECONOMY, MEDIUM and PREMIUM are for the PT file only. So the PT matches the GRN per style and size; colour is not compared (`DEC-138`).
2. **Goods owned before they arrive:** explained; deferred to after the first version (`DEC-139`).
3. **The PT-to-GRN match** is per style and size, with the same quantity for each (owner's correction).

The first version is settled: booking (document uploaded, entered by hand), the Arrival with its invoice, the GRN (counted by hand, documents and photos), the PT file uploaded for the GRN and approved by a different person, then the scan-in at the Site.

## The design

Written as [goods-in.md](../design/goods-in/goods-in.md), 21 Oct 2026: sections 1 to 10 approved one by one, then the owner asked for the rest to be completed (sections 11 and 12).

## Not settled

- PT making beyond the first-version file upload (the PT workbench, labels, corrections): the owner designs it later. Do not raise it.
- Supplier-invoice matching, what is owed to the supplier and stage 2 reports: start with open questions. Booking was described in round 2; damage found later was agreed in round 2 (report, hold at once, a different person confirms, Operations follows up).
- AI drafts and the file readers: not started. They feed PT making, so they wait for the owner's PT discussion too.

## PRD rules the answers above would change (not yet written as a decision)

- `PRD-REC-005` allows counting without an invoice; the owner says every delivery has one.
- `PRD-REC-015` allows supplemental PTs for part of a receipt; the owner says one PT per delivery.
- `PRD-MER-015`, `PRD-REC-020` (labels from the approved PT) to revisit in the PT discussion.
- Settled in round 1, no longer on this list: sellable once the PT is finished (answer 2, no PRD change) and the word for one delivery (`DEC-128`).

## Facts found in the documents (no decision needed)

- No stage 2 area design exists yet; `docs/plan/stage-2/` does not exist.
- `RR-528` is used twice: the paise-sign item in `open-items.md` and the Organisation timezone in `kdps-values.md`.
- `PRD-BKG-014` is missing from the module map's ID ranges and from `coverage.md`.
- The stage 2 live-gate lists in `phases.md` and `roadmap.md` 2.3 omit policies 2, 4 and 9, which stage 2 features depend on.
- `deployment.md` section 7 has no row for the AI provider or the local helper.
- The stock ledger can reverse only a receipt count today; damage and PT corrections need more reversal kinds (`RR-509`).
