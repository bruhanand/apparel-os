import { randomInt } from 'node:crypto';
import { errorEnvelopeSchema } from '@apparel-os/schemas';
import { uuidv7 } from '@apparel-os/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  codeFor,
  startAccessApp,
  SYNTHETIC_ORIGIN,
  SyntheticClock,
  syntheticKeysEnvironment,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic } from './support/grants.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F01-T22: same-day disabling through the API, on real PostgreSQL (access-and-approvals 2.1, 3.3, 7.1 step 1, 9.5;
// 15 test 19h; PRD-SEC-019, PRD-SEC-008; DEC-118, RR-321). User versions are dated by instants, so a disabling
// approved today takes effect at its decision, even of a user whose version in force was approved earlier the same
// day: every session of the user is refused at its next request and a new sign-in is refused at once. Every value
// is SYNTHETIC.

const SYNTHETIC_THROTTLING = { failureLimit: 50, windowSeconds: 600 };
const SYNTHETIC_PASSWORD_RULES = { minimumLength: 12 };
/** SYNTHETIC office session limits: lock after 10 minutes idle, end after 2 hours. Not POL-02.18's values. */
const SYNTHETIC_LIMITS = { idleLockSeconds: 600, absoluteSeconds: 7200 };

type Enrolled = SyntheticUser & { factorSecret: Buffer };

let world: SyntheticWorld;
let org: SyntheticWorld['organisations'][0];
let keys: Record<string, string>;
let api: AccessTestApp;
let clock: SyntheticClock;
let admin: Enrolled;
let approver: Enrolled;
let adminCookie: string;
let approverCookie: string;
let approveReasonId: string;

interface Call {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
}

function freshAddress(): string {
  return `10.${String(randomInt(256))}.${String(randomInt(256))}.${String(randomInt(1, 255))}`;
}

async function post(path: string, body: unknown, options: { cookie?: string; key?: string | null } = {}) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': freshAddress(),
    origin: SYNTHETIC_ORIGIN,
  };
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  if (options.key !== null) headers['idempotency-key'] = options.key ?? uuidv7();
  const response = await fetch(`${api.baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json(), headers: response.headers } satisfies Call;
}

async function get(path: string, cookie: string): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie } });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

const errorOf = (call: Call) => errorEnvelopeSchema.parse(call.body).error;

function freshCode(user: Enrolled): string {
  clock.advance(30);
  return codeFor(user.factorSecret, 0, clock.now());
}

async function enrolledUser(label: string): Promise<Enrolled> {
  const user = await writeSyntheticUser(org.database, org.code, keys, { label, enrolled: true });
  if (user.factorSecret === undefined) throw new Error('not enrolled');
  return user as Enrolled;
}

function signIn(user: Enrolled): Promise<Call> {
  return post(
    '/api/access/sign-in',
    { organisationCode: org.code, login: user.login, password: user.password, totpCode: freshCode(user) },
    { key: null },
  );
}

async function signedIn(user: Enrolled): Promise<string> {
  const call = await signIn(user);
  expect(call.status).toBe(200);
  const header = call.headers.get('set-cookie');
  if (header === null) throw new Error('No cookie was set');
  return header.split(';')[0] ?? '';
}

/** The approver decides a request with the listed approve reason and a fresh code (access-and-approvals 9.5). */
function approve(requestId: string, versionId: string): Promise<Call> {
  return post(
    `/api/access/approval-requests/${requestId}/decision`,
    {
      versionId,
      outcome: 'approve',
      reason: { kind: 'listed', reasonId: approveReasonId },
      totpCode: freshCode(approver),
    },
    { cookie: approverCookie },
  );
}

/** The Admin prepares a version of the user, and the approver approves it: one decided user version, now. */
async function decidedVersion(user: Enrolled, displayName: string, state: 'Active' | 'Disabled'): Promise<Call> {
  const prepared = await post(
    `/api/access/users/${user.id}/versions`,
    { displayName, personas: [], state },
    { cookie: adminCookie },
  );
  expect(prepared.status).toBe(200);
  const answer = prepared.body as { requestId: string; versionId: string };
  return approve(answer.requestId, answer.versionId);
}

async function rows<T extends object>(text: string, values: unknown[] = []): Promise<T[]> {
  const client = await connect(org.database, 'migration');
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('sameday');
  [org] = world.organisations;
  keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(org.database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
  await writeSyntheticSetting(org.database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
  await writeSyntheticSetting(org.database, 'access.office-session-limits', SYNTHETIC_LIMITS);
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock });
  admin = await enrolledUser('ADMIN');
  approver = await enrolledUser('APPROVER');
  await grantSynthetic(org.database, { kind: 'user', id: admin.id }, [
    { recordType: 'access.user', action: 'create' },
    { recordType: 'access.user', action: 'edit' },
    { recordType: 'access.approval_reason', action: 'create' },
    { recordType: 'access.approval_reason', action: 'edit' },
  ]);
  await grantSynthetic(org.database, { kind: 'user', id: approver.id }, [
    { recordType: 'access.user', action: 'approve' },
    { recordType: 'access.approval_reason', action: 'approve' },
  ]);
  adminCookie = await signedIn(admin);
  approverCookie = await signedIn(approver);
  // The first reason list, decided with free text (DEC-104).
  const reason = await post(
    '/api/access/approval-reasons',
    {
      code: `SYN-APPROVE-${String(randomInt(1_000_000))}`,
      kind: 'approve',
      text: 'SYNTHETIC approve reason',
      validFrom: clock.now().toISOString().slice(0, 10),
    },
    { cookie: adminCookie },
  );
  expect(reason.status).toBe(200);
  const prepared = reason.body as { requestId: string; versionId: string; reasonId: string };
  const decided = await post(
    `/api/access/approval-requests/${prepared.requestId}/decision`,
    {
      versionId: prepared.versionId,
      outcome: 'approve',
      reason: { kind: 'free-text', text: 'SYNTHETIC first list' },
      totpCode: freshCode(approver),
    },
    { cookie: approverCookie },
  );
  expect(decided.status).toBe(200);
  approveReasonId = prepared.reasonId;
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('same-day disabling (access-and-approvals 2.1, 9.5; test 19h; DEC-118)', () => {
  it('PRD-SEC-019 PRD-SEC-008 a user approved earlier today is disabled today: every session refused, no new sign-in', async () => {
    const target = await enrolledUser('TARGET');
    // Earlier today: a new version of the user is approved, and it is the version in force.
    expect((await decidedVersion(target, `${target.displayName} (renamed)`, 'Active')).status).toBe(200);
    const first = await signedIn(target);
    const second = await signedIn(target);
    expect((await get('/api/access/session', first)).status).toBe(200);
    expect((await get('/api/access/session', second)).status).toBe(200);

    // Later the same day: the disabling is approved, and takes effect at its decision.
    const disabled = await decidedVersion(target, `${target.displayName} (renamed)`, 'Disabled');
    expect(disabled.status).toBe(200);
    const decisionId = (disabled.body as { decisionId: string }).decisionId;

    expect(errorOf(await get('/api/access/session', first)).code).toBe('access.not-signed-in');
    expect(errorOf(await get('/api/access/session', second)).code).toBe('access.not-signed-in');
    const refused = await signIn(target);
    expect(refused.status).not.toBe(200);
    expect(errorOf(refused).code).toBe('access.sign-in-refused');

    // Both sessions were revoked by the decision, and history shows the disabling at the decision's instant.
    const sessions = await rows<{ state: string }>('select state from access.session where app_user_id = $1', [
      target.id,
    ]);
    expect(sessions.map((each) => each.state)).toEqual(['Revoked', 'Revoked']);
    const [decision] = await rows<{ decided_at: Date }>(
      'select decided_at from access.approval_decision where id = $1',
      [decisionId],
    );
    const versions = await rows<{ state: string; starts: Date; ends: Date | null }>(
      `select state, lower(valid_during) as starts, upper(valid_during) as ends from access.app_user_version
       where app_user_id = $1 and decision = 'Approved' order by lower(valid_during)`,
      [target.id],
    );
    expect(versions.map((each) => each.state)).toEqual(['Active', 'Active', 'Disabled']);
    expect(versions[1]?.ends?.toISOString()).toBe(decision?.decided_at.toISOString());
    expect(versions[2]?.starts.toISOString()).toBe(decision?.decided_at.toISOString());
    expect(versions[2]?.ends).toBeNull();
    const history = await rows<{ operation: string; recorded_at: Date }>(
      `select operation, recorded_at from audit.audit_record
       where record_type = 'user' and record_id = $1 and operation = 'approve-user-version' order by recorded_at`,
      [target.id],
    );
    expect(history).toHaveLength(2);
  });
});
