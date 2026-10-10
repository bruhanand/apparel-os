import { IMPORT_BATCH_TYPE } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import {
  LOCK_STEP,
  lockTable,
  type CommandOutcome,
  type IdempotentAnswer,
  type JsonValue,
  type ReplayAuthorisation,
  type RequestContent,
} from '../../../kernel/index.js';
import { importBatch } from '../db/schema.js';
import {
  BATCH_NOT_FOUND,
  documentsOf,
  factsOfBatch,
  handlerOf,
  previewOf,
  visibleBatch,
  type ImportActor,
  type ImportDependencies,
} from './import-common.js';

// Validate and preview (imports-and-opening-data 3.1 steps 6 and 7, 3.2, 13.1, 13.2; PRD-IMP-005, PRD-MOD-015;
// S1-F06-T01): every required field known, then the target's handler works out what each document would create,
// without writing. When every document previews without an issue the batch is Validated; otherwise it stays Staged,
// and its read shows the issues. As built for the tracer: the validation report, row issues kept as records, control
// totals and submission are S1-F06-T03's.

export interface BatchStepInput {
  readonly actor: ImportActor;
  readonly batchId: string;
  readonly key: string;
  readonly content: RequestContent;
}

const COMMAND = 'files-imports.validate-import';
export const BATCH_LOCK = lockTable('files_imports', 'import_batch');

/** A replay's access check: edit on the batch now, with its facts, as the step itself needs (code-house-rules 12.4). */
export function batchReplayAuthorisation(deps: ImportDependencies, input: BatchStepInput): ReplayAuthorisation {
  return async (context) => {
    const batch = await visibleBatch(context, input.batchId);
    if (batch === undefined) return { kind: 'refused', refusal: BATCH_NOT_FOUND };
    const authorised = await deps.access.authorise(context, {
      actorId: input.actor.userId,
      action: 'edit',
      recordType: IMPORT_BATCH_TYPE,
      facts: factsOfBatch(batch),
    });
    if (authorised.kind === 'allowed') return { kind: 'allowed' };
    return {
      kind: 'refused',
      refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
    };
  };
}

export async function validateImport(
  deps: ImportDependencies,
  input: BatchStepInput,
): Promise<IdempotentAnswer<JsonValue>> {
  const authoriseReplay = batchReplayAuthorisation(deps, input);
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
      authoriseReplay,
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const found = await visibleBatch(context, input.batchId);
        if (found === undefined) return { kind: 'refusal', refusal: BATCH_NOT_FOUND, causedBySecret: false };
        const need = { action: 'edit' as const, recordType: IMPORT_BATCH_TYPE, facts: factsOfBatch(found) };
        const authorised = await deps.access.authorise(context, { actorId: input.actor.userId, ...need });
        if (authorised.kind === 'refused') {
          return { kind: 'refusal', refusal: authorised.refusal, causedBySecret: false };
        }
        const held = await deps.access.holdAuthority(
          context,
          { kind: 'user', id: input.actor.userId },
          authorised.roleAssignmentId,
          need,
        );
        if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
        await context.lock(LOCK_STEP.document, [{ table: BATCH_LOCK, id: found.id, mode: 'exclusive' }]);
        // Rechecked under the lock (code-house-rules 8.2).
        const batch = await visibleBatch(context, input.batchId);
        if (batch === undefined) return { kind: 'refusal', refusal: BATCH_NOT_FOUND, causedBySecret: false };
        if (batch.state !== 'Staged') {
          return {
            kind: 'refusal',
            refusal: { kind: 'refused', code: 'files-imports.batch-not-staged', missing: [] },
            causedBySecret: false,
          };
        }
        const handler = handlerOf(deps.handlers, batch);
        const documents = await documentsOf(context, batch.id);
        let clear = documents.length > 0;
        for (const document of documents) {
          if ((await previewOf(context, handler, document)).kind !== 'would-create') clear = false;
        }
        if (!clear) return { kind: 'success', answer: { batchId: batch.id, state: batch.state }, shows: 'nothing' };
        await context.tx.update(importBatch).set({ state: 'Validated' }).where(eq(importBatch.id, batch.id));
        await deps.audit.record(context, {
          actor: { kind: 'user', id: input.actor.userId },
          roleAssignmentId: authorised.roleAssignmentId,
          scope: factsOfBatch(batch),
          record: { module: 'files-imports', type: IMPORT_BATCH_TYPE, id: batch.id },
          operation: 'validate-import',
          changes: [{ kind: 'value', field: 'state', before: 'Staged', after: 'Validated' }],
          source: { kind: 'screen' },
          idempotencyKey: input.key,
        });
        return { kind: 'success', answer: { batchId: batch.id, state: 'Validated' }, shows: 'nothing' };
      },
    },
  );
}
