import { paise, type Paise } from '@apparel-os/domain';
import type { CostSetting } from '../../plan.js';
import type { UnitFacts } from '../../ports.js';
import { refuse, type Condition, type ItemValue, type Place } from '../request.js';
import {
  enter,
  negate,
  issue,
  nextSequence,
  sumPaise,
  takeInOrder,
  type Holding,
  type PoolState,
  type Took,
} from '../valuation.js';
import {
  Working,
  type BalanceState,
  type MovementEntry,
  type OriginState,
  type PieceState,
  type TransitKind,
} from '../working.js';
import {
  onlyOrigin,
  SL,
  type Moved,
  type OriginGroup,
  type PostShare,
  type SaleState,
  type TransitState,
  type ValuationEntry,
  type ValuationLayerEntry,
  type ValuingInputs,
} from './state.js';

// The valuing state's common part (stock-ledger 7, 13.1 "Recheck and value"; S1-F10-T03): what every valued item
// reads, records and moves. Value is worked out in posting order under the pool locks (7.10), every outflow at the
// formula cost (7.3 to 7.5), inflows that undo an outflow at the cost it left with (7.5). Pure: no database, no clock
// (code-house-rules 2). What it decides is written by Write, and the shares it collects are what Post is given
// (books-and-posting 8.1): the ledger writes no journal itself (DEC-087). The items themselves are in `cost.ts`,
// `transfer.ts`, `sale.ts` and `corrections.ts`.

/** One part of an outflow (7.5, 7.10): units of one origin, or under moving average of the item, and their value. */
export interface OutflowPart {
  readonly origin: OriginState | null;
  readonly quantity: number;
  readonly value: Paise;
  readonly took: Took[];
  readonly before: { readonly quantity: number; readonly value: Paise };
}

const NONE = paise(0);

export abstract class ValuingCore extends Working {
  readonly valuations: ValuationEntry[] = [];
  readonly shares: PostShare[] = [];
  readonly pools = new Map<string, PoolState>();
  readonly transits = new Map<string, TransitState>();
  /** What reservations the movements consumed, written as `consumed` events naming the movement (14.2). */
  readonly consumed: {
    readonly claimId: string;
    readonly reservationId: string;
    readonly kind: string;
    readonly quantity: number;
    readonly pieceId: string | null;
    readonly scope: BalanceState['scope'];
    readonly lineId: string;
    movementId?: string;
  }[] = [];
  protected readonly sales = new Map<string, SaleState>();
  protected readonly reversed = new Map<string, SaleState>();
  protected readonly valuing: ValuingInputs;

  constructor(inputs: ValuingInputs) {
    super(inputs);
    this.valuing = inputs;
    for (const pool of inputs.pools) this.pools.set(pool.id, pool);
    for (const transit of inputs.transits) this.transits.set(transit.id, transit);
    for (const sale of inputs.sales) this.sales.set(sale.id, sale);
    for (const moved of inputs.reversed) this.reversed.set(moved.id, moved);
  }

  // --- reading -----------------------------------------------------------------------------------------------------

  protected originBalances(origin: OriginState): BalanceState[] {
    return [...this.balances.values()].filter((row) => row.receiptOriginId === origin.id && row.quantity > 0);
  }

  /** An origin whose units enter and leave pools: owned by the Organisation, its cost established (7.2). */
  protected valued(origin: OriginState): boolean {
    return origin.ownerKind === 'organisation' && origin.valueKnown;
  }

  /**
   * An origin's P RATE and established value, which an origin whose cost is established always has (7.6; 14.2). A
   * missing one is a defect, never zero (PRD-MOD-015).
   */
  protected knownCost(origin: OriginState): { readonly pRate: Paise; readonly established: Paise } {
    if (!origin.valueKnown || origin.pRatePaise === null || origin.establishedValuePaise === null) {
      throw new Error(`Receipt origin ${origin.id} has no established cost`);
    }
    return { pRate: origin.pRatePaise, established: origin.establishedValuePaise };
  }

  protected setting(bookId: string): CostSetting {
    const setting = this.valuing.costSettings.get(bookId);
    if (setting === undefined) throw new Error(`No cost setting read for book ${bookId}`);
    return setting;
  }

  /** The open pool a unit's goods of a SKU are in (7.1), locked at step 6. */
  protected poolOf(lineId: string, unit: UnitFacts, skuId: string): PoolState {
    const pool = this.poolIfAny(unit, skuId);
    if (pool === undefined) refuse('plan-stale', lineId);
    return pool;
  }

  /** The open pool a unit's goods of a SKU are in, if one was read (7.1). */
  protected poolIfAny(unit: UnitFacts, skuId: string): PoolState | undefined {
    const setting = this.valuing.costSettings.get(unit.bookId);
    if (setting === undefined) return undefined;
    const siteId = setting.poolMode === 'site' ? unit.siteId : null;
    for (const pool of this.pools.values()) {
      if (pool.bookId === unit.bookId && pool.skuId === skuId && pool.siteId === siteId) return pool;
    }
    return undefined;
  }

  protected transitOf(kind: TransitKind, ref: string, bookId: string, skuId: string): TransitState | undefined {
    for (const transit of this.transits.values()) {
      if (transit.kind === kind && transit.ref === ref && transit.bookId === bookId && transit.skuId === skuId) {
        return transit;
      }
    }
    return undefined;
  }

  private poolScope(pool: PoolState): ValuationEntry['scope'] {
    return {
      siteId: pool.siteId,
      storeId: null,
      businessUnitId: null,
      legalEntityId: pool.legalEntityId,
      brandId: pool.brandId,
    };
  }

  /** The units moved, grouped by their receipt origin, in the order taken. */
  protected byOrigin(moved: readonly Moved[]): OriginGroup[] {
    const groups = new Map<string, OriginGroup>();
    for (const each of moved) {
      const origin = this.origins.get(each.balance.receiptOriginId);
      if (origin === undefined) throw new Error('origin not loaded');
      const group = groups.get(origin.id) ?? { origin, quantity: 0, pieces: [] };
      group.quantity += each.quantity;
      group.pieces.push(...each.pieces);
      groups.set(origin.id, group);
    }
    return [...groups.values()];
  }

  /** The value an item answers on its approval basis: known when every unit's value is (PRD-ACS-015, PRD-ACS-016). */
  protected itemValue(total: number, allKnown: boolean): ItemValue {
    return allKnown ? { kind: 'known', amountPaise: paise(Math.abs(total)) } : { kind: 'unknown' };
  }

  /**
   * The count whose freeze an item of the count names (8.1, 8.2): a count freeze not yet ended, at the item's unit.
   * Its own freeze does not stop it (recheck.ts); every other item in the scope is `count-freeze-active`.
   */
  protected countOf(lineId: string, countId: string, at: Place): void {
    const freeze = this.header(lineId, countId, 'hold');
    if (
      freeze.kind !== 'count-freeze' ||
      freeze.ended ||
      freeze.scope.siteId !== at.siteId ||
      freeze.scope.businessUnitId !== at.businessUnitId
    ) {
      refuse('invalid-item', lineId, [{ kind: 'count-freeze', holdId: countId }]);
    }
  }

  // --- recording ---------------------------------------------------------------------------------------------------

  /** Records one pool valuation in posting order (7.10), the pool already changed by `quantity` and `value`. */
  protected poolValuation(
    movement: MovementEntry,
    origin: OriginState | null,
    pool: PoolState,
    change: { readonly quantity: number; readonly value: Paise; readonly before: OutflowPart['before'] },
    names: { readonly eventKind: string; readonly component: string },
    layers: ValuationLayerEntry[] = [],
  ): ValuationEntry {
    const entry: ValuationEntry = {
      id: this.newId(),
      movementId: movement.id,
      receiptOriginId: origin?.id ?? null,
      poolId: pool.id,
      transitId: null,
      formula: pool.formula,
      sequence: nextSequence(pool),
      quantityDelta: change.quantity,
      valueDelta: change.value,
      quantityBefore: change.before.quantity,
      valueBefore: change.before.value,
      ...names,
      scope: this.poolScope(pool),
      layers,
    };
    this.valuations.push(entry);
    return entry;
  }

  /** Records one transit valuation and changes the transit value by it (7.8). */
  protected transitValuation(
    movement: MovementEntry,
    origin: OriginState | null,
    transit: TransitState,
    change: { readonly quantity: number; readonly value: Paise },
    names: { readonly eventKind: string; readonly component: string },
    layers: ValuationLayerEntry[] = [],
  ): void {
    this.valuations.push({
      id: this.newId(),
      movementId: movement.id,
      receiptOriginId: origin?.id ?? null,
      poolId: null,
      transitId: transit.id,
      formula: transit.formula,
      sequence: null,
      quantityDelta: change.quantity,
      valueDelta: change.value,
      quantityBefore: transit.quantity,
      valueBefore: transit.value,
      ...names,
      scope: transit.scope,
      layers,
    });
    transit.quantity += change.quantity;
    transit.value = paise(transit.value + change.value);
    transit.changed = true;
  }

  /** One amount Post is given (books-and-posting 8.1); none for zero. */
  protected postShare(
    movement: MovementEntry,
    businessUnitId: string,
    eventKind: string,
    component: string,
    amount: number,
  ): void {
    if (amount === 0) return;
    this.shares.push({
      movementId: movement.id,
      businessUnitId,
      eventKind,
      component,
      amount: paise(amount),
      brandId: movement.brandIds[0] ?? null,
    });
  }

  /** Adds units of one source layer to a transit value's layers (7.8). */
  protected addTransitLayer(
    transit: TransitState,
    sourceLayerId: string,
    order: number,
    quantity: number,
    value: Paise,
  ): void {
    const found = transit.layers.find((each) => each.sourceLayerId === sourceLayerId);
    if (found === undefined) {
      transit.layers.push({ id: this.newId(), isNew: true, sourceLayerId, order, quantity, value, changed: true });
    } else {
      found.quantity += quantity;
      found.value = paise(found.value + value);
      found.changed = true;
    }
  }

  // --- value in and out --------------------------------------------------------------------------------------------

  /** An outflow at the formula cost (7.5, 7.10), or `rule-not-set` when it does not divide (SL-2; G10a). */
  private issueAt(lineId: string, pool: PoolState, quantity: number, pieceIds: readonly string[]): Took[] {
    if (quantity > pool.quantity) throw new Error('A pool holds fewer valued units than its goods');
    const took = issue(pool, { quantity, ...(pieceIds.length > 0 ? { pieceIds } : {}) });
    if (took === undefined) refuse('rule-not-set', lineId, SL('SL-2'));
    return took;
  }

  /**
   * One outflow of an item's valued units at the formula cost (7.3 to 7.5, 7.10): the pool issues them together, so an
   * outflow that empties the pool takes all that is left, with no rounding (7.3). Under moving average that is one
   * valuation of the item, naming its origin only when it has one: the pool's value is one blend, and splitting it
   * between origins would need the rounding rule (SL-2), which 7.3 does not ask for; the legs name each origin's
   * units (13.10). Under FIFO the value is named per receipt origin (14.2): a piece's by the layer it took, a
   * quantity's in the order taken, the last part of each taking what remains of it. A part that does not divide is
   * `rule-not-set` (SL-2).
   */
  protected outflow(lineId: string, pool: PoolState, groups: readonly OriginGroup[]): OutflowPart[] {
    const quantity = groups.reduce((sum, group) => sum + group.quantity, 0);
    const pieceIds = groups.flatMap((group) => group.pieces.map((piece) => piece.id));
    let before = { quantity: pool.quantity, value: pool.value };
    const took = this.issueAt(lineId, pool, quantity, pieceIds);
    if (pool.formula === 'moving-average') {
      return [{ origin: onlyOrigin(groups), quantity, value: sumPaise(took.map((each) => each.value)), took, before }];
    }
    const left = new Map<Took, Holding>(took.map((each) => [each, { quantity: each.quantity, value: each.value }]));
    const has = (each: Took): Holding => left.get(each) ?? { quantity: 0, value: NONE };
    return groups.map((group) => {
      let parts: Took[];
      if (group.pieces.length > 0 && took.some((each) => each.pieceId !== null)) {
        parts = took.filter((each) => group.pieces.some((piece) => piece.id === each.pieceId));
      } else {
        const walked = takeInOrder(took, group.quantity, has);
        if (walked === 'not-whole') refuse('rule-not-set', lineId, SL('SL-2'));
        if (walked === 'short') throw new Error('An outflow took fewer units than its origins');
        parts = walked.map((part) => {
          const state = has(part.from);
          left.set(part.from, { quantity: state.quantity - part.quantity, value: paise(state.value - part.value) });
          return { layer: part.from.layer, pieceId: null, quantity: part.quantity, value: part.value };
        });
      }
      const value = sumPaise(parts.map((each) => each.value));
      const answer = { origin: group.origin, quantity: group.quantity, value, took: parts, before };
      before = { quantity: before.quantity - group.quantity, value: paise(before.value - value) };
      return answer;
    });
  }

  /**
   * The formula-cost outflow of the valued units of an item that ends custody (7.5): one pool valuation per part and
   * one share for Post; units of Unknown cost or not owned take none (7.2, 7.6).
   */
  protected valuedOutflow(
    lineId: string,
    movement: MovementEntry,
    unit: UnitFacts,
    skuId: string,
    groups: readonly OriginGroup[],
    eventKind: string,
  ): ItemValue {
    const valued = groups.filter((group) => this.valued(group.origin));
    let total = 0;
    if (valued.length > 0) {
      const pool = this.poolOf(lineId, unit, skuId);
      for (const part of this.outflow(lineId, pool, valued)) {
        this.poolValuation(
          movement,
          part.origin,
          pool,
          { quantity: -part.quantity, value: negate(part.value), before: part.before },
          { eventKind, component: 'cost' },
          this.layersOf(part.took),
        );
        total += part.value;
      }
      this.postShare(movement, unit.businessUnitId, eventKind, 'cost', total);
    }
    return this.itemValue(total, valued.length === groups.length);
  }

  /**
   * Units coming back into a FIFO pool from the layers they left (7.5, 7.8): one new layer per source layer, dated
   * now, with lineage to it; the valuation's layer rows keep each piece's part (7.4).
   */
  protected enterBySource(
    pool: PoolState,
    sequence: number,
    parts: readonly { fromLayerId: string | null; pieceId: string | null; quantity: number; value: Paise }[],
  ): ValuationLayerEntry[] {
    const bySource = new Map<string | null, (typeof parts)[number][]>();
    for (const part of parts) bySource.set(part.fromLayerId, [...(bySource.get(part.fromLayerId) ?? []), part]);
    return [...bySource].flatMap(([fromLayerId, group]) => {
      const layer = enter(pool, {
        quantity: group.reduce((sum, part) => sum + part.quantity, 0),
        value: sumPaise(group.map((part) => part.value)),
        sequence,
        at: this.valuing.occurredAt,
        newLayerId: this.newId,
        fromLayerId,
      });
      if (layer === null) return [];
      return group.map((part) => ({
        layerId: layer.id,
        pieceId: part.pieceId,
        quantity: part.quantity,
        value: part.value,
      }));
    });
  }

  /** Value entering a moving-average pool (7.3): it joins the pool's quantity and value. */
  protected enterAveraged(pool: PoolState, quantity: number, value: Paise): void {
    enter(pool, { quantity, value, sequence: 0, at: this.valuing.occurredAt, newLayerId: this.newId });
  }

  /** The layer rows of an outflow's takes, out of each layer (7.4). */
  protected layersOf(took: readonly Took[]): ValuationLayerEntry[] {
    return took.flatMap((each) =>
      each.layer === null
        ? []
        : [{ layerId: each.layer.id, pieceId: each.pieceId, quantity: each.quantity, value: negate(each.value) }],
    );
  }

  // --- moving units ------------------------------------------------------------------------------------------------

  /**
   * Units leave a balance and, unless they leave custody, arrive at another key: out and in legs per origin, pieces
   * following (2.2). Acceptance leaves with the units; it arrives only where `accept` says so (6.3).
   */
  protected moveTo(
    movement: MovementEntry,
    moved: readonly Moved[],
    to:
      | { readonly kind: 'gone' }
      | {
          readonly kind: 'place';
          readonly siteId: string;
          readonly businessUnitId: string;
          readonly locationId: string | null;
          readonly condition: Condition;
          readonly transit?: { readonly kind: TransitKind; readonly ref: string };
          readonly accept: boolean;
        },
  ): void {
    for (const { balance, quantity, pieces } of moved) {
      const origin = this.origins.get(balance.receiptOriginId);
      if (origin === undefined) throw new Error('origin not loaded');
      const accepted =
        pieces.length > 0
          ? Math.min(pieces.filter((piece) => piece.acceptedSiteId === balance.siteId).length, balance.accepted)
          : Math.min(quantity, balance.accepted);
      this.addTo(balance, -quantity, -accepted);
      movement.legs.push(this.leg('out', balance, quantity, accepted));
      for (const piece of pieces) {
        piece.lastMovementId = movement.id;
        piece.changed = true;
        movement.pieceIds.push(piece.id);
      }
      if (to.kind === 'gone') {
        for (const piece of pieces) piece.inCustody = false;
        continue;
      }
      const target = this.balanceFor(
        to.siteId,
        to.businessUnitId,
        to.locationId ?? '',
        to.condition,
        origin,
        to.transit,
      );
      const arriving = to.accept ? quantity : 0;
      this.addTo(target, quantity, arriving);
      movement.legs.push(this.leg('in', target, quantity, arriving));
      const unit = this.unit(to.siteId, to.businessUnitId);
      for (const piece of pieces) {
        piece.siteId = to.siteId;
        piece.businessUnitId = to.businessUnitId;
        piece.storeId = unit.storeId;
        piece.legalEntityId = unit.legalEntityId;
        piece.locationId = to.transit === undefined ? to.locationId : null;
        piece.condition = to.condition;
        piece.heldAs = to.transit === undefined ? 'custody' : 'in-transit';
        piece.transitKind = to.transit?.kind ?? null;
        piece.transitRef = to.transit?.ref ?? null;
        piece.inCustody = true;
        if (to.accept) piece.acceptedSiteId = to.siteId;
      }
    }
  }

  /** A piece back in custody at a place, held there, in the movement that brings it back (2.2). */
  protected backInCustody(piece: PieceState, at: Place, condition: Condition, movement: MovementEntry): void {
    const unit = this.unit(at.siteId, at.businessUnitId);
    piece.siteId = at.siteId;
    piece.businessUnitId = at.businessUnitId;
    piece.storeId = unit.storeId;
    piece.legalEntityId = unit.legalEntityId;
    piece.locationId = at.locationId;
    piece.condition = condition;
    piece.heldAs = 'custody';
    piece.transitKind = null;
    piece.transitRef = null;
    piece.inCustody = true;
    piece.lastMovementId = movement.id;
    piece.changed = true;
    movement.pieceIds.push(piece.id);
  }
}
