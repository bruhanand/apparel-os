import { sql } from 'drizzle-orm';
import { tablesOf, type RestoreCommandStep, type RestoreParticipant } from '../../kernel/index.js';
import { pauseEverySeriesAfterRestore } from './commands/after-restore.js';
import * as numberingTables from './db/schema.js';

/**
 * Numbering's after-restore step (backup-and-restore 4.2 step 7, 5.3; numbering-and-audit 3.6, 3.7; POL-18.04,
 * PRD-ACP-019; S1-F14-T03): every live series paused, with a series event each, under the restore's internal service
 * identity, which holds edit on `numbering.series`; no owning module calls it. It then checks that no series is Open.
 */
export const numberingRestoreSteps: readonly RestoreCommandStep[] = [
  {
    kind: 'command',
    unit: 'numbering',
    tier: 1,
    commandName: 'numbering.pause-series-after-restore',
    authorises: { action: 'edit', recordType: 'numbering.series' },
    async run(context, run) {
      const paused = await pauseEverySeriesAfterRestore(context, run.restoreId);
      const open = await context.tx.execute<{ n: string }>(
        sql`select count(*)::text as n from numbering.series where state = 'Open'`,
      );
      const stillOpen = Number(open.rows[0]?.n ?? 0);
      return [
        { check: 'every series paused', passed: stillOpen === 0, checked: paused + stillOpen, failed: stillOpen },
      ];
    },
  },
];

/**
 * Numbering's part in backup and restore (backup-and-restore 3.2 step 2, 5.3, 10.1, 10.2; POL-18.04, PRD-ACP-019):
 * the totals of its tables, the highest number allocated in each series, and the allocations others refer to. Pausing
 * every series after a restore is its after-restore step above (S1-F14-T03).
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
