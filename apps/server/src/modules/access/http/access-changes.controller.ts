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
import type { AccessInterface, PreparedWithCredential } from '../access.js';
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

  @ApiRoute(routes.prepareUser)
  async prepareUser(@RouteInput() input: RouteInputOf<typeof routes.prepareUser>, @SignedIn() user: SignedInUser) {
    const content = requestContentOf(routes.prepareUser, input);
    return this.run(routes.prepareUser, 'access.prepare-user', user, input.idempotencyKey, content, (c, p) =>
      this.access.prepareUser(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareUserVersion)
  async prepareUserVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareUserVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    const content = requestContentOf(routes.prepareUserVersion, input);
    return this.run(
      routes.prepareUserVersion,
      'access.prepare-user-version',
      user,
      input.idempotencyKey,
      content,
      (c, p) => this.access.prepareUserVersion(c, p, input.params.userId, input.body),
    );
  }

  @ApiRoute(routes.prepareApprovalReason)
  async prepareApprovalReason(
    @RouteInput() input: RouteInputOf<typeof routes.prepareApprovalReason>,
    @SignedIn() user: SignedInUser,
  ) {
    const content = requestContentOf(routes.prepareApprovalReason, input);
    return this.run(
      routes.prepareApprovalReason,
      'access.prepare-approval-reason',
      user,
      input.idempotencyKey,
      content,
      (c, p) => this.access.prepareApprovalReason(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareApprovalReasonVersion)
  async prepareApprovalReasonVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareApprovalReasonVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    const content = requestContentOf(routes.prepareApprovalReasonVersion, input);
    return this.run(
      routes.prepareApprovalReasonVersion,
      'access.prepare-approval-reason-version',
      user,
      input.idempotencyKey,
      content,
      (c, p) => this.access.prepareApprovalReasonVersion(c, p, input.params.reasonId, input.body),
    );
  }

  @ApiRoute(routes.prepareApprovalRuleSetting)
  async prepareApprovalRuleSetting(
    @RouteInput() input: RouteInputOf<typeof routes.prepareApprovalRuleSetting>,
    @SignedIn() user: SignedInUser,
  ) {
    const content = requestContentOf(routes.prepareApprovalRuleSetting, input);
    return this.run(
      routes.prepareApprovalRuleSetting,
      'access.prepare-approval-rule-setting',
      user,
      input.idempotencyKey,
      content,
      (c, p) => this.access.prepareApprovalRuleSetting(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareApprovalRuleSettingVersion)
  async prepareApprovalRuleSettingVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareApprovalRuleSettingVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    const content = requestContentOf(routes.prepareApprovalRuleSettingVersion, input);
    return this.run(
      routes.prepareApprovalRuleSettingVersion,
      'access.prepare-approval-rule-setting-version',
      user,
      input.idempotencyKey,
      content,
      (c, p) => this.access.prepareApprovalRuleSettingVersion(c, p, input.params.settingId, input.body),
    );
  }

  @ApiRoute(routes.prepareApprovalLimit)
  async prepareApprovalLimit(
    @RouteInput() input: RouteInputOf<typeof routes.prepareApprovalLimit>,
    @SignedIn() user: SignedInUser,
  ) {
    const content = requestContentOf(routes.prepareApprovalLimit, input);
    return this.run(
      routes.prepareApprovalLimit,
      'access.prepare-approval-limit',
      user,
      input.idempotencyKey,
      content,
      (c, p) => this.access.prepareApprovalLimit(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareSecuritySettingVersion)
  async prepareSecuritySettingVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareSecuritySettingVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    const content = requestContentOf(routes.prepareSecuritySettingVersion, input);
    return this.run(
      routes.prepareSecuritySettingVersion,
      'access.prepare-security-setting-version',
      user,
      input.idempotencyKey,
      content,
      (c, p) => this.access.prepareSecuritySettingVersion(c, p, input.body),
    );
  }

  private async run<Answer extends Record<string, string>>(
    route: Route,
    commandName: string,
    user: SignedInUser,
    key: string,
    content: RequestContent,
    work: (
      context: TransactionContext,
      preparer: Preparer,
    ) => Promise<Prepared<Answer> | PreparedWithCredential<Answer>>,
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
          // Step 0: the preparer and the assignment the guard's Authorise found, rechecked under the locks
          // (code-house-rules 8.2 "Authority first"; access-and-approvals 7.1 step 4; RR-325).
          const held = await this.access.holdAuthority(
            context,
            { kind: 'user', id: user.userId },
            preparer.roleAssignmentId,
            { action: need.action, recordType: need.recordType },
          );
          if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
          const outcome = await work(context, preparer);
          if (outcome.kind === 'success') {
            // A new user's temporary password: its credential, for the replay check (code-house-rules 12.5).
            const credentialIds = 'credentialIds' in outcome ? [...outcome.credentialIds] : [];
            return {
              kind: 'success',
              answer: outcome.answer,
              shows: 'nothing',
              ...(credentialIds.length === 0 ? {} : { credentialIds }),
            };
          }
          const causedBySecret = 'causedBySecret' in outcome && outcome.causedBySecret;
          return { kind: 'refusal', refusal: outcome.refusal, causedBySecret };
        },
      },
    );
    return commandAnswer(answer);
  }
}
