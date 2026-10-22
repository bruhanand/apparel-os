import { createHash } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import { IMPORT_BATCH_TYPE } from '@apparel-os/schemas';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  CommandDefect,
  LOCK_STEP,
  lockTable,
  UNIQUE_VIOLATION,
  withSavepoint,
  type CommandOutcome,
  type CommandRefusal,
  type IdempotentAnswer,
  type JsonValue,
  type LockTarget,
  type RequestContent,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AuditActor, AuditSource } from '../../audit/index.js';
import type { ImportHandler, ImportPublisher } from '../contracts/import-handlers.js';
import { importBatch, importDocument, importOutcome, publishRequest } from '../db/schema.js';
import { importFailed, importPublished, publishRequested } from '../events.js';
import type { DocumentResult, OutcomeDocument } from '../domain/outcome.js';
import {
  BATCH_NOT_FOUND,
  batchPreparers,
  documentsOf,
  factsOfBatch,
  handlerOf,
  identityOf,
  publishedDocument,
  reviewOf,
  scopeColumnsOf,
  versionsOf,
  visibleBatch,
  type BatchRow,
  type ImportActor,
  type ImportDependencies,
  type LoadedDocument,
} from './import-common.js';
import { gateRefusal, openingGateOf } from './opening-gate.js';
import { batchOutcome, countsRefusal, projectedResult } from './outcomes.js';
import { BATCH_LOCK, batchReplayAuthorisation } from './validate-import.js';

// Publish (imports-and-opening-data 3.1 steps 9 and 10, 3.2, 3.3, 7.1 to 7.4, 13.1, 13.2; structure-and-masters 7;
// PRD-IMP-011, PRD-IMP-012, PRD-IMP-013, PRD-INT-002, PRD-INT-005, PRD-MOD-002, PRD-MOD-006; S1-F06-T01, S1-F06-T03,
// S1-F06-T04). The target's handler writes its own records, through its Maintain operation; files-imports writes none
// of them.
//
// One transaction per document (3.3 "Step 9 is one transaction per document"): each document chosen publishes in a
// command of its own, with its audit record and its event, whole or not at all, so one failing line fails its
// document and the others publish (PRD-IMP-012). Each runs under a key derived from the request's idempotency key and
// the document, so the request sent again is answered once: each document's run answers what it answered first, and
// the batch's run, under the request's own key, answers its kept outcome (PRD-INT-002). The batch's run then writes the
// outcome of the attempt, for the batch and each document, success or failure (7.4), and makes the batch Published
// when every document chosen has posted or is a duplicate; otherwise it stays Validated so it can be corrected (3.2).
//
// Duplicate control under the locks (7.2): a document whose source identity is published with the same content is a
// duplicate and has no effect; other content is a conflict, refused, unless the batch is a governed revision, which
// marks the published document replaced and publishes the new one in the same transaction (7.3). The partial unique
// index on the source identity of published documents is the last guard, so two publishes at once give one effect
// (PRD-INT-005; domain-model invariant 20): the document is marked published before its handler writes anything, and a
// publish that loses the race on the index rolls back to its savepoint and is answered as a duplicate or a conflict.
//
// The publishing limit of S1-F06-T01 is lifted (S1-F06-T04 Notes): with intake refusals and caps (S1-F06-T02),
// confirmed layouts with the validation report (S1-F06-T03) and duplicate control built, Publish outside local work,
// tests and `dev` depends only on those controls and on the other gates in force. It enables no real data: real masters
// on `kdps-test` still need KDPS's agreement (RR-180, D-4) and the confirmers of RR-197.
//
// Publish needs the review (3.1 step 8, 6.4, 13.1; S1-F06-T03): the batch version submitted, its layout and mapping
// versions Confirmed, and, where the handler requires an approval in `access`, a decision of that exact version,
// verified under the locks; its use is recorded once, when the batch is Published (access-and-approvals 9.7, 9.8).
// The batch version the screen read travels with the request; another one is `kernel.stale-version` (code-house-rules
// 12.7).

const COMMAND = 'files-imports.publish-import';
const DOCUMENT_COMMAND = 'files-imports.publish-document';
const DOCUMENT_LOCK = lockTable('files_imports', 'import_document');

/** A further permission held at step 0 beside the batch's, with the assignment that grants it (RR-444). */
type HeldNeed = NonNullable<Parameters<ImportDependencies['access']['holdAuthority']>[5]>[number];

/** The refusals of one document's run that leave the other documents to publish (7.2; PRD-IMP-012). */
const DOCUMENT_REFUSALS: readonly string[] = ['files-imports.document-refused', 'files-imports.document-conflict'];

export interface PublishInput {
  readonly actor: ImportActor;
  readonly batchId: string;
  readonly key: string;
  readonly content: RequestContent;
  /** The batch version the screen read (code-house-rules 12.7). */
  readonly versionId: string;
  readonly approvalDecisionId?: string | undefined;
}

/**
 * The key of one document's run: derived from the request's key and the document, so the request sent again finds
 * it used (code-house-rules 12.4). A UUID of version 8 (RFC 9562), from SHA-256.
 */
export function documentKey(key: string, documentId: string): string {
  const hex = createHash('sha256').update(`${key.toLowerCase()} ${documentId.toLowerCase()}`).digest('hex');
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const refused = (refusal: CommandRefusal): CommandOutcome<JsonValue> => ({
  kind: 'refusal',
  refusal,
  causedBySecret: false,
});

export interface Held {
  readonly batch: BatchRow;
  readonly handler: ImportHandler;
  readonly roleAssignmentId: string;
  /** The assignment Authorise found for the handler's permission on each document authorised, by document. */
  readonly handlerAssignments: ReadonlyMap<string, string>;
  readonly approvalCheck: Parameters<ImportDependencies['access']['verifyUnderLock']>[1] | undefined;
}

/** The documents a publish chooses: those still Staged and not excluded (3.1 step 9). */
export const toPublish = (documents: readonly LoadedDocument[]) =>
  documents.filter((document) => document.state === 'Staged' && !document.excluded);

/**
 * The handler's own permission on each document, with the document's own scope facts (13.2; access-and-approvals 7.1
 * step 3): each need Authorise allows, with its assignment, to hold at step 0 beside the batch's; or the first refusal,
 * naming the document too (PRD-UXP-003). A need asked for several documents is authorised once.
 */
export async function handlerAuthority(
  deps: ImportDependencies,
  context: TransactionContext,
  handler: ImportHandler,
  actorId: string,
  documents: readonly LoadedDocument[],
): Promise<
  | { readonly kind: 'allowed'; readonly further: HeldNeed[]; readonly assignments: Map<string, string> }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal }
> {
  const further = new Map<string, HeldNeed>();
  const assignments = new Map<string, string>();
  for (const document of documents) {
    const need = await handler.publishNeeds(context, document);
    const asked = JSON.stringify(need);
    let held = further.get(asked);
    if (held === undefined) {
      const authorised = await deps.access.authorise(context, { actorId, ...need });
      if (authorised.kind === 'refused') {
        const { refusal } = authorised;
        return {
          kind: 'refused',
          refusal: {
            ...refusal,
            missing: [...refusal.missing, { kind: 'import-document', documentId: document.documentId }],
          },
        };
      }
      held = { roleAssignmentId: authorised.roleAssignmentId, need };
      further.set(asked, held);
    }
    assignments.set(document.documentId, held.roleAssignmentId);
  }
  return { kind: 'allowed', further: [...further.values()], assignments };
}

/**
 * The common start of a document's run and of the batch's (access-and-approvals 7.1; code-house-rules 8.2): edit on
 * the batch and the handler's own permission on each document `documentsFor` names, at its own place, held at step 0; the batch, the decision's request
 * and the rows `more` names locked at step 1; then the batch rechecked under the locks: Validated, at the version the
 * screen read, submitted at it, its layout and mapping versions Confirmed, and its approval verified.
 */
async function held(
  deps: ImportDependencies,
  context: TransactionContext,
  input: PublishInput,
  documentsFor: (batch: BatchRow) => Promise<readonly LoadedDocument[]>,
  more: (batch: BatchRow, handler: ImportHandler) => Promise<LockTarget[]> = () => Promise.resolve([]),
): Promise<
  { readonly kind: 'held'; readonly held: Held } | { readonly kind: 'refused'; readonly refusal: CommandRefusal }
> {
  const found = await visibleBatch(context, input.batchId);
  if (found === undefined) return { kind: 'refused', refusal: BATCH_NOT_FOUND };
  const handler = handlerOf(deps.handlers, found);
  const actorId = input.actor.userId;
  const need = { action: 'edit' as const, recordType: IMPORT_BATCH_TYPE, facts: factsOfBatch(found) };
  const authorised = await deps.access.authorise(context, { actorId, ...need });
  if (authorised.kind === 'refused') return { kind: 'refused', refusal: authorised.refusal };
  // The handler's own permission on each document, at the document's own place, held with the batch's, so publishing
  // goes through the same checks as a person's change (structure-and-masters 7; module-map section 3, rule 8;
  // product owner, 10 Oct 2026).
  const forHandler = await handlerAuthority(deps, context, handler, actorId, await documentsFor(found));
  if (forHandler.kind === 'refused') return forHandler;
  const holding = await deps.access.holdAuthority(
    context,
    { kind: 'user', id: actorId },
    authorised.roleAssignmentId,
    need,
    [],
    forHandler.further,
  );
  if (holding !== undefined) return { kind: 'refused', refusal: holding };
  // The decision's request is locked with the batch at step 1, as Decide locks it (access-and-approvals 9.7).
  const decisionLocks =
    input.approvalDecisionId === undefined
      ? []
      : await deps.access.approvalLockTargets(context, input.approvalDecisionId);
  await context.lock(LOCK_STEP.document, [
    { table: BATCH_LOCK, id: found.id, mode: 'exclusive' },
    ...decisionLocks,
    ...(await more(found, handler)),
  ]);
  const checked = await recheckBatch(deps, context, {
    batchId: input.batchId,
    versionId: input.versionId,
    approvalDecisionId: input.approvalDecisionId,
    preparerId: actorId,
  });
  if (checked.kind === 'refused') return checked;
  return {
    kind: 'held',
    held: {
      batch: checked.batch,
      handler,
      roleAssignmentId: authorised.roleAssignmentId,
      handlerAssignments: forHandler.assignments,
      approvalCheck: checked.approvalCheck,
    },
  };
}

/**
 * The rechecks of a Publish under its locks (code-house-rules 8.1; 3.1 step 8, 6.4, 7.4, 13.1), a person's and a
 * queued publish's job's alike (10.6; S1-F13-T03): the batch read again, Validated, at the version asked for, submitted
 * at it, its layout and mapping versions Confirmed, its counts closed, an opening batch's gate open (4.2, 10.1), and,
 * where the handler requires an approval, the decision named verified under the lock without using it, the person who
 * publishes counted among the preparers (access-and-approvals 9.7).
 */
export async function recheckBatch(
  deps: ImportDependencies,
  context: TransactionContext,
  ask: {
    readonly batchId: string;
    /** The batch version the screen read, or the one the request to post names (code-house-rules 12.7). */
    readonly versionId: string;
    readonly approvalDecisionId: string | undefined;
    /** Who publishes, or who asked for the queued publish. */
    readonly preparerId: string;
  },
): Promise<
  | { readonly kind: 'held'; readonly batch: BatchRow; readonly approvalCheck: Held['approvalCheck'] }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal }
> {
  const refusal = (value: CommandRefusal) => ({ kind: 'refused' as const, refusal: value });
  const batch = await visibleBatch(context, ask.batchId);
  if (batch === undefined) return refusal(BATCH_NOT_FOUND);
  if (batch.state !== 'Validated') {
    return refusal({ kind: 'refused', code: 'files-imports.batch-not-validated', missing: [] });
  }
  // The version token (code-house-rules 12.7): a Publish made on a stale screen, or a request to post made for a
  // version since changed (access-and-approvals 9.6, 9.8 step 5), is refused, naming the current one.
  if (batch.versionId !== ask.versionId) {
    return refusal({
      kind: 'conflict',
      code: 'kernel.stale-version',
      missing: [{ kind: 'version', recordType: IMPORT_BATCH_TYPE, recordId: batch.id, versionId: batch.versionId }],
    });
  }
  // The review: the version submitted (13.1), and its approval where the handler requires one (3.1 step 8).
  if (batch.submittedVersionId !== batch.versionId) {
    return refusal({
      kind: 'refused',
      code: 'files-imports.review-missing',
      missing: [{ kind: 'review', review: 'submission' }],
    });
  }
  // A batch may preview with Proposed versions; Publish needs Confirmed ones (6.4; GC6-4, DEC-112).
  const versions = await versionsOf(context, batch);
  const unconfirmed = [
    ...(versions.layout.state === 'Confirmed'
      ? []
      : [{ kind: 'layout-version', layoutVersionId: versions.layout.id, state: versions.layout.state }]),
    ...(versions.mapping.state === 'Confirmed'
      ? []
      : [{ kind: 'mapping-version', mappingVersionId: versions.mapping.id, state: versions.mapping.state }]),
  ];
  if (unconfirmed.length > 0) {
    return refusal({ kind: 'refused', code: 'files-imports.version-not-confirmed', missing: unconfirmed });
  }
  // The counts close (7.4): every row the reader read is staged.
  const counts = await countsRefusal(context, batch);
  if (counts !== undefined) return refusal(counts);
  const handler = handlerOf(deps.handlers, batch);
  // An opening batch publishes only where its gate allows it (4.2, 10.1; PRD-SEC-017; S1-F13-T03).
  if (batch.kind === 'opening-balance') {
    const gate = gateRefusal(await openingGateOf(deps, context, handler, factsOfBatch(batch)));
    if (gate !== undefined) return refusal(gate);
  }
  const review = reviewOf(handler, batch);
  if (review.kind !== 'approval') return { kind: 'held', batch, approvalCheck: undefined };
  if (ask.approvalDecisionId === undefined) {
    return refusal({
      kind: 'refused',
      code: 'files-imports.review-missing',
      missing: [{ kind: 'review', review: 'approval' }],
    });
  }
  const approvalCheck: NonNullable<Held['approvalCheck']> = {
    decisionId: ask.approvalDecisionId,
    actionType: review.actionType,
    document: {
      module: 'files-imports',
      recordType: review.recordType,
      recordId: batch.id,
      versionId: batch.versionId,
    },
    preparers: await batchPreparers(context, batch, ask.preparerId),
    value: { kind: 'none' },
  };
  const verified = await deps.access.verifyUnderLock(context, approvalCheck);
  if (verified !== undefined) return refusal(verified);
  return { kind: 'held', batch, approvalCheck };
}

/** What one document's run answers: published, a duplicate, or already published or excluded (skipped). */
interface DocumentAnswer {
  readonly documentId: string;
  readonly result: 'published' | 'duplicate' | 'skipped';
  readonly records: readonly { readonly recordType: string; readonly recordId: string }[];
  readonly publishedDocumentId?: string;
  readonly revisesDocumentId?: string;
}

const documentAnswerSchema = z.object({
  documentId: z.string(),
  result: z.enum(['published', 'duplicate', 'skipped']),
  records: z.array(z.object({ recordType: z.string(), recordId: z.string() })),
  publishedDocumentId: z.string().optional(),
  revisesDocumentId: z.string().optional(),
});

/** One document's answer, read back from its kept JSON and checked, never assumed (code-house-rules 12.2). */
export function documentAnswerOf(answer: JsonValue): DocumentAnswer {
  const { publishedDocumentId, revisesDocumentId, ...parsed } = documentAnswerSchema.parse(answer);
  return {
    ...parsed,
    ...(publishedDocumentId === undefined ? {} : { publishedDocumentId }),
    ...(revisesDocumentId === undefined ? {} : { revisesDocumentId }),
  };
}

/**
 * A conflict of one document with the published document of its identity (7.2), naming the published one where it is
 * known; never the document itself.
 */
const conflict = (documentId: string, publishedDocumentId: string | undefined): CommandOutcome<JsonValue> =>
  refused({
    kind: 'refused',
    code: 'files-imports.document-conflict',
    missing: [
      publishedDocumentId === undefined || publishedDocumentId === documentId
        ? { kind: 'import-document', documentId }
        : { kind: 'import-document', documentId, conflictsWith: publishedDocumentId },
    ],
  });

/** One document published in its own transaction (3.3; 7.2, 7.3; PRD-IMP-012). */
async function publishDocument(
  deps: ImportDependencies,
  context: TransactionContext,
  input: PublishInput,
  documentId: string,
): Promise<CommandOutcome<JsonValue>> {
  let revisable: string | undefined;
  const ownDocument = async (batch: BatchRow) =>
    (await documentsOf(context, batch)).filter((each) => each.documentId === documentId);
  const start = await held(deps, context, input, ownDocument, async (batch, handler) => {
    const [document] = await ownDocument(batch);
    if (document === undefined) return [];
    // The published document a revision would replace is locked with the batch, where the actor may see it (7.3).
    const { finding } = await identityOf(context, handler, batch, document);
    revisable = finding.kind === 'revision' ? finding.of : undefined;
    return [
      { table: DOCUMENT_LOCK, id: documentId, mode: 'exclusive' as const },
      ...(revisable === undefined ? [] : [{ table: DOCUMENT_LOCK, id: revisable, mode: 'exclusive' as const }]),
      ...(await handler.lockTargets(context, document)),
    ];
  });
  if (start.kind === 'refused') return refused(start.refusal);
  const { batch, handler } = start.held;
  const handlerAssignment = start.held.handlerAssignments.get(documentId);
  if (handlerAssignment === undefined) throw new CommandDefect('A document was published without its authority');
  // The document is published on the handler's own permission at its place (13.2), so its audit record cites the
  // assignment that granted it, as the handler's own records do (numbering-and-audit 4.1).
  return publishOne(deps, context, {
    batch,
    handler,
    documentId,
    revisable,
    publisher: { userId: input.actor.userId, roleAssignmentId: handlerAssignment },
    actor: { kind: 'user', id: input.actor.userId },
    source: { kind: 'screen' },
    // The key of the command that wrote it, the document's own (numbering-and-audit 4.1 "Request"; code-house-rules
    // 12.4), so the audit record leads to the run that published the document.
    idempotencyKey: documentKey(input.key, documentId),
  });
}

/** Who publishes one document, and how its audit record names them (numbering-and-audit 4.1). */
export interface DocumentPublishing {
  readonly batch: BatchRow;
  readonly handler: ImportHandler;
  readonly documentId: string;
  /** The published document a revision of it replaces, locked with the batch (7.3). */
  readonly revisable: string | undefined;
  readonly publisher: ImportPublisher;
  readonly actor: AuditActor;
  readonly source: AuditSource;
  readonly idempotencyKey: string;
}

/**
 * One document published under the locks its caller holds (3.3; 7.2, 7.3; PRD-IMP-012): read again under them, one
 * published or excluded meanwhile is skipped; a duplicate has no effect; a conflict is refused; otherwise it is marked
 * published, its handler writes its records, and its audit record and event follow.
 */
export async function publishOne(
  deps: ImportDependencies,
  context: TransactionContext,
  publishing: DocumentPublishing,
): Promise<CommandOutcome<JsonValue>> {
  const { batch, handler, documentId, revisable } = publishing;
  // The document, read again under the lock: one published or excluded meanwhile is not published again.
  const document = (await documentsOf(context, batch)).find((each) => each.documentId === documentId);
  if (document === undefined) {
    return refused({ kind: 'not-found', code: 'files-imports.document-not-found', missing: [] });
  }
  const skipped: DocumentAnswer = { documentId, result: 'skipped', records: [] };
  if (document.state !== 'Staged' || document.excluded) {
    return { kind: 'success', answer: { ...skipped }, shows: 'nothing' };
  }
  const identity = await identityOf(context, handler, batch, document);
  const { finding } = identity;
  if (finding.kind === 'duplicate') {
    const answer: DocumentAnswer = { ...skipped, result: 'duplicate', publishedDocumentId: finding.of };
    return { kind: 'success', answer: { ...answer }, shows: 'nothing' };
  }
  if (finding.kind === 'conflict') return conflict(documentId, finding.of);
  // A revision replaces only the document locked above; another one published meanwhile is a conflict.
  if (finding.kind === 'revision' && finding.of !== revisable) return conflict(documentId, finding.of);
  const revises = finding.kind === 'revision' ? finding.of : null;
  const marked = await withSavepoint(context, 'files_imports_publish_document', [UNIQUE_VIOLATION], async () => {
    if (revises !== null) {
      const replaced = await context.tx
        .update(importDocument)
        .set({ replacedByDocumentId: documentId })
        .where(
          and(
            eq(importDocument.id, revises),
            eq(importDocument.state, 'Published'),
            isNull(importDocument.replacedByDocumentId),
          ),
        )
        .returning({ id: importDocument.id });
      if (replaced.length === 0) return false;
    }
    await context.tx
      .update(importDocument)
      .set({
        state: 'Published',
        publishedAt: context.startedAt,
        contentHash: identity.contentHash,
        revisesDocumentId: revises,
      })
      .where(and(eq(importDocument.id, documentId), eq(importDocument.state, 'Staged')));
    return true;
  });
  if (marked.kind === 'caught' || !marked.value) {
    // Another publish of the same identity committed first (PRD-INT-005): the same content is a duplicate.
    const winner = await publishedDocument(context, {
      target: identity.target,
      scopeKey: identity.scopeKey,
      reference: document.reference,
    });
    if (winner?.contentHash === identity.contentHash) {
      const answer: DocumentAnswer = { ...skipped, result: 'duplicate', publishedDocumentId: winner.documentId };
      return { kind: 'success', answer: { ...answer }, shows: 'nothing' };
    }
    // The winner, else the document a revision meant to replace, which another revision replaced first.
    return conflict(documentId, winner?.documentId ?? revises ?? undefined);
  }
  const published = await handler.publish(context, publishing.publisher, document, {
    batchId: batch.id,
    batchVersionId: batch.versionId,
    batchCode: batch.code,
    documentId,
    stagedRowIds: document.rows.map((row) => row.stagedRowId),
    firstRowNumber: document.rows[0]?.rowNumber ?? 1,
    storedFileId: batch.storedFileId,
    layoutVersionId: batch.layoutVersionId,
    mappingVersionId: batch.mappingVersionId,
    preparers: await batchPreparers(context, batch, publishing.publisher.userId),
  });
  if (published.kind === 'refused') {
    // Everything the document's run wrote rolls back; the batch's run keeps its outcome (7.4; PRD-IMP-012).
    return refused({
      kind: 'refused',
      code: 'files-imports.document-refused',
      missing: [{ kind: 'import-document', documentId, reason: published.refusal.code }, ...published.refusal.missing],
    });
  }
  const facts = factsOfBatch(batch);
  await deps.audit.record(context, {
    actor: publishing.actor,
    roleAssignmentId: publishing.publisher.roleAssignmentId,
    scope: facts,
    record: { module: 'files-imports', type: IMPORT_BATCH_TYPE, id: batch.id, versionId: batch.versionId },
    operation: 'publish-import-document',
    changes: [
      { kind: 'value', field: 'documentId', before: null, after: documentId },
      { kind: 'value', field: 'documentState', before: 'Staged', after: 'Published' },
      ...(revises === null
        ? []
        : [{ kind: 'value' as const, field: 'revisesDocumentId', before: null, after: revises }]),
      { kind: 'value', field: 'records', before: null, after: published.records.map((record) => record.recordId) },
    ],
    source: publishing.source,
    idempotencyKey: publishing.idempotencyKey,
  });
  await context.publish(importPublished, {
    subject: { module: 'files-imports', recordType: IMPORT_BATCH_TYPE, recordId: batch.id, versionId: batch.versionId },
    scope: facts,
    payload: { batchId: batch.id, documentId },
  });
  const answer: DocumentAnswer = {
    documentId,
    result: 'published',
    records: published.records.map((record) => ({ ...record })),
    ...(revises === null ? {} : { revisesDocumentId: revises }),
  };
  return { kind: 'success', answer: { ...answer, records: [...answer.records] }, shows: 'nothing' };
}

/** What became of one document's run, as the batch's outcome keeps it (7.4). */
function attemptOf(
  answer: IdempotentAnswer<JsonValue>,
): Omit<OutcomeDocument, 'documentId' | 'rows'> | 'stop' | undefined {
  if (answer.kind === 'refusal') {
    if (!DOCUMENT_REFUSALS.includes(answer.refusal.code)) return 'stop';
    const [first] = answer.refusal.missing;
    const conflictsWith = first !== undefined && 'conflictsWith' in first ? first.conflictsWith : undefined;
    const reason = first !== undefined && 'reason' in first ? first.reason : answer.refusal.code;
    return answer.refusal.code === 'files-imports.document-conflict'
      ? {
          result: 'conflict',
          records: [],
          refusalCode: answer.refusal.code,
          ...(conflictsWith === undefined ? {} : { publishedDocumentId: conflictsWith }),
        }
      : { result: 'refused', records: [], refusalCode: reason };
  }
  const value = documentAnswerOf(answer.answer);
  // Published or excluded before this run: the batch's run reads which from the document itself.
  if (value.result === 'skipped') return undefined;
  return {
    result: value.result,
    records: value.records.map((record) => ({ ...record })),
    ...(value.publishedDocumentId === undefined ? {} : { publishedDocumentId: value.publishedDocumentId }),
    ...(value.revisesDocumentId === undefined ? {} : { revisesDocumentId: value.revisesDocumentId }),
  };
}

/**
 * Who an attempt is written for (7.4; numbering-and-audit 4.1): the person it is attempted by, the actor and assignment
 * its audit record names, the key and source of the command; for a queued publish's job, the request it answers, the
 * refusal it came to, and that the approval's use is recorded already, before the documents (DEC-097; S1-F13-T03).
 */
export interface Attempting {
  readonly attemptedByUserId: string;
  readonly actor: AuditActor;
  /** The assignment its audit record cites; none where the attempt was refused before any authority was found. */
  readonly roleAssignmentId: string | undefined;
  readonly key: string;
  readonly source: AuditSource;
  readonly useRecorded: boolean;
  readonly publishRequestId?: string;
  readonly refusalCode?: string;
}

/**
 * The batch's run (7.4; 3.2): the outcome of the attempt, for the batch and each document, written whatever became of
 * it; the batch Published when every document chosen has posted or is a duplicate, its approval's use recorded then;
 * otherwise it stays Validated, so it can be corrected.
 */
export async function writeOutcome(
  deps: ImportDependencies,
  context: TransactionContext,
  attempting: Attempting,
  start: Pick<Held, 'batch' | 'handler' | 'approvalCheck'>,
  attempts: ReadonlyMap<string, Omit<OutcomeDocument, 'documentId' | 'rows'>>,
): Promise<CommandOutcome<JsonValue>> {
  const { batch, handler } = start;
  const documents = await documentsOf(context, batch);
  const results = new Map<string, Omit<OutcomeDocument, 'documentId' | 'rows'>>();
  for (const document of documents) {
    const attempt = attempts.get(document.documentId);
    if (document.state === 'Published') {
      results.set(document.documentId, {
        result: 'published',
        records: attempt?.result === 'published' ? attempt.records : [],
        ...(document.revisesDocumentId === null ? {} : { revisesDocumentId: document.revisesDocumentId }),
      });
    } else if (document.excluded) {
      results.set(document.documentId, { result: 'excluded', records: [] });
    } else if (attempt !== undefined) {
      results.set(document.documentId, attempt);
    } else {
      results.set(document.documentId, {
        ...(await projectedResult(context, handler, batch, document)),
        records: [],
      });
    }
  }
  const outcome = await batchOutcome(context, handler, batch, documents, results);
  const done: readonly DocumentResult[] = ['published', 'duplicate', 'excluded'];
  const chosenResults = outcome.documents.filter((document) => document.result !== 'excluded');
  const allDone = chosenResults.length > 0 && chosenResults.every((document) => done.includes(document.result));
  const failing = outcome.documents.find((document) => !done.includes(document.result));
  const actorId = attempting.attemptedByUserId;
  if (allDone && start.approvalCheck !== undefined && !attempting.useRecorded) {
    const used = await deps.access.recordUse(context, {
      ...start.approvalCheck,
      useId: uuidv7(),
      actor: attempting.actor,
    });
    if (used !== undefined) return refused(used);
  }
  const state = allDone ? 'Published' : 'Validated';
  if (allDone) await context.tx.update(importBatch).set({ state: 'Published' }).where(eq(importBatch.id, batch.id));
  const outcomeId = uuidv7();
  const result = allDone ? 'published' : 'failed';
  await context.tx.insert(importOutcome).values({
    id: outcomeId,
    batchId: batch.id,
    batchVersionId: batch.versionId,
    result,
    refusalCode: allDone
      ? null
      : (attempting.refusalCode ??
        (failing?.result === 'conflict' ? 'files-imports.document-conflict' : 'files-imports.document-refused')),
    counts: outcome.counts,
    documents: outcome.documents,
    measures: outcome.measures,
    controlTotals: outcome.controlTotals,
    attemptedByUserId: actorId,
    attemptedAt: context.startedAt,
    ...scopeColumnsOf(batch),
    publishRequestId: attempting.publishRequestId ?? null,
  });
  const facts = factsOfBatch(batch);
  await deps.audit.record(context, {
    actor: attempting.actor,
    ...(attempting.roleAssignmentId === undefined ? {} : { roleAssignmentId: attempting.roleAssignmentId }),
    scope: facts,
    record: { module: 'files-imports', type: IMPORT_BATCH_TYPE, id: batch.id, versionId: batch.versionId },
    operation: 'publish-import',
    changes: [
      { kind: 'value', field: 'state', before: 'Validated', after: state },
      { kind: 'value', field: 'outcomeId', before: null, after: outcomeId },
      { kind: 'value', field: 'result', before: null, after: result },
      ...(attempting.publishRequestId === undefined
        ? []
        : [{ kind: 'value' as const, field: 'publishRequestId', before: null, after: attempting.publishRequestId }]),
    ],
    source: attempting.source,
    idempotencyKey: attempting.key,
  });
  const subject = {
    module: 'files-imports',
    recordType: IMPORT_BATCH_TYPE,
    recordId: batch.id,
    versionId: batch.versionId,
  };
  if (allDone) {
    await context.publish(importPublished, { subject, scope: facts, payload: { batchId: batch.id } });
  } else {
    await context.publish(importFailed, { subject, scope: facts, payload: { batchId: batch.id, outcomeId } });
  }
  return {
    kind: 'success',
    answer: {
      batchId: batch.id,
      state,
      outcomeId,
      result,
      documents: outcome.documents.map((document) => ({
        documentId: document.documentId,
        result: document.result,
        ...(document.refusalCode === undefined ? {} : { refusalCode: document.refusalCode }),
      })),
    },
    shows: 'nothing',
  };
}

/** The request to post a batch that no attempt has answered yet, the latest one first (10.6; S1-F13-T03). */
export async function pendingRequest(
  context: TransactionContext,
  batchId: string,
): Promise<{ readonly id: string; readonly requestedAt: Date } | undefined> {
  const [row] = await context.tx
    .select({ id: publishRequest.id, requestedAt: publishRequest.requestedAt })
    .from(publishRequest)
    .where(
      and(
        eq(publishRequest.batchId, batchId),
        sql`not exists (select 1 from ${importOutcome} where ${importOutcome.publishRequestId} = ${publishRequest.id})`,
      ),
    )
    // By the time it was asked (code-house-rules 9), the identifier only breaking a tie.
    .orderBy(desc(publishRequest.requestedAt), desc(publishRequest.id))
    .limit(1);
  return row;
}

/**
 * Publish of a batch whose handler's documents post through a queued job (10.6; stock-ledger 10.6; access-and-approvals
 * 9.8 step 1; S1-F13-T03): the batch held and rechecked as for any Publish, its gate and its approval verified under
 * the locks, then a request to post naming the batch version and the decision, the outbox row for the job, and the
 * audit record, with no stock or money effect; the batch stays Validated with the job's state beside it (3.2). One
 * request at a time: another is refused while one waits. The job publishes every document chosen in one transaction,
 * whole or not at all, and records the decision's use there (DEC-097).
 */
async function requestPublish(deps: ImportDependencies, input: PublishInput): Promise<IdempotentAnswer<JsonValue>> {
  return deps.helper.run(
    {
      commandName: COMMAND,
      organisation: input.actor.organisation,
      correlationId: input.actor.correlationId,
      actor: { kind: 'actor', actorId: input.actor.userId },
    },
    {
      key: input.key,
      content: input.content,
      authoriseReplay: batchReplayAuthorisation(deps, input),
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const start = await held(deps, context, input, async (batch) => toPublish(await documentsOf(context, batch)));
        if (start.kind === 'refused') return refused(start.refusal);
        const { batch, handler } = start.held;
        const waiting = await pendingRequest(context, batch.id);
        if (waiting !== undefined) {
          return refused({
            kind: 'refused',
            code: 'files-imports.publish-queued',
            missing: [{ kind: 'publish-request', publishRequestId: waiting.id }],
          });
        }
        const documents = toPublish(await documentsOf(context, batch));
        if (documents.length === 0) {
          return refused({ kind: 'refused', code: 'files-imports.nothing-to-publish', missing: [] });
        }
        const queued = handler.queued;
        if (queued === undefined) throw new CommandDefect('A queued publish was asked of a handler that posts none');
        const books = new Set<string>();
        for (const document of documents) books.add(await queued.postingBook(context, document));
        const [bookId] = books;
        if (bookId === undefined || books.size > 1) {
          // One job posts the batch in one transaction, in the queue of one book (stock-ledger 10.6).
          return refused({
            kind: 'refused',
            code: 'files-imports.several-books',
            missing: [...books].map((each) => ({ kind: 'accounting-book', bookId: each })),
          });
        }
        const publishRequestId = uuidv7();
        await context.tx.insert(publishRequest).values({
          id: publishRequestId,
          batchId: batch.id,
          batchVersionId: batch.versionId,
          approvalDecisionId: input.approvalDecisionId ?? null,
          accountingBookId: bookId,
          requestedByUserId: input.actor.userId,
          requestedAt: context.startedAt,
          ...scopeColumnsOf(batch),
        });
        const facts = factsOfBatch(batch);
        await deps.audit.record(context, {
          actor: { kind: 'user', id: input.actor.userId },
          roleAssignmentId: start.held.roleAssignmentId,
          scope: facts,
          record: { module: 'files-imports', type: IMPORT_BATCH_TYPE, id: batch.id, versionId: batch.versionId },
          operation: 'request-publish',
          changes: [{ kind: 'value', field: 'publishRequestId', before: null, after: publishRequestId }],
          source: { kind: 'screen' },
          idempotencyKey: input.key,
        });
        await context.publish(publishRequested, {
          subject: {
            module: 'files-imports',
            recordType: IMPORT_BATCH_TYPE,
            recordId: batch.id,
            versionId: batch.versionId,
          },
          scope: facts,
          payload: { publishRequestId, batchId: batch.id, bookId },
        });
        return {
          kind: 'success',
          answer: { batchId: batch.id, state: 'Validated', result: 'queued', publishRequestId, documents: [] },
          shows: 'nothing',
        };
      },
    },
  );
}

export async function publishImport(
  deps: ImportDependencies,
  input: PublishInput,
): Promise<IdempotentAnswer<JsonValue>> {
  const header = (commandName: string) => ({
    commandName,
    organisation: input.actor.organisation,
    correlationId: input.actor.correlationId,
    actor: { kind: 'actor' as const, actorId: input.actor.userId },
  });
  // A handler whose documents post through a queued job: Publish records the request to post (10.6; S1-F13-T03).
  const queued = await deps.runner.read(header(COMMAND), async (context) => {
    const batch = await visibleBatch(context, input.batchId);
    return batch !== undefined && handlerOf(deps.handlers, batch).queued !== undefined;
  });
  if (queued) return requestPublish(deps, input);
  // The documents to publish, read before any transaction that writes; each run reads its own again under its lock.
  // When the handler's permission does not cover every one of them at its own place, none is run: the batch's run
  // answers the refusal, naming the document, and nothing is published (product owner, 10 Oct 2026).
  const chosen = await deps.runner.read(header(COMMAND), async (context) => {
    const batch = await visibleBatch(context, input.batchId);
    if (batch?.state !== 'Validated') return [];
    const documents = toPublish(await documentsOf(context, batch));
    const handler = handlerOf(deps.handlers, batch);
    const authority = await handlerAuthority(deps, context, handler, input.actor.userId, documents);
    return authority.kind === 'refused' ? [] : documents.map((document) => document.documentId);
  });
  const attempts = new Map<string, Omit<OutcomeDocument, 'documentId' | 'rows'>>();
  for (const documentId of chosen) {
    const answer = await deps.helper.run(header(DOCUMENT_COMMAND), {
      key: documentKey(input.key, documentId),
      content: {
        pathParameters: { batchId: input.batchId, documentId },
        body: { versionId: input.versionId, approvalDecisionId: input.approvalDecisionId ?? null },
        secretFields: [],
        restrictedFields: [],
      },
      authoriseReplay: batchReplayAuthorisation(deps, input),
      work: (context) => publishDocument(deps, context, input, documentId),
    });
    const attempt = attemptOf(answer);
    // A refusal of the batch, such as a stale version or a missing review, is the batch run's to answer.
    if (attempt === 'stop') break;
    if (attempt !== undefined) attempts.set(documentId, attempt);
  }
  return deps.helper.run(header(COMMAND), {
    key: input.key,
    content: input.content,
    authoriseReplay: batchReplayAuthorisation(deps, input),
    work: async (context): Promise<CommandOutcome<JsonValue>> => {
      // The handler's permission on every document still to publish, at its own place, as the documents' runs held it.
      const start = await held(deps, context, input, async (batch) => toPublish(await documentsOf(context, batch)));
      if (start.kind === 'refused') return refused(start.refusal);
      return writeOutcome(
        deps,
        context,
        {
          attemptedByUserId: input.actor.userId,
          actor: { kind: 'user', id: input.actor.userId },
          roleAssignmentId: start.held.roleAssignmentId,
          key: input.key,
          source: { kind: 'screen' },
          useRecorded: false,
        },
        start.held,
        attempts,
      );
    },
  });
}
