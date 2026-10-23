import { routes, STOCK_SEARCH_PAGE_CAP } from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRefusal,
  ApiRoute,
  COMMAND_RUNNER,
  commandAnswer,
  IDEMPOTENCY_HELPER,
  READ_MODEL_GATEWAY,
  requestContentOf,
  RouteInput,
  type CommandRunner,
  type IdempotencyHelper,
  type ReadModelGateway,
  type RouteInputOf,
} from '../../../kernel/index.js';
import { ACCESS, SignedIn, type AccessInterface, type SignedInUser } from '../../access/index.js';
import { AUDIT, type AuditInterface } from '../../audit/index.js';
import { exportStockSearch } from '../commands/export-stock-search.js';
import { BUSINESS_DATE_NOT_SET, invalidCursor } from '../domain/refusals.js';
import { keyOfCursor } from '../domain/search.js';
import { readerAuthority, SearchRefused } from '../queries/authority.js';
import { searchStock } from '../queries/stock-search.js';

/**
 * Stock search (goods-in 9.1, 9.2, 9.4, section 11; code-house-rules 12.1; S2-F11-T01): a page of the search, read in a
 * READ ONLY transaction as the signed-in user, and its export. Each result carries every scope fact, so the guard
 * Authenticates only and the search authorises each result with its own facts (access-and-approvals 5.3, 7.1 step 3).
 * No rule lives here.
 */
@Controller()
export class StockSearchController {
  constructor(
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(READ_MODEL_GATEWAY) private readonly gateway: ReadModelGateway,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(AUDIT) private readonly audit: AuditInterface,
  ) {}

  @ApiRoute(routes.searchStock)
  async searchStock(@RouteInput() input: RouteInputOf<typeof routes.searchStock>, @SignedIn() user: SignedInUser) {
    const { after, limit, ...filters } = input.query;
    const key = after === undefined ? undefined : keyOfCursor(after);
    if (after !== undefined && key === undefined) throw new ApiRefusal(invalidCursor());
    return this.runner.read(
      {
        commandName: 'reports.search-stock',
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) => {
        const date = await context.businessDate();
        if (date.kind === 'not-set')
          throw new ApiRefusal({ ...BUSINESS_DATE_NOT_SET, missing: [...BUSINESS_DATE_NOT_SET.missing] });
        try {
          const read = await searchStock(
            this.gateway,
            context,
            {
              filters,
              ...(key === undefined ? {} : { after: key }),
              limit: limit === undefined ? STOCK_SEARCH_PAGE_CAP : Number(limit),
              today: date.date,
            },
            readerAuthority(this.access, context, user.userId),
          );
          return read.search;
        } catch (error) {
          if (error instanceof SearchRefused) {
            throw new ApiRefusal({ ...error.refusal, missing: [...error.refusal.missing] });
          }
          throw error;
        }
      },
    );
  }

  @ApiRoute(routes.exportStockSearch)
  async exportStockSearch(
    @RouteInput() input: RouteInputOf<typeof routes.exportStockSearch>,
    @SignedIn() user: SignedInUser,
  ) {
    const answer = await exportStockSearch(
      { helper: this.helper, gateway: this.gateway, access: this.access, audit: this.audit },
      {
        organisation: user.organisation,
        userId: user.userId,
        correlationId: user.correlationId,
        networkAddress: user.networkAddress,
      },
      input.body,
      input.idempotencyKey,
      requestContentOf(routes.exportStockSearch, input),
    );
    return commandAnswer(answer);
  }
}
