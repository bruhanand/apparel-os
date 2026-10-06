import { z } from 'zod';

// The value shapes of the access settings sign-in and sessions read (access-and-approvals 3.1, 3.2, 3.3;
// code-house-rules 12.14). Shared by the server, which reads and checks them, and the setup step's request, which
// writes their first versions (access-and-approvals 9.11). Each is an effective-dated setting with no default
// anywhere: the values are OPEN (GC3-5; Admin, V-04; product owner) and, until one is set, what needs it is
// unavailable. The shapes are the design's; no number here is.

/**
 * Sign-in throttling (access-and-approvals 3.1; DEC-116): once the failed sign-ins of the typed login, or of the
 * source address, within the last `windowSeconds` reach `failureLimit`, further attempts are slowed.
 */
export const signInThrottlingSchema = z.strictObject({
  failureLimit: z.int().positive(),
  windowSeconds: z.int().positive(),
});
export type SignInThrottling = z.infer<typeof signInThrottlingSchema>;

/** The password rules (access-and-approvals 3.2; GC3-5): the least number of characters a new password has. */
export const passwordRulesSchema = z.strictObject({
  minimumLength: z.int().positive(),
});
export type PasswordRules = z.infer<typeof passwordRulesSchema>;

/**
 * The limits of one kind of session (access-and-approvals 3.3; PRD-ACS-017, POL-02.18): it locks once no request has
 * come for `idleLockSeconds`, and ends `absoluteSeconds` after it started.
 */
export const sessionLimitsSchema = z.strictObject({
  idleLockSeconds: z.int().positive(),
  absoluteSeconds: z.int().positive(),
});
export type SessionLimits = z.infer<typeof sessionLimitsSchema>;

/**
 * Where a setting version's value came from (code-house-rules 12.14; 11.1): KDPS's answer, a setting of the test
 * setup on `kdps-test`, or synthetic, so nothing synthetic passes for a KDPS value.
 */
export const settingOriginSchema = z.enum(['kdps', 'test-setup', 'synthetic']);
export type SettingOrigin = z.infer<typeof settingOriginSchema>;
