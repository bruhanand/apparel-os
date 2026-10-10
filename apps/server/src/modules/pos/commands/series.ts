import type { DeviceSeries, SeriesMissing } from '@apparel-os/schemas';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import type { NumberingInterface } from '../../numbering/index.js';
import { mappingOn, taxRegistrationCodes } from '../../organisation/index.js';
import { billingDeviceUnit } from '../db/schema.js';
import { BILL_KIND, billDisplayScopeKey, billScopeKey, registrationOfScopeKey } from '../domain/kinds.js';

// A billing device's bill series (offline-counter 4.1, 4.4; numbering-and-audit 3.4; PRD-POS-020, PRD-OFF-002,
// DEC-005, DEC-116, DEC-117; S1-F12-T01): one Open series per tax registration of the device's units, for the financial
// year of the business date, defined through `numbering`, which refuses a second live one for the same device,
// registration and year. A series needs the bill-number format and the financial year's dates, both settings with no
// default (V-40, RR-101; GC5-1, RR-060); without either, none is defined and the device's answer names what is missing.

export type SeriesOutcome<T> =
  { readonly kind: 'success'; readonly answer: T } | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

/** What a device's series came to on a date: its series of that year, and why any is missing. */
export interface DeviceSeriesAnswer {
  readonly series: DeviceSeries[];
  readonly missing: SeriesMissing[];
  /** The series this call defined, none when every one already existed (retry-safe; DEC-117). */
  readonly definedSeriesIds: string[];
}

/** The units a device lists on a business date (offline-counter 3.1), in identifier order. */
export async function unitsOn(context: TransactionContext, deviceId: string, date: string): Promise<string[]> {
  const rows = await context.tx
    .select({ unitId: billingDeviceUnit.businessUnitId })
    .from(billingDeviceUnit)
    .where(and(eq(billingDeviceUnit.billingDeviceId, deviceId), sql`${billingDeviceUnit.validDuring} @> ${date}::date`))
    .orderBy(asc(billingDeviceUnit.businessUnitId));
  return rows.map((row) => row.unitId);
}

/** The tax registrations of a device's units' mappings in force on the date (PRD-ORG-005), and the units with none. */
export async function registrationsOn(
  context: TransactionContext,
  deviceId: string,
  date: string,
): Promise<{ readonly registrationIds: string[]; readonly unmapped: string[] }> {
  const registrations = new Set<string>();
  const unmapped: string[] = [];
  for (const unitId of await unitsOn(context, deviceId, date)) {
    const mapping = await mappingOn(context, unitId, date);
    if (mapping === undefined) unmapped.push(unitId);
    else registrations.add(mapping.taxRegistrationId);
  }
  return { registrationIds: [...registrations].sort(), unmapped };
}

/**
 * Defines the missing series of one device for the financial year of the date (offline-counter 4.1): for each
 * registration of its units without a live series in that year, through `numbering`. Retry-safe: an existing series is
 * kept as it is, never replaced, renumbered or reset (DEC-117). With no bill-number format or no financial year for the
 * date it defines none and names what is missing (DEC-116). A refusal of `numbering`, such as a format that could
 * repeat another series' texts, is the command's refusal.
 */
export async function defineDeviceSeries(
  context: TransactionContext,
  numbering: NumberingInterface,
  device: { readonly deviceId: string; readonly code: string },
  date: string,
): Promise<SeriesOutcome<DeviceSeriesAnswer>> {
  const { registrationIds, unmapped } = await registrationsOn(context, device.deviceId, date);
  const missing: SeriesMissing[] = [];
  const format = await numbering.kindFormatOf(context, BILL_KIND.kind);
  if (format.kind === 'not-set') missing.push({ kind: 'bill-format' });
  const year = await numbering.financialYearOn(context, date);
  if (year.kind === 'not-set') missing.push({ kind: 'financial-year', date });
  for (const businessUnitId of unmapped) missing.push({ kind: 'mapping', businessUnitId });
  const definedSeriesIds: string[] = [];
  const series: DeviceSeries[] = [];
  const codes = await taxRegistrationCodes(context, registrationIds);
  const codeOf = (id: string) => codes.get(id) ?? id;
  if (format.kind === 'set' && year.kind === 'set') {
    for (const taxRegistrationId of registrationIds) {
      const scopeKey = billScopeKey(device.deviceId, taxRegistrationId);
      const live = await numbering.liveSeries(context, {
        kind: BILL_KIND.kind,
        scopeKey,
        financialYear: year.label,
      });
      if (live !== undefined) {
        series.push({
          seriesId: live.seriesId,
          taxRegistrationId,
          taxRegistrationCode: codeOf(taxRegistrationId),
          financialYear: year.label,
          state: live.state,
        });
        continue;
      }
      const defined = await numbering.defineSeries(context, {
        kind: BILL_KIND.kind,
        scopeKey,
        financialYear: year.label,
        displayScopeKey: billDisplayScopeKey(taxRegistrationId),
        scopeText: device.code,
        formatCode: format.formatCode,
      });
      if (defined.kind === 'refused') return { kind: 'refusal', refusal: defined.refusal };
      definedSeriesIds.push(defined.value.seriesId);
      series.push({
        seriesId: defined.value.seriesId,
        taxRegistrationId,
        taxRegistrationCode: codeOf(taxRegistrationId),
        financialYear: year.label,
        state: 'Open',
      });
    }
  }
  return { kind: 'success', answer: { series, missing, definedSeriesIds } };
}

/**
 * Every series of a device for the registrations of its units on the date, of any year and state (offline-counter
 * 4.4), for the devices screen.
 */
export async function seriesOfDevice(
  context: TransactionContext,
  numbering: NumberingInterface,
  deviceId: string,
  date: string,
): Promise<DeviceSeries[]> {
  const { registrationIds } = await registrationsOn(context, deviceId, date);
  const found = await numbering.seriesOfScopes(
    context,
    BILL_KIND.kind,
    registrationIds.map((id) => billScopeKey(deviceId, id)),
  );
  const codes = await taxRegistrationCodes(context, registrationIds);
  return found.flatMap((each) => {
    const taxRegistrationId = registrationOfScopeKey(each.scopeKey);
    if (taxRegistrationId === undefined || each.financialYear === null) return [];
    return [
      {
        seriesId: each.seriesId,
        taxRegistrationId,
        taxRegistrationCode: codes.get(taxRegistrationId) ?? taxRegistrationId,
        financialYear: each.financialYear,
        state: each.state,
      },
    ];
  });
}
