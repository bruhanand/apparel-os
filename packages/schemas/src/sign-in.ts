import { z } from 'zod';
import {
  displayNameSchema,
  idSchema,
  loginSchema,
  organisationCodeSchema,
  personasHeldSchema,
  totpCodeSchema,
} from './common.js';
import { grantSchema } from './roles.js';
import { secretString, shownOnceSecret } from './secret.js';

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
 * What a sign-in that passed answers, with the session cookie. Enrolment and the password change come first when the
 * user signs in with a temporary password or has no second factor; until both are done the session reaches nothing
 * else (access-and-approvals 3.2, 7.1 step 1).
 *
 * A refused or slowed sign-in is no success: it is the error envelope with one code and no `missing`,
 * `access.sign-in-refused` for any wrong part and `access.sign-in-slowed` after repeated failures, the same for a
 * login that exists and one that does not (code-house-rules 12.3; DEC-116). The throttling values are OPEN (GC3-5).
 */
export const signInOutcomeSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('signed-in') }),
  z.strictObject({ outcome: z.literal('enrolment-required') }),
  z.strictObject({ outcome: z.literal('password-change-required') }),
]);
export type SignInOutcome = z.infer<typeof signInOutcomeSchema>;

/**
 * The signed-in user, for a session that has finished first sign-in (access-and-approvals 3.3). Identifiers, the
 * display name, the personas held and the grants only; none is a restricted field (access-and-approvals 6).
 */
export const sessionViewSchema = z.strictObject({
  organisationCode: organisationCodeSchema,
  userId: idSchema,
  displayName: displayNameSchema,
  /**
   * The personas the user's version in force holds, in their order: the first sets the landing screen (personas.md
   * section 2; DEC-116; RR-281). A persona grants nothing (PRD-ACS-002, PRD-ACS-003).
   */
  personasHeld: personasHeldSchema,
  /**
   * The user's effective grants today: each action on each record type some role assignment in force grants, from
   * the effective-grant table (access-and-approvals 7.2; RR-261). The shell opens screens by them; every request is
   * still authorised on its own (7.1 step 3).
   */
  grants: z.array(grantSchema),
});
export type SessionView = z.infer<typeof sessionViewSchema>;

/**
 * The authenticator secret, shown once at enrolment and never again (access-and-approvals 3.2; code-house-rules 12.6,
 * DEC-113). The server reveals it only where it encodes the answer; the typed client decodes it back into a `Secret`,
 * which stays wrapped until the screen shows it. A replay of the request is refused, never answered again.
 */
export const enrolmentStartResponseSchema = z.strictObject({
  secret: shownOnceSecret(),
  otpauthUri: shownOnceSecret(),
});

/** Enrolment starts with nothing but the session: the server makes the secret (access-and-approvals 3.2). */
export const enrolmentStartRequestSchema = z.strictObject({});

/** Enrolment is confirmed with a code from the newly enrolled app. */
export const enrolmentConfirmRequestSchema = z.strictObject({
  totpCode: totpCodeSchema,
});

/** The confirmed second factor, by its identifier and state; never its secret (code-house-rules 12.4). */
export const enrolmentConfirmResponseSchema = z.strictObject({
  secondFactorId: idSchema,
  state: z.literal('Confirmed'),
});

/** The password was changed. The credential's identifier is never sent (code-house-rules 12.5). */
export const passwordChangeResponseSchema = z.strictObject({
  outcome: z.literal('password-changed'),
});

/**
 * The user's own password change, after a fresh authenticator code (access-and-approvals 3.2, 3.3). The new
 * password is checked against the password rules, which are a setting and OPEN (GC3-5). The idempotency hash
 * covers no secret; a replay is told identical from changed content as code-house-rules 12.5 says (RR-207, CH-8).
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
