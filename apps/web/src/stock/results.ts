import type { MaybeKnownText, StockElsewhere, StockPosition, StockProduct, StockSearch } from '@apparel-os/schemas';
import { t } from '../messages/catalogue';
import { unknownText } from '../receiving/names';
import { formatList } from '../setup/format';

// What stock search, and the stock report beside it, show of the pages read (goods-in 9.2, 9.4, 9.5; S2-F11-T01;
// code review 8 of stage 2): each result once, keyed by its whole key, its legal entity included, so two results
// that differ by their legal entity alone are two rows; the same products at the other Stores and warehouses once each,
// however many pages name them; and the goods named as the answer gives them, Unknown where it gives nothing
// (PRD-MOD-015). Pure: no read, no clock.

/** A text that may be Unknown, as the word Unknown when it is (fields and records; design-language 8). */
export const knownOr = (value: MaybeKnownText): string => (value.kind === 'known' ? value.value : unknownText());

/** The goods of a result (goods-in 9.2): a product by its codes, goods as counted before their PT, or unidentified. */
export function productText(product: StockProduct | undefined): string {
  if (product === undefined) return unknownText();
  if (product.kind === 'unidentified') return t('stock-search.goods.unidentified');
  if (product.kind === 'counted') {
    return t('stock-search.goods.counted', {
      style: product.styleCode,
      colour: knownOr(product.colour),
      size: knownOr(product.size),
    });
  }
  const { facts } = product;
  if (facts.kind === 'unknown') return unknownText();
  return t('stock-search.product', { code: facts.code, style: facts.styleCode, size: knownOr(facts.size) });
}

/** A product's identity, such as its colour, and its brand's article number, as one line, or nothing. */
export function productDetail(product: StockProduct): string | null {
  if (product.kind !== 'product' || product.facts.kind === 'unknown') return null;
  const { facts } = product;
  const identity = facts.identity.map((value) => {
    if (value.kind === 'value') return value.name ?? value.code;
    if (value.kind === 'text') return value.text;
    return unknownText();
  });
  const parts = [
    ...(identity.length === 0 ? [] : [formatList(identity)]),
    ...(facts.articleNumber === null ? [] : [t('stock-search.article', { number: facts.articleNumber })]),
  ];
  return parts.length === 0 ? null : formatList(parts);
}

/** Every result of the pages read, in their order, each with the names its page gave and its key for the screen. */
export function resultRows(pages: readonly StockSearch[]) {
  return pages.flatMap((page) =>
    page.positions.map((position: StockPosition) => ({ key: position.resultKey, position, names: page.names })),
  );
}

/**
 * The same products at the other Stores and warehouses, once each, by product, business unit and legal entity: every
 * page answers them for the products it shows, so a product on two pages is named twice; the newest page read is kept,
 * in the place it was first named.
 */
export function elsewhereRows(pages: readonly StockSearch[]) {
  const rows = new Map<string, { readonly each: StockElsewhere; readonly page: StockSearch }>();
  for (const page of pages) {
    for (const each of page.elsewhere) {
      rows.set(JSON.stringify([each.productKey, each.businessUnitId, each.legalEntityId]), { each, page });
    }
  }
  return [...rows].map(([key, row]) => ({ key, ...row }));
}
