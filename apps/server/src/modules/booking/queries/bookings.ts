import { paise } from '@apparel-os/domain';
import {
  bookingTotals,
  type Booking,
  type BookingPageQuery,
  type BookingSummary,
  type BookingTerms,
  type BookingVersion,
} from '@apparel-os/schemas';
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { CommandDefect, LOCK_STEP, lockTable, type TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface, LatestRequest } from '../../access/index.js';
import { termsInForce, termsOfVersion } from '../../merchandise/parties/index.js';
import {
  booking,
  bookingApproval,
  bookingChange,
  bookingDocument,
  bookingLine,
  bookingNumber,
  bookingVersion,
} from '../db/schema.js';
import { stateOf } from '../domain/bookings.js';
import { budgetOf, remainingOf } from './budgets.js';

// The reads of bookings (goods-in 3.1 to 3.4, section 11; PRD-BKG-001 to PRD-BKG-003; S2-F01-T03): a booking with its
// newest version, its lines and totals, its documents, the brand's Agreement terms read-only, the remaining open-to-buy
// of its brand and season, and its approval; a page of bookings by state, brand, season, supplier and destination.
// Every row is scoped (code-house-rules 6.2), so a reader never reads a booking outside their scope.

export type BookingRow = typeof booking.$inferSelect;
export type VersionRow = typeof bookingVersion.$inferSelect;
export type LineRow = typeof bookingLine.$inferSelect;
export type ChangeRow = typeof bookingChange.$inferSelect;
type ApprovalRow = typeof bookingApproval.$inferSelect;

/** The Agreement reads hide margins: a booking never shows them (goods-in 3.2). */
const SHOW_MARGINS = false;

/** A booking's identity row as the actor may see it, or undefined. */
export async function bookingRow(context: TransactionContext, bookingId: string): Promise<BookingRow | undefined> {
  const [row] = await context.tx.select().from(booking).where(eq(booking.id, bookingId));
  return row;
}

/** The booking's identity row, which every change and decision of it locks exclusively at step 1 (8.2). */
export const bookingLock = (bookingId: string) =>
  ({ table: lockTable('booking', 'booking'), id: bookingId, mode: 'exclusive' }) as const;

/**
 * Locks a booking's identity row exclusively at step 1, the document step (code-house-rules 8.2), and reads it under
 * the lock; undefined when it does not exist or the actor may not see it.
 */
export async function lockBooking(context: TransactionContext, bookingId: string): Promise<BookingRow | undefined> {
  const locked = await context.lock(LOCK_STEP.document, [bookingLock(bookingId)]);
  if (locked.missing.some((each) => each.id === bookingId)) return undefined;
  return bookingRow(context, bookingId);
}

/** Every change of a booking, in the order made. */
export function changesOf(context: TransactionContext, bookingId: string): Promise<ChangeRow[]> {
  return context.tx
    .select()
    .from(bookingChange)
    .where(eq(bookingChange.bookingId, bookingId))
    .orderBy(asc(bookingChange.changeNumber));
}

/** A version with its lines, in line order; undefined when none has that identifier. */
export async function versionWithLines(
  context: TransactionContext,
  versionId: string,
): Promise<{ readonly version: VersionRow; readonly lines: LineRow[] } | undefined> {
  const [version] = await context.tx.select().from(bookingVersion).where(eq(bookingVersion.id, versionId));
  if (version === undefined) return undefined;
  const lines = await context.tx
    .select()
    .from(bookingLine)
    .where(eq(bookingLine.bookingVersionId, versionId))
    .orderBy(asc(bookingLine.lineNumber));
  return { version, lines };
}

/** A booking's versions, oldest first. */
export function versionsOf(context: TransactionContext, bookingId: string): Promise<VersionRow[]> {
  return context.tx
    .select()
    .from(bookingVersion)
    .where(eq(bookingVersion.bookingId, bookingId))
    .orderBy(asc(bookingVersion.versionNumber));
}

/** The booking documents attached, in the order attached. */
export function documentsOf(context: TransactionContext, bookingId: string) {
  return context.tx
    .select()
    .from(bookingDocument)
    .where(eq(bookingDocument.bookingId, bookingId))
    .orderBy(asc(bookingDocument.recordedAt), asc(bookingDocument.id));
}

/** The booking's number, once its first approval gave it. */
export async function numberOf(context: TransactionContext, bookingId: string): Promise<string | undefined> {
  const [row] = await context.tx
    .select({ number: bookingNumber.number })
    .from(bookingNumber)
    .where(eq(bookingNumber.bookingId, bookingId));
  return row?.number;
}

/** The newest approval of a booking, or undefined while none is approved. */
export async function latestApprovalOf(
  context: TransactionContext,
  bookingId: string,
): Promise<ApprovalRow | undefined> {
  const [row] = await context.tx
    .select()
    .from(bookingApproval)
    .where(eq(bookingApproval.bookingId, bookingId))
    .orderBy(desc(bookingApproval.recordedAt), desc(bookingApproval.id))
    .limit(1);
  return row;
}

/** A version's lines as the totals read them, in paise (PRD-MOD-014). */
export function pricedLines(lines: readonly LineRow[]) {
  return lines.map((line) => ({
    styleCode: line.styleCode,
    quantity: line.quantity,
    indicativeCost: line.indicativeCostPaise,
    mrp: line.mrpPaise,
  }));
}

function versionView(
  version: VersionRow,
  lines: readonly LineRow[],
  request: LatestRequest | undefined,
): BookingVersion {
  const totals = bookingTotals(pricedLines(lines));
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    supplierPartyId: version.supplierPartyId,
    season: {
      attributeId: version.seasonAttributeId,
      valueId: version.seasonValueId,
      markedAttributeVersionId: version.seasonMarkedAttributeVersionId,
    },
    deliveryWindow: { from: version.windowFrom, to: version.windowTo },
    lines: lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      styleCode: line.styleCode,
      colour: line.colour,
      size: line.size,
      quantity: line.quantity,
      indicativeCost: paise(line.indicativeCostPaise),
      mrp: paise(line.mrpPaise),
      deliveryDate: line.deliveryDate,
    })),
    totals: totals.booking,
    styles: totals.styles,
    savedBy: version.savedByUserId,
    savedAt: version.recordedAt.toISOString(),
    ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
  };
}

/**
 * The brand's Agreement terms as the booking shows them (goods-in 3.2): once approved, the version its approval fixed;
 * otherwise the version in force today, or none (DEC-132).
 */
async function termsOf(
  context: TransactionContext,
  brandId: string,
  approval: ApprovalRow | undefined,
  today: string,
): Promise<BookingTerms> {
  const shown = (read: NonNullable<Awaited<ReturnType<typeof termsInForce>>>) => ({
    agreementId: read.agreementId,
    code: read.code,
    versionId: read.versionId,
    validFrom: read.validFrom,
    ...(read.validTo === undefined ? {} : { validTo: read.validTo }),
    terms: read.terms,
  });
  if (approval !== undefined) {
    const fixed = await termsOfVersion(context, approval.agreementVersionId, SHOW_MARGINS);
    // An approval fixes an approved version, and none is ever deleted (PRD-MOD-011): one not found is a defect.
    if (fixed === undefined)
      throw new CommandDefect(`A booking's fixed Agreement version is not found: ${approval.id}`);
    return { kind: 'fixed', ...shown(fixed) };
  }
  const inForce = await termsInForce(context, { brandId }, today, SHOW_MARGINS);
  return inForce === undefined ? { kind: 'none' } : { kind: 'in-force', ...shown(inForce) };
}

/**
 * One booking as the reader sees it (goods-in 3.1 to 3.4, section 11): its newest version with lines and totals, every
 * version with its latest request, its documents, the terms, the remaining open-to-buy now and its approval.
 */
export async function bookingView(
  context: TransactionContext,
  dependencies: { readonly access: Pick<AccessInterface, 'approvalRequestsOf'> },
  row: BookingRow,
  today: string,
): Promise<Booking | undefined> {
  const changes = await changesOf(context, row.id);
  const newestChange = changes.at(-1);
  const versions = await versionsOf(context, row.id);
  const newest = versions.at(-1);
  if (newestChange === undefined || newest === undefined) return undefined;
  const { lines } = (await versionWithLines(context, newest.id)) ?? { lines: [] };
  const requests = await dependencies.access.approvalRequestsOf(
    context,
    versions.map((version) => version.id),
  );
  const approval = await latestApprovalOf(context, row.id);
  const number = await numberOf(context, row.id);
  const budget = await budgetOf(context, row.brandId, newest.seasonValueId);
  const documents = await documentsOf(context, row.id);
  return {
    id: row.id,
    ...(number === undefined ? {} : { number }),
    state: stateOf(newestChange.change),
    brandId: row.brandId,
    destinationSiteId: row.siteId,
    versionToken: newestChange.id,
    version: versionView(newest, lines, requests.get(newest.id)),
    versions: versions.map((version) => {
      const request = requests.get(version.id);
      return {
        id: version.id,
        versionNumber: version.versionNumber,
        savedBy: version.savedByUserId,
        savedAt: version.recordedAt.toISOString(),
        ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
      };
    }),
    documents: documents.map((document) => ({
      attachmentId: document.attachmentId,
      storedFileId: document.storedFileId,
      attachedBy: document.attachedByUserId,
      attachedAt: document.recordedAt.toISOString(),
    })),
    terms: await termsOf(context, row.brandId, approval, today),
    openToBuy: budget === undefined ? { kind: 'not-approved' } : await remainingOf(context, budget, context.startedAt),
    ...(approval === undefined
      ? {}
      : {
          approval: {
            versionId: approval.bookingVersionId,
            agreementVersionId: approval.agreementVersionId,
            reserved: paise(approval.valuePaise),
            approvedBy: approval.approvedByUserId,
            approvedAt: approval.approvedAt.toISOString(),
          },
        }),
  };
}

/** The state of a booking's newest change, as SQL, for the list's filter (goods-in section 11). */
const newestChangeKind = sql<string>`(select c.change from booking.booking_change c
  where c.booking_id = ${booking.id} order by c.change_number desc limit 1)`;

/** The change kinds of each state (stateOf). */
const CHANGES_OF_STATE: Readonly<Record<BookingSummary['state'], readonly string[]>> = {
  Draft: ['draft', 'documents', 'rejection'],
  'Awaiting approval': ['submission'],
  Approved: ['approval'],
};

/**
 * A page of the bookings the reader may see, newest first by identifier (code-house-rules 12.1 "Reads"), filtered by
 * state, brand, season, supplier and destination, each with its newest version's header and totals; the cursor, the
 * last booking read, while more follow. A cursor naming no booking reads none.
 */
export async function bookingPage(
  context: TransactionContext,
  query: BookingPageQuery,
  limit: number,
): Promise<{ readonly bookings: BookingSummary[]; readonly next: string | null }> {
  if (query.after !== undefined && (await bookingRow(context, query.after)) === undefined) {
    return { bookings: [], next: null };
  }
  const newestVersion = sql`(select v.id from booking.booking_version v
    where v.booking_id = ${booking.id} order by v.version_number desc limit 1)`;
  const conditions: (SQL | undefined)[] = [
    query.after === undefined ? undefined : sql`${booking.id} < ${query.after}::uuid`,
    query.brandId === undefined ? undefined : eq(booking.brandId, query.brandId),
    query.siteId === undefined ? undefined : eq(booking.siteId, query.siteId),
    query.state === undefined
      ? undefined
      : sql`${newestChangeKind} in (${sql.join(
          CHANGES_OF_STATE[query.state].map((kind) => sql`${kind}`),
          sql`, `,
        )})`,
    query.supplierPartyId === undefined ? undefined : eq(bookingVersion.supplierPartyId, query.supplierPartyId),
    query.seasonValueId === undefined ? undefined : eq(bookingVersion.seasonValueId, query.seasonValueId),
  ];
  const rows = await context.tx
    .select({ booking, version: bookingVersion, newestChange: newestChangeKind })
    .from(booking)
    .innerJoin(bookingVersion, sql`${bookingVersion.id} = ${newestVersion}`)
    .where(and(...conditions))
    .orderBy(desc(booking.id))
    .limit(limit + 1);
  const read = rows.slice(0, limit);
  const versionIds = read.map((row) => row.version.id);
  const lines =
    versionIds.length === 0
      ? []
      : await context.tx.select().from(bookingLine).where(inArray(bookingLine.bookingVersionId, versionIds));
  const numbers =
    read.length === 0
      ? []
      : await context.tx
          .select({ bookingId: bookingNumber.bookingId, number: bookingNumber.number })
          .from(bookingNumber)
          .where(
            inArray(
              bookingNumber.bookingId,
              read.map((row) => row.booking.id),
            ),
          );
  const bookings = read.map(({ booking: row, version, newestChange }): BookingSummary => {
    const number = numbers.find((each) => each.bookingId === row.id)?.number;
    return {
      id: row.id,
      ...(number === undefined ? {} : { number }),
      state: stateOf(newestChange as ChangeRow['change']),
      brandId: row.brandId,
      destinationSiteId: row.siteId,
      supplierPartyId: version.supplierPartyId,
      seasonValueId: version.seasonValueId,
      deliveryWindow: { from: version.windowFrom, to: version.windowTo },
      totals: bookingTotals(pricedLines(lines.filter((line) => line.bookingVersionId === version.id))).booking,
      savedAt: version.recordedAt.toISOString(),
    };
  });
  return { bookings, next: rows.length > limit ? (read.at(-1)?.booking.id ?? null) : null };
}
