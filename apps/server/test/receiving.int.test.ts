import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  arrivalReadSchema,
  inboxSchema,
  policyReadinessSchema,
  type Arrival,
  type AssignmentScope,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMAND_RUNNER,
  OrganisationRouter,
  type CommandRunner,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { mappingOn } from '../src/modules/organisation/index.js';
import { custody } from '../src/modules/stock/ledger/index.js';
import { syntheticName } from './fixtures/synthetic.js';
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
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { STORE_FILE_PATH, syntheticPdfUpload } from './support/opening-app.js';
import { structureSetup, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { allowVerifier, connect, databaseUrl } from './support/postgres.js';
import { defineSyntheticGrnSeries } from './fixtures/grn-series.js';
import {
  placeScope,
  RECEIPT_READER_AUTHORITY,
  RECEIVER_AUTHORITY,
  receivingFixture,
  receivingGateOpen,
  receivingGranted,
  receivingPolicyValidated,
  type ReceivingFixture,
} from './support/receiving.js';

// S2-F02-T02: the Receive Goods inbox, the Arrival with its invoices first, the count and a clean GRN through the whole
// application, on real PostgreSQL (goods-in 4.1 to 4.5, 10.3, 10.5, 12 tests 3, 18 and 19, part of tests 1 and 20;
// PRD-REC-001 to PRD-REC-005, PRD-REC-007, PRD-REC-008, PRD-ACP-001, PRD-LIF-001, PRD-INT-002, POL-10.08; DEC-133,
// DEC-138). The structure, the masters, the mappings' verification, the policies' Signed records and validations, the
// capability and receiving granted after readiness are all made through their real interfaces (support/receiving.ts;
// code-house-rules 11.2). Policies 4 and 10 are validated on the values the modules report, the fixture's tracking
// profile and its verified mappings, each labelled synthetic (goods-in 10.5; RR-558). Every person, place, brand,
// invoice and number here is SYNTHETIC.

let world: SyntheticWorld;
let database: string;
let organisationCode: string;
let organisation: RoutedOrganisation;
let router: OrganisationRouter;
let api: AccessTestApp;
let minio: TestFileStore;
let keys: Record<string, string>;
let clock: SyntheticClock;
let setup: StructureSetup;
let fixture: ReceivingFixture;
const cookies = new Map<string, string>();
/** A receiver of the first Store (P-STM), whose scope is that Store. */
let storeReceiver: SyntheticUser;
/** A receiver over every place, such as Warehouse (P-WHS) reaching every unit of the Site. */
let receiver: SyntheticUser;
/** A reader of the other Store's receipts only (goods-in 12 test 20). */
let otherStoreReader: SyntheticUser;
let outsider: SyntheticUser;
/** A reader of policy readiness, who sees each policy's values (module-map 4.4). */
let policyReader: SyntheticUser;

interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function freshCode(user: SyntheticUser): string {
  clock.advance(30);
  return codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now());
}

async function enrolled(
  label: string,
  authorities: readonly SyntheticAuthority[],
  scope?: AssignmentScope,
): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(database, organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
  });
  await grantSynthetic(database, { kind: 'user', id: user.id }, authorities, scope === undefined ? {} : { scope });
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.72' },
    body: JSON.stringify({ organisationCode, login: user.login, password: user.password, totpCode: freshCode(user) }),
  });
  expect(response.status).toBe(200);
  cookies.set(user.id, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
  return user;
}

async function post(user: SyntheticUser, path: string, body: unknown, key: string = uuidv7()): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: SYNTHETIC_ORIGIN,
      cookie: cookies.get(user.id) ?? '',
      'idempotency-key': key,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function get(user: SyntheticUser, path: string): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie: cookies.get(user.id) ?? '' } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const errorOf = (call: Call) => (call.body as { error?: { code: string; missing?: Record<string, string>[] } }).error;

let fileCount = 0;
/** A SYNTHETIC PDF stored through files-imports, as the screen stores an invoice or a photo first (S1-F06-T05). */
async function storedFile(user: SyntheticUser): Promise<{ storedFileId: string; fileReceiptId: string }> {
  fileCount += 1;
  const stored = await post(user, STORE_FILE_PATH, syntheticPdfUpload('RECEIVING', `FILE-${String(fileCount)}`));
  expect(stored.status, JSON.stringify(stored.body)).toBe(200);
  const { storedFileId, receiptId } = stored.body as { storedFileId: string; receiptId: string };
  return { storedFileId, fileReceiptId: receiptId };
}

/** An Arrival's body at a unit and its location, from the fixture's supplier and brand (goods-in 4.2). */
function arrivalBody(unit: string, location: string, overrides: Record<string, unknown> = {}) {
  return {
    businessUnitId: unit,
    receivingLocationId: location,
    supplierPartyId: fixture.supplier.id,
    brandId: fixture.brand.id,
    transporter: syntheticName('Transporter'),
    lorryReceipt: { number: 'SYN-LR-1', date: setup.today() },
    cartons: 3,
    arrivedAt: new Date(clock.now().getTime() - 3_600_000).toISOString(),
    ...overrides,
  };
}

async function recordArrival(user: SyntheticUser, unit: string, location: string): Promise<string> {
  const made = await post(user, '/api/receiving/arrivals', arrivalBody(unit, location));
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  return made.body.arrivalId as string;
}

let invoiceCount = 0;
async function recordInvoice(user: SyntheticUser, arrivalId: string, number?: string): Promise<Call> {
  invoiceCount += 1;
  return post(user, `/api/receiving/arrivals/${arrivalId}/invoices`, {
    number: number ?? `SYN-INV-${String(invoiceCount)}-${String(randomInt(1_000_000))}`,
    date: setup.today(),
    file: await storedFile(user),
  });
}

async function readArrival(user: SyntheticUser, arrivalId: string): Promise<Arrival> {
  const read = await get(user, `/api/receiving/arrivals/${arrivalId}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return arrivalReadSchema.parse(read.body).arrival;
}

/** A line of goods of a product not yet set up, by style code, colour and size (goods-in 4.3; DEC-138). */
function describedLine(styleCode: string, invoice: number, counted: number, size = 0) {
  const value = fixture.sizes.values[size];
  return {
    styleCode,
    colour: 'SYNTHETIC NAVY',
    size: value === undefined ? null : { attributeId: fixture.sizes.attributeId, valueId: value.id },
    skuId: null,
    invoiceQuantity: invoice,
    countedQuantity: counted,
    batch: null,
  };
}

async function saveLine(user: SyntheticUser, arrivalId: string, line: Record<string, unknown>): Promise<Call> {
  return post(user, `/api/receiving/arrivals/${arrivalId}/count-lines`, line);
}

/** Runs work as the user in a command of the application, as a module's interface is called (code-house-rules 8.1). */
function asUser<T>(user: SyntheticUser, work: (context: TransactionContext) => Promise<T>): Promise<T> {
  return api.app
    .get<CommandRunner>(COMMAND_RUNNER)
    .read(
      { commandName: 'test.read', organisation, correlationId: uuidv7(), actor: { kind: 'actor', actorId: user.id } },
      work,
    );
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('receiving');
  database = world.organisations[0].database;
  await allowVerifier(database);
  organisationCode = world.organisations[0].code;
  keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(database, 'access.sign-in-throttling', { failureLimit: 50, windowSeconds: 600 });
  await writeSyntheticSetting(database, 'access.password-rules', { minimumLength: 12 });
  await writeSyntheticSetting(database, 'access.office-session-limits', {
    idleLockSeconds: 1800,
    absoluteSeconds: 28800,
  });
  minio = await startTestFileStore();
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock, fileStoreEnvironment: minio.environment });
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    capturingLogger().logger,
  );
  const routed = await router.resolveForSignIn(organisationCode);
  if (!routed.routed) throw new Error('not routed');
  organisation = routed.organisation;
  setup = await structureSetup({
    directory: world.directory,
    database,
    organisationCode,
    keysEnvironment: keys,
    label: 'RECEIVING',
  });
  fixture = await receivingFixture(setup, database, 'RCV');
  storeReceiver = await enrolled('RCV-STORE', RECEIVER_AUTHORITY, placeScope([{ type: 'store', id: fixture.storeId }]));
  receiver = await enrolled('RCV-ALL', RECEIVER_AUTHORITY);
  otherStoreReader = await enrolled(
    'RCV-OTHER-READER',
    RECEIPT_READER_AUTHORITY,
    placeScope([{ type: 'store', id: fixture.otherStoreId }]),
  );
  outsider = await enrolled('RCV-OUTSIDER', [{ recordType: 'merchandise.brand', action: 'view' }]);
  policyReader = await enrolled('RCV-POLICIES', [{ recordType: 'configuration.policy_status', action: 'view' }]);
}, 240_000);

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('the policy gate (goods-in 4.1, 10.5; PRD-LIF-001, POL-10.08)', () => {
  it('PRD-SEC-017 goods-in 12 test 18 receiving is refused while the capability is off and policies 4 and 10 are not Signed', async () => {
    const refused = await post(
      receiver,
      '/api/receiving/arrivals',
      arrivalBody(fixture.wholeStore, fixture.storeLocation),
    );
    expect(refused.status).toBe(403);
    expect(errorOf(refused)?.code).toBe('configuration.operation-unavailable');
    expect(errorOf(refused)?.missing).toEqual(
      expect.arrayContaining([
        { kind: 'capability', capability: 'receiving.goods-in' },
        { kind: 'policy', policy: '4', lacks: 'signature' },
        { kind: 'policy', policy: '10', lacks: 'signature' },
      ]),
    );
    // The gate opened as an Admin and a different approver open it: policies 4 and 10 Signed and validated, the
    // capability switched on, and receiving granted after readiness at the Stores' units (S1-F04-T01, S1-F04-T02).
    await receivingGateOpen(setup, database);
    await receivingGranted(setup, database, fixture.siteId, [fixture.wholeStore, fixture.otherStoreUnit]);
    const opened = await post(
      receiver,
      '/api/receiving/arrivals',
      arrivalBody(fixture.wholeStore, fixture.storeLocation),
    );
    expect(opened.status, JSON.stringify(opened.body)).toBe(200);
  });

  it('POL-04.01 POL-10.01 POL-10.08 RR-558 policy 4 reports the tracking profiles and policy 10 the verified mappings, each with its origin', async () => {
    const read = await get(policyReader, '/api/access/policy-readiness');
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    const policies = policyReadinessSchema.parse(read.body).policies;
    const policy = (number: number) => policies.find((each) => each.policy === number);
    // The fixture's one tracking profile, labelled synthetic (structure-and-masters 4.5).
    expect(policy(4)?.values.map((value) => ({ check: value.check, origin: value.origin }))).toEqual([
      { check: 'merchandise.tracking-profiles', origin: 'synthetic' },
    ]);
    // The mappings of the Stores' units and the warehouse, which are verified; never the brand counter's, which is not
    // (POL-10.08). No tax-rule record is configured here, so none is reported.
    const mappingVersion = async (unit: string) =>
      (await asUser(receiver, (context) => mappingOn(context, unit, setup.today())))?.mappingVersionId;
    const verified = await Promise.all(
      [fixture.wholeStore, fixture.otherStoreUnit, fixture.warehouse].map(mappingVersion),
    );
    expect(
      policy(10)
        ?.values.map((value) => ({ check: value.check, key: value.key, origin: value.origin }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    ).toEqual(
      verified
        .map((key) => ({ check: 'organisation.verified-mappings', key, origin: 'synthetic' }))
        .sort((a, b) => (a.key ?? '').localeCompare(b.key ?? '')),
    );
    expect(policy(10)?.values.map((value) => value.key)).not.toContain(
      await mappingVersion(fixture.counterSameRegistration),
    );
    // Signed and validated on those values, policies 4 and 10 lack nothing (DM-6).
    expect(policy(4)?.missing).toEqual([]);
    expect(policy(10)?.missing).toEqual([]);
  });

  it('PRD-LIF-001 POL-10.08 goods-in 12 test 18 receiving is refused at a unit without receiving granted, or with an unverified mapping', async () => {
    const warehouse = await post(
      receiver,
      '/api/receiving/arrivals',
      arrivalBody(fixture.warehouse, fixture.warehouseLocation),
    );
    expect(warehouse.status).toBe(403);
    expect(errorOf(warehouse)).toMatchObject({
      code: 'configuration.operation-unavailable',
      missing: [{ kind: 'activity', activity: 'receiving', placeType: 'business-unit', placeId: fixture.warehouse }],
    });
    const counter = await post(
      receiver,
      '/api/receiving/arrivals',
      arrivalBody(fixture.counterSameRegistration, fixture.counterLocation),
    );
    // The brand counter's mapping is not verified, which receiving names itself, beside the activity its readiness
    // could not be granted without (POL-10.08).
    expect(counter.status).toBe(403);
    expect(errorOf(counter)?.code).toBe('configuration.operation-unavailable');
    expect(errorOf(counter)?.missing).toEqual(
      expect.arrayContaining([
        {
          kind: 'activity',
          activity: 'receiving',
          placeType: 'business-unit',
          placeId: fixture.counterSameRegistration,
        },
        { kind: 'mapping', businessUnitId: fixture.counterSameRegistration, lacks: 'verification' },
      ]),
    );
  });

  it('PRD-REC-001 goods-in 4.1 the inbox of a Site names, for each unit, whether it may receive and what is missing', async () => {
    const read = await get(receiver, `/api/receiving/sites/${fixture.siteId}/inbox?view=pending`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    const inbox = inboxSchema.parse(read.body);
    const unit = (id: string) => inbox.units.find((each) => each.businessUnitId === id);
    expect(unit(fixture.wholeStore)?.receiving).toEqual({ state: 'available', missing: [] });
    expect(unit(fixture.wholeStore)?.locations.map((each) => each.id)).toEqual([fixture.storeLocation]);
    expect(unit(fixture.warehouse)?.receiving).toMatchObject({
      state: 'unavailable',
      missing: [{ kind: 'activity', activity: 'receiving' }],
    });
    expect(unit(fixture.counterSameRegistration)?.receiving.state).toBe('unavailable');
    expect(unit(fixture.counterSameRegistration)?.receiving.missing).toContainEqual({
      kind: 'mapping',
      businessUnitId: fixture.counterSameRegistration,
      lacks: 'verification',
    });
  });
});

describe('recording the Arrival (goods-in 4.2; PRD-REC-004, PRD-MER-021)', () => {
  it('PRD-MER-021 refuses a supplier not linked to the brand, a location of another unit and an arrival still to come', async () => {
    const unlinked = await post(
      storeReceiver,
      '/api/receiving/arrivals',
      arrivalBody(fixture.wholeStore, fixture.storeLocation, { supplierPartyId: fixture.unlinkedSupplierId }),
    );
    expect(errorOf(unlinked)?.code).toBe('receiving.supplier-not-linked');
    const elsewhere = await post(
      storeReceiver,
      '/api/receiving/arrivals',
      arrivalBody(fixture.wholeStore, fixture.otherStoreLocation),
    );
    expect(errorOf(elsewhere)?.code).toBe('receiving.location-not-of-unit');
    const later = await post(
      storeReceiver,
      '/api/receiving/arrivals',
      arrivalBody(fixture.wholeStore, fixture.storeLocation, {
        arrivedAt: new Date(clock.now().getTime() + 3_600_000).toISOString(),
      }),
    );
    expect(errorOf(later)?.code).toBe('receiving.arrival-in-future');
    // A receiver of one Store records nothing at another Store's unit (access-and-approvals 5.3).
    const otherStore = await post(
      storeReceiver,
      '/api/receiving/arrivals',
      arrivalBody(fixture.otherStoreUnit, fixture.otherStoreLocation),
    );
    expect(otherStore.status).toBe(403);
    expect(errorOf(otherStore)?.code).toBe('access.not-authorised');
  });

  it('PRD-REC-004 PRD-REC-007 records where the goods are, from whom and how they came, with its photos', async () => {
    const arrivalId = await recordArrival(storeReceiver, fixture.wholeStore, fixture.storeLocation);
    const photo = await storedFile(storeReceiver);
    const photos = await post(storeReceiver, `/api/receiving/arrivals/${arrivalId}/photos`, { files: [photo] });
    expect(photos.status, JSON.stringify(photos.body)).toBe(200);
    const arrival = await readArrival(storeReceiver, arrivalId);
    expect(arrival).toMatchObject({
      state: 'In progress',
      siteId: fixture.siteId,
      storeId: fixture.storeId,
      businessUnitId: fixture.wholeStore,
      receivingLocationId: fixture.storeLocation,
      supplierPartyId: fixture.supplier.id,
      brandId: fixture.brand.id,
      lorryReceipt: { number: 'SYN-LR-1' },
      vehicleNumber: null,
      cartons: 3,
      recordedBy: storeReceiver.id,
      invoices: [],
      lines: [],
      grn: null,
      blocking: [{ kind: 'invoice' }],
    });
    expect(arrival.photoAttachmentIds).toEqual([(photos.body.attachmentIds as string[])[0]]);
  });
});

describe('invoices first (goods-in 4.2, 4.3; DEC-133)', () => {
  it('DEC-133 PRD-REC-005 goods-in 12 test 3 without an invoice the count does not start and no GRN is issued', async () => {
    const arrivalId = await recordArrival(storeReceiver, fixture.wholeStore, fixture.storeLocation);
    const line = await saveLine(storeReceiver, arrivalId, describedLine('SYN-STYLE-NOINV', 2, 2));
    expect(line.status).toBe(422);
    expect(errorOf(line)).toMatchObject({ code: 'receiving.invoice-required', missing: [{ kind: 'invoice' }] });
    const { versionToken } = await readArrival(storeReceiver, arrivalId);
    const issued = await post(storeReceiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken });
    expect(errorOf(issued)?.code).toBe('receiving.invoice-required');
    const invoice = await recordInvoice(storeReceiver, arrivalId);
    expect(invoice.status, JSON.stringify(invoice.body)).toBe(200);
    const counted = await saveLine(storeReceiver, arrivalId, describedLine('SYN-STYLE-NOINV', 2, 2));
    expect(counted.status, JSON.stringify(counted.body)).toBe(200);
  });

  it('PRD-REC-005 an invoice number the supplier used on another Arrival is a possible duplicate, kept once confirmed (goods-in 4.2)', async () => {
    const number = `SYN-DUP-${String(randomInt(1_000_000))}`;
    const first = await recordArrival(storeReceiver, fixture.wholeStore, fixture.storeLocation);
    expect((await recordInvoice(storeReceiver, first, number)).status).toBe(200);
    // The same number on the same Arrival is refused outright.
    expect(errorOf(await recordInvoice(storeReceiver, first, ` ${number.toLowerCase()} `))?.code).toBe(
      'receiving.invoice-number-repeated',
    );
    const second = await recordArrival(storeReceiver, fixture.wholeStore, fixture.storeLocation);
    const flagged = await recordInvoice(storeReceiver, second, number);
    expect(flagged.status).toBe(422);
    expect(errorOf(flagged)).toMatchObject({
      code: 'receiving.possible-duplicate-invoice',
      missing: [{ kind: 'record', recordType: 'receiving.arrival', recordId: first }],
    });
    const confirmed = await post(storeReceiver, `/api/receiving/arrivals/${second}/invoices`, {
      number,
      date: setup.today(),
      file: await storedFile(storeReceiver),
      confirmPossibleDuplicate: true,
    });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    const read = await readArrival(storeReceiver, second);
    expect(read.invoices).toEqual([
      expect.objectContaining({ number, possibleDuplicateOf: [first], possibleDuplicateElsewhere: false }),
    ]);
  });
});

describe('the count (goods-in 4.3; DEC-138, PRD-MER-005, PRD-MER-011)', () => {
  it('PRD-UXP-003 saves the count line by line as it goes, and resumes it with each version checked (goods-in 4.3)', async () => {
    const arrivalId = await recordArrival(storeReceiver, fixture.wholeStore, fixture.storeLocation);
    expect((await recordInvoice(storeReceiver, arrivalId)).status).toBe(200);
    const saved = await saveLine(storeReceiver, arrivalId, describedLine('SYN-STYLE-A', 4, 3));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const { lineId, lineVersionToken } = saved.body as { lineId: string; lineVersionToken: string };
    // A second person corrects it, naming the version they saw.
    const corrected = await saveLine(receiver, arrivalId, {
      ...describedLine('SYN-STYLE-A', 4, 4),
      line: { lineId, versionToken: lineVersionToken },
    });
    expect(corrected.status, JSON.stringify(corrected.body)).toBe(200);
    // Saving over the version replaced is stale (code-house-rules 12.7).
    const stale = await saveLine(storeReceiver, arrivalId, {
      ...describedLine('SYN-STYLE-A', 4, 1),
      line: { lineId, versionToken: lineVersionToken },
    });
    expect(stale.status).toBe(409);
    expect(errorOf(stale)?.code).toBe('kernel.stale-version');
    // A missing size stays missing; a size off the list is refused.
    const noSize = await saveLine(storeReceiver, arrivalId, { ...describedLine('SYN-STYLE-B', 1, 1), size: null });
    expect(noSize.status, JSON.stringify(noSize.body)).toBe(200);
    const offList = await saveLine(storeReceiver, arrivalId, {
      ...describedLine('SYN-STYLE-C', 1, 1),
      size: { attributeId: fixture.sizes.attributeId, valueId: uuidv7() },
    });
    expect(errorOf(offList)?.code).toBe('receiving.size-not-on-list');
    // A product named for the line must be of the Arrival's brand and the line's style code.
    const wrongProduct = await saveLine(storeReceiver, arrivalId, {
      ...describedLine('SYN-STYLE-D', 1, 1),
      skuId: fixture.batchSku.id,
    });
    expect(errorOf(wrongProduct)?.code).toBe('receiving.sku-not-of-line');
    const removed = await post(
      storeReceiver,
      `/api/receiving/arrivals/${arrivalId}/count-lines/${(noSize.body as { lineId: string }).lineId}/removal`,
      { lineVersionToken: (noSize.body as { lineVersionToken: string }).lineVersionToken },
    );
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);

    const arrival = await readArrival(storeReceiver, arrivalId);
    expect(arrival.lines).toEqual([
      expect.objectContaining({
        lineId,
        styleCode: 'SYN-STYLE-A',
        colour: 'SYNTHETIC NAVY',
        size: {
          attributeId: fixture.sizes.attributeId,
          valueId: fixture.sizes.values[0]?.id,
          code: fixture.sizes.values[0]?.code,
        },
        skuId: null,
        invoiceQuantity: 4,
        countedQuantity: 4,
        countedBy: [storeReceiver.id, receiver.id],
      }),
    ]);
  });
});

describe('one line per style, colour and size (goods-in 4.3)', () => {
  it('PRD-REC-005 a second line for the same style, colour and size is refused, naming the line that counts them', async () => {
    const arrivalId = await recordArrival(storeReceiver, fixture.wholeStore, fixture.storeLocation);
    expect((await recordInvoice(storeReceiver, arrivalId)).status).toBe(200);
    const first = await saveLine(storeReceiver, arrivalId, describedLine('SYN-STYLE-ONCE', 2, 2));
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const { lineId, lineVersionToken } = first.body as { lineId: string; lineVersionToken: string };
    // The style code and colour compare ignoring case and spaces at the ends.
    const again = await saveLine(storeReceiver, arrivalId, {
      ...describedLine(' syn-style-once ', 1, 1),
      colour: 'synthetic navy ',
    });
    expect(again.status).toBe(422);
    expect(errorOf(again)).toMatchObject({
      code: 'receiving.line-repeated',
      missing: [{ kind: 'count-line', lineId }],
    });
    // Another size is another line, and the line itself is saved again over its own version.
    expect((await saveLine(storeReceiver, arrivalId, describedLine('SYN-STYLE-ONCE', 1, 1, 1))).status).toBe(200);
    const resaved = await saveLine(storeReceiver, arrivalId, {
      ...describedLine('SYN-STYLE-ONCE', 2, 3),
      line: { lineId, versionToken: lineVersionToken },
    });
    expect(resaved.status, JSON.stringify(resaved.body)).toBe(200);
    expect((await readArrival(storeReceiver, arrivalId)).lines).toHaveLength(2);
  });
});

describe('issuing the GRN (goods-in 4.5, 10.3; PRD-REC-008, PRD-ACP-001, PRD-INT-002)', () => {
  it('PRD-INT-002 PRD-REC-008 goods-in 12 test 19 a GRN issued twice with the same request gives one GRN; its custody equals its count', async () => {
    const arrivalId = await recordArrival(storeReceiver, fixture.wholeStore, fixture.storeLocation);
    expect((await recordInvoice(storeReceiver, arrivalId)).status).toBe(200);
    expect((await saveLine(storeReceiver, arrivalId, describedLine('SYN-STYLE-G1', 6, 6))).status).toBe(200);
    expect((await saveLine(storeReceiver, arrivalId, describedLine('SYN-STYLE-G1', 2, 2, 1))).status).toBe(200);
    const batchLine = await saveLine(storeReceiver, arrivalId, {
      styleCode: fixture.batchSku.styleCode,
      colour: null,
      size: null,
      skuId: fixture.batchSku.id,
      invoiceQuantity: 5,
      countedQuantity: 5,
      batch: null,
    });
    expect(batchLine.status, JSON.stringify(batchLine.body)).toBe(200);
    let { versionToken } = await readArrival(storeReceiver, arrivalId);
    // A product whose profile requires a batch blocks the GRN without one (PRD-MER-011).
    const noBatch = await post(storeReceiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken });
    expect(errorOf(noBatch)).toMatchObject({
      code: 'receiving.batch-required',
      missing: [{ kind: 'count-line', lineId: (batchLine.body as { lineId: string }).lineId }],
    });
    const withBatch = await saveLine(storeReceiver, arrivalId, {
      styleCode: fixture.batchSku.styleCode,
      colour: null,
      size: null,
      skuId: fixture.batchSku.id,
      invoiceQuantity: 5,
      countedQuantity: 5,
      batch: { code: 'SYN-BATCH-1', expiryDate: setup.day(90) },
      line: {
        lineId: (batchLine.body as { lineId: string }).lineId,
        versionToken: (batchLine.body as { lineVersionToken: string }).lineVersionToken,
      },
    });
    expect(withBatch.status, JSON.stringify(withBatch.body)).toBe(200);
    // Issuing from a version the receiver did not see is stale.
    const stale = await post(storeReceiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken });
    expect(errorOf(stale)?.code).toBe('kernel.stale-version');
    versionToken = (await readArrival(storeReceiver, arrivalId)).versionToken;
    // No GRN series yet: no number, so no GRN (numbering-and-audit 3.2; RR-449).
    const noSeries = await post(storeReceiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken });
    expect(errorOf(noSeries)).toMatchObject({
      code: 'receiving.no-grn-series',
      missing: [{ kind: 'number-series', numberedKind: 'receiving.grn' }],
    });
    await api.app.get<CommandRunner>(COMMAND_RUNNER).run(
      {
        commandName: 'test.define-grn-series',
        organisation,
        correlationId: uuidv7(),
        actor: { kind: 'actor', actorId: receiver.id },
      },
      (context) => defineSyntheticGrnSeries(context, api.app.get<NumberingInterface>(NUMBERING)),
    );

    const key = uuidv7();
    const issued = await post(storeReceiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken }, key);
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    const { grnId, number } = issued.body as { grnId: string; number: string };
    expect(number).toMatch(/^SYN-GRN-\d{5}$/);
    // The same request again answers the same GRN; a new request is refused, as is any change (goods-in 4.5).
    const replayed = await post(storeReceiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken }, key);
    expect(replayed).toEqual(issued);
    const again = await post(storeReceiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken });
    expect(errorOf(again)).toMatchObject({ code: 'receiving.grn-issued', missing: [{ recordId: grnId }] });
    expect(errorOf(await saveLine(storeReceiver, arrivalId, describedLine('SYN-STYLE-G2', 1, 1)))?.code).toBe(
      'receiving.grn-issued',
    );

    const arrival = await readArrival(storeReceiver, arrivalId);
    expect(arrival.state).toBe('Issued');
    expect(arrival.blocking).toEqual([]);
    expect(arrival.grn).toMatchObject({
      id: grnId,
      number,
      enteredBy: storeReceiver.id,
      countedBy: [storeReceiver.id],
      lines: [
        {
          lineNumber: 1,
          styleCode: 'SYN-STYLE-G1',
          size: fixture.sizes.values[0]?.code,
          invoiceQuantity: 6,
          countedQuantity: 6,
        },
        {
          lineNumber: 2,
          styleCode: 'SYN-STYLE-G1',
          size: fixture.sizes.values[1]?.code,
          invoiceQuantity: 2,
          countedQuantity: 2,
        },
        {
          lineNumber: 3,
          skuId: fixture.batchSku.id,
          countedQuantity: 5,
          batch: { code: 'SYN-BATCH-1', expiryDate: setup.day(90) },
        },
      ],
    });
    // Who counted it and who entered it, by name from their sign-ins (goods-in 4.3).
    expect(arrival.people).toEqual([{ userId: storeReceiver.id, name: storeReceiver.displayName }]);
    // The GRN holds quantities only, never a price, tax or value (goods-in 4.5).
    expect(JSON.stringify(arrival.grn)).not.toMatch(/price|value|tax|cost|paise/i);

    // Custody from the count: at the receiving location, in good condition, not accepted (PRD-REC-008, PRD-ACP-001).
    const held = await asUser(storeReceiver, (context) =>
      custody(context, { businessUnitId: fixture.wholeStore, locationId: fixture.storeLocation }),
    );
    // This is the only GRN issued into the location, so its custody is exactly its count: 6 and 2 pieces of goods of
    // a product not yet set up, each line its own receipt origin, and 5 of the batch-tracked product.
    const total = (rows: typeof held.rows) => rows.reduce((sum, row) => sum + row.quantity, 0);
    expect(
      held.rows.every((row) => row.condition === 'good' && row.heldAs === 'custody' && row.acceptedQuantity === 0),
    ).toBe(true);
    expect(
      held.rows
        .filter((row) => row.skuId === null)
        .map((row) => row.quantity)
        .sort(),
    ).toEqual([2, 6]);
    expect(held.rows.filter((row) => row.skuId === fixture.batchSku.id)).toEqual([
      expect.objectContaining({ quantity: 5, batchCode: 'SYN-BATCH-1', expiryDate: setup.day(90) }),
    ]);
    expect(total(held.rows)).toBe(13);

    // PRD-ORG-014 PRD-MOD-015: each receipt origin of the GRN, one per line, carries cost Unknown and the owner the
    // brand's Agreement in force on the arrival date gives: the brand, under that version, since ownership passes at
    // the sale (POL-01.05). Read with the read-only test role (code-house-rules 10.1).
    const verify = await connect(database, 'verify');
    try {
      const origins = await verify.query<{
        quantity: number;
        owner_kind: string | null;
        owner_brand_id: string | null;
        owner_legal_entity_id: string | null;
        agreement_version_id: string | null;
        value_known: boolean;
        p_rate_paise: string | null;
        established_value_paise: string | null;
      }>(
        `select o.quantity, s.owner_kind, s.owner_brand_id::text as owner_brand_id,
                s.owner_legal_entity_id::text as owner_legal_entity_id,
                s.agreement_version_id::text as agreement_version_id, s.value_known, s.p_rate_paise,
                s.established_value_paise
           from stock.receipt_origin o join stock.receipt_origin_state s on s.receipt_origin_id = o.id
          where o.source_module = 'receiving' and o.source_record_type = 'grn' and o.source_record_id = $1
          order by o.quantity`,
        [grnId],
      );
      expect(origins.rows).toEqual(
        [2, 5, 6].map((quantity) => ({
          quantity,
          owner_kind: 'brand',
          owner_brand_id: fixture.brand.id,
          owner_legal_entity_id: null,
          agreement_version_id: fixture.agreementVersionId,
          value_known: false,
          p_rate_paise: null,
          established_value_paise: null,
        })),
      );
    } finally {
      await verify.end();
    }
  });

  it('PRD-INT-002 goods-in 12 test 19 every write of an Arrival replays its first answer under its key, and writes once', async () => {
    const recordKey = uuidv7();
    const body = arrivalBody(fixture.wholeStore, fixture.storeLocation);
    const recorded = await post(storeReceiver, '/api/receiving/arrivals', body, recordKey);
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(200);
    expect(await post(storeReceiver, '/api/receiving/arrivals', body, recordKey)).toEqual(recorded);
    const arrivalId = recorded.body.arrivalId as string;
    const invoiceKey = uuidv7();
    const invoiceBody = {
      number: `SYN-INV-REPLAY-${String(randomInt(1_000_000))}`,
      date: setup.today(),
      file: await storedFile(storeReceiver),
    };
    const invoice = await post(storeReceiver, `/api/receiving/arrivals/${arrivalId}/invoices`, invoiceBody, invoiceKey);
    expect(invoice.status, JSON.stringify(invoice.body)).toBe(200);
    expect(await post(storeReceiver, `/api/receiving/arrivals/${arrivalId}/invoices`, invoiceBody, invoiceKey)).toEqual(
      invoice,
    );
    const lineKey = uuidv7();
    const line = await post(
      storeReceiver,
      `/api/receiving/arrivals/${arrivalId}/count-lines`,
      describedLine('SYN-STYLE-REPLAY', 1, 1),
      lineKey,
    );
    expect(line.status, JSON.stringify(line.body)).toBe(200);
    expect(
      await post(
        storeReceiver,
        `/api/receiving/arrivals/${arrivalId}/count-lines`,
        describedLine('SYN-STYLE-REPLAY', 1, 1),
        lineKey,
      ),
    ).toEqual(line);
    const arrival = await readArrival(storeReceiver, arrivalId);
    expect(arrival.invoices).toHaveLength(1);
    expect(arrival.lines).toHaveLength(1);
    // The same key with another request is a conflict, never a second write (code-house-rules 12.4).
    const reused = await post(storeReceiver, '/api/receiving/arrivals', { ...body, cartons: 9 }, recordKey);
    expect(reused.status).toBe(409);
    expect(errorOf(reused)?.code).toBe('kernel.idempotency-key-reused');
  });

  it('PRD-REC-008 a GRN with a line whose counted quantity differs from its invoice quantity is refused, naming the line', async () => {
    const arrivalId = await recordArrival(storeReceiver, fixture.wholeStore, fixture.storeLocation);
    expect((await recordInvoice(storeReceiver, arrivalId)).status).toBe(200);
    const short = await saveLine(storeReceiver, arrivalId, describedLine('SYN-STYLE-SHORT', 10, 8));
    const { versionToken } = await readArrival(storeReceiver, arrivalId);
    const refused = await post(storeReceiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken });
    expect(errorOf(refused)).toMatchObject({
      code: 'receiving.line-differs-from-invoice',
      missing: [{ kind: 'count-line', lineId: (short.body as { lineId: string }).lineId }],
    });
  });
});

describe('goods of a product not yet set up (stock-ledger 13.14; goods-in 4.8; RR-555)', () => {
  it('RR-555 PRD-SEC-005 a receiver scoped to the brand alone issues a GRN of goods of a product not yet set up, and sees them', async () => {
    const brandReceiver = await enrolled('RCV-BRAND', RECEIVER_AUTHORITY, {
      kind: 'dimensions',
      legalEntity: { kind: 'all' },
      place: { kind: 'all' },
      brand: { kind: 'selected', members: [fixture.brand.id] },
    });
    // At the other Store, where no other test of this file issues a GRN, so the custody there is this GRN's alone.
    const location = fixture.otherStoreLocation;
    const arrivalId = await recordArrival(brandReceiver, fixture.otherStoreUnit, location);
    expect((await recordInvoice(brandReceiver, arrivalId)).status).toBe(200);
    expect((await saveLine(brandReceiver, arrivalId, describedLine('SYN-STYLE-BRAND', 2, 2))).status).toBe(200);
    const { versionToken } = await readArrival(brandReceiver, arrivalId);
    const issued = await post(brandReceiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken });
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    expect((await readArrival(brandReceiver, arrivalId)).grn).toMatchObject({
      id: (issued.body as { grnId: string }).grnId,
      lines: [{ styleCode: 'SYN-STYLE-BRAND', skuId: null, countedQuantity: 2 }],
    });
    // The goods take the Arrival's brand until PT approval names their SKU, so the brand's receiver sees them
    // (stock-ledger 13.14, 14.1).
    const held = await asUser(brandReceiver, (context) =>
      custody(context, { businessUnitId: fixture.otherStoreUnit, locationId: location }),
    );
    expect(held.rows).toEqual([
      expect.objectContaining({ skuId: null, quantity: 2, condition: 'good', heldAs: 'custody', acceptedQuantity: 0 }),
    ]);
  });
});

describe('who sees receipts (goods-in 12 test 20; access-and-approvals 5.3)', () => {
  it('PRD-SEC-005 goods-in 12 test 20 a reader scoped to one Store sees only its Store’s receipts', async () => {
    const own = await recordArrival(receiver, fixture.otherStoreUnit, fixture.otherStoreLocation);
    const other = await recordArrival(receiver, fixture.wholeStore, fixture.storeLocation);
    const read = await get(otherStoreReader, `/api/receiving/sites/${fixture.siteId}/inbox?view=pending`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    const shown = inboxSchema.parse(read.body).entries.map((entry) => entry.arrivalId);
    expect(shown).toContain(own);
    expect(shown).not.toContain(other);
    // An Arrival outside the reader's scope is hidden, so it carries no fact their scope covers: refused, naming nothing
    // of it (access-and-approvals 5.3; PRD-MOD-015).
    const hidden = await get(otherStoreReader, `/api/receiving/arrivals/${other}`);
    expect(hidden.status).toBe(403);
    expect(errorOf(hidden)?.code).toBe('access.not-authorised');
    expect((await get(otherStoreReader, `/api/receiving/arrivals/${own}`)).status).toBe(200);
    // Someone with no receiving permission reads no inbox.
    expect((await get(outsider, `/api/receiving/sites/${fixture.siteId}/inbox?view=pending`)).status).toBe(403);
    // A receiver over every place sees both, and History holds none yet: every GRN waits for its PT (goods-in 4.1).
    const all = inboxSchema.parse(
      (await get(receiver, `/api/receiving/sites/${fixture.siteId}/inbox?view=pending`)).body,
    );
    expect(all.entries.map((entry) => entry.arrivalId)).toEqual(expect.arrayContaining([own, other]));
    expect(
      inboxSchema.parse((await get(receiver, `/api/receiving/sites/${fixture.siteId}/inbox?view=history`)).body)
        .entries,
    ).toEqual([]);
    // The inbox is read a page at a time, newest recorded first (code-house-rules 12.1).
    const first = inboxSchema.parse(
      (await get(receiver, `/api/receiving/sites/${fixture.siteId}/inbox?view=pending&limit=1`)).body,
    );
    expect(first.entries.map((entry) => entry.arrivalId)).toEqual([other]);
    expect(first.next).toBe(other);
    const second = inboxSchema.parse(
      (await get(receiver, `/api/receiving/sites/${fixture.siteId}/inbox?view=pending&limit=1&after=${other}`)).body,
    );
    expect(second.entries.map((entry) => entry.arrivalId)).toEqual([own]);
  });
});

// Last in the file: it leaves a value of an origin this environment does not accept, which keeps receiving unavailable.
describe('a value of an origin this environment does not accept (code-house-rules 12.14; goods-in 10.5; RR-558)', () => {
  it('PRD-SEC-017 RR-558 a tracking profile of the test setup keeps receiving unavailable here, policy 4 validated again', async () => {
    // A tracking profile version of the test setup's origin, written as a fixture: preparing one is refused outside
    // `kdps-test` (configuration.origin-not-allowed), so here it could only come from elsewhere, as a restore brings it.
    const profileId = uuidv7();
    const versionId = uuidv7();
    const owner = await connect(database, 'migration');
    try {
      await owner.query(`insert into merchandise.tracking_profile (id, code) values ($1, $2)`, [
        profileId,
        `SYN-TEST-SETUP-PROFILE-${String(randomInt(1_000_000))}`,
      ]);
      await owner.query(
        `insert into merchandise.tracking_profile_version (id, tracking_profile_id, name, piece_tracked,
           batch_expiry_required, required_identifiers, valid_during, decision, prepared_by_user_id, origin)
         values ($1, $2, 'SYNTHETIC test-setup profile', false, false, '{}', daterange($3::date, null), 'Approved', $4,
           'test-setup')`,
        [versionId, profileId, setup.today(), setup.preparer.id],
      );
    } finally {
      await owner.end();
    }
    // Validated again, so the validation covers it: the one thing missing is the value's origin (DM-6).
    await receivingPolicyValidated(setup, database, 4);
    const refused = await post(
      receiver,
      '/api/receiving/arrivals',
      arrivalBody(fixture.wholeStore, fixture.storeLocation),
    );
    expect(refused.status).toBe(403);
    expect(errorOf(refused)).toMatchObject({
      code: 'configuration.operation-unavailable',
      missing: [{ kind: 'origin', check: 'merchandise.tracking-profiles', key: versionId, origin: 'test-setup' }],
    });
    const read = await get(receiver, `/api/receiving/sites/${fixture.siteId}/inbox?view=pending`);
    const unit = inboxSchema.parse(read.body).units.find((each) => each.businessUnitId === fixture.wholeStore);
    expect(unit?.receiving).toEqual({
      state: 'unavailable',
      missing: [{ kind: 'origin', check: 'merchandise.tracking-profiles', key: versionId, origin: 'test-setup' }],
    });
  });
});
