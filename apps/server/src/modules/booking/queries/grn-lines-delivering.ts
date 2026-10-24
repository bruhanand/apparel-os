import { sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';

// Which GRN lines deliver their pieces to a booking, for `receiving`'s recount (goods-in 3.7, 4.10, 4.11; S2-F02-T05):
// those with a receipt link, and those waiting in a proposal of late or excess goods. Read through the narrowly
// authorised function `booking.grn_lines_delivering` (migration 0108; DEC-117), so the answer does not depend on whether
// the reader may see the booking; it carries nothing of it.

export async function grnLinesDelivering(
  context: TransactionContext,
  grnLineIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (grnLineIds.length === 0) return new Set();
  // One bound parameter holding the array, which the driver writes as a PostgreSQL array (code-house-rules 3.4).
  const rows = await context.tx.execute<{ grn_line_id: string }>(
    sql`select grn_line_id from booking.grn_lines_delivering(${sql.param([...grnLineIds])}::uuid[])`,
  );
  return new Set(rows.rows.map((row) => row.grn_line_id));
}
