import { createHmac, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';

// The signature of a backup (backup-and-restore 2.3, 3.2 step 7, 4.2 step 1; product owner, 12 Oct 2026; POL-18.02,
// PRD-ACP-019). The backup key's public part, which seals a backup, is no secret: anyone holding it could seal a
// planted backup. So the backup command also signs each backup, with an Ed25519 signing key held only by the backup
// runner, never by `app` or `worker`; the restore verifies the signature with the matching public part and refuses an
// unsigned or badly signed backup before it reads anything else. Ed25519 is in Node's built-in crypto, so no
// dependency is added.
//
// What is signed is the backup's statement, written last, after the manifest is read back (3.2 step 7): the backup's
// identifier, the manifest's name and the SHA-256 of the sealed manifest as stored, the backup's final result and its
// failures, and the signing key version's identifier. The manifest lists every dump's SHA-256, so the signature covers
// every dump too. The statement is kept as `backups/<backup id>/manifest.signature`: the statement's bytes and the
// signature over a fixed label and those bytes, both in base64, so nothing is signed that is not read back exactly.

/** The variable of the backup runner that holds the signing key: base64 of its PKCS #8 DER form. Never logged. */
export const BACKUP_SIGNING_KEY_VARIABLE = 'AOS_BACKUP_SIGNING_KEY';
/** The variable of the restore runner that holds the signing key's public part: base64 of its SPKI DER form. */
export const BACKUP_SIGNING_PUBLIC_KEY_VARIABLE = 'AOS_BACKUP_SIGNING_PUBLIC_KEY';

export const SIGNATURE_FORMAT = 'backup-signature/1';
const SIGNED_LABEL = Buffer.from('apparel-os/backup-signature/1\n', 'utf8');
const VERSION_LABEL = 'apparel-os/backup-signing-key-version';
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

/** The name of a backup's signature in the backup store. */
export function signatureName(backupId: string): string {
  return `backups/${backupId}/manifest.signature`;
}

/** What the backup command signs once the backup is checked, the manifest included. */
export interface BackupStatement {
  readonly format: typeof SIGNATURE_FORMAT;
  readonly backupId: string;
  readonly manifestObject: string;
  /** SHA-256 of the sealed manifest as stored. */
  readonly manifestSha256: string;
  readonly result: 'complete' | 'failed';
  /** The kinds of failure found, the manifest's own read-back included. */
  readonly failures: readonly string[];
  /** The signing key version's identifier (2.4). */
  readonly signingKeyVersion: string;
}

/** The raw 32 bytes of an Ed25519 public key. */
function pointOf(key: KeyObject): Buffer {
  const jwk = key.export({ format: 'jwk' });
  if (typeof jwk.x !== 'string') throw new Error('Not an Ed25519 key');
  return Buffer.from(jwk.x, 'base64url');
}

/** The identifier of a signing key version: HMAC-SHA-256 of a fixed label under its public point, 128 bits, hex. */
function versionOf(publicKey: KeyObject): string {
  return createHmac('sha256', pointOf(publicKey))
    .update(VERSION_LABEL, 'utf8')
    .digest()
    .subarray(0, 16)
    .toString('hex');
}

function hidden(): string {
  return '[backup signing key]';
}

/** The signing key, as the backup runner's environment holds it. Never prints a key. */
export class BackupSigningKey {
  readonly #key: KeyObject;
  readonly version: string;

  private constructor(key: KeyObject) {
    this.#key = key;
    this.version = versionOf(createPublicKey(key));
  }

  /** Reads the signing key, or throws naming the variable and what is wrong, never a value (PRD-SEC-014). */
  static fromEnvironment(env: Readonly<Record<string, string | undefined>>): BackupSigningKey {
    const text = env[BACKUP_SIGNING_KEY_VARIABLE]?.trim();
    if (text === undefined || text === '') throw new Error(`${BACKUP_SIGNING_KEY_VARIABLE} is not set`);
    const wrong = `${BACKUP_SIGNING_KEY_VARIABLE} is not an Ed25519 private key, as base64 of its PKCS #8 DER form`;
    if (!BASE64.test(text)) throw new Error(wrong);
    let key: KeyObject;
    try {
      key = createPrivateKey({ key: Buffer.from(text, 'base64'), format: 'der', type: 'pkcs8' });
    } catch {
      throw new Error(wrong);
    }
    if (key.asymmetricKeyType !== 'ed25519') throw new Error(wrong);
    return new BackupSigningKey(key);
  }

  /** The stored signature of a statement: its bytes and the signature over the label and those bytes. */
  sign(statement: Omit<BackupStatement, 'format' | 'signingKeyVersion'>): Buffer {
    const full: BackupStatement = {
      format: SIGNATURE_FORMAT,
      backupId: statement.backupId,
      manifestObject: statement.manifestObject,
      manifestSha256: statement.manifestSha256,
      result: statement.result,
      failures: [...statement.failures],
      signingKeyVersion: this.version,
    };
    const bytes = Buffer.from(JSON.stringify(full), 'utf8');
    const signature = sign(null, Buffer.concat([SIGNED_LABEL, bytes]), this.#key);
    return Buffer.from(
      JSON.stringify({ statement: bytes.toString('base64'), signature: signature.toString('base64') }),
      'utf8',
    );
  }

  toJSON(): string {
    return hidden();
  }

  toString(): string {
    return hidden();
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return hidden();
  }
}

/** Why a stored signature was not accepted, in words that name no value. */
export class BackupSignatureRefused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'BackupSignatureRefused';
  }
}

/** The signing key's public part, as the restore runner's environment holds it. */
export class BackupVerifyKey {
  readonly #key: KeyObject;
  readonly version: string;

  private constructor(key: KeyObject) {
    this.#key = key;
    this.version = versionOf(key);
  }

  /** Reads the public part, or throws naming the variable and what is wrong, never a value. */
  static fromEnvironment(env: Readonly<Record<string, string | undefined>>): BackupVerifyKey {
    const text = env[BACKUP_SIGNING_PUBLIC_KEY_VARIABLE]?.trim();
    if (text === undefined || text === '') throw new Error(`${BACKUP_SIGNING_PUBLIC_KEY_VARIABLE} is not set`);
    const wrong = `${BACKUP_SIGNING_PUBLIC_KEY_VARIABLE} is not the public part of an Ed25519 key, as base64 of its SPKI DER form`;
    if (!BASE64.test(text)) throw new Error(wrong);
    let key: KeyObject;
    try {
      key = createPublicKey({ key: Buffer.from(text, 'base64'), format: 'der', type: 'spki' });
    } catch {
      throw new Error(wrong);
    }
    if (key.asymmetricKeyType !== 'ed25519') throw new Error(wrong);
    return new BackupVerifyKey(key);
  }

  /**
   * Reads a stored signature: the statement it signs, when the signature verifies under this key and the statement is
   * of this backup; otherwise throws BackupSignatureRefused.
   */
  verify(stored: Buffer, backupId: string): BackupStatement {
    let parsed: { statement?: unknown; signature?: unknown };
    try {
      parsed = JSON.parse(stored.toString('utf8')) as { statement?: unknown; signature?: unknown };
    } catch {
      throw new BackupSignatureRefused('the backup signature is not in the form this code reads');
    }
    if (typeof parsed.statement !== 'string' || typeof parsed.signature !== 'string') {
      throw new BackupSignatureRefused('the backup signature is not in the form this code reads');
    }
    const bytes = Buffer.from(parsed.statement, 'base64');
    const signature = Buffer.from(parsed.signature, 'base64');
    let good: boolean;
    try {
      good = verify(null, Buffer.concat([SIGNED_LABEL, bytes]), this.#key, signature);
    } catch {
      good = false;
    }
    if (!good) {
      throw new BackupSignatureRefused(
        `the backup is not signed by the signing key version ${this.version} given: its signature does not verify`,
      );
    }
    const statement = JSON.parse(bytes.toString('utf8')) as BackupStatement;
    if ((statement.format as string) !== SIGNATURE_FORMAT || statement.backupId !== backupId) {
      throw new BackupSignatureRefused('the backup signature is of another backup or a format this code does not read');
    }
    return statement;
  }

  toJSON(): string {
    return hidden();
  }
}
