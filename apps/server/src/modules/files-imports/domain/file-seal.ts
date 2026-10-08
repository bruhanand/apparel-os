import { createHash } from 'node:crypto';
import type { OrganisationKeys } from '../../access/index.js';

// Every stored file is encrypted by the application with the Organisation's key before it reaches file storage, so
// the bucket and its backups hold only encrypted files (imports-and-opening-data 11; PRD-SEC-006, POL-18.02). The
// content hash is taken before encryption. The ciphertext is bound to the file's hash, so an object copied under
// another key does not read back.

/** The SHA-256 of the plaintext, as lower-case hex. */
export function contentHashOf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * An object key starts with the Organisation's identifier, so one Organisation's objects are found without reading its
 * database (backup-and-restore 2.1; GC9-10). The rest names the content, so the same bytes are one object.
 */
export function objectKeyOf(organisationId: string, contentHash: string): string {
  return `${organisationId}/files/${contentHash}`;
}

function contextOf(contentHash: string): string {
  return `files_imports.stored_file:${contentHash}`;
}

export interface SealedFile {
  readonly scheme: string;
  readonly bytes: Buffer;
}

export function sealFile(
  keys: OrganisationKeys,
  organisationCode: string,
  contentHash: string,
  plaintext: Buffer,
): SealedFile {
  const sealed = keys.encrypt(organisationCode, 'stored-file', plaintext, contextOf(contentHash));
  return { scheme: sealed.scheme, bytes: Buffer.from(sealed.ciphertext, 'base64url') };
}

export function openFile(
  keys: OrganisationKeys,
  organisationCode: string,
  contentHash: string,
  scheme: string,
  sealed: Buffer,
): Buffer {
  return keys.decrypt(
    organisationCode,
    'stored-file',
    { scheme, ciphertext: sealed.toString('base64url') },
    contextOf(contentHash),
  );
}
