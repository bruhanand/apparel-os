import type { FailedJob, FailedJobOutcome } from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import type { TransactionContext } from '../command-runner/transaction-context.js';
import { OUTBOX_DELIVERY_QUEUE } from './worker.js';

// The failed jobs of the operations view (code-house-rules 12.9 "A failed job"; module-map 4.1; access-and-approvals
// 9.8 step 4; PRD-SEC-013, PRD-SEC-014; DEC-116; S1-F08-T04). A failed job's record is pg-boss's own row, which pg-boss
// never deletes while its `deleteAfterSeconds` is 0 (12.9 "Nothing deleted before CH-9"): checked against the pinned
// pg-boss 12.35.1, whose clean-up removes a failed job only when that setting is above 0. So a job failed for good is
// kept whether or not an exception could be raised for it, and so is one pg-boss failed itself for passing its active
// limit, which the step's handler never saw (RR-448).

/** pg-boss's output for an attempt it failed for passing its active limit (12.35.1, `failJobsByTimeout`). */
const ACTIVE_LIMIT_MESSAGE = 'job timed out';
const OUTCOMES = new Set<FailedJobOutcome>(['transient', 'defect', 'identity-not-enabled']);
/** An error's class name; anything else in the output is never shown (code-house-rules 12.11). */
const ERROR_NAME = /^[A-Za-z][A-Za-z0-9]{0,99}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Row extends Record<string, unknown> {
  id: string;
  name: string;
  data: unknown;
  output: unknown;
  retry_count: number;
  retry_limit: number;
  created_on: Date;
  completed_on: Date | null;
  event_type: string | null;
}

/**
 * Every failed job of the Organisation, newest first, with its diagnostic evidence: the queue, the consumer or job
 * kind, the event a delivery carried and its type, the attempts made and allowed, when it was created and failed, what
 * its last attempt came to and the error's class name. Identifiers, counts and times only: a job's data holds
 * identifiers only (12.9), and of its output only a known outcome and a class name are read, never a message
 * (PRD-SEC-014). The exception of each is the caller's to add.
 */
export async function listFailedJobs(context: TransactionContext): Promise<Omit<FailedJob, 'exception'>[]> {
  const rows = await context.tx.execute<Row>(sql`
    select j.id::text as id, j.name, j.data, j.output, j.retry_count, j.retry_limit, j.created_on, j.completed_on,
           e.event_type
      from pgboss.job j
      left join kernel.outbox_event e on e.id::text = j.data ->> 'eventId'
     where j.state = 'failed'
     order by j.completed_on desc nulls last, j.id desc`);
  return rows.rows.map((row) => {
    const data = objectOf(row.data);
    const output = objectOf(row.output);
    const delivery = row.name === OUTBOX_DELIVERY_QUEUE;
    const consumer = typeof data.consumer === 'string' && data.consumer !== '' ? data.consumer : null;
    const eventId = typeof data.eventId === 'string' && UUID.test(data.eventId) ? data.eventId : null;
    return {
      jobId: row.id,
      queue: row.name,
      jobKind: delivery && consumer !== null ? consumer : row.name,
      eventId,
      eventType: eventId === null ? null : row.event_type,
      attempts: row.retry_count + 1,
      attemptsAllowed: row.retry_limit + 1,
      createdAt: new Date(row.created_on).toISOString(),
      failedAt: row.completed_on === null ? null : new Date(row.completed_on).toISOString(),
      outcome: outcomeOf(output),
      errorName: typeof output.error === 'string' && ERROR_NAME.test(output.error) ? output.error : null,
    };
  });
}

function outcomeOf(output: Record<string, unknown>): FailedJobOutcome {
  if (typeof output.outcome === 'string' && OUTCOMES.has(output.outcome as FailedJobOutcome)) {
    return output.outcome as FailedJobOutcome;
  }
  const value = objectOf(output.value);
  return value.message === ACTIVE_LIMIT_MESSAGE ? 'active-limit-passed' : 'unknown';
}

function objectOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
