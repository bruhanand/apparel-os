import { uuidv7 } from '@apparel-os/domain';
import { BOOKING_TYPE, bookingTotals, type MissingItem } from '@apparel-os/schemas';
import {
  CommandDefect,
  LOCK_STEP,
  lockTable,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { DocumentEffect, EffectDecider, EffectOutcome } from '../../access/index.js';
import type { AuditChange, AuditInterface } from '../../audit/index.js';
import { OPEN_POLICY_READINESS, type ConfigurationInterface } from '../../configuration/index.js';
import { brandSupplierLinkedOn, termsInForce } from '../../merchandise/parties/index.js';
import type { NumberingInterface } from '../../numbering/index.js';
import { bookingApproval, bookingChange, bookingNumber, openToBuyReservation } from '../db/schema.js';
import { bookingAuditRecord, bookingVersionItem, shortfallItem, stateOf } from '../domain/bookings.js';
import { BOOKING_OPERATIONS } from '../domain/gate.js';
import { BOOKING_KIND, BOOKING_SCOPE_KEY, MISSING_BOOKING_SERIES } from '../domain/kinds.js';
import { bookingApproved } from '../events.js';
import {
  bookingLock,
  bookingRow,
  changesOf,
  numberOf,
  pricedLines,
  versionWithLines,
  type BookingRow,
  type LineRow,
  type VersionRow,
} from '../queries/bookings.js';
import { budgetOf, remainingOf } from '../queries/budgets.js';
import { budgetLock, refused, today } from './common.js';

// What a decision does to a booking version (goods-in 3.2 to 3.4, 10.3, 10.5; module-map 6.2 flow A;
// access-and-approvals 9.8b; PRD-BKG-002, PRD-BKG-004, PRD-SEC-017; POL-05.02, POL-01.04, POL-02.07, POL-02.09;
// DEC-129, DEC-132; S2-F01-T03), in the decision's transaction. `access` has checked, under its locks, that the
// approver is none of the version's preparers and that their booking limit covers the version's value at cost (9.3).
// Decide takes, with the request at step 1, the booking's identity row and the budget of its brand and season, so two
// approvals never reserve the same remaining open-to-buy (code-house-rules 8.2).
//
// - Approved: in one transaction, or nothing: the version is still the one submitted; the policy gate under policies 5
//   and 1 (goods-in 10.5); the supplier still linked to the brand on the approval's date (PRD-MER-021); open-to-buy
//   approved for the brand and season and its remainder covering the booking's value, which is reserved (3.3;
//   POL-05.02); the brand's Agreement version in force on that date, fixed on the booking (3.2; DEC-132); the number
//   from the booking series at its first approval (3.1; numbering-and-audit 3.2), the series locked at step 8; the
//   booking Approved; its audit record and outbox event.
// - Rejected: the booking returns to Draft (3.4); the rejected version stays as it was.

/** What the effect needs: audit, the policy gate, and the booking series through `numbering`. */
export interface ApprovalDependencies {
  readonly audit: AuditInterface;
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
  readonly numbering: Pick<NumberingInterface, 'liveSeries' | 'seriesLockTarget' | 'allocate'>;
}

/** Agreement margins are never read by a booking's approval: it fixes the version, not its margins (goods-in 3.2). */
const SHOW_MARGINS = false;

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
const value = (field: string, before: ValueChange['before'], after: ValueChange['after']): ValueChange => ({
  kind: 'value',
  field,
  before,
  after,
});

const refusalOf = (refusal: CommandRefusal): EffectOutcome => ({ kind: 'refusal', refusal });

/** A version and its booking, or undefined when either is not there for the actor. */
async function versionAndBooking(
  context: TransactionContext,
  versionId: string,
): Promise<{ readonly version: VersionRow; readonly lines: readonly LineRow[]; readonly row: BookingRow } | undefined> {
  const read = await versionWithLines(context, versionId);
  if (read === undefined) return undefined;
  const row = await bookingRow(context, read.version.bookingId);
  return row === undefined ? undefined : { version: read.version, lines: read.lines, row };
}

/** The booking's lock and its brand and season's budget, which Decide takes with the request (8.2). */
async function targetsOf(context: TransactionContext, versionId: string): Promise<LockTarget[]> {
  const found = await versionAndBooking(context, versionId);
  if (found === undefined) return [];
  const budget = await budgetOf(context, found.row.brandId, found.version.seasonValueId);
  return [bookingLock(found.row.id), ...(budget === undefined ? [] : [budgetLock(budget.id)])];
}

/**
 * The version, rechecked under the lock: it exists and is still the one submitted, awaiting its decision; a booking
 * changed since, or decided, refuses it (PRD-ACS-007).
 */
async function awaiting(context: TransactionContext, versionId: string) {
  const found = await versionAndBooking(context, versionId);
  if (found === undefined) return refused<never>('not-found', 'booking.record-not-found');
  const newest = (await changesOf(context, found.row.id)).at(-1);
  if (newest?.change !== 'submission' || newest.bookingVersionId !== versionId) {
    return refused<never>('refused', 'booking.version-not-awaiting', [bookingVersionItem(found.row.id, versionId)]);
  }
  return { ...found, changeNumber: newest.changeNumber };
}

function decided(decider: EffectDecider): { readonly decisionId: string; readonly roleAssignmentId: string } {
  if (decider.approvalDecisionId === undefined || decider.roleAssignmentId === undefined) {
    throw new CommandDefect('A booking decision ran without its decision or the assignment relied on');
  }
  return { decisionId: decider.approvalDecisionId, roleAssignmentId: decider.roleAssignmentId };
}

/** Writes the booking's change of a decision, its next under the lock. */
async function recordDecision(
  context: TransactionContext,
  row: BookingRow,
  change: 'approval' | 'rejection',
  versionId: string,
  changeNumber: number,
  userId: string,
): Promise<void> {
  await context.tx.insert(bookingChange).values({
    id: uuidv7(),
    bookingId: row.id,
    changeNumber: changeNumber + 1,
    change,
    bookingVersionId: versionId,
    brandId: row.brandId,
    siteId: row.siteId,
    changedByUserId: userId,
  });
}

/**
 * The policy gate of a booking's approval (goods-in 10.5; access-and-approvals 7.1 step 2; PRD-SEC-017): Available for
 * both operations, each thing missing named once (PRD-UXP-003). Undefined when available.
 */
async function gateRefusal(
  context: TransactionContext,
  configuration: ApprovalDependencies['configuration'],
  siteId: string,
): Promise<CommandRefusal | undefined> {
  const missing: MissingItem[] = [];
  const seen = new Set<string>();
  for (const operation of BOOKING_OPERATIONS) {
    const answer = await configuration.checkAvailability(context, operation.code, { siteId });
    if (answer === undefined) throw new CommandDefect(`${operation.code} is not declared`);
    for (const item of answer.missing) {
      const key = JSON.stringify(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
      if (seen.has(key)) continue;
      seen.add(key);
      missing.push(item);
    }
  }
  if (missing.length === 0) return undefined;
  return { kind: 'unavailable', code: 'configuration.operation-unavailable', missing, next: OPEN_POLICY_READINESS };
}

async function approve(
  dependencies: ApprovalDependencies,
  context: TransactionContext,
  decider: EffectDecider,
  versionId: string,
): Promise<EffectOutcome> {
  const found = await awaiting(context, versionId);
  if ('kind' in found) return found;
  const { version, lines, row, changeNumber } = found;
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  const gate = await gateRefusal(context, dependencies.configuration, row.siteId);
  if (gate !== undefined) return refusalOf(gate);
  // The booking's date is its approval's: the supplier must be linked to the brand then (PRD-MER-021).
  if (!(await brandSupplierLinkedOn(context, row.brandId, version.supplierPartyId, date))) {
    return refused('refused', 'booking.supplier-not-linked', [
      { kind: 'record', recordType: 'merchandise.party', recordId: version.supplierPartyId },
      { kind: 'record', recordType: 'merchandise.brand', recordId: row.brandId },
    ]);
  }
  // Open-to-buy (3.3; POL-05.02): an approved budget for the brand and season, locked with the booking, whose
  // remainder covers the booking's value at cost (DM-8); otherwise the shortfall is shown.
  const valueAtCost = bookingTotals(pricedLines(lines)).booking.cost;
  const season = { brandId: row.brandId, seasonValueId: version.seasonValueId };
  const budget = await budgetOf(context, row.brandId, version.seasonValueId);
  if (budget !== undefined && context.heldLock(lockTable('booking', 'open_to_buy_budget'), budget.id) === undefined) {
    // A budget made after Decide chose its locks: tried again, it is locked (code-house-rules 8.2).
    return refused('conflict', 'kernel.stale-version', [bookingVersionItem(row.id, versionId)]);
  }
  const remaining = budget === undefined ? undefined : await remainingOf(context, budget, context.startedAt);
  if (budget === undefined || remaining?.kind !== 'approved') {
    return refused('refused', 'booking.open-to-buy-missing', [
      { kind: 'open-to-buy', brandId: row.brandId, seasonValueId: version.seasonValueId },
    ]);
  }
  if (valueAtCost > remaining.remaining) {
    return refused('refused', 'booking.open-to-buy-short', [shortfallItem(season, valueAtCost, remaining.remaining)]);
  }
  // The brand's Agreement version in force on the approval's date, which the booking keeps (3.2; DEC-132).
  const agreement = await termsInForce(context, { brandId: row.brandId }, date, SHOW_MARGINS);
  if (agreement === undefined) {
    return refused('refused', 'booking.no-agreement-in-force', [
      { kind: 'record', recordType: 'merchandise.brand', recordId: row.brandId },
    ]);
  }
  // The number, from the booking series, at the booking's first approval (3.1; numbering-and-audit 3.2).
  const numbered = await numberOf(context, row.id);
  let allocated: { readonly number: string; readonly allocationId: string } | undefined;
  if (numbered === undefined) {
    const series = await dependencies.numbering.liveSeries(context, {
      kind: BOOKING_KIND.kind,
      scopeKey: BOOKING_SCOPE_KEY,
    });
    if (series === undefined) return refused('unavailable', 'booking.no-booking-series', [MISSING_BOOKING_SERIES]);
    if (series.state !== 'Open') {
      return refused('unavailable', 'booking.booking-series-paused', [MISSING_BOOKING_SERIES]);
    }
    await context.lock(LOCK_STEP.numberSeries, [dependencies.numbering.seriesLockTarget(series.seriesId)]);
    const given = await dependencies.numbering.allocate(context, {
      seriesId: series.seriesId,
      documentType: BOOKING_TYPE,
      documentId: row.id,
    });
    if (given.kind === 'refused') {
      const code =
        given.refusal.code === 'numbering.series-paused'
          ? 'booking.booking-series-paused'
          : 'booking.no-booking-series';
      return refused('unavailable', code, [MISSING_BOOKING_SERIES]);
    }
    allocated = { number: given.value.formattedText, allocationId: given.value.allocationId };
  }

  const { decisionId, roleAssignmentId } = decided(decider);
  const approvalId = uuidv7();
  await context.tx.insert(bookingApproval).values({
    id: approvalId,
    bookingId: row.id,
    bookingVersionId: versionId,
    brandId: row.brandId,
    siteId: row.siteId,
    agreementId: agreement.agreementId,
    agreementVersionId: agreement.versionId,
    valuePaise: valueAtCost,
    approvalDecisionId: decisionId,
    approvedByUserId: decider.actor.id,
    approvedAt: context.startedAt,
    businessDate: date,
  });
  if (allocated !== undefined) {
    await context.tx.insert(bookingNumber).values({
      id: uuidv7(),
      bookingId: row.id,
      brandId: row.brandId,
      siteId: row.siteId,
      number: allocated.number,
      numberAllocationId: allocated.allocationId,
      bookingApprovalId: approvalId,
    });
  }
  await context.tx.insert(openToBuyReservation).values({
    id: uuidv7(),
    openToBuyBudgetId: budget.id,
    bookingId: row.id,
    bookingApprovalId: approvalId,
    amountPaise: valueAtCost,
  });
  await recordDecision(context, row, 'approval', versionId, changeNumber, decider.actor.id);
  await dependencies.audit.record(context, {
    actor: decider.actor,
    roleAssignmentId,
    approval: { decisionId },
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    scope: { siteId: row.siteId, brandId: row.brandId },
    record: bookingAuditRecord(row.id, versionId),
    operation: 'approve-booking',
    changes: [
      value('state', stateOf('submission'), stateOf('approval')),
      value('agreementVersionId', null, agreement.versionId),
      value('reserved', null, { budgetId: budget.id, amount: valueAtCost }),
      ...(allocated === undefined ? [] : [value('number', null, allocated.number)]),
    ],
    source: { kind: 'screen' },
  });
  await context.publish(bookingApproved, {
    subject: { module: 'booking', recordType: BOOKING_TYPE, recordId: row.id, versionId },
    scope: { siteId: row.siteId, brandId: row.brandId },
    payload: { bookingId: row.id, versionId },
  });
  return {
    kind: 'success',
    answer: { bookingId: row.id, versionId, number: allocated?.number ?? numbered ?? null },
  };
}

async function reject(
  dependencies: ApprovalDependencies,
  context: TransactionContext,
  decider: EffectDecider,
  versionId: string,
): Promise<EffectOutcome> {
  const found = await awaiting(context, versionId);
  if ('kind' in found) return found;
  const { row, changeNumber } = found;
  await recordDecision(context, row, 'rejection', versionId, changeNumber, decider.actor.id);
  await dependencies.audit.record(context, {
    actor: decider.actor,
    ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
    ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    scope: { siteId: row.siteId, brandId: row.brandId },
    record: bookingAuditRecord(row.id, versionId),
    operation: 'reject-booking',
    changes: [value('state', stateOf('submission'), stateOf('rejection'))],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { bookingId: row.id, versionId } };
}

/** The decision effect of a booking version's approval (access-and-approvals 9.8b; goods-in 3.4). */
export function bookingApprovalEffect(dependencies: ApprovalDependencies): DocumentEffect {
  return {
    targets: targetsOf,
    approve: (context, decider, versionId) => approve(dependencies, context, decider, versionId),
    reject: (context, decider, versionId) => reject(dependencies, context, decider, versionId),
  };
}
