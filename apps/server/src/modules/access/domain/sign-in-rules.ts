// The settings sign-in reads and the rules they set (access-and-approvals 3.1, 3.2; code-house-rules 12.14). Each is
// an effective-dated setting of access with no default anywhere: their values are OPEN (GC3-5; Admin, V-04; product
// owner) and, until one is set, what needs it is unavailable. The shapes below are the design's; the numbers are not.

import {
  passwordRulesSchema,
  sessionLimitsSchema,
  signInThrottlingSchema,
  type PasswordRules,
  type Secret,
  type SessionLimits,
  type SignInThrottling,
} from '@apparel-os/schemas';
import type { z } from 'zod';

// The value shapes live in @apparel-os/schemas (settings.ts), shared with the setup step's request (9.11).
export { passwordRulesSchema, sessionLimitsSchema, signInThrottlingSchema };
export type { PasswordRules, SessionLimits, SignInThrottling };

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
