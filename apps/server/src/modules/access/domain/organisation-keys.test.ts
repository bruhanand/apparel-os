import { randomBytes } from 'node:crypto';
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
});
