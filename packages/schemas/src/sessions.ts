import { z } from 'zod';
import { idSchema, totpCodeSchema } from './common.js';
import { secretString } from './secret.js';

// Sessions, their revocation and the reset of another user's credential (access-and-approvals 3.2, 3.3; PRD-SEC-001,
// PRD-SEC-008, PRD-ACS-017; S1-F01-T09). Nothing here is sent by message (DEC-099).

/**
 * Unlocking a locked session: the same user's password, nothing else (access-and-approvals 3.3). It proves the
 * person is there, as an authenticator code does, so a replay is never compared on it (code-house-rules 12.5). A
 * wrong password gets the one sign-in refusal, and failures are throttled like sign-in's (3.1).
 */
export const unlockRequestSchema = z.strictObject({
  password: secretString(),
});

export const unlockResponseSchema = z.strictObject({
  outcome: z.literal('unlocked'),
});

/** Signing out ends the session the request came with (access-and-approvals 3.2, 3.3). */
export const signOutRequestSchema = z.strictObject({});

export const signOutResponseSchema = z.strictObject({
  outcome: z.literal('signed-out'),
});

/**
 * Which sessions to revoke (access-and-approvals 3.3): one, by its identifier, or every session of the user. A
 * revoked session is refused at its next request (PRD-SEC-008); revoking bars no new sign-in (4.3).
 */
export const sessionRevocationRequestSchema = z.strictObject({
  sessionId: idSchema.optional(),
});

/** The sessions revoked, by identifier: none when there was nothing in force to revoke. */
export const sessionRevocationResponseSchema = z.strictObject({
  revokedSessionIds: z.array(idSchema),
});

/** What a credential reset replaces (access-and-approvals 3.2): the password, the authenticator, or both. */
export const credentialResetKindSchema = z.enum(['password', 'authenticator', 'both']);
export type CredentialResetKind = z.infer<typeof credentialResetKindSchema>;

/**
 * Resetting another user's credential (access-and-approvals 3.2; GC3-4, DEC-105): a protected action, so the person
 * resetting gives a fresh authenticator code (3.3, GC3-6); nobody resets their own. A reset of the password sets a
 * temporary password, checked against the password rules and handed over in person (DEC-099); the user replaces it,
 * or enrols again after an authenticator reset, at the next sign-in. Every session of the user is revoked
 * (PRD-SEC-008).
 */
export const credentialResetRequestSchema = z
  .strictObject({
    reset: credentialResetKindSchema,
    temporaryPassword: secretString().optional(),
    totpCode: totpCodeSchema,
  })
  .superRefine((value, context) => {
    const needsPassword = value.reset !== 'authenticator';
    if (needsPassword !== (value.temporaryPassword !== undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['temporaryPassword'],
        message: needsPassword ? 'a password reset sets a temporary password' : 'only a password reset sets one',
      });
    }
  });
export type CredentialResetRequestInput = z.input<typeof credentialResetRequestSchema>;

export const credentialResetResponseSchema = z.strictObject({
  reset: credentialResetKindSchema,
  revokedSessionIds: z.array(idSchema),
});
