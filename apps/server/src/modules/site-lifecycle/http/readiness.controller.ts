import { routes, type CommandRoute } from '@apparel-os/schemas';
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
import type { Actor, Outcome } from '../commands/readiness.js';
import type { SiteLifecycleInterface } from '../site-lifecycle.js';
import { SITE_LIFECYCLE } from '../tokens.js';

/** Finds the facts of the record a route acts on, in its transaction; undefined when it does not exist. */
type FactsOf = (context: TransactionContext) => Promise<RecordFacts | undefined>;

const recordNotFound = (readinessRecordId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'site-lifecycle.record-not-found',
  missing: [{ kind: 'record', recordType: 'site_lifecycle.readiness_record', recordId: readinessRecordId }],
});

/**
 * Setup › Site opening and closure › Readiness (module-map 4.16; ui-blueprint; code-house-rules 12.1; S1-F04-T02).
 * Its record types carry the Site's or the unit's place, so the guard Authenticates only and each route authorises in
 * its transaction with the place's facts (access-and-approvals 5.3, 7.1 step 3; RR-296); each command runs under its
 * idempotency key and holds its authority at step 0 (8.2). None is policy-gated: readiness is how an activity gets
 * configured (DEC-116). The approval itself is decided through `access`'s Decide, from My work. No rule lives here.
 */
@Controller()
export class ReadinessController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(SITE_LIFECYCLE) private readonly lifecycle: SiteLifecycleInterface,
  ) {}

  @ApiRoute(routes.readUnitReadiness)
  async readUnitReadiness(
    @RouteInput() input: RouteInputOf<typeof routes.readUnitReadiness>,
    @SignedIn() user: SignedInUser,
  ) {
    const unitId = input.params.businessUnitId;
    const answer = await this.runner.read(
      {
        commandName: 'site-lifecycle.read-unit-readiness',
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) => {
        const authorised = await this.authoriseIn(
          context,
          user,
          'view',
          routes.readUnitReadiness.access.recordType,
          (c) => this.lifecycle.unitFacts(c, unitId),
        );
        if (authorised.kind === 'refused') return { refused: authorised.refusal };
        const read = await this.lifecycle.unitReadiness(context, unitId);
        if (read.kind === 'refusal') return { refused: read.refusal };
        return { asOf: context.startedAt.toISOString(), ...read.answer };
      },
    );
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  @ApiRoute(routes.runReadinessChecks)
  runReadinessChecks(
    @RouteInput() input: RouteInputOf<typeof routes.runReadinessChecks>,
    @SignedIn() user: SignedInUser,
  ) {
    const { businessUnitId, activity } = input.params;
    return this.command(
      routes.runReadinessChecks,
      'site-lifecycle.run-readiness-checks',
      user,
      input,
      (c) => this.lifecycle.unitFacts(c, businessUnitId),
      (c, actor) => this.lifecycle.runReadiness(c, actor, businessUnitId, activity),
    );
  }

  @ApiRoute(routes.readReadinessRecord)
  async readReadinessRecord(
    @RouteInput() input: RouteInputOf<typeof routes.readReadinessRecord>,
    @SignedIn() user: SignedInUser,
  ) {
    const { readinessRecordId } = input.params;
    const answer = await this.runner.read(
      {
        commandName: 'site-lifecycle.read-readiness-record',
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) => {
        const authorised = await this.authoriseIn(
          context,
          user,
          'view',
          routes.readReadinessRecord.access.recordType,
          (c) => this.lifecycle.recordFacts(c, readinessRecordId),
          recordNotFound(readinessRecordId),
        );
        if (authorised.kind === 'refused') return { refused: authorised.refusal };
        const read = await this.lifecycle.readinessRecord(context, readinessRecordId);
        if (read.kind === 'refusal') return { refused: read.refusal };
        return { asOf: context.startedAt.toISOString(), ...read.answer };
      },
    );
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  @ApiRoute(routes.runSiteReadinessChecks)
  runSiteReadinessChecks(
    @RouteInput() input: RouteInputOf<typeof routes.runSiteReadinessChecks>,
    @SignedIn() user: SignedInUser,
  ) {
    const { siteId, activity } = input.params;
    return this.command(
      routes.runSiteReadinessChecks,
      'site-lifecycle.run-site-readiness-checks',
      user,
      input,
      (c) => this.lifecycle.siteFacts(c, siteId),
      (c, actor) => this.lifecycle.runSiteReadiness(c, actor, siteId, activity),
      {
        kind: 'not-found',
        code: 'site-lifecycle.site-not-found',
        missing: [{ kind: 'record', recordType: 'organisation.site', recordId: siteId }],
      },
    );
  }

  @ApiRoute(routes.requestActivation)
  requestActivation(
    @RouteInput() input: RouteInputOf<typeof routes.requestActivation>,
    @SignedIn() user: SignedInUser,
  ) {
    const { readinessRecordId } = input.params;
    return this.command(
      routes.requestActivation,
      'site-lifecycle.request-activation',
      user,
      input,
      (c) => this.lifecycle.recordFacts(c, readinessRecordId),
      (c, actor) => this.lifecycle.requestActivation(c, actor, readinessRecordId),
      recordNotFound(readinessRecordId),
    );
  }

  @ApiRoute(routes.declareZeroStock)
  declareZeroStock(@RouteInput() input: RouteInputOf<typeof routes.declareZeroStock>, @SignedIn() user: SignedInUser) {
    const { businessUnitId } = input.params;
    return this.command(
      routes.declareZeroStock,
      'site-lifecycle.declare-zero-stock',
      user,
      input,
      (c) => this.lifecycle.unitFacts(c, businessUnitId),
      (c, actor) => this.lifecycle.declareZeroStock(c, actor, businessUnitId),
    );
  }

  /**
   * Authorise in the transaction with the record's facts (5.3). A unit or record that does not exist is not found,
   * naming it; the reader learns nothing more.
   */
  private async authoriseIn(
    context: TransactionContext,
    user: SignedInUser,
    action: 'view' | 'create',
    recordType: string,
    factsOf: FactsOf,
    notFound?: CommandRefusal,
  ): Promise<
    | { readonly kind: 'allowed'; readonly roleAssignmentId: string; readonly facts: RecordFacts }
    | { readonly kind: 'refused'; readonly refusal: CommandRefusal }
  > {
    const date = await context.businessDate();
    if (date.kind === 'not-set') {
      return {
        kind: 'refused',
        refusal: {
          kind: 'unavailable',
          code: 'access.business-date-not-set',
          missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
        },
      };
    }
    const facts = await factsOf(context);
    if (facts === undefined) {
      return {
        kind: 'refused',
        refusal: notFound ?? { kind: 'not-found', code: 'site-lifecycle.unit-not-found', missing: [] },
      };
    }
    const authorised = await this.access.authorise(context, { actorId: user.userId, action, recordType, facts });
    if (authorised.kind === 'refused') return authorised;
    return { kind: 'allowed', roleAssignmentId: authorised.roleAssignmentId, facts };
  }

  private async command<R extends CommandRoute & { access: { kind: 'action'; action: 'create' } }>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    factsOf: FactsOf,
    work: (context: TransactionContext, actor: Actor) => Promise<Outcome<Record<string, JsonValue>>>,
    notFound?: CommandRefusal,
  ) {
    const { action, recordType } = route.access;
    const authoriseReplay: ReplayAuthorisation = async (context) => {
      const authorised = await this.authoriseIn(context, user, action, recordType, factsOf, notFound);
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
          // Authorise with the unit's facts, before any lock (7.1 step 3).
          const authorised = await this.authoriseIn(context, user, action, recordType, factsOf, notFound);
          if (authorised.kind === 'refused') {
            return { kind: 'refusal', refusal: authorised.refusal, causedBySecret: false };
          }
          // Step 0: the actor and the assignment, rechecked under the locks with the same facts (8.2; 7.1 step 4).
          const held = await this.access.holdAuthority(
            context,
            { kind: 'user', id: user.userId },
            authorised.roleAssignmentId,
            { action, recordType, facts: authorised.facts },
          );
          if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
          const outcome = await work(context, { userId: user.userId, roleAssignmentId: authorised.roleAssignmentId });
          if (outcome.kind === 'success') return { kind: 'success', answer: { ...outcome.answer }, shows: 'nothing' };
          return { kind: 'refusal', refusal: outcome.refusal, causedBySecret: false };
        },
      },
    );
    return commandAnswer(answer);
  }
}
