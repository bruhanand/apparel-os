import type { Batch, CountEntryFacts, LineDamage, Size } from '../domain/lines.js';
import type { countEntry } from './schema.js';

// The count's values as `receiving`'s tables keep them (goods-in 4.3; S2-F02-T02): a size as its attribute, value, code
// and the marking's version it was read under, all four present or none; a batch as its code and expiry, both or none
// (migration 0088). The one place a row
// becomes the domain's values and back.

interface SizeColumns {
  readonly sizeAttributeId: string | null;
  readonly sizeValueId: string | null;
  readonly sizeCode: string | null;
  readonly sizeMarkedAttributeVersionId: string | null;
}

interface BatchColumns {
  readonly batchCode: string | null;
  readonly expiryDate: string | null;
}

/** A size as its row keeps it, or none (`count_entry_size`). */
export function sizeOf(row: SizeColumns): Size | null {
  if (
    row.sizeAttributeId === null ||
    row.sizeValueId === null ||
    row.sizeCode === null ||
    row.sizeMarkedAttributeVersionId === null
  ) {
    return null;
  }
  return {
    attributeId: row.sizeAttributeId,
    valueId: row.sizeValueId,
    markedAttributeVersionId: row.sizeMarkedAttributeVersionId,
    code: row.sizeCode,
  };
}

export function sizeColumns(size: Size | null): SizeColumns {
  return {
    sizeAttributeId: size?.attributeId ?? null,
    sizeValueId: size?.valueId ?? null,
    sizeCode: size?.code ?? null,
    sizeMarkedAttributeVersionId: size?.markedAttributeVersionId ?? null,
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

interface DamageColumns {
  readonly damagedQuantity: number | null;
  readonly damageDescription: string | null;
  readonly damagePhotoStoredFileId: string | null;
  readonly damagePhotoFileReceiptId: string | null;
}

/** The damage the count found, as its row keeps it, or none (`count_entry_damage`, migration 0096). */
export function damageOf(row: DamageColumns): LineDamage | null {
  if (row.damagedQuantity === null || row.damageDescription === null) return null;
  return {
    quantity: row.damagedQuantity,
    description: row.damageDescription,
    photo:
      row.damagePhotoStoredFileId === null || row.damagePhotoFileReceiptId === null
        ? null
        : { storedFileId: row.damagePhotoStoredFileId, fileReceiptId: row.damagePhotoFileReceiptId },
  };
}

export function damageColumns(damage: LineDamage | null): DamageColumns {
  return {
    damagedQuantity: damage?.quantity ?? null,
    damageDescription: damage?.description ?? null,
    damagePhotoStoredFileId: damage?.photo?.storedFileId ?? null,
    damagePhotoFileReceiptId: damage?.photo?.fileReceiptId ?? null,
  };
}

/** A count entry's row as the domain reads it. */
export function entryFacts(row: typeof countEntry.$inferSelect): CountEntryFacts {
  return {
    id: row.id,
    lineId: row.lineId,
    replacesEntryId: row.replacesEntryId,
    removed: row.removed,
    goods: row.goods,
    styleCode: row.styleCode,
    colour: row.colour,
    size: sizeOf(row),
    skuId: row.skuId,
    description: row.description,
    invoiceQuantity: row.invoiceQuantity,
    countedQuantity: row.countedQuantity,
    extra: row.extra,
    damage: damageOf(row),
    batch: batchOf(row),
    enteredByUserId: row.enteredByUserId,
    recordedAt: row.recordedAt,
  };
}
