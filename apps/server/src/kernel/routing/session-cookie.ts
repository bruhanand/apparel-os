// The value of the session cookie (access-and-approvals 3.3; deployment.md section 3). It carries the Organisation
// code and the session's random identifier, encoded so that neither can be mistaken for the other: the code as
// base64url of its UTF-8 bytes, a dot, then the identifier, itself base64url. Neither base64url part can hold a dot.
// The code is no secret: the person typed it, and it is the one routing fact the directory holds. The identifier is
// a secret: the database keeps only its hash, and it is never logged (PRD-SEC-014). Sessions, and so the identifier
// itself, are made by sign-in (S1-F01-T08); the cookie's name and attributes are set with them.

/** Base64url without padding (RFC 4648 section 5). */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * At least 256 bits from a cryptographically secure generator (access-and-approvals 3.3): 32 bytes are 43 base64url
 * characters without padding.
 */
export const MIN_SESSION_IDENTIFIER_LENGTH = 43;

export interface SessionCookieParts {
  readonly organisationCode: string;
  readonly sessionIdentifier: string;
}

/** The cookie value for a session. Refuses an empty code or an identifier that is not long enough base64url. */
export function encodeSessionCookieValue(parts: SessionCookieParts): string {
  if (parts.organisationCode === '') throw new Error('A session cookie needs an Organisation code');
  if (!isSessionIdentifier(parts.sessionIdentifier)) {
    throw new Error(
      `A session identifier is base64url of at least ${String(MIN_SESSION_IDENTIFIER_LENGTH)} characters`,
    );
  }
  return `${Buffer.from(parts.organisationCode, 'utf8').toString('base64url')}.${parts.sessionIdentifier}`;
}

/**
 * Reads a cookie value back into its code and identifier, or undefined when it is not exactly what
 * encodeSessionCookieValue makes: two base64url parts, a code part that is the canonical encoding of a non-empty
 * UTF-8 code, and an identifier long enough.
 */
export function decodeSessionCookieValue(value: string): SessionCookieParts | undefined {
  const parts = value.split('.');
  if (parts.length !== 2) return undefined;
  const [encodedCode, sessionIdentifier] = parts as [string, string];
  if (!BASE64URL.test(encodedCode) || !isSessionIdentifier(sessionIdentifier)) return undefined;
  const organisationCode = Buffer.from(encodedCode, 'base64url').toString('utf8');
  // A part that is not canonical base64url, or not valid UTF-8, does not encode back to itself.
  if (organisationCode === '' || Buffer.from(organisationCode, 'utf8').toString('base64url') !== encodedCode) {
    return undefined;
  }
  return { organisationCode, sessionIdentifier };
}

function isSessionIdentifier(value: string): boolean {
  return value.length >= MIN_SESSION_IDENTIFIER_LENGTH && BASE64URL.test(value);
}
