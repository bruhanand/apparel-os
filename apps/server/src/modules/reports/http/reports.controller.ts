import { REPORT_PAGE_CAP, routes } from '@apparel-os/schemas';
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
  type CommandRefusal,
  type CommandRunner,
  type IdempotencyHelper,
  type ReadModelGateway,
  type RouteInputOf,
  type TransactionContext,
} from '../../../kernel/index.js';
import { ACCESS, SignedIn, type AccessInterface, type SignedInUser } from '../../access/index.js';
import { AUDIT, type AuditInterface } from '../../audit/index.js';
import { exportStockReport } from '../commands/export-stock-report.js';
import { BUSINESS_DATE_NOT_SET, invalidCursor } from '../domain/refusals.js';
import { holdingKeyOfCursor } from '../domain/stock-report.js';
import { readerAuthority, ReadRefused } from '../queries/authority.js';
import { bookingStatusReport } from '../queries/booking-status.js';
import { receiptProblemsReport } from '../queries/receipt-problems.js';
import { exportBookingStatus, exportReceiptProblems, exportSupplierPerformance } from '../queries/report-exports.js';
import { stockReport } from '../queries/stock-report.js';
import { supplierPerformanceReport } from '../queries/supplier-performance.js';

/** A report's refusal as the API answers it (code-house-rules 12.3). */
const refused = (refusal: CommandRefusal) => new ApiRefusal({ ...refusal, missing: [...refusal.missing] });

/**
 * The stage 2 reports (goods-in 9.1, 9.3, 9.5, section 11; code-house-rules 12.1; S2-F11-T02): each read in a READ
 * ONLY transaction as the signed-in user, through the read-model gateway, each row authorised with its own facts, so
 * the guard Authenticates only (access-and-approvals 5.3, 7.1 step 3). No rule lives here.
 */
@Controller()
export class ReportsController {
  constructor(
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(READ_MODEL_GATEWAY) private readonly gateway: ReadModelGateway,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(AUDIT) private readonly audit: AuditInterface,
  ) {}

  /** Runs a read as the user on the business date, its refusals answered as the API answers them. */
  private read<A>(
    user: SignedInUser,
    commandName: string,
    work: (context: TransactionContext, today: string, timeZone: string) => Promise<A>,
  ): Promise<A> {
    return this.runner.read(
      {
        commandName,
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) => {
        const date = await context.businessDate();
        if (date.kind === 'not-set') throw refused(BUSINESS_DATE_NOT_SET);
        try {
          return await work(context, date.date, date.timezone);
        } catch (error) {
          if (error instanceof ReadRefused) throw refused(error.refusal);
          throw error;
        }
      },
    );
  }

  @ApiRoute(routes.readBookingStatusReport)
  async readBookingStatusReport(
    @RouteInput() input: RouteInputOf<typeof routes.readBookingStatusReport>,
    @SignedIn() user: SignedInUser,
  ) {
    const { after, limit, ...filters } = input.query;
    return this.read(user, 'reports.read-booking-status', (context, today) =>
      bookingStatusReport(this.gateway, this.access, context, user.userId, {
        filters,
        ...(after === undefined ? {} : { after }),
        limit: limit === undefined ? REPORT_PAGE_CAP : Number(limit),
        today,
      }),
    );
  }

  @ApiRoute(routes.exportBookingStatusReport)
  async exportBookingStatusReport(
    @RouteInput() input: RouteInputOf<typeof routes.exportBookingStatusReport>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.read(user, 'reports.export-booking-status', (context, today, timeZone) =>
      exportBookingStatus(
        { gateway: this.gateway, access: this.access, context, actorId: user.userId, today, timeZone },
        input.query,
      ),
    );
  }

  @ApiRoute(routes.readReceiptProblemsReport)
  async readReceiptProblemsReport(
    @RouteInput() input: RouteInputOf<typeof routes.readReceiptProblemsReport>,
    @SignedIn() user: SignedInUser,
  ) {
    const { after, limit, ...filters } = input.query;
    return this.read(user, 'reports.read-receipt-problems', (context, today) =>
      receiptProblemsReport(this.gateway, this.access, context, user.userId, {
        filters,
        ...(after === undefined ? {} : { after }),
        limit: limit === undefined ? REPORT_PAGE_CAP : Number(limit),
        today,
      }),
    );
  }

  @ApiRoute(routes.exportReceiptProblemsReport)
  async exportReceiptProblemsReport(
    @RouteInput() input: RouteInputOf<typeof routes.exportReceiptProblemsReport>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.read(user, 'reports.export-receipt-problems', (context, today, timeZone) =>
      exportReceiptProblems(
        { gateway: this.gateway, access: this.access, context, actorId: user.userId, today, timeZone },
        input.query,
      ),
    );
  }

  @ApiRoute(routes.readSupplierPerformanceReport)
  async readSupplierPerformanceReport(
    @RouteInput() input: RouteInputOf<typeof routes.readSupplierPerformanceReport>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.read(user, 'reports.read-supplier-performance', (context, today) =>
      supplierPerformanceReport(this.gateway, this.access, context, user.userId, input.query, today),
    );
  }

  @ApiRoute(routes.exportSupplierPerformanceReport)
  async exportSupplierPerformanceReport(
    @RouteInput() input: RouteInputOf<typeof routes.exportSupplierPerformanceReport>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.read(user, 'reports.export-supplier-performance', (context, today, timeZone) =>
      exportSupplierPerformance(
        { gateway: this.gateway, access: this.access, context, actorId: user.userId, today, timeZone },
        input.query,
      ),
    );
  }

  @ApiRoute(routes.readStockReport)
  async readStockReport(
    @RouteInput() input: RouteInputOf<typeof routes.readStockReport>,
    @SignedIn() user: SignedInUser,
  ) {
    const { after, limit, ...filters } = input.query;
    const key = after === undefined ? undefined : holdingKeyOfCursor(after);
    if (after !== undefined && key === undefined) throw new ApiRefusal(invalidCursor());
    return this.read(
      user,
      'reports.read-stock-report',
      async (context, today) =>
        (
          await stockReport(
            this.gateway,
            this.access,
            context,
            {
              filters,
              ...(key === undefined ? {} : { after: key }),
              limit: limit === undefined ? REPORT_PAGE_CAP : Number(limit),
              today,
            },
            readerAuthority(this.access, context, user.userId),
          )
        ).report,
    );
  }

  @ApiRoute(routes.exportStockReport)
  async exportStockReport(
    @RouteInput() input: RouteInputOf<typeof routes.exportStockReport>,
    @SignedIn() user: SignedInUser,
  ) {
    const answer = await exportStockReport(
      { helper: this.helper, gateway: this.gateway, access: this.access, audit: this.audit },
      {
        organisation: user.organisation,
        userId: user.userId,
        correlationId: user.correlationId,
        networkAddress: user.networkAddress,
      },
      input.body,
      input.idempotencyKey,
      requestContentOf(routes.exportStockReport, input),
    );
    return commandAnswer(answer);
  }
}
