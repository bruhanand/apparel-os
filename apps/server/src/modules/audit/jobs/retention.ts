import { sql } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';

/**
 * The retention step (numbering-and-audit 4.6; POL-18.05). Deletion after retention runs only through
 * audit.delete_after_retention, one sealed block at a time. The retention periods are OPEN (V-13; KDPS Owner, Admin,
 * CA; stage 1 live use), so it deletes nothing. Returns the number of rows deleted.
 */
export async function applyRetention(context: TransactionContext): Promise<number> {
  if (context.readOnly) throw new CommandDefect('Retention is a command, never a read');
  const result = await context.tx.execute<{ deleted: string }>(
    sql`select audit.delete_after_retention()::text as deleted`,
  );
  return Number(result.rows[0]?.deleted ?? '0');
}
