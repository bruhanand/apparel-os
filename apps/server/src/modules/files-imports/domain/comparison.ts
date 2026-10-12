// A comparison run's lines (imports-and-opening-data 2, 6.6, 10.3; PRD-LIF-027, POL-14.07; S1-F13-T01). Pure: no
// database. Two sets are compared by a key; every key either side holds is one line with both sides' quantities, so
// every difference is listed and none is closed by editing a number (10.3). Neither set is changed.
//
// - **Barcode, then SKU** (manifest or count against the earlier POS's last SOH): rows whose barcode both sides hold
//   are matched by barcode; the rest, by the SKU each row resolved to. A key one side does not list is "not listed",
//   never zero (class I-1; GC6-16 keeps open whether it may be read as zero).
// - **SKU and location** (count against manifest): each SKU at each location.
// - A row whose key is incomplete (no barcode and no SKU, or no SKU or no location for the second key) is listed on
//   its own as unresolved, never dropped (PRD-LIF-005).
// - A quantity Unknown on either side keeps the line Unknown: no difference is worked out from zero (PRD-MOD-015).

/** One row of a set: where it came from, and its key and quantity, each Unknown as null. */
export interface ComparisonRow {
  /** The staged row of a batch side, or the read-model key of a count side. */
  readonly rowId: string;
  readonly barcode: string | null;
  readonly skuId: string | null;
  readonly locationId: string | null;
  /** A whole quantity in the SKU's stock unit; null is Unknown (PRD-MOD-015). */
  readonly quantity: number | null;
}

/** The keys of 10.3. */
export type ComparisonKey = 'barcode-then-sku' | 'sku-and-location';

/** One side's quantity of a key: listed with its sum, listed with an Unknown quantity, or not listed (I-1). */
export type SideQuantity =
  | { readonly state: 'listed'; readonly quantity: number }
  | { readonly state: 'unknown' }
  | { readonly state: 'not-listed' };

export type ComparisonResult = 'same' | 'different' | 'not-listed-left' | 'not-listed-right' | 'unknown' | 'unresolved';

export interface ComparisonLineDraft {
  readonly keyedBy: 'barcode' | 'sku' | 'sku-and-location' | 'unresolved';
  /** The barcode the line's rows that hold one share, or null. */
  readonly barcode: string | null;
  /** The SKU the line's rows that hold one share, or null. */
  readonly skuId: string | null;
  readonly locationId: string | null;
  readonly left: SideQuantity;
  readonly right: SideQuantity;
  readonly result: ComparisonResult;
  readonly leftRows: readonly string[];
  readonly rightRows: readonly string[];
}

type Keyed = 'barcode' | 'sku' | 'sku-and-location';

/** The rows of one side grouped by a key, in the order each key first appears. */
function groupBy(rows: readonly ComparisonRow[], keyOf: (row: ComparisonRow) => string | null) {
  const groups = new Map<string, ComparisonRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

/** The sum of a group's quantities, Unknown when any is; not listed when the group is empty. */
function quantityOf(rows: readonly ComparisonRow[]): SideQuantity {
  if (rows.length === 0) return { state: 'not-listed' };
  let sum = 0;
  for (const row of rows) {
    if (row.quantity === null) return { state: 'unknown' };
    sum += row.quantity;
  }
  return { state: 'listed', quantity: sum };
}

/** The one value the rows that hold one share, or null: none holds one, or they hold different ones. */
function shared(rows: readonly ComparisonRow[], field: 'barcode' | 'skuId' | 'locationId'): string | null {
  const values = new Set(rows.map((row) => row[field]).filter((value) => value !== null));
  const [only] = values;
  return values.size === 1 && only !== undefined ? only : null;
}

function resultOf(left: SideQuantity, right: SideQuantity): ComparisonResult {
  if (left.state === 'unknown' || right.state === 'unknown') return 'unknown';
  if (left.state === 'not-listed') return 'not-listed-left';
  if (right.state === 'not-listed') return 'not-listed-right';
  return left.quantity === right.quantity ? 'same' : 'different';
}

function lineOf(keyedBy: Keyed, left: readonly ComparisonRow[], right: readonly ComparisonRow[]): ComparisonLineDraft {
  const all = [...left, ...right];
  const leftQuantity = quantityOf(left);
  const rightQuantity = quantityOf(right);
  return {
    keyedBy,
    barcode: shared(all, 'barcode'),
    skuId: shared(all, 'skuId'),
    locationId: shared(all, 'locationId'),
    left: leftQuantity,
    right: rightQuantity,
    result: resultOf(leftQuantity, rightQuantity),
    leftRows: left.map((row) => row.rowId),
    rightRows: right.map((row) => row.rowId),
  };
}

function unresolvedOf(side: 'left' | 'right', row: ComparisonRow): ComparisonLineDraft {
  const listed = quantityOf([row]);
  return {
    keyedBy: 'unresolved',
    barcode: row.barcode,
    skuId: row.skuId,
    locationId: row.locationId,
    left: side === 'left' ? listed : { state: 'not-listed' },
    right: side === 'right' ? listed : { state: 'not-listed' },
    result: 'unresolved',
    leftRows: side === 'left' ? [row.rowId] : [],
    rightRows: side === 'right' ? [row.rowId] : [],
  };
}

/**
 * Matches the groups both sides hold under the key; answers the matched lines and each side's rows left over, in their
 * own order.
 */
function matchOn(
  keyedBy: Keyed,
  left: readonly ComparisonRow[],
  right: readonly ComparisonRow[],
  keyOf: (row: ComparisonRow) => string | null,
) {
  const leftGroups = groupBy(left, keyOf);
  const rightGroups = groupBy(right, keyOf);
  const matched: ComparisonLineDraft[] = [];
  const used = new Set<string>();
  for (const [key, rows] of leftGroups) {
    const other = rightGroups.get(key);
    if (other === undefined) continue;
    matched.push(lineOf(keyedBy, rows, other));
    used.add(key);
  }
  const rest = (rows: readonly ComparisonRow[]) =>
    rows.filter((row) => {
      const key = keyOf(row);
      return key === null || !used.has(key);
    });
  return { matched, left: rest(left), right: rest(right) };
}

/** The lines of one side's rows that the other side does not list, grouped by the key; the rest unresolved. */
function oneSided(
  side: 'left' | 'right',
  rows: readonly ComparisonRow[],
  keyedBy: Keyed,
  keyOf: (row: ComparisonRow) => string | null,
): { lines: ComparisonLineDraft[]; unresolved: ComparisonLineDraft[] } {
  const lines = [...groupBy(rows, keyOf).values()].map((group) =>
    side === 'left' ? lineOf(keyedBy, group, []) : lineOf(keyedBy, [], group),
  );
  const unresolved = rows.filter((row) => keyOf(row) === null).map((row) => unresolvedOf(side, row));
  return { lines, unresolved };
}

const skuKey = (row: ComparisonRow) => row.skuId;
const barcodeKey = (row: ComparisonRow) => row.barcode;
const skuAndLocation = (row: ComparisonRow) =>
  row.skuId === null || row.locationId === null ? null : `${row.skuId}\u0000${row.locationId}`;

/**
 * The lines of a comparison run (10.3): the keys both sides hold, matched; then the keys only the left side lists,
 * then those only the right side lists; then each row whose key is incomplete.
 */
export function compareSets(
  left: readonly ComparisonRow[],
  right: readonly ComparisonRow[],
  key: ComparisonKey,
): ComparisonLineDraft[] {
  if (key === 'sku-and-location') {
    const pass = matchOn('sku-and-location', left, right, skuAndLocation);
    const leftOnly = oneSided('left', pass.left, 'sku-and-location', skuAndLocation);
    const rightOnly = oneSided('right', pass.right, 'sku-and-location', skuAndLocation);
    return [...pass.matched, ...leftOnly.lines, ...rightOnly.lines, ...leftOnly.unresolved, ...rightOnly.unresolved];
  }
  const byBarcode = matchOn('barcode', left, right, barcodeKey);
  const bySku = matchOn('sku', byBarcode.left, byBarcode.right, skuKey);
  // A row left over is listed by its SKU where it has one, else by its barcode; with neither it is unresolved.
  const leftOnly = oneSidedByBarcodeThenSku('left', bySku.left);
  const rightOnly = oneSidedByBarcodeThenSku('right', bySku.right);
  return [
    ...byBarcode.matched,
    ...bySku.matched,
    ...leftOnly.lines,
    ...rightOnly.lines,
    ...leftOnly.unresolved,
    ...rightOnly.unresolved,
  ];
}

function oneSidedByBarcodeThenSku(side: 'left' | 'right', rows: readonly ComparisonRow[]) {
  const withSku = oneSided(side, rows, 'sku', skuKey);
  const barcodeOnly = rows.filter((row) => row.skuId === null);
  const byBarcode = oneSided(side, barcodeOnly, 'barcode', barcodeKey);
  return { lines: [...withSku.lines, ...byBarcode.lines], unresolved: byBarcode.unresolved };
}
