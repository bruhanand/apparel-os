import { randomBytes } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import { Secret, errorEnvelopeSchema } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMAND_RUNNER,
  newCorrelationId,
  ORGANISATION_ROUTER,
  REPLAY_SECRET_CHECK,
  RESTRICTED_VALUE_CIPHER,
  timezoneNotConfigured,
  type CommandRunner,
  type OrganisationRouter,
  type ReplaySecretCheck,
  type RestrictedValueCipher,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { ACCESS, type AccessInterface } from '../src/modules/access/index.js';
// Read only to hash a SYNTHETIC service secret as the module does, until issuing a credential is a command.
import { hashPassword } from '../src/modules/access/domain/password-hash.js';
import {
  codeFor,
  startAccessApp,
  SYNTHETIC_ORIGIN,
  syntheticKeysEnvironment,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
} from './support/access.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F01-T08: the contracts access implements for the idempotency helper (code-house-rules 12.4, 12.5; RR-248),
// service identities and their credentials (access-and-approvals 2.3; PRD-SEC-018), and sign-in with no timezone set.
// Every value is SYNTHETIC.

let world: SyntheticWorld;
let keys: Record<string, string>;
let api: AccessTestApp;
let organisation: RoutedOrganisation;

beforeAll(async () => {
  world = await createSyntheticOrganisations('access_contracts');
  keys = syntheticKeysEnvironment(world);
  api = await startAccessApp(world, keys);
  const routed = await api.app
    .get<OrganisationRouter>(ORGANISATION_ROUTER)
    .resolveForSignIn(world.organisations[0].code);
  if (!routed.routed) throw new Error('not routed');
  organisation = routed.organisation;
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

function read<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
  return api.app.get<CommandRunner>(COMMAND_RUNNER).read(
    {
      commandName: 'access.synthetic-check',
      organisation,
      correlationId: newCorrelationId(),
      actor: { kind: 'actor', actorId: uuidv7() },
    },
    work,
  );
}

describe('the replay secret check (code-house-rules 12.5; RR-248)', () => {
  it('PRD-INT-002 compares a new password with the current credential, and cannot once it is replaced', async () => {
    const user = await writeSyntheticUser(organisation.databaseName, organisation.organisationCode, keys, {
      label: 'REPLAY',
    });
    const check = api.app.get<ReplaySecretCheck>(REPLAY_SECRET_CHECK);
    const owner = await connect(organisation.databaseName, 'migration');
    try {
      const credential = (
        await owner.query<{ id: string }>('select id from access.password_credential where app_user_id = $1', [user.id])
      ).rows[0]?.id;
      if (credential === undefined) throw new Error('no credential');
      const compare = (secret: string, ids = [credential]) =>
        read((context) =>
          check.compare(context, { credentialIds: ids, secrets: new Map([['newPassword', new Secret(secret)]]) }),
        );
      expect(await compare(user.password)).toBe('same');
      expect(await compare('SYNTHETIC-other')).toBe('differs');
      expect(await compare(user.password, [credential, uuidv7()])).toBe('not-comparable');
      expect(await compare(user.password, [uuidv7()])).toBe('not-comparable');
      await owner.query(
        'update access.password_credential set replaced_at = now(), password_hash = null where id = $1',
        [credential],
      );
      expect(await compare(user.password)).toBe('not-comparable');
    } finally {
      await owner.end();
    }
  });
});

describe('the restricted-value cipher (code-house-rules 12.4; access-and-approvals 6; RR-248)', () => {
  it('PRD-SEC-006 encrypts under the Organisation key and refuses an Organisation with none', async () => {
    const cipher = api.app.get<RestrictedValueCipher>(RESTRICTED_VALUE_CIPHER);
    const sealed = await cipher.encrypt(organisation.organisationCode, 'salary-and-payroll', '"SYNTHETIC 1234"');
    expect(sealed.scheme).toBe('aes-256-gcm/hkdf-sha256/1');
    expect(sealed.ciphertext).not.toContain('SYNTHETIC');
    await expect(cipher.encrypt('SYN-ORG-UNKEYED', 'salary-and-payroll', '"x"')).rejects.toThrow();
  });
});

describe('service identities (access-and-approvals 2.3; PRD-SEC-018)', () => {
  it('PRD-SEC-018 authenticates an enabled internal identity, and an outside caller by an unrevoked credential', async () => {
    const owner = await connect(organisation.databaseName, 'migration');
    const internal = uuidv7();
    const outside = uuidv7();
    const credential = uuidv7();
    const secret = `SYNTHETIC-${randomBytes(12).toString('hex')}`;
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    try {
      await owner.query(
        `insert into access.service_identity (id, code, kind) values ($1, 'SYN-WORKER', 'internal'), ($2, 'SYN-CALLER', 'outside-caller')`,
        [internal, outside],
      );
      await owner.query(
        `insert into access.service_identity_version (id, service_identity_id, state, valid_during, decision)
         values ($1, $2, 'Active', daterange($4::date, null), 'Approved'), ($3, $5, 'Active', daterange($4::date, null), 'Approved')`,
        [uuidv7(), internal, uuidv7(), yesterday, outside],
      );
      await owner.query(
        'insert into access.service_credential (id, service_identity_id, secret_hash, revoked_at) values ($1, $2, $3, null)',
        [credential, outside, await hashPassword(new Secret(secret))],
      );
      const access = api.app.get<AccessInterface>(ACCESS);
      expect(await read((context) => access.authenticateInternalIdentity(context, 'SYN-WORKER'))).toEqual({
        serviceIdentityId: internal,
        code: 'SYN-WORKER',
        kind: 'internal',
      });
      expect(await read((context) => access.authenticateInternalIdentity(context, 'SYN-CALLER'))).toBeUndefined();
      expect(
        await read((context) => access.authenticateServiceCredential(context, credential, new Secret(secret))),
      ).toMatchObject({
        serviceIdentityId: outside,
      });
      expect(
        await read((context) =>
          access.authenticateServiceCredential(context, credential, new Secret('SYNTHETIC-wrong')),
        ),
      ).toBeUndefined();
      await owner.query('update access.service_credential set revoked_at = now() where id = $1', [credential]);
      expect(
        await read((context) => access.authenticateServiceCredential(context, credential, new Secret(secret))),
      ).toBeUndefined();
      // Revoked is final (access-and-approvals 2.3).
      await expect(
        owner.query('update access.service_credential set revoked_at = null where id = $1', [credential]),
      ).rejects.toThrow();
    } finally {
      await owner.end();
    }
  });
});

describe('sign-in with no timezone (code-house-rules 9, 12.14)', () => {
  it('PRD-SEC-017 is unavailable, naming the timezone setting, and no session reaches anything', async () => {
    const second = await createSyntheticOrganisations('access_no_timezone');
    const secondKeys = syntheticKeysEnvironment(second);
    const app = await startAccessApp(second, secondKeys, { timezone: timezoneNotConfigured });
    try {
      const [org] = second.organisations;
      await writeSyntheticSetting(org.database, 'access.sign-in-throttling', { failureLimit: 3, windowSeconds: 600 });
      const user = await writeSyntheticUser(org.database, org.code, secondKeys, {
        label: 'NO-TIMEZONE',
        enrolled: true,
      });
      const response = await fetch(`${app.baseUrl}/api/access/sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN },
        body: JSON.stringify({
          organisationCode: org.code,
          login: user.login,
          password: user.password,
          totpCode: codeFor(user.factorSecret ?? Buffer.alloc(20)),
        }),
      });
      expect(response.status).toBe(403);
      expect(errorEnvelopeSchema.parse(await response.json()).error).toMatchObject({
        code: 'access.sign-in-unavailable',
        missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
      });
    } finally {
      await app.close();
      await second.reset();
    }
  });
});
