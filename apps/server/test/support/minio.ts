import { randomBytes } from 'node:crypto';
import { CreateBucketCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { MinioContainer } from '@testcontainers/minio';
import { FILE_STORE_VARIABLES } from '../../src/modules/files-imports/index.js';

// A MinIO container for the tests of stored files (code-house-rules 12.10: MinIO locally and in tests; PRD Stack:
// Files). One per test file that needs it, with a bucket of its own and throwaway credentials for this run only.
// The image is pinned by digest. MinIO no longer publishes its community image to Docker Hub or Quay, so the test
// image is Chainguard's build of MinIO (release RELEASE.2026-09-22T19-25-18Z when pinned, 8 Oct 2026), whose free
// tier offers only `latest`; the digest keeps the run reproducible while it stays available. Replace it with the
// digest of a newer image when it goes (a test-only change; no application code depends on the image).
const MINIO_IMAGE = 'cgr.dev/chainguard/minio@sha256:e7ca559d9f7c0b5f24f5f669bb92f40f3ca88d56273b808bf3a7c116c17d2ffa';

export interface TestFileStore {
  /** The variables that configure the application's file store to use this container. */
  readonly environment: Record<string, string>;
  /** A client of the bucket for the test's own inspection (never the application's). */
  readonly client: S3Client;
  readonly bucket: string;
  /** The keys of every object in the bucket, sorted. */
  keys(): Promise<string[]>;
  stop(): Promise<void>;
}

export async function startTestFileStore(): Promise<TestFileStore> {
  const username = `syn${randomBytes(6).toString('hex')}`;
  const password = randomBytes(16).toString('hex');
  const container = await new MinioContainer(MINIO_IMAGE).withUsername(username).withPassword(password).start();
  const endpoint = container.getConnectionUrl();
  const bucket = `syn-files-${randomBytes(4).toString('hex')}`;
  const client = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: username, secretAccessKey: password },
  });
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  return {
    environment: {
      [FILE_STORE_VARIABLES.endpoint]: endpoint,
      [FILE_STORE_VARIABLES.region]: 'us-east-1',
      [FILE_STORE_VARIABLES.bucket]: bucket,
      [FILE_STORE_VARIABLES.accessKeyId]: username,
      [FILE_STORE_VARIABLES.secretAccessKey]: password,
      [FILE_STORE_VARIABLES.addressing]: 'path',
    },
    client,
    bucket,
    async keys() {
      const found: string[] = [];
      let token: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
        for (const object of page.Contents ?? []) if (object.Key !== undefined) found.push(object.Key);
        token = page.NextContinuationToken;
      } while (token !== undefined);
      return found.sort();
    },
    async stop() {
      client.destroy();
      await container.stop();
    },
  };
}
