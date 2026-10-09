import { paise, uuidv7 } from '@apparel-os/domain';
import { bulkTotals, type ApprovalValue, type BulkTotal, type MissingItem, type MoneyBasis } from '@apparel-os/schemas';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { approvalRequest, approvalRuleSetting, approvalRuleSettingVersion, bulkDecisionBatch } from '../db/schema.js';
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
 * Whether an item may be decided under a batch (9.9): the batch is the approver's and names the request, and the
 * request's action type is still on the allowlist today. Answers the refusal, or undefined.
 */
export async function batchRefusal(
  context: TransactionContext,
  batchId: string,
  approverUserId: string,
  request: RequestRow,
): Promise<CommandRefusal | undefined> {
  const [batch] = await context.tx.select().from(bulkDecisionBatch).where(eq(bulkDecisionBatch.id, batchId));
  if (batch?.approverUserId !== approverUserId || !batch.approvalRequestIds.includes(request.id)) {
    return { kind: 'not-authorised', code: 'access.not-eligible', missing: [{ kind: 'bulk-batch' }] };
  }
  if (!(await bulkAllowedToday(context, request.actionType))) return notAllowed([request.actionType]);
  return undefined;
}

/** A request's value on its basis, as the totals read it (PRD-ACS-015, PRD-MOD-015). */
function valueOf(row: RequestRow): ApprovalValue {
  if (row.valueKind === 'none' || row.valueBasis === null) return { kind: 'none' };
  const basis = row.valueBasis as MoneyBasis;
  return row.valueKind === 'known' && row.valueAmount !== null
    ? { kind: 'known', basis, amount: paise(row.valueAmount) }
    : { kind: 'unknown', basis };
}

/** What opening a batch answers: the batch, and the selection's totals by basis (9.9; PRD-ACS-019). */
export type BatchOutcome =
  | {
      readonly kind: 'success';
      readonly answer: { readonly batchId: string; readonly totals: BulkTotal[]; readonly noValueCount: number };
    }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal; readonly causedBySecret: boolean };

/** What a batch is opened with: the items, the approve reason and the fresh authenticator code (9.9; 3.3). */
export interface BatchInput {
  readonly items: readonly { readonly requestId: string; readonly versionId: string }[];
  readonly reason: { readonly kind: 'listed'; readonly reasonId: string };
  readonly totpCode: string;
}

/**
 * Opens a batch (9.9): every item's request exists, and every action type among them is on the allowlist today,
 * otherwise nothing is decided and the refusal names each action type that is not (POL-02.19); the reason is an approve
 * reason in force (POL-02.23); the fresh code is taken (3.3). Records the batch and its audit record, and answers the
 * totals of the selection by basis, Unknown counted apart and never as zero (PRD-ACS-019, PRD-MOD-015). Nothing is
 * decided here: each item is decided in its own transaction after.
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
  const ids = input.items.map((item) => item.requestId);
  const rows = await context.tx.select().from(approvalRequest).where(inArray(approvalRequest.id, ids));
  if (rows.length !== ids.length)
    return refused({ kind: 'not-found', code: 'access.approval-request-not-found', missing: [] });
  const actionTypes = [...new Set(rows.map((row) => row.actionType))].sort();
  const disallowed = [];
  for (const actionType of actionTypes) {
    if (!(await bulkAllowedToday(context, actionType))) disallowed.push(actionType);
  }
  if (disallowed.length > 0) return refused(notAllowed(disallowed));
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
  await context.tx.insert(bulkDecisionBatch).values({ id: batchId, approverUserId, approvalRequestIds: ids });
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: approverUserId },
    record: { module: 'access', type: 'bulk_decision_batch', id: batchId, versionId: batchId },
    operation: 'open-bulk-decision-batch',
    changes: [{ kind: 'value', field: 'requests', before: null, after: ids }],
    source: { kind: 'screen' },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const values = ids.flatMap((id) => {
    const row = byId.get(id);
    return row === undefined ? [] : [valueOf(row)];
  });
  return { kind: 'success', answer: { batchId, ...bulkTotals(values) } };
}
