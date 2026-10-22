import { paise, uuidv7 } from '@apparel-os/domain';
import { BOOKING_TYPE, type BookingLineStatus } from '@apparel-os/schemas';
import {
  CommandDefect,
  defineJobKind,
  LOCK_STEP,
  type JobKindDefinition,
  type JsonValue,
  type StructuredLogger,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { ExceptionsInterface, ExceptionTypeRegistration } from '../../exceptions/index.js';
import { bookingOverdue } from '../db/schema.js';
import { bookingAuditRecord, bookingItem, exceptionFactsOf } from '../domain/bookings.js';
import { bookingLock, bookingRow } from '../queries/bookings.js';
import { statusOfBooking } from '../queries/lifecycle.js';
import { linesMarkedBy, overdueCandidates, overdueMarksOf } from '../queries/overdue.js';

// The overdue follow-up (goods-in 3.8, 3.10; PRD-BKG-009; POL-05.06; DEC-099; S2-F01-T04): a job kind the worker sends
// for each Organisation at the interval of its worker setting (code-house-rules 12.9; CH-10). When the delivery window,
// as extended, has passed with something outstanding, the balance is marked overdue and an exception reaches Booking
// in My work, as the routing of its type at the booking's destination Site names (access-and-approvals 12.1, 12.2;
// POL-02.16). Nothing is cancelled: Booking extends the window or cancels the balance, each with its approval (3.5).

/** The code of the internal service identity the booking job kinds run as (access-and-approvals 2.3; PRD-SEC-018). */
export const BOOKING_JOBS_IDENTITY = 'booking';

/** The exception type an overdue balance raises (access-and-approvals 12.1; goods-in 3.8). */
const OVERDUE_EXCEPTION_TYPE = 'booking.overdue-balance';

/**
 * How many bookings one run marks at most: a technical cap the builders set (code-house-rules 12.9), not a KDPS value,
 * so one run's transaction stays short; the next run takes the rest, since a marked balance is not taken again.
 */
export const OVERDUE_RUN_CAP = 100;

/** What the job needs, built by the composition root (module-map section 3, rule 6): audit and `exceptions`. */
export interface OverdueJobDependencies {
  readonly audit: (logger: StructuredLogger) => AuditInterface;
  readonly exceptions: (logger: StructuredLogger) => Pick<ExceptionsInterface, 'codeSeriesTarget' | 'raise'>;
}

/** The lines overdue and not yet marked for their due date, grouped by due date (goods-in 3.8). */
async function unmarked(
  context: TransactionContext,
  bookingId: string,
  lines: readonly BookingLineStatus[],
): Promise<Map<string, BookingLineStatus[]>> {
  const overdue = lines.filter((line) => line.overdue);
  if (overdue.length === 0) return new Map();
  const marks = await overdueMarksOf(
    context,
    bookingId,
    overdue.map((line) => line.lineKey),
  );
  const byDate = new Map<string, BookingLineStatus[]>();
  for (const line of overdue) {
    if (marks.some((mark) => mark.lineKey === line.lineKey && mark.dueDate === line.dueDate)) continue;
    byDate.set(line.dueDate, [...(byDate.get(line.dueDate) ?? []), line]);
  }
  return byDate;
}

/**
 * One run (goods-in 3.8): the candidates locked at step 1 and the exception-code series at step 8 (code-house-rules
 * 8.2); for each booking, read again under its lock, the lines overdue and not yet marked, by due date: one exception
 * of the booking and due date, its exposure the outstanding pieces at their indicative cost, raised to the owner its
 * routing names at the booking's destination Site, then each line marked with it, and the audit record. A booking
 * whose exception cannot be raised, as with no routing in force at its Site, is left unmarked, named in the answer,
 * and taken again by the next run; with no Open exception-code series nothing is marked (DEC-116). Answers what it did,
 * identifiers and codes only.
 */
async function markOverdue(
  context: TransactionContext,
  dependencies: {
    readonly audit: AuditInterface;
    readonly exceptions: Pick<ExceptionsInterface, 'codeSeriesTarget' | 'raise'>;
  },
  limit: number = OVERDUE_RUN_CAP,
): Promise<JsonValue> {
  const date = await context.businessDate();
  if (date.kind !== 'set') return { marked: 0, refused: 'access.business-date-not-set' };
  const candidates = await overdueCandidates(context, date.date, limit);
  if (candidates.length === 0) return { marked: 0, raised: 0 };
  await context.lock(LOCK_STEP.document, candidates.map(bookingLock));
  const series = await dependencies.exceptions.codeSeriesTarget(context);
  if (series.kind === 'refused') return { marked: 0, raised: 0, refused: series.refusal.code };
  await context.lock(LOCK_STEP.numberSeries, [series.value]);
  const actorId = context.actor.kind === 'actor' ? context.actor.actorId : undefined;
  if (actorId === undefined) throw new CommandDefect('The overdue job ran with no actor');
  let marked = 0;
  let raised = 0;
  const notRaised: { bookingId: string; code: string }[] = [];
  for (const bookingId of candidates) {
    const row = await bookingRow(context, bookingId);
    const status = row === undefined ? undefined : await statusOfBooking(context, bookingId, date.date);
    if (row === undefined || status === undefined) continue;
    for (const [dueDate, lines] of await unmarked(context, bookingId, status.lines)) {
      const exposure = lines.reduce((total, line) => paise(total + line.outstanding * line.indicativeCost), paise(0));
      const outcome = await dependencies.exceptions.raise(context, {
        raisingEvent: `${OVERDUE_EXCEPTION_TYPE}:${bookingId}:${dueDate}`,
        typeCode: OVERDUE_EXCEPTION_TYPE,
        facts: exceptionFactsOf(row),
        links: [{ module: 'booking', recordType: BOOKING_TYPE, recordId: bookingId, versionId: status.versionId }],
        exposure: { kind: 'known', amount: exposure },
        raisedBy: { kind: 'service-identity', id: actorId },
      });
      if (outcome.kind !== 'done') {
        notRaised.push({ bookingId, code: outcome.refusal.code });
        continue;
      }
      if (!outcome.value.replayed) raised += 1;
      await context.tx.insert(bookingOverdue).values(
        lines.map((line) => ({
          id: uuidv7(),
          bookingId,
          bookingLineId: line.lineKey,
          brandId: row.brandId,
          siteId: row.siteId,
          dueDate,
          outstanding: line.outstanding,
          exceptionId: outcome.value.exceptionId,
          markedByServiceIdentityId: actorId,
          markedAt: context.startedAt,
        })),
      );
      marked += lines.length;
      await dependencies.audit.record(context, {
        actor: { kind: 'service-identity', id: actorId },
        scope: { siteId: row.siteId, brandId: row.brandId },
        record: bookingAuditRecord(bookingId, status.versionId),
        operation: 'mark-booking-overdue',
        changes: [
          { kind: 'value', field: 'dueDate', before: null, after: dueDate },
          { kind: 'value', field: 'lineKeys', before: null, after: lines.map((line) => line.lineKey) },
          { kind: 'value', field: 'exceptionId', before: null, after: outcome.value.exceptionId },
        ],
        source: { kind: 'job' },
      });
    }
  }
  return { marked, raised, notRaised };
}

/**
 * The exception an overdue balance raises (access-and-approvals 12.1; goods-in 3.8; PRD-EXC-001): of the category
 * shortage, the goods ordered not delivered within the window, linking to the booking, routed to Booking as its routing
 * at the Site says (POL-02.16). **Design choice** of the category among PRD-EXC-001's, for the product owner to confirm
 * (RR-576). It closes once each balance it marked is no longer overdue: delivered or cancelled, or the window extended
 * to today or later (PRD-EXC-002). Its evidence carries no restricted class.
 */
export const overdueExceptionType: ExceptionTypeRegistration = {
  code: OVERDUE_EXCEPTION_TYPE,
  category: 'shortage',
  module: 'booking',
  linksTo: [BOOKING_TYPE],
  evidenceClasses: [],
  resolutionCheck: async (context, subject) => {
    const date = await context.businessDate();
    const missing = [];
    for (const link of subject.links) {
      if (link.recordType !== BOOKING_TYPE) continue;
      const marks = await linesMarkedBy(context, subject.exceptionId);
      // The closer must see the booking to verify it (code-house-rules 6.2): one they cannot see is not verified.
      const status =
        date.kind === 'set' && (await bookingRow(context, link.recordId)) !== undefined
          ? await statusOfBooking(context, link.recordId, date.date)
          : undefined;
      const stillOverdue =
        status === undefined ||
        marks.some((mark) => status.lines.find((line) => line.lineKey === mark.lineKey)?.overdue === true);
      if (stillOverdue) missing.push(bookingItem(link.recordId));
    }
    return missing.length === 0 ? { kind: 'verified' } : { kind: 'not-verified', missing };
  },
};

/**
 * The booking job kinds (code-house-rules 12.9): the overdue follow-up, authorised for edit on `booking.booking`, which
 * also lets its service identity read and write every booking's rows (code-house-rules 6.2). Its dependencies come from
 * the composition root, which builds the worker's registry (module-map section 3, rule 6).
 */
export function bookingJobKinds(dependencies: OverdueJobDependencies): readonly JobKindDefinition[] {
  return [
    defineJobKind({
      name: 'booking.mark-overdue',
      serviceIdentity: BOOKING_JOBS_IDENTITY,
      authorises: { action: 'edit', recordType: BOOKING_TYPE },
      run: (context, { logger }) =>
        markOverdue(context, { audit: dependencies.audit(logger), exceptions: dependencies.exceptions(logger) }),
    }),
  ];
}
