import { uuidv7 } from '@apparel-os/domain';
import {
  STORE_UNIT_KINDS,
  type BillingDeviceDraft,
  type DeviceEnrolled,
  type DevicePublicKey,
  type MissingItem,
} from '@apparel-os/schemas';
import { asc, eq, inArray } from 'drizzle-orm';
import { LOCK_STEP, lockTable, type CommandRefusal, type TransactionContext } from '../../../kernel/index.js';
import { freshCodeRefusal, takeFreshCode, type AccessInterface, type RecordFacts } from '../../access/index.js';
import type { AuditInterface, AuditScope } from '../../audit/index.js';
import type { NumberingInterface } from '../../numbering/index.js';
import { businessUnitHeads, businessUnitInForce, type OrganisationInterface } from '../../organisation/index.js';
import { billingDevice, billingDeviceUnit } from '../db/schema.js';
import { BILLING_DEVICE_TYPE } from '../domain/kinds.js';
import { deviceEnrolled, deviceRegistered } from '../events.js';
import { defineDeviceSeries, type SeriesOutcome } from './series.js';

// Register and enrol a billing device (offline-counter 3.1, 3.2, 4.1, 12.1; module-map 4.17; PRD-OFF-002,
// PRD-OFF-010, PRD-POS-020, PRD-ORG-005, PRD-ACS-013, PRD-SEC-007, PRD-INT-004; POL-02.03; DEC-116, DEC-117;
// S1-F12-T01). The route has authorised the action with the Store's facts and held the actor's authority at step 0.

export const BILLING_DEVICE = lockTable('pos', 'billing_device');

export interface PosDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<
    AccessInterface,
    | 'authorise'
    | 'authoriseEach'
    | 'holdAuthority'
    | 'registerDevice'
    | 'deviceLockTarget'
    | 'enrolDevice'
    | 'endDevice'
    | 'devices'
    | 'checkFreshCode'
  >;
  readonly organisation: Pick<OrganisationInterface, 'placeFacts' | 'placeFactsOf'>;
  readonly numbering: NumberingInterface;
}

/** Who acts: the user, the assignment Authorise used, and where from (numbering-and-audit 4.1, 5.2). */
export interface Actor {
  readonly userId: string;
  readonly roleAssignmentId: string;
  readonly networkAddress: string;
}

export type Outcome<T> = SeriesOutcome<T>;

export function refused(kind: CommandRefusal['kind'], code: string, missing: MissingItem[] = []): Outcome<never> {
  return { kind: 'refusal', refusal: { kind, code, missing } };
}

/** The scope facts of a place, as the audit and access records carry them (numbering-and-audit 4.1). */
export function scopeOf(facts: RecordFacts): AuditScope {
  return {
    ...(facts.siteId === undefined ? {} : { siteId: facts.siteId }),
    ...(facts.storeId === undefined ? {} : { storeId: facts.storeId }),
  };
}

/** The Store's facts on the date, or undefined when no Store has the identifier (access-and-approvals 5.3). */
export async function storeFacts(
  context: TransactionContext,
  organisation: PosDependencies['organisation'],
  storeId: string,
  date: string,
): Promise<RecordFacts | undefined> {
  const facts = await organisation.placeFacts(context, 'store', storeId, date);
  return facts.storeId === undefined ? undefined : facts;
}

/** A billing device's Store, or undefined when `pos` holds no billing device of that identifier. */
export async function deviceStore(context: TransactionContext, deviceId: string): Promise<string | undefined> {
  const [row] = await context.tx
    .select({ storeId: billingDevice.storeId })
    .from(billingDevice)
    .where(eq(billingDevice.id, deviceId));
  return row?.storeId;
}

/**
 * Refuses a list of units a device of the Store cannot bill for on the date (offline-counter 3.1; PRD-ORG-005): a unit
 * listed twice, or one that is not a whole-store or brand-counter unit of the Store in force on the date, named.
 */
export async function unitsRefusal(
  context: TransactionContext,
  storeId: string,
  unitIds: readonly string[],
  date: string,
): Promise<Outcome<never> | undefined> {
  if (new Set(unitIds).size !== unitIds.length) return refused('refused', 'pos.unit-listed-twice');
  const heads = await businessUnitHeads(context, unitIds);
  const notOfStore: MissingItem[] = [];
  for (const unitId of unitIds) {
    const head = heads.get(unitId);
    const fits =
      head !== undefined &&
      STORE_UNIT_KINDS.includes(head.kind) &&
      head.storeId === storeId &&
      (await businessUnitInForce(context, unitId, date));
    // Named by its code where the unit exists, so the screen says which (PRD-UXP-003).
    if (!fits)
      notOfStore.push({ kind: 'business-unit', id: unitId, ...(head === undefined ? {} : { code: head.code }) });
  }
  return notOfStore.length > 0 ? refused('refused', 'pos.unit-not-of-store', notOfStore) : undefined;
}

/**
 * Register a billing device (offline-counter 3.2 step 1; 12.1): Setting up, for a Store and its units from today. Each
 * unit must be a whole-store or brand-counter unit of that Store, in force today: a unit of another Store, an office or
 * a warehouse is refused, naming it (3.1; PRD-ORG-005). The code is unique in the Organisation (`access`). Registration
 * writes its audit record here and its access record in `access`, and publishes `pos.device-registered`, all in this
 * transaction (PRD-ACS-013, PRD-SEC-007, PRD-INT-004). No independent approval (POL-02.07; 3.2).
 */
export async function registerBillingDevice(
  context: TransactionContext,
  dependencies: PosDependencies,
  by: Actor,
  facts: RecordFacts,
  draft: BillingDeviceDraft,
  today: string,
  /** The device a replacement replaces (3.5; S1-F12-T02). */
  replacesDeviceId?: string,
): Promise<Outcome<{ readonly deviceId: string; readonly state: 'Setting up' }>> {
  const unitsRefused = await unitsRefusal(context, draft.storeId, draft.businessUnitIds, today);
  if (unitsRefused !== undefined) return unitsRefused;
  const scope = scopeOf(facts);
  const registered = await dependencies.access.registerDevice(
    context,
    { userId: by.userId, networkAddress: by.networkAddress, scope },
    { code: draft.code, label: draft.label },
  );
  if (registered.kind === 'refusal') return registered;
  const { deviceId } = registered.answer;
  await context.tx.insert(billingDevice).values({
    id: deviceId,
    storeId: draft.storeId,
    registeredByUserId: by.userId,
    roleAssignmentId: by.roleAssignmentId,
    registeredAt: context.startedAt,
    replacesDeviceId: replacesDeviceId ?? null,
  });
  await context.tx.insert(billingDeviceUnit).values(
    [...draft.businessUnitIds].sort().map((businessUnitId) => ({
      id: uuidv7(),
      billingDeviceId: deviceId,
      businessUnitId,
      validDuring: `[${today},)`,
    })),
  );
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: by.userId },
    roleAssignmentId: by.roleAssignmentId,
    scope,
    record: { module: 'pos', type: 'billing_device', id: deviceId },
    operation: 'register-billing-device',
    changes: [
      { kind: 'value', field: 'code', before: null, after: draft.code.trim() },
      { kind: 'value', field: 'label', before: null, after: draft.label.trim() },
      { kind: 'value', field: 'storeId', before: null, after: draft.storeId },
      { kind: 'value', field: 'businessUnitIds', before: null, after: [...draft.businessUnitIds].sort() },
      { kind: 'value', field: 'state', before: null, after: 'Setting up' },
      ...(replacesDeviceId === undefined
        ? []
        : [{ kind: 'value' as const, field: 'replacesDeviceId', before: null, after: replacesDeviceId }]),
    ],
    source: { kind: 'screen' },
  });
  await context.publish(deviceRegistered, {
    subject: { module: 'pos', recordType: BILLING_DEVICE_TYPE, recordId: deviceId },
    payload: { deviceId, storeId: draft.storeId },
  });
  return { kind: 'success', answer: { deviceId, state: 'Setting up' } };
}

/** What the counter sends to enrol this browser as the device (offline-counter 3.2 steps 2 and 3). */
export interface Enrolment {
  readonly publicKey: DevicePublicKey;
  readonly challengeId: string;
  readonly signature: string;
  readonly totpCode: string;
}

/**
 * Enrol a billing device (offline-counter 3.2 steps 2 and 3, 4.1; PRD-OFF-010, PRD-POS-020): a protected action asking
 * the enrolling person's fresh authenticator code (GC8-8, DEC-116; access-and-approvals 3.3). Locks the device rows as
 * its own record (step 1), checks the code, has `access` check the proof and bind the key once, takes the code, then
 * defines the device's series where the bill-number format and the financial year exist, and otherwise none, naming
 * what is missing (DEC-116). The audit record, the access record, the series and `pos.device-enrolled` commit together
 * or not at all (PRD-ACS-013, PRD-SEC-007, PRD-INT-004).
 */
export async function enrolBillingDevice(
  context: TransactionContext,
  dependencies: PosDependencies,
  by: Actor,
  facts: RecordFacts,
  deviceId: string,
  enrolment: Enrolment,
  today: string,
): Promise<Outcome<DeviceEnrolled> & { readonly causedBySecret?: boolean }> {
  const { access } = dependencies;
  await context.lock(LOCK_STEP.document, [
    access.deviceLockTarget(deviceId),
    { table: BILLING_DEVICE, id: deviceId, mode: 'exclusive' },
  ]);
  const code = await access.checkFreshCode(context, by.userId, enrolment.totpCode);
  const codeRefused = freshCodeRefusal(code);
  if (codeRefused !== undefined) {
    return { kind: 'refusal', refusal: codeRefused.refusal, causedBySecret: codeRefused.causedBySecret };
  }
  const scope = scopeOf(facts);
  const enrolled = await access.enrolDevice(
    context,
    { userId: by.userId, networkAddress: by.networkAddress, scope },
    deviceId,
    { publicKey: enrolment.publicKey, challengeId: enrolment.challengeId, signature: enrolment.signature },
  );
  if (enrolled.kind === 'refusal') return enrolled;
  // The code's step is taken once the enrolment would succeed, so it is never accepted again (3.3; PRD-SEC-001).
  const taken = await takeFreshCode(code);
  if (taken !== undefined) return { kind: 'refusal', refusal: taken.refusal, causedBySecret: taken.causedBySecret };
  const device = (await access.devices(context, [deviceId])).get(deviceId);
  if (device === undefined) return refused('not-found', 'access.device-not-found');
  const series = await defineDeviceSeries(context, dependencies.numbering, device, today);
  if (series.kind === 'refusal') return series;
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: by.userId },
    roleAssignmentId: by.roleAssignmentId,
    scope,
    record: { module: 'pos', type: 'billing_device', id: deviceId },
    operation: 'enrol-billing-device',
    changes: [
      { kind: 'value', field: 'state', before: 'Setting up', after: 'Active' },
      { kind: 'value', field: 'seriesIds', before: null, after: series.answer.definedSeriesIds },
    ],
    source: { kind: 'device', reference: deviceId },
  });
  const storeId = facts.storeId ?? (await deviceStore(context, deviceId));
  if (storeId === undefined) return refused('not-found', 'access.device-not-found');
  await context.publish(deviceEnrolled, {
    subject: { module: 'pos', recordType: BILLING_DEVICE_TYPE, recordId: deviceId },
    payload: { deviceId, storeId, seriesIds: series.answer.definedSeriesIds },
  });
  return {
    kind: 'success',
    answer: { deviceId, state: 'Active', series: series.answer.series, seriesMissing: series.answer.missing },
  };
}

/**
 * Define the missing series of every Active billing device for the financial year of the date (offline-counter 4.1;
 * DEC-117): what an approved change that defines the bill-number format or the financial year's dates calls in its own
 * transaction. Retry-safe: a repeat defines nothing twice, and it never replaces, renumbers or resets an existing
 * series. Answers the series it defined.
 */
export async function defineMissingSeries(
  context: TransactionContext,
  dependencies: PosDependencies,
  date: string,
): Promise<Outcome<{ readonly definedSeriesIds: string[] }>> {
  const rows = await context.tx.select({ id: billingDevice.id }).from(billingDevice).orderBy(asc(billingDevice.id));
  const devices = await dependencies.access.devices(
    context,
    rows.map((row) => row.id),
  );
  const definedSeriesIds: string[] = [];
  for (const row of rows) {
    const device = devices.get(row.id);
    if (device?.state !== 'Active') continue;
    const series = await defineDeviceSeries(context, dependencies.numbering, device, date);
    if (series.kind === 'refusal') return series;
    definedSeriesIds.push(...series.answer.definedSeriesIds);
  }
  return { kind: 'success', answer: { definedSeriesIds } };
}

/** The billing devices of the Stores named, or of every Store when none is named, in identifier order. */
export async function billingDeviceRows(context: TransactionContext, storeIds?: readonly string[]) {
  const query = context.tx.select().from(billingDevice);
  return (storeIds === undefined ? query : query.where(inArray(billingDevice.storeId, [...storeIds]))).orderBy(
    asc(billingDevice.id),
  );
}
