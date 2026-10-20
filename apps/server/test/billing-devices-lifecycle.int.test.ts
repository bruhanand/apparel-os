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
import { DevicesWorld, done, errorOf, nextCode } from './support/billing-devices.js';
import { connect } from './support/postgres.js';
import { backendPid, gate, waitUntilAnyWaitingForLock } from './support/transactions.js';

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
    const enrolAgain = await w.enrol(device.deviceId, await w.newKey());
    expect(enrolAgain.status).toBe(422);
    expect(errorOf(enrolAgain).code).toBe('access.device-ended');
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

  it('PRD-OFF-010 a device still Setting up may be retired: it has no series to close', async () => {
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

  it('PRD-OFF-010 PRD-INT-004 a replacement whose code is taken is refused whole: the old device stays as it was', async () => {
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

  it('RR-495 the devices list shows a device’s scheduled later units with their start dates, earliest first', async () => {
    const device = await w.activeDevice([w.stores.wholeStore]);
    const listed = async () => (await w.listed(w.admin)).find((each) => each.deviceId === device.deviceId);
    expect((await listed())?.scheduledUnits).toEqual([]);
    const from = w.setup.day(5);
    const later = w.setup.day(9);
    expect((await change(device.deviceId, [w.stores.wholeStore, w.stores.counterOtherRegistration], from)).status).toBe(
      200,
    );
    expect((await change(device.deviceId, [w.stores.counterOtherRegistration], later)).status).toBe(200);
    const view = await listed();
    // Today's units are unchanged until the first date (offline-counter 3.7).
    expect(view?.units.map((unit) => unit.businessUnitId)).toEqual([w.stores.wholeStore]);
    expect(
      view?.scheduledUnits.map((each) => ({
        startsOn: each.startsOn,
        units: each.units.map((unit) => unit.businessUnitId).sort(),
      })),
    ).toEqual([
      { startsOn: from, units: [w.stores.wholeStore, w.stores.counterOtherRegistration].sort() },
      { startsOn: later, units: [w.stores.counterOtherRegistration] },
    ]);
    // A device revoked before its change shows none: it bills for nothing again.
    expect((await w.end(device.deviceId, 'revocation')).status).toBe(200);
    expect((await listed())?.scheduledUnits).toEqual([]);
  });

  it('PRD-ORG-005 PRD-MOD-010 the refusals: not Active, a past date, a change scheduled on that date or later, the same list, a unit not of the Store', async () => {
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

describe('a revocation and the commands that rely on the device (code-house-rules 8.1, 8.2)', () => {
  /** The device Admin, as a route gives `pos` its actor (numbering-and-audit 4.1). */
  const actor = () => ({ userId: w.admin.id, roleAssignmentId: w.adminAssignmentId, networkAddress: '10.9.12.1' });

  /** Revokes the device through `pos` and holds the transaction open, after its writes, until the test lets it go. */
  function heldRevocation(deviceId: string) {
    const held = gate();
    const release = gate();
    let pid = 0;
    const revoking = w.inChange(async (context) => {
      const facts = await w.pos.deviceFacts(context, deviceId, w.setup.today());
      if (facts === undefined) throw new Error('No such device');
      const ended = await w.pos.endBillingDevice(context, actor(), facts, deviceId, 'revoke');
      pid = await backendPid(context);
      held.open();
      await release.wait;
      return ended;
    });
    return { revoking, held: held.wait, release: release.open, pid: () => pid };
  }

  it('PRD-SEC-008 PRD-OFF-010 a device sign-in waits for a revocation in progress, then is refused: no session outlives it', async () => {
    const device = await w.activeDevice([w.stores.wholeStore]);
    const proof = await w.proof(device.deviceId, device.key);
    const revocation = heldRevocation(device.deviceId);
    await revocation.held;
    const signingIn = w.signIn(w.cashier, proof);
    await waitUntilAnyWaitingForLock(w.database, [revocation.pid()]);
    revocation.release();
    expect((await revocation.revoking).kind).toBe('success');
    expect(errorOf(await signingIn).code).toBe('access.sign-in-refused');
    expect(
      await w.query(`select id from access.session where device_id = $1 and state in ('In force', 'Locked')`, [
        device.deviceId,
      ]),
    ).toEqual([]);
  });

  it('PRD-SEC-008 PRD-OFF-010 a revocation waits for a device sign-in that holds the device, then revokes the session it started', async () => {
    const device = await w.activeDevice([w.stores.wholeStore]);
    const proof = await w.proof(device.deviceId, device.key);
    // A SYNTHETIC blocker holds the cashier's authenticator row, so the sign-in stops at the write of its code's step,
    // after it has taken the device row in shared mode at step 1 (code-house-rules 8.2).
    const blocker = await connect(w.database, 'superuser');
    try {
      await blocker.query('begin');
      await blocker.query('select id from access.second_factor where app_user_id = $1 for no key update', [
        w.cashier.id,
      ]);
      const blockerPid = (await blocker.query<{ pid: number }>('select pg_catalog.pg_backend_pid() as pid')).rows[0]
        ?.pid;
      if (blockerPid === undefined) throw new Error('No backend pid');
      const signingIn = w.signIn(w.cashier, proof);
      const signInPid = await waitUntilAnyWaitingForLock(w.database, [blockerPid]);
      const revoking = w.inChange(async (context) => {
        const facts = await w.pos.deviceFacts(context, device.deviceId, w.setup.today());
        if (facts === undefined) throw new Error('No such device');
        return w.pos.endBillingDevice(context, actor(), facts, device.deviceId, 'revoke');
      });
      // The revocation waits for the sign-in's shared hold of the device row.
      await waitUntilAnyWaitingForLock(w.database, [blockerPid, signInPid]);
      await blocker.query('rollback');
      const signedIn = await signingIn;
      expect(signedIn.status).toBe(200);
      expect((await revoking).kind).toBe('success');
      expect((await w.get(signedIn.cookie, '/api/access/session')).status).toBe(401);
      const sessions = await w.query<{ id: string; state: string }>(
        `select id, state from access.session where device_id = $1`,
        [device.deviceId],
      );
      expect(sessions.map((each) => each.state)).toEqual(['Revoked']);
      // The audit records keep the states each had before: the session In force, the device Active.
      const changes = await w.query<{ operation: string; changes: unknown }>(
        `select operation, changes from audit.audit_record
          where (record_id = $1 and operation = 'revoke-device') or (record_id = $2 and operation = 'revoke-billing-device')
          order by operation`,
        [sessions[0]?.id, device.deviceId],
      );
      expect(changes.map((each) => each.operation)).toEqual(['revoke-billing-device', 'revoke-device']);
      expect(changes[0]?.changes).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'state', before: 'Active', after: 'Revoked' })]),
      );
      expect(changes[1]?.changes).toEqual([
        expect.objectContaining({ field: 'state', before: 'In force', after: 'Revoked' }),
      ]);
    } finally {
      await blocker.end();
    }
  });

  it('PRD-OFF-010 an enrolment waits for a revocation in progress, then is refused: a Revoked device binds no key', async () => {
    const device = await w.registered([w.stores.wholeStore]);
    const revocation = heldRevocation(device.deviceId);
    await revocation.held;
    const enrolling = w.enrol(device.deviceId, await w.newKey());
    await waitUntilAnyWaitingForLock(w.database, [revocation.pid()]);
    revocation.release();
    expect((await revocation.revoking).kind).toBe('success');
    expect(errorOf(await enrolling).code).toBe('access.device-ended');
    const [row] = await w.query<{ key: unknown }>(`select public_key as key from access.device where id = $1`, [
      device.deviceId,
    ]);
    expect(row).toEqual({ key: null });
  });

  it('PRD-LIF-015 DEC-117 defining the missing series waits for a revocation in progress, and defines none for the Revoked device', async () => {
    const device = await w.activeDevice([w.stores.wholeStore]);
    // A second SYNTHETIC year, for which no device holds a series yet.
    const later = w.setup.day(320);
    await w.inChange(async (context) =>
      done(
        await w.numbering.defineFinancialYear(context, {
          label: `${w.year}-NEXT`,
          firstDay: w.setup.day(301),
          lastDay: w.setup.day(600),
          origin: 'synthetic',
        }),
      ),
    );
    const revocation = heldRevocation(device.deviceId);
    await revocation.held;
    const defining = w.defineMissingSeries(later);
    await waitUntilAnyWaitingForLock(w.database, [revocation.pid()]);
    revocation.release();
    expect((await revocation.revoking).kind).toBe('success');
    expect((await defining).kind).toBe('success');
    const live = await w.query<{ id: string }>(
      `select id from numbering.series where kind = 'pos.bill' and scope_key like $1 and state <> 'Closed'`,
      [`device:${device.deviceId};%`],
    );
    expect(live).toEqual([]);
  });

  it('PRD-ACS-013 PRD-SEC-007 PRD-INT-004 GC-8 test 10 a revocation commits with its records or not at all', async () => {
    const device = await w.activeDevice([w.stores.wholeStore]);
    const onDevice = await w.signIn(w.cashier, await w.proof(device.deviceId, device.key));
    await expect(
      w.inChange(async (context) => {
        const facts = await w.pos.deviceFacts(context, device.deviceId, w.setup.today());
        if (facts === undefined) throw new Error('No such device');
        expect((await w.pos.endBillingDevice(context, actor(), facts, device.deviceId, 'revoke')).kind).toBe('success');
        throw new Error('SYNTHETIC failure after the revocation');
      }),
    ).rejects.toThrow(/SYNTHETIC failure/);
    expect((await w.listed(w.admin)).find((each) => each.deviceId === device.deviceId)).toMatchObject({
      state: 'Active',
      series: [{ state: 'Open' }],
    });
    expect((await w.get(onDevice.cookie, '/api/access/session')).status).toBe(200);
    const [row] = await w.query<{ versions: string; access: string; audits: string; events: string }>(
      `select (select count(*) from access.device_version v where v.device_id = $1 and v.state = 'Revoked') as versions,
              (select count(*) from audit.access_record r where r.device_id = $1 and r.kind = 'device-revoked') as access,
              (select count(*) from audit.audit_record a where a.record_id = $1 and a.operation = 'revoke-billing-device') as audits,
              (select count(*) from kernel.outbox_event o where o.subject_record_id = $1 and o.event_type = 'access.device-revoked') as events`,
      [device.deviceId],
    );
    expect(row).toEqual({ versions: '0', access: '0', audits: '0', events: '0' });
  });
});
