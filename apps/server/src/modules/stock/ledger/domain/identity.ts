// The identity step's split rule (stock-ledger 13.14; goods-in 6.3 step 4; GI-1): at PT approval the receipt origins of
// one style and size take the SKUs the PT's rows give that style and size, by quantity. The PT is the record of identity
// (goods-in 6.3), and colour is not compared with the GRN (DEC-138), so which counted units take which SKU is decided
// by quantity alone, by this rule. Pure: no database, no clock (code-house-rules 2). The caller runs it with the units
// it expects, before Plan, and sends its parts as an `identity-resolved` item; the ledger checks them under the locks
// (13.14). **Design choice**; no business value.

/** One receipt origin of the style and size, with the units that take an identity. */
export interface IdentitySource {
  readonly receiptOriginId: string;
  /** The SKU the origin names, or null while Unknown (stock-ledger 2.2; PRD-DMG-005). */
  readonly skuId: string | null;
  readonly units: number;
}

/** One row of the PT for the style and size: a SKU and its quantity (`QTY`). */
export interface IdentityRow {
  readonly skuId: string;
  readonly quantity: number;
}

/** Units of one origin that take one SKU; `keeps` when the origin already names that SKU, so it stays as it is. */
export interface IdentitySplitPart {
  readonly receiptOriginId: string;
  readonly skuId: string;
  readonly quantity: number;
  readonly keeps: boolean;
}

export type IdentitySplit =
  | { readonly kind: 'split'; readonly parts: readonly IdentitySplitPart[] }
  | { readonly kind: 'mismatch'; readonly units: number; readonly rows: number };

function wholeNumber(value: number, aboveZero: boolean): void {
  if (!Number.isInteger(value) || value < (aboveZero ? 1 : 0)) {
    throw new Error(`Identity split: ${String(value)} is not a whole number${aboveZero ? ' above zero' : ''}`);
  }
}

/**
 * Splits the origins of one style and size into the PT's SKUs by quantity, every unit once (stock-ledger 13.14):
 * 1. The rows of one SKU count together, in the order the SKU first appears.
 * 2. An origin that already names a SKU of the rows keeps it for as many of its units as that SKU's quantity still
 *    allows, origins in the order given, so a GRN line that named the right product is not changed.
 * 3. Every other unit takes the SKUs' remaining quantities in the rows' order, origins in the order given; so an origin
 *    that named another SKU, or none, is given the PT's (goods-in 6.3 step 4).
 * The parts come per origin in the order given, the kept part first. When the rows do not add up to the units the
 * answer is a mismatch and nothing is split: the PT must match the GRN's good pieces (goods-in 5.4).
 */
export function splitIdentity(sources: readonly IdentitySource[], rows: readonly IdentityRow[]): IdentitySplit {
  for (const source of sources) wholeNumber(source.units, false);
  if (new Set(sources.map((source) => source.receiptOriginId)).size !== sources.length) {
    throw new Error('Identity split: an origin is given twice');
  }
  for (const row of rows) wholeNumber(row.quantity, true);
  const left = new Map<string, number>();
  for (const row of rows) left.set(row.skuId, (left.get(row.skuId) ?? 0) + row.quantity);
  const units = sources.reduce((sum, source) => sum + source.units, 0);
  const rowTotal = [...left.values()].reduce((sum, quantity) => sum + quantity, 0);
  if (units !== rowTotal) return { kind: 'mismatch', units, rows: rowTotal };

  const kept = new Map<string, number>();
  for (const source of sources) {
    if (source.skuId === null) continue;
    const take = Math.min(source.units, left.get(source.skuId) ?? 0);
    if (take <= 0) continue;
    kept.set(source.receiptOriginId, take);
    left.set(source.skuId, (left.get(source.skuId) ?? 0) - take);
  }
  const parts: IdentitySplitPart[] = [];
  for (const source of sources) {
    const keeping = kept.get(source.receiptOriginId) ?? 0;
    if (keeping > 0 && source.skuId !== null) {
      parts.push({ receiptOriginId: source.receiptOriginId, skuId: source.skuId, quantity: keeping, keeps: true });
    }
    let rest = source.units - keeping;
    for (const [skuId, quantity] of left) {
      if (rest === 0) break;
      const take = Math.min(rest, quantity);
      if (take <= 0) continue;
      parts.push({ receiptOriginId: source.receiptOriginId, skuId, quantity: take, keeps: false });
      left.set(skuId, quantity - take);
      rest -= take;
    }
  }
  return { kind: 'split', parts };
}
