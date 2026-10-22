# Goods-in, first version

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Current**, approved as a whole by the product owner on 21 Oct 2026: sections 1 to 10 section by section with their design choices, then sections 11 and 12 with the whole. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements, for the first version of stage 2 ([phases.md](../../phases.md) stage 2): from Booking and buying, recording and approving bookings; from Receiving and price tickets, the Arrival, the count, the GRN, the PT made by uploading the fixed PT template, its approval and the scan-in at the Site; from Damage, quarantine and disposal, damage reported at or after receipt; from Stock and warehouse control, stock search. It details the stage 2 modules `booking`, `receiving` and `merchandise` · PT, and the damage reports of `stock` · documents, of [module-map.md](../architecture/module-map.md) section 5. Its open questions are GI-n.

- PRD IDs: `PRD-BKG-001`–`PRD-BKG-011`, `PRD-BKG-013`, `PRD-BKG-014`, `PRD-BKG-015` (manual entry; its AI reading later); `PRD-REC-001`–`PRD-REC-009`, `PRD-REC-012`, `PRD-REC-013`, `PRD-REC-016`–`PRD-REC-018`, `PRD-REC-019` (reversal before scan-in), `PRD-REC-021`, `PRD-REC-022`; `PRD-PTW-008`–`PRD-PTW-012` (the meaning of the template's columns); `PRD-MER-005`–`PRD-MER-007`, `PRD-MER-009`, `PRD-MER-013`, `PRD-MER-014`; `PRD-IMP-002`, `PRD-IMP-006`, `PRD-IMP-008`, `PRD-IMP-011`, `PRD-IMP-012`; `PRD-STK-001`, `PRD-STK-003`, `PRD-STK-006`, `PRD-STK-017`; `PRD-DMG-001`–`PRD-DMG-006`, `PRD-DMG-010`; `PRD-PRO-001`; `PRD-UXP-005`; `PRD-LIF-001`, `PRD-LIF-002`; `PRD-ACP-001`, `PRD-ACP-003`, `PRD-ACP-005`.
- Policies: 1 (`POL-01.02`–`POL-01.05`, `POL-01.08`, `POL-01.14`), 2 (`POL-02.07`, `POL-02.09`, `POL-02.12`), 3 (`POL-03.02`–`POL-03.04`), 5 (`POL-05.01`–`POL-05.10`), 10 (`POL-10.08`), 17 (`POL-17.02`, `POL-17.03`, `POL-17.11`).
- Decisions: DEC-105, DEC-128 to DEC-139, DEC-141.

Depends on: [module-map.md](../architecture/module-map.md) (section 5: the stage 2 modules; 6.2 flows A, B, C and E), [domain-model.md](../architecture/domain-model.md) (section 2: the stage 2 records; section 5: approval boundaries), [stock-ledger.md](../stock/stock-ledger.md) (2.3 movement kinds, 6 holds and sellable stock, 13 the interface), [books-and-posting.md](../finance/books-and-posting.md) (posting a valued movement), [structure-and-masters.md](../masters/structure-and-masters.md) (products, external codes, vocabularies, agreements), [access-and-approvals.md](../access/access-and-approvals.md) (approvals, My work, exceptions), [numbering-and-audit.md](../platform/numbering-and-audit.md) (document numbers), [imports-and-opening-data.md](../platform/imports-and-opening-data.md) (stored files and the import pipeline).

Inputs, not ranked: the grill notes [stage-2-grill-notes.md](../../plan/stage-2-grill-notes.md); [pt-file-layouts.md](../../data-notes/pt-file-layouts.md) section 1 (KDPS's PT template) and [item-master-vocabulary.md](../../data-notes/item-master-vocabulary.md) (its master sheet); [grn-standard-fields.md](../../research/grn-standard-fields.md); the earlier RetailsOps system document [system-dumb.md](../../history/system-dumb.md) (sections 4 to 6, 13 to 15, 17.5, 18.3 to 18.6, 20.4, 20.5) and the earlier RetailsOps goods plan (`change-prd-goods-to-store-acceptance.md`, kept outside this repository).

---

## 1. What this document fixes

The first version of goods-in is the operational path from a booking to stock that can be sold at a Store, all entered by hand (`DEC-134`, `DEC-136`):

1. **Booking.** The booking document is uploaded and the booking is entered by hand. It is approved against open-to-buy (section 3).
2. **Arrival.** Goods reach a Store or a warehouse with their supplier invoice (section 4).
3. **Count and GRN.** The goods are counted by hand against the invoice; documents and photos are uploaded; the GRN is issued (section 4).
4. **PT file.** Whoever is assigned makes the PT file by hand in the Organisation's fixed PT template and uploads it for the GRN (section 5).
5. **PT approval.** A different person approves it; the stock becomes official and valued (section 6).
6. **Scan-in.** The goods are scanned in at the Site; at a Store they become sellable (section 7).

Damage reported at or after receipt (section 8) and stock search with the stage 2 reports (section 9) complete it.

**After the first version**, still to be placed (RR-546): the PT workbench and costing profiles per brand; readers for vendor PT files in XLS, XLSB and CSV and their layouts; all AI reading, of booking documents and PT files; barcodes and labels for goods that arrive without a brand barcode; piece-tracked products and piece IDs; supplemental PTs and clean lines going ahead while others are disputed; PT corrections after scan-in; inbound ownership, goods owned before they arrive (`DEC-139`). Each keeps its PRD ID; nothing here removes it.

**Moved out of stage 2:** supplier invoice matching goes to stage 5, with supplier payments (`DEC-137`). The side-by-side test imports of the earlier POS stay parked.

**Not in stage 2:** transfers between Sites, supplier returns, write-off, disposal and counts (stage 3); payment runs (stage 5); buying suggestions (stage 6).

**Already built in stage 1 and used here, not redesigned:** Sites, Stores, business units and locations; products, external codes, vocabularies, brands, suppliers and agreements; roles, approvals, My work and exceptions; number series; stored files; the stock ledger's movements, holds, coverage, acceptance and valuation; books, posting maps and journals; Site readiness per activity.

**What every section keeps:**

- Only the count creates custody. A booking, an invoice or a PT never creates stock (`PRD-REC-008`, `PRD-ACP-001`).
- The GRN holds quantities, never values (grill round 1).
- Every approval is by a different authorised person from the preparer, and binds to the exact version approved (`POL-02.07`, `PRD-ACS-007`).
- An unknown value stays Unknown, never zero (`PRD-MOD-015`).
- An approved record is never edited; a correction is a linked record (`PRD-REC-019`).
- Receiving is available at a Site or business unit only after its receiving readiness is approved (`PRD-LIF-001`, `PRD-LIF-002`).

## 2. The flow end to end

```mermaid
flowchart LR
  B["Booking<br/>document uploaded,<br/>entered by hand,<br/>approved"] --> A["Arrival<br/>goods and invoice<br/>at a Site"]
  A --> G["Count and GRN<br/>by hand against<br/>the invoice"]
  G --> H{"Held lines<br/>decided?"}
  H -- yes --> P["PT file<br/>uploaded for<br/>the GRN"]
  P --> V["PT approval<br/>by a different<br/>person"]
  V --> S["Scan-in<br/>at the Site"]
  S --> R["Store: sellable<br/>Warehouse: available<br/>to move"]
```

| Step | Who (persona) | What happens | Record | Stock and money effect |
| --- | --- | --- | --- | --- |
| 1. Booking entered | Booking (P-BKG) | Uploads the booking document (photo or PDF); enters supplier, brand, season and destination, and lines of style code and quantity, with colour and size where given and an indicative cost and MRP each (`DEC-130`, `DEC-136`) | Booking, Draft (`booking`) | None |
| 2. Booking approved | An approver with the booking limit, not the preparer | Checks the booking against the open-to-buy budget of its brand and season, on its value at cost; the booking takes its brand's Agreement version in force at that moment (`PRD-BKG-004`, `DEC-132`) | Booking, Approved; then Issued and Confirmed as the supplier is told and accepts (`POL-05.01`) | None. Open-to-buy is reserved (`POL-05.02`) |
| 3. Arrival recorded | Whoever receives at the Site: Warehouse (P-WHS) or the Store's staff (P-STM) | Records the supplier, the brand and each invoice's number and date, and uploads the invoice; the invoice comes first (`DEC-133`) | Arrival (`receiving`) | None |
| 4. Count and GRN | The receiver | Counts by hand against the invoice, by style, colour as the invoice names it, and size (`DEC-138`); records shortage, excess, wrong, unidentified and damage apart; uploads the other documents and photos; issues the GRN, with no approval. Each GRN line links to its booking line or goes to Booking for review (`DEC-130`) | GRN (`receiving`) | Custody at the Site from the count, cost Unknown, not accepted (stock ledger: receipt count). Damage at once under a damage hold; wrong and unidentified goods in quarantine; excess under an excess hold (stock ledger 6.1) |
| 5. Held lines decided | Damage: a different person, followed up by Operations (P-OPS). Excess, wrong, unidentified: a Booking approver | Confirms or rejects each damage report; takes each excess, wrong or unidentified line in, or records it as not received (grill round 1) | Damage report (`stock` · documents); the discrepancy's decision (`receiving`) | Rejection clears only that damage hold (`PRD-DMG-003`); confirmed damage stays held (`PRD-DMG-006`) |
| 6. PT file uploaded | Whoever is assigned to make PTs | Uploads one PT file for the GRN, in the fixed template, once every held line is decided (`DEC-137`). The upload is refused whole when a value is off its list or the rows do not match the GRN per style and size with the same quantity (`DEC-134`, `DEC-135`, `DEC-138`) | PT, a draft revision (`merchandise` · PT) | None |
| 7. PT approved | A different person with PT approval authority | Approves the PT on its total proposed acquisition cost (P RATE times quantity) and confirms any new products the upload proposed (`DEC-135`; module-map 6.2 flow C) | PT, official and frozen | Coverage recorded; cost established; the stock value and its balanced journal, including what is owed to the supplier, posted under the posting map (grill round 1, `PRD-STG-002`) |
| 8. Scan-in | At a Store, its staff; at a warehouse, Warehouse | Scans each item's barcode against the approved PT and puts it on the floor or in the backstore, or in a warehouse bin; a repeated brand barcode asks which product it is (`DEC-135`) | Acceptance (`receiving`) | Acceptance and a location move (stock ledger). At a Store the goods become sellable (stock ledger 6.3); at a warehouse, available to move |

- **Before the scan-in**, a wrong PT is reversed and a corrected file uploaded and approved again by a different person (`DEC-137`).
- **Confirmed-damaged pieces** take no PT and stay held (`DEC-137`).
- **Follow-up owners:** Booking for shortage, excess, wrong and unidentified goods and for GRN lines that do not match a booking; Operations for damage (grill notes, 19 Oct 2026). Each reaches its owner in My work as an exception or a task.
- **Nothing is sent** to suppliers or anyone else from the app before stage 5 (`DEC-099`): a booking is marked Issued and Confirmed by the person who did it outside the app.

## 3. Booking

A booking records what has been ordered from a supplier for a brand and a season, to arrive at one destination. It is intent only: it creates no stock and no money effect (`PRD-REC-008`, `PRD-BKG-003`). It lives in `booking` (module-map section 5).

### 3.1 Recording a booking

- **The document first.** Booking (P-BKG) uploads the booking document the brand gave, as a photo or PDF, one file or more, kept as a stored file attached to the booking (`PRD-IMP-002`; the stage 1 stored-file rules: PDF, JPEG or PNG). At least one document is attached before the booking is submitted for approval. **Design choice.**
- **Then the entry, by hand** (`DEC-136`). Nothing is read from the document in the first version; its AI reading follows later (`PRD-BKG-015`, RR-546).
- **Header** (`PRD-BKG-001`, `PRD-BKG-014`):

| Field | Rule |
| --- | --- |
| Supplier | A party holding the supplier role, linked to the brand by a brand–supplier link in force on the booking's date (`PRD-MER-021`); otherwise the booking is refused, naming the missing link |
| Brand | A brand in force |
| Season | A value of the attribute the Organisation marks as its season (structure-and-masters 4.2 "As built"; RR-550) |
| Destination | One Site, a Store or a warehouse. Different destinations are different bookings. The business unit is chosen when the goods arrive (section 4) |
| Delivery window | A start and an end date (`POL-05.05`) |
| Booking document | The stored files above |
| Terms | Shown from the brand's Agreement, read-only (3.2) |

- **Lines** (`DEC-130`):

| Field | Rule |
| --- | --- |
| Style code | Required. As the document writes it; it need not be a style already set up |
| Colour | Optional. As the document writes it |
| Size | Optional, for an order placed at style level. A missing size stays missing; it is never Free Size (`PRD-MER-005`) |
| Quantity | Required. Whole pieces, more than zero |
| Indicative cost | Required. Integer paise, per piece. Used only for the booking's totals and the open-to-buy check; it never becomes the receipt cost (`PRD-BKG-003`) |
| MRP | Required. Integer paise, per piece |
| Delivery date | Optional, for a line arriving apart from the rest (`POL-05.05`) |

- **The size-colour grid** enters one style's lines at once: colours down, sizes across, quantities in the cells, one indicative cost and MRP for the style that each line can then change (`PRD-BKG-001`). A line without colour or size is entered on its own.
- **Totals** shown: pieces, indicative cost and MRP value, for the booking and per style (`PRD-BKG-003`).
- **Number.** A draft carries an internal reference. Approval gives the booking its number from its own number series (numbering-and-audit); with no series set up, approval is refused, naming the missing series. **Design choice.**

### 3.2 Terms

- A booking takes its terms from its brand's Agreement: commercial model, ownership-transfer event, return rights and conditions, payment and money terms (`PRD-BKG-002`, `POL-01.02`, `POL-01.08`, `POL-01.14`, `DEC-129`). It records none of its own and cannot change them.
- The terms are fixed at approval: the booking keeps the Agreement version in force at that moment, and takes a later version only when it is approved again (`POL-01.04`, `DEC-132`).
- A brand with no Agreement in force cannot have a booking approved; the refusal names the brand. A term the Agreement holds as Unknown stays Unknown on the booking (`POL-01.11`). **Design choice.**

### 3.3 Open-to-buy

- An open-to-buy budget is an amount in paise for one brand and one season (`PRD-BKG-004`). Booking prepares it, Accounts records its check, and the Owner approves it; it is used only once approved (`POL-05.09`). They are three different people for each version, and the approval has no value limit (`DEC-142`). A change is a new version through the same three steps. Every amount is OPEN until the product owner sets it (V-17, RR-080).
- **Remaining** open-to-buy is the approved budget less the value reserved by approved bookings of that brand and season.
- A booking's value is the sum of its lines' quantity times indicative cost (domain-model section 5, DM-8).
- Approving a booking needs its value within the remaining open-to-buy; otherwise approval is refused with the shortfall shown, and the budget must be raised first. With no approved budget for the brand and season, approval is refused (`PRD-SEC-017`). **Design choice.**
- Approval reserves the booking's value (`POL-05.02`). Cancelling a balance, or an approved change that lowers the value, releases the difference; received goods keep their share reserved.
- **As built** (`S2-F01-T02`; migration `0086`). **Design choice** throughout; no amount is chosen.
  - **The budget.** One per brand and season, each pair once (`booking.budget-exists`); a change is its next version. The brand must be in force today and not retired (`booking.brand-not-in-force`). The season is named by its value alone, an approved value in force today of the attribute marked as the Organisation's season at the command's start (`booking.season-not-in-vocabulary`, naming that attribute and the value; structure-and-masters 4.2 "As built"; RR-550, GI-2). While no attribute is marked as the season, preparing a budget is refused, `merchandise.attribute-not-marked`, naming the setting `merchandise.season-attribute`, before its brand is checked; nothing falls back to another attribute (code-house-rules 12.14). The budget keeps the attribute its season was a value of when it was prepared and the version of the marking it read (code-house-rules 7.3), so a later change of the marking leaves it as it was; its read answers that version beside the season. The amount is whole paise, never below zero, with its origin (code-house-rules 12.14); on `dev` and in tests it is synthetic.
  - **Scope.** A budget carries its brand as its one scope fact (`booking.open_to_buy_budget`, view, create, edit, approve; access-and-approvals 5.3), so a person's brand scope decides whose budgets they prepare, read, check or approve; every route authorises in its command with the brand, and the list leaves out the budgets the reader's scope does not cover. The tables are unscoped, as the masters of `organisation` are (structure-and-masters 6.1).
  - **Accounts' check is a decision of `access`** under its own action type, `booking.open_to_buy_budget.check`, decided under approve on `booking.open_to_buy_check`, a record type no permission on the budget gives, so the check and the approval are held apart (`POL-05.09`). It therefore reaches Accounts in My work with the approval panel, the reason list, evidence and audit of every decision, and `access` refuses the version's preparer (access-and-approvals 9.3; `POL-02.07`). Preparing a version requests the check. Its effect records the check, an append-only row of `booking`, one per version, naming who checked it and the decision (`open_to_buy_budget_check`, whose trigger also refuses the preparer), and in the same transaction requests the version's approval, `booking.open_to_buy_budget.change`, under approve on the budget (access-and-approvals 9.8b "As built for a document decided in two steps"). So the Owner, or whoever holds the approval, finds the approval in My work only once the check is recorded, and the approval's effect refuses a version with no check (`booking.budget-not-checked`). A check rejected, or an approval rejected, leaves the version Rejected, back with Booking. The preparer of both requests is the version's preparer. **Three different people** (`DEC-142`; RR-548): whoever recorded the check may not decide the approval of the same version either. The approval's effect names the checker to `access` as the person who decided its earlier step, and `access` refuses them as it refuses a preparer, `access.earlier-step-decider`, naming them as `earlier-step-decider`, and does not offer them the approval in My work (access-and-approvals 9.3, 9.8b). A person holding both permissions may check one version and approve another.
  - **No value basis.** No source names one for a budget, which is not a document of value (DM-8; domain-model section 5), so either decision needs only approve on its record type, and no approval limit applies (access-and-approvals 9.3). The approval has no value limit (`DEC-142`; RR-548).
  - **Versions** are frozen when prepared and dated by instants, as user versions are (access-and-approvals 9.5): Awaiting approval through both steps, with no dates; the approval starts it at the decision's instant and ends the version in force there; approved versions never overlap (code-house-rules 7.3). A version prepared while another waits, at either step, supersedes it: its open request is Superseded and can no longer be decided (access-and-approvals 9.6), and its row keeps Awaiting approval. A new version names the newest one's identifier as its version token (code-house-rules 12.7; `kernel.stale-version`). The version in force stays in force until the new one is approved, and every version keeps its history.
  - **Remaining** is read at the instant asked: the approved version in force, less what approved bookings of the brand and season reserve, the sum of the budget's reservations, each written by a booking's approval (3.9; `S2-F01-T03`); with no approved version it is not approved, never zero (`PRD-MOD-015`). `booking`'s interface answers it for a brand and season (`remainingOpenToBuy`), for the booking's approval to check and reserve.
  - **The policy gate.** A budget is no value of policy 5 (`DEC-142`; RR-549): its own check and approval are its control, so `booking` registers no validity check for budgets, and approving a new version leaves policy 5's validation as it is. Preparing, checking and approving a budget are not policy-gated (DEC-116; 10.5). As built in `S2-F01-T02` the budgets were reported as policy 5's values (`booking.open-to-buy-budgets`); that check is removed. No other module reports a value of policy 5 yet, so policy 5 cannot be validated (`configuration.no-values-to-validate`; RR-480) until a module reports its values; which of policy 5's values the gate covers is settled with a booking's approval (`S2-F01-T03`; 10.5).
  - **Screen.** Booking › Open-to-buy (section 11) lists each budget the reader may see, with its brand and season, the approved amount, what is reserved and what remains, and its newest version's state and step. The list is read a page at a time by a cursor, in the order the budgets were prepared, at most `OPEN_TO_BUY_PAGE_CAP` (100, a technical cap) to a page, and Load more reads the next; budgets outside the reader's scope are left out after a page is read, so a page may hold fewer, and its cursor still moves past them (code-house-rules 12.1 "Reads"; as the stage 1 master lists). **Design choice.** A budget's drawer holds every version, its step (waiting for the check, checked and waiting for the approval), when it was checked and when it was in force, the approval panel of a version still waiting, a new version, and the budget's history. The check and the approval are decided from My work.

### 3.4 Lifecycle and approval

- States, from `POL-05.01`: **Draft** (editable), **Approved** (internal authorisation), **Issued** (sent to the supplier), **Confirmed** (the supplier accepted that version).
- **Submit and approve.** Booking submits the Draft; an approval request binds to that exact version (module-map 6.2 flow A). An approver, a different person from the preparer, whose booking limit covers the booking's value, approves or rejects with a reason (`POL-02.07`, `POL-02.09`). In one transaction the approval checks open-to-buy and reserves it, fixes the Agreement version, gives the number and makes the booking Approved. A rejection returns it to Draft.
- **Issued and Confirmed** are recorded by Booking, with the date, because nothing is sent from the app before stage 5 (`DEC-099`). Confirmed attaches the supplier's confirmation as a stored file. **First version, for the product owner's approval:** the line-by-line comparison of the supplier's confirmation with the booking (`PRD-BKG-010`) needs the confirmation's lines, which the first version does not capture; it follows with the AI reading of documents (RR-546). Until then a difference the supplier states is entered as a change to the booking (3.5).
- A booking is **received against** only once it is Approved, Issued or Confirmed.

### 3.5 Changes and cancellation

- A Draft is edited freely.
- After approval, any change is a new version that needs approval again before it takes effect, and it takes the Agreement version then in force (`POL-05.03`, `POL-05.10`, `PRD-ACS-007`, `DEC-132`). After issue, record the supplier's communication with the change (`POL-05.04`).
- Cancelling the undelivered balance of a line or of the whole booking is proposed by Booking and approved by a different authorised person (`POL-05.07`, `POL-05.10`). Cancellation never erases quantities already received (`PRD-BKG-013`, `POL-05.04`).
- Extending the delivery window follows the same approval (`POL-05.07`).

### 3.6 Quantities

For each line, kept apart from the invoice discrepancies of section 4 (`PRD-BKG-005`):

- **Ordered:** the quantity of the approved version.
- **Delivered:** the counted quantity of the GRN lines linked to it, in any condition, taken from those links and never typed (`PRD-BKG-006`). Excess or wrong goods recorded as not received are not delivered.
- **Cancelled:** the approved cancellations.
- **Outstanding:** ordered less delivered less cancelled, never below zero. Delivered beyond ordered is shown as over-delivered.

Example (`PRD-BKG-005`): sizes S, M and L booked at 10 each; deliveries of 5, 3 and 2 a size leave 15, 6 and 0 outstanding.

### 3.7 Receiving against a booking

- The Arrival names a booking when the goods come against one ("Receive against booking"), or none ("Goods arrived"), in the same guided workflow (`PRD-REC-002`, section 4).
- **At GRN issue** each counted GRN line links to the one line of that booking whose style code matches, and whose colour and size match where the booking line gives them. Text is compared ignoring case and spaces at the ends. Any other line goes to Booking for review (`PRD-BKG-007`, `DEC-130`). **Design choice** for the comparison.
- A GRN at a Site that is not the booking's destination goes to Booking for review. **Design choice.**
- **Later linking.** Booking may link a GRN line received without a booking, or one sent for review, to a booking line afterwards (`PRD-BKG-008`). The link is a dated record with who made it; it never changes the GRN.
- One booking can be delivered over several Arrivals; each partial delivery lowers outstanding, and a shortage stays visible (`POL-05.05`).

### 3.8 Late deliveries

- When a line's delivery date or the booking's window passes with quantity outstanding, the balance is marked overdue and a follow-up exception reaches Booking in My work (`PRD-BKG-009`, `POL-05.06`, `DEC-099`). Expiry never cancels the balance.
- Booking then extends the window or cancels the balance, each with its approval (3.5).
- The transporter and lorry receipt are recorded on the Arrival (section 4), not on the booking.

### 3.9 As built for recording and approving a booking (`S2-F01-T03`)

**Design choice** throughout; none sets a business value. Tested in `apps/server/test/bookings.int.test.ts` (the parts of test 4 of section 12 that this piece reaches: approval reserves, open-to-buy short or missing refused, the Agreement version fixed, no Agreement refused; with two approvals at once, the number series, the preparer and the approver's limit), the form's pure rules in `apps/web/src/booking/lines.test.ts`, and Booking's journey in `apps/web/e2e/booking.spec.ts`.

- **Records** (`booking`, migration `booking__bookings`; 10.1). A booking is a document (code-house-rules 7.2): a header, `booking.booking`, naming its brand and its destination, fixed when it is created, and versions holding its payload. Every save of a Draft writes the booking's next version, `booking_version`, with its lines, `booking_line`, each frozen when written, so no version ever changes; the newest is the Draft, and submitting binds the approval request to it. Each change, a version saved, documents attached, a submission, an approval or a rejection, writes the booking's next change row, `booking_change`, numbered under the booking's lock; its newest row is the booking's version token (code-house-rules 12.7), and its kind gives the state: Draft after a save, documents or a rejection, Awaiting approval after a submission, Approved after an approval. Nothing stores the state. The approval of a version is a row of its own, `booking_approval`, with the Agreement version it fixed and the value it reserved; the number is `booking_number`, given once; the reservation is `open_to_buy_reservation`. Every row is append-only. Every reference inside the schema has a foreign key, and every foreign key and scope column an index (code-house-rules 3.2, 3.3).
- **Destination and scope.** The destination is one Site, a Store's or a warehouse's: several Stores may trade at one Site (`PRD-ORG-021`) and the business unit is chosen when the goods arrive (3.1), so a booking names no Store, no unit and no legal entity. Its rows are scoped by the Site and the brand under `booking.booking` (view, create, edit, approve; place and brand; access-and-approvals 5.3), so a person whose place scope covers the Site and whose brand scope covers the brand sees it; a person scoped to a Store or a unit alone does not (structure-and-masters 3.9). The reservations belong to the budget, unscoped as the budgets are (3.3 "As built"), so whoever reads a budget's remaining amount reads every reservation of it. Create records a booking; edit saves its next Draft, attaches its documents and submits it; approve decides it.
- **Brand and destination stay** for the booking's life: a Draft for another brand or destination is another booking. The supplier, the season, the window and the lines change by the next Draft.
- **The Draft's content** (3.1), checked at each save on its date, today: the brand in force (`booking.brand-not-in-force`); the destination a Site in force, when the booking is recorded (`booking.site-not-in-force`); the season an approved value in force today of the attribute marked as the season at the command's start, kept with that marking's version (`booking.season-not-in-vocabulary`; with none marked, `merchandise.attribute-not-marked`, naming the setting; RR-550); the supplier linked to the brand today (`booking.supplier-not-linked`; `PRD-MER-021`, through `merchandise` · parties' `brandSupplierLinkedOn`); a window ending on or after its start. A line keeps its style code, and its colour and size where given, each as written, so a GRN line is matched against them, ignoring case and spaces at the ends (3.7); the size is text as the document writes it, not a value of the size list, and a missing one stays missing (`PRD-MER-005`). A Draft may hold no line yet.
- **The totals** (`PRD-BKG-003`) are the pieces, the indicative cost value and the MRP value of the booking and of each style, a style being its style code compared ignoring case and spaces at the ends, named as first written; exact, whole paise times whole pieces (`bookingTotals`, the booking entry point `@apparel-os/calculations/booking` of `packages/calculations`, shared by the server and the screen; shared-calculations 2.1, 2.2). The booking's value at cost is its cost total (DM-8).
- **Documents.** Each booking document, a photo or PDF stored first through `files-imports`, is attached to the booking, apart from its versions, as the evidence kind `booking.booking-document`, each stored file once; documents are attached only to a Draft. Attaching is a change of the booking: it names the version token read and is refused `kernel.stale-version` on another (code-house-rules 12.7).
- **Submit** (3.4) locks the booking, rechecks its token, and is refused while the booking is not a Draft (`booking.not-draft`), has no document (`booking.no-document`) or its newest version no line (`booking.no-lines`). It requests the approval, `booking.booking.approve`, bound to the newest version, on its value at cost, with the booking's Site and brand as its facts. Its preparers are everyone who saved a version, attached documents or submitted since the booking's last approval: the content is theirs, so whoever made a rejected version stays a preparer of the next one built on it (access-and-approvals 9.1; GC3-1). A version rejected may be submitted again unchanged, as a new request.
- **The approval** is a decision effect of `access` (access-and-approvals 9.8b), which has already refused the preparers and checked the approver's booking limit on the value at cost (9.3; `access.above-approval-limit`, `access.no-approval-limit`). Decide takes, with the request at step 1, the booking's identity row and the budget of its brand and season (code-house-rules 8.2), so two approvals never reserve the same remainder; a budget made after Decide chose its locks makes the decision stale, tried again. Under the locks, in this order: the version still the one submitted (`booking.version-not-awaiting`); the policy gate (10.5 "As built"); the supplier still linked to the brand on the approval's date, the booking's date (`booking.supplier-not-linked`); an approved budget for the brand and season (`booking.open-to-buy-missing`) whose remainder covers the value at cost (`booking.open-to-buy-short`, naming the brand and season by identifier, as a refusal names only identifiers and codes, code-house-rules 12.3: the screen shows the amounts from its reads, the booking's value at cost from the booking and what is left from the open-to-buy read with it, and by how much it is short); the brand's Agreement version in force on the approval's date (`booking.no-agreement-in-force`, naming the brand); at the booking's first approval, an Open booking series (`booking.no-booking-series`, `booking.booking-series-paused`), locked at step 8. Then the number, the approval row with the Agreement version, the reservation of the value at cost, the change row, the audit record and `booking.booking-approved` are written in the decision's transaction, or none of them is.
- **A rejection** writes the change row and its audit record: the booking is a Draft again; the version rejected stays as it was, its request Rejected.
- **The terms** shown are the brand's Agreement version in force today while the booking is not approved, or none, and once approved the version its approval fixed (3.2; `termsOfVersion` of `merchandise` · parties). Margins are not shown on a booking: they stay behind their field class on the Agreement itself (access-and-approvals 6).
- **The booking number** comes from one series for the Organisation, not restarted each financial year, whose years are not set (GC5-1), as the GRN's (4.8); its format is the Organisation's, set by an operator until a screen exists (RR-449). The tests and the server of the browser journeys define the series with a format labelled SYNTHETIC, `SYN-BKG-` and five digits (`DEC-118`). The local seed does not define it: `DEC-143` lets the seed add only the GRN series to a finished synthetic Organisation, so `dev` approves no booking until the product owner decides (RR-564). A Draft's internal reference is its identifier, shown as `Draft` and the identifier's last eight characters in capitals (the catalogue's `booking.reference.draft`), which are random in a UUIDv7, as an error's reference is (code-house-rules 12.3).
- **The list** (section 11) reads the bookings the reader may see, newest first, a page of at most 100 at a time by a cursor (`BOOKING_PAGE_CAP`, a technical cap; code-house-rules 12.1), filtered by state, brand, season, supplier and destination, each with its newest version's header and totals.
- **Input caps.** Technical caps, the builders' choice and no business limit, named `BOOKING_CAPS` in `packages/schemas`: at most 10,000 lines a version, the scale of a PT file (12 test 21), so a booking by style, colour and size fits; 1,000,000 pieces a line; and 60 characters for a style code, a colour or a size; totals at cost and at MRP must fit whole paise a safe integer holds. The lines of a version are written 1,000 to a statement, within the parameters PostgreSQL binds to one. A route that saves a Draft takes a body of at most 8 MiB (`BOOKING_DRAFT_BODY_LIMIT_BYTES`), so a Draft at every cap fits, its texts in a script of up to three bytes a character. Past one, the request is refused as invalid (code-house-rules 12.2).
- **Screens** (section 11): Booking › Bookings, for whoever holds view on `booking.booking`; a booking opens in the screen with its documents, the terms read-only, the remaining open-to-buy of its brand and season, its lines and totals, its versions and, while it awaits approval, its approval panel. The booking form enters the header, one style's lines at once through the size-colour grid (colours and sizes as the document writes them, separated by commas; one cost and MRP for the style, which each line then changes), and lines one by one, with the totals shown as typed. Saving, attaching a document and submitting name the version the screen shows, so each waits, disabled with its reason, while the booking is read again after a change. The approval panel in My work shows the booking's header, its totals by style, its documents count, the remaining open-to-buy with the booking's value at cost beside it and any shortfall, and the terms. Booking (P-BKG) has Booking › Bookings in the menu.

## 4. Arrival, count and GRN

The Arrival, the count and the GRN live in `receiving` (module-map section 5). Everything here is entered by hand (`DEC-136`). The GRN records what was physically counted at the Site where the goods are; it holds quantities, never values (`PRD-REC-008`, grill round 1).

### 4.1 The Receive Goods inbox

- One inbox per Site, with Pending and History views (`PRD-REC-001`). In the first version it holds supplier deliveries; incoming transfers join it in stage 3.
- "Goods arrived" and "Receive against booking" open the same guided workflow: Arrival, count, GRN (`PRD-REC-002`). Against a booking, the booking's open lines are shown as the expected goods.
- Pending shows Arrivals not yet issued as a GRN, GRNs with held lines not yet decided, and GRNs waiting for their PT or its scan-in. History shows the rest.
- Receiving is available at a business unit only after its receiving readiness is approved (`PRD-LIF-001`, `PRD-LIF-002`), with its mapping to a tax registration verified (`POL-10.08`); otherwise the inbox names what is missing.

### 4.2 Recording the Arrival

The receiver, Warehouse (P-WHS) at a warehouse or the Store's staff (P-STM) at a Store, records:

| Field | Rule |
| --- | --- |
| Site and business unit | Where the goods physically are, even when another Site later prepares the PT (`PRD-REC-004`) |
| Booking | Optional; one booking of the same supplier and brand (section 3.7) |
| Supplier and brand | Required; the supplier linked to the brand (`PRD-MER-021`) |
| Invoices | At least one before the count starts, each with its number and date and the uploaded file (`DEC-133`). Several invoices may come on one delivery; they still make one Arrival and one GRN. An invoice number the same supplier already used on another Arrival is shown as a possible duplicate, which the receiver confirms or corrects. **Design choice** |
| Transporter; lorry receipt number and date | Required |
| Vehicle number; e-way bill number | Optional (grill round 7) |
| Number of cartons | Required |
| Photos | Cartons, seals and any damage, as stored files (`PRD-REC-007`) |
| Arrival time | When the goods arrived; the recording time is kept apart (`PRD-MOD-009`) |

### 4.3 The count

- By hand, against the invoice (grill notes, 19 Oct 2026). Several people may count; the process is the same whatever the size of the delivery. The GRN names who counted and who entered it, from their sign-ins.
- The count is saved as it goes and can be resumed; nothing reaches stock until the GRN is issued.
- **One line per style, colour and size**, as the invoice lists the goods:

| Field | Rule |
| --- | --- |
| Style code | As the invoice writes it |
| Colour | As the invoice names it; none when it names none (`DEC-138`). ECONOMY, MEDIUM and PREMIUM are never used on the GRN |
| Size | A value of the attribute the Organisation marks as its size list, the one matching the invoice's size, so that the PT file can be matched (section 5; structure-and-masters 4.2 "As built"; RR-556). A missing size stays missing (`PRD-MER-005`). **Design choice** |
| Product | The SKU when the style, colour and size name a product already set up; otherwise left empty, and the PT approval sets it up (section 6) |
| Invoice quantity | As the invoice states it |
| Counted quantity | Whole pieces, as counted |
| Batch and expiry | Only for a product whose tracking profile requires them; missing values block the GRN (`PRD-MER-011`) |

- Every product is tracked by quantity in the first version (`DEC-137`).

### 4.4 What the count finds

Kept apart on each line; they can coexist (`PRD-REC-006`):

| Finding | Meaning | At the count |
| --- | --- | --- |
| Shortage | Counted less than the invoice quantity | The missing quantity is recorded; nothing is held, since absent goods are not in custody |
| Excess | Counted more than the invoice quantity | The receiver records the extra pieces as received, kept under an excess hold, or as not received |
| Wrong | A known product that is not on the invoice | Received, kept in quarantine as wrong, or not received |
| Unidentified | Goods not on the invoice that match no product | Received, kept in quarantine with their identity Unknown, or not received |
| Damage | Damaged pieces, whatever else the line shows | A damage report at once, with photos; the pieces go under a damage hold before anyone confirms it (`PRD-DMG-001`, section 8) |

- "Not received" means the goods are not kept at the Site: no custody is created, and the finding stays on the GRN as a record (grill notes, 19 Oct 2026).
- Damage never lowers the counted quantity. A missing PT alone never makes goods wrong (`PRD-REC-012`).
- A line for a product not yet set up, but on the invoice, is an ordinary line, not unidentified.

### 4.5 Issuing the GRN

- The receiver issues the GRN once every line has its counted quantity. No approval is needed (grill round 7). The GRN takes its number from its own number series.
- **In one transaction** (module-map 6.1), or nothing:
  - `receiving` freezes the GRN with its lines, findings, documents and photos;
  - `stock` · ledger records a receipt count for each line's received pieces, into a location of the unit chosen for receiving (for example a receiving zone the Site sets up; structure-and-masters 3.5), in good condition, cost Unknown and not accepted; the owner on each receipt origin follows the brand's Agreement version (the booking's when the line is linked, otherwise the one in force on the arrival date; `PRD-ORG-014`), by its ownership-transfer event (`DEC-141`, `POL-01.05`): at the supplier's dispatch, the Organisation, as the receiving unit's legal entity; at the sale to the customer, the brand; at receipt and acceptance, the brand at the count, ownership passing to the Organisation at the scan-in at the receiving Site, which is the acceptance (section 7; `S2-F07-T01` records that change); another event described in words, or none recorded, Unknown until recorded;
  - the excess hold, the quarantine and the damage holds are placed on the pieces they cover (stock-ledger 6.1), in the same ledger request as the receipt counts, on the origins they make (stock-ledger 13.16);
  - `stock` · documents records the damage report of each damaged line on its hold (8.5; as built in 4.9);
  - `access` asks a Booking approver for the decision of each held line (4.6);
  - `booking` links each matched line (section 3.7);
  - `exceptions` raises the follow-ups: shortage, excess, wrong and unidentified goods and unmatched lines to Booking; damage to Operations (grill notes, 19 Oct 2026);
  - `audit` and the outbox record it.
- **Goods of a product not yet set up** are counted with their identity as described (style code, colour, size) and their SKU Unknown (stock-ledger 2.2, `PRD-DMG-005`); unlike unidentified goods they are not quarantined, and PT approval gives them their SKU. Until then they take the Arrival's brand, so a person scoped to that brand sees them and may issue their GRN (RR-555, decided by the product owner on 21 Oct 2026; stock-ledger 13.14, 14.1). The stage 1 receipt count needed a known SKU (stock-ledger 13.9); the ledger is extended for this (GI-1, built in `S2-F02-T01`: stock-ledger 13.14, for the product owner's review).
- The printed GRN follows common practice ([grn-standard-fields.md](../../research/grn-standard-fields.md)): the header of 4.2 with the GRN number and date; per line the style code, colour, size, invoice and counted quantities and each finding; who counted and who entered it, with the time. It carries no price, tax or value.

### 4.6 Deciding the held lines

Every held line is decided before the PT file is uploaded (`DEC-137`):

| Held line | Decided by | Take it in | Do not take it in |
| --- | --- | --- | --- |
| Excess | A Booking approver, a different person from the receiver (`PRD-REC-013`) | The pieces join the good pieces the PT covers; the excess hold is released through the PT route | They stay under the excess hold until a supplier return (stage 3) |
| Wrong | A Booking approver named for the Site and brand (`POL-17.02`, `POL-17.11`) | The product is confirmed; the pieces return to good condition through the identity route and join the PT | They stay in quarantine until a supplier return (stage 3) |
| Unidentified | As wrong goods | Booking names the product first; then as wrong goods | As wrong goods |
| Damage | A different authorised person (section 8) | Rejected report: the pieces are good and join the PT | Confirmed: the pieces stay held and take no PT |

- Each decision keeps the original finding (`PRD-REC-013`) and is recorded with who decided, when and why.
- Accepting goods that are also damaged never clears their damage hold (`PRD-DMG-010`).

### 4.7 Correcting a GRN

- A GRN is never edited. A miscount is corrected by a linked recount of the lines concerned, which a different person approves (grill notes, 19 Oct 2026; `PRD-REC-019`). It adds or reverses receipt counts for the difference and keeps the original count.
- A recount is possible until the GRN's PT is uploaded. After that, the PT is reversed first (section 6), which is possible only before the scan-in (`DEC-137`). **Design choice.**

### 4.8 As built for the inbox, the Arrival, the count and a clean GRN (`S2-F02-T02`)

**Design choice** throughout; none sets a business value. Tested in `apps/server/test/receiving.int.test.ts` (tests 3, 18 and 19 of section 12, the custody of a clean GRN equal to its count in test 1, and the Store-scoped reader of test 20), the pure rules in `apps/server/src/modules/receiving/domain/*.test.ts`, and the receiver's journey in `apps/web/e2e/receive-goods.spec.ts`.

- **Records** (`receiving`, migration `receiving__arrivals_counts_and_grns`; 10.1). Every table is scoped by the place, the legal entity of the unit's mapping and the Arrival's brand (code-house-rules 6.1), each under `receiving.arrival`: the GRN and its lines are read with the Arrival they were issued from. Every row is append-only. Every reference inside the schema has a foreign key, a count line's to its first entry and a GRN's to the Arrival version it froze included, and every foreign key and scope column an index (code-house-rules 3.2, 3.3). The Arrival keeps the mapping version in force when it was recorded (`PRD-MOD-010`) and its arrival date, the business date of its arrival time, on which the brand's Agreement and the supplier link are read. `receiving` reads the masters of `organisation` and `merchandise` through their read functions, as `site-lifecycle` does, and is handed only the services it acts through.
- **Permissions.** Create on `receiving.arrival` records an Arrival; edit records its invoices and photos and saves its count; view reads it with its GRN; create on `receiving.grn` issues the GRN, and view on it reads the GRN's history. Both carry every scope fact, so each route authorises in its command with the record's facts, and a reader scoped to one Store sees only that Store's receipts (test 20). Writing the receipt counts needs view on the stock record types too, since the ledger's rows are scoped (stock-ledger 14.3).
- **The gate** (4.1, 10.5). Recording an Arrival and issuing its GRN are refused, `configuration.operation-unavailable`, naming every thing missing, unless Available answers yes at the unit for both receiving operations (10.5 "As built") and the unit's mapping in force today is verified (`POL-10.08`). The inbox shows the same answer for each unit of the Site. Recording invoices, photos and count lines is not gated: it records no business effect (DEC-116).
- **The Arrival** (4.2) is recorded at a unit in force at its Site, into a location of that unit in force and not retired, which the receiver chooses as the receiving location; the brand in force and the supplier linked to it on the arrival date (`PRD-MER-021`, read through `merchandise` · parties' `brandSupplierLinkedOn`), and an arrival time no later than now. Its details are fixed when recorded.
- **Invoices first** (`DEC-133`). The count is refused, `receiving.invoice-required`, while the Arrival holds no invoice, and so is the GRN. Each invoice keeps its number, date and file, attached to the Arrival through `files-imports`. A number is compared ignoring case and spaces at the ends: the same number twice on one Arrival is refused; one the same supplier used on another Arrival is refused as a possible duplicate, naming the other Arrivals the receiver may see and saying only that others exist when some are hidden from them (a narrowly authorised function, `receiving.invoice_number_used`, as code-house-rules 6.2 allows), until the receiver confirms it; the invoice then keeps the Arrivals it was confirmed against.
- **The count** (4.3). A line is the chain of its saved entries; each save names the newest entry it replaces, once, so two people saving over one version never both succeed (`kernel.stale-version`); a removal is an entry too. The size is named by its value alone, an approved value in force today of the attribute marked as the Organisation's size list at the command's start (`receiving.size-not-on-list`, naming that attribute and the value; structure-and-masters 4.2 "As built"; RR-556, GI-3), and kept with its attribute, the version of the marking it was read under (code-house-rules 7.3) and its code, the text the PT file is matched on (5.4). While no attribute is marked as the size list, every count line is refused, a line without a size too, `merchandise.attribute-not-marked`, naming the setting `merchandise.size-attribute` (code-house-rules 12.14); a change of the marking leaves the lines already saved as they were. **One line per style, colour and size**: a line for a style code, colour and size another line of the Arrival counts already is refused, `receiving.line-repeated`, naming that line, the one to change; style codes and colours compare ignoring case and spaces at the ends, and a missing colour or size matches only another missing one (`PRD-MER-005`). A product named for a line must be in force at the Site, of the Arrival's brand and of the line's style code; batch and expiry are checked against its tracking profile when the GRN is issued: missing where the profile requires them, `receiving.batch-required`; given for a product whose profile does not track them, or for a line with no product, `receiving.batch-not-tracked`. **Who counted** a line is everyone who saved an entry of it, and **who entered** the GRN the person who issued it, each from their sign-in; the Arrival's read gives their names.
- **The version token** of an Arrival is its newest change, numbered under its lock (`receiving.arrival_change`), which issuing the GRN names (code-house-rules 12.7).
- **Issuing the GRN** (4.5, 10.3) locks the Arrival at step 1, rechecks its token, the gate and the count under the lock, then posts one receipt count per line, by its SKU or with its identity as described (stock-ledger 13.14), into the receiving location in good condition, through `receiving`'s registration as a stock caller (stock-ledger 13.2 "As built"); locks the GRN series at step 8 and takes its number; writes the GRN with its lines as the count stood, the audit record and `receiving.grn-issued` (identifiers only; 10.4). The findings of 4.4, their holds and the held lines are as built in 4.9 (`S2-F02-T03`); the refusal of this first piece, a line whose counted quantity differs from its invoice quantity (`receiving.line-differs-from-invoice`), is removed. A line of a product not yet set up is counted under the Arrival's brand (stock-ledger 13.14), so its receipt origin, balances and movement are of that brand and a person scoped to the brand alone issues the GRN and sees its goods, as for a line of a known product (RR-555).
- **The owner** each receipt origin records (`PRD-ORG-014`, `POL-01.05`, `DEC-141`): from the brand's Agreement version in force on the arrival date, by its ownership-transfer event (`receiving` `domain/owner.ts`). Ownership passed at the supplier's dispatch: the Organisation, as the receiving unit's legal entity; passing at the sale to the customer: the brand the Agreement is with; passing at receipt and acceptance: the brand the Agreement is with, at the count, since the acceptance is the scan-in at the receiving Site (section 7), which records the change to the Organisation (`S2-F07-T01`). With no Agreement in force, no event recorded, or another event described in words, the owner is Unknown until recorded, never guessed (`PRD-MOD-015`). The GRN keeps the owner and the Agreement version.
- **The inbox** (4.1). Pending lists every Arrival of the Site the reader may see, newest recorded first, a page of at most 100 at a time by a cursor (code-house-rules 12.1), with what it waits for: its invoice, its count, its GRN, or, once issued, the decisions of its held lines and of the damage reported on its lines (4.9), then its PT. Since every GRN waits for its PT until the PT upload is built (`S2-F04-T02`), History holds none yet.
- **The GRN number** comes from one series for the Organisation, not restarted each financial year, whose years are not set (GC5-1); its format is the Organisation's, set by an operator until a screen exists (RR-449). The tests, the server of the browser journeys and the local seed, which sets up `dev`'s Organisations, define the series with a format labelled SYNTHETIC, `SYN-GRN-` and five digits (`DEC-118`); the seed defines it for each of its Organisations that has none, a finished one included, so a GRN can be numbered on `dev` once receiving is available there (RR-558). **Design choice.**
- **Input caps.** What a receiver enters is bounded by technical caps, the builders' choice and no business limit (no rule of the PRD or the policies sets one), named `RECEIVING_CAPS` in `packages/schemas`: at most 1,000,000 pieces on a line, invoiced or counted, so a quantity fits the whole-number column with room to add lines up; at most 100,000 cartons on an Arrival; text of at most 30 characters for a vehicle or e-way bill number, 60 for a lorry receipt or invoice number, a style code, a colour or a batch code, and 200 for the transporter. Past one, the request is refused as invalid (code-house-rules 12.2). **Design choice.**
- **Times and names on the screens.** The arrival time is typed as the Organisation's wall clock, whatever the device's, and every date and time is shown as design-language 8 sets (code-house-rules 9). A person, unit, location, supplier or brand the reader cannot name is Unknown, a blank cell in a table, never an identifier (`PRD-MOD-015`).
- **Screens** (section 11): Receive Goods › Inbox, for whoever holds view on `receiving.arrival`; the Arrival opens in the screen with its invoices, photos, count and GRN, printed with quantities only. "Receive against booking" joins it with `S2-F02-T04`. A line names its product from the products of the Arrival's brand with the line's style code, when one is set up, and asks for its batch and expiry where the product's tracking profile at the Site requires them. Issuing the GRN, and changing or removing a line, name the version the screen shows, so each waits, disabled with its reason, while the Arrival is read again after a change saved there, and is never sent with the version that change replaced (code-house-rules 12.7; code review 3 of stage 2). Journeys: Warehouse (P-WHS) and a Store's staff (P-STM), each refused once with the reason shown (code-house-rules 10.1).

### 4.9 As built for the findings at the count and the held lines (`S2-F02-T03`)

**Design choice** throughout; none sets a business value. Tested in `apps/server/test/receiving-findings.int.test.ts` (test 1 of section 12 and the holding part of test 2; the held-line decisions; the policy gate; what the PT reads; the receipt problems read model), the ledger's part in `apps/server/test/stock-ledger-held-receipts.int.test.ts` (stock-ledger 13.16), the findings rule and the draft's pairing in `packages/schemas/src/receiving.test.ts`, and the journey in `apps/web/e2e/held-lines.spec.ts`.

- **What a line counts** (4.3, 4.4). A count line says which goods it counts: goods **on the invoice**, of a product set up or not yet set up (a missing PT alone never makes goods wrong, `PRD-REC-012`); **wrong goods**, a product already set up that the invoice does not list, which the line names, of the Arrival's brand and the line's style code as any line's product is (4.8); or **unidentified goods**, not on the invoice and matching no product, which carry no style code, colour, size, product or batch, only what they look like, a text the receiver writes so Booking can name them (at most 200 characters, `RECEIVING_CAPS.longText`). Goods on the invoice have pieces on it; goods not on it have none on it and some counted. One line per style, colour and size (4.8) does not reach unidentified goods, which have none, so each such line stands on its own.
- **The findings** (4.4; `PRD-REC-006`), worked out by `lineFindings` in `packages/schemas`, shared by the server and the count screen, never stored apart from what the line records: the **shortage**, invoice less counted where positive, never held; the **extra pieces**, counted beyond the invoice, or every piece of goods not on it; the pieces **received**, counted less the extra pieces not received; the **held part**, the extra pieces when received, as excess for goods on the invoice, or as wrong or unidentified goods; and the pieces found **damaged**, which never lower the counted quantity. The receiver records the extra pieces as received and held, or not received, exactly when a line has some (`receiving.extra-not-recorded` refuses the GRN for a line saved before this was asked); damage as its pieces, what is wrong (at most 500 characters, `DAMAGE_CAPS`) and at most one photo, stored first and attached to the damage report when the GRN is issued.
- **Damage at the count is of pieces on the invoice, counted**: at most the lesser of the line's invoice and counted quantities, and never on wrong or unidentified goods. A confirmation takes free units of the goods in good condition (stock-ledger 13.15), so damage claimed on excess pieces could not be confirmed while their excess hold stands, which ends only by the PT route; and the ledger turns goods damaged only from good condition (stock-ledger 2.3), so goods held wrong or unidentified could not be. **Design choice**; whether damage on wrong or unidentified goods at the count needs a route of its own is GI-5.
- **Records** (migration `receiving__findings_and_held_lines`, 0096). The count's entries and the GRN's lines keep what the line counts (`goods`), what unidentified goods look like, what happens to the extra pieces (`extra`) and the damage; a GRN line names the damage report the count raised. A **held line** (`held_line`) is the held part of a GRN line, one a line, with its kind, its pieces, the receipt origin its count made and its hold (the ledger's records, no foreign key); its **versions** (`held_line_version`) are what its decision binds to (`PRD-ACS-007`), the first as issued and each later one naming the product of unidentified goods; its **decision** (`held_line_decision`), taken in or left held, is made once. Every row is append-only, scoped by the Arrival's facts under `receiving.arrival`, so whoever sees an Arrival sees its held lines and how each was decided; the held line's identity row is locked at step 1 by every change of it. Rows written before 0096 are lines of goods on the invoice, which S2-F02-T02 issued only when counted equalled invoiced.
- **Issuing the GRN** (4.5, 10.3), in one transaction, in this order (stock-ledger 10.3): the Arrival at step 1, its version, the gate and the count read again under the lock; before any lock above step 1, damage reports available at the unit and their series, when the count holds damage (`stock` · documents' `countDamageReady`, 8.5), and the exception-code series, when a finding raises a follow-up; **one ledger request** (stock-ledger 13.1) with each line's receipt count of its received pieces, naming the origin it makes, goods on the invoice in good condition, wrong goods in the wrong condition, unidentified goods with no identity in the unidentified condition, all under the Arrival's brand where no SKU names them (RR-555), then on those origins the excess holds, the quarantines and the damage holds (stock-ledger 13.16); the GRN, damage-report and exception-code series held at step 8 in one call with the request's periods; the GRN numbered; each damaged line's report recorded on its hold (`recordCountDamage`, 8.5); the GRN's lines; each held line, its first version and its decision's request; the follow-ups; the audit record and `receiving.grn-issued`. Goods not received create no custody and a line with none received makes no receipt count; a GRN with nothing received at all makes no ledger request.
- **Who reports the count's damage.** Whoever issues the GRN reports it, so the route holds create on `stock.damage_report` at step 0 beside create on `receiving.grn` while the count holds damage (8.5 "Permissions"), and the report's decision is made by someone else (`PRD-DMG-002`).
- **The follow-ups** (2, 4.5; access-and-approvals 12.1; `PRD-EXC-001`, `POL-02.16`). Four exception types of `receiving`: `receiving.shortage` (category shortage), one a GRN with any shortage, linking to the GRN; and one a held line, linking to it, `receiving.excess` (category excess), `receiving.wrong-goods` and `receiving.unidentified-goods` (category mismatch). Their owner is whoever the routing of the type at the Site names, Booking (P-BKG) by the grill's routing (2), set like any routing (12.2); their exposure is Unknown, the goods' cost before their PT (`PRD-DMG-005`). A held line's follow-up closes once its decision is made (its resolution check, `PRD-EXC-002`). A shortage's closes when its owner resolves it, since nothing in the app settles a shortage before supplier invoices are matched in stage 5 (`DEC-137`): **Design choice**, GI-6. Receiving's gate does not check the routing, since a clean GRN raises none: a GRN whose findings raise a follow-up without its routing at the Site is refused, `exceptions.no-routing`, naming the type and the Site.
- **Deciding a held line** (4.6; `PRD-REC-013`, `POL-17.02`, `POL-17.11`). Through `access`'s approval route, as My work makes it (access-and-approvals 9.5, 9.8b): the action type `receiving.held_line.decision` on approve of `receiving.held_line`, whose scope names the Booking approvers by Site and brand (`POL-17.11`); none of its preparers decides it, everyone who counted the GRN line and whoever issued the GRN, and whoever named the product of the version decided (`PRD-ACS-006`, `POL-02.07`); on the goods' cost, Unknown before their PT, so the approver needs explicit authority over Unknown value (`PRD-ACS-016`; DM-8). **Approve takes the goods in; reject leaves them held** until a supplier return (stage 3), each with its listed reason, the decision row, its audit record and `receiving.held-line-decided`. The gate is asked first for either outcome (10.5 "As built"). Either keeps the original finding: the GRN line is never changed. **Taking goods in releases no hold**: wrong and unidentified goods stay held until the PT route is complete (`POL-17.02`, `PRD-REC-012`), so PT approval ends the excess hold by the PT route and the quarantine by the approved decision, with the identity step that returns the goods to good (6.3 steps 4 and 5; stock-ledger 13.14). A decided held line is refused another decision (`receiving.held-line-decided`).
- **Naming the product of unidentified goods** (4.6). Booking names it before they can be taken in: approving a version that names none is refused, `receiving.product-not-named`. Naming needs edit on `receiving.held_line` and the held line's latest version (`kernel.stale-version`), and gives a style code, a colour, a size from the size list (4.8) and the product where one is set up, of the Arrival's brand and that style code (`receiving.sku-not-of-line`); it is refused for a held line decided already or not of unidentified goods (`receiving.not-unidentified`). It writes the held line's next version and asks its decision again, the earlier request Superseded (access-and-approvals 9.6). Whoever names it is a preparer of that version, so a different Booking approver takes the goods in. Naming records no business effect, so asks no gate (DEC-116). **Design choice**, for the product owner to confirm: the PRD and policies name the namer and the approver as Booking and a Booking approver without saying they differ.
- **Permissions.** `receiving.held_line`: edit names a product, approve decides; it declares no view, since a held line is read with its Arrival, under view on `receiving.arrival`, which a Booking approver holds for the Site and brand too. **Design choice.**
- **What other modules read.** `receiving`'s interface answers, under the reader's actor: `ptBasis`, what `merchandise` · PT reads of a GRN before its PT (5.1, 5.4): the held lines and the damage reports on its lines still waiting for their decision, the reports' states read through `stock` · documents' narrowly authorised `damage_of_grn_lines` (migration `stock.documents__damage_of_grn_lines`, 0097; DEC-117), so the answer does not depend on whether the uploader sees the reports; and the good pieces per style and size, compared ignoring case and spaces at the ends: those received, less pieces under a confirmed damage report, less held pieces not taken in, unidentified goods taken in under the style and size Booking named, each part with the receipt origin it is on and the hold the PT route ends; and `receiptProblems`, the receipt problems read model of 9.3: every GRN line with a shortage, extra pieces or damage at the count, newest first, a page of at most 100 (`RECEIPT_PROBLEMS_PAGE_CAP`, a technical cap; code-house-rules 12.1) by a cursor, filtered by Site, supplier, brand and dates, each with its findings, its held part and decision, who decided it and when, and its damage report. Damage reported on a line after its GRN is the damage report's own record (8.5). The report's route and screen come with `S2-F11-T02`.
- **Screens** (section 11). **Receive Goods › an Arrival**: the count form asks what the line counts, then for goods on the invoice their style code, colour, size, product, invoice and counted quantities, and the damaged pieces with what is wrong and one photo; for wrong goods their product too; for unidentified goods what they look like and their counted quantity; and, once counted beyond the invoice or not on it, whether the extra pieces are received and held or not received. The count table and the printed GRN show each line's findings as chips (short, excess, wrong, unidentified, damaged, not received; design-language 7 "Rules"), the GRN also the pieces received, its held line's state, Awaiting approval, then Accepted or Held, with the product named, and each count damage report with its decisions. Whoever holds edit on held lines names the product of unidentified goods there, each form naming the version shown, so waiting while the Arrival is read again (code-house-rules 12.7). **My work**: the decision's panel shows the GRN, how the goods are held, the pieces, the line as counted, the product named and who counted it (route `readHeldLine`, under view on the Arrival). Journey: Warehouse (P-WHS) counts excess, refused once with the reason shown until the extra piece is recorded, and a Booking approver (P-BKG) takes it in from My work (code-house-rules 10.1).
- **Not built here**: the booking links of 3.7 (`S2-F02-T04`); a recount (`S2-F02-T05`); the PT upload's use of `ptBasis` (`S2-F04-T02`); the PT approval's ending of the holds and its identity step (`S2-F06-T01`); the receipt problems report (`S2-F11-T02`).

## 5. The PT file upload

In the first version a PT is made only by uploading a PT file for one GRN, in the Organisation's fixed PT template (`DEC-134`). The file is made by hand, outside the app, by whoever is assigned. The upload runs through the stage 1 import pipeline of `files-imports` as a transaction batch whose target is `merchandise` · PT (imports-and-opening-data 3.1, 4.1, 13.2). The PT workbench comes later (RR-546).

### 5.1 When a file can be uploaded

- The GRN is issued, and every held line on it is decided (section 4.6, `DEC-137`).
- The GRN has no other PT, draft or official, unless that one was reversed (section 6). One PT per GRN (`DEC-137`).
- The uploader holds the permission to prepare PTs for the GRN's Site and business unit. They may work at another Site; the stock stays at the GRN's Site (`PRD-REC-014`).

### 5.2 The template

- The template is a layout version in `files-imports`, proposed and confirmed by a different person, like every layout (imports-and-opening-data 6.4). For KDPS it is its 20-column template plus the two `SUGGESTED` columns ([pt-file-layouts.md](../../data-notes/pt-file-layouts.md) 1.2; `PRD-PTW-008`). Which of its columns are required is stated by the layout version: for KDPS all 20 must be filled and the two `SUGGESTED` columns are optional (`DEC-140`).
- The header is found by its column names, on row 1 or row 2: a work tab has a subtotal row above it, a copy saved as values does not (pt-file-layouts 1.7; imports-and-opening-data 6.5).
- A row may hold one piece or several pieces of one barcode (`QTY`); both occur (pt-file-layouts 1.7).
- XLSX only in the first version (`DEC-134`). Formula cells are read by their saved values and never recalculated; no formula is taken as a rule (imports-and-opening-data 3.1 step 3, 6.7).
- The stage 1 intake checks apply. KDPS's template file links to a copy of another workbook (pt-file-layouts 1.1), which intake refuses, asking for a self-contained copy (imports-and-opening-data 9.3); the person saves the sheet as a copy with values before uploading.
- The values come from the master sheet's lists, set up once as the Organisation's approved vocabularies, each confirmed by a second person (`PRD-IMP-008`, `DEC-134`): seasons, brands, colours (with the tags ECONOMY, MEDIUM and PREMIUM), genders, sub categories, types, items, fits, sizes and GST rates, and the map from item to sub category and type ([item-master-vocabulary.md](../../data-notes/item-master-vocabulary.md)).

### 5.3 Checks on each row

| Column | Check | Kept as |
| --- | --- | --- |
| `SEASON`, `COLOR`, `GENDER`, `SUB CATEGORY`, `TYPE`, `ITEM`, `FIT` | On its list; the cell is named when not | Supplied |
| `BRAND` | On the brand list, and the GRN's brand | Supplied |
| `SIZE` | On the size list | Supplied |
| `DESIGN` | Present; the style code | Supplied |
| `BARCODE` | Present; digits, leading zeros kept (`PRD-MER-007`) | Supplied |
| `HSN` | Six or eight digits | Supplied |
| `QTY` | Whole pieces, more than zero | Supplied |
| `MRP`, `BASIC`, `P RATE` | Present, more than zero, at most two decimals, turned into paise exactly and never rounded; `P RATE` not above `MRP` (system-dumb 18.4 rule 27) | Supplied (`PRD-IMP-006`); the approver checks them (`DEC-135`) |
| `INPUT TAX`, `OUTPUT TAX` | On the GST rate list | Supplied; the approver checks them (`DEC-135`) |
| `NAG` | Equals `QTY` (`PRD-PTW-011`) | Calculated |
| `MARGIN` | Worked out as (`MRP` − `P RATE`) ÷ `MRP` × 100, rounded half-up to two decimals; the file's value, rounded the same way, must agree (`PRD-PTW-011`) | Calculated |
| `SUGGESTED SUB CATEGORY`, `SUGGESTED TYPE` | None; shown beside the row, never applied (`PRD-PTW-012`) | Supplied hint |

Every problem is listed at once in the validation report, naming the row, the column and the correction (`PRD-IMP-007`).

### 5.4 Matching the GRN

- Rows are grouped by style (`DESIGN`) and size; text is compared ignoring case and spaces at the ends. Colour is not compared (`DEC-138`).
- For each style and size, the file's `QTY` must add up to the GRN's good pieces: those received, less pieces under a confirmed damage report, less excess, wrong or unidentified pieces Booking did not take in (section 4.6).
- No style and size may appear in the file that the GRN does not have, and none of the GRN's may be missing (`PRD-REC-016`, `DEC-135`).

### 5.5 Products and barcodes

- **A row's product** is found by its barcode's external code mapping, or by brand, style, colour and size. When none exists, the upload proposes a new style and SKU from the row's values, with its barcode as an external code (structure-and-masters 4.2, 4.3); the PT approver confirms the proposal with the PT (`PRD-MER-013`, `DEC-135`).
- **A row that differs from an existing product** in a value the product holds, such as its HSN, is shown to the approver as a difference. The PT keeps the file's value; the product is changed only through its own master change. **Design choice.**
- **A barcode repeated across products** is flagged, never refused, and kept for each product; the scan-in asks which product it is (`PRD-MER-007`, `DEC-135`). The same barcode on several rows of one product is ordinary. Only a barcode recorded under a brand may repeat (RR-554; structure-and-masters 4.3), so the upload records a row's barcode under the brand of its product and resolves it with that brand. A caller that knows no brand, such as the earlier POS's reference handler, still finds it: Resolve asked without a brand reads every brand's mappings (structure-and-masters 4.3 "As built"; code review 3 of stage 2). **Design choice.**

### 5.6 The steps

1. **Upload.** The person picks the GRN and uploads the file. Intake, reading, layout and staging run as in imports-and-opening-data 3.1.
2. **Check.** Every check of 5.3 and 5.4 runs. If any fails, the upload is refused whole: nothing is created, the report lists every problem, and the person uploads a corrected file (`DEC-134`, `PRD-IMP-012`).
3. **Submit for approval.** A file that passes shows its preview: the rows, the totals, the new products, the repeated barcodes and the differences from existing products. The person submits it. In one transaction the handler creates the draft PT revision for the GRN and the approval request bound to it (imports-and-opening-data 3.1 steps 7 to 9; `PRD-REC-017`).
4. A file of 10,000 lines is checked within one minute (`PRD-PRF-001`).

### 5.7 What the draft PT holds

- The GRN it covers, its Site and business unit, the stored file, the layout version, the uploader and the time (`PRD-REC-018`).
- Every row with its supplied values, its calculated `NAG` and `MARGIN`, each value's origin (`PRD-IMP-006`), its product or product proposal, and the GRN lines of its style and size.
- Totals: pieces, the sum of `P RATE` times `QTY` (the total proposed acquisition cost the approval is judged on) and the MRP value.
- A draft is never edited: a wrong file is withdrawn and a new one uploaded. It creates no stock and no money effect.

## 6. PT approval

A different person approves the draft PT. The approval makes the PT official and values the stock in one transaction (module-map 6.2 flow C). It does not make the goods sellable; the scan-in does (section 7, `DEC-135`). It lives in `merchandise` · PT, with `access`, `merchandise` · catalogue, `stock` · ledger and `finance` · books.

### 6.1 Who approves

- A person holding PT approval authority for the GRN's Site and business unit, who is not the uploader (`PRD-REC-017`, `POL-02.07`). Which roles hold it, office, warehouse or both, is set in roles, never in code (system-dumb 15, 20.4).
- The approval is judged on the PT's total proposed acquisition cost: `P RATE` times `QTY`, summed over its rows (`PRD-ACS-015`, `POL-02.09`; domain-model section 5). The request goes to approvers whose limit covers it (access-and-approvals; `S1-F05`). Every row has its cost, since all 20 columns are filled (`DEC-140`).
- The request reaches the approver in My work.

### 6.2 What the approver sees

- The rows with their values and origins; the totals of pieces, BASIC, `P RATE` and MRP; the margin of each row (`PRD-PTW-011`).
- BASIC and `P RATE` side by side: BASIC is the basic rate, `P RATE` the actual purchase rate with handling and transportation (`DEC-140`, `POL-03.07`).
- The GRN with its invoices and photos, and the booking where its lines are linked.
- The new products the upload proposes, the repeated barcodes and the differences from existing products (section 5.5).

### 6.3 Approve or reject

- **Reject**, with a reason: the draft ends; the uploader uploads a corrected file (section 5).
- **Approve.** In one transaction, with the locks in the stock ledger's order (stock-ledger 10.3), or nothing (`PRD-INT-004`):
  1. `access` verifies the approval under the lock: the same PT revision, the approver's authority and limit, and that the approver did not upload it (`PRD-ACS-007`).
  2. `merchandise` · catalogue confirms the new products the PT proposed, with their barcodes as external codes (`PRD-MER-013`).
  3. `merchandise` · PT freezes the revision and gives the PT its number from its own number series; a draft carries only an internal reference (`PRD-REC-018`). **Design choice.**
  4. `stock` · ledger gives every receipt origin of the GRN its product: for each style and size, the pieces take the SKUs of the PT's rows, split by their quantities. The PT is the record of identity (system-dumb 13.6); a GRN line that named another SKU is corrected by this linked step, keeping its original (GI-1).
  5. `stock` · ledger records the PT's coverage on those pieces and establishes their cost at `P RATE` (stock-ledger 2.3, 13.4). Coverage never overlaps another approved PT (`PRD-REC-015`, `PRD-INT-005`). The excess holds of excess taken in are released, and wrong or unidentified goods taken in return to good condition through the identity route (section 4.6).
  6. `finance` · books posts the value of owned pieces with its balanced journal, under the posting map of `stock.cost-established` (books-and-posting 7.2). The posting map names both sides: stock value, and the account that holds what is still to be billed for it. Because `P RATE` includes handling and transportation (`DEC-140`), that second account is a receipt account set by Accounts and the CA, not the supplier's payable; what the supplier is owed comes from its invoice when invoices are matched in stage 5 (`DEC-137`). Goods the supplier still owns under the Agreement, such as consignment, record their cost only and post nothing (stock-ledger 13.4).
  7. `audit` records it; the outbox carries the follow-ups.
- Under the locks the approval is refused, naming the reason, when the GRN was recounted or a held line decided after the upload, when coverage would overlap, when a posting map is missing or the period is locked (books-and-posting), or when a number series is missing.
- A PT of many lines posts through a queued job, one at a time per book: the click records the approval and a request to post; a failed job posts nothing and the PT shows the failure (module-map 6.2 flow E; stock-ledger 10.6).
- After approval the GRN's goods are official and valued, still at their receiving location and not accepted (stock-ledger 6.3).

### 6.4 Reversing a PT before the scan-in

- A wrong approved PT is reversed and a corrected file uploaded and approved again, only while none of its pieces is scanned in (`DEC-137`, `PRD-REC-019`).
- Someone with PT authority proposes the reversal with a reason; a different person approves it. **Design choice.** In one transaction the reversal removes the coverage, reverses the established cost and its journal (stock-ledger 2.3 Reversal, 7.5), and keeps the PT and its reversal as linked records. Products it confirmed stay; their identity on the pieces stays until the corrected PT sets it again.
- The GRN then waits for a corrected PT file (section 5).
- Corrections after the scan-in follow later (RR-546).

### 6.5 Downloading a PT

- An approved PT downloads as an XLSX file in the template's columns (`PRD-PTW-008`, `PRD-PTW-009`). Downloading changes nothing. **Design choice.**

## 7. Scan-in at the Site

After the PT is approved, the goods are scanned in where they are. The scan-in verifies each piece's barcode against the approved PT and accepts it at a location of the Site; at a Store that makes it sellable (`PRD-REC-021`, `PRD-REC-022`, `PRD-STK-003`, `DEC-135`). It lives in `receiving`, with `stock` · ledger.

### 7.1 Who and when

- At a Store, its staff (P-STM); at a warehouse, Warehouse (P-WHS): people authorised at the GRN's Site, whoever uploaded or approved the PT; the scan-in needs no second person (`PRD-REC-022`).
- Once the GRN's PT is approved, the GRN shows in the Receive Goods inbox as waiting for scan-in (section 4.1).
- Several people may scan the same GRN; the scan-in is saved as it goes and can be resumed.

### 7.2 Scanning

- The person chooses where the goods go: at a Store, the floor or the backstore; at a warehouse, a bin (structure-and-masters 3.5; system-dumb 13.3, 18.6). They can change it between scans.
- Each scan accepts one piece. A barcode is scanned with a keyboard-input scanner or typed from the tag; both go through the same checks (PRD Stack: Hardware). Quantities are not typed, so every piece is verified. **Design choice.**
- The barcode is resolved through its external code mapping to a product the PT covers, with pieces still waiting at the receiving location:
  - one product: accepted;
  - a barcode repeated across products, which only a barcode recorded under the brand can be, so it is resolved with the PT's brand (RR-554): the screen lists the PT's products that carry it, and the person chooses; nothing is chosen silently (`PRD-MER-007`, `DEC-135`);
  - a barcode the PT does not cover, or a product with no pieces left to accept: refused and shown, kept in the scan-in's record, and no stock changes (earlier RetailsOps plan, ruling R3).
- **Each accepted scan**, in one transaction: `stock` · ledger records the acceptance of that piece and its location move from the receiving location to the chosen one (stock-ledger 2.3 Location move; 6.3); `audit` records who scanned, when and where.
- **Damage found while scanning** is reported as in section 8; the piece goes under a damage hold and is not accepted (ruling R4).

### 7.3 Finishing

- The scan-in is complete when every piece the PT covers is accepted or under a damage report.
- The person may stop with pieces left; they stay unaccepted at the receiving location, visible in the inbox, and the scan-in can be resumed later. Nothing is written off (ruling R5).

### 7.4 What the scan-in makes

- **At a Store**, an accepted piece in good condition, covered by the official PT and with no hold or reservation, is sellable (stock-ledger 6.3). Selling at the till comes in stage 4.
- **At a warehouse**, an accepted piece is available to move; transfers come in stage 3.
- Once any piece of a PT is scanned in, the PT can no longer be reversed (`DEC-137`).

## 8. Damage at or after receipt

Damage is reported on goods at a Site and holds them at once; a different person confirms or rejects the report (`PRD-DMG-001`, `PRD-DMG-002`; grill notes, 19 Oct 2026). The damage report lives in `stock` · documents, with `stock` · ledger (module-map section 5). Quarantine movements, write-off, disposal and supplier returns come in stage 3.

### 8.1 When damage is reported

- At the count, on a GRN line (section 4.4).
- After the GRN and before the PT, on goods at the receiving location.
- During the scan-in (section 7.2).
- After the scan-in, on stock at the Site (`PRD-DMG-004`).

### 8.2 The report

- Anyone authorised at the Site reports it: the goods (a GRN line, or a product at a location), the quantity, what is wrong, and photos as stored files.
- **At once**, before anyone confirms it, a damage hold covers that quantity, so it is unavailable (`PRD-DMG-001`, `PRD-ACP-005`; stock-ledger 6.1).
- Before the PT, the goods' identity, cost and tax may be Unknown; they stay Unknown, and nothing is invented for them (`PRD-DMG-005`).
- The report reaches Operations (P-OPS) in My work as the follow-up owner (grill notes, 19 Oct 2026).

### 8.3 Confirm or reject

- A different authorised person from the reporter decides, with a reason, keeping the report's observations (`PRD-DMG-002`, `POL-02.07`). The approval is judged on the goods' cost; goods of Unknown cost need explicit authority for Unknown values (domain-model section 5; access-and-approvals; `PRD-ACS-016`).
- **Reject:** only that damage hold is released; every other hold and reservation stays (`PRD-DMG-003`).
- **Confirm:** the goods take the damaged condition and are quarantined (stock-ledger 2.3 Condition change, 6.1). They stay where they are, with no forced movement and no release by time (`PRD-DMG-006`), until a stage 3 outcome.
- **A mistaken confirmation** is undone by a linked reversal that restores the goods' earlier condition and holds; the confirmation itself is never edited (`PRD-STK-017`). Someone proposes the reversal with a reason and a different person approves it. **Design choice.**

### 8.4 Damage and the PT

- Damage at the count is decided before the PT is uploaded; confirmed-damaged pieces take no PT and stay held (`DEC-137`).
- Goods damaged after the PT keep their coverage and cost, so their value stays on record, but they are unavailable (stock-ledger 6.2).
- Accepting or scanning in damaged goods never makes them good stock (`PRD-DMG-010`, `POL-17.03`).

### 8.5 As built for damage reports (`S2-F08-T01`)

**Design choice** throughout; none sets a business value. Tested in `apps/server/test/damage-reports.int.test.ts` (test 16 of section 12, the gate, the series, the decision's authority, the reversal and the interface `receiving` calls), the ledger's part in `apps/server/test/stock-ledger-damage.int.test.ts` (stock-ledger 13.15), and the screens in `apps/web/e2e/damage-reports.spec.ts`.

- **Records** (`stock` · documents, migration `stock.documents__damage_reports`; 10.1). In the schema `stock`, which the ledger's part shares (stock-ledger 14.1): the report (`damage_report`), its photos, the **rounds** of its decision (`damage_round`), each round's decision (`damage_decision`), the reversals of a confirmation (`damage_reversal`) and their decisions (`damage_reversal_decision`). Every row is append-only and carries the place where the goods are, the legal entity of the unit's mapping in force when it was reported (`PRD-MOD-010`) and the goods' brand, all under the record type `stock.damage_report`, so whoever sees a report sees its rounds, decisions and reversals. A reference to the ledger's hold, origin or movement has its foreign key, the schema being one (code-house-rules 3.2). The report's identity row is locked at step 1 by every change of it. Its state is read from its rows: Submitted while its latest round waits, then Confirmed or Rejected (design-language 7).
- **The goods** (8.2). A report names a GRN line, whose goods are the receipt origin its count made (the ledger's `originOfSourceLine`), of a product not yet set up too, by that origin (stock-ledger 13.15; `PRD-DMG-005`); or a product, by its SKU, at the location, taken oldest first (`PRD-STK-013`). Whose line it is comes from the caller, so `stock` · documents holds no identity of another module's records: `receiving` names its own GRN when it calls `reportDamage` (10.2), and the damage route passes on the source the line's receipt origin names (the ledger's `sourceOfLine`, stock-ledger 13.15); a line of another source, or of none, names no goods (`stock.goods-not-found`). The location gives the Site and business unit (structure-and-masters 3.5). The quantity is whole pieces; what is wrong is text; photos are stored files, none required (`PRD-DMG-001` holds the goods at once, photo or not; the product owner to confirm, RR-567) and at most the technical cap below, which no rule sets. The Arrival's read gives each GRN line its identifier for this.
- **Permissions.** Create on `stock.damage_report` reports damage and asks for its decision again; view reads it; approve on it decides a report someone else made. Create on `stock.damage_reversal` proposes a reversal of a confirmation, approve on it approves one. Each carries every scope fact, so each route authorises in its command with the report's facts. Reporting and deciding write the ledger's rows, so a reporter and a decider hold view on the stock record types too (stock-ledger 14.3).
- **Reporting** (8.2, 10.3). In one transaction, or nothing: the gate (10.5 "As built"); the damage hold, placed through the ledger at once (stock-ledger 6.1, 13.15) and valued for the decision's request; the damage-report and exception-code series held at step 8; the number; the report and its first round; the photos, attached through `files-imports`; the decision's request from a different authorised person (`PRD-DMG-002`); the exception `stock.damage`, of the category damage, to the owner its routing at the Site names, Operations (P-OPS) as policy 2 routes stock (`POL-02.16`), with the request's value as its exposure; the audit record and `stock.damage-reported`. The exception closes once the report is decided: its resolution check verifies that the report's latest round is confirmed or rejected (`PRD-EXC-002`).
- **The decision** (8.3). Made in My work through `access`'s approval route, under the action type `stock.damage_report.decision` on approve of the report, by none of its preparers, the reporter (`PRD-DMG-002`), on cost (domain-model 5; DM-8, DEC-105): an Unknown cost needs explicit authority over Unknown value (`PRD-ACS-016`). Its effect runs in the decision's transaction (access-and-approvals 9.8b "As built for a document posted with its decision"): the gate is asked first for either outcome; **approve** confirms, posting the end of the damage hold by `damage-confirmed`, the condition change to damaged and the quarantine where the goods are, verified and used under the ledger's locks on the goods' cost then (access-and-approvals 9.7); **reject** ends only that damage hold, by `report-rejected` (`PRD-DMG-003`). Each records the decision row, its audit record and `stock.damage-confirmed` or `stock.damage-rejected`.
- **Rounds and renewal.** A round is the version a decision binds to (`PRD-ACS-007`): the first is the report as reported. Under the ledger's locks the decision is refused, `access.approval-value-exceeded`, when the goods' cost is higher than the request's, or known where it was Unknown (access-and-approvals 9.7; DEC-066). Then anyone who may report asks again (`decision-renewal`, naming the round as its version token): a new round on the same damage hold, valued now under the ledger's locks with nothing written, whose request supersedes the round's open one (access-and-approvals 9.6).
- **A reversal of a confirmation** (8.3; `PRD-STK-017`). Proposed with a reason by someone who may, of the confirmation the report stands on now and one at a time (`stock.reversal-open`); its approval, under `stock.damage_reversal.approval`, by a different person from its proposer, on the cost of the goods it returns to good condition, as the confirmation it undoes (**Design choice**; domain-model 5 names no basis for it: the product owner to confirm). A reversal's state is read from its rows: Awaiting approval until it is decided, then Approved or Rejected (design-language 7). Approved, its effect posts the end of the quarantine by the approved decision, the reversal of the condition change, a movement linked to it, and the damage hold placed again, so the goods have their earlier condition and holds (stock-ledger 13.15); the report then waits for a decision again, in a round of its own on the restored hold, decided by none who reported it (**Design choice**: the restored damage hold ends only by a decision, 6.1; the product owner to confirm). Rejected, nothing changes.
- **The interface `receiving` calls** (10.2): `reportDamage` of `stock` · documents joins the caller's transaction and commits or rolls back with it. The caller names the source whose line a GRN line is, its module and record type (`receiving`, `grn`), with the request's idempotency key. It takes its own locks from step 2 on, so the caller calls it before taking any lock above step 1 of its own, since the lock helper refuses a step taken twice (code-house-rules 8.2). At the count the damage hold belongs to the GRN's own ledger request (one request per command, stock-ledger 13.1), so `reportDamage`, which posts a request of its own, cannot join it: the GRN takes three steps instead (`S2-F02-T03`; 4.9), naming its goods by the receipt origins its own counts make, so it needs no line source. `countDamageReady`, before any lock above step 1, asks the gate at the unit and answers the damage-report and exception-code series, which the GRN holds at step 8 in its own one call; `countDamageHold` gives each damaged line's damage hold, an item of the GRN's request on the origin its count makes (stock-ledger 13.16); `recordCountDamage`, once that request is written, records each line's report on its hold, valued under the ledger's locks, with its number from the series held, its photo, its decision's request and the exception to Operations, as a report made on its own is (the shared `recordReport`). Each takes no lock of its own. **Design choice.**
- **The damage-report number** comes from one series for the Organisation, not restarted each financial year (GC5-1), as the GRN's (4.8); its format is the Organisation's, set by an operator until a screen exists (RR-449). The tests and the server of the browser journeys define it with a format labelled SYNTHETIC, `SYN-DMG-` and five digits (`DEC-118`). The local seed does not: `DEC-143` lets it add only the GRN series to a finished synthetic Organisation (the product owner to say whether it adds this one).
- **Input caps.** What a reporter enters is bounded by technical caps, the builders' choice and no business limit, named `DAMAGE_CAPS` in `packages/schemas`: at most 1,000,000 pieces on a report, as a count line's (4.8); text of at most 500 characters for what is wrong and for a reversal's reason; at most 20 photos on a report, a technical cap and no business limit: the screen gives one photo, and the route takes up to 20.
- **Screens** (section 11). **Report damage** is on each line of an issued GRN in the Arrival, for whoever holds create on `stock.damage_report`: the pieces, what is wrong and one photo, at the Arrival's receiving location; once reported, the report shows with its state, rounds, photos and reversals, read again on request, since its decision is made elsewhere. There a reporter asks for the decision again while it waits, and a proposer proposes a reversal of a confirmation; each names the version shown, so waits while the report is read again (code-house-rules 12.7). A product at a location is reported through the route; its screen path comes with stock search (`S2-F11`). **The decision in My work**: the approval panel shows the report's number, goods, quantity, what is wrong, photos and rounds, and, for a reversal, its reason; deciding reads the report again. Journey: a Store's staff (P-STM) reports damage on a GRN line, refused once with the reason shown, and Operations (P-OPS) confirms it from My work (code-house-rules 10.1).

## 9. Stock search and the stage 2 reports

The product owner asked for defaults here (grill round 8). Reports read declared read models of `booking`, `receiving`, `merchandise` · PT and `stock` · ledger through their interfaces, under the reader's own access (module-map section 5, `reports`).

### 9.1 Rules for every report and the search

- Only data the reader may see: their places and brands, and cost only with the cost field permission; MRP values need none (`PRD-ACS-008`, `PRD-EXC-011`, `PRD-SEC-005`).
- Current state only, with its as-of time shown; past dates are not offered in stage 2 (grill round 8, `PRD-PRF-004`).
- Missing or Unknown values are shown as such and never counted as zero; a total that has them says so (`PRD-EXC-010`, `PRD-MOD-015`).
- Every figure drills down to its records: the booking, the GRN, the PT, the movements (`PRD-EXC-011`).
- Each metric has one definition, written below (`PRD-EXC-009`).
- Any report or search result exports to XLSX as shown. **Design choice.**

### 9.2 Stock search

- Search by style code or product name, brand, size, barcode, location and condition (`PRD-STK-006`). A barcode repeated across products shows each product.
- Each result is a product at a place (Site, business unit, location), with its quantities apart (`PRD-STK-001`; grill round 8):

| Quantity | Meaning |
| --- | --- |
| Physical | In custody at the place |
| Available to sell (Store) or available to move (warehouse) | Physical, covered by an official PT, accepted, in good condition, with no hold or reservation (stock-ledger 6.2, 6.3) |
| Waiting | Counted but not yet covered by a PT, or covered but not yet scanned in |
| Held | Under any hold, by kind: damage, quarantine, excess |

- The same search shows the product at the other Stores and warehouses the reader is allowed to see (`PRD-STK-006`).
- Goods still without a product (before PT approval) show their style code, colour and size as counted.

### 9.3 The stage 2 reports

| Report | Shows | Definitions (design choices) |
| --- | --- | --- |
| Booking status | Per booking and line: ordered, delivered, outstanding, cancelled, overdue; by brand, season, supplier, destination and state (`PRD-BKG-005`) | As section 3.6. Overdue: outstanding after the line's date or the booking's window |
| Receipt problems | Per GRN and line: shortage, excess, wrong, unidentified and damage, each with its decision and who made it; by Site, supplier, brand and date | As section 4.4 |
| Supplier fill rate and timeliness | Per supplier, brand and season (`PRD-BKG-011`) | Fill rate: delivered pieces ÷ ordered pieces, over bookings whose window has ended or whose balance is closed. On time: delivered pieces that arrived within their line's date or the booking's window ÷ delivered pieces. Damage rate: pieces under a confirmed damage report at the count ÷ counted pieces |
| Stock by product, size, location, condition and owner | The quantities of 9.2 summed by those five, with MRP value, and cost value for readers allowed to see cost (`PRD-PRO-001`) | Owner: the Organisation or the supplier, from the receipt origin (`PRD-ORG-015`) |

- The PT accuracy report (`PRD-BKG-011`, PT lines right first time) waits until PT making is complete (grill round 8).

## 10. Modules, records, interfaces and transactions

Technical. Every part follows the module map's rules: calls through public interfaces only, downward or to the same-tier calls the module map lists, one transaction per command (module-map sections 2, 3 and 6).

### 10.1 Where each part lives

| Module · part (tier) | Records | Operations |
| --- | --- | --- |
| `booking` (4) | Booking with its versions and lines; booking document (stored-file attachment); open-to-buy budget with its versions; receipt link from a GRN line to a booking line; issue and confirmation records; cancellation | Save draft; submit; approve or reject (through `access`); record issued, confirmed; propose a change or a cancellation; prepare, check and approve a budget; link a GRN line (called by `receiving`); read open lines; booking status read model |
| `receiving` (4) | Arrival with its invoices, transport details and photos; count lines; GRN with its lines and findings; held-line decision; recount; scan-in and its scans | Record an Arrival; save the count; issue the GRN; decide a held line; propose and approve a recount; scan in; finish; read a GRN's good pieces per style and size (for `merchandise` · PT); receipt problems read model |
| `merchandise` · PT (4) | PT with its revisions and rows; the reversal | The PT import handler (validate, preview, publish the draft and its approval request); approve or reject (through `access`); propose and approve a reversal; download |
| `stock` · documents (4) | Damage report; its decision; the reversal of a confirmation | Report damage; confirm or reject; propose and approve a reversal |
| `stock` · ledger (3), used | Receipt count, condition change, identity resolved, location move, cost established, reversal; holds; coverage; acceptance (stock-ledger 2.3, 6, 13) | As stock-ledger 13 |
| `merchandise` · catalogue and parties (2), used | Products, product proposals, external codes, vocabularies; agreements, brand–supplier links | Resolve a code; propose and confirm a product; read the terms in force (module-map 4.12) |
| `files-imports` (1), used | Stored files and attachments; the PT template's layout; the import batch | Intake, staging and validation (imports-and-opening-data 3.1); the handler contract (13.2) |

### 10.2 Calls between modules

- `receiving` calls `booking`, and `merchandise` · PT calls `receiving`, as the module map already lists (module-map section 5).
- **New:** `receiving` calls `stock` · documents, to raise a damage report at the count and during the scan-in in its own transaction. Added to module-map section 5 and to the module check (`tools/module-check/check.mts`), 21 Oct 2026.
- The rest are downward calls to `stock` · ledger, `merchandise`, `organisation`, `exceptions`, `finance` · books, `access`, `numbering`, `files-imports` and `audit`.

### 10.3 One transaction each

| Operation | In one transaction | Refused, naming the reason, when |
| --- | --- | --- |
| Approve a booking (3.4) | `access` decision; `booking` approved, Agreement version fixed, open-to-buy reserved, number given; `audit`; outbox | Not the same version; limit; open-to-buy short or missing; no Agreement in force; no number series |
| Issue a GRN (4.5) | `receiving` GRN frozen and numbered; `stock` · ledger receipt counts, holds and quarantine; `stock` · documents damage reports; `booking` links; `exceptions` follow-ups; `audit`; outbox | Receiving not ready at the unit; a line without its counted quantity; batch or expiry missing where required; no number series |
| Decide a held line (4.6) | `access` decision; `receiving` decision; `audit`; outbox. No hold is released: the PT route ends it (4.9). A damage report is decided through its own decision (8.3) | The decider counted the goods, issued the GRN or named the product; no authority or limit; policy 17 not Signed and validated; decided already; unidentified goods with no product named |
| Approve a recount (4.7) | `receiving` recount; `stock` · ledger receipt count or reversal for the difference; `audit` | A PT uploaded for the GRN |
| Submit a PT file (5.6) | `merchandise` · PT draft revision; `access` approval request; `files-imports` outcome; `audit` | Any check of 5.3 or 5.4 |
| Approve a PT (6.3) | As module-map 6.2 flow C, with the product confirmations and the identity step; a large PT through flow E | As 6.3 |
| Reverse a PT (6.4) | `merchandise` · PT reversal; `stock` · ledger reversal of coverage and cost; `finance` · books reversal journal; `audit` | Any piece scanned in; not a different approver |
| Accept a scan (7.2) | `stock` · ledger acceptance and location move; `receiving` scan record; `audit` | Barcode not covered, or nothing left to accept |
| Report, decide or reverse damage (8) | `stock` · documents record; `stock` · ledger hold or condition change; `exceptions`; `audit` | Decider is the reporter; no authority |

Locks follow the stock ledger's order (stock-ledger 10.3); authority, version, state and quantities are checked again under them (`PRD-INT-003`).

### 10.4 Numbers and events

- Booking, GRN, PT and damage report each take a number from their own series (numbering-and-audit); an operation that needs a number and has no series set up is refused, naming it.
- Outbox events, named under code-house-rules part B: booking approved and changed; GRN issued; held line decided; PT approved and reversed; piece accepted; damage reported, confirmed, rejected and reversed. Each carries identifiers only; consumers refetch (`PRD-MOD-006`). **Proposed.** As built: `receiving.grn-issued` (4.8) and `booking.booking-approved`, carrying the booking and the version approved (3.9; `S2-F01-T03`), and `receiving.held-line-decided`, carrying the held line and its decision (4.9; `S2-F02-T03`); no consumer takes them yet.
- **Routes changed before their first deploy** (code-house-rules 12.1 "Compatible changes"; code review 3 of stage 2, 22 Oct 2026). A budget's season, once `season` (its attribute and value), is now `seasonValueId`, and a count line's size, once `size`, is now `sizeValueId` (structure-and-masters 4.2 "As built"; RR-550, RR-556). The booking and receiving routes have never been deployed to any environment: they exist only on the stage 2 branch, so no client of an earlier deploy sends the old fields and no add-then-remove step is needed. The origin now required on the catalogue's tracking-profile routes and the organisation's mapping routes, which `dev` runs, is a planned brief interruption there (structure-and-masters 3.4 and 4.6 "As built"; `DEC-120`). For the same reason a count line's draft now states what it counts, what happens to its extra pieces and its damage, a count line's style code may be none, a GRN line's read carries its findings and held part, and the inbox may say a delivery waits for its held lines (4.9; `S2-F02-T03`).

### 10.5 The policy gate

Every operation that records a business effect asks the Available check first (`S1-F04`; `PRD-SEC-017`). **Proposed** mapping, from [phases.md](../../phases.md) stage 2:

| Operation | Needs |
| --- | --- |
| Approve a booking | Policies 5 and 1 |
| Issue a GRN; scan in | The unit's receiving activity (`PRD-LIF-001`); policies 4 and 10 (`POL-10.08`) |
| Decide a held line; damage | Policy 17 |
| Approve or reverse a PT | Policies 1, 3, 9 and 10 |

Policy 2 governs every approval. On `dev` with synthetic data these run under labelled synthetic settings (`DEC-118`).

**As built** (`S2-F01-T02`; `DEC-142`): an open-to-buy budget is no value of policy 5, and its preparation, check and approval are not gated (DEC-116); its own check and approval are its control, so approving a new version leaves policy 5's validation as it is (3.3). The validity check `booking.open-to-buy-budgets` first built is removed. **Design choice.**

**As built** (`S2-F01-T03`; 3.9): a booking's approval asks the gate in the decision's transaction under the locks, as two operations sharing the capability `booking.bookings`, `booking.approve-booking` under policy 5 and `booking.approve-booking-terms` under policy 1, with no activity, since a booking records nothing at a unit; Available answers yes only when both do, and the refusal, `configuration.operation-unavailable`, names every thing missing once. Recording, changing and submitting a Draft are not gated: they record no business effect (DEC-116). No module reports policy 5's values (RR-561) or policy 1's (RR-565), so neither policy can be validated and a booking's approval stays unavailable outside tests: the integration tests and the browser journeys open the gate through TEST-ONLY validity checks, each reporting one labelled synthetic value, registered only in the test composition (code-house-rules 11.1; `apps/server/test/support/booking.ts`). **Design choice** of the mechanism.

**As built** (`S2-F02-T02`): an operation the gate knows names one governing policy, so receiving declares two, `receiving.receive-goods` under policy 4 and `receiving.receive-goods-statutory` under policy 10, sharing the capability `receiving.goods-in` and the receiving activity; recording an Arrival and issuing its GRN ask both, and the unit's mapping verification beside them (4.8). The first names the people the activity needs at a unit: create and edit on `receiving.arrival` and create on `receiving.grn` (`PRD-ACS-006`). **Design choice.**

**As built** (`S2-F08-T01`): reporting damage, deciding a report and approving a reversal each ask one operation, `stock.damage-reports`, under policy 17, with the capability of the same name and no activity grant, since damage is reported wherever goods are. Its checks are the exception-code series and the routing of `stock.damage` at the Site, since a report raises a numbered exception (access-and-approvals 12.1, 12.2; `POL-02.16`). Policy 17 reports no values yet: no module holds a configured record of it, so it cannot be validated and damage stays unavailable (RR-480) until the product owner says which records are its values (candidates: the approval limits of the damage decision, `POL-17.04`, `POL-17.08`). The tests open it on the one value of a test-only check, labelled synthetic (`apps/server/test/support/damage.ts`). **Design choice** of the mechanism.

**As built** (`S2-F02-T03`): a held line's decision asks one operation, `receiving.held-line-decisions`, under policy 17, sharing receiving's capability `receiving.goods-in`, with no activity grant, since Booking decides wherever the goods are held; asked for either outcome under the held line's lock, as a damage report's decision is. A GRN whose count found damage asks the damage operation too, through `stock` · documents (8.5), so it needs policy 17 Signed and validated and the damage capability; a GRN without damage does not. Holding excess, wrong and unidentified goods is part of the GRN and needs only its own gate. The tests open policy 17 on the one value of `S2-F08-T01`'s test-only check, labelled synthetic. **Design choice** of the mechanism.

**As built** (`S2-F02-T02` follow-up; RR-558, product owner, 21 Oct 2026): policy 4's values are the tracking profiles, reported by `merchandise.tracking-profiles` (structure-and-masters 4.6 "As built"), and policy 10's the business units' verified mappings, reported by `organisation.verified-mappings` (`POL-10.01`, `POL-10.08`; structure-and-masters 3.4 "As built"), and the tax-rule records, reported by `finance.tax-rules` (`POL-10.02`; shared-calculations 10.1 "As built"). Each value carries its origin, the tracking profiles and the mappings now as the tax rules did, so a value of an origin this environment does not accept keeps both operations unavailable, named `{kind: origin}` (code-house-rules 12.14). With policies 4 and 10 Signed and validated on labelled synthetic values a GRN is issued; a value of the test setup on local work keeps receiving unavailable, policy 4 validated again (`apps/server/test/receiving.int.test.ts`). **Design choice** of the mechanism.

### 10.6 Changes this needs in stage 1 work

- **GI-1:** the receipt count of goods with Unknown SKU, not quarantined, and the identity step at PT approval that splits a style and size into the PT's SKUs (stock-ledger 13.9). Built in `S2-F02-T01` (stock-ledger 13.14), for the product owner's review.
- **RR-547:** a brand barcode on more than one SKU (`PRD-MER-007`, `DEC-135`). Done in `S2-F04-T01`: structure-and-masters 4.3 "As built", module-map 4.12.
- **RR-545:** remove the Agreement's default model for new bookings (`DEC-129`). Done in `S2-F01-T01` (structure-and-masters 5.2 as built).
- The new call of 10.2: done in module-map section 5 and the module check.

## 11. Screens by persona

Every screen shows each record's state, what blocks it and the next action (`PRD-UXP-003`); a person's daily actions are within three navigation actions of their home (`PRD-UXP-001`); screen text is kept apart from code for the later Hindi screens (`DEC-099`). Names follow [ui-blueprint.html](../ui/ui-blueprint.html) and [personas.md](../access/personas.md); a persona grants nothing, the role assignment does.

| Persona | Screens | What they do there |
| --- | --- | --- |
| Booking (P-BKG) | Booking › Bookings; the booking form; Booking › Open-to-buy; My work | List and filter bookings by state, brand, season, supplier and destination; upload the booking document, enter the header and the size-colour grid, see totals and the brand's terms read-only, submit (3.1); record Issued and Confirmed; propose changes and cancellations; prepare budgets; decide excess, wrong and unidentified lines, review unmatched GRN lines and link unbooked ones, follow overdue bookings (3.7, 3.8, 4.6) |
| Warehouse (P-WHS); a Store's staff (P-STM) | Receive Goods › Inbox (Pending, History); Arrival; Count; Scan-in; Report damage; Stock search | "Goods arrived" or "Receive against booking"; record the Arrival and its invoices first; count line by line against the invoice, with findings and photos; issue the GRN (4.1 to 4.5); scan the goods in to the floor, backstore or a bin, stop and resume (7); report damage at any step (8); search stock (9.2) |
| Whoever is assigned to make PTs | Receive Goods › a GRN › Upload PT file | Download the blank template; upload the filled file; read the validation report or the preview; submit for approval; withdraw a wrong draft; propose a reversal before the scan-in (5, 6.4) |
| PT approver | My work › Approvals › the PT review | See the rows, totals, BASIC and `P RATE`, margins, the GRN's invoices and photos, new products, repeated barcodes and differences; approve or reject with a reason (6.1 to 6.3) |
| Owner (P-OWN), or whoever holds the limits | My work › Approvals | Approve bookings, budgets, booking changes and cancellations, recounts, PT reversals and damage reversals (3, 4.7, 6.4, 8.3) |
| Accounts (P-ACC) | My work | Record the check of an open-to-buy budget (3.3) |
| Operations (P-OPS) | My work › Exceptions; the damage report | Follow up damage; confirm or reject a report made by someone else (8.3) |
| Admin (P-ADM) | Setup | Propose the PT template's layout and the master sheet's vocabularies for a second person to confirm (5.2); mark the season and size attributes on Setup › Vocabularies, Attributes, for a second person to approve (structure-and-masters 4.2 "As built"); set up the booking, GRN, PT and damage-report number series; approve receiving readiness per Site and unit; assign roles and approval limits |

- **Booking › Bookings and the booking form**, as built in `S2-F01-T03`: 3.9 "Screens".
- **The findings at the count, the held lines and their decision in My work**, as built in `S2-F02-T03`: 4.9 "Screens".
- **Template download.** The upload screen offers the Organisation's blank PT template, its lists included, so the file is made in the right columns. **Design choice.**
- **Scan-in on a phone or a counter PC** with a keyboard-input scanner; the screen works at phone width (`PRD-PRO-009`; responsive web, `DEC-105`).

## 12. Design tests

Each test runs on synthetic data: real PostgreSQL for rules, concurrency and failures, a browser journey for each persona's path (`PRD-ACP-018`; code-house-rules part A). They prove the stage 2 exit checks that the first version reaches.

| # | Test | Proves |
| --- | --- | --- |
| 1 | Invoice 10, counted 8: custody 8, shortage 2 with Booking; no booking or invoice quantity creates stock | `PRD-ACP-001`, `PRD-REC-008` |
| 2 | A GRN with clean, excess, wrong, unidentified and damaged lines: each held kind stays held; the PT upload is refused until every held line is decided | 4.4, 4.6, `DEC-137` |
| 3 | No invoice: the count does not start | `DEC-133` |
| 4 | Booking approval: open-to-buy short or missing refused; approval reserves; cancelling a balance releases; the Agreement version is fixed and a re-approval takes the new one; no Agreement refused | 3.2 to 3.5, `DEC-132` |
| 5 | Booked 10 each of S, M and L; deliveries 5, 3 and 2 a size: outstanding 15, 6 and 0 | `PRD-BKG-005`, `PRD-BKG-006` |
| 6 | GRN lines link on style code, and colour and size where given; an ambiguous line, a line at another Site and an unbooked GRN go to review; a later link changes nothing on the GRN | 3.7, `PRD-BKG-007`, `PRD-BKG-008` |
| 7 | Overdue: the window passes with quantity outstanding; the balance is marked overdue, an exception reaches Booking, nothing is cancelled | 3.8, `POL-05.06` |
| 8 | PT file refusals, each listed and nothing created: a value off its list; another brand; a style and size whose quantity differs, is missing or is extra; `NAG` not `QTY`; `MARGIN` disagreeing; `P RATE` above `MRP`; a required column empty; a workbook linked to another | 5.2 to 5.4, 5.6 |
| 9 | A GRN line with no colour against PT rows tagged PREMIUM: accepted, colour not compared | `DEC-138` |
| 10 | New products proposed by the upload and confirmed at PT approval; a barcode on two products flagged and kept for both | 5.5, `PRD-MER-013`, `DEC-135` |
| 11 | PT approval: the uploader cannot approve; the limit is judged on `P RATE` × `QTY`; owned goods post their journal under the posting map, against the receipt account; consignment goods post nothing; a missing posting map or a locked period refuses the whole approval | 6.1 to 6.3 |
| 12 | Two approvals of one PT at once, and a recount racing a PT approval: one succeeds, the other is refused; coverage never overlaps | `PRD-ACP-002`, `PRD-INT-005` |
| 13 | After approval nothing is sellable; after the scan-in the Store's pieces are sellable and a warehouse's are available to move | 7.4, `PRD-STK-003`, `DEC-135` |
| 14 | Scan-in: a barcode not on the PT refused and recorded; a repeated barcode asks which product; damage during the scan-in holds the piece; stop and resume; the last piece scanned twice at once is accepted once | 7.2, 7.3 |
| 15 | A PT reversed before the scan-in and a corrected file approved; a reversal refused once one piece is scanned in | 6.4, `DEC-137` |
| 16 | Damage: the hold applies at once; the reporter cannot decide; rejecting it releases only its hold while another hold stays; a mistaken confirmation reversed by a linked record | `PRD-ACP-005`, `PRD-DMG-001`–`PRD-DMG-003`, `PRD-STK-017` |
| 17 | Goods received at a Store and at a warehouse meet the same acceptance and hold checks | `PRD-ACP-003` |
| 18 | Receiving refused at a unit without approved receiving readiness or with an unverified mapping | `PRD-LIF-001`, `POL-10.08` |
| 19 | A GRN issued twice with the same request gives one GRN; every write's idempotency key replays its first answer | `PRD-INT-002` |
| 20 | A reader scoped to one Store sees only its stock and receipts; cost hidden without the cost permission | 9.1, `PRD-ACS-008` |
| 21 | A 10,000-line PT file is checked within one minute; a 10,000-line PT approval posts through the queued job | `PRD-PRF-001`, 6.3 |
| 22 | Browser journey: booking, approval, Arrival, count, GRN, PT upload, approval and scan-in, ending with the pieces sellable in stock search, with one refusal at each step | Sections 3 to 9 |

Not proved by the first version: goods owned before they arrive (`PRD-ACP-020`, `DEC-139`) and the side-by-side test import (`PRD-LIF-014`, parked); both wait for their placement (RR-546).

## 13. Open questions

| ID | Question | Owner | Blocks |
| --- | --- | --- | --- |
| GI-1 | The stage 1 receipt count needs a known SKU (stock-ledger 13.9). Goods of a product not yet set up must be counted with their identity as described and their SKU Unknown, not quarantined, and get their SKU at PT approval. Extend the ledger's receipt count and its identity step for this; technical. **Closed** by `S2-F02-T01`, 21 Oct 2026: stock-ledger 2.2, 2.3, 13.4, 13.9, 13.14 and 14.2 amended, each marked for the product owner's review of the ledger change | Builders, with the product owner's review of the stock-ledger change | — (the review is the product owner's) |
| GI-2 | A booking and an open-to-buy budget name their season as a value of the Organisation's season vocabulary (3.1, 3.3), but the catalogue configures attributes freely and marks none as the season (structure-and-masters 4.2; GC2-9). As built in `S2-F01-T02`, a budget names the attribute and the value, and any list-type attribute is accepted. Mark which attribute holds the seasons, or keep naming it each time (RR-550). **Closed** 21 Oct 2026: the product owner decided that one attribute is marked as the season, an Organisation setting approved by a second person; built for `S2-F01-T02` (structure-and-masters 4.2 "As built"; 3.3 "As built") | Product owner; builders for the mechanism | — |
| GI-3 | The count names a line's size as a value of the Organisation's size list (4.3), which the PT file is matched on (5.4), but no attribute is marked as the sizes and the catalogue's size sets are per category (structure-and-masters 4.2). As built in `S2-F02-T02`, a line names the attribute and the value, as a budget names its season (GI-2), and keeps the value's code. Mark which attribute holds the sizes, or keep naming it each time (RR-556). **Closed** 21 Oct 2026: the product owner decided that one attribute is marked as the size list, an Organisation setting approved by a second person; built for `S2-F02-T02` (structure-and-masters 4.2 "As built"; 4.8) | Product owner; builders for the mechanism | — |
| GI-4 | Which owner a receipt count records when the brand's Agreement transfers ownership at receipt and acceptance, or at another event described in words (`POL-01.05`, `POL-01.06`): is the GRN that receipt and acceptance, or the scan-in at the Site? (RR-557) **Closed** by `DEC-141`, 21 Oct 2026: under receipt and acceptance the brand owns the goods at the count and ownership passes to the Organisation at the scan-in, which `S2-F07-T01` records; another event described in words is Unknown until recorded. Built in `S2-F02-T02`'s follow-up (4.5, 4.8) | Product owner | — |
| GI-5 | Damage on wrong or unidentified goods at the count. The ledger turns goods damaged only from good condition (stock-ledger 2.3), so goods held wrong or unidentified cannot have a damage report confirmed, and damage at the count is limited to pieces on the invoice, counted (4.9). Should the ledger let goods held wrong or unidentified become damaged, or is such damage recorded once Booking takes them in? (`PRD-REC-006`) | Product owner | — (damage on such goods waits; the receiver records them not received, or reports damage after they are taken in) |
| GI-6 | When a shortage's follow-up to Booking is settled. Nothing in the app settles a shortage before supplier invoices are matched (stage 5, `DEC-137`), so as built its owner resolves it when followed up (4.9). Is that right, or should it wait for a later delivery, a debit note or the invoice match? (`PRD-EXC-001`, `PRD-EXC-002`) | Product owner | — |
