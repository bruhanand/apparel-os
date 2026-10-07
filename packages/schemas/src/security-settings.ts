import { z } from 'zod';
import { businessDateSchema, idSchema } from './common.js';
import { passwordRulesSchema, sessionLimitsSchema, settingOriginSchema, signInThrottlingSchema } from './settings.js';

// Changing an essential security setting after setup (access-and-approvals 3.3, 9.11; code-house-rules 7.3, 12.14;
// POL-02.06, POL-02.07, PRD-MOD-010; DEC-118, RR-334; S1-F01-T25): the sign-in throttling, the password rules and the
// office session limits. A change is a new version, prepared by a person with edit on `access.setting` and approved by
// a different authorised person with approve on it, with a fresh authenticator code. No value here is a default: the
// preparer states every value and its origin (AGENTS.md "Never invent a value").

/** The essential security settings that change this way (access-and-approvals 3.1, 3.2, 3.3). */
export const securitySettingKeySchema = z.enum([
  'access.sign-in-throttling',
  'access.password-rules',
  'access.office-session-limits',
]);
export type SecuritySettingKey = z.infer<typeof securitySettingKeySchema>;

/**
 * When a version takes effect (access-and-approvals 3.3): at the moment of its decision, dated like a user version
 * (9.5), or from the start of a later business day under the Organisation's timezone; never earlier. Both are stated;
 * neither is a default.
 */
export const settingTakesEffectSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('at-decision') }),
  z.strictObject({ kind: z.literal('from-date'), date: businessDateSchema }),
]);
export type SettingTakesEffect = z.infer<typeof settingTakesEffectSchema>;

function draftOf<const Key extends SecuritySettingKey, Value extends z.ZodType>(setting: Key, value: Value) {
  return z.strictObject({
    setting: z.literal(setting),
    value,
    origin: settingOriginSchema,
    takesEffect: settingTakesEffectSchema,
  });
}

/** A new version of one essential security setting, as the preparer states it. */
export const securitySettingVersionDraftSchema = z.discriminatedUnion('setting', [
  draftOf('access.sign-in-throttling', signInThrottlingSchema),
  draftOf('access.password-rules', passwordRulesSchema),
  draftOf('access.office-session-limits', sessionLimitsSchema),
]);
export type SecuritySettingVersionDraft = z.infer<typeof securitySettingVersionDraftSchema>;

/** What preparing a version answers. */
export const securitySettingPreparedSchema = z.strictObject({
  settingId: idSchema,
  versionId: idSchema,
  requestId: idSchema,
});

const instant = z.iso.datetime({ offset: true });

function viewOf<const Key extends SecuritySettingKey, Value extends z.ZodType>(setting: Key, value: Value) {
  return z.strictObject({
    setting: z.literal(setting),
    /** Null while the setting has no row: it was never set (code-house-rules 12.14). */
    settingId: idSchema.nullable(),
    /** The Approved version in force at the read, or null: not set. */
    inForceVersionId: idSchema.nullable(),
    /** Every version, newest first: in force, scheduled, ended, awaiting approval and rejected. */
    versions: z.array(
      z.strictObject({
        id: idSchema,
        value,
        origin: settingOriginSchema,
        decision: z.enum(['Awaiting approval', 'Approved', 'Rejected']),
        takesEffect: settingTakesEffectSchema,
        /** The instant an Approved version takes effect. */
        validFrom: instant.optional(),
        /** The instant an Approved version stops, where a later one follows it. */
        validTo: instant.optional(),
      }),
    ),
  });
}

/** The essential security settings, each with its versions and the one in force (design-language 10.19). */
export const securitySettingsSchema = z.strictObject({
  asOf: instant,
  settings: z.array(
    z.discriminatedUnion('setting', [
      viewOf('access.sign-in-throttling', signInThrottlingSchema),
      viewOf('access.password-rules', passwordRulesSchema),
      viewOf('access.office-session-limits', sessionLimitsSchema),
    ]),
  ),
});
export type SecuritySettings = z.infer<typeof securitySettingsSchema>;
