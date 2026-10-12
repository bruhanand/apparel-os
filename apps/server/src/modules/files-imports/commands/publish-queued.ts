import { uuidv7 } from '@apparel-os/domain';
import { IMPORT_BATCH_TYPE } from '@apparel-os/schemas';
import { eq, sql } from 'drizzle-orm';
import {
  CommandDefect,
  LOCK_STEP,
  lockTable,
  type CommandOutcome,
  type CommandRefusal,
  type JsonValue,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AuditActor } from '../../audit/index.js';
import type { OutcomeDocument } from '../domain/outcome.js';
import { importOutcome, publishRequest } from '../db/schema.js';
import {
  BATCH_NOT_FOUND,
  documentsOf,
  factsOfBatch,
  handlerOf,
  visibleBatch,
  type BatchRow,
  type ImportDependencies,
} from './import-common.js';
import {
  documentAnswerOf,
  handlerAuthority,
  pendingRequest,
  publishOne,
  recheckBatch,
  toPublish,
  writeOutcome,
  type Attempting,
} from './publish-import.js';
import { BATCH_LOCK } from './validate-import.js';

// The job of a queued publish (imports-and-opening-data 3.2, 10.6; stock-ledger 10.6; access-and-approvals 9.8 steps 2
// to 4; code-house-rules 12.9; PRD-INT-004, PRD-IMP-012, DEC-097, DEC-124; S1-F13-T03). An opening batch's request to
// post is recorded at Publish, not at the approval click (DEC-124, amending DEC-097 for opening batches). A posting consumer calls it in its
// step's transaction, under its internal service identity on behalf of the person who asked, one job at a time per
// accounting book. The slow reads come before the locks; then the batch, the decision's request and the documents are
// locked at step 1 and everything is rechecked: the request is the batch's latest and unanswered, the batch Validated
// at the version the request names and submitted at it, its versions Confirmed, its counts closed, its gate open and
// its decision verified. Then, in one transaction, the decision's use is recorded first, every document chosen is
// published through its handler, whose records keep that use (13.3), and the batch becomes Published with its outcome.
//
// A refusal of the identity's or the handler's authority, under the locks, or of any document, posts nothing: the work
// rolls back to a savepoint taken before the first write, the decision stays unused, and the attempt's outcome is
// written naming the request and the refusal, so the batch, still Validated, shows the failure (3.2; 10.6 "A failed
// job"; code-house-rules 12.9). Only a request gone, a batch the identity cannot see or a request answered already
// leaves no outcome: the job keeps that refusal as its answer. A retry is Publish asked again, a new
// request naming the same decision, used only while the batch version is unchanged (9.8 step 5).

const DOCUMENT_LOCK = lockTable('files_imports', 'import_document');
const SAVEPOINT = 'files_imports_queued_publish';

/** The service identity a posting consumer runs as, and the assignment the worker held for it at step 0. */
export interface QueuedPublisher {
  readonly serviceIdentityId: string;
}

/** What the job came to: an outcome written (published or failed), or a refusal before the batch's lock. */
export type QueuedAnswer =
  | { readonly kind: 'answered'; readonly answer: JsonValue }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal };

/** A refusal of the work under the savepoint, which rolls it back. */
class RollBack extends Error {
  constructor(readonly refusal: CommandRefusal) {
    super(refusal.code);
  }
}

type RequestRow = typeof publishRequest.$inferSelect;

async function requestOf(context: TransactionContext, publishRequestId: string): Promise<RequestRow | undefined> {
  const [row] = await context.tx.select().from(publishRequest).where(eq(publishRequest.id, publishRequestId));
  return row;
}

async function answered(context: TransactionContext, publishRequestId: string): Promise<boolean> {
  const [row] = await context.tx
    .select({ id: importOutcome.id })
    .from(importOutcome)
    .where(eq(importOutcome.publishRequestId, publishRequestId));
  return row !== undefined;
}

/**
 * The rechecks under the locks (code-house-rules 8.1), or the refusal: the request is the batch's latest unanswered
 * one, then the batch as any Publish rechecks it, at the version the request names, the decision verified with the
 * person who asked counted among the preparers, as the publisher of a Publish is (access-and-approvals 9.7).
 */
async function recheck(
  deps: ImportDependencies,
  context: TransactionContext,
  request: RequestRow,
): ReturnType<typeof recheckBatch> {
  const latest = await pendingRequest(context, request.batchId);
  if (latest?.id !== request.id) {
    return {
      kind: 'refused',
      refusal: {
        kind: 'refused',
        code: 'files-imports.publish-request-superseded',
        missing: [{ kind: 'publish-request', publishRequestId: request.id }],
      },
    };
  }
  return recheckBatch(deps, context, {
    batchId: request.batchId,
    versionId: request.batchVersionId,
    approvalDecisionId: request.approvalDecisionId ?? undefined,
    preparerId: request.requestedByUserId,
  });
}

/**
 * Publishes the batch a request to post names, in the step's transaction (module docs above). Answers the outcome it
 * wrote, or the refusal when no outcome can be written: the request is gone, its batch is not visible to the service
 * identity, or the request was answered already.
 */
export async function publishRequested(
  deps: ImportDependencies,
  context: TransactionContext,
  publisher: QueuedPublisher,
  publishRequestId: string,
): Promise<QueuedAnswer> {
  const request = await requestOf(context, publishRequestId);
  if (request === undefined) {
    return {
      kind: 'refused',
      refusal: { kind: 'not-found', code: 'files-imports.publish-request-not-found', missing: [] },
    };
  }
  // A batch the service identity cannot see is one it can write no outcome for (PRD-SEC-005): the refusal is the job's
  // kept answer, and the job shows it in the operations view (code-house-rules 12.9).
  const found = await visibleBatch(context, request.batchId);
  if (found === undefined) return { kind: 'refused', refusal: BATCH_NOT_FOUND };
  const handler = handlerOf(deps.handlers, found);
  const actorId = publisher.serviceIdentityId;
  // The service identity's authority on the batch, and the handler's own permission on each document at its place,
  // as a person's Publish needs them (13.2); the worker held the identity's assignment at step 0 (12.9). A refusal is
  // kept as the batch's failed outcome once the batch is locked, so the batch shows it (3.2; 12.9 "the record shows
  // the refusal").
  const authorised = await deps.access.authorise(context, {
    actorId,
    action: 'edit',
    recordType: IMPORT_BATCH_TYPE,
    facts: factsOfBatch(found),
  });
  const chosen = toPublish(await documentsOf(context, found));
  const forHandler =
    authorised.kind === 'refused' ? undefined : await handlerAuthority(deps, context, handler, actorId, chosen);
  await context.lock(LOCK_STEP.document, [
    { table: BATCH_LOCK, id: found.id, mode: 'exclusive' },
    ...(request.approvalDecisionId === null
      ? []
      : await deps.access.approvalLockTargets(context, request.approvalDecisionId)),
    ...chosen.map((document) => ({ table: DOCUMENT_LOCK, id: document.documentId, mode: 'exclusive' as const })),
  ]);
  // A request is answered once (0082's unique index is the last guard).
  if (await answered(context, request.id)) {
    return {
      kind: 'refused',
      refusal: { kind: 'refused', code: 'files-imports.publish-request-answered', missing: [] },
    };
  }
  const actor: AuditActor = { kind: 'service-identity', id: actorId, onBehalfOfUserId: request.requestedByUserId };
  const attempting: Attempting = {
    attemptedByUserId: request.requestedByUserId,
    actor,
    roleAssignmentId: authorised.kind === 'refused' ? undefined : authorised.roleAssignmentId,
    key: request.id,
    source: { kind: 'job', reference: request.id },
    useRecorded: true,
    publishRequestId: request.id,
  };
  const current = async () => (await visibleBatch(context, request.batchId)) ?? found;
  if (authorised.kind === 'refused') {
    return failed(deps, context, attempting, await current(), handler, chosen, authorised.refusal);
  }
  if (forHandler?.kind !== 'allowed') {
    const refusal = forHandler?.refusal ?? { kind: 'not-authorised', code: 'access.not-authorised', missing: [] };
    return failed(deps, context, attempting, await current(), handler, chosen, refusal);
  }
  const checked = await recheck(deps, context, request);
  if (checked.kind === 'refused') {
    return failed(deps, context, attempting, await current(), handler, chosen, checked.refusal);
  }
  const { batch, approvalCheck } = checked;
  await context.tx.execute(sql.raw(`savepoint ${SAVEPOINT}`));
  try {
    const useId = uuidv7();
    if (approvalCheck !== undefined) {
      // The decision's use first, so every record the documents write keeps it (stock-ledger 13.1 step 4; DEC-097,
      // DEC-124).
      const used = await deps.access.recordUse(context, { ...approvalCheck, useId, actor });
      if (used !== undefined) throw new RollBack(used);
    }
    const attempts = new Map<string, Omit<OutcomeDocument, 'documentId' | 'rows'>>();
    for (const document of chosen) {
      const roleAssignmentId = forHandler.assignments.get(document.documentId);
      if (roleAssignmentId === undefined) throw new CommandDefect('A document was published without its authority');
      const outcome = await publishOne(deps, context, {
        batch,
        handler,
        documentId: document.documentId,
        revisable: undefined,
        publisher: {
          userId: request.requestedByUserId,
          roleAssignmentId,
          serviceIdentityId: actorId,
          ...(approvalCheck === undefined ? {} : { approval: { decisionId: approvalCheck.decisionId, useId } }),
        },
        actor,
        source: { kind: 'job', reference: request.id },
        idempotencyKey: request.id,
      });
      if (outcome.kind === 'refusal') throw new RollBack(outcome.refusal);
      const answer = documentAnswerOf(outcome.answer);
      if (answer.result !== 'published') {
        // A duplicate, or a document published meanwhile: the batch posts whole or not at all (PRD-IMP-012).
        throw new RollBack({
          kind: 'refused',
          code: 'files-imports.document-not-staged',
          missing: [{ kind: 'import-document', documentId: document.documentId }],
        });
      }
      attempts.set(document.documentId, { result: 'published', records: [...answer.records] });
    }
    const written = await writeOutcome(deps, context, attempting, { batch, handler, approvalCheck }, attempts);
    if (written.kind !== 'success') throw new RollBack(refusalOf(written));
    await context.tx.execute(sql.raw(`release savepoint ${SAVEPOINT}`));
    return { kind: 'answered', answer: written.answer };
  } catch (error) {
    if (!(error instanceof RollBack)) throw error;
    await context.tx.execute(sql.raw(`rollback to savepoint ${SAVEPOINT}`));
    return failed(deps, context, attempting, batch, handler, chosen, error.refusal);
  }
}

function refusalOf(outcome: CommandOutcome<JsonValue>): CommandRefusal {
  if (outcome.kind === 'refusal') return outcome.refusal;
  throw new CommandDefect('An outcome that is no refusal was read as one');
}

/** The outcome of a refused attempt: every document chosen refused with the refusal, nothing posted (7.4; 3.2). */
async function failed(
  deps: ImportDependencies,
  context: TransactionContext,
  attempting: Attempting,
  batch: BatchRow,
  handler: ReturnType<typeof handlerOf>,
  chosen: readonly { readonly documentId: string }[],
  refusal: CommandRefusal,
): Promise<QueuedAnswer> {
  const attempts = new Map<string, Omit<OutcomeDocument, 'documentId' | 'rows'>>(
    chosen.map((document) => [document.documentId, { result: 'refused', records: [], refusalCode: refusal.code }]),
  );
  const written = await writeOutcome(
    deps,
    context,
    { ...attempting, refusalCode: refusal.code },
    { batch, handler, approvalCheck: undefined },
    attempts,
  );
  if (written.kind !== 'success') throw new CommandDefect('The outcome of a refused queued publish was not written');
  return { kind: 'answered', answer: written.answer };
}

/**
 * The queued publish as a posting consumer reaches it (module-map 4.7; S1-F13-T03): the stage that brings a queued
 * handler registers its consumer, which calls this in its step's transaction. In stage 1 only the tests' consumer does
 * (DEC-116).
 */
export interface QueuedPublishingInterface {
  publishRequested(
    context: TransactionContext,
    publisher: QueuedPublisher,
    publishRequestId: string,
  ): Promise<QueuedAnswer>;
}

export class QueuedPublishing implements QueuedPublishingInterface {
  constructor(private readonly deps: ImportDependencies) {}

  publishRequested(context: TransactionContext, publisher: QueuedPublisher, publishRequestId: string) {
    return publishRequested(this.deps, context, publisher, publishRequestId);
  }
}
