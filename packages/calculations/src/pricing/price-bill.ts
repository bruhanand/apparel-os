// Price a bill (shared-calculations 5.1 to 5.10 and 11; PRD-POS-003, PRD-POS-004, PRD-POS-023, PRD-POS-024,
// PRD-OFR-021). The order of steps is fixed by 5.1: start price, offers, manual discounts, tax on each line's value
// after all discounts, then the bill total and its round-off. Discounts are allocated to lines before tax and rounding,
// so each line carries its own taxable value (PRD-POS-004).

import { type Paise, isKnown, known, unknownValue } from '@apparel-os/domain';
import { assertIsoDate } from '../dates.js';
import { amountIn, amountOut } from '../numbers/amounts.js';
import { parsePercent } from '../numbers/decimal.js';
import { fraction, mul } from '../numbers/fraction.js';
import { roundByRule } from '../numbers/rounding.js';
import { type Refusal, type Result, ok, refusal, refused } from '../result.js';
import {
  assertApplicability,
  assertRateRule,
  assertTaxRoundingRule,
  type GoodsClassification,
  type TaxRateRule,
} from '../tax-rules/records.js';
import { type OfferLine, chooseOffers, coveredLines } from './offers.js';
import { type StartPrice, resolveStartPrice } from './start-price.js';
import { findRate, sameRate, taxAtRate } from './tax.js';
import type { BillLineInput, PriceBillInput, PricedBill, PricedLine, SlabChange } from './types.js';

interface StartedLine extends StartPrice {
  readonly input: BillLineInput;
  readonly classification: GoodsClassification;
  readonly rule: TaxRateRule | null;
}

/** Step 1 and the presence checks: start price and MRP cap, classification and rate rule for each line (5.2, 5.8). */
function startLine(
  line: BillLineInput,
  input: PriceBillInput,
  chargesTax: boolean,
): { ok: true; value: StartedLine } | { ok: false; refusals: Refusal[] } {
  const price = resolveStartPrice(line, input.priceLists);
  const refusals: Refusal[] = price.ok ? [] : [...price.refusals];
  const named = { line: line.id };

  // 5.8, POL-10.05: an Unknown HSN, or no classification or rate rule in force on the bill's date, refuses the line.
  let classification: GoodsClassification | undefined;
  let rule: TaxRateRule | null = null;
  if (!isKnown(line.classification)) {
    refusals.push(refusal('classification-unknown', { ...named, input: 'classification' }));
  } else {
    const code = line.classification.value;
    classification = input.tax.classifications.find((c) => c.code === code);
    if (classification === undefined) {
      refusals.push(refusal('no-tax-rule', { ...named, input: 'classification' }));
    } else if (chargesTax) {
      const rules = input.tax.rateRules.filter((r) => r.classification === code);
      if (rules.length > 1) throw new Error(`Defect: two rate rules in force for ${code}`);
      rule = rules[0] ?? null;
      if (rule === null) refusals.push(refusal('no-tax-rule', { ...named, input: 'rate-rule' }));
      else assertRateRule(rule);
    }
  }

  if (!price.ok || refusals.length > 0 || classification === undefined) return { ok: false, refusals };
  return { ok: true, value: { ...price.value, input: line, classification, rule } };
}

function sumOf(values: readonly bigint[]): bigint {
  return values.reduce((a, b) => a + b, 0n);
}

function amounts(map: ReadonlyMap<string, bigint> | undefined): { offer: string; amount: Paise }[] {
  return [...(map ?? new Map<string, bigint>()).entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([offer, amount]) => ({ offer, amount: amountOut(amount) }));
}

/** Prices a bill, or refuses it naming each line and input that fails (5.10). */
export function priceBill(input: PriceBillInput): Result<PricedBill> {
  assertIsoDate(input.businessDate, 'The business date');
  const ids = new Set(input.lines.map((l) => l.id));
  if (ids.size !== input.lines.length) throw new RangeError('Line identities must be unique');

  // Bill-level presence checks: price basis, registration applicability and the rounding rules a step needs (3.3,
  // 5.8, 5.9; PRD-SEC-017). Nothing has a default.
  const billRefusals: Refusal[] = [];
  const { priceBasis, registration } = input.tax;
  if (priceBasis === undefined) billRefusals.push(refusal('no-tax-rule', { input: 'price-basis' }));
  if (registration === undefined) billRefusals.push(refusal('no-tax-rule', { input: 'registration-applicability' }));
  else assertApplicability(registration);
  const chargesTax = registration?.chargesTax ?? false;
  const taxRule = input.rounding.tax;
  if (chargesTax && taxRule === undefined) billRefusals.push(refusal('rounding-rule-missing', { input: 'tax' }));
  if (taxRule !== undefined) {
    assertTaxRoundingRule(taxRule);
    // GC7-12: tax rounded at the bill level is refused until 5.8 says how bill-level tax is carried to the lines (3.3).
    if (chargesTax && taxRule.level === 'bill')
      billRefusals.push(refusal('not-decided', { input: 'tax', question: 'GC7-12' }));
  }
  const billRule = input.rounding.bill;
  if (billRule === undefined) billRefusals.push(refusal('rounding-rule-missing', { input: 'bill' }));

  const started: StartedLine[] = [];
  const lineRefusals: Refusal[] = [];
  for (const line of input.lines) {
    const result = startLine(line, input, chargesTax);
    if (result.ok) started.push(result.value);
    else lineRefusals.push(...result.refusals);
  }
  if (
    billRefusals.length > 0 ||
    lineRefusals.length > 0 ||
    priceBasis === undefined ||
    registration === undefined ||
    billRule === undefined
  ) {
    return refused(...billRefusals, ...lineRefusals);
  }
  const pricesIncludeTax = priceBasis.pricesIncludeTax;

  // Step 2: offers (5.3 to 5.6).
  const offerLines: OfferLine[] = started.map((line, index) => ({
    index,
    id: line.input.id,
    item: line.input.item,
    brand: line.input.brand,
    quantity: line.quantity,
    startValue: line.startPrice * line.quantity,
    markdown: line.markdown,
  }));
  const choice = chooseOffers(offerLines, input, input.offers, input.combinationRules, input.rounding.discount);
  if (!choice.ok) return refused(...choice.refusals);
  const { outcome, chosen, considered, combinationRules } = choice.value;
  const appliedIds = new Set([...outcome.offerTotals.entries()].filter(([, total]) => total > 0n).map(([id]) => id));
  let usedDiscountRounding = choice.value.usedDiscountRounding;
  // The lines an applied offer covers, whatever share they got.
  const offerCovered = new Set(chosen.filter((o) => appliedIds.has(o.id)).flatMap((o) => coveredLines(o, offerLines)));

  // Step 3: manual discounts (5.7).
  const manual: (bigint | null)[] = [];
  const values: bigint[] = [];
  const manualRefusals: Refusal[] = [];
  started.forEach((line, index) => {
    const startValue = offerLines[index]?.startValue ?? 0n;
    const offerTaken =
      sumOf([...(outcome.offerDiscounts[index]?.values() ?? [])]) +
      sumOf([...(outcome.spreadShares[index]?.values() ?? [])]);
    const afterOffers = startValue - offerTaken;
    const requested = line.input.manualDiscount;
    if (requested === undefined) {
      manual.push(null);
      values.push(afterOffers);
      return;
    }
    const named = { line: line.input.id };
    // GC7-7: whether a manual discount may apply to a line that has an offer is OPEN; until set it is refused.
    if (offerCovered.has(index)) {
      manualRefusals.push(refusal('manual-discount-not-permitted', { ...named, input: 'manual-discount' }));
      return;
    }
    let amount: bigint;
    if (requested.kind === 'amount') {
      amount = amountIn(requested.amount, `Line ${line.input.id}: manual discount`);
    } else {
      const discountRule = input.rounding.discount;
      if (discountRule === undefined) {
        manualRefusals.push(refusal('rounding-rule-missing', { ...named, input: 'discount' }));
        return;
      }
      usedDiscountRounding = true;
      amount = roundByRule(mul(fraction(afterOffers), parsePercent(requested.rate)), discountRule);
    }
    // A manual discount of nothing, or above the line's value after step 2, is refused (Proposed, 5.7).
    if (amount === 0n || amount > afterOffers) {
      manualRefusals.push(refusal('invalid-amount', { ...named, input: 'manual-discount' }));
      return;
    }
    manual.push(amount);
    values.push(afterOffers - amount);
  });
  if (manualRefusals.length > 0) return refused(...manualRefusals);

  // Step 4: tax on each line's value after all discounts (5.8).
  const taxRefusals: Refusal[] = [];
  const priced: PricedLine[] = [];
  started.forEach((line, index) => {
    const value = values[index] ?? 0n;
    const startValue = offerLines[index]?.startValue ?? 0n;
    let taxableValue = value;
    let amountPaid = value;
    let rate: string | null = null;
    let components: PricedLine['tax']['components'] = [];
    let slabChange: SlabChange | null = null;
    if (registration.chargesTax && line.rule !== null && taxRule !== undefined) {
      const rule = line.rule;
      const compareBefore = rule.kind === 'slabs' && rule.comparedValue.discounts === 'before';
      // With a rule that compares the value before discounts, the slab is found on the start value.
      const found = findRate(
        rule,
        compareBefore ? startValue : value,
        line.quantity,
        registration,
        pricesIncludeTax,
        taxRule,
      );
      if (found.kind === 'undetermined') {
        taxRefusals.push(refusal('slab-undetermined', { line: line.input.id, input: 'rate-rule' }));
        return;
      }
      const at = compareBefore ? taxAtRate(value, found.rate, registration, pricesIncludeTax, taxRule) : found.at;
      rate = found.rate;
      taxableValue = at.taxableValue;
      amountPaid = at.amountPaid;
      components = at.components.map((c) => ({ component: c.component, rate: c.rate, amount: amountOut(c.amount) }));
      // PRD-OFR-005: when a discount moves the line into a different slab, mark the rate before and after. Every
      // change is marked; no threshold is assumed. A rate before that no single slab gives is Unknown (Proposed, 5.8).
      if (rule.kind === 'slabs' && !compareBefore && value !== startValue) {
        const before = findRate(rule, startValue, line.quantity, registration, pricesIncludeTax, taxRule);
        if (before.kind === 'undetermined') {
          slabChange = {
            rateBeforeDiscounts: unknownValue(),
            taxableValueBeforeDiscounts: unknownValue(),
            rateAfterDiscounts: found.rate,
          };
        } else if (!sameRate(before.rate, found.rate)) {
          slabChange = {
            rateBeforeDiscounts: known(before.rate),
            taxableValueBeforeDiscounts: known(amountOut(before.at.taxableValue)),
            rateAfterDiscounts: found.rate,
          };
        }
      }
    }
    const manualDiscount = manual[index] ?? null;
    priced.push({
      id: line.input.id,
      item: line.input.item,
      quantity: line.input.quantity,
      mrp: amountOut(line.mrp),
      startPrice: amountOut(line.startPrice),
      startPriceSource: line.source,
      priceListVersion: line.priceListVersion,
      startValue: amountOut(startValue),
      offerDiscounts: amounts(outcome.offerDiscounts[index]),
      spreadShares: amounts(outcome.spreadShares[index]),
      manualDiscount: manualDiscount === null ? null : amountOut(manualDiscount),
      value: amountOut(value),
      taxableValue: amountOut(taxableValue),
      tax: {
        classification: line.classification.code,
        classificationVersion: line.classification.version,
        rateRuleVersion: registration.chargesTax ? (line.rule?.version ?? null) : null,
        rate,
        components,
      },
      slabChange,
      amountPaid: amountOut(amountPaid),
    });
  });
  if (taxRefusals.length > 0) return refused(...taxRefusals);

  // Step 5: the bill total and its round-off, its own component of the result (5.9; books-and-posting 7.3).
  const billTotal = sumOf(priced.map((l) => BigInt(l.amountPaid)));
  const amountDue = roundByRule(fraction(billTotal), billRule);
  const offerDiscount = sumOf(
    priced.map((l) => sumOf([...l.offerDiscounts, ...l.spreadShares].map((d) => BigInt(d.amount)))),
  );
  const manualDiscount = sumOf(priced.map((l) => BigInt(l.manualDiscount ?? 0)));
  const tax = sumOf(priced.flatMap((l) => l.tax.components.map((c) => BigInt(c.amount))));
  const ref = (o: { readonly id: string; readonly version: string }): { offer: string; version: string } => ({
    offer: o.id,
    version: o.version,
  });

  return ok({
    store: input.store,
    businessDate: input.businessDate,
    lines: priced,
    totals: {
      startValue: amountOut(sumOf(priced.map((l) => BigInt(l.startValue)))),
      offerDiscount: amountOut(offerDiscount),
      manualDiscount: amountOut(manualDiscount),
      taxableValue: amountOut(sumOf(priced.map((l) => BigInt(l.taxableValue)))),
      tax: amountOut(tax),
      billTotal: amountOut(billTotal),
    },
    roundOffUp: amountOut(amountDue > billTotal ? amountDue - billTotal : 0n),
    roundOffDown: amountOut(billTotal > amountDue ? billTotal - amountDue : 0n),
    amountDue: amountOut(amountDue),
    offers: {
      considered: considered.map(ref),
      applied: chosen.filter((o) => appliedIds.has(o.id)).map(ref),
      combinationRules: combinationRules.map((r) => ({ rule: r.id, version: r.version })),
    },
    versions: {
      priceBasis: priceBasis.version,
      registrationApplicability: registration.version,
      rounding: {
        discount: usedDiscountRounding ? (input.rounding.discount?.version ?? null) : null,
        tax: registration.chargesTax ? (taxRule?.version ?? null) : null,
        bill: billRule.version,
      },
    },
  });
}
