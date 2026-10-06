import { randomInt } from 'node:crypto';
import { errorEnvelopeSchema } from '@apparel-os/schemas';
import { uuidv7 } from '@apparel-os/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMAND_RUNNER,
  newCorrelationId,
  ORGANISATION_ROUTER,
  type CommandRunner,
  type OrganisationRouter,
} from '../src/kernel/index.js';
import { ACCESS, type AccessInterface } from '../src/modules/access/index.js';
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

// S1-F01-T09: sessions, protected actions and revocation through the API, on real PostgreSQL (access-and-approvals
// 2.1, 3.2, 3.3, 4.3, 7.1 step 1; 15 tests 3a, 3b, 4, 5). Organisation A has SYNTHETIC throttling, password rules and
// office session limits; Organisation B has throttling and password rules but no session limits. The clock is the
// test's, so limits pass without waiting. Every value is SYNTHETIC.

/** SYNTHETIC throttling: five failures in ten minutes, by typed login or by source address. */
const SYNTHETIC_THROTTLING = { failureLimit: 5, windowSeconds: 600 };
const SYNTHETIC_PASSWORD_RULES = { minimumLength: 12 };
/** SYNTHETIC office session limits: lock after 10 minutes idle, end after 2 hours. Not POL-02.18's values. */
const SYNTHETIC_LIMITS = { idleLockSeconds: 600, absoluteSeconds: 7200 };

let world: SyntheticWorld;
let keys: Record<string, string>;
let api: AccessTestApp;
let clock: SyntheticClock;
let orgA: SyntheticWorld['organisations'][0];
let orgB: SyntheticWorld['organisations'][1];

beforeAll(async () => {
  world = await createSyntheticOrganisations('sessions');
  [orgA, orgB] = world.organisations;
  keys = syntheticKeysEnvironment(world);
  for (const org of [orgA, orgB]) {
    await writeSyntheticSetting(org.database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
    await writeSyntheticSetting(org.database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
  }
  await writeSyntheticSetting(orgA.database, 'access.office-session-limits', SYNTHETIC_LIMITS);
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock });
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

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
  options: { cookie?: string; key?: string | null; address?: string } = {},
): Promise<Call> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': options.address ?? freshAddress(),
    origin: SYNTHETIC_ORIGIN,
  };
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  if (options.key !== null) headers['idempotency-key'] = options.key ?? uuidv7();
  const response = await fetch(`${api.baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

async function get(path: string, cookie: string): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie } });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

function errorOf(call: Call) {
  return errorEnvelopeSchema.parse(call.body).error;
}

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

type Enrolled = SyntheticUser & { factorSecret: Buffer };

async function enrolledUser(label: string, org = orgA): Promise<Enrolled> {
  const user = await writeSyntheticUser(org.database, org.code, keys, { label, enrolled: true });
  if (user.factorSecret === undefined) throw new Error('not enrolled');
  return user as Enrolled;
}

/**
 * A code of the user's authenticator for a step later than any used before: the test clock moves on one 30-second
 * step first, since the server never accepts a step twice (PRD-SEC-001).
 */
function freshCode(user: Enrolled): string {
  clock.advance(30);
  return codeFor(user.factorSecret, 0, clock.now());
}

async function signedIn(user: Enrolled, org = orgA): Promise<string> {
  const call = await post(
    '/api/access/sign-in',
    { organisationCode: org.code, login: user.login, password: user.password, totpCode: freshCode(user) },
    { key: null },
  );
  expect(call.status).toBe(200);
  return cookieOf(call);
}

async function sessionsOf(userId: string): Promise<{ state: string }[]> {
  return rows(orgA.database, 'select state from access.session where app_user_id = $1 order by started_at', [userId]);
}

describe('session limits (access-and-approvals 3.3; test 4)', () => {
  it('PRD-ACS-017 POL-02.18 makes sign-in unavailable, naming the setting, while no office session limits are set', async () => {
    const user = await enrolledUser('NO-LIMITS', orgB);
    const call = await post(
      '/api/access/sign-in',
      { organisationCode: orgB.code, login: user.login, password: user.password, totpCode: freshCode(user) },
      { key: null },
    );
    expect(call.status).toBe(403);
    expect(errorOf(call)).toMatchObject({
      code: 'access.sign-in-unavailable',
      missing: [{ kind: 'setting', setting: 'access.office-session-limits' }],
    });
  });

  it('PRD-ACS-017 locks a session once its idle limit passes, keeps it alive while it is used, and records the lock', async () => {
    const user = await enrolledUser('IDLE');
    const cookie = await signedIn(user);
    clock.advance(SYNTHETIC_LIMITS.idleLockSeconds - 60);
    expect((await get('/api/access/session', cookie)).status).toBe(200);
    // Used a minute before the limit, so the idle time starts again.
    clock.advance(SYNTHETIC_LIMITS.idleLockSeconds - 60);
    expect((await get('/api/access/session', cookie)).status).toBe(200);
    clock.advance(SYNTHETIC_LIMITS.idleLockSeconds);
    const locked = await get('/api/access/session', cookie);
    expect(locked.status).toBe(401);
    expect(errorOf(locked)).toMatchObject({ kind: 'not-signed-in', code: 'access.session-locked' });
    // Still locked at the next request; nothing else is reached.
    expect(errorOf(await get('/api/access/session', cookie)).code).toBe('access.session-locked');
    expect(await sessionsOf(user.id)).toEqual([{ state: 'Locked' }]);
    const records = await rows<{ kind: string }>(
      orgA.database,
      `select kind from audit.access_record where user_id = $1 and kind = 'session-locked'`,
      [user.id],
    );
    expect(records).toHaveLength(1);
  });
});

describe('requests at once on one session (access-and-approvals 3.3; code-house-rules 8.2)', () => {
  it('PRD-INT-003 PRD-ACS-017 requests arriving together past the idle limit lock the session once, with one record', async () => {
    const user = await enrolledUser('TOGETHER');
    const cookie = await signedIn(user);
    clock.advance(SYNTHETIC_LIMITS.idleLockSeconds + 60);
    // Authenticate locks the session row through the lock helper before it rechecks and writes, so they agree.
    const calls = await Promise.all(Array.from({ length: 5 }, () => get('/api/access/session', cookie)));
    expect(calls.map((call) => errorOf(call).code)).toEqual(Array(5).fill('access.session-locked'));
    expect(await sessionsOf(user.id)).toEqual([{ state: 'Locked' }]);
    const records = await rows<{ kind: string }>(
      orgA.database,
      `select kind from audit.access_record where user_id = $1 and kind = 'session-locked'`,
      [user.id],
    );
    expect(records).toHaveLength(1);
  });
});

describe('the absolute limit (access-and-approvals 3.3; test 4)', () => {
  it('PRD-ACS-017 POL-02.18 ends a session at its absolute limit, however active, and records the end', async () => {
    const user = await enrolledUser('ABSOLUTE');
    const cookie = await signedIn(user);
    for (let used = 0; used + 300 < SYNTHETIC_LIMITS.absoluteSeconds; used += 300) {
      clock.advance(300);
      expect((await get('/api/access/session', cookie)).status).toBe(200);
    }
    clock.advance(300);
    const ended = await get('/api/access/session', cookie);
    expect(ended.status).toBe(401);
    // An ended session answers like no session at all (3.3).
    expect(errorOf(ended).code).toBe('access.not-signed-in');
    expect(await sessionsOf(user.id)).toEqual([{ state: 'Ended' }]);
    const records = await rows<{ kind: string }>(
      orgA.database,
      `select kind from audit.access_record where user_id = $1 and kind = 'session-ended'`,
      [user.id],
    );
    expect(records).toHaveLength(1);
  });

  it('PRD-ACS-017 ends a locked session too, so it can no longer be unlocked', async () => {
    const user = await enrolledUser('LOCKED-THEN-ENDED');
    const cookie = await signedIn(user);
    clock.advance(SYNTHETIC_LIMITS.idleLockSeconds);
    expect(errorOf(await get('/api/access/session', cookie)).code).toBe('access.session-locked');
    clock.advance(SYNTHETIC_LIMITS.absoluteSeconds);
    const unlock = await post('/api/access/unlock', { password: user.password }, { cookie });
    expect(errorOf(unlock).code).toBe('access.not-signed-in');
    expect(await sessionsOf(user.id)).toEqual([{ state: 'Ended' }]);
  });
});

describe('unlocking (access-and-approvals 3.3; test 4)', () => {
  async function lockedSession(label: string): Promise<{ user: Enrolled; cookie: string }> {
    const user = await enrolledUser(label);
    const cookie = await signedIn(user);
    clock.advance(SYNTHETIC_LIMITS.idleLockSeconds);
    expect(errorOf(await get('/api/access/session', cookie)).code).toBe('access.session-locked');
    return { user, cookie };
  }

  it('PRD-ACS-017 PRD-SEC-007 unlocks with the same user password, and the session reaches everything again', async () => {
    const { user, cookie } = await lockedSession('UNLOCKS');
    const unlocked = await post('/api/access/unlock', { password: user.password }, { cookie });
    expect(unlocked.status).toBe(200);
    expect(unlocked.body).toEqual({ outcome: 'unlocked' });
    expect((await get('/api/access/session', cookie)).status).toBe(200);
    expect(await sessionsOf(user.id)).toEqual([{ state: 'In force' }]);
    const records = await rows<{ kind: string; outcome: string }>(
      orgA.database,
      `select kind, outcome from audit.access_record where user_id = $1 and kind = 'sign-in' order by recorded_at`,
      [user.id],
    );
    // The sign-in, then the unlock, which is a sign-in attempt of its own (numbering-and-audit 5.1).
    expect(records).toEqual([
      { kind: 'sign-in', outcome: 'succeeded' },
      { kind: 'sign-in', outcome: 'succeeded' },
    ]);
  });

  it('PRD-SEC-001 PRD-SEC-014 refuses a wrong password with the sign-in refusal, records it, keeps nothing typed and slows repeated failures', async () => {
    const { user, cookie } = await lockedSession('UNLOCK-WRONG');
    const address = freshAddress();
    const key = uuidv7();
    for (let attempt = 0; attempt < SYNTHETIC_THROTTLING.failureLimit; attempt += 1) {
      // The same key may be sent again: a refusal caused by a secret is never kept under it (12.5).
      const wrong = await post(
        '/api/access/unlock',
        { password: 'SYNTHETIC-wrong-password' },
        { cookie, address, key },
      );
      expect(wrong.status).toBe(401);
      expect(errorOf(wrong)).toEqual({
        kind: 'not-signed-in',
        code: 'access.sign-in-refused',
        reference: expect.any(String) as unknown,
      });
    }
    const slowed = await post('/api/access/unlock', { password: user.password }, { cookie, address, key });
    expect(errorOf(slowed).code).toBe('access.sign-in-slowed');
    expect(await sessionsOf(user.id)).toEqual([{ state: 'Locked' }]);
    const refused = await rows<{ outcome: string }>(
      orgA.database,
      `select outcome from audit.access_record where user_id = $1 and kind = 'sign-in' and outcome = 'refused'`,
      [user.id],
    );
    expect(refused).toHaveLength(SYNTHETIC_THROTTLING.failureLimit + 1);
    const kept = await rows<{ content: string }>(
      orgA.database,
      'select row_to_json(k)::text as content from kernel.idempotency_key k',
    );
    expect(JSON.stringify(kept)).not.toContain('SYNTHETIC-wrong-password');
    expect(api.logText()).not.toContain('SYNTHETIC-wrong-password');
  });

  it('PRD-ACS-017 refuses every other route while locked, naming the unlock as the next action', async () => {
    const { cookie } = await lockedSession('LOCKED-ELSEWHERE');
    const call = await post('/api/access/roles', {}, { cookie });
    expect(call.status).toBe(401);
    expect(errorOf(call)).toMatchObject({ code: 'access.session-locked', next: 'access.unlock-session' });
  });

  it('PRD-ACS-017 lets a locked session sign out', async () => {
    const { user, cookie } = await lockedSession('LOCKED-SIGNS-OUT');
    const out = await post('/api/access/sign-out', {}, { cookie });
    expect(out.status).toBe(200);
    expect(await sessionsOf(user.id)).toEqual([{ state: 'Ended' }]);
  });
});

describe('signing out and revoking (access-and-approvals 3.3, 4.3; test 5)', () => {
  it('PRD-SEC-007 signs out: the session ends, the cookie is cleared and the next request is not signed in', async () => {
    const user = await enrolledUser('SIGNS-OUT');
    const cookie = await signedIn(user);
    const out = await post('/api/access/sign-out', {}, { cookie });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ outcome: 'signed-out' });
    expect(out.headers.get('set-cookie')).toMatch(
      /^__Host-aos-session=; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=0$/,
    );
    expect(errorOf(await get('/api/access/session', cookie)).code).toBe('access.not-signed-in');
    const records = await rows<{ kind: string }>(
      orgA.database,
      `select kind from audit.access_record where user_id = $1 and kind = 'sign-out'`,
      [user.id],
    );
    expect(records).toHaveLength(1);
  });

  it('PRD-SEC-008 revokes one of the user own sessions, or all of them, with no permission; the next request is refused', async () => {
    const user = await enrolledUser('REVOKES-OWN');
    const first = await signedIn(user);
    const second = await signedIn(user);
    const third = await signedIn(user);
    const [secondRow] = await rows<{ id: string }>(
      orgA.database,
      'select id from access.session where app_user_id = $1 order by started_at, id offset 1 limit 1',
      [user.id],
    );
    const one = await post('/api/access/own-sessions/revoke', { sessionId: secondRow?.id }, { cookie: first });
    expect(one.status).toBe(200);
    expect(one.body).toEqual({ revokedSessionIds: [secondRow?.id] });
    expect(errorOf(await get('/api/access/session', second)).code).toBe('access.not-signed-in');
    expect((await get('/api/access/session', third)).status).toBe(200);
    // A session that is not the user's, or is over, is not found.
    const again = await post('/api/access/own-sessions/revoke', { sessionId: secondRow?.id }, { cookie: first });
    expect(errorOf(again).code).toBe('access.session-not-found');
    const all = await post('/api/access/own-sessions/revoke', {}, { cookie: first });
    expect((all.body as { revokedSessionIds: string[] }).revokedSessionIds).toHaveLength(2);
    expect(errorOf(await get('/api/access/session', first)).code).toBe('access.not-signed-in');
    expect(errorOf(await get('/api/access/session', third)).code).toBe('access.not-signed-in');
    const events = await rows<{ event_type: string }>(
      orgA.database,
      `select event_type from kernel.outbox_event where payload->>'userId' = $1`,
      [user.id],
    );
    expect(events).toEqual([{ event_type: 'access.session-revoked' }, { event_type: 'access.session-revoked' }]);
  });

  it('PRD-SEC-008 PRD-INT-001 revokes another user sessions only with edit on access.session, naming what is missing', async () => {
    const target = await enrolledUser('REVOKED-BY-OTHER');
    const targetCookie = await signedIn(target);
    const admin = await enrolledUser('REVOKES-OTHERS');
    const adminCookie = await signedIn(admin);
    const refused = await post(`/api/access/users/${target.id}/sessions/revoke`, {}, { cookie: adminCookie });
    expect(refused.status).toBe(403);
    expect(errorOf(refused)).toMatchObject({
      code: 'access.not-authorised',
      missing: [{ kind: 'permission', recordType: 'access.session', action: 'edit' }],
    });
    await grantSynthetic(orgA.database, { kind: 'user', id: admin.id }, [
      { recordType: 'access.session', action: 'edit' },
    ]);
    const revoked = await post(`/api/access/users/${target.id}/sessions/revoke`, {}, { cookie: adminCookie });
    expect(revoked.status).toBe(200);
    expect((revoked.body as { revokedSessionIds: string[] }).revokedSessionIds).toHaveLength(1);
    expect(errorOf(await get('/api/access/session', targetCookie)).code).toBe('access.not-signed-in');
    // Revoking bars no new sign-in (4.3).
    await signedIn(target);
    const unknown = await post(`/api/access/users/${uuidv7()}/sessions/revoke`, {}, { cookie: adminCookie });
    expect(errorOf(unknown).code).toBe('access.user-not-found');
    const audit = await rows<{ operation: string; actor_id: string }>(
      orgA.database,
      `select operation, actor_id from audit.audit_record where record_type = 'session' and actor_id = $1`,
      [admin.id],
    );
    expect(audit).toEqual([{ operation: 'revoke-session', actor_id: admin.id }]);
  });

  it('PRD-SEC-008 refuses the next request of a user who is no longer Active (access-and-approvals 2.1, 7.1 step 1)', async () => {
    const user = await enrolledUser('DISABLED');
    const cookie = await signedIn(user);
    const today = clock.now().toISOString().slice(0, 10);
    const owner = await connect(orgA.database, 'migration');
    try {
      await owner.query(
        `update access.app_user_version set valid_during = daterange(lower(valid_during), $2::date) where id = $1`,
        [user.versionId, today],
      );
      await owner.query(
        `insert into access.app_user_version (id, app_user_id, display_name, state, valid_during, decision)
         values ($1, $2, $3, 'Disabled', daterange($4::date, null), 'Approved')`,
        [uuidv7(), user.id, user.displayName, today],
      );
    } finally {
      await owner.end();
    }
    expect(errorOf(await get('/api/access/session', cookie)).code).toBe('access.not-signed-in');
  });

  it('PRD-SEC-008 revokes every session of a user in the caller transaction, as the decision that disables the user does', async () => {
    const user = await enrolledUser('REVOKED-BY-DECISION');
    const cookie = await signedIn(user);
    const access = api.app.get<AccessInterface>(ACCESS);
    const routed = await api.app.get<OrganisationRouter>(ORGANISATION_ROUTER).resolveForSignIn(orgA.code);
    if (!routed.routed) throw new Error('not routed');
    const approver = uuidv7();
    const revoked = await api.app.get<CommandRunner>(COMMAND_RUNNER).run(
      {
        commandName: 'access.synthetic-decision',
        organisation: routed.organisation,
        correlationId: newCorrelationId(),
        actor: { kind: 'actor', actorId: approver },
      },
      (context) =>
        access.revokeSessions(context, { actor: { kind: 'user', id: approver } }, { userId: user.id }, 'disable-user'),
    );
    expect(revoked).toHaveLength(1);
    expect(errorOf(await get('/api/access/session', cookie)).code).toBe('access.not-signed-in');
  });
});

describe('resetting another user credential (access-and-approvals 3.2, 3.3; tests 3a and 3b)', () => {
  async function resetter(label: string): Promise<{ user: Enrolled; cookie: string }> {
    const user = await enrolledUser(label);
    await grantSynthetic(orgA.database, { kind: 'user', id: user.id }, [
      { recordType: 'access.user_credential', action: 'edit' },
    ]);
    return { user, cookie: await signedIn(user) };
  }

  function reset(userId: string, cookie: string, body: Record<string, unknown>, key?: string): Promise<Call> {
    return post(`/api/access/users/${userId}/credential-reset`, body, {
      cookie,
      ...(key === undefined ? {} : { key }),
    });
  }

  it('PRD-SEC-001 PRD-SEC-007 PRD-SEC-008 DEC-105 resets a password with a fresh code, revokes every session and records it', async () => {
    const { user: admin, cookie } = await resetter('RESETS-PASSWORD');
    const target = await enrolledUser('PASSWORD-RESET');
    const targetCookie = await signedIn(target);
    const temporary = 'SYNTHETIC-temporary-reset-1';
    const call = await reset(target.id, cookie, {
      reset: 'password',
      temporaryPassword: temporary,
      totpCode: freshCode(admin),
    });
    expect(call.status).toBe(200);
    expect((call.body as { reset: string; revokedSessionIds: string[] }).revokedSessionIds).toHaveLength(1);
    expect(errorOf(await get('/api/access/session', targetCookie)).code).toBe('access.not-signed-in');
    // The old password no longer signs in; the temporary one reaches only the password change (3.2).
    const old = await post(
      '/api/access/sign-in',
      { organisationCode: orgA.code, login: target.login, password: target.password, totpCode: freshCode(target) },
      { key: null },
    );
    expect(errorOf(old).code).toBe('access.sign-in-refused');
    const next = await post(
      '/api/access/sign-in',
      { organisationCode: orgA.code, login: target.login, password: temporary, totpCode: freshCode(target) },
      { key: null },
    );
    expect(next.body).toEqual({ outcome: 'password-change-required' });
    const records = await rows<{ kind: string }>(
      orgA.database,
      `select kind from audit.access_record where user_id = $1 and kind in ('password-reset', 'session-revoked') order by kind`,
      [target.id],
    );
    expect(records).toEqual([{ kind: 'password-reset' }, { kind: 'session-revoked' }]);
    const audit = await rows<{ changes: unknown }>(
      orgA.database,
      `select changes from audit.audit_record where record_type = 'user_credential' and record_id = $1`,
      [target.id],
    );
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(temporary);
    expect(api.logText()).not.toContain(temporary);
  });

  it('PRD-SEC-001 DEC-105 asks for a fresh code every time while no freshness setting exists (test 3a)', async () => {
    const { user: admin, cookie } = await resetter('FRESH-EVERY-TIME');
    const target = await enrolledUser('AUTHENTICATOR-RESET');
    const code = freshCode(admin);
    const first = await reset(target.id, cookie, { reset: 'authenticator', totpCode: code });
    expect(first.status).toBe(200);
    // The same code, for another protected action a moment later, is refused: it is no longer fresh.
    const second = await reset(target.id, cookie, { reset: 'authenticator', totpCode: code });
    expect(second.status).toBe(403);
    expect(errorOf(second).code).toBe('access.authenticator-code-refused');
    const third = await reset(target.id, cookie, { reset: 'authenticator', totpCode: freshCode(admin) });
    expect(third.status).toBe(200);
    // After an authenticator reset, the user signs in with the password and reaches only enrolment (3.2).
    const next = await post(
      '/api/access/sign-in',
      { organisationCode: orgA.code, login: target.login, password: target.password },
      { key: null },
    );
    expect(next.body).toEqual({ outcome: 'enrolment-required' });
  });

  it('DEC-105 refuses a reset of one own credential, even holding the permission, and one without the permission', async () => {
    const { user: admin, cookie } = await resetter('RESETS-SELF');
    const own = await reset(admin.id, cookie, { reset: 'authenticator', totpCode: freshCode(admin) });
    expect(own.status).toBe(422);
    expect(errorOf(own).code).toBe('access.own-credential-reset');
    const plain = await enrolledUser('NO-RESET-PERMISSION');
    const plainCookie = await signedIn(plain);
    const target = await enrolledUser('NOT-RESET');
    const refused = await reset(target.id, plainCookie, { reset: 'authenticator', totpCode: freshCode(plain) });
    expect(errorOf(refused)).toMatchObject({
      code: 'access.not-authorised',
      missing: [{ kind: 'permission', recordType: 'access.user_credential', action: 'edit' }],
    });
  });

  it('PRD-SEC-014 refuses a temporary password the rules refuse, and a password reset with none, keeping nothing typed', async () => {
    const { user: admin, cookie } = await resetter('RESETS-SHORT');
    const target = await enrolledUser('SHORT-RESET');
    const short = await reset(target.id, cookie, {
      reset: 'both',
      temporaryPassword: 'SYN-short',
      totpCode: freshCode(admin),
    });
    expect(errorOf(short).code).toBe('access.password-refused');
    const none = await reset(target.id, cookie, { reset: 'password', totpCode: freshCode(admin) });
    expect(errorOf(none).code).toBe('kernel.invalid-request');
    expect(JSON.stringify(short.body)).not.toContain('SYN-short');
    expect(api.logText()).not.toContain('SYN-short');
  });
});
