import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  assignmentListSchema,
  errorEnvelopeSchema,
  reasonListSchema,
  roleListSchema,
  userListSchema,
  type PersonaId,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  SYNTHETIC_ORIGIN,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { writeSyntheticServiceIdentity } from './support/jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';

// S1-F01-T16: the reads behind the access setup screens (access-and-approvals 2.1, 4, 5, 9.5, 14; RR-326; spec
// section 6): users, roles, role assignments and reasons, every version with the state the screen shows, read through
// the whole application as the runtime role. Every value here is SYNTHETIC.

const PREPARED_TYPES = ['access.user', 'access.role', 'access.role_assignment', 'access.approval_reason'];
const all = { kind: 'all' } as const;

let world: SyntheticWorld;
let database: string;
let organisationCode: string;
let api: AccessTestApp;
let keys: Record<string, string>;
let adminCookie: string;
let admin: SyntheticUser;

const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

async function signedIn(
  label: string,
  authorities: readonly SyntheticAuthority[],
  personas: PersonaId[] = [],
): Promise<{ user: SyntheticUser; cookie: string }> {
  const user = await writeSyntheticUser(database, organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
    personas,
  });
  if (authorities.length > 0) await grantSynthetic(database, { kind: 'user', id: user.id }, authorities);
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.16' },
    body: JSON.stringify({
      organisationCode,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0)),
    }),
  });
  expect(response.status).toBe(200);
  return { user, cookie: (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '' };
}

async function post(path: string, body: unknown): Promise<{ status: number; body: Record<string, string> }> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: SYNTHETIC_ORIGIN,
      cookie: adminCookie,
      'idempotency-key': uuidv7(),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, string> };
}

async function get(path: string, cookie = adminCookie): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie } });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('records');
  database = world.organisations[0].database;
  organisationCode = world.organisations[0].code;
  keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(database, 'access.sign-in-throttling', { failureLimit: 50, windowSeconds: 600 });
  await writeSyntheticSetting(database, 'access.password-rules', { minimumLength: 12 });
  await writeSyntheticSetting(database, 'access.office-session-limits', {
    idleLockSeconds: 1800,
    absoluteSeconds: 28800,
  });
  api = await startAccessApp(world, keys);
  const signed = await signedIn(
    'ADMIN',
    PREPARED_TYPES.flatMap((recordType) =>
      (['view', 'create', 'edit'] as const).map((action) => ({ recordType, action })),
    ),
    ['P-ADM'],
  );
  admin = signed.user;
  adminCookie = signed.cookie;
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('the user list (access-and-approvals 2.1; DEC-112; RR-214)', () => {
  it('shows each user with every version, its personas, its user state and its own state', async () => {
    const prepared = await post('/api/access/users', {
      login: `SYN-NEW-${String(randomInt(1_000_000))}`,
      displayName: 'SYNTHETIC new user',
      personas: ['P-AUD'],
      temporaryPassword: 'SYNTHETIC-temporary-1',
    });
    expect(prepared.status).toBe(200);
    const read = await get('/api/access/users');
    expect(read.status).toBe(200);
    const list = userListSchema.parse(read.body);
    const created = list.users.find((user) => user.id === prepared.body.userId);
    expect(created?.versions).toEqual([
      {
        id: prepared.body.versionId,
        displayName: 'SYNTHETIC new user',
        personas: ['P-AUD'],
        userState: 'Active',
        validFrom: today(),
        state: 'Awaiting approval',
        request: { id: prepared.body.requestId, state: 'Awaiting approval' },
      },
    ]);
    const self = list.users.find((user) => user.id === admin.id);
    expect(self?.login).toBe(admin.login);
    expect(self?.versions[0]).toMatchObject({ personas: ['P-ADM'], userState: 'Active', state: 'In force' });
    expect(self?.versions[0]?.request).toBeUndefined();
  });
});

describe('the role list (access-and-approvals 4.1, 4.2, 9.6)', () => {
  it('shows each version with its explicit permissions; a newer version supersedes the request of the older', async () => {
    const code = `SYN-ROLE-${String(randomInt(1_000_000))}`;
    const first = await post('/api/access/roles', {
      code,
      name: 'SYNTHETIC reader',
      permissions: [{ kind: 'action', recordType: 'access.role', action: 'view', selfService: false }],
      validFrom: today(),
    });
    expect(first.status).toBe(200);
    const second = await post(`/api/access/roles/${first.body.roleId ?? ''}/versions`, {
      name: 'SYNTHETIC reader 2',
      permissions: [{ kind: 'action', recordType: 'access.user', action: 'view', selfService: false }],
      validFrom: tomorrow(),
    });
    expect(second.status).toBe(200);
    const list = roleListSchema.parse((await get('/api/access/roles')).body);
    const role = list.roles.find((each) => each.id === first.body.roleId);
    expect(role).toMatchObject({ code, selfService: false });
    expect(role?.versions.map((version) => [version.id, version.name, version.state])).toEqual([
      [second.body.versionId, 'SYNTHETIC reader 2', 'Awaiting approval'],
      [first.body.versionId, 'SYNTHETIC reader', 'Superseded'],
    ]);
    expect(role?.versions[0]?.permissions).toEqual([
      { kind: 'action', recordType: 'access.user', action: 'view', selfService: false },
    ]);
    expect(role?.versions[1]?.request?.state).toBe('Superseded');
  });
});

describe('the role assignment list (access-and-approvals 4.3, 5.1)', () => {
  it('shows the actor by name, the role by code, the scope per dimension, the dates and the state', async () => {
    const role = await post('/api/access/roles', {
      code: `SYN-ROLE-${String(randomInt(1_000_000))}`,
      name: 'SYNTHETIC assigned',
      permissions: [{ kind: 'action', recordType: 'access.role', action: 'view', selfService: false }],
      validFrom: today(),
    });
    const scope = { kind: 'dimensions', legalEntity: all, place: { kind: 'empty' }, brand: all };
    const prepared = await post('/api/access/role-assignments', {
      actor: { kind: 'user', userId: admin.id },
      roleId: role.body.roleId,
      scope,
      validFrom: tomorrow(),
    });
    expect(prepared.status).toBe(200);
    const list = assignmentListSchema.parse((await get('/api/access/role-assignments')).body);
    const found = list.assignments.find((each) => each.id === prepared.body.assignmentId);
    expect(found).toMatchObject({
      actor: { kind: 'user', userId: admin.id, name: admin.displayName },
      role: { id: role.body.roleId },
      scope,
      validFrom: tomorrow(),
      state: 'Awaiting approval',
      request: { id: prepared.body.requestId, state: 'Awaiting approval' },
    });
    expect(found?.withdrawal).toBeUndefined();
    // The admin's own assignment, written approved from yesterday, is in force.
    expect(
      list.assignments
        .filter((each) => each.actor.kind === 'user' && each.actor.userId === admin.id)
        .map((each) => each.state),
    ).toContain('In force');
  });
});

describe('PRD-SEC-018 no screen lists a service identity (access-and-approvals 2.3, 14; RR-343)', () => {
  it('leaves a service identity’s role and its assignment out of the role and assignment lists', async () => {
    const identity = await writeSyntheticServiceIdentity(database, `syn-worker-${String(randomInt(1_000_000))}`);
    const { roleId, assignmentId } = await grantSynthetic(database, { kind: 'service-identity', id: identity }, [
      { recordType: 'access.role', action: 'view' },
    ]);
    const roles = roleListSchema.parse((await get('/api/access/roles')).body);
    expect(roles.roles.map((each) => each.id)).not.toContain(roleId);
    expect(roles.roles.length).toBeGreaterThan(0);
    const assignments = assignmentListSchema.parse((await get('/api/access/role-assignments')).body);
    expect(assignments.assignments.map((each) => each.id)).not.toContain(assignmentId);
    expect(assignments.assignments.every((each) => each.actor.kind === 'user')).toBe(true);
  });
});

describe('the reason list (access-and-approvals 9.5; POL-02.23)', () => {
  it('shows every reason with every version, not only those in force', async () => {
    const code = `SYN-REASON-${String(randomInt(1_000_000))}`;
    const prepared = await post('/api/access/approval-reasons', {
      code,
      kind: 'reject',
      text: 'SYNTHETIC reject reason',
      validFrom: today(),
    });
    expect(prepared.status).toBe(200);
    const list = reasonListSchema.parse((await get('/api/access/approval-reasons/records')).body);
    expect(list.reasons.find((each) => each.id === prepared.body.reasonId)).toEqual({
      id: prepared.body.reasonId,
      code,
      kind: 'reject',
      versions: [
        {
          id: prepared.body.versionId,
          text: 'SYNTHETIC reject reason',
          validFrom: today(),
          state: 'Awaiting approval',
          request: { id: prepared.body.requestId, state: 'Awaiting approval' },
        },
      ],
    });
  });
});

describe('PRD-UXP-003 a reader without the view permission', () => {
  it('is refused, naming the permission missing', async () => {
    const { cookie } = await signedIn('NOVIEW', []);
    for (const [path, recordType] of [
      ['/api/access/users', 'access.user'],
      ['/api/access/roles', 'access.role'],
      ['/api/access/role-assignments', 'access.role_assignment'],
      ['/api/access/approval-reasons/records', 'access.approval_reason'],
    ] as const) {
      const read = await get(path, cookie);
      expect(read.status).toBe(403);
      const envelope = errorEnvelopeSchema.parse(read.body);
      expect(envelope.error.code).toBe('access.not-authorised');
      expect(envelope.error.missing).toEqual([{ kind: 'permission', recordType, action: 'view' }]);
    }
  });
});
