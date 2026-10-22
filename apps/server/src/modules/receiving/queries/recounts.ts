import type { Recount, RecountRead } from '@apparel-os/schemas';
import { asc, eq, inArray } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import { receiptCountOfLine } from '../../stock/ledger/index.js';
import {
  arrival,
  grn,
  grnLine,
  heldLine,
  recount,
  recountDecision,
  recountLine,
  recountMovement,
} from '../db/schema.js';
import { GRN_SOURCE_TYPE, RECEIVING_MODULE } from '../domain/kinds.js';
import type { LineOrigin } from '../domain/recounts.js';

// The recounts of GRNs as their readers and their commands read them (goods-in 4.7, 4.11; PRD-REC-019; S2-F02-T05):
// each recount with its lines, its decision and its stock effects; each GRN line's count now; and the receipt origins
// of a GRN line's goods with the pieces each still holds. Read under the reader's actor, so row-level security keeps
// out what the reader may not see (code-house-rules 6.2); a command reads them again under the GRN's lock, under which
// every recount of it is proposed and decided (8.2).

export type RecountRow = typeof recount.$inferSelect;
export type RecountLineRow = typeof recountLine.$inferSelect;
export type RecountMovementRow = typeof recountMovement.$inferSelect;

/** A recount with its lines, its decision once made and its stock effects once approved. */
export interface RecountRecord {
  readonly row: RecountRow;
  readonly lines: readonly RecountLineRow[];
  readonly decision: typeof recountDecision.$inferSelect | undefined;
  readonly movements: readonly RecountMovementRow[];
}

/** One recount as the actor may see it, or undefined (code-house-rules 6.2). */
export async function recountRow(context: TransactionContext, recountId: string): Promise<RecountRow | undefined> {
  const [row] = await context.tx.select().from(recount).where(eq(recount.id, recountId));
  return row;
}

/** Every recount of the GRNs given, oldest proposed first, with its lines, decision and stock effects. */
export async function recountsOfGrns(
  context: TransactionContext,
  grnIds: readonly string[],
): Promise<ReadonlyMap<string, readonly RecountRecord[]>> {
  const byGrn = new Map<string, RecountRecord[]>(grnIds.map((id) => [id, []]));
  if (grnIds.length === 0) return byGrn;
  const rows = await context.tx
    .select()
    .from(recount)
    .where(inArray(recount.grnId, [...grnIds]))
    .orderBy(asc(recount.proposedAt), asc(recount.id));
  if (rows.length === 0) return byGrn;
  const ids = rows.map((row) => row.id);
  const lines = await context.tx
    .select()
    .from(recountLine)
    .where(inArray(recountLine.recountId, ids))
    .orderBy(asc(recountLine.id));
  const decisions = await context.tx.select().from(recountDecision).where(inArray(recountDecision.recountId, ids));
  const movements = await context.tx
    .select()
    .from(recountMovement)
    .where(inArray(recountMovement.recountId, ids))
    .orderBy(asc(recountMovement.id));
  for (const row of rows) {
    byGrn.get(row.grnId)?.push({
      row,
      lines: lines.filter((line) => line.recountId === row.id),
      decision: decisions.find((decision) => decision.recountId === row.id),
      movements: movements.filter((each) => each.recountId === row.id),
    });
  }
  return byGrn;
}

/** The recounts of one GRN, oldest proposed first. */
export async function recountsOfGrn(context: TransactionContext, grnId: string): Promise<readonly RecountRecord[]> {
  return (await recountsOfGrns(context, [grnId])).get(grnId) ?? [];
}

/**
 * The version a recount's proposal names (code-house-rules 12.7): the GRN's newest recount, or the GRN itself while it
 * has none.
 */
export function recountVersionOf(grnId: string, records: readonly RecountRecord[]): string {
  return records.at(-1)?.row.id ?? grnId;
}

/** The recount of a GRN still waiting for its decision, if any: one waits at a time (goods-in 4.11). */
export function pendingRecountOf(records: readonly RecountRecord[]): RecountRecord | undefined {
  return records.find((record) => record.decision === undefined);
}

/** Each GRN line's count as its latest approved recount counts it, for the lines any approved recount names. */
export function countsNowOf(records: readonly RecountRecord[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.decision?.outcome !== 'approved') continue;
    for (const line of record.lines) counts.set(line.grnLineId, line.countedAfter);
  }
  return counts;
}

/** Each GRN line's count as its latest approved recount counts it, for the GRN lines given that have one. */
export async function recountedCounts(
  context: TransactionContext,
  grnLineIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  if (grnLineIds.length === 0) return new Map();
  const grnIds = await context.tx
    .selectDistinct({ grnId: grnLine.grnId })
    .from(grnLine)
    .where(inArray(grnLine.id, [...grnLineIds]));
  const records = [
    ...(
      await recountsOfGrns(
        context,
        grnIds.map((row) => row.grnId),
      )
    ).values(),
  ].flat();
  return countsNowOf(records);
}

/**
 * The receipt origins of a GRN line's goods, oldest first, with the receipt count that made each and the pieces it
 * still holds of those received (goods-in 4.11): the GRN's own, holding the pieces the GRN received less those its
 * recounts took back, then each a recount found, holding those less those later recounts took back. The ledger's rows
 * are read under the reader's actor; one the reader may not see is a defect, since whoever recounts sees the goods
 * (stock-ledger 14.3).
 */
export async function originsOfLine(
  context: TransactionContext,
  grnLineId: string,
  receivedAtIssue: number,
  movements: readonly RecountMovementRow[],
): Promise<LineOrigin[]> {
  const ofLine = movements.filter((each) => each.grnLineId === grnLineId);
  const takenBack = (originId: string) =>
    ofLine
      .filter((each) => each.kind === 'reversed' && each.receiptOriginId === originId)
      .reduce((sum, each) => sum + each.quantity, 0);
  const origins: LineOrigin[] = [];
  if (receivedAtIssue > 0) {
    const counted = await receiptCountOfLine(context, {
      module: RECEIVING_MODULE,
      recordType: GRN_SOURCE_TYPE,
      lineId: grnLineId,
    });
    if (counted === undefined) throw new CommandDefect(`GRN line ${grnLineId} has no receipt count`);
    origins.push({
      receiptOriginId: counted.receiptOriginId,
      movementId: counted.movementId,
      pieces: receivedAtIssue - takenBack(counted.receiptOriginId),
    });
  }
  for (const added of ofLine.filter((each) => each.kind === 'added')) {
    origins.push({
      receiptOriginId: added.receiptOriginId,
      movementId: added.movementId,
      pieces: added.quantity - takenBack(added.receiptOriginId),
    });
  }
  return origins;
}

/** The held line of each GRN line given that has one, by GRN line (goods-in 4.6). */
export async function heldLinesOfLines(
  context: TransactionContext,
  grnLineIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (grnLineIds.length === 0) return new Map();
  const rows = await context.tx
    .select({ id: heldLine.id, grnLineId: heldLine.grnLineId })
    .from(heldLine)
    .where(inArray(heldLine.grnLineId, [...grnLineIds]));
  return new Map(rows.map((row) => [row.grnLineId, row.id]));
}

/** A recount's state (design-language 7): Awaiting approval, then Approved or Rejected. */
function stateOf(record: RecountRecord): Recount['state'] {
  if (record.decision === undefined) return 'Awaiting approval';
  return record.decision.outcome === 'approved' ? 'Approved' : 'Rejected';
}

/**
 * A recount as a reader of its Arrival sees it (goods-in 4.11); `lineNumbers` gives each GRN line's number, and
 * `request` its approval's latest request where the reader may see it.
 */
export function recountView(
  record: RecountRecord,
  lineNumbers: ReadonlyMap<string, number>,
  request: { readonly id: string; readonly state: Recount['requestState'] } | undefined,
): Recount {
  return {
    id: record.row.id,
    state: stateOf(record),
    reason: record.row.reason,
    proposedBy: record.row.proposedByUserId,
    proposedAt: record.row.proposedAt.toISOString(),
    lines: record.lines
      .map((line) => {
        const lineNumber = lineNumbers.get(line.grnLineId);
        if (lineNumber === undefined) throw new CommandDefect(`A recount names a line not of its GRN: ${line.id}`);
        return {
          grnLineId: line.grnLineId,
          lineNumber,
          countedBefore: line.countedBefore,
          countedAfter: line.countedAfter,
        };
      })
      .sort((a, b) => a.lineNumber - b.lineNumber),
    requestId: request?.id ?? null,
    requestState: request?.state ?? null,
    decision:
      record.decision === undefined
        ? null
        : {
            outcome: record.decision.outcome,
            decidedBy: record.decision.decidedByUserId,
            decidedAt: record.decision.decidedAt.toISOString(),
          },
  };
}

/** The latest approval request of each recount named, from `access`, where the reader may see it (9.1, 9.6). */
export type RecountRequests = (
  recountIds: readonly string[],
) => Promise<ReadonlyMap<string, { readonly id: string; readonly state: Recount['requestState'] }>>;

/** The recounts of a GRN as a reader of its Arrival sees them, oldest first (goods-in 4.11). */
export async function recountViewsOf(
  context: TransactionContext,
  grnId: string,
  lineNumbers: ReadonlyMap<string, number>,
  requests: RecountRequests,
): Promise<{ readonly recounts: Recount[]; readonly versionToken: string }> {
  const records = await recountsOfGrn(context, grnId);
  const latest = await requests(records.map((record) => record.row.id));
  return {
    recounts: records.map((record) => recountView(record, lineNumbers, latest.get(record.row.id))),
    versionToken: recountVersionOf(grnId, records),
  };
}

/** The facts of a recount the reader may see, which its read authorises with (5.3); else undefined. */
export async function recountFacts(context: TransactionContext, recountId: string) {
  const row = await recountRow(context, recountId);
  if (row === undefined) return undefined;
  const { storeId, siteId, businessUnitId, legalEntityId, brandId } = row;
  return storeId === null
    ? { siteId, businessUnitId, legalEntityId, brandId }
    : { siteId, storeId, businessUnitId, legalEntityId, brandId };
}

/**
 * A recount with the GRN and the Arrival it belongs to, for its approval's panel (goods-in 4.11, section 11): `lines`
 * gives the GRN lines it names as their readers see them. Undefined when the reader may not see it.
 */
export async function recountPanelOf(
  context: TransactionContext,
  recountId: string,
  requests: RecountRequests,
  lines: (grnId: string, grnLineIds: readonly string[]) => Promise<RecountRead['lines']>,
): Promise<Omit<RecountRead, 'asOf' | 'people'> | undefined> {
  const row = await recountRow(context, recountId);
  if (row === undefined) return undefined;
  const [found] = await context.tx
    .select({ grn, arrival })
    .from(grn)
    .innerJoin(arrival, eq(arrival.id, grn.arrivalId))
    .where(eq(grn.id, row.grnId));
  if (found === undefined) return undefined;
  const record = (await recountsOfGrn(context, row.grnId)).find((each) => each.row.id === recountId);
  if (record === undefined) throw new CommandDefect(`Recount ${recountId} is not among its GRN's`);
  const named = await lines(
    row.grnId,
    record.lines.map((line) => line.grnLineId),
  );
  const latest = await requests([recountId]);
  return {
    arrivalId: found.arrival.id,
    grnId: found.grn.id,
    grnNumber: found.grn.number,
    supplierPartyId: found.arrival.supplierPartyId,
    brandId: found.arrival.brandId,
    businessUnitId: found.arrival.businessUnitId,
    recount: recountView(record, new Map(named.map((line) => [line.id, line.lineNumber])), latest.get(recountId)),
    lines: named,
  };
}
