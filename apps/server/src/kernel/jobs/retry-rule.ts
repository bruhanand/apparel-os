import {
  CommandCancelled,
  CommandOutcomeUnknown,
  CommandTimedOut,
  sqlStateOf,
} from '../command-runner/command-errors.js';
import { IdempotencyConflict } from '../idempotency/idempotency-errors.js';

/**
 * What the job runner does with a step that threw (code-house-rules 12.9 "The retry rule"). A refusal under the locks
 * is no throw: the step returns it, it is kept, and it is never retried. An outside system's uncertain outcome is
 * the owning module's to reconcile (12.10); no step in stage 1 calls one.
 *
 * - `retry`: something transient, retried up to the job kind's setting with its delays: a time limit of 5.1, a
 *   cancelled statement, a lost connection or a server shutting down, an outcome not known (the key is kept, so the
 *   retry is a replay if the first commit landed; 12.4), or the first delivery of the same event still running.
 * - `defect`: never retried and logged as a defect: a deadlock (8.1), an `AO` error (7.1), a schema mismatch, a key
 *   reused with other content, or anything unexpected.
 */
export type RetryRule = 'retry' | 'defect';

/** SQLSTATE classes and codes of a lost connection or a server going away. */
const TRANSIENT_SQLSTATE = /^(08...|57P0[123]|53300)$/;
/** node-postgres and Node's network errors for a lost connection, which carry no SQLSTATE. */
const TRANSIENT_NETWORK = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN']);
const ENDED_CONNECTION = /^Connection terminated|^Client has encountered a connection error/;

export function retryRuleOf(error: unknown): RetryRule {
  if (error instanceof CommandTimedOut || error instanceof CommandCancelled) return 'retry';
  if (error instanceof CommandOutcomeUnknown) return 'retry';
  if (error instanceof IdempotencyConflict) return error.code === 'kernel.request-in-progress' ? 'retry' : 'defect';
  const sqlState = sqlStateOf(error);
  if (sqlState !== undefined && TRANSIENT_SQLSTATE.test(sqlState)) return 'retry';
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && TRANSIENT_NETWORK.has(code)) return 'retry';
    if (ENDED_CONNECTION.test(error.message)) return 'retry';
  }
  return 'defect';
}
