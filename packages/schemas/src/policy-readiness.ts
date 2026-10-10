import { z } from 'zod';
import { businessDateSchema, idSchema } from './common.js';
import { missingItemSchema } from './errors.js';
import { evidenceListSchema } from './files.js';
import { settingOriginSchema } from './settings.js';

// Policy readiness and the Available check (module-map 4.4; domain-model 3.6; access-and-approvals 7.1 step 2;
// code-house-rules 12.3, 12.14; PRD "Required policy configuration", PRD-SEC-017, PRD-UXP-003; DEC-092, DEC-105,
// DEC-116; S1-F04-T01). No value here is a default: every policy starts Open, every capability off, and nothing is
// validated until a person records it with its evidence (AGENTS.md "Never invent a value").

/**
 * The 19 policies of kdps-policies.md, by number (PRD "Required policy configuration"). Their names are the
 * policies' own and live in the screens' message catalogue; their statuses are records, never constants here.
 */
export const policyNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] as const;
export type PolicyNumber = (typeof policyNumbers)[number];
export const policyNumberSchema = z.int().min(1).max(19);
/** The policy a path's number names, or undefined for any other text: parsed, never cast. */
export function policyNumberOf(value: string): PolicyNumber | undefined {
  return policyNumbers.find((each) => String(each) === value);
}

/** A policy's number as a path parameter, `1` to `19`. */
export const policyNumberParamSchema = z.strictObject({ policyNumber: z.string().regex(/^(?:[1-9]|1[0-9])$/) });

/**
 * Where a Signed record or a validation came from (code-house-rules 12.14): KDPS's own, or synthetic, for tests and
 * demos on a synthetic Organisation only. A setting of the test setup never enables a gated action (DEC-071), so it
 * is no origin of a signature or a validation.
 */
export const policyRecordOriginSchema = z.enum(['kdps', 'synthetic']);
export type PolicyRecordOrigin = z.infer<typeof policyRecordOriginSchema>;

/** Recording a policy as Signed: its "Signed by, date" line of kdps-policies.md and the signed evidence (DEC-092). */
export const policySignatureDraftSchema = z.strictObject({
  /** Who signed, as the policy's "Signed by" line names them. */
  signatory: z.string().trim().min(1).max(200),
  signedOn: businessDateSchema,
  origin: policyRecordOriginSchema,
  evidence: evidenceListSchema,
});
export type PolicySignatureDraft = z.infer<typeof policySignatureDraftSchema>;

/** Recording a policy's real values as validated, with the evidence (DM-6; DEC-105, DEC-116). */
export const policyValidationDraftSchema = z.strictObject({
  origin: policyRecordOriginSchema,
  evidence: evidenceListSchema,
});
export type PolicyValidationDraft = z.infer<typeof policyValidationDraftSchema>;

export const policySignatureRecordedSchema = z.strictObject({ signatureId: idSchema });
export const policyValidationRecordedSchema = z.strictObject({ validationId: idSchema });

/**
 * The code of an operation or a capability a module declares: `<module>.<words>`, lower-case words joined by hyphens,
 * such as `site-lifecycle.publish-opening-data`.
 */
export const gateCodeSchema = z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/);

/** A capability's code as a path parameter. */
export const capabilityParamSchema = z.strictObject({ capability: gateCodeSchema });

/** Switching a capability on or off for the Organisation (PRD-SEC-017); both are stated, neither is a default. */
export const capabilitySwitchSchema = z.strictObject({ on: z.boolean() });
export const capabilitySwitchedSchema = z.strictObject({ capability: z.string(), on: z.boolean() });

/** The activities a Site or business unit is granted (PRD-LIF-001). */
export const activitySchema = z.enum(['receiving', 'movement', 'selling']);
export type Activity = z.infer<typeof activitySchema>;

/** What Available answers for one operation here and now (module-map 4.4; PRD-UXP-003). */
export const availabilityStateSchema = z.enum(['available', 'unavailable']);

/**
 * Check availability as a read (module-map 4.4; design-language 10.17): the operation, and where an activity grant
 * applies, the place, a Site or a business unit. A screen asks it to show a gated action enabled, or disabled with
 * the banner, before anyone presses it.
 */
export const availabilityQuerySchema = z.strictObject({
  operation: gateCodeSchema,
  siteId: idSchema.optional(),
  businessUnitId: idSchema.optional(),
});

export const availabilitySchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  operation: z.string(),
  /** The policy that governs it. */
  policy: policyNumberSchema,
  state: availabilityStateSchema,
  /** What blocks it, as identifiers and codes only (code-house-rules 12.3 "What is missing"); empty when available. */
  missing: z.array(missingItemSchema),
});
export type Availability = z.infer<typeof availabilitySchema>;

const instant = z.iso.datetime({ offset: true });

/** A policy's Signed record (DEC-092). The evidence is the attachments, read through Setup › Policy readiness. */
export const policySignatureSchema = z.strictObject({
  signatureId: idSchema,
  signatory: z.string(),
  signedOn: businessDateSchema,
  origin: policyRecordOriginSchema,
  recordedAt: instant,
  evidence: z.array(idSchema),
});

/** A validation of a policy's real values (DM-6): by whom and when, and whether it covers the values in force. */
export const policyValidationSchema = z.strictObject({
  validationId: idSchema,
  origin: policyRecordOriginSchema,
  validatedBy: z.string(),
  validatedAt: instant,
  evidence: z.array(idSchema),
  /** False once a value it validated has changed or another has been configured: a new validation is needed. */
  current: z.boolean(),
});

/** One configured value of a policy, as its owning module reports it (DM-6; code-house-rules 12.14). */
export const configuredValueSchema = z.strictObject({
  /** The validity check that reports it, `<module>.<what>`. */
  check: z.string(),
  /** The value's identity, such as a setting version. */
  key: z.string(),
  origin: settingOriginSchema,
  /** Whether the reader entered it, so cannot validate it (DM-6). */
  enteredByYou: z.boolean(),
});

/** One operation the policy governs, and whether it is available now, without a place (what is blocked). */
export const gatedOperationSchema = z.strictObject({
  operation: z.string(),
  capability: z.string(),
  capabilityOn: z.boolean(),
  /** The activity it needs granted at its place, or null where none applies. */
  activity: activitySchema.nullable(),
  state: availabilityStateSchema,
  missing: z.array(missingItemSchema),
});

/** A policy's readiness (module-map 4.4 "Read model: policy readiness"; ui-blueprint Setup › Policy readiness). */
export const policyReadinessItemSchema = z.strictObject({
  policy: policyNumberSchema,
  /** Open until Signed (DEC-092; design-language section 7). */
  state: z.enum(['Open', 'Signed']),
  signature: policySignatureSchema.nullable(),
  validation: policyValidationSchema.nullable(),
  values: z.array(configuredValueSchema),
  /** What the policy itself lacks: its signature, its validated values. */
  missing: z.array(missingItemSchema),
  operations: z.array(gatedOperationSchema),
});
export type PolicyReadinessItem = z.infer<typeof policyReadinessItemSchema>;

export const policyReadinessSchema = z.strictObject({
  asOf: instant,
  policies: z.array(policyReadinessItemSchema),
});
export type PolicyReadiness = z.infer<typeof policyReadinessSchema>;
