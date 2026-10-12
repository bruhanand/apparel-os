import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  errorEnvelopeSchema,
  fieldClassSchema,
  IMPORT_BATCH_TYPE,
  importBatchReadSchema,
  importFileStoredSchema,
  importOutcomesSchema,
  type CatalogueChanged,
  type FieldClass,
  type ImportBatchRead,
  type LayoutStructure,
  type MappingFields,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMAND_RUNNER,
  ORGANISATION_ROUTER,
  type CommandRunner,
  type OrganisationRouter,
} from '../src/kernel/index.js';
import { IMPORT_HANDLERS, knownValue, type ImportHandlers } from '../src/modules/files-imports/index.js';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { syntheticWorkbook } from './fixtures/imports.js';
import { syntheticCode, syntheticFileName, syntheticName } from './fixtures/synthetic.js';
import {
  codeFor,
  startAccessApp,
  SyntheticClock,
  syntheticKeysEnvironment,
  SYNTHETIC_ORIGIN,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { defineSyntheticImportBatchSeries } from './support/imports.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { structureSetup, writeSyntheticSites, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F06-T04: duplicates, conflicts and governed revisions, publishing one document per transaction, concurrent
// publishes on separate connections, counts that close, Withdraw, and the import outcomes report, through the whole
// application on real PostgreSQL and MinIO (imports-and-opening-data 3.2, 3.3, 7.1 to 7.4, 13.1, 13.3, 14, 15.1, 17
// tests 14, 15, 16 and 17; PRD-IMP-011, PRD-IMP-012, PRD-IMP-013, PRD-INT-002, PRD-INT-005, PRD-ACP-012,
// PRD-MOD-003, PRD-SEC-005; stage 1 README 7.2). Every file, layout, user and value is SYNTHETIC.

const ALL_CLASSES: readonly FieldClass[] = fieldClassSchema.options;
const SHEET = 'SYNTHETIC Products';
const HEADER = ['Style code', 'SKU code', 'Brand code', 'Category code', 'Size', 'Stock unit', 'Purpose'];

const PRODUCT_LAYOUT: LayoutStructure = {
  shape: 'layout-version/1',
  format: 'xlsx',
  sheet: SHEET,
  headerRow: 2,
  dataStartRow: 3,
  columns: [
    { name: 'Style code', required: true },
    { name: 'SKU code', required: true },
    { name: 'Brand code', required: true },
    { name: 'Category code', required: true },
    { name: 'Size', required: false },
    { name: 'Stock unit', required: true },
    { name: 'Purpose', required: true },
  ],
  documentReference: 'Style code',
};

const PRODUCT_MAPPING: MappingFields = {
  shape: 'mapping-version/1',
  fields: {
    styleCode: { column: 'Style code', transform: 'text' },
    skuCode: { column: 'SKU code', transform: 'text' },
    brandCode: { column: 'Brand code', transform: 'text' },
    categoryCode: { column: 'Category code', transform: 'text' },
    size: { column: 'Size', transform: 'text' },
    stockUnit: { column: 'Stock unit', transform: 'text' },
    purpose: { column: 'Purpose', transform: 'text' },
  },
};

/** A SYNTHETIC target whose handler refuses, at publishing only, a document whose code says so (17 test 16). */
const FAILING_TARGET = syntheticCode('FAILING').toLowerCase();
const COUNTED_LAYOUT: LayoutStructure = {
  shape: 'layout-version/1',
  format: 'xlsx',
  sheet: SHEET,
  headerRow: 1,
  dataStartRow: 2,
  columns: [
    { name: 'Code', required: true },
    { name: 'Quantity', required: true, type: 'number' },
  ],
  documentReference: 'Code',
};
const COUNTED_MAPPING: MappingFields = {
  shape: 'mapping-version/1',
  fields: { code: { column: 'Code', transform: 'text' }, quantity: { column: 'Quantity', transform: 'decimal' } },
};

let world: SyntheticWorld;
let minio: TestFileStore;
let api: AccessTestApp;
let clock: SyntheticClock;
let keys: Record<string, string>;
let setup: StructureSetup;
let approveReason: string;
let database: string;
let brandCode: string;
let categoryCode: string;
let counter = 0;
const next = (label: string) => syntheticCode(`${label}-${String(++counter)}`);
const cookies = new Map<string, string>();

let preparer: SyntheticUser;
let confirmer: SyntheticUser;
let storeReader: SyntheticUser;
let productVersions: Versions;
let countedVersions: Versions;

const STORE_A = '01900000-0000-7000-8000-0000000fd001';
const STORE_B = '01900000-0000-7000-8000-0000000fd002';
const SITE = '01900000-0000-7000-8000-0000000fd101';

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly replayed: boolean;
}

function freshCode(user: SyntheticUser): string {
  clock.advance(30);
  return codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now());
}

async function enrolled(
  label: string,
  authorities: readonly SyntheticAuthority[],
  options: Parameters<typeof grantSynthetic>[3] = {},
): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(database, world.organisations[0].code, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
  });
  await grantSynthetic(database, { kind: 'user', id: user.id }, authorities, options);
  await signIn(user);
  return user;
}

/** Signs a user in, again after the clock moved past the session's limits (SYNTHETIC session settings). */
async function signIn(user: SyntheticUser): Promise<void> {
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.71' },
    body: JSON.stringify({
      organisationCode: world.organisations[0].code,
      login: user.login,
      password: user.password,
      totpCode: freshCode(user),
    }),
  });
  expect(response.status).toBe(200);
  cookies.set(user.id, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
}

async function call(
  user: SyntheticUser,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  key: string = uuidv7(),
): Promise<Answer> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method,
    headers: {
      cookie: cookies.get(user.id) ?? '',
      origin: SYNTHETIC_ORIGIN,
      ...(method === 'POST' ? { 'content-type': 'application/json', 'idempotency-key': key } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    replayed: response.headers.get('idempotent-replayed') === 'true',
  };
}

const errorOf = (answer: Answer) => errorEnvelopeSchema.parse(answer.body).error;

function ok(answer: Answer): Record<string, unknown> {
  if (answer.status !== 200) throw new Error(`Refused ${String(answer.status)}: ${JSON.stringify(answer.body)}`);
  return answer.body;
}

const decide = (by: SyntheticUser, requestId: string, versionId: string) =>
  call(by, 'POST', `/api/access/approval-requests/${requestId}/decision`, {
    versionId,
    outcome: 'approve',
    reason: { kind: 'listed', reasonId: approveReason },
    totpCode: freshCode(by),
  });

async function rows<T extends Record<string, unknown>>(query: string, values: unknown[] = []): Promise<T[]> {
  const client = await connect(database, 'superuser');
  try {
    return (await client.query<T>(query, values)).rows;
  } finally {
    await client.end();
  }
}

/** A product row: style, SKU, the brand and category recorded here, no size, a stock unit and a purpose. */
function product(style: string, sku: string, purpose = 'merchandise') {
  return [style, sku, brandCode, categoryCode, null, 'piece', purpose];
}

/** Uploads a SYNTHETIC product file whose first row is a title above the header (7.4: it is read and ignored). */
async function upload(
  user: SyntheticUser,
  rowsOfFile: readonly (readonly (string | number | null)[])[],
  options: { header?: readonly string[]; claimedReference?: string; titled?: boolean } = {},
) {
  const marker = next('FILE');
  const titled = options.titled ?? true;
  const bytes = await syntheticWorkbook({
    sheet: SHEET,
    header: titled ? [syntheticName('Product file title')] : [...(options.header ?? HEADER)],
    rows: titled ? [[...(options.header ?? HEADER)], ...rowsOfFile] : rowsOfFile,
    marker,
  });
  return importFileStoredSchema.parse(
    ok(
      await call(user, 'POST', '/api/files-imports/import-files', {
        sourceSystem: 'manual-upload',
        originalName: syntheticFileName(marker.toLowerCase(), 'xlsx'),
        contentBase64: bytes.toString('base64'),
        ...(options.claimedReference === undefined ? {} : { claimedReference: options.claimedReference }),
      }),
    ),
  );
}

interface Versions {
  readonly layoutVersionId: string;
  readonly mappingVersionId: string;
}

async function confirmedVersions(structure: LayoutStructure, fields: MappingFields, target: string) {
  const layout = ok(
    await call(preparer, 'POST', '/api/files-imports/layout-versions', {
      layout: {
        code: next('LAYOUT'),
        source: syntheticName('Product file'),
        documentType: 'master',
        kinds: ['create'],
      },
      structure,
    }),
  );
  const mapping = ok(
    await call(preparer, 'POST', '/api/files-imports/mapping-versions', {
      mapping: { code: next('MAPPING'), layoutVersionId: layout.layoutVersionId, target },
      fields,
    }),
  );
  ok(await decide(confirmer, String(layout.requestId), String(layout.layoutVersionId)));
  ok(await decide(confirmer, String(mapping.requestId), String(mapping.mappingVersionId)));
  return { layoutVersionId: String(layout.layoutVersionId), mappingVersionId: String(mapping.mappingVersionId) };
}

function startBody(
  stored: { storedFileId: string; receiptId: string },
  extra: Record<string, unknown> = {},
  versions: Versions = productVersions,
  target = 'merchandise',
) {
  return {
    storedFileId: stored.storedFileId,
    fileReceiptId: stored.receiptId,
    kind: 'create',
    target,
    layoutVersionId: versions.layoutVersionId,
    mappingVersionId: versions.mappingVersionId,
    ...extra,
  };
}

async function start(...args: Parameters<typeof startBody>): Promise<string> {
  return String(ok(await call(preparer, 'POST', '/api/files-imports/batches', startBody(...args))).batchId);
}

async function read(batchId: string, by: SyntheticUser = preparer): Promise<ImportBatchRead> {
  return importBatchReadSchema.parse(ok(await call(by, 'GET', `/api/files-imports/batches/${batchId}`)));
}

const step = (batchId: string, name: string, body: unknown = {}, key?: string) =>
  call(preparer, 'POST', `/api/files-imports/batches/${batchId}/${name}`, body, key);

/** Submit for review, with the batch version the screen read (code-house-rules 12.7). */
async function submit(batchId: string): Promise<Answer> {
  return step(batchId, 'submit', { versionId: (await read(batchId)).batch.versionId });
}

/** Validate and submit for review; the batch must come out Validated. */
async function ready(batchId: string): Promise<string> {
  expect(ok(await step(batchId, 'validate'))).toMatchObject({ state: 'Validated' });
  ok(await submit(batchId));
  return (await read(batchId)).batch.versionId;
}

async function publish(batchId: string, key?: string, extra: Record<string, unknown> = {}): Promise<Answer> {
  return step(batchId, 'publish', { versionId: (await read(batchId)).batch.versionId, ...extra }, key);
}

/** The product proposals for a style code: the effect a published product document has (structure-and-masters 4.2). */
async function proposalsFor(style: string): Promise<{ id: string }[]> {
  return rows(`select id from merchandise.product_proposal where proposal -> 'style' ->> 'code' = $1`, [style]);
}

const IMPORTER: SyntheticAuthority[] = [
  { recordType: 'files_imports.stored_file', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'view' },
  // The preparer may hold approve too: their own approval of a batch they prepared is still refused (PRD-ACS-006).
  { recordType: 'files_imports.import_batch', action: 'approve' },
  { recordType: 'files_imports.import_batch', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'edit' },
  { recordType: 'files_imports.layout', action: 'view' },
  { recordType: 'files_imports.layout', action: 'create' },
  { recordType: 'files_imports.mapping', action: 'view' },
  { recordType: 'files_imports.mapping', action: 'create' },
  { recordType: 'merchandise.product_proposal', action: 'view' },
  { recordType: 'merchandise.product_proposal', action: 'create' },
  { recordType: 'merchandise.sku', action: 'view' },
  { recordType: 'merchandise.sku', action: 'edit' },
];

const CONFIRMER: SyntheticAuthority[] = [
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.import_batch', action: 'approve' },
  { recordType: 'files_imports.layout', action: 'view' },
  { recordType: 'files_imports.layout', action: 'approve' },
  { recordType: 'files_imports.mapping', action: 'view' },
  { recordType: 'files_imports.mapping', action: 'approve' },
];

beforeAll(async () => {
  world = await createSyntheticOrganisations('importsdup');
  database = world.organisations[0].database;
  minio = await startTestFileStore();
  keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(database, 'access.sign-in-throttling', { failureLimit: 50, windowSeconds: 600 });
  await writeSyntheticSetting(database, 'access.password-rules', { minimumLength: 12 });
  await writeSyntheticSetting(database, 'access.office-session-limits', {
    idleLockSeconds: 3600,
    absoluteSeconds: 28800,
  });
  approveReason = await writeSyntheticReason(database, 'approve');
  await writeSyntheticReason(database, 'reject');
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock, fileStoreEnvironment: minio.environment });
  // A SYNTHETIC handler that sums a quantity (7.4) and refuses, at publishing only, a code that says so (13.2).
  api.app.get<ImportHandlers>(IMPORT_HANDLERS).register({
    target: FAILING_TARGET,
    recordType: IMPORT_BATCH_TYPE,
    kinds: ['create'],
    effects: 'master-records',
    fields: [
      { name: 'code', required: true },
      { name: 'quantity', required: true },
    ],
    measures: [{ field: 'quantity', kind: 'quantity' }],
    sourceScope: () => FAILING_TARGET,
    revisions: 'none',
    publishNeeds: () => Promise.resolve({ action: 'view', recordType: IMPORT_BATCH_TYPE }),
    lockTargets: () => Promise.resolve([]),
    review: () => ({ kind: 'submission' }),
    suggestions: () => Promise.resolve([]),
    checkRuleTarget: () => Promise.resolve(undefined),
    preview: (_context, document) =>
      Promise.resolve({
        kind: 'would-create',
        records: [{ recordType: IMPORT_BATCH_TYPE, codes: [document.reference] }],
      }),
    publish: (_context, _publisher, document) =>
      Promise.resolve(
        document.rows.some((row) => knownValue(row.values.code)?.includes('REFUSE') === true)
          ? { kind: 'refused', refusal: { kind: 'refused', code: 'files-imports.synthetic-refusal', missing: [] } }
          : { kind: 'published', records: [] },
      ),
  });
  setup = await structureSetup({
    directory: world.directory,
    database,
    organisationCode: world.organisations[0].code,
    keysEnvironment: keys,
    label: 'IMPORTSDUP',
  });
  brandCode = next('BRAND');
  categoryCode = next('CAT');
  const recorded = (outcome: { kind: string; answer?: CatalogueChanged }) => {
    if (outcome.kind !== 'success' || outcome.answer === undefined) throw new Error('The catalogue was refused');
    return outcome.answer;
  };
  recorded(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareBrand(c, p, {
        code: brandCode,
        name: syntheticName(`Brand ${brandCode}`),
        aliases: [],
        validFrom: setup.today(),
      }),
    ),
  );
  recorded(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareCategory(c, p, {
        code: categoryCode,
        name: syntheticName('Duplicate Category'),
        identityAttributeIds: [],
        validFrom: setup.today(),
      }),
    ),
  );
  await writeSyntheticSites(database, [SITE]);
  const owner = await connect(database, 'migration');
  try {
    for (const store of [STORE_A, STORE_B]) {
      await owner.query('insert into organisation.store (id, code) values ($1, $2)', [store, next('STORE')]);
      await owner.query(
        `insert into organisation.store_version (id, store_id, name, format, operating_model, site_id, status,
           valid_during, decision, prepared_by_user_id)
         values ($1, $2, $3, 'mbo', 'company-owned', $4, 'Active', '[2000-01-01,)', 'Approved', $5)`,
        [uuidv7(), store, syntheticName(`Store ${store.slice(-4)}`), SITE, uuidv7()],
      );
    }
  } finally {
    await owner.end();
  }
  preparer = await enrolled('PREPARER', IMPORTER, {
    fieldClasses: ALL_CLASSES.map((fieldClass) => ({ fieldClass, access: 'view' as const })),
  });
  confirmer = await enrolled('CONFIRMER', CONFIRMER);
  storeReader = await enrolled('STORE', [{ recordType: 'files_imports.import_batch', action: 'view' }], {
    scope: {
      kind: 'dimensions',
      legalEntity: { kind: 'all' },
      place: { kind: 'selected', members: [{ type: 'store', id: STORE_A }] },
      brand: { kind: 'all' },
    },
    fieldClasses: ALL_CLASSES.map((fieldClass) => ({ fieldClass, access: 'view' as const })),
  });
  const router = api.app.get<OrganisationRouter>(ORGANISATION_ROUTER);
  const routed = await router.resolveForSignIn(world.organisations[0].code);
  if (!routed.routed) throw new Error('not routed');
  await api.app.get<CommandRunner>(COMMAND_RUNNER).run(
    {
      commandName: 'test.define-series',
      organisation: routed.organisation,
      correlationId: uuidv7(),
      actor: { kind: 'actor', actorId: setup.preparer.id },
    },
    (context) => defineSyntheticImportBatchSeries(context, api.app.get<NumberingInterface>(NUMBERING)),
  );
  productVersions = await confirmedVersions(PRODUCT_LAYOUT, PRODUCT_MAPPING, 'merchandise');
  countedVersions = await confirmedVersions(COUNTED_LAYOUT, COUNTED_MAPPING, FAILING_TARGET);
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (setup as StructureSetup | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('duplicates, conflicts and governed revisions (imports-and-opening-data 7.1 to 7.3)', () => {
  it('GC-6 17 test 14 PRD-IMP-011: the same document twice has one effect and counts as duplicate; changed content is a conflict', async () => {
    const [kept, other, fresh] = [next('STYLE'), next('STYLE'), next('STYLE')];
    const first = await start(await upload(preparer, [product(kept, next('SKU')), product(other, next('SKU'))]));
    await ready(first);
    expect(ok(await publish(first))).toMatchObject({ state: 'Published', result: 'published' });
    expect(await proposalsFor(kept)).toHaveLength(1);
    const keptSku = (await read(first)).documents[0]?.rows[0]?.values.skuCode;
    const sku = keptSku?.kind === 'supplied' ? keptSku.value : '';

    // A later file holds the same document with the same content, and a new one.
    const second = await start(await upload(preparer, [product(kept, sku), product(fresh, next('SKU'))]));
    expect(ok(await step(second, 'validate'))).toMatchObject({ state: 'Validated' });
    const report = await read(second);
    expect(report.report?.issues).toContainEqual(
      expect.objectContaining({ class: 'duplicate', severity: 'Note', code: 'files-imports.duplicate-document' }),
    );
    expect(report.documents[0]?.identity).toMatchObject({ kind: 'duplicate' });
    // A duplicate is not previewed: it never publishes.
    expect(report.documents[0]?.preview).toBeUndefined();
    ok(await submit(second));
    const published = ok(await publish(second));
    expect(published).toMatchObject({ state: 'Published', result: 'published' });
    expect(published.documents).toEqual([
      expect.objectContaining({ result: 'duplicate' }),
      expect.objectContaining({ result: 'published' }),
    ]);
    expect(await proposalsFor(kept)).toHaveLength(1);
    expect(await proposalsFor(fresh)).toHaveLength(1);
    const outcome = (await read(second)).outcomes.at(-1);
    // The title above the header is read and ignored with the header, so rows read close (7.4).
    expect(outcome?.counts).toEqual({
      rowsRead: 4,
      rowsIgnored: 2,
      rowsAccepted: 1,
      rowsRejected: 0,
      rowsPending: 0,
      rowsDuplicate: 1,
    });

    // The same identity with other content is a conflict: Blocking, so the batch stays Staged.
    const changed = await start(await upload(preparer, [product(kept, sku, 'promotional')]));
    expect(ok(await step(changed, 'validate'))).toMatchObject({ state: 'Staged' });
    expect((await read(changed)).report?.issues).toContainEqual(
      expect.objectContaining({
        class: 'conflict',
        severity: 'Blocking',
        code: 'files-imports.conflicting-document',
        correction: 'files-imports.exclude-or-import-as-a-revision',
      }),
    );
    // Withdrawn, it Fails; nothing it holds was published (3.2).
    const withdrawn = ok(await step(changed, 'withdraw', { versionId: (await read(changed)).batch.versionId }));
    expect(withdrawn).toMatchObject({ state: 'Failed' });
    expect(await proposalsFor(kept)).toHaveLength(1);
    const failed = await rows<{ payload: { batchId: string } }>(
      `select payload from kernel.outbox_event where event_type = 'files-imports.import-failed'
         and subject_record_id = $1`,
      [changed],
    );
    expect(failed).toEqual([{ payload: { batchId: changed } }]);
  });

  it('PRD-IMP-011 7.2: a document reference claimed at the hand-in and already published refuses a create batch, not an update', async () => {
    const style = next('STYLE');
    const first = await start(await upload(preparer, [product(style, next('SKU'))]));
    await ready(first);
    ok(await publish(first));
    const claimed = await upload(preparer, [product(style, next('SKU'))], { claimedReference: style });
    const refused = await call(preparer, 'POST', '/api/files-imports/batches', startBody(claimed));
    expect(errorOf(refused)).toMatchObject({
      code: 'files-imports.document-already-published',
      missing: [{ kind: 'import-document', documentId: (await read(first)).documents[0]?.documentId }],
    });
    expect(
      ok(await call(preparer, 'POST', '/api/files-imports/batches', startBody(claimed, { kind: 'update' }))),
    ).toMatchObject({ state: 'Staged' });
  });

  it('PRD-SEC-005 7.2: the refusal of a reference already published names the document only to whoever may view it', async () => {
    const style = next('STYLE');
    const first = await start(await upload(preparer, [product(style, next('SKU'))]), {
      scope: { siteId: SITE, storeId: STORE_A },
    });
    await ready(first);
    ok(await publish(first));
    // A preparer of Store B only: the published document of Store A is outside their scope.
    const storeB = await enrolled('STOREB', IMPORTER, {
      scope: {
        kind: 'dimensions',
        legalEntity: { kind: 'all' },
        place: { kind: 'selected', members: [{ type: 'store', id: STORE_B }] },
        brand: { kind: 'all' },
      },
      fieldClasses: ALL_CLASSES.map((fieldClass) => ({ fieldClass, access: 'view' as const })),
    });
    const claimed = await upload(storeB, [product(style, next('SKU'))], { claimedReference: style });
    const refused = await call(
      storeB,
      'POST',
      '/api/files-imports/batches',
      startBody(claimed, { scope: { siteId: SITE, storeId: STORE_B } }),
    );
    expect(errorOf(refused)).toMatchObject({ code: 'files-imports.document-already-published', missing: [] });
    expect(JSON.stringify(refused.body)).not.toContain((await read(first)).documents[0]?.documentId ?? '');
  });

  it('code-house-rules 8.1: Start an import authorises before it reads the file or checks what is published', async () => {
    const style = next('STYLE');
    const first = await start(await upload(preparer, [product(style, next('SKU'))]));
    await ready(first);
    ok(await publish(first));
    const claimed = await upload(preparer, [product(style, next('SKU'))], { claimedReference: style });
    // Store A only, starting a batch at Store B: refused as not authorised, never as a published reference.
    const elsewhere = await enrolled('ELSEWHERE', IMPORTER, {
      scope: {
        kind: 'dimensions',
        legalEntity: { kind: 'all' },
        place: { kind: 'selected', members: [{ type: 'store', id: STORE_A }] },
        brand: { kind: 'all' },
      },
    });
    const refused = await call(
      elsewhere,
      'POST',
      '/api/files-imports/batches',
      startBody(claimed, { scope: { siteId: SITE, storeId: STORE_B } }),
    );
    expect(errorOf(refused)).toMatchObject({ kind: 'not-authorised', code: 'access.not-authorised' });
  });

  it('GC-6 17 test 14 PRD-ACP-012: a governed revision publishes once, as the next version, and keeps the original', async () => {
    const style = next('STYLE');
    const sku = next('SKU');
    const created = await start(await upload(preparer, [product(style, sku)]));
    await ready(created);
    ok(await publish(created));
    const original = (await read(created)).documents[0];
    // A different person confirms the proposal, so the style and its SKU exist (DM-5).
    const [proposal] = await proposalsFor(style);
    const stored = await setup.run(setup.preparer.id, (c) => setup.catalogue.productProposal(c, proposal?.id ?? ''));
    if (stored?.request === undefined) throw new Error('no approval request');
    const confirmed = await setup.decide(stored.request.id, proposal?.id ?? '');
    expect(confirmed.kind).toBe('success');
    // The next version starts the next day, after the first version's start (structure-and-masters 2.2).
    clock.advance(86_400);
    for (const user of [preparer, confirmer, storeReader]) await signIn(user);

    const revision = await start(await upload(preparer, [product(style, sku, 'promotional')]), { kind: 'update' });
    expect(ok(await step(revision, 'validate'))).toMatchObject({ state: 'Validated' });
    expect((await read(revision)).report?.issues).toContainEqual(
      expect.objectContaining({
        class: 'revision',
        severity: 'Note',
        code: 'files-imports.revises-document',
        missing: [{ kind: 'import-document', documentId: original?.documentId }],
      }),
    );
    // An update batch takes effect when it publishes, so it needs an independent approval of the batch version first
    // (product owner, 11 Oct 2026): Submit requests it, bound to the version submitted.
    const submitted = ok(await submit(revision));
    const requestId = String(submitted.requestId);
    const versionId = String(submitted.submittedVersionId);
    expect(errorOf(await publish(revision))).toMatchObject({
      code: 'files-imports.review-missing',
      missing: [{ kind: 'review', review: 'approval' }],
    });
    // The preparer may not approve it, though they hold approve (PRD-ACS-006).
    expect(errorOf(await decide(preparer, requestId, versionId))).toMatchObject({ code: 'access.self-preparation' });
    const purposes = () =>
      rows<{ purpose: string }>(
        `select v.purpose from merchandise.sku_version v join merchandise.sku s on s.id = v.sku_id where s.code = $1
          order by v.valid_during`,
        [sku],
      );
    // Nothing has taken effect on the preparer's own submission.
    expect(await purposes()).toEqual([{ purpose: 'merchandise' }]);
    // A different person approves it; only then does Publish make the SKU's next version.
    const decision = ok(await decide(confirmer, requestId, versionId));
    const approval = { approvalDecisionId: String(decision.decisionId) };
    const key = uuidv7();
    const published = await publish(revision, key, approval);
    expect(ok(published)).toMatchObject({ state: 'Published', result: 'published' });
    // Sent again under its key, Publish is answered once, with the same answer (PRD-INT-002).
    const again = await publish(revision, key, approval);
    expect(again.replayed).toBe(true);
    expect(again.body).toEqual(published.body);
    expect(await purposes()).toEqual([{ purpose: 'merchandise' }, { purpose: 'promotional' }]);
    // The original document, its rows and outcome stay; it names the revision that replaced it (7.3).
    const revised = (await read(revision)).documents[0];
    expect(revised).toMatchObject({ state: 'Published', revisesDocumentId: original?.documentId });
    expect(
      await rows('select replaced_by_document_id from files_imports.import_document where id = $1', [
        original?.documentId,
      ]),
    ).toEqual([{ replaced_by_document_id: revised?.documentId }]);
    expect((await read(created)).outcomes).toHaveLength(1);

    // The same revision again is a duplicate of it: no third version.
    const repeat = await start(await upload(preparer, [product(style, sku, 'promotional')]), { kind: 'update' });
    expect(ok(await step(repeat, 'validate'))).toMatchObject({ state: 'Staged' });
    expect((await read(repeat)).documents[0]?.identity).toEqual({
      kind: 'duplicate',
      publishedDocumentId: revised?.documentId,
    });
  });
});

describe('two publishes at once (imports-and-opening-data 7.2, 15.1; stage 1 README 7.2)', () => {
  it('GC-6 17 test 15 PRD-INT-005: two concurrent publishes of one document, on separate connections, give one effect', async () => {
    for (let round = 0; round < 3; round += 1) {
      const style = next('STYLE');
      const sku = next('SKU');
      const left = await start(await upload(preparer, [product(style, sku)]));
      const right = await start(await upload(preparer, [product(style, sku)]));
      await ready(left);
      await ready(right);
      const answers = await Promise.all([publish(left), publish(right)]);
      for (const answer of answers) expect(ok(answer)).toMatchObject({ state: 'Published', result: 'published' });
      const results = answers.map((answer) => (answer.body.documents as { result: string }[])[0]?.result).sort();
      expect(results).toEqual(['duplicate', 'published']);
      expect(await proposalsFor(style)).toHaveLength(1);
      expect(
        await rows(
          `select id from files_imports.import_document where reference = $1 and state = 'Published'
            and replaced_by_document_id is null`,
          [style],
        ),
      ).toHaveLength(1);
    }
  });

  it('RR-503 7.2: two Starts of one file at once, on separate connections, stage one batch', async () => {
    for (let round = 0; round < 3; round += 1) {
      const stored = await upload(preparer, [product(next('STYLE'), next('SKU'))]);
      const answers = await Promise.all([
        call(preparer, 'POST', '/api/files-imports/batches', startBody(stored)),
        call(preparer, 'POST', '/api/files-imports/batches', startBody(stored)),
      ]);
      const statuses = answers.map((answer) => answer.status).sort();
      expect(statuses).toEqual([200, 422]);
      const refused = answers.find((answer) => answer.status !== 200);
      if (refused === undefined) throw new Error('both Starts were answered');
      expect(errorOf(refused)).toMatchObject({ code: 'files-imports.file-already-imported' });
      expect(
        await rows(`select id from files_imports.import_batch where stored_file_id = $1`, [stored.storedFileId]),
      ).toHaveLength(1);
    }
  });

  it('PRD-INT-002: one batch published twice at once under different keys publishes each document once', async () => {
    const style = next('STYLE');
    const batchId = await start(await upload(preparer, [product(style, next('SKU'))]));
    await ready(batchId);
    const answers = await Promise.all([publish(batchId), publish(batchId)]);
    expect(answers.filter((answer) => answer.status === 200)).not.toHaveLength(0);
    expect(await proposalsFor(style)).toHaveLength(1);
    expect((await read(batchId)).batch.state).toBe('Published');
  });
});

describe('publishing one document per transaction (imports-and-opening-data 3.2, 3.3, 7.4)', () => {
  async function counted(codes: readonly (readonly [string, number])[]) {
    return upload(
      preparer,
      codes.map(([code, quantity]) => [code, quantity]),
      {
        header: ['Code', 'Quantity'],
        titled: false,
      },
    );
  }

  it('GC-6 17 test 16 PRD-IMP-012: one failing line fails its document, the others publish, and the failed outcome is kept', async () => {
    const [good, bad, also] = [next('GOOD'), next('REFUSE'), next('ALSO')];
    const batchId = await start(
      await counted([
        [good, 2],
        [bad, 3],
        [also, 4],
      ]),
      {},
      countedVersions,
      FAILING_TARGET,
    );
    await ready(batchId);
    const attempt = ok(await publish(batchId));
    expect(attempt).toMatchObject({ state: 'Validated', result: 'failed' });
    expect(attempt.documents).toEqual([
      expect.objectContaining({ result: 'published' }),
      expect.objectContaining({ result: 'refused', refusalCode: 'files-imports.synthetic-refusal' }),
      expect.objectContaining({ result: 'published' }),
    ]);
    const after = await read(batchId);
    expect(after.batch.state).toBe('Validated');
    expect(after.documents.map((document) => document.state)).toEqual(['Published', 'Staged', 'Published']);
    expect(after.outcomes).toHaveLength(1);
    expect(after.outcomes[0]).toMatchObject({
      result: 'failed',
      refusalCode: 'files-imports.document-refused',
      counts: { rowsRead: 4, rowsIgnored: 1, rowsAccepted: 2, rowsRejected: 1, rowsPending: 0, rowsDuplicate: 0 },
      measures: [{ field: 'quantity', kind: 'quantity', accepted: '6', rejected: '3', pending: '0', duplicate: '0' }],
    });
    // Each document published its own event, identifiers only, and the attempt its failure (13.3).
    const events = await rows<{ event_type: string; payload: Record<string, string> }>(
      `select event_type, payload from kernel.outbox_event where subject_record_id = $1 and event_type like
         'files-imports.import-%' order by id`,
      [batchId],
    );
    expect(events.map((event) => event.event_type)).toEqual([
      'files-imports.import-published',
      'files-imports.import-published',
      'files-imports.import-failed',
    ]);

    // Corrected by a person's entry, it validates, is submitted and publishes the rest (3.2); the first outcome stays.
    const badRow = after.documents[1]?.rows[0]?.stagedRowId ?? '';
    ok(
      await step(batchId, `rows/${badRow}/entries`, {
        versionId: after.batch.versionId,
        field: 'code',
        value: next('FIXED'),
        reason: syntheticName('Corrected from the evidence'),
      }),
    );
    await ready(batchId);
    expect(ok(await publish(batchId))).toMatchObject({ state: 'Published', result: 'published' });
    const done = await read(batchId);
    expect(done.outcomes.map((outcome) => outcome.result)).toEqual(['failed', 'published']);
    expect(done.outcomes[1]?.counts).toMatchObject({ rowsAccepted: 3, rowsRejected: 0 });
  });

  it('GC-6 17 test 17 PRD-IMP-013: counts close, and Submit and Publish refuse a batch whose counts do not', async () => {
    const batchId = await start(
      await counted([
        [next('ONE'), 1],
        [next('TWO'), 1],
      ]),
      {},
      countedVersions,
      FAILING_TARGET,
    );
    expect(ok(await step(batchId, 'validate'))).toMatchObject({ state: 'Validated' });
    // A row lost between reading and staging: the reader's count says one more row than was staged (SYNTHETIC tamper).
    await rows(`alter table files_imports.import_batch disable trigger guard_batch_change`);
    try {
      await rows(
        `update files_imports.import_batch set sheets = jsonb_set(sheets, '{0,rows}', to_jsonb((sheets -> 0 ->> 'rows')::int + 1))
          where id = $1`,
        [batchId],
      );
    } finally {
      await rows(`alter table files_imports.import_batch enable trigger guard_batch_change`);
    }
    expect(errorOf(await submit(batchId))).toMatchObject({
      code: 'files-imports.counts-do-not-close',
      missing: [{ kind: 'import-counts', rowsRead: '4', rowsStaged: '3' }],
    });
  });

  it('GC-6 17 test 17 PRD-IMP-013: Publish refuses a submitted batch whose counts no longer close, and writes nothing', async () => {
    const batchId = await start(
      await counted([
        [next('ONE'), 1],
        [next('TWO'), 1],
      ]),
      {},
      countedVersions,
      FAILING_TARGET,
    );
    // Submitted while its counts closed; a row is lost before Publish (SYNTHETIC tamper of the reader's count).
    await ready(batchId);
    await rows(`alter table files_imports.import_batch disable trigger guard_batch_change`);
    try {
      await rows(
        `update files_imports.import_batch set sheets = jsonb_set(sheets, '{0,rows}', to_jsonb((sheets -> 0 ->> 'rows')::int + 1))
          where id = $1`,
        [batchId],
      );
    } finally {
      await rows(`alter table files_imports.import_batch enable trigger guard_batch_change`);
    }
    expect(errorOf(await publish(batchId))).toMatchObject({
      code: 'files-imports.counts-do-not-close',
      missing: [{ kind: 'import-counts', rowsRead: '4', rowsStaged: '3' }],
    });
    const after = await read(batchId);
    expect(after.batch.state).toBe('Validated');
    expect(after.outcomes).toEqual([]);
    expect(after.documents.every((document) => document.state === 'Staged')).toBe(true);
  });

  it('code-house-rules 12.7: Publish on a stale batch version is refused, naming the current one', async () => {
    const batchId = await start(await counted([[next('STALE'), 1]]), {}, countedVersions, FAILING_TARGET);
    await ready(batchId);
    const stale = await step(batchId, 'publish', { versionId: uuidv7() });
    expect(errorOf(stale)).toMatchObject({
      kind: 'conflict',
      code: 'kernel.stale-version',
      missing: [{ kind: 'version', recordType: IMPORT_BATCH_TYPE, recordId: batchId }],
    });
    expect((await read(batchId)).outcomes).toEqual([]);
  });

  it('3.2: a Published batch is never withdrawn', async () => {
    const batchId = await start(await counted([[next('KEEP'), 1]]), {}, countedVersions, FAILING_TARGET);
    await ready(batchId);
    ok(await publish(batchId));
    const versionId = (await read(batchId)).batch.versionId;
    expect(errorOf(await step(batchId, 'withdraw', { versionId }))).toMatchObject({
      code: 'files-imports.batch-not-open',
    });
  });
});

describe('the import outcomes report (imports-and-opening-data 14)', () => {
  it('PRD-MOD-003 PRD-SEC-005: shows its as-of time, filters, and only the batches inside the reader scope', async () => {
    const inA = await start(await upload(preparer, [product(next('STYLE'), next('SKU'))]), {
      scope: { siteId: SITE, storeId: STORE_A },
    });
    const inB = await start(await upload(preparer, [product(next('STYLE'), next('SKU'))]), {
      scope: { siteId: SITE, storeId: STORE_B },
    });
    await ready(inA);
    ok(await publish(inA));

    const all = importOutcomesSchema.parse(ok(await call(preparer, 'GET', '/api/files-imports/outcomes')));
    expect(Date.parse(all.asOf)).not.toBeNaN();
    const mine = all.batches.find((batch) => batch.batchId === inA);
    expect(mine).toMatchObject({
      kind: 'create',
      target: 'merchandise',
      state: 'Published',
      storeId: STORE_A,
      startedByUserId: preparer.id,
      rowsRead: 3,
      attempts: 1,
      lastOutcome: { result: 'published', counts: { rowsRead: 3, rowsIgnored: 2, rowsAccepted: 1 } },
    });
    expect(mine?.layout.layoutVersionId).toBe(productVersions.layoutVersionId);
    expect(all.batches.map((batch) => batch.batchId)).toContain(inB);

    const byStore = importOutcomesSchema.parse(
      ok(await call(preparer, 'GET', `/api/files-imports/outcomes?storeId=${STORE_B}&state=Staged&kind=create`)),
    );
    expect(byStore.batches.map((batch) => batch.batchId)).toEqual([inB]);

    // A reader scoped to Store A sees only Store A's batches (PRD-SEC-005).
    const scoped = importOutcomesSchema.parse(ok(await call(storeReader, 'GET', '/api/files-imports/outcomes')));
    expect(scoped.batches.map((batch) => batch.storeId)).toEqual(scoped.batches.map(() => STORE_A));
    expect(scoped.batches.map((batch) => batch.batchId)).toContain(inA);
    expect(scoped.batches.map((batch) => batch.batchId)).not.toContain(inB);
  });
});
