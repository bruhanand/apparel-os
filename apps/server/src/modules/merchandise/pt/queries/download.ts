import { decimalText, paise, rupeesText } from '@apparel-os/domain';
import type { FieldClass } from '@apparel-os/schemas';
import { asc, eq } from 'drizzle-orm';
import { CommandDefect, type CommandRefusal, type TransactionContext } from '../../../../kernel/index.js';
import { brandsAndCategoriesOn } from '../../catalogue/index.js';
import type { FilesImportsInterface } from '../../../files-imports/index.js';
import { ptRow } from '../db/schema.js';
import { PT_REVISION_TYPE } from '../domain/kinds.js';
import { recordItem, revisionNotFound } from '../domain/refusals.js';
import { revisionStanding, type RevisionRow } from './approval.js';

// An Official PT as an XLSX file in its template's columns (goods-in 6.5, 6.6; PRD-PTW-008, PRD-PTW-009; S2-F06-T01):
// its rows as the file gave them, written in the columns of the layout version and through the mapping version the PT
// file was read with, amounts in rupees with two decimals and MARGIN as calculated (PRD-PTW-011), each written as its
// exact text, never through a binary fraction (PRD-MOD-014; code review 7). BASIC and P RATE are left out for a reader
// not granted cost, MARGIN for one not granted margin: an export leaves out what a screen masks (access-and-approvals
// 6; PRD-ACS-008). Reads only; the download command writes the access record of each class the file carries
// (commands/download-pt.ts). The file's name is the PT's number.

/** The PT's brand by its code on the revision's date, which the upload checked was on the brand list then (5.3). */
async function brandCodeOf(context: TransactionContext, revision: RevisionRow): Promise<string> {
  const { brands } = await brandsAndCategoriesOn(context, revision.businessDate);
  const code = [...brands].find(([, id]) => id === revision.brandId)?.[0];
  if (code === undefined) throw new CommandDefect(`PT revision ${revision.id} names a brand not in force on its date`);
  return code;
}

export async function ptDownloadOf(
  context: TransactionContext,
  files: Pick<FilesImportsInterface, 'filledTemplate'>,
  revisionId: string,
  masked: ReadonlySet<FieldClass>,
): Promise<{ readonly fileName: string; readonly bytes: Buffer } | CommandRefusal> {
  const standing = await revisionStanding(context, revisionId);
  if (standing === undefined) return revisionNotFound(revisionId);
  const { revision, approval } = standing;
  if (approval === undefined) {
    return {
      kind: 'refused',
      code: 'merchandise.pt-not-official',
      missing: [recordItem(PT_REVISION_TYPE, revisionId)],
    };
  }
  const brand = await brandCodeOf(context, revision);
  const rows = await context.tx
    .select()
    .from(ptRow)
    .where(eq(ptRow.ptRevisionId, revisionId))
    .orderBy(asc(ptRow.lineNumber));
  const cost = (amountPaise: number) => (masked.has('cost') ? null : rupeesText(paise(amountPaise)));
  const bytes = await files.filledTemplate(context, {
    layoutVersionId: revision.layoutVersionId,
    mappingVersionId: revision.mappingVersionId,
    rows: rows.map((row) => ({
      season: row.seasonCode,
      brand,
      colour: row.colourCode,
      gender: row.genderCode,
      subCategory: row.subCategoryCode,
      type: row.typeCode,
      item: row.itemCode,
      fit: row.fitCode,
      size: row.sizeCode,
      barcode: row.barcode,
      design: row.styleCode,
      hsn: row.hsn,
      qty: row.quantity,
      mrp: rupeesText(paise(row.mrpPaise)),
      basic: cost(row.basicPaise),
      pRate: cost(row.pRatePaise),
      inputTax: row.inputTaxCode,
      outputTax: row.outputTaxCode,
      nag: row.nag,
      margin: masked.has('margin') ? null : decimalText(row.margin, 2),
      suggestedSubCategory: row.suggestedSubCategory,
      suggestedType: row.suggestedType,
    })),
  });
  if (bytes === undefined) return { kind: 'not-found', code: 'files-imports.layout-not-found', missing: [] };
  return { fileName: `${approval.number}.xlsx`, bytes };
}
