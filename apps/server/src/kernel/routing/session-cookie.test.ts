import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeSessionCookieValue, encodeSessionCookieValue, MIN_SESSION_IDENTIFIER_LENGTH } from './session-cookie.js';

// S1-F01-T02: the session cookie's value carries the Organisation code and the session identifier, so that each later
// request finds its Organisation from the code (access-and-approvals 3.3; DEC-093). Synthetic values only.

const identifier = (): string => randomBytes(32).toString('base64url');
const code = (text: string): string => Buffer.from(text, 'utf8').toString('base64url');

// 'SYN-A' is 5 bytes, 7 base64url characters with 2 bits to spare. Setting a spare bit gives the same bytes back
// from a part that is not their canonical encoding.
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function nonCanonicalCode(): string {
  const canonical = code('SYN-A');
  const last = BASE64URL_ALPHABET.indexOf(canonical.slice(-1));
  return `${canonical.slice(0, -1)}${BASE64URL_ALPHABET.charAt(last ^ 1)}`;
}

describe('the session cookie value (access-and-approvals 3.3)', () => {
  it('PRD-ACS-020 carries the Organisation code and the identifier, and reads both back', () => {
    const sessionIdentifier = identifier();
    const value = encodeSessionCookieValue({ organisationCode: 'SYN-ORG-A', sessionIdentifier });
    expect(decodeSessionCookieValue(value)).toEqual({ organisationCode: 'SYN-ORG-A', sessionIdentifier });
  });

  it('keeps the two parts apart, whatever the code holds', () => {
    for (const organisationCode of ['SYN.ORG.A', 'SYN ORG A', 'SYN-ÖRG-Ä', `SYN-${'.'.repeat(5)}`]) {
      const sessionIdentifier = identifier();
      const value = encodeSessionCookieValue({ organisationCode, sessionIdentifier });
      expect(value.split('.')).toHaveLength(2);
      expect(decodeSessionCookieValue(value)).toEqual({ organisationCode, sessionIdentifier });
    }
  });

  it('needs an identifier of at least 256 bits, which 32 random bytes give', () => {
    expect(identifier()).toHaveLength(MIN_SESSION_IDENTIFIER_LENGTH);
    expect(() =>
      encodeSessionCookieValue({ organisationCode: 'SYN-ORG-A', sessionIdentifier: identifier().slice(1) }),
    ).toThrow(/at least 43/);
    expect(() =>
      encodeSessionCookieValue({ organisationCode: 'SYN-ORG-A', sessionIdentifier: `${identifier()}=` }),
    ).toThrow();
    expect(() => encodeSessionCookieValue({ organisationCode: '', sessionIdentifier: identifier() })).toThrow(
      /needs an Organisation code/,
    );
  });

  it.each([
    ['an empty value', () => ''],
    ['no dot', () => `${code('SYN-ORG-A')}${identifier()}`],
    ['two dots', () => `${code('SYN-ORG-A')}.${identifier()}.${identifier()}`],
    ['an empty code', () => `.${identifier()}`],
    ['a short identifier', () => `${code('SYN-ORG-A')}.${identifier().slice(1)}`],
    ['padding', () => `${code('SYN-ORG-A')}=.${identifier()}`],
    ['standard base64 characters', () => `${code('SYN-ORG-A')}.${identifier().slice(0, 42)}+`],
    ['a code that is not canonical base64url', () => `${nonCanonicalCode()}.${identifier()}`],
    ['a code that is not UTF-8', () => `${Buffer.from([0xff, 0xfe]).toString('base64url')}.${identifier()}`],
  ])('reads nothing from %s', (_, value) => {
    expect(decodeSessionCookieValue(value())).toBeUndefined();
  });
});
