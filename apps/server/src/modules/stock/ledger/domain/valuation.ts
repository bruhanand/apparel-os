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
  readonly valueIn: number;
  quantityLeft: number;
  valueLeft: number;
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
  value: number;
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
  readonly value: number;
}

/** value × part ÷ whole, exactly, or undefined when that is not whole paise (7.10; SL-2). */
export function share(value: number, part: number, whole: number): number | undefined {
  if (whole <= 0) return undefined;
  if (part === whole) return value;
  const product = BigInt(value) * BigInt(part);
  if (product % BigInt(whole) !== 0n) return undefined;
  return Number(product / BigInt(whole));
}

export function newPool(
  facts: Omit<PoolState, 'isNew' | 'quantity' | 'value' | 'lastSequence' | 'changed' | 'layers'>,
) {
  return { ...facts, isNew: true, quantity: 0, value: 0, lastSequence: 0, changed: true, layers: [] } as PoolState;
}

/** The next posting sequence of a pool (7.10). */
export function nextSequence(pool: PoolState): number {
  pool.lastSequence += 1;
  pool.changed = true;
  return pool.lastSequence;
}

/**
 * Value enters a pool (7.3, 7.4): under moving average it joins the pool's quantity and value; under FIFO it makes a
 * new layer dated at that moment, in posting order, with its lineage. Answers the layer made, or null.
 */
export function enter(
  pool: PoolState,
  input: {
    readonly quantity: number;
    readonly value: number;
    readonly sequence: number;
    readonly at: Date;
    readonly newLayerId: () => string;
    readonly origin?: string | null;
    readonly fromLayerId?: string | null;
  },
): LayerState | null {
  pool.quantity += input.quantity;
  pool.value += input.value;
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

/** What a layer gives for `quantity` of its units: all it holds when they are all, else the exact share. */
function fromLayer(layer: { quantityLeft: number; valueLeft: number }, quantity: number): number | undefined {
  return share(layer.valueLeft, quantity, layer.quantityLeft);
}

/**
 * An outflow of `quantity` units at the formula cost (7.3 to 7.5, 7.10): under moving average value × q ÷ quantity;
 * under FIFO the oldest layers first, unit by unit for the pieces named. Changes the pool only when every share
 * divides; otherwise answers undefined and changes nothing (SL-2).
 */
export function issue(
  pool: PoolState,
  request: { readonly quantity: number; readonly pieceIds?: readonly string[] },
): Took[] | undefined {
  if (request.quantity <= 0 || request.quantity > pool.quantity) return undefined;
  if (pool.formula === 'moving-average') {
    const value = share(pool.value, request.quantity, pool.quantity);
    if (value === undefined) return undefined;
    pool.quantity -= request.quantity;
    pool.value -= value;
    pool.changed = true;
    return [{ layer: null, pieceId: null, quantity: request.quantity, value }];
  }
  // Worked out on copies first, so nothing changes when a share does not divide.
  const left = new Map(
    pool.layers.map((layer) => [layer, { quantityLeft: layer.quantityLeft, valueLeft: layer.valueLeft }]),
  );
  const ordered = [...pool.layers].sort((a, b) => a.enteredSequence - b.enteredSequence);
  const took: Took[] = [];
  const pieces = request.pieceIds ?? [];
  let wanted = request.quantity;
  for (const layer of ordered) {
    const state = left.get(layer);
    if (state === undefined) continue;
    while (wanted > 0 && state.quantityLeft > 0) {
      const units = pieces.length > 0 ? 1 : Math.min(wanted, state.quantityLeft);
      const value = fromLayer(state, units);
      if (value === undefined) return undefined;
      const pieceId = pieces.length > 0 ? (pieces[request.quantity - wanted] ?? null) : null;
      took.push({ layer, pieceId, quantity: units, value });
      state.quantityLeft -= units;
      state.valueLeft -= value;
      wanted -= units;
    }
    if (wanted === 0) break;
  }
  if (wanted > 0) return undefined;
  for (const [layer, state] of left) {
    if (layer.quantityLeft === state.quantityLeft) continue;
    layer.quantityLeft = state.quantityLeft;
    layer.valueLeft = state.valueLeft;
    layer.changed = true;
  }
  const total = took.reduce((sum, each) => sum + each.value, 0);
  pool.quantity -= request.quantity;
  pool.value -= total;
  pool.changed = true;
  return took;
}
