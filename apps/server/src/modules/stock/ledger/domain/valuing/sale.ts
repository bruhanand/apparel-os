import { paise, type Paise } from '@apparel-os/domain';
import type { UnitFacts } from '../../ports.js';
import { freeUnits, reservableUnits } from '../availability.js';
import { refuse, type ItemValue, type ValuedItem } from '../request.js';
import { share, sumPaise, takeInOrder } from '../valuation.js';
import type { BalanceState, MovementEntry, OriginState, PieceState } from '../working.js';
import { onlyOrigin, SL, type Moved, type OriginGroup, type SaleState, type ValuationLayerEntry } from './state.js';
import { TransferItems } from './transfer.js';

// Sales and customer returns (stock-ledger 6.3, 7.2, 7.5, 13.4; S1-F10-T03): custody leaving at handover at the
// formula cost, a supplier-owned unit's pass-through at its agreed cost, and units coming back at the cost their sale
// took.

type ItemOf<K extends ValuedItem['kind']> = Extract<ValuedItem, { kind: K }>;

export abstract class SaleItems extends TransferItems {
  /**
   * Sale issue (6.3, 7.5, 13.4; PRD-STK-003, PRD-POS-018): custody leaves at handover, of units sellable at the Store:
   * in custody there, good, covered, accepted, free of holds and reservations; value leaves the pool at the formula
   * cost. Billed-retained value timing is `rule-not-set` (SL-17); a supplier-owned unit's pass-through at its agreed
   * cost is a working assumption until the CA validates SL-4 (13.11 "Pass-through"; product owner, 11 Oct 2026), and
   * without an agreed cost it is `rule-not-set` naming SL-4.
   */
  protected saleIssue(item: ItemOf<'sale-issue'>): ItemValue {
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
    const passing = groups.filter(
      (group) => group.origin.ownerKind === 'supplier' || group.origin.ownerKind === 'brand',
    );
    const agreed = item.agreedCostPaise;
    if (passing.length > 0 && agreed === undefined) refuse('rule-not-set', item.lineId, SL('SL-4'));
    // An agreed cost is for supplier- or brand-owned units only, all of the line's (7.2): owned units leave the pool.
    if (agreed !== undefined && (passing.length !== groups.length || !Number.isSafeInteger(agreed) || agreed < 0)) {
      refuse('invalid-item', item.lineId, [{ kind: 'agreed-cost' }]);
    }
    const movement = this.newMovement('sale-issue', item.lineId, item.at.siteId, item.at.businessUnitId, [
      item.goods.skuId,
    ]);
    this.moveTo(movement, moved, { kind: 'gone' });
    if (agreed !== undefined) {
      // The pass-through of 7.2 (G6; a working assumption, SL-4): in and straight out at the agreed cost, never
      // mixing with the pool's average or layers, so no pool valuation; Post records it (books-and-posting 7.2).
      const passed = paise(agreed * item.goods.quantity);
      this.postShare(movement, unit.businessUnitId, 'stock.pass-through', 'cost', passed);
      return { kind: 'known', amountPaise: passed };
    }
    return this.valuedOutflow(item.lineId, movement, unit, item.goods.skuId, groups, 'stock.sale-issue');
  }

  /**
   * Customer return (7.5, 13.4; PRD-RET-013, PRD-LED-017, PRD-INT-005): custody back after physical acceptance, within
   * what the sale issued and was not yet returned, at the cost its sale issued: under FIFO a new layer at that cost,
   * dated at the return, with lineage to the layer the sale took, the piece's own for piece-tracked goods and the
   * newest taken first for a quantity; under moving average the sale's value × returned ÷ sold, the last unit back
   * taking what remains (SL-2 when that does not divide). A return into another book or legal entity is SL-10.
   */
  protected customerReturn(item: ItemOf<'customer-return'>): ItemValue {
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
    const back = new Map<string, OriginGroup>();
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
        this.backInCustody(piece, item.to, item.condition, movement);
        piece.acceptedSiteId = item.to.siteId;
      }
    }
    const { total, allKnown } = this.valueBack(
      item.lineId,
      movement,
      sale,
      [...back.values()],
      to,
      item.goods.skuId,
      'stock.customer-return',
    );
    return this.itemValue(total, allKnown);
  }

  /**
   * Units that undo an outflow come back into the pool at the cost it took (7.5; PRD-LED-017): under FIFO each a new
   * layer at that cost, dated now, with lineage to the layer the outflow took, the piece's own for piece-tracked goods
   * and the newest taken first for a quantity; under moving average the outflow's value × back ÷ out, the last unit
   * back taking what remains, as one valuation (13.10). A share that does not divide is `rule-not-set` (SL-2). Used
   * by a customer return and by the reversal of a count loss (S1-F10-T06).
   */
  protected valueBack(
    lineId: string,
    movement: MovementEntry,
    sale: SaleState,
    groups: readonly OriginGroup[],
    to: UnitFacts,
    skuId: string,
    eventKind: string,
  ): { total: number; allKnown: boolean } {
    let total = 0;
    let allKnown = true;
    const valuedBack: OriginGroup[] = [];
    for (const group of groups) {
      const pool = this.poolOf(lineId, to, skuId);
      const returned = sale.returned.get(group.origin.id) ?? { quantity: 0, value: 0 };
      sale.returned.set(group.origin.id, returned);
      if (pool.formula === 'moving-average') {
        // Valued below, all origins together, from the sale line (7.5).
        if (sale.valuedTotal !== null && this.valued(group.origin)) valuedBack.push(group);
        else allKnown = false;
        returned.quantity += group.quantity;
        continue;
      }
      if (!sale.valued.has(group.origin.id)) {
        allKnown = false;
        returned.quantity += group.quantity;
        continue;
      }
      const before = { quantity: pool.quantity, value: pool.value };
      const wanted = this.layersBack(lineId, sale, group);
      const layers: ValuationLayerEntry[] = this.enterBySource(
        pool,
        pool.lastSequence + 1,
        wanted.map((each) => ({ ...each, fromLayerId: each.layerId })),
      );
      const value = sumPaise(wanted.map((each) => each.value));
      returned.quantity += group.quantity;
      returned.value += value;
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
      total += value;
    }
    if (valuedBack.length > 0 && sale.valuedTotal !== null) {
      // Moving average: the sale line's value × returned ÷ sold, the last unit back taking what remains (7.5), as one
      // valuation naming its origin only when it has one (13.10).
      const issued = sale.valuedTotal;
      const quantity = valuedBack.reduce((sum, group) => sum + group.quantity, 0);
      const returned = sale.returnedTotal;
      if (returned.quantity + quantity > issued.quantity) {
        throw new Error('A customer return brings back more valued units than its sale issued');
      }
      const last = returned.quantity + quantity === issued.quantity;
      const value = last ? paise(issued.value - returned.value) : share(paise(issued.value), quantity, issued.quantity);
      if (value === undefined) refuse('rule-not-set', lineId, SL('SL-2'));
      const pool = this.poolOf(lineId, to, skuId);
      const before = { quantity: pool.quantity, value: pool.value };
      this.enterAveraged(pool, quantity, value);
      returned.quantity += quantity;
      returned.value += value;
      this.poolValuation(
        movement,
        onlyOrigin(valuedBack),
        pool,
        { quantity, value, before },
        { eventKind, component: 'cost' },
      );
      this.postShare(movement, to.businessUnitId, eventKind, 'cost', value);
      total += value;
    }
    return { total, allKnown };
  }

  /**
   * The layers an outflow took that its units come back from, under FIFO (7.5): a piece the layer it took; a quantity
   * the outflow's takes summed per layer, the layer taken last first ("newest-taken layer first"), each at the exact
   * share of what that take has not yet brought back.
   */
  private layersBack(
    lineId: string,
    sale: SaleState,
    group: OriginGroup,
  ): { layerId: string; pieceId: string | null; quantity: number; value: Paise }[] {
    const takes = sale.layers.filter((each) => each.originId === group.origin.id);
    if (group.pieces.length > 0) {
      return group.pieces.map((piece) => {
        const took = takes.find((each) => each.pieceId === piece.id);
        if (took === undefined) throw new Error('A sold piece without its layer');
        return { layerId: took.layerId, pieceId: piece.id, quantity: 1, value: paise(took.value) };
      });
    }
    const perLayer = new Map<string, { quantity: number; value: number }>();
    for (const took of takes) {
      const sum = perLayer.get(took.layerId) ?? { quantity: 0, value: 0 };
      sum.quantity += took.quantity;
      sum.value += took.value;
      perLayer.delete(took.layerId);
      perLayer.set(took.layerId, sum);
    }
    const doneOf = (layerId: string) => sale.returnedFromLayer.get(layerId) ?? { quantity: 0, value: 0 };
    const walked = takeInOrder([...perLayer].reverse(), group.quantity, ([layerId, took]) => ({
      quantity: took.quantity - doneOf(layerId).quantity,
      value: paise(took.value - doneOf(layerId).value),
    }));
    if (walked === 'not-whole') refuse('rule-not-set', lineId, SL('SL-2'));
    if (walked === 'short') throw new Error('Units back exceed what their outflow took from its layers');
    return walked.map((part) => {
      const [layerId] = part.from;
      const done = doneOf(layerId);
      sale.returnedFromLayer.set(layerId, {
        quantity: done.quantity + part.quantity,
        value: done.value + part.value,
      });
      return { layerId, pieceId: null, quantity: part.quantity, value: part.value };
    });
  }
}
