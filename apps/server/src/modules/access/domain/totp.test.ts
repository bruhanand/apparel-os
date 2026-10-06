import { describe, expect, it } from 'vitest';
import { base32, matchingStep, otpauthUri, timeStep, totpCode } from './totp.js';

// S1-F01-T08: the authenticator code (PRD-SEC-001, POL-02.17; access-and-approvals 3.1, 3.2). The expected codes are
// the published test vectors of RFC 6238, appendix B (SHA-1, secret "12345678901234567890"), read at six digits.
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('the authenticator code (RFC 6238)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ])('at %i seconds gives %s', (seconds, code) => {
    expect(totpCode(RFC_SECRET, timeStep(new Date(seconds * 1000)))).toBe(code);
  });

  it('accepts the code of this step and of the step either side, for a clock a little off', () => {
    const at = new Date(1111111111 * 1000);
    const step = timeStep(at);
    for (const used of [step - 1, step, step + 1]) {
      expect(matchingStep(RFC_SECRET, totpCode(RFC_SECRET, used), at, undefined)).toBe(used);
    }
    expect(matchingStep(RFC_SECRET, totpCode(RFC_SECRET, step + 2), at, undefined)).toBeUndefined();
    expect(matchingStep(RFC_SECRET, totpCode(RFC_SECRET, step - 2), at, undefined)).toBeUndefined();
  });

  it('PRD-SEC-001 never accepts a code of a step already used, or of an earlier one', () => {
    const at = new Date(1111111111 * 1000);
    const step = timeStep(at);
    expect(matchingStep(RFC_SECRET, totpCode(RFC_SECRET, step), at, step)).toBeUndefined();
    expect(matchingStep(RFC_SECRET, totpCode(RFC_SECRET, step - 1), at, step - 1)).toBeUndefined();
    expect(matchingStep(RFC_SECRET, totpCode(RFC_SECRET, step + 1), at, step)).toBe(step + 1);
  });

  it('refuses a code of the wrong length or with other characters', () => {
    const at = new Date(59 * 1000);
    expect(matchingStep(RFC_SECRET, '28708', at, undefined)).toBeUndefined();
    expect(matchingStep(RFC_SECRET, '2870820', at, undefined)).toBeUndefined();
    expect(matchingStep(RFC_SECRET, '', at, undefined)).toBeUndefined();
  });

  it('writes the secret in base32 without padding, as authenticator apps read it (RFC 4648)', () => {
    expect(base32(Buffer.from('foobar', 'ascii'))).toBe('MZXW6YTBOI');
    expect(base32(RFC_SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('makes the otpauth address an app scans, naming the Organisation and the login, never the password', () => {
    expect(
      otpauthUri({ issuer: 'Apparel OS', organisationCode: 'SYN-ORG-A', login: 'syn.admin', secret: RFC_SECRET }),
    ).toBe(
      'otpauth://totp/Apparel%20OS%3ASYN-ORG-A%3Asyn.admin?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Apparel%20OS&algorithm=SHA1&digits=6&period=30',
    );
  });
});
