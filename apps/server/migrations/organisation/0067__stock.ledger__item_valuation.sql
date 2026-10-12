-- One valuation for an item under moving average (stock-ledger 7.3, 7.5, 13.10, 14.2; PRD-LED-014, PRD-MOD-014;
-- S1-F10-T04). Under moving average the pool's value is one blend, so an outflow, a transfer leg or a customer return
-- of units of several receipt origins is one valuation of the item: its value is the formula's, and the movement's
-- legs name each origin's units. Splitting that value between origins would need a rounding rule (SL-2), which 7.3
-- does not ask for. Such a valuation names no origin. Every other valuation names its one origin: every FIFO one, and
-- every cost established, cost adjustment or reversal. So each valuation records the formula it was worked out under,
-- its pool's or its transit value's, and a transit value records its book's formula when it is made, which never
-- changes, as a pool's never does (7.12). Runs as aos_migration (code-house-rules 5.1). Compatible with the version
-- running: that version writes no valuation and no transit value (part 2 of the ledger is not deployed), and every
-- existing row, if any, gets its formula below (code-house-rules 4.2).

alter table stock.transit_value add column formula text;
update stock.transit_value t set formula = coalesce(
  (select p.formula from stock.cost_pool p where p.book_id = t.book_id order by p.recorded_at desc limit 1),
  'moving-average');
alter table stock.transit_value alter column formula set not null;
alter table stock.transit_value add constraint transit_value_formula check (formula in ('moving-average', 'fifo'));
alter table stock.transit_value add constraint transit_value_formula_key unique (id, formula);

-- A transit value's formula never changes (7.8, 7.12).
create function stock.keep_transit_formula() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if new.formula is distinct from old.formula then
    raise exception 'a transit value keeps its formula' using errcode = 'AO004';
  end if;
  return new;
end;
$$;
revoke execute on function stock.keep_transit_formula() from public;
create trigger keep_formula before update on stock.transit_value
  for each row execute function stock.keep_transit_formula();

alter table stock.valuation add column formula text;
update stock.valuation v set formula = coalesce(
  (select p.formula from stock.cost_pool p where p.id = v.cost_pool_id),
  (select t.formula from stock.transit_value t where t.id = v.transit_value_id));
alter table stock.valuation alter column formula set not null;
alter table stock.valuation add constraint valuation_formula check (formula in ('moving-average', 'fifo'));
alter table stock.valuation add constraint valuation_pool_formula
  foreign key (cost_pool_id, formula) references stock.cost_pool (id, formula);
alter table stock.valuation add constraint valuation_transit_formula
  foreign key (transit_value_id, formula) references stock.transit_value (id, formula);
create index valuation_pool_formula on stock.valuation (cost_pool_id, formula);
create index valuation_transit_formula on stock.valuation (transit_value_id, formula);

alter table stock.valuation alter column receipt_origin_id drop not null;
-- No origin only under moving average, and only for the kinds that move a moving-average item's value as a whole
-- (13.10): outflows, transfer legs onto and off a transit value, a customer return and a count loss reversed.
alter table stock.valuation add constraint valuation_origin_named
  check (receipt_origin_id is not null or (formula = 'moving-average' and event_kind in (
    'stock.sale-issue', 'stock.disposal-loss', 'stock.count-loss', 'stock.pool-dispatch',
    'stock.supplier-return-departure', 'stock.pool-arrival', 'stock.supplier-rejection-return',
    'stock.supplier-handover', 'stock.customer-return', 'stock.count-loss-reversal')));
