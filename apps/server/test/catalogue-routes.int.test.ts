import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  brandListSchema,
  brandReadSchema,
  catalogueKinds,
  catalogueRecordType,
  VOCABULARY_PROPOSAL_TYPE,
  vocabularyProposalReadSchema,
  vocabularyValueListSchema,
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

// S1-F03-T01: the routes of the merchandise catalogue through the whole application (structure-and-masters 4.7, 8;
// code-house-rules 12.1, 12.3, 12.4, 12.7): recording masters and versions, the version token, proposing a vocabulary
// value and confirming it through the approval route, and the refusals that name what is missing (PRD-UXP-003).
// Every value here is SYNTHETIC.

const TYPES = [...catalogueKinds.map(catalogueRecordType), VOCABULARY_PROPOSAL_TYPE];
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
let booking: SyntheticUser;
let confirmer: SyntheticUser;
let reader: SyntheticUser;

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
    personas: ['P-BKG'],
  });
  await grantSynthetic(database, { kind: 'user', id: user.id }, authorities);
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.31' },
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

beforeAll(async () => {
  world = await createSyntheticOrganisations('catroutes');
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
  booking = await enrolled('CAT-BOOKING', [
    ...each(['view', 'create', 'edit']).filter(
      (authority) => !(authority.recordType === 'merchandise.vocabulary_proposal' && authority.action === 'edit'),
    ),
    { recordType: 'merchandise.vocabulary_proposal', action: 'approve' },
    { recordType: 'merchandise.product_proposal', action: 'view' },
    { recordType: 'merchandise.product_proposal', action: 'create' },
    { recordType: 'access.approval_request', action: 'view' },
  ]);
  confirmer = await enrolled('CAT-CONFIRMER', [
    ...each(['view']),
    { recordType: 'merchandise.vocabulary_proposal', action: 'approve' },
    { recordType: 'merchandise.product_proposal', action: 'view' },
    { recordType: 'merchandise.product_proposal', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
  ]);
  reader = await enrolled('CAT-READER', [{ recordType: 'merchandise.brand', action: 'view' }]);
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('brands through the routes (structure-and-masters 4.1, 4.7; code-house-rules 12.4, 12.7)', () => {
  it('PRD-MER-020 records a brand at once, lists it with its version token and refuses a stale one', async () => {
    const body = { code: code('BRAND'), name: syntheticName('Route brand'), aliases: [], validFrom: today() };
    const key = uuidv7();
    const made = await post(booking, '/api/merchandise/brands', body, key);
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    expect(made.body).not.toHaveProperty('requestId');
    // The same key and content answers the same, recording nothing more (12.4).
    expect((await post(booking, '/api/merchandise/brands', body, key)).body).toEqual(made.body);
    const recordId = made.body.recordId as string;
    const read = brandReadSchema.parse((await get(booking, `/api/merchandise/brands/${recordId}`)).body);
    expect(read.record).toMatchObject({ code: body.code, versionToken: made.body.versionId });
    const list = brandListSchema.parse((await get(reader, '/api/merchandise/brands')).body);
    expect(list.records.map((record) => record.id)).toContain(recordId);
    const version = (token: string, validFrom: string) =>
      post(booking, `/api/merchandise/brands/${recordId}/versions`, {
        name: syntheticName('Renamed brand'),
        aliases: [syntheticName('Route brand')],
        retired: false,
        validFrom,
        versionToken: token,
      });
    const later = clock.now();
    const tomorrow = new Date(later.getTime() + 86_400_000).toISOString().slice(0, 10);
    expect((await version(made.body.versionId as string, tomorrow)).status).toBe(200);
    const stale = await version(made.body.versionId as string, tomorrow);
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: { code: 'kernel.stale-version' } });
  });

  it('PRD-UXP-003 refuses a reader without create, naming the missing permission', async () => {
    const refused = await post(reader, '/api/merchandise/brands', {
      code: code('NOPE'),
      name: syntheticName('Nope'),
      aliases: [],
      validFrom: today(),
    });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({
      error: {
        code: 'access.not-authorised',
        missing: [{ kind: 'permission', action: 'create', recordType: 'merchandise.brand' }],
      },
    });
  });
});

describe('vocabulary proposals through the routes (structure-and-masters 4.2; PRD-IMP-008)', () => {
  it('PRD-IMP-008 a proposal is no value until a different person confirms it; its proposer is refused', async () => {
    const attribute = await post(booking, '/api/merchandise/attributes', {
      code: code('COLOUR'),
      valueKind: 'list',
      name: syntheticName('Colour'),
      validFrom: today(),
    });
    expect(attribute.status).toBe(200);
    const proposed = await post(booking, '/api/merchandise/vocabulary-proposals', {
      attributeId: attribute.body.recordId,
      code: code('TEAL'),
      name: syntheticName('Teal'),
    });
    expect(proposed.status, JSON.stringify(proposed.body)).toBe(200);
    const values = async () =>
      vocabularyValueListSchema
        .parse((await get(booking, '/api/merchandise/vocabulary-values')).body)
        .records.filter((record) => record.attributeId === attribute.body.recordId);
    expect(await values()).toEqual([]);
    const decide = (by: SyntheticUser) =>
      post(by, `/api/access/approval-requests/${proposed.body.requestId as string}/decision`, {
        versionId: proposed.body.proposalId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: approveReason },
        totpCode: freshCode(by),
      });
    const own = await decide(booking);
    expect(own.body).toMatchObject({ error: { code: 'access.self-preparation' } });
    expect(await values()).toEqual([]);
    const confirmed = await decide(confirmer);
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    expect(await values()).toEqual([
      expect.objectContaining({ versions: [expect.objectContaining({ state: 'In force' })] }),
    ]);
    const proposal = vocabularyProposalReadSchema.parse(
      (await get(booking, `/api/merchandise/vocabulary-proposals/${proposed.body.proposalId as string}`)).body,
    );
    expect(proposal.proposal).toMatchObject({ state: 'Confirmed' });
  });
});

describe('product proposals through the routes (structure-and-masters 4.2; DM-5)', () => {
  it('PRD-SEC-001 Decide refuses a product proposal confirmed with a wrong fresh code, or none (access-and-approvals 9.5)', async () => {
    const brand = await post(booking, '/api/merchandise/brands', {
      code: code('BRAND'),
      name: syntheticName('Route brand'),
      aliases: [],
      validFrom: today(),
    });
    const category = await post(booking, '/api/merchandise/categories', {
      code: code('CAT'),
      name: syntheticName('Route category'),
      identityAttributeIds: [],
      validFrom: today(),
    });
    expect([brand.status, category.status]).toEqual([200, 200]);
    const proposed = await post(booking, '/api/merchandise/product-proposals', {
      style: { code: code('STYLE'), brandId: brand.body.recordId, categoryId: category.body.recordId, attributes: [] },
      skus: [{ code: code('SKU'), identity: [], stockUnit: 'piece', purpose: 'merchandise' }],
    });
    expect(proposed.status, JSON.stringify(proposed.body)).toBe(200);
    const decide = (totpCode: string | null) =>
      post(confirmer, `/api/access/approval-requests/${proposed.body.requestId as string}/decision`, {
        versionId: proposed.body.proposalId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: approveReason },
        ...(totpCode === null ? {} : { totpCode }),
      });
    const wrong = await decide('000000');
    expect(wrong.status).toBe(403);
    expect(wrong.body).toMatchObject({ error: { code: 'access.authenticator-code-refused' } });
    const none = await decide(null);
    expect(none.status).toBe(400);
    expect(none.body).toMatchObject({ error: { code: 'kernel.invalid-request' } });
    const confirmed = await decide(freshCode(confirmer));
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
  });
});
