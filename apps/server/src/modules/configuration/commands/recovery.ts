import { uuidv7 } from '@apparel-os/domain';
import type {
  MissingItem,
  RecoveryStatus,
  RecoveryValidationDraft,
  RecoveryReopeningDraft,
  SeriesReconciliationDraft,
} from '@apparel-os/schemas';
import { asc, eq } from 'drizzle-orm';
import {
  latestRestoreOf,
  liftRecoveryHold,
  LOCK_STEP,
  recoveryEventsOf,
  recoveryHoldLockTarget,
  recoveryHoldOf,
  recoveryItemsOf,
  storedAfterRecoveryPoint,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { reconcileAfterRestore, seriesAwaitingReconciliation, seriesLockTarget } from '../../numbering/index.js';
import { recoveryValidation } from '../db/schema.js';
import type { Outcome, Recorder } from './policy-status.js';

// The recovery commands of a restored Organisation (backup-and-restore 4.3, 4.5, 5.3; GC9-8, product owner, 10 Oct
// 2026; POL-18.03, POL-18.04, PRD-ACS-013, PRD-INT-004; S1-F14-T03). They belong to `configuration`, which owns
// availability: reconcile a series, through `numbering`'s reconcile operation, the one same-tier call module-map 4.4
// lists; record a validation; and reopen, which lifts the hold through `kernel`'s interface. Each runs as the acting
// user under Authorise, which the caller holds at step 0, with its audit record. The command runner lets them run
// while the hold is on (kernel/operations/recovery-hold.ts). Who records the validations and who reopens is OPEN
// (GC9-6; KDPS Owner, Admin): nothing here checks a persona or that the two validations are by different people.

/** A refusal of a recovery command, with what blocks it (code-house-rules 12.3). */
function refusal<Answer>(code: string, missing: MissingItem[] = []): Outcome<Answer> {
  return { kind: 'refusal', refusal: { kind: 'refused', code, missing } };
}

/**
 * Reconcile a series after a restore (5.3): locks the series at step 8, then `numbering` sets its next number past the
 * higher of the evidence and the highest restored allocation, never lowering it, records the skip and the reason and
 * releases it. Allowed while held and after reopening: a series stays paused until it is reconciled (4.3).
 */
export async function reconcileSeries(
  context: TransactionContext,
  audit: AuditInterface,
  by: Recorder,
  seriesId: string,
  draft: SeriesReconciliationDraft,
): Promise<
  Outcome<{ seriesId: string; restoredHighest: number; nextSequenceBefore: number; nextSequenceAfter: number }>
> {
  await context.lock(LOCK_STEP.numberSeries, [seriesLockTarget(seriesId)]);
  const reconciled = await reconcileAfterRestore(context, {
    seriesId,
    evidence: draft.evidence,
    evidenceHighest: draft.evidenceHighest,
    reason: draft.reason,
  });
  if (reconciled.kind === 'refused') return { kind: 'refusal', refusal: reconciled.refusal };
  const done = reconciled.value;
  await audit.record(context, {
    actor: { kind: 'user', id: by.userId },
    roleAssignmentId: by.roleAssignmentId,
    record: { module: 'numbering', type: 'series', id: seriesId },
    operation: 'reconcile-series-after-restore',
    changes: [
      { kind: 'value', field: 'nextSequence', before: done.nextSequenceBefore, after: done.nextSequenceAfter },
      { kind: 'value', field: 'state', before: 'Paused', after: 'Open' },
      { kind: 'value', field: 'restoredHighest', before: null, after: done.restoredHighest },
      { kind: 'value', field: 'evidenceHighest', before: null, after: done.evidenceHighest },
      { kind: 'value', field: 'evidence', before: null, after: draft.evidence },
    ],
    reason: draft.reason,
    source: { kind: 'screen', reference: done.restoreId },
  });
  return {
    kind: 'success',
    answer: {
      seriesId,
      restoredHighest: done.restoredHighest,
      nextSequenceBefore: done.nextSequenceBefore,
      nextSequenceAfter: done.nextSequenceAfter,
    },
  };
}

/**
 * Record a validation of the held Organisation (4.3; POL-18.03): by Operations or by Accounts, what it compared,
 * against what and with what evidence, for the restore the hold names. Refused when the Organisation is not held.
 */
export async function recordRecoveryValidation(
  context: TransactionContext,
  audit: AuditInterface,
  by: Recorder,
  draft: RecoveryValidationDraft,
): Promise<Outcome<{ validationId: string }>> {
  const hold = await recoveryHoldOf(context);
  if (hold === undefined) return refusal('configuration.not-held', [{ kind: 'recovery-hold' }]);
  const validationId = uuidv7();
  await context.tx.insert(recoveryValidation).values({
    id: validationId,
    restoreId: hold.restoreId,
    validates: draft.validates,
    compared: [...draft.compared],
    comparedAgainst: draft.comparedAgainst,
    evidence: draft.evidence,
    validatedByUserId: by.userId,
    roleAssignmentId: by.roleAssignmentId,
    validatedAt: context.startedAt,
  });
  await audit.record(context, {
    actor: { kind: 'user', id: by.userId },
    roleAssignmentId: by.roleAssignmentId,
    record: { module: 'configuration', type: 'recovery_validation', id: validationId },
    operation: 'record-recovery-validation',
    changes: [
      { kind: 'value', field: 'restoreId', before: null, after: hold.restoreId },
      { kind: 'value', field: 'validates', before: null, after: draft.validates },
      { kind: 'value', field: 'compared', before: null, after: [...draft.compared] },
      { kind: 'value', field: 'comparedAgainst', before: null, after: draft.comparedAgainst },
      { kind: 'value', field: 'evidence', before: null, after: draft.evidence },
    ],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { validationId } };
}

/**
 * What blocks reopening the held Organisation now, as identifiers and codes (4.3, 4.5, 5.1; product owner, 12 Oct
 * 2026): a failed step or check that has neither passed since, when the checks ran again, nor had the exception raised
 * for it settled; a gap after the recovery point whose exception is not settled; a validation not recorded; a series
 * the restore paused that is not reconciled. A failed check never blocks for good.
 */
async function blocking(
  context: TransactionContext,
  restoreId: string,
): Promise<{ code: string; missing: MissingItem[] }[]> {
  const found: { code: string; missing: MissingItem[] }[] = [];
  const unsettled = (await recoveryItemsOf(context, restoreId)).filter((item) => item.settlement === null);
  for (const [kind, code] of [
    ['failure', 'configuration.restore-check-failed'],
    ['gap', 'configuration.recovery-gaps-unsettled'],
  ] as const) {
    const items = unsettled.filter((item) => item.kind === kind);
    if (items.length === 0) continue;
    found.push({
      code,
      missing: items.map((item) => ({
        kind: kind === 'failure' ? 'restore-check' : 'recovery-gap',
        eventId: item.eventId,
        unit: item.unit,
        check: item.name,
        ...(item.subject === null ? {} : { subject: item.subject }),
        ...(item.exceptionId === null ? {} : { exceptionId: item.exceptionId }),
      })),
    });
  }
  const validated = new Set((await validationsOf(context, restoreId)).map((row) => row.validates));
  const lacking = (['operations', 'accounts'] as const).filter((validates) => !validated.has(validates));
  if (lacking.length > 0) {
    found.push({
      code: 'configuration.validations-missing',
      missing: lacking.map((validates) => ({ kind: 'recovery-validation', validates })),
    });
  }
  const waiting = await seriesAwaitingReconciliation(context, restoreId);
  if (waiting.length > 0) {
    found.push({
      code: 'configuration.series-not-reconciled',
      missing: waiting.map((series) => ({ kind: 'series', seriesId: series.seriesId })),
    });
  }
  return found;
}

/**
 * Reopen the held Organisation (4.3): locks the hold, then refuses while a failed step or check, or a gap after the
 * recovery point, is not settled (4.5, 5.1), either validation is not recorded, or a series the restore paused is not
 * reconciled (5.3); the person has confirmed that revocations and legal holds known from outside evidence were placed
 * again (4.4, 8.4). Lifts the hold through `kernel`, writing the `hold-lifted` event that ends the measured recovery time
 * (section 6). Policy gates answer as before: reopening switches on nothing (PRD-SEC-017).
 */
export async function reopenAfterRestore(
  context: TransactionContext,
  audit: AuditInterface,
  by: Recorder,
  draft: RecoveryReopeningDraft,
): Promise<Outcome<{ restoreId: string; reopenedAt: string }>> {
  const seen = await recoveryHoldOf(context);
  if (seen === undefined) return refusal('configuration.not-held', [{ kind: 'recovery-hold' }]);
  await context.lock(LOCK_STEP.document, [recoveryHoldLockTarget(seen.holdId)]);
  const hold = await recoveryHoldOf(context);
  if (hold?.holdId !== seen.holdId) return refusal('configuration.not-held', [{ kind: 'recovery-hold' }]);
  const blocked = await blocking(context, hold.restoreId);
  const first = blocked[0];
  if (first !== undefined) return refusal(first.code, first.missing);
  const eventId = await liftRecoveryHold(context, hold, by);
  await audit.record(context, {
    actor: { kind: 'user', id: by.userId },
    roleAssignmentId: by.roleAssignmentId,
    record: { module: 'kernel', type: 'recovery_event', id: eventId },
    operation: 'reopen-after-restore',
    changes: [
      { kind: 'value', field: 'restoreId', before: null, after: hold.restoreId },
      { kind: 'value', field: 'held', before: true, after: false },
      { kind: 'value', field: 'revocationsPlacedAgain', before: null, after: draft.revocationsPlacedAgain },
      { kind: 'value', field: 'legalHoldsPlacedAgain', before: null, after: draft.legalHoldsPlacedAgain },
    ],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { restoreId: hold.restoreId, reopenedAt: context.startedAt.toISOString() } };
}

async function validationsOf(context: TransactionContext, restoreId: string) {
  return context.tx
    .select()
    .from(recoveryValidation)
    .where(eq(recoveryValidation.restoreId, restoreId))
    .orderBy(asc(recoveryValidation.validatedAt), asc(recoveryValidation.id));
}

/** One validation as the status and the drill record read it, the person by identifier. */
export interface RecoveryValidationRead {
  readonly validationId: string;
  readonly validates: 'operations' | 'accounts';
  readonly compared: readonly ('stock' | 'bills' | 'financial-totals')[];
  readonly comparedAgainst: string;
  readonly evidence: string;
  readonly validatedByUserId: string;
  readonly validatedAt: Date;
}

/** The validations of one restore, oldest first. */
export async function recoveryValidationsOf(
  context: TransactionContext,
  restoreId: string,
): Promise<RecoveryValidationRead[]> {
  return (await validationsOf(context, restoreId)).map((row) => ({
    validationId: row.id,
    validates: row.validates,
    compared: row.compared as RecoveryValidationRead['compared'],
    comparedAgainst: row.comparedAgainst,
    evidence: row.evidence,
    validatedByUserId: row.validatedByUserId,
    validatedAt: row.validatedAt,
  }));
}

/**
 * Recovery status (4.2 step 8, 4.3; PRD-SEC-013): whether the Organisation is held, and of its latest restore every
 * check, gap, series to reconcile, validation, and what blocks reopening. The validators by identifier: the caller
 * names them.
 */
export async function recoveryStatus(context: TransactionContext): Promise<
  Omit<RecoveryStatus, 'restore'> & {
    restore:
      (Omit<NonNullable<RecoveryStatus['restore']>, 'validations'> & { validations: RecoveryValidationRead[] }) | null;
  }
> {
  const hold = await recoveryHoldOf(context);
  const latest = await latestRestoreOf(context);
  if (latest === undefined) return { asOf: context.startedAt.toISOString(), held: hold !== undefined, restore: null };
  const events = await recoveryEventsOf(context, latest.restoreId);
  const recoveryPoint = latest.recoveryPoint ?? latest.occurredAt;
  const lifted = events.find((event) => event.kind === 'hold-lifted');
  const blocked = hold === undefined ? [] : await blocking(context, latest.restoreId);
  return {
    asOf: context.startedAt.toISOString(),
    held: hold !== undefined,
    restore: {
      restoreId: latest.restoreId,
      backupId: latest.backupId ?? latest.restoreId,
      recoveryPoint: recoveryPoint.toISOString(),
      restoredAt: latest.occurredAt.toISOString(),
      reopenedAt: lifted === undefined ? null : lifted.occurredAt.toISOString(),
      checks: events
        .filter((event) => event.kind === 'step' || event.kind === 'check')
        .map((event) => ({
          unit: event.unit ?? '',
          check: event.name ?? '',
          passed: event.passed === true,
          checked: event.checked ?? 0,
          failed: event.failed ?? 0,
          subject: event.subject,
        })),
      gaps: events
        .filter((event) => event.kind === 'gap')
        .map((event) => ({
          unit: event.unit ?? '',
          name: event.name ?? '',
          subject: event.subject ?? '',
          subjectAt: event.subjectAt === null ? null : event.subjectAt.toISOString(),
          afterRecoveryPoint: storedAfterRecoveryPoint(event.subjectAt, recoveryPoint),
        })),
      items: (await recoveryItemsOf(context, latest.restoreId)).map((item) => ({
        eventId: item.eventId,
        kind: item.kind,
        unit: item.unit,
        name: item.name,
        subject: item.subject,
        exceptionId: item.exceptionId,
        settlement: item.settlement,
      })),
      seriesToReconcile: (await seriesAwaitingReconciliation(context, latest.restoreId)).map((series) => ({
        seriesId: series.seriesId,
        kind: series.kind,
        nextSequence: series.nextSequence,
        restoredHighest: series.restoredHighest,
      })),
      validations: await recoveryValidationsOf(context, latest.restoreId),
      blocking: blocked.flatMap((each) => each.missing),
    },
  };
}
