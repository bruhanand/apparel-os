// Spreading a group discount over the lines that earned it (shared-calculations 5.6; PRD-POS-023, DEC-109).
// Each line's share is the discount × the line's value before that discount ÷ the total of those values, rounded
// down to whole paise. The paise left go to the line with the largest such value, or to the first of them on the bill.

/** `weights` are the lines' values before the discount, in bill order. Returns each line's share, in the same order. */
export function spreadGroupDiscount(discount: bigint, weights: readonly bigint[]): bigint[] {
  if (discount < 0n || weights.some((w) => w < 0n)) throw new RangeError('A spread takes no negative amount');
  const total = weights.reduce((a, b) => a + b, 0n);
  if (total === 0n) {
    if (discount > 0n) throw new Error('Defect: a discount cannot be spread over lines worth nothing');
    return weights.map(() => 0n);
  }
  // PRD-POS-023: each share rounded down to whole paise (BigInt division of non-negatives rounds down).
  const shares = weights.map((w) => (discount * w) / total);
  const left = discount - shares.reduce((a, b) => a + b, 0n);
  if (left > 0n) {
    let largest = 0;
    weights.forEach((w, i) => {
      if (w > (weights[largest] ?? 0n)) largest = i;
    });
    shares[largest] = (shares[largest] ?? 0n) + left;
  }
  return shares;
}
