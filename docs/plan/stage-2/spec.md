# Stage 2, first version — goods-in

> **Not ranked.** Part of the plan ([roadmap](../roadmap.md)). It decides nothing: the PRD, the policies and the designs win over it.

Status: `ready-for-agent`, 21 Oct 2026. Built from the approved design [goods-in.md](../../design/goods-in/goods-in.md) and the decisions `DEC-128` to `DEC-140` ([grill notes](../stage-2-grill-notes.md)). Tickets: [README.md](README.md) section 6.

## Problem Statement

Goods reach KDPS's Stores and warehouse with a supplier invoice. Staff count them on paper, someone builds the PT in an Excel template, and it is loaded into the earlier POS by hand. Nothing ties the booking, the count, the PT and the shelf together: nobody can see what was ordered but not delivered, which goods are counted but not yet priced, which pieces are damaged or extra, or whether the PT matches what arrived. A PT can carry a quantity nobody counted, and goods can be sold before anyone checked their tags.

## Solution

The first version of goods-in, all entered by hand (goods-in sections 1 and 2):

1. Booking uploads the booking document and enters the booking; a different person approves it against the open-to-buy budget, and its terms come from the brand's Agreement.
2. Goods arrive at a Store or a warehouse with their invoice; the receiver records the Arrival and its invoices first.
3. The receiver counts by hand against the invoice, keeps shortage, excess, wrong, unidentified and damage apart, uploads the documents and photos, and issues the GRN. Counted goods are in custody but not sellable.
4. Booking decides the excess, wrong and unidentified lines; a different person confirms or rejects each damage report.
5. Whoever is assigned uploads the PT file in KDPS's fixed template for the GRN. The upload is refused whole unless every value is on its list and the rows match the GRN's good pieces by style and size.
6. A different person approves the PT: new products are confirmed, the stock becomes official and valued, and its journal posts.
7. The goods are scanned in, piece by piece, to the floor, the backstore or a bin. At a Store they are then sellable.

Damage can be reported at any step and holds the goods at once. Stock search shows physical, available, waiting and held quantities; four reports cover bookings, receipt problems, supplier performance and stock. Everything runs on synthetic data on `dev`; live use waits for the stage 2 policies (roadmap 2.3).

## User Stories

**Booking**

1. As Booking, I want to upload the booking document a brand gave me, as a photo or PDF, so that the booking keeps its evidence.
2. As Booking, I want to enter a booking's supplier, brand, season, destination and delivery window by hand, so that the order is recorded as agreed.
3. As Booking, I want the supplier refused unless it is linked to the brand on the booking's date, so that no booking names a supplier the brand does not use.
4. As Booking, I want to enter a style's lines in a size-colour grid with one indicative cost and MRP that each line can change, so that a large order is quick to type.
5. As Booking, I want a line with only a style code and a quantity, so that an order placed at style level can be recorded.
6. As Booking, I want a missing size kept as missing and never turned into Free Size, so that the order says only what the brand said.
7. As Booking, I want totals of pieces, indicative cost and MRP value for the booking and each style, so that I can check the order before submitting it.
8. As Booking, I want to see the brand's Agreement terms on the booking, read-only, so that I know which terms apply without retyping them.
9. As Booking, I want a booking refused for approval when the brand has no Agreement in force, so that no booking is approved without terms.
10. As Booking, I want to submit a booking only with at least one document attached, so that every approved booking has its evidence.
11. As an approver, I want to approve or reject a booking with a reason, bound to the exact version submitted, so that a later edit cannot ride on my approval.
12. As an approver, I want approval refused when the booking's value exceeds the remaining open-to-buy, with the shortfall shown, so that buying stays within budget.
13. As Booking, I want approval to give the booking its number and fix the Agreement version in force, so that its terms never shift afterwards.
14. As Booking, I want to record when a booking was issued to the supplier and when the supplier confirmed it, with the confirmation attached, so that its state is known though nothing is sent from the app.
15. As Booking, I want any change after approval to be a new version that is approved again, so that the approved order is never edited silently.
16. As Booking, I want to propose cancelling an undelivered balance for a different person to approve, so that a cancellation is controlled and never erases received goods.
17. As Booking, I want to extend a delivery window with approval, so that a late but expected delivery stays open.
18. As Booking, I want ordered, delivered, outstanding and cancelled quantities per line, with delivered taken only from linked GRN lines, so that nobody maintains a counter by hand.
19. As Booking, I want an overdue balance marked and a follow-up in My work when a window or line date passes, without anything cancelled, so that I chase the supplier.
20. As Booking, I want to prepare an open-to-buy budget per brand and season, so that buying has a limit.
21. As Accounts, I want to record my check of a budget before the Owner approves it, so that every budget is checked by finance.
22. As the Owner, I want to approve a budget only after Accounts has checked it, so that the budget in use is the one we agreed.
23. As Booking, I want the reserved value released when a balance is cancelled or an approved change lowers the booking, so that the budget reflects what is really committed.

**Arrival and count**

24. As a receiver, I want one Receive Goods inbox for my Site with Pending and History, so that I see every delivery still to finish.
25. As a receiver, I want "Goods arrived" and "Receive against booking" to open the same workflow, so that I learn one process.
26. As a receiver, I want receiving refused at a unit whose receiving readiness is not approved or whose mapping is not verified, with what is missing named, so that goods are never received where the setup is incomplete.
27. As a receiver, I want to record each invoice's number and date and upload it before the count starts, so that every count is against an invoice.
28. As a receiver, I want several invoices on one delivery to make one Arrival and one GRN, so that one delivery is one record.
29. As a receiver, I want a possible duplicate shown when the supplier's invoice number is already on another Arrival, so that I catch a double entry.
30. As a receiver, I want to record the transporter, lorry receipt, cartons and photos, with the vehicle and e-way bill numbers when there are any, so that the GRN follows common practice.
31. As a receiver, I want to count line by line against the invoice by style code, colour as the invoice names it, and size from the size list, so that the PT can be matched later.
32. As a receiver, I want the count saved as I go and resumable, with several people counting, so that a large delivery can be counted in turns.
33. As a receiver, I want the GRN to name who counted and who entered it, from their sign-ins, so that the count is accountable.
34. As a receiver, I want shortage, excess, wrong, unidentified and damage recorded apart on each line, so that each problem goes to its owner.
35. As a receiver, I want to record excess, wrong or unidentified goods as received and held, or as not received, so that goods we do not keep never enter stock.
36. As a receiver, I want a damage report raised at once for damaged pieces at the count, so that they are held before anyone confirms it.
37. As a receiver, I want to issue the GRN without anyone's approval, so that receiving is not held up.
38. As a receiver, I want the GRN to hold quantities only and never values, so that the count stays a physical record.
39. As the system, I want custody created only from the count, never from the invoice or the booking, so that no stock exists that nobody counted.
40. As a receiver, I want goods of a product not yet set up counted by their style code, colour and size, without being quarantined, so that new-season goods can be received before the PT.
41. As Booking, I want shortage, excess, wrong and unidentified goods to reach me in My work, and damage to reach Operations, so that every problem has an owner.
42. As a Booking approver, I want to take excess goods in or leave them held, and to take wrong or unidentified goods in after naming the product, so that only goods we accept reach the PT.
43. As Booking, I want each GRN line linked to the booking line it matches by style code, and colour and size where the booking gives them, and anything else sent to me for review, so that delivered quantities are right.
44. As Booking, I want a GRN at a Site other than the booking's destination sent to me for review, so that misrouted goods are noticed.
45. As Booking, I want to link a GRN received without a booking, or a line I reviewed, to a booking line later, with the link dated and signed, so that unbooked deliveries count against their order.
46. As a receiver, I want a miscount corrected by a linked recount that a different person approves, keeping the original, so that the GRN is never edited.
47. As a receiver, I want a recount refused once the GRN's PT is uploaded, so that the PT and the count never drift apart.

**Damage**

48. As anyone at a Site, I want to report damage on goods at any step, with photos, and have them held at once, so that damaged goods cannot be moved or sold.
49. As Operations, I want each damage report in My work, so that I follow it up.
50. As a different authorised person, I want to confirm or reject a damage report with a reason, so that no reporter decides their own report.
51. As the system, I want rejecting a report to release only its own hold, so that another hold on the same goods stays.
52. As the system, I want confirmed damage kept quarantined where it is, with no forced move and no release by time, so that stage 3 decides its outcome.
53. As an approver, I want a mistaken confirmation undone by a linked reversal that a different person approves, so that history is kept.
54. As the system, I want damaged goods never made good stock by acceptance or scan-in, so that they cannot be sold by mistake.

**PT file**

55. As an Admin, I want KDPS's PT template and its master sheet's lists set up once, each confirmed by a second person, so that every upload is checked against approved values.
56. As a PT maker, I want to download the blank template with its lists, so that I make the file in the right columns.
57. As a PT maker, I want to upload a filled PT file for a GRN only once every held line is decided, so that the PT covers the GRN's final good pieces.
58. As a PT maker, I want only one PT per GRN unless the earlier one was reversed, so that coverage never doubles.
59. As a PT maker, I want the upload refused whole when any value is off its list, the brand is not the GRN's, a required column is empty, `NAG` is not `QTY`, `MARGIN` disagrees with the PRD formula or `P RATE` is above `MRP`, with every problem listed by row and column, so that I fix the file once.
60. As a PT maker, I want the upload refused when a style and size's quantity does not add up to the GRN's good pieces, or the file has a style and size the GRN lacks or misses one it has, so that the PT matches what was counted.
61. As a PT maker, I want colour not compared with the GRN, since the GRN keeps the invoice's colour and the PT may carry ECONOMY, MEDIUM or PREMIUM, so that a good file is not refused.
62. As a PT maker, I want a self-contained copy asked for when the template links to another workbook, so that the file reads safely.
63. As a PT maker, I want products not yet set up proposed from the file's rows, with their barcodes, so that the PT creates them.
64. As a PT maker, I want a barcode used by several products flagged, not refused, so that brand tags that repeat are accepted.
65. As a PT maker, I want a preview of rows, totals, new products, repeated barcodes and differences from existing products before I submit, so that I know what I send for approval.
66. As a PT maker, I want submitting to create the draft PT and its approval request together, and a wrong draft withdrawn rather than edited, so that only the reviewed file can be approved.

**PT approval**

67. As a PT approver, I want the request in My work, routed to an approver whose limit covers `P RATE` times `QTY`, so that cost decides who approves.
68. As a PT approver, I want to see BASIC and `P RATE` side by side with margins, the GRN's invoices and photos, new products, repeated barcodes and differences, so that I can check the prices before approving.
69. As the system, I want the uploader unable to approve their own PT, so that every PT is checked by someone else.
70. As a PT approver, I want approval to confirm the new products, give the GRN's goods their products from the PT, record coverage, establish cost at `P RATE` and post the journal against the receipt account, in one step or not at all, so that stock and books agree.
71. As Accounts, I want consignment goods to record their cost without posting, so that goods the supplier owns stay out of our stock value.
72. As a PT approver, I want approval refused, with the reason, when the GRN changed after the upload, coverage would overlap, a posting map is missing, the period is locked or a number series is missing, so that nothing half-posts.
73. As a PT approver, I want a large PT posted by a queued job, with a failed job posting nothing and showing the failure, so that counters are not slowed and nothing is lost.
74. As anyone, I want to download an approved PT as XLSX in the template's columns, so that it can be shared or loaded elsewhere.
75. As a PT maker, I want a wrong approved PT reversed, with a different person approving the reversal, and a corrected file uploaded, while none of its goods is scanned in, so that mistakes are fixed before goods reach the shelf.
76. As the system, I want a reversal refused once any piece is scanned in, so that sold-ready stock is never silently undone.

**Scan-in**

77. As a Store's staff member or Warehouse, I want approved goods shown as waiting for scan-in, so that I know what to put away.
78. As a scanner, I want to choose the floor or backstore at a Store, or a bin at a warehouse, and change it between scans, so that goods go where they belong.
79. As a scanner, I want each scan to accept one piece, typed from the tag if the scanner fails, so that every piece is checked against the PT.
80. As a scanner, I want a barcode repeated across products to ask me which product, so that nothing is chosen silently.
81. As a scanner, I want a barcode not on the PT, or a product with nothing left to accept, refused and recorded, with no stock changed, so that only the approved goods are accepted.
82. As a scanner, I want to report damage on a piece while scanning, so that it is held instead of accepted.
83. As a scanner, I want to stop with pieces left and resume later, with nothing written off, so that a large delivery can be scanned in turns.
84. As a Store manager, I want scanned-in good pieces covered by the PT and with no hold to be sellable, so that the till in stage 4 can sell them.

**Stock search and reports**

85. As anyone with access, I want to search stock by style code or name, brand, size, barcode, location and condition, so that I find goods quickly.
86. As anyone with access, I want each result to show physical, available, waiting and held quantities apart, so that I know what can really be sold or moved.
87. As a Store manager, I want the same search to show the product at other Stores and warehouses I may see, so that I can find a missing size.
88. As Booking, I want a booking status report of ordered, delivered, outstanding, cancelled and overdue quantities, so that I chase what is late.
89. As Booking and Operations, I want a receipt problems report by GRN and line with each decision, so that nothing is forgotten.
90. As the Owner, I want supplier fill rate, on-time delivery and damage rate per supplier, brand and season, so that I judge suppliers by facts.
91. As the Owner, I want stock by product, size, location, condition and owner, with MRP value for all and cost value only for those allowed, so that stock is visible without leaking cost.
92. As anyone, I want every report to show its as-of time, mark Unknown values, drill to its records and export to XLSX, so that I can trust and use it.

## Implementation Decisions

- **Modules** (goods-in 10.1): `booking` (bookings, versions, lines, documents, open-to-buy budgets, receipt links, issue and confirmation, cancellation); `receiving` (Arrival, invoices, count lines, GRN, findings, held-line decisions, recounts, scan-in); `merchandise` · PT (PT, revisions, rows, reversal; the PT import handler); `stock` · documents (damage reports, decisions, reversals). They use `stock` · ledger, `merchandise` · catalogue and parties, `files-imports`, `access`, `numbering`, `exceptions`, `finance` · books, `organisation`, `configuration` and `audit` through their interfaces.
- **Calls** (goods-in 10.2): `receiving` → `booking` and `stock` · documents; `merchandise` · PT → `receiving`; the rest downward. The `receiving` → `stock` · documents call is in the module map and the module check.
- **One transaction per command** (goods-in 10.3): booking approval, GRN issue, held-line decision, recount approval, PT submit, PT approval (module-map 6.2 flows C and E), PT reversal, each accepted scan, each damage report, decision and reversal. Locks follow stock-ledger 10.3; authority, version, state and quantity are rechecked under them.
- **Stage 1 changes first:** the receipt count of goods with Unknown SKU, not quarantined, and an identity step that splits a style and size into the PT's SKUs (GI-1); a brand barcode on several SKUs, resolved at each scan (RR-547, `PRD-MER-007`); the Agreement's default model for new bookings removed (RR-545, `DEC-129`).
- **The PT upload** is a `files-imports` transaction batch with `merchandise` · PT as its handler (imports-and-opening-data 4.1, 13.2): stage 1 intake, the XLSX reader, a confirmed layout for KDPS's template, the master sheet's lists as confirmed vocabularies, the checks of goods-in 5.3 and 5.4, a preview, and a publish that creates the draft PT and its approval request together.
- **Money:** PT approval establishes cost at `P RATE` per piece; owned goods post under `stock.cost-established` against a receipt account the posting map names, never the supplier's payable (goods-in 6.3, `DEC-140`); consignment goods record cost only.
- **Numbers:** booking, GRN, PT and damage report each take their own series, given at approval for bookings and PTs (drafts carry an internal reference) and at issue or report for the others. No screen sets up series yet (RR-449), so `dev` and the tests set them in the labelled synthetic settings (`DEC-118`).
- **Policy gate** (goods-in 10.5, proposed mapping): booking approval needs policies 5 and 1; GRN issue and scan-in need the unit's receiving activity and policies 4 and 10; held-line decisions and damage need policy 17; PT approval and reversal need policies 1, 3, 9 and 10. Each operation registers with `configuration` and asks the Available check (`S1-F04`).
- **Events** (goods-in 10.4, proposed): booking approved and changed; GRN issued; held line decided; PT approved and reversed; piece accepted; damage reported, confirmed, rejected and reversed; identifiers only.
- **API and screens:** REST routes in the shared route table with Zod schemas and the typed client, OpenAPI regenerated (code-house-rules part B); idempotency key on every write and version tokens on edited records; screens per goods-in section 11 in the web app, scan-in working at phone width.

## Testing Decisions

- **A good test** drives the behaviour through the highest seam and checks what a person or another module can observe: the API's answer, the records it returns, stock quantities and holds, journals in the ledger, items in My work. It never reaches into another module's tables or private functions.
- **Seams** (agreed 21 Oct 2026): the HTTP API of each operation, tested against real PostgreSQL through Testcontainers, each test file in its own databases; pure unit tests for the PT file's row checks and `MARGIN`, reusing the shared ticket-margin calculation; one browser journey per persona path in Playwright.
- **Prior art:** the import pipeline's tests (`S1-F06`), the stock ledger's operation, concurrency and large-posting tests (`S1-F10`), the posting tests (`S1-F09`), the approval and exception tests (`S1-F05`, `S1-F08`), the browser journeys (`S1-F01` onward).
- **Coverage:** every test of goods-in section 12 is owned by one ticket (README section 6); `S2-F07-T02` runs the joined journey, the concurrency cases and the timings.
- Synthetic data only, labelled synthetic; it never becomes a default.

## Out of Scope

- After the first version, placement OPEN (RR-546): the PT workbench and costing profiles; readers for vendor PT files (XLS, XLSB, CSV) and their layouts; all AI reading (booking documents and PT files); barcodes and labels for goods without a brand barcode; piece-tracked products and piece IDs; supplemental PTs and clean lines going ahead while others are disputed; PT corrections after the scan-in; inbound ownership (`DEC-139`); the PT accuracy report; the line-by-line comparison of supplier confirmations (`PRD-BKG-010`).
- Moved to stage 5: supplier invoice matching, with supplier payments (`DEC-137`).
- Stage 3: transfers, supplier returns, quarantine movements, write-off, disposal, counts.
- Parked: the side-by-side test imports of the earlier POS.
- Nothing is sent from the app before stage 5 (`DEC-099`).

## Further Notes

- Coding may start: `S1-F04`, `S1-F08` and `S1-F09` are merged and the area design is approved (roadmap 2, prerequisite gates). Stage 2 exits only after stage 1 exits (`S1-F14-T04`).
- Live use waits for policies 1, 3, 5, 17 and the stage 2 parts of 10 Signed and validated, their values entered (open-to-buy budgets V-17, RR-080; the posting map's receipt account; approval limits), and each Site's receiving readiness approved (roadmap 2.3).
- Every value the build needs and the product owner has not set is labelled synthetic in tests and on `dev`, never a default.
