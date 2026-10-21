import {
  INBOX_PAGE_CAP,
  type Arrival,
  type Grn,
  type Inbox,
  type InboxEntry,
  type InboxQuery,
  type MissingItem,
} from '@apparel-os/schemas';
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { RecordFacts } from '../../access/index.js';
import { siteExists, structureOn } from '../../organisation/index.js';
import { batchOf } from '../db/columns.js';
import { arrival, arrivalInvoice, arrivalPhoto, grn, grnLine } from '../db/schema.js';
import { currentLines, grnBlockers } from '../domain/lines.js';
import { arrivalRow, entriesByArrival, entriesOf, factsOf, newestChange, type ArrivalRow } from '../commands/common.js';
import { receivingMissing, type AvailabilityDependencies } from './availability.js';

// The Arrival as the Arrival and Count screens show it, and the Receive Goods inbox of a Site (goods-in 4.1 to 4.5,
// section 11; PRD-REC-001, PRD-REC-002, PRD-UXP-003; S2-F02-T02). Rows are read under row-level security, so a reader
// sees only the receipts their scope covers (code-house-rules 6.2; goods-in 12 test 20); the route authorises each.

const instant = (at: Date) => at.toISOString();

/** The GRN as printed: quantities only, never a value (goods-in 4.5). */
async function grnView(context: TransactionContext, arrivalId: string): Promise<Grn | null> {
  const [row] = await context.tx.select().from(grn).where(eq(grn.arrivalId, arrivalId));
  if (row === undefined) return null;
  const lines = await context.tx
    .select()
    .from(grnLine)
    .where(eq(grnLine.grnId, row.id))
    .orderBy(asc(grnLine.lineNumber));
  return {
    id: row.id,
    number: row.number,
    issuedAt: instant(row.issuedAt),
    businessDate: row.businessDate,
    enteredBy: row.issuedByUserId,
    countedBy: row.countedByUserIds,
    lines: lines.map((line) => ({
      lineNumber: line.lineNumber,
      styleCode: line.styleCode,
      colour: line.colour,
      size: line.sizeCode,
      skuId: line.skuId,
      invoiceQuantity: line.invoiceQuantity,
      countedQuantity: line.countedQuantity,
      batch: batchOf(line),
      countedBy: line.countedByUserIds,
    })),
  };
}

/** The facts a route authorises an Arrival with, or undefined when the reader may not see it. */
export async function arrivalFacts(context: TransactionContext, arrivalId: string): Promise<RecordFacts | undefined> {
  const row = await arrivalRow(context, arrivalId);
  return row === undefined ? undefined : factsOf(row);
}

/**
 * One Arrival with its invoices, photos, count and GRN, and what blocks issuing its GRN while it is In progress: the
 * gate at its unit, an invoice, a line, or a line whose counted quantity differs from its invoice quantity.
 */
export async function arrivalView(
  context: TransactionContext,
  dependencies: AvailabilityDependencies,
  row: ArrivalRow,
  today: string,
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
  const issued = await grnView(context, row.id);
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
      styleCode: line.entry.styleCode,
      colour: line.entry.colour,
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
  }
  return [...ids];
}

/**
 * The Receive Goods inbox of a Site (goods-in 4.1), newest recorded first, a page at a time (code-house-rules 12.1);
 * undefined when no Site has the identifier. Pending holds Arrivals not yet issued as a GRN and GRNs waiting for their
 * PT, which every GRN does until the PT upload is built (S2-F04-T02); History holds the rest, none yet. Each unit of
 * the Site in force today comes with whether receiving is available there, naming what is missing, and its locations
 * in force; `covered` answers, for the facts of each Arrival, whether the reader may view it.
 */
export async function inboxOf(
  context: TransactionContext,
  dependencies: AvailabilityDependencies,
  siteId: string,
  query: InboxQuery,
  today: string,
  covered: (facts: readonly RecordFacts[]) => Promise<readonly boolean[]>,
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
  // Every delivery waits for something until its PT and scan-in are built, so History holds none yet (4.1).
  const limit = Math.min(Number(query.limit ?? INBOX_PAGE_CAP), INBOX_PAGE_CAP);
  const page =
    query.view === 'history'
      ? []
      : await context.tx
          .select()
          .from(arrival)
          .where(and(eq(arrival.siteId, siteId), query.after === undefined ? undefined : lt(arrival.id, query.after)))
          .orderBy(desc(arrival.id))
          .limit(limit + 1);
  const rows = page.slice(0, limit);
  const next = page.length > limit ? (rows.at(-1)?.id ?? null) : null;
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
  const listed: InboxEntry[] = shown.map((row) => {
    const numbers = invoices.filter((each) => each.arrivalId === row.id).map((each) => each.number);
    const lines = currentLines(entries.get(row.id) ?? []);
    const issued = grns.find((each) => each.arrivalId === row.id);
    const waitingFor: InboxEntry['waitingFor'] =
      issued !== undefined ? 'pt' : numbers.length === 0 ? 'invoice' : lines.length === 0 ? 'count' : 'grn';
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
  return { siteId, view: query.view, units, entries: listed, next };
}
