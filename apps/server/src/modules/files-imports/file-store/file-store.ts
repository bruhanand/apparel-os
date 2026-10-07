/** The token of the file store (the S3-compatible adapter of files-imports; code-house-rules 12.10). */
export const FILE_STORE = 'files-imports.FileStore';
/** The token of the variables the file store settings are read from: the process's, unless a test gives others. */
export const FILE_STORE_ENVIRONMENT = 'files-imports.FileStoreEnvironment';

/**
 * The file store: an S3-compatible bucket, MinIO locally and in tests, the Railway bucket on `dev` (imports-and-
 * opening-data 3.1 step 2; deployment.md D-2; DEC-105). It has exactly two operations. There is no overwrite and no
 * delete, so nothing in the application can replace or remove an object once written (backup-and-restore 3.3;
 * PRD-MOD-011); deleting after the retention period is designed with S1-F14-T01, not offered here (POL-18.05).
 *
 * Every call is an outside call, so each refuses to run inside a command's transaction (code-house-rules 8.3;
 * PRD-INT-006).
 */
export interface FileStore {
  /**
   * Writes an object under a key that holds none. When the key is taken, writes nothing and answers
   * `already-there`: the key names content, so what is there is the same bytes.
   */
  putOnce(key: string, bytes: Buffer): Promise<'written' | 'already-there'>;
  /** Reads an object whole. */
  get(key: string): Promise<Buffer>;
}

/** The file store of an environment, or the fact that none is set. Nothing is on by default (AGENTS.md). */
export type FileStoreHandle =
  { readonly kind: 'configured'; readonly store: FileStore } | { readonly kind: 'not-configured' };
