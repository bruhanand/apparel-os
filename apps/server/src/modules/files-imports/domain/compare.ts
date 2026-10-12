// What every comparison run shares (imports-and-opening-data 2, 10.3, 10.4; PRD-LIF-027, POL-14.03; S1-F13 review,
// 12 Oct 2026): each side's total of a key, the result of a line, rows grouped by key in the order each key first
// appears, the order of a level's lines, and the line of a row whose key is incomplete. Pure: no database. A stock run
// totals quantities (comparison.ts), a run of opening balances amounts in paise (balances.ts).
//
// - A key one side does not list is "not listed", never zero (class I-1; GC6-16).
// - A total Unknown on either side keeps the line Unknown: no difference is worked out from zero (PRD-MOD-015).
// - A row whose key is incomplete is listed on its own as unresolved, never dropped (PRD-LIF-005).

/** The two sides of a run. */
export type Side = 'left' | 'right';

/** One side's total of a key: listed with its sum, listed with an Unknown total, or not listed (I-1). */
export type SideTotal<Total extends number = number> =
  | { readonly state: 'listed'; readonly total: Total }
  | { readonly state: 'unknown' }
  | { readonly state: 'not-listed' };

export type ComparisonResult = 'same' | 'different' | 'not-listed-left' | 'not-listed-right' | 'unknown' | 'unresolved';

/**
 * The sum of the rows' values, Unknown when any is; not listed when there is no row. `add` sums two totals exactly
 * (integer paise through `addPaise`, quantities as whole numbers).
 */
export function totalOf<Row, Total extends number>(
  rows: readonly Row[],
  valueOf: (row: Row) => Total | null,
  add: (sum: Total, value: Total) => Total,
): SideTotal<Total> {
  let sum: Total | undefined;
  if (rows.length === 0) return { state: 'not-listed' };
  for (const row of rows) {
    const value = valueOf(row);
    if (value === null) return { state: 'unknown' };
    sum = sum === undefined ? value : add(sum, value);
  }
  return sum === undefined ? { state: 'not-listed' } : { state: 'listed', total: sum };
}

/** The result of a line from both sides' totals. */
export function resultOf(left: SideTotal, right: SideTotal): ComparisonResult {
  if (left.state === 'unknown' || right.state === 'unknown') return 'unknown';
  if (left.state === 'not-listed') return 'not-listed-left';
  if (right.state === 'not-listed') return 'not-listed-right';
  return left.total === right.total ? 'same' : 'different';
}

/** The rows grouped by key, in the order each key first appears; a row with no key is left out. */
export function groupBy<Row>(rows: readonly Row[], keyOf: (row: Row) => string | null): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [row]);
    else group.push(row);
  }
  return groups;
}

/** The order of a level's lines: both sides listed first, then those only the left lists, then the right. */
const ORDER: Readonly<Record<ComparisonResult, number>> = {
  same: 0,
  different: 0,
  unknown: 0,
  'not-listed-right': 1,
  'not-listed-left': 2,
  unresolved: 3,
};

/** The lines in the order of `ORDER`; a stable sort keeps first-appearance order within each group of results. */
export function inResultOrder<Line extends { readonly result: ComparisonResult }>(lines: Line[]): Line[] {
  return lines.sort((a, b) => ORDER[a.result] - ORDER[b.result]);
}

/** The sides and rows of a line for one row whose key is incomplete: listed on its side only, unresolved. */
export function unresolvedSides<Total extends number>(
  side: Side,
  rowId: string,
  listed: SideTotal<Total>,
): {
  readonly left: SideTotal<Total>;
  readonly right: SideTotal<Total>;
  readonly result: 'unresolved';
  readonly leftRows: readonly string[];
  readonly rightRows: readonly string[];
} {
  return {
    left: side === 'left' ? listed : { state: 'not-listed' },
    right: side === 'right' ? listed : { state: 'not-listed' },
    result: 'unresolved',
    leftRows: side === 'left' ? [rowId] : [],
    rightRows: side === 'right' ? [rowId] : [],
  };
}
