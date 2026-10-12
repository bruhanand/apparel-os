import { randomBytes, randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  errorEnvelopeSchema,
  fieldClassSchema,
  importBatchReadSchema,
  importFileStoredSchema,
  importOutcomesSchema,
  type FieldClass,
} from '@apparel-os/schemas';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMAND_RUNNER,
  ORGANISATION_ROUTER,
  type CommandRunner,
  type OrganisationRouter,
} from '../src/kernel/index.js';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import {
  SYNTHETIC_PRODUCT_COLUMNS,
  SYNTHETIC_PRODUCT_LAYOUT,
  SYNTHETIC_PRODUCT_MAPPING,
  SYNTHETIC_PRODUCT_SHEET,
  syntheticWorkbook,
} from './fixtures/imports.js';
import { SYNTHETIC_INTAKE_CAPS_ENVIRONMENT } from './fixtures/intake-caps.js';
import { syntheticCode, syntheticFileName } from './fixtures/synthetic.js';
import { RELATIONSHIP, SYNTHETIC_EXTERNAL_LINK_PART, withParts, withRelationship } from './fixtures/workbook-parts.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  SYNTHETIC_ORIGIN,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import {
  defineSyntheticImportBatchSeries,
  writeSyntheticLayout,
  type SyntheticProductLayout,
} from './support/imports.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F06-T02: intake refusals and caps through the whole application on real PostgreSQL and MinIO
// (imports-and-opening-data 3.1 step 1, 9.2, 9.3, 11, 17 tests 1, 25 and 28; PRD-IMP-001, PRD-IMP-002, PRD-SEC-011,
// PRD-SEC-014, PRD-ACS-008; DEC-052; DEC-112 GC6-3, GC6-5, GC6-6; DEC-116 GC6-17). A refused file is never stored
// or staged and never truncated; the refusal names its reason. Every file, cap and value is SYNTHETIC, except the
// caps of the main application, which are those documented for tests (9.3).

const ALL_CLASSES: readonly FieldClass[] = fieldClassSchema.options;

let world: SyntheticWorld;
let minio: TestFileStore;
let keysEnvironment: Record<string, string>;
/** Local work, with the caps documented for tests. */
let api: AccessTestApp;
/** The same Organisations served as `kdps-test`: the customer-contact check runs there (section 11). */
let testSetup: AccessTestApp;
/** SYNTHETIC tight caps of uploaded size, expanded size and rows. */
let capped: AccessTestApp;
/** A SYNTHETIC tight parser-memory cap. */
let memoryCapped: AccessTestApp;
/** A SYNTHETIC tight processing-time cap. */
let timeCapped: AccessTestApp;

const TIGHT = { upload: 20_000, expanded: 400_000, rows: 40 };
const TIGHT_MEMORY_MB = 64;
const TIGHT_TIME_MS = 1;

let counter = 0;
const next = (label: string) => syntheticCode(`${label}-${String(++counter)}`);

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const errorOf = (answer: Answer) => errorEnvelopeSchema.parse(answer.body).error;

async function signedIn(
  app: AccessTestApp,
  label: string,
  authorities: readonly SyntheticAuthority[],
  fieldClasses: readonly FieldClass[],
): Promise<{ user: SyntheticUser; cookie: string }> {
  const organisation = world.organisations[0];
  const user = await writeSyntheticUser(organisation.database, organisation.code, keysEnvironment, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
  });
  await grantSynthetic(organisation.database, { kind: 'user', id: user.id }, authorities, {
    fieldClasses: fieldClasses.map((fieldClass) => ({ fieldClass, access: 'view' as const })),
  });
  const response = await fetch(`${app.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.32' },
    body: JSON.stringify({
      organisationCode: organisation.code,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0)),
    }),
  });
  expect(response.status).toBe(200);
  return { user, cookie: (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '' };
}

async function call(app: AccessTestApp, method: 'GET' | 'POST', path: string, cookie: string, body?: unknown) {
  const response = await fetch(`${app.baseUrl}${path}`, {
    method,
    headers: {
      cookie,
      origin: SYNTHETIC_ORIGIN,
      ...(method === 'POST' ? { 'content-type': 'application/json', 'idempotency-key': uuidv7() } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function upload(app: AccessTestApp, cookie: string, bytes: Buffer, name = syntheticFileName('intake', 'xlsx')) {
  return call(app, 'POST', '/api/files-imports/import-files', cookie, {
    sourceSystem: 'manual-upload',
    originalName: name,
    contentBase64: bytes.toString('base64'),
  });
}

/** What intake keeps: the stored files, their receipts and the batches, counted. */
async function kept(): Promise<{ files: number; receipts: number; batches: number }> {
  const client = await connect(world.organisations[0].database, 'superuser');
  try {
    const count = async (table: string) =>
      Number((await client.query<{ n: string }>(`select count(*) as n from files_imports.${table}`)).rows[0]?.n);
    return {
      files: await count('stored_file'),
      receipts: await count('file_receipt'),
      batches: await count('import_batch'),
    };
  } finally {
    await client.end();
  }
}

/** Uploads a file that must be refused, and checks that nothing was stored or staged. */
async function refused(app: AccessTestApp, cookie: string, bytes: Buffer, name?: string) {
  const before = await kept();
  const answer = await upload(app, cookie, bytes, name);
  expect(answer.status).toBe(422);
  expect(await kept()).toEqual(before);
  return errorOf(answer);
}

const IMPORTER: SyntheticAuthority[] = [
  { recordType: 'files_imports.stored_file', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.import_batch', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'edit' },
];

/** A SYNTHETIC product workbook of the product layout's one sheet, with each cell as given. */
async function productFile(
  rows: readonly (readonly ExcelJS.CellValue[])[],
  header: readonly string[] = SYNTHETIC_PRODUCT_COLUMNS,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.title = `SYNTHETIC intake file ${next('FILE')}`;
  workbook.subject = 'SYNTHETIC';
  const sheet = workbook.addWorksheet(SYNTHETIC_PRODUCT_SHEET);
  sheet.addRow([...header]);
  for (const row of rows) sheet.addRow([...row]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const productRow = (style: string) => [style, `${style}-SKU`, 'SYN-BRAND', 'SYN-CAT', null, 'piece', 'merchandise'];

/** A SYNTHETIC workbook of `rows` short rows. */
const rowsFile = (rows: number) =>
  syntheticWorkbook({
    sheet: 'SYNTHETIC Rows',
    header: ['Code'],
    rows: Array.from({ length: rows - 1 }, (_, at) => [`SYN-${String(at)}`]),
    marker: next('ROWS'),
  });

let preparer: { user: SyntheticUser; cookie: string };
let productLayout: SyntheticProductLayout;
const CONTACT_SHEET = 'SYNTHETIC Sales';
const COST_TOTAL_LABEL = 'SYNTHETIC total cost';

beforeAll(async () => {
  world = await createSyntheticOrganisations('intake');
  minio = await startTestFileStore();
  keysEnvironment = syntheticKeysEnvironment(world);
  const organisation = world.organisations[0];
  await writeSyntheticSetting(organisation.database, 'access.sign-in-throttling', {
    failureLimit: 50,
    windowSeconds: 600,
  });
  await writeSyntheticSetting(organisation.database, 'access.password-rules', { minimumLength: 12 });
  await writeSyntheticSetting(organisation.database, 'access.office-session-limits', {
    idleLockSeconds: 1800,
    absoluteSeconds: 28800,
  });
  const fileStoreEnvironment = minio.environment;
  api = await startAccessApp(world, keysEnvironment, { fileStoreEnvironment });
  testSetup = await startAccessApp(world, keysEnvironment, { fileStoreEnvironment, environment: 'kdps-test' });
  capped = await startAccessApp(world, keysEnvironment, {
    fileStoreEnvironment,
    intakeCaps: {
      ...SYNTHETIC_INTAKE_CAPS_ENVIRONMENT,
      AOS_INTAKE_MAX_UPLOAD_BYTES: String(TIGHT.upload),
      AOS_INTAKE_MAX_EXPANDED_BYTES: String(TIGHT.expanded),
      AOS_INTAKE_MAX_ROWS: String(TIGHT.rows),
    },
  });
  memoryCapped = await startAccessApp(world, keysEnvironment, {
    fileStoreEnvironment,
    intakeCaps: {
      ...SYNTHETIC_INTAKE_CAPS_ENVIRONMENT,
      AOS_INTAKE_MAX_EXPANDED_BYTES: '209715200',
      AOS_INTAKE_MAX_PARSER_MEMORY_MB: String(TIGHT_MEMORY_MB),
    },
  });
  timeCapped = await startAccessApp(world, keysEnvironment, {
    fileStoreEnvironment,
    intakeCaps: { ...SYNTHETIC_INTAKE_CAPS_ENVIRONMENT, AOS_INTAKE_MAX_PROCESSING_MS: String(TIGHT_TIME_MS) },
  });
  preparer = await signedIn(api, 'INTAKE', IMPORTER, ALL_CLASSES);
  const confirmer = await writeSyntheticUser(organisation.database, organisation.code, keysEnvironment, {
    label: `CONFIRMER${String(randomInt(1_000_000))}`,
    enrolled: true,
  });
  productLayout = await writeSyntheticLayout(
    organisation.database,
    {
      layoutCode: syntheticCode('INTAKE-PRODUCT-LAYOUT'),
      mappingCode: syntheticCode('INTAKE-PRODUCT-MAPPING'),
      structure: {
        ...SYNTHETIC_PRODUCT_LAYOUT,
        columns: [
          ...SYNTHETIC_PRODUCT_LAYOUT.columns,
          { name: 'Cost', required: false, type: 'money', restrictedClass: 'cost' },
        ],
        // The file reports a total of its costs, so the report holds a control total of a restricted column (6.6).
        controlTotals: [{ column: 'Cost', labelColumn: 'SKU code', label: COST_TOTAL_LABEL }],
      },
      fields: SYNTHETIC_PRODUCT_MAPPING,
    },
    preparer.user.id,
    confirmer.id,
  );
  // The test setup's sales layout, Confirmed, whose phone column holds customer contact (section 11).
  await writeSyntheticLayout(
    organisation.database,
    {
      layoutCode: syntheticCode('INTAKE-SALES-LAYOUT'),
      mappingCode: syntheticCode('INTAKE-SALES-MAPPING'),
      structure: {
        shape: 'layout-version/1',
        format: 'xlsx',
        sheet: CONTACT_SHEET,
        headerRow: 1,
        dataStartRow: 2,
        columns: [
          { name: 'Bill', required: true },
          { name: 'Amount', required: true },
          { name: 'Customer phone', required: false, restrictedClass: 'customer-contact' },
        ],
        documentReference: 'Bill',
      },
      fields: { shape: 'mapping-version/1', fields: { styleCode: { column: 'Bill', transform: 'text' } } },
    },
    preparer.user.id,
    confirmer.id,
  );
  const router = api.app.get<OrganisationRouter>(ORGANISATION_ROUTER);
  const routed = await router.resolveForSignIn(organisation.code);
  if (!routed.routed) throw new Error('The synthetic Organisation was not routed');
  await api.app.get<CommandRunner>(COMMAND_RUNNER).run(
    {
      commandName: 'test.define-series',
      organisation: routed.organisation,
      correlationId: uuidv7(),
      actor: { kind: 'actor', actorId: preparer.user.id },
    },
    (context) => defineSyntheticImportBatchSeries(context, api.app.get<NumberingInterface>(NUMBERING)),
  );
}, 180_000);

afterAll(async () => {
  for (const app of [api, testSetup, capped, memoryCapped, timeCapped] as (AccessTestApp | undefined)[]) {
    await app?.close();
  }
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

async function startOn(stored: { storedFileId: string; receiptId: string }, cookie = preparer.cookie) {
  return call(api, 'POST', '/api/files-imports/batches', cookie, {
    storedFileId: stored.storedFileId,
    fileReceiptId: stored.receiptId,
    kind: 'create',
    target: 'merchandise',
    layoutVersionId: productLayout.layoutVersionId,
    mappingVersionId: productLayout.mappingVersionId,
  });
}

describe('GC-6 17 test 1, XLSX part: safety at intake (imports-and-opening-data 9.2, 9.3; PRD-SEC-011)', () => {
  it('PRD-IMP-001 reads an XLSX named .xls, from its content', async () => {
    const answer = await upload(
      api,
      preparer.cookie,
      await productFile([productRow(next('STYLE'))]),
      'SYNTHETIC-x.xls',
    );
    expect(answer.status).toBe(200);
    expect(importFileStoredSchema.parse(answer.body).format).toBe('xlsx');
  });

  it('A-1 refuses a damaged file with the reader error, and stores nothing', async () => {
    const bytes = Buffer.from(await productFile([productRow(next('STYLE'))]));
    const dataStart = 30 + bytes.readUInt16LE(26) + bytes.readUInt16LE(28);
    for (let at = dataStart; at < dataStart + 8; at += 1) bytes[at] = (bytes[at] ?? 0) ^ 0xff;
    const error = await refused(api, preparer.cookie, bytes);
    expect(error.code).toBe('files-imports.file-unreadable');
    expect(error.missing?.[0]).toMatchObject({ kind: 'reader-error' });
  });

  it('PRD-SEC-011 refuses a macro, an embedded object and an unapproved link before storing', async () => {
    const plain = await productFile([productRow(next('STYLE'))]);
    expect(
      await refused(api, preparer.cookie, withParts(plain, { 'xl/vbaProject.bin': randomBytes(64) })),
    ).toMatchObject({
      code: 'files-imports.workbook-active-content',
      missing: [{ kind: 'active-content', found: 'macros' }],
    });
    expect(
      await refused(api, preparer.cookie, withParts(plain, { 'xl/embeddings/oleObject1.bin': randomBytes(64) })),
    ).toMatchObject({ code: 'files-imports.workbook-active-content', missing: [{ found: 'embedded-objects' }] });
    const linkedImage = withParts(plain, {
      'xl/worksheets/_rels/sheet1.xml.rels': () =>
        withRelationship(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
          'rIdSyn',
          RELATIONSHIP.image,
          'https://example.invalid/SYNTHETIC.png',
          true,
        ),
    });
    expect(await refused(api, preparer.cookie, linkedImage)).toMatchObject({
      code: 'files-imports.workbook-unapproved-link',
      missing: [{ kind: 'unapproved-link', found: 'image' }],
    });
  });

  it('GC6-3 A-9 refuses a workbook that depends on another workbook, asking for a self-contained copy', async () => {
    const linked = withParts(await productFile([productRow(next('STYLE'))]), {
      'xl/externalLinks/externalLink1.xml': SYNTHETIC_EXTERNAL_LINK_PART,
      'xl/_rels/workbook.xml.rels': (old) =>
        withRelationship(old, 'rIdSyn', RELATIONSHIP.externalLink, 'externalLinks/externalLink1.xml', false),
    });
    expect(await refused(api, preparer.cookie, linked)).toMatchObject({
      kind: 'refused',
      code: 'files-imports.workbook-depends-on-another',
      missing: [{ kind: 'self-contained-copy' }],
    });
  });

  it('GC6-17: an ordinary hyperlink is kept as inert text and the file accepted; a reference inside the workbook is read', async () => {
    const style = next('STYLE');
    const target = `https://example.invalid/${next('LINK').toLowerCase()}`;
    const bytes = await productFile([
      [
        { text: style, hyperlink: target },
        { formula: 'A2&"-SKU"', result: `${style}-SKU` },
        'SYN-BRAND',
        'SYN-CAT',
        null,
        'piece',
        'merchandise',
      ],
    ]);
    const answer = await upload(api, preparer.cookie, bytes);
    expect(answer.status).toBe(200);
    const started = await startOn(importFileStoredSchema.parse(answer.body));
    expect(started.status).toBe(200);
    const read = await call(api, 'GET', `/api/files-imports/batches/${String(started.body.batchId)}`, preparer.cookie);
    const batch = importBatchReadSchema.parse(read.body);
    const cells = batch.documents[0]?.rows[0]?.cells ?? [];
    expect(cells.find((cell) => cell.ref === 'A2')?.text).toBe(style);
    // The reference inside the workbook is read by its cached value.
    expect(cells.find((cell) => cell.ref === 'B2')?.text).toBe(`${style}-SKU`);
    // The link's target is kept nowhere the batch shows.
    expect(JSON.stringify(read.body)).not.toContain(target);
  });
});

describe('GC-6 17 test 28: the caps at intake (imports-and-opening-data 9.3; DEC-112 GC6-5)', () => {
  it('refuses a file just over the uploaded-size cap, naming it, and stores nothing', async () => {
    const intake = await signedIn(capped, 'CAPPED', IMPORTER, ALL_CLASSES);
    // Incompressible SYNTHETIC text, so the file itself is large while its rows and expanded size stay within caps.
    const big = await syntheticWorkbook({
      sheet: 'SYNTHETIC Big',
      header: ['Code'],
      rows: Array.from({ length: 30 }, () => [randomBytes(700).toString('hex')]),
      marker: next('BIG'),
    });
    expect(big.length).toBeGreaterThan(TIGHT.upload);
    expect(await refused(capped, intake.cookie, big)).toMatchObject({
      code: 'files-imports.over-intake-cap',
      missing: [{ kind: 'intake-cap', cap: 'uploaded-size', limit: String(TIGHT.upload) }],
    });
  });

  it('refuses a small file that expands past the expanded-size cap, naming it', async () => {
    const intake = await signedIn(capped, 'CAPPED', IMPORTER, ALL_CLASSES);
    const bomb = await syntheticWorkbook({
      sheet: 'SYNTHETIC Wide',
      header: ['Code'],
      rows: Array.from({ length: 9 }, (_, at) => [`${String(at)}${'S'.repeat(50_000)}`]),
      marker: next('WIDE'),
    });
    expect(bomb.length).toBeLessThan(TIGHT.upload);
    expect(await refused(capped, intake.cookie, bomb)).toMatchObject({
      code: 'files-imports.over-intake-cap',
      missing: [{ kind: 'intake-cap', cap: 'expanded-size', limit: String(TIGHT.expanded) }],
    });
  });

  it('accepts a file of exactly the row cap and refuses one row more, never truncated', async () => {
    const intake = await signedIn(capped, 'CAPPED', IMPORTER, ALL_CLASSES);
    expect((await upload(capped, intake.cookie, await rowsFile(TIGHT.rows))).status).toBe(200);
    expect(await refused(capped, intake.cookie, await rowsFile(TIGHT.rows + 1))).toMatchObject({
      code: 'files-imports.over-intake-cap',
      missing: [{ kind: 'intake-cap', cap: 'rows', limit: String(TIGHT.rows) }],
    });
  });

  it('refuses a file the reader cannot read within the parser-memory cap, naming it', async () => {
    const intake = await signedIn(memoryCapped, 'MEMORY', IMPORTER, ALL_CLASSES);
    const heavy = withParts(await rowsFile(2), {
      'xl/sharedStrings.xml': (old) => old.replace('<t>Code</t>', `<t>${'S'.repeat(120_000_000)}</t>`),
    });
    expect(await refused(memoryCapped, intake.cookie, heavy)).toMatchObject({
      code: 'files-imports.over-intake-cap',
      missing: [{ kind: 'intake-cap', cap: 'parser-memory', limit: String(TIGHT_MEMORY_MB) }],
    });
  }, 60_000);

  it('refuses a file the reader cannot read within the processing-time cap, naming it', async () => {
    const intake = await signedIn(timeCapped, 'TIME', IMPORTER, ALL_CLASSES);
    expect(await refused(timeCapped, intake.cookie, await rowsFile(5))).toMatchObject({
      code: 'files-imports.over-intake-cap',
      missing: [{ kind: 'intake-cap', cap: 'processing-time', limit: String(TIGHT_TIME_MS) }],
    });
  });
});

// The documented SYNTHETIC caps of local work, tests and `dev` (9.3), proved with representative files just over each
// of uploaded size, expanded size and rows. The parser-memory and processing-time caps are proved above with tight
// SYNTHETIC caps: a file that takes a gibibyte of heap or a minute to read is not practical in a test run
// (S1-F06-T02 Notes).
describe('GC-6 17 test 28 at the documented caps (imports-and-opening-data 9.3; DEC-112 GC6-5)', () => {
  const caps = {
    upload: Number(SYNTHETIC_INTAKE_CAPS_ENVIRONMENT.AOS_INTAKE_MAX_UPLOAD_BYTES),
    expanded: Number(SYNTHETIC_INTAKE_CAPS_ENVIRONMENT.AOS_INTAKE_MAX_EXPANDED_BYTES),
    rows: Number(SYNTHETIC_INTAKE_CAPS_ENVIRONMENT.AOS_INTAKE_MAX_ROWS),
  };

  it('refuses a workbook just over 10 MiB, naming the cap, and stores nothing', async () => {
    // Incompressible SYNTHETIC text in few rows, so the file is large while its rows and expansion stay within caps.
    const big = await syntheticWorkbook({
      sheet: 'SYNTHETIC Big',
      header: ['Code'],
      rows: Array.from({ length: 480 }, () => [randomBytes(22_500).toString('base64')]),
      marker: next('BIG'),
    });
    expect(big.length).toBeGreaterThan(caps.upload);
    expect(big.length).toBeLessThan(caps.upload * 1.2);
    expect(await refused(api, preparer.cookie, big)).toMatchObject({
      code: 'files-imports.over-intake-cap',
      missing: [{ kind: 'intake-cap', cap: 'uploaded-size', limit: String(caps.upload) }],
    });
  }, 120_000);

  it('refuses a small workbook that expands just past 100 MiB, naming the cap', async () => {
    const bomb = withParts(await rowsFile(2), {
      'xl/sharedStrings.xml': (old) => old.replace('<t>Code</t>', `<t>${'S'.repeat(caps.expanded)}</t>`),
    });
    expect(bomb.length).toBeLessThan(caps.upload);
    expect(await refused(api, preparer.cookie, bomb)).toMatchObject({
      code: 'files-imports.over-intake-cap',
      missing: [{ kind: 'intake-cap', cap: 'expanded-size', limit: String(caps.expanded) }],
    });
  }, 120_000);

  it('accepts a workbook of exactly 150,000 rows and refuses one row more, never truncated', async () => {
    expect((await upload(api, preparer.cookie, await rowsFile(caps.rows))).status).toBe(200);
    expect(await refused(api, preparer.cookie, await rowsFile(caps.rows + 1))).toMatchObject({
      code: 'files-imports.over-intake-cap',
      missing: [{ kind: 'intake-cap', cap: 'rows', limit: String(caps.rows) }],
    });
  }, 300_000);
});

describe('GC-6 17 test 25: restricted columns (imports-and-opening-data 11; PRD-ACS-008, PRD-SEC-014; DEC-052)', () => {
  const salesFile = (header: string[], row: (string | number)[]) =>
    syntheticWorkbook({ sheet: CONTACT_SHEET, header, rows: [row], marker: next('SALES') });

  it('GC6-6 on the test setup refuses a file with customer-contact columns before storing it, even SYNTHETIC ones', async () => {
    const intake = await signedIn(testSetup, 'TESTSETUP', IMPORTER, ALL_CLASSES);
    const phone = `9${String(randomInt(100_000_000, 999_999_999))}`;
    const error = await refused(
      testSetup,
      intake.cookie,
      await salesFile(['Bill', 'Amount', 'Customer phone'], [next('BILL'), 100, phone]),
    );
    expect(error).toMatchObject({
      kind: 'refused',
      code: 'files-imports.customer-contact-columns',
      missing: [{ kind: 'customer-contact-column', sheet: CONTACT_SHEET, column: 'Customer phone' }],
    });
    // A clean upload, the same file without the column, is stored.
    expect(
      (await upload(testSetup, intake.cookie, await salesFile(['Bill', 'Amount'], [next('BILL'), 100]))).status,
    ).toBe(200);
    // A file no Confirmed layout recognises cannot be known to hold no contact column.
    expect(
      await refused(
        testSetup,
        intake.cookie,
        await salesFile(['Bill', 'Amount', 'Mobile'], [next('BILL'), 100, phone]),
      ),
    ).toMatchObject({
      code: 'files-imports.layout-needed-on-test-setup',
      missing: [{ kind: 'unrecognised-sheet', sheet: CONTACT_SHEET }],
    });
    // The same file is not checked for contact columns in local work, where synthetic contact tests run.
    expect(
      (
        await upload(
          api,
          preparer.cookie,
          await salesFile(['Bill', 'Amount', 'Customer phone'], [next('BILL'), 1, phone]),
        )
      ).status,
    ).toBe(200);
    // PRD-SEC-014: no log holds the refused file's contact value.
    expect(testSetup.logText()).not.toContain(phone);
  });

  it('PRD-ACS-008 PRD-SEC-014: a reader without the cost class sees cost masked; no log holds the cost value', async () => {
    const reader = await signedIn(
      api,
      'NOCOST',
      IMPORTER,
      ALL_CLASSES.filter((each) => each !== 'cost'),
    );
    const cost = `${String(randomInt(100_000, 999_999))}.37`;
    // The file's total disagrees with its one line, so the report holds a K-1 issue naming the cost column's values.
    const total = `${String(randomInt(100_000, 999_999))}.21`;
    const withCost = await productFile(
      [
        [...productRow(next('STYLE')), Number(cost)],
        [null, COST_TOTAL_LABEL, null, null, null, null, null, Number(total)],
      ],
      [...SYNTHETIC_PRODUCT_COLUMNS, 'Cost'],
    );
    const stored = await upload(api, reader.cookie, withCost);
    expect(stored.status).toBe(200);
    const started = await startOn(importFileStoredSchema.parse(stored.body), reader.cookie);
    expect(started.status).toBe(200);
    const batchId = String(started.body.batchId);
    const read = importBatchReadSchema.parse(
      (await call(api, 'GET', `/api/files-imports/batches/${batchId}`, reader.cookie)).body,
    );
    expect(read.batch.maskedClasses).toEqual(['cost']);
    expect(read.documents[0]?.rows[0]?.cells.find((cell) => cell.ref === 'H2')).toMatchObject({ masked: 'cost' });
    expect(read.ignoredRows.flatMap((row) => row.cells).find((cell) => cell.ref === 'H3')).toMatchObject({
      masked: 'cost',
    });
    const validated = await call(api, 'POST', `/api/files-imports/batches/${batchId}/validate`, reader.cookie);
    expect(JSON.stringify(validated.body)).not.toContain(cost);
    const report = importBatchReadSchema.parse(
      (await call(api, 'GET', `/api/files-imports/batches/${batchId}`, reader.cookie)).body,
    );
    // The control total of the cost column, and its issue's original value and sums, are masked (8.1, section 11).
    expect(report.report?.controlTotals).toEqual([
      expect.objectContaining({ column: 'Cost', reported: null, summed: null, agrees: null, masked: 'cost' }),
    ]);
    expect(report.report?.issues).toContainEqual(
      expect.objectContaining({
        class: 'K-1',
        original: { kind: 'masked', fieldClass: 'cost' },
        missing: [{ kind: 'control-total', column: 'Cost', masked: 'cost' }],
      }),
    );
    // A reader granted the class sees the same values: the masking bites only for the class the reader lacks.
    const seeing = importBatchReadSchema.parse(
      (await call(api, 'GET', `/api/files-imports/batches/${batchId}`, preparer.cookie)).body,
    );
    expect(seeing.report?.controlTotals).toEqual([
      expect.objectContaining({ column: 'Cost', reported: total, summed: cost }),
    ]);
    const reportText = JSON.stringify(report);
    expect(reportText).not.toContain(cost);
    expect(reportText).not.toContain(total);

    // The import outcomes report masks the cost column's control total too (7.4, 14). A SYNTHETIC outcome, as a
    // publish attempt keeps it, written directly: the masking under test is the report's read.
    const owner = await connect(world.organisations[0].database, 'superuser');
    try {
      await owner.query(
        `insert into files_imports.import_outcome (id, batch_id, batch_version_id, result, refusal_code, counts,
           documents, measures, control_totals, attempted_by_user_id, attempted_at)
         values ($1, $2, $3, 'failed', 'files-imports.document-refused', $4, '[]', '[]', $5, $6, now())`,
        [
          uuidv7(),
          batchId,
          read.batch.versionId,
          JSON.stringify({
            rowsRead: 3,
            rowsIgnored: 2,
            rowsAccepted: 0,
            rowsRejected: 1,
            rowsPending: 0,
            rowsDuplicate: 0,
          }),
          JSON.stringify([
            {
              sheet: SYNTHETIC_PRODUCT_SHEET,
              rowNumber: 3,
              column: 'Cost',
              reported: total,
              summed: cost,
              accepted: null,
            },
          ]),
          reader.user.id,
        ],
      );
    } finally {
      await owner.end();
    }
    const outcomes = await call(api, 'GET', '/api/files-imports/outcomes', reader.cookie);
    expect(outcomes.status).toBe(200);
    const listed = importOutcomesSchema.parse(outcomes.body).batches.find((batch) => batch.batchId === batchId);
    expect(listed?.lastOutcome?.controlTotals).toEqual([
      expect.objectContaining({ column: 'Cost', reported: null, summed: null, accepted: null, masked: 'cost' }),
    ]);
    expect(JSON.stringify(outcomes.body)).not.toContain(cost);
    const batchOutcomes = JSON.stringify(
      (await call(api, 'GET', `/api/files-imports/batches/${batchId}`, reader.cookie)).body,
    );
    expect(batchOutcomes).not.toContain(cost);
    expect(batchOutcomes).not.toContain(total);
    expect(api.logText()).not.toContain(cost);
  });
});
