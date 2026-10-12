import * as kernelTables from '../db/schema.js';
import { JOB_RECORD_TYPE } from '../jobs/job-failed.js';
import { tablesOf, type RestoreParticipant } from './restore-contract.js';

/**
 * Kernel's own part in backup and restore (backup-and-restore 10.1, 10.2): the totals of its tables in an Organisation
 * database (the runner's record, idempotency, the outbox, the backup record) and of pg-boss's jobs, whose failed jobs
 * exceptions link to as `kernel.job` (code-house-rules 12.9). The directory's routing table lives in the directory
 * database, which has no participants.
 */
export const kernelRestoreParticipant: RestoreParticipant = {
  unit: 'kernel',
  tier: 0,
  tables: [
    ...tablesOf(kernelTables).filter((table) => table !== 'kernel.directory_entry'),
    'kernel.migration',
    'pgboss.job',
  ].sort(),
  records: [{ recordType: JOB_RECORD_TYPE, table: 'pgboss.job' }],
  notReferences: {
    'kernel.idempotency_key.actor_id': 'a user or a service identity; the key is checked with its result',
    'kernel.outbox_event.actor_id': 'a user or a service identity',
  },
};
