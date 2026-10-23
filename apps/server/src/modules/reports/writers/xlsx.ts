import { paise, rupeesText } from '@apparel-os/domain';
import ExcelJS from 'exceljs';
import type { Sheet } from '../domain/export.js';

// A report or a search as an XLSX file (goods-in 9.1 "Any report or search result exports to XLSX as shown"; PRD Stack
// row Documents: ExcelJS; code-house-rules 2 `writers/`; S2-F11-T01): one sheet a table, its lines of preface above the
// header row, then the rows. A quantity is a whole number; an amount in paise is written as its exact text in rupees
// with two decimals, never through a binary fraction, as the PT's download writes its amounts (goods-in 6.6;
// PRD-MOD-014). It writes no formula, no link and no macro. Pure: bytes in memory, no file, no network.

export async function workbookOf(sheets: readonly Sheet[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const each of sheets) {
    const sheet = workbook.addWorksheet(each.name);
    each.preface.forEach((line, at) => {
      sheet.getRow(at + 1).getCell(1).value = line;
    });
    const headerAt = each.preface.length + (each.preface.length > 0 ? 2 : 1);
    const header = sheet.getRow(headerAt);
    each.header.forEach((name, at) => {
      header.getCell(at + 1).value = name;
    });
    header.font = { bold: true };
    header.commit();
    each.rows.forEach((cells, index) => {
      const row = sheet.getRow(headerAt + 1 + index);
      cells.forEach((cell, at) => {
        const target = row.getCell(at + 1);
        if (cell.kind === 'text') target.value = cell.text;
        if (cell.kind === 'quantity') target.value = cell.quantity;
        if (cell.kind === 'paise') target.value = rupeesText(paise(cell.paise));
      });
      row.commit();
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
