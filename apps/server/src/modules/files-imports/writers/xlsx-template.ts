import ExcelJS from 'exceljs';

// The blank template of a layout version, as XLSX (goods-in section 11 "Template download"; imports-and-opening-data
// 6.1, 9.2 "As built" with S2-F04-T02; PRD Stack row Documents: ExcelJS, code-house-rules 10.6). The layout's sheet with
// its header row at the layout's header row, its columns in the layout's order, and no data; and a second sheet with
// the lists the template's values must be on, one column each, named in its first row as the column the list's field
// is read from, as the target's handler gives them. It writes no formula, no link, no macro and no other workbook's reference, so the file passes the intake
// checks it is handed back through (9.3). Pure: bytes in memory, no file, no network.

export interface BlankTemplate {
  readonly sheet: string;
  readonly headerRow: number;
  readonly columns: readonly string[];
  /** The sheet of the lists, which must not be named as the template's sheet. */
  readonly listsSheet: string;
  readonly lists: readonly { readonly name: string; readonly values: readonly string[] }[];
}

export async function blankWorkbook(template: BlankTemplate): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(template.sheet);
  const header = sheet.getRow(template.headerRow);
  template.columns.forEach((name, at) => {
    header.getCell(at + 1).value = name;
  });
  header.font = { bold: true };
  header.commit();
  const lists = workbook.addWorksheet(template.listsSheet);
  template.lists.forEach((list, at) => {
    const column = lists.getColumn(at + 1);
    column.values = [list.name, ...list.values];
  });
  lists.getRow(1).font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
