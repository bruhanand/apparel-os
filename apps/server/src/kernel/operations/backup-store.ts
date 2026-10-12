import type { Readable } from 'node:stream';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// The backup store (backup-and-restore 3.2, 3.3; GC9-A4): an S3-compatible bucket apart from the file store, whose
// credentials `app` and `worker` do not hold. Only the backup command (and the restore, S1-F14-T03) reach it. Nothing
// in it is ever overwritten: each write refuses a key that is taken, so a backup copy is never edited (8.4). Removing
// expired backups is designed with how long backups are kept (GC9-2), so there is no delete.
//
// Layout: `backups/<backup id>/<part>` for each backup's sealed dumps and manifest, and `files/<object key>` for the
// file store's objects, shared by every backup that references them, so the file copy is incremental (3.3).

export const BACKUP_STORE_VARIABLES = {
  endpoint: 'AOS_BACKUP_STORE_ENDPOINT',
  region: 'AOS_BACKUP_STORE_REGION',
  bucket: 'AOS_BACKUP_STORE_BUCKET',
  accessKeyId: 'AOS_BACKUP_STORE_ACCESS_KEY_ID',
  secretAccessKey: 'AOS_BACKUP_STORE_SECRET_ACCESS_KEY',
  addressing: 'AOS_BACKUP_STORE_ADDRESSING',
} as const;

/** The settings of an S3-compatible bucket: the backup store's, or the file store's as the backup reads it. */
export interface BucketSettings {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** `path` for MinIO, `virtual` for a bucket reached as a subdomain of its endpoint. */
  readonly addressing: 'path' | 'virtual';
}

/**
 * Reads a bucket's settings from six variables, all required: names the missing ones, never a value
 * (code-house-rules 12.14; PRD-SEC-014).
 */
export function bucketSettingsFrom(
  env: Readonly<Record<string, string | undefined>>,
  variables: Readonly<Record<keyof BucketSettings, string>>,
): BucketSettings {
  const missing = Object.values(variables).filter((name) => env[name] === undefined || env[name] === '');
  if (missing.length > 0) throw new Error(`Set: ${missing.join(', ')}`);
  const addressing = env[variables.addressing];
  if (addressing !== 'path' && addressing !== 'virtual') throw new Error(`${variables.addressing} is path or virtual`);
  return {
    endpoint: env[variables.endpoint] ?? '',
    region: env[variables.region] ?? '',
    bucket: env[variables.bucket] ?? '',
    accessKeyId: env[variables.accessKeyId] ?? '',
    secretAccessKey: env[variables.secretAccessKey] ?? '',
    addressing,
  };
}

/** The backup store as the backup command uses it. */
export interface BackupStore {
  /** Writes an object under a key that holds none; `already-there` when the key is taken, writing nothing. */
  putOnce(name: string, body: Buffer | Readable, length: number): Promise<'written' | 'already-there'>;
  /** Reads an object as a stream. */
  get(name: string): Promise<Readable>;
  /** The keys under a prefix, from the store's own listing (3.3). */
  list(prefix: string): Promise<string[]>;
}

/** A bucket reached with the AWS SDK. Used for the backup store, and by `files-imports` to read the file store. */
export class S3Bucket implements BackupStore {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(settings: BucketSettings) {
    this.#bucket = settings.bucket;
    this.#client = new S3Client({
      endpoint: settings.endpoint,
      region: settings.region,
      forcePathStyle: settings.addressing === 'path',
      credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    });
  }

  async putOnce(name: string, body: Buffer | Readable, length: number): Promise<'written' | 'already-there'> {
    try {
      await this.#client.send(
        new PutObjectCommand({ Bucket: this.#bucket, Key: name, Body: body, ContentLength: length, IfNoneMatch: '*' }),
      );
      return 'written';
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 412) return 'already-there';
      throw error;
    }
  }

  async get(name: string): Promise<Readable> {
    const answer = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: name }));
    if (answer.Body === undefined) throw new Error('The store answered an object with no body');
    return answer.Body as Readable;
  }

  /** Reads an object as a stream with its length. */
  async getWithLength(name: string): Promise<{ readonly body: Readable; readonly length: number }> {
    const answer = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: name }));
    if (answer.Body === undefined || answer.ContentLength === undefined) {
      throw new Error('The store answered an object with no body or length');
    }
    return { body: answer.Body as Readable, length: answer.ContentLength };
  }

  async list(prefix: string): Promise<string[]> {
    const found: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.#client.send(
        new ListObjectsV2Command({ Bucket: this.#bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const object of page.Contents ?? []) if (object.Key !== undefined) found.push(object.Key);
      token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
    } while (token !== undefined);
    return found.sort();
  }

  destroy(): void {
    this.#client.destroy();
  }
}
