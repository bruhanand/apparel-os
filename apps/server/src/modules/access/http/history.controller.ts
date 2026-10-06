import { routes } from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRefusal,
  ApiRoute,
  COMMAND_RUNNER,
  RouteInput,
  type CommandRunner,
  type RouteInputOf,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { History, HistoryAnswer } from '../queries/history.js';
import { SignedIn, type SignedInUser } from './authenticate.guard.js';

/** The token of the history reads (queries/history.ts). Internal to `access`. */
export const HISTORY = 'access.History';

/**
 * The history reads (numbering-and-audit 4.5, 5; module-map 4.3, 4.5; code-house-rules 12.1 "Reads"): the history of
 * a record or of an actor, and the access history report. Each runs in a read-only transaction with the reader as
 * actor, so row-level security applies (PRD-SEC-005); the controller holds no rule of its own.
 */
@Controller()
export class HistoryController {
  constructor(
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(HISTORY) private readonly history: History,
  ) {}

  @ApiRoute(routes.readRecordHistory)
  async readRecordHistory(
    @RouteInput() input: RouteInputOf<typeof routes.readRecordHistory>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.read(user, 'access.read-record-history', (c) =>
      this.history.recordHistory(c, user.userId, input.query),
    );
  }

  @ApiRoute(routes.readActorHistory)
  async readActorHistory(
    @RouteInput() input: RouteInputOf<typeof routes.readActorHistory>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.read(user, 'access.read-actor-history', (c) => this.history.actorHistory(c, user.userId, input.query));
  }

  @ApiRoute(routes.readAccessHistory)
  async readAccessHistory(
    @RouteInput() input: RouteInputOf<typeof routes.readAccessHistory>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.read(user, 'access.read-access-history', (c) =>
      this.history.accessHistory(c, user.userId, 'access', input.query),
    );
  }

  @ApiRoute(routes.readSensitiveAccessHistory)
  async readSensitiveAccessHistory(
    @RouteInput() input: RouteInputOf<typeof routes.readSensitiveAccessHistory>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.read(user, 'access.read-sensitive-access-history', (c) =>
      this.history.accessHistory(c, user.userId, 'sensitive-access', input.query),
    );
  }

  private async read<Page>(
    user: SignedInUser,
    commandName: string,
    work: (context: TransactionContext) => Promise<HistoryAnswer<Page>>,
  ): Promise<Page> {
    const answer = await this.runner.read(
      {
        commandName,
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      work,
    );
    if (answer.kind === 'refused') {
      throw new ApiRefusal({
        kind: answer.refusal.kind,
        code: answer.refusal.code,
        missing: [...answer.refusal.missing],
      });
    }
    return answer.page;
  }
}
