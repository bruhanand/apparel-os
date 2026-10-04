# store-requirements-users

Raw files here are not in git (see the repository .gitignore); only this README is.

Up: [data-from-kdps](../README.md). Notes: [docs/data-notes](../../data-notes/README.md).

## What this folder is

- What Store staff asked for in the app, from one handwritten notebook, in four forms: two phone photos of the two pages (30 Jun 2026), the same two pages as PNG files (named 25 Jul 2026), and two HTML files that line the asks up against "what is built".
- The photos are KDPS's. The two HTML files were made by the ERP team. **Both HTML files compare the asks with the earlier product (RetailsOps, an earlier version of this product in another repo), not with Apparel OS.** Their words "Built", "Planned" and "locked decision" describe that product. They mention Ten Software as the POS, an "alpha", issue #96, a PT Mapper with nine brand profiles and an Outbound module. None of that is a status of Apparel OS, and none of it is a KDPS decision. Anything still wanted belongs in the PRD or the policies (see `AGENTS.md`).
- 6 files. The two notebook pages were photographed once: the two PNGs show the same pages as the two JPEGs (checked by eye; same size 899 by 1599, not byte-identical, so they are re-saves). The second HTML calls itself a "second note" and says the Stores "asked twice"; the images show it is the same note.

## Files

### The handwritten pages

#### `WhatsApp Image 2026-06-30 at 07.38.57.jpeg` (page 1)

- JPEG, 899 by 1599 pixels, 128,770 bytes. WhatsApp name of 30 Jun 2026 07:38:57; file dated 6 Jul 2026. A notebook page photographed on a lap; some writing from the other side shows through.
- English handwriting. Every point, in order:
  - Heading: **Store ops.**
  - A numbered list of seven screens:
    1. Sell
    2. Inventory (the word "Reports" is written first and struck out)
    3. Reports (two words are written first and struck out)
    4. Barcode Search / Item search
    5. Attendance
    6. Customer Search
    7. Member Details
  - A hand-drawn divider line with an X mark.
  - **Sell**: "interface" (only that word).
  - **Inventory**: Stock Receive; Stock Transfer; one line struck out and unreadable; voucher search; PT file generation. A bracket joins this list to two more points: "Invoice upload (Madura" (the closing bracket runs off the edge of the photo; the word reads Madura) and "Booking".
  - **Item Search**: search item; search Barcode; search Brand.

#### `WhatsApp Image 2026-06-30 at 07.38.58.jpeg` (page 2)

- JPEG, 899 by 1599 pixels, 128,162 bytes. WhatsApp name of 30 Jun 2026 07:38:58; file dated 6 Jul 2026. A "classmate" notebook page.
- Every point, in order:
  - **Attendance**:
    - Post attendance with biometrics.
    - "Send" struck out, then "view attendance" with "(Leave | Delays | etc.)".
    - Send attendance.
  - **Customer Search**:
    - Search by Name; Phone Number; Bill No.
    - A boxed note "Sell interface with details", then "after search return, can Re print Only".
  - **Member Details**:
    - Add / Remove members.
    - Update members ("Details can be updated"): contact details | Bank details.
    - members monthly Target.
    - members monthly Achievement.
    - growth | De growth.
    - show members with pie (probably "pic", a picture; the June HTML reads it as a pie chart, the July HTML as a picture; guess).
  - **Reports**:
    - Stock Report.
    - Sales Report.
    - member wise Report.
    - Item wise Report.
    - Date Range Sales Report.
    - etc.

#### `store-ops-notes-2026-07-25-p1.png` and `store-ops-notes-2026-07-25-p2.png`

- PNG, 899 by 1599 pixels (1,381,165 and 1,350,905 bytes), file dated 3 Aug 2026. The same two pages as the JPEGs above, page 1 and page 2 (I compared both by eye). They were made for the second HTML file (`store-ops-notes-vs-build-2026-07-25.html`), which treats them as pages "received 25 July 2026".
- **Sensitive.** None in the images. The note asks for staff contact and bank details to be held in the system (no values given).
- **Notes.** [access-and-store-asks.md](../../data-notes/access-and-store-asks.md).

### The two HTML files (ERP-team analysis against the earlier product)

Both are self-contained HTML pages, written in English, "prepared for KDPS Lifestyle Pvt. Ltd.". They decide nothing.

#### `store-requirements-vs-build-2026-06-30.html`

- 17,118 bytes. Title "Store App Requirement — As Received vs What's Built / Planned"; "captured 30 June 2026".
- Legend: Built (usable now), Planned (designed, in the build queue), New (not yet in scope, needs a decision).
- Section 1 transcribes the two pages (struck-out words shown struck through; it reads the "Madura" line as "Madurai", "looks like a brand name"). Section 2 gives these rows:

| Ask | Status in the HTML (earlier product) |
| --- | --- |
| Sell interface (counter billing) | Planned |
| Stock Receive | Built (as Goods Inward, GRN) |
| Invoice / bill upload | Built |
| PT file generation | Built (it notes the wording is unclear: converting an incoming PT, or producing an outgoing one) |
| Booking | Built (as Vendor Bookings) |
| Stock Transfer | Planned |
| Voucher search (transfer vouchers) | Planned |
| Barcode search | Planned |
| Item search / search item | Planned |
| Search by brand | Planned |
| Stock Report | Planned |
| Item-wise Report | Planned |
| Sales Report | Planned |
| Date-range Sales Report | Planned |
| Member-wise Report | New |
| Attendance (post with biometrics, view, send; leave, delays) | New |
| Customer Search (name, phone, bill no.) | Decision needed |
| After search, reprint the old bill (view only) | Planned (depends on the sale being recorded in the product) |
| Member Details (add, update, contact and bank details, monthly target and achievement, growth, pie) | New |

- Section 3 asks three questions: does KDPS own the customer or does the POS; is Attendance in scope now (it names a biometric device as new work); what does "Member Details" mean (loyalty customers, or staff). A later paragraph, "Answered 25 July 2026", says it is staff: bank details and a monthly target belong to a salesperson; loyalty stays deferred; a store manager manages own Store's members; a cashier keeps own attendance only (issue #96).
- Section 4 summarises: Built 4 (Stock Receive, Invoice upload, PT file, Booking); Planned 6 groups (Sell interface; Stock Transfer; Voucher search; Barcode, Item and Brand search; the stock, item, sales and date-range reports; bill reprint); New 4 (Attendance, Customer Search, Member Details, Member-wise report).
- Its two stated starting points ("the POS owns the customer", "HR and attendance deferred") are the earlier product's decisions.

#### `store-ops-notes-vs-build-2026-07-25.html`

- 13,666 bytes. Title "Store Ops Notes (25 July) — As Received vs What's Built / Planned"; "Received 25 July 2026 · Analysed 25 July 2026".
- Section 1 transcribes the same pages (it reads "Show members with picture"). Section 2 gives these rows:

| Ask | Status in the HTML (earlier product) |
| --- | --- |
| Sell (screen no. 1) | Not built |
| Inventory: stock receive | Built |
| Inventory: stock transfer | Built (scan-based store transfer) |
| Voucher search | Built (a global search) |
| PT file generation + invoice upload (Madura) | Partly built (raw invoice to PT not built) |
| Booking | Built |
| Item search (by item, barcode, brand) | Built (the same global search) |
| Attendance (with biometric) | Deferred |
| Customer search, then re-print only | Not built |
| Member details: add, remove, update staff | Built |
| Member targets, achievement, growth, photo | New ask |
| Reports (stock, sales, member-wise, item-wise, date-range) | Designed, not built |

- Section 3 gives two calls and one confirmation: hold the deferral on Attendance or pull a thin slice forward (a biometric device is a long-lead external); park staff targets but "lock in" that every sale records the salesperson; and the Stores' "re-print only" wish agrees with the append-only rule. Section 4 summarises "four screens live, two waiting on the POS slice, two items need a decision".
- Its status words refer to the earlier product (RetailsOps).

- **Sensitive.** None.
- **Notes.** [access-and-store-asks.md](../../data-notes/access-and-store-asks.md).

## What the handwritten asks map to in the Apparel OS PRD

A reading by the ERP team, for the product owner. The PRD decides, not this table.

| Ask | In the PRD |
| --- | --- |
| Sell interface | The counter sales section; `PRD-POS-001` bills by scan, search or a size-colour selector |
| Stock receive, PT file generation, invoice upload | The Receiving and price tickets, PT workbench and Source conversion and imports sections; `PRD-IMP-001` takes spreadsheets, CSV, PDF and photographs |
| Stock transfer | The Transfers and physical movement section; `PRD-TRF-001` |
| Booking | The Booking and buying section |
| Barcode search, item search, brand search | `PRD-STK-006` stock search by product, brand, size, barcode, location and condition |
| Voucher search | Not clear which voucher is meant (a transfer document, a bill or a Tally voucher). Open |
| Customer search by name, phone or bill no.; re-print only | `PRD-POS-015` searches bills by customer, number and date range; `PRD-POS-016` reprints the same bill identity |
| Salesperson on each bill (needed for member-wise reports) | `PRD-POS-002` |
| Attendance | `PRD-HRM-004` attendance with photo, location, time and registered device, without face matching. Biometric devices are not in the PRD |
| Member targets and achievement | `PRD-HRM-009` targets by Store, brand and salesperson; `PRD-HRM-012` staff see their authorised target and incentive information |
| Member contact and bank details | `PRD-HRM-002`: ID, bank, PAN, PF and ESI details only within authorised workforce scope |
| Growth or de-growth, pie | Not stated in the PRD. Open |
| Reports | The Exceptions, reports and planning section |

## Subfolders

None.

## Open questions

Full list: [open-questions.md](../../data-notes/open-questions.md).

- Does "member" mean staff (the 25 Jul paragraph says so) and is that confirmed by KDPS? Owner: KDPS Owner. Blocks the HR design in stage 6.
- Is biometric attendance wanted, given the PRD allows photo, location and device only (`PRD-HRM-004`)? Owner: KDPS Owner. Blocks the attendance design in stage 6.
- Who sets staff targets, and what counts as achievement (bills rung by that person)? Owner: KDPS Owner. Blocks `PRD-HRM-009` configuration.
- Should staff bank details live in the ERP (`PRD-HRM-002` allows them only within authorised scope)? Owner: KDPS Owner, HR.
- What does "pie" mean: a pie chart or a picture? Owner: KDPS Owner.
- What does "voucher search" mean, and which Stores asked for "invoice upload (Madura)" at the Store rather than at the warehouse? Owner: KDPS Owner (Operations).
- Is the 25 Jul note a second request or the same pages? Owner: product owner (the images say the same pages).
