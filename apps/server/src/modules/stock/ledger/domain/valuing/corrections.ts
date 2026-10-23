import { paise } from '@apparel-os/domain';
import { freeUnits } from '../availability.js';
import { refuse, type Goods, type ItemValue, type OriginGoods, type ValuedItem } from '../request.js';
import { negate, oldestFirst, share, sumPaise, takeInOrder } from '../valuation.js';
import type { ClaimState, OriginState, PieceState } from '../working.js';
import { SaleItems } from './sale.js';
import { SL, type Moved, type OriginGroup, type SaleState, type ValuationLayerEntry } from './state.js';

// Disposal, count differences, reversals and piece corrections (stock-ledger 7.5, 7.9, 8.2 to 8.4, 13.4; S1-F10-T06).

type ItemOf<K extends ValuedItem['kind']> = Extract<ValuedItem, { kind: K }>;

/** A reversal of goods of a SKU: every reversal but a condition change's names its goods by SKU (13.15). */
type SkuReversal = Omit<ItemOf<'reversal'>, 'goods'> & { readonly goods: Goods };

/** The release event a disposal ends each disposable hold kind's claim with (6.1; 14.2 `hold_release`). */
const DISPOSAL_RELEASES: Readonly<Record<string, string | undefined>> = {
  quarantine: 'approved-decision',
  expiry: 'disposal',
  'write-off': 'disposal',
};

export abstract class Corrections extends SaleItems {
  /**
   * Disposal (7.9, 13.4; PRD-DMG-012, PRD-DMG-015, PRD-DMG-016): custody ends for goods the named hold claims, a
   * quarantine, expiry or write-off hold, and the disposal ends that claim on them by its kind's own event (6.1; 14.2
   * `hold_release`): an approved decision for quarantined goods, the disposal's approval being that decision; disposal
   * for expired or written-off ones (reading confirmed by the product owner, 11 Oct 2026). Units the hold does not claim
   * are `exceeds-source`. Units another hold or a reservation also claims are `held` or `reserved`, a piece's by its
   * claims and a quantity's by the claims on its balance, a quantity claim being taken to fall on units no other claim
   * holds as far as the balance's units go (6.2; availability.ts `heldOnce`). Value: goods not written off first leave
   * the pool at the formula cost (`stock.disposal-loss`); after a write-off, none, so a loss is never counted twice;
   * pre-PT or supplier-owned goods, none and no journal (7.6, 13.4).
   */
  protected disposal(item: ItemOf<'disposal'>): ItemValue {
    this.checkGoodsShape(item.lineId, item.goods);
    const hold = this.header(item.lineId, item.holdId, 'hold');
    const event = DISPOSAL_RELEASES[hold.kind];
    if (event === undefined) {
      refuse('wrong-release-event', item.lineId, [{ kind: 'hold', holdKind: hold.kind, event: 'disposal' }]);
    }
    const claims = this.activeClaims((claim) => claim.owner === 'hold' && claim.headerId === hold.id);
    const moved = new Map<string, Moved>();
    const release = (claim: ClaimState, quantity: number, piece: PieceState | null) => {
      claim.quantity -= quantity;
      claim.changed = true;
      this.entries.holdReleases.push({
        id: this.newId(),
        lineId: item.lineId,
        holdId: hold.id,
        holdKind: hold.kind,
        claimId: claim.id,
        event,
        quantity,
        pieceId: piece?.id ?? null,
        scope: claim.scope,
      });
    };
    const add = (balance: Moved['balance'], quantity: number, piece: PieceState | null) => {
      const entry = moved.get(balance.id) ?? { balance, quantity: 0, pieces: [] };
      entry.quantity += quantity;
      if (piece !== null) entry.pieces.push(piece);
      moved.set(balance.id, entry);
    };
    /** Refuses units another hold or a reservation also claims, naming the other hold where there is one (6.2). */
    const alsoClaimed = (others: readonly ClaimState[]): never => {
      const other = others.find((each) => each.owner === 'hold');
      if (other !== undefined)
        refuse('held', item.lineId, [{ kind: 'hold', holdKind: other.headerKind, holdId: other.headerId }]);
      refuse('reserved', item.lineId);
    };
    if (this.sku(item.goods.skuId).pieceTracked) {
      for (const code of item.goods.pieceCodes ?? []) {
        const piece = this.piece(item.lineId, code);
        if (
          !piece.inCustody ||
          piece.heldAs !== 'custody' ||
          piece.siteId !== item.at.siteId ||
          piece.businessUnitId !== item.at.businessUnitId ||
          piece.locationId !== item.at.locationId ||
          piece.condition !== item.condition
        ) {
          refuse('piece-not-at-place', item.lineId, [{ kind: 'piece', code }]);
        }
        const claim = claims.find((each) => each.pieceId === piece.id);
        if (claim === undefined) refuse('exceeds-source', item.lineId, [{ kind: 'piece', code }]);
        const others = this.pieceClaims(piece).filter((each) => each !== claim);
        if (others.length > 0) alsoClaimed(others);
        release(claim, 1, piece);
        add(
          this.balanceFor(
            item.at.siteId,
            item.at.businessUnitId,
            item.at.locationId,
            item.condition,
            this.origin(item.lineId, piece.receiptOriginId),
          ),
          1,
          piece,
        );
        this.hidden.pieces.push({ line: this.line, pieceId: piece.id });
      }
    } else {
      let left = item.goods.quantity;
      const blocking: ClaimState[] = [];
      let claimedHere = 0;
      for (const balance of this.balancesAt(item.at, item.condition, item.goods)) {
        const own = claims.filter((each) => each.balanceId === balance.id);
        if (own.length === 0) continue;
        // The units on the balance no other claim holds: its units less what reservations and other holds claim.
        const others = this.activeClaims(
          (claim) => claim.balanceId === balance.id && !own.includes(claim) && claim.quantity > 0,
        );
        blocking.push(...others);
        let sole = Math.max(0, balance.quantity - others.reduce((sum, claim) => sum + claim.quantity, 0));
        let taken = 0;
        for (const claim of own) {
          claimedHere += Math.min(claim.quantity, balance.quantity);
          if (left === 0) break;
          const take = Math.min(left, claim.quantity, sole);
          if (take <= 0) continue;
          release(claim, take, null);
          add(balance, take, null);
          sole -= take;
          taken += take;
          left -= take;
        }
        // What the disposal leaves free there, for claims the actor cannot see (DEC-117; 13.8).
        if (taken > 0) this.leaveSpare(balance, freeUnits(this.claimsOn(balance)) - taken);
      }
      if (left > 0) {
        if (claimedHere >= item.goods.quantity && blocking.length > 0) alsoClaimed(blocking);
        refuse('exceeds-source', item.lineId, [{ kind: 'hold', holdId: hold.id }]);
      }
    }
    const movement = this.newMovement('disposal', item.lineId, item.at.siteId, item.at.businessUnitId, [
      item.goods.skuId,
    ]);
    const units = [...moved.values()];
    const groups = this.byOrigin(units);
    this.moveTo(movement, units, { kind: 'gone' });
    // Written off first: its value left with the write-off; nothing more leaves (7.9; PRD-DMG-015).
    if (hold.kind === 'write-off') return { kind: 'known', amountPaise: paise(0) };
    const unit = this.unit(item.at.siteId, item.at.businessUnitId);
    return this.valuedOutflow(item.lineId, movement, unit, item.goods.skuId, groups, 'stock.disposal-loss');
  }

  /**
   * Count difference (8.2 to 8.4, 13.4; PRD-STK-012, PRD-STK-014): an approved difference of the count whose freeze
   * the item names, which therefore does not stop it. A loss takes free units at the place, the named pieces or the
   * oldest first (8.3; PRD-STK-013), and leaves at the formula cost (`stock.count-loss`). A gain with no known origin
   * is a new surplus origin, owner, coverage and cost Unknown, its custody held as excess (8.4; 6.1): it posts no
   * value. A gain matched to a recorded loss is that loss's reversal (13.4 "Reversal"), not a count difference.
   */
  protected countDifference(item: ItemOf<'count-difference'>): ItemValue {
    this.checkGoodsShape(item.lineId, item.goods);
    if (item.reason.trim() === '') refuse('invalid-item', item.lineId, [{ kind: 'reason' }]);
    this.countOf(item.lineId, item.countId, item.at);
    const movement = this.newMovement('count-difference', item.lineId, item.at.siteId, item.at.businessUnitId, [
      item.goods.skuId,
    ]);
    if (item.difference === 'loss') {
      const units: Moved[] = this.take(item.lineId, item.at, item.condition, item.goods).map((each) => ({
        balance: each.balance,
        quantity: each.quantity,
        pieces: each.pieces,
      }));
      const groups = this.byOrigin(units);
      this.moveTo(movement, units, { kind: 'gone' });
      const unit = this.unit(item.at.siteId, item.at.businessUnitId);
      return this.valuedOutflow(item.lineId, movement, unit, item.goods.skuId, groups, 'stock.count-loss');
    }
    if (item.goods.receiptOriginId !== undefined) refuse('invalid-item', item.lineId, [{ kind: 'receipt-origin' }]);
    const counted = this.countedOrigin(item.lineId, movement, 'surplus', item.at, item.condition, {
      skuId: item.goods.skuId,
      quantity: item.goods.quantity,
      ...(item.goods.pieceCodes === undefined ? {} : { pieceCodes: item.goods.pieceCodes }),
      owner: { kind: 'unknown' },
    });
    this.holdAsExcess(item.lineId, item.at, item.goods.skuId, item.reason, counted, item.goods.quantity);
    return { kind: 'unknown' };
  }

  /**
   * Reversal (7.5, 13.4; PRD-MOD-011, PRD-ACS-014, PRD-LED-017, PRD-LED-018): undoes units of a movement, within what
   * it moved and was not reversed (`exceeds-source`). Built for the two the golden scenarios need: a receipt count made
   * in error (G13), whose units leave custody and whose value comes off at the value its cost added; and a count loss
   * (G3, 8.4), whose units come back at the cost the loss took; and a condition change made in error, such as a
   * mistaken damage confirmation, whose units return to the condition they left (13.15; PRD-STK-017; S2-F08-T01); and a
   * cost established made in error, value only, as a PT's reversal before the scan-in sends it (13.21; S2-F09-T01). A
   * reversal of any other kind is not built yet (`invalid-item`, naming the kind).
   */
  protected reversal(item: ItemOf<'reversal'>): ItemValue {
    this.checkGoodsShape(item.lineId, item.goods);
    const reversed = this.reversed.get(item.movementId);
    if (reversed === undefined)
      refuse('invalid-item', item.lineId, [{ kind: 'movement', movementId: item.movementId }]);
    if (reversed.kind === 'condition-change') return this.reverseConditionChange(item, reversed);
    // Goods of Unknown SKU are named by their origin only for a condition change's reversal (13.15) and a receipt
    // count's (13.18).
    const { goods } = item;
    if (goods.skuId === null) {
      if (reversed.kind === 'receipt-count') return this.reverseUnknownInflow({ ...item, goods }, reversed);
      refuse('invalid-item', item.lineId, [{ kind: 'receipt-origin', receiptOriginId: goods.receiptOriginId }]);
    }
    const ofSku = { ...item, goods };
    if (reversed.kind === 'cost-established') return this.reverseCostEstablished(ofSku, reversed);
    if (reversed.kind === 'receipt-count') return this.reverseInflow(ofSku, reversed);
    if (reversed.kind === 'count-difference' && reversed.direction === 'out') return this.reverseLoss(ofSku, reversed);
    refuse('invalid-item', item.lineId, [{ kind: 'reversal-of', movementKind: reversed.kind }]);
  }

  /**
   * A condition change made in error (13.15; PRD-STK-017, PRD-ACS-014; S2-F08-T01), such as a mistaken damage
   * confirmation, which Plan admits only under the approval the request carries: its units, free at the place named in
   * the condition it gave them, return to the condition they left, of the same origins, within what it changed and was
   * not reversed (`exceeds-source`). The movement names the one it reverses; the change itself is never edited. Units
   * still held, such as by their quarantine, are `held` until that hold ends by its own event in the same request or
   * before (6.2), except those of the holds the change carried with its goods (13.17), whose claims it carries back,
   * as many units of each as the change carried and no reversal carried back yet. No value moves; valued for its
   * approval as the condition change was (13.10).
   */
  private reverseConditionChange(item: ItemOf<'reversal'>, reversed: SaleState): ItemValue {
    const into = reversed.legs.filter((leg) => leg.direction === 'in');
    const left = reversed.legs.find((leg) => leg.direction === 'out')?.condition;
    const gave = into[0]?.condition;
    if (left === undefined || gave === undefined) throw new Error('A condition change without its legs');
    const { goods } = item;
    // The origins the goods may be of: those the change moved, of the SKU named, or the one named (13.3).
    const origins = [...new Set(into.map((leg) => leg.originId))].filter((originId) => {
      if (goods.receiptOriginId !== undefined && originId !== goods.receiptOriginId) return false;
      return this.origin(item.lineId, originId).skuId === goods.skuId;
    });
    const room = (originId: string) =>
      into.filter((leg) => leg.originId === originId).reduce((sum, leg) => sum + leg.quantity, 0) -
      (reversed.returned.get(originId)?.quantity ?? 0);
    if (goods.quantity > origins.reduce((sum, originId) => sum + room(originId), 0)) {
      refuse('exceeds-source', item.lineId, [{ kind: 'movement', movementId: reversed.id }]);
    }
    const taken: ReturnType<typeof this.take> = [];
    // The holds the change carried, back with their units, no more of each than it carried and is not back yet (13.17).
    const carry = {
      allows: (claim: { readonly headerId: string; readonly quantity: number }) =>
        Math.min(claim.quantity, reversed.carried.get(claim.headerId) ?? 0),
      use: (claim: { readonly headerId: string }, quantity: number) => {
        reversed.carried.set(claim.headerId, (reversed.carried.get(claim.headerId) ?? 0) - quantity);
      },
    };
    if (goods.pieceCodes !== undefined) {
      for (const code of goods.pieceCodes) {
        if (!reversed.pieceIds.has(this.piece(item.lineId, code).id)) {
          refuse('exceeds-source', item.lineId, [{ kind: 'piece', code }]);
        }
      }
      taken.push(...this.take(item.lineId, item.at, gave, goods));
    } else {
      let wanted = goods.quantity;
      for (const originId of origins) {
        const quantity = Math.min(wanted, room(originId));
        if (quantity <= 0) continue;
        taken.push(
          ...this.take(item.lineId, item.at, gave, { ...goods, quantity, receiptOriginId: originId }, { carry }),
        );
        wanted -= quantity;
        if (wanted === 0) break;
      }
    }
    const brand = this.goodsBrand(goods);
    const movement = this.newMovement(
      'reversal',
      item.lineId,
      item.at.siteId,
      item.at.businessUnitId,
      [goods.skuId],
      goods.skuId === null && brand !== null ? [brand] : undefined,
    );
    movement.reversesMovementId = reversed.id;
    this.moveUnits(item.lineId, movement, taken, {
      businessUnitId: item.at.businessUnitId,
      locationId: item.at.locationId,
      condition: left,
    });
    for (const each of taken) {
      const originId = each.balance.receiptOriginId;
      const done = reversed.returned.get(originId) ?? { quantity: 0, value: 0 };
      reversed.returned.set(originId, { quantity: done.quantity + each.quantity, value: done.value });
    }
    return this.costOfUnits(item.lineId, item.at, this.unitsLeaving(movement));
  }

  /**
   * A receipt count of goods of a product not yet set up made in error (13.18; goods-in 4.11; PRD-REC-019, S2-F02-T05):
   * its units, free at the place in good condition, of the origin the count made, which the item names, leave custody,
   * within what the count moved and was not reversed (`exceeds-source`). No cost is ever established on an origin of
   * Unknown SKU (13.14), so no value moves and nothing posts; the movement's brand set is the brand they were counted
   * under (14.1; RR-555).
   */
  private reverseUnknownInflow(
    item: ItemOf<'reversal'> & { readonly goods: OriginGoods },
    reversed: SaleState,
  ): ItemValue {
    const [leg] = reversed.legs;
    if (leg === undefined) throw new Error('A receipt count without its leg');
    if (item.goods.receiptOriginId !== leg.originId) {
      refuse('invalid-item', item.lineId, [{ kind: 'receipt-origin', receiptOriginId: item.goods.receiptOriginId }]);
    }
    const done = reversed.returned.get(leg.originId)?.quantity ?? 0;
    if (item.goods.quantity > leg.quantity - done) {
      refuse('exceeds-source', item.lineId, [{ kind: 'movement', movementId: reversed.id }]);
    }
    const units: Moved[] = this.take(item.lineId, item.at, 'good', item.goods).map((each) => ({
      balance: each.balance,
      quantity: each.quantity,
      pieces: each.pieces,
    }));
    const brand = this.goodsBrand(item.goods);
    const movement = this.newMovement(
      'reversal',
      item.lineId,
      item.at.siteId,
      item.at.businessUnitId,
      [null],
      brand === null ? undefined : [brand],
    );
    movement.reversesMovementId = reversed.id;
    this.moveTo(movement, units, { kind: 'gone' });
    reversed.returned.set(leg.originId, { quantity: done + item.goods.quantity, value: 0 });
    return { kind: 'unknown' };
  }

  /**
   * A receipt count made in error (7.5; PRD-LED-018, DEC-034): its units, free at the place, leave custody, and the
   * value its cost put into the pool for them comes off: the exact share of the origin's established value, or
   * `rule-not-set` (SL-2). Under moving average from the pool; only a part that would take the pool below zero is a
   * separate `variance`. Under FIFO from the origin's own layer and the layers that came from it in that pool, while
   * they hold the units and that value; any rest would come off other layers, which is OPEN (SL-27), so such a reversal
   * is `rule-not-set`. Posts `stock.cost-established-reversal` (books-and-posting 7.2).
   */
  private reverseInflow(item: SkuReversal, reversed: SaleState): ItemValue {
    const [leg] = reversed.legs;
    if (leg === undefined) throw new Error('A receipt count without its leg');
    const origin = this.origin(item.lineId, leg.originId);
    if (item.goods.receiptOriginId !== undefined && item.goods.receiptOriginId !== origin.id) {
      refuse('invalid-item', item.lineId, [{ kind: 'receipt-origin', receiptOriginId: item.goods.receiptOriginId }]);
    }
    for (const code of item.goods.pieceCodes ?? []) {
      const piece = this.piece(item.lineId, code);
      if (!reversed.pieceIds.has(piece.id)) refuse('exceeds-source', item.lineId, [{ kind: 'piece', code }]);
    }
    const done = reversed.returned.get(origin.id)?.quantity ?? 0;
    if (item.goods.quantity > leg.quantity - done) {
      refuse('exceeds-source', item.lineId, [{ kind: 'movement', movementId: reversed.id }]);
    }
    const units: Moved[] = this.take(item.lineId, item.at, 'good', { ...item.goods, receiptOriginId: origin.id }).map(
      (each) => ({ balance: each.balance, quantity: each.quantity, pieces: each.pieces }),
    );
    const movement = this.newMovement('reversal', item.lineId, item.at.siteId, item.at.businessUnitId, [
      item.goods.skuId,
    ]);
    movement.reversesMovementId = reversed.id;
    this.moveTo(movement, units, { kind: 'gone' });
    reversed.returned.set(origin.id, { quantity: done + item.goods.quantity, value: 0 });
    const quantity = item.goods.quantity;
    if (!this.valued(origin)) {
      // Pre-PT units take no value (7.6); supplier-owned ones none from a pool (7.2), though their cost is known.
      return origin.valueKnown
        ? { kind: 'known', amountPaise: paise(this.knownCost(origin).pRate * quantity) }
        : { kind: 'unknown' };
    }
    const entered = this.valuing.entered.get(origin.id) ?? 0;
    if (entered < quantity) throw new Error('A reversal of more valued units than entered the pools');
    const { established } = this.knownCost(origin);
    const added = share(established, quantity, entered);
    if (added === undefined) refuse('rule-not-set', item.lineId, SL('SL-2'));
    const unit = this.unit(item.at.siteId, item.at.businessUnitId);
    const pool = this.poolOf(item.lineId, unit, item.goods.skuId);
    if (quantity > pool.quantity) throw new Error('A pool holds fewer valued units than its goods');
    const kind = 'stock.cost-established-reversal';
    const before = { quantity: pool.quantity, value: pool.value };
    let off = added;
    const layers: ValuationLayerEntry[] = [];
    if (pool.formula === 'fifo') {
      // The inflow's own layer and those that came from it in this pool, oldest first (7.4, 7.5).
      const ordered = oldestFirst(pool);
      const own = new Set(pool.layers.filter((layer) => layer.receiptOriginId === origin.id).map((layer) => layer.id));
      for (const layer of ordered) if (layer.fromLayerId !== null && own.has(layer.fromLayerId)) own.add(layer.id);
      const walked = takeInOrder(
        ordered.filter((layer) => own.has(layer.id)),
        quantity,
        (layer) => ({ quantity: layer.quantityLeft, value: layer.valueLeft }),
      );
      if (walked === 'not-whole') refuse('rule-not-set', item.lineId, SL('SL-2'));
      // What is still to come off other layers is OPEN (SL-27).
      if (walked === 'short' || sumPaise(walked.map((part) => part.value)) !== added) {
        refuse('rule-not-set', item.lineId, SL('SL-27'));
      }
      for (const part of walked) {
        part.from.quantityLeft -= part.quantity;
        part.from.valueLeft = paise(part.from.valueLeft - part.value);
        part.from.changed = true;
        layers.push({ layerId: part.from.id, pieceId: null, quantity: part.quantity, value: negate(part.value) });
      }
    } else {
      // Only the part that would take the pool below zero is a separate variance (PRD-LED-018).
      off = paise(Math.min(added, pool.value));
    }
    pool.quantity -= quantity;
    pool.value = paise(pool.value - off);
    pool.changed = true;
    this.poolValuation(
      movement,
      origin,
      pool,
      { quantity: -quantity, value: negate(off), before },
      { eventKind: kind, component: 'to-pool' },
      layers,
    );
    this.postShare(movement, unit.businessUnitId, kind, 'to-pool', off);
    this.postShare(movement, unit.businessUnitId, kind, 'variance', added - off);
    origin.establishedValuePaise = paise(established - added);
    origin.lastStateMovementId = movement.id;
    origin.stateChanged = true;
    return { kind: 'known', amountPaise: added };
  }

  /**
   * A cost established made in error (7.5, 13.4, 13.21; PRD-LED-018, PRD-REC-019; goods-in 6.7; S2-F09-T01), as a PT's
   * reversal before the scan-in sends it: value only, so its units stay where they are. The item names the origin and
   * every unit of it, all in custody at the place named (`invalid-item` otherwise: not built for units elsewhere); the
   * cost must be the origin's latest change of value, which no reversal or later cost adjustment followed
   * (`exceeds-source`). Owned units leave their pool at the value the cost added, not the formula cost: under moving
   * average from the pool, only a part that would take it below zero a separate `variance`; under FIFO from the origin's
   * own layer and those that came from it in the pool, any rest being OPEN (SL-27, `rule-not-set`). Units the
   * Organisation does not own recorded their cost only, so nothing leaves a pool and nothing posts (7.2). Either way the
   * origin's cost is Unknown again (7.6), so a corrected PT establishes it anew. Posts
   * `stock.cost-established-reversal` (books-and-posting 7.2); valued for its approval at the cost it takes off.
   */
  private reverseCostEstablished(item: SkuReversal, reversed: SaleState): ItemValue {
    const originId = item.goods.receiptOriginId;
    if (originId === undefined || item.goods.pieceCodes !== undefined) {
      refuse('invalid-item', item.lineId, [{ kind: 'receipt-origin' }]);
    }
    const origin = this.origin(item.lineId, originId);
    if (origin.skuId !== item.goods.skuId) {
      refuse('invalid-item', item.lineId, [{ kind: 'receipt-origin', receiptOriginId: origin.id }]);
    }
    if (!origin.valueKnown || origin.lastStateMovementId !== reversed.id) {
      refuse('exceeds-source', item.lineId, [{ kind: 'movement', movementId: reversed.id }]);
    }
    const rows = this.originBalances(origin);
    const units = rows.reduce((sum, row) => sum + row.quantity, 0);
    const elsewhere = rows.some(
      (row) =>
        row.heldAs !== 'custody' ||
        row.siteId !== item.at.siteId ||
        row.businessUnitId !== item.at.businessUnitId ||
        row.locationId !== item.at.locationId,
    );
    if (elsewhere) refuse('invalid-item', item.lineId, [{ kind: 'not-built', item: 'cost-reversal-elsewhere' }]);
    if (item.goods.quantity !== units) refuse('invalid-item', item.lineId, [{ kind: 'quantity' }]);
    const movement = this.newMovement('reversal', item.lineId, item.at.siteId, item.at.businessUnitId, [
      item.goods.skuId,
    ]);
    movement.reversesMovementId = reversed.id;
    const { pRate, established } = this.knownCost(origin);
    const unknownAgain = () => {
      origin.valueKnown = false;
      origin.pRatePaise = null;
      origin.establishedValuePaise = null;
      origin.lastStateMovementId = movement.id;
      origin.stateChanged = true;
    };
    if (!this.valued(origin)) {
      // Recorded only, for goods the Organisation does not own (7.2): the approval is on that cost (13.11).
      unknownAgain();
      return { kind: 'known', amountPaise: paise(pRate * units) };
    }
    const entered = this.valuing.entered.get(origin.id) ?? 0;
    if (entered !== units) throw new Error('A reversal of a cost established whose units are not all in the pool');
    const unit = this.unit(item.at.siteId, item.at.businessUnitId);
    const pool = this.poolOf(item.lineId, unit, item.goods.skuId);
    if (units > pool.quantity) throw new Error('A pool holds fewer valued units than its goods');
    const kind = 'stock.cost-established-reversal';
    const before = { quantity: pool.quantity, value: pool.value };
    let off = established;
    const layers: ValuationLayerEntry[] = [];
    if (pool.formula === 'fifo') {
      // The inflow's own layer and those that came from it in this pool, oldest first (7.4, 7.5).
      const ordered = oldestFirst(pool);
      const own = new Set(pool.layers.filter((layer) => layer.receiptOriginId === origin.id).map((layer) => layer.id));
      for (const layer of ordered) if (layer.fromLayerId !== null && own.has(layer.fromLayerId)) own.add(layer.id);
      const walked = takeInOrder(
        ordered.filter((layer) => own.has(layer.id)),
        units,
        (layer) => ({ quantity: layer.quantityLeft, value: layer.valueLeft }),
      );
      if (walked === 'not-whole') refuse('rule-not-set', item.lineId, SL('SL-2'));
      // What is still to come off other layers is OPEN (SL-27).
      if (walked === 'short' || sumPaise(walked.map((part) => part.value)) !== established) {
        refuse('rule-not-set', item.lineId, SL('SL-27'));
      }
      for (const part of walked) {
        part.from.quantityLeft -= part.quantity;
        part.from.valueLeft = paise(part.from.valueLeft - part.value);
        part.from.changed = true;
        layers.push({ layerId: part.from.id, pieceId: null, quantity: part.quantity, value: negate(part.value) });
      }
    } else {
      // Only the part that would take the pool below zero is a separate variance (PRD-LED-018).
      off = paise(Math.min(established, pool.value));
    }
    pool.quantity -= units;
    pool.value = paise(pool.value - off);
    pool.changed = true;
    this.poolValuation(
      movement,
      origin,
      pool,
      { quantity: -units, value: negate(off), before },
      { eventKind: kind, component: 'to-pool' },
      layers,
    );
    this.postShare(movement, unit.businessUnitId, kind, 'to-pool', off);
    this.postShare(movement, unit.businessUnitId, kind, 'variance', established - off);
    unknownAgain();
    return { kind: 'known', amountPaise: established };
  }

  /**
   * A count loss reversed (8.4; PRD-LED-017, PRD-STK-014): found goods matched to the recorded loss come back at the
   * place named with their receipt origin, owner and coverage, at the cost the loss took (`stock.count-loss-reversal`).
   * Pieces come back by their codes; a quantity takes the loss's origins newest first. Goods counted as a surplus
   * with no origin name that surplus origin, whose units at the place they take the place of, once its excess hold is
   * released by its link to the loss (6.1 `loss-link`). They come back unaccepted, unless a piece was accepted at the
   * Site before (6.3).
   */
  private reverseLoss(item: SkuReversal, reversed: SaleState): ItemValue {
    const back = new Map<string, OriginGroup>();
    const add = (origin: OriginState, quantity: number, piece: PieceState | null) => {
      const group = back.get(origin.id) ?? { origin, quantity: 0, pieces: [] };
      group.quantity += quantity;
      if (piece !== null) group.pieces.push(piece);
      back.set(origin.id, group);
    };
    const outOf = (originId: string) =>
      reversed.legs.filter((leg) => leg.originId === originId).reduce((sum, leg) => sum + leg.quantity, 0);
    const backOf = (originId: string) => reversed.returned.get(originId)?.quantity ?? 0;
    if (this.sku(item.goods.skuId).pieceTracked) {
      if (item.replacesOriginId !== undefined) refuse('invalid-item', item.lineId, [{ kind: 'replaces-origin' }]);
      for (const code of item.goods.pieceCodes ?? []) {
        const piece = this.piece(item.lineId, code);
        if (!reversed.pieceIds.has(piece.id) || piece.inCustody || piece.lastMovementId !== reversed.id) {
          refuse('exceeds-source', item.lineId, [{ kind: 'piece', code }]);
        }
        add(this.origin(item.lineId, piece.receiptOriginId), 1, piece);
      }
    } else {
      let left = item.goods.quantity;
      for (const originId of [...new Set(reversed.legs.map((leg) => leg.originId))].reverse()) {
        if (left === 0) break;
        if (item.goods.receiptOriginId !== undefined && originId !== item.goods.receiptOriginId) continue;
        const take = Math.min(left, outOf(originId) - backOf(originId));
        if (take <= 0) continue;
        add(this.origin(item.lineId, originId), take, null);
        left -= take;
      }
      if (left > 0) refuse('exceeds-source', item.lineId, [{ kind: 'movement', movementId: reversed.id }]);
    }
    for (const group of back.values()) {
      if (group.quantity > outOf(group.origin.id) - backOf(group.origin.id)) {
        refuse('exceeds-source', item.lineId, [{ kind: 'movement', movementId: reversed.id }]);
      }
    }
    const to = this.unit(item.at.siteId, item.at.businessUnitId);
    const sold = this.unit(reversed.siteId, reversed.businessUnitId);
    if (this.poolOf(item.lineId, to, item.goods.skuId) !== this.poolOf(item.lineId, sold, item.goods.skuId)) {
      // Found at a place of another pool: value moves as for a transfer between pools (8.4, 7.8), not built yet.
      refuse('route-not-allowed', item.lineId, [{ kind: 'route', route: 'reversal-between-pools' }]);
    }
    const movement = this.newMovement('reversal', item.lineId, item.at.siteId, item.at.businessUnitId, [
      item.goods.skuId,
    ]);
    movement.reversesMovementId = reversed.id;
    if (item.replacesOriginId !== undefined) {
      // The surplus units the found goods were counted as leave that origin (8.4).
      const surplus = this.take(item.lineId, item.at, 'good', {
        skuId: item.goods.skuId,
        quantity: item.goods.quantity,
        receiptOriginId: item.replacesOriginId,
      });
      for (const each of surplus) {
        const accepted = Math.min(each.quantity, each.balance.accepted);
        this.addTo(each.balance, -each.quantity, -accepted);
        movement.legs.push(this.leg('out', each.balance, each.quantity, accepted));
      }
    }
    for (const group of back.values()) {
      const target = this.balanceFor(item.at.siteId, item.at.businessUnitId, item.at.locationId, 'good', group.origin);
      const accepted = group.pieces.filter((piece) => piece.acceptedSiteId === item.at.siteId).length;
      this.addTo(target, group.quantity, accepted);
      movement.legs.push(this.leg('in', target, group.quantity, accepted));
      for (const piece of group.pieces) this.backInCustody(piece, item.at, 'good', movement);
    }
    const { total, allKnown } = this.valueBack(
      item.lineId,
      movement,
      reversed,
      [...back.values()],
      to,
      item.goods.skuId,
      'stock.count-loss-reversal',
    );
    return this.itemValue(total, allKnown);
  }

  /**
   * Piece correction (8.4, 13.4; PRD-STK-015, DEC-035): piece A, found at the place named, was wrongly named by a sale,
   * and piece B of the same SKU, still in custody by the ledger, is the one that left. A reversal brings A back into
   * custody with its own receipt origin, coverage and acceptance, and a movement of the sale's kind records B as the
   * piece that left, both linked to the sale, which never changes. Same pool: no value moves. Between pools value
   * would move as for a transfer (7.8), not built yet (`route-not-allowed`). While SL-28 is open, pieces of different
   * owners or legal entities are `rule-not-set`, and the caller takes the no-match route.
   */
  protected pieceCorrection(item: ItemOf<'piece-correction'>): ItemValue {
    if (item.countId !== undefined) this.countOf(item.lineId, item.countId, item.at);
    const corrected = this.reversed.get(item.movementId);
    if (corrected?.kind !== 'sale-issue')
      refuse('invalid-item', item.lineId, [{ kind: 'movement', movementId: item.movementId }]);
    const found = this.piece(item.lineId, item.foundPieceCode);
    const missing = this.piece(item.lineId, item.missingPieceCode);
    if (found.skuId === null || found.skuId !== missing.skuId) {
      refuse('invalid-item', item.lineId, [{ kind: 'piece', code: item.missingPieceCode }]);
    }
    if (found.inCustody || found.lastMovementId !== corrected.id || !corrected.pieceIds.has(found.id)) {
      refuse('exceeds-source', item.lineId, [{ kind: 'piece', code: item.foundPieceCode }]);
    }
    const foundOrigin = this.origin(item.lineId, found.receiptOriginId);
    const missingOrigin = this.origin(item.lineId, missing.receiptOriginId);
    if (
      foundOrigin.ownerKind !== missingOrigin.ownerKind ||
      foundOrigin.scope.legalEntityId !== missingOrigin.scope.legalEntityId
    ) {
      refuse('rule-not-set', item.lineId, SL('SL-28'));
    }
    const skuId = found.skuId;
    const missingAt = {
      siteId: missing.siteId,
      businessUnitId: missing.businessUnitId,
      locationId: missing.locationId,
    };
    if (missingAt.locationId === null || missing.heldAs !== 'custody') {
      refuse('piece-not-at-place', item.lineId, [{ kind: 'piece', code: item.missingPieceCode }]);
    }
    const taken = this.take(item.lineId, { ...missingAt, locationId: missingAt.locationId }, missing.condition, {
      skuId,
      quantity: 1,
      pieceCodes: [missing.code],
    });
    const pool = (siteId: string, businessUnitId: string) =>
      this.poolOf(item.lineId, this.unit(siteId, businessUnitId), skuId);
    const salePool = pool(corrected.siteId, corrected.businessUnitId);
    if (
      pool(item.at.siteId, item.at.businessUnitId) !== salePool ||
      pool(missing.siteId, missing.businessUnitId) !== salePool
    ) {
      refuse('route-not-allowed', item.lineId, [{ kind: 'route', route: 'piece-correction-between-pools' }]);
    }
    const back = this.newMovement('reversal', item.lineId, item.at.siteId, item.at.businessUnitId, [skuId]);
    back.reversesMovementId = corrected.id;
    back.correctionOfMovementId = corrected.id;
    const target = this.balanceFor(item.at.siteId, item.at.businessUnitId, item.at.locationId, 'good', foundOrigin);
    const accepted = found.acceptedSiteId === item.at.siteId ? 1 : 0;
    this.addTo(target, 1, accepted);
    back.legs.push(this.leg('in', target, 1, accepted));
    this.backInCustody(found, item.at, 'good', back);
    const left = this.newMovement('sale-issue', item.lineId, missing.siteId, missing.businessUnitId, [skuId]);
    left.correctionOfMovementId = corrected.id;
    this.moveTo(
      left,
      taken.map((each) => ({ balance: each.balance, quantity: each.quantity, pieces: each.pieces })),
      { kind: 'gone' },
    );
    return this.valued(foundOrigin) && this.valued(missingOrigin)
      ? { kind: 'known', amountPaise: paise(0) }
      : { kind: 'unknown' };
  }
}
