import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  auditHistoryPageSchema,
  errorEnvelopeSchema,
  securitySettingsSchema,
  type SecuritySettings,
  type SecuritySettingVersionDraft,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrganisationTimezoneSource } from '../src/kernel/index.js';
import {
  codeFor,
  startAccessApp,
  SYNTHETIC_ORIGIN,
  SyntheticClock,
  syntheticKeysEnvironment,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic } from './support/grants.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';

// S1-F01-T25: the essential security settings (access-and-approvals 3.1, 3.3, 9.11, 15 tests 19j, 19k; code-house-rules
// 7.3, 12.14; PRD-SEC-017, POL-02.06, POL-02.07, PRD-MOD-010; DEC-118, RR-334), through the API on real PostgreSQL.
// Organisation A holds SYNTHETIC settings, an Admin who may prepare and approve setting changes, an approver who may
// approve them, and a person who only signs in; Organisation B starts with no setting at all. The clock moves 30
// seconds before each authenticator code, so each code is of a later step (3.3). Every value is SYNTHETIC; none is a
// default.

const SYNTHETIC_THROTTLING = { failureLimit: 3, windowSeconds: 600 };
const SYNTHETIC_PASSWORD_RULES = { minimumLength: 12 };
const SYNTHETIC_SESSION_LIMITS = { idleLockSeconds: 1800, absoluteSeconds: 28_800 };

let world: SyntheticWorld;
let keys: Record<string, string>;
let api: AccessTestApp;
let orgA: SyntheticWorld['organisations'][0];
let orgB: SyntheticWorld['organisations'][1];
const clock = new SyntheticClock();
let admin: SyntheticUser;
let approver: SyntheticUser;
let signer: SyntheticUser;
let approveReason: string;
let rejectReason: string;

beforeAll(async () => {
  world = await createSyntheticOrganisations('security_settings');
  [orgA, orgB] = world.organisations;
  keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(orgA.database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
  await writeSyntheticSetting(orgA.database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
  await writeSyntheticSetting(orgA.database, 'access.office-session-limits', SYNTHETIC_SESSION_LIMITS);
  const enrolled = (label: string) =>
    writeSyntheticUser(orgA.database, orgA.code, keys, { label, enrolled: true, personas: ['P-ADM'] });
  admin = await enrolled('SETTINGS-ADMIN');
  approver = await enrolled('SETTINGS-APPROVER');
  signer = await enrolled('SETTINGS-SIGNER');
  // The Admin also holds approve, so that the refusal of their own preparation is the self-preparation rule.
  await grantSynthetic(orgA.database, { kind: 'user', id: admin.id }, [
    { recordType: 'access.setting', action: 'view' },
    { recordType: 'access.setting', action: 'edit' },
    { recordType: 'access.setting', action: 'approve' },
    { recordType: 'audit.audit_record', action: 'view' },
  ]);
  await grantSynthetic(orgA.database, { kind: 'user', id: approver.id }, [
    { recordType: 'access.setting', action: 'view' },
    { recordType: 'access.setting', action: 'approve' },
    { recordType: 'audit.audit_record', action: 'view' },
  ]);
  approveReason = await writeSyntheticReason(orgA.database, 'approve');
  rejectReason = await writeSyntheticReason(orgA.database, 'reject');
  api = await startAccessApp(world, keys, { clock });
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
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  options: { body?: unknown; cookie?: string; keyed?: boolean; address?: string; app?: AccessTestApp } = {},
): Promise<Call> {
  const headers: Record<string, string> = { 'x-forwarded-for': options.address ?? freshAddress() };
  if (method === 'POST') {
    headers['content-type'] = 'application/json';
    headers.origin = SYNTHETIC_ORIGIN;
  }
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  if (options.keyed === true) headers['idempotency-key'] = uuidv7();
  const response = await fetch(`${(options.app ?? api).baseUrl}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  return { status: response.status, body: await response.json() };
}

function errorOf(answer: Call) {
  return errorEnvelopeSchema.parse(answer.body).error;
}

/** A code of the user's authenticator for a step later than any used before: the clock moves on 30 seconds. */
function nextCode(user: SyntheticUser): string {
  clock.advance(30);
  if (user.factorSecret === undefined) throw new Error('not enrolled');
  return codeFor(user.factorSecret, 0, clock.now());
}

function signIn(
  user: SyntheticUser,
  options: { organisationCode?: string; password?: string; address?: string; app?: AccessTestApp } = {},
) {
  return call('POST', '/api/access/sign-in', {
    body: {
      organisationCode: options.organisationCode ?? orgA.code,
      login: user.login,
      password: options.password ?? user.password,
      totpCode: nextCode(user),
    },
    ...(options.address === undefined ? {} : { address: options.address }),
    ...(options.app === undefined ? {} : { app: options.app }),
  });
}

async function sessionCookie(user: SyntheticUser): Promise<string> {
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': freshAddress() },
    body: JSON.stringify({
      organisationCode: orgA.code,
      login: user.login,
      password: user.password,
      totpCode: nextCode(user),
    }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie') ?? '';
  return cookie.split(';')[0] ?? '';
}

async function prepare(user: SyntheticUser, draft: SecuritySettingVersionDraft): Promise<Call> {
  return call('POST', '/api/access/security-settings/versions', {
    body: draft,
    cookie: await sessionCookie(user),
    keyed: true,
  });
}

async function prepared(draft: SecuritySettingVersionDraft): Promise<{ versionId: string; requestId: string }> {
  const answer = await prepare(admin, draft);
  expect(answer.status).toBe(200);
  return answer.body as { versionId: string; requestId: string };
}

async function decide(
  user: SyntheticUser,
  request: { versionId: string; requestId: string },
  outcome: 'approve' | 'reject' = 'approve',
  totpCode?: string,
): Promise<Call> {
  const cookie = await sessionCookie(user);
  return call('POST', `/api/access/approval-requests/${request.requestId}/decision`, {
    body: {
      versionId: request.versionId,
      outcome,
      reason: { kind: 'listed', reasonId: outcome === 'approve' ? approveReason : rejectReason },
      totpCode: totpCode ?? nextCode(user),
    },
    cookie,
    keyed: true,
  });
}

async function approved(request: { versionId: string; requestId: string }): Promise<void> {
  const answer = await decide(approver, request);
  expect(answer.status).toBe(200);
}

async function settings(): Promise<SecuritySettings> {
  const answer = await call('GET', '/api/access/security-settings', { cookie: await sessionCookie(approver) });
  expect(answer.status).toBe(200);
  return securitySettingsSchema.parse(answer.body);
}

async function settingOf(key: SecuritySettingVersionDraft['setting']) {
  const found = (await settings()).settings.find((each) => each.setting === key);
  if (found === undefined) throw new Error(`no ${key}`);
  return found;
}

const atDecision = { kind: 'at-decision' } as const;

/** A business date in the synthetic timezone (Etc/UTC), days from the synthetic clock's now. */
function dayFromNow(days: number): string {
  return new Date(clock.now().getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

describe('a missing security setting blocks sign-in (access-and-approvals 3.1; test 19j; PRD-SEC-017, DEC-118)', () => {
  it('names every required setting not set, and signs in once all are', async () => {
    const user = await writeSyntheticUser(orgB.database, orgB.code, keys, { label: 'NONE-SET', enrolled: true });
    const none = await signIn(user, { organisationCode: orgB.code });
    expect(none.status).toBe(403);
    expect(errorOf(none)).toMatchObject({
      kind: 'unavailable',
      code: 'access.sign-in-unavailable',
      missing: [
        { kind: 'setting', setting: 'access.sign-in-throttling' },
        { kind: 'setting', setting: 'access.password-rules' },
        { kind: 'setting', setting: 'access.office-session-limits' },
      ],
    });
    await writeSyntheticSetting(orgB.database, 'access.sign-in-throttling', SYNTHETIC_THROTTLING);
    await writeSyntheticSetting(orgB.database, 'access.office-session-limits', SYNTHETIC_SESSION_LIMITS);
    const one = await signIn(user, { organisationCode: orgB.code });
    expect(errorOf(one).missing).toEqual([{ kind: 'setting', setting: 'access.password-rules' }]);
    await writeSyntheticSetting(orgB.database, 'access.password-rules', SYNTHETIC_PASSWORD_RULES);
    expect((await signIn(user, { organisationCode: orgB.code })).status).toBe(200);
  });

  it('names the timezone while the Organisation has none (code-house-rules 9)', async () => {
    const noTimezone: OrganisationTimezoneSource = { read: () => Promise.resolve({ kind: 'not-set' }) };
    const without = await startAccessApp(world, keys, { clock, timezone: noTimezone });
    try {
      const answer = await signIn(signer, { app: without });
      expect(answer.status).toBe(403);
      expect(errorOf(answer).missing).toEqual([{ kind: 'setting', setting: 'configuration.timezone' }]);
    } finally {
      await without.close();
    }
  });
});

describe('changing a security setting after setup (access-and-approvals 3.3; test 19k; POL-02.06, POL-02.07)', () => {
  it('PRD-ACS-006 takes effect only when a different authorised person approves it with a fresh code, and keeps its history', async () => {
    const before = await settingOf('access.office-session-limits');
    const oldVersion = before.inForceVersionId;
    expect(oldVersion).not.toBeNull();
    const change = await prepared({
      setting: 'access.office-session-limits',
      value: { idleLockSeconds: 1700, absoluteSeconds: 28_800 },
      origin: 'synthetic',
      takesEffect: atDecision,
    });
    const waiting = await settingOf('access.office-session-limits');
    expect(waiting.inForceVersionId).toBe(oldVersion);
    expect(waiting.versions[0]).toMatchObject({ id: change.versionId, decision: 'Awaiting approval' });

    // The preparer cannot approve it, though they hold approve (POL-02.08).
    const own = await decide(admin, change);
    expect(errorOf(own).code).toBe('access.self-preparation');
    // A code already used is not fresh (3.3).
    clock.advance(30);
    const used = codeFor(approver.factorSecret ?? Buffer.alloc(20), 0, clock.now());
    const cookie = await sessionCookie(approver);
    const stale = await call('POST', `/api/access/approval-requests/${change.requestId}/decision`, {
      body: {
        versionId: change.versionId,
        outcome: 'approve',
        reason: { kind: 'listed', reasonId: approveReason },
        totpCode: used,
      },
      cookie,
      keyed: true,
    });
    expect(errorOf(stale).code).toBe('access.authenticator-code-refused');
    expect((await settingOf('access.office-session-limits')).inForceVersionId).toBe(oldVersion);

    await approved(change);
    const after = await settingOf('access.office-session-limits');
    expect(after.inForceVersionId).toBe(change.versionId);
    const versions = new Map(after.versions.map((version) => [version.id, version]));
    expect(versions.get(change.versionId)).toMatchObject({
      decision: 'Approved',
      value: { idleLockSeconds: 1700, absoluteSeconds: 28_800 },
      origin: 'synthetic',
      takesEffect: atDecision,
    });
    // The version it replaced ends where the new one starts: never a gap, so the setting is never unset.
    expect(versions.get(oldVersion ?? '')?.validTo).toBe(versions.get(change.versionId)?.validFrom);

    const history = await call(
      'GET',
      `/api/access/history/record?recordType=access.setting&recordId=${after.settingId ?? ''}`,
      { cookie: await sessionCookie(approver) },
    );
    expect(history.status).toBe(200);
    const entries = auditHistoryPageSchema.parse(history.body).entries;
    const preparedEntry = entries.find((entry) => entry.operation === 'prepare-setting-version');
    const approvedEntry = entries.find((entry) => entry.operation === 'approve-setting-version');
    expect(preparedEntry).toMatchObject({ versionId: change.versionId, actor: { id: admin.id } });
    expect(approvedEntry).toMatchObject({
      versionId: change.versionId,
      actor: { id: approver.id },
      reason: 'SYNTHETIC approve reason',
    });
    expect(approvedEntry?.approvalDecisionId).not.toBeNull();
  });

  it('PRD-ACS-001 needs edit on the setting to prepare, naming what is missing', async () => {
    const answer = await prepare(approver, {
      setting: 'access.password-rules',
      value: { minimumLength: 13 },
      origin: 'synthetic',
      takesEffect: atDecision,
    });
    expect(answer.status).toBe(403);
    expect(errorOf(answer)).toMatchObject({
      code: 'access.not-authorised',
      missing: [{ kind: 'permission', recordType: 'access.setting', action: 'edit' }],
    });
  });

  it('POL-02.23 a rejected version never takes effect, and the version in force stays', async () => {
    const inForce = (await settingOf('access.sign-in-throttling')).inForceVersionId;
    const change = await prepared({
      setting: 'access.sign-in-throttling',
      value: { failureLimit: 2, windowSeconds: 600 },
      origin: 'synthetic',
      takesEffect: atDecision,
    });
    expect((await decide(approver, change, 'reject')).status).toBe(200);
    const after = await settingOf('access.sign-in-throttling');
    expect(after.inForceVersionId).toBe(inForce);
    expect(after.versions.find((version) => version.id === change.versionId)?.decision).toBe('Rejected');
  });
});

describe('an approved version applies at once (access-and-approvals 3.3; DEC-118)', () => {
  it('DEC-116 a new throttling applies to the next sign-in', async () => {
    await approved(
      await prepared({
        setting: 'access.sign-in-throttling',
        value: { failureLimit: 1, windowSeconds: 600 },
        origin: 'synthetic',
        takesEffect: atDecision,
      }),
    );
    const address = freshAddress();
    const wrong = await signIn(signer, { password: 'SYNTHETIC-wrong-password', address });
    expect(errorOf(wrong).code).toBe('access.sign-in-refused');
    // Under the earlier limit of three this attempt would be checked; under the new one it is slowed.
    const next = await signIn(signer, { address });
    expect(errorOf(next).code).toBe('access.sign-in-slowed');
    await approved(
      await prepared({
        setting: 'access.sign-in-throttling',
        value: SYNTHETIC_THROTTLING,
        origin: 'synthetic',
        takesEffect: atDecision,
      }),
    );
  });

  it('GC3-5 a new password-rules version applies to the next password set', async () => {
    await approved(
      await prepared({
        setting: 'access.password-rules',
        value: { minimumLength: 20 },
        origin: 'synthetic',
        takesEffect: atDecision,
      }),
    );
    const cookie = await sessionCookie(signer);
    const answer = await call('POST', '/api/access/password/change', {
      // Fifteen characters: enough under the earlier rules of twelve, too few under the new ones.
      body: { newPassword: 'SYNTHETIC-15chr', totpCode: nextCode(signer) },
      cookie,
      keyed: true,
    });
    expect(errorOf(answer).code).toBe('access.password-refused');
  });

  it('PRD-ACS-017 a new office session limit applies to the next request', async () => {
    const cookie = await sessionCookie(signer);
    expect((await call('GET', '/api/access/session', { cookie })).status).toBe(200);
    await approved(
      await prepared({
        setting: 'access.office-session-limits',
        value: { idleLockSeconds: 60, absoluteSeconds: 28_800 },
        origin: 'synthetic',
        takesEffect: atDecision,
      }),
    );
    clock.advance(61);
    // Idle longer than the new limit, far shorter than the earlier one: the session locks.
    const next = await call('GET', '/api/access/session', { cookie });
    expect(errorOf(next).code).toBe('access.session-locked');
  });
});

describe('a version from a later day (access-and-approvals 3.3; code-house-rules 7.3)', () => {
  it('code-house-rules 7.3 never starts a version in the past, today included, and schedules a later day', async () => {
    for (const date of [dayFromNow(-1), dayFromNow(0)]) {
      const answer = await prepare(admin, {
        setting: 'access.password-rules',
        value: { minimumLength: 13 },
        origin: 'synthetic',
        takesEffect: { kind: 'from-date', date },
      });
      expect(errorOf(answer).code).toBe('access.starts-in-past');
    }
    const inForce = (await settingOf('access.password-rules')).inForceVersionId;
    const tomorrow = dayFromNow(1);
    const scheduled = await prepared({
      setting: 'access.password-rules',
      value: { minimumLength: 13 },
      origin: 'synthetic',
      takesEffect: { kind: 'from-date', date: tomorrow },
    });
    await approved(scheduled);
    const after = await settingOf('access.password-rules');
    expect(after.inForceVersionId).toBe(inForce);
    expect(after.versions.find((version) => version.id === scheduled.versionId)).toMatchObject({
      decision: 'Approved',
      takesEffect: { kind: 'from-date', date: tomorrow },
      validFrom: `${tomorrow}T00:00:00.000Z`,
    });
    expect(after.versions.find((version) => version.id === inForce)?.validTo).toBe(`${tomorrow}T00:00:00.000Z`);
    // A version taking effect at its decision cannot pass one already scheduled after it.
    const now = await prepared({
      setting: 'access.password-rules',
      value: { minimumLength: 14 },
      origin: 'synthetic',
      takesEffect: atDecision,
    });
    expect(errorOf(await decide(approver, now)).code).toBe('access.version-overlaps');
  });
});
