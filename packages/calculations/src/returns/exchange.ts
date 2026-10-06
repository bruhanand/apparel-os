// Exchange difference (shared-calculations 7.2; PRD-RET-007, PRD-RET-008, POL-06.09). The returned units are worth
// their entitlement (7.1); the replacement is priced as a new bill with current prices and offers (PRD-RET-007).
// A cheaper replacement follows the configured rule: refund, credit or refuse. The rule is OPEN (V-67); with no rule
// in force a cheaper exchange is refused.

import type { Paise } from '@apparel-os/domain';
import { amountIn, amountOut } from '../numbers/amounts.js';
import type { PricedBill } from '../pricing/types.js';
import { type Result, ok, refusal, refused } from '../result.js';

export interface CheaperReplacementRule {
  readonly version: string;
  readonly outcome: 'refund' | 'credit' | 'refuse';
}

export interface ExchangeInput {
  /** What the returned units are worth, from returnValue (7.1). */
  readonly returnedValue: number;
  /** The replacement goods priced as a new bill. */
  readonly replacement: PricedBill;
  readonly cheaperReplacementRule?: CheaperReplacementRule;
}

export interface ExchangeDifference {
  readonly outcome: 'none' | 'collect' | 'refund' | 'credit';
  readonly amount: Paise;
  readonly cheaperReplacementRuleVersion: string | null;
}

export function exchangeDifference(input: ExchangeInput): Result<ExchangeDifference> {
  const returned = amountIn(input.returnedValue, 'The returned value');
  const replacement = input.replacement;
  // GC7-13: how a replacement bill's round-off is compared with the returned value is open, so such a bill is not compared
  // with returned paid values until it is decided.
  if (replacement.roundOffUp !== 0 || replacement.roundOffDown !== 0) {
    return refused(refusal('not-decided', { input: 'replacement round-off', question: 'GC7-13' }));
  }
  const replacementValue = BigInt(replacement.amountDue);
  if (replacementValue === returned)
    return ok({ outcome: 'none', amount: amountOut(0n), cheaperReplacementRuleVersion: null });
  // Higher: the difference is collected and goes through the tender checks (section 6).
  if (replacementValue > returned) {
    return ok({
      outcome: 'collect',
      amount: amountOut(replacementValue - returned),
      cheaperReplacementRuleVersion: null,
    });
  }
  // Cheaper: PRD-RET-008, POL-06.09.
  const rule = input.cheaperReplacementRule;
  if (rule === undefined)
    return refused(refusal('cheaper-replacement-rule-missing', { input: 'cheaper-replacement-rule' }));
  if (rule.outcome === 'refuse')
    return refused(refusal('cheaper-replacement-refused', { input: 'cheaper-replacement-rule' }));
  return ok({
    outcome: rule.outcome,
    amount: amountOut(returned - replacementValue),
    cheaperReplacementRuleVersion: rule.version,
  });
}
