import { and, asc, eq, gt, inArray, isNull, type SQL } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import { balance, coverage, movement, movementPiece, piece, receiptOrigin } from '../db/schema.js';

// The ledger's reads (stock-ledger 13.6; S1-F10-T02): Custody, Piece, Availability, and Rebuild and compare over the
// quantity projections (2.1). They take no lock and run in the reader's transaction, under the reader's actor, so
// row-level security filters what each reader sees (PRD-SEC-005; 14.3). Each answers the time it was read. Reads as of
// an earlier time, Coverage and acceptance, Sellable, Ownership, Value and Inventory reconciliation arrive with the
// features that use them (S1-F10-T03 and later).

/** Custody at one balance key (13.6; PRD-STK-001, PRD-STK-002, PRD-STK-004). */
export interface CustodyRow {
  readonly siteId: string;
  readonly businessUnitId: string;
  readonly locationId: string | null;
  readonly condition: string;
  readonly heldAs: string;
  readonly skuId: string | null;
  readonly receiptOriginId: string;
  readonly batchCode: string | null;
  readonly expiryDate: string | null;
  readonly quantity: number;
  readonly acceptedQuantity: number;
}

export interface CustodyQuery {
  readonly siteId?: string;
  readonly businessUnitId?: string;
  readonly skuId?: string;
  readonly locationId?: string;
}

/** Custody (13.6): quantity by place, location, condition, how held, SKU and receipt origin, now. */
export async function custody(
  context: TransactionContext,
  query: CustodyQuery,
): Promise<{ readonly asOf: string; readonly rows: CustodyRow[] }> {
  const filters: SQL[] = [gt(balance.quantity, 0)];
  if (query.siteId !== undefined) filters.push(eq(balance.siteId, query.siteId));
  if (query.businessUnitId !== undefined) filters.push(eq(balance.businessUnitId, query.businessUnitId));
  if (query.skuId !== undefined) filters.push(eq(balance.skuId, query.skuId));
  if (query.locationId !== undefined) filters.push(eq(balance.locationId, query.locationId));
  const rows = await context.tx
    .select({
      siteId: balance.siteId,
      businessUnitId: balance.businessUnitId,
      locationId: balance.locationId,
      condition: balance.condition,
      heldAs: balance.heldAs,
      skuId: balance.skuId,
      receiptOriginId: balance.receiptOriginId,
      batchCode: balance.batchCode,
      expiryDate: balance.expiryDate,
      quantity: balance.quantity,
      acceptedQuantity: balance.acceptedQuantity,
    })
    .from(balance)
    .where(and(...filters))
    .orderBy(asc(balance.countDate), asc(balance.id));
  return { asOf: context.startedAt.toISOString(), rows };
}

/** Piece (13.6; PRD-MER-003): where a piece is, how held, its origin, coverage and acceptance, and its movements. */
export async function pieceByCode(context: TransactionContext, code: string) {
  const [row] = await context.tx.select().from(piece).where(eq(piece.code, code));
  if (row === undefined) return undefined;
  const movements = await context.tx
    .select({ id: movement.id, kind: movement.kind, recordedAt: movement.recordedAt })
    .from(movementPiece)
    .innerJoin(movement, eq(movement.id, movementPiece.movementId))
    .where(eq(movementPiece.pieceId, row.id))
    .orderBy(asc(movement.recordedAt), asc(movement.id));
  return {
    asOf: context.startedAt.toISOString(),
    id: row.id,
    code: row.code,
    skuId: row.skuId,
    receiptOriginId: row.receiptOriginId,
    siteId: row.siteId,
    businessUnitId: row.businessUnitId,
    locationId: row.locationId,
    condition: row.condition,
    heldAs: row.heldAs,
    inCustody: row.inCustody,
    ptRevisionId: row.ptRevisionId,
    acceptedSiteId: row.acceptedSiteId,
    movements: movements.map((each) => ({ id: each.id, kind: each.kind })),
  };
}

/** The receipt origin a source line made, as a document that names the line reads it (13.6; 13.15). */
export interface SourceLineOrigin {
  readonly receiptOriginId: string;
  /** The SKU, or null while the goods' product is not set up (Unknown; 13.14). */
  readonly skuId: string | null;
  /** The SKU's brand, or for goods of Unknown SKU the brand they were counted under (14.1; RR-555). */
  readonly brandId: string;
}

/**
 * The receipt origin a source's line made, such as a GRN line's receipt count (4; 13.6), so a damage report names the
 * goods of a GRN line, of a product not yet set up too, by their origin (13.15; goods-in 8.2; S2-F08-T01). Read under
 * the reader's actor; undefined when the line made none the reader may see. A split or an identity step keeps the
 * original origin as it was (13.14), which is the one answered.
 */
export async function originOfSourceLine(
  context: TransactionContext,
  source: { readonly module: string; readonly recordType: string; readonly lineId: string },
): Promise<SourceLineOrigin | undefined> {
  const [row] = await context.tx
    .select({ id: receiptOrigin.id, skuId: receiptOrigin.skuId, brandId: receiptOrigin.brandId })
    .from(receiptOrigin)
    .where(
      and(
        eq(receiptOrigin.sourceModule, source.module),
        eq(receiptOrigin.sourceRecordType, source.recordType),
        eq(receiptOrigin.sourceLineId, source.lineId),
        isNull(receiptOrigin.parentOriginId),
      ),
    );
  if (row?.brandId == null) return undefined;
  return { receiptOriginId: row.id, skuId: row.skuId, brandId: row.brandId };
}

/**
 * The receipt count a source's line made, with the origin it made (13.4, 13.6; 13.18; goods-in 4.11; S2-F02-T05): the
 * movement a recount reverses pieces of. Read under the reader's actor; undefined when the line made none the reader
 * may see.
 */
export async function receiptCountOfLine(
  context: TransactionContext,
  source: { readonly module: string; readonly recordType: string; readonly lineId: string },
): Promise<(SourceLineOrigin & { readonly movementId: string }) | undefined> {
  const origin = await originOfSourceLine(context, source);
  if (origin === undefined) return undefined;
  const [row] = await context.tx
    .select({ id: movement.id })
    .from(movement)
    .where(
      and(
        eq(movement.kind, 'receipt-count'),
        eq(movement.sourceModule, source.module),
        eq(movement.sourceRecordType, source.recordType),
        eq(movement.sourceLineId, source.lineId),
      ),
    );
  return row === undefined ? undefined : { ...origin, movementId: row.id };
}

/** The source whose line made a receipt origin: its module and record type (13.2, 13.6). */
export interface LineSource {
  readonly module: string;
  readonly recordType: string;
}

/**
 * The source a line belongs to, as the receipt origin it made names it (13.6; 13.15; goods-in 8.5): so a route that
 * names goods by a line alone, such as a damage report's GRN line, passes on whose line it is as a calling module
 * would, and `originOfSourceLine` reads its origin. Read under the reader's actor; undefined when the line made no
 * origin the reader may see.
 */
export async function sourceOfLine(context: TransactionContext, lineId: string): Promise<LineSource | undefined> {
  const [row] = await context.tx
    .select({ module: receiptOrigin.sourceModule, recordType: receiptOrigin.sourceRecordType })
    .from(receiptOrigin)
    .where(and(eq(receiptOrigin.sourceLineId, lineId), isNull(receiptOrigin.parentOriginId)));
  return row;
}

/** What a source's lines recorded of coverage and cost and still stands (13.6; 13.21), each by the line it names. */
export interface SourceCoverageAndCost {
  /** Each coverage record a line made that no later record removed, with its origin and units. */
  readonly coverage: readonly {
    readonly coverageId: string;
    readonly lineId: string;
    readonly receiptOriginId: string;
    readonly quantity: number;
  }[];
  /** Each cost established a line made that no reversal undid. */
  readonly costEstablished: readonly { readonly movementId: string; readonly lineId: string }[];
}

/**
 * The coverage and the costs established a source's lines recorded and that still stand (13.5, 13.6; 13.21; goods-in
 * 6.7; S2-F09-T01), such as a PT revision's approval: what its reversal removes and reverses, each by its own
 * identifier. Read under the reader's actor, so what they may not see is left out; the ledger's own checks under its
 * locks decide the rest (13.1).
 */
export async function coverageAndCostOfSource(
  context: TransactionContext,
  source: { readonly module: string; readonly recordType: string; readonly recordId: string },
): Promise<SourceCoverageAndCost> {
  const covers = await context.tx
    .select({
      id: coverage.id,
      lineId: coverage.sourceLineId,
      receiptOriginId: coverage.receiptOriginId,
      quantity: coverage.quantity,
    })
    .from(coverage)
    .where(
      and(
        eq(coverage.sourceModule, source.module),
        eq(coverage.sourceRecordType, source.recordType),
        eq(coverage.sourceRecordId, source.recordId),
        eq(coverage.action, 'cover'),
      ),
    )
    .orderBy(asc(coverage.sourceLineId), asc(coverage.id));
  const removed =
    covers.length === 0
      ? []
      : await context.tx
          .select({ id: coverage.removesCoverageId })
          .from(coverage)
          .where(
            and(
              eq(coverage.action, 'remove'),
              inArray(
                coverage.removesCoverageId,
                covers.map((row) => row.id),
              ),
            ),
          );
  const gone = new Set(removed.map((row) => row.id));
  const costs = await context.tx
    .select({ id: movement.id, lineId: movement.sourceLineId })
    .from(movement)
    .where(
      and(
        eq(movement.sourceModule, source.module),
        eq(movement.sourceRecordType, source.recordType),
        eq(movement.sourceRecordId, source.recordId),
        eq(movement.kind, 'cost-established'),
      ),
    )
    .orderBy(asc(movement.sourceLineId), asc(movement.id));
  const reversals =
    costs.length === 0
      ? []
      : await context.tx
          .select({ id: movement.reversesMovementId })
          .from(movement)
          .where(
            inArray(
              movement.reversesMovementId,
              costs.map((row) => row.id),
            ),
          );
  const undone = new Set(reversals.map((row) => row.id));
  return {
    coverage: covers
      .filter((row) => !gone.has(row.id))
      .map((row) => ({
        coverageId: row.id,
        lineId: row.lineId,
        receiptOriginId: row.receiptOriginId,
        quantity: row.quantity,
      })),
    costEstablished: costs
      .filter((row) => !undone.has(row.id))
      .map((row) => ({ movementId: row.id, lineId: row.lineId })),
  };
}
