import { paise, type Paise } from '@apparel-os/domain';
import type { BookingAmendment, BookingStatus } from '@apparel-os/schemas';
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { LatestRequest } from '../../access/index.js';
import {
  bookingAmendment,
  bookingAmendmentDecision,
  bookingAmendmentLine,
  bookingApproval,
  bookingConfirmation,
  bookingIssue,
  bookingLine,
  bookingReceiptLink,
  bookingSupplierFile,
  bookingVersion,
  openToBuyRelease,
  openToBuyReservation,
} from '../db/schema.js';
import { statusOf, type ApprovedExtension, type StatusLine } from '../domain/lifecycle.js';
import type { LineRow, VersionRow } from './bookings.js';

// The reads of an approved booking's lifecycle (goods-in 3.4 to 3.8, 3.10; PRD-BKG-005, PRD-BKG-006; S2-F01-T04): the
// approval in force, its issue and confirmation, the line keys, what is delivered from receipt links and cancelled by
// approved cancellations, the approved extensions, the booking status, the amendments and the supplier's files, and
// what the booking reserves of each budget. Every row is scoped (code-house-rules 6.2).

type ApprovalRow = typeof bookingApproval.$inferSelect;
type AmendmentRow = typeof bookingAmendment.$inferSelect;

/** A line's key: the identity it keeps across versions, its first line's identifier (goods-in 3.10). */
export const lineKeyOf = (line: Pick<LineRow, 'id' | 'firstLineId'>): string => line.firstLineId ?? line.id;

/** The approval of the version in force, the approved version of the highest number, or undefined (goods-in 3.5). */
export async function approvalInForce(
  context: TransactionContext,
  bookingId: string,
): Promise<(ApprovalRow & { readonly versionNumber: number }) | undefined> {
  const [row] = await context.tx
    .select({ approval: bookingApproval, versionNumber: bookingVersion.versionNumber })
    .from(bookingApproval)
    .innerJoin(bookingVersion, eq(bookingVersion.id, bookingApproval.bookingVersionId))
    .where(eq(bookingApproval.bookingId, bookingId))
    .orderBy(desc(bookingVersion.versionNumber))
    .limit(1);
  return row === undefined ? undefined : { ...row.approval, versionNumber: row.versionNumber };
}

/** The issue of a version, or undefined (goods-in 3.4). */
export async function issueOf(context: TransactionContext, versionId: string) {
  const [row] = await context.tx.select().from(bookingIssue).where(eq(bookingIssue.bookingVersionId, versionId));
  return row;
}

/** The confirmation of a version, or undefined (goods-in 3.4). */
export async function confirmationOf(context: TransactionContext, versionId: string) {
  const [row] = await context.tx
    .select()
    .from(bookingConfirmation)
    .where(eq(bookingConfirmation.bookingVersionId, versionId));
  return row;
}

/** Every line key a version of the booking holds (goods-in 3.10). */
export async function lineKeysOf(context: TransactionContext, bookingId: string): Promise<Set<string>> {
  const rows = await context.tx
    .select({ id: bookingLine.id, firstLineId: bookingLine.firstLineId })
    .from(bookingLine)
    .innerJoin(bookingVersion, eq(bookingVersion.id, bookingLine.bookingVersionId))
    .where(eq(bookingVersion.bookingId, bookingId));
  return new Set(rows.map(lineKeyOf));
}

/** Sums of pieces by booking and line key, from rows that each name both. */
function byBookingAndKey(
  rows: readonly { readonly bookingId: string; readonly key: string; readonly pieces: string }[],
): Map<string, Map<string, number>> {
  const answer = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const lines = answer.get(row.bookingId) ?? new Map<string, number>();
    lines.set(row.key, Number(row.pieces));
    answer.set(row.bookingId, lines);
  }
  return answer;
}

/**
 * The pieces delivered to each line of each booking given, by key, from its receipt links only (PRD-BKG-006): one read
 * for every booking, as the stage 2 reports read a page of them (S2-F11-T02).
 */
export async function deliveredOfBookings(
  context: TransactionContext,
  bookingIds: readonly string[],
): Promise<Map<string, Map<string, number>>> {
  if (bookingIds.length === 0) return new Map();
  const rows = await context.tx
    .select({
      bookingId: bookingReceiptLink.bookingId,
      key: bookingReceiptLink.bookingLineId,
      pieces: sql<string>`sum(${bookingReceiptLink.quantity})::text`,
    })
    .from(bookingReceiptLink)
    .where(inArray(bookingReceiptLink.bookingId, [...new Set(bookingIds)]))
    .groupBy(bookingReceiptLink.bookingId, bookingReceiptLink.bookingLineId);
  return byBookingAndKey(rows);
}

/** The pieces delivered to each line of the booking by key, from its receipt links only (PRD-BKG-006). */
export async function deliveredOf(context: TransactionContext, bookingId: string): Promise<Map<string, number>> {
  return (await deliveredOfBookings(context, [bookingId])).get(bookingId) ?? new Map();
}

/** The pieces cancelled of each line of each booking given, by key, by its approved cancellations (PRD-BKG-005). */
export async function cancelledOfBookings(
  context: TransactionContext,
  bookingIds: readonly string[],
): Promise<Map<string, Map<string, number>>> {
  if (bookingIds.length === 0) return new Map();
  const rows = await context.tx
    .select({
      bookingId: bookingAmendment.bookingId,
      key: bookingAmendmentLine.bookingLineId,
      pieces: sql<string>`sum(${bookingAmendmentLine.quantity})::text`,
    })
    .from(bookingAmendmentLine)
    .innerJoin(bookingAmendment, eq(bookingAmendment.id, bookingAmendmentLine.bookingAmendmentId))
    .innerJoin(bookingAmendmentDecision, eq(bookingAmendmentDecision.bookingAmendmentId, bookingAmendment.id))
    .where(
      and(
        inArray(bookingAmendment.bookingId, [...new Set(bookingIds)]),
        eq(bookingAmendment.kind, 'cancellation'),
        eq(bookingAmendmentDecision.decision, 'Approved'),
      ),
    )
    .groupBy(bookingAmendment.bookingId, bookingAmendmentLine.bookingLineId);
  return byBookingAndKey(rows);
}

/** The pieces cancelled of each line of the booking by key, by its approved cancellations (PRD-BKG-005). */
export async function cancelledOf(context: TransactionContext, bookingId: string): Promise<Map<string, number>> {
  return (await cancelledOfBookings(context, [bookingId])).get(bookingId) ?? new Map();
}

/** The approved extensions of each version given, in the order decided (goods-in 3.5). */
export async function extensionsOfVersions(
  context: TransactionContext,
  versionIds: readonly string[],
): Promise<Map<string, ApprovedExtension[]>> {
  if (versionIds.length === 0) return new Map();
  const rows = await context.tx
    .select({ amendment: bookingAmendment })
    .from(bookingAmendment)
    .innerJoin(bookingAmendmentDecision, eq(bookingAmendmentDecision.bookingAmendmentId, bookingAmendment.id))
    .where(
      and(
        inArray(bookingAmendment.bookingVersionId, [...new Set(versionIds)]),
        eq(bookingAmendment.kind, 'extension'),
        eq(bookingAmendmentDecision.decision, 'Approved'),
      ),
    )
    .orderBy(asc(bookingAmendmentDecision.decidedAt), asc(bookingAmendmentDecision.id));
  if (rows.length === 0) return new Map();
  const lines = await context.tx
    .select()
    .from(bookingAmendmentLine)
    .where(
      inArray(
        bookingAmendmentLine.bookingAmendmentId,
        rows.map((row) => row.amendment.id),
      ),
    );
  const answer = new Map<string, ApprovedExtension[]>();
  for (const { amendment } of rows) {
    // An extension always names the window's end, by its table's constraint (migration 0098): none is a defect.
    if (amendment.windowTo === null) throw new CommandDefect(`An extension names no window end: ${amendment.id}`);
    const dated = new Map<string, string>();
    for (const line of lines) {
      if (line.bookingAmendmentId === amendment.id && line.deliveryDate !== null) {
        dated.set(line.bookingLineId, line.deliveryDate);
      }
    }
    const extensions = answer.get(amendment.bookingVersionId) ?? [];
    extensions.push({ windowTo: amendment.windowTo, lines: dated });
    answer.set(amendment.bookingVersionId, extensions);
  }
  return answer;
}

/** The approved extensions of a version, in the order decided (goods-in 3.5). */
export async function extensionsOf(context: TransactionContext, versionId: string): Promise<ApprovedExtension[]> {
  return (await extensionsOfVersions(context, [versionId])).get(versionId) ?? [];
}

/** The lines of a version as the status reads them, by key (goods-in 3.10). */
export function statusLines(lines: readonly LineRow[]): StatusLine[] {
  return lines.map((line) => ({
    lineKey: lineKeyOf(line),
    lineNumber: line.lineNumber,
    styleCode: line.styleCode,
    colour: line.colour,
    size: line.size,
    quantity: line.quantity,
    indicativeCost: line.indicativeCostPaise,
    deliveryDate: line.deliveryDate,
  }));
}

/**
 * The booking status of the approved version in force on a business date (goods-in 3.6, 3.8, 9.3; PRD-BKG-005), or
 * undefined while the booking has no approved version.
 */
export async function statusOfBooking(
  context: TransactionContext,
  bookingId: string,
  today: string,
): Promise<BookingStatus | undefined> {
  const approval = await approvalInForce(context, bookingId);
  if (approval === undefined) return undefined;
  const [version] = await context.tx
    .select()
    .from(bookingVersion)
    .where(eq(bookingVersion.id, approval.bookingVersionId));
  if (version === undefined) return undefined;
  return statusOfVersion(context, version, today);
}

/** The booking status of one approved version (goods-in 3.6). */
export async function statusOfVersion(
  context: TransactionContext,
  version: VersionRow,
  today: string,
): Promise<BookingStatus> {
  const lines = await context.tx
    .select()
    .from(bookingLine)
    .where(eq(bookingLine.bookingVersionId, version.id))
    .orderBy(asc(bookingLine.lineNumber));
  return statusOf(
    {
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        windowFrom: version.windowFrom,
        windowTo: version.windowTo,
      },
      lines: statusLines(lines),
      delivered: await deliveredOf(context, version.bookingId),
      cancelled: await cancelledOf(context, version.bookingId),
      extensions: await extensionsOf(context, version.id),
    },
    today,
  );
}

/** What the booking reserves of each budget now: its reservations less its releases, where more than zero (3.3). */
export async function reservedByBudget(context: TransactionContext, bookingId: string): Promise<Map<string, Paise>> {
  const reserved = await context.tx
    .select({
      budgetId: openToBuyReservation.openToBuyBudgetId,
      amount: sql<string>`sum(${openToBuyReservation.amountPaise})::text`,
    })
    .from(openToBuyReservation)
    .where(eq(openToBuyReservation.bookingId, bookingId))
    .groupBy(openToBuyReservation.openToBuyBudgetId);
  const released = await context.tx
    .select({
      budgetId: openToBuyRelease.openToBuyBudgetId,
      amount: sql<string>`sum(${openToBuyRelease.amountPaise})::text`,
    })
    .from(openToBuyRelease)
    .where(eq(openToBuyRelease.bookingId, bookingId))
    .groupBy(openToBuyRelease.openToBuyBudgetId);
  const net = new Map<string, Paise>();
  for (const row of reserved) {
    const less = Number(released.find((each) => each.budgetId === row.budgetId)?.amount ?? '0');
    const amount = Number(row.amount) - less;
    if (amount > 0) net.set(row.budgetId, paise(amount));
  }
  return net;
}

/** The supplier's files attached to the booking, oldest first (goods-in 3.4, 3.5). */
export function supplierFilesOf(context: TransactionContext, bookingId: string) {
  return context.tx
    .select()
    .from(bookingSupplierFile)
    .where(eq(bookingSupplierFile.bookingId, bookingId))
    .orderBy(asc(bookingSupplierFile.recordedAt), asc(bookingSupplierFile.id));
}

/** The supplier's communication attached to a version of a change, as attachments (goods-in 3.5; POL-05.04). */
export async function communicationOfVersion(context: TransactionContext, versionId: string): Promise<string[]> {
  const rows = await context.tx
    .select({ attachmentId: bookingSupplierFile.attachmentId })
    .from(bookingSupplierFile)
    .where(and(eq(bookingSupplierFile.bookingVersionId, versionId), isNotNull(bookingSupplierFile.bookingVersionId)))
    .orderBy(asc(bookingSupplierFile.recordedAt), asc(bookingSupplierFile.id));
  return rows.map((row) => row.attachmentId);
}

/**
 * The oldest cancellation, or extension, of the booking still waiting for its decision, or undefined (goods-in 3.10). An
 * amendment and its decision are written under the booking's lock, so read under it this is stable (code-house-rules
 * 8.1).
 */
export async function pendingAmendmentOf(
  context: TransactionContext,
  bookingId: string,
  kind: AmendmentRow['kind'],
): Promise<AmendmentRow | undefined> {
  const [row] = await context.tx
    .select({ amendment: bookingAmendment })
    .from(bookingAmendment)
    .leftJoin(bookingAmendmentDecision, eq(bookingAmendmentDecision.bookingAmendmentId, bookingAmendment.id))
    .where(
      and(
        eq(bookingAmendment.bookingId, bookingId),
        eq(bookingAmendment.kind, kind),
        isNull(bookingAmendmentDecision.id),
      ),
    )
    .orderBy(asc(bookingAmendment.recordedAt), asc(bookingAmendment.id))
    .limit(1);
  return row?.amendment;
}

/** An amendment with its lines and its decision, or undefined (goods-in 3.5). */
export async function amendmentRow(context: TransactionContext, amendmentId: string) {
  const [amendment] = await context.tx.select().from(bookingAmendment).where(eq(bookingAmendment.id, amendmentId));
  if (amendment === undefined) return undefined;
  const lines = await context.tx
    .select()
    .from(bookingAmendmentLine)
    .where(eq(bookingAmendmentLine.bookingAmendmentId, amendmentId));
  const [decision] = await context.tx
    .select()
    .from(bookingAmendmentDecision)
    .where(eq(bookingAmendmentDecision.bookingAmendmentId, amendmentId));
  return { amendment, lines, decision };
}

/** The state an amendment shows (design-language 7): its decision, else its latest request's. */
function amendmentState(
  decision: 'Approved' | 'Rejected' | undefined,
  request: LatestRequest | undefined,
): BookingAmendment['state'] {
  if (decision !== undefined) return decision;
  return request?.state === 'Superseded' ? 'Superseded' : 'Awaiting approval';
}

/** The booking's cancellations and extensions, oldest first, as the booking shows them (goods-in 3.5). */
export async function amendmentsOf(
  context: TransactionContext,
  bookingId: string,
  requests: (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>,
): Promise<BookingAmendment[]> {
  const rows: AmendmentRow[] = await context.tx
    .select()
    .from(bookingAmendment)
    .where(eq(bookingAmendment.bookingId, bookingId))
    .orderBy(asc(bookingAmendment.recordedAt), asc(bookingAmendment.id));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const lines = await context.tx
    .select()
    .from(bookingAmendmentLine)
    .where(inArray(bookingAmendmentLine.bookingAmendmentId, ids));
  const decisions = await context.tx
    .select()
    .from(bookingAmendmentDecision)
    .where(inArray(bookingAmendmentDecision.bookingAmendmentId, ids));
  const files = await context.tx
    .select()
    .from(bookingSupplierFile)
    .where(inArray(bookingSupplierFile.bookingAmendmentId, ids));
  const latest = await requests(ids);
  return rows.map((row) => {
    const request = latest.get(row.id);
    return {
      id: row.id,
      kind: row.kind,
      state: amendmentState(decisions.find((each) => each.bookingAmendmentId === row.id)?.decision, request),
      versionId: row.bookingVersionId,
      ...(row.windowTo === null ? {} : { windowTo: row.windowTo }),
      lines: lines
        .filter((line) => line.bookingAmendmentId === row.id)
        .map((line) => ({
          lineKey: line.bookingLineId,
          ...(line.quantity === null ? {} : { quantity: line.quantity }),
          ...(line.deliveryDate === null ? {} : { deliveryDate: line.deliveryDate }),
        })),
      proposedBy: row.proposedByUserId,
      proposedAt: row.recordedAt.toISOString(),
      communicationAttachmentIds: files
        .filter((file) => file.bookingAmendmentId === row.id)
        .map((file) => file.attachmentId),
      ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
    };
  });
}
