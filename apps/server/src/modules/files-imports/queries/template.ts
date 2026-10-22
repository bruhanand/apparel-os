import { normalisedName } from '@apparel-os/schemas';
import { and, eq } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { layout, layoutVersion, mapping, mappingVersion } from '../db/schema.js';
import { layoutStructureSchema, mappingFieldsSchema, parsedOrDefect } from '../commands/import-common.js';
import { blankWorkbook } from '../writers/xlsx-template.js';

/** A list of the template: the target's field whose values are on it, and the codes on it. */
export interface TemplateList {
  readonly field: string;
  readonly values: readonly string[];
}

// The blank template of a layout version (goods-in section 11 "Template download"; imports-and-opening-data 6.1;
// S2-F04-T02): only a Confirmed layout version whose Confirmed mapping fills the target, since a template for a
// structure nobody confirmed would hand out an unapproved layout (6.4). Its columns are the layout's, those it ignores
// left out; its lists sheet is named as the screen asks, in its own words, apart from the template's sheet, and each
// list as the column its field is read from by the mapping, so no word of the server's own is written in the file
// (code-house-rules 12.13); a field the mapping does not read from one column has no list. A layout holds no data, so reading it needs no scope (14). The
// file's name says the layout's code and version.

export async function blankTemplate(
  context: TransactionContext,
  request: {
    readonly layoutVersionId: string;
    readonly target: string;
    readonly listsSheet: string;
    readonly lists: readonly TemplateList[];
  },
): Promise<{ readonly fileName: string; readonly bytes: Buffer } | undefined> {
  const [found] = await context.tx
    .select({
      code: layout.code,
      version: layoutVersion.version,
      structure: layoutVersion.structure,
      fields: mappingVersion.fields,
    })
    .from(layoutVersion)
    .innerJoin(layout, eq(layout.id, layoutVersion.layoutId))
    .innerJoin(mapping, and(eq(mapping.layoutVersionId, layoutVersion.id), eq(mapping.target, request.target)))
    .innerJoin(mappingVersion, and(eq(mappingVersion.mappingId, mapping.id), eq(mappingVersion.state, 'Confirmed')))
    .where(and(eq(layoutVersion.id, request.layoutVersionId), eq(layoutVersion.state, 'Confirmed')))
    .limit(1);
  if (found === undefined) return undefined;
  const structure = parsedOrDefect(layoutStructureSchema, found.structure, 'layout version');
  if (normalisedName(request.listsSheet).toLowerCase() === normalisedName(structure.sheet).toLowerCase()) return undefined;
  const { fields } = parsedOrDefect(mappingFieldsSchema, found.fields, 'mapping version');
  const lists = request.lists.flatMap((list) => {
    const source = fields[list.field];
    return source === undefined || !('column' in source) ? [] : [{ name: source.column, values: list.values }];
  });
  const bytes = await blankWorkbook({
    sheet: structure.sheet,
    headerRow: structure.headerRow,
    columns: structure.columns.filter((column) => column.ignored !== true).map((column) => column.name),
    listsSheet: request.listsSheet,
    lists,
  });
  return { fileName: `${found.code} v${String(found.version)}.xlsx`, bytes };
}
