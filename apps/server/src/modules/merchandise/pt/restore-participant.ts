import { tablesOf, type RestoreParticipant } from '../../../kernel/index.js';
import * as ptTables from './db/schema.js';

/**
 * `merchandise` · PT's part in backup and restore (backup-and-restore 10.1, 10.2; PRD-ACP-019): the totals of its
 * tables. The approval request of a PT revision names it under its own record type, `merchandise.pt_revision`, which
 * its table answers under its own name; the GRN's "PT attached" mark is `receiving`'s (goods-in 5.8; S2-F04-T02).
 */
export const ptRestoreParticipant: RestoreParticipant = {
  unit: 'merchandise.pt',
  tier: 4,
  tables: tablesOf(ptTables),
};
