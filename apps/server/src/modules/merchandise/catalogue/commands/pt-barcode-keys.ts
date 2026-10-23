import { uuidv7 } from '@apparel-os/domain';
import { and, eq, inArray } from 'drizzle-orm';
import {
  CommandDefect,
  lockTable,
  partsOf,
  type LockTarget,
  type TransactionContext,
} from '../../../../kernel/index.js';
import { externalCodeKey } from '../db/schema.js';

// The code rows of a PT's barcodes (structure-and-masters 4.3 "As built"; goods-in 6.6; S2-F06-T01): a step the PT
// approval's locks and its barcode mapping share (commands/map-pt-barcodes.ts), making a barcode's code row the first
// time it is mapped, as Map a code does.

/** The code row of each barcode, made the first time a barcode is mapped (4.3 "As built"); answers code → key row. */
export async function barcodeKeys(context: TransactionContext, codes: readonly string[]): Promise<Map<string, string>> {
  const keys = new Map<string, string>();
  const read = async (part: readonly string[]) => {
    const rows = await context.tx
      .select({ id: externalCodeKey.id, code: externalCodeKey.code })
      .from(externalCodeKey)
      .where(and(inArray(externalCodeKey.code, [...part]), eq(externalCodeKey.kind, 'supplier-barcode')));
    for (const row of rows) keys.set(row.code, row.id);
  };
  const distinct = [...new Set(codes)];
  for (const part of partsOf(distinct, 1)) await read(part);
  const missing = distinct.filter((code) => !keys.has(code));
  for (const part of partsOf(missing, 3)) {
    // A code row another command makes at the same moment meets the unique key; it is read again after.
    await context.tx
      .insert(externalCodeKey)
      .values(part.map((code) => ({ id: uuidv7(), code, kind: 'supplier-barcode' as const })))
      .onConflictDoNothing();
  }
  for (const part of partsOf(missing, 1)) await read(part);
  if (missing.some((code) => !keys.has(code))) throw new CommandDefect('A barcode row was made and not found after');
  return keys;
}

/**
 * The rows a PT approval locks at step 1 for its products (code-house-rules 8.2): each existing style a new SKU is
 * added to, as a product proposal's confirmation does (4.2 "As built"), and the code row of each barcode the PT's rows
 * name, as mapping a code does (4.3), each exclusively. A barcode's code row is made first when it has none, as Map a
 * code makes it.
 */
export async function ptProductLockTargets(
  context: TransactionContext,
  request: { readonly existingStyleIds: readonly string[]; readonly barcodes: readonly string[] },
): Promise<LockTarget[]> {
  const keys = await barcodeKeys(context, request.barcodes);
  return [
    ...[...new Set(request.existingStyleIds)].map((id) => ({
      table: lockTable('merchandise', 'style'),
      id,
      mode: 'exclusive' as const,
    })),
    ...[...keys.values()].map((id) => ({
      table: lockTable('merchandise', 'external_code_key'),
      id,
      mode: 'exclusive' as const,
    })),
  ];
}
