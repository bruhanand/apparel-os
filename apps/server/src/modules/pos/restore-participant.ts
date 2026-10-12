import { tablesOf, type RestoreParticipant } from '../../kernel/index.js';
import * as posTables from './db/schema.js';

/**
 * Pos's part in backup and restore (backup-and-restore 10.1, 10.2; PRD-ACP-019): the totals of its billing devices,
 * and that the Stores, units, users and role assignments they name resolve. A module that started holding records
 * after S1-F14 was designed registers its own participant (S1-F14-T02 notes).
 */
export const posRestoreParticipant: RestoreParticipant = {
  unit: 'pos',
  tier: 4,
  tables: tablesOf(posTables),
};
