import { z } from 'zod';
import {
  displayNameSchema,
  loginSchema,
  organisationCodeSchema,
  personasHeldSchema,
  totpCodeSchema,
} from './common.js';
import { secretString } from './secret.js';

// Sign-in, enrolment and passwords (PRD-SEC-001, POL-02.17, DEC-093, DEC-099; access-and-approvals 3.1 to 3.3).
// Nothing here is sent by message: the second factor is an authenticator app (DEC-099).
// The session cookie is not part of any body. It holds the Organisation code and a random identifier, and each
// later request finds its Organisation's database from that code (access-and-approvals 3.3).

/**
 * One request carries every part, so a refusal never says which part was wrong (access-and-approvals 3.1).
 * The authenticator code is absent only when the user has no second factor yet: a first sign-in, or after a reset.
 */
export const signInRequestSchema = z.strictObject({
  organisationCode: organisationCodeSchema,
  login: loginSchema,
  password: secretString(),
  totpCode: totpCodeSchema.optional(),
});
export type SignInRequestInput = z.input<typeof signInRequestSchema>;

/**
 * What sign-in answers. Enrolment and the password change come first when the user signs in with a temporary
 * password or has no second factor; until both are done the sign-in reaches nothing else (access-and-approvals 3.2).
 * Every refusal is the same one; "slowed" follows the throttling setting, whose values are OPEN (GC3-5).
 */
export const signInOutcomeSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('signed-in') }),
  z.strictObject({ outcome: z.literal('enrolment-required') }),
  z.strictObject({ outcome: z.literal('password-change-required') }),
  z.strictObject({ outcome: z.literal('refused') }),
  z.strictObject({ outcome: z.literal('slowed') }),
]);
export type SignInOutcome = z.infer<typeof signInOutcomeSchema>;

/**
 * The authenticator secret, shown once at enrolment and never again (access-and-approvals 3.2). The server
 * reveals it explicitly into the response; a parsed copy stays wrapped until the screen shows it.
 */
export const enrolmentStartResponseSchema = z.strictObject({
  secret: secretString(),
  otpauthUri: secretString(),
});

/** Enrolment is confirmed with a code from the newly enrolled app. */
export const enrolmentConfirmRequestSchema = z.strictObject({
  totpCode: totpCodeSchema,
});

/**
 * The user's own password change, after a fresh authenticator code (access-and-approvals 3.2, 3.3). The new
 * password is checked against the password rules, which are a setting and OPEN (GC3-5). The idempotency hash
 * covers no secret; how a replay is told identical from changed content is part B's, before S1-F01-T04 (RR-207).
 */
export const passwordChangeRequestSchema = z.strictObject({
  newPassword: secretString(),
  totpCode: totpCodeSchema,
});

/**
 * A user created after setup, by a person holding create on users (access-and-approvals 9.11). It is a draft,
 * then Awaiting approval, and a different authorised person approves it before it can sign in (DEC-112;
 * access-and-approvals 2.1). Its temporary password is kept with the draft as an Argon2 hash and handed over in
 * person (access-and-approvals 3.2, DEC-099). A user grants nothing until an approved role assignment does
 * (PRD-ACS-002, PRD-ACS-003).
 */
export const userCreateRequestSchema = z.strictObject({
  login: loginSchema,
  displayName: displayNameSchema,
  personas: personasHeldSchema,
  temporaryPassword: secretString(),
});
export type UserCreateRequestInput = z.input<typeof userCreateRequestSchema>;
