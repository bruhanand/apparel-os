import { createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ORGANISATION_KEYS_VARIABLE, OrganisationKeys } from './organisation-keys.js';

// S1-F01-T08: the key per Organisation, held outside the database (access-and-approvals 6; PRD-SEC-006, POL-18.02).
// Every key and code here is synthetic, made for the test.
const CODE_A = 'SYN-ORG-A';
const CODE_B = 'SYN-ORG-B';
const keyA = randomBytes(32).toString('base64url');
const keyB = randomBytes(32).toString('base64url');
const keys = (): OrganisationKeys =>
  OrganisationKeys.fromEnvironment({
    [ORGANISATION_KEYS_VARIABLE]: JSON.stringify({ [CODE_A]: keyA, [CODE_B]: keyB }),
  });

describe('the Organisation keys (access-and-approvals 6)', () => {
  it('PRD-SEC-006 encrypts a value so that only the same Organisation, purpose and context read it back', () => {
    const value = keys().encrypt(CODE_A, 'authenticator-secret', Buffer.from('synthetic secret'), 'user-1');
    expect(value.scheme).toBe('aes-256-gcm/hkdf-sha256/1');
    expect(value.ciphertext).not.toContain('synthetic');
    expect(keys().decrypt(CODE_A, 'authenticator-secret', value, 'user-1').toString()).toBe('synthetic secret');
    expect(() => keys().decrypt(CODE_B, 'authenticator-secret', value, 'user-1')).toThrow();
    expect(() => keys().decrypt(CODE_A, 'restricted-value', value, 'user-1')).toThrow();
    expect(() => keys().decrypt(CODE_A, 'authenticator-secret', value, 'user-2')).toThrow();
  });

  it('never gives the same ciphertext twice for one value', () => {
    const one = keys().encrypt(CODE_A, 'restricted-value', Buffer.from('x'), 'salary');
    const two = keys().encrypt(CODE_A, 'restricted-value', Buffer.from('x'), 'salary');
    expect(one.ciphertext).not.toBe(two.ciphertext);
  });

  it('PRD-SEC-014 digests a typed login under the Organisation key, the same each time and different per Organisation', () => {
    const one = keys().digest(CODE_A, 'sign-in-throttling', 'syn.user');
    expect(one).toMatch(/^[0-9a-f]{64}$/);
    expect(keys().digest(CODE_A, 'sign-in-throttling', 'syn.user')).toBe(one);
    expect(keys().digest(CODE_B, 'sign-in-throttling', 'syn.user')).not.toBe(one);
  });

  it('refuses an Organisation with no key, naming no key', () => {
    expect(() => keys().digest('SYN-ORG-UNKEYED', 'sign-in-throttling', 'x')).toThrow(/no key is configured/);
  });

  it('PRD-SEC-014 refuses to start without the variable, or with a key that is not 32 bytes, never echoing a value', () => {
    expect(() => OrganisationKeys.fromEnvironment({})).toThrow(`${ORGANISATION_KEYS_VARIABLE} is not set`);
    for (const value of ['not json', '[]', JSON.stringify({ [CODE_A]: 'c2hvcnQ' }), JSON.stringify({ [CODE_A]: 7 })]) {
      let message = '';
      try {
        OrganisationKeys.fromEnvironment({ [ORGANISATION_KEYS_VARIABLE]: value });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain(ORGANISATION_KEYS_VARIABLE);
      expect(message).not.toContain('c2hvcnQ');
      expect(message).not.toContain('not json');
    }
  });

  it('prints no key when logged or turned into JSON', () => {
    const made = keys();
    expect(JSON.stringify(made)).not.toContain(keyA);
    expect(String(made)).not.toContain(keyA);
  });

  it('POL-18.02 names each key version by an identifier that reveals no key, and records it with every value it seals', () => {
    const version = keys().version(CODE_A);
    expect(version).toMatch(/^[0-9a-f]{32}$/);
    expect(keys().version(CODE_A)).toBe(version);
    expect(keys().version(CODE_B)).not.toBe(version);
    expect(version).not.toContain(Buffer.from(keyA, 'base64url').toString('hex').slice(0, 32));
    expect(keys().encrypt(CODE_A, 'bank-details', Buffer.from('x'), 'v').keyVersion).toBe(version);
    expect(keys().versions()).toEqual(
      new Map([
        [CODE_A, version],
        [CODE_B, keys().version(CODE_B)],
      ]),
    );
  });

  it('backup-and-restore 2.4 takes the identifier from a subkey of its own, never the raw key (domain separation)', () => {
    const raw = Buffer.from(keyA, 'base64url');
    const underRaw = createHmac('sha256', raw).update('apparel-os/key-version', 'utf8').digest().subarray(0, 16);
    expect(keys().version(CODE_A)).not.toBe(underRaw.toString('hex'));
    const subkey = Buffer.from(hkdfSync('sha256', raw, Buffer.alloc(0), 'apparel-os/key-version-identifier', 32));
    const underSubkey = createHmac('sha256', subkey).update('apparel-os/key-version', 'utf8').digest().subarray(0, 16);
    expect(keys().version(CODE_A)).toBe(underSubkey.toString('hex'));
  });

  it('backup-and-restore 2.4 opens each value with the kept copy of the version it names, several versions kept', () => {
    const older = randomBytes(32).toString('base64url');
    const olderKeys = OrganisationKeys.fromEnvironment({
      [ORGANISATION_KEYS_VARIABLE]: JSON.stringify({ [CODE_A]: older }),
    });
    const sealedOld = olderKeys.encrypt(CODE_A, 'stored-file', Buffer.from('syn-old'), 'ctx');
    const sealedNew = keys().encrypt(CODE_A, 'stored-file', Buffer.from('syn-new'), 'ctx');
    const kept = OrganisationKeys.fromKeptCopies(JSON.stringify({ [CODE_A]: [keyA, older], [CODE_B]: keyB }));
    expect(kept.heldVersions().get(CODE_A)).toEqual(new Set([keys().version(CODE_A), olderKeys.version(CODE_A)]));
    expect(kept.decrypt(CODE_A, 'stored-file', sealedOld, 'ctx').toString()).toBe('syn-old');
    expect(kept.decrypt(CODE_A, 'stored-file', sealedNew, 'ctx').toString()).toBe('syn-new');
    // A value written before key versions were recorded names none: whichever kept version opens it does.
    const unnamed = { scheme: sealedOld.scheme, ciphertext: sealedOld.ciphertext };
    expect(kept.decrypt(CODE_A, 'stored-file', unnamed, 'ctx').toString()).toBe('syn-old');
    // A version not kept does not open.
    const onlyNew = OrganisationKeys.fromKeptCopies(JSON.stringify({ [CODE_A]: keyA }));
    expect(() => onlyNew.decrypt(CODE_A, 'stored-file', sealedOld, 'ctx')).toThrow(/not held/);
    expect(() => OrganisationKeys.fromKeptCopies('{"SYN": ["short"]}')).toThrow(/kept copies/);
    expect(() => OrganisationKeys.fromKeptCopies(`{"SYN": ["${older}"]`)).not.toThrow(new RegExp(older));
  });
});
