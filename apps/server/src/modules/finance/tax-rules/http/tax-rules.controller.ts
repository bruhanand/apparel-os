import { routes, TAX_RULE_TYPE, type MasterPageQuery } from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRefusal,
  ApiRoute,
  COMMAND_RUNNER,
  IDEMPOTENCY_HELPER,
  RouteInput,
  type CommandRunner,
  type IdempotencyHelper,
  type RouteInputOf,
} from '../../../../kernel/index.js';
import { ACCESS, SignedIn, type AccessInterface, type SignedInUser } from '../../../access/index.js';
import type { TaxRulesInterface } from '../tax-rules.js';
import { FinanceRoutes } from '../../books/index.js';
import { TAX_RULES } from '../tokens.js';

/**
 * The routes of the tax rules part (shared-calculations 10; module-map 4.14; code-house-rules 12.1; S1-F09-T04): API
 * only in stage 1 (DEC-116). Authenticate and Authorise ran in the guard, on the route's action and `finance.tax_rule`,
 * which carries no scope fact (access-and-approvals 5.3). Each command runs under its idempotency key, holds its
 * authority at step 0, and a replay is answered only while the same Authorise still passes (12.4, CH-14).
 */
@Controller()
export class TaxRulesController {
  private readonly routes: FinanceRoutes;

  constructor(
    @Inject(IDEMPOTENCY_HELPER) helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) runner: CommandRunner,
    @Inject(ACCESS) access: AccessInterface,
    @Inject(TAX_RULES) private readonly taxRules: TaxRulesInterface,
  ) {
    this.routes = new FinanceRoutes(helper, runner, access, 'tax rules');
  }

  @ApiRoute(routes.listTaxRuleRecords)
  listTaxRuleRecords(
    @RouteInput() input: RouteInputOf<typeof routes.listTaxRuleRecords>,
    @SignedIn() user: SignedInUser,
  ) {
    const page = pageOf(input.query);
    return this.routes.read(user, 'finance.list-tax-rule-records', async (context, today) => {
      const found = await this.taxRules.listRecords(context, input.params.kind, today, page);
      return { asOf: context.startedAt.toISOString(), records: found.records, next: found.next };
    });
  }

  @ApiRoute(routes.readTaxRuleRecord)
  async readTaxRuleRecord(
    @RouteInput() input: RouteInputOf<typeof routes.readTaxRuleRecord>,
    @SignedIn() user: SignedInUser,
  ) {
    const { kind, recordId } = input.params;
    const answer = await this.routes.read(user, 'finance.read-tax-rule-record', async (context, today) => ({
      asOf: context.startedAt.toISOString(),
      record: await this.taxRules.readRecord(context, kind, recordId, today),
    }));
    if (answer.record === undefined) {
      throw new ApiRefusal({
        kind: 'not-found',
        code: 'finance.record-not-found',
        missing: [{ kind: 'record', recordType: TAX_RULE_TYPE, recordId }],
      });
    }
    return { asOf: answer.asOf, record: answer.record };
  }

  /** Read tax rules (10.2): the rules in force on a date, each with its version, or not set. */
  @ApiRoute(routes.readTaxRules)
  readTaxRules(@RouteInput() input: RouteInputOf<typeof routes.readTaxRules>, @SignedIn() user: SignedInUser) {
    const { date, taxRegistrationId, classifications } = input.query;
    return this.routes.read(user, 'finance.read-tax-rules', async (context) => ({
      asOf: context.startedAt.toISOString(),
      rules: await this.taxRules.readTaxRules(context, {
        date,
        taxRegistrationId,
        classifications: classifications.split(','),
      }),
    }));
  }

  @ApiRoute(routes.prepareGoodsClassification)
  prepareGoodsClassification(
    @RouteInput() input: RouteInputOf<typeof routes.prepareGoodsClassification>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.routes.command(
      routes.prepareGoodsClassification,
      'finance.prepare-goods-classification',
      user,
      input,
      (c, p) => this.taxRules.prepareClassification(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareGoodsClassificationVersion)
  prepareGoodsClassificationVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareGoodsClassificationVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.routes.command(
      routes.prepareGoodsClassificationVersion,
      'finance.prepare-goods-classification-version',
      user,
      input,
      (c, p) => this.taxRules.prepareClassificationVersion(c, p, input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareTaxRateRule)
  prepareTaxRateRule(
    @RouteInput() input: RouteInputOf<typeof routes.prepareTaxRateRule>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.routes.command(
      routes.prepareTaxRateRule,
      'finance.prepare-tax-rate-rule-version',
      user,
      input,
      (c, p) => this.taxRules.prepareRateRule(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareRegistrationApplicability)
  prepareRegistrationApplicability(
    @RouteInput() input: RouteInputOf<typeof routes.prepareRegistrationApplicability>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.routes.command(
      routes.prepareRegistrationApplicability,
      'finance.prepare-registration-applicability-version',
      user,
      input,
      (c, p) => this.taxRules.prepareApplicability(c, p, input.body),
    );
  }

  @ApiRoute(routes.preparePriceBasis)
  preparePriceBasis(
    @RouteInput() input: RouteInputOf<typeof routes.preparePriceBasis>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.routes.command(routes.preparePriceBasis, 'finance.prepare-price-basis-version', user, input, (c, p) =>
      this.taxRules.preparePriceBasis(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareRoundingRule)
  prepareRoundingRule(
    @RouteInput() input: RouteInputOf<typeof routes.prepareRoundingRule>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.routes.command(
      routes.prepareRoundingRule,
      'finance.prepare-rounding-rule-version',
      user,
      input,
      (c, p) => this.taxRules.prepareRoundingRule(c, p, input.body),
    );
  }

  /** The CA's evidence of a named set of versions, recorded by an Accounts user who may decide them (10.1). */
  @ApiRoute(routes.recordTaxRuleCaEvidence)
  recordTaxRuleCaEvidence(
    @RouteInput() input: RouteInputOf<typeof routes.recordTaxRuleCaEvidence>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.routes.command(
      routes.recordTaxRuleCaEvidence,
      'finance.record-tax-rule-ca-evidence',
      user,
      input,
      (c, p) => this.taxRules.recordCaEvidence(c, p, input.body),
    );
  }
}

function pageOf(query: MasterPageQuery) {
  return { after: query.after, limit: query.limit === undefined ? undefined : Number(query.limit) };
}
