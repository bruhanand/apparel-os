import { uuidv7 } from '@apparel-os/domain';
import { ARRIVAL_TYPE, type CountLineDraft, type CountLineRemoval, type CountLineSaved } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AuditChange, AuditInterface } from '../../audit/index.js';
import { skuOn, type CatalogueInterface } from '../../merchandise/catalogue/index.js';
import { arrivalInvoice, countEntry } from '../db/schema.js';
import { lineItem, newestEntry, type CountEntryFacts } from '../domain/lines.js';
import { arrivalForChange } from './arrival.js';
import {
  factsOf,
  recordChange,
  refused,
  scopeColumns,
  textKey,
  today,
  trimmed,
  type Actor,
  type ArrivalRow,
  type Outcome,
} from './common.js';

// Save the count as it goes, line by line, and resume it (goods-in 4.3; PRD-REC-005; DEC-133, DEC-138; S2-F02-T02).
// The count starts only once the Arrival holds an invoice (DEC-133). A line is the style code as the invoice writes it,
// the colour as the invoice names it, the size from the size list and the product when one is named, with the invoice
// and counted quantities; each save is a new entry of the line naming the one it replaces, so two people saving over
// the same version never both succeed (code-house-rules 12.7), and who saved each is kept, from their sign-ins.

export interface CountDependencies {
  readonly audit: AuditInterface;
  readonly catalogue: Pick<CatalogueInterface, 'vocabularyOn'>;
}

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
const change = (field: string, before: ValueChange['before'], after: ValueChange['after']): ValueChange => ({
  kind: 'value',
  field,
  before,
  after,
});

async function entriesOf(context: TransactionContext, arrivalId: string): Promise<CountEntryFacts[]> {
  return context.tx.select().from(countEntry).where(eq(countEntry.arrivalId, arrivalId));
}

/** The line and its newest entry, when the token names that entry; the refusal otherwise (code-house-rules 12.7). */
async function lineInForce(
  context: TransactionContext,
  row: ArrivalRow,
  lineId: string,
  versionToken: string,
): Promise<{ readonly kind: 'found'; readonly entry: CountEntryFacts } | Outcome<never>> {
  const newest = newestEntry(await entriesOf(context, row.id), lineId);
  if (newest === undefined || newest.removed) {
    return refused('not-found', 'receiving.record-not-found', [lineItem(lineId)]);
  }
  if (newest.id !== versionToken) return refused('conflict', 'kernel.stale-version', [lineItem(lineId)]);
  return { kind: 'found', entry: newest };
}

/** The entry's audited fields. */
function fieldsOf(
  entry: Omit<CountEntryFacts, 'id' | 'lineId' | 'replacesEntryId' | 'enteredByUserId' | 'recordedAt'>,
) {
  return {
    removed: entry.removed,
    styleCode: entry.styleCode,
    colour: entry.colour,
    size: entry.sizeCode,
    skuId: entry.skuId,
    invoiceQuantity: entry.invoiceQuantity,
    countedQuantity: entry.countedQuantity,
    batch: entry.batchCode === null ? null : { code: entry.batchCode, expiryDate: entry.expiryDate },
  };
}

/** Writes an entry, the Arrival's next change and the audit record. */
async function writeEntry(
  context: TransactionContext,
  dependencies: CountDependencies,
  actor: Actor,
  row: ArrivalRow,
  entry: Omit<CountEntryFacts, 'enteredByUserId' | 'recordedAt'>,
  replaced: CountEntryFacts | undefined,
): Promise<CountLineSaved> {
  await context.tx.insert(countEntry).values({
    ...entry,
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
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: actor.userId },
    roleAssignmentId: actor.roleAssignmentId,
    scope: factsOf(row),
    record: { module: 'receiving', type: ARRIVAL_TYPE, id: row.id, versionId: entry.id },
    operation: entry.removed ? 'remove-count-line' : 'save-count-line',
    changes: Object.entries(after)
      .filter(
        ([field, value]) => JSON.stringify(before?.[field as keyof typeof after] ?? null) !== JSON.stringify(value),
      )
      .map(([field, value]) => change(field, before?.[field as keyof typeof after] ?? null, value)),
    source: { kind: 'screen' },
  });
  return { lineId: entry.lineId, lineVersionToken: entry.id, versionToken };
}

/**
 * Saves a line of the count, new or the next version of one (goods-in 4.3). Refused while the Arrival holds no invoice
 * (DEC-133); a size that is not an approved value of its attribute in force today; a product not in force at the Site
 * today, of another brand or of another style code than the line's.
 */
export async function saveCountLine(
  context: TransactionContext,
  dependencies: CountDependencies,
  actor: Actor,
  arrivalId: string,
  draft: CountLineDraft,
): Promise<Outcome<CountLineSaved>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const found = await arrivalForChange(context, arrivalId);
  if (found.kind !== 'open') return found;
  const { row } = found;
  const [invoice] = await context.tx
    .select({ id: arrivalInvoice.id })
    .from(arrivalInvoice)
    .where(eq(arrivalInvoice.arrivalId, row.id))
    .limit(1);
  if (invoice === undefined) return refused('refused', 'receiving.invoice-required', [{ kind: 'invoice' }]);
  let replaced: CountEntryFacts | undefined;
  if (draft.line !== undefined) {
    const inForce = await lineInForce(context, row, draft.line.lineId, draft.line.versionToken);
    if (inForce.kind !== 'found') return inForce;
    replaced = inForce.entry;
  }
  let size: { readonly attributeId: string; readonly valueId: string; readonly code: string } | null = null;
  if (draft.size !== null) {
    const values = await dependencies.catalogue.vocabularyOn(context, draft.size.attributeId, date);
    const value = values.find((each) => each.id === draft.size?.valueId);
    if (value === undefined) {
      return refused('refused', 'receiving.size-not-on-list', [
        { kind: 'record', recordType: 'merchandise.attribute', recordId: draft.size.attributeId },
        { kind: 'record', recordType: 'merchandise.vocabulary_value', recordId: draft.size.valueId },
      ]);
    }
    size = { attributeId: draft.size.attributeId, valueId: value.id, code: value.code };
  }
  if (draft.skuId !== null) {
    const read = await skuOn(context, draft.skuId, row.siteId, date);
    if (
      'refusal' in read ||
      read.sku.brandId !== row.brandId ||
      textKey(read.sku.styleCode) !== textKey(draft.styleCode)
    ) {
      return refused('refused', 'receiving.sku-not-of-line', [
        { kind: 'record', recordType: 'merchandise.sku', recordId: draft.skuId },
      ]);
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
      sizeAttributeId: size?.attributeId ?? null,
      sizeValueId: size?.valueId ?? null,
      sizeCode: size?.code ?? null,
      skuId: draft.skuId,
      invoiceQuantity: draft.invoiceQuantity,
      countedQuantity: draft.countedQuantity,
      batchCode: draft.batch === null ? null : trimmed(draft.batch.code),
      expiryDate: draft.batch?.expiryDate ?? null,
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
  const inForce = await lineInForce(context, row, lineId, draft.lineVersionToken);
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
      sizeAttributeId: entry.sizeAttributeId,
      sizeValueId: entry.sizeValueId,
      sizeCode: entry.sizeCode,
      skuId: entry.skuId,
      invoiceQuantity: entry.invoiceQuantity,
      countedQuantity: entry.countedQuantity,
      batchCode: entry.batchCode,
      expiryDate: entry.expiryDate,
    },
    entry,
  );
  return { kind: 'success', answer };
}
