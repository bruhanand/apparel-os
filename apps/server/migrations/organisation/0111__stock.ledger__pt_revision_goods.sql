-- The goods a PT revision covers, for `receiving`'s scan-in (goods-in 7.2, 7.3, 7.5; stock-ledger 13.20; S2-F07-T01).
-- Once a GRN's PT is approved its pieces are scanned in; the inbox and the scan-in's screen say how many of each
-- product wait at the receiving location, are accepted or are held. Whoever reads an Arrival may not see the stock
-- rows themselves, which are scoped by the stock record types (stock-ledger 14.3), so the scan-in would otherwise read
-- as complete, or as not started, by what the reader may see. Runs as aos_migration, which owns the function and the
-- tables it reads (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2).

-- The narrowly authorised read (code-house-rules 6.2; DEC-117): for each receipt origin a revision given covers, the
-- revision, the origin, its SKU and its covered quantity; and each of its balances in custody, with its location,
-- condition, quantity, accepted quantity and the units the holds outside reservations claim there; an origin with no
-- balance in custody once, with none. Counts and identifiers only: never a cost, a value, an owner or who did what.
create function stock.pt_revision_goods(pt_revision_ids uuid[])
  returns table (
    pt_revision_id uuid,
    receipt_origin_id uuid,
    sku_id uuid,
    covered integer,
    location_id uuid,
    condition text,
    quantity integer,
    accepted integer,
    held integer
  )
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select s.pt_revision_id, s.receipt_origin_id, o.sku_id, s.covered_quantity,
         b.location_id, b.condition, coalesce(b.quantity, 0), coalesce(b.accepted_quantity, 0),
         coalesce((select sum(c.quantity)
                     from stock.hold_claim c
                     join stock.hold h on h.id = c.hold_id
                    where c.balance_id = b.id and h.within_reservation_id is null), 0)::integer
  from stock.receipt_origin_state s
  join stock.receipt_origin o on o.id = s.receipt_origin_id
  left join stock.balance b
    on b.receipt_origin_id = s.receipt_origin_id and b.held_as = 'custody' and b.quantity > 0
  where s.pt_revision_id = any (pt_revision_goods.pt_revision_ids) and s.covered_quantity > 0
  order by s.receipt_origin_id, b.id
$$;
revoke execute on function stock.pt_revision_goods(uuid[]) from public;
grant execute on function stock.pt_revision_goods(uuid[]) to aos_runtime;

-- An origin is found by the revision covering it (code-house-rules 3.3).
create index receipt_origin_state_pt_revision on stock.receipt_origin_state (pt_revision_id);
