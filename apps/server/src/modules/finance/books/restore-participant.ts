import { sql } from 'drizzle-orm';
import { tablesOf, type RestoreParticipant } from '../../../kernel/index.js';
import * as booksTables from './db/schema.js';

/**
 * The books' part in backup and restore (backup-and-restore 3.2 step 2, 5.1, 10.1, 10.2; PRD-MOD-014, PRD-ACP-019):
 * the totals of its tables, the debit and credit totals of each book in paise, and its own invariant, that every
 * journal balances (books-and-posting 5.2).
 */
export const booksRestoreParticipant: RestoreParticipant = {
  unit: 'finance.books',
  tier: 2,
  tables: tablesOf(booksTables),
  async totals(context) {
    const rows = await context.tx.execute<{ book_id: string; side: string; total: string }>(
      sql`select j.book_id::text as book_id, l.side, sum(l.amount_paise)::text as total
            from finance.journal_line l join finance.journal j on j.id = l.journal_id
           group by 1, 2 order by 1, 2`,
    );
    return rows.rows.map((row) => ({ name: `finance.book.${row.book_id}.${row.side}_paise`, value: row.total }));
  },
  async invariants(context) {
    const rows = await context.tx.execute<{ journals: string; unbalanced: string }>(
      sql`select count(*)::text as journals,
                 count(*) filter (where coalesce(t.debit, 0) <> coalesce(t.credit, 0))::text as unbalanced
            from finance.journal j
            left join (select journal_id,
                              sum(amount_paise) filter (where side = 'debit') as debit,
                              sum(amount_paise) filter (where side = 'credit') as credit
                         from finance.journal_line group by journal_id) t on t.journal_id = j.id`,
    );
    const row = rows.rows[0];
    const unbalanced = Number(row?.unbalanced ?? 0);
    return [
      {
        check: 'every journal balances',
        passed: unbalanced === 0,
        checked: Number(row?.journals ?? 0),
        failed: unbalanced,
      },
    ];
  },
};
