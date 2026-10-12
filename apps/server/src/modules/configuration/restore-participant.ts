import { tablesOf, type RestoreParticipant } from '../../kernel/index.js';
import * as configurationTables from './db/schema.js';

/**
 * Configuration's part in backup and restore (backup-and-restore 10.1, 10.2; PRD-ACP-019): the totals of its tables,
 * and that the users, decisions, readiness records and evidence attachments its rows name resolve. Its recovery
 * commands are in commands/recovery.ts (S1-F14-T03).
 */
export const configurationRestoreParticipant: RestoreParticipant = {
  unit: 'configuration',
  tier: 1,
  tables: tablesOf(configurationTables),
  // A policy's signature is read, authorised and attached to as `configuration.policy_status` (policy-status.ts), so
  // its evidence attachments name that type; it is kept in `configuration.policy_signature` (S1-F14-T04).
  records: [{ recordType: 'configuration.policy_status', table: 'configuration.policy_signature' }],
};
