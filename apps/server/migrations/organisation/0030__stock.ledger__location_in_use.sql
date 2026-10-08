-- "Is stock still recorded at this location?" (structure-and-masters 3.5; module-map section 3, rule 6;
-- stock-ledger 13.7; S1-F02-T02). `organisation` defines the location-in-use contract and asks it before a location is
-- retired; `stock` · ledger answers it from its own rows through this one narrowly authorised function, which reads
-- them whatever the asker's scope and returns only yes or no, since a refusal to retire must not depend on what the
-- asker may see (code-house-rules 5.2; as stock.book_has_held_stock, 0026). Stock is recorded at a location while a
-- balance there holds units, in any condition and held in custody or billed and retained. SECURITY DEFINER, owned by
-- the migration role, with a fixed search path, executable only by the runtime role. It only adds (code-house-rules
-- 4.2).
create function stock.location_has_stock(location_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from stock.balance b where b.location_id = location_has_stock.location_id and b.quantity > 0)
$$;
revoke execute on function stock.location_has_stock(uuid) from public;
grant execute on function stock.location_has_stock(uuid) to aos_runtime;
