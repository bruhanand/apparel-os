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
  type CommandRunner,
  type IdempotencyHelper,
  type ReadModelGateway,
  type RouteInputOf,
} from '../../../kernel/index.js';
import { ACCESS, SignedIn, type AccessInterface, type SignedInUser } from '../../access/index.js';
import { AUDIT, type AuditInterface } from '../../audit/index.js';
import { exportStockReport } from '../commands/export-stock-report.js';
import { invalidCursor } from '../domain/refusals.js';
import { holdingKeyOfCursor } from '../domain/stock-report.js';
import { pageLimitOf } from '../queries/reading.js';
import { bookingStatusReport } from '../queries/booking-status.js';
import { receiptProblemsReport } from '../queries/receipt-problems.js';
import { exportBookingStatus, exportReceiptProblems, exportSupplierPerformance } from '../queries/report-exports.js';
import { stockReport } from '../queries/stock-report.js';
import { supplierPerformanceReport } from '../queries/supplier-performance.js';
import { readAsUser } from './read.js';

/**
 * The stage 2 reports (goods-in 9.1, 9.3, 9.5, section 11; code-house-rules 12.1; S2-F11-T02): each read in a READ
 * ONLY transaction as the signed-in user, through the read-model gateway, each row authorised with its own facts, so
 * the guard Authenticates only (access-and-approvals 5.3, 7.1 step 3). No rule lives here.
 */
@Controller()
export class ReportsController {
  constructor(
    @Inject(COMMAND_RUNNER) readonly runner: CommandRunner,
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(READ_MODEL_GATEWAY) readonly gateway: ReadModelGateway,
    @Inject(ACCESS) readonly access: AccessInterface,
    @Inject(AUDIT) private readonly audit: AuditInterface,
  ) {}

  @ApiRoute(routes.readBookingStatusReport)
  async readBookingStatusReport(
    @RouteInput() input: RouteInputOf<typeof routes.readBookingStatusReport>,
    @SignedIn() user: SignedInUser,
  ) {
    const { after, limit, ...filters } = input.query;
    const read = await readAsUser(this, user, 'reports.read-booking-status', (reading) =>
      bookingStatusReport(reading, {
        filters,
        ...(after === undefined ? {} : { after }),
        limit: pageLimitOf(limit, REPORT_PAGE_CAP),
      }),
    );
    return read.report;
  }

  @ApiRoute(routes.exportBookingStatusReport)
  async exportBookingStatusReport(
    @RouteInput() input: RouteInputOf<typeof routes.exportBookingStatusReport>,
    @SignedIn() user: SignedInUser,
  ) {
    return readAsUser(this, user, 'reports.export-booking-status', (reading) =>
      exportBookingStatus(reading, input.query),
    );
  }

  @ApiRoute(routes.readReceiptProblemsReport)
  async readReceiptProblemsReport(
    @RouteInput() input: RouteInputOf<typeof routes.readReceiptProblemsReport>,
    @SignedIn() user: SignedInUser,
  ) {
    const { after, limit, ...filters } = input.query;
    const read = await readAsUser(this, user, 'reports.read-receipt-problems', (reading) =>
      receiptProblemsReport(reading, {
        filters,
        ...(after === undefined ? {} : { after }),
        limit: pageLimitOf(limit, REPORT_PAGE_CAP),
      }),
    );
    return read.report;
  }

  @ApiRoute(routes.exportReceiptProblemsReport)
  async exportReceiptProblemsReport(
    @RouteInput() input: RouteInputOf<typeof routes.exportReceiptProblemsReport>,
    @SignedIn() user: SignedInUser,
  ) {
    return readAsUser(this, user, 'reports.export-receipt-problems', (reading) =>
      exportReceiptProblems(reading, input.query),
    );
  }

  @ApiRoute(routes.readSupplierPerformanceReport)
  async readSupplierPerformanceReport(
    @RouteInput() input: RouteInputOf<typeof routes.readSupplierPerformanceReport>,
    @SignedIn() user: SignedInUser,
  ) {
    return readAsUser(this, user, 'reports.read-supplier-performance', (reading) =>
      supplierPerformanceReport(reading, input.query),
    );
  }

  @ApiRoute(routes.exportSupplierPerformanceReport)
  async exportSupplierPerformanceReport(
    @RouteInput() input: RouteInputOf<typeof routes.exportSupplierPerformanceReport>,
    @SignedIn() user: SignedInUser,
  ) {
    return readAsUser(this, user, 'reports.export-supplier-performance', (reading) =>
      exportSupplierPerformance(reading, input.query),
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
    const read = await readAsUser(this, user, 'reports.read-stock-report', (reading) =>
      stockReport(reading, {
        filters,
        ...(key === undefined ? {} : { after: key }),
        limit: pageLimitOf(limit, REPORT_PAGE_CAP),
      }),
    );
    return read.report;
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
