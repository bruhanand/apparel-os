import { z } from 'zod';
import { idSchema } from './common.js';
import { missingItemSchema } from './errors.js';

// The recovery of a restored Organisation: its status in the operations view and the three recovery commands of
// `configuration` that act while it is held (backup-and-restore 4.3, 4.5, 5.3, section 6; GC9-8; POL-18.03,
// POL-18.04, PRD-SEC-013; S1-F14-T03). Who holds the commands, and whether one person may record both validations, is
// KDPS's (GC9-6, V-01); nothing here is a default.

/** Free text a person gives as evidence or a reason: never empty, and within a size a screen shows. */
const statementSchema = z.string().trim().min(1).max(2000);

/**
 * Reconcile a series after a restore (5.3): the evidence of the highest number issued, such as printed or uploaded
 * bills, the counters' records, or a statement that no document left the system, the highest number it shows, or
 * null for that statement, and the reason.
 */
export const seriesReconciliationDraftSchema = z.strictObject({
  evidence: statementSchema,
  evidenceHighest: z.int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  reason: statementSchema,
});
export type SeriesReconciliationDraft = z.infer<typeof seriesReconciliationDraftSchema>;

export const seriesParamSchema = z.strictObject({ seriesId: idSchema });

/** What a reconciliation did: the next number before and after, so the numbers skipped are `before` to `after - 1`. */
export const seriesReconciledSchema = z.strictObject({
  seriesId: idSchema,
  restoredHighest: z.int().min(0),
  nextSequenceBefore: z.int().min(1),
  nextSequenceAfter: z.int().min(1),
});

/** Which of stock, bills and financial totals a validation compared (4.3; POL-18.03). */
export const recoveryComparedSchema = z.enum(['stock', 'bills', 'financial-totals']);

/**
 * Record a validation of a restored Organisation (4.3; POL-18.03): by Operations or by Accounts, which of stock, bills
 * and financial totals it compared, against what, and with what evidence.
 */
export const recoveryValidationDraftSchema = z.strictObject({
  validates: z.enum(['operations', 'accounts']),
  compared: z
    .array(recoveryComparedSchema)
    .min(1)
    .refine((list) => new Set(list).size === list.length, { message: 'Each is named once' }),
  comparedAgainst: statementSchema,
  evidence: statementSchema,
});
export type RecoveryValidationDraft = z.infer<typeof recoveryValidationDraftSchema>;

export const recoveryValidationRecordedSchema = z.strictObject({ validationId: idSchema });

/**
 * Reopen a restored Organisation (4.3, 4.4, 8.4): the person confirms that every revocation and every legal hold known
 * from outside evidence after the recovery point was placed again. Each must be confirmed. The recovery gaps need no
 * confirmation: each is raised as an exception that must be settled first (4.5; product owner, 12 Oct 2026).
 */
export const recoveryReopeningDraftSchema = z.strictObject({
  revocationsPlacedAgain: z.literal(true),
  legalHoldsPlacedAgain: z.literal(true),
});
export type RecoveryReopeningDraft = z.infer<typeof recoveryReopeningDraftSchema>;

export const recoveryReopenedSchema = z.strictObject({
  restoreId: idSchema,
  reopenedAt: z.iso.datetime({ offset: true }),
});

/** One check of the restore, as `kernel.recovery_event` keeps it: counts and names only. */
export const recoveryCheckSchema = z.strictObject({
  unit: z.string().min(1),
  check: z.string().min(1),
  passed: z.boolean(),
  checked: z.int().min(0),
  failed: z.int().min(0),
  subject: z.string().min(1).nullable(),
});

/** A recovery gap the restore found (4.5), such as an object with no record and when it was stored. */
export const recoveryGapSchema = z.strictObject({
  unit: z.string().min(1),
  name: z.string().min(1),
  subject: z.string().min(1),
  subjectAt: z.iso.datetime({ offset: true }).nullable(),
  afterRecoveryPoint: z.boolean(),
});

/**
 * A gap after the recovery point, or a failed step or check still standing, which must be raised as an exception and
 * settled before reopening (4.3, 4.5, 5.1; product owner, 12 Oct 2026).
 */
export const recoveryItemSchema = z.strictObject({
  eventId: idSchema,
  kind: z.enum(['gap', 'failure']),
  unit: z.string().min(1),
  name: z.string().min(1),
  subject: z.string().min(1).nullable(),
  exceptionId: idSchema.nullable(),
  settlement: z.enum(['resolved', 'accepted']).nullable(),
});

/** A series the restore paused that waits for its reconciliation (5.3). */
export const seriesAwaitingReconciliationSchema = z.strictObject({
  seriesId: idSchema,
  kind: z.string().min(1),
  nextSequence: z.int().min(1),
  restoredHighest: z.int().min(0),
});

export const recoveryValidationSchema = z.strictObject({
  validationId: idSchema,
  validates: z.enum(['operations', 'accounts']),
  compared: z.array(recoveryComparedSchema),
  comparedAgainst: z.string(),
  evidence: z.string(),
  validatedBy: z.string(),
  validatedAt: z.iso.datetime({ offset: true }),
});

/**
 * Recovery status in the operations view (4.2 step 8, 4.3; module-map 4.1; PRD-SEC-013): whether the Organisation is
 * held, and of its latest restore the backup and recovery point, every check with its result, the gaps, the series to
 * reconcile, the validations, whether it may reopen and what blocks it, and when it reopened.
 */
export const recoveryStatusSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  held: z.boolean(),
  restore: z
    .strictObject({
      restoreId: idSchema,
      backupId: idSchema,
      recoveryPoint: z.iso.datetime({ offset: true }),
      restoredAt: z.iso.datetime({ offset: true }),
      reopenedAt: z.iso.datetime({ offset: true }).nullable(),
      checks: z.array(recoveryCheckSchema),
      gaps: z.array(recoveryGapSchema),
      /** What must be raised as an exception and settled before reopening. */
      items: z.array(recoveryItemSchema),
      seriesToReconcile: z.array(seriesAwaitingReconciliationSchema),
      validations: z.array(recoveryValidationSchema),
      /** What blocks reopening now; empty when it may reopen, or once it has. */
      blocking: z.array(missingItemSchema),
    })
    .nullable(),
});
export type RecoveryStatus = z.infer<typeof recoveryStatusSchema>;
