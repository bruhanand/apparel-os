import { tablesOf, type RestoreParticipant } from '../../../kernel/index.js';
import * as documentsTables from './db/schema.js';

/**
 * `stock` · documents' part in backup and restore (backup-and-restore 10.1, 10.2; PRD-ACP-019): the totals of its
 * tables, in the schema `stock` it shares with the ledger's part, which owns the others. Its photo attachments name a
 * report by its own record type, `stock.damage_report`, which its table answers under its own name.
 */
export const stockDocumentsRestoreParticipant: RestoreParticipant = {
  unit: 'stock.documents',
  tier: 4,
  tables: tablesOf(documentsTables),
};
