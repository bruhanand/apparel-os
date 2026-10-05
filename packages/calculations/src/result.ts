// Results and refusals (shared-calculations 5.10). A business condition is a typed refusal, never a thrown exception.
// A thrown exception means a defect: malformed input, or a fraction reaching a result without a named rounding step.

/** The refusal codes of shared-calculations 5.10 and the case table of 12.4. */
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
  // 7.2: the cheaper-replacement rule refuses the exchange (PRD-RET-008, POL-06.09).
  | 'cheaper-replacement-refused'
  // 5.10: a step whose rule an open question of section 13 leaves undecided; the refusal names the question.
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
