import { HELD_LINE_TYPE, DAMAGE_REPORT_TYPE, markedAttributeSetting, type MissingItem } from '@apparel-os/schemas';
import { CommandDefect, type CommandRefusal, type TransactionContext } from '../../../../kernel/index.js';
import { knownValue, type HandlerDocument, type HandlerRow } from '../../../files-imports/index.js';
import type { GrnForPt, PtBasis, PtMark, ReceivingInterface } from '../../../receiving/index.js';
import {
  barcodeSkusOn,
  brandProductsOn,
  brandsAndCategoriesOn,
  itemMapOf,
  markedAttributeAt,
  vocabularyOn,
} from '../../catalogue/index.js';
import { LIST_MARKS, PT_REVISION_TYPE } from '../domain/kinds.js';
import { matchGrn, type Coverage } from '../domain/match.js';
import { productsOf, type Proposal, type RowFinding, type StyleList } from '../domain/products.js';
import { BUSINESS_DATE_NOT_SET, grnNotFound, recordItem } from '../domain/refusals.js';
import { checkRow, PT_FIELDS, type CheckedRow, type PtIssue, type PtList, type PtLists } from '../domain/rows.js';

// What a PT file would make for its GRN (goods-in 5.1 to 5.7; S2-F04-T02): the preconditions of 5.1, the lists of 5.2,
// every check of 5.3 and the match of 5.4 against the GRN's good pieces, then each row's product of 5.5, and the
// totals. Read in the transaction it is given, under its actor: a Validate's, a Publish's under the GRN's lock, or a
// preview's. Writes nothing. Every problem is found at once (PRD-IMP-007); the draft is worked out only from a file
// that passes them all.

export type PtReceiving = Pick<ReceivingInterface, 'ptBasis' | 'grnForPt' | 'ptMark'>;

/** A row of the draft: its checked values, where it came from in the file, and its product (goods-in 5.7). */
export interface DraftRow {
  readonly checked: CheckedRow;
  readonly stagedRowId: string;
  readonly sheet: string;
  /** The origin kind of each value the file gave (PRD-IMP-006). */
  readonly origins: Readonly<Record<string, 'supplied' | 'calculated' | 'mapped' | 'entered'>>;
  readonly finding: RowFinding;
}

export interface PtDraft {
  readonly grn: GrnForPt;
  readonly rows: readonly DraftRow[];
  readonly coverage: readonly Coverage[];
  readonly proposals: readonly Proposal[];
  readonly totals: {
    readonly rows: number;
    readonly pieces: number;
    readonly mrpPaise: number;
    readonly basicPaise: number;
    readonly costPaise: number;
  };
}

/** Every problem that stops a file, at least one. */
export type PtIssues = readonly [PtIssue, ...PtIssue[]];

/**
 * What a PT file makes for its GRN: a refusal of any file for it now (the GRN not found, a held line or damage report
 * waiting, a PT standing; no business date; a list not marked); or every problem of the file, by row and column; or,
 * with none, its draft; or, while a required value of a row is Unknown and nothing else is wrong, nothing worked out
 * (PRD-MOD-015): the pipeline reports each such value (`files-imports.required-value-unknown`).
 */
export type PtPlan =
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal }
  | { readonly kind: 'issues'; readonly issues: PtIssues }
  | { readonly kind: 'draft'; readonly draft: PtDraft }
  | { readonly kind: 'unknown' };

const refusedPlan = (refusal: CommandRefusal): PtPlan => ({ kind: 'refused', refusal });

/**
 * Whether a PT file may be uploaded for the GRN now (goods-in 5.1; DEC-137): every held line and every damage report on
 * its lines decided, and no PT revision of it waiting for approval or standing. Undefined when it may; the GRN must be
 * one the reader sees.
 */
export async function uploadBlock(
  context: TransactionContext,
  receiving: PtReceiving,
  grnId: string,
): Promise<CommandRefusal | undefined> {
  const basis = await receiving.ptBasis(context, grnId);
  if (basis === undefined) return grnNotFound(grnId);
  return blockOf(basis, await receiving.ptMark(context, grnId));
}

/** The block of 5.1 from what the GRN holds and its mark. */
function blockOf(basis: PtBasis, mark: PtMark): CommandRefusal | undefined {
  if (basis.undecided.length > 0) {
    return {
      kind: 'refused',
      code: 'merchandise.pt-held-lines-open',
      missing: basis.undecided.map((each) =>
        each.kind === 'held-line'
          ? recordItem(HELD_LINE_TYPE, each.heldLineId)
          : recordItem(DAMAGE_REPORT_TYPE, each.damageReportId),
      ),
    };
  }
  if (mark.kind === 'set') {
    return {
      kind: 'refused',
      code: 'merchandise.pt-already-attached',
      missing: [recordItem(PT_REVISION_TYPE, mark.ptRevisionId)],
    };
  }
  return undefined;
}

/**
 * The lists a PT file's values must be on (goods-in 5.2): each list's attribute as the Organisation marks it, by the
 * codes of its approved values in force on the date, and the brands and categories in force then, by code; and the
 * master sheet's item map, kept with the item marking in force (RR-583). While a list is not marked, every one not
 * marked is named once (code-house-rules 12.14).
 */
export async function listsOf(
  context: TransactionContext,
  date: string,
): Promise<
  | { readonly kind: 'lists'; readonly lists: PtLists; readonly attributes: Readonly<Record<PtList, string>> }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal }
> {
  const attributes: Partial<Record<PtList, string>> = {};
  const versions: Partial<Record<PtList, string>> = {};
  const missing: MissingItem[] = [];
  for (const [list, mark] of Object.entries(LIST_MARKS) as [PtList, (typeof LIST_MARKS)[PtList]][]) {
    const marked = await markedAttributeAt(context, mark);
    if (marked.kind === 'set') {
      attributes[list] = marked.attributeId;
      versions[list] = marked.versionId;
    } else missing.push({ kind: 'setting', setting: markedAttributeSetting(mark) });
  }
  if (missing.length > 0) {
    return { kind: 'refused', refusal: { kind: 'unavailable', code: 'merchandise.attribute-not-marked', missing } };
  }
  const values: Partial<Record<PtList, Map<string, string>>> = {};
  for (const [list, attributeId] of Object.entries(attributes) as [PtList, string][]) {
    values[list] = new Map((await vocabularyOn(context, attributeId, date)).map((value) => [value.code, value.id]));
  }
  const itemMarking = versions.item;
  if (itemMarking === undefined) throw new CommandDefect('The item marking in force has no version');
  const { brands, categories } = await brandsAndCategoriesOn(context, date);
  return {
    kind: 'lists',
    lists: {
      brands,
      categories,
      attributes: values as Record<PtList, Map<string, string>>,
      itemMap: await itemMapOf(context, itemMarking),
    },
    attributes: attributes as Record<PtList, string>,
  };
}

/** A row's values as the checks read them: each field's known text, or undefined while Unknown (PRD-MOD-015). */
function inputOf(row: HandlerRow) {
  const values = Object.fromEntries(PT_FIELDS.map((field) => [field, knownValue(row.values[field])]));
  return { rowNumber: row.rowNumber, values: values as Record<(typeof PT_FIELDS)[number], string | undefined> };
}

/** The origin kind of each value a row was given (PRD-IMP-006; imports-and-opening-data 5). */
function originsOf(row: HandlerRow): Record<string, 'supplied' | 'calculated' | 'mapped' | 'entered'> {
  const origins: Record<string, 'supplied' | 'calculated' | 'mapped' | 'entered'> = {};
  for (const field of PT_FIELDS) {
    const value = row.values[field];
    if (value !== undefined && value.kind !== 'unknown') origins[field] = value.kind;
  }
  return origins;
}

/** The style-level values of a row a product holds on its style (structure-and-masters 4.1). */
function styleValuesOf(row: CheckedRow): Partial<Record<StyleList, { code: string; valueId: string }>> {
  const { season, gender, type, item, fit } = row.values;
  return { season, gender, type, item, fit };
}

/** What the document would make for its GRN, or every problem that stops it (goods-in 5.1 to 5.6). */
export async function ptPlanOf(
  context: TransactionContext,
  receiving: PtReceiving,
  document: Pick<HandlerDocument, 'rows' | 'subject'>,
): Promise<PtPlan> {
  // A PT file is always about its GRN: Start an import requires the subject (imports-and-opening-data 13.2).
  const grnId = document.subject?.recordId;
  if (grnId === undefined) throw new CommandDefect('A PT document names no GRN');
  const grn = await receiving.grnForPt(context, grnId);
  if (grn === undefined) return refusedPlan(grnNotFound(grnId));
  const basis = await receiving.ptBasis(context, grnId);
  if (basis === undefined) return refusedPlan(grnNotFound(grnId));
  const blocked = blockOf(basis, await receiving.ptMark(context, grnId));
  if (blocked !== undefined) return refusedPlan(blocked);
  const date = await context.businessDate();
  if (date.kind === 'not-set') return refusedPlan(BUSINESS_DATE_NOT_SET);
  const listed = await listsOf(context, date.date);
  if (listed.kind === 'refused') return refusedPlan(listed.refusal);
  const brandId = grn.facts.brandId;
  const issues: PtIssue[] = [];
  const checked: { row: HandlerRow; checked: CheckedRow }[] = [];
  const matched = [];
  for (const row of document.rows) {
    const input = inputOf(row);
    const result = checkRow(input, listed.lists, brandId);
    issues.push(...result.issues);
    if (result.row !== undefined) checked.push({ row, checked: result.row });
    // The match reads a row's style, size and quantity wherever the row gives them, so a quantity is never lost to
    // another problem of its row (goods-in 5.4).
    const { design, size, qty } = input.values;
    const quantity = qty === undefined || !/^\d+$/.test(qty) ? undefined : Number(qty);
    if (design !== undefined && size !== undefined && quantity !== undefined && quantity > 0) {
      matched.push({ rowNumber: row.rowNumber, styleCode: design, sizeCode: size, quantity });
    }
  }
  const goods = basis.goods.map((group) => ({
    styleCode: group.styleCode,
    size: group.size,
    quantity: group.quantity,
    grnLineIds: group.parts.map((part) => part.grnLineId),
  }));
  const match = matchGrn(matched, goods);
  issues.push(...match.issues);
  if (document.rows.length === 0)
    issues.push({ code: 'merchandise.pt-file-refused', missing: [{ kind: 'pt-rows', rows: '0' }] });
  const [first, ...rest] = issues;
  if (first !== undefined) return { kind: 'issues', issues: [first, ...rest] };
  // A row with no issue is not kept only while a value of it is Unknown, whose checks are skipped (domain/rows.ts).
  if (checked.length !== document.rows.length) return { kind: 'unknown' };

  // The barcodes' products first, so the styles they name are read with the file's (goods-in 5.5).
  const barcodes = await barcodeSkusOn(context, {
    brandId,
    barcodes: checked.map((each) => each.checked.barcode),
    date: date.date,
  });
  const products = await brandProductsOn(context, {
    brandId,
    styleCodes: [
      ...checked.map((each) => each.checked.styleCode),
      ...[...barcodes.values()].flatMap((skus) => skus.map((sku) => sku.styleCode)),
    ],
    colourAttributeId: listed.attributes.colour,
    date: date.date,
  });
  const codes = new Map<string, string>();
  for (const entries of [...Object.values(listed.lists.attributes), listed.lists.categories]) {
    for (const [code, id] of entries) codes.set(id, code);
  }
  const styleAttributes = {
    season: listed.attributes.season,
    gender: listed.attributes.gender,
    type: listed.attributes.type,
    item: listed.attributes.item,
    fit: listed.attributes.fit,
  };
  const found = productsOf(
    checked.map(({ checked: row }) => ({
      rowNumber: row.rowNumber,
      styleCode: row.styleCode,
      sizeCode: row.sizeCode,
      colour: row.values.colour,
      barcode: row.barcode,
      categoryId: row.categoryId,
      subCategoryCode: row.subCategoryCode,
      hsn: row.hsn,
      styleValues: styleValuesOf(row),
    })),
    {
      colourAttributeId: listed.attributes.colour,
      styleAttributes,
      styles: new Map(
        products.styles.map((style) => [
          style.code,
          { styleId: style.styleId, categoryId: style.categoryId, hsn: style.hsn, attributes: style.attributes },
        ]),
      ),
      skus: products.skus,
      barcodes: new Map([...barcodes].map(([code, skus]) => [code, skus.map((sku) => sku.skuId)])),
      codes,
    },
  );
  const byRow = new Map(found.rows.map((finding) => [finding.rowNumber, finding]));
  const rows: DraftRow[] = checked.map(({ row, checked: values }) => {
    const finding = byRow.get(row.rowNumber);
    if (finding === undefined) throw new CommandDefect(`Row ${String(row.rowNumber)} lost its product`);
    return { checked: values, stagedRowId: row.stagedRowId, sheet: row.sheet, origins: originsOf(row), finding };
  });
  let pieces = 0;
  let mrpPaise = 0;
  let basicPaise = 0;
  let costPaise = 0;
  for (const { checked: row } of rows) {
    pieces += row.quantity;
    mrpPaise += row.mrpPaise * row.quantity;
    basicPaise += row.basicPaise * row.quantity;
    costPaise += row.pRatePaise * row.quantity;
  }
  if (![pieces, mrpPaise, basicPaise, costPaise].every(Number.isSafeInteger)) {
    return {
      kind: 'issues',
      issues: [{ code: 'merchandise.pt-file-refused', missing: [{ kind: 'pt-totals', reason: 'too-large' }] }],
    };
  }
  return {
    kind: 'draft',
    draft: {
      grn,
      rows,
      coverage: match.coverage,
      proposals: found.proposals,
      totals: { rows: rows.length, pieces, mrpPaise, basicPaise, costPaise },
    },
  };
}
