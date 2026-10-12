import { BILL_FORMAT_CHANGE_TYPE, FINANCIAL_YEAR_CHANGE_TYPE, routes } from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRoute,
  COMMAND_RUNNER,
  IDEMPOTENCY_HELPER,
  RouteInput,
  type CommandRunner,
  type IdempotencyHelper,
  type RouteInputOf,
} from '../../../kernel/index.js';
import { ACCESS, SignedIn, type AccessInterface, type SignedInUser } from '../../access/index.js';
import type { PosInterface } from '../pos.js';
import { POS } from '../tokens.js';
import { PosRoutes } from './pos-routes.js';

/**
 * Setup's financial years and bill-number format (offline-counter 4.3b; numbering-and-audit 3.3, 3.5; code-house-rules
 * 12.1, 12.4; S1-F12-T03). Their record types carry no scope fact, so the guard Authorised the route's action
 * (access-and-approvals 5.3); each command runs under its idempotency key, holds the assignment at step 0 and answers a
 * replay only while the same Authorise still passes (CH-14). The decision is access's Decide route (9.5); a pending
 * change is withdrawn by its preparer, or by a person holding cancel (9.1a; RR-489). No rule lives here.
 */
@Controller()
export class NumberingSettingsController {
  private readonly routes: PosRoutes;

  constructor(
    @Inject(IDEMPOTENCY_HELPER) helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) runner: CommandRunner,
    @Inject(ACCESS) access: AccessInterface,
    @Inject(POS) private readonly pos: PosInterface,
  ) {
    this.routes = new PosRoutes(helper, runner, access);
  }

  @ApiRoute(routes.listFinancialYears)
  listFinancialYears(@SignedIn() user: SignedInUser) {
    return this.routes.read(user, 'pos.list-financial-years', (context) => this.pos.financialYears(context));
  }

  @ApiRoute(routes.prepareFinancialYearChange)
  prepareFinancialYearChange(
    @RouteInput() input: RouteInputOf<typeof routes.prepareFinancialYearChange>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.routes.command(
      routes.prepareFinancialYearChange,
      'pos.prepare-financial-year-change',
      user,
      input,
      (c, p) => this.pos.prepareFinancialYearChange(c, p, input.body),
    );
  }

  @ApiRoute(routes.withdrawFinancialYearChange)
  withdrawFinancialYearChange(
    @RouteInput() input: RouteInputOf<typeof routes.withdrawFinancialYearChange>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.withdraw(routes.withdrawFinancialYearChange, 'financial-year', FINANCIAL_YEAR_CHANGE_TYPE, user, input);
  }

  @ApiRoute(routes.readBillFormat)
  readBillFormat(@SignedIn() user: SignedInUser) {
    return this.routes.read(user, 'pos.read-bill-format', (context) => this.pos.billFormat(context));
  }

  @ApiRoute(routes.prepareBillFormatChange)
  prepareBillFormatChange(
    @RouteInput() input: RouteInputOf<typeof routes.prepareBillFormatChange>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.routes.command(routes.prepareBillFormatChange, 'pos.prepare-bill-format-change', user, input, (c, p) =>
      this.pos.prepareBillFormatChange(c, p, input.body),
    );
  }

  @ApiRoute(routes.withdrawBillFormatChange)
  withdrawBillFormatChange(
    @RouteInput() input: RouteInputOf<typeof routes.withdrawBillFormatChange>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.withdraw(routes.withdrawBillFormatChange, 'bill-format', BILL_FORMAT_CHANGE_TYPE, user, input);
  }

  /** RR-489 (product owner, 12 Oct 2026): the preparer withdraws their own without cancel; anyone else holds cancel. */
  private withdraw<R extends typeof routes.withdrawFinancialYearChange | typeof routes.withdrawBillFormatChange>(
    route: R,
    kind: 'financial-year' | 'bill-format',
    recordType: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
  ) {
    const { changeId } = input.params;
    return this.routes.ownOrHeld(
      route,
      `pos.withdraw-${kind}-change`,
      user,
      input,
      { action: 'cancel', recordType },
      async (context) => (await this.pos.changePreparer(context, kind, changeId)) === user.userId,
      (context, heldThrough) =>
        this.pos.withdrawNumberingChange(
          context,
          { userId: user.userId, ...(heldThrough === undefined ? {} : { cancelHeldThrough: heldThrough }) },
          kind,
          changeId,
        ),
    );
  }
}
