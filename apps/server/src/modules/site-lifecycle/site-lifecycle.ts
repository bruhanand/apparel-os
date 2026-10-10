import { activitySchema, type Activity, type UnitReadiness } from '@apparel-os/schemas';
import { and, eq } from 'drizzle-orm';
import type { TransactionContext } from '../../kernel/index.js';
import type { AccessInterface, RecordFacts } from '../access/index.js';
import type { AuditInterface } from '../audit/index.js';
import type { ConfigurationInterface } from '../configuration/index.js';
import {
  declareZeroStock,
  latestRun,
  readinessRecordOf,
  requestActivation,
  runReadiness,
  unitToday,
  type Actor,
  type Outcome,
} from './commands/readiness.js';
import type { OpeningPlans } from './contracts/opening-plans.js';
import { activation } from './db/schema.js';
import { latestZeroStock, unitFacts } from './queries/checks.js';

export interface SiteLifecycleDependencies {
  readonly audit: AuditInterface;
  readonly configuration: ConfigurationInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'approvalRequestsOf' | 'partyNames'>;
  /** The read of an approved opening plan, wired with S1-F13-T01; none counts while it is left out. */
  readonly openingPlans?: OpeningPlans | undefined;
}

/** A unit's readiness before the reader's names are filled in: people by identifier. */
type UnitReadinessRead = Omit<UnitReadiness, 'asOf'>;

/**
 * The stage 1 part of `site-lifecycle` (module-map 4.16; domain-model 3.6; PRD-LIF-001 to PRD-LIF-003; S1-F04-T02):
 * Run readiness checks for a business unit and an activity, keeping the readiness record; declare a unit's zero
 * opening stock; ask for an activity's approval, which a different person decides through `access` (its effect is
 * `siteLifecycleApprovals`); and read a unit's readiness. Every operation joins the caller's transaction; the caller
 * has authorised it with the unit's facts.
 */
export class SiteLifecycle {
  constructor(private readonly dependencies: SiteLifecycleDependencies) {}

  /** The unit's place, for Authorise (access-and-approvals 5.3), or undefined when it does not exist. */
  async unitFacts(context: TransactionContext, unitId: string): Promise<RecordFacts | undefined> {
    const found = await unitToday(context, unitId);
    return found.kind === 'success' ? unitFacts(found.answer.unit) : undefined;
  }

  /** The place of a readiness record's unit, for Authorise, or undefined when there is no such record. */
  async recordFacts(context: TransactionContext, readinessRecordId: string): Promise<RecordFacts | undefined> {
    const record = await readinessRecordOf(context, readinessRecordId);
    return record === undefined ? undefined : this.unitFacts(context, record.businessUnitId);
  }

  runReadiness(context: TransactionContext, by: Actor, unitId: string, activity: Activity) {
    return runReadiness(context, this.dependencies, by, unitId, activity);
  }

  declareZeroStock(context: TransactionContext, by: Actor, unitId: string) {
    return declareZeroStock(context, this.dependencies, by, unitId);
  }

  requestActivation(context: TransactionContext, by: Actor, readinessRecordId: string) {
    return requestActivation(context, this.dependencies, by, readinessRecordId);
  }

  /**
   * A unit's readiness: for each activity, whether it is granted and its latest run with its activation request;
   * the unit's and its Site's state, Active once they hold a grant (structure-and-masters 3.7 "As built").
   */
  async unitReadiness(context: TransactionContext, unitId: string): Promise<Outcome<UnitReadinessRead>> {
    const found = await unitToday(context, unitId);
    if (found.kind === 'refusal') return found;
    const { unit } = found.answer;
    const { configuration, access } = this.dependencies;
    const atSite = await configuration.grantedActivities(context, { siteId: unit.siteId });
    const atUnit = atSite.filter((each) => each.businessUnitId === unitId);
    const runs = [];
    for (const each of activitySchema.options) {
      const [row] = await context.tx
        .select({ id: activation.id })
        .from(activation)
        .where(and(eq(activation.businessUnitId, unitId), eq(activation.activity, each)));
      runs.push({ activity: each, latest: row === undefined ? undefined : await latestRun(context, row.id) });
    }
    const recordIds = runs.flatMap((each) => (each.latest === undefined ? [] : [each.latest.id]));
    const requests = await access.approvalRequestsOf(context, recordIds);
    const declaration = await latestZeroStock(context, unitId);
    const userIds = [
      ...runs.flatMap((each) => (each.latest === undefined ? [] : [each.latest.ranByUserId])),
      ...(declaration === undefined ? [] : [declaration.declaredByUserId]),
    ];
    const names = await access.partyNames(context, [...new Set(userIds)], []);
    const nameOf = (id: string) => names.users.get(id) ?? id;
    return {
      kind: 'success',
      answer: {
        businessUnitId: unitId,
        siteId: unit.siteId,
        state: atUnit.length > 0 ? 'Active' : 'Setting up',
        siteState: atSite.length > 0 ? 'Active' : 'Setting up',
        activities: runs.map(({ activity: each, latest }) => {
          const request = latest === undefined ? undefined : requests.get(latest.id);
          return {
            activity: each,
            granted: atUnit.some((grant) => grant.activity === each),
            latest:
              latest === undefined
                ? null
                : {
                    readinessRecordId: latest.id,
                    businessUnitId: latest.businessUnitId,
                    siteId: latest.siteId,
                    activity: latest.activity,
                    passed: latest.passed,
                    ranBy: nameOf(latest.ranByUserId),
                    ranAt: latest.ranAt.toISOString(),
                    checks: latest.checks,
                    request: request === undefined ? null : { requestId: request.id, state: request.state },
                  },
          };
        }),
        zeroStockDeclaration:
          declaration === undefined
            ? null
            : { declaredBy: nameOf(declaration.declaredByUserId), declaredAt: declaration.declaredAt.toISOString() },
      },
    };
  }
}

export type SiteLifecycleInterface = SiteLifecycle;
