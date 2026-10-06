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
