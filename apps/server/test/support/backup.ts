import { spawn } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buffer } from 'node:stream/consumers';
import { CreateBucketCommand, GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import {
  BACKUP_SIGNING_KEY_VARIABLE,
  BACKUP_SIGNING_PUBLIC_KEY_VARIABLE,
  BackupPrivateKey,
  BACKUP_STORE_VARIABLES,
  pgDumpToolVia,
  pgRestoreToolVia,
  type ClientToolLauncher,
  type DumpTool,
  type RestoreTool,
} from '../../src/kernel/index.js';
import { createEmptyDatabase, testServer } from './postgres.js';

// Helpers for the tests of backup and restore (backup-and-restore section 12; S1-F14-T02, S1-F14-T03). PostgreSQL's
// own client tools run inside a test's PostgreSQL container, so their major version is the server's (GC9-A5) whatever
// the machine has: the real tools of dump-tool.ts, started through `docker exec` instead of from the PATH, with the
// same libpq variables passed through. Every key here is SYNTHETIC, made for one run.

/** A SYNTHETIC backup key pair: the public part as the environment holds it, the private part as a custodian would. */
export function syntheticBackupKey(): {
  readonly publicText: string;
  readonly privateKey: BackupPrivateKey;
  readonly privateText: string;
} {
  const pair = generateKeyPairSync('x25519');
  const privateText = pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  return {
    publicText: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateKey: BackupPrivateKey.fromText(privateText),
    privateText,
  };
}

/**
 * A SYNTHETIC backup signing key pair (product owner, 12 Oct 2026): the private part as the backup runner's variable
 * holds it, the public part as the restore runner's does.
 */
export function syntheticSigningKey(): {
  readonly backupRunner: Record<string, string>;
  readonly restoreRunner: Record<string, string>;
} {
  const pair = generateKeyPairSync('ed25519');
  return {
    backupRunner: {
      [BACKUP_SIGNING_KEY_VARIABLE]: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    },
    restoreRunner: {
      [BACKUP_SIGNING_PUBLIC_KEY_VARIABLE]: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    },
  };
}

/**
 * Starts a client tool inside a PostgreSQL container with `docker exec`, passing each libpq variable through by name,
 * so its value never appears in an argument. With `localSocket`, the tool reaches the container's own server over its
 * local socket, as the connection strings of the tests name the port Docker maps on the machine.
 */
export function containerLauncher(containerId: string, options: { readonly localSocket: boolean }): ClientToolLauncher {
  return (tool, args, env) => {
    const passed: Record<string, string> = options.localSocket
      ? { ...env, PGHOST: '/var/run/postgresql', PGPORT: '5432' }
      : { ...env };
    return {
      command: 'docker',
      args: ['exec', '-i', ...Object.keys(passed).flatMap((name) => ['-e', name]), containerId, tool, ...args],
      env: {
        PATH: process.env.PATH,
        ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
        ...(process.env.DOCKER_HOST === undefined ? {} : { DOCKER_HOST: process.env.DOCKER_HOST }),
        ...passed,
      },
    };
  };
}

/** `pg_dump` of the run's server version: the real dump tool, run inside the run's container. */
export const containerDumpTool: DumpTool = {
  dump(target, into) {
    return pgDumpToolVia(containerLauncher(testServer().containerId, { localSocket: true })).dump(target, into);
  },
};

/** `pg_restore` of the run's server version: the real restore tool, run inside a container. */
export function containerRestoreTool(containerId: string): RestoreTool {
  return pgRestoreToolVia(containerLauncher(containerId, { localSocket: true }));
}

/** Loads a dump into a new empty database owned by the migration role, with `pg_restore` in the container. */
export async function loadDump(dump: Buffer, label: string): Promise<string> {
  const database = await createEmptyDatabase(label);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'exec',
        '-i',
        testServer().containerId,
        'pg_restore',
        '--host=/var/run/postgresql',
        '--username=aos_migration',
        `--dbname=${database}`,
        '--exit-on-error',
        '--no-password',
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    let errors = '';
    child.stderr.on('data', (chunk: Buffer) => {
      errors += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_restore exited ${String(code)}: ${errors}`));
    });
    child.stdin.end(dump);
  });
  return database;
}

/** A second bucket in the test's MinIO for the backup store, and the variables that name it. */
export async function createBackupBucket(
  client: S3Client,
  fileStoreEnvironment: Readonly<Record<string, string>>,
  bucket: string,
): Promise<Record<string, string>> {
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  return {
    [BACKUP_STORE_VARIABLES.endpoint]: fileStoreEnvironment.AOS_FILE_STORE_ENDPOINT ?? '',
    [BACKUP_STORE_VARIABLES.region]: fileStoreEnvironment.AOS_FILE_STORE_REGION ?? '',
    [BACKUP_STORE_VARIABLES.bucket]: bucket,
    [BACKUP_STORE_VARIABLES.accessKeyId]: fileStoreEnvironment.AOS_FILE_STORE_ACCESS_KEY_ID ?? '',
    [BACKUP_STORE_VARIABLES.secretAccessKey]: fileStoreEnvironment.AOS_FILE_STORE_SECRET_ACCESS_KEY ?? '',
    [BACKUP_STORE_VARIABLES.addressing]: 'path',
  };
}

/** Reads one object of a bucket whole. */
export async function objectOf(client: S3Client, bucket: string, key: string): Promise<Buffer> {
  const answer = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (answer.Body === undefined) throw new Error('No body');
  return buffer(answer.Body as NodeJS.ReadableStream);
}

/**
 * A restore's target server (backup-and-restore 4.1, product owner, 12 Oct 2026): a PostgreSQL 17 container of its
 * own that holds no Apparel OS database, with the two roles created from the reviewed role SQL, as the roles runbook
 * makes them on a new server. The run's own server holds the templates and every test's databases, so it is never
 * fresh. `clear` drops every database a restore made, so the next restore finds the server fresh again.
 */
export interface TargetServer {
  readonly containerId: string;
  url(database: string, role: 'superuser' | 'migration' | 'runtime'): string;
  query<T extends Record<string, unknown>>(database: string, text: string, values?: unknown[]): Promise<T[]>;
  /** An empty directory database owned by the migration role. */
  createDirectory(label: string): Promise<string>;
  clear(): Promise<void>;
  stop(): Promise<void>;
}

export async function startTargetServer(): Promise<TargetServer> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:17-alpine').start();
  const passwords = { migration: randomBytes(16).toString('hex'), runtime: randomBytes(16).toString('hex') };
  const root = join(import.meta.dirname, '..', '..');
  const superuser = new Client({ connectionString: container.getConnectionUri() });
  await superuser.connect();
  try {
    await superuser.query(readFileSync(join(root, 'db', 'roles.sql'), 'utf8'));
    await superuser.query(readFileSync(join(root, 'db', 'runtime-limits-synthetic.sql'), 'utf8'));
    await superuser.query(`alter role aos_migration password ${superuser.escapeLiteral(passwords.migration)}`);
    await superuser.query(`alter role aos_runtime password ${superuser.escapeLiteral(passwords.runtime)}`);
  } finally {
    await superuser.end();
  }
  const base = new URL(container.getConnectionUri());
  const url = (database: string, role: 'superuser' | 'migration' | 'runtime'): string => {
    if (role === 'superuser') {
      const target = new URL(base);
      target.pathname = `/${database}`;
      return target.toString();
    }
    return `postgres://aos_${role}:${passwords[role]}@${container.getHost()}:${String(container.getPort())}/${database}`;
  };
  const query = async <T extends Record<string, unknown>>(database: string, text: string, values: unknown[] = []) => {
    const client = new Client({ connectionString: url(database, 'superuser') });
    await client.connect();
    try {
      return (await client.query<T>(text, values)).rows;
    } finally {
      await client.end();
    }
  };
  const system = new Set(['postgres', base.pathname.slice(1)]);
  return {
    containerId: container.getId(),
    url,
    query,
    async createDirectory(label) {
      const name = `syn_${label}_${randomBytes(4).toString('hex')}`;
      await query('postgres', `create database ${name} owner aos_migration`);
      return name;
    },
    async clear() {
      const rows = await query<{ datname: string }>(
        'postgres',
        'select datname::text as datname from pg_catalog.pg_database where not datistemplate',
      );
      for (const { datname } of rows) {
        if (!system.has(datname)) await query('postgres', `drop database "${datname}" with (force)`);
      }
    },
    async stop() {
      await container.stop();
    },
  };
}
