import { IMPORT_BATCH_TYPE, type MissingItem } from '@apparel-os/schemas';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type {
  CommandOutcome,
  CommandRefusal,
  IdempotentAnswer,
  JsonValue,
  RequestContent,
  TransactionContext,
} from '../../../kernel/index.js';
import { importBatch, rowIssue } from '../db/schema.js';
import {
  batchPreparers,
  factsOfBatch,
  handlerOf,
  type BatchRow,
  type ImportActor,
  type ImportDependencies,
} from './import-common.js';
import { countsRefusal } from './outcomes.js';
import { batchReplayAuthorisation, heldBatch } from './validate-import.js';

// The review of a batch (imports-and-opening-data 3.1 step 8, 8.2, 13.1, 13.2; PRD-IMP-005, PRD-IMP-007, PRD-ACS-007;
// S1-F06-T03): a Warning of the validation report is marked seen by the person who submits or approves the batch, one
// by one or every Warning of one class in one action; Submit for review refuses a batch that is not Validated, still
// has Blocking issues, has a Warning nobody marked seen, or whose counts do not close (7.4; S1-F06-T04); it records the version
// submitted, and where the handler requires an approval in `access`, requests it bound to that exact version.

const refusal = (
  kind: CommandRefusal['kind'],
  code: string,
  missing: MissingItem[] = [],
): CommandOutcome<JsonValue> => ({
  kind: 'refusal',
  refusal: { kind, code, missing },
  causedBySecret: false,
});

/** The issues of the last validation run of the batch's current version (8.2): none until it is validated. */
export async function currentIssues(context: TransactionContext, batch: Pick<BatchRow, 'id' | 'versionId'>) {
  const [last] = await context.tx
    .select({ runAt: rowIssue.runAt })
    .from(rowIssue)
    .where(and(eq(rowIssue.batchId, batch.id), eq(rowIssue.batchVersionId, batch.versionId)))
    .orderBy(desc(rowIssue.runAt))
    .limit(1);
  if (last === undefined) return [];
  return context.tx
    .select()
    .from(rowIssue)
    .where(
      and(eq(rowIssue.batchId, batch.id), eq(rowIssue.batchVersionId, batch.versionId), eq(rowIssue.runAt, last.runAt)),
    )
    .orderBy(rowIssue.id);
}

export interface SeenInput {
  readonly actor: ImportActor;
  readonly batchId: string;
  readonly key: string;
  readonly content: RequestContent;
  readonly body: { readonly issueIds: readonly string[] } | { readonly class: string };
}

/** Mark Warnings seen (8.2): those named, or every Warning of one class of the current report. */
export async function markIssuesSeen(deps: ImportDependencies, input: SeenInput): Promise<IdempotentAnswer<JsonValue>> {
  return deps.helper.run(
    {
      commandName: 'files-imports.mark-issues-seen',
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
        if (batch.state !== 'Validated') return refusal('refused', 'files-imports.batch-not-validated');
        const issues = await currentIssues(context, batch);
        let chosen: typeof issues;
        if ('issueIds' in input.body) {
          const wanted = new Set(input.body.issueIds);
          chosen = issues.filter((issue) => wanted.has(issue.id));
          const unknown = [...wanted].filter((id) => !chosen.some((issue) => issue.id === id));
          if (unknown.length > 0) {
            return refusal(
              'not-found',
              'files-imports.issue-not-found',
              unknown.map((issueId) => ({ kind: 'issue', issueId })),
            );
          }
          const other = chosen.find((issue) => issue.severity !== 'Warning');
          if (other !== undefined)
            return refusal('refused', 'files-imports.not-a-warning', [{ kind: 'issue', issueId: other.id }]);
        } else {
          const wantedClass = input.body.class;
          chosen = issues.filter((issue) => issue.class === wantedClass && issue.severity === 'Warning');
        }
        const unseen = chosen.filter((issue) => issue.seenByUserId === null).map((issue) => issue.id);
        if (unseen.length > 0) {
          await context.tx
            .update(rowIssue)
            .set({ seenByUserId: input.actor.userId, seenAt: context.startedAt })
            .where(and(inArray(rowIssue.id, unseen), isNull(rowIssue.seenByUserId)));
          await deps.audit.record(context, {
            actor: { kind: 'user', id: input.actor.userId },
            roleAssignmentId: held.roleAssignmentId,
            scope: factsOfBatch(batch),
            record: { module: 'files-imports', type: IMPORT_BATCH_TYPE, id: batch.id, versionId: batch.versionId },
            operation: 'mark-import-warnings-seen',
            changes: [{ kind: 'value', field: 'seenIssueIds', before: null, after: unseen }],
            source: { kind: 'screen' },
            idempotencyKey: input.key,
          });
        }
        return { kind: 'success', answer: { batchId: batch.id, marked: unseen.length }, shows: 'nothing' };
      },
    },
  );
}

export interface SubmitInput {
  readonly actor: ImportActor;
  readonly batchId: string;
  readonly key: string;
  readonly content: RequestContent;
}

/** Submit for review (13.1). */
export async function submitImport(deps: ImportDependencies, input: SubmitInput): Promise<IdempotentAnswer<JsonValue>> {
  return deps.helper.run(
    {
      commandName: 'files-imports.submit-import',
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
        if (batch.state !== 'Validated') return refusal('refused', 'files-imports.batch-not-validated');
        if (batch.submittedVersionId !== null) return refusal('refused', 'files-imports.already-submitted');
        // A Validated batch was validated at its current version, since any change makes a new version Staged (3.2).
        const issues = await currentIssues(context, batch);
        const blocking = issues.filter((issue) => issue.severity === 'Blocking').length;
        if (blocking > 0) {
          return refusal('refused', 'files-imports.blocking-issues-remain', [
            { kind: 'issues', blocking: String(blocking) },
          ]);
        }
        const unseen = issues.filter((issue) => issue.severity === 'Warning' && issue.seenByUserId === null).length;
        if (unseen > 0) {
          return refusal('refused', 'files-imports.warnings-not-seen', [
            { kind: 'issues', warningsNotSeen: String(unseen) },
          ]);
        }
        // The counts close (7.4; S1-F06-T04): every row the reader read is staged, as data or not.
        const counts = await countsRefusal(context, batch);
        if (counts !== undefined) return { kind: 'refusal', refusal: counts, causedBySecret: false };
        await context.tx
          .update(importBatch)
          .set({ submittedVersionId: batch.versionId })
          .where(eq(importBatch.id, batch.id));
        const handler = handlerOf(deps.handlers, batch);
        let requestId: string | undefined;
        if (handler.review.kind === 'approval') {
          requestId = await deps.access.requestApproval(context, {
            actionType: handler.review.actionType,
            document: {
              module: 'files-imports',
              recordType: IMPORT_BATCH_TYPE,
              recordId: batch.id,
              versionId: batch.versionId,
            },
            value: { kind: 'none' },
            preparers: await batchPreparers(context, batch, input.actor.userId),
            requestedBy: { userId: input.actor.userId, roleAssignmentId: held.roleAssignmentId },
            facts: factsOfBatch(batch),
          });
        }
        await deps.audit.record(context, {
          actor: { kind: 'user', id: input.actor.userId },
          roleAssignmentId: held.roleAssignmentId,
          scope: factsOfBatch(batch),
          record: { module: 'files-imports', type: IMPORT_BATCH_TYPE, id: batch.id, versionId: batch.versionId },
          operation: 'submit-import',
          changes: [
            { kind: 'value', field: 'submittedVersionId', before: null, after: batch.versionId },
            ...(requestId === undefined
              ? []
              : [{ kind: 'value' as const, field: 'requestId', before: null, after: requestId }]),
          ],
          source: { kind: 'screen' },
          idempotencyKey: input.key,
        });
        return {
          kind: 'success',
          answer: {
            batchId: batch.id,
            state: 'Validated',
            submittedVersionId: batch.versionId,
            ...(requestId === undefined ? {} : { requestId }),
          },
          shows: 'nothing',
        };
      },
    },
  );
}
