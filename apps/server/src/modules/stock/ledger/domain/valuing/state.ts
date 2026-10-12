import type { Paise } from '@apparel-os/domain';
import type { MissingItem } from '../../../../../kernel/index.js';
import type { CostSetting } from '../../plan.js';
import type { Formula, PoolState } from '../valuation.js';
import type { BalanceState, OriginState, PieceState, Scope, TransitKind, WorkingInputs } from '../working.js';

// The valuing state's records (stock-ledger 7, 13.1 "Recheck and value", 14.2; S1-F10-T03): what it reads under the
// locks, and what it decides for Write and for Post.

/** A transit value's FIFO layer: units of one source layer held on it (7.8; 14.2 `transit_value_layer`). */
export interface TransitLayerState {
  readonly id: string;
  readonly isNew: boolean;
  readonly sourceLayerId: string;
  /** The source layer's entry order, for oldest first. */
  readonly order: number;
  quantity: number;
  value: Paise;
  changed: boolean;
}

/** Value held on a dispatch between pools or a supplier-return shipment (7.8; 14.2 `transit_value`), locked at step 6. */
export interface TransitState {
  readonly id: string;
  readonly kind: TransitKind;
  readonly ref: string;
  readonly bookId: string;
  readonly skuId: string;
  /** The formula of its book's cost setting when it was made, which its valuations are worked out under (7.8). */
  readonly formula: Formula;
  readonly scope: Scope;
  quantity: number;
  value: Paise;
  changed: boolean;
  readonly layers: TransitLayerState[];
  /** For piece-tracked goods under FIFO: the source layer each piece on it took (7.4). */
  readonly pieceLayers: Map<string, string>;
}

/** A sale a customer return brings back (7.5): what it issued, by origin and by layer, and what came back since. */
export interface SaleState {
  readonly id: string;
  /** Its movement kind: a sale issue, or for a reversal the kind of the movement reversed (S1-F10-T06). */
  readonly kind: string;
  /** The direction of its legs: out for an outflow, such as a sale or a count loss; in for an inflow. */
  readonly direction: 'in' | 'out' | null;
  readonly siteId: string;
  readonly businessUnitId: string;
  /** Its out legs, in order, by origin. */
  readonly legs: readonly { readonly originId: string; readonly quantity: number }[];
  readonly pieceIds: ReadonlySet<string>;
  /** Its pool valuations by origin, as positive amounts (none when its value was Unknown), under FIFO. */
  readonly valued: ReadonlyMap<string, { readonly quantity: number; readonly value: number }>;
  /** All its pool valuations together, as positive amounts, or none when no unit had a known value (7.5). */
  readonly valuedTotal: { readonly quantity: number; readonly value: number } | null;
  /** What returns brought back into pools so far, all origins together (moving average, 7.5). */
  readonly returnedTotal: { quantity: number; value: number };
  /** The layers it took, in the order taken, under FIFO. */
  readonly layers: readonly {
    readonly originId: string | null;
    readonly layerId: string;
    readonly pieceId: string | null;
    readonly quantity: number;
    readonly value: number;
  }[];
  /** What returns brought back already: by origin, and by the sale's layer (FIFO). */
  readonly returned: Map<string, { quantity: number; value: number }>;
  readonly returnedFromLayer: Map<string, { quantity: number; value: number }>;
}

/** What the valuing state needs beyond the quantity state (13.1), read under the locks. */
export interface ValuingInputs extends WorkingInputs {
  readonly costSettings: ReadonlyMap<string, CostSetting>;
  readonly pools: readonly PoolState[];
  readonly transits: readonly TransitState[];
  readonly sales: readonly SaleState[];
  /**
   * The movements a reversal undoes or a piece correction corrects (7.5, 8.4): what each moved, by origin and by
   * layer, and what earlier reversals brought back (S1-F10-T06).
   */
  readonly reversed: readonly SaleState[];
  /** Per origin, the units its cost established put into pools or onto dispatches, less those reversed (7.5, 7.7). */
  readonly entered: ReadonlyMap<string, number>;
  /** Per origin, its units handed over to a supplier (moving average) (7.7 "where they went"). */
  readonly handedOver: ReadonlyMap<string, number>;
  /** Per origin, the FIFO layers of its lineage and their units handed over to a supplier (7.7). */
  readonly lineage: ReadonlyMap<string, { readonly layerIds: ReadonlySet<string>; readonly handedOver: number }>;
  readonly occurredAt: Date;
}

/** One layer's part of a valuation (14.2 `valuation_layer`): signed, out of the layer negative. */
export interface ValuationLayerEntry {
  readonly layerId: string;
  readonly pieceId: string | null;
  readonly quantity: number;
  readonly value: Paise;
}

/** One valued movement's effect on one pool or one transit value (7.10; 14.2 `valuation`). */
export interface ValuationEntry {
  readonly id: string;
  readonly movementId: string;
  /**
   * The one origin whose units the value belongs to; none only for a moving-average valuation of units of several
   * origins, of the kinds migration 0056 names (13.10).
   */
  readonly receiptOriginId: string | null;
  readonly poolId: string | null;
  readonly transitId: string | null;
  readonly formula: Formula;
  readonly sequence: number | null;
  readonly quantityDelta: number;
  readonly valueDelta: Paise;
  readonly quantityBefore: number;
  readonly valueBefore: Paise;
  readonly eventKind: string;
  readonly component: string;
  readonly scope: {
    readonly siteId: string | null;
    readonly storeId: string | null;
    readonly businessUnitId: string | null;
    readonly legalEntityId: string;
    readonly brandId: string | null;
  };
  readonly layers: ValuationLayerEntry[];
}

/** One amount Post is given: a component of a valued movement at one business unit (books-and-posting 8.1). */
export interface PostShare {
  readonly movementId: string;
  readonly businessUnitId: string;
  readonly eventKind: string;
  readonly component: string;
  readonly amount: Paise;
  readonly brandId: string | null;
}

/** Units taken from a balance, with the pieces named. */
export interface Moved {
  readonly balance: BalanceState;
  quantity: number;
  readonly pieces: PieceState[];
}

/** Units of one receipt origin an item moves. */
export interface OriginGroup {
  readonly origin: OriginState;
  quantity: number;
  readonly pieces: PieceState[];
}

/** An open question an item is `rule-not-set` for (13.8). */
export const SL = (question: string): MissingItem[] => [{ kind: 'open-question', question }];

/** The origin a moving-average valuation names: the one origin of its units, or none when they have several (13.10). */
export function onlyOrigin(groups: readonly { readonly origin: OriginState }[]): OriginState | null {
  return groups.length === 1 ? (groups[0]?.origin ?? null) : null;
}
