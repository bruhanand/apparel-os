import { encodeSessionCookieValue } from '../../../kernel/index.js';

// The session cookie (access-and-approvals 3.3; deployment.md section 3): one host-only cookie of one name, holding
// the Organisation code and the session's random identifier. Its attributes are deployment.md's: Secure, HttpOnly,
// SameSite=Lax, no Domain, path `/`. The `__Host-` prefix makes the browser refuse it unless it is Secure, host-only
// and on path `/`, so no other host of the same site can set or read it. It has no expiry of its own: the session's
// limits are the server's (access-and-approvals 3.3).

export const SESSION_COOKIE_NAME = '__Host-aos-session';

/** The `Set-Cookie` value for a new session. Never logged: it holds the identifier (PRD-SEC-014). */
export function sessionCookieHeader(organisationCode: string, sessionIdentifier: string): string {
  const value = encodeSessionCookieValue({ organisationCode, sessionIdentifier });
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

/**
 * The session cookie's value from a request's `Cookie` header, or undefined. The value is checked by the kernel's
 * decoder, which refuses anything it did not make.
 */
export function sessionCookieOf(cookieHeader: string | undefined): string | undefined {
  if (cookieHeader === undefined) return undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === SESSION_COOKIE_NAME) return part.slice(separator + 1).trim();
  }
  return undefined;
}

/** The `Set-Cookie` value that removes the session cookie from the browser, at sign-out (access-and-approvals 3.3). */
export function clearedSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}
