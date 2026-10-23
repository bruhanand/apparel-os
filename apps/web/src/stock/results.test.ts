import type { StockElsewhere, StockPosition, StockSearch } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { elsewhereRows, productText, resultRows } from './results';

// What stock search shows of the pages read (goods-in 9.2; S2-F11-T01; code review 8 of stage 2), worked by hand on
// SYNTHETIC identifiers.

const SITE = '00000000-0000-7000-8000-000000000001';
const UNIT = '00000000-0000-7000-8000-000000000002';
const LOCATION = '00000000-0000-7000-8000-000000000003';
const BRAND = '00000000-0000-7000-8000-000000000004';
const ENTITY_A = '00000000-0000-7000-8000-000000000005';
const ENTITY_B = '00000000-0000-7000-8000-000000000006';
const WAREHOUSE = '00000000-0000-7000-8000-000000000007';
const SKU = '00000000-0000-7000-8000-000000000008';

const position = (legalEntityId: string, resultKey: string): StockPosition => ({
  resultKey,
  productKey: '["sku","SYNTHETIC"]',
  product: { kind: 'product', skuId: SKU, facts: { kind: 'unknown' } },
  brandId: BRAND,
  siteId: SITE,
  storeId: null,
  businessUnitId: UNIT,
  locationId: LOCATION,
  legalEntityId,
  availableAs: 'move',
  physical: 1,
  available: 0,
  waiting: 1,
  held: 0,
  heldByKind: [],
  frozen: false,
  cost: { kind: 'masked' },
});

const elsewhere = (physical: number): StockElsewhere => ({
  productKey: '["sku","SYNTHETIC"]',
  siteId: SITE,
  storeId: null,
  businessUnitId: WAREHOUSE,
  legalEntityId: ENTITY_A,
  availableAs: 'move',
  physical,
  available: 0,
  waiting: physical,
  held: 0,
});

const page = (positions: StockPosition[], also: StockElsewhere[]): StockSearch => ({
  asOf: '2026-10-23T10:00:00.000Z',
  positions,
  elsewhere: also,
  productsCapped: false,
  names: { sites: [], businessUnits: [], locations: [], brands: [] },
  next: null,
});

describe('the results shown (goods-in 9.2)', () => {
  it('PRD-STK-006 two results that differ only by their legal entity are two rows, each keyed apart', () => {
    const rows = resultRows([page([position(ENTITY_A, 'key-a'), position(ENTITY_B, 'key-b')], [])]);
    expect(rows.map((row) => row.key)).toEqual(['key-a', 'key-b']);
    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
  });

  it('PRD-STK-006 the same product elsewhere shows once however many pages name it, as the newest page read it', () => {
    const rows = elsewhereRows([page([position(ENTITY_A, 'key-a')], [elsewhere(5)]), page([], [elsewhere(4)])]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.each.physical).toBe(4);
  });

  it('PRD-MOD-015 a product the catalogue does not answer is Unknown, never a code', () => {
    expect(productText(position(ENTITY_A, 'key-a').product)).toBe('Unknown');
  });
});
