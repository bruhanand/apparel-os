import { uuidv7 } from '@apparel-os/domain';
import {
  ACTIVITY_APPROVAL,
  READINESS_RECORD_TYPE,
  type Activity,
  type MissingItem,
  type ReadinessCheck,
} from '@apparel-os/schemas';
import { and, desc, eq } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { ConfigurationInterface } from '../../configuration/index.js';
import { unitReadiness, type UnitReadinessAnswer } from '../../organisation/index.js';
import { activation, readinessRecord, zeroStockDeclaration } from '../db/schema.js';
import { allPassed, failingItems } from '../domain/checks.js';
import { runChecks, unitFacts, type CheckDependencies } from '../queries/checks.js';

// Run readiness checks, declare zero opening stock and request an activity's approval (module-map 4.16; domain-model
// 3.6, section 5; PRD-LIF-001 to PRD-LIF-003; MM-8, DEC-105; DEC-116, DEC-117; S1-F04-T02). Setup operations: not
// policy-gated (DEC-116), but each needs its permission, which the caller authorised with the unit's facts and holds.

/** The person acting, and the role assignment Authorise used (access-and-approvals 7.1 step 3). */
export interface Actor {
  readonly userId: string;
  readonly roleAssignmentId: string;
}

export type Outcome<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

export interface ReadinessDependencies extends CheckDependencies {
  readonly audit: AuditInterface;
  readonly configuration: CheckDependencies['configuration'] & Pick<ConfigurationInterface, 'grantedActivities'>;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
}

export function refused<Answer>(
  kind: CommandRefusal['kind'],
  code: string,
  missing: MissingItem[] = [],
): Outcome<Answer> {
  return { kind: 'refusal', refusal: { kind, code, missing } };
}

/** Today under the Organisation's timezone, or the refusal while it has none (code-house-rules 9). */
export async function today(context: TransactionContext): Promise<string | CommandRefusal> {
  const date = await context.businessDate();
  if (date.kind === 'set') return date.date;
  return {
    kind: 'unavailable',
    code: 'access.business-date-not-set',
    missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
  };
}

const unitMissing = (unitId: string): MissingItem => ({
  kind: 'record',
  recordType: 'organisation.business_unit',
  recordId: unitId,
});

/** The unit today, or the refusal naming it. */
export async function unitToday(
  context: TransactionContext,
  unitId: string,
): Promise<Outcome<{ unit: UnitReadinessAnswer; today: string }>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const unit = await unitReadiness(context, unitId, date);
  if (unit === undefined) return refused('not-found', 'site-lifecycle.unit-not-found', [unitMissing(unitId)]);
  return { kind: 'success', answer: { unit, today: date } };
}

/** The activation of the unit and the activity, written with its first run (PRD-LIF-001). */
async function activationOf(context: TransactionContext, unit: UnitReadinessAnswer, activity: Activity) {
  await context.tx
    .insert(activation)
    .values({ id: uuidv7(), businessUnitId: unit.businessUnitId, siteId: unit.siteId, activity })
    .onConflictDoNothing();
  const [row] = await context.tx
    .select({ id: activation.id })
    .from(activation)
    .where(and(eq(activation.businessUnitId, unit.businessUnitId), eq(activation.activity, activity)));
  if (row === undefined) throw new Error('The activation was not written');
  return row.id;
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

async function audited(
  context: TransactionContext,
  audit: AuditInterface,
  by: Actor,
  record: { readonly type: string; readonly id: string; readonly versionId?: string },
  operation: string,
  changes: Record<string, string | boolean | string[]>,
): Promise<void> {
  await audit.record(context, {
    actor: { kind: 'user', id: by.userId },
    roleAssignmentId: by.roleAssignmentId,
    record: { module: 'site-lifecycle', ...record },
    operation,
    changes: Object.entries(changes).map(([field, after]) => ({ kind: 'value' as const, field, before: null, after })),
    source: { kind: 'screen' },
  });
}

/**
 * Run readiness checks (module-map 4.16; PRD-LIF-002): asks each module's check for the unit and the activity, and
 * keeps the readiness record of what was verified, when and by whom, whether every check passed or not.
 */
export async function runReadiness(
  context: TransactionContext,
  dependencies: ReadinessDependencies,
  by: Actor,
  unitId: string,
  activity: Activity,
): Promise<Outcome<{ readinessRecordId: string; passed: boolean }>> {
  const found = await unitToday(context, unitId);
  if (found.kind === 'refusal') return found;
  const { unit } = found.answer;
  const checks: ReadinessCheck[] = await runChecks(context, dependencies, unit, activity, found.answer.today);
  const passed = allPassed(checks);
  const activationId = await activationOf(context, unit, activity);
  const readinessRecordId = uuidv7();
  await context.tx.insert(readinessRecord).values({
    id: readinessRecordId,
    activationId,
    businessUnitId: unit.businessUnitId,
    siteId: unit.siteId,
    activity,
    passed,
    checks,
    ranByUserId: by.userId,
    roleAssignmentId: by.roleAssignmentId,
    ranAt: context.startedAt,
  });
  await audited(
    context,
    dependencies.audit,
    by,
    { type: 'readiness_record', id: activationId, versionId: readinessRecordId },
    'run-readiness-checks',
    {
      businessUnitId: unit.businessUnitId,
      activity,
      passed,
      checks: checks.map((each) => `${each.check}:${each.state}`),
    },
  );
  return { kind: 'success', answer: { readinessRecordId, passed } };
}

/** Declare that the unit genuinely holds no stock (PRD-LIF-003; DEC-117). An office unit needs no stock plan. */
export async function declareZeroStock(
  context: TransactionContext,
  dependencies: Pick<ReadinessDependencies, 'audit'>,
  by: Actor,
  unitId: string,
): Promise<Outcome<{ declarationId: string }>> {
  const found = await unitToday(context, unitId);
  if (found.kind === 'refusal') return found;
  const declarationId = uuidv7();
  await context.tx.insert(zeroStockDeclaration).values({
    id: declarationId,
    businessUnitId: unitId,
    siteId: found.answer.unit.siteId,
    declaredByUserId: by.userId,
    roleAssignmentId: by.roleAssignmentId,
    declaredAt: context.startedAt,
  });
  await audited(
    context,
    dependencies.audit,
    by,
    { type: 'zero_stock_declaration', id: declarationId },
    'declare-zero-stock',
    { businessUnitId: unitId, holdsNoStock: true },
  );
  return { kind: 'success', answer: { declarationId } };
}

/** A readiness record by its identifier. */
export async function readinessRecordOf(context: TransactionContext, readinessRecordId: string) {
  const [row] = await context.tx.select().from(readinessRecord).where(eq(readinessRecord.id, readinessRecordId));
  return row;
}

/**
 * Ask for an activity's approval (module-map 4.16 "Approve an activity"; PRD-LIF-001): on the latest run of the
 * checks, which passed, for a unit that does not hold the activity yet. The request binds to that readiness record;
 * its preparers are the person who ran the checks and the one asking, so a different person approves (MM-8, DEC-105).
 */
export async function requestActivation(
  context: TransactionContext,
  dependencies: ReadinessDependencies,
  by: Actor,
  readinessRecordId: string,
): Promise<Outcome<{ readinessRecordId: string; requestId: string }>> {
  const record = await readinessRecordOf(context, readinessRecordId);
  if (record === undefined) {
    return refused('not-found', 'site-lifecycle.record-not-found', [
      { kind: 'record', recordType: READINESS_RECORD_TYPE, recordId: readinessRecordId },
    ]);
  }
  const found = await unitToday(context, record.businessUnitId);
  if (found.kind === 'refusal') return found;
  const blocked = await activationBlocked(context, dependencies, record);
  if (blocked !== undefined) return { kind: 'refusal', refusal: blocked };
  if (!record.passed) {
    return refused('refused', 'site-lifecycle.check-failed', failingItems(record.checks));
  }
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: ACTIVITY_APPROVAL,
    document: {
      module: 'site-lifecycle',
      recordType: READINESS_RECORD_TYPE,
      recordId: record.activationId,
      versionId: record.id,
    },
    value: { kind: 'none' },
    preparers: [record.ranByUserId, by.userId],
    requestedBy: by,
    facts: unitFacts(found.answer.unit),
  });
  await audited(
    context,
    dependencies.audit,
    by,
    { type: 'readiness_record', id: record.activationId, versionId: record.id },
    'request-activation',
    { activity: record.activity, requestId },
  );
  return { kind: 'success', answer: { readinessRecordId: record.id, requestId } };
}

/**
 * Why a readiness record can no longer bind an activation, or undefined: a later run replaced it, or the unit holds
 * the activity already.
 */
export async function activationBlocked(
  context: TransactionContext,
  dependencies: Pick<ReadinessDependencies, 'configuration'>,
  record: {
    readonly id: string;
    readonly activationId: string;
    readonly siteId: string;
    readonly businessUnitId: string;
    readonly activity: Activity;
  },
): Promise<CommandRefusal | undefined> {
  const latest = await latestRun(context, record.activationId);
  if (latest?.id !== record.id) {
    return {
      kind: 'conflict',
      code: 'kernel.stale-version',
      missing: [{ kind: 'record', recordType: READINESS_RECORD_TYPE, recordId: latest?.id ?? record.id }],
    };
  }
  const granted = await dependencies.configuration.grantedActivities(context, {
    siteId: record.siteId,
    businessUnitId: record.businessUnitId,
  });
  if (granted.some((each) => each.activity === record.activity)) {
    return {
      kind: 'refused',
      code: 'site-lifecycle.activity-already-granted',
      missing: [
        { kind: 'activity', activity: record.activity, placeType: 'business-unit', placeId: record.businessUnitId },
      ],
    };
  }
  return undefined;
}
