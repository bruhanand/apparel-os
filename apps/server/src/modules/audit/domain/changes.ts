import { z } from 'zod';

/**
 * The before and after values of an audit record: the changed fields only (numbering-and-audit 4.1; PRD-ACS-013),
 * stored as a JSON payload whose shape this versioned schema states (code-house-rules 3.3).
 *
 * - `value`: an ordinary field, with its values.
 * - `restricted`: a restricted field that is not encrypted, such as cost or customer contact, kept with its field
 *   class so that it is shown only under field permission (4.3; PRD-ACS-008). Field class names are `access`'s.
 * - `encrypted`: an encrypted field, such as bank details or an authenticator secret. Its value is never copied: the
 *   record names the versions of the owning record that held the old and the new value, or says that the owning
 *   record keeps no such version, or that there was none (4.3; PRD-SEC-006).
 * - `secret`: a hash of a password, a session identifier or a credential. Only the fact that it changed is kept
 *   (4.3; RR-210; PRD-SEC-014).
 */
export const AUDIT_CHANGES_FORMAT = 'audit-changes/1';

const field = z.string().min(1);

const versionReference = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('version'), versionId: z.uuid() }),
  /** The owning record keeps no version that held the value, as for a replaced authenticator secret. */
  z.strictObject({ kind: z.literal('not-kept') }),
  /** There was no value: the field was first set, or was cleared. */
  z.strictObject({ kind: z.literal('absent') }),
]);

const auditChange = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('value'), field, before: z.json(), after: z.json() }),
  z.strictObject({ kind: z.literal('restricted'), field, fieldClass: field, before: z.json(), after: z.json() }),
  z.strictObject({
    kind: z.literal('encrypted'),
    field,
    fieldClass: field,
    before: versionReference,
    after: versionReference,
  }),
  z.strictObject({ kind: z.literal('secret'), field }),
]);

const auditChanges1 = z.array(auditChange);

export type AuditChange = z.infer<typeof auditChange>;
export type VersionReference = z.infer<typeof versionReference>;

/** The changes refused: a shape outside the schema, a field twice, or a value that holds a secret. */
export class AuditChangeRefused extends Error {
  constructor(reason: string) {
    super(`Audit changes refused: ${reason}`);
    this.name = 'AuditChangeRefused';
  }
}

export interface StoredAuditChanges {
  readonly format: typeof AUDIT_CHANGES_FORMAT;
  readonly changes: readonly AuditChange[];
}

// The encoded form of an Argon2 hash, the form passwords and credentials are kept in (access-and-approvals 3.1, 6).
const ARGON2_ENCODED = /\$argon2(id|i|d)\$/;

/**
 * Checks the changes a module gives and returns what the audit record stores. Refuses anything outside the schema,
 * so an encrypted change can carry no value (PRD-SEC-006); refuses a field named twice; and, as a backstop to the
 * `secret` kind, refuses any value holding an Argon2 hash (PRD-SEC-014). The refusal never repeats a value.
 */
export function auditChanges(changes: readonly AuditChange[]): StoredAuditChanges {
  const parsed = auditChanges1.safeParse(changes);
  if (!parsed.success) {
    throw new AuditChangeRefused('a change does not follow the audit-changes/1 schema');
  }
  const seen = new Set<string>();
  for (const change of parsed.data) {
    if (seen.has(change.field)) throw new AuditChangeRefused(`field ${change.field} is named twice`);
    seen.add(change.field);
    if (
      (change.kind === 'value' || change.kind === 'restricted') &&
      (holdsHash(change.before) || holdsHash(change.after))
    ) {
      throw new AuditChangeRefused(`field ${change.field} holds a hash; record it as a secret change`);
    }
  }
  return { format: AUDIT_CHANGES_FORMAT, changes: parsed.data };
}

/** Reads a stored payload back under the format it names. */
export function readAuditChanges(format: string, stored: unknown): readonly AuditChange[] {
  if (format !== AUDIT_CHANGES_FORMAT) throw new AuditChangeRefused(`format ${format} is not known`);
  const parsed = auditChanges1.safeParse(stored);
  if (!parsed.success) throw new AuditChangeRefused('the stored changes do not follow their format');
  return parsed.data;
}

function holdsHash(value: unknown): boolean {
  if (typeof value === 'string') return ARGON2_ENCODED.test(value);
  if (Array.isArray(value)) return value.some(holdsHash);
  if (typeof value === 'object' && value !== null) return Object.values(value).some(holdsHash);
  return false;
}
