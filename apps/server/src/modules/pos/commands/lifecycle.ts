import { uuidv7 } from '@apparel-os/domain';
import type {
  BillingDeviceEnded,
  BillingDeviceReplacement,
  BillingDeviceUnitChange,
  BillingDeviceUnitsChanged,
  DeviceEnding,
} from '@apparel-os/schemas';
import { and, asc, eq, sql } from 'drizzle-orm';
import { LOCK_STEP, type TransactionContext } from '../../../kernel/index.js';
import type { RecordFacts } from '../../access/index.js';
import { billingDeviceUnit } from '../db/schema.js';
import { BILL_KIND, BILLING_DEVICE_TYPE, billScopeKey } from '../domain/kinds.js';
import { deviceEnded } from '../events.js';
import {
  billingDeviceLockTargets,
  deviceStore,
  refused,
  registerBillingDevice,
  scopeOf,
  unitsRefusal,
  type Actor,
  type Outcome,
  type PosDependencies,
} from './devices.js';
import { defineDeviceSeries, unitsOn } from './series.js';

// The end of a billing device's life and the change of its units (offline-counter 3.5, 4.3, 4.4, 12.1; PRD-SEC-008,
// PRD-OFF-010, PRD-LIF-015, PRD-ORG-005, PRD-POS-020; DEC-092; S1-F12-T02). Every stage 1 device is an online till:
// it holds no local numbers, so its series close at once when it is revoked or retired. Revoking or retiring an offline
// counter (pause, queue reconciliation, release) is stage 4 (`S4-F11`). The route has authorised the action with the
// Store's facts and held the actor's authority at step 0.

/** The prefix of every bill series scope key of a device, whatever the registration (4.1). */
function deviceScopePrefix(deviceId: string): string {
  return billScopeKey(deviceId, '');
}

/**
 * Revoke or retire a billing device (offline-counter 3.5): locks the device rows of `access` and `pos` at step 1 and the
 * device's live series at step 8 (code-house-rules 8.2); has `access` make it Revoked or Ended, final, revoking every
 * session bound to it (PRD-SEC-008); closes every live series of the device, of every registration and year, so a
 * closed series refuses allocation and is never reopened (numbering-and-audit 3.7; PRD-LIF-015). Writes the
 * `revoke-billing-device` or `retire-billing-device` audit record; a retirement publishes `pos.device-ended`, a
 * revocation `access.device-revoked` (12.2). All in the caller's transaction (PRD-ACS-013, PRD-SEC-007, PRD-INT-004).
 */
export async function endBillingDevice(
  context: TransactionContext,
  dependencies: PosDependencies,
  by: Actor,
  facts: RecordFacts,
  deviceId: string,
  ending: DeviceEnding,
): Promise<Outcome<BillingDeviceEnded>> {
  const { access, numbering } = dependencies;
  await context.lock(LOCK_STEP.document, billingDeviceLockTargets([deviceId]));
  const storeId = await deviceStore(context, deviceId);
  if (storeId === undefined) return refused('not-found', 'access.device-not-found');
  const live = (await numbering.seriesOfScopePrefix(context, BILL_KIND.kind, deviceScopePrefix(deviceId))).filter(
    (each) => each.state !== 'Closed',
  );
  const scope = scopeOf(facts);
  const state = ending === 'revoke' ? 'Revoked' : 'Ended';
  const ended = await access.endDevice(
    context,
    { userId: by.userId, networkAddress: by.networkAddress, roleAssignmentId: by.roleAssignmentId, scope },
    deviceId,
    state,
  );
  if (ended.kind === 'refusal') return ended;
  // The series last, at step 8, before their first write (numbering-and-audit 3.2; code-house-rules 8.2).
  await context.lock(
    LOCK_STEP.numberSeries,
    live.map((each) => numbering.seriesLockTarget(each.seriesId)),
  );
  const closedSeriesIds: string[] = [];
  for (const each of live) {
    const closed = await numbering.close(context, each.seriesId);
    if (closed.kind === 'refused') return { kind: 'refusal', refusal: closed.refusal };
    closedSeriesIds.push(each.seriesId);
  }
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: by.userId },
    roleAssignmentId: by.roleAssignmentId,
    scope,
    record: { module: 'pos', type: 'billing_device', id: deviceId },
    operation: ending === 'revoke' ? 'revoke-billing-device' : 'retire-billing-device',
    changes: [
      { kind: 'value', field: 'state', before: null, after: state },
      { kind: 'value', field: 'closedSeriesIds', before: null, after: closedSeriesIds },
      { kind: 'value', field: 'sessionIds', before: null, after: ended.answer.sessionIds },
    ],
    source: { kind: 'screen' },
  });
  if (ending === 'retire') {
    await context.publish(deviceEnded, {
      subject: { module: 'pos', recordType: BILLING_DEVICE_TYPE, recordId: deviceId },
      scope: { storeId },
      payload: { deviceId, storeId, closedSeriesIds },
    });
  }
  return { kind: 'success', answer: { deviceId, state, closedSeriesIds } };
}

/**
 * Replace a billing device (offline-counter 3.5; PRD-OFF-010, PRD-LIF-015): the old one is revoked or retired as above,
 * and a new device, with its own code, is registered for the same Store and the units the old one lists today, naming
 * the one it replaces. It is Setting up: enrolled with a new key, it gets fresh series, and the old series stay closed,
 * never continued (numbering-and-audit 3.1). One transaction: a code taken, or a unit no longer of the Store, refuses
 * the whole replacement.
 */
export async function replaceBillingDevice(
  context: TransactionContext,
  dependencies: PosDependencies,
  by: Actor,
  facts: RecordFacts,
  deviceId: string,
  replacement: BillingDeviceReplacement,
  today: string,
): Promise<
  Outcome<{
    readonly ended: BillingDeviceEnded;
    readonly replacement: { readonly deviceId: string; readonly state: 'Setting up' };
  }>
> {
  const ended = await endBillingDevice(context, dependencies, by, facts, deviceId, replacement.ending);
  if (ended.kind === 'refusal') return ended;
  const storeId = await deviceStore(context, deviceId);
  if (storeId === undefined) return refused('not-found', 'access.device-not-found');
  const registered = await registerBillingDevice(
    context,
    dependencies,
    by,
    facts,
    {
      code: replacement.code,
      label: replacement.label,
      storeId,
      businessUnitIds: await unitsOn(context, deviceId, today),
    },
    today,
    deviceId,
  );
  if (registered.kind === 'refusal') return registered;
  return { kind: 'success', answer: { ended: ended.answer, replacement: registered.answer } };
}

/**
 * Change an Active billing device's units from a date, today or later (offline-counter 12.1, 4.3; PRD-ORG-005): the
 * whole list it bills for from that date, each a whole-store or brand-counter unit of its Store in force then. The
 * rows of the units it drops end at the date; the units it brings start there. Refused unless the device is Active
 * (`pos.device-not-active`), for a date before today (`pos.starts-in-past`), while a unit row of the device starts on
 * that date or later (`pos.unit-change-scheduled`: a later change starts after it), and for the list already in force
 * then (`pos.units-unchanged`). A unit that brings a new registration gets the device's series for it, for the
 * financial year of the date, where the format and that year exist (4.1; DEC-116), in the same transaction.
 */
export async function changeBillingDeviceUnits(
  context: TransactionContext,
  dependencies: PosDependencies,
  by: Actor,
  facts: RecordFacts,
  deviceId: string,
  change: BillingDeviceUnitChange,
  today: string,
): Promise<Outcome<BillingDeviceUnitsChanged>> {
  const { access } = dependencies;
  await context.lock(LOCK_STEP.document, billingDeviceLockTargets([deviceId]));
  const storeId = await deviceStore(context, deviceId);
  const device = (await access.devices(context, [deviceId])).get(deviceId);
  if (storeId === undefined || device === undefined) return refused('not-found', 'access.device-not-found');
  if (device.state !== 'Active') return refused('refused', 'pos.device-not-active');
  const { validFrom } = change;
  if (validFrom < today) return refused('refused', 'pos.starts-in-past');
  const unitsRefused = await unitsRefusal(context, storeId, change.businessUnitIds, validFrom);
  if (unitsRefused !== undefined) return unitsRefused;
  const rows = await context.tx
    .select({
      id: billingDeviceUnit.id,
      unitId: billingDeviceUnit.businessUnitId,
      startsLater: sql<boolean>`lower(${billingDeviceUnit.validDuring}) >= ${validFrom}::date`,
    })
    .from(billingDeviceUnit)
    .where(
      and(
        eq(billingDeviceUnit.billingDeviceId, deviceId),
        sql`${billingDeviceUnit.validDuring} && daterange(${validFrom}::date, null)`,
      ),
    )
    .orderBy(asc(billingDeviceUnit.businessUnitId));
  if (rows.some((row) => row.startsLater)) return refused('refused', 'pos.unit-change-scheduled');
  const before = rows.map((row) => row.unitId);
  const after = [...change.businessUnitIds].sort();
  if (before.length === after.length && before.every((unitId, index) => unitId === after[index])) {
    return refused('refused', 'pos.units-unchanged');
  }
  for (const row of rows.filter((each) => !after.includes(each.unitId))) {
    await context.tx
      .update(billingDeviceUnit)
      .set({ validDuring: sql`daterange(lower(${billingDeviceUnit.validDuring}), ${validFrom}::date)` })
      .where(eq(billingDeviceUnit.id, row.id));
  }
  const added = after.filter((unitId) => !before.includes(unitId));
  if (added.length > 0) {
    await context.tx.insert(billingDeviceUnit).values(
      added.map((businessUnitId) => ({
        id: uuidv7(),
        billingDeviceId: deviceId,
        businessUnitId,
        validDuring: `[${validFrom},)`,
      })),
    );
  }
  const series = await defineDeviceSeries(context, dependencies.numbering, device, validFrom);
  if (series.kind === 'refusal') return series;
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: by.userId },
    roleAssignmentId: by.roleAssignmentId,
    scope: scopeOf(facts),
    record: { module: 'pos', type: 'billing_device', id: deviceId },
    operation: 'change-billing-device-units',
    changes: [
      { kind: 'value', field: 'businessUnitIds', before, after },
      { kind: 'value', field: 'validFrom', before: null, after: validFrom },
      { kind: 'value', field: 'seriesIds', before: null, after: series.answer.definedSeriesIds },
    ],
    source: { kind: 'screen' },
  });
  return {
    kind: 'success',
    answer: { deviceId, validFrom, series: series.answer.series, seriesMissing: series.answer.missing },
  };
}
