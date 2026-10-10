import { createHash, randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  accountReadSchema,
  attachedFileSchema,
  bookSettingListSchema,
  costSettingReadSchema,
  periodListSchema,
  postingMapListSchema,
  storedFileSchema,
  trialBalanceSchema,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
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
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F09-T01: the books part's routes through the whole application, on real PostgreSQL and MinIO (books-and-posting
// 2.2, 3.1, 6.3, 9.1; POL-09.01; DEC-112, GC4-2; S1-F06-T05): an account and a cost setting prepared by one Accounts
// user, the CA's approval evidence stored as a file and attached to both versions, which opens from each for an
// authorised reader, and a different Accounts user's decisions putting both in force. Every value here is SYNTHETIC.

let world: SyntheticWorld;
let database: string;
let organisationCode: string;
let api: AccessTestApp;
let minio: TestFileStore;
let clock: SyntheticClock;
let keys: Record<string, string>;
let approveReason: string;
let bookId: string;
const cookies = new Map<string, string>();
let preparer: SyntheticUser;
let approver: SyntheticUser;
let reader: SyntheticUser;
let outsider: SyntheticUser;

interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function freshCode(user: SyntheticUser): string {
  clock.advance(30);
  return codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now());
}

async function enrolled(label: string, authorities: readonly SyntheticAuthority[]): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(database, organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
    personas: ['P-ACC'],
  });
  await grantSynthetic(database, { kind: 'user', id: user.id }, authorities);
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.51' },
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

const today = () => clock.now().toISOString().slice(0, 10);
const decide = (by: SyntheticUser, requestId: string, versionId: string) =>
  post(by, `/api/access/approval-requests/${requestId}/decision`, {
    versionId,
    outcome: 'approve',
    reason: { kind: 'listed', reasonId: approveReason },
    totpCode: freshCode(by),
  });

/** A SYNTHETIC legal entity and book, written as the migration role, as a fixture (code-house-rules 11.2). */
async function writeSyntheticBook(): Promise<string> {
  const client = await connect(database, 'migration');
  const legalEntityId = uuidv7();
  const id = uuidv7();
  try {
    await client.query('insert into organisation.legal_entity (id, code) values ($1, $2)', [
      legalEntityId,
      syntheticCode(`LE-${String(randomInt(1_000_000))}`),
    ]);
    await client.query('insert into organisation.accounting_book (id, code, legal_entity_id) values ($1, $2, $3)', [
      id,
      syntheticCode(`BK-${String(randomInt(1_000_000))}`),
      legalEntityId,
    ]);
  } finally {
    await client.end();
  }
  return id;
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('booksroutes');
  database = world.organisations[0].database;
  organisationCode = world.organisations[0].code;
  await writeSyntheticSetting(database, 'access.sign-in-throttling', { failureLimit: 50, windowSeconds: 600 });
  await writeSyntheticSetting(database, 'access.password-rules', { minimumLength: 12 });
  await writeSyntheticSetting(database, 'access.office-session-limits', {
    idleLockSeconds: 1800,
    absoluteSeconds: 28800,
  });
  keys = syntheticKeysEnvironment(world);
  approveReason = await writeSyntheticReason(database, 'approve');
  minio = await startTestFileStore();
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, {
    clock,
    fileStoreEnvironment: minio.environment,
    // A SYNTHETIC posting event kind for the posting routes (books-and-posting 7.1; S1-F09-T02).
    postingEventKinds: [{ kind: 'test-synthetic.value-in', components: ['to-pool'], reversalKind: null, liveStage: 1 }],
  });
  bookId = await writeSyntheticBook();
  preparer = await enrolled('BOOKS-PREPARER', [
    { recordType: 'finance.account', action: 'view' },
    { recordType: 'finance.account', action: 'create' },
    { recordType: 'finance.account', action: 'edit' },
    { recordType: 'finance.book_setting', action: 'view' },
    { recordType: 'finance.book_setting', action: 'edit' },
    { recordType: 'finance.ca_approval_evidence', action: 'create' },
    { recordType: 'files_imports.stored_file', action: 'create' },
    // The posting half (S1-F09-T02).
    { recordType: 'finance.posting_map', action: 'view' },
    { recordType: 'finance.posting_map', action: 'edit' },
    { recordType: 'finance.financial_period', action: 'view' },
    { recordType: 'finance.financial_period', action: 'create' },
    { recordType: 'finance.journal', action: 'view' },
  ]);
  approver = await enrolled('BOOKS-APPROVER', [
    { recordType: 'finance.account', action: 'view' },
    { recordType: 'finance.account', action: 'approve' },
    { recordType: 'finance.book_setting', action: 'view' },
    { recordType: 'finance.book_setting', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
  ]);
  reader = await enrolled('BOOKS-READER', [
    { recordType: 'finance.account', action: 'view' },
    { recordType: 'finance.book_setting', action: 'view' },
  ]);
  outsider = await enrolled('BOOKS-OUTSIDER', [{ recordType: 'merchandise.party', action: 'view' }]);
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('accounts and settings through the routes, with the CA evidence as a file (books-and-posting 6.3)', () => {
  const bytes = Buffer.from('%PDF-1.4\n% SYNTHETIC CA approval\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
  let accountId: string;
  let accountVersionId: string;
  let accountRequestId: string;
  let costVersionId: string;
  let costRequestId: string;

  beforeAll(async () => {
    const account = await post(preparer, '/api/finance/accounts', {
      bookId,
      code: syntheticCode('INV'),
      nature: 'asset',
      name: syntheticName('Stock in cost pools'),
      validFrom: today(),
    });
    expect(account.status, JSON.stringify(account.body)).toBe(200);
    accountId = account.body.recordId as string;
    accountVersionId = account.body.versionId as string;
    accountRequestId = account.body.requestId as string;
    const cost = await post(preparer, `/api/finance/books/${bookId}/settings`, {
      kind: 'cost',
      formula: 'moving-average',
      poolMode: 'book',
      origin: 'synthetic',
      validFrom: today(),
    });
    expect(cost.status, JSON.stringify(cost.body)).toBe(200);
    costVersionId = cost.body.versionId as string;
    costRequestId = cost.body.requestId as string;
  });

  it('PRD-SEC-017 reads the cost setting as not set until a version is approved', async () => {
    const read = await get(reader, `/api/finance/books/${bookId}/cost-setting?date=${today()}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(costSettingReadSchema.parse(read.body).setting).toEqual({ kind: 'not-set' });
  });

  it('POL-09.01 refuses the decision while no CA evidence covers the version', async () => {
    const refused = await decide(approver, accountRequestId, accountVersionId);
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ error: { code: 'finance.no-ca-evidence' } });
  });

  it('POL-09.01 S1-F06-T05 one CA evidence file attached to a set of versions opens from each for an authorised reader', async () => {
    const stored = await post(preparer, '/api/files-imports/files', {
      sourceSystem: 'manual-upload',
      originalName: 'SYNTHETIC-ca-approval.pdf',
      contentBase64: bytes.toString('base64'),
    });
    expect(stored.status, JSON.stringify(stored.body)).toBe(200);
    const file = storedFileSchema.parse(stored.body);
    const recorded = await post(preparer, '/api/finance/ca-approval-evidence', {
      versions: [
        { recordType: 'finance.account', versionId: accountVersionId },
        { recordType: 'finance.book_setting', versionId: costVersionId },
      ],
      evidence: { kind: 'file', file: { storedFileId: file.storedFileId, fileReceiptId: file.receiptId } },
    });
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(200);
    const account = accountReadSchema.parse((await get(reader, `/api/finance/accounts/${accountId}`)).body);
    const settings = bookSettingListSchema.parse((await get(reader, `/api/finance/books/${bookId}/settings`)).body);
    const attachments = [account.record.versions[0]?.caEvidence[0], settings.records[0]?.versions[0]?.caEvidence[0]];
    expect(attachments.map((each) => each?.kind)).toEqual(['file', 'file']);
    for (const each of attachments) {
      const attachmentId = each?.kind === 'file' ? each.attachmentId : '';
      const opened = await get(reader, `/api/files-imports/attachments/${attachmentId}/file`);
      expect(opened.status, JSON.stringify(opened.body)).toBe(200);
      const read = attachedFileSchema.parse(opened.body);
      expect(read.contentHash).toBe(createHash('sha256').update(bytes).digest('hex'));
      // A reader with no view on the books' records does not reach it (PRD-SEC-005).
      expect((await get(outsider, `/api/files-imports/attachments/${attachmentId}/file`)).status).toBe(404);
    }
  });

  it('POL-09.01 a different Accounts user’s decision then puts each version in force', async () => {
    expect((await decide(approver, accountRequestId, accountVersionId)).status).toBe(200);
    expect((await decide(approver, costRequestId, costVersionId)).status).toBe(200);
    const read = costSettingReadSchema.parse(
      (await get(reader, `/api/finance/books/${bookId}/cost-setting?date=${today()}`)).body,
    );
    expect(read.setting).toMatchObject({ kind: 'set', versionId: costVersionId, formula: 'moving-average' });
    const account = accountReadSchema.parse((await get(reader, `/api/finance/accounts/${accountId}`)).body);
    expect(account.record.versions[0]?.state).toBe('In force');
  });
});

describe('periods, posting maps and the trial balance through the routes (books-and-posting 4.1, 6, 12; S1-F09-T02)', () => {
  it('PRD-LED-001 defines a period, prepares a map version and reads the trial balance, labelled internal', async () => {
    const period = await post(preparer, `/api/finance/books/${bookId}/periods`, {
      code: syntheticCode('P1'),
      financialYear: syntheticCode('FY'),
      firstDay: today(),
      lastDay: today(),
    });
    expect(period.status, JSON.stringify(period.body)).toBe(200);
    const periods = periodListSchema.parse((await get(preparer, `/api/finance/books/${bookId}/periods`)).body);
    expect(periods.records.map((each) => [each.code, each.state])).toEqual([[syntheticCode('P1'), 'Open']]);
    const accounts = (await get(preparer, `/api/finance/books/${bookId}/accounts`)).body.records as { id: string }[];
    const accountId = accounts[0]?.id ?? '';
    const map = await post(preparer, '/api/finance/posting-maps', {
      bookId,
      eventKind: 'test-synthetic.value-in',
      origin: 'synthetic',
      validFrom: today(),
      lines: [
        { component: 'to-pool', side: 'debit', accountId, requiresStore: false, requiresBrand: false },
        { component: 'to-pool', side: 'credit', accountId, requiresStore: false, requiresBrand: false },
      ],
    });
    expect(map.status, JSON.stringify(map.body)).toBe(200);
    const maps = postingMapListSchema.parse(
      (await get(preparer, `/api/finance/books/${bookId}/posting-maps?on=${today()}`)).body,
    );
    expect(maps.eventKinds.map((each) => each.kind)).toEqual(['test-synthetic.value-in']);
    expect(maps.records[0]?.versions[0]?.state).toBe('Awaiting approval');
    // POL-09.12: a kind no module declares is refused.
    const strange = await post(preparer, '/api/finance/posting-maps', {
      bookId,
      eventKind: 'test-synthetic.unknown',
      origin: 'synthetic',
      validFrom: today(),
      lines: [{ component: 'to-pool', side: 'debit', accountId, requiresStore: false, requiresBrand: false }],
    });
    expect(strange.body).toMatchObject({ error: { code: 'finance.event-kind-not-declared' } });
    const periodId = periods.records[0]?.id ?? '';
    const read = await get(preparer, `/api/finance/books/${bookId}/trial-balance?periodId=${periodId}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    const balance = trialBalanceSchema.parse(read.body);
    expect(balance).toMatchObject({ ledger: 'internal', partial: false, totals: { debitPaise: 0, creditPaise: 0 } });
    // A reader with no view on journals is refused (PRD-SEC-005).
    expect((await get(reader, `/api/finance/books/${bookId}/trial-balance?periodId=${periodId}`)).status).toBe(403);
  });
});
