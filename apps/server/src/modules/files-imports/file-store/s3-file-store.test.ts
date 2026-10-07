import { describe, expect, it } from 'vitest';
import { FILE_STORE_VARIABLES, fileStoreFromEnvironment, fileStoreSettingsFromEnvironment } from './s3-file-store.js';

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
