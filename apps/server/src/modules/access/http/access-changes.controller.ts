import { routes, type Route } from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRoute,
  CommandDefect,
  commandAnswer,
  IDEMPOTENCY_HELPER,
  requestContentOf,
  RouteInput,
  type CommandOutcome,
  type IdempotencyHelper,
  type JsonValue,
  type RequestContent,
  type ReplayAuthorisation,
  type RouteInputOf,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AccessInterface } from '../access.js';
import type { Prepared, Preparer } from '../commands/access-changes.js';
import { ACCESS } from '../tokens.js';
import { SignedIn, type SignedInUser } from './authenticate.guard.js';

/**
 * Preparing access changes (access-and-approvals 4, 5, 9.11; code-house-rules 12.1): a role, a new role version, a
 * role assignment and the withdrawal of a Scheduled one. Authenticate and Authorise ran in the guard; each command
 * runs under its idempotency key, and a replay is answered only while the same Authorise still passes (12.4, CH-14).
 * The controller holds no rule of its own.
 */
@Controller()
export class AccessChangesController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(ACCESS) private readonly access: AccessInterface,
  ) {}

  @ApiRoute(routes.prepareRole)
  async prepareRole(@RouteInput() input: RouteInputOf<typeof routes.prepareRole>, @SignedIn() user: SignedInUser) {
    const content = requestContentOf(routes.prepareRole, input);
    return this.run(routes.prepareRole, 'access.prepare-role', user, input.idempotencyKey, content, (c, preparer) =>
      this.access.prepareRole(c, preparer, input.body),
    );
  }

  @ApiRoute(routes.prepareRoleVersion)
  async prepareRoleVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareRoleVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    const content = requestContentOf(routes.prepareRoleVersion, input);
    return this.run(
      routes.prepareRoleVersion,
      'access.prepare-role-version',
      user,
      input.idempotencyKey,
      content,
      (c, p) => this.access.prepareRoleVersion(c, p, input.params.roleId, input.body),
    );
  }

  @ApiRoute(routes.prepareRoleAssignment)
  async prepareRoleAssignment(
    @RouteInput() input: RouteInputOf<typeof routes.prepareRoleAssignment>,
    @SignedIn() user: SignedInUser,
  ) {
    const content = requestContentOf(routes.prepareRoleAssignment, input);
    return this.run(
      routes.prepareRoleAssignment,
      'access.prepare-role-assignment',
      user,
      input.idempotencyKey,
      content,
      (c, p) => this.access.prepareAssignment(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareAssignmentWithdrawal)
  async prepareAssignmentWithdrawal(
    @RouteInput() input: RouteInputOf<typeof routes.prepareAssignmentWithdrawal>,
    @SignedIn() user: SignedInUser,
  ) {
    const content = requestContentOf(routes.prepareAssignmentWithdrawal, input);
    return this.run(
      routes.prepareAssignmentWithdrawal,
      'access.prepare-assignment-withdrawal',
      user,
      input.idempotencyKey,
      content,
      (c, p) => this.access.prepareWithdrawal(c, p, input.params.assignmentId, input.body),
    );
  }

  private async run<Answer extends Record<string, string>>(
    route: Route,
    commandName: string,
    user: SignedInUser,
    key: string,
    content: RequestContent,
    work: (context: TransactionContext, preparer: Preparer) => Promise<Prepared<Answer>>,
  ) {
    if (route.access.kind !== 'action' || user.roleAssignmentId === undefined) {
      throw new CommandDefect(`Route ${route.path} prepares an access change without Authorise`);
    }
    const need = { actorId: user.userId, action: route.access.action, recordType: route.access.recordType };
    const preparer: Preparer = { userId: user.userId, roleAssignmentId: user.roleAssignmentId };
    const authoriseReplay: ReplayAuthorisation = async (context) => {
      const authorised = await this.access.authorise(context, need);
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
        key,
        content,
        authoriseReplay,
        work: async (context): Promise<CommandOutcome<JsonValue>> => {
          const outcome = await work(context, preparer);
          return outcome.kind === 'success'
            ? { kind: 'success', answer: outcome.answer, shows: 'nothing' }
            : { kind: 'refusal', refusal: outcome.refusal, causedBySecret: false };
        },
      },
    );
    return commandAnswer(answer);
  }
}
