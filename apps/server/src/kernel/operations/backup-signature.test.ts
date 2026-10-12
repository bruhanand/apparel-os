import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  BACKUP_SIGNING_KEY_VARIABLE,
  BACKUP_SIGNING_PUBLIC_KEY_VARIABLE,
  BackupSigningKey,
  BackupVerifyKey,
} from './backup-signature.js';

// The signature of a backup (backup-and-restore 2.3, 4.2 step 1; product owner, 12 Oct 2026; POL-18.02, PRD-SEC-014).
// Every key here is SYNTHETIC, made for the test.
function syntheticPair(): { signing: BackupSigningKey; verify: BackupVerifyKey; privateText: string } {
  const pair = generateKeyPairSync('ed25519');
  const privateText = pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  return {
    signing: BackupSigningKey.fromEnvironment({ [BACKUP_SIGNING_KEY_VARIABLE]: privateText }),
    verify: BackupVerifyKey.fromEnvironment({
      [BACKUP_SIGNING_PUBLIC_KEY_VARIABLE]: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    }),
    privateText,
  };
}

const statement = {
  backupId: 'syn-backup-1',
  manifestObject: 'backups/syn-backup-1/manifest',
  manifestSha256: 'a'.repeat(64),
  result: 'complete' as const,
  failures: [],
};

describe('the backup signature', () => {
  it('POL-18.02 verifies a statement signed by the signing key, naming its version, and only for its backup', () => {
    const { signing, verify } = syntheticPair();
    expect(signing.version).toBe(verify.version);
    const stored = signing.sign(statement);
    expect(verify.verify(stored, 'syn-backup-1')).toMatchObject({ ...statement, signingKeyVersion: signing.version });
    expect(() => verify.verify(stored, 'syn-backup-2')).toThrow(/another backup/);
  });

  it('refuses a statement changed after signing, or signed by another key', () => {
    const { signing, verify } = syntheticPair();
    const stored = JSON.parse(signing.sign(statement).toString('utf8')) as { statement: string; signature: string };
    const changed = Buffer.from(
      JSON.stringify({
        ...stored,
        statement: Buffer.from(
          Buffer.from(stored.statement, 'base64').toString('utf8').replace('complete', 'failed!!'),
        ).toString('base64'),
      }),
    );
    expect(() => verify.verify(changed, 'syn-backup-1')).toThrow(/does not verify/);
    expect(() => verify.verify(syntheticPair().signing.sign(statement), 'syn-backup-1')).toThrow(/does not verify/);
    expect(() => verify.verify(Buffer.from('not json'), 'syn-backup-1')).toThrow(/form/);
  });

  it('PRD-SEC-014 refuses a missing or wrong key naming the variable, never a value, and prints no key', () => {
    const { signing, privateText } = syntheticPair();
    expect(() => BackupSigningKey.fromEnvironment({})).toThrow(`${BACKUP_SIGNING_KEY_VARIABLE} is not set`);
    const x25519 = generateKeyPairSync('x25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
    try {
      BackupSigningKey.fromEnvironment({ [BACKUP_SIGNING_KEY_VARIABLE]: x25519 });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('not an Ed25519 private key');
      expect((error as Error).message).not.toContain(x25519);
    }
    expect(JSON.stringify(signing)).not.toContain(privateText);
    expect(String(signing)).not.toContain(privateText);
  });
});
