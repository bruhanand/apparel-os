import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  errorEnvelopeSchema,
  fieldClassSchema,
  IMPORT_BATCH_TYPE,
  importBatchReadSchema,
  importFileStoredSchema,
  importLayoutListSchema,
  layoutDetectionSchema,
  mappingRuleListSchema,
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
import type { ApprovalRule } from '../src/modules/access/index.js';
import { IMPORT_HANDLERS, type ImportHandlers } from '../src/modules/files-imports/index.js';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { syntheticWorkbook } from './fixtures/imports.js';
import { syntheticCode, syntheticFileName, syntheticIdentifier, syntheticName } from './fixtures/synthetic.js';
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

// S1-F06-T03: layouts, mappings and mapping rules proposed and confirmed by a different person, detection by structure,
// where each staged value came from, values entered by a person, the validation report, submission, the masking of
// restricted columns, and scope, through the whole application on real PostgreSQL and MinIO (imports-and-opening-data
// 3.2, 5, 6.1 to 6.6, 8, 11, 13.1, 13.2, 15.1, 17 tests 11, 12, 13 and 26; structure-and-masters 7; PRD-IMP-003 to
// PRD-IMP-009, PRD-ACS-007, PRD-ACS-008, PRD-SEC-005, PRD-SEC-017, PRD-MOD-010, PRD-MOD-015; POL-02.07, POL-02.08;
// DEC-105, DEC-112 GC6-4). Every file, layout, rule, user and value is SYNTHETIC.

const ALL_CLASSES: readonly FieldClass[] = fieldClassSchema.options;
const SHEET = 'SYNTHETIC Products';
const HEADER = [
  'Style code',
  'SKU code',
  'Brand code',
  'Category code',
  'Size',
  'Stock unit',
  'Purpose',
  'Cost',
  'Bank',
];

/** The SYNTHETIC product layout of these tests: a cost column, and a bank column of an encrypted class (section 11). */
const PRODUCT_LAYOUT: LayoutStructure = {
  shape: 'layout-version/1',
  format: 'xlsx',
  sheet: SHEET,
  headerRow: 1,
  dataStartRow: 2,
  columns: [
    { name: 'Style code', required: true },
    { name: 'SKU code', required: true },
    { name: 'Brand code', required: true },
    { name: 'Category code', required: true },
    { name: 'Size', required: false },
    { name: 'Stock unit', required: true },
    { name: 'Purpose', required: true },
    { name: 'Cost', required: false, type: 'money', restrictedClass: 'cost' },
    { name: 'Bank', required: false, restrictedClass: 'bank-details' },
  ],
  documentReference: 'Style code',
};

const PRODUCT_MAPPING: MappingFields = {
  shape: 'mapping-version/1',
  fields: {
    styleCode: { column: 'Style code', transform: 'text' },
    skuCode: { column: 'SKU code', transform: 'text' },
    brandCode: { column: 'Brand code', transform: 'text', rules: true },
    categoryCode: { column: 'Category code', transform: 'text' },
    size: { column: 'Size', transform: 'text' },
    stockUnit: { column: 'Stock unit', transform: 'text' },
    purpose: { column: 'Purpose', transform: 'text' },
  },
};

const REVIEW_ACTION = syntheticIdentifier('import-review');
const REVIEWED_TARGET = syntheticIdentifier('reviewed');
/** A SYNTHETIC approval rule for a batch whose handler requires an approval in `access` (3.1 step 8; 13.2). */
const REVIEW_RULE: ApprovalRule = {
  actionType: REVIEW_ACTION,
  module: 'files-imports',
  recordType: IMPORT_BATCH_TYPE,
  independent: true,
  value: 'none',
  freeTextReason: false,
  decisionEvidenceClasses: [],
  synthetic: true,
};

let world: SyntheticWorld;
let minio: TestFileStore;
let api: AccessTestApp;
let clock: SyntheticClock;
let keys: Record<string, string>;
let setup: StructureSetup;
let approveReason: string;
let rejectReason: string;
let database: string;
let brandCode: string;
let otherBrandCode: string;
let otherBrandId: string;
let categoryCode: string;
let counter = 0;
const next = (label: string) => syntheticCode(`${label}-${String(++counter)}`);
const cookies = new Map<string, string>();

let preparer: SyntheticUser;
let confirmer: SyntheticUser;
let noClassReader: SyntheticUser;
let costReader: SyntheticUser;
let storeReader: SyntheticUser;

const STORE_A = '01900000-0000-7000-8000-0000000fa001';
const STORE_B = '01900000-0000-7000-8000-0000000fa002';
const SITE = '01900000-0000-7000-8000-0000000fa101';

interface Answer {
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
  options: Parameters<typeof grantSynthetic>[3] = {},
): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(database, world.organisations[0].code, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
  });
  await grantSynthetic(database, { kind: 'user', id: user.id }, authorities, options);
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.61' },
    body: JSON.stringify({
      organisationCode: world.organisations[0].code,
      login: user.login,
      password: user.password,
      totpCode: freshCode(user),
    }),
  });
  expect(response.status).toBe(200);
  cookies.set(user.id, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
  return user;
}

async function call(user: SyntheticUser, method: 'GET' | 'POST', path: string, body?: unknown): Promise<Answer> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method,
    headers: {
      cookie: cookies.get(user.id) ?? '',
      origin: SYNTHETIC_ORIGIN,
      ...(method === 'POST' ? { 'content-type': 'application/json', 'idempotency-key': uuidv7() } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const errorOf = (answer: Answer) => errorEnvelopeSchema.parse(answer.body).error;

function ok(answer: Answer): Record<string, unknown> {
  if (answer.status !== 200) throw new Error(`Refused ${String(answer.status)}: ${JSON.stringify(answer.body)}`);
  return answer.body;
}

const decide = (by: SyntheticUser, requestId: string, versionId: string, outcome: 'approve' | 'reject' = 'approve') =>
  call(by, 'POST', `/api/access/approval-requests/${requestId}/decision`, {
    versionId,
    outcome,
    reason: { kind: 'listed', reasonId: outcome === 'approve' ? approveReason : rejectReason },
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

/** A product row: style, SKU, the brand and category recorded here, no size, a stock unit and purpose. */
function product(style: string, sku: string, overrides: Partial<Record<string, string | number | null>> = {}) {
  const row: Record<string, string | number | null> = {
    'Style code': style,
    'SKU code': sku,
    'Brand code': brandCode,
    'Category code': categoryCode,
    Size: null,
    'Stock unit': 'piece',
    Purpose: 'merchandise',
    Cost: null,
    Bank: null,
    ...overrides,
  };
  return HEADER.map((name) => row[name] ?? null);
}

async function upload(
  user: SyntheticUser,
  rowsOfFile: (string | number | null)[][],
  options: { hidden?: number[] } = {},
) {
  const marker = next('FILE');
  const bytes = await syntheticWorkbook({
    sheet: SHEET,
    header: HEADER,
    rows: rowsOfFile,
    marker,
    ...(options.hidden === undefined ? {} : { hiddenRows: options.hidden }),
  });
  const stored = importFileStoredSchema.parse(
    ok(
      await call(user, 'POST', '/api/files-imports/import-files', {
        sourceSystem: 'manual-upload',
        originalName: syntheticFileName(marker.toLowerCase(), 'xlsx'),
        contentBase64: bytes.toString('base64'),
      }),
    ),
  );
  return stored;
}

interface Versions {
  readonly layoutId: string;
  readonly layoutVersionId: string;
  readonly layoutRequestId: string;
  readonly mappingId: string;
  readonly mappingVersionId: string;
  readonly mappingRequestId: string;
}

async function proposeLayoutAndMapping(
  structure: LayoutStructure,
  fields: MappingFields,
  target = 'merchandise',
): Promise<Versions> {
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
  return {
    layoutId: String(layout.layoutId),
    layoutVersionId: String(layout.layoutVersionId),
    layoutRequestId: String(layout.requestId),
    mappingId: String(mapping.mappingId),
    mappingVersionId: String(mapping.mappingVersionId),
    mappingRequestId: String(mapping.requestId),
  };
}

async function confirm(versions: Versions): Promise<void> {
  ok(await decide(confirmer, versions.layoutRequestId, versions.layoutVersionId));
  ok(await decide(confirmer, versions.mappingRequestId, versions.mappingVersionId));
}

async function start(
  stored: { storedFileId: string; receiptId: string },
  versions: Pick<Versions, 'layoutVersionId' | 'mappingVersionId'>,
  extra: Record<string, unknown> = {},
  target = 'merchandise',
): Promise<string> {
  const started = ok(
    await call(preparer, 'POST', '/api/files-imports/batches', {
      storedFileId: stored.storedFileId,
      fileReceiptId: stored.receiptId,
      kind: 'create',
      target,
      layoutVersionId: versions.layoutVersionId,
      mappingVersionId: versions.mappingVersionId,
      ...extra,
    }),
  );
  return String(started.batchId);
}

async function read(batchId: string, by: SyntheticUser = preparer): Promise<ImportBatchRead> {
  return importBatchReadSchema.parse(ok(await call(by, 'GET', `/api/files-imports/batches/${batchId}`)));
}

const step = (batchId: string, name: string, body: unknown = {}) =>
  call(preparer, 'POST', `/api/files-imports/batches/${batchId}/${name}`, body);

/** A batch step with the batch version the screen read (code-house-rules 12.7). */
async function versioned(batchId: string, name: string, body: Record<string, unknown> = {}, by = preparer) {
  const versionId = (await read(batchId, by)).batch.versionId;
  return call(by, 'POST', `/api/files-imports/batches/${batchId}/${name}`, { versionId, ...body });
}

/**
 * Withdraw a batch, so its file may start a new batch for the same target and layout (7.2; S1-F06-T04): the earlier
 * batch is kept, Failed.
 */
async function withdraw(batchId: string): Promise<void> {
  ok(await step(batchId, 'withdraw', { versionId: (await read(batchId)).batch.versionId }));
}

/** Publish, with the batch version the screen read (code-house-rules 12.7; S1-F06-T04). */
async function publish(batchId: string): Promise<Answer> {
  return step(batchId, 'publish', { versionId: (await read(batchId)).batch.versionId });
}

const IMPORTER: SyntheticAuthority[] = [
  { recordType: 'files_imports.stored_file', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.import_batch', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'edit' },
  { recordType: 'files_imports.layout', action: 'view' },
  { recordType: 'files_imports.layout', action: 'create' },
  { recordType: 'files_imports.mapping', action: 'view' },
  { recordType: 'files_imports.mapping', action: 'create' },
  { recordType: 'files_imports.mapping_rule', action: 'view' },
  { recordType: 'files_imports.mapping_rule', action: 'create' },
  // The proposer may hold approve too: their own confirmation is still refused (POL-02.07).
  { recordType: 'files_imports.layout', action: 'approve' },
  { recordType: 'files_imports.mapping_rule', action: 'approve' },
  { recordType: 'merchandise.product_proposal', action: 'view' },
  { recordType: 'merchandise.product_proposal', action: 'create' },
  { recordType: 'organisation.store', action: 'view' },
  { recordType: 'organisation.store', action: 'create' },
];

const CONFIRMER: SyntheticAuthority[] = [
  { recordType: 'files_imports.layout', action: 'view' },
  { recordType: 'files_imports.layout', action: 'approve' },
  { recordType: 'files_imports.mapping', action: 'view' },
  { recordType: 'files_imports.mapping', action: 'approve' },
  { recordType: 'files_imports.mapping_rule', action: 'view' },
  { recordType: 'files_imports.mapping_rule', action: 'approve' },
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.import_batch', action: 'approve' },
];

beforeAll(async () => {
  world = await createSyntheticOrganisations('importsreview');
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
  rejectReason = await writeSyntheticReason(database, 'reject');
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, {
    clock,
    fileStoreEnvironment: minio.environment,
    extraApprovalRules: [REVIEW_RULE],
  });
  // A SYNTHETIC handler whose batches are reviewed by an approval in `access` (13.2), registered as a module would.
  api.app.get<ImportHandlers>(IMPORT_HANDLERS).register({
    target: REVIEWED_TARGET,
    recordType: IMPORT_BATCH_TYPE,
    kinds: ['create'],
    effects: 'master-records',
    fields: [{ name: 'code', required: true }],
    measures: [],
    sourceScope: () => REVIEWED_TARGET,
    revisions: 'none',
    publishNeeds: () => Promise.resolve({ action: 'view', recordType: IMPORT_BATCH_TYPE }),
    lockTargets: () => Promise.resolve([]),
    review: () => ({ kind: 'approval', actionType: REVIEW_ACTION }),
    suggestions: () => Promise.resolve([]),
    checkRuleTarget: () => Promise.resolve(undefined),
    preview: (_context, document) =>
      Promise.resolve({
        kind: 'would-create',
        records: [{ recordType: IMPORT_BATCH_TYPE, codes: [document.reference] }],
      }),
    publish: () => Promise.resolve({ kind: 'published', records: [] }),
  });
  setup = await structureSetup({
    directory: world.directory,
    database,
    organisationCode: world.organisations[0].code,
    keysEnvironment: keys,
    label: 'IMPORTSREVIEW',
  });
  brandCode = next('BRAND');
  otherBrandCode = next('BRAND');
  categoryCode = next('CAT');
  const recorded = (outcome: { kind: string; answer?: CatalogueChanged }) => {
    if (outcome.kind !== 'success' || outcome.answer === undefined) throw new Error('The catalogue was refused');
    return outcome.answer;
  };
  for (const code of [brandCode, otherBrandCode]) {
    recorded(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareBrand(c, p, {
          code,
          name: syntheticName(`Brand ${code}`),
          aliases: [],
          validFrom: setup.today(),
        }),
      ),
    );
  }
  const [other] = await rows<{ id: string }>('select id from merchandise.brand where code = $1', [otherBrandCode]);
  otherBrandId = other?.id ?? '';
  recorded(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareCategory(c, p, {
        code: categoryCode,
        name: syntheticName('Review Category'),
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
  confirmer = await enrolled('CONFIRMER', CONFIRMER, {
    fieldClasses: ALL_CLASSES.map((fieldClass) => ({ fieldClass, access: 'view' as const })),
  });
  noClassReader = await enrolled('NOCLASS', [{ recordType: 'files_imports.import_batch', action: 'view' }]);
  costReader = await enrolled('COST', [{ recordType: 'files_imports.import_batch', action: 'view' }], {
    fieldClasses: [{ fieldClass: 'cost', access: 'view' }],
  });
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
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (setup as StructureSetup | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('layouts and mappings proposed, detected and confirmed (imports-and-opening-data 6.1, 6.2, 6.4, 6.5)', () => {
  it('GC-6 17 test 12 PRD-IMP-004 POL-02.07: one compatible version is proposed; Publish waits for confirmation by a different person', async () => {
    const stored = await upload(preparer, [product(next('STYLE'), next('SKU'))]);
    const versions = await proposeLayoutAndMapping(PRODUCT_LAYOUT, PRODUCT_MAPPING);

    // Detection: the one compatible version is proposed; a version this file does not match is never selected.
    const other = ok(
      await call(preparer, 'POST', '/api/files-imports/layout-versions', {
        layout: { code: next('OTHER'), source: syntheticName('Other file'), documentType: 'master', kinds: ['create'] },
        structure: { ...PRODUCT_LAYOUT, columns: [...PRODUCT_LAYOUT.columns, { name: 'Colour', required: true }] },
      }),
    );
    const detected = layoutDetectionSchema.parse(
      ok(
        await call(
          preparer,
          'GET',
          `/api/files-imports/import-files/${stored.storedFileId}/layouts?fileReceiptId=${stored.receiptId}`,
        ),
      ),
    );
    expect(detected.compatible.map((each) => each.layoutVersionId)).toContain(versions.layoutVersionId);
    expect(detected.incompatible).toContainEqual(
      expect.objectContaining({
        layoutVersionId: other.layoutVersionId,
        missing: [{ kind: 'layout-column', column: 'Colour' }],
      }),
    );
    // A hint naming the other layout never selects it: it is not compatible (17 test 3's rule, on synthetic files).
    const hinted = layoutDetectionSchema.parse(
      ok(
        await call(
          preparer,
          'GET',
          `/api/files-imports/import-files/${stored.storedFileId}/layouts?fileReceiptId=${stored.receiptId}&hint=${encodeURIComponent(String(other.layoutVersionId))}`,
        ),
      ),
    );
    expect(hinted.compatible.map((each) => each.layoutVersionId)).not.toContain(other.layoutVersionId);

    // The proposer's own confirmation is refused, though they hold approve (PRD-IMP-008, POL-02.07).
    const own = await decide(preparer, versions.layoutRequestId, versions.layoutVersionId);
    expect(errorOf(own)).toMatchObject({ code: 'access.self-preparation' });
    // The table refuses it behind access (15.1; GC6-4, DEC-112).
    await expect(
      rows(
        `update files_imports.layout_version set state = 'Confirmed', decided_by_user_id = proposed_by_user_id,
           decided_at = now() where id = $1`,
        [versions.layoutVersionId],
      ),
    ).rejects.toThrow(/layout_version_independent/);
    // A mapping version confirmed by its proposer is refused the same way, by access and by its table (6.4).
    const ownMapping = await decide(preparer, versions.mappingRequestId, versions.mappingVersionId);
    expect(errorOf(ownMapping)).toMatchObject({ code: 'access.self-preparation' });
    await expect(
      rows(
        `update files_imports.mapping_version set state = 'Confirmed', decided_by_user_id = proposed_by_user_id,
           decided_at = now() where id = $1`,
        [versions.mappingVersionId],
      ),
    ).rejects.toThrow(/mapping_version_independent/);

    // A Proposed version stages and previews a batch, never publishes it (6.4).
    const batchId = await start(stored, versions);
    expect((await read(batchId)).batch).toMatchObject({ layoutState: 'Proposed', mappingState: 'Proposed' });
    expect(ok(await step(batchId, 'validate'))).toMatchObject({ state: 'Validated' });
    expect(ok(await versioned(batchId, 'submit'))).toMatchObject({ state: 'Validated' });
    const early = await publish(batchId);
    expect(errorOf(early)).toMatchObject({
      kind: 'refused',
      code: 'files-imports.version-not-confirmed',
      missing: [
        { kind: 'layout-version', layoutVersionId: versions.layoutVersionId, state: 'Proposed' },
        { kind: 'mapping-version', mappingVersionId: versions.mappingVersionId, state: 'Proposed' },
      ],
    });

    // A different person confirms both; confirming emits files-imports.mapping-confirmed (13.3).
    await confirm(versions);
    const events = await rows<{ subject_record_id: string }>(
      `select subject_record_id from kernel.outbox_event where event_type = 'files-imports.mapping-confirmed'
         and subject_version_id = any($1::uuid[])`,
      [[versions.layoutVersionId, versions.mappingVersionId]],
    );
    expect(events.map((each) => each.subject_record_id).sort()).toEqual([versions.layoutId, versions.mappingId].sort());
    const listed = importLayoutListSchema.parse(ok(await call(preparer, 'GET', '/api/files-imports/layouts')));
    expect(listed.layouts.find((each) => each.layoutVersionId === versions.layoutVersionId)).toMatchObject({
      state: 'Confirmed',
      proposedByUserId: preparer.id,
      decidedByUserId: confirmer.id,
      mappings: [{ mappingVersionId: versions.mappingVersionId, state: 'Confirmed', decidedByUserId: confirmer.id }],
    });
    expect(ok(await publish(batchId))).toMatchObject({ state: 'Published' });
  });

  it('GC-6 17 test 13 PRD-MOD-010: a batch keeps its layout and mapping versions; a new version leaves it as it was', async () => {
    const versions = await proposeLayoutAndMapping(PRODUCT_LAYOUT, PRODUCT_MAPPING);
    await confirm(versions);
    const stored = await upload(preparer, [product(next('STYLE'), next('SKU'), { Size: 'SYN-M' })]);
    const before = await start(stored, versions);
    const kept = await read(before);
    // The next mapping version leaves the size unmapped.
    const withoutSize = Object.fromEntries(
      Object.entries(PRODUCT_MAPPING.fields).filter(([field]) => field !== 'size'),
    );
    const second = ok(
      await call(preparer, 'POST', '/api/files-imports/mapping-versions', {
        mapping: { mappingId: versions.mappingId },
        fields: { shape: 'mapping-version/1', fields: withoutSize },
      }),
    );
    expect(second).toMatchObject({ version: 2 });
    ok(await decide(confirmer, String(second.requestId), String(second.mappingVersionId)));
    const after = await read(before);
    expect(after.batch.mappingVersionId).toBe(versions.mappingVersionId);
    expect(after.documents).toEqual(kept.documents);
    expect(after.documents[0]?.rows[0]?.values.size).toMatchObject({ kind: 'supplied', value: 'SYN-M' });
    // The same file starts a new batch for the same target and layout only once every earlier one Failed (7.2).
    const again = await call(preparer, 'POST', '/api/files-imports/batches', {
      storedFileId: stored.storedFileId,
      fileReceiptId: stored.receiptId,
      kind: 'create',
      target: 'merchandise',
      layoutVersionId: versions.layoutVersionId,
      mappingVersionId: String(second.mappingVersionId),
    });
    expect(errorOf(again)).toMatchObject({
      code: 'files-imports.file-already-imported',
      missing: [expect.objectContaining({ kind: 'import-batch', batchId: before, state: 'Staged' })],
    });
    ok(await step(before, 'withdraw', { versionId: kept.batch.versionId }));
    const later = await read(await start(stored, { ...versions, mappingVersionId: String(second.mappingVersionId) }));
    expect(later.documents[0]?.rows[0]?.values.size).toBeUndefined();
  });

  it('PRD-IMP-004 refuses to start a batch with a file its layout version does not match, or with a Rejected version', async () => {
    const versions = await proposeLayoutAndMapping(PRODUCT_LAYOUT, PRODUCT_MAPPING);
    const marker = next('ODD');
    const bytes = await syntheticWorkbook({
      sheet: SHEET,
      header: ['Style code', 'Colour'],
      rows: [['S', 'C']],
      marker,
    });
    const stored = importFileStoredSchema.parse(
      ok(
        await call(preparer, 'POST', '/api/files-imports/import-files', {
          sourceSystem: 'manual-upload',
          originalName: syntheticFileName(marker.toLowerCase(), 'xlsx'),
          contentBase64: bytes.toString('base64'),
        }),
      ),
    );
    const refused = await call(preparer, 'POST', '/api/files-imports/batches', {
      storedFileId: stored.storedFileId,
      fileReceiptId: stored.receiptId,
      kind: 'create',
      target: 'merchandise',
      layoutVersionId: versions.layoutVersionId,
      mappingVersionId: versions.mappingVersionId,
    });
    expect(errorOf(refused)).toMatchObject({ code: 'files-imports.layout-not-matched' });
    expect(errorOf(refused).missing).toContainEqual({ kind: 'layout-unknown-column', column: 'Colour' });
    ok(await decide(confirmer, versions.layoutRequestId, versions.layoutVersionId, 'reject'));
    const good = await upload(preparer, [product(next('STYLE'), next('SKU'))]);
    const rejected = await call(preparer, 'POST', '/api/files-imports/batches', {
      storedFileId: good.storedFileId,
      fileReceiptId: good.receiptId,
      kind: 'create',
      target: 'merchandise',
      layoutVersionId: versions.layoutVersionId,
      mappingVersionId: versions.mappingVersionId,
    });
    expect(errorOf(rejected)).toMatchObject({ code: 'files-imports.layout-version-rejected' });
  });

  it('section 11: a mapping never fills a field from a column of an encrypted class', async () => {
    const layout = ok(
      await call(preparer, 'POST', '/api/files-imports/layout-versions', {
        layout: {
          code: next('LAYOUT'),
          source: syntheticName('Product file'),
          documentType: 'master',
          kinds: ['create'],
        },
        structure: PRODUCT_LAYOUT,
      }),
    );
    const refused = await call(preparer, 'POST', '/api/files-imports/mapping-versions', {
      mapping: { code: next('MAPPING'), layoutVersionId: layout.layoutVersionId, target: 'merchandise' },
      fields: {
        shape: 'mapping-version/1',
        fields: { ...PRODUCT_MAPPING.fields, size: { column: 'Bank', transform: 'text' } },
      },
    });
    expect(errorOf(refused)).toMatchObject({
      code: 'files-imports.mapping-encrypted-column',
      missing: [{ kind: 'layout-column', column: 'Bank', fieldClass: 'bank-details' }],
    });
  });
});

describe('mapping rules (imports-and-opening-data 6.3, 6.4; PRD-IMP-003, PRD-IMP-008)', () => {
  it('GC-6 17 test 12: a rule its proposer confirms is refused, an unconfirmed one changes nothing, conflicting ones are refused, and a confirmed one maps the word', async () => {
    const versions = await proposeLayoutAndMapping(PRODUCT_LAYOUT, PRODUCT_MAPPING);
    await confirm(versions);
    const word = `${brandCode.toLowerCase()} word`;
    // The handler that owns the target checks it (13.2).
    const wrong = await call(preparer, 'POST', '/api/files-imports/mapping-rules', {
      attribute: 'merchandise.brandCode',
      scope: { kind: 'organisation' },
      word,
      caseSensitive: false,
      target: next('NO-SUCH-BRAND'),
      validFrom: setup.today(),
    });
    expect(errorOf(wrong)).toMatchObject({ code: 'files-imports.rule-target-refused' });
    const proposed = ok(
      await call(preparer, 'POST', '/api/files-imports/mapping-rules', {
        attribute: 'merchandise.brandCode',
        scope: { kind: 'organisation' },
        word,
        caseSensitive: false,
        target: brandCode,
        validFrom: setup.today(),
      }),
    );
    const own = await decide(preparer, String(proposed.requestId), String(proposed.ruleVersionId));
    expect(errorOf(own)).toMatchObject({ code: 'access.self-preparation' });

    // Unconfirmed: the word stays as its source word, and the handler finds no such brand (PRD-IMP-008).
    const file = await upload(preparer, [product(next('STYLE'), next('SKU'), { 'Brand code': word })]);
    const unconfirmed = await start(file, versions);
    expect((await read(unconfirmed)).documents[0]?.rows[0]?.values.brandCode).toMatchObject({
      kind: 'supplied',
      value: word,
    });
    expect(ok(await step(unconfirmed, 'validate'))).toMatchObject({ state: 'Staged' });
    const report = (await read(unconfirmed)).report;
    expect(report?.issues).toContainEqual(
      expect.objectContaining({
        class: 'handler',
        severity: 'Blocking',
        code: 'merchandise.record-not-found',
        field: 'brandCode',
        rowNumber: 2,
        original: { kind: 'value', text: word },
      }),
    );

    // Confirmed by a different person: a new batch maps the word, keeping it beside the value.
    ok(await decide(confirmer, String(proposed.requestId), String(proposed.ruleVersionId)));
    await withdraw(unconfirmed);
    const mapped = await start(file, versions);
    const value = (await read(mapped)).documents[0]?.rows[0]?.values.brandCode;
    expect(value).toMatchObject({
      kind: 'mapped',
      value: brandCode,
      word,
      rule: { ruleId: proposed.ruleId, ruleVersionId: proposed.ruleVersionId },
    });
    expect(ok(await step(mapped, 'validate'))).toMatchObject({ state: 'Validated' });
    // The batch staged before keeps the source word: a rule changes no batch already staged.
    expect((await read(unconfirmed)).documents[0]?.rows[0]?.values.brandCode).toMatchObject({ kind: 'supplied' });

    // A second version of the same rule with another target on overlapping dates is refused when confirmed (15.1).
    const conflicting = ok(
      await call(preparer, 'POST', '/api/files-imports/mapping-rules', {
        attribute: 'merchandise.brandCode',
        scope: { kind: 'organisation' },
        word: word.toUpperCase(),
        caseSensitive: false,
        target: otherBrandCode,
        validFrom: setup.today(),
      }),
    );
    expect(conflicting.ruleId).toBe(proposed.ruleId);
    const refused = await decide(confirmer, String(conflicting.requestId), String(conflicting.ruleVersionId));
    expect(errorOf(refused)).toMatchObject({
      code: 'files-imports.rule-conflict',
      missing: [{ kind: 'mapping-rule-version', ruleVersionId: proposed.ruleVersionId }],
    });
    const list = mappingRuleListSchema.parse(ok(await call(confirmer, 'GET', '/api/files-imports/mapping-rules')));
    expect(list.rules.find((each) => each.ruleId === proposed.ruleId)?.versions).toEqual([
      expect.objectContaining({ ruleVersionId: proposed.ruleVersionId, state: 'Confirmed', inForce: true }),
      expect.objectContaining({ ruleVersionId: conflicting.ruleVersionId, state: 'Proposed', inForce: false }),
    ]);
  });

  it('PRD-IMP-008: wider rules that disagree leave the word Unknown naming them; a layout-scope rule wins', async () => {
    const versions = await proposeLayoutAndMapping(PRODUCT_LAYOUT, PRODUCT_MAPPING);
    await confirm(versions);
    const word = `${next('WORD').toLowerCase()} brand`;
    const propose = async (scope: Record<string, unknown>, target: string) => {
      const answer = ok(
        await call(preparer, 'POST', '/api/files-imports/mapping-rules', {
          attribute: 'merchandise.brandCode',
          scope,
          word,
          caseSensitive: false,
          target,
          validFrom: setup.today(),
        }),
      );
      ok(await decide(confirmer, String(answer.requestId), String(answer.ruleVersionId)));
      return String(answer.ruleId);
    };
    const organisationRule = await propose({ kind: 'organisation' }, brandCode);
    const brandRule = await propose({ kind: 'brand', id: otherBrandId }, otherBrandCode);
    const file = await upload(preparer, [product(next('STYLE'), next('SKU'), { 'Brand code': word })]);
    const ambiguous = await start(file, versions, { source: { brandId: otherBrandId } });
    expect((await read(ambiguous)).documents[0]?.rows[0]?.values.brandCode).toMatchObject({
      kind: 'unknown',
      because: 'ambiguous-rules',
      rules: [organisationRule, brandRule].sort(),
    });
    expect(ok(await step(ambiguous, 'validate'))).toMatchObject({ state: 'Staged' });
    const issues = (await read(ambiguous)).report?.issues ?? [];
    expect(issues).toContainEqual(
      expect.objectContaining({
        class: 'rule',
        severity: 'Warning',
        code: 'files-imports.rules-disagree',
        missing: [organisationRule, brandRule].sort().map((ruleId) => ({ kind: 'mapping-rule', ruleId })),
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ class: 'required', severity: 'Blocking', field: 'brandCode' }),
    );
    await propose({ kind: 'layout', id: versions.layoutId }, brandCode);
    await withdraw(ambiguous);
    const layoutWins = await start(file, versions, { source: { brandId: otherBrandId } });
    expect((await read(layoutWins)).documents[0]?.rows[0]?.values.brandCode).toMatchObject({
      kind: 'mapped',
      value: brandCode,
    });
  });
});

describe('origins, entries and the validation report (imports-and-opening-data 5, 8; PRD-IMP-005 to PRD-IMP-007, PRD-IMP-009)', () => {
  it('GC-6 17 test 11: every value has an origin; a calculated value never replaces a supplied one; AI suggestions are unavailable', async () => {
    const structure: LayoutStructure = {
      ...PRODUCT_LAYOUT,
      columns: [
        ...PRODUCT_LAYOUT.columns.filter((column) => column.name !== 'SKU code'),
        { name: 'SKU prefix', required: true },
        { name: 'SKU number', required: true, type: 'number' },
        { name: 'Check prefix', required: false },
        { name: 'Check number', required: false, type: 'number' },
      ],
    };
    const fields: MappingFields = {
      shape: 'mapping-version/1',
      fields: {
        ...PRODUCT_MAPPING.fields,
        skuCode: { calculation: { name: 'join', columns: ['SKU prefix', 'SKU number'], separator: '-' } },
        styleCode: {
          column: 'Style code',
          transform: 'text',
          alsoCalculated: { name: 'join', columns: ['Check prefix', 'Check number'] },
        },
      },
    };
    const versions = await proposeLayoutAndMapping(structure, fields);
    const header = [
      ...HEADER.filter((name) => name !== 'SKU code'),
      'SKU prefix',
      'SKU number',
      'Check prefix',
      'Check number',
    ];
    const style = next('STYLE');
    const marker = next('ORIGINS');
    const bytes = await syntheticWorkbook({
      sheet: SHEET,
      header,
      rows: [
        [style, brandCode, categoryCode, null, null, 'merchandise', 12.5, 'SYN-ACCOUNT-1', 'SYNSKU', 7, 'SYN-X', 9],
      ],
      marker,
    });
    const stored = importFileStoredSchema.parse(
      ok(
        await call(preparer, 'POST', '/api/files-imports/import-files', {
          sourceSystem: 'manual-upload',
          originalName: syntheticFileName(marker.toLowerCase(), 'xlsx'),
          contentBase64: bytes.toString('base64'),
        }),
      ),
    );
    const batchId = await start(stored, versions);
    const row = (await read(batchId)).documents[0]?.rows[0];
    expect(row?.values.skuCode).toMatchObject({
      kind: 'calculated',
      value: 'SYNSKU-7',
      calculation: { name: 'join', version: 1, inputs: [{ column: 'I' }, { column: 'J' }] },
    });
    // The supplied style stays; the calculation is kept beside it, and they disagree (section 5).
    expect(row?.values.styleCode).toMatchObject({
      kind: 'supplied',
      value: style,
      origin: { ref: 'A2', cellType: 'text' },
      calculated: {
        value: 'SYN-X9',
        calculation: { name: 'join', version: 1, inputs: [{ column: 'K' }, { column: 'L' }] },
      },
    });
    // The bank column, of an encrypted class, is left out of staging (section 11).
    expect(row?.cells.map((cell) => cell.text)).not.toContain('SYN-ACCOUNT-1');
    // The stock unit is empty: Unknown, never a default (PRD-MOD-015).
    expect(row?.values.stockUnit).toEqual({ kind: 'unknown' });

    expect(ok(await step(batchId, 'validate'))).toMatchObject({ state: 'Staged' });
    const report = (await read(batchId)).report;
    expect(report?.issues).toContainEqual(
      expect.objectContaining({ class: 'required', severity: 'Blocking', field: 'stockUnit', rowNumber: 2 }),
    );

    // AI suggestions are unavailable while the AI gateway's capability is off (DEC-105, PRD-SEC-017).
    const stagedRowId = row?.stagedRowId ?? '';
    const ai = await versioned(batchId, `rows/${stagedRowId}/entries`, {
      field: 'stockUnit',
      value: 'piece',
      reason: 'SYNTHETIC from an AI draft',
      suggestion: { kind: 'ai' },
    });
    expect(ai.status).toBe(403);
    expect(errorOf(ai)).toMatchObject({
      kind: 'unavailable',
      code: 'files-imports.ai-suggestions-unavailable',
      missing: [{ kind: 'capability', capability: 'ai-gateway.drafts' }],
    });

    // The suggestions a person may accept come from the handler's own records (section 5).
    const suggestions = ok(
      await call(
        preparer,
        'GET',
        `/api/files-imports/batches/${batchId}/rows/${stagedRowId}/suggestions?field=stockUnit`,
      ),
    );
    expect(suggestions.suggestions).toEqual([]);

    // Entered by a person, with who, when, the reason; the value staged from the file stays.
    // An entry made on a stale screen is refused, naming the current version (code-house-rules 12.7).
    const stale = await step(batchId, `rows/${stagedRowId}/entries`, {
      versionId: uuidv7(),
      field: 'stockUnit',
      value: 'piece',
      reason: 'SYNTHETIC from a stale screen',
    });
    expect(errorOf(stale)).toMatchObject({
      kind: 'conflict',
      code: 'kernel.stale-version',
      missing: [{ kind: 'version', recordType: IMPORT_BATCH_TYPE, recordId: batchId }],
    });
    const entered = ok(
      await versioned(batchId, `rows/${stagedRowId}/entries`, {
        field: 'stockUnit',
        value: 'piece',
        reason: 'SYNTHETIC checked against the packing note',
        suggestion: { kind: 'exact', value: 'piece' },
      }),
    );
    expect(entered).toMatchObject({ state: 'Staged' });
    const after = (await read(batchId)).documents[0]?.rows[0]?.values.stockUnit;
    expect(after).toMatchObject({
      kind: 'entered',
      value: 'piece',
      entry: {
        entryId: entered.entryId,
        enteredByUserId: preparer.id,
        reason: 'SYNTHETIC checked against the packing note',
        suggestion: { kind: 'exact', value: 'piece' },
      },
      staged: { kind: 'unknown' },
    });
    expect(ok(await step(batchId, 'validate'))).toMatchObject({ state: 'Validated' });
    const validated = await read(batchId);
    expect(validated.report?.issues).toContainEqual(
      expect.objectContaining({
        class: 'calculation',
        severity: 'Warning',
        code: 'files-imports.calculated-differs',
        field: 'styleCode',
        original: { kind: 'value', text: style },
      }),
    );
  });

  it('PRD-IMP-005 PRD-IMP-007: Warnings are marked seen, one class at a time; Submit refuses while any is not', async () => {
    const versions = await proposeLayoutAndMapping(PRODUCT_LAYOUT, PRODUCT_MAPPING);
    await confirm(versions);
    // Row 3 is hidden (A-7), and its cost has more decimals than paise (C-2).
    const stored = await upload(
      preparer,
      [product(next('STYLE'), next('SKU'), { Cost: 10.5 }), product(next('STYLE'), next('SKU'), { Cost: 1.005 })],
      { hidden: [3] },
    );
    const batchId = await start(stored, versions);
    expect(ok(await step(batchId, 'validate'))).toMatchObject({ state: 'Validated' });
    const report = (await read(batchId)).report;
    expect(report?.issues.map((issue) => [issue.class, issue.severity, issue.rowNumber])).toEqual([
      ['A-7', 'Warning', 3],
    ]);
    expect(report?.counts).toEqual({ blocking: 0, warnings: 1, warningsNotSeen: 1, notes: 0 });
    expect(errorOf(await versioned(batchId, 'submit'))).toMatchObject({
      code: 'files-imports.warnings-not-seen',
      missing: [{ kind: 'issues', warningsNotSeen: '1' }],
    });
    // Marked on a stale screen: refused (code-house-rules 12.7).
    expect(errorOf(await step(batchId, 'issues/seen', { versionId: uuidv7(), class: 'A-7' }))).toMatchObject({
      code: 'kernel.stale-version',
    });
    // Marked by another person with edit, it is not seen by the one who submits (8.2; product owner, 11 Oct 2026).
    const editor = await enrolled('EDITOR', IMPORTER);
    expect(ok(await versioned(batchId, 'issues/seen', { class: 'A-7' }, editor))).toMatchObject({ marked: 1 });
    expect((await read(batchId)).report?.issues[0]?.seen).toMatchObject({ byUserId: editor.id });
    expect(errorOf(await versioned(batchId, 'submit'))).toMatchObject({
      code: 'files-imports.warnings-not-seen',
      missing: [{ kind: 'issues', warningsNotSeen: '1' }],
    });
    // The submitter marks it, which replaces the other mark, and then submits.
    expect(ok(await versioned(batchId, 'issues/seen', { class: 'A-7' }))).toMatchObject({ marked: 1 });
    const seen = (await read(batchId)).report;
    expect(seen?.issues[0]?.seen).toMatchObject({ byUserId: preparer.id });
    expect(ok(await versioned(batchId, 'submit'))).toMatchObject({
      submittedVersionId: (await read(batchId)).batch.versionId,
    });
    // A submitted version is reviewed: nothing more is marked on it.
    expect(errorOf(await versioned(batchId, 'issues/seen', { class: 'A-7' }, editor))).toMatchObject({
      code: 'files-imports.already-submitted',
    });
    expect(ok(await publish(batchId))).toMatchObject({ state: 'Published' });
  });

  it('PRD-IMP-007 C-2: a money value with more decimals than paise is flagged and stays Unknown', async () => {
    const fields: MappingFields = {
      shape: 'mapping-version/1',
      fields: { ...PRODUCT_MAPPING.fields, size: { column: 'Cost', transform: 'paise' } },
    };
    const versions = await proposeLayoutAndMapping(PRODUCT_LAYOUT, fields);
    const stored = await upload(preparer, [product(next('STYLE'), next('SKU'), { Cost: 1.005 })]);
    const batchId = await start(stored, versions);
    expect((await read(batchId)).documents[0]?.rows[0]?.values.size).toMatchObject({
      kind: 'unknown',
      because: 'finer-than-paise',
    });
    ok(await step(batchId, 'validate'));
    expect((await read(batchId)).report?.issues).toContainEqual(
      expect.objectContaining({
        class: 'C-2',
        severity: 'Warning',
        code: 'files-imports.finer-than-paise',
        column: 'H',
      }),
    );
  });
});

describe('a change to a Validated batch (imports-and-opening-data 3.2; PRD-ACS-007)', () => {
  it('returns it to Staged as a new version, and supersedes the open approval request on the old one', async () => {
    const structure: LayoutStructure = {
      shape: 'layout-version/1',
      format: 'xlsx',
      sheet: SHEET,
      headerRow: 1,
      dataStartRow: 2,
      columns: [
        { name: 'Code', required: true },
        { name: 'Note', required: false },
      ],
      documentReference: 'Code',
    };
    const versions = await proposeLayoutAndMapping(
      structure,
      { shape: 'mapping-version/1', fields: { code: { column: 'Code', transform: 'text' } } },
      REVIEWED_TARGET,
    );
    const marker = next('REVIEWED');
    const bytes = await syntheticWorkbook({
      sheet: SHEET,
      header: ['Code', 'Note'],
      rows: [
        ['SYN-A', 'SYNTHETIC'],
        ['SYN-B', 'SYNTHETIC'],
      ],
      marker,
    });
    const stored = importFileStoredSchema.parse(
      ok(
        await call(preparer, 'POST', '/api/files-imports/import-files', {
          sourceSystem: 'manual-upload',
          originalName: syntheticFileName(marker.toLowerCase(), 'xlsx'),
          contentBase64: bytes.toString('base64'),
        }),
      ),
    );
    const batchId = await start(stored, versions, {}, REVIEWED_TARGET);
    ok(await step(batchId, 'validate'));
    const submitted = ok(await versioned(batchId, 'submit'));
    const requestId = String(submitted.requestId);
    const firstVersion = String(submitted.submittedVersionId);
    expect(await rows('select state from access.approval_request where id = $1', [requestId])).toEqual([
      { state: 'Awaiting approval' },
    ]);
    const batch = await read(batchId);
    const document = batch.documents[1];
    const excluded = ok(
      await versioned(batchId, `documents/${document?.documentId ?? ''}/exclusion`, { excluded: true }),
    );
    expect(excluded).toMatchObject({ state: 'Staged' });
    expect(excluded.versionId).not.toBe(firstVersion);
    expect(await rows('select state from access.approval_request where id = $1', [requestId])).toEqual([
      { state: 'Superseded' },
    ]);
    // The decision of the old version can no longer be made (9.6).
    const late = await decide(confirmer, requestId, firstVersion);
    expect(late.status).not.toBe(200);
    // Validated again, the excluded document is not checked; submitted again, a new request binds the new version.
    expect(ok(await step(batchId, 'validate'))).toMatchObject({ state: 'Validated' });
    // PRD-ACS-007: Submit of a version the screen did not show, the one read before the exclusion, is refused.
    expect(errorOf(await step(batchId, 'submit', { versionId: firstVersion }))).toMatchObject({
      kind: 'conflict',
      code: 'kernel.stale-version',
      missing: [{ kind: 'version', recordType: IMPORT_BATCH_TYPE, recordId: batchId, versionId: excluded.versionId }],
    });
    const again = ok(await versioned(batchId, 'submit'));
    expect(again.requestId).not.toBe(requestId);
    // An entry on the Validated batch returns it to Staged too, superseding the new request.
    const row = (await read(batchId)).documents[0]?.rows[0];
    ok(
      await versioned(batchId, `rows/${row?.stagedRowId ?? ''}/entries`, {
        field: 'code',
        value: 'SYN-A2',
        reason: 'SYNTHETIC corrected code',
      }),
    );
    expect(await rows('select state from access.approval_request where id = $1', [String(again.requestId)])).toEqual([
      { state: 'Superseded' },
    ]);
    expect((await read(batchId)).batch).toMatchObject({ state: 'Staged' });
    expect((await read(batchId)).batch.submittedVersionId).toBeUndefined();
  });
});

describe('restricted columns and scope (imports-and-opening-data 11, 15.1; PRD-ACS-008, PRD-SEC-005)', () => {
  it('PRD-ACS-008: masks every cell while the layout is not Confirmed, then only the columns of a class the reader lacks', async () => {
    const versions = await proposeLayoutAndMapping(PRODUCT_LAYOUT, PRODUCT_MAPPING);
    const stored = await upload(preparer, [product(next('STYLE'), next('SKU'), { Cost: 42 })]);
    const unconfirmed = await start(stored, versions);
    const all = await read(unconfirmed, costReader);
    expect(all.batch.maskedClasses).toEqual(ALL_CLASSES.filter((each) => each !== 'cost'));
    expect(all.documents[0]?.rows[0]?.cells.every((cell) => cell.masked !== undefined)).toBe(true);
    expect(Object.values(all.documents[0]?.rows[0]?.values ?? {}).every((value) => value.kind === 'masked')).toBe(true);
    expect(all.documents[0]?.referenceMasked).toBeDefined();
    expect(all.documents[0]?.preview).toBeUndefined();
    // A reader granted every class sees it all.
    const open = await read(unconfirmed, preparer);
    expect(open.batch.maskedClasses).toEqual([]);
    expect(open.documents[0]?.rows[0]?.cells.find((cell) => cell.ref === 'H2')?.text).toBe('42');

    await confirm(versions);
    await withdraw(unconfirmed);
    const confirmed = await start(stored, versions);
    const partial = await read(confirmed, noClassReader);
    expect(partial.batch.restrictedClasses.sort()).toEqual(['bank-details', 'cost']);
    expect(partial.batch.maskedClasses.sort()).toEqual(['bank-details', 'cost']);
    const cells = partial.documents[0]?.rows[0]?.cells ?? [];
    expect(cells.find((cell) => cell.ref === 'H2')).toMatchObject({ raw: null, text: '', masked: 'cost' });
    expect(cells.find((cell) => cell.ref === 'A2')?.masked).toBeUndefined();
    expect(partial.documents[0]?.rows[0]?.values.styleCode).toMatchObject({ kind: 'supplied' });
  });

  it("GC-6 17 test 26 PRD-SEC-005: a reader scoped to one Store sees only that Store's batches, rows and files", async () => {
    const versions = await proposeLayoutAndMapping(PRODUCT_LAYOUT, PRODUCT_MAPPING);
    const stored = await upload(preparer, [product(next('STYLE'), next('SKU'))]);
    const inA = await start(stored, versions, { scope: { siteId: SITE, storeId: STORE_A } });
    // Another file: the same one starts no second batch for the target and layout while the first is open (7.2).
    const storedB = await upload(preparer, [product(next('STYLE'), next('SKU'))]);
    const inB = await start(storedB, versions, { scope: { siteId: SITE, storeId: STORE_B } });
    const seen = await read(inA, storeReader);
    expect(seen.documents[0]?.rows).toHaveLength(1);
    const hidden = await call(storeReader, 'GET', `/api/files-imports/batches/${inB}`);
    expect(errorOf(hidden)).toMatchObject({ kind: 'not-found', code: 'files-imports.batch-not-found' });
    const fileB = (await read(inB)).batch.attachmentId;
    const file = await call(storeReader, 'POST', `/api/files-imports/attachments/${fileB}/download`, {});
    expect(errorOf(file)).toMatchObject({ code: 'files-imports.attachment-not-found' });
    // The documents and rows carry the batch's scope facts, under row-level security (15.1).
    expect(await rows('select distinct store_id from files_imports.staged_row where batch_id = $1', [inB])).toEqual([
      { store_id: STORE_B },
    ]);
  });
});

describe('the organisation create handler (structure-and-masters 7; imports-and-opening-data 13.2)', () => {
  it('PRD-IMP-010 publishes a Store through Prepare a Store, so its first version waits for a different person', async () => {
    const [site] = await rows<{ code: string }>('select code from organisation.site where id = $1', [SITE]);
    const structure: LayoutStructure = {
      shape: 'layout-version/1',
      format: 'xlsx',
      sheet: SHEET,
      headerRow: 1,
      dataStartRow: 2,
      columns: ['Store code', 'Name', 'Format', 'Operating model', 'Site code'].map((name) => ({
        name,
        required: true,
      })),
      documentReference: 'Store code',
    };
    const fields: MappingFields = {
      shape: 'mapping-version/1',
      fields: {
        storeCode: { column: 'Store code', transform: 'text' },
        name: { column: 'Name', transform: 'text' },
        format: { column: 'Format', transform: 'text' },
        operatingModel: { column: 'Operating model', transform: 'text' },
        siteCode: { column: 'Site code', transform: 'text' },
      },
    };
    const versions = await proposeLayoutAndMapping(structure, fields, 'organisation.store');
    await confirm(versions);
    const storeCode = next('IMPSTORE');
    const marker = next('STORES');
    const bytes = await syntheticWorkbook({
      sheet: SHEET,
      header: ['Store code', 'Name', 'Format', 'Operating model', 'Site code'],
      rows: [[storeCode, syntheticName('Imported Store'), 'mbo', 'company-owned', site?.code ?? '']],
      marker,
    });
    const stored = importFileStoredSchema.parse(
      ok(
        await call(preparer, 'POST', '/api/files-imports/import-files', {
          sourceSystem: 'manual-upload',
          originalName: syntheticFileName(marker.toLowerCase(), 'xlsx'),
          contentBase64: bytes.toString('base64'),
        }),
      ),
    );
    const batchId = await start(stored, versions, {}, 'organisation.store');
    expect((await read(batchId)).documents[0]?.preview).toEqual({
      kind: 'would-create',
      records: [{ recordType: 'organisation.store', codes: [storeCode] }],
    });
    ok(await step(batchId, 'validate'));
    ok(await versioned(batchId, 'submit'));
    expect(ok(await publish(batchId))).toMatchObject({ state: 'Published' });
    const stores = await rows<{ decision: string }>(
      `select v.decision from organisation.store s join organisation.store_version v on v.store_id = s.id
        where s.code = $1`,
      [storeCode],
    );
    expect(stores).toEqual([{ decision: 'Awaiting approval' }]);
  });
});

describe('publishing each document at its own place (imports-and-opening-data 13.2; product owner, 10 Oct 2026)', () => {
  const STORE_HEADER = ['Store code', 'Name', 'Format', 'Operating model', 'Site code'];
  const storeStructure: LayoutStructure = {
    shape: 'layout-version/1',
    format: 'xlsx',
    sheet: SHEET,
    headerRow: 1,
    dataStartRow: 2,
    columns: STORE_HEADER.map((name) => ({ name, required: true })),
    documentReference: 'Store code',
  };
  const storeFields: MappingFields = {
    shape: 'mapping-version/1',
    fields: {
      storeCode: { column: 'Store code', transform: 'text' },
      name: { column: 'Name', transform: 'text' },
      format: { column: 'Format', transform: 'text' },
      operatingModel: { column: 'Operating model', transform: 'text' },
      siteCode: { column: 'Site code', transform: 'text' },
    },
  };

  it('PRD-SEC-005 PRD-IMP-012: a Store-scoped preparer publishes a Store of their scope, and is refused one outside it', async () => {
    const versions = await proposeLayoutAndMapping(storeStructure, storeFields, 'organisation.store');
    await confirm(versions);
    const storePreparer = await enrolled(
      'STOREPREP',
      [...IMPORTER, { recordType: 'organisation.store', action: 'edit' }],
      {
        scope: {
          kind: 'dimensions',
          legalEntity: { kind: 'all' },
          place: { kind: 'selected', members: [{ type: 'store', id: STORE_A }] },
          brand: { kind: 'all' },
        },
        fieldClasses: ALL_CLASSES.map((fieldClass) => ({ fieldClass, access: 'view' as const })),
      },
    );
    const [site] = await rows<{ code: string }>('select code from organisation.site where id = $1', [SITE]);
    const codeOf = async (id: string) =>
      (await rows<{ code: string }>('select code from organisation.store where id = $1', [id]))[0]?.code ?? '';
    const as = (path: string, body: unknown) => call(storePreparer, 'POST', path, body);
    /** A Store update batch for one Store, started in Store A's scope, validated and submitted by the preparer. */
    const submitted = async (storeCode: string) => {
      const marker = next('STOREUPD');
      const bytes = await syntheticWorkbook({
        sheet: SHEET,
        header: STORE_HEADER,
        rows: [[storeCode, syntheticName('Renamed Store'), 'mbo', 'company-owned', site?.code ?? '']],
        marker,
      });
      const stored = importFileStoredSchema.parse(
        ok(
          await as('/api/files-imports/import-files', {
            sourceSystem: 'manual-upload',
            originalName: syntheticFileName(marker.toLowerCase(), 'xlsx'),
            contentBase64: bytes.toString('base64'),
          }),
        ),
      );
      const started = ok(
        await as('/api/files-imports/batches', {
          storedFileId: stored.storedFileId,
          fileReceiptId: stored.receiptId,
          kind: 'update',
          target: 'organisation.store',
          layoutVersionId: versions.layoutVersionId,
          mappingVersionId: versions.mappingVersionId,
          scope: { siteId: SITE, storeId: STORE_A },
        }),
      );
      const batchId = String(started.batchId);
      ok(await as(`/api/files-imports/batches/${batchId}/validate`, {}));
      ok(
        await as(`/api/files-imports/batches/${batchId}/submit`, {
          versionId: (await read(batchId, storePreparer)).batch.versionId,
        }),
      );
      return batchId;
    };
    const publishAs = async (batchId: string) =>
      as(`/api/files-imports/batches/${batchId}/publish`, {
        versionId: (await read(batchId, storePreparer)).batch.versionId,
      });
    const awaiting = (id: string) =>
      rows(`select 1 from organisation.store_version where store_id = $1 and decision = 'Awaiting approval'`, [id]);

    const inScope = await submitted(await codeOf(STORE_A));
    expect(ok(await publishAs(inScope))).toMatchObject({ state: 'Published' });
    expect(await awaiting(STORE_A)).toHaveLength(1);

    // The batch is inside the preparer's scope; the Store its document changes is not.
    const outside = await submitted(await codeOf(STORE_B));
    const refused = await publishAs(outside);
    expect(refused.status).toBe(403);
    const error = errorOf(refused);
    expect(error).toMatchObject({ kind: 'not-authorised' });
    const [document] = (await read(outside, storePreparer)).documents;
    expect(error.missing).toContainEqual({ kind: 'import-document', documentId: document?.documentId });
    expect(document?.state).toBe('Staged');
    expect(await awaiting(STORE_B)).toEqual([]);
  });
});
