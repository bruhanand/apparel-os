import type { LocationKind } from '@apparel-os/schemas';
import type { Condition } from '../../stock/ledger/index.js';

// The scan-in's rules (goods-in 7.2, 7.3, 7.5; PRD-REC-021, PRD-REC-022, PRD-STK-013; S2-F07-T01): what of a PT's
// goods waits to be scanned in, which receipt origin a scan takes its piece from, and where a piece may go. Pure: no
// database, no clock (code-house-rules 2).

/** One balance in custody of an origin the PT covers, or the origin alone with none in custody (stock-ledger 13.20). */
export interface CoveredGoods {
  readonly receiptOriginId: string;
  readonly skuId: string;
  /** The origin's covered quantity, repeated on each of its rows. */
  readonly covered: number;
  readonly locationId: string | null;
  readonly condition: Condition | null;
  readonly quantity: number;
  readonly accepted: number;
  /**
   * What the damage holds outside reservations claim on the balance, and what every other hold outside reservations
   * claims, before they are counted once (stock-ledger 6.2).
   */
  readonly damageHeld: number;
  readonly otherHeld: number;
}

/** What one product the PT covers counts in the scan-in (goods-in 7.3). */
export interface ProductProgress {
  readonly skuId: string;
  readonly covered: number;
  readonly accepted: number;
  /** Good pieces at the receiving location, not accepted and not held: what a scan may take. */
  readonly waiting: number;
  /** Pieces not accepted under a damage report: held for it, or confirmed damaged (goods-in 7.2, 8). */
  readonly damaged: number;
  /** Pieces not accepted that neither wait nor are under a damage report: under another hold, or in another condition. */
  readonly held: number;
}

/**
 * What one balance counts (goods-in 7.3): its pieces not accepted, as waiting, under a damage report, or held otherwise.
 * At the receiving location in good condition, holds count once and never more than its units, damage holds first
 * (stock-ledger 6.2), and the rest waits; a damaged piece is under its confirmed report; any other piece not accepted
 * is held. A piece is never accepted at the receiving location itself (`destinationAllowed`), so none accepted is left
 * there to share a balance with those waiting.
 */
function countsOf(
  row: CoveredGoods,
  receivingLocationId: string,
): { readonly waiting: number; readonly damaged: number; readonly held: number } {
  const unaccepted = Math.max(0, row.quantity - row.accepted);
  if (row.condition === 'damaged') return { waiting: 0, damaged: unaccepted, held: 0 };
  if (row.locationId !== receivingLocationId || row.condition !== 'good') {
    return { waiting: 0, damaged: 0, held: unaccepted };
  }
  const damaged = Math.min(unaccepted, row.damageHeld);
  const held = Math.min(unaccepted - damaged, row.otherHeld);
  return { waiting: unaccepted - damaged - held, damaged, held };
}

/** Each product of the PT, in the order its rows first name it, with what it counts (goods-in 7.3, 7.5). */
export function progressOf(rows: readonly CoveredGoods[], receivingLocationId: string): ProductProgress[] {
  const products = new Map<
    string,
    { covered: number; accepted: number; waiting: number; damaged: number; held: number }
  >();
  const counted = new Set<string>();
  for (const row of rows) {
    const product = products.get(row.skuId) ?? { covered: 0, accepted: 0, waiting: 0, damaged: 0, held: 0 };
    products.set(row.skuId, product);
    if (!counted.has(row.receiptOriginId)) {
      counted.add(row.receiptOriginId);
      product.covered += row.covered;
    }
    const counts = countsOf(row, receivingLocationId);
    product.accepted += row.accepted;
    product.waiting += counts.waiting;
    product.damaged += counts.damaged;
    product.held += counts.held;
  }
  return [...products].map(([skuId, product]) => ({ skuId, ...product }));
}

/**
 * The origin a scan of the product takes its piece from (goods-in 7.2): the oldest with a piece waiting, by its
 * identifier, a UUIDv7, since the PT's origins share their count date (PRD-STK-013, PRD-MOD-008); none when no piece
 * of the product waits.
 */
export function originToScan(
  rows: readonly CoveredGoods[],
  skuId: string,
  receivingLocationId: string,
): string | undefined {
  const waiting = rows
    .filter((row) => row.skuId === skuId && countsOf(row, receivingLocationId).waiting > 0)
    .map((row) => row.receiptOriginId)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return waiting[0];
}

/** The kinds of location a piece goes to: at a Store its floor or backstore, at a warehouse a bin (goods-in 7.2). */
const STORE_DESTINATIONS: readonly LocationKind[] = ['floor', 'backstore'];
const WAREHOUSE_DESTINATIONS: readonly LocationKind[] = ['bin'];

/**
 * Whether a piece may go to the location (goods-in 7.2; structure-and-masters 3.5): a floor or backstore at a Store, a
 * bin at a warehouse, and never the receiving location itself, so a piece scanned in always leaves it and what waits
 * there is exactly what is not scanned in. **Design choice**, for the product owner (RR-611). The caller checks that
 * the location is of the GRN's unit, in force and not retired.
 */
export function destinationAllowed(
  unit: { readonly atStore: boolean },
  location: { readonly id: string; readonly kind: LocationKind },
  receivingLocationId: string,
): boolean {
  if (location.id === receivingLocationId) return false;
  return (unit.atStore ? STORE_DESTINATIONS : WAREHOUSE_DESTINATIONS).includes(location.kind);
}

/**
 * The scan-in is complete when every piece the PT covers is accepted or under a damage report (goods-in 7.3): none
 * waits, and none is held otherwise, which no scan accepts.
 */
export function scanInComplete(products: readonly ProductProgress[]): boolean {
  return products.every((product) => product.waiting === 0 && product.held === 0);
}
