import {
  activitySchema,
  type Activity,
  type ReadinessRecord,
  type ReadinessRecordRead,
  type UnitReadiness,
} from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import type { TransactionContext } from '../../kernel/index.js';
import type { AccessInterface, RecordFacts } from '../access/index.js';
import type { AuditInterface } from '../audit/index.js';
import type { ConfigurationInterface } from '../configuration/index.js';
import type { LocationInUse } from '../organisation/index.js';
import {
  declareZeroStock,
  placeFactsOf,
  readinessRecordOf,
  refused,
  requestActivation,
  runReadiness,
  runSiteReadiness,
  siteFound,
  unitToday,
  type Actor,
  type Outcome,
  type ReadinessRow,
} from './commands/readiness.js';
import type { OpeningPlans } from './contracts/opening-plans.js';
import { zeroStockDeclaration } from './db/schema.js';
import { activationAt, latestRun, latestZeroStock, siteReadinessOf, unitFacts } from './queries/checks.js';

export interface SiteLifecycleDependencies {
  readonly audit: AuditInterface;
  readonly configuration: ConfigurationInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'approvalRequestsOf' | 'partyNames'>;
  /** Whether the stock ledger holds stock at a location: `organisation`'s contract, which `stock` implements. */
  readonly locationInUse: LocationInUse;
  /** The read of an approved opening plan, wired with S1-F13-T01; none counts while it is left out. */
  readonly openingPlans?: OpeningPlans | undefined;
}

/** A unit's readiness before the reader's names are filled in: people by identifier. */
type UnitReadinessRead = Omit<UnitReadiness, 'asOf'>;

/**
 * The stage 1 part of `site-lifecycle` (module-map 4.16; domain-model 3.6; PRD-LIF-001 to PRD-LIF-003; S1-F04-T02):
 * Run a Site's shared readiness checks and a business unit's, keeping the readiness record; declare a unit's zero
 * opening stock; ask for a Site's or an activity's approval, which a different person decides through `access` (its
 * effects are `siteLifecycleApprovals`); and read a unit's readiness and a readiness record. Every operation joins the
 * caller's transaction; the caller has authorised it with the place's facts.
 */
export class SiteLifecycle {
  constructor(private readonly dependencies: SiteLifecycleDependencies) {}

  /** The unit's place, for Authorise (access-and-approvals 5.3), or undefined when it does not exist. */
  async unitFacts(context: TransactionContext, unitId: string): Promise<RecordFacts | undefined> {
    const found = await unitToday(context, unitId);
    return found.kind === 'success' ? unitFacts(found.answer.unit) : undefined;
  }

  /** The Site's place, for Authorise, or undefined when it does not exist. */
  async siteFacts(context: TransactionContext, siteId: string): Promise<RecordFacts | undefined> {
    return (await siteFound(context, siteId)).kind === 'success' ? { siteId } : undefined;
  }

  /** The place of a readiness record's Site or unit, for Authorise, or undefined when there is no such record. */
  async recordFacts(context: TransactionContext, readinessRecordId: string): Promise<RecordFacts | undefined> {
    const record = await readinessRecordOf(context, readinessRecordId);
    return record === undefined ? undefined : placeFactsOf(context, record);
  }

  runReadiness(context: TransactionContext, by: Actor, unitId: string, activity: Activity) {
    return runReadiness(context, this.dependencies, by, unitId, activity);
  }

  runSiteReadiness(context: TransactionContext, by: Actor, siteId: string, activity: Activity) {
    return runSiteReadiness(context, this.dependencies, by, siteId, activity);
  }

  declareZeroStock(context: TransactionContext, by: Actor, unitId: string) {
    return declareZeroStock(context, this.dependencies, by, unitId);
  }

  requestActivation(context: TransactionContext, by: Actor, readinessRecordId: string) {
    return requestActivation(context, this.dependencies, by, readinessRecordId);
  }

  /**
   * A unit's readiness: for each activity, whether it is granted and its latest run with its approval request; its
   * Site's shared readiness, by activity; the unit's and its Site's state, Active once they hold a grant
   * (structure-and-masters 3.7 "As built").
   */
  async unitReadiness(context: TransactionContext, unitId: string): Promise<Outcome<UnitReadinessRead>> {
    const found = await unitToday(context, unitId);
    if (found.kind === 'refusal') return found;
    const { unit } = found.answer;
    const { configuration } = this.dependencies;
    const atSite = await configuration.grantedActivities(context, { siteId: unit.siteId });
    const atUnit = atSite.filter((each) => each.businessUnitId === unitId);
    const runs = [];
    const siteRuns = [];
    for (const each of activitySchema.options) {
      const id = await activationAt(context, { siteId: unit.siteId, businessUnitId: unitId }, each);
      runs.push({ activity: each, latest: id === undefined ? undefined : await latestRun(context, id) });
      const site = await siteReadinessOf(context, unit.siteId, each);
      siteRuns.push({ activity: each, latest: site.latest, ready: site.approved });
    }
    const latest = [...runs, ...siteRuns].flatMap((each) => (each.latest === undefined ? [] : [each.latest]));
    const declaration = await latestZeroStock(context, unitId);
    const views = await this.views(context, latest, declaration === undefined ? [] : [declaration.declaredByUserId]);
    const viewOf = (row: ReadinessRow | undefined) => (row === undefined ? null : (views.records.get(row.id) ?? null));
    return {
      kind: 'success',
      answer: {
        businessUnitId: unitId,
        siteId: unit.siteId,
        state: atUnit.length > 0 ? 'Active' : 'Setting up',
        siteState: atSite.length > 0 ? 'Active' : 'Setting up',
        activities: runs.map(({ activity: each, latest: row }) => ({
          activity: each,
          granted: atUnit.some((grant) => grant.activity === each),
          latest: viewOf(row),
        })),
        site: siteRuns.map(({ activity: each, latest: row, ready }) => ({
          activity: each,
          ready,
          latest: viewOf(row),
        })),
        zeroStockDeclaration:
          declaration === undefined
            ? null
            : {
                declaredBy: views.nameOf(declaration.declaredByUserId),
                declaredAt: declaration.declaredAt.toISOString(),
              },
      },
    };
  }

  /**
   * A readiness record as its approval panel shows it (access-and-approvals 9.3): the run, and the zero declaration its
   * stock plan relied on, which the approver approves with it (RR-483).
   */
  async readinessRecord(
    context: TransactionContext,
    readinessRecordId: string,
  ): Promise<Outcome<Omit<ReadinessRecordRead, 'asOf'>>> {
    const record = await readinessRecordOf(context, readinessRecordId);
    if (record === undefined) return refused('not-found', 'site-lifecycle.record-not-found');
    const [declaration] =
      record.zeroStockDeclarationId === null
        ? []
        : await context.tx
            .select()
            .from(zeroStockDeclaration)
            .where(eq(zeroStockDeclaration.id, record.zeroStockDeclarationId));
    const views = await this.views(context, [record], declaration === undefined ? [] : [declaration.declaredByUserId]);
    const view = views.records.get(record.id);
    if (view === undefined) throw new Error('The record was not read');
    return {
      kind: 'success',
      answer: {
        record: view,
        zeroStockDeclaration:
          declaration === undefined
            ? null
            : {
                declaredBy: views.nameOf(declaration.declaredByUserId),
                declaredAt: declaration.declaredAt.toISOString(),
              },
      },
    };
  }

  /** The runs as the screens read them, with their approval requests and the names of the people they name. */
  private async views(context: TransactionContext, rows: readonly ReadinessRow[], others: readonly string[]) {
    const { access } = this.dependencies;
    const requests = await access.approvalRequestsOf(
      context,
      rows.map((each) => each.id),
    );
    const names = await access.partyNames(
      context,
      [...new Set([...rows.map((each) => each.ranByUserId), ...others])],
      [],
    );
    const nameOf = (id: string) => names.users.get(id) ?? id;
    const records = new Map<string, ReadinessRecord>();
    for (const row of rows) {
      const request = requests.get(row.id);
      records.set(row.id, {
        readinessRecordId: row.id,
        businessUnitId: row.businessUnitId,
        siteId: row.siteId,
        activity: row.activity,
        passed: row.passed,
        ranBy: nameOf(row.ranByUserId),
        ranAt: row.ranAt.toISOString(),
        checks: row.checks,
        request: request === undefined ? null : { requestId: request.id, state: request.state },
      });
    }
    return { records, nameOf };
  }
}

export type SiteLifecycleInterface = SiteLifecycle;
