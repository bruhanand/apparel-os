# Stock ledger

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Current**, 3 Oct 2026. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements these PRD sections: Stock and warehouse control; Ledger and official books (cost formulas and pools); Merchandise and identifiers (piece and quantity tracking); Receiving and price tickets, Transfers and physical movement, Damage, quarantine and disposal (their stock effects); Opening, closure, migration and export (the switch); Module and data boundaries; Transaction and integration integrity.

- PRD IDs: `PRD-STK-001`–`PRD-STK-005`, `PRD-STK-008`–`PRD-STK-015`; `PRD-LED-003`, `PRD-LED-005`–`PRD-LED-009`, `PRD-LED-014`–`PRD-LED-018`; `PRD-MER-003`, `PRD-MER-006`, `PRD-MER-010`–`PRD-MER-012`, `PRD-MER-014`–`PRD-MER-017`; `PRD-REC-004`, `PRD-REC-006`, `PRD-REC-008`, `PRD-REC-009`, `PRD-REC-012`, `PRD-REC-013`, `PRD-REC-015`, `PRD-REC-017`, `PRD-REC-019`, `PRD-REC-021`, `PRD-REC-022`; `PRD-PTW-010`; `PRD-ORG-001`, `PRD-ORG-005`, `PRD-ORG-009`, `PRD-ORG-012`, `PRD-ORG-014`, `PRD-ORG-015`, `PRD-ORG-017`–`PRD-ORG-019`; `PRD-TRF-004`, `PRD-TRF-006`–`PRD-TRF-013`, `PRD-TRF-016`, `PRD-TRF-018`–`PRD-TRF-020`, `PRD-TRF-022`, `PRD-TRF-023`; `PRD-DMG-001`–`PRD-DMG-003`, `PRD-DMG-005`–`PRD-DMG-012`, `PRD-DMG-015`, `PRD-DMG-016`; `PRD-OFR-008`, `PRD-OFR-012`, `PRD-OFR-014`, `PRD-OFR-016`, `PRD-OFR-019`; `PRD-RET-013`, `PRD-RET-017`; `PRD-POS-018`, `PRD-POS-020`; `PRD-OFF-006`, `PRD-OFF-009`, `PRD-OFF-011`, `PRD-OFF-012`, `PRD-OFF-014`; `PRD-EBO-003`, `PRD-EBO-005`, `PRD-EBO-011`; `PRD-LIF-003`–`PRD-LIF-005`, `PRD-LIF-008`, `PRD-LIF-010`, `PRD-LIF-012`–`PRD-LIF-016`, `PRD-LIF-018`, `PRD-LIF-025`–`PRD-LIF-027`; `PRD-IMP-011`, `PRD-IMP-012`; `PRD-ACS-006`, `PRD-ACS-007`, `PRD-ACS-013`–`PRD-ACS-016`; `PRD-MOD-002`, `PRD-MOD-003`, `PRD-MOD-006`, `PRD-MOD-009`–`PRD-MOD-015`; `PRD-INT-002`–`PRD-INT-005`, `PRD-INT-008`; `PRD-PRF-001`, `PRD-PRF-003`; `PRD-STG-002`; `PRD-SEC-016`, `PRD-SEC-017`; `PRD-NAV-015`, `PRD-NAV-016`; `PRD-FRN-006`; `PRD-EXC-001`; `PRD-ACP-001`–`PRD-ACP-006`, `PRD-ACP-012`, `PRD-ACP-013`, `PRD-ACP-018`, `PRD-ACP-020`.
- Policies: 1 (`POL-01.05`, `POL-01.07`, `POL-01.13`), 2 (`POL-02.21`), 3 (`POL-03.03`), 4 (`POL-04.03`–`POL-04.09`), 8 (`POL-08.02`, `POL-08.03`, `POL-08.05`, `POL-08.06`), 9 (`POL-09.02`–`POL-09.08`, `POL-09.11`, `POL-09.12`, `POL-09.19`, `POL-09.21`), 11 (`POL-11.01`), 14 (`POL-14.02`–`POL-14.04`, `POL-14.07`), 16 (`POL-16.04`, `POL-16.05`), 17 (`POL-17.01`, `POL-17.02`, `POL-17.05`, `POL-17.07`).
- Decisions: DEC-002, DEC-004, DEC-008, DEC-019, DEC-023, DEC-030, DEC-031, DEC-032, DEC-033, DEC-034, DEC-035.

Used by: the future designs for receiving, PT, transfers, counts, supplier returns, the counter, EBO imports, the switch and financial posting. Each of them posts stock through this ledger.

---

## 1. What the ledger is

- One stock module owns the ledger's records. Other modules never read or write its tables; they call its interface (`PRD-MOD-002`).
- Every stock effect of a business action is written through that interface in the same database transaction as the action (`PRD-MOD-006`, `PRD-INT-004`). For a large document the action is its posting job, which is one transaction (10.6). Durable follow-up, such as journals and messages, goes through the outbox.
- Reports read declared read models of the ledger with an as-of time (`PRD-MOD-003`).
- The ledger records stock and its cost. It never writes journals; the books get its valued movements through the outbox (section 7.11).
- Only a physical count creates stock. Invoice, booking and PT quantities never do (`PRD-REC-008`, `PRD-ACP-001`).

## 2. Movements

### 2.1 The rule

- A **movement** is an append-only record of a change in stock quantity, place, condition, custody, ownership or value (PRD "Words used", DEC-033).
- Movements are the only source of stock balances (`PRD-MOD-012`). A balance is the sum of its movements.
- A posted movement is never updated or deleted. A mistake is corrected by a new movement that names the one it reverses, with reason, actor and approval (`PRD-MOD-011`, `PRD-ACS-014`). The value a reversal carries depends on what it undoes (7.5).
- Balance tables exist for speed and locking only. They are rebuildable from movements, and a scheduled check rebuilds them and compares (`PRD-MOD-011`, `PRD-MOD-012`).

### 2.2 What every movement carries

| Field | Notes |
| --- | --- |
| Kind | See 2.3 |
| SKU and unit | The SKU, or Unknown for goods whose identity is not yet resolved (`PRD-DMG-005`). Each SKU has one stock unit (piece, pair or pack); pack conversions use the recorded conversion version, and units are never combined silently (`PRD-MER-010`–`PRD-MER-012`, `POL-04.03`, `POL-04.04`) |
| Batch and expiry | Only where the tracking profile requires them; missing values block the movement (`PRD-MER-011`) |
| Quantity | A whole number in the SKU's stock unit; never negative on a balance |
| From and to | Site; business unit, and through it the accounting book and legal entity (`PRD-ORG-005`); internal location, including display and alteration locations (`PRD-ORG-012`); condition; and how the goods are held: in custody, in transit or billed-retained. Each unit is in one place and held one way, so nothing is counted twice (`PRD-STK-001`, `PRD-STK-002`) |
| Receipt origin | Section 4 |
| Piece IDs | For piece-tracked goods: the exact pieces (section 5) |
| Value | Value in or out of a cost pool, in integer paise, or **Unknown** (section 7) |
| Business document | The receipt, transfer, bill, count, return or other record that caused it, with its version (`PRD-ACS-007`) |
| Times | Event time, recording time and business date under the Organisation's timezone (`PRD-MOD-009`) |
| Actor and approval | Who did it, and the approval evidence where one is needed (`PRD-ACS-013`) |
| Idempotency key | Section 10.1 |
| Reverses | The movement this one undoes, if any |

### 2.3 Kinds of movement

| Kind | What it does | Stage live |
| --- | --- | --- |
| Receipt count | Creates custody at the receiving Site from the GRN count; new receipt origins (`PRD-REC-008`) | 2 |
| Opening count | Creates custody from a verified opening count at any Site that goes live, warehouse or Store; opening receipt origins (`PRD-LIF-003`, `PRD-LIF-004`, `PRD-LIF-027`) | When its Site goes live (SL-9) |
| Location move | Within one Site: floor, backstore, rack, bin; keeps condition and acceptance (`PRD-STK-005`) | 2 |
| Condition change | Good to damaged, wrong or unidentified. Wrong or unidentified goods return to good only through the identity route (`POL-17.02`). Damaged goods never become good stock (`PRD-DMG-010`). A mistaken report is rejected before confirmation (`PRD-DMG-003`). Undoing a mistaken confirmation by a reversal is a design rule under `PRD-ACS-014` that the PRD does not state (OPEN, SL-20) | 2 |
| Identity resolved | Goods whose SKU was Unknown get their SKU through the approved identity route, then follow the PT route (`PRD-DMG-005`, `PRD-DMG-010`, `POL-17.02`) | 2 |
| Dispatch | Custody leaves the source Site into transit (`PRD-TRF-011`, `PRD-TRF-013`) | 3 |
| Arrival count | Custody at the destination for counted quantities; excess goes to an excess hold; missing quantities stay on the dispatch until resolved (`PRD-TRF-016`, `PRD-TRF-018`) | 3 |
| Failed-delivery return | Goods that never reached the destination come back and are counted at the source, linked to the dispatch (`PRD-TRF-019`) | 3 |
| Sale issue | Custody leaves at customer handover. A billed-retained sale keeps the goods in the Store, held as billed-retained, until handover (`PRD-POS-018`) | 4 |
| Customer return | Custody back after physical acceptance; damaged pieces go to quarantine (`PRD-RET-013`) | 4 |
| Supplier-return departure | Custody leaves the Site, on its way to the supplier or with the supplier's pickup (`PRD-OFR-012`) | 3 |
| Supplier handover | Custody ends at confirmed handover or supplier receipt (`PRD-TRF-020`) | 3 |
| Supplier rejection return | Goods the supplier refuses come back and are counted at the receiving Site (`PRD-OFR-014`) | 3 |
| Count difference | Gain or loss after approval (section 8) | 3 |
| Disposal | Custody ends by destruction or scrap handover (`PRD-DMG-012`) | 3 |
| Ownership change | The owner on a receipt origin changes at the agreement's event (`POL-01.05`) | 2 |
| Cost established | PT approval gives a receipt origin its cost; value enters a cost pool, or the dispatch if the goods are in transit (section 7.6) | 2 |
| Cost adjustment | A later approved cost change, including a PT correction that changes an approved P RATE (`PRD-LED-016`, `PRD-REC-019`) | 2 |
| Write-off | Value only: established value leaves; goods stay in custody, unavailable (`PRD-DMG-011`, `POL-17.05`) | 3 |
| Net realisable value write-down | Value only (`PRD-LED-007`) | 5 |
| Reversal | Undoes a named movement; its value rule is in 7.5 | all |

Acceptance, coverage, holds and reservations are not movements. They are append-only status records on stock (sections 3 and 6).

## 3. Five things kept apart

`PRD-STK-001`, `PRD-STK-002`, `PRD-REC-009`, `PRD-LED-005`, `PRD-ORG-001`, `PRD-ORG-009`, `PRD-ORG-014`, PRD "Words used" (Custody). The five-way split combines these PRD rules with the AGENTS.md rule that keeps custody, PT coverage, availability, ownership and accounting recognition separate; ownership comes from `PRD-ORG-009` and `PRD-ORG-014`. Each is recorded on its own and changed only by its own events.

| Thing | What it answers | Recorded as | Changed only by | Never changed by |
| --- | --- | --- | --- | --- |
| Custody | Where the goods physically are, in what condition, held by whom | Movements and balances | Counts (receipt, arrival, return, opening, count difference), dispatch, handover, disposal, location and condition moves | Invoice, booking or PT quantities (`PRD-REC-008`); approvals alone; earlier-POS files (`PRD-LIF-014`) |
| PT coverage | Which official PT revision prices this stock, at its identity and location (PRD "Words used") | Coverage records: per piece, or a covered quantity per receipt origin; approved coverage never overlaps | Created or removed only by PT approval and linked PT corrections that respect dependent quantities (`PRD-REC-015`, `PRD-REC-019`, `PRD-ACP-002`). It moves between locations with custody, documented by the transfer PT derived from the source origins (`PRD-TRF-012`, `PRD-TRF-023`); it never grows in total | Labels; counts (a found piece keeps the coverage it always had) |
| Availability | Whether the stock may be sold or allocated now | Derived, never stored as a fact: custody less holds, reservations and freezes, given coverage and acceptance (section 6) | Hold, reservation, freeze and acceptance records and their releases | — |
| Ownership | Who legally owns the goods | Owner on the receipt origin, from the agreement (`PRD-ORG-014`) | The agreement's ownership event (`POL-01.05`); an approved commercial or inter-entity process (`PRD-FRN-006`) | PT approval (`POL-01.07`); an internal transfer; a franchise or commercial-model label |
| Accounting recognition | What the books show | Journals in the finance module, from valued movements (section 7.11) | Posting rules of the Financial posting policy (`POL-09.02`, `POL-09.03`, `POL-09.05`) | The stock module (it writes no journal) |

**Inbound ownership is not stock** (`PRD-ORG-017`, `PRD-ACP-020`). Goods owned before receipt live in an inbound ownership record outside the ledger. They cannot be sold, reserved, transferred or counted. The receipt count closes that record and creates custody (`PRD-ORG-019`). A provisional amount on it (`PRD-ORG-018`) stays there; it is not the stock's cost.

## 4. Receipt origin

- A **receipt origin** is the counted receipt, opening stock or other counted source a quantity came from (PRD "Words used", DEC-033). It carries the SKU, unit, batch and expiry, receiving Site and business unit, count date, owner and agreement, the PT revision covering it, and its cost or Unknown.
- One receipt origin is one GRN line. If PT coverage splits that line across a primary and a supplemental PT (`PRD-REC-015`), the ledger records the split and each part becomes its own receipt origin with its own cost.
- The receipt origin travels with the stock through every move. Grouped displays keep the separate origins underneath (`PRD-STK-004`).
- A transfer carries its receipt origins to the destination; transfer documents come from them, with no new purchase and no markup (`PRD-TRF-012`).
- **Which origin moves** (`PRD-STK-013`, DEC-032). For piece-tracked goods the piece ID names it. For quantity-tracked goods, when the action does not name one, take the oldest receipt origin at that place first; where batch or expiry is tracked, the soonest expiry first. This applies to sales, imported EBO sales, count shortages and any other issue that does not name an origin.
- Receipt origin decides owner and supplier-return rights (`PRD-OFR-008`). It does not decide cost flow: the cost formula does (section 7).

## 5. Piece-tracked and quantity-tracked goods

`PRD-MER-003`, `PRD-MER-014`–`PRD-MER-017`, DEC-002, DEC-023.

| | Piece-tracked | Quantity-tracked |
| --- | --- | --- |
| Set by | The merchandise tracking profile (`PRD-MER-014`). KDPS: apparel and footwear; other categories only by explicit choice (`POL-04.09`) | Every other profile (`POL-04.07`) |
| Held as | One record per piece | A quantity per receipt origin, SKU and place |
| Identity | Piece ID label printed from the receipt count; a label before PT approval asserts no price or sale eligibility (`PRD-MER-015`, `POL-04.06`) | SKU and unit; batch and expiry where required |
| Bill, count, transfer, return | Only by scanning the piece ID. A supplier barcode names the SKU, not the piece (`PRD-MER-016`) | By SKU barcode or controlled count |
| Holds and reservations name | Pieces | A quantity at a place |

**Piece records.** Each piece ID has one record: its SKU, receipt origin, current place, condition and how it is held. Identical pieces may share a supplier barcode; their piece IDs stay distinct (`PRD-MER-006`).

**Where piece rules are off.**

- A Store still selling through an earlier POS has its earlier-POS files kept out of app stock (DEC-030, `PRD-LIF-014`). It has no real opening stock until its switch count (`PRD-LIF-027`, `POL-14.07`). Its piece rules start at that count, where every piece without an ID is labelled and every piece ID is verified (`PRD-MER-017`, `PRD-LIF-025`). How goods the app receives or moves there before the switch are held is OPEN (SL-9).
- An EBO Store reporting through brand software holds piece-tracked goods as SKU quantity per receipt origin until it bills in Apparel OS; its imports name no piece (`PRD-EBO-011`, DEC-023). The PRD does not define the event that ends "until it bills in Apparel OS" at that Store. How piece-tracked goods arrive at, leave and are counted at such a Store is OPEN (SL-18).

**Batch and expiry.** Required only where the profile says so. Goods that fail the configured shelf-life rule are held (`POL-04.05`). The categories and day limits are OPEN (V-05, `POL-04.08`).

## 6. Holds, reservations and sellable stock

### 6.1 Kinds

Every hold and reservation is its own record: kind, the pieces or quantity it covers, reason, who raised it, evidence, and the event that releases it.

| Kind | Raised by | Released only by | IDs |
| --- | --- | --- | --- |
| Damage hold | A damage report, at once, before confirmation | Independent rejection of that report; confirmation turns it into a damaged condition | `PRD-DMG-001`–`PRD-DMG-003`, `PRD-ACP-005` |
| Quarantine | Damaged, wrong or unidentified condition | An approved decision for that goods; never by time | `PRD-DMG-006`, `PRD-DMG-010`, `PRD-REC-012` |
| Excess hold | Receiving excess; a count surplus with no known origin | Explicit authority and the PT route; or a link to a recorded loss | `PRD-REC-013`, `PRD-STK-014` |
| Source-conflict hold | An open cost, MRP, attribute or tax conflict on the line | Resolution of that conflict | `POL-03.03` |
| Expiry hold | Failing the configured shelf-life rule | A rule change, supplier return, write-off or disposal | `POL-04.05` |
| Ordinary hold | A person, to settle a question | That person's or an authorised release | `PRD-STK-001` |
| Count freeze | An open count over its scope | Count closure | `PRD-STK-008`, `PRD-STK-009`, DEC-019 |
| Transfer reservation | Transfer approval | Dispatch or explicit cancellation; never by time | `PRD-TRF-006`–`PRD-TRF-010`, `PRD-TRF-022` |
| Supplier-return reservation | Approved return list | Departure or explicit withdrawal | `PRD-OFR-012`, `PRD-OFR-016` |
| Offline protected quantity | Allocation to the Store's offline counter | Release online after queue reconciliation | `PRD-OFF-006`, `PRD-OFF-011`, `POL-16.04` |
| Inspection hold | A cancelled billed-retained sale coming back | Inspection | `POL-08.05` |
| Held-goods reservation | Approval of a quarantine movement, a supplier return of damaged, wrong or excess goods, or a pre-PT custody movement, under its own authority | Departure or explicit cancellation | `PRD-DMG-007`–`PRD-DMG-009`, `POL-17.01` |

**Billed-retained is not a hold.** It is a way goods are held (2.2): paid for, and kept in the Store until handover, at a storage or alteration location. That alone keeps them out of sellable stock (6.3, step 1) and out of allocation (`PRD-POS-018`, `POL-08.02`). Alteration and ready-for-collection are tracked apart, piece by piece (`POL-08.03`).

- Handover is a sale-issue movement; it ends custody.
- Whether value leaves the cost pool at the bill or at handover follows the recognition timing the CA sets (V-35, SL-17). Live billed-retained sales stay unavailable until then.
- A cancellation sends the goods into an inspection hold. They become good stock only after inspection (`POL-08.05`). If value left the cost pool at the bill, the goods come back at the cost they left with (7.5); if value leaves only at handover, none left and none returns. Which applies is OPEN (SL-17).
- A count records billed-retained pieces apart from the Store's own stock (8.1).

### 6.2 Rules

- A hold or reservation is released only by its own release event. Releasing one never releases another (`PRD-DMG-003`, `PRD-TRF-022`).
- Holds can coexist on the same stock (`PRD-REC-006`).
- A hold can fall on reserved stock. The reservation stays; dispatch rechecks and blocks the held part (`PRD-TRF-007`).
- Reservations never overlap. For an ordinary transfer or a sale, they never exceed the stock that is covered, accepted, good and not held (`PRD-TRF-006`, `PRD-INT-005`).
- Held goods can still move, but only under their own authority: a quarantine movement, a supplier return of damaged, wrong or excess goods, or a pre-PT custody movement. That move reserves the held goods themselves with a held-goods reservation. Ordinary transfer permission never reaches them (`PRD-TRF-007`, `PRD-DMG-007`–`PRD-DMG-009`).
- A hold moves with its goods and stays on them at the destination (`POL-17.01`).
- Quantity-tracked arithmetic at one place (SKU, unit, batch, receipt origin, condition):
  - each reservation claims its own units;
  - each hold claims its own units, or units inside a named reservation; holds that overlap on the same units count once;
  - a count freeze claims everything in its scope;
  - **available = quantity in custody − reserved − held units outside reservations**, and never below zero. "SOH" in this design means only a quantity another system reports, such as the earlier POS's (PRD "Words used").

### 6.3 Sellable

A piece or unit is sellable at Store S only when all of these are true (`PRD-STK-003`, `PRD-ACP-003`):

1. It is in custody at S, in good condition, not in transit and not billed-retained.
2. It has official PT coverage (`PRD-REC-017`).
3. Its barcode or tag was verified and it was physically accepted at S. PT approval alone does not make it sellable (`PRD-REC-021`, `PRD-REC-022`).
4. No hold and no reservation covers it, including a count freeze (`PRD-STK-009`). The offline counter sells only from its own protected quantity (`PRD-OFF-006`).
5. It meets the expiry rule where one applies (`POL-04.05`).
6. The billing device holds authority, and S bills in Apparel OS: on production only after S has switched (`PRD-LIF-015`); on the test setup, test bills only (`PRD-LIF-026`).

Ownership does not block a sale: supplier-owned consignment stock can be sellable. Transfer approval uses the same checks without step 6 (`PRD-TRF-006`).

## 7. Cost

### 7.1 Cost pools

- A **cost pool** is the stock over which the cost formula runs (PRD "Words used", DEC-033). Each accounting book chooses one mode (`PRD-LED-015`, DEC-004):
  - **book pool:** one pool per SKU per book;
  - **Site pool:** one pool per SKU per Site per book.
- A pool runs in the SKU's one stock unit (`POL-04.03`).
- The book comes from the business unit holding the stock (2.2), never from the Site (`PRD-ORG-005`, `PRD-ACP-013`). Two units at one Site in different books have different pools.
- A move between business units at one Site is a location move when the book is the same; a move between pools (7.8) when the book differs; and the commercial or inter-entity process when the legal entity differs (`PRD-FRN-006`).
- **Store value under a book pool.** Store reports need a value per Store (`PRD-NAV-016`, `PRD-LIF-018`), but under a book pool the value belongs to the book. How it is shown per Store is OPEN (SL-14). Until then, reports show the book's value and each Store's quantities only.
- The formula and mode are effective-dated configuration (`PRD-MOD-010`). KDPS's actual formula and pool are OPEN (V-08, V-09, `POL-09.19`); KDPS first keeps its current CA-approved method (`POL-09.21`).

### 7.2 What is in a pool

A unit is in a cost pool only when the Organisation owns it **and** its cost is known.

| Unit | In the pool? | Value shown |
| --- | --- | --- |
| Owned, cost established (PT approved, or opening valuation evidence) | Yes | Its share of the pool |
| Owned, before PT approval | No | **Unknown**, never zero (`PRD-DMG-005`, `PRD-MOD-015`) |
| Supplier- or partner-owned (consignment, or before the agreement's ownership event) | No | Outside owned inventory (`PRD-ORG-015`, `PRD-NAV-015`, `POL-09.03`); its cost for settlement follows the agreement and may be known only at sale (`POL-01.13`) |
| Written off | No | Zero, known (`PRD-DMG-011`) |
| In transit, book pool | Yes | Stays in the book pool |
| In transit, Site pool | No pool; held on the dispatch | The value the source pool issued, plus any later cost change (7.7) |

- Units enter a pool when the later of the two events happens: ownership, or cost established. Under FIFO the new layer is dated at that moment.
- Where an agreement passes ownership at sale (`POL-01.05`), the unit is assumed to go in and straight out at the cost the agreement gives at that moment, and never to mix with the pool's average or layers. This is a working assumption, used as the synthetic example G6. The accounting for it is the CA's under `POL-09.03`, and the CA validates it (SL-4).
- A customer return of a supplier-owned unit, and a loss or supplier return of one, follow the brand agreement (`POL-01.05`, `POL-01.13`). The CA decides their accounting (`POL-09.03`). No default is set that a customer return reverts ownership. The customer-return effect is OPEN (SL-4). Supplier-owned goods take no pool value.

### 7.3 Moving weighted average

`PRD-LED-014`, DEC-031.

- The pool keeps a quantity and a value in paise. The average is value ÷ quantity, and it is recalculated each time units enter.
- An outflow of q units takes value × q ÷ quantity, rounded by the configured rule (OPEN, section 12). An outflow that empties the pool takes all its remaining value, so nothing is left behind.

### 7.4 FIFO

- A **cost layer** is a quantity that entered a pool together at one cost (PRD "Words used", DEC-033). Each layer keeps its quantity, value, entry time and lineage: the layer, receipt origin or earlier outflow it came from.
- Outflows take the oldest layer first. Layer order is the time the units entered the pool, in posting order (7.10).
- Cost flow is not physical flow. A sale takes the oldest layer even when the piece sold came from a newer receipt (`POL-09.07`).
- Each outflow records which layers it took, unit by unit for piece-tracked goods.

### 7.5 Outflows and reversals

`PRD-LED-017`, DEC-031.

- **The principle.** Value leaves a pool only by the formula. Value comes back at its original cost only when it returns to the pool, because then the cost it left with is known exactly.
- Every outflow from a pool leaves at the formula cost: sale, transfer to another pool, supplier return, count loss, write-off, and disposal of goods not written off first.
- **Supplier return.** It undoes a receipt, but it is an outflow, so it leaves at the formula cost (DEC-031). Value leaves at departure and is held on the return shipment until handover (7.8). The difference from the supplier's credit is a separate variance, worked out when the credit note is matched (`PRD-OFR-019`). Its account is mapped under the Financial posting policy (OPEN, V-10).
  - Why: under FIFO the receipt's own layer has often been used up by earlier sales; under moving average its cost has blended into the average. Taking the receipt's own cost would empty the wrong layers or could push a pool below zero. One outflow rule avoids both.
  - The price of that choice shows in 11.4: an R2 piece bought at ₹130.00 goes back for a ₹130.00 credit, yet shows a ₹15.00 variance, because FIFO takes the value from R1's older layer.
  - The other common choice is to reverse the receipt's own cost. Either can be defended, so the CA checks this one first (SL-4). If the CA rejects it, `PRD-LED-017` is reopened through a decision record.
- An inflow that undoes an earlier outflow comes back at the cost it left with:
  - **Customer return:** the cost its sale issued. Under FIFO it forms a new layer at that cost, dated at the return, with lineage to the layer the sale took. A piece-tracked return uses the cost recorded for that exact piece. A quantity-tracked return reverses the sale line's newest-taken layer first. Under moving average it is the sale line's value × returned quantity ÷ sold quantity; the last unit returned takes what remains.
  - **Found goods matched to a recorded loss:** the cost the loss took (section 8.4).
  - **Goods coming back from a dispatch or a supplier return shipment** (failed delivery, supplier rejection): the value held on the shipment (7.8).
  - **A reversal of an outflow** made in error: the cost the outflow took.
- **A reversal of an inflow made in error** (a wrong receipt count, opening row, cost established or cost adjustment) takes off the value that inflow added, not the formula cost (`PRD-LED-018`, DEC-034). Under FIFO it comes off the inflow's own layer and the layers that came from it, while they hold units; under moving average, off the pool. Any part that would take a layer or pool below zero is shown as a separate variance. Its account is mapped under the Financial posting policy (V-10).

### 7.6 Unknown cost and cost establishment

- Pre-PT stock has custody but no cost. Its value stays Unknown in every report, total and approval (`PRD-DMG-005`, `PRD-ACP-004`). Totals leave unknown values out and say so (design-language §8).
- An approval whose value basis is unknown follows `PRD-ACS-016`.
- Moving or returning pre-PT stock leaves its value Unknown (`PRD-ACP-004`, `PRD-DMG-008`). Disposing of it creates no fictitious cost, liability or journal (`PRD-DMG-016`, `POL-17.07`).
- PT approval establishes the receipt origin's cost: the P RATE of the covering revision (`PRD-PTW-010`). The units enter the pool then (7.2). If they are in transit between pools at that moment, the dispatch takes the value and they enter the destination pool with it.
- A provisional amount on inbound ownership, or a provisional valuation under `POL-09.02`, stays outside the ledger. It is a reconciling item between the ledger's inventory value and the books (`PRD-ORG-018`, `PRD-LED-008`).

### 7.7 Late cost changes

`PRD-LED-006`, `PRD-LED-016`, `POL-09.08`, DEC-031.

A later approved change of a receipt origin's cost (for example a freight addition or a price credit) is recorded as its own movement, linked to the receipt and its evidence. It follows its goods:

- **FIFO:** through the receipt's cost layer and its lineage. Units still in the layer, or in layers that came from it (a transfer into a Site pool, a customer return), change those layers' value. Units the layer issued carry their share to where they went.
- **Moving average:** through the receipt's own units, which the receipt origin tracks. Units still held change the value of the pool that holds them. Units gone carry their share to where they went.
- **Goods in transit between pools** (7.8) count as units still held. The dispatch's value changes by their share, and they enter the destination pool at the adjusted value. Under FIFO the dispatch keeps the source layers it took, so the lineage reaches them; under moving average the receipt origin names them. Units missing at arrival are adjusted on the dispatch too. Golden scenario G7 checks this.
- "Where they went": cost of goods sold for a sale; the supplier claim for a supplier return; the loss for a write-off or count loss. The accounts come from the posting maps (V-10).
- A PT correction that changes an approved P RATE is a cost adjustment (`PRD-REC-019`).
- A pool's value never falls below zero. Any excess goes with the share for units gone. When no units are gone, the excess goes to cost of goods sold as its own line, because earlier outflows were costed too high (`PRD-LED-016`, DEC-034).

### 7.8 Transfers between pools

- **Same pool** (a book pool, or a within-Site move): custody moves, value does not.
- **Different pools** (Site pools, or two books): the source pool issues at its formula cost when the goods are dispatched. The dispatch holds that value while in transit. At the destination count the counted units enter the destination pool at that value, with no markup (`PRD-LED-015`, `PRD-TRF-012`). Under FIFO the destination gets one layer per source layer, dated at arrival.
- Units missing at arrival keep their value on the dispatch until the discrepancy is resolved (`PRD-TRF-018`): found, they enter the destination pool; lost, they leave as a loss under approval. No destination receipt is invented (`PRD-ACP-006`).
- Excess at arrival is held as excess; it brings no value until its route is settled (`PRD-TRF-016`, `PRD-REC-013`).
- A failed delivery comes back to the source pool at the dispatch's value (`PRD-TRF-019`).
- **Supplier return shipments** work the same way in both pool modes, because the goods are leaving the business: value leaves the pool at departure and is held on the shipment. It leaves for good at confirmed handover or supplier receipt (`PRD-TRF-020`). Goods the supplier refuses come back at the shipment's value (`PRD-OFR-014`).
- Ordinary internal movement stays inside its legal entity (`PRD-TRF-004`). An ownership change between entities uses the commercial or inter-entity process, not a transfer (`PRD-FRN-006`).

### 7.9 Write-off, disposal and net realisable value

- **Write-off** takes established value out of the pool at the formula cost. The goods stay in custody, unavailable, with value zero (`PRD-DMG-011`, `POL-17.05`). Unknown pre-PT cost has nothing to write off (`POL-17.07`).
- **Disposal** ends custody. If the goods were not written off first, their value leaves at the formula cost as a loss. After a write-off it takes no further value, so loss is never counted twice (`PRD-DMG-015`).
- **Net realisable value write-down** lowers pool value without moving goods (`PRD-LED-007`). How a write-down is worked out and spread, under either formula, and how it is reversed, is OPEN (SL-5).

### 7.10 Posting order and rounding

- Value is worked out in the order movements are posted to each pool, not in event-time order. Each pool row has a sequence number; each valued movement records the sequence and the pool's quantity and value before and after.
- A late arrival, such as an offline bill uploaded hours later, is valued when it is posted. Its event time is kept for reports. Past values are never recalculated.
- Each valued movement carries its business date and, separately, the accounting date its journal uses. Which accounting date a late movement gets when its business date falls in a locked financial period is OPEN (SL-15; `PRD-LED-009`, `POL-09.12`).
- All amounts are integer paise (`PRD-MOD-014`). The rounding rule for an outflow that does not divide to whole paise is OPEN (section 12). Until it is set, a live operation that needs it stays unavailable (`PRD-SEC-017`).

### 7.11 Hand-off to the books

- Each committed transaction with valued movements writes an outbox event naming them (`PRD-MOD-006`). The finance module turns them into journals under the posting maps (`PRD-LED-003`, `POL-09.11`).
- A missing or invalid map blocks the journal and raises an exception; the movement stays posted (`POL-09.12`). Replay never doubles a journal (`PRD-INT-008`).
- Tally remains KDPS's official book (`POL-11.01`). Valued movements reach the internal ledger from the first stage that records them (`PRD-STG-002`). Only the Tally exchange and full accounting wait for stage 5.

### 7.12 Changing the formula or pool

A change is effective-dated (`PRD-LED-015`). At that moment the old pools close and the new pools open with the same total value per book; the transition is reconciled. How value is divided between new pools (for example a book pool split into Site pools, or FIFO layers regrouped) is OPEN for the CA. No change is planned: KDPS keeps its current method first (`POL-09.21`).

## 8. Counts

`PRD-STK-008`–`PRD-STK-012`, `PRD-STK-014`, DEC-008, DEC-019, `POL-02.21`.

### 8.1 Running a count

- **Full Store count:** stop selling, reconcile tills, fix and freeze the scope, count or scan, review differences, approve, then resume (`PRD-STK-008`).
- **Cycle count:** freeze only the counted items and locations from sale and movement while the count is open (`PRD-STK-009`).
- The freeze blocks every movement into or out of the scope. The expected quantities are the balances at the moment of freezing; they cannot change during the count.
- Piece-tracked goods are counted by piece-ID scan (`PRD-MER-016`). Recounts are new count records; the first count is kept (`PRD-STK-010`).
- Before a full count freezes, the tills are reconciled (`PRD-STK-008`) and the offline queue is reconciled before the freeze starts. This ordering is a design rule; the PRD does not state it (it covers only releasing protected quantity, `PRD-OFF-011`, `PRD-OFF-006`).
- Billed-retained pieces are counted apart from the Store's own stock (6.1).
- Value-only movements, such as a late cost change, may post during a count; they change no quantity.

### 8.2 Differences

- Every difference is recorded, explained and approved. Nothing is adjusted automatically (`PRD-STK-012`).
- The approval value is cost (`PRD-ACS-015`): the formula cost at approval, rechecked under lock at posting. Unknown cost follows `PRD-ACS-016`.
- The configured count tolerance only selects the approver. Within it, the approver set for that tolerance; above it, a higher approver and an owned exception (DEC-008). A Store Manager approves only within configured cost limits (`POL-02.21`). The limits and approvers are OPEN (V-21).
- Only the approval posts count-difference movements.

### 8.3 Shortages

- **Piece-tracked:** the missing pieces are known by ID; their receipt origin and owner are known.
- **Quantity-tracked:** the oldest receipt origin at that place goes first (`PRD-STK-013`).
- Value leaves at the formula cost (7.5).

### 8.4 Surpluses

- **A piece recorded as lost:** reverse that loss. The piece comes back with its receipt origin, owner, coverage and the cost the loss took (`PRD-LED-017`).
- **A piece recorded at another place:** a correction movement from the recorded place to the found place, under approval. Between pools it is valued like a transfer (7.8).
- **A piece recorded as sold, returned to its supplier or disposed of** (`PRD-STK-015`, DEC-035). A mis-scan can cause it: the bill names piece A while the customer took piece B of the same SKU. An approver links A to the movement that wrongly named it, and a correction record swaps the two: A comes back into custody with its own receipt origin, coverage and cost, and B is recorded as the piece that left. The bill or other document never changes. Both pieces are the same SKU in the same pool, so no value moves. With no matching missing piece, or a different SKU, A is held with an ordinary hold and an owned exception.
- **Goods of a known SKU with no known receipt origin**, piece-tracked without an ID or quantity-tracked (`PRD-STK-014`, DEC-032): custody held as excess, with owner, PT coverage and cost unknown. It becomes available only when the approver links it to a recorded loss of the same SKU (that loss is reversed with its origin, owner, coverage and cost) or when its owner is established and a PT for the counted quantity is approved, as for opening stock.
- **Goods whose SKU is unknown:** unidentified; quarantined until their identity is resolved through the applicable route (`PRD-DMG-010`, `PRD-REC-012`).

## 9. The earlier POS and the switch

`PRD-LIF-003`, `PRD-LIF-012`–`PRD-LIF-016`, `PRD-LIF-025`–`PRD-LIF-027`, DEC-030.

- Opening stock works the same for every Site, warehouse or Store: an empty unit declares zero, and existing stock enters only through a verified opening count (`PRD-LIF-003`, `PRD-LIF-004`). Today `POL-14.07` allows real opening stock only at a Store's switch. When each Site goes live on production is a rollout question (SL-9); no answer changes the ledger.
- While a Store's earlier POS is active, it does all real billing. Nobody scans goods twice. Bills made in the app during the test only test the app.
- The earlier POS's end-of-day sales report and SOH are imported through saved layouts with duplicate controls (`PRD-LIF-013`). They are evidence for checking and reports only. They never create, reduce or move stock (`PRD-LIF-014`). They create no tax invoice and no sale (`PRD-LIF-016`).
- Test bills on the test setup move test stock in the test database only. Nothing moves from the test setup to production ([deployment.md](../platform/deployment.md)).
- **At the switch** (production hosting only, `PRD-LIF-026`):
  1. Run a full Store count (8.1). Label every piece of a piece-tracked profile that has no piece ID and verify every piece ID (`PRD-LIF-025`).
  2. The verified count becomes the Store's opening stock (`PRD-LIF-027`): opening count movements with opening receipt origins. Each needs a reviewed manifest, physical verification, authorised variances, an opening PT and Site acceptance (`PRD-LIF-004`), and identity, quantity, location and valuation evidence (`PRD-LIF-005`). Operations verifies the manifest, including ownership; Accounts verifies the values (`POL-14.02`, `POL-14.03`).
  3. A counted row without the valuation evidence `PRD-LIF-005` requires is not opening stock. It is held as excess, as for a count surplus (`PRD-STK-014`), until the evidence and an opening PT arrive.
  4. Billed-retained items carried across the switch (`POL-14.04`) are counted apart and keep their earlier-POS bill reference. Whether they carry cost-pool value, and whether they count as opening stock under `PRD-LIF-027`, is OPEN (SL-17). The PRD has no carve-out for them; one needs a decision record first.
  5. Opening stock creates no supplier delivery, booking, invoice, liability or automatic journal (`PRD-LIF-008`).
  6. Reconcile the count with the earlier POS's last SOH and report every difference (`PRD-LIF-027`).
  7. Piece rules apply from this count on (`PRD-MER-017`).
- A customer return of a bill made on the earlier POS has no sale in the app to take its cost from. It waits for the later plan to bring the earlier POS's data into the app (SL-10).

## 10. Doing it safely when people act at once

`PRD-INT-002`–`PRD-INT-005`.

### 10.1 Idempotency

- Every write carries an idempotency key, scoped by operation kind and by the user or device that sent it. An offline bill uses its device, tax registration, financial year and bill number (`PRD-OFF-009`, `PRD-POS-020`, `PRD-OFF-012`).
- The ledger keeps the key, a hash of the request and the result.
  - Same key, same content: return the first result. No second effect.
  - Same key, different content: reject, and keep the request for investigation (`PRD-INT-002`).
- Imported files use their source identity as the key. A corrected file reuses that identity with different content: it is refused as a conflict, or accepted as a governed revision that reverses the earlier effects and posts the new ones, once (`PRD-IMP-011`, `PRD-ACP-012`).

### 10.2 One transaction

Number allocation, movements, balance rows, pool rows, monetary records, approval evidence, audit and outbox commit together, or none of them do (`PRD-INT-004`). A document's lines post together; one failing line fails the document (`PRD-IMP-012`).

The valued movement and its balance and pool rows commit with the movement. Journals follow through the outbox under the posting maps (7.11; `PRD-MOD-006`, `POL-09.12`). How `PRD-MOD-013` (balanced journals per book at commit) is met when journals follow through the outbox is OPEN (SL-21).

### 10.3 Lock order

Every transaction takes row locks in this order, and in ascending ID order inside each step (`PRD-INT-003`):

1. The business document rows (and their approval rows).
2. Receipt origin rows. A late cost change works out which pools and dispatches it touches here, under this lock.
3. Stock balance rows for each affected Site, business unit and SKU. Missing rows are first created, idempotently, in the same key order.
4. Piece rows.
5. Hold and reservation rows.
6. Cost pool rows, and dispatch or shipment value rows.
7. Number series rows, last, so a shared series is held for the shortest time (10.2).

All locks are taken before the first write. Two transactions therefore always queue in the same order and cannot deadlock each other.

### 10.4 Rechecks under the locks

After locking, before writing, recheck (`PRD-INT-003`):

- the actor's role assignment, scope and limit;
- the document version equals the approved version (`PRD-ACS-007`);
- the document state;
- independent approval: the approver is not the preparer (`PRD-ACS-006`);
- the quantity: available stock covers the request, the pieces are where the document says, and no freeze has started.

Database constraints keep balances, layers and pool quantities from going below zero, as a last guard (`PRD-INT-005`).

### 10.5 Offline bills and imports that do not fit

The offline counter sells from its protected quantity (6.1). On upload, each bill posts against it in posting order (7.10). A bill that does not fit goes to the visible reconciliation queue and is never discarded (`PRD-OFF-009`, `PRD-OFF-014`). Its stock effect posts when the Store Manager resolves it; Accounts handles any money difference (`POL-16.05`).

An EBO import that sells more than the app holds at that Store goes to the same kind of queue, with an owned exception (`PRD-EBO-003`, `PRD-EBO-005`, `PRD-EXC-001`, `PRD-INT-005`). This queue is a design rule; the PRD does not state it (OPEN, SL-19).

### 10.6 Large documents

A few documents touch thousands of rows at once: approving a large PT (the PRD's performance table uses a 10,000-line PT import), posting a Site's opening stock, approving a full Store count. Under a book pool, the cost pool rows they lock are shared by every Store, so counter sales of the same SKUs would wait behind them. Counters must not wait on background work (`PRD-PRF-003`).

- **Staged commit.** All slow work happens before any lock: validation, matching, and working out quantities and inflow values. Outflow values (count shortages, write-offs) depend on posting order, so they are worked out under the pool locks (7.10). The posting transaction then only locks, rechecks and writes, with set-based writes in the lock order. One document is still one transaction (`PRD-INT-004`, `PRD-IMP-012`).
- **One at a time.** Large postings run as queued jobs, one at a time per accounting book, never inside a user's request. The approval click records only a request to post, naming the approved version, and the document shows Posting. The job then runs the whole transaction of 10.2 (number allocation, movements, balance and pool rows, monetary records, approval evidence, audit and outbox), rechecking under the locks (10.4). If the job fails, nothing is posted and the document shows the failure. Where the approver's identity and the approval time are held between the click and the job, and what happens to the approval if the job fails, is OPEN (SL-22; product owner; blocks stage 1). Only the outbox follow-up, such as journals, runs after the job's commit (`PRD-MOD-006`, `PRD-INT-004`).
- **Measured.** Performance tests post a 10,000-line PT approval, a full Site opening and a full count approval while counters sell at the reference workload (`PRD-PRF-001`). Pass: counter finalisation stays inside its PRD target.
- **If the test fails**, the next step is to post one document in ordered chunks, each its own short transaction, with nothing usable until the last chunk commits. That bends `PRD-INT-004` ("commit together or commit none"), so it needs a PRD decision first (SL-11).

## 11. Golden scenarios

Stage 1 exit check: receipt, transfer, sale, return and late cost adjustment pass under both cost formulas and both pool modes (`phases.md` stage 1, `PRD-LED-014`, `PRD-LED-015`, `PRD-ACP-018`). These scenarios fix the stock values; the journals posted from them (the posting half of the stage 1 check) belong to the financial posting design.

> **All data in this section is SYNTHETIC.** It is test data only and never becomes a default, a KDPS value or a policy value.

### 11.1 The story

- One book, BK-SYN. Two Sites: warehouse W1 and Store S1, both in BK-SYN and both live on the app (S1 has already switched).
- One SKU, X, piece-tracked. All goods owned from receipt. Costs come from approved PTs.

| Step | What happens |
| --- | --- |
| 1 | Receipt R1 at W1: 10 pieces, P RATE ₹100.00 |
| 2 | Receipt R2 at S1: 6 pieces, P RATE ₹130.00 |
| 3 | Transfer of 4 R1 pieces from W1 to S1: dispatched, counted at S1, accepted |
| 4 | Sale at S1 of 5 pieces: 3 from R1, 2 from R2 |
| 5 | Customer return at S1 of 1 R1 piece from that sale, good, accepted |
| 6 | Late cost change on R1: +₹15.00 a piece, approved |
| 7 | Supplier return from S1 of 1 R2 piece; supplier credit ₹130.00 |

Pieces at the end: W1 has 6 (all R1); S1 has 5 (2 R1, 3 R2). Total cost in: 1,000.00 + 780.00 + 150.00 = **1,930.00**.

### 11.2 Moving average, book pool

One pool: BK-SYN · X. Values in ₹.

| Step | Pool quantity | Pool value | Average | Cost of goods sold (running) | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | 10 | 1,000.00 | 100.00 | 0.00 | |
| 2 | 16 | 1,780.00 | 111.25 | 0.00 | |
| 3 | 16 | 1,780.00 | 111.25 | 0.00 | Same pool: custody moves, value does not |
| 4 | 11 | 1,223.75 | 111.25 | 556.25 | 5 × 111.25 |
| 5 | 12 | 1,335.00 | 111.25 | 445.00 | Back at its sale cost, 111.25 |
| 6 | 12 | 1,455.00 | 121.25 | 475.00 | R1 units held: 8 (+120.00); gone: 2 (+30.00) |
| 7 | 11 | 1,333.75 | 121.25 | 475.00 | Out at 121.25; variance to credit 8.75 |

### 11.3 Moving average, Site pools

| Step | W1: quantity / value (average) | S1: quantity / value (average) | In transit | Cost of goods sold | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | 10 / 1,000.00 (100.00) | — | — | 0.00 | |
| 2 | 10 / 1,000.00 | 6 / 780.00 (130.00) | — | 0.00 | |
| 3 dispatch | 6 / 600.00 (100.00) | 6 / 780.00 | 4 / 400.00 | 0.00 | Out of W1 at 100.00 |
| 3 arrival | 6 / 600.00 | 10 / 1,180.00 (118.00) | — | 0.00 | Into S1 at 400.00, no markup |
| 4 | 6 / 600.00 | 5 / 590.00 (118.00) | — | 590.00 | 5 × 118.00 |
| 5 | 6 / 600.00 | 6 / 708.00 (118.00) | — | 472.00 | Back at 118.00 |
| 6 | 6 / 690.00 (115.00) | 6 / 738.00 (123.00) | — | 502.00 | R1 held: 6 at W1 (+90.00), 2 at S1 (+30.00); gone: 2 (+30.00) |
| 7 | 6 / 690.00 | 5 / 615.00 (123.00) | — | 502.00 | Out at 123.00; variance to credit 7.00 |

### 11.4 FIFO, book pool

Layers are written as quantity @ unit cost.

| Step | Layers | Pool quantity / value | Cost of goods sold | Notes |
| --- | --- | --- | --- | --- |
| 1 | L1 10 @ 100.00 | 10 / 1,000.00 | 0.00 | |
| 2 | L1 10 @ 100.00 · L2 6 @ 130.00 | 16 / 1,780.00 | 0.00 | |
| 3 | unchanged | 16 / 1,780.00 | 0.00 | Same pool |
| 4 | L1 5 @ 100.00 · L2 6 @ 130.00 | 11 / 1,280.00 | 500.00 | Sale takes the oldest layer, L1, though 2 pieces sold were R2 |
| 5 | L1 5 @ 100.00 · L2 6 @ 130.00 · L3 1 @ 100.00 | 12 / 1,380.00 | 400.00 | L3 dated step 5, lineage L1 |
| 6 | L1 5 @ 115.00 · L2 6 @ 130.00 · L3 1 @ 115.00 | 12 / 1,470.00 | 460.00 | L1 line: 5 in L1 (+75.00), 1 in L3 (+15.00), 4 gone (+60.00) |
| 7 | L1 4 @ 115.00 · L2 6 @ 130.00 · L3 1 @ 115.00 | 11 / 1,355.00 | 460.00 | Out from L1 at 115.00; variance to credit 15.00 |

### 11.5 FIFO, Site pools

| Step | W1 layers | S1 layers | Cost of goods sold | Notes |
| --- | --- | --- | --- | --- |
| 1 | L1 10 @ 100.00 | — | 0.00 | |
| 2 | L1 10 @ 100.00 | L2 6 @ 130.00 | 0.00 | |
| 3 | L1 6 @ 100.00 (600.00) | L2 6 @ 130.00 · L3 4 @ 100.00 (1,180.00) | 0.00 | Dispatch takes 4 from L1 (400.00); arrival makes L3, lineage L1 |
| 4 | L1 6 @ 100.00 | L2 1 @ 130.00 · L3 4 @ 100.00 (530.00) | 650.00 | Sale takes S1's oldest layer, L2 |
| 5 | L1 6 @ 100.00 | L2 1 @ 130.00 · L3 4 @ 100.00 · L4 1 @ 130.00 (660.00) | 520.00 | Back at the 130.00 its sale took; L4 lineage L2 |
| 6 | L1 6 @ 115.00 (690.00) | L2 1 @ 130.00 · L3 4 @ 115.00 · L4 1 @ 130.00 (720.00) | 520.00 | L1 line: 6 in L1 (+90.00), 4 in L3 (+60.00), none gone |
| 7 | L1 6 @ 115.00 (690.00) | L3 4 @ 115.00 · L4 1 @ 130.00 (590.00) | 520.00 | Out from L2 at 130.00; variance to credit 0.00 |

### 11.6 Expected end state

| Formula and pool | Stock value | Cost of goods sold | Value out by supplier return | Variance to the ₹130.00 credit |
| --- | --- | --- | --- | --- |
| Moving average, book | 1,333.75 | 475.00 | 121.25 | 8.75 |
| Moving average, Site | 1,305.00 (W1 690.00, S1 615.00) | 502.00 | 123.00 | 7.00 |
| FIFO, book | 1,355.00 | 460.00 | 115.00 | 15.00 |
| FIFO, Site | 1,280.00 (W1 690.00, S1 590.00) | 520.00 | 130.00 | 0.00 |

In every row, stock value + cost of goods sold + value out by supplier return = 1,930.00. Every amount is whole paise.

### 11.7 Checks run after every step

- Each balance equals the sum of its movements; rebuilding the balance tables from movements gives the same rows.
- Each FIFO pool's quantity and value equal the sum of its layers.
- Total cost in = stock value + value held on open dispatches + every outflow's value, per book.
- No balance, layer or pool goes below zero. No zero stands in for an unknown value.
- Every piece is in exactly one place.

### 11.8 Further scenarios

| # | Scenario | Must show |
| --- | --- | --- |
| G2 | Receipt counted, PT not yet approved; one piece disposed of; PT then approved | Custody without cost; value Unknown in reports; pool unchanged; the disposal makes no value and no journal; PT approval puts the rest into the pool (`PRD-ACP-004`) |
| G3 | Count with a shortage and a surplus | Nothing posts before approval; the tolerance only selects the approver; a quantity surplus with no origin is held excess; linking it to a recorded loss reverses that loss at its cost (`PRD-STK-012`, `PRD-STK-014`) |
| G4 | Earlier-POS sales report and SOH loaded twice | No movement, balance or pool changes; the second load has no effect (`PRD-LIF-014`, `PRD-IMP-011`) |
| G5 | Damage report on reserved stock, then rejected; transfer then cancelled | The damage hold blocks dispatch at once; rejection clears only the damage hold; cancellation clears only its reservation (`PRD-ACP-005`, `PRD-TRF-022`) |
| G6 | Consignment piece received, then sold | Outside the pool while in custody; at its sale it passes through at its agreed cost (`PRD-ORG-015`); a working assumption pending SL-4, as in 7.2 |
| G7 | Site pools. After step 3's dispatch and before its arrival, R1's cost rises by ₹15.00 a piece | Moving average: W1 becomes 6 / 690.00; the dispatch goes from 400.00 to 460.00; after arrival S1 is 10 / 1,240.00 (124.00). FIFO: W1's L1 becomes 6 @ 115.00; the dispatch's 4 @ 100.00 becomes 4 @ 115.00 and arrives as L3 4 @ 115.00. No value is lost between pools (7.7) |
| G8 | Quantity-tracked SKU with two receipt origins at one place; a sale by SKU barcode | The older origin goes down first; with batch or expiry, the soonest expiry (`PRD-STK-013`) |
| G9 | FIFO: one quantity-tracked sale line takes units from two layers; part of it comes back | The return takes the newest-taken layer first, at that layer's cost (7.5) |
| G10 | A moving average that does not divide into whole paise | Filled in once the rounding rule is set (SL-2). An outflow that empties the pool leaves no residue (7.3) |
| G11 | Supplier return shipment: part handed over, part refused and brought back | Value leaves at departure; the refused part comes back at the shipment's value (7.8) |
| G12 | A count finds piece A, which the ledger shows as sold; piece B of the same SKU is missing | After approval A is back in custody with its own history, and B is recorded as sold. The bill is unchanged. No value moves (`PRD-STK-015`) |
| G13 | Step 1 was miscounted: only 6 of R1's 10 pieces arrived. Found after step 2 and reversed | The reversal takes off 4 × 100.00 = 400.00, R1's own value. Book pool, both formulas: 12 / 1,380.00, average 115.00; under FIFO, L1 becomes 6 @ 100.00. W1 holds 6 (`PRD-LED-018`) |

### 11.9 Concurrency tests

Run on real PostgreSQL with Testcontainers (`PRD-SEC-016`, `PRD-ACP-018`).

- Two tills sell the last piece at once: one succeeds, one is refused.
- Two transfer approvals reserve the same quantity: one succeeds (`PRD-INT-005`).
- The same request sent twice: one effect and the same result. The same key with changed content is refused and kept (`PRD-INT-002`).
- Sales of one SKU at two Stores under a book pool: values follow posting order; no deadlock.
- A count freeze starts while a sale is in flight: the sale is refused under the lock.
- A document changed after approval: posting is refused (`PRD-ACS-007`).
- Two documents take numbers from one shared series while touching the same stock: no deadlock (10.3).
- A 10,000-line PT approval posts while counters sell the same SKUs under a book pool: counter finalisation stays inside its target (10.6).

## 12. Open questions

Nothing below has a default. Each live operation that needs one stays unavailable until it is set (`PRD-SEC-017`). Design and synthetic tests do not wait.

| # | Question | Who decides | Blocks |
| --- | --- | --- | --- |
| SL-1 | KDPS's actual cost formula and pool mode: today's method (V-08), then its confirmation (V-09) | Accounts, CA | 1 (V-08); 2 (V-09) |
| SL-2 | Rounding rule for an outflow, or a customer return under moving average, that does not divide to whole paise | Accounts, CA | 2 |
| SL-3 | Accounts for the supplier-return variance, late-cost shares of goods gone, late-cost excess in cost of goods sold, and the variance left by a reversal of an inflow (V-10) | Accounts, CA | 2 |
| SL-4 | Validate these rules with real cases (`POL-09.06`). First, the supplier return: it leaves at the formula cost, not the receipt's own cost, so a variance appears even when the supplier credits the purchase price (7.5, 11.4). Then: late-cost split and its excess to cost of goods sold (7.7), reversals at their original cost, and reversals of mistaken inflows at their own value (7.5), FIFO layers dated when units enter the pool (7.4), valuation in posting order (7.10), consignment pass-through (7.2), including whether a customer return of a pass-through unit reverses ownership and what a supplier-owned unit's loss or supplier return costs under its agreement (`POL-01.05`, `POL-01.13`) | CA; product owner for the ownership effect | 2 |
| SL-5 | How a net realisable value write-down is worked out and spread under each formula, and how it is reversed | CA | 5 |
| SL-6 | How value is divided when the formula or pool mode changes (7.12) | CA | Before any change |
| SL-7 | Count cost limits and approvers (V-21) | KDPS Owner, Operations | 3 |
| SL-8 | Batch/expiry categories and shelf-life days (V-05, `POL-04.08`) | Booking, Operations | 1 |
| SL-9 | Rollout order on production: when a warehouse goes live and loads its opening stock (`POL-14.07` now allows it only at a Store's switch); how goods move between a Site on the app and a Store not yet switched; direct deliveries to such a Store (`PRD-REC-004`). No answer changes the ledger | Product owner; KDPS for `POL-14.07` | Before the first live use on production. Not a build blocker |
| SL-10 | A customer return with no sale in the app to take its cost from: an EBO return not linked to its imported sale, a return of an earlier-POS bill after the switch, a no-bill return (`PRD-RET-017`), and a return at a Store in another book or legal entity. Which receipt origin, owner and cost it takes. Waits for the later plan to bring the earlier POS's data into the app; that plan needs a decision record, because `PRD-LIF-010` imports old sales for reports only. Such returns stay unavailable until then | Product owner; CA for another legal entity | 4 |
| SL-11 | Posting one large document in ordered chunks, if the staged commit fails the counter performance test (10.6). It bends `PRD-INT-004`, so it needs a PRD decision first | Product owner | Only if that test fails |
| SL-14 | How Store value is shown under a book pool (7.1), for Store net asset value and closure (`PRD-NAV-016`, `PRD-LIF-018`) | Accounts, CA | 5 |
| SL-15 | The accounting date of a late valued movement whose business date falls in a locked financial period (7.10) | Accounts, CA | 5 |
| SL-17 | Whether a billed-retained sale's value leaves the pool at the bill or at handover (6.1; V-35); then whether a cancelled sale's goods return at a cost; and whether billed-retained items carried across the switch carry pool value or count as opening stock (9, step 4; `POL-14.04`, `POL-08.06`, `POL-09.04`). A carve-out from `PRD-LIF-027` needs a decision record | CA; product owner for the opening-stock question | 4 |
| SL-18 | How piece-tracked goods arrive at, leave and are counted at an EBO Store that reports through brand software, and what event ends "until it bills in Apparel OS" there (5; `PRD-EBO-011`, `PRD-MER-003`, `PRD-MER-016`). Any exception to piece scanning needs a decision record | Product owner | 4 |
| SL-19 | The reconciliation queue and owned exception for an EBO import that sells more than the app holds at that Store (10.5). The PRD does not state it | Product owner | 4 |
| SL-20 | Undoing a mistaken damage confirmation by a reversal (2.3). The PRD covers only rejecting a report before confirmation (`PRD-DMG-003`) | Product owner | 2 |
| SL-21 | How `PRD-MOD-013` (balanced journals per book at commit) is met when journals follow the movement through the outbox (10.2, 7.11); settled in the financial posting design (GC-4) | Product owner; CA | 1 |
| SL-22 | Where the approver's identity and the approval time are held between the approval click and the posting job of a large document, and what happens to the approval if the job fails (10.6; `PRD-INT-004`, `PRD-ACS-006`) | Product owner | 1 |

SL-12, SL-13 and SL-16 were settled by DEC-034 and DEC-035; their numbers are not reused.
