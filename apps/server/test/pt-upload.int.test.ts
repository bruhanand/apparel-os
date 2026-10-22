import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  arrivalReadSchema,
  grnPtReadSchema,
  HELD_LINE_DECISION,
  ptPreviewSchema,
  type AssignmentScope,
  type FieldClass,
  type GrnPtRead,
  type PtPreview,
} from '@apparel-os/schemas';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrganisationRouter, type RoutedOrganisation } from '../src/kernel/index.js';
import { ACCESS, type AccessInterface } from '../src/modules/access/index.js';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { defineSyntheticDamageReportSeries } from './fixtures/damage-report-series.js';
import { defineSyntheticGrnSeries } from './fixtures/grn-series.js';
import {
  SYNTHETIC_PT_LAYOUT,
  SYNTHETIC_PT_MAPPING,
  syntheticPtFileName,
  syntheticPtWorkbook,
  type SyntheticPtRow,
} from './fixtures/pt.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { RELATIONSHIP, SYNTHETIC_EXTERNAL_LINK_PART, withParts, withRelationship } from './fixtures/workbook-parts.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  SyntheticClock,
  SYNTHETIC_ORIGIN,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { asUserIn, damageGateOpen, SYNTHETIC_POLICY_17_VALUES } from './support/damage.js';
import { defineSyntheticCodeSeries } from './support/exceptions.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { defineSyntheticImportBatchSeries } from './support/imports.js';
import { capturingLogger } from './support/jobs.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { STORE_FILE_PATH, syntheticPdfUpload } from './support/opening-app.js';
import { decided, structureSetup, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { databaseUrl } from './support/postgres.js';
import { ptWorld, type PtWorld } from './support/pt.js';
import {
  RECEIVER_AUTHORITY,
  receivingFixture,
  receivingGateOpen,
  receivingGranted,
  STOCK_VIEW,
  type ReceivingFixture,
} from './support/receiving.js';

// S2-F04-T02: a PT file uploaded for a GRN, through the whole application on real PostgreSQL (goods-in 5.1 to 5.8,
// 10.3, 12 tests 2, 8, 9, the proposal part of 10, and the check of 21; PRD-REC-016, PRD-REC-017, PRD-REC-018,
// PRD-MER-007, PRD-MER-013, PRD-PTW-011, PRD-IMP-006, PRD-IMP-007, PRD-IMP-012; DEC-134, DEC-135, DEC-137, DEC-138,
// DEC-140). The file is handed in, staged, validated, submitted and published through the import routes as a
// transaction batch about its GRN, whose handler is `merchandise` · PT; the PT's own routes read the GRN's PT, preview a
// file and withdraw a draft. Policy 17 reports no values yet, so a held line is decided on the one value of its
// test-only check, labelled synthetic (support/damage.ts). Every person, place, list, product, amount and number is
// SYNTHETIC.

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
let lists: PtWorld;
const cookies = new Map<string, string>();
let approveReason: string;

interface Person {
  readonly user: SyntheticUser;
  readonly assignmentId: string;
}
/** Warehouse (P-WHS), who counts and issues the GRN. */
let receiver: Person;
/** A Booking approver (P-BKG), who decides held lines. */
let bookingApprover: Person;
/** Whoever is assigned to make PTs: uploads, submits and withdraws, and sees costs. */
let ptMaker: Person;
/** A reader of PTs who is not granted cost or margin. */
let ptReader: Person;
/** Someone who may stage imports but not prepare PTs. */
let notAPtMaker: Person;
let settingsAdmin: Person;
let settingsApprover: Person;
/** The existing product of the brand: a SKU of a style, its colour, its size and its barcode mapped under the brand. */
let existing: { readonly styleCode: string; readonly size: string; readonly barcode: string };
/** Another brand on the brand list, not the GRN's. */
let otherBrandCode: string;

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
  options: { scope?: AssignmentScope; fieldClasses?: readonly FieldClass[] } = {},
): Promise<Person> {
  const user = await writeSyntheticUser(database, organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
  });
  const once = [...new Map(authorities.map((each) => [`${each.recordType}:${each.action}`, each])).values()];
  const { assignmentId } = await grantSynthetic(database, { kind: 'user', id: user.id }, once, {
    ...(options.scope === undefined ? {} : { scope: options.scope }),
    ...(options.fieldClasses === undefined
      ? {}
      : { fieldClasses: options.fieldClasses.map((fieldClass) => ({ fieldClass, access: 'view' as const })) }),
  });
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.76' },
    body: JSON.stringify({ organisationCode, login: user.login, password: user.password, totpCode: freshCode(user) }),
  });
  expect(response.status).toBe(200);
  cookies.set(user.id, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
  return { user, assignmentId };
}

async function post(person: Person, path: string, body: unknown, key: string = uuidv7()): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: SYNTHETIC_ORIGIN,
      cookie: cookies.get(person.user.id) ?? '',
      'idempotency-key': key,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function get(person: Person, path: string): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie: cookies.get(person.user.id) ?? '' } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const errorOf = (call: Call) =>
  (call.body as { error?: { kind: string; code: string; missing?: Record<string, string>[] } }).error;

let fileCount = 0;
async function storedPdf(person: Person): Promise<{ storedFileId: string; fileReceiptId: string }> {
  fileCount += 1;
  const stored = await post(person, STORE_FILE_PATH, syntheticPdfUpload('PT-UPLOAD', `FILE-${String(fileCount)}`));
  expect(stored.status, JSON.stringify(stored.body)).toBe(200);
  const { storedFileId, receiptId } = stored.body as { storedFileId: string; receiptId: string };
  return { storedFileId, fileReceiptId: receiptId };
}

/** The codes of the lists' values, by name, as a file writes them. */
const code = {
  season: () => lists.season.values.SPRING?.code ?? '',
  colour: (name: 'NAVY' | 'PREMIUM') => lists.colour.values[name]?.code ?? '',
  gender: (name: 'MALE' | 'KIDS' = 'MALE') => lists.gender.values[name]?.code ?? '',
  category: (name: 'CASUAL' | 'FORMAL' = 'CASUAL') => lists.categories[name]?.code ?? '',
  gst: (name: 'GST-5' | 'GST-18' = 'GST-5') => lists.gstRate.values[name]?.code ?? '',
  size: (at: 0 | 1) => fixture.sizes.values[at]?.code ?? '',
};

let barcodeCount = 0;
/** A fresh SYNTHETIC barcode of 13 digits. */
function barcode(): string {
  barcodeCount += 1;
  return `89${String(barcodeCount + 1_000_000 * randomInt(1, 9)).padStart(11, '0')}`;
}

/**
 * A good PT row of the GRN's brand: one piece at MRP 1,999.00, BASIC 700.00 and P RATE 945.00, so MARGIN 52.7263...,
 * worked out by hand (shared-calculations 12.4 CG-22); each value on its list.
 */
function ptRow(design: string, sizeAt: 0 | 1, values: SyntheticPtRow = {}): SyntheticPtRow {
  return {
    SEASON: code.season(),
    BRAND: fixture.brand.code,
    COLOR: code.colour('NAVY'),
    GENDER: code.gender(),
    'SUB CATEGORY': code.category(),
    TYPE: lists.type.values.TOP?.code ?? '',
    ITEM: lists.item.values.TSHIRT?.code ?? '',
    FIT: lists.fit.values.SLIM?.code ?? '',
    SIZE: code.size(sizeAt),
    BARCODE: barcode(),
    DESIGN: design,
    HSN: 61091000,
    QTY: 1,
    MRP: 1999,
    BASIC: 700,
    'P RATE': 945,
    'INPUT TAX': code.gst(),
    'OUTPUT TAX': code.gst('GST-18'),
    NAG: 1,
    MARGIN: 52.7263,
    ...values,
  };
}

/** An Arrival at the first Store with its invoice, its lines counted, and its GRN issued; answers the GRN. */
async function issuedGrn(
  lines: readonly {
    readonly style: string;
    readonly sizeAt: 0 | 1;
    readonly counted: number;
    readonly invoice?: number;
    readonly colour?: string | null;
    readonly extra?: 'received' | 'not-received';
  }[],
): Promise<{ readonly arrivalId: string; readonly grnId: string }> {
  const made = await post(receiver, '/api/receiving/arrivals', {
    businessUnitId: fixture.wholeStore,
    receivingLocationId: fixture.storeLocation,
    supplierPartyId: fixture.supplier.id,
    brandId: fixture.brand.id,
    transporter: syntheticName('Transporter'),
    lorryReceipt: { number: 'SYN-LR-PTU', date: setup.today() },
    cartons: 2,
    arrivedAt: new Date(clock.now().getTime() - 3_600_000).toISOString(),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  const arrivalId = (made.body as { arrivalId: string }).arrivalId;
  const invoice = await post(receiver, `/api/receiving/arrivals/${arrivalId}/invoices`, {
    number: `SYN-INV-PTU-${String(randomInt(1_000_000))}`,
    date: setup.today(),
    file: await storedPdf(receiver),
  });
  expect(invoice.status, JSON.stringify(invoice.body)).toBe(200);
  for (const line of lines) {
    const saved = await post(receiver, `/api/receiving/arrivals/${arrivalId}/count-lines`, {
      goods: 'on-invoice',
      styleCode: line.style,
      colour: line.colour === undefined ? 'SYNTHETIC NAVY' : line.colour,
      sizeValueId: fixture.sizes.values[line.sizeAt]?.id ?? null,
      skuId: null,
      description: null,
      invoiceQuantity: line.invoice ?? line.counted,
      countedQuantity: line.counted,
      extra: line.extra ?? null,
      damage: null,
      batch: null,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  }
  const read = await get(receiver, `/api/receiving/arrivals/${arrivalId}`);
  const { versionToken } = arrivalReadSchema.parse(read.body).arrival;
  const issued = await post(receiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken });
  expect(issued.status, JSON.stringify(issued.body)).toBe(200);
  return { arrivalId, grnId: (issued.body as { grnId: string }).grnId };
}

/** Hands a PT file in, as XLSX (imports-and-opening-data 3.1 step 1). */
async function handIn(person: Person, bytes: Buffer, stem: string): Promise<Call> {
  return post(person, '/api/files-imports/import-files', {
    sourceSystem: 'manual-upload',
    originalName: syntheticPtFileName(stem),
    contentBase64: bytes.toString('base64'),
  });
}

/** Starts a PT batch for the GRN with the stored file (goods-in 5.6 step 1). */
async function start(person: Person, grnId: string, stored: Call): Promise<Call> {
  expect(stored.status, JSON.stringify(stored.body)).toBe(200);
  const { storedFileId, receiptId } = stored.body as { storedFileId: string; receiptId: string };
  return post(person, '/api/files-imports/batches', {
    storedFileId,
    fileReceiptId: receiptId,
    kind: 'transaction',
    target: 'merchandise.pt',
    layoutVersionId: lists.layoutVersionId,
    mappingVersionId: lists.mappingVersionId,
    subject: { recordId: grnId },
  });
}

let marker = 0;
/** Hands a file of the rows in, starts its batch for the GRN and validates it; answers the batch. */
async function uploaded(
  grnId: string,
  rows: readonly SyntheticPtRow[],
  options: { headerRow?: 1 | 2; person?: Person } = {},
): Promise<{ readonly batchId: string; readonly validated: string }> {
  marker += 1;
  const person = options.person ?? ptMaker;
  const bytes = await syntheticPtWorkbook({
    rows,
    marker: `PTU-${String(marker)}`,
    ...(options.headerRow === undefined ? {} : { headerRow: options.headerRow }),
  });
  const started = await start(person, grnId, await handIn(person, bytes, `pt-${String(marker)}`));
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  const batchId = (started.body as { batchId: string }).batchId;
  const validated = await post(person, `/api/files-imports/batches/${batchId}/validate`, {});
  expect(validated.status, `${JSON.stringify(validated.body)} ${api.logText().slice(-4000)}`).toBe(200);
  return { batchId, validated: (validated.body as { state: string }).state };
}

async function preview(batchId: string, person: Person = ptMaker): Promise<PtPreview> {
  const read = await get(person, `/api/merchandise/pt/uploads/${batchId}/preview`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return ptPreviewSchema.parse(read.body);
}

async function grnPt(grnId: string, person: Person = ptMaker): Promise<GrnPtRead> {
  const read = await get(person, `/api/merchandise/pt/grns/${grnId}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return grnPtReadSchema.parse(read.body);
}

/** Submits the batch for review and publishes it: the PT file's submit (goods-in 5.6 step 3). */
async function submitted(batchId: string, person: Person = ptMaker): Promise<Call> {
  const read = await preview(batchId, person);
  const submit = await post(person, `/api/files-imports/batches/${batchId}/submit`, {
    versionId: read.batchVersionId,
  });
  expect(submit.status, JSON.stringify(submit.body)).toBe(200);
  return post(person, `/api/files-imports/batches/${batchId}/publish`, { versionId: read.batchVersionId });
}

/** What a Booking approver holds: reading the Arrival, deciding its held lines and the approval panel (goods-in 11). */
const BOOKING_APPROVER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'receiving.arrival', action: 'view' },
  { recordType: 'receiving.held_line', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
  ...STOCK_VIEW,
];

/** What whoever makes PTs holds (goods-in 5.1, section 11): the GRN, the import, the PT and its approval request. */
const PT_MAKER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'receiving.arrival', action: 'view' },
  { recordType: 'receiving.grn', action: 'view' },
  { recordType: 'files_imports.stored_file', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.import_batch', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'edit' },
  { recordType: 'merchandise.pt', action: 'view' },
  { recordType: 'merchandise.pt', action: 'create' },
  { recordType: 'merchandise.pt', action: 'edit' },
  { recordType: 'access.approval_request', action: 'view' },
  ...STOCK_VIEW,
];

/** Decides a request through `access`'s approval route, as the approval panel in My work does (9.5). */
function decide(person: Person, requestId: string, versionId: string) {
  return post(person, `/api/access/approval-requests/${requestId}/decision`, {
    versionId,
    outcome: 'approve',
    reason: { kind: 'listed', reasonId: approveReason },
    totpCode: freshCode(person.user),
  });
}

/** A SYNTHETIC limit covering Unknown value only, prepared and approved by two different people (9.2; V-02). */
async function unknownOnlyLimit(person: Person): Promise<void> {
  const access = api.app.get<AccessInterface>(ACCESS);
  const prepared = await asUserIn(api.app, organisation, settingsAdmin.user.id, (context) =>
    access.prepareApprovalLimit(
      context,
      { userId: settingsAdmin.user.id, roleAssignmentId: settingsAdmin.assignmentId },
      {
        actionType: HELD_LINE_DECISION,
        holder: { kind: 'individual', userId: person.user.id, roleAssignmentId: person.assignmentId },
        limit: { kind: 'none' },
        coversUnknown: true,
        origin: 'synthetic',
        validFrom: setup.today(),
      },
    ),
  );
  if (prepared.kind !== 'success') throw new Error(`limit refused: ${prepared.refusal.code}`);
  const done = await decide(settingsApprover, prepared.answer.requestId, prepared.answer.limitId);
  expect(done.status, JSON.stringify(done.body)).toBe(200);
}

/** One exception type routed at the Site to a SYNTHETIC owner, approved by a different person (12.2; POL-02.16). */
async function route(typeCode: string, owner: Person): Promise<void> {
  const prepared = await post(settingsAdmin, '/api/exceptions/routing', {
    typeCode,
    siteId: fixture.siteId,
    owner: { kind: 'user', userId: owner.user.id },
    dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
    escalation: { kind: 'user', userId: owner.user.id },
    validFrom: setup.today(),
    origin: 'synthetic',
  });
  expect(prepared.status, JSON.stringify(prepared.body)).toBe(200);
  const { requestId, versionId } = prepared.body as { requestId: string; versionId: string };
  const done = await decide(settingsApprover, requestId, versionId);
  expect(done.status, JSON.stringify(done.body)).toBe(200);
}

function ok<A>(outcome: { kind: 'success'; answer: A } | { kind: 'refusal'; refusal: { readonly code: string } }): A {
  if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
  return outcome.answer;
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('ptupload');
  database = world.organisations[0].database;
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
  api = await startAccessApp(world, keys, {
    clock,
    fileStoreEnvironment: minio.environment,
    validityChecks: [SYNTHETIC_POLICY_17_VALUES],
  });
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
    label: 'PT-UPLOAD',
  });
  fixture = await receivingFixture(setup, database, 'PTU');
  await receivingGateOpen(setup, database, [SYNTHETIC_POLICY_17_VALUES]);
  await receivingGranted(setup, database, fixture.siteId, [fixture.wholeStore], [SYNTHETIC_POLICY_17_VALUES]);
  // Policy 17 Signed and validated on the test-only check's SYNTHETIC value, so held lines are decided (goods-in 10.5).
  await damageGateOpen(setup, database);
  approveReason = await writeSyntheticReason(database, 'approve');
  const numbering = api.app.get<NumberingInterface>(NUMBERING);
  await asUserIn(api.app, organisation, setup.preparer.id, async (context) => {
    await defineSyntheticGrnSeries(context, numbering);
    await defineSyntheticCodeSeries(context, numbering);
    await defineSyntheticDamageReportSeries(context, numbering);
    await defineSyntheticImportBatchSeries(context, numbering);
  });
  lists = await ptWorld(setup, database, 'PTU', { proposer: setup.preparer.id, confirmer: setup.approver.id });
  otherBrandCode = syntheticCode('PTU-OTHER-BRAND');
  ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareBrand(c, p, {
        code: otherBrandCode,
        name: syntheticName('PTU other brand'),
        aliases: [],
        validFrom: setup.today(),
      }),
    ),
  );
  // The existing product (structure-and-masters 4.1): a size set for the casual category, in force from tomorrow, as a
  // category's next version never shares its start (2.2); then both clocks a day on, so it is in force for every
  // command of the test, and the product confirmed by a different person with its barcode mapped under the brand.
  const casual = lists.categories.CASUAL?.id ?? '';
  const sizeSet = ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareSizeSet(c, p, {
        code: syntheticCode('PTU-SIZES'),
        categoryId: casual,
        name: syntheticName('PTU sizes'),
        sizes: [code.size(0), code.size(1)],
        validFrom: setup.today(),
      }),
    ),
  );
  const category = await setup.run(setup.preparer.id, (c) =>
    setup.catalogue.record(c, 'category', casual, setup.today()),
  );
  ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareCategoryVersion(c, p, casual, {
        name: syntheticName('PTU casual'),
        sizeSetId: sizeSet.recordId,
        identityAttributeIds: [lists.colour.attributeId],
        validFrom: setup.day(1),
        versionToken: category?.versionToken,
      }),
    ),
  );
  setup.advanceDays(1);
  clock.advance(86_400);
  existing = { styleCode: syntheticCode('PTU-OLD'), size: code.size(0), barcode: barcode() };
  const product = ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.proposeProduct(c, p, {
        style: {
          code: existing.styleCode,
          brandId: fixture.brand.id,
          categoryId: casual,
          hsn: '61091000',
          attributes: [{ attributeId: lists.gender.attributeId, valueId: lists.gender.values.MALE?.id ?? '' }],
        },
        skus: [
          {
            code: syntheticCode('PTU-OLD-SKU'),
            size: existing.size,
            identity: [{ attributeId: lists.colour.attributeId, valueId: lists.colour.values.NAVY?.id ?? '' }],
            stockUnit: 'piece',
            purpose: 'merchandise',
          },
        ],
        sourceWords: 'SYNTHETIC source words',
      }),
    ),
  );
  decided(await setup.decide(product.requestId, product.proposalId));
  const proposal = await setup.run(setup.preparer.id, (c) => setup.catalogue.productProposal(c, product.proposalId));
  const skuId = proposal?.skuIds[0] ?? '';
  ok(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.mapCode(c, p, {
        code: existing.barcode,
        kind: 'supplier-barcode',
        scope: { kind: 'brand', brandId: fixture.brand.id },
        skuId,
        alias: false,
        validFrom: setup.today(),
      }),
    ),
  );

  receiver = await enrolled('PTU-RECEIVER', RECEIVER_AUTHORITY);
  bookingApprover = await enrolled('PTU-BOOKING-APPROVER', BOOKING_APPROVER_AUTHORITY);
  ptMaker = await enrolled('PTU-MAKER', PT_MAKER_AUTHORITY, { fieldClasses: ['cost', 'margin'] });
  ptReader = await enrolled('PTU-READER', [
    { recordType: 'receiving.arrival', action: 'view' },
    { recordType: 'files_imports.import_batch', action: 'view' },
    { recordType: 'merchandise.pt', action: 'view' },
  ]);
  notAPtMaker = await enrolled(
    'PTU-NOT-MAKER',
    PT_MAKER_AUTHORITY.filter((each) => each.recordType !== 'merchandise.pt'),
  );
  settingsAdmin = await enrolled('PTU-SETTINGS', [
    { recordType: 'access.approval_limit', action: 'view' },
    { recordType: 'access.approval_limit', action: 'create' },
    { recordType: 'exceptions.exception_routing', action: 'view' },
    { recordType: 'exceptions.exception_routing', action: 'edit' },
  ]);
  settingsApprover = await enrolled('PTU-SETTINGS-APPROVER', [
    { recordType: 'access.approval_limit', action: 'view' },
    { recordType: 'access.approval_limit', action: 'approve' },
    { recordType: 'exceptions.exception_routing', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
    { recordType: 'access.approval_reason', action: 'view' },
  ]);
  await unknownOnlyLimit(bookingApprover);
  for (const type of [
    'receiving.shortage',
    'receiving.excess',
    'receiving.wrong-goods',
    'receiving.unidentified-goods',
  ]) {
    await route(type, bookingApprover);
  }
}, 600_000);

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('submitting a PT file for a GRN (goods-in 5.6, 5.7, 5.8)', () => {
  it('DEC-134 PRD-REC-017 a file that passes makes a draft revision, its approval request on P RATE times QTY and the GRN mark', async () => {
    const style = syntheticCode('PTU-A');
    const { grnId } = await issuedGrn([
      { style, sizeAt: 0, counted: 2 },
      { style, sizeAt: 1, counted: 1 },
    ]);
    expect((await grnPt(grnId)).upload).toEqual({ kind: 'ready' });
    const { batchId, validated } = await uploaded(grnId, [ptRow(style, 0), ptRow(style, 0), ptRow(style, 1)]);
    expect(validated).toBe('Validated');
    const shown = await preview(batchId);
    // SYNTHETIC hand-worked: 3 pieces; MRP 3 x 1,999.00; P RATE 3 x 945.00; BASIC 3 x 700.00, in paise.
    expect(shown.draft?.totals).toEqual({
      rows: 3,
      pieces: 3,
      mrpPaise: 599_700,
      basicPaise: { kind: 'amount', paise: 210_000 },
      costPaise: { kind: 'amount', paise: 283_500 },
    });
    expect(shown.draft?.rows[0]?.margin).toEqual({ kind: 'margin', value: '52.73' });
    // Nothing is created until it is submitted (goods-in 5.6).
    expect((await grnPt(grnId)).pt).toBeNull();
    const published = await submitted(batchId);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    const read = await grnPt(grnId);
    const [revision] = read.pt?.revisions ?? [];
    expect(revision).toMatchObject({
      revisionNumber: 1,
      state: 'Awaiting approval',
      batchId,
      uploadedBy: ptMaker.user.id,
      totals: { rows: 3, pieces: 3, costPaise: { kind: 'amount', paise: 283_500 } },
      // A new style of two sizes: two SKUs proposed (goods-in 5.5).
      newProducts: 2,
    });
    expect(read.mark).toMatchObject({ kind: 'set', ptRevisionId: revision?.revisionId });
    expect(read.upload).toMatchObject({ kind: 'blocked', code: 'merchandise.pt-already-attached' });
    // The approval request binds to the revision, on its total proposed acquisition cost (goods-in 6.1; PRD-ACS-015).
    const request = await get(ptMaker, `/api/access/approval-requests/${revision?.request?.id ?? ''}`);
    expect(request.status, JSON.stringify(request.body)).toBe(200);
    expect(request.body).toMatchObject({
      actionType: 'merchandise.pt.approve',
      document: { recordType: 'merchandise.pt', versionId: revision?.revisionId },
      state: 'Awaiting approval',
      preparers: [ptMaker.user.id],
    });
    expect(JSON.stringify(request.body.value)).toContain('283500');
    // One PT per GRN (goods-in 5.1; DEC-137): a second file is refused while the draft stands.
    const again = await start(
      ptMaker,
      grnId,
      await handIn(ptMaker, await syntheticPtWorkbook({ rows: [ptRow(style, 0)], marker: 'PTU-AGAIN' }), 'again'),
    );
    expect(again.status).toBe(422);
    expect(errorOf(again)?.code).toBe('files-imports.subject-refused');
    expect(errorOf(again)?.missing).toEqual(
      expect.arrayContaining([{ kind: 'import-subject', reason: 'merchandise.pt-already-attached' }]),
    );
  });

  it('goods-in 5.7 a wrong draft is withdrawn, never edited: its request and the GRN mark end, and a corrected file is uploaded', async () => {
    const style = syntheticCode('PTU-W');
    const { grnId } = await issuedGrn([{ style, sizeAt: 0, counted: 1 }]);
    const { batchId } = await uploaded(grnId, [ptRow(style, 0)]);
    expect((await submitted(batchId)).status).toBe(200);
    const before = await grnPt(grnId);
    const revision = before.pt?.revisions[0];
    // A stale screen's token is refused (code-house-rules 12.7).
    const stale = await post(ptMaker, `/api/merchandise/pt/revisions/${revision?.revisionId ?? ''}/withdraw`, {
      versionToken: uuidv7(),
    });
    expect(stale.status).toBe(409);
    expect(errorOf(stale)?.code).toBe('kernel.stale-version');
    const withdrawn = await post(ptMaker, `/api/merchandise/pt/revisions/${revision?.revisionId ?? ''}/withdraw`, {
      versionToken: before.pt?.versionToken,
    });
    expect(withdrawn.status, JSON.stringify(withdrawn.body)).toBe(200);
    const after = await grnPt(grnId);
    expect(after.pt?.revisions[0]).toMatchObject({ state: 'Withdrawn', withdrawn: { by: ptMaker.user.id } });
    expect(after.pt?.revisions[0]?.request?.state).toBe('Withdrawn');
    expect(after.mark).toMatchObject({ kind: 'not-set', lastChange: { reason: 'pt-withdrawn' } });
    expect(after.upload).toEqual({ kind: 'ready' });
    // Withdrawn once: a second withdrawal is refused.
    const twice = await post(ptMaker, `/api/merchandise/pt/revisions/${revision?.revisionId ?? ''}/withdraw`, {
      versionToken: after.pt?.versionToken,
    });
    expect(errorOf(twice)?.code).toBe('merchandise.pt-not-a-draft');
    // The corrected file makes the PT's next revision.
    const corrected = await uploaded(grnId, [ptRow(style, 0)]);
    expect(corrected.validated).toBe('Validated');
    expect((await submitted(corrected.batchId)).status).toBe(200);
    const next = await grnPt(grnId);
    expect(next.pt?.revisions.map((each) => [each.revisionNumber, each.state])).toEqual([
      [2, 'Awaiting approval'],
      [1, 'Withdrawn'],
    ]);
  });

  it('PRD-ACS-008 a reader not granted cost or margin sees them masked', async () => {
    const style = syntheticCode('PTU-M');
    const { grnId } = await issuedGrn([{ style, sizeAt: 0, counted: 1 }]);
    const { batchId } = await uploaded(grnId, [ptRow(style, 0)]);
    const shown = await preview(batchId, ptReader);
    expect(shown.draft?.totals.costPaise).toEqual({ kind: 'masked', fieldClass: 'cost' });
    expect(shown.draft?.rows[0]?.pRatePaise).toEqual({ kind: 'masked', fieldClass: 'cost' });
    expect(shown.draft?.rows[0]?.margin).toEqual({ kind: 'masked', fieldClass: 'margin' });
    expect(shown.draft?.totals.mrpPaise).toBe(199_900);
  });

  it('goods-in 5.1 the uploader holds the permission to prepare PTs for the GRN place; another is refused', async () => {
    const style = syntheticCode('PTU-P');
    const { grnId } = await issuedGrn([{ style, sizeAt: 0, counted: 1 }]);
    const bytes = await syntheticPtWorkbook({ rows: [ptRow(style, 0)], marker: 'PTU-NOT-MAKER' });
    const refused = await start(notAPtMaker, grnId, await handIn(notAPtMaker, bytes, 'not-maker'));
    expect(refused.status).toBe(403);
    expect(errorOf(refused)).toMatchObject({ kind: 'not-authorised' });
    // A GRN the reader may not see is not found, never refused as not authorised (code-house-rules 12.3).
    const hidden = await start(ptMaker, uuidv7(), await handIn(ptMaker, bytes, 'hidden'));
    expect(hidden.status).toBe(404);
    expect(errorOf(hidden)?.code).toBe('files-imports.subject-not-found');
  });

  it('goods-in 5.2 PRD-IMP-004 finds the header on row 2 below a subtotal row, as on a preparer work tab', async () => {
    const style = syntheticCode('PTU-H');
    const { grnId } = await issuedGrn([{ style, sizeAt: 0, counted: 2 }]);
    const { validated } = await uploaded(grnId, [ptRow(style, 0), ptRow(style, 0)], { headerRow: 2 });
    expect(validated).toBe('Validated');
  });
});

describe('the PT upload waits for every held line (goods-in 12 test 2; 5.1, 4.6; DEC-137)', () => {
  it('DEC-137 refuses the upload while a held line waits for its decision, and accepts it once the excess is taken in', async () => {
    const style = syntheticCode('PTU-T2');
    const { arrivalId, grnId } = await issuedGrn([{ style, sizeAt: 0, invoice: 2, counted: 3, extra: 'received' }]);
    const read = await get(receiver, `/api/receiving/arrivals/${arrivalId}`);
    const held = arrivalReadSchema.parse(read.body).arrival.grn?.lines[0]?.heldLine;
    expect((await grnPt(grnId)).upload).toMatchObject({
      kind: 'blocked',
      code: 'merchandise.pt-held-lines-open',
      missing: [{ kind: 'record', recordType: 'receiving.held_line', recordId: held?.id }],
    });
    const bytes = await syntheticPtWorkbook({ rows: [ptRow(style, 0, { QTY: 3, NAG: 3 })], marker: 'PTU-T2' });
    const refused = await start(ptMaker, grnId, await handIn(ptMaker, bytes, 't2'));
    expect(refused.status).toBe(422);
    expect(errorOf(refused)).toMatchObject({
      code: 'files-imports.subject-refused',
      missing: [
        { kind: 'import-subject', reason: 'merchandise.pt-held-lines-open' },
        { kind: 'record', recordType: 'receiving.held_line', recordId: held?.id },
      ],
    });
    // A Booking approver takes the excess in (goods-in 4.6); its pieces join the good pieces the PT covers.
    const taken = await decide(bookingApprover, held?.requestId ?? '', held?.versionToken ?? '');
    expect(taken.status, JSON.stringify(taken.body)).toBe(200);
    const { validated } = await uploaded(grnId, [ptRow(style, 0, { QTY: 3, NAG: 3 })]);
    expect(validated).toBe('Validated');
  });
});

describe('a PT file refused whole, every problem listed by row and column (goods-in 12 test 8; 5.3, 5.4, 5.6)', () => {
  it('DEC-134 PRD-IMP-007 lists each problem of the file at once and creates nothing', async () => {
    const style = syntheticCode('PTU-T8');
    const missingStyle = syntheticCode('PTU-T8-GONE');
    const { grnId } = await issuedGrn([
      { style, sizeAt: 0, counted: 3 },
      { style, sizeAt: 1, counted: 1 },
      { style: missingStyle, sizeAt: 0, counted: 1 },
    ]);
    const rows = [
      // Row 2: a value off its list.
      ptRow(style, 0, { SEASON: syntheticCode('PTU-NO-SEASON') }),
      // Row 3: another brand.
      ptRow(style, 0, { BRAND: otherBrandCode }),
      // Row 4: NAG is not QTY.
      ptRow(style, 1, { NAG: 2 }),
      // Row 5: MARGIN disagrees with the PRD formula.
      ptRow(style, 1, { MARGIN: 50 }),
      // Row 6: P RATE above MRP.
      ptRow(style, 0, { 'P RATE': 2100, MARGIN: -5.05 }),
      // Row 7: a required column empty.
      ptRow(style, 0, { HSN: undefined }),
      // Row 8: a style and size the GRN does not have.
      ptRow(syntheticCode('PTU-T8-EXTRA'), 0),
    ];
    const { batchId, validated } = await uploaded(grnId, rows);
    expect(validated).toBe('Staged');
    const shown = await preview(batchId);
    expect(shown.draft).toBeNull();
    const found = shown.issues
      .filter((issue) => issue.severity === 'Blocking')
      .map((issue) => [issue.rowNumber ?? 0, issue.column ?? '', issue.code]);
    expect(found).toEqual(
      expect.arrayContaining([
        [2, 'A', 'merchandise.pt-value-not-on-list'],
        [3, 'B', 'merchandise.pt-brand-not-the-grn'],
        [4, 'S', 'merchandise.pt-nag-not-qty'],
        [5, 'T', 'merchandise.pt-margin-disagrees'],
        [6, 'P', 'merchandise.pt-p-rate-above-mrp'],
        // An empty cell has no place of its own: the report names its column by the layout's name (8.2).
        [7, 'HSN', 'files-imports.required-value-unknown'],
        [8, 'K', 'merchandise.pt-style-size-not-on-grn'],
        // Size 1: the file holds 2 pieces against the GRN's 1, named at the first row of that style and size.
        [4, 'M', 'merchandise.pt-quantity-differs-from-grn'],
      ]),
    );
    expect(shown.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'merchandise.pt-style-size-missing',
          missing: [{ kind: 'pt-style-size', styleCode: missingStyle, size: code.size(0), grnQuantity: '1' }],
        }),
      ]),
    );
    // Nothing is created: no PT, no mark (goods-in 5.6; PRD-IMP-012).
    const read = await grnPt(grnId);
    expect(read.pt).toBeNull();
    expect(read.mark).toEqual({ kind: 'not-set' });
    // A batch with Blocking issues is never submitted.
    const submit = await post(ptMaker, `/api/files-imports/batches/${batchId}/submit`, {
      versionId: shown.batchVersionId,
    });
    expect(submit.status).toBe(422);
  });

  it('GC6-3 A-9 a PT file that links to another workbook is refused at intake, asking for a self-contained copy', async () => {
    const bytes = withParts(await syntheticPtWorkbook({ rows: [], marker: 'PTU-LINKED' }), {
      'xl/externalLinks/externalLink1.xml': SYNTHETIC_EXTERNAL_LINK_PART,
      'xl/_rels/workbook.xml.rels': (old) =>
        withRelationship(old, 'rIdSyn', RELATIONSHIP.externalLink, 'externalLinks/externalLink1.xml', false),
    });
    const refused = await handIn(ptMaker, bytes, 'linked');
    expect(refused.status).toBe(422);
    expect(errorOf(refused)).toMatchObject({
      code: 'files-imports.workbook-depends-on-another',
      missing: [{ kind: 'self-contained-copy' }],
    });
  });
});

describe('colour is never compared (goods-in 12 test 9; 5.4; DEC-138)', () => {
  it('DEC-138 a GRN line with no colour against PT rows tagged PREMIUM is accepted', async () => {
    const style = syntheticCode('PTU-T9');
    const { grnId } = await issuedGrn([{ style, sizeAt: 1, counted: 2, colour: null }]);
    const premium = { COLOR: code.colour('PREMIUM') };
    const { validated } = await uploaded(grnId, [ptRow(style, 1, premium), ptRow(style, 1, premium)]);
    expect(validated).toBe('Validated');
  });
});

describe('products and barcodes (goods-in 12 test 10, the proposal part; 5.5; PRD-MER-007, PRD-MER-013, DEC-135)', () => {
  it('PRD-MER-013 DEC-135 proposes new products, finds an existing one by its barcode with its differences, and flags a repeated barcode', async () => {
    const fresh = syntheticCode('PTU-T10');
    const { grnId } = await issuedGrn([
      { style: fresh, sizeAt: 0, counted: 2 },
      { style: fresh, sizeAt: 1, counted: 1 },
      { style: existing.styleCode, sizeAt: 0, counted: 1 },
    ]);
    const shared = barcode();
    const { batchId } = await uploaded(grnId, [
      // Two pieces of one new SKU, each row its own barcode: one proposal.
      ptRow(fresh, 0),
      ptRow(fresh, 0),
      // A new SKU of another size.
      ptRow(fresh, 1),
      // The existing product, found by its barcode; the file tags it PREMIUM and names another gender: differences.
      ptRow(existing.styleCode, 0, {
        BARCODE: existing.barcode,
        COLOR: code.colour('PREMIUM'),
        GENDER: code.gender('KIDS'),
      }),
    ]);
    const shown = await preview(batchId);
    expect(shown.draft?.newProducts).toEqual([
      { styleCode: fresh, colour: code.colour('NAVY'), size: code.size(0), newStyle: true, rowNumbers: [2, 3] },
      { styleCode: fresh, colour: code.colour('NAVY'), size: code.size(1), newStyle: true, rowNumbers: [4] },
    ]);
    expect(shown.draft?.rows.map((row) => [row.rowNumber, row.product])).toEqual([
      [2, 'proposed'],
      [3, 'proposed'],
      [4, 'proposed'],
      [5, 'existing'],
    ]);
    expect(shown.draft?.differences).toEqual([
      { rowNumber: 5, field: 'colour', file: code.colour('PREMIUM'), product: code.colour('NAVY') },
      { rowNumber: 5, field: 'gender', file: code.gender('KIDS'), product: code.gender('MALE') },
    ]);
    expect(shown.draft?.repeatedBarcodes).toEqual([]);
    // A barcode given to rows of two different products is flagged, never refused, and kept for both.
    const repeatedGrn = await issuedGrn([
      { style: fresh, sizeAt: 1, counted: 1 },
      { style: existing.styleCode, sizeAt: 0, counted: 1 },
    ]);
    const twice = await uploaded(repeatedGrn.grnId, [
      ptRow(fresh, 1, { BARCODE: shared }),
      ptRow(existing.styleCode, 0, { BARCODE: shared }),
    ]);
    expect(twice.validated).toBe('Validated');
    const flagged = await preview(twice.batchId);
    expect(flagged.draft?.repeatedBarcodes).toEqual([{ barcode: shared, rowNumbers: [2, 3] }]);
    expect((await submitted(twice.batchId)).status).toBe(200);
    expect((await grnPt(repeatedGrn.grnId)).pt?.revisions[0]).toMatchObject({ newProducts: 1, repeatedBarcodes: 1 });
    // The first file submitted keeps its proposals and differences with the draft (goods-in 5.7).
    expect((await submitted(batchId)).status).toBe(200);
    expect((await grnPt(grnId)).pt?.revisions[0]).toMatchObject({ newProducts: 2, differences: 1 });
  });
});

describe('the blank template (goods-in section 11)', () => {
  it('goods-in 5.2 downloads the Confirmed layout with the lists its values must be on', async () => {
    const style = syntheticCode('PTU-TPL');
    const { grnId } = await issuedGrn([{ style, sizeAt: 0, counted: 1 }]);
    const read = await get(
      ptMaker,
      `/api/merchandise/pt/grns/${grnId}/template?layoutVersionId=${lists.layoutVersionId}&listsSheet=SYNTHETIC%20lists`,
    );
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(String(read.body.contentBase64), 'base64') as unknown as ArrayBuffer);
    const template = workbook.getWorksheet('SYNTHETIC PT');
    expect(template?.getRow(1).getCell(1).value).toBe('SEASON');
    expect(template?.getRow(1).getCell(22).value).toBe('SUGGESTED TYPE');
    const sheet = workbook.getWorksheet('SYNTHETIC lists');
    const header = (sheet?.getRow(1).values as unknown[] | undefined)?.slice(1) ?? [];
    expect(header).toEqual(
      expect.arrayContaining(['SEASON', 'BRAND', 'COLOR', 'SUB CATEGORY', 'SIZE', 'INPUT TAX', 'OUTPUT TAX']),
    );
    const colours = sheet?.getColumn(header.indexOf('COLOR') + 1).values.slice(2);
    expect(colours).toEqual([code.colour('NAVY'), code.colour('PREMIUM')].sort());
  });
});

describe('the template set up once (goods-in 5.2; PRD-IMP-004, PRD-IMP-008; DEC-134, DEC-140)', () => {
  it('goods-in 5.2 an Admin proposes the template layout and its mapping, a second person confirms them, and a filled file is detected by them', async () => {
    const admin = await enrolled('PTU-ADMIN', [
      { recordType: 'files_imports.layout', action: 'view' },
      { recordType: 'files_imports.layout', action: 'create' },
      { recordType: 'files_imports.mapping', action: 'create' },
      { recordType: 'access.approval_request', action: 'view' },
      { recordType: 'access.approval_reason', action: 'view' },
    ]);
    const confirmer = await enrolled('PTU-CONFIRMER', [
      { recordType: 'files_imports.layout', action: 'approve' },
      { recordType: 'files_imports.mapping', action: 'approve' },
      { recordType: 'access.approval_request', action: 'view' },
      { recordType: 'access.approval_reason', action: 'view' },
    ]);
    const layoutCode = syntheticCode('PTU-PROPOSED-TEMPLATE');
    const layout = await post(admin, '/api/files-imports/layout-versions', {
      layout: { code: layoutCode, source: syntheticName('PT template'), documentType: 'pt', kinds: ['transaction'] },
      structure: SYNTHETIC_PT_LAYOUT,
    });
    expect(layout.status, JSON.stringify(layout.body)).toBe(200);
    const { layoutVersionId, requestId: layoutRequest } = layout.body as { layoutVersionId: string; requestId: string };
    const mapping = await post(admin, '/api/files-imports/mapping-versions', {
      mapping: { code: syntheticCode('PTU-PROPOSED-MAPPING'), layoutVersionId, target: 'merchandise.pt' },
      fields: SYNTHETIC_PT_MAPPING,
    });
    expect(mapping.status, JSON.stringify(mapping.body)).toBe(200);
    const { mappingVersionId, requestId: mappingRequest } = mapping.body as {
      mappingVersionId: string;
      requestId: string;
    };
    // The proposer never confirms their own (PRD-IMP-008; POL-02.07).
    expect((await decide(admin, layoutRequest, layoutVersionId)).status).toBe(403);
    expect((await decide(confirmer, layoutRequest, layoutVersionId)).status).toBe(200);
    expect((await decide(confirmer, mappingRequest, mappingVersionId)).status).toBe(200);
    const style = syntheticCode('PTU-DETECTED');
    const stored = await handIn(
      ptMaker,
      await syntheticPtWorkbook({ rows: [ptRow(style, 0)], marker: 'PTU-DETECT', headerRow: 2 }),
      'detected',
    );
    const { storedFileId, receiptId } = stored.body as { storedFileId: string; receiptId: string };
    const detected = await get(
      ptMaker,
      `/api/files-imports/import-files/${storedFileId}/layouts?fileReceiptId=${receiptId}&hint=${layoutCode}`,
    );
    expect(detected.status, JSON.stringify(detected.body)).toBe(200);
    expect(detected.body.proposed).toBe(layoutVersionId);
  });
});

describe('a 10,000-line PT file (goods-in 12 test 21, the check; PRD-PRF-001)', () => {
  it('PRD-PRF-001 checks a 10,000-line PT file within one minute, and submits it', async () => {
    // SYNTHETIC: 100 styles of two sizes, 50 pieces each, one piece a row: 10,000 rows.
    const styles = Array.from({ length: 100 }, (_, at) => syntheticCode(`PTU-BIG-${String(at)}`));
    const sizes: readonly (0 | 1)[] = [0, 1];
    const { grnId } = await issuedGrn(
      styles.flatMap((style) => sizes.map((sizeAt) => ({ style, sizeAt, counted: 50 }))),
    );
    const rows = styles.flatMap((style) =>
      sizes.flatMap((sizeAt) => Array.from({ length: 50 }, () => ptRow(style, sizeAt))),
    );
    expect(rows).toHaveLength(10_000);
    const bytes = await syntheticPtWorkbook({ rows, marker: 'PTU-BIG', headerRow: 2 });
    const began = performance.now();
    const started = await start(ptMaker, grnId, await handIn(ptMaker, bytes, 'big'));
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const batchId = (started.body as { batchId: string }).batchId;
    const validated = await post(ptMaker, `/api/files-imports/batches/${batchId}/validate`, {});
    const checkedMs = performance.now() - began;
    expect(validated.status, JSON.stringify(validated.body)).toBe(200);
    expect((validated.body as { state: string }).state).toBe('Validated');
    expect(checkedMs, `checked in ${String(Math.round(checkedMs))} ms`).toBeLessThan(60_000);
    const shown = await preview(batchId);
    expect(shown.draft?.totals.pieces).toBe(10_000);
    expect(shown.draft?.rows).toHaveLength(200);
    expect(shown.draft?.next).toBe(shown.draft?.rows.at(-1)?.rowNumber);
    const submittedAt = performance.now();
    const published = await submitted(batchId);
    const submitMs = performance.now() - submittedAt;
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect((await grnPt(grnId)).pt?.revisions[0]?.totals).toMatchObject({ rows: 10_000, pieces: 10_000 });
    process.stdout.write(
      `PRD-PRF-001 SYNTHETIC 10,000-line PT file: checked in ${String(Math.round(checkedMs))} ms, ` +
        `submitted in ${String(Math.round(submitMs))} ms\n`,
    );
  }, 600_000);
});
