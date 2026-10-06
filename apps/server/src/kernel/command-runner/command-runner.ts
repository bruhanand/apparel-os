import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { StructuredLogger } from '../logging/pino-logger.service.js';
import type { RoutedOrganisation } from '../routing/organisation-router.js';
import { businessDateIn, isKnownTimezone } from '../time/business-date.js';
import type { Clock } from '../time/clock.js';
import type { OrganisationTimezoneSource } from '../time/organisation-timezone.js';
import {
  CommandCancelled,
  CommandDefect,
  CommandOutcomeUnknown,
  CommandTimedOut,
  databaseFailureOf,
  DEADLOCK_DETECTED,
  isStatementTimeout,
  LOCK_NOT_AVAILABLE,
  QUERY_CANCELED,
  type DatabaseFailure,
} from './command-errors.js';
import { isInsideCommand, runMarked } from './command-mark.js';
import { isCorrelationId } from './correlation.js';
import { GuardedConnection } from './guarded-connection.js';
import { takeLocks, type LockResult, type LockStep, type LockTarget } from './lock-helper.js';
import type { ActorSetting, BusinessDate, Transaction, TransactionContext } from './transaction-context.js';

/** One command or read, as the runner is asked to run it. */
export interface CommandRequest {
  /** The command's name, such as `access.submit-role-assignment`. */
  readonly commandName: string;
  /** The Organisation the request was routed to, with its own database (module-map 4.1; PRD-MOD-001). */
  readonly organisation: RoutedOrganisation;
  /** The request's or job's correlation identifier (code-house-rules 12.11). */
  readonly correlationId: string;
  readonly actor: ActorSetting;
}

export interface CommandRunnerDependencies {
  readonly clock: Clock;
  readonly timezones: OrganisationTimezoneSource;
  /** The application's logger (LOGGER), so each line carries the correlation identifier as a field of its own. */
  readonly logger: StructuredLogger;
}

/**
 * The transaction was aborted by a database error the command's code caught and went on from, so COMMIT would only
 * have rolled it back. Internal to the runner, which turns it into what the caller sees.
 */
/** COMMIT got an answer that confirms neither outcome. Internal to the runner, which reports the outcome unknown. */
class UncertainCommit extends Error {
  constructor() {
    super('COMMIT got an answer that confirms neither outcome');
  }
}

class AbortedTransaction extends Error {
  constructor(readonly failure: DatabaseFailure | undefined) {
    super('The transaction was aborted by a database error the command caught');
  }
}

const CONTEXT = 'CommandRunner';
const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COMMAND_NAME = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

/**
 * The command runner (code-house-rules 8.1; module-map 4.1 "Transaction context"). One command is one database
 * transaction in the Organisation's own database; every module the command calls joins it through the context it is
 * given, and never opens or commits its own (PRD-MOD-006, PRD-INT-004; module-map section 3, rule 3). All its writes
 * commit together, or none do.
 *
 * - Isolation is READ COMMITTED, with explicit row locks through the lock helper (code-house-rules 8.1, 8.2;
 *   PRD-INT-003). A read runs in a READ ONLY transaction.
 * - The actor is set at the start of every transaction, reads included, with set_config('aos.actor_id', id, true):
 *   local to the transaction, so a pooled connection never carries it into the next one. Nothing sets it for the
 *   session. With no actor, which only the paths of 6.3 allow, row-level security shows no scoped row
 *   (code-house-rules 6.2, 6.3; access-and-approvals 7.2; PRD-SEC-005).
 * - A command that reaches the runtime role's lock_timeout or statement_timeout rolls back and fails with
 *   CommandTimedOut (code-house-rules 5.1; DEC-112, CH-3), even when its code caught the error: before COMMIT the
 *   runner asks PostgreSQL whether the transaction was aborted, since COMMIT would answer an aborted transaction by
 *   rolling it back without an error. Any other database error caught that way is a defect. A cancelled statement
 *   is CommandCancelled. A deadlock is logged as a defect and never retried (8.1).
 * - The command runs on one connection of the Organisation's pool, and no statement reaches it through the command's
 *   handles once the work has ended.
 * - It reports success only when PostgreSQL answered COMMIT, and a rollback only when one is confirmed. When COMMIT
 *   was sent and nothing confirms either outcome (a lost connection, a time limit or a cancel while it is in flight),
 *   it reports CommandOutcomeUnknown and destroys the connection (code-house-rules 12.3, 12.4).
 * - When the work fails and its ROLLBACK then fails too, as when the connection is lost, nothing committed: the work's
 *   own failure is reported, with the ROLLBACK's error beside it as its non-enumerable `rollbackError`.
 * - The work runs under the mark of code-house-rules 8.3, so no outside system is called inside the transaction.
 *
 * The idempotency key (S1-F01-T04), availability and Authorise (T11), audit (T07) and the outbox (T06) join the
 * steps of module-map 6.1 as their tasks add them.
 */
export class CommandRunner {
  constructor(private readonly dependencies: CommandRunnerDependencies) {}

  /** Runs a command: one READ WRITE transaction. */
  run<T>(request: CommandRequest, work: (context: TransactionContext) => Promise<T>): Promise<T> {
    return this.execute(request, false, work);
  }

  /** Runs a read: one READ ONLY transaction with the actor set as for a command (code-house-rules 8.1). */
  read<T>(request: CommandRequest, work: (context: TransactionContext) => Promise<T>): Promise<T> {
    return this.execute(request, true, work);
  }

  private async execute<T>(
    request: CommandRequest,
    readOnly: boolean,
    work: (context: TransactionContext) => Promise<T>,
  ): Promise<T> {
    if (isInsideCommand()) {
      throw new CommandDefect(
        `Command ${request.commandName} was started inside another command; a called module joins the caller's transaction through its context and never opens its own (PRD-MOD-006; code-house-rules 8.1)`,
      );
    }
    checkRequest(request);
    const startedAt = this.dependencies.clock.now();
    let connection: GuardedConnection | undefined;
    let bodyFailure: { readonly error: unknown } | undefined;
    try {
      connection = new GuardedConnection(await request.organisation.db.$client.connect(), request.commandName);
      const guarded = connection;
      const db = drizzle({ client: guarded.client });
      const result = await runMarked(request.commandName, () =>
        db.transaction(
          async (tx) => {
            guarded.open();
            try {
              if (request.actor.kind === 'actor') {
                await tx.execute(sql`select set_config('aos.actor_id', ${request.actor.actorId}, true)`);
              }
              const context = new CommandContext(request, readOnly, startedAt, tx, this.dependencies.timezones);
              let result: T;
              try {
                result = await work(context);
              } finally {
                context.end();
                guarded.close();
              }
              if (guarded.refusedTransactionControl()) {
                throw new CommandDefect(
                  `Command ${request.commandName} tried to end or change its own transaction; everything it did is rolled back (PRD-MOD-006)`,
                );
              }
              if (await guarded.isAborted()) throw new AbortedTransaction(guarded.abortingFailure());
              return result;
            } catch (error) {
              // Kept so that a ROLLBACK that fails after it cannot hide it.
              bodyFailure = { error };
              throw error;
            }
          },
          { isolationLevel: 'read committed', accessMode: readOnly ? 'read only' : 'read write' },
        ),
      );
      // Success only when PostgreSQL answered COMMIT. A COMMIT answered ROLLBACK is a confirmed rollback.
      const outcome = guarded.commitOutcome();
      if (outcome === 'committed') return result;
      if (outcome === 'rolled-back') throw new AbortedTransaction(guarded.abortingFailure());
      if (outcome === 'not-sent') throw new CommandDefect('The transaction ended without a COMMIT');
      throw new UncertainCommit();
    } catch (error) {
      const outcome = connection?.commitOutcome();
      if (outcome === 'unknown' || outcome === 'in-flight') throw this.outcomeUnknown(request, error);
      if (bodyFailure !== undefined && error !== bodyFailure.error) {
        // The work failed, then its ROLLBACK failed too, as when the connection was lost. No COMMIT was sent, so
        // nothing committed: the work's own failure is what is reported, and the ROLLBACK's is kept beside it.
        throw this.rollbackFailed(request, bodyFailure.error, error);
      }
      throw this.failure(request, error);
    } finally {
      connection?.release();
    }
  }

  private rollbackFailed(request: CommandRequest, workError: unknown, rollbackError: unknown): unknown {
    this.dependencies.logger.structured(
      'error',
      {
        correlationId: request.correlationId,
        organisationCode: request.organisation.organisationCode,
        command: request.commandName,
        rollbackSqlState: databaseFailureOf(rollbackError)?.sqlState,
      },
      'ROLLBACK failed after the command failed; no COMMIT was sent, so nothing committed; the connection is closed',
      CONTEXT,
    );
    const reported = this.failure(request, workError);
    if (reported instanceof Error && Object.isExtensible(reported) && !('rollbackError' in reported)) {
      Object.defineProperty(reported, 'rollbackError', { value: rollbackError, enumerable: false });
    }
    return reported;
  }

  private outcomeUnknown(request: CommandRequest, error: unknown): CommandOutcomeUnknown {
    this.dependencies.logger.structured(
      'error',
      {
        correlationId: request.correlationId,
        organisationCode: request.organisation.organisationCode,
        command: request.commandName,
        sqlState: databaseFailureOf(error)?.sqlState,
      },
      'Whether the command committed is not known: COMMIT got no answer that confirms either; the connection is closed',
      CONTEXT,
    );
    return new CommandOutcomeUnknown(request.correlationId);
  }

  private failure(request: CommandRequest, error: unknown): unknown {
    const caught = error instanceof AbortedTransaction;
    const failure = caught ? error.failure : databaseFailureOf(error);
    const fields = {
      correlationId: request.correlationId,
      organisationCode: request.organisation.organisationCode,
      command: request.commandName,
      sqlState: failure?.sqlState,
      caughtByCommand: caught,
    };
    const log = this.dependencies.logger;
    if (failure?.sqlState === LOCK_NOT_AVAILABLE || (failure !== undefined && isStatementTimeout(failure))) {
      const limit = failure.sqlState === LOCK_NOT_AVAILABLE ? 'lock' : 'statement';
      log.structured(
        'warn',
        { ...fields, limit },
        `The command reached the ${limit} time limit and rolled back`,
        CONTEXT,
      );
      return new CommandTimedOut(limit, failure.sqlState, request.correlationId);
    }
    if (failure?.sqlState === QUERY_CANCELED) {
      log.structured('warn', fields, 'A statement of the command was cancelled; the command rolled back', CONTEXT);
      return new CommandCancelled(request.correlationId);
    }
    if (failure?.sqlState === DEADLOCK_DETECTED) {
      log.structured(
        'error',
        fields,
        'Deadlock, a defect of the lock order (code-house-rules 8.1, 8.2); rolled back and not retried',
        CONTEXT,
      );
    }
    if (caught) {
      log.structured(
        'error',
        fields,
        'The command caught a database error and went on; PostgreSQL had aborted the transaction, and it rolled back',
        CONTEXT,
      );
      return new CommandDefect(
        `Command ${request.commandName} caught a database error${failure === undefined ? '' : ` (SQLSTATE ${failure.sqlState})`} and went on; the transaction was aborted and everything it did rolled back`,
        failure?.sqlState,
      );
    }
    return error;
  }
}

function checkRequest(request: CommandRequest): void {
  if (!COMMAND_NAME.test(request.commandName)) {
    throw new CommandDefect('A command is named <unit>.<verb-and-record>, in lower case');
  }
  if (!isCorrelationId(request.correlationId)) {
    throw new CommandDefect('A command needs the correlation identifier the server made for it (a UUIDv7)');
  }
  if (request.actor.kind === 'actor' && !UUIDV7.test(request.actor.actorId)) {
    throw new CommandDefect('An actor is named by its identifier, a UUIDv7 (PRD-MOD-008)');
  }
}

class CommandContext implements TransactionContext {
  readonly commandName: string;
  readonly organisationCode: string;
  readonly correlationId: string;
  readonly actor: ActorSetting;
  private lastLockStep: LockStep | undefined;
  private ended = false;

  constructor(
    request: CommandRequest,
    readonly readOnly: boolean,
    readonly startedAt: Date,
    private readonly transaction: Transaction,
    private readonly timezones: OrganisationTimezoneSource,
  ) {
    this.commandName = request.commandName;
    this.organisationCode = request.organisation.organisationCode;
    this.correlationId = request.correlationId;
    this.actor = request.actor;
  }

  get tx(): Transaction {
    this.refuseIfEnded();
    return this.transaction;
  }

  async lock(step: LockStep, targets: readonly LockTarget[]): Promise<LockResult> {
    this.refuseIfEnded();
    if (this.readOnly) {
      throw new CommandDefect('A read takes no row lock; PostgreSQL refuses one in a READ ONLY transaction');
    }
    if (this.lastLockStep !== undefined && step <= this.lastLockStep) {
      // A step's rows are never taken in two calls, so two commands can never take them in different orders
      // (code-house-rules 8.2; PRD-INT-003).
      throw new CommandDefect(
        `Lock step ${String(step)} was asked for after step ${String(this.lastLockStep)}; each step is locked once, in ascending order (code-house-rules 8.2)`,
      );
    }
    this.lastLockStep = step;
    return takeLocks(this.transaction, targets);
  }

  async businessDate(at: Date = this.startedAt): Promise<BusinessDate> {
    this.refuseIfEnded();
    const setting = await this.timezones.read(this, at);
    if (setting.kind === 'not-set') return { kind: 'not-set' };
    if (!isKnownTimezone(setting.timezone)) {
      throw new CommandDefect('The Organisation timezone setting holds a timezone that cannot be read');
    }
    return {
      kind: 'set',
      date: businessDateIn(at, setting.timezone),
      timezone: setting.timezone,
      timezoneVersionId: setting.versionId,
    };
  }

  /** Called by the runner when the work returns or throws: the transaction is over. */
  end(): void {
    this.ended = true;
  }

  private refuseIfEnded(): void {
    if (this.ended) throw new CommandDefect(`The context of command ${this.commandName} was used after it ended`);
  }
}
