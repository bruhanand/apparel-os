import { generateKeyPairSync } from 'node:crypto';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import {
  BACKUP_PUBLIC_KEY_VARIABLE,
  BackupPrivateKey,
  backupPublicKeyFromEnvironment,
  BackupSealer,
} from './backup-cipher.js';

// S1-F14-T02: the backup key is a key pair; the environment holds only its public part (backup-and-restore 2.3,
// GC9-17; POL-18.02, PRD-SEC-006). Every key here is SYNTHETIC, made for the test.
function syntheticPair(): { publicText: string; privateText: string } {
  const pair = generateKeyPairSync('x25519');
  return {
    publicText: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateText: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  };
}

const PLAINTEXT = Buffer.from("SYNTHETIC dump: insert into syn_table values (42, 'syn-bank-account');", 'utf8');

async function sealed(sealer: BackupSealer, name: string, plain: Buffer): Promise<Buffer> {
  return buffer(Readable.from([plain]).pipe(sealer.sealStream(name)));
}

describe('the backup key (backup-and-restore 2.3, 2.4)', () => {
  it('POL-18.02 encrypts with the public part; only the private part opens it, for that object name only', async () => {
    const pair = syntheticPair();
    const publicKey = backupPublicKeyFromEnvironment({ [BACKUP_PUBLIC_KEY_VARIABLE]: pair.publicText });
    const sealer = BackupSealer.start(publicKey, 'syn-backup-1');
    const bytes = await sealed(sealer, 'syn-backup-1/org.dump', PLAINTEXT);
    expect(bytes.includes(Buffer.from('syn-bank-account'))).toBe(false);

    const privateKey = BackupPrivateKey.fromText(pair.privateText);
    expect(privateKey.open('syn-backup-1/org.dump', bytes)).toEqual(PLAINTEXT);
    expect(() => privateKey.open('syn-backup-1/other.dump', bytes)).toThrow();
    expect(() => BackupPrivateKey.fromText(syntheticPair().privateText).open('syn-backup-1/org.dump', bytes)).toThrow();
  });

  it('refuses an object that was changed', async () => {
    const pair = syntheticPair();
    const sealer = BackupSealer.start(
      backupPublicKeyFromEnvironment({ [BACKUP_PUBLIC_KEY_VARIABLE]: pair.publicText }),
      'syn-backup-2',
    );
    const bytes = await sealed(sealer, 'n', PLAINTEXT);
    const changed = Buffer.from(bytes);
    changed[changed.length - 20] = (changed[changed.length - 20] ?? 0) ^ 1;
    expect(() => BackupPrivateKey.fromText(pair.privateText).open('n', changed)).toThrow();
  });

  it('the backup command checks what it wrote with the content key it holds in memory, never the private part', async () => {
    const pair = syntheticPair();
    const sealer = BackupSealer.start(
      backupPublicKeyFromEnvironment({ [BACKUP_PUBLIC_KEY_VARIABLE]: pair.publicText }),
      'syn-backup-3',
    );
    const bytes = await sealed(sealer, 'n', PLAINTEXT);
    expect(await sealer.check('n', Readable.from([bytes]))).toEqual({ ok: true, plaintextBytes: PLAINTEXT.length });
    const changed = Buffer.from(bytes);
    changed[changed.length - 1] = (changed[changed.length - 1] ?? 0) ^ 1;
    expect((await sealer.check('n', Readable.from([changed]))).ok).toBe(false);
  });

  it('POL-18.02 names the key version by an identifier that the private part gives too, and never by the key', async () => {
    const pair = syntheticPair();
    const publicKey = backupPublicKeyFromEnvironment({ [BACKUP_PUBLIC_KEY_VARIABLE]: pair.publicText });
    expect(publicKey.version).toMatch(/^[0-9a-f]{32}$/);
    expect(BackupPrivateKey.fromText(pair.privateText).version).toBe(publicKey.version);
    expect(
      backupPublicKeyFromEnvironment({ [BACKUP_PUBLIC_KEY_VARIABLE]: syntheticPair().publicText }).version,
    ).not.toBe(publicKey.version);
    const sealer = BackupSealer.start(publicKey, 'syn-backup-4');
    const bytes = await sealed(sealer, 'n', PLAINTEXT);
    expect(bytes.includes(Buffer.from(pair.publicText, 'base64'))).toBe(false);
    expect(BackupPrivateKey.versionOf(bytes)).toBe(publicKey.version);
  });

  it('PRD-SEC-014 refuses a missing or wrong public key naming the variable, never a value, and prints no key', () => {
    expect(() => backupPublicKeyFromEnvironment({})).toThrow(`${BACKUP_PUBLIC_KEY_VARIABLE} is not set`);
    const pair = syntheticPair();
    for (const wrong of [
      'not-a-key',
      pair.privateText,
      generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    ]) {
      let message = '';
      try {
        backupPublicKeyFromEnvironment({ [BACKUP_PUBLIC_KEY_VARIABLE]: wrong });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain(BACKUP_PUBLIC_KEY_VARIABLE);
      expect(message).not.toContain(wrong);
    }
    const privateKey = BackupPrivateKey.fromText(pair.privateText);
    for (const shown of [JSON.stringify({ privateKey }), String(privateKey)]) {
      expect(shown).not.toContain(pair.privateText);
    }
  });
});
