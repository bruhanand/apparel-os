import { paise, type Paise } from '@apparel-os/domain';
import type { UnitFacts } from '../../ports.js';
import { compareCodeUnits } from '../keys.js';
import { refuse, type ItemValue, type ValuedItem } from '../request.js';
import { enter, nextSequence, share, type LayerState, type PoolState } from '../valuation.js';
import type { BalanceState, OriginState } from '../working.js';
import { ValuingCore } from './core.js';
import { SL, type TransitState, type ValuationLayerEntry } from './state.js';

// Cost established and late cost changes (stock-ledger 7.6, 7.7, 13.4; S1-F10-T03): the cost of a receipt origin's
// units, and its changes, following the goods wherever they are.

type ItemOf<K extends ValuedItem['kind']> = Extract<ValuedItem, { kind: K }>;

export abstract class CostItems extends ValuingCore {
  /**
   * Cost established (7.6, 13.4; PRD-PTW-010, PRD-REC-017): the covering revision's P RATE gives the origin its cost.
   * Owned units in custody enter the pool that holds them, and units in transit between pools go onto the dispatch;
   * a supplier-owned origin records its cost only (7.2; PRD-ORG-015). The origin must still be Unknown and covered by
   * the revision, recorded earlier or in the same request.
   */
  protected costEstablished(item: ItemOf<'cost-established'>): ItemValue {
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
    origin.establishedValuePaise = paise(0);
    origin.lastStateMovementId = movement.id;
    origin.stateChanged = true;
    if (origin.ownerKind !== 'organisation') {
      // Nothing enters a pool or posts (7.2), but the approval is still on the cost of the covered quantity (15.3;
      // PRD-ACS-015): its known cost, as for owned goods (S1-F10-T06, a defect found by G6).
      const units = this.originBalances(origin)
        .filter((row) => row.transitKind !== 'return-shipment')
        .reduce((sum, row) => sum + row.quantity, 0);
      return { kind: 'known', amountPaise: paise(item.pRatePaise * units) };
    }
    const kind = 'stock.cost-established';
    const own = this.unit(origin.scope.siteId, origin.scope.businessUnitId);
    const toPools = new Map<PoolState, { quantity: number; units: Map<string, number> }>();
    let total = 0;
    for (const row of this.originBalances(origin)) {
      const unit = this.unit(row.siteId, row.businessUnitId);
      const value = paise(item.pRatePaise * row.quantity);
      if (row.transitKind === 'return-shipment') continue;
      const transit =
        row.transitKind === 'dispatch' && row.transitRef !== null
          ? this.transitOf('dispatch', row.transitRef, unit.bookId, skuId)
          : undefined;
      total += value;
      if (transit !== undefined) {
        // Units in transit between pools: the dispatch takes the value (7.6). Under FIFO a layer records its lineage.
        const source = this.poolOf(item.lineId, unit, skuId);
        const layers: ValuationLayerEntry[] = [];
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
        this.postShare(movement, transit.scope.businessUnitId, kind, 'to-dispatch', value);
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
      const value = paise(item.pRatePaise * into.quantity);
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
      for (const [unitId, amount] of into.units) this.postShare(movement, unitId, kind, 'to-pool', amount);
    }
    origin.establishedValuePaise = paise(total);
    return { kind: 'known', amountPaise: paise(total) };
  }

  /** A FIFO layer whose units pass straight onto a dispatch, so the transit value keeps their lineage (7.4, 7.6). */
  private passingLayer(pool: PoolState, origin: OriginState, quantity: number, value: Paise): LayerState {
    const layer: LayerState = {
      id: this.newId(),
      isNew: true,
      poolId: pool.id,
      enteredSequence: nextSequence(pool),
      enteredAt: this.valuing.occurredAt,
      quantityIn: quantity,
      valueIn: value,
      quantityLeft: 0,
      valueLeft: paise(0),
      fromLayerId: null,
      receiptOriginId: origin.id,
      fromValuationId: null,
      changed: true,
    };
    pool.layers.push(layer);
    return layer;
  }

  /**
   * Cost adjustment (7.7, 13.4; PRD-LED-006, PRD-LED-016): the change, shared equally among the units the origin's
   * cost put into pools, follows its goods. Moving average: through the origin's own units; FIFO: through its cost
   * layer's lineage. Units still held change the pool or dispatch that holds them; units gone carry their share to
   * where they went: cost of goods sold, or the supplier claim. A pool never falls below zero: the excess goes with the
   * share for units gone, or to cost of goods sold as its own line when none are gone. A share that does not divide is
   * `rule-not-set` (SL-2).
   */
  protected costAdjustment(item: ItemOf<'cost-adjustment'>): ItemValue {
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
    // An origin whose cost is established has its established value (7.7); none would be a defect (PRD-MOD-015).
    origin.establishedValuePaise = paise(this.knownCost(origin).established + item.amountPaise);
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
          layer.valueLeft = paise(layer.valueLeft + change);
          layer.changed = true;
          delta.layers.set(layer, change);
          applied += change;
        }
      } else {
        applied = clamp(pool.value, delta.value);
        excess += delta.value - applied;
      }
      const before = { quantity: pool.quantity, value: pool.value };
      pool.value = paise(pool.value + applied);
      pool.changed = true;
      this.poolValuation(
        movement,
        origin,
        pool,
        { quantity: 0, value: paise(applied), before },
        { eventKind: kind, component: 'to-pool' },
        [...delta.layers].map(([layer, value]) => ({
          layerId: layer.id,
          pieceId: null,
          quantity: layer.quantityLeft,
          value: paise(value),
        })),
      );
      // The units' shares, less what was held back, go to the units where the value lies.
      const shortfall = delta.value - applied;
      let first = true;
      for (const [unitId, amount] of delta.units) {
        this.postShare(movement, unitId, kind, 'to-pool', first ? amount - shortfall : amount);
        first = false;
      }
    }
    for (const [transit, delta] of transitDeltas) {
      const applied = clamp(transit.value, delta.value);
      excess += delta.value - applied;
      for (const layer of transit.layers) {
        const value = delta.layers.get(layer.sourceLayerId);
        if (value === undefined) continue;
        layer.value = paise(layer.value + value);
        layer.changed = true;
      }
      this.transitValuation(
        movement,
        origin,
        transit,
        { quantity: 0, value: paise(applied) },
        { eventKind: kind, component: 'to-dispatch' },
      );
      this.postShare(movement, transit.scope.businessUnitId, kind, 'to-dispatch', applied);
    }
    // The excess goes with the share for units gone; when none are gone, to cost of goods sold as its own line.
    if (excess !== 0) {
      if (goneUnits > 0) toCogs += excess;
      else if (claimUnits > 0) toClaim += excess;
      else this.postShare(movement, own.businessUnitId, kind, 'excess-to-cogs', excess);
    }
    this.postShare(movement, own.businessUnitId, kind, 'to-cogs', toCogs);
    this.postShare(movement, own.businessUnitId, kind, 'to-supplier-claim', toClaim);
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
}
