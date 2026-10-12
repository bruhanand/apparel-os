import { tablesOf, type RestoreParticipant } from '../../kernel/index.js';
import * as exceptionsTables from './db/schema.js';

/**
 * Exceptions' part in backup and restore (backup-and-restore 10.1, 10.2; PRD-EXC-001, PRD-ACP-019): the totals of its
 * tables, and that each exception's linked records, held by type and identifier, and the users, roles and attachments
 * it names resolve.
 */
export const exceptionsRestoreParticipant: RestoreParticipant = {
  unit: 'exceptions',
  tier: 2,
  tables: tablesOf(exceptionsTables),
  typedReferences: [{ table: 'exceptions.exception_link', typeColumn: 'record_type', idColumn: 'record_id' }],
  notReferences: {
    'exceptions.exception_event.actor_id': 'a user or a service identity',
  },
};
