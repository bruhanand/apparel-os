import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { inject } from 'vitest';
import { migrateDatabase, migrationSetFolder, type MigrationSetName } from '../../src/kernel/index.js';

/** The container global-setup.ts starts, as test files see it. */
export interface PostgresServer {
  readonly host: string;
  readonly port: number;
  readonly superuserUrl: string;
  readonly migrationPassword: string;
  readonly runtimePassword: string;
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

/** Creates a database and migrates it with one of the repository's sets, as the migration role. */
export async function createMigratedDatabase(set: MigrationSetName, label: string): Promise<string> {
  const name = await createEmptyDatabase(label);
  await migrateDatabase({ connectionString: databaseUrl(name, 'migration'), folder: migrationSetFolder(set) });
  return name;
}

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
