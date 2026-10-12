import { paise, type Paise } from '@apparel-os/domain';

// The cost formulas as plain rules (stock-ledger 7.3, 7.4, 7.10; PRD-LED-014, PRD-MOD-014; S1-F10-T03): a pool's
// quantity and value in integer paise, its FIFO layers, value entering and leaving in posting order. No database, no
// clock (code-house-rules 2). An amount becomes whole paise only when it divides exactly: no rounding rule is set
// (SL-2), so a share that does not divide is undefined and the item that needs it is refused (`rule-not-set`); an
// outflow that empties a pool or a layer takes all that is left and needs none (7.3, 7.10; G10a).

export type Formula = 'moving-average' | 'fifo';
export type PoolMode = 'book' | 'site';

/** One FIFO layer (7.4; 14.2 `cost_layer`), changed only under its pool's lock. */
export interface LayerState {
  readonly id: string;
  readonly isNew: boolean;
  readonly poolId: string;
  readonly enteredSequence: number;
  readonly enteredAt: Date;
  readonly quantityIn: number;
  readonly valueIn: Paise;
  quantityLeft: number;
  valueLeft: Paise;
  /** Lineage (7.4): the layer it came from, the receipt origin whose cost made it, the valuation that made it. */
  readonly fromLayerId: string | null;
  readonly receiptOriginId: string | null;
  fromValuationId: string | null;
  changed: boolean;
}

/** One cost pool (7.1; 14.2 `cost_pool`), locked at 10.3 step 6. */
export interface PoolState {
  readonly id: string;
  readonly isNew: boolean;
  readonly bookId: string;
  readonly skuId: string;
  readonly mode: PoolMode;
  readonly siteId: string | null;
  readonly formula: Formula;
  readonly costSettingVersionId: string;
  readonly legalEntityId: string;
  readonly brandId: string;
  quantity: number;
  value: Paise;
  lastSequence: number;
  changed: boolean;
  /** Under FIFO its layers, oldest first; none under moving average. */
  readonly layers: LayerState[];
}

/** What one outflow took (7.4 "Each outflow records which layers it took, unit by unit for piece-tracked goods"). */
export interface Took {
  readonly layer: LayerState | null;
  readonly pieceId: string | null;
  readonly quantity: number;
  readonly value: Paise;
}

/** value × part ÷ whole, exactly, or undefined when that is not whole paise (7.10; SL-2). */
export function share(value: Paise, part: number, whole: number): Paise | undefined {
  if (whole <= 0) return undefined;
  if (part === whole) return value;
  const product = BigInt(value) * BigInt(part);
  if (product % BigInt(whole) !== 0n) return undefined;
  return paise(Number(product / BigInt(whole)));
}

/** An amount with its sign turned, for a valuation out of a pool, a layer or a transit value. */
export function negate(value: Paise): Paise {
  return paise(0 - value);
}

/** The sum of amounts in whole paise (PRD-MOD-014). */
export function sumPaise(values: Iterable<number>): Paise {
  let total = 0;
  for (const value of values) total += value;
  return paise(total);
}

/** What a holding of units has left: a layer, a transit layer, what an outflow took from one layer (7.4). */
export interface Holding {
  readonly quantity: number;
  readonly value: Paise;
}

/** A part a walk takes from one holding. */
export interface TakenPart<H> {
  readonly from: H;
  readonly quantity: number;
  readonly value: Paise;
}

/**
 * The walk of 7.4 and 7.5: takes `quantity` units from the holdings in the order given (oldest first, or newest taken
 * first), each part at most what the holding has left and at its exact share of the value left, all of it when it
 * takes all (7.3, 7.10). Works on what `left` answers and changes nothing. Answers the parts in order, `short` when
 * the holdings hold too few, or `not-whole` when a share does not divide (SL-2).
 */
export function takeInOrder<H>(
  holdings: Iterable<H>,
  quantity: number,
  left: (holding: H) => Holding,
): TakenPart<H>[] | 'short' | 'not-whole' {
  const parts: TakenPart<H>[] = [];
  let wanted = quantity;
  for (const holding of holdings) {
    if (wanted === 0) break;
    const has = left(holding);
    const units = Math.min(wanted, has.quantity);
    if (units <= 0) continue;
    const value = share(has.value, units, has.quantity);
    if (value === undefined) return 'not-whole';
    parts.push({ from: holding, quantity: units, value });
    wanted -= units;
  }
  return wanted > 0 ? 'short' : parts;
}

export function newPool(
  facts: Omit<PoolState, 'isNew' | 'quantity' | 'value' | 'lastSequence' | 'changed' | 'layers'>,
): PoolState {
  return { ...facts, isNew: true, quantity: 0, value: paise(0), lastSequence: 0, changed: true, layers: [] };
}

/** The next posting sequence of a pool (7.10). */
export function nextSequence(pool: PoolState): number {
  pool.lastSequence += 1;
  pool.changed = true;
  return pool.lastSequence;
}

/** A pool's layers, oldest first (7.4). */
export function oldestFirst(pool: PoolState): LayerState[] {
  return [...pool.layers].sort((a, b) => a.enteredSequence - b.enteredSequence);
}

/**
 * Value enters a pool (7.3, 7.4): under moving average it joins the pool's quantity and value; under FIFO it makes a
 * new layer dated at that moment, in posting order, with its lineage. Answers the layer made, or null.
 */
export function enter(
  pool: PoolState,
  input: {
    readonly quantity: number;
    readonly value: Paise;
    readonly sequence: number;
    readonly at: Date;
    readonly newLayerId: () => string;
    readonly origin?: string | null;
    readonly fromLayerId?: string | null;
  },
): LayerState | null {
  pool.quantity += input.quantity;
  pool.value = paise(pool.value + input.value);
  pool.changed = true;
  if (pool.formula !== 'fifo') return null;
  const layer: LayerState = {
    id: input.newLayerId(),
    isNew: true,
    poolId: pool.id,
    enteredSequence: input.sequence,
    enteredAt: input.at,
    quantityIn: input.quantity,
    valueIn: input.value,
    quantityLeft: input.quantity,
    valueLeft: input.value,
    fromLayerId: input.fromLayerId ?? null,
    receiptOriginId: input.origin ?? null,
    fromValuationId: null,
    changed: true,
  };
  pool.layers.push(layer);
  return layer;
}

/**
 * What an outflow of `quantity` units would take at the formula cost (7.3 to 7.5, 7.10), changing nothing: under
 * moving average value × q ÷ quantity; under FIFO the oldest layers first, unit by unit for the pieces named.
 * Undefined when the pool holds too few or a share does not divide (SL-2). It is also the pool's current cost of the
 * units a reservation holds (13.10 "Value for approval"; product owner, 11 Oct 2026).
 */
export function quote(
  pool: PoolState,
  request: { readonly quantity: number; readonly pieceIds?: readonly string[] },
): Took[] | undefined {
  if (request.quantity <= 0 || request.quantity > pool.quantity) return undefined;
  if (pool.formula === 'moving-average') {
    const value = share(pool.value, request.quantity, pool.quantity);
    return value === undefined ? undefined : [{ layer: null, pieceId: null, quantity: request.quantity, value }];
  }
  const left = new Map<string, Holding>(
    pool.layers.map((layer) => [layer.id, { quantity: layer.quantityLeft, value: layer.valueLeft }]),
  );
  const has = (layer: LayerState): Holding => left.get(layer.id) ?? { quantity: 0, value: paise(0) };
  const ordered = oldestFirst(pool);
  const pieces = request.pieceIds ?? [];
  // A quantity in one walk; pieces unit by unit, each the exact share of what its layer has left (7.4).
  const walks =
    pieces.length === 0
      ? [{ pieceId: null, quantity: request.quantity }]
      : Array.from({ length: request.quantity }, (_, index) => ({ pieceId: pieces[index] ?? null, quantity: 1 }));
  const took: Took[] = [];
  for (const walk of walks) {
    const parts = takeInOrder(ordered, walk.quantity, has);
    if (typeof parts === 'string') return undefined;
    for (const part of parts) {
      const state = has(part.from);
      left.set(part.from.id, { quantity: state.quantity - part.quantity, value: paise(state.value - part.value) });
      took.push({ layer: part.from, pieceId: walk.pieceId, quantity: part.quantity, value: part.value });
    }
  }
  return took;
}

/**
 * An outflow of `quantity` units at the formula cost (7.3 to 7.5, 7.10): what `quote` answers, taken from the pool and
 * its layers. Changes the pool only when every share divides; otherwise answers undefined and changes nothing (SL-2).
 */
export function issue(
  pool: PoolState,
  request: { readonly quantity: number; readonly pieceIds?: readonly string[] },
): Took[] | undefined {
  const took = quote(pool, request);
  if (took === undefined) return undefined;
  for (const each of took) {
    if (each.layer === null) continue;
    each.layer.quantityLeft -= each.quantity;
    each.layer.valueLeft = paise(each.layer.valueLeft - each.value);
    each.layer.changed = true;
  }
  pool.quantity -= request.quantity;
  pool.value = paise(pool.value - sumPaise(took.map((each) => each.value)));
  pool.changed = true;
  return took;
}
