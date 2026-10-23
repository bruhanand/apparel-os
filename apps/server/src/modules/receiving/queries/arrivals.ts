import {
  INBOX_PAGE_CAP,
  type Arrival,
  type Grn,
  type GrnLineBooking,
  type Inbox,
  type InboxEntry,
  type InboxQuery,
  type MissingItem,
} from '@apparel-os/schemas';
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { RecordFacts } from '../../access/index.js';
import type { GrnLineReceipt } from '../../booking/index.js';
import { siteExists, structureOn } from '../../organisation/index.js';
import type { GrnLineDamage } from '../../stock/documents/index.js';
import {
  arrival,
  arrivalInvoice,
  arrivalPhoto,
  grn,
  grnLine,
  grnLineBooking,
  heldLine,
  heldLineDecision,
} from '../db/schema.js';
import { currentLines, grnBlockers } from '../domain/lines.js';
import { grnLineViews, linesOfGrn, type Requests } from './held-lines.js';
import { setMarksOf } from './pt-mark.js';
import { scanInsOf } from './scan-in.js';
import { recountViewsOf } from './recounts.js';
import { arrivalRow, entriesByArrival, entriesOf, factsOf, newestChange, type ArrivalRow } from '../commands/common.js';
import { receivingMissing, type AvailabilityDependencies } from './availability.js';

// The Arrival as the Arrival and Count screens show it, and the Receive Goods inbox of a Site (goods-in 4.1 to 4.5,
// section 11; PRD-REC-001, PRD-REC-002, PRD-UXP-003; S2-F02-T02). Rows are read under row-level security, so a reader
// sees only the receipts their scope covers (code-house-rules 6.2; goods-in 12 test 20); the route authorises each.

const instant = (at: Date) => at.toISOString();

/**
 * Where each GRN line given stands in the bookings the reader may see, from `booking`: its receipt link and a proposal
 * of it still waiting (goods-in 3.7, 4.10).
 */
export type Receipts = (grnLineIds: readonly string[]) => Promise<ReadonlyMap<string, GrnLineReceipt>>;

/**
 * Each GRN line's place against bookings (goods-in 3.7, 4.10; S2-F02-T04): what its GRN's issue did with it, linked or
 * sent for review, kept by `receiving` where its Arrival named a booking; and its link now and a proposal waiting, as
 * far as the reader may see the bookings, from `booking`.
 */
async function bookingLinksOf(
  context: TransactionContext,
  grnId: string,
  lineIds: readonly string[],
  receipts: Receipts,
): Promise<GrnLineBooking[]> {
  const atIssue = await context.tx.select().from(grnLineBooking).where(eq(grnLineBooking.grnId, grnId));
  const now = await receipts(lineIds);
  return lineIds.map((grnLineId): GrnLineBooking => {
    const kept = atIssue.find((each) => each.grnLineId === grnLineId);
    let issued: GrnLineBooking['atIssue'] = null;
    if (kept !== undefined) {
      if (kept.outcome === 'linked') {
        if (kept.bookingLineKey === null)
          throw new CommandDefect(`A linked GRN line names no booking line: ${kept.id}`);
        issued = { outcome: 'linked', bookingId: kept.bookingId, lineKey: kept.bookingLineKey };
      } else {
        if (kept.reason === null) throw new CommandDefect(`A GRN line sent for review names no reason: ${kept.id}`);
        issued = { outcome: 'review', bookingId: kept.bookingId, reason: kept.reason, lineKey: kept.bookingLineKey };
      }
    }
    const current = now.get(grnLineId);
    return { grnLineId, atIssue: issued, link: current?.link ?? null, proposal: current?.proposal ?? null };
  });
}

/** The bookings a GRN's lines are linked to, each with its lines (goods-in 6.2; code review 7 of stage 2). */
export interface GrnBookingLinks {
  readonly bookingId: string;
  readonly lines: readonly {
    readonly grnLineId: string;
    readonly styleCode: string | null;
    readonly size: string | null;
    readonly lineKey: string;
  }[];
}

/**
 * The bookings a GRN's lines are linked to now, as far as the reader may see the bookings, from `booking`, each with
 * the GRN lines linked to it, in the GRN's order: what the PT review shows of the booking (goods-in 6.2). A line linked
 * to no booking, or to one the reader may not see, is left out.
 */
export async function grnBookingLinksOf(
  context: TransactionContext,
  grnId: string,
  receipts: Receipts,
): Promise<GrnBookingLinks[]> {
  const lines = await linesOfGrn(context, grnId);
  const now = await receipts(lines.map((line) => line.id));
  const byBooking = new Map<string, GrnBookingLinks['lines'][number][]>();
  for (const line of lines) {
    const link = now.get(line.id)?.link;
    if (link === null || link === undefined) continue;
    const linked = byBooking.get(link.bookingId) ?? [];
    linked.push({ grnLineId: line.id, styleCode: line.styleCode, size: line.sizeCode, lineKey: link.lineKey });
    byBooking.set(link.bookingId, linked);
  }
  return [...byBooking].map(([bookingId, linked]) => ({ bookingId, lines: linked }));
}

/** The GRN as printed: quantities and findings only, never a value (goods-in 4.5). */
async function grnView(
  context: TransactionContext,
  arrivalId: string,
  requests: Requests,
  receipts: Receipts,
): Promise<Grn | null> {
  const [row] = await context.tx.select().from(grn).where(eq(grn.arrivalId, arrivalId));
  if (row === undefined) return null;
  const lines = await linesOfGrn(context, row.id);
  // Its recounts, each a linked record of its own (goods-in 4.7, 4.11; S2-F02-T05).
  const recounted = await recountViewsOf(
    context,
    row.id,
    new Map(lines.map((line) => [line.id, line.lineNumber])),
    requests,
  );
  return {
    id: row.id,
    number: row.number,
    issuedAt: instant(row.issuedAt),
    businessDate: row.businessDate,
    enteredBy: row.issuedByUserId,
    countedBy: row.countedByUserIds,
    lines: await grnLineViews(context, lines, requests),
    bookingLinks: await bookingLinksOf(
      context,
      row.id,
      lines.map((line) => line.id),
      receipts,
    ),
    recounts: recounted.recounts,
    recountVersionToken: recounted.versionToken,
  };
}

/** The facts a route authorises an Arrival with, or undefined when the reader may not see it. */
export async function arrivalFacts(context: TransactionContext, arrivalId: string): Promise<RecordFacts | undefined> {
  const row = await arrivalRow(context, arrivalId);
  return row === undefined ? undefined : factsOf(row);
}

/**
 * One Arrival with its invoices, photos, count and GRN, and what blocks issuing its GRN while it is In progress: the
 * gate at its unit, an invoice, a line, or a line whose extra pieces are not recorded as received or not.
 */
export async function arrivalView(
  context: TransactionContext,
  dependencies: AvailabilityDependencies,
  row: ArrivalRow,
  today: string,
  requests: Requests,
  receipts: Receipts,
): Promise<Arrival> {
  const invoices = await context.tx
    .select()
    .from(arrivalInvoice)
    .where(eq(arrivalInvoice.arrivalId, row.id))
    .orderBy(asc(arrivalInvoice.recordedAt), asc(arrivalInvoice.id));
  const photos = await context.tx
    .select({ attachmentId: arrivalPhoto.attachmentId })
    .from(arrivalPhoto)
    .where(eq(arrivalPhoto.arrivalId, row.id))
    .orderBy(asc(arrivalPhoto.recordedAt), asc(arrivalPhoto.id));
  const lines = currentLines(await entriesOf(context, row.id));
  const issued = await grnView(context, row.id, requests, receipts);
  // Recording the Arrival records its first change in the same transaction (commands/arrival.ts).
  const newest = await newestChange(context, row.id);
  if (newest === undefined) throw new CommandDefect('An Arrival has no change recorded');
  const blocking: MissingItem[] = [];
  if (issued === null) {
    blocking.push(
      ...(await receivingMissing(
        context,
        dependencies,
        { siteId: row.siteId, businessUnitId: row.businessUnitId },
        today,
      )),
    );
    const blocked = grnBlockers(invoices.length, lines);
    if (blocked !== undefined) blocking.push(...blocked.missing);
  }
  return {
    id: row.id,
    state: issued === null ? 'In progress' : 'Issued',
    siteId: row.siteId,
    storeId: row.storeId,
    businessUnitId: row.businessUnitId,
    receivingLocationId: row.receivingLocationId,
    supplierPartyId: row.supplierPartyId,
    brandId: row.brandId,
    transporter: row.transporter,
    lorryReceipt: { number: row.lorryReceiptNumber, date: row.lorryReceiptDate },
    vehicleNumber: row.vehicleNumber,
    ewayBillNumber: row.ewayBillNumber,
    cartons: row.cartons,
    arrivedAt: instant(row.arrivedAt),
    bookingId: row.bookingId,
    recordedBy: row.recordedByUserId,
    recordedAt: instant(row.recordedAt),
    versionToken: newest.id,
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.invoiceNumber,
      date: invoice.invoiceDate,
      attachmentId: invoice.attachmentId,
      possibleDuplicateOf: invoice.possibleDuplicateArrivalIds,
      possibleDuplicateElsewhere: invoice.possibleDuplicateElsewhere,
      recordedBy: invoice.recordedByUserId,
      recordedAt: instant(invoice.recordedAt),
    })),
    photoAttachmentIds: photos.map((photo) => photo.attachmentId),
    lines: lines.map((line) => ({
      lineId: line.lineId,
      versionToken: line.entry.id,
      goods: line.entry.goods,
      styleCode: line.entry.styleCode,
      colour: line.entry.colour,
      description: line.entry.description,
      extra: line.entry.extra,
      damage: line.entry.damage,
      size: line.entry.size,
      skuId: line.entry.skuId,
      invoiceQuantity: line.entry.invoiceQuantity,
      countedQuantity: line.entry.countedQuantity,
      batch: line.entry.batch,
      countedBy: [...line.countedBy],
      savedAt: instant(line.entry.recordedAt),
    })),
    grn: issued,
    blocking,
    people: [],
  };
}

/** Every person an Arrival names: who recorded it and its invoices, who counted it and who entered its GRN. */
export function peopleOf(arrival: Arrival): string[] {
  const ids = new Set<string>([arrival.recordedBy, ...arrival.invoices.map((invoice) => invoice.recordedBy)]);
  for (const line of arrival.lines) for (const id of line.countedBy) ids.add(id);
  if (arrival.grn !== null) {
    ids.add(arrival.grn.enteredBy);
    for (const id of arrival.grn.countedBy) ids.add(id);
    // Who proposed and who decided each recount (goods-in 4.11).
    for (const recount of arrival.grn.recounts) {
      ids.add(recount.proposedBy);
      if (recount.decision !== null) ids.add(recount.decision.decidedBy);
    }
  }
  return [...ids];
}

/**
 * The most deliveries one request of the inbox reads to fill a page of its view, a technical cap (code-house-rules
 * 12.1; goods-in 7.5): a page may then hold fewer than asked, with its cursor where the next read starts. **Design
 * choice.**
 */
const INBOX_EXAMINED_CAP = 1_000;

/**
 * The Receive Goods inbox of a Site (goods-in 4.1), newest recorded first, a page at a time (code-house-rules 12.1);
 * undefined when no Site has the identifier. Pending holds the deliveries that wait for something: Arrivals not yet
 * issued as a GRN, GRNs with held lines or damage reported at the count not yet decided, GRNs waiting for their PT file,
 * GRNs whose PT file is submitted and waits for approval, marked "PT attached" (goods-in 4.8; the product owner, 22 Oct
 * 2026, RR-584), and GRNs whose PT is approved while a piece it covers waits for its scan-in (goods-in 7.1, 7.3;
 * RR-606); History holds the GRNs whose scan-in is complete (S2-F07-T01). Each unit of the Site in force today comes
 * with whether receiving is available there, naming what is missing, and its locations in force; `covered` answers,
 * for the facts of each Arrival, whether the reader may view it; `damage` where the damage reports on GRN lines stand.
 * A page is filled from at most INBOX_EXAMINED_CAP deliveries a request.
 */
export async function inboxOf(
  context: TransactionContext,
  dependencies: AvailabilityDependencies,
  siteId: string,
  query: InboxQuery,
  today: string,
  covered: (facts: readonly RecordFacts[]) => Promise<readonly boolean[]>,
  damage: (grnLineIds: readonly string[]) => Promise<readonly GrnLineDamage[]>,
): Promise<Omit<Inbox, 'asOf'> | undefined> {
  if (!(await siteExists(context, siteId))) return undefined;
  const structure = await structureOn(context, today);
  const units = [];
  for (const unit of structure.businessUnits.filter((each) => each.siteId === siteId)) {
    const missing = await receivingMissing(context, dependencies, { siteId, businessUnitId: unit.id }, today);
    units.push({
      businessUnitId: unit.id,
      code: unit.code,
      name: unit.name,
      receiving: { state: missing.length === 0 ? ('available' as const) : ('unavailable' as const), missing },
      locations: structure.locations
        .filter((each) => each.businessUnitId === unit.id && !each.retired)
        .map((each) => ({ id: each.id, code: each.code, name: each.name })),
    });
  }
  const limit = Math.min(Number(query.limit ?? INBOX_PAGE_CAP), INBOX_PAGE_CAP);
  const listed: InboxEntry[] = [];
  let after = query.after;
  let examined = 0;
  let next: string | null = null;
  // Deliveries are read newest first, a batch at a time, until one more of the view than the page holds is found,
  // none is left or the cap is reached; the next page starts after the page's last, or after the last one read.
  for (;;) {
    const batch = await context.tx
      .select()
      .from(arrival)
      .where(and(eq(arrival.siteId, siteId), after === undefined ? undefined : lt(arrival.id, after)))
      .orderBy(desc(arrival.id))
      .limit(limit + 1);
    const entries = await inboxEntriesOf(context, batch, covered, damage);
    const inView = entries.filter(
      (entry): entry is InboxEntry => entry !== undefined && (entry.waitingFor === null) === (query.view === 'history'),
    );
    if (listed.length + inView.length > limit) {
      listed.push(...inView.slice(0, limit - listed.length));
      next = listed.at(-1)?.arrivalId ?? null;
      break;
    }
    listed.push(...inView);
    examined += batch.length;
    const last = batch.at(-1)?.id;
    if (batch.length <= limit || last === undefined) break;
    after = last;
    if (examined >= INBOX_EXAMINED_CAP) {
      next = last;
      break;
    }
  }
  return { siteId, view: query.view, units, entries: listed, next };
}

/**
 * Each delivery given as the inbox lists it, with what it waits for next (goods-in 4.1), or undefined where the reader
 * may not view it: its invoice, its count, its GRN, the decisions of its held lines and damage reported at the count,
 * its PT file, its PT's approval, its scan-in, or nothing once the scan-in is complete.
 */
async function inboxEntriesOf(
  context: TransactionContext,
  rows: readonly ArrivalRow[],
  covered: (facts: readonly RecordFacts[]) => Promise<readonly boolean[]>,
  damage: (grnLineIds: readonly string[]) => Promise<readonly GrnLineDamage[]>,
): Promise<(InboxEntry | undefined)[]> {
  const allowed = await covered(rows.map((row) => factsOf(row)));
  const shown = rows.filter((_row, index) => allowed[index] === true);
  const ids = shown.map((row) => row.id);
  const invoices =
    ids.length === 0
      ? []
      : await context.tx
          .select({ arrivalId: arrivalInvoice.arrivalId, number: arrivalInvoice.invoiceNumber })
          .from(arrivalInvoice)
          .where(inArray(arrivalInvoice.arrivalId, ids))
          .orderBy(asc(arrivalInvoice.recordedAt), asc(arrivalInvoice.id));
  const entries = await entriesByArrival(context, ids);
  const grns =
    ids.length === 0
      ? []
      : await context.tx
          .select({ id: grn.id, arrivalId: grn.arrivalId, number: grn.number, issuedAt: grn.issuedAt })
          .from(grn)
          .where(inArray(grn.arrivalId, ids));
  const waiting = await grnsWaiting(
    context,
    grns.map((each) => each.id),
    damage,
  );
  const marked = await setMarksOf(
    context,
    grns.map((each) => each.id),
  );
  const scanIns = await scanInsOf(
    context,
    grns.flatMap((each) => {
      const row = shown.find((one) => one.id === each.arrivalId);
      return row === undefined ? [] : [{ grnId: each.id, receivingLocationId: row.receivingLocationId }];
    }),
  );
  return rows.map((row, index): InboxEntry | undefined => {
    if (allowed[index] !== true) return undefined;
    const numbers = invoices.filter((each) => each.arrivalId === row.id).map((each) => each.number);
    const lines = currentLines(entries.get(row.id) ?? []);
    const issued = grns.find((each) => each.arrivalId === row.id);
    let waitingFor: InboxEntry['waitingFor'];
    if (issued === undefined) waitingFor = numbers.length === 0 ? 'invoice' : lines.length === 0 ? 'count' : 'grn';
    else if (waiting.has(issued.id)) waitingFor = 'held-lines';
    else if (!marked.has(issued.id)) waitingFor = 'pt';
    else {
      const scanIn = scanIns.get(issued.id);
      waitingFor = scanIn === undefined ? 'pt-approval' : scanIn === 'scanning' ? 'scan-in' : null;
    }
    return {
      arrivalId: row.id,
      state: issued === undefined ? 'In progress' : 'Issued',
      businessUnitId: row.businessUnitId,
      supplierPartyId: row.supplierPartyId,
      brandId: row.brandId,
      arrivedAt: instant(row.arrivedAt),
      invoiceNumbers: numbers,
      lines: lines.length,
      countedPieces: lines.reduce((sum, line) => sum + line.entry.countedQuantity, 0),
      grn: issued === undefined ? null : { id: issued.id, number: issued.number, issuedAt: instant(issued.issuedAt) },
      waitingFor,
    };
  });
}

/**
 * The GRNs of those given with a held line or a damage report on a line still waiting for its decision (goods-in 4.1,
 * 4.6): their PT waits for those decisions (5.1).
 */
async function grnsWaiting(
  context: TransactionContext,
  grnIds: readonly string[],
  damage: (grnLineIds: readonly string[]) => Promise<readonly GrnLineDamage[]>,
): Promise<ReadonlySet<string>> {
  const waiting = new Set<string>();
  if (grnIds.length === 0) return waiting;
  const held = await context.tx
    .select({ grnId: heldLine.grnId, decided: heldLineDecision.id })
    .from(heldLine)
    .leftJoin(heldLineDecision, eq(heldLineDecision.heldLineId, heldLine.id))
    .where(inArray(heldLine.grnId, [...grnIds]));
  for (const row of held) if (row.decided === null) waiting.add(row.grnId);
  const lines = await context.tx
    .select({ id: grnLine.id, grnId: grnLine.grnId })
    .from(grnLine)
    .where(inArray(grnLine.grnId, [...grnIds]));
  for (const report of await damage(lines.map((line) => line.id))) {
    if (report.state !== 'Submitted') continue;
    const line = lines.find((each) => each.id === report.grnLineId);
    if (line !== undefined) waiting.add(line.grnId);
  }
  return waiting;
}
