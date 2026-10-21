import { lockTable, type LockTarget } from '../../../kernel/index.js';
import type { ValidityCheck } from '../../configuration/index.js';
import { and, eq, sql } from 'drizzle-orm';
import { openToBuyBudget, openToBuyBudgetVersion } from '../db/schema.js';

// The open-to-buy budgets as policy 5's values, for the policy gate (module-map 4.4, section 3 rule 6; DM-6;
// goods-in 10.5; POL-05.09; V-17, RR-080; S2-F01-T02): every approved budget version in force, with its origin and its
// preparer, whom the validator of policy 5 must not be. A budget changes only by a new version approved under the
// budget's lock, which recording a validation locks shared, so no budget changes between that read and the
// validation's insert (S1-F04 review S3). Whether a brand and season has a budget is no question of the gate: a
// booking's approval asks the remaining open-to-buy of its own brand and season (3.3; S2-F01-T03), so the check
// itself is valid whatever budgets exist, and adds no condition the policy does not set.

/** The code of the check (module-map 4.4 "Register a validity check"). */
export const OPEN_TO_BUY_BUDGETS_CHECK = 'booking.open-to-buy-budgets';

export const openToBuyBudgetsCheck: ValidityCheck = {
  code: OPEN_TO_BUY_BUDGETS_CHECK,
  policy: 5,
  check: () => Promise.resolve({ kind: 'valid' }),
  async values(context) {
    const rows = await context.tx
      .select({
        budgetId: openToBuyBudgetVersion.openToBuyBudgetId,
        versionId: openToBuyBudgetVersion.id,
        origin: openToBuyBudgetVersion.origin,
        preparedBy: openToBuyBudgetVersion.preparedByUserId,
      })
      .from(openToBuyBudgetVersion)
      .where(
        and(
          eq(openToBuyBudgetVersion.decision, 'Approved'),
          sql`pg_catalog.upper_inf(${openToBuyBudgetVersion.validDuring})`,
        ),
      );
    return rows.map((row) => ({
      key: row.budgetId,
      // A newer approved version replaces this one, so a validation stops covering the budget (RR-478).
      version: row.versionId,
      origin: row.origin,
      enteredBy: [row.preparedBy],
    }));
  },
  async locks(context) {
    const rows = await context.tx.select({ id: openToBuyBudget.id }).from(openToBuyBudget);
    const table = lockTable('booking', 'open_to_buy_budget');
    return rows.map((row): LockTarget => ({ table, id: row.id, mode: 'shared' }));
  },
};
