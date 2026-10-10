import type { TaxRuleKind } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import { TaxRulesMaintenance, type MaintainDependencies } from './commands/maintain.js';
import { taxRulePage, taxRuleRecord, taxRulesInForce, type PageRequest, type TaxRulesQuery } from './queries/read.js';

export interface TaxRulesDependencies extends MaintainDependencies {
  readonly access: Pick<AccessInterface, 'requestApproval' | 'approvalRequestsOf'>;
}

/**
 * The tax rules part's interface (module-map 4.14; shared-calculations 10; S1-F09-T04): Maintain tax rules (each kind's
 * versions and the CA's evidence) and Read tax rules, with each record and its version history. Every operation joins
 * the caller's transaction through its context (code-house-rules 8.1); the caller has authorised it.
 */
export class TaxRules extends TaxRulesMaintenance {
  private readonly readers: TaxRulesDependencies['access'];

  constructor(dependencies: TaxRulesDependencies) {
    super(dependencies);
    this.readers = dependencies.access;
  }

  private readonly requests = (context: TransactionContext) => (ids: readonly string[]) =>
    this.readers.approvalRequestsOf(context, ids);

  /** Read tax rules (10.2): the rules in force on the date, each with its version, or not set. */
  readTaxRules(context: TransactionContext, query: TaxRulesQuery) {
    return taxRulesInForce(context, query);
  }

  readRecord(context: TransactionContext, kind: TaxRuleKind, id: string, today: string) {
    return taxRuleRecord(context, kind, id, today, this.requests(context));
  }

  listRecords(context: TransactionContext, kind: TaxRuleKind, today: string, page: PageRequest = {}) {
    return taxRulePage(context, kind, page, today, this.requests(context));
  }
}

export type TaxRulesInterface = TaxRules;
