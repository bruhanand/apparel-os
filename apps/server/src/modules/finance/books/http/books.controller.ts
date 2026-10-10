import { routes, type CommandRoute } from '@apparel-os/schemas';
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
} from '../../../../kernel/index.js';
import { ACCESS, SignedIn, type AccessInterface, type Preparer, type SignedInUser } from '../../../access/index.js';
import type { BooksInterface } from '../books.js';
import type { Outcome } from '../commands/lines.js';
import { BOOKS } from '../tokens.js';

/**
 * The routes of the books part (books-and-posting 9.1; module-map 4.14; code-house-rules 12.1; S1-F09-T01), API only
 * in stage 1 (DEC-116). Authenticate and Authorise ran in the guard, on the route's action and type: the books' types
 * carry no scope fact (access-and-approvals 5.3). Each command runs under its idempotency key, holds its authority at
 * step 0, and a replay is answered only while the same Authorise still passes (12.4, CH-14).
 */
@Controller()
export class BooksController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(BOOKS) private readonly books: BooksInterface,
  ) {}

  // The chart of accounts (3.1).
  @ApiRoute(routes.listAccounts)
  listAccounts(@RouteInput() input: RouteInputOf<typeof routes.listAccounts>, @SignedIn() user: SignedInUser) {
    return this.read(user, 'finance.list-accounts', async (context, today) => ({
      asOf: context.startedAt.toISOString(),
      records: await this.books.listAccounts(context, input.params.bookId, today),
    }));
  }

  @ApiRoute(routes.readAccount)
  async readAccount(@RouteInput() input: RouteInputOf<typeof routes.readAccount>, @SignedIn() user: SignedInUser) {
    const accountId = input.params.accountId;
    const answer = await this.read(user, 'finance.read-account', async (context, today) => ({
      asOf: context.startedAt.toISOString(),
      record: await this.books.readAccount(context, accountId, today),
    }));
    if (answer.record === undefined) {
      throw new ApiRefusal({
        kind: 'not-found',
        code: 'finance.record-not-found',
        missing: [{ kind: 'record', recordType: 'finance.account', recordId: accountId }],
      });
    }
    return { asOf: answer.asOf, record: answer.record };
  }

  @ApiRoute(routes.prepareAccount)
  prepareAccount(@RouteInput() input: RouteInputOf<typeof routes.prepareAccount>, @SignedIn() user: SignedInUser) {
    return this.command(routes.prepareAccount, 'finance.prepare-account', user, input, (c, p) =>
      this.books.prepareAccount(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareAccountVersion)
  prepareAccountVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareAccountVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.prepareAccountVersion, 'finance.prepare-account-version', user, input, (c, p) =>
      this.books.prepareAccountVersion(c, p, input.params.accountId, input.body),
    );
  }

  // Book settings (2.2, 2.3).
  @ApiRoute(routes.listBookSettings)
  listBookSettings(@RouteInput() input: RouteInputOf<typeof routes.listBookSettings>, @SignedIn() user: SignedInUser) {
    return this.read(user, 'finance.list-book-settings', async (context, today) => ({
      asOf: context.startedAt.toISOString(),
      records: await this.books.listSettings(context, input.params.bookId, today),
    }));
  }

  @ApiRoute(routes.prepareBookSetting)
  prepareBookSetting(
    @RouteInput() input: RouteInputOf<typeof routes.prepareBookSetting>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.prepareBookSetting, 'finance.prepare-book-setting-version', user, input, (c, p) =>
      this.books.prepareBookSetting(c, p, input.params.bookId, input.body),
    );
  }

  /** Read the cost setting of a book on a date (2.2; stock-ledger 13.1): its version in force, or not set (12.14). */
  @ApiRoute(routes.readCostSetting)
  readCostSetting(@RouteInput() input: RouteInputOf<typeof routes.readCostSetting>, @SignedIn() user: SignedInUser) {
    const bookId = input.params.bookId;
    return this.read(user, 'finance.read-cost-setting', async (context) => ({
      asOf: context.startedAt.toISOString(),
      bookId,
      setting: await this.books.costSettingOn(context, bookId, input.query.date),
    }));
  }

  // The CA's approval evidence (6.3).
  @ApiRoute(routes.recordCaEvidence)
  recordCaEvidence(@RouteInput() input: RouteInputOf<typeof routes.recordCaEvidence>, @SignedIn() user: SignedInUser) {
    return this.command(routes.recordCaEvidence, 'finance.record-ca-approval-evidence', user, input, (c, p) =>
      this.books.recordCaEvidence(c, p, input.body),
    );
  }

  private async read<Answer>(
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

  private async command<R extends CommandRoute & { access: { kind: 'action' } }, Answer extends object>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    work: (context: TransactionContext, preparer: Preparer) => Promise<Outcome<Answer>>,
  ) {
    const { action, recordType } = route.access;
    const need = { actorId: user.userId, action, recordType };
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
          const roleAssignmentId = user.roleAssignmentId;
          if (roleAssignmentId === undefined) throw new CommandDefect('A books command ran without Authorise');
          // Step 0 (code-house-rules 8.2): the assignment Authorise found, held and rechecked under the locks.
          const held = await this.access.holdAuthority(context, { kind: 'user', id: user.userId }, roleAssignmentId, {
            action,
            recordType,
          });
          if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
          const outcome = await work(context, { userId: user.userId, roleAssignmentId });
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
