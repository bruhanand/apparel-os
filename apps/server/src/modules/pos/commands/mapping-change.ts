import { and, asc, eq, sql } from 'drizzle-orm';
import { LOCK_STEP, type TransactionContext } from '../../../kernel/index.js';
import { devicesById } from '../../access/index.js';
import type { NumberingInterface } from '../../numbering/index.js';
import { businessUnitHeads, mappingVersionStart } from '../../organisation/index.js';
import { billingDeviceUnit } from '../db/schema.js';
import { billingDeviceLockTargets, billingDeviceRows } from './devices.js';
import { defineDeviceSeries, type SeriesOutcome } from './series.js';

/**
 * A unit's mapping changed (offline-counter 4.3; PRD-ORG-005, PRD-POS-020, PRD-INT-008; S1-F12-T02): for every Active
 * billing device that lists the unit on the new version's start, define the series missing for the registrations of its
 * units on that date, in that date's financial year, before the date comes (a mapping version never starts on a past
 * date, structure-and-masters 2.2). Retry-safe: a series already live is kept as it is (DEC-117), so a second delivery
 * of the event defines nothing twice. With no bill-number format or no financial year for the date it defines none; the
 * devices readiness check names what is missing (DEC-116). Answers the series defined.
 */
export async function defineSeriesForMapping(
  context: TransactionContext,
  numbering: NumberingInterface,
  mappingVersionId: string,
): Promise<SeriesOutcome<{ readonly definedSeriesIds: string[] }>> {
  const version = await mappingVersionStart(context, mappingVersionId);
  if (version === undefined) return { kind: 'success', answer: { definedSeriesIds: [] } };
  const listing = () =>
    context.tx
      .selectDistinct({ deviceId: billingDeviceUnit.billingDeviceId })
      .from(billingDeviceUnit)
      .where(
        and(
          eq(billingDeviceUnit.businessUnitId, version.businessUnitId),
          sql`${billingDeviceUnit.validDuring} @> ${version.validFrom}::date`,
        ),
      )
      .orderBy(asc(billingDeviceUnit.billingDeviceId));
  // Every billing device of the unit's Store, the only devices that can list it (3.1), at step 1, before their state
  // and units are read, so a revocation, retirement or unit change in progress is waited for, and one committed
  // meanwhile is seen (code-house-rules 8.1, 8.2; S1-F12 review). A device's Store never changes.
  const storeId = (await businessUnitHeads(context, [version.businessUnitId])).get(version.businessUnitId)?.storeId;
  const candidates =
    storeId === undefined || storeId === null ? [] : (await billingDeviceRows(context, [storeId])).map((row) => row.id);
  await context.lock(LOCK_STEP.document, billingDeviceLockTargets(candidates));
  // The devices listing the unit on the date, read under the locks. One registered since the candidates were read is
  // not held, and is left out: it was Setting up when registered, and gets the series of its enrolment date when it is enrolled (4.1).
  const held = new Set(candidates);
  const deviceIds = (await listing()).map((row) => row.deviceId).filter((deviceId) => held.has(deviceId));
  const devices = await devicesById(context, deviceIds);
  const definedSeriesIds: string[] = [];
  for (const deviceId of deviceIds) {
    const device = devices.get(deviceId);
    if (device?.state !== 'Active') continue;
    const defined = await defineDeviceSeries(context, numbering, device, version.validFrom);
    if (defined.kind === 'refusal') return defined;
    definedSeriesIds.push(...defined.answer.definedSeriesIds);
  }
  return { kind: 'success', answer: { definedSeriesIds } };
}
