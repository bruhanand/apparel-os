# PRD fit

> **Not ranked.** These notes describe the data KDPS sent. They decide nothing. A PRD or policy change they lead to needs an entry in [decisions.md](../decisions.md) first. See [README.md](README.md).

This note sets the KDPS data against the documents that rank above it: the [PRD](../prd.md), the [KDPS policies](../kdps-policies.md) and the designs in [design/](../design/README.md). It says where the data fits, where it stretches a rule, where nothing covers it and where it clashes. It also lists what the data feeds into designs that are not written yet, what existing designs should check, which questions need a product owner decision, and which values in the data must never become settings.

- **Order of documents.** The PRD and the policies win over any design, and the designs win over code ([docs/README.md](../README.md)). A note decides nothing. Where this note reports a clash it does not resolve it (`AGENTS.md`, "Document order").
- **Sources.** The topic notes: [stores-and-codes.md](stores-and-codes.md), [pos-exports.md](pos-exports.md), [pt-file-layouts.md](pt-file-layouts.md), [item-master-vocabulary.md](item-master-vocabulary.md), [offers-and-brand-reports.md](offers-and-brand-reports.md), [purchases-and-supplier-notes.md](purchases-and-supplier-notes.md), [store-close-cash-and-bank.md](store-close-cash-and-bank.md), [transfers.md](transfers.md), [access-and-store-asks.md](access-and-store-asks.md), [analyses-and-metrics.md](analyses-and-metrics.md) and [data-quality-and-import-rules.md](data-quality-and-import-rules.md). Counts in them were taken from the raw files; this note repeats them and adds a few sums, marked "(computed)".
- **Every ID was checked** against [prd.md](../prd.md), [kdps-policies.md](../kdps-policies.md), [decisions.md](../decisions.md) and the design documents before it was cited. Design-only labels (`GC2-1`, `GC7-2`, `SL-10`, `MM-12`, `D-4`) are the open-question labels used inside the designs.
- **Marks.** "(guess)" and "(inferred)" mark a reading of the data that no file states. "OPEN" marks an unknown with an owner. Values set by earlier analysts or found in a KDPS sheet are what that file does today. They are not KDPS decisions and are not settings (section 6).
- **Privacy.** No customer, staff, bank or tax-registration value is copied here. Columns are described as "present".
- **Related.** Every question the notes raise, grouped by who can answer it: [open-questions.md](open-questions.md). The index of all notes: [README.md](README.md).

## 1. Short version

- **Most PRD rules fit the shape of the data.** Of the 179 rows in section 2, 116 are Covered, 40 Stretch, 10 Gap and 13 Clash. In most Covered rows a rule or record exists while the real values (codes, registrations, limits, rates, owners) are OPEN and KDPS's to supply. The data is an input for design and for synthetic-data tests, not a source of settings.
- **Practice that conflicts with PRD rules.** Stores key transfers as sales (479 reason-labelled lines and 1,635 zero-tender `S-` lines in one Store's workbook, against `PRD-TRF-003`). A count surplus is added as inward stock with no approval (`Audit Diff`, `Scan Stock`, against `PRD-STK-012`, `PRD-STK-014`). A cash book has no counted cash (`PRD-CSH-001`). Eight lines were paid above MRP (`PRD-POS-024`). The PT template bakes one P RATE multiplier (1.2, drifted to 1.1 in three copies) into every brand (`POL-03.06`, `POL-03.07`).
- **GST is unsettled and the HSN is missing.** Three KDPS sources use three different rules (the PT template: 5% or 18% by item word, with 2,500 on BASIC and 2,625 on MRP; the daily sales report: 12/112 below 2,500 and 18/118 from 2,500 on the line value; vendor invoices that change by date). None of the earlier POS stock or sales exports carries an HSN. The design refuses to price a line with an Unknown HSN, so every opening SKU needs an HSN or an item-to-HSN mapping before its Store can sell (`POL-10.02`, `POL-10.06`; shared-calculations 5.8).
- **Two states and several legal names.** Every registration seen carries Jharkhand's state code; the Store list has Bihar towns. The design baseline `GC2-1` refuses a mapping whose registration is in another State than the Store's Site. Om Ganpati Enterprises, Sanskar Retail, Jainsons Lifestyle and a Jockey invoice to another company all need a decision on what they are (`PRD-ORG-001`, `PRD-ORG-020`, `PRD-FRN-005`, `POL-12.01`).
- **Offers go beyond the four kinds in `PRD-OFR-001`.** The brand offer files show count-tier percentages, gifts at a token price, flat prices per MRP band, a price for a pair, "X or Y" alternatives and cash-off fallbacks. Brands also keep style lists (the Louis Philippe AMM list has 77,912 styles with a `Discount` or `No Discount` flag). KDPS builds a monthly sales-and-stock report per brand and Store (34 a month). No PRD rule covers the style list or the brand-facing report.
- **The earlier POS exports are thin.** 29 layouts, with no tax, no cost at sale, no time of day, no piece, no UPI tender and no link from a return to its bill. They carry many defects (dates, barcodes, totals, hidden rows). Section 3 and [data-quality-and-import-rules.md](data-quality-and-import-rules.md) feed the imports design (GC-6).
- **Identity is the hardest master problem.** `COLOR` holds a price tier on 42.8% of stock rows and a colour word on about 22%. Season is an Excel date or blank on about 41% of rows. Barcodes mix seven classes and some are rounded. A SKU is style, colour and size (`PRD-MER-002`), so the real colour is Unknown for most opening rows. Each Store must label tens of thousands of pieces at its switch (`PRD-LIF-025`).
- **Money has no counted cash, no terminal registry and four supplier balances.** The cash book is calculated. Card settles one credit per terminal per day and UPI one credit per day for all Stores, so UPI cannot be split by Store from the bank file. Supplier balances differ across the tracker, its summary, the debit-note workbook and Tally.
- **Purchasing records have no PRD home for several fields.** Cash discount, credit-day terms, interest on a supplier balance and agent firms sit in the supplier master. Debit-note types such as `STAFF SALARY REIMBURSEMENT`, `MONTHLY TARGET INCENTIVE` and `FURNITURE CLAIM` go beyond `PRD-OFR-018`.
- **Access is a proposal, not a decision.** The ERP team's role grid has six roles and lets Admin approve prices; the PRD has 14 personas and keeps approval apart from access (`PRD-ACS-003`, `POL-02.05`). The users list (MOM item 13) never arrived.
- **Analyst values must not leak.** Turn of 3 to 4 a year, the 36% to 37% discount ceiling, margin colour bands, a 7% running cost, a 14-month "never sold" window, the P RATE multipliers and the brand report's rules are analyst or sheet values, not policy (section 6).
- **Two earlier-POS facts shape the switch.** Returns of earlier-POS bills stay unavailable after a Store's switch (`POL-06.02`, `DEC-059`), yet the exports hold bill number, line, barcode, quantity and `Net Amount`. Cash is about a third of tender value (computed), so a cash-first offline counter (`POL-16.02`) covers about a third of sales by value.

## How to read section 2

One table per PRD area, in the PRD's order. Columns:

- **What the data shows.** The fact, with the topic note it comes from. A short reference such as (stores-and-codes 1.2) points to section 1.2 of that note; the notes are linked in the Sources bullet at the top.
- **PRD / policy / design that covers it.** IDs that exist. "Words used" means the PRD's Words used tables.
- **Fit.**
  - **Covered**: a PRD rule, policy bullet or design record meets the need. The data may still lack the value, or KDPS's practice may lack the step that the app adds.
  - **Stretch**: covered in part. The data needs something the rule or design does not say, or a definition has to be chosen, or the rule may not hold for KDPS as it is.
  - **Gap**: the data shows a need nothing in the PRD covers.
  - **Clash**: the data or KDPS's current practice conflicts with a PRD or policy rule. It is reported, never resolved here.
- **Note.** What is open, who owns it, and what to check.


## 2. By PRD area

### 2.1 Organisation, sites and ownership

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| The store list has 17 rows (5 Vaishnavi family stores, 5 MBO, 5 stores named for one brand, Jainsons Lifestyle, 1 warehouse) with `STORE NAME`, `LOCATION`, `EMAIL`, `CLOUD`, `RETAIL JI`. It has no code, address, registration, legal entity, opening date or Site ([stores-and-codes.md](stores-and-codes.md) 1.1) | `PRD-ORG-003`, `PRD-ORG-008`, `PRD-MOD-008`; [structure-and-masters.md](../design/masters/structure-and-masters.md) 2.1, 3.1 | Covered | The records exist; the values are KDPS's to supply. `STORE NAME` is a brand or format name, so a Store is its name plus its town |
| The data names more places than the list: Ratu, Sanskar, Fashion Studio (Deoghar), Patna, TAS, `RKJ`, `ASVH`, offices and hubs, and about 20 towns in bank narrations (stores-and-codes 1.2) | `PRD-ORG-001`, `PRD-ORG-004`, `PRD-ORG-010`; masters 3.3 | Covered | Which are Stores, Sites, business units or only staff placements is OPEN (KDPS Owner). Singh More and Ratu may be one Store (guess) |
| One place has several names and codes (`DEO`, `VAS-DEO`, `V-DEO`, `VSN DEO`; `JSL`, `HZB`, `J-HZB`, `JSONS`). `JSL` is Jainsons Lifestyle, Hazaribagh (strong evidence, stores-and-codes 1.5) | `PRD-ORG-008`, `PRD-IMP-003`; masters 2.1 (aliases) | Covered | Keep file-name tags and dealer-site codes as aliases per source. A Store code is never changed (masters 2.1), so the first code chosen must be right |
| Several Stores trade in one town: Deoghar 4, Banka 2, Kankarbagh 2 (stores-and-codes 5) | `PRD-ORG-021`, `PRD-ORG-004`; masters 3.3 | Covered | Whether each is its own Site, a Store at a shared Site or a brand counter (business unit) is OPEN (Operations) |
| Stores named for one brand (Lee, Allen Solly, Spykar, Jockey, Peter England). Allen Solly Deogarh and Lee Deogarh bills sit in series that look like KDPS's POS (`DEOT`, `LEEDEO`) (stores-and-codes 1.1) | Words used "EBO" (a store billed on the brand's own software); `PRD-ORG-009`, `PRD-ORG-010`, `PRD-EBO-011` | Stretch | By the Words used definition a one-brand store billed on KDPS's POS is neither EBO nor MBO. Candidate decision 1 |
| Two states. The Store list has Bihar towns (Bhagalpur, Kahalgaon, Banka, Gaya, Kankarbagh; general knowledge, not in the data) and Jharkhand towns. Every registration number tied to KDPS's PAN carries state code 20 (Jharkhand); none carries Bihar's code. The challan cites Patna jurisdiction while its billing address is Ranchi (stores-and-codes 1.3) | `PRD-ORG-005`, `PRD-ORG-020`, `POL-10.01`, `POL-10.08`, `PRD-TRF-023`; masters 3.4 and `GC2-1` | Stretch | `GC2-1` refuses a mapping whose registration is in another State than the unit's Site. If KDPS has no Bihar registration its Bihar Stores cannot be mapped. The CA decides; CA question 16 already asks. Candidate decision 22 |
| Legal names: KDPS Lifestyle Pvt. Ltd.; Om Ganpati Enterprises (a supplier of brand goods and one of two "franchisee" entities in the claims workbook); Sanskar Retail; Jainsons Lifestyle (goods billed "care of"); a Jockey invoice addressed to another company; "KDPS Lifestyle Pvt Ltd (Deoghar)" as the `Supplier` of transferred stock (stores-and-codes 1.4) | `PRD-ORG-001`, `PRD-ORG-002`, `PRD-ORG-020`, `PRD-FRN-005`, `PRD-FRN-006`, `POL-12.01` | Stretch | Franchise partner, related firm, second legal entity or trade name is OPEN (KDPS Owner, CA). Under `PRD-TRF-004` an internal move stays inside one legal entity. Candidate decision 19 |
| Ranchi warehouse: store list row 17, code `WH`, two Madura ship-to accounts at Ranchi | `PRD-ORG-010`, `PRD-ORG-013`; masters 3.6 | Covered | Routes beyond the default warehouse are OPEN (Operations) |
| Offices and hubs appear only in bank tags (`JH OFC`, `PAT OFC`, `HUB`, `ADMIN`) | `PRD-ORG-004`, `PRD-ORG-010` | Covered | An office unit has no brand and no Store. Which exist is OPEN |
| No stock location in any POS file. The Mufti and Blackberry reports add a location tag by hand (`LEE DEO`, `JSL`, `GAYA`, `WH`) (transfers 3.4) | `PRD-ORG-012`, `PRD-STK-006`; masters 3.5 | Covered | Floor, backstore, rack and bin locations are set up per unit; none can be read from the data |
| Every bill series restarts at 1 on 1 April (stores-and-codes 2.1) | `PRD-POS-020`, `PRD-MOD-009`; [numbering-and-audit.md](../design/platform/numbering-and-audit.md) 3.3 (`GC5-1`) | Covered | Evidence for the CA's answer on the financial year, not a setting |
| Stock rows carry `Supplier` values that are KDPS units; invoices carry `(SOR)` and "CONSIGNMENT"; no agreement is referenced (purchases 3.8, 3.2) | `PRD-ORG-014`, `PRD-ORG-015`, `PRD-ORG-016`, `POL-01.01`, `POL-01.05`, `POL-09.03` | Covered | Each brand's real model and terms are OPEN (KDPS Owner, Accounts; stage 2) |

### 2.2 People, access and approvals

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| The ERP team's role grid (`ERP_DASHBOARD_V1.xlsx`, July 2026) has six roles by 17 modules and 12 sidebar sections, and no user (access-and-store-asks 1) | `PRD-ACS-001` to `PRD-ACS-004`, `POL-02.01`, `POL-02.03`; [personas.md](../design/access/personas.md) | Covered | The six roles are the first six of the eleven templates in `POL-02.01`. The grid is a proposal, not a KDPS decision |
| The grid lets Admin approve Pricing and hold "All" on billing, returns, inventory, GRN and reports; gives the Owner "Override"; gives "Full" user management to both Owner and Admin; uses "All", "Full", "Manage", "Configure", "Monitor" (access-and-store-asks 2.3) | `PRD-ACS-003`, `PRD-ACS-006`, `PRD-ACS-023`, `POL-02.03`, `POL-02.05`, `POL-02.08` | Clash | Approval sits inside access in the grid; the PRD keeps them apart. "Override" has no PRD meaning. The grid is the ERP team's, so this is a clash with a proposal. Report only |
| The grid has no Operations, HR, EBO staff, CA or Auditor role, no self-service, no My work, no day close | `PRD-ACS-009`, `PRD-ACS-022`, `POL-02.01` | Covered | Templates exist for all five. Real assignments are OPEN |
| The users list (MOM item 13) never arrived; the `USERS` sheet is empty (access-and-store-asks 3.1) | `POL-02.11`, `PRD-ACS-002` | Covered | OPEN, KDPS Owner. Blocks stage 1 live use |
| The KDPS PT template has one work sheet per person, each filled for one brand family (Levis, Van Heusen, Status Quo, Tomboy); the `"OWNER"` sheet is empty (access-and-store-asks 3.3) | `PRD-ACS-001`, `PRD-ACS-021`, `PRD-PTW-005` | Covered | Brand-scoped preparers. Concurrent edits need the side-by-side view of `PRD-PTW-005` |
| `SalesMan` is blank on 27% to 33% of lines in the Hazaribagh and Jainsons exports and 41% in one Allen Solly sheet (mostly continuation lines); the word `Admin` is the salesperson on 1,520 lines of one file; the Singh More daily report has `Sale Person` empty on all 4,780 lines (access-and-store-asks 3.4) | `PRD-POS-002`, `PRD-HRM-011`, `POL-13.08` | Clash | The PRD attributes each line to a salesperson, apart from the cashier. A shared login recorded as salesperson defeats that. Candidate input to the stage 4 counter design |
| 46 distinct salesperson values across files, at least 17 at one Store (access-and-store-asks 3.4) | `PRD-HRM-001`, `PRD-ACS-020` | Covered | A floor on counter staff, not a user list |
| No approval is recorded anywhere: transfers, discounts, count differences, write-offs carry no preparer or approver. Status columns exist (`Margin Analysis Status`, `Invoice Status`) | `PRD-ACS-006`, `PRD-ACS-007`, `PRD-ACS-015`, `POL-02.07`, `POL-02.09` | Covered | The app adds approvals. Limits and approvers are OPEN (KDPS Owner; stage 1 live approvals) |
| Restricted values sit in ordinary files: customer name and phone on every bill, supplier bank accounts copied onto 661 invoice rows, staff bank or account text on the `Cash` sheet, tax numbers (data-quality L-1) | `PRD-ACS-008`, `PRD-SEC-006`, `PRD-SEC-010`, `PRD-SEC-014`, `POL-02.04`; [deployment.md](../design/platform/deployment.md) `D-4`, `DEC-052` | Covered | Which fields the side-by-side test masks or leaves out is OPEN (KDPS Owner, KDPS question 37) |

### 2.3 Merchandise and identifiers

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| The `Master Sheet` lists 22 seasons, 592 brands, 23 colours (3 are price tiers), 5 genders, 9 sub categories, 7 types, 98 items, 75 fits, 135 sizes and 4 GST % values, with typos and an older copy. The POS data uses far more (983 brand spellings pooled, 379 colour values, 147 season values, 178 sizes) ([item-master-vocabulary.md](item-master-vocabulary.md) 1) | `PRD-MER-004`, `PRD-MER-013`, `PRD-IMP-008`, `PRD-ORG-011`; masters 4.2 | Covered | A value goes in only by proposal and independent confirmation. No value is approved yet |
| `COLOR` holds a price tier (`PREMIUM`, `MEDIUM`, `ECONOMY`) on 42.8% of rows of `SOH REPORT FORMAT.xlsx`, "assorted" on 18.2%, nothing on 11.0%; a colour word on 22.3% (item-master 4) | `PRD-MER-002`, `PRD-MER-005`, `POL-04.02`; masters 4.1 | Stretch | A SKU is style, colour and size, so the colour is Unknown for most rows. Masters 4.1 allows one SKU per style and identity values, with Unknown counted as one value. Two colours of one style and size, both Unknown, would collide (inferred). Check in GC-6 |
| Brand sub-codes sit inside brands: `LP`, `LY`, `LR`, `LX`, `LA`; `VH`, `VS`, `VD`, `VF`, `VX`, `VW`; `AS`, `AL`, `AH`, `AT`, `AK`; `PX`, `PT`. Offers name sub-brands. Prefixes `V ` and `FS-` appear on brands (item-master 3.3, 3.4) | `PRD-MER-001`, `PRD-MER-004`, `PRD-MER-006`; masters 4.1 (a Brand has a name and aliases only) | Stretch | No parent brand or sub-brand in the design. It could be a configured attribute of a style (`PRD-ORG-011`). What each code means is OPEN (Booking, with Madura). Candidate decision 16 |
| A season label carries a month (`SPRING SUMMER(Jun-26)`). In `SOH REPORT FORMAT.xlsx`, 31.9% of season cells are Excel dates and 9.3% are blank; the rest are many forms (`SS-25`, `AW24`, year only, text dates) (item-master 2) | `PRD-MER-004`, `PRD-LIF-006`, `PRD-LIF-007`, `PRD-ACP-014`, `PRD-IMP-006`, `PRD-IMP-009` | Stretch | The PRD keeps season, collection and launch date apart. What the month means is OPEN. The "Mon-YY" decode is an inference. An unknown season matches no season-specific offer, which would hit about 41% of these rows (computed). Candidate decision 8 |
| Sizes mix numbers, letters, bra sizes, kids ages, months, ml, cm and dimensions (135 values). The POS has `FS`, `FREE SIZE`, `FREE`, and `NA`, `.`, `-`, blank for no size (250 blank rows) (item-master 9) | `PRD-MER-002`, `PRD-MER-005`; masters 4.1 (size sets per category) | Covered | A missing size stays Unknown; `FS` and `FREE SIZE` are an explicit Free Size. One list or one per category is OPEN (Booking) |
| Barcodes mix seven classes: 7-digit in-house codes with no check digit, valid EAN-13, 13-digit codes that fail the check, alphanumeric, 6, 10 and 15 digits. Some are rounded (13 digits ending `000000`) or stored as numbers so leading zeros are lost (data-quality D-1 to D-3) | `PRD-MER-006`, `PRD-MER-007`, `PRD-MER-008`; masters 4.3 | Covered | External codes are kept as text with a scope per supplier, because short numeric ranges collide across vendors. A rounded barcode never identifies |
| One barcode is many pieces, and one barcode is sold at more than one `Rate` (245 barcodes at Hazaribagh, 157 at Deoghar); in 1,593 of 17,027 matched lines the sale `Rate` differs from the current `Mrp`; one Jockey EAN has two MRPs (data-quality D-4) | `PRD-MER-003`, `PRD-MER-006`, `PRD-MER-009`; [stock-ledger.md](../design/stock/stock-ledger.md) 5; [shared-calculations.md](../design/calculations/shared-calculations.md) 2.3 | Covered | MRP is not a property of the barcode. The design takes it from the piece's PT revision |
| The earlier POS holds one row per barcode, not per piece. Stock: Deoghar 13,354 pieces (12 Jun 2026), Hazaribagh 27,695 merchandise pieces (`soh30626.xlsx`), Banka 21,771 (`STOCK REPORT`) (pos-exports 5) | `PRD-MER-003`, `PRD-MER-016`, `PRD-MER-017`, `PRD-LIF-025`, `POL-04.06`, `POL-04.09` | Covered | Every piece needs a label at the switch count: tens of thousands per Store. The labelling plan and label stock are OPEN (Operations). Candidate decision 20 |
| Packs: `USPOLO INNER WEAR.csv` counts packs (`2P`, `6P`); other files carry a body measure in `PACK / SIZE` or a quantity N on a row | `PRD-MER-010`, `POL-04.03`, `POL-04.04` | Covered | Explicit conversions; a mixed pack is itemised by contents |
| Carry bags (31,032 of 58,727 pieces in `soh30626.xlsx`), free gifts, trolleys and promo bags sold at ₹0 or ₹99 to ₹399, and a category `PROMOTIONAL` (item-master 11; analyses 2) | `PRD-MER-004`, `PRD-MER-014` | Gap | The PRD has no packaging item or gift-with-purchase item. Stock value, dead stock and margin need them kept apart. Candidate decision 5 |
| 1,163 brands map to 281 suppliers (one supplier per brand in the file, 38 brands with none); the Madura group appears under three legal names; a `BARCODE` flag marks 116 suppliers `YES` and 244 `NO` (item-master 12) | `PRD-MER-001`, `PRD-MER-008`, `PRD-ORG-016`; masters 5.1, 5.2 | Covered | Brand and supplier are separate and dated; a brand can change distributor. The flag reads as "who prints labels" (inferred) and feeds `PRD-MER-008` |
| The supplier master has 261 rows, 133 with only a name; credit days, `CD`, `Agency Company`, agent person details and bank details by lookup (purchases 3.7) | `PRD-MER-001`, `POL-01.14`, `PRD-ORG-016`; masters 5.1 | Stretch | Agent and agency firm fit `PRD-MER-001`. Cash discount has no PRD word (2.14). Bank details are restricted and changes need a different approver |
| The `Supplier` field names KDPS units (`KDPS LIFESTYLE PVT LTD (DEOGHAR)`, `OM GANPATI (DMK)`, `SANSKAR RETAIL`) on thousands of stock rows (item-master 12; stores-and-codes 1.4) | `PRD-MER-001`, `PRD-LIF-008`, `PRD-TRF-004` | Stretch | Do not read it as a supplier relationship. Stock that arrived by transfer has no purchase evidence |
| The item map gives each of 98 items a sub category and type; four sub-category values and one type value are combinations not in the drop-down lists (item-master 6) | `PRD-PTW-012`, `PRD-MER-004` | Covered | The suggestion can never be picked from the list; the vocabulary needs fixing before import |

### 2.4 Source conversion and imports

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| 33 vendor PT files in 35 layouts and nine families. Real formats: 21 `.xlsx`, 9 `.xls`, 2 CSV, 1 `.xlsb`. Two extensions lie, one `.xls` has a damaged container, one CSV pads names and values with spaces ([pt-file-layouts.md](pt-file-layouts.md) 3) | `PRD-IMP-001`, `PRD-IMP-003`, `PRD-IMP-004`; PRD Stack "Documents" | Covered | Read the content, not the extension. ExcelJS reads `.xlsx`; `.xls` and `.xlsb` need other adapters (general knowledge, to check in GC-6) |
| The header is on row 1, 3, 4, 5, 9, 16 or 24 and 25; some sheets have none; columns have blank headers or a leading blank column; titles are merged; hidden sheets, hidden rows and active filters hide data (1,558 of 1,588 Banka rows) (data-quality 2) | `PRD-IMP-002`, `PRD-IMP-004`, `PRD-IMP-005`, `PRD-IMP-007` | Covered | Read every row; show hidden items to the reviewer; a saved layout records an explicit choice for each unlabelled column |
| Dates are swapped (75 of 100 matched debit-note dates), in six text forms, as Excel serials, or the text `Not Disclosed Yet.`; `Season` and `Design No` cells became dates (data-quality 3) | `PRD-IMP-007`, `PRD-MOD-015` | Covered | No importer guess; flag contradictions; a text that is not a date never becomes one |
| Numbers are text, `NaN`, `#N/A`, `#NAME?` or `#ERROR!`; amounts keep paise in one column and whole rupees in another; Indian comma text (data-quality 4, 6) | `PRD-MOD-014`, `PRD-MOD-015`, `PRD-IMP-007` | Covered | Unknown is not zero; decimals become integer paise |
| Total, section and filler rows; brand-cut files whose bill totals do not match their lines; control totals that disagree (a POS stock total of 13,375 against lines of 13,354) (data-quality 5, 6) | `PRD-IMP-005`, `PRD-IMP-013`, `PRD-EBO-003`, `PRD-EBO-004` | Covered | Parse totals as control totals and show the difference |
| Exports overlap (6,639 bill numbers in two Hazaribagh files); the same stock appears in several workbooks (data-quality H-10, I-4) | `PRD-IMP-011`, `PRD-IMP-012`, `PRD-IMP-013` | Covered | A bill's identity is its series and number. A reused identity with different content is a conflict |
| One file holds several documents or customers: the Madura extract (113,983 rows, 176 customers, 5,923 KDPS rows, 219 bill documents), `Peter England.CSV` (5 invoices), `kidcity` (2). Vendor, buyer and brand are often only in the file name; six files carry no invoice number (pt-file-layouts 4) | `PRD-IMP-011`, `PRD-IMP-012`, `PRD-REC-015`, `PRD-REC-016`, `PRD-PTW-002` | Stretch | A PT reconciles to receipt quantities, so a file spanning invoices and buyers must be split into documents before staging. Other customers' rows should not be kept (candidate decision 23). Document identity is missing in six files |
| Layouts can be told apart by header names in families F2 to F6 and Peter England; F1, F9 and the headerless CSV need a saved mapping per source (pt-file-layouts 3) | `PRD-IMP-003`, `PRD-IMP-004` | Covered | A brand name selects candidates only |
| `BASIC` is rounded to whole rupees where the invoice keeps paise (₹41.90 gap on one invoice); `P RATE` and `MARGIN` are pasted values in some files (pt-file-layouts 1.6) | `PRD-IMP-006`, `PRD-PTW-013` | Covered | Supplied values, calculations and AI suggestions stay distinct. The matching tolerance comes from the costing profile (OPEN) |
| Sources include an image-only six-page PDF invoice, photographs (challan, gate passes, store notes) and offer emails as screenshots | `PRD-IMP-001`, `PRD-SEC-002`, `PRD-SEC-003` | Covered | AI extraction is a reviewable draft with a manual route. Stage 1 imports use the manual route only (`DEC-105`) |
| Source words differ from approved values (`FEAMLE`, `REGULER`, `7-8Y`, 44 brand spelling groups) (item-master 3, 5, 9) | `PRD-IMP-003`, `PRD-IMP-008`, `PRD-IMP-009` | Covered | Mapping rules go through proposal and independent confirmation |

### 2.5 Booking and buying

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| No booking or purchase order exists in any file. The hidden tracker sheet has `Booking Status` on 67 invoices: `BOOKED IN VENUE.` 55, `BOOKED IN "DB".` 6, `Non Booked Article Found.` 3, `PROMO` 3. "VENUE" and "DB" are unexplained (purchases 3.8) | `PRD-BKG-001`, `PRD-BKG-005`, `PRD-BKG-008` | Covered | A non-booked article is a delivery without a booking (`PRD-BKG-008`). The two systems named are unknown (OPEN, KDPS Owner) |
| The winter buying plan (budget ₹78 L at cost, split by merchandise block) is an analyst's (analyses 2.9, 3) | `PRD-BKG-004`, `POL-05.09`, `PRD-BKG-012` | Stretch | Open-to-buy is by brand and season; actual budgets are KDPS's to supply. The analyst figures are not settings |
| The supplier master holds credit days, `CD` and an agency firm with no effective date; no brand agreement, return window or return condition appears in any file (purchases 3.7) | `PRD-BKG-002`, `PRD-ORG-016`, `POL-01.08` to `POL-01.14` | Covered | Terms are effective-dated and a booking may override them. Real terms are OPEN (KDPS Owner, Accounts; stage 2) |
| Statuses `Invoice Not Received`, `Product Not Received.`, `Inward Pending` and remarks of goods returned for price mismatch or unordered stock | `PRD-BKG-005`, `PRD-BKG-009`, `PRD-BKG-011`, `PRD-REC-006` | Covered | Fill rate, delivery timeliness and PT accuracy can be measured later; the data holds few events |

### 2.6 Receiving, price tickets and the PT workbench

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| Stock reaches stores by transfer or by an invoice keyed into the earlier POS (`MSF…` rows at Allen Solly Deogarh). No GRN, count or discrepancy record exists. Remarks say where goods were received ("Product Received (Vaishnavi Deoghar)") (transfers 1, 4) | `PRD-REC-001` to `PRD-REC-008`, `PRD-REC-004`, `PRD-REC-009` | Covered | A count creates custody; the invoice never does. There is no data on counts or shortages to import |
| The invoice tracker (`INVOICE DETAILS.`) lists 1,480 invoices: 942 dated (₹6.78 crore typed), 538 with only a file name. Each has a PDF and, since April 2026, a PT workbook "uploaded in TEN" (purchases 3) | `PRD-REC-010`, `PRD-REC-016`, `PRD-PAY-001` | Covered | Pieces agree between PT file and tracker on 19 of 21 comparable files (purchases 7). Nightly compare of invoice, GRN and PT is `PRD-REC-010` |
| One invoice is split to several Stores by a free-text remark (eight invoices, for example 385 pieces: Ratu 88, Banka 55, Lee 102, Bokaro and Sahibganj 140) (transfers 4) | `PRD-REC-004`, `PRD-REC-014`, `PRD-REC-015`, `PRD-TRF-002` | Covered | Receive at Ranchi and transfer, or receive at each Store with the PT prepared elsewhere |
| 45 of 62 remarks say goods were received at a Store; Madura goods are billed straight to a Store's `Sold-to` (transfers 1; stores-and-codes 3.7) | `PRD-REC-004`, `PRD-BKG-008`, `PRD-ORG-013` | Covered | Which brands go direct and which through Ranchi is OPEN (Booking) |
| The KDPS PT template has the 20 columns of `PRD-PTW-008` plus two `SUGGESTED` columns. `P RATE` is `BASIC` x 1.2 in six sheets and x 1.1 in three; `INPUT TAX` and `OUTPUT TAX` return 5 or 18 by item word with thresholds of 2,500 (on `BASIC`) and 2,625 (on `MRP`); `MARGIN` is not rounded in the cell (pt-file-layouts 1.2 to 1.4) | `PRD-PTW-008`, `PRD-PTW-010` to `PRD-PTW-012`, `POL-03.06`, `POL-03.07` | Clash | One multiplier for every brand conflicts with an approved costing profile per brand and with "no formula or rate is assumed". Tax by item word differs from tax by HSN in the design. Treat every formula as an observation |
| Copies drift: `PRAVIN JI ` has an older tax formula, `Office` is partly filled, `"OWNER"` is formatted to 16,342 rows (pt-file-layouts 1.4) | `PRD-PTW-007`, `PRD-PTW-013` | Covered | Derived fields come from the approved profile, not from a copied formula |
| Extra charges on invoices are not in the PT: `Motiya` ₹50, `Bus Fare`, `Service Charge`, round-off; two invoices tax `Motiya` with the goods (purchases 8) | `PRD-PTW-010`, `POL-03.06`, `PRD-REC-010` | Covered | Charges belong to the costing profile. What `Motiya` is, and whether it enters cost, is OPEN (Accounts, CA) |
| The cost to book differs by file: vendor rate, taxable value over quantity, net unit cost, `Purchase Price` at 93% of `Item Rate`, `MUFTI.xlsx` at +0.35%, Peter England `Service Charge` (pt-file-layouts 6) | `POL-03.01`, `POL-03.06`, `PRD-PTW-013` | Covered | Per brand; OPEN (Booking, Accounts) |
| `GST %` is missing in 13 of 35 layouts; some give tax amounts only (pt-file-layouts 4) | `PRD-PTW-013`, `PRD-PTW-012` | Covered | Calculations are blocked on missing inputs; a rate is not derived without a confirmed profile |
| KDPS's example writes one row per piece (`QTY` 1, `NAG` 1); most vendors write one row per barcode with a quantity (pt-file-layouts 5) | `PRD-REC-016`, `PRD-MER-015`, `PRD-PTW-011` | Stretch | Does quantity N mean N labels, and may the importer split a row into N pieces? OPEN (product owner) |
| `SUGGESTED SUB CATEGORY` and `SUGGESTED TYPE` read an item map; a missing item returns `WRONG ITEM` or `PLEASE RECTIFY` | `PRD-PTW-012` | Covered | Hints only; never an identity change |
| The PT approval limit uses the total proposed acquisition cost; the vendor files give a cost per piece in 32 of 35 layouts (pt-file-layouts 4) | `PRD-ACS-015`, `PRD-ACS-016`, `POL-02.09` | Covered | Missing or disputed cost blocks value-based approval |
| The earlier POS may load the approved PT in the KDPS layout during the test (`DEC-053`) | `PRD-PTW-008`, `PRD-LIF-012` | Covered | Whether the earlier POS accepts the file is OPEN (KDPS Owner question 40) |

### 2.7 Stock and warehouse control

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| Stock exports have one row per barcode with `Tqty`, `Mrp`, `Rate` and `Amount`. They carry no condition, PT coverage, hold, reservation, transit or owner ([pos-exports.md](pos-exports.md) 5) | `PRD-STK-001`, `PRD-STK-002`, `PRD-LIF-014`, `PRD-LIF-027`; [stock-ledger.md](../design/stock/stock-ledger.md) 3 | Covered | SOH is a comparison source, never physical verification (Words used) |
| The movement statements have `Op Qty`, `Purchase`, `Sale`, `Adjustment`, `Sl Ret`, `St Trf`, `Stf Reciept`, `Pur Ret`, `Tqty`. `Op Qty` plus the movements equals `Tqty` on every row. `Purchase`, `Adjustment`, `Sl Ret` and `Pur Ret` are empty on every row of both files (pos-exports 5.1) | `PRD-MOD-012`, `PRD-LIF-013`; stock-ledger 2.3 | Covered | The columns map onto movement kinds but carry no counter-party, document, receipt origin or period. Returns are netted inside `Sale` (inferred) |
| `Audit Diff` and `Audit Differance` (77, 78 and 23 lines), `Scan Stock` (105 lines) and `Opening Stock` (14 lines) are added to a Store's stock as inward lines with no document or approval (pos-exports 5.4; transfers 3.2) | `PRD-STK-012`, `PRD-STK-014`, `PRD-REC-008`, `PRD-LIF-008` | Clash | The PRD approves every count difference, holds a surplus with no origin as excess and lets only a count create stock. Practice adds stock with no approval |
| The only counts in the data are those audit lines (for example 73 lines on 7 Apr 2025 at Singh More). No cycle count, recount or variance reason exists | `PRD-STK-008` to `PRD-STK-010`, `PRD-STK-012`; stock-ledger 8 | Covered | Count tolerance and approvers are OPEN (KDPS Owner question 13) |
| Some stock files keep zero rows and some keep only rows with stock. A positive-only file cannot show a stock-out. The Singh More on-hand figure nets inward since Oct 2024 against sales since 1 Apr 2026 only (data-quality I-1; pos-exports 6) | `PRD-LIF-014`, `PRD-LIF-027`, `PRD-EXC-018` | Stretch | Does a barcode missing from a positive-only file mean zero? OPEN (product owner). Saved layouts say which kind of file they read |
| `Rate` (one cost per barcode) is above `Mrp` on 47 rows of `SOH REPORT FORMAT.xlsx`, 29 of `soh30626.xlsx` and 13 of `SOH_Hazaribagh.xlsx`; `Mrp` is zero or blank on a few rows. Whether `Rate` includes GST is not stated (data-quality I-3) | `PRD-LIF-005`, `PRD-MER-009`, `PRD-LIF-004` | Stretch | Can this `Rate` be the valuation evidence for an opening row? Candidate decision 14 |
| No export carries an inward date. The season label is the only age proxy (analyses 6) | `PRD-STK-004`, `PRD-STK-013`, `PRD-EXC-006` | Stretch | Opening stock gets one receipt origin dated at the switch count. Ageing of opening stock has no source. OPEN (product owner) |
| Dead stock has four analyst definitions (never sold in 14 months; no sale in 10 or 11 months; season year 2024 or older; zero-sale styles) (analyses 2.5, 5) | `PRD-STK-007`, `PRD-EXC-006`, `PRD-EXC-009` | Stretch | The PRD says "good unsold stock that is no longer selling". The definition is OPEN (product owner, KDPS Owner) |
| One file is one Store; the brand reports add a location tag by hand | `PRD-STK-006`, `PRD-PRO-001` | Covered | Stock by Store, brand, size and condition is a read model |
| Size and brand per barcode support broken-size-run reports | `PRD-STK-011`, `PRD-EXC-006` | Covered | Needs the colour and size grid; colour is mostly Unknown (2.3) |

### 2.8 Transfers and physical movement

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| In the POS a transfer is a number. The sender's `<FY>/<code>/S-<n>` document is typed at the receiving Store with its lines; the SOH shows only `St Trf` and `Stf Reciept` totals. About 10 `S-` documents a working day leave the warehouse; 92% of 665 inward documents at Singh More come from `WH` ([transfers.md](transfers.md) 1, 3) | `PRD-TRF-001`, `PRD-TRF-005`, `PRD-TRF-013`, `PRD-REC-001` | Covered | The app adds request, independent approval, reservation, dispatch, count and acceptance |
| No document names a destination, an approver, a count or a shortage. A hand tally of one delivery reads 443 and 450 and is unsigned (transfers 2.1) | `PRD-TRF-002`, `PRD-TRF-005` to `PRD-TRF-008`, `PRD-TRF-014` to `PRD-TRF-018`, `PRD-STK-001`, `PRD-EXC-001` | Covered | No in-transit state exists today. Approvers and the limit on cost are OPEN (KDPS Owner) |
| Transfers are keyed as sales. At Singh More 479 lines carry a reason such as `Stock Transferr`, `STOCK TRANSFER TO KAHELGAON STORE` or `DEFECTIVE GR TO WAREHOUSE`, and 1,635 zero-tender lines sit in a second series `26-27/SGMR/S-n` (60 bills, 2,800 pieces; 50 lines are in both sets). 277 reason lines carry real tender (transfers 3.3; store-close 3.4) | `PRD-TRF-003`, `PRD-POS-014`, `PRD-LIF-014`, `PRD-IMP-007` | Clash | PRD keeps internal transfers, supplier returns and partner sales apart. In the data they count in sales, discount, tender and cash: the headline discount is 58% of MRP, about 4% on lines actually paid (computed). Imports must classify them and never move stock |
| The delivery challan `DCJ/26-27/0073` has one category-level line ("READYMADE GARMENTS", product FROCK, 26 pieces, rate 349.00), tax rows at 0.00, the same registration for sender and consignee, and invoice wording (transfers 2) | `PRD-TRF-006`, `PRD-TRF-012`, `PRD-TRF-023`, `PRD-TRF-024`, `POL-10.03` | Stretch | The PRD asks for items and quantities. What 349 is (cost, MRP, a transfer price) is unknown. Challan or tax invoice, and any e-way bill, depends on registrations (OPEN, CA) |
| One carrier charge is split by hand between two Stores ("LEE - 250/-", "Vaishnavi Deoghar 210", "Bhara 60") (transfers 2) | `PRD-TRF-012`, `POL-03.06` (purchases only) | Gap | No rule says whether transfer freight is a Store expense or part of stock cost. Candidate decision 21 |
| One gate pass and one carton serve two Stores | `PRD-TRF-002`, `PRD-TRF-011` | Stretch | A transfer has one destination, so a shared load is two transfers or two dispatches |
| `OM GANPATI (DMK)`, `SANSKAR RETAIL` and "KDPS Lifestyle Pvt Ltd (Deoghar)" appear as suppliers on stock rows that arrived by transfer (transfers 3.1, 6) | `PRD-TRF-004`, `PRD-FRN-006`, `POL-12.01` | Stretch | Does ownership change, on what document and price? OPEN (KDPS Owner, CA) |
| Transfer document numbers come in four shapes (`WH/690`, `WH\S-301`, `25-26/WH/14`, `26-27/WH/S-175`), restart each year per sender and include unknown senders (`RKJ`, `ASVH`) (transfers 3.2) | `PRD-MOD-008`, `PRD-IMP-003`, `PRD-IMP-011` | Covered | Map every old shape to one source identity; the app numbers its own documents |
| Defective goods and goods returns go to the warehouse as a transfer line and then as a warehouse debit note `<FY>/WH/PR-n` (transfers 5) | `PRD-DMG-007`, `PRD-OFR-011`, `PRD-TRF-003`, `POL-17.01` | Covered | A controlled quarantine movement with its own authority |
| Stores replenish by hand: Hazaribagh took in 10,119 merchandise pieces in a quarter, sold 5,509 and sent 2,477 on (transfers 3.1) | `PRD-EXC-016`, `PRD-EXC-020` | Covered | Stage 6; recommendations never move goods without approval |
| The WH-to-store format is "explained" in the MOM (item 7); no file was sent | `PRD-TRF-001` to `PRD-TRF-026` | Covered | The data cannot yet shape the stage 3 transfer design. Ask Operations for one real set (open-questions) |

### 2.9 Damage, quarantine and disposal

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| No damage report, confirmation, quarantine or disposal exists. Defective pieces travel as `STOCK TRANSFER TO WAREHOUSE (DEFECTIVE)` lines and as `DAMAGE GOODS CLAIM` debit notes (74); one return reason is `DEFECTIVE STOCK` (store-close 3.7; purchases 4.3) | `PRD-DMG-001` to `PRD-DMG-009`, `PRD-DMG-012`, `POL-17.01`, `POL-17.04` | Covered | Today stock leaves at once with no hold. Approvers and cost limits for write-off and disposal are OPEN (KDPS Owner; stage 3) |

### 2.10 Counter sales and payments

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| A bill line has `Bill Date`, `Bill No`, `Item`, `Brand`, `Qty` (signed), `Rate` (the sale-time MRP), `Gross Amt`, `Disc%`, `Disc Amt`, `Net Amount` (with paise), `Bill Amount` (whole rupees), tenders. Bill-level fields print on a bill's first line in most files. `Disc%` is 0 beside a rupee discount on 665 lines of one file (pos-exports 4.1) | `PRD-POS-014`, `PRD-POS-003`, `PRD-POS-023` | Covered | The app keeps every field on every line with its snapshot. Imports keep both discounts as given and never recompute one |
| Tender columns are `Cash`, `Card`, `Credit`; `Credit` is 0 on every bill; there is no UPI column. UPI is 47% of net sale value in the Singh More daily report; "Card" is about 65% at Deoghar and Hazaribagh. Whether `Card` includes UPI is unknown (store-close 6) | `PRD-POS-005`, `PRD-POS-010`, `PRD-POS-011`, `POL-07.09` | Stretch | Do not map `Card` to a tender type. OPEN (Accounts, CA) |
| Cash was 35.5% of tender value at Deoghar in FY 2025-26 (₹59.2 lakh of ₹166.7 lakh, computed) and 34% to 35% at Singh More in April and May | `PRD-OFF-017`, `POL-16.02` | Stretch | A cash-first offline counter covers about a third of sales by value. Input to GC-8. Candidate decision 24 |
| Dues sale: two lines at Singh More (₹4,923.50 of ₹31.4 lakh); one is recovered as a new zero-quantity line. No customer, limit or due date (store-close 3.6) | `PRD-POS-022`, `PRD-CSH-003`, `POL-07.09` | Clash | Customer credit is allowed only under an approved limit and due date, and goes live in stage 5 (`DEC-025`). The use is small |
| Eight Singh More lines were paid above the MRP (a ₹7 bag with ₹2,199 paid) (store-close 3.8) | `PRD-POS-024` | Clash | The app refuses a price above MRP with no override. Probably mis-keyed (guess) |
| Bills run in one series per store: `<FY>/<code>/<serial>`, for example `26-27/DEO/919`. `25-26/DEO/1` to `/5383` and `25-26/JSL/1` to `/4611` have no gaps; a second `S-` series exists at one Store (stores-and-codes 2) | `PRD-POS-020`, `PRD-OFF-002`, `POL-10.07`, `PRD-LIF-015`; [numbering-and-audit.md](../design/platform/numbering-and-audit.md) 3.4, 3.5 | Stretch | The PRD numbers per billing device, tax registration and financial year. Is the old code a device, a Store or a registration? OPEN (Operations, CA). A device part must be in the format |
| `Bill Amount` is the half-up rounded sum of the lines on 5,361 of 5,383 bills at Deoghar; 3 bills round up from a fraction below one half; 19 differ by more than ₹1 (pos-exports 4.1; data-quality H-3) | `PRD-MOD-014`; shared-calculations 5.9 (`GC7-4`) | Stretch | Whether the bill is rounded, to what, and which value is right is OPEN (Accounts, CA). Candidate decision 18 |
| No export carries a tax rate, tax amount or HSN. The Singh More workbook derives GST by line value: 12/112 below ₹2,500 and 18/118 from ₹2,500 (store-close 3.9) | `PRD-OFR-005`, `PRD-TAX-005`, `POL-10.02`, `POL-10.05`; shared-calculations 5.8 (`GC7-1`, `GC7-2`) | Stretch | See 2.14. The app prices tax from the classification in force |
| Carry bags are lines at ₹6 or ₹7 with `Disc%` 100 (586 lines in the Singh More report, about 8,200 pieces in the Deoghar year); free gifts are lines at 100%; trolleys are sold at zero tender (store-close 3.6) | `PRD-POS-003`, `PRD-POS-023` | Gap | See 2.3. No packaging or gift item. A 100% line is a manual price change needing authority |
| No time of day on any bill | `PRD-MOD-009`, `PRD-EXC-005` | Covered | Sales by hour starts with the app |
| The customer is free text on the bill (`CASH` on 2,058 of 5,383 bills at Deoghar), the phone is a number, 199 phones are shared by several names | `PRD-POS-012`, `PRD-RET-018`, `PRD-SEC-009` | Covered | Phone is optional and consent is separate. Imports keep no customer name or phone until KDPS answers question 37 |
| The data does not say how many billing devices a Store has. `CLOUD` and `RETAIL JI` on the Store list are undefined; every raw POS export comes from a Store that is not `RETAIL JI` = YES (guess: two POS products) (stores-and-codes 1.1) | `PRD-POS-020`, `PRD-OFF-001` | Covered | OPEN (Operations, Admin) |

### 2.11 Customer returns, exchanges and credit

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| A return is a negative-quantity line inside a bill with no link to the original bill; `Disc Amt` flips sign. 327 of 5,383 Deoghar bills (6.1%, computed) and about 723 of 7,094 Hazaribagh bills (10.2%, computed) hold a return line (pos-exports 4.1; data-quality H-5) | `PRD-RET-005`, `PRD-RET-006`, `PRD-RET-007`, `PRD-RET-024` | Covered | The app tracks entitlement per bill line. Imported history is for reports only (`PRD-IMP-010`) |
| A refund goes out as a negative tender amount: cash on 68 lines, UPI on 29, card on 7 at Singh More; one return line has no refund tender (store-close 3.5) | `PRD-RET-010`, `PRD-RET-011`, `PRD-RET-022`, `POL-07.01` | Covered | Refund to original tenders in proportion |
| Returns of earlier-POS bills stay unavailable in the app after a Store's switch (`POL-06.02`, `DEC-059`). The exports hold bill number, line, barcode, quantity and `Net Amount` (the paid value) but no tax, cost or tender per line | `POL-06.02`, `DEC-059`, `PRD-LIF-010`, `PRD-RET-005`; stock-ledger 9 (`SL-10`) | Stretch | The data could support a later plan that brings sales history in as a return source. Candidate decision 13 |
| No Store credit, Gift voucher or loyalty data exists | `PRD-RET-016` to `PRD-RET-021`, `POL-07.10`, `POL-07.13` | Covered | Nothing to import. Settings are OPEN |
| A same-price exchange appears as a return line and a sale line in one bill | `PRD-RET-007` | Covered | The app records the return and the replacement separately |

### 2.12 EBO sales and external billing

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| No brand-software report from an EBO is in the data. The single-brand Stores have no bill series (Spykar Deogarh, Jockey Banka) or are not shown to bill on a brand's software (Peter England Kankarbagh) (stores-and-codes 1.1) | `PRD-EBO-001` to `PRD-EBO-011`, `PRD-UXP-007` | Covered | No sample, so no EBO layout can be designed from the data. Ask for samples (open-questions). Blocks stage 4 EBO imports |
| KDPS builds a monthly "List of Sales Vouchers" and "List of Stock Details" per brand and Store: 34 reports a month (LP 6, PE 7, AS 10, VH 7, Banjaran 2, Blackberry 1, Mufti 1). These are outbound reports, not EBO imports ([offers-and-brand-reports.md](offers-and-brand-reports.md) 6) | `PRD-EBO-009`, `PRD-EXC-012`, `PRD-OFR-006`, `PRD-MOD-003` | Gap | No PRD rule covers a brand-facing monthly report. Who receives it and what money follows are OPEN. Candidate decision 4 |
| The side-by-side test imports of the earlier POS belong with the EBO import controls | `PRD-LIF-013`, `PRD-LIF-014`, `PRD-LIF-016`; [module-map.md](../design/architecture/module-map.md) 2.3 | Covered | Same validation and duplicate controls |

### 2.13 Offers, prices and supplier returns

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| 35 distinct mechanics in the offer files and brand emails; the standard table has 104 lines (51 `EOSS`, 37 `ATV`, 11 `GWP`, 5 `FRESH`). Four match the PRD kinds: a flat percentage, an amount off each unit, buy-N-get-M free and spend-X-get-Y-off (offers 2) | `PRD-OFR-001`, `PRD-OFR-003`; [shared-calculations.md](../design/calculations/shared-calculations.md) 5.3, 5.5 | Covered | Design 5.5 gives each kind a **Proposed** meaning; KDPS confirms (`GC7-9`) |
| Other mechanics: count-tier percentages (`B1-20%, B2-30%`; "B2 or more @ 40%"), a gift at a token price after a spend, a ladder of gifts by spend, a flat price per MRP band, a price for a pair, a percentage at one price point, "X or Y" alternatives, a cash-off fallback when the gift is out, a GST pass-on, a staff slab (offers 2) | `PRD-OFR-001` | Gap | None of these is one of the four kinds. Candidate decision 2 |
| Overlaps with no winner stated: 12 groups (Linen Club, Spykar, Mufti, Libas, Parx, SweetDreams, Allen Solly, Van Heusen, Louis Philippe, Peter England, Blackberry). No file states a combination rule (offers 4.1) | `PRD-OFR-021`, `POL-19.01`, `POL-19.04`, `DEC-108` | Covered | The PRD gives the winner when no rule permits combining. Which offers may combine is KDPS's (OPEN, KDPS Owner with Brand manager) |
| Brands keep style lists: `AMM`, `NOD`, `HOAS`; the Louis Philippe AMM list has 77,912 styles with a `Discount` or `No Discount` flag, a reason, an as-on date and a reference. 153 of 429 April voucher lines (36%) were not in it (offers 5) | `PRD-OFR-001` ("by item"), `PRD-MER-006` | Gap | No requirement for a brand-supplied eligibility list. Candidate decision 3 |
| Offers arrive as emails, screenshots and Google Drive artwork (74 links). Nine closing dates read `Not Disclosed Yet.`, one brand writes "Further communication", some rows have no year (offers 3.1, 4.3) | `PRD-OFR-002`, `PRD-MOD-010`, `PRD-IMP-001` | Covered | An open end date is allowed; the text `Not Disclosed Yet.` is not a date. The source is retained |
| The spend basis (MRP or net), whether the threshold itself qualifies, whether a gift counts and which of several slabs applies are not stated (offers 4.2) | `PRD-OFR-001`, `PRD-OFR-003`; `GC7-9` | Stretch | Each offer states its settings at approval; KDPS has to say them for each offer |
| A free unit in a B1G1 offer is a 100% line in the POS; in all 8 Mufti June bills with one it is the lowest-priced line (offers 4.2) | `PRD-POS-023`, `PRD-RET-024`, `DEC-109`; `GC7-9` | Stretch | The app spreads the discount, so no line is billed at zero. A brand report may want the reward unit named (OPEN, product owner) |
| Unexplained discounts: Mufti 20% and 30% lines and Blackberry flat 200, 300 and 400 lines with no matching offer; `Disc%` 0 with a rupee discount on hundreds of lines (offers 4.2; pos-exports 4.1) | `PRD-POS-003`; `GC7-7` | Covered | A manual discount needs authority and a reason. Whether these were manual is OPEN (KDPS Owner) |
| No cost share appears in any file. The debit-note type `EOSS CREDIT NOTES` is defined and never used | `PRD-OFR-002`, `PRD-OFR-006`, `PRD-ORG-016`, `POL-19.02`, `POL-19.05` | Covered | OPEN (KDPS Owner, Brand manager, Accounts) |
| EOSS offers are percentage tiers by season, not price lists | `PRD-OFR-004`, `PRD-OFR-007`, `POL-19.03` | Covered | Markdown approval authority is OPEN |
| The debit-and-credit-note workbook is the claims register: 345 debit notes on two tracking sheets (₹2.40 crore) against 473 on the summaries (₹3.94 crore); 208 worth ₹1.57 crore are `PENDING`; seven claim statuses; five return reasons (purchases 4) | `PRD-OFR-018`, `PRD-OFR-019`, `PRD-OFR-012`, `PRD-OFR-008` | Covered | The register links debit note, credit note and settlement as the PRD asks. 141 debit notes are on neither tracking sheet |
| Debit-note types and reasons beyond the PRD's list: `STAFF SALARY REIMBURSEMENT`, `MONTHLY TARGET INCENTIVE`, `FURNITURE CLAIM`, `EOSS CREDIT NOTES` (defined, unused); return reasons `WRONG INVOICE` (settled bill to bill), `STOCK CORRECTION`, `UNORDERED STOCK`, `EXCHANGE` (purchases 4.3) | `PRD-OFR-018` | Gap | `PRD-OFR-018` names shortage, damage, price differences, promotional funding and display support. Candidate decision 7 |
| No return window, deadline, eligibility or reminder appears in any file | `PRD-OFR-008` to `PRD-OFR-010`, `PRD-TRF-026`, `POL-01.09`, `POL-01.11` | Covered | Windows come from each agreement (OPEN; stage 3) |
| Returns to suppliers are raised as warehouse debit notes (`25-26/WH/PR-n`, padded three ways); one series is split between two sheets; a credit note was received in the wrong entity's ledger (purchases 4.2, 4.4) | `PRD-OFR-011`, `PRD-ORG-005`, `PRD-ORG-020` | Covered | Direct pickup or consolidation through the warehouse, with approved legs |
| The unsettled balance is the debit note less the credit note (a formula). Physical return reduces nothing in the PRD until credit is matched | `PRD-OFR-019`, `PRD-LED-017` | Stretch | The variance against the supplier's credit is posted when the credit note is matched (stock-ledger 7.5) |

### 2.14 Finance: ledger, cash and bank, payables, tax, profit

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| KDPS's books are in Tally. A supplier ledger printed from KDPS's own books names the company file "KDPS LIFESTYLE PVT LTD JH 24-25 (from 1-Apr-24)". It holds purchase vouchers numbered `25-26/nnnn` with particulars "GST LOCAL PURCHASE", and payment vouchers with plain numbers paid from an ICICI overdraft ledger ([purchases-and-supplier-notes.md](purchases-and-supplier-notes.md) 6.1) | `PRD-LED-001`, `PRD-LED-011` to `PRD-LED-013`, `POL-09.15`, `POL-09.16`, `POL-11.01`; [books-and-posting.md](../design/finance/books-and-posting.md) 2.3 | Covered | The purchase looks booked to a purchase ledger, not as an inventory voucher (inferred). Whether Tally tracks stock is OPEN (Accounts, `MM-12`). `JH` may mean Jharkhand and imply a separate company file for Bihar (guess) |
| No chart of accounts, cost method, accounting framework or posting rule was sent. The earlier POS gives one cost per barcode (`Rate`), not layers | `POL-09.06`, `POL-09.09`, `POL-09.10`, `POL-09.21`, `POL-09.23` | Covered | OPEN (Accounts, CA; stages 1 and 2). One cost per barcode points to an average or last-cost method (guess) |
| Credit notes are patched between two legal entities by remarks ("received in KDPS ledger, not in Om Ganpati") (purchases 4.4) | `PRD-ORG-005`, `PRD-ORG-020`, `PRD-LED-002` | Stretch | Which entity books which claim is OPEN (KDPS Owner, CA) |
| The Store cash book is calculated (opening plus cash sales minus deposits minus cash sent to head office). There is no counted cash, denomination, variance or recount; `Bank Deposit Verified` is empty ([store-close-cash-and-bank.md](store-close-cash-and-bank.md) 3.10) | `PRD-CSH-001`, `PRD-CSH-002`, `PRD-CSH-011`, `POL-02.13` | Covered | Practice has no count; the app adds it. Tolerance and approvers are OPEN (KDPS Owner question 25) |
| Cash reaches the bank through a branch, a cash-deposit machine or an EZCASH retailer; cash to head office is typed with a person or account text; no in-transit state; the bank file has handling and EZCASH fees (store-close 4.3, 5) | `PRD-CSH-005`, `PRD-CSH-009` | Stretch | The PRD names pickup, safe handover and bank deposit, not channels or their fees. Design can hold them as bank movements |
| Card settles one credit per terminal per day (21 terminals on one week); UPI settles as one PhonePe credit per day for all Stores. `Tid No` is empty on every sale line; no table links a terminal or merchant ID to a Store (store-close 4, 5) | `PRD-CSH-006`, `PRD-POS-010`, `PRD-INT-011` | Stretch | UPI cannot be split by Store from the bank file; it needs the provider's per-Store report as an import source. A terminal-to-Store registry is not a named PRD record. Candidate input to the bank design |
| The bank extract is two layouts in one sheet, text amounts in Indian comma format, a gap from 15 Apr to 31 May 2026, no running balance. NEFT narrations follow `<format> <place> <purpose> [month year]` on 229 of about 376 lines (stores-and-codes 3.6; store-close 4) | `PRD-CSH-007`, `PRD-CSH-008`, `PRD-CSH-009`, `PRD-INT-011` | Covered | Keep KDPS's narration convention as a reference. Import without duplicates; unmatched lines to review |
| Loan EMI and interest sit among supplier payments; three automatic debits to one brand (₹36.9 lakh) appear in no payment column of the invoice tracker (store-close 4.3; purchases 3.5) | `PRD-PAY-004`, `PRD-PAY-007`, `PRD-PAY-008`, `PRD-LED-008` | Covered | Loans and floats stay apart from expenses. A payment is paid only from bank evidence |
| Petty cash is a 12-head sheet, unused. The heads include `Wow Bill/ Incentive Expance` and `Net Charge` (store-close 3.13) | `PRD-CSH-004`, `PRD-PAY-014`, `POL-09.14` | Covered | Float and limits are unset (OPEN, Accounts, KDPS Owner). Heads are configuration |
| The supplier tracker has no payment status, no due date and an ageing formula that never stops: 49 payment rows (₹23.5 lakh) against 942 dated invoices (₹6.78 crore typed). Payments are typed with no bank reference (purchases 3.5) | `PRD-PAY-001`, `PRD-PAY-002`, `PRD-PAY-007` | Covered | The PRD marks a payment paid from bank evidence only |
| Four sources give four supplier balances: the tracker, its `SUMMARY` pivot (interest subtracts), the debit-note workbook and Tally. Totals disagree on payments, cash discount and goods returns (purchases 9) | `PRD-LED-008`, `PRD-PAY-002`, `PRD-LIF-009` | Covered | Which is the source of record for the side-by-side test is OPEN (Accounts, CA) |
| Cash discount (`CD`) is typed in the master as a fraction, a whole percent, `NET` or "% IN BILL"; credit days are numbers, `NO` or `NIL`; there is an `Interest If Any` column; an agency firm stands between brand and KDPS (purchases 3.7, 3.10) | `PRD-ORG-016`, `POL-01.12`, `POL-01.14`, `PRD-PAY-001` | Stretch | `PRD-ORG-016` has payment terms, not cash discount. Interest on a supplier balance and agent commission have no PRD home. Candidate decision 6 |
| MSME class has no column; one ledger prints a Udyam number (purchases 6.2) | `PRD-PAY-010`, `POL-10.09` | Covered | OPEN (Accounts, CA; stage 5) |
| `U.S POLO (SOR)` and "CONSIGNMENT" remarks mark sale-or-return and consignment stock | `PRD-PAY-003`, `POL-01.13`, `POL-09.03` | Covered | The agreement decides, not the label |
| Three sources give three GST rules: the PT template (5% or 18% by item word; 2,500 on `BASIC`, 2,625 on `MRP`; `PRAVIN JI ` older), the Singh More report (12/112 below ₹2,500, 18/118 from ₹2,500 on the line's net sale value) and vendor invoices (12% on Aug 2025 `MUFTI.xlsx` lines, 5% on most 2026 lines, 18% on high-MRP lines). The `GST %` list holds `12` and `TAX FREE`, which no formula returns ([item-master-vocabulary.md](item-master-vocabulary.md) 10) | `PRD-TAX-005`, `PRD-OFR-005`, `POL-10.02`, `POL-10.05`, `POL-10.06`; shared-calculations 5.8 (`GC7-1`, `GC7-2`, `GC7-8`) | Stretch | OPEN for the CA. The compared value (per unit or per line, before or after discount, with or without tax), the boundary and the date of each rate are the open points. Nothing here is a rate |
| No POS stock or sales export carries an HSN. HSN appears in vendor PT files (31 of 35 layouts), debit-note lines (221 distinct values) and the tracker's `COMPILED PT FILE` | `PRD-TAX-005`, `PRD-MER-004`; shared-calculations 5.8; masters 4.1 | Stretch | The design refuses a line with an Unknown HSN, so each opening SKU needs an HSN or a CA-approved item-to-HSN map. Candidate decision 17 |
| One supplier file carries IRN and acknowledgement columns; the challan shows no e-way bill number | `PRD-TAX-003`, `PRD-POS-019`, `POL-10.03` | Covered | Which bills need an e-invoice is OPEN (CA; stage 4) |
| The earlier analyses estimate margin from a cost ratio and call gross profit less running costs "net profit kept" (analyses 2.3, 5) | `PRD-NAV-010` to `PRD-NAV-017`, `PRD-EXC-008` | Clash | `PRD-NAV-017` ends a Store P&L at profit before tax and shows net profit only for a legal entity. Terminology only; the analyst figures are not KDPS values |
| The data holds no fixed assets, deposits, loans on a Store basis or net asset value input | `PRD-NAV-001` to `PRD-NAV-009`, `PRD-TAX-009` | Covered | Nothing to import; the books supply these in stage 5 |

### 2.15 Franchise and partner accounts, and HRMS and payroll

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| The claims workbook has a `FRENCHEEZI` list of two names (KDPS Lifestyle Pvt Ltd, Om Ganpati Enterprises). No partner agreement, commission, royalty or deposit appears anywhere | `PRD-FRN-001` to `PRD-FRN-006`, `POL-12.01`, `POL-12.05` | Covered | Whether any is a franchise partner is OPEN. No franchise terms to import |
| No EBO commission or settlement basis appears; `EOSS CREDIT NOTES` and `MONTHLY TARGET INCENTIVE` are defined claim types with no row | `PRD-EBO-009`, `PRD-PAY-012`, `POL-12.06` | Covered | OPEN (KDPS Owner, Accounts; stage 5) |
| The stores' list asks for attendance "with biometrics", "send attendance", view leave and delays (access-and-store-asks 4.1, items 11 to 13) | `PRD-HRM-004`, `PRD-HRM-006`, `PRD-HRM-007`, `PRD-PRO-010` | Clash | `PRD-HRM-004` allows a photo, location, time and registered device "without face matching", and `PRD-PRO-010` excludes facial recognition. A fingerprint device has no PRD home (a Gap if that is meant). Candidate decision 11 |
| The stores' list asks for staff add and remove, contact and bank detail updates, a monthly target and achievement per member (items 16 to 19) | `PRD-HRM-001`, `PRD-HRM-002`, `PRD-HRM-009`, `PRD-HRM-011`, `PRD-HRM-012`, `PRD-ACS-008` | Covered | Whether a Store may edit staff bank details is OPEN (KDPS Owner, HR) |
| The list asks for growth and de-growth per member and members "with pie" (items 20, 21) | `PRD-EXC-009` | Gap | No PRD measure or picture. Candidate decision 12 |
| A note beside one offer row reads `NSV - 24lakh 1% 28lakh 2% 34lakh 3%` and `Deo 1staff` (offers 1) | `PRD-HRM-010`, `PRD-HRM-013`, `POL-13.07`, `POL-13.11` | Covered | Reads like a staff incentive slab on net sale value (guess). Meaning and payee OPEN (KDPS Owner, HR). Not a setting |
| Bank tags show salary (94 lines), incentive (18), advance salary (6) and travel (12) paid by NEFT (stores-and-codes 3.6) | `PRD-HRM-014`, `PRD-HRM-016`, `PRD-HRM-017` | Covered | Payroll is stage 6. The data holds no payroll rule, leave balance or attendance event |

### 2.16 Exceptions, reports and planning

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| The dashboard requirement (`DFR`) lists Today's Sale, MTD Sales, Quantity Sold, Total Bills, target against achievement, and per Store `Todays`, `MTD`, `YTD` of seven measures (Sale, Quantity Sold, Total Bills, `Average Bill Value`, `Units per Transaction`, `Discount Value`, `Discount %`) ([access-and-store-asks.md](access-and-store-asks.md) 1.4, 5) | `PRD-EXC-005`, `PRD-EXC-009`, `PRD-EXC-010`, `PRD-UXP-001` | Stretch | No definition exists for gross or net, tax in or out, whether returns and free carry bags count, MTD and YTD basis, `Average Bill Value`, `Units per Transaction` or `Discount %`. OPEN (KDPS Owner, Accounts). Candidate decision 9 |
| The earlier analyses use terms that differ from Words used: sell-through (sold over sold plus on hand), cover in months, ageing from a season label, four dead-stock rules, markdown for any discount, margin and "mark-up", profit, SOH as stock, brand "families" (analyses 5) | `PRD-EXC-006`, `PRD-EXC-009`, `PRD-STK-007`, `PRD-NAV-011`, `PRD-NAV-017`; Words used | Clash | Terminology only; none resolved here. `PRD-EXC-009` wants one definition per metric, held in the `reports` module. Candidate decision 9 |
| Exceptions today are status columns, remarks and calls. No owner, due date or exposure exists (purchases 3; transfers 6) | `PRD-EXC-001` to `PRD-EXC-004` | Covered | Routing, owners and due times are OPEN (KDPS Owner; `POL-02.16`) |
| Sales history: Deoghar 3 Apr 2025 to 13 Jun 2026; Hazaribagh from 4 Sep 2025 to 24 Jul 2026; Singh More 66 days; Banka, Dumka, Bokaro and Sanskar one month. Positive-only stock files cannot show stock-outs | `PRD-EXC-017`, `PRD-EXC-018`, `POL-15.03` | Covered | The minimum clean history is not set. Stock-outs and promotions must be qualified |
| No footfall or conversion data; the analyses say conversion cannot be computed | none | Gap | Candidate decision 10 |
| Analyst plans and thresholds (3 to 4 turns a year, a 36% to 37% discount ceiling, margin bands, the winter budget, festival dates) (analyses 3) | `PRD-EXC-016`, `PRD-EXC-017`, `POL-15.07`, `POL-15.08` | Covered | Planning values are configured until validated. These are not defaults (section 6) |
| Brand sell-through is computable from sales and stock files; the daily WhatsApp summary is set at 9 PM | `PRD-EXC-012`, `POL-02.14` | Covered | Recipients are OPEN |

### 2.17 Opening, closure, migration and the side-by-side test

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| 29 earlier-POS and Store layouts for sales and stock; files cover one day to a financial year; layouts differ by Store and report; no export names its source system ([pos-exports.md](pos-exports.md) 2, 3) | `PRD-LIF-013`, `PRD-LIF-014`, `PRD-IMP-003`, `PRD-IMP-004` | Stretch | A saved layout is per Store and per report. Can the POS give a fixed one-day sales report and an end-of-day SOH? OPEN (KDPS Owner) |
| The earlier POS's last SOH is one row per barcode with `Tqty`, `Mrp`, `Rate`; no period, no piece, no condition | `PRD-LIF-027`, `PRD-LIF-004`, `PRD-LIF-005` | Covered | The switch count is compared with it at barcode level and every difference reported |
| No opening manifest, verified count or valuation evidence exists. The ledger workbooks show stock inward from Dec 2021 with `Opening Stock` and `Audit Diff` lines (pos-exports 5.4) | `PRD-LIF-003` to `PRD-LIF-007`, `POL-14.02`, `POL-14.03` | Covered | Real opening data is loaded only at a Store's switch (`POL-14.07`). Layouts are built with labelled sample data in stage 1 |
| Historical sales: 5,383 Deoghar bills for FY 2025-26, 7,094 Hazaribagh bills, 1,225 Singh More bills, one month elsewhere | `PRD-LIF-010`, `PRD-IMP-010`, `PRD-LIF-014` | Covered | Reports only; creates no live stock, receivable or tax document |
| Customers exist only as free text on bills; there is no customer master, and `Phone` is a number | `PRD-LIF-023`, `PRD-RET-018`, `PRD-POS-012`, `PRD-SEC-009`; `DEC-052` | Stretch | "Retain customer history" has no source to migrate. Imports keep no customer name or phone until question 37 is answered. Candidate decision 15 |
| Supplier balances are in two ledger PDFs (KDPS's books, a supplier's books), the tracker `SUMMARY` and Tally. No advance, deposit or customer due beyond two dues sales appears | `PRD-LIF-009`, `POL-14.03` | Covered | Opening dues come from the last closed books, not these sheets |
| No billed-retained item, held cart or unfinished transfer is in the data | `PRD-LIF-028`, `POL-14.04` | Covered | Nothing to carry from the data |
| The switch gives each Store a fresh bill series; the old series is kept for reference (stores-and-codes 2) | `PRD-LIF-015`, `PRD-POS-020` | Covered | The earlier series is never continued |
| Piece labelling: Deoghar 13,354 pieces, Hazaribagh 27,695, Banka 21,771 | `PRD-LIF-025`, `POL-14.07` | Covered | A labelling plan per Store: pieces, who labels, label stock. OPEN (Operations question 6) |
| Run length of the side-by-side test and the material-difference threshold are not set | `POL-14.08`, `PRD-LIF-012`, `PRD-LIF-026` | Covered | OPEN (KDPS Owner, Accounts) |

### 2.18 Operator experience

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| The Store note lists 27 handwritten points: Sell, Inventory (Stock Receive, Stock Transfer, Voucher search, PT file generation), Item Search, Attendance, Customer Search, Member Details, Reports (access-and-store-asks 4.1) | `PRD-UXP-004`, `PRD-UXP-002`, `PRD-STK-006`, `PRD-POS-015`, `PRD-REC-001` | Covered | The PRD lists capabilities, not menu labels. The Store list has no day close, till, cash or petty cash |
| "Can Re print Only" after a bill search | `PRD-POS-016`, `PRD-POS-014` | Covered | Agrees with a bill that is never edited |
| "Voucher search" and "Send attendance" are unclear. A PRD voucher is a Tally entry | `PRD-UXP-002`, `PRD-HRM-014` | Covered | OPEN (Operations, HR) |
| Free-text notes mix English and Hindi words (`Bhara`, a Hindi note on the challan) (transfers 2) | `PRD-PRO-009` | Covered | English first; Hindi for stages 1 to 5 arrives in stage 5 |

### 2.19 Technical platform

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| The Madura extract is 113,983 rows for 176 customers; the PRD target is 10,000 lines in under a minute. `SUPPLIER BRAND DETAILS.xlsx` is 2.6 MB with about 151,000 blank formatted rows; the `"OWNER"` PT sheet is formatted to 16,342 rows | PRD Performance table, `PRD-PRF-001`, `PRD-SEC-011` | Stretch | The file is eleven times the reference import. Filter to KDPS's rows before staging and measure |
| Single-Store stock files list 17,000 to 33,000 barcode rows | PRD Performance (200,000 SKUs reference), `PRD-PRF-001` | Covered | Well inside the reference workload |
| Real KDPS data is held on the Railway test setup; imports keep no customer name or phone until KDPS answers | `PRD-LIF-026`, `PRD-SEC-009`, `PRD-SEC-010`, `DEC-028`, `DEC-052` | Covered | OPEN (KDPS Owner question 37, `D-4`) |
| Supplier invoice numbers repeat across suppliers (four numbers under two suppliers); a bill series number is unique per Store and year | `PRD-IMP-011`, `PRD-INT-002` | Covered | An import identity is scoped by supplier or by series |
| Timestamps: no time of day in any export | `PRD-MOD-009` | Covered | Event time starts with the app |

### 2.20 Words used

| What the data shows | PRD / policy / design that covers it | Fit | Note |
| --- | --- | --- | --- |
| KDPS's brand reports are titled "List of Sales Vouchers" and "List of Stock Details" and use `Vch/Bill No.` | Words used "Voucher" (a Tally entry) | Clash | In the data a voucher is a report. Say "brand report" in docs and code |
| The earlier analyses treat SOH as the Store's stock | Words used "SOH, stock on hand" (a comparison source) | Clash | Only a count creates stock (`PRD-REC-008`) |
| `GR` and `GR NUMBER` mean a goods return; GRN means a goods receipt note | Words used "GRN" | Stretch | Two similar words; the claims register keeps `GR` as a source word |
| A KDPS delivery challan moves goods; `PRD-TAX-006` speaks of TDS challans | `PRD-TAX-006` | Stretch | Same word, two meanings. Add the term to Words used before design uses it |
| `ABV`, `ATV`, `GWP`, `AMM`, `NOD`, `HOAS`, `HOVH`, `EOSS`, `FRESH`, `CORE`, `Promo`, `CD`, `Credit Days`, `Interest If Any` | none | Gap | Not in Words used. A new term goes there first (`AGENTS.md`). Many meanings are guesses |
| `FRENCHEEZI` | `PRD-ORG-010` (franchise-owned, franchise-owned company-operated) | Stretch | Treat as the source word for a franchisee or related entity until KDPS says |
| "Mark-up" and "margin" used loosely (a margin on MRP called a mark-up) | `PRD-PTW-011`, `PRD-NAV-011` | Clash | Ticket MARGIN, realised profit and agreed margin are different things in the PRD |

## 3. Inputs for designs not yet written

[gaps-before-code.md](../reports/gaps-before-code.md) lists three stage 1 designs that are still missing (GC-6, GC-8, GC-9). Later stages also need designs of their own. Each part below names the notes that feed one design and the facts it should carry. A design may use the data as a sample for layouts and tests; it may not copy a value into a setting.

### 3.1 GC-6 Imports and opening data (stage 1; first real use in stage 2; real opening data only at a Store's switch)

Covers `PRD-IMP-001` to `PRD-IMP-013`, `PRD-LIF-003` to `PRD-LIF-011` and `POL-14.07`.

| Feeds from | What the design should take |
| --- | --- |
| [data-quality-and-import-rules.md](data-quality-and-import-rules.md) | The 60 problem classes (files, dates, numbers and identifiers, master attributes, rows and bills, errors and totals, personal data), each with a proposed rule, and the contents of the validation report (section 9). Every rule marked OPEN needs an owner's answer first |
| [pos-exports.md](pos-exports.md), [pos-export-layouts.json](pos-export-layouts.json) | 29 saved-layout candidates by id: header row and column offset, signed quantity, bill-level fields on a bill's first line, brand-cut files whose totals do not add up, zero rows kept or dropped, and what no export carries (tax, cost at sale, time, piece, billing device, return link, UPI). Which layouts stage 1 builds first is OPEN (product owner) |
| [pt-file-layouts.md](pt-file-layouts.md), [pt-layouts.json](pt-layouts.json) | 35 vendor layouts in nine families, 22 standard fields, skip rules, barcode classes, per-file difficulty, one file holding several invoices or customers, six files with no invoice number, and the KDPS template and example in the 20-column export profile. One row per piece against one row per barcode is OPEN |
| [item-master-vocabulary.md](item-master-vocabulary.md) | Seed vocabularies as proposals, never as approved values: 22 seasons, 592 brands, 98 items, sizes, 44 brand spelling groups, the item map, the `Color` price tiers and the `GST %` list. Mapping rules from source words to values (`PRD-IMP-003`, `PRD-IMP-008`) |
| [stores-and-codes.md](stores-and-codes.md) | Source-to-Store maps: bill-series prefixes, file-name tags, `Store Name` values, dealer-site codes (`KDPS-HZB-MF`), Madura `Sold-to` towns, transfer-document prefixes |
| [transfers.md](transfers.md) | The four inward-ledger layouts, four document-number shapes and a classification for `Stock Transferr` lines and the `S-` series, so a side-by-side import never counts a transfer as a sale or moves stock (`PRD-LIF-014`) |
| [store-close-cash-and-bank.md](store-close-cash-and-bank.md) | The daily-report workbook layouts, the two-layout bank statement and the card and UPI settlement imports (`PRD-INT-011`) |
| [purchases-and-supplier-notes.md](purchases-and-supplier-notes.md) | The invoice tracker, the debit-note `SUMMARY` and `SOFTWARE` sheets, the supplier master and two supplier ledgers: the only sources for supplier dues (`PRD-LIF-009`) |

Facts the opening-data layouts must handle:

- **An opening row** needs identity, quantity per piece, location and valuation evidence (`PRD-LIF-005`). The earlier POS gives barcode, brand, design, size, quantity, `Mrp` and one `Rate`. It gives no HSN, a real colour on about 22% of rows, a usable season on about 59%, and a `Supplier` field that names KDPS units.
- **Opening dues, advances and deposits.** No file holds advances or deposits. Supplier dues exist as two ledger PDFs, the tracker summary and Tally. Customer dues are two dues sales.
- **No manifest and no count** exist. The only count evidence is `Audit Diff` lines.
- **Personal and restricted fields** must be masked or left out of the test (data-quality L-1; KDPS question 37).
- **Staged commit.** A Store's opening has tens of thousands of rows, so the large-document rules of stock-ledger 10.6 apply.

### 3.2 GC-8 Offline counter (designed in stage 1, enabled in stage 4 under policy 16)

Covers `PRD-OFF-001` to `PRD-OFF-019` and `POL-16.01` to `POL-16.07`. The data says little about connectivity, so the design needs Operations' answers (open-questions).

| Fact | Source | Why it matters |
| --- | --- | --- |
| About 15 to 22 bills a day per Store (Deoghar 5,383 in a year; Hazaribagh 4,611 in 209 days; Singh More 1,165 in 66 days; computed) | [pos-exports.md](pos-exports.md) 4.1; [store-close-cash-and-bank.md](store-close-cash-and-bank.md) 3.4 | The size of a pause or a reconciliation queue after an outage |
| Working set: 17,000 to 33,000 barcode rows per Store; offers per brand run to dozens of lines | pos-exports 5; [offers-and-brand-reports.md](offers-and-brand-reports.md) 3 | What the counter caches under `PRD-OFF-004` |
| Cash is about 35% of tender value (Deoghar FY 2025-26 35.5%; Singh More 34% to 35%); UPI and card are the rest | store-close 3.3, 6 | A cash-first pilot (`POL-16.02`) covers about a third of sales by value |
| 6.1% of Deoghar bills and about 10% of Hazaribagh bills hold a return or exchange line | pos-exports 4.1; data-quality H-5 | Returns and exchanges are online-only (`PRD-OFF-015`), so those bills wait for a connection |
| 245 barcodes at Hazaribagh and 157 at Deoghar were sold at more than one `Rate` | data-quality D-4 | How often the counter asks for the MRP printed on the item (shared-calculations 2.3) |
| Items at ₹0 or ₹7 (carry bags, free gifts) are common; zero-value bills are about 2% of bills (110 of 5,383 at Deoghar) | pos-exports 4.1 | An unknown or ineligible item blocks finalisation (`PRD-OFF-018`), so bags and gifts must be known items |
| One bill series per store code, restarting each year; a second `S-` series at one Store | [stores-and-codes.md](stores-and-codes.md) 2 | Device series per registration and year (`PRD-POS-020`); the format needs a device part |
| No time of day in any export; no device, printer or clock data | pos-exports 11 | Wrong-clock and duplicate-tab handling (`PRD-OFF-019`) has no data to test against |
| `CLOUD` is `NO` for three Stores and `RETAIL JI` is `YES` for six (meaning unknown; guess: two POS products) | stores-and-codes 1.1 | Which Stores bill offline today is OPEN (Operations) |

### 3.3 GC-9 Backup, restore and export (stage 1)

Covers `PRD-SEC-012`, `PRD-LIF-022`, `PRD-ACP-019` and `POL-18.01` to `POL-18.05`.

- **Evidence is mostly files.** The tracker lists about 1,475 invoice PDFs and 778 PT workbooks; the claims workbook lists debit-note copies; there are photographs and ledger PDFs ([purchases-and-supplier-notes.md](purchases-and-supplier-notes.md) 3, 4). `PRD-IMP-002` keeps every original file, so the bucket is part of the backup and its restore proof (deployment D-2).
- **Originals hold restricted data.** Customer names and phones on every bill, supplier bank accounts copied onto invoice rows, staff bank text, tax numbers (data-quality L-1). Backups are encrypted (`POL-18.02`). The data touches four of the retention classes of `POL-18.05`: financial, stock, employee and customer. No legal hold is known. Durations are the CA's.
- **Control totals.** The data's own totals disagree in many places (purchases 9; data-quality K-1), so the export must state totals the system computes (`PRD-LIF-022`).
- **After a restore** every series is paused and reconciled against evidence outside the database: printed bills, the Stores' daily workbooks (which carry the POS bill number), the bank file and Tally (`POL-18.04`; numbering-and-audit 3.6).
- **Hosting.** Real KDPS data sits on a Railway test setup outside India until KDPS agrees (`D-4`, `DEC-028`). Test backups hold that data too.

### 3.4 Later-stage designs not yet written

| Design (stage) | Feeds from | Facts to carry |
| --- | --- | --- |
| PT workbench and costing profiles (2) | [pt-file-layouts.md](pt-file-layouts.md); purchases 6.4, 8 | The 20-column profile; formulas as observations only; per-brand cost evidence (rate, taxable over quantity, net unit cost, service charge, `Motiya`, round-off, whole-rupee `BASIC`); the matching tolerance is an open input; one row per piece against a quantity |
| Receiving, GRN and invoice matching (2) | purchases 3, 7; [transfers.md](transfers.md) 4 | Tracker columns and statuses, the naming convention, 538 file-name-only invoices, a split to several Stores by remark, direct delivery to Stores, 19 of 21 PT files agreeing with the tracker |
| Transfers and counts (3) | [transfers.md](transfers.md); store-close 3.7 | Challan and gate-pass fields, the 443 against 450 tally, `Stock Transferr` lines, document shapes, freight split, cross-entity senders, audit differences |
| Supplier returns and the claims register (3) | purchases 4 | Seven claim statuses, five reasons, debit-note series and padding, claim types beyond `PRD-OFR-018`, 141 untracked debit notes, entity split, no deadline column |
| Store day close, cash and petty cash (4) | [store-close-cash-and-bank.md](store-close-cash-and-bank.md) 3.10, 3.13 | Cash book formula, deposit channels, cash to head office, twelve petty-cash heads, no count or variance |
| Counter: bills, tenders, returns (4) | [pos-exports.md](pos-exports.md) 4; store-close 3, 6 | Bill structure, tender mix, dues sales, price above MRP, rounding, returns inside bills, carry bags and gifts |
| Offers and price lists (4) | [offers-and-brand-reports.md](offers-and-brand-reports.md) 1 to 4 | The 35 mechanics, vocabulary, overlaps, missing dates, open questions on basis and threshold. Settings stay per offer at approval (`GC7-9`) |
| Brand offer reports and brand lists (no stage placed) | offers 5 to 7 | The AMM list (77,912 rows), the 34 monthly reports, the voucher layout, `Dis %` rules by an analyst, the stock-date question. Needs candidate decisions 3 and 4 first |
| EBO imports (4) | none | No sample exists. Ask for one report per brand software (open-questions) |
| Bank and provider reconciliation, payables, Tally exchange (5) | store-close 4, 5; purchases 3.5, 6 | Two-layout statement, narration convention, per-terminal card credit, one UPI credit a day, deposit channels and fees, loan lines, supplier ledgers in two shapes, voucher numbers `25-26/nnnn`, the `JH` company file |
| Site lifecycle: opening data and the switch (4) | pos-exports 5; data-quality 5; stores-and-codes 2 | Last SOH at barcode level, opening valuation, labelling counts, fresh series, the earlier series kept for reference |
| HR, targets, incentives (6); reports (every stage); planning (6) | [access-and-store-asks.md](access-and-store-asks.md) 4, 5; [analyses-and-metrics.md](analyses-and-metrics.md) 2, 5, 6 | Store wish list, `DFR` measures, metric definitions in dispute, history length, no footfall, no attendance data |

## 4. Inputs for existing designs

Facts each design should check against the data. These notes do not edit any design; a clash with a design that comes from a PRD or policy rule is reported in section 2.

### 4.1 [structure-and-masters.md](../design/masters/structure-and-masters.md) (GC-2)

- **Two states** (3.4, `GC2-1`): registrations seen are all Jharkhand's; the Store list has Bihar towns. Ask the CA before the baseline refuses a mapping.
- **Legal entities and legal names** (3.2): KDPS Lifestyle Pvt. Ltd., Om Ganpati Enterprises, Sanskar Retail, Jainsons Lifestyle, a Jockey invoice to another company.
- **Codes and aliases** (2.1): several codes and tags per listed place (stores-and-codes 3); the Store code is never changed, so each first code must be chosen with its aliases.
- **Stores and Sites** (3.3): four Stores in Deoghar, two in Banka, two in Kankarbagh; brand counters inside one Store; single-brand Stores.
- **Brand aliases and sub-brand** (4.1): 44 groups of brand spellings that differ only by spacing, punctuation or case ([item-master-vocabulary.md](item-master-vocabulary.md) 3.2) fit `brand_alias`; division codes inside a brand have no place, because the design has aliases only.
- **SKU identity** (4.1): `COLOR` as a price tier makes colour Unknown; two Unknown-colour SKUs of one style and size would collide.
- **Size sets** (4.1): 135 sizes in one list; per-category sets are the design.
- **Vocabularies** (4.2): counts in [item-master-vocabulary.md](item-master-vocabulary.md) 1; a price-tier attribute has no entry.
- **External codes** (4.3): 7-digit in-house, 5-, 6-, 10- and 12-digit vendor codes and rounded barcodes; scope per supplier is needed.
- **Packs and units** (4.4): packs counted as `2P`, `6P`; mixed packs.
- **Tracking profiles** (4.6): apparel and footwear piece-tracked by default (`POL-04.09`); the item list has 38 accessories and inner-wear items; carry bags and gifts are quantity goods.
- **Parties** (5.1): KDPS units as suppliers on stock rows; agent firms; supplier bank details copied to rows; one supplier per brand in the source list.
- **Agreement terms** (5.2): the terms table has payment terms; cash discount, credit days and interest are in the supplier master. Check whether they fit under money terms.
- **No past start dates** (2.2, `GC2-7`): historic facts such as a Store's opening date are fields, not version starts. A bulk master import has to follow the rule.

### 4.2 [shared-calculations.md](../design/calculations/shared-calculations.md) (GC-7)

- **Offer mechanics** (5.3 to 5.5): the four kinds against the 35 mechanics; count tiers and token-price gifts have no meaning in 5.5.
- **GST rules seen** (5.8, `GC7-1`, `GC7-2`, `GC7-8`). All OPEN for the CA; none is a setting.
  - PT template: `INPUT TAX` 5 or 18 by item word, 2,500 on `BASIC` (at or below is 5); `OUTPUT TAX` 2,625 on `MRP`.
  - Singh More daily report: 12/112 below 2,500 and 18/118 from 2,500, on the line's net sale value, prices tax-inclusive. This is a case of "per line, after discount, with tax".
  - Vendor invoices: 12% in Aug 2025, 5% on most 2026 lines, 18% on high-MRP lines; the compared value is not stated.
  - Eleven Singh More lines of 2,500 or more have several pieces and a per-piece value below 2,500, which is the per-unit against per-line question.
- **Slab boundary** (10.1): "below" in the daily report, "at or below" in the PT template.
- **Price basis** (`GC7-1`): the daily report treats prices as tax-inclusive.
- **Rounding** (3.3, 5.9, `GC7-3` to `GC7-5`): `Bill Amount` is the half-up whole-rupee sum on 5,361 of 5,383 bills; 3 round up from below one half; 19 differ by more than ₹1. `Net Amount` keeps paise, so a percentage discount is held to paise (the rule is unknown).
- **Offer basis and reward unit** (5.3, `GC7-9`): the data uses MRP in the Louis Philippe and Spykar rows; the lowest-priced unit is the free one in all 8 Mufti June bills. These are observations, not settings.
- **Manual discount on an offer line** (5.7, `GC7-7`): unexplained rate lines in Mufti and Blackberry files.
- **Returns** (7.1, `GC7-6`): a refund is a negative line; whether round-off counts in the paid value is open.
- **Price above MRP** (5.2): 8 lines in one Store's workbook.
- **Costing** (8): `BASIC` x 1.2 or x 1.1; a vendor example where `BASIC` is 65% of `MRP` and `P RATE` 78%; extra charges; whole-rupee `BASIC`. Synthetic cases only.

### 4.3 [stock-ledger.md](../design/stock/stock-ledger.md)

- **Movement columns of the earlier SOH** (2.3): `Op Qty` as opening count, `Sale` as sale issue, `St Trf` and `Stf Reciept` as dispatch and arrival, the rest empty. No receipt origin, condition, coverage, document or counter-party.
- **Receipt origin** (4): the ledger workbooks hold an inward `Date` and `Bill no` per barcode, the nearest evidence of a receipt date. At the switch the opening origin is dated at the count.
- **Valuation** (7.6, 9): one `Rate` per barcode, tax basis unknown, above `Mrp` on some rows. FIFO layers for opening stock all start at the switch.
- **Zero rows** (9): positive-only files cannot show a stock-out.
- **Audit differences** (8.4): `Audit Diff` and `Scan Stock` as inward lines, against count surplus held as excess.
- **Piece counts** (5): tens of thousands per Store to label.
- **Two MRPs** (2.3 of calculations; 4): one barcode at several MRPs.
- **Transfers between pools** (7.8): the challan rate of 349 and a carrier charge; no rule for freight.
- **Earlier-POS returns** (`SL-10`): see candidate decision 13.
- **Held and damaged goods** (6.1): none recorded today.
- **Counts and shortages** (8): a 443 against 450 tally; no reasons.

### 4.4 [books-and-posting.md](../design/finance/books-and-posting.md)

- **Tally** (2.3, `MM-12`): purchases look booked as "GST LOCAL PURCHASE"; debit notes are `<FY>/WH/PR-n`; credit notes carry the supplier's number (`SR/n`).
- **Chart of accounts** (3.1): none sent. The ledger names seen ("ICICI Bank Ltd (OD) A/c", "GST LOCAL PURCHASE") are not a chart.
- **Financial year and periods** (4.1, `GC4-1`): April to March in every series.
- **Entities** (2.1): credit notes received in the wrong entity's ledger.
- **Cash and bank postings** (stage 5): twelve petty-cash heads, deposit fees, loan EMI and interest, card and UPI settlement.
- **Supplier return variance** (7.2): debit note against credit note, settled bill to bill in some cases.
- **Extra invoice charges and round-off**: `Motiya`, `Bus Fare`, `Service Charge`.
- **Late and mis-dated entries** (4.4, `SL-15`): debit-note dates with day and month swapped.

### 4.5 [access-and-approvals.md](../design/access/access-and-approvals.md) and [personas.md](../design/access/personas.md)

- **No users list** (4.3): real assignments are OPEN.
- **The six-role grid** (4.2): the first six templates; Admin and Owner broad words need expanding (`POL-02.03`).
- **A shared `Admin` salesperson** (5.4): own-record scope needs a real user per salesperson.
- **PT preparers by brand** (5.1, 5.3): brand-scoped assignments.
- **Approvals** (9): none today; the limits are OPEN.
- **Restricted fields** (6): bank text, customer contact, cost columns exposed in every stock file.
- **Shared POS sessions** (3.3): 5 minutes idle (`POL-02.18`); the data does not say how many people share a till.
- **Data providers**: the MOM names two people for the earlier POS formats and the commercial lists; their roles are unknown (access-and-store-asks 3.2).

### 4.6 [numbering-and-audit.md](../design/platform/numbering-and-audit.md) (GC-5)

- **Bill number** (3.4, 3.5): `<FY>/<store code>/<serial>`, for example `26-27/DEO/919`; no padding; the longest seen is 16 characters (`26-27/LEEDEO/544`), longer if a serial reaches four digits. Check it against the limit the CA confirms (`POL-10.07`).
- **Financial year** (3.3, `GC5-1`): restarts on 1 April.
- **Per store, not per device** (3.4): the data shows one series per store code; the design needs a device part.
- **A second `S-` series** at one Store, used for transfers (stores-and-codes 3.1).
- **Other series seen:** transfer documents in four shapes, challan `DCJ/26-27/nnnn`, debit notes `<FY>/WH/PR-n` (padding varies), `KDPS/26-27/nnnn`, voucher numbers `25-26/nnnn`, supplier-side numbers (stores-and-codes 3.3, 3.9). Format of statutory documents is OPEN (`GC5-2`).
- **After a restore** (3.6): Stores' daily workbooks carry the POS bill number and can serve as evidence.

### 4.7 [module-map.md](../design/architecture/module-map.md)

- **`ebo-imports`** (2.2, 2.3) holds the earlier-POS imports; no EBO sample exists.
- **`reports`** owns metric definitions; the brand-facing report has no module home yet (candidate decision 4).
- **`supplier-returns`** owns the claims register; claim types beyond `PRD-OFR-018` (candidate decision 7).
- **`finance` · operations** is a candidate home for a terminal registry and the card and UPI settlement imports.
- **`merchandise`** holds attributes and tracking profiles; packaging and gift items (candidate decision 5) and sub-brand (candidate decision 16) land there.
- **`offers`** would hold brand style lists if candidate decision 3 is taken.
- **`files-imports`** holds saved layouts; the 29 POS layouts and 35 PT layouts are its first inputs.

### 4.8 [deployment.md](../design/platform/deployment.md)

- **`D-4`:** real data and customer details on Railway, outside India, until KDPS agrees (KDPS question 37).
- **`D-2`:** the file bucket holds the original files, which hold restricted data.

## 5. Candidate decisions for the product owner

These are proposals only. Each one needs an entry in [decisions.md](../decisions.md), approved by the product owner, before any PRD or policy text changes (`AGENTS.md`, "Alignment rules"). Questions that only KDPS or the CA can answer go in [questions-for-kdps.md](../questions-for-kdps.md); this list names who decides and what it would touch.

**1. What is a one-brand Store billed on KDPS's own POS?**
- *Question.* Words used defines EBO as a store billed on the brand's own software. Allen Solly Deogarh and Lee Deogarh have bill series that look like KDPS's POS.
- *Options the data suggests.* (a) Keep EBO as defined and add a Store format for a one-brand Store billed on KDPS's POS. (b) Redefine EBO as a Store that sells one brand, and make "billed on the brand's software" a separate property. (c) Say which Stores bill on brand software and keep the words.
- *Decides.* Product owner (words); KDPS Operations (which Stores).
- *Would touch.* Words used "EBO", `PRD-ORG-010`, `PRD-EBO-011`, `PRD-UXP-007`, the `ebo-imports` module.

**2. Which offer kinds does the PRD support?**
- *Question.* `PRD-OFR-001` names four kinds. The brand files use count-tier percentages, a gift at a token price, a ladder of gifts, a flat price per MRP band, a price for a pair, a percentage at one price point, "X or Y" alternatives and a cash-off fallback.
- *Options.* (a) Add the kinds KDPS wants to the PRD. (b) Model each as a combination of the four kinds. (c) Leave some out (the GST pass-on belongs to tax; the staff slab to incentives).
- *Decides.* Product owner, with the Brand manager; KDPS Owner approves offers (`POL-19.03`).
- *Would touch.* `PRD-OFR-001`, `PRD-OFR-002`, `POL-19.01`, `POL-19.04`; design 5.3 and 5.5 (`GC7-9`).

**3. Brand style-eligibility lists.**
- *Question.* Brands keep style lists with a flag, reason, as-on date and reference (AMM, NOD). 36% of April voucher lines were not in the list.
- *Options.* (a) Add a requirement for a brand-supplied eligibility list and a rule for missing styles. (b) Treat the list as an import that sets an offer's item scope.
- *Decides.* Product owner; Brand manager; KDPS Owner for missing styles.
- *Would touch.* `PRD-OFR-001`, `PRD-OFR-002`, `PRD-MER-006`, imports.

**4. A brand-facing monthly report.**
- *Question.* KDPS builds 34 reports a month (a sales list and a stock list per brand and Store). No PRD rule covers it.
- *Options.* (a) Out of scope. (b) In scope as a report with a stage and an owner. (c) Part of EBO and brand settlement in stage 5.
- *Decides.* Product owner; KDPS Owner and Accounts (who receives it, what money follows).
- *Would touch.* `PRD-EXC-012`, `PRD-OFR-006`, `PRD-OFR-018`, `PRD-EBO-009`, `PRD-MOD-003`.

**5. Gift-with-purchase and packaging items.**
- *Question.* Carry bags, free gifts, trolleys and promo bags are stock and sales lines at ₹0 or a token price.
- *Options.* (a) A non-merchandise item class kept out of stock value, dead stock and margin. (b) Ordinary SKUs with a flag. (c) Leave to configuration.
- *Decides.* Product owner, KDPS Owner, Accounts (cost).
- *Would touch.* `PRD-MER-004`, `PRD-MER-014`, `PRD-OFR-001`, `PRD-EXC-006`, `PRD-NAV-001`.

**6. Supplier cash discount, interest and agent terms.**
- *Question.* Cash discount (its base and when it is earned), credit days, interest on a balance and agent firms sit in the supplier master. `PRD-ORG-016` has payment terms only.
- *Options.* (a) Name cash discount and interest under payment terms. (b) Keep them agreement terms configured per supplier. (c) Out of scope for the app.
- *Decides.* Product owner; Accounts.
- *Would touch.* `PRD-ORG-016`, `PRD-PAY-001`, `POL-01.12`, `POL-01.14`.

**7. Claim types and return reasons.**
- *Question.* The claims workbook has staff salary reimbursement, monthly target incentive, furniture claim, EOSS credit notes, and returns for wrong invoice or stock correction.
- *Options.* (a) Extend the claim kinds in `PRD-OFR-018`. (b) Make the kinds configurable. (c) Keep only the PRD's list.
- *Decides.* Product owner; Accounts; Brand manager.
- *Would touch.* `PRD-OFR-018`, `PRD-OFR-019`, `PRD-DMG-009`.

**8. What does the month in a season label mean, and may a decode be offered?**
- *Question.* A label embeds a month (lot, receipt or launch is unknown). About 41% of season cells are dates or blank.
- *Options.* (a) Map the month to launch date. (b) Keep it as a label only. (c) Treat the unreadable cases as unknown season (`PRD-LIF-006`) and offer the "Mon-YY" decode as a suggestion a person accepts.
- *Decides.* KDPS Owner and Booking (meaning); product owner (rule).
- *Would touch.* `PRD-MER-004`, `PRD-LIF-006`, `PRD-IMP-006`, `PRD-IMP-009`, `PRD-ACP-014`.

**9. Where the dashboard and report definitions live.**
- *Question.* The `DFR` measures and the analysts' terms (sell-through, cover, ageing, dead stock, average bill, units per transaction, discount %, stock turn) have no definition. Cover is in months in the data and weeks in Words used.
- *Options.* (a) Add the definitions to Words used. (b) Keep them in the `reports` module under `PRD-EXC-009`. (c) Adopt the analysts' terms where KDPS agrees.
- *Decides.* Product owner; KDPS Owner and Accounts.
- *Would touch.* `PRD-EXC-006`, `PRD-EXC-009`, `PRD-STK-007`, Words used.

**10. Footfall and conversion.**
- *Question.* The analyses say conversion cannot be computed without a door counter.
- *Options.* (a) Out of scope. (b) Add a footfall record and a measure.
- *Decides.* Product owner; KDPS Owner.
- *Would touch.* `PRD-EXC-005`, `PRD-EXC-009`; the PRD hardware row.

**11. Biometric attendance.**
- *Question.* The Store note asks to post attendance "with biometrics".
- *Options.* (a) Keep photo, location, time and device without face matching. (b) Add a fingerprint device (a new PRD rule and a hardware row). (c) Defer to stage 6.
- *Decides.* Product owner; KDPS Owner; HR.
- *Would touch.* `PRD-HRM-004`, `PRD-PRO-010`, the PRD Stack hardware row.

**12. Growth and de-growth per member, and a picture of members.**
- *Question.* The Store note asks for them; no PRD measure exists.
- *Options.* (a) Define a comparison measure (period, basis). (b) Drop.
- *Decides.* Product owner; KDPS Owner; HR.
- *Would touch.* `PRD-EXC-009`, `PRD-HRM-012`.

**13. Earlier-POS bills as a return source after a Store's switch.**
- *Question.* Such returns are unavailable (`DEC-059`). The exports hold bill number, line, barcode, quantity and the paid `Net Amount`, but no tax, cost or tender per line.
- *Options.* (a) Keep unavailable and serve under the no-bill route. (b) Import selected bills as a return source with a documented cost source. (c) Import all bills for the 15-day window.
- *Decides.* Product owner; Accounts (cost source).
- *Would touch.* `PRD-LIF-010`, `PRD-LIF-015`, `PRD-RET-005`, `PRD-EBO-005`, `POL-06.02`, stock-ledger `SL-10`.

**14. May the earlier POS `Rate` serve as opening valuation evidence?**
- *Question.* `Rate` is one cost per barcode, tax basis unknown, above `Mrp` on some rows.
- *Options.* (a) Accept it with the CA's sign-off. (b) Accept it for reports only and require invoice evidence for value. (c) Hold opening rows without evidence as excess (`PRD-LIF-005`).
- *Decides.* Accounts and the CA.
- *Would touch.* `PRD-LIF-004`, `PRD-LIF-005`, `PRD-LIF-027`, `POL-14.03`, `POL-09.21`.

**15. Customer data in imports and history.**
- *Question.* Customers exist only as free text on bills. Imports keep none until KDPS answers question 37.
- *Options.* (a) Never import. (b) Import for history with a customer matched by phone and consent. (c) Import for the return window only.
- *Decides.* KDPS Owner; product owner.
- *Would touch.* `PRD-LIF-023`, `PRD-RET-018`, `PRD-POS-012`, `PRD-SEC-009`, `PRD-SEC-010`, `DEC-052`.

**16. Price tier and sub-brand as attributes.**
- *Question.* `COLOR` holds a price tier; brands carry division codes.
- *Options.* (a) Add price tier and sub-brand to the attributes `PRD-MER-004` names. (b) Leave them to Organisation configuration (`PRD-ORG-011`).
- *Decides.* Product owner; Booking.
- *Would touch.* `PRD-MER-004`, `PRD-ORG-011`, structure-and-masters 4.1.

**17. Where each opening SKU gets its HSN and tax rate.**
- *Question.* No stock or sales export has an HSN, and KDPS taxes by item word. The design taxes by HSN.
- *Options.* (a) A CA-approved item-to-HSN map before each Store's switch. (b) Collect HSN per style at the opening count. (c) Both.
- *Decides.* Accounts and the CA (policy 10); Booking (items).
- *Would touch.* `POL-10.02`, `POL-10.05`, `POL-10.06`, `PRD-TAX-005`.

**18. Is the bill rounded?**
- *Question.* `Bill Amount` is a whole-rupee half-up sum on most bills; 19 of 5,383 differ by more than ₹1.
- *Options.* (a) Round to the whole rupee, half up. (b) Do not round. (c) Another rule.
- *Decides.* Accounts and the CA. A policy bullet is needed; none exists.
- *Would touch.* policy 9 (a new bullet), `PRD-MOD-014`; design 5.9 (`GC7-4`).

**19. What are Om Ganpati Enterprises, Sanskar Retail and Jainsons Lifestyle?**
- *Question.* Franchise partner, related firm, second legal entity or trade name. Claims, credit notes and stock rows name them.
- *Options.* (a) Legal entities inside the Organisation. (b) Franchise partners under policy 12. (c) Separate businesses outside it.
- *Decides.* KDPS Owner; CA; product owner.
- *Would touch.* `PRD-ORG-001`, `PRD-ORG-002`, `PRD-FRN-005`, `PRD-FRN-006`, `POL-12.01`, `PRD-TRF-004`.

**20. Piece-tracking scope and the labelling workload.**
- *Question.* Each Store holds 13,000 to 28,000 pieces, all to be labelled at the switch. Inner-wear and accessories are in the item list.
- *Options.* (a) Keep apparel and footwear piece-tracked by default and plan labelling. (b) Choose quantity profiles for low-value categories (`POL-04.09`). (c) Stagger the switches by labelling capacity.
- *Decides.* Booking and Operations; KDPS Owner.
- *Would touch.* `POL-04.01`, `POL-04.09`, `PRD-MER-014`, `PRD-LIF-025`.

**21. Transfer freight.**
- *Question.* A carrier charge is split by hand between Stores. No PRD rule covers it.
- *Options.* (a) An expense of the receiving Store. (b) An addition to stock cost, which strains "no markup" in `PRD-TRF-012`. (c) A head-office expense.
- *Decides.* Accounts and the CA.
- *Would touch.* `PRD-TRF-012`, `PRD-LED-015`, `PRD-LED-006`, `POL-03.06`, policy 9.

**22. May a Store's registration be in another State than its Site?**
- *Question.* Every registration seen is Jharkhand's. The design baseline `GC2-1` refuses a mapping across States.
- *Options.* (a) Keep the baseline; each Bihar Store maps to a registration in its State. (b) Relax it to a warning. (c) Say how Bihar Stores bill today.
- *Decides.* CA; Accounts.
- *Would touch.* `POL-10.01`, `POL-10.06`, `POL-10.08`, `PRD-ORG-005`, `PRD-ORG-020`.

**23. Other customers' rows in a supplier's all-customer extract.**
- *Question.* The Madura file holds 176 customers; only 5,923 rows are KDPS's. `PRD-IMP-002` keeps the original file.
- *Options.* (a) Keep the original in restricted storage and stage only KDPS rows. (b) Keep nothing but KDPS rows. (c) Ask Madura for a KDPS-only file.
- *Decides.* Product owner; KDPS Owner.
- *Would touch.* `PRD-IMP-002`, `PRD-SEC-009`, `PRD-SEC-010`.

**24. Which Store goes offline first, with the data in view?**
- *Question.* A cash-first counter covers about a third of sales by value; returns and exchanges (6% to 10% of bills) need a connection.
- *Options.* (a) Keep the cash-first pilot. (b) Bring forward the evidence procedure for an external terminal. (c) Pick a Store with fewer card and UPI sales.
- *Decides.* KDPS Owner and Operations.
- *Would touch.* `POL-16.01`, `POL-16.02`, `POL-16.04`, `PRD-OFF-017`.

## 6. Where analyst assumptions must not leak

The rule: **never invent a value** (`AGENTS.md`). A threshold, rate, formula, limit or meaning in a KDPS sheet or an earlier analysis is what that file does today. It becomes a setting only through a signed policy, and an example in the PRD or policies is not a setting until a signed policy makes it one. The PRD says targets marked proposed never act as policy defaults and "Suggested commercial, financial or permission values are never active defaults" (PRD "Business measures", "Required policy configuration"). Switching a capability on cannot bypass a missing policy (`PRD-SEC-017`). Designs fix no value and keep tests on labelled synthetic data (structure-and-masters 2.4; shared-calculations 1, 12.3).

| Value or rule in the data | Where it appears | What stops it | Owner |
| --- | --- | --- | --- |
| Stock turn of 3 to 4 a year, 3 to 4 months of stock, sales over stock of 2 or more as "good" | Analyses and dashboards | `POL-15.07`; PRD "Business measures" | KDPS Owner |
| A discount "ceiling" of 36% to 37% (both configs hold `null`), discount bands with an edge at 36.68, "5 points of discount is worth ₹17.2 L" | Dashboards, `build-report.py` | `POL-19.03`; no policy sets a ceiling | KDPS Owner |
| Margin colour bands (30 and 15; 25 and 10; 20% for months), "Fix first", "Watch", "Protect", brand verdict words | `build-report.py`, dashboards | `AGENTS.md`; thresholds are unset | KDPS Owner |
| Running costs: 7% of sales plus ₹2.2 L rent, ₹1.0 L electricity, ₹0.4 L other a month | Both `dashboard-config.json` | `POL-09.20` (allocation bases are Accounts' and the CA's) | Accounts |
| A 14-month "never sold" window, 6 or more pieces as overstock, age bands of 3, 6 and 12 months, season-year buckets, the 11-month divisor, a cost ratio clipped to 0.05 to 1.20 | Analyses, worklists, script | `PRD-EXC-009` (one definition per metric); `POL-15.03` | Product owner |
| The winter budget (₹78 L at cost, a range of ₹60 L to ₹98 L, a split of 54, 18, 15, 8 and 5%) and festival dates | Winter purchase plan | `POL-05.09` (actual budgets to be supplied) | KDPS Owner, Booking, Accounts |
| GST: 5% or 18% by item word with 2,500 on `BASIC` and 2,625 on `MRP` (PT template); 12/112 below 2,500 and 18/118 from 2,500 on the line value (daily report, as 10.71 and 15.2542); the `PRAVIN JI ` older formula; vendor-invoice rates by date; Peter England's "GST benefit" of 11.02% and 6.25% | PT template, daily report, vendor files, offers | `POL-10.02`, `POL-10.05`, `POL-10.06`: no threshold or applicability is assumed | CA |
| `P RATE` as `BASIC` x 1.2 or x 1.1; `BASIC` at 65% of `MRP`; `MARGIN` 22; cost at 65% of `MRP`; `Purchase Price` at 93% of `Item Rate`; +0.35% | PT template, vendor files | `POL-03.06`, `POL-03.07`: no formula or rate is assumed | Accounts, Booking |
| Cash discount fractions, credit days (7 to 80), `NET`, "% IN BILL" in the supplier master | Supplier master | `POL-01.12`, `POL-01.14`: terms come from the agreement | KDPS Owner, Accounts |
| Offer slabs and percentages, "the lowest-priced unit is free", "the top rate applies to every qualifying line" | Brand emails, bill patterns | `POL-19.01`, `POL-19.02`, `POL-19.04`: no combination or share is assumed | KDPS Owner, Brand manager |
| The brand-report rules: a duffel bag at ₹199, a cash-off put on one line, a tier by qualifying-piece count; the `Dis %` rule; the formulas in `KDPS-DIRECTION.xlsx` (tests of 4,999 and 6,999; 40% and 50%) | Analyst workbook and skills | `POL-19.01` to `POL-19.05`; analyst work, not brand terms or KDPS terms | Brand manager |
| The role grid: Admin without Finance, Owner "Override", Store POS "NO" on discounts | `ERP_DASHBOARD_V1.xlsx` | `POL-02.01`, `POL-02.05`, `POL-02.10`, `POL-02.11` | KDPS Owner |
| Season decode ("Mon-YY" as a month and year), `Color` tiers, category last letters `M`, `E`, `P`, `Fit` codes `LM`, `MM`, `VLM`, `HM`, brand "families" (LP + LY + LR) | Analyst readings | `PRD-IMP-008`, `PRD-IMP-009`: nothing fills identity from an unaccepted guess | Booking, KDPS Owner |
| Whole-rupee half-up bill rounding; `Credit` at zero; "Card includes UPI"; a half-paise tolerance on `Amount` | POS exports | `POL-09.13`, `POL-09.24`: tolerances are set from real examples | Accounts, CA |
| The SOH `Rate` as the unit cost | Stock files | `PRD-LIF-005`; `POL-09.09` | Accounts, CA |
| Bihar and Jharkhand by town | General knowledge, not in the data | `POL-10.01`, `POL-10.06` | CA |

Where the analyst values live: `store-analysis/` (the HTML reports, `build-report.py`, the two `dashboard-config.json` files, the worklists), the winter purchase plan, `BRAND REPORT` and `BILL SUMMARY`, the two skill files, `KDPS-DIRECTION.xlsx`, and `scope-dashboard-detail/`. The full list is in [analyses-and-metrics.md](analyses-and-metrics.md) section 3. Reports built from the data must label such figures as estimates with their basis (`PRD-EXC-010`).
