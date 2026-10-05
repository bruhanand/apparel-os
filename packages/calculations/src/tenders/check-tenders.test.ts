import { describe, expect, it } from 'vitest';
import { synBill, synLine } from '../../test/synthetic.js';
import { priceBill } from '../pricing/price-bill.js';
import type { PricedBill } from '../pricing/types.js';
import { checkTenders, pricedBillReference } from './check-tenders.js';

// shared-calculations section 6, beyond the golden cases CG-15a to CG-15g. Synthetic values (12.3).

const result = priceBill(synBill([synLine('A1', 110000)]));
if (!result.ok) throw new Error('synthetic bill refused');
const bill: PricedBill = result.value;
const reference = pricedBillReference(bill);

describe('check tenders (section 6)', () => {
  it('PRD-POS-005 checks a non-cash allocation by amount only, with no change', () => {
    expect(
      checkTenders({
        bill,
        allocation: { billReference: reference, lines: [{ kind: 'upi', amount: 110000, instrument: 'SYN-REF-1' }] },
      }),
    ).toEqual({
      ok: true,
      value: {
        amountDue: 110000,
        lines: [{ kind: 'upi', amount: 110000, instrument: 'SYN-REF-1' }],
        cashReceived: null,
        change: 0,
      },
    });
  });

  it('PRD-POS-008 takes two cash lines as one cash line, their total (Proposed, section 6)', () => {
    const lines = [
      { kind: 'cash', amount: 10000 },
      { kind: 'cash', amount: 100000 },
    ];
    expect(checkTenders({ bill, allocation: { billReference: reference, lines, cashReceived: 120000 } })).toMatchObject(
      {
        ok: true,
        value: { cashReceived: 120000, change: 10000 },
      },
    );
    expect(checkTenders({ bill, allocation: { billReference: reference, lines, cashReceived: 100000 } })).toEqual({
      ok: false,
      refusals: [{ code: 'insufficient-cash', input: 'cash-received' }],
    });
  });

  it('PRD-POS-008 refuses a negative tender line; a negative cash-received entry is a caller defect', () => {
    expect(
      checkTenders({ bill, allocation: { billReference: reference, lines: [{ kind: 'card', amount: -1 }] } }),
    ).toMatchObject({
      ok: false,
      refusals: [{ code: 'invalid-amount' }],
    });
    expect(() =>
      checkTenders({
        bill,
        allocation: { billReference: reference, lines: [{ kind: 'cash', amount: 110000 }], cashReceived: -5 },
      }),
    ).toThrow(RangeError);
  });

  it('PRD-POS-009 gives a different reference for any price change', () => {
    const other = priceBill(synBill([synLine('A1', 110100)]));
    if (!other.ok) throw new Error('synthetic bill refused');
    expect(pricedBillReference(other.value)).not.toBe(reference);
    expect(pricedBillReference(bill)).toBe(reference);
  });
});
