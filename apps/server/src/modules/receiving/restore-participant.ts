import { tablesOf, type RestoreParticipant } from '../../kernel/index.js';
import * as receivingTables from './db/schema.js';

/**
 * `receiving`'s part in backup and restore (backup-and-restore 10.1, 10.2; PRD-ACP-019): the totals of its tables. Its
 * invoice and photo attachments name the Arrival by its own record type, `receiving.arrival`, which its table answers
 * under its own name; the stock ledger's receipt counts name the GRN as their source (stock-ledger 13.2).
 */
export const receivingRestoreParticipant: RestoreParticipant = {
  unit: 'receiving',
  tier: 4,
  tables: tablesOf(receivingTables),
};
