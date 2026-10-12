-- The write rule of the cost pool rows (stock-ledger 14.3 "Pool admission"; code-house-rules 6.2; S1-F10-T07).
-- Runs as aos_migration (code-house-rules 5.1). Compatible with the version running: the policies only admit more,
-- and only inside a transaction whose ledger request names the pool (code-house-rules 4.2).
--
-- A pool row carries no Store or unit, and a whole-book pool no Site (SL-25 (c), (e)), so a seller scoped to one
-- Store, or to one unit, cannot read the pool its sale takes value from, and a command cannot write a row its actor
-- could not read (code-house-rules 6.2). A sale is authorised at the seller's own place; the pool is a consequence of
-- the book's cost setting, not a place the seller acts on. So the ledger, at Lock (10.3 step 6), names for the rest of
-- its transaction, in `aos.admitted_pools`, each pool its request's items reach, as `<book>:<sku>:<site or ->`, after
-- steps 2 to 5 have locked every row of the items' own places, which row-level security admits only within the
-- actor's scope. The policies of the pool rows admit those pools' rows beside the rows a grant covers. Nothing else
-- sets it; it ends with the transaction. What the actor reads afterwards is unchanged: the pool rows stay hidden
-- outside its scope (SL-25), and cost and value still need the cost field permission (access-and-approvals 6).

-- Whether the transaction names the pool of this book, SKU and Site (none for a whole-book pool).
create function stock.pool_admitted(book_id uuid, sku_id uuid, site_id uuid) returns boolean
  language sql
  stable
  security invoker
  set search_path = pg_catalog
as $$
  select pg_catalog.strpos(
    ',' || coalesce(pg_catalog.current_setting('aos.admitted_pools', true), '') || ',',
    ',' || pool_admitted.book_id::text || ':' || pool_admitted.sku_id::text || ':'
      || coalesce(pool_admitted.site_id::text, '-') || ',') > 0
$$;
revoke execute on function stock.pool_admitted(uuid, uuid, uuid) from public;
grant execute on function stock.pool_admitted(uuid, uuid, uuid) to aos_runtime;

-- Whether the pool of a layer or a valuation row, named by its pool or by its layer, is one the transaction names.
-- It reads the pool's book, SKU and Site, which the actor may not see, and answers only true or false (code-house-
-- rules 6.2: a narrowly authorised internal function, owned by the migration role, executable only by the runtime
-- role). With no pool named it answers false at once.
create function stock.pool_row_admitted(cost_pool_id uuid, cost_layer_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select case
    when coalesce(pg_catalog.current_setting('aos.admitted_pools', true), '') = '' then false
    else exists (
      select 1 from stock.cost_pool p
      where p.id = coalesce(pool_row_admitted.cost_pool_id,
          (select l.cost_pool_id from stock.cost_layer l where l.id = pool_row_admitted.cost_layer_id))
        and stock.pool_admitted(p.book_id, p.sku_id, p.site_id))
  end
$$;
revoke execute on function stock.pool_row_admitted(uuid, uuid) from public;
grant execute on function stock.pool_row_admitted(uuid, uuid) to aos_runtime;

drop policy row_scope on stock.cost_pool;
create policy row_scope on stock.cost_pool for all to aos_runtime
  using (access.row_visible('stock.cost_pool', site_id, null, null, legal_entity_id, brand_id, null)
    or stock.pool_admitted(book_id, sku_id, site_id))
  with check (access.row_visible('stock.cost_pool', site_id, null, null, legal_entity_id, brand_id, null)
    or stock.pool_admitted(book_id, sku_id, site_id));

drop policy row_scope on stock.cost_layer;
create policy row_scope on stock.cost_layer for all to aos_runtime
  using (access.row_visible('stock.cost_pool', site_id, null, null, legal_entity_id, brand_id, null)
    or stock.pool_row_admitted(cost_pool_id, null))
  with check (access.row_visible('stock.cost_pool', site_id, null, null, legal_entity_id, brand_id, null)
    or stock.pool_row_admitted(cost_pool_id, null));

drop policy row_scope on stock.valuation;
create policy row_scope on stock.valuation for all to aos_runtime
  using (access.row_visible('stock.valuation', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null)
    or (cost_pool_id is not null and stock.pool_row_admitted(cost_pool_id, null)))
  with check (access.row_visible('stock.valuation', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null)
    or (cost_pool_id is not null and stock.pool_row_admitted(cost_pool_id, null)));

drop policy row_scope on stock.valuation_layer;
create policy row_scope on stock.valuation_layer for all to aos_runtime
  using (access.row_visible('stock.valuation', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null)
    or stock.pool_row_admitted(null, cost_layer_id))
  with check (access.row_visible('stock.valuation', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null)
    or stock.pool_row_admitted(null, cost_layer_id));
