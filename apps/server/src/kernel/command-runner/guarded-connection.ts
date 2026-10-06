import type { PoolClient } from 'pg';
import { CommandDefect, databaseFailureOf, IN_FAILED_SQL_TRANSACTION, type DatabaseFailure } from './command-errors.js';

/**
 * `starting` until the transaction has begun, when only its BEGIN may run; `open` while the command's work runs, when
 * no statement may end or change the transaction; `closing` once the work returned or threw, when only the runner's
 * own COMMIT or ROLLBACK may run; `ended` once the transaction is over.
 */
type State = 'starting' | 'open' | 'closing' | 'ended';

type Query = (...args: unknown[]) => Promise<unknown>;

/**
 * What became of the transaction's COMMIT. `committed`: PostgreSQL answered COMMIT. `rolled-back`: PostgreSQL
 * confirmed the transaction did not commit, by answering ROLLBACK or by an error that means it rolled back.
 * `unknown`: COMMIT was sent and no answer confirms either, as when the connection is lost or a time limit or a
 * cancel fires while it is in flight (code-house-rules 12.3, 12.4 "An uncertain commit keeps the key").
 */
export type CommitOutcome = 'not-sent' | 'in-flight' | 'committed' | 'rolled-back' | 'unknown';

/**
 * The one connection a command runs on, taken from its Organisation's pool (code-house-rules 8.1). Every statement of
 * the command goes through `client`, which stands in for the connection:
 *
 * - It remembers every database error, even one a module catches and goes on from, so the runner can tell that
 *   PostgreSQL aborted the transaction and that COMMIT would silently roll it back.
 * - While the work runs, it refuses every statement that would end or change the command's transaction: COMMIT,
 *   ROLLBACK, BEGIN, START TRANSACTION, END, ABORT, PREPARE TRANSACTION and the two-phase COMMIT and ROLLBACK
 *   PREPARED, SET TRANSACTION and SET SESSION CHARACTERISTICS, and any text holding more than one statement. Only the
 *   savepoint statements Drizzle uses for a nested transaction pass (PRD-MOD-006, PRD-INT-004; code-house-rules 8.1).
 * - It refuses every statement once the command's work has ended, whoever kept a handle to the transaction, so no
 *   write can reach a connection that went back to the pool (code-house-rules 8.1).
 * - It records what became of COMMIT, so the runner never reports a commit it cannot confirm either way as rolled back.
 * - It tells the runner whether the connection is still sound, so a broken one is closed, never pooled again. It
 *   listens for the connection's own errors while the command holds it, which the pool does not.
 */
export class GuardedConnection {
  readonly client: PoolClient;
  private state: State = 'starting';
  private refusedControl = false;
  private readonly failures: (DatabaseFailure | undefined)[] = [];
  private broken = false;
  private commit: CommitOutcome = 'not-sent';
  private readonly onConnectionError = (): void => {
    this.broken = true;
  };

  constructor(
    private readonly raw: PoolClient,
    private readonly commandName: string,
  ) {
    raw.on('error', this.onConnectionError);
    const query: Query = (...args) => this.query(args);
    this.client = new Proxy(raw, {
      get: (target, property) => (property === 'query' ? query : (Reflect.get(target, property, target) as unknown)),
    });
  }

  /** The transaction has begun: the command's work may run its statements. */
  open(): void {
    if (this.state === 'starting') this.state = 'open';
  }

  /** Whether a statement that would end or change the transaction was refused while the work ran. */
  refusedTransactionControl(): boolean {
    return this.refusedControl;
  }

  /** The command's work has returned or thrown: from now on only the transaction's COMMIT or ROLLBACK may run. */
  close(): void {
    if (this.state === 'open') this.state = 'closing';
  }

  /**
   * Whether PostgreSQL has aborted the transaction, which happens when any statement failed outside a savepoint that
   * was rolled back. A trivial statement answers it: an aborted transaction refuses it with SQLSTATE 25P02.
   */
  async isAborted(): Promise<boolean> {
    try {
      await this.raw.query('select 1');
      return false;
    } catch (error) {
      if (databaseFailureOf(error)?.sqlState === IN_FAILED_SQL_TRANSACTION) return true;
      this.broken = true;
      throw error;
    }
  }

  /**
   * The database error that aborted the transaction: the last one remembered, leaving out the 25P02 refusals that
   * follow it. Undefined when none was remembered.
   */
  abortingFailure(): DatabaseFailure | undefined {
    for (let index = this.failures.length - 1; index >= 0; index -= 1) {
      const failure = this.failures[index];
      if (failure?.sqlState !== IN_FAILED_SQL_TRANSACTION) return failure;
    }
    return undefined;
  }

  /** What became of COMMIT. */
  commitOutcome(): CommitOutcome {
    return this.commit;
  }

  /**
   * Ends the command's use of the connection and gives it back to the pool, or destroys it when it may be broken or
   * the commit's outcome is not known. A destroyed connection keeps its error listener, so a late error of its socket
   * cannot end the process.
   */
  release(): void {
    this.state = 'ended';
    if (this.commit === 'unknown' || this.commit === 'in-flight') this.broken = true;
    if (!this.broken) this.raw.removeListener('error', this.onConnectionError);
    this.raw.release(this.broken ? true : undefined);
  }

  private query(args: unknown[]): Promise<unknown> {
    const text = statementText(args[0]);
    if (this.state === 'open' && text !== undefined && controlsTransaction(text)) {
      this.refusedControl = true;
      return Promise.reject(
        new CommandDefect(
          `Command ${this.commandName} sent a statement that would end or change its transaction; only the runner begins and ends it (PRD-MOD-006; code-house-rules 8.1)`,
        ),
      );
    }
    const allowed =
      this.state === 'open' ||
      (this.state === 'starting' && text?.startsWith('begin') === true) ||
      (this.state === 'closing' && (text === 'commit' || text === 'rollback'));
    if (!allowed) {
      return Promise.reject(
        new CommandDefect(
          `The transaction of command ${this.commandName} was used after the command's work ended (code-house-rules 8.1)`,
        ),
      );
    }
    if (typeof args.at(-1) === 'function') {
      return Promise.reject(new CommandDefect('A command runs its statements as promises, never with a callback'));
    }
    const closing = this.state === 'closing';
    const isCommit = closing && text === 'commit';
    if (isCommit) this.commit = 'in-flight';
    const pending = (this.raw.query as unknown as Query).apply(this.raw, args);
    return pending.then(
      (result: unknown) => {
        if (isCommit) this.commit = commitAnswer(result);
        return result;
      },
      (error: unknown) => {
        if (isCommit) this.commit = confirmsRollback(error) ? 'rolled-back' : 'unknown';
        throw this.failed(error, closing);
      },
    );
  }

  /** Remembers a failed statement and gives its error back. */
  private failed(error: unknown, closing: boolean): unknown {
    const failure = databaseFailureOf(error);
    // An error with no SQLSTATE, such as a lost connection, or a failed COMMIT or ROLLBACK, may leave the connection
    // unusable.
    if (failure === undefined || closing) this.broken = true;
    if (!closing) this.failures.push(failure);
    return error;
  }
}

/** PostgreSQL's command tag for COMMIT: `COMMIT` when it committed, `ROLLBACK` when the transaction was aborted. */
function commitAnswer(result: unknown): CommitOutcome {
  const tag = typeof result === 'object' && result !== null && 'command' in result ? result.command : undefined;
  return tag === 'COMMIT' ? 'committed' : tag === 'ROLLBACK' ? 'rolled-back' : 'unknown';
}

/**
 * Whether an error COMMIT answered means PostgreSQL rolled the transaction back: a deferred constraint that failed
 * (class 23) or a transaction rollback, such as a serialization failure (class 40). Any other error, a lost
 * connection, a time limit or a cancel (class 57) included, leaves the outcome unknown.
 */
function confirmsRollback(error: unknown): boolean {
  const sqlState = databaseFailureOf(error)?.sqlState;
  return sqlState !== undefined && (sqlState.startsWith('23') || sqlState.startsWith('40'));
}

const TRANSACTION_CONTROL =
  /^(commit|end|abort|begin|start\s+transaction|prepare\s+transaction|set\s+transaction|set\s+session\s+characteristics)\b/;
const ROLLBACK = /^rollback\b/;
const ROLLBACK_TO_SAVEPOINT = /^rollback\s+to\b/;

/**
 * Whether a statement would end or change the transaction it runs in. A text holding a second statement after a
 * semicolon counts, since PostgreSQL runs every statement of an unparameterised text. Leading comments are skipped.
 */
function controlsTransaction(text: string): boolean {
  let statement = text;
  for (;;) {
    const stripped = statement
      .replace(/^\s+/, '')
      .replace(/^--[^\n]*(\n|$)/, '')
      .replace(/^\/\*[\s\S]*?\*\//, '');
    if (stripped === statement) break;
    statement = stripped;
  }
  if (/;\s*\S/.test(statement)) return true;
  if (TRANSACTION_CONTROL.test(statement)) return true;
  return ROLLBACK.test(statement) && !ROLLBACK_TO_SAVEPOINT.test(statement);
}

function statementText(statement: unknown): string | undefined {
  const text =
    typeof statement === 'string'
      ? statement
      : typeof statement === 'object' && statement !== null && 'text' in statement && typeof statement.text === 'string'
        ? statement.text
        : undefined;
  return text?.trim().toLowerCase();
}
