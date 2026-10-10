import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  errorEnvelopeSchema,
  fieldClassSchema,
  importBatchReadSchema,
  importFileStoredSchema,
  importLayoutListSchema,
  type CatalogueChanged,
  type FieldClass,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMAND_RUNNER,
  ORGANISATION_ROUTER,
  type CommandRunner,
  type OrganisationRouter,
  type RoutedOrganisation,
} from '../src/kernel/index.js';
import { OrganisationKeys } from '../src/modules/access/domain/organisation-keys.js';
import { openFile } from '../src/modules/files-imports/domain/file-seal.js';
import { openReceiptText } from '../src/modules/files-imports/domain/receipt-seal.js';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { syntheticProductFileName, syntheticProductWorkbook, type SyntheticProductRow } from './fixtures/imports.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
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
  writeSyntheticProductLayout,
  type SyntheticProductLayout,
} from './support/imports.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { decided, structureSetup, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F06-T01: the synthetic XLSX tracer, through the whole application on real PostgreSQL and MinIO
// (imports-and-opening-data 3.1, 5, 7.2, 9.1, 9.2, 11, 13.1, 13.2, 15.1, 17 test 2; structure-and-masters 7;
// numbering-and-audit 4.1; PRD-IMP-001, PRD-IMP-002, PRD-IMP-003, PRD-IMP-006, PRD-IMP-010, PRD-IMP-012,
// PRD-MER-013, PRD-MOD-015, PRD-SEC-005, PRD-SEC-017, PRD-UXP-003; GC9-9). Every file and value is SYNTHETIC.

const ALL_CLASSES: readonly FieldClass[] = fieldClassSchema.options;

let world: SyntheticWorld;
let minio: TestFileStore;
let api: AccessTestApp;
let limitedApi: AccessTestApp;
let keysEnvironment: Record<string, string>;
let setup: StructureSetup;
let layoutA: SyntheticProductLayout;
let layoutUnconfirmed: SyntheticProductLayout;
let layoutB: SyntheticProductLayout;
let brandCode: string;
let categoryCode: string;
let counter = 0;
const next = (label: string) => syntheticCode(`${label}-${String(++counter)}`);

interface Signed {
  readonly user: SyntheticUser;
  readonly cookie: string;
}

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

async function signedIn(
  index: 0 | 1,
  label: string,
  authorities: readonly SyntheticAuthority[],
  options: { readonly fieldClasses?: readonly FieldClass[]; readonly app?: AccessTestApp } = {},
): Promise<Signed> {
  const organisation = world.organisations[index];
  const user = await writeSyntheticUser(organisation.database, organisation.code, keysEnvironment, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
  });
  if (authorities.length > 0) {
    await grantSynthetic(organisation.database, { kind: 'user', id: user.id }, authorities, {
      fieldClasses: (options.fieldClasses ?? []).map((fieldClass) => ({ fieldClass, access: 'view' as const })),
    });
  }
  const response = await fetch(`${(options.app ?? api).baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.31' },
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

async function call(
  method: 'GET' | 'POST',
  path: string,
  cookie: string,
  body?: unknown,
  app: AccessTestApp = api,
): Promise<Answer> {
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

const errorOf = (answer: Answer) => errorEnvelopeSchema.parse(answer.body).error;

function upload(cookie: string, bytes: Buffer, name: string, claimedReference?: string): Promise<Answer> {
  return call('POST', '/api/files-imports/import-files', cookie, {
    sourceSystem: 'manual-upload',
    ...(claimedReference === undefined ? {} : { claimedReference }),
    originalName: name,
    contentBase64: bytes.toString('base64'),
  });
}

function start(cookie: string, stored: { storedFileId: string; receiptId: string }, layout: SyntheticProductLayout) {
  return call('POST', '/api/files-imports/batches', cookie, {
    storedFileId: stored.storedFileId,
    fileReceiptId: stored.receiptId,
    kind: 'create',
    target: 'merchandise',
    layoutVersionId: layout.layoutVersionId,
    mappingVersionId: layout.mappingVersionId,
  });
}

/** A SYNTHETIC product row of one style: the brand and category recorded in this test, no size (Unknown). */
function productRow(style: string, sku: string, overrides: Partial<SyntheticProductRow> = {}): SyntheticProductRow {
  return {
    'Style code': style,
    'SKU code': sku,
    'Brand code': brandCode,
    'Category code': categoryCode,
    Size: undefined,
    'Stock unit': 'piece',
    Purpose: 'merchandise',
    ...overrides,
  };
}

async function rows<T extends Record<string, unknown>>(
  index: 0 | 1,
  query: string,
  values: unknown[] = [],
): Promise<T[]> {
  const client = await connect(world.organisations[index].database, 'superuser');
  try {
    return (await client.query<T>(query, values)).rows;
  } finally {
    await client.end();
  }
}

let preparer: Signed;
let preparerB: Signed;
let outsider: Signed;
let organisationA: RoutedOrganisation;

const IMPORTER: SyntheticAuthority[] = [
  { recordType: 'files_imports.stored_file', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'view' },
  { recordType: 'files_imports.import_batch', action: 'create' },
  { recordType: 'files_imports.import_batch', action: 'edit' },
  { recordType: 'merchandise.product_proposal', action: 'view' },
  { recordType: 'merchandise.product_proposal', action: 'create' },
];

beforeAll(async () => {
  world = await createSyntheticOrganisations('imports');
  minio = await startTestFileStore();
  keysEnvironment = syntheticKeysEnvironment(world);
  for (const organisation of world.organisations) {
    await writeSyntheticSetting(organisation.database, 'access.sign-in-throttling', {
      failureLimit: 50,
      windowSeconds: 600,
    });
    await writeSyntheticSetting(organisation.database, 'access.password-rules', { minimumLength: 12 });
    await writeSyntheticSetting(organisation.database, 'access.office-session-limits', {
      idleLockSeconds: 1800,
      absoluteSeconds: 28800,
    });
  }
  api = await startAccessApp(world, keysEnvironment, { fileStoreEnvironment: minio.environment });
  // The same Organisations served as `kdps-test` names its environment: publishing is limited there (S1-F06-T01).
  limitedApi = await startAccessApp(world, keysEnvironment, {
    fileStoreEnvironment: minio.environment,
    environment: 'kdps-test',
  });
  const [orgA, orgB] = world.organisations;
  setup = await structureSetup({
    directory: world.directory,
    database: orgA.database,
    organisationCode: orgA.code,
    keysEnvironment,
    label: 'IMPORTS',
  });
  // The SYNTHETIC catalogue the file names: a brand and a category with no size set and no identity attribute.
  brandCode = next('BRAND');
  categoryCode = next('CAT');
  const recorded = (outcome: { kind: string; answer?: CatalogueChanged }) => {
    if (outcome.kind !== 'success') throw new Error('The synthetic catalogue was refused');
  };
  recorded(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareBrand(c, p, {
        code: brandCode,
        name: syntheticName('Import Brand'),
        aliases: [],
        validFrom: setup.today(),
      }),
    ),
  );
  recorded(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareCategory(c, p, {
        code: categoryCode,
        name: syntheticName('Import Category'),
        identityAttributeIds: [],
        validFrom: setup.today(),
      }),
    ),
  );
  preparer = await signedIn(0, 'IMPORTER', IMPORTER, { fieldClasses: ALL_CLASSES });
  preparerB = await signedIn(1, 'IMPORTERB', IMPORTER, { fieldClasses: ALL_CLASSES });
  outsider = await signedIn(0, 'OUTSIDER', [{ recordType: 'files_imports.stored_file', action: 'create' }]);
  // Confirmed by a different person, so its batches may publish (6.4; S1-F06-T03); and one left Proposed.
  layoutA = await writeSyntheticProductLayout(orgA.database, setup.preparer.id, setup.approver.id);
  layoutUnconfirmed = await writeSyntheticProductLayout(orgA.database, setup.preparer.id);
  layoutB = await writeSyntheticProductLayout(orgB.database, preparerB.user.id);
  const router = api.app.get<OrganisationRouter>(ORGANISATION_ROUTER);
  const routed = await router.resolveForSignIn(orgA.code);
  if (!routed.routed) throw new Error('The synthetic Organisation was not routed');
  organisationA = routed.organisation;
  // Organisation A's batch code series; Organisation B has none (numbering-and-audit 3.5: no format has a default).
  const runner = api.app.get<CommandRunner>(COMMAND_RUNNER);
  await runner.run(
    {
      commandName: 'test.define-series',
      organisation: organisationA,
      correlationId: uuidv7(),
      actor: { kind: 'actor', actorId: setup.preparer.id },
    },
    (context) => defineSyntheticImportBatchSeries(context, api.app.get<NumberingInterface>(NUMBERING)),
  );
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (limitedApi as AccessTestApp | undefined)?.close();
  await (setup as StructureSetup | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('XLSX intake (imports-and-opening-data 9.2, 13.1; PRD-IMP-001, PRD-IMP-002)', () => {
  it('PRD-IMP-002 refuses an import upload that is not XLSX before anything is stored, whatever it is called', async () => {
    const before = await minio.keys();
    const storedBefore = await rows(0, 'select count(*)::int as n from files_imports.stored_file');
    for (const bytes of [
      Buffer.from('%PDF-1.4\n% SYNTHETIC import\n%%EOF\n', 'latin1'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x53, 0x59, 0x4e]),
      Buffer.from('SYNTHETIC,csv\n1,2\n'),
    ]) {
      const answer = await upload(preparer.cookie, bytes, syntheticProductFileName('renamed'));
      expect(answer.status).toBe(422);
      expect(errorOf(answer)).toMatchObject({ kind: 'refused', code: 'files-imports.type-not-allowed' });
    }
    expect(await minio.keys()).toEqual(before);
    expect(await rows(0, 'select count(*)::int as n from files_imports.stored_file')).toEqual(storedBefore);
  });

  it('GC-6 17 test 2: the stored original equals the uploaded bytes and each receipt keeps uploader, time, source system and reference', async () => {
    const bytes = await syntheticProductWorkbook([productRow(next('STYLE'), next('SKU'))], next('ORIGINAL'));
    const answer = await upload(preparer.cookie, bytes, syntheticProductFileName('original'), 'SYN-REF-ORIGINAL');
    expect(answer.status).toBe(200);
    const stored = importFileStoredSchema.parse(answer.body);
    expect(stored).toMatchObject({ format: 'xlsx', alreadyStored: false, earlierBatches: [], sizeBytes: bytes.length });
    const [file] = await rows<{ object_key: string; content_hash: string; encryption_scheme: string }>(
      0,
      'select object_key, content_hash, encryption_scheme from files_imports.stored_file where id = $1',
      [stored.storedFileId],
    );
    if (file === undefined) throw new Error('no stored file');
    const keys = OrganisationKeys.fromEnvironment(keysEnvironment);
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const object = await minio.client.send(new GetObjectCommand({ Bucket: minio.bucket, Key: file.object_key }));
    const sealed = Buffer.from(await (object.Body?.transformToByteArray() ?? Promise.resolve(new Uint8Array())));
    expect(openFile(keys, world.organisations[0].code, file.content_hash, file.encryption_scheme, sealed)).toEqual(
      bytes,
    );
    const [receipt] = await rows<{
      received_by_id: string;
      received_at: Date;
      source_system: string;
      claimed_reference_sealed: string;
      encryption_scheme: string;
    }>(0, 'select * from files_imports.file_receipt where id = $1', [stored.receiptId]);
    expect(receipt).toMatchObject({ received_by_id: preparer.user.id, source_system: 'manual-upload' });
    expect(receipt?.received_at).toBeInstanceOf(Date);
    expect(
      openReceiptText(keys, world.organisations[0].code, stored.receiptId, 'claimed-reference', {
        scheme: receipt?.encryption_scheme ?? '',
        ciphertext: receipt?.claimed_reference_sealed ?? '',
      }),
    ).toBe('SYN-REF-ORIGINAL');
  });
});

describe('the tracer (imports-and-opening-data 3.1; structure-and-masters 7; PRD-IMP-010, PRD-IMP-012, PRD-MER-013)', () => {
  it('PRD-IMP-006 PRD-MER-013 stages, validates and publishes a SYNTHETIC XLSX as a product proposal a different person confirms', async () => {
    // Two styles of one SKU each: the SYNTHETIC category has no size set or identity attribute to tell two SKUs of one
    // style apart (structure-and-masters 4.1), so each document is one style.
    const styles = [next('STYLE'), next('STYLE')];
    const skus = [next('SKU'), next('SKU')];
    const style = styles[0] ?? '';
    const bytes = await syntheticProductWorkbook(
      [productRow(style, skus[0] ?? ''), productRow(styles[1] ?? '', skus[1] ?? '')],
      next('TRACER'),
    );
    const stored = importFileStoredSchema.parse(
      (await upload(preparer.cookie, bytes, syntheticProductFileName('tracer'))).body,
    );

    // The fixed layout and its mapping are offered for the target (6.1, 6.2).
    const layouts = importLayoutListSchema.parse(
      (await call('GET', '/api/files-imports/layouts', preparer.cookie)).body,
    );
    expect(layouts.layouts.map((each) => each.layoutVersionId)).toContain(layoutA.layoutVersionId);

    // Start: a create batch for merchandise, its code from the numbering series (GC9-9).
    const started = await start(preparer.cookie, stored, layoutA);
    expect(started.status).toBe(200);
    // The header row is staged too, as a row that is not data (6.6; S1-F06-T03).
    expect(started.body).toMatchObject({ state: 'Staged', documentCount: 2, rowCount: 3 });
    expect(started.body.code).toMatch(/^SYN-IB-\d{5}$/);
    const batchId = String(started.body.batchId);
    const [allocation] = await rows<{ formatted_text: string; document_id: string }>(
      0,
      `select formatted_text, document_id from numbering.allocation where document_type = 'files_imports.import_batch'
        and document_id = $1`,
      [batchId],
    );
    expect(allocation?.formatted_text).toBe(started.body.code);

    // Staged: every original cell kept, each value Supplied with its origin, Size Unknown (section 5; PRD-MOD-015).
    const read = importBatchReadSchema.parse(
      (await call('GET', `/api/files-imports/batches/${batchId}`, preparer.cookie)).body,
    );
    expect(read.batch).toMatchObject({
      code: started.body.code,
      kind: 'create',
      target: 'merchandise',
      state: 'Staged',
    });
    const [document] = read.documents;
    expect(document?.reference).toBe(style);
    const row = document?.rows[0];
    expect(row).toMatchObject({ sheet: 'SYNTHETIC Products', rowNumber: 2, role: 'data', hidden: false });
    expect(row?.cells.map((cell) => cell.raw)).toEqual([
      style,
      skus[0],
      brandCode,
      categoryCode,
      'piece',
      'merchandise',
    ]);
    expect(row?.values.skuCode).toEqual({
      kind: 'supplied',
      value: skus[0],
      origin: {
        sheet: 'SYNTHETIC Products',
        row: 2,
        column: 'B',
        ref: 'B2',
        raw: skus[0],
        cellType: 'text',
        text: skus[0],
      },
    });
    expect(row?.values.size).toEqual({ kind: 'unknown' });
    expect(read.documents.map((each) => each.preview)).toEqual([
      { kind: 'would-create', records: [{ recordType: 'merchandise.product_proposal', codes: [style, skus[0]] }] },
      { kind: 'would-create', records: [{ recordType: 'merchandise.product_proposal', codes: [styles[1], skus[1]] }] },
    ]);

    // Validate, then publish through the merchandise handler's Maintain operation (13.2).
    const validated = await call('POST', `/api/files-imports/batches/${batchId}/validate`, preparer.cookie);
    expect(validated.status).toBe(200);
    expect(validated.body).toMatchObject({ batchId, state: 'Validated' });
    // The preparer's submission is the merchandise handler's review (13.1, 13.2; S1-F06-T03).
    const submitted = await call('POST', `/api/files-imports/batches/${batchId}/submit`, preparer.cookie);
    expect(submitted.status).toBe(200);
    const published = await call('POST', `/api/files-imports/batches/${batchId}/publish`, preparer.cookie);
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ batchId, state: 'Published' });

    // The proposal names its batch, document and staged rows; it is no SKU until a different person confirms it.
    const after = importBatchReadSchema.parse(
      (await call('GET', `/api/files-imports/batches/${batchId}`, preparer.cookie)).body,
    );
    expect(after.batch.state).toBe('Published');
    expect(after.outcomes).toHaveLength(1);
    expect(after.outcomes[0]).toMatchObject({
      result: 'published',
      counts: { rowsRead: 3, rowsIgnored: 1, rowsAccepted: 2 },
    });
    const proposalId = after.outcomes[0]?.documents[0]?.records[0]?.recordId ?? '';
    const proposal = await setup.run(setup.preparer.id, (c) => setup.catalogue.productProposal(c, proposalId));
    expect(proposal).toMatchObject({
      state: 'Proposed',
      proposedByUserId: preparer.user.id,
      importSource: {
        batchId,
        documentId: document?.documentId,
        stagedRowIds: document?.rows.map((each) => each.stagedRowId),
      },
    });
    // The audit record's source names the batch and the staged row (numbering-and-audit 4.1).
    const audits = await rows<{ source_kind: string; source_reference: string; source_row: number }>(
      0,
      `select source_kind, source_reference, source_row from audit.audit_record
        where record_type = 'product_proposal' and record_id = $1`,
      [proposalId],
    );
    expect(audits).toEqual([{ source_kind: 'import', source_reference: started.body.code, source_row: 2 }]);
    if (proposal?.request === undefined) throw new Error('no approval request');
    decided(await setup.decide(proposal.request.id, proposalId));
    const confirmed = await setup.run(setup.preparer.id, (c) => setup.catalogue.productProposal(c, proposalId));
    expect(confirmed?.state).toBe('Confirmed');
    const list = await setup.run(setup.preparer.id, (c) =>
      setup.catalogue.list(c, 'sku', setup.today(), { limit: 100 }),
    );
    expect(list.records.map((each) => each.code)).toContain(skus[0]);
    // The other document's proposal is no SKU until it is confirmed too (PRD-MER-013).
    expect(list.records.map((each) => each.code)).not.toContain(skus[1]);
    expect(after.outcomes[0]?.documents.map((each) => each.result)).toEqual(['published', 'published']);

    // The same bytes again add a receipt to the stored copy and show the batch that read it (7.2).
    const again = importFileStoredSchema.parse(
      (await upload(preparer.cookie, bytes, syntheticProductFileName('again'))).body,
    );
    expect(again).toMatchObject({ storedFileId: stored.storedFileId, alreadyStored: true });
    expect(again.receiptId).not.toBe(stored.receiptId);
    expect(again.earlierBatches).toEqual([
      { batchId, code: started.body.code, kind: 'create', target: 'merchandise', state: 'Published' },
    ]);
  });

  it('PRD-MOD-015 keeps a required value the file leaves empty Unknown, and validation leaves the batch Staged naming it', async () => {
    const style = next('STYLE');
    const bytes = await syntheticProductWorkbook(
      [productRow(style, next('SKU'), { 'Stock unit': undefined })],
      next('GAP'),
    );
    const stored = importFileStoredSchema.parse(
      (await upload(preparer.cookie, bytes, syntheticProductFileName('gap'))).body,
    );
    const batchId = String((await start(preparer.cookie, stored, layoutA)).body.batchId);
    const validated = await call('POST', `/api/files-imports/batches/${batchId}/validate`, preparer.cookie);
    expect(validated.status).toBe(200);
    expect(validated.body).toMatchObject({ batchId, state: 'Staged' });
    const read = importBatchReadSchema.parse(
      (await call('GET', `/api/files-imports/batches/${batchId}`, preparer.cookie)).body,
    );
    expect(read.documents[0]?.preview).toEqual({
      kind: 'issues',
      issues: [{ code: 'files-imports.required-value-unknown', field: 'stockUnit', rowNumber: 2 }],
    });
    // The validation report names it with its place (8.2; S1-F06-T03).
    expect(read.report?.issues).toContainEqual(
      expect.objectContaining({ class: 'required', severity: 'Blocking', field: 'stockUnit', rowNumber: 2 }),
    );
    const published = await call('POST', `/api/files-imports/batches/${batchId}/publish`, preparer.cookie);
    expect(errorOf(published)).toMatchObject({ kind: 'refused', code: 'files-imports.batch-not-validated' });
  });

  it('PRD-SEC-005 serves the import file only through its batch, as holding every restricted class while its layout is not confirmed', async () => {
    const bytes = await syntheticProductWorkbook([productRow(next('STYLE'), next('SKU'))], next('READ'));
    const stored = importFileStoredSchema.parse(
      (await upload(preparer.cookie, bytes, syntheticProductFileName('read'))).body,
    );
    const batchId = String((await start(preparer.cookie, stored, layoutUnconfirmed)).body.batchId);
    const read = importBatchReadSchema.parse(
      (await call('GET', `/api/files-imports/batches/${batchId}`, preparer.cookie)).body,
    );
    const [attachment] = await rows<{ record_type: string; record_id: string; restricted_classes: string[] }>(
      0,
      'select record_type, record_id, restricted_classes from files_imports.attachment where id = $1',
      [read.batch.attachmentId],
    );
    expect(attachment).toMatchObject({ record_type: 'files_imports.import_batch', record_id: batchId });
    expect([...(attachment?.restricted_classes ?? [])].sort()).toEqual([...ALL_CLASSES].sort());
    // Reading it is an export, so a GET is refused; a reader with no grant on the batch is not served at all.
    const viaGet = await call('GET', `/api/files-imports/attachments/${read.batch.attachmentId}/file`, preparer.cookie);
    expect(errorOf(viaGet).code).toBe('files-imports.restricted-file-is-an-export');
    const outside = await call(
      'GET',
      `/api/files-imports/attachments/${read.batch.attachmentId}/file`,
      outsider.cookie,
    );
    expect(errorOf(outside).code).toBe('files-imports.attachment-not-found');
    // Its staged rows likewise: a reader without every class the file holds sees every cell masked (section 11;
    // S1-F06-T03).
    const partial = await signedIn(0, 'PARTIAL', IMPORTER, { fieldClasses: ['cost'] });
    const masked = importBatchReadSchema.parse(
      (await call('GET', `/api/files-imports/batches/${batchId}`, partial.cookie)).body,
    );
    expect(masked.documents[0]?.rows[0]?.cells.every((cell) => cell.masked !== undefined)).toBe(true);
    // And another Organisation never sees it.
    const elsewhere = await call('GET', `/api/files-imports/batches/${batchId}`, preparerB.cookie);
    expect(errorOf(elsewhere)).toMatchObject({ kind: 'not-found', code: 'files-imports.batch-not-found' });
  });

  it('numbering-and-audit 3.5 GC9-9: starting an import is refused naming the series while no batch code series is set', async () => {
    const bytes = await syntheticProductWorkbook([productRow(next('STYLE'), next('SKU'))], next('NOSERIES'));
    const stored = importFileStoredSchema.parse(
      (await upload(preparerB.cookie, bytes, syntheticProductFileName('noseries'))).body,
    );
    const answer = await start(preparerB.cookie, stored, layoutB);
    expect(answer.status).toBe(403);
    expect(errorOf(answer)).toMatchObject({
      kind: 'unavailable',
      code: 'files-imports.no-import-batch-series',
      missing: [{ kind: 'number-series', numberedKind: 'files-imports.import-batch' }],
    });
    expect(await rows(1, 'select id from files_imports.import_batch')).toEqual([]);
  });

  it('PRD-SEC-017 PRD-UXP-003: on kdps-test Publish answers unavailable naming the missing control, and writes nothing', async () => {
    const bytes = await syntheticProductWorkbook([productRow(next('STYLE'), next('SKU'))], next('LIMIT'));
    const stored = importFileStoredSchema.parse(
      (await upload(preparer.cookie, bytes, syntheticProductFileName('limit'))).body,
    );
    const batchId = String((await start(preparer.cookie, stored, layoutA)).body.batchId);
    expect((await call('POST', `/api/files-imports/batches/${batchId}/validate`, preparer.cookie)).body).toMatchObject({
      state: 'Validated',
    });
    const limitedUser = await signedIn(0, 'LIMITED', IMPORTER, { fieldClasses: ALL_CLASSES, app: limitedApi });
    const proposalsBefore = await rows(0, 'select id from merchandise.product_proposal');
    const answer = await call(
      'POST',
      `/api/files-imports/batches/${batchId}/publish`,
      limitedUser.cookie,
      {},
      limitedApi,
    );
    expect(answer.status).toBe(403);
    expect(errorOf(answer)).toMatchObject({
      kind: 'unavailable',
      code: 'files-imports.publishing-limited',
      missing: [{ kind: 'publishing-control', control: 'duplicate-control', ticket: 'S1-F06-T04' }],
    });
    expect(await rows(0, 'select id from merchandise.product_proposal')).toEqual(proposalsBefore);
    expect(await rows(0, 'select id from files_imports.import_outcome where batch_id = $1', [batchId])).toEqual([]);
    expect(await rows(0, 'select state from files_imports.import_batch where id = $1', [batchId])).toEqual([
      { state: 'Validated' },
    ]);
  });
});
