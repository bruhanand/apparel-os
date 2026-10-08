import { and, asc, eq, gt, type SQL } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import { balance, movement, movementPiece, piece } from '../db/schema.js';

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
