import type { LedgerItem, NamedGoods, Place } from '../../ledger/index.js';

// The ledger items a damage report, its decision and a reversal send (stock-ledger 6.1, 13.4, 13.5, 13.15; goods-in 8).
// Plain functions: no database, no clock (code-house-rules 2).

/** A photo of the damage, attached to its report as evidence carrying no restricted class (goods-in 8.2; RR-453). */
export const DAMAGE_PHOTO = { kind: 'stock.damage-photo', restrictedClasses: [] } as const;

/** The damage hold a report places at once, on the goods in good condition where they are (6.1; PRD-DMG-001). */
export function damageHoldItem(lineId: string, at: Place, goods: NamedGoods, reason: string): LedgerItem {
  return {
    kind: 'place-hold',
    lineId,
    holdKind: 'damage',
    reason: reason.trim(),
    at,
    condition: 'good',
    goods: [goods],
  };
}

/** The reason a confirmation's quarantine records (6.1; PRD-DMG-006). */
const QUARANTINE_REASON = 'Confirmed damage';

/**
 * A confirmation (goods-in 8.3; 6.1, 2.3): the report's damage hold ends by its own event, `damage-confirmed`; the goods
 * take the damaged condition where they are; and a quarantine holds them, released only by an approved decision, never
 * by time (PRD-DMG-006). The condition change is the item the decision's value is on (DM-8).
 */
export function confirmationItems(
  lines: () => string,
  at: Place,
  goods: NamedGoods,
  holdId: string,
): { readonly items: LedgerItem[]; readonly valueOf: number } {
  return {
    items: [
      { kind: 'release-hold', lineId: lines(), holdId, event: 'damage-confirmed' },
      { kind: 'condition-change', lineId: lines(), at, from: 'good', to: 'damaged', goods },
      {
        kind: 'place-hold',
        lineId: lines(),
        holdKind: 'quarantine',
        reason: QUARANTINE_REASON,
        at,
        condition: 'damaged',
        goods: [goods],
      },
    ],
    valueOf: 1,
  };
}

/** A rejection (goods-in 8.3; PRD-DMG-003): only the report's damage hold ends, by its own event. */
export function rejectionItems(lineId: string, holdId: string): LedgerItem[] {
  return [{ kind: 'release-hold', lineId, holdId, event: 'report-rejected' }];
}

/**
 * A reversal of a confirmation (goods-in 8.3; PRD-STK-017; 13.15): the quarantine ends by an approved decision, the
 * condition change is reversed by a linked movement, and the damage hold is placed again, so the goods have their
 * earlier condition and holds. The reversal is the item the decision's value is on.
 */
export function reversalItems(
  lines: () => string,
  at: Place,
  goods: NamedGoods,
  confirmation: { readonly movementId: string; readonly quarantineHoldId: string },
  reason: string,
): { readonly items: LedgerItem[]; readonly valueOf: number } {
  return {
    items: [
      { kind: 'release-hold', lineId: lines(), holdId: confirmation.quarantineHoldId, event: 'approved-decision' },
      { kind: 'reversal', lineId: lines(), movementId: confirmation.movementId, at, goods },
      damageHoldItem(lines(), at, goods, reason),
    ],
    valueOf: 1,
  };
}
