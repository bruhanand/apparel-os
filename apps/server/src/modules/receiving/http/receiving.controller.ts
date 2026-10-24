import {
  ARRIVAL_TYPE,
  BOOKING_TYPE,
  DAMAGE_REPORT_TYPE,
  GRN_TYPE,
  HELD_LINE_TYPE,
  RECOUNT_TYPE,
  routes,
  type CommandRoute,
} from '@apparel-os/schemas';
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
  type HeldNeed,
  type RecordFacts,
  type SignedInUser,
} from '../../access/index.js';
import { BUSINESS_DATE_NOT_SET, recordNotFound, unitNotAtSite, type Actor, type Outcome } from '../commands/common.js';
import type { ReceivingInterface } from '../receiving.js';
import { RECEIVING } from '../tokens.js';

/** Finds the facts of the record a route acts on, in its transaction; undefined when it does not exist. */
type FactsOf = (context: TransactionContext, today: string) => Promise<RecordFacts | undefined>;

/**
 * A further permission a command relies on besides its route's (RR-444): on the same record's facts, or on another
 * record's, such as the booking an Arrival is received against (goods-in 4.10).
 */
interface Need {
  readonly action: 'create' | 'view';
  readonly recordType: string;
  readonly facts?: RecordFacts;
}

/** The further permissions a command relies on, or the refusal when a record they name is not found (12.3). */
type AlsoNeeds = (context: TransactionContext) => Promise<readonly Need[] | { readonly refused: CommandRefusal }>;

/** No booking with that identifier, or none the reader may see (code-house-rules 12.3; goods-in 4.10). */
const bookingNotFound = (bookingId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'booking.record-not-found',
  missing: [{ kind: 'record', recordType: BOOKING_TYPE, recordId: bookingId }],
});

/**
 * Receive Goods (goods-in 4.1 to 4.5, section 11; module-map section 5; code-house-rules 12.1; S2-F02-T02). An Arrival
 * and its GRN carry every scope fact, so the guard Authenticates only and each route authorises in its transaction
 * with the record's facts (access-and-approvals 5.3, 7.1 step 3; RR-296); each command runs under its idempotency key,
 * holds its authority at step 0 (code-house-rules 8.2) and answers a replay only while the same Authorise still passes
 * (12.4). The policy gate is asked by the commands that record an Arrival and issue its GRN (goods-in 10.5). No rule
 * lives here.
 */
@Controller()
export class ReceivingController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(RECEIVING) private readonly receiving: ReceivingInterface,
  ) {}

  @ApiRoute(routes.readReceivingInbox)
  async readReceivingInbox(
    @RouteInput() input: RouteInputOf<typeof routes.readReceivingInbox>,
    @SignedIn() user: SignedInUser,
  ) {
    const { siteId } = input.params;
    const answer = await this.read(user, 'receiving.read-inbox', async (context, today) => {
      // Each delivery is authorised with its own facts in `receiving`'s read, as the reader (goods-in 4.1, 7.5).
      const read = await this.receiving.inbox(context, user.userId, siteId, input.query, today);
      if ('refused' in read) return read;
      return { asOf: context.startedAt.toISOString(), ...read.inbox };
    });
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  @ApiRoute(routes.readArrival)
  async readArrival(@RouteInput() input: RouteInputOf<typeof routes.readArrival>, @SignedIn() user: SignedInUser) {
    const { arrivalId } = input.params;
    const answer = await this.read(user, 'receiving.read-arrival', async (context, today) => {
      // An Arrival the reader's scope does not cover is hidden by row-level security, so it carries no fact: it is not
      // found, never refused as not authorised, which would say it exists (code-house-rules 12.3; PRD-SEC-005).
      const facts = await this.receiving.arrivalFacts(context, arrivalId);
      if (facts === undefined) return { refused: recordNotFound(ARRIVAL_TYPE, arrivalId) };
      const authorised = await this.access.authorise(context, {
        actorId: user.userId,
        action: 'view',
        recordType: ARRIVAL_TYPE,
        facts,
      });
      if (authorised.kind === 'refused') return { refused: authorised.refusal };
      const arrival = await this.receiving.readArrival(
        context,
        arrivalId,
        today,
        async (userIds) => (await this.access.partyNames(context, userIds, [])).users,
        (versionIds) => this.access.approvalRequestsOf(context, versionIds),
      );
      if (arrival === undefined) return { refused: recordNotFound(ARRIVAL_TYPE, arrivalId) };
      return { asOf: context.startedAt.toISOString(), arrival };
    });
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  @ApiRoute(routes.recordArrival)
  recordArrival(@RouteInput() input: RouteInputOf<typeof routes.recordArrival>, @SignedIn() user: SignedInUser) {
    const { businessUnitId, brandId, bookingId } = input.body;
    // Receiving against a booking needs a grant on it at its Site and brand: its open lines are the expected goods,
    // and its receipt links are scoped as it is (goods-in 4.10).
    return this.command(
      routes.recordArrival,
      'receiving.record-arrival',
      user,
      input,
      (context, today) => this.receiving.newArrivalFacts(context, businessUnitId, brandId, today),
      unitNotAtSite(businessUnitId),
      (context, actor) => this.receiving.recordArrival(context, actor, input.body),
      bookingId === undefined ? undefined : (context) => this.bookingNeed(context, bookingId),
    );
  }

  @ApiRoute(routes.recordArrivalInvoice)
  recordArrivalInvoice(
    @RouteInput() input: RouteInputOf<typeof routes.recordArrivalInvoice>,
    @SignedIn() user: SignedInUser,
  ) {
    const { arrivalId } = input.params;
    return this.onArrival(routes.recordArrivalInvoice, 'receiving.record-arrival-invoice', user, input, (c, actor) =>
      this.receiving.recordInvoice(c, actor, arrivalId, input.body),
    );
  }

  @ApiRoute(routes.attachArrivalPhotos)
  attachArrivalPhotos(
    @RouteInput() input: RouteInputOf<typeof routes.attachArrivalPhotos>,
    @SignedIn() user: SignedInUser,
  ) {
    const { arrivalId } = input.params;
    return this.onArrival(routes.attachArrivalPhotos, 'receiving.attach-arrival-photos', user, input, (c, actor) =>
      this.receiving.attachPhotos(c, actor, arrivalId, input.body),
    );
  }

  @ApiRoute(routes.saveCountLine)
  saveCountLine(@RouteInput() input: RouteInputOf<typeof routes.saveCountLine>, @SignedIn() user: SignedInUser) {
    const { arrivalId } = input.params;
    return this.onArrival(routes.saveCountLine, 'receiving.save-count-line', user, input, (c, actor) =>
      this.receiving.saveCountLine(c, actor, arrivalId, input.body),
    );
  }

  @ApiRoute(routes.removeCountLine)
  removeCountLine(@RouteInput() input: RouteInputOf<typeof routes.removeCountLine>, @SignedIn() user: SignedInUser) {
    const { arrivalId, lineId } = input.params;
    return this.onArrival(routes.removeCountLine, 'receiving.remove-count-line', user, input, (c, actor) =>
      this.receiving.removeCountLine(c, actor, arrivalId, lineId, input.body),
    );
  }

  @ApiRoute(routes.issueGrn)
  issueGrn(@RouteInput() input: RouteInputOf<typeof routes.issueGrn>, @SignedIn() user: SignedInUser) {
    const { arrivalId } = input.params;
    // Whoever issues a GRN whose count found damage reports it, so holds create on damage reports too (goods-in 8.5);
    // against a booking, a grant on it at its Site and brand, since its receipt links are scoped as it is (4.10).
    return this.onArrival(
      routes.issueGrn,
      'receiving.issue-grn',
      user,
      input,
      (c, actor) => this.receiving.issueGrn(c, actor, arrivalId, input.body, input.idempotencyKey),
      async (context) => {
        const needs = await this.receiving.issueAlsoNeeds(context, arrivalId);
        const damage: Need[] = needs.damageReport ? [{ action: 'create', recordType: DAMAGE_REPORT_TYPE }] : [];
        if (needs.bookingId === null) return damage;
        const booking = await this.bookingNeed(context, needs.bookingId);
        return 'refused' in booking ? booking : [...damage, ...booking];
      },
    );
  }

  @ApiRoute(routes.linkGrnToBooking)
  linkGrnToBooking(@RouteInput() input: RouteInputOf<typeof routes.linkGrnToBooking>, @SignedIn() user: SignedInUser) {
    const { grnId } = input.params;
    const { bookingId } = input.body;
    // Booking links later with edit on the booking, at its Site and brand, and reads the GRN with view on its Arrival,
    // with the Arrival's own facts (goods-in 4.10; access-and-approvals 5.3).
    return this.command(
      routes.linkGrnToBooking,
      'receiving.link-grn-to-booking',
      user,
      input,
      (context) => this.receiving.bookingFacts(context, bookingId),
      bookingNotFound(bookingId),
      (context, actor) => this.receiving.linkToBooking(context, actor, grnId, input.body),
      async (context) => {
        const facts = await this.receiving.grnFacts(context, grnId);
        if (facts === undefined) return { refused: recordNotFound(GRN_TYPE, grnId) };
        return [{ action: 'view', recordType: ARRIVAL_TYPE, facts }];
      },
    );
  }

  @ApiRoute(routes.proposeRecount)
  proposeRecount(@RouteInput() input: RouteInputOf<typeof routes.proposeRecount>, @SignedIn() user: SignedInUser) {
    const { grnId } = input.params;
    // A recount carries its GRN's facts, so it authorises with them; a GRN the proposer may not see is not found
    // (goods-in 4.11; code-house-rules 12.3).
    return this.command(
      routes.proposeRecount,
      'receiving.propose-recount',
      user,
      input,
      (context) => this.receiving.grnFacts(context, grnId),
      recordNotFound(GRN_TYPE, grnId),
      (context, actor) => this.receiving.proposeRecount(context, actor, grnId, input.body),
    );
  }

  @ApiRoute(routes.readRecount)
  async readRecount(@RouteInput() input: RouteInputOf<typeof routes.readRecount>, @SignedIn() user: SignedInUser) {
    const { recountId } = input.params;
    const answer = await this.read(user, 'receiving.read-recount', async (context) => {
      // A recount the reader's scope does not cover is hidden by row-level security, so it carries no fact: it is not
      // found, never refused as not authorised, which would say it exists (code-house-rules 12.3; PRD-SEC-005).
      const facts = await this.receiving.recountFacts(context, recountId);
      if (facts === undefined) return { refused: recordNotFound(RECOUNT_TYPE, recountId) };
      const authorised = await this.access.authorise(context, {
        actorId: user.userId,
        action: 'view',
        recordType: ARRIVAL_TYPE,
        facts,
      });
      if (authorised.kind === 'refused') return { refused: authorised.refusal };
      const recount = await this.receiving.readRecount(
        context,
        recountId,
        async (userIds) => (await this.access.partyNames(context, userIds, [])).users,
        (versionIds) => this.access.approvalRequestsOf(context, versionIds),
      );
      if (recount === undefined) return { refused: recordNotFound(RECOUNT_TYPE, recountId) };
      return { asOf: context.startedAt.toISOString(), ...recount };
    });
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  @ApiRoute(routes.scanPiece)
  scanPiece(@RouteInput() input: RouteInputOf<typeof routes.scanPiece>, @SignedIn() user: SignedInUser) {
    const { grnId } = input.params;
    // A scan carries its GRN's facts, so it authorises with them; a GRN the scanner may not see is not found (goods-in
    // 7.2; code-house-rules 12.3). It reads and writes the stock of the GRN's goods, so it needs view on it too, held
    // at step 0 with the scan's own (goods-in 7.5; stock-ledger 14.3; RR-444).
    return this.command(
      routes.scanPiece,
      'receiving.scan-piece',
      user,
      input,
      (context) => this.receiving.grnFacts(context, grnId),
      recordNotFound(GRN_TYPE, grnId),
      (context, actor) => this.receiving.scanPiece(context, actor, grnId, input.body, input.idempotencyKey),
      (context) => this.receiving.scanNeeds(context, grnId),
    );
  }

  @ApiRoute(routes.readScanIn)
  async readScanIn(@RouteInput() input: RouteInputOf<typeof routes.readScanIn>, @SignedIn() user: SignedInUser) {
    const { grnId } = input.params;
    const answer = await this.read(user, 'receiving.read-scan-in', async (context, today) => {
      // Authorised in `receiving`'s read with the GRN's facts: a GRN the reader's scope does not cover is not found,
      // never refused, which would say it exists (code-house-rules 12.3; PRD-SEC-005; goods-in 7.5).
      const read = await this.receiving.readScanIn(context, user.userId, grnId, input.query, today);
      if ('refused' in read) return read;
      return { asOf: context.startedAt.toISOString(), ...read.read };
    });
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  /** View on the booking an Arrival is received against, with its facts; not found when the reader may not see it. */
  private async bookingNeed(
    context: TransactionContext,
    bookingId: string,
  ): Promise<readonly Need[] | { readonly refused: CommandRefusal }> {
    const facts = await this.receiving.bookingFacts(context, bookingId);
    if (facts === undefined) return { refused: bookingNotFound(bookingId) };
    return [{ action: 'view', recordType: BOOKING_TYPE, facts }];
  }

  @ApiRoute(routes.readHeldLine)
  async readHeldLine(@RouteInput() input: RouteInputOf<typeof routes.readHeldLine>, @SignedIn() user: SignedInUser) {
    const { heldLineId } = input.params;
    const answer = await this.read(user, 'receiving.read-held-line', async (context) => {
      // A held line the reader's scope does not cover is hidden by row-level security, so it carries no fact: it is
      // not found, never refused as not authorised, which would say it exists (code-house-rules 12.3; PRD-SEC-005).
      const facts = await this.receiving.heldLineFacts(context, heldLineId);
      if (facts === undefined) return { refused: recordNotFound(HELD_LINE_TYPE, heldLineId) };
      const authorised = await this.access.authorise(context, {
        actorId: user.userId,
        action: 'view',
        recordType: ARRIVAL_TYPE,
        facts,
      });
      if (authorised.kind === 'refused') return { refused: authorised.refusal };
      const held = await this.receiving.readHeldLine(
        context,
        heldLineId,
        async (userIds) => (await this.access.partyNames(context, userIds, [])).users,
        (versionIds) => this.access.approvalRequestsOf(context, versionIds),
      );
      if (held === undefined) return { refused: recordNotFound(HELD_LINE_TYPE, heldLineId) };
      return { asOf: context.startedAt.toISOString(), ...held };
    });
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  @ApiRoute(routes.nameHeldLineProduct)
  nameHeldLineProduct(
    @RouteInput() input: RouteInputOf<typeof routes.nameHeldLineProduct>,
    @SignedIn() user: SignedInUser,
  ) {
    const { heldLineId } = input.params;
    return this.command(
      routes.nameHeldLineProduct,
      'receiving.name-held-line-product',
      user,
      input,
      (context) => this.receiving.heldLineFacts(context, heldLineId),
      recordNotFound(HELD_LINE_TYPE, heldLineId),
      (context, actor) => this.receiving.nameHeldLineProduct(context, actor, heldLineId, input.body),
    );
  }

  /** A command on an existing Arrival, authorised with its facts. */
  private onArrival<R extends CommandRoute & { access: { kind: 'action' }; params: unknown }>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R> & { readonly params: { readonly arrivalId: string } },
    work: (context: TransactionContext, actor: Actor) => Promise<Outcome<object>>,
    alsoNeeds?: AlsoNeeds,
  ) {
    const { arrivalId } = input.params;
    return this.command(
      route,
      commandName,
      user,
      input,
      (context) => this.receiving.arrivalFacts(context, arrivalId),
      recordNotFound(ARRIVAL_TYPE, arrivalId),
      work,
      alsoNeeds,
    );
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

  /**
   * Authorise in the transaction with the record's facts, before any lock (7.1 step 3): the route's permission, and
   * each further one the command relies on, on the same facts.
   */
  private async authoriseIn(
    context: TransactionContext,
    user: SignedInUser,
    route: CommandRoute & { access: { kind: 'action' } },
    factsOf: FactsOf,
    notFoundRefusal: CommandRefusal,
    alsoNeeds?: AlsoNeeds,
  ): Promise<
    | {
        readonly kind: 'allowed';
        readonly roleAssignmentId: string;
        readonly facts: RecordFacts;
        readonly further: readonly HeldNeed[];
      }
    | { readonly kind: 'refused'; readonly refusal: CommandRefusal }
  > {
    const date = await context.businessDate();
    if (date.kind === 'not-set') return { kind: 'refused', refusal: BUSINESS_DATE_NOT_SET };
    const facts = await factsOf(context, date.date);
    if (facts === undefined) return { kind: 'refused', refusal: notFoundRefusal };
    const { action, recordType } = route.access;
    const authorised = await this.access.authorise(context, { actorId: user.userId, action, recordType, facts });
    if (authorised.kind === 'refused') return authorised;
    const further: HeldNeed[] = [];
    const needs = (await alsoNeeds?.(context)) ?? [];
    if ('refused' in needs) return { kind: 'refused', refusal: needs.refused };
    for (const need of needs) {
      const needed = { action: need.action, recordType: need.recordType, facts: need.facts ?? facts };
      const also = await this.access.authorise(context, { actorId: user.userId, ...needed });
      if (also.kind === 'refused') return also;
      further.push({ roleAssignmentId: also.roleAssignmentId, need: needed });
    }
    return { kind: 'allowed', roleAssignmentId: authorised.roleAssignmentId, facts, further };
  }

  private async command<R extends CommandRoute & { access: { kind: 'action' } }>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    factsOf: FactsOf,
    notFoundRefusal: CommandRefusal,
    work: (context: TransactionContext, actor: Actor) => Promise<Outcome<object>>,
    alsoNeeds?: AlsoNeeds,
  ) {
    // A replay answers as any request failing the same checks would: a record not found stays not found (12.3, 12.4).
    const authoriseReplay: ReplayAuthorisation = async (context) => {
      const authorised = await this.authoriseIn(context, user, route, factsOf, notFoundRefusal, alsoNeeds);
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
          const authorised = await this.authoriseIn(context, user, route, factsOf, notFoundRefusal, alsoNeeds);
          if (authorised.kind === 'refused') {
            return { kind: 'refusal', refusal: authorised.refusal, causedBySecret: false };
          }
          // Step 0: the actor and the assignment relied on, rechecked under the locks with the same facts (8.2;
          // access-and-approvals 7.1 step 4).
          const { action, recordType } = route.access;
          const held = await this.access.holdAuthority(
            context,
            { kind: 'user', id: user.userId },
            authorised.roleAssignmentId,
            { action, recordType, facts: authorised.facts },
            [],
            authorised.further,
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
