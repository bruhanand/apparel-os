import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TransactionContext } from '../command-runner/transaction-context.js';
import { outboxEvent } from '../db/schema.js';
import { defineEvent, scopeFactsOf, type EventScopeFacts } from '../outbox/event-definition.js';

// How a job that fails for good reaches `exceptions` (code-house-rules 12.9 "A failed job"; access-and-approvals 9.8
// step 4; module-map section 3, rule 4; S1-F08-T02). `kernel` reaches a higher module only by an event or a contract:
// the worker publishes `kernel.job-failed` once per failed job, and `exceptions` consumes it.

/**
 * A job failed for good: its last attempt failed, or it failed at once as a defect (code-house-rules 12.9). The subject
 * is the job (`kernel.job`, its identifier); the payload names its kind, a consumer or a job kind, and the event it was
 * delivering, if any. Its scope facts are those of that event, so the exception has the Site of the work that failed,
 * and none when the work had none, such as a job kind of the Organisation as a whole.
 */
export const jobFailed = defineEvent({
  type: 'kernel.job-failed',
  version: 1,
  payload: z.strictObject({
    jobId: z.uuid(),
    jobKind: z.string().min(1),
    eventId: z.uuid().nullable(),
  }),
});

/** The record type of a job as an event's subject and an exception's link. */
export const JOB_RECORD_TYPE = 'kernel.job';

/** The scope facts of an outbox event, read in the transaction (code-house-rules 12.8). */
export async function eventScopeFacts(context: TransactionContext, eventId: string): Promise<EventScopeFacts> {
  const row = (await context.tx.select().from(outboxEvent).where(eq(outboxEvent.id, eventId)))[0];
  if (row === undefined) return {};
  // The work's own facts; whose record it was (`subjectUserId`) is no fact of the failure.
  const { siteId, storeId, businessUnitId, legalEntityId, brandId } = row;
  return scopeFactsOf({ siteId, storeId, businessUnitId, legalEntityId, brandId });
}

/** The state of a job as pg-boss keeps it (code-house-rules 12.9), or undefined when no job has that identifier. */
export type JobState = 'created' | 'retry' | 'active' | 'completed' | 'cancelled' | 'failed';

/**
 * The state of one job, read from pg-boss's table in the command's transaction: what the resolution check of an
 * unfinished operation asks, since a failed job that an operator runs again keeps its identifier (S1-F08-T04).
 */
export async function jobState(context: TransactionContext, jobId: string): Promise<JobState | undefined> {
  const rows = await context.tx.execute<{ state: JobState }>(
    sql`select state::text as state from pgboss.job where id = ${jobId}::uuid`,
  );
  return rows.rows[0]?.state;
}
