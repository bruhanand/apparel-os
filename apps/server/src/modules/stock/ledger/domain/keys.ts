// Keys the ledger's working state and its lock order use (stock-ledger 10.3; code-house-rules 8.2). Pure.

declare const unitKeyBrand: unique symbol;

/** One Site and business unit: the place a unit anchor and its SKU balances belong to (14.3). */
export type UnitKey = string & { readonly [unitKeyBrand]: true };

/** The key of a Site and business unit. */
export function unitKey(siteId: string, businessUnitId: string): UnitKey {
  return `${siteId}|${businessUnitId}` as UnitKey;
}

/** The key of a SKU at a Site and business unit: the key of its SKU balance (14.2). */
export function skuKey(siteId: string, businessUnitId: string, skuId: string | null): string {
  return `${unitKey(siteId, businessUnitId)}|${skuId ?? '-'}`;
}

/**
 * Compares two strings by their UTF-16 code units, ascending: a fixed order that no locale or collation changes, as
 * the lock order of code-house-rules 8.2 needs ("ascending key order").
 */
export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
