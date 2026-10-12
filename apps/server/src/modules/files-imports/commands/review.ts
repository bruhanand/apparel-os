import { IMPORT_BATCH_TYPE, type MissingItem } from '@apparel-os/schemas';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
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
  reviewOf,
  type BatchRow,
  type ImportActor,
  type ImportDependencies,
} from './import-common.js';
import { countsRefusal } from './outcomes.js';
import { batchReplayAuthorisation, heldBatch, staleBatchVersion } from './validate-import.js';

// The review of a batch (imports-and-opening-data 3.1 step 8, 8.2, 13.1, 13.2; PRD-IMP-005, PRD-IMP-007, PRD-ACS-007;
// S1-F06-T03): a Warning of the validation report is marked seen by the person who submits the batch, one by one or
// every Warning of one class in one action. A mark names who made it, and a later mark by another person replaces it,
// each audited; Submit counts a Warning seen only when the submitter marked it, so a mark by anyone else with edit does
// not count (8.2; product owner, 11 Oct 2026). Submit for review refuses a batch that is not Validated, still has
// Blocking issues, has a Warning the submitter has not marked seen, or whose counts do not close (7.4; S1-F06-T04); it
// records the version submitted, and where the handler requires an approval in `access`, requests it bound to that
// exact version. Both carry the batch version the screen read (code-house-rules 12.7): Submit binds what was reviewed
// on screen to the version submitted (PRD-ACS-007).

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
  readonly body:
    | { readonly versionId: string; readonly issueIds: readonly string[] }
    | { readonly versionId: string; readonly class: string };
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
        const stale = staleBatchVersion(batch, input.body.versionId);
        if (stale !== undefined) return stale;
        // Marked before submission, by the person who will submit it (8.2): a submitted version is already reviewed.
        if (batch.submittedVersionId !== null) return refusal('refused', 'files-imports.already-submitted');
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
        // Not yet seen by this person: unmarked, or marked by someone else, whose mark this one replaces (8.2).
        const unseen = chosen.filter((issue) => issue.seenByUserId !== input.actor.userId).map((issue) => issue.id);
        if (unseen.length > 0) {
          await context.tx
            .update(rowIssue)
            .set({ seenByUserId: input.actor.userId, seenAt: context.startedAt })
            .where(
              and(inArray(rowIssue.id, unseen), sql`${rowIssue.seenByUserId} is distinct from ${input.actor.userId}`),
            );
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
  /** The batch version the screen read, the one submitted (code-house-rules 12.7; PRD-ACS-007). */
  readonly versionId: string;
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
        const stale = staleBatchVersion(batch, input.versionId);
        if (stale !== undefined) return stale;
        if (batch.submittedVersionId !== null) return refusal('refused', 'files-imports.already-submitted');
        // A Validated batch was validated at its current version, since any change makes a new version Staged (3.2).
        const issues = await currentIssues(context, batch);
        const blocking = issues.filter((issue) => issue.severity === 'Blocking').length;
        if (blocking > 0) {
          return refusal('refused', 'files-imports.blocking-issues-remain', [
            { kind: 'issues', blocking: String(blocking) },
          ]);
        }
        // Seen by the submitter themselves (8.2; product owner, 11 Oct 2026).
        const unseen = issues.filter(
          (issue) => issue.severity === 'Warning' && issue.seenByUserId !== input.actor.userId,
        ).length;
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
        const review = reviewOf(handlerOf(deps.handlers, batch), batch);
        let requestId: string | undefined;
        if (review.kind === 'approval') {
          requestId = await deps.access.requestApproval(context, {
            actionType: review.actionType,
            document: {
              module: 'files-imports',
              recordType: review.recordType,
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
