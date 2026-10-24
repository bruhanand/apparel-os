import type { StockSearchFilters } from '@apparel-os/schemas';
import type { PositionFilters, PositionKey } from '../../stock/ledger/index.js';

// The rules of stock search that need no database (goods-in 9.2, 9.4; code-house-rules 12.1 "Reads"; S2-F11-T01):
// what of a search the catalogue answers and what the ledger answers, the place a search names, and the cursor. Pure
// (code-house-rules 2).

/** A search names products when it names a text, a size or a barcode (goods-in 9.2): the catalogue finds them. */
export function namesProducts(filters: StockSearchFilters): boolean {
  return filters.text !== undefined || filters.size !== undefined || filters.barcode !== undefined;
}

/**
 * The ledger's filters of a search (goods-in 9.2): the SKUs the catalogue found, when the search names products, and
 * goods of a product not yet set up by their counted style code and size, unless it names a barcode, which only a
 * product carries (structure-and-masters 4.3); the brand, the place and the condition as they are.
 */
export function ledgerFilters(filters: StockSearchFilters, skuIds: readonly string[] | undefined): PositionFilters {
  const counted =
    filters.barcode !== undefined
      ? undefined
      : {
          ...(filters.text === undefined ? {} : { text: filters.text }),
          ...(filters.size === undefined ? {} : { size: filters.size }),
        };
  return {
    ...(skuIds === undefined ? {} : { products: { skuIds, ...(counted === undefined ? {} : { counted }) } }),
    ...(filters.brandId === undefined ? {} : { brandId: filters.brandId }),
    ...(filters.siteId === undefined ? {} : { siteId: filters.siteId }),
    ...(filters.businessUnitId === undefined ? {} : { businessUnitId: filters.businessUnitId }),
    ...(filters.locationId === undefined ? {} : { locationId: filters.locationId }),
    ...(filters.condition === undefined ? {} : { condition: filters.condition }),
  };
}

/** The place a search names, its most exact part: a location, a business unit or a Site; none when it names none. */
export type NamedPlace =
  | { readonly kind: 'location'; readonly locationId: string }
  | { readonly kind: 'unit'; readonly businessUnitId: string }
  | { readonly kind: 'site'; readonly siteId: string };

export function namedPlace(filters: StockSearchFilters): NamedPlace | undefined {
  if (filters.locationId !== undefined) return { kind: 'location', locationId: filters.locationId };
  if (filters.businessUnitId !== undefined) return { kind: 'unit', businessUnitId: filters.businessUnitId };
  if (filters.siteId !== undefined) return { kind: 'site', siteId: filters.siteId };
  return undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The cursor of the page after a result: its key, as base64url text, opaque to the screen (code-house-rules 12.1). */
export function cursorOf(key: PositionKey): string {
  return Buffer.from(
    JSON.stringify([key.siteId, key.businessUnitId, key.locationId, key.productKey, key.legalEntityId]),
  ).toString('base64url');
}

/** The key a cursor names, or undefined when it names none: a cursor this search did not give. */
export function keyOfCursor(cursor: string): PositionKey | undefined {
  let parts: unknown;
  try {
    parts = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
  if (!Array.isArray(parts) || parts.length !== 5 || !parts.every((part) => typeof part === 'string')) return undefined;
  const [siteId, businessUnitId, locationId, productKey, legalEntityId] = parts;
  if (siteId === undefined || businessUnitId === undefined || locationId === undefined) return undefined;
  if (productKey === undefined || legalEntityId === undefined) return undefined;
  if (![siteId, businessUnitId, locationId, legalEntityId].every((id) => UUID.test(id))) return undefined;
  return { siteId, businessUnitId, locationId, productKey, legalEntityId };
}
