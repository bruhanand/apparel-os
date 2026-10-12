import { IMPORT_BATCH_TYPE } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import type { CommandOutcome, IdempotentAnswer, JsonValue, RequestContent } from '../../../kernel/index.js';
import { importBatch } from '../db/schema.js';
import { importFailed } from '../events.js';
import { factsOfBatch, type ImportActor, type ImportDependencies } from './import-common.js';
import { batchReplayAuthorisation, heldBatch, staleBatchVersion } from './validate-import.js';

// Withdraw (imports-and-opening-data 3.2, 13.1; PRD-IMP-012; S1-F06-T04): the preparer withdraws a Staged or Validated
// batch, for example when every document is excluded, a duplicate or a conflict, and it becomes Failed. Its staged
// rows, issues and outcomes are kept, and a document it published before stays published (PRD-MOD-011); a Published or
// Failed batch is never changed. The batch version the screen read travels with it (code-house-rules 12.7). A file
// whose every batch for a target and layout has Failed may start a new one (7.2).

export interface WithdrawInput {
  readonly actor: ImportActor;
  readonly batchId: string;
  readonly key: string;
  readonly content: RequestContent;
  readonly versionId: string;
}

export async function withdrawImport(
  deps: ImportDependencies,
  input: WithdrawInput,
): Promise<IdempotentAnswer<JsonValue>> {
  return deps.helper.run(
    {
      commandName: 'files-imports.withdraw-import',
      organisation: input.actor.organisation,
      correlationId: input.actor.correlationId,
      actor: { kind: 'actor', actorId: input.actor.userId },
    },
    {
      key: input.key,
      content: input.content,
      authoriseReplay: batchReplayAuthorisation(deps, input),
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const held = await heldBatch(deps, context, input);
        if (held.kind === 'refusal') return held.outcome;
        const { batch } = held;
        if (batch.state === 'Published' || batch.state === 'Failed') {
          return {
            kind: 'refusal',
            refusal: { kind: 'refused', code: 'files-imports.batch-not-open', missing: [] },
            causedBySecret: false,
          };
        }
        const stale = staleBatchVersion(batch, input.versionId);
        if (stale !== undefined) return stale;
        await context.tx.update(importBatch).set({ state: 'Failed' }).where(eq(importBatch.id, batch.id));
        const facts = factsOfBatch(batch);
        await deps.audit.record(context, {
          actor: { kind: 'user', id: input.actor.userId },
          roleAssignmentId: held.roleAssignmentId,
          scope: facts,
          record: { module: 'files-imports', type: IMPORT_BATCH_TYPE, id: batch.id, versionId: batch.versionId },
          operation: 'withdraw-import',
          changes: [{ kind: 'value', field: 'state', before: batch.state, after: 'Failed' }],
          source: { kind: 'screen' },
          idempotencyKey: input.key,
        });
        await context.publish(importFailed, {
          subject: {
            module: 'files-imports',
            recordType: IMPORT_BATCH_TYPE,
            recordId: batch.id,
            versionId: batch.versionId,
          },
          scope: facts,
          payload: { batchId: batch.id },
        });
        return {
          kind: 'success',
          answer: { batchId: batch.id, state: 'Failed', versionId: batch.versionId },
          shows: 'nothing',
        };
      },
    },
  );
}
