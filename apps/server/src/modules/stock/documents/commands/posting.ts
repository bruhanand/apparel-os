import { uuidv7 } from '@apparel-os/domain';
import { CommandDefect, LOCK_STEP, type LockTarget, type TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { ItemValue, LedgerItem, LedgerSource, StockLedgerInterface, Written } from '../../ledger/index.js';
import { goodsOf, placeOfReport, type ReportedCondition } from '../domain/goods.js';
import { damageHoldItem } from '../domain/items.js';
import {
  ledgerSource,
  refusalOf,
  requestValueOf,
  type Actor,
  type Outcome,
  type ReportRow,
  type RequestValue,
} from './common.js';

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
  /** The line of the item whose value the decision is on, as its rule's basis says (DM-8). */
  readonly valuedLineId: string;
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

/** Each item's value on its approval basis under the locks, by the item's line (stock-ledger 13.1 "Recheck and value"). */
export type LineValues = ReadonlyMap<string, ItemValue>;

export interface Posted {
  readonly written: Written;
  readonly values: LineValues;
}

export interface PostingDependencies {
  readonly ledger: StockLedgerInterface;
  /** Verify under lock and Record use, for a posting under an approval (access-and-approvals 9.7, 9.8a). */
  readonly access?: Pick<AccessInterface, 'verifyUnderLock' | 'recordUse'>;
}

/** The value of the item on a line, which the request holds: a line not among its items is a defect. */
export function valueOfLine(values: LineValues, lineId: string): ItemValue {
  const value = values.get(lineId);
  if (value === undefined) throw new CommandDefect('The item valued is not among the posting items');
  return value;
}

/** Plans, locks and rechecks the items; with `write`, verifies the approval and writes them (13.1). */
async function run(
  context: TransactionContext,
  dependencies: PostingDependencies,
  request: PostingRequest,
  write: boolean,
): Promise<Outcome<{ written: Written | undefined; values: LineValues }>> {
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
  // The ledger answers each item's value in the request's order; they are kept by the item's line.
  const values: LineValues = new Map(
    request.items.map((item, index) => {
      const value = checked.value.itemValues[index];
      if (value === undefined) throw new CommandDefect('The ledger valued fewer items than were sent');
      return [item.lineId, value];
    }),
  );
  if (!write) return { kind: 'success', answer: { written: undefined, values } };
  const { approval } = request;
  if (approval !== undefined) {
    const { access } = dependencies;
    if (access === undefined) throw new CommandDefect('A posting under an approval was composed with no access');
    const check = {
      decisionId: approval.decisionId,
      actionType: approval.actionType,
      document: approval.document,
      preparers: approval.preparers,
      value: requestValueOf(valueOfLine(values, approval.valuedLineId)),
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
  if (written === undefined) throw new CommandDefect('A posting written without its result');
  return { kind: 'success', answer: { written, values } };
}

/**
 * The cost of a report's goods now in the condition given, as a damage hold on them is valued (stock-ledger 13.10,
 * 13.15), under the ledger's locks with nothing written (13.1 "Recheck and value"): a renewal's and a reversal's request
 * is on the goods' cost now, read as the posting would read it (access-and-approvals 9.1). A renewal reads them in the
 * condition they were reported in, a reversal damaged.
 */
export async function valueOfReportGoods(
  context: TransactionContext,
  dependencies: Pick<PostingDependencies, 'ledger'>,
  actor: Actor,
  report: ReportRow,
  source: { readonly recordType: string; readonly recordId: string },
  condition: ReportedCondition | 'damaged',
): Promise<Outcome<RequestValue>> {
  const hold = damageHoldItem(uuidv7(), placeOfReport(report), goodsOf(report), report.description);
  const item = { ...hold, condition } as LedgerItem;
  const outcome = await run(
    context,
    dependencies,
    { source: ledgerSource(source.recordType, source.recordId, source.recordId), actor, items: [item] },
    false,
  );
  if (outcome.kind === 'refusal') return outcome;
  return { kind: 'success', answer: requestValueOf(valueOfLine(outcome.answer.values, item.lineId)) };
}
