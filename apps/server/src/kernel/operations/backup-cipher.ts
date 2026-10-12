import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  type DecipherGCM,
  type KeyObject,
} from 'node:crypto';
import { Transform, Writable, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// The backup key (backup-and-restore 2.3, 2.4; GC9-17, GC9-18; POL-18.02, PRD-SEC-006). It is a key pair, never an
// Organisation key: the environment holds only the public part, with which the backup command encrypts each dump and
// the manifest; the private part, which opens a backup, exists only in the custodian's kept copies and is handed to
// the restore command at the prompt. X25519 key agreement and AES-256-GCM, both in Node's built-in crypto.
//
// One backup makes one ephemeral X25519 key pair. Its agreement with the backup key's public part, through HKDF-SHA-256,
// gives the backup's content key, held only in memory while the command runs: the command checks with it that every
// object it wrote decrypts (3.2 step 7), since it never holds the private part. Each object is sealed on its own:
//
//   header  = "AOSB" | format 1 | backup key version (16 bytes) | ephemeral public key (32) | nonce (12)
//   object  = header | AES-256-GCM ciphertext | tag (16)
//
// The header and the object's name in the backup store are the associated data, so an object renamed or moved to
// another backup does not open. The header names the key version by its identifier, never the key.

/** The variable that holds the backup key's public part: base64 of its SPKI DER form (`openssl pkey -pubout`). */
export const BACKUP_PUBLIC_KEY_VARIABLE = 'AOS_BACKUP_PUBLIC_KEY';

const MAGIC = Buffer.from('AOSB', 'ascii');
const FORMAT = 1;
const VERSION_BYTES = 16;
const POINT_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + 1 + VERSION_BYTES + POINT_BYTES + NONCE_BYTES;
const VERSION_LABEL = 'apparel-os/backup-key-version';
const CONTENT_KEY_INFO = 'apparel-os/backup/1';
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

/** The raw 32 bytes of an X25519 key's public point. */
function pointOf(key: KeyObject): Buffer {
  const jwk = key.export({ format: 'jwk' });
  if (typeof jwk.x !== 'string') throw new Error('Not an X25519 key');
  return Buffer.from(jwk.x, 'base64url');
}

/**
 * The identifier of a backup key version: HMAC-SHA-256 of a fixed label under its public point, shortened to 128 bits
 * (2.4). It names the key without revealing it, and the private part gives the same identifier.
 */
function versionBytesOf(point: Buffer): Buffer {
  return createHmac('sha256', point).update(VERSION_LABEL, 'utf8').digest().subarray(0, VERSION_BYTES);
}

function contentKeyOf(shared: Buffer, ephemeralPoint: Buffer, recipientPoint: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', shared, Buffer.concat([ephemeralPoint, recipientPoint]), CONTENT_KEY_INFO, 32));
}

function hidden(): string {
  return '[backup key]';
}

/** The header of a sealed object (above): it names the key version by its identifier, never the key. */
function headerOf(versionBytes: Buffer, ephemeralPoint: Buffer, nonce: Buffer): Buffer {
  return Buffer.concat([MAGIC, Buffer.from([FORMAT]), versionBytes, ephemeralPoint, nonce]);
}

/** The associated data of a sealed object: its header and its name, so a renamed or moved object does not open. */
function associatedDataOf(header: Buffer, name: string): Buffer {
  return Buffer.concat([header, Buffer.from(name, 'utf8')]);
}

/**
 * A stream that opens a sealed object as it passes through: it reads the header, asks `decipherFor` for the decipher
 * that header names (which throws for a header it refuses), passes on the plaintext of the body and checks the tag at
 * the end. Shared by the backup's own check (3.2 step 7) and the restore (4.2 step 2). Plaintext leaves before the tag
 * is checked; each caller says why that is safe where it uses it.
 */
function gcmOpening(decipherFor: (header: Buffer) => DecipherGCM, failure: () => Error): Transform {
  let decipher: DecipherGCM | undefined;
  let pending = Buffer.alloc(0);
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      try {
        pending = Buffer.concat([pending, chunk]);
        if (decipher === undefined) {
          if (pending.length < HEADER_BYTES) {
            done();
            return;
          }
          decipher = decipherFor(pending.subarray(0, HEADER_BYTES));
          pending = pending.subarray(HEADER_BYTES);
        }
        if (pending.length > TAG_BYTES) {
          const body = pending.subarray(0, pending.length - TAG_BYTES);
          pending = pending.subarray(pending.length - TAG_BYTES);
          done(null, decipher.update(body));
          return;
        }
        done();
      } catch {
        done(failure());
      }
    },
    flush(done) {
      try {
        if (decipher === undefined || pending.length !== TAG_BYTES) throw new Error('incomplete');
        decipher.setAuthTag(pending);
        done(null, decipher.final());
      } catch {
        done(failure());
      }
    },
  });
}

/** The backup key's public part, as the environment holds it. Never prints a key. */
export class BackupPublicKey {
  readonly #key: KeyObject;
  readonly #point: Buffer;
  /** The key version's identifier (2.4), lower-case hex. */
  readonly version: string;

  constructor(key: KeyObject) {
    if (key.type !== 'public' || key.asymmetricKeyType !== 'x25519') throw new Error('Not an X25519 public key');
    this.#key = key;
    this.#point = pointOf(key);
    this.version = versionBytesOf(this.#point).toString('hex');
  }

  /** @internal The key object, for the sealer. */
  get keyObject(): KeyObject {
    return this.#key;
  }

  /** @internal The public point, for the sealer. */
  get point(): Buffer {
    return this.#point;
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

/**
 * Reads the backup key's public part, or throws naming the variable and what is wrong, never a value
 * (code-house-rules 12.14; PRD-SEC-014).
 */
export function backupPublicKeyFromEnvironment(env: Readonly<Record<string, string | undefined>>): BackupPublicKey {
  const text = env[BACKUP_PUBLIC_KEY_VARIABLE]?.trim();
  if (text === undefined || text === '') throw new Error(`${BACKUP_PUBLIC_KEY_VARIABLE} is not set`);
  const wrong = `${BACKUP_PUBLIC_KEY_VARIABLE} is not the public part of an X25519 key pair, as base64 of its SPKI DER form`;
  if (!BASE64.test(text)) throw new Error(wrong);
  try {
    return new BackupPublicKey(
      // Node's base64 reader takes the URL-safe alphabet too.
      createPublicKey({ key: Buffer.from(text, 'base64'), format: 'der', type: 'spki' }),
    );
  } catch {
    throw new Error(wrong);
  }
}

/** What checking a stored object found: it decrypts whole under the backup's content key, or why not. */
export type SealCheck =
  { readonly ok: true; readonly plaintextBytes: number } | { readonly ok: false; readonly reason: string };

/**
 * One backup's sealing: its ephemeral key agreement and the content key it gives, held only in memory for the run of
 * the backup command and never written anywhere (2.3; PRD-SEC-006).
 */
export class BackupSealer {
  readonly #contentKey: Buffer;
  readonly #ephemeralPoint: Buffer;
  readonly #versionBytes: Buffer;
  readonly version: string;

  private constructor(contentKey: Buffer, ephemeralPoint: Buffer, versionBytes: Buffer) {
    this.#contentKey = contentKey;
    this.#ephemeralPoint = ephemeralPoint;
    this.#versionBytes = versionBytes;
    this.version = versionBytes.toString('hex');
  }

  /** Starts the sealing of one backup with the backup key's public part. */
  static start(publicKey: BackupPublicKey, backupId: string): BackupSealer {
    if (backupId === '') throw new Error('A backup has an identifier');
    const ephemeral = generateKeyPairSync('x25519');
    const shared = diffieHellman({ privateKey: ephemeral.privateKey, publicKey: publicKey.keyObject });
    const ephemeralPoint = pointOf(ephemeral.publicKey);
    return new BackupSealer(
      contentKeyOf(shared, ephemeralPoint, publicKey.point),
      ephemeralPoint,
      versionBytesOf(publicKey.point),
    );
  }

  /** A stream that seals what passes through it as the object `name` of the backup store. */
  sealStream(name: string): Transform {
    const nonce = randomBytes(NONCE_BYTES);
    const header = headerOf(this.#versionBytes, this.#ephemeralPoint, nonce);
    const cipher = createCipheriv('aes-256-gcm', this.#contentKey, nonce);
    cipher.setAAD(associatedDataOf(header, name));
    const stream = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        done(null, cipher.update(chunk));
      },
      flush(done) {
        const last = cipher.final();
        done(null, Buffer.concat([last, cipher.getAuthTag()]));
      },
    });
    stream.push(header);
    return stream;
  }

  /** Seals a whole value, such as the manifest. */
  seal(name: string, plaintext: Buffer): Buffer {
    const nonce = randomBytes(NONCE_BYTES);
    const header = headerOf(this.#versionBytes, this.#ephemeralPoint, nonce);
    const cipher = createCipheriv('aes-256-gcm', this.#contentKey, nonce);
    cipher.setAAD(associatedDataOf(header, name));
    return Buffer.concat([header, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  }

  /**
   * Checks an object read back from the backup store: it was sealed by this backup and decrypts whole under its
   * content key (3.2 step 7). Reads it as a stream and keeps nothing it decrypts.
   */
  async check(name: string, object: Readable): Promise<SealCheck> {
    const found = { foreign: false };
    let plaintextBytes = 0;
    const opening = gcmOpening(
      (header) => {
        const parsed = parseHeader(header);
        if (!parsed.ephemeralPoint.equals(this.#ephemeralPoint) || !parsed.versionBytes.equals(this.#versionBytes)) {
          found.foreign = true;
          throw new Error('not sealed by this backup');
        }
        const decipher = createDecipheriv('aes-256-gcm', this.#contentKey, parsed.nonce);
        decipher.setAAD(associatedDataOf(header, name));
        return decipher;
      },
      () => new Error('does not decrypt'),
    );
    const counting = new Writable({
      write(chunk: Buffer, _encoding, done) {
        plaintextBytes += chunk.length;
        done();
      },
    });
    try {
      await pipeline(object, opening, counting);
      return { ok: true, plaintextBytes };
    } catch {
      return { ok: false, reason: found.foreign ? 'not sealed by this backup' : 'does not decrypt' };
    }
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

function parseHeader(header: Buffer): { versionBytes: Buffer; ephemeralPoint: Buffer; nonce: Buffer } {
  if (header.length < HEADER_BYTES || !header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Not a sealed backup object');
  }
  if (header[MAGIC.length] !== FORMAT) throw new Error('A sealed backup object of a format this code does not read');
  let at = MAGIC.length + 1;
  const versionBytes = header.subarray(at, (at += VERSION_BYTES));
  const ephemeralPoint = header.subarray(at, (at += POINT_BYTES));
  const nonce = header.subarray(at, at + NONCE_BYTES);
  return { versionBytes, ephemeralPoint, nonce };
}

/**
 * The backup key's private part, as the custodian hands it to the restore command at the prompt (2.3, 2.4): base64 of
 * its PKCS #8 DER form, or its PEM text. It is never an environment secret. Never prints a key.
 */
export class BackupPrivateKey {
  readonly #key: KeyObject;
  readonly #point: Buffer;
  readonly version: string;

  private constructor(key: KeyObject) {
    this.#key = key;
    this.#point = pointOf(createPublicKey(key));
    this.version = versionBytesOf(this.#point).toString('hex');
  }

  /** Reads the private part, or throws saying what is wrong, never echoing it. */
  static fromText(text: string): BackupPrivateKey {
    const trimmed = text.trim();
    let key: KeyObject;
    try {
      key = trimmed.startsWith('-----')
        ? createPrivateKey({ key: trimmed, format: 'pem' })
        : createPrivateKey({ key: Buffer.from(trimmed, 'base64'), format: 'der', type: 'pkcs8' });
    } catch {
      throw new Error('The backup key given is not the private part of an X25519 key pair');
    }
    if (key.asymmetricKeyType !== 'x25519') {
      throw new Error('The backup key given is not the private part of an X25519 key pair');
    }
    return new BackupPrivateKey(key);
  }

  /** The identifier of the backup key version that sealed an object, read from its header. */
  static versionOf(object: Buffer): string {
    return parseHeader(object.subarray(0, HEADER_BYTES)).versionBytes.toString('hex');
  }

  /** Opens a whole sealed object stored under `name`. Throws when it was changed, renamed or sealed for another key. */
  open(name: string, object: Buffer): Buffer {
    if (object.length < HEADER_BYTES + TAG_BYTES) throw new Error('The sealed object is incomplete');
    const decipher = this.decipherFor(name, object.subarray(0, HEADER_BYTES));
    decipher.setAuthTag(object.subarray(object.length - TAG_BYTES));
    return Buffer.concat([decipher.update(object.subarray(HEADER_BYTES, object.length - TAG_BYTES)), decipher.final()]);
  }

  /**
   * A stream that opens a sealed object stored under `name` as it passes through, such as a dump on its way to
   * PostgreSQL's restore tool (backup-and-restore 4.2 step 2). It fails at its end when the object was changed, renamed
   * or sealed for another key. Plaintext leaves it before the tag is checked; the restore makes that safe (restore.ts,
   * `loadFrom`): every dump's SHA-256 is compared with the signed manifest's before any is opened, and the restore tool
   * loads in one transaction that rolls back when this stream fails, so no unchecked byte is ever committed.
   */
  openStream(name: string): Transform {
    return gcmOpening(
      (header) => this.decipherFor(name, header),
      () => new Error('The sealed object does not open with the backup key given'),
    );
  }

  private decipherFor(name: string, header: Buffer): DecipherGCM {
    const found = parseHeader(header);
    if (found.versionBytes.toString('hex') !== this.version) {
      throw new Error('The object was sealed under another backup key version');
    }
    const shared = diffieHellman({
      privateKey: this.#key,
      publicKey: createPublicKey({
        key: { kty: 'OKP', crv: 'X25519', x: found.ephemeralPoint.toString('base64url') },
        format: 'jwk',
      }),
    });
    const decipher = createDecipheriv(
      'aes-256-gcm',
      contentKeyOf(shared, found.ephemeralPoint, this.#point),
      found.nonce,
    );
    decipher.setAAD(associatedDataOf(header, name));
    return decipher;
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
