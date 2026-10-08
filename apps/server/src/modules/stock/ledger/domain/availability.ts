// The quantity arithmetic of one balance (stock-ledger 6.2, 6.3, 13.6, 13.9; PRD-INT-005, PRD-TRF-006): shared by
// Recheck and value and by the Availability read, so both count the same way. Pure: no database, no clock
// (code-house-rules 2).

/** What is claimed on one balance key: its units, accepted units, reserved units and the hold claims outside reservations. */
export interface BalanceClaims {
  readonly quantity: number;
  readonly accepted: number;
  readonly reserved: number;
  /** The sum of the claims of holds outside reservations on it. */
  readonly holdClaims: number;
}

/**
 * Units held outside reservations, counted once (6.2: "holds that overlap on the same units count once"). A quantity
 * claim names no unit, so a hold is taken to fall on units no other hold holds, as far as the units outside
 * reservations go; past them, holds overlap the units already held. So the held units are the hold claims, never more
 * than the units outside reservations. Taking holds apart this way never counts a held unit as free (13.9).
 */
export function heldOnce(balance: BalanceClaims): number {
  return Math.min(Math.max(0, balance.quantity - balance.reserved), balance.holdClaims);
}

/** available = quantity in custody − reserved − held units outside reservations, never below zero (6.2). */
export function freeUnits(balance: BalanceClaims): number {
  return Math.max(0, balance.quantity - balance.reserved - heldOnce(balance));
}

/** Free units that are also accepted: reserved and held units are taken to be accepted ones (6.3). */
export function acceptedFreeUnits(balance: BalanceClaims): number {
  return Math.max(0, Math.min(freeUnits(balance), balance.accepted - balance.reserved - heldOnce(balance)));
}

/**
 * Free units that are also covered (6.2, 6.3). An origin's covered quantity is a quantity of the origin, not of a
 * place: every reservation of its units, wherever they are, draws on it once, and held units at the balance are taken
 * to be covered ones, so a reservation never takes a unit that may be uncovered (13.9; PRD-INT-005).
 */
export function coveredFreeUnits(
  balance: BalanceClaims,
  origin: { readonly covered: number; readonly reservedEverywhere: number },
): number {
  const budget = origin.covered - origin.reservedEverywhere - heldOnce(balance);
  return Math.max(0, Math.min(freeUnits(balance), budget));
}

/** What a transfer, supplier-return or offline reservation may take from a good balance: free, accepted and covered. */
export function reservableUnits(
  balance: BalanceClaims,
  origin: { readonly covered: number; readonly reservedEverywhere: number },
): number {
  return Math.min(acceptedFreeUnits(balance), coveredFreeUnits(balance, origin));
}
