import { z } from 'zod';

// History (numbering-and-audit 4.5, 5; access-and-approvals 6, 7.2, 9.11; module-map 4.3 "Stage 1 report: access
// history", 4.5 "Read history"; code-house-rules 12.1 "Reads"). The history of a record or of an actor, and the
// access history report, read inside the reader's scope (PRD-SEC-005), each restricted value masked unless the
// reader's assignment grants its field class (PRD-ACS-008), with the time the rows were read (PRD-PRF-004).

/**
 * The largest page of a history read: a technical cap the builders set (code-house-rules 12.1 "Reads"), not a KDPS
 * value. A longer history is read page by page with the cursor.
 */
export const HISTORY_PAGE_CAP = 100;

/**
 * Where the next page starts: the recording time of the last row of the page, in UTC to the microsecond, and its
 * identifier. Opaque to the screen, which only hands it back.
 */
export const historyCursorSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

const timestamp = z.iso.datetime();

/** A user or a service identity, with the name the screen shows: a user's display name, an identity's code. */
export const historyActorSchema = z.strictObject({
  kind: z.enum(['user', 'service-identity']),
  id: z.uuid(),
  /** Null when no user or service identity of that identifier is found. */
  name: z.string().nullable(),
});
export type HistoryActor = z.infer<typeof historyActorSchema>;

const versionReferenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('version'), versionId: z.uuid() }),
  z.strictObject({ kind: z.literal('not-kept') }),
  z.strictObject({ kind: z.literal('absent') }),
]);

/**
 * One changed field as the reader may see it (numbering-and-audit 4.3; design-language 10.6). `restricted` carries
 * its values only when the reader's assignment grants the field class; otherwise the change is `masked`, and the
 * values never leave the server. An encrypted field names versions only; a secret, the fact alone.
 */
export const historyChangeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('value'), field: z.string(), before: z.json(), after: z.json() }),
  z.strictObject({
    kind: z.literal('restricted'),
    field: z.string(),
    fieldClass: z.string(),
    before: z.json(),
    after: z.json(),
  }),
  z.strictObject({ kind: z.literal('masked'), field: z.string(), fieldClass: z.string() }),
  z.strictObject({
    kind: z.literal('encrypted'),
    field: z.string(),
    fieldClass: z.string(),
    before: versionReferenceSchema,
    after: versionReferenceSchema,
  }),
  z.strictObject({ kind: z.literal('secret'), field: z.string() }),
]);
export type HistoryChange = z.infer<typeof historyChangeSchema>;

/** One audit record as a history read answers it (numbering-and-audit 4.1). */
export const auditHistoryEntrySchema = z.strictObject({
  id: z.uuid(),
  recordedAt: timestamp,
  occurredAt: timestamp,
  /** Null when the Organisation's timezone was not set (PRD-MOD-015). */
  businessDate: z.iso.date().nullable(),
  actor: historyActorSchema,
  /** For a job carrying out a person's decision, that person (PRD-SEC-018). */
  onBehalfOf: historyActorSchema.nullable(),
  /** `<module>.<record type>`, as the permission registry names it. */
  recordType: z.string(),
  recordId: z.uuid(),
  versionId: z.uuid().nullable(),
  operation: z.string(),
  changes: z.array(historyChangeSchema),
  reason: z.string().nullable(),
  source: z.strictObject({ kind: z.string(), reference: z.string().nullable(), row: z.number().int().nullable() }),
  approvalDecisionId: z.uuid().nullable(),
  correlationId: z.uuid(),
});
export type AuditHistoryEntry = z.infer<typeof auditHistoryEntrySchema>;

/** One access record as the access history report answers it (numbering-and-audit 5.2). */
export const accessHistoryEntrySchema = z.strictObject({
  id: z.uuid(),
  recordedAt: timestamp,
  occurredAt: timestamp,
  kind: z.string(),
  outcome: z.enum(['succeeded', 'refused']),
  /** Null for a failed sign-in whose login matched no user (PRD-SEC-014). */
  user: historyActorSchema.nullable(),
  deviceId: z.uuid().nullable(),
  networkAddress: z.string().nullable(),
  identityVerification: z.string().nullable(),
  /** The audit record of a permission change. */
  auditRecordId: z.uuid().nullable(),
  /**
   * What a permission change changed: the audited record's type and the operation, never a value; null where the
   * reader may not read that audit record (numbering-and-audit 4.5, 5.1).
   */
  change: z.strictObject({ recordType: z.string(), operation: z.string() }).nullable(),
  /** The record, field class and exposure of a sensitive access. */
  record: z.strictObject({ recordType: z.string(), recordId: z.uuid() }).nullable(),
  fieldClass: z.string().nullable(),
  exposure: z.enum(['shown', 'exported']).nullable(),
  correlationId: z.uuid(),
});
export type AccessHistoryEntry = z.infer<typeof accessHistoryEntrySchema>;

/** A page of history: its rows, the time they were read (PRD-PRF-004) and where the next page starts, if any. */
function pageOf<Entry extends z.ZodType>(entry: Entry) {
  return z.strictObject({ asOf: timestamp, entries: z.array(entry), next: historyCursorSchema.nullable() });
}

export const auditHistoryPageSchema = pageOf(auditHistoryEntrySchema);
export type AuditHistoryPage = z.infer<typeof auditHistoryPageSchema>;
export const accessHistoryPageSchema = pageOf(accessHistoryEntrySchema);
export type AccessHistoryPage = z.infer<typeof accessHistoryPageSchema>;

/** The history of one record, oldest first. */
export const recordHistoryQuerySchema = z.strictObject({
  recordType: z.string().min(1),
  recordId: z.uuid(),
  after: historyCursorSchema.optional(),
});

/** The history of one actor: what they changed, oldest first. */
export const actorHistoryQuerySchema = z.strictObject({
  actorId: z.uuid(),
  after: historyCursorSchema.optional(),
});

/** The access history report, newest first, of every user or of one. */
export const accessHistoryQuerySchema = z.strictObject({
  userId: z.uuid().optional(),
  before: historyCursorSchema.optional(),
});
