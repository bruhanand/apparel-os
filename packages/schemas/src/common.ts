import { paise } from '@apparel-os/domain';
import { z } from 'zod';

// Shared building blocks for the S1-F01 contract sketch (docs/implementation/s1-f01-first-access.md, S1-F01-T01).
// No schema here carries a default value: every KDPS or OPEN value comes from a setting (AGENTS.md "Never invent
// a value").

/** PRD-MOD-008: identifiers are UUIDv7. */
export const idSchema = z.uuidv7();

/**
 * The Organisation code a person types at sign-in (DEC-093). Its format is not designed yet; it is compared
 * exactly, so no case folding or trimming happens here.
 */
export const organisationCodeSchema = z.string().min(1);

/** A login identifier: unique in the Organisation, compared without regard to letter case (access-and-approvals 2.1). */
export const loginSchema = z.string().min(1);

export const displayNameSchema = z.string().min(1);

/** A business date under the Organisation's timezone (PRD-MOD-009), as YYYY-MM-DD. */
export const businessDateSchema = z.iso.date();

/** An authenticator-app code (PRD-SEC-001, POL-02.17). Digits only; their number is the authenticator's. */
export const totpCodeSchema = z.string().regex(/^[0-9]+$/);

/** The PRD's 14 personas (personas.md section 2). A persona grants nothing (PRD-ACS-002, PRD-ACS-003). */
export const personaIdSchema = z.enum([
  'P-OWN',
  'P-ADM',
  'P-ACC',
  'P-CHA',
  'P-BKG',
  'P-OPS',
  'P-WHS',
  'P-BRM',
  'P-STM',
  'P-CSH',
  'P-SLS',
  'P-EBO',
  'P-HRS',
  'P-AUD',
]);
export type PersonaId = z.infer<typeof personaIdSchema>;

/** A list of personas held, each at most once. */
export const personasHeldSchema = z
  .array(personaIdSchema)
  .refine((list) => new Set(list).size === list.length, { message: 'A persona is listed once' });

/** PRD-MOD-014: INR in whole paise, a safe integer, never a binary fraction. */
export const paiseSchema = z
  .number()
  .refine((value) => Number.isSafeInteger(value), { message: 'Paise must be a safe integer' })
  .transform((value) => paise(value));

/**
 * PRD-MOD-015: an amount that may be Unknown, in the shape of @apparel-os/domain's MaybeKnown. Unknown is never
 * zero, and "no value at all" is a separate stated kind where a record has none (an access change, DM-8).
 */
export const maybeKnownPaiseSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('known'), value: paiseSchema }),
  z.strictObject({ kind: z.literal('unknown') }),
]);

/** A reference to one version of an owner's record: module, record type, record and version (domain-model 3.3). */
export const recordVersionRefSchema = z.strictObject({
  module: z.string().min(1),
  recordType: z.string().min(1),
  recordId: idSchema,
  versionId: idSchema,
});
export type RecordVersionRef = z.infer<typeof recordVersionRefSchema>;
