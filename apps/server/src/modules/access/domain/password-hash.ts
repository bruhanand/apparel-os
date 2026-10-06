import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { Secret } from '@apparel-os/schemas';

// Password and credential hashes (PRD Stack: Authentication; access-and-approvals 2.3, 3.2, 13.1): Argon2id only.
// The parameters are OWASP's first recommended set for Argon2id (19 MiB of memory, two passes, one lane), a technical
// choice, not a business value; each hash records its own parameters, so they can be raised later without breaking
// the hashes already kept.

/** The library's Algorithm.Argon2id, a const enum isolated modules cannot read. */
const ARGON2ID = 2;

const PARAMETERS = { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** The Argon2id hash of a secret. The plaintext is revealed only here (PRD-SEC-014). */
export function hashPassword(secret: Secret): Promise<string> {
  return hash(secret.reveal(), PARAMETERS);
}

/** Whether a secret verifies against an Argon2id hash. */
export async function verifyPassword(passwordHash: string, secret: Secret): Promise<boolean> {
  try {
    return await verify(passwordHash, secret.reveal());
  } catch {
    // A hash this library cannot read verifies nothing.
    return false;
  }
}

/**
 * A hash of a random value no one knows, verified when a login matches no user or the user cannot sign in, so that
 * every refused attempt costs one Argon2 check and takes about as long (access-and-approvals 3.1; DEC-116).
 */
export function unknowableHash(): Promise<string> {
  return hash(randomBytes(32).toString('base64url'), PARAMETERS);
}
