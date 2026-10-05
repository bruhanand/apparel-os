// Offers: eligibility (5.3), which apply (5.4), their amounts (5.5) and the spread of group discounts (5.6).
// PRD-OFR-001 to PRD-OFR-004, PRD-OFR-021, PRD-POS-023, POL-19.01, POL-19.04, DEC-108, DEC-109.
// The meaning of each offer kind in amounts and how combined offers apply are Proposed (GC7-9); which lines earn a
// group discount is open (GC7-11, RR-042). Where those readings would change an amount, the calculation refuses with
// `not-decided` instead of choosing one.

import { type IsoDate, isInForce } from '../dates.js';
import { parseDecimal, parsePercent } from '../numbers/decimal.js';
import { type Fraction, add, compare, fraction, isInteger, mul, ZERO } from '../numbers/fraction.js';
import { type RoundingRule, exactPaise, roundByRule } from '../numbers/rounding.js';
import { type Refusal, refusal } from '../result.js';
import { spreadGroupDiscount } from './spread.js';
import type { CombinationRule, Offer } from './types.js';

/** A line as the offer steps see it: whole units and its start value in paise. */
export interface OfferLine {
  readonly index: number;
  readonly id: string;
  readonly item: string;
  readonly brand: string;
  readonly quantity: bigint;
  readonly startValue: bigint;
  /** True when the start price came from a markdown price list (5.3). */
  readonly markdown: boolean;
}

export interface OfferContext {
  readonly store: string;
  readonly storeGroups: readonly string[];
  readonly businessDate: IsoDate;
}

/** What one set of offers does to the lines. */
export interface SetOutcome {
  /** Per line, in bill order: the discount each percentage or flat offer took from it. */
  readonly offerDiscounts: readonly ReadonlyMap<string, bigint>[];
  /** Per line, in bill order: the share of each spread group discount. */
  readonly spreadShares: readonly ReadonlyMap<string, bigint>[];
  /** The total discount each offer gave. */
  readonly offerTotals: ReadonlyMap<string, bigint>;
  readonly total: bigint;
  readonly rulesUsed: readonly CombinationRule[];
  readonly usedDiscountRounding: boolean;
}

export interface OfferChoice {
  /** The eligible offers, ordered by identity (PRD-OFR-003). */
  readonly considered: readonly Offer[];
  /** Every permitted set of overlapping offers with its total discount, best first (PRD-OFR-021: "and why"). */
  readonly candidates: readonly { readonly offers: readonly string[]; readonly total: bigint }[];
  /** The chosen set together with the offers that overlap nothing. */
  readonly chosen: readonly Offer[];
  readonly outcome: SetOutcome;
  /**
   * The combination rules in force that name two or more considered offers (Proposed, section 4): they decided which sets were permitted,
   * so the bill records them (section 4) and a replay with the recorded versions makes the same choice.
   */
  readonly combinationRules: readonly CombinationRule[];
  /** Whether working out any candidate set used the discount rounding rule; a replay needs it too. */
  readonly usedDiscountRounding: boolean;
}

type Choose = { readonly ok: true; readonly value: OfferChoice } | { readonly ok: false; readonly refusals: Refusal[] };

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function assertWhole(value: number, what: string, positive = false): void {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new RangeError(`${what} must be a whole number${positive ? ' above zero' : ', not negative'}`);
  }
}

/** A discount rate is a percentage from 0 to 100; anything else is a malformed offer. */
function assertPercentage(rate: string, offer: string): void {
  if (compare(parseDecimal(rate), fraction(100n)) > 0) throw new RangeError(`Offer ${offer}: a rate above 100%`);
}

/** The settings of 5.3 are present and well formed; a malformed offer is a defect in its owner, so it throws. */
export function assertOffer(offer: Offer): void {
  if (!TIMESTAMP.test(offer.approvedAt)) {
    throw new RangeError(`Offer ${offer.id}: approvedAt must be a UTC timestamp YYYY-MM-DDTHH:MM:SSZ`);
  }
  const terms = offer.terms;
  switch (terms.kind) {
    case 'percentage':
      assertPercentage(terms.rate, offer.id);
      break;
    case 'flat':
      assertWhole(terms.amountPerUnit, `Offer ${offer.id}: amountPerUnit`);
      break;
    case 'basket':
      assertWhole(terms.threshold, `Offer ${offer.id}: threshold`);
      if (terms.discount.kind === 'amount') assertWhole(terms.discount.amount, `Offer ${offer.id}: amount`);
      else assertPercentage(terms.discount.rate, offer.id);
      break;
    case 'buy-x-get-y':
      assertWhole(terms.buy, `Offer ${offer.id}: buy`, true);
      assertWhole(terms.get, `Offer ${offer.id}: get`, true);
      if (terms.reward.kind === 'rate') assertPercentage(terms.reward.rate, offer.id);
      break;
  }
}

/** The lines an offer's eligibility covers: its brands or items, and the markdown setting (5.3, PRD-OFR-004). */
export function coveredLines(offer: Offer, lines: readonly OfferLine[]): number[] {
  return lines
    .filter((line) => offer.goods.brands.includes(line.brand) || offer.goods.items.includes(line.item))
    .filter((line) => offer.appliesToMarkdownPrices || !line.markdown)
    .map((line) => line.index);
}

/** In force at the Store or one of its groups on the business date (5.3; PRD-OFR-001). */
export function offerInForceAt(offer: Offer, context: OfferContext): boolean {
  const atPlace =
    offer.places.stores.includes(context.store) ||
    offer.places.storeGroups.some((group) => context.storeGroups.includes(group));
  return atPlace && isInForce(offer, context.businessDate);
}

function byApproval(a: Offer, b: Offer): number {
  if (a.approvedAt !== b.approvedAt) return a.approvedAt < b.approvedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function byId(a: { readonly id: string }, b: { readonly id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The tie-break of 5.4 (PRD-OFR-021): order each tied set's offers by approval time and compare the lists from the
 * start, the earlier time winning; then the lower offer identifier. A list that is the start of the other comes first.
 */
export function compareTiedSets(a: readonly Offer[], b: readonly Offer[]): number {
  const left = [...a].sort(byApproval);
  const right = [...b].sort(byApproval);
  const common = Math.min(left.length, right.length);
  for (let i = 0; i < common; i += 1) {
    const x = left[i]?.approvedAt ?? '';
    const y = right[i]?.approvedAt ?? '';
    if (x !== y) return x < y ? -1 : 1;
  }
  for (let i = 0; i < common; i += 1) {
    const x = left[i]?.id ?? '';
    const y = right[i]?.id ?? '';
    if (x !== y) return x < y ? -1 : 1;
  }
  return left.length - right.length;
}

function notDecided(question: string, input: string): Refusal {
  return refusal('not-decided', { question, input });
}

interface Governance {
  readonly lineOrder: readonly (readonly string[])[];
  readonly lineMode: readonly ('on-value-left' | 'on-start-value' | 'alone')[];
  readonly rulesUsed: readonly CombinationRule[];
  readonly order: readonly Offer[];
}

/** For each line with two or more offers, the one order and way of applying that the rules in force give it. */
function govern(
  lines: readonly OfferLine[],
  set: readonly Offer[],
  covered: ReadonlyMap<string, readonly number[]>,
  rules: readonly CombinationRule[],
): { ok: true; value: Governance } | { ok: false; refusal: Refusal } {
  const lineOrder: string[][] = [];
  const lineMode: ('on-value-left' | 'on-start-value' | 'alone')[] = [];
  const used = new Map<string, CombinationRule>();
  const after = new Map<string, Set<string>>(set.map((o) => [o.id, new Set<string>()]));
  for (const line of lines) {
    const ids = set.filter((o) => covered.get(o.id)?.includes(line.index) ?? false).map((o) => o.id);
    if (ids.length < 2) {
      lineOrder.push(ids);
      lineMode.push('alone');
      continue;
    }
    // POL-19.04: offers on one line combine only as a rule in force says. The rules that name all of them must agree
    // on the order and the way of applying; otherwise the order is not given (Proposed, 5.4; GC7-9).
    const governing = rules.filter((rule) => ids.every((id) => rule.offers.includes(id)));
    const ordered = (rule: CombinationRule): string[] =>
      [...ids].sort((a, b) => rule.offers.indexOf(a) - rule.offers.indexOf(b));
    const first = governing[0];
    if (first === undefined) return { ok: false, refusal: notDecided('GC7-9', `line ${line.id}`) };
    const order = ordered(first);
    const agree = governing.every(
      (rule) => rule.application === first.application && ordered(rule).join('\n') === order.join('\n'),
    );
    if (!agree) return { ok: false, refusal: notDecided('GC7-9', `line ${line.id}`) };
    for (const rule of governing) used.set(rule.id, rule);
    lineOrder.push(order);
    lineMode.push(first.application);
    for (let i = 1; i < order.length; i += 1) after.get(order[i - 1] ?? '')?.add(order[i] ?? '');
  }
  // One order over the whole bill that keeps every line's order; ties by approval time, then identity (Proposed, 5.4).
  const remaining = [...set].sort(byApproval);
  const order: Offer[] = [];
  while (remaining.length > 0) {
    const nextIndex = remaining.findIndex((candidate) =>
      remaining.every((other) => !(after.get(other.id)?.has(candidate.id) ?? false)),
    );
    if (nextIndex === -1) return { ok: false, refusal: notDecided('GC7-9', 'combination order') };
    order.push(...remaining.splice(nextIndex, 1));
  }
  return { ok: true, value: { lineOrder, lineMode, rulesUsed: [...used.values()].sort(byId), order } };
}

/** Works out what one set of offers does to the lines (5.5, 5.6). */
export function evaluateSet(
  lines: readonly OfferLine[],
  set: readonly Offer[],
  rules: readonly CombinationRule[],
  discountRule: RoundingRule | undefined,
): { ok: true; value: SetOutcome } | { ok: false; refusal: Refusal } {
  const covered = new Map(set.map((o) => [o.id, coveredLines(o, lines)]));
  const governed = govern(lines, set, covered, rules);
  if (!governed.ok) return governed;
  const { lineMode, order, rulesUsed } = governed.value;

  const value = lines.map((line) => line.startValue);
  const offerDiscounts = lines.map(() => new Map<string, bigint>());
  const spreadShares = lines.map(() => new Map<string, bigint>());
  const offerTotals = new Map<string, bigint>();
  let usedDiscountRounding = false;

  // 5.5: a rate is rounded by the discount rounding rule (3.3, GC7-5); with no rule in force the step is refused.
  const roundDiscount = (exact: Fraction): bigint | Refusal => {
    if (discountRule === undefined) return refusal('rounding-rule-missing', { input: 'discount' });
    usedDiscountRounding = true;
    return roundByRule(exact, discountRule);
  };
  // The value an offer works on at its turn: the value left, or the start value where the line's rule says so.
  const base = (index: number): bigint =>
    lineMode[index] === 'on-start-value' ? (lines[index]?.startValue ?? 0n) : (value[index] ?? 0n);
  // No line's value goes below zero (5.5). A take above what is left is never capped: under a rule applying offers to
  // the start value it is how combined offers apply to each other's values (GC7-9); otherwise it can only be the paise
  // a spread leaves, given to the largest line (GC7-16). Either way the calculation refuses (Proposed, 5.5, 5.6).
  const take = (index: number, wanted: bigint): bigint | Refusal => {
    const left = value[index] ?? 0n;
    if (wanted > left) {
      const question = lineMode[index] === 'on-start-value' ? 'GC7-9' : 'GC7-16';
      return notDecided(question, `line ${lines[index]?.id ?? ''}`);
    }
    value[index] = left - wanted;
    return wanted;
  };

  for (const offer of order) {
    const indexes = covered.get(offer.id) ?? [];
    const terms = offer.terms;
    let total = 0n;
    if (terms.kind === 'percentage') {
      for (const i of indexes) {
        const rounded = roundDiscount(mul(fraction(base(i)), parsePercent(terms.rate)));
        if (typeof rounded !== 'bigint') return { ok: false, refusal: rounded };
        const taken = take(i, rounded);
        if (typeof taken !== 'bigint') return { ok: false, refusal: taken };
        if (taken > 0n) offerDiscounts[i]?.set(offer.id, taken);
        total += taken;
      }
    } else if (terms.kind === 'flat') {
      for (const i of indexes) {
        // The amount off each eligible unit, never more than the unit's value at its turn.
        const quantity = lines[i]?.quantity ?? 0n;
        const wanted = BigInt(terms.amountPerUnit) * quantity;
        const at = base(i);
        const taken = take(i, wanted < at ? wanted : at);
        if (typeof taken !== 'bigint') return { ok: false, refusal: taken };
        if (taken > 0n) offerDiscounts[i]?.set(offer.id, taken);
        total += taken;
      }
    } else {
      let discount = 0n;
      if (terms.kind === 'basket') {
        const eligibleValue = indexes.reduce((acc, i) => acc + base(i), 0n);
        if (eligibleValue >= BigInt(terms.threshold)) {
          if (terms.discount.kind === 'amount') {
            const amount = BigInt(terms.discount.amount);
            discount = amount < eligibleValue ? amount : eligibleValue;
          } else {
            const rounded = roundDiscount(mul(fraction(eligibleValue), parsePercent(terms.discount.rate)));
            if (typeof rounded !== 'bigint') return { ok: false, refusal: rounded };
            discount = rounded;
          }
        }
      } else {
        const units = indexes.reduce((acc, i) => acc + (lines[i]?.quantity ?? 0n), 0n);
        const setSize = BigInt(terms.buy + terms.get);
        const sets = units / setSize;
        // GC7-11 / RR-042: with units left over after the complete sets, the two readings of "the lines that earned
        // it" spread differently. Neither is accepted, so the calculation refuses rather than choose.
        if (sets > 0n && units % setSize !== 0n) return { ok: false, refusal: notDecided('GC7-11', offer.id) };
        let rewardUnits = sets * BigInt(terms.get);
        // Qualifying units ordered by value as the offer states; ties in bill order.
        const unitValue = (i: number): Fraction => fraction(base(i), lines[i]?.quantity ?? 1n);
        const ordered = [...indexes].sort((a, b) => {
          const c = compare(unitValue(a), unitValue(b));
          return c !== 0 ? (terms.rewardUnits === 'lowest-value-first' ? c : -c) : a - b;
        });
        let rewardValue: Fraction = ZERO;
        for (const i of ordered) {
          if (rewardUnits === 0n) break;
          const quantity = lines[i]?.quantity ?? 0n;
          const taken = quantity < rewardUnits ? quantity : rewardUnits;
          rewardValue = add(rewardValue, mul(unitValue(i), fraction(taken)));
          rewardUnits -= taken;
        }
        if (terms.reward.kind === 'free') {
          // GC7-14: a free unit worth a fraction of a paise needs a rounding step 5.5 does not name.
          if (!isInteger(rewardValue)) return { ok: false, refusal: notDecided('GC7-14', offer.id) };
          discount = exactPaise(rewardValue);
        } else {
          const rounded = roundDiscount(mul(rewardValue, parsePercent(terms.reward.rate)));
          if (typeof rounded !== 'bigint') return { ok: false, refusal: rounded };
          discount = rounded;
        }
      }
      if (discount > 0n) {
        // 5.6: spread over the lines that earned it, by each line's value before this discount (PRD-POS-023).
        const shares = spreadGroupDiscount(
          discount,
          indexes.map((i) => base(i)),
        );
        for (const [k, i] of indexes.entries()) {
          const taken = take(i, shares[k] ?? 0n);
          if (typeof taken !== 'bigint') return { ok: false, refusal: taken };
          if (taken > 0n) spreadShares[i]?.set(offer.id, taken);
          total += taken;
        }
      }
    }
    offerTotals.set(offer.id, total);
  }

  const total = [...offerTotals.values()].reduce((a, b) => a + b, 0n);
  return { ok: true, value: { offerDiscounts, spreadShares, offerTotals, total, rulesUsed, usedDiscountRounding } };
}

/** Every set of the given offers in which each overlapping pair is permitted to combine by one rule in force. */
function permittedSets(
  offers: readonly Offer[],
  overlaps: (a: Offer, b: Offer) => boolean,
  permitted: (a: Offer, b: Offer) => boolean,
): Offer[][] {
  const sets: Offer[][] = [];
  const extend = (from: number, current: Offer[]): void => {
    sets.push(current);
    for (let i = from; i < offers.length; i += 1) {
      const candidate = offers[i];
      if (candidate === undefined) continue;
      if (current.every((member) => !overlaps(member, candidate) || permitted(member, candidate))) {
        extend(i + 1, [...current, candidate]);
      }
    }
  };
  extend(0, []);
  return sets;
}

/**
 * Chooses the offers a bill gets (5.4; PRD-OFR-021): every permitted set is worked out and the one with the largest
 * total discount applies, ties broken by approval time and then identity. Offers that overlap nothing apply alongside.
 * Running Offers calls the same function, so it shows what checkout would do (PRD-OFR-003).
 */
export function chooseOffers(
  lines: readonly OfferLine[],
  context: OfferContext,
  offers: readonly Offer[],
  rules: readonly CombinationRule[],
  discountRule: RoundingRule | undefined,
): Choose {
  offers.forEach(assertOffer);
  const considered = offers
    .filter((offer) => offerInForceAt(offer, context) && coveredLines(offer, lines).length > 0)
    .sort(byId);
  const covered = new Map(considered.map((o) => [o.id, new Set(coveredLines(o, lines))]));
  const overlaps = (a: Offer, b: Offer): boolean =>
    [...(covered.get(a.id) ?? [])].some((i) => covered.get(b.id)?.has(i));
  const inForce = rules.filter((rule) => isInForce(rule, context.businessDate));
  const permitted = (a: Offer, b: Offer): boolean =>
    inForce.some((rule) => rule.offers.includes(a.id) && rule.offers.includes(b.id));

  const alone = considered.filter((o) => considered.every((p) => p === o || !overlaps(o, p)));
  const contested = considered.filter((o) => !alone.includes(o));

  const evaluated: { offers: Offer[]; outcome: SetOutcome }[] = [];
  for (const set of permittedSets(contested, overlaps, permitted)) {
    const result = evaluateSet(lines, [...set, ...alone], inForce, discountRule);
    if (!result.ok) return { ok: false, refusals: [result.refusal] };
    evaluated.push({ offers: set, outcome: result.value });
  }
  evaluated.sort((a, b) =>
    a.outcome.total !== b.outcome.total
      ? a.outcome.total > b.outcome.total
        ? -1
        : 1
      : compareTiedSets(a.offers, b.offers),
  );
  const best = evaluated[0];
  if (best === undefined) throw new Error('Defect: the empty set is always permitted');
  return {
    ok: true,
    value: {
      considered,
      candidates: evaluated.map((e) => ({ offers: e.offers.map((o) => o.id), total: e.outcome.total })),
      chosen: [...best.offers, ...alone].sort(byId),
      outcome: best.outcome,
      combinationRules: inForce
        .filter((rule) => considered.filter((o) => rule.offers.includes(o.id)).length >= 2)
        .sort(byId),
      usedDiscountRounding: evaluated.some((e) => e.outcome.usedDiscountRounding),
    },
  };
}
