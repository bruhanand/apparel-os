import { and, asc, eq, gt, inArray, type SQL } from 'drizzle-orm';
import {
  declareReadModel,
  serveReadModel,
  type ServedReadModel,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import type { SourceRecord } from '../../stock/ledger/index.js';
import { arrival, grn, grnLine, recount, scan } from '../db/schema.js';
import { GRN_SOURCE_TYPE, RECEIVING_MODULE, RECOUNT_SOURCE_TYPE, SCAN_SOURCE_TYPE } from '../domain/kinds.js';
import { receiptProblems, type ReceiptProblem, type ReceiptProblemsQuery } from './held-lines.js';
import { recountedCounts } from './recounts.js';

// `receiving`'s read models of the stage 2 reports (goods-in 4.9, 9.3, 9.5; module-map section 3 rule 5; S2-F11-T02),
// served through the kernel's read-model gateway, each read in the reader's transaction under the reader's actor, so
// row-level security keeps out the GRNs the reader may not see (code-house-rules 6.2): the receipt problems read model
// (4.9); the GRN lines of a supplier and brand with their arrival date, their count now and the count's damage report,
// by its identifier, for the supplier report; and the GRNs by their numbers and Arrivals, for the reports' drill-down.

/** One GRN line as the supplier report reads it (goods-in 9.3 "Supplier fill rate and timeliness", 9.5). */
export interface ReportGrnLine {
  readonly grnLineId: string;
  readonly grnId: string;
  readonly grnNumber: string;
  readonly arrivalId: string;
  /** The business date of the Arrival's arrival time (goods-in 4.8): when the goods arrived. */
  readonly arrivalDate: string;
  readonly siteId: string;
  readonly storeId: string | null;
  readonly businessUnitId: string;
  readonly legalEntityId: string;
  readonly brandId: string;
  readonly supplierPartyId: string;
  /** The pieces counted on the line now: its latest approved recount's count, or the GRN's own (goods-in 4.11). */
  readonly counted: number;
  /**
   * The damage report the count raised on the line, by its identifier, which `receiving` keeps; none when the count
   * found none. Its pieces and state are `stock` · documents', which the reader reads under their own authority
   * (code-house-rules 6.2; DEC-117; code review 9 of stage 2).
   */
  readonly countDamageReportId: string | null;
}

export interface ReportGrnLinesQuery {
  readonly supplierPartyId?: string;
  readonly brandId?: string;
  /** The last GRN line of the page before. */
  readonly after?: string;
  /** The most lines the page holds; the caller caps it. */
  readonly limit: number;
}

/** A page of the GRN lines the reader may see, of the supplier and brand given, oldest first by identifier. */
export async function reportGrnLines(
  context: TransactionContext,
  query: ReportGrnLinesQuery,
): Promise<{ readonly lines: readonly ReportGrnLine[]; readonly next: string | null }> {
  const filters: (SQL | undefined)[] = [
    query.supplierPartyId === undefined ? undefined : eq(arrival.supplierPartyId, query.supplierPartyId),
    query.brandId === undefined ? undefined : eq(grn.brandId, query.brandId),
    query.after === undefined ? undefined : gt(grnLine.id, query.after),
  ];
  const page = await context.tx
    .select({ line: grnLine, grn, arrivalDate: arrival.arrivalDate, supplierPartyId: arrival.supplierPartyId })
    .from(grnLine)
    .innerJoin(grn, eq(grn.id, grnLine.grnId))
    .innerJoin(arrival, eq(arrival.id, grn.arrivalId))
    .where(and(...filters))
    .orderBy(asc(grnLine.id))
    .limit(query.limit + 1);
  const read = page.slice(0, query.limit);
  const lineIds = read.map((row) => row.line.id);
  const counts = await recountedCounts(context, lineIds);
  const lines = read.map(({ line, grn: issued, arrivalDate, supplierPartyId }): ReportGrnLine => {
    return {
      grnLineId: line.id,
      grnId: issued.id,
      grnNumber: issued.number,
      arrivalId: issued.arrivalId,
      arrivalDate,
      siteId: issued.siteId,
      storeId: issued.storeId,
      businessUnitId: issued.businessUnitId,
      legalEntityId: issued.legalEntityId,
      brandId: issued.brandId,
      supplierPartyId,
      counted: counts.get(line.id) ?? line.countedQuantity,
      countDamageReportId: line.damageReportId,
    };
  });
  return { lines, next: page.length > query.limit ? (read.at(-1)?.line.id ?? null) : null };
}

export interface GrnNamesQuery {
  readonly grnIds: readonly string[];
  /**
   * Sources the ledger's receipt origins and movements name; those of `receiving`, a GRN, a recount or a scan, are
   * answered by their GRN.
   */
  readonly sources: readonly SourceRecord[];
}

export interface GrnNamesAnswer {
  readonly grns: readonly {
    readonly grnId: string;
    readonly number: string;
    readonly arrivalId: string;
    readonly siteId: string;
    readonly businessUnitId: string;
    readonly receivingLocationId: string;
  }[];
  readonly sources: readonly (SourceRecord & { readonly grnId: string })[];
}

/**
 * The GRNs given, and those the sources name, each with its number, the Arrival it was issued from and where it was
 * received, its Site, business unit and receiving location, as the reader may see them: the drill-down from a report's figure to its GRN (goods-in 9.1; PRD-EXC-011). A source of
 * another module, or one the reader may not see, is not answered.
 */
export async function grnNames(context: TransactionContext, query: GrnNamesQuery): Promise<GrnNamesAnswer> {
  const ours = query.sources.filter((each) => each.module === RECEIVING_MODULE);
  const recountIds = ours.filter((each) => each.recordType === RECOUNT_SOURCE_TYPE).map((each) => each.recordId);
  const recounts =
    recountIds.length === 0
      ? []
      : await context.tx
          .select({ id: recount.id, grnId: recount.grnId })
          .from(recount)
          .where(inArray(recount.id, [...new Set(recountIds)]));
  const scanIds = ours.filter((each) => each.recordType === SCAN_SOURCE_TYPE).map((each) => each.recordId);
  const scans =
    scanIds.length === 0
      ? []
      : await context.tx
          .select({ id: scan.id, grnId: scan.grnId })
          .from(scan)
          .where(inArray(scan.id, [...new Set(scanIds)]));
  const sourceGrn = (source: SourceRecord): string | undefined => {
    if (source.recordType === GRN_SOURCE_TYPE) return source.recordId;
    if (source.recordType === RECOUNT_SOURCE_TYPE) return recounts.find((each) => each.id === source.recordId)?.grnId;
    if (source.recordType === SCAN_SOURCE_TYPE) return scans.find((each) => each.id === source.recordId)?.grnId;
    return undefined;
  };
  const named = ours.flatMap((source) => {
    const grnId = sourceGrn(source);
    return grnId === undefined ? [] : [{ ...source, grnId }];
  });
  const grnIds = [...new Set([...query.grnIds, ...named.map((each) => each.grnId)])];
  const grns =
    grnIds.length === 0
      ? []
      : await context.tx
          .select({
            grnId: grn.id,
            number: grn.number,
            arrivalId: grn.arrivalId,
            siteId: grn.siteId,
            businessUnitId: grn.businessUnitId,
            receivingLocationId: arrival.receivingLocationId,
          })
          .from(grn)
          .innerJoin(arrival, eq(arrival.id, grn.arrivalId))
          .where(inArray(grn.id, grnIds))
          .orderBy(asc(grn.id));
  return { grns, sources: named.filter((each) => grns.some((found) => found.grnId === each.grnId)) };
}

/** `receiving`'s read models of the stage 2 reports, declared for the read-model gateway (module-map section 3, rule 5). */
export const RECEIVING_RECEIPT_PROBLEMS = declareReadModel<
  ReceiptProblemsQuery,
  { readonly rows: readonly ReceiptProblem[]; readonly next: string | null }
>('receiving.receipt-problems');
export const RECEIVING_REPORT_LINES = declareReadModel<ReportGrnLinesQuery, Awaited<ReturnType<typeof reportGrnLines>>>(
  'receiving.report-lines',
);
export const RECEIVING_GRN_NAMES = declareReadModel<GrnNamesQuery, GrnNamesAnswer>('receiving.grn-names');

/**
 * `receiving`'s read models as it serves them, handed to the gateway by the composition root, with the interfaces they
 * read through, reached when a read runs, never at start, since `access` is built after the gateway: for the latest
 * request of each held line's version (4.9).
 */
export function receivingReadModels(
  services: () => { readonly access: Pick<AccessInterface, 'approvalRequestsOf'> },
): ServedReadModel[] {
  return [
    serveReadModel(RECEIVING_RECEIPT_PROBLEMS, (context, query) =>
      receiptProblems(context, query, (versionIds) => services().access.approvalRequestsOf(context, versionIds)),
    ),
    serveReadModel(RECEIVING_REPORT_LINES, reportGrnLines),
    serveReadModel(RECEIVING_GRN_NAMES, grnNames),
  ];
}
