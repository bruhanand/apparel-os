import { describe, expect, it } from 'vitest';
import { compareBalances, type BalanceRow } from './balances.js';

// S1-F13-T02: the lines of a run of opening balances against closed-books balances, per party and per account
// (imports-and-opening-data 10.4; PRD-LIF-009, PRD-LIF-011, POL-14.03, PRD-MOD-014, PRD-MOD-015). Every value is
// SYNTHETIC; every expected line is written by hand.

const row = (id: string, fields: Partial<BalanceRow>): BalanceRow => ({
  rowId: id,
  accountingBookId: 'BOOK-1',
  account: 'supplier-dues',
  party: null,
  paise: null,
  ...fields,
});

describe('compareBalances (10.4: each kind’s totals per party and per account)', () => {
  it('POL-14.03 lists every party and every account with both totals in paise, each difference shown', () => {
    const lines = compareBalances(
      [
        row('L1', { party: 'SYN-P1', paise: 10_000 }),
        row('L2', { party: 'SYN-P1', paise: 2_550 }),
        row('L3', { party: 'SYN-P2', paise: 5_000 }),
        // A party the closed books do not list.
        row('L4', { party: 'SYN-P3', paise: 1_000 }),
      ],
      [
        row('R1', { party: 'SYN-P1', paise: 12_550 }),
        row('R2', { party: 'SYN-P2', paise: 4_000 }),
        // A party only the closed books list, and a balance of the account with no party.
        row('R3', { party: 'SYN-P4', paise: 700 }),
        row('R4', { paise: 300 }),
      ],
    );
    expect(lines).toEqual([
      {
        keyedBy: 'party',
        accountingBookId: 'BOOK-1',
        account: 'supplier-dues',
        party: 'SYN-P1',
        left: { state: 'listed', paise: 12_550 },
        right: { state: 'listed', paise: 12_550 },
        result: 'same',
        leftRows: ['L1', 'L2'],
        rightRows: ['R1'],
      },
      {
        keyedBy: 'party',
        accountingBookId: 'BOOK-1',
        account: 'supplier-dues',
        party: 'SYN-P2',
        left: { state: 'listed', paise: 5_000 },
        right: { state: 'listed', paise: 4_000 },
        result: 'different',
        leftRows: ['L3'],
        rightRows: ['R2'],
      },
      {
        keyedBy: 'party',
        accountingBookId: 'BOOK-1',
        account: 'supplier-dues',
        party: 'SYN-P3',
        left: { state: 'listed', paise: 1_000 },
        right: { state: 'not-listed' },
        result: 'not-listed-right',
        leftRows: ['L4'],
        rightRows: [],
      },
      {
        keyedBy: 'party',
        accountingBookId: 'BOOK-1',
        account: 'supplier-dues',
        party: 'SYN-P4',
        left: { state: 'not-listed' },
        right: { state: 'listed', paise: 700 },
        result: 'not-listed-left',
        leftRows: [],
        rightRows: ['R3'],
      },
      {
        keyedBy: 'account',
        accountingBookId: 'BOOK-1',
        account: 'supplier-dues',
        party: null,
        left: { state: 'listed', paise: 18_550 },
        right: { state: 'listed', paise: 17_550 },
        result: 'different',
        leftRows: ['L1', 'L2', 'L3', 'L4'],
        rightRows: ['R1', 'R2', 'R3', 'R4'],
      },
    ]);
  });

  it('PRD-MOD-015 keeps a total Unknown when any of its amounts is, never reading it as zero', () => {
    const lines = compareBalances(
      [row('L1', { party: 'SYN-P1', paise: 100 }), row('L2', { party: 'SYN-P1' })],
      [row('R1', { party: 'SYN-P1', paise: 100 })],
    );
    expect(lines.map((line) => [line.keyedBy, line.left, line.result])).toEqual([
      ['party', { state: 'unknown' }, 'unknown'],
      ['account', { state: 'unknown' }, 'unknown'],
    ]);
  });

  it('PRD-ORG-005 keeps books and accounts apart, and lists a row with no book or account as unresolved', () => {
    const lines = compareBalances(
      [
        row('L1', { party: 'SYN-P1', paise: 100 }),
        row('L2', { party: 'SYN-P1', paise: 100, accountingBookId: 'BOOK-2' }),
        row('L3', { party: 'SYN-P1', paise: 100, accountingBookId: null }),
      ],
      [
        row('R1', { party: 'SYN-P1', paise: 100, account: 'advances-given' }),
        row('R2', { party: 'SYN-P1', paise: 50, account: null }),
      ],
    );
    expect(lines.map((line) => [line.keyedBy, line.accountingBookId, line.account, line.result])).toEqual([
      ['party', 'BOOK-1', 'supplier-dues', 'not-listed-right'],
      ['party', 'BOOK-2', 'supplier-dues', 'not-listed-right'],
      ['party', 'BOOK-1', 'advances-given', 'not-listed-left'],
      ['account', 'BOOK-1', 'supplier-dues', 'not-listed-right'],
      ['account', 'BOOK-2', 'supplier-dues', 'not-listed-right'],
      ['account', 'BOOK-1', 'advances-given', 'not-listed-left'],
      ['unresolved', null, 'supplier-dues', 'unresolved'],
      ['unresolved', 'BOOK-1', null, 'unresolved'],
    ]);
  });
});
