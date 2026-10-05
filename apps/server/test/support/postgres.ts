import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { inject } from 'vitest';
import { applyDatabasePrivileges, type MigrationSetName } from '../../src/kernel/index.js';

/** The container global-setup.ts starts, as test files see it. */
export interface PostgresServer {
  readonly host: string;
  readonly port: number;
  readonly superuserUrl: string;
  readonly migrationPassword: string;
  readonly runtimePassword: string;
  /** The migrated template database of each kind, closed to connections (global-setup.ts). */
  readonly templates: Readonly<Record<MigrationSetName, string>>;
}

declare module 'vitest' {
  export interface ProvidedContext {
    postgres: PostgresServer;
  }
}

export type TestRole = 'superuser' | 'migration' | 'runtime';

/** A connection string to one database of the test server as one role. */
export function databaseUrl(database: string, role: TestRole): string {
  const server = inject('postgres');
  if (role === 'superuser') {
    const url = new URL(server.superuserUrl);
    url.pathname = `/${database}`;
    return url.toString();
  }
  const [user, password] =
    role === 'migration' ? ['aos_migration', server.migrationPassword] : ['aos_runtime', server.runtimePassword];
  return `postgres://${user}:${password}@${server.host}:${String(server.port)}/${database}`;
}

/** Opens a client on one database as one role. The caller ends it. */
export async function connect(database: string, role: TestRole): Promise<Client> {
  const client = new Client({ connectionString: databaseUrl(database, role) });
  await client.connect();
  return client;
}

async function asSuperuser<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: inject('postgres').superuserUrl });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/**
 * Creates an empty database owned by the migration role, as an Organisation's or the directory's is
 * (code-house-rules 5.1), or by the superuser, to show the runner refusing it. Its name is unique and says it is
 * synthetic.
 */
export async function createEmptyDatabase(
  label: string,
  owner: 'migration' | 'superuser' = 'migration',
): Promise<string> {
  const name = `syn_${label}_${randomBytes(4).toString('hex')}`;
  await asSuperuser((client) =>
    client.query(
      `create database ${client.escapeIdentifier(name)}${owner === 'migration' ? ' owner aos_migration' : ''}`,
    ),
  );
  return name;
}

export async function dropDatabase(name: string): Promise<void> {
  await asSuperuser((client) => client.query(`drop database if exists ${client.escapeIdentifier(name)} with (force)`));
}

/**
 * Creates a migrated database of one kind for one test file: a copy of the run's template (code-house-rules 11.3),
 * owned by the migration role. A copy has none of its template's database-level privileges, so the runner's database
 * step is applied to it, as the migration role, before any test connects as the runtime role (4.3). Its name is
 * unique and says it is synthetic. The test file drops it at its end (dropDatabase).
 */
export async function createTestDatabase(set: MigrationSetName, label: string): Promise<string> {
  const name = `syn_${label}_${randomBytes(4).toString('hex')}`;
  const template = inject('postgres').templates[set];
  await asSuperuser((client) =>
    client.query(
      `create database ${client.escapeIdentifier(name)} template ${client.escapeIdentifier(template)} owner aos_migration`,
    ),
  );
  try {
    const owner = await connect(name, 'migration');
    try {
      await applyDatabasePrivileges(owner);
    } finally {
      await owner.end();
    }
  } catch (error) {
    await dropDatabase(name);
    throw error;
  }
  return name;
}

/**
 * The privileges anyone but the owner holds on a database and on its schema `public`, as `<grantee> <PRIVILEGE>`,
 * sorted; PUBLIC is named PUBLIC. Read as the superuser, so it works whoever owns the database.
 */
export async function databaseGrants(database: string): Promise<{ database: string[]; schemaPublic: string[] }> {
  const client = await connect(database, 'superuser');
  try {
    const onDatabase = await client.query<{ grant: string }>(`
      select coalesce(r.rolname, 'PUBLIC') || ' ' || a.privilege_type as grant
      from pg_catalog.pg_database d
      cross join lateral pg_catalog.aclexplode(coalesce(d.datacl, pg_catalog.acldefault('d', d.datdba))) a
      left join pg_catalog.pg_roles r on r.oid = a.grantee
      where d.datname = current_database() and a.grantee <> d.datdba
      order by 1`);
    const onPublic = await client.query<{ grant: string }>(`
      select coalesce(r.rolname, 'PUBLIC') || ' ' || a.privilege_type as grant
      from pg_catalog.pg_namespace n
      cross join lateral pg_catalog.aclexplode(coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
      left join pg_catalog.pg_roles r on r.oid = a.grantee
      where n.nspname = 'public' and a.grantee <> n.nspowner
      order by 1`);
    return {
      database: onDatabase.rows.map((row) => row.grant),
      schemaPublic: onPublic.rows.map((row) => row.grant),
    };
  } finally {
    await client.end();
  }
}

/** What the runner's database step leaves (code-house-rules 4.3, 5.2). */
export const RUNNER_GRANTS = { database: ['aos_runtime CONNECT'], schemaPublic: ['aos_runtime USAGE'] };

/** Creates a login role with no grant, to show what a role the databases never named can do. */
export async function createOutsiderRole(): Promise<{ name: string; password: string }> {
  const name = `syn_outsider_${randomBytes(4).toString('hex')}`;
  const password = randomBytes(16).toString('hex');
  await asSuperuser((client) =>
    client.query(`create role ${client.escapeIdentifier(name)} login password ${client.escapeLiteral(password)}`),
  );
  return { name, password };
}

/** Resolves with the error's SQLSTATE, or fails the test if the query succeeded. */
export async function sqlState(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    let current: unknown = error;
    while (current instanceof Error) {
      if ('code' in current && typeof current.code === 'string') return current.code;
      current = current.cause;
    }
    throw error;
  }
  throw new Error('Expected the query to be refused, and it succeeded');
}
