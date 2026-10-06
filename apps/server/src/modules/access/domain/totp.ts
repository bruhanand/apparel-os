import { createHmac, timingSafeEqual } from 'node:crypto';

// The authenticator code (PRD-SEC-001, POL-02.17; access-and-approvals 3.1, 3.2): TOTP of RFC 6238 with the
// parameters every authenticator app reads by default: HMAC-SHA-1, six digits, a 30-second step. They are the
// standard's, not a business value. A code of the step either side is accepted, for a phone clock a little off, and
// a code is never accepted for a step already used, so a code seen once cannot be replayed.

/** Six digits, a 30-second step, HMAC-SHA-1 (RFC 6238 section 4; RFC 4226 section 5.3). */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** The steps either side of now whose code is accepted (RFC 6238 section 5.2). */
const DRIFT_STEPS = 1;
/** The size of a new authenticator secret: 160 bits, the length of an HMAC-SHA-1 key (RFC 4226 section 4). */
export const TOTP_SECRET_BYTES = 20;

/** The time step of an instant (RFC 6238 section 4.2). */
export function timeStep(at: Date): number {
  return Math.floor(at.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code of a step (RFC 4226 section 5.3, with the step as the counter). */
export function totpCode(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', secret).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/**
 * The step whose code the person gave, or undefined: one of now and the step either side, and later than the last
 * step accepted for this secret, so no code is accepted twice. Compared in constant time.
 */
export function matchingStep(
  secret: Buffer,
  code: string,
  at: Date,
  lastUsedStep: number | undefined,
): number | undefined {
  if (code.length !== TOTP_DIGITS || !/^[0-9]+$/.test(code)) return undefined;
  const given = Buffer.from(code, 'ascii');
  const now = timeStep(at);
  let found: number | undefined;
  for (let step = now - DRIFT_STEPS; step <= now + DRIFT_STEPS; step += 1) {
    const expected = Buffer.from(totpCode(secret, step), 'ascii');
    // Every candidate is compared, so the time taken does not say which step matched.
    if (timingSafeEqual(expected, given) && found === undefined) found = step;
  }
  if (found === undefined || (lastUsedStep !== undefined && found <= lastUsedStep)) return undefined;
  return found;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 of RFC 4648 section 6, without padding, as authenticator apps read a secret. */
export function base32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31] ?? '';
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31] ?? '';
  return output;
}

/**
 * The otpauth address an authenticator app scans (the Key Uri Format of authenticator apps). Its label names the
 * Organisation and the login, so a person with users in two Organisations tells them apart (PRD-ACS-020).
 */
export function otpauthUri(parts: {
  readonly issuer: string;
  readonly organisationCode: string;
  readonly login: string;
  readonly secret: Buffer;
}): string {
  const label = encodeURIComponent(`${parts.issuer}:${parts.organisationCode}:${parts.login}`);
  const query = [
    `secret=${base32(parts.secret)}`,
    `issuer=${encodeURIComponent(parts.issuer)}`,
    'algorithm=SHA1',
    `digits=${String(TOTP_DIGITS)}`,
    `period=${String(TOTP_PERIOD_SECONDS)}`,
  ].join('&');
  return `otpauth://totp/${label}?${query}`;
}
