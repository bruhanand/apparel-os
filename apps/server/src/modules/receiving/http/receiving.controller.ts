import { ARRIVAL_TYPE, routes, type CommandRoute } from '@apparel-os/schemas';
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
import { ACCESS, SignedIn, type AccessInterface, type RecordFacts, type SignedInUser } from '../../access/index.js';
import { siteExists } from '../../organisation/index.js';
import type { Actor, Outcome } from '../commands/common.js';
import type { ReceivingInterface } from '../receiving.js';
import { RECEIVING } from '../tokens.js';

/** Finds the facts of the record a route acts on, in its transaction; undefined when it does not exist. */
type FactsOf = (context: TransactionContext, today: string) => Promise<RecordFacts | undefined>;

const BUSINESS_DATE_NOT_SET: CommandRefusal = {
  kind: 'unavailable',
  code: 'access.business-date-not-set',
  missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
};

const notFound = (recordType: string, recordId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'receiving.record-not-found',
  missing: [{ kind: 'record', recordType, recordId }],
});

const unitNotFound = (businessUnitId: string): CommandRefusal => ({
  kind: 'refused',
  code: 'receiving.unit-not-at-site',
  missing: [{ kind: 'record', recordType: 'organisation.business_unit', recordId: businessUnitId }],
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
      if (!(await siteExists(context, siteId))) return { refused: notFound('organisation.site', siteId) };
      let refusal: CommandRefusal | undefined;
      const inbox = await this.receiving.inbox(context, siteId, input.query.view, today, async (facts) => {
        const checked = await this.access.authoriseEach(
          context,
          { actorId: user.userId, action: 'view', recordType: ARRIVAL_TYPE },
          facts,
        );
        if (checked.kind === 'refused') {
          refusal = checked.refusal;
          return facts.map(() => false);
        }
        return checked.each.map((each) => each.kind === 'allowed');
      });
      if (refusal !== undefined) return { refused: refusal };
      return { asOf: context.startedAt.toISOString(), ...inbox };
    });
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  @ApiRoute(routes.readArrival)
  async readArrival(@RouteInput() input: RouteInputOf<typeof routes.readArrival>, @SignedIn() user: SignedInUser) {
    const { arrivalId } = input.params;
    const answer = await this.read(user, 'receiving.read-arrival', async (context, today) => {
      // An Arrival the reader's scope does not cover is hidden by row-level security, so it carries no fact, which only
      // all-members scope covers (5.3; PRD-MOD-015); it is then not found.
      const facts = (await this.receiving.arrivalFacts(context, arrivalId)) ?? {};
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
      );
      if (arrival === undefined) return { refused: notFound(ARRIVAL_TYPE, arrivalId) };
      return { asOf: context.startedAt.toISOString(), arrival };
    });
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  @ApiRoute(routes.recordArrival)
  recordArrival(@RouteInput() input: RouteInputOf<typeof routes.recordArrival>, @SignedIn() user: SignedInUser) {
    const { businessUnitId, brandId } = input.body;
    return this.command(
      routes.recordArrival,
      'receiving.record-arrival',
      user,
      input,
      (context, today) => this.receiving.newArrivalFacts(context, businessUnitId, brandId, today),
      unitNotFound(businessUnitId),
      (context, actor) => this.receiving.recordArrival(context, actor, input.body),
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
    return this.onArrival(routes.issueGrn, 'receiving.issue-grn', user, input, (c, actor) =>
      this.receiving.issueGrn(c, actor, arrivalId, input.body, input.idempotencyKey),
    );
  }

  /** A command on an existing Arrival, authorised with its facts. */
  private onArrival<R extends CommandRoute & { access: { kind: 'action' }; params: unknown }>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R> & { readonly params: { readonly arrivalId: string } },
    work: (context: TransactionContext, actor: Actor) => Promise<Outcome<object>>,
  ) {
    const { arrivalId } = input.params;
    return this.command(
      route,
      commandName,
      user,
      input,
      (context) => this.receiving.arrivalFacts(context, arrivalId),
      notFound(ARRIVAL_TYPE, arrivalId),
      work,
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

  /** Authorise in the transaction with the record's facts, before any lock (7.1 step 3). */
  private async authoriseIn(
    context: TransactionContext,
    user: SignedInUser,
    route: CommandRoute & { access: { kind: 'action' } },
    factsOf: FactsOf,
    notFoundRefusal: CommandRefusal,
  ): Promise<
    | { readonly kind: 'allowed'; readonly roleAssignmentId: string; readonly facts: RecordFacts }
    | { readonly kind: 'refused'; readonly refusal: CommandRefusal }
  > {
    const date = await context.businessDate();
    if (date.kind === 'not-set') return { kind: 'refused', refusal: BUSINESS_DATE_NOT_SET };
    const facts = await factsOf(context, date.date);
    if (facts === undefined) return { kind: 'refused', refusal: notFoundRefusal };
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
    notFoundRefusal: CommandRefusal,
    work: (context: TransactionContext, actor: Actor) => Promise<Outcome<object>>,
  ) {
    const authoriseReplay: ReplayAuthorisation = async (context) => {
      const authorised = await this.authoriseIn(context, user, route, factsOf, notFoundRefusal);
      if (authorised.kind === 'allowed') return { kind: 'allowed' };
      return {
        kind: 'refused',
        refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
      };
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
          const authorised = await this.authoriseIn(context, user, route, factsOf, notFoundRefusal);
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
