# Stock ledger

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Current**, 3 Oct 2026, for sections 1 to 12. Sections 13 to 15 (interface, tables, synthetic harness) were approved by the product owner on 6 Oct 2026 (RR-012), with two fixes to the cost pool (14.2) and the amendments of 10.3, 14.1 and 14.3 for SL-24 and SL-25 (RR-227, RR-228); SL-25 (a) stays open until stage 3, and SL-25 names two questions the amended (d) raises. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements these PRD sections: Stock and warehouse control; Ledger and official books (cost formulas and pools); Merchandise and identifiers (piece and quantity tracking); Receiving and price tickets, Transfers and physical movement, Damage, quarantine and disposal (their stock effects); Opening, closure, migration and export (the switch); Module and data boundaries; Transaction and integration integrity.

- PRD IDs: `PRD-STK-001`–`PRD-STK-006`, `PRD-STK-008`–`PRD-STK-017`; `PRD-LED-003`, `PRD-LED-005`–`PRD-LED-009`, `PRD-LED-014`–`PRD-LED-018`; `PRD-MER-003`, `PRD-MER-006`, `PRD-MER-010`–`PRD-MER-012`, `PRD-MER-014`–`PRD-MER-018`; `PRD-REC-004`, `PRD-REC-006`, `PRD-REC-008`, `PRD-REC-009`, `PRD-REC-012`, `PRD-REC-013`, `PRD-REC-015`, `PRD-REC-017`, `PRD-REC-019`, `PRD-REC-021`, `PRD-REC-022`; `PRD-PTW-010`; `PRD-ORG-001`, `PRD-ORG-005`, `PRD-ORG-009`, `PRD-ORG-012`, `PRD-ORG-014`, `PRD-ORG-015`, `PRD-ORG-017`–`PRD-ORG-020`; `PRD-TRF-004`, `PRD-TRF-006`–`PRD-TRF-013`, `PRD-TRF-016`, `PRD-TRF-018`–`PRD-TRF-020`, `PRD-TRF-022`, `PRD-TRF-023`; `PRD-DMG-001`–`PRD-DMG-003`, `PRD-DMG-005`–`PRD-DMG-012`, `PRD-DMG-015`, `PRD-DMG-016`; `PRD-OFR-008`, `PRD-OFR-012`, `PRD-OFR-014`, `PRD-OFR-016`, `PRD-OFR-019`; `PRD-RET-013`, `PRD-RET-017`; `PRD-POS-018`, `PRD-POS-020`; `PRD-OFF-004`, `PRD-OFF-006`, `PRD-OFF-009`, `PRD-OFF-011`, `PRD-OFF-012`, `PRD-OFF-014`; `PRD-EBO-003`, `PRD-EBO-005`, `PRD-EBO-011`; `PRD-LIF-003`–`PRD-LIF-005`, `PRD-LIF-008`, `PRD-LIF-010`, `PRD-LIF-012`–`PRD-LIF-016`, `PRD-LIF-018`, `PRD-LIF-025`–`PRD-LIF-028`; `PRD-IMP-010`–`PRD-IMP-012`; `PRD-ACS-006`–`PRD-ACS-008`, `PRD-ACS-013`–`PRD-ACS-016`; `PRD-MOD-002`, `PRD-MOD-003`, `PRD-MOD-006`, `PRD-MOD-008`–`PRD-MOD-015`; `PRD-INT-002`–`PRD-INT-005`, `PRD-INT-008`; `PRD-PRF-001`, `PRD-PRF-003`, `PRD-PRF-004`; `PRD-STG-002`; `PRD-SEC-005`, `PRD-SEC-016`–`PRD-SEC-018`; `PRD-NAV-015`, `PRD-NAV-016`; `PRD-FRN-006`; `PRD-EXC-001`, `PRD-EXC-002`; `PRD-UXP-003`; `PRD-ACP-001`–`PRD-ACP-006`, `PRD-ACP-012`, `PRD-ACP-013`, `PRD-ACP-018`, `PRD-ACP-020`.
- Policies: 1 (`POL-01.05`, `POL-01.07`, `POL-01.13`), 2 (`POL-02.09`, `POL-02.12`, `POL-02.16`, `POL-02.21`, `POL-02.24`), 3 (`POL-03.03`), 4 (`POL-04.03`–`POL-04.09`), 6 (`POL-06.02`), 7 (`POL-07.08`), 8 (`POL-08.02`, `POL-08.03`, `POL-08.05`, `POL-08.06`), 9 (`POL-09.02`–`POL-09.08`, `POL-09.11`, `POL-09.12`, `POL-09.19`, `POL-09.21`), 10 (`POL-10.01`), 11 (`POL-11.01`), 14 (`POL-14.02`–`POL-14.04`, `POL-14.07`), 16 (`POL-16.04`, `POL-16.05`), 17 (`POL-17.01`, `POL-17.02`, `POL-17.05`, `POL-17.07`).
- Decisions: DEC-002, DEC-004, DEC-008, DEC-019, DEC-023, DEC-030, DEC-031, DEC-032, DEC-033, DEC-034, DEC-035, DEC-054, DEC-055, DEC-059, DEC-066, DEC-069, DEC-071, DEC-087, DEC-088, DEC-089, DEC-090, DEC-091, DEC-097, DEC-105, DEC-112, DEC-116.

Used by: the future designs for receiving, PT, transfers, counts, supplier returns, the counter, EBO imports, the switch and financial posting. Each of them posts stock through this ledger.

---

## 1. What the ledger is

- One stock module owns the ledger's records. Other modules never read or write its tables; they call its interface (`PRD-MOD-002`).
- Every stock effect of a business action is written through that interface in the same database transaction as the action (`PRD-MOD-006`, `PRD-INT-004`). For a large document the action is its posting job, which is one transaction (10.6). The balanced journals per book for a valued movement are written in that same transaction (`PRD-MOD-013`, DEC-087). Durable follow-up, such as messages and the Tally exchange, goes through the outbox.
- Reports read declared read models of the ledger with an as-of time (`PRD-MOD-003`).
- The ledger records stock and its cost. It writes no journal itself: it calls the finance module's posting interface inside the movement's transaction (section 7.11, DEC-087).
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
| Location move | Within one Site: floor, backstore, rack, bin; keeps condition and acceptance (`PRD-STK-005`). Also a move between business units at one Site, only when book, legal entity and tax registration are unchanged (7.1, `DEC-066`). Putaway at the selling Site in stage 2; general within-Site move screens in stage 3 (`DEC-055`) | 2 (putaway); 3 (general within-Site move screens) |
| Condition change | Good to damaged, wrong or unidentified. Wrong or unidentified goods return to good only through the identity route (`POL-17.02`). Damaged goods never become good stock (`PRD-DMG-010`). A mistaken report is rejected before confirmation (`PRD-DMG-003`). Undoing a mistaken confirmation uses a linked reversal (`PRD-STK-017`, `PRD-ACS-014`) | 2 |
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
| Custody | Where the goods physically are, in what condition, held by whom | Movements and balances | Receipt, opening and count-difference counts; arrival, failed-delivery return and supplier-rejection return counts; location and condition moves; dispatch and supplier-return departure; sale issue and customer return; supplier handover and disposal | Invoice, booking or PT quantities (`PRD-REC-008`); approvals alone; earlier-POS imports (`PRD-LIF-014`) |
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

`PRD-MER-003`, `PRD-MER-014`–`PRD-MER-018`, DEC-002, DEC-023, DEC-054.

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
- An EBO Store on brand software follows `PRD-MER-003` and `PRD-MER-016` for piece-tracked goods: piece IDs are kept and scanned; EBO imports name no piece only for sales reporting (`PRD-EBO-011`, DEC-023, DEC-088). The event that ends "until it bills in Apparel OS" at such a Store is the Store's switch to billing in Apparel OS (SL-18, DEC-105).
- A profile changed from quantity-tracked to piece-tracked while stock exists starts piece rules only at a labelling count: every piece of that profile is counted, labelled and verified at each Site, and piece rules start from that count (`PRD-MER-018`, `POL-04.09`, `DEC-054`).

**Batch and expiry.** Required only where the profile says so. Goods that fail the configured shelf-life rule are held (`POL-04.05`). The categories and day limits are OPEN (V-05, `POL-04.08`).

## 6. Holds, reservations and sellable stock

### 6.1 Kinds

Every hold and reservation is its own record: kind, the pieces or quantity it covers, reason, who raised it, evidence, and the event that releases it.

| Kind | Raised by | Released only by | IDs |
| --- | --- | --- | --- |
| Damage hold | A damage report, at once, before confirmation | Independent rejection of that report; confirmation turns it into a damaged condition | `PRD-DMG-001`–`PRD-DMG-003`, `PRD-ACP-005` |
| Quarantine | Damaged, wrong or unidentified condition | An approved decision for that goods; never by time | `PRD-DMG-006`, `PRD-DMG-010`, `PRD-REC-012` |
| Excess hold | Receiving excess; a count surplus with no known origin | Explicit authority and the PT route; for a count surplus with no known origin, its owner established and a PT for the counted quantity approved (8.4); or a link to a recorded loss | `PRD-REC-013`, `PRD-STK-014` |
| Source-conflict hold | An open cost, MRP, attribute or tax conflict on the line | Resolution of that conflict | `POL-03.03` |
| Expiry hold | Failing the configured shelf-life rule | A rule change, supplier return, write-off or disposal | `POL-04.05` |
| Ordinary hold | A person, to settle a question | That person's or an authorised release | `PRD-STK-001` |
| Count freeze | An open count over its scope | Count closure | `PRD-STK-008`, `PRD-STK-009`, DEC-019 |
| Transfer reservation | Transfer approval | Dispatch or explicit cancellation; never by time | `PRD-TRF-006`–`PRD-TRF-010`, `PRD-TRF-022` |
| Supplier-return reservation | Approved return list | Departure or explicit withdrawal | `PRD-OFR-012`, `PRD-OFR-016` |
| Offline protected quantity | Allocation to the Store's offline counter | Release only while online, after sequence and queue reconciliation and a durable local and central billing pause | `PRD-OFF-006`, `PRD-OFF-011`, `POL-16.04` |
| Inspection hold | A cancelled billed-retained sale coming back | Inspection | `POL-08.05` |
| Write-off hold | A write-off: the goods stay in custody, unavailable (7.9). **Proposed** | Disposal of the goods, or a reversal of the write-off | `PRD-DMG-011`, `POL-17.05` |
| Held-goods reservation | Approval of a quarantine movement, a supplier return of damaged, wrong or excess goods, or a pre-PT custody movement, under its own authority | Departure or explicit cancellation | `PRD-DMG-007`–`PRD-DMG-009`, `POL-17.01` |

Count freeze, Inspection hold and Write-off hold are kinds of Hold, and Held-goods reservation is a kind of Reservation (PRD Words used: Hold, Reservation; DEC-069).

**Billed-retained** (PRD Words used, `PRD-POS-018`, `POL-08.02`) is not a hold: goods paid for but still held in the Store until handover, for collection or alteration. Not available for sale or allocation. Alteration and ready-for-collection are tracked apart, piece by piece (`POL-08.03`).

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
6. The billing device holds authority, and S bills in Apparel OS: on production only after S has switched (`PRD-LIF-015`); on the test setup, test bills only (`PRD-LIF-026`), and on `kdps-test` only once the billing policy is signed; until then billing stays disabled there (`DEC-071`).

Ownership does not block a sale: supplier-owned consignment stock can be sellable. Transfer approval uses the same checks without step 6 (`PRD-TRF-006`).

## 7. Cost

### 7.1 Cost pools

- A **cost pool** is the stock over which the cost formula runs (PRD "Words used", DEC-033). Each accounting book chooses one mode (`PRD-LED-015`, DEC-004), for both pools:
  - **whole-book pool:** one pool per SKU across the whole book;
  - **Site pool:** one pool per SKU per Site per book.
- A pool runs in the SKU's one stock unit (`POL-04.03`).
- The book comes from the business unit holding the stock (2.2), never from the Site (`PRD-ORG-005`, `PRD-ACP-013`). Two units at one Site in different books have different pools.
- A move between business units at one Site is a location move only when book, legal entity and tax registration are unchanged (`PRD-STK-005`, `DEC-066`). When the book differs but the legal entity is the same, use the pool-move route (7.8). When the legal entity differs, which always means a different book (`PRD-ORG-020`), use the commercial or inter-entity process (`PRD-FRN-006`). A registration-only change at one Site always needs its statutory document (`PRD-TRF-023`); it is never a location move (MM-13, DEC-105; the CA confirms).
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
- **A reversal of an inflow made in error** (a wrong receipt count, opening row, cost established or cost adjustment) takes off the value that inflow added, not the formula cost (`PRD-LED-018`, DEC-034). Only the part that would take the cost pool below zero is shown as a separate variance (`PRD-LED-018`). Under moving average the value comes off the pool. Under FIFO it comes off the inflow's own layer and the layers that came from it, while they hold units; how any value still to come off is taken from the pool's other layers is OPEN (SL-27), and until it is set such a reversal is refused. Its account is mapped under the Financial posting policy (V-10).

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

- Each valued movement and its balanced journals per book commit in one transaction. The finance module writes the journals under the posting maps (`PRD-MOD-006`, `PRD-MOD-013`, `PRD-LED-003`, `POL-09.11`, DEC-087).
- A missing or invalid map blocks the affected posting and raises an exception (`POL-09.12`). The valued movement then does not commit: the document stays as it was, and an exception is raised in its own transaction (SL-23 Outcome A, DEC-105; the CA confirms). Replay never doubles a journal (`PRD-INT-008`).
- Tally remains KDPS's official book (`POL-11.01`). Valued movements reach the internal ledger from the first stage that records them (`PRD-STG-002`). Only the Tally exchange and full accounting wait for stage 5.

### 7.12 Changing the formula or pool

A change is effective-dated (`PRD-LED-015`). At that moment the old pools close and the new pools open with the same total value per book; the transition is reconciled. How value is divided between new pools (for example a book pool split into Site pools, or FIFO layers regrouped) is OPEN for the CA. No change is planned: KDPS keeps its current method first (`POL-09.21`).

## 8. Counts

`PRD-STK-008`–`PRD-STK-012`, `PRD-STK-014`, DEC-008, DEC-019, `POL-02.21`.

### 8.1 Running a count

- **Full Store count:** stop selling, reconcile tills, fix and freeze the scope, count or scan, review differences, approve, then resume (`PRD-STK-008`).
- **Cycle count:** freeze only the counted items and locations from sale and movement while the count is open (`PRD-STK-009`).
- The freeze blocks every movement into or out of the scope. The expected quantities are the balances at the moment of freezing; they cannot change during the count. A change of value is also a movement (PRD Words used), so a late cost change waits until the count closes. Any later carve-out belongs under the policy 2 item "movement during counts" (`POL-02.24`).
- Piece-tracked goods are counted by piece-ID scan (`PRD-MER-016`). Recounts are new count records; the first count is kept (`PRD-STK-010`).
- Before a full count freezes, the tills are reconciled (`PRD-STK-008`) and the offline queue is reconciled before the freeze starts. This ordering is a design rule; the PRD does not state it (it covers only releasing protected quantity, `PRD-OFF-011`, `PRD-OFF-006`).
- Billed-retained pieces are counted apart from the Store's own stock (6.1).
- A count whose scope holds offline protected quantity freezes only after that quantity is released (6.1; `PRD-OFF-011`), so the freeze holds against every sale (`PRD-STK-009`, `PRD-OFF-006`). Until it is released the count does not freeze.

### 8.2 Differences

- Every difference is recorded, explained and approved. Nothing is adjusted automatically (`PRD-STK-012`).
- The approval value is cost (`PRD-ACS-015`): the formula cost at approval, rechecked under lock at posting. If cost under lock exceeds the approver's limit or the approved amount, posting is refused and the count difference returns for renewed approval (`PRD-ACS-007`, `POL-02.12`, `DEC-066`). Unknown cost follows `PRD-ACS-016`.
- The configured count tolerance only selects the approver. Within it, the approver set for that tolerance; above it, a higher approver and an owned exception (DEC-008). A Store Manager approves only within configured cost limits (`POL-02.21`). The limits and approvers are OPEN (V-21).
- Only the approval posts count-difference movements.

### 8.3 Shortages

- **Piece-tracked:** the missing pieces are known by ID; their receipt origin and owner are known.
- **Quantity-tracked:** the oldest receipt origin at that place goes first; where batch or expiry is tracked, the soonest expiry first (`PRD-STK-013`, DEC-032).
- Value leaves at the formula cost (7.5).

### 8.4 Surpluses

- **A piece recorded as lost:** reverse that loss. The piece comes back with its receipt origin, owner, coverage and the cost the loss took (`PRD-LED-017`).
- **A piece recorded at another place:** a correction movement from the recorded place to the found place, under approval. Between pools it is valued like a transfer (7.8). Between places of different legal entities it is refused and goes to the commercial or inter-entity process (`PRD-TRF-004`, `PRD-FRN-006`; 7.1).
- **A piece recorded as sold, returned to its supplier or disposed of** (`PRD-STK-015`, DEC-035). A mis-scan can cause it: the bill names piece A while the customer took piece B of the same SKU. An approver links A to the movement that wrongly named it, and a correction record swaps the two: A comes back into custody with its own receipt origin, coverage and cost, and B is recorded as the piece that left. The bill or other document never changes. The two pieces must be the same SKU. In the same pool no value moves; in different pools value moves as for a transfer between pools (7.8). With no matching missing piece, or a different SKU, A is held with an ordinary hold and an owned exception. **OPEN (SL-28):** whether a swap between pieces of different owners or legal entities is made as `PRD-STK-015` describes, which would also change what each owner is owed, or is treated as no match; until it is decided, such a pair is treated as no match and goes the source's own route above, held with an exception, so no owner's settlement changes without a decision.
- **Goods of a known SKU with no known receipt origin**, piece-tracked without an ID or quantity-tracked (`PRD-STK-014`, DEC-032): custody held as excess, with owner, PT coverage and cost unknown. It becomes available only when the approver links it to a recorded loss of the same SKU (that loss is reversed with its origin, owner, coverage and cost) or when its owner is established and a PT for the counted quantity is approved, as for opening stock.
- **Goods whose SKU is unknown:** unidentified; quarantined until their identity is resolved through the applicable route (`PRD-DMG-010`, `PRD-REC-012`).

## 9. The earlier POS and the switch

`PRD-LIF-003`, `PRD-LIF-012`–`PRD-LIF-016`, `PRD-LIF-025`–`PRD-LIF-027`, DEC-030.

- Opening stock works the same for every Site, warehouse or Store: an empty unit declares zero, and existing stock enters only through a verified opening count (`PRD-LIF-003`, `PRD-LIF-004`). Today `POL-14.07` allows real opening stock only at a Store's switch. When each Site goes live on production is a rollout question (SL-9); no answer changes the ledger.
- While a Store's earlier POS is active, it does all real billing. Nobody scans goods twice. Bills made in the app during the test only test the app.
- The earlier POS's end-of-day sales report and SOH are imported through saved layouts with duplicate controls (`PRD-LIF-013`). They are evidence for checking and reports only. They never create, reduce or move stock (`PRD-LIF-014`). They create no tax invoice and no sale (`PRD-LIF-016`).
- Test bills on the test setup move test stock in the test database only. On `kdps-test`, billing stays disabled until its policy is signed (`DEC-071`). Nothing moves from the test setup to production ([deployment.md](../platform/deployment.md)).
- **At the switch** (production hosting only, `PRD-LIF-026`):
  1. Run a full Store count (8.1). Label every piece of a piece-tracked profile that has no piece ID and verify every piece ID (`PRD-LIF-025`).
  2. The verified count becomes the Store's opening stock (`PRD-LIF-027`): opening count movements with opening receipt origins. Each needs a reviewed manifest, physical verification, authorised variances, an opening PT and Site acceptance (`PRD-LIF-004`), and identity, quantity, location and valuation evidence (`PRD-LIF-005`). Operations verifies the manifest, including ownership; Accounts verifies the values (`POL-14.02`, `POL-14.03`).
  3. A counted row without the valuation evidence `PRD-LIF-005` requires is not opening stock. It is held as excess, as for a count surplus (`PRD-STK-014`), until the evidence and an opening PT arrive.
  4. Billed-retained items carried across the switch (`POL-14.04`) are counted apart and keep their earlier-POS bill reference. They are not opening stock under `PRD-LIF-027` (`PRD-LIF-028`, `DEC-090`). Their value follows the recognition rule the CA sets under the Financial posting policy; that rule is OPEN (V-35, SL-17).
  5. Opening stock creates no supplier delivery, booking, invoice, liability or automatic journal (`PRD-LIF-008`).
  6. Reconcile the count with the earlier POS's last SOH and report every difference (`PRD-LIF-027`).
  7. Piece rules apply from this count on (`PRD-MER-017`).
- A customer return of a bill made on the earlier POS has no sale in the app to take its cost from. It waits for the later plan to bring the earlier POS's data into the app (SL-10, `DEC-059`). Until then the customer is served under the no-bill return route where policy 7 allows it (`POL-07.08`), and is otherwise refused with the reason shown (SL-10, DEC-105).

## 10. Doing it safely when people act at once

`PRD-INT-002`–`PRD-INT-005`.

### 10.1 Idempotency

- Every write carries an idempotency key (sign-in excepted, [code-house-rules.md](../platform/code-house-rules.md) 12.4), scoped by operation kind and by the user, service identity or device that sent it; a job step uses the job's identity (code-house-rules 12.4). An offline bill uses its device, tax registration, financial year and bill number (`PRD-OFF-009`, `PRD-POS-020`, `PRD-OFF-012`).
- The ledger keeps the key, a hash of the request and the result.
  - Same key, same content: return the first result. No second effect.
  - Same key, different content: reject, and keep the request for investigation (`PRD-INT-002`).
- Imported files use their source identity as the key. A corrected file reuses that identity with different content: it is refused as a conflict, or accepted as a governed revision that reverses the earlier effects and posts the new ones, once (`PRD-IMP-011`, `PRD-ACP-012`).

### 10.2 One transaction

Number allocation, movements, balance rows, pool rows, monetary records, approval evidence, audit and outbox commit together, or none of them do (`PRD-INT-004`). A document's lines post together; one failing line fails the document (`PRD-IMP-012`).

The valued movement, its balance and pool rows, and the balanced journals per book for that movement commit together (`PRD-MOD-013`, `DEC-087`). Durable follow-up still uses the outbox under the posting maps (7.11; `PRD-MOD-006`, `POL-09.12`).

### 10.3 Lock order

Every transaction takes row locks in this order, and in ascending ID order inside each step (`PRD-INT-003`):

0. The rows the actor's authority rests on: the user or service identity, the role assignment, and the approval limits and stand-in grant relied on. In shared mode; a command that changes one of them takes it in exclusive mode, so it waits for the commands relying on it ([code-house-rules.md](../platform/code-house-rules.md) 8.2; `PRD-INT-003`).
1. The business document rows (and their approval rows).
2. Receipt origin rows: exclusive when the origin's state changes, shared when it is only read, as by a sale or a transfer (14.3). A late cost change works out which pools and dispatches it touches here, under this lock.
3. The unit anchor of each affected Site and business unit, shared for every item and exclusive to start or end a count freeze, and stock balance rows for each affected Site, business unit and SKU, in one call (14.3). Missing rows are first created, idempotently, in the same key order.
4. Piece rows.
5. Hold and reservation rows.
6. Cost pool rows, and dispatch or shipment value rows. Missing rows are first created, idempotently, as at step 3; a new pool takes its formula, pool mode and cost-setting version from the cost setting read at Plan (13.1, 14.2).
7. The financial period row, in shared mode (`PRD-LED-009`; DEC-105, module-map MM-6).
8. Number series rows, last, so a shared series is held for the shortest time (10.2).

All locks are taken before the first write, with one exception: steps 3 and 6 create a missing anchor, balance, pool or transit value row empty, and creating it locks it. Nothing that records the command's effects is written until every lock is held. Exclusive locks leave foreign-key checks free ([code-house-rules.md](../platform/code-house-rules.md) 8.2). Two transactions therefore always queue in the same order and cannot deadlock each other.

Steps 2, 3 and 6 were amended by the product owner, 6 Oct 2026 (SL-24, RR-227). Contention on the unit anchor is measured; the builder resolves performance and brings back only a change to business behaviour.

### 10.4 Rechecks under the locks

After locking, before writing, recheck (`PRD-INT-003`):

- the actor is still Active, or the service identity still enabled, and its role assignment, scope and limit;
- the approval decision is Approved and not yet used by another posting (`DEC-097`);
- the document version equals the approved version, or, when a later step of the document posts it, a version the approval carried to through a change that is not material ([access-and-approvals.md](../access/access-and-approvals.md) 9.6); a queued posting takes only the version its request to post names (`PRD-ACS-007`, `POL-02.12`, `DEC-097`);
- the document state;
- independent approval: the approver is not the preparer (`PRD-ACS-006`);
- the quantity: available stock covers the request, the pieces are where the document says, and no freeze has started;
- the value on its basis: if cost under lock exceeds the approver's limit or the approved amount, posting is refused and the record returns for renewed approval (`PRD-ACS-007`, `POL-02.12`, `DEC-066`). There is no tolerance for cost drift: any rise above the limit or the approved amount needs renewed approval (DEC-105; the KDPS Owner confirms).

Database constraints keep balances, layers and pool quantities from going below zero, as a last guard (`PRD-INT-005`).

### 10.5 Offline bills and imports that do not fit

The offline counter sells from its protected quantity (6.1). On upload, each bill posts against it in posting order (7.10). A bill that does not fit goes to the visible reconciliation queue and is never discarded (`PRD-OFF-009`, `PRD-OFF-014`). Its stock effect posts when the exception owner routed under `POL-02.16` resolves it; money differences follow the money route (`POL-16.05`).

An EBO import that would oversell available stock is held for reconciliation before stock is reduced (`PRD-STK-016`, `DEC-089`).

### 10.6 Large documents

A few documents touch thousands of rows at once: approving a large PT (the PRD's performance table uses a 10,000-line PT import), posting a Site's opening stock, approving a full Store count. Under a book pool, the cost pool rows they lock are shared by every Store, so counter sales of the same SKUs would wait behind them. Counters must not wait on background work (`PRD-PRF-003`).

- **Staged commit.** All slow work happens before any lock: validation, matching, and working out quantities and inflow values. Outflow values (count shortages, write-offs) depend on posting order, so they are worked out under the pool locks (7.10). The posting transaction then only locks, rechecks and writes, with set-based writes in the lock order. One document is still one transaction (`PRD-INT-004`, `PRD-IMP-012`).
- **One at a time.** Large postings run as queued jobs, one at a time per accounting book, never inside a user's request. The approval click records the approval decision, with the approver and the time, and a request to post naming the approved version; it has no stock or money effect, and the document shows Posting. The job then runs the whole transaction of 10.2 (number allocation, movements, balance and pool rows, monetary records, approval evidence, audit and outbox), rechecking under the locks (10.4), and records in that transaction that this decision authorised this posting; that record is the approval evidence (`DEC-097`). If the job fails, nothing is posted, the decision stays recorded and unused, and the document shows the failure. A retry uses the same decision only while the version is unchanged and the value is within the decision's limit and the approved amount; otherwise the record returns for renewed approval (`DEC-066`). The detail is in [access-and-approvals.md](../access/access-and-approvals.md) 9.8. Only the outbox follow-up, such as messages and the Tally exchange, runs after the job's commit; journals commit with the movements (`DEC-087`) (`PRD-MOD-006`, `PRD-INT-004`).
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
| SL-2 | Rounding rule for an outflow, a customer return under moving average, or a share of a late cost change, that does not divide to whole paise (13.4) | Accounts, CA | 2 |
| SL-3 | Accounts for the supplier-return variance, late-cost shares of goods gone, late-cost excess in cost of goods sold, and the variance left by a reversal of an inflow (V-10) | Accounts, CA | 2 |
| SL-4 | Validate these rules with real cases (`POL-09.06`). First, the supplier return: it leaves at the formula cost, not the receipt's own cost, so a variance appears even when the supplier credits the purchase price (7.5, 11.4). Then: late-cost split and its excess to cost of goods sold (7.7), reversals at their original cost, and reversals of mistaken inflows at their own value (7.5), FIFO layers dated when units enter the pool (7.4), valuation in posting order (7.10), consignment pass-through (7.2), including how a customer return of a pass-through unit is accounted for under each agreement (`POL-01.05`, `POL-01.13`, `POL-09.03`; ownership effect follows the agreement, DEC-091) and what a supplier-owned unit's loss or supplier return costs | CA; product owner | 2 |
| SL-5 | How a net realisable value write-down is worked out and spread under each formula, and how it is reversed | CA | 5 |
| SL-6 | How value is divided when the formula or pool mode changes (7.12) | CA | Before any change |
| SL-7 | Count cost limits and approvers (V-21) | KDPS Owner, Operations | 3 |
| SL-8 | Batch/expiry categories and shelf-life days (V-05, `POL-04.08`) | Booking, Operations | 1 |
| SL-9 | Rollout order on production: when a warehouse goes live and loads its opening stock (`POL-14.07` now allows it only at a Store's switch); how goods move between a Site on the app and a Store not yet switched; direct deliveries to such a Store (`PRD-REC-004`). No answer changes the ledger | Product owner; KDPS for `POL-14.07` | Before the first live use on production. Not a build blocker |
| SL-10 | A customer return with no sale in the app to take its cost from: an EBO return not linked to its imported sale, a return of an earlier-POS bill after the switch (`DEC-059`), and a return at a Store in another book or legal entity. Baseline (DEC-105): until a later plan allows those returns, the customer is served under the no-bill return route where policy 7 allows it, and is otherwise refused with the reason shown. The returns stay unavailable in the app (`DEC-059`, `POL-06.02`); `PRD-EBO-005` is unmet for them. No-bill returns are unchanged (`PRD-RET-017`, `POL-07.08`). Which receipt origin, owner and cost these returns take stays OPEN for that later plan | Product owner; CA for another legal entity (the later plan) | The later plan |
| SL-11 | Posting one large document in ordered chunks, if the staged commit fails the counter performance test (10.6). It bends `PRD-INT-004`, so it needs a PRD decision first | Product owner | Only if that test fails |
| SL-14 | How Store value is shown under a book pool (7.1), for Store net asset value and closure (`PRD-NAV-016`, `PRD-LIF-018`) | Accounts, CA | 5 |
| SL-15 | The accounting date of a late valued movement whose business date falls in a locked financial period (7.10) | Accounts, CA | 5 |
| SL-17 | Whether a billed-retained sale's value leaves the pool at the bill or at handover (6.1; V-35); then whether a cancelled sale's goods return at a cost; and what value billed-retained items carried across the switch carry; they are not opening stock (9, step 4; `PRD-LIF-028`, `DEC-090`; `POL-14.04`, `POL-08.06`, `POL-09.04`) | CA | 4 |
| SL-18 | Baseline (DEC-105): the event that ends "until it bills in Apparel OS" at an EBO Store that reports through brand software is the Store's switch to billing in Apparel OS (5; `PRD-EBO-011`). Piece IDs are kept and scanned there (`PRD-MER-003`, `PRD-MER-016`, DEC-088); any exception needs a decision record | — | — |
| SL-19 | Settled by `PRD-STK-016` (EBO import that would oversell available stock is held for reconciliation; DEC-089) | — | — |
| SL-20 | Settled by `PRD-STK-017` (mistaken damage confirmation reversal) | — | — |
| SL-21 | Settled: journals for valued movements are written in the same transaction as the movement so books balance at commit (`DEC-087`, `PRD-MOD-013`) | — | — |
| SL-22 | Settled: the click records the approval decision; the job's transaction records its use, which is the approval evidence; a failed job leaves the decision unused (10.6; `DEC-097`; [access-and-approvals.md](../access/access-and-approvals.md) 9.8) | — | — |
| SL-23 | Baseline (DEC-105): Outcome A. A valued movement with no valid posting map does not commit; the document stays as it was, and an exception is raised in its own transaction (`PRD-MOD-013`, `POL-09.12`, DEC-087; 7.11; module-map 6.3) | CA (confirms) | — |
| SL-24 | Settled by the product owner, 6 Oct 2026 (RR-227): receipt origins only read are locked in shared mode at step 2; a unit anchor at step 3, shared for every item and exclusive to start or end a count freeze; a missing cost pool row, or a missing transit value row, is created empty at step 6, as balance rows are at step 3, a new pool taking its formula, pool mode and cost-setting version from the cost setting read at Plan. Written into 10.3, 14.3 and code-house-rules 8.2. Contention on the unit anchor is measured; the builder resolves performance and brings back only a change to business behaviour | — | — |
| SL-25 | Row-level security for stock rows (14.1, 14.3). (b), (c) and (e) approved by the product owner, 6 Oct 2026 (RR-228), and written into code-house-rules 6.2: (b) a row at a business unit that belongs to no Store, such as a warehouse unit, carries no Store and is matched by its Site and unit, not read as an Unknown place; (c) a whole-book pool, which has no Site, carries none, so only all-members place scope reads its value; how Store value is shown stays SL-14; (e) pool rows (`cost_pool`, `cost_layer`, and the pool rows of `valuation` and `valuation_layer`) declare no Store or unit, so only a reader whose place scope covers the pool's whole Site, by a selected Site or wider, sees a Site pool's rows; a reader scoped to one unit or Store does not (access-and-approvals 5.2). (b) and (c) fit structure-and-masters 2.4 as structural rules, not as a null meaning none: the unit belongs to no Store, as `organisation` records, and the pool's mode is book, as its `pool_mode` column states, with a `CHECK` that the Site is null exactly then. (d) approved as amended, same day: a header row that can cover goods of several brands (`movement`, `hold`, `hold_scope`, `reservation`) records its brand set, and a brand-limited reader sees it only with access to every brand it records (access-and-approvals 5.3). Cost and value still need the cost field permission (13.6). **OPEN:** (a) a command that writes legs in two scopes, such as a dispatch, an arrival or a failed delivery between Sites, or a location move between two units at one Site, by an actor whose scope covers only one: a write rule of its own (code-house-rules 6.2) or the answer to CH-6. Answered from (d) (`DEC-117`): the brand set is an array column checked by an every-brand `access` function; a unit anchor carries no brand and is matched by place; a command's rechecks see hidden holds and freezes through a narrowly authorised internal `stock` function that returns only a generic refusal | Product owner, in the access design (CH-6) | (a): stage 3 transfers live; until then the harness acts with synthetic actors whose scope covers both places. The brand set: answered |
| SL-26 | Value entering a pool through an ownership change after its cost is established (7.2; `POL-01.05` lets an agreement's ownership event fall between receipt and sale): which posting event kind it posts and what that recognises (`POL-09.03`). Until set, such an item is refused (13.4) | Accounts, CA (recognition); the event kind is declared in books-and-posting 7.2 first | 2, for an agreement whose ownership event falls between receipt and sale |
| SL-27 | A reversal of an inflow made in error under FIFO, once the inflow's own layer and the layers that came from it no longer hold the value to come off: from which of the pool's other layers the rest comes off, at pool level as `PRD-LED-018` sets (7.5). Until set, such a reversal is refused (`rule-not-set`) | CA, with Accounts | Before FIFO reversals of inflows go live (2) |
| SL-28 | Whether a piece found after it was recorded as gone may be swapped with a missing piece of the same SKU that belongs to another owner or legal entity (8.4; `PRD-STK-015`, DEC-035), which changes what each owner is owed (`POL-01.13`). Until decided, such a pair is treated as no match: the found piece is held and an exception raised | Product owner; CA for the settlement effect | Stage 3 counts of consignment or mixed-owner goods live |

SL-12, SL-13 and SL-16 were settled by DEC-034 and DEC-035; their numbers are not reused.

## 13. Interface

**Approved** by the product owner, 6 Oct 2026 (RR-012). Sections 13 to 15 add the ledger's interface, its tables and the synthetic harness to the rules of sections 1 to 11; they change none of those rules, except 10.3, amended for SL-24 (RR-227). A choice they still mark **Proposed**, refusal names included, was approved with them and is agreed, as code-house-rules section 1 reads that mark; what section 12 marks OPEN stays open. The rules they apply keep their IDs beside them. The refusals' envelope is part B of the house rules (code-house-rules 12).

### 13.1 How a caller posts

- Every change to the ledger's records is one **ledger request**: the stock effects of one business document, or of one step of it, from one registered caller (13.2), inside that caller's command (`PRD-MOD-002`, `PRD-MOD-006`). The ledger joins the command's transaction and never opens or commits one; each operation takes the command's transaction context as its first argument (code-house-rules 8.1; module-map section 3, rule 3). **Proposed.**
- A request holds items: movements (13.4) and status changes (13.5). One request is all or nothing; one failing item fails the request and the command rolls back (`PRD-INT-004`, `PRD-IMP-012`).
- A request runs in four operations, at the steps of module-map 6.1:

| Operation | At | What it does | Returns | Refuses with (13.8) |
| --- | --- | --- | --- | --- |
| Plan | Step 4, before any lock | Checks the caller's registration and every item's shape; reads the SKU, unit, tracking profile and pack conversion as of the business date from `merchandise`, the place and the unit's mapping (book, legal entity) from `organisation`, the book's cost setting from `finance`, which a new pool takes (14.2); finds the receipt origins, pieces, balances, holds, reservations, pools and transit values the items touch; works out inflow values (10.6); asks `finance` Check postable for the valued items. Writes nothing and locks nothing | The plan: the lock targets of 10.3 steps 2 to 6, and from Check postable the period rows for step 7 and the journal series for step 8 | `caller-not-registered`, `item-not-registered`, `historical-reference-source`, `invalid-item`, `place-invalid`, `route-not-allowed`, `no-cost-setting`, `posting-refused` |
| Lock | Step 5, as 10.3 steps 2 to 6 | Creates the missing `unit_anchor` and balance rows of step 3 and the missing pool and transit value rows of step 6 (SL-24), then takes each step's targets through `kernel`'s lock helper, one call per step, with any targets the caller adds for those steps (code-house-rules 8.2) | — | — (a lock wait past the runtime limit fails the command, code-house-rules 5.1) |
| Recheck and value | Step 6, after every lock and before any write | Rereads under the locks what 10.4 rechecks for stock: available quantity, where each piece is, holds, reservations, a count freeze, coverage, acceptance and sellability (6.3); then values every outflow in posting order under the pool locks (7.10). Writes nothing | Each item's value on its approval basis, cost or Unknown, and the total, which is Unknown when any item's value is Unknown, for `access` Verify under lock (`PRD-ACS-015`, `PRD-ACS-016`, DEC-066) | `plan-stale`, `insufficient-available`, `not-in-custody`, `piece-not-at-place`, `count-freeze-active`, `held`, `reserved`, `not-covered`, `not-accepted`, `not-sellable`, `coverage-overlap`, `reservation-overlap`, `exceeds-source`, `wrong-release-event`, `condition-route`, `rule-not-set` |
| Write | Step 7 | Writes the movements and their legs, pieces, balances, receipt origins, status records, valuations, layers and transit values; calls `finance` Post once for the request's valued items (books-and-posting 8.1); records one audit record naming the movements; saves the event rows of 13.7 | The movement and status identifiers, each valued item's value, and Post's result (books-and-posting 9.2) | `posting-refused`; a constraint of section 14 refusing a row is a defect, logged as one (10.4, last guard) |

The caller's command, in order (module-map 6.1; `PRD-INT-003`):

1. Before any lock: the caller's own slow work, then Plan.
2. Locks: step 0, the authority rows (`access`); step 1, its document and approval rows; Lock, for steps 2 to 6; step 7, `finance` Hold periods with the plan's period rows and the caller's own; step 8, every number series, the plan's journal series with its own (code-house-rules 8.2).
3. Rechecks: `access` Authorise again; Recheck and value; then `access` Verify under lock with the returned value (access-and-approvals 9.7).
4. Writes: first `access` Record use, where the action needed approval, which writes the use of the decision with the identifier the caller made for it (DEC-097); then Write, whose movements carry that identifier (13.3); then the caller's own records; `numbering` Allocate; audit; outbox. All commit together (`PRD-INT-004`). **Proposed** order.

- Post runs inside Write, so a valued movement and its balanced journals per book commit together or not at all (`PRD-MOD-013`, DEC-087). A refusal by Post rolls the command back, and the caller raises the exception in its own transaction (SL-23; books-and-posting 10).
- A value whose basis is Unknown is returned as Unknown, never as zero (`PRD-MOD-015`, `PRD-ACS-016`).
- **Plan staleness.** For quantity-tracked goods whose origin is not named, Plan names as lock targets every receipt origin with stock of that SKU at that place, and Lock locks them, so that Recheck and value can take the oldest first, or the soonest expiry (`PRD-STK-013`). If an origin appeared after Plan, the request is refused as `plan-stale` and the command fails; the person or job submits it again. The kernel never retries it (code-house-rules 8.1). **Proposed.**
- The ledger allocates no number of its own in stage 1. Piece codes come from the caller (13.4); journal numbers are drawn by Post. **Proposed.**

### 13.2 Registered callers

Harness decision H2 (DEC-112): the ledger accepts registered callers only, and synthetic callers exist only in tests.

- **Registration.** At start, each module that posts stock registers, through the ledger's interface: its module (or part) name; each record type it posts from; for each record type, the item kinds of 13.4 and 13.5 it may send; and the import kinds it may carry, such as opening balance. A registration is fixed once the application has started. **Proposed.**
- **Every request names its source:** owning module, record type, record identifier, version identifier, the document line of each item, and the import kind, or none (books-and-posting 5.1). Plan refuses a source whose module and record type are not registered (`caller-not-registered`), an item kind the registration does not list (`item-not-registered`), and any source whose import kind is historical reference (`historical-reference-source`), as a last guard behind the import handler's own rule (`PRD-LIF-014`, `PRD-IMP-010`; the proposal of imports-and-opening-data 4.2, taken here). A `CHECK` on `movement` refuses that kind again (14.2).
- **Synthetic callers.** A registration may be marked synthetic. The registry accepts one only when the application was composed by the test application factory, which lives in `apps/server/test/` and which no code under `src/` can import (code-house-rules 11.2). A test proves that the production composition registers no synthetic caller and that a synthetic registration outside it fails the start. **Proposed.**
- **What the guard is.** Registration keeps wrong or synthetic documents out of the ledger. It is not an access control: Authorise and row-level security still decide who may act (`PRD-SEC-005`), and `pnpm check:modules` decides which modules may call (module-map section 3).
- **Who registers.** In stage 1 the production composition registers no caller, so no stock posts outside tests (2.3, "Stage live"). The callers of later stages, indicative only, each confirmed by its own design: `receiving` (receipt count, putaway, acceptance, holds; stage 2), `merchandise` · PT (coverage, cost established, cost adjustment; stage 2), `stock` · documents (damage in stage 2; transfers, counts, write-off and disposal in stage 3), `supplier-returns` (stage 3), `pos` (stage 4), `ebo-imports` (stage 4, never for an earlier-POS import), `site-lifecycle` (the opening count, stage 4).
- In tests: the synthetic document driver (section 15) and the GC-6 opening-count test handler (imports-and-opening-data 12). That handler runs in tests only, never on `dev` (GC6-18, answered by the product owner, 6 Oct 2026; DEC-116; 15.5).

### 13.3 The request

Every request carries the source of 13.2, the business date and event time (`PRD-MOD-009`), and the actor: the user or service identity, the person a job acts for, and the role assignment Authorise returned (`PRD-ACS-013`, `PRD-SEC-018`). Where the action needed approval it also carries the approval decision and the identifier of its use, a UUIDv7 the caller made before Record use wrote it in the same transaction, so each movement keeps its approval evidence (2.2; `PRD-ACS-013`, `PRD-INT-004`, DEC-097). Every item adds:

| Input | Rule | IDs |
| --- | --- | --- |
| Item kind | One of 13.4 or 13.5, allowed by the registration | — |
| Document line | The identifier of the source line, kept without a foreign key | `PRD-ACS-007` |
| SKU, unit | The SKU, or Unknown where the kind allows it; the quantity in the stock unit, or in a pack with the conversion version used. Units are never combined silently | `PRD-MER-010`, `PRD-MER-012`, `POL-04.03`, `POL-04.04` |
| Batch, expiry | Present exactly when the tracking profile in force requires them; a missing value refuses the item | `PRD-MER-011`, `POL-04.05` |
| Quantity | A whole number above zero in the stock unit; for a value-only kind, the units whose value changes | 2.2 |
| Places | From and to, as the kind needs: Site, business unit, internal location, condition (good, damaged, wrong, unidentified) and how the goods are held (in custody, in transit on a named dispatch or supplier-return shipment, billed-retained). The location must belong to both the Site and the unit (structure-and-masters 3.5) | `PRD-ORG-005`, `PRD-ORG-012`, `PRD-STK-001`, `PRD-STK-002` |
| Origins and pieces | Piece codes for piece-tracked goods (`PRD-MER-016`); receipt origins where the document names them, otherwise chosen by `PRD-STK-013` | `PRD-STK-004`, `PRD-STK-013` |
| Value inputs | Only for cost established and cost adjustment: the amount, its evidence and the PT revision or cost record it comes from | `PRD-PTW-010`, `PRD-LED-016` |
| Links | The movement reversed; the hold or reservation released; the reservation a hold sits inside, as the kind needs | `PRD-ACS-014` |

### 13.4 Movement items

One item kind per movement kind of 2.3. "Under the locks" adds to the common rechecks of 13.1. Event kinds are those of books-and-posting 7.2; a kind marked "none" calls no Post.

| Item | Specific inputs | Under the locks | Refusals | Value and event kind | IDs |
| --- | --- | --- | --- | --- | --- |
| Receipt count | GRN line; to place; owner and agreement version from `receiving`; piece codes printed from the count | Piece codes unused | `invalid-item` (a piece code already used) | Unknown; none. Creates a receipt origin, and pieces for piece-tracked goods | `PRD-REC-008`, `PRD-MER-015`, `PRD-ORG-019`, `PRD-ACP-001` |
| Opening count | As a receipt count, from an opening batch; owner verified by Operations | As a receipt count | As a receipt count | Unknown until its opening PT is approved (cost established); none. Creates opening receipt origins | `PRD-LIF-003`, `PRD-LIF-004`, `PRD-LIF-027`, `POL-14.02` |
| Location move | From and to place inside one Site | Units at the from place | `route-not-allowed` when the two units differ in book, legal entity or tax registration (7.1, DEC-066; MM-13) | None; none. Keeps condition and acceptance | `PRD-STK-005` |
| Condition change | To condition; the hold the condition raises (13.5) | Goods at the place | `condition-route`: damaged to good; wrong or unidentified to good outside the identity route | None; none | `PRD-DMG-003`, `PRD-DMG-010`, `POL-17.02` |
| Identity resolved | The resolved SKU and the approved identity decision | Goods Unknown and quarantined | `condition-route` without the approved route | None; none. A new receipt origin with the old one as parent | `PRD-DMG-005`, `POL-17.02` |
| Dispatch | Dispatch identifier; the transfer or held-goods reservation it consumes | Reservation covers the units; held units go only under a held-goods reservation; same legal entity | `reserved`, `held`, `route-not-allowed` | Different pools: issue at formula cost onto the dispatch; `stock.pool-dispatch`. Same pool: none | `PRD-TRF-007`, `PRD-TRF-011`, `PRD-TRF-013`, `PRD-TRF-004` |
| Arrival count | Counted good, damaged, wrong, unidentified and excess quantities | Units in transit on that dispatch | `exceeds-source` | Different pools: into the destination pool at the dispatch value, one layer per source layer under FIFO; `stock.pool-arrival`. Same pool: no value moves; none. Excess: a new receipt origin held as excess, no value (13.5). Missing units stay on the dispatch | `PRD-TRF-012`, `PRD-TRF-016`, `PRD-TRF-018` |
| Failed-delivery return | The dispatch; counted quantities at the source | Units in transit on that dispatch | `exceeds-source` | Different pools: back to the source pool at the dispatch value; `stock.failed-delivery-return`. Same pool: no value moves; none | `PRD-TRF-019` |
| Sale issue | Bill line; handover now, or billed-retained until handover; for an uploaded offline bill, the offline protected-quantity reservation it sold from | Sellable at the Store (6.3, conditions 1 to 5); a later handover issues from billed-retained. An offline bill is checked against every hold and reservation except that protected-quantity reservation, which the sale consumes (6.3 condition 4; 10.5; `PRD-OFF-006`); a bill that does not fit goes to the reconciliation queue, as GC-8 designs | `not-sellable`; `rule-not-set` for billed-retained value timing until SL-17 is set | Formula cost; `stock.sale-issue`. A supplier-owned unit whose ownership passes at sale: `stock.pass-through` (SL-4) | `PRD-STK-003`, `PRD-POS-018`, `PRD-LED-014` |
| Customer return | The sale movement; condition after acceptance | Returned quantity within what that sale issued and was not yet returned | `exceeds-source`; `rule-not-set` for a unit supplier-owned at its sale, whose ownership on return is not settled (7.2, SL-4), and for a partial return under moving average that does not divide into whole paise (SL-2); a return with no sale in the app is not an item (SL-10) | A unit the Organisation owned at its sale: the cost its sale issued (7.5); `stock.customer-return`. Damaged: quarantined (13.5) | `PRD-RET-013`, `PRD-LED-017`, `PRD-INT-005` |
| Supplier-return departure | RTV leg; the supplier-return or held-goods reservation it consumes | Reservation covers the units | `reserved` | Formula cost onto the shipment, in both pool modes; `stock.supplier-return-departure` | `PRD-OFR-012`, `PRD-TRF-020` |
| Supplier handover | The shipment; confirmed handover or supplier receipt | Units on the shipment | `exceeds-source` | Leaves the shipment; `stock.supplier-handover` | `PRD-TRF-020` |
| Supplier rejection return | The shipment; counted quantities | Units on the shipment | `exceeds-source` | Back at the shipment's value; `stock.supplier-rejection-return` | `PRD-OFR-014` |
| Count difference | The count and its approved differences | Freeze still holds the scope; expected quantities unchanged since the freeze | `count-freeze-active` for any other item in the scope | Loss: formula cost, `stock.count-loss`; units lost on a dispatch, `stock.dispatch-loss`. Gain linked to a recorded loss: the reversal of that loss at its cost. Gain with no known origin: a new receipt origin held as excess, no value | `PRD-STK-012`, `PRD-STK-014`, `PRD-STK-015`, `PRD-ACS-015` |
| Disposal | Method and evidence | Goods held | `exceeds-source` | Formula cost unless written off first, `stock.disposal-loss`; after a write-off, none; pre-PT, none and no journal | `PRD-DMG-012`, `PRD-DMG-015`, `PRD-DMG-016` |
| Ownership change | The agreement's ownership event | Owner on the receipt origin is the one the event changes | `rule-not-set` when units of known cost would enter a pool, while no event kind exists for that (SL-26) | Owner changes on the origin; units with known cost enter the pool (7.2) | `PRD-ORG-014`, `POL-01.05` |
| Cost established | The covering PT revision; the P RATE | Origin still Unknown; coverage recorded in the same request (13.5) | `exceeds-source` | Owned units: into the pool, or onto the dispatch in transit (7.6); `stock.cost-established`. Supplier-owned units: the cost is recorded on the origin only; nothing enters the pool and nothing posts (7.2; `PRD-ORG-015`). For an opening receipt origin, none: opening stock makes no automatic journal | `PRD-PTW-010`, `PRD-REC-017`, `PRD-LIF-008` |
| Cost adjustment | Amount and evidence; the receipt origin | No count freeze over the affected units (8.1) | `count-freeze-active` | Follows its goods (7.7); `stock.cost-adjustment` with its components | `PRD-LED-006`, `PRD-LED-016`, `PRD-REC-019` |
| Write-off | Quantity and reason | Value established | `exceeds-source` | Formula cost leaves; goods stay in custody under a write-off hold placed in the same request, so they are unavailable (6.1); `stock.write-off`. Pre-PT: nothing to write off | `PRD-DMG-011`, `POL-17.05`, `POL-17.07` |
| Net realisable value write-down | — | — | `rule-not-set` until SL-5 is set | `stock.nrv-write-down` | `PRD-LED-007` |
| Reversal | The movement reversed and the quantity | Quantity within what that movement moved and was not reversed | `exceeds-source` | An outflow comes back at the cost it took; an inflow comes off at the value it added, with a variance only for a part that would take the pool below zero (7.5); under FIFO, `rule-not-set` where the rest must come off other layers (SL-27); the reversal kind of the original event kind | `PRD-MOD-011`, `PRD-ACS-014`, `PRD-LED-018`, `PRD-STK-017` |
| Piece correction | Piece A found, the movement that wrongly named it, piece B of the same SKU | A and B are the same SKU; while SL-28 is open, the same owner and legal entity | `invalid-item` for another SKU; `rule-not-set` naming SL-28 where owners or legal entities differ, so the caller takes the no-match route (8.4) | A reversal for A and a movement of the same kind for B, both with the correction as their source and linked to the movement corrected. Same pool: no value moves. Different pools: value moves as for a transfer between pools (7.8) | `PRD-STK-015` |

- A valued outflow, a partial customer return under moving average (7.5) or a share of a cost adjustment (7.7) that does not divide into whole paise is refused as `rule-not-set` while the rounding rule is not set; an outflow that empties a pool takes all that is left and needs none (7.3, 7.10; SL-2, G10a).
- **Supplier-owned units** take no pool value (7.2; `PRD-ORG-015`, `POL-09.03`). Their count loss, disposal, write-off and supplier-return legs move custody only, with no valuation and no Post; what such a loss or return costs follows the agreement and is not posted by the ledger (`POL-01.13`; SL-4).
- Value never posts for Unknown cost; the item has no valuation and calls no Post (`PRD-MOD-015`, `PRD-ACP-004`).

### 13.5 Status items

Status records are not movements (2.3). Each item locks the balance and piece rows it claims (10.3 steps 3 and 4), so it queues with any movement of the same goods.

| Item | Inputs | Under the locks | Refusals | IDs |
| --- | --- | --- | --- | --- |
| Split receipt origin | The origin and the counted portions a primary and supplemental PT cover | Portions add up to the origin's units | `exceeds-source` | `PRD-REC-015`; section 4 |
| Record coverage | PT revision; the receipt origin, or the pieces | No unit already covered by another approved revision | `coverage-overlap` | `PRD-REC-015`, `PRD-REC-017`, `PRD-ACP-002`, `PRD-INT-005` |
| Remove coverage | The linked PT correction | No dependent quantity relies on it | `exceeds-source` | `PRD-REC-019` |
| Record acceptance | Barcode or tag verified; the units or pieces at the Site | Units in custody at that Site | `piece-not-at-place` | `PRD-REC-021`, `PRD-REC-022`, `PRD-STK-003` |
| Place hold | Kind (damage, quarantine, excess, source conflict, expiry, ordinary, inspection, write-off), reason, evidence; pieces or a quantity at a place; optionally the reservation it sits inside | Units in custody at the place. Holds coexist, and a hold may fall on reserved or already held units (6.2) | `not-in-custody` | 6.1; `PRD-DMG-001`, `PRD-REC-006`, `PRD-TRF-007`, `PRD-STK-001` |
| Release hold | The hold; the release event of its kind (6.1) | The event is the hold's own | `wrong-release-event` | `PRD-DMG-003`, `PRD-REC-013`, `POL-08.05` |
| Start count freeze | The count; scope: locations, brands or SKUs at one Site and business unit | No other freeze over the same units; no offline protected quantity in the scope (8.1) | `count-freeze-active`; `reserved` for offline protected quantity | `PRD-STK-008`, `PRD-STK-009`, DEC-019 |
| End count freeze | The count's closure | — | `wrong-release-event` | `PRD-STK-008`, `PRD-STK-009` |
| Reserve | Kind (transfer, supplier return, held goods, offline protected quantity); pieces or a quantity at a place | Transfer and sale: within stock covered, accepted, good and not held. Held goods: only goods under the hold the item names, under its own authority. Reservations never overlap | `not-covered`, `not-accepted`, `held`, `reservation-overlap`, `insufficient-available` | `PRD-TRF-006`–`PRD-TRF-009`, `PRD-DMG-007`–`PRD-DMG-009`, `PRD-OFF-006`, `PRD-INT-005`, `POL-17.01` |
| End reservation | The reservation; its event: dispatch or departure (inside that item), cancellation, withdrawal; for offline protected quantity, a sale from an uploaded offline bill (13.4) or a release only while online, after sequence and queue reconciliation and a durable local and central billing pause, which `pos` checks and states in the request (`PRD-OFF-011`) | The event is the reservation's own; never by time | `wrong-release-event` | `PRD-TRF-022`, `PRD-OFR-016`, `PRD-OFF-011` |

- A hold moves with its goods and stays on them at the destination (`POL-17.01`): a movement of held goods moves the hold's claim in the same request.
- Releasing one hold or reservation never releases another (6.2; `PRD-DMG-003`, `PRD-TRF-022`).
- The count freeze's expected quantities are the balances under the freeze's locks; Start count freeze returns them (8.1).

### 13.6 Reads and read models

Reads take no lock and run in a read-only transaction under the reader's actor (code-house-rules 8.1). Every answer carries its as-of time and says when it is partial (`PRD-MOD-003`, `PRD-PRF-004`). Reports reach them through the kernel's read-model gateway (module-map section 3, rule 5).

| Read | Answers | Called by | IDs |
| --- | --- | --- | --- |
| Custody | Quantity by place, location, condition, how held, SKU and receipt origin, as of a time | Every stock module; reports; stock search | `PRD-STK-001`, `PRD-STK-002`, `PRD-STK-004`, `PRD-STK-006` |
| Piece | Where a piece is, how held, its origin, coverage and acceptance, and its movements | `pos`, `stock` · documents, reports | `PRD-MER-003` |
| Coverage and acceptance | The PT revision covering each origin or piece, and what is accepted where, as of a time | `merchandise` · PT, `receiving`, reports | `PRD-STK-001` |
| Availability | Custody less holds, reservations and freezes, given coverage and acceptance (6.2) | Transfer approval, supplier returns, the offline allocation | `PRD-TRF-006`, `PRD-INT-005` |
| Sellable | Conditions 1 to 5 of 6.3 for a piece or quantity at a Store; condition 6 is asked of `pos` | `pos` | `PRD-STK-003`, `PRD-ACP-003` |
| Ownership | The owner and agreement version on each receipt origin, as of a time | `supplier-returns`, `finance` · operations, reports | `PRD-ORG-014`, `PRD-OFR-008` |
| Value | Pools and FIFO layers, valued movements with their before and after, values held on dispatches and shipments, as of a time | Reports, `finance` · operations | `PRD-LED-014`, `PRD-LED-015` |
| Inventory reconciliation | Pool value per book, and each valued movement's identifier and components, for matching with the posting-source rows of books-and-posting 8.3 | `finance` · operations | `PRD-LED-008` |
| Rebuild and compare | Rebuilds every projection of section 14 from the entries and compares, in a read-only transaction; it changes nothing and returns the differences. Run by a job under a service identity on a schedule, which then raises an exception for each difference as a separate command, in its own transaction (`exceptions` Raise); and by tests (11.7) | A job; tests | `PRD-MOD-011`, `PRD-MOD-012` |

- Accounting recognition is not read here: it is the journals of `finance` · books (books-and-posting 12), joined to movements through the posting-source rows (section 3).
- Cost and value are the restricted field class cost: masked unless the assignment that grants the read grants cost, and never sent to the counter (`PRD-ACS-008`, `PRD-OFF-004`; access-and-approvals 6).
- Rows are filtered by row-level security as a backstop to Authorise (`PRD-SEC-005`; 14.3).

### 13.7 Contracts, events and limits

- **Contracts it implements** (module-map section 3, rule 6): location in use, for `organisation` before a location is retired (structure-and-masters 3.5), in `organisation`'s shape `hasStock(context, location) → yes or no`, in the caller's transaction: yes while a balance at the location holds units, in any condition, held in custody or billed and retained. It is answered through `stock.location_has_stock`, a `SECURITY DEFINER` function like the one below, and the composition root hands it to `organisation` under `LOCATION_IN_USE` (`S1-F02-T02`); has this book held stock?, for `finance` · books before a cost-setting version changes a book's formula or pool mode (books-and-posting 2.2; product owner, 6 Oct 2026), in the shape `hasHeldStock(context, book) → yes or no`, in the caller's transaction: yes once any receipt origin, movement leg or cost pool of the book was ever written. It is answered through `stock.book_has_held_stock`, a `SECURITY DEFINER` function that reads those rows whatever the asker's scope and returns only yes or no, since a book-level refusal must not depend on what the asker may see (14.3; code-house-rules 5.2). `finance` · books names the contract and its token when S1-F09-T01 builds it; until then the ledger exports the implementation under its own token (S1-F10-T01); stock presence, for `merchandise` before a tracking profile becomes piece-tracked or a SKU's stock unit changes (structure-and-masters 4.4 and 4.6; `PRD-MER-018`, `POL-04.04`, GC2-5); the resolution check, for exceptions the ledger raises, such as a rebuild difference (`PRD-EXC-002`).
- **Events** (module-map section 8; identifiers only, saved in the request's transaction): `stock.movements-posted` once per request with movements; `stock.hold-changed`, `stock.reservation-changed` and `stock.count-freeze-changed` when those change. Coverage and acceptance publish no event in stage 1; the stage 2 PT and receiving designs add one if a consumer needs it, in module-map section 8 first (`PRD-MOD-006`, `PRD-INT-008`).
- **No validity check.** The ledger keeps no configured records, so it registers none with `configuration`. The cost setting is `finance`'s, the shelf-life rule and tracking profiles `merchandise`'s (`PRD-SEC-017`).
- **Never:** a journal of its own (7.11, DEC-087); a call to an outside system (code-house-rules 8.3); a movement from an import of historical reference (13.2); a business value of its own, such as a tolerance or a rounding rule (section 12).

### 13.8 Refusals

Each refusal names the item and what failed, so the caller can show the reason (`PRD-UXP-003`). Names **Proposed**.

| Name | Meaning |
| --- | --- |
| `caller-not-registered` | The source's module and record type are not registered (13.2) |
| `item-not-registered` | The registration does not list this item kind |
| `historical-reference-source` | The source is an import of historical reference (`PRD-LIF-014`) |
| `invalid-item` | Quantity not a whole number above zero; unit or pack conversion wrong; batch or expiry missing where required; piece codes missing for piece-tracked goods or already used; a link that does not exist |
| `place-invalid` | The location is not of that Site and unit; the unit's mapping is not in force on the business date |
| `route-not-allowed` | A move that needs another route: between books or legal entities (7.8), a registration-only change (MM-13), a transfer between legal entities (`PRD-TRF-004`) |
| `no-cost-setting` | A valued item in a book with no approved cost setting (books-and-posting 2.2) |
| `posting-refused` | Check postable or Post refused, with its reason (SL-23) |
| `plan-stale` | Under the locks, the request needs a row Plan did not lock (13.1) |
| `insufficient-available` | Not enough available units at the place (6.2; `PRD-INT-005`) |
| `not-in-custody` | The units or pieces a hold would claim are not in custody at that place |
| `piece-not-at-place` | A piece is not where the document says |
| `count-freeze-active` | A count freeze covers the units (8.1) |
| `held`, `reserved` | A hold or reservation covers the units, with its kind |
| `blocked` | A hold, reservation or count freeze the actor cannot see covers the units. It names the item's line and nothing of that record (14.1; `DEC-117`; S1-F10-T02) |
| `business-date-not-set` | The Organisation has no timezone, so the request has no business date (`PRD-MOD-009`, `PRD-SEC-017`; S1-F10-T02) |
| `not-covered`, `not-accepted` | No official PT coverage, or no acceptance at the Site, where the item needs it |
| `not-sellable` | A condition of 6.3 fails; the answer names which |
| `coverage-overlap`, `reservation-overlap` | Coverage or a reservation would overlap another (`PRD-INT-005`) |
| `exceeds-source` | More than the source allows: a return beyond what was issued, a reversal beyond what was moved, an arrival beyond what was dispatched, a release beyond what was claimed |
| `wrong-release-event` | A hold or reservation ended by an event that is not its own (6.2) |
| `condition-route` | A condition or identity change outside its route (`PRD-DMG-010`, `POL-17.02`) |
| `rule-not-set` | A rule the item needs is OPEN: the rounding rule (SL-2), the customer return of a unit supplier-owned at its sale (SL-4), net realisable value (SL-5), billed-retained timing (SL-17), the ownership event kind (SL-26), a FIFO reversal of an inflow beyond its own layers (SL-27), a piece swap across owners or legal entities (SL-28) (`PRD-SEC-017`) |

- The same request sent twice returns its first result, and changed content under the same key is refused and kept: that is the kernel's idempotency helper, in the caller's command (10.1; `PRD-INT-002`). The ledger adds a unique key per source line as a last guard (14.2).

### 13.9 As built for the quantity operations (S1-F10-T02)

**Design choice** throughout; none sets a business value. The valued items, Post and the reads of value arrive with S1-F10-T03.

- **The four operations.** Plan answers the plan or a refusal; Lock locks steps 2 to 5 (and 6 for a caller's own targets), one call each, and answers which targets it could not lock, missing or hidden by row-level security; Recheck and value refuses `invalid-item` for any of them, a unit anchor included, since without its lock the count-freeze interlock would not hold (14.3; S1-F10 review). Each operation is its own file of the unit (`plan.ts`, `lock.ts`, `recheck.ts`, `write.ts`), and the working state is pure: the identifiers of new rows are passed in (code-house-rules 2). Recheck reads under the locks into a working state of the rows it locked, and every item checks and changes that state in order, so a later item sees an earlier one and the request stays all or nothing (13.1; `PRD-INT-004`). An item stops the request at its first failed check.
- **The reads Plan uses.** The ledger declares the shape it reads from `organisation` (a unit at a Site with its mapping in force: Store or none, legal entity, book, tax registration, mapping version; a location's one Site and unit) and `merchandise` (a SKU at a Site on a date: version, brand, stock unit, piece or quantity tracking, batch tracking). The production composition gives reads that fail as a defect until S1-F02 and S1-F03 build them; tests give stand-ins built to that shape (S1-F10 spec 3.3).
- **Registered callers** (13.2). The registry is built once at start from every registration; it refuses to start with a synthetic registration outside a test composition, one record type registered twice, an item kind the ledger does not take, or historical reference among a registration's import kinds. How the application was composed is a branded value, `Composition`, of kind `production` or `test`: code under `apps/server/src/` can name only `PRODUCTION_COMPOSITION` (kernel), the test composition is made only in `apps/server/test/support/composition.ts`, which `src/` cannot import (code-house-rules 11.2), and a lint rule refuses a cast to `Composition` anywhere under `src/` but the kernel file that makes it. The production module builds the ledger with no registration and `PRODUCTION_COMPOSITION`, and a test proves a synthetic registration fails there (S1-F10 review). Plan also refuses a source whose import kind the registration does not list (`caller-not-registered`).
- **Location move and condition change** (13.4). Held goods move only under their own authority (6.2), so either refuses `held` with the kind of what it can see, until the held-goods routes arrive. A location move inside one business unit may take reserved units, after the free ones: the reservation's claim moves with them in the same request, as a hold moves with its goods (`POL-17.01`): the claim it leaves gets a `moved` event naming the move, and a new claim of the same reservation holds the units where they arrive, so the move never breaks a reservation; a reserved piece moves with its claim, which names the piece. A location move between two units, and a condition change, take free units only, so reserved units never leave their unit by a location move (`reserved`) (product owner, 8 Oct 2026). The reservations whose claims such a move may carry are locked at step 5; one that appeared after Plan is `plan-stale`. Acceptance moves with the goods: a quantity move carries the accepted units first, a piece its own acceptance, and each leg records how many of its units were accepted. A condition change is only from good to damaged, wrong or unidentified (2.3): any other is `condition-route`, so damaged goods never become good or wrong, and wrong or unidentified goods return to good only through the identity route (`PRD-DMG-010`, `POL-17.02`; S1-F10 review).
- **Receipt count** needs a known SKU in T02; goods of Unknown SKU are received with the identity route. A piece code already used anywhere the actor can see is `invalid-item`; the unique key on `piece.code` is the last guard.
- **Coverage** (13.5). One receipt origin is covered by one PT revision; a second revision on it, a piece already covered, or more than the origin's quantity is `coverage-overlap`. Remove coverage names one coverage record and removes it once; it is `exceeds-source` while a reservation relies on the units it covers.
- **Acceptance** records the location and condition of the balance it accepts at, so the balance's accepted quantity is rebuilt from it. More units than are unaccepted there is `exceeds-source`; a piece elsewhere is `piece-not-at-place`.
- **Holds.** A quantity hold claims balances oldest first, up to the units in custody at each; units not there are `not-in-custody`. Release hold ends every claim the hold still holds, by an event of its own kind (`wrong-release-event` otherwise); a count freeze is never released this way. The ledger checks only that the event is the hold's own; the authority a release needs (6.1), such as an excess hold's explicit authority with its PT route, or its link to a recorded loss, is the releasing module's own check, by Authorise of its own action and, where its approval rule needs one, Verify under lock, before it sends the release; the ledger keeps the approval decision and use the request carries (13.1, 13.3). In stage 1 no module releases excess holds; `receiving` and `stock` · documents design those checks (S1-F10 review).
- **Holds count once.** A quantity claim names no unit, so at one balance the held units outside reservations are the sum of the hold claims there, never more than the units outside reservations: a hold is taken to fall on units no other hold holds as far as those units go, and past them to overlap the units already held (6.2 "holds that overlap on the same units count once"). Taking holds apart this way never counts a held unit as free (S1-F10 review).
- **Count freeze.** A freeze claims everything in its scope through its scope rows, so it has no claims: one release row by `count-closed`, naming no claim and no quantity, ends it, once (14.2; S1-F10-T01 Notes). Its brand set is the brands of the balances in its scope when it starts, with the brand or the SKU's brand its scope names. Starting one checks its scope as any item checks what it touches, so another freeze over the same units is `count-freeze-active`. A freeze stops movements into and out of its scope, and reservations in it; holds, coverage and acceptance change no quantity at a place, so a freeze does not stop them (confirmed by the product owner, 8 Oct 2026; `PRD-STK-009`, `POL-02.24`).
- **Reserve.** Transfer, supplier-return and offline protected quantity reservations take goods in good condition, in custody, covered and accepted at the Site and not held (6.2, 6.3). For quantity-tracked goods an origin's covered quantity is a quantity of the origin, not of a place: every reservation of its units, at any of its balances, draws on it once, and held units at the balance reserved from are taken to be covered ones, so the reservations of an origin never exceed its covered quantity and never take a unit that may be uncovered (`PRD-INT-005`). The request locks the SKU balances of every unit where the origin has stock (10.3 step 3), and under the locks an origin with stock under a SKU balance it did not lock is `plan-stale`. Reservations of the origin the actor cannot see are counted through `stock.recheck_hidden`; at a unit the actor cannot see they are counted but not locked, which is the case SL-25 (a) leaves open (S1-F10 review). Remove coverage counts the reservations of the origin the same way. A shortfall caused by reservations is `reservation-overlap`. Held-goods reservations arrive with the routes that make them (stage 2 and 3). End reservation ends every claim it still holds by its kind's own event; consumption is made by the movement that consumes it.
- **What the actor cannot see** (14.1; `DEC-117`). Recheck first does its arithmetic with the rows the actor can see. It then asks `stock.recheck_hidden` twice for the whole request, each item named by its ordinal: before the items, with the Site and unit, locations, SKUs and brands each item touches; after them, with the free units each item left on each balance it took from, the pieces it took, and what each reservation left of its origin's covered quantity. The function answers each count freeze the actor can see that covers an item, for `count-freeze-active`, and a generic answer for an item when a freeze it cannot see covers it, or when claims the command did not count, of holds and reservations it cannot see, take a piece the item took, more units of a balance than the item left free, or more of an origin's coverage than it left. That gives `blocked`, naming the first such item's line (13.8). The reads ask it once too. So whether an item passes never depends on what the actor can see; only the detail of the refusal does.
- **Projections rebuilt** (2.1, 13.6). Rebuild and compare checks each SKU balance and balance against its movement legs, each balance's accepted quantity against the acceptance records and the legs, each piece's place against the in leg of its last movement, each origin's covered quantity against its coverage records, and each claim against what it claimed less its releases or events, a `moved` event included. It compares both ways: a key the legs, acceptances or coverage records give with no projection row is a difference too, with no row identifier. A claim keeps the quantity it claimed, never changed, for that (14.2). It answers its as-of time and says when it is partial: `stock.rebuild_partial`, a `SECURITY DEFINER` function, answers only whether any row of the tables it reads is one its reader cannot see (`DEC-117`; S1-F10 review).
- **Reads.** Custody, Piece and Availability answer the state now with the time read; reads as of an earlier time, and Coverage and acceptance, Sellable, Ownership, Value and Inventory reconciliation, arrive with the features that use them. Availability is what a transfer, supplier-return or offline reservation could take: good units, free of reservations and holds (counted once), accepted at the Site and covered, the origin's covered quantity drawn on once by its reservations everywhere and by the rows before in the answer, and none while a freeze covers them (6.2, 6.3; S1-F10 review). It counts only what the reader can see, but marks a balance frozen whatever freeze covers it.
- **Audit and events.** Write records one audit record per request, `post-stock`, on its first movement (or its first hold, reservation, coverage or acceptance record), naming every record it wrote, with the approval decision and use; its scope is the place of that record, with a brand only when the request moved one brand. It saves `stock.movements-posted`, `stock.hold-changed`, `stock.reservation-changed` and `stock.count-freeze-changed` once each where they apply.
- **Value for approval.** Every item that covers goods answers Unknown in T02, since no cost is established before T03; a release answers none. Goods of known cost arrive with T03 and are a defect until then.

## 14. Tables

**Approved** by the product owner, 6 Oct 2026 (RR-012), with two fixes to `cost_pool` (14.2) and the amendments for SL-24 and SL-25 (14.1, 14.3; RR-227, RR-228). The house rules set how each table is written (code-house-rules 3.2, 3.3 and 7.1); this section says which tables, columns and keys.

### 14.1 Conventions

- One schema, `stock`. The ledger part writes the tables below; `stock` · documents adds its own tables in its own design, in the same schema (code-house-rules 3.2; `PRD-MOD-002`).
- Every table has `id uuid`, a UUIDv7 made by the application (`PRD-MOD-008`). A reference to another module's record keeps its identifier with no foreign key; every reference inside `stock` has one (structure-and-masters 2.5).
- **Entries and projections.** Movements, legs, valuations, receipt origins, status records and their releases are append-only (`PRD-MOD-011`). Balances, piece state, pool state, layers, transit values and claims are projections: rebuildable from the entries, changed only under the lock 14.3 names, and checked by Rebuild and compare (`PRD-MOD-012`; 2.1).
- **Unknown and none.** An Unknown value is a null in a nullable column, and a column that holds an amount says whether it is known: a `value_known boolean`, with a `CHECK` that the amount is null exactly when it is not known. A link that a kind does not have (a reversal's original, a parent origin) is null only where a `CHECK` on the kind says the link does not exist, so a null link never stands for Unknown (code-house-rules 3.3; `PRD-MOD-015`).
- Amounts are `bigint` in paise, with names ending `_paise` (`PRD-MOD-014`). Quantities are whole numbers in the stock unit, `integer`. Times are `occurred_at`, `recorded_at` and `business_date` (code-house-rules 9).
- States and kinds are `text` with a `CHECK` listing their names: movement kinds as in 2.3; conditions good, damaged, wrong, unidentified; held as custody, in transit, billed-retained; hold and reservation kinds as in 6.1.
- **Scope facts.** Every table is `scoped`. A row carries one value of each fact its record type declares (access-and-approvals 5.3). The legal entity comes from the unit's mapping version the row used (`POL-10.01`). The brand is the SKU's; Unknown for goods of Unknown SKU, so only all-members brand scope sees them (access-and-approvals 5.3). No table holds two values of one fact, except the brand sets of the header rows below (code-house-rules 6.2, CH-6):
  - a movement between two places is written as legs, one place each (14.2);
  - `movement`, `hold`, `hold_scope` and `reservation` can cover goods of several brands, such as a count freeze over a location, a multi-line reservation or an identity resolved from Unknown, so they declare `site_id`, `store_id`, `business_unit_id` and `legal_entity_id`, and each records its brand set; a brand-limited reader sees such a row only with access to every brand it records (access-and-approvals 5.3; SL-25 (d), product owner, 6 Oct 2026). The set is an array column on the row, checked by the every-brand `access` function of code-house-rules 6.2 (`DEC-117`);
  - `unit_anchor` carries no brand: it is matched by place only (`DEC-117`);
  - `cost_pool`, `cost_layer` and the pool rows of `valuation` and `valuation_layer` declare no Store and no business unit, since a Site pool is shared by every unit of its book at the Site, and a book pool declares no Site either (SL-25 (c), (e), approved 6 Oct 2026); they declare legal entity and brand. A reader who sees them still sees cost and value only with the cost field permission (13.6);
  - every other table declares all five, `brand_id` included: each of its rows holds one SKU, so one brand. Releases and reservation events name the one claim they end, and `transit_value` has one row per SKU;
  - `cost_pool` declares no Site in book mode (SL-25 (c)).

  A command's rechecks under lock must still respect holds and count freezes its actor cannot see: they read them through one narrowly authorised internal `stock` function that sees every such row at the command's unit and returns only a generic refusal, never the hidden row's details (code-house-rules 6.2; `DEC-117`). As built it is `stock.recheck_hidden`, and the refusal is `blocked` (13.8, 13.9; S1-F10-T02).

  What this leaves open is SL-25 (a).

### 14.2 Schema `stock`

"Scope" is the scope facts of 14.1; "source" is the source of 13.2 (`source_module`, `source_record_type`, `source_record_id`, `source_version_id`, `source_line_id`, `source_import_kind`); "actor" is `actor_user_id` or `actor_service_identity_id`, `on_behalf_of_user_id` and `role_assignment_id`. Register marks are those of code-house-rules 3.2.

| Table | Holds | Columns beyond `id` | Keys and constraints | Register |
| --- | --- | --- | --- | --- |
| `unit_anchor` | One lock row per Site and business unit (13.1, 14.3) | `site_id`, `business_unit_id`, scope | Unique (`site_id`, `business_unit_id`) | scoped, append-only, locked |
| `receipt_origin` | A receipt origin's fixed facts (section 4) | `origin_kind` (receipt, opening, surplus, split, identity resolved); `parent_origin_id`; source; `sku_id`, `sku_version_id` (Unknown allowed); `stock_unit`; `piece_tracked boolean`; `batch_tracked boolean`, `batch_code`, `expiry_date`; `quantity integer`; `count_date date`; receiving scope; `mapping_version_id`; `book_id`; `occurred_at`, `recorded_at` | Parent present exactly for split and identity resolved; batch and expiry present exactly when tracked; quantity above zero | scoped, append-only, locked |
| `receipt_origin_state` | What changes on an origin | `receipt_origin_id` (unique); `owner_kind` (organisation, supplier, brand), `owner_legal_entity_id`, `owner_party_id`, `owner_brand_id`, `agreement_version_id` (all null while the owner is Unknown); `value_known`; `p_rate_paise`, the P RATE of the covering revision as the PT gives it, per unit; `established_value_paise`, the exact total that cost established and cost adjustments added; `origin_quantity`, copied from the origin; `pt_revision_id`, `covered_quantity`; `last_state_movement_id`, the last movement that changed this row, always under the origin's exclusive lock; scope | Exactly one owner column, the one its kind names, or none while the owner is Unknown; covered quantity within `origin_quantity`, which a foreign key on (`receipt_origin_id`, `origin_quantity`) to the origin's unique (`id`, `quantity`) keeps equal to the origin's; amounts null exactly when not known. No per-unit cost is stored, so no rounding hides in it (`PRD-MOD-014`; SL-2) | scoped, projection |
| `movement` | One movement, recorded at the place where it happens: the source Site for a dispatch, the destination for an arrival, the unit it leaves for a move between two units at one Site (2.2) | `kind`; source; actor; `approval_use_id` (from `access`); `reverses_movement_id`; `correction_of_movement_id`; `business_date`, `occurred_at`, `recorded_at`; scope of that place, with the brand set `brand_ids` | `CHECK` `source_import_kind` is not historical reference (`PRD-LIF-014`): it is `none` or one of the other import kinds of imports-and-opening-data 4.1 (`create`, `update`, `opening-balance`, `transaction`), on every row that carries a source; reverses present exactly for a reversal; unique (`source_module`, `source_record_type`, `source_record_id`, `source_line_id`, `kind`, `reverses_movement_id`) with nulls not distinct, so one source line posts each kind once. A movement that a later event of the same line makes, such as the handover of a billed-retained sale after the bill, names that event's own source record (the `pos` design names it before SL-17 is set) | scoped, append-only |
| `movement_leg` | One side of a movement at one place: out of a place or into it. A value-only kind (cost established, cost adjustment, write-off, ownership change) has no legs; its valuations carry its units | `movement_id`; `direction` (out, in); `receipt_origin_id`; `sku_id`; `quantity`; `location_id`; `condition`; `held_as`; `transit_kind` (dispatch, return shipment), `transit_ref`; batch and expiry; `book_id`, the book of the unit's mapping the leg used (`PRD-ORG-005`), so that "has this book held stock?" is answered from the ledger's own rows (13.7; S1-F10-T01); `accepted_quantity`, how many of its units were accepted, so accepted quantities are rebuilt (13.9; S1-F10-T02); scope of its place | Quantity above zero; transit kind and reference present exactly when held in transit; location present exactly when not in transit | scoped, append-only |
| `movement_piece` | The pieces a movement moved | `movement_id`, `piece_id`, scope of the movement | Unique (`movement_id`, `piece_id`) | scoped, append-only |
| `sku_balance` | Total quantity per Site, business unit and SKU: the lock row of 10.3 step 3 | `site_id`, `business_unit_id`, `sku_id`, `stock_unit`, `quantity`, scope | Unique (`site_id`, `business_unit_id`, `sku_id`) with nulls not distinct; quantity not below zero | scoped, projection, locked |
| `balance` | Quantity at one balance key: place, location, condition, how held, transit reference, SKU, batch, expiry and receipt origin (6.2) | `sku_balance_id`; the key columns; `count_date`, copied from the receipt origin; `quantity`; `accepted_quantity`; scope | Unique on the key with nulls not distinct; `count_date` equal to the origin's, held by a foreign key on (`receipt_origin_id`, `count_date`) to the origin's unique (`id`, `count_date`); quantity not below zero; accepted within quantity; changed only under its `sku_balance` row's lock | scoped, projection |
| `piece` | One piece's current state (section 5) | `code` (the piece ID label); `sku_id`; `receipt_origin_id`; place, location, condition, held as, transit reference; `in_custody boolean`; `pt_revision_id`; `accepted_site_id`; `last_movement_id`; scope of its place | Unique `code`; code never changes (trigger) | scoped, projection, locked |
| `coverage` | PT coverage records | `pt_revision_id`; `receipt_origin_id`; `piece_tracked`, copied from the origin; `piece_id`; `quantity`; `action` (cover, remove); `removes_coverage_id`; source; actor; times; scope | `piece_id` present exactly when `piece_tracked`; the copy is held true by a foreign key on (`receipt_origin_id`, `piece_tracked`) to the origin's unique (`id`, `piece_tracked`); remove names the record it removes, once | scoped, append-only |
| `acceptance` | Acceptance records: barcode verified and physically accepted at a Site | `receipt_origin_id`; `piece_id`; `quantity`; place, with the `location_id` and `condition` of the balance accepted at (13.9; S1-F10-T02); source; actor; times; scope | Quantity above zero | scoped, append-only |
| `hold` | A hold, with its kind, reason, evidence, who raised it, and the reservation it may sit inside (6.1) | `kind`; `reason`; `evidence_file_id`; `within_reservation_id`; source; actor; times; scope where raised | Kind among the hold kinds of 6.1, count freeze and write-off included; unique (`id`, `kind`) for the copies below | scoped, append-only, locked |
| `hold_scope` | A count freeze's scope | `hold_id`; `hold_kind`, copied; `location_id`, `scope_brand_id` or `sku_id`; scope | Exactly one of the three per row; `hold_kind` is count freeze, held true by a foreign key on (`hold_id`, `hold_kind`) to `hold` (`id`, `kind`) | scoped, append-only |
| `hold_claim` | What a hold covers now: pieces, or a quantity at a balance key | `hold_id`; `piece_id` or `balance_id` and `quantity`; `claimed_quantity`, what it claimed when placed, never changed (13.9; S1-F10-T02); scope of the place | Changed only under the hold's lock; moves with its goods (`POL-17.01`) | scoped, projection |
| `hold_release` | The release event | `hold_id`; `hold_kind`, copied as for `hold_scope`; `hold_claim_id`, the one claim it ends, or none for a count freeze, whose one release ends it whole, once (13.9; S1-F10-T02); `release_event`; `quantity` or pieces, none for a count freeze; source; actor; times; scope | `CHECK` that the release event is one of the hold kind's own (6.1): damage `report-rejected` or `damage-confirmed`; quarantine `approved-decision`; excess `pt-route` or `loss-link`; source conflict `conflict-resolved`; expiry `rule-change`, `supplier-return`, `write-off` or `disposal`; ordinary `released`; count freeze `count-closed`; inspection `inspected`; write-off `disposal` or `write-off-reversed` (S1-F10-T01); quantity within the claim, rechecked under the hold's lock (13.5) | scoped, append-only |
| `reservation` | A reservation, with its kind and the document that made it | `kind`; source; actor; times; scope of the place reserved | Kind among the reservation kinds of 6.1 | scoped, append-only, locked |
| `reservation_claim` | What a reservation covers now | `reservation_id`; `piece_id` or `balance_id` and `quantity`; `claimed_quantity`, as for `hold_claim` (S1-F10-T02); scope | Changed only under the reservation's lock | scoped, projection |
| `reservation_event` | Consumption, cancellation, withdrawal or release | `reservation_id`; `reservation_kind`, copied as `hold_release` copies its hold's; `reservation_claim_id`, the one claim it ends; `event`; `quantity` or pieces; `movement_id` where a dispatch, departure or offline sale consumed it; source; actor; times; scope | Never by time; the event is one of the kind's own, held by a foreign key on (`reservation_id`, `reservation_kind`) to `reservation` (`id`, `kind`): transfer `consumed` or `cancelled`, supplier return `consumed` or `withdrawn`, held goods `consumed` or `cancelled`, offline protected quantity `consumed` or `released`; and, for any kind, `moved`, when a location move inside one unit carries the claim's units to another balance, where a new claim of the same reservation holds them (13.9; product owner, 8 Oct 2026); `movement_id` present exactly when consumed or moved (S1-F10-T01); quantity within what the claim holds, rechecked under the reservation's lock (13.5) | scoped, append-only |
| `cost_pool` | One pool (7.1) | `book_id`; `sku_id`; `pool_mode` (book, site); `site_id`; `formula` (moving average, FIFO); `cost_setting_version_id` (from `finance`); `quantity`; `value_paise`; `last_sequence bigint`; `closed_at`; `legal_entity_id`, `brand_id` | Site present exactly in Site mode; one open pool per book, SKU and Site (partial unique, with nulls not distinct, so a book pool's empty Site counts as one value); a new pool takes `formula`, `pool_mode` and `cost_setting_version_id` from the cost setting read at Plan (13.1), and is created at 10.3 step 6; `formula` never changes (trigger); unique (`id`, `formula`) for the copy below; quantity and value not below zero | scoped, projection, locked |
| `cost_layer` | One FIFO layer (7.4) | `cost_pool_id`; `pool_formula`, copied; `entered_sequence`; `entered_at`; `quantity_in`, `quantity_left`; `value_in_paise`, `value_left_paise`; `from_layer_id`, `receipt_origin_id`, `from_valuation_id` (lineage); scope of the pool | `pool_formula` is FIFO, held true by a foreign key on (`cost_pool_id`, `pool_formula`) to `cost_pool` (`id`, `formula`); left amounts not below zero; changed only under the pool's lock | scoped, projection |
| `valuation` | One valued movement's effect on one pool or one transit value (7.10) | `movement_id`; `receipt_origin_id`, the origin whose units the value belongs to; `cost_pool_id` or `transit_value_id`; `sequence`; `quantity_delta`, `value_delta_paise`; quantity and value before and after; `event_kind`, `component`; `business_date`, `accounting_date`; scope | Unique (`cost_pool_id`, `sequence`); after = before + delta; `event_kind` is the posting event kind of books-and-posting 7.2, or `none` where 13.4 says none; a pool row names no Store or unit | scoped, append-only |
| `valuation_layer` | The layers a valuation took or made, per piece for piece-tracked goods (7.4) | `valuation_id`; `cost_layer_id`; `piece_id`; `quantity`; `value_paise`; scope | — | scoped, append-only |
| `transit_value` | Value held on a dispatch between pools or on a supplier-return shipment (7.8) | `transit_kind`; `transit_ref`; `book_id`; `sku_id`; `quantity`; `value_paise`; scope of the source place, with the SKU's brand | Unique (`transit_kind`, `transit_ref`, `book_id`, `sku_id`): one row per SKU, so one brand; not below zero | scoped, projection, locked |
| `transit_value_layer` | Under FIFO, the source layers a transit value holds (7.7, 7.8) | `transit_value_id`; `source_layer_id`; `quantity`; `value_paise`; scope | Changed only under the transit value's lock | scoped, projection |

- The source line's unique key on `movement` and Post's unique posting-source rows (books-and-posting 9.3) are the last guards against a second effect; the first is the kernel's idempotency helper (10.1; `PRD-INT-002`).
- A piece is in one place by construction: its place is one set of columns on its one `piece` row (11.7).
- No column has a default except `recorded_at` (code-house-rules 3.3).
- **Rules across tables** are held by a column copied from the row they depend on, kept true by a composite foreign key or a trigger, as each row above says. A copy of a receipt origin's fact is held by a foreign key, never by a trigger that reads the origin: a trigger runs with the runtime role's rights, so row-level security would hide an origin at another place, while a foreign key's check does not (S1-F10-T01); a rule over a running quantity, such as a release within its claim, is rechecked by the command under the lock that guards it (13.1). **Proposed.**

### 14.3 Locks, indexes and row-level security

| 10.3 step | Rows | Mode | Rows changed only under them |
| --- | --- | --- | --- |
| 2 | `receipt_origin` | Exclusive when its state changes (cost, owner, coverage, split, identity); shared when only read, as by a sale or a transfer (SL-24) | `receipt_origin_state`, changed only by a command holding the origin exclusively; a sale or transfer never writes it |
| 3 | `unit_anchor` and `sku_balance`, in one call, in the helper's ascending order | `unit_anchor`: shared for every item at that unit; exclusive to start or end a count freeze (SL-24). `sku_balance`: exclusive | `balance`; new receipt origins at that unit |
| 4 | `piece` | Exclusive | — |
| 5 | `hold`, `reservation` being released, consumed or moved | Exclusive | `hold_claim`, `reservation_claim` |
| 6 | `cost_pool`, `transit_value` | Exclusive | `cost_layer`, `transit_value_layer`, `valuation` sequence |

- **Why a unit anchor.** A count freeze over a location or a brand must stop goods of a SKU that is not yet at the unit from moving in while the freeze starts (11.9). Every item takes its unit's anchor in shared mode, so items never wait for each other on it; a freeze start takes it exclusively, so it waits for items in flight, and every item that locks after it sees the freeze. Approved with SL-24; contention on it is measured (10.3).
- **The anchor measured** (S1-F10-T02; `apps/server/test/stock-ledger-anchor.int.test.ts`, synthetic data, the test container on a development laptop). Receipt counts of one unit each, every loop its own SKU, so only the anchor is shared: four loops at one unit ran 236 a second (p95 21 ms) against 227 a second (p95 22 ms) for four loops each at a unit of its own, so sharing the anchor costs nothing measurable; eight loops at one unit ran 278 a second (p95 37 ms) against 60 a second for one. With five freeze starts and ends at the same unit while eight loops ran, the slowest start waited 100 ms and the slowest end 69 ms; the loops slowed to 190 a second (p95 70 ms), and nothing reached the one-second lock limit. No change was needed. Measured again after the review fixes (S1-F10 review), with the same method: 52 a second for one loop; 216 a second for four loops at one unit against 209 for four at units of their own; 255 a second for eight; with the freezes 171 a second (p95 79 ms), slowest start 84 ms, slowest end 76 ms. The test prints its numbers only when `AOS_STOCK_ANCHOR_REPORT` is 1. Two concurrency tests on separate connections, ordered by what PostgreSQL reports (code-house-rules 10.3), prove the interlock: a freeze start waits for an item holding the anchor shared and then counts what it posted, and an item that locks after a freeze start is `count-freeze-active`.
- **The policies on volume data** (code-house-rules 6.2; S1-F10 review; `apps/server/test/stock-ledger-policy-cost.int.test.ts`). With 20,000 SYNTHETIC origins, SKU balances, balances, movements and legs at 200 units, and 5,000 holds and 5,000 reservations with a claim each, a reader scoped to one Site ran the ledger's hot queries under `EXPLAIN ANALYZE`: each reached its rows by an index and checked the policy only on them, none by a sequential scan filtered by the policy; the slowest took 3.3 ms (a unit's balances by its SKU balances), the others under 1 ms. No index was added.
- **Missing rows.** Step 3 creates missing `unit_anchor` and `sku_balance` rows, empty, in ascending key order, before its lock call (10.3; code-house-rules 8.2). A pool or a transit value that does not exist yet is created the same way at step 6, since two commands can need the same one at once (SL-24); a new pool takes its formula, pool mode and cost-setting version from the cost setting read at Plan (14.2). Every other new row, such as a receipt origin, a piece or a layer, is a new identity no other command can be writing, so it is written with the effects.
- **Indexes.** Each unique key above. For the oldest-first choice (`PRD-STK-013`): `balance` on (`sku_balance_id`, `expiry_date`, `count_date`), using its copy of the origin's count date. For as-of reads (`PRD-MOD-003`): `movement_leg` on (`business_unit_id`, `sku_id`, `recorded_at`) and (`site_id`, `recorded_at`); `valuation` on (`cost_pool_id`, `sequence`) and (`recorded_at`); `movement` on the source columns. Every foreign key and every scope column has its own index (code-house-rules 3.3).
- **Row-level security.** Every table has the one policy of code-house-rules 6.2, passing `site_id`, `store_id`, `business_unit_id`, `legal_entity_id` and `brand_id` (`PRD-SEC-005`). Cost and value columns are the restricted class cost, protected by masking, not by the policy (access-and-approvals 6). The facts each row passes follow 14.1, as approved by the product owner, 6 Oct 2026 (SL-25; code-house-rules 6.2): a row at a unit that belongs to no Store passes no Store and is matched by its Site and unit; a book pool's rows pass no Site, so only all-members place scope sees them; a Site pool's rows pass no Store or unit, so only a place scope covering the whole Site sees them; a header row of 14.1 is seen by a brand-limited reader only with access to every brand it records. A reader who sees a pool row still sees its cost and value only with the cost field permission.
- **Record types.** Each table's policy names the record type of the ledger record it belongs to, declared in the permission registry with view only (`packages/schemas`; access-and-approvals 4.1): `stock.balance` (`unit_anchor`, `sku_balance`, `balance`), `stock.receipt_origin` (`receipt_origin`, `receipt_origin_state`), `stock.movement` (`movement`, `movement_leg`, `movement_piece`), `stock.piece`, `stock.coverage`, `stock.acceptance`, `stock.hold` (`hold`, `hold_scope`, `hold_claim`, `hold_release`), `stock.reservation` (`reservation`, `reservation_claim`, `reservation_event`), `stock.cost_pool` (`cost_pool`, `cost_layer`), `stock.valuation` (`valuation`, `valuation_layer`) and `stock.transit_value` (`transit_value`, `transit_value_layer`). Each declares legal entity, place and brand; those with cost or value columns declare the field class cost. A business action is authorised on the posting module's own document type (13.2); the policy admits a write only where its actor could read the row, so a poster's role also holds view on the stock types over the same scope (code-house-rules 6.2). **Design choice** (S1-F10-T01).
- **The brand set.** `movement`, `hold`, `hold_scope` and `reservation` keep it as `brand_ids uuid[]` and pass it to `access.row_visible_brand_set` (code-house-rules 6.2): a null element is a brand that is Unknown, covered only by all-members brand scope; an empty set records no brand. `unit_anchor` passes the empty set, so it is matched by place and legal entity only (`DEC-117`).
- **Register.** Each table has its entry in `apps/server/migrations/organisation/tables.json` (code-house-rules 3.2 and 4.1), with the class and marks of 14.2 and the section "stock-ledger 14.2". A `locked` append-only table grants the runtime role `UPDATE (id)` only (code-house-rules 5.2 and 7.1).
- **Large documents.** The staged commit of 10.6 holds: Plan does the slow work; Lock takes every row of a step in one call; Write uses set-based inserts in lock order (`PRD-PRF-003`).

## 15. Synthetic harness

**Approved** by the product owner, 6 Oct 2026 (RR-012). It writes the harness decisions H1 to H6 that the product owner took on 5 Oct 2026 (DEC-112) into this design. The plan and its options are [S1-F10 spec](../../plan/stage-1/s1-f10-stock-ledger/spec.md), which is not ranked; this section is the design.

### 15.1 Where H1 to H6 sit

| Decision (DEC-112) | Where it sits |
| --- | --- |
| H1. A test-only synthetic document driver exercises the real stock and posting logic | The driver plays the owning module of each document of the golden scenarios. It calls only public interfaces (`kernel`, `configuration`, `access`, `numbering`, `exceptions`, `audit`, `stock` · ledger, `finance` · books), runs each command in the shape of module-map 6.1 and the four operations of 13.1, and writes no other module's tables. Its commands and the items they send are those of s1-f10-stock-harness 3.2 |
| H2. Registered callers; synthetic callers only in tests | 13.2. The driver registers as a synthetic caller, with the record types and item kinds of its commands |
| H3. A test-only schema | 15.2 |
| H4. Synthetic approval action types through the real approval machinery | 15.3 |
| H5. Test runs only, in isolated test databases, never live | 15.5 |
| H6. Read models first; raw queries only under a read-only test role | Checks run through Rebuild and compare and the read models of 13.6, and through the trial balance and posting-source rows of books-and-posting 12 and 8.3. Raw invariant queries, such as "every piece is in exactly one place", run under the role of 15.4 |

- Every golden scenario stays: receipt, transfer, sale, customer return, cost established at PT approval, late cost change, opening count, the supplier-return legs, damage, count and reversals (DEC-112; section 11). They run under both formulas and both pool modes, each combination in its own database copy (code-house-rules 11.3; `PRD-LED-014`, `PRD-LED-015`, `PRD-ACP-018`).
- Expected values come from 11.2 to 11.8 and books-and-posting 16, written by hand into scenario files and reviewed; never produced by the code under test.
- The concurrency tests of 11.9 run on separate connections, ordered as code-house-rules 10.3 says (`PRD-SEC-016`). The large-posting timing is an early signal; the binding measurement is the counter's in stage 4.
- Tests of the real source documents are still needed when those documents arrive; the same scenario files are then run with the real document in place of the driver's command (DEC-112).

### 15.2 The test-only schema

- Schema `test_stock_harness`, created by the test-only migration set `apps/server/test/migrations/` and applied by test setup only, after the Organisation set (code-house-rules 11.4). The catalogue test fails if it exists in a database the pre-deploy runner migrated (code-house-rules 10.4).
- Four tables, **Proposed**, in place of the one table first planned in the S1-F10 spec, so the driver follows code-house-rules 3.3 and 7.2:
  - `document`: `id`; `kind` (the driver's command kinds); `version_id`, a new UUIDv7 for each change, and `version_no`; `state`; the Site, Store, business unit, legal entity and book of the document, and for a transfer its destination's; `occurred_at`, `recorded_at`;
  - `document_line`: one row per line of a version, with typed columns: `document_id`, `version_id`, `line_id`, SKU, quantity, places, the receipt origin or movement it names, piece codes in `document_line_piece`, and amounts as `bigint` paise with `value_known`. No amount or constraint column is held in `jsonb`;
  - `document_change`: who recorded a change in which version and when, so a version can have several preparers and independence is tested as access-and-approvals 9.1 requires.
- The driver locks its rows at 10.3 step 1, and a change after approval makes a new version, so stale-version and material-change refusals are real (`PRD-ACS-007`; access-and-approvals 9.7).
- Their register entries, in the test set's own `tables.json`: `unscoped`, because a driver document can span two places and every row is synthetic. `document` is `locked` and changes its state and current version; `document_line`, `document_line_piece` and `document_change` are append-only. **Proposed.** The ledger's own rows the driver causes keep their scope and their policies (14.3), so the isolation tests read real scoped rows.

### 15.3 Synthetic approvals

- The driver declares its approval action types in test code, as each owning module declares its own (access-and-approvals 8). Each requires independent approval and has cost as its value basis, like the stock actions of domain-model 5 (`PRD-ACS-006`, `PRD-ACS-015`). Their names begin `test-`, as `access` requires of a synthetic action type, and carry the synthetic label of code-house-rules 11.1: `test-syn-stock-harness.` (`syntheticIdentifier`, S1-F10 review). `access` accepts them only in a test composition, as 13.2 does for callers. **Proposed.**
- Request approval, Decide, Verify under lock and Record use are the real operations of `access`, and so is the queued posting job of 10.6 (DEC-097; access-and-approvals 9.8). Synthetic limits are set through the real limit interface and labelled synthetic (`POL-02.09`; code-house-rules 11.1).
- The real action types arrive with their modules, and their tests follow then.

### 15.4 The read-only role

Code-house-rules 5.1 leaves the role's name, grants and reading under row-level security to the stock harness. **Proposed:**

- Name `syn_verify`, made by test setup, once per test container, as test plumbing is (code-house-rules 11.1). Never created by the runner, the local seed or the Railway runbook (DEC-112, CH-4).
- Grants: membership of PostgreSQL's `pg_read_all_data`, which reads every table and uses every schema; `BYPASSRLS`, so that an invariant query sees every row of the synthetic database it checks; `default_transaction_read_only` on; nothing else. It owns nothing and cannot write.
- Each database copy: the test helper grants it `CONNECT` when it applies the runner's privilege step (code-house-rules 4.3 and 11.3).
- It only reads isolated test databases holding synthetic data. Scope tests never use it: they read as the runtime role with an actor set (code-house-rules 10.1; `PRD-SEC-005`).

### 15.5 Where the harness runs

- In test runs only, in each test file's own database copies (code-house-rules 11.3). Never on `dev`, `kdps-test` or production, never in a production composition, and it never sets a KDPS value (DEC-112; `PRD-SEC-017`).
- The GC-6 opening-count test handler is a synthetic caller in the same way (13.2), and it too runs in tests only, never on `dev` (GC6-18, RR-013; answered by the product owner, 6 Oct 2026; DEC-116; imports-and-opening-data 12).
- What it proves and how it is accepted is the S1-F10 spec's ([spec](../../plan/stage-1/s1-f10-stock-ledger/spec.md) 3.4 to 3.7) and the stage 1 exit checklist ([stage 1](../../plan/stage-1/README.md) section 7).
- S1-F10 is delivered in two parts ([stage 1](../../plan/stage-1/README.md) section 8; product owner, 6 Oct 2026): "Stock quantities and movements", built right after S1-F01, then "Stock valuation and accounting". Development tests of the first part may use stand-ins of the `organisation` and `merchandise` read contracts; its acceptance uses the real modules.
