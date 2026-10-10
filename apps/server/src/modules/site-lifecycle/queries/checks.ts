import type { Activity, PolicyNumber, ReadinessCheck } from '@apparel-os/schemas';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { permissionHolders, type RecordFacts } from '../../access/index.js';
import type { ConfigurationInterface } from '../../configuration/index.js';
import { unitBrandsOn } from '../../merchandise/catalogue/index.js';
import { unitLocationIds, type LocationInUse, type UnitReadinessAnswer } from '../../organisation/index.js';
import type { OpeningPlans } from '../contracts/opening-plans.js';
import { activation, readinessRecord, siteReadinessApproval, zeroStockDeclaration } from '../db/schema.js';
import { allPassed, judgeSiteReadiness, judgeUnitReadiness } from '../domain/checks.js';

// Asking each module's check (module-map 4.16 "Run readiness checks"; domain-model 3.6; PRD-LIF-001, PRD-LIF-002;
// S1-F04-T02): for a Site's shared readiness, `configuration` for the policies; for a unit, `organisation` for the
// mapping and the locations, `access` for the people, this module's own records for the Site's readiness, the stock
// ledger through the location-in-use contract with the opening plan and the zero declaration for the stock plan, and
// `merchandise` for the brand coverage.

export interface CheckDependencies {
  readonly configuration: Pick<ConfigurationInterface, 'operations' | 'policyMissing'>;
  /** Whether the stock ledger holds stock at a location: `organisation`'s contract, which `stock` implements. */
  readonly locationInUse: LocationInUse;
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

/** Whether the stock ledger holds stock at any location of the unit, retired or not (PRD-LIF-003; RR-483). */
export async function unitHoldsStock(
  context: TransactionContext,
  locationInUse: LocationInUse,
  unitId: string,
): Promise<boolean> {
  for (const locationId of await unitLocationIds(context, unitId)) {
    if (await locationInUse.hasStock(context, locationId)) return true;
  }
  return false;
}

/** The activation of a place and an activity: a Site's shared readiness with no unit, or a unit's. */
export async function activationAt(
  context: TransactionContext,
  place: { readonly siteId: string; readonly businessUnitId: string | null },
  activity: Activity,
) {
  const [row] = await context.tx
    .select({ id: activation.id })
    .from(activation)
    .where(
      and(
        eq(activation.siteId, place.siteId),
        place.businessUnitId === null
          ? isNull(activation.businessUnitId)
          : eq(activation.businessUnitId, place.businessUnitId),
        eq(activation.activity, activity),
      ),
    );
  return row?.id;
}

/** The latest run of an activation's checks. */
export async function latestRun(context: TransactionContext, activationId: string) {
  const [row] = await context.tx
    .select()
    .from(readinessRecord)
    .where(eq(readinessRecord.activationId, activationId))
    .orderBy(desc(readinessRecord.id))
    .limit(1);
  return row;
}

/** The approval of a Site's run, or undefined (PRD-LIF-001). */
export async function siteApprovalOf(context: TransactionContext, readinessRecordId: string) {
  const [row] = await context.tx
    .select()
    .from(siteReadinessApproval)
    .where(eq(siteReadinessApproval.readinessRecordId, readinessRecordId));
  return row;
}

/**
 * A Site's shared readiness for an activity (PRD-LIF-001; product owner, 10 Oct 2026): its latest run, and whether
 * that run is approved. A later run replaces an earlier one, so the Site is ready only while its latest run is.
 */
export async function siteReadinessOf(context: TransactionContext, siteId: string, activity: Activity) {
  const activationId = await activationAt(context, { siteId, businessUnitId: null }, activity);
  const latest = activationId === undefined ? undefined : await latestRun(context, activationId);
  const approved = latest !== undefined && latest.passed && (await siteApprovalOf(context, latest.id)) !== undefined;
  return { activationId, latest, approved };
}

/** The Site's shared checks for the activity, now: the required policies (devices with S1-F12-T02). */
export async function runSiteChecks(
  context: TransactionContext,
  dependencies: Pick<CheckDependencies, 'configuration'>,
  activity: Activity,
): Promise<ReadinessCheck[]> {
  const operations = dependencies.configuration.operations().filter((each) => each.activity === activity);
  const policies: {
    policy: PolicyNumber;
    missing: Awaited<ReturnType<CheckDependencies['configuration']['policyMissing']>>;
  }[] = [];
  for (const policy of [...new Set(operations.map((each) => each.policy))].sort((a, b) => a - b)) {
    policies.push({ policy, missing: await dependencies.configuration.policyMissing(context, policy) });
  }
  return judgeSiteReadiness(activity, { operationsDeclared: operations.length > 0, policies });
}

/**
 * Runs every check for the unit and the activity, today, and names the zero declaration its stock plan relied on,
 * which the approver approves with the run (RR-483). The Site's readiness is its latest run approved, with its shared
 * checks run again now.
 */
export async function runUnitChecks(
  context: TransactionContext,
  dependencies: CheckDependencies,
  unit: UnitReadinessAnswer,
  activity: Activity,
  today: string,
): Promise<{ checks: ReadinessCheck[]; zeroStockDeclarationId: string | null }> {
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
  const site = await siteReadinessOf(context, unit.siteId, activity);
  const sharedNow = site.approved ? await runSiteChecks(context, dependencies, activity) : [];
  const declaration = unit.kind === 'office' ? undefined : await latestZeroStock(context, unit.businessUnitId);
  const checks = judgeUnitReadiness(activity, {
    businessUnitId: unit.businessUnitId,
    siteId: unit.siteId,
    kind: unit.kind,
    mapping: unit.mapping.state,
    locationsInForce: unit.locationsInForce,
    permissions,
    approvals,
    site: {
      ready: site.approved,
      missing: allPassed(sharedNow) ? [] : sharedNow.flatMap((each) => each.missing),
    },
    openingPlanApproved:
      (await dependencies.openingPlans?.approvedPlanFor(context, unit.businessUnitId, unit.siteId)) === true,
    zeroStockDeclared: declaration !== undefined,
    stockHeld:
      declaration === undefined
        ? false
        : await unitHoldsStock(context, dependencies.locationInUse, unit.businessUnitId),
    brandsInForce: unit.kind === 'brand-counter' ? (await unitBrandsOn(context, unit.businessUnitId, today)).length : 0,
  });
  return { checks, zeroStockDeclarationId: declaration?.id ?? null };
}
