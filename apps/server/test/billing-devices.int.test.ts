import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  billingDeviceListSchema,
  deviceChallengeSchema,
  deviceEnrolledSchema,
  sessionViewSchema,
  type DeviceProofPurpose,
  type DevicePublicKey,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCK_STEP, type TransactionContext } from '../src/kernel/index.js';
import { Audit } from '../src/modules/audit/index.js';
import { Numbering, type FormatPart, type NumberingResult } from '../src/modules/numbering/index.js';
import { BILL_KIND, Pos } from '../src/modules/pos/index.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  SyntheticClock,
  SYNTHETIC_ORIGIN,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { capturingLogger } from './support/jobs.js';
import { approvedGeography, structureSetup, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { syntheticDeviceKey, syntheticStores, type SyntheticStores } from './support/pos.js';
import { connect } from './support/postgres.js';
import { backendPid, gate, waitUntilAnyWaitingForLock } from './support/transactions.js';

// S1-F12-T01: billing devices registered in the back office, enrolled with a key that never leaves the browser, proved
// at sign-in, and given their bill series, through the whole application on real PostgreSQL (offline-counter 3.1 to
// 3.4, 4.1, 12.1, 14.1 tests 1, 2, 4, the parts of 3 and 10 that need no revocation, and 8; numbering-and-audit 7 tests
// 2 and 3 for device series; PRD-OFF-002, PRD-OFF-010, PRD-POS-020, PRD-ORG-005, PRD-ACS-013, PRD-SEC-007,
// PRD-INT-004, POL-02.03, POL-02.18; DEC-005, DEC-116, DEC-117). The structure is made through organisation's real
// commands; the device keys with WebCrypto, as the counter makes them. The bill-number format and the financial year
// are OPEN (V-40, RR-101; GC5-1, RR-060): every format, year, person and limit here is SYNTHETIC.

let world: SyntheticWorld;
let database: string;
let organisationCode: string;
let api: AccessTestApp;
let clock: SyntheticClock;
let keys: Record<string, string>;
let setup: StructureSetup;
let stores: SyntheticStores;
const cookies = new Map<string, string>();
let admin: SyntheticUser;
let cashier: SyntheticUser;
let outsider: SyntheticUser;
/** numbering serving the bill, as the application composes it (offline-counter 4.1). */
const numbering = new Numbering({ kinds: [BILL_KIND] });
let pos: Pos;

interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const DEVICE_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'pos.billing_device', action: 'view' },
  { recordType: 'pos.billing_device', action: 'create' },
  { recordType: 'pos.billing_device', action: 'edit' },
];

/** A SYNTHETIC bill format carrying the device, so two devices' numbers of one registration and year never meet. */
const BILL_FORMAT: FormatPart[] = [
  { kind: 'text', text: 'SYN/' },
  { kind: 'scope' },
  { kind: 'text', text: '/' },
  { kind: 'year' },
  { kind: 'text', text: '/' },
  { kind: 'sequence', width: 5 },
];
/** A SYNTHETIC format without the device: two devices of one registration and year could repeat its texts (3.5). */
const NO_DEVICE_FORMAT: FormatPart[] = [
  { kind: 'text', text: 'SYN-ND-' },
  { kind: 'year' },
  { kind: 'text', text: '-' },
  { kind: 'sequence', width: 5 },
];
const BILL_FORMAT_CODE = syntheticCode(`BILL-${String(randomInt(1_000_000))}`);
const NO_DEVICE_FORMAT_CODE = syntheticCode(`BILL-ND-${String(randomInt(1_000_000))}`);
const YEAR = syntheticCode(`FY-${String(randomInt(1_000_000))}`);

let counter = 0;
const nextCode = (prefix: string) => syntheticCode(`${prefix}-${String(++counter)}-${String(randomInt(1_000_000))}`);

function freshCode(user: SyntheticUser): string {
  clock.advance(30);
  return codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now());
}

async function signIn(user: SyntheticUser, device?: Record<string, unknown>): Promise<Call & { cookie: string }> {
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.12.1' },
    body: JSON.stringify({
      organisationCode,
      login: user.login,
      password: user.password,
      totpCode: freshCode(user),
      ...(device === undefined ? {} : { device }),
    }),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    cookie: (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '',
  };
}

async function enrolled(label: string, authorities: readonly SyntheticAuthority[]): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(database, organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
    personas: ['P-ADM'],
  });
  if (authorities.length > 0) await grantSynthetic(database, { kind: 'user', id: user.id }, authorities);
  const signed = await signIn(user);
  expect(signed.status).toBe(200);
  cookies.set(user.id, signed.cookie);
  return user;
}

async function post(
  user: SyntheticUser | undefined,
  path: string,
  body: unknown,
  key: string = uuidv7(),
): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: SYNTHETIC_ORIGIN,
      ...(user === undefined ? {} : { cookie: cookies.get(user.id) ?? '', 'idempotency-key': key }),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function get(cookie: string, path: string): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const errorOf = (call: Call) => call.body.error as { kind: string; code: string; missing?: Record<string, string>[] };

async function challenge(): Promise<{ challengeId: string; challenge: string }> {
  const call = await post(undefined, '/api/access/device-challenges', { organisationCode });
  expect(call.status).toBe(200);
  return deviceChallengeSchema.parse(call.body);
}

async function register(units: readonly string[], code = nextCode('TILL')): Promise<Call> {
  return post(admin, '/api/pos/billing-devices', {
    code,
    label: syntheticName('Till'),
    storeId: stores.storeId,
    businessUnitIds: units,
  });
}

async function registered(units: readonly string[]): Promise<{ deviceId: string; code: string }> {
  const code = nextCode('TILL');
  const call = await register(units, code);
  expect(call.status).toBe(200);
  return { deviceId: call.body.deviceId as string, code };
}

type Key = Awaited<ReturnType<typeof syntheticDeviceKey>>;

/** Enrols the device with the key, signing a fresh challenge for the purpose given, as the counter does. */
async function enrol(
  deviceId: string,
  key: Key,
  options: { readonly signer?: Key; readonly purpose?: DeviceProofPurpose; readonly totpCode?: string } = {},
): Promise<Call> {
  const issued = await challenge();
  const signature = await (options.signer ?? key).sign(options.purpose ?? 'enrol', deviceId, issued.challenge);
  return post(admin, `/api/pos/billing-devices/${deviceId}/enrolment`, {
    publicKey: key.publicKey satisfies DevicePublicKey,
    challengeId: issued.challengeId,
    signature,
    totpCode: options.totpCode ?? freshCode(admin),
  });
}

async function proof(deviceId: string, key: Key, purpose: DeviceProofPurpose = 'sign-in') {
  const issued = await challenge();
  return { deviceId, challengeId: issued.challengeId, signature: await key.sign(purpose, deviceId, issued.challenge) };
}

async function query<T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  const client = await connect(database, 'migration');
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

/** Runs work in one command of the structure setup's clock, as an approved change would (DEC-117). */
function inChange<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
  return setup.run(admin.id, work);
}

function done<V>(result: NumberingResult<V>): V {
  if (result.kind !== 'done') throw new Error(`Refused: ${result.refusal.code}`);
  return result.value;
}

async function listed(user: SyntheticUser) {
  const call = await get(cookies.get(user.id) ?? '', '/api/pos/billing-devices');
  expect(call.status).toBe(200);
  return billingDeviceListSchema.parse(call.body).devices;
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('posdevices');
  database = world.organisations[0].database;
  organisationCode = world.organisations[0].code;
  await writeSyntheticSetting(database, 'access.sign-in-throttling', { failureLimit: 50, windowSeconds: 600 });
  await writeSyntheticSetting(database, 'access.password-rules', { minimumLength: 12 });
  await writeSyntheticSetting(database, 'access.office-session-limits', {
    idleLockSeconds: 1800,
    absoluteSeconds: 28800,
  });
  keys = syntheticKeysEnvironment(world);
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock });
  setup = await structureSetup({
    directory: world.directory,
    database,
    organisationCode,
    keysEnvironment: keys,
    label: 'POS',
  });
  const geography = await approvedGeography(setup, 'POS');
  stores = await syntheticStores(setup, { stateId: geography.state.recordId, areaId: geography.area.recordId })();
  pos = new Pos({
    audit: new Audit(capturingLogger().logger),
    access: setup.access,
    organisation: setup.organisation,
    numbering,
  });
  admin = await enrolled('DEVICE-ADMIN', DEVICE_AUTHORITY);
  cashier = await enrolled('CASHIER', [{ recordType: 'access.session', action: 'view' }]);
  outsider = await enrolled('DEVICE-OUTSIDER', [{ recordType: 'merchandise.party', action: 'view' }]);
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (setup as StructureSetup | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('registering a billing device (offline-counter 3.1, 3.2 step 1, 12.1)', () => {
  it('PRD-ORG-005 GC-8 test 2 a unit of another Store, an office or a warehouse is refused, naming each', async () => {
    const call = await register([stores.wholeStore, stores.otherStoreUnit, stores.warehouse, stores.office]);
    expect(call.status).toBe(422);
    expect(errorOf(call)).toMatchObject({ kind: 'refused', code: 'pos.unit-not-of-store' });
    expect(errorOf(call).missing?.map(({ kind, id }) => ({ kind, id }))).toEqual([
      { kind: 'business-unit', id: stores.otherStoreUnit },
      { kind: 'business-unit', id: stores.warehouse },
      { kind: 'business-unit', id: stores.office },
    ]);
    expect(errorOf(call).missing?.every((item) => typeof item.code === 'string')).toBe(true);
    expect(errorOf(await register([stores.wholeStore, stores.wholeStore])).code).toBe('pos.unit-listed-twice');
    const unknownStore = await post(admin, '/api/pos/billing-devices', {
      code: nextCode('TILL'),
      label: syntheticName('Till'),
      storeId: uuidv7(),
      businessUnitIds: [stores.wholeStore],
    });
    expect(unknownStore.status).toBe(404);
    expect(errorOf(unknownStore).code).toBe('pos.store-not-found');
  });

  it('POL-02.03 registering needs the permission through a role assignment', async () => {
    const call = await post(outsider, '/api/pos/billing-devices', {
      code: nextCode('TILL'),
      label: syntheticName('Till'),
      storeId: stores.storeId,
      businessUnitIds: [stores.wholeStore],
    });
    expect(call.status).toBe(403);
    expect(errorOf(call).code).toBe('access.not-authorised');
    expect((await get(cookies.get(outsider.id) ?? '', '/api/pos/billing-devices')).status).toBe(403);
  });

  it('PRD-ACS-013 PRD-SEC-007 PRD-INT-004 GC-8 test 10 a device registered Setting up writes its audit and access records in the same transaction', async () => {
    const code = nextCode('TILL');
    const call = await register([stores.wholeStore, stores.counterSameRegistration], code);
    expect(call.status).toBe(200);
    expect(call.body).toMatchObject({ state: 'Setting up' });
    const deviceId = call.body.deviceId as string;
    const device = (await listed(admin)).find((each) => each.deviceId === deviceId);
    expect(device).toMatchObject({ code, state: 'Setting up', storeId: stores.storeId, series: [] });
    expect(device?.units.map((unit) => unit.businessUnitId).sort()).toEqual(
      [stores.wholeStore, stores.counterSameRegistration].sort(),
    );
    const [row] = await query<{ device: Date; audit: Date; access: Date; event: string }>(
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
    const again = await register([stores.wholeStore], code.toLowerCase());
    expect(errorOf(again).code).toBe('access.device-code-taken');
  });
});

describe('enrolling a billing device (offline-counter 3.2 steps 2 and 3, 4.1)', () => {
  let early: { deviceId: string; code: string };
  let earlyKey: Key;

  it('GC8-8 enrolment without a fresh authenticator code is refused', async () => {
    early = await registered([stores.wholeStore, stores.counterOtherRegistration]);
    earlyKey = await syntheticDeviceKey(organisationCode);
    // A code of a step long past is no fresh code (access-and-approvals 3.3).
    const stale = codeFor(admin.factorSecret ?? Buffer.alloc(0), -10, clock.now());
    const call = await enrol(early.deviceId, earlyKey, { totpCode: stale });
    expect(call.status).toBe(403);
    expect(errorOf(call).code).toBe('access.authenticator-code-refused');
  });

  it('DEC-116 GC-8 test 8 with no bill format and no financial year, enrolment succeeds and defines no series, naming what is missing', async () => {
    const call = await enrol(early.deviceId, earlyKey);
    expect(call.status).toBe(200);
    const answer = deviceEnrolledSchema.parse(call.body);
    expect(answer).toMatchObject({ deviceId: early.deviceId, state: 'Active', series: [] });
    expect(answer.seriesMissing).toEqual([
      { kind: 'bill-format' },
      { kind: 'financial-year', date: clock.now().toISOString().slice(0, 10) },
    ]);
    expect((await listed(admin)).find((each) => each.deviceId === early.deviceId)).toMatchObject({
      state: 'Active',
      series: [],
    });
  });

  it('PRD-OFF-010 GC-8 test 3 a second enrolment of a device is refused', async () => {
    const call = await enrol(early.deviceId, await syntheticDeviceKey(organisationCode));
    expect(call.status).toBe(422);
    expect(errorOf(call).code).toBe('access.device-already-enrolled');
  });

  it('PRD-OFF-010 GC-8 test 3 a proof signed by another key, or for another purpose, is refused and binds nothing', async () => {
    const device = await registered([stores.wholeStore]);
    const key = await syntheticDeviceKey(organisationCode);
    const byOther = await enrol(device.deviceId, key, { signer: await syntheticDeviceKey(organisationCode) });
    expect(errorOf(byOther).code).toBe('access.device-proof-refused');
    const forSignIn = await enrol(device.deviceId, key, { purpose: 'sign-in' });
    expect(errorOf(forSignIn).code).toBe('access.device-proof-refused');
    expect((await listed(admin)).find((each) => each.deviceId === device.deviceId)?.state).toBe('Setting up');
    const [row] = await query<{ key: unknown; records: string }>(
      `select d.public_key as key,
              (select count(*) from audit.access_record r where r.device_id = d.id and r.kind = 'device-enrolled') as records
         from access.device d where d.id = $1`,
      [device.deviceId],
    );
    expect(row).toEqual({ key: null, records: '0' });
  });

  it('DEC-117 the change that defines the bill format and the financial year gives every Active device its missing series, once', async () => {
    const today = clock.now().toISOString().slice(0, 10);
    const first = await inChange(async (context) => {
      done(await numbering.defineFormatVersion(context, BILL_FORMAT_CODE, BILL_FORMAT));
      done(await numbering.setKindFormat(context, BILL_KIND.kind, BILL_FORMAT_CODE, 'synthetic'));
      done(
        await numbering.defineFinancialYear(context, {
          label: YEAR,
          firstDay: setup.day(-30),
          lastDay: setup.day(300),
          origin: 'synthetic',
        }),
      );
      return pos.defineMissingSeries(context, today);
    });
    if (first.kind !== 'success') throw new Error(first.refusal.code);
    const device = (await listed(admin)).find((each) => each.deviceId === early.deviceId);
    expect(device?.series.map((each) => [each.taxRegistrationId, each.financialYear, each.state]).sort()).toEqual(
      [
        [stores.registrationIds[0], YEAR, 'Open'],
        [stores.registrationIds[1], YEAR, 'Open'],
      ].sort(),
    );
    expect(first.answer.definedSeriesIds.sort()).toEqual(device?.series.map((each) => each.seriesId).sort());
    // A repeat defines nothing twice and leaves each series as it is (retry-safe).
    const again = await inChange((context) => pos.defineMissingSeries(context, today));
    expect(again).toEqual({ kind: 'success', answer: { definedSeriesIds: [] } });
    expect((await listed(admin)).find((each) => each.deviceId === early.deviceId)?.series).toEqual(device?.series);
  });

  it('PRD-POS-020 PRD-OFF-002 DEC-005 GC-8 test 1 an enrolled device gets one Open series per registration of its units', async () => {
    const device = await registered([
      stores.wholeStore,
      stores.counterSameRegistration,
      stores.counterOtherRegistration,
    ]);
    const call = await enrol(device.deviceId, await syntheticDeviceKey(organisationCode));
    expect(call.status).toBe(200);
    const answer = deviceEnrolledSchema.parse(call.body);
    expect(answer.seriesMissing).toEqual([]);
    expect(answer.series.map((each) => [each.taxRegistrationId, each.financialYear, each.state]).sort()).toEqual(
      [
        [stores.registrationIds[0], YEAR, 'Open'],
        [stores.registrationIds[1], YEAR, 'Open'],
      ].sort(),
    );
    const [row] = await query<{ event: string; audits: string }>(
      `select (select o.event_type from kernel.outbox_event o where o.subject_record_id = $1 and o.event_type = 'pos.device-enrolled') as event,
              (select count(*) from audit.audit_record a where a.record_id = $1 and a.operation = 'enrol-billing-device') as audits`,
      [device.deviceId],
    );
    expect(row).toEqual({ event: 'pos.device-enrolled', audits: '1' });
  });

  it('PRD-ACS-013 PRD-INT-004 GC-8 test 10 an enrolment whose series is refused commits nothing: no key, no record', async () => {
    await inChange(async (context) => {
      done(await numbering.defineFormatVersion(context, NO_DEVICE_FORMAT_CODE, NO_DEVICE_FORMAT));
      done(await numbering.setKindFormat(context, BILL_KIND.kind, NO_DEVICE_FORMAT_CODE, 'synthetic'));
    });
    try {
      const one = await registered([stores.counterOtherRegistration]);
      expect((await enrol(one.deviceId, await syntheticDeviceKey(organisationCode))).status).toBe(200);
      // A second device of the same registration and year could repeat the first one's texts (numbering-and-audit 3.5).
      const two = await registered([stores.counterOtherRegistration]);
      const refused = await enrol(two.deviceId, await syntheticDeviceKey(organisationCode));
      expect(errorOf(refused).code).toBe('numbering.format-could-repeat');
      const [row] = await query<{ key: unknown; versions: string; records: string; audits: string }>(
        `select d.public_key as key,
                (select count(*) from access.device_version v where v.device_id = d.id) as versions,
                (select count(*) from audit.access_record r where r.device_id = d.id and r.kind = 'device-enrolled') as records,
                (select count(*) from audit.audit_record a where a.record_id = d.id and a.operation = 'enrol-billing-device') as audits
           from access.device d where d.id = $1`,
        [two.deviceId],
      );
      expect(row).toEqual({ key: null, versions: '1', records: '0', audits: '0' });
    } finally {
      await inChange(async (context) =>
        done(await numbering.setKindFormat(context, BILL_KIND.kind, BILL_FORMAT_CODE, 'synthetic')),
      );
    }
  });
});

describe('device bill series in numbering (numbering-and-audit 3.2, 3.4, 7 tests 2 and 3)', () => {
  let one: string;
  let two: string;

  beforeAll(async () => {
    for (const assign of [(id: string) => (one = id), (id: string) => (two = id)]) {
      const device = await registered([stores.wholeStore]);
      const answer = deviceEnrolledSchema.parse(
        (await enrol(device.deviceId, await syntheticDeviceKey(organisationCode))).body,
      );
      assign(answer.series[0]?.seriesId ?? '');
    }
  });

  /** A synthetic bill document numbered from a device series, which the command locks last at step 8. */
  function numberBill(seriesId: string, hold?: (context: TransactionContext) => Promise<void>) {
    return inChange(async (context) => {
      await context.lock(LOCK_STEP.numberSeries, [numbering.seriesLockTarget(seriesId)]);
      await hold?.(context);
      return done(
        await numbering.allocate(context, { seriesId, documentType: 'test-synthetic.bill', documentId: uuidv7() }),
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
    await waitUntilAnyWaitingForLock(database, [firstPid]);
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
    const live = await inChange((context) => numbering.seriesState(context, one));
    const refused = await inChange((context) =>
      numbering.defineSeries(context, {
        kind: BILL_KIND.kind,
        scopeKey: live?.scopeKey ?? '',
        financialYear: YEAR,
        displayScopeKey: `registration:${stores.registrationIds[0]}`,
        scopeText: syntheticCode('ANOTHER'),
        formatCode: BILL_FORMAT_CODE,
      }),
    );
    expect(refused.kind === 'refused' ? refused.refusal.code : undefined).toBe('numbering.live-series-exists');
  });
});

describe('proving the device at sign-in (offline-counter 3.3, 3.4)', () => {
  let device: { deviceId: string; code: string };
  let key: Key;

  beforeAll(async () => {
    device = await registered([stores.wholeStore]);
    key = await syntheticDeviceKey(organisationCode);
    expect((await enrol(device.deviceId, key)).status).toBe(200);
  });

  it('RR-303 a device sign-in is unavailable, naming it, while the shared POS session limits are not set', async () => {
    const call = await signIn(cashier, await proof(device.deviceId, key));
    expect(call.status).toBe(403);
    expect(call.body.error).toMatchObject({
      code: 'access.sign-in-unavailable',
      missing: [{ kind: 'setting', setting: 'access.shared-pos-session-limits' }],
    });
    await writeSyntheticSetting(database, 'access.shared-pos-session-limits', {
      idleLockSeconds: 300,
      absoluteSeconds: 43200,
    });
  });

  it('POL-02.18 GC-8 test 4 a sign-in with a valid device proof makes a shared POS session bound to the device; without one, an office session', async () => {
    const onDevice = await signIn(cashier, await proof(device.deviceId, key));
    expect(onDevice.status).toBe(200);
    const pos = sessionViewSchema.parse((await get(onDevice.cookie, '/api/access/session')).body);
    expect(pos.device).toEqual({ deviceId: device.deviceId, code: device.code });
    expect(pos.idleLockSeconds).toBe(300);
    const office = await signIn(cashier);
    const view = sessionViewSchema.parse((await get(office.cookie, '/api/access/session')).body);
    expect(view.device).toBeUndefined();
    expect(view.idleLockSeconds).toBe(1800);
    const sessions = await query<{ kind: string; device_id: string | null }>(
      `select kind, device_id from access.session where app_user_id = $1 order by started_at, id`,
      [cashier.id],
    );
    expect(sessions.slice(-2)).toEqual([
      { kind: 'shared-pos', device_id: device.deviceId },
      { kind: 'office', device_id: null },
    ]);
    const [record] = await query<{ device_id: string }>(
      `select device_id from audit.access_record where user_id = $1 and kind = 'sign-in' and device_id is not null`,
      [cashier.id],
    );
    expect(record?.device_id).toBe(device.deviceId);
  });

  it('PRD-OFF-010 GC-8 test 3 a proof signed by another key, a used challenge or a device not enrolled is refused', async () => {
    const byOther = await signIn(cashier, await proof(device.deviceId, await syntheticDeviceKey(organisationCode)));
    expect(errorOf(byOther).code).toBe('access.sign-in-refused');
    const used = await proof(device.deviceId, key);
    expect((await signIn(cashier, used)).status).toBe(200);
    expect(errorOf(await signIn(cashier, used)).code).toBe('access.sign-in-refused');
    const settingUp = await registered([stores.wholeStore]);
    const notEnrolled = await signIn(cashier, await proof(settingUp.deviceId, key));
    expect(errorOf(notEnrolled).code).toBe('access.sign-in-refused');
    const unknown = await signIn(cashier, await proof(uuidv7(), key));
    expect(errorOf(unknown).code).toBe('access.sign-in-refused');
  });
});
