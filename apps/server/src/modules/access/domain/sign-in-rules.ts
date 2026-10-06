import type { Secret } from '@apparel-os/schemas';
import { z } from 'zod';

// The settings sign-in reads and the rules they set (access-and-approvals 3.1, 3.2; code-house-rules 12.14). Each is
// an effective-dated setting of access with no default anywhere: their values are OPEN (GC3-5; Admin, V-04; product
// owner) and, until one is set, what needs it is unavailable. The shapes below are the design's; the numbers are not.

/**
 * Sign-in throttling (access-and-approvals 3.1; DEC-116): once the failed sign-ins of the typed login, or of the
 * source address, within the last `windowSeconds` reach `failureLimit`, further attempts are slowed, answered without
 * checking any credential, until older failures leave the window. A login that exists and one that does not are
 * counted and answered alike.
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
 * come for `idleLockSeconds`, and ends `absoluteSeconds` after it started, locked or not. Their values are OPEN until
 * policy 2 is Signed and the Admin has validated them (V-04); `dev` and tests hold synthetic ones (DEC-102 for
 * `kdps-test`). The office kind is the only one so far: shared POS sessions need registered devices (S1-F12, RR-303).
 */
export const sessionLimitsSchema = z.strictObject({
  idleLockSeconds: z.int().positive(),
  absoluteSeconds: z.int().positive(),
});
export type SessionLimits = z.infer<typeof sessionLimitsSchema>;

/** The settings of access sign-in and sessions read, each with the versioned format of its value (code-house-rules 3.3). */
export const SETTING_FORMATS = {
  'access.sign-in-throttling': 'access.sign-in-throttling/1',
  'access.password-rules': 'access.password-rules/1',
  'access.office-session-limits': 'access.office-session-limits/1',
} as const;
export type AccessSettingKey = keyof typeof SETTING_FORMATS;

export const SETTING_SCHEMAS = {
  'access.sign-in-throttling': signInThrottlingSchema,
  'access.password-rules': passwordRulesSchema,
  'access.office-session-limits': sessionLimitsSchema,
} as const satisfies Record<AccessSettingKey, z.ZodType>;

/** The failed sign-ins counted in the window. */
export interface FailureCounts {
  readonly byLogin: number;
  readonly byAddress: number;
}

/** Whether an attempt is slowed (access-and-approvals 3.1; DEC-116). */
export function isSlowed(throttling: SignInThrottling, failures: FailureCounts): boolean {
  return failures.byLogin >= throttling.failureLimit || failures.byAddress >= throttling.failureLimit;
}

/** What a session's limits make of it at an instant (access-and-approvals 3.3): the absolute limit wins. */
export function sessionLimitReached(
  limits: SessionLimits,
  session: { readonly startedAt: Date; readonly lastActivityAt: Date },
  now: Date,
): 'none' | 'idle' | 'absolute' {
  if (now.getTime() - session.startedAt.getTime() >= limits.absoluteSeconds * 1000) return 'absolute';
  if (now.getTime() - session.lastActivityAt.getTime() >= limits.idleLockSeconds * 1000) return 'idle';
  return 'none';
}

/** Whether a new password meets the password rules, its length counted in characters (code points), not code units. */
export function meetsPasswordRules(rules: PasswordRules, password: Secret): boolean {
  let characters = 0;
  for (const character of password.reveal()) if (character !== '') characters += 1;
  return characters >= rules.minimumLength;
}
