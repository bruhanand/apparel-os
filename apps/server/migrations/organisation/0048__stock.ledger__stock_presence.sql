-- "At which Sites is stock of these SKUs recorded?" (structure-and-masters 4.4, 4.6; module-map section 3, rule 6;
-- stock-ledger 13.7; S1-F03-T02). `merchandise` defines the stock-presence contract and asks it before a SKU's stock
-- unit changes (GC2-5) and before a tracking profile becomes piece-tracked (PRD-MER-018); `stock` · ledger answers it
-- from its own rows through this one narrowly authorised function, which reads them whatever the asker's scope and
-- returns only Site identifiers, since a refusal must not depend on what the asker may see (code-house-rules 5.2; as
-- stock.location_has_stock, 0030). Stock of a SKU is recorded at a Site while a balance of it there holds units, in any
-- condition and however held, in transit from the Site included. SECURITY DEFINER, owned by the migration role, with
-- a fixed search path, executable only by the runtime role. It only adds (code-house-rules 4.2).
create function stock.sites_holding_stock(sku_ids uuid[]) returns setof uuid
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select distinct b.site_id from stock.balance b
  where b.sku_id = any (sites_holding_stock.sku_ids) and b.quantity > 0
  order by b.site_id
$$;
revoke execute on function stock.sites_holding_stock(uuid[]) from public;
grant execute on function stock.sites_holding_stock(uuid[]) to aos_runtime;
