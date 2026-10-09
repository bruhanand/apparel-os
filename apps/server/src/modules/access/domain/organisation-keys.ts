import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

// The key per Organisation, held outside the database (access-and-approvals 6; PRD-SEC-006, POL-18.02). On test
// hosting it is an environment secret (deployment.md section 9): one variable maps each Organisation code to its key.
// Key storage and rotation on production wait for the production hosting design (deployment.md D-1).
//
// One key per Organisation, and from it one subkey per purpose (HKDF-SHA-256, RFC 5869), so a value encrypted for
// one purpose never reads back under another. Values are encrypted with AES-256-GCM: authenticated, with a fresh
// 96-bit nonce each time and the record it belongs to bound in as associated data.

/** The variable that holds the keys: a JSON object of Organisation code to 32 bytes in base64url. */
export const ORGANISATION_KEYS_VARIABLE = 'AOS_ORGANISATION_KEYS';

/** What a subkey is for. Each gets its own subkey. */
export type KeyPurpose =
  | 'authenticator-secret'
  | 'restricted-value'
  | 'sign-in-throttling'
  | 'stored-file'
  | 'file-receipt'
  /** A party's bank details, kept encrypted by merchandise (access-and-approvals 6; S1-F03-T03). */
  | 'bank-details';

/** A value encrypted under an Organisation's key. The scheme names the algorithm and its version. */
export interface SealedValue {
  readonly scheme: string;
  readonly ciphertext: string;
}

const SCHEME = 'aes-256-gcm/hkdf-sha256/1';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** No key is configured for the Organisation: a deployment defect, answered `failed`. Names no key. */
export class OrganisationKeyMissing extends Error {
  constructor() {
    super('The Organisation has no key: no key is configured for it in the environment');
    this.name = 'OrganisationKeyMissing';
  }
}

/** The keys of every Organisation this server serves. Never prints a key. */
export class OrganisationKeys {
  readonly #keys: ReadonlyMap<string, Buffer>;

  private constructor(keys: ReadonlyMap<string, Buffer>) {
    this.#keys = keys;
  }

  /**
   * Reads the keys at start, or throws naming the variable and what is wrong, never a value (PRD-SEC-014;
   * code-house-rules 12.14 "Technical settings": a missing one stops the service at start).
   */
  static fromEnvironment(env: Readonly<Record<string, string | undefined>>): OrganisationKeys {
    const text = env[ORGANISATION_KEYS_VARIABLE];
    if (text === undefined || text === '') throw new Error(`${ORGANISATION_KEYS_VARIABLE} is not set`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`${ORGANISATION_KEYS_VARIABLE} is not a JSON object`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${ORGANISATION_KEYS_VARIABLE} is not a JSON object of Organisation code to key`);
    }
    const keys = new Map<string, Buffer>();
    for (const [code, value] of Object.entries(parsed)) {
      const key = typeof value === 'string' && BASE64URL.test(value) ? Buffer.from(value, 'base64url') : undefined;
      if (code === '' || key?.length !== KEY_BYTES) {
        throw new Error(`${ORGANISATION_KEYS_VARIABLE}: each key is ${String(KEY_BYTES)} bytes in base64url`);
      }
      keys.set(code, key);
    }
    return new OrganisationKeys(keys);
  }

  /** Encrypts a value for one purpose, bound to `context`, such as the record it belongs to. */
  encrypt(organisationCode: string, purpose: KeyPurpose, plaintext: Buffer, context: string): SealedValue {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.subkey(organisationCode, purpose), nonce);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { scheme: SCHEME, ciphertext: Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64url') };
  }

  /** Reads a value back. Throws when the Organisation, the purpose or the context differs, or it was changed. */
  decrypt(organisationCode: string, purpose: KeyPurpose, value: SealedValue, context: string): Buffer {
    if (value.scheme !== SCHEME) throw new Error('The value was sealed under a scheme this server does not read');
    const bytes = Buffer.from(value.ciphertext, 'base64url');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.subkey(organisationCode, purpose),
      bytes.subarray(0, NONCE_BYTES),
    );
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(bytes.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(bytes.subarray(NONCE_BYTES + TAG_BYTES)), decipher.final()]);
  }

  /** A keyed digest (HMAC-SHA-256) of a text, as lower-case hex: the same text always gives the same digest. */
  digest(organisationCode: string, purpose: KeyPurpose, text: string): string {
    return createHmac('sha256', this.subkey(organisationCode, purpose)).update(text, 'utf8').digest('hex');
  }

  toJSON(): string {
    return '[organisation keys]';
  }

  toString(): string {
    return '[organisation keys]';
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return '[organisation keys]';
  }

  private subkey(organisationCode: string, purpose: KeyPurpose): Buffer {
    const key = this.#keys.get(organisationCode);
    if (key === undefined) throw new OrganisationKeyMissing();
    return Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), `apparel-os/${purpose}`, KEY_BYTES));
  }
}
