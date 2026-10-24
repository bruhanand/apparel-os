import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { withParts } from '../../../../test/fixtures/workbook-parts.js';
import type { IntakeCaps } from '../domain/intake-caps.js';
import { readWorkbook } from './workbook-read.js';

// S1-F06-T02: a workbook is read under the caps at intake (imports-and-opening-data 9.3; DEC-112 GC6-5; PRD-SEC-011):
// the safety checks and the reader run in a worker of their own, which stops at the memory and time caps; a file over
// a cap is refused with the cap named, and never truncated to fit. The caps and files here are SYNTHETIC.

const SYNTHETIC_CAPS: IntakeCaps = {
  maxUploadBytes: 10 * 1024 * 1024,
  maxExpandedBytes: 512 * 1024 * 1024,
  maxRows: 1000,
  maxParserMemoryMb: 256,
  maxProcessingMs: 60_000,
};

async function workbookOf(rows: number): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.title = 'SYNTHETIC capped workbook';
  const sheet = workbook.addWorksheet('SYNTHETIC');
  for (let row = 1; row <= rows; row += 1) sheet.addRow([`SYN-${String(row)}`, row]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Each read starts a worker of its own and writes its SYNTHETIC workbook first, so a test takes seconds, not the
 * default's few: a loaded machine took 3 to 4.5 seconds for the row cap's two reads (code review 6 of stage 2).
 */
const READER_TEST_TIMEOUT_MS = 30_000;

describe('readWorkbook', { timeout: READER_TEST_TIMEOUT_MS }, () => {
  it('PRD-IMP-001 reads a safe workbook within the caps into the grid', async () => {
    const read = await readWorkbook(await workbookOf(3), SYNTHETIC_CAPS);
    if (read.kind !== 'read') throw new Error(`Refused: ${JSON.stringify(read)}`);
    expect(read.grid.sheets[0]?.rows.map((row) => row.cells[0]?.text)).toEqual(['SYN-1', 'SYN-2', 'SYN-3']);
  });

  it('PRD-SEC-011 refuses an unsafe workbook before reading it', async () => {
    const macro = withParts(await workbookOf(1), { 'xl/vbaProject.bin': Buffer.from('SYNTHETIC') });
    expect(await readWorkbook(macro, SYNTHETIC_CAPS)).toMatchObject({
      kind: 'refused',
      code: 'files-imports.workbook-active-content',
    });
  });

  it('GC6-5 reads a file of exactly the row cap and refuses one row more, naming the cap', async () => {
    const caps = { ...SYNTHETIC_CAPS, maxRows: 20 };
    expect((await readWorkbook(await workbookOf(20), caps)).kind).toBe('read');
    expect(await readWorkbook(await workbookOf(21), caps)).toEqual({
      kind: 'refused',
      code: 'files-imports.over-intake-cap',
      missing: [{ kind: 'intake-cap', cap: 'rows', limit: '20' }],
    });
  });

  it('GC6-5 refuses a file the reader cannot read within the memory cap, naming the cap', async () => {
    // A shared string of 120 million characters compresses to little but fills the reader's heap.
    const small = await workbookOf(1);
    const heavy = withParts(small, {
      'xl/sharedStrings.xml': (old) => old.replace('<t>SYN-1</t>', `<t>${'S'.repeat(120_000_000)}</t>`),
    });
    const caps = { ...SYNTHETIC_CAPS, maxParserMemoryMb: 64 };
    expect((await readWorkbook(small, caps)).kind).toBe('read');
    expect(await readWorkbook(heavy, caps)).toEqual({
      kind: 'refused',
      code: 'files-imports.over-intake-cap',
      missing: [{ kind: 'intake-cap', cap: 'parser-memory', limit: '64' }],
    });
  }, 60_000);

  it('GC6-5 stops a read that takes longer than the time cap, naming the cap', async () => {
    expect(await readWorkbook(await workbookOf(200), { ...SYNTHETIC_CAPS, maxProcessingMs: 1 })).toEqual({
      kind: 'refused',
      code: 'files-imports.over-intake-cap',
      missing: [{ kind: 'intake-cap', cap: 'processing-time', limit: '1' }],
    });
  });

  it('A-1 refuses a workbook the reader cannot open, naming the reader error only', async () => {
    const broken = withParts(await workbookOf(1), { 'xl/workbook.xml': '<workbook><SYNTHETIC' });
    expect(await readWorkbook(broken, SYNTHETIC_CAPS)).toEqual({
      kind: 'refused',
      code: 'files-imports.file-unreadable',
      missing: [{ kind: 'reader-error', error: 'workbook-not-read' }],
    });
  });
});
