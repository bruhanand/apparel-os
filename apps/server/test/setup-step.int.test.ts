import { randomBytes } from 'node:crypto';
import { routes, setupRequestSchema, type SetupRequestInput } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurationTimezoneSource } from '../src/modules/configuration/index.js';
import { runSetupStep, SetupRequestRefused } from '../src/modules/access/index.js';
import { serviceIdentitiesOf } from '../src/setup-organisation.js';
import { jobRegistry } from '../src/worker.module.js';
// The access module's own hash check, read only to show the first run's credentials still verify (code-house-rules 11.2).
import { verifyPassword } from '../src/modules/access/domain/password-hash.js';
import { Secret } from '@apparel-os/schemas';
import { ORGANISATION_KEYS_VARIABLE } from '../src/modules/access/index.js';
import { startAccessApp, SYNTHETIC_ORIGIN, writeSyntheticUser } from './support/access.js';
import { capturingLogger } from './support/jobs.js';
import { connect, createTestDatabase, databaseUrl, dropDatabase } from './support/postgres.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import type { SyntheticWorld } from './support/organisations.js';

// S1-F01-T10: the setup step of a new Organisation (access-and-approvals 9.11, 15 tests 19a, 19d, 19e; spec sections
// 9 to 11; S1-F01-AT01), on real PostgreSQL: the directory and every Organisation database it creates live on the
// test server. Every value is SYNTHETIC; none is a default.

let directory: string;
const created: string[] = [];

beforeAll(async () => {
  directory = await createTestDatabase('directory', 'setup_dir');
});

afterAll(async () => {
  for (const name of created.splice(0)) await dropDatabase(name);
  if ((directory as string | undefined) !== undefined) await dropDatabase(directory);
});

/** A fresh SYNTHETIC code and database name, the database dropped at the end of the file. */
function freshOrganisation(): { code: string; databaseName: string } {
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  const databaseName = `syn_t10_${suffix.toLowerCase()}`;
  created.push(databaseName);
  return { code: syntheticCode(`ORG-T10-${suffix}`), databaseName };
}

const ADMIN_PASSWORD = 'SYNTHETIC-admin-temporary-1';
const APPROVER_PASSWORD = 'SYNTHETIC-approver-temporary-1';

function request(
  organisation: { code: string; databaseName: string },
  change: (input: SetupRequestInput) => void = () => undefined,
) {
  const input: SetupRequestInput = {
    organisationCode: organisation.code,
    databaseName: organisation.databaseName,
    firstAdmin: {
      login: syntheticCode('ADMIN').toLowerCase(),
      displayName: syntheticName('Admin'),
      personas: ['P-ADM'],
      temporaryPassword: ADMIN_PASSWORD,
    },
    firstApprover: {
      login: syntheticCode('APPROVER').toLowerCase(),
      displayName: syntheticName('Approver'),
      personas: ['P-OWN'],
      temporaryPassword: APPROVER_PASSWORD,
    },
    settings: {
      origin: 'synthetic',
      timezone: 'Asia/Kolkata',
      passwordRules: { minimumLength: 12 },
      signInThrottling: { failureLimit: 5, windowSeconds: 600 },
      officeSessionLimits: { idleLockSeconds: 1800, absoluteSeconds: 28_800 },
    },
  };
  change(input);
  return setupRequestSchema.parse(input);
}

function run(parsed: ReturnType<typeof request>, logger = capturingLogger()) {
  return runSetupStep({
    migrationConnectionString: databaseUrl(directory, 'migration'),
    runtimeConnectionString: databaseUrl(directory, 'runtime'),
    request: parsed,
    serviceIdentities: serviceIdentitiesOf(jobRegistry),
    logger: logger.logger,
  });
}

async function rows<T extends object>(database: string, text: string, values: unknown[] = []): Promise<T[]> {
  const client = await connect(database, 'migration');
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

/** Every row count the step writes, to show a refused run writes nothing. */
async function footprint(database: string): Promise<Record<string, number>> {
  const tables = [
    'access.app_user',
    'access.password_credential',
    'access.role',
    'access.role_assignment',
    'access.service_identity',
    'access.setting_version',
    'access.setup_record',
    'audit.audit_record',
    'audit.access_record',
    'configuration.organisation_timezone_version',
    'kernel.migration',
  ];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const [row] = await rows<{ count: string }>(database, `select count(*)::text as count from ${table}`);
    counts[table] = Number(row?.count);
  }
  return counts;
}

async function listed(code: string): Promise<string[]> {
  return (
    await rows<{ database_name: string }>(
      directory,
      'select database_name from kernel.directory_entry where organisation_code = $1',
      [code],
    )
  ).map((row) => row.database_name);
}

/** Interrupts a finished run after its transaction, before its directory entry (9.11), by removing the entry. */
async function interrupt(code: string): Promise<void> {
  await rows(directory, 'delete from kernel.directory_entry where organisation_code = $1', [code]);
}

/** The permissions each role grants, as `recordType action`, sorted. */
async function permissionsOf(database: string, roleCode: string): Promise<string[]> {
  return (
    await rows<{ permission: string }>(
      database,
      `select p.record_type || ' ' || p.action as permission
       from access.role r join access.role_version v on v.role_id = r.id join access.role_permission p on p.role_version_id = v.id
       where r.code = $1 and v.decision = 'Approved' order by 1`,
      [roleCode],
    )
  ).map((row) => row.permission);
}

describe('a new Organisation (access-and-approvals 9.11; S1-F01-AT01, test 19a)', () => {
  let organisation: { code: string; databaseName: string };
  let logger: ReturnType<typeof capturingLogger>;

  beforeAll(async () => {
    organisation = freshOrganisation();
    logger = capturingLogger();
    expect(await run(request(organisation), logger)).toEqual({
      outcome: 'created',
      organisationCode: organisation.code,
    });
  });

  it('PRD-ACS-023 DEC-101 creates the database, the first Admin and the first approver, and lists the code last', async () => {
    expect(await listed(organisation.code)).toEqual([organisation.databaseName]);
    const users = await rows<{
      login: string;
      display_name: string;
      state: string;
      decision: string;
      personas: string;
    }>(
      organisation.databaseName,
      `select u.login, v.display_name, v.state, v.decision,
              coalesce(string_agg(p.persona, ',' order by p.position), '') as personas
       from access.app_user u join access.app_user_version v on v.app_user_id = u.id
       left join access.persona_held p on p.app_user_version_id = v.id
       group by u.login, v.display_name, v.state, v.decision order by u.login`,
    );
    expect(users).toEqual([
      { login: 'syn-admin', display_name: 'SYNTHETIC Admin', state: 'Active', decision: 'Approved', personas: 'P-ADM' },
      {
        login: 'syn-approver',
        display_name: 'SYNTHETIC Approver',
        state: 'Active',
        decision: 'Approved',
        personas: 'P-OWN',
      },
    ]);
  });

  it('PRD-SEC-014 keeps each temporary password only as an Argon2id hash marked temporary (access-and-approvals 3.2)', async () => {
    const credentials = await rows<{ password_hash: string; temporary: boolean }>(
      organisation.databaseName,
      'select password_hash, temporary from access.password_credential',
    );
    expect(credentials).toHaveLength(2);
    for (const credential of credentials) {
      expect(credential.temporary).toBe(true);
      expect(credential.password_hash).toMatch(/^\$argon2id\$/);
    }
    const everything = JSON.stringify(logger.lines);
    expect(everything).not.toContain(ADMIN_PASSWORD);
    expect(everything).not.toContain(APPROVER_PASSWORD);
    const audit = await rows<{ changes: unknown }>(organisation.databaseName, 'select changes from audit.audit_record');
    expect(JSON.stringify(audit)).not.toContain(ADMIN_PASSWORD);
    expect(JSON.stringify(audit)).not.toMatch(/\$argon2/);
  });

  it('DEC-112 test 19d gives each first user exactly the permissions of the 9.11 matrix, all members, nothing else', async () => {
    const prepared = [
      'access.approval_reason',
      'access.approval_rule_setting',
      'access.role',
      'access.role_assignment',
      'access.user',
    ];
    const viewed = ['access.approval_decision', 'access.approval_request', 'audit.access_record', 'audit.audit_record'];
    expect(await permissionsOf(organisation.databaseName, 'first-admin')).toEqual(
      [
        ...prepared.flatMap((type) => [`${type} create`, `${type} edit`, `${type} view`]),
        ...viewed.map((type) => `${type} view`),
      ].sort(),
    );
    expect(await permissionsOf(organisation.databaseName, 'first-approver')).toEqual(
      [
        ...prepared.flatMap((type) => [`${type} approve`, `${type} view`]),
        ...viewed.map((type) => `${type} view`),
      ].sort(),
    );
    const assignments = await rows<{ login: string; scope_key: string; field_classes: string }>(
      organisation.databaseName,
      `select u.login, a.scope_key,
              (select count(*) from access.role_permission p join access.role_version v on v.id = p.role_version_id
               where v.role_id = a.role_id and p.kind = 'field-class')::text as field_classes
       from access.role_assignment a join access.app_user u on u.id = a.app_user_id
       where a.decision = 'Approved' order by u.login`,
    );
    expect(assignments).toEqual([
      { login: 'syn-admin', scope_key: 'legal-entity=all;place=all;brand=all', field_classes: '0' },
      { login: 'syn-approver', scope_key: 'legal-entity=all;place=all;brand=all', field_classes: '0' },
    ]);
    // Neither resets a credential, revokes another's sessions, exports, or reads sensitive-access records.
    const forbidden = await rows<{ count: string }>(
      organisation.databaseName,
      `select count(*)::text as count from access.effective_grant g join access.app_user u on u.id = g.actor_id
       where g.record_type in ('access.user_credential', 'access.session', 'audit.sensitive_access_record',
                               'audit.device_access_record', 'kernel.outbox_event')`,
    );
    expect(forbidden).toEqual([{ count: '0' }]);
  });

  it('DEC-112 the first approver can never prepare, and the first Admin never approve (PRD-ACS-006)', async () => {
    const grants = await rows<{ login: string; actions: string[] }>(
      organisation.databaseName,
      `select u.login, array_agg(distinct a order by a) as actions
       from access.effective_grant g join access.app_user u on u.id = g.actor_id cross join unnest(g.actions) a
       group by u.login order by u.login`,
    );
    expect(grants).toEqual([
      { login: 'syn-admin', actions: ['create', 'edit', 'view'] },
      { login: 'syn-approver', actions: ['approve', 'view'] },
    ]);
  });

  it('RR-271 RR-290 writes the service identities the worker runs as, each with exactly what its steps declare', async () => {
    const identities = await rows<{ code: string; permissions: string | null }>(
      organisation.databaseName,
      `select s.code, (select string_agg(p.record_type || ' ' || p.action, ',' order by p.record_type, p.action)
                       from access.role_assignment a join access.role_version v on v.role_id = a.role_id
                       join access.role_permission p on p.role_version_id = v.id
                       where a.service_identity_id = s.id and a.decision = 'Approved') as permissions
       from access.service_identity s order by s.code`,
    );
    expect(identities).toEqual([
      { code: 'access-jobs', permissions: 'access.effective_grant edit' },
      // Create on partitions is the scheduled partition upkeep's (DEC-118, S1-F01-T24).
      {
        code: 'audit-jobs',
        permissions:
          'audit.audit_partition create,audit.audit_partition view,audit.audit_seal create,audit.audit_seal view',
      },
      // The inbox's consumers of access events (S1-F01-T13).
      { code: 'inbox', permissions: 'inbox.work_item edit' },
      { code: 'outbox', permissions: 'kernel.outbox_event edit' },
      // The setup step is the platform's own operation: no role assignment authorises it (9.11).
      { code: 'setup', permissions: null },
    ]);
  });

  it('RR-250 code-house-rules 12.14 writes the settings with their origin and the timezone in configuration', async () => {
    const settings = await rows<{ setting_key: string; value: unknown; origin: string }>(
      organisation.databaseName,
      `select s.setting_key, v.value, v.origin from access.setting s join access.setting_version v on v.setting_id = s.id
       where v.decision = 'Approved' order by s.setting_key`,
    );
    expect(settings).toEqual([
      {
        setting_key: 'access.office-session-limits',
        value: { idleLockSeconds: 1800, absoluteSeconds: 28_800 },
        origin: 'synthetic',
      },
      { setting_key: 'access.password-rules', value: { minimumLength: 12 }, origin: 'synthetic' },
      { setting_key: 'access.sign-in-throttling', value: { failureLimit: 5, windowSeconds: 600 }, origin: 'synthetic' },
    ]);
    const timezone = await rows<{ timezone: string; origin: string; decision: string }>(
      organisation.databaseName,
      'select timezone, origin, decision from configuration.organisation_timezone_version',
    );
    expect(timezone).toEqual([{ timezone: 'Asia/Kolkata', origin: 'synthetic', decision: 'Approved' }]);
  });

  it('PRD-SEC-018 audits every row under the setup service identity, with a permission-change record per assignment', async () => {
    const [setup] = await rows<{ id: string }>(
      organisation.databaseName,
      "select id from access.service_identity where code = 'setup'",
    );
    const actors = await rows<{ actor_kind: string; actor_id: string; source_kind: string; operation: string }>(
      organisation.databaseName,
      'select distinct actor_kind, actor_id::text, source_kind, operation from audit.audit_record',
    );
    expect(actors).toEqual([
      {
        actor_kind: 'service-identity',
        actor_id: setup?.id,
        source_kind: 'operator-command',
        operation: 'set-up-organisation',
      },
    ]);
    const types = await rows<{ record_type: string; count: string }>(
      organisation.databaseName,
      `select record_module || '.' || record_type as record_type, count(*)::text as count from audit.audit_record
       group by 1 order by 1`,
    );
    expect(types).toEqual([
      { record_type: 'access.role', count: '6' },
      { record_type: 'access.role_assignment', count: '6' },
      { record_type: 'access.service_identity', count: '5' },
      { record_type: 'access.setting', count: '3' },
      { record_type: 'access.setup_record', count: '1' },
      { record_type: 'access.user', count: '2' },
      { record_type: 'configuration.organisation_timezone', count: '1' },
    ]);
    const changes = await rows<{ count: string }>(
      organisation.databaseName,
      "select count(*)::text as count from audit.access_record where kind = 'permission-changed'",
    );
    expect(changes).toEqual([{ count: '6' }]);
  });

  it('PRD-ACS-023 the first users sign in to the new Organisation, which the running app finds by its code (RR-250)', async () => {
    const keys = {
      [ORGANISATION_KEYS_VARIABLE]: JSON.stringify({ [organisation.code]: randomBytes(32).toString('base64url') }),
    };
    const api = await startAccessApp({ directory } as SyntheticWorld, keys, { timezone: configurationTimezoneSource });
    try {
      const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.9' },
        body: JSON.stringify({ organisationCode: organisation.code, login: 'SYN-ADMIN', password: ADMIN_PASSWORD }),
      });
      // A temporary password reaches only enrolment and the password change (3.2).
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ outcome: 'enrolment-required' });
    } finally {
      await api.close();
    }
  });

  it('test 19a a finished setup run again is refused as a duplicate before any password is checked; nothing is written', async () => {
    const before = await footprint(organisation.databaseName);
    const again = capturingLogger();
    const differentEverything = request(organisation, (input) => {
      input.firstAdmin.temporaryPassword = 'SYNTHETIC-other-password';
      input.settings.timezone = 'Etc/UTC';
    });
    expect(await run(differentEverything, again)).toEqual({
      outcome: 'refused',
      reason: 'duplicate',
      organisationCode: organisation.code,
    });
    expect(await footprint(organisation.databaseName)).toEqual(before);
    // One line keeps the refused rerun: its fingerprint, version and which row refused it, never the code (9.11).
    const refusal = again.lines.find((line) => line.refusedBy !== undefined);
    expect(refusal).toMatchObject({ refusedBy: 'finished', canonicalFormVersion: 'setup-fingerprint/1' });
    expect(refusal?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(again.lines)).not.toContain(organisation.code);
    expect(JSON.stringify(again.lines)).not.toContain('SYNTHETIC-other-password');
  });

  it('spec section 10 a finished setup is a duplicate even when the rerun’s passwords fail its password rules', async () => {
    const before = await footprint(organisation.databaseName);
    const failingRules = request(organisation, (input) => (input.settings.passwordRules = { minimumLength: 64 }));
    expect(await run(failingRules)).toEqual({
      outcome: 'refused',
      reason: 'duplicate',
      organisationCode: organisation.code,
    });
    expect(await footprint(organisation.databaseName)).toEqual(before);
  });

  it('there is no API route to the setup step or the recovery command (code-house-rules 4.3; CH-1; DEC-116)', () => {
    const paths = Object.values(routes).map((route) => route.path);
    expect(paths.filter((path) => /setup|recover/i.test(path))).toEqual([]);
  });
});

describe('rerunning an interrupted setup (access-and-approvals 9.11; test 19e)', () => {
  it('DEC-112 the identical request completes it without creating anything twice; the first credentials still verify', async () => {
    const organisation = freshOrganisation();
    expect((await run(request(organisation))).outcome).toBe('created');
    await interrupt(organisation.code);
    const before = await footprint(organisation.databaseName);
    expect(await run(request(organisation))).toEqual({ outcome: 'completed', organisationCode: organisation.code });
    expect(await footprint(organisation.databaseName)).toEqual(before);
    expect(await listed(organisation.code)).toEqual([organisation.databaseName]);
    const [admin] = await rows<{ password_hash: string }>(
      organisation.databaseName,
      `select c.password_hash from access.password_credential c join access.app_user u on u.id = c.app_user_id
       where u.login = 'syn-admin'`,
    );
    expect(await verifyPassword(admin?.password_hash ?? '', new Secret(ADMIN_PASSWORD))).toBe(true);
  });

  it('PRD-SEC-014 the same fields with another temporary password for either user is a conflict naming nothing', async () => {
    const organisation = freshOrganisation();
    expect((await run(request(organisation))).outcome).toBe('created');
    await interrupt(organisation.code);
    const before = await footprint(organisation.databaseName);
    for (const who of ['firstAdmin', 'firstApprover'] as const) {
      const logger = capturingLogger();
      const outcome = await run(
        request(organisation, (input) => {
          input[who].temporaryPassword = 'SYNTHETIC-another-temporary';
        }),
        logger,
      );
      expect(outcome).toEqual({ outcome: 'refused', reason: 'conflict', organisationCode: organisation.code });
      expect(JSON.stringify(logger.lines)).not.toContain('SYNTHETIC-another-temporary');
      expect(JSON.stringify(logger.lines)).not.toMatch(/first ?admin|first ?approver|syn-admin|syn-approver/i);
      expect(logger.lines.find((line) => line.refusedBy !== undefined)).toMatchObject({
        refusedBy: 'conflicting-request',
      });
    }
    expect(await footprint(organisation.databaseName)).toEqual(before);
    expect(await listed(organisation.code)).toEqual([]);
  });

  it('different non-secret fields are refused as a conflict; nothing is written', async () => {
    const organisation = freshOrganisation();
    expect((await run(request(organisation))).outcome).toBe('created');
    await interrupt(organisation.code);
    const before = await footprint(organisation.databaseName);
    const outcome = await run(
      request(organisation, (input) => (input.firstApprover.displayName = syntheticName('Other'))),
    );
    expect(outcome).toEqual({ outcome: 'refused', reason: 'conflict', organisationCode: organisation.code });
    expect(await footprint(organisation.databaseName)).toEqual(before);
  });

  it('a setup record of another canonical-form version is refused as a change of version', async () => {
    const organisation = freshOrganisation();
    expect((await run(request(organisation))).outcome).toBe('created');
    await interrupt(organisation.code);
    // The record is append-only; its owner swaps the guard off only to stage an older version (test setup, 11.2).
    const owner = await connect(organisation.databaseName, 'migration');
    try {
      await owner.query('alter table access.setup_record disable trigger refuse_row_change');
      await owner.query("update access.setup_record set canonical_form_version = 'setup-fingerprint/0'");
      await owner.query('alter table access.setup_record enable trigger refuse_row_change');
    } finally {
      await owner.end();
    }
    const outcome = await run(request(organisation));
    expect(outcome).toEqual({ outcome: 'refused', reason: 'fingerprint-version', organisationCode: organisation.code });
  });

  it('a database holding a user but no setup record is refused as a conflict; nothing is written', async () => {
    const database = await createTestDatabase('organisation', 't10_user_only');
    created.push(database);
    const organisation = {
      code: syntheticCode(`ORG-T10-${randomBytes(3).toString('hex').toUpperCase()}`),
      databaseName: database,
    };
    await writeSyntheticUser(database, organisation.code, {}, { label: 'EXISTING' });
    const before = await footprint(database);
    const outcome = await run(request(organisation));
    expect(outcome).toEqual({ outcome: 'refused', reason: 'conflict', organisationCode: organisation.code });
    expect(await footprint(database)).toEqual(before);
    expect(await listed(organisation.code)).toEqual([]);
  });

  it("DEC-093 a database another Organisation's entry names is refused as a conflict; the step never writes there", async () => {
    const first = freshOrganisation();
    expect((await run(request(first))).outcome).toBe('created');
    const before = await footprint(first.databaseName);
    const other = {
      code: syntheticCode(`ORG-T10-${randomBytes(3).toString('hex').toUpperCase()}`),
      databaseName: first.databaseName,
    };
    expect(await run(request(other))).toEqual({ outcome: 'refused', reason: 'conflict', organisationCode: other.code });
    expect(await footprint(first.databaseName)).toEqual(before);
  });
});

describe('two runs at once (access-and-approvals 9.11)', () => {
  it('of two identical runs, one creates and registers the code; the other is refused as a duplicate', async () => {
    const organisation = freshOrganisation();
    const outcomes = await Promise.all([run(request(organisation)), run(request(organisation))]);
    expect(
      outcomes.map((outcome) => (outcome.outcome === 'refused' ? outcome.reason : outcome.outcome)).sort(),
    ).toEqual(['created', 'duplicate']);
    expect(await listed(organisation.code)).toEqual([organisation.databaseName]);
    const [users] = await rows<{ count: string }>(
      organisation.databaseName,
      'select count(*)::text as count from access.app_user',
    );
    expect(users).toEqual({ count: '2' });
  });

  it('of two different runs, one creates; the other is refused, never taken as success', async () => {
    const organisation = freshOrganisation();
    const outcomes = await Promise.all([
      run(request(organisation)),
      run(request(organisation, (input) => (input.settings.timezone = 'Etc/UTC'))),
    ]);
    const kinds = outcomes.map((outcome) => outcome.outcome);
    expect(kinds.filter((kind) => kind === 'created')).toHaveLength(1);
    expect(kinds.filter((kind) => kind === 'refused')).toHaveLength(1);
    const [users] = await rows<{ count: string }>(
      organisation.databaseName,
      'select count(*)::text as count from access.app_user',
    );
    expect(users).toEqual({ count: '2' });
  });
});

describe('the request itself (access-and-approvals 3.2, 9.11)', () => {
  it('GC3-5 refuses a temporary password the password rules refuse, before anything is created', async () => {
    const organisation = freshOrganisation();
    const short = request(organisation, (input) => (input.settings.passwordRules = { minimumLength: 64 }));
    const refused = run(short);
    await expect(refused).rejects.toBeInstanceOf(SetupRequestRefused);
    // The refusal never says which user's password it was (spec section 10).
    await expect(refused).rejects.not.toThrow(/Admin|approver/i);
    const exists = await rows<{ count: string }>(
      directory,
      'select count(*)::text as count from pg_catalog.pg_database where datname = $1',
      [organisation.databaseName],
    );
    expect(exists).toEqual([{ count: '0' }]);
    expect(await listed(organisation.code)).toEqual([]);
  });

  it('refuses a service identity the permission registry cannot grant', async () => {
    const organisation = freshOrganisation();
    await expect(
      runSetupStep({
        migrationConnectionString: databaseUrl(directory, 'migration'),
        runtimeConnectionString: databaseUrl(directory, 'runtime'),
        request: request(organisation),
        serviceIdentities: [
          { code: 'syn-identity', authorities: [{ action: 'approve', recordType: 'kernel.outbox_event' }] },
        ],
        logger: capturingLogger().logger,
      }),
    ).rejects.toBeInstanceOf(SetupRequestRefused);
  });
});
