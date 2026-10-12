import { randomInt } from 'node:crypto';
import { known, paise, uuidv7 } from '@apparel-os/domain';
import {
  comparisonRunListSchema,
  comparisonRunReadSchema,
  errorEnvelopeSchema,
  fieldClassSchema,
  importBatchReadSchema,
  importFileStoredSchema,
  unitReadinessSchema,
  type AssignmentScope,
  type ComparisonRunRead,
  type ImportBatchRead,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMAND_RUNNER,
  ORGANISATION_ROUTER,
  type CommandRunner,
  type OrganisationRouter,
} from '../src/kernel/index.js';
import { IMPORT_HANDLERS, type ImportHandlers } from '../src/modules/files-imports/index.js';
import { CATALOGUE, type CatalogueInterface } from '../src/modules/merchandise/catalogue/index.js';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { ORGANISATION, type OrganisationInterface } from '../src/modules/organisation/index.js';
import { asVerifier } from './harness/stock/checks.js';
import { StockHarness, type HarnessFixtures } from './harness/stock/harness.js';
import { ScenarioRun } from './harness/stock/scenario.js';
import {
  cellsOf,
  MANIFEST_FIELDS,
  MANIFEST_LAYOUT,
  MANIFEST_MAPPING,
  MANIFEST_SHEET,
  OPENING_LAYOUT_CODES,
  SALES_FIELDS,
  SALES_LAYOUT,
  SALES_MAPPING,
  SALES_SHEET,
  SOH_FIELDS,
  SOH_LAYOUT,
  SOH_MAPPING,
  SOH_SHEET,
  type ManifestRow,
} from './fixtures/opening-data.js';
import { syntheticWorkbook } from './fixtures/imports.js';
import { syntheticCode, syntheticFileName, syntheticName } from './fixtures/synthetic.js';
import {
  codeFor,
  startAccessApp,
  SyntheticClock,
  SYNTHETIC_ORIGIN,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { defineSyntheticImportBatchSeries, writeSyntheticLayout } from './support/imports.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { EXPLICIT_UNKNOWN, OPENING_STOCK_TARGET, openingStockHandler } from './support/opening-stock.js';
import { decided } from './support/organisation.js';

// S1-F13-T01: the opening-stock manifest, the earlier POS's SOH and daily sales as historical reference, and the
// comparison runs that reconcile them, through the whole application on real PostgreSQL and MinIO, over a stock
// harness world whose stock the ledger holds (imports-and-opening-data 4.1, 4.2, 10.1 to 10.3, 10.5, 13.1, 14, 15.1,
// 17 test 18; stock-ledger 13.2; books-and-posting 9.1; module-map 4.16; PRD-LIF-003 to PRD-LIF-006, PRD-LIF-013,
// PRD-LIF-014, PRD-LIF-016, PRD-LIF-027, PRD-LIF-028, PRD-MER-011, PRD-IMP-010, PRD-MOD-015, POL-14.07, DEC-013,
// DEC-116, DEC-117). The opening-balance handler is the test-only one of `support/opening-stock.ts`, composed into
// this test application only (GC6-18). Every file, code and value is SYNTHETIC; every expected value is written by
// hand from the files below.

/** The harness, with the keys its users were written under, which the application here must share. */
class OpeningHarness extends StockHarness {
  keys(): Record<string, string> {
    return this.keysEnvironment;
  }
}

let harness: OpeningHarness;
let fixtures: HarnessFixtures;
let minio: TestFileStore;
let api: AccessTestApp;
let clock: SyntheticClock;
let approveReason: string;
const cookies = new Map<string, string>();
let counter = 0;
const next = (label: string) => syntheticCode(`${label}-${String(++counter)}`);

let preparer: SyntheticUser;
let approver: SyntheticUser;
let operations: SyntheticUser;
/** Accounts: verifies opening dues, advances and deposits, never opening stock (POL-14.03). */
let accounts: SyntheticUser;
/** A reader scoped to Store S1 alone, which an SOH names and the manifest of S1's unit does not (PRD-SEC-005). */
let storeReader: SyntheticUser;

/** The codes of the places and records the files name. */
let codes: {
  site: string;
  unit: string;
  location: string;
  legalEntity: string;
  storeId: string;
  barcodeX: string;
  barcodeY: string;
  season: string;
};
let layouts: Record<'manifest' | 'soh' | 'sales', { layoutVersionId: string; mappingVersionId: string }>;

const ALL_CLASSES = fieldClassSchema.options;
const DECIDER: SyntheticAuthority[] = [
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
];
const PREPARER: SyntheticAuthority[] = [
  { recordType: 'files_imports.stored_file', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.import_batch', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'edit' },
  // The preparer holds approve too, so the refusal of their own batch is independence's (PRD-ACS-006).
  { recordType: 'files_imports.import_batch', action: 'approve' },
  ...DECIDER,
  { recordType: 'files_imports.comparison_run', action: 'view' },
  { recordType: 'files_imports.comparison_run', action: 'create' },
  { recordType: 'ebo_imports.reference_document', action: 'view' },
  { recordType: 'ebo_imports.reference_document', action: 'create' },
  { recordType: 'stock.balance', action: 'view' },
];
/** Operations: reviews historical reference and verifies opening stock (PRD-IMP-005, POL-14.02). */
const APPROVER: SyntheticAuthority[] = [
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.import_batch', action: 'approve' },
  { recordType: 'files_imports.opening_stock', action: 'approve' },
  ...DECIDER,
];
const ACCOUNTS: SyntheticAuthority[] = [
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.opening_balances', action: 'approve' },
  ...DECIDER,
];
const STORE_READER: SyntheticAuthority[] = [
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.comparison_run', action: 'view' },
  { recordType: 'files_imports.comparison_run', action: 'create' },
];
const OPERATIONS: SyntheticAuthority[] = [
  { recordType: 'site_lifecycle.readiness_record', action: 'view' },
  { recordType: 'site_lifecycle.readiness_record', action: 'create' },
  { recordType: 'site_lifecycle.zero_stock_declaration', action: 'view' },
];

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

async function enrolled(
  label: string,
  authorities: readonly SyntheticAuthority[],
  scope?: AssignmentScope,
): Promise<SyntheticUser> {
  const organisation = harness.world.organisations[0];
  const user = await writeSyntheticUser(organisation.database, organisation.code, harness.keys(), {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
  });
  await grantSynthetic(organisation.database, { kind: 'user', id: user.id }, authorities, {
    fieldClasses: ALL_CLASSES.map((fieldClass) => ({ fieldClass, access: 'view' as const })),
    ...(scope === undefined ? {} : { scope }),
  });
  clock.advance(30);
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.41' },
    body: JSON.stringify({
      organisationCode: organisation.code,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now()),
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

async function ok(user: SyntheticUser, method: 'GET' | 'POST', path: string, body?: unknown): Promise<Answer> {
  const answer = await call(user, method, path, body);
  expect(answer.status, `${path}: ${JSON.stringify(answer.body)}`).toBe(200);
  return answer;
}

/** A decision on an approval request, with a fresh authenticator code (access-and-approvals 9.3). */
async function decide(user: SyntheticUser, requestId: string, versionId: string): Promise<Answer> {
  clock.advance(30);
  return call(user, 'POST', `/api/access/approval-requests/${requestId}/decision`, {
    versionId,
    outcome: 'approve',
    reason: { kind: 'listed', reasonId: approveReason },
    totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now()),
  });
}

const codeOf = (answer: Answer) => errorEnvelopeSchema.parse(answer.body).error.code;

const readBatch = async (batchId: string): Promise<ImportBatchRead> =>
  importBatchReadSchema.parse((await ok(preparer, 'GET', `/api/files-imports/batches/${batchId}`)).body);

/** Uploads a SYNTHETIC workbook and starts a batch on it; answers the batch. */
async function started(
  file: { sheet: string; header: string[]; rows: (string | null)[][] },
  start: { kind: string; target: string; layout: keyof typeof layouts; scope: Record<string, string> },
): Promise<string> {
  const bytes = await syntheticWorkbook({ ...file, marker: next('FILE') });
  const stored = importFileStoredSchema.parse(
    (
      await ok(preparer, 'POST', '/api/files-imports/import-files', {
        sourceSystem: 'manual-upload',
        originalName: syntheticFileName(`opening-${String(++counter)}`, 'xlsx'),
        contentBase64: bytes.toString('base64'),
      })
    ).body,
  );
  const answer = await ok(preparer, 'POST', '/api/files-imports/batches', {
    storedFileId: stored.storedFileId,
    fileReceiptId: stored.receiptId,
    kind: start.kind,
    target: start.target,
    layoutVersionId: layouts[start.layout].layoutVersionId,
    mappingVersionId: layouts[start.layout].mappingVersionId,
    scope: start.scope,
  });
  return answer.body.batchId as string;
}

/** Validates, marks every Warning seen and submits the batch; answers the batch read after submission. */
async function validatedAndSubmitted(batchId: string): Promise<{ read: ImportBatchRead; requestId?: string }> {
  await ok(preparer, 'POST', `/api/files-imports/batches/${batchId}/validate`, {});
  let read = await readBatch(batchId);
  expect(read.batch.state, JSON.stringify(read.documents.map((each) => each.preview))).toBe('Validated');
  for (const issueClass of new Set(
    (read.report?.issues ?? []).filter((issue) => issue.severity === 'Warning').map((issue) => issue.class),
  )) {
    await ok(preparer, 'POST', `/api/files-imports/batches/${batchId}/issues/seen`, {
      versionId: read.batch.versionId,
      class: issueClass,
    });
  }
  const submitted = await ok(preparer, 'POST', `/api/files-imports/batches/${batchId}/submit`, {
    versionId: read.batch.versionId,
  });
  read = await readBatch(batchId);
  const requestId = submitted.body.requestId as string | undefined;
  return { read, ...(requestId === undefined ? {} : { requestId }) };
}

/** Every stock quantity and value, and the count of movements and journals, as the read-only role reads them (H6). */
function stockSnapshot() {
  return asVerifier(harness.database, async (client) => {
    const rows = await client.query<Record<string, unknown>>(
      `select
         (select coalesce(json_agg(b order by b.id), '[]') from stock.balance b) as balances,
         (select coalesce(json_agg(p order by p.id), '[]') from stock.cost_pool p) as pools,
         (select coalesce(json_agg(v order by v.id), '[]') from stock.valuation v) as valuations,
         (select count(*)::int from stock.movement) as movements,
         (select count(*)::int from finance.journal) as journals`,
    );
    return rows.rows[0];
  });
}

/** The SOH's report date: today, so its barcodes resolve on it as mapped (structure-and-masters 4.7). */
let SOH_DATE: string;

beforeAll(async () => {
  harness = new OpeningHarness();
  await harness.start('opening');
  fixtures = await harness.fixtures('moving-average', 'book');
  SOH_DATE = harness.setup.today();
  // SKU X counted in at Store S1: three pieces, accepted, covered and valued (stock-ledger 11.2), so the ledger holds
  // stock whose quantities and values a historical-reference load must leave as they are (test 18).
  const scenario = new ScenarioRun(harness, fixtures, true);
  await scenario.done({ command: 'receipt', receipt: 'R1', at: 'S1', pieces: 3 });
  await scenario.done({ command: 'receipt-acceptance', receipt: 'R1' });
  await scenario.done({ command: 'pt-coverage', receipt: 'R1' });
  await scenario.done({ command: 'pt-approval', receipt: 'R1', pRatePaise: 10_000 });
  const { setup } = harness;
  // SKU Y, quantity-tracked, whose tracking profile requires batch and expiry (PRD-MER-011).
  const skuY = await harness.catalogueSku(false, true);
  const barcodeX = next('BC-X');
  const barcodeY = next('BC-Y');
  for (const [code, skuId] of [
    [barcodeX, fixtures.sku.skuId],
    [barcodeY, skuY.skuId],
  ] as const) {
    const mapped = await setup.asPreparerDo((c, p) =>
      setup.catalogue.mapCode(c, p, {
        code,
        kind: 'internal',
        scope: { kind: 'organisation' },
        skuId,
        alias: false,
        validFrom: setup.today(),
      }),
    );
    if (mapped.kind !== 'success') throw new Error(`The SYNTHETIC barcode was refused: ${mapped.refusal.code}`);
  }
  // A SYNTHETIC season attribute with one confirmed value (an Organisation's own attribute; GC2-9; RR-199 keeps the
  // season order KDPS's).
  const seasonAttribute = await setup.asPreparerDo((c, p) =>
    setup.catalogue.prepareAttribute(c, p, {
      code: next('SEASON'),
      valueKind: 'list',
      name: syntheticName('Season'),
      validFrom: setup.today(),
    }),
  );
  if (seasonAttribute.kind !== 'success') throw new Error('The SYNTHETIC season attribute was refused');
  const season = next('SS');
  const proposed = await setup.asPreparerDo((c, p) =>
    setup.catalogue.proposeVocabularyValue(c, p, {
      attributeId: seasonAttribute.answer.recordId,
      code: season,
      name: syntheticName('Season value'),
    }),
  );
  if (proposed.kind !== 'success') throw new Error('The SYNTHETIC season value was refused');
  decided(await setup.decide(proposed.answer.requestId, proposed.answer.proposalId));
  const structure = await setup.run(setup.preparer.id, (c) => setup.organisation.structureOn(c, setup.today()));
  const codeOf = (list: readonly { id: string; code: string }[], id: string) =>
    list.find((each) => each.id === id)?.code ?? '';
  const storeId = await harness.storeOf(fixtures.s1.businessUnitId);
  if (storeId === null) throw new Error('Store S1 has no Store');
  codes = {
    site: codeOf(structure.sites, fixtures.s1.siteId),
    unit: codeOf(structure.businessUnits, fixtures.s1.businessUnitId),
    location: codeOf(structure.locations, fixtures.s1.locationId),
    legalEntity: codeOf(structure.legalEntities, fixtures.legalEntityId),
    storeId,
    barcodeX,
    barcodeY,
    season,
  };

  // The application, on the harness's databases and keys, with a SYNTHETIC clock for fresh authenticator codes.
  minio = await startTestFileStore();
  clock = new SyntheticClock();
  const organisation = harness.world.organisations[0];
  await writeSyntheticSetting(organisation.database, 'access.sign-in-throttling', {
    failureLimit: 50,
    windowSeconds: 600,
  });
  await writeSyntheticSetting(organisation.database, 'access.password-rules', { minimumLength: 12 });
  await writeSyntheticSetting(organisation.database, 'access.office-session-limits', {
    idleLockSeconds: 1800,
    absoluteSeconds: 28800,
  });
  api = await startAccessApp(harness.world, harness.keys(), { fileStoreEnvironment: minio.environment, clock });
  // The test-only opening-balance handler, composed into this test application only (GC6-18; code-house-rules 11.4).
  api.app.get<ImportHandlers>(IMPORT_HANDLERS).register(
    openingStockHandler({
      organisation: api.app.get<OrganisationInterface>(ORGANISATION),
      catalogue: api.app.get<CatalogueInterface>(CATALOGUE),
      seasonAttributeId: seasonAttribute.answer.recordId,
    }),
  );
  approveReason = await writeSyntheticReason(organisation.database, 'approve');
  preparer = await enrolled('OPENING-PREPARER', PREPARER);
  approver = await enrolled('OPENING-APPROVER', APPROVER);
  operations = await enrolled('OPENING-OPS', OPERATIONS);
  accounts = await enrolled('OPENING-ACCOUNTS', ACCOUNTS);
  storeReader = await enrolled('OPENING-STORE-READER', STORE_READER, {
    kind: 'dimensions',
    legalEntity: { kind: 'all' },
    place: { kind: 'selected', members: [{ type: 'store', id: storeId }] },
    brand: { kind: 'all' },
  });
  const confirmer = setup.approver.id;
  layouts = {
    manifest: await writeSyntheticLayout(
      organisation.database,
      {
        layoutCode: OPENING_LAYOUT_CODES.manifest.layout,
        mappingCode: OPENING_LAYOUT_CODES.manifest.mapping,
        structure: MANIFEST_LAYOUT,
        fields: MANIFEST_MAPPING,
        target: OPENING_STOCK_TARGET,
        kinds: ['opening-balance'],
        documentType: 'opening-stock',
      },
      setup.preparer.id,
      confirmer,
    ),
    soh: await writeSyntheticLayout(
      organisation.database,
      {
        layoutCode: OPENING_LAYOUT_CODES.soh.layout,
        mappingCode: OPENING_LAYOUT_CODES.soh.mapping,
        structure: SOH_LAYOUT,
        fields: SOH_MAPPING,
        target: 'ebo-imports.stock-on-hand',
        kinds: ['historical-reference'],
        documentType: 'stock-on-hand',
      },
      setup.preparer.id,
      confirmer,
    ),
    sales: await writeSyntheticLayout(
      organisation.database,
      {
        layoutCode: OPENING_LAYOUT_CODES.sales.layout,
        mappingCode: OPENING_LAYOUT_CODES.sales.mapping,
        structure: SALES_LAYOUT,
        fields: SALES_MAPPING,
        target: 'ebo-imports.daily-sales',
        kinds: ['historical-reference'],
        documentType: 'daily-sales',
      },
      setup.preparer.id,
      confirmer,
    ),
  };
  const router = api.app.get<OrganisationRouter>(ORGANISATION_ROUTER);
  const routed = await router.resolveForSignIn(organisation.code);
  if (!routed.routed) throw new Error('The synthetic Organisation was not routed');
  await api.app.get<CommandRunner>(COMMAND_RUNNER).run(
    {
      commandName: 'test.define-series',
      organisation: routed.organisation,
      correlationId: uuidv7(),
      actor: { kind: 'actor', actorId: setup.preparer.id },
    },
    (context) => defineSyntheticImportBatchSeries(context, api.app.get<NumberingInterface>(NUMBERING)),
  );
}, 600_000);

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (harness as OpeningHarness | undefined)?.stop();
});

/** A manifest row at S1's location of SKU X, with every required value, the values given standing for them. */
function manifestRow(manifest: string, values: ManifestRow): (string | null)[] {
  return cellsOf(MANIFEST_FIELDS, {
    manifestReference: manifest,
    section: 'opening-stock',
    siteCode: codes.site,
    unitCode: codes.unit,
    locationCode: codes.location,
    condition: 'good',
    ownerCode: codes.legalEntity,
    ...values,
  });
}

let sohBatchId: string;
let manifestBatchId: string;

describe('SOH and daily sales as historical reference (4.1, 4.2; PRD-LIF-013, PRD-LIF-014, PRD-LIF-016)', () => {
  it('GC-6 17 test 18 PRD-LIF-014 PRD-LIF-016 PRD-IMP-010 PRD-IMP-005: after a historical-reference load of synthetic daily sales and SOH, kept only once a second person reviewed it, every stock quantity and value is unchanged', async () => {
    const before = await stockSnapshot();
    const scope = { siteId: fixtures.s1.siteId, storeId: codes.storeId };
    // The SOH lists positive rows only: SKU X, SKU Y and a barcode no SKU has (I-1).
    sohBatchId = await started(
      {
        sheet: SOH_SHEET,
        header: Object.values(SOH_FIELDS),
        rows: [
          cellsOf(SOH_FIELDS, { reportDate: SOH_DATE, barcode: codes.barcodeX, quantity: '3' }),
          cellsOf(SOH_FIELDS, { reportDate: SOH_DATE, barcode: codes.barcodeY, quantity: '5' }),
          cellsOf(SOH_FIELDS, { reportDate: SOH_DATE, barcode: 'SYN-BC-W', itemCode: 'SYN-ITEM-W', quantity: '1' }),
        ],
      },
      { kind: 'historical-reference', target: 'ebo-imports.stock-on-hand', layout: 'soh', scope },
    );
    const salesBatchId = await started(
      {
        sheet: SALES_SHEET,
        header: Object.values(SALES_FIELDS),
        rows: [
          cellsOf(SALES_FIELDS, {
            reportDate: SOH_DATE,
            billNumber: 'SYN-B-1',
            barcode: codes.barcodeX,
            quantity: '1',
            amount: '499.00',
          }),
          // A return line of the same bill: a negative quantity, kept as given (H-5).
          cellsOf(SALES_FIELDS, {
            reportDate: SOH_DATE,
            billNumber: 'SYN-B-1',
            barcode: codes.barcodeX,
            quantity: '-1',
            amount: '-499.00',
          }),
        ],
      },
      { kind: 'historical-reference', target: 'ebo-imports.daily-sales', layout: 'sales', scope },
    );
    for (const batchId of [sohBatchId, salesBatchId]) {
      const { read, requestId } = await validatedAndSubmitted(batchId);
      const versionId = read.batch.versionId;
      // PRD-IMP-005: kept only after a second person's review, an approval of the batch version.
      expect(read.batch.review).toMatchObject({ kind: 'approval', recordType: 'files_imports.import_batch' });
      if (requestId === undefined) throw new Error('no review request');
      const unreviewed = await call(preparer, 'POST', `/api/files-imports/batches/${batchId}/publish`, { versionId });
      expect(codeOf(unreviewed)).toBe('files-imports.review-missing');
      // The preparer may not review their own batch, though they hold approve (PRD-ACS-006).
      expect(codeOf(await decide(preparer, requestId, versionId))).toBe('access.self-preparation');
      const reviewed = await decide(approver, requestId, versionId);
      expect(reviewed.body).toMatchObject({ outcome: 'Approved' });
      const published = await ok(preparer, 'POST', `/api/files-imports/batches/${batchId}/publish`, {
        versionId,
        approvalDecisionId: reviewed.body.decisionId,
      });
      expect(published.body).toMatchObject({ result: 'published', state: 'Published' });
    }
    // Kept as reference records with their source identities, and nothing else.
    const references = await asVerifier(harness.database, async (client) => {
      const rows = await client.query<{ report_kind: string; reference: string; lines: number }>(
        `select d.report_kind, d.reference, (select count(*)::int from ebo_imports.reference_line l
           where l.reference_document_id = d.id) as lines
         from ebo_imports.reference_document d order by d.report_kind`,
      );
      return rows.rows;
    });
    expect(references).toEqual([
      { report_kind: 'daily-sales', reference: SOH_DATE, lines: 2 },
      { report_kind: 'stock-on-hand', reference: SOH_DATE, lines: 3 },
    ]);
    // PRD-MOD-014: a daily-sales amount is kept in integer paise, not as the file's words. A return line's negative
    // amount stays Unknown, never zero: the `paise` transform takes no sign (6.2; RR-528).
    const amounts = await asVerifier(harness.database, async (client) => {
      const rows = await client.query<{ amount_paise: string | null; amount: string | null }>(
        `select l.amount_paise, l."values" ->> 'amount' as amount from ebo_imports.reference_line l
           join ebo_imports.reference_document d on d.id = l.reference_document_id
         where d.report_kind = 'daily-sales' order by l.row_number`,
      );
      return rows.rows;
    });
    expect(amounts).toEqual([
      { amount_paise: '49900', amount: null },
      { amount_paise: null, amount: null },
    ]);
    expect(await stockSnapshot()).toEqual(before);
  }, 600_000);

  it('GC-6 17 test 18 stock-ledger 13.2: the stock ledger refuses a source of the historical-reference kind', async () => {
    const before = await stockSnapshot();
    const refused = await harness.post(
      harness.poster,
      [
        {
          kind: 'receipt-count',
          lineId: uuidv7(),
          skuId: fixtures.sku.skuId,
          quantity: 1,
          to: fixtures.s1,
          condition: 'good',
          owner: { kind: 'unknown' },
        },
      ],
      { source: { ...harness.source(), importKind: 'historical-reference' } },
    );
    expect(refused.kind === 'refused' && refused.refusal.code).toBe('stock.historical-reference-source');
    expect(await stockSnapshot()).toEqual(before);
  });

  it('GC-6 17 test 18 books-and-posting 9.1 PRD-IMP-010: Post refuses a source of the historical-reference kind', async () => {
    const { setup } = harness;
    const result = await setup.run(setup.preparer.id, (context) =>
      setup.books.post(context, {
        sourceModule: 'test-syn-earlier-pos',
        document: { recordType: 'test-syn-earlier-pos.report', recordId: uuidv7(), importKind: 'historical-reference' },
        actor: { kind: 'user', id: setup.preparer.id },
        items: [
          {
            itemKey: uuidv7(),
            eventKind: 'stock.sale-issue',
            businessUnitId: fixtures.s1.businessUnitId,
            brandId: null,
            businessDate: setup.today(),
            components: [{ component: 'cost', amount: known(paise(100)) }],
          },
        ],
      }),
    );
    expect(result.kind).toBe('refused');
    expect(result.kind === 'refused' && result.items.map((each) => each.refusal.code)).toEqual([
      'finance.historical-reference-source',
    ]);
  });
});

describe('the opening-stock manifest (10.2; PRD-LIF-004, PRD-LIF-005)', () => {
  it('PRD-LIF-005 PRD-MOD-015 PRD-MER-011 PRD-LIF-006 PRD-LIF-030: no valuation evidence stays Unknown, a receipt date without evidence leaves the age Unknown, a missing batch or expiry is Blocking, an explicit Unknown season shows who chose it and when', async () => {
    manifestBatchId = await started(
      {
        sheet: MANIFEST_SHEET,
        header: Object.values(MANIFEST_FIELDS),
        rows: [
          // SKU X, two counted where the SOH lists three; no valuation evidence and no season chosen yet; a receipt
          // date no evidence backs, so its original age is Unknown, never Blocking (PRD-LIF-030).
          manifestRow('SYN-M-1', {
            barcode: codes.barcodeX,
            quantity: '2',
            styleWord: 'SYN STYLE',
            receiptDate: SOH_DATE,
          }),
          // A billed-retained item: its own section with its earlier-POS bill reference, never opening stock.
          manifestRow('SYN-M-1', {
            section: 'billed-retained',
            barcode: codes.barcodeX,
            quantity: '1',
            billReference: 'SYN-EPOS-B-9',
          }),
          // SKU Y, whose profile requires batch and expiry, with neither; a season chosen; a cost with its evidence.
          manifestRow('SYN-M-2', {
            barcode: codes.barcodeY,
            quantity: '5',
            season: codes.season,
            unitCost: '120.00',
            valuationEvidence: 'SYN invoice 77',
          }),
          // A barcode no SKU has: a source identity not yet resolved to a SKU (PRD-MER-013).
          manifestRow('SYN-M-2', { barcode: 'SYN-BC-Z', quantity: '4', season: codes.season }),
        ],
      },
      {
        kind: 'opening-balance',
        target: OPENING_STOCK_TARGET,
        layout: 'manifest',
        scope: { siteId: fixtures.s1.siteId, businessUnitId: fixtures.s1.businessUnitId },
      },
    );
    await ok(preparer, 'POST', `/api/files-imports/batches/${manifestBatchId}/validate`, {});
    let read = await readBatch(manifestBatchId);
    expect(read.batch.state).toBe('Staged');
    const [m1, m2] = read.documents;
    const [first] = m1?.rows ?? [];
    // POL-14.03 PRD-MOD-015: no valuation evidence keeps the value Unknown, never zero.
    expect(first?.values.unitCost).toEqual({ kind: 'unknown' });
    expect(first?.values.valuationEvidence).toEqual({ kind: 'unknown' });
    const issues = (document: typeof m1) =>
      document?.preview?.kind === 'issues'
        ? document.preview.issues.map((each) => `${each.code}@${String(each.rowNumber ?? '')}`)
        : [];
    // No valuation evidence is no issue, nor a receipt date without its evidence; the season not chosen is.
    expect(issues(m1)).toEqual([`${OPENING_STOCK_TARGET}.season-not-chosen@2`]);
    expect(issues(m2).sort()).toEqual(
      [
        `${OPENING_STOCK_TARGET}.batch-required@4`,
        `${OPENING_STOCK_TARGET}.expiry-required@4`,
        `${OPENING_STOCK_TARGET}.identity-not-resolved@5`,
      ].sort(),
    );
    expect(read.report?.issues.filter((issue) => issue.severity === 'Blocking').length).toBeGreaterThan(0);
    // PRD-LIF-006: Unknown selected explicitly by a person, with the reason, and audited.
    if (first === undefined) throw new Error('no first row');
    await ok(preparer, 'POST', `/api/files-imports/batches/${manifestBatchId}/rows/${first.stagedRowId}/entries`, {
      versionId: read.batch.versionId,
      field: 'season',
      value: EXPLICIT_UNKNOWN,
      reason: 'SYNTHETIC: the earlier POS holds no season for this item',
    });
    read = await readBatch(manifestBatchId);
    const season = read.documents[0]?.rows[0]?.values.season;
    expect(season).toMatchObject({
      kind: 'entered',
      value: EXPLICIT_UNKNOWN,
      entry: { enteredByUserId: preparer.id, reason: 'SYNTHETIC: the earlier POS holds no season for this item' },
    });
    expect(season?.kind === 'entered' && typeof season.entry.enteredAt).toBe('string');
    expect(read.documents[0]?.preview).toEqual({
      kind: 'would-create',
      records: [{ recordType: `${OPENING_STOCK_TARGET}.opening-row`, codes: ['SYN-M-1'] }],
    });
  }, 600_000);
});

describe('comparison runs (10.3; PRD-LIF-027, POL-14.07)', () => {
  const count = () => ({ siteId: fixtures.s1.siteId, businessUnitId: fixtures.s1.businessUnitId });

  async function ran(body: unknown): Promise<ComparisonRunRead> {
    const answer = await ok(preparer, 'POST', '/api/files-imports/comparison-runs', body);
    const read = await ok(preparer, 'GET', `/api/files-imports/comparison-runs/${answer.body.runId as string}`);
    return comparisonRunReadSchema.parse(read.body);
  }

  const lines = (run: ComparisonRunRead) =>
    run.lines.map((line) => ({
      keyedBy: line.keyedBy,
      barcode: line.barcode,
      skuId: line.skuId,
      locationId: line.locationId,
      left: line.left,
      right: line.right,
      result: line.result,
    }));

  /** Both sides as they read: the two batches, without their as-of times, and the count. */
  async function sides() {
    const strip = (read: ImportBatchRead) => ({ ...read, asOf: undefined });
    return {
      manifest: strip(await readBatch(manifestBatchId)),
      soh: strip(await readBatch(sohBatchId)),
      stock: await stockSnapshot(),
    };
  }

  it('PRD-LIF-027 lists every difference of the manifest against the last SOH by barcode, then SKU, and changes neither side', async () => {
    const before = await sides();
    const run = await ran({
      run: 'manifest-against-soh',
      manifest: { batchId: manifestBatchId },
      stockOnHand: { batchId: sohBatchId },
    });
    expect(run).toMatchObject({
      run: 'manifest-against-soh',
      key: 'barcode-then-sku',
      left: {
        kind: 'batch',
        set: 'manifest',
        batchId: manifestBatchId,
        batchVersionId: before.manifest.batch.versionId,
      },
      right: { kind: 'batch', set: 'stock-on-hand', batchId: sohBatchId, batchVersionId: before.soh.batch.versionId },
      runByUserId: preparer.id,
      counts: { same: 1, different: 1, 'not-listed-left': 1, 'not-listed-right': 1, unknown: 0, unresolved: 0 },
    });
    expect(lines(run)).toEqual([
      {
        keyedBy: 'barcode',
        barcode: codes.barcodeX,
        skuId: fixtures.sku.skuId,
        locationId: fixtures.s1.locationId,
        left: { state: 'listed', quantity: 2 },
        right: { state: 'listed', quantity: 3 },
        result: 'different',
      },
      expect.objectContaining({
        keyedBy: 'barcode',
        barcode: codes.barcodeY,
        left: { state: 'listed', quantity: 5 },
        right: { state: 'listed', quantity: 5 },
        result: 'same',
      }),
      // Class I-1: the SOH lists positive rows only, so SYN-BC-Z is not listed there, never zero (GC6-16).
      {
        keyedBy: 'barcode',
        barcode: 'SYN-BC-Z',
        skuId: undefined,
        locationId: expect.any(String) as string,
        left: { state: 'listed', quantity: 4 },
        right: { state: 'not-listed' },
        result: 'not-listed-right',
      },
      {
        keyedBy: 'barcode',
        barcode: 'SYN-BC-W',
        skuId: undefined,
        locationId: undefined,
        left: { state: 'not-listed' },
        right: { state: 'listed', quantity: 1 },
        result: 'not-listed-left',
      },
    ]);
    expect(await sides()).toEqual(before);
  });

  it('PRD-LIF-027 lists every difference of the count against the manifest by SKU and location', async () => {
    const before = await sides();
    const run = await ran({ run: 'count-against-manifest', count: count(), manifest: { batchId: manifestBatchId } });
    expect(run.left).toMatchObject({ kind: 'count', set: 'count', ...count() });
    expect(lines(run)).toEqual([
      {
        keyedBy: 'sku-and-location',
        barcode: codes.barcodeX,
        skuId: fixtures.sku.skuId,
        locationId: fixtures.s1.locationId,
        left: { state: 'listed', quantity: 3 },
        right: { state: 'listed', quantity: 2 },
        result: 'different',
      },
      expect.objectContaining({
        keyedBy: 'sku-and-location',
        locationId: fixtures.s1.locationId,
        left: { state: 'not-listed' },
        right: { state: 'listed', quantity: 5 },
        result: 'not-listed-left',
      }),
      // Not yet resolved to a SKU: listed on its own, never dropped.
      expect.objectContaining({ keyedBy: 'unresolved', barcode: 'SYN-BC-Z', result: 'unresolved' }),
    ]);
    expect(await sides()).toEqual(before);
  });

  it('PRD-LIF-027 class I-1 lists every difference of the count against the last SOH, a key the count lacks not listed, never zero', async () => {
    const before = await sides();
    const run = await ran({ run: 'count-against-soh', count: count(), stockOnHand: { batchId: sohBatchId } });
    expect(run.counts).toEqual({
      same: 1,
      different: 0,
      'not-listed-left': 2,
      'not-listed-right': 0,
      unknown: 0,
      unresolved: 0,
    });
    expect(lines(run)[0]).toEqual({
      keyedBy: 'sku',
      barcode: codes.barcodeX,
      skuId: fixtures.sku.skuId,
      locationId: fixtures.s1.locationId,
      left: { state: 'listed', quantity: 3 },
      right: { state: 'listed', quantity: 3 },
      result: 'same',
    });
    expect(await sides()).toEqual(before);
    // The read model lists every run the reader may see, newest first (14).
    const list = comparisonRunListSchema.parse((await ok(preparer, 'GET', '/api/files-imports/comparison-runs')).body);
    expect(list.runs.map((each) => each.run)).toEqual([
      'count-against-soh',
      'count-against-manifest',
      'manifest-against-soh',
    ]);
    expect(list.next).toBeNull();
    expect(list.runs[0]?.right).toMatchObject({ kind: 'batch', batchCode: before.soh.batch.code });
  });

  it('code-house-rules 9 PRD-MOD-009: an SOH whose report date is no date resolves no barcode, never on the server’s date', async () => {
    const undated = await started(
      {
        sheet: SOH_SHEET,
        header: Object.values(SOH_FIELDS),
        rows: [cellsOf(SOH_FIELDS, { reportDate: 'SYN-NOT-A-DATE', barcode: codes.barcodeX, quantity: '3' })],
      },
      {
        kind: 'historical-reference',
        target: 'ebo-imports.stock-on-hand',
        layout: 'soh',
        scope: { siteId: fixtures.s1.siteId, storeId: codes.storeId },
      },
    );
    const run = await ran({ run: 'count-against-soh', count: count(), stockOnHand: { batchId: undated } });
    // Today the barcode names SKU X, which the count holds; with no report date it resolves to none, so the two are
    // not matched: the count's SKU X and the SOH's barcode each listed by one side only.
    expect(lines(run).map((line) => [line.keyedBy, line.skuId ?? null, line.barcode ?? null, line.result])).toEqual([
      ['sku', fixtures.sku.skuId, null, 'not-listed-right'],
      ['barcode', null, codes.barcodeX, 'not-listed-left'],
    ]);
  });

  it('PRD-SEC-005 section 11: a run is refused where the sides name different places, or a side the reader may not see', async () => {
    // An SOH of warehouse W1's Site against the manifest of Store S1's unit: two places, not compared.
    const elsewhere = await started(
      {
        sheet: SOH_SHEET,
        header: Object.values(SOH_FIELDS),
        rows: [cellsOf(SOH_FIELDS, { reportDate: SOH_DATE, barcode: codes.barcodeX, quantity: '1' })],
      },
      {
        kind: 'historical-reference',
        target: 'ebo-imports.stock-on-hand',
        layout: 'soh',
        scope: { siteId: fixtures.w1.siteId },
      },
    );
    const differ = await call(preparer, 'POST', '/api/files-imports/comparison-runs', {
      run: 'manifest-against-soh',
      manifest: { batchId: manifestBatchId },
      stockOnHand: { batchId: elsewhere },
    });
    expect(differ.status).toBe(422);
    expect(codeOf(differ)).toBe('files-imports.comparison-places-differ');
    // A reader scoped to Store S1 sees the SOH, which names the Store, but not the manifest of S1's unit, which names
    // none: the run is refused, as though the manifest were not there.
    const soh = await call(storeReader, 'GET', `/api/files-imports/batches/${sohBatchId}`);
    expect(soh.status).toBe(200);
    const oneSide = await call(storeReader, 'POST', '/api/files-imports/comparison-runs', {
      run: 'manifest-against-soh',
      manifest: { batchId: manifestBatchId },
      stockOnHand: { batchId: sohBatchId },
    });
    expect(oneSide.status).toBe(404);
    expect(codeOf(oneSide)).toBe('files-imports.comparison-set-not-found');
    // A run the reader may see that names a batch they may not see shows that side as not visible, with no code (14).
    const listed = comparisonRunListSchema.parse(
      (await ok(storeReader, 'GET', '/api/files-imports/comparison-runs')).body,
    );
    const withManifest = listed.runs.find((each) => each.run === 'manifest-against-soh');
    expect(withManifest?.left).toEqual({
      kind: 'batch',
      set: 'manifest',
      batchId: manifestBatchId,
      batchVersionId: expect.any(String) as string,
    });
    expect(withManifest?.right).toMatchObject({
      kind: 'batch',
      set: 'stock-on-hand',
      batchCode: expect.any(String) as string,
    });
  });

  it('PRD-SEC-005: a comparison of a batch of the wrong set is refused, and a reader without the run type sees no run', async () => {
    const wrong = await call(preparer, 'POST', '/api/files-imports/comparison-runs', {
      run: 'manifest-against-soh',
      manifest: { batchId: sohBatchId },
      stockOnHand: { batchId: sohBatchId },
    });
    expect(wrong.status).toBe(422);
    expect(codeOf(wrong)).toBe('files-imports.comparison-set-wrong');
    const outsider = await call(approver, 'GET', '/api/files-imports/comparison-runs');
    expect(outsider.status).toBe(403);
  });
});

describe('an approved, unpublished opening batch is the unit’s opening plan (module-map 4.16; DEC-117)', () => {
  async function stockPlan(unitId: string) {
    clock.advance(30);
    await ok(operations, 'POST', `/api/site-lifecycle/units/${unitId}/readiness/receiving/runs`);
    const read = unitReadinessSchema.parse(
      (await ok(operations, 'GET', `/api/site-lifecycle/units/${unitId}/readiness`)).body,
    );
    const latest = read.activities.find((each) => each.activity === 'receiving')?.latest;
    return latest?.checks.find((each) => each.check === 'stock-plan')?.state;
  }

  it('PRD-LIF-003 PRD-LIF-004 DEC-117: the stock-plan check passes for that unit only once the batch is approved, unpublished, with no activation', async () => {
    let read = await readBatch(manifestBatchId);
    // The unresolved and incomplete manifest is set aside; the first is reviewed.
    const second = read.documents[1];
    if (second === undefined) throw new Error('no second document');
    await ok(
      preparer,
      'POST',
      `/api/files-imports/batches/${manifestBatchId}/documents/${second.documentId}/exclusion`,
      {
        versionId: read.batch.versionId,
        excluded: true,
      },
    );
    expect(await stockPlan(fixtures.s1.businessUnitId)).toBe('failed');
    const submitted = await validatedAndSubmitted(manifestBatchId);
    read = submitted.read;
    expect(read.batch.review).toMatchObject({ kind: 'approval' });
    // Submitted but not yet approved: no plan.
    expect(await stockPlan(fixtures.s1.businessUnitId)).toBe('failed');
    if (submitted.requestId === undefined) throw new Error('no approval request');
    // Operations verifies opening stock (POL-14.02): the verification of opening balances, Accounts', does not decide
    // it, and neither does approve on import batches (product owner, 12 Oct 2026).
    expect(read.batch.review).toMatchObject({
      kind: 'approval',
      actionType: 'files_imports.opening_stock.verify',
      recordType: 'files_imports.opening_stock',
    });
    const byAccounts = await decide(accounts, submitted.requestId, read.batch.versionId);
    expect(byAccounts.status).toBe(403);
    expect(codeOf(byAccounts)).toBe('access.not-eligible');
    expect(await stockPlan(fixtures.s1.businessUnitId)).toBe('failed');
    const decision = await decide(approver, submitted.requestId, read.batch.versionId);
    expect(decision.body).toMatchObject({ outcome: 'Approved' });
    expect((await readBatch(manifestBatchId)).batch.state).toBe('Validated');
    expect(await stockPlan(fixtures.s1.businessUnitId)).toBe('passed');
    // That unit only: warehouse W1 has no plan.
    expect(await stockPlan(fixtures.w1.businessUnitId)).toBe('failed');
  }, 600_000);
});
