import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { checkImportFile } from './workbook-format.js';

// S1-F06-T01: an import file's format is found from its content, never its name (imports-and-opening-data 9.2, class
// A-1; PRD-IMP-001, PRD-IMP-002). Every file here is made by the test (SYNTHETIC), never read from disk.

async function syntheticWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.title = 'SYNTHETIC workbook';
  workbook.addWorksheet('SYNTHETIC').addRow(['SYNTHETIC value']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** The same container with one entry's name changed to another of the same length, in every header that names it. */
function renamed(bytes: Buffer, from: string, to: string): Buffer {
  const out = Buffer.from(bytes);
  const needle = Buffer.from(from, 'latin1');
  for (let at = out.indexOf(needle); at >= 0; at = out.indexOf(needle, at + 1)) out.write(to, at, 'latin1');
  return out;
}

describe('checkImportFile', () => {
  it('PRD-IMP-001 finds XLSX from a zip container with a workbook part, whatever the file is called', async () => {
    expect(checkImportFile(await syntheticWorkbook())).toEqual({ kind: 'accepted', format: 'xlsx' });
  });

  it('PRD-IMP-002 refuses a zip container without a workbook part, such as another office document', async () => {
    const other = renamed(await syntheticWorkbook(), 'xl/workbook.xml', 'xl/notebook.xml');
    expect(checkImportFile(other)).toEqual({ kind: 'refused', code: 'files-imports.type-not-allowed' });
  });

  it('PRD-IMP-002 refuses the evidence formats, text and an empty or cut-off file as not allowed for an import', async () => {
    const workbook = await syntheticWorkbook();
    for (const bytes of [
      Buffer.from('%PDF-1.4\n% SYNTHETIC\n%%EOF\n', 'latin1'),
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
      Buffer.from('SYNTHETIC,text\n1,2\n'),
      Buffer.alloc(0),
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]),
      workbook.subarray(0, Math.floor(workbook.length / 2)),
    ]) {
      expect(checkImportFile(bytes)).toEqual({ kind: 'refused', code: 'files-imports.type-not-allowed' });
    }
  });
});
