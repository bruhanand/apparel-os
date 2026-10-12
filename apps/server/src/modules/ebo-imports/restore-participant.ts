import { tablesOf, type RestoreParticipant } from '../../kernel/index.js';
import * as eboImportsTables from './db/schema.js';

/**
 * Ebo-imports' part in backup and restore (backup-and-restore 3.2 step 2, 5.1, 10.1, 10.2; PRD-ACP-019; RR-523): the
 * totals of its reference documents and lines, a daily-sales line's amount included, and that the import batches,
 * documents and staged rows, users, role assignments, SKUs and places they name resolve through the participants that
 * answer for them. A reference record never moves stock or money (PRD-LIF-014), so it has no invariant of its own.
 */
export const eboImportsRestoreParticipant: RestoreParticipant = {
  unit: 'ebo-imports',
  tier: 4,
  tables: tablesOf(eboImportsTables),
};
