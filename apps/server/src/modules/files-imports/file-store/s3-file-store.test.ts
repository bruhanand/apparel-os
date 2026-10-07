import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FILE_STORE_VARIABLES,
  fileStoreFromEnvironment,
  fileStoreSettingsFromEnvironment,
  S3FileStore,
} from './s3-file-store.js';

// Code-house-rules 12.14: a setting that is missing stops the service only when it is part-set; none set means file
// storage is not configured and says so. All values here are SYNTHETIC.
const complete = {
  [FILE_STORE_VARIABLES.endpoint]: 'http://synthetic.localhost:9000',
  [FILE_STORE_VARIABLES.region]: 'us-east-1',
  [FILE_STORE_VARIABLES.bucket]: 'syn-files',
  [FILE_STORE_VARIABLES.accessKeyId]: 'SYNTHETIC-id',
  [FILE_STORE_VARIABLES.secretAccessKey]: 'SYNTHETIC-secret-value',
  [FILE_STORE_VARIABLES.addressing]: 'path',
};

describe('the file store settings', () => {
  it('is not configured when none is set: nothing is on by default', () => {
    expect(fileStoreSettingsFromEnvironment({})).toBeUndefined();
    expect(fileStoreFromEnvironment({})).toEqual({ kind: 'not-configured' });
  });

  it('reads a complete set', () => {
    expect(fileStoreSettingsFromEnvironment(complete)).toMatchObject({ bucket: 'syn-files', addressing: 'path' });
  });

  it('PRD-SEC-014 refuses a part-set configuration, naming the missing variables and never a value', () => {
    const partial = Object.fromEntries(
      Object.entries(complete).filter(([name]) => name !== FILE_STORE_VARIABLES.bucket),
    );
    let message = '';
    try {
      fileStoreSettingsFromEnvironment(partial);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(FILE_STORE_VARIABLES.bucket);
    expect(message).not.toContain('SYNTHETIC-secret-value');
  });

  it('refuses an addressing that is neither path nor virtual', () => {
    expect(() => fileStoreSettingsFromEnvironment({ ...complete, [FILE_STORE_VARIABLES.addressing]: 'other' })).toThrow(
      FILE_STORE_VARIABLES.addressing,
    );
  });
});

describe('putOnce answers (imports-and-opening-data 3.1 step 2)', () => {
  let server: Server | undefined;
  let store: S3FileStore | undefined;
  afterEach(async () => {
    store?.destroy();
    const open = server;
    if (open !== undefined) {
      await new Promise<void>((resolve) => {
        open.close(() => {
          resolve();
        });
      });
    }
  });

  async function storeAnswering(status: number): Promise<S3FileStore> {
    server = createServer((request, response) => {
      request.resume();
      response.writeHead(status, { 'content-type': 'application/xml' });
      response.end('<Error><Code>SYNTHETIC</Code></Error>');
    });
    const listening = server;
    await new Promise<void>((resolve) => {
      listening.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    store = new S3FileStore({
      endpoint: `http://127.0.0.1:${String(port)}`,
      region: 'us-east-1',
      bucket: 'syn-files',
      accessKeyId: 'SYNTHETIC-id',
      secretAccessKey: 'SYNTHETIC-secret-value',
      addressing: 'path',
    });
    return store;
  }

  it('412 means the object is there already', async () => {
    expect(await (await storeAnswering(412)).putOnce('k', Buffer.from('x'))).toBe('already-there');
  });

  it('409 is a write in progress, not an object that is there: it fails and is retried by the caller', async () => {
    await expect((await storeAnswering(409)).putOnce('k', Buffer.from('x'))).rejects.toThrow();
  });
});
