import type { PtBasis } from '../../../receiving/index.js';
import type { PtRevisionGoods } from '../../../stock/ledger/index.js';

// What a PT's reversal before the scan-in leaves for the PT after it (goods-in 6.4, 6.7; stock-ledger 13.19, 13.21;
// DEC-137, PRD-REC-019; S2-F09-T01). Pure: no database, no clock (code-house-rules 2).
//
// **Design choice** (goods-in 6.7, for the product owner's review, RR-613): the reversal leaves the identity the PT's
// approval gave the GRN's pieces as it is. Its identity step moved every covered piece to a new receipt origin of one
// SKU at one P RATE (13.19); the reversal takes off only the coverage and the cost, so those origins keep their SKU
// with an Unknown cost, uncovered and unaccepted, and the products the PT confirmed stay (goods-in 6.4). A corrected PT
// then gives the pieces identity again from where they are: its identity step takes the reversed PT's origins in place
// of the GRN's, which `goodsAfterReversals` finds by following each GRN origin down the reversed PTs' new origins. The
// holds the reversed PT's approval ended stay ended: Booking's decision to take the goods in stands.

/** A new receipt origin a reversed PT's approval made from its parent (merchandise.pt_origin). */
export interface ReversedOrigin {
  readonly parentReceiptOriginId: string;
  readonly receiptOriginId: string;
  readonly skuId: string;
  readonly quantity: number;
}

/**
 * The GRN's good pieces as a PT's approval takes them after reversals (goods-in 6.7): each part on a GRN origin whose
 * pieces a reversed PT moved is replaced by the origins they are on now, the newest reversed PT's, with their SKUs and
 * pieces; their holds were ended by the reversed PT's approval, so they release none again. Answers the style and size
 * of a part whose pieces no longer add up to them, as when the GRN changed since, which the approval refuses.
 */
export function goodsAfterReversals(
  basis: PtBasis,
  reversed: readonly ReversedOrigin[],
):
  | { readonly kind: 'goods'; readonly basis: PtBasis }
  | { readonly kind: 'changed'; readonly styleCode: string; readonly size: string | null } {
  if (reversed.length === 0) return { kind: 'goods', basis };
  const children = new Map<string, ReversedOrigin[]>();
  for (const origin of reversed) {
    const of = children.get(origin.parentReceiptOriginId) ?? [];
    of.push(origin);
    children.set(origin.parentReceiptOriginId, of);
  }
  const leaves = (origin: ReversedOrigin): ReversedOrigin[] => {
    const below = children.get(origin.receiptOriginId);
    return below === undefined ? [origin] : below.flatMap(leaves);
  };
  const goods: PtBasis['goods'][number][] = [];
  for (const group of basis.goods) {
    const parts: PtBasis['goods'][number]['parts'][number][] = [];
    for (const part of group.parts) {
      const moved = part.receiptOriginId === null ? undefined : children.get(part.receiptOriginId);
      if (moved === undefined) {
        parts.push(part);
        continue;
      }
      const now = moved.flatMap(leaves);
      if (now.reduce((sum, each) => sum + each.quantity, 0) !== part.quantity) {
        return { kind: 'changed', styleCode: group.styleCode, size: group.size };
      }
      for (const each of now) {
        parts.push({
          grnLineId: part.grnLineId,
          receiptOriginId: each.receiptOriginId,
          skuId: each.skuId,
          quantity: each.quantity,
          releases: [],
        });
      }
    }
    goods.push({ ...group, parts });
  }
  return { kind: 'goods', basis: { ...basis, goods } };
}

/**
 * The origins a PT covers whose pieces are no longer all waiting where its approval left them (goods-in 6.7, 8.4): any
 * piece accepted, held, or in another condition than good, or none of them in custody. A reversal takes off the
 * coverage and cost of every piece the PT covers, so a corrected PT must cover them all again, which it cannot for a
 * piece held or damaged since; such a PT is not reversed (**Design choice**, RR-614).
 */
export function originsNotWaiting(goods: readonly PtRevisionGoods[]): readonly string[] {
  const found = new Set<string>();
  for (const row of goods) {
    if (row.locationId === null || row.accepted > 0 || row.held > 0 || (row.quantity > 0 && row.condition !== 'good')) {
      found.add(row.receiptOriginId);
    }
  }
  return [...found].sort();
}
