import { paise } from '@apparel-os/domain';
import type { MissingItem } from '../../../../kernel/index.js';
import type { CostSetting } from '../plan.js';
import type { UnitFacts } from '../ports.js';
import { reservableUnits, freeUnits } from './availability.js';
import { compareCodeUnits } from './keys.js';
import {
  refuse,
  type Condition,
  type Goods,
  type ItemValue,
  type LedgerItem,
  type Place,
  type ValuedItem,
} from './request.js';
import { enter, issue, nextSequence, share, type LayerState, type PoolState, type Took } from './valuation.js';
import {
  Working,
  type BalanceState,
  type MovementEntry,
  type OriginState,
  type PieceState,
  type Scope,
  type Touch,
  type TransitKind,
  type WorkingInputs,
} from './working.js';

// The valued items of stock-ledger 13.4 on the working state (7, 13.1 "Recheck and value"; S1-F10-T03): value is
// worked out in posting order under the pool locks (7.10), every outflow at the formula cost (7.3 to 7.5), inflows
// that undo an outflow at the cost it left with (7.5), value held on a dispatch or a supplier-return shipment between
// pools (7.8), cost established and late cost changes following their goods (7.6, 7.7). Pure: no database, no clock
// (code-house-rules 2). What it decides is written by Write, and the shares it collects are what Post is given
// (books-and-posting 8.1): the ledger writes no journal itself (DEC-087).

/** A transit value's FIFO layer: units of one source layer held on it (7.8; 14.2 `transit_value_layer`). */
export interface TransitLayerState {
  readonly id: string;
  readonly isNew: boolean;
  readonly sourceLayerId: string;
  /** The source layer's entry order, for oldest first. */
  readonly order: number;
  quantity: number;
  value: number;
  changed: boolean;
}

/** Value held on a dispatch between pools or a supplier-return shipment (7.8; 14.2 `transit_value`), locked at step 6. */
export interface TransitState {
  readonly id: string;
  readonly kind: TransitKind;
  readonly ref: string;
  readonly bookId: string;
  readonly skuId: string;
  readonly scope: Scope;
  quantity: number;
  value: number;
  changed: boolean;
  readonly layers: TransitLayerState[];
  /** For piece-tracked goods under FIFO: the source layer each piece on it took (7.4). */
  readonly pieceLayers: Map<string, string>;
}

/** A sale a customer return brings back (7.5): what it issued, by origin and by layer, and what came back since. */
export interface SaleState {
  readonly id: string;
  readonly siteId: string;
  readonly businessUnitId: string;
  /** Its out legs, in order, by origin. */
  readonly legs: readonly { readonly originId: string; readonly quantity: number }[];
  readonly pieceIds: ReadonlySet<string>;
  /** Its pool valuations by origin, as positive amounts (none when its value was Unknown). */
  readonly valued: ReadonlyMap<string, { readonly quantity: number; readonly value: number }>;
  /** The layers it took, in the order taken, under FIFO. */
  readonly layers: readonly {
    readonly originId: string;
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
  /** Per origin, the units its cost established put into pools or onto dispatches (7.7). */
  readonly entered: ReadonlyMap<string, number>;
  /** Per origin, its units handed over to a supplier (moving average) (7.7 "where they went"). */
  readonly handedOver: ReadonlyMap<string, number>;
  /** Per origin, the FIFO layers of its lineage and their units handed over to a supplier (7.7). */
  readonly lineage: ReadonlyMap<string, { readonly layerIds: ReadonlySet<string>; readonly handedOver: number }>;
  readonly occurredAt: Date;
}

/** One valued movement's effect on one pool or one transit value (7.10; 14.2 `valuation`). */
export interface ValuationEntry {
  readonly id: string;
  readonly movementId: string;
  readonly receiptOriginId: string;
  readonly poolId: string | null;
  readonly transitId: string | null;
  readonly sequence: number | null;
  readonly quantityDelta: number;
  readonly valueDelta: number;
  readonly quantityBefore: number;
  readonly valueBefore: number;
  readonly eventKind: string;
  readonly component: string;
  readonly scope: {
    readonly siteId: string | null;
    readonly storeId: string | null;
    readonly businessUnitId: string | null;
    readonly legalEntityId: string;
    readonly brandId: string | null;
  };
  readonly layers: {
    readonly layerId: string;
    readonly pieceId: string | null;
    readonly quantity: number;
    readonly value: number;
  }[];
}

/** One amount Post is given: a component of a valued movement at one business unit (books-and-posting 8.1). */
export interface PostShare {
  readonly movementId: string;
  readonly businessUnitId: string;
  readonly eventKind: string;
  readonly component: string;
  readonly amount: number;
  readonly brandId: string | null;
}

type ItemOf<K extends ValuedItem['kind']> = Extract<ValuedItem, { kind: K }>;

/** Units taken from a balance, with the pieces named. */
interface Moved {
  readonly balance: BalanceState;
  quantity: number;
  readonly pieces: PieceState[];
}

const SL = (question: string): MissingItem[] => [{ kind: 'open-question', question }];

export class Valuing extends Working {
  readonly valuations: ValuationEntry[] = [];
  readonly shares: PostShare[] = [];
  readonly pools = new Map<string, PoolState>();
  readonly transits = new Map<string, TransitState>();
  private readonly sales = new Map<string, SaleState>();
  private readonly valuing: ValuingInputs;

  constructor(inputs: ValuingInputs) {
    super(inputs);
    this.valuing = inputs;
    for (const pool of inputs.pools) this.pools.set(pool.id, pool);
    for (const transit of inputs.transits) this.transits.set(transit.id, transit);
    for (const sale of inputs.sales) this.sales.set(sale.id, sale);
  }

  protected override applyValued(item: LedgerItem): ItemValue {
    switch (item.kind) {
      case 'cost-established':
        return this.costEstablished(item);
      case 'cost-adjustment':
        return this.costAdjustment(item);
      case 'sale-issue':
        return this.saleIssue(item);
      case 'customer-return':
        return this.customerReturn(item);
      case 'dispatch':
      case 'supplier-return-departure':
        return this.depart(item);
      case 'arrival-count':
      case 'supplier-rejection-return':
      case 'supplier-handover':
        return this.leaveTransit(item);
      default:
        throw new Error(`Not a valued item: ${item.kind}`);
    }
  }

  /** What a valued item touches, for the count-freeze check (8.1): a late cost change waits until the count closes. */
  override touches(item: LedgerItem): Touch[] {
    const at = (siteId: string, businessUnitId: string, locationId: string | null, skuId: string): Touch[] => [
      ...(locationId === null ? [] : [{ siteId, businessUnitId, kind: 'location' as const, id: locationId }]),
      { siteId, businessUnitId, kind: 'sku', id: skuId },
      { siteId, businessUnitId, kind: 'brand', id: this.sku(skuId).brandId },
    ];
    switch (item.kind) {
      case 'sale-issue':
        return at(item.at.siteId, item.at.businessUnitId, item.at.locationId, item.goods.skuId);
      case 'dispatch':
      case 'supplier-return-departure':
        return at(item.from.siteId, item.from.businessUnitId, item.from.locationId, item.goods.skuId);
      case 'customer-return':
        return at(item.to.siteId, item.to.businessUnitId, item.to.locationId, item.goods.skuId);
      case 'arrival-count':
      case 'supplier-rejection-return':
        return [
          ...at(item.to.siteId, item.to.businessUnitId, item.to.locationId, item.goods.skuId),
          ...at(item.from.siteId, item.from.businessUnitId, null, item.goods.skuId),
        ];
      case 'supplier-handover':
        return at(item.from.siteId, item.from.businessUnitId, null, item.goods.skuId);
      case 'cost-adjustment': {
        const origin = this.origins.get(item.receiptOriginId);
        if (origin?.skuId == null) return [];
        const skuId = origin.skuId;
        return this.originBalances(origin).flatMap((row) => at(row.siteId, row.businessUnitId, null, skuId));
      }
      default:
        return super.touches(item);
    }
  }

  // --- reading ---------------------------------------------------------------------------------------------------

  private originBalances(origin: OriginState): BalanceState[] {
    return [...this.balances.values()].filter((row) => row.receiptOriginId === origin.id && row.quantity > 0);
  }

  /** An origin whose units enter and leave pools: owned by the Organisation, its cost established (7.2). */
  private valued(origin: OriginState): boolean {
    return origin.ownerKind === 'organisation' && origin.valueKnown;
  }

  private setting(bookId: string): CostSetting {
    const setting = this.valuing.costSettings.get(bookId);
    if (setting === undefined) throw new Error(`No cost setting read for book ${bookId}`);
    return setting;
  }

  /** The open pool a unit's goods of a SKU are in (7.1), locked at step 6. */
  private poolOf(lineId: string, unit: UnitFacts, skuId: string): PoolState {
    const siteId = this.setting(unit.bookId).poolMode === 'site' ? unit.siteId : null;
    for (const pool of this.pools.values()) {
      if (pool.bookId === unit.bookId && pool.skuId === skuId && pool.siteId === siteId) return pool;
    }
    refuse('plan-stale', lineId);
  }

  private transitOf(kind: TransitKind, ref: string, bookId: string, skuId: string): TransitState | undefined {
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

  // --- recording ---------------------------------------------------------------------------------------------------

  /** Records one pool valuation in posting order (7.10), the pool already changed by `quantity` and `value`. */
  private poolValuation(
    movement: MovementEntry,
    origin: OriginState,
    pool: PoolState,
    change: { readonly quantity: number; readonly value: number; readonly before: { quantity: number; value: number } },
    names: { readonly eventKind: string; readonly component: string },
    layers: ValuationEntry['layers'] = [],
  ): ValuationEntry {
    const entry: ValuationEntry = {
      id: this.newId(),
      movementId: movement.id,
      receiptOriginId: origin.id,
      poolId: pool.id,
      transitId: null,
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
  private transitValuation(
    movement: MovementEntry,
    origin: OriginState,
    transit: TransitState,
    change: { readonly quantity: number; readonly value: number },
    names: { readonly eventKind: string; readonly component: string },
    layers: ValuationEntry['layers'] = [],
  ): void {
    this.valuations.push({
      id: this.newId(),
      movementId: movement.id,
      receiptOriginId: origin.id,
      poolId: null,
      transitId: transit.id,
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
    transit.value += change.value;
    transit.changed = true;
  }

  private share(movement: MovementEntry, businessUnitId: string, eventKind: string, component: string, amount: number) {
    if (amount === 0) return;
    this.shares.push({
      movementId: movement.id,
      businessUnitId,
      eventKind,
      component,
      amount,
      brandId: movement.brandIds[0] ?? null,
    });
  }

  /** An outflow at the formula cost (7.5, 7.10), or `rule-not-set` when it does not divide (SL-2; G10a). */
  private issueAt(lineId: string, pool: PoolState, quantity: number, pieceIds: readonly string[]): Took[] {
    if (quantity > pool.quantity) throw new Error('A pool holds fewer valued units than its goods');
    const took = issue(pool, { quantity, ...(pieceIds.length > 0 ? { pieceIds } : {}) });
    if (took === undefined) refuse('rule-not-set', lineId, SL('SL-2'));
    return took;
  }

  /**
   * One outflow of an item's valued units at the formula cost (7.3 to 7.5, 7.10): the pool issues them together, so an
   * outflow that empties the pool takes all that is left; its value is then named per receipt origin, as each
   * valuation names one (14.2): a piece's by the layer it took, a quantity's in the order taken, the last part of each
   * taking what remains of it. A part that does not divide is `rule-not-set` (SL-2).
   */
  private outflow(
    lineId: string,
    pool: PoolState,
    groups: readonly { origin: OriginState; quantity: number; pieces: PieceState[] }[],
  ): {
    origin: OriginState;
    quantity: number;
    value: number;
    took: Took[];
    before: { quantity: number; value: number };
  }[] {
    const quantity = groups.reduce((sum, group) => sum + group.quantity, 0);
    const pieceIds = groups.flatMap((group) => group.pieces.map((piece) => piece.id));
    let before = { quantity: pool.quantity, value: pool.value };
    const took = this.issueAt(lineId, pool, quantity, pieceIds);
    const queue = took.map((each) => ({ ...each, left: each.quantity, valueLeft: each.value }));
    return groups.map((group) => {
      const parts: Took[] = [];
      if (group.pieces.length > 0 && took.some((each) => each.pieceId !== null)) {
        parts.push(...took.filter((each) => group.pieces.some((piece) => piece.id === each.pieceId)));
      } else {
        let need = group.quantity;
        for (const entry of queue) {
          if (need === 0) break;
          if (entry.left === 0) continue;
          const part = Math.min(need, entry.left);
          const value = part === entry.left ? entry.valueLeft : share(entry.valueLeft, part, entry.left);
          if (value === undefined) refuse('rule-not-set', lineId, SL('SL-2'));
          entry.left -= part;
          entry.valueLeft -= value;
          parts.push({ layer: entry.layer, pieceId: null, quantity: part, value });
          need -= part;
        }
      }
      const value = parts.reduce((sum, each) => sum + each.value, 0);
      const answer = { origin: group.origin, quantity: group.quantity, value, took: parts, before };
      before = { quantity: before.quantity - group.quantity, value: before.value - value };
      return answer;
    });
  }

  private layersOf(took: readonly Took[]): ValuationEntry['layers'] {
    return took.flatMap((each) =>
      each.layer === null
        ? []
        : [{ layerId: each.layer.id, pieceId: each.pieceId, quantity: each.quantity, value: -each.value }],
    );
  }

  /** The units moved, grouped by their receipt origin, in the order taken. */
  private byOrigin(moved: readonly Moved[]): { origin: OriginState; quantity: number; pieces: PieceState[] }[] {
    const groups = new Map<string, { origin: OriginState; quantity: number; pieces: PieceState[] }>();
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
  private itemValue(total: number, allKnown: boolean): ItemValue {
    return allKnown ? { kind: 'known', amountPaise: paise(Math.abs(total)) } : { kind: 'unknown' };
  }

  // --- moving units ------------------------------------------------------------------------------------------------

  /**
   * Units leave a balance and, unless they leave custody, arrive at another key: out and in legs per origin, pieces
   * following (2.2). Acceptance leaves with the units; it arrives only where `accept` says so (6.3).
   */
  private moveTo(
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

  /**
   * The units a reservation holds at a place, taken by the movement that consumes it (6.1, 13.5 "End reservation"):
   * pieces the reservation names, or a quantity from its claims there, oldest first. Units a hold sits on inside the
   * reservation are `held` (6.2; PRD-TRF-007); units it does not hold are `exceeds-source`.
   */
  private takeReserved(lineId: string, reservationId: string, place: Place, goods: Goods): Moved[] {
    const claims = this.activeClaims((claim) => claim.owner === 'reservation' && claim.headerId === reservationId);
    const moved = new Map<string, Moved>();
    const consume = (
      claim: (typeof claims)[number],
      balance: BalanceState,
      quantity: number,
      piece: PieceState | null,
    ) => {
      if (this.heldInside(claim) || (piece !== null && this.pieceClaims(piece).some((each) => each.owner === 'hold'))) {
        refuse('held', lineId);
      }
      claim.quantity -= quantity;
      claim.changed = true;
      this.consumed.push({
        claimId: claim.id,
        reservationId,
        kind: claim.headerKind,
        quantity,
        pieceId: piece?.id ?? null,
        scope: claim.scope,
        lineId,
      });
      const entry = moved.get(balance.id) ?? { balance, quantity: 0, pieces: [] };
      entry.quantity += quantity;
      if (piece !== null) entry.pieces.push(piece);
      moved.set(balance.id, entry);
    };
    if (this.sku(goods.skuId).pieceTracked) {
      for (const code of goods.pieceCodes ?? []) {
        const piece = this.piece(lineId, code);
        if (
          !piece.inCustody ||
          piece.heldAs !== 'custody' ||
          piece.siteId !== place.siteId ||
          piece.businessUnitId !== place.businessUnitId ||
          piece.locationId !== place.locationId
        ) {
          refuse('piece-not-at-place', lineId, [{ kind: 'piece', code }]);
        }
        const claim = claims.find((each) => each.pieceId === piece.id);
        if (claim === undefined) refuse('exceeds-source', lineId, [{ kind: 'piece', code }]);
        const origin = this.origin(lineId, piece.receiptOriginId);
        const balance = this.balanceFor(place.siteId, place.businessUnitId, place.locationId, piece.condition, origin);
        consume(claim, balance, 1, piece);
        this.hidden.pieces.push({ line: this.line, pieceId: piece.id });
      }
      return [...moved.values()];
    }
    let left = goods.quantity;
    const at = claims
      .map((claim) => ({ claim, balance: claim.balanceId === null ? undefined : this.balances.get(claim.balanceId) }))
      .filter(
        (each): each is { claim: (typeof claims)[number]; balance: BalanceState } =>
          each.balance?.siteId === place.siteId &&
          each.balance.businessUnitId === place.businessUnitId &&
          each.balance.locationId === place.locationId &&
          each.balance.skuId === goods.skuId &&
          (goods.receiptOriginId === undefined || each.balance.receiptOriginId === goods.receiptOriginId),
      )
      .sort(
        (a, b) =>
          compareCodeUnits(a.balance.expiryDate ?? '9999-12-31', b.balance.expiryDate ?? '9999-12-31') ||
          compareCodeUnits(a.balance.countDate, b.balance.countDate) ||
          compareCodeUnits(a.claim.id, b.claim.id),
      );
    for (const { claim, balance } of at) {
      if (left === 0) break;
      const take = Math.min(left, claim.quantity);
      consume(claim, balance, take, null);
      left -= take;
    }
    if (left > 0) refuse('exceeds-source', lineId, [{ kind: 'reservation', reservationId }]);
    return [...moved.values()];
  }

  /** What reservations the movements consumed, written as `consumed` events naming the movement (14.2). */
  readonly consumed: {
    readonly claimId: string;
    readonly reservationId: string;
    readonly kind: string;
    readonly quantity: number;
    readonly pieceId: string | null;
    readonly scope: Scope;
    readonly lineId: string;
    movementId?: string;
  }[] = [];

  /** Units in transit on a dispatch or shipment at its source unit: the pieces named, or a quantity oldest first. */
  private takeTransit(
    lineId: string,
    from: { readonly siteId: string; readonly businessUnitId: string },
    transit: { readonly kind: TransitKind; readonly ref: string },
    goods: Goods,
  ): Moved[] {
    const inTransit = (row: { heldAs: string; transitKind: string | null; transitRef: string | null }) =>
      row.heldAs === 'in-transit' && row.transitKind === transit.kind && row.transitRef === transit.ref;
    if (this.sku(goods.skuId).pieceTracked) {
      const moved = new Map<string, Moved>();
      for (const code of goods.pieceCodes ?? []) {
        const piece = this.piece(lineId, code);
        if (
          !piece.inCustody ||
          !inTransit(piece) ||
          piece.siteId !== from.siteId ||
          piece.businessUnitId !== from.businessUnitId
        ) {
          refuse('piece-not-at-place', lineId, [{ kind: 'piece', code }]);
        }
        const origin = this.origin(lineId, piece.receiptOriginId);
        const balance = this.balanceFor(from.siteId, from.businessUnitId, '', piece.condition, origin, transit);
        const entry = moved.get(balance.id) ?? { balance, quantity: 0, pieces: [] };
        entry.quantity += 1;
        entry.pieces.push(piece);
        moved.set(balance.id, entry);
        this.hidden.pieces.push({ line: this.line, pieceId: piece.id });
      }
      return [...moved.values()];
    }
    const candidates = [...this.balances.values()]
      .filter(
        (row) =>
          inTransit(row) &&
          row.siteId === from.siteId &&
          row.businessUnitId === from.businessUnitId &&
          row.skuId === goods.skuId &&
          row.quantity > 0 &&
          (goods.receiptOriginId === undefined || row.receiptOriginId === goods.receiptOriginId),
      )
      .sort((a, b) => compareCodeUnits(a.countDate, b.countDate) || compareCodeUnits(a.id, b.id));
    let left = goods.quantity;
    const moved: Moved[] = [];
    for (const balance of candidates) {
      if (left === 0) break;
      const take = Math.min(left, balance.quantity);
      moved.push({ balance, quantity: take, pieces: [] });
      left -= take;
    }
    if (left > 0)
      refuse('exceeds-source', lineId, [{ kind: 'transit', transitKind: transit.kind, transitRef: transit.ref }]);
    return moved;
  }

  // --- the valued items (13.4) ------------------------------------------------------------------------------------

  /**
   * Cost established (7.6, 13.4; PRD-PTW-010, PRD-REC-017): the covering revision's P RATE gives the origin its cost.
   * Owned units in custody enter the pool that holds them, and units in transit between pools go onto the dispatch;
   * a supplier-owned origin records its cost only (7.2; PRD-ORG-015). The origin must still be Unknown and covered by
   * the revision, recorded earlier or in the same request.
   */
  private costEstablished(item: ItemOf<'cost-established'>): ItemValue {
    const origin = this.origin(item.lineId, item.receiptOriginId);
    if (origin.valueKnown)
      refuse('exceeds-source', item.lineId, [{ kind: 'cost-established', receiptOriginId: origin.id }]);
    if (origin.ptRevisionId !== item.ptRevisionId) {
      refuse('not-covered', item.lineId, [{ kind: 'receipt-origin', receiptOriginId: origin.id }]);
    }
    if (!Number.isSafeInteger(item.pRatePaise) || item.pRatePaise < 0)
      refuse('invalid-item', item.lineId, [{ kind: 'p-rate' }]);
    if (origin.ownerKind === null) refuse('invalid-item', item.lineId, [{ kind: 'owner' }]);
    const skuId = origin.skuId ?? '';
    const movement = this.newMovement(
      'cost-established',
      item.lineId,
      origin.scope.siteId,
      origin.scope.businessUnitId,
      [skuId],
    );
    origin.valueKnown = true;
    origin.pRatePaise = item.pRatePaise;
    origin.establishedValuePaise = 0;
    origin.lastStateMovementId = movement.id;
    origin.stateChanged = true;
    if (origin.ownerKind !== 'organisation') return { kind: 'none' };
    const kind = 'stock.cost-established';
    const own = this.unit(origin.scope.siteId, origin.scope.businessUnitId);
    const toPools = new Map<PoolState, { quantity: number; units: Map<string, number> }>();
    let total = 0;
    for (const row of this.originBalances(origin)) {
      const unit = this.unit(row.siteId, row.businessUnitId);
      const value = item.pRatePaise * row.quantity;
      if (row.transitKind === 'return-shipment') continue;
      const transit =
        row.transitKind === 'dispatch' && row.transitRef !== null
          ? this.transitOf('dispatch', row.transitRef, unit.bookId, skuId)
          : undefined;
      total += value;
      if (transit !== undefined) {
        // Units in transit between pools: the dispatch takes the value (7.6). Under FIFO a layer records its lineage.
        const source = this.poolOf(item.lineId, unit, skuId);
        const layers: ValuationEntry['layers'] = [];
        if (source.formula === 'fifo') {
          const layer = this.passingLayer(source, origin, row.quantity, value);
          this.addTransitLayer(transit, layer.id, layer.enteredSequence, row.quantity, value);
          layers.push({ layerId: layer.id, pieceId: null, quantity: row.quantity, value });
        }
        this.transitValuation(
          movement,
          origin,
          transit,
          { quantity: row.quantity, value },
          { eventKind: kind, component: 'to-dispatch' },
          layers,
        );
        this.share(movement, transit.scope.businessUnitId, kind, 'to-dispatch', value);
        continue;
      }
      const pool = this.poolOf(item.lineId, unit, skuId);
      const into = toPools.get(pool) ?? { quantity: 0, units: new Map<string, number>() };
      into.quantity += row.quantity;
      const shareUnit = pool.mode === 'book' ? own.businessUnitId : row.businessUnitId;
      into.units.set(shareUnit, (into.units.get(shareUnit) ?? 0) + value);
      toPools.set(pool, into);
    }
    for (const [pool, into] of toPools) {
      const value = item.pRatePaise * into.quantity;
      const before = { quantity: pool.quantity, value: pool.value };
      const sequence = pool.lastSequence + 1;
      const layer = enter(pool, {
        quantity: into.quantity,
        value,
        sequence,
        at: this.valuing.occurredAt,
        newLayerId: this.newId,
        origin: origin.id,
      });
      const entry = this.poolValuation(
        movement,
        origin,
        pool,
        { quantity: into.quantity, value, before },
        { eventKind: kind, component: 'to-pool' },
        layer === null ? [] : [{ layerId: layer.id, pieceId: null, quantity: into.quantity, value }],
      );
      if (layer !== null) layer.fromValuationId = entry.id;
      for (const [unitId, amount] of into.units) this.share(movement, unitId, kind, 'to-pool', amount);
    }
    origin.establishedValuePaise = total;
    return { kind: 'known', amountPaise: paise(total) };
  }

  /** A FIFO layer whose units pass straight onto a dispatch, so the transit value keeps their lineage (7.4, 7.6). */
  private passingLayer(pool: PoolState, origin: OriginState, quantity: number, value: number): LayerState {
    const layer: LayerState = {
      id: this.newId(),
      isNew: true,
      poolId: pool.id,
      enteredSequence: nextSequence(pool),
      enteredAt: this.valuing.occurredAt,
      quantityIn: quantity,
      valueIn: value,
      quantityLeft: 0,
      valueLeft: 0,
      fromLayerId: null,
      receiptOriginId: origin.id,
      fromValuationId: null,
      changed: true,
    };
    pool.layers.push(layer);
    return layer;
  }

  private addTransitLayer(
    transit: TransitState,
    sourceLayerId: string,
    order: number,
    quantity: number,
    value: number,
  ) {
    const found = transit.layers.find((each) => each.sourceLayerId === sourceLayerId);
    if (found === undefined) {
      transit.layers.push({ id: this.newId(), isNew: true, sourceLayerId, order, quantity, value, changed: true });
    } else {
      found.quantity += quantity;
      found.value += value;
      found.changed = true;
    }
  }

  /**
   * Cost adjustment (7.7, 13.4; PRD-LED-006, PRD-LED-016): the change, shared equally among the units the origin's
   * cost put into pools, follows its goods. Moving average: through the origin's own units; FIFO: through its cost
   * layer's lineage. Units still held change the pool or dispatch that holds them; units gone carry their share to
   * where they went: cost of goods sold, or the supplier claim. A pool never falls below zero: the excess goes with the
   * share for units gone, or to cost of goods sold as its own line when none are gone. A share that does not divide is
   * `rule-not-set` (SL-2).
   */
  private costAdjustment(item: ItemOf<'cost-adjustment'>): ItemValue {
    const origin = this.origin(item.lineId, item.receiptOriginId);
    if (!origin.valueKnown)
      refuse('invalid-item', item.lineId, [{ kind: 'cost-not-established', receiptOriginId: origin.id }]);
    if (!Number.isSafeInteger(item.amountPaise)) refuse('invalid-item', item.lineId, [{ kind: 'amount' }]);
    const skuId = origin.skuId ?? '';
    const movement = this.newMovement(
      'cost-adjustment',
      item.lineId,
      origin.scope.siteId,
      origin.scope.businessUnitId,
      [skuId],
    );
    origin.establishedValuePaise = (origin.establishedValuePaise ?? 0) + item.amountPaise;
    origin.lastStateMovementId = movement.id;
    origin.stateChanged = true;
    const entered = this.valuing.entered.get(origin.id) ?? 0;
    if (origin.ownerKind !== 'organisation' || entered === 0) return { kind: 'none' };
    const perUnit = share(item.amountPaise, 1, entered);
    if (perUnit === undefined) refuse('rule-not-set', item.lineId, SL('SL-2'));
    const kind = 'stock.cost-adjustment';
    const own = this.unit(origin.scope.siteId, origin.scope.businessUnitId);
    const poolDeltas = new Map<
      PoolState,
      { layers: Map<LayerState, number>; units: Map<string, number>; value: number }
    >();
    const addToPool = (pool: PoolState, unitId: string, value: number, layer?: LayerState) => {
      const delta = poolDeltas.get(pool) ?? {
        layers: new Map<LayerState, number>(),
        units: new Map<string, number>(),
        value: 0,
      };
      delta.value += value;
      const shareUnit = pool.mode === 'book' ? own.businessUnitId : unitId;
      delta.units.set(shareUnit, (delta.units.get(shareUnit) ?? 0) + value);
      if (layer !== undefined) delta.layers.set(layer, (delta.layers.get(layer) ?? 0) + value);
      poolDeltas.set(pool, delta);
    };
    const transitDeltas = new Map<TransitState, { value: number; layers: Map<string, number> }>();
    const addToTransit = (transit: TransitState, value: number, sourceLayerId?: string) => {
      const delta = transitDeltas.get(transit) ?? { value: 0, layers: new Map<string, number>() };
      delta.value += value;
      if (sourceLayerId !== undefined) delta.layers.set(sourceLayerId, (delta.layers.get(sourceLayerId) ?? 0) + value);
      transitDeltas.set(transit, delta);
    };
    let held = 0;
    let claimUnits = 0;
    if (this.setting(own.bookId).formula === 'moving-average') {
      for (const row of this.originBalances(origin)) {
        const unit = this.unit(row.siteId, row.businessUnitId);
        const value = perUnit * row.quantity;
        if (row.transitKind === 'return-shipment') {
          claimUnits += row.quantity;
          continue;
        }
        held += row.quantity;
        const transit =
          row.transitKind === 'dispatch' && row.transitRef !== null
            ? this.transitOf('dispatch', row.transitRef, unit.bookId, skuId)
            : undefined;
        if (transit !== undefined) addToTransit(transit, value);
        else addToPool(this.poolOf(item.lineId, unit, skuId), row.businessUnitId, value);
      }
      claimUnits += this.valuing.handedOver.get(origin.id) ?? 0;
    } else {
      const lineage = this.valuing.lineage.get(origin.id);
      const layerIds = lineage?.layerIds ?? new Set<string>();
      for (const pool of this.pools.values()) {
        for (const layer of pool.layers) {
          if (!layerIds.has(layer.id) || layer.quantityLeft === 0) continue;
          held += layer.quantityLeft;
          addToPool(pool, this.unitAtSite(origin, pool, own), perUnit * layer.quantityLeft, layer);
        }
      }
      for (const transit of this.transits.values()) {
        for (const layer of transit.layers) {
          if (!layerIds.has(layer.sourceLayerId) || layer.quantity === 0) continue;
          if (transit.kind === 'return-shipment') {
            claimUnits += layer.quantity;
            continue;
          }
          held += layer.quantity;
          addToTransit(transit, perUnit * layer.quantity, layer.sourceLayerId);
        }
      }
      claimUnits += lineage?.handedOver ?? 0;
    }
    const goneUnits = Math.max(0, entered - held - claimUnits);
    let toCogs = perUnit * goneUnits;
    let toClaim = perUnit * claimUnits;
    let excess = 0;
    // A pool, a layer or a transit value never falls below zero (7.7; PRD-LED-016, DEC-034).
    const clamp = (left: number, delta: number) => (left + delta < 0 ? -left : delta);
    for (const [pool, delta] of poolDeltas) {
      let applied = 0;
      if (pool.formula === 'fifo') {
        for (const [layer, value] of delta.layers) {
          const change = clamp(layer.valueLeft, value);
          excess += value - change;
          layer.valueLeft += change;
          layer.changed = true;
          delta.layers.set(layer, change);
          applied += change;
        }
      } else applied = clamp(pool.value, delta.value);
      if (pool.formula !== 'fifo') excess += delta.value - applied;
      const before = { quantity: pool.quantity, value: pool.value };
      pool.value += applied;
      pool.changed = true;
      this.poolValuation(
        movement,
        origin,
        pool,
        { quantity: 0, value: applied, before },
        { eventKind: kind, component: 'to-pool' },
        [...delta.layers].map(([layer, value]) => ({
          layerId: layer.id,
          pieceId: null,
          quantity: layer.quantityLeft,
          value,
        })),
      );
      // The units' shares, less what was held back, go to the units where the value lies.
      const shortfall = delta.value - applied;
      let first = true;
      for (const [unitId, amount] of delta.units) {
        this.share(movement, unitId, kind, 'to-pool', first ? amount - shortfall : amount);
        first = false;
      }
    }
    for (const [transit, delta] of transitDeltas) {
      const applied = clamp(transit.value, delta.value);
      excess += delta.value - applied;
      for (const layer of transit.layers) {
        const value = delta.layers.get(layer.sourceLayerId);
        if (value === undefined) continue;
        layer.value += value;
        layer.changed = true;
      }
      this.transitValuation(
        movement,
        origin,
        transit,
        { quantity: 0, value: applied },
        { eventKind: kind, component: 'to-dispatch' },
      );
      this.share(movement, transit.scope.businessUnitId, kind, 'to-dispatch', applied);
    }
    // The excess goes with the share for units gone; when none are gone, to cost of goods sold as its own line.
    if (excess !== 0) {
      if (goneUnits > 0) toCogs += excess;
      else if (claimUnits > 0) toClaim += excess;
      else this.share(movement, own.businessUnitId, kind, 'excess-to-cogs', excess);
    }
    this.share(movement, own.businessUnitId, kind, 'to-cogs', toCogs);
    this.share(movement, own.businessUnitId, kind, 'to-supplier-claim', toClaim);
    return { kind: 'known', amountPaise: paise(Math.abs(item.amountPaise)) };
  }

  /**
   * The unit a FIFO layer's share posts for: in a book pool the movement's own unit (books-and-posting 3.2); in a Site
   * pool the unit at that Site holding the origin's units, else any unit there holding the SKU, else the movement's.
   */
  private unitAtSite(origin: OriginState, pool: PoolState, own: UnitFacts): string {
    if (pool.siteId === null || pool.siteId === own.siteId) return own.businessUnitId;
    const at = (rows: BalanceState[]) =>
      rows
        .filter((row) => row.siteId === pool.siteId && row.heldAs === 'custody' && row.quantity > 0)
        .map((row) => row.businessUnitId)
        .sort(compareCodeUnits)[0];
    return (
      at(this.originBalances(origin)) ??
      at([...this.balances.values()].filter((row) => row.skuId === pool.skuId)) ??
      own.businessUnitId
    );
  }

  /**
   * Sale issue (6.3, 7.5, 13.4; PRD-STK-003, PRD-POS-018): custody leaves at handover, of units sellable at the Store:
   * in custody there, good, covered, accepted, free of holds and reservations; value leaves the pool at the formula
   * cost. Billed-retained value timing is `rule-not-set` (SL-17); a supplier-owned unit's pass-through at its agreed
   * cost is `rule-not-set` until G6 brings its agreed cost (SL-4).
   */
  private saleIssue(item: ItemOf<'sale-issue'>): ItemValue {
    this.checkGoodsShape(item.lineId, item.goods);
    if (item.handover === 'billed-retained') refuse('rule-not-set', item.lineId, SL('SL-17'));
    const unit = this.unit(item.at.siteId, item.at.businessUnitId);
    if (unit.storeId === null) refuse('not-sellable', item.lineId, [{ kind: 'condition', condition: 'store' }]);
    const sku = this.sku(item.goods.skuId);
    if (sku.pieceTracked) {
      for (const code of item.goods.pieceCodes ?? []) {
        const piece = this.piece(item.lineId, code);
        if (piece.ptRevisionId === null)
          refuse('not-sellable', item.lineId, [{ kind: 'condition', condition: 'covered', code }]);
        if (piece.acceptedSiteId !== item.at.siteId) {
          refuse('not-sellable', item.lineId, [{ kind: 'condition', condition: 'accepted', code }]);
        }
      }
    } else {
      const candidates = this.balancesAt(item.at, 'good', item.goods);
      const sum = (units: (row: BalanceState) => number) => candidates.reduce((total, row) => total + units(row), 0);
      const free = sum((row) => freeUnits(this.claimsOn(row)));
      const sellable = sum((row) => reservableUnits(this.claimsOn(row), this.coverOf(row)));
      if (item.goods.quantity <= free && item.goods.quantity > sellable) {
        refuse('not-sellable', item.lineId, [{ kind: 'condition', condition: 'covered-and-accepted' }]);
      }
    }
    const taken = this.take(item.lineId, item.at, 'good', item.goods, {
      ...(sku.pieceTracked
        ? {}
        : { fits: (row: BalanceState) => reservableUnits(this.claimsOn(row), this.coverOf(row)) }),
    });
    const moved: Moved[] = taken.map((each) => ({
      balance: each.balance,
      quantity: each.quantity,
      pieces: each.pieces,
    }));
    const groups = this.byOrigin(moved);
    for (const group of groups) {
      if (group.origin.ownerKind === 'supplier' || group.origin.ownerKind === 'brand') {
        refuse('rule-not-set', item.lineId, SL('SL-4'));
      }
    }
    const movement = this.newMovement('sale-issue', item.lineId, item.at.siteId, item.at.businessUnitId, [
      item.goods.skuId,
    ]);
    this.moveTo(movement, moved, { kind: 'gone' });
    let total = 0;
    const valued = groups.filter((group) => this.valued(group.origin));
    if (valued.length > 0) {
      const pool = this.poolOf(item.lineId, unit, item.goods.skuId);
      for (const part of this.outflow(item.lineId, pool, valued)) {
        this.poolValuation(
          movement,
          part.origin,
          pool,
          { quantity: -part.quantity, value: -part.value, before: part.before },
          { eventKind: 'stock.sale-issue', component: 'cost' },
          this.layersOf(part.took),
        );
        total += part.value;
      }
      this.share(movement, unit.businessUnitId, 'stock.sale-issue', 'cost', total);
    }
    return this.itemValue(total, valued.length === groups.length);
  }

  /**
   * Customer return (7.5, 13.4; PRD-RET-013, PRD-LED-017, PRD-INT-005): custody back after physical acceptance, within
   * what the sale issued and was not yet returned, at the cost its sale issued: under FIFO a new layer at that cost,
   * dated at the return, with lineage to the layer the sale took, the piece's own for piece-tracked goods and the
   * newest taken first for a quantity; under moving average the sale's value × returned ÷ sold, the last unit back
   * taking what remains (SL-2 when that does not divide). A return into another book or legal entity is SL-10.
   */
  private customerReturn(item: ItemOf<'customer-return'>): ItemValue {
    this.checkGoodsShape(item.lineId, item.goods);
    if (item.condition !== 'good' && item.condition !== 'damaged') {
      refuse('invalid-item', item.lineId, [{ kind: 'condition', condition: item.condition }]);
    }
    const sale = this.sales.get(item.saleMovementId);
    if (sale === undefined)
      refuse('invalid-item', item.lineId, [{ kind: 'movement', movementId: item.saleMovementId }]);
    const to = this.unit(item.to.siteId, item.to.businessUnitId);
    const sold = this.unit(sale.siteId, sale.businessUnitId);
    if (to.bookId !== sold.bookId || to.legalEntityId !== sold.legalEntityId)
      refuse('rule-not-set', item.lineId, SL('SL-10'));
    // Which units come back, by origin.
    const back = new Map<string, { origin: OriginState; quantity: number; pieces: PieceState[] }>();
    const add = (origin: OriginState, quantity: number, piece: PieceState | null) => {
      const group = back.get(origin.id) ?? { origin, quantity: 0, pieces: [] };
      group.quantity += quantity;
      if (piece !== null) group.pieces.push(piece);
      back.set(origin.id, group);
    };
    const soldOf = (originId: string) =>
      sale.legs.filter((leg) => leg.originId === originId).reduce((sum, leg) => sum + leg.quantity, 0);
    const returnedOf = (originId: string) => sale.returned.get(originId)?.quantity ?? 0;
    if (this.sku(item.goods.skuId).pieceTracked) {
      for (const code of item.goods.pieceCodes ?? []) {
        const piece = this.piece(item.lineId, code);
        if (!sale.pieceIds.has(piece.id) || piece.inCustody || piece.lastMovementId !== sale.id) {
          refuse('exceeds-source', item.lineId, [{ kind: 'piece', code }]);
        }
        add(this.origin(item.lineId, piece.receiptOriginId), 1, piece);
      }
    } else {
      let left = item.goods.quantity;
      const origins = [...new Set(sale.legs.map((leg) => leg.originId))].reverse();
      for (const originId of origins) {
        if (left === 0) break;
        if (item.goods.receiptOriginId !== undefined && originId !== item.goods.receiptOriginId) continue;
        const take = Math.min(left, soldOf(originId) - returnedOf(originId) - (back.get(originId)?.quantity ?? 0));
        if (take <= 0) continue;
        add(this.origin(item.lineId, originId), take, null);
        left -= take;
      }
      if (left > 0) refuse('exceeds-source', item.lineId, [{ kind: 'movement', movementId: sale.id }]);
    }
    for (const group of back.values()) {
      if (group.quantity > soldOf(group.origin.id) - returnedOf(group.origin.id)) {
        refuse('exceeds-source', item.lineId, [{ kind: 'movement', movementId: sale.id }]);
      }
      if (group.origin.ownerKind !== 'organisation') refuse('rule-not-set', item.lineId, SL('SL-4'));
    }
    const movement = this.newMovement('customer-return', item.lineId, item.to.siteId, item.to.businessUnitId, [
      item.goods.skuId,
    ]);
    movement.returnsMovementId = sale.id;
    let total = 0;
    let allKnown = true;
    for (const group of back.values()) {
      const target = this.balanceFor(
        item.to.siteId,
        item.to.businessUnitId,
        item.to.locationId,
        item.condition,
        group.origin,
      );
      this.addTo(target, group.quantity, group.quantity);
      movement.legs.push(this.leg('in', target, group.quantity, group.quantity));
      for (const piece of group.pieces) {
        piece.siteId = item.to.siteId;
        piece.businessUnitId = item.to.businessUnitId;
        piece.storeId = to.storeId;
        piece.legalEntityId = to.legalEntityId;
        piece.locationId = item.to.locationId;
        piece.condition = item.condition;
        piece.heldAs = 'custody';
        piece.transitKind = null;
        piece.transitRef = null;
        piece.inCustody = true;
        piece.acceptedSiteId = item.to.siteId;
        piece.lastMovementId = movement.id;
        piece.changed = true;
        movement.pieceIds.push(piece.id);
      }
      const issued = sale.valued.get(group.origin.id);
      const returned = sale.returned.get(group.origin.id) ?? { quantity: 0, value: 0 };
      if (issued === undefined) {
        allKnown = false;
        returned.quantity += group.quantity;
        sale.returned.set(group.origin.id, returned);
        continue;
      }
      const pool = this.poolOf(item.lineId, to, item.goods.skuId);
      const before = { quantity: pool.quantity, value: pool.value };
      const layers: ValuationEntry['layers'] = [];
      let value = 0;
      if (pool.formula === 'fifo') {
        // The layers the sale took for these units: the piece's own, or the newest taken first (7.5).
        const takes = sale.layers.filter((each) => each.originId === group.origin.id);
        const wanted: { layerId: string; pieceId: string | null; quantity: number; value: number }[] = [];
        if (group.pieces.length > 0) {
          for (const piece of group.pieces) {
            const took = takes.find((each) => each.pieceId === piece.id);
            if (took === undefined) throw new Error('A sold piece without its layer');
            wanted.push({ layerId: took.layerId, pieceId: piece.id, quantity: 1, value: took.value });
          }
        } else {
          // The sale's takes summed per layer, the layer taken last first (7.5 "newest-taken layer first").
          const perLayer = new Map<string, { quantity: number; value: number }>();
          for (const took of takes) {
            const sum = perLayer.get(took.layerId) ?? { quantity: 0, value: 0 };
            sum.quantity += took.quantity;
            sum.value += took.value;
            perLayer.delete(took.layerId);
            perLayer.set(took.layerId, sum);
          }
          let left = group.quantity;
          for (const [layerId, took] of [...perLayer].reverse()) {
            if (left === 0) break;
            const done = sale.returnedFromLayer.get(layerId) ?? { quantity: 0, value: 0 };
            const take = Math.min(left, took.quantity - done.quantity);
            if (take <= 0) continue;
            const part =
              done.quantity + take === took.quantity ? took.value - done.value : share(took.value, take, took.quantity);
            if (part === undefined) refuse('rule-not-set', item.lineId, SL('SL-2'));
            done.quantity += take;
            done.value += part;
            sale.returnedFromLayer.set(layerId, done);
            wanted.push({ layerId, pieceId: null, quantity: take, value: part });
            left -= take;
          }
        }
        const sequence = pool.lastSequence + 1;
        for (const each of wanted) {
          const layer = enter(pool, {
            quantity: each.quantity,
            value: each.value,
            sequence,
            at: this.valuing.occurredAt,
            newLayerId: this.newId,
            fromLayerId: each.layerId,
          });
          if (layer !== null)
            layers.push({ layerId: layer.id, pieceId: each.pieceId, quantity: each.quantity, value: each.value });
          value += each.value;
        }
      } else {
        const last = returned.quantity + group.quantity === issued.quantity;
        const part = last ? issued.value - returned.value : share(issued.value, group.quantity, issued.quantity);
        if (part === undefined) refuse('rule-not-set', item.lineId, SL('SL-2'));
        value = part;
        enter(pool, {
          quantity: group.quantity,
          value,
          sequence: 0,
          at: this.valuing.occurredAt,
          newLayerId: this.newId,
        });
      }
      returned.quantity += group.quantity;
      returned.value += value;
      sale.returned.set(group.origin.id, returned);
      const entry = this.poolValuation(
        movement,
        group.origin,
        pool,
        { quantity: group.quantity, value, before },
        { eventKind: 'stock.customer-return', component: 'cost' },
        layers,
      );
      for (const layer of pool.layers)
        if (layers.some((each) => each.layerId === layer.id)) layer.fromValuationId = entry.id;
      this.share(movement, to.businessUnitId, 'stock.customer-return', 'cost', value);
      total += value;
    }
    return this.itemValue(total, allKnown);
  }

  /**
   * Dispatch and supplier-return departure (7.8, 13.4; PRD-TRF-011, PRD-TRF-013, PRD-OFR-012): the reservation's
   * units leave the source into transit, consuming it. Between different pools, and always for a supplier return,
   * value leaves the source pool at the formula cost onto the dispatch or shipment, under FIFO keeping the source
   * layers it took. Ordinary internal movement stays inside its legal entity (PRD-TRF-004).
   */
  private depart(item: ItemOf<'dispatch'> | ItemOf<'supplier-return-departure'>): ItemValue {
    this.checkGoodsShape(item.lineId, item.goods);
    const from = this.unit(item.from.siteId, item.from.businessUnitId);
    const isDispatch = item.kind === 'dispatch';
    const transitKind: TransitKind = isDispatch ? 'dispatch' : 'return-shipment';
    const ref = isDispatch ? item.dispatchId : item.shipmentId;
    if (isDispatch) {
      const to = this.unit(item.to.siteId, item.to.businessUnitId);
      if (to.legalEntityId !== from.legalEntityId) {
        refuse('route-not-allowed', item.lineId, [{ kind: 'route', route: 'between-legal-entities' }]);
      }
    }
    const reservation = this.header(item.lineId, item.reservationId, 'reservation');
    const wantedKind = isDispatch ? 'transfer' : 'supplier-return';
    if (reservation.kind !== wantedKind) {
      refuse('invalid-item', item.lineId, [{ kind: 'reservation-kind', reservationKind: reservation.kind }]);
    }
    const moved = this.takeReserved(item.lineId, item.reservationId, item.from, item.goods);
    const movement = this.newMovement(item.kind, item.lineId, item.from.siteId, item.from.businessUnitId, [
      item.goods.skuId,
    ]);
    for (const each of this.consumed) each.movementId ??= movement.id;
    const groups = this.byOrigin(moved);
    this.moveTo(movement, moved, {
      kind: 'place',
      siteId: item.from.siteId,
      businessUnitId: item.from.businessUnitId,
      locationId: null,
      condition: 'good',
      transit: { kind: transitKind, ref },
      accept: false,
    });
    const transit = this.transitOf(transitKind, ref, from.bookId, item.goods.skuId);
    if (transit === undefined)
      return groups.every((group) => this.valued(group.origin)) ? { kind: 'none' } : { kind: 'unknown' };
    const eventKind = isDispatch ? 'stock.pool-dispatch' : 'stock.supplier-return-departure';
    let total = 0;
    const valued = groups.filter((group) => this.valued(group.origin));
    const pool = this.poolOf(item.lineId, from, item.goods.skuId);
    for (const part of valued.length === 0 ? [] : this.outflow(item.lineId, pool, valued)) {
      const value = part.value;
      this.poolValuation(
        movement,
        part.origin,
        pool,
        { quantity: -part.quantity, value: -value, before: part.before },
        { eventKind, component: 'cost' },
        this.layersOf(part.took),
      );
      const layers: ValuationEntry['layers'] = [];
      for (const each of part.took) {
        if (each.layer === null) continue;
        this.addTransitLayer(transit, each.layer.id, each.layer.enteredSequence, each.quantity, each.value);
        if (each.pieceId !== null) transit.pieceLayers.set(each.pieceId, each.layer.id);
        layers.push({ layerId: each.layer.id, pieceId: each.pieceId, quantity: each.quantity, value: each.value });
      }
      this.transitValuation(
        movement,
        part.origin,
        transit,
        { quantity: part.quantity, value },
        { eventKind, component: 'cost' },
        layers,
      );
      total += value;
    }
    this.share(movement, from.businessUnitId, eventKind, 'cost', total);
    return this.itemValue(total, valued.length === groups.length);
  }

  /**
   * Arrival count, supplier rejection return and supplier handover (7.8, 13.4; PRD-TRF-012, PRD-TRF-016,
   * PRD-TRF-018, PRD-TRF-020, PRD-OFR-014): units leave the dispatch or shipment. Counted at the destination, or back
   * at the Site they left, they enter its pool at the value the transit holds for them, one layer per source layer
   * under FIFO, with no markup; handed over, they leave custody and their value leaves the shipment. Units missing
   * stay on the transit until resolved.
   */
  private leaveTransit(
    item: ItemOf<'arrival-count'> | ItemOf<'supplier-rejection-return'> | ItemOf<'supplier-handover'>,
  ): ItemValue {
    this.checkGoodsShape(item.lineId, item.goods);
    const from = this.unit(item.from.siteId, item.from.businessUnitId);
    const transitKind: TransitKind = item.kind === 'arrival-count' ? 'dispatch' : 'return-shipment';
    const ref = item.kind === 'arrival-count' ? item.dispatchId : item.shipmentId;
    const skuId = item.goods.skuId;
    const transit = this.transitOf(transitKind, ref, from.bookId, skuId);
    let to: UnitFacts | undefined;
    if (item.kind !== 'supplier-handover') {
      to = this.unit(item.to.siteId, item.to.businessUnitId);
      if (to.legalEntityId !== from.legalEntityId) {
        refuse('route-not-allowed', item.lineId, [{ kind: 'route', route: 'between-legal-entities' }]);
      }
      if (item.kind === 'supplier-rejection-return' && to.siteId !== from.siteId) {
        refuse('route-not-allowed', item.lineId, [{ kind: 'route', route: 'rejection-to-another-site' }]);
      }
      // A dispatch inside one pool carried no value; between pools it did (7.8). Its destination must fit.
      const samePool = this.poolOf(item.lineId, from, skuId) === this.poolOf(item.lineId, to, skuId);
      if (item.kind === 'arrival-count' && (transit === undefined) !== samePool) {
        refuse('route-not-allowed', item.lineId, [{ kind: 'route', route: 'arrival-pool' }]);
      }
    }
    const moved = this.takeTransit(item.lineId, item.from, { kind: transitKind, ref }, item.goods);
    const groups = this.byOrigin(moved);
    const movement =
      item.kind === 'supplier-handover'
        ? this.newMovement(item.kind, item.lineId, item.from.siteId, item.from.businessUnitId, [skuId])
        : this.newMovement(item.kind, item.lineId, item.to.siteId, item.to.businessUnitId, [skuId]);
    this.moveTo(
      movement,
      moved,
      item.kind === 'supplier-handover'
        ? { kind: 'gone' }
        : {
            kind: 'place',
            siteId: item.to.siteId,
            businessUnitId: item.to.businessUnitId,
            locationId: item.to.locationId,
            condition: 'good',
            accept: false,
          },
    );
    if (transit === undefined)
      return groups.every((group) => this.valued(group.origin)) ? { kind: 'none' } : { kind: 'unknown' };
    const eventKind =
      item.kind === 'arrival-count'
        ? 'stock.pool-arrival'
        : item.kind === 'supplier-handover'
          ? 'stock.supplier-handover'
          : 'stock.supplier-rejection-return';
    let total = 0;
    let allKnown = true;
    for (const group of groups) {
      if (!this.valued(group.origin)) {
        allKnown = false;
        continue;
      }
      // What leaves the transit: per source layer under FIFO, the piece's own; else the exact share (SL-2).
      const parts: { sourceLayerId: string | null; pieceId: string | null; quantity: number; value: number }[] = [];
      if (transit.layers.length > 0) {
        const wanted: { layer: (typeof transit.layers)[number]; quantity: number; pieceId: string | null }[] = [];
        // A piece takes the source layer it left with; one whose cost was established in transit, none, so it takes
        // the oldest with a quantity's units (7.6).
        const unmapped: PieceState[] = [];
        for (const piece of group.pieces) {
          const layer = transit.layers.find((each) => each.sourceLayerId === transit.pieceLayers.get(piece.id));
          if (layer === undefined) unmapped.push(piece);
          else wanted.push({ layer, quantity: 1, pieceId: piece.id });
        }
        if (group.pieces.length === 0 || unmapped.length > 0) {
          let left = group.pieces.length === 0 ? group.quantity : unmapped.length;
          for (const layer of [...transit.layers].sort((a, b) => a.order - b.order)) {
            const already = wanted.filter((each) => each.layer === layer).reduce((sum, each) => sum + each.quantity, 0);
            const take = Math.min(left, layer.quantity - already);
            if (take <= 0) continue;
            wanted.push({ layer, quantity: take, pieceId: null });
            left -= take;
            if (left === 0) break;
          }
          if (left > 0) throw new Error('A transit holds fewer valued units than its goods');
        }
        // Worked out on copies first, so nothing changes when a share does not divide (SL-2).
        const staged = new Map<TransitLayerState, { quantity: number; value: number }>();
        for (const each of wanted) {
          const state = staged.get(each.layer) ?? { quantity: each.layer.quantity, value: each.layer.value };
          const part = share(state.value, each.quantity, state.quantity);
          if (part === undefined) refuse('rule-not-set', item.lineId, SL('SL-2'));
          state.quantity -= each.quantity;
          state.value -= part;
          staged.set(each.layer, state);
          parts.push({
            sourceLayerId: each.layer.sourceLayerId,
            pieceId: each.pieceId,
            quantity: each.quantity,
            value: part,
          });
        }
        for (const [layer, state] of staged) {
          layer.quantity = state.quantity;
          layer.value = state.value;
          layer.changed = true;
        }
      } else {
        const value = share(transit.value, group.quantity, transit.quantity);
        if (value === undefined) refuse('rule-not-set', item.lineId, SL('SL-2'));
        parts.push({ sourceLayerId: null, pieceId: null, quantity: group.quantity, value });
      }
      const value = parts.reduce((sum, each) => sum + each.value, 0);
      this.transitValuation(
        movement,
        group.origin,
        transit,
        { quantity: -group.quantity, value: -value },
        { eventKind, component: 'cost' },
        parts.flatMap((each) =>
          each.sourceLayerId === null
            ? []
            : [{ layerId: each.sourceLayerId, pieceId: each.pieceId, quantity: each.quantity, value: -each.value }],
        ),
      );
      if (to !== undefined) {
        const pool = this.poolOf(item.lineId, to, skuId);
        const before = { quantity: pool.quantity, value: pool.value };
        const sequence = pool.lastSequence + 1;
        const layers: ValuationEntry['layers'] = [];
        if (pool.formula === 'fifo') {
          for (const part of parts) {
            const layer = enter(pool, {
              quantity: part.quantity,
              value: part.value,
              sequence,
              at: this.valuing.occurredAt,
              newLayerId: this.newId,
              fromLayerId: part.sourceLayerId,
            });
            if (layer !== null)
              layers.push({ layerId: layer.id, pieceId: part.pieceId, quantity: part.quantity, value: part.value });
          }
        } else
          enter(pool, {
            quantity: group.quantity,
            value,
            sequence,
            at: this.valuing.occurredAt,
            newLayerId: this.newId,
          });
        const entry = this.poolValuation(
          movement,
          group.origin,
          pool,
          { quantity: group.quantity, value, before },
          { eventKind, component: 'cost' },
          layers,
        );
        for (const layer of pool.layers)
          if (layers.some((each) => each.layerId === layer.id)) layer.fromValuationId = entry.id;
        this.share(movement, to.businessUnitId, eventKind, 'cost', value);
      } else this.share(movement, from.businessUnitId, eventKind, 'cost', value);
      total += value;
    }
    return this.itemValue(total, allKnown);
  }
}
