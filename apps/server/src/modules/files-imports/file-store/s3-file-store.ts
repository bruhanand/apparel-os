import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { refuseInsideCommand } from '../../../kernel/index.js';
import type { FileStore, FileStoreHandle } from './file-store.js';

// The S3-compatible file store (PRD Stack: Files; deployment.md D-2). It imports only the two commands it needs: the
// delete and copy commands of the SDK are never imported here, so no code path of the application can remove or
// replace an object (backup-and-restore 3.3). A test reads this file to prove it.

export const FILE_STORE_VARIABLES = {
  endpoint: 'AOS_FILE_STORE_ENDPOINT',
  region: 'AOS_FILE_STORE_REGION',
  bucket: 'AOS_FILE_STORE_BUCKET',
  accessKeyId: 'AOS_FILE_STORE_ACCESS_KEY_ID',
  secretAccessKey: 'AOS_FILE_STORE_SECRET_ACCESS_KEY',
  addressing: 'AOS_FILE_STORE_ADDRESSING',
} as const;

export interface S3FileStoreSettings {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** `path` for MinIO, `virtual` for a bucket reached as a subdomain of its endpoint. */
  readonly addressing: 'path' | 'virtual';
}

/**
 * Reads the settings. None set is not configured: file storage is then unavailable and says so (nothing is on by
 * default). Some set and some missing is a mistake of the deployment: the service stops at start, naming the
 * variables and never a value (code-house-rules 12.14; PRD-SEC-014).
 */
export function fileStoreSettingsFromEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): S3FileStoreSettings | undefined {
  const names = Object.values(FILE_STORE_VARIABLES);
  const present = names.filter((name) => env[name] !== undefined && env[name] !== '');
  if (present.length === 0) return undefined;
  const missing = names.filter((name) => !present.includes(name));
  if (missing.length > 0) throw new Error(`File storage is partly set; also set: ${missing.join(', ')}`);
  const addressing = env[FILE_STORE_VARIABLES.addressing];
  if (addressing !== 'path' && addressing !== 'virtual') {
    throw new Error(`${FILE_STORE_VARIABLES.addressing} is path or virtual`);
  }
  return {
    endpoint: env[FILE_STORE_VARIABLES.endpoint] ?? '',
    region: env[FILE_STORE_VARIABLES.region] ?? '',
    bucket: env[FILE_STORE_VARIABLES.bucket] ?? '',
    accessKeyId: env[FILE_STORE_VARIABLES.accessKeyId] ?? '',
    secretAccessKey: env[FILE_STORE_VARIABLES.secretAccessKey] ?? '',
    addressing,
  };
}

export class S3FileStore implements FileStore {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(settings: S3FileStoreSettings) {
    this.#bucket = settings.bucket;
    this.#client = new S3Client({
      endpoint: settings.endpoint,
      region: settings.region,
      forcePathStyle: settings.addressing === 'path',
      credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    });
  }

  async putOnce(key: string, bytes: Buffer): Promise<'written' | 'already-there'> {
    refuseInsideCommand('File storage');
    try {
      // If-None-Match: * makes the store itself refuse to replace an object that is there.
      await this.#client.send(new PutObjectCommand({ Bucket: this.#bucket, Key: key, Body: bytes, IfNoneMatch: '*' }));
      return 'written';
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      // Only 412 (precondition failed) says the object is there. 409 (ConditionalRequestConflict) is another write of
      // the same key still in progress: nothing is known to be stored yet, so it fails and the caller retries.
      if (status === 412) return 'already-there';
      throw error;
    }
  }

  async get(key: string): Promise<Buffer> {
    refuseInsideCommand('File storage');
    const answer = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: key }));
    if (answer.Body === undefined) throw new Error('The file store answered an object with no body');
    return Buffer.from(await answer.Body.transformToByteArray());
  }

  destroy(): void {
    this.#client.destroy();
  }
}

/** The handle for an environment's variables. */
export function fileStoreFromEnvironment(env: Readonly<Record<string, string | undefined>>): FileStoreHandle {
  const settings = fileStoreSettingsFromEnvironment(env);
  return settings === undefined ? { kind: 'not-configured' } : { kind: 'configured', store: new S3FileStore(settings) };
}
