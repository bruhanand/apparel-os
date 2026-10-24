import type { Condition, PlacedHoldKind } from './request.js';
import { freeUnits, heldOnce, reservableUnits, type BalanceClaims } from './availability.js';

// The four quantities of stock search, worked from each balance in custody and what is claimed on it (goods-in 9.2;
// stock-ledger 6.2, 6.3, 13.6; PRD-STK-001, PRD-STK-003; S2-F11-T01). Pure: no database, no clock (code-house-rules 2).
// They share the arithmetic of the Availability read and of Recheck (domain/availability.ts), so the three never count
// apart.

/** The units the claims of one kind of hold outside reservations hold on a balance, before they count once (6.2). */
export interface HeldByKind {
  readonly kind: PlacedHoldKind;
  readonly quantity: number;
}

/** One balance in custody with what is claimed on it, as the positions read takes it from the ledger's rows. */
export interface PositionBalance {
  readonly balanceId: string;
  readonly receiptOriginId: string;
  readonly condition: Condition;
  readonly quantity: number;
  readonly accepted: number;
  /** The units its reservations claim. */
  readonly reserved: number;
  /** The claims of holds outside reservations on it, one entry a kind. */
  readonly holds: readonly HeldByKind[];
  /** Its origin's covered quantity, wherever the origin's units are (13.9). */
  readonly covered: number;
  /** What the reservations of its origin claim, at every balance of it. */
  readonly reservedEverywhere: number;
  /** A count freeze covers it, whether or not the reader may see the freeze (8.1; DEC-117). */
  readonly frozen: boolean;
}

/** The four quantities of stock search at a balance, or at a place summed over its balances (goods-in 9.2). */
export interface PositionQuantities {
  /** In custody at the place, in any condition. */
  readonly physical: number;
  /** Good, covered by an official PT, accepted and free of every hold and reservation, with no count freeze (6.2, 6.3). */
  readonly available: number;
  /** Good and free of every hold and reservation, but not yet covered by a PT or not yet accepted (scanned in). */
  readonly waiting: number;
  /** Under any hold outside a reservation, holds that overlap counting once (6.2). */
  readonly held: number;
  /** The units each kind of hold holds, in the order of the kinds' names; kinds may overlap, so they may add to more. */
  readonly heldByKind: readonly HeldByKind[];
}

const byKind = (holds: Iterable<HeldByKind>): HeldByKind[] =>
  [...holds].filter((each) => each.quantity > 0).sort((a, b) => a.kind.localeCompare(b.kind));

/**
 * The quantities of each balance given, by its identifier. The balances are given oldest first, as the Availability
 * read takes them (13.9: by expiry, count date and identifier), and with every balance of each origin they name, so an
 * origin's covered quantity is drawn on once: by its reservations everywhere, then by the balances before (PRD-INT-005).
 */
export function quantitiesOf(balances: readonly PositionBalance[]): Map<string, PositionQuantities> {
  const drawn = new Map<string, number>();
  const answer = new Map<string, PositionQuantities>();
  for (const each of balances) {
    const claims: BalanceClaims = {
      quantity: each.quantity,
      accepted: each.accepted,
      reserved: each.reserved,
      holdClaims: each.holds.reduce((sum, hold) => sum + hold.quantity, 0),
    };
    const outsideReservations = Math.max(0, each.quantity - each.reserved);
    const before = drawn.get(each.receiptOriginId) ?? 0;
    // Good units free of holds and reservations, accepted and covered: what may be sold or moved but for a freeze.
    const ready =
      each.condition === 'good'
        ? reservableUnits(claims, { covered: each.covered, reservedEverywhere: each.reservedEverywhere + before })
        : 0;
    const available = each.frozen ? 0 : ready;
    drawn.set(each.receiptOriginId, before + available);
    answer.set(each.balanceId, {
      physical: each.quantity,
      available,
      waiting: each.condition === 'good' ? freeUnits(claims) - ready : 0,
      held: heldOnce(claims),
      heldByKind: byKind(
        each.holds.map((hold) => ({ kind: hold.kind, quantity: Math.min(outsideReservations, hold.quantity) })),
      ),
    });
  }
  return answer;
}

/** The quantities of a place: each summed over its balances, each kind of hold together (goods-in 9.2). */
export function totalOf(quantities: readonly PositionQuantities[]): PositionQuantities {
  const kinds = new Map<PlacedHoldKind, number>();
  for (const each of quantities) {
    for (const hold of each.heldByKind) kinds.set(hold.kind, (kinds.get(hold.kind) ?? 0) + hold.quantity);
  }
  const sum = (field: 'physical' | 'available' | 'waiting' | 'held') =>
    quantities.reduce((total, each) => total + each[field], 0);
  return {
    physical: sum('physical'),
    available: sum('available'),
    waiting: sum('waiting'),
    held: sum('held'),
    heldByKind: byKind([...kinds].map(([kind, quantity]) => ({ kind, quantity }))),
  };
}
