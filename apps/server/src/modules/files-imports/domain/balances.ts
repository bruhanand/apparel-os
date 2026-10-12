import { addPaise, paise, type Paise } from '@apparel-os/domain';

// The lines of a run of opening balances against the closed books (imports-and-opening-data 10.4; PRD-LIF-009,
// PRD-LIF-011, POL-14.03; S1-F13-T02). Pure: no database. Each opening kind's totals are compared per party and per
// account with the closed-books balances, every difference listed and none closed by editing a number (10.3, 10.4).
//
// - Rows are kept apart by their accounting book (PRD-ORG-005) and account. A party line sums the rows of one book,
//   account and party; an account line sums every row of one book and account, a row with no party included, so a
//   closed-books balance kept only per account still reconciles with the opening total.
// - A key one side does not list is "not listed", never zero (class I-1).
// - An amount Unknown on either side keeps the line Unknown: no difference is worked out from zero (PRD-MOD-015).
// - A row with no book or no account is listed on its own as unresolved, never dropped.

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
  readonly paise: number | null;
}

/** One side's total of a key: listed with its sum, listed with an Unknown amount, or not listed (I-1). */
export type SideAmount =
  | { readonly state: 'listed'; readonly paise: Paise }
  | { readonly state: 'unknown' }
  | { readonly state: 'not-listed' };

export type BalanceResult = 'same' | 'different' | 'not-listed-left' | 'not-listed-right' | 'unknown' | 'unresolved';

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

const resolvedRow = (row: BalanceRow) => row.accountingBookId !== null && row.account !== null;
const keyText = (key: Key) => JSON.stringify([key.accountingBookId, key.account, key.party]);

/** The rows grouped by key, in the order each key first appears on the left, then on the right. */
function grouped(left: readonly BalanceRow[], right: readonly BalanceRow[], keyOf: (row: BalanceRow) => Key | null) {
  const groups = new Map<string, { key: Key; left: BalanceRow[]; right: BalanceRow[] }>();
  const add = (side: 'left' | 'right', row: BalanceRow) => {
    const key = keyOf(row);
    if (key === null) return;
    const text = keyText(key);
    const group = groups.get(text) ?? { key, left: [], right: [] };
    group[side].push(row);
    groups.set(text, group);
  };
  for (const row of left) add('left', row);
  for (const row of right) add('right', row);
  return [...groups.values()];
}

/** The sum of a group's amounts, Unknown when any is; not listed when the group is empty. */
function amountOf(rows: readonly BalanceRow[]): SideAmount {
  if (rows.length === 0) return { state: 'not-listed' };
  let sum = paise(0);
  for (const row of rows) {
    if (row.paise === null) return { state: 'unknown' };
    sum = addPaise(sum, paise(row.paise));
  }
  return { state: 'listed', paise: sum };
}

function resultOf(left: SideAmount, right: SideAmount): BalanceResult {
  if (left.state === 'unknown' || right.state === 'unknown') return 'unknown';
  if (left.state === 'not-listed') return 'not-listed-left';
  if (right.state === 'not-listed') return 'not-listed-right';
  return left.paise === right.paise ? 'same' : 'different';
}

/** Orders a level's lines as the stock runs do: matched first, then those only the left lists, then the right. */
const ORDER: Readonly<Record<BalanceResult, number>> = {
  same: 0,
  different: 0,
  unknown: 0,
  'not-listed-right': 1,
  'not-listed-left': 2,
  unresolved: 3,
};

function lines(
  keyedBy: 'party' | 'account',
  left: readonly BalanceRow[],
  right: readonly BalanceRow[],
  keyOf: (row: BalanceRow) => Key | null,
): BalanceLineDraft[] {
  const drafts = grouped(left, right, keyOf).map(({ key, left: leftRows, right: rightRows }) => {
    const leftAmount = amountOf(leftRows);
    const rightAmount = amountOf(rightRows);
    return {
      keyedBy,
      accountingBookId: key.accountingBookId,
      account: key.account,
      party: key.party,
      left: leftAmount,
      right: rightAmount,
      result: resultOf(leftAmount, rightAmount),
      leftRows: leftRows.map((row) => row.rowId),
      rightRows: rightRows.map((row) => row.rowId),
    };
  });
  // A stable sort keeps first-appearance order within each group of results.
  return drafts.sort((a, b) => ORDER[a.result] - ORDER[b.result]);
}

function unresolvedOf(side: 'left' | 'right', row: BalanceRow): BalanceLineDraft {
  const listed = amountOf([row]);
  return {
    keyedBy: 'unresolved',
    accountingBookId: row.accountingBookId,
    account: row.account,
    party: row.party,
    left: side === 'left' ? listed : { state: 'not-listed' },
    right: side === 'right' ? listed : { state: 'not-listed' },
    result: 'unresolved',
    leftRows: side === 'left' ? [row.rowId] : [],
    rightRows: side === 'right' ? [row.rowId] : [],
  };
}

/**
 * The lines of a run of opening balances (left) against the closed books (right), 10.4: every party of every book and
 * account, then every account's total, then each row with no book or account.
 */
export function compareBalances(left: readonly BalanceRow[], right: readonly BalanceRow[]): BalanceLineDraft[] {
  const byParty = (row: BalanceRow): Key | null =>
    resolvedRow(row) && row.party !== null
      ? { accountingBookId: row.accountingBookId ?? '', account: row.account ?? '', party: row.party }
      : null;
  const byAccount = (row: BalanceRow): Key | null =>
    resolvedRow(row) ? { accountingBookId: row.accountingBookId ?? '', account: row.account ?? '', party: null } : null;
  return [
    ...lines('party', left, right, byParty),
    ...lines('account', left, right, byAccount),
    ...left.filter((row) => !resolvedRow(row)).map((row) => unresolvedOf('left', row)),
    ...right.filter((row) => !resolvedRow(row)).map((row) => unresolvedOf('right', row)),
  ];
}
