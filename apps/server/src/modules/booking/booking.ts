import {
  BOOKING_PAGE_CAP,
  OPEN_TO_BUY_PAGE_CAP,
  type Booking as BookingView,
  type BookingDocumentsDraft,
  type BookingDraft,
  type BookingDraftChange,
  type BookingPageQuery,
  type BookingSubmission,
  type OpenToBuyBudget,
  type OpenToBuyBudgetDraft,
  type OpenToBuyBudgetVersionDraft,
  type OpenToBuyRemaining,
} from '@apparel-os/schemas';
import type { TransactionContext } from '../../kernel/index.js';
import type { AccessInterface, Preparer, RecordFacts } from '../access/index.js';
import type { AuditInterface } from '../audit/index.js';
import type { ConfigurationInterface } from '../configuration/index.js';
import type { FilesImportsInterface } from '../files-imports/index.js';
import type { CatalogueInterface } from '../merchandise/catalogue/index.js';
import { attachDocuments } from './commands/attach-documents.js';
import { factsOf, type Actor } from './commands/draft.js';
import { recordBooking } from './commands/record-booking.js';
import { saveDraft } from './commands/save-draft.js';
import { submitBooking } from './commands/submit-booking.js';
import { prepareBudget, prepareBudgetVersion } from './commands/budgets.js';
import { bookingPage, bookingRow, bookingView } from './queries/bookings.js';
import { budgetOf, budgetPage, budgetRow, budgetRows, budgetViews, remainingOf } from './queries/budgets.js';

export interface BookingDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<
    AccessInterface,
    'requestApproval' | 'requestLockTargets' | 'supersedeRequest' | 'approvalRequestsOf'
  >;
  readonly catalogue: Pick<CatalogueInterface, 'vocabularyOn' | 'record' | 'markedAttributeAt'>;
  readonly origins: Pick<ConfigurationInterface, 'originRefusal'>;
  /** Where a booking's documents are attached (goods-in 3.1; S2-F01-T03). */
  readonly files: Pick<FilesImportsInterface, 'attach'>;
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
   * A page of the budgets as a reader sees them, each with its versions and remaining amount (code-house-rules 12.1
   * "Reads"); `covered` answers, for the facts of each budget read, whether the reader may view it (access-and-approvals
   * 7.1 step 3), and the others are left out, so a page may hold fewer than its limit; its cursor still moves past them.
   */
  async listBudgets(
    context: TransactionContext,
    today: string,
    page: { readonly after?: string | undefined; readonly limit?: number | undefined },
    covered: (facts: readonly RecordFacts[]) => Promise<readonly boolean[]>,
  ): Promise<{ readonly budgets: OpenToBuyBudget[]; readonly next: string | null }> {
    const limit = Math.min(page.limit ?? OPEN_TO_BUY_PAGE_CAP, OPEN_TO_BUY_PAGE_CAP);
    const { rows, next } = await budgetPage(context, { after: page.after, limit });
    const allowed = await covered(rows.map((row) => ({ brandId: row.brandId })));
    const budgets = await budgetViews(
      context,
      this.dependencies,
      rows.filter((_row, index) => allowed[index] === true),
      today,
    );
    return { budgets, next };
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

  /** Record a new booking as a Draft, with its first version (goods-in 3.1; S2-F01-T03). */
  recordBooking(context: TransactionContext, actor: Actor, draft: BookingDraft) {
    return recordBooking(context, this.dependencies, actor, draft);
  }

  /** Save a booking's next Draft (goods-in 3.1, 3.5). */
  saveDraft(context: TransactionContext, actor: Actor, bookingId: string, draft: BookingDraftChange) {
    return saveDraft(context, this.dependencies, actor, bookingId, draft);
  }

  /** Attach booking documents to a Draft (goods-in 3.1). */
  attachDocuments(context: TransactionContext, actor: Actor, bookingId: string, draft: BookingDocumentsDraft) {
    return attachDocuments(context, this.dependencies, actor, bookingId, draft);
  }

  /** Submit the Draft for its approval (goods-in 3.4). */
  submitBooking(context: TransactionContext, actor: Actor, bookingId: string, draft: BookingSubmission) {
    return submitBooking(context, this.dependencies, actor, bookingId, draft);
  }

  /** The scope facts of a booking, which every route authorises with (access-and-approvals 5.3); none when unknown. */
  async bookingFacts(context: TransactionContext, bookingId: string): Promise<RecordFacts | undefined> {
    const row = await bookingRow(context, bookingId);
    return row === undefined ? undefined : factsOf(row);
  }

  /** One booking as the reader sees it, or undefined (goods-in 3.1 to 3.4, section 11). */
  async readBooking(context: TransactionContext, bookingId: string, today: string): Promise<BookingView | undefined> {
    const row = await bookingRow(context, bookingId);
    return row === undefined ? undefined : bookingView(context, this.dependencies, row, today);
  }

  /** A page of the bookings the reader may see (code-house-rules 12.1 "Reads"; goods-in section 11). */
  listBookings(context: TransactionContext, query: BookingPageQuery) {
    const limit = Math.min(query.limit === undefined ? BOOKING_PAGE_CAP : Number(query.limit), BOOKING_PAGE_CAP);
    return bookingPage(context, query, limit);
  }
}

export type BookingInterface = Booking;
