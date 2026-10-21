import type { Batch, CountEntryFacts, Size } from '../domain/lines.js';
import type { countEntry } from './schema.js';

// The count's values as `receiving`'s tables keep them (goods-in 4.3; S2-F02-T02): a size as its attribute, value and
// code, a batch as its code and expiry, each all three or both present, or none (migration 0088). The one place a row
// becomes the domain's values and back.

interface SizeColumns {
  readonly sizeAttributeId: string | null;
  readonly sizeValueId: string | null;
  readonly sizeCode: string | null;
}

interface BatchColumns {
  readonly batchCode: string | null;
  readonly expiryDate: string | null;
}

/** A size as its row keeps it, or none (`count_entry_size`). */
export function sizeOf(row: SizeColumns): Size | null {
  if (row.sizeAttributeId === null || row.sizeValueId === null || row.sizeCode === null) return null;
  return { attributeId: row.sizeAttributeId, valueId: row.sizeValueId, code: row.sizeCode };
}

export function sizeColumns(size: Size | null): SizeColumns {
  return {
    sizeAttributeId: size?.attributeId ?? null,
    sizeValueId: size?.valueId ?? null,
    sizeCode: size?.code ?? null,
  };
}

/** A batch as its row keeps it, or none (`count_entry_batch`). */
export function batchOf(row: BatchColumns): Batch | null {
  if (row.batchCode === null || row.expiryDate === null) return null;
  return { code: row.batchCode, expiryDate: row.expiryDate };
}

export function batchColumns(batch: Batch | null): BatchColumns {
  return { batchCode: batch?.code ?? null, expiryDate: batch?.expiryDate ?? null };
}

/** A count entry's row as the domain reads it. */
export function entryFacts(row: typeof countEntry.$inferSelect): CountEntryFacts {
  return {
    id: row.id,
    lineId: row.lineId,
    replacesEntryId: row.replacesEntryId,
    removed: row.removed,
    styleCode: row.styleCode,
    colour: row.colour,
    size: sizeOf(row),
    skuId: row.skuId,
    invoiceQuantity: row.invoiceQuantity,
    countedQuantity: row.countedQuantity,
    batch: batchOf(row),
    enteredByUserId: row.enteredByUserId,
    recordedAt: row.recordedAt,
  };
}
