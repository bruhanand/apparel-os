import {
  damageablePiecesOf,
  extraPiecesOf,
  lineFindings,
  type CountedLine,
  type LineFindings,
} from '@apparel-os/schemas';

// A recount of a GRN's lines (goods-in 4.7, 4.11; PRD-REC-019; S2-F02-T05): which lines a recount changes, and what it
// does to their custody. Pure: no database, no clock (code-house-rules 2).

/** A GRN line as a recount reads it: what its count recorded, its count now and whether part of it is held. */
export interface RecountedLine extends Omit<CountedLine, 'countedQuantity'> {
  /** The line's count now: its latest approved recount's, or the GRN's while none is approved. */
  readonly countedNow: number;
  /** Its held line, the extra pieces received and held for Booking's decision, or none (goods-in 4.6). */
  readonly heldLineId: string | null;
}

/** Why a recount does not change a line (goods-in 4.11 "Design choice"). */
export type RecountLineRefusal =
  | 'receiving.recount-held-line'
  | 'receiving.recount-not-on-invoice'
  | 'receiving.recount-unchanged'
  | 'receiving.recount-adds-extra'
  | 'receiving.recount-below-damage';

/**
 * What a recount of a line to `countedAfter` pieces does (goods-in 4.11), or why it is refused. A recount changes only
 * the pieces counted of goods on the invoice whose extra pieces, if any, are not received:
 *
 * - a line with a held line is refused: its extra pieces are under an excess hold, which only the PT route ends, so no
 *   reversal could take them back, and a recount would change the pieces Booking decides (PRD-REC-013; stock-ledger
 *   6.1);
 * - wrong and unidentified goods are refused: received, they are a held line; not received, nothing of them is at the
 *   Site to correct;
 * - pieces beyond the invoice on a line whose count recorded none are refused: what happens to them, received and held
 *   or not received, was never recorded, and a recount does not make a held line (goods-in 4.4);
 * - fewer pieces than the count found damaged are refused (`damageablePiecesOf`; goods-in 4.4, 4.9);
 * - a line recounted at its count now is refused as changing nothing.
 *
 * The findings before and after are worked out by `lineFindings` with everything else the count recorded: the
 * invoice, the goods, what happens to extra pieces and the damage. **Design choice**, for the product owner (RR-587).
 */
export function recountOfLine(
  line: RecountedLine,
  countedAfter: number,
):
  | { readonly kind: 'refused'; readonly code: RecountLineRefusal }
  | { readonly kind: 'recounted'; readonly before: LineFindings; readonly after: LineFindings } {
  if (line.heldLineId !== null) return { kind: 'refused', code: 'receiving.recount-held-line' };
  if (line.goods !== 'on-invoice') return { kind: 'refused', code: 'receiving.recount-not-on-invoice' };
  if (countedAfter === line.countedNow) return { kind: 'refused', code: 'receiving.recount-unchanged' };
  const recounted = { ...line, countedQuantity: countedAfter };
  if (extraPiecesOf(recounted) > 0 && line.extra === null) {
    return { kind: 'refused', code: 'receiving.recount-adds-extra' };
  }
  if ((line.damagedQuantity ?? 0) > damageablePiecesOf(recounted)) {
    return { kind: 'refused', code: 'receiving.recount-below-damage' };
  }
  return {
    kind: 'recounted',
    before: lineFindings({ ...line, countedQuantity: line.countedNow }),
    after: lineFindings(recounted),
  };
}

/** One receipt origin of a GRN line's goods, with the receipt count that made it and the pieces it still holds. */
export interface LineOrigin {
  readonly receiptOriginId: string;
  readonly movementId: string;
  readonly pieces: number;
}

/**
 * Which pieces a recount takes back (goods-in 4.11): from the line's origins newest first, the pieces a recount found
 * before the GRN's own, since the count's damage and holds fall on the GRN's origin (4.9). Each part names the receipt
 * count it reverses. More than the origins hold is a defect: they hold every piece the line received.
 */
export function piecesToReverse(
  origins: readonly LineOrigin[],
  quantity: number,
): readonly { readonly receiptOriginId: string; readonly movementId: string; readonly quantity: number }[] {
  const parts: { receiptOriginId: string; movementId: string; quantity: number }[] = [];
  let wanted = quantity;
  for (const origin of [...origins].reverse()) {
    if (wanted === 0) break;
    const taken = Math.min(wanted, origin.pieces);
    if (taken <= 0) continue;
    parts.push({ receiptOriginId: origin.receiptOriginId, movementId: origin.movementId, quantity: taken });
    wanted -= taken;
  }
  if (wanted > 0) throw new Error('A recount takes back more pieces than its line received');
  return parts;
}
