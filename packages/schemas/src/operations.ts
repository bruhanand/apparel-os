import { z } from 'zod';
import { idSchema } from './common.js';

// Live updates and the operations view (code-house-rules 12.9, 12.12; deployment.md section 5; module-map 4.1;
// PRD-SEC-005, PRD-SEC-006, PRD-SEC-013, PRD-SEC-014; S1-F08-T04).

/** The record a live update is about: identifiers only, never a name, an amount or a restricted value (12.12). */
export const liveSubjectSchema = z.strictObject({
  module: z.string().min(1),
  recordType: z.string().min(1),
  /** Any UUID: a job pg-boss sent itself has one of version 4 (code-house-rules 12.9). */
  recordId: z.uuid(),
  versionId: z.uuid().optional(),
});

/**
 * One message of the live-update stream (code-house-rules 12.12): the data of an SSE message whose `id` is the outbox
 * event's identity and whose `event` is its type. An event carries only its type and subject; the browser marks the
 * record's cached reads stale and reads them again through the owning routes. `resync` says the stream could not
 * replay from the `Last-Event-ID` given, so the browser reads everything on screen again (deployment.md section 5).
 */
export const liveMessageSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('event'), type: z.string().min(1), subject: liveSubjectSchema }),
  z.strictObject({ kind: z.literal('resync') }),
]);
export type LiveMessage = z.infer<typeof liveMessageSchema>;

/** The SSE event name of a resync message. */
export const LIVE_RESYNC = 'resync';

/**
 * What the last attempt of a failed job came to (code-house-rules 12.9 "The retry rule"): a transient failure at its
 * last attempt; a defect, failed at once; its service identity not enabled; the attempt passed its active limit, as
 * when the worker stopped under it, which pg-boss fails without the step's handler seeing it (RR-448); or something
 * the job queue recorded that is none of these.
 */
export const failedJobOutcomeSchema = z.enum([
  'transient',
  'defect',
  'identity-not-enabled',
  'active-limit-passed',
  'unknown',
]);
export type FailedJobOutcome = z.infer<typeof failedJobOutcomeSchema>;

/**
 * One failed job and its diagnostic evidence (code-house-rules 12.9; PRD-SEC-013, PRD-SEC-014): identifiers, counts,
 * times and the error's class name only, never a secret, a restricted value or an error's message. The exception is
 * the unfinished operation raised for it, where one was (access-and-approvals 9.8 step 4; DEC-116).
 */
export const failedJobSchema = z.strictObject({
  /** pg-boss gives a job of its own sending a UUID of another version (version 4), so any UUID. */
  jobId: z.uuid(),
  queue: z.string().min(1),
  /** The consumer of a delivery, or the job kind. */
  jobKind: z.string().min(1),
  /** The outbox event a delivery carried, and its type; null for a job kind. */
  eventId: idSchema.nullable(),
  eventType: z.string().min(1).nullable(),
  attempts: z.int().min(1),
  attemptsAllowed: z.int().min(1),
  createdAt: z.iso.datetime({ offset: true }),
  failedAt: z.iso.datetime({ offset: true }).nullable(),
  outcome: failedJobOutcomeSchema,
  /** The class name of the error, such as `CommandTimedOut`; null where none was recorded. */
  errorName: z.string().min(1).nullable(),
  exception: z.strictObject({ exceptionId: idSchema, code: z.string().min(1) }).nullable(),
});
export type FailedJob = z.infer<typeof failedJobSchema>;

/** The operations view's list of failed jobs, newest first, with the time it was read (PRD-PRF-004). */
export const failedJobListSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  jobs: z.array(failedJobSchema),
});
export type FailedJobList = z.infer<typeof failedJobListSchema>;
