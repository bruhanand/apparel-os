import type { CommandRoute, PermissionAction } from '@apparel-os/schemas';
import {
  ApiRefusal,
  CommandDefect,
  commandAnswer,
  requestContentOf,
  type CommandOutcome,
  type CommandRefusal,
  type CommandRunner,
  type IdempotencyHelper,
  type JsonValue,
  type ReplayAuthorisation,
  type RouteInputOf,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AccessInterface, Preparer, SignedInUser } from '../../../access/index.js';
import type { Outcome } from '../commands/lines.js';

// The plumbing every route of `finance` shares (code-house-rules 12.1, 12.4; access-and-approvals 7.1, 8.2; CH-14):
// a read under the Organisation's business date, and a command under its idempotency key that holds its authority at
// step 0 and answers a replay only while the same Authorise still passes. The books and tax rules parts use it
// (module-map 4.14; RR-486).

type ActionRoute = CommandRoute & { access: { kind: 'action' } };
type OwnRoute = CommandRoute & { access: { kind: 'own' } };

/** The permission a command relies on, Authorised in the guard or in the command. */
interface Need {
  readonly action: PermissionAction;
  readonly recordType: string;
}

export class FinanceRoutes {
  constructor(
    private readonly helper: IdempotencyHelper,
    private readonly runner: CommandRunner,
    private readonly access: Pick<AccessInterface, 'authorise' | 'holdAuthority'>,
    /** The part's name in a defect's message. */
    private readonly part: string,
  ) {}

  /** A read under today's business date; refused while the Organisation has no timezone (code-house-rules 9). */
  async read<Answer>(
    user: SignedInUser,
    commandName: string,
    work: (context: TransactionContext, today: string) => Promise<Answer>,
  ): Promise<Answer> {
    const answer = await this.runner.read(
      {
        commandName,
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) => {
        const date = await context.businessDate();
        return date.kind === 'not-set' ? undefined : { read: await work(context, date.date) };
      },
    );
    if (answer === undefined) {
      throw new ApiRefusal({
        kind: 'unavailable',
        code: 'access.business-date-not-set',
        missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
      });
    }
    return answer.read;
  }

  /** A command on a route the guard Authorised: the assignment it found is held at step 0 and rechecked. */
  command<R extends ActionRoute, Answer extends object>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    work: (context: TransactionContext, preparer: Preparer) => Promise<Outcome<Answer>>,
  ) {
    const need = { action: route.access.action, recordType: route.access.recordType };
    return this.run(route, commandName, user, input, this.replayFor(user, need), async (context) => {
      const roleAssignmentId = user.roleAssignmentId;
      if (roleAssignmentId === undefined) throw new CommandDefect(`A ${this.part} command ran without Authorise`);
      const held = await this.hold(context, user, roleAssignmentId, need);
      if (held !== undefined) return { kind: 'refusal', refusal: held };
      return work(context, { userId: user.userId, roleAssignmentId });
    });
  }

  /**
   * A command a person may run on their own record with no permission, and anyone else only holding `need`
   * (RR-489): the guard Authenticated only; `isOwn` answers, before any lock, whether the record is the person's. For
   * anyone else the command Authorises `need`, holds the assignment at step 0, and passes it to `work`.
   */
  ownOrHeld<R extends OwnRoute, Answer extends object>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    need: Need,
    isOwn: (context: TransactionContext) => Promise<boolean>,
    work: (context: TransactionContext, heldThrough: string | undefined) => Promise<Outcome<Answer>>,
  ) {
    const replay = this.replayFor(user, need);
    return this.run(
      route,
      commandName,
      user,
      input,
      async (context, kept) => ((await isOwn(context)) ? { kind: 'allowed' } : replay(context, kept)),
      async (context) => {
        if (await isOwn(context)) return work(context, undefined);
        const authorised = await this.access.authorise(context, { actorId: user.userId, ...need });
        if (authorised.kind === 'refused') {
          return {
            kind: 'refusal',
            refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
          };
        }
        const held = await this.hold(context, user, authorised.roleAssignmentId, need);
        if (held !== undefined) return { kind: 'refusal', refusal: held };
        return work(context, authorised.roleAssignmentId);
      },
    );
  }

  /** Step 0 (code-house-rules 8.2): the assignment relied on, held and rechecked under the locks. */
  private hold(context: TransactionContext, user: SignedInUser, roleAssignmentId: string, need: Need) {
    return this.access.holdAuthority(context, { kind: 'user', id: user.userId }, roleAssignmentId, need);
  }

  /** A replay is answered only while the same Authorise still passes (12.4, CH-14). */
  private replayFor(user: SignedInUser, need: Need): ReplayAuthorisation {
    return async (context) => {
      const authorised = await this.access.authorise(context, { actorId: user.userId, ...need });
      if (authorised.kind === 'allowed') return { kind: 'allowed' };
      return {
        kind: 'refused',
        refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
      };
    };
  }

  private async run<R extends CommandRoute & { access: { kind: 'own' | 'action' } }, Answer extends object>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    authoriseReplay: ReplayAuthorisation,
    work: (context: TransactionContext) => Promise<Outcome<Answer> | { kind: 'refusal'; refusal: CommandRefusal }>,
  ) {
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
          const outcome = await work(context);
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
