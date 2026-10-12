import type { MissingItem } from '@apparel-os/schemas';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { devicesById } from '../../access/index.js';
import { financialYearOn, kindFormatOf, liveSeries } from '../../numbering/index.js';
import { businessUnitHeads, mappingOn } from '../../organisation/index.js';
import { billingDevice, billingDeviceUnit } from '../db/schema.js';
import { BILL_KIND, billScopeKey } from '../domain/kinds.js';

// The devices readiness check (offline-counter section 11; RR-016; PRD-LIF-001, PRD-LIF-002, PRD-POS-020,
// PRD-OFF-002, PRD-UXP-003; S1-F12-T02), which `site-lifecycle` runs among a unit's checks for selling. It adds no
// business prerequisite: it checks only that the bills a selling unit needs can be numbered. It asks for no offline
// counter and no number of devices beyond one (POL-16.01). A read with no instance, so the readiness checks and their
// decision effects, built before `pos` is, can call it (module-map 4.16).

/** Why an Active device listing the unit has no Open series for its registration and year (section 11). */
export type DeviceSeriesLack = 'bill-format' | 'financial-year' | 'mapping' | 'series';

/**
 * What the devices check of selling lacks for a unit on a date, empty when it passes (section 11): at least one Active
 * billing device of the unit's Store lists the unit on the date, and each such device has an Open series for the tax
 * registration of the unit's mapping in force on the date, in that date's financial year. Revoked and Ended devices,
 * and devices still Setting up, do not count. With none, it names the unit (`billing-device`); for a device with no
 * such series, it names the device by its code and why: no bill-number format (V-40), no financial year for the date
 * (GC5-1), no mapping in force for the unit, or no Open series for that registration and year (`device-series`).
 */
export async function unitDevicesCheck(
  context: TransactionContext,
  businessUnitId: string,
  date: string,
): Promise<MissingItem[]> {
  const storeId = (await businessUnitHeads(context, [businessUnitId])).get(businessUnitId)?.storeId ?? null;
  const listing =
    storeId === null
      ? []
      : await context.tx
          .select({ deviceId: billingDeviceUnit.billingDeviceId })
          .from(billingDeviceUnit)
          .innerJoin(billingDevice, eq(billingDevice.id, billingDeviceUnit.billingDeviceId))
          .where(
            and(
              eq(billingDeviceUnit.businessUnitId, businessUnitId),
              eq(billingDevice.storeId, storeId),
              sql`${billingDeviceUnit.validDuring} @> ${date}::date`,
            ),
          )
          .orderBy(asc(billingDeviceUnit.billingDeviceId));
  const devices = await devicesById(
    context,
    listing.map((row) => row.deviceId),
  );
  const active = [...devices.values()]
    .filter((device) => device.state === 'Active')
    .sort((a, b) => a.code.localeCompare(b.code));
  if (active.length === 0) return [{ kind: 'billing-device', businessUnitId }];
  const lacks: DeviceSeriesLack[] = [];
  const format = await kindFormatOf(context, BILL_KIND.kind);
  if (format.kind === 'not-set') lacks.push('bill-format');
  const year = await financialYearOn(context, date);
  if (year.kind === 'not-set') lacks.push('financial-year');
  const mapping = await mappingOn(context, businessUnitId, date);
  if (mapping === undefined) lacks.push('mapping');
  const missing: MissingItem[] = [];
  for (const device of active) {
    let lack = lacks;
    if (lack.length === 0 && year.kind === 'set' && mapping !== undefined) {
      const live = await liveSeries(context, {
        kind: BILL_KIND.kind,
        scopeKey: billScopeKey(device.deviceId, mapping.taxRegistrationId),
        financialYear: year.label,
      });
      if (live?.state !== 'Open') lack = ['series'];
    }
    for (const each of lack) {
      missing.push({ kind: 'device-series', deviceId: device.deviceId, code: device.code, lacks: each });
    }
  }
  return missing;
}
