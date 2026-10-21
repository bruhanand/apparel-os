import { uuidv7 } from '@apparel-os/domain';
import { ARRIVAL_TYPE, type CountLineDraft, type CountLineRemoval, type CountLineSaved } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { markedAttributeAt, skuOn, vocabularyOn } from '../../merchandise/catalogue/index.js';
import { batchColumns, sizeColumns } from '../db/columns.js';
import { arrivalInvoice, countEntry } from '../db/schema.js';
import { currentLines, lineCounting, lineItem, newestEntry, type CountEntryFacts, type Size } from '../domain/lines.js';
import { textKey, trimmed } from '../domain/text.js';
import { arrivalForChange } from './arrival.js';
import {
  audited,
  entriesOf,
  recordChange,
  recordItem,
  refusalOf,
  refused,
  scopeColumns,
  today,
  valueChange,
  type Actor,
  type ArrivalRow,
  type Outcome,
} from './common.js';

// Save the count as it goes, line by line, and resume it (goods-in 4.3; PRD-REC-005; DEC-133, DEC-138; S2-F02-T02).
// The count starts only once the Arrival holds an invoice (DEC-133), and only while an attribute is marked as the
// Organisation's size list (structure-and-masters 4.2 "As built"; RR-556). A line is the style code as the invoice
// writes it, the colour as the invoice names it, the size from the size list and the product when one is named, with the invoice
// and counted quantities; each save is a new entry of the line naming the one it replaces, so two people saving over
// the same version never both succeed (code-house-rules 12.7), and who saved each is kept, from their sign-ins.

export interface CountDependencies {
  readonly audit: AuditInterface;
}

/** An entry as it is written: everything but who saved it and when, which the command and the database add. */
type NewEntry = Omit<CountEntryFacts, 'enteredByUserId' | 'recordedAt'>;

/** The line and its newest entry, when the token names that entry; the refusal otherwise (code-house-rules 12.7). */
function lineInForce(
  entries: readonly CountEntryFacts[],
  lineId: string,
  versionToken: string,
): { readonly kind: 'found'; readonly entry: CountEntryFacts } | Outcome<never> {
  const newest = newestEntry(entries, lineId);
  if (newest === undefined || newest.removed) {
    return refused('not-found', 'receiving.record-not-found', [lineItem(lineId)]);
  }
  if (newest.id !== versionToken) return refused('conflict', 'kernel.stale-version', [lineItem(lineId)]);
  return { kind: 'found', entry: newest };
}

/** The entry's audited fields. */
function fieldsOf(entry: NewEntry) {
  return {
    removed: entry.removed,
    styleCode: entry.styleCode,
    colour: entry.colour,
    size: entry.size?.code ?? null,
    skuId: entry.skuId,
    invoiceQuantity: entry.invoiceQuantity,
    countedQuantity: entry.countedQuantity,
    batch: entry.batch === null ? null : { ...entry.batch },
  };
}

/** Writes an entry, the Arrival's next change and the audit record of the fields it changed. */
async function writeEntry(
  context: TransactionContext,
  dependencies: CountDependencies,
  actor: Actor,
  row: ArrivalRow,
  entry: NewEntry,
  replaced: CountEntryFacts | undefined,
): Promise<CountLineSaved> {
  const { size, batch, ...rest } = entry;
  await context.tx.insert(countEntry).values({
    ...rest,
    ...sizeColumns(size),
    ...batchColumns(batch),
    arrivalId: row.id,
    ...scopeColumns(row),
    enteredByUserId: actor.userId,
  });
  const versionToken = await recordChange(
    context,
    row,
    entry.removed ? 'count-line-removal' : 'count-line',
    actor.userId,
  );
  const after = fieldsOf(entry);
  const before = replaced === undefined ? undefined : fieldsOf(replaced);
  const field = (name: keyof typeof after) => before?.[name] ?? null;
  await audited(context, dependencies.audit, actor, row, {
    record: { type: ARRIVAL_TYPE, id: row.id, versionId: entry.id },
    operation: entry.removed ? 'remove-count-line' : 'save-count-line',
    changes: (Object.keys(after) as (keyof typeof after)[])
      .filter((name) => JSON.stringify(field(name)) !== JSON.stringify(after[name]))
      .map((name) => valueChange(name, field(name), after[name])),
  });
  return { lineId: entry.lineId, lineVersionToken: entry.id, versionToken };
}

/**
 * Saves a line of the count, new or the next version of one (goods-in 4.3). Refused while no attribute is marked as
 * the size list, naming the setting (RR-556; code-house-rules 12.14); while the Arrival holds no invoice (DEC-133); a
 * size that is not an approved value in force today of the attribute marked as the size list; a style, colour and size
 * another line counts already; a product not in force at the Site today, of another brand or of another style code
 * than the line's.
 */
export async function saveCountLine(
  context: TransactionContext,
  dependencies: CountDependencies,
  actor: Actor,
  arrivalId: string,
  draft: CountLineDraft,
): Promise<Outcome<CountLineSaved>> {
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  const sizes = await markedAttributeAt(context, 'size');
  if (sizes.kind === 'not-set') return refusalOf(sizes.refusal);
  const found = await arrivalForChange(context, arrivalId);
  if (found.kind !== 'open') return found;
  const { row } = found;
  const [invoice] = await context.tx
    .select({ id: arrivalInvoice.id })
    .from(arrivalInvoice)
    .where(eq(arrivalInvoice.arrivalId, row.id))
    .limit(1);
  if (invoice === undefined) return refused('refused', 'receiving.invoice-required', [{ kind: 'invoice' }]);
  const entries = await entriesOf(context, row.id);
  let replaced: CountEntryFacts | undefined;
  if (draft.line !== undefined) {
    const inForce = lineInForce(entries, draft.line.lineId, draft.line.versionToken);
    if (inForce.kind !== 'found') return inForce;
    replaced = inForce.entry;
  }
  let size: Size | null = null;
  if (draft.sizeValueId !== null) {
    const { attributeId } = sizes;
    const valueId = draft.sizeValueId;
    const value = (await vocabularyOn(context, attributeId, date)).find((each) => each.id === valueId);
    if (value === undefined) {
      return refused('refused', 'receiving.size-not-on-list', [
        recordItem('merchandise.attribute', attributeId),
        recordItem('merchandise.vocabulary_value', valueId),
      ]);
    }
    size = { attributeId, valueId: value.id, code: value.code };
  }
  // One line per style, colour and size (goods-in 4.3): a line for them already is the one to change.
  const repeated = lineCounting(
    currentLines(entries),
    { styleCode: draft.styleCode, colour: draft.colour, size },
    draft.line?.lineId,
  );
  if (repeated !== undefined) return refused('refused', 'receiving.line-repeated', [lineItem(repeated.lineId)]);
  if (draft.skuId !== null) {
    const read = await skuOn(context, draft.skuId, row.siteId, date);
    if (
      'refusal' in read ||
      read.sku.brandId !== row.brandId ||
      textKey(read.sku.styleCode) !== textKey(draft.styleCode)
    ) {
      return refused('refused', 'receiving.sku-not-of-line', [recordItem('merchandise.sku', draft.skuId)]);
    }
  }
  const id = uuidv7();
  const answer = await writeEntry(
    context,
    dependencies,
    actor,
    row,
    {
      id,
      lineId: draft.line?.lineId ?? id,
      replacesEntryId: replaced?.id ?? null,
      removed: false,
      styleCode: trimmed(draft.styleCode),
      colour: draft.colour === null ? null : trimmed(draft.colour),
      size,
      skuId: draft.skuId,
      invoiceQuantity: draft.invoiceQuantity,
      countedQuantity: draft.countedQuantity,
      batch: draft.batch === null ? null : { code: trimmed(draft.batch.code), expiryDate: draft.batch.expiryDate },
    },
    replaced,
  );
  return { kind: 'success', answer };
}

/** Removes a line of the count before the GRN, naming its newest version: an entry that removes it, keeping the rest. */
export async function removeCountLine(
  context: TransactionContext,
  dependencies: CountDependencies,
  actor: Actor,
  arrivalId: string,
  lineId: string,
  draft: CountLineRemoval,
): Promise<Outcome<CountLineSaved>> {
  const found = await arrivalForChange(context, arrivalId);
  if (found.kind !== 'open') return found;
  const { row } = found;
  const inForce = lineInForce(await entriesOf(context, row.id), lineId, draft.lineVersionToken);
  if (inForce.kind !== 'found') return inForce;
  const { entry } = inForce;
  const answer = await writeEntry(
    context,
    dependencies,
    actor,
    row,
    {
      id: uuidv7(),
      lineId,
      replacesEntryId: entry.id,
      removed: true,
      styleCode: entry.styleCode,
      colour: entry.colour,
      size: entry.size,
      skuId: entry.skuId,
      invoiceQuantity: entry.invoiceQuantity,
      countedQuantity: entry.countedQuantity,
      batch: entry.batch,
    },
    entry,
  );
  return { kind: 'success', answer };
}
