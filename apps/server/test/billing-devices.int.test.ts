import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  billingDeviceEndedSchema,
  billingDeviceListSchema,
  billingDeviceReplacedSchema,
  billingDeviceUnitsChangedSchema,
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
import { BILL_KIND, Pos, posConsumers, unitDevicesCheck } from '../src/modules/pos/index.js';
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
import { approvedGeography, decided, prepared, structureSetup, type StructureSetup } from './support/organisation.js';
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

// S1-F12-T02: the end of a device's life, its units, its series following a mapping change, and the devices readiness
// check (offline-counter 3.5, 4.3, 4.4, 11, 12.1, 14.1 tests 3, 5, 6, 7, 8, 9 and 10; numbering-and-audit 7 test 4;
// access-and-approvals 15 test 5). The format and year set above stay in force: every value is SYNTHETIC.

/** Registers and enrols a device for the units, answering its identifier, code, key and series. */
async function activeDevice(units: readonly string[]) {
  const device = await registered(units);
  const key = await syntheticDeviceKey(organisationCode);
  const answer = deviceEnrolledSchema.parse((await enrol(device.deviceId, key)).body);
  return { ...device, key, series: answer.series };
}

async function end(deviceId: string, how: 'revocation' | 'retirement', by: SyntheticUser = admin): Promise<Call> {
  return post(by, `/api/pos/billing-devices/${deviceId}/${how}`, {});
}

function allocateFrom(seriesId: string) {
  return inChange(async (context) => {
    await context.lock(LOCK_STEP.numberSeries, [numbering.seriesLockTarget(seriesId)]);
    return numbering.allocate(context, { seriesId, documentType: 'test-synthetic.bill', documentId: uuidv7() });
  });
}

describe('revoking a lost device (offline-counter 3.5, 4.4; access-and-approvals 15 test 5)', () => {
  it('PRD-SEC-008 PRD-OFF-010 GC-8 test 5 revoking an online till ends its sessions at their next request and closes its series in the same transaction', async () => {
    const device = await activeDevice([stores.wholeStore, stores.counterOtherRegistration]);
    expect(device.series).toHaveLength(2);
    const onDevice = await signIn(cashier, await proof(device.deviceId, device.key));
    expect(onDevice.status).toBe(200);
    expect((await get(onDevice.cookie, '/api/access/session')).status).toBe(200);
    const call = await end(device.deviceId, 'revocation');
    expect(call.status).toBe(200);
    const answer = billingDeviceEndedSchema.parse(call.body);
    expect(answer.state).toBe('Revoked');
    expect(answer.closedSeriesIds.sort()).toEqual(device.series.map((each) => each.seriesId).sort());
    // The session's next request is not signed in (PRD-SEC-008).
    expect((await get(onDevice.cookie, '/api/access/session')).status).toBe(401);
    const listedDevice = (await listed(admin)).find((each) => each.deviceId === device.deviceId);
    expect(listedDevice?.state).toBe('Revoked');
    expect(listedDevice?.series.map((each) => each.state)).toEqual(['Closed', 'Closed']);
    const [row] = await query<{ version: Date; audit: Date; access: Date; series: Date; event: string }>(
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
    const device = await activeDevice([stores.wholeStore]);
    const seriesId = device.series[0]?.seriesId ?? '';
    expect(await allocateFrom(seriesId)).toMatchObject({ kind: 'done' });
    expect((await end(device.deviceId, 'revocation')).status).toBe(200);
    const refused = await allocateFrom(seriesId);
    expect(refused.kind === 'refused' ? refused.refusal.code : undefined).toBe('numbering.series-closed');
    const release = await inChange(async (context) => {
      await context.lock(LOCK_STEP.numberSeries, [numbering.seriesLockTarget(seriesId)]);
      return numbering.release(context, seriesId);
    });
    expect(release.kind === 'refused' ? release.refusal.code : undefined).toBe('numbering.series-closed');
  });

  it('PRD-OFF-010 GC-8 test 3 a Revoked device is final: its proof is refused, and revoking or retiring it again is refused', async () => {
    const device = await activeDevice([stores.wholeStore]);
    expect((await end(device.deviceId, 'revocation')).status).toBe(200);
    expect(errorOf(await signIn(cashier, await proof(device.deviceId, device.key))).code).toBe(
      'access.sign-in-refused',
    );
    for (const how of ['revocation', 'retirement'] as const) {
      const again = await end(device.deviceId, how);
      expect(again.status).toBe(422);
      expect(errorOf(again).code).toBe('access.device-ended');
    }
    expect((await enrol(device.deviceId, await syntheticDeviceKey(organisationCode))).status).toBe(422);
  });

  it('POL-02.03 revoking needs edit on the device through a role assignment; an unknown device is not found', async () => {
    const device = await registered([stores.wholeStore]);
    expect(errorOf(await end(device.deviceId, 'revocation', outsider)).code).toBe('access.not-authorised');
    const unknown = await end(uuidv7(), 'revocation');
    expect(unknown.status).toBe(404);
    expect(errorOf(unknown).code).toBe('access.device-not-found');
  });
});

describe('retiring and replacing a device (offline-counter 3.5)', () => {
  it('PRD-OFF-010 retiring an online till closes its series and ends its sessions at once; it is Ended, and pos.device-ended is published', async () => {
    const device = await activeDevice([stores.wholeStore]);
    const onDevice = await signIn(cashier, await proof(device.deviceId, device.key));
    const call = await end(device.deviceId, 'retirement');
    expect(call.status).toBe(200);
    expect(billingDeviceEndedSchema.parse(call.body)).toEqual({
      deviceId: device.deviceId,
      state: 'Ended',
      closedSeriesIds: device.series.map((each) => each.seriesId),
    });
    expect((await get(onDevice.cookie, '/api/access/session')).status).toBe(401);
    const [row] = await query<{ access: string; event: string }>(
      `select (select count(*) from audit.access_record r where r.device_id = $1 and r.kind = 'device-ended') as access,
              (select o.event_type from kernel.outbox_event o where o.subject_record_id = $1 and o.event_type = 'pos.device-ended') as event`,
      [device.deviceId],
    );
    expect(row).toEqual({ access: '1', event: 'pos.device-ended' });
    expect(errorOf(await signIn(cashier, await proof(device.deviceId, device.key))).code).toBe(
      'access.sign-in-refused',
    );
  });

  it('a device still Setting up may be retired: it has no series to close', async () => {
    const device = await registered([stores.wholeStore]);
    expect(billingDeviceEndedSchema.parse((await end(device.deviceId, 'retirement')).body)).toMatchObject({
      state: 'Ended',
      closedSeriesIds: [],
    });
  });

  it('PRD-OFF-010 PRD-LIF-015 GC-8 test 6 a replacement is a new device with a new code and fresh series; the old series stay closed', async () => {
    const old = await activeDevice([stores.wholeStore, stores.counterOtherRegistration]);
    const code = nextCode('TILL');
    const call = await post(admin, `/api/pos/billing-devices/${old.deviceId}/replacement`, {
      ending: 'revoke',
      code,
      label: syntheticName('Replacement till'),
    });
    expect(call.status).toBe(200);
    const answer = billingDeviceReplacedSchema.parse(call.body);
    expect(answer.ended).toMatchObject({ deviceId: old.deviceId, state: 'Revoked' });
    expect(answer.replacement.state).toBe('Setting up');
    const replacement = (await listed(admin)).find((each) => each.deviceId === answer.replacement.deviceId);
    expect(replacement).toMatchObject({ code, storeId: stores.storeId, replacesDeviceId: old.deviceId, series: [] });
    expect(replacement?.units.map((unit) => unit.businessUnitId).sort()).toEqual(
      [stores.wholeStore, stores.counterOtherRegistration].sort(),
    );
    const enrolled = deviceEnrolledSchema.parse(
      (await enrol(answer.replacement.deviceId, await syntheticDeviceKey(organisationCode))).body,
    );
    expect(enrolled.series).toHaveLength(2);
    for (const fresh of enrolled.series) {
      expect(old.series.map((each) => each.seriesId)).not.toContain(fresh.seriesId);
      expect((await inChange((context) => numbering.seriesState(context, fresh.seriesId)))?.nextSequence).toBe(1);
    }
    expect((await listed(admin)).find((each) => each.deviceId === old.deviceId)?.series.map((s) => s.state)).toEqual([
      'Closed',
      'Closed',
    ]);
  });

  it('a replacement whose code is taken is refused whole: the old device stays as it was', async () => {
    const old = await activeDevice([stores.wholeStore]);
    const call = await post(admin, `/api/pos/billing-devices/${old.deviceId}/replacement`, {
      ending: 'retire',
      code: old.code,
      label: syntheticName('Replacement till'),
    });
    expect(errorOf(call).code).toBe('access.device-code-taken');
    expect((await listed(admin)).find((each) => each.deviceId === old.deviceId)).toMatchObject({
      state: 'Active',
      series: [{ state: 'Open' }],
    });
  });
});

describe('changing a device’s units (offline-counter 12.1, 4.3)', () => {
  const change = (deviceId: string, businessUnitIds: readonly string[], validFrom: string) =>
    post(admin, `/api/pos/billing-devices/${deviceId}/units`, { businessUnitIds, validFrom });

  it('PRD-ORG-005 PRD-POS-020 a unit that brings a new registration gets the device’s series for it from the date', async () => {
    const device = await activeDevice([stores.wholeStore]);
    const from = setup.day(5);
    const call = await change(device.deviceId, [stores.wholeStore, stores.counterOtherRegistration], from);
    expect(call.status).toBe(200);
    const answer = billingDeviceUnitsChangedSchema.parse(call.body);
    expect(answer.seriesMissing).toEqual([]);
    expect(answer.series.map((each) => [each.taxRegistrationId, each.state]).sort()).toEqual(
      [
        [stores.registrationIds[0], 'Open'],
        [stores.registrationIds[1], 'Open'],
      ].sort(),
    );
    // Today it still lists only its first unit.
    expect(
      (await listed(admin)).find((each) => each.deviceId === device.deviceId)?.units.map((u) => u.businessUnitId),
    ).toEqual([stores.wholeStore]);
    const units = await query<{ unit: string; during: string }>(
      `select business_unit_id as unit, valid_during::text as during from pos.billing_device_unit
        where billing_device_id = $1 order by lower(valid_during), business_unit_id`,
      [device.deviceId],
    );
    expect(units).toEqual([
      { unit: stores.wholeStore, during: `[${setup.today()},)` },
      { unit: stores.counterOtherRegistration, during: `[${from},)` },
    ]);
    // A unit it drops ends at the date of a later change.
    const later = setup.day(9);
    expect((await change(device.deviceId, [stores.counterOtherRegistration], later)).status).toBe(200);
    const after = await query<{ unit: string; during: string }>(
      `select business_unit_id as unit, valid_during::text as during from pos.billing_device_unit
        where billing_device_id = $1 and business_unit_id = $2`,
      [device.deviceId, stores.wholeStore],
    );
    expect(after).toEqual([{ unit: stores.wholeStore, during: `[${setup.today()},${later})` }]);
  });

  it('the refusals: not Active, a past date, a change scheduled on that date or later, the same list, a unit not of the Store', async () => {
    const settingUp = await registered([stores.wholeStore]);
    expect(errorOf(await change(settingUp.deviceId, [stores.counterSameRegistration], setup.day(3))).code).toBe(
      'pos.device-not-active',
    );
    const device = await activeDevice([stores.wholeStore]);
    expect(errorOf(await change(device.deviceId, [stores.counterSameRegistration], setup.day(-1))).code).toBe(
      'pos.starts-in-past',
    );
    expect(errorOf(await change(device.deviceId, [stores.counterSameRegistration], setup.today())).code).toBe(
      'pos.unit-change-scheduled',
    );
    expect(errorOf(await change(device.deviceId, [stores.wholeStore], setup.day(3))).code).toBe('pos.units-unchanged');
    expect(errorOf(await change(device.deviceId, [stores.otherStoreUnit], setup.day(3))).code).toBe(
      'pos.unit-not-of-store',
    );
    // The database refuses a unit row's start moving, or the row going, the owner included (code-house-rules 7.3).
    const owner = await connect(database, 'migration');
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

describe('a unit’s mapping changing to another registration (offline-counter 4.3)', () => {
  it('PRD-ORG-005 PRD-POS-020 PRD-INT-008 GC-8 test 7 the device gets its series for the new registration before the date, once', async () => {
    const unit = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareBusinessUnit(c, p, {
          code: nextCode('BU'),
          siteId: stores.siteId,
          kind: 'brand-counter',
          storeId: stores.storeId,
          name: syntheticName('Moving counter'),
          legalEntityId: stores.legalEntityId,
          taxRegistrationId: stores.registrationIds[0],
          accountingBookId: stores.bookId,
          validFrom: setup.today(),
        }),
      ),
    );
    decided(await setup.decide(unit.requestId, unit.versionId));
    const device = await activeDevice([unit.recordId]);
    expect(device.series.map((each) => each.taxRegistrationId)).toEqual([stores.registrationIds[0]]);
    const from = setup.day(20);
    const mapping = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareBusinessUnitMappingVersion(c, p, unit.recordId, {
          legalEntityId: stores.legalEntityId,
          taxRegistrationId: stores.registrationIds[1],
          accountingBookId: stores.bookId,
          validFrom: from,
        }),
      ),
    );
    decided(await setup.decide(mapping.requestId, mapping.versionId));
    const [outbox] = await query<{ id: string }>(
      `select id from kernel.outbox_event where event_type = 'organisation.mapping-changed'
          and payload->>'mappingVersionId' = $1`,
      [mapping.versionId],
    );
    expect(outbox).toBeDefined();
    const consumer = posConsumers.find((each) => each.name === 'pos.define-series-for-mapping');
    const deliver = () =>
      inChange((context) =>
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
    const scopeKey = `device:${device.deviceId};registration:${stores.registrationIds[1]}`;
    const series = await query<{ state: string; year: string }>(
      `select state, financial_year as year from numbering.series where kind = 'pos.bill' and scope_key = $1`,
      [scopeKey],
    );
    expect(series).toEqual([{ state: 'Open', year: YEAR }]);
    // A second delivery defines nothing twice (PRD-INT-008).
    expect(await deliver()).toEqual({ kind: 'done' });
    expect(
      await query(`select id from numbering.series where kind = 'pos.bill' and scope_key = $1`, [scopeKey]),
    ).toHaveLength(1);
  });
});

describe('the devices readiness check (offline-counter section 11)', () => {
  const check = (unitId: string, date = setup.today()) =>
    inChange((context) => unitDevicesCheck(context, unitId, date));

  async function freshUnit(): Promise<string> {
    const unit = prepared(
      await setup.prepare((c, p) =>
        setup.organisation.prepareBusinessUnit(c, p, {
          code: nextCode('BU'),
          siteId: stores.siteId,
          kind: 'brand-counter',
          storeId: stores.storeId,
          name: syntheticName('Checked counter'),
          legalEntityId: stores.legalEntityId,
          taxRegistrationId: stores.registrationIds[0],
          accountingBookId: stores.bookId,
          validFrom: setup.today(),
        }),
      ),
    );
    decided(await setup.decide(unit.requestId, unit.versionId));
    return unit.recordId;
  }

  it('PRD-LIF-002 GC-8 test 9 selling fails with no Active device listing the unit, and passes with one holding its Open series', async () => {
    const unitId = await freshUnit();
    expect(await check(unitId)).toEqual([{ kind: 'billing-device', businessUnitId: unitId }]);
    const settingUp = await registered([unitId]);
    expect(await check(unitId)).toEqual([{ kind: 'billing-device', businessUnitId: unitId }]);
    expect((await enrol(settingUp.deviceId, await syntheticDeviceKey(organisationCode))).status).toBe(200);
    expect(await check(unitId)).toEqual([]);
  });

  it('PRD-LIF-002 GC-8 test 9 Revoked and Ended devices do not count; a device without its series fails, naming it', async () => {
    const unitId = await freshUnit();
    const first = await activeDevice([unitId]);
    const second = await activeDevice([unitId]);
    expect(await check(unitId)).toEqual([]);
    expect((await end(first.deviceId, 'revocation')).status).toBe(200);
    expect(await check(unitId)).toEqual([]);
    expect((await end(second.deviceId, 'retirement')).status).toBe(200);
    expect(await check(unitId)).toEqual([{ kind: 'billing-device', businessUnitId: unitId }]);
    // An Active device whose series for the unit's registration and year is missing fails, named by its code.
    const third = await activeDevice([unitId]);
    await inChange(async (context) => {
      const live = third.series[0]?.seriesId ?? '';
      await context.lock(LOCK_STEP.numberSeries, [numbering.seriesLockTarget(live)]);
      done(await numbering.pause(context, live));
    });
    expect(await check(unitId)).toEqual([
      { kind: 'device-series', deviceId: third.deviceId, code: third.code, lacks: 'series' },
    ]);
  });

  it('POL-10.07 DEC-116 GC-8 test 8 with no financial year for the date, the check fails with that reason', async () => {
    const unitId = await freshUnit();
    const device = await activeDevice([unitId]);
    // A date past the SYNTHETIC year, for which no year is defined.
    expect(await check(unitId, setup.day(400))).toEqual([
      { kind: 'device-series', deviceId: device.deviceId, code: device.code, lacks: 'financial-year' },
    ]);
  });
});
