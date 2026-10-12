import { tablesOf, type RestoreParticipant } from '../../kernel/index.js';
import * as siteLifecycleTables from './db/schema.js';

/**
 * Site-lifecycle's part in backup and restore (backup-and-restore 10.1, 10.2; PRD-ACP-019): the totals of its tables,
 * the readiness records configuration refers to, and that the Sites, units, users and decisions its rows name resolve.
 */
export const siteLifecycleRestoreParticipant: RestoreParticipant = {
  unit: 'site-lifecycle',
  tier: 5,
  tables: tablesOf(siteLifecycleTables),
  records: [
    {
      recordType: 'site_lifecycle.readiness_record',
      table: 'site_lifecycle.readiness_record',
      suffixes: ['readiness_record_id'],
    },
  ],
};
