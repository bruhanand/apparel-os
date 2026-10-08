import { uuidv7 } from '@apparel-os/domain';
import { desc, eq } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { numberFormat, numberFormatPart, numberFormatVersion } from '../db/schema.js';
import { checkFormat, type FormatPart } from '../domain/format.js';
import { answered, refused, type NumberingResult } from '../domain/kinds.js';

/** A format version as defined. */
export interface FormatVersion {
  readonly formatId: string;
  readonly versionId: string;
  readonly version: number;
}

/**
 * Define a format version (numbering-and-audit 3.5): creates the format the first time its code is used, then adds the
 * next version with its parts. A series keeps the version it was defined with, so the new version applies only to
 * series defined after it. The parts are checked as for a yearly kind here; each series checks them against its own
 * kind when it is defined. No format has a default: the caller, which has authorised the change, supplies every part.
 */
export async function defineFormatVersion(
  context: TransactionContext,
  code: string,
  parts: readonly FormatPart[],
): Promise<NumberingResult<FormatVersion>> {
  if (code.trim() === '' || checkFormat(parts, { yearly: true }) !== undefined) return refused('format-invalid');
  await context.tx.insert(numberFormat).values({ id: uuidv7(), code }).onConflictDoNothing();
  const format = (await context.tx.select().from(numberFormat).where(eq(numberFormat.code, code)))[0];
  if (format === undefined) throw new Error('A format just written is not visible');
  const latest = await context.tx
    .select({ version: numberFormatVersion.version })
    .from(numberFormatVersion)
    .where(eq(numberFormatVersion.numberFormatId, format.id))
    .orderBy(desc(numberFormatVersion.version))
    .limit(1);
  const version = (latest[0]?.version ?? 0) + 1;
  const versionId = uuidv7();
  await context.tx.insert(numberFormatVersion).values({ id: versionId, numberFormatId: format.id, version });
  await context.tx.insert(numberFormatPart).values(
    parts.map((part, position) => ({
      id: uuidv7(),
      numberFormatVersionId: versionId,
      position,
      kind: part.kind,
      text: part.kind === 'text' ? part.text : null,
      width: part.kind === 'sequence' ? part.width : null,
    })),
  );
  return answered({ formatId: format.id, versionId, version });
}
