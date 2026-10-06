// List applicable offers (shared-calculations 5.3, 5.4 and 11; PRD-OFR-003, PRD-OFR-021). Running Offers lists the
// eligible offers for goods, Store and date with their dates and combination rules, and for a cart shows the set
// checkout would apply and why. It calls the same offer step as checkout, so the two cannot disagree.

import type { Paise } from '@apparel-os/domain';
import { assertIsoDate, type IsoDate, isInForce } from '../dates.js';
import { amountOut } from '../numbers/amounts.js';
import type { RoundingRule } from '../numbers/rounding.js';
import { type Refusal, type Result, ok, refused } from '../result.js';
import { type OfferLine, chooseOffers } from './offers.js';
import { resolveStartPrice } from './start-price.js';
import type { BillLineInput, CombinationRule, Offer, PriceList } from './types.js';

export interface ListOffersInput {
  readonly store: string;
  readonly storeGroups: readonly string[];
  readonly businessDate: IsoDate;
  /** The goods or the cart the person enters; goods alone are a cart of their units. */
  readonly lines: readonly BillLineInput[];
  readonly priceLists: readonly PriceList[];
  readonly offers: readonly Offer[];
  readonly combinationRules: readonly CombinationRule[];
  readonly rounding: { readonly discount?: RoundingRule };
}

export interface ApplicableOffer {
  readonly offer: string;
  readonly version: string;
  readonly effectiveFrom: IsoDate;
  readonly effectiveTo: IsoDate | null;
  /** The combination rules in force that name it. */
  readonly combinationRules: readonly { readonly rule: string; readonly version: string }[];
}

export interface OfferListing {
  readonly eligible: readonly ApplicableOffer[];
  /** Every permitted set of overlapping offers with its total discount, best first: why the chosen set applies. */
  readonly candidates: readonly { readonly offers: readonly string[]; readonly totalDiscount: Paise }[];
  /** What checkout would apply: the chosen set and the offers that overlap nothing. */
  readonly chosen: readonly string[];
}

export function listApplicableOffers(input: ListOffersInput): Result<OfferListing> {
  assertIsoDate(input.businessDate, 'The business date');
  const lines: OfferLine[] = [];
  const refusals: Refusal[] = [];
  input.lines.forEach((line) => {
    const price = resolveStartPrice(line, input.priceLists);
    if (!price.ok) {
      refusals.push(...price.refusals);
      return;
    }
    lines.push({
      index: lines.length,
      id: line.id,
      item: line.item,
      brand: line.brand,
      quantity: price.value.quantity,
      startValue: price.value.startPrice * price.value.quantity,
      markdown: price.value.markdown,
    });
  });
  if (refusals.length > 0) return refused(...refusals);

  const choice = chooseOffers(lines, input, input.offers, input.combinationRules, input.rounding.discount);
  if (!choice.ok) return refused(...choice.refusals);
  const rulesInForce = input.combinationRules.filter((rule) => isInForce(rule, input.businessDate));
  return ok({
    eligible: choice.value.considered.map((offer) => ({
      offer: offer.id,
      version: offer.version,
      effectiveFrom: offer.effectiveFrom,
      effectiveTo: offer.effectiveTo ?? null,
      combinationRules: rulesInForce
        .filter((rule) => rule.offers.includes(offer.id))
        .map((rule) => ({ rule: rule.id, version: rule.version })),
    })),
    candidates: choice.value.candidates.map((c) => ({ offers: c.offers, totalDiscount: amountOut(c.total) })),
    chosen: choice.value.chosen.map((o) => o.id),
  });
}
