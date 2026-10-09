import { uuidv7 } from '@apparel-os/domain';
import { bulkTotals, type BulkTotal, type MissingItem } from '@apparel-os/schemas';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import {
  approvalRequest,
  approvalRuleSetting,
  approvalRuleSettingVersion,
  bulkDecisionBatch,
  bulkDecisionBatchItem,
} from '../db/schema.js';
import { approvalValueOf } from './request-approval.js';
import type { OrganisationKeys } from '../domain/organisation-keys.js';
import { checkFreshCode, takeFreshCode } from './fresh-code.js';

// Bulk approval (access-and-approvals 9.9; code-house-rules 12.1, 12.4; PRD-ACS-011, PRD-ACS-019, POL-02.19,
// PRD-MOD-015; S1-F05-T02). The allowlist is the approval rule setting's `bulk_allowed` in force today (8), with no
// default: an action type with no setting in force allows nothing. A batch is opened in a command of its own, which
// takes the one fresh authenticator code the selection needs (3.3); each item is then its own decision in its own
// transaction, rechecked as any decision is (9.3, 9.7), naming the batch.

type RequestRow = typeof approvalRequest.$inferSelect;

/** Whether an action type is on the bulk allowlist in force today (8; POL-02.19): no setting in force allows nothing. */
export async function bulkAllowedToday(context: TransactionContext, actionType: string): Promise<boolean> {
  const date = await context.businessDate();
  if (date.kind === 'not-set') return false;
  const rows = await context.tx
    .select({ bulkAllowed: approvalRuleSettingVersion.bulkAllowed })
    .from(approvalRuleSettingVersion)
    .innerJoin(approvalRuleSetting, eq(approvalRuleSetting.id, approvalRuleSettingVersion.approvalRuleSettingId))
    .where(
      and(
        eq(approvalRuleSetting.actionType, actionType),
        eq(approvalRuleSettingVersion.decision, 'Approved'),
        sql`${approvalRuleSettingVersion.validDuring} @> ${date.date}::date`,
      ),
    );
  return rows.some((row) => row.bulkAllowed);
}

const notAllowed = (actionTypes: readonly string[]): CommandRefusal => ({
  kind: 'refused',
  code: 'access.bulk-not-allowed',
  missing: actionTypes.map((actionType): MissingItem => ({ kind: 'bulk-allowlist', actionType })),
});

/**
 * Whether an item may be decided under a batch (9.9): the batch is the approver's and admitted the request, the
 * request is still at the version the batch bound it to (PRD-ACS-007), and its action type is still on the allowlist
 * today. Answers the refusal, or undefined.
 */
export async function batchRefusal(
  context: TransactionContext,
  batchId: string,
  approverUserId: string,
  request: RequestRow,
): Promise<CommandRefusal | undefined> {
  const [admitted] = await context.tx
    .select({ approverUserId: bulkDecisionBatch.approverUserId, versionId: bulkDecisionBatchItem.documentVersionId })
    .from(bulkDecisionBatchItem)
    .innerJoin(bulkDecisionBatch, eq(bulkDecisionBatch.id, bulkDecisionBatchItem.bulkDecisionBatchId))
    .where(
      and(
        eq(bulkDecisionBatchItem.bulkDecisionBatchId, batchId),
        eq(bulkDecisionBatchItem.approvalRequestId, request.id),
      ),
    );
  if (admitted?.approverUserId !== approverUserId) {
    return { kind: 'not-authorised', code: 'access.not-eligible', missing: [{ kind: 'bulk-batch' }] };
  }
  if (admitted.versionId !== request.documentVersionId) {
    return { kind: 'conflict', code: 'kernel.stale-version', missing: [] };
  }
  if (!(await bulkAllowedToday(context, request.actionType))) return notAllowed([request.actionType]);
  return undefined;
}

/** An item of the selection not admitted to the batch, by its place in the selection: it goes to individual review. */
export interface RefusedItem {
  readonly index: number;
  readonly requestId: string;
  readonly code: string;
  readonly missing: MissingItem[];
}

/** What opening a batch answers: the batch, the totals of the items it admitted by basis, and those it did not (9.9). */
export type BatchOutcome =
  | {
      readonly kind: 'success';
      readonly answer: {
        readonly batchId: string;
        readonly totals: BulkTotal[];
        readonly noValueCount: number;
        readonly refused: RefusedItem[];
      };
    }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal; readonly causedBySecret: boolean };

/** What a batch is opened with: the items, the approve reason and the fresh authenticator code (9.9; 3.3). */
export interface BatchInput {
  readonly items: readonly { readonly requestId: string; readonly versionId: string }[];
  readonly reason: { readonly kind: 'listed'; readonly reasonId: string };
  readonly totpCode: string;
}

/**
 * Opens a batch (9.9). Only a problem of the whole selection refuses it, and then nothing is decided: no items, no
 * business date, an approve reason not in force (POL-02.23) or the fresh code refused (3.3). Each item is admitted or
 * goes to individual review with its reason while the others go on: a request named more than once (each time,
 * `access.bulk-item-duplicated`), not found (`access.approval-request-not-found`), of an action type off the allowlist
 * today (`access.bulk-not-allowed`, naming it; POL-02.19), or no longer at the version named (`kernel.stale-version`;
 * PRD-ACS-007). Records the batch with each admitted item and the version reviewed, and its audit record, and answers
 * the totals of the admitted items by basis, Unknown counted apart and never as zero (PRD-ACS-019, PRD-MOD-015).
 * Nothing is decided here: each admitted item is decided in its own transaction after.
 */
export async function openBatch(
  context: TransactionContext,
  dependencies: {
    readonly audit: AuditInterface;
    readonly keys: OrganisationKeys | undefined;
    readonly approveReasons: () => Promise<readonly { readonly id: string }[]>;
  },
  approverUserId: string,
  input: BatchInput,
): Promise<BatchOutcome> {
  const refused = (refusal: CommandRefusal): BatchOutcome => ({ kind: 'refusal', refusal, causedBySecret: false });
  const date = await context.businessDate();
  if (date.kind === 'not-set') {
    return refused({
      kind: 'unavailable',
      code: 'access.business-date-not-set',
      missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
    });
  }
  if (input.items.length === 0) return refused({ kind: 'refused', code: 'access.bulk-selection-empty', missing: [] });
  const ids = [...new Set(input.items.map((item) => item.requestId))];
  const rows = await context.tx.select().from(approvalRequest).where(inArray(approvalRequest.id, ids));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const allowed = new Map<string, boolean>();
  for (const actionType of new Set(rows.map((row) => row.actionType))) {
    allowed.set(actionType, await bulkAllowedToday(context, actionType));
  }
  const named = new Map<string, number>();
  for (const item of input.items) named.set(item.requestId, (named.get(item.requestId) ?? 0) + 1);
  const refusedItems: RefusedItem[] = [];
  const admitted: { readonly row: RequestRow; readonly versionId: string }[] = [];
  input.items.forEach((item, index) => {
    const row = byId.get(item.requestId);
    const refuse = (refusal: Pick<CommandRefusal, 'code' | 'missing'>) =>
      refusedItems.push({ index, requestId: item.requestId, code: refusal.code, missing: [...refusal.missing] });
    if ((named.get(item.requestId) ?? 0) > 1) refuse({ code: 'access.bulk-item-duplicated', missing: [] });
    else if (row === undefined) refuse({ code: 'access.approval-request-not-found', missing: [] });
    else if (allowed.get(row.actionType) !== true) refuse(notAllowed([row.actionType]));
    else if (row.documentVersionId !== item.versionId) refuse({ code: 'kernel.stale-version', missing: [] });
    else admitted.push({ row, versionId: item.versionId });
  });
  const reasons = await dependencies.approveReasons();
  if (reasons.length === 0) {
    return refused({
      kind: 'unavailable',
      code: 'access.no-reason-list-in-force',
      missing: [{ kind: 'reason-list', reasonKind: 'approve' }],
    });
  }
  if (!reasons.some((reason) => reason.id === input.reason.reasonId)) {
    return refused({ kind: 'refused', code: 'access.reason-not-in-force', missing: [] });
  }
  const keys = dependencies.keys;
  if (keys === undefined) throw new Error('A bulk approval needs the Organisation keys for the fresh code');
  const codeRefused = await takeFreshCode(await checkFreshCode(context, keys, approverUserId, input.totpCode));
  if (codeRefused !== undefined) return { kind: 'refusal', ...codeRefused };
  const batchId = uuidv7();
  await context.tx.insert(bulkDecisionBatch).values({ id: batchId, approverUserId });
  if (admitted.length > 0) {
    await context.tx.insert(bulkDecisionBatchItem).values(
      admitted.map(({ row, versionId }) => ({
        id: uuidv7(),
        bulkDecisionBatchId: batchId,
        approvalRequestId: row.id,
        documentVersionId: versionId,
      })),
    );
  }
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: approverUserId },
    record: { module: 'access', type: 'bulk_decision_batch', id: batchId, versionId: batchId },
    operation: 'open-bulk-decision-batch',
    changes: [
      {
        kind: 'value',
        field: 'items',
        before: null,
        after: admitted.map(({ row, versionId }) => ({ requestId: row.id, versionId })),
      },
    ],
    source: { kind: 'screen' },
  });
  return {
    kind: 'success',
    answer: {
      batchId,
      ...bulkTotals(admitted.map(({ row }) => approvalValueOf(row))),
      refused: refusedItems,
    },
  };
}
