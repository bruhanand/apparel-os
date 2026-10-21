# RetailsOps - Phase 1 System Document

This is the product specification for **RetailsOps**, a retail ERP for multi-brand fashion retail chains.

Operational discussion updated: **2026-09-09**. The [PT Operational Agreement](./pt-operational-agreement.md) records the agreed conversation, including its final corrections. The updated operational sections below supersede conflicting earlier wording in this document. Commercial-model details, ownership/accounting treatment and party hierarchy remain for a separate discussion; retained commercial passages are the earlier baseline, not newly finalised decisions. Implementation comparison and delivery-phase changes are separate work.

It is written for **any** retail chain that runs offices, warehouses, and stores.
It names no company, no customer, and no geography.
Where a real deployment needs a specific brand, vendor, site, state, or tax rate, that is **master data the operator configures** - never a rule baked into the product.

Sections 1-16 are the goods path and the Phase 1 lock.
Section 17 is store operations, Section 18 is warehouse operations, Section 19 is the Brand Manager.
Section 20 is office operations.
Section 21 is vendor and ledger.
Sections 22-23 say what is partly deferred and what is out.
Section 24 is the register of closed decisions; Section 25 is what is left.

---

## 0. Framing and Scope Decisions

This specification is broken into phases.
This document is **Phase 1**.

We are building a **Retail-ERP** for fashion retail chains.

It is a **product**, not an implementation for one chain.
Every rule here must hold for any retail chain that adopts it.

The product is named **"RetailsOps"**.

### 0.1 Company-Agnostic Rules (binding on the whole document)

These constrain every section that follows.

1. **No named company.**
 The adopting chain is "the company" or "the retailer".
 It is one configured legal entity, not a specific business.
2. **No named place.**
 No country, state, city, or building is hardcoded.
 Geography is a configured hierarchy and its values are master data.
3. **No named brand, vendor, or partner.**
 Brands, vendors, sub-brands, agents, and partner stores are master data.
 Any example in this document is illustrative and must not become a rule.
4. **No named tax jurisdiction.**
 The product implements a tax model - registration per site, same-registration vs inter-registration treatment, tax derived from a dated tax-class table.
 It never hardcodes a registration pair, a rate, or a rate table.
5. **No named currency amount and no named external tool.**
 Currency, rounding unit, tender modes, and any accounting or statutory package the chain exports to are configured, not assumed.
6. **Site types, document types, and stock states are product structure** and are the same for every adopter.
 What varies per adopter is which sites exist, which brands they carry, and which policies they switch on.

Now the scope for Phase 1.

---

## 1. Organisation and Geography

One legal entity (the adopting chain): we will call it **company**.

Geography is a configured hierarchy: **Country → State → City → Site**.

The product ships the hierarchy.
The values in it are master data, so a chain operating in one state or twenty uses the same structure.

Site: **Office → Warehouse → Stores**.

### 1.1 Site Types

**1. Office**

- HQ
- Regional (RO)

**2. Warehouse**

| Type | Meaning |
| :--- | :--- |
| **DC** | Central / national distribution centre |
| **RDC** | Regional forward warehouse |

**3. Selling sites (Store)**

| Type | Meaning |
| :--- | :--- |
| **COCO** | Company owned, company operated |
| **FOFO** | Franchise owned, franchise operated |
| **FOCO** | Franchise owned, company operated |
| **SIS** | Brand shop-in-shop inside a store |
| **Kiosk** | Temporary / pop-up |
| **EBO** | Exclusive brand outlet; many run on the **brand's** software, not ours |

**4. Outlet backstore**

Stockroom of a store, under that store, not a DC.

**5. Virtual sites**

In-transit, RTV, damage, sample, e-comm reserve (notional, not a building).

### 1.2 Site Operation

| Site | Operations |
| :--- | :--- |
| **Office (HO)** | Planning, finance, audit, HR |
| **Warehouse** | GRN, PT parsing, distribution, barcoding |
| **Store** | POS, GRN, returns |

Store operations are detailed in Section 17, warehouse operations in Section 18, office operations in Section 20.

---

## 2. Goods Types

**1. Branded**

Comes with Invoice + Stock + Items are tagged with barcode, PT retrievable from brand.

So what is a branded good: **Invoice + Stock + Tagged item + Barcode + Brand PT file**.

**2. Non-brand**

Comes with Invoice + Stock + Items (can be) tagged with barcode (Variable) + **No** Brand PT file.

---

## 3. Parties - People Outside the Entity

| Party | Definition | Applies to |
| :--- | :--- | :--- |
| **Vendor** | The **legal/commercial counterparty** - a company with a tax registration, a tax identity number, bank details, and payment terms. Who invoices the entity and gets paid. | Always (branded + non-branded) |
| **Brand** | A **product label under a vendor**. Commercial model, margin, return window live here | Branded (and non-branded goods still have a brand name on the tag) |
| **Sub-brand** | Optional child of a brand - for example a brand's kidswear line sitting under the parent brand. | Some branded vendors |
| **Agent** | City-based **intermediary** - guarantees payment, shipment, returns. Not the vendor. | **Non-branded only** |

Hierarchy:

```
Vendor (legal entity)
  └── Brand (commercial terms)
        └── Sub-brand (optional)

Agent → introduces / chases non-branded Vendor (separate from vendor)
```

---

## 4. Product Journey - Booking

Booking records purchase intent. The official receipt PT establishes the received stock's complete baseline.

### 4.1 Branded Booking (in Phase 1)

Real world:

- A buyer goes to the brand (typically the brand's own warehouse or showroom), picks styles, places the order.
- Brand gives a proper booking receipt (receiving document).
- Direct with brand - no agent.
- Booked 6-8 months ahead (indicative, not a hard constraint - see Section 22.1).
- Supplier handles payment terms, shipment, commercial model.

UX for Brand:

1. Pick season → vendor → brand
2. Upload the receiving slip → Receiving Reader drafts style/size/qty lines
3. Handler reviews → confirms → status **Booked**

Structure:

- One booking = one vendor + one brand + one season
- Lines = mandatory style code + size + mandatory quantity (**no colour required at booking**). Missing size becomes **Free Size**.
- The booking records the applicable commercial agreement, referenced by its received stock. Detailed agreement design is deferred.
- One booking can have multiple deliveries and GRNs. For S/M/L booked at 10 each, deliveries of 5 each, then 3 each, then 2 each leave outstanding totals of 15, 6 and 0.
- Partial delivery is normal. Keep the remaining balance outstanding until received or explicitly closed short; do not rewrite the original order.

### 4.2 Non-branded Booking - NOT in Phase 1

Real world (today):

- Informal order: in person, call, WhatsApp, email.
- Receiving may be missing or thin; ex: "X pieces at this rate.", can be with style-code
- Agent in the middle (city-based): guarantees payment, shipment, returns/defect fixes (1-2% commission).
- Booked 3-4 months ahead, this is also not defined (lead time stays flexible - see Section 22.1)

UX (for when it comes):

1. Handler types the order manually (verbal/agent order)
2. Upload a photo of vendor note → auto-fill → review
3. Booking tied to vendor + season + accountable agent
4. Agent is chase contact on open/partial bookings.

---

## 5. Stock Arrival and the Canonical PT File

### 5.1 What the PT File Means

The PT file is **the moment data becomes true**.

Before it, you have intent (booking) or physical fact (goods counted) (GRN).
After it, the system has priced, identified, bookable stock.

**Significance:** every site transfer derives a PT for the quantities actually moving, retaining the original receipt and relevant canonical data. Other stock changes carry those stock references through their own numbered documents.

- Vendor → the company's network: PT makes it real
- Warehouse → store: PT (or transfer PT) makes the allocation real
- Office scope: approves the PT file
- The PT file is the fact everyone refers to.

One line: **PT is the truth event for stock entering or moving inside the network.**

The official receipt PT is the frozen baseline. Current stock quantity, location and value come from that baseline plus subsequent documents and applicable dated rules.

In the app, a PT is a **table** with document context and history. Download is an **Excel spreadsheet (`.xlsx`)**. Downloading a PT creates no stock event.

### 5.2 Reference Documents

- Operational agreement from the 2026-09-08/09 discussion: [pt-operational-agreement.md](./pt-operational-agreement.md)
- Generalized document: [canonical-pt-file.md](./canonical-pt-file.md)
- The historical KDPS workbook example is not required by this standalone package. Its columns and formulas are business configuration, not a fixed product-wide schema; the included canonical description states the binding meaning.

### 5.3 Configurable Canonical Structure

Settings define columns, labels, ordering, types, required fields, vocabularies, aliases, defaults and which values are supplied, selected, inherited, looked up or derived. They also define calculation dependencies, permitted overrides, rounding, currency and table/export visibility. An authorised user may select or prepare a versioned format while making a PT.

KDPS's example fields are season, brand, colour, gender, subcategory, type, item, fit, size, barcode, design, HSN, quantity, MRP, BASIC, P RATE, input tax, output tax, NAG, margin and optional suggested subcategory/type. Another business can configure a different presentation while retaining the essential identity, quantity/unit, location, origin, currency and valuation meaning.

Colour configuration may use **colour only**, **grade/tag only**, or **both**. Economy, Medium and Premium are examples of intentional substitute tags when colour is unavailable. Preserve their meaning without inventing colour or making a grade axis mandatory for all companies.

Calculation direction is configurable: supplied ticket MRP with derived purchase values, or supplied base with configured additions, margin and tax leading to a ticket price. Detailed commercial formulas remain deferred. An official PT freezes its inputs, results, format and rule versions; later configuration changes do not recalculate it.

### 5.4 Source, Context and History

At upload, record whether the canonical data was **converted from a brand PT** or **prepared without one from invoice and other vendor information**. Both use one stock workflow. Transfers are automatically derived from existing registered stock.

Link vendor, brand, optional sub-brand, GRN, invoice, booking, actual arrival site and commercial reference. Derive known context from the GRN rather than asking the uploader to re-enter it. Retain from/to sites, original receipt-line references, effective dates, currency and configuration versions where applicable.

A draft has an internal reference for flags and corrections. Approval automatically issues the official number and version. Retain creator, gate decisions, confirmer, inward actor, timestamps, before/after corrections, refusals, reversals and reissues. Once approved and inwarded, official content is immutable.

### 5.5 Opening Stock

At migration, opening-stock PTs record existing quantities, locations, identities and canonical PT values at the cutover date. They use the pinned profile's supplied BASIC, derived P RATE and frozen MRP/tax evidence, with no separate carrying-value rule. Retain older dates and provenance where available; unknown history stays unknown. This is not a fresh vendor delivery: do not invent a new GRN or duplicate historical purchases and vendor liabilities. Opening creates operational quantity, stock projection and cost-layer evidence only, with no owner/title classification or books entry. Reversal counters only those RetailsOps operational effects. Production migration and external-books reconciliation remain deferred. Subsequent stock movements use the same PT discipline.

### 5.6 Identity and Practical Traceability

QTY = 2 represents two accountable pieces; they may share one barcode. Track quantity by resolved identity, receipt origin and location, with relevant value and commercial references. Use reliable individual identifiers where available, without compulsory new tags on every piece.

When physically indistinguishable stock from multiple receipts is mixed, FIFO/document allocations retain valuation and record lineage. They do not prove which physical piece was selected. Preserve the best available identification without inventing certainty.

Barcode conflicts are flagged. A barcode against conflicting identities/descriptions needs context or confirmation at scan; never silently select or merge. Reviewed equivalences may be retained. Finer physical identification can be added later.

### 5.7 Later Value and Tax Events

The PT completes the initial stock baseline. Sales, transfers, returns, damage, holds, adjustments, price revisions and dated tax rules add subsequent facts. Original receipt values and tax evidence remain frozen.

Tax on a future transaction is calculated under its applicable dated rules, classification, value and jurisdiction, then frozen on that transaction. The original PT output-tax cell is not a permanent rate for all later sales. Keep receipt cost, carrying value, ticket MRP, selling price, transfer taxable value and settlement value explicitly labelled. Detailed commercial/tax calculations remain for the later discussion.

---

## 6. Receiving - One Shipment with Invoice and Stock

### 6.1 A. Store Delivery (common)

1. Goods + invoice land at store
2. Store operator uploads the invoice, records actual quantity and condition, compares against the invoice and any booking, and creates the GRN into receiving hold.
3. The warehouse person uploads the canonical PT against **that GRN and store**. The uploader's own workplace does not become the stock location.
4. After PT approval/inward, the store scans and accepts the goods into floor or backstore. Accepted, unheld good quantities become sellable.

### 6.2 B. Warehouse Delivery

1. Goods + invoice land at warehouse
2. Warehouse counts vs invoice → upload the invoice → create the GRN
3. Warehouse does the PT file conversion process so we'll call it **PT file operations**, which is **not included in Phase 1**.
4. In Phase 1 the warehouse person uploads the canonical PT file against the GRN and its actual arrival site; approval/inward establishes the stock baseline.
 This will be for **both branded and non-branded**, and for **both stock at the warehouse and stock at the store**.
5. Warehouse-held stock is scanned and put away into a named bin after the PT is official. Stock staying at a store needs no invented warehouse hop.

So once the PT file is final, the stock is true at any one of the sites.
Now the distribution can take place.

---

## 7. Movement Rule (the master rule)

**Rule:** stock only moves inside company with a **transfer**; stock only leaves to a vendor/brand with a **Return to Vendor** or **seasonal return**.

Every site transfer derives a transfer PT. Vendor returns and other stock events use their own numbered documents carrying the affected canonical stock references. Internal floor/backstore/bin moves are recorded location movements, not site transfers.

---

## 8. Distribution and Transfers

### 8.1 Stock Arrives at the Warehouse → Store

After PT file operations are completed and the PT file is approved:

- Warehouse allocates pieces per store.
- The system derives a transfer PT for the selected quantities and destination, retaining receipt origins and value evidence.
- Receiving store sees pending inward when the transfer is created → stock enters transit on dispatch → actual arrival and scan acceptance are recorded → accepted pieces go to floor or backstore and become **sellable**.
- Partial acceptance leaves the remaining quantities outstanding or under an explicit discrepancy. It does not falsely receive the whole transfer.
- This is how almost all stock received at the warehouse reaches the store to sellable.

The warehouse-side mechanics of this - putaway gated on the official PT, allocation from what actually arrived, re-split, pick / pack / scan out - are Sections 18.6 to 18.8.
Dispatch to a **partner** store is not this flow; it is a billed sale (Section 18.9).

### 8.2 Store → Store (own multi-brand stores only)

Own multi-brand stores only.
For some brands, stock has to be distributed to other stores: any store needs, slow-movers, seasonal swap.

- Source scans pieces → creates a transfer PT → source stock held → in-transit on actual dispatch.
- Destination sees pending inward before goods arrive → goods arrive → scans to accept.
- The transfer PT is derived for the selected stock and is the document the destination receives against. Required statutory documents are linked separately; missing e-way bill handling follows Section 8.3.
- Branded goods that landed at one store can also be redistributed this way.

### 8.3 Tax / Legal on Transfers

Tax is driven by the **tax registration on each site**, never by a place name in code.

- **Both sites on the same tax registration:** stock move only, no tax event.
- **Sites on different tax registrations:** the move is taxable as an inter-registration supply; the system **flags it**; a tax invoice and the statutory goods-movement document are required.
- The product follows whatever the transfer procedure legally requires in the configured jurisdiction.
- **But in the first version there is no in-app generation of the statutory goods-movement document. It is a manual process.**
- **But the internal documentation system must be robust.**

Which registrations exist, and which sites sit on which one, is master data.
The rule above is the product; the registration pairs are not.

**E-way bill policy agreed 2026-09-09:** the company can configure a check on every store/warehouse site transfer, within and across states. Under the agreed policy, absence flags **E-way bill not present** and does not block recording the transfer, dispatch or receipt. The exception stays visible to responsible staff until explicitly resolved. Later attachment/verification retains the fact and time of its earlier absence.

Physical status and documentation compliance are separate. A received transfer may still have an open documentation exception. Company policy and statutory applicability are separate facts; legal thresholds, exemptions and jurisdictions remain dated configuration. Recording the movement does not certify legal compliance. An attached reference and verified valid evidence are distinguishable.

### 8.4 Store → Warehouse

Same transfer machine as store → store.

Typical reasons:

- Free floor space / old stock back to warehouse.
- Defective / GR: every store sends quarantine stock to warehouse to consolidate.
- Seasonal swap (winter out / summer in).

Warehouse then either holds, re-splits to other stores, or returns to vendor.

### 8.5 Splits and Event Times

For a receipt of 10 shirts, 10 pants and 10 T-shirts, sending five of each derives a transfer PT for 15 pieces. The original receipt PT stays at 30; documents calculate the remainder. Every destination transfer preserves its source references. Transfers from multiple receipts retain their separate cost origins, even when a table groups rows. Do not apply purchase markup again at each hop.

The location history branches as stock splits and supports returns and repeated visits. Destination numbers can be a display, but never replace the original arrival site or the actual movement chain.

Record creation, approval/reservation, dispatch, physical arrival, scan acceptance and putaway independently. Electronic visibility is immediate on creation; physical transit starts on dispatch. Late entry retains both actual event time and recording time.

---

## 9. Returns to Vendor (Not a Transfer)

Not a transfer.
Two return types, plus debit notes.

### 9.1 Defective / GR (bad stock)

- Quarantine first.
- Document: **RTV** (credit or replacement).
- Vendor (the supplier) can pick up from the store.
- Item move from store → warehouse (transfer) → one RTV from warehouse.
- Replacement comes back as inbound, linked to the RTV (condition).
- Excess/unordered: return or debit note vs vendor ledger. Conditional. This is also conditional.

### 9.2 Seasonal Return (good unsold stock)

Commercial allowances and eligibility below are the earlier baseline pending the separate commercial discussion. For already company-owned stock, support/return-right expiry changes commercial status (V stock), not ownership; do not apply the earlier conversion wording as an automatic owner change.

- Separate from defective. Bulk by brand + season.
- Depends on the commercial model (example for SOR or consignment): all unsold back, no cap.
- **Correction model:** return only within the configured allowance; over-cap does not go back as a return.
 The allowance is a **cap ladder configured per brand** (a stepped percentage such as 25 / 18 / 10 across the window is a typical shape, not a product constant).
 Items that could not be returned inside the return window are **converted to company-owned**.
- **Outright / BNS:** no return.
- Same physical routes as GR: from store, and others via warehouse.

### 9.3 Agent's Role in Returns

Agent (**non-branded only**): sits on payment, shipment, and defect/quantity fixes.
Not a location, but the **chase contact** until goods are verified or returned.

---

## 10. Customer → Store (Returns and Exchange)

Customer to store is also another condition.
Can be for exchange and return, or for defective goods.

We need to keep one more thing **configurable from the admin**.

**Condition 1 (return allowed):**
Suppose there is a process for the customer to return or exchange an item.
One condition will be that the customer can return or exchange.
On exchange they will have to buy the goods for the particular amount they want to exchange.
If they want to return it they will get the money.

**Condition 2 (no money back):**
After a customer has bought an item, the money will not be returned.
The customer can exchange it and buy something else, but it should be equivalent to or more than the amount of the thing they are returning.

**This thing should be configurable.**

The till-level behaviour for these policies (windows, overrides, where the returned piece goes, cross-store returns) is in Section 17.2.

---

## 11. Allowed Hops (closed list)

**No other hops.**

- Warehouse and stores move stock among themselves by transfer.
- Warehouse and store both can send the stock back to the vendor as a return.
- Goods can move from store to warehouse and warehouse to return.
- All these conditions.

---

## 12. Commercial Model

**Discussion deferred, 2026-09-09.** All network goods use one operational stock pool and the same receiving, counting, transfer and selling workflow. Contractual ownership, accounting and supplier settlement remain separate commercial questions. The detailed rules below are retained as the earlier baseline for review, not finalised by the operational agreement. That review must cover SOR, buy and sell, correction, consignment and other documented variants, including outright terminology.

Booking's starting agreement remains linked to received stock. Later offers, allowances and credit notes are dated records without rewriting the receipt PT. For already company-owned stock, V stock describes a commercial-status change, not a new brand or automatic ownership change.

### 12.1 Definition

A commercial model is the **dealing contract** between the retailer and a brand (or vendor/supplier): who owns the goods, when title transfers, what the retailer owes the vendor, and whether unsold stock can come back.

### 12.2 How It Binds

It is **master data** with a default per **brand × vendor × period**.

Every booking carries one model.

The default can be overridden at booking (or at receipt if there is no booking); after that it is **frozen** on that document.

The purchase lifecycle stays the same.
Only ownership, payment, returns, and accounting change.

### 12.3 Stock Owner Field

Every stock line carries a **stock owner: retailer or brand**.

That field is the source of truth.

The commercial model sets the **default owner at receipt**; it does not get rewritten later by a special flip event.

Owner changes only when a real event says so (sale, return, or an explicit ownership transfer document).

### 12.4 Booking-less Arrivals

Booking-less arrivals use the **brand's current terms**.

If a booking is attached later, that is a **dated correction**, not a silent rewrite of history.

### 12.5 The Four Models

The four names below are **labels**.
What is stored is **ownership, return terms, and whether rolling top-up is allowed**.

**1. Outright**

- Title moves to the retailer at receipt.
- Stock owner = **retailer**.
- Value is **on-book**.
- The retailer pays the agreed purchase (full cost, or MRP minus a negotiated margin) at inward.
- The retailer owns markdowns and shrinkage.
- Unsold stock is theirs.
- **No return right.**

**2. Margin and capped return (Correction)**

- Same as outright on title and on-book inventory.
- Stock owner = **retailer**.
- Two extra rules:
 - Margin that can change by **price state** (full price vs markdown/EOSS).
 - A **return ceiling** as a percentage of delivered value or quantity.
- Returns are allowed only within that quota and window.
- Payment at inward, as outright.

**3. Sale or return (SOR)**

- Title stays with the brand.
- Stock owner = **brand**.
- Quantity is counted; **value stays off the retailer's books until sale**.
- All unsold may go back, **uncapped**, within the agreed window.
- To get more stock, the retailer raises a **new booking**.
- The retailer owes the vendor **on sale**, not at receipt.

**4. Consignment**

- Same ownership and books as SOR: stock owner = brand; qty counted; value off-book until sale; pay on sale; unsold returns uncapped.
- **Difference: rolling top-up** - the brand replenishes **without a fresh booking** each time.

### 12.6 What the Model Does Not Cover

Concession / exclusive brand-run space (the brand operates its own stock inside the store, retailer takes a fee or commission, no purchase) sits **outside this purchase flow**.

Those locations **do not take a booking commercial model**.

### 12.7 What Changes by Model

Return windows and chase dates live next to the model.

Over-quota **retailer-owned** returns are **flagged, not blocked**.

**Brand-owned** stock that is not returned remains brand-owned until it sells or is sent back.

---

## 13. Phase 1 Lock (RetailsOps)

### 13.1 Org

One legal entity.
One country (whichever the adopting chain operates in; multi-country is not in Phase 1).
Geo: country → state → city → site.

Site types are **final**.

**EBO is out of scope for now** (brand's software, not ours).

**Concession / brand-run space stays outside this purchase flow.**

### 13.2 Warehouse Linkage

Every multi-brand outlet is **linked to a warehouse**.

That warehouse is the **default hub** for:

- inbound split
- store replenishment
- quarantine consolidation
- vendor return from the network

### 13.3 Sellable Rule

A piece is sellable at a store **only after its PT is official at that site and it is physically scanned and accepted there**, subject to holds and condition.

Floor and backstore are **locations**, not a second quality of stock.

Once the official-PT and acceptance conditions hold, stock on the floor and stock in the backstore are **both sellable**, unless held or quarantined.

### 13.4 Booking = Intent

Booking is intent: how much quantity is coming into the network (vendor + brand + season; lines = style + size + qty).

Style code and quantity are mandatory; omitted size becomes Free Size. One booking may receive several deliveries, with the outstanding balance preserved until received or explicitly closed short.

Colour and the rest of identity are **not true yet**.

### 13.5 GRN = Physical Count

GRN is the physical count (invoice uploaded; counted vs invoice).

- A GRN may have **no booking**.
- A booking may be **attached later**.
- Receiving into the network **without a booking is allowed**.
- **Non-branded booking is not in this phase**; non-branded stock still enters by **GRN + canonical PT upload**.

### 13.6 PT Confirm = Truth Event

PT confirm is the truth event: **identity, barcode, price, tax, qty**.

After office/warehouse confirm, and the file is inverted into the system, the stock is **true at that site**.

Booking qty is the plan; **PT is what the system believes**.

### 13.7 Match (lock at PT confirm)

| Document | What it represents |
| :--- | :--- |
| Booking (if any) | ordered qty into the network |
| GRN | what landed |
| Canonical PT (confirmed) | what is identified and valued |

At PT confirm, compare the records; approval does not imply agreement where a discrepancy exists. Keep booking versus cumulative receipts, invoice versus count, and GRN versus PT as separate comparisons with visible exceptions.

Split shipments are normal separate receipts, not corrections to the original booking. A late booking attachment is a dated link and does not silently rewrite earlier records.

### 13.8 Scan Is the Last Gate

**Scan at store is the last gate to sellable.**

PT can be true at warehouse while pieces are still **not sellable** at the destination store until that store scans them.

### 13.9 Floor ↔ Backstore

Moving floor ↔ backstore is a **location change inside the same store**.

It is **not a site transfer**.

Site transfer still needs a **transfer + transfer PT** (statutory goods-movement document remains manual in this version).

---

## 14. Stock Bins at a Store

A piece at a store sits in **one bin**:

| Bin | Sellable? | Next hop |
| :--- | :--- | :--- |
| **Receiving hold** | No | Official PT, then scan acceptance and putaway |
| **Floor** | Yes (after scan) | Sale, or move to backstore / quarantine |
| **Backstore** | Yes (after scan) | Sale, or move to floor / quarantine |
| **Quarantine** | No | Transfer to the linked warehouse |
| **Return-to-vendor** | No | RTV from store, or transfer to warehouse then one RTV |

**In-transit** remains a virtual site during a transfer.

**Damage / sample / e-comm reserve** stay as virtual sites; **not designed in this pass**.

Read this with Section 22: damaged goods *are* handled in this pass, through the store's **quarantine** bin and **RTV-hold**.
What is not designed is the dedicated damage / sample / e-comm reserve virtual-site model.

---

## 15. Who Approves a PT

Personas are tied to **office, warehouse, and/or store**.

One person can be tied to **many sites**.

PT approval is an **admin-configurable permission**: office, warehouse, or both.

**Store-only personas do not approve PT files unless admin grants it.**

The named warehouse and brand-side personas that sit under this rule are listed in Section 18.0.
The Brand Manager's write boundary is Section 19.1.
The office queue, the confirm gates, and the exception inbox are Section 20.

---

## 16. Already Discussed (do not reopen)

Goods path, this pass.
The full closed-sitting register, including store operations, warehouse operations, Brand Manager permissions, office operations, and vendor and ledger, is **Section 24**.

1. Org / sites / goods types / parties / commercial model
2. Branded booking
3. Receiving (store + warehouse, booking optional)
4. Documentation (canonical PT upload + confirm; conversion engine later)
5. Transfers (warehouse→store, store→store, store→warehouse)
6. Sellable at store (scan; floor + backstore)
7. RTV vs seasonal return (rules named; full documents later with vendor ledger)
8. Customer return/exchange policy flags (till flow sits in store ops)
9. Office operations (masters, PT confirm queue, goods-path exceptions; buying calendar parked) - Section 20
10. Vendor and ledger (when the company owes, vendor and partner books, RTV as money, freeze) - Section 21

---

## 17. Store Operations

Store operations - one consolidated list.

### 17.1 Till / POS Bill

- Scan barcode, add line, change qty (rescan or edit).
- Look up article if the scan fails.
- Salesman on the line (who sold it, not who is logged into the till).
- Offers apply themselves: value slabs, B2G1 (cheapest free), gift above a spend, brand then store then bank.
 Skip no-discount styles.
- Manual discount only up to an HO cap.
 A PIN cannot lift that cap.
- Hold / park a bill.
 Retrieve it.
 Reprice if offers or MRP changed.
 Keep or drop held bills at day end.
- Split payment on one bill: the configured tender modes (cash, card, and instant digital transfer at minimum) must together equal the net.
 Tender modes are master data, so a chain can add or retire one without a code change.
 Cash can be tendered over; show change.
 Cash posted is the tender, not the notes in the drawer.
- Round off to the nearest whole currency unit.
- Tax calculated for the transaction using its applicable dated tax rules, classification and taxable value. Preserve the applied rule and result; do not blindly reuse the receipt PT's output-tax cell.
 Optional customer name, mobile, and tax registration number.
 A business customer's tax registration switches the bill between **same-registration and inter-registration** treatment.
 Wrong tax is flagged, not blocked.
- Gift SKU: prompt the cashier to scan it.
- Save and print.
 Bill number is gap-free on that till.
 Posted bill cannot be edited; reprint only.
 Undo is only before print.
- Find a bill by name, phone, or number.
- Offline: keep billing if the line is down; sync later with an idempotent id.
 Paper re-entry if the till dies.
 Handover so a new machine continues the same number series.
- Cashier never sees cost or margin.
- **No statutory e-invoice registration at the counter.**
 Business-customer e-invoicing sits in a head-office queue.
- Sell only after the official PT and site scan-acceptance conditions hold. Do not invent a barcode or sell from receiving hold.

### 17.2 Customer Return / Exchange (till flow)

- Return or exchange against the original bill.
- Refund is what was paid, not today's MRP.
- Two commercial policies: **chain default** (return ~30 days, exchange ~45) and **deep discount, exchange only** (≥50% off: no return, short exchange window).
 Hygiene (innerwear etc.): neither.
- Good piece back to the floor.
 Damaged piece to quarantine.
- Reasons: size, fit, colour, defect, changed mind, gift.
- Late return needs a manager override.
- No cash refund at the counter unless policy says otherwise; store credit / exchange is the default.
- Cross-store return is a special case (tax and stock), not a casual till action.

These sit alongside the two admin-configurable refund policies named in Section 10.
Section 10 is the policy switch; this is the till behaviour.

### 17.3 Store Day (open, till, cash, shift)

- Open the store: opening float in the drawer, price list and live offers acknowledged, till series open.
- Shift: one person, one counter, one drawer.
- During the day: take tenders; optional mid-shift cash pickup.
- Close the shift: cashier declares cash **blind**; system shows expected (float + cash bills); variance needs a reason.
- Daily cash summary by tender mode.
- End of trading day: lock the date, expire or keep held bills, list holes in numbering, list uncosted sales, list exceptions.
- Deposit the cash; later match non-cash tender settlement to the bank.
 That 3-way check is store duty plus accounts, not a till button.

### 17.4 Stock on the Floor

- Stock on hand, always labelled (on-hand vs available-to-sell).
- Floor vs backstore as two places.
 Move is a document, not a quiet qty edit.
- "Who has this size" in other stores; raise a stock request / indent.
- Quarantine for damaged goods (customer return or inbound damage).
 Not sellable.
- RTV-hold: piece reserved for return-to-brand, off the selling floor, still on the books until the RTV goes.
- Blind stocktake (phone scan).
 Count by whole store, brand, or section.
 Unscanned on a whole-store count = missing.
 Apply variance as an adjustment (shrink / found / damage), never a silent rewrite.
- Negative stock and count exceptions sit in a queue until someone owns them.

### 17.5 Pending Inward (goods arriving at the store)

- See what is in transit to this store.
- Scan-to-accept at the door (transfer or vendor carton).
- Good pieces: choose floor or backstore (putaway).
- Damaged pieces: quarantine.
- Extra / short / wrong article: exception, do not hide it.
- Vendor GRN at the store is quantity first; value waits for the PT / invoice path.

### 17.6 Reports the Store Should Be Able to Pull

- **Sales:** today / period, bill count, pieces, value, average bill, by salesman, by tender, by brand / category.
- **Daily cash / Z:** float, takings by tender mode, variance, deposit.
- **Stock on hand:** by SKU (style × size × colour), brand, location (floor / backstore / quarantine / in-transit).
- **In-transit / pending inward.**
- **Stocktake variance and shrinkage.**
- **Ageing, dead stock, fast movers, cover, stock-out.**
- **Exceptions:** bill holes, tax mismatch, sold-before-cost, late returns, negative SOH.
- **Target vs actual** (day / month).
- **Override rate** (manual discounts, late returns).

### 17.7 What Is *Not* a Store Operation

Buying at HO, brand PT mapping, the external accounting / statutory package, payroll/attendance (unless you later put a punch on the store home), consumer app / endless aisle, and intelligence scorecards.

Those sit next to the store; they are not the store running.

---

## 18. Warehouse Operations

Warehouse operations are the **physical spine** from carton-on-dock to stock sitting in a bin or on a truck.

Selling, ageing dashboards, and the PT conversion engine are **out** of this list.

A note on the shape of this section: the Brand Manager is **not** warehouse staff.
They sit in the store organisation, own a set of brands across every site (stores **and** warehouse), and touch PT, allocation advice, returns, and invoice-inward tracking.
**Warehouse executes the goods. Brand Manager owns the brand.**
The Brand Manager's own list is Section 19.

### 18.0 Personas This List Assumes

| Persona | Habitat | Does |
| :--- | :--- | :--- |
| **Warehouse receiver** | Dock | Count, GRN, scan returns in |
| **Warehouse PT clerk** | Warehouse desk | Canonical PT upload/confirm, barcode/tag untagged goods |
| **Warehouse picker** | Floor / bins | Putaway, pick, pack, scan out |
| **Warehouse returns clerk** | Quarantine | Hold, consolidate, RTV |
| **Brand Manager** | Store org, brand-scoped | PT for their brands, inward tracker, advise splits and IBT, chase defective/CN with the brand. Never dock count, pick, or partner billing. |
| **Store operator** | Own store | Count a store arrival, scan a transfer in, send returns to warehouse |
| **Partner store** | Partner site | Receive billed stock, return unsold by billing it back |
| **Head office / finance** | Gates and money | Inward value, tax invoice to partner, vendor payable. Not on the dock. |

These personas sit under the rule in Section 15: personas are tied to office / warehouse / store, one person can be tied to many sites, and PT approval is an admin-configurable permission.

### 18.1 Out of Warehouse Scope

- Ageing reports, sell-through, season-end prediction, brand dashboards.
- Conversion engine, unmapped-format contracts, AI invoice reading (later).
- Detailed transport and statutory-document generation. The transfer still records dispatch/receipt times and missing e-way bill exceptions under Section 8.3.
- Chasing vendor or partner money - finance owns the chase; warehouse only **stamps the edge**.
- POS sale, offer, EOSS.
- Inventing a phantom booking so a receipt can exist.

### 18.2 Site and Stock Facts

1. A warehouse is a site that **holds stock and does not sell to customers**.
2. It serves a configured set of **linked own stores**.
 Allocation is only to that set, plus partner stores when a partner dispatch is raised.
3. **Arrival site and selling site are independent.**
 Goods may land at warehouse or at a store.
4. Stock is tracked by resolved identity, receipt origin and location, with quantity under the barcode. Colour and substitute tags follow the configured structure (Section 5.3).
 No compulsory per-piece serialisation. Use individual identifiers where available; otherwise retain quantity and document lineage without claiming exact physical-piece certainty (Section 5.6).
5. Every quantity change is a **numbered document**.
 No silent edit of a posted document.
 Correction is a **counter-document**.
6. Every stock number on screen is **labelled** (on hand / available / reserved / in transit / quarantine / damaged).
7. Inside the warehouse: **site → zone → bin**.
 Putaway and pick are **against a bin**.

### 18.3 Receive on the Dock (GRN vs Invoice)

8. Goods + invoice land.
 The dock counts **against the invoice**, and against the booking if one exists.
9. GRN records **quantity and condition only**.
 It does **not** post value, tax, margin, or vendor payable.
10. GRN posts quantity **at the arrival site**, so the goods exist before pricing is finished.
11. Count grain is **style + size** at minimum.
 Missing size is **Free Size**.
 Scan is the primary input; typed entry remains.
12. **Booking present:** screen pre-fills expected style, size, qty.
 **Booking absent:** simple receipt of what came in.
 **Never invent a booking.**
13. One booking may have **many GRNs**.
 Compare cumulative receipts with the **balance still outstanding**, not the original order qty for each delivery. Normal partial fulfilment is separate from an invoice-versus-count discrepancy.
14. **Over-receipt is allowed** with a required remark.
 Shortage and extra are flagged with a remark; the flow continues.
15. Damage at arrival is **optional, never blocks the count**.
 Damaged pieces go to quarantine and are not sellable.
16. Wrong article and rejected qty each raise a **typed exception with an owner**.
 They do not sit as unvalued inventory.
17. **Two names on every GRN**, from logins: who counted, who entered.
 On a warehouse arrival they are often the same person.
 On a store arrival the **store counted** and the **warehouse (or Brand Manager) entered**.
18. A wrong GRN is reversed by a **counter-GRN**.
 No silent rewrite.
19. Invoice, GRN, and PT **must later agree**.
 Until they do, the gap is an **open exception**.
 It does not block the count. Selling still requires official PT and site scan acceptance; discrepancies remain visible under the configured policy.

### 18.4 Canonical PT - Upload and Confirm (Happy Path Only)

20. After the GRN, the warehouse (or Brand Manager for their brands) attaches **one canonical PT** to that GRN.
 The stock location is the GRN's arrival site, not the uploader's workplace. Record the preparation source and link known context as in Section 5.4.
21. Happy path: **upload a file that is already in the canonical shape**, or **confirm a PT the operator filled**.
 No conversion engine in this slice.
22. A file that does not match the **selected configured canonical format is refused as a whole**.
 Nothing partial posts.
 Unmapped formats wait for the engine.
23. **One GRN has exactly one receipt PT.**
24. PT is a **stored document** (draft → official → reversed), not a throwaway import.
 In-app presentation is a table; download is Excel (`.xlsx`). A draft has an internal reference; approval assigns the official number/version. Format and calculation-rule versions are retained.
25. Required fields must be present before publish.
 A blank required column **blocks publish of the PT**; it **never blocks the physical count**.
26. **Inward** (making the PT official) is a **named human action**.
 Configurable gates.
 Warehouse may be a check gate; **value posts only at the inward gate**.
27. **Cost must be ≤ MRP.**
 Season must be a real season.
 Blank cost or blank MRP is a **refusal, never a zero**.
 Everything else flags and continues.
28. **Vendor barcode is kept.**
 Branded goods are **not re-barcoded** on the happy path.
29. Posted PT is **never silently edited**.
 Correction is **reverse and reissue**.
 Draft corrections preserve before/after values and require review of relevant changes. Decisions, refusals, inward, reversal and reissue retain actor, time and reason.

### 18.5 Barcode and Tagging (Untagged / Non-brand Goods)

30. A shipment is **branded** only when all three hold: **invoice**, **vendor/brand barcode on every item**, **retrievable vendor PT**.
 Missing any one keeps it on the **untagged path**.
31. **Untagged path:** warehouse builds the PT from invoice / vendor file / typed entry, then **generates one barcode per identity** and prints tags.
32. Generate a barcode for the resolved identity, shared by interchangeable pieces; omitted size is Free Size. Identity and colour/tag treatment follow the configured structure, without compulsory per-piece tags.
33. A confirmed repeat identity **reuses the existing identity** and adds receipt quantity while preserving the new receipt origin.
 Flag conflicting barcode/description combinations; use context or confirmation and never silently merge. Retain reviewed equivalences.
34. Warehouse fills the barcode column, prints, and **physically tags before putaway**.
35. MRP on untagged goods: from the **vendor file** if present; else from the **tag**; else from the **standing formula** (base + transport % + tax + margin band), which is configured, not hardcoded.
 **Tag MRP is never overwritten.**
36. **Brand Manager does not barcode untagged goods.**
 That knowledge lives at the warehouse.

### 18.6 Putaway - Only After the PT Is True

37. Quantity may sit on the **dock / receiving hold** after GRN.
 It is **not put away to a pickable bin** until the receipt PT is **official**.
38. Putaway is a **document**: from receiving hold → named bin.
 Scan of **barcode + bin**.
39. Until putaway, the piece is **not available to allocate or pick**.
40. A store-arrival that **stays at that store** needs **no warehouse putaway**.
 Warehouse putaway is for warehouse-held stock.

### 18.7 Allocate to Linked Own Stores

41. Split happens **after inward**, from **what actually arrived**, never from the original order.
42. Allocation rows: **style + size, destination site, quantity**, tied to the **shipment, brand, season**.
 The input used (usually each store's past-sales share) is **stored with the decision**.
43. **Allocated qty cannot exceed the remaining inwarded quantity available to allocate**, excluding existing holds and unavailable stock.
44. Destinations are the warehouse's **linked own stores**.
 A destination outside that set is a **partner dispatch** (Section 18.9), not this allocation.
45. One inwarded receipt PT produces **N transfer PTs**, one per destination that is **not** the arrival site.
 Stock that stays at the arrival site uses the **receipt PT itself**.
 **No fake warehouse hop.**
46. Brand Manager may **propose** a split for their brands.
 Warehouse (or the configured approver) **posts** it.
47. **Re-split:** an **unshipped** allocation may be revised.
 Qty already **picked or shipped cannot be silently moved**; that needs a new transfer or a reverse.

### 18.8 Pick / Pack / Scan for Transfer (Warehouse → Own Store)

48. **Any site-to-site move produces a PT** (warehouse→store, store→store, store→warehouse, warehouse→warehouse).
 Derive it from the selected source quantities and preserve original receipt references. Apply Section 8.3's e-way bill check within and across states.
49. Transfer is **raised in the system first**.
 Destination sees **pending inward before the goods arrive**.
 Sending stock is **held and not available the moment the transfer is posted**.
50. Warehouse flow: **pick against the transfer PT** (scan from bin) → **pack** → **scan out / ship**.
 **In-transit is a real stock state.**
 Creation, approval, dispatch, arrival, scan acceptance and putaway have independent timestamps. Electronic visibility does not mean physical dispatch.
51. Destination **scans in, line by line, against the same PT**.
 Short / excess / damaged are **typed exception rows**, valued at **receipt-time book value**, never free text.
 Record partial acceptance and leave remaining quantities outstanding or explicitly resolved. A missing e-way bill remains a separate documentation exception.
52. **Quantity and cost move together.**
 Dispatch **consumes the sender's layers**; receipt **opens layers at the destination** with the PT's cost, MRP, and season.
 Preserve each contributing receipt/cost origin and do not apply purchase markup again at each hop. The original PT remains unchanged.
53. **Selling requires official PT and physical scan acceptance at the destination.**
 Accepted quantities can become available without pretending every piece in the transfer has arrived; receiving-hold, damaged and held quantities remain unavailable.
54. **Push from warehouse is the default.**
 Store indent exists as a **request**; shipping still requires the configured approval.
 Warehouse must **not** ship a draft nobody approved.

### 18.9 Warehouse → Partner Stores (This Is Billing, Not a Stock Gift)

55. A **partner store is a different site type** from an own store.
 Stock leaving the warehouse to a partner is a **sale at purchase price (P RATE / PP)**, **not** an internal transfer at book value.
56. That dispatch raises a **tax invoice**.
 Tax (same-registration vs inter-registration) follows the **partner site's tax registration vs the warehouse tax registration**.
 **Legal entity, tax registration, and site stay three separate dimensions.**
57. Partner price list is **PP**.
 Not MRP, not MRP-minus-a-margin, unless a later commercial override is configured **per brand**.
58. Partner may buy **on credit**.
 The warehouse does **not** chase the money.
 The document must still **stamp the payable/receivable edge** for finance.
59. **Partner isolation:** a partner sees only their own slice.
 A missed scope returns **nothing, not everything**.
60. **Partner returns:** they send unsold back and **bill the company like a normal GR**.
 Warehouse counts that inbound as a **receipt against their return invoice** (same GRN discipline as a vendor).
 Stock comes back onto warehouse books; the money edge is a **purchase-return / credit against the partner**, not a silent reverse of the original dispatch.

### 18.10 Returns from Own Stores (Count and Scan)

61. Defective or unsold stock returning from an own store arrives as a **transfer into the warehouse**.
 Warehouse **counts and scans it in**.
 This is scan-receive of store returns, **not** a full warehouse stocktake and **not** ageing.
62. **Good stock** returning for redistribution goes to **available bins** after receive.
63. **Defective stock** goes to **quarantine** on receive.
 It is **not available to allocate**.
64. Some brands are **collected by the brand from the store directly**.
 Those do **not** pass through the warehouse.
 Everything else **consolidates at the warehouse**, then **one RTV leaves from here**.
65. **Seasonal / windowed returns** (unsold going back to the brand) are **bulk, good stock, no quarantine**.
 Warehouse executes the **gather and the outbound RTV**.
 **Brand Manager owns the deadline and the brand conversation.**

### 18.11 Hold, Re-split, Quarantine, Consolidate, RTV

66. **Hold:** reserved / blocked stock **cannot be sold, allocated, or picked** until the holding document releases it.
67. **Re-split:** see rule 47.
 Remaining **unshipped** qty on an inwarded receipt can be reallocated.
 **Shipped qty cannot.**
68. **Quarantine:** **one pool** at the warehouse.
 Sources: dock damage, store defective returns, QC reject.
 **Not ATS** (not available to sell).
69. **Consolidate:** many store defect tickets for one brand become **one RTV from the warehouse**.
 The store→warehouse legs are **transfers**; the warehouse→brand leg is the **RTV**.
70. **RTV** is a **document** (credit or replacement), **reason-coded**, raised from **quarantine** or from a **seasonal-return list**.
 **Owned stock** tracks the **credit due**.
 **Brand-owned stock** is a **quantity return** - no payable invented at the warehouse.
71. **Brand replacement** against an RTV comes back as **inbound, linked to that RTV**.
72. **Warehouse does not write off by themselves.**
 Damage confirm into quarantine is **two-person**: store reports, warehouse confirms - or receiver flags, a second person confirms.

### 18.12 Location Path

73. For any SKU at a place, the system answers the **path**: which **vendor invoice**, which **GRN**, which **PT**, which **allocation**, which **transfer**, which **bin**, which **return**, which **RTV**.
 The chain branches when quantities split and preserves origin through repeated visits. For indistinguishable pieces, report quantity/document lineage rather than asserting exact physical-piece identification.
74. This is the **movement document chain**, **not an ageing report**.
 Age buckets are not a warehouse requirement.

### 18.13 Vendor and Partner Money Edges (Stamp, Don't Chase)

75. **Warehouse never types a payable amount.**
 Money is a **consequence of documents they already raise**.
76. Edges the warehouse must leave **complete enough for finance**:
 - **Invoice vs GRN qty** (short / excess / wrong article)
 - **PT inward** (value, tax, vendor liability - posted **at inward, not at GRN**)
 - **Partner dispatch** at PP + tax invoice
 - **Partner return GR** (they bill the company; the company receives)
 - **RTV** credit / replacement
77. **Commercial model snapshotted at booking or receipt** decides what inward does to vendor liability (owned vs not-owned).
 Warehouse does **not** choose this ad hoc on the dock, except the configured override on a **booking-less receipt**.
 This is the same freeze rule as Section 12.2 and 12.4.
78. **Who chases** vendor or partner money is **finance / Brand Manager** (claims, CN), **not the dock**.

### 18.14 Non-requirements (Locked from the Warehouse)

86. Warehouse does **not** need stock-ageing reports, brand performance, L2L, or season-end prediction.
 Those belong to **Brand Manager / head office**.
87. Warehouse does **not** need the **conversion engine** in this slice.
88. Warehouse does **not** need a **full-building cycle count** as a day-one requirement.
 They need **scan-receive of store returns** and **scan-receive of vendor arrivals**.

*(Rule numbers 79-85 are the Brand Manager block and are kept in Section 19 so the source numbering is not lost.)*

### 18.15 Open Item from the Business

**Partner tax-registration list and the exact partner roster are still outstanding from the business.**

The requirement does **not** wait on the names: **every partner site carries a tax registration, and tax follows that**.

---

## 19. Brand Manager - Adjacent, Not Warehouse

The Brand Manager is **not** warehouse staff.
They sit in the **store organisation**, own a **set of brands across every site** (stores **and** warehouse), and touch **PT, allocation advice, returns, and invoice-inward tracking**.

**Warehouse executes the goods. Brand Manager owns the brand.**

79. **Scope: their brands only, every store and the warehouse.**
 Other brands' stock, margin, and PT are **hidden**.
80. They may **make or confirm a PT** for their brands (branded happy path).
 They maintain the **tracker that every invoice for their brands was inwarded**.
81. They see **warehouse on-hand of their brands** the same way they see store on-hand.
 They do **not** need warehouse ageing.
82. They **propose** store splits, IBT, and "send this to warehouse / pull from warehouse".
 **Warehouse or the configured approver posts the transfer.**
83. They **plan and chase** defective return, stock correction, overstock, and credit notes **with the brand**.
 **Warehouse consolidates and ships the RTV.**
84. They **verify margin and CN pendency**.
 They do **not** approve partner tax invoices and they do **not** count the dock.
85. **Cross-store stock request may consult them.**
 They are **not the transfer actor**: **stores request, warehouse executes, a named approver signs.**

### 19.1 Write Boundary in One Line

| Action | Brand Manager | Warehouse | Named approver / finance |
| :--- | :--- | :--- | :--- |
| Dock count / GRN | No | Yes | No |
| Canonical PT for their brands | Yes (make or confirm) | Yes | Inward gate is configurable (Section 18.4, rule 26) |
| Barcode / tag untagged goods | No | Yes | No |
| Propose allocation split / IBT | Yes | - | - |
| Post the transfer | No | Yes | Approval per config |
| Pick / pack / scan out | No | Yes | No |
| Partner tax invoice | No | Raises the dispatch document | Finance owns value and the chase |
| RTV: plan and chase with the brand | Yes | Consolidates and ships | Credit lands in the vendor ledger (Section 21) |
| Ageing / brand performance | Yes (theirs) | Not needed | Head office |

---

## 20. Office Operations

Office is **stewardship of facts and queues**, not the dock and not the till.

Office owns masters, the PT confirm queue, and the goods-path exception inbox.
Warehouse executes the goods (Section 18).
Store runs the till (Section 17).
Section 15 decides who may confirm a PT.

### 20.1 What Office Is Not

- Dock count, putaway, pick, barcode print (warehouse, Section 18)
- Till, shift, SOH count (store, Section 17)
- Vendor ledger, payments, the chain's accounting package, tax filing, statutory goods-movement generation (finance)
- Offers / EOSS planning screens (offers)
- Brand Manager daily sales chase, L2L, season-end prediction (intelligence / brand desk)
- HRMS, audit module
- A merch / buying planner (open-to-buy, buying windows, appointments)

Brand Manager is **adjacent**, same as in warehouse (Section 19).
They may sit on the PT queue **for their brands** if admin gives them an office (or warehouse) link.
They do not own the vendor / site master.

### 20.2 Personas

| Persona | Habitat | Does |
| :--- | :--- | :--- |
| **Data steward** | Office | Masters, vocab, season open/close, merges |
| **Buyer / planner** | Office | Bookings, late booking-attach, short/excess vs plan |
| **PT confirmer** | Office and/or warehouse (Section 15) | Confirm canonical PT; that is the truth event |
| **Receiver** | Warehouse / store door | Count. Does not confirm PT unless also granted |
| **Store-only** | Store | Never confirms PT unless admin also links them to office or warehouse |
| **Admin** | Office | Who may confirm PT; site links; which habitat owns each exception |

One person can be linked to **many sites**.
HQ and Regional Office are both **office sites**.
Same screens.
Scope is which sites they are linked to.
Do not fork a second Regional Office product.

### 20.3 Masters

1. Office owns the facts other people pick: vendor, brand, (optional) sub-brand, site, season, vocabularies.
2. Party chain is **vendor → brand → sub-brand**.
 Sub-brand is optional.
 If unused, brand is enough.
 Do not invent a third party type.
 This is the same hierarchy as Section 3.
3. Brand carries the two-axis commercial model (who owns the stock × return terms).
 Friendly labels (Outright / SOR / …) are derived.
 This is the same freeze as Section 12: labels over ownership, return terms, and rolling top-up.
4. Site is a place with a type (office / DC / RDC / store kinds).
 Every own multi-brand store names its **linked warehouse**.
 **Tax registration lives on the site** (or the tax-registration master the site points at), not as a synonym for legal entity.
 Legal entity, tax registration, and site stay three separate dimensions (same as Section 18.9, rule 56).
5. Vocabularies are **governed lists**: season family, colour, size systems, gender, fit, category / type / item, tax class.
 PT and booking may only pick from these.
 A new value from a file goes to a **review queue**, not silently into the master.
6. Season is a **house calendar**, not twelve free-text codes.
 Lifecycle: **Open → EOSS / markdown → Closed**.
 Warehouse and store **pick** Open seasons.
 They do not invent one.
 Open and close are **logged office acts**.
 Halves exist if the tenant uses a two-season year.
 Margin bands are data on the season, not a planner.
7. Brand season labels (a season code, blank, or a date) **map into** the house season.
 Mapping is office / master-data work.
8. Master writes are **dated**.
 A posted transaction keeps the snapshot it used.
 Correcting a master does not rewrite history.
9. Duplicate vendor / brand **merge** is a logged office action with a surviving record.
 Ledger and open documents re-point.
 No silent delete.
10. Dangerous changes (tax registration, bank, commercial model) need a **second eye**.
 Ordinary vocab adds can be one steward.
11. Operators never use engineer-admin as the product path.
 Every create / edit / list above is a **first-party screen**.

**Sub-brand** is an optional master, not a Phase 1 blocker.

The PT format itself is versioned business configuration (Section 5.3), including supplied/derived fields, formulas, vocabularies, colour/tag alternatives and Excel export columns. Changes apply through a selected version; official documents retain their original configuration and values. Detailed vendor/brand/sub-brand organisation is deferred to the later discussion.

### 20.4 PT Approval Queue (Section 15)

12. Confirming a canonical PT is a **named human action**.
 After confirm, identity / barcode / price / tax / qty are true at that site.
 Value and vendor liability post here, not at GRN.
 This is the same inward gate as Section 18.4, rules 20-29.
13. **Who may confirm** is admin-configurable, not hardcoded:
 - office only, or
 - warehouse only, or
 - office **or** warehouse (either may confirm)
14. Store-only personas do not confirm.
 Admin may also grant them an office or warehouse link.
 Then they can.
15. One person, many sites: they only see PTs for sites they are linked to (and brands they are scoped to, if brand-scoped).
16. Optional extra gate (config, not a second product): warehouse checks the file is clean, office is the inward / confirm gate.
 Default for a **single-gate tenant** is one confirm.
17. Queue behaviour: auto-validate.
 Clean rows can **bulk-confirm**.
 Human drills only exceptions.
 Two hard blocks only: **cost > MRP**, **season not on the house calendar** (or blank cost / MRP).
 Everything else flags and continues.
 This is the same refusal rule as Section 18.4, rule 27.
18. A refusal is kept.
 A confirmed PT is never silently edited.
 Correction is **reverse and reissue**, by a configured role.
19. Confirm **never blocks the physical count**.
 An official PT and physical scan acceptance are required for selling; scanning alone does not bypass confirm.
20. Conversion / unmapped-vocab review is a **different** queue (master-data).
 It can sit with the same office people.
 It is not the confirm / inward stamp.

### 20.5 Exceptions (Goods Path)

Warehouse counts.
Office (or buyer) owns the gap.

21. Every exception is typed, has an **owner queue**, an age, and a close action.
 Flag discrepancies without hiding physical receipt. Selling remains subject to the official-PT, acceptance, hold and condition rules.
22. **Short against invoice** (counted less than invoiced): owner = buyer. Separately track **unfulfilled booking balance**; a normal phased delivery is not automatically a shortage claim.
 Close = accept short / wait for balance shipment / raise claim.
23. **Excess** (landed more): owner = buyer.
 Close = keep with remark / return / book extra.
24. Grain is remaining **outstanding**, not the original order qty.
 Many GRNs per booking.
 Same grain as Section 18.3, rule 13.
25. **No booking** is a **legal path**, not automatically an exception.
 Receipt still happens.
 Office sees **"unbooked inward"** so they can attach later.
 Exception only if brand terms are unknown or the commercial model cannot be snapshotted.
26. **Late booking-attach** is a **dated document** on the GRN.
 It does not rewrite the count or the PT.
 Visible who attached, when.
 After attach, if booking qty / identity now disagrees with GRN / PT, **then** raise a mismatch exception.
 The attach itself is not the exception.
 This is the dated-correction rule in Section 12.4 and Section 13.7.
27. **PT vs GRN mismatch** (qty or identity at confirm): owner = the PT confirmer's queue.
 Confirm may still proceed if policy is flag-not-block, but the row stays open until someone accepts the delta or reverses.
28. Wrong article and damaged-in-transit are typed (warehouse raises, office / buyer / QC owns).
 Damaged → quarantine, not sellable.
29. Over-quota return (Correction cap) flags; it does not invent a second return product here.
30. One problems screen for the person.
 Rows are **scoped server-side** to what they may close.
 A store-only login does not see vendor short / excess.
 A buyer does not see till holes.

Additional operational exceptions agreed 2026-09-09: **E-way bill not present** under Section 8.3, and **barcode identity ambiguity** under Section 5.6. Preserve who flagged, who resolved, when, why and the supporting evidence; resolution does not erase prior absence or ambiguity.

### 20.6 Buying / Planning Calendar

A merch calendar (open-to-buy, buying windows, appointments) is **not in Phase 1**.

Office keeps only what goods need to be true:

- house **season calendar** (open / EOSS / close, halves if the tenant uses a two-season year)
- brand-season **map**
- margin bands as data, not a planner

Reopen a buying planner only after offers, not to finish Phase 1 goods.

### 20.7 HQ vs Regional Office

HQ and Regional Office are **office sites**.
Same module.
Same queues.
Difference is **which sites and brands the person is linked to**.

Do not build a Regional Office app.
Region / cluster on the org tree is planning geography, not a second workflow.

Who confirms PT at head office is a **configuration of Section 15**, not a hardcoded place.

---

## 21. Vendor and Ledger

**Commercial discussion deferred, 2026-09-09.** The detailed financial rules in this section and their summaries elsewhere are retained for the next discussion, not endorsed or redesigned by the operational update. In particular, supplier liability, commission, promotional credits and ownership/accounting treatment must be settled from the agreements. Operations use the shared stock workflow in the [PT Operational Agreement](./pt-operational-agreement.md#15-commercial-discussion-boundary).

This is the money that sits **opposite a vendor or a partner**, not the warehouse dock.

Warehouse stamps the edge and never chases it (Section 18.13).
This section owns the books.

### 21.1 When the company owes

The four names are **labels**.
What is stored is **ownership × return terms × rolling top-up**.
Liability timing keys off **ownership**.
This is the same freeze as Section 12.

| Model | Who owns after receipt | When the company owes the brand | Unsold going back |
| :--- | :--- | :--- | :--- |
| **Outright** | Company | At inward (PT / invoice total, including tax) | No return right |
| **Correction** (margin + capped return) | Company | Same as outright. Allowance nets **only on return** | Capped pool (brand × season) |
| **SOR** | Brand | On **sale**, at the frozen settlement rate, not the till price | Uncapped, windowed |
| **Consignment** | Brand | Same as SOR (never from the PT) | Same as SOR, plus rolling top-up without a new booking |

What that means in ledgers:

- **Owned stock** (outright / correction): **Dr Inventory / Cr Vendor payable** at inward.
- **Brand-owned** (SOR / consignment): quantity is counted; value is **off-book memo** until sale.
 Then **Dr COGS / Cr Vendor payable** at the piece's frozen rate.

Booking-less arrival with unknown brand terms: treat as **outright** so a liability is never understated, and flag head office.
If the brand itself is unknown, **withhold the vendor posting** entirely (behaves like SOR until confirmed).
The unassigned inward stays as goods-received-not-yet-on-a-named-vendor, not as a fake vendor bill.

GRN remains quantity only.
Value, tax, and vendor liability post only at the named inward on the stored PT (Section 18.4, rule 26).

Not-owned layers may exist for costing.
The inventory-control tie sums **owned stock only**.

### 21.2 Vendor ledger, debit notes, payments

One derived party ledger, never a typed balance:

`Opening + Invoices − cash discount − goods-return credits − Payments + Interest = Due`

Grain: **payables accrue per brand; payments anchor to the vendor**.
One bank transfer can clear several brands.
Status of a payable is derived from allocations: **open → partly paid → paid**.

Two layers:

1. **Payable** - born from a spine document (PT invoice, per-sale SOR accrual, return debit, brand credit).
2. **Payment** - a separate document with maker/checker, bank bulk file, then **confirmed** (bank ref) vs **reconciled** (statement).

**Debit notes are first-class**, not a spreadsheet.
The register holds: type, claim status, return reason, series, qty, amount, settlement, and any difference as an owned exception.

**Netting:**
- A **confirmed** credit (return accepted, credit note in hand, RTV acknowledged, correction within allowance) nets **now**.
- A **raised-but-unagreed** claim (markdown / ownership-conversion, over-allowance) sits pending until the brand agrees.
- Offer discounts are **not** claims.
 They only lower margin.
 There is no promotional bill-back to the vendor.

Opening balances exist as a dated load on the party ledger.
The date is tenant data, not a product constant.

### 21.3 RTV and seasonal return as money documents

These are **not** stock hops that happen to leave the building.
The document must write **stock and money** (or an explicit "no money" for brand-owned), freeze the quota reading, and leave a chaseable credit.

- **RTV (defective):** from quarantine.
 Credit or replacement.
 Owned stock tracks **credit due**.
 Brand-owned is a **quantity return** - do not invent a payable at the dock.
 Some brands are collected from the store; everyone else consolidates at the warehouse, then **one** RTV leaves.
 Replacement comes back as inbound **linked to that RTV**.
 Two-person approval before post.
 Stock that has already converted to company-owned (over-cap) cannot RTV.
- **Seasonal return:** same engine, good stock, no quarantine, bulk by brand × season.
 **SOR:** unsold never accrued, so return nets **nothing**.
 **Correction:** draws the allowance; over-cap converts to company-owned, not a silent extra credit.

Brand-owned RTV **moves stock only**.
The off-book memo written at inward **must be relieved** on that return, so memo stock does not overstate what is still held.

Until stock and money post together, an approved RTV must not leave pieces and payables on the books as if nothing happened.

### 21.4 Freeze of the commercial model

Resolve once, stamp, never re-derive.
Same rule as Section 12.2 and 12.4.

- **With a booking:** snapshot at create from brand × vendor × site × period (or from the brand), overridable on the booking.
 Later master edits do not rewrite yesterday.
- **Booking-less:** snapshot **current brand terms at receipt**.
 Unknown brand → outright + head-office exception.
 Attaching a booking later is a **dated correction beside the GRN**, not a rewrite of the receipt.
 Late attach posts **no value**.
- **PT / inward:** posts against **that frozen copy**, not live terms.
 Warehouse does not pick a model on the dock except the configured booking-less override.

### 21.5 Partner receivable and partner bill-back

This is warehouse → **partner store** (Section 18.9).
It is not a promotional bill-back.

Partner store is not an own store.
Dispatch is a **sale at purchase price (PP)**, not an internal transfer at book value.
Tax invoice at PP.
Tax follows **partner site registration vs warehouse registration**.
Legal entity, tax registration, and site stay three dimensions.
Partner may buy on credit.
Warehouse does not chase.

Partner **returns unsold and bills the company like a vendor GR**.
Warehouse counts it as a receipt against **their** return invoice.
Stock comes back.
The money edge is a **credit against the partner**, not a silent reverse of the original dispatch.

Two books, not one:

| Book | Direction | Born when | Reduced when |
| :--- | :--- | :--- | :--- |
| **Vendor ledger** | The company owes the brand | Inward (owned) or sale (SOR / consignment) | Payment, debit note / goods return, confirmed credit note, owned RTV |
| **Partner ledger** | Partner owes the company (receivable) | Warehouse dispatch at PP | Collection, and **bill-back credit** when they return and invoice the company |

Brand Manager verifies credit-note pendency.
They do not approve partner tax invoices and they do not count the dock.

Partner roster and tax registrations remain outstanding from the business (Section 18.15).
The requirement does not wait on the names: every partner site carries a tax registration, and tax follows that.
Chasing the money is this section.
The roster itself is finance / tax.

### 21.6 Who chases

| What | Owner |
| :--- | :--- |
| Payable ageing, debit-note / credit-note register | Finance |
| Brand credit-note pendency | Brand Manager |
| Typed payable amount on the dock | Never. Warehouse only stamps the document edge (Section 18.13) |

---

## 22. In Phase 1, With Parts Deferred

These are **in** this pass.
Only the named part is deferred, and the rest is live.

| Item | In this pass | Deferred part |
| :--- | :--- | :--- |
| **RTV vs seasonal return** | Physical rules plus money documents: quarantine-first, credit or replacement, owned stock tracks credit due, brand-owned is quantity return and must relieve the off-book memo, seasonal bulk by brand × season, correction cap is a configured ladder, over-cap converts to company-owned and cannot RTV (Sections 9, 18.10, 18.11, 21.3) | Nothing deferred on the money document itself. Ageing of the chase and statutory filing sit with finance |
| **Virtual sites** | In-transit is live and is a real virtual site during every transfer. RTV-hold at the store is live (Section 17.4). Damage is live at the store as **quarantine** (Sections 14, 17.2, 17.4, 17.5) | **Sample** and **e-comm reserve** exist as named virtual sites but are not designed in this pass. The dedicated damage/sample/e-comm site design is what is deferred - not damaged-goods handling itself |
| **Canonical PT** | Upload + confirm, happy path, is fully in | The brand-file → canonical **conversion engine** ("PT file operations") |
| **Statutory goods-movement / inter-registration transfer** | Follow what legally should be done; system flags taxable inter-registration moves; internal transfer documentation must be robust | In-app statutory goods-movement document **generation** (manual in v1) |
| **Customer return / exchange** | Both policy flags, plus the full till flow in Section 17.2 | Nothing deferred; the till flow lives in store ops |
| **Partner store dispatch** | Full document behaviour: sale at PP, tax invoice, tax-registration-driven tax, partner isolation, bill-back GR on partner returns (Section 18.9). Partner ledger is a receivable, reduced by collection and bill-back credit (Section 21.5) | The **partner roster and their tax registrations** are outstanding from the business (Section 18.15) |
| **Office exceptions** | Typed owner queues: short, excess, unbooked inward (watchlist), late-attach as dated link, PT vs GRN mismatch, wrong article, damaged-in-transit, over-quota return (Section 20.5) | Closing money is Section 21 |
| **Warehouse reporting** | Location path: the movement document chain per SKU (Section 18.12) | Ageing buckets, sell-through, brand performance, L2L, season-end prediction - not a warehouse requirement at all (Section 18.14) |
| **Warehouse cycle count** | Scan-receive of store returns and of vendor arrivals | Full-building cycle count is **not** a day-one requirement (Section 18.14) |
| **Office masters** | Vendor, brand, site, season, vocabularies; dated writes; merge; second eye on dangerous changes; first-party screens (Section 20.3) | **Sub-brand** stays an optional master, not a Phase 1 blocker |
| **PT confirm queue** | Admin-configurable office / warehouse / both (Section 15 and 20.4). Optional two-gate. Bulk-confirm of clean rows. Count can proceed; selling requires official PT and scan acceptance | Conversion / unmapped-vocab review is a different queue. The conversion **engine** stays deferred |
| **House season calendar** | Open → EOSS / markdown → Closed; brand-season map; margin bands as data (Section 20.6) | **Buying / merch planning calendar** (open-to-buy, buying windows, appointments) is parked. Reopen after offers |
| **HQ vs Regional Office** | Same office module, same queues; scope is site and brand links (Section 20.7) | A second Regional Office product is not built |
| **Vendor ledger** | Bill-wise derived ledger, debit notes first-class, payments as a separate maker/checker document, netting of confirmed credits only (Section 21.2) | Statutory filing and the chain's external accounting package sit with finance |
| **Commercial-model freeze** | Preserve the starting agreement reference and historical PT evidence; later commercial events do not rewrite the receipt | Detailed model, liability and settlement design deferred by the 2026-09-09 operational discussion |
| **Partner receivable** | Dispatch at PP opens a receivable; partner return GR opens a bill-back credit; two books, not one (Section 21.5) | Partner roster and tax registrations remain tenant data (Section 18.15) |

### 22.1 Note on Lead Times

Booking lead times (branded ~6-8 months, non-branded ~3-4 months) are **indicative, not hard constraints**.

The dump already said the non-branded figure "is also not defined".

Lead time is flexible and must not be modelled as a validation rule or a blocking constraint over time.

---

## 23. Explicitly Out of This Product Pass

| Item | Status |
| :--- | :--- |
| **EBO operating model** | Out of scope for now (runs on brand's software, not ours) |
| **Concession / brand-run stock** | Outside this purchase flow; no booking commercial model |
| **Non-branded booking** | Not in Phase 1. Non-branded stock still enters via GRN + canonical PT upload |
| **PT conversion engine** (brand file → canonical) | Out of this pass; canonical PT is uploaded instead |
| **In-app statutory goods-movement document generation** | Out of this pass; manual process in v1 |
| Sample / e-comm reserve virtual site design | Named, not designed in this pass (see Section 22) |
| HRMS (people, attendance, payroll) | Open question, recommendation is **out** of Fashion-OS Phase 1 (see Section 25, topic 3) |
| **Buying / merch planning calendar** | Parked. Not invented in the office sitting. House season calendar stays under masters (Section 20.6) |
| **Regional Office as a second product** | Not built. HQ and RO are the same office module (Section 20.7) |
| **Promotional vendor bill-back** | Out. Offer discounts lower margin; they are not vendor claims (Section 21.2) |
| **Unmapped PT format contracts, AI invoice reading** | Later, with the conversion engine (Section 18.1) |
| **How goods physically travel** (statutory goods-movement document, vehicle, transporter) | Not a warehouse requirement; generation stays manual in v1 |
| **Warehouse ageing / brand performance / L2L / season-end prediction** | Warehouse explicitly does not need these; they belong to Brand Manager and head office |
| **Phantom bookings** | Never invented so a receipt can exist (Section 18.3, rule 12) |

---

## 24. Discussions Done

These sittings are **closed**.
The decisions are recorded in the sections named below and are **not reopened** unless a decision is explicitly revisited.

**2026-09-09 update:** the [PT Operational Agreement](./pt-operational-agreement.md) records the latest operational sitting. Commercial-model details and party hierarchy in the historical register below are now pending the separate discussion (Sections 12 and 21). This register is not a claim that those details were finalised in the operational sitting.

| # | Topic | Where it lives now | What was locked |
| :--- | :--- | :--- | :--- |
| 1 | Org / sites / goods types / parties / commercial model | Sections 1, 2, 3, 12, 13.1 | One legal entity, configured geo hierarchy, site types final, four commercial models as labels over ownership + return terms + rolling top-up |
| 2 | Branded booking | Sections 4.1, 13.4 | Booking is intent: vendor + brand + season; lines = style + size + qty; no colour |
| 3 | Receiving (store + warehouse, booking optional) | Sections 6, 13.5, 18.3 | GRN is quantity and condition only; booking optional; never invent a booking |
| 4 | Documentation (canonical PT upload + confirm) | Sections 5, 13.6, 18.4 | PT is the truth event; happy path only; one GRN, one receipt PT; conversion engine later |
| 5 | Transfers (warehouse→store, store→store, store→warehouse) | Sections 7, 8, 11, 18.8 | Every site-to-site move produces a PT; in-transit is real; destination sees pending inward first |
| 6 | Sellable at store (scan; floor + backstore) | Sections 13.3, 13.8, 13.9, 14 | Scan at the store is the last gate; floor and backstore are locations, both sellable |
| 7 | RTV vs seasonal return | Sections 9, 18.10, 18.11, 21.3 | Quarantine-first for defect, bulk-and-good for seasonal, consolidate then one RTV, correction cap is a configured ladder, over-cap becomes company-owned and cannot RTV. Money documents are in: owned credit due, brand-owned quantity return with memo relief |
| 8 | Customer return / exchange | Sections 10, 17.2 | Two configurable refund policies plus the full till behaviour |
| 9 | **Store operations (includes store day)** | Section 17 | Till / POS bill, store day and cash, floor and backstore, quarantine and RTV-hold, SOH and stocktake, pending inward, store reports, and what is explicitly not a store operation |
| 10 | **Warehouse operations** | Section 18 | The physical spine, dock to bin to truck: 88 numbered rules across site facts, GRN vs invoice, canonical PT, untagged barcoding, putaway gated on official PT, allocation and re-split, pick / pack / scan, partner dispatch at PP, store returns in, quarantine and RTV, location path, money edges, and the locked non-requirements |
| 11 | **Brand Manager vs warehouse write permissions** | Section 19 | Brand-scoped across all sites, proposes but does not post, PT yes, dock and barcode and partner billing no |
| 12 | **Office operations** | Section 20 | Stewardship of facts and queues: masters, Section 15 confirm gates, typed exception inbox, house season calendar. Buying calendar parked. HQ and RO are the same module. Brand Manager may sit on the PT queue for their brands; they do not own the vendor / site master |
| 13 | **Vendor and ledger** | Section 21 | When the company owes (ownership keys liability timing), bill-wise vendor ledger with first-class debit notes, RTV/seasonal as money documents, freeze on the document, partner receivable at PP with bill-back credit, finance and Brand Manager chase, dock never types an amount |

Warehouse sub-topics that were on the old session list - **GRN vs invoice on the dock, canonical PT upload / confirm, putaway after PT is true, allocate to linked stores, pick / pack / scan, barcode for untagged goods, and hold / re-split / consolidate quarantine / RTV from warehouse** - are all covered in Section 18 and move here.

Two things came in **beyond** that old list and are also closed: **partner-store dispatch as a billed sale at PP with bill-back returns** (Section 18.9) and the **Brand Manager persona and its write boundary** (Section 19).

### 24.1 Suggested Order That Was Followed for Warehouse

Recorded because it is the lock order, and because anything reopened should be reopened in this sequence:

1. GRN vs invoice on the dock (qty only; invoice is the count target)
2. Canonical PT upload / confirm, putaway gated on official PT
3. Untagged barcode + tag
4. Allocate to linked own stores, re-split rules
5. Pick / pack / scan, including store returns in
6. Partner dispatch at PP + partner bill-back GR
7. Quarantine consolidate + RTV
8. Location path
9. Brand Manager vs warehouse write permissions

These decisions are treated as **final** as written in Sections 18 and 19.

Office operations (Section 20) are closed on the same basis: masters, Section 15 confirm gates, typed exception inbox, house season calendar. Buying calendar is not in Phase 1. HQ and RO are the same module.

Vendor and ledger (Section 21) were recorded as closed in the earlier sitting. Their detailed commercial treatment is now deferred for the follow-up discussion; retain the earlier text as review material, not as a newly confirmed model.

---

## 25. Discussions Left

Use this as the session list.
**One topic per sitting.**

**1. Offers and discounts**

- Slabs, B2G1, gifts, dates, store scope, fallback
- How an offer reads the PT row (MRP, brand, season, etc.)
- Offer discounts are not vendor claims (already locked in Section 21.2)

**2. Finance, tax, statutory goods-movement**

- Dedicated follow-up: SOR, buy and sell, correction, consignment and other agreement variants; stock organisation versus contractual ownership/accounting, commission, payment timing, return allowances, brand support and V-stock status.
- Vendor/brand/sub-brand organisation and detailed price/tax formulas remain to be finalised.
- The operational PT baseline, Excel download, transfer lineage and non-blocking missing e-way bill flag are already recorded in the PT Operational Agreement; do not reopen them merely to discuss the commercial details.

- Tax registration per site, same-registration vs inter-registration transfer
- Transfer PT vs tax invoice
- Partner roster + tax-registration list (Section 18.15). The billed sale at PP is already locked (Sections 18.9 and 21.5)
- Statutory goods-movement document: manual in v1; what the system must still store
- Statutory books vs this product (what is in-app vs the chain's configured accounting package)

**3. HRMS**

- People, attendance, payroll: in or out of Fashion-OS Phase 1 (**recommend out**)

**4. Audit**

- Who can see what, document trail, books-health, exception log
- Two-person damage confirm and counter-document discipline already named in Section 18 land here
- Office master merges, second-eye on dangerous changes, and exception close-actions named in Section 20 land here too
- Vendor payment maker/checker and debit-note settlement named in Section 21 land here too

**5. Explicitly out of this product pass** - *see Section 23*

- EBO operating model
- Non-branded booking
- PT conversion engine (brand file → canonical)
- In-app statutory goods-movement document generation
- Concession / brand-run stock
- Regional Office as a second product
- Buying / merch planning calendar (parked, Section 20.6)
- Promotional vendor bill-back (Section 21.2)

### 25.1 Open Items Waiting on the Business, Not on Us

| Open item | Status | Where |
| :--- | :--- | :--- |
| Partner roster and their tax registrations | Outstanding from the business. The requirement does not wait: every partner site carries a tax registration and tax follows it | Section 18.15 |
| Booking lead times | Indicative, flexible, never a validation rule | Section 22.1 |
| HRMS in or out | Open question; recommendation is out | Section 25, topic 3 |
| Role-based access, first cut | Decided 22 Sep 2026: six initial roles from the client's SIDEBAR RBAC sheet, one Store Person role. See `docs/features/rbac/rbac-v1-initial-roles.md` | — |
| "Partner store" vs the site-type list | Office locked that a site has a type and that tax registration lives on the site (Section 20.3). Section 18.9 still needs **partner store as a distinct type** from an own store. Which existing types map to "partner" remains a tenant master-data choice, not a second product | Sections 1.1, 18.9, 20.3 |

---

## Appendix A. Editorial Notes on This Reorganisation

The source dump named a customer, places, and a tax jurisdiction.
Those names are **not** in this product document.
The rules they stood for are kept, rewritten as product structure and configured master data.

What was generalised, and what it became:

1. "Retail-EPR" is read as Retail-ERP (Section 0).
2. A named statutory goods-movement document in the dump is the **statutory goods-movement document** the configured jurisdiction requires (Section 8.2 and 8.3).
3. The escaped Markdown in the dump (`\|`, `\*\*`, `\-`, `&#x20;`) has been unescaped so the tables and lists render.
4. A named customer, a named country, and named places were stripped.
 Geography is the configured hierarchy in Section 1.
 Tax is the registration-per-site model in Section 8.3.
 Over-cap seasonal returns convert to **company-owned**, not to any named chain.
5. A named correction-cap ladder in the dump is a **configured cap ladder per brand** (Section 9.2).
 The shape is an example, not a product constant.

Nothing else was summarised away or dropped.
Both PT file links from the dump are kept in Section 5.2, including the two different spellings (`canonical-pt-file.md` and `conanical-PT-file.md`) - the dump distinguishes them as "generalized document" vs "the format we will be using", so both are preserved as written.

The warehouse rules in Section 18 keep the **source numbering 1-88** so any rule can be cited by its original number.
Rules 79-85 are the Brand Manager block and live in Section 19; Section 18.14 carries a pointer so the gap is not read as a loss.

### Correction log

- **2026-09-09:** recorded the conversation in [pt-operational-agreement.md](./pt-operational-agreement.md) and updated receiving, phased deliveries, configurable PT tables/Excel exports, source and event history, migration opening stock, transfer splits, e-way bill exceptions and practical quantity traceability. Official PT plus site scan acceptance now consistently gates selling. Commercial-model details are explicitly deferred. No implementation or phase-completion claim is made by this documentation update.

- RTV / seasonal return and the virtual sites were previously listed as out of scope.
 They are **in** this pass, including the money documents in Section 21.
 Sample / e-comm reserve site design remains deferred (Section 22).
- Booking lead times are no longer recorded as an undefined constraint.
 They are indicative and flexible (Section 22.1).
- The document is now **company-agnostic**.
 Named customer, named country, named places, named tax IDs, and named statutory packages were replaced with product structure plus configured master data (Section 0.1).
- Warehouse operations and the Brand Manager were added as Sections 18 and 19.
 Office operations were added as Section 20.
 Vendor and ledger were added as Section 21.
 Everything after them shifted: deferred is Section 22, out is Section 23, discussions done is Section 24, discussions left is Section 25.
 Store, warehouse, Brand Manager, office, and vendor-and-ledger moved into the done list.
 The remaining topics were renumbered 1-5.

### Reconciliations worth watching

These are places where the warehouse list sits next to an earlier section and the two must be read together.
Nothing was silently changed.

1. **Partner store as a site type.**
 Section 1.1's site-type list is called final and does not name "partner store".
 Section 18.9 needs it as a distinct type.
 Logged as an open tenant master-data item in Section 25.1.
2. **Selling before inward.**
 Resolved by the 2026-09-09 operational agreement: official PT at the site and physical scan acceptance are both required. Sections 13.3, 13.8, 17.1 and rule 53 now agree. Partial acceptance can release accepted good quantities without receiving the entire transfer.
3. **Putaway gate.**
 GRN quantity exists in receiving hold before the PT is official. Warehouse putaway needs the official PT; store availability needs official PT and scan acceptance. Mere physical presence is not enough to sell.
4. **Warehouse count.**
 Section 17.4 gives the store a blind stocktake.
 Rule 88 says the warehouse does **not** get a full-building count on day one - only scan-receive.
 The store stocktake is unaffected.
5. **Own-store wording.**
 Section 13.2 says every **multi-brand outlet** is linked to a warehouse.
 Section 18 says **linked own stores**.
 Same set; the warehouse phrasing adds the contrast with partner stores.
6. **PT confirm gates.**
 Section 15 already said office, warehouse, or both.
 Section 20.4 adds the queue behaviour, the optional two-gate, and the two hard blocks.
 Same rule; office fills the desk around it.
7. **Buying calendar.**
 Not in Phase 1 (Section 20.6).
 House season calendar is in.
 A merch planner is not.
8. **Vendor vs partner books.**
 Warehouse stamps the document edge (Section 18.13).
 Section 21 owns the two ledgers and who chases.
 Dock never types an amount.
