import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

// The key per Organisation, held outside the database (access-and-approvals 6; PRD-SEC-006, POL-18.02). On test
// hosting it is an environment secret (deployment.md section 9): one variable maps each Organisation code to its key.
// Key storage and rotation on production wait for the production hosting design (deployment.md D-1).
//
// One key per Organisation, and from it one subkey per purpose (HKDF-SHA-256, RFC 5869), so a value encrypted for
// one purpose never reads back under another. Values are encrypted with AES-256-GCM: authenticated, with a fresh
// 96-bit nonce each time and the record it belongs to bound in as associated data.
//
// The key version's identifier (backup-and-restore 2.4) is taken from a subkey of its own too, never from the key
// itself: HKDF info `apparel-os/key-version-identifier`, a label no purpose's info (`apparel-os/<purpose>`, one word)
// can equal, so the identifier's subkey is separated from every encryption and digest subkey (domain separation).
//
// The environment holds one key per Organisation, the version in use. The restore is given the custodian's kept
// copies instead, where an Organisation may have several versions (2.4): each value then opens with the version it
// names, and a value written before key versions were recorded with whichever version opens it.

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
  /**
   * The identifier of the key version that sealed it (backup-and-restore 2.3, 2.4; GC9-18). Set on every value sealed
   * now; a value read back from a row written before key versions were recorded has none.
   */
  readonly keyVersion?: string;
}

const SCHEME = 'aes-256-gcm/hkdf-sha256/1';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const VERSION_LABEL = 'apparel-os/key-version';
const VERSION_SUBKEY_INFO = 'apparel-os/key-version-identifier';
const VERSION_BYTES = 16;

/**
 * The identifier of a key version: HMAC-SHA-256 of a fixed label under the key's identifier subkey (HKDF-SHA-256,
 * info `apparel-os/key-version-identifier`), shortened to 128 bits, as lower-case hex. It names the key without
 * revealing it (2.4; GC9-18).
 */
function identifierOf(key: Buffer): string {
  const subkey = Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), VERSION_SUBKEY_INFO, KEY_BYTES));
  return createHmac('sha256', subkey).update(VERSION_LABEL, 'utf8').digest().subarray(0, VERSION_BYTES).toString('hex');
}

/** One Organisation's keys: the version in use, and every version held, by identifier. */
interface HeldKeys {
  readonly current: Buffer;
  readonly versions: ReadonlyMap<string, Buffer>;
}

function held(keys: readonly Buffer[]): HeldKeys {
  const [current] = keys;
  if (current === undefined) throw new Error('An Organisation has at least one key');
  return { current, versions: new Map(keys.map((key) => [identifierOf(key), key])) };
}

function keyOf(text: unknown): Buffer | undefined {
  const key = typeof text === 'string' && BASE64URL.test(text) ? Buffer.from(text, 'base64url') : undefined;
  return key?.length === KEY_BYTES ? key : undefined;
}

/** No key is configured for the Organisation: a deployment defect, answered `failed`. Names no key. */
export class OrganisationKeyMissing extends Error {
  constructor() {
    super('The Organisation has no key: no key is configured for it in the environment');
    this.name = 'OrganisationKeyMissing';
  }
}

/** The keys of every Organisation this server serves. Never prints a key. */
export class OrganisationKeys {
  readonly #keys: ReadonlyMap<string, HeldKeys>;

  private constructor(keys: ReadonlyMap<string, HeldKeys>) {
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
    const keys = new Map<string, HeldKeys>();
    for (const [code, value] of Object.entries(parsed)) {
      const key = keyOf(value);
      if (code === '' || key === undefined) {
        throw new Error(`${ORGANISATION_KEYS_VARIABLE}: each key is ${String(KEY_BYTES)} bytes in base64url`);
      }
      keys.set(code, held([key]));
    }
    return new OrganisationKeys(keys);
  }

  /**
   * Reads the custodian's kept copies as the restore is given them at its prompt (backup-and-restore 2.4): a JSON
   * object of Organisation code to one key, or to a list of every key version kept, each 32 bytes in base64url. Throws
   * saying what is wrong, never a value.
   */
  static fromKeptCopies(text: string): OrganisationKeys {
    const wrong =
      'The kept copies are a JSON object of Organisation code to a key, or a list of keys, of 32 bytes in base64url';
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(wrong);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(wrong);
    const keys = new Map<string, HeldKeys>();
    for (const [code, value] of Object.entries(parsed)) {
      const list = (Array.isArray(value) ? value : [value]).map(keyOf);
      if (code === '' || list.length === 0 || list.some((key) => key === undefined)) throw new Error(wrong);
      keys.set(code, held(list as Buffer[]));
    }
    return new OrganisationKeys(keys);
  }

  /** Encrypts a value for one purpose, bound to `context`, such as the record it belongs to. */
  encrypt(organisationCode: string, purpose: KeyPurpose, plaintext: Buffer, context: string): SealedValue {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.subkey(organisationCode, purpose), nonce);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      scheme: SCHEME,
      ciphertext: Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64url'),
      keyVersion: this.version(organisationCode),
    };
  }

  /**
   * The identifier of the Organisation's key version (backup-and-restore 2.4; GC9-18): HMAC-SHA-256 of a fixed label
   * under the key, shortened to 128 bits, as lower-case hex. It names the key without revealing it.
   */
  version(organisationCode: string): string {
    const keys = this.#keys.get(organisationCode);
    if (keys === undefined) throw new OrganisationKeyMissing();
    return identifierOf(keys.current);
  }

  /** The key version in use of every Organisation this server holds a key for, by code: what the start check compares. */
  versions(): ReadonlyMap<string, string> {
    return new Map([...this.#keys.keys()].map((code) => [code, this.version(code)]));
  }

  /** Every key version held for each Organisation, by code: what a restore was given from the kept copies (2.4). */
  heldVersions(): ReadonlyMap<string, ReadonlySet<string>> {
    return new Map([...this.#keys].map(([code, keys]) => [code, new Set(keys.versions.keys())]));
  }

  /** Reads a value back. Throws when the Organisation, the purpose or the context differs, or it was changed. */
  /**
   * Reads a value back with the key version it names, or, for a value written before key versions were recorded, with
   * whichever version held opens it. Throws when the version is not held, or the Organisation, the purpose or the
   * context differs, or it was changed.
   */
  decrypt(organisationCode: string, purpose: KeyPurpose, value: SealedValue, context: string): Buffer {
    if (value.scheme !== SCHEME) throw new Error('The value was sealed under a scheme this server does not read');
    const keys = this.#keys.get(organisationCode);
    if (keys === undefined) throw new OrganisationKeyMissing();
    const bytes = Buffer.from(value.ciphertext, 'base64url');
    const open = (key: Buffer): Buffer => {
      const decipher = createDecipheriv('aes-256-gcm', subkeyOf(key, purpose), bytes.subarray(0, NONCE_BYTES));
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(bytes.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES));
      return Buffer.concat([decipher.update(bytes.subarray(NONCE_BYTES + TAG_BYTES)), decipher.final()]);
    };
    if (value.keyVersion !== undefined) {
      const key = keys.versions.get(value.keyVersion);
      if (key === undefined) throw new Error('The value names a key version that is not held');
      return open(key);
    }
    const candidates = [keys.current, ...[...keys.versions.values()].filter((key) => key !== keys.current)];
    for (const [index, key] of candidates.entries()) {
      try {
        return open(key);
      } catch (error) {
        if (index === candidates.length - 1) throw error;
      }
    }
    throw new Error('No key version opens the value');
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
    const keys = this.#keys.get(organisationCode);
    if (keys === undefined) throw new OrganisationKeyMissing();
    return subkeyOf(keys.current, purpose);
  }
}

/** The subkey of one purpose (HKDF-SHA-256, info `apparel-os/<purpose>`). */
function subkeyOf(key: Buffer, purpose: KeyPurpose): Buffer {
  return Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), `apparel-os/${purpose}`, KEY_BYTES));
}
