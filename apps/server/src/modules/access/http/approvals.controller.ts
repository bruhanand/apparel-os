import { routes } from '@apparel-os/schemas';
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
  type CommandRunner,
  type IdempotencyHelper,
  type JsonValue,
  type ReplayAuthorisation,
  type RouteInputOf,
} from '../../../kernel/index.js';
import type { AccessInterface } from '../access.js';
import { ACCESS } from '../tokens.js';
import { SignedIn, type SignedInUser } from './authenticate.guard.js';

/**
 * Approvals (access-and-approvals 9.3, 9.5; code-house-rules 12.1; S1-F01-T13): the approval panel's read of a
 * request, the reasons in force, and the decision. Deciding is a `decision` route: the guard Authenticates, and the
 * command authorises approve on the request's own record type under its locks (7.1 step 3, 9.3). A replay is answered
 * only to the same actor while that Authorise still passes (12.4, CH-14). The controller holds no rule of its own.
 */
@Controller()
export class ApprovalsController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
  ) {}

  @ApiRoute(routes.decideApproval)
  async decide(@RouteInput() input: RouteInputOf<typeof routes.decideApproval>, @SignedIn() user: SignedInUser) {
    const content = requestContentOf(routes.decideApproval, input);
    const actor = { kind: 'user' as const, id: user.userId };
    const requestId = input.params.requestId;
    const authoriseReplay: ReplayAuthorisation = async (context) => {
      const access = await this.access.decisionReplayAccess(context, actor, requestId);
      if (access.kind === 'allowed') return { kind: 'allowed' };
      return {
        kind: 'refused',
        refusal: { kind: 'not-authorised', code: access.refusal.code, missing: access.refusal.missing },
      };
    };
    const answer = await this.helper.run(
      {
        commandName: 'access.decide-approval',
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      {
        key: input.idempotencyKey,
        content,
        authoriseReplay,
        work: async (context): Promise<CommandOutcome<JsonValue>> => {
          const outcome = await this.access.decide(context, actor, {
            requestId,
            versionId: input.body.versionId,
            outcome: input.body.outcome,
            reason: input.body.reason,
            comment: input.body.comment,
            evidence: input.body.evidence,
            totpCode: input.body.totpCode,
          });
          return outcome.kind === 'success'
            ? { kind: 'success', answer: { ...outcome.answer }, shows: 'nothing' }
            : outcome;
        },
      },
    );
    return commandAnswer(answer);
  }

  /**
   * Bulk approval (access-and-approvals 9.9; code-house-rules 12.1, 12.4; PRD-ACS-011, PRD-ACS-019, POL-02.19;
   * S1-F05-T02): the one route that runs several commands. First the batch, in a command of its own under the request's
   * key, with the one fresh code; then each item its own decision in its own transaction, under the same key with the
   * item's request added to its operation, so a resent request replays what was done and runs what was not. An item
   * refused goes to individual review, with its reason; the others go on.
   */
  @ApiRoute(routes.decideApprovalsInBulk)
  async decideInBulk(
    @RouteInput() input: RouteInputOf<typeof routes.decideApprovalsInBulk>,
    @SignedIn() user: SignedInUser,
  ) {
    const content = requestContentOf(routes.decideApprovalsInBulk, input);
    const actor = { kind: 'user' as const, id: user.userId };
    const request = (commandName: string) => ({
      commandName,
      organisation: user.organisation,
      correlationId: user.correlationId,
      actor: { kind: 'actor' as const, actorId: user.userId },
    });
    const body = input.body;
    // The batch: Authenticate only, as for every decision route; the key belongs to this actor (12.4).
    const batch = await this.helper.run(request('access.decide-in-bulk'), {
      key: input.idempotencyKey,
      content,
      authoriseReplay: () => Promise.resolve({ kind: 'allowed' }),
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const opened = await this.access.openBulkBatch(context, actor, {
          items: body.items,
          reason: body.reason,
          totpCode: body.totpCode,
        });
        return opened.kind === 'success'
          ? { kind: 'success', answer: opened.answer as unknown as JsonValue, shows: 'nothing' }
          : opened;
      },
    });
    if (batch.kind !== 'success') return commandAnswer(batch);
    const opened = batch.answer as unknown as { batchId: string; totals: JsonValue; noValueCount: number };
    const items = [];
    for (const item of body.items) {
      // The item's request added to the operation, as a command name allows it (12.4; command-runner).
      const decided = await this.helper.run(request(`access.decide-in-bulk.item-${item.requestId}`), {
        key: input.idempotencyKey,
        content,
        authoriseReplay: async (context) => {
          const access = await this.access.decisionReplayAccess(context, actor, item.requestId);
          if (access.kind === 'allowed') return { kind: 'allowed' };
          return {
            kind: 'refused',
            refusal: { kind: 'not-authorised', code: access.refusal.code, missing: access.refusal.missing },
          };
        },
        work: async (context): Promise<CommandOutcome<JsonValue>> => {
          const outcome = await this.access.decideInBatch(context, actor, {
            batchId: opened.batchId,
            requestId: item.requestId,
            versionId: item.versionId,
            reason: body.reason,
            comment: body.comment,
          });
          return outcome.kind === 'success'
            ? { kind: 'success', answer: { ...outcome.answer }, shows: 'nothing' }
            : outcome;
        },
      });
      items.push(
        decided.kind === 'success'
          ? {
              requestId: item.requestId,
              outcome: 'Approved' as const,
              decisionId: (decided.answer as { decisionId: string }).decisionId,
            }
          : {
              requestId: item.requestId,
              outcome: 'individual-review' as const,
              code: decided.refusal.code,
              missing: [...decided.refusal.missing],
            },
      );
    }
    return { batchId: opened.batchId, totals: opened.totals, noValueCount: opened.noValueCount, items };
  }

  // Stand-in grants (access-and-approvals 10, 14; S1-F05-T02): the guard has run Authorise for view.
  @ApiRoute(routes.listStandInGrants)
  async listStandInGrants(@SignedIn() user: SignedInUser) {
    const answer = await this.runner.read(
      {
        commandName: 'access.list-stand-in-grants',
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) =>
        (await context.businessDate()).kind === 'not-set'
          ? undefined
          : { listed: await this.access.listStandInGrants(context) },
    );
    if (answer === undefined) {
      throw new ApiRefusal({
        kind: 'unavailable',
        code: 'access.business-date-not-set',
        missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
      });
    }
    return answer.listed;
  }

  @ApiRoute(routes.readApprovalRequest)
  async readRequest(
    @RouteInput() input: RouteInputOf<typeof routes.readApprovalRequest>,
    @SignedIn() user: SignedInUser,
  ) {
    const view = await this.runner.read(
      {
        commandName: 'access.read-approval-request',
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      (context) => this.access.readApprovalRequest(context, { kind: 'user', id: user.userId }, input.params.requestId),
    );
    if (view === undefined) throw new ApiRefusal({ kind: 'not-found', code: 'access.approval-request-not-found' });
    return view;
  }

  // Setup › Approval limits (access-and-approvals 9.2, 14; S1-F05-T01): the guard has run Authorise for view.
  @ApiRoute(routes.listApprovalLimits)
  async listApprovalLimits(@SignedIn() user: SignedInUser) {
    const answer = await this.runner.read(
      {
        commandName: 'access.list-approval-limits',
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) =>
        (await context.businessDate()).kind === 'not-set'
          ? undefined
          : { listed: await this.access.listApprovalLimits(context) },
    );
    if (answer === undefined) {
      throw new ApiRefusal({
        kind: 'unavailable',
        code: 'access.business-date-not-set',
        missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
      });
    }
    return answer.listed;
  }

  @ApiRoute(routes.listSecuritySettings)
  async listSecuritySettings(@SignedIn() user: SignedInUser) {
    return this.runner.read(
      {
        commandName: 'access.list-security-settings',
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      (context) => this.access.securitySettings(context),
    );
  }

  @ApiRoute(routes.listApprovalReasons)
  async listReasons(@SignedIn() user: SignedInUser) {
    return this.runner.read(
      {
        commandName: 'access.list-approval-reasons',
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) => ({
        asOf: context.startedAt.toISOString(),
        reasons: await this.access.reasonsInForce(context),
      }),
    );
  }
}
