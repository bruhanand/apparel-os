import type { CommandRoute, PermissionAction } from '@apparel-os/schemas';
import {
  CommandDefect,
  commandAnswer,
  requestContentOf,
  type CommandOutcome,
  type CommandRunner,
  type IdempotencyHelper,
  type JsonValue,
  type ReplayAuthorisation,
  type RouteInputOf,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AccessInterface, Preparer, SignedInUser } from '../../access/index.js';
import type { Outcome } from '../commands/devices.js';

// The plumbing every route of `pos` shares (code-house-rules 12.1, 12.4; access-and-approvals 7.1, 8.2; CH-14): a
// read with the signed-in actor, and a command under its idempotency key that answers a replay only while the same
// Authorise still passes; for a route the guard Authorised, the assignment it found is held at step 0. No rule lives
// here (S1-F12-T03 review).

type ActionRoute = CommandRoute & { access: { kind: 'action' } };
type OwnRoute = CommandRoute & { access: { kind: 'own' } };

/** The permission a command relies on, with no scope fact (access-and-approvals 5.3). */
interface Need {
  readonly action: PermissionAction;
  readonly recordType: string;
}

/** What a command's work answers: an outcome of `pos`, which may say a secret caused its refusal (12.5). */
type Work = Promise<Outcome<JsonValue> & { readonly causedBySecret?: boolean }>;

export class PosRoutes {
  constructor(
    private readonly helper: IdempotencyHelper,
    private readonly runner: CommandRunner,
    private readonly access: Pick<AccessInterface, 'authorise' | 'holdAuthority'>,
  ) {}

  /** A read-only transaction as the signed-in user (code-house-rules 8.1). */
  read<Answer>(
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

  /** A command on a route the guard Authorised: the assignment it found is held at step 0 and rechecked (8.2). */
  command<R extends ActionRoute>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    work: (context: TransactionContext, preparer: Preparer) => Work,
  ) {
    const need = { action: route.access.action, recordType: route.access.recordType };
    return this.run(route, commandName, user, input, this.replayFor(user, need), async (context) => {
      const roleAssignmentId = user.roleAssignmentId;
      if (roleAssignmentId === undefined) throw new CommandDefect('A pos command ran without Authorise');
      const held = await this.hold(context, user, roleAssignmentId, need);
      if (held !== undefined) return { kind: 'refusal', refusal: held };
      return work(context, { userId: user.userId, roleAssignmentId });
    });
  }

  /**
   * A command a person may run on their own record with no permission, and anyone else only holding `need` (RR-489):
   * the guard Authenticated only; `isOwn` answers, before any lock, whether the record is the person's. For anyone else
   * the command Authorises `need`, holds the assignment at step 0, and passes it to `work`.
   */
  ownOrHeld<R extends OwnRoute>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    need: Need,
    isOwn: (context: TransactionContext) => Promise<boolean>,
    work: (context: TransactionContext, heldThrough: string | undefined) => Work,
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

  /**
   * A command under its idempotency key (12.4): `authoriseReplay` decides whether a kept answer may be given again,
   * and `work` runs in the command's transaction, authorising and holding what it relies on itself.
   */
  async run<R extends CommandRoute & { access: { kind: 'own' | 'action' } }>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    authoriseReplay: ReplayAuthorisation,
    work: (context: TransactionContext) => Work,
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
          if (outcome.kind === 'success') return { kind: 'success', answer: outcome.answer, shows: 'nothing' };
          return { kind: 'refusal', refusal: outcome.refusal, causedBySecret: outcome.causedBySecret ?? false };
        },
      },
    );
    return commandAnswer(answer);
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
}
