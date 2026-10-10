import { describe, expect, it } from 'vitest';
import { checkCustomerContact } from './customer-contact.js';
import type { DetectableVersion } from './detection.js';
import type { Grid, GridCell, GridSheet } from './grid.js';

// S1-F06-T02, RR-203: on the test setup, intake finds customer-contact columns in memory, before anything is stored,
// from the Confirmed layout versions the file fits and the classes their columns declare (imports-and-opening-data
// 3.1 step 1, section 11; DEC-052; DEC-112 GC6-6). A file no Confirmed version recognises, sheet by sheet, cannot be
// known to hold none, so it is refused too, asking for its layout first. Every layout and file is SYNTHETIC.

function text(column: number, ref: string, raw: string): GridCell {
  return { column, ref, type: 'text', raw, text: raw };
}

function sheet(name: string, header: string[], position = 1): GridSheet {
  return {
    name,
    position,
    state: 'visible',
    rows: [
      {
        number: 1,
        hidden: false,
        cells: header.map((each, at) => text(at + 1, `${String.fromCharCode(65 + at)}1`, each)),
      },
    ],
  };
}

function version(
  id: string,
  columns: { name: string; required?: boolean; restrictedClass?: 'customer-contact' | 'cost' }[],
  state: DetectableVersion['state'] = 'Confirmed',
  sheetName = 'SYNTHETIC Sales',
): DetectableVersion {
  return {
    layoutVersionId: `01900000-0000-7000-8000-00000000c0${id}`,
    layoutCode: `SYN-LAYOUT-${id}`,
    source: 'SYNTHETIC source',
    version: 1,
    state,
    structure: {
      shape: 'layout-version/1',
      format: 'xlsx',
      sheet: sheetName,
      headerRow: 1,
      dataStartRow: 2,
      columns: columns.map((column) => ({ required: false, ...column })),
      documentReference: columns[0]?.name ?? '',
    },
  };
}

const grid = (...sheets: GridSheet[]): Grid => ({ sheets, notes: [] });

const withContact = version('01', [
  { name: 'Bill', required: true },
  { name: 'Amount', required: true },
  { name: 'Customer phone', restrictedClass: 'customer-contact' },
]);

describe('checkCustomerContact (RR-203)', () => {
  it('DEC-052 GC6-6 refuses a file whose Confirmed layout marks a column it holds as customer contact', () => {
    const file = grid(sheet('SYNTHETIC Sales', ['Bill', 'Amount', 'Customer phone']));
    expect(checkCustomerContact(file, [withContact])).toEqual({
      kind: 'refused',
      code: 'files-imports.customer-contact-columns',
      missing: [{ kind: 'customer-contact-column', sheet: 'SYNTHETIC Sales', column: 'Customer phone' }],
    });
  });

  it('accepts a clean upload: the same layout, without the contact column, and other classes', () => {
    const file = grid(sheet('SYNTHETIC Sales', ['Bill', 'Amount']));
    expect(checkCustomerContact(file, [withContact])).toEqual({ kind: 'accepted' });
    const costed = version('02', [{ name: 'Bill', required: true }, { name: 'Cost', restrictedClass: 'cost' }]);
    expect(checkCustomerContact(grid(sheet('SYNTHETIC Sales', ['Bill', 'Cost'])), [costed])).toEqual({
      kind: 'accepted',
    });
  });

  it('refuses a file no Confirmed version fits, since its classes cannot be known; Proposed and Rejected count for nothing', () => {
    const file = grid(sheet('SYNTHETIC Sales', ['Bill', 'Amount', 'Mobile']));
    const proposed = version('03', [{ name: 'Bill', required: true }, { name: 'Amount' }, { name: 'Mobile' }], 'Proposed');
    const rejected = version('04', [{ name: 'Bill', required: true }, { name: 'Amount' }, { name: 'Mobile' }], 'Rejected');
    // The Confirmed version does not know the column Mobile, so it does not fit (6.5, A-4).
    expect(checkCustomerContact(file, [withContact, proposed, rejected])).toEqual({
      kind: 'refused',
      code: 'files-imports.layout-needed-on-test-setup',
      missing: [{ kind: 'unrecognised-sheet', sheet: 'SYNTHETIC Sales' }],
    });
  });

  it('refuses a file with another sheet that holds cells no Confirmed version recognises', () => {
    const file = grid(sheet('SYNTHETIC Sales', ['Bill', 'Amount']), sheet('SYNTHETIC Notes', ['Anything'], 2));
    expect(checkCustomerContact(file, [withContact])).toEqual({
      kind: 'refused',
      code: 'files-imports.layout-needed-on-test-setup',
      missing: [{ kind: 'unrecognised-sheet', sheet: 'SYNTHETIC Notes' }],
    });
    // A sheet with no cell holds nothing to check.
    const empty: GridSheet = { name: 'SYNTHETIC Empty', position: 2, state: 'visible', rows: [] };
    expect(checkCustomerContact(grid(sheet('SYNTHETIC Sales', ['Bill', 'Amount']), empty), [withContact])).toEqual({
      kind: 'accepted',
    });
  });
});
