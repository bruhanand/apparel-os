// What a returned unit is worth (shared-calculations 7.1; PRD-RET-005, PRD-RET-006, PRD-RET-024, DEC-110).
// A line's entitlement is its sold quantity and paid value from the bill's snapshot, less every completed or pending
// return of it. Current MRP and current offers play no part, and the offer is not worked out again on the units kept.
// Whether a bill's round-off counts in its lines' paid value is OPEN (GC7-6): the caller passes the paid value.
// The tax split of a refund is OPEN for the CA (POL-10.11, V-72); only the refund amount is worked out here.

import type { Paise } from '@apparel-os/domain';
import { amountIn, amountOut } from '../numbers/amounts.js';
import { roundDownToPaise } from '../numbers/rounding.js';
import { fraction } from '../numbers/fraction.js';
import { type Result, ok, refusal, refused } from '../result.js';

export interface ReturnValueInput {
  /** The bill line as its snapshot recorded it. */
  readonly line: { readonly id: string; readonly soldQuantity: number; readonly paidValue: number };
  /** Every completed or pending return of the line, with the refund each took. */
  readonly earlierReturns: readonly {
    readonly quantity: number;
    readonly refund: number;
    readonly status: 'completed' | 'pending';
  }[];
  readonly quantity: number;
}

export interface ReturnValue {
  readonly line: string;
  readonly quantity: number;
  readonly refund: Paise;
  /** Units still returnable after this one, from the snapshot (PRD-RET-005). */
  readonly remainingQuantity: number;
}

function isWhole(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function returnValue(input: ReturnValueInput): Result<ReturnValue> {
  const { line } = input;
  if (!isWhole(line.soldQuantity))
    throw new RangeError(`Line ${line.id}: the sold quantity must be whole and above zero`);
  const paid = amountIn(line.paidValue, `Line ${line.id}: paid value`);
  if (!isWhole(input.quantity)) return refused(refusal('invalid-quantity', { line: line.id, input: 'quantity' }));

  const returnedBefore = input.earlierReturns.reduce((acc, r) => {
    if (!isWhole(r.quantity)) throw new RangeError(`Line ${line.id}: an earlier return has no whole quantity`);
    return acc + r.quantity;
  }, 0);
  const refundedBefore = input.earlierReturns.reduce((acc, r) => acc + amountIn(r.refund, 'An earlier refund'), 0n);
  const remaining = line.soldQuantity - returnedBefore;
  if (remaining < 0 || refundedBefore > paid) throw new Error(`Defect: line ${line.id} returned beyond its sale`);
  // PRD-RET-005, PRD-RET-006: more than the remaining quantity is refused; pending returns count against it.
  if (input.quantity > remaining) return refused(refusal('exceeds-entitlement', { line: line.id, input: 'quantity' }));

  // PRD-RET-024: each returned unit takes the paid value ÷ sold quantity, rounded down to whole paise; the return
  // that brings the returned quantity to the sold quantity takes all that remains.
  const perUnit = roundDownToPaise(fraction(paid, BigInt(line.soldQuantity)));
  const refund = input.quantity === remaining ? paid - refundedBefore : perUnit * BigInt(input.quantity);
  return ok({
    line: line.id,
    quantity: input.quantity,
    refund: amountOut(refund),
    remainingQuantity: remaining - input.quantity,
  });
}
