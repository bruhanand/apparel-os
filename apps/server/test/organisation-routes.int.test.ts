import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  MASTER_PAGE_CAP,
  masterListsSchema,
  siteListSchema,
  siteReadSchema,
  storeListSchema,
  storeReadSchema,
  type AssignmentScope,
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
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';

// S1-F02-T01: the routes of the organisation structure through the whole application (structure-and-masters 2.3, 3.8,
// 8; module-map 4.11, 6.2 flow A; code-house-rules 12.1, 12.3): preparing masters and versions, deciding them through
// the approval route, the lists with their version history and the master lists with their as-of time, and the
// refusals that name what is missing (PRD-UXP-003). Every value here is SYNTHETIC.

const TYPES = [
  'organisation.country',
  'organisation.state',
  'organisation.city',
  'organisation.area',
  'organisation.legal_entity',
  'organisation.tax_registration',
  'organisation.accounting_book',
  'organisation.site',
  'organisation.store',
  'organisation.grouping',
  'organisation.business_unit',
  'organisation.business_unit_mapping',
  'organisation.location',
  'organisation.store_default_warehouse',
];
const each = (actions: readonly PermissionAction[]): SyntheticAuthority[] =>
  TYPES.flatMap((recordType) => actions.map((action) => ({ recordType, action })));

let world: SyntheticWorld;
let database: string;
let organisationCode: string;
let api: AccessTestApp;
let keys: Record<string, string>;
let clock: SyntheticClock;
let approveReason: string;
const cookies = new Map<string, string>();
let admin: SyntheticUser;
let approver: SyntheticUser;

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
  options: { readonly scope?: AssignmentScope } = {},
): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(database, organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
    personas: ['P-ADM'],
  });
  await grantSynthetic(database, { kind: 'user', id: user.id }, authorities, options);
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.21' },
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

interface PreparedAnswer {
  readonly recordId: string;
  readonly versionId: string;
  readonly requestId: string;
}

async function prepare(path: string, body: unknown): Promise<PreparedAnswer> {
  const call = await post(admin, path, body);
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return call.body as unknown as PreparedAnswer;
}

function decide(answer: PreparedAnswer, by: SyntheticUser = approver): Promise<Call> {
  return post(by, `/api/access/approval-requests/${answer.requestId}/decision`, {
    versionId: answer.versionId,
    outcome: 'approve',
    reason: { kind: 'listed', reasonId: approveReason },
    totpCode: freshCode(by),
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

let areaId = '';

beforeAll(async () => {
  world = await createSyntheticOrganisations('orgroutes');
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
  api = await startAccessApp(world, keys, { clock });
  admin = await enrolled('ORG-ADMIN', each(['view', 'create', 'edit']));
  approver = await enrolled('ORG-APPROVER', each(['view', 'approve']));
  const country = await approved('/api/organisation/countries', {
    code: code('IN'),
    name: syntheticName('Country'),
    validFrom: today(),
  });
  const state = await approved('/api/organisation/states', {
    countryId: country.recordId,
    code: code('ST'),
    name: syntheticName('State'),
    validFrom: today(),
  });
  const city = await approved('/api/organisation/cities', {
    stateId: state.recordId,
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
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

const siteBody = () => ({
  code: code('SITE'),
  name: syntheticName('Site'),
  physicalKind: 'retail-site',
  areaId,
  addresses: [syntheticName('Address')],
  aliases: [],
  validFrom: today(),
});

describe('preparing and deciding (structure-and-masters 2.3; module-map 6.2 flow A)', () => {
  it('PRD-ORG-021 an Admin prepares a Site and a Store at it; a different person approves each; both are Setting up with their history', async () => {
    const site = await approved('/api/organisation/sites', siteBody());
    const storeCode = code('STORE');
    const store = await prepare('/api/organisation/stores', {
      code: storeCode,
      name: syntheticName('Store'),
      format: 'ebo',
      operatingModel: 'company-owned',
      siteId: site.recordId,
      aliases: [],
      validFrom: today(),
    });
    let stores = storeListSchema.parse((await get(admin, '/api/organisation/stores')).body);
    expect(stores.records.find((record) => record.id === store.recordId)?.versions).toEqual([
      expect.objectContaining({
        state: 'Awaiting approval',
        status: 'Setting up',
        siteId: site.recordId,
        request: { id: store.requestId, state: 'Awaiting approval' },
      }),
    ]);
    // The preparer may not decide it (PRD-ACS-006): not eligible, holding no approve.
    expect((await decide(store, admin)).body).toMatchObject({ error: { code: 'access.not-eligible' } });
    expect((await decide(store)).status).toBe(200);
    stores = storeListSchema.parse((await get(approver, '/api/organisation/stores')).body);
    expect(stores.records.find((record) => record.id === store.recordId)).toMatchObject({
      code: storeCode,
      versions: [{ state: 'In force', status: 'Setting up', request: { state: 'Approved' } }],
    });
    const sites = siteListSchema.parse((await get(admin, '/api/organisation/sites')).body);
    expect(sites.records.find((record) => record.id === site.recordId)?.versions[0]).toMatchObject({
      state: 'In force',
      status: 'Setting up',
    });
    // The master lists, with their as-of time (module-map 4.11).
    const lists = masterListsSchema.parse((await get(admin, `/api/organisation/master-lists?date=${today()}`)).body);
    expect(lists.date).toBe(today());
    expect(lists.notShown).toEqual([]);
    expect(lists.sites).toContainEqual(expect.objectContaining({ id: site.recordId, status: 'Setting up' }));
    expect(lists.stores).toContainEqual(expect.objectContaining({ id: store.recordId, siteId: site.recordId }));
  });

  it('PRD-UXP-003 a decision refused under its locks names what is missing', async () => {
    const site = await prepare('/api/organisation/sites', siteBody());
    const store = await prepare('/api/organisation/stores', {
      code: code('STORE'),
      name: syntheticName('Store'),
      format: 'kiosk',
      operatingModel: 'franchise-owned-company-operated',
      siteId: site.recordId,
      aliases: [],
      validFrom: today(),
    });
    expect((await decide(store)).body).toMatchObject({
      error: {
        kind: 'refused',
        code: 'organisation.reference-not-in-force',
        missing: [{ kind: 'approval', recordType: 'organisation.site', recordId: site.recordId }],
      },
    });
  });

  it('PRD-MOD-010 GC2-7 a past start, a taken code and an unknown record are refused when prepared', async () => {
    const yesterday = new Date(clock.now().getTime() - 86_400_000).toISOString().slice(0, 10);
    expect((await post(admin, '/api/organisation/sites', { ...siteBody(), validFrom: yesterday })).body).toMatchObject({
      error: { kind: 'refused', code: 'organisation.starts-in-past' },
    });
    const body = siteBody();
    await prepare('/api/organisation/sites', body);
    expect((await post(admin, '/api/organisation/sites', body)).body).toMatchObject({
      error: { kind: 'refused', code: 'organisation.code-taken' },
    });
    expect(
      (await post(admin, `/api/organisation/sites/${uuidv7()}/versions`, { ...siteBody(), code: undefined })).body,
    ).toMatchObject({ error: { kind: 'not-found', code: 'organisation.record-not-found' } });
  });
});

describe('reading under the reader’s own authorisation (access-and-approvals 7.1; module-map section 3, rule 5)', () => {
  it('PRD-UXP-003 a list the reader may not view is refused with the permission named, and left out of the master lists', async () => {
    // The master lists need no permission of their own (product owner, 8 Oct 2026).
    const reader = await enrolled('ORG-READER', [{ recordType: 'organisation.store', action: 'view' }]);
    const refused = await get(reader, '/api/organisation/sites');
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({
      error: { code: 'access.not-authorised', missing: [{ kind: 'permission', recordType: 'organisation.site' }] },
    });
    const lists = masterListsSchema.parse((await get(reader, `/api/organisation/master-lists?date=${today()}`)).body);
    expect(lists.notShown).toEqual(TYPES.filter((type) => type !== 'organisation.store'));
    expect(lists.sites).toEqual([]);
    expect(lists.areas).toEqual([]);
  });
});

describe('a list is read a page at a time, and one record on its own (code-house-rules 12.1)', () => {
  it('PRD-PRF-004 pages follow the cursor in code order; one record reads with every version; an unknown one is named', async () => {
    const first = await prepare('/api/organisation/sites', siteBody());
    const second = await prepare('/api/organisation/sites', siteBody());
    const all = siteListSchema.parse((await get(admin, '/api/organisation/sites')).body);
    expect(all.next).toBeNull();
    const ids = all.records.map((record) => record.id);
    expect(ids).toEqual(expect.arrayContaining([first.recordId, second.recordId]));
    // Page by page, one record each, the cursor handed back as given.
    const seen: string[] = [];
    let after: string | null = null;
    do {
      const query: string = after === null ? '?limit=1' : `?limit=1&after=${after}`;
      const page = siteListSchema.parse((await get(admin, `/api/organisation/sites${query}`)).body);
      expect(page.records.length).toBeLessThanOrEqual(1);
      seen.push(...page.records.map((record) => record.id));
      after = page.next;
    } while (after !== null);
    expect(seen).toEqual(ids);
    // A page is never longer than the cap.
    expect((await get(admin, `/api/organisation/sites?limit=${String(MASTER_PAGE_CAP + 1)}`)).status).toBe(400);
    const one = siteReadSchema.parse((await get(admin, `/api/organisation/sites/${first.recordId}`)).body);
    expect(one.record).toMatchObject({
      id: first.recordId,
      versions: [{ id: first.versionId, state: 'Awaiting approval', request: { id: first.requestId } }],
    });
    const unknown = uuidv7();
    const missing = await get(admin, `/api/organisation/sites/${unknown}`);
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({
      error: {
        code: 'organisation.record-not-found',
        missing: [{ kind: 'record', recordType: 'organisation.site', recordId: unknown }],
      },
    });
  });
});

describe('scope by place over the routes (access-and-approvals 5.3, 7.1, 9.3; structure-and-masters 6.1; S1-F02-T03)', () => {
  const storeBody = (siteId: string) => ({
    code: code('STORE'),
    name: syntheticName('Store'),
    format: 'ebo',
    operatingModel: 'company-owned',
    siteId,
    aliases: [],
    validFrom: today(),
  });
  const onlyStore = (storeId: string): AssignmentScope => ({
    kind: 'dimensions',
    legalEntity: { kind: 'all' },
    place: { kind: 'selected', members: [{ type: 'store', id: storeId }] },
    brand: { kind: 'all' },
  });

  it('PRD-ACS-021 PRD-UXP-003 a Store-scoped reader reads its Store, sees only it listed, and is refused at another Store with the place named', async () => {
    const site = await approved('/api/organisation/sites', siteBody());
    const mine = await approved('/api/organisation/stores', storeBody(site.recordId));
    const otherBody = storeBody(site.recordId);
    const other = await approved('/api/organisation/stores', otherBody);
    const reader = await enrolled('STORE-READER', [{ recordType: 'organisation.store', action: 'view' }], {
      scope: onlyStore(mine.recordId),
    });
    expect(
      storeReadSchema.parse((await get(reader, `/api/organisation/stores/${mine.recordId}`)).body).record,
    ).toMatchObject({
      id: mine.recordId,
    });
    const refused = await get(reader, `/api/organisation/stores/${other.recordId}`);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({
      error: {
        code: 'access.not-authorised',
        missing: [
          { kind: 'scope', dimension: 'place', factType: 'store', factId: other.recordId, factCode: otherBody.code },
        ],
      },
    });
    const listed = storeListSchema.parse((await get(reader, '/api/organisation/stores')).body);
    expect(listed.records.map((record) => record.id)).toEqual([mine.recordId]);
    const lists = masterListsSchema.parse((await get(reader, `/api/organisation/master-lists?date=${today()}`)).body);
    expect(lists.stores.map((each) => each.id)).toEqual([mine.recordId]);
  });

  it('RR-435 PRD-ACS-004 a request keeps the Store it is for: a Store-scoped approver decides that Store’s change and is not eligible at another', async () => {
    const site = await approved('/api/organisation/sites', siteBody());
    const mine = await approved('/api/organisation/stores', storeBody(site.recordId));
    const other = await approved('/api/organisation/stores', storeBody(site.recordId));
    const storeApprover = await enrolled(
      'STORE-APPROVER',
      [
        { recordType: 'organisation.store', action: 'view' },
        { recordType: 'organisation.store', action: 'approve' },
      ],
      { scope: onlyStore(mine.recordId) },
    );
    const version = (storeId: string) =>
      prepare(`/api/organisation/stores/${storeId}/versions`, {
        name: syntheticName('Store renamed'),
        format: 'ebo',
        operatingModel: 'company-owned',
        siteId: site.recordId,
        aliases: [],
        // From tomorrow: a version on the day an approved one starts is refused (structure-and-masters 6.1).
        validFrom: new Date(clock.now().getTime() + 86_400_000).toISOString().slice(0, 10),
      });
    const elsewhere = await decide(await version(other.recordId), storeApprover);
    expect(elsewhere.body).toMatchObject({
      error: {
        code: 'access.not-eligible',
        missing: [{ kind: 'scope', dimension: 'place', factType: 'store', factId: other.recordId }],
      },
    });
    expect((await decide(await version(mine.recordId), storeApprover)).status).toBe(200);
  });

  it('PRD-ACS-021 a Site-scoped preparer prepares a Store at its Site, and is refused a Store at another Site, with the place named', async () => {
    const mySite = await approved('/api/organisation/sites', siteBody());
    const otherSiteBody = siteBody();
    const otherSite = await approved('/api/organisation/sites', otherSiteBody);
    const preparer = await enrolled('SITE-PREPARER', [{ recordType: 'organisation.store', action: 'create' }], {
      scope: {
        kind: 'dimensions',
        legalEntity: { kind: 'all' },
        place: { kind: 'selected', members: [{ type: 'site', id: mySite.recordId }] },
        brand: { kind: 'all' },
      },
    });
    expect((await post(preparer, '/api/organisation/stores', storeBody(mySite.recordId))).status).toBe(200);
    const refused = await post(preparer, '/api/organisation/stores', storeBody(otherSite.recordId));
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({
      error: {
        code: 'access.not-authorised',
        missing: [
          {
            kind: 'scope',
            dimension: 'place',
            factType: 'site',
            factId: otherSite.recordId,
            factCode: otherSiteBody.code,
          },
        ],
      },
    });
  });
});
