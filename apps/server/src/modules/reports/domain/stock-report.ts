import { addPaise, paise, type Paise } from '@apparel-os/domain';
import { stockConditionSchema, type MrpValue } from '@apparel-os/schemas';
import type { HoldingKey } from '../../stock/ledger/index.js';

// The rules of the stock report that need no database (goods-in 9.3, 9.5; code-house-rules 12.1 "Reads"; S2-F11-T02):
// a row's MRP value and its cursor. Pure (code-house-rules 2).

/**
 * The MRP value of a row's physical pieces: each balance's pieces at the MRP of a piece its origin's PT gave
 * (`merchandise.origin-mrp`), exact in whole paise (PRD-MOD-014); Unknown while any piece has none, as goods before
 * their PT have none, and never counted as zero (PRD-MOD-015). **Design choice** (goods-in 9.5).
 */
export function mrpValueOf(
  balances: readonly { readonly receiptOriginId: string; readonly quantity: number }[],
  mrpOfOrigin: ReadonlyMap<string, Paise>,
): MrpValue {
  let total = paise(0);
  for (const balance of balances) {
    const mrp = mrpOfOrigin.get(balance.receiptOriginId);
    if (mrp === undefined) return { kind: 'unknown' };
    total = addPaise(total, paise(mrp * balance.quantity));
  }
  return { kind: 'known', value: total };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The cursor of the page after a row: its key, as base64url text, opaque to the screen (code-house-rules 12.1). */
export function holdingCursorOf(key: HoldingKey): string {
  return Buffer.from(
    JSON.stringify([
      key.siteId,
      key.businessUnitId,
      key.locationId,
      key.productKey,
      key.condition,
      key.ownerKey,
      key.legalEntityId,
    ]),
  ).toString('base64url');
}

/** The key a cursor names, or undefined when it names none: a cursor this report did not give. */
export function holdingKeyOfCursor(cursor: string): HoldingKey | undefined {
  let parts: unknown;
  try {
    parts = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
  if (!Array.isArray(parts) || parts.length !== 7 || !parts.every((part) => typeof part === 'string')) return undefined;
  const [siteId, businessUnitId, locationId, productKey, condition, ownerKey, legalEntityId] = parts;
  if (siteId === undefined || businessUnitId === undefined || locationId === undefined) return undefined;
  if (productKey === undefined || condition === undefined || ownerKey === undefined) return undefined;
  if (legalEntityId === undefined || !stockConditionSchema.safeParse(condition).success) return undefined;
  if (![siteId, businessUnitId, locationId, legalEntityId].every((id) => UUID.test(id))) return undefined;
  return { siteId, businessUnitId, locationId, productKey, condition, ownerKey, legalEntityId };
}
