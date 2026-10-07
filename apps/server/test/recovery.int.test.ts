import { randomBytes } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import { Secret, setupRequestSchema } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runRecovery, runSetupStep, type RecoveryOptions } from '../src/modules/access/index.js';
// The access module's own hash check, read only to show the new temporary password verifies (code-house-rules 11.2).
import { verifyPassword } from '../src/modules/access/domain/password-hash.js';
import { serviceIdentitiesOf } from '../src/setup-organisation.js';
import { jobRegistry } from '../src/worker.module.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { writeSyntheticUser } from './support/access.js';
import { grantSynthetic } from './support/grants.js';
import { capturingLogger } from './support/jobs.js';
import { connect, createTestDatabase, databaseUrl, dropDatabase } from './support/postgres.js';

// S1-F01-T10: the operator's recovery command for the first two users (access-and-approvals 3.2, 15 test 3f; GC3-13,
// DEC-116), on an Organisation the setup step created. Every value is SYNTHETIC.

const ADMIN_LOGIN = syntheticCode('ADMIN').toLowerCase();
const APPROVER_LOGIN = syntheticCode('APPROVER').toLowerCase();
const NEW_PASSWORD = 'SYNTHETIC-recovered-temporary-1';

let directory: string;
let code: string;
let database: string;

beforeAll(async () => {
  directory = await createTestDatabase('directory', 'recovery_dir');
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  code = syntheticCode(`ORG-T10R-${suffix}`);
  database = `syn_t10r_${suffix.toLowerCase()}`;
  const outcome = await runSetupStep({
    migrationConnectionString: databaseUrl(directory, 'migration'),
    runtimeConnectionString: databaseUrl(directory, 'runtime'),
    request: setupRequestSchema.parse({
      organisationCode: code,
      databaseName: database,
      firstAdmin: {
        login: ADMIN_LOGIN,
        displayName: syntheticName('Admin'),
        personas: ['P-ADM'],
        temporaryPassword: 'SYNTHETIC-admin-temporary-1',
      },
      firstApprover: {
        login: APPROVER_LOGIN,
        displayName: syntheticName('Approver'),
        personas: [],
        temporaryPassword: 'SYNTHETIC-approver-temporary-1',
      },
      settings: {
        origin: 'synthetic',
        timezone: 'Asia/Kolkata',
        passwordRules: { minimumLength: 12 },
        signInThrottling: { failureLimit: 5, windowSeconds: 600 },
        officeSessionLimits: { idleLockSeconds: 1800, absoluteSeconds: 28_800 },
      },
    }),
    serviceIdentities: serviceIdentitiesOf(jobRegistry),
    logger: capturingLogger().logger,
  });
  expect(outcome.outcome).toBe('created');
});

afterAll(async () => {
  if ((database as string | undefined) !== undefined) await dropDatabase(database);
  if ((directory as string | undefined) !== undefined) await dropDatabase(directory);
});

function recover(change: Partial<RecoveryOptions> = {}, logger = capturingLogger()) {
  return runRecovery({
    runtimeConnectionString: databaseUrl(directory, 'runtime'),
    organisationCode: code,
    login: ADMIN_LOGIN,
    reset: 'password',
    temporaryPassword: new Secret(NEW_PASSWORD),
    identityVerification: 'SYNTHETIC: met in person, photo identity checked',
    logger: logger.logger,
    ...change,
  });
}

async function rows<T extends object>(text: string, values: unknown[] = []): Promise<T[]> {
  const client = await connect(database, 'migration');
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

async function userId(login: string): Promise<string> {
  const [row] = await rows<{ id: string }>('select id from access.app_user where login = $1', [login]);
  if (row === undefined) throw new Error('No such user');
  return row.id;
}

/** A SYNTHETIC session In force, written directly, as a signed-in user would hold one. */
async function writeSession(user: string): Promise<string> {
  const id = uuidv7();
  await rows(
    `insert into access.session (id, app_user_id, identifier_hash, kind, device_id, state, started_at, last_activity_at)
     values ($1, $2, $3, 'office', null, 'In force', now(), now())`,
    [id, user, randomBytes(32).toString('hex')],
  );
  return id;
}

async function grantsAndAssignments(): Promise<{ assignments: string; grants: string }> {
  const [row] = await rows<{ assignments: string; grants: string }>(
    `select (select count(*) from access.role_assignment)::text as assignments,
            (select count(*) from access.effective_grant)::text as grants`,
  );
  return row ?? { assignments: '', grants: '' };
}

describe('the recovery command (access-and-approvals 3.2; test 3f; DEC-116)', () => {
  it('PRD-SEC-008 restores a lost password of the first Admin: revokes the sessions, records how identity was verified', async () => {
    const admin = await userId(ADMIN_LOGIN);
    const session = await writeSession(admin);
    const before = await grantsAndAssignments();
    const logger = capturingLogger();
    const outcome = await recover({}, logger);
    expect(outcome).toEqual({ outcome: 'recovered', reset: 'password', userId: admin, revokedSessionIds: [session] });

    const [state] = await rows<{ state: string }>('select state from access.session where id = $1', [session]);
    expect(state).toEqual({ state: 'Revoked' });
    const credentials = await rows<{ password_hash: string | null; temporary: boolean; replaced: boolean }>(
      `select password_hash, temporary, replaced_at is not null as replaced from access.password_credential
       where app_user_id = $1 order by recorded_at, id`,
      [admin],
    );
    expect(credentials.map((row) => [row.replaced, row.password_hash === null])).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(credentials[1]?.temporary).toBe(true);
    expect(await verifyPassword(credentials[1]?.password_hash ?? '', new Secret(NEW_PASSWORD))).toBe(true);

    const access = await rows<{ kind: string; identity_verification: string | null }>(
      `select kind, identity_verification from audit.access_record where user_id = $1 and kind in
       ('operator-recovery', 'session-revoked') order by kind`,
      [admin],
    );
    expect(access).toEqual([
      { kind: 'operator-recovery', identity_verification: 'SYNTHETIC: met in person, photo identity checked' },
      { kind: 'session-revoked', identity_verification: null },
    ]);
    const [setup] = await rows<{ id: string }>("select id from access.service_identity where code = 'setup'");
    const audit = await rows<{ actor_kind: string; actor_id: string; source_kind: string; changes: unknown }>(
      `select actor_kind, actor_id::text, source_kind, changes from audit.audit_record
       where operation = 'recover-first-user' and record_type = 'user_credential'`,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actor_kind: 'service-identity',
      actor_id: setup?.id,
      source_kind: 'operator-command',
    });
    // It grants no role or permission (DEC-116), and keeps no secret anywhere (PRD-SEC-014).
    expect(await grantsAndAssignments()).toEqual(before);
    expect(JSON.stringify(audit)).not.toContain(NEW_PASSWORD);
    expect(JSON.stringify(logger.lines)).not.toContain(NEW_PASSWORD);
  });

  it('restores a lost authenticator of the first approver: the user enrols again at the next sign-in', async () => {
    const approver = await userId(APPROVER_LOGIN);
    await rows(
      `insert into access.second_factor (id, app_user_id, secret_scheme, secret_ciphertext, state, last_used_step, confirmed_at)
       values ($1, $2, 'synthetic', 'SYNTHETIC-not-a-secret', 'Confirmed', null, now())`,
      [uuidv7(), approver],
    );
    const outcome = await recover({
      login: APPROVER_LOGIN.toUpperCase(),
      reset: 'authenticator',
      temporaryPassword: undefined,
    });
    expect(outcome).toMatchObject({ outcome: 'recovered', reset: 'authenticator', userId: approver });
    const factors = await rows<{ state: string }>('select state from access.second_factor where app_user_id = $1', [
      approver,
    ]);
    expect(factors).toEqual([{ state: 'Reset' }]);
  });

  it('is refused for a user the setup step did not create, and for an Organisation the directory does not list', async () => {
    const other = await writeSyntheticUser(database, code, {}, { label: 'OTHER' });
    expect(await recover({ login: other.login })).toEqual({ outcome: 'refused', reason: 'not-a-first-user' });
    expect(await recover({ organisationCode: syntheticCode('ORG-UNLISTED') })).toEqual({
      outcome: 'refused',
      reason: 'organisation-not-found',
    });
  });

  it('GC3-5 checks the new temporary password against the password rules; refused, nothing is written', async () => {
    const admin = await userId(ADMIN_LOGIN);
    const [before] = await rows<{ count: string }>(
      'select count(*)::text as count from access.password_credential where app_user_id = $1',
      [admin],
    );
    // S1-F01-T31: the refusal names the rule and the setting's value, and nothing of the password.
    const refused = await recover({ temporaryPassword: new Secret('SYN-short') });
    expect(refused).toEqual({
      outcome: 'refused',
      reason: 'password-refused',
      passwordRule: { ok: false, rule: 'minimum-length', minimumLength: 12 },
    });
    expect(JSON.stringify(refused)).not.toContain('SYN-short');
    expect(await recover({ identityVerification: '  ' })).toEqual({
      outcome: 'refused',
      reason: 'identity-verification-missing',
    });
    const [after] = await rows<{ count: string }>(
      'select count(*)::text as count from access.password_credential where app_user_id = $1',
      [admin],
    );
    expect(after).toEqual(before);
  });

  it('DEC-116 is refused once a user of the Organisation holds the permission to reset credentials', async () => {
    const holder = await writeSyntheticUser(database, code, {}, { label: 'RESETTER' });
    await grantSynthetic(database, { kind: 'user', id: holder.id }, [
      { recordType: 'access.user_credential', action: 'edit' },
    ]);
    expect(await recover()).toEqual({ outcome: 'refused', reason: 'reset-permission-held' });
  });
});
