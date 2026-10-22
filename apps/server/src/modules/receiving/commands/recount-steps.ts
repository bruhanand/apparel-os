import { uuidv7 } from '@apparel-os/domain';
import { GRN_TYPE, HELD_LINE_TYPE, RECOUNT_TYPE, lineFindings, type LineFindings } from '@apparel-os/schemas';
import {
  CommandDefect,
  LOCK_STEP,
  lockTable,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import type { BookingInterface } from '../../booking/index.js';
import type { ItemValue, LedgerItem, StockLedgerInterface, Written } from '../../stock/ledger/index.js';
import type { grn } from '../db/schema.js';
import { RECEIVING_MODULE, RECOUNT_SOURCE_TYPE } from '../domain/kinds.js';
import { ownerOfGrn } from '../domain/owner.js';
import { piecesToReverse, recountOfLine } from '../domain/recounts.js';
import { linesOfGrn } from '../queries/held-lines.js';
import { currentPtMark } from '../queries/pt-mark.js';
import { countsNowOf, heldLinesOfLines, originsOfLine, type RecountRecord } from '../queries/recounts.js';
import {
  arrivalRow,
  grnRow,
  recordItem,
  recordNotFound,
  refusalOf,
  type Actor,
  type ArrivalRow,
  type Outcome,
} from './common.js';

// What a recount's proposal and its approval share (goods-in 4.7, 4.11, 10.3; PRD-REC-019; S2-F02-T05): the locks at
// step 1, the GRN's Arrival and its row, under which every recount of the GRN is proposed and decided and the "PT
// attached" mark is set and cleared (5.8); the checks of its lines under those locks; and its stock effects, receipt
// counts of the pieces found and reversals of the pieces counted in error, posted as one ledger request in the order
// of stock-ledger 13.1.

export type GrnRow = typeof grn.$inferSelect;
type GrnLineRow = Awaited<ReturnType<typeof linesOfGrn>>[number];

/** The record type a GRN line is named by in a refusal (PRD-UXP-003). */
export const GRN_LINE_TYPE = 'receiving.grn_line';

/** The PT revision, `merchandise` · PT's record, named by its identifier only (code-house-rules 3.2). */
const PT_REVISION_TYPE = 'merchandise.pt_revision';

/**
 * Locks the GRN's Arrival and the GRN's own row exclusively at step 1 in one call (code-house-rules 8.2): the Arrival,
 * as Booking's later link of its lines does (goods-in 4.10), and the GRN, as its "PT attached" mark's changes do (5.8),
 * so a recount never passes either. Reads the GRN and its Arrival under the locks; undefined when either does not exist
 * or the actor may not see it.
 */
export async function lockGrn(
  context: TransactionContext,
  grnId: string,
): Promise<{ readonly grn: GrnRow; readonly arrival: ArrivalRow } | undefined> {
  const seen = await grnRow(context, grnId);
  if (seen === undefined) return undefined;
  const locked = await context.lock(LOCK_STEP.document, recountLockTargets(grnId, seen.arrivalId));
  if (locked.missing.length > 0) return undefined;
  const row = await grnRow(context, grnId);
  const arrival = await arrivalRow(context, seen.arrivalId);
  if (row === undefined || arrival === undefined) return undefined;
  return { grn: row, arrival };
}

/**
 * The GRN and its Arrival under the locks a caller took at step 1 with its own rows, as `access`'s Decide takes a
 * recount's (`recountLockTargets`); a read without them is a defect (code-house-rules 8.2). Undefined when either does
 * not exist or the actor may not see it.
 */
export async function heldGrn(
  context: TransactionContext,
  grnId: string,
): Promise<{ readonly grn: GrnRow; readonly arrival: ArrivalRow } | undefined> {
  const row = await grnRow(context, grnId);
  if (row === undefined) return undefined;
  for (const [table, id] of [
    ['grn', grnId],
    ['arrival', row.arrivalId],
  ] as const) {
    if (context.heldLock(lockTable('receiving', table), id)?.mode !== 'exclusive') {
      throw new CommandDefect('A recount was decided without its GRN and Arrival locked at step 1');
    }
  }
  const arrival = await arrivalRow(context, row.arrivalId);
  return arrival === undefined ? undefined : { grn: row, arrival };
}

/** The rows a recount locks at step 1: the GRN's Arrival and the GRN itself (code-house-rules 8.2). */
export function recountLockTargets(grnId: string, arrivalId: string): LockTarget[] {
  return [
    { table: lockTable('receiving', 'arrival'), id: arrivalId, mode: 'exclusive' },
    { table: lockTable('receiving', 'grn'), id: grnId, mode: 'exclusive' },
  ];
}

/** One line of a recount as it is checked: the GRN line, its count before and after, and its findings at each. */
export interface PlannedLine {
  readonly line: GrnLineRow;
  readonly countedBefore: number;
  readonly countedAfter: number;
  readonly before: LineFindings;
  readonly after: LineFindings;
}

export interface CheckDependencies {
  readonly booking: Pick<BookingInterface, 'grnLinesDelivering'>;
}

/**
 * The lines of a recount checked under the GRN's locks (goods-in 4.7, 4.11): refused while the GRN's "PT attached" mark
 * is set (`receiving.pt-attached`, naming the PT revision; 5.8); each line one of the GRN's (not found otherwise) that a
 * recount changes (`recountOfLine`); and none that delivers its pieces to a booking, linked or waiting in a proposal,
 * whatever the actor may see of bookings (`receiving.recount-linked`; DEC-117). The counts now are those the GRN's
 * approved recounts give.
 */
export async function checkedLines(
  context: TransactionContext,
  dependencies: CheckDependencies,
  locked: GrnRow,
  records: readonly RecountRecord[],
  wanted: readonly { readonly grnLineId: string; readonly countedQuantity: number }[],
): Promise<Outcome<readonly PlannedLine[]>> {
  const mark = await currentPtMark(context, locked.id);
  if (mark?.change === 'set') {
    return refusalOf({
      kind: 'refused',
      code: 'receiving.pt-attached',
      missing: [recordItem(GRN_TYPE, locked.id), recordItem(PT_REVISION_TYPE, mark.ptRevisionId)],
    });
  }
  const lines = await linesOfGrn(context, locked.id);
  const ids = wanted.map((each) => each.grnLineId);
  const held = await heldLinesOfLines(context, ids);
  const countsNow = countsNowOf(records);
  const planned: PlannedLine[] = [];
  for (const each of wanted) {
    const line = lines.find((one) => one.id === each.grnLineId);
    if (line === undefined) return refusalOf(recordNotFound(GRN_LINE_TYPE, each.grnLineId));
    const heldLineId = held.get(line.id) ?? null;
    const countedBefore = countsNow.get(line.id) ?? line.countedQuantity;
    const checked = recountOfLine({ ...line, countedNow: countedBefore, heldLineId }, each.countedQuantity);
    if (checked.kind === 'refused') {
      return refusalOf({
        kind: 'refused',
        code: checked.code,
        missing: [
          recordItem(GRN_LINE_TYPE, line.id),
          ...(heldLineId === null ? [] : [recordItem(HELD_LINE_TYPE, heldLineId)]),
        ],
      });
    }
    planned.push({ line, countedBefore, countedAfter: each.countedQuantity, ...checked });
  }
  const delivering = await dependencies.booking.grnLinesDelivering(context, ids);
  const linked = planned.filter((each) => delivering.has(each.line.id));
  if (linked.length > 0) {
    return refusalOf({
      kind: 'refused',
      code: 'receiving.recount-linked',
      missing: linked.map((each) => recordItem(GRN_LINE_TYPE, each.line.id)),
    });
  }
  return { kind: 'success', answer: planned };
}

/** One stock effect of a recount: its ledger line, the GRN line, and what it does to which origin. */
export interface RecountEffect {
  readonly id: string;
  readonly grnLineId: string;
  readonly kind: 'added' | 'reversed';
  readonly receiptOriginId: string;
  readonly reversesMovementId: string | null;
  readonly quantity: number;
}

/**
 * The ledger items of a recount (goods-in 4.11; stock-ledger 13.4, 13.18), one per stock effect, each its line: for a
 * line that now receives more pieces, a receipt count of the difference, into the Arrival's receiving location in good
 * condition, goods of the line's identity, owned as the GRN's receipt counts are, its origin named by `receiving`; for
 * one that receives fewer, a reversal of the difference, taken from the line's origins newest first, each naming the
 * receipt count it reverses. A line whose pieces received do not change, only its extra pieces not received, makes
 * none.
 */
export async function recountItems(
  context: TransactionContext,
  locked: { readonly grn: GrnRow; readonly arrival: ArrivalRow },
  records: readonly RecountRecord[],
  planned: readonly PlannedLine[],
): Promise<{ readonly items: LedgerItem[]; readonly effects: RecountEffect[] }> {
  const { arrival } = locked;
  const at = {
    siteId: arrival.siteId,
    businessUnitId: arrival.businessUnitId,
    locationId: arrival.receivingLocationId,
  };
  const movements = records.flatMap((record) => record.movements);
  const items: LedgerItem[] = [];
  const effects: RecountEffect[] = [];
  for (const { line, before, after } of planned) {
    const difference = after.received - before.received;
    if (difference > 0) {
      const id = uuidv7();
      const receiptOriginId = uuidv7();
      items.push({
        kind: 'receipt-count',
        lineId: id,
        receiptOriginId,
        ...(line.skuId !== null
          ? { skuId: line.skuId }
          : {
              skuId: null,
              described:
                line.styleCode === null
                  ? null
                  : { styleCode: line.styleCode, colour: line.colour, size: line.sizeCode },
              brandId: arrival.brandId,
            }),
        quantity: difference,
        to: at,
        condition: 'good',
        owner: ownerOfGrn(locked.grn),
        ...(line.batchCode === null || line.expiryDate === null
          ? {}
          : { batch: { code: line.batchCode, expiryDate: line.expiryDate } }),
      });
      effects.push({
        id,
        grnLineId: line.id,
        kind: 'added',
        receiptOriginId,
        reversesMovementId: null,
        quantity: difference,
      });
    } else if (difference < 0) {
      const receivedAtIssue = lineFindings({ ...line, damagedQuantity: line.damagedQuantity }).received;
      const origins = await originsOfLine(context, line.id, receivedAtIssue, movements);
      for (const part of piecesToReverse(origins, -difference)) {
        const id = uuidv7();
        items.push({
          kind: 'reversal',
          lineId: id,
          movementId: part.movementId,
          at,
          goods:
            line.skuId === null
              ? { skuId: null, receiptOriginId: part.receiptOriginId, quantity: part.quantity }
              : { skuId: line.skuId, receiptOriginId: part.receiptOriginId, quantity: part.quantity },
        });
        effects.push({
          id,
          grnLineId: line.id,
          kind: 'reversed',
          receiptOriginId: part.receiptOriginId,
          reversesMovementId: part.movementId,
          quantity: part.quantity,
        });
      }
    }
  }
  return { items, effects };
}

/** The approval a recount's posting runs under: the decision, its document and who proposed it (access 9.7). */
export interface RecountApproval {
  readonly decisionId: string;
  readonly actionType: string;
  readonly recountId: string;
  readonly preparers: readonly string[];
}

export interface PostingDependencies {
  readonly ledger: StockLedgerInterface;
  /** Verify under lock and Record use, for the posting of an approved recount (access-and-approvals 9.7, 9.8a). */
  readonly access?: Pick<AccessInterface, 'verifyUnderLock' | 'recordUse'>;
}

/** The value a request carries on its basis: the ledger's, never zero for Unknown (PRD-ACS-016). */
export function requestValueOf(value: ItemValue) {
  return value.kind === 'known'
    ? { kind: 'known' as const, amountPaise: value.amountPaise }
    : { kind: 'unknown' as const };
}

/**
 * One ledger request of a recount's items (stock-ledger 13.1 "The caller's command"): Plan; Lock, steps 2 to 6; the
 * periods and the caller's number series at step 8 in one call; Recheck and value. With `write`, under an approval:
 * Verify under lock with the request's value, Record use, then Write. Without `write`, it answers the value only and
 * writes nothing, for the value a proposal's approval is requested on. A recount whose items are none locks its series
 * only.
 */
export async function postRecount(
  context: TransactionContext,
  dependencies: PostingDependencies,
  request: {
    readonly recountId: string;
    readonly actor: Actor;
    readonly items: readonly LedgerItem[];
    readonly series: readonly LockTarget[];
    readonly approval?: RecountApproval;
  },
  write: boolean,
): Promise<Outcome<{ readonly value: ItemValue; readonly written: Written | undefined }>> {
  if (request.items.length === 0) {
    if (request.series.length > 0) await context.lock(LOCK_STEP.numberSeries, [...request.series]);
    return { kind: 'success', answer: { value: { kind: 'unknown' }, written: undefined } };
  }
  const useId = uuidv7();
  const planned = await dependencies.ledger.plan(context, {
    source: {
      module: RECEIVING_MODULE,
      recordType: RECOUNT_SOURCE_TYPE,
      recordId: request.recountId,
      versionId: request.recountId,
      importKind: 'none',
    },
    actor: { kind: 'user', userId: request.actor.userId, roleAssignmentId: request.actor.roleAssignmentId },
    items: request.items,
    ...(request.approval === undefined ? {} : { approval: { decisionId: request.approval.decisionId, useId } }),
  });
  if (planned.kind === 'refused') return refusalOf(planned.refusal);
  const lockedPlan = await dependencies.ledger.lock(context, planned.value);
  const periods = await dependencies.ledger.holdPeriods(context, planned.value);
  if (periods.kind === 'refused') return refusalOf(periods.refusal);
  const stepEight = [...periods.value, ...request.series];
  if (stepEight.length > 0) await context.lock(LOCK_STEP.numberSeries, stepEight);
  const checked = await dependencies.ledger.recheck(context, lockedPlan);
  if (checked.kind === 'refused') return refusalOf(checked.refusal);
  const value = checked.value.value;
  if (!write) return { kind: 'success', answer: { value, written: undefined } };
  const { approval } = request;
  if (approval !== undefined) {
    const { access } = dependencies;
    if (access === undefined) throw new CommandDefect('A recount was posted under an approval with no access');
    const check = {
      decisionId: approval.decisionId,
      actionType: approval.actionType,
      document: {
        module: RECEIVING_MODULE,
        recordType: RECOUNT_TYPE,
        recordId: approval.recountId,
        versionId: approval.recountId,
      },
      preparers: approval.preparers,
      value: requestValueOf(value),
    };
    const verified: CommandRefusal | undefined = await access.verifyUnderLock(context, check);
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
  return { kind: 'success', answer: { value, written: written.value } };
}
