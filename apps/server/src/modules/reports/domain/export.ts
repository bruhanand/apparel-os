import type { HoldKind, StockPosition, StockProduct, StockSearch, StockSearchNames } from '@apparel-os/schemas';
import { exportText, holdKindText, instantText, listText } from './export-text.js';

// Stock search as the sheets of its export (goods-in 9.1 "Any report or search result exports to XLSX as shown"; 9.4;
// S2-F11-T01): the results with their quantities apart, held by each kind found, and the cost where the reader may see
// it; then, when the search names a place, the same products at the other Stores and warehouses. Every word from the
// unit's text catalogue (code-house-rules 12.13); Unknown written as the word, never as zero or a blank
// (PRD-EXC-010, PRD-MOD-015). A cost the reader may not see is left out of the file (access-and-approvals 6): its
// column is there only when some result's cost is shown, and a masked cell stays empty. Pure (code-house-rules 2).

/**
 * A cell: text, a whole quantity, an amount in paise, a rate of two whole numbers shown as a percentage (the stage 2
 * reports; S2-F11-T02), or empty.
 */
export type Cell =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'quantity'; readonly quantity: number }
  | { readonly kind: 'paise'; readonly paise: number }
  | { readonly kind: 'rate'; readonly numerator: number; readonly denominator: number }
  | { readonly kind: 'empty' };

export interface Sheet {
  readonly name: string;
  readonly preface: readonly string[];
  readonly header: readonly string[];
  readonly rows: readonly (readonly Cell[])[];
}

export const text = (value: string): Cell => ({ kind: 'text', text: value });
export const quantity = (value: number): Cell => ({ kind: 'quantity', quantity: value });
export const emptyCell = (): Cell => ({ kind: 'empty' });
export const unknownCell = (): Cell => text(exportText('stock-search.unknown'));
export const orUnknown = (value: string | null): Cell => (value === null ? unknownCell() : text(value));

/** A named record as "CODE · Name", Unknown when the read did not name it. */
export function namedCell(
  list: readonly { readonly id: string; readonly code: string; readonly name: string }[],
  id: string,
): Cell {
  const found = list.find((each) => each.id === id);
  return found === undefined ? unknownCell() : text(exportText('stock-search.named', found));
}

/** The goods' columns: what they are, product code, style code, size, identity and article number. */
export function goodsCells(product: StockProduct | undefined): Cell[] {
  if (product === undefined) return Array.from({ length: 6 }, unknownCell);
  if (product.kind === 'unidentified') {
    const none: Cell = { kind: 'empty' };
    return [text(exportText('stock-search.goods.unidentified')), none, none, none, none, none];
  }
  if (product.kind === 'counted') {
    return [
      text(exportText('stock-search.goods.counted')),
      { kind: 'empty' },
      text(product.styleCode),
      orUnknown(product.size),
      orUnknown(product.colour),
      { kind: 'empty' },
    ];
  }
  const identity = product.identity.map((value) => {
    if (value.kind === 'value') return value.name ?? value.code;
    if (value.kind === 'text') return value.text;
    return exportText('stock-search.unknown');
  });
  return [
    text(exportText('stock-search.goods.product')),
    orUnknown(product.code),
    orUnknown(product.styleCode),
    orUnknown(product.size),
    identity.length === 0 ? { kind: 'empty' } : text(listText(identity)),
    product.articleNumber === null ? { kind: 'empty' } : text(product.articleNumber),
  ];
}

export const goodsHeader = () => [
  exportText('stock-search.column.goods'),
  exportText('stock-search.column.code'),
  exportText('stock-search.column.style'),
  exportText('stock-search.column.size'),
  exportText('stock-search.column.identity'),
  exportText('stock-search.column.article'),
];

const availableAsText = (as: 'sell' | 'move') => text(exportText(`stock-search.available.${as}`));

function costCell(position: StockPosition): Cell {
  if (position.cost.kind === 'known') return { kind: 'paise', paise: position.cost.value };
  if (position.cost.kind === 'unknown') return unknownCell();
  return { kind: 'empty' };
}

/** The sheets of an export of stock search, its time read shown in the Organisation's timezone (code-house-rules 9). */
export function stockSearchSheets(search: StockSearch, timeZone: string): Sheet[] {
  const names: StockSearchNames = search.names;
  const kinds = [...new Set(search.positions.flatMap((each) => each.heldByKind.map((held) => held.kind)))].sort();
  const withCost = search.positions.some((each) => each.cost.kind !== 'masked');
  const preface = [
    exportText('stock-search.title'),
    exportText('stock-search.as-of', { time: instantText(search.asOf, timeZone) }),
  ];
  const results: Sheet = {
    name: exportText('stock-search.sheet'),
    preface,
    header: [
      ...goodsHeader(),
      exportText('stock-search.column.brand'),
      exportText('stock-search.column.site'),
      exportText('stock-search.column.unit'),
      exportText('stock-search.column.location'),
      exportText('stock-search.column.physical'),
      exportText('stock-search.column.available-as'),
      exportText('stock-search.column.available'),
      exportText('stock-search.column.waiting'),
      exportText('stock-search.column.held'),
      ...kinds.map((kind: HoldKind) => exportText('stock-search.column.held-kind', { kind: holdKindText(kind) })),
      exportText('stock-search.column.frozen'),
      ...(withCost ? [exportText('stock-search.column.cost')] : []),
    ],
    rows: search.positions.map((position) => [
      ...goodsCells(position.product),
      namedCell(names.brands, position.brandId),
      namedCell(names.sites, position.siteId),
      namedCell(names.businessUnits, position.businessUnitId),
      namedCell(names.locations, position.locationId),
      quantity(position.physical),
      availableAsText(position.availableAs),
      quantity(position.available),
      quantity(position.waiting),
      quantity(position.held),
      ...kinds.map((kind) => quantity(position.heldByKind.find((held) => held.kind === kind)?.quantity ?? 0)),
      position.frozen ? text(exportText('stock-search.yes')) : { kind: 'empty' as const },
      ...(withCost ? [costCell(position)] : []),
    ]),
  };
  if (search.elsewhere.length === 0) return [results];
  const productOf = (key: string) => search.positions.find((each) => each.productKey === key)?.product;
  const elsewhere: Sheet = {
    name: exportText('stock-search.elsewhere-sheet'),
    preface,
    header: [
      ...goodsHeader(),
      exportText('stock-search.column.site'),
      exportText('stock-search.column.unit'),
      exportText('stock-search.column.physical'),
      exportText('stock-search.column.available-as'),
      exportText('stock-search.column.available'),
      exportText('stock-search.column.waiting'),
      exportText('stock-search.column.held'),
    ],
    rows: search.elsewhere.map((each) => [
      ...goodsCells(productOf(each.productKey)),
      namedCell(names.sites, each.siteId),
      namedCell(names.businessUnits, each.businessUnitId),
      quantity(each.physical),
      availableAsText(each.availableAs),
      quantity(each.available),
      quantity(each.waiting),
      quantity(each.held),
    ]),
  };
  return [results, elsewhere];
}
