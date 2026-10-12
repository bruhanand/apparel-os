import { sql } from 'drizzle-orm';
import { tablesOf, type RestoreParticipant } from '../../kernel/index.js';
import * as auditTables from './db/schema.js';

/**
 * Audit's part in backup and restore (backup-and-restore 3.2 step 3, 5.4, 10.1, 10.2; PRD-SEC-007): the totals of its
 * tables, the latest seal read in the backup's snapshot, and its own invariant, that the seal chain verifies
 * (`audit.check_seals`, numbering-and-audit 4.4). An audit or access record names records of every kind by type and
 * identifier, including ones no table holds, such as a sign-in attempt; the seal chain proves those rows, so they are
 * not checked as references (backup-and-restore 5.1 "As built").
 */
export const auditRestoreParticipant: RestoreParticipant = {
  unit: 'audit',
  tier: 1,
  tables: tablesOf(auditTables),
  notReferences: {
    'audit.audit_record.actor_id': 'a user or a service identity',
  },
  async latestSeal(context) {
    const rows = await context.tx.execute<{ block_number: string; hash: string }>(
      sql`select block_number::text, hash from audit.audit_seal order by block_number desc limit 1`,
    );
    const row = rows.rows[0];
    return row === undefined ? null : { blockNumber: row.block_number, hash: row.hash };
  },
  async invariants(context) {
    const rows = await context.tx.execute<{ blocks: string; problems: string }>(
      sql`select (select count(*) from audit.audit_seal)::text as blocks,
                 (select count(*) from audit.check_seals())::text as problems`,
    );
    const row = rows.rows[0];
    const problems = Number(row?.problems ?? 0);
    return [
      {
        check: 'audit seal chain verifies',
        passed: problems === 0,
        checked: Number(row?.blocks ?? 0),
        failed: problems,
      },
    ];
  },
};
