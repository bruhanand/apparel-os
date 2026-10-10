import { uuidv7 } from '@apparel-os/domain';
import {
  billingDeviceEndedSchema,
  billingDeviceReplacedSchema,
  billingDeviceUnitsChangedSchema,
  deviceEnrolledSchema,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCK_STEP } from '../src/kernel/index.js';
import { syntheticName } from './fixtures/synthetic.js';
import { DevicesWorld, errorOf, nextCode } from './support/billing-devices.js';
import { connect } from './support/postgres.js';

// S1-F12-T02: the end of a device's life and the change of its units, through the whole application on real
// PostgreSQL (offline-counter 3.5, 4.4, 12.1, 14.1 tests 3, 5, 6 and 10; numbering-and-audit 7 test 4;
// access-and-approvals 15 test 5; PRD-SEC-008, PRD-OFF-010, PRD-LIF-015, PRD-ORG-005; DEC-092). The SYNTHETIC bill
// format and financial year are defined first, as the approved change of DEC-117 would, and the SYNTHETIC shared POS
// session limits set (RR-303). Every value here is SYNTHETIC.

const w = new DevicesWorld('poslife');

beforeAll(async () => {
  await w.start();
  await w.defineFormatAndYear();
  await w.setSharedPosLimits();
});
afterAll(() => w.close());

describe('revoking a lost device (offline-counter 3.5, 4.4; access-and-approvals 15 test 5)', () => {
  it('PRD-SEC-008 PRD-OFF-010 GC-8 test 5 revoking an online till ends its sessions at their next request and closes its series in the same transaction', async () => {
    const device = await w.activeDevice([w.stores.wholeStore, w.stores.counterOtherRegistration]);
    expect(device.series).toHaveLength(2);
    const onDevice = await w.signIn(w.cashier, await w.proof(device.deviceId, device.key));
    expect(onDevice.status).toBe(200);
    expect((await w.get(onDevice.cookie, '/api/access/session')).status).toBe(200);
    const call = await w.end(device.deviceId, 'revocation');
    expect(call.status).toBe(200);
    const answer = billingDeviceEndedSchema.parse(call.body);
    expect(answer.state).toBe('Revoked');
    expect(answer.closedSeriesIds.sort()).toEqual(device.series.map((each) => each.seriesId).sort());
    // The session's next request is not signed in (PRD-SEC-008).
    expect((await w.get(onDevice.cookie, '/api/access/session')).status).toBe(401);
    const listedDevice = (await w.listed(w.admin)).find((each) => each.deviceId === device.deviceId);
    expect(listedDevice?.state).toBe('Revoked');
    expect(listedDevice?.series.map((each) => each.state)).toEqual(['Closed', 'Closed']);
    const [row] = await w.query<{ version: Date; audit: Date; access: Date; series: Date; event: string }>(
      `select (select v.recorded_at from access.device_version v where v.device_id = $1 and v.state = 'Revoked') as version,
              (select a.recorded_at from audit.audit_record a where a.record_id = $1 and a.operation = 'revoke-billing-device') as audit,
              (select r.recorded_at from audit.access_record r where r.device_id = $1 and r.kind = 'device-revoked') as access,
              (select max(e.recorded_at) from numbering.series_event e where e.series_id = any($2::uuid[]) and e.event = 'closed') as series,
              (select o.event_type from kernel.outbox_event o where o.subject_record_id = $1 and o.event_type = 'access.device-revoked') as event`,
      [device.deviceId, answer.closedSeriesIds],
    );
    expect(row?.audit).toEqual(row?.version);
    expect(row?.access).toEqual(row?.version);
    expect(row?.series).toEqual(row?.version);
    expect(row?.event).toBe('access.device-revoked');
  });

  it('PRD-LIF-015 numbering-and-audit 7 test 4 a closed series refuses allocation and never reopens', async () => {
    const device = await w.activeDevice([w.stores.wholeStore]);
    const seriesId = device.series[0]?.seriesId ?? '';
    expect(await w.allocateFrom(seriesId)).toMatchObject({ kind: 'done' });
    expect((await w.end(device.deviceId, 'revocation')).status).toBe(200);
    const refused = await w.allocateFrom(seriesId);
    expect(refused.kind === 'refused' ? refused.refusal.code : undefined).toBe('numbering.series-closed');
    const release = await w.inChange(async (context) => {
      await context.lock(LOCK_STEP.numberSeries, [w.numbering.seriesLockTarget(seriesId)]);
      return w.numbering.release(context, seriesId);
    });
    expect(release.kind === 'refused' ? release.refusal.code : undefined).toBe('numbering.series-closed');
  });

  it('PRD-OFF-010 GC-8 test 3 a Revoked device is final: its proof is refused, and revoking or retiring it again is refused', async () => {
    const device = await w.activeDevice([w.stores.wholeStore]);
    expect((await w.end(device.deviceId, 'revocation')).status).toBe(200);
    expect(errorOf(await w.signIn(w.cashier, await w.proof(device.deviceId, device.key))).code).toBe(
      'access.sign-in-refused',
    );
    for (const how of ['revocation', 'retirement'] as const) {
      const again = await w.end(device.deviceId, how);
      expect(again.status).toBe(422);
      expect(errorOf(again).code).toBe('access.device-ended');
    }
    expect((await w.enrol(device.deviceId, await w.newKey())).status).toBe(422);
  });

  it('POL-02.03 revoking needs edit on the device through a role assignment; an unknown device is not found', async () => {
    const device = await w.registered([w.stores.wholeStore]);
    expect(errorOf(await w.end(device.deviceId, 'revocation', w.outsider)).code).toBe('access.not-authorised');
    const unknown = await w.end(uuidv7(), 'revocation');
    expect(unknown.status).toBe(404);
    expect(errorOf(unknown).code).toBe('access.device-not-found');
  });
});

describe('retiring and replacing a device (offline-counter 3.5)', () => {
  it('PRD-OFF-010 retiring an online till closes its series and ends its sessions at once; it is Ended, and pos.device-ended is published', async () => {
    const device = await w.activeDevice([w.stores.wholeStore]);
    const onDevice = await w.signIn(w.cashier, await w.proof(device.deviceId, device.key));
    const call = await w.end(device.deviceId, 'retirement');
    expect(call.status).toBe(200);
    expect(billingDeviceEndedSchema.parse(call.body)).toEqual({
      deviceId: device.deviceId,
      state: 'Ended',
      closedSeriesIds: device.series.map((each) => each.seriesId),
    });
    expect((await w.get(onDevice.cookie, '/api/access/session')).status).toBe(401);
    const [row] = await w.query<{ access: string; event: string }>(
      `select (select count(*) from audit.access_record r where r.device_id = $1 and r.kind = 'device-ended') as access,
              (select o.event_type from kernel.outbox_event o where o.subject_record_id = $1 and o.event_type = 'pos.device-ended') as event`,
      [device.deviceId],
    );
    expect(row).toEqual({ access: '1', event: 'pos.device-ended' });
    expect(errorOf(await w.signIn(w.cashier, await w.proof(device.deviceId, device.key))).code).toBe(
      'access.sign-in-refused',
    );
  });

  it('a device still Setting up may be retired: it has no series to close', async () => {
    const device = await w.registered([w.stores.wholeStore]);
    expect(billingDeviceEndedSchema.parse((await w.end(device.deviceId, 'retirement')).body)).toMatchObject({
      state: 'Ended',
      closedSeriesIds: [],
    });
  });

  it('PRD-OFF-010 PRD-LIF-015 GC-8 test 6 a replacement is a new device with a new code and fresh series; the old series stay closed', async () => {
    const old = await w.activeDevice([w.stores.wholeStore, w.stores.counterOtherRegistration]);
    const code = nextCode('TILL');
    const call = await w.post(w.admin, `/api/pos/billing-devices/${old.deviceId}/replacement`, {
      ending: 'revoke',
      code,
      label: syntheticName('Replacement till'),
    });
    expect(call.status).toBe(200);
    const answer = billingDeviceReplacedSchema.parse(call.body);
    expect(answer.ended).toMatchObject({ deviceId: old.deviceId, state: 'Revoked' });
    expect(answer.replacement.state).toBe('Setting up');
    const replacement = (await w.listed(w.admin)).find((each) => each.deviceId === answer.replacement.deviceId);
    expect(replacement).toMatchObject({ code, storeId: w.stores.storeId, replacesDeviceId: old.deviceId, series: [] });
    expect(replacement?.units.map((unit) => unit.businessUnitId).sort()).toEqual(
      [w.stores.wholeStore, w.stores.counterOtherRegistration].sort(),
    );
    const enrolled = deviceEnrolledSchema.parse((await w.enrol(answer.replacement.deviceId, await w.newKey())).body);
    expect(enrolled.series).toHaveLength(2);
    for (const fresh of enrolled.series) {
      expect(old.series.map((each) => each.seriesId)).not.toContain(fresh.seriesId);
      expect((await w.inChange((context) => w.numbering.seriesState(context, fresh.seriesId)))?.nextSequence).toBe(1);
    }
    expect(
      (await w.listed(w.admin)).find((each) => each.deviceId === old.deviceId)?.series.map((s) => s.state),
    ).toEqual(['Closed', 'Closed']);
  });

  it('a replacement whose code is taken is refused whole: the old device stays as it was', async () => {
    const old = await w.activeDevice([w.stores.wholeStore]);
    const call = await w.post(w.admin, `/api/pos/billing-devices/${old.deviceId}/replacement`, {
      ending: 'retire',
      code: old.code,
      label: syntheticName('Replacement till'),
    });
    expect(errorOf(call).code).toBe('access.device-code-taken');
    expect((await w.listed(w.admin)).find((each) => each.deviceId === old.deviceId)).toMatchObject({
      state: 'Active',
      series: [{ state: 'Open' }],
    });
  });
});

describe('changing a device’s units (offline-counter 12.1, 4.3)', () => {
  const change = (deviceId: string, businessUnitIds: readonly string[], validFrom: string) =>
    w.post(w.admin, `/api/pos/billing-devices/${deviceId}/units`, { businessUnitIds, validFrom });

  it('PRD-ORG-005 PRD-POS-020 a unit that brings a new registration gets the device’s series for it from the date', async () => {
    const device = await w.activeDevice([w.stores.wholeStore]);
    const from = w.setup.day(5);
    const call = await change(device.deviceId, [w.stores.wholeStore, w.stores.counterOtherRegistration], from);
    expect(call.status).toBe(200);
    const answer = billingDeviceUnitsChangedSchema.parse(call.body);
    expect(answer.seriesMissing).toEqual([]);
    expect(answer.series.map((each) => [each.taxRegistrationId, each.state]).sort()).toEqual(
      [
        [w.stores.registrationIds[0], 'Open'],
        [w.stores.registrationIds[1], 'Open'],
      ].sort(),
    );
    // Today it still lists only its first unit.
    expect(
      (await w.listed(w.admin)).find((each) => each.deviceId === device.deviceId)?.units.map((u) => u.businessUnitId),
    ).toEqual([w.stores.wholeStore]);
    const units = await w.query<{ unit: string; during: string }>(
      `select business_unit_id as unit, valid_during::text as during from pos.billing_device_unit
        where billing_device_id = $1 order by lower(valid_during), business_unit_id`,
      [device.deviceId],
    );
    expect(units).toEqual([
      { unit: w.stores.wholeStore, during: `[${w.setup.today()},)` },
      { unit: w.stores.counterOtherRegistration, during: `[${from},)` },
    ]);
    // A unit it drops ends at the date of a later change.
    const later = w.setup.day(9);
    expect((await change(device.deviceId, [w.stores.counterOtherRegistration], later)).status).toBe(200);
    const after = await w.query<{ unit: string; during: string }>(
      `select business_unit_id as unit, valid_during::text as during from pos.billing_device_unit
        where billing_device_id = $1 and business_unit_id = $2`,
      [device.deviceId, w.stores.wholeStore],
    );
    expect(after).toEqual([{ unit: w.stores.wholeStore, during: `[${w.setup.today()},${later})` }]);
  });

  it('the refusals: not Active, a past date, a change scheduled on that date or later, the same list, a unit not of the Store', async () => {
    const settingUp = await w.registered([w.stores.wholeStore]);
    expect(errorOf(await change(settingUp.deviceId, [w.stores.counterSameRegistration], w.setup.day(3))).code).toBe(
      'pos.device-not-active',
    );
    const device = await w.activeDevice([w.stores.wholeStore]);
    expect(errorOf(await change(device.deviceId, [w.stores.counterSameRegistration], w.setup.day(-1))).code).toBe(
      'pos.starts-in-past',
    );
    expect(errorOf(await change(device.deviceId, [w.stores.counterSameRegistration], w.setup.today())).code).toBe(
      'pos.unit-change-scheduled',
    );
    expect(errorOf(await change(device.deviceId, [w.stores.wholeStore], w.setup.day(3))).code).toBe(
      'pos.units-unchanged',
    );
    expect(errorOf(await change(device.deviceId, [w.stores.otherStoreUnit], w.setup.day(3))).code).toBe(
      'pos.unit-not-of-store',
    );
    // The database refuses a unit row's start moving, or the row going, the owner included (code-house-rules 7.3).
    const owner = await connect(w.database, 'migration');
    try {
      await expect(
        owner.query(
          `update pos.billing_device_unit set valid_during = daterange(lower(valid_during) + 1, null)
                      where billing_device_id = $1`,
          [device.deviceId],
        ),
      ).rejects.toThrow(/ending it earlier/);
      await expect(
        owner.query(`delete from pos.billing_device_unit where billing_device_id = $1`, [device.deviceId]),
      ).rejects.toThrow(/never deleted/);
    } finally {
      await owner.end();
    }
  });
});
