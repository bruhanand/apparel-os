import { uuidv7 } from '@apparel-os/domain';
import {
  ACTIVITY_APPROVAL,
  READINESS_RECORD_TYPE,
  SITE_READINESS_APPROVAL,
  type Activity,
  type MissingItem,
  type ReadinessCheck,
} from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface, RecordFacts } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { ConfigurationInterface, ConfigurationOutcome, Recorder } from '../../configuration/index.js';
import { siteExists, unitReadiness, type UnitReadinessAnswer } from '../../organisation/index.js';
import { activation, readinessRecord, zeroStockDeclaration } from '../db/schema.js';
import { allPassed, failingItems } from '../domain/checks.js';
import {
  activationAt,
  latestRun,
  runSiteChecks,
  runUnitChecks,
  siteApprovalOf,
  unitFacts,
  unitHoldsStock,
  type CheckDependencies,
} from '../queries/checks.js';

// Run readiness checks for a Site's shared readiness and for a business unit, declare zero opening stock, and ask for
// a Site's or a unit's approval (module-map 4.16; domain-model 3.6, section 5; PRD-LIF-001 to PRD-LIF-003; MM-8,
// DEC-105; DEC-116, DEC-117; S1-F04-T02; product owner, 10 Oct 2026). Setup operations: not policy-gated (DEC-116),
// but each needs its permission, which the caller authorised with the place's facts and holds.

/** The person acting, and the role assignment Authorise used (access-and-approvals 7.1 step 3). */
export type Actor = Recorder;
/** A command's answer or its refusal: the one shape `configuration` and `site-lifecycle` share (S1-F04 review J1). */
export type Outcome<Answer> = ConfigurationOutcome<Answer>;

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

/** The Site, or the refusal naming it. */
export async function siteFound(context: TransactionContext, siteId: string): Promise<Outcome<{ siteId: string }>> {
  if (await siteExists(context, siteId)) return { kind: 'success', answer: { siteId } };
  return refused('not-found', 'site-lifecycle.site-not-found', [
    { kind: 'record', recordType: 'organisation.site', recordId: siteId },
  ]);
}

/** The activation of the place and the activity, written with its first run at the command's clock (PRD-LIF-001). */
async function activationOf(
  context: TransactionContext,
  place: { readonly siteId: string; readonly businessUnitId: string | null },
  activity: Activity,
) {
  await context.tx
    .insert(activation)
    .values({ id: uuidv7(), ...place, activity, recordedAt: context.startedAt })
    .onConflictDoNothing();
  const id = await activationAt(context, place, activity);
  if (id === undefined) throw new Error('The activation was not written');
  return id;
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

/** Keeps one run: what each check found, when and by whom (PRD-LIF-002), with its audit record. */
async function keepRun(
  context: TransactionContext,
  audit: AuditInterface,
  by: Actor,
  place: { readonly siteId: string; readonly businessUnitId: string | null },
  activity: Activity,
  checks: ReadinessCheck[],
  zeroStockDeclarationId: string | null,
): Promise<{ readinessRecordId: string; passed: boolean }> {
  const passed = allPassed(checks);
  const activationId = await activationOf(context, place, activity);
  const readinessRecordId = uuidv7();
  await context.tx.insert(readinessRecord).values({
    id: readinessRecordId,
    activationId,
    businessUnitId: place.businessUnitId,
    siteId: place.siteId,
    activity,
    passed,
    checks,
    zeroStockDeclarationId,
    ranByUserId: by.userId,
    roleAssignmentId: by.roleAssignmentId,
    ranAt: context.startedAt,
  });
  await audited(
    context,
    audit,
    by,
    { type: 'readiness_record', id: activationId, versionId: readinessRecordId },
    'run-readiness-checks',
    {
      siteId: place.siteId,
      ...(place.businessUnitId === null ? {} : { businessUnitId: place.businessUnitId }),
      activity,
      passed,
      checks: checks.map((each) => `${each.check}:${each.state}`),
    },
  );
  return { readinessRecordId, passed };
}

/**
 * Run a Site's shared readiness checks for an activity (module-map 4.16; PRD-LIF-001, PRD-LIF-002): the required
 * policies, kept as the Site's readiness record whether they passed or not. A later run replaces an earlier one, so a
 * Site made ready is ready again only once its new run is approved.
 */
export async function runSiteReadiness(
  context: TransactionContext,
  dependencies: ReadinessDependencies,
  by: Actor,
  siteId: string,
  activity: Activity,
): Promise<Outcome<{ readinessRecordId: string; passed: boolean }>> {
  const found = await siteFound(context, siteId);
  if (found.kind === 'refusal') return found;
  const checks = await runSiteChecks(context, dependencies, activity);
  const answer = await keepRun(
    context,
    dependencies.audit,
    by,
    { siteId, businessUnitId: null },
    activity,
    checks,
    null,
  );
  return { kind: 'success', answer };
}

/**
 * Run readiness checks for a business unit (module-map 4.16; PRD-LIF-002): asks each module's check for the unit and
 * the activity, and that its Site is ready, and keeps the readiness record of what was verified, when and by whom,
 * whether every check passed or not.
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
  const { checks, zeroStockDeclarationId } = await runUnitChecks(
    context,
    dependencies,
    unit,
    activity,
    found.answer.today,
  );
  const answer = await keepRun(
    context,
    dependencies.audit,
    by,
    { siteId: unit.siteId, businessUnitId: unit.businessUnitId },
    activity,
    checks,
    zeroStockDeclarationId,
  );
  return { kind: 'success', answer };
}

/**
 * Declare that the unit genuinely holds no stock (PRD-LIF-003; DEC-117): refused while the stock ledger holds stock at
 * any of its locations (RR-483; product owner, 10 Oct 2026). It is never withdrawn; a later one replaces it, and the
 * activity's approver approves it with the run that relies on it. An office unit needs no stock plan.
 */
export async function declareZeroStock(
  context: TransactionContext,
  dependencies: Pick<ReadinessDependencies, 'audit' | 'locationInUse'>,
  by: Actor,
  unitId: string,
): Promise<Outcome<{ declarationId: string }>> {
  const found = await unitToday(context, unitId);
  if (found.kind === 'refusal') return found;
  if (await unitHoldsStock(context, dependencies.locationInUse, unitId)) {
    return refused('refused', 'site-lifecycle.unit-holds-stock', [{ kind: 'stock-held', businessUnitId: unitId }]);
  }
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

/** A readiness record, as the commands read it. */
export type ReadinessRow = NonNullable<Awaited<ReturnType<typeof readinessRecordOf>>>;

/** The place of a readiness record, for Authorise: its Site's, or its unit's (access-and-approvals 5.3). */
export async function placeFactsOf(
  context: TransactionContext,
  record: ReadinessRow,
): Promise<RecordFacts | undefined> {
  if (record.businessUnitId === null) return { siteId: record.siteId };
  const found = await unitToday(context, record.businessUnitId);
  return found.kind === 'success' ? unitFacts(found.answer.unit) : undefined;
}

/**
 * Ask for approval (module-map 4.16 "Approve an activity"; PRD-LIF-001): of a Site's shared readiness, or of an
 * activity for a unit, on the latest run of the checks, which passed. The request binds to that readiness record; its
 * preparers are the person who ran the checks and the one asking, so a different person approves (MM-8, DEC-105).
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
  const facts = await placeFactsOf(context, record);
  if (facts === undefined) return refused('not-found', 'site-lifecycle.unit-not-found');
  const blocked = await activationBlocked(context, dependencies, record);
  if (blocked !== undefined) return { kind: 'refusal', refusal: blocked };
  if (!record.passed) return refused('refused', 'site-lifecycle.check-failed', failingItems(record.checks));
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: record.businessUnitId === null ? SITE_READINESS_APPROVAL : ACTIVITY_APPROVAL,
    document: {
      module: 'site-lifecycle',
      recordType: READINESS_RECORD_TYPE,
      recordId: record.activationId,
      versionId: record.id,
    },
    value: { kind: 'none' },
    preparers: [record.ranByUserId, by.userId],
    requestedBy: by,
    facts,
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
 * Why a readiness record can no longer bind an approval, or undefined: a later run replaced it; the Site's run is
 * approved already; or the unit holds the activity already.
 */
export async function activationBlocked(
  context: TransactionContext,
  dependencies: Pick<ReadinessDependencies, 'configuration'>,
  record: ReadinessRow,
): Promise<CommandRefusal | undefined> {
  const latest = await latestRun(context, record.activationId);
  if (latest?.id !== record.id) {
    return {
      kind: 'conflict',
      code: 'kernel.stale-version',
      missing: [{ kind: 'record', recordType: READINESS_RECORD_TYPE, recordId: latest?.id ?? record.id }],
    };
  }
  if (record.businessUnitId === null) {
    if ((await siteApprovalOf(context, record.id)) === undefined) return undefined;
    return {
      kind: 'refused',
      code: 'site-lifecycle.site-already-ready',
      missing: [{ kind: 'site-readiness', siteId: record.siteId, activity: record.activity }],
    };
  }
  const unitId = record.businessUnitId;
  const granted = await dependencies.configuration.grantedActivities(context, {
    siteId: record.siteId,
    businessUnitId: unitId,
  });
  if (granted.some((each) => each.activity === record.activity)) {
    return {
      kind: 'refused',
      code: 'site-lifecycle.activity-already-granted',
      missing: [{ kind: 'activity', activity: record.activity, placeType: 'business-unit', placeId: unitId }],
    };
  }
  return undefined;
}
