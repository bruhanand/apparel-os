import { tablesOf, type RestoreParticipant } from '../../kernel/index.js';
import * as inboxTables from './db/schema.js';

/**
 * Inbox's part in backup and restore (backup-and-restore 10.1, 10.2; PRD-ACP-019): the totals of its tables, and that
 * each work item's owning record, held by type and identifier, and the users and roles it names resolve.
 */
export const inboxRestoreParticipant: RestoreParticipant = {
  unit: 'inbox',
  tier: 1,
  tables: tablesOf(inboxTables),
  typedReferences: [{ table: 'inbox.work_item', typeColumn: 'owner_record_type', idColumn: 'owner_record_id' }],
};
