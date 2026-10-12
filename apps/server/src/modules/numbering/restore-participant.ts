import { sql } from 'drizzle-orm';
import { tablesOf, type RestoreParticipant } from '../../kernel/index.js';
import * as numberingTables from './db/schema.js';

/**
 * Numbering's part in backup and restore (backup-and-restore 3.2 step 2, 5.3, 10.1, 10.2; POL-18.04, PRD-ACP-019):
 * the totals of its tables, the highest number allocated in each series, and the allocations others refer to. Pausing
 * every series after a restore is S1-F14-T03's.
 */
export const numberingRestoreParticipant: RestoreParticipant = {
  unit: 'numbering',
  tier: 1,
  tables: tablesOf(numberingTables),
  records: [
    { recordType: 'numbering.allocation', table: 'numbering.allocation', suffixes: ['number_allocation_id'] },
    { recordType: 'numbering.series', table: 'numbering.series' },
  ],
  async totals(context) {
    const rows = await context.tx.execute<{ series_id: string; highest: string }>(
      sql`select s.id::text as series_id, coalesce(max(a.sequence_number), 0)::text as highest
            from numbering.series s left join numbering.allocation a on a.series_id = s.id
           group by s.id order by s.id`,
    );
    return rows.rows.map((row) => ({ name: `numbering.series.${row.series_id}.highest`, value: row.highest }));
  },
};
