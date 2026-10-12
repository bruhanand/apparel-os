import { paise, type Paise } from '@apparel-os/domain';
import type { UnitFacts } from '../../ports.js';
import { compareCodeUnits } from '../keys.js';
import { refuse, type Goods, type ItemValue, type LedgerItem, type Place, type ValuedItem } from '../request.js';
import { negate, quote, sumPaise, takeInOrder, type Holding } from '../valuation.js';
import type { BalanceState, MovementEntry, PieceState, TransitKind } from '../working.js';
import { CostItems } from './cost.js';
import {
  onlyOrigin,
  SL,
  type Moved,
  type OriginGroup,
  type TransitLayerState,
  type TransitState,
  type ValuationLayerEntry,
} from './state.js';

// Transfers between pools and supplier returns (stock-ledger 7.8, 13.4, 13.5; S1-F10-T03): the reservation that
// approves them, valued at the pool's cost of its units; the departure onto a dispatch or a shipment, holding the value
// between pools; and the arrival, rejection return or handover off it.

type ItemOf<K extends ValuedItem['kind']> = Extract<ValuedItem, { kind: K }>;

export abstract class TransferItems extends CostItems {
  /**
   * Reserve (13.5), valued for its approval (13.10 "Value for approval"; product owner, 11 Oct 2026): a transfer's or a
   * supplier return's approval is on the cost of the units it reserves, so an approver's cost limit routes it. That is
   * the pool's current cost of them at its formula, what an outflow of them now would take (7.3, 7.4), worked out under
   * the pool's lock and changing nothing. Unknown when any unit's cost is Unknown or its goods are not the
   * Organisation's (7.2), or when its book has no cost setting, so no pool; `rule-not-set` (SL-2) when it does not
   * divide into whole paise.
   */
  protected override reserve(item: Extract<LedgerItem, { kind: 'reserve' }>): ItemValue {
    super.reserve(item);
    const reservation = this.entries.reservations.at(-1);
    if (reservation === undefined) throw new Error('A reservation without its entry');
    const unit = this.unit(item.at.siteId, item.at.businessUnitId);
    const bySku = new Map<string, { quantity: number; pieceIds: string[]; allValued: boolean }>();
    for (const claim of reservation.claims) {
      const piece = claim.pieceId === null ? undefined : this.pieces.get(claim.pieceId);
      const balance = claim.balanceId === null ? undefined : this.balances.get(claim.balanceId);
      const originId = piece?.receiptOriginId ?? balance?.receiptOriginId;
      const skuId = piece?.skuId ?? balance?.skuId;
      if (originId === undefined || skuId == null) throw new Error('A reservation claim without its units');
      const origin = this.origin(item.lineId, originId);
      const units = bySku.get(skuId) ?? { quantity: 0, pieceIds: [], allValued: true };
      units.quantity += claim.quantity;
      if (piece !== undefined) units.pieceIds.push(piece.id);
      units.allValued &&= this.valued(origin);
      bySku.set(skuId, units);
    }
    let total = 0;
    for (const [skuId, units] of bySku) {
      if (!units.allValued || !this.valuing.costSettings.has(unit.bookId)) return { kind: 'unknown' };
      const took = quote(this.poolOf(item.lineId, unit, skuId), {
        quantity: units.quantity,
        ...(units.pieceIds.length > 0 ? { pieceIds: units.pieceIds } : {}),
      });
      if (took === undefined) refuse('rule-not-set', item.lineId, SL('SL-2'));
      total += sumPaise(took.map((each) => each.value));
    }
    return { kind: 'known', amountPaise: paise(total) };
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

  /**
   * Dispatch and supplier-return departure (7.8, 13.4; PRD-TRF-011, PRD-TRF-013, PRD-OFR-012): the reservation's
   * units leave the source into transit, consuming it. Between different pools, and always for a supplier return,
   * value leaves the source pool at the formula cost onto the dispatch or shipment, under FIFO keeping the source
   * layers it took. Ordinary internal movement stays inside its legal entity (PRD-TRF-004).
   */
  protected depart(item: ItemOf<'dispatch'> | ItemOf<'supplier-return-departure'>): ItemValue {
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
      this.poolValuation(
        movement,
        part.origin,
        pool,
        { quantity: -part.quantity, value: negate(part.value), before: part.before },
        { eventKind, component: 'cost' },
        this.layersOf(part.took),
      );
      const layers: ValuationLayerEntry[] = [];
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
        { quantity: part.quantity, value: part.value },
        { eventKind, component: 'cost' },
        layers,
      );
      total += part.value;
    }
    this.postShare(movement, from.businessUnitId, eventKind, 'cost', total);
    return this.itemValue(total, valued.length === groups.length);
  }

  /**
   * Arrival count, supplier rejection return and supplier handover (7.8, 13.4; PRD-TRF-012, PRD-TRF-016,
   * PRD-TRF-018, PRD-TRF-020, PRD-OFR-014): units leave the dispatch or shipment. Counted at the destination, or back
   * at the Site they left, they enter its pool at the value the transit holds for them, one layer per source layer
   * under FIFO, with no markup; handed over, they leave custody and their value leaves the shipment. Units missing
   * stay on the transit until resolved.
   */
  protected leaveTransit(
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
    // A transit value of a moving-average book holds no layers (7.8); a FIFO one keeps its source layers.
    if (transit.layers.length === 0) {
      return this.leaveAveragedTransit(item.lineId, movement, transit, groups, eventKind, from, to);
    }
    let total = 0;
    let allKnown = true;
    for (const group of groups) {
      if (!this.valued(group.origin)) {
        allKnown = false;
        continue;
      }
      const parts = this.offTransitLayers(item.lineId, transit, group);
      const value = sumPaise(parts.map((each) => each.value));
      this.transitValuation(
        movement,
        group.origin,
        transit,
        { quantity: -group.quantity, value: negate(value) },
        { eventKind, component: 'cost' },
        parts.map((each) => ({
          layerId: each.sourceLayerId,
          pieceId: each.pieceId,
          quantity: each.quantity,
          value: negate(each.value),
        })),
      );
      if (to !== undefined) {
        const pool = this.poolOf(item.lineId, to, skuId);
        const before = { quantity: pool.quantity, value: pool.value };
        const layers: ValuationLayerEntry[] = [];
        if (pool.formula === 'fifo') {
          layers.push(
            ...this.enterBySource(
              pool,
              pool.lastSequence + 1,
              parts.map((part) => ({ ...part, fromLayerId: part.sourceLayerId })),
            ),
          );
        } else this.enterAveraged(pool, group.quantity, value);
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
        this.postShare(movement, to.businessUnitId, eventKind, 'cost', value);
      } else this.postShare(movement, from.businessUnitId, eventKind, 'cost', value);
      total += value;
    }
    return this.itemValue(total, allKnown);
  }

  /**
   * What one origin's units take off a FIFO transit value's layers (7.4, 7.8): a piece the source layer it left with;
   * a quantity, and a piece whose cost was established in transit and so has none (7.6), the oldest layers first; each
   * the exact share of what its layer has left. Worked out on copies first, so nothing changes when a share does not
   * divide (`rule-not-set`, SL-2).
   */
  private offTransitLayers(
    lineId: string,
    transit: TransitState,
    group: OriginGroup,
  ): { sourceLayerId: string; pieceId: string | null; quantity: number; value: Paise }[] {
    const staged = new Map<TransitLayerState, Holding>();
    const has = (layer: TransitLayerState): Holding =>
      staged.get(layer) ?? { quantity: layer.quantity, value: layer.value };
    const parts: { sourceLayerId: string; pieceId: string | null; quantity: number; value: Paise }[] = [];
    const take = (layers: readonly TransitLayerState[], quantity: number, pieceId: string | null) => {
      const walked = takeInOrder(layers, quantity, has);
      if (walked === 'not-whole') refuse('rule-not-set', lineId, SL('SL-2'));
      if (walked === 'short') throw new Error('A transit holds fewer valued units than its goods');
      for (const part of walked) {
        const state = has(part.from);
        staged.set(part.from, { quantity: state.quantity - part.quantity, value: paise(state.value - part.value) });
        parts.push({ sourceLayerId: part.from.sourceLayerId, pieceId, quantity: part.quantity, value: part.value });
      }
    };
    let unmapped = 0;
    for (const piece of group.pieces) {
      const layer = transit.layers.find((each) => each.sourceLayerId === transit.pieceLayers.get(piece.id));
      if (layer === undefined) unmapped += 1;
      else take([layer], 1, piece.id);
    }
    const rest = group.pieces.length === 0 ? group.quantity : unmapped;
    if (rest > 0)
      take(
        [...transit.layers].sort((a, b) => a.order - b.order),
        rest,
        null,
      );
    for (const [layer, state] of staged) {
      layer.quantity = state.quantity;
      layer.value = state.value;
      layer.changed = true;
    }
    return parts;
  }

  /**
   * Units leave a transit value of a moving-average book (7.3, 7.8): the exact share of what it holds, all of it when
   * they are all, as one valuation naming its origin only when it has one (13.10); at a destination they enter its
   * pool at that value. A share that does not divide is `rule-not-set` (SL-2).
   */
  private leaveAveragedTransit(
    lineId: string,
    movement: MovementEntry,
    transit: TransitState,
    groups: readonly OriginGroup[],
    eventKind: string,
    from: UnitFacts,
    to: UnitFacts | undefined,
  ): ItemValue {
    const valued = groups.filter((group) => this.valued(group.origin));
    const allKnown = valued.length === groups.length;
    if (valued.length === 0) return this.itemValue(0, allKnown);
    const quantity = valued.reduce((sum, group) => sum + group.quantity, 0);
    const walked = takeInOrder([transit], quantity, (each) => each);
    if (walked === 'short') throw new Error('A transit holds fewer valued units than its goods');
    if (walked === 'not-whole') refuse('rule-not-set', lineId, SL('SL-2'));
    const value = sumPaise(walked.map((part) => part.value));
    const origin = onlyOrigin(valued);
    const names = { eventKind, component: 'cost' };
    this.transitValuation(movement, origin, transit, { quantity: -quantity, value: negate(value) }, names);
    if (to === undefined) {
      this.postShare(movement, from.businessUnitId, eventKind, 'cost', value);
      return this.itemValue(value, allKnown);
    }
    const pool = this.poolOf(lineId, to, transit.skuId);
    const before = { quantity: pool.quantity, value: pool.value };
    this.enterAveraged(pool, quantity, value);
    this.poolValuation(movement, origin, pool, { quantity, value, before }, names);
    this.postShare(movement, to.businessUnitId, eventKind, 'cost', value);
    return this.itemValue(value, allKnown);
  }
}
