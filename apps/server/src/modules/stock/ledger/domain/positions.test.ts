import { describe, expect, it } from 'vitest';
import { quantitiesOf, totalOf, type PositionBalance } from './positions.js';

// S2-F11-T01: the four quantities of stock search, worked from each balance's claims (goods-in 9.2; stock-ledger 6.2,
// 6.3; PRD-STK-001, PRD-STK-003). Each expected value is worked out by hand from the balance's units. Identifiers are
// SYNTHETIC.

const ORIGIN = '01900000-0000-7000-8000-0000000000a1';
const OTHER_ORIGIN = '01900000-0000-7000-8000-0000000000a2';

function balance(id: string, values: Partial<PositionBalance>): PositionBalance {
  return {
    balanceId: id,
    receiptOriginId: ORIGIN,
    condition: 'good',
    quantity: 0,
    accepted: 0,
    reserved: 0,
    holds: [],
    covered: 0,
    reservedEverywhere: 0,
    frozen: false,
    ...values,
  };
}

const B1 = '01900000-0000-7000-8000-000000000001';
const B2 = '01900000-0000-7000-8000-000000000002';

describe('the four quantities of a balance (goods-in 9.2)', () => {
  it('PRD-STK-001 goods counted and not covered by a PT wait: physical 5, waiting 5, nothing available or held', () => {
    const answer = quantitiesOf([balance(B1, { quantity: 5 })]);
    expect(answer.get(B1)).toEqual({ physical: 5, available: 0, waiting: 5, held: 0, heldByKind: [] });
  });

  it('PRD-STK-003 covered goods not yet scanned in wait; accepted ones are available', () => {
    const waiting = quantitiesOf([balance(B1, { quantity: 2, covered: 2 })]);
    expect(waiting.get(B1)).toMatchObject({ physical: 2, available: 0, waiting: 2, held: 0 });
    const accepted = quantitiesOf([balance(B1, { quantity: 2, covered: 2, accepted: 2 })]);
    expect(accepted.get(B1)).toMatchObject({ physical: 2, available: 2, waiting: 0, held: 0 });
  });

  it('PRD-DMG-001 a damage hold on one accepted piece of two: held 1 by damage, available 1', () => {
    const answer = quantitiesOf([
      balance(B1, { quantity: 2, covered: 2, accepted: 2, holds: [{ kind: 'damage', quantity: 1 }] }),
    ]);
    expect(answer.get(B1)).toEqual({
      physical: 2,
      available: 1,
      waiting: 0,
      held: 1,
      heldByKind: [{ kind: 'damage', quantity: 1 }],
    });
  });

  it('PRD-REC-006 holds overlapping on the same pieces count once in all, and each kind shows its own', () => {
    // Three pieces of excess under their excess hold, one of them also under a damage hold.
    const answer = quantitiesOf([
      balance(B1, {
        quantity: 3,
        holds: [
          { kind: 'excess', quantity: 3 },
          { kind: 'damage', quantity: 1 },
        ],
      }),
    ]);
    expect(answer.get(B1)).toEqual({
      physical: 3,
      available: 0,
      waiting: 0,
      held: 3,
      heldByKind: [
        { kind: 'damage', quantity: 1 },
        { kind: 'excess', quantity: 3 },
      ],
    });
  });

  it('PRD-REC-012 unidentified goods in quarantine are held, never waiting', () => {
    const answer = quantitiesOf([
      balance(B1, { condition: 'unidentified', quantity: 1, holds: [{ kind: 'quarantine', quantity: 1 }] }),
    ]);
    expect(answer.get(B1)).toMatchObject({ physical: 1, available: 0, waiting: 0, held: 1 });
  });

  it('PRD-STK-009 under a count freeze nothing is available, and the goods do not wait', () => {
    const answer = quantitiesOf([balance(B1, { quantity: 2, covered: 2, accepted: 2, frozen: true })]);
    expect(answer.get(B1)).toMatchObject({ physical: 2, available: 0, waiting: 0, held: 0 });
  });

  it('PRD-INT-005 an origin’s covered quantity is drawn on once across its balances, oldest first', () => {
    // Covered 3 of four pieces, two at each of two places, all accepted: the first takes 2, the second the 1 left.
    const answer = quantitiesOf([
      balance(B1, { quantity: 2, covered: 3, accepted: 2 }),
      balance(B2, { quantity: 2, covered: 3, accepted: 2 }),
    ]);
    expect(answer.get(B1)).toMatchObject({ available: 2, waiting: 0 });
    expect(answer.get(B2)).toMatchObject({ available: 1, waiting: 1 });
  });

  it('PRD-STK-001 reserved pieces are neither available, waiting nor held', () => {
    const answer = quantitiesOf([
      balance(B1, { quantity: 4, covered: 4, accepted: 4, reserved: 1, reservedEverywhere: 1 }),
    ]);
    expect(answer.get(B1)).toMatchObject({ physical: 4, available: 3, waiting: 0, held: 0 });
  });

  it('PRD-STK-001 a place’s quantities add up over its balances, holds by kind together', () => {
    const answer = quantitiesOf([
      balance(B1, { quantity: 2, covered: 2, accepted: 2, holds: [{ kind: 'damage', quantity: 1 }] }),
      balance(B2, {
        receiptOriginId: OTHER_ORIGIN,
        quantity: 3,
        holds: [
          { kind: 'excess', quantity: 1 },
          { kind: 'damage', quantity: 1 },
        ],
      }),
    ]);
    expect(totalOf([...answer.values()])).toEqual({
      physical: 5,
      available: 1,
      waiting: 1,
      held: 3,
      heldByKind: [
        { kind: 'damage', quantity: 2 },
        { kind: 'excess', quantity: 1 },
      ],
    });
  });
});
