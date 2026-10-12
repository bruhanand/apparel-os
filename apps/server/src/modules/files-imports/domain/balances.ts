import { addPaise, type Paise } from '@apparel-os/domain';
import {
  groupBy,
  inResultOrder,
  resultOf,
  totalOf,
  unresolvedSides,
  type ComparisonResult,
  type Side,
  type SideTotal,
} from './compare.js';

// The lines of a run of opening balances against the closed books (imports-and-opening-data 10.4; PRD-LIF-009,
// PRD-LIF-011, POL-14.03; S1-F13-T02). Pure: no database. Each opening kind's totals are compared per party and per
// account with the closed-books balances, every difference listed and none closed by editing a number (10.3, 10.4).
//
// - Rows are kept apart by their accounting book (PRD-ORG-005) and account. A party line sums the rows of one book,
//   account and party; an account line sums every row of one book and account, a row with no party included, so a
//   closed-books balance kept only per account still reconciles with the opening total.
// - What every run shares (a key one side does not list is not listed, an Unknown amount keeps its line Unknown, a row
//   with no book or account is unresolved) is in compare.ts.

/** One row of a balance set: where it came from, its book, account and party, and its amount in paise or Unknown. */
export interface BalanceRow {
  /** The staged row it came from. */
  readonly rowId: string;
  readonly accountingBookId: string | null;
  /** The account the row's balance belongs to, as the handler names it; null is Unknown. */
  readonly account: string | null;
  /** The party, as the handler names it; null where the row names none (an account balance). */
  readonly party: string | null;
  /** Integer paise (PRD-MOD-014); null is Unknown (PRD-MOD-015). */
  readonly paise: Paise | null;
}

/** One side's total of a key in paise: listed with its sum, listed with an Unknown amount, or not listed (I-1). */
export type SideAmount = SideTotal<Paise>;

export type BalanceResult = ComparisonResult;

export interface BalanceLineDraft {
  readonly keyedBy: 'party' | 'account' | 'unresolved';
  readonly accountingBookId: string | null;
  readonly account: string | null;
  readonly party: string | null;
  readonly left: SideAmount;
  readonly right: SideAmount;
  readonly result: BalanceResult;
  readonly leftRows: readonly string[];
  readonly rightRows: readonly string[];
}

interface Key {
  readonly accountingBookId: string;
  readonly account: string;
  readonly party: string | null;
}

interface Sided {
  readonly side: Side;
  readonly row: BalanceRow;
}

const resolvedRow = (row: BalanceRow) => row.accountingBookId !== null && row.account !== null;
const keyText = (key: Key) => JSON.stringify([key.accountingBookId, key.account, key.party]);

/** The sum of a group's amounts, Unknown when any is; not listed when the group is empty. */
const amountOf = (rows: readonly BalanceRow[]): SideAmount => totalOf(rows, (row) => row.paise, addPaise);

function lines(
  keyedBy: 'party' | 'account',
  left: readonly BalanceRow[],
  right: readonly BalanceRow[],
  keyOf: (row: BalanceRow) => Key | null,
): BalanceLineDraft[] {
  // The rows of both sides grouped by key, in the order each key first appears on the left, then on the right.
  const sided: Sided[] = [
    ...left.map((row) => ({ side: 'left' as const, row })),
    ...right.map((row) => ({ side: 'right' as const, row })),
  ];
  const groups = groupBy(sided, ({ row }) => {
    const key = keyOf(row);
    return key === null ? null : keyText(key);
  });
  const drafts = [...groups.values()].map((group): BalanceLineDraft => {
    const [first] = group;
    const key = first === undefined ? null : keyOf(first.row);
    const leftRows = group.filter((each) => each.side === 'left').map((each) => each.row);
    const rightRows = group.filter((each) => each.side === 'right').map((each) => each.row);
    const leftAmount = amountOf(leftRows);
    const rightAmount = amountOf(rightRows);
    return {
      keyedBy,
      accountingBookId: key?.accountingBookId ?? null,
      account: key?.account ?? null,
      party: key?.party ?? null,
      left: leftAmount,
      right: rightAmount,
      result: resultOf(leftAmount, rightAmount),
      leftRows: leftRows.map((row) => row.rowId),
      rightRows: rightRows.map((row) => row.rowId),
    };
  });
  return inResultOrder(drafts);
}

function unresolvedOf(side: Side, row: BalanceRow): BalanceLineDraft {
  return {
    keyedBy: 'unresolved',
    accountingBookId: row.accountingBookId,
    account: row.account,
    party: row.party,
    ...unresolvedSides(side, row.rowId, amountOf([row])),
  };
}

/**
 * The lines of a run of opening balances (left) against the closed books (right), 10.4: every party of every book and
 * account, then every account's total, then each row with no book or account.
 */
export function compareBalances(left: readonly BalanceRow[], right: readonly BalanceRow[]): BalanceLineDraft[] {
  const byParty = (row: BalanceRow): Key | null =>
    row.accountingBookId !== null && row.account !== null && row.party !== null
      ? { accountingBookId: row.accountingBookId, account: row.account, party: row.party }
      : null;
  const byAccount = (row: BalanceRow): Key | null =>
    row.accountingBookId !== null && row.account !== null
      ? { accountingBookId: row.accountingBookId, account: row.account, party: null }
      : null;
  return [
    ...lines('party', left, right, byParty),
    ...lines('account', left, right, byAccount),
    ...left.filter((row) => !resolvedRow(row)).map((row) => unresolvedOf('left', row)),
    ...right.filter((row) => !resolvedRow(row)).map((row) => unresolvedOf('right', row)),
  ];
}
