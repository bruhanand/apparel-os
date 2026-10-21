import type {
  OpenToBuyBudget,
  OpenToBuyBudgetDraft,
  OpenToBuyBudgetVersionDraft,
  OpenToBuyRemaining,
} from '@apparel-os/schemas';
import type { TransactionContext } from '../../kernel/index.js';
import type { AccessInterface, Preparer, RecordFacts } from '../access/index.js';
import type { AuditInterface } from '../audit/index.js';
import type { ConfigurationInterface } from '../configuration/index.js';
import type { CatalogueInterface } from '../merchandise/catalogue/index.js';
import { prepareBudget, prepareBudgetVersion } from './commands/budgets.js';
import { budgetOf, budgetRow, budgetRows, budgetViews, remainingOf } from './queries/budgets.js';

export interface BookingDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<
    AccessInterface,
    'requestApproval' | 'requestLockTargets' | 'supersedeRequest' | 'approvalRequestsOf'
  >;
  readonly catalogue: Pick<CatalogueInterface, 'vocabularyOn' | 'record'>;
  readonly origins: Pick<ConfigurationInterface, 'originRefusal'>;
}

/**
 * `booking`'s interface (module-map section 5; goods-in 10.1): in the first piece, the open-to-buy budgets (3.3;
 * S2-F01-T02): prepare a budget or its next version, read budgets with their versions, and the remaining open-to-buy
 * of a brand and season, which a booking's approval checks and reserves (S2-F01-T03). Accounts' check and the
 * approval reach a version through `access`'s Decide (bookingApprovals). Every operation joins the caller's
 * transaction through its context (code-house-rules 8.1); the caller has authorised it.
 */
export class Booking {
  constructor(private readonly dependencies: BookingDependencies) {}

  /** Prepare a budget for a brand and a season, with its first version, waiting for Accounts' check (3.3). */
  prepareBudget(context: TransactionContext, preparer: Preparer, draft: OpenToBuyBudgetDraft) {
    return prepareBudget(context, this.dependencies, preparer, draft);
  }

  /** Prepare a budget's next version, through the same steps (3.3). */
  prepareBudgetVersion(
    context: TransactionContext,
    preparer: Preparer,
    budgetId: string,
    draft: OpenToBuyBudgetVersionDraft,
  ) {
    return prepareBudgetVersion(context, this.dependencies, preparer, budgetId, draft);
  }

  /** The scope facts of a budget, which every route authorises with (access-and-approvals 5.3); none when unknown. */
  async budgetFacts(context: TransactionContext, budgetId: string): Promise<RecordFacts | undefined> {
    const budget = await budgetRow(context, budgetId);
    return budget === undefined ? undefined : { brandId: budget.brandId };
  }

  /**
   * The budgets as a reader sees them, each with its versions and remaining amount; `covered` answers, for the facts
   * of each, whether the reader may view it (access-and-approvals 7.1 step 3), and the others are left out.
   */
  async listBudgets(
    context: TransactionContext,
    today: string,
    covered: (facts: readonly RecordFacts[]) => Promise<readonly boolean[]>,
  ): Promise<OpenToBuyBudget[]> {
    const rows = await budgetRows(context);
    const allowed = await covered(rows.map((row) => ({ brandId: row.brandId })));
    return budgetViews(
      context,
      this.dependencies,
      rows.filter((_row, index) => allowed[index] === true),
      today,
    );
  }

  /** One budget with its versions and remaining amount, or undefined. */
  async readBudget(context: TransactionContext, budgetId: string, today: string): Promise<OpenToBuyBudget | undefined> {
    const rows = await budgetRows(context, [budgetId]);
    const [view] = await budgetViews(context, this.dependencies, rows, today);
    return view;
  }

  /**
   * The remaining open-to-buy of a brand and season at the transaction's instant (3.3): the approved budget less the
   * value approved bookings reserve, or not approved while there is no budget or none of its versions is approved.
   */
  async remainingOpenToBuy(
    context: TransactionContext,
    brandId: string,
    seasonValueId: string,
  ): Promise<OpenToBuyRemaining & { readonly budgetId?: string }> {
    const budget = await budgetOf(context, brandId, seasonValueId);
    if (budget === undefined) return { kind: 'not-approved' };
    return { ...(await remainingOf(context, budget, context.startedAt)), budgetId: budget.id };
  }
}

export type BookingInterface = Booking;
