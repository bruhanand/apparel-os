import { and, eq, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import { goodsClassificationVersion } from '../db/schema.js';

/**
 * Whether a classification has an approved version in force on the date that is not retired (shared-calculations
 * 10.1, 10.3): a rate rule names only such a classification, when prepared and again when approved.
 */
export async function classificationUsable(
  context: TransactionContext,
  classificationId: string,
  date: string,
): Promise<boolean> {
  const rows = await context.tx
    .select({ id: goodsClassificationVersion.id })
    .from(goodsClassificationVersion)
    .where(
      and(
        eq(goodsClassificationVersion.goodsClassificationId, classificationId),
        eq(goodsClassificationVersion.decision, 'Approved'),
        eq(goodsClassificationVersion.retired, false),
        sql`${goodsClassificationVersion.validDuring} @> ${date}::date`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}
