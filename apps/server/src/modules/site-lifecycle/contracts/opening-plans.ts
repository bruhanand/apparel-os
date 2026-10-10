import type { TransactionContext } from '../../../kernel/index.js';

/**
 * Whether a business unit has an approved, unpublished opening-data batch: the opening plan the stock-plan check
 * passes with (domain-model 3.6; imports-and-opening-data 10; PRD-LIF-003, PRD-LIF-004; DEC-117). Its approval and
 * scope are checked on their own, independently of activation, so neither waits on the other. `files-imports` keeps
 * the batches; the read is wired here with S1-F13-T01, and until then no plan counts (module-map 4.16 "As built").
 */
export interface OpeningPlans {
  approvedPlanFor(context: TransactionContext, businessUnitId: string, siteId: string): Promise<boolean>;
}
