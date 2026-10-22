import type { ItemValue, LedgerItem } from '../request.js';
import type { MovementEntry } from '../working.js';
import { TransferItems, type Units } from './transfer.js';

// Damage (stock-ledger 13.15; goods-in 8; S2-F08-T01): a damage hold and a condition change, valued for the approval
// of the damage report that places them, as a reservation is valued for a transfer's (13.10 "Value for approval"). The
// cost of units is worked out as for a reservation (`costOfUnits`, transfer.ts); a condition change's reversal is valued
// with the other reversals (corrections.ts).

export abstract class DamageItems extends TransferItems {
  /**
   * A damage hold (13.15; S2-F08-T01), valued for the approval of the damage report that places it as a reservation is:
   * the pool's cost of the units it claims, since a damage confirmation is approved on the goods' cost (domain-model 5;
   * DM-8, DEC-105). Every other hold answers no cost of its own (13.9).
   */
  protected override placeHold(item: Extract<LedgerItem, { kind: 'place-hold' }>): ItemValue {
    const value = super.placeHold(item);
    if (item.holdKind !== 'damage') return value;
    const hold = this.entries.holds.at(-1);
    if (hold === undefined) throw new Error('A hold without its entry');
    return this.costOfUnits(
      item.lineId,
      item.at,
      hold.claims.map((claim) => this.claimedUnits(claim)),
    );
  }

  /**
   * A condition change (13.15; S2-F08-T01), valued as a reservation is: the pool's cost of the units it changes, which a
   * damage confirmation is approved on (domain-model 5; DM-8, DEC-105). No value moves.
   */
  protected override conditionChange(item: Extract<LedgerItem, { kind: 'condition-change' }>): ItemValue {
    super.conditionChange(item);
    const movement = this.entries.movements.at(-1);
    if (movement === undefined) throw new Error('A condition change without its movement');
    return this.costOfUnits(item.lineId, item.at, this.unitsLeaving(movement));
  }

  /** The units a movement takes from where they were: its out legs, with its pieces (2.2). */
  protected unitsLeaving(movement: MovementEntry): Units[] {
    const pieces = movement.pieceIds.map((id) => this.pieces.get(id));
    return movement.legs
      .filter((leg) => leg.direction === 'out')
      .flatMap((leg): Units[] => {
        const own = pieces.filter((piece) => piece?.receiptOriginId === leg.receiptOriginId);
        if (own.length === 0)
          return [{ originId: leg.receiptOriginId, skuId: leg.skuId, quantity: leg.quantity, pieceId: null }];
        return own.map((piece) => ({
          originId: leg.receiptOriginId,
          skuId: leg.skuId,
          quantity: 1,
          pieceId: piece?.id ?? null,
        }));
      });
  }
}
