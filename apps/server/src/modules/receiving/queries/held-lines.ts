import {
  HELD_LINE_TYPE,
  lineFindings,
  type GrnLine,
  type HeldLine,
  type HeldLineState,
  type NamedProduct,
} from '@apparel-os/schemas';
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, ne, or, type SQL } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { LatestRequest } from '../../access/index.js';
import type { ResolutionAnswer, ResolutionSubject } from '../../exceptions/index.js';
import type { GrnLineDamage } from '../../stock/documents/index.js';
import { originOfSourceLine } from '../../stock/ledger/index.js';
import { batchOf } from '../db/columns.js';
import { arrival, grn, grnLine, heldLine, heldLineDecision, heldLineVersion } from '../db/schema.js';
import { GRN_SOURCE_TYPE, RECEIVING_MODULE } from '../domain/kinds.js';
import { textKey } from '../domain/text.js';
import { countsNowOf, originsOfLine, pendingRecountOf, recountedCounts, recountsOfGrn } from './recounts.js';

// The held lines of a GRN as its readers see them, and what other modules read of them (goods-in 4.6, 4.9, 5.1, 5.4,
// 9.3; S2-F02-T03): each GRN line with its findings and its held part's state; the resolution check of the follow-ups
// the findings raise (access-and-approvals 12.3; PRD-EXC-002); what `merchandise` · PT reads of a GRN before its PT,
// whether every held line is decided and its good pieces per style and size; and the receipt problems read model of the
// stage 2 report. Read under the reader's actor, so row-level security keeps out what the reader may not see
// (code-house-rules 6.2), except where a narrowly authorised read says otherwise.

type GrnLineRow = typeof grnLine.$inferSelect;
type HeldLineRow = typeof heldLine.$inferSelect;
type VersionRow = typeof heldLineVersion.$inferSelect;
type DecisionRow = typeof heldLineDecision.$inferSelect;

const instant = (at: Date) => at.toISOString();

/** The latest approval request of each version named, from `access`, where the reader may see it (9.1, 9.6). */
export type Requests = (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>;

/** A GRN line's findings, from what it froze of its count line (goods-in 4.4). */
function findingsOf(line: GrnLineRow) {
  return lineFindings({ ...line, damagedQuantity: line.damagedQuantity });
}

/** The held lines of the GRN lines given, each with its versions, oldest first, and its decision once made. */
async function heldLinesOf(
  context: TransactionContext,
  lineIds: readonly string[],
): Promise<Map<string, { row: HeldLineRow; versions: VersionRow[]; decision: DecisionRow | undefined }>> {
  const held = new Map<string, { row: HeldLineRow; versions: VersionRow[]; decision: DecisionRow | undefined }>();
  if (lineIds.length === 0) return held;
  const rows = await context.tx
    .select()
    .from(heldLine)
    .where(inArray(heldLine.grnLineId, [...lineIds]));
  if (rows.length === 0) return held;
  const ids = rows.map((row) => row.id);
  const versions = await context.tx
    .select()
    .from(heldLineVersion)
    .where(inArray(heldLineVersion.heldLineId, ids))
    .orderBy(asc(heldLineVersion.versionNumber));
  const decisions = await context.tx.select().from(heldLineDecision).where(inArray(heldLineDecision.heldLineId, ids));
  for (const row of rows) {
    held.set(row.grnLineId, {
      row,
      versions: versions.filter((each) => each.heldLineId === row.id),
      decision: decisions.find((each) => each.heldLineId === row.id),
    });
  }
  return held;
}

/** The product a version names, or none (goods-in 4.6). */
function namedOf(version: VersionRow | undefined): NamedProduct | null {
  if (version?.kind !== 'named' || version.namedStyleCode === null) return null;
  const size =
    version.namedSizeAttributeId === null ||
    version.namedSizeValueId === null ||
    version.namedSizeCode === null ||
    version.namedSizeMarkedAttributeVersionId === null
      ? null
      : {
          attributeId: version.namedSizeAttributeId,
          valueId: version.namedSizeValueId,
          markedAttributeVersionId: version.namedSizeMarkedAttributeVersionId,
          code: version.namedSizeCode,
        };
  return { styleCode: version.namedStyleCode, colour: version.namedColour, size, skuId: version.namedSkuId };
}

/**
 * The product Booking named for the unidentified goods of each GRN line given that has one, by GRN line (goods-in 4.6):
 * the goods a later booking link matches them as (3.7, 4.10).
 */
export async function namedProductsOf(
  context: TransactionContext,
  grnLineIds: readonly string[],
): Promise<ReadonlyMap<string, NamedProduct>> {
  const named = new Map<string, NamedProduct>();
  for (const [grnLineId, held] of await heldLinesOf(context, grnLineIds)) {
    const product = namedOf(held.versions.filter((each) => each.kind === 'named').at(-1));
    if (product !== null) named.set(grnLineId, product);
  }
  return named;
}

/** A held line's state (design-language 7): Awaiting approval, then Accepted when taken in or Held when left held. */
function stateOf(decision: DecisionRow | undefined): HeldLineState {
  if (decision === undefined) return 'Awaiting approval';
  return decision.outcome === 'taken-in' ? 'Accepted' : 'Held';
}

/** The GRN lines given, as their readers see them, with their findings, damage and held part (goods-in 4.4 to 4.6). */
export async function grnLineViews(
  context: TransactionContext,
  lines: readonly GrnLineRow[],
  requests: Requests,
): Promise<GrnLine[]> {
  const held = await heldLinesOf(
    context,
    lines.map((line) => line.id),
  );
  const latest = [...held.values()].flatMap((each) => {
    const version = each.versions.at(-1);
    return version === undefined ? [] : [version.id];
  });
  const latestRequests = await requests(latest);
  const recounted = await recountedCounts(
    context,
    lines.map((line) => line.id),
  );
  return lines.map((line) => {
    const findings = findingsOf(line);
    const countedNow = recounted.get(line.id);
    const recountedFindings = countedNow === undefined ? null : findingsOf({ ...line, countedQuantity: countedNow });
    const part = held.get(line.id);
    let heldView: HeldLine | null = null;
    if (part !== undefined) {
      const version = part.versions.at(-1);
      if (version === undefined) throw new CommandDefect(`Held line ${part.row.id} has no version`);
      const request = latestRequests.get(version.id);
      heldView = {
        id: part.row.id,
        kind: part.row.kind,
        quantity: part.row.quantity,
        state: stateOf(part.decision),
        versionToken: version.id,
        named: namedOf(part.versions.filter((each) => each.kind === 'named').at(-1)),
        requestId: request?.id ?? null,
        requestState: request?.state ?? null,
        decision:
          part.decision === undefined
            ? null
            : {
                outcome: part.decision.outcome,
                decidedBy: part.decision.decidedByUserId,
                decidedAt: instant(part.decision.decidedAt),
              },
      };
    }
    const damage =
      line.damagedQuantity === null || line.damageDescription === null || line.damageReportId === null
        ? null
        : { quantity: line.damagedQuantity, description: line.damageDescription, damageReportId: line.damageReportId };
    return {
      id: line.id,
      lineNumber: line.lineNumber,
      goods: line.goods,
      styleCode: line.styleCode,
      colour: line.colour,
      size: line.sizeCode,
      skuId: line.skuId,
      description: line.description,
      invoiceQuantity: line.invoiceQuantity,
      countedQuantity: line.countedQuantity,
      extra: line.extra,
      findings: {
        shortage: findings.shortage,
        extra: findings.extra,
        received: findings.received,
        damaged: findings.damaged,
      },
      damage,
      heldLine: heldView,
      batch: batchOf(line),
      countedBy: line.countedByUserIds,
      recounted:
        countedNow === undefined || recountedFindings === null
          ? null
          : {
              countedQuantity: countedNow,
              findings: {
                shortage: recountedFindings.shortage,
                extra: recountedFindings.extra,
                received: recountedFindings.received,
                damaged: recountedFindings.damaged,
              },
            },
    };
  });
}

/** The lines of a GRN, in their order. */
export function linesOfGrn(context: TransactionContext, grnId: string): Promise<GrnLineRow[]> {
  return context.tx.select().from(grnLine).where(eq(grnLine.grnId, grnId)).orderBy(asc(grnLine.lineNumber));
}

/** A held line with its GRN line and where it is, as its decision's panel shows it (goods-in 4.6, section 11). */
export async function heldLineView(context: TransactionContext, heldLineId: string, requests: Requests) {
  const [row] = await context.tx.select().from(heldLine).where(eq(heldLine.id, heldLineId));
  if (row === undefined) return undefined;
  const [found] = await context.tx
    .select({ line: grnLine, grnNumber: grn.number, arrival })
    .from(grnLine)
    .innerJoin(grn, eq(grn.id, grnLine.grnId))
    .innerJoin(arrival, eq(arrival.id, grn.arrivalId))
    .where(eq(grnLine.id, row.grnLineId));
  if (found === undefined) return undefined;
  const [line] = await grnLineViews(context, [found.line], requests);
  if (line === undefined) throw new CommandDefect(`Held line ${heldLineId} lost its GRN line`);
  return {
    arrivalId: found.arrival.id,
    grnNumber: found.grnNumber,
    supplierPartyId: found.arrival.supplierPartyId,
    brandId: found.arrival.brandId,
    businessUnitId: found.arrival.businessUnitId,
    line,
  };
}

/** The facts of a held line the reader may see, which its routes authorise with (5.3); else undefined. */
export async function heldLineFacts(context: TransactionContext, heldLineId: string) {
  const [row] = await context.tx.select().from(heldLine).where(eq(heldLine.id, heldLineId));
  if (row === undefined) return undefined;
  const { storeId, siteId, businessUnitId, legalEntityId, brandId } = row;
  return storeId === null
    ? { siteId, businessUnitId, legalEntityId, brandId }
    : { siteId, storeId, businessUnitId, legalEntityId, brandId };
}

/**
 * The resolution check of a follow-up of extra pieces (access-and-approvals 12.3; PRD-EXC-002: "verify the linked
 * business outcome before closure"; goods-in 4.9). A held line's is verified once Booking has taken its goods in;
 * goods left held stay held until their supplier return, which comes with stage 3, so their follow-up stays open, and
 * so does one Booking has not decided yet, naming the held line. Extra pieces a GRN records as not received, linked to
 * the GRN, are not at the Site and nothing in the app settles them before supplier returns and claims, so Booking
 * resolves that one when followed up, with its resolution and evidence, as a shortage's (**Design choice**, RR-579).
 */
export async function extraFollowedUp(
  context: TransactionContext,
  subject: ResolutionSubject,
): Promise<ResolutionAnswer> {
  const open = [];
  for (const link of subject.links) {
    if (link.recordType !== HELD_LINE_TYPE) continue;
    const [decided] = await context.tx
      .select({ outcome: heldLineDecision.outcome })
      .from(heldLineDecision)
      .where(eq(heldLineDecision.heldLineId, link.recordId));
    if (decided?.outcome !== 'taken-in') {
      open.push({ kind: 'record' as const, recordType: link.recordType, recordId: link.recordId });
    }
  }
  return open.length === 0 ? { kind: 'verified' } : { kind: 'not-verified', missing: open };
}

/**
 * The resolution check of a GRN's shortage follow-up (access-and-approvals 12.3): nothing in the app settles a
 * shortage before supplier invoices are matched (stage 5, DEC-137), so Booking resolves it when followed up, with its
 * resolution and evidence (PRD-EXC-002). Decided by the product owner, 22 Oct 2026, as built (RR-572; goods-in 4.9).
 */
export function shortageFollowedUp(): Promise<ResolutionAnswer> {
  return Promise.resolve({ kind: 'verified' });
}

/**
 * The resolution check of the follow-up of a GRN's lines sent to Booking for review, against a booking or received
 * without one (access-and-approvals 12.3; goods-in 3.7, 4.10; RR-580): Booking links a line later, has a late or excess
 * one approved into the booking, or finds it is no line of a booking, which no record says, so Booking resolves it when
 * followed up, with its resolution and evidence (PRD-EXC-002), as a shortage's. **Design choice**, for the product owner
 * (RR-581).
 */
export function reviewFollowedUp(): Promise<ResolutionAnswer> {
  return Promise.resolve({ kind: 'verified' });
}

/** One part of a style and size's good pieces: a GRN line's, with the receipt origin they are on (5.4). */
export interface GoodPiecesPart {
  readonly grnLineId: string;
  /** The origin the line's count made; Unknown (null) where the reader may not see the ledger's rows. */
  readonly receiptOriginId: string | null;
  /**
   * The product the line names: the SKU it was counted as, or for unidentified goods the one Booking named for them;
   * null for goods of a product not yet set up, or a product not named. PT approval's identity step gives such a line
   * its own product first (goods-in 6.3 step 4; stock-ledger 13.14; S2-F06-T01).
   */
  readonly skuId: string | null;
  readonly quantity: number;
  /**
   * The hold the PT route ends at PT approval, for goods Booking took in: an excess hold by `pt-route`, a quarantine by
   * `approved-decision` with the identity step (stock-ledger 6.1, 13.14; goods-in 4.6, 6.3 step 5).
   */
  readonly releases: readonly { readonly holdId: string; readonly event: 'pt-route' | 'approved-decision' }[];
}

/** What `merchandise` · PT reads of a GRN before its PT (goods-in 5.1, 5.4). */
export interface PtBasis {
  readonly grnId: string;
  /**
   * The held lines and the damage reports on the GRN's lines still waiting for their decision (5.1), and a recount of
   * it waiting for its decision, which may still change its pieces (goods-in 4.11; S2-F02-T05).
   */
  readonly undecided: readonly (
    | { readonly kind: 'held-line'; readonly heldLineId: string }
    | { readonly kind: 'damage-report'; readonly damageReportId: string }
    | { readonly kind: 'recount'; readonly recountId: string }
  )[];
  /**
   * The GRN's good pieces per style and size, compared ignoring case and spaces at the ends (5.4): those received,
   * less pieces under a confirmed damage report, less excess, wrong or unidentified pieces not taken in; unidentified
   * goods taken in under the style and size Booking named. Meaningful once nothing is undecided.
   */
  readonly goods: readonly {
    readonly styleCode: string;
    readonly size: string | null;
    readonly quantity: number;
    readonly parts: readonly GoodPiecesPart[];
  }[];
}

/**
 * Whether every held line of a GRN is decided, and its good pieces per style and size (goods-in 5.1, 5.4), read under
 * the reader's actor, the damage reports' states through the narrowly authorised read `damage` gives (DEC-117).
 * Undefined when the reader may not see the GRN.
 */
export async function ptBasisOf(
  context: TransactionContext,
  grnId: string,
  damage: (grnLineIds: readonly string[]) => Promise<readonly GrnLineDamage[]>,
): Promise<PtBasis | undefined> {
  const [issued] = await context.tx.select({ id: grn.id }).from(grn).where(eq(grn.id, grnId));
  if (issued === undefined) return undefined;
  const lines = await linesOfGrn(context, grnId);
  const held = await heldLinesOf(
    context,
    lines.map((line) => line.id),
  );
  const reports = await damage(lines.map((line) => line.id));
  const undecided: PtBasis['undecided'][number][] = [];
  for (const part of held.values()) {
    if (part.decision === undefined) undecided.push({ kind: 'held-line', heldLineId: part.row.id });
  }
  for (const report of reports) {
    if (report.state === 'Submitted') undecided.push({ kind: 'damage-report', damageReportId: report.damageReportId });
  }
  // A recount waiting for its decision may still change the GRN's pieces (goods-in 4.11).
  const recounts = await recountsOfGrn(context, grnId);
  const pending = pendingRecountOf(recounts);
  if (pending !== undefined) undecided.push({ kind: 'recount', recountId: pending.row.id });
  const countsNow = countsNowOf(recounts);
  const movements = recounts.flatMap((record) => record.movements);
  const groups = new Map<
    string,
    { styleCode: string; size: string | null; quantity: number; parts: GoodPiecesPart[] }
  >();
  for (const line of lines) {
    const countedNow = countsNow.get(line.id);
    // The pieces as the line's latest approved recount counts them, its findings worked out again (goods-in 4.11).
    const findings = findingsOf(countedNow === undefined ? line : { ...line, countedQuantity: countedNow });
    const part = held.get(line.id);
    const takenIn = part?.decision?.outcome === 'taken-in';
    const confirmed = reports
      .filter((each) => each.grnLineId === line.id && each.state === 'Confirmed')
      .reduce((sum, each) => sum + each.quantity, 0);
    const quantity = findings.received - (part !== undefined && !takenIn ? part.row.quantity : 0) - confirmed;
    if (quantity <= 0) continue;
    const named = namedOf(part?.versions.filter((each) => each.kind === 'named').at(-1));
    const styleCode = line.goods === 'unidentified' ? named?.styleCode : line.styleCode;
    const size = line.goods === 'unidentified' ? (named?.size?.code ?? null) : line.sizeCode;
    if (styleCode === undefined || styleCode === null) continue;
    const key = `${textKey(styleCode)}|${size === null ? '' : textKey(size)}`;
    const group = groups.get(key) ?? { styleCode, size, quantity: 0, parts: [] };
    group.quantity += quantity;
    const skuId = line.goods === 'unidentified' ? (named?.skuId ?? null) : line.skuId;
    if (movements.some((each) => each.grnLineId === line.id)) {
      // A recounted line's goods are on the GRN's origin and on each a recount found, each with the pieces it holds
      // still; the damage confirmed is on the GRN's (goods-in 4.9, 4.11). A recounted line has no held line.
      const origins = await originsOfLine(context, line.id, findingsOf(line).received, movements);
      for (const [at, origin] of origins.entries()) {
        const pieces = origin.pieces - (at === 0 && findingsOf(line).received > 0 ? confirmed : 0);
        if (pieces <= 0) continue;
        group.parts.push({
          grnLineId: line.id,
          receiptOriginId: origin.receiptOriginId,
          skuId,
          quantity: pieces,
          releases: [],
        });
      }
      groups.set(key, group);
      continue;
    }
    const origin =
      part?.row.receiptOriginId ??
      (await originOfSourceLine(context, { module: RECEIVING_MODULE, recordType: GRN_SOURCE_TYPE, lineId: line.id }))
        ?.receiptOriginId ??
      null;
    group.parts.push({
      grnLineId: line.id,
      receiptOriginId: origin,
      skuId,
      quantity,
      releases:
        part !== undefined && takenIn
          ? [{ holdId: part.row.holdId, event: part.row.kind === 'excess' ? 'pt-route' : 'approved-decision' }]
          : [],
    });
    groups.set(key, group);
  }
  return { grnId, undecided, goods: [...groups.values()] };
}

/** The most rows one page of the receipt problems read model holds, a technical cap (code-house-rules 12.1). */
export const RECEIPT_PROBLEMS_PAGE_CAP = 100;

/** A query of the receipt problems read model (goods-in 9.3): by Site, supplier, brand and dates, a page at a time. */
export interface ReceiptProblemsQuery {
  readonly siteId?: string;
  readonly supplierPartyId?: string;
  readonly brandId?: string;
  /** The first and last business dates of the GRNs, both included. */
  readonly from?: string;
  readonly to?: string;
  /** The last GRN line of the page before. */
  readonly after?: string;
  readonly limit?: number;
}

/** One GRN line with a finding, and each decision on it and who made it (goods-in 9.3 "Receipt problems"). */
export interface ReceiptProblem {
  readonly grnId: string;
  readonly grnNumber: string;
  readonly businessDate: string;
  readonly siteId: string;
  readonly supplierPartyId: string;
  readonly brandId: string;
  readonly line: GrnLine;
}

/**
 * The receipt problems read model (goods-in 9.3; PRD-REC-006): every GRN line the reader may see with a shortage,
 * extra pieces or damage at the count, newest first, a page of at most RECEIPT_PROBLEMS_PAGE_CAP by a cursor, with its
 * findings, its held part and its decision, and its damage report. Its as-of time is the caller's. Damage reported on
 * a line after the GRN is the damage report's own record (goods-in 8.5).
 */
export async function receiptProblems(
  context: TransactionContext,
  query: ReceiptProblemsQuery,
  requests: Requests,
): Promise<{ readonly rows: readonly ReceiptProblem[]; readonly next: string | null }> {
  const limit = Math.min(query.limit ?? RECEIPT_PROBLEMS_PAGE_CAP, RECEIPT_PROBLEMS_PAGE_CAP);
  // A line with a finding: a shortage or extra pieces, its counted quantity apart from its invoice quantity or its goods
  // not on the invoice at all, or damage at the count (goods-in 4.4).
  const filters: (SQL | undefined)[] = [
    or(
      ne(grnLine.invoiceQuantity, grnLine.countedQuantity),
      ne(grnLine.goods, 'on-invoice'),
      isNotNull(grnLine.damagedQuantity),
    ),
    query.siteId === undefined ? undefined : eq(grn.siteId, query.siteId),
    query.brandId === undefined ? undefined : eq(grn.brandId, query.brandId),
    query.supplierPartyId === undefined ? undefined : eq(arrival.supplierPartyId, query.supplierPartyId),
    query.from === undefined ? undefined : gte(grn.businessDate, query.from),
    query.to === undefined ? undefined : lte(grn.businessDate, query.to),
    query.after === undefined ? undefined : lt(grnLine.id, query.after),
  ];
  const page = await context.tx
    .select({ line: grnLine, grn, supplierPartyId: arrival.supplierPartyId })
    .from(grnLine)
    .innerJoin(grn, eq(grn.id, grnLine.grnId))
    .innerJoin(arrival, eq(arrival.id, grn.arrivalId))
    .where(and(...filters))
    .orderBy(desc(grnLine.id))
    .limit(limit + 1);
  const found = page.slice(0, limit);
  const next = page.length > limit ? (found.at(-1)?.line.id ?? null) : null;
  const views = await grnLineViews(
    context,
    found.map((row) => row.line),
    requests,
  );
  return {
    rows: found.map((row, index) => {
      const line = views[index];
      if (line === undefined) throw new CommandDefect('A receipt problem lost its line');
      return {
        grnId: row.grn.id,
        grnNumber: row.grn.number,
        businessDate: row.grn.businessDate,
        siteId: row.grn.siteId,
        supplierPartyId: row.supplierPartyId,
        brandId: row.grn.brandId,
        line,
      };
    }),
    next,
  };
}
