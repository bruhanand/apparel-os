import { randomInt } from 'node:crypto';
import { errorEnvelopeSchema, IDEMPOTENT_REPLAYED_HEADER } from '@apparel-os/schemas';
import { uuidv7 } from '@apparel-os/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  codeFor,
  startAccessApp,
  SYNTHETIC_ORIGIN,
  syntheticKeysEnvironment,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F01-T08: sign-in, enrolment and the own password change through the API, on real PostgreSQL
// (access-and-approvals 3.1 to 3.3, 15 tests 2, 3, 3c, 3d, 3e, 3g; numbering-and-audit 7 test 13; code-house-rules
// 12.1, 12.5, 12.6). Organisation A has SYNTHETIC throttling and password-rule settings; Organisation B has none.
// Every value is SYNTHETIC.

/** SYNTHETIC throttling: three failures in ten minutes, by typed login or by source address. */
const SYNTHETIC_THROTTLING = { failureLimit: 3, windowSeconds: 600 };
/** SYNTHETIC password rules. */
const SYNTHETIC_PASSWORD_RULES = { minimumLength: 12 };
/** SYNTHETIC office session limits, long enough that no test here reaches them (S1-F01-T09). */
const SYNTHETIC_SESSION_LIMITS = { idleLockSeconds: 1800, absoluteSeconds: 28800 };

let world: SyntheticWorld;
let keys: Record<string, string>;
let api: AccessTestApp;
let orgA: SyntheticWorld['organisations'][0];
let orgB: SyntheticWorld['organisations'][1];

beforeAll(async () => {
  world = await createSyntheticOrganisations('sign_in');
  [orgA, orgB] = world.organisations;
  keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(orgA.database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
  await writeSyntheticSetting(orgA.database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
  await writeSyntheticSetting(orgA.database, 'access.office-session-limits', SYNTHETIC_SESSION_LIMITS);
  api = await startAccessApp(world, keys);
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

/** A SYNTHETIC source address of its own, so one test's failures never throttle another's. */
function freshAddress(): string {
  return `10.${String(randomInt(256))}.${String(randomInt(256))}.${String(randomInt(1, 255))}`;
}

interface Call {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
}

async function post(
  path: string,
  body: unknown,
  options: { cookie?: string; key?: string; address?: string; origin?: string | null } = {},
): Promise<Call> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': options.address ?? freshAddress(),
  };
  if (options.origin !== null) headers.origin = options.origin ?? SYNTHETIC_ORIGIN;
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  if (options.key !== undefined) headers['idempotency-key'] = options.key;
  const response = await fetch(`${api.baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

async function get(path: string, cookie?: string): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: cookie === undefined ? {} : { cookie } });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

function signIn(
  body: { organisationCode: string; login: string; password: string; totpCode?: string },
  address?: string,
): Promise<Call> {
  return post('/api/access/sign-in', body, { address: address ?? freshAddress() });
}

function errorOf(call: Call) {
  return errorEnvelopeSchema.parse(call.body).error;
}

/** The cookie a sign-in set, as a browser sends it back: `name=value`. */
function cookieOf(call: Call): string {
  const header = call.headers.get('set-cookie');
  if (header === null) throw new Error('No cookie was set');
  return header.split(';')[0] ?? '';
}

async function rows<T extends object>(database: string, text: string, values: unknown[] = []): Promise<T[]> {
  const client = await connect(database, 'migration');
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

async function enrolledUser(label: string): Promise<SyntheticUser & { factorSecret: Buffer }> {
  const user = await writeSyntheticUser(orgA.database, orgA.code, keys, { label, enrolled: true });
  if (user.factorSecret === undefined) throw new Error('not enrolled');
  return user as SyntheticUser & { factorSecret: Buffer };
}

describe('sign-in (access-and-approvals 3.1; tests 3 and 3c)', () => {
  it('PRD-SEC-001 POL-02.17 signs in with the Organisation code, login, password and authenticator code, setting the session cookie', async () => {
    const user = await enrolledUser('SIGNS-IN');
    const call = await signIn({
      organisationCode: orgA.code,
      login: user.login.toLowerCase(),
      password: user.password,
      totpCode: codeFor(user.factorSecret),
    });
    expect(call.status).toBe(200);
    expect(call.body).toEqual({ outcome: 'signed-in' });
    const header = call.headers.get('set-cookie') ?? '';
    // deployment.md section 3: Secure, HttpOnly, SameSite=Lax, host-only, path /.
    expect(header).toMatch(
      /^__Host-aos-session=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43,}; Path=\/; Secure; HttpOnly; SameSite=Lax$/,
    );
    expect(header).not.toMatch(/Domain=/i);

    const session = await get('/api/access/session', cookieOf(call));
    expect(session.status).toBe(200);
    expect(session.body).toEqual({
      organisationCode: orgA.code,
      userId: user.id,
      displayName: expect.stringContaining('SYNTHETIC') as unknown,
      // A user written with no persona and no role assignment: nothing to land on, nothing granted (RR-281).
      personasHeld: [],
      grants: [],
      // So the shell shows "No access assigned" (DEC-118; RR-260), and times in the synthetic timezone (RR-310).
      roleAssignmentInForce: false,
      timezone: 'Etc/UTC',
    });

    const records = await rows<{ outcome: string; user_id: string }>(
      orgA.database,
      `select outcome, user_id from audit.access_record where kind = 'sign-in' and user_id = $1`,
      [user.id],
    );
    expect(records).toEqual([{ outcome: 'succeeded', user_id: user.id }]);
    // The database keeps only the SHA-256 hash of the identifier (3.3).
    const identifier = cookieOf(call).split('.')[1] ?? '';
    const sessions = await rows<{ identifier_hash: string }>(
      orgA.database,
      'select identifier_hash from access.session where app_user_id = $1',
      [user.id],
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.identifier_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(sessions)).not.toContain(identifier);
  });

  it('PRD-SEC-001 PRD-SEC-007 PRD-SEC-014 answers every wrong part with the same refusal and records each attempt without what was typed (numbering-and-audit 7 test 13)', async () => {
    const user = await enrolledUser('WRONG-PARTS');
    const unmatched = 'SYN-USER-NOBODY-HERE';
    const attempts = [
      {
        organisationCode: 'SYN-ORG-UNLISTED',
        login: user.login,
        password: user.password,
        totpCode: codeFor(user.factorSecret),
      },
      { organisationCode: orgA.code, login: unmatched, password: user.password, totpCode: codeFor(user.factorSecret) },
      {
        organisationCode: orgA.code,
        login: user.login,
        password: 'SYNTHETIC-wrong-password',
        totpCode: codeFor(user.factorSecret),
      },
      { organisationCode: orgA.code, login: user.login, password: user.password, totpCode: '000000' },
      { organisationCode: orgA.code, login: user.login, password: user.password },
    ];
    for (const attempt of attempts) {
      const call = await signIn(attempt);
      expect(call.status, JSON.stringify(attempt.login)).toBe(401);
      const error = errorOf(call);
      expect(error).toEqual({ kind: 'not-signed-in', code: 'access.sign-in-refused', reference: error.reference });
      expect(call.headers.get('set-cookie')).toBeNull();
    }
    const records = await rows<Record<string, unknown>>(
      orgA.database,
      `select * from audit.access_record where kind = 'sign-in' and outcome = 'refused'
         and (user_id = $1 or user_id is null)`,
      [user.id],
    );
    // Four attempts reached Organisation A; the unknown code reached none (3.1).
    expect(records.filter((record) => record.user_id === user.id)).toHaveLength(3);
    expect(records.some((record) => record.user_id === null)).toBe(true);
    const kept = JSON.stringify(records);
    for (const typed of [user.password, 'SYNTHETIC-wrong-password', unmatched, '000000'])
      expect(kept).not.toContain(typed);
    const log = api.logText();
    for (const typed of [user.password, 'SYNTHETIC-wrong-password', unmatched, 'SYN-ORG-UNLISTED']) {
      expect(log).not.toContain(typed);
    }
  });

  it('PRD-SEC-001 never accepts the same authenticator code twice', async () => {
    const user = await enrolledUser('CODE-ONCE');
    const body = {
      organisationCode: orgA.code,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret),
    };
    expect((await signIn(body)).status).toBe(200);
    expect(errorOf(await signIn(body)).code).toBe('access.sign-in-refused');
  });

  it('DEC-112 refuses a user whose first version is not yet approved, and a Disabled user, with the same refusal', async () => {
    for (const options of [{ decision: 'Awaiting approval' as const }, { state: 'Disabled' as const }]) {
      const user = await writeSyntheticUser(orgA.database, orgA.code, keys, {
        label: `NOT-ACTIVE-${String(randomInt(1_000_000))}`,
        enrolled: true,
        ...options,
      });
      const call = await signIn({
        organisationCode: orgA.code,
        login: user.login,
        password: user.password,
        totpCode: codeFor(user.factorSecret ?? Buffer.alloc(20)),
      });
      expect(errorOf(call).code).toBe('access.sign-in-refused');
    }
  });

  it('PRD-SEC-005 refuses a sign-in posted from another site (code-house-rules 12.1; RR-245)', async () => {
    const user = await enrolledUser('CROSS-SITE');
    for (const origin of [null, 'https://synthetic-elsewhere.example']) {
      const call = await post(
        '/api/access/sign-in',
        {
          organisationCode: orgA.code,
          login: user.login,
          password: user.password,
          totpCode: codeFor(user.factorSecret),
        },
        { origin },
      );
      expect(call.status).toBe(400);
      expect(errorOf(call).code).toBe('kernel.cross-site-request');
    }
  });

  it('PRD-SEC-017 is unavailable, naming the setting, where no throttling is set (code-house-rules 12.14)', async () => {
    const user = await writeSyntheticUser(orgB.database, orgB.code, keys, { label: 'NO-SETTINGS', enrolled: true });
    const call = await signIn({
      organisationCode: orgB.code,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret ?? Buffer.alloc(20)),
    });
    expect(call.status).toBe(403);
    expect(errorOf(call)).toMatchObject({
      kind: 'unavailable',
      code: 'access.sign-in-unavailable',
      missing: [{ kind: 'setting', setting: 'access.sign-in-throttling' }],
    });
  });
});

describe('two Organisations (test 2; PRD-ACS-020)', () => {
  it('PRD-ACS-020 a user of one Organisation cannot sign in with the other’s code, and no row crosses', async () => {
    const user = await enrolledUser('ONE-ORG');
    const call = await signIn({
      organisationCode: orgB.code,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret),
    });
    expect(call.status).not.toBe(200);
    const inB = await rows(orgB.database, 'select id from access.app_user where id = $1', [user.id]);
    expect(inB).toEqual([]);
  });
});

describe('the Organisation of a signed-in request (test 3d; DEC-093)', () => {
  it('PRD-ACS-020 PRD-SEC-014 treats a cookie with an unknown code, the other Organisation’s code or an unknown identifier as not signed in, logging no cookie value', async () => {
    const user = await enrolledUser('COOKIES');
    const call = await signIn({
      organisationCode: orgA.code,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret),
    });
    const cookie = cookieOf(call);
    const identifier = cookie.split('.')[1] ?? '';
    const withCode = (code: string, id = identifier) =>
      `__Host-aos-session=${Buffer.from(code, 'utf8').toString('base64url')}.${id}`;
    expect((await get('/api/access/session', cookie)).status).toBe(200);
    for (const forged of [
      withCode('SYN-ORG-UNLISTED'),
      withCode(orgB.code),
      withCode(orgA.code, 'A'.repeat(43)),
      '__Host-aos-session=not-a-cookie',
    ]) {
      const answer = await get('/api/access/session', forged);
      expect(answer.status).toBe(401);
      expect(errorOf(answer).code).toBe('access.not-signed-in');
    }
    expect((await get('/api/access/session')).status).toBe(401);
    expect(api.logText()).not.toContain(identifier);
    // The directory holds no session, user or identifier hash (DEC-093).
    const directory = await rows<{ column_name: string }>(
      world.directory,
      `select column_name from information_schema.columns where table_schema = 'kernel' and table_name = 'directory_entry'`,
    );
    expect(directory.map((row) => row.column_name).sort()).toEqual(['database_name', 'id', 'organisation_code']);
  });
});

describe('first sign-in: enrolment, then the password change (test 3e; access-and-approvals 3.2)', () => {
  it('PRD-SEC-001 PRD-SEC-014 DEC-099 DEC-113 reaches only enrolment and the password change until both are done', async () => {
    const user = await writeSyntheticUser(orgA.database, orgA.code, keys, { label: 'FIRST', temporary: true });
    // The temporary password is kept only as an Argon2id hash (3.2).
    const [stored] = await rows<{ password_hash: string }>(
      orgA.database,
      'select password_hash from access.password_credential where app_user_id = $1',
      [user.id],
    );
    expect(stored?.password_hash).toMatch(/^\$argon2id\$/);

    const first = await signIn({ organisationCode: orgA.code, login: user.login, password: user.password });
    expect(first.body).toEqual({ outcome: 'enrolment-required' });
    const cookie = cookieOf(first);

    const blocked = await get('/api/access/session', cookie);
    expect(blocked.status).toBe(401);
    expect(errorOf(blocked)).toMatchObject({
      code: 'access.sign-in-incomplete',
      missing: [
        { kind: 'sign-in-step', step: 'enrolment' },
        { kind: 'sign-in-step', step: 'password-change' },
      ],
      next: 'access.start-enrolment',
    });
    const tooSoon = await post(
      '/api/access/password/change',
      { newPassword: 'SYNTHETIC-new-password-1', totpCode: '000000' },
      { cookie, key: uuidv7() },
    );
    expect(errorOf(tooSoon).code).toBe('access.sign-in-incomplete');

    // Enrolment: the secret is shown once; a replay of the request is refused, never answered again (12.6).
    const startKey = uuidv7();
    const started = await post('/api/access/enrolment/start', {}, { cookie, key: startKey });
    expect(started.status).toBe(200);
    const { secret, otpauthUri } = started.body as { secret: string; otpauthUri: string };
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUri).toContain(`secret=${secret}`);
    const replayed = await post('/api/access/enrolment/start', {}, { cookie, key: startKey });
    expect(replayed.status).toBe(409);
    expect(errorOf(replayed).code).toBe('kernel.answer-not-repeatable');
    // The secret is stored only encrypted.
    const factors = await rows<{ secret_ciphertext: string }>(
      orgA.database,
      'select secret_ciphertext from access.second_factor where app_user_id = $1',
      [user.id],
    );
    expect(JSON.stringify(factors)).not.toContain(secret);
    const secretBytes = base32Decode(secret);

    // A wrong code is refused, not kept under the key, and recorded (12.5; numbering-and-audit 5.1).
    const confirmKey = uuidv7();
    const wrong = await post('/api/access/enrolment/confirm', { totpCode: '000000' }, { cookie, key: confirmKey });
    expect(wrong.status).toBe(403);
    expect(errorOf(wrong).code).toBe('access.authenticator-code-refused');
    const confirmed = await post(
      '/api/access/enrolment/confirm',
      { totpCode: codeFor(secretBytes) },
      { cookie, key: confirmKey },
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({ state: 'Confirmed' });

    const stillBlocked = await get('/api/access/session', cookie);
    expect(errorOf(stillBlocked)).toMatchObject({
      code: 'access.sign-in-incomplete',
      missing: [{ kind: 'sign-in-step', step: 'password-change' }],
    });

    // The password change: the rules refuse a short one, which is not kept under the key; then it changes.
    const changeKey = uuidv7();
    const short = await post(
      '/api/access/password/change',
      { newPassword: 'SYN-short', totpCode: codeFor(secretBytes, 1) },
      { cookie, key: changeKey },
    );
    expect(errorOf(short).code).toBe('access.password-refused');
    const newPassword = 'SYNTHETIC-new-password-1';
    const changed = await post(
      '/api/access/password/change',
      { newPassword, totpCode: codeFor(secretBytes, 1) },
      { cookie, key: changeKey },
    );
    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({ outcome: 'password-changed' });

    // A replay with the same password is the first answer; with another, a changed request (12.5).
    const same = await post(
      '/api/access/password/change',
      { newPassword, totpCode: '000000' },
      { cookie, key: changeKey },
    );
    expect(same.status).toBe(200);
    expect(same.headers.get(IDEMPOTENT_REPLAYED_HEADER)).toBe('true');
    const other = await post(
      '/api/access/password/change',
      { newPassword: 'SYNTHETIC-other-password-1', totpCode: '000000' },
      { cookie, key: changeKey },
    );
    expect(other.status).toBe(409);
    expect(errorOf(other).code).toBe('kernel.idempotency-key-reused');

    expect((await get('/api/access/session', cookie)).status).toBe(200);
    // The temporary password keeps no hash once replaced, and no longer signs in.
    const credentials = await rows<{ password_hash: string | null; temporary: boolean }>(
      orgA.database,
      'select password_hash, temporary from access.password_credential where app_user_id = $1 order by recorded_at, id',
      [user.id],
    );
    expect(credentials.map((row) => [row.password_hash === null, row.temporary])).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(
      errorOf(
        await signIn({
          organisationCode: orgA.code,
          login: user.login,
          password: user.password,
          totpCode: codeFor(secretBytes, 2),
        }),
      ).code,
    ).toBe('access.sign-in-refused');

    const kinds = await rows<{ kind: string; outcome: string }>(
      orgA.database,
      `select kind, outcome from audit.access_record where user_id = $1 and kind <> 'sign-in' order by recorded_at, id`,
      [user.id],
    );
    expect(kinds).toEqual([
      { kind: 'second-factor-enrolled', outcome: 'refused' },
      { kind: 'second-factor-enrolled', outcome: 'succeeded' },
      { kind: 'password-changed', outcome: 'succeeded' },
    ]);
    // PRD-SEC-014: no password, code, secret or temporary password in the log or in any access or audit record.
    const everything = [
      api.logText(),
      JSON.stringify(await rows(orgA.database, 'select * from audit.access_record')),
      JSON.stringify(await rows(orgA.database, 'select * from audit.audit_record')),
      JSON.stringify(await rows(orgA.database, 'select * from kernel.idempotency_key')),
      JSON.stringify(await rows(orgA.database, 'select * from kernel.idempotency_result')),
    ].join('');
    for (const value of [
      user.password,
      newPassword,
      'SYNTHETIC-other-password-1',
      secret,
      cookie.split('.')[1] ?? '',
    ]) {
      expect(everything).not.toContain(value);
    }
    const conflicts = JSON.stringify(await rows(orgA.database, 'select * from kernel.idempotency_conflict'));
    expect(conflicts).not.toContain('SYNTHETIC-other-password-1');
  });

  it('GC3-5 sets no password while no password rules are in force (code-house-rules 12.14)', async () => {
    // Organisation B has no settings; its throttling is set here so sign-in is available, but not its password rules.
    const second = await createSyntheticOrganisations('sign_in_rules');
    const secondKeys = syntheticKeysEnvironment(second);
    const app = await startAccessApp(second, secondKeys);
    try {
      const [org] = second.organisations;
      await writeSyntheticSetting(org.database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
      await writeSyntheticSetting(org.database, 'access.office-session-limits', SYNTHETIC_SESSION_LIMITS);
      const user = await writeSyntheticUser(org.database, org.code, secondKeys, {
        label: 'NO-RULES',
        enrolled: true,
        temporary: true,
      });
      const secretBytes = user.factorSecret ?? Buffer.alloc(20);
      const signedIn = await fetch(`${app.baseUrl}/api/access/sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN },
        body: JSON.stringify({
          organisationCode: org.code,
          login: user.login,
          password: user.password,
          totpCode: codeFor(secretBytes),
        }),
      });
      expect(await signedIn.json()).toEqual({ outcome: 'password-change-required' });
      const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
      const change = await fetch(`${app.baseUrl}/api/access/password/change`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, cookie, 'idempotency-key': uuidv7() },
        body: JSON.stringify({ newPassword: 'SYNTHETIC-new-password-1', totpCode: codeFor(secretBytes, 1) }),
      });
      expect(change.status).toBe(403);
      expect(errorEnvelopeSchema.parse(await change.json()).error).toMatchObject({
        code: 'access.password-rules-not-set',
        missing: [{ kind: 'setting', setting: 'access.password-rules' }],
      });
    } finally {
      await app.close();
      await second.reset();
    }
  });
});

describe("the session read and the Organisation's timezone (PRD-MOD-017; DEC-118, RR-310)", () => {
  it('code-house-rules 12.14 gives no session read once no timezone is in force, so no screen falls back to the device’s', async () => {
    // A timezone source that answers "set" for sign-in, then "not set", as if its version had ended since.
    let inForce = true;
    const second = await createSyntheticOrganisations('sign_in_zone');
    const secondKeys = syntheticKeysEnvironment(second);
    const app = await startAccessApp(second, secondKeys, {
      timezone: {
        read: () =>
          Promise.resolve(
            inForce
              ? { kind: 'set', timezone: 'Etc/UTC', versionId: '01900000-0000-7000-8000-00000000c0df' }
              : { kind: 'not-set' },
          ),
      },
    });
    try {
      const [org] = second.organisations;
      await writeSyntheticSetting(org.database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
      await writeSyntheticSetting(org.database, 'access.office-session-limits', SYNTHETIC_SESSION_LIMITS);
      const user = await writeSyntheticUser(org.database, org.code, secondKeys, { label: 'ZONE', enrolled: true });
      const signedIn = await fetch(`${app.baseUrl}/api/access/sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN },
        body: JSON.stringify({
          organisationCode: org.code,
          login: user.login,
          password: user.password,
          totpCode: codeFor(user.factorSecret ?? Buffer.alloc(20)),
        }),
      });
      expect(await signedIn.json()).toEqual({ outcome: 'signed-in' });
      const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
      inForce = false;
      const read = await fetch(`${app.baseUrl}/api/access/session`, { headers: { cookie } });
      expect(read.status).toBe(401);
      expect(errorEnvelopeSchema.parse(await read.json()).error).toMatchObject({ code: 'access.not-signed-in' });
      // And a new sign-in is unavailable, naming the timezone (DEC-118).
      const again = await fetch(`${app.baseUrl}/api/access/sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN },
        body: JSON.stringify({
          organisationCode: org.code,
          login: user.login,
          password: user.password,
          totpCode: codeFor(user.factorSecret ?? Buffer.alloc(20), 1),
        }),
      });
      expect(errorEnvelopeSchema.parse(await again.json()).error).toMatchObject({
        code: 'access.sign-in-unavailable',
        missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
      });
    } finally {
      await app.close();
      await second.reset();
    }
  });
});

describe('throttling (test 3g; DEC-116)', () => {
  it('PRD-SEC-001 PRD-SEC-014 slows a login that exists and one that does not alike, after the synthetic limit', async () => {
    const user = await enrolledUser('THROTTLED');
    const ghost = 'SYN-USER-GHOST-THROTTLED';
    const answers: Record<string, unknown[]> = { existing: [], missing: [] };
    for (let attempt = 0; attempt < SYNTHETIC_THROTTLING.failureLimit + 1; attempt += 1) {
      const existing = await signIn({
        organisationCode: orgA.code,
        login: user.login,
        password: 'SYNTHETIC-wrong-password',
      });
      const missing = await signIn({ organisationCode: orgA.code, login: ghost, password: 'SYNTHETIC-wrong-password' });
      answers.existing?.push([existing.status, errorOf(existing).code]);
      answers.missing?.push([missing.status, errorOf(missing).code]);
    }
    const expected = [
      ...Array.from({ length: SYNTHETIC_THROTTLING.failureLimit }, () => [401, 'access.sign-in-refused']),
      [401, 'access.sign-in-slowed'],
    ];
    expect(answers.existing).toEqual(expected);
    expect(answers.missing).toEqual(expected);
    // Slowed even with the right password and code: no credential is checked.
    const right = await signIn({
      organisationCode: orgA.code,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret),
    });
    expect(errorOf(right).code).toBe('access.sign-in-slowed');
    // The typed login is kept only as a keyed digest (PRD-SEC-014).
    expect(JSON.stringify(await rows(orgA.database, 'select * from access.sign_in_failure'))).not.toContain(ghost);
  });

  it('DEC-116 slows by source address, whatever login is typed', async () => {
    const address = freshAddress();
    for (let attempt = 0; attempt < SYNTHETIC_THROTTLING.failureLimit; attempt += 1) {
      await signIn(
        { organisationCode: orgA.code, login: `SYN-USER-SPRAY-${String(attempt)}`, password: 'SYNTHETIC-x' },
        address,
      );
    }
    const user = await enrolledUser('SAME-ADDRESS');
    const call = await signIn(
      { organisationCode: orgA.code, login: user.login, password: user.password, totpCode: codeFor(user.factorSecret) },
      address,
    );
    expect(errorOf(call).code).toBe('access.sign-in-slowed');
    const elsewhere = await signIn({
      organisationCode: orgA.code,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret),
    });
    expect(elsewhere.status).toBe(200);
  });
});

/** Base32 of RFC 4648, as an authenticator app reads the secret shown once. */
function base32Decode(text: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of text) {
    value = (value << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
