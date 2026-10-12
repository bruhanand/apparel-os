import { routes, type CommandRoute } from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRoute,
  COMMAND_RUNNER,
  CommandDefect,
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
import {
  CONFIGURATION,
  type ConfigurationInterface,
  type ConfigurationOutcome,
  type Recorder,
} from '../../configuration/index.js';
import type { AccessInterface } from '../access.js';
import { ACCESS } from '../tokens.js';
import { SignedIn, type SignedInUser } from './authenticate.guard.js';

/**
 * A restored Organisation's recovery (backup-and-restore 4.3, 4.5, 5.3; GC9-8; POL-18.03, POL-18.04, PRD-SEC-013;
 * S1-F14-T03): recovery status in the operations view and the three recovery commands of `configuration`, which owns
 * them and calls no one above it, so `access`, which uses it, serves its routes, as it serves policy readiness
 * (module-map section 3, rule 6). Authenticate and Authorise ran in the guard on the route's action and type; each
 * command runs under its idempotency key and holds its authority at step 0 (code-house-rules 8.2, 12.4). The command
 * runner lets these run while the hold is on. The controller holds no rule.
 */
@Controller()
export class RecoveryController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(CONFIGURATION) private readonly configuration: ConfigurationInterface,
  ) {}

  @ApiRoute(routes.readRecoveryStatus)
  readRecoveryStatus(@SignedIn() user: SignedInUser) {
    return this.runner.read(
      {
        commandName: 'configuration.read-recovery-status',
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) => {
        const status = await this.configuration.recoveryStatus(context);
        if (status.restore === null) return { ...status, restore: null };
        const validators = [...new Set(status.restore.validations.map((each) => each.validatedByUserId))];
        const names = await this.access.partyNames(context, validators, []);
        return {
          ...status,
          restore: {
            ...status.restore,
            validations: status.restore.validations.map((each) => ({
              validationId: each.validationId,
              validates: each.validates,
              compared: [...each.compared],
              comparedAgainst: each.comparedAgainst,
              evidence: each.evidence,
              validatedBy: names.users.get(each.validatedByUserId) ?? each.validatedByUserId,
              validatedAt: each.validatedAt.toISOString(),
            })),
          },
        };
      },
    );
  }

  @ApiRoute(routes.reconcileSeriesAfterRestore)
  reconcileSeriesAfterRestore(
    @RouteInput() input: RouteInputOf<typeof routes.reconcileSeriesAfterRestore>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(
      routes.reconcileSeriesAfterRestore,
      'configuration.reconcile-series-after-restore',
      user,
      input,
      (context, recorder) =>
        this.configuration.reconcileSeriesAfterRestore(context, recorder, input.params.seriesId, input.body),
    );
  }

  @ApiRoute(routes.recordRecoveryValidation)
  recordRecoveryValidation(
    @RouteInput() input: RouteInputOf<typeof routes.recordRecoveryValidation>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(
      routes.recordRecoveryValidation,
      'configuration.record-recovery-validation',
      user,
      input,
      (context, recorder) => this.configuration.recordRecoveryValidation(context, recorder, input.body),
    );
  }

  @ApiRoute(routes.reopenAfterRestore)
  reopenAfterRestore(
    @RouteInput() input: RouteInputOf<typeof routes.reopenAfterRestore>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.reopenAfterRestore, 'configuration.reopen-after-restore', user, input, (c, r) =>
      this.configuration.reopenAfterRestore(c, r, input.body),
    );
  }

  private async command<R extends CommandRoute & { access: { kind: 'action' } }>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    work: (
      context: Parameters<Parameters<CommandRunner['run']>[1]>[0],
      recorder: Recorder,
    ) => Promise<ConfigurationOutcome<Record<string, JsonValue>>>,
  ) {
    if (user.roleAssignmentId === undefined) {
      throw new CommandDefect(`Route ${route.path} runs a recovery command without Authorise`);
    }
    const need = { actorId: user.userId, action: route.access.action, recordType: route.access.recordType };
    const recorder: Recorder = { userId: user.userId, roleAssignmentId: user.roleAssignmentId };
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
        key: input.idempotencyKey,
        content: requestContentOf(route, input),
        authoriseReplay,
        work: async (context): Promise<CommandOutcome<JsonValue>> => {
          // Step 0: the assignment the guard's Authorise found, held and rechecked under the locks (8.2; 7.1 step 4).
          const held = await this.access.holdAuthority(
            context,
            { kind: 'user', id: user.userId },
            recorder.roleAssignmentId,
            { action: need.action, recordType: need.recordType },
          );
          if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
          const outcome = await work(context, recorder);
          if (outcome.kind === 'success') return { kind: 'success', answer: outcome.answer, shows: 'nothing' };
          return { kind: 'refusal', refusal: outcome.refusal, causedBySecret: false };
        },
      },
    );
    return commandAnswer(answer);
  }
}
