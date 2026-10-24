import { asc, desc, eq } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import { grn, grnLine, heldLine, heldLineDecision, heldLineVersion } from '../db/schema.js';

// The rows of one held line its commands and its decision read (goods-in 4.6, 4.9; S2-F02-T03): the held line, its
// versions, its decision, and who received its goods. Read under the actor, so row-level security keeps out a held
// line the actor may not see (code-house-rules 6.2); a command reads them again after it locks the held line's identity
// row at step 1, under which every change of them is written (8.1, 8.2).

export type HeldLineRow = typeof heldLine.$inferSelect;
export type HeldLineVersionRow = typeof heldLineVersion.$inferSelect;

/** The held line as the actor may see it, or undefined (code-house-rules 6.2). */
export async function heldLineRow(context: TransactionContext, heldLineId: string): Promise<HeldLineRow | undefined> {
  const [row] = await context.tx.select().from(heldLine).where(eq(heldLine.id, heldLineId));
  return row;
}

/** A held line's versions, oldest first (goods-in 4.6). */
export function versionsOf(context: TransactionContext, heldLineId: string): Promise<HeldLineVersionRow[]> {
  return context.tx
    .select()
    .from(heldLineVersion)
    .where(eq(heldLineVersion.heldLineId, heldLineId))
    .orderBy(asc(heldLineVersion.versionNumber));
}

/** One version of a held line, or undefined. */
export async function versionRow(
  context: TransactionContext,
  versionId: string,
): Promise<HeldLineVersionRow | undefined> {
  const [row] = await context.tx.select().from(heldLineVersion).where(eq(heldLineVersion.id, versionId));
  return row;
}

/** The identifier of a held line's latest version, or undefined. */
export async function latestVersionIdOf(context: TransactionContext, heldLineId: string): Promise<string | undefined> {
  const [latest] = await context.tx
    .select({ id: heldLineVersion.id })
    .from(heldLineVersion)
    .where(eq(heldLineVersion.heldLineId, heldLineId))
    .orderBy(desc(heldLineVersion.versionNumber))
    .limit(1);
  return latest?.id;
}

/** A held line's decision, once made. */
export async function decisionOf(context: TransactionContext, heldLineId: string) {
  const [row] = await context.tx.select().from(heldLineDecision).where(eq(heldLineDecision.heldLineId, heldLineId));
  return row;
}

/**
 * Whoever received a held line's goods, from the GRN it was issued on (goods-in 4.3, 4.6; PRD-REC-013): everyone who
 * counted the GRN line and whoever issued the GRN, none of whom decides it.
 */
export async function receiversOfHeldLine(context: TransactionContext, row: HeldLineRow): Promise<string[]> {
  const [line] = await context.tx
    .select({ countedBy: grnLine.countedByUserIds, issuedBy: grn.issuedByUserId })
    .from(grnLine)
    .innerJoin(grn, eq(grn.id, grnLine.grnId))
    .where(eq(grnLine.id, row.grnLineId));
  if (line === undefined) throw new CommandDefect(`Held line ${row.id} names no GRN line`);
  return [...new Set([...line.countedBy, line.issuedBy])];
}
