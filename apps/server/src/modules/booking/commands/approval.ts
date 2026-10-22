import { paise, uuidv7 } from '@apparel-os/domain';
import { BOOKING_TYPE, type MissingItem } from '@apparel-os/schemas';
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
import {
  bookingApproval,
  bookingChange,
  bookingNumber,
  openToBuyRelease,
  openToBuyReservation,
  type BookingChangeKind,
} from '../db/schema.js';
import { bookingAuditRecord, bookingVersionItem, lineItem, shortfallItem } from '../domain/bookings.js';
import { BOOKING_OPERATIONS } from '../domain/gate.js';
import { BOOKING_KIND, BOOKING_SCOPE_KEY, MISSING_BOOKING_SERIES } from '../domain/kinds.js';
import { changeRefusal, committedValue, CONTENT_CHANGES } from '../domain/lifecycle.js';
import { bookingApproved } from '../events.js';
import {
  bookingLock,
  bookingRow,
  changesOf,
  numberOf,
  versionWithLines,
  type BookingRow,
  type LineRow,
  type VersionRow,
} from '../queries/bookings.js';
import { budgetOf, remainingOf } from '../queries/budgets.js';
import { cancelledOf, reservedByBudget, statusLines, statusOfBooking } from '../queries/lifecycle.js';
import { budgetLock, refused, today } from './common.js';

// What a decision does to a booking version (goods-in 3.2 to 3.5, 10.3, 10.5; module-map 6.2 flow A;
// access-and-approvals 9.8b; PRD-BKG-002, PRD-BKG-004, PRD-SEC-017; POL-05.02, POL-05.03, POL-01.04, POL-02.07,
// POL-02.09; DEC-129, DEC-132; S2-F01-T03, S2-F01-T04), in the decision's transaction. `access` has checked, under its
// locks, that the approver is none of the version's preparers and that their booking limit covers the version's value
// at cost (9.3). Decide takes, with the request at step 1, the booking's identity row, the budget of its brand and
// season and every budget the booking reserves of, so two approvals never reserve the same remaining open-to-buy
// (code-house-rules 8.2).
//
// - Approved: in one transaction, or nothing: the version is still the one submitted; the policy gate under policies 5
//   and 1 (goods-in 10.5); the supplier still linked to the brand on the approval's date (PRD-MER-021); for a change
//   after approval, every line still keeping what is delivered and cancelled of it (3.5; PRD-BKG-013); open-to-buy:
//   the value the version commits, its lines less what is cancelled at their cost, reserved by the difference from
//   what the booking reserves already, the remainder covering any increase, and a decrease, or what a change of season
//   leaves on another budget, released (3.3, 3.5; POL-05.02); the brand's Agreement version in force on that date,
//   fixed on the booking, so a change approved again takes the version then in force (3.2; DEC-132); the number from
//   the booking series at its first approval (3.1; numbering-and-audit 3.2), the series locked at step 8; the version
//   in force; its audit record and outbox event.
// - Rejected: the version submitted returns to Draft (3.4); before approval the booking is a Draft again, after it the
//   version in force stays in force.

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

/**
 * The booking's lock, its brand and season's budget, and every budget the booking reserves of now, which Decide takes
 * with the request (8.2): a change may move the booking to another season's budget (3.5).
 */
async function targetsOf(context: TransactionContext, versionId: string): Promise<LockTarget[]> {
  const found = await versionAndBooking(context, versionId);
  if (found === undefined) return [];
  const budget = await budgetOf(context, found.row.brandId, found.version.seasonValueId);
  const held = await reservedByBudget(context, found.row.id);
  const budgets = new Set([...(budget === undefined ? [] : [budget.id]), ...held.keys()]);
  return [bookingLock(found.row.id), ...[...budgets].map(budgetLock)];
}

/**
 * The version, rechecked under the lock: it exists and is still the one submitted, awaiting its decision, the newest
 * change of the booking's content being its submission; a booking changed since, or decided, refuses it
 * (PRD-ACS-007). Answers the number of the booking's newest change, after which the decision is written.
 */
async function awaiting(context: TransactionContext, versionId: string) {
  const found = await versionAndBooking(context, versionId);
  if (found === undefined) return refused<never>('not-found', 'booking.record-not-found');
  const changes = await changesOf(context, found.row.id);
  const content = changes.filter((each) => CONTENT_CHANGES.includes(each.change)).at(-1);
  const newest = changes.at(-1);
  if (newest === undefined || content?.change !== 'submission' || content.bookingVersionId !== versionId) {
    return refused<never>('refused', 'booking.version-not-awaiting', [bookingVersionItem(found.row.id, versionId)]);
  }
  return { ...found, changeNumber: newest.changeNumber };
}

/** The decision and the assignment relied on, which every effect of a decision has (access-and-approvals 9.8b). */
export function decided(decider: EffectDecider): { readonly decisionId: string; readonly roleAssignmentId: string } {
  if (decider.approvalDecisionId === undefined || decider.roleAssignmentId === undefined) {
    throw new CommandDefect('A booking decision ran without its decision or the assignment relied on');
  }
  return { decisionId: decider.approvalDecisionId, roleAssignmentId: decider.roleAssignmentId };
}

/** Writes the booking's change of a decision, its next under the lock. */
export async function recordDecision(
  context: TransactionContext,
  row: BookingRow,
  change: Extract<BookingChangeKind, 'approval' | 'rejection' | 'amendment-decision'>,
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
 * The policy gate of a booking's decisions (goods-in 10.5; access-and-approvals 7.1 step 2; PRD-SEC-017): Available for
 * both operations, each thing missing named once (PRD-UXP-003). Undefined when available. A version's approval, a
 * cancellation's and an extension's ask it alike (S2-F01-T04).
 */
export async function gateRefusal(
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

/** Whether the decision holds a budget's lock; one made after Decide chose its locks is stale (8.2). */
const holdsBudget = (context: TransactionContext, budgetId: string): boolean =>
  context.heldLock(lockTable('booking', 'open_to_buy_budget'), budgetId) !== undefined;

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
  // A change keeps what is delivered and cancelled of each line of the version in force, rechecked under the lock,
  // since goods may have been linked to it since it was saved (3.5; PRD-BKG-013).
  const keyed = statusLines(lines);
  const inForce = await statusOfBooking(context, row.id, date);
  const kept = inForce === undefined ? undefined : changeRefusal(inForce, keyed);
  if (kept !== undefined) return refused('refused', kept.code, [lineItem(row.id, kept.lineKey)]);
  // Open-to-buy (3.3, 3.5; POL-05.02): the version commits its lines less what is cancelled of them, at their cost
  // (DM-8). What it commits beyond what the booking reserves already of its brand and season's budget is reserved,
  // within that budget's remainder, otherwise the shortfall is shown; what is less, and what it reserves of any other
  // budget, is released.
  const committed = committedValue(keyed, await cancelledOf(context, row.id));
  const season = { brandId: row.brandId, seasonValueId: version.seasonValueId };
  const budget = await budgetOf(context, row.brandId, version.seasonValueId);
  const held = await reservedByBudget(context, row.id);
  const stale = refused<never>('conflict', 'kernel.stale-version', [bookingVersionItem(row.id, versionId)]);
  if (budget !== undefined && !holdsBudget(context, budget.id)) return stale;
  if ([...held.keys()].some((budgetId) => !holdsBudget(context, budgetId))) return stale;
  const already = budget === undefined ? 0 : (held.get(budget.id) ?? 0);
  const more = committed - already;
  // An approved budget for the brand and season is needed always (3.3; PRD-SEC-017); its remainder, only for more.
  const remaining = budget === undefined ? undefined : await remainingOf(context, budget, context.startedAt);
  if (budget === undefined || remaining?.kind !== 'approved') {
    return refused('refused', 'booking.open-to-buy-missing', [
      { kind: 'open-to-buy', brandId: row.brandId, seasonValueId: version.seasonValueId },
    ]);
  }
  if (more > 0 && more > remaining.remaining) {
    return refused('refused', 'booking.open-to-buy-short', [
      shortfallItem(season, committed, remaining.remaining + already),
    ]);
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
    valuePaise: committed,
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
  if (more > 0) {
    await context.tx.insert(openToBuyReservation).values({
      id: uuidv7(),
      openToBuyBudgetId: budget.id,
      bookingId: row.id,
      bookingApprovalId: approvalId,
      amountPaise: paise(more),
    });
  }
  const released: { budgetId: string; amount: number }[] = [];
  for (const [budgetId, amount] of held) {
    if (budgetId === budget.id) {
      if (more < 0) released.push({ budgetId, amount: -more });
    } else {
      released.push({ budgetId, amount });
    }
  }
  for (const release of released) {
    await context.tx.insert(openToBuyRelease).values({
      id: uuidv7(),
      openToBuyBudgetId: release.budgetId,
      bookingId: row.id,
      bookingApprovalId: approvalId,
      bookingAmendmentId: null,
      amountPaise: paise(release.amount),
    });
  }
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
      value('state', 'Awaiting approval', 'Approved'),
      value('agreementVersionId', null, agreement.versionId),
      value('committed', null, committed),
      ...(more <= 0 ? [] : [value('reserved', null, { budgetId: budget.id, amount: more })]),
      ...(released.length === 0 ? [] : [value('released', null, released)]),
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
    changes: [value('state', 'Awaiting approval', 'Draft')],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { bookingId: row.id, versionId } };
}

/** The decision effect of a booking version's approval (access-and-approvals 9.8b; goods-in 3.4, 3.5). */
export function bookingApprovalEffect(dependencies: ApprovalDependencies): DocumentEffect {
  return {
    targets: targetsOf,
    approve: (context, decider, versionId) => approve(dependencies, context, decider, versionId),
    reject: (context, decider, versionId) => reject(dependencies, context, decider, versionId),
  };
}
