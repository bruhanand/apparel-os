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
  batchPreparers,
  documentsOf,
  factsOfBatch,
  handlerOf,
  reviewOf,
  versionsOf,
  visibleBatch,
  type BatchRow,
  type ImportDependencies,
} from './import-common.js';
import { gateRefusal, openingGateOf } from './opening-gate.js';
import { countsRefusal } from './outcomes.js';
import { pendingRequest, publishOne, toPublish, writeOutcome, type Attempting, type Held } from './publish-import.js';
import { BATCH_LOCK } from './validate-import.js';

// The job of a queued publish (imports-and-opening-data 3.2, 10.6; stock-ledger 10.6; access-and-approvals 9.8 steps 2
// to 4; code-house-rules 12.9; PRD-INT-004, PRD-IMP-012, DEC-097; S1-F13-T03). A posting consumer calls it in its
// step's transaction, under its internal service identity on behalf of the person who asked, one job at a time per
// accounting book. The slow reads come before the locks; then the batch, the decision's request and the documents are
// locked at step 1 and everything is rechecked: the request is the batch's latest and unanswered, the batch Validated
// at the version the request names and submitted at it, its versions Confirmed, its counts closed, its gate open and
// its decision verified. Then, in one transaction, the decision's use is recorded first, every document chosen is
// published through its handler, whose records keep that use (13.3), and the batch becomes Published with its outcome.
//
// A refusal under the locks, or of any document, posts nothing: the work rolls back to a savepoint taken before the
// first write, the decision stays unused, and the attempt's outcome is written naming the request and the refusal, so
// the batch, still Validated, shows the failure (3.2; 10.6 "A failed job"). A retry is Publish asked again, a new
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

/** The rechecks under the locks (code-house-rules 8.1), or the refusal; with the approval check where one is needed. */
async function recheck(
  deps: ImportDependencies,
  context: TransactionContext,
  request: RequestRow,
): Promise<
  | { readonly kind: 'held'; readonly batch: BatchRow; readonly approvalCheck: Held['approvalCheck'] }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal }
> {
  const refusal = (value: CommandRefusal) => ({ kind: 'refused' as const, refusal: value });
  const batch = await visibleBatch(context, request.batchId);
  if (batch === undefined) return refusal(BATCH_NOT_FOUND);
  if (batch.state !== 'Validated') {
    return refusal({ kind: 'refused', code: 'files-imports.batch-not-validated', missing: [] });
  }
  if (batch.versionId !== request.batchVersionId) {
    // The batch changed after the request (access-and-approvals 9.6): it returns for review (9.8 step 5).
    return refusal({
      kind: 'conflict',
      code: 'kernel.stale-version',
      missing: [{ kind: 'version', recordType: IMPORT_BATCH_TYPE, recordId: batch.id, versionId: batch.versionId }],
    });
  }
  const latest = await pendingRequest(context, batch.id);
  if (latest?.id !== request.id) {
    return refusal({
      kind: 'refused',
      code: 'files-imports.publish-request-superseded',
      missing: [{ kind: 'publish-request', publishRequestId: request.id }],
    });
  }
  if (batch.submittedVersionId !== batch.versionId) {
    return refusal({
      kind: 'refused',
      code: 'files-imports.review-missing',
      missing: [{ kind: 'review', review: 'submission' }],
    });
  }
  const versions = await versionsOf(context, batch);
  if (versions.layout.state !== 'Confirmed' || versions.mapping.state !== 'Confirmed') {
    return refusal({ kind: 'refused', code: 'files-imports.version-not-confirmed', missing: [] });
  }
  const counts = await countsRefusal(context, batch);
  if (counts !== undefined) return refusal(counts);
  const handler = handlerOf(deps.handlers, batch);
  if (batch.kind === 'opening-balance') {
    const gate = gateRefusal(await openingGateOf(deps, context, handler, factsOfBatch(batch)));
    if (gate !== undefined) return refusal(gate);
  }
  const review = reviewOf(handler, batch);
  if (review.kind !== 'approval') return { kind: 'held', batch, approvalCheck: undefined };
  if (request.approvalDecisionId === null) {
    return refusal({
      kind: 'refused',
      code: 'files-imports.review-missing',
      missing: [{ kind: 'review', review: 'approval' }],
    });
  }
  const approvalCheck: NonNullable<Held['approvalCheck']> = {
    decisionId: request.approvalDecisionId,
    actionType: review.actionType,
    document: {
      module: 'files-imports',
      recordType: review.recordType,
      recordId: batch.id,
      versionId: batch.versionId,
    },
    // The person who asked counts as a preparer, as the publisher of a Publish does (access-and-approvals 9.7).
    preparers: await batchPreparers(context, batch, request.requestedByUserId),
    value: { kind: 'none' },
  };
  const verified = await deps.access.verifyUnderLock(context, approvalCheck);
  if (verified !== undefined) return refusal(verified);
  return { kind: 'held', batch, approvalCheck };
}

/**
 * Publishes the batch a request to post names, in the step's transaction (module docs above). Answers the outcome it
 * wrote, or the refusal found before the batch's lock, when nothing is written.
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
  const found = await visibleBatch(context, request.batchId);
  if (found === undefined) return { kind: 'refused', refusal: BATCH_NOT_FOUND };
  const handler = handlerOf(deps.handlers, found);
  const actorId = publisher.serviceIdentityId;
  // The service identity's authority on the batch, and the handler's own permission on each document at its place,
  // as a person's Publish needs them (13.2); the worker held the identity's assignment at step 0 (12.9).
  const authorised = await deps.access.authorise(context, {
    actorId,
    action: 'edit',
    recordType: IMPORT_BATCH_TYPE,
    facts: factsOfBatch(found),
  });
  if (authorised.kind === 'refused') return { kind: 'refused', refusal: authorised.refusal };
  const chosen = toPublish(await documentsOf(context, found));
  const assignments = new Map<string, string>();
  for (const document of chosen) {
    const need = await handler.publishNeeds(context, document);
    const allowed = await deps.access.authorise(context, { actorId, ...need });
    if (allowed.kind === 'refused') return { kind: 'refused', refusal: allowed.refusal };
    assignments.set(document.documentId, allowed.roleAssignmentId);
  }
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
    roleAssignmentId: authorised.roleAssignmentId,
    key: request.id,
    source: { kind: 'job', reference: request.id },
    useRecorded: true,
    publishRequestId: request.id,
  };
  const checked = await recheck(deps, context, request);
  if (checked.kind === 'refused') {
    const locked = (await visibleBatch(context, request.batchId)) ?? found;
    return failed(deps, context, attempting, locked, handler, chosen, checked.refusal);
  }
  const { batch, approvalCheck } = checked;
  await context.tx.execute(sql.raw(`savepoint ${SAVEPOINT}`));
  try {
    const useId = uuidv7();
    if (approvalCheck !== undefined) {
      // The decision's use first, so every record the documents write keeps it (stock-ledger 13.1 step 4; DEC-097).
      const used = await deps.access.recordUse(context, { ...approvalCheck, useId, actor });
      if (used !== undefined) throw new RollBack(used);
    }
    const attempts = new Map<string, Omit<OutcomeDocument, 'documentId' | 'rows'>>();
    for (const document of chosen) {
      const roleAssignmentId = assignments.get(document.documentId);
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
      const answer = outcome.answer as { result: string; records?: { recordType: string; recordId: string }[] };
      if (answer.result !== 'published') {
        // A duplicate, or a document published meanwhile: the batch posts whole or not at all (PRD-IMP-012).
        throw new RollBack({
          kind: 'refused',
          code: 'files-imports.document-not-staged',
          missing: [{ kind: 'import-document', documentId: document.documentId }],
        });
      }
      attempts.set(document.documentId, { result: 'published', records: answer.records ?? [] });
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
