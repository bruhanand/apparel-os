import { uuidv7 } from '@apparel-os/domain';
import { and, eq, sql } from 'drizzle-orm';
import { CommandDefect, sqlStateOf } from '../command-runner/command-errors.js';
import type { CommandRequest, CommandRunner } from '../command-runner/command-runner.js';
import type { TransactionContext } from '../command-runner/transaction-context.js';
import { idempotencyConflict, idempotencyKey, idempotencyResult } from '../db/schema.js';
import type { StructuredLogger } from '../logging/pino-logger.service.js';
import {
  canonicalJson,
  checkKeptAnswer,
  formWithEncryptedLeaves,
  prepareRequest,
  type JsonValue,
  type PreparedRequest,
  type RequestContent,
} from './canonical-form.js';
import type {
  CommandRefusal,
  KeptOutcome,
  KeptRefusalKind,
  ReplayAccessRefusal,
  ReplayAuthorisation,
  ReplaySecretCheck,
  RestrictedValueCipher,
} from './contracts.js';
import { IdempotencyConflict, type IdempotencyConflictCode } from './idempotency-errors.js';

/**
 * What a command's work decides (code-house-rules 12.3, 12.4).
 *
 * - `success`: the answer as sent, which holds only identifiers, versions, states and version tokens, never a
 *   restricted value (12.4 "Storage"). `shows` is always stated: `secret` for an answer that shows a secret once
 *   (12.6; DEC-113) and `restricted-value` for one that shows a restricted value unmasked (12.1; DEC-114); of those
 *   only the fact is kept. `credentialIds` names the credentials the command wrote, which are never sent (12.5).
 * - `refusal`: a refusal the command decides. It is kept under the key, unless it was caused by a secret, such as a
 *   wrong or stale authenticator code or a password the password rules refuse (12.3, 12.5), when the whole
 *   transaction rolls back and the key stays unused.
 */
export type CommandOutcome<Answer extends JsonValue> =
  | {
      readonly kind: 'success';
      readonly answer: Answer;
      readonly shows: 'nothing' | 'secret' | 'restricted-value';
      readonly credentialIds?: readonly string[];
    }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal; readonly causedBySecret: boolean };

/**
 * What the helper answers. A `conflict` is thrown as IdempotencyConflict; a time limit, a failure and an outcome not
 * known are thrown by the command runner as for any command (CommandTimedOut, CommandOutcomeUnknown, …).
 *
 * - `replayed` is true when the answer is the one kept under the key, sent with `Idempotent-Replayed: true`.
 * - `kept` says whether a refusal is kept under the key. A refusal of a replay's access checks is not; it is the
 *   answer any request failing them gets (12.4 "Replay").
 */
export type IdempotentAnswer<Answer extends JsonValue> =
  | { readonly kind: 'success'; readonly answer: Answer; readonly replayed: boolean }
  | {
      readonly kind: 'refusal';
      readonly refusal: CommandRefusal | ReplayAccessRefusal;
      readonly replayed: boolean;
      readonly kept: boolean;
    };

/** One command run under an idempotency key. */
export interface IdempotentCommand<Answer extends JsonValue> {
  /** The `Idempotency-Key` the client made, or the job's or event's identity (12.4 "Scope"). A UUID. */
  readonly key: string;
  readonly content: RequestContent;
  /** The access checks its route or job kind requires, run again before a replay is answered (CH-14). */
  readonly authoriseReplay: ReplayAuthorisation;
  /** The command's own steps, after step 2 of module-map 6.1, in its transaction. */
  readonly work: (context: TransactionContext) => Promise<CommandOutcome<Answer>>;
}

export interface IdempotencyHelperDependencies {
  readonly runner: CommandRunner;
  readonly logger: StructuredLogger;
  readonly secretCheck: ReplaySecretCheck;
  readonly cipher: RestrictedValueCipher;
}

/** The savepoint set after the key row (12.4 "In the command's transaction"). */
const SAVEPOINT = 'kernel_idempotency_key';
/** SQLSTATE 55P03 lock_not_available: the wait at the key's insert reached the lock limit (12.4 "Two at once"). */
const LOCK_NOT_AVAILABLE = '55P03';
const IN_FAILED_SQL_TRANSACTION = '25P02';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEPT_REFUSAL_KINDS: readonly string[] = [
  'unavailable',
  'not-authorised',
  'not-found',
  'refused',
  'conflict',
] satisfies readonly KeptRefusalKind[];
/** The one `conflict` a command decides and the helper keeps (code-house-rules 12.3, 12.7). */
const STALE_VERSION = 'kernel.stale-version';
const CONTEXT = 'IdempotencyHelper';

/** The key row and its outcome, as a later request under the key finds them. */
interface KeptKey {
  readonly keyId: string;
  readonly requestHash: string;
  readonly formVersion: number;
  readonly outcome: KeptOutcome;
  readonly shown: 'nothing' | 'secret' | 'restricted-value';
  readonly credentialIds: readonly string[];
}

/** Internal: the key was already used; the command's transaction rolls back, having written nothing. */
class KeyAlreadyUsed extends Error {
  constructor(readonly kept: KeptKey) {
    super('The idempotency key was already used');
  }
}

/** Internal: a refusal that is not kept; the command's transaction rolls back and the key stays unused. */
class RefusalNotKept extends Error {
  constructor(readonly refusal: CommandRefusal) {
    super('A refusal caused by a secret is not kept under the key');
  }
}

type Verdict =
  | { readonly kind: 'replay' }
  | { readonly kind: 'access-refused'; readonly refusal: ReplayAccessRefusal }
  | { readonly kind: 'not-repeatable' }
  | {
      readonly kind: 'keep-conflict';
      readonly code: 'kernel.idempotency-key-reused' | 'kernel.secret-not-comparable';
      readonly reason: 'content-changed' | 'form-version-changed' | 'secret-not-comparable';
    };

/**
 * The idempotency helper (code-house-rules 12.4 to 12.6; module-map 4.1 "Idempotency", 6.1 step 2; PRD-INT-002,
 * PRD-INT-004; DEC-113, DEC-114). A command runs under its key in one transaction of the command runner:
 *
 * 1. At step 2 it inserts the key row, scoped by the actor and the operation (the command's name) in the
 *    Organisation's own database, then sets a savepoint. A second request with the same key waits at that insert
 *    on the unique index until the first commits or rolls back, then replays, conflicts or runs itself; a wait that
 *    reaches the lock limit is `kernel.request-in-progress` (12.4 "Two at once"; PRD-INT-003).
 * 2. On success the result row is written with the command's other writes, and all commit together (PRD-INT-004).
 *    On a refusal the command decides, it rolls back to the savepoint, which releases every lock taken after it,
 *    writes the refusal as the result and commits. A refusal caused by a secret, a time limit, a failure or an
 *    invalid request rolls the whole transaction back, and the key stays unused.
 * 3. An outcome not known (CommandOutcomeUnknown) never frees the key: sent again, the request is a replay if its
 *    transaction committed, and runs once if it did not (12.4 "An uncertain commit keeps the key").
 * 4. A request whose key is already used is recognised at step 2, then answered only after the access checks its
 *    route or job kind requires pass now (CH-14), in a READ ONLY transaction; the command is never run again. Same
 *    hash: the kept answer, except an answer that showed a secret or a restricted value unmasked
 *    (`kernel.answer-not-repeatable`) and a new secret that does not compare (12.5). Another hash, or another form
 *    version: `kernel.idempotency-key-reused`, the refused request kept in a transaction of its own, with no secret
 *    and every restricted value encrypted under the Organisation's key.
 *
 * Nothing it keeps or logs holds a secret, and no restricted value is kept in plain (PRD-SEC-006, PRD-SEC-014).
 */
export class IdempotencyHelper {
  constructor(private readonly dependencies: IdempotencyHelperDependencies) {}

  async run<Answer extends JsonValue>(
    request: CommandRequest,
    command: IdempotentCommand<Answer>,
  ): Promise<IdempotentAnswer<Answer>> {
    if (request.actor.kind !== 'actor') {
      throw new CommandDefect(
        'A command under an idempotency key has an actor; the paths with no actor carry no key (code-house-rules 12.4)',
      );
    }
    const actorId = request.actor.actorId;
    const key = command.key.toLowerCase();
    if (!UUID.test(key)) throw new CommandDefect('An idempotency key is a UUID (code-house-rules 12.4)');
    // Pure, and before any transaction: a request whose form cannot be built never reaches the database.
    const prepared = prepareRequest(request.commandName, command.content);

    let kept: KeptKey;
    try {
      return await this.dependencies.runner.run(request, async (context) => {
        const keyId = await this.insertKey(context, request, actorId, key, prepared);
        if (keyId === undefined) throw new KeyAlreadyUsed(await this.readKept(context, actorId, key));
        await context.tx.execute(sql.raw(`savepoint ${SAVEPOINT}`));
        const outcome = await command.work(context);
        return this.finish(context, keyId, outcome);
      });
    } catch (error) {
      if (error instanceof RefusalNotKept) {
        return { kind: 'refusal', refusal: error.refusal, replayed: false, kept: false };
      }
      if (!(error instanceof KeyAlreadyUsed)) throw error;
      kept = error.kept;
    }
    return this.replay(request, command, prepared, kept);
  }

  /**
   * Step 2: the key row. Undefined when the key was already used; the insert waits for a request still running
   * under it, and a wait that reaches the lock limit is `kernel.request-in-progress`.
   */
  private async insertKey(
    context: TransactionContext,
    request: CommandRequest,
    actorId: string,
    key: string,
    prepared: PreparedRequest,
  ): Promise<string | undefined> {
    const id = uuidv7();
    try {
      const inserted = await context.tx
        .insert(idempotencyKey)
        .values({
          id,
          actorId,
          operation: request.commandName,
          idempotencyKey: key,
          requestHash: prepared.hash,
          formVersion: prepared.formVersion,
          secretFields: [...prepared.secretFieldNames],
          correlationId: request.correlationId,
        })
        .onConflictDoNothing({
          target: [idempotencyKey.actorId, idempotencyKey.operation, idempotencyKey.idempotencyKey],
        })
        .returning({ id: idempotencyKey.id });
      return inserted[0]?.id;
    } catch (error) {
      if (sqlStateOf(error) !== LOCK_NOT_AVAILABLE) throw error;
      // The first request under the key still runs. The whole transaction rolls back; nothing was written.
      this.log('info', request, 'kernel.request-in-progress');
      throw new IdempotencyConflict('kernel.request-in-progress', request.correlationId);
    }
  }

  private async readKept(context: TransactionContext, actorId: string, key: string): Promise<KeptKey> {
    const rows = await context.tx
      .select({
        keyId: idempotencyKey.id,
        requestHash: idempotencyKey.requestHash,
        formVersion: idempotencyKey.formVersion,
        outcome: idempotencyResult.outcome,
        shown: idempotencyResult.shown,
        answer: idempotencyResult.answer,
        credentialIds: idempotencyResult.credentialIds,
      })
      .from(idempotencyKey)
      .leftJoin(idempotencyResult, eq(idempotencyResult.idempotencyKeyId, idempotencyKey.id))
      .where(
        and(
          eq(idempotencyKey.actorId, actorId),
          eq(idempotencyKey.operation, context.commandName),
          eq(idempotencyKey.idempotencyKey, key),
        ),
      );
    const row = rows[0];
    if (row === undefined) throw new CommandDefect('The idempotency key conflicted, then could not be read');
    if (row.outcome === null || row.shown === null || row.credentialIds === null) {
      // The result row commits with its key row, always (12.4 "In the command's transaction").
      throw new CommandDefect('A committed idempotency key has no result');
    }
    return {
      keyId: row.keyId,
      requestHash: row.requestHash,
      formVersion: row.formVersion,
      outcome: keptOutcome(row.outcome, row.shown, row.answer),
      shown: row.shown,
      credentialIds: row.credentialIds,
    };
  }

  /** Writes the outcome under the key, in the command's transaction (12.4 "In the command's transaction"). */
  private async finish<Answer extends JsonValue>(
    context: TransactionContext,
    keyId: string,
    outcome: CommandOutcome<Answer>,
  ): Promise<IdempotentAnswer<Answer>> {
    if (outcome.kind === 'refusal') {
      checkRefusal(outcome.refusal);
      if (outcome.causedBySecret) throw new RefusalNotKept(outcome.refusal);
    } else {
      checkSuccess(outcome);
    }
    // A database error the command caught aborted the transaction: nothing is kept, and the command runner reports
    // it under its own rule (a time limit as timed-out, anything else as a defect), so the key stays unused.
    if (await isAborted(context)) {
      return outcome.kind === 'success'
        ? { kind: 'success', answer: outcome.answer, replayed: false }
        : { kind: 'refusal', refusal: outcome.refusal, replayed: false, kept: false };
    }
    if (outcome.kind === 'refusal') {
      // The refusal's effects, and every lock taken after the key, are undone; the refusal is kept.
      await context.tx.execute(sql.raw(`rollback to savepoint ${SAVEPOINT}`));
      await context.tx.insert(idempotencyResult).values({
        id: uuidv7(),
        idempotencyKeyId: keyId,
        outcome: outcome.refusal.kind,
        shown: 'nothing',
        answer: refusalAnswer(outcome.refusal),
        credentialIds: [],
      });
      return { kind: 'refusal', refusal: outcome.refusal, replayed: false, kept: true };
    }
    const shown = outcome.shows;
    await context.tx.insert(idempotencyResult).values({
      id: uuidv7(),
      idempotencyKeyId: keyId,
      outcome: 'success',
      shown,
      // An answer that showed a secret or a restricted value unmasked is never kept; only the fact (12.6).
      answer: shown === 'nothing' ? checkKeptAnswer(outcome.answer) : null,
      credentialIds: [...(outcome.credentialIds ?? [])].map((id) => id.toLowerCase()),
    });
    return { kind: 'success', answer: outcome.answer, replayed: false };
  }

  /** A request under a key already used (12.4 "Replay", "Changed content"; 12.5; 12.6). */
  private async replay<Answer extends JsonValue>(
    request: CommandRequest,
    command: IdempotentCommand<Answer>,
    prepared: PreparedRequest,
    kept: KeptKey,
  ): Promise<IdempotentAnswer<Answer>> {
    const verdict = await this.dependencies.runner.read(request, async (context): Promise<Verdict> => {
      // The access checks first, for every case: a replay is answered only after they pass now (CH-14).
      const access = await command.authoriseReplay(context, kept.outcome);
      if (access.kind === 'refused') return { kind: 'access-refused', refusal: access.refusal };
      if (kept.formVersion !== prepared.formVersion) {
        // The two hashes are never compared (12.4 "What is hashed").
        return { kind: 'keep-conflict', code: 'kernel.idempotency-key-reused', reason: 'form-version-changed' };
      }
      if (kept.requestHash !== prepared.hash) {
        return { kind: 'keep-conflict', code: 'kernel.idempotency-key-reused', reason: 'content-changed' };
      }
      // An answer that showed a secret or a restricted value unmasked is never repeated (12.6; DEC-113, DEC-114).
      if (kept.shown !== 'nothing') return { kind: 'not-repeatable' };
      // An authenticator code proves presence and is never compared (12.5; CH-8). A new secret is, while it can be.
      if (prepared.newSecrets.size > 0) return this.compareSecrets(context, kept, prepared);
      return { kind: 'replay' };
    });

    switch (verdict.kind) {
      case 'access-refused':
        return { kind: 'refusal', refusal: verdict.refusal, replayed: false, kept: false };
      case 'not-repeatable':
        this.log('info', request, 'kernel.answer-not-repeatable');
        throw new IdempotencyConflict('kernel.answer-not-repeatable', request.correlationId);
      case 'keep-conflict':
        await this.keepConflict(request, prepared, kept, verdict.reason);
        this.log('warn', request, verdict.code);
        throw new IdempotencyConflict(verdict.code, request.correlationId, verdict.reason === 'form-version-changed');
      case 'replay':
        return kept.outcome.kind === 'refusal'
          ? { kind: 'refusal', refusal: kept.outcome.refusal, replayed: true, kept: true }
          : {
              kind: 'success',
              // The answer as sent, kept as JSON (shown 'nothing' was checked above).
              answer: (kept.outcome.answer as { readonly value: JsonValue }).value as Answer,
              replayed: true,
            };
    }
  }

  /** 12.5: a new secret against the credential the first run wrote, while that credential is current. */
  private async compareSecrets(
    context: TransactionContext,
    kept: KeptKey,
    prepared: PreparedRequest,
  ): Promise<Verdict> {
    // A kept refusal did not depend on the secret, but nothing of the first secret is kept, so whether the
    // replay's differs cannot be told (12.5 item 1; CH-8).
    if (kept.outcome.kind === 'refusal' || kept.credentialIds.length === 0) {
      return { kind: 'keep-conflict', code: 'kernel.secret-not-comparable', reason: 'secret-not-comparable' };
    }
    // Read as a plain string: the check is implemented above kernel, and anything else it answers is a defect.
    const compared: string = await this.dependencies.secretCheck.compare(context, {
      credentialIds: kept.credentialIds,
      secrets: prepared.newSecrets,
    });
    if (compared === 'same') return { kind: 'replay' };
    if (compared === 'differs') {
      return { kind: 'keep-conflict', code: 'kernel.idempotency-key-reused', reason: 'content-changed' };
    }
    if (compared === 'not-comparable') {
      return { kind: 'keep-conflict', code: 'kernel.secret-not-comparable', reason: 'secret-not-comparable' };
    }
    throw new CommandDefect('The secret check answered something other than same, differs or not-comparable');
  }

  /**
   * Keeps a refused request for investigation, in a transaction of its own (12.4 "Changed content"; PRD-INT-002):
   * its hash and form version beside its key row's, and its canonical form, which holds no secret in any form, with
   * every restricted value encrypted under the Organisation's key first, outside every transaction (8.3).
   */
  private async keepConflict(
    request: CommandRequest,
    prepared: PreparedRequest,
    kept: KeptKey,
    reason: 'content-changed' | 'form-version-changed' | 'secret-not-comparable',
  ): Promise<void> {
    const encrypted = await Promise.all(
      prepared.restrictedLeaves.map(async (leaf) => ({
        fieldClass: leaf.fieldClass,
        ...(await this.dependencies.cipher.encrypt(
          request.organisation.organisationCode,
          leaf.fieldClass,
          canonicalJson(leaf.value),
        )),
      })),
    );
    for (const value of encrypted) {
      if (typeof value.scheme !== 'string' || typeof value.ciphertext !== 'string' || value.ciphertext === '') {
        throw new CommandDefect('The cipher returned no encrypted value');
      }
    }
    const requestForm = formWithEncryptedLeaves(prepared, encrypted);
    await this.dependencies.runner.run(request, async (context) => {
      await context.tx.insert(idempotencyConflict).values({
        id: uuidv7(),
        idempotencyKeyId: kept.keyId,
        reason,
        requestHash: prepared.hash,
        formVersion: prepared.formVersion,
        correlationId: request.correlationId,
        requestForm,
      });
    });
  }

  /** One line with identifiers and the code only, never a field value or a secret (code-house-rules 12.11). */
  private log(level: 'info' | 'warn', request: CommandRequest, code: IdempotencyConflictCode): void {
    this.dependencies.logger.structured(
      level,
      {
        correlationId: request.correlationId,
        organisationCode: request.organisation.organisationCode,
        command: request.commandName,
        code,
      },
      'A request under a used idempotency key was answered conflict',
      CONTEXT,
    );
  }
}

/** Whether PostgreSQL has aborted the command's transaction: an aborted transaction refuses a trivial statement. */
async function isAborted(context: TransactionContext): Promise<boolean> {
  try {
    await context.tx.execute(sql`select 1`);
    return false;
  } catch (error) {
    if (sqlStateOf(error) === IN_FAILED_SQL_TRANSACTION) return true;
    throw error;
  }
}

function checkRefusal(refusal: CommandRefusal): void {
  if (!KEPT_REFUSAL_KINDS.includes(refusal.kind)) {
    throw new CommandDefect('A command refuses as unavailable, not-authorised, not-found, refused or conflict (12.3)');
  }
  if (refusal.kind === 'conflict' && refusal.code !== STALE_VERSION) {
    throw new CommandDefect('The one conflict a command decides is a stale version, kernel.stale-version (12.3, 12.7)');
  }
  if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(refusal.code)) {
    throw new CommandDefect('A refusal code is <unit>.<reason>, in lower-case words joined by hyphens (12.3)');
  }
}

function checkSuccess(outcome: { readonly shows: string; readonly credentialIds?: readonly string[] }): void {
  if (!['nothing', 'secret', 'restricted-value'].includes(outcome.shows)) {
    throw new CommandDefect('A success states whether it shows a secret or a restricted value (12.6)');
  }
  for (const id of outcome.credentialIds ?? []) {
    if (!UUID.test(id.toLowerCase())) throw new CommandDefect('A credential is named by its UUID (12.5)');
  }
}

/** A refusal as kept: its code, what is missing and the next action; identifiers and codes only (12.3). */
function refusalAnswer(refusal: CommandRefusal): JsonValue {
  const answer: Record<string, JsonValue> = { code: refusal.code, missing: [...refusal.missing] };
  if (refusal.next !== undefined) answer.next = refusal.next;
  return checkKeptAnswer(answer);
}

function keptOutcome(
  outcome: 'success' | KeptRefusalKind,
  shown: 'nothing' | 'secret' | 'restricted-value',
  answer: unknown,
): KeptOutcome {
  if (outcome === 'success') {
    return {
      kind: 'success',
      answer: shown === 'nothing' ? { kind: 'kept', value: answer as JsonValue } : { kind: 'not-kept', shown },
    };
  }
  const kept = answer as { code: string; missing: CommandRefusal['missing']; next?: string };
  const refusal: CommandRefusal = {
    kind: outcome,
    code: kept.code,
    missing: kept.missing,
    ...(kept.next === undefined ? {} : { next: kept.next }),
  };
  return { kind: 'refusal', refusal };
}
