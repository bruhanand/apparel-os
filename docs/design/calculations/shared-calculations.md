# Shared calculations

> **Rank 3 of 4: design.** Must not contradict the PRD or the KDPS policies. See [README.md](../../README.md).

Status: **Current**, 4 Oct 2026. If this document disagrees with [prd.md](../../prd.md) or [kdps-policies.md](../../kdps-policies.md), they win. Raise the clash; do not guess.

Implements these PRD sections: from Module and data boundaries, the shared pricing, tax, discount allocation, rounding and incentive logic, money and Unknown; from Counter sales and payments, price, offers, discounts, tax, rounding and tender allocation; from Customer returns, exchanges and credit, refund entitlement, exchange differences and split-tender refunds; from Offers, prices and supplier returns, offer evaluation and price lists; from Tax and assets, the tax-rule records the calculations read; from Offline counter, what the counter holds for pricing. It details the `calculations` module of [module-map.md](../architecture/module-map.md) 4.2 and the tax rules part of 4.14, and is GC-7 in [gaps-before-code.md](../../history/gaps-before-code.md).

- PRD IDs: `PRD-MOD-002`, `PRD-MOD-007`, `PRD-MOD-010`, `PRD-MOD-014`–`PRD-MOD-016`; `PRD-POS-002`–`PRD-POS-009`, `PRD-POS-013`, `PRD-POS-014`, `PRD-POS-023`, `PRD-POS-024`; `PRD-RET-001`, `PRD-RET-005`–`PRD-RET-008`, `PRD-RET-010`, `PRD-RET-022`, `PRD-RET-024`; `PRD-OFR-001`–`PRD-OFR-006`, `PRD-OFR-021`; `PRD-TAX-005`; `PRD-OFF-004`, `PRD-OFF-005`, `PRD-OFF-009`, `PRD-OFF-016`; `PRD-MER-009`, `PRD-MER-015`; `PRD-STK-013`; `PRD-PTW-010`, `PRD-PTW-011`; `PRD-ACS-015`; `PRD-HRM-010`; `PRD-SEC-016`, `PRD-SEC-017`; `PRD-PRF-003`; `PRD-ACP-008`, `PRD-ACP-010`, `PRD-ACP-017`, `PRD-ACP-018`.
- Policies: 3 (`POL-03.06`–`POL-03.08`), 6 (`POL-06.04`, `POL-06.09`), 7 (`POL-07.01`, `POL-07.02`), 9 (`POL-09.13`, `POL-09.24`), 10 (`POL-10.02`, `POL-10.05`, `POL-10.06`, `POL-10.10`, `POL-10.11`), 13 (`POL-13.06`, `POL-13.08`), 16 (`POL-16.04`), 19 (`POL-19.01`, `POL-19.02`, `POL-19.04`).
- Decisions: DEC-007, DEC-105, DEC-108, DEC-109, DEC-110, DEC-111, DEC-112, DEC-116.

Depends on: [module-map.md](../architecture/module-map.md) (4.2, 4.14, section 5 and 6.2 flow D: who calls the calculations and where they sit), [domain-model.md](../architecture/domain-model.md) (3.12: the working set), [structure-and-masters.md](../masters/structure-and-masters.md) (4.1: HSN on the style), [stock-ledger.md](../stock/stock-ledger.md) (section 4: which receipt origin a sale takes), [books-and-posting.md](../finance/books-and-posting.md) (7.3: the `pos` posting kinds that carry these amounts), [design-language.md](../ui/design-language.md) section 8 (money and Unknown on screen).

Used by: `pos` and `offers` (stage 4), `merchandise` · PT (stage 2, costing), `finance` · tax rules (stage 1), the offline counter design (GC-8), `hr` (stage 6, incentives), and the code of `packages/calculations`.

---

## 1. What this document fixes

- Where the shared calculation logic sits in the workspace, who calls it, and what the counter receives and never receives (section 2).
- How numbers are held and rounded: integer paise, exact intermediates, named rounding rules, and Unknown (section 3).
- Which rule versions every calculation takes and returns, so a bill keeps its snapshot (section 4).
- The steps that price a bill: start price, offers, the spread of group discounts, manual discounts, tax and the bill total (section 5); tenders (section 6); returns, exchanges and refunds (section 7); costing and ticket margin (section 8); incentives in outline (section 9).
- The tax-rule records the calculations read, and their tables (section 10).
- The interface (section 11), the golden-case format, how one set runs on both server and counter, and the cases themselves (section 12).

It fixes no tax rate, value slab, rounding rule, stacking order, offer, price, cap, cost formula or date. Those are KDPS's, Accounts' and the CA's, and stay OPEN until supplied (section 13). Every value in section 12 is synthetic. Labels (**Design choice**, **Proposed**, **OPEN**) mean what module-map section 1 says.

## 2. Where the logic sits

### 2.1 The package

- The `calculations` module (module-map 4.2, tier 0) is the workspace package `packages/calculations`, named `@apparel-os/calculations`. A package, not a server folder, because the counter runs the same code (`PRD-MOD-007`). **Design choice.**
- It imports only `@apparel-os/domain` (paise, Unknown). No database, no network, no clock, no randomness, no environment: the date and every rule come in as inputs. The same input always gives the same output. **Design choice.**
- It has two entry points. `@apparel-os/calculations` holds selling: price, offers, spread, tax, rounding, tenders and returns. `@apparel-os/calculations/costing` holds costing and ticket margin (section 8), which only the server imports. A build check fails if the counter bundle contains the costing entry point (`PRD-OFF-004`). **Design choice.**
- The module check already says nothing under `packages/` imports from `apps/`. The code session adds a rule that `packages/calculations` imports only `@apparel-os/domain`. The `calculations` entry in its tier table names no server folder; that session removes it or keeps it as a guard against a server folder of that name (`PRD-MOD-002`). **Design choice.**
- Its input and result shapes are TypeScript types in the package. Where a shape crosses the API (a priced bill, a working set), `packages/schemas` holds its Zod schema. **Design choice.**

### 2.2 Who calls it

| Caller | What it calls | When |
| --- | --- | --- |
| `pos` on the server | Price a bill, check tenders, refund and exchange amounts | Every finalisation, return and exchange (module-map 6.2 flow D). Stage 4 |
| The counter PWA | The same selling functions, on its working set | While building a cart, and to commit an offline bill locally (GC-8). Stage 4 |
| `offers` | Offer eligibility and evaluation | Running Offers shows the same evaluation as checkout (`PRD-OFR-003`). Stage 4 |
| `merchandise` · PT | Costing and ticket margin | PT workbench (`PRD-PTW-010`, `PRD-PTW-011`). Stage 2 |
| `hr` | Incentives | Stage 6 (section 9) |

- The caller fetches the rule data through the owners' interfaces and passes it in: tax rules and rounding rules from `finance` · tax rules (section 10), offers, combination rules and price lists from `offers`, the costing profile from `merchandise` · PT, the return policy snapshot from the bill (module-map 4.2).
- Authority is never checked here. A manual price change or discount needs the configured authority and reason (`PRD-POS-003`); `pos` checks that through `access`. The calculation only computes.
- An online bill is priced on the server at finalisation with the versions in force then. If the result differs from what the counter showed, finalisation is refused and the counter prices the bill again (`PRD-POS-009`, `PRD-POS-013`). **Design choice.**
- An offline bill is priced on the counter with its working set. On upload the server prices it again with the versions the bill recorded; a different result sends the bill to the reconciliation queue, and the bill is never changed or discarded (`PRD-OFF-005`, `PRD-OFF-009`). **Design choice.**

### 2.3 What the counter gets and never gets

`PRD-OFF-004`, domain-model 3.12.

| The counter's working set holds | Never sent to the counter |
| --- | --- |
| Identities and aliases of eligible goods; each SKU's MRP groups at the Store, with eligible quantity per MRP | Cost, BASIC, P RATE, cost layers or pools |
| Price lists in force for the Store | Ticket MARGIN and any other margin |
| Offers and combination rules in force for the Store, without cost shares | Receipt-origin value |
| Tax rules, the price basis setting and rounding rules in force for the Store's registrations | Offer cost shares between the Organisation and brands (`POL-19.02`). **Design choice:** pricing does not need them, and who funded a discount is worked out on the server from the bill (`PRD-OFR-006`) |
| The version of each, recorded on every bill (`PRD-OFF-005`); only valid cached prices, offers and tax versions may be used (`POL-16.04`) | The costing entry point (2.1) |

- **Two MRPs for one SKU.** A piece-tracked line takes the MRP of the piece's PT revision. When a quantity-tracked SKU has eligible stock at more than one MRP at the Store, the counter asks the cashier for the MRP printed on the item, and the sale takes receipt origins at that MRP, oldest first (`PRD-STK-013`, stock-ledger section 4). **Design choice.**

## 3. Numbers

### 3.1 Money and quantities

- Every INR amount in and out is an integer number of paise, the `Paise` type of `@apparel-os/domain` (`PRD-MOD-014`). An amount in another enabled currency is an integer in that currency's configured minor unit, never a `Paise` value, and carries its currency (`PRD-MOD-014`, `PRD-MOD-015`); its type is added to `@apparel-os/domain` before such a currency is enabled. Amounts are never negative: a discount, a refund or a round-off says its direction by its name.
- Quantities are whole numbers in the SKU's stock unit (pieces, pairs or packs). A fractional quantity is refused. **Design choice.**
- Rates and percentages come in as decimal strings, such as `"10"` or `"2.5"`, and are read exactly. They are never JavaScript numbers. **Design choice.**

### 3.2 Exact arithmetic

- Every intermediate value is an exact fraction of two `BigInt` integers. Nothing is held in binary floating point (`PRD-MOD-014`, domain-model invariant 18). No decimal library is needed. **Design choice.**
- An exact fraction becomes paise only at a named rounding step (3.3). A result that would need rounding where no step is named is a defect, caught by the tests in 12.5.

### 3.3 Rounding rules

- Each rounding step names a rounding rule version. A rule says the unit (1 paise, or a larger unit such as 100 paise), the mode (half up, half to even, up, or down) and, for tax, the level (each line, or the bill). The modes are the mechanism; which one applies is not set here (`PRD-MOD-015`).
- The rule kinds, each OPEN until Accounts or the CA set it (section 13):

| Kind | Where it applies | Owner of the value |
| --- | --- | --- |
| Discount | A percentage of a line value, from an offer or a manual discount (5.5, 5.7) | Accounts (GC7-5) |
| Tax | Each tax component (5.8) | Accounts, CA (GC7-3) |
| Bill | The round-off of the amount due (5.9) | Accounts, CA (GC7-4) |

- Three roundings are already fixed by the PRD and need no rule version: a spread share and a part-line refund are rounded down to whole paise (`PRD-POS-023`, `PRD-RET-024`), a split-tender refund share leaves its rounding paise to the largest tender (`PRD-RET-022`), and ticket MARGIN is rounded half up to two decimals (`PRD-PTW-011`).
- The rounding of a stock cost (stock-ledger 7.3, SL-2, V-64) and the rounding inside a costing profile (`POL-03.06`, V-15) are not these rules. The first belongs to the stock ledger; the second is part of each costing profile (section 8).
- Rounding and invoice tolerances (`POL-09.24`, V-11) are not rounding rules: they decide when a difference becomes an exception, and they never apply to a journal's balance (`POL-09.13`).
- Until the rule a step needs is in force, the calculation refuses with the missing rule named, and the live operation stays unavailable (`PRD-SEC-017`). Tests use the labelled synthetic rules of 12.3.
- A tax rounding rule at the level of the bill is refused `not-decided` (5.10), naming GC7-12, until 5.8 says how tax rounded on the bill is carried to each line's components and taxable value. **Proposed.**

### 3.4 Unknown

- An input that may be Unknown is a `MaybeKnown` value of `@apparel-os/domain`: the MRP of goods with no official PT coverage, a style's HSN, a costing input (`PRD-MOD-015`, `PRD-MER-015`).
- A selling calculation that needs an Unknown input refuses and names it. It never treats Unknown as zero and never prices part of a bill (`PRD-MOD-015`). The refusals are in 5.10.
- Costing returns Unknown, with the missing inputs listed, instead of refusing; `merchandise` · PT raises the exception and holds final costing approval (`POL-03.08`). A P RATE left as a fraction of a paise by a profile with no rounding step after it is Unknown the same way, with the rounding step listed as missing (section 8). **Design choice.**
- The exact-cash shorthand is not Unknown. An omitted cash-received entry is resolved to the declared cash amount before anything is stored; an entered zero is zero (`PRD-MOD-016`, `PRD-POS-007`; section 6).

## 4. Versioned inputs and the snapshot

- Every function takes, beside its data, the rule versions it uses, and returns them with its result (module-map 4.2). The caller stores them: a bill keeps them as its calculation-policy snapshot (`PRD-POS-014`, `PRD-MOD-010`), and an offline bill also records its working-set version (`PRD-OFF-005`).
- The versions a priced bill records:

| Input | Owner | Version recorded |
| --- | --- | --- |
| Price list | `offers` | The price list version that set a line's start price, if any |
| Offers and combination rules | `offers` | Every offer version considered, the ones applied, and the combination rule versions used |
| Goods classification, rate and value rule, registration applicability, price basis | `finance` · tax rules | Each version used, per line |
| Rounding rules | `finance` · tax rules | Each rule version used |
| Return policy | `pos` | The policy that applied to the sale, for later returns (`PRD-RET-001`, `POL-06.04`) |
| Working set | `pos` | Offline bills only (`PRD-OFF-005`) |

- What the offer rows record (**Design choice**, so that a bill priced again with only its recorded versions makes the same choice, 12.5):
  - **Considered:** every offer version in force at the Store, or at one of its groups, on the business date that covers at least one line of the bill once its markdown setting is applied (5.3). An offer that covers no line is not considered.
  - **Applied:** the offers of the chosen set (5.4), and the offers that overlap nothing, that give a discount above zero.
  - **Combination rules used:** every combination rule version in force on the date that names two or more considered offers, since together they decide which sets are permitted.
- The rounding rule versions a priced bill records (**Design choice**): the discount rule when working out any candidate set (5.4) or a manual discount used it; the tax rule when the registration charges tax; the bill rule always. A rule not used is recorded as none.
- A held cart keeps no prices. On recall it is priced again with the versions in force then (`PRD-POS-013`).
- A return or exchange reads the sale's recorded snapshot for what was paid, and current versions only for replacement goods (`PRD-RET-005`, `PRD-RET-007`; section 7).

## 5. Pricing a bill

### 5.1 The order of steps

`PRD-POS-004`, `PRD-OFR-021`, `PRD-POS-023`.

1. **Start price** of each line (5.2).
2. **Offers:** find the eligible offers (5.3), choose the permitted set (5.4), work out each offer's discount (5.5) and spread group discounts over their lines (5.6).
3. **Manual discounts** (5.7).
4. **Tax** on each line's value after all discounts (5.8).
5. **Bill total** and its round-off (5.9).

Discounts are allocated to lines before tax and rounding, so each line carries its own taxable value (`PRD-POS-004`).

### 5.2 Start price

- A line's start price per unit is the price-list price in force for the Store, if a price list covers the goods; otherwise the MRP of the goods sold (2.3). An authorised manual price change replaces it (`PRD-POS-003`, `PRD-OFR-004`).
- A start price above the MRP of the goods sold is refused, whether it comes from a price list or a manual change, with no override (`PRD-POS-024`, DEC-111).
- Goods with no known MRP cannot be priced: the line is refused (`PRD-MER-015`; 3.4). Sellable goods have official PT coverage, so this is a guard.
- Purchase cost, MRP, selling price, tax and discount stay separate in the result (`PRD-MER-009`).

### 5.3 Offers: eligibility

- An offer is percentage, flat-value, buy-X-get-Y or basket-value, by brand, item, Store or Store group and effective dates (`PRD-OFR-001`). Only approved offer versions in force on the bill's business date reach the calculation (`PRD-OFR-002`; the caller filters by approval, the calculation by Store, group, date and goods).
- Each offer version states, at approval, the settings the calculation needs. None has a default, and `offers` does not approve a version that lacks one (`PRD-OFR-002`):
  - whether it applies to lines whose start price came from a markdown price list;
  - for a percentage or flat-value offer, the rate or the amount off each unit;
  - for a basket-value offer, the threshold on the value of its eligible lines and the discount, as an amount or a rate;
  - for a buy-X-get-Y offer, X, Y, the reward (free, or a rate off) and which qualifying units are the reward units: the lowest-valued first or the highest-valued first.
- Running Offers lists the eligible offers for goods, Store and date through the same function, with their dates and combination rules (`PRD-OFR-003`).
- An offer or a combination rule is in force from its start date up to, but not including, its end date, as [structure-and-masters.md](../masters/structure-and-masters.md) 2.2 reads versions. **Proposed**; the offers design confirms it (stage 4).
- A line whose start price is a manual price change is not a markdown line for the markdown setting; only a markdown price list makes one. **Proposed** (GC7-9).
- A rate is a percentage from 0 to 100; an offer with a higher rate is malformed. **Design choice.**

### 5.4 Offers: which apply

`PRD-OFR-021`, `POL-19.04`, DEC-108.

- Two offers **overlap** when they apply to at least one common line.
- A **combination rule** version, in force on the bill's date, names offers that may combine, the order in which they apply, and how each applies to the value before it. Offers do not stack unless such a rule permits it; no rule is assumed (`POL-19.01`, `POL-19.04`). The rules, their orders and how they apply are KDPS's (V-43).
- **Proposed** (KDPS Owner and Brand manager confirm, GC7-9): a rule says, for its offers, either that each applies to the value left by the one before, or that each applies to the line's start value. A way KDPS needs beyond these two is added to the rule's shape before that rule is approved.
- A **permitted set** is a set of eligible offers in which every overlapping pair is permitted to combine by one rule in force.
- The calculation works out every permitted set and applies the one that gives the largest total discount on the bill. A tie goes to the set holding the offer approved first: order each tied set's offers by approval time, compare the lists from the start, and the earlier time wins; then the lower offer identifier (`PRD-OFR-021`). **Design choice** of the comparison.
- Offers that overlap nothing apply alongside the chosen set; they need no rule.
- **Proposed** (GC7-9): the offers of a set that share a line apply in the order of a rule in force that names all of them, and the way that rule gives. Where no one rule names them all, or the rules that do disagree on the order or the way, the set's order is not given and the calculation refuses `not-decided` (5.10), naming GC7-9. Across the bill the offers apply in one order that keeps every line's order; offers with no order between them go by approval time, then identifier.
- **Proposed** (product owner, GC7-17): in the tie-break, when both tied sets hold the offer approved first, a set whose ordered list is the start of the other's comes first. It decides which offers apply, and so who funds the discount (`PRD-OFR-021`, DEC-108; `POL-19.02`).
- Running Offers makes the same choice: for a cart or goods the person enters, it shows the set checkout would apply and why, from the same function (`PRD-OFR-021`, `PRD-OFR-003`).
- The number of sets grows quickly with overlapping offers. A performance test on the counter's devices sets the size the counter must handle (`PRD-PRF-003`). **Design choice.**

### 5.5 Offers: amounts

What each offer kind means in amounts is **Proposed** below; the PRD names the kinds without defining them (`PRD-OFR-001`). The KDPS Owner and Brand manager confirm it (GC7-9).


- **Percentage:** the rate times the line value at its turn, rounded by the discount rounding rule (3.3).
- **Flat-value:** the amount off each eligible unit, never more than the unit's value at its turn.
- **Basket-value:** if the eligible lines' value at its turn meets the threshold, the discount, never more than the eligible lines' value at its turn; a rate is rounded by the discount rounding rule. The discount is spread (5.6).
- **Buy-X-get-Y:** the qualifying units, ordered by value as the offer states (ties in bill order), make as many complete sets of X + Y as they can; that many times Y units are the reward units. The discount is their value, or the stated rate of it rounded by the discount rounding rule. The discount is spread (5.6).
- No line's value goes below zero. By its meaning above, a flat-value offer is worth no more than the units' value at its turn, and a basket amount no more than the eligible lines' value at its turn. Beyond that, a step that would take a line below zero is refused, never capped, naming the question that decides it: a rate that the discount rounding rule takes past the value it is a rate of, GC7-5; under a rule that applies offers to the start value, an offer taking more than is left, which is how combined offers apply to each other's values, GC7-9; the paise a spread leaves, GC7-16 (5.6). **Proposed.**
- When the reward units' value is not whole paise (a line's value at its turn does not divide by its quantity), a free reward has no named rounding step: the calculation refuses `not-decided`, naming GC7-14. **Proposed.**

### 5.6 Spreading a group discount

`PRD-POS-023`, DEC-109.

- A basket-value or buy-X-get-Y discount is spread over the lines that earned it. **Proposed** (the product owner decides, GC7-11): the lines that earned it are every line on the bill that the offer's eligibility covers, including buy-X-get-Y units left over after the complete sets.
- Until GC7-11 is decided (RR-042, `DEC-112`), no reading is applied where the two differ: a buy-X-get-Y offer with qualifying units left over after its complete sets is refused `not-decided`, naming GC7-11. Where every qualifying unit is in a complete set, and for a basket-value offer, both readings name the same lines. **Proposed.**
- Each line's share is the discount × the line's value before that discount ÷ the total of those values, rounded down to whole paise. The paise left go to the line with the largest such value, or to the first of them on the bill. If that line has less value left than the paise it would take, the calculation refuses `not-decided`, naming GC7-16. **Proposed.**
- A buy-X-get-Y reward unit is therefore never billed at zero, and a later return of one unit refunds its share (7.1).
- Spreading changes each line's taxable value and, under a value slab, may change its rate. The CA confirms this tax effect (GC7-10).

### 5.7 Manual discounts

- A manual discount, by amount or rate, needs the configured authority and reason (`PRD-POS-003`); its approval limit uses bill value as its basis (`PRD-ACS-015`). A rate is rounded by the discount rounding rule.
- On a line with no offer it applies to the line's value after step 2.
- A manual discount of nothing, a rate above 100%, an amount or rate that is not valid, or an amount above the line's value after step 2, is refused `invalid-amount`. **Design choice.** A rate of at most 100% that the discount rounding rule takes past the line's value is refused `not-decided`, naming GC7-5. **Proposed.**
- On a line that has an offer, whether a manual discount may apply, and in which order, is OPEN (GC7-7). Until KDPS sets it, the calculation refuses a manual discount on such a line.

### 5.8 Tax

`PRD-TAX-005`, `PRD-OFR-005`, `POL-10.02`.

- **Classification.** The line's goods classification is the HSN of its style ([structure-and-masters.md](../masters/structure-and-masters.md) 4.1). An Unknown HSN, or no classification in force on the bill's date, refuses the line (`POL-10.05`).
- **Rate.** The classification's rate and value rule in force gives the rate, by value slab where it has slabs. Which value is compared with a slab is part of the rule (10.1) and is OPEN for the CA (GC7-2).
- **Prices with or without tax.** The price basis setting says whether selling prices include tax (GC7-1). With tax included, the taxable value is worked out from the price paid; without, tax is added to it.
- **A tax-inclusive price and slabs.** The calculation tries each slab: it works out the taxable value at that slab's rate and keeps the slab it falls in. If no slab or more than one fits, the line is refused, because the answer is the CA's (GC7-2).
- **Components.** The registration applicability of the Store's tax registration says which tax components a counter sale carries and each one's share of the rate (GC7-8). Each component is worked out on the exact taxable value and rounded by the tax rounding rule. A tax rounding rule at the bill level is refused (3.3, GC7-12).
- **No tax charged.** Where the registration charges no tax on a counter sale, the line still needs a known classification in force; no rate rule is read, and the line carries no rate and no component. **Proposed** (GC7-8).
- **Taxable value with tax included.** It is the price paid less the rounded components, so the two always add up to what the customer pays. **Proposed** (the CA confirms, GC7-3).
- **The tax effect of a discount.** When a discount moves a line into a different slab, the result marks the line with the rate before and after, so the counter can show it (`PRD-OFR-005`). Every slab change is marked; no threshold is assumed. **Design choice.** If no single slab fits the value before discounts, the mark shows the rate before, and the taxable value at it, as Unknown. **Proposed** (the CA confirms, GC7-2).
- No rate, slab, component or date is set here. They are Accounts' and the CA's (V-18, `POL-10.05`, `POL-10.06`).

### 5.9 Bill total and round-off

- The bill total is the sum of the lines' amounts paid, tax included.
- The bill rounding rule says whether the amount due is rounded, to what unit and how. The difference is its own component of the result, named round-off, so `pos` can post it under the `pos` posting kinds (books-and-posting 7.3). Whether bills are rounded at all is OPEN (GC7-4); until it is set, the calculation refuses.
- The amount due is the bill total after round-off.

### 5.10 Results and refusals

- A priced bill returns, per line: the start price and its source, each offer's discount, the spread shares, the manual discount, the taxable value, each tax component with its rate, the slab-change mark, and the amount paid; for the bill: the totals, the round-off, the amount due, and the versions of section 4.
- A business condition is a typed refusal, never an exception thrown: `price-unknown`, `price-above-mrp`, `classification-unknown`, `no-tax-rule`, `slab-undetermined`, `rounding-rule-missing`, `manual-discount-not-permitted`, `invalid-quantity`. A refusal names the line and the missing or failing input. **Design choice** of the names.
- Tenders, returns and exchanges refuse with the codes of the cases in 12.4, and a cheaper-replacement rule that refuses the exchange with `cheaper-replacement-refused` (7.2). A manual discount out of bounds (5.7) and a zero MRP for MARGIN (section 8) give `invalid-amount`, as does an amount a person enters that is not valid: a negative or fractional manual price, manual discount, tender line or cash received (`PRD-POS-008`). **Design choice.**
- `not-decided`: a step whose rule an open question of section 13 leaves undecided refuses, naming the question, and never picks a reading. **Design choice.**
- Malformed rule data and identities are a defect in the caller, not a refusal: a malformed rate in an offer or a rule, a negative MRP or price-list price, two lines with one identity. An amount a person enters at the till is never treated so. How the costing entry point treats an amount a person enters on the PT workbench is left to the `merchandise` · PT design (stage 2, RR-225). **Design choice.**
- The priced bill has one canonical serialisation. Tender allocation refers to it (section 6). **Design choice.**

## 6. Tenders

`PRD-POS-005`–`PRD-POS-009`, `PRD-MOD-016`.

- The input is the canonical priced bill (5.10), the tender lines (kind, amount, instrument reference) and the cash received: an amount, or omitted.
- The check refuses when:
  - the tender lines do not add up exactly to the amount due, or a line is zero or negative (`PRD-POS-006`, `PRD-POS-008`);
  - cash received is given and no line is cash (`PRD-POS-008`);
  - cash received is less than the cash line (`PRD-POS-008`). An entered zero is zero, so it fails against any cash line (`PRD-POS-007`);
  - the allocation refers to a priced bill other than the current one: any item, quantity, offer or price change makes the old allocation stale (`PRD-POS-009`).
- An omitted cash-received entry becomes the cash line's amount before anything is stored (`PRD-MOD-016`, `PRD-POS-007`).
- Change is cash received less the cash line, on cash only (`PRD-POS-008`).
- A tender line is cash when its kind is cash; every other kind is checked by its amount only. Where an allocation holds more than one cash line, the cash line is their total. **Proposed**; the `pos` design confirms it (stage 4).
- Which tenders are enabled, whether an instrument is confirmed, and which tenders need online authority are `pos` and policy matters (`PRD-POS-005`, `PRD-OFF-016`). The calculation checks amounts only.

## 7. Returns, exchanges and refunds

### 7.1 What a returned unit is worth

`PRD-RET-005`, `PRD-RET-006`, `PRD-RET-024`, DEC-110.

- A bill line's entitlement is its sold quantity and its paid value, from the bill's snapshot, less every completed or pending return of it (`PRD-RET-005`). Current MRP and current offers play no part.
- The refund for returned units is the paid value the bill recorded for them, after offers and spread discounts. The offer is not worked out again on the units kept (`PRD-RET-024`).
- For part of a line, each returned unit takes the line's paid value ÷ sold quantity, rounded down to whole paise; the return that brings the returned quantity to the sold quantity takes all that remains (`PRD-RET-024`).
- A request for more than the remaining quantity is refused. Two requests at once cannot spend the same entitlement: `pos` rechecks it under the lock (`PRD-RET-006`).
- Whether a bill's round-off counts in its lines' paid value for this cap is OPEN (GC7-6).
- How the tax in a refund is split, and its credit-note and tax-document treatment, are OPEN for the CA (`POL-10.11`, V-72). The golden cases state refund amounts only.

### 7.2 Exchanges

`PRD-RET-007`, `PRD-RET-008`.

- The returned units are worth their entitlement (7.1). The replacement goods are priced as a new bill with current prices and offers (`PRD-RET-007`).
- Equal value: no difference. Higher: the difference is collected and goes through tender checks (section 6).
- The replacement's amount due is what is compared with the returned value. A replacement bill with a round-off is refused `not-decided`, naming GC7-13, until it is decided whether the round-off counts. **Proposed.**
- Cheaper: the configured cheaper-replacement rule refunds the difference, credits it, or refuses the exchange (`PRD-RET-008`, `POL-06.09`). The rule is OPEN (V-67); until it is set, a cheaper exchange is refused. A rule that refuses gives `cheaper-replacement-refused` (5.10).

### 7.3 Split-tender refunds

`PRD-RET-022`, `POL-07.01`, DEC-007.

- The input is each original tender's allocation, its remaining refundable amount, and the refund. A refund above the total remaining is refused.
- Each tender's share is the refund × its original allocation ÷ the bill's total allocation, rounded down to whole paise, capped at its remaining refundable amount.
- An amount above a tender's cap goes to the other original tenders that still have room, in proportion to their original allocations, rounded down and capped the same way; this repeats until nothing is left above a cap.
- The paise left by rounding go to the tender with the largest original allocation that still has room, then the next largest; ties go to the first tender in the bill's allocation order. **Design choice** of rounding each share down, of "largest" (by original allocation) and of the ties; `PRD-RET-022` names the largest tender without saying more.
- A cash substitution or another tender override is approved by an independent authorised person and is not computed here (`PRD-RET-010`, `POL-07.01`). Unknown and failed refund outcomes are `pos` matters (`POL-07.02`).

## 8. Costing and ticket margin

Server only (2.1). `PRD-PTW-010`, `PRD-PTW-011`, `POL-03.06`–`POL-03.08`.

- A costing profile version (owned by `merchandise` · PT) is an ordered list of steps from BASIC to P RATE: a percentage or flat discount, a percentage or flat addition, a charge spread over the lines of a document by the basis the profile names, a non-recoverable tax addition, and a rounding step. Recoverable tax is kept apart from cost (`POL-03.06`). The profile also names the matching tolerance (`POL-03.06`).
- The function returns P RATE, each step's value, and the profile version. An Unknown or missing input gives Unknown P RATE with the missing inputs listed (`POL-03.08`; 3.4).
- **Design choice:** each step's value is exact; a P RATE that is not whole paise after the last step, with no rounding step to make it so, is Unknown with the rounding step listed as missing (3.4). A charge spread over a document's lines comes in as this line's share: how the profile's basis spreads a charge over the lines is worked out by the caller; the `merchandise` · PT design confirms the shape (stage 2).
- A matching check returns the difference between P RATE and the supplier-provided cost, and whether it lies within the profile's tolerance. It decides nothing (`POL-03.07`). The tolerance comes in as an input: an amount, and whether a difference equal to it lies within it. **Proposed**; the `merchandise` · PT design confirms the shape (stage 2).
- Ticket MARGIN is (MRP − P RATE) ÷ MRP × 100, rounded half up to two decimal places (`PRD-PTW-011`). Unknown P RATE gives Unknown MARGIN.
- A P RATE above the MRP gives a negative MARGIN, rounded to the nearest hundredth like any other. Only an exact half below zero, such as −0.125, is refused `not-decided`, naming GC7-15, because half up does not say which way a negative half goes. **Proposed.** A zero MRP gives no MARGIN and is refused `invalid-amount`. **Design choice.**
- Each brand's profile is OPEN (V-15). Nothing here is a formula for any brand.

## 9. Incentives (outline)

`PRD-HRM-010`, `PRD-ACP-017`, `POL-13.06`.

- The package will compute incentives from approved percentage, per-piece, slab, brand-funded and team-pool rules with attendance eligibility (`PRD-HRM-010`), from bill lines attributed to salespeople (`PRD-POS-002`). A returned sale reverses its share (`PRD-ACP-017`, `POL-13.08`).
- `hr` calls it in stage 6 and keeps one approved outcome per period. Replay is `hr`'s matter.
- Its golden cases are written in stage 6, when KDPS's incentive rules exist (V-52, `POL-13.06`; [phases.md](../../phases.md) stage 1).

## 10. Tax rule records

Owner: `finance` · tax rules (module-map 4.14, tier 2). Shape in stage 1 for the golden cases; real values by stage 2 under policy 10 (`PRD-TAX-005`, `POL-10.02`, `POL-10.05`, `POL-10.06`). In stage 1 the records are kept through the API only; their screens are designed and built before the first live posting, in stage 2 (product owner, 6 Oct 2026; DEC-116).

### 10.1 Records

| Record | What it is | Identity | Rules |
| --- | --- | --- | --- |
| Goods classification | One HSN entry the Organisation uses | HSN code, unique in the Organisation | Effective-dated versions; a style's HSN must name one in force |
| Rate and value rule | For one classification: its rate, or its value slabs, each with a rate | Per classification, versioned | Each slab has a lower bound; each bound says which side its own value falls on. The rule names the value compared with the slabs (GC7-2). Approved versions never overlap |
| Registration applicability | For one tax registration: whether it charges output tax on a counter sale, and the components and their shares of the rate | Per registration, versioned | Shares add up to the whole rate (GC7-8) |
| Price basis | Whether selling prices include tax | Per Organisation, versioned | One value in force (GC7-1) |
| Rounding rule | Unit, mode and, for tax, level (3.3) | Per Organisation and kind, versioned | One version in force per kind |

- Every version is effective-dated, takes effect only when approved, and never starts on a past date ([structure-and-masters.md](../masters/structure-and-masters.md) 2.2; GC2-7, DEC-105). Accounts and the CA approve statutory settings (`POL-10.05`). A version is approved as a posting map is: an authorised Accounts user prepares it, a different authorised Accounts user decides it, and the CA's evidence is attached as a stored file or referenced before it takes effect ([books-and-posting.md](../finance/books-and-posting.md) 6.3, GC4-2; product owner, 6 Oct 2026; DEC-116). Who holds those roles is KDPS's (V-01).
- Missing required configuration blocks the affected statutory action and raises an exception (`POL-10.05`). The policy gate makes selling unavailable until these records are valid (`PRD-SEC-017`).
- Gift-voucher tax on issue and redemption (`POL-10.10`, V-30) and the tax of a customer return's credit note (`POL-10.11`, V-72) are added to these records when the CA answers.
- **As built** (`S1-F09-T04`; migration 0052). **Design choice** throughout; no rate, slab, component, basis, rounding rule or date is chosen.
  - **One record type.** Every tax-rule record is read and decided under `finance.tax_rule` (view, create, edit, approve; no scope fact). Each kind's version has its own action type (`finance.goods_classification.change`, `finance.tax_rate_rule.change`, `finance.registration_tax_applicability.change`, `finance.price_basis.change`, `finance.rounding_rule.change`), independent, with no value (DM-8). Create adds a classification with its first version; edit prepares any other version. A rate rule, an applicability, the price basis and a rounding rule have no record to create: their first version creates it, keyed by its classification, tax registration, the Organisation (one price basis) or its kind.
  - **Versions.** Each version is frozen when prepared and records its origin (code-house-rules 12.14). Preparing refuses a past start, an origin the environment does not accept, a stale version token and an approved version of the record starting the same day; Decide's effect rechecks the start, the overlap and the evidence under the record's lock. A rate rule names a classification with an approved version in force, not retired, on the rule's start, when prepared and again when approved. The record checks are those of `@apparel-os/calculations`; at commit, deferred constraint triggers refuse slabs whose lowest bound is not zero and shares that do not add up to one.
  - **The CA's evidence.** As for the books part's versions (books-and-posting 6.3, as built in `S1-F09-T01`): recorded before the decision by an Accounts user holding create on `finance.ca_approval_evidence`, against a named set of tax-rule versions each still Awaiting approval, under their records' locks; a stored file attached through `files-imports` to each version it covers as the evidence kind `finance.ca-approval`, with no restricted class, or a reference naming what the evidence is, who gave it, its date and where it is kept. Decide's effect refuses the approval, `finance.no-ca-evidence`, while none covers the version. The tax rules part keeps it in its own table, `finance.tax_rule_ca_evidence`, append-only, one row for each version a piece covers, naming exactly one version: the books part's `finance.ca_approval_evidence` names only account and book-setting versions, and one part never writes the other's tables (code-house-rules 3.2), nor does module-map 4.14 list a call between the two parts. Whether the two become one record of `finance` is open (RR-486; product owner).
  - **Read tax rules** (10.2) answers each part as set, with its version, or not set: the price basis, the registration applicability (its registration named by the tax registration's code from `organisation`), each classification asked for with its rate rule, and the three rounding rules. The version a rule carries is the identifier of its version row, which a bill keeps (section 4); the labels of 12.3 (`syn-tax-1`) are names the golden cases give those versions. A retired classification, or one with no approved version in force, is not set, and so is its rate rule.

### 10.2 Read tax rules

- `finance` · tax rules answers, for a business date, a tax registration and a set of classifications: the rate and value rules, the registration applicability, the price basis and the rounding rules in force, each with its version (module-map 4.14, "Read tax rules").
- The counter receives the same answer in its working set (2.3).

### 10.3 Tables

Schema `finance`, beside the books tables of [books-and-posting.md](../finance/books-and-posting.md) 13.1. "+ versions" has the meaning given in books-and-posting section 13. **Design choice** throughout; other columns are left to reviewed migrations.

| Table | Unique | Other constraints |
| --- | --- | --- |
| `goods_classification` + versions | HSN code | retired, never deleted |
| `tax_rate_rule` + versions | classification | in force only when approved; approved versions never overlap |
| `tax_rate_slab` | rule version and lower bound | rate as an exact decimal; bound side stated; the lowest slab starts at zero |
| `registration_tax_applicability` + versions | tax registration | when it charges tax, its component shares add up to one |
| `registration_tax_component` | applicability version and component | share as an exact decimal |
| `price_basis` + versions | — | one version in force |
| `rounding_rule` + versions | kind | unit in paise above zero; mode from the four of 3.3; level for tax only |

## 11. Interface

Operations in words; names, inputs and outputs become exact in code (module-map section 4). All are pure functions (2.1).

| Function | Inputs | Returns | IDs |
| --- | --- | --- | --- |
| Price a bill | Lines (goods, quantity, MRP, start-price source, manual change or discount); Store, groups, business date; price lists, offers, combination rules, tax rules, price basis, rounding rules with versions | The priced bill (5.10), or refusals | `PRD-POS-003`, `PRD-POS-004`, `PRD-POS-023`, `PRD-POS-024`, `PRD-OFR-021` |
| List applicable offers | Goods or a cart, Store, groups, date; offers and combination rules | Eligible offers with dates and combination rules; for a cart, the set checkout would apply and why | `PRD-OFR-003`, `PRD-OFR-021` |
| Check tenders | Priced bill, tender lines, cash received | The resolved allocation with change, or a refusal | `PRD-POS-005`–`PRD-POS-009`, `PRD-MOD-016` |
| Return value | Bill line snapshot, earlier returns, quantity | The refund for the units, or a refusal | `PRD-RET-005`, `PRD-RET-024` |
| Exchange difference | Returned units' value; replacement priced bill; cheaper-replacement rule | None, collect, refund or credit, or a refusal | `PRD-RET-007`, `PRD-RET-008` |
| Split a refund | Original tenders, remaining amounts, refund | An amount per tender, or a refusal | `PRD-RET-022` |
| Cost a line (costing entry) | BASIC and other inputs; costing profile version | P RATE and its steps, or Unknown | `PRD-PTW-010`, `POL-03.06` |
| Ticket margin (costing entry) | MRP, P RATE | MARGIN, or Unknown | `PRD-PTW-011` |
| Round by a rule | An exact value in paise as a decimal string; a rounding rule version | Whole paise. **Design choice**, for the mechanics cases (12.4 CG-20a) | `PRD-MOD-014` |
| Incentives | Stage 6 | Stage 6 | `PRD-HRM-010` |

## 12. Golden cases

### 12.1 Format

- One JSON file per case in `packages/calculations/golden/`, named by its case ID. **Design choice.**
- A case holds: `id`; `title`; `synthetic: true`; `covers`, the PRD and policy IDs it proves; `function`; `input`, with every rule version it uses; and either `expected`, the full result with the versions echoed, or `refusal`, the refusal code and the line it names.
- **Design choice** precisions:
  - `refusal` is the list of refusals the call returns, each with its code and, where there is one, the line, the input and, for `not-decided`, the question (5.10). A priced bill can refuse several lines at once.
  - A row of 12.4 that runs the function more than once ("then", "both times", (a) to (c), the four modes) holds `runs` instead of `input`: an ordered list, each with its own `input` and `expected` or `refusal`.
  - Three pointers keep a case from copying another's bill: `{"$pricedBill": <case ID or bill input>}` stands for that bill priced, `{"$billReference": …}` for its reference (section 6), and `{"$billLine": {"bill": …, "line": <line ID>}}` for one of its lines as a return reads it (7.1). A `$billLine` naming a bill with a round-off is an error in the case file, since whether a round-off counts in a line's paid value is open (GC7-6). A case named by a pointer holds every rule version it uses, and a bill input given in place holds its own, so every rule version a case uses is still in the case or in the one it names.
  - `function` names an operation of section 11; `round` is "Round by a rule".
  - A case whose expected result depends on an open reading carries `pending` with the reason, such as "RR-042 deferred". The runner reports it as skipped with that reason, never as passed.
- Amounts are integer paise as JSON numbers; rates are decimal strings; dates are ISO dates. **Design choice.**
- Expected values are worked out by hand and reviewed, never produced by the code under test. A case changes only with a reason in its commit. **Design choice.**

### 12.2 One set, two runtimes

- **Server:** a Vitest suite in Node loads every case file and runs it through `@apparel-os/calculations` as the server imports it.
- One runner, with no file access and no test framework, runs a case on both: the server gives it both entry points, the counter page only the selling one, so the costing cases are server-only. **Design choice.**
- **Counter:** a Playwright test opens a test page of the counter build in Chromium and runs every case file through the package as bundled in the counter. The page reports each result; the test compares it with `expected` and fails on any difference. Chrome and Edge both run on Chromium (PRD Stack: Counter).
- Both compare whole results exactly, including the versions. The stage 1 exit check passes only when both runs pass (`PRD-ACP-018`, [phases.md](../../phases.md) stage 1). They also run in the checks on every change (`PRD-SEC-016`).
- Playwright, already in the PRD Stack, is added in stage 1 for this test page, ahead of the first real screen; the counter run needs only that page. **Design choice.**

### 12.3 Synthetic rule data

Every value below is synthetic, chosen to be unlike a real one, and never becomes a default. The package's unit and property tests take these labelled values from its own file, `packages/calculations/test/synthetic.ts`, as code-house-rules 11.1 allows a package under `packages/` (RR-224).

| Rule | Synthetic version | Content |
| --- | --- | --- |
| Classification SYN-HSN-1 with its rate and value rule | `syn-tax-1` | Two slabs on the taxable value per unit after discounts: below ₹1,500.00 at 10%; from ₹1,500.00 at 20%. A value of exactly ₹1,500.00 falls in the upper slab |
| Classification SYN-HSN-2 with its rate rule | `syn-tax-1` | 10% at every value |
| Registration SYN-REG-1 applicability | `syn-reg-1` | Charges tax on counter sales; two components, SYN-X and SYN-Y, each half of the rate |
| Price basis | `syn-basis-incl` | Prices include tax. Case CG-14 uses `syn-basis-excl`: prices exclude tax |
| Rounding rules | `syn-round-1` | Discount and tax: each line, 1 paise, half up. Bill: no round-off (unit 1 paise). Case CG-20 also uses `syn-round-bill-100`: 100 paise, half up |
| Offers | as named in each case | Approved, in force at Store SYN-S1 in group SYN-G1 on 10 Oct 2026; settings stated in each case |
| Cheaper-replacement rule | `syn-cheaper-refund` | Refund the difference. Used only in CG-19c |

Brands SYN-BR-A (SKUs with SYN-HSN-2) and SYN-BR-B (SYN-HSN-1). The amounts are chosen so the main cases divide exactly; only CG-20 depends on the synthetic rounding modes.

### 12.4 The cases

All amounts in rupees; 1 rupee is 100 paise. "Tax" lists the two components.

**Pricing**

| # | Case | Input | Expected | IDs |
| --- | --- | --- | --- | --- |
| CG-01 | One line, no offer | SYN-HSN-2, MRP 1,100.00, qty 1 | Taxable 1,000.00; tax 50.00 + 50.00; due 1,100.00 | `PRD-POS-004`, `PRD-TAX-005` |
| CG-02 | Two slabs | L1 SYN-HSN-1 MRP 1,100.00; L2 SYN-HSN-1 MRP 2,400.00 | L1 at 10%: taxable 1,000.00, tax 50.00 + 50.00. L2 at 20%: taxable 2,000.00, tax 200.00 + 200.00. Due 3,500.00 | `POL-10.02` |
| CG-03 | Percentage offer | Offer P10: 10% off SYN-BR-A. SYN-HSN-2 MRP 2,200.00, qty 2 | Discount 440.00; paid 3,960.00; taxable 3,600.00; tax 180.00 + 180.00 | `PRD-OFR-001` |
| CG-04 | Flat-value offer | Offer F200: 200.00 off each unit. SYN-HSN-2 MRP 1,300.00 | Paid 1,100.00; taxable 1,000.00; tax 50.00 + 50.00 | `PRD-OFR-001` |
| CG-05 | Basket offer spread, paise left | Offer K: 240.00 off when SYN-BR-A lines reach 3,000.00. L1 MRP 1,400.00; L2 MRP 1,700.00 | Shares 108.38 and 131.61; 0.01 left goes to L2: 131.62. Paid L1 1,291.62, L2 1,568.38. Tax L1 58.71 + 58.71; L2 71.29 + 71.29. Due 2,860.00 | `PRD-POS-023` |
| CG-06 | Buy 2 get 1, spread | Offer B21: buy 2 get 1 free on SYN-BR-A, lowest-valued unit is the reward. L1 MRP 1,200.00; L2 1,500.00; L3 1,800.00 | Discount 1,200.00. Shares 320.00, 400.00, 480.00. Paid 880.00, 1,100.00, 1,320.00. Tax 40.00 + 40.00, 50.00 + 50.00, 60.00 + 60.00. Due 3,300.00 | `PRD-POS-023` |
| CG-07a | Two offers, no rule: best for the customer | MRP 2,200.00 (SYN-HSN-2). P10 (220.00 off), approved 1 Sep 2026; F330 (330.00 off), approved 5 Sep 2026 | F330 applies. Paid 1,870.00; taxable 1,700.00; tax 85.00 + 85.00. Both offers recorded as considered | `PRD-OFR-021` |
| CG-07b | Tie | As CG-07a with F220 (220.00 off), approved 5 Sep 2026, in place of F330 | P10 applies (approved first). Paid 1,980.00; tax 90.00 + 90.00 | `PRD-OFR-021` |
| CG-08 | Combination permitted | Rule C1: P10 then F110, each on the value left. MRP 2,200.00 | Set {P10, F110} beats either alone. 2,200.00 − 220.00 − 110.00: paid 1,870.00; tax 85.00 + 85.00; rule version recorded | `POL-19.04`, `PRD-OFR-021` |
| CG-09 | Discount moves the slab | SYN-HSN-1, MRP 1,800.00; offer F260 (260.00 off) | Paid 1,540.00 at 10%: taxable 1,400.00, tax 70.00 + 70.00. Marked: 20% before the discount (taxable 1,500.00), 10% after | `PRD-OFR-005` |
| CG-10 | No slab fits | SYN-HSN-1, MRP 1,700.00 | Refusal `slab-undetermined` (at 10% the taxable value is above the bound; at 20% below it) | `POL-10.05` |
| CG-11 | Price above MRP | Manual price 1,200.00 for MRP 1,100.00; then a price list at 1,200.00 for the same goods | Refusal `price-above-mrp`, both times | `PRD-POS-024` |
| CG-12 | Markdown price list | SYN-HSN-2, MRP 2,200.00; price list E1 at 1,650.00; P10 set not to apply to markdown prices | P10 not applied. Paid 1,650.00; taxable 1,500.00; tax 75.00 + 75.00; E1 version recorded | `PRD-OFR-004` |
| CG-13 | Unknown inputs | (a) MRP Unknown; (b) HSN Unknown; (c) a style whose HSN, SYN-HSN-3, has no rule in force | Refusals `price-unknown`, `classification-unknown`, `no-tax-rule`. Never a zero | `PRD-MOD-015` |
| CG-14 | Prices exclude tax | `syn-basis-excl`; SYN-HSN-2 price 1,000.00 | Taxable 1,000.00; tax 50.00 + 50.00; due 1,100.00 | `PRD-TAX-005` |

**Tenders** (amount due 3,960.00, from CG-03)

| # | Case | Input | Expected | IDs |
| --- | --- | --- | --- | --- |
| CG-15a | Exact cash | Card 1,960.00, cash 2,000.00, cash received omitted | Cash received 2,000.00; change 0.00 | `PRD-POS-007`, `PRD-MOD-016` |
| CG-15b | Change | As 15a, cash received 2,500.00 | Change 500.00 | `PRD-POS-008` |
| CG-15c | Entered zero | As 15a, cash received 0.00 | Refusal `insufficient-cash` | `PRD-POS-007` |
| CG-15d | Does not add up | Card 1,960.00, cash 1,990.00 | Refusal `allocation-mismatch` | `PRD-POS-006` |
| CG-15e | Cash received with no cash line | Card 3,960.00, cash received 100.00 | Refusal `cash-received-without-cash` | `PRD-POS-008` |
| CG-15f | Stale allocation | 15a's allocation, after CG-03's quantity becomes 1 | Refusal `stale-allocation` | `PRD-POS-009` |
| CG-15g | Invalid amount | Card 3,960.00, cash 0.00 | Refusal `invalid-amount` | `PRD-POS-008` |

**Returns, exchanges and refunds**

| # | Case | Input | Expected | IDs |
| --- | --- | --- | --- | --- |
| CG-16 | Part of a line | Line sold qty 3, paid 1,000.00. Return 1, then 1, then 1 | 333.33, 333.33, then 333.34 | `PRD-RET-024` |
| CG-16b | Too many | As CG-16 after two returns, one of them pending; return 2 | Refusal `exceeds-entitlement` | `PRD-RET-005`, `PRD-RET-006` |
| CG-17 | Return the reward unit | CG-06's bill; return L1, the reward unit | Refund 880.00, its recorded paid value. The offer is not worked out again | `PRD-RET-024`, `PRD-ACP-008` |
| CG-18a | Split refund, paise left | Original: cash 600.00, card 300.00, UPI 100.00; nothing refunded yet. Refund 100.01 | Cash 60.01, card 30.00, UPI 10.00 | `PRD-RET-022` |
| CG-18b | A cap binds | As 18a, but cash has 300.00 left after an approved override. Refund 600.00 | Cash 300.00 (capped); 60.00 above the cap goes to card and UPI 3 : 1: card 225.00, UPI 75.00 | `PRD-RET-022` |
| CG-18c | The DEC-007 example | Card 1,500.00, cash 500.00. Refund 800.00 | Card 600.00, cash 200.00 | `PRD-RET-022` |
| CG-18d | Above what is left | As 18a; refund 1,000.01 | Refusal `exceeds-refundable` | `PRD-RET-022` |
| CG-19a | Exchange, higher | Returned units worth 1,000.00; replacement paid 1,500.00 | Collect 500.00 | `PRD-RET-007` |
| CG-19b | Exchange, cheaper, no rule | Returned 1,000.00; replacement 800.00; no rule in force | Refusal `cheaper-replacement-rule-missing` | `PRD-RET-008` |
| CG-19c | Exchange, cheaper, synthetic rule | As 19b with `syn-cheaper-refund` | Refund 200.00 | `PRD-RET-008` |

**Rounding mechanics** (synthetic rules only)

| # | Case | Input | Expected | IDs |
| --- | --- | --- | --- | --- |
| CG-20a | Modes | The exact value 2.5 paise under each mode, unit 1 paise | Half up 3; half to even 2; up 3; down 2 | `PRD-MOD-014`, `PRD-MOD-015` |
| CG-20b | Bill round-off | CG-05's bill under `syn-round-bill-100` | Total 2,860.00; round-off 0.00. Then L1 MRP 1,400.50 instead: shares 108.40 and 131.60; paid 1,292.10 and 1,568.40; tax 58.73 + 58.73 and 71.29 + 71.29 (taxable 1,174.64 and 1,425.82); total 2,860.50, round-off 0.50 up, due 2,861.00 | `PRD-MOD-014` |
| CG-20c | Missing rule | CG-01 with no bill rounding rule in force | Refusal `rounding-rule-missing` | `PRD-SEC-017` |

**Costing and margin** (server only)

| # | Case | Input | Expected | IDs |
| --- | --- | --- | --- | --- |
| CG-21 | Synthetic costing profile | Profile `syn-cost-1`: 10% discount, then 5% addition, no rounding needed. BASIC 1,000.00 | 900.00, then P RATE 945.00 | `POL-03.06`, `PRD-PTW-010` |
| CG-21b | Missing input | BASIC Unknown | P RATE Unknown; BASIC listed as missing | `POL-03.08` |
| CG-22 | Ticket margin | MRP 1,999.00, P RATE 945.00 | 52.73 (52.7263… rounded half up) | `PRD-PTW-011` |

- CG-20b's second bill does not divide evenly for tax, so it also exercises the synthetic tax rounding. It is the only pricing case that does.
- Incentive cases come in stage 6 (section 9).

### 12.5 Other tests

- **Property tests** on random synthetic bills: spread shares add up to the discount; tender lines add up to the amount due; refunds of all units of a line add up to its paid value; split refunds add up to the refund and respect each cap; no line goes below zero; no fraction reaches a result without a named rounding step (`PRD-MOD-014`, `PRD-ACP-010`). **Design choice.**
- **Order:** the same lines in another order give the same amounts, except where a rule names bill order for a tie. **Design choice.**
- **Snapshot:** a stored bill priced again with its recorded versions gives the same result (`PRD-POS-014`, `PRD-OFF-009`).
- `PRD-ACP-010`'s repeated checkout, printer failure and concurrency belong to the `pos` tests on real PostgreSQL and the browser journeys (`PRD-ACP-018`).

## 13. Open questions

Nothing below has a default. Questions already open elsewhere are pointed to, not repeated: tax rates, slabs and registrations (V-18); rounding and invoice tolerances (V-11); the rounding of stock cost (V-64, SL-2); each brand's costing profile (V-15); offer combinations, their order and cost shares (V-43); the cheaper-replacement rule (V-67); gift-voucher tax (V-30); return credit notes (V-72); the posting accounts for round-off and tax (V-10); incentive rules (V-52); the offline working-set validity time (V-66).

| # | Question | Kind | Who decides | Blocks | Impact |
| --- | --- | --- | --- | --- | --- |
| GC7-1 | Do selling prices, MRP and price lists, include tax (5.8, 10.1)? | Business | CA | 4 | How taxable value is worked out from a price |
| GC7-2 | Which value is compared with a value slab: per unit or per line, before or after discounts, with or without tax? When a tax-inclusive price fits no slab, or two, which applies (5.8)? | Business | CA | 4 | The rate of every line near a slab bound |
| GC7-3 | Tax rounding: per line or per bill; each component or the total; the mode; and whether the tax or the taxable value is rounded (the **Proposed** of 5.8) | Business | Accounts, CA | 4 | Every tax amount by a paise |
| GC7-4 | Is the amount due rounded, to what unit and how (5.9)? | Business | Accounts, CA | 4 | The amount due and the round-off posting |
| GC7-5 | How a percentage discount on a line is rounded (5.5, 5.7) | Business | Accounts | 4 | Offer and manual discount amounts |
| GC7-6 | Does a bill's round-off count in its lines' paid value for the refund cap (7.1)? | Business | Accounts, CA | 4 | The refund of a whole returned bill |
| GC7-7 | May a manual discount apply to a line that already has an offer, and in which order (5.7)? | Business | KDPS Owner, with the Brand manager | 4 | Whether the counter allows it |
| GC7-8 | For each tax registration: does a counter sale carry tax, and which components with which shares (10.1)? | Business | CA | 4 | Tax components on every bill |
| GC7-9 | For each offer: does it apply to marked-down prices, and for buy-X-get-Y, are the reward units the lowest- or highest-valued (5.3)? Set at approval; this asks KDPS to say it for each offer. Also confirm the **Proposed** meaning of each offer kind (5.5) and how combined offers apply to each other's values (5.4) | Business | Brand manager; KDPS Owner (approver) | 4 | Which offers apply, to which units, and for how much |
| GC7-10 | Spreading a group discount by price (DEC-109) changes each line's taxable value and maybe its slab. Is that the correct tax treatment (5.6)? | Business | CA (confirms) | 4 | Tax on offer bills |
| GC7-11 | Which lines earned a group discount (`PRD-POS-023`): every line the offer covers, as **Proposed** in 5.6, or for buy-X-get-Y only the units in complete sets? | Business | Product owner | 4 | Each line's taxable value on offer bills |
| GC7-12 | When tax is rounded on the whole bill (GC7-3), how are each line's tax components and taxable value worked out so that the lines add up to the bill (3.3, 5.8)? Until it is decided, a bill-level tax rounding rule is refused | Business | CA and Accounts (statutory presentation, `POL-10.05`); the product owner for the design | 4 | Tax on every line under bill-level rounding |
| GC7-13 | In an exchange, does the replacement bill's round-off count in what is compared with the returned units' value (7.2)? | Business | Accounts, CA | 4 | What is collected or refunded on a rounded exchange |
| GC7-14 | A free buy-X-get-Y unit can be worth a fraction of a paise when its line's value does not divide by its quantity. How is that discount rounded (5.5)? | Business | Accounts | 4 | The amount of a buy-X-get-Y discount |
| GC7-15 | `PRD-PTW-011` rounds MARGIN half up. For a negative MARGIN, where P RATE is above MRP, does a half go toward zero or away from it (section 8)? | Business | Product owner | 2 | MARGIN on loss-making tickets |
| GC7-16 | The paise a spread leaves go to the line with the largest value (5.6). In the rare case that line has less value left than those paise, where do they go (5.5, 5.6)? | Business | Product owner | 4 | Bills whose group discount almost equals their value |
| GC7-17 | When two tied best sets both hold the offer approved first, which wins? Proposed: the set whose ordered list is the start of the other's (5.4) | Business | Product owner | 4 | Bills where two sets of offers give the same discount |
