import { z } from 'zod';
import { businessDateSchema, idSchema, paiseSchema } from './common.js';
import { evidenceListSchema } from './files.js';
import { settingOriginSchema } from './settings.js';

// Exceptions (access-and-approvals 12, 14; module-map 4.13; PRD-EXC-001 to PRD-EXC-004, POL-02.16, POL-03.04,
// POL-03.05; S1-F08-T02). No schema here carries a default: owners, due times and escalation are KDPS's (V-03) and
// every one comes from a routing version (code-house-rules 12.14).

/**
 * The kinds of exception the PRD names (`PRD-EXC-001`), and source conflict (`POL-03.04`). A raising module registers
 * each type it raises under one of them (access-and-approvals 12.1).
 */
export const exceptionCategorySchema = z.enum([
  'shortage',
  'excess',
  'damage',
  'mismatch',
  'transit-gap',
  'cash-variance',
  'uncertain-payment',
  'missing-report',
  'unfinished-operation',
  'source-conflict',
]);
export type ExceptionCategory = z.infer<typeof exceptionCategorySchema>;

/** A type's code: `<module>.<name>`, such as `exceptions.unfinished-operation`. */
export const exceptionTypeCodeSchema = z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/);

/** The exposure of an exception: an amount in paise, or Unknown, never zero (PRD-EXC-001, PRD-MOD-015). */
export const exceptionExposureSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unknown') }),
  z.strictObject({ kind: z.literal('known'), amount: paiseSchema }),
]);
export type ExceptionExposure = z.infer<typeof exceptionExposureSchema>;

/**
 * Who owns an exception or receives its escalation (access-and-approvals 12.2): a named user, or a role within the
 * Site's scope, in the My work of each holder until one takes it.
 */
export const exceptionPartySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('user'), userId: idSchema }),
  z.strictObject({ kind: z.literal('role'), roleId: idSchema }),
]);
export type ExceptionParty = z.infer<typeof exceptionPartySchema>;

/** A party with the name the reader sees: a user's display name, a role's code. */
export const namedPartySchema = z.strictObject({
  party: exceptionPartySchema,
  name: z.string().min(1).nullable(),
});

/**
 * A due-time rule, in a versioned format (access-and-approvals 12.2; S1-F08-T02). `elapsed-minutes-v1`: due a whole
 * number of minutes after the exception is raised. The number is KDPS's (V-03); none is a default.
 */
export const dueRuleSchema = z.discriminatedUnion('format', [
  z.strictObject({ format: z.literal('elapsed-minutes-v1'), minutes: z.number().int().positive() }),
]);
export type DueRule = z.infer<typeof dueRuleSchema>;

/**
 * A new routing version for an exception type at a Site, or with no Site for exceptions that have none, such as a
 * failed job of the Organisation as a whole (access-and-approvals 12.2; POL-02.16). Once a different authorised person
 * approves it, it takes effect from its first day, today or later, and ends the version before it there
 * (code-house-rules 7.3).
 */
export const routingVersionDraftSchema = z.strictObject({
  typeCode: exceptionTypeCodeSchema,
  siteId: idSchema.nullable(),
  owner: exceptionPartySchema,
  dueRule: dueRuleSchema,
  escalation: exceptionPartySchema,
  validFrom: businessDateSchema,
  origin: settingOriginSchema,
});
export type RoutingVersionDraft = z.infer<typeof routingVersionDraftSchema>;

export const routingVersionPreparedSchema = z.strictObject({
  routingId: idSchema,
  versionId: idSchema,
  requestId: idSchema,
});

/** A registered exception type (access-and-approvals 12.1). */
export const exceptionTypeViewSchema = z.strictObject({
  code: exceptionTypeCodeSchema,
  category: exceptionCategorySchema,
  module: z.string().min(1),
});

/** Setup › Exception rules: every registered type, and every routing with its versions (12.2; PRD-MOD-010). */
export const routingListSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  types: z.array(exceptionTypeViewSchema),
  routings: z.array(
    z.strictObject({
      id: idSchema,
      typeCode: exceptionTypeCodeSchema,
      siteId: idSchema.nullable(),
      versions: z.array(
        z.strictObject({
          id: idSchema,
          owner: namedPartySchema,
          dueRule: dueRuleSchema,
          escalation: namedPartySchema,
          validFrom: businessDateSchema,
          validUntil: businessDateSchema.nullable(),
          origin: settingOriginSchema,
          /** The version's state (design-language 7): its decision, then its dates against today. */
          state: z.enum(['Awaiting approval', 'Superseded', 'Rejected', 'Scheduled', 'In force', 'Ended']),
          /** Its latest approval request, for the approval panel (access-and-approvals 9.1). */
          requestId: idSchema.nullable(),
        }),
      ),
    }),
  ),
});
export type RoutingList = z.infer<typeof routingListSchema>;

/** A record an exception is about, and its version where it has one (12.1). */
export const exceptionLinkSchema = z.strictObject({
  module: z.string().min(1),
  recordType: z.string().min(1),
  recordId: z.uuid(),
  versionId: z.uuid().nullable(),
});
export type ExceptionLink = z.infer<typeof exceptionLinkSchema>;

/** The states of an exception (DEC-105, DM-4; design-language section 7). Overdue is shown beside them. */
export const exceptionStateSchema = z.enum(['Unresolved', 'Resolved', 'Closed', 'Reopened']);

/**
 * One event of an exception's history (13.3): raised, assigned, comment, evidence, escalated, resolved, closed,
 * reopened. An evidence event names the attachment of the stored file it added, read through files-imports
 * (S1-F08-T03; imports-and-opening-data 11); every other event names none.
 */
export const exceptionEventViewSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(['raised', 'assigned', 'comment', 'evidence', 'escalated', 'resolved', 'closed', 'reopened']),
  at: z.iso.datetime({ offset: true }),
  byName: z.string().min(1).nullable(),
  to: namedPartySchema.nullable(),
  comment: z.string().min(1).nullable(),
  attachmentId: idSchema.nullable(),
});

/** An exception as the record drawer shows it (access-and-approvals 12, 14). */
export const exceptionViewSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  id: idSchema,
  code: z.string().min(1),
  type: exceptionTypeViewSchema,
  state: exceptionStateSchema,
  overdue: z.boolean(),
  owner: namedPartySchema,
  dueAt: z.iso.datetime({ offset: true }),
  exposure: exceptionExposureSchema,
  siteId: idSchema.nullable(),
  storeId: idSchema.nullable(),
  businessUnitId: idSchema.nullable(),
  brandId: idSchema.nullable(),
  links: z.array(exceptionLinkSchema),
  earlierExceptionCode: z.string().min(1).nullable(),
  events: z.array(exceptionEventViewSchema),
  /** What the reader may do now, as the owner, a holder of the owning role, or an authorised person. */
  mayAct: z.boolean(),
  mayTake: z.boolean(),
});
export type ExceptionView = z.infer<typeof exceptionViewSchema>;

/** A person raising an exception (POL-03.04; access-and-approvals 12.1). */
export const raiseRequestSchema = z.strictObject({
  typeCode: exceptionTypeCodeSchema,
  siteId: idSchema.nullable(),
  storeId: idSchema.nullable(),
  businessUnitId: idSchema.nullable(),
  brandId: idSchema.nullable(),
  links: z.array(exceptionLinkSchema).min(1),
  exposure: exceptionExposureSchema,
  comment: z.string().trim().min(1).max(2000).nullable(),
});
export type RaiseRequest = z.infer<typeof raiseRequestSchema>;

export const raisedSchema = z.strictObject({ exceptionId: idSchema, code: z.string().min(1) });

export const exceptionParamsSchema = z.strictObject({ exceptionId: idSchema });

export const commentRequestSchema = z.strictObject({ comment: z.string().trim().min(1).max(2000) });
export const reassignRequestSchema = z.strictObject({ to: exceptionPartySchema });
export const noBodySchema = z.strictObject({});
export const exceptionChangedSchema = z.strictObject({ exceptionId: idSchema, state: exceptionStateSchema });
/** Evidence added to an open exception (12.3; POL-03.05; S1-F08-T03): stored files, each stored first. */
export const exceptionEvidenceRequestSchema = z.strictObject({ evidence: evidenceListSchema });
/** What adding evidence answers: the attachment of each file, in the order given. */
export const exceptionEvidenceAddedSchema = z.strictObject({
  exceptionId: idSchema,
  state: exceptionStateSchema,
  attachmentIds: z.array(idSchema).min(1),
});

/**
 * The read model (access-and-approvals 12.3; PRD-EXC-004): the open exceptions the reader's scope covers, by Store,
 * brand and type, with their known exposure, the number of Unknown exposures counted apart, never as zero
 * (PRD-MOD-015), and the repeats, the exceptions linked to an earlier one of their type on the same record.
 */
export const openExceptionsSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  rows: z.array(
    z.strictObject({
      storeId: idSchema.nullable(),
      brandId: idSchema.nullable(),
      typeCode: exceptionTypeCodeSchema,
      open: z.number().int().nonnegative(),
      /** The sum of the known exposures; null when every exposure of the group is Unknown, never zero for them. */
      knownExposure: paiseSchema.nullable(),
      unknownExposures: z.number().int().nonnegative(),
      repeats: z.number().int().nonnegative(),
    }),
  ),
});
export type OpenExceptions = z.infer<typeof openExceptionsSchema>;
