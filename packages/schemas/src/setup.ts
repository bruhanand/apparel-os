import { z } from 'zod';
import { displayNameSchema, loginSchema, organisationCodeSchema, personasHeldSchema } from './common.js';
import { secretString } from './secret.js';

// The setup step of a new Organisation (PRD-ACS-023, DEC-101, DEC-112; access-and-approvals 9.11).
// An operator command, never an API endpoint (code-house-rules 4.3, CH-1). The operator types the temporary
// passwords at the command's prompt, never in its arguments (access-and-approvals 3.2).

const setupUserShape = {
  login: loginSchema,
  displayName: displayNameSchema,
  personas: personasHeldSchema,
};

/** One of the two first users. The temporary password is the request's only secret kind of field. */
export const setupUserSchema = z.strictObject({
  ...setupUserShape,
  temporaryPassword: secretString(),
});

/** The limits of one session kind, in whole minutes. Each is optional; none has a default. */
const sessionKindLimitsSchema = z.strictObject({
  idleLockMinutes: z.int().positive().optional(),
  absoluteMinutes: z.int().positive().optional(),
});

/**
 * The Organisation's settings the step writes (synthetic on dev, labelled so). Every field is optional and has
 * no default: an absent setting is not set, and what needs it stays unavailable (PRD-SEC-017; code-house-rules 9).
 * Session limits are effective-dated access settings, an idle-lock and an absolute limit for each session kind,
 * office and shared POS (access-and-approvals 3.3, PRD-ACS-017, POL-02.18).
 */
export const setupSettingsSchema = z.strictObject({
  timezone: z.string().min(1).refine(isTimeZone, { message: 'Not a time zone this runtime knows' }).optional(),
  sessionLimits: z
    .strictObject({
      office: sessionKindLimitsSchema.optional(),
      sharedPos: sessionKindLimitsSchema.optional(),
    })
    .optional(),
});

function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** Logins are compared without regard to letter case (access-and-approvals 2.1). */
function sameLogin(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * The setup request. The first Admin and the first approver are two different users, since an approver must
 * differ from the preparer (PRD-ACS-006; access-and-approvals 9.11).
 */
export const setupRequestSchema = z
  .strictObject({
    organisationCode: organisationCodeSchema,
    firstAdmin: setupUserSchema,
    firstApprover: setupUserSchema,
    settings: setupSettingsSchema,
  })
  .refine((request) => !sameLogin(request.firstAdmin.login, request.firstApprover.login), {
    message: 'The first Admin and the first approver are two different users',
    path: ['firstApprover', 'login'],
  });
export type SetupRequestInput = z.input<typeof setupRequestSchema>;
export type SetupRequest = z.output<typeof setupRequestSchema>;

/**
 * The fields the setup record's fingerprint covers: the request without its temporary passwords
 * (access-and-approvals 9.11, 13.1). Parsing a request through it drops the passwords, so no form of a secret
 * reaches the fingerprint. A rerun's passwords are verified against the Argon2 credentials the first run wrote.
 */
export const setupFingerprintFieldsSchema = z.object({
  organisationCode: organisationCodeSchema,
  firstAdmin: z.object(setupUserShape),
  firstApprover: z.object(setupUserShape),
  settings: setupSettingsSchema,
});
export type SetupFingerprintFields = z.output<typeof setupFingerprintFieldsSchema>;

/**
 * What a run of the setup step reports (access-and-approvals 9.11): created (it did everything), completed (it
 * finished an interrupted run), or refused as a duplicate (the directory already lists the code), a conflict, or
 * a conflict of fingerprint versions (the earlier run used another version of the canonical form).
 * A refusal carries nothing else: never which user or field differs, never a value supplied.
 */
export const setupOutcomeSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('created'), organisationCode: organisationCodeSchema }),
  z.strictObject({ outcome: z.literal('completed'), organisationCode: organisationCodeSchema }),
  z.strictObject({
    outcome: z.literal('refused'),
    reason: z.enum(['duplicate', 'conflict', 'fingerprint-version']),
    organisationCode: organisationCodeSchema,
  }),
]);
export type SetupOutcome = z.infer<typeof setupOutcomeSchema>;
