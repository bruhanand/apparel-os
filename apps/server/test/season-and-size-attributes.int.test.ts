import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  MARKED_ATTRIBUTE_CHANGE,
  MARKED_ATTRIBUTE_TYPE,
  markedAttributeListSchema,
  markedAttributeVersionListSchema,
  markedAttributeVersionReadSchema,
  type AttributeMark,
  type MarkedAttribute,
  type MarkedAttributeVersion,
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

// S2-F01-T02 and S2-F02-T02, RR-550 and RR-556: the Organisation's season attribute and size attribute through the
// catalogue's routes, on real PostgreSQL (structure-and-masters 4.2 "As built"; goods-in GI-2, GI-3; code-house-rules
// 7.3, 12.7, 12.14). Each is an Organisation setting marking one list-type attribute, with no default: prepared by one
// person, approved by a different one, its history kept. Every attribute, person and setting here is SYNTHETIC.

let world: SyntheticWorld;
let database: string;
let organisationCode: string;
let api: AccessTestApp;
let keys: Record<string, string>;
let clock: SyntheticClock;
let approveReason: string;
let rejectReason: string;
const cookies = new Map<string, string>();
/** Configures attributes and prepares the marking (edit on the setting). */
let admin: SyntheticUser;
/** Approves the marking, and may prepare it too, so a refusal of their own is for their preparation. */
let approver: SyntheticUser;
/** Reads the setting only. */
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
  });
  await grantSynthetic(database, { kind: 'user', id: user.id }, authorities);
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.81' },
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

/** A SYNTHETIC attribute, recorded at once through the catalogue's route (structure-and-masters 4.1, 4.2). */
async function syntheticAttribute(label: string, valueKind: 'list' | 'text' = 'list', validFrom = today()) {
  const made = await post(admin, '/api/merchandise/attributes', {
    code: code(label),
    valueKind,
    name: syntheticName(label),
    validFrom,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  return made.body.recordId as string;
}

function decide(
  by: SyntheticUser,
  requestId: string,
  versionId: string,
  outcome: 'approve' | 'reject' = 'approve',
): Promise<Call> {
  return post(by, `/api/access/approval-requests/${requestId}/decision`, {
    versionId,
    outcome,
    reason: { kind: 'listed', reasonId: outcome === 'approve' ? approveReason : rejectReason },
    totpCode: freshCode(by),
  });
}

function prepare(user: SyntheticUser, body: Record<string, unknown>, key?: string): Promise<Call> {
  return post(user, '/api/merchandise/marked-attributes/versions', { origin: 'synthetic', ...body }, key);
}

/** What preparing answered: the setting, the version and the request of its approval. */
function preparedIds(call: Call): { markedAttributeId: string; versionId: string; requestId: string } {
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return call.body as { markedAttributeId: string; versionId: string; requestId: string };
}

/** A page of a marking's versions, newest first (code-house-rules 12.1 "Reads"). */
async function versionPage(user: SyntheticUser, mark: AttributeMark, query: string) {
  const read = await get(user, `/api/merchandise/marked-attributes/${mark}/versions${query}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return markedAttributeVersionListSchema.parse(read.body);
}

/** A marking and every version, oldest first, its versions read one to a page through the cursor. */
async function marked(
  user: SyntheticUser,
  mark: AttributeMark,
): Promise<MarkedAttribute & { readonly versions: readonly MarkedAttributeVersion[] }> {
  const read = await get(user, '/api/merchandise/marked-attributes');
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  const found = markedAttributeListSchema.parse(read.body).marks.find((each) => each.mark === mark);
  if (found === undefined) throw new Error(`no ${mark} in the read`);
  const versions: MarkedAttributeVersion[] = [];
  let after: string | null = null;
  do {
    const page = await versionPage(user, mark, `?limit=1${after === null ? '' : `&after=${after}`}`);
    versions.push(...page.versions);
    after = page.next;
  } while (after !== null);
  return { ...found, versions: versions.reverse() };
}

const SETTING: readonly SyntheticAuthority[] = [
  { recordType: MARKED_ATTRIBUTE_TYPE, action: 'view' },
  { recordType: 'access.approval_request', action: 'view' },
];

beforeAll(async () => {
  world = await createSyntheticOrganisations('markedattrs');
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
  rejectReason = await writeSyntheticReason(database, 'reject');
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock });
  admin = await enrolled('MARK-ADMIN', [
    ...SETTING,
    { recordType: MARKED_ATTRIBUTE_TYPE, action: 'edit' },
    { recordType: 'merchandise.attribute', action: 'view' },
    { recordType: 'merchandise.attribute', action: 'create' },
  ]);
  approver = await enrolled('MARK-APPROVER', [
    ...SETTING,
    { recordType: MARKED_ATTRIBUTE_TYPE, action: 'edit' },
    { recordType: MARKED_ATTRIBUTE_TYPE, action: 'approve' },
  ]);
  reader = await enrolled('MARK-READER', SETTING);
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('marking the season attribute (structure-and-masters 4.2; goods-in GI-2; RR-550)', () => {
  it('RR-550 POL-02.07 no attribute is the season until one person prepares the marking and a different person approves it', async () => {
    // No default: nothing is marked until the Organisation marks it (code-house-rules 12.14).
    expect((await marked(reader, 'season')).inForce).toEqual({ kind: 'not-set' });
    const seasons = await syntheticAttribute('SEASON');
    const { markedAttributeId, versionId, requestId } = preparedIds(
      await prepare(approver, { mark: 'season', attributeId: seasons }),
    );
    const waiting = await marked(reader, 'season');
    expect(waiting).toMatchObject({
      mark: 'season',
      inForce: { kind: 'not-set' },
      versionToken: versionId,
      versions: [
        {
          id: versionId,
          attributeId: seasons,
          origin: 'synthetic',
          state: 'Awaiting approval',
          preparedBy: approver.id,
          request: { id: requestId, state: 'Awaiting approval' },
        },
      ],
    });
    // Its preparer may not approve it, though they hold the approval (PRD-ACS-006, POL-02.07).
    const own = await decide(approver, requestId, versionId);
    expect(own.body).toMatchObject({ error: { code: 'access.self-preparation' } });
    expect((await marked(reader, 'season')).inForce).toEqual({ kind: 'not-set' });

    // Prepared by another, the approver approves it, and it is in force from the decision.
    const second = preparedIds(await prepare(admin, { mark: 'season', attributeId: seasons, versionToken: versionId }));
    expect(second.markedAttributeId).toBe(markedAttributeId);
    const approved = await decide(approver, second.requestId, second.versionId);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const inForce = await marked(reader, 'season');
    expect(inForce.inForce).toEqual({ kind: 'set', attributeId: seasons, versionId: second.versionId });
    expect(inForce.versions.map((each) => [each.id, each.state])).toEqual([
      [versionId, 'Superseded'],
      [second.versionId, 'In force'],
    ]);
    expect(inForce.versions[1]?.inForceFrom).toEqual(expect.any(String));
    // The size attribute is a setting of its own.
    expect((await marked(reader, 'size')).inForce).not.toMatchObject({ attributeId: seasons });
    expect(MARKED_ATTRIBUTE_CHANGE).toBe('merchandise.marked_attribute.change');
  });
});

describe('changing the size attribute (structure-and-masters 4.2; goods-in GI-3; RR-556; code-house-rules 7.3, 12.7)', () => {
  it('PRD-MOD-010 a change is a new version through the same approval; the one in force stays until it is approved, and history is kept', async () => {
    const first = await syntheticAttribute('SIZE-A');
    const second = await syntheticAttribute('SIZE-B');
    const a = preparedIds(await prepare(admin, { mark: 'size', attributeId: first }));
    expect((await decide(approver, a.requestId, a.versionId)).status).toBe(200);
    const b = preparedIds(await prepare(admin, { mark: 'size', attributeId: second, versionToken: a.versionId }));
    // The newest version's token is asked: a change on a stale one is refused (12.7).
    const stale = await prepare(admin, { mark: 'size', attributeId: second, versionToken: a.versionId });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: { code: 'kernel.stale-version' } });
    // Until the change is approved, the attribute in force stays.
    expect((await marked(reader, 'size')).inForce).toEqual({ kind: 'set', attributeId: first, versionId: a.versionId });
    // A rejected change leaves it as it was.
    expect((await decide(approver, b.requestId, b.versionId, 'reject')).status).toBe(200);
    expect((await marked(reader, 'size')).inForce).toMatchObject({ attributeId: first });
    const c = preparedIds(await prepare(admin, { mark: 'size', attributeId: second, versionToken: b.versionId }));
    expect((await decide(approver, c.requestId, c.versionId)).status).toBe(200);
    const after = await marked(reader, 'size');
    expect(after.inForce).toEqual({ kind: 'set', attributeId: second, versionId: c.versionId });
    expect(after.versions.map((each) => [each.attributeId, each.state])).toEqual([
      [first, 'Ended'],
      [second, 'Rejected'],
      [second, 'In force'],
    ]);
    const [ended, , current] = after.versions;
    expect(ended?.inForceUntil).toBe(current?.inForceFrom);
    expect(after.versionToken).toBe(c.versionId);
  });
});

describe('reading a marking’s versions (structure-and-masters 4.2; code-house-rules 12.1 "Reads")', () => {
  it('PRD-MOD-010 code-house-rules 12.1 a marking’s versions are read newest first, a page at a time by a cursor; one version is read with its marking', async () => {
    const attributeId = await syntheticAttribute('PAGED');
    let token = (await marked(reader, 'season')).versionToken;
    const ids: string[] = [];
    for (let each = 0; each < 3; each++) {
      const made = preparedIds(
        await prepare(admin, { mark: 'season', attributeId, ...(token === undefined ? {} : { versionToken: token }) }),
      );
      ids.push(made.versionId);
      token = made.versionId;
    }
    const [oldest, middle, newest] = ids as [string, string, string];
    const first = await versionPage(reader, 'season', '?limit=2');
    expect(first.versions.map((each) => each.id)).toEqual([newest, middle]);
    expect(first.next).toBe(middle);
    const second = await versionPage(reader, 'season', `?limit=2&after=${middle}`);
    expect(second.versions[0]?.id).toBe(oldest);
    // A page larger than the cap is refused (code-house-rules 12.1).
    const tooLarge = await get(reader, '/api/merchandise/marked-attributes/season/versions?limit=101');
    expect(tooLarge.status).toBe(400);
    // One version, with the marking it belongs to and what that marking has in force, for its approval panel.
    const one = await get(reader, `/api/merchandise/marked-attributes/versions/${middle}`);
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect(markedAttributeVersionReadSchema.parse(one.body)).toMatchObject({
      mark: 'season',
      inForce: (await marked(reader, 'season')).inForce,
      version: { id: middle, attributeId, state: 'Superseded' },
    });
    const missing = await get(reader, `/api/merchandise/marked-attributes/versions/${uuidv7()}`);
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ error: { code: 'merchandise.record-not-found' } });
  });
});

describe('what preparing refuses, naming why (structure-and-masters 4.2; PRD-UXP-003)', () => {
  it('PRD-UXP-003 refuses a text attribute, and an attribute not found or not in force', async () => {
    const text = await syntheticAttribute('NOTE', 'text');
    const notList = await prepare(admin, { mark: 'size', attributeId: text });
    expect(notList.body).toMatchObject({
      error: {
        code: 'merchandise.attribute-not-list',
        missing: [{ kind: 'record', recordType: 'merchandise.attribute', recordId: text }],
      },
    });
    const unknown = uuidv7();
    const notFound = await prepare(admin, { mark: 'size', attributeId: unknown });
    expect(notFound.body).toMatchObject({ error: { code: 'merchandise.record-not-found' } });
    const tomorrow = new Date(clock.now().getTime() + 86_400_000).toISOString().slice(0, 10);
    const later = await syntheticAttribute('LATER', 'list', tomorrow);
    const notInForce = await prepare(admin, { mark: 'size', attributeId: later });
    expect(notInForce.body).toMatchObject({ error: { code: 'merchandise.reference-not-in-force' } });
  });

  it('code-house-rules 12.14 PRD-ACS-001 refuses an origin this environment does not accept, and a person without edit', async () => {
    const attributeId = await syntheticAttribute('ORIGIN');
    const testSetup = await post(admin, '/api/merchandise/marked-attributes/versions', {
      mark: 'season',
      attributeId,
      origin: 'test-setup',
    });
    expect(testSetup.body).toMatchObject({ error: { code: 'configuration.origin-not-allowed' } });
    const none = await prepare(reader, { mark: 'season', attributeId });
    expect(none.status).toBe(403);
    expect(none.body).toMatchObject({
      error: {
        code: 'access.not-authorised',
        missing: [expect.objectContaining({ action: 'edit', recordType: MARKED_ATTRIBUTE_TYPE })],
      },
    });
  });
});
