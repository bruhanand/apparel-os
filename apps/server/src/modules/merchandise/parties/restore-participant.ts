import { sql } from 'drizzle-orm';
import { tablesOf, type RestoreParticipant } from '../../../kernel/index.js';
import * as partiesTables from './db/schema.js';

/**
 * The parties' part in backup and restore (backup-and-restore 2.3, 10.1, 10.2; PRD-ACP-019): the totals of its tables,
 * the parties and agreement versions other modules refer to, and the key versions its bank details name.
 */
export const partiesRestoreParticipant: RestoreParticipant = {
  unit: 'merchandise.parties',
  tier: 2,
  tables: tablesOf(partiesTables),
  records: [
    { recordType: 'merchandise.party', table: 'merchandise.party', suffixes: ['party_id'] },
    {
      recordType: 'merchandise.agreement_version',
      table: 'merchandise.agreement_version',
      suffixes: ['agreement_version_id'],
    },
  ],
  async keyVersions(context) {
    const rows = await context.tx.execute<{ identifier: string | null; uses: string }>(
      sql`select key_version as identifier, count(*)::text as uses from merchandise.party_bank_details group by 1`,
    );
    return rows.rows.map((row) => ({ identifier: row.identifier, uses: Number(row.uses) }));
  },
};
