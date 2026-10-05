// Split-tender refunds (shared-calculations 7.3; PRD-RET-022, POL-07.01, DEC-007). A cash substitution or another
// tender override is approved by an independent person and is not computed here (PRD-RET-010, POL-07.01); unknown and
// failed refund outcomes are `pos` matters (POL-07.02).

import type { Paise } from '@apparel-os/domain';
import { amountIn, amountOut } from '../numbers/amounts.js';
import { type Result, ok, refusal, refused } from '../result.js';

export interface OriginalTender {
  /** The tender as the bill's allocation names it. */
  readonly tender: string;
  /** Its original allocation on the bill. */
  readonly allocation: number;
  /** What is still refundable to it. */
  readonly remaining: number;
}

export interface SplitRefundInput {
  /** The original tenders, in the bill's allocation order. */
  readonly tenders: readonly OriginalTender[];
  readonly refund: number;
}

export interface SplitRefund {
  readonly refund: Paise;
  readonly shares: readonly { readonly tender: string; readonly amount: Paise }[];
}

export function splitRefund(input: SplitRefundInput): Result<SplitRefund> {
  const refund = amountIn(input.refund, 'The refund');
  const allocation = input.tenders.map((t) => amountIn(t.allocation, `Tender ${t.tender}: allocation`));
  const remaining = input.tenders.map((t, i) => {
    const left = amountIn(t.remaining, `Tender ${t.tender}: remaining`);
    if (left > (allocation[i] ?? 0n)) throw new RangeError(`Tender ${t.tender}: more remaining than allocated`);
    return left;
  });
  // PRD-RET-022: a refund above the total remaining is refused.
  if (refund > remaining.reduce((a, b) => a + b, 0n))
    return refused(refusal('exceeds-refundable', { input: 'refund' }));

  const shares = input.tenders.map(() => 0n);
  const room = (i: number): bigint => (remaining[i] ?? 0n) - (shares[i] ?? 0n);
  const totalAllocation = allocation.reduce((a, b) => a + b, 0n);

  // Each share is the refund × its original allocation ÷ the bill's total allocation, rounded down, capped at what is
  // left to it. An amount above a cap goes to the other tenders that still have room, in proportion to their original
  // allocations, rounded down and capped the same way, until nothing is left above a cap.
  let toSpread = refund;
  // The first round takes every original tender, so a share above a tender with no room left also moves on.
  let among = input.tenders.map((_, i) => i);
  let base = totalAllocation;
  while (toSpread > 0n && among.length > 0 && base > 0n) {
    let above = 0n;
    for (const i of among) {
      const wanted = (toSpread * (allocation[i] ?? 0n)) / base;
      const fits = wanted < room(i) ? wanted : room(i);
      shares[i] = (shares[i] ?? 0n) + fits;
      above += wanted - fits;
    }
    toSpread = above;
    among = among.filter((i) => room(i) > 0n);
    base = among.reduce((acc, i) => acc + (allocation[i] ?? 0n), 0n);
  }

  // The paise left by rounding go to the tender with the largest original allocation that still has room, then the
  // next largest; ties go to the first tender in the bill's allocation order. Design choice of 7.3.
  let left = refund - shares.reduce((a, b) => a + b, 0n);
  const byLargest = input.tenders
    .map((_, i) => i)
    .sort((a, b) => {
      const x = allocation[a] ?? 0n;
      const y = allocation[b] ?? 0n;
      return x !== y ? (x > y ? -1 : 1) : a - b;
    });
  for (const i of byLargest) {
    if (left === 0n) break;
    const give = left < room(i) ? left : room(i);
    shares[i] = (shares[i] ?? 0n) + give;
    left -= give;
  }
  if (left !== 0n) throw new Error('Defect: a refund within what remains could not be placed');
  return ok({
    refund: amountOut(refund),
    shares: input.tenders.map((t, i) => ({ tender: t.tender, amount: amountOut(shares[i] ?? 0n) })),
  });
}
