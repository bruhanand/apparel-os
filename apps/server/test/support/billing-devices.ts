import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  billingDeviceListSchema,
  deviceChallengeSchema,
  deviceEnrolledSchema,
  type DeviceProofPurpose,
  type DevicePublicKey,
} from '@apparel-os/schemas';
import { expect } from 'vitest';
import { LOCK_STEP, type TransactionContext } from '../../src/kernel/index.js';
import { Audit } from '../../src/modules/audit/index.js';
import { Numbering, type FormatPart, type NumberingResult } from '../../src/modules/numbering/index.js';
import { BILL_KIND, Pos } from '../../src/modules/pos/index.js';
import { syntheticCode, syntheticName } from '../fixtures/synthetic.js';
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
} from './access.js';
import { grantSynthetic, type SyntheticAuthority } from './grants.js';
import { capturingLogger } from './jobs.js';
import { approvedGeography, structureSetup, type StructureSetup } from './organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './organisations.js';
import { syntheticDeviceKey, syntheticStores, type SyntheticStores } from './pos.js';
import { connect } from './postgres.js';

// The harness of the billing-device tests (S1-F12; offline-counter 3, 4, 11, 14.1), shared by the enrolment, lifecycle
// and series files, each with its own SYNTHETIC Organisation: the whole application on real PostgreSQL, the structure
// made through organisation's real commands, the device keys made with WebCrypto as the counter makes them. The
// bill-number format and the financial year are OPEN (V-40, RR-101; GC5-1, RR-060): every format, year, person and
// limit here is SYNTHETIC.

export interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export type Key = Awaited<ReturnType<typeof syntheticDeviceKey>>;

export const DEVICE_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'pos.billing_device', action: 'view' },
  { recordType: 'pos.billing_device', action: 'create' },
  { recordType: 'pos.billing_device', action: 'edit' },
];

/** A SYNTHETIC bill format carrying the device, so two devices' numbers of one registration and year never meet. */
export const BILL_FORMAT: FormatPart[] = [
  { kind: 'text', text: 'SYN/' },
  { kind: 'scope' },
  { kind: 'text', text: '/' },
  { kind: 'year' },
  { kind: 'text', text: '/' },
  { kind: 'sequence', width: 5 },
];
/** A SYNTHETIC format without the device: two devices of one registration and year could repeat its texts (3.5). */
export const NO_DEVICE_FORMAT: FormatPart[] = [
  { kind: 'text', text: 'SYN-ND-' },
  { kind: 'year' },
  { kind: 'text', text: '-' },
  { kind: 'sequence', width: 5 },
];

let counter = 0;
export const nextCode = (prefix: string) =>
  syntheticCode(`${prefix}-${String(++counter)}-${String(randomInt(1_000_000))}`);

export const errorOf = (call: Call) =>
  call.body.error as { kind: string; code: string; missing?: Record<string, string>[] };

export function done<V>(result: NumberingResult<V>): V {
  if (result.kind !== 'done') throw new Error(`Refused: ${result.refusal.code}`);
  return result.value;
}

/** One test file's SYNTHETIC Organisation with a Store, its units, the device Admin, a cashier and an outsider. */
export class DevicesWorld {
  /** numbering serving the bill, as the application composes it (offline-counter 4.1). */
  readonly numbering = new Numbering({ kinds: [BILL_KIND] });
  readonly billFormatCode = syntheticCode(`BILL-${String(randomInt(1_000_000))}`);
  readonly noDeviceFormatCode = syntheticCode(`BILL-ND-${String(randomInt(1_000_000))}`);
  readonly year = syntheticCode(`FY-${String(randomInt(1_000_000))}`);
  readonly cookies = new Map<string, string>();
  world!: SyntheticWorld;
  database!: string;
  organisationCode!: string;
  api!: AccessTestApp;
  clock!: SyntheticClock;
  keys!: Record<string, string>;
  setup!: StructureSetup;
  stores!: SyntheticStores;
  pos!: Pos;
  admin!: SyntheticUser;
  /** The Admin's role assignment, for a command run through `pos` directly (numbering-and-audit 4.1). */
  adminAssignmentId!: string;
  cashier!: SyntheticUser;
  outsider!: SyntheticUser;

  constructor(private readonly label: string) {}

  async start(): Promise<void> {
    this.world = await createSyntheticOrganisations(this.label);
    this.database = this.world.organisations[0].database;
    this.organisationCode = this.world.organisations[0].code;
    await writeSyntheticSetting(this.database, 'access.sign-in-throttling', { failureLimit: 50, windowSeconds: 600 });
    await writeSyntheticSetting(this.database, 'access.password-rules', { minimumLength: 12 });
    await writeSyntheticSetting(this.database, 'access.office-session-limits', {
      idleLockSeconds: 1800,
      absoluteSeconds: 28800,
    });
    this.keys = syntheticKeysEnvironment(this.world);
    this.clock = new SyntheticClock();
    this.api = await startAccessApp(this.world, this.keys, { clock: this.clock });
    this.setup = await structureSetup({
      directory: this.world.directory,
      database: this.database,
      organisationCode: this.organisationCode,
      keysEnvironment: this.keys,
      label: 'POS',
    });
    const geography = await approvedGeography(this.setup, 'POS');
    this.stores = await syntheticStores(this.setup, {
      stateId: geography.state.recordId,
      areaId: geography.area.recordId,
    })();
    this.pos = new Pos({
      audit: new Audit(capturingLogger().logger),
      access: this.setup.access,
      organisation: this.setup.organisation,
      numbering: this.numbering,
    });
    const admin = await this.enrolled('DEVICE-ADMIN', DEVICE_AUTHORITY);
    this.admin = admin.user;
    this.adminAssignmentId = admin.assignmentId ?? '';
    this.cashier = (await this.enrolled('CASHIER', [{ recordType: 'access.session', action: 'view' }])).user;
    this.outsider = (
      await this.enrolled('DEVICE-OUTSIDER', [{ recordType: 'merchandise.party', action: 'view' }])
    ).user;
  }

  async close(): Promise<void> {
    await (this.api as AccessTestApp | undefined)?.close();
    await (this.setup as StructureSetup | undefined)?.close();
    await (this.world as SyntheticWorld | undefined)?.reset();
  }

  freshCode(user: SyntheticUser): string {
    this.clock.advance(30);
    return codeFor(user.factorSecret ?? Buffer.alloc(0), 0, this.clock.now());
  }

  today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }

  async signIn(
    user: SyntheticUser,
    device?: Record<string, unknown>,
    networkAddress = '10.9.12.1',
  ): Promise<Call & { cookie: string }> {
    const response = await fetch(`${this.api.baseUrl}/api/access/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': networkAddress },
      body: JSON.stringify({
        organisationCode: this.organisationCode,
        login: user.login,
        password: user.password,
        totpCode: this.freshCode(user),
        ...(device === undefined ? {} : { device }),
      }),
    });
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
      cookie: (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '',
    };
  }

  private async enrolled(
    label: string,
    authorities: readonly SyntheticAuthority[],
  ): Promise<{ user: SyntheticUser; assignmentId?: string }> {
    const user = await writeSyntheticUser(this.database, this.organisationCode, this.keys, {
      label: `${label}${String(randomInt(1_000_000))}`,
      enrolled: true,
      personas: ['P-ADM'],
    });
    const granted =
      authorities.length > 0
        ? await grantSynthetic(this.database, { kind: 'user', id: user.id }, authorities)
        : undefined;
    const signed = await this.signIn(user);
    expect(signed.status).toBe(200);
    this.cookies.set(user.id, signed.cookie);
    return { user, ...(granted === undefined ? {} : { assignmentId: granted.assignmentId }) };
  }

  async post(
    user: SyntheticUser | undefined,
    path: string,
    body: unknown,
    options: { readonly key?: string; readonly networkAddress?: string } = {},
  ): Promise<Call> {
    const response = await fetch(`${this.api.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: SYNTHETIC_ORIGIN,
        ...(options.networkAddress === undefined ? {} : { 'x-forwarded-for': options.networkAddress }),
        ...(user === undefined
          ? {}
          : { cookie: this.cookies.get(user.id) ?? '', 'idempotency-key': options.key ?? uuidv7() }),
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  async get(cookie: string, path: string): Promise<Call> {
    const response = await fetch(`${this.api.baseUrl}${path}`, { headers: { cookie } });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  /** Asks for a one-time challenge, as the counter does before an enrolment or a sign-in. */
  async challenge(networkAddress?: string): Promise<{ challengeId: string; challenge: string }> {
    const call = await this.post(
      undefined,
      '/api/access/device-challenges',
      { organisationCode: this.organisationCode },
      networkAddress === undefined ? {} : { networkAddress },
    );
    expect(call.status).toBe(200);
    return deviceChallengeSchema.parse(call.body);
  }

  async register(units: readonly string[], code = nextCode('TILL')): Promise<Call> {
    return this.post(this.admin, '/api/pos/billing-devices', {
      code,
      label: syntheticName('Till'),
      storeId: this.stores.storeId,
      businessUnitIds: units,
    });
  }

  async registered(units: readonly string[]): Promise<{ deviceId: string; code: string }> {
    const code = nextCode('TILL');
    const call = await this.register(units, code);
    expect(call.status).toBe(200);
    return { deviceId: call.body.deviceId as string, code };
  }

  /** Enrols the device with the key, signing a fresh challenge for the purpose given, as the counter does. */
  async enrol(
    deviceId: string,
    key: Key,
    options: { readonly signer?: Key; readonly purpose?: DeviceProofPurpose; readonly totpCode?: string } = {},
  ): Promise<Call> {
    const issued = await this.challenge();
    const signature = await (options.signer ?? key).sign(options.purpose ?? 'enrol', deviceId, issued.challenge);
    return this.post(this.admin, `/api/pos/billing-devices/${deviceId}/enrolment`, {
      publicKey: key.publicKey satisfies DevicePublicKey,
      challengeId: issued.challengeId,
      signature,
      totpCode: options.totpCode ?? this.freshCode(this.admin),
    });
  }

  async proof(deviceId: string, key: Key, purpose: DeviceProofPurpose = 'sign-in') {
    const issued = await this.challenge();
    return {
      deviceId,
      challengeId: issued.challengeId,
      signature: await key.sign(purpose, deviceId, issued.challenge),
    };
  }

  async query<T extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
    const client = await connect(this.database, 'migration');
    try {
      return (await client.query<T>(text, values)).rows;
    } finally {
      await client.end();
    }
  }

  /** Runs work in one command of the structure setup's clock, as an approved change would (DEC-117). */
  inChange<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
    return this.setup.run(this.admin.id, work);
  }

  /** Holds every billing device's rows at step 1, as the change that defines their missing series does (DEC-117). */
  async holdDevices(context: TransactionContext): Promise<void> {
    await context.lock(LOCK_STEP.document, await this.pos.missingSeriesLockTargets(context));
  }

  /** Defines the missing series of every Active device for the date's financial year, in a change of its own. */
  defineMissingSeries(date: string) {
    return this.inChange(async (context) => {
      await this.holdDevices(context);
      return this.pos.defineMissingSeries(context, date);
    });
  }

  async listed(user: SyntheticUser) {
    const call = await this.get(this.cookies.get(user.id) ?? '', '/api/pos/billing-devices');
    expect(call.status).toBe(200);
    return billingDeviceListSchema.parse(call.body).devices;
  }

  /** Defines the SYNTHETIC bill format and financial year, as the approved change of DEC-117 would. */
  async defineFormatAndYear(): Promise<void> {
    await this.inChange(async (context) => {
      done(await this.numbering.defineFormatVersion(context, this.billFormatCode, BILL_FORMAT));
      done(await this.numbering.setKindFormat(context, BILL_KIND.kind, this.billFormatCode, 'synthetic'));
      done(
        await this.numbering.defineFinancialYear(context, {
          label: this.year,
          firstDay: this.setup.day(-30),
          lastDay: this.setup.day(300),
          origin: 'synthetic',
        }),
      );
    });
  }

  /** Sets the SYNTHETIC limits of a shared POS session, so a device sign-in is available (RR-303). */
  async setSharedPosLimits(): Promise<void> {
    await writeSyntheticSetting(this.database, 'access.shared-pos-session-limits', {
      idleLockSeconds: 300,
      absoluteSeconds: 43200,
    });
  }

  /** Registers and enrols a device for the units, answering its identifier, code, key and series. */
  async activeDevice(units: readonly string[]) {
    const device = await this.registered(units);
    const key = await syntheticDeviceKey(this.organisationCode);
    const answer = deviceEnrolledSchema.parse((await this.enrol(device.deviceId, key)).body);
    return { ...device, key, series: answer.series };
  }

  async end(deviceId: string, how: 'revocation' | 'retirement', by: SyntheticUser = this.admin): Promise<Call> {
    return this.post(by, `/api/pos/billing-devices/${deviceId}/${how}`, {});
  }

  allocateFrom(seriesId: string) {
    return this.inChange(async (context) => {
      await context.lock(LOCK_STEP.numberSeries, [this.numbering.seriesLockTarget(seriesId)]);
      return this.numbering.allocate(context, {
        seriesId,
        documentType: 'test-synthetic.bill',
        documentId: uuidv7(),
      });
    });
  }

  newKey(): Promise<Key> {
    return syntheticDeviceKey(this.organisationCode);
  }
}
