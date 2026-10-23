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
import { invalidCursor } from '../domain/refusals.js';
import { keyOfCursor } from '../domain/search.js';
import { pageLimitOf } from '../queries/reading.js';
import { stockRecords } from '../queries/stock-records.js';
import { searchStock } from '../queries/stock-search.js';
import { readAsUser } from './read.js';

/**
 * Stock search (goods-in 9.1, 9.2, 9.4, section 11; code-house-rules 12.1; S2-F11-T01): a page of the search, read in a
 * READ ONLY transaction as the signed-in user, the records behind a figure of it or of the stock report, and its
 * export. Each result carries every scope fact, so the guard
 * Authenticates only and the search authorises each result with its own facts (access-and-approvals 5.3, 7.1 step 3).
 * No rule lives here.
 */
@Controller()
export class StockSearchController {
  constructor(
    @Inject(COMMAND_RUNNER) readonly runner: CommandRunner,
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(READ_MODEL_GATEWAY) readonly gateway: ReadModelGateway,
    @Inject(ACCESS) readonly access: AccessInterface,
    @Inject(AUDIT) private readonly audit: AuditInterface,
  ) {}

  @ApiRoute(routes.searchStock)
  async searchStock(@RouteInput() input: RouteInputOf<typeof routes.searchStock>, @SignedIn() user: SignedInUser) {
    const { after, limit, ...filters } = input.query;
    const key = after === undefined ? undefined : keyOfCursor(after);
    if (after !== undefined && key === undefined) throw new ApiRefusal(invalidCursor());
    const read = await readAsUser(this, user, 'reports.search-stock', (reading) =>
      searchStock(reading, {
        filters,
        ...(key === undefined ? {} : { after: key }),
        limit: pageLimitOf(limit, STOCK_SEARCH_PAGE_CAP),
      }),
    );
    return read.search;
  }

  /** The records behind a figure of stock search or the stock report (goods-in 9.1, 9.5; PRD-EXC-011). */
  @ApiRoute(routes.readStockRecords)
  readStockRecords(@RouteInput() input: RouteInputOf<typeof routes.readStockRecords>, @SignedIn() user: SignedInUser) {
    return readAsUser(this, user, 'reports.read-stock-records', (reading) => stockRecords(reading, input.query));
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
