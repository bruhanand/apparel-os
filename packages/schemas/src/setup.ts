import { z } from 'zod';
import { displayNameSchema, loginSchema, organisationCodeSchema, personasHeldSchema } from './common.js';
import { secretString } from './secret.js';
import { passwordRulesSchema, sessionLimitsSchema, settingOriginSchema, signInThrottlingSchema } from './settings.js';

// The setup step of a new Organisation (PRD-ACS-023, DEC-101, DEC-112; access-and-approvals 9.11; S1-F01-T10).
// An operator command, never an API endpoint (code-house-rules 4.3, CH-1). The operator gives the non-secret fields
// in a request file and types the temporary passwords at the command's prompt, never in its arguments
// (access-and-approvals 3.2).

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

function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/**
 * The Organisation's settings the step writes, every value supplied by the operator (synthetic on `dev`, labelled so
 * by `origin`); none has a default (AGENTS.md "Never invent a value"; code-house-rules 12.14). Every required security
 * setting is required here: the timezone (configuration's setting, code-house-rules 9), the password rules
 * (access-and-approvals 3.2), the sign-in throttling (3.1) and the office session limits (3.3). A request that leaves
 * any out is refused, naming it, before anything is created (3.1, 9.11; PRD-SEC-017; DEC-118).
 */
export const setupSettingsSchema = z.strictObject({
  origin: settingOriginSchema,
  timezone: z.string().min(1).refine(isTimeZone, { message: 'Not a time zone this runtime knows' }),
  passwordRules: passwordRulesSchema,
  signInThrottling: signInThrottlingSchema,
  officeSessionLimits: sessionLimitsSchema,
});
export type SetupSettings = z.output<typeof setupSettingsSchema>;

/** The required security settings of a setup request, by their field (access-and-approvals 3.1; DEC-118). */
export const requiredSetupSettings = ['timezone', 'passwordRules', 'signInThrottling', 'officeSessionLimits'] as const;

/**
 * The required security settings a setup request, or its request file, leaves out, as `settings.<field>`, in the
 * order of `requiredSetupSettings`; none when every one is there (access-and-approvals 3.1, 9.11; PRD-SEC-017,
 * DEC-118). It reads only which fields are present, never a value, so the refusal it names echoes nothing.
 */
export function missingSetupSettings(request: unknown): string[] {
  const settings =
    typeof request === 'object' && request !== null ? (request as { settings?: unknown }).settings : undefined;
  const present = (name: string): boolean =>
    typeof settings === 'object' &&
    settings !== null &&
    name in settings &&
    (settings as Record<string, unknown>)[name] !== undefined &&
    (settings as Record<string, unknown>)[name] !== null;
  return requiredSetupSettings.filter((name) => !present(name)).map((name) => `settings.${name}`);
}

/**
 * The name of the Organisation's database on the directory's server (deployment.md section 4): letters, digits and
 * `_`, at most 63 characters, as the directory keeps it.
 */
export const databaseNameSchema = z.string().regex(/^[A-Za-z0-9_]{1,63}$/);

/** Logins are compared without regard to letter case (access-and-approvals 2.1). */
function differentLogins(request: {
  readonly firstAdmin: { readonly login: string };
  readonly firstApprover: { readonly login: string };
}): boolean {
  return request.firstAdmin.login.toLowerCase() !== request.firstApprover.login.toLowerCase();
}

const TWO_USERS = {
  message: 'The first Admin and the first approver are two different users',
  path: ['firstApprover', 'login'],
};

const setupFields = {
  organisationCode: organisationCodeSchema,
  databaseName: databaseNameSchema,
  settings: setupSettingsSchema,
};

/**
 * The setup request. The first Admin and the first approver are two different users, since an approver must
 * differ from the preparer (PRD-ACS-006; access-and-approvals 9.11).
 */
export const setupRequestSchema = z
  .strictObject({ ...setupFields, firstAdmin: setupUserSchema, firstApprover: setupUserSchema })
  .refine(differentLogins, TWO_USERS);
export type SetupRequestInput = z.input<typeof setupRequestSchema>;
export type SetupRequest = z.output<typeof setupRequestSchema>;

/**
 * The request file the operator gives: every field but the temporary passwords, which the command asks for at its
 * prompt (access-and-approvals 3.2, 9.11).
 */
export const setupRequestFileSchema = z
  .strictObject({
    ...setupFields,
    firstAdmin: z.strictObject(setupUserShape),
    firstApprover: z.strictObject(setupUserShape),
  })
  .refine(differentLogins, TWO_USERS);
export type SetupRequestFile = z.output<typeof setupRequestFileSchema>;

/**
 * The fields the setup record's fingerprint covers: the request without its temporary passwords
 * (access-and-approvals 9.11, 13.1). Parsing a request through it drops the passwords, so no form of a secret
 * reaches the fingerprint. A rerun's passwords are verified against the Argon2 credentials the first run wrote.
 */
export const setupFingerprintFieldsSchema = z.object({
  ...setupFields,
  firstAdmin: z.object(setupUserShape),
  firstApprover: z.object(setupUserShape),
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
