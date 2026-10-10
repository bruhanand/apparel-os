import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  partsOf,
  RELATIONSHIP,
  SYNTHETIC_EXTERNAL_LINK_PART,
  withParts,
  withRelationship,
  zipOf,
} from '../../../../test/fixtures/workbook-parts.js';
import { inspectWorkbook } from './workbook-safety.js';

// S1-F06-T02: what intake refuses in a workbook before anything is stored (imports-and-opening-data 9.3, class A-9;
// PRD-SEC-011; DEC-112 GC6-3, GC6-5; DEC-116 GC6-17): macros, active controls and embedded objects; links that fetch
// or depend on something outside the file; a container that expands past its cap or is damaged. An ordinary
// hyperlink and a reference inside the workbook are kept. Every workbook here is made by the test (SYNTHETIC).

const LOOSE = { maxExpandedBytes: 64 * 1024 * 1024 };

async function syntheticWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.title = 'SYNTHETIC safety workbook';
  const sheet = workbook.addWorksheet('SYNTHETIC');
  sheet.addRow(['Code', 'Twice', 'Link']);
  sheet.addRow([
    'SYN-001',
    { formula: 'SYNTHETIC!A2', result: 'SYN-001' },
    { text: 'SYNTHETIC drive', hyperlink: 'https://example.invalid/synthetic' },
  ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const WORKBOOK_RELS = 'xl/_rels/workbook.xml.rels';
const SHEET_RELS = 'xl/worksheets/_rels/sheet1.xml.rels';

describe('inspectWorkbook', () => {
  it('GC6-17 PRD-SEC-011 accepts an ordinary external hyperlink and a reference inside the workbook', async () => {
    const workbook = await syntheticWorkbook();
    // ExcelJS writes the hyperlink as an external relationship of the sheet: kept as inert text, never followed.
    expect(partsOf(workbook).get(SHEET_RELS)?.toString()).toContain('TargetMode="External"');
    expect(inspectWorkbook(workbook, LOOSE)).toEqual({ kind: 'safe' });
  });

  it('PRD-SEC-011 refuses a macro project, a macro sheet and a macro-enabled workbook, naming macros', async () => {
    const workbook = await syntheticWorkbook();
    for (const changed of [
      withParts(workbook, { 'xl/vbaProject.bin': Buffer.from('SYNTHETIC macro project') }),
      withParts(workbook, { 'xl/macrosheets/sheet1.xml': '<xm:macrosheet/>' }),
      withParts(workbook, {
        '[Content_Types].xml': (old) =>
          old.replace(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
            'application/vnd.ms-excel.sheet.macroEnabled.main+xml',
          ),
      }),
    ]) {
      expect(inspectWorkbook(changed, LOOSE)).toEqual({
        kind: 'refused',
        code: 'files-imports.workbook-active-content',
        missing: [{ kind: 'active-content', found: 'macros' }],
      });
    }
  });

  it('PRD-SEC-011 refuses ActiveX controls and embedded objects, naming which', async () => {
    const workbook = await syntheticWorkbook();
    expect(inspectWorkbook(withParts(workbook, { 'xl/activeX/activeX1.xml': '<ax/>' }), LOOSE)).toMatchObject({
      code: 'files-imports.workbook-active-content',
      missing: [{ kind: 'active-content', found: 'active-controls' }],
    });
    expect(
      inspectWorkbook(withParts(workbook, { 'xl/embeddings/oleObject1.bin': Buffer.from('SYNTHETIC') }), LOOSE),
    ).toMatchObject({
      code: 'files-imports.workbook-active-content',
      missing: [{ kind: 'active-content', found: 'embedded-objects' }],
    });
  });

  it('GC6-3 A-9 refuses a workbook that depends on another workbook, asking for a self-contained copy', async () => {
    const workbook = await syntheticWorkbook();
    const linked = withParts(workbook, {
      'xl/externalLinks/externalLink1.xml': SYNTHETIC_EXTERNAL_LINK_PART,
      'xl/externalLinks/_rels/externalLink1.xml.rels': withRelationship(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
        'rId1',
        RELATIONSHIP.externalLinkPath,
        'file:///SYNTHETIC/other.xlsx',
        true,
      ),
      [WORKBOOK_RELS]: (old) =>
        withRelationship(old, 'rIdSyn', RELATIONSHIP.externalLink, 'externalLinks/externalLink1.xml', false),
    });
    expect(inspectWorkbook(linked, LOOSE)).toEqual({
      kind: 'refused',
      code: 'files-imports.workbook-depends-on-another',
      missing: [{ kind: 'self-contained-copy' }],
    });
  });

  it('PRD-SEC-011 refuses an unapproved link: an external object or image, or a data connection', async () => {
    const workbook = await syntheticWorkbook();
    const linkedImage = withParts(workbook, {
      [SHEET_RELS]: (old) => withRelationship(old, 'rIdSyn', RELATIONSHIP.image, 'https://example.invalid/a.png', true),
    });
    expect(inspectWorkbook(linkedImage, LOOSE)).toEqual({
      kind: 'refused',
      code: 'files-imports.workbook-unapproved-link',
      missing: [{ kind: 'unapproved-link', found: 'image' }],
    });
    const linkedObject = withParts(workbook, {
      [SHEET_RELS]: (old) => withRelationship(old, 'rIdSyn', RELATIONSHIP.oleObject, 'file:///SYNTHETIC.doc', true),
    });
    expect(inspectWorkbook(linkedObject, LOOSE)).toMatchObject({ missing: [{ found: 'oleObject' }] });
    const connected = withParts(workbook, { 'xl/connections.xml': '<connections/>' });
    expect(inspectWorkbook(connected, LOOSE)).toEqual({
      kind: 'refused',
      code: 'files-imports.workbook-unapproved-link',
      missing: [{ kind: 'unapproved-link', found: 'data-connection' }],
    });
  });

  it('GC6-5 refuses a container that expands past its cap, naming the cap, before inflating past it', async () => {
    const workbook = withParts(await syntheticWorkbook(), { 'xl/SYNTHETIC-filler.xml': Buffer.alloc(200_000, 0x20) });
    const total = [...partsOf(workbook).values()].reduce((sum, part) => sum + part.length, 0);
    expect(inspectWorkbook(workbook, { maxExpandedBytes: total })).toEqual({ kind: 'safe' });
    expect(inspectWorkbook(workbook, { maxExpandedBytes: total - 1 })).toEqual({
      kind: 'refused',
      code: 'files-imports.over-intake-cap',
      missing: [{ kind: 'intake-cap', cap: 'expanded-size', limit: String(total - 1) }],
    });
  });

  it('GC6-5 refuses a container whose entries expand to more than they declare, as damaged', async () => {
    const workbook = withParts(await syntheticWorkbook(), { 'xl/SYNTHETIC-filler.xml': Buffer.alloc(200_000, 0x20) });
    // The directory claims the filler expands to 100 bytes: a bomb hides behind such a claim.
    const lying = Buffer.from(workbook);
    const name = Buffer.from('xl/SYNTHETIC-filler.xml');
    const central = lying.lastIndexOf(name) - 46;
    lying.writeUInt32LE(100, central + 24);
    expect(inspectWorkbook(lying, LOOSE)).toEqual({
      kind: 'refused',
      code: 'files-imports.file-unreadable',
      missing: [{ kind: 'reader-error', error: 'entry-size-mismatch' }],
    });
  });

  it('A-1 refuses a damaged entry with the reader error, never its content', async () => {
    const parts = partsOf(await syntheticWorkbook());
    const workbook = zipOf(parts);
    const damaged = Buffer.from(workbook);
    // Flip the bytes of the first entry's compressed data.
    const dataStart = 30 + damaged.readUInt16LE(26) + damaged.readUInt16LE(28);
    for (let at = dataStart; at < dataStart + 8; at += 1) damaged[at] = (damaged[at] ?? 0) ^ 0xff;
    const outcome = inspectWorkbook(damaged, LOOSE);
    expect(outcome).toMatchObject({ kind: 'refused', code: 'files-imports.file-unreadable' });
    if (outcome.kind !== 'refused') return;
    expect(['entry-not-inflated', 'entry-checksum-mismatch', 'entry-size-mismatch']).toContain(
      outcome.missing[0]?.error,
    );
  });

  it('A-1 refuses an entry encrypted inside the container as unreadable', async () => {
    const workbook = Buffer.from(await syntheticWorkbook());
    const end = workbook.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const central = workbook.readUInt32LE(end + 16);
    workbook.writeUInt16LE(workbook.readUInt16LE(central + 8) | 1, central + 8);
    expect(inspectWorkbook(workbook, LOOSE)).toEqual({
      kind: 'refused',
      code: 'files-imports.file-unreadable',
      missing: [{ kind: 'reader-error', error: 'entry-encrypted' }],
    });
  });
});
