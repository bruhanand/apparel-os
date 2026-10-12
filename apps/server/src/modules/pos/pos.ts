import type {
  BillFormatDraftInput,
  FinancialYearDraftInput,
  BillingDeviceDraft,
  BillingDeviceReplacement,
  BillingDeviceUnitChange,
  BillingDeviceView,
  DeviceEnding,
} from '@apparel-os/schemas';
import { and, asc, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../kernel/index.js';
import type { Preparer, RecordFacts } from '../access/index.js';
import { businessUnitHeads } from '../organisation/index.js';
import {
  billingDeviceRows,
  defineMissingSeries,
  deviceStore,
  enrolBillingDevice,
  missingSeriesLockTargets,
  registerBillingDevice,
  storeFacts,
  type Actor,
  type Enrolment,
  type PosDependencies,
} from './commands/devices.js';
import { changeBillingDeviceUnits, endBillingDevice, replaceBillingDevice } from './commands/lifecycle.js';
import {
  billFormatRead,
  changePreparer,
  financialYearList,
  prepareBillFormatChange,
  prepareFinancialYearChange,
  withdrawNumberingChange,
  type Withdrawer,
} from './commands/numbering-changes.js';
import { seriesOfDevice } from './commands/series.js';
import { unitDevicesCheck } from './queries/devices-check.js';
import { billingDeviceUnit } from './db/schema.js';

/**
 * The stage 1 part of `pos` (module-map 4.17; offline-counter 3, 4, 12.1; S1-F12-T01): register a billing device for a
 * Store and its units; enrol it, binding its key in `access` and defining its bill series through `numbering`; read the
 * devices with their units and series; and define the missing series of every Active device, for the approved change
 * that defines the bill-number format or the financial year (DEC-117); revoke, retire and replace a device, change its
 * units, and answer the devices readiness check (3.5, 12.1, section 11; S1-F12-T02). Every operation joins the caller's
 * transaction; the caller has authorised it with the Store's facts.
 */
export class Pos {
  constructor(private readonly dependencies: PosDependencies) {}

  /** The Store's place, for Authorise (access-and-approvals 5.3), or undefined when no Store has the identifier. */
  storeFacts(context: TransactionContext, storeId: string, date: string): Promise<RecordFacts | undefined> {
    return storeFacts(context, this.dependencies.organisation, storeId, date);
  }

  /** The place of a billing device's Store, or undefined when `pos` holds no such device. */
  async deviceFacts(context: TransactionContext, deviceId: string, date: string): Promise<RecordFacts | undefined> {
    const storeId = await deviceStore(context, deviceId);
    if (storeId === undefined) return undefined;
    return (await this.storeFacts(context, storeId, date)) ?? { storeId };
  }

  registerBillingDevice(
    context: TransactionContext,
    by: Actor,
    facts: RecordFacts,
    draft: BillingDeviceDraft,
    today: string,
  ) {
    return registerBillingDevice(context, this.dependencies, by, facts, draft, today);
  }

  enrolBillingDevice(
    context: TransactionContext,
    by: Actor,
    facts: RecordFacts,
    deviceId: string,
    enrolment: Enrolment,
    today: string,
  ) {
    return enrolBillingDevice(context, this.dependencies, by, facts, deviceId, enrolment, today);
  }

  /** Revoke a lost device, or retire one taken out of use: final; its sessions end and its series close (3.5). */
  endBillingDevice(context: TransactionContext, by: Actor, facts: RecordFacts, deviceId: string, ending: DeviceEnding) {
    return endBillingDevice(context, this.dependencies, by, facts, deviceId, ending);
  }

  /** Revoke or retire a device and register its replacement for the same Store and units (3.5). */
  replaceBillingDevice(
    context: TransactionContext,
    by: Actor,
    facts: RecordFacts,
    deviceId: string,
    replacement: BillingDeviceReplacement,
    today: string,
  ) {
    return replaceBillingDevice(context, this.dependencies, by, facts, deviceId, replacement, today);
  }

  /** Change an Active device's units from a date, defining the series a new registration needs (12.1, 4.3). */
  changeBillingDeviceUnits(
    context: TransactionContext,
    by: Actor,
    facts: RecordFacts,
    deviceId: string,
    change: BillingDeviceUnitChange,
    today: string,
  ) {
    return changeBillingDeviceUnits(context, this.dependencies, by, facts, deviceId, change, today);
  }

  /** What the devices readiness check of selling lacks for a unit on a date; empty when it passes (section 11). */
  unitDevicesCheck(context: TransactionContext, businessUnitId: string, date: string) {
    return unitDevicesCheck(context, businessUnitId, date);
  }

  /** Prepare the change that defines a financial year, for a different person to decide (4.3b; S1-F12-T03). */
  prepareFinancialYearChange(context: TransactionContext, preparer: Preparer, draft: FinancialYearDraftInput) {
    return prepareFinancialYearChange(context, this.dependencies, preparer, draft);
  }

  /** Prepare the change that sets the bill-number format, for a different person to decide (4.3b; S1-F12-T03). */
  prepareBillFormatChange(context: TransactionContext, preparer: Preparer, draft: BillFormatDraftInput) {
    return prepareBillFormatChange(context, this.dependencies, preparer, draft);
  }

  /** Who prepared a financial-year or bill-format change, or undefined when none has the identifier (4.3b). */
  changePreparer(context: TransactionContext, kind: 'financial-year' | 'bill-format', changeId: string) {
    return changePreparer(context, kind, changeId);
  }

  /**
   * Withdraw a financial-year or bill-format change awaiting its decision: by its preparer, or by a person holding
   * cancel (4.3b; access-and-approvals 9.1a; RR-489; product owner, 12 Oct 2026).
   */
  withdrawNumberingChange(
    context: TransactionContext,
    by: Withdrawer,
    kind: 'financial-year' | 'bill-format',
    changeId: string,
  ) {
    return withdrawNumberingChange(context, this.dependencies, by, kind, changeId);
  }

  /** The financial years defined and every change prepared (4.3b). */
  financialYears(context: TransactionContext) {
    return financialYearList(context, this.dependencies);
  }

  /** The bill-number format in force, or not set, and every change prepared (4.3b). */
  billFormat(context: TransactionContext) {
    return billFormatRead(context, this.dependencies);
  }

  /** Every billing device's rows, for the step 1 lock call of the change that defines their missing series (DEC-117). */
  missingSeriesLockTargets(context: TransactionContext) {
    return missingSeriesLockTargets(context);
  }

  /**
   * Define the missing series of every Active device for the date's financial year; retry-safe (4.1; DEC-117). The
   * caller holds missingSeriesLockTargets at step 1.
   */
  defineMissingSeries(context: TransactionContext, date: string) {
    return defineMissingSeries(context, this.dependencies.numbering, date);
  }

  /**
   * The billing devices the reader may view, each with its state, its units on the date and its series (offline-counter
   * 3.1, 4.4): every device, its Store's facts given to `allowed`, which keeps those its assignments cover (7.1 step 3).
   */
  async billingDevices(
    context: TransactionContext,
    date: string,
    allowed: (facts: readonly RecordFacts[]) => Promise<boolean[] | undefined>,
  ): Promise<BillingDeviceView[] | undefined> {
    const rows = await billingDeviceRows(context);
    const storeIds = [...new Set(rows.map((row) => row.storeId))];
    const facts = await this.dependencies.organisation.placeFactsOf(context, 'store', storeIds, date);
    const factsOf = (storeId: string): RecordFacts => facts.get(storeId) ?? { storeId };
    const shown = await allowed(rows.map((row) => factsOf(row.storeId)));
    if (shown === undefined) return undefined;
    const visible = rows.filter((_, index) => shown[index] === true);
    if (visible.length === 0) return [];
    const devices = await this.dependencies.access.devices(
      context,
      visible.map((row) => row.id),
    );
    const unitRows = await context.tx
      .select({ deviceId: billingDeviceUnit.billingDeviceId, unitId: billingDeviceUnit.businessUnitId })
      .from(billingDeviceUnit)
      .where(
        and(
          inArray(
            billingDeviceUnit.billingDeviceId,
            visible.map((row) => row.id),
          ),
          sql`${billingDeviceUnit.validDuring} @> ${date}::date`,
        ),
      )
      .orderBy(asc(billingDeviceUnit.businessUnitId));
    const heads = await businessUnitHeads(context, [...new Set(unitRows.map((row) => row.unitId))]);
    const views: BillingDeviceView[] = [];
    for (const row of visible) {
      const device = devices.get(row.id);
      if (device === undefined) continue;
      views.push({
        deviceId: row.id,
        code: device.code,
        label: device.label,
        state: device.state,
        storeId: row.storeId,
        units: unitRows
          .filter((unit) => unit.deviceId === row.id)
          .flatMap((unit) => {
            const head = heads.get(unit.unitId);
            return head === undefined ? [] : [{ businessUnitId: head.id, code: head.code, kind: head.kind }];
          }),
        series: await seriesOfDevice(context, this.dependencies.numbering, row.id, date),
        replacesDeviceId: row.replacesDeviceId,
      });
    }
    return views;
  }
}

export type PosInterface = Pos;
