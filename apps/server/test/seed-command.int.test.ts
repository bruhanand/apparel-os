import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { uuidv7 } from '@apparel-os/domain';
import { migrateDatabase, migrationSetFolder, readMigrationSet } from '../src/kernel/index.js';
import { ORGANISATION_KEYS_VARIABLE } from '../src/modules/access/index.js';
import { configurationTimezoneSource } from '../src/modules/configuration/index.js';
import { SYNTHETIC_ORGANISATIONS, syntheticCode, syntheticDatabaseName } from './fixtures/synthetic.js';
import { startAccessApp, SYNTHETIC_ORIGIN } from './support/access.js';
import type { SyntheticWorld } from './support/organisations.js';
import {
  connect,
  createEmptyDatabase,
  databaseGrants,
  databaseUrl,
  dropDatabase,
  RUNNER_GRANTS,
} from './support/postgres.js';

// S0-T06, S1-F01-T02, S1-F01-T24: the local seed, `pnpm seed` (node dist-seed/test/seed/seed.js), run as its own
// process (code-house-rules 11.2). Turborepo builds the seed before the server's integration tests, so this is the
// code under test. It creates databases with fixed synthetic names; no other test file uses them. It sets up both
// synthetic Organisations through the setup step (DEC-118, RR-330); every value is SYNTHETIC.

const COMMAND = fileURLToPath(new URL('../dist-seed/test/seed/seed.js', import.meta.url));
const SEEDED = SYNTHETIC_ORGANISATIONS.map((organisation) => syntheticDatabaseName(organisation.code));

const SEED_VARIABLES = [
  'AOS_ENVIRONMENT',
  'AOS_MIGRATION_DATABASE_URL',
  'AOS_RUNTIME_DATABASE_URL',
  'AOS_SEED_FIRST_USERS_FILE',
  'RAILWAY_ENVIRONMENT_NAME',
  'RAILWAY_ENVIRONMENT',
];

interface Outcome {
  readonly exitCode: number | null;
  readonly output: string;
}

/** A scratch folder of this file, for the first users' SYNTHETIC passwords file the seed writes. */
const scratch = mkdtempSync(join(tmpdir(), 'syn-seed-'));
const usersFile = join(scratch, 'SYNTHETIC-first-users.secrets.json');

function runSeed(variables: Record<string, string>): Promise<Outcome> {
  // The seed's own variables come only from the test, never from the shell that runs it. The runtime connection and
  // the first users file are this file's unless a test gives others.
  const inherited = Object.entries(process.env).filter(([name]) => !SEED_VARIABLES.includes(name));
  const env: NodeJS.ProcessEnv = {
    ...Object.fromEntries(inherited),
    AOS_RUNTIME_DATABASE_URL: databaseUrl(directory, 'runtime'),
    AOS_SEED_FIRST_USERS_FILE: usersFile,
    ...variables,
  };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [COMMAND], { env });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ exitCode, output });
    });
  });
}

async function onServer<T>(query: string, values: unknown[]): Promise<T[]> {
  const client = await connect('postgres', 'superuser');
  try {
    return (await client.query(query, values)).rows as T[];
  } finally {
    await client.end();
  }
}

async function seededDatabases(): Promise<{ datname: string; owner: string }[]> {
  return onServer(
    'select datname, pg_catalog.pg_get_userbyid(datdba) as owner from pg_catalog.pg_database where datname = any($1) order by 1',
    [SEEDED],
  );
}

async function hasKernel(database: string): Promise<boolean> {
  const client = await connect(database, 'superuser');
  try {
    const result = await client.query<{ n: number }>(
      "select count(*)::int as n from pg_catalog.pg_namespace where nspname = 'kernel'",
    );
    return result.rows[0]?.n === 1;
  } finally {
    await client.end();
  }
}

async function directoryRows(database: string): Promise<{ organisation_code: string; database_name: string }[]> {
  const client = await connect(database, 'migration');
  try {
    const result = await client.query<{ organisation_code: string; database_name: string }>(
      'select organisation_code, database_name from kernel.directory_entry order by organisation_code',
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

/** A directory migrated and listing one Organisation, written as the migration role. */
async function directoryListing(label: string, code: string, database: string): Promise<string> {
  const name = await createEmptyDatabase(label);
  extra.push(name);
  await migrateDatabase({ connectionString: databaseUrl(name, 'migration'), folder: migrationSetFolder('directory') });
  const client = await connect(name, 'migration');
  try {
    await client.query(
      'insert into kernel.directory_entry (id, organisation_code, database_name) values ($1, $2, $3)',
      [uuidv7(), code, database],
    );
  } finally {
    await client.end();
  }
  return name;
}

let directory: string;
let untouched: string;
const extra: string[] = [];

beforeAll(async () => {
  if (!existsSync(COMMAND)) throw new Error(`${COMMAND} is missing: run pnpm build:seed first`);
  directory = await createEmptyDatabase('seed_directory');
  untouched = await createEmptyDatabase('seed_superuser');
});

afterAll(async () => {
  for (const name of [directory, untouched, ...extra, ...SEEDED]) await dropDatabase(name);
  rmSync(scratch, { recursive: true, force: true });
});

describe('pnpm seed, the local seed (code-house-rules 11.2)', () => {
  it.each([
    [{}, 'AOS_ENVIRONMENT is not set'],
    [{ AOS_ENVIRONMENT: 'kdps-test' }, 'AOS_ENVIRONMENT is kdps-test'],
    [{ AOS_ENVIRONMENT: 'dev', RAILWAY_ENVIRONMENT_NAME: 'kdps-test' }, 'RAILWAY_ENVIRONMENT_NAME is kdps-test'],
  ])('refuses to run with %o and changes nothing', async (variables, reason) => {
    const outcome = await runSeed({ ...variables, AOS_MIGRATION_DATABASE_URL: databaseUrl(directory, 'migration') });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain(`Seed refused, nothing changed: ${reason}`);
    expect(await hasKernel(directory)).toBe(false);
    expect(await seededDatabases()).toEqual([]);
  });

  it('exits 1 when the connection variable is not set', async () => {
    const outcome = await runSeed({ AOS_ENVIRONMENT: 'local' });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain('AOS_MIGRATION_DATABASE_URL is not set');
  });

  it('PRD-SEC-005 PRD-SEC-014 refuses a superuser connection before creating anything, and logs no credential', async () => {
    const connectionString = databaseUrl(untouched, 'superuser');
    const outcome = await runSeed({ AOS_ENVIRONMENT: 'local', AOS_MIGRATION_DATABASE_URL: connectionString });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain('Migration refused, nothing changed');
    expect(outcome.output).not.toMatch(/postgres(ql)?:\/\//);
    expect(await hasKernel(untouched)).toBe(false);
    expect(await seededDatabases()).toEqual([]);
  });

  it('PRD-SEC-014 refuses a connection string it cannot point at another database, before changing anything, without logging it', async () => {
    // A Unix-socket form that pg accepts but that is not a URL with a host. The password is this run's real one.
    const password = inject('postgres').migrationPassword;
    const connectionString = `postgres://aos_migration:${password}@/${directory}?host=/tmp`;
    const outcome = await runSeed({ AOS_ENVIRONMENT: 'local', AOS_MIGRATION_DATABASE_URL: connectionString });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain(
      'Seed refused, nothing changed: AOS_MIGRATION_DATABASE_URL and AOS_RUNTIME_DATABASE_URL must have the form',
    );
    expect(outcome.output).not.toContain(password);
    expect(await hasKernel(directory)).toBe(false);
    expect(await seededDatabases()).toEqual([]);
  });

  it('RR-195 PRD-SEC-017 refuses a directory that lists an Organisation that is not synthetic, before changing anything', async () => {
    // A code without the SYN marker stands for a real Organisation; no real code is used.
    const listing = await directoryListing('seed_real', 'ORG-NOT-MARKED', 'org_not_marked');
    const outcome = await runSeed({
      AOS_ENVIRONMENT: 'local',
      AOS_MIGRATION_DATABASE_URL: databaseUrl(listing, 'migration'),
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain(
      'Seed refused, nothing changed: the directory lists an Organisation that is not synthetic',
    );
    expect(await directoryRows(listing)).toEqual([
      { organisation_code: 'ORG-NOT-MARKED', database_name: 'org_not_marked' },
    ]);
    expect(await seededDatabases()).toEqual([]);
  });

  it('refuses a directory that lists a seed code at another database, before changing anything', async () => {
    const [first] = SYNTHETIC_ORGANISATIONS;
    const elsewhere = syntheticDatabaseName(syntheticCode('ORG-ELSEWHERE'));
    const listing = await directoryListing('seed_elsewhere', first.code, elsewhere);
    const outcome = await runSeed({
      AOS_ENVIRONMENT: 'local',
      AOS_MIGRATION_DATABASE_URL: databaseUrl(listing, 'migration'),
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain(`Seed refused, nothing changed: the directory lists ${first.code}`);
    expect(await directoryRows(listing)).toEqual([{ organisation_code: first.code, database_name: elsewhere }]);
    expect(await seededDatabases()).toEqual([]);
  });

  it('refuses without the runtime connection or a labelled, git-ignored first users file, and changes nothing', async () => {
    const base = { AOS_ENVIRONMENT: 'local', AOS_MIGRATION_DATABASE_URL: databaseUrl(directory, 'migration') };
    const noRuntime = await runSeed({ ...base, AOS_RUNTIME_DATABASE_URL: '' });
    expect(noRuntime.exitCode).toBe(1);
    expect(noRuntime.output).toContain('Seed refused, nothing changed: AOS_RUNTIME_DATABASE_URL is not set');
    const unlabelled = await runSeed({ ...base, AOS_SEED_FIRST_USERS_FILE: join(scratch, 'first-users.json') });
    expect(unlabelled.exitCode).toBe(1);
    expect(unlabelled.output).toContain('AOS_SEED_FIRST_USERS_FILE must name a file called SYNTHETIC-');
    expect(await hasKernel(directory)).toBe(false);
    expect(await seededDatabases()).toEqual([]);
  });

  it('RR-330 refuses a directory listing a seed Organisation without a finished setup (an earlier seed), before changing anything', async () => {
    const [first] = SYNTHETIC_ORGANISATIONS;
    const listing = await directoryListing('seed_unfinished', first.code, syntheticDatabaseName(first.code));
    const outcome = await runSeed({
      AOS_ENVIRONMENT: 'local',
      AOS_MIGRATION_DATABASE_URL: databaseUrl(listing, 'migration'),
      AOS_RUNTIME_DATABASE_URL: databaseUrl(listing, 'runtime'),
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain(
      `Seed refused, nothing changed: the directory lists ${first.code} without a finished setup`,
    );
    expect(await seededDatabases()).toEqual([]);
  });

  it('PRD-ACS-023 PRD-ACS-020 DEC-118 sets up both Organisations through the setup step, each with its own first Admin and first approver, and a rerun changes nothing', async () => {
    const variables = { AOS_ENVIRONMENT: 'local', AOS_MIGRATION_DATABASE_URL: databaseUrl(directory, 'migration') };
    const first = await runSeed(variables);
    expect(first.exitCode, first.output).toBe(0);
    for (const organisation of SYNTHETIC_ORGANISATIONS) {
      expect(first.output).toContain(
        `${organisation.code} (${organisation.name}): set up in database ${syntheticDatabaseName(organisation.code)} (created)`,
      );
    }
    expect(first.output).not.toMatch(/postgres(ql)?:\/\//);
    // The temporary passwords are never logged or echoed (PRD-SEC-014), and live only in the git-ignored file.
    const secrets = JSON.parse(readFileSync(usersFile, 'utf8')) as Record<
      string,
      Record<'firstAdmin' | 'firstApprover', { login: string; temporaryPassword: string }>
    >;
    for (const users of Object.values(secrets)) {
      for (const user of Object.values(users)) {
        expect(user.temporaryPassword).toMatch(/^SYNTHETIC-/);
        expect(first.output).not.toContain(user.temporaryPassword);
      }
    }
    expect(statSync(usersFile).mode & 0o077).toBe(0);

    // Each is listed in the directory at its own database (DEC-093), by the setup step (RR-194, RR-330).
    expect(await directoryRows(directory)).toEqual(
      SYNTHETIC_ORGANISATIONS.map((organisation) => ({
        organisation_code: organisation.code,
        database_name: syntheticDatabaseName(organisation.code),
      })),
    );
    expect(await databaseGrants(directory)).toEqual(RUNNER_GRANTS);
    expect(await seededDatabases()).toEqual(SEEDED.map((datname) => ({ datname, owner: 'aos_migration' })));

    // Four different people: each Organisation's own first Admin and first approver (access-and-approvals 9.11).
    const people: string[] = [];
    for (const database of SEEDED) {
      expect(await databaseGrants(database)).toEqual(RUNNER_GRANTS);
      const owner = await connect(database, 'migration');
      try {
        const files = await owner.query<{ file_name: string }>('select file_name from kernel.migration order by 1');
        expect(files.rows.map((row) => row.file_name)).toEqual(
          readMigrationSet(migrationSetFolder('organisation')).map((file) => file.fileName),
        );
        const [record] = (
          await owner.query<{ admin: string; approver: string }>(
            'select first_admin_user_id::text as admin, first_approver_user_id::text as approver from access.setup_record',
          )
        ).rows;
        expect(record?.admin).not.toBe(record?.approver);
        const logins = await owner.query<{ login: string }>(
          'select login from access.app_user where id in ($1, $2) order by login',
          [record?.admin, record?.approver],
        );
        expect(logins.rows).toHaveLength(2);
        people.push(...logins.rows.map((row) => row.login));
      } finally {
        await owner.end();
      }
    }
    expect(new Set(people).size).toBe(4);

    // Each first user can sign in: a temporary password reaches enrolment (access-and-approvals 3.2).
    const keys = {
      [ORGANISATION_KEYS_VARIABLE]: JSON.stringify(
        Object.fromEntries(SYNTHETIC_ORGANISATIONS.map((each) => [each.code, randomBytes(32).toString('base64url')])),
      ),
    };
    const api = await startAccessApp({ directory } as SyntheticWorld, keys, { timezone: configurationTimezoneSource });
    try {
      for (const organisation of SYNTHETIC_ORGANISATIONS) {
        for (const user of Object.values(secrets[organisation.code] ?? {})) {
          const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.9' },
            body: JSON.stringify({
              organisationCode: organisation.code,
              login: user.login,
              password: user.temporaryPassword,
            }),
          });
          expect(response.status).toBe(200);
          expect(await response.json()).toMatchObject({ outcome: 'enrolment-required' });
        }
      }
    } finally {
      await api.close();
    }

    const before = await Promise.all(SEEDED.map((database) => footprint(database)));
    const second = await runSeed(variables);
    expect(second.exitCode, second.output).toBe(0);
    for (const organisation of SYNTHETIC_ORGANISATIONS) {
      expect(second.output).toContain(`${organisation.code} (${organisation.name}): already set up, left as it is`);
    }
    expect(await directoryRows(directory)).toHaveLength(SYNTHETIC_ORGANISATIONS.length);
    expect(await Promise.all(SEEDED.map((database) => footprint(database)))).toEqual(before);
  });
});

/** How many rows the setup step's tables hold: a rerun that changes nothing leaves them as they were. */
async function footprint(database: string): Promise<Record<string, string>> {
  const owner = await connect(database, 'migration');
  try {
    const [row] = (
      await owner.query<Record<string, string>>(
        `select (select count(*) from access.setup_record)::text as setup,
                (select count(*) from access.app_user)::text as users,
                (select count(*) from audit.audit_record)::text as audit`,
      )
    ).rows;
    return row ?? {};
  } finally {
    await owner.end();
  }
}
