import { createHash, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { uuidv7 } from '@apparel-os/domain';
import {
  attachedFileSchema,
  errorEnvelopeSchema,
  EVIDENCE_MAX_BYTES,
  permissionRegistry,
  storedFileSchema,
  type FieldClass,
  type RecordTypeDeclaration,
} from '@apparel-os/schemas';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandDefect,
  COMMAND_RUNNER,
  ORGANISATION_ROUTER,
  type CommandRunner,
  type OrganisationRouter,
  type RoutedOrganisation,
} from '../src/kernel/index.js';
import { OrganisationKeys } from '../src/modules/access/domain/organisation-keys.js';
import { openFile } from '../src/modules/files-imports/domain/file-seal.js';
import { openReceiptText } from '../src/modules/files-imports/domain/receipt-seal.js';
import { FILE_STORE, FILES_IMPORTS } from '../src/modules/files-imports/index.js';
import type { FilesImportsInterface, FileStoreHandle } from '../src/modules/files-imports/index.js';
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
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F06-T05: stored files and evidence attachments, through the whole application on real PostgreSQL and MinIO
// (imports-and-opening-data 3.1, 9.2, 9.3, 11, 13.1, 15.1; backup-and-restore 3.3; PRD-IMP-002, PRD-SEC-005,
// PRD-SEC-006, PRD-SEC-014, PRD-MOD-011, PRD-INT-006; DEC-117). Every file and value here is SYNTHETIC. The record the
// files are attached to is the test-only `test_files.evidence_record` (code-house-rules 11.4).

const TEST_TYPE = 'test_files.evidence_record';
const testType: RecordTypeDeclaration = {
  code: TEST_TYPE,
  actions: ['view', 'create', 'edit'],
  scopeFacts: { legalEntity: false, place: true, brand: false },
  subject: false,
  fieldClasses: [],
  serviceOnly: false,
};
const REGISTRY = [...permissionRegistry, testType];
const MARKER = 'SYNTHETIC-FILE-CONTENT-MARKER-4f1c';

const SITE_A = uuidv7();
const SITE_B = uuidv7();
const evidence = { kind: 'supplier-challan', restrictedClasses: [] as FieldClass[] };
const idEvidence = { kind: 'identity-document-photo', restrictedClasses: ['identity-documents'] as FieldClass[] };

function pdfBytes(label: string): Buffer {
  return Buffer.from(`%PDF-1.4\n% ${MARKER} ${label}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n`, 'latin1');
}
function jpegBytes(label: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`${MARKER} ${label}`, 'latin1')]);
}
function pngBytes(label: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`${MARKER} ${label}`, 'latin1'),
  ]);
}
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

let world: SyntheticWorld;
let minio: TestFileStore;
let api: AccessTestApp;
let keysEnvironment: Record<string, string>;
let runner: CommandRunner;
let files: FilesImportsInterface;
let organisationA: RoutedOrganisation;
let organisationB: RoutedOrganisation;
let organisationIds: Record<string, string>;

interface Signed {
  readonly user: SyntheticUser;
  readonly cookie: string;
}

async function signedIn(
  index: 0 | 1,
  label: string,
  authorities: readonly SyntheticAuthority[],
  options: {
    readonly sites?: readonly string[];
    readonly fieldClasses?: readonly FieldClass[];
  } = {},
): Promise<Signed> {
  const organisation = world.organisations[index];
  const user = await writeSyntheticUser(organisation.database, organisation.code, keysEnvironment, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
  });
  if (authorities.length > 0) {
    await grantSynthetic(organisation.database, { kind: 'user', id: user.id }, authorities, {
      registry: REGISTRY,
      ...(options.sites === undefined
        ? {}
        : {
            scope: {
              kind: 'dimensions',
              legalEntity: { kind: 'all' },
              place: { kind: 'selected', members: options.sites.map((id) => ({ type: 'site' as const, id })) },
              brand: { kind: 'all' },
            },
          }),
      fieldClasses: (options.fieldClasses ?? []).map((fieldClass) => ({ fieldClass, access: 'view' as const })),
    });
  }
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.30' },
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

interface Answer<T = Record<string, unknown>> {
  readonly status: number;
  readonly body: T;
  readonly replayed: boolean;
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  cookie: string,
  body?: unknown,
  key: string = uuidv7(),
): Promise<Answer> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method,
    headers: {
      cookie,
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

function store(
  cookie: string,
  bytes: Buffer,
  extra: { sourceSystem?: string; claimedReference?: string; originalName?: string } = {},
  key?: string,
): Promise<Answer> {
  return call(
    'POST',
    '/api/files-imports/files',
    cookie,
    {
      sourceSystem: extra.sourceSystem ?? 'manual-upload',
      ...(extra.claimedReference === undefined ? {} : { claimedReference: extra.claimedReference }),
      originalName: extra.originalName ?? 'SYNTHETIC-file.bin',
      contentBase64: bytes.toString('base64'),
    },
    key,
  );
}

function errorOf(answer: Answer) {
  return errorEnvelopeSchema.parse(answer.body).error;
}

/** A record of the test type and an attachment of a stored file to it, in the record's own transaction. */
async function attachTo(
  index: 0 | 1,
  actorId: string,
  stored: { readonly storedFileId: string; readonly receiptId: string },
  options: {
    readonly site?: string;
    readonly kind?: { kind: string; restrictedClasses: FieldClass[] };
    readonly versionId?: string;
    readonly recordId?: string;
    readonly rollback?: boolean;
    readonly receiptId?: string;
  } = {},
): Promise<{ attachmentId: string; recordId: string }> {
  const organisation = index === 0 ? organisationA : organisationB;
  const recordId = options.recordId ?? uuidv7();
  let attachmentId = '';
  const work = runner.run(
    {
      commandName: 'test.attach-evidence',
      organisation,
      correlationId: uuidv7(),
      actor: { kind: 'actor', actorId },
    },
    async (context) => {
      const attached = await files.attach(context, {
        storedFileId: stored.storedFileId,
        fileReceiptId: options.receiptId ?? stored.receiptId,
        record: {
          module: 'test-files',
          type: TEST_TYPE,
          id: recordId,
          ...(options.versionId === undefined ? {} : { versionId: options.versionId }),
        },
        evidence: options.kind ?? evidence,
        scope: { siteId: options.site ?? SITE_A },
        attachedBy: { kind: 'user', id: actorId },
      });
      attachmentId = attached.attachmentId;
      if (options.rollback === true) throw new Error('SYNTHETIC rollback after the attach');
    },
  );
  if (options.rollback === true) await expect(work).rejects.toThrow('SYNTHETIC rollback');
  else await work;
  return { attachmentId, recordId };
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

async function objectBytes(key: string): Promise<Buffer> {
  const answer = await minio.client.send(new GetObjectCommand({ Bucket: minio.bucket, Key: key }));
  return Buffer.from(await (answer.Body?.transformToByteArray() ?? Promise.resolve(new Uint8Array())));
}

let uploader: Signed;
let uploaderB: Signed;
let admin: Signed;

beforeAll(async () => {
  world = await createSyntheticOrganisations('files');
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
    // The test-only record type's table, in a test_ schema (code-house-rules 11.4), made as the migration role.
    const owner = await connect(organisation.database, 'migration');
    try {
      await owner.query(`
        create schema test_files;
        grant usage on schema test_files to aos_runtime;
        create table test_files.evidence_record (id uuid primary key, site_id uuid);
        grant select, insert on test_files.evidence_record to aos_runtime;`);
    } finally {
      await owner.end();
    }
  }
  api = await startAccessApp(world, keysEnvironment, {
    fileStoreEnvironment: minio.environment,
    extraRecordTypes: [testType],
  });
  runner = api.app.get<CommandRunner>(COMMAND_RUNNER);
  files = api.app.get<FilesImportsInterface>(FILES_IMPORTS);
  const router = api.app.get<OrganisationRouter>(ORGANISATION_ROUTER);
  const routed = await Promise.all(world.organisations.map((each) => router.resolveForSignIn(each.code)));
  if (!routed[0]?.routed || !routed[1]?.routed) throw new Error('The synthetic Organisations were not routed');
  organisationA = routed[0].organisation;
  organisationB = routed[1].organisation;
  const directory = await connect(world.directory, 'superuser');
  try {
    const listed = await directory.query<{ organisation_code: string; id: string }>(
      'select organisation_code, id from kernel.directory_entry',
    );
    organisationIds = Object.fromEntries(listed.rows.map((row) => [row.organisation_code, row.id]));
  } finally {
    await directory.end();
  }
  const creates: SyntheticAuthority[] = [
    { recordType: 'files_imports.stored_file', action: 'create' },
    { recordType: TEST_TYPE, action: 'create' },
    { recordType: TEST_TYPE, action: 'view' },
  ];
  uploader = await signedIn(0, 'UPLOADER', creates);
  uploaderB = await signedIn(1, 'UPLOADERB', creates);
  admin = uploader;
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('storing a file (imports-and-opening-data 3.1 step 2, 11; PRD-IMP-002, PRD-SEC-006, POL-18.02)', () => {
  it('stores a PDF, a JPEG and a PNG encrypted under an object key that starts with the Organisation identifier', async () => {
    const plain = [pdfBytes('stored'), jpegBytes('stored'), pngBytes('stored')];
    const formats = ['pdf', 'jpeg', 'png'];
    const keys = new OrganisationKeys_(keysEnvironment);
    for (const [index, bytes] of plain.entries()) {
      const answer = await store(uploader.cookie, bytes, {
        sourceSystem: 'manual-upload',
        claimedReference: `SYN-REF-${String(index)}`,
      });
      expect(answer.status).toBe(200);
      const stored = storedFileSchema.parse(answer.body);
      expect(stored).toMatchObject({ format: formats[index], sizeBytes: bytes.length, alreadyStored: false });
      // The hash is taken before encryption.
      expect(stored.contentHash).toBe(sha256(bytes));
      const objectKey = `${organisationIds[world.organisations[0].code] ?? ''}/files/${stored.contentHash}`;
      expect(await minio.keys()).toContain(objectKey);
      const object = await objectBytes(objectKey);
      // Not the plaintext, and nothing of it shows.
      expect(object.equals(bytes)).toBe(false);
      expect(object.includes(Buffer.from(MARKER))).toBe(false);
      // Decrypted, it equals the uploaded bytes and matches the hash.
      const row = (
        await rows<{ encryption_scheme: string; object_key: string }>(
          0,
          'select encryption_scheme, object_key from files_imports.stored_file where id = $1',
          [stored.storedFileId],
        )
      )[0];
      expect(row?.object_key).toBe(objectKey);
      const opened = openFile(
        keys.keys,
        world.organisations[0].code,
        stored.contentHash,
        row?.encryption_scheme ?? '',
        object,
      );
      expect(opened.equals(bytes)).toBe(true);
      expect(sha256(opened)).toBe(stored.contentHash);
    }
  });

  it('PRD-IMP-002 the same bytes again add a receipt to the one stored file and write no second object', async () => {
    const bytes = pdfBytes('twice');
    const first = storedFileSchema.parse(
      (
        await store(uploader.cookie, bytes, {
          sourceSystem: 'supplier-email',
          claimedReference: 'SYN-INV-1',
          originalName: 'SYNTHETIC-a.pdf',
        })
      ).body,
    );
    const objectKey = `${organisationIds[world.organisations[0].code] ?? ''}/files/${first.contentHash}`;
    const before = await minio.client.send(new HeadObjectCommand({ Bucket: minio.bucket, Key: objectKey }));
    const keysBefore = await minio.keys();
    const second = storedFileSchema.parse(
      (
        await store(uploader.cookie, bytes, {
          sourceSystem: 'manual-upload',
          claimedReference: 'SYN-INV-2',
          originalName: 'SYNTHETIC-b.pdf',
        })
      ).body,
    );
    expect(second.alreadyStored).toBe(true);
    expect(second.storedFileId).toBe(first.storedFileId);
    expect(second.receiptId).not.toBe(first.receiptId);
    const after = await minio.client.send(new HeadObjectCommand({ Bucket: minio.bucket, Key: objectKey }));
    expect(after.ETag).toBe(before.ETag);
    expect(after.LastModified).toEqual(before.LastModified);
    expect(await minio.keys()).toEqual(keysBefore);
    const receipts = await rows<Record<string, unknown>>(
      0,
      `select id, received_by_id, source_system, claimed_reference_sealed, original_name_sealed, encryption_scheme,
              received_at from files_imports.file_receipt where stored_file_id = $1 order by recorded_at`,
      [first.storedFileId],
    );
    const keys = new OrganisationKeys_(keysEnvironment).keys;
    const opened = receipts.map((r) => [
      r.source_system,
      openReceiptText(keys, world.organisations[0].code, String(r.id), 'claimed-reference', {
        scheme: String(r.encryption_scheme),
        ciphertext: String(r.claimed_reference_sealed),
      }),
      openReceiptText(keys, world.organisations[0].code, String(r.id), 'original-name', {
        scheme: String(r.encryption_scheme),
        ciphertext: String(r.original_name_sealed),
      }),
    ]);
    expect(opened).toEqual([
      ['supplier-email', 'SYN-INV-1', 'SYNTHETIC-a.pdf'],
      ['manual-upload', 'SYN-INV-2', 'SYNTHETIC-b.pdf'],
    ]);
    expect(receipts.every((r) => r.received_by_id === uploader.user.id && r.received_at instanceof Date)).toBe(true);
    expect(
      await rows(0, 'select 1 from files_imports.stored_file where content_hash = $1', [first.contentHash]),
    ).toHaveLength(1);
  });

  it('PRD-INT-002 one idempotency key stores once and a replay answers the kept answer', async () => {
    const bytes = pdfBytes('keyed');
    const key = uuidv7();
    const one = await store(uploader.cookie, bytes, {}, key);
    const two = await store(uploader.cookie, bytes, {}, key);
    expect(two.replayed).toBe(true);
    expect(two.body).toEqual(one.body);
    const stored = storedFileSchema.parse(one.body);
    expect(
      await rows(0, 'select 1 from files_imports.file_receipt where stored_file_id = $1', [stored.storedFileId]),
    ).toHaveLength(1);
  });

  it('PRD-ACS-004 refuses a user who may not create stored files', async () => {
    const nobody = await signedIn(0, 'NOBODY', []);
    const answer = await store(nobody.cookie, pdfBytes('nobody'));
    expect(answer.status).toBe(403);
    expect(errorOf(answer).code).toBe('access.not-authorised');
  });

  it("PRD-ACS-020 keeps a second Organisation's objects under its own prefix, apart from the first's", async () => {
    const bytes = pdfBytes('both-organisations');
    const a = storedFileSchema.parse((await store(uploader.cookie, bytes)).body);
    const b = storedFileSchema.parse((await store(uploaderB.cookie, bytes)).body);
    expect(a.contentHash).toBe(b.contentHash);
    const idA = organisationIds[world.organisations[0].code] ?? '';
    const idB = organisationIds[world.organisations[1].code] ?? '';
    expect(idA).not.toBe(idB);
    const keys = await minio.keys();
    expect(keys).toContain(`${idA}/files/${a.contentHash}`);
    expect(keys).toContain(`${idB}/files/${b.contentHash}`);
    expect(keys.every((key) => key.startsWith(`${idA}/`) || key.startsWith(`${idB}/`))).toBe(true);
    // Each Organisation's key opens its own object only.
    const keyring = new OrganisationKeys_(keysEnvironment);
    const objectA = await objectBytes(`${idA}/files/${a.contentHash}`);
    expect(() =>
      openFile(keyring.keys, world.organisations[1].code, a.contentHash, 'aes-256-gcm/hkdf-sha256/1', objectA),
    ).toThrow();
  });
});

describe('the encrypted receipt (imports-and-opening-data 11, 15.1; PRD-SEC-006; S1-F06-T06)', () => {
  const NAME = 'SYNTHETIC-RECEIPT-NAME-7c2e.pdf';
  const REFERENCE = 'SYNTHETIC-RECEIPT-REF-91ab';

  it('PRD-SEC-006 keeps no plaintext name or reference in the database', async () => {
    const stored = storedFileSchema.parse(
      (await store(uploader.cookie, pdfBytes('receipt-names'), { originalName: NAME, claimedReference: REFERENCE }))
        .body,
    );
    const dump = JSON.stringify(
      await rows(0, 'select * from files_imports.file_receipt where id = $1', [stored.receiptId]),
    );
    expect(dump).not.toContain(NAME);
    expect(dump).not.toContain(REFERENCE);
    const row = (
      await rows<{ claimed_reference_sealed: string | null; original_name_sealed: string }>(
        0,
        'select claimed_reference_sealed, original_name_sealed from files_imports.file_receipt where id = $1',
        [stored.receiptId],
      )
    )[0];
    expect(row?.original_name_sealed).toBeTruthy();
    expect(row?.claimed_reference_sealed).toBeTruthy();
  });

  it('keeps "none claimed" as no sealed reference', async () => {
    const stored = storedFileSchema.parse((await store(uploader.cookie, pdfBytes('receipt-none'))).body);
    const row = (
      await rows<{ claimed_reference_sealed: string | null }>(
        0,
        'select claimed_reference_sealed from files_imports.file_receipt where id = $1',
        [stored.receiptId],
      )
    )[0];
    expect(row?.claimed_reference_sealed).toBeNull();
  });

  it('PRD-SEC-014 never logs the name or the reference', () => {
    const log = api.logText();
    expect(log).not.toContain(NAME);
    expect(log).not.toContain(REFERENCE);
  });
});

describe('an object already in the bucket (imports-and-opening-data 3.1 step 2, 15.1; backup-and-restore 3.3)', () => {
  const keyOf = (hash: string) => `${organisationIds[world.organisations[0].code] ?? ''}/files/${hash}`;

  it('records an object left by an earlier attempt that fully matches, and writes no second object', async () => {
    const bytes = pdfBytes('orphan-good');
    const hash = sha256(bytes);
    const keyring = new OrganisationKeys_(keysEnvironment);
    const sealed = keyring.keys.encrypt(
      world.organisations[0].code,
      'stored-file',
      bytes,
      `files_imports.stored_file:${hash}`,
    );
    await minio.client.send(
      new PutObjectCommand({
        Bucket: minio.bucket,
        Key: keyOf(hash),
        Body: Buffer.from(sealed.ciphertext, 'base64url'),
      }),
    );
    const answer = await store(uploader.cookie, bytes);
    expect(answer.status).toBe(200);
    const row = (
      await rows<{ encryption_scheme: string }>(
        0,
        'select encryption_scheme from files_imports.stored_file where content_hash = $1',
        [hash],
      )
    )[0];
    expect(row?.encryption_scheme).toBe(sealed.scheme);
    // The object is the earlier attempt's, untouched, and it reads back.
    expect(await objectBytes(keyOf(hash))).toEqual(Buffer.from(sealed.ciphertext, 'base64url'));
  });

  it('refuses, and records nothing, when the object there does not open to the file (it is never taken for the file)', async () => {
    const bytes = pdfBytes('orphan-bad');
    const hash = sha256(bytes);
    await minio.client.send(
      new PutObjectCommand({
        Bucket: minio.bucket,
        Key: keyOf(hash),
        Body: Buffer.from('SYNTHETIC not a sealed file'),
      }),
    );
    const answer = await store(uploader.cookie, bytes);
    expect(answer.status).toBeGreaterThanOrEqual(500);
    expect(await rows(0, 'select 1 from files_imports.stored_file where content_hash = $1', [hash])).toHaveLength(0);
    expect(
      await rows(
        0,
        'select 1 from files_imports.file_receipt r join files_imports.stored_file f on f.id = r.stored_file_id where f.content_hash = $1',
        [hash],
      ),
    ).toHaveLength(0);
  });
});

describe('the larger body (imports-and-opening-data 9.3; code-house-rules 12.2)', () => {
  it('holds no more than the ordinary limit for a cookie that names no session', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(1_000_000) });
    const cookie = `__Host-aos-session=${Buffer.from(world.organisations[0].code).toString('base64url')}.${'A'.repeat(43)}`;
    const response = await fetch(`${api.baseUrl}/api/files-imports/files`, {
      method: 'POST',
      headers: { cookie, origin: SYNTHETIC_ORIGIN, 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: big,
    });
    // The ordinary parser refuses it as an invalid request; it was not read to the end and refused as not signed in.
    expect(response.status).toBe(400);
  });
});

describe('what is logged for a file that was not recorded', () => {
  it('does not say a file was handed in when the command then refuses (an idempotency key used for other content)', async () => {
    const key = uuidv7();
    await store(uploader.cookie, pdfBytes('key-first'), {}, key);
    const second = pdfBytes('key-second-never-recorded');
    const answer = await store(uploader.cookie, second, {}, key);
    expect(answer.status).toBeGreaterThanOrEqual(400);
    expect(api.logText()).not.toContain(sha256(second));
  });
});

describe('the intake checks (imports-and-opening-data 9.2, 9.3; DEC-117; PRD-SEC-011)', () => {
  async function refusedAndNothingStored(bytes: Buffer, name: string) {
    const objectsBefore = await minio.keys();
    const filesBefore = await rows(0, 'select 1 from files_imports.stored_file');
    const receiptsBefore = await rows(0, 'select 1 from files_imports.file_receipt');
    const answer = await store(uploader.cookie, bytes, { originalName: name });
    expect(answer.status).toBe(422);
    expect(await minio.keys()).toEqual(objectsBefore);
    expect(await rows(0, 'select 1 from files_imports.stored_file')).toHaveLength(filesBefore.length);
    expect(await rows(0, 'select 1 from files_imports.file_receipt')).toHaveLength(receiptsBefore.length);
    return errorOf(answer);
  }

  it('DEC-117 refuses a renamed file of another type as not allowed, whatever its name says', async () => {
    const error = await refusedAndNothingStored(Buffer.from('a,b\n1,2\n'), 'SYNTHETIC-invoice.pdf');
    expect(error.code).toBe('files-imports.type-not-allowed');
  });

  it('DEC-117 refuses a PDF with active content, naming it', async () => {
    const withScript = Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\nendobj\n%%EOF\n`,
      'latin1',
    );
    const error = await refusedAndNothingStored(withScript, 'SYNTHETIC-script.pdf');
    expect(error.code).toBe('files-imports.active-content');
    expect(error.missing).toEqual([{ kind: 'active-content', found: 'JavaScript' }]);
  });

  it('DEC-117 refuses a file just over the size limit, naming the limit, and stores nothing', async () => {
    const header = pdfBytes('big');
    const justOver = Buffer.concat([header, Buffer.alloc(EVIDENCE_MAX_BYTES + 1 - header.length, 0x20)]);
    const error = await refusedAndNothingStored(justOver, 'SYNTHETIC-big.pdf');
    expect(error.code).toBe('files-imports.file-too-large');
    expect(error.missing).toEqual([{ kind: 'size-limit', maxBytes: String(EVIDENCE_MAX_BYTES) }]);
  });

  it('DEC-117 stores a file of exactly the size limit', async () => {
    const header = pdfBytes('at-limit');
    const atLimit = Buffer.concat([header, Buffer.alloc(EVIDENCE_MAX_BYTES - header.length, 0x20)]);
    const answer = await store(uploader.cookie, atLimit);
    expect(answer.status).toBe(200);
    expect(storedFileSchema.parse(answer.body).sizeBytes).toBe(EVIDENCE_MAX_BYTES);
  });
});

describe('the file-store adapter (backup-and-restore 3.3; PRD-MOD-011; PRD-INT-006; code-house-rules 8.3)', () => {
  const handle = (): FileStoreHandle => api.app.get<FileStoreHandle>(FILE_STORE);

  it('PRD-MOD-011 offers no way to overwrite or delete an object, and never imports one', () => {
    const source = readFileSync(
      new URL('../src/modules/files-imports/file-store/s3-file-store.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/DeleteObject|CopyObject|PutObjectAcl|AbortMultipart/);
    const store = handle();
    expect(store.kind).toBe('configured');
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(store.kind === 'configured' ? store.store : {}));
    expect(methods.sort()).toEqual(['constructor', 'destroy', 'get', 'putOnce']);
  });

  it('PRD-MOD-011 leaves an object that is there as it was when asked to write the key again', async () => {
    const bytes = pdfBytes('rewrite');
    const stored = storedFileSchema.parse((await store(uploader.cookie, bytes)).body);
    const key = `${organisationIds[world.organisations[0].code] ?? ''}/files/${stored.contentHash}`;
    const before = await objectBytes(key);
    const current = handle();
    if (current.kind !== 'configured') throw new Error('not configured');
    await expect(current.store.putOnce(key, Buffer.from('SYNTHETIC replacement'))).resolves.toBe('already-there');
    expect((await objectBytes(key)).equals(before)).toBe(true);
  });

  it('PRD-INT-006 refuses to run inside a transaction', async () => {
    const current = handle();
    if (current.kind !== 'configured') throw new Error('not configured');
    const inside = runner.run(
      {
        commandName: 'test.store-inside',
        organisation: organisationA,
        correlationId: uuidv7(),
        actor: { kind: 'actor', actorId: uploader.user.id },
      },
      async () => {
        await current.store.putOnce(`${uuidv7()}/files/inside`, Buffer.from('x'));
      },
    );
    await expect(inside).rejects.toBeInstanceOf(CommandDefect);
    expect((await minio.keys()).some((key) => key.endsWith('/files/inside'))).toBe(false);
  });

  it("PRD-SEC-005 does not let an object be reached from the bucket without the app's credentials", async () => {
    const [anyKey] = await minio.keys();
    const response = await fetch(`${minio.environment.AOS_FILE_STORE_ENDPOINT ?? ''}/${minio.bucket}/${anyKey ?? ''}`);
    expect(response.status).toBe(403);
  });
});

describe('attaching evidence (imports-and-opening-data 13.1, 15.1; PRD-MOD-011)', () => {
  it('records the record and its version, what it evidences, who attached it and when, and the scope facts', async () => {
    const stored = storedFileSchema.parse((await store(uploader.cookie, pngBytes('attach-record'))).body);
    const versionId = uuidv7();
    const { attachmentId, recordId } = await attachTo(0, uploader.user.id, stored, {
      versionId,
      site: SITE_A,
    });
    const row = (
      await rows<Record<string, unknown>>(0, 'select * from files_imports.attachment where id = $1', [attachmentId])
    )[0];
    expect(row).toMatchObject({
      stored_file_id: stored.storedFileId,
      file_receipt_id: stored.receiptId,
      record_module: 'test-files',
      record_type: TEST_TYPE,
      record_id: recordId,
      record_version_id: versionId,
      evidences: 'supplier-challan',
      restricted_classes: [],
      attached_by_kind: 'user',
      attached_by_id: uploader.user.id,
      site_id: SITE_A,
      store_id: null,
      legal_entity_id: null,
    });
    expect(row?.attached_at).toBeInstanceOf(Date);
    const audit = await rows<{ operation: string }>(
      0,
      `select operation from audit.audit_record where record_id = $1`,
      [recordId],
    );
    expect(audit.map((a) => a.operation)).toEqual(['attach-file']);
  });

  it('PRD-INT-004 leaves no link when the transaction rolls back, and the object stays', async () => {
    const stored = storedFileSchema.parse((await store(uploader.cookie, pngBytes('rolled-back'))).body);
    const before = await rows(0, 'select 1 from files_imports.attachment');
    const { attachmentId } = await attachTo(0, uploader.user.id, stored, { rollback: true });
    expect(attachmentId).not.toBe('');
    expect(await rows(0, 'select 1 from files_imports.attachment')).toHaveLength(before.length);
    expect(await rows(0, 'select 1 from files_imports.attachment where id = $1', [attachmentId])).toHaveLength(0);
    expect(await minio.keys()).toContain(
      `${organisationIds[world.organisations[0].code] ?? ''}/files/${stored.contentHash}`,
    );
  });

  it('PRD-MOD-011 an attachment is never edited or deleted', async () => {
    const stored = storedFileSchema.parse((await store(uploader.cookie, pngBytes('append-only'))).body);
    const { attachmentId } = await attachTo(0, uploader.user.id, stored);
    const client = await connect(world.organisations[0].database, 'migration');
    try {
      await expect(
        client.query(`update files_imports.attachment set evidences = 'x' where id = $1`, [attachmentId]),
      ).rejects.toThrow(/append-only/);
      await expect(client.query('delete from files_imports.stored_file')).rejects.toThrow(/append-only/);
      await expect(client.query('delete from files_imports.file_receipt')).rejects.toThrow(/append-only/);
    } finally {
      await client.end();
    }
  });

  it('refuses an attachment naming a receipt that is not a receipt of the file attached', async () => {
    const one = storedFileSchema.parse((await store(uploader.cookie, pngBytes('receipt-mismatch-one'))).body);
    const other = storedFileSchema.parse((await store(uploader.cookie, pngBytes('receipt-mismatch-two'))).body);
    await expect(attachTo(0, uploader.user.id, one, { receiptId: other.receiptId })).rejects.toThrow(
      /not a receipt of the file/,
    );
    await expect(attachTo(0, uploader.user.id, one, { receiptId: uuidv7() })).rejects.toThrow(
      /not a receipt of the file/,
    );
    expect(
      await rows(0, 'select 1 from files_imports.attachment where stored_file_id = $1', [one.storedFileId]),
    ).toHaveLength(0);
  });

  it('attaching the same file to the same record again writes nothing more', async () => {
    const stored = storedFileSchema.parse((await store(uploader.cookie, pngBytes('twice-attached'))).body);
    const first = await attachTo(0, uploader.user.id, stored);
    const again = await attachTo(0, uploader.user.id, stored, { recordId: first.recordId });
    expect(again.attachmentId).toBe(first.attachmentId);
    expect(
      await rows(0, 'select 1 from files_imports.attachment where stored_file_id = $1', [stored.storedFileId]),
    ).toHaveLength(1);
  });
});

describe('reading a file (imports-and-opening-data 11, 13.1; numbering-and-audit 5.1; PRD-SEC-005, PRD-SEC-007)', () => {
  let attachmentPlain: string;
  let attachmentRestricted: string;
  let plainBytes: Buffer;
  let restrictedBytes: Buffer;
  let readerAllA: Signed;
  let readerSiteB: Signed;
  let readerNoClass: Signed;

  beforeAll(async () => {
    plainBytes = pdfBytes('read-plain');
    restrictedBytes = jpegBytes('read-restricted');
    const plain = storedFileSchema.parse(
      (await store(uploader.cookie, plainBytes, { originalName: 'SYNTHETIC-plain.pdf', claimedReference: 'SYN-P-1' }))
        .body,
    );
    const restricted = storedFileSchema.parse(
      (
        await store(uploader.cookie, restrictedBytes, {
          originalName: 'SYNTHETIC-id-photo.jpg',
          claimedReference: 'SYN-R-1',
        })
      ).body,
    );
    attachmentPlain = (await attachTo(0, uploader.user.id, plain, { site: SITE_A })).attachmentId;
    attachmentRestricted = (await attachTo(0, uploader.user.id, restricted, { site: SITE_A, kind: idEvidence }))
      .attachmentId;
    const view: SyntheticAuthority[] = [{ recordType: TEST_TYPE, action: 'view' }];
    readerAllA = await signedIn(0, 'READERALL', view, { sites: [SITE_A], fieldClasses: ['identity-documents'] });
    readerSiteB = await signedIn(0, 'READERB', view, { sites: [SITE_B], fieldClasses: ['identity-documents'] });
    readerNoClass = await signedIn(0, 'READERNOCLASS', view, { sites: [SITE_A] });
  });

  const readPath = (id: string): string => `/api/files-imports/attachments/${id}/file`;
  const downloadPath = (id: string): string => `/api/files-imports/attachments/${id}/download`;

  it('serves the decrypted bytes to a reader authorised for the record it is attached to', async () => {
    const answer = await call('GET', readPath(attachmentPlain), readerAllA.cookie);
    expect(answer.status).toBe(200);
    const file = attachedFileSchema.parse(answer.body);
    expect(Buffer.from(file.contentBase64, 'base64').equals(plainBytes)).toBe(true);
    expect(file.contentHash).toBe(sha256(plainBytes));
    expect(file.restrictedClasses).toEqual([]);
    // The receipt's name and reference are decrypted only for a reader served the file (RR-433).
    expect([file.receipt.originalName, file.receipt.claimedReference]).toEqual(['SYNTHETIC-plain.pdf', 'SYN-P-1']);
  });

  it("RR-433 serves only the receipt the attachment was made from, not another uploader's receipt of the same bytes", async () => {
    // The same bytes handed in again by someone else, with their own name and reference (PRD-IMP-002).
    const otherUploader = await signedIn(0, 'UPLOADERC', [
      { recordType: 'files_imports.stored_file', action: 'create' },
    ]);
    const again = storedFileSchema.parse(
      (
        await store(otherUploader.cookie, plainBytes, {
          originalName: 'SYNTHETIC-scope-b-secret.pdf',
          claimedReference: 'SYN-SCOPE-B-9',
        })
      ).body,
    );
    expect(again.alreadyStored).toBe(true);
    const inB = await attachTo(0, uploader.user.id, again, { site: SITE_B });
    const fromA = await call('GET', readPath(attachmentPlain), readerAllA.cookie);
    expect(fromA.status).toBe(200);
    expect(JSON.stringify(fromA.body)).not.toContain('SCOPE-B');
    expect(JSON.stringify(fromA.body)).not.toContain('scope-b-secret');
    const fileA = attachedFileSchema.parse(fromA.body);
    expect([fileA.receipt.originalName, fileA.receipt.claimedReference]).toEqual(['SYNTHETIC-plain.pdf', 'SYN-P-1']);
    const fromB = await call('GET', readPath(inB.attachmentId), readerSiteB.cookie);
    expect(fromB.status).toBe(200);
    const fileB = attachedFileSchema.parse(fromB.body);
    expect(fileB.receipt.receiptId).toBe(again.receiptId);
    expect([fileB.receipt.originalName, fileB.receipt.claimedReference]).toEqual([
      'SYNTHETIC-scope-b-secret.pdf',
      'SYN-SCOPE-B-9',
    ]);
    expect(JSON.stringify(fromB.body)).not.toContain('SYN-P-1');
  });

  it("PRD-SEC-005 refuses a file outside the reader's scope as not found and serves nothing", async () => {
    const answer = await call('GET', readPath(attachmentPlain), readerSiteB.cookie);
    expect(answer.status).toBe(404);
    expect(errorOf(answer).code).toBe('files-imports.attachment-not-found');
    expect(JSON.stringify(answer.body)).not.toContain('contentBase64');
  });

  it("PRD-SEC-005 refuses a reader with no grant on the attached record's type", async () => {
    const nobody = await signedIn(0, 'NOGRANT', []);
    const answer = await call('GET', readPath(attachmentPlain), nobody.cookie);
    expect(answer.status).toBe(404);
    expect(JSON.stringify(answer.body)).not.toContain('contentBase64');
  });

  it('PRD-SEC-005 refuses a file that carries a class the reader is not granted, naming the class, and serves nothing', async () => {
    for (const [method, path] of [
      ['POST', downloadPath(attachmentRestricted)],
      ['GET', readPath(attachmentRestricted)],
    ] as const) {
      const answer = await call(method, path, readerNoClass.cookie);
      expect(answer.status).toBe(403);
      expect(errorOf(answer).code).toBe('access.not-authorised');
      expect(errorOf(answer).missing?.[0]).toMatchObject({ kind: 'field-class', fieldClass: 'identity-documents' });
      expect(JSON.stringify(answer.body)).not.toContain('contentBase64');
    }
    const written = await rows(
      0,
      `select 1 from audit.access_record where kind = 'sensitive-access' and user_id = $1`,
      [readerNoClass.user.id],
    );
    expect(written).toHaveLength(0);
  });

  it('PRD-SEC-007 reading a file that holds a restricted class is an export: the plain read refuses it', async () => {
    const answer = await call('GET', readPath(attachmentRestricted), readerAllA.cookie);
    expect(answer.status).toBe(422);
    expect(errorOf(answer).code).toBe('files-imports.restricted-file-is-an-export');
  });

  /** A reader of the restricted class whose next authenticator code is a fresh one (a step after sign-in). */
  async function freshReader(label: string): Promise<{ signed: Signed; code: () => string }> {
    const signed = await signedIn(0, label, [{ recordType: TEST_TYPE, action: 'view' }], {
      sites: [SITE_A],
      fieldClasses: ['identity-documents'],
    });
    return { signed, code: () => codeFor(signed.user.factorSecret ?? Buffer.alloc(0), 1) };
  }
  const accessRecords = (userId: string) =>
    rows(0, `select 1 from audit.access_record where kind = 'sensitive-access' and user_id = $1`, [userId]);

  it('PRD-SEC-001 PRD-SEC-007 downloading a restricted file with a fresh code serves it and writes an access record', async () => {
    const reader = await freshReader('DLFRESH');
    const key = uuidv7();
    const usedCode = reader.code();
    const answer = await call(
      'POST',
      downloadPath(attachmentRestricted),
      reader.signed.cookie,
      { totpCode: usedCode },
      key,
    );
    expect(answer.status).toBe(200);
    const file = attachedFileSchema.parse(answer.body);
    expect(Buffer.from(file.contentBase64, 'base64').equals(restrictedBytes)).toBe(true);
    expect(file.restrictedClasses).toEqual(['identity-documents']);
    expect([file.receipt.originalName, file.receipt.claimedReference]).toEqual(['SYNTHETIC-id-photo.jpg', 'SYN-R-1']);
    const written = await rows<Record<string, unknown>>(
      0,
      `select kind, outcome, field_class, exposure, record_type, record_id, user_id from audit.access_record
       where kind = 'sensitive-access' and user_id = $1`,
      [reader.signed.user.id],
    );
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      outcome: 'succeeded',
      field_class: 'identity-documents',
      exposure: 'exported',
      record_type: TEST_TYPE,
    });
    // The same request again carries a code already used, so it is refused and serves nothing.
    const replay = await call(
      'POST',
      downloadPath(attachmentRestricted),
      reader.signed.cookie,
      { totpCode: usedCode },
      key,
    );
    expect(replay.status).toBe(403);
    expect(errorOf(replay).code).toBe('access.authenticator-code-refused');
    expect(JSON.stringify(replay.body)).not.toContain('contentBase64');
  });

  it('PRD-SEC-001 refuses a restricted download with no code: serves nothing and writes no access record', async () => {
    const reader = await freshReader('DLNOCODE');
    const answer = await call('POST', downloadPath(attachmentRestricted), reader.signed.cookie, {});
    expect(answer.status).toBe(403);
    expect(errorOf(answer).code).toBe('access.authenticator-code-refused');
    expect(JSON.stringify(answer.body)).not.toContain('contentBase64');
    expect(await accessRecords(reader.signed.user.id)).toHaveLength(0);
  });

  it('PRD-SEC-001 refuses a wrong code and a code already used, serving nothing and writing no second record', async () => {
    const reader = await freshReader('DLUSED');
    const wrong = await call('POST', downloadPath(attachmentRestricted), reader.signed.cookie, { totpCode: '000000' });
    expect(wrong.status).toBe(403);
    expect(errorOf(wrong).code).toBe('access.authenticator-code-refused');
    expect(await accessRecords(reader.signed.user.id)).toHaveLength(0);
    const code = reader.code();
    const first = await call('POST', downloadPath(attachmentRestricted), reader.signed.cookie, { totpCode: code });
    expect(first.status).toBe(200);
    const again = await call('POST', downloadPath(attachmentRestricted), reader.signed.cookie, { totpCode: code });
    expect(again.status).toBe(403);
    expect(errorOf(again).code).toBe('access.authenticator-code-refused');
    expect(JSON.stringify(again.body)).not.toContain('contentBase64');
    expect(await accessRecords(reader.signed.user.id)).toHaveLength(1);
  });

  it('PRD-SEC-001 a code is not asked for a file with no restricted class', async () => {
    const key = uuidv7();
    const answer = await call('POST', downloadPath(attachmentPlain), readerAllA.cookie, {}, key);
    expect(answer.status).toBe(200);
    // The answer is not kept: an identical replay is refused (DEC-114).
    const replay = await call('POST', downloadPath(attachmentPlain), readerAllA.cookie, {}, key);
    expect(replay.status).toBe(409);
    expect(errorOf(replay).code).toBe('kernel.answer-not-repeatable');
  });

  it('downloading a file with no restricted class serves it and writes no sensitive-access record', async () => {
    const before = await rows(0, `select 1 from audit.access_record where kind = 'sensitive-access' and user_id = $1`, [
      readerAllA.user.id,
    ]);
    const answer = await call('POST', downloadPath(attachmentPlain), readerAllA.cookie);
    expect(answer.status).toBe(200);
    const after = await rows(0, `select 1 from audit.access_record where kind = 'sensitive-access' and user_id = $1`, [
      readerAllA.user.id,
    ]);
    expect(after).toHaveLength(before.length);
  });

  it("PRD-ACS-020 never serves one Organisation's file to the other Organisation's user", async () => {
    const view: SyntheticAuthority[] = [{ recordType: TEST_TYPE, action: 'view' }];
    const readerB = await signedIn(1, 'READERINB', view, { sites: [SITE_A], fieldClasses: ['identity-documents'] });
    for (const id of [attachmentPlain, attachmentRestricted]) {
      const got = await call('GET', readPath(id), readerB.cookie);
      expect(got.status).toBe(404);
      const downloaded = await call('POST', downloadPath(id), readerB.cookie);
      expect(downloaded.status).toBe(404);
    }
  });
});

describe('what is logged (imports-and-opening-data 9.3; PRD-SEC-014; code-house-rules 12.11)', () => {
  it('PRD-SEC-014 no file content, restricted value or key reaches the service log; a file is logged by hash and size', () => {
    const log = api.logText();
    expect(log).not.toContain(MARKER);
    expect(log).not.toContain(Buffer.from(MARKER).toString('base64').slice(0, 24));
    for (const key of Object.values(
      JSON.parse(keysEnvironment.AOS_ORGANISATION_KEYS ?? '{}') as Record<string, string>,
    )) {
      expect(log).not.toContain(key);
    }
    expect(log).toContain(sha256(pdfBytes('read-plain')));
    expect(log).toContain('A file was handed in');
  });
});

describe('file storage not set (code-house-rules 12.14; AGENTS.md "Nothing is on by default")', () => {
  it('is unavailable and says so, storing nothing', async () => {
    const bare = await startAccessApp(world, keysEnvironment, { extraRecordTypes: [testType] });
    try {
      const response = await fetch(`${bare.baseUrl}/api/access/sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.31' },
        body: JSON.stringify({
          organisationCode: world.organisations[0].code,
          login: admin.user.login,
          password: admin.user.password,
          totpCode: codeFor(admin.user.factorSecret ?? Buffer.alloc(0), 1),
        }),
      });
      expect(response.status).toBe(200);
      const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
      const answer = await fetch(`${bare.baseUrl}/api/files-imports/files`, {
        method: 'POST',
        headers: { cookie, origin: SYNTHETIC_ORIGIN, 'content-type': 'application/json', 'idempotency-key': uuidv7() },
        body: JSON.stringify({
          sourceSystem: 'manual-upload',
          originalName: 'SYNTHETIC.pdf',
          contentBase64: pdfBytes('unset').toString('base64'),
        }),
      });
      expect(answer.status).toBe(403);
      expect(errorEnvelopeSchema.parse(await answer.json()).error.code).toBe('files-imports.file-store-not-configured');
    } finally {
      await bare.close();
    }
  });
});

/** Reads the synthetic keys the way the application does, for the test's own decryption. */
class OrganisationKeys_ {
  readonly keys: OrganisationKeys;
  constructor(environment: Record<string, string>) {
    this.keys = OrganisationKeys.fromEnvironment(environment);
  }
}
