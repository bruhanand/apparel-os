import { describe, expect, it } from 'vitest';
import { heldNeedsOf, type ShownRow } from './export-authority.js';

// What an export of stock holds at its step 0 (code-house-rules 8.2; goods-in 9.4, 9.5; code review 8 of stage 2),
// worked by hand on SYNTHETIC identifiers.

const STORE = { siteId: 'site-1', storeId: 'store-1', businessUnitId: 'unit-1', legalEntityId: 'le-1', brandId: 'b-1' };
const OTHER = { ...STORE, brandId: 'b-2' };
const views = (assignment: string) =>
  ['stock.balance', 'stock.receipt_origin', 'stock.hold', 'stock.reservation'].map((recordType) => ({
    recordType,
    roleAssignmentId: assignment,
  }));

describe('the grants an export holds at step 0 (goods-in 9.4)', () => {
  it('DEC-118 PRD-ACS-008 every grant of view that shows a row is held, once for each place and brand, and the cost apart', () => {
    const rows: ShownRow[] = [
      { facts: STORE, views: views('ra-1'), costAssignmentId: 'ra-cost' },
      // A second row at the same place and brand needs nothing more.
      { facts: STORE, views: views('ra-1'), costAssignmentId: 'ra-cost' },
      // Another brand, its cost masked: its views only.
      { facts: OTHER, views: views('ra-2'), costAssignmentId: undefined },
    ];
    const needs = heldNeedsOf(rows);
    expect(needs).toHaveLength(4 + 1 + 4);
    expect(needs.filter((each) => each.need.facts === OTHER).map((each) => each.roleAssignmentId)).toEqual([
      'ra-2',
      'ra-2',
      'ra-2',
      'ra-2',
    ]);
    expect(needs.filter((each) => each.need.fieldClasses !== undefined)).toEqual([
      {
        roleAssignmentId: 'ra-cost',
        need: {
          action: 'view',
          recordType: 'stock.receipt_origin',
          facts: STORE,
          fieldClasses: [{ fieldClass: 'cost', use: 'view' }],
        },
      },
    ]);
  });

  it('DEC-118 an export of nothing holds nothing', () => {
    expect(heldNeedsOf([])).toEqual([]);
  });
});
