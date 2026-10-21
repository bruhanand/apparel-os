import { uuidv7 } from '@apparel-os/domain';
import {
  OPEN_TO_BUY_CHECK,
  type OpenToBuyBudgetDraft,
  type OpenToBuyBudgetPrepared,
  type OpenToBuyBudgetVersionDraft,
  type SettingOrigin,
} from '@apparel-os/schemas';
import { UNIQUE_VIOLATION, withSavepoint, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface, Preparer } from '../../access/index.js';
import type { AuditChange, AuditInterface } from '../../audit/index.js';
import type { ConfigurationInterface } from '../../configuration/index.js';
import { brandInForce, type CatalogueInterface } from '../../merchandise/catalogue/index.js';
import { openToBuyBudget, openToBuyBudgetVersion } from '../db/schema.js';
import { budgetAuditRecord, budgetItem, checkDocument, versionDecisions } from '../domain/budgets.js';
import { budgetOf, budgetRow, versionsOf } from '../queries/budgets.js';
import { lockBudget, refused, today, type Outcome } from './common.js';

// Prepare an open-to-buy budget, or its next version (goods-in 3.3; PRD-BKG-004; POL-05.09, POL-02.07; S2-F01-T02):
// Booking prepares it under the budget's lock, frozen when prepared, and it waits for Accounts' check, requested here
// from a different person; its approval is requested only once the check is recorded (effects.ts). A newer version
// supersedes one still waiting, whichever step it waits at (access-and-approvals 9.6). Each change writes its audit
// record in the same transaction. No amount is defaulted (code-house-rules 12.14): it comes from the draft, with its
// origin, which the environment must accept.

export interface BudgetDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'requestLockTargets' | 'supersedeRequest'>;
  readonly catalogue: Pick<CatalogueInterface, 'vocabularyOn' | 'markedAttributeAt'>;
  readonly origins: Pick<ConfigurationInterface, 'originRefusal'>;
}

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
const value = (field: string, after: ValueChange['after']): ValueChange => ({
  kind: 'value',
  field,
  before: null,
  after,
});

/** Writes a version Awaiting approval, its audit record, and the request of Accounts' check (3.3; POL-05.09). */
async function writeVersion(
  context: TransactionContext,
  dependencies: BudgetDependencies,
  preparer: Preparer,
  budget: { readonly id: string; readonly brandId: string },
  draft: { readonly amount: number; readonly origin: SettingOrigin },
  operation: string,
  changes: readonly AuditChange[],
): Promise<OpenToBuyBudgetPrepared> {
  const versionId = uuidv7();
  await context.tx.insert(openToBuyBudgetVersion).values({
    id: versionId,
    openToBuyBudgetId: budget.id,
    amountPaise: draft.amount,
    origin: draft.origin,
    decision: 'Awaiting approval',
    validDuring: null,
    preparedByUserId: preparer.userId,
  });
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: preparer.userId },
    roleAssignmentId: preparer.roleAssignmentId,
    scope: { brandId: budget.brandId },
    record: budgetAuditRecord(budget.id, versionId),
    operation,
    changes: [...changes, value('amount', draft.amount), value('origin', draft.origin)],
    source: { kind: 'screen' },
  });
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: OPEN_TO_BUY_CHECK,
    document: checkDocument(budget.id, versionId),
    value: { kind: 'none' },
    preparers: [preparer.userId],
    requestedBy: preparer,
    facts: { brandId: budget.brandId },
  });
  return { budgetId: budget.id, versionId, requestId };
}

/**
 * A new budget for a brand and a season, with its first version (3.3): the brand in force today, the season an
 * approved value in force today of the attribute marked as the season now (structure-and-masters 4.2 "As built";
 * RR-550), and no budget yet for the pair; a change is the budget's next version. The budget keeps the marking's
 * version it read (code-house-rules 7.3, 12.14). While no attribute is marked as the season, it is refused, naming the
 * setting.
 */
export async function prepareBudget(
  context: TransactionContext,
  dependencies: BudgetDependencies,
  preparer: Preparer,
  draft: OpenToBuyBudgetDraft,
): Promise<Outcome<OpenToBuyBudgetPrepared>> {
  const origin = dependencies.origins.originRefusal(context, draft.origin);
  if (origin !== undefined) return { kind: 'refusal', refusal: origin };
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const seasons = await dependencies.catalogue.markedAttributeAt(context, 'season');
  if (seasons.kind === 'not-set') return { kind: 'refusal', refusal: seasons.refusal };
  if (!(await brandInForce(context, draft.brandId, date))) {
    return refused('refused', 'booking.brand-not-in-force', [
      { kind: 'record', recordType: 'merchandise.brand', recordId: draft.brandId },
    ]);
  }
  const season = {
    attributeId: seasons.attributeId,
    valueId: draft.seasonValueId,
    markedAttributeVersionId: seasons.versionId,
  };
  const values = await dependencies.catalogue.vocabularyOn(context, season.attributeId, date);
  if (!values.some((each) => each.id === season.valueId)) {
    return refused('refused', 'booking.season-not-in-vocabulary', [
      { kind: 'record', recordType: 'merchandise.attribute', recordId: season.attributeId },
      { kind: 'record', recordType: 'merchandise.vocabulary_value', recordId: season.valueId },
    ]);
  }
  const existing = await budgetOf(context, draft.brandId, season.valueId);
  if (existing !== undefined) return refused('refused', 'booking.budget-exists', [budgetItem(existing.id)]);
  // A new budget has no row to lock at step 1: writing its identity row creates it locked, and no other transaction
  // sees it before this one commits, so no lock call follows a write (code-house-rules 8.2), as a new Arrival's.
  const budgetId = uuidv7();
  const written = await withSavepoint(context, 'booking_new_budget', [UNIQUE_VIOLATION], () =>
    context.tx.insert(openToBuyBudget).values({
      id: budgetId,
      brandId: draft.brandId,
      seasonAttributeId: season.attributeId,
      seasonValueId: season.valueId,
      seasonMarkedAttributeVersionId: season.markedAttributeVersionId,
    }),
  );
  if (written.kind !== 'done') {
    // Another budget for the pair committed first (3.3).
    const raced = await budgetOf(context, draft.brandId, season.valueId);
    return refused('refused', 'booking.budget-exists', raced === undefined ? [] : [budgetItem(raced.id)]);
  }
  const answer = await writeVersion(
    context,
    dependencies,
    preparer,
    { id: budgetId, brandId: draft.brandId },
    draft,
    'prepare-open-to-buy-budget',
    [value('brandId', draft.brandId), value('season', { ...season })],
  );
  return { kind: 'success', answer };
}

/**
 * A budget's next version (3.3): under the budget's lock, with the newest version's token (code-house-rules 12.7). A
 * version still waiting, at the check or at the approval, is superseded: its request can no longer be decided
 * (access-and-approvals 9.6), and its row keeps Awaiting approval (7.3). The version in force stays in force until the
 * new one is approved.
 */
export async function prepareBudgetVersion(
  context: TransactionContext,
  dependencies: BudgetDependencies,
  preparer: Preparer,
  budgetId: string,
  draft: OpenToBuyBudgetVersionDraft,
): Promise<Outcome<OpenToBuyBudgetPrepared>> {
  const origin = dependencies.origins.originRefusal(context, draft.origin);
  if (origin !== undefined) return { kind: 'refusal', refusal: origin };
  const budget = await budgetRow(context, budgetId);
  if (budget === undefined) return refused('not-found', 'booking.record-not-found', [budgetItem(budgetId)]);
  // The open requests of a version still waiting, locked with the budget at step 1 in one call, so no decision passes
  // the supersession (code-house-rules 8.2; access-and-approvals 9.1a).
  const waiting = (await versionsOf(context, budgetId)).filter((each) => each.decision === 'Awaiting approval');
  const targets: LockTarget[] = [];
  for (const each of waiting) {
    for (const [actionType, document] of versionDecisions(budgetId, each.id)) {
      targets.push(...(await dependencies.access.requestLockTargets(context, { ...document, actionType })));
    }
  }
  if (!(await lockBudget(context, budgetId, targets))) {
    return refused('not-found', 'booking.record-not-found', [budgetItem(budgetId)]);
  }
  const versions = await versionsOf(context, budgetId);
  const newest = versions.at(-1);
  if (newest?.id !== draft.versionToken) {
    return refused('conflict', 'kernel.stale-version', [budgetItem(budgetId)]);
  }
  for (const each of versions.filter((version) => version.decision === 'Awaiting approval')) {
    for (const [actionType, document] of versionDecisions(budgetId, each.id)) {
      await dependencies.access.supersedeRequest(context, { ...document, actionType }, preparer);
    }
  }
  const answer = await writeVersion(
    context,
    dependencies,
    preparer,
    budget,
    draft,
    'prepare-open-to-buy-budget-version',
    [value('replaces', draft.versionToken)],
  );
  return { kind: 'success', answer };
}
