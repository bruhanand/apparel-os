import { and, asc, eq, sql } from 'drizzle-orm';
import { LOCK_STEP, type TransactionContext } from '../../../kernel/index.js';
import { devicesById } from '../../access/index.js';
import type { NumberingInterface } from '../../numbering/index.js';
import { mappingVersionStart } from '../../organisation/index.js';
import { billingDeviceUnit } from '../db/schema.js';
import { billingDeviceLockTargets } from './devices.js';
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
  const rows = await context.tx
    .select({ deviceId: billingDeviceUnit.billingDeviceId })
    .from(billingDeviceUnit)
    .where(
      and(
        eq(billingDeviceUnit.businessUnitId, version.businessUnitId),
        sql`${billingDeviceUnit.validDuring} @> ${version.validFrom}::date`,
      ),
    )
    .orderBy(asc(billingDeviceUnit.billingDeviceId));
  // The devices' rows at step 1, before their state is read, so a revocation or retirement in progress is waited for
  // and a device it ends gets no series (code-house-rules 8.1, 8.2; S1-F12 review).
  await context.lock(LOCK_STEP.document, billingDeviceLockTargets(rows.map((row) => row.deviceId)));
  const devices = await devicesById(
    context,
    rows.map((row) => row.deviceId),
  );
  const definedSeriesIds: string[] = [];
  for (const row of rows) {
    const device = devices.get(row.deviceId);
    if (device?.state !== 'Active') continue;
    const defined = await defineDeviceSeries(context, numbering, device, version.validFrom);
    if (defined.kind === 'refusal') return defined;
    definedSeriesIds.push(...defined.answer.definedSeriesIds);
  }
  return { kind: 'success', answer: { definedSeriesIds } };
}
