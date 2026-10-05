// Results and refusals (shared-calculations 5.10). A business condition is a typed refusal, never a thrown exception.
// A thrown exception means a defect: malformed input, or a fraction reaching a result without a named rounding step.

/** The refusal codes. The names of 5.10 and the case table of 12.4, then the few this package adds (see below). */
export type RefusalCode =
  // Pricing (5.10)
  | 'price-unknown'
  | 'price-above-mrp'
  | 'classification-unknown'
  | 'no-tax-rule'
  | 'slab-undetermined'
  | 'rounding-rule-missing'
  | 'manual-discount-not-permitted'
  | 'invalid-quantity'
  // Tenders (section 6; 12.4 CG-15)
  | 'insufficient-cash'
  | 'allocation-mismatch'
  | 'cash-received-without-cash'
  | 'stale-allocation'
  | 'invalid-amount'
  // Returns, exchanges and refunds (section 7; 12.4 CG-16 to CG-19)
  | 'exceeds-entitlement'
  | 'exceeds-refundable'
  | 'cheaper-replacement-rule-missing'
  // Added by this package where GC-7 names the outcome but no code: a cheaper-replacement rule that refuses the
  // exchange (7.2), more than one cash tender line (section 6), and a step whose rule is an open question the design
  // leaves undecided (`not-decided`, naming the question: GC7-3, GC7-5, GC7-6, GC7-9, GC7-11).
  | 'cheaper-replacement-refused'
  | 'multiple-cash-lines'
  | 'not-decided';

/** A refusal names the line (by the caller's line id) and the missing or failing input where there is one. */
export interface Refusal {
  readonly code: RefusalCode;
  readonly line?: string;
  readonly input?: string;
  /** For `not-decided`: the open question of shared-calculations section 13 that decides it. */
  readonly question?: string;
}

export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusals: readonly Refusal[] };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function refused<T>(...refusals: Refusal[]): Result<T> {
  return { ok: false, refusals };
}

export function refusal(code: RefusalCode, details: Omit<Refusal, 'code'> = {}): Refusal {
  return { code, ...details };
}
