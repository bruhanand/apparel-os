import { tablesOf, type RestoreParticipant } from '../../kernel/index.js';
import * as bookingTables from './db/schema.js';

/**
 * `booking`'s part in backup and restore (backup-and-restore 10.1, 10.2; PRD-ACP-019): the totals of its tables, and
 * the budgets an approval request or its evidence names: Accounts' check of a version is decided on the budget, under
 * its own record type (goods-in 3.3).
 */
export const bookingRestoreParticipant: RestoreParticipant = {
  unit: 'booking',
  tier: 4,
  tables: tablesOf(bookingTables),
  records: [{ recordType: 'booking.open_to_buy_check', table: 'booking.open_to_buy_budget' }],
};
