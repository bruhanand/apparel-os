import { uuidv7 } from '@apparel-os/domain';
import { IMPORT_BATCH_TYPE, type MissingItem } from '@apparel-os/schemas';
import { and, eq } from 'drizzle-orm';
import type {
  CommandOutcome,
  CommandRefusal,
  IdempotentAnswer,
  JsonValue,
  LockTarget,
  RequestContent,
  TransactionContext,
} from '../../../kernel/index.js';
import { importBatch, importDocument, stagedRow, stagedValueEntry } from '../db/schema.js';
import {
  factsOfBatch,
  handlerOf,
  scopeColumnsOf,
  type BatchRow,
  type ImportActor,
  type ImportDependencies,
} from './import-common.js';
import { batchReplayAuthorisation, heldBatch } from './validate-import.js';

// Staging edits (imports-and-opening-data 3.2, 5, 13.1 "Map and stage"; PRD-IMP-006, PRD-IMP-009, PRD-ACS-007;
// S1-F06-T03): a value entered by a person in a staged row, with who, when, the reason and the suggestion it came
// from, the original cell never overwritten; and a document excluded from publishing or put back. Each makes a new
// batch version and returns a Validated batch to Staged, so validation runs again; an open approval request on the old
// version ends as Superseded (access-and-approvals 9.6). A Published or Failed batch is never edited.

const refusal = (
  kind: CommandRefusal['kind'],
  code: string,
  missing: MissingItem[] = [],
): CommandOutcome<JsonValue> => ({
  kind: 'refusal',
  refusal: { kind, code, missing },
  causedBySecret: false,
});

/**
 * The capability an AI suggestion needs: the AI gateway's, switched off by default (module-map 4.7 and 2.1; DEC-105,
 * PRD-SEC-017). The gateway arrives in stage 2 (MM-14), so in stage 1 an AI suggestion is always unavailable.
 */
export const AI_DRAFTS_CAPABILITY = 'ai-gateway.drafts';

/** The open request of the version submitted, which a staging edit supersedes, locked with the batch (8.2). */
export async function submittedRequestLocks(
  deps: ImportDependencies,
  context: TransactionContext,
  batch: BatchRow,
): Promise<(LockTarget & { mode: 'exclusive' })[]> {
  const handler = handlerOf(deps.handlers, batch);
  if (handler.review.kind !== 'approval' || batch.submittedVersionId === null) return [];
  const targets = await deps.access.requestLockTargets(context, {
    module: 'files-imports',
    recordType: IMPORT_BATCH_TYPE,
    recordId: batch.id,
    versionId: batch.submittedVersionId,
    actionType: handler.review.actionType,
  });
  return targets.map((target) => ({ ...target, mode: 'exclusive' as const }));
}

/**
 * Makes a new batch version, Staged and not submitted (3.2), and supersedes the open approval request on the version
 * that was submitted, where its handler requires one (PRD-ACS-007). Answers the new version.
 */
export async function newBatchVersion(
  deps: ImportDependencies,
  context: TransactionContext,
  batch: BatchRow,
  by: { readonly userId: string; readonly roleAssignmentId: string },
): Promise<string> {
  const versionId = uuidv7();
  await context.tx
    .update(importBatch)
    .set({ state: 'Staged', versionId, submittedVersionId: null })
    .where(eq(importBatch.id, batch.id));
  const handler = handlerOf(deps.handlers, batch);
  if (handler.review.kind === 'approval' && batch.submittedVersionId !== null) {
    await deps.access.supersedeRequest(
      context,
      {
        module: 'files-imports',
        recordType: IMPORT_BATCH_TYPE,
        recordId: batch.id,
        versionId: batch.submittedVersionId,
        actionType: handler.review.actionType,
      },
      by,
    );
  }
  return versionId;
}

const OPEN_STATES: readonly string[] = ['Staged', 'Validated'];

export interface EnterValueInput {
  readonly actor: ImportActor;
  readonly batchId: string;
  readonly stagedRowId: string;
  readonly key: string;
  readonly content: RequestContent;
  readonly body: {
    readonly field: string;
    readonly value: string;
    readonly reason: string;
    readonly suggestion?:
      | { readonly kind: 'exact' | 'close'; readonly value: string; readonly label?: string | undefined }
      | { readonly kind: 'ai' }
      | undefined;
  };
}

/** Enter a value in a staged row (section 5 "Entered by a person"; PRD-IMP-009). */
export async function enterStagedValue(
  deps: ImportDependencies,
  input: EnterValueInput,
): Promise<IdempotentAnswer<JsonValue>> {
  const { body } = input;
  return deps.helper.run(
    {
      commandName: 'files-imports.enter-staged-value',
      organisation: input.actor.organisation,
      correlationId: input.actor.correlationId,
      actor: { kind: 'actor', actorId: input.actor.userId },
    },
    {
      key: input.key,
      content: input.content,
      authoriseReplay: batchReplayAuthorisation(deps, input),
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        // AI drafts arrive with the AI gateway, whose capability is off: no AI suggestion is accepted (DEC-105).
        if (body.suggestion?.kind === 'ai') {
          return refusal('unavailable', 'files-imports.ai-suggestions-unavailable', [
            { kind: 'capability', capability: AI_DRAFTS_CAPABILITY },
          ]);
        }
        const held = await heldBatch(deps, context, input, (batch) => submittedRequestLocks(deps, context, batch));
        if (held.kind === 'refusal') return held.outcome;
        const { batch } = held;
        if (!OPEN_STATES.includes(batch.state)) return refusal('refused', 'files-imports.batch-not-open');
        const [row] = await context.tx
          .select()
          .from(stagedRow)
          .where(and(eq(stagedRow.id, input.stagedRowId), eq(stagedRow.batchId, batch.id), eq(stagedRow.role, 'data')));
        if (row === undefined) return refusal('not-found', 'files-imports.staged-row-not-found');
        // A published document is never edited (7.3; PRD-MOD-011): its rows stay as they were published (S1-F06-T04).
        const [document] = await context.tx
          .select({ state: importDocument.state })
          .from(importDocument)
          .where(eq(importDocument.id, row.documentId ?? row.id));
        if (document?.state !== 'Staged') return refusal('refused', 'files-imports.document-not-staged');
        const handler = handlerOf(deps.handlers, batch);
        if (!handler.fields.some((field) => field.name === body.field)) {
          return refusal('refused', 'files-imports.field-unknown', [{ kind: 'import-field', field: body.field }]);
        }
        const by = { userId: input.actor.userId, roleAssignmentId: held.roleAssignmentId };
        const versionId = await newBatchVersion(deps, context, batch, by);
        const entryId = uuidv7();
        await context.tx.insert(stagedValueEntry).values({
          id: entryId,
          batchId: batch.id,
          stagedRowId: row.id,
          field: body.field,
          value: body.value.trim(),
          reason: body.reason.trim(),
          suggestion:
            body.suggestion === undefined
              ? null
              : {
                  kind: body.suggestion.kind,
                  value: body.suggestion.value,
                  ...(body.suggestion.label === undefined ? {} : { label: body.suggestion.label }),
                },
          batchVersionId: versionId,
          enteredByUserId: input.actor.userId,
          enteredAt: context.startedAt,
          ...scopeColumnsOf(batch),
        });
        // The value itself stays in the entry, under the batch's scope; the audit record names the entry (4.1).
        await deps.audit.record(context, {
          actor: { kind: 'user', id: input.actor.userId },
          roleAssignmentId: held.roleAssignmentId,
          scope: factsOfBatch(batch),
          record: { module: 'files-imports', type: IMPORT_BATCH_TYPE, id: batch.id, versionId },
          operation: 'enter-staged-value',
          changes: [
            { kind: 'value', field: 'entryId', before: null, after: entryId },
            { kind: 'value', field: 'stagedRowId', before: null, after: row.id },
            { kind: 'value', field: 'field', before: null, after: body.field },
            { kind: 'value', field: 'state', before: batch.state, after: 'Staged' },
            { kind: 'value', field: 'versionId', before: batch.versionId, after: versionId },
          ],
          source: { kind: 'screen' },
          idempotencyKey: input.key,
        });
        return {
          kind: 'success',
          answer: { batchId: batch.id, state: 'Staged', versionId, entryId },
          shows: 'nothing',
        };
      },
    },
  );
}

export interface ExclusionInput {
  readonly actor: ImportActor;
  readonly batchId: string;
  readonly documentId: string;
  readonly key: string;
  readonly content: RequestContent;
  readonly excluded: boolean;
}

/** Exclude a document from publishing, or put it back (3.2). Asking for the state it is in changes nothing. */
export async function excludeImportDocument(
  deps: ImportDependencies,
  input: ExclusionInput,
): Promise<IdempotentAnswer<JsonValue>> {
  return deps.helper.run(
    {
      commandName: 'files-imports.exclude-document',
      organisation: input.actor.organisation,
      correlationId: input.actor.correlationId,
      actor: { kind: 'actor', actorId: input.actor.userId },
    },
    {
      key: input.key,
      content: input.content,
      authoriseReplay: batchReplayAuthorisation(deps, input),
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const held = await heldBatch(deps, context, input, (batch) => submittedRequestLocks(deps, context, batch));
        if (held.kind === 'refusal') return held.outcome;
        const { batch } = held;
        if (!OPEN_STATES.includes(batch.state)) return refusal('refused', 'files-imports.batch-not-open');
        const [document] = await context.tx
          .select()
          .from(importDocument)
          .where(and(eq(importDocument.id, input.documentId), eq(importDocument.batchId, batch.id)));
        if (document === undefined) return refusal('not-found', 'files-imports.document-not-found');
        if (document.state !== 'Staged') return refusal('refused', 'files-imports.document-not-staged');
        if (document.excluded === input.excluded) {
          return {
            kind: 'success',
            answer: { batchId: batch.id, state: batch.state, versionId: batch.versionId },
            shows: 'nothing',
          };
        }
        const by = { userId: input.actor.userId, roleAssignmentId: held.roleAssignmentId };
        const versionId = await newBatchVersion(deps, context, batch, by);
        await context.tx
          .update(importDocument)
          .set({ excluded: input.excluded })
          .where(eq(importDocument.id, document.id));
        await deps.audit.record(context, {
          actor: { kind: 'user', id: input.actor.userId },
          roleAssignmentId: held.roleAssignmentId,
          scope: factsOfBatch(batch),
          record: { module: 'files-imports', type: IMPORT_BATCH_TYPE, id: batch.id, versionId },
          operation: input.excluded ? 'exclude-import-document' : 'put-back-import-document',
          changes: [
            { kind: 'value', field: 'documentId', before: null, after: document.id },
            { kind: 'value', field: 'excluded', before: document.excluded, after: input.excluded },
            { kind: 'value', field: 'state', before: batch.state, after: 'Staged' },
            { kind: 'value', field: 'versionId', before: batch.versionId, after: versionId },
          ],
          source: { kind: 'screen' },
          idempotencyKey: input.key,
        });
        return { kind: 'success', answer: { batchId: batch.id, state: 'Staged', versionId }, shows: 'nothing' };
      },
    },
  );
}
