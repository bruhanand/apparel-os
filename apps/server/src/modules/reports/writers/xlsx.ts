import ExcelJS from 'exceljs';
import type { Sheet } from '../domain/export.js';

// A report or a search as an XLSX file (goods-in 9.1 "Any report or search result exports to XLSX as shown"; PRD Stack
// row Documents: ExcelJS; code-house-rules 2 `writers/`; S2-F11-T01): one sheet a table, its lines of preface above the
// header row, then the rows. A quantity is a whole number; an amount in paise is written in rupees with two decimals,
// from the integer paise exactly, as the PT's download writes them (goods-in 6.6); a rate of the stage 2 reports as a
// percentage (S2-F11-T02). It writes no formula, no link and no macro. Pure: bytes in memory, no file, no network.

/** An amount in paise as rupees with two decimals, from the integer paise exactly (PRD-MOD-014). */
function rupees(amountPaise: number): number {
  const whole = Math.trunc(amountPaise / 100);
  const part = Math.abs(amountPaise % 100);
  return Number(`${amountPaise < 0 && whole === 0 ? '-' : ''}${String(whole)}.${String(part).padStart(2, '0')}`);
}

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
        if (cell.kind === 'paise') {
          target.value = rupees(cell.paise);
          target.numFmt = '#,##0.00';
        }
        // A rate as the fraction of its two whole numbers, shown as a percentage (S2-F11-T02). Not money.
        if (cell.kind === 'rate') {
          target.value = cell.numerator / cell.denominator;
          target.numFmt = '0.0%';
        }
      });
      row.commit();
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
