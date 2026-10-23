-- The MRP of the goods a PT established, for `reports`' stock report (goods-in 9.1, 9.3, 9.5; S2-F11-T02). The stock
-- report shows the MRP value of stock to whoever may see the stock, since MRP needs no permission (goods-in 9.1); the
-- MRP is the PT's, and whoever reads the stock may not see the PT itself, whose rows belong to `merchandise.pt`'s
-- record type, so it would otherwise read as Unknown. Runs as aos_migration, which owns the function and the tables it
-- reads (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2).

-- The narrowly authorised read (code-house-rules 6.2; DEC-117): for each receipt origin given that a PT's approval made
-- (`pt_origin`, goods-in 6.6), the MRP of a piece, the one MRP its PT's rows of that coverage give its SKU, a SKU set up
-- before or one the approval confirmed (`pt_product`); an origin whose rows give no MRP, or more than one, or whose
-- PT's approval a reversal undid (`pt_reversal`, goods-in 6.4, 6.7), is not answered, so its MRP is Unknown
-- (PRD-MOD-015). MRP only: never a cost, a margin or who did what.
create function merchandise.pt_mrp_of_origins(receipt_origin_ids uuid[])
  returns table (receipt_origin_id uuid, mrp_paise bigint)
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select o.receipt_origin_id, min(r.mrp_paise)
  from merchandise.pt_origin o
  join merchandise.pt_row r on r.pt_coverage_id = o.pt_coverage_id
  left join merchandise.pt_product p
    on p.pt_approval_id = o.pt_approval_id and p.pt_proposed_sku_id = r.pt_proposed_sku_id
  where o.receipt_origin_id = any (pt_mrp_of_origins.receipt_origin_ids)
    and coalesce(r.sku_id, p.sku_id) = o.sku_id
    and not exists (select 1
                      from merchandise.pt_reversal v
                      join merchandise.pt_reversal_decision d on d.pt_reversal_id = v.id
                     where v.pt_approval_id = o.pt_approval_id and d.outcome = 'Approved')
  group by o.receipt_origin_id
  having count(distinct r.mrp_paise) = 1
  order by o.receipt_origin_id
$$;
revoke execute on function merchandise.pt_mrp_of_origins(uuid[]) from public;
grant execute on function merchandise.pt_mrp_of_origins(uuid[]) to aos_runtime;

-- A PT's origin is found by the receipt origin it made (code-house-rules 3.3).
create index pt_origin_receipt_origin on merchandise.pt_origin (receipt_origin_id);
