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

/**
 * The largest page of the failed jobs: a technical cap the builders set (code-house-rules 12.1 "Reads"), not a KDPS
 * value. A longer list is read page by page with the cursor.
 */
export const FAILED_JOB_PAGE_CAP = 100;

/**
 * Where the next page of failed jobs starts: the last job's failure time (its creation time where none was recorded),
 * in UTC to the microsecond, `_`, and its identifier. Opaque to the screen, which only hands back the `next` it was
 * given.
 */
export const failedJobCursorSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

/**
 * A page of the failed jobs (code-house-rules 12.1): newest first, starting after the job `before` names, at most
 * `limit` of them (the cap when left out).
 */
export const failedJobPageQuerySchema = z.strictObject({
  before: failedJobCursorSchema.optional(),
  limit: z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine((limit) => Number(limit) <= FAILED_JOB_PAGE_CAP, { message: `At most ${String(FAILED_JOB_PAGE_CAP)}` })
    .optional(),
});
export type FailedJobPageQuery = z.infer<typeof failedJobPageQuerySchema>;

/**
 * A page of the operations view's failed jobs, newest first, with the time it was read (PRD-PRF-004) and where the
 * next page starts, if any.
 */
export const failedJobListSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  jobs: z.array(failedJobSchema),
  next: failedJobCursorSchema.nullable(),
});
export type FailedJobList = z.infer<typeof failedJobListSchema>;
