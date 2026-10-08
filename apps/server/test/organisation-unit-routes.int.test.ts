import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  attachedFileSchema,
  businessUnitMappingReadSchema,
  masterListsSchema,
  storedFileSchema,
  type PermissionAction,
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

// S1-F02-T02: business units, their mappings and the mappings' verification with evidence files, through the whole
// application on real PostgreSQL and MinIO (structure-and-masters 3.3, 3.4, 3.8, 8, 9 tests 1 and 16; README 7.1 exit
// check 1, mapping part; POL-10.08; GC2-2, DEC-105). An Admin prepares; a different person approves; an Accounts user
// who did not make a mapping verifies it, attaching a stored file. Every value here is SYNTHETIC.

const STRUCTURE = [
  'organisation.country',
  'organisation.state',
  'organisation.city',
  'organisation.area',
  'organisation.legal_entity',
  'organisation.tax_registration',
  'organisation.accounting_book',
  'organisation.site',
  'organisation.store',
  'organisation.business_unit',
  'organisation.business_unit_mapping',
];
const VERIFICATION = 'organisation.business_unit_mapping_verification';
const each = (actions: readonly PermissionAction[]): SyntheticAuthority[] =>
  STRUCTURE.flatMap((recordType) => actions.map((action) => ({ recordType, action })));
const VERIFY: SyntheticAuthority[] = [
  { recordType: 'organisation.business_unit_mapping', action: 'view' },
  { recordType: VERIFICATION, action: 'view' },
  { recordType: VERIFICATION, action: 'create' },
  { recordType: 'files_imports.stored_file', action: 'create' },
];

let world: SyntheticWorld;
let database: string;
let organisationCode: string;
let api: AccessTestApp;
let files: TestFileStore;
let keys: Record<string, string>;
let clock: SyntheticClock;
let approveReason: string;
const cookies = new Map<string, string>();
let admin: SyntheticUser;
let approver: SyntheticUser;
let accounts: SyntheticUser;

interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

interface PreparedAnswer {
  readonly recordId: string;
  readonly versionId: string;
  readonly requestId: string;
}

function freshCode(user: SyntheticUser): string {
  clock.advance(30);
  return codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now());
}

async function enrolled(label: string, authorities: readonly SyntheticAuthority[]): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(database, organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
    personas: ['P-ADM'],
  });
  await grantSynthetic(database, { kind: 'user', id: user.id }, authorities);
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.22' },
    body: JSON.stringify({ organisationCode, login: user.login, password: user.password, totpCode: freshCode(user) }),
  });
  expect(response.status).toBe(200);
  cookies.set(user.id, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
  return user;
}

async function post(user: SyntheticUser, path: string, body: unknown): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: SYNTHETIC_ORIGIN,
      cookie: cookies.get(user.id) ?? '',
      'idempotency-key': uuidv7(),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function get(user: SyntheticUser, path: string): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie: cookies.get(user.id) ?? '' } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function prepare(path: string, body: unknown): Promise<PreparedAnswer> {
  const call = await post(admin, path, body);
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return call.body as unknown as PreparedAnswer;
}

function decide(answer: PreparedAnswer): Promise<Call> {
  return post(approver, `/api/access/approval-requests/${answer.requestId}/decision`, {
    versionId: answer.versionId,
    outcome: 'approve',
    reason: { kind: 'listed', reasonId: approveReason },
    totpCode: freshCode(approver),
  });
}

async function approved(path: string, body: unknown): Promise<PreparedAnswer> {
  const answer = await prepare(path, body);
  const call = await decide(answer);
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return answer;
}

const today = () => clock.now().toISOString().slice(0, 10);
const code = (part: string) => syntheticCode(`${part}-${String(randomInt(1_000_000))}`);

let stateId = '';
let areaId = '';

/** A legal entity with a registration in the synthetic State and a book, approved from today. */
async function entity() {
  const legalEntity = await approved('/api/organisation/legal-entities', {
    code: code('LE'),
    legalName: syntheticName('Legal entity'),
    validFrom: today(),
  });
  const registration = await approved('/api/organisation/tax-registrations', {
    code: code('GSTIN'),
    legalEntityId: legalEntity.recordId,
    registrationNumber: `0${String(randomInt(1_000_000))}SYNTHETIC`,
    stateId,
    validityFrom: today(),
    validFrom: today(),
  });
  const book = await approved('/api/organisation/accounting-books', {
    code: code('BK'),
    legalEntityId: legalEntity.recordId,
    name: syntheticName('Book'),
    validFrom: today(),
  });
  return {
    legalEntityId: legalEntity.recordId,
    taxRegistrationId: registration.recordId,
    accountingBookId: book.recordId,
  };
}

const site = () =>
  approved('/api/organisation/sites', {
    code: code('SITE'),
    name: syntheticName('Site'),
    physicalKind: 'central-warehouse',
    areaId,
    addresses: [syntheticName('Address')],
    aliases: [],
    validFrom: today(),
  });

const unitBody = (siteId: string, mapping: Awaited<ReturnType<typeof entity>>, kind = 'warehouse') => ({
  code: code('BU'),
  siteId,
  kind,
  name: syntheticName('Unit'),
  ...mapping,
  validFrom: today(),
});

/** Stores a SYNTHETIC PDF as the user and answers what Store a file answered. */
async function storedPdf(user: SyntheticUser, label: string) {
  const bytes = Buffer.from(`%PDF-1.4\n% SYNTHETIC mapping evidence ${label}\n%%EOF\n`, 'latin1');
  const call = await post(user, '/api/files-imports/files', {
    sourceSystem: 'manual-upload',
    originalName: `SYNTHETIC-${label}.pdf`,
    contentBase64: bytes.toString('base64'),
  });
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return storedFileSchema.parse(call.body);
}

/** The mapping version of a unit in force today, read through its route. */
async function mappingOf(unitId: string, user: SyntheticUser = accounts) {
  const call = await get(user, `/api/organisation/business-unit-mappings/${unitId}`);
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return businessUnitMappingReadSchema.parse(call.body).record;
}

const verify = (user: SyntheticUser, unitId: string, versionId: string, evidence: unknown[]) =>
  post(user, `/api/organisation/business-unit-mappings/${unitId}/versions/${versionId}/verification`, { evidence });

beforeAll(async () => {
  world = await createSyntheticOrganisations('unitroutes');
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
  clock = new SyntheticClock();
  files = await startTestFileStore();
  api = await startAccessApp(world, keys, { clock, fileStoreEnvironment: files.environment });
  admin = await enrolled('UNIT-ADMIN', each(['view', 'create', 'edit']));
  approver = await enrolled('UNIT-APPROVER', each(['view', 'approve']));
  accounts = await enrolled('UNIT-ACCOUNTS', VERIFY);
  const country = await approved('/api/organisation/countries', {
    code: code('IN'),
    name: syntheticName('Country'),
    validFrom: today(),
  });
  stateId = (
    await approved('/api/organisation/states', {
      countryId: country.recordId,
      code: code('ST'),
      name: syntheticName('State'),
      validFrom: today(),
    })
  ).recordId;
  const city = await approved('/api/organisation/cities', {
    stateId,
    code: code('CT'),
    name: syntheticName('City'),
    validFrom: today(),
  });
  areaId = (
    await approved('/api/organisation/areas', {
      cityId: city.recordId,
      code: code('AR'),
      name: syntheticName('Area'),
      validFrom: today(),
    })
  ).recordId;
}, 300_000);

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (files as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('verified mappings (structure-and-masters 3.4, 3.8; POL-10.08)', () => {
  it('README 7.1 exit check 1 PRD-ORG-005 two units at one Site mapped to different books and registrations; one verified with its evidence file by a person who did not make it', async () => {
    const at = await site();
    const first = await entity();
    const second = await entity();
    const unitA = await approved('/api/organisation/business-units', unitBody(at.recordId, first));
    const unitB = await approved('/api/organisation/business-units', unitBody(at.recordId, second, 'office'));
    const mappingA = await mappingOf(unitA.recordId);
    const version = mappingA.versions[0];
    expect(version).toMatchObject({ state: 'In force', ...first });
    expect(version?.verification).toBeUndefined();
    expect((await mappingOf(unitB.recordId)).versions[0]).toMatchObject({ state: 'In force', ...second });
    if (version === undefined) throw new Error('no mapping');
    // An Accounts user who did not make the mapping verifies it, attaching a stored file (S1-F06-T05).
    const evidence = await storedPdf(accounts, 'mapping-a');
    const verified = await verify(accounts, unitA.recordId, version.id, [
      { storedFileId: evidence.storedFileId, fileReceiptId: evidence.receiptId },
    ]);
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    const after = (await mappingOf(unitA.recordId)).versions[0];
    expect(after?.verification).toMatchObject({ verifiedByUserId: accounts.id });
    const attachmentId = after?.verification?.attachmentIds[0] ?? '';
    // The evidence is read through the verification it is attached to.
    const file = await get(accounts, `/api/files-imports/attachments/${attachmentId}/file`);
    expect(file.status, JSON.stringify(file.body)).toBe(200);
    expect(attachedFileSchema.parse(file.body).receipt.originalName).toBe('SYNTHETIC-mapping-a.pdf');
    // The master lists show each mapping with its verification state.
    const lists = masterListsSchema.parse((await get(admin, `/api/organisation/master-lists?date=${today()}`)).body);
    expect(lists.businessUnits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: unitA.recordId, kind: 'warehouse', siteId: at.recordId }),
        expect.objectContaining({ id: unitB.recordId, kind: 'office', siteId: at.recordId }),
      ]),
    );
    expect(lists.businessUnitMappings.find((each) => each.id === unitA.recordId)?.verification?.id).toBe(
      (verified.body as { verificationId: string }).verificationId,
    );
    expect(lists.businessUnitMappings.find((each) => each.id === unitB.recordId)?.verification).toBeUndefined();
    // A version has one verification.
    expect(
      (
        await verify(accounts, unitA.recordId, version.id, [
          { storedFileId: evidence.storedFileId, fileReceiptId: evidence.receiptId },
        ])
      ).body,
    ).toMatchObject({ error: { code: 'organisation.mapping-already-verified' } });
  });

  it('structure-and-masters 9 test 16 GC2-2 a mapping verified by the person who made it, or by someone without the verify permission, is refused', async () => {
    const at = await site();
    const mapping = await entity();
    const unit = await approved('/api/organisation/business-units', unitBody(at.recordId, mapping));
    const version = (await mappingOf(unit.recordId)).versions[0];
    if (version === undefined) throw new Error('no mapping');
    // The maker holds the verify permission too, so only the rule refuses it (GC2-2, DEC-105).
    await grantSynthetic(database, { kind: 'user', id: admin.id }, VERIFY);
    const own = await storedPdf(admin, 'by-maker');
    expect(
      (
        await verify(admin, unit.recordId, version.id, [
          { storedFileId: own.storedFileId, fileReceiptId: own.receiptId },
        ])
      ).body,
    ).toMatchObject({ error: { kind: 'refused', code: 'organisation.verifier-made-mapping' } });
    // A person without the verify permission is refused by Authorise, the permission named (PRD-UXP-003).
    const viewer = await enrolled('UNIT-VIEWER', [
      { recordType: 'organisation.business_unit_mapping', action: 'view' },
      { recordType: 'files_imports.stored_file', action: 'create' },
    ]);
    const theirs = await storedPdf(viewer, 'by-viewer');
    const refused = await verify(viewer, unit.recordId, version.id, [
      { storedFileId: theirs.storedFileId, fileReceiptId: theirs.receiptId },
    ]);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({
      error: {
        code: 'access.not-authorised',
        missing: [expect.objectContaining({ recordType: VERIFICATION, action: 'create' })],
      },
    });
    // A mapping version awaiting approval is not verified yet.
    const pending = await prepare(`/api/organisation/business-unit-mappings/${unit.recordId}/versions`, {
      ...mapping,
      validFrom: today(),
    });
    const evidence = await storedPdf(accounts, 'pending');
    expect(
      (
        await verify(accounts, unit.recordId, pending.versionId, [
          { storedFileId: evidence.storedFileId, fileReceiptId: evidence.receiptId },
        ])
      ).body,
    ).toMatchObject({ error: { code: 'organisation.mapping-not-approved' } });
  });

  it('PRD-UXP-003 PRD-ORG-020 a mapping mismatch is refused with its reason named', async () => {
    const at = await site();
    const mine = await entity();
    const theirs = await entity();
    const call = await post(admin, '/api/organisation/business-units', {
      ...unitBody(at.recordId, mine),
      accountingBookId: theirs.accountingBookId,
    });
    expect(call.body).toMatchObject({
      error: {
        kind: 'refused',
        code: 'organisation.mapping-legal-entity-mismatch',
        missing: [{ kind: 'record', recordType: 'organisation.accounting_book', recordId: theirs.accountingBookId }],
      },
    });
  });
});
