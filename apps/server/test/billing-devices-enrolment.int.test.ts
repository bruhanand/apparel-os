import { uuidv7 } from '@apparel-os/domain';
import { deviceEnrolledSchema, sessionViewSchema } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BILL_KIND } from '../src/modules/pos/index.js';
import { syntheticName } from './fixtures/synthetic.js';
import { codeFor } from './support/access.js';
import {
  BILL_FORMAT,
  DevicesWorld,
  done,
  errorOf,
  nextCode,
  NO_DEVICE_FORMAT,
  type Key,
} from './support/billing-devices.js';

// S1-F12-T01: billing devices registered in the back office, enrolled with a key that never leaves the browser, proved
// at sign-in, and given their bill series, through the whole application on real PostgreSQL (offline-counter 3.1 to
// 3.4, 4.1, 12.1, 14.1 tests 1, 2, 4, the parts of 3 and 10 that need no revocation, and 8; PRD-OFF-002, PRD-OFF-010,
// PRD-POS-020, PRD-ORG-005, PRD-ACS-013, PRD-SEC-007, PRD-INT-004, POL-02.03, POL-02.18; DEC-005, DEC-116, DEC-117).
// The lifecycle is in billing-devices-lifecycle.int.test.ts, the series in billing-devices-series.int.test.ts. Every
// format, year, person and limit here is SYNTHETIC.

const w = new DevicesWorld('posenrol');

beforeAll(() => w.start());
afterAll(() => w.close());

describe('registering a billing device (offline-counter 3.1, 3.2 step 1, 12.1)', () => {
  it('PRD-ORG-005 GC-8 test 2 a unit of another Store, an office or a warehouse is refused, naming each', async () => {
    const call = await w.register([w.stores.wholeStore, w.stores.otherStoreUnit, w.stores.warehouse, w.stores.office]);
    expect(call.status).toBe(422);
    expect(errorOf(call)).toMatchObject({ kind: 'refused', code: 'pos.unit-not-of-store' });
    expect(errorOf(call).missing?.map(({ kind, id }) => ({ kind, id }))).toEqual([
      { kind: 'business-unit', id: w.stores.otherStoreUnit },
      { kind: 'business-unit', id: w.stores.warehouse },
      { kind: 'business-unit', id: w.stores.office },
    ]);
    expect(errorOf(call).missing?.every((item) => typeof item.code === 'string')).toBe(true);
    expect(errorOf(await w.register([w.stores.wholeStore, w.stores.wholeStore])).code).toBe('pos.unit-listed-twice');
    const unknownStore = await w.post(w.admin, '/api/pos/billing-devices', {
      code: nextCode('TILL'),
      label: syntheticName('Till'),
      storeId: uuidv7(),
      businessUnitIds: [w.stores.wholeStore],
    });
    expect(unknownStore.status).toBe(404);
    expect(errorOf(unknownStore).code).toBe('pos.store-not-found');
  });

  it('POL-02.03 registering needs the permission through a role assignment', async () => {
    const call = await w.post(w.outsider, '/api/pos/billing-devices', {
      code: nextCode('TILL'),
      label: syntheticName('Till'),
      storeId: w.stores.storeId,
      businessUnitIds: [w.stores.wholeStore],
    });
    expect(call.status).toBe(403);
    expect(errorOf(call).code).toBe('access.not-authorised');
    expect((await w.get(w.cookies.get(w.outsider.id) ?? '', '/api/pos/billing-devices')).status).toBe(403);
  });

  it('PRD-ACS-013 PRD-SEC-007 PRD-INT-004 GC-8 test 10 a device registered Setting up writes its audit and access records in the same transaction', async () => {
    const code = nextCode('TILL');
    const call = await w.register([w.stores.wholeStore, w.stores.counterSameRegistration], code);
    expect(call.status).toBe(200);
    expect(call.body).toMatchObject({ state: 'Setting up' });
    const deviceId = call.body.deviceId as string;
    const device = (await w.listed(w.admin)).find((each) => each.deviceId === deviceId);
    expect(device).toMatchObject({ code, state: 'Setting up', storeId: w.stores.storeId, series: [] });
    expect(device?.units.map((unit) => unit.businessUnitId).sort()).toEqual(
      [w.stores.wholeStore, w.stores.counterSameRegistration].sort(),
    );
    const [row] = await w.query<{ device: Date; audit: Date; access: Date; event: string }>(
      `select d.recorded_at as device,
              (select a.recorded_at from audit.audit_record a where a.record_id = d.id and a.operation = 'register-billing-device') as audit,
              (select r.recorded_at from audit.access_record r where r.device_id = d.id and r.kind = 'device-registered') as access,
              (select o.event_type from kernel.outbox_event o where o.subject_record_id = d.id) as event
         from pos.billing_device d where d.id = $1`,
      [deviceId],
    );
    expect(row?.audit).toEqual(row?.device);
    expect(row?.access).toEqual(row?.device);
    expect(row?.event).toBe('pos.device-registered');
    // The code is unique in the Organisation without regard to letter case (access-and-approvals 2.4).
    const again = await w.register([w.stores.wholeStore], code.toLowerCase());
    expect(errorOf(again).code).toBe('access.device-code-taken');
  });
});

describe('enrolling a billing device (offline-counter 3.2 steps 2 and 3, 4.1)', () => {
  let early: { deviceId: string; code: string };
  let earlyKey: Key;

  it('GC8-8 enrolment without a fresh authenticator code is refused', async () => {
    early = await w.registered([w.stores.wholeStore, w.stores.counterOtherRegistration]);
    earlyKey = await w.newKey();
    // A code of a step long past is no fresh code (access-and-approvals 3.3).
    const stale = codeFor(w.admin.factorSecret ?? Buffer.alloc(0), -10, w.clock.now());
    const call = await w.enrol(early.deviceId, earlyKey, { totpCode: stale });
    expect(call.status).toBe(403);
    expect(errorOf(call).code).toBe('access.authenticator-code-refused');
  });

  it('DEC-116 GC-8 test 8 with no bill format and no financial year, enrolment succeeds and defines no series, naming what is missing', async () => {
    const call = await w.enrol(early.deviceId, earlyKey);
    expect(call.status).toBe(200);
    const answer = deviceEnrolledSchema.parse(call.body);
    expect(answer).toMatchObject({ deviceId: early.deviceId, state: 'Active', series: [] });
    expect(answer.seriesMissing).toEqual([
      { kind: 'bill-format' },
      { kind: 'financial-year', date: w.clock.now().toISOString().slice(0, 10) },
    ]);
    expect((await w.listed(w.admin)).find((each) => each.deviceId === early.deviceId)).toMatchObject({
      state: 'Active',
      series: [],
    });
  });

  it('PRD-OFF-010 GC-8 test 3 a second enrolment of a device is refused', async () => {
    const call = await w.enrol(early.deviceId, await w.newKey());
    expect(call.status).toBe(422);
    expect(errorOf(call).code).toBe('access.device-already-enrolled');
  });

  it('PRD-OFF-010 GC-8 test 3 a proof signed by another key, or for another purpose, is refused and binds nothing', async () => {
    const device = await w.registered([w.stores.wholeStore]);
    const key = await w.newKey();
    const byOther = await w.enrol(device.deviceId, key, { signer: await w.newKey() });
    expect(errorOf(byOther).code).toBe('access.device-proof-refused');
    const forSignIn = await w.enrol(device.deviceId, key, { purpose: 'sign-in' });
    expect(errorOf(forSignIn).code).toBe('access.device-proof-refused');
    expect((await w.listed(w.admin)).find((each) => each.deviceId === device.deviceId)?.state).toBe('Setting up');
    const [row] = await w.query<{ key: unknown; records: string }>(
      `select d.public_key as key,
              (select count(*) from audit.access_record r where r.device_id = d.id and r.kind = 'device-enrolled') as records
         from access.device d where d.id = $1`,
      [device.deviceId],
    );
    expect(row).toEqual({ key: null, records: '0' });
  });

  it('DEC-117 the change that defines the bill format and the financial year gives every Active device its missing series, once', async () => {
    const today = w.clock.now().toISOString().slice(0, 10);
    const first = await w.inChange(async (context) => {
      await w.holdDevices(context);
      done(await w.numbering.defineFormatVersion(context, w.billFormatCode, BILL_FORMAT));
      done(await w.numbering.setKindFormat(context, BILL_KIND.kind, w.billFormatCode, 'synthetic'));
      done(
        await w.numbering.defineFinancialYear(context, {
          label: w.year,
          firstDay: w.setup.day(-30),
          lastDay: w.setup.day(300),
          origin: 'synthetic',
        }),
      );
      return w.pos.defineMissingSeries(context, today);
    });
    if (first.kind !== 'success') throw new Error(first.refusal.code);
    const device = (await w.listed(w.admin)).find((each) => each.deviceId === early.deviceId);
    expect(device?.series.map((each) => [each.taxRegistrationId, each.financialYear, each.state]).sort()).toEqual(
      [
        [w.stores.registrationIds[0], w.year, 'Open'],
        [w.stores.registrationIds[1], w.year, 'Open'],
      ].sort(),
    );
    expect(first.answer.definedSeriesIds.sort()).toEqual(device?.series.map((each) => each.seriesId).sort());
    // A repeat defines nothing twice and leaves each series as it is (retry-safe).
    const again = await w.defineMissingSeries(today);
    expect(again).toEqual({ kind: 'success', answer: { definedSeriesIds: [] } });
    expect((await w.listed(w.admin)).find((each) => each.deviceId === early.deviceId)?.series).toEqual(device?.series);
  });

  it('PRD-POS-020 PRD-OFF-002 DEC-005 GC-8 test 1 an enrolled device gets one Open series per registration of its units', async () => {
    const device = await w.registered([
      w.stores.wholeStore,
      w.stores.counterSameRegistration,
      w.stores.counterOtherRegistration,
    ]);
    const call = await w.enrol(device.deviceId, await w.newKey());
    expect(call.status).toBe(200);
    const answer = deviceEnrolledSchema.parse(call.body);
    expect(answer.seriesMissing).toEqual([]);
    expect(answer.series.map((each) => [each.taxRegistrationId, each.financialYear, each.state]).sort()).toEqual(
      [
        [w.stores.registrationIds[0], w.year, 'Open'],
        [w.stores.registrationIds[1], w.year, 'Open'],
      ].sort(),
    );
    const [row] = await w.query<{ event: string; audits: string }>(
      `select (select o.event_type from kernel.outbox_event o where o.subject_record_id = $1 and o.event_type = 'pos.device-enrolled') as event,
              (select count(*) from audit.audit_record a where a.record_id = $1 and a.operation = 'enrol-billing-device') as audits`,
      [device.deviceId],
    );
    expect(row).toEqual({ event: 'pos.device-enrolled', audits: '1' });
  });

  it('PRD-ACS-013 PRD-INT-004 GC-8 test 10 an enrolment whose series is refused commits nothing: no key, no record', async () => {
    await w.inChange(async (context) => {
      done(await w.numbering.defineFormatVersion(context, w.noDeviceFormatCode, NO_DEVICE_FORMAT));
      done(await w.numbering.setKindFormat(context, BILL_KIND.kind, w.noDeviceFormatCode, 'synthetic'));
    });
    try {
      const one = await w.registered([w.stores.counterOtherRegistration]);
      expect((await w.enrol(one.deviceId, await w.newKey())).status).toBe(200);
      // A second device of the same registration and year could repeat the first one's texts (numbering-and-audit 3.5).
      const two = await w.registered([w.stores.counterOtherRegistration]);
      const refused = await w.enrol(two.deviceId, await w.newKey());
      expect(errorOf(refused).code).toBe('numbering.format-could-repeat');
      const [row] = await w.query<{ key: unknown; versions: string; records: string; audits: string }>(
        `select d.public_key as key,
                (select count(*) from access.device_version v where v.device_id = d.id) as versions,
                (select count(*) from audit.access_record r where r.device_id = d.id and r.kind = 'device-enrolled') as records,
                (select count(*) from audit.audit_record a where a.record_id = d.id and a.operation = 'enrol-billing-device') as audits
           from access.device d where d.id = $1`,
        [two.deviceId],
      );
      expect(row).toEqual({ key: null, versions: '1', records: '0', audits: '0' });
    } finally {
      await w.inChange(async (context) =>
        done(await w.numbering.setKindFormat(context, BILL_KIND.kind, w.billFormatCode, 'synthetic')),
      );
    }
  });
});

describe('proving the device at sign-in (offline-counter 3.3, 3.4)', () => {
  let device: { deviceId: string; code: string };
  let key: Key;

  beforeAll(async () => {
    device = await w.registered([w.stores.wholeStore]);
    key = await w.newKey();
    expect((await w.enrol(device.deviceId, key)).status).toBe(200);
  });

  it('RR-303 a device sign-in is unavailable, naming it, while the shared POS session limits are not set', async () => {
    const call = await w.signIn(w.cashier, await w.proof(device.deviceId, key));
    expect(call.status).toBe(403);
    expect(call.body.error).toMatchObject({
      code: 'access.sign-in-unavailable',
      missing: [{ kind: 'setting', setting: 'access.shared-pos-session-limits' }],
    });
    await w.setSharedPosLimits();
  });

  it('POL-02.18 GC-8 test 4 a sign-in with a valid device proof makes a shared POS session bound to the device; without one, an office session', async () => {
    const onDevice = await w.signIn(w.cashier, await w.proof(device.deviceId, key));
    expect(onDevice.status).toBe(200);
    const shared = sessionViewSchema.parse((await w.get(onDevice.cookie, '/api/access/session')).body);
    expect(shared.device).toEqual({ deviceId: device.deviceId, code: device.code });
    expect(shared.idleLockSeconds).toBe(300);
    const office = await w.signIn(w.cashier);
    const view = sessionViewSchema.parse((await w.get(office.cookie, '/api/access/session')).body);
    expect(view.device).toBeUndefined();
    expect(view.idleLockSeconds).toBe(1800);
    const sessions = await w.query<{ kind: string; device_id: string | null }>(
      `select kind, device_id from access.session where app_user_id = $1 order by started_at, id`,
      [w.cashier.id],
    );
    expect(sessions.slice(-2)).toEqual([
      { kind: 'shared-pos', device_id: device.deviceId },
      { kind: 'office', device_id: null },
    ]);
    const [record] = await w.query<{ device_id: string }>(
      `select device_id from audit.access_record where user_id = $1 and kind = 'sign-in' and device_id is not null`,
      [w.cashier.id],
    );
    expect(record?.device_id).toBe(device.deviceId);
  });

  it('PRD-OFF-010 GC-8 test 3 a proof signed by another key, a used challenge or a device not enrolled is refused', async () => {
    const byOther = await w.signIn(w.cashier, await w.proof(device.deviceId, await w.newKey()));
    expect(errorOf(byOther).code).toBe('access.sign-in-refused');
    const used = await w.proof(device.deviceId, key);
    expect((await w.signIn(w.cashier, used)).status).toBe(200);
    expect(errorOf(await w.signIn(w.cashier, used)).code).toBe('access.sign-in-refused');
    const settingUp = await w.registered([w.stores.wholeStore]);
    const notEnrolled = await w.signIn(w.cashier, await w.proof(settingUp.deviceId, key));
    expect(errorOf(notEnrolled).code).toBe('access.sign-in-refused');
    const unknown = await w.signIn(w.cashier, await w.proof(uuidv7(), key));
    expect(errorOf(unknown).code).toBe('access.sign-in-refused');
  });
});

// S1-F12-T02: the end of a device's life, its units, its series following a mapping change, and the devices readiness
// check (offline-counter 3.5, 4.3, 4.4, 11, 12.1, 14.1 tests 3, 5, 6, 7, 8, 9 and 10; numbering-and-audit 7 test 4;
// access-and-approvals 15 test 5). The format and year set above stay in force: every value is SYNTHETIC.
