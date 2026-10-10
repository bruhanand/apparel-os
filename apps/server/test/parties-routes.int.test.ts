import { createHash, randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  agreementReadSchema,
  attachedFileSchema,
  bankDetailsShownSchema,
  partyReadSchema,
  storedFileSchema,
  termsInForceSchema,
  type AgreementTerms,
  type FieldClass,
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

// S1-F03-T03: the parties part's routes through the whole application, on real PostgreSQL and MinIO
// (structure-and-masters 5, 8; access-and-approvals 3.3, 6, 15 test 23; numbering-and-audit 5.1; code-house-rules 12.4,
// 12.6; DEC-114): a supplier's bank-detail change prepared with a fresh code, approved by a different person, masked in
// every read and shown only through the protected Show, once; margins masked without their class; the signed agreement
// opened from its agreement. Every value here is SYNTHETIC: no bank detail, term or margin is KDPS's.

const BANK = {
  accountHolder: 'SYNTHETIC Route Holder 77',
  accountNumber: 'SYN770011223344',
  ifsc: 'SYNR0000777',
  bankName: 'SYNTHETIC Route Bank',
};
const MARGIN = 'SYNTHETIC margin twelve point five';

const UNKNOWN_TERMS: AgreementTerms = {
  commercialModel: null,
  defaultModel: null,
  ownershipEvent: null,
  returnRights: { allowed: null, window: null, startsAt: null },
  returnConditions: {
    conditionTags: null,
    packagingLimits: null,
    quantityLimits: null,
    supplierApproval: null,
    freightAndDeductions: null,
    settlement: null,
  },
  commissions: null,
  paymentTerms: null,
  creditNoteTerms: null,
  promotionTerms: null,
  cashDiscount: { rate: null, days: null, from: null },
  interest: { rate: null, days: null, from: null },
};

let world: SyntheticWorld;
let database: string;
let organisationCode: string;
let api: AccessTestApp;
let minio: TestFileStore;
let keys: Record<string, string>;
let clock: SyntheticClock;
let approveReason: string;
const cookies = new Map<string, string>();
let preparer: SyntheticUser;
let approver: SyntheticUser;
let bankReader: SyntheticUser;
let plainReader: SyntheticUser;

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
  fieldClasses: readonly { fieldClass: FieldClass; access: 'view' | 'view-and-edit' }[] = [],
): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(database, organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
    personas: ['P-BKG'],
  });
  await grantSynthetic(database, { kind: 'user', id: user.id }, authorities, { fieldClasses });
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.41' },
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
const code = (part: string) => syntheticCode(`${part}-${String(randomInt(1_000_000))}`);
const decide = (by: SyntheticUser, requestId: string, versionId: string, totpCode: string | null = freshCode(by)) =>
  post(by, `/api/access/approval-requests/${requestId}/decision`, {
    versionId,
    outcome: 'approve',
    reason: { kind: 'listed', reasonId: approveReason },
    ...(totpCode === null ? {} : { totpCode }),
  });

/** Decide refuses a decision with a wrong fresh code, or none (PRD-SEC-001; access-and-approvals 3.3, 9.5). */
async function refusesWithoutFreshCode(requestId: string, versionId: string): Promise<void> {
  const wrong = await decide(approver, requestId, versionId, '000000');
  expect(wrong.status).toBe(403);
  expect(wrong.body).toMatchObject({ error: { code: 'access.authenticator-code-refused' } });
  const none = await decide(approver, requestId, versionId, null);
  expect(none.status).toBe(400);
  expect(none.body).toMatchObject({ error: { code: 'kernel.invalid-request' } });
}

async function newSupplier(): Promise<string> {
  const made = await post(preparer, '/api/merchandise/parties', {
    code: code('SUPPLIER'),
    legalName: syntheticName('Route supplier'),
    taxIdentities: [],
    msmeClassification: null,
    contacts: [],
    roles: ['supplier'],
    validFrom: today(),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  return made.body.recordId as string;
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('partyroutes');
  database = world.organisations[0].database;
  organisationCode = world.organisations[0].code;
  keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(database, 'access.sign-in-throttling', { failureLimit: 50, windowSeconds: 600 });
  await writeSyntheticSetting(database, 'access.password-rules', { minimumLength: 12 });
  await writeSyntheticSetting(database, 'access.office-session-limits', {
    idleLockSeconds: 1800,
    absoluteSeconds: 28800,
  });
  approveReason = await writeSyntheticReason(database, 'approve');
  minio = await startTestFileStore();
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock, fileStoreEnvironment: minio.environment });
  preparer = await enrolled(
    'PARTY-PREPARER',
    [
      { recordType: 'merchandise.party', action: 'view' },
      { recordType: 'merchandise.party', action: 'create' },
      { recordType: 'merchandise.party', action: 'edit' },
      { recordType: 'merchandise.party_bank_details', action: 'view' },
      { recordType: 'merchandise.party_bank_details', action: 'edit' },
      { recordType: 'merchandise.party_bank_details', action: 'approve' },
      { recordType: 'merchandise.agreement', action: 'view' },
      { recordType: 'merchandise.agreement', action: 'create' },
      { recordType: 'merchandise.agreement', action: 'edit' },
      { recordType: 'files_imports.stored_file', action: 'create' },
      { recordType: 'access.approval_request', action: 'view' },
    ],
    [
      { fieldClass: 'bank-details', access: 'view-and-edit' },
      { fieldClass: 'margin', access: 'view-and-edit' },
    ],
  );
  approver = await enrolled('PARTY-APPROVER', [
    { recordType: 'merchandise.party', action: 'view' },
    { recordType: 'merchandise.party_bank_details', action: 'view' },
    { recordType: 'merchandise.party_bank_details', action: 'approve' },
    { recordType: 'merchandise.agreement', action: 'view' },
    { recordType: 'merchandise.agreement', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
  ]);
  bankReader = await enrolled(
    'PARTY-BANK-READER',
    [
      { recordType: 'merchandise.party', action: 'view' },
      { recordType: 'merchandise.party_bank_details', action: 'view' },
    ],
    [{ fieldClass: 'bank-details', access: 'view' }],
  );
  plainReader = await enrolled('PARTY-PLAIN-READER', [
    { recordType: 'merchandise.party', action: 'view' },
    { recordType: 'merchandise.party_bank_details', action: 'view' },
    { recordType: 'merchandise.agreement', action: 'view' },
  ]);
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('bank details through the routes (structure-and-masters 5.1; access-and-approvals 3.3, 6; DEC-114)', () => {
  let partyId: string;
  let versionId: string;

  beforeAll(async () => {
    partyId = await newSupplier();
  });

  it('PRD-SEC-001 a bank-detail change asks for a fresh code, and waits for a different authorised person', async () => {
    const path = `/api/merchandise/parties/${partyId}/bank-details`;
    const wrong = await post(preparer, path, { ...BANK, validFrom: today(), totpCode: '000000' });
    expect(wrong.status).toBe(403);
    expect(wrong.body).toMatchObject({ error: { code: 'access.authenticator-code-refused' } });
    const made = await post(preparer, path, { ...BANK, validFrom: today(), totpCode: freshCode(preparer) });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    versionId = made.body.versionId as string;
    const own = await decide(preparer, made.body.requestId as string, versionId);
    expect(own.body).toMatchObject({ error: { code: 'access.self-preparation' } });
    await refusesWithoutFreshCode(made.body.requestId as string, versionId);
    const approved = await decide(approver, made.body.requestId as string, versionId);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const read = partyReadSchema.parse((await get(plainReader, `/api/merchandise/parties/${partyId}`)).body);
    expect(read.record.bankDetails.versions).toEqual([expect.objectContaining({ state: 'In force', masked: true })]);
  });

  it('PRD-ACS-008 refuses Show to a reader without the field grant, naming the class', async () => {
    const refused = await post(plainReader, `/api/merchandise/parties/${partyId}/bank-details/${versionId}/show`, {
      totpCode: freshCode(plainReader),
    });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({
      error: { code: 'access.not-authorised', missing: [{ kind: 'field-class', fieldClass: 'bank-details' }] },
    });
  });

  it('PRD-SEC-007 DEC-114 shows them unmasked after a fresh code, writes an access record, and refuses the replay', async () => {
    const path = `/api/merchandise/parties/${partyId}/bank-details/${versionId}/show`;
    const key = uuidv7();
    const body = { totpCode: freshCode(bankReader) };
    const shown = await post(bankReader, path, body, key);
    expect(shown.status, JSON.stringify(shown.body)).toBe(200);
    expect(bankDetailsShownSchema.parse(shown.body)).toEqual({ partyId, versionId, ...BANK });
    const replay = await post(bankReader, path, body, key);
    expect(replay.status).toBe(409);
    expect(replay.body).toMatchObject({ error: { code: 'kernel.answer-not-repeatable' } });
    const client = await connect(database, 'migration');
    try {
      const records = await client.query<{ exposure: string; field_class: string }>(
        `select exposure, field_class from audit.access_record
         where kind = 'sensitive-access' and user_id = $1 and record_id = $2`,
        [bankReader.id, partyId],
      );
      expect(records.rows).toEqual([{ exposure: 'shown', field_class: 'bank-details' }]);
    } finally {
      await client.end();
    }
  });

  it('PRD-SEC-006 PRD-SEC-014 no bank value in any log or live update, and no encrypted value in any audit record (test 23)', async () => {
    const values = Object.values(BANK);
    const logs = api.logText();
    for (const value of values) expect(logs).not.toContain(value);
    const client = await connect(database, 'migration');
    try {
      const sealed = (
        await client.query<{ sealed: string }>('select sealed from merchandise.party_bank_details where id = $1', [
          versionId,
        ])
      ).rows[0]?.sealed;
      expect(sealed).toBeDefined();
      // Live updates carry the outbox events' identifiers (code-house-rules 12.8, 12.12).
      const events = await client.query<{ row: string }>('select to_jsonb(e)::text as row from kernel.outbox_event e');
      const audits = await client.query<{ row: string }>('select to_jsonb(a)::text as row from audit.audit_record a');
      const access = await client.query<{ row: string }>('select to_jsonb(a)::text as row from audit.access_record a');
      const kept = await client.query<{ row: string }>(
        'select to_jsonb(r)::text as row from kernel.idempotency_result r',
      );
      for (const row of [...events.rows, ...audits.rows, ...access.rows, ...kept.rows]) {
        for (const value of values) expect(row.row).not.toContain(value);
        expect(row.row).not.toContain(sealed);
      }
    } finally {
      await client.end();
    }
  });
});

describe('agreements through the routes (structure-and-masters 5.2; PRD-ACS-008; S1-F06-T05)', () => {
  let agreementId: string;
  let attachmentId: string;
  const bytes = Buffer.from('%PDF-1.4\n% SYNTHETIC signed agreement\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');

  beforeAll(async () => {
    const partyId = await newSupplier();
    const stored = await post(preparer, '/api/files-imports/files', {
      sourceSystem: 'manual-upload',
      originalName: 'SYNTHETIC-signed-agreement.pdf',
      contentBase64: bytes.toString('base64'),
    });
    expect(stored.status, JSON.stringify(stored.body)).toBe(200);
    const file = storedFileSchema.parse(stored.body);
    const made = await post(preparer, '/api/merchandise/agreements', {
      code: code('AGR'),
      counterparty: { kind: 'supplier', partyId },
      terms: { ...UNKNOWN_TERMS, commercialModel: 'outright' },
      margins: MARGIN,
      signedAgreement: [{ storedFileId: file.storedFileId, fileReceiptId: file.receiptId }],
      validFrom: today(),
    });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    agreementId = made.body.recordId as string;
    await refusesWithoutFreshCode(made.body.requestId as string, made.body.versionId as string);
    expect((await decide(approver, made.body.requestId as string, made.body.versionId as string)).status).toBe(200);
    const read = agreementReadSchema.parse((await get(preparer, `/api/merchandise/agreements/${agreementId}`)).body);
    attachmentId = read.record.versions[0]?.signedAgreement[0] ?? '';
    const terms = termsInForceSchema.parse(
      (await get(preparer, `/api/merchandise/agreement-terms?partyId=${partyId}&date=${today()}`)).body,
    );
    expect(terms).toMatchObject({ agreementId, terms: { commercialModel: 'outright' }, margins: { kind: 'shown' } });
  });

  it('PRD-ACS-008 shows margins only with their field grant, and masks them otherwise', async () => {
    const shown = agreementReadSchema.parse((await get(preparer, `/api/merchandise/agreements/${agreementId}`)).body);
    expect(shown.record.versions[0]?.margins).toEqual({ kind: 'shown', value: MARGIN });
    const masked = agreementReadSchema.parse(
      (await get(plainReader, `/api/merchandise/agreements/${agreementId}`)).body,
    );
    expect(masked.record.versions[0]?.margins).toEqual({ kind: 'masked' });
    expect(JSON.stringify(masked)).not.toContain(MARGIN);
  });

  it('PRD-ORG-016 opens the signed agreement from the agreement for an authorised reader, matching its hash', async () => {
    const download = `/api/files-imports/attachments/${attachmentId}/download`;
    const opened = await post(preparer, download, { totpCode: freshCode(preparer) });
    expect(opened.status, JSON.stringify(opened.body)).toBe(200);
    const file = attachedFileSchema.parse(opened.body);
    expect(file.restrictedClasses).toEqual(['margin']);
    expect(file.contentHash).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(Buffer.from(file.contentBase64, 'base64').equals(bytes)).toBe(true);
  });

  it('PRD-SEC-005 refuses a reader without the agreement, or without the margin class it carries', async () => {
    const download = `/api/files-imports/attachments/${attachmentId}/download`;
    // Without margin, the reader holds view on agreements but not the class the file carries.
    const noClass = await post(plainReader, download, { totpCode: freshCode(plainReader) });
    expect(noClass.status).toBe(403);
    expect(noClass.body).toMatchObject({ error: { missing: [{ kind: 'field-class', fieldClass: 'margin' }] } });
    // Without the agreement at all, the attachment is not there to read.
    const noAgreement = await post(bankReader, download, { totpCode: freshCode(bankReader) });
    expect(noAgreement.status).toBe(404);
  });
});
