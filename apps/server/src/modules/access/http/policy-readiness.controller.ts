import { routes, type CommandRoute, type PolicyNumber } from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRefusal,
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
  type TransactionContext,
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
 * Setup › Policy readiness and Check availability (module-map 4.4; domain-model 3.6, DM-6; access-and-approvals 7.1;
 * code-house-rules 12.1; S1-F04-T01). `configuration` owns the records and the gate and calls no one, so `access`,
 * which uses it, serves its routes, as it serves the history of `audit` (module-map section 3, rule 6). Authenticate
 * and Authorise ran in the guard on the route's action and type; each command runs under its idempotency key, holds
 * its authority at step 0, and a replay is answered only while the same Authorise still passes (12.4, CH-14). None of
 * these routes is policy-gated: they are how a policy gets configured (DEC-116). The controller holds no rule.
 */
@Controller()
export class PolicyReadinessController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(CONFIGURATION) private readonly configuration: ConfigurationInterface,
  ) {}

  @ApiRoute(routes.readPolicyReadiness)
  async readPolicyReadiness(@SignedIn() user: SignedInUser) {
    return this.read(user, 'configuration.read-policy-readiness', async (context) => {
      const rows = await this.configuration.readiness(context, user.userId);
      const validators = rows.flatMap((row) => (row.validation === null ? [] : [row.validation.validatedByUserId]));
      const names = await this.access.partyNames(context, [...new Set(validators)], []);
      return {
        asOf: context.startedAt.toISOString(),
        policies: rows.map((row) => ({
          ...row,
          signature:
            row.signature === null ? null : { ...row.signature, recordedAt: row.signature.recordedAt.toISOString() },
          validation:
            row.validation === null
              ? null
              : {
                  validationId: row.validation.validationId,
                  origin: row.validation.origin,
                  validatedBy: names.users.get(row.validation.validatedByUserId) ?? row.validation.validatedByUserId,
                  validatedAt: row.validation.validatedAt.toISOString(),
                  evidence: row.validation.evidence,
                  current: row.validation.current,
                },
        })),
      };
    });
  }

  @ApiRoute(routes.checkAvailability)
  async checkAvailability(
    @RouteInput() input: RouteInputOf<typeof routes.checkAvailability>,
    @SignedIn() user: SignedInUser,
  ) {
    const { operation, siteId, businessUnitId } = input.query;
    const answer = await this.read(user, 'configuration.check-availability', async (context) => ({
      asOf: context.startedAt.toISOString(),
      found: await this.configuration.checkAvailability(context, operation, { siteId, businessUnitId }),
    }));
    if (answer.found === undefined) {
      throw new ApiRefusal({
        kind: 'not-found',
        code: 'configuration.operation-not-found',
        missing: [{ kind: 'operation', operation }],
      });
    }
    return { asOf: answer.asOf, ...answer.found, missing: [...answer.found.missing] };
  }

  @ApiRoute(routes.recordPolicySignature)
  recordPolicySignature(
    @RouteInput() input: RouteInputOf<typeof routes.recordPolicySignature>,
    @SignedIn() user: SignedInUser,
  ) {
    const policy = Number(input.params.policyNumber) as PolicyNumber;
    return this.command(routes.recordPolicySignature, 'configuration.record-policy-signature', user, input, (c, r) =>
      this.configuration.recordSignature(c, r, policy, input.body),
    );
  }

  @ApiRoute(routes.recordPolicyValidation)
  recordPolicyValidation(
    @RouteInput() input: RouteInputOf<typeof routes.recordPolicyValidation>,
    @SignedIn() user: SignedInUser,
  ) {
    const policy = Number(input.params.policyNumber) as PolicyNumber;
    return this.command(routes.recordPolicyValidation, 'configuration.record-policy-validation', user, input, (c, r) =>
      this.configuration.recordValidation(c, r, policy, input.body),
    );
  }

  @ApiRoute(routes.switchCapability)
  switchCapability(@RouteInput() input: RouteInputOf<typeof routes.switchCapability>, @SignedIn() user: SignedInUser) {
    return this.command(routes.switchCapability, 'configuration.switch-capability', user, input, (c, r) =>
      this.configuration.switchCapability(c, r, input.params.capability, input.body.on),
    );
  }

  private read<Answer>(
    user: SignedInUser,
    commandName: string,
    work: (context: TransactionContext) => Promise<Answer>,
  ) {
    return this.runner.read(
      {
        commandName,
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      work,
    );
  }

  private async command<R extends CommandRoute & { access: { kind: 'action' } }>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    work: (context: TransactionContext, recorder: Recorder) => Promise<ConfigurationOutcome<Record<string, JsonValue>>>,
  ) {
    if (user.roleAssignmentId === undefined) {
      throw new CommandDefect(`Route ${route.path} records a policy status without Authorise`);
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
