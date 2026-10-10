import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  availabilitySchema,
  policyReadinessSchema,
  storedFileSchema,
  type Availability,
  type EvidenceFile,
  type PolicyReadinessItem,
  type SettingOrigin,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GatedOperation, ValidityCheck } from '../src/modules/configuration/index.js';
import { syntheticCode, syntheticIdentifier } from './fixtures/synthetic.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  SyntheticClock,
  SYNTHETIC_ORIGIN,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';

// S1-F04-T01: policy readiness and the Available check through the whole application, on real PostgreSQL and MinIO
// (module-map 4.4; domain-model 3.6, DM-6; access-and-approvals 7.1 step 2, 15 test 1; code-house-rules 12.3, 12.14;
// PRD-SEC-017, PRD-UXP-003, PRD-LIF-001; DEC-092, DEC-105, DEC-116). A test-only module declares SYNTHETIC
// business-effect operations and a validity check of its own (code-house-rules 11.4). Every status, value and file
// here is SYNTHETIC: no policy is Signed and no value validated for KDPS.

const GATE = syntheticIdentifier('gate');
const EFFECT = `${GATE}.post-synthetic-effect`;
const EFFECT_CAPABILITY = `${GATE}.synthetic-effect`;
const RECEIVING = `${GATE}.receive-synthetic`;
const RAISING = `${GATE}.raise-synthetic`;
const VALUES_CHECK = `${GATE}.synthetic-values`;
const EXCEPTION_TYPE = `${GATE}.synthetic-exception`;
/** The policy the synthetic operations name: Opening and cutover, chosen for the test only. */
const POLICY = 14;

/** The synthetic values the test-only module holds for policy 14, as its check reports them; the test moves them. */
const syntheticValues: { key: string; version: string; origin: SettingOrigin; enteredBy: string[] }[] = [];

const valuesCheck: ValidityCheck = {
  code: VALUES_CHECK,
  policy: POLICY,
  check: () => Promise.resolve({ kind: 'valid' }),
  values: () => Promise.resolve(syntheticValues.map((value) => ({ ...value }))),
  locks: () => Promise.resolve([]),
};

const operations: readonly GatedOperation[] = [
  { code: EFFECT, policy: POLICY, capability: EFFECT_CAPABILITY, activity: null, checks: [{ check: VALUES_CHECK }] },
  { code: RECEIVING, policy: 4, capability: `${GATE}.synthetic-receiving`, activity: 'receiving', checks: [] },
  {
    code: RAISING,
    policy: 17,
    capability: `${GATE}.synthetic-raising`,
    activity: null,
    checks: [
      { check: 'exceptions.exception-code-series' },
      { check: 'exceptions.exception-routing', subject: EXCEPTION_TYPE },
    ],
  },
];

const PDF = Buffer.from('%PDF-1.4\n% SYNTHETIC signed policy\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');

let world: SyntheticWorld;
let api: AccessTestApp;
let minio: TestFileStore;
let keys: Record<string, string>;
let clock: SyntheticClock;
const cookies = new Map<string, string>();
let admin: SyntheticUser;
let enterer: SyntheticUser;
let plain: SyntheticUser;
let otherAdmin: SyntheticUser;

interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const ADMIN_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'configuration.policy_status', action: 'view' },
  { recordType: 'configuration.policy_status', action: 'create' },
  { recordType: 'configuration.policy_validation', action: 'view' },
  { recordType: 'configuration.policy_validation', action: 'create' },
  { recordType: 'configuration.capability', action: 'edit' },
  { recordType: 'files_imports.stored_file', action: 'create' },
  { recordType: 'access.role', action: 'create' },
];

async function enrolled(
  database: string,
  organisationCode: string,
  label: string,
  authorities: readonly SyntheticAuthority[],
  app: AccessTestApp = api,
): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(database, organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
    personas: ['P-ADM'],
  });
  if (authorities.length > 0) await grantSynthetic(database, { kind: 'user', id: user.id }, authorities);
  await signIn(app, organisationCode, user);
  return user;
}

async function signIn(app: AccessTestApp, organisationCode: string, user: SyntheticUser): Promise<void> {
  clock.advance(30);
  const response = await fetch(`${app.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.61' },
    body: JSON.stringify({
      organisationCode,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now()),
    }),
  });
  expect(response.status).toBe(200);
  cookies.set(`${app.baseUrl}:${user.id}`, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
}

async function post(user: SyntheticUser, path: string, body: unknown, app: AccessTestApp = api): Promise<Call> {
  const response = await fetch(`${app.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: SYNTHETIC_ORIGIN,
      cookie: cookies.get(`${app.baseUrl}:${user.id}`) ?? '',
      'idempotency-key': uuidv7(),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function get(user: SyntheticUser, path: string, app: AccessTestApp = api): Promise<Call> {
  const response = await fetch(`${app.baseUrl}${path}`, {
    headers: { cookie: cookies.get(`${app.baseUrl}:${user.id}`) ?? '' },
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function availabilityOf(user: SyntheticUser, query: string, app: AccessTestApp = api): Promise<Availability> {
  const read = await get(user, `/api/access/availability?${query}`, app);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return availabilitySchema.parse(read.body);
}

async function readiness(user: SyntheticUser, app: AccessTestApp = api): Promise<PolicyReadinessItem[]> {
  const read = await get(user, '/api/access/policy-readiness', app);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return policyReadinessSchema.parse(read.body).policies;
}

async function evidence(user: SyntheticUser, app: AccessTestApp = api): Promise<EvidenceFile[]> {
  const stored = await post(
    user,
    '/api/files-imports/files',
    {
      sourceSystem: 'manual-upload',
      originalName: 'SYNTHETIC-policy-evidence.pdf',
      contentBase64: PDF.toString('base64'),
    },
    app,
  );
  expect(stored.status, JSON.stringify(stored.body)).toBe(200);
  const file = storedFileSchema.parse(stored.body);
  return [{ storedFileId: file.storedFileId, fileReceiptId: file.receiptId }];
}

const today = () => clock.now().toISOString().slice(0, 10);

async function sign(user: SyntheticUser, policy: number, app: AccessTestApp = api): Promise<Call> {
  return post(
    user,
    `/api/access/policy-readiness/${String(policy)}/signature`,
    { signatory: 'SYNTHETIC signatory', signedOn: today(), origin: 'synthetic', evidence: await evidence(user, app) },
    app,
  );
}

async function validate(user: SyntheticUser, policy: number): Promise<Call> {
  return post(user, `/api/access/policy-readiness/${String(policy)}/validation`, {
    origin: 'synthetic',
    evidence: await evidence(user),
  });
}

async function writeSettings(database: string): Promise<void> {
  await writeSyntheticSetting(database, 'access.sign-in-throttling', { failureLimit: 50, windowSeconds: 600 });
  await writeSyntheticSetting(database, 'access.password-rules', { minimumLength: 12 });
  await writeSyntheticSetting(database, 'access.office-session-limits', {
    idleLockSeconds: 1800,
    absoluteSeconds: 28800,
  });
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('policygate');
  keys = syntheticKeysEnvironment(world);
  for (const organisation of world.organisations) await writeSettings(organisation.database);
  minio = await startTestFileStore();
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, {
    clock,
    fileStoreEnvironment: minio.environment,
    gatedOperations: operations,
    validityChecks: [valuesCheck],
  });
  const [a, b] = world.organisations;
  admin = await enrolled(a.database, a.code, 'GATE-ADMIN', ADMIN_AUTHORITY);
  enterer = await enrolled(a.database, a.code, 'GATE-ENTERER', [
    { recordType: 'configuration.policy_validation', action: 'create' },
    { recordType: 'files_imports.stored_file', action: 'create' },
  ]);
  plain = await enrolled(a.database, a.code, 'GATE-PLAIN', [
    { recordType: 'files_imports.stored_file', action: 'create' },
  ]);
  otherAdmin = await enrolled(b.database, b.code, 'GATE-OTHER-ADMIN', ADMIN_AUTHORITY);
  syntheticValues.push({ key: 'syn-value-1', version: 'v1', origin: 'synthetic', enteredBy: [enterer.id] });
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('the stage 1 exit check (access-and-approvals 15 test 1; PRD-SEC-017, PRD-UXP-003)', () => {
  it('PRD-SEC-017 an operation whose policy is not Signed stays unavailable and names its blocking reason', async () => {
    const answer = await availabilityOf(plain, `operation=${EFFECT}`);
    expect(answer).toMatchObject({ operation: EFFECT, policy: POLICY, state: 'unavailable' });
    expect(answer.missing).toEqual(
      expect.arrayContaining([
        { kind: 'capability', capability: EFFECT_CAPABILITY },
        { kind: 'policy', policy: String(POLICY), lacks: 'signature' },
        { kind: 'policy', policy: String(POLICY), lacks: 'validation' },
      ]),
    );
  });

  it('DEC-092 Policy readiness lists the 19 policies, every one Open, and what each blocks', async () => {
    const policies = await readiness(admin);
    expect(policies.map((each) => each.policy)).toEqual([...Array(19).keys()].map((index) => index + 1));
    expect(policies.every((each) => each.state === 'Open' && each.signature === null)).toBe(true);
    const fourteen = policies.find((each) => each.policy === POLICY);
    expect(fourteen?.operations).toEqual([
      expect.objectContaining({ operation: EFFECT, capabilityOn: false, state: 'unavailable' }),
    ]);
    expect(fourteen?.values).toEqual([
      { check: VALUES_CHECK, key: 'syn-value-1', origin: 'synthetic', enteredByYou: false },
    ]);
  });

  it('PRD-SEC-005 needs view on the policy status to read Policy readiness', async () => {
    const refused = await get(plain, '/api/access/policy-readiness');
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ error: { code: 'access.not-authorised' } });
  });

  it('names an operation no module declared as not found', async () => {
    const read = await get(plain, `/api/access/availability?operation=${GATE}.never-declared`);
    expect(read.status).toBe(404);
    expect(read.body).toMatchObject({ error: { code: 'configuration.operation-not-found' } });
  });
});

describe('capability, signature and validation (module-map 4.4; DM-6; PRD-SEC-017; DEC-092, DEC-116)', () => {
  it('PRD-SEC-017 a capability is off until switched on; on, while the policy is not Signed, it stays unavailable', async () => {
    const before = await availabilityOf(plain, `operation=${EFFECT}`);
    expect(before.missing).toContainEqual({ kind: 'capability', capability: EFFECT_CAPABILITY });
    const switched = await post(admin, `/api/access/capabilities/${EFFECT_CAPABILITY}/switch`, { on: true });
    expect(switched.status, JSON.stringify(switched.body)).toBe(200);
    expect(switched.body).toEqual({ capability: EFFECT_CAPABILITY, on: true });
    const after = await availabilityOf(plain, `operation=${EFFECT}`);
    expect(after.state).toBe('unavailable');
    expect(after.missing).not.toContainEqual({ kind: 'capability', capability: EFFECT_CAPABILITY });
    expect(after.missing).toContainEqual({ kind: 'policy', policy: String(POLICY), lacks: 'signature' });
  });

  it('refuses a capability no declared operation uses', async () => {
    const refused = await post(admin, `/api/access/capabilities/${GATE}.no-such-feature/switch`, { on: true });
    expect(refused.status).toBe(404);
    expect(refused.body).toMatchObject({ error: { code: 'configuration.capability-not-found' } });
  });

  it('DEC-092 a Signed policy whose values are not validated is unavailable and names the missing validation', async () => {
    const signed = await sign(admin, POLICY);
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);
    const answer = await availabilityOf(plain, `operation=${EFFECT}`);
    expect(answer.state).toBe('unavailable');
    expect(answer.missing).toEqual([{ kind: 'policy', policy: String(POLICY), lacks: 'validation' }]);
    const fourteen = (await readiness(admin)).find((each) => each.policy === POLICY);
    expect(fourteen).toMatchObject({ state: 'Signed', signature: { signatory: 'SYNTHETIC signatory' } });
    expect(fourteen?.signature?.evidence).toHaveLength(1);
  });

  it('DM-6 refuses a validation by the person who entered the values', async () => {
    const refused = await validate(enterer, POLICY);
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({
      error: { code: 'configuration.validator-entered-values', missing: [{ kind: 'validator', policy: '14' }] },
    });
  });

  it('RR-480 refuses a validation of a policy no module reports values for yet (S1-F04 review S1)', async () => {
    const refused = await validate(admin, 3);
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(refused.body).toMatchObject({
      error: {
        code: 'configuration.no-values-to-validate',
        missing: [{ kind: 'policy', policy: '3', lacks: 'values' }],
      },
    });
    const three = (await readiness(admin)).find((each) => each.policy === 3);
    expect(three?.missing).toContainEqual({ kind: 'policy', policy: '3', lacks: 'validation' });
  });

  it('DM-6 refuses a validation by a person without the validate permission, and one with no evidence', async () => {
    const refused = await validate(plain, POLICY);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ error: { code: 'access.not-authorised' } });
    const none = await post(admin, `/api/access/policy-readiness/${String(POLICY)}/validation`, {
      origin: 'synthetic',
      evidence: [],
    });
    expect(none.status).toBe(400);
  });

  it('DM-6 accepts a validation with evidence by another holder of the permission, though they recorded Signed', async () => {
    const accepted = await validate(admin, POLICY);
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    const answer = await availabilityOf(plain, `operation=${EFFECT}`);
    expect(answer).toMatchObject({ state: 'available', missing: [] });
    const fourteen = (await readiness(admin)).find((each) => each.policy === POLICY);
    expect(fourteen?.validation).toMatchObject({ current: true, validatedBy: admin.displayName });
    expect(fourteen?.missing).toEqual([]);
  });

  it('DM-6 a validation stops covering the values once they change, so the operation is unavailable again', async () => {
    syntheticValues.push({ key: 'syn-value-2', version: 'v1', origin: 'synthetic', enteredBy: [admin.id] });
    try {
      const answer = await availabilityOf(plain, `operation=${EFFECT}`);
      expect(answer.missing).toEqual([{ kind: 'policy', policy: String(POLICY), lacks: 'validation' }]);
      const fourteen = (await readiness(admin)).find((each) => each.policy === POLICY);
      expect(fourteen?.validation?.current).toBe(false);
      // The admin entered the new value, so now cannot validate (DM-6).
      expect((await validate(admin, POLICY)).body).toMatchObject({
        error: { code: 'configuration.validator-entered-values' },
      });
    } finally {
      syntheticValues.pop();
    }
    expect((await availabilityOf(plain, `operation=${EFFECT}`)).state).toBe('available');
  });

  it('RR-478 a value changed in place under the same key lapses the validation (product owner, 10 Oct 2026)', async () => {
    const value = syntheticValues[0];
    if (value === undefined) throw new Error('no value');
    value.version = 'v2';
    try {
      const answer = await availabilityOf(plain, `operation=${EFFECT}`);
      expect(answer.missing).toEqual([{ kind: 'policy', policy: String(POLICY), lacks: 'validation' }]);
    } finally {
      value.version = 'v1';
    }
    expect((await availabilityOf(plain, `operation=${EFFECT}`)).state).toBe('available');
  });
});

describe('what the gate stops (DEC-116; access-and-approvals 7.1 step 2)', () => {
  it('PRD-SEC-017 never refuses a setup operation, which still needs its permission and independent approval', async () => {
    const draft = {
      code: syntheticCode(`ROLE-${String(randomInt(1_000_000))}`),
      name: 'SYNTHETIC gate reader',
      permissions: [{ kind: 'action', recordType: 'access.role', action: 'view', selfService: false }],
      validFrom: today(),
    };
    const prepared = await post(admin, '/api/access/roles', draft);
    expect(prepared.status, JSON.stringify(prepared.body)).toBe(200);
    expect(prepared.body.requestId).toEqual(expect.any(String));
    const refused = await post(plain, '/api/access/roles', { ...draft, code: syntheticCode('ROLE-REFUSED') });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ error: { code: 'access.not-authorised' } });
  });

  it('PRD-LIF-001 an operation that needs an activity grant is unavailable without it, naming the activity and the place', async () => {
    const siteId = uuidv7();
    const answer = await availabilityOf(plain, `operation=${RECEIVING}&siteId=${siteId}`);
    expect(answer.missing).toContainEqual({
      kind: 'activity',
      activity: 'receiving',
      placeType: 'site',
      placeId: siteId,
    });
    const unit = uuidv7();
    const byUnit = await availabilityOf(plain, `operation=${RECEIVING}&siteId=${siteId}&businessUnitId=${unit}`);
    expect(byUnit.missing).toContainEqual({
      kind: 'activity',
      activity: 'receiving',
      placeType: 'business-unit',
      placeId: unit,
    });
  });

  it('POL-02.16 an operation raising a numbered exception names the missing series and routing (S1-F08-T02)', async () => {
    const siteId = uuidv7();
    const answer = await availabilityOf(plain, `operation=${RAISING}&siteId=${siteId}`);
    expect(answer.missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'number-series' }),
        { kind: 'exception-routing', exceptionType: EXCEPTION_TYPE, siteId },
      ]),
    );
  });
});

describe('PRD-ACS-020 two synthetic Organisations', () => {
  it('status and capabilities of one change nothing in the other', async () => {
    const [, b] = world.organisations;
    const other = await readiness(otherAdmin);
    expect(other.every((each) => each.state === 'Open')).toBe(true);
    expect(other.find((each) => each.policy === POLICY)?.operations[0]).toMatchObject({ capabilityOn: false });
    const answer = await availabilityOf(otherAdmin, `operation=${EFFECT}`);
    expect(answer.missing).toEqual(
      expect.arrayContaining([
        { kind: 'capability', capability: EFFECT_CAPABILITY },
        { kind: 'policy', policy: String(POLICY), lacks: 'signature' },
      ]),
    );
    expect(b.code).not.toBe(world.organisations[0].code);
  });
});

describe('where a value came from (code-house-rules 12.14; DEC-116; RR-252, RR-401)', () => {
  it.each(['production', '', 'Dev'])(
    'does not start with the environment "%s" (S1-F04 review H1)',
    async (environment) => {
      await expect(
        startAccessApp(world, keys, { clock, fileStoreEnvironment: minio.environment, environment }),
      ).rejects.toThrow(/AOS_ENVIRONMENT/);
    },
  );

  it.each(['kdps-test'])(
    'refuses a synthetic Signed record, and a synthetic setting, with the environment "%s"',
    async (environment) => {
      const app = await startAccessApp(world, keys, {
        clock,
        fileStoreEnvironment: minio.environment,
        gatedOperations: operations,
        validityChecks: [valuesCheck],
        environment,
      });
      try {
        const [a] = world.organisations;
        await signIn(app, a.code, admin);
        const refused = await sign(admin, 3, app);
        expect(refused.status, JSON.stringify(refused.body)).toBe(422);
        expect(refused.body).toMatchObject({
          error: {
            code: 'configuration.origin-not-allowed',
            missing: [{ kind: 'origin', origin: 'synthetic', environment }],
          },
        });
        // The synthetic Signed record of policy 14 counts for nothing here: the operation is unavailable again.
        const answer = await availabilityOf(admin, `operation=${EFFECT}`, app);
        expect(answer.missing).toEqual(
          expect.arrayContaining([
            { kind: 'policy', policy: String(POLICY), lacks: 'signature' },
            { kind: 'origin', check: VALUES_CHECK, key: 'syn-value-1', origin: 'synthetic' },
          ]),
        );
      } finally {
        await app.close();
      }
    },
  );

  it('RR-401 refuses preparing a test-setup security setting outside kdps-test, and a synthetic one on kdps-test', async () => {
    const [a] = world.organisations;
    const settingsAdmin = await enrolled(a.database, a.code, 'GATE-SETTINGS', [
      { recordType: 'access.setting', action: 'edit' },
    ]);
    const draft = (origin: SettingOrigin) => ({
      setting: 'access.password-rules',
      value: { minimumLength: 14 },
      origin,
      takesEffect: { kind: 'at-decision' },
    });
    const testSetup = await post(settingsAdmin, '/api/access/security-settings/versions', draft('test-setup'));
    expect(testSetup.status).toBe(422);
    expect(testSetup.body).toMatchObject({
      error: { code: 'configuration.origin-not-allowed', missing: [{ origin: 'test-setup', environment: 'local' }] },
    });
    const app = await startAccessApp(world, keys, { clock, environment: 'kdps-test' });
    try {
      await signIn(app, a.code, settingsAdmin);
      const synthetic = await post(settingsAdmin, '/api/access/security-settings/versions', draft('synthetic'), app);
      expect(synthetic.status).toBe(422);
      expect(synthetic.body).toMatchObject({ error: { code: 'configuration.origin-not-allowed' } });
      const accepted = await post(settingsAdmin, '/api/access/security-settings/versions', draft('test-setup'), app);
      expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    } finally {
      await app.close();
    }
  });
});
