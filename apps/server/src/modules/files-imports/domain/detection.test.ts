import { describe, expect, it } from 'vitest';
import { detect, type DetectableVersion } from './detection.js';
import type { Grid, GridCell } from './grid.js';

// S1-F06-T03: detecting a layout by structure (imports-and-opening-data 6.5; PRD-IMP-004). One compatible version is
// proposed; with several the preparer chooses; with none the preparer proposes a new one; a source hint narrows and
// orders the compatible versions and never selects an incompatible one. Every layout and file is SYNTHETIC.

function text(column: number, ref: string, raw: string): GridCell {
  return { column, ref, type: 'text', raw, text: raw };
}

const grid: Grid = {
  notes: [],
  sheets: [
    {
      name: 'SYNTHETIC Products',
      position: 1,
      state: 'visible',
      rows: [{ number: 1, hidden: false, cells: [text(1, 'A1', 'Style'), text(2, 'B1', 'SKU')] }],
    },
  ],
};

function version(id: string, code: string, columns: string[], state: DetectableVersion['state'] = 'Confirmed') {
  return {
    layoutVersionId: `01900000-0000-7000-8000-00000000d00${id}`,
    layoutCode: code,
    source: `SYNTHETIC ${code} source`,
    version: 1,
    state,
    structure: {
      shape: 'layout-version/1',
      format: 'xlsx',
      sheet: 'SYNTHETIC Products',
      headerRow: 1,
      dataStartRow: 2,
      columns: columns.map((name) => ({ name, required: true })),
      documentReference: columns[0] ?? '',
    },
  } satisfies DetectableVersion;
}

const fits = version('1', 'SYN-FITS', ['Style', 'SKU']);
const alsoFits = version('2', 'SYN-ALSO', ['Style', 'SKU'], 'Proposed');
const brand = version('3', 'SYN-BRAND', ['Style', 'SKU', 'Colour']);

describe('detect (imports-and-opening-data 6.5)', () => {
  it('PRD-IMP-004 proposes the one compatible version', () => {
    const found = detect(grid, [fits, brand]);
    expect(found.proposed).toBe(fits.layoutVersionId);
    expect(found.compatible.map((each) => each.layoutVersionId)).toEqual([fits.layoutVersionId]);
    expect(found.incompatible).toEqual([
      {
        layoutVersionId: brand.layoutVersionId,
        layoutCode: 'SYN-BRAND',
        version: 1,
        missing: [{ kind: 'layout-column', column: 'Colour' }],
      },
    ]);
  });

  it('PRD-IMP-004 makes the preparer choose between several compatible versions, and proposes none', () => {
    const found = detect(grid, [fits, alsoFits]);
    expect(found.proposed).toBeUndefined();
    expect(found.compatible).toHaveLength(2);
  });

  it('PRD-IMP-004 finds none compatible, so the preparer proposes a new version', () => {
    const found = detect(grid, [brand]);
    expect(found).toMatchObject({ compatible: [], incompatible: [{ layoutCode: 'SYN-BRAND' }] });
    expect(found.proposed).toBeUndefined();
  });

  it('PRD-IMP-004 a hint narrows and orders the compatible versions, and never selects an incompatible one', () => {
    expect(detect(grid, [fits, alsoFits], 'SYNTHETIC-syn-also-file.xlsx')).toMatchObject({
      proposed: alsoFits.layoutVersionId,
      compatible: [{ layoutCode: 'SYN-ALSO', matchesHint: true }],
    });
    // A file named for the brand whose layout it does not match is never given that layout (17 test 3).
    const named = detect(grid, [fits, brand], 'SYN-BRAND');
    expect(named.proposed).toBe(fits.layoutVersionId);
    expect(named.compatible.map((each) => each.layoutCode)).toEqual(['SYN-FITS']);
  });

  it('PRD-IMP-008 never offers a Rejected version', () => {
    expect(detect(grid, [{ ...fits, state: 'Rejected' }])).toEqual({ compatible: [], incompatible: [] });
  });
});
