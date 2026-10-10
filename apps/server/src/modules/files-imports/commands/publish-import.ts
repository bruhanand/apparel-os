import { uuidv7 } from '@apparel-os/domain';
import { IMPORT_BATCH_TYPE } from '@apparel-os/schemas';
import { and, eq, ne } from 'drizzle-orm';
import {
  ApiRefusal,
  LOCK_STEP,
  type CommandOutcome,
  type IdempotentAnswer,
  type JsonValue,
  type TransactionContext,
} from '../../../kernel/index.js';
import { importBatch, importDocument, importOutcome, stagedRow } from '../db/schema.js';
import { stagedValueEntry } from '../db/schema.js';
import { outcomeCounts, type OutcomeDocument } from '../domain/outcome.js';
import { publishLimitRefusal } from '../domain/publish-limit.js';
import {
  BATCH_NOT_FOUND,
  documentsOf,
  factsOfBatch,
  handlerOf,
  versionsOf,
  visibleBatch,
  type BatchRow,
  type ImportDependencies,
  type LoadedDocument,
} from './import-common.js';
import { BATCH_LOCK, batchReplayAuthorisation, type BatchStepInput } from './validate-import.js';

// Publish (imports-and-opening-data 3.1 steps 9 and 10, 3.2, 7.4, 13.1, 13.2; structure-and-masters 7; PRD-IMP-012,
// PRD-IMP-013, PRD-MOD-002; S1-F06-T01). The target's handler writes its own records in the transaction it is given,
// through its Maintain operation; files-imports writes none of them. A required document posts whole or not at all.
// An outcome is written for every attempt, a failed one included.
//
// The publishing limit of S1-F06-T01 comes first: outside local work, tests and `dev`, Publish answers unavailable
// naming the controls still missing, and writes nothing (product owner, 6 Oct 2026; PRD-SEC-017, PRD-UXP-003).
//
// Publish needs the review (3.1 step 8, 6.4, 13.1; S1-F06-T03): the batch version submitted, its layout and mapping
// versions Confirmed, and, where the handler requires an approval in `access`, a decision of that exact version,
// verified under the locks and its use recorded (access-and-approvals 9.7, 9.8). An excluded document is not
// published. As built, the batch's documents publish in one transaction, so one refused document fails the attempt;
// one transaction per document, so the others publish, is S1-F06-T04's, with duplicate control.

const COMMAND = 'files-imports.publish-import';

/** Every user who recorded a change in the batch version (access-and-approvals 9.1, 9.7). */
async function batchPreparers(context: TransactionContext, batch: BatchRow, submitter: string): Promise<string[]> {
  const entries = await context.tx
    .select({ userId: stagedValueEntry.enteredByUserId })
    .from(stagedValueEntry)
    .where(eq(stagedValueEntry.batchId, batch.id));
  return [...new Set([batch.startedByUserId, submitter, ...entries.map((entry) => entry.userId)])].sort();
}

export async function publishImport(
  deps: ImportDependencies,
  input: BatchStepInput & { readonly approvalDecisionId?: string | undefined },
): Promise<IdempotentAnswer<JsonValue>> {
  const limited = publishLimitRefusal(deps.environment.name);
  if (limited !== undefined) {
    throw new ApiRefusal({ kind: limited.kind, code: limited.code, missing: [...limited.missing] });
  }
  let failed: { readonly documents: OutcomeDocument[]; readonly code: string } | undefined;
  const answer = await deps.helper.run(
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
        const found = await visibleBatch(context, input.batchId);
        if (found === undefined) return { kind: 'refusal', refusal: BATCH_NOT_FOUND, causedBySecret: false };
        const handler = handlerOf(deps.handlers, found);
        const need = { action: 'edit' as const, recordType: IMPORT_BATCH_TYPE, facts: factsOfBatch(found) };
        const actorId = input.actor.userId;
        const authorised = await deps.access.authorise(context, { actorId, ...need });
        if (authorised.kind === 'refused') {
          return { kind: 'refusal', refusal: authorised.refusal, causedBySecret: false };
        }
        // The handler's own permission, held with the batch's, so publishing goes through the same checks as a
        // person's change (structure-and-masters 7; module-map section 3, rule 8).
        const handlerNeed = { action: handler.publishNeeds.action, recordType: handler.publishNeeds.recordType };
        const forHandler = await deps.access.authorise(context, { actorId, ...handlerNeed });
        if (forHandler.kind === 'refused') {
          return { kind: 'refusal', refusal: forHandler.refusal, causedBySecret: false };
        }
        const held = await deps.access.holdAuthority(
          context,
          { kind: 'user', id: actorId },
          authorised.roleAssignmentId,
          need,
          [],
          [{ roleAssignmentId: forHandler.roleAssignmentId, need: handlerNeed }],
        );
        if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
        // The decision's request is locked with the batch at step 1, as Decide locks it (access-and-approvals 9.7).
        const decisionLocks =
          input.approvalDecisionId === undefined
            ? []
            : await deps.access.approvalLockTargets(context, input.approvalDecisionId);
        await context.lock(LOCK_STEP.document, [
          { table: BATCH_LOCK, id: found.id, mode: 'exclusive' },
          ...decisionLocks,
        ]);
        const batch = await visibleBatch(context, input.batchId);
        if (batch === undefined) return { kind: 'refusal', refusal: BATCH_NOT_FOUND, causedBySecret: false };
        if (batch.state !== 'Validated') {
          return {
            kind: 'refusal',
            refusal: { kind: 'refused', code: 'files-imports.batch-not-validated', missing: [] },
            causedBySecret: false,
          };
        }
        // The review: the version submitted (13.1), and its approval where the handler requires one (3.1 step 8).
        if (batch.submittedVersionId !== batch.versionId) {
          return {
            kind: 'refusal',
            refusal: {
              kind: 'refused',
              code: 'files-imports.review-missing',
              missing: [{ kind: 'review', review: 'submission' }],
            },
            causedBySecret: false,
          };
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
          return {
            kind: 'refusal',
            refusal: { kind: 'refused', code: 'files-imports.version-not-confirmed', missing: unconfirmed },
            causedBySecret: false,
          };
        }
        let approvalCheck: Parameters<typeof deps.access.verifyUnderLock>[1] | undefined;
        if (handler.review.kind === 'approval') {
          if (input.approvalDecisionId === undefined) {
            return {
              kind: 'refusal',
              refusal: {
                kind: 'refused',
                code: 'files-imports.review-missing',
                missing: [{ kind: 'review', review: 'approval' }],
              },
              causedBySecret: false,
            };
          }
          approvalCheck = {
            decisionId: input.approvalDecisionId,
            actionType: handler.review.actionType,
            document: {
              module: 'files-imports',
              recordType: IMPORT_BATCH_TYPE,
              recordId: batch.id,
              versionId: batch.versionId,
            },
            preparers: await batchPreparers(context, batch, actorId),
            value: { kind: 'none' },
          };
          const verified = await deps.access.verifyUnderLock(context, approvalCheck);
          if (verified !== undefined) return { kind: 'refusal', refusal: verified, causedBySecret: false };
        }
        const documents = await documentsOf(context, batch.id);
        const results: OutcomeDocument[] = [];
        for (const document of documents) {
          if (document.state === 'Published' || document.excluded) continue;
          const published = await handler.publish(
            context,
            { userId: actorId, roleAssignmentId: forHandler.roleAssignmentId },
            document,
            {
              batchId: batch.id,
              batchCode: batch.code,
              documentId: document.documentId,
              stagedRowIds: document.rows.map((row) => row.stagedRowId),
              firstRowNumber: document.rows[0]?.rowNumber ?? 1,
            },
          );
          if (published.kind === 'refused') {
            // The whole attempt rolls back; its outcome is written after, in a transaction of its own (7.4).
            failed = {
              code: 'files-imports.document-refused',
              documents: documents.map((each) =>
                each.documentId === document.documentId
                  ? { documentId: each.documentId, result: 'refused', records: [], refusalCode: published.refusal.code }
                  : { documentId: each.documentId, result: 'not-attempted', records: [] },
              ),
            };
            return {
              kind: 'refusal',
              refusal: {
                kind: 'refused',
                code: 'files-imports.document-refused',
                missing: [
                  { kind: 'import-document', documentId: document.documentId, reason: published.refusal.code },
                  ...published.refusal.missing,
                ],
              },
              causedBySecret: false,
            };
          }
          await context.tx
            .update(importDocument)
            .set({ state: 'Published', publishedAt: context.startedAt })
            .where(and(eq(importDocument.id, document.documentId), eq(importDocument.state, 'Staged')));
          results.push({ documentId: document.documentId, result: 'published', records: [...published.records] });
        }
        if (approvalCheck !== undefined) {
          const used = await deps.access.recordUse(context, {
            ...approvalCheck,
            useId: uuidv7(),
            actor: { kind: 'user', id: actorId },
          });
          if (used !== undefined) return { kind: 'refusal', refusal: used, causedBySecret: false };
        }
        await context.tx.update(importBatch).set({ state: 'Published' }).where(eq(importBatch.id, batch.id));
        const outcomeId = await writeOutcome(context, batch.id, actorId, 'published', null, results, documents);
        await deps.audit.record(context, {
          actor: { kind: 'user', id: actorId },
          roleAssignmentId: authorised.roleAssignmentId,
          scope: factsOfBatch(batch),
          record: { module: 'files-imports', type: IMPORT_BATCH_TYPE, id: batch.id },
          operation: 'publish-import',
          changes: [
            { kind: 'value', field: 'state', before: 'Validated', after: 'Published' },
            { kind: 'value', field: 'outcomeId', before: null, after: outcomeId },
          ],
          source: { kind: 'screen' },
          idempotencyKey: input.key,
        });
        return { kind: 'success', answer: { batchId: batch.id, state: 'Published', outcomeId }, shows: 'nothing' };
      },
    },
  );
  if (answer.kind === 'refusal' && !answer.replayed && failed !== undefined) {
    const kept = failed;
    // The failed attempt's outcome, kept after its transaction rolled back (7.4; PRD-IMP-012). The batch stays
    // Validated so it can be corrected and published again (3.2).
    await deps.runner.run(
      {
        commandName: `${COMMAND}.outcome`,
        organisation: input.actor.organisation,
        correlationId: input.actor.correlationId,
        actor: { kind: 'actor', actorId: input.actor.userId },
      },
      async (context) => {
        const documents = await documentsOf(context, input.batchId);
        await writeOutcome(context, input.batchId, input.actor.userId, 'failed', kept.code, kept.documents, documents);
      },
    );
  }
  return answer;
}

async function writeOutcome(
  context: TransactionContext,
  batchId: string,
  actorId: string,
  result: 'published' | 'failed',
  refusalCode: string | null,
  results: readonly OutcomeDocument[],
  documents: readonly LoadedDocument[],
): Promise<string> {
  // Every row that is not data is ignored: the header, totals, filler and notes (7.4).
  const ignored = await context.tx
    .select({ id: stagedRow.id })
    .from(stagedRow)
    .where(and(eq(stagedRow.batchId, batchId), ne(stagedRow.role, 'data')));
  const resultOf = (documentId: string) => results.find((each) => each.documentId === documentId)?.result;
  const counts = outcomeCounts(
    ignored.length,
    documents.map((document) => ({
      result: resultOf(document.documentId) ?? (document.state === 'Published' ? 'published' : 'not-attempted'),
      rows: document.rows.length,
    })),
  );
  const outcomeId = uuidv7();
  await context.tx.insert(importOutcome).values({
    id: outcomeId,
    batchId,
    result,
    refusalCode,
    counts,
    documents: [...results],
    attemptedByUserId: actorId,
    attemptedAt: context.startedAt,
  });
  return outcomeId;
}
