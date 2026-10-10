import type { BillingDeviceDraft, BillingDeviceView } from '@apparel-os/schemas';
import { and, asc, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../kernel/index.js';
import type { RecordFacts } from '../access/index.js';
import { businessUnitHeads } from '../organisation/index.js';
import {
  billingDeviceRows,
  defineMissingSeries,
  deviceStore,
  enrolBillingDevice,
  registerBillingDevice,
  storeFacts,
  type Actor,
  type Enrolment,
  type PosDependencies,
} from './commands/devices.js';
import { seriesOfDevice } from './commands/series.js';
import { billingDeviceUnit } from './db/schema.js';

/**
 * The stage 1 part of `pos` (module-map 4.17; offline-counter 3, 4, 12.1; S1-F12-T01): register a billing device for a
 * Store and its units; enrol it, binding its key in `access` and defining its bill series through `numbering`; read the
 * devices with their units and series; and define the missing series of every Active device, for the approved change
 * that defines the bill-number format or the financial year (DEC-117). Revoke, retire, replace, unit changes and the
 * devices readiness check are S1-F12-T02. Every operation joins the caller's transaction; the caller has authorised
 * it with the Store's facts.
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

  /** Define the missing series of every Active device for the date's financial year; retry-safe (4.1; DEC-117). */
  defineMissingSeries(context: TransactionContext, date: string) {
    return defineMissingSeries(context, this.dependencies, date);
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
      });
    }
    return views;
  }
}

export type PosInterface = Pos;
