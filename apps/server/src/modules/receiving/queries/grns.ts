import { eq } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { grn } from '../db/schema.js';

// A GRN's own row, as the actor may see it under row-level security (code-house-rules 6.2; goods-in 4.8, 4.10).

/** A GRN as the actor may see it, or undefined. */
export async function grnRow(context: TransactionContext, grnId: string) {
  const [row] = await context.tx.select().from(grn).where(eq(grn.id, grnId));
  return row;
}
