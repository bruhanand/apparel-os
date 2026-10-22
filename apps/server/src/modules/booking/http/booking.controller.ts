import { BOOKING_TYPE, OPEN_TO_BUY_BUDGET_TYPE, routes, type CommandRoute } from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRefusal,
  ApiRoute,
  COMMAND_RUNNER,
  commandAnswer,
  IDEMPOTENCY_HELPER,
  requestContentOf,
  RouteInput,
  type CommandOutcome,
  type CommandRefusal,
  type CommandRunner,
  type IdempotencyHelper,
  type JsonValue,
  type ReplayAuthorisation,
  type RouteInputOf,
  type TransactionContext,
} from '../../../kernel/index.js';
import {
  ACCESS,
  replayRefusal,
  SignedIn,
  type AccessInterface,
  type Preparer,
  type RecordFacts,
  type SignedInUser,
} from '../../access/index.js';
import type { BookingInterface } from '../booking.js';
import type { Outcome } from '../commands/common.js';
import { bookingItem } from '../domain/bookings.js';
import { budgetItem } from '../domain/budgets.js';
import { BOOKING } from '../tokens.js';

/**
 * Finds the facts of the record a route acts on, in its transaction, or the refusal that names it when it does not
 * exist (PRD-UXP-003), so a missing record is never answered as anything else.
 */
type FactsOf = (
  context: TransactionContext,
) => Promise<{ readonly facts: RecordFacts } | { readonly refusal: CommandRefusal }>;

const BUSINESS_DATE_NOT_SET: CommandRefusal = {
  kind: 'unavailable',
  code: 'access.business-date-not-set',
  missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
};

/** A budget that does not exist is not found, named by its identifier (PRD-UXP-003). */
const budgetNotFound = (budgetId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'booking.record-not-found',
  missing: [budgetItem(budgetId)],
});

/** A booking that does not exist, or that the reader cannot see, is not found (code-house-rules 6.2). */
const bookingNotFound = (bookingId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'booking.record-not-found',
  missing: [bookingItem(bookingId)],
});

/**
 * Booking › Open-to-buy (goods-in 3.3, section 11; module-map section 5; code-house-rules 12.1; S2-F01-T02). A budget
 * carries its brand, so the guard Authenticates only and each route authorises in its transaction with the brand's
 * facts (access-and-approvals 5.3, 7.1 step 3; RR-296); each command runs under its idempotency key, holds its
 * authority at step 0 (code-house-rules 8.2) and answers a replay only while the same Authorise still passes (12.4).
 * Accounts' check and the approval are decided through `access`'s decision route from My work. None is policy-gated:
 * a budget's own check and approval are its control (DEC-142; goods-in 10.5). No rule lives here.
 */
@Controller()
export class BookingController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(BOOKING) private readonly booking: BookingInterface,
  ) {}

  @ApiRoute(routes.listOpenToBuyBudgets)
  async listOpenToBuyBudgets(
    @RouteInput() input: RouteInputOf<typeof routes.listOpenToBuyBudgets>,
    @SignedIn() user: SignedInUser,
  ) {
    const { after, limit } = input.query;
    const page = { after, limit: limit === undefined ? undefined : Number(limit) };
    const answer = await this.read(user, 'booking.list-open-to-buy-budgets', async (context, today) => {
      let refusal: CommandRefusal | undefined;
      const { budgets, next } = await this.booking.listBudgets(context, today, page, async (facts) => {
        const checked = await this.access.authoriseEach(
          context,
          { actorId: user.userId, action: 'view', recordType: OPEN_TO_BUY_BUDGET_TYPE },
          facts,
        );
        if (checked.kind === 'refused') {
          refusal = checked.refusal;
          return facts.map(() => false);
        }
        return checked.each.map((each) => each.kind === 'allowed');
      });
      if (refusal !== undefined) return { refused: refusal };
      return { asOf: context.startedAt.toISOString(), budgets, next };
    });
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  @ApiRoute(routes.readOpenToBuyBudget)
  async readOpenToBuyBudget(
    @RouteInput() input: RouteInputOf<typeof routes.readOpenToBuyBudget>,
    @SignedIn() user: SignedInUser,
  ) {
    const { budgetId } = input.params;
    const answer = await this.read(user, 'booking.read-open-to-buy-budget', async (context, today) => {
      // A budget is authorised with its brand first, so a reader outside its scope learns nothing more of it; one that
      // does not exist is not found, never refused as not authorised (code-house-rules 12.3).
      const facts = await this.booking.budgetFacts(context, budgetId);
      if (facts === undefined) return { refused: budgetNotFound(budgetId) };
      const authorised = await this.access.authorise(context, {
        actorId: user.userId,
        action: 'view',
        recordType: OPEN_TO_BUY_BUDGET_TYPE,
        facts,
      });
      if (authorised.kind === 'refused') return { refused: authorised.refusal };
      const budget = await this.booking.readBudget(context, budgetId, today);
      if (budget === undefined) return { refused: budgetNotFound(budgetId) };
      return { asOf: context.startedAt.toISOString(), budget };
    });
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  @ApiRoute(routes.prepareOpenToBuyBudget)
  prepareOpenToBuyBudget(
    @RouteInput() input: RouteInputOf<typeof routes.prepareOpenToBuyBudget>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(
      routes.prepareOpenToBuyBudget,
      'booking.prepare-open-to-buy-budget',
      user,
      input,
      () => Promise.resolve({ facts: { brandId: input.body.brandId } }),
      (context, preparer) => this.booking.prepareBudget(context, preparer, input.body),
    );
  }

  @ApiRoute(routes.prepareOpenToBuyBudgetVersion)
  prepareOpenToBuyBudgetVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareOpenToBuyBudgetVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    const { budgetId } = input.params;
    return this.command(
      routes.prepareOpenToBuyBudgetVersion,
      'booking.prepare-open-to-buy-budget-version',
      user,
      input,
      async (context) => {
        const facts = await this.booking.budgetFacts(context, budgetId);
        return facts === undefined ? { refusal: budgetNotFound(budgetId) } : { facts };
      },
      (context, preparer) => this.booking.prepareBudgetVersion(context, preparer, budgetId, input.body),
    );
  }

  // Booking › Bookings and the booking form (goods-in 3.1 to 3.4, section 11; S2-F01-T03). A booking carries its
  // destination Site and brand, so each route authorises in its transaction with the booking's facts; the rows are
  // scoped besides (code-house-rules 6.2). Only the approval is policy-gated, in `access`'s decision route (10.5).

  @ApiRoute(routes.listBookings)
  async listBookings(@RouteInput() input: RouteInputOf<typeof routes.listBookings>, @SignedIn() user: SignedInUser) {
    const answer = await this.read(user, 'booking.list-bookings', async (context) => {
      const { bookings, next } = await this.booking.listBookings(context, input.query);
      const checked = await this.access.authoriseEach(
        context,
        { actorId: user.userId, action: 'view', recordType: BOOKING_TYPE },
        bookings.map((each) => ({ siteId: each.destinationSiteId, brandId: each.brandId })),
      );
      if (checked.kind === 'refused') return { refused: checked.refusal };
      return {
        asOf: context.startedAt.toISOString(),
        bookings: bookings.filter((_each, index) => checked.each[index]?.kind === 'allowed'),
        next,
      };
    });
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  @ApiRoute(routes.readBooking)
  async readBooking(@RouteInput() input: RouteInputOf<typeof routes.readBooking>, @SignedIn() user: SignedInUser) {
    const { bookingId } = input.params;
    const answer = await this.read(user, 'booking.read-booking', async (context, today) => {
      // Authorised with its facts first; one the reader cannot see is hidden by row-level security, so it is not found,
      // never refused as not authorised, which would say it exists (code-house-rules 12.3; PRD-SEC-005).
      const facts = await this.booking.bookingFacts(context, bookingId);
      if (facts === undefined) return { refused: bookingNotFound(bookingId) };
      const authorised = await this.access.authorise(context, {
        actorId: user.userId,
        action: 'view',
        recordType: BOOKING_TYPE,
        facts,
      });
      if (authorised.kind === 'refused') return { refused: authorised.refusal };
      const booking = await this.booking.readBooking(context, bookingId, today);
      if (booking === undefined) return { refused: bookingNotFound(bookingId) };
      return { asOf: context.startedAt.toISOString(), booking };
    });
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  @ApiRoute(routes.recordBooking)
  recordBooking(@RouteInput() input: RouteInputOf<typeof routes.recordBooking>, @SignedIn() user: SignedInUser) {
    return this.command(
      routes.recordBooking,
      'booking.record-booking',
      user,
      input,
      () => Promise.resolve({ facts: { siteId: input.body.destinationSiteId, brandId: input.body.brandId } }),
      (context, actor) => this.booking.recordBooking(context, actor, input.body),
    );
  }

  @ApiRoute(routes.saveBookingDraft)
  saveBookingDraft(@RouteInput() input: RouteInputOf<typeof routes.saveBookingDraft>, @SignedIn() user: SignedInUser) {
    const { bookingId } = input.params;
    return this.command(
      routes.saveBookingDraft,
      'booking.save-booking-draft',
      user,
      input,
      this.bookingFactsOf(bookingId),
      (context, actor) => this.booking.saveDraft(context, actor, bookingId, input.body),
    );
  }

  @ApiRoute(routes.attachBookingDocuments)
  attachBookingDocuments(
    @RouteInput() input: RouteInputOf<typeof routes.attachBookingDocuments>,
    @SignedIn() user: SignedInUser,
  ) {
    const { bookingId } = input.params;
    return this.command(
      routes.attachBookingDocuments,
      'booking.attach-booking-documents',
      user,
      input,
      this.bookingFactsOf(bookingId),
      (context, actor) => this.booking.attachDocuments(context, actor, bookingId, input.body),
    );
  }

  @ApiRoute(routes.submitBooking)
  submitBooking(@RouteInput() input: RouteInputOf<typeof routes.submitBooking>, @SignedIn() user: SignedInUser) {
    const { bookingId } = input.params;
    return this.command(
      routes.submitBooking,
      'booking.submit-booking',
      user,
      input,
      this.bookingFactsOf(bookingId),
      (context, actor) => this.booking.submitBooking(context, actor, bookingId, input.body),
    );
  }

  // An approved booking's lifecycle (goods-in 3.4, 3.5, 3.10; S2-F01-T04): Issued and Confirmed recorded by Booking,
  // and a cancellation or an extension proposed for a different person's approval in My work. None is policy-gated:
  // the decisions are (goods-in 10.5).

  @ApiRoute(routes.recordBookingIssue)
  recordBookingIssue(
    @RouteInput() input: RouteInputOf<typeof routes.recordBookingIssue>,
    @SignedIn() user: SignedInUser,
  ) {
    const { bookingId } = input.params;
    return this.command(
      routes.recordBookingIssue,
      'booking.record-booking-issue',
      user,
      input,
      this.bookingFactsOf(bookingId),
      (context, actor) => this.booking.recordIssue(context, actor, bookingId, input.body),
    );
  }

  @ApiRoute(routes.recordBookingConfirmation)
  recordBookingConfirmation(
    @RouteInput() input: RouteInputOf<typeof routes.recordBookingConfirmation>,
    @SignedIn() user: SignedInUser,
  ) {
    const { bookingId } = input.params;
    return this.command(
      routes.recordBookingConfirmation,
      'booking.record-booking-confirmation',
      user,
      input,
      this.bookingFactsOf(bookingId),
      (context, actor) => this.booking.recordConfirmation(context, actor, bookingId, input.body),
    );
  }

  @ApiRoute(routes.proposeBookingCancellation)
  proposeBookingCancellation(
    @RouteInput() input: RouteInputOf<typeof routes.proposeBookingCancellation>,
    @SignedIn() user: SignedInUser,
  ) {
    const { bookingId } = input.params;
    return this.command(
      routes.proposeBookingCancellation,
      'booking.propose-booking-cancellation',
      user,
      input,
      this.bookingFactsOf(bookingId),
      (context, actor) => this.booking.proposeCancellation(context, actor, bookingId, input.body),
    );
  }

  @ApiRoute(routes.proposeBookingExtension)
  proposeBookingExtension(
    @RouteInput() input: RouteInputOf<typeof routes.proposeBookingExtension>,
    @SignedIn() user: SignedInUser,
  ) {
    const { bookingId } = input.params;
    return this.command(
      routes.proposeBookingExtension,
      'booking.propose-booking-extension',
      user,
      input,
      this.bookingFactsOf(bookingId),
      (context, actor) => this.booking.proposeExtension(context, actor, bookingId, input.body),
    );
  }

  /** A booking's facts, or not found when the reader cannot see it (PRD-UXP-003). */
  private bookingFactsOf(bookingId: string): FactsOf {
    return async (context) => {
      const facts = await this.booking.bookingFacts(context, bookingId);
      return facts === undefined ? { refusal: bookingNotFound(bookingId) } : { facts };
    };
  }

  /** A read-only transaction as the signed-in user, under today's business date (code-house-rules 8.1, 9). */
  private async read<Answer>(
    user: SignedInUser,
    commandName: string,
    work: (context: TransactionContext, today: string) => Promise<Answer | { refused: CommandRefusal }>,
  ): Promise<Answer | { refused: CommandRefusal }> {
    return this.runner.read(
      {
        commandName,
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) => {
        const date = await context.businessDate();
        if (date.kind === 'not-set') return { refused: BUSINESS_DATE_NOT_SET };
        return work(context, date.date);
      },
    );
  }

  /** Authorise in the transaction with the record's facts, before any lock (7.1 step 3). */
  private async authoriseIn(
    context: TransactionContext,
    user: SignedInUser,
    route: CommandRoute & { access: { kind: 'action' } },
    factsOf: FactsOf,
  ): Promise<
    | { readonly kind: 'allowed'; readonly roleAssignmentId: string; readonly facts: RecordFacts }
    | { readonly kind: 'refused'; readonly refusal: CommandRefusal }
  > {
    const date = await context.businessDate();
    if (date.kind === 'not-set') return { kind: 'refused', refusal: BUSINESS_DATE_NOT_SET };
    const found = await factsOf(context);
    if ('refusal' in found) return { kind: 'refused', refusal: found.refusal };
    const { facts } = found;
    const { action, recordType } = route.access;
    const authorised = await this.access.authorise(context, { actorId: user.userId, action, recordType, facts });
    if (authorised.kind === 'refused') return authorised;
    return { kind: 'allowed', roleAssignmentId: authorised.roleAssignmentId, facts };
  }

  private async command<R extends CommandRoute & { access: { kind: 'action' } }>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    factsOf: FactsOf,
    work: (context: TransactionContext, preparer: Preparer) => Promise<Outcome<object>>,
  ) {
    // A replay answers as any request failing the same checks would: a booking not found stays not found (12.3, 12.4).
    const authoriseReplay: ReplayAuthorisation = async (context) => {
      const authorised = await this.authoriseIn(context, user, route, factsOf);
      if (authorised.kind === 'allowed') return { kind: 'allowed' };
      return { kind: 'refused', refusal: replayRefusal(authorised.refusal) };
    };
    const answer = await this.helper.run(
      {
        commandName,
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      {
        key: input.idempotencyKey,
        content: requestContentOf(route, input),
        authoriseReplay,
        work: async (context): Promise<CommandOutcome<JsonValue>> => {
          const authorised = await this.authoriseIn(context, user, route, factsOf);
          if (authorised.kind === 'refused') {
            return { kind: 'refusal', refusal: authorised.refusal, causedBySecret: false };
          }
          // Step 0: the preparer and the assignment relied on, rechecked under the locks with the same facts (8.2;
          // access-and-approvals 7.1 step 4).
          const { action, recordType } = route.access;
          const held = await this.access.holdAuthority(
            context,
            { kind: 'user', id: user.userId },
            authorised.roleAssignmentId,
            { action, recordType, facts: authorised.facts },
          );
          if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
          const outcome = await work(context, { userId: user.userId, roleAssignmentId: authorised.roleAssignmentId });
          if (outcome.kind === 'success') {
            return { kind: 'success', answer: { ...outcome.answer } as Record<string, JsonValue>, shows: 'nothing' };
          }
          return { kind: 'refusal', refusal: outcome.refusal, causedBySecret: false };
        },
      },
    );
    return commandAnswer(answer);
  }
}
