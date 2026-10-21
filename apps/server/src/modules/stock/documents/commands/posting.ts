import { uuidv7 } from '@apparel-os/domain';
import { LOCK_STEP, type LockTarget, type TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { ItemValue, LedgerItem, LedgerSource, StockLedgerInterface, Written } from '../../ledger/index.js';
import { refusalOf, requestValueOf, type Actor, type Outcome } from './common.js';

// One request to the stock ledger in the caller's command, in the order of stock-ledger 10.3 and 13.1 ("The caller's
// sequence, as built"): Plan; the caller's own step 1, taken before this is called; Lock, steps 2 to 6; the periods,
// none for these items, and the caller's number series at step 8; Recheck and value; where a decision approved it,
// Verify under lock and Record use (access-and-approvals 9.7, 9.8a); Write. `stock` · documents' items move no value,
// so they hold no period and draw no journal series.

/** The approval a posting runs under: the decision, its action type and document, and the item whose value it is on. */
export interface PostingApproval {
  readonly decisionId: string;
  readonly actionType: string;
  readonly document: {
    readonly module: string;
    readonly recordType: string;
    readonly recordId: string;
    readonly versionId: string;
  };
  readonly preparers: readonly string[];
  /** The item whose value the decision is on, as its rule's basis says (DM-8). */
  readonly valueOf: number;
}

export interface PostingRequest {
  readonly source: LedgerSource;
  readonly actor: Actor;
  readonly items: readonly LedgerItem[];
  readonly approval?: PostingApproval;
  /** The caller's number series, locked at step 8 in one call with the periods (code-house-rules 8.2). */
  readonly series?: readonly LockTarget[];
  readonly idempotencyKey?: string;
}

export interface Posted {
  readonly written: Written;
  /** Each item's value on its approval basis under the locks (stock-ledger 13.1 "Recheck and value"). */
  readonly values: readonly ItemValue[];
}

export interface PostingDependencies {
  readonly ledger: StockLedgerInterface;
  /** Verify under lock and Record use, for a posting under an approval (access-and-approvals 9.7, 9.8a). */
  readonly access?: Pick<AccessInterface, 'verifyUnderLock' | 'recordUse'>;
}

/** Plans, locks and rechecks the items; with `write`, verifies the approval and writes them (13.1). */
async function run(
  context: TransactionContext,
  dependencies: PostingDependencies,
  request: PostingRequest,
  write: boolean,
): Promise<Outcome<{ written: Written | undefined; values: readonly ItemValue[] }>> {
  const useId = uuidv7();
  const planned = await dependencies.ledger.plan(context, {
    source: request.source,
    actor: { kind: 'user', userId: request.actor.userId, roleAssignmentId: request.actor.roleAssignmentId },
    items: request.items,
    ...(request.approval === undefined ? {} : { approval: { decisionId: request.approval.decisionId, useId } }),
    ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
  });
  if (planned.kind === 'refused') return refusalOf(planned.refusal);
  const locked = await dependencies.ledger.lock(context, planned.value);
  const periods = await dependencies.ledger.holdPeriods(context, planned.value);
  if (periods.kind === 'refused') return refusalOf(periods.refusal);
  const stepEight = [...periods.value, ...(request.series ?? [])];
  if (stepEight.length > 0) await context.lock(LOCK_STEP.numberSeries, stepEight);
  const checked = await dependencies.ledger.recheck(context, locked);
  if (checked.kind === 'refused') return refusalOf(checked.refusal);
  const values = checked.value.itemValues;
  if (!write) return { kind: 'success', answer: { written: undefined, values } };
  const { approval } = request;
  if (approval !== undefined) {
    const { access } = dependencies;
    if (access === undefined) throw new Error('A posting under an approval was composed with no access');
    const value = values[approval.valueOf];
    if (value === undefined) throw new Error('The approved item is not among the posting items');
    const check = {
      decisionId: approval.decisionId,
      actionType: approval.actionType,
      document: approval.document,
      preparers: approval.preparers,
      value: requestValueOf(value),
    };
    const verified = await access.verifyUnderLock(context, check);
    if (verified !== undefined) return refusalOf(verified);
    const used = await access.recordUse(context, {
      ...check,
      useId,
      actor: { kind: 'user', id: request.actor.userId },
    });
    if (used !== undefined) return refusalOf(used);
  }
  const written = await dependencies.ledger.write(context, checked.value, { kind: 'screen' });
  if (written.kind === 'refused') return refusalOf(written.refusal);
  return { kind: 'success', answer: { written: written.value, values } };
}

/** One posting, written (13.1). */
export async function post(
  context: TransactionContext,
  dependencies: PostingDependencies,
  request: PostingRequest,
): Promise<Outcome<Posted>> {
  const outcome = await run(context, dependencies, request, true);
  if (outcome.kind === 'refusal') return outcome;
  const { written, values } = outcome.answer;
  if (written === undefined) throw new Error('A posting written without its result');
  return { kind: 'success', answer: { written, values } };
}

/**
 * The value of items under the locks, nothing written (13.1 "Recheck and value"): a renewal's and a reversal's request
 * is on the goods' cost now, read as the posting would read it (access-and-approvals 9.1).
 */
export async function valued(
  context: TransactionContext,
  dependencies: Pick<PostingDependencies, 'ledger'>,
  request: Omit<PostingRequest, 'approval'>,
): Promise<Outcome<readonly ItemValue[]>> {
  const outcome = await run(context, dependencies, request, false);
  if (outcome.kind === 'refusal') return outcome;
  return { kind: 'success', answer: outcome.answer.values };
}
