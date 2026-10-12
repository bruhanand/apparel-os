import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { CreateBucketCommand, GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { BackupPrivateKey, BACKUP_STORE_VARIABLES, runDump, type DumpTool } from '../../src/kernel/index.js';
import { createEmptyDatabase, testServer } from './postgres.js';

// Helpers for the tests of backup and restore (backup-and-restore section 12; S1-F14-T02). PostgreSQL's own client
// tools run inside the test's PostgreSQL container, so their major version is the server's (GC9-A5) whatever the
// machine has. Every key here is SYNTHETIC, made for one run.

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

/** `pg_dump` of the server's version, run inside the test container over its local socket as the migration role. */
export const containerDumpTool: DumpTool = {
  dump(target, into) {
    const database = decodeURIComponent(new URL(target.connectionString).pathname.slice(1));
    return runDump(
      'docker',
      [
        'exec',
        testServer().containerId,
        'pg_dump',
        '--host=/var/run/postgresql',
        '--username=aos_migration',
        `--dbname=${database}`,
        '--format=custom',
        '--no-password',
        `--snapshot=${target.snapshot}`,
      ],
      { PATH: process.env.PATH },
      into,
    );
  },
};

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
