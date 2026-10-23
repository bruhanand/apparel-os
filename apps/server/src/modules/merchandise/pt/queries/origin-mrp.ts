import { paise, type Paise } from '@apparel-os/domain';
import { sql } from 'drizzle-orm';
import { declareReadModel, serveReadModel, type TransactionContext } from '../../../../kernel/index.js';

// The MRP of a piece of the goods a PT established, by the receipt origin its approval made (goods-in 6.6, 9.1, 9.3,
// 9.5; module-map section 3 rule 5; S2-F11-T02), served through the kernel's read-model gateway for the stock report's
// MRP value. MRP is no restricted field class (goods-in 9.1), but it is the PT's: read in the reader's transaction under
// the reader's own actor, so row-level security answers it only from a PT the reader may see (code-house-rules 6.2;
// DEC-117; PRD-SEC-005; code review 8 of stage 2). For each origin given that a PT's approval made (`pt_origin`), the
// one MRP its PT's rows of that coverage give its SKU, a SKU set up before or one the approval confirmed
// (`pt_product`); an origin whose rows the reader may not see, whose rows give no MRP or more than one, or whose PT's
// approval a reversal undid (`pt_reversal`, goods-in 6.4, 6.7), is not answered, so its MRP is Unknown (PRD-MOD-015).

export interface OriginMrp {
  readonly receiptOriginId: string;
  readonly mrp: Paise;
}

export async function originMrp(
  context: TransactionContext,
  receiptOriginIds: readonly string[],
): Promise<readonly OriginMrp[]> {
  if (receiptOriginIds.length === 0) return [];
  // Every table read here is scoped under `merchandise.pt`, so the reader's actor decides each row (6.2).
  const rows = await context.tx.execute<{ receipt_origin_id: string; mrp_paise: string }>(sql`
    select o.receipt_origin_id::text as receipt_origin_id, min(r.mrp_paise)::text as mrp_paise
    from merchandise.pt_origin o
    join merchandise.pt_row r on r.pt_coverage_id = o.pt_coverage_id
    left join merchandise.pt_product p
      on p.pt_approval_id = o.pt_approval_id and p.pt_proposed_sku_id = r.pt_proposed_sku_id
    where o.receipt_origin_id = any (${sql.param([...new Set(receiptOriginIds)])}::uuid[])
      and coalesce(r.sku_id, p.sku_id) = o.sku_id
      and not exists (select 1
                        from merchandise.pt_reversal v
                        join merchandise.pt_reversal_decision d on d.pt_reversal_id = v.id
                       where v.pt_approval_id = o.pt_approval_id and d.outcome = 'Approved')
    group by o.receipt_origin_id
    having count(distinct r.mrp_paise) = 1
    order by o.receipt_origin_id`);
  return rows.rows.map((row) => ({ receiptOriginId: row.receipt_origin_id, mrp: paise(Number(row.mrp_paise)) }));
}

/** The read model of origins' MRP, declared for the read-model gateway (module-map section 3, rule 5). */
export const PT_ORIGIN_MRP = declareReadModel<readonly string[], readonly OriginMrp[]>('merchandise.origin-mrp');

/** `merchandise` · PT's read models as it serves them, handed to the gateway by the composition root. */
export const ptReadModels = [serveReadModel(PT_ORIGIN_MRP, originMrp)];
