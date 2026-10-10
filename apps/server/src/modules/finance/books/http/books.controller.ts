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
import { recordOf } from '../queries/periods.js';
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

  // Periods (4.1; S1-F09-T02).
  @ApiRoute(routes.listPeriods)
  listPeriods(@RouteInput() input: RouteInputOf<typeof routes.listPeriods>, @SignedIn() user: SignedInUser) {
    return this.read(user, 'finance.list-periods', async (context) => ({
      asOf: context.startedAt.toISOString(),
      records: await this.books.listPeriods(context, input.params.bookId),
    }));
  }

  @ApiRoute(routes.definePeriod)
  definePeriod(@RouteInput() input: RouteInputOf<typeof routes.definePeriod>, @SignedIn() user: SignedInUser) {
    return this.command(routes.definePeriod, 'finance.define-period', user, input, (c, p) =>
      this.books.definePeriod(c, p, input.params.bookId, input.body),
    );
  }

  // Lock and reopening, and Money › Period close (4.2, 4.3, 14; S1-F09-T03). The decision on a reopening is access's
  // Decide route (access-and-approvals 9.5).
  @ApiRoute(routes.readPeriodClose)
  readPeriodClose(@RouteInput() input: RouteInputOf<typeof routes.readPeriodClose>, @SignedIn() user: SignedInUser) {
    const { bookId } = input.params;
    return this.read(user, 'finance.read-period-close', async (context) => ({
      asOf: context.startedAt.toISOString(),
      bookId,
      periods: await this.books.periodClose(context, bookId),
    }));
  }

  @ApiRoute(routes.lockPeriod)
  lockPeriod(@RouteInput() input: RouteInputOf<typeof routes.lockPeriod>, @SignedIn() user: SignedInUser) {
    return this.command(routes.lockPeriod, 'finance.lock-period', user, input, (c, p) =>
      this.books.lockPeriod(c, p, input.params.periodId),
    );
  }

  @ApiRoute(routes.requestReopening)
  requestReopening(@RouteInput() input: RouteInputOf<typeof routes.requestReopening>, @SignedIn() user: SignedInUser) {
    return this.command(routes.requestReopening, 'finance.request-reopening', user, input, (c, p) =>
      this.books.requestReopening(c, p, input.params.periodId, input.body),
    );
  }

  @ApiRoute(routes.readReopening)
  async readReopening(@RouteInput() input: RouteInputOf<typeof routes.readReopening>, @SignedIn() user: SignedInUser) {
    const { reopeningId } = input.params;
    const answer = await this.read(user, 'finance.read-reopening', async (context) => ({
      asOf: context.startedAt.toISOString(),
      found: await this.books.readReopening(context, reopeningId),
    }));
    if (answer.found === undefined) {
      throw new ApiRefusal({
        kind: 'not-found',
        code: 'finance.record-not-found',
        missing: [{ kind: 'record', recordType: 'finance.period_reopening', recordId: reopeningId }],
      });
    }
    return { asOf: answer.asOf, reopening: answer.found.reopening, period: recordOf(answer.found.period) };
  }

  @ApiRoute(routes.withdrawReopening)
  withdrawReopening(
    @RouteInput() input: RouteInputOf<typeof routes.withdrawReopening>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.withdrawReopening, 'finance.withdraw-reopening', user, input, (c, p) =>
      this.books.withdrawReopening(c, p, input.params.reopeningId),
    );
  }

  // Posting maps (6, 14; S1-F09-T02).
  @ApiRoute(routes.listPostingMaps)
  listPostingMaps(@RouteInput() input: RouteInputOf<typeof routes.listPostingMaps>, @SignedIn() user: SignedInUser) {
    return this.read(user, 'finance.list-posting-maps', async (context, today) => ({
      asOf: context.startedAt.toISOString(),
      on: input.query.on,
      eventKinds: this.books.eventKinds().map((each) => ({
        kind: each.kind,
        components: [...each.components],
        ...(each.reversalKind === null ? {} : { reversalKind: each.reversalKind }),
      })),
      records: await this.books.listPostingMaps(context, input.params.bookId, input.query.on, today),
    }));
  }

  @ApiRoute(routes.preparePostingMap)
  preparePostingMap(
    @RouteInput() input: RouteInputOf<typeof routes.preparePostingMap>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.command(routes.preparePostingMap, 'finance.prepare-posting-map-version', user, input, (c, p) =>
      this.books.preparePostingMap(c, p, input.body),
    );
  }

  // The internal ledger and trial balance (12; POL-11.01; S1-F09-T02).
  @ApiRoute(routes.readTrialBalance)
  async readTrialBalance(
    @RouteInput() input: RouteInputOf<typeof routes.readTrialBalance>,
    @SignedIn() user: SignedInUser,
  ) {
    const { bookId } = input.params;
    const answer = await this.read(user, 'finance.read-trial-balance', async (context) => {
      await this.mayReadJournals(context, user);
      return { balance: await this.books.trialBalance(context, bookId, input.query.periodId) };
    });
    if (answer.balance === undefined) {
      throw new ApiRefusal({
        kind: 'not-found',
        code: 'finance.record-not-found',
        missing: [{ kind: 'record', recordType: 'finance.financial_period', recordId: input.query.periodId }],
      });
    }
    return answer.balance;
  }

  @ApiRoute(routes.readLedger)
  async readLedger(@RouteInput() input: RouteInputOf<typeof routes.readLedger>, @SignedIn() user: SignedInUser) {
    const { accountId } = input.params;
    const answer = await this.read(user, 'finance.read-ledger', async (context) => {
      await this.mayReadJournals(context, user);
      return { ledger: await this.books.ledger(context, accountId, input.query.from, input.query.to) };
    });
    if (answer.ledger === undefined) {
      throw new ApiRefusal({
        kind: 'not-found',
        code: 'finance.record-not-found',
        missing: [{ kind: 'record', recordType: 'finance.account', recordId: accountId }],
      });
    }
    return answer.ledger;
  }

  /**
   * The journal lines carry scope facts, so their reads authorise in the command (access-and-approvals 5.3, 7.1 step 3):
   * refused when no assignment grants view on journals at all; otherwise row-level security shows the lines in the
   * reader's scope, and the answer says when that is part of the book (books-and-posting 12; PRD-SEC-005).
   */
  private async mayReadJournals(context: TransactionContext, user: SignedInUser): Promise<void> {
    const checked = await this.access.authoriseEach(
      context,
      { actorId: user.userId, action: 'view', recordType: 'finance.journal' },
      [],
    );
    if (checked.kind === 'refused') throw new ApiRefusal({ ...checked.refusal, missing: [...checked.refusal.missing] });
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
