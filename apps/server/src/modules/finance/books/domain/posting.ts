import { addPaise, paise, type Paise } from '@apparel-os/domain';
import type { PostingSide } from '@apparel-os/schemas';
import { PRODUCTION_COMPOSITION, type Composition } from '../../../../kernel/index.js';
import { byText } from './order.js';

// The posting rules of the books part as plain functions (books-and-posting 6, 7, 8.2, 9; code-house-rules 2): the
// posting event kinds the posting modules declare, a map version applied to an item, and an item's lines summed into a
// journal's. No database, clock or logger.

/**
 * A posting event kind as the module that posts it declares it in code (7.1): `module.effect`, the signed components
 * it carries, its reversal kind (declared too, with the same components and, for a reversal of an inflow made in
 * error, a `variance` component) and the stage it goes live. A synthetic kind, for tests only, begins `test-`.
 */
export interface PostingEventKind {
  readonly kind: string;
  readonly components: readonly string[];
  /** The kind its reversal posts under; null for a kind that is itself a reversal kind (7.1). */
  readonly reversalKind: string | null;
  readonly liveStage: number;
}

const KIND = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const COMPONENT = /^[a-z][a-z0-9-]*$/;
/** The prefix of a synthetic kind's module (code-house-rules 11.1). */
export const SYNTHETIC_KIND_PREFIX = 'test-';

/**
 * Checks the declarations once, at start (7.1): each kind named once and in form, its components named once and in
 * form, its reversal kind declared with every one of its components, and a synthetic kind only in a test composition.
 */
export function checkEventKinds(
  kinds: readonly PostingEventKind[],
  composition: Composition = PRODUCTION_COMPOSITION,
): ReadonlyMap<string, PostingEventKind> {
  const byKind = new Map<string, PostingEventKind>();
  for (const each of kinds) {
    if (!KIND.test(each.kind)) throw new Error(`A posting event kind is named module.effect: ${each.kind}`);
    if (each.kind.startsWith(SYNTHETIC_KIND_PREFIX) && composition.kind !== 'test') {
      throw new Error(`A synthetic posting event kind ${each.kind} is declared outside a test composition`);
    }
    if (byKind.has(each.kind)) throw new Error(`Posting event kind ${each.kind} is declared twice`);
    if (each.components.length === 0 || new Set(each.components).size !== each.components.length) {
      throw new Error(`Posting event kind ${each.kind} names each of its components once`);
    }
    const strange = each.components.find((component) => !COMPONENT.test(component));
    if (strange !== undefined) throw new Error(`Component ${strange} of ${each.kind} is not in form`);
    byKind.set(each.kind, each);
  }
  for (const each of byKind.values()) {
    if (each.reversalKind === null) continue;
    const reversal = byKind.get(each.reversalKind);
    if (reversal === undefined)
      throw new Error(`The reversal kind ${each.reversalKind} of ${each.kind} is not declared`);
    const missing = each.components.find((component) => !reversal.components.includes(component));
    if (missing !== undefined) {
      throw new Error(`The reversal kind ${each.reversalKind} lacks the component ${missing} of ${each.kind}`);
    }
  }
  return byKind;
}

/** A line of a map version (6.1). */
export interface MapLine {
  readonly component: string;
  readonly side: PostingSide;
  readonly accountId: string;
  readonly requiresStore: boolean;
  readonly requiresBrand: boolean;
}

/** What is wrong with a map version's lines for its kind, or undefined (6.1). */
export function mapLinesRefusal(
  kind: PostingEventKind,
  lines: readonly MapLine[],
): { readonly code: string; readonly component: string } | undefined {
  const strange = lines.find((line) => !kind.components.includes(line.component));
  if (strange !== undefined) return { code: 'finance.component-not-of-kind', component: strange.component };
  const bare = kind.components.find((component) => !lines.some((line) => line.component === component));
  if (bare !== undefined) return { code: 'finance.component-without-line', component: bare };
  return undefined;
}

/** The opposite side. */
export const otherSide = (side: PostingSide): PostingSide => (side === 'debit' ? 'credit' : 'debit');

/** The dimensions of an item's lines (3.2): the unit, its Site and Store, the book's legal entity and the brand. */
export interface ItemDimensions {
  readonly businessUnitId: string;
  readonly siteId: string;
  readonly storeId: string | null;
  readonly brandId: string | null;
  readonly legalEntityId: string;
  readonly mappingVersionId: string;
}

/** One line an item makes, before lines are summed (8.2). */
export interface ItemLine extends ItemDimensions {
  readonly component: string;
  /** The component's signed amount in paise, as the item carried it (8.3; PRD-MOD-014). */
  readonly signedAmount: Paise;
  readonly accountId: string;
  readonly side: PostingSide;
  /** In paise, above zero (5.1). */
  readonly amount: Paise;
}

export type ApplyRefusal =
  | { readonly code: 'finance.component-without-line'; readonly component: string }
  | { readonly code: 'finance.map-account-not-in-force'; readonly accountId: string }
  | { readonly code: 'finance.missing-dimension'; readonly dimension: 'store' | 'brand'; readonly component: string }
  | { readonly code: 'finance.journal-unbalanced' };

/**
 * A map version applied to one item's non-zero components (6.1, 6.2): each line of a component takes its whole value,
 * on the line's side for a positive amount and on the other for a negative one. Refused with the failed condition of
 * 6.2: a component with no line (2), an account not in force or retired on the date (3), a required dimension missing
 * (4), or lines that would not balance (5).
 */
export function applyMap(
  lines: readonly MapLine[],
  components: readonly { readonly component: string; readonly amount: Paise }[],
  dimensions: ItemDimensions,
  accountsInForce: ReadonlySet<string>,
):
  | { readonly kind: 'lines'; readonly lines: ItemLine[] }
  | { readonly kind: 'refused'; readonly refusal: ApplyRefusal } {
  const made: ItemLine[] = [];
  for (const { component, amount } of components) {
    if (amount === 0) continue;
    const own = lines.filter((line) => line.component === component);
    if (own.length === 0) return { kind: 'refused', refusal: { code: 'finance.component-without-line', component } };
    for (const line of own) {
      if (!accountsInForce.has(line.accountId)) {
        return { kind: 'refused', refusal: { code: 'finance.map-account-not-in-force', accountId: line.accountId } };
      }
      if (line.requiresStore && dimensions.storeId === null) {
        return { kind: 'refused', refusal: { code: 'finance.missing-dimension', dimension: 'store', component } };
      }
      if (line.requiresBrand && dimensions.brandId === null) {
        return { kind: 'refused', refusal: { code: 'finance.missing-dimension', dimension: 'brand', component } };
      }
      made.push({
        ...dimensions,
        component,
        signedAmount: amount,
        accountId: line.accountId,
        side: amount > 0 ? line.side : otherSide(line.side),
        amount: paise(Math.abs(amount)),
      });
    }
  }
  if (!balances(made)) return { kind: 'refused', refusal: { code: 'finance.journal-unbalanced' } };
  return { kind: 'lines', lines: made };
}

/** Debits equal credits, in whole paise (5.2; POL-09.13; PRD-MOD-014). */
export function balances(lines: readonly { readonly side: PostingSide; readonly amount: Paise }[]): boolean {
  let debits = paise(0);
  let credits = paise(0);
  for (const line of lines) {
    if (line.side === 'debit') debits = addPaise(debits, line.amount);
    else credits = addPaise(credits, line.amount);
  }
  return debits === credits;
}

/** A journal line, summed by account, side, business unit, Store and brand (8.2), with the item lines it holds. */
export interface SummedLine {
  readonly accountId: string;
  readonly side: PostingSide;
  /** In paise, above zero (5.1). */
  readonly amount: Paise;
  readonly dimensions: ItemDimensions;
  readonly parts: readonly ItemLine[];
}

/**
 * The lines of one journal, summed by account, side, business unit, Store and brand (8.2), in a stable order. A unit
 * has one mapping version on one accounting date, so its lines share it.
 */
export function sumLines(lines: readonly ItemLine[]): SummedLine[] {
  const byKey = new Map<string, { line: ItemLine; amount: Paise; parts: ItemLine[] }>();
  for (const line of lines) {
    const key = [line.accountId, line.side, line.businessUnitId, line.storeId ?? '', line.brandId ?? ''].join('|');
    const found = byKey.get(key);
    if (found === undefined) byKey.set(key, { line, amount: line.amount, parts: [line] });
    else {
      found.amount = addPaise(found.amount, line.amount);
      found.parts.push(line);
    }
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => byText(a, b))
    .map(([, { line, amount, parts }]) => ({
      accountId: line.accountId,
      side: line.side,
      amount,
      dimensions: {
        businessUnitId: line.businessUnitId,
        siteId: line.siteId,
        storeId: line.storeId,
        brandId: line.brandId,
        legalEntityId: line.legalEntityId,
        mappingVersionId: line.mappingVersionId,
      },
      parts,
    }));
}
