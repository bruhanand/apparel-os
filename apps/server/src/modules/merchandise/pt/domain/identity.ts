import { splitIdentity, type IdentitySource } from '../../../stock/ledger/index.js';

// The identity step of a PT approval for one style and size (goods-in 6.3 steps 4 and 5; stock-ledger 13.14; GI-1;
// S2-F06-T01). The GRN's counted pieces of the style and size take the SKUs of the PT's rows by quantity, by the
// ledger's split rule (`splitIdentity`): an origin that names a SKU of the rows keeps it first, so a GRN line that named
// the right product is given it again. **Design choice** (goods-in 6.6): every piece the PT covers then moves to a new
// receipt origin of one SKU and one P RATE, linked to the origin it came from, which stays as it was. So the coverage
// and the cost the approval records fall exactly on the pieces the PT covers, at the P RATE of their rows
// (PRD-PTW-010), while the pieces it does not cover on the same origin (confirmed damaged, or extra pieces left held)
// keep their identity, their holds and their Unknown cost (goods-in 8.4; PRD-DMG-005, DEC-137). Rows of one SKU take
// their P RATEs in the file's order. Pure: no database, no clock; the new origins' identifiers come from the caller
// (code-house-rules 2).

/** A row of the PT for the style and size: its SKU, its P RATE in paise and its quantity (`QTY`). */
export interface PtIdentityRow {
  readonly skuId: string;
  readonly pRatePaise: number;
  readonly quantity: number;
}

/** Pieces of one origin that move to a new origin of one SKU at one P RATE. */
export interface PtIdentityPart {
  readonly receiptOriginId: string;
  readonly skuId: string;
  readonly pRatePaise: number;
  readonly quantity: number;
  readonly newReceiptOriginId: string;
}

export type PtIdentitySplit =
  | { readonly kind: 'parts'; readonly parts: readonly PtIdentityPart[] }
  | { readonly kind: 'mismatch'; readonly units: number; readonly rows: number };

export function ptIdentityParts(
  sources: readonly IdentitySource[],
  rows: readonly PtIdentityRow[],
  newOriginId: () => string,
): PtIdentitySplit {
  // The SKUs first, by the ledger's rule; the identifiers it would make are not used, every part takes its own below.
  const bySku = splitIdentity(
    sources,
    rows.map((row) => ({ skuId: row.skuId, quantity: row.quantity })),
    () => '',
  );
  if (bySku.kind === 'mismatch') return bySku;
  // Each SKU's P RATEs in the order its rows first give them, rows of one P RATE counting together.
  const tranches = new Map<string, { pRatePaise: number; left: number }[]>();
  for (const row of rows) {
    const ofSku = tranches.get(row.skuId) ?? [];
    const same = ofSku.find((each) => each.pRatePaise === row.pRatePaise);
    if (same === undefined) ofSku.push({ pRatePaise: row.pRatePaise, left: row.quantity });
    else same.left += row.quantity;
    tranches.set(row.skuId, ofSku);
  }
  const parts: PtIdentityPart[] = [];
  for (const part of bySku.parts) {
    let rest = part.quantity;
    for (const tranche of tranches.get(part.skuId) ?? []) {
      if (rest === 0) break;
      const take = Math.min(rest, tranche.left);
      if (take <= 0) continue;
      parts.push({
        receiptOriginId: part.receiptOriginId,
        skuId: part.skuId,
        pRatePaise: tranche.pRatePaise,
        quantity: take,
        newReceiptOriginId: newOriginId(),
      });
      tranche.left -= take;
      rest -= take;
    }
    if (rest !== 0) throw new Error('PT identity: a SKU took more pieces than its rows give');
  }
  return { kind: 'parts', parts };
}
