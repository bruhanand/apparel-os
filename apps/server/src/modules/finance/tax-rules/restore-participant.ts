import { tablesOf, type RestoreParticipant } from '../../../kernel/index.js';
import * as taxRulesTables from './db/schema.js';

/**
 * The tax rules' part in backup and restore (backup-and-restore 10.1, 10.2; PRD-ACP-019): the totals of its tables,
 * and that the registrations, users and decisions its rows name resolve.
 */
export const taxRulesRestoreParticipant: RestoreParticipant = {
  unit: 'finance.tax-rules',
  tier: 2,
  tables: tablesOf(taxRulesTables),
};
