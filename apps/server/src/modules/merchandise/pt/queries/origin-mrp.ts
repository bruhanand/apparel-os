import { paise, type Paise } from '@apparel-os/domain';
import { sql } from 'drizzle-orm';
import { declareReadModel, serveReadModel, type TransactionContext } from '../../../../kernel/index.js';

// The MRP of a piece of the goods a PT established, by the receipt origin its approval made (goods-in 6.6, 9.1, 9.3,
// 9.5; module-map section 3 rule 5; S2-F11-T02), served through the kernel's read-model gateway for the stock report's
// MRP value. MRP needs no permission (goods-in 9.1), and whoever reads the stock may not see the PT, so it is read
// through the narrowly authorised `merchandise.pt_mrp_of_origins` (migration `merchandise.pt__mrp_of_origins`;
// code-house-rules 6.2; DEC-117), which answers the MRP only. An origin no PT's approval made, or whose rows give its
// SKU no single MRP, is not answered, so its MRP is Unknown (PRD-MOD-015).

export interface OriginMrp {
  readonly receiptOriginId: string;
  readonly mrp: Paise;
}

export async function originMrp(
  context: TransactionContext,
  receiptOriginIds: readonly string[],
): Promise<readonly OriginMrp[]> {
  if (receiptOriginIds.length === 0) return [];
  const rows = await context.tx.execute<{ receipt_origin_id: string; mrp_paise: string }>(
    sql`select receipt_origin_id::text as receipt_origin_id, mrp_paise::text as mrp_paise
        from merchandise.pt_mrp_of_origins(${sql.param([...new Set(receiptOriginIds)])}::uuid[])`,
  );
  return rows.rows.map((row) => ({ receiptOriginId: row.receipt_origin_id, mrp: paise(Number(row.mrp_paise)) }));
}

/** The read model of origins' MRP, declared for the read-model gateway (module-map section 3, rule 5). */
export const PT_ORIGIN_MRP = declareReadModel<readonly string[], readonly OriginMrp[]>('merchandise.origin-mrp');

/** `merchandise` · PT's read models as it serves them, handed to the gateway by the composition root. */
export const ptReadModels = [serveReadModel(PT_ORIGIN_MRP, originMrp)];
