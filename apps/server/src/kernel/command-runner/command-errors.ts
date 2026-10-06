/**
 * A command reached a time limit of the runtime role and rolled back (code-house-rules 5.1; DEC-112, CH-3). Nothing
 * it did is kept, so the same request may be sent again. Its kind and code are those of the error envelope
 * (code-house-rules 12.3), which `S1-F01-T05` declares in `packages/schemas` and answers with status 503.
 *
 * It holds the SQLSTATE only, never the database's message or parameters (code-house-rules 12.11).
 */
export class CommandTimedOut extends Error {
  readonly kind = 'timed-out';
  readonly code = 'kernel.timed-out';

  constructor(
    /** `lock`: lock_timeout was reached (55P03). `statement`: statement_timeout was reached (57014). */
    readonly limit: 'lock' | 'statement',
    readonly sqlState: string,
    readonly correlationId: string,
  ) {
    super(`The command reached the ${limit} time limit and rolled back (SQLSTATE ${sqlState})`);
    this.name = 'CommandTimedOut';
  }
}

/**
 * Whether the command's transaction committed is not known: the connection was lost, or a time limit or a cancel
 * fired, while COMMIT was in flight, or COMMIT failed in a way that does not confirm a rollback (code-house-rules
 * 12.3, 12.4 "An uncertain commit keeps the key"). The caller must not treat the work as done or as not done; the
 * client sends the same idempotency key again. Its kind and code are those of the error envelope (12.3).
 */
export class CommandOutcomeUnknown extends Error {
  readonly kind = 'failed';
  readonly code = 'kernel.outcome-unknown';

  constructor(readonly correlationId: string) {
    super('Whether the command committed is not known');
    this.name = 'CommandOutcomeUnknown';
  }
}

/**
 * A command's statement was cancelled, as by an operator's pg_cancel_backend, not by a time limit (SQLSTATE 57014
 * without the statement-timeout message). The command rolled back. Its kind and code are those of an unexpected
 * failure in the error envelope (code-house-rules 12.3); nothing is said of its cause.
 */
export class CommandCancelled extends Error {
  readonly kind = 'failed';
  readonly code = 'kernel.failed';

  constructor(readonly correlationId: string) {
    super('A statement of the command was cancelled and the command rolled back (SQLSTATE 57014)');
    this.name = 'CommandCancelled';
  }
}

/**
 * A command broke a rule of the runner itself, such as taking a lock step out of order or opening a transaction of
 * its own inside another command. It is a defect, never a refusal a person can act on (code-house-rules 8.1, 8.2).
 */
export class CommandDefect extends Error {
  constructor(
    message: string,
    /** The SQLSTATE of the database error behind it, where there is one. */
    readonly sqlState?: string,
  ) {
    super(message);
    this.name = 'CommandDefect';
  }
}

/** SQLSTATE 55P03 lock_not_available: lock_timeout was reached (or a NOWAIT lock was refused). */
export const LOCK_NOT_AVAILABLE = '55P03';
/** SQLSTATE 57014 query_canceled: statement_timeout was reached (or the statement was cancelled). */
export const QUERY_CANCELED = '57014';
/** SQLSTATE 40P01 deadlock_detected: with the lock order of code-house-rules 8.2 this means a rule was broken. */
export const DEADLOCK_DETECTED = '40P01';
/** SQLSTATE 25P02 in_failed_sql_transaction: the transaction was aborted by an earlier error. */
export const IN_FAILED_SQL_TRANSACTION = '25P02';

/**
 * A database error as the runner reads it: its SQLSTATE, and PostgreSQL's message, which only tells a statement
 * timeout from a cancel and is never logged or answered (code-house-rules 12.11).
 */
export interface DatabaseFailure {
  readonly sqlState: string;
  readonly message: string;
}

/** The database error in an error, looking through the causes a library wraps it in; undefined for any other error. */
export function databaseFailureOf(error: unknown): DatabaseFailure | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    if ('code' in current && typeof current.code === 'string' && /^[0-9A-Z]{5}$/.test(current.code)) {
      return { sqlState: current.code, message: current.message };
    }
    current = current.cause;
  }
  return undefined;
}

/** The SQLSTATE of a database error, looking through the causes a library wraps it in; undefined for any other error. */
export function sqlStateOf(error: unknown): string | undefined {
  return databaseFailureOf(error)?.sqlState;
}

/**
 * Whether a 57014 came from statement_timeout rather than a cancel. PostgreSQL gives both one SQLSTATE and tells them
 * apart only in its message, "canceling statement due to statement timeout" against "… due to user request". The
 * message is PostgreSQL's English one; a server whose lc_messages is another language reads as a cancel, so the
 * command is never wrongly offered for a retry.
 */
export function isStatementTimeout(failure: DatabaseFailure): boolean {
  return failure.sqlState === QUERY_CANCELED && failure.message.includes('statement timeout');
}
