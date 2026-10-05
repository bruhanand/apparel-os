// Check tenders (shared-calculations section 6; PRD-POS-005 to PRD-POS-009, PRD-MOD-016). The calculation checks
// amounts only. Which tenders are enabled, whether an instrument is confirmed and which need online authority are
// `pos` and policy matters (PRD-POS-005, PRD-OFF-016).

import type { Paise } from '@apparel-os/domain';
import { canonicalJson } from '../canonical.js';
import { amountIn, amountOut } from '../numbers/amounts.js';
import type { PricedBill } from '../pricing/types.js';
import { type Result, ok, refusal, refused } from '../result.js';

/** The tender kind that is cash. Every other kind is named by `pos` and only its amount is checked here. */
export const CASH = 'cash';

export interface TenderLine {
  readonly kind: string;
  readonly amount: number;
  readonly instrument?: string;
}

export interface TenderAllocation {
  /** The reference of the priced bill the allocation was made for (`pricedBillReference`). */
  readonly billReference: string;
  readonly lines: readonly TenderLine[];
  /** Cash received from the customer. Omitted is the exact-cash shorthand; an entered zero is zero (PRD-MOD-016). */
  readonly cashReceived?: number;
}

export interface CheckTendersInput {
  readonly bill: PricedBill;
  readonly allocation: TenderAllocation;
}

export interface CheckedTenders {
  readonly amountDue: Paise;
  readonly lines: readonly { readonly kind: string; readonly amount: Paise; readonly instrument: string | null }[];
  /** Null when no line is cash. */
  readonly cashReceived: Paise | null;
  readonly change: Paise;
}

/**
 * The reference an allocation carries: the priced bill's canonical serialisation (5.10). Any item, quantity, offer or
 * price change gives a different text, so an allocation made before it is stale (PRD-POS-009).
 */
export function pricedBillReference(bill: PricedBill): string {
  return canonicalJson(bill);
}

function isAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function checkTenders(input: CheckTendersInput): Result<CheckedTenders> {
  const { bill, allocation } = input;
  // PRD-POS-009: an allocation that refers to a priced bill other than the current one is stale.
  if (allocation.billReference !== pricedBillReference(bill)) {
    return refused(refusal('stale-allocation', { input: 'allocation' }));
  }
  // PRD-POS-008: a zero or negative tender line is refused.
  const invalid = allocation.lines.findIndex((line) => !isAmount(line.amount));
  if (invalid !== -1) return refused(refusal('invalid-amount', { input: `tender line ${String(invalid + 1)}` }));
  // PRD-POS-006: the tender lines add up exactly to the amount due.
  const total = allocation.lines.reduce((acc, line) => acc + BigInt(line.amount), 0n);
  if (total !== BigInt(bill.amountDue)) return refused(refusal('allocation-mismatch', { input: 'allocation' }));

  // Section 6 speaks of "the cash line"; where an allocation holds more than one cash line, the cash line is their
  // total (Proposed, shared-calculations section 6).
  const cashLines = allocation.lines.filter((line) => line.kind === CASH);
  const cash = cashLines.length === 0 ? null : cashLines.reduce((acc, line) => acc + BigInt(line.amount), 0n);
  // 3.1: an amount is never negative; a negative cash-received entry is a caller defect.
  const received =
    allocation.cashReceived === undefined ? undefined : amountIn(allocation.cashReceived, 'Cash received');
  // PRD-POS-008: cash received given with no cash line is refused.
  if (cash === null) {
    if (received !== undefined) return refused(refusal('cash-received-without-cash', { input: 'cash-received' }));
  } else if (received !== undefined && received < cash) {
    // PRD-POS-007, PRD-POS-008: cash received below the cash line is refused; an entered zero is zero.
    return refused(refusal('insufficient-cash', { input: 'cash-received' }));
  }
  // PRD-MOD-016, PRD-POS-007: an omitted cash-received entry becomes the cash line's amount before anything is stored.
  const cashReceived = cash === null ? null : (received ?? cash);
  return ok({
    amountDue: bill.amountDue,
    lines: allocation.lines.map((line) => ({
      kind: line.kind,
      amount: amountOut(BigInt(line.amount)),
      instrument: line.instrument ?? null,
    })),
    cashReceived: cashReceived === null ? null : amountOut(cashReceived),
    // PRD-POS-008: change is cash received less the cash line, on cash only.
    change: amountOut(cashReceived === null || cash === null ? 0n : cashReceived - cash),
  });
}
