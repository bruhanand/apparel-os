import { DAMAGE_REPORT_TYPE, DAMAGE_REVERSAL_TYPE, routes, type CommandRoute } from '@apparel-os/schemas';
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
} from '../../../../kernel/index.js';
import { ACCESS, SignedIn, type AccessInterface, type RecordFacts, type SignedInUser } from '../../../access/index.js';
import { BUSINESS_DATE_NOT_SET, reportNotFound, type Actor, type Outcome } from '../commands/common.js';
import type { StockDocumentsInterface } from '../documents.js';
import { STOCK_DOCUMENTS } from '../tokens.js';

/** The facts of the record a route acts on, in its transaction, or the refusal naming why there are none. */
type FactsOf = (context: TransactionContext, today: string) => Promise<RecordFacts | CommandRefusal>;

const isRefusal = (facts: RecordFacts | CommandRefusal): facts is CommandRefusal => 'code' in facts;

/** No report with that identifier, or none the reader may see (code-house-rules 6.2). */
const damageReportNotFound = (reportId: string): CommandRefusal => reportNotFound(reportId);

/** No reversal with that identifier, or none the reader may see. */
const damageReversalNotFound = (reversalId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'stock.record-not-found',
  missing: [{ kind: 'record', recordType: DAMAGE_REVERSAL_TYPE, recordId: reversalId }],
});

/**
 * Damage reports (goods-in 8, section 11; module-map section 5; code-house-rules 12.1; S2-F08-T01). A report carries
 * every scope fact, so the guard Authenticates only and each route authorises in its command with the report's facts
 * (access-and-approvals 5.3, 7.1 step 3); each command runs under its idempotency key, holds its authority at step 0
 * (code-house-rules 8.2) and answers a replay only while the same Authorise still passes (12.4). The decision itself is
 * `access`'s Decide, from My work (9.5). No rule lives here.
 */
@Controller()
export class DamageController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(STOCK_DOCUMENTS) private readonly documents: StockDocumentsInterface,
  ) {}

  @ApiRoute(routes.reportDamage)
  reportDamage(@RouteInput() input: RouteInputOf<typeof routes.reportDamage>, @SignedIn() user: SignedInUser) {
    return this.command(
      routes.reportDamage,
      'stock.report-damage',
      user,
      input,
      (context, today) => this.documents.newReportFacts(context, input.body, today),
      (context, actor) => this.documents.reportDamage(context, actor, input.body, input.idempotencyKey),
    );
  }

  @ApiRoute(routes.readDamageReport)
  readDamageReport(@RouteInput() input: RouteInputOf<typeof routes.readDamageReport>, @SignedIn() user: SignedInUser) {
    const { damageReportId } = input.params;
    return this.readReport(user, 'stock.read-damage-report', damageReportNotFound(damageReportId), () =>
      Promise.resolve(damageReportId),
    );
  }

  @ApiRoute(routes.readDamageReversal)
  readDamageReversal(
    @RouteInput() input: RouteInputOf<typeof routes.readDamageReversal>,
    @SignedIn() user: SignedInUser,
  ) {
    const { damageReversalId } = input.params;
    return this.readReport(user, 'stock.read-damage-reversal', damageReversalNotFound(damageReversalId), (context) =>
      this.documents.reportOfReversal(context, damageReversalId),
    );
  }

  /** A report as the reader may see it, read in a read-only transaction under the reader's actor (8.1). */
  private async readReport(
    user: SignedInUser,
    commandName: string,
    notFound: CommandRefusal,
    reportIdOf: (context: TransactionContext) => Promise<string | undefined>,
  ) {
    const answer = await this.runner.read(
      {
        commandName,
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) => {
        const date = await context.businessDate();
        if (date.kind === 'not-set') return { refused: BUSINESS_DATE_NOT_SET };
        // A report the reader's scope does not cover is hidden by row-level security, so it carries no fact, which only
        // all-members scope covers (5.3; PRD-MOD-015); it is then not found. So is a reversal hidden or not there.
        const damageReportId = await reportIdOf(context);
        if (damageReportId === undefined) return { refused: notFound };
        const facts = (await this.documents.reportFacts(context, damageReportId)) ?? {};
        const authorised = await this.access.authorise(context, {
          actorId: user.userId,
          action: 'view',
          recordType: DAMAGE_REPORT_TYPE,
          facts,
        });
        if (authorised.kind === 'refused') return { refused: authorised.refusal };
        const report = await this.documents.readReport(context, damageReportId, (versionIds) =>
          this.access.approvalRequestsOf(context, versionIds),
        );
        if (report === undefined) return { refused: notFound };
        return { asOf: context.startedAt.toISOString(), report };
      },
    );
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    return answer;
  }

  @ApiRoute(routes.renewDamageDecision)
  renewDamageDecision(
    @RouteInput() input: RouteInputOf<typeof routes.renewDamageDecision>,
    @SignedIn() user: SignedInUser,
  ) {
    const { damageReportId } = input.params;
    return this.command(
      routes.renewDamageDecision,
      'stock.renew-damage-decision',
      user,
      input,
      (context) => this.factsOfReport(context, damageReportId),
      (context, actor) => this.documents.renewDecision(context, actor, damageReportId, input.body),
    );
  }

  @ApiRoute(routes.proposeDamageReversal)
  proposeDamageReversal(
    @RouteInput() input: RouteInputOf<typeof routes.proposeDamageReversal>,
    @SignedIn() user: SignedInUser,
  ) {
    const { damageReportId } = input.params;
    return this.command(
      routes.proposeDamageReversal,
      'stock.propose-damage-reversal',
      user,
      input,
      (context) => this.factsOfReport(context, damageReportId),
      (context, actor) => this.documents.proposeReversal(context, actor, damageReportId, input.body),
    );
  }

  private async factsOfReport(context: TransactionContext, reportId: string): Promise<RecordFacts | CommandRefusal> {
    return (await this.documents.reportFacts(context, reportId)) ?? reportNotFound(reportId);
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
    const facts = await factsOf(context, date.date);
    if (isRefusal(facts)) return { kind: 'refused', refusal: facts };
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
    work: (context: TransactionContext, actor: Actor) => Promise<Outcome<object>>,
  ) {
    const authoriseReplay: ReplayAuthorisation = async (context) => {
      const authorised = await this.authoriseIn(context, user, route, factsOf);
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
          const authorised = await this.authoriseIn(context, user, route, factsOf);
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
