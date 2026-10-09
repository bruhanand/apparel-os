import {
  FAILED_JOB_PAGE_CAP,
  type FailedJob,
  type FailedJobOutcome,
  type FailedJobPageQuery,
} from '@apparel-os/schemas';
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
  position: string;
}

/** A page of failed jobs and where the next page starts, if any (code-house-rules 12.1 "Reads"). */
export interface FailedJobPage {
  readonly jobs: Omit<FailedJob, 'exception'>[];
  readonly next: string | null;
}

/**
 * A page of the failed jobs of the Organisation, newest first by failure time (creation time where none was
 * recorded), then by identifier, starting after the job the cursor names and holding at most `limit`, the cap when
 * left out (code-house-rules 12.1 "Reads"), with its diagnostic evidence: the queue, the consumer or job
 * kind, the event a delivery carried and its type, the attempts made and allowed, when it was created and failed, what
 * its last attempt came to and the error's class name. Identifiers, counts and times only: a job's data holds
 * identifiers only (12.9), and of its output only a known outcome and a class name are read, never a message
 * (PRD-SEC-014). The exception of each is the caller's to add.
 */
export async function listFailedJobs(
  context: TransactionContext,
  query: FailedJobPageQuery = {},
): Promise<FailedJobPage> {
  const limit = query.limit === undefined ? FAILED_JOB_PAGE_CAP : Number(query.limit);
  const before = query.before === undefined ? undefined : positionOf(query.before);
  const rows = await context.tx.execute<Row>(sql`
    select j.id::text as id, j.name, j.data, j.output, j.retry_count, j.retry_limit, j.created_on, j.completed_on,
           e.event_type,
           pg_catalog.to_char(coalesce(j.completed_on, j.created_on) at time zone 'UTC',
                              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '_' || j.id::text as position
      from pgboss.job j
      left join kernel.outbox_event e on e.id::text = j.data ->> 'eventId'
     where j.state = 'failed'
       ${
         before === undefined
           ? sql``
           : sql`and (coalesce(j.completed_on, j.created_on), j.id) < (${before.at}::timestamptz, ${before.id}::uuid)`
       }
     order by coalesce(j.completed_on, j.created_on) desc, j.id desc
     limit ${limit + 1}`);
  const page = rows.rows.slice(0, limit);
  const last = page.at(-1);
  return {
    jobs: page.map(jobOf),
    next: rows.rows.length > page.length && last !== undefined ? last.position : null,
  };
}

/** The cursor's failure time and job identifier. */
function positionOf(cursor: string): { at: string; id: string } {
  const split = cursor.lastIndexOf('_');
  return { at: cursor.slice(0, split), id: cursor.slice(split + 1) };
}

function jobOf(row: Row): Omit<FailedJob, 'exception'> {
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
