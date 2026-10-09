import { createHash, randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  approvalRequestViewSchema,
  attachedFileSchema,
  exceptionViewSchema,
  type FieldClass,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandRunner,
  newCorrelationId,
  OrganisationRouter,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { Audit } from '../src/modules/audit/index.js';
import {
  EXCEPTION_CODE_KIND,
  Exceptions,
  type ExceptionTypeRegistration,
  type RaiseInput,
} from '../src/modules/exceptions/index.js';
import { Inbox } from '../src/modules/inbox/index.js';
import { Numbering } from '../src/modules/numbering/index.js';
import {
  codeFor,
  startAccessApp,
  SYNTHETIC_ORIGIN,
  SyntheticClock,
  syntheticKeysEnvironment,
  syntheticTimezone,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import {
  createTestExceptionsSchema,
  defineSyntheticCodeSeries,
  syntheticMismatch,
  TEST_DOCUMENT_TYPE,
  TEST_EXCEPTIONS_MODULE,
  writeTestDocument,
} from './support/exceptions.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { capturingLogger } from './support/jobs.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';

// S1-F08-T03: evidence files on exceptions and on approval decisions, through the whole application on real PostgreSQL
// and MinIO (access-and-approvals 9.5, 12.1, 12.3; imports-and-opening-data 11, 13.1, 15.1; numbering-and-audit 5.1;
// module-map 4.7; PRD-EXC-001, PRD-ACS-010, PRD-SEC-005, PRD-SEC-007, PRD-ACS-020, POL-02.23, POL-03.05). The raising
// module is the test-only one of S1-F08-T02 (code-house-rules 11.4), with a second SYNTHETIC type whose evidence
// carries a restricted class. Every file, format, routing and value here is SYNTHETIC.

const SYNTHETIC_THROTTLING = { failureLimit: 50, windowSeconds: 600 };
const SYNTHETIC_PASSWORD_RULES = { minimumLength: 12 };
const SYNTHETIC_LIMITS = { idleLockSeconds: 3600, absoluteSeconds: 7200 };
const SYNTHETIC_DUE = { format: 'elapsed-minutes-v1', minutes: 30 } as const;
const SITE = '01900000-0000-7000-8000-0000000e6001';
const SITE_NO_GRANT = '01900000-0000-7000-8000-0000000e6002';
const ACTOR = '01900000-0000-7000-8000-0000000e6a01';
/** A comment a test-only trigger fails a decision on, after its evidence is linked (code-house-rules 11.4). */
const FAIL_MARKER = 'SYNTHETIC fail the decision at commit';

/** A SYNTHETIC type whose evidence carries the cost class, standing in for a type that declares one. */
const syntheticCostly: ExceptionTypeRegistration = {
  ...syntheticMismatch,
  code: `${TEST_EXCEPTIONS_MODULE}.costly-mismatch`,
  evidenceClasses: ['cost'],
};

type Enrolled = SyntheticUser & { factorSecret: Buffer };

const jpeg = (label: string) =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`SYNTHETIC photograph ${label}`, 'latin1')]);
const pdf = (label: string) =>
  Buffer.from(`%PDF-1.4\n% SYNTHETIC ${label}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n`, 'latin1');
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

let world: SyntheticWorld;
let databaseA: string;
let databaseB: string;
let keys: Record<string, string>;
let minio: TestFileStore;
let api: AccessTestApp;
let clock: SyntheticClock;
let router: OrganisationRouter;
let routedA: RoutedOrganisation;
let runner: CommandRunner;
const log = capturingLogger();
const numbering = new Numbering({ kinds: [EXCEPTION_CODE_KIND] });
const exceptions = new Exceptions({
  numbering,
  inbox: new Inbox(),
  audit: new Audit(log.logger),
  types: [syntheticMismatch, syntheticCostly],
});
let admin: Enrolled;
let approver: Enrolled;
let approveReasonId: string;
let owner: Enrolled;
let ownerNoGrant: Enrolled;
let outsider: Enrolled;
let plainReader: Enrolled;
let costReader: Enrolled;
let routingReader: Enrolled;
let readerB: Enrolled;
const cookies = new Map<string, string>();

async function enrolled(
  label: string,
  authorities: readonly SyntheticAuthority[],
  options: { database?: string; code?: string; fieldClasses?: readonly FieldClass[] } = {},
): Promise<Enrolled> {
  const database = options.database ?? databaseA;
  const user = (await writeSyntheticUser(database, options.code ?? world.organisations[0].code, keys, {
    label,
    enrolled: true,
  })) as Enrolled;
  if (authorities.length > 0) {
    await grantSynthetic(database, { kind: 'user', id: user.id }, authorities, {
      fieldClasses: (options.fieldClasses ?? []).map((fieldClass) => ({ fieldClass, access: 'view' as const })),
    });
  }
  return user;
}

const STORE: SyntheticAuthority = { recordType: 'files_imports.stored_file', action: 'create' };
const VIEW_EXCEPTION: SyntheticAuthority = { recordType: 'exceptions.exception', action: 'view' };

beforeAll(async () => {
  world = await createSyntheticOrganisations('evidence');
  [databaseA, databaseB] = world.organisations.map((organisation) => organisation.database) as [string, string];
  keys = syntheticKeysEnvironment(world);
  for (const database of [databaseA, databaseB]) {
    await createTestExceptionsSchema(database);
    await writeSyntheticSetting(database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
    await writeSyntheticSetting(database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
    await writeSyntheticSetting(database, 'access.office-session-limits', SYNTHETIC_LIMITS);
  }
  admin = await enrolled('ADMIN', [
    { recordType: 'exceptions.exception_routing', action: 'view' },
    { recordType: 'exceptions.exception_routing', action: 'edit' },
  ]);
  approver = await enrolled('APPROVER', [
    { recordType: 'exceptions.exception_routing', action: 'view' },
    { recordType: 'exceptions.exception_routing', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
    STORE,
  ]);
  approveReasonId = await writeSyntheticReason(databaseA, 'approve');
  owner = await enrolled('OWNER', [VIEW_EXCEPTION, STORE]);
  ownerNoGrant = await enrolled('OWNER-NO-GRANT', [STORE]);
  outsider = await enrolled('OUTSIDER', [STORE]);
  plainReader = await enrolled('PLAIN-READER', [VIEW_EXCEPTION]);
  costReader = await enrolled('COST-READER', [VIEW_EXCEPTION], { fieldClasses: ['cost'] });
  routingReader = await enrolled('ROUTING-READER', [{ recordType: 'exceptions.exception_routing', action: 'view' }]);
  readerB = await enrolled(
    'READER-B',
    [VIEW_EXCEPTION, { recordType: 'exceptions.exception_routing', action: 'view' }],
    {
      database: databaseB,
      code: world.organisations[1].code,
      fieldClasses: ['cost'],
    },
  );
  minio = await startTestFileStore();
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, {
    clock,
    exceptionTypes: [syntheticMismatch, syntheticCostly],
    fileStoreEnvironment: minio.environment,
  });
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    log.logger,
  );
  const found = await router.resolveForSignIn(world.organisations[0].code);
  if (!found.routed) throw new Error('not routed');
  routedA = found.organisation;
  runner = new CommandRunner({ clock: { now: () => new Date() }, timezones: syntheticTimezone, logger: log.logger });
  await run((context) => defineSyntheticCodeSeries(context, numbering));
  for (const type of [syntheticMismatch, syntheticCostly]) {
    await approvedRouting({ typeCode: type.code, siteId: SITE, owner: { kind: 'user', userId: owner.id } });
  }
  await approvedRouting({
    typeCode: syntheticMismatch.code,
    siteId: SITE_NO_GRANT,
    owner: { kind: 'user', userId: ownerNoGrant.id },
  });
}, 240_000);

afterAll(async () => {
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

function run<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
  return runner.run(
    {
      commandName: 'test-syn-exceptions.raise',
      organisation: routedA,
      correlationId: newCorrelationId(),
      actor: { kind: 'actor', actorId: ACTOR },
    },
    work,
  );
}

interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function freshAddress(): string {
  return `10.${String(randomInt(256))}.${String(randomInt(256))}.${String(randomInt(1, 255))}`;
}

async function post(path: string, body: unknown, cookie?: string, key: string | null = uuidv7()): Promise<Call> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': freshAddress(),
    origin: SYNTHETIC_ORIGIN,
  };
  if (cookie !== undefined) headers.cookie = cookie;
  if (key !== null) headers['idempotency-key'] = key;
  const response = await fetch(`${api.baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function get(path: string, cookie: string): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const codeOf = (call: Call) => (call.body as { error?: { code?: string } }).error?.code;

async function cookieOf(user: Enrolled, organisationCode = world.organisations[0].code): Promise<string> {
  const known = cookies.get(user.id);
  if (known !== undefined) return known;
  clock.advance(30);
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshAddress(), origin: SYNTHETIC_ORIGIN },
    body: JSON.stringify({
      organisationCode,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret, 0, clock.now()),
    }),
  });
  expect(response.status).toBe(200);
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  cookies.set(user.id, cookie);
  return cookie;
}

/** A fresh authenticator code for a protected action (access-and-approvals 3.3). */
function freshCode(user: Enrolled): string {
  clock.advance(30);
  return codeFor(user.factorSecret, 0, clock.now());
}

async function rows<T extends object>(database: string, text: string, values: unknown[] = []): Promise<T[]> {
  const client = await connect(database, 'migration');
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

/** Stores a file as the user (Store a file, imports 13.1), answering the evidence it hands to a record. */
async function store(user: Enrolled, bytes: Buffer, originalName: string) {
  const stored = await post(
    '/api/files-imports/files',
    { sourceSystem: 'manual-upload', originalName, contentBase64: bytes.toString('base64') },
    await cookieOf(user),
  );
  expect(stored.status, JSON.stringify(stored.body)).toBe(200);
  const { storedFileId, receiptId } = stored.body as { storedFileId: string; receiptId: string };
  return { storedFileId, fileReceiptId: receiptId };
}

const readPath = (attachmentId: string) => `/api/files-imports/attachments/${attachmentId}/file`;
const downloadPath = (attachmentId: string) => `/api/files-imports/attachments/${attachmentId}/download`;

async function prepareRouting(body: Record<string, unknown>) {
  const prepared = await post(
    '/api/exceptions/routing',
    {
      escalation: { kind: 'user', userId: owner.id },
      dueRule: SYNTHETIC_DUE,
      validFrom: clock.now().toISOString().slice(0, 10),
      origin: 'synthetic',
      ...body,
    },
    await cookieOf(admin),
  );
  expect(prepared.status, JSON.stringify(prepared.body)).toBe(200);
  return prepared.body as { versionId: string; requestId: string; routingId: string };
}

async function decide(
  prepared: { versionId: string; requestId: string },
  extra: { evidence?: unknown; comment?: string } = {},
) {
  const cookie = await cookieOf(approver);
  return post(
    `/api/access/approval-requests/${prepared.requestId}/decision`,
    {
      versionId: prepared.versionId,
      outcome: 'approve',
      reason: { kind: 'listed', reasonId: approveReasonId },
      ...extra,
      totpCode: freshCode(approver),
    },
    cookie,
  );
}

async function approvedRouting(body: Record<string, unknown>) {
  const prepared = await prepareRouting(body);
  const decided = await decide(prepared);
  expect(decided.status, JSON.stringify(decided.body)).toBe(200);
}

async function raise(type: ExceptionTypeRegistration, siteId = SITE): Promise<string> {
  const documentId = await run((context) => writeTestDocument(context));
  const input: RaiseInput = {
    raisingEvent: `${TEST_EXCEPTIONS_MODULE}.evidence-test:${documentId}`,
    typeCode: type.code,
    facts: { siteId, storeId: null, businessUnitId: null, brandId: null },
    links: [{ module: TEST_EXCEPTIONS_MODULE, recordType: TEST_DOCUMENT_TYPE, recordId: documentId, versionId: null }],
    exposure: { kind: 'unknown' },
    raisedBy: { kind: 'user', id: ACTOR },
  };
  const raised = await run((context) => exceptions.raiseInOwnCommand(context, input));
  if (raised.kind !== 'done') throw new Error(raised.refusal.code);
  return raised.value.exceptionId;
}

const evidencePath = (exceptionId: string) => `/api/exceptions/exceptions/${exceptionId}/evidence`;

describe('evidence on an exception (access-and-approvals 12.1, 12.3; POL-03.05)', () => {
  let exceptionId = '';
  let attachmentId = '';
  const photo = jpeg('damaged carton');

  it('POL-03.05 PRD-EXC-001 the owner adds a photograph while it is open: an evidence event links the stored file', async () => {
    exceptionId = await raise(syntheticMismatch);
    const file = await store(owner, photo, 'SYNTHETIC-carton.jpg');
    const added = await post(evidencePath(exceptionId), { evidence: [file] }, await cookieOf(owner));
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const { attachmentIds } = added.body as { attachmentIds: string[] };
    expect(attachmentIds).toHaveLength(1);
    attachmentId = attachmentIds[0] ?? '';
    expect(added.body).toEqual({ exceptionId, state: 'Unresolved', attachmentIds: [attachmentId] });
    const view = exceptionViewSchema.parse(
      (await get(`/api/exceptions/exceptions/${exceptionId}`, await cookieOf(owner))).body,
    );
    expect(view.events.map((event) => [event.kind, event.attachmentId])).toEqual([
      ['raised', null],
      ['evidence', attachmentId],
    ]);
  });

  it('PRD-SEC-005 it opens from the record for an authorised reader, and the file matches its hash', async () => {
    for (const reader of [owner, plainReader]) {
      const read = await get(readPath(attachmentId), await cookieOf(reader));
      expect(read.status, JSON.stringify(read.body)).toBe(200);
      const file = attachedFileSchema.parse(read.body);
      expect(file.contentHash).toBe(sha256(photo));
      expect(Buffer.from(file.contentBase64, 'base64').equals(photo)).toBe(true);
      expect(file).toMatchObject({ format: 'jpeg', sizeBytes: photo.length, restrictedClasses: [] });
      expect(file.receipt.originalName).toBe('SYNTHETIC-carton.jpg');
    }
  });

  it('PRD-SEC-005 a reader without the record is refused and nothing is served', async () => {
    const read = await get(readPath(attachmentId), await cookieOf(outsider));
    expect(read.status).toBe(404);
    expect(codeOf(read)).toBe('files-imports.attachment-not-found');
    expect(JSON.stringify(read.body)).not.toContain(photo.toString('base64'));
    const added = await post(
      evidencePath(exceptionId),
      { evidence: [await store(outsider, jpeg('x'), 'x.jpg')] },
      await cookieOf(outsider),
    );
    // As for every action on an exception, edit is what it falls short of (12.4 "As built").
    expect(added.status).toBe(403);
    expect(
      await rows(databaseA, 'select 1 from files_imports.attachment where attached_by_id = $1', [outsider.id]),
    ).toEqual([]);
  });

  it('PRD-SEC-005 an owner with no grant on the exception’s type may act on it but not add evidence', async () => {
    const theirs = await raise(syntheticMismatch, SITE_NO_GRANT);
    const file = await store(ownerNoGrant, jpeg('no grant'), 'SYNTHETIC-no-grant.jpg');
    const added = await post(evidencePath(theirs), { evidence: [file] }, await cookieOf(ownerNoGrant));
    expect(added.status, JSON.stringify(added.body)).toBe(403);
    expect(added.body).toMatchObject({
      error: {
        code: 'access.not-authorised',
        missing: [{ kind: 'permission', recordType: 'exceptions.exception', action: 'view' }],
      },
    });
    expect(await rows(databaseA, `select 1 from files_imports.attachment where record_id = $1`, [theirs])).toEqual([]);
  });

  it('POL-03.05 a closed exception takes no evidence', async () => {
    const closedId = await raise(syntheticMismatch);
    const [link] = await rows<{ record_id: string }>(
      databaseA,
      'select record_id from exceptions.exception_link where exception_id = $1',
      [closedId],
    );
    await rows(databaseA, 'update test_exceptions.document set resolved = true where id = $1', [link?.record_id]);
    const cookie = await cookieOf(owner);
    expect((await post(`/api/exceptions/exceptions/${closedId}/close`, {}, cookie)).status).toBe(200);
    const added = await post(
      evidencePath(closedId),
      { evidence: [await store(owner, jpeg('late'), 'late.jpg')] },
      cookie,
    );
    expect(codeOf(added)).toBe('exceptions.not-open');
  });
});

describe('evidence that carries a restricted class (imports-and-opening-data 11; numbering-and-audit 5.1)', () => {
  let attachmentId = '';
  const photo = jpeg('cost sheet');
  const accessRecords = (userId: string) =>
    rows(
      databaseA,
      `select field_class, exposure, record_type from audit.access_record where kind = 'sensitive-access' and user_id = $1`,
      [userId],
    );

  it('PRD-ACS-008 a reader without a class the evidence carries is refused, nothing served and nothing recorded', async () => {
    const exceptionId = await raise(syntheticCostly);
    const added = await post(
      evidencePath(exceptionId),
      { evidence: [await store(owner, photo, 'SYNTHETIC-cost-sheet.jpg')] },
      await cookieOf(owner),
    );
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    attachmentId = (added.body as { attachmentIds: string[] }).attachmentIds[0] ?? '';
    const plain = await get(readPath(attachmentId), await cookieOf(plainReader));
    expect(plain.body).toMatchObject({
      error: { code: 'access.not-authorised', missing: [{ kind: 'field-class', fieldClass: 'cost' }] },
    });
    const plainCookie = await cookieOf(plainReader);
    const download = await post(downloadPath(attachmentId), { totpCode: freshCode(plainReader) }, plainCookie);
    expect(download.status).toBe(403);
    expect(download.body).toMatchObject({
      error: { code: 'access.not-authorised', missing: [{ kind: 'field-class', fieldClass: 'cost' }] },
    });
    expect(JSON.stringify(download.body)).not.toContain(photo.toString('base64'));
    expect(await accessRecords(plainReader.id)).toEqual([]);
  });

  it('PRD-SEC-007 a reader with the class downloads it with a fresh code, and an access record is written', async () => {
    const costCookie = await cookieOf(costReader);
    const download = await post(downloadPath(attachmentId), { totpCode: freshCode(costReader) }, costCookie);
    expect(download.status, JSON.stringify(download.body)).toBe(200);
    const file = attachedFileSchema.parse(download.body);
    expect(file.contentHash).toBe(sha256(photo));
    expect(file.restrictedClasses).toEqual(['cost']);
    expect(await accessRecords(costReader.id)).toEqual([
      { field_class: 'cost', exposure: 'exported', record_type: 'exceptions.exception' },
    ]);
  });
});

describe('evidence on an approval decision (access-and-approvals 9.5; PRD-ACS-010, POL-02.23)', () => {
  let attachmentId = '';
  let requestId = '';
  const scan = pdf('signed routing sheet');

  it('PRD-ACS-010 the approver attaches a PDF with the decision; it opens from the decision for an authorised reader', async () => {
    const prepared = await prepareRouting({
      typeCode: syntheticMismatch.code,
      siteId: uuidv7(),
      owner: { kind: 'user', userId: owner.id },
    });
    requestId = prepared.requestId;
    const file = await store(approver, scan, 'SYNTHETIC-routing-sheet.pdf');
    const decided = await decide(prepared, { evidence: [file] });
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    const view = approvalRequestViewSchema.parse(
      (await get(`/api/access/approval-requests/${requestId}`, await cookieOf(approver))).body,
    );
    expect(view.decision?.evidence).toHaveLength(1);
    attachmentId = view.decision?.evidence[0] ?? '';
    for (const reader of [approver, routingReader]) {
      const read = await get(readPath(attachmentId), await cookieOf(reader));
      expect(read.status, JSON.stringify(read.body)).toBe(200);
      const served = attachedFileSchema.parse(read.body);
      expect(served.contentHash).toBe(sha256(scan));
      expect(served).toMatchObject({ format: 'pdf', restrictedClasses: [] });
    }
    const [link] = await rows<Record<string, unknown>>(
      databaseA,
      'select record_module, record_type, record_id, record_version_id, evidences from files_imports.attachment where id = $1',
      [attachmentId],
    );
    expect(link).toEqual({
      record_module: 'exceptions',
      record_type: 'exceptions.exception_routing',
      record_id: prepared.routingId,
      record_version_id: prepared.versionId,
      evidences: 'access.approval-decision',
    });
  });

  it('PRD-SEC-005 a reader without the decided document’s record is refused and nothing is served', async () => {
    for (const reader of [outsider, plainReader]) {
      const read = await get(readPath(attachmentId), await cookieOf(reader));
      expect(read.status).toBe(404);
      expect(JSON.stringify(read.body)).not.toContain(scan.toString('base64'));
    }
  });

  it('PRD-INT-004 a decision that fails to commit leaves no link to its evidence', async () => {
    // A test-only trigger fails the decision's own insert, after its evidence is linked in the same transaction.
    await rows(
      databaseA,
      `create function public.syn_fail_decision() returns trigger language plpgsql as $$
       begin
         if new.comment = '${FAIL_MARKER}' then raise exception 'SYNTHETIC decision failure'; end if;
         return new;
       end $$;
       create trigger syn_fail_decision before insert on access.approval_decision
         for each row execute function public.syn_fail_decision();`,
    );
    try {
      const prepared = await prepareRouting({
        typeCode: syntheticMismatch.code,
        siteId: uuidv7(),
        owner: { kind: 'user', userId: owner.id },
      });
      const file = await store(approver, pdf('never linked'), 'SYNTHETIC-never-linked.pdf');
      const failed = await decide(prepared, { evidence: [file], comment: FAIL_MARKER });
      expect(failed.status).toBe(500);
      expect(
        await rows(databaseA, 'select 1 from files_imports.attachment where stored_file_id = $1', [file.storedFileId]),
      ).toEqual([]);
      expect(
        await rows(databaseA, 'select 1 from access.approval_decision where approval_request_id = $1', [
          prepared.requestId,
        ]),
      ).toEqual([]);
      const [request] = await rows<{ state: string }>(
        databaseA,
        'select state from access.approval_request where id = $1',
        [prepared.requestId],
      );
      expect(request?.state).toBe('Awaiting approval');
    } finally {
      await rows(
        databaseA,
        'drop trigger syn_fail_decision on access.approval_decision; drop function public.syn_fail_decision();',
      );
    }
  });

  it('PRD-ACS-020 a second Organisation is never served the other’s file', async () => {
    const cookie = await cookieOf(readerB, world.organisations[1].code);
    for (const id of [attachmentId]) {
      const read = await get(readPath(id), cookie);
      expect(read.status).toBe(404);
      const download = await post(downloadPath(id), { totpCode: freshCode(readerB) }, cookie);
      expect(download.status).toBe(404);
      expect(JSON.stringify(download.body)).not.toContain(scan.toString('base64'));
    }
    const [exceptionEvidence] = await rows<{ id: string }>(
      databaseA,
      `select id from files_imports.attachment where record_type = 'exceptions.exception' limit 1`,
    );
    const read = await get(readPath(exceptionEvidence?.id ?? ''), cookie);
    expect(read.status).toBe(404);
    expect(await rows(databaseB, 'select 1 from files_imports.attachment')).toEqual([]);
  });
});
