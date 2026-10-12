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
  type TransactionContext,
} from '../../../kernel/index.js';
import { ACCESS, SignedIn, type AccessInterface, type Preparer, type SignedInUser } from '../../access/index.js';
import type { Outcome } from '../commands/devices.js';
import type { PosInterface } from '../pos.js';
import { POS } from '../tokens.js';

type ActionRoute = CommandRoute & { access: { kind: 'action' } };

/**
 * Setup's financial years and bill-number format (offline-counter 4.3b; numbering-and-audit 3.3, 3.5; code-house-rules
 * 12.1, 12.4; S1-F12-T03). Their record types carry no scope fact, so the guard Authorised the route's action
 * (access-and-approvals 5.3); each command runs under its idempotency key, holds the assignment at step 0 and answers a
 * replay only while the same Authorise still passes (CH-14). The decision is access's Decide route (9.5). No rule lives
 * here.
 */
@Controller()
export class NumberingSettingsController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(POS) private readonly pos: PosInterface,
  ) {}

  @ApiRoute(routes.listFinancialYears)
  listFinancialYears(@SignedIn() user: SignedInUser) {
    return this.read(user, 'pos.list-financial-years', (context) => this.pos.financialYears(context));
  }

  @ApiRoute(routes.prepareFinancialYearChange)
  prepareFinancialYearChange(
    @RouteInput() input: RouteInputOf<typeof routes.prepareFinancialYearChange>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.prepareFinancialYearChange, 'pos.prepare-financial-year-change', user, input, (c, p) =>
      this.pos.prepareFinancialYearChange(c, p, input.body),
    );
  }

  @ApiRoute(routes.readBillFormat)
  readBillFormat(@SignedIn() user: SignedInUser) {
    return this.read(user, 'pos.read-bill-format', (context) => this.pos.billFormat(context));
  }

  @ApiRoute(routes.prepareBillFormatChange)
  prepareBillFormatChange(
    @RouteInput() input: RouteInputOf<typeof routes.prepareBillFormatChange>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.prepareBillFormatChange, 'pos.prepare-bill-format-change', user, input, (c, p) =>
      this.pos.prepareBillFormatChange(c, p, input.body),
    );
  }

  private read<Answer>(
    user: SignedInUser,
    commandName: string,
    work: (context: TransactionContext) => Promise<Answer>,
  ): Promise<Answer> {
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

  private command<R extends ActionRoute>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    work: (context: TransactionContext, preparer: Preparer) => Promise<Outcome<Record<string, JsonValue>>>,
  ) {
    const need = { action: route.access.action, recordType: route.access.recordType };
    const authoriseReplay: ReplayAuthorisation = async (context) => {
      const authorised = await this.access.authorise(context, { actorId: user.userId, ...need });
      if (authorised.kind === 'allowed') return { kind: 'allowed' };
      return {
        kind: 'refused',
        refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
      };
    };
    return this.helper
      .run(
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
            const roleAssignmentId = user.roleAssignmentId;
            if (roleAssignmentId === undefined) throw new CommandDefect('A pos command ran without Authorise');
            // Step 0 (code-house-rules 8.2): the assignment relied on, held and rechecked under the locks.
            const held = await this.access.holdAuthority(
              context,
              { kind: 'user', id: user.userId },
              roleAssignmentId,
              need,
            );
            if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
            const outcome = await work(context, { userId: user.userId, roleAssignmentId });
            if (outcome.kind === 'success') return { kind: 'success', answer: outcome.answer, shows: 'nothing' };
            return { kind: 'refusal', refusal: outcome.refusal, causedBySecret: false };
          },
        },
      )
      .then(commandAnswer);
  }
}
