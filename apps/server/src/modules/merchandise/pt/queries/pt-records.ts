import { desc, eq } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { RecordFacts } from '../../../access/index.js';
import type { AuditScope } from '../../../audit/index.js';
import { pt, ptRevision, ptRevisionWithdrawal } from '../db/schema.js';

// The rows of a PT that its commands and reads find it by (goods-in 5.7; S2-F04-T02), as the reader may see them under
// row-level security (code-house-rules 6.2): the PT of a GRN, a revision with its PT's facts, and the PT's version
// token.

/** The PT of a GRN, as the reader may see it, or undefined before its first submit. */
export async function ptOfGrn(context: TransactionContext, grnId: string) {
  const [row] = await context.tx.select().from(pt).where(eq(pt.grnId, grnId));
  return row;
}

/** The revision as the reader may see it, with its PT and its facts, which a route authorises with; else undefined. */
export async function revisionFacts(
  context: TransactionContext,
  revisionId: string,
): Promise<{ readonly ptId: string; readonly facts: RecordFacts & AuditScope } | undefined> {
  const [row] = await context.tx.select().from(ptRevision).where(eq(ptRevision.id, revisionId));
  if (row === undefined) return undefined;
  const { siteId, storeId, businessUnitId, legalEntityId, brandId } = row;
  return {
    ptId: row.ptId,
    facts: { siteId, businessUnitId, legalEntityId, brandId, ...(storeId === null ? {} : { storeId }) },
  };
}

/**
 * The PT's version token (code-house-rules 12.7): the newest row its state is built from, its newest revision, or that
 * revision's withdrawal once withdrawn. A new revision comes only once the one before it is withdrawn or ended, so no
 * other row is newer.
 */
export async function ptVersionToken(context: TransactionContext, ptId: string): Promise<string | undefined> {
  const [newest] = await context.tx
    .select({ id: ptRevision.id })
    .from(ptRevision)
    .where(eq(ptRevision.ptId, ptId))
    .orderBy(desc(ptRevision.revisionNumber))
    .limit(1);
  if (newest === undefined) return undefined;
  const [withdrawn] = await context.tx
    .select({ id: ptRevisionWithdrawal.id })
    .from(ptRevisionWithdrawal)
    .where(eq(ptRevisionWithdrawal.ptRevisionId, newest.id));
  return withdrawn?.id ?? newest.id;
}
