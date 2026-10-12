import { tablesOf, type RestoreParticipant } from '../../../kernel/index.js';
import * as ledgerTables from './db/schema.js';
import { rebuildDifferences } from './queries/rebuild.js';

/**
 * The stock ledger's part in backup and restore (backup-and-restore 3.2 step 2, 5.1, 10.1, 10.2; PRD-ACP-019): the
 * totals of its tables, movements and quantities included, its own invariant, that every balance equals the sum of
 * its movements (Rebuild and compare, stock-ledger 11.7, 13.6), and that the places, SKUs, books, owners and decisions
 * its rows name resolve.
 */
export const stockLedgerRestoreParticipant: RestoreParticipant = {
  unit: 'stock.ledger',
  tier: 3,
  tables: tablesOf(ledgerTables),
  async invariants(context) {
    const differences = await rebuildDifferences(context.tx);
    return [
      {
        check: 'stock balances equal the sum of their movements',
        passed: differences.length === 0,
        checked: differences.length,
        failed: differences.length,
      },
    ];
  },
};
