import { uuidv7 } from '@apparel-os/domain';
import { deviceEnrolledSchema } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCK_STEP, type TransactionContext } from '../src/kernel/index.js';
import { BILL_KIND, posConsumers, unitDevicesCheck } from '../src/modules/pos/index.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { DevicesWorld, done, nextCode } from './support/billing-devices.js';
import { capturingLogger } from './support/jobs.js';
import { decided, prepared } from './support/organisation.js';
import { backendPid, gate, waitUntilAnyWaitingForLock } from './support/transactions.js';

// S1-F12: a billing device's bill series, through the whole application on real PostgreSQL: allocation on device
// series (numbering-and-audit 3.2, 3.4, 7 tests 2 and 3), series following a mapping change (offline-counter 4.3, 14.1
// test 7) and the devices readiness check (section 11, 14.1 tests 8 and 9; PRD-POS-020, PRD-OFF-002, PRD-ORG-005,
// PRD-INT-008, PRD-LIF-001, PRD-LIF-002; DEC-116). The SYNTHETIC bill format and financial year are defined first, as
// the approved change of DEC-117 would. Every value here is SYNTHETIC.

const w = new DevicesWorld('posseries');

beforeAll(async () => {
  await w.start();
  await w.defineFormatAndYear();
});
afterAll(() => w.close());

describe('device bill series in numbering (numbering-and-audit 3.2, 3.4, 7 tests 2 and 3)', () => {
  let one: string;
  let two: string;

  beforeAll(async () => {
    for (const assign of [(id: string) => (one = id), (id: string) => (two = id)]) {
      const device = await w.registered([w.stores.wholeStore]);
      const answer = deviceEnrolledSchema.parse((await w.enrol(device.deviceId, await w.newKey())).body);
      assign(answer.series[0]?.seriesId ?? '');
    }
  });

  /** A synthetic bill document numbered from a device series, which the command locks last at step 8. */
  function numberBill(seriesId: string, hold?: (context: TransactionContext) => Promise<void>) {
    return w.inChange(async (context) => {
      await context.lock(LOCK_STEP.numberSeries, [w.numbering.seriesLockTarget(seriesId)]);
      await hold?.(context);
      return done(
        await w.numbering.allocate(context, { seriesId, documentType: 'test-synthetic.bill', documentId: uuidv7() }),
      );
    });
  }

  it('PRD-INT-003 PRD-POS-020 numbering-and-audit 7 test 2 two allocations on one device series get distinct, consecutive numbers', async () => {
    const held = gate();
    const release = gate();
    let firstPid = 0;
    const first = numberBill(one, async (context) => {
      firstPid = await backendPid(context);
      held.open();
      await release.wait;
    });
    await held.wait;
    const second = numberBill(one);
    await waitUntilAnyWaitingForLock(w.database, [firstPid]);
    release.open();
    expect([(await first).sequenceNumber, (await second).sequenceNumber]).toEqual([1, 2]);
  });

  it('PRD-POS-020 numbering-and-audit 7 test 2 two device series never wait for each other', async () => {
    const held = gate();
    const release = gate();
    const first = numberBill(one, async () => {
      held.open();
      await release.wait;
    });
    await held.wait;
    expect((await numberBill(two)).sequenceNumber).toBe(1);
    release.open();
    expect((await first).sequenceNumber).toBe(3);
  });

  it('PRD-POS-020 PRD-OFF-002 numbering-and-audit 7 test 3 a second open series for the same device, registration and year is refused', async () => {
    const live = await w.inChange((context) => w.numbering.seriesState(context, one));
    const refused = await w.inChange((context) =>
      w.numbering.defineSeries(context, {
        kind: BILL_KIND.kind,
        scopeKey: live?.scopeKey ?? '',
        financialYear: w.year,
        displayScopeKey: `registration:${w.stores.registrationIds[0]}`,
        scopeText: syntheticCode('ANOTHER'),
        formatCode: w.billFormatCode,
      }),
    );
    expect(refused.kind === 'refused' ? refused.refusal.code : undefined).toBe('numbering.live-series-exists');
  });
});

describe('a unit’s mapping changing to another registration (offline-counter 4.3)', () => {
  it('PRD-ORG-005 PRD-POS-020 PRD-INT-008 GC-8 test 7 the device gets its series for the new registration before the date, once', async () => {
    const unit = prepared(
      await w.setup.prepare((c, p) =>
        w.setup.organisation.prepareBusinessUnit(c, p, {
          code: nextCode('BU'),
          siteId: w.stores.siteId,
          kind: 'brand-counter',
          storeId: w.stores.storeId,
          name: syntheticName('Moving counter'),
          legalEntityId: w.stores.legalEntityId,
          taxRegistrationId: w.stores.registrationIds[0],
          accountingBookId: w.stores.bookId,
          validFrom: w.setup.today(),
        }),
      ),
    );
    decided(await w.setup.decide(unit.requestId, unit.versionId));
    const device = await w.activeDevice([unit.recordId]);
    expect(device.series.map((each) => each.taxRegistrationId)).toEqual([w.stores.registrationIds[0]]);
    const from = w.setup.day(20);
    const mapping = prepared(
      await w.setup.prepare((c, p) =>
        w.setup.organisation.prepareBusinessUnitMappingVersion(c, p, unit.recordId, {
          legalEntityId: w.stores.legalEntityId,
          taxRegistrationId: w.stores.registrationIds[1],
          accountingBookId: w.stores.bookId,
          validFrom: from,
        }),
      ),
    );
    decided(await w.setup.decide(mapping.requestId, mapping.versionId));
    const [outbox] = await w.query<{ id: string }>(
      `select id from kernel.outbox_event where event_type = 'organisation.mapping-changed'
          and payload->>'mappingVersionId' = $1`,
      [mapping.versionId],
    );
    expect(outbox).toBeDefined();
    const consumer = posConsumers.find((each) => each.name === 'pos.define-series-for-mapping');
    const deliver = () =>
      w.inChange((context) =>
        (consumer?.handle ?? (() => Promise.reject(new Error('No consumer'))))(
          context,
          {
            id: outbox?.id ?? '',
            type: 'organisation.mapping-changed',
            payloadVersion: 1,
            eventTime: new Date(),
            actorId: null,
            onBehalfOfUserId: null,
            correlationId: uuidv7(),
            subject: { module: 'organisation', recordType: 'organisation.business_unit', recordId: unit.recordId },
            scope: {},
            payload: { businessUnitId: unit.recordId, mappingVersionId: mapping.versionId },
          },
          { logger: capturingLogger().logger },
        ),
      );
    expect(await deliver()).toEqual({ kind: 'done' });
    const scopeKey = `device:${device.deviceId};registration:${w.stores.registrationIds[1]}`;
    const series = await w.query<{ state: string; year: string }>(
      `select state, financial_year as year from numbering.series where kind = 'pos.bill' and scope_key = $1`,
      [scopeKey],
    );
    expect(series).toEqual([{ state: 'Open', year: w.year }]);
    // A second delivery defines nothing twice (PRD-INT-008).
    expect(await deliver()).toEqual({ kind: 'done' });
    expect(
      await w.query(`select id from numbering.series where kind = 'pos.bill' and scope_key = $1`, [scopeKey]),
    ).toHaveLength(1);
  });
});

describe('the devices readiness check (offline-counter section 11)', () => {
  const check = (unitId: string, date = w.setup.today()) =>
    w.inChange((context) => unitDevicesCheck(context, unitId, date));

  async function freshUnit(): Promise<string> {
    const unit = prepared(
      await w.setup.prepare((c, p) =>
        w.setup.organisation.prepareBusinessUnit(c, p, {
          code: nextCode('BU'),
          siteId: w.stores.siteId,
          kind: 'brand-counter',
          storeId: w.stores.storeId,
          name: syntheticName('Checked counter'),
          legalEntityId: w.stores.legalEntityId,
          taxRegistrationId: w.stores.registrationIds[0],
          accountingBookId: w.stores.bookId,
          validFrom: w.setup.today(),
        }),
      ),
    );
    decided(await w.setup.decide(unit.requestId, unit.versionId));
    return unit.recordId;
  }

  it('PRD-LIF-002 GC-8 test 9 selling fails with no Active device listing the unit, and passes with one holding its Open series', async () => {
    const unitId = await freshUnit();
    expect(await check(unitId)).toEqual([{ kind: 'billing-device', businessUnitId: unitId }]);
    const settingUp = await w.registered([unitId]);
    expect(await check(unitId)).toEqual([{ kind: 'billing-device', businessUnitId: unitId }]);
    expect((await w.enrol(settingUp.deviceId, await w.newKey())).status).toBe(200);
    expect(await check(unitId)).toEqual([]);
  });

  it('PRD-LIF-002 GC-8 test 9 Revoked and Ended devices do not count; a device without its series fails, naming it', async () => {
    const unitId = await freshUnit();
    const first = await w.activeDevice([unitId]);
    const second = await w.activeDevice([unitId]);
    expect(await check(unitId)).toEqual([]);
    expect((await w.end(first.deviceId, 'revocation')).status).toBe(200);
    expect(await check(unitId)).toEqual([]);
    expect((await w.end(second.deviceId, 'retirement')).status).toBe(200);
    expect(await check(unitId)).toEqual([{ kind: 'billing-device', businessUnitId: unitId }]);
    // An Active device whose series for the unit's registration and year is missing fails, named by its code.
    const third = await w.activeDevice([unitId]);
    await w.inChange(async (context) => {
      const live = third.series[0]?.seriesId ?? '';
      await context.lock(LOCK_STEP.numberSeries, [w.numbering.seriesLockTarget(live)]);
      done(await w.numbering.pause(context, live));
    });
    expect(await check(unitId)).toEqual([
      { kind: 'device-series', deviceId: third.deviceId, code: third.code, lacks: 'series' },
    ]);
  });

  it('POL-10.07 DEC-116 GC-8 test 8 with no financial year for the date, the check fails with that reason', async () => {
    const unitId = await freshUnit();
    const device = await w.activeDevice([unitId]);
    // A date past the SYNTHETIC year, for which no year is defined.
    expect(await check(unitId, w.setup.day(400))).toEqual([
      { kind: 'device-series', deviceId: device.deviceId, code: device.code, lacks: 'financial-year' },
    ]);
  });
});
