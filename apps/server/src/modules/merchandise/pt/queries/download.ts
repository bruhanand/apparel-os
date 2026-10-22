import { asc, eq } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import { brandsAndCategoriesOn } from '../../catalogue/index.js';
import type { FilesImportsInterface } from '../../../files-imports/index.js';
import { ptRow } from '../db/schema.js';
import { PT_REVISION_TYPE } from '../domain/kinds.js';
import { recordItem, revisionNotFound } from '../domain/refusals.js';
import { revisionStanding } from './approval.js';

// An Official PT downloaded as an XLSX file in its template's columns (goods-in 6.5; PRD-PTW-008, PRD-PTW-009;
// S2-F06-T01): its rows as the file gave them, written in the columns of the layout version and through the mapping
// version the PT file was read with, amounts in rupees with two decimals as the template holds them, MARGIN as
// calculated (PRD-PTW-011). Downloading changes nothing. **Design choice.** The caller authorises the reader with the
// cost and margin classes the file carries (access-and-approvals 6; PRD-ACS-008). The file's name is the PT's number.

/** An amount in paise as the template writes it: rupees with two decimals, from the integer paise exactly. */
function rupees(amountPaise: number): number {
  const whole = Math.trunc(amountPaise / 100);
  const part = Math.abs(amountPaise % 100);
  return Number(`${String(whole)}.${String(part).padStart(2, '0')}`);
}

export async function ptDownloadOf(
  context: TransactionContext,
  files: Pick<FilesImportsInterface, 'filledTemplate'>,
  revisionId: string,
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
  const { brands } = await brandsAndCategoriesOn(context, revision.businessDate);
  const brandCode = [...brands].find(([, id]) => id === revision.brandId)?.[0] ?? null;
  const rows = await context.tx
    .select()
    .from(ptRow)
    .where(eq(ptRow.ptRevisionId, revisionId))
    .orderBy(asc(ptRow.lineNumber));
  const bytes = await files.filledTemplate(context, {
    layoutVersionId: revision.layoutVersionId,
    mappingVersionId: revision.mappingVersionId,
    rows: rows.map((row) => ({
      season: row.seasonCode,
      brand: brandCode,
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
      mrp: rupees(row.mrpPaise),
      basic: rupees(row.basicPaise),
      pRate: rupees(row.pRatePaise),
      inputTax: row.inputTaxCode,
      outputTax: row.outputTaxCode,
      nag: row.nag,
      margin: Number(row.margin),
      suggestedSubCategory: row.suggestedSubCategory,
      suggestedType: row.suggestedType,
    })),
  });
  if (bytes === undefined) return { kind: 'not-found', code: 'files-imports.layout-not-found', missing: [] };
  return { fileName: `${approval.number}.xlsx`, bytes };
}
