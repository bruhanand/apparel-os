# Apparel OS retail discount pattern reference

Research date: 5 October 2026  
Status: Reference for future discount-module design; no product decisions approved

## Purpose and scope

A practical discount engine can support many retail offers through a finite catalogue of parameterized rules. This reference identifies useful families, distinguishes established product behavior from proposed Apparel OS design, and records the questions that need owner decisions later. It does not claim to cover every market promotion.

Discount decisions are deferred until the discount module. **RR-042 remains open:** allocating a group discount across all eligible covered units, including leftovers, versus only completed-set units is undecided. This research does not expand the approved scope, close that record, waive the divergent S1-F11 calculation case, or remove the live S4-F02 gate. Existing Stage 1 golden-case requirements and separate taxable-value confirmation remain intact.

Examples use rupees to two decimal places and exclude tax and shipping unless stated. They illustrate arithmetic, not approved prices or customer terms.

## What established retail systems demonstrate

- **Selection and stacking are explicit policies.** Dynamics 365 distinguishes exclusive, best-price and compounded offers, with configurable priorities. Its alternative priority models can produce different outcomes. Shopify also controls permitted combinations and overlapping Buy X Get Y offers. “Best price” therefore needs a defined set of valid combinations. [Microsoft retail discounts](https://learn.microsoft.com/en-us/dynamics365/commerce/retail-discounts-overview), [Shopify combinations](https://help.shopify.com/en/manual/discounts/discount-combinations)
- **Qualification can differ from benefit.** Microsoft documents items that count toward a threshold without receiving a discount. Oracle Retail Digital Commerce separates qualifying criteria and rewards, supports exclusion lists, and exposes a choice of price basis for reward sorting. [Microsoft discount families](https://learn.microsoft.com/en-us/dynamics365/commerce/price-adjustments-discounts), [Oracle promotion management](https://docs.oracle.com/en/industries/retail/retail-digital-commerce/latest/uoccs/manage-promotions1.htm)
- **Allocation changes return exposure.** Microsoft offers distribution of least-expensive-item discounts across applicable lines and configurable rounding. That establishes a design precedent; it does not establish that unmatched leftover units belong in the allocation pool. [Microsoft pricing settings](https://learn.microsoft.com/en-us/dynamics365/commerce/price-settings)
- **Older documentation supplies useful patterns, with limits.** Oracle's legacy retail guide describes pooled quantities, multi-buy, set-price and buy/reward groups. Xstore version 21 documents manual limits, permissions and return proration. These are version-specific precedents, not claims about current product parity. [Oracle legacy promotion types](https://docs.oracle.com/cd/E79792_01/resa/pdf/141/html/merch_impg/RPM.htm), [Xstore 21 configuration](https://docs.oracle.com/en/industries/retail/retail-xstore/21.0/rbaug/configuring-discounts.htm)

The remainder is a proposed design reference unless a vendor behavior is explicitly attributed.

## A finite offer family matrix

These are candidate templates and configuration dimensions, not sixteen separate engines or a committed feature list. Coupon, audience and payment labels often wrap existing benefit arithmetic.

| Family | Illustrative parameters | Acceptance question |
| --- | --- | --- |
| Item percentage | Eligible variants; 15% off; optional maximum benefit | Which price is the percentage based on? |
| Item amount | ₹100 per unit or ₹100 per line | Does quantity two receive ₹200 or ₹100? |
| Fixed unit price | Selected item at ₹799 | What if its existing price is lower? |
| Markdown or clearance | Temporary price layer; dates; eligibility for further offers | Can a later promotion stack on this price? |
| Basket percentage or amount | Eligible spend ≥₹2,000; ₹200 off | Which lines qualify and receive the benefit? |
| Tiered basket | ≥₹2,000 gives ₹200; ≥₹4,000 gives ₹500 | Choose one tier or accumulate benefits? |
| Quantity or bulk | Three or more eligible units; 10% off | Same SKU or pooled category; all units or incremental slabs? |
| Buy N Get M | N qualifiers; M rewards; free, percentage, amount or fixed-price benefit | Are qualifier and reward units distinct? |
| Cheapest or second item | Buy two; cheaper item 50% off | Cheapest by list price or current discounted price? |
| Any N for a total | Any three eligible tees for ₹999 | How are repeated sets formed? |
| Outfit or mixed bundle | One shirt AND one trouser for ₹1,499 | Which alternatives satisfy each group? |
| Spend or buy unlocks gift | Spend ₹3,000; eligible accessory free | Must the gift be selected, available and added? |
| Coupon activation | Code triggers a supported template; dates and usage limits | What happens at the final available redemption? |
| Loyalty, employee or manual | Audience eligibility or authorized adjustment | What reason, permission and approval are required? |
| Tender-funded instant offer | Eligible payment share; benefit cap; identified funder | How are split payment and failed verification handled? |
| Shipping benefit | Free or reduced delivery by spend, mode or zone | Is shipping in the approved channel scope? |

A coupon can activate a percentage or bundle rule without introducing another calculation family. Microsoft models coupons as validation linked to discounts. [Microsoft coupons](https://learn.microsoft.com/en-us/dynamics365/commerce/coupons)

Points used as payment, deferred cashback and permanent price changes should be distinguished from immediate merchandise discounts in the eventual model.

Microsoft also documents tender-based discounts, including partial-payment calculation, with product-specific tender restrictions. This is not evidence that the same behavior works for every card, UPI payment or wallet. [Microsoft tender discounts](https://learn.microsoft.com/en-us/dynamics365/commerce/tender-based-discounts)

## Parameterize the rules precisely

**Buy N Get M.** Store separate qualifying and reward selectors, N, M, reward formula, reward-price basis, repetition limit, total benefit cap, and rules for reusing units. For a conventional same-pool offer with distinct qualifying and reward units, buy two get one consumes three units per application. Five eligible units create one complete triple; six create two, unless a cap intervenes. This convention must be named explicitly: “N includes M” would describe a different rule.

For a cross-category example, two qualifying shirts unlock one accessory at 50% off, with at most two applications per bill. Four shirts and one eligible accessory produce one award; four shirts and two accessories can produce two. Overlapping qualifier/reward pools require explicit unit-assignment rules rather than relying on this simple count.

**Tiers.** A ₹4,500 eligible basket could earn ₹500 under a highest-tier-only rule; adding ₹200 from the lower tier would give ₹700 and is a different policy. Quantity offers also need to distinguish “all eligible units receive the achieved rate” from “only units in each incremental slab receive that slab's rate.”

**Bundles.** “One shirt AND one trouser” requires both groups. OR choices can exist within each group. Define which units each application consumes, whether a unit may join another offer, incomplete-set treatment, and a rule preventing a claimed discount from raising the payable price.

Every template needs currency, effective window and timezone, item/variant/category selectors, exclusions, store/channel/customer scope, activation method, compatibility, caps and a version. Thresholds must name their calculation basis, including whether prior discounts reduce qualifying spend. No tax-base rule is selected here.

## Keep four decisions separate

1. **Qualification:** Does the cart satisfy the offer, and which units or spend count? A qualifying item need not receive a benefit.
2. **Selection:** Which valid applications can coexist, subject to exclusivity, priorities, reuse and caps? Select at cart level where offers overlap.
3. **Allocation:** How is the selected total discount distributed across recorded sale units? Preserve exact totals and deterministic minor-unit rounding.
4. **Refund policy:** Does a later return refund the original allocated net amount, or trigger recalculation of retained goods and an explicitly defined recovery of benefit?

Selection example: A and B each cost ₹100. An exclusive A+B bundle costs ₹150; a competing offer gives ₹40 off A. Choosing A's largest individual discount first leaves a ₹160 cart. The bundle produces ₹150. Combining the two is invalid under the stated exclusivity rule.

A best-valid-cart policy would minimize payable value over the permitted combinations. A priority-first policy may intentionally restrict that search. Define equal-total tie-breaking, supported overlap, performance limits and failure behavior. A heuristic should not be described as guaranteed best unless that guarantee is established for the supported cases. No numerical complexity cap is approved by this reference.

## RR-042 and partial returns

Retain the five-item illustration: five units at ₹100 each under conventional buy-two-get-one qualification yield one ₹100 award and ₹400 payable. Two allocation candidates are:

| Candidate | Recorded unit net amounts | Total |
| --- | --- | --- |
| Completed-set units only | ₹66.66, ₹66.67, ₹66.67, ₹100, ₹100 | ₹400.00 |
| All five covered units | ₹80, ₹80, ₹80, ₹80, ₹80 | ₹400.00 |

The completed-set example allocates discounts of ₹33.34, ₹33.33 and ₹33.33. It follows the current GC-7 residual rule: highest value first, with the first unit resolving this equal-value tie. This rounding illustration does not approve the allocation membership. Both candidates conserve the ₹100 benefit, but returning a leftover unit could refund ₹100 under the first candidate or ₹80 under the second if original-net refunds are chosen. **Neither allocation nor either refund policy is approved.**

Persist original unit identities, prices, offer versions, application membership, allocated discount and rounding residuals. Under an original-net refund policy, repeated partial returns should consume those stored refundable amounts; they should not repeatedly divide or round the original award. Returning all five units in the example must reconcile to ₹400, subject to any separately approved fees or adjustments.

Repricing retained goods is an alternative policy with different customer consequences. Exchanges, unverified returns, gift recovery, coupon restoration and reward reversals need separate definitions. Allocation arithmetic does not establish legal, tax or accounting treatment; those checks remain outside this research.

## Operational and acceptance checklist

Shopify POS documents that automatic and code discounts do not work offline while manual discounts do. This is a useful warning against an unqualified promise of offline parity, rather than an Apparel OS requirement. [Shopify offline features](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline/offline-features)

Proposed safeguards are versioned sale-time rule snapshots; reproducible calculation; recorded eligibility and rejection reasons; and audited manual overrides. Shared finite coupon or campaign budgets need online reservation/commit/release, preallocated quotas, or another explicitly accepted risk model. Disconnected caches alone cannot guarantee a global limit. Retries and reconciliation need stable transaction identities, and reconnection should not silently rewrite a paid sale.

For every supported family, turn these questions into approved examples before implementation:

- What happens immediately below, at and above each quantity, spend or tier boundary?
- Are variants and categories pooled correctly; are exclusions and missing groups respected?
- Do unequal prices, ties, leftovers, repeated sets and overlapping qualifiers behave deterministically?
- Do allowed stacks, blocked stacks and price-basis changes produce the expected total?
- Do unit allocations sum exactly to the selected benefit, with nonnegative net prices?
- Do partial returns, repeated returns, exchanges, edits and voids reconcile without duplicate benefit or refund?
- What happens at expiry, timezone boundaries, stale customer facts and offline operation?
- Can two tills race for the last coupon, and can timeout/retry or abandonment duplicate a redemption?

These extend future acceptance design; they do not replace or waive existing golden scenarios.

## Five owner decision groups for the discount module

1. **Selection and stacking:** Best valid cart or priority-first; exclusivity scope; allowed combinations; sequential or original-price compounding.
2. **Set membership and allocation:** N/M meaning, distinct unit use, repetition, leftovers and RR-042's completed-set versus all-covered allocation.
3. **Returns:** Original-net refund or retained-cart repricing; exchanges; gift, coupon and loyalty reversal.
4. **Offline and limits:** Supported offline families, fact freshness, finite-budget validation, quota policy and reconciliation risk.
5. **Calculation bases:** Markdown interaction, qualifying spend, cheapest-item basis, rounding, payment/funder treatment and separately reviewed taxable values.

These decisions are recorded for the future module discussion. No answer is requested now, and no example in this reference is an implementation approval.
