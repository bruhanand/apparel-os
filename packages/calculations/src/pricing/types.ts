// Input and result shapes for pricing a bill (shared-calculations section 5 and 11). Every rule comes in with its
// version and goes out again in the result, so a bill keeps its snapshot (section 4; PRD-POS-014, PRD-MOD-010).

import type { MaybeKnown, Paise } from '@apparel-os/domain';
import type { EffectiveDates, IsoDate } from '../dates.js';
import type { DecimalString } from '../numbers/decimal.js';
import type { RoundingRulesInForce, TaxRulesInForce } from '../tax-rules/records.js';

/** Where a line's start price comes from (5.2; PRD-POS-003, PRD-OFR-004). The caller names it. */
export type StartPriceSource =
  | { readonly source: 'mrp' }
  | { readonly source: 'price-list'; readonly priceList: string }
  | { readonly source: 'manual'; readonly pricePerUnit: number };

/** A manual discount by amount or rate (5.7). Authority and reason are checked by `pos`, never here (PRD-POS-003). */
export type ManualDiscount =
  { readonly kind: 'amount'; readonly amount: number } | { readonly kind: 'rate'; readonly rate: DecimalString };

export interface BillLineInput {
  /** The caller's identity for the line; refusals and results name it. */
  readonly id: string;
  /** The goods sold (SKU). */
  readonly item: string;
  readonly brand: string;
  /** The HSN of the line's style (structure-and-masters 4.1); Unknown is refused (5.8, POL-10.05). */
  readonly classification: MaybeKnown<string>;
  /** Whole units of the SKU's stock unit (3.1). */
  readonly quantity: number;
  /** The MRP per unit of the goods sold (2.3); Unknown is refused (5.2, PRD-MER-015). */
  readonly mrp: MaybeKnown<number>;
  readonly startPrice: StartPriceSource;
  readonly manualDiscount?: ManualDiscount;
}

/** A price list version in force for the Store (5.2). Whether it is a markdown list matters to offers (5.3). */
export interface PriceList {
  readonly id: string;
  readonly version: string;
  readonly markdown: boolean;
  readonly prices: readonly { readonly item: string; readonly pricePerUnit: number }[];
}

/**
 * The settings an offer version states at approval (5.3). None has a default: `offers` does not approve a version
 * that lacks one (PRD-OFR-002). Their meaning in amounts is the Proposed reading of 5.5 (GC7-9).
 */
export type OfferTerms =
  | { readonly kind: 'percentage'; readonly rate: DecimalString }
  | { readonly kind: 'flat'; readonly amountPerUnit: number }
  | {
      readonly kind: 'basket';
      readonly threshold: number;
      readonly discount:
        { readonly kind: 'amount'; readonly amount: number } | { readonly kind: 'rate'; readonly rate: DecimalString };
    }
  | {
      readonly kind: 'buy-x-get-y';
      readonly buy: number;
      readonly get: number;
      readonly reward: { readonly kind: 'free' } | { readonly kind: 'rate'; readonly rate: DecimalString };
      readonly rewardUnits: 'lowest-value-first' | 'highest-value-first';
    };

/**
 * An approved offer version (PRD-OFR-001, PRD-OFR-002). The caller passes only approved versions; the calculation
 * filters by Store, group, date and goods (5.3). An empty list of goods or places covers nothing: nothing is assumed.
 */
export interface Offer extends EffectiveDates {
  readonly id: string;
  readonly version: string;
  /** When the version was approved, as a UTC timestamp `YYYY-MM-DDTHH:MM:SSZ`; it breaks ties (5.4). */
  readonly approvedAt: string;
  readonly goods: { readonly brands: readonly string[]; readonly items: readonly string[] };
  readonly places: { readonly stores: readonly string[]; readonly storeGroups: readonly string[] };
  /** Whether it applies to lines whose start price came from a markdown price list (5.3). */
  readonly appliesToMarkdownPrices: boolean;
  readonly terms: OfferTerms;
}

/**
 * A combination rule version (5.4; POL-19.01, POL-19.04, DEC-108): the offers that may combine, the order they apply
 * in, and how each applies to the value before it. The two ways are the Proposed reading of 5.4 (GC7-9).
 */
export interface CombinationRule extends EffectiveDates {
  readonly id: string;
  readonly version: string;
  /** Offer identities, in the order they apply. */
  readonly offers: readonly string[];
  readonly application: 'on-value-left' | 'on-start-value';
}

export interface PriceBillInput {
  readonly store: string;
  readonly storeGroups: readonly string[];
  readonly businessDate: IsoDate;
  readonly lines: readonly BillLineInput[];
  readonly priceLists: readonly PriceList[];
  readonly offers: readonly Offer[];
  readonly combinationRules: readonly CombinationRule[];
  readonly tax: TaxRulesInForce;
  readonly rounding: RoundingRulesInForce;
}

export interface OfferAmount {
  readonly offer: string;
  readonly amount: Paise;
}

export interface TaxComponentAmount {
  readonly component: string;
  /** The component's rate, as a percentage decimal string. */
  readonly rate: DecimalString;
  readonly amount: Paise;
}

export interface LineTax {
  readonly classification: string;
  readonly classificationVersion: string;
  /** Null when the registration charges no tax on a counter sale. */
  readonly rateRuleVersion: string | null;
  readonly rate: DecimalString | null;
  readonly components: readonly TaxComponentAmount[];
}

/** The mark of PRD-OFR-005: a discount moved the line into a different slab (5.8). */
export interface SlabChange {
  readonly rateBeforeDiscounts: MaybeKnown<DecimalString>;
  readonly taxableValueBeforeDiscounts: MaybeKnown<Paise>;
  readonly rateAfterDiscounts: DecimalString;
}

/** One priced line (5.10). Cost never appears here (PRD-MER-009, PRD-OFF-004). */
export interface PricedLine {
  readonly id: string;
  readonly item: string;
  readonly quantity: number;
  readonly mrp: Paise;
  readonly startPrice: Paise;
  readonly startPriceSource: 'mrp' | 'price-list' | 'manual';
  readonly priceListVersion: string | null;
  readonly startValue: Paise;
  readonly offerDiscounts: readonly OfferAmount[];
  readonly spreadShares: readonly OfferAmount[];
  readonly manualDiscount: Paise | null;
  /** The line's value after every discount, on the price basis in force. */
  readonly value: Paise;
  readonly taxableValue: Paise;
  readonly tax: LineTax;
  readonly slabChange: SlabChange | null;
  /** What the customer pays for the line, tax included. */
  readonly amountPaid: Paise;
}

export interface OfferRef {
  readonly offer: string;
  readonly version: string;
}

export interface PricedBill {
  readonly store: string;
  readonly businessDate: IsoDate;
  readonly lines: readonly PricedLine[];
  readonly totals: {
    readonly startValue: Paise;
    readonly offerDiscount: Paise;
    readonly manualDiscount: Paise;
    readonly taxableValue: Paise;
    readonly tax: Paise;
    readonly billTotal: Paise;
  };
  readonly roundOffUp: Paise;
  readonly roundOffDown: Paise;
  readonly amountDue: Paise;
  readonly offers: {
    readonly considered: readonly OfferRef[];
    readonly applied: readonly OfferRef[];
    readonly combinationRules: readonly { readonly rule: string; readonly version: string }[];
  };
  readonly versions: {
    readonly priceBasis: string;
    readonly registrationApplicability: string;
    readonly rounding: { readonly discount: string | null; readonly tax: string | null; readonly bill: string };
  };
}
