import type { Activity, PolicyNumber, ReadinessCheck } from '@apparel-os/schemas';
import { desc, eq } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { permissionHolders, type RecordFacts } from '../../access/index.js';
import type { ConfigurationInterface } from '../../configuration/index.js';
import { unitBrandsOn } from '../../merchandise/catalogue/index.js';
import type { UnitReadinessAnswer } from '../../organisation/index.js';
import type { OpeningPlans } from '../contracts/opening-plans.js';
import { zeroStockDeclaration } from '../db/schema.js';
import { judgeReadiness } from '../domain/checks.js';

// Asking each module's check (module-map 4.16 "Run readiness checks"; domain-model 3.6; PRD-LIF-002; S1-F04-T02):
// `organisation` for the mapping and the locations, `access` for the people, `configuration` for the policies,
// `merchandise` for the brand coverage, and this module's own records, with the opening plan, for the stock plan.

export interface CheckDependencies {
  readonly configuration: Pick<ConfigurationInterface, 'operations' | 'policyMissing'>;
  /** Where an approved, unpublished opening-data batch is read; none is yet, so none counts (S1-F13-T01). */
  readonly openingPlans?: OpeningPlans | undefined;
}

/** The unit's place, as its records carry it for Authorise and for who holds a permission there (5.3). */
export function unitFacts(unit: UnitReadinessAnswer): RecordFacts {
  return {
    siteId: unit.siteId,
    businessUnitId: unit.businessUnitId,
    ...(unit.storeId === null ? {} : { storeId: unit.storeId }),
    ...(unit.mapping.state === 'none' ? {} : { legalEntityId: unit.mapping.legalEntityId }),
  };
}

/** The latest zero-stock declaration of the unit, or undefined (PRD-LIF-003). */
export async function latestZeroStock(context: TransactionContext, unitId: string) {
  const [row] = await context.tx
    .select()
    .from(zeroStockDeclaration)
    .where(eq(zeroStockDeclaration.businessUnitId, unitId))
    .orderBy(desc(zeroStockDeclaration.id))
    .limit(1);
  return row;
}

/** Runs every check for the unit and the activity, today. */
export async function runChecks(
  context: TransactionContext,
  dependencies: CheckDependencies,
  unit: UnitReadinessAnswer,
  activity: Activity,
  today: string,
): Promise<ReadinessCheck[]> {
  const operations = dependencies.configuration.operations().filter((each) => each.activity === activity);
  const facts = unitFacts(unit);
  const permissions = [];
  const approvals = [];
  for (const operation of operations) {
    for (const need of operation.needs?.permissions ?? []) {
      permissions.push({ ...need, holders: await permissionHolders(context, need, facts) });
    }
    for (const approval of operation.needs?.approvals ?? []) {
      approvals.push({
        actionType: approval.actionType,
        preparers: await permissionHolders(context, approval.prepare, facts),
        approvers: await permissionHolders(
          context,
          { action: 'approve', recordType: approval.approveRecordType },
          facts,
        ),
      });
    }
  }
  const policies: {
    policy: PolicyNumber;
    missing: Awaited<ReturnType<CheckDependencies['configuration']['policyMissing']>>;
  }[] = [];
  for (const policy of [...new Set(operations.map((each) => each.policy))].sort((a, b) => a - b)) {
    policies.push({ policy, missing: await dependencies.configuration.policyMissing(context, policy) });
  }
  return judgeReadiness(activity, {
    businessUnitId: unit.businessUnitId,
    kind: unit.kind,
    mapping: unit.mapping.state,
    locationsInForce: unit.locationsInForce,
    operationsDeclared: operations.length > 0,
    permissions,
    approvals,
    policies,
    openingPlanApproved:
      (await dependencies.openingPlans?.approvedPlanFor(context, unit.businessUnitId, unit.siteId)) === true,
    zeroStockDeclared: (await latestZeroStock(context, unit.businessUnitId)) !== undefined,
    brandsInForce: unit.kind === 'brand-counter' ? (await unitBrandsOn(context, unit.businessUnitId, today)).length : 0,
  });
}
