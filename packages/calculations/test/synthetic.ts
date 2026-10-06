// Synthetic rule data for the unit and property tests, the same labelled values as shared-calculations 12.3. Every
// value is SYNTHETIC, chosen to be unlike a real one, and never becomes a default (code-house-rules 11.1; AGENTS.md
// "Never invent a value"). Application code never imports this folder (code-house-rules 11.2).

import { known, unknownValue } from '@apparel-os/domain';
import type {
  BillLineInput,
  CombinationRule,
  Offer,
  OfferTerms,
  PriceBillInput,
  RoundingRulesInForce,
  TaxRulesInForce,
} from '../src/index.js';

export const SYN_DATE = '2026-10-10';

export const SYN_TAX = {
  priceBasis: { version: 'syn-basis-incl', pricesIncludeTax: true },
  registration: {
    version: 'syn-reg-1',
    registration: 'SYN-REG-1',
    chargesTax: true,
    components: [
      { component: 'SYN-X', share: '0.5' },
      { component: 'SYN-Y', share: '0.5' },
    ],
  },
  classifications: [
    { code: 'SYN-HSN-1', version: 'syn-tax-1' },
    { code: 'SYN-HSN-2', version: 'syn-tax-1' },
  ],
  rateRules: [
    {
      kind: 'slabs',
      version: 'syn-tax-1',
      classification: 'SYN-HSN-1',
      comparedValue: { per: 'unit', discounts: 'after', tax: 'excluded' },
      slabs: [
        { lowerBound: 0, boundIn: 'this-slab', rate: '10' },
        { lowerBound: 150000, boundIn: 'this-slab', rate: '20' },
      ],
    },
    { kind: 'single-rate', version: 'syn-tax-1', classification: 'SYN-HSN-2', rate: '10' },
  ],
} satisfies TaxRulesInForce;

export const SYN_ROUNDING = {
  discount: { version: 'syn-round-1', unit: 1, mode: 'half-up' },
  tax: { version: 'syn-round-1', unit: 1, mode: 'half-up', level: 'line' },
  bill: { version: 'syn-round-1', unit: 1, mode: 'half-up' },
} satisfies RoundingRulesInForce;

/** The synthetic rounding rules with one kind left out, as when no rule of that kind is in force. */
export function synRoundingWithout(kind: keyof RoundingRulesInForce): RoundingRulesInForce {
  return Object.fromEntries(Object.entries(SYN_ROUNDING).filter(([key]) => key !== kind));
}

export function synLine(
  id: string,
  mrp: number,
  options: Partial<Omit<BillLineInput, 'id' | 'mrp'>> & { readonly hsn?: string } = {},
): BillLineInput {
  const { hsn = 'SYN-HSN-2', ...rest } = options;
  return {
    id,
    item: `SYN-SKU-${id}`,
    brand: 'SYN-BR-A',
    classification: known(hsn),
    quantity: 1,
    mrp: known(mrp),
    startPrice: { source: 'mrp' },
    ...rest,
  };
}

export function synOffer(id: string, terms: OfferTerms, options: Partial<Omit<Offer, 'id' | 'terms'>> = {}): Offer {
  return {
    id,
    version: `${id.toLowerCase()}-1`,
    approvedAt: '2026-09-01T00:00:00Z',
    effectiveFrom: '2026-10-01',
    goods: { brands: ['SYN-BR-A'], items: [] },
    places: { stores: [], storeGroups: ['SYN-G1'] },
    appliesToMarkdownPrices: true,
    terms,
    ...options,
  };
}

export function synRule(
  id: string,
  offers: string[],
  application: CombinationRule['application'] = 'on-value-left',
): CombinationRule {
  return { id, version: `${id.toLowerCase()}-1`, effectiveFrom: '2026-10-01', offers, application };
}

export function synBill(lines: BillLineInput[], options: Partial<Omit<PriceBillInput, 'lines'>> = {}): PriceBillInput {
  return {
    store: 'SYN-S1',
    storeGroups: ['SYN-G1'],
    businessDate: SYN_DATE,
    lines,
    priceLists: [],
    offers: [],
    combinationRules: [],
    tax: SYN_TAX,
    rounding: SYN_ROUNDING,
    ...options,
  };
}

export const UNKNOWN = unknownValue();
