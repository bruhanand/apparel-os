import { paise } from '@apparel-os/domain';
import { freeUnits } from '../availability.js';
import { refuse, type ItemValue, type ValuedItem } from '../request.js';
import { negate, oldestFirst, share, sumPaise, takeInOrder } from '../valuation.js';
import type { ClaimState, OriginState, PieceState } from '../working.js';
import { SaleItems } from './sale.js';
import { SL, type Moved, type OriginGroup, type SaleState, type ValuationLayerEntry } from './state.js';

// Disposal, count differences, reversals and piece corrections (stock-ledger 7.5, 7.9, 8.2 to 8.4, 13.4; S1-F10-T06).

type ItemOf<K extends ValuedItem['kind']> = Extract<ValuedItem, { kind: K }>;

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
      ownerKind: null,
    });
    this.holdAsExcess(item.lineId, item.at, item.goods.skuId, item.reason, counted, item.goods.quantity);
    return { kind: 'unknown' };
  }

  /**
   * Reversal (7.5, 13.4; PRD-MOD-011, PRD-ACS-014, PRD-LED-017, PRD-LED-018): undoes units of a movement, within what
   * it moved and was not reversed (`exceeds-source`). Built for the two the golden scenarios need: a receipt count made
   * in error (G13), whose units leave custody and whose value comes off at the value its cost added; and a count loss
   * (G3, 8.4), whose units come back at the cost the loss took. A reversal of any other kind is not built yet
   * (`invalid-item`, naming the kind).
   */
  protected reversal(item: ItemOf<'reversal'>): ItemValue {
    this.checkGoodsShape(item.lineId, item.goods);
    const reversed = this.reversed.get(item.movementId);
    if (reversed === undefined)
      refuse('invalid-item', item.lineId, [{ kind: 'movement', movementId: item.movementId }]);
    if (reversed.kind === 'receipt-count') return this.reverseInflow(item, reversed);
    if (reversed.kind === 'count-difference' && reversed.direction === 'out') return this.reverseLoss(item, reversed);
    refuse('invalid-item', item.lineId, [{ kind: 'reversal-of', movementKind: reversed.kind }]);
  }

  /**
   * A receipt count made in error (7.5; PRD-LED-018, DEC-034): its units, free at the place, leave custody, and the
   * value its cost put into the pool for them comes off: the exact share of the origin's established value, or
   * `rule-not-set` (SL-2). Under moving average from the pool; only a part that would take the pool below zero is a
   * separate `variance`. Under FIFO from the origin's own layer and the layers that came from it in that pool, while
   * they hold the units and that value; any rest would come off other layers, which is OPEN (SL-27), so such a reversal
   * is `rule-not-set`. Posts `stock.cost-established-reversal` (books-and-posting 7.2).
   */
  private reverseInflow(item: ItemOf<'reversal'>, reversed: SaleState): ItemValue {
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
   * A count loss reversed (8.4; PRD-LED-017, PRD-STK-014): found goods matched to the recorded loss come back at the
   * place named with their receipt origin, owner and coverage, at the cost the loss took (`stock.count-loss-reversal`).
   * Pieces come back by their codes; a quantity takes the loss's origins newest first. Goods counted as a surplus
   * with no origin name that surplus origin, whose units at the place they take the place of, once its excess hold is
   * released by its link to the loss (6.1 `loss-link`). They come back unaccepted, unless a piece was accepted at the
   * Site before (6.3).
   */
  private reverseLoss(item: ItemOf<'reversal'>, reversed: SaleState): ItemValue {
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
